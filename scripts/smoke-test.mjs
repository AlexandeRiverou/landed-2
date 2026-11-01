// Smoke test for the built game: serves dist/ (with no network access), boots it in headless
// Chromium, then fast-forwards the simulation through objectives, persuasion, world mutations
// and a boss fight. Fails on any page error or console error.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const dist = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' };

const server = createServer(async (req, res) => {
  let path = normalize(join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (path.endsWith('/')) path = join(path, 'index.html');
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // External requests are blocked on purpose (see below); only local failures count.
    if (m.text().startsWith('Failed to load resource') && !(m.location().url || '').startsWith(origin)) return;
    errors.push(`console: ${m.text()}`);
  });
  // The release must not depend on the network (the web font is optional and has a fallback).
  await page.route('**/*', (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));

  await page.goto(origin + '/');
  await page.waitForFunction(() => window.G && window.G.terrain.chunks.size > 20, null, { timeout: 30000 });
  // Secrets, part 1 (the rest is at the end): click the title 7 times before take-off. Six isn't enough.
  const secretsReport = {};
  await page.evaluate(() => window.G.secrets.reset()); // a clean slate, whatever today's date found at boot
  // Real click events, sent in-page: Playwright's own clicks can stall for seconds while the terrain builds, and the
  // clicks have to come within 1.5 s of each other.
  const clickLogo = (n) => page.evaluate((n) => { for (let i = 0; i < n; i++) document.getElementById('logo').click(); }, n);
  await clickLogo(6);
  secretsReport.sixClicks = await page.evaluate(() => window.G.secrets.found.has('tinkerer'));
  await clickLogo(1);
  secretsReport.title = await page.evaluate(() => ({
    found: window.G.secrets.found.has('tinkerer'), rolled: document.getElementById('logo').classList.contains('roll'),
    toast: document.getElementById('secret-toast').classList.contains('show') && document.getElementById('secret-toast').textContent,
    count: document.getElementById('secrets-count').textContent,
  }));
  await page.click('#start');
  await page.evaluate(async () => {
    window.POWERUPS_FOR_TEST = (await import('./src/powerups.js')).POWERUPS;
    window.OBJ_FOR_TEST = await import('./src/objectives.js');
    window.BOSSES_FOR_TEST = (await import('./src/enemies.js')).BOSSES;
    window.QUESTS_FOR_TEST = await import('./src/quests.js');
    window.WORLD_FOR_TEST = await import('./src/world.js');
  });

  const report = await page.evaluate(async () => {
    const G = window.G;
    const step = (n) => { for (let i = 0; i < n; i++) { G.player.invuln = 99; G.step(1 / 30); } };
    const out = {};
    step(150);
    out.firstObjective = G.objectives.current?.type;
    out.musicPlaying = !!G.audio.music && G.audio.music.chordIndex > 0;
    out.engineGain = G.audio.engGain ? G.audio.engGain.gain.value : 0;

    // Ignore the objective until persuasion gives up and awards the participation trophy.
    let stages = 0;
    for (let k = 0; k < 40 && G.objectives.completed === 0; k++) { G.persuasion.neglect = 1e4; step(2); stages = Math.max(stages, G.persuasion.stage); }
    out.persuasionStages = stages;
    out.completedAfterTrophy = G.objectives.completed;

    // Every objective type once, run for a bit, then completed normally (each triggers world mutations).
    // Stay in the first zone: space zones don't offer the ground objectives.
    const { OBJECTIVE_TYPES: types, BOSS_GAP } = window.OBJ_FOR_TEST;
    out.objectiveTypes = types.length;
    for (const t of types) {
      step(60);
      if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
      G.objectives.completed = 1;
      G.zones.sinceZone = 0;
      G.objectives.recent = types.filter((x) => x !== t);
      G.objectives.next();
      if (G.objectives.current.type !== t) throw new Error(`expected objective ${t}, got ${G.objectives.current.type}`);
      step(90);
      G.objectives.complete(false);
    }
    step(150);

    // Quests finished through play (stunts, or the plane moved onto each target), never by complete():
    // what's checked is that each one notices what the player did.
    out.quests = {};
    {
      const p = G.player, cooldown = G.objectives.cooldown, puTimer = G.powerups.timer;
      G.powerups.timer = 1e9; // no power-up (Magnet, Mega Plane...) gets grabbed and changes the rules
      G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
      G.powerups.active.clear();
      const fresh = (type) => {
        if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
        G.objectives.cooldown = 1e9; // nothing new starts after it's done
        G.zones.sinceZone = 0;
        G.objectives.startType(type);
        return G.objectives.current;
      };
      const visit = (v) => { p.pos.copy(v); p.prevPos.copy(v); step(1); };
      // Barrel roll: an Immelmann's half roll doesn't count; real barrel rolls (double-tap stunts) do.
      const roll = fresh('roll');
      let done0 = G.objectives.completed;
      p.maneuver = null;
      p.quat.setFromAxisAngle(p.up.set(0, 1, 0), Math.atan2(-p.forward.x, -p.forward.z));
      p.updateAxes();
      p.pos.y = Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z), G.world.seaLevel) + 250;
      p.maneuverCd = 0;
      p.startManeuver('up');
      step(75);
      out.quests.halfRollIgnored = /Rolls 0\//.test(roll.progress);
      for (let k = 0; k < 6 && G.objectives.current === roll; k++) { p.maneuverCd = 0; p.startManeuver(k % 2 ? 'left' : 'right'); step(40); }
      out.quests.roll = G.objectives.current !== roll && G.objectives.completed === done0 + 1;
      // Frame timing doesn't matter: each real roll counts once, whatever the dt (odd ones leave a tiny last step).
      const roll2 = fresh('roll');
      step(1);
      done0 = G.objectives.completed;
      const need = +roll2.progress.match(/Rolls 0\/(\d)/)[1];
      out.quests.rollAnyDt = true;
      [0.0349, 1 / 60, 0.0371].slice(0, need).forEach((dt, k) => {
        p.maneuverCd = 0;
        p.startManeuver(k % 2 ? 'left' : 'right');
        for (let i = 0; i < Math.ceil(2 / dt); i++) { p.invuln = 99; G.step(dt); }
        const counted = k + 1 < need ? new RegExp(`Rolls ${k + 1}/`).test(roll2.progress) : G.objectives.current !== roll2;
        if (!counted) out.quests.rollAnyDt = false;
      });
      out.quests.rollAnyDt &&= G.objectives.completed === done0 + 1;
      // Pizza delivery: fly into the box, the target switches to the drop-off, the pizza cools, deliver it.
      const del = fresh('delivery');
      done0 = G.objectives.completed;
      const pizzaAt = del.target().clone();
      visit(pizzaAt);
      step(1);
      const padAt = del.target().clone();
      step(30);
      const warmth = +(del.progress.match(/Warmth (\d+)%/) || [0, 100])[1];
      out.quests.deliveryStages = padAt.distanceTo(pizzaAt) > 200 && warmth < 100;
      visit(del.target());
      step(1);
      out.quests.delivery = G.objectives.current !== del && G.objectives.completed === done0 + 1;
      // Constellation: touching a star out of order does nothing; flying through them in order draws it.
      const con = fresh('constellation');
      done0 = G.objectives.completed;
      visit(con.starAt(con.stars - 1));
      out.quests.constellationOrder = /Star 1 \//.test(con.progress) && G.objectives.current === con;
      for (let k = 0; k < con.stars; k++) visit(con.target().clone());
      step(45); // a moment to admire the drawing
      out.quests.constellation = G.objectives.current !== con && G.objectives.completed === done0 + 1;
      // A falling star never starts inside the ground: aimed at a valley floor with a wall 400 m over you all around
      // it, it starts over the wall (offset sideways, it would otherwise be born inside a hill and fizzle uncatchably).
      {
        const surface = G.terrain.surfaceHeight, wall = p.pos.y + 400;
        let aim = null; // the first height asked for is the spot it aims at
        G.terrain.surfaceHeight = (x, z) => { aim ||= { x, z }; return Math.hypot(x - aim.x, z - aim.z) < 30 ? 0 : wall; };
        const s = window.QUESTS_FOR_TEST.mkMeteors(G), sp = s.target().clone();
        out.quests.starClear = sp.y > G.terrain.surfaceHeight(sp.x, sp.z) + 2;
        G.terrain.surfaceHeight = surface;
        s.dispose(G);
      }
      // Falling stars: each one caught in mid-air counts.
      const met = fresh('meteors');
      done0 = G.objectives.completed;
      for (let k = 0; k < 5 && G.objectives.current === met; k++) {
        for (let i = 0; i < 60 && !met.target(); i++) step(1); // the next one is on its way
        visit(met.target().clone());
      }
      out.quests.meteors = G.objectives.current !== met && G.objectives.completed === done0 + 1;
      // Photo safari: nose on the whale, close enough, long enough, three times (it bolts after each one).
      const photo = fresh('photo');
      done0 = G.objectives.completed;
      for (let i = 0; i < 30 * 20 && G.objectives.current === photo; i++) {
        const w = photo.target();
        p.nudgeToward(w, 1e9, 1);
        p.updateAxes();
        p.pos.copy(w).addScaledVector(p.forward, -110);
        p.prevPos.copy(p.pos);
        step(1);
      }
      out.quests.photo = G.objectives.current !== photo && G.objectives.completed === done0 + 1;
      // Landing, on the runway objective's strip (its ground is flattened, so this never depends on the terrain roll):
      // a gentle, level descent lands and rolling along the strip completes it; pulling up takes off; hopping straight
      // back down scores nothing; a steep dive onto the same flat ground still crashes, settling onto water too, and
      // Ghost Mode skims instead of landing. No safety net (invuln / grace) on any of these.
      {
        const V = p.pos.constructor, Q = p.quat.constructor, UP = new V(0, 1, 0), hp = p.health;
        G.enemies.spawnTimer = 1e9;
        G.enemies.list.filter((e) => !e.quest).forEach((e) => G.enemies.removeEnemy(e));
        p.health = 1e6; // enemies aren't what this checks
        const celebrate = G.mutations.celebrate;
        G.mutations.celebrate = () => []; // nor is the world reshaping itself after the win
        const run = fresh('landing');
        done0 = G.objectives.completed;
        const S = run.strip;
        step(60); // the chunks under the flattened strip rebuild
        const at = (lz, up) => new V(S.c.x + lz * Math.sin(S.yaw), S.c.y + up, S.c.z + lz * Math.cos(S.yaw)); // strip-local z: + is the near end
        const nose = (pitch) => new Q().setFromAxisAngle(UP, S.yaw).multiply(new Q().setFromAxisAngle(new V(1, 0, 0), pitch));
        const glide = nose(-Math.asin(0.06)); // sinking about 2.6 m/s
        let reason = null;
        const crash = p.crash.bind(p);
        p.crash = (r) => { reason ||= r; crash(r); };
        const fly = (from, q, frames, until = () => false) => {
          p.pos.copy(from); p.prevPos.copy(from); p.maneuver = null; p.landed = null;
          p.dead = false; p.model.group.visible = true; p.health = 1e6; p.speed = p.baseSpeed; p.freeBoost = 0; // cruising, no boost
          for (let k = 0; k < frames && !p.dead && !until(); k++) { p.invuln = 0; p.grace = 0; p.quat.copy(q); p.updateAxes(); G.step(1 / 30); }
        };
        const free = (frames, until = () => false) => { for (let k = 0; k < frames && !p.dead && !until(); k++) { p.invuln = 0; p.grace = 0; G.step(1 / 30); } }; // hands off the stick
        fly(at(85, 4.5), glide, 150, () => p.landed);
        const L = out.landing = { landed: !!p.landed, dead: p.dead, ...p.lastLanding };
        free(150, () => G.objectives.current !== run);
        Object.assign(L, { done: G.objectives.current !== run && G.objectives.completed === done0 + 1, rollSpeed: Math.round(p.speed), stillLanded: !!p.landed });
        G.objectives.cooldown = 1e9; // completing it re-armed the cooldown: nothing new (a boss!) starts mid-check
        const before = p.lastLanding;
        fly(at(85, 4.5), glide, 150, () => p.landed);
        out.hop = { landed: !!p.landed && p.lastLanding !== before, points: p.lastLanding.points };
        free(20);
        G.input.keys.add('KeyW'); // from that hop: roll a moment, pull up for 1.5 s, then let go
        const y0 = p.pos.y;
        free(45);
        G.input.keys.delete('KeyW');
        const y1 = p.pos.y;
        free(60);
        out.takeoff = { airborne: !p.landed && !p.dead, lifted: Math.round(y1 - y0), climb: Math.round(p.pos.y - y1) };
        reason = null;
        fly(at(-40, 40), nose(-0.7), 90);
        out.diveCrash = reason;
        p.spawn(p.pos.x, p.pos.z, S.yaw);
        reason = null;
        const sea = G.world.seaLevel;
        G.world.seaLevel = S.c.y + 10; // a flood over the strip, just for this
        fly(at(85, 14.5), glide, 150, () => p.landed);
        out.waterCrash = { reason, landed: !!p.landed };
        G.world.seaLevel = sea;
        p.spawn(p.pos.x, p.pos.z, S.yaw);
        G.powerups.active.set('ghost', 10);
        fly(at(85, 4.5), glide, 90);
        out.ghostLanded = !!p.landed || p.dead;
        G.powerups.active.clear();
        // Back on the (ended) runway's strip: taxiing isn't crop dusting, and runways that end keep their flattened
        // ground only while you're rolling on it. Starting and dropping runways (dev-menu jumps, Relax) never piles up
        // pads, and the ground under the wheels never moves.
        {
          const W = window.WORLD_FOR_TEST;
          p.spawn(p.pos.x, p.pos.z, S.yaw);
          fly(at(85, 4.5), glide, 150, () => p.landed);
          const pads = { landed: !!p.landed };
          const dust = fresh('lowfly');
          free(30);
          pads.dusting = dust.progress;
          const g0 = G.terrain.surfaceHeight(p.pos.x, p.pos.z, p.pos.y);
          for (let k = 0; k < 4; k++) { fresh('landing'); free(2); } // each dropped as the next starts
          fresh('lowfly');
          pads.whileRolling = W.padCount();
          pads.groundKept = !!p.landed && Math.abs(G.terrain.surfaceHeight(p.pos.x, p.pos.z, p.pos.y) - g0) < 0.01;
          p.spawn(p.pos.x + 900, p.pos.z, S.yaw); // took off and flew away
          for (let k = 0; k < 6; k++) { fresh('landing'); step(2); }
          pads.max = W.padCount();
          fresh('lowfly');
          pads.after = W.padCount();
          out.pads = pads;
        }
        p.crash = crash;
        p.spawn(p.pos.x, p.pos.z, S.yaw);
        p.health = hp;
        G.mutations.celebrate = celebrate;
        G.enemies.spawnTimer = 5;
      }
      G.objectives.cooldown = cooldown;
      G.powerups.timer = puTimer;
    }

    // A boss fight: fly at the boss with guns blazing until it falls.
    if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
    out.firstBossGap = G.objectives.nextBossAt;
    G.objectives.completed = G.objectives.nextBossAt;
    G.objectives.bossDeck = ['kingDrone'];
    G.objectives.next();
    out.nextBossGap = G.objectives.nextBossAt - G.objectives.completed;
    const boss = G.enemies.list.find((e) => e.boss);
    if (!boss) throw new Error('boss did not spawn');
    // Count drops directly: the plane is usually close enough to grab the drop the moment the boss dies.
    // Regular power-up spawns go through drop() too: hold them off so only the boss's drop is counted.
    const puTimer = G.powerups.timer;
    G.powerups.timer = 1e9;
    let drops = 0;
    const drop = G.powerups.drop.bind(G.powerups);
    G.powerups.drop = (...args) => { drops++; return drop(...args); };
    G.input.keys.add('Space');
    for (let i = 0; i < 30 * 120 && !boss.dead; i++) { G.player.grace = 1; G.player.nudgeToward(boss.pos, 6, 1 / 30); step(1); }
    G.input.keys.delete('Space');
    out.bossDefeated = boss.dead;
    out.bossDroppedPowerup = drops === 1;
    out.bossDrops = drops;
    G.powerups.drop = drop;
    G.powerups.timer = puTimer;
    step(30);

    // Every boss: spawns, fights for a while (attacks, summons, dashes), then falls and completes the objective.
    out.bosses = {};
    const startBoss = (kind, opts) => {
      if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
      G.objectives.start(G.objectives.makeBoss(kind, opts), 'boss');
      return G.enemies.list.filter((e) => e.boss);
    };
    for (const kind of Object.keys(window.BOSSES_FOR_TEST)) {
      // A Time Freeze or Slow-Mo grabbed from the last boss's drop would stop this one from attacking.
      G.powerups.active.clear();
      G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
      G.powerups.timer = 1e9;
      // The fort needs flat land: calm the mountains for its turn so the test never depends on the terrain roll.
      // (Flat land may sit below the sea, and forts can't swim, so drain the sea too.)
      const ground = window.BOSSES_FOR_TEST[kind].ground, { amp, seaLevel } = G.world;
      if (ground) { Object.assign(G.world, { amp: 0.15, seaLevel: -400 }); G.terrain.rebuildAll(); step(30); }
      const done0 = G.objectives.completed;
      const list = startBoss(kind, { mod: null, duo: false });
      const e = list[0];
      for (let i = 0; i < 30 * 10; i++) { G.player.grace = 1; G.player.health = G.player.maxHealth; G.player.nudgeToward(e.pos, 2, 1 / 30); step(1); }
      const attacks = e.attacks;
      e.hp = 0;
      step(3);
      out.bosses[kind] = { spawned: e.kind, attacks, done: G.objectives.completed === done0 + 1 };
      if (ground) { Object.assign(G.world, { amp, seaLevel }); G.terrain.rebuildAll(); step(30); }
      G.enemies.list.filter((x) => !x.boss).forEach((x) => G.enemies.removeEnemy(x));
    }
    // Lead bosses (the octopus & co.) hold a slot in front of you while you just fly on. Over calm land, so a
    // mountain range can't hold one back; called off rather than beaten, so no extra win reshapes the world.
    out.leadBosses = {};
    const { amp, seaLevel } = G.world;
    Object.assign(G.world, { amp: 0.15, seaLevel: -400 });
    G.terrain.rebuildAll();
    step(30);
    for (const [kind, def] of Object.entries(window.BOSSES_FOR_TEST)) {
      if (!def.lead) continue;
      // The last boss's drop is still lying around: a Time Freeze grabbed from it would stop this one cold.
      G.powerups.active.clear();
      G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
      // Fly on level, keeping the heading: the fights above leave the nose pointed at the last boss, maybe nearly
      // straight up or down, and hands off it stays there. A lead boss holds a slot ahead along your *flat* heading.
      G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
      const [e] = startBoss(kind, { mod: null, duo: false });
      // Sampled twice a second for 6 s, after 6 s to fly in (it may spawn 800 m out, or behind you if you're turning).
      let ahead = 0, samples = 0;
      for (let i = 0; i < 30 * 12; i++) {
        G.player.grace = 1; G.player.health = G.player.maxHealth; step(1);
        if (i >= 180 && i % 15 === 0) {
          const to = e.pos.clone().sub(G.player.pos);
          samples++;
          if (to.dot(G.player.forward) > 40 && to.length() < 350) ahead++;
        }
      }
      out.leadBosses[kind] = { ahead: +(ahead / samples).toFixed(2), attacks: e.attacks, zone: G.zones.current.name };
      G.objectives.current.dispose(G);
      G.objectives.current = null;
      G.enemies.list.filter((x) => !x.boss).forEach((x) => G.enemies.removeEnemy(x));
    }
    Object.assign(G.world, { amp, seaLevel });
    G.terrain.rebuildAll();
    step(30);
    // Twins with a modifier: two bosses share one objective; it only completes when both are down.
    const twins = startBoss('gooseQueen', { mod: 'turbo', duo: true });
    step(30);
    twins[0].hp = 0;
    step(3);
    const halfDone = G.objectives.current?.type === 'boss';
    twins[1].hp = 0;
    step(3);
    out.twins = { count: twins.length, name: twins[0].short, halfDone, done: !G.objectives.current };
    G.enemies.list.filter((x) => !x.boss).forEach((x) => G.enemies.removeEnemy(x));
    G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh)); // the twins' drops: leftovers, not relax-mode spawns
    G.powerups.timer = 5;

    // Relax mode: objectives, enemies and pickups go away and stay away; an interrupted boss comes back.
    startBoss('megaUfo', { mod: null, duo: false });
    G.enemies.spawn('drone', G.player.pos.clone().addScaledVector(G.player.forward, 200));
    G.setRelax(true);
    G.powerups.timer = 0;
    step(30 * 30);
    out.relax = {
      objective: !!G.objectives.current, enemies: G.enemies.list.length, pickups: G.powerups.pickups.length,
      bodyClass: document.body.classList.contains('relax'), panelHidden: getComputedStyle(document.getElementById('objective')).display === 'none',
    };
    G.setRelax(false);
    step(30 * 6);
    out.relax.backObjective = G.objectives.current?.type;
    if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
    G.enemies.list.filter((x) => !x.quest).forEach((x) => G.enemies.removeEnemy(x));

    // Weak points and breakable parts, hit with real bullets placed on the part.
    // Isolate these checks: no new spawns, so no stray enemy can fly through a target part and eat the bullets.
    G.powerups.active.clear();
    G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh)); // flying through one would change the bullets
    G.powerups.timer = 1e9;
    G.enemies.spawnTimer = 1e9;
    G.enemies.list.filter((e) => !e.boss).forEach((e) => G.enemies.removeEnemy(e));
    const ahead = () => G.player.pos.clone().addScaledVector(G.player.forward, 120).setY(G.player.pos.y + 40);
    const at = new G.player.pos.constructor();
    const shots = [];
    const shootAt = (part) => {
      part.obj.getWorldPosition(at);
      // Bullets still in flight (e.g. from the boss fight, fired straight ahead) would hit the target too.
      while (G.player.bullets.length) G.player.removeBullet(0);
      G.player.shootCd = 0;
      const n = G.player.bullets.length;
      G.player.fire();
      const mine = G.player.bullets.slice(n);
      for (const b of mine) { b.pos.copy(at); b.vel.set(0, 0, 0); }
      const hp = part.hp;
      step(1);
      // Kept in the report so a failure says what happened to each shot.
      shots.push({ part: part.name, hp: `${hp}->${part.hp}`, bullets: mine.length, unspent: mine.filter((b) => G.player.bullets.includes(b)).length, dead: G.player.dead, active: [...G.powerups.active.keys()].join('+') });
    };
    const partOf = (e, name) => e.mesh.userData.parts.find((x) => x.name === name && !x.broken);
    const dmg = G.player.stats.damage;
    G.powerups.active.set('freeze', 999); // hold enemies still so a placed bullet stays on its part
    // New enemies turn to face the plane on their first update, so let each settle before aiming at its parts.
    const blimp = G.enemies.spawn('blimp', ahead());
    blimp.hp = 100;
    step(1);
    const hp0 = blimp.hp;
    shootAt(partOf(blimp, 'gondola'));
    out.weakPointDamage = hp0 - blimp.hp;          // 2 bullets × weak multiplier 2
    out.weakPointExpected = 4 * dmg;
    if (partOf(blimp, 'gondola')) shootAt(partOf(blimp, 'gondola')); // with the double-damage perk, the first shot already broke it
    out.gondolaStopsBombs = !!blimp.noBombs;
    const drone = G.enemies.spawn('drone', ahead());
    drone.hp = 100;
    step(1);
    for (let k = 0; k < 2 && partOf(drone, 'rotor'); k++) shootAt(partOf(drone, 'rotor'));
    out.droneFalling = drone.state === 'falling';
    G.powerups.active.delete('freeze');
    for (let i = 0; i < 30 * 30 && !drone.dead; i++) step(1);
    out.droneCrashed = drone.dead;
    G.enemies.list.filter((e) => !e.boss).forEach((e) => G.enemies.removeEnemy(e));
    G.powerups.active.clear();
    // Like the game, only put the cannon on gentle ground (on a steep slope its barrel sinks into the hill).
    let cannonPos = ahead();
    for (let k = 0; k < 40 && !G.enemies.isGentleGround(cannonPos.x, cannonPos.z); k++) {
      cannonPos = ahead().addScaledVector(G.player.right, (k % 2 ? 1 : -1) * 20 * (1 + (k >> 1)));
    }
    cannonPos.y = G.terrain.surfaceHeight(cannonPos.x, cannonPos.z);
    const cannon = G.enemies.spawn('cannon', cannonPos);
    cannon.hp = 100;
    G.powerups.active.set('freeze', 999);
    step(1);
    for (let k = 0; k < 3 && !cannon.disarmed; k++) shootAt(partOf(cannon, 'barrel'));
    out.cannonDisarmed = !!cannon.disarmed;
    if (!out.cannonDisarmed || !out.gondolaStopsBombs) out.partShots = shots;
    G.powerups.active.delete('freeze');
    G.enemies.spawnTimer = 5;

    // Power-ups: a pickup spawns ahead, flying into it activates it, and every type runs and expires.
    G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
    G.powerups.timer = 0;
    step(2);
    const pickup = G.powerups.pickups[0];
    out.pickupSpawned = !!pickup;
    if (pickup) { G.player.pos.copy(pickup.pos); step(2); }
    out.pickupCollected = G.powerups.active.size > 0 || G.player.health === G.player.maxHealth;
    // No more pickups during the wear-off wait: flying into a fresh one would keep a power-up active.
    G.powerups.timer = 1e9;
    G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
    for (const id of Object.keys(window.POWERUPS_FOR_TEST || {})) { G.powerups.activate(id); }
    G.input.keys.add('Space');
    step(30 * 5);
    G.input.keys.delete('Space');
    out.powerupsActiveMidway = G.powerups.active.size;
    const longest = Math.max(...Object.values(window.POWERUPS_FOR_TEST).map((d) => d.dur)) * G.progress.durationMul;
    out.longestPowerup = longest;
    step(30 * Math.ceil(longest - 5 + 3));
    out.powerupsActiveAfterAMinute = G.powerups.active.size;

    // Destructible terrain: bullets and enemy orbs that hit the ground dig craters, and the mesh follows.
    const spot = G.player.pos.clone().addScaledVector(G.player.forward, 80);
    const ground0 = G.terrain.surfaceHeight(spot.x, spot.z);
    const snapshot = (c) => { const m = new Map(); for (let dx = -6; dx <= 6; dx += 2) for (let dz = -6; dz <= 6; dz += 2) m.set(dx + ',' + dz, G.terrain.surfaceHeight(c.x + dx, c.z + dz)); return (x, z) => m.get(Math.round(x - c.x) + ',' + Math.round(z - c.z)); };
    const bulletBefore = snapshot(spot);
    G.player.shootCd = 0;
    const nb = G.player.bullets.length;
    G.player.fire();
    for (const b of G.player.bullets.slice(nb)) { b.pos.set(spot.x, ground0 - 1, spot.z); b.vel.set(0, 0, 0); }
    step(30); // bullets land, the chunk under them rebuilds
    // Deepest drop on the rendered mesh around the impact (the 8 m vertex grid rarely lines up with the exact spot).
    const deepestDrop = (c, before) => {
      let best = 0;
      for (let dx = -6; dx <= 6; dx += 2) for (let dz = -6; dz <= 6; dz += 2) best = Math.max(best, before(c.x + dx, c.z + dz) - G.terrain.surfaceHeight(c.x + dx, c.z + dz));
      return +best.toFixed(2);
    };
    out.bulletCrater = deepestDrop(spot, bulletBefore);
    const orbSpot = spot.clone().addScaledVector(G.player.right, 60);
    const orbGround0 = G.terrain.surfaceHeight(orbSpot.x, orbSpot.z);
    const orbBefore = snapshot(orbSpot);
    G.enemies.fireOrb(orbSpot.clone().setY(orbGround0 + 3), new G.player.pos.constructor(0, -1, 0), 50, 10);
    step(30);
    out.orbCrater = deepestDrop(orbSpot, orbBefore);

    // Zones: completing objectives flies you on to the next zone; every zone loads cleanly.
    const zone0 = G.zones.index;
    G.zones.sinceZone = 2; // one objective away from the next zone
    if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
    G.objectives.completed = 1;
    G.objectives.next();
    G.objectives.complete(false);
    out.zoneAdvanced = G.zones.index === zone0 + 1;
    out.zones = [];
    const zoneCount = (await import('./src/zones.js')).ZONES.length;
    const { CURVE, AXIS_CURVE, CURVE_AXIS } = await import('./src/curve.js');
    const { PROPS } = await import('./src/models.js');
    const instances = (type, fn) => { // every placed (not blown-away) instance of a prop type in the loaded chunks
      const m = new G.camera.matrix.constructor(), v = pp0.clone();
      for (const c of G.terrain.chunks.values()) for (const im of c.props.children) {
        if (im.geometry !== PROPS[type].geo) continue;
        for (let k = 0; k < im.count; k++) { im.getMatrixAt(k, m); if (m.elements[0] || m.elements[2]) fn(v.setFromMatrixPosition(m)); }
      }
    };
    const pp0 = G.player.pos;
    const COUNTRY = ['picnicTable', 'tractor', 'camperVan', 'skiLift', 'gasStation'];
    out.countrySeen = {};
    for (let i = 0; i < zoneCount; i++) {
      G.zones.enter(i);
      step(90);
      const z = G.zones.current, pp = G.player.pos;
      const ground = G.terrain.surfaceHeight(pp.x, pp.z), roof = G.terrain.ceilingHeight(pp.x, pp.z);
      out.zones.push({
        name: z.name, ground: Math.round(ground), asteroids: G.zones.asteroids.list.length,
        roof: Number.isFinite(roof) ? Math.round(roof) : null, gap: Number.isFinite(roof) ? Math.round(roof - ground) : null,
        planeUnderRoof: pp.y < roof, curve: +(CURVE.value * 1e4).toFixed(2),
        axisCurve: +(AXIS_CURVE.value * 1e4).toFixed(2), axis: [CURVE_AXIS.value.x, CURVE_AXIS.value.y], sea: G.world.seaLevel,
      });
      for (const t of COUNTRY) instances(t, () => { out.countrySeen[t] = (out.countrySeen[t] || 0) + 1; });
      if (z.world.city) {
        // Metropolis: buildings are ground with sheer walls. Flying into one crashes (Ghost Mode skims onto the roof),
        // an avenue is clear to fly down low (the crop-dusting objective completes there), and the props sit where they belong.
        const W = await import('./src/world.js');
        const p = G.player, V = pp.constructor, hp = p.health, cooldown = G.objectives.cooldown, puTimer = G.powerups.timer;
        const B = G.world.city, sea = G.world.seaLevel, bx0 = Math.floor(pp.x / B), bz0 = Math.floor(pp.z / B);
        const city = { tallest: 0, buildings: 0, meshes: [...G.terrain.chunks.values()].filter((c) => c.city).length };
        let wall = null;
        for (let bx = bx0 - 12; bx <= bx0 + 12; bx++) {
          for (let bz = bz0 - 12; bz <= bz0 + 12; bz++) {
            const blk = W.cityBlock(bx, bz);
            for (const b of blk.lots) {
              city.buildings++;
              city.tallest = Math.max(city.tallest, b.tiers[b.tiers.length - 1].top - b.base);
              const t = b.tiers[0], x = bx * B + (blk.x0 - bx * B) / 2, z = (t.z0 + t.z1) / 2; // the middle of the road west of it
              if (!wall && t.top - W.cityGround(x, z) >= 40 && b.x0 - blk.x0 < 10 && W.cityGround(x, z) > sea + 3) wall = { x, z, t, street: W.cityGround(x, z) };
            }
          }
        }
        if (!wall) throw new Error('Metropolis: no building found to fly into');
        const inside = new V((wall.t.x0 + wall.t.x1) / 2, 0, (wall.t.z0 + wall.t.z1) / 2);
        city.street = Math.round(W.heightAt(wall.x, wall.z));
        city.roof = Math.round(W.heightAt(inside.x, inside.z));
        city.sheer = G.terrain.surfaceHeight(wall.t.x0 + 0.5, wall.z) === wall.t.top && G.terrain.surfaceHeight(wall.t.x0 - 0.5, wall.z) < W.cityGround(wall.t.x0 - 0.5, wall.z) + 1; // street level at the wall's foot (the road can slope)
        // Deterministic: the same seed plans the same city after the cache is cleared.
        const sample = () => Array.from({ length: 40 }, (_, k) => W.heightAt(pp.x + (k % 8) * 37 - 150, pp.z + Math.floor(k / 8) * 53 - 130)).join();
        const before = sample();
        W.clearCity();
        city.deterministic = sample() === before;

        if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
        G.objectives.cooldown = 1e9;
        G.powerups.timer = 1e9;
        G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
        G.powerups.active.clear();
        p.health = 1e6; // enemies aren't what this checks
        p.maneuver = null;
        let reason = null;
        const crash = p.crash.bind(p);
        p.crash = (r) => { reason ||= r; crash(r); };
        const fly = (x, y, z, yaw, frames, each) => {
          p.pos.set(x, y, z); p.prevPos.copy(p.pos); p.dead = false; p.model.group.visible = true;
          for (let k = 0; k < frames && !p.dead; k++) {
            p.invuln = 0; p.grace = 0;
            p.quat.setFromAxisAngle(new V(0, 1, 0), yaw); p.updateAxes(); // level, holding the heading
            G.step(1 / 30);
            each?.();
          }
        };
        G.terrain.update(new V(wall.x, 0, wall.z), 200);
        fly(wall.x, wall.street + 12, wall.z, -Math.PI / 2, 60); // heading +x, 12 m up, straight at the wall
        city.wallCrash = reason;
        reason = null;
        G.powerups.active.set('ghost', 10);
        fly(wall.x, wall.street + 12, wall.z, -Math.PI / 2, 30);
        city.ghostOnRoof = !p.dead && reason === null && p.pos.y >= wall.t.top;
        G.powerups.active.clear();

        // Low down an avenue: find a dry, flat 500 m stretch, then crop-dust along it with no safety net.
        let run = null;
        for (let k = -6; k <= 6 && !run; k++) {
          const x = (Math.floor(bx0 / 4) + k) * 4 * B + 20;
          for (let z = pp.z - 1500; z < pp.z + 1500 && !run; z += B) {
            let lo = Infinity, hi = -Infinity;
            for (let d = 0; d <= 500; d += 8) { const g = W.cityGround(x, z + d); lo = Math.min(lo, g); hi = Math.max(hi, g); }
            if (lo > sea + 3 && hi - lo < 4) run = { x, z, y: hi + 12 };
          }
        }
        if (!run) throw new Error('Metropolis: no dry avenue found');
        G.terrain.update(new V(run.x, 0, run.z + 250), 200);
        G.objectives.completed = 1;
        G.zones.sinceZone = 0;
        G.objectives.cooldown = 0;
        G.objectives.recent = window.OBJ_FOR_TEST.OBJECTIVE_TYPES.filter((t) => t !== 'lowfly');
        G.objectives.next();
        city.lowflyStarted = G.objectives.current?.type === 'lowfly';
        const done = G.objectives.completed;
        let maxAlt = 0;
        reason = null;
        fly(run.x, run.y, run.z, Math.PI, 30 * 9, () => { maxAlt = Math.max(maxAlt, p.pos.y - G.terrain.surfaceHeight(p.pos.x, p.pos.z, p.pos.y)); }); // heading +z
        city.avenue = { dead: p.dead, reason, maxAlt: Math.round(maxAlt), lowflyDone: G.objectives.completed > done };
        p.crash = crash;
        p.health = hp;
        G.objectives.cooldown = cooldown;
        G.powerups.timer = puTimer;

        // Air objectives never put their targets inside (or under the roof of) a building.
        city.buried = [];
        for (const type of ['hoop', 'chain', 'stars', 'balloons']) {
          if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
          G.objectives.completed = 1;
          G.objectives.recent = window.OBJ_FOR_TEST.OBJECTIVE_TYPES.filter((t) => t !== type);
          G.objectives.next();
          for (let k = 0; k < 30; k++) {
            const t = G.objectives.current?.target();
            if (t && t.y < W.heightAt(t.x, t.z) + 5) { city.buried.push(type); break; }
            step(1);
          }
        }
        if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }

        // City props: instanced, traffic on the streets (never in a building), rooftop things on the roofs.
        city.props = {};
        city.misplaced = [];
        const CITY = ['car', 'taxi', 'bus', 'streetLamp', 'trafficLight', 'parkTree', 'bench', 'waterTower', 'helipad', 'antenna', 'billboard', 'crane', 'spire', 'statue', 'fountain'];
        for (const t of CITY) instances(t, () => { city.props[t] = (city.props[t] || 0) + 1; });
        for (const t of ['car', 'taxi', 'bus']) instances(t, (v) => { if (W.cityRoofAt(v.x, v.z) > -Infinity || Math.abs(v.y - W.cityGround(v.x, v.z)) > 0.5) city.misplaced.push(t); });
        for (const t of ['waterTower', 'helipad', 'antenna', 'spire']) instances(t, (v) => { if (Math.abs(v.y - W.cityRoofAt(v.x, v.z)) > 0.5) city.misplaced.push(t); });
        out.city = city;
      }
      if (z.world.underwater) {
        // Underwater: nose held up for 8 s with no safety net. The surface holds the plane under it instead of crashing it.
        // Start in open water (the game's 8 s zone grace would cover a hill under the plane; this flight has none):
        // level, mid-way between seabed and surface, over a heading whose seabed stays well under the climb.
        const p = G.player, hp = p.health, sea = G.world.seaLevel, V = pp.constructor, Q = p.quat.constructor; // THREE.Vector3 / Quaternion
        const UP = new V(0, 1, 0), PITCH = 0.6;
        const clear = (x, z, dir, y0) => {
          for (let d = 0; d <= 600; d += 10) {
            const climb = Math.min(sea - 7, y0 + d * Math.tan(PITCH) * 0.7); // below the real climb (speed drops nose-up)
            if (G.terrain.surfaceHeight(x + dir.x * d, z + dir.z * d) > climb - 15) return false;
          }
          return true;
        };
        let start = null;
        for (let r = 0; r <= 1200 && !start; r += 150) {
          for (let a = 0; a < 8 && !start; a++) {
            const x = pp.x + Math.cos(a * Math.PI / 4) * r, z = pp.z + Math.sin(a * Math.PI / 4) * r;
            const y0 = (G.terrain.surfaceHeight(x, z) + sea) / 2;
            for (let h = 0; h < 16 && !start; h++) {
              const yaw = h * Math.PI / 8, dir = new V(-Math.sin(yaw), 0, -Math.cos(yaw)); // forward for this yaw
              if (clear(x, z, dir, y0)) start = { x, y: y0, z, yaw };
            }
          }
        }
        if (!start) throw new Error('underwater: no open water found for the surface check');
        const nose = new Q().setFromAxisAngle(UP, start.yaw).multiply(new Q().setFromAxisAngle(new V(1, 0, 0), PITCH));
        pp.set(start.x, start.y, start.z);
        p.prevPos.copy(pp);
        p.maneuver = null;
        p.health = 1e6; // enemies aren't what this checks
        let maxY = -Infinity, crashed = false, atSurface = 0;
        for (let k = 0; k < 240; k++) {
          p.invuln = 0; p.grace = 0;
          p.quat.copy(nose); p.updateAxes(); // holding the stick back: keep pushing into the surface
          G.step(1 / 30);
          crashed ||= p.dead;
          maxY = Math.max(maxY, p.pos.y);
          if (p.pos.y > sea - 10) atSurface++;
        }
        out.underwater = { sea, startY: Math.round(start.y), maxY: Math.round(maxY), dead: crashed, pressedSecs: +(atSurface / 30).toFixed(1) };
        p.health = hp;
        // Fresh objectives keep their targets in the water.
        out.underwater.aboveSurface = [];
        for (const type of ['hoop', 'chain', 'stars', 'balloons']) {
          if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
          G.objectives.completed = 1;
          G.objectives.recent = window.OBJ_FOR_TEST.OBJECTIVE_TYPES.filter((t) => t !== type);
          G.objectives.next();
          for (let i = 0; i < 30; i++) {
            const t = G.objectives.current?.target();
            if (t && t.y >= G.world.seaLevel) { out.underwater.aboveSurface.push(type); break; }
            step(1);
          }
          if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
        }
        // The seabed gets biome colours: count distinct hues in the loaded terrain (one flat seabed colour would be ~1).
        const hues = new Set();
        for (const c of [...G.terrain.chunks.values()].slice(0, 6)) {
          const col = c.mesh.geometry.attributes.color.array;
          for (let i = 0; i < col.length; i += 3) { const sum = col[i] + col[i + 1] + col[i + 2] || 1; hues.add(`${(col[i] / sum).toFixed(2)},${(col[i + 1] / sum).toFixed(2)}`); }
        }
        out.underwater.hues = hues.size;
      }
      if (z.world.cave) {
        // Every objective the cave offers keeps its targets under the roof (sampled for 2 s each, as items drift).
        out.caveObjective = { checked: 0, aboveRoof: [] };
        for (const type of window.OBJ_FOR_TEST.OBJECTIVE_TYPES.filter((t) => G.zones.allowsObjective(t))) {
          if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
          G.objectives.completed = 1;
          G.objectives.recent = window.OBJ_FOR_TEST.OBJECTIVE_TYPES.filter((t) => t !== type);
          G.objectives.next();
          for (let i = 0; i < 60; i++) {
            const t = G.objectives.current?.target();
            if (t && !G.objectives.current.virtual && t.y >= G.terrain.ceilingHeight(t.x, t.z)) { out.caveObjective.aboveRoof.push(type); break; }
            step(1);
          }
          out.caveObjective.checked++;
          if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
        }
        out.caveObjective.underRoof = out.caveObjective.aboveRoof.length === 0;
      }
      if (z.world.tunnels) {
        // Hollow Peaks: fly clean through the nearest tunnel with no safety net (steered along its centre line),
        // bump its roof, then check that above the same mountain the top is the ground and the sky is open.
        const W = await import('./src/world.js');
        const p = G.player, V = pp.constructor, hp = p.health, cooldown = G.objectives.cooldown;
        const T = W.tunnelsNear(pp.x, pp.z, 3000).sort((a, b) => Math.hypot(a.ox - pp.x, a.oz - pp.z) - Math.hypot(b.ox - pp.x, b.oz - pp.z))[0];
        if (!T) throw new Error('Hollow Peaks: no tunnel found');
        for (const t of [0, T.len / 2, T.len]) { const c = W.tunnelPoint(T, t); G.terrain.update(new V(c.x, 0, c.z), 200); } // its chunks, built now
        if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
        G.objectives.cooldown = 1e9;
        const puTimer = G.powerups.timer; // no power-up (Ghost Mode!) gets picked up on the way through
        G.powerups.timer = 1e9;
        G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
        G.powerups.active.clear();
        p.health = 1e6; // enemies aren't what this checks
        p.maneuver = null;
        let reason = null;
        const crash = p.crash.bind(p);
        p.crash = (r) => { reason ||= r; crash(r); };
        const along = () => (p.pos.x - T.ax) * T.dx + (p.pos.z - T.az) * T.dz;
        const placeAt = (t, lift) => { const c = W.tunnelPoint(T, t); p.pos.set(c.x, c.floor + T.H * lift, c.z); p.prevPos.copy(p.pos); p.dead = false; p.model.group.visible = true; };
        const aim = (t) => { const c = W.tunnelPoint(T, Math.min(T.len + 100, t + 25)); p.nudgeToward(new V(c.x, c.floor + T.H * 0.42, c.z), 1e9, 1); p.updateAxes(); };
        placeAt(2, 0.42);
        let under = 0, t = 2;
        for (let k = 0; k < 30 * 40 && t < T.len && !p.dead; k++) { // to the far mouth: past it, the land isn't the tunnel's
          p.invuln = 0; p.grace = 0;
          aim(t);
          G.step(1 / 30);
          t = along();
          if (Number.isFinite(G.terrain.ceilingHeight(p.pos.x, p.pos.z, p.pos.y))) under++;
        }
        const tunnel = { len: Math.round(T.len), width: Math.round(T.hw * 2), height: Math.round(T.H), dead: p.dead, reason, through: t >= T.len, underSecs: +(under / 30).toFixed(1) };
        // Nose up hard in the middle: the roof is solid rock...
        const mid = W.tunnelPoint(T, T.len / 2), noseUp = new p.quat.constructor().setFromAxisAngle(new V(1, 0, 0), 1.2);
        const pitchUp = () => { p.quat.setFromAxisAngle(new V(0, 1, 0), Math.atan2(-T.dx, -T.dz)).multiply(noseUp); p.updateAxes(); };
        reason = null;
        placeAt(T.len / 2, 0.4);
        for (let k = 0; k < 90 && !p.dead; k++) { p.invuln = 0; p.grace = 0; pitchUp(); G.step(1 / 30); }
        tunnel.roofCrash = reason;
        // ...and Ghost Mode skims it instead, staying inside.
        reason = null;
        placeAt(T.len / 2, 0.4);
        G.powerups.active.set('ghost', 10);
        let ghostOut = 0;
        for (let k = 0; k < 45 && !p.dead; k++) {
          p.invuln = 0; p.grace = 0; pitchUp(); G.step(1 / 30);
          if (!Number.isFinite(G.terrain.ceilingHeight(p.pos.x, p.pos.z, p.pos.y))) ghostOut++; // popped out of the rock?
        }
        G.powerups.active.clear();
        tunnel.ghostInside = !p.dead && ghostOut === 0;
        // Over the mountain at the same spot: its top is the ground, with no roof; inside, the bore's floor and roof.
        const top = G.terrain.surfaceHeight(mid.x, mid.z), inY = mid.floor + T.H * 0.4;
        const floorIn = G.terrain.surfaceHeight(mid.x, mid.z, inY), roofIn = G.terrain.ceilingHeight(mid.x, mid.z, inY);
        Object.assign(tunnel, { top: Math.round(top), floorIn: Math.round(floorIn), roofIn: Math.round(roofIn) });
        tunnel.rockAbove = roofIn > floorIn + 30 && top > roofIn + 20 && Math.abs(floorIn - mid.floor) < 1;
        tunnel.openOnTop = G.terrain.surfaceHeight(mid.x, mid.z, top + 30) === top && G.terrain.ceilingHeight(mid.x, mid.z, top + 30) === Infinity && G.terrain.ceilingHeight(mid.x, mid.z) === Infinity;
        // The HUD altitude over the mountain is measured to its top, not to the tunnel floor under it.
        p.pos.set(mid.x, top + 30, mid.z); p.prevPos.copy(p.pos); p.dead = false;
        p.quat.set(0, 0, 0, 1); p.updateAxes();
        p.invuln = 99;
        G.step(1 / 30);
        tunnel.hudAlt = +document.getElementById('speed').textContent.match(/ALT (\d+)/)[1];
        tunnel.hudToTop = tunnel.hudAlt === Math.round(p.pos.y - G.terrain.surfaceHeight(p.pos.x, p.pos.z)) && tunnel.hudAlt < p.pos.y - mid.floor - 50;
        out.tunnel = tunnel;
        p.crash = crash;
        p.health = hp;
        G.objectives.cooldown = cooldown;
        G.powerups.timer = puTimer;
      }
      if (z.name === 'Meteor Belt') {
        // A big asteroid shot apart breaks into smaller ones.
        const a = G.zones.asteroids;
        a.spawn(G.player.pos.clone().addScaledVector(G.player.forward, 150), 30);
        const rock = a.list[a.list.length - 1], before = a.list.length;
        rock.hp = 1;
        G.player.shootCd = 0;
        const nb = G.player.bullets.length;
        G.player.fire();
        for (const b of G.player.bullets.slice(nb)) { b.pos.copy(rock.pos); b.vel.set(0, 0, 0); }
        step(1);
        out.asteroidSplit = !a.list.includes(rock) && a.list.length >= before + 1;
      }
    }

    // Progression: score is XP; ranks and perks unlock as it grows.
    const hull = G.player.maxHealth;
    G.score = Math.max(G.score, 4000);
    step(2);
    out.level = G.progress.level;
    out.perks = G.progress.perks.length;
    out.hullGrew = G.player.maxHealth > hull || G.progress.level >= 3;
    out.score = G.score;
    out.chunks = G.terrain.chunks.size;
    return out;
  });
  // Stunts, driven by real double key presses and synthetic touch flicks on the steering stick.
  const setUp = (above) => page.evaluate((above) => {
    const G = window.G, p = G.player;
    G.enemies.spawnTimer = 1e9;
    G.enemies.list.slice().forEach((e) => G.enemies.removeEnemy(e));
    G.enemies.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
    if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
    // Also end persuasion: a leftover tailwind from an earlier objective would keep steering the plane mid-stunt.
    G.persuasion.reset(null);
    G.objectives.cooldown = 1e9;
    p.maneuverCd = 0;
    p.maneuver = null;
    p.quat.set(0, 0, 0, 1);
    p.updateAxes();
    p.pos.y = Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z), G.world.seaLevel) + above;
    G.input.lastTap = {};
    window.STUNT0 = { pos: p.pos.clone(), f: p.forward.clone(), r: p.right.clone() };
  }, above);
  const measure = () => page.evaluate(() => {
    const G = window.G, p = G.player, s0 = window.STUNT0;
    // The gesture is picked up on the next frame, so note the first stunt seen while stepping.
    let name = p.maneuver?.name || null, dodgedMidway = null;
    for (let i = 0; i < 90; i++) {
      p.invuln = 0; p.grace = 1;
      if (i === 8 && p.maneuver) { const h = p.health; p.damage(10); dodgedMidway = p.dodging ? p.health === h : null; }
      G.step(1 / 30);
      name ||= p.maneuver?.name || null;
    }
    const d = p.pos.clone().sub(s0.pos);
    return { name, back: +p.forward.dot(s0.f).toFixed(2), upright: +p.up.y.toFixed(2), climb: Math.round(d.y), side: Math.round(d.dot(s0.r)), dodgedMidway };
  });
  const flick = (dx, dy) => page.evaluate(([dx, dy]) => {
    const c = document.getElementById('game');
    const ev = (type, x, y) => {
      const t = new Touch({ identifier: 7, target: c, clientX: x, clientY: y });
      c.dispatchEvent(new TouchEvent(type, { changedTouches: [t], touches: type === 'touchend' ? [] : [t], bubbles: true, cancelable: true }));
    };
    for (let k = 0; k < 2; k++) { ev('touchstart', 150, 400); ev('touchmove', 150 + dx, 400 + dy); ev('touchend', 150 + dx, 400 + dy); }
  }, [dx, dy]);
  const keyTwice = async (key) => { await page.keyboard.press(key); await page.keyboard.press(key); };
  report.stunts = {};
  await setUp(200); await keyTwice('ArrowUp'); report.stunts.up = await measure();
  await setUp(200); await keyTwice('KeyS'); report.stunts.down = await measure();
  await setUp(200); await keyTwice('ArrowRight'); report.stunts.right = await measure();
  await setUp(200); await flick(-90, 0); report.stunts.touchLeft = await measure();
  await setUp(200); await flick(0, -90); report.stunts.touchUp = await measure();
  await setUp(20); await keyTwice('ArrowDown'); report.stunts.lowSplitS = await measure();
  await setUp(200); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(500); await page.keyboard.press('ArrowLeft'); report.stunts.slowTaps = await measure();

  // Developer menu: hold 1 + 0 for 3 s of real time. It pauses the game and swallows gameplay keys.
  const menu = () => page.evaluate(() => ({
    open: !document.getElementById('devmenu').classList.contains('hidden'), paused: window.G.paused,
    zone: window.G.zones.index, boss: window.G.objectives.current?.boss || null, type: window.G.objectives.current?.type || null,
    space: window.G.input.keys.has('Space'),
  }));
  const hold = async () => { await page.keyboard.down('Digit1'); await page.keyboard.down('Digit0'); };
  const release = async () => { await page.keyboard.up('Digit0'); await page.keyboard.up('Digit1'); };
  report.devmenu = {};
  await hold(); await page.waitForTimeout(1000); await release();
  report.devmenu.shortHold = await menu();
  // Still closed at 2 s; then wait (keys held) for the 3 s mark. A busy CI runner can fire the timer a little late.
  await hold();
  await page.waitForTimeout(2000);
  report.devmenu.earlyOpen = (await menu()).open;
  await page.waitForFunction(() => window.G.devmenu.isOpen, null, { timeout: 5000 }).catch(() => {});
  await release();
  await page.keyboard.down('Space');
  report.devmenu.opened = await menu();
  await page.keyboard.up('Space');
  await page.click('#devmenu [data-zone="3"]');
  report.devmenu.zone = await menu();
  await page.evaluate(() => window.G.devmenu.open()); // the chord path is covered above; reopen directly to keep this quick
  await page.click('#devmenu [data-boss="gooseQueen"]');
  report.devmenu.boss = await menu();
  await page.evaluate(() => window.G.devmenu.open());
  await page.click('#devmenu [data-objective="stars"]');
  report.devmenu.objective = await menu();
  await page.evaluate(() => window.G.devmenu.open());
  await page.keyboard.press('Escape');
  report.devmenu.escaped = await menu();
  // Touch chord: one finger in each top corner for 3 s. One corner alone does nothing.
  const corners = (pts) => page.evaluate((pts) => {
    const c = document.getElementById('game');
    const touch = ([x, y], i) => new Touch({ identifier: 20 + i, target: c, clientX: x, clientY: y });
    const ts = pts.map(touch), lift = !ts.length; // lift: every corner finger comes up
    c.dispatchEvent(new TouchEvent(lift ? 'touchend' : 'touchstart', { changedTouches: lift ? [[20, 20], [1004, 20]].map(touch) : ts.slice(-1), touches: ts, bubbles: true, cancelable: true }));
  }, pts);
  await corners([[20, 20]]);
  await page.waitForTimeout(3500);
  report.devmenu.oneCorner = (await menu()).open;
  await corners([[20, 20], [1004, 20]]);
  await page.waitForFunction(() => window.G.devmenu.isOpen, null, { timeout: 6000 }).catch(() => {});
  report.devmenu.touchOpened = await menu();
  await corners([]);
  report.devmenu.touchReleased = await page.evaluate(() => window.G.devmenu.since === null && window.G.input.stick.id === null);
  await page.evaluate(() => window.G.devmenu.close());

  // Secrets, part 2: each one through its real path where practical (real key presses, simulated flight, dates).
  report.secrets = secretsReport;
  const S = report.secrets;
  const keys = async (codes) => { for (const c of codes) await page.keyboard.press(c); };
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  const word = (w) => [...w].map((ch) => `Key${ch}`);
  const sec = () => page.evaluate(() => {
    const G = window.G;
    return { found: [...G.secrets.found], fanfares: G.secrets.fanfares, rainbow: G.secrets.rainbow, score: G.score, theme: G.world.propTheme, relax: G.relax };
  });
  await page.evaluate(() => { const G = window.G; G.secrets.reset(); G.zones.enter(0); G.player.god = true; });
  await page.keyboard.press('KeyP'); // paused: typing does nothing
  await keys(word('QUACK'));
  S.whilePaused = await page.evaluate(() => window.G.paused && window.G.secrets.found.size);
  await page.keyboard.press('KeyP');
  await page.evaluate(() => window.G.devmenu.open()); // dev menu open (G.input.lock): nor does the Konami code
  await keys(KONAMI);
  S.whileLocked = await page.evaluate(() => window.G.input.lock !== null && window.G.secrets.found.size);
  await page.evaluate(() => window.G.devmenu.close());
  await keys(KONAMI);
  S.konami = await sec();
  await keys(KONAMI);
  S.konamiAgain = await sec();
  await keys(word('QUACK'));
  S.quack = await sec();
  await keys(word('BOGEY'));
  S.gary = await page.evaluate(() => {
    const G = window.G, s = G.secrets, out = { found: s.found.has('gary'), flying: !!s.gary && s.garyModel.parent === G.scene, relax: G.relax };
    for (let i = 0; i < 240; i++) { G.player.invuln = 99; G.step(1 / 30); }
    out.gone = !s.gary && !s.garyModel.parent;
    return out;
  });
  const beforeHonk = await sec();
  await keys(word('GOOSE'));
  S.honk = await sec();
  await keys(word('GOOSE'));
  S.honkAgain = await sec();
  S.honkPoints = [S.honk.score - beforeHonk.score, S.honkAgain.score - S.honk.score];
  S.afterWords = { relax: S.honkAgain.relax, paused: await page.evaluate(() => window.G.paused) };
  S.wordsSafe = await page.evaluate(async () => { const m = await import('./src/secrets.js'); return Object.keys(m.WORDS).filter((w) => m.TOGGLE_LETTERS.test(w)); });
  S.feats = await page.evaluate(async () => {
    const G = window.G, p = G.player, s = G.secrets, out = {};
    const { ZONES } = await import('./src/zones.js');
    const step = (n, before) => { for (let i = 0; i < n; i++) { p.invuln = 99; before(); G.step(1 / 30); } };
    // Edge of space: way up high counts in an ordinary zone, not in space.
    G.zones.enter(ZONES.findIndex((z) => z.name === 'Low Orbit'));
    step(5, () => { p.pos.y = 1200; });
    out.edgeInSpace = s.found.has('edge');
    G.zones.enter(0);
    step(5, () => { p.pos.y = 1200; });
    out.edge = s.found.has('edge');
    // Lawnmower: 3+ s just above the ground. Upright doesn't count; upside down does.
    const skim = (inverted) => () => {
      if (inverted) { p.quat.set(0, 0, 1, 0); p.updateAxes(); } // rolled 180° about the nose
      else { p.quat.identity(); p.updateAxes(); }
      const x = p.pos.x + p.forward.x * p.speed / 30, z = p.pos.z + p.forward.z * p.speed / 30; // where this step ends
      p.pos.y = Math.max(G.terrain.surfaceHeight(x, z), G.world.seaLevel) + 2.5;
    };
    step(110, skim(false));
    out.mowUpright = s.found.has('lawnmower');
    step(60, skim(true));
    out.mowEarly = s.found.has('lawnmower'); // 2 s isn't enough
    step(50, skim(true));
    out.lawnmower = s.found.has('lawnmower');
    p.quat.identity(); p.updateAxes(); p.pos.y += 100;
    // Dates (boot checks today; any date can be passed in).
    out.plainDay = s.checkDate(new Date(2026, 6, 14));
    s.checkDate(new Date(2025, 9, 31));
    out.halloween = { found: s.found.has('halloween'), sky: G.sky.preset, weather: G.sky.weather.type, theme: G.world.propTheme };
    s.checkDate(new Date(2025, 11, 25));
    out.christmas = { found: s.found.has('christmas'), weather: G.sky.weather.type };
    const rank = G.progress.rank;
    s.checkDate(new Date(2026, 3, 1));
    G.step(1 / 30);
    out.april = { found: s.found.has('aprilFools'), rank: G.progress.rank, rankChanged: G.progress.rank !== rank, label: document.getElementById('score-label').textContent, hud: document.getElementById('rank').textContent };
    s.trigger('tinkerer'); // its real path (7 title clicks) ran before take-off
    out.list = s.list().length;
    out.all = s.list().every((x) => x.found);
    try { out.stored = JSON.parse(localStorage.getItem('landed.secrets')).length; } catch { out.stored = 0; }
    return out;
  });
  // Found secrets survive a reload. The reload pretends it's April 1, so the boot-time date check runs too.
  await page.clock.setFixedTime(new Date('2026-04-01T10:00:00'));
  await page.reload();
  await page.waitForFunction(() => window.G && window.G.secrets, null, { timeout: 30000 });
  S.reloaded = await page.evaluate(() => ({
    found: window.G.secrets.found.size, holiday: window.G.secrets.holiday, logo: document.getElementById('logo').textContent,
    rank: window.G.progress.rank, count: document.getElementById('secrets-count').textContent,
  }));

  console.log(JSON.stringify(report, null, 2));

  const checks = [
    [report.firstObjective === 'hoop', 'first objective is a hoop'],
    [report.musicPlaying && report.engineGain < 0.01, 'calm music plays and the engine stays quiet'],
    [report.persuasionStages >= 10, 'persuasion escalated through its stages'],
    [report.completedAfterTrophy === 1, 'participation trophy completed the objective'],
    [report.bossDefeated, 'boss can be defeated'],
    [report.firstBossGap >= 4 && report.firstBossGap <= 7 && report.nextBossGap >= 4 && report.nextBossGap <= 7, 'bosses come every 4 to 7 objectives'],
    [report.chunks > 20, 'terrain is loaded'],
    [report.bossDroppedPowerup, 'boss drops a power-up'],
    [report.objectiveTypes >= 38, 'all objective types are on the menu (38+)'],
    [report.quests.roll && report.quests.halfRollIgnored, 'barrel roll quest: real rolls count, an Immelmann\'s half roll does not'],
    [report.quests.rollAnyDt, 'barrel roll quest: each roll counts once at any frame rate (dt 0.0349, 1/60, 0.0371)'],
    [report.quests.delivery && report.quests.deliveryStages, 'pizza delivery: pick up, the pizza cools, deliver to the drop-off'],
    [report.quests.constellation && report.quests.constellationOrder, 'constellation: stars only count in order, and joining them all completes it'],
    [report.quests.starClear, 'a falling star never starts inside the ground (born over a hill, it would fizzle uncatchably)'],
    [report.quests.meteors && report.quests.photo, 'falling stars can be caught, and the shy whale can be photographed'],
    [report.landing.landed && !report.landing.dead && report.landing.grade && report.landing.sink < 7 && report.landing.points > 0, 'landing: a gentle, level descent onto flat ground lands, graded, with a bonus'],
    [report.landing.done, 'landing objective: touch down on the runway and roll along it to complete it'],
    [report.takeoff.airborne && report.takeoff.lifted > 0 && report.takeoff.climb > 5, 'landing: pulling up on the ground takes off and climbs away'],
    [report.hop.landed && report.hop.points === 0, 'landing: hopping straight back down earns no bonus'],
    [report.diveCrash === 'ground' && report.waterCrash.reason === 'water' && !report.waterCrash.landed, 'landing: a steep dive onto flat ground still crashes, and so does settling onto water'],
    [report.ghostLanded === false, 'landing: Ghost Mode skims the ground instead of landing'],
    [report.pads.landed && /🌾 0\.0 \//.test(report.pads.dusting), 'landing: taxiing on the ground is not crop dusting'],
    [report.pads.groundKept && report.pads.whileRolling === 1 && report.pads.max === 1 && report.pads.after === 0, 'runways that end flatten no ground for good: only under a plane rolling on it, gone once it leaves'],
    [Object.keys(report.bosses).length >= 15, 'at least 15 bosses'],
    [Object.entries(report.bosses).every(([k, b]) => b.done && b.attacks > 0 && b.spawned === k), 'every boss attacks and can be defeated'],
    [Object.keys(report.leadBosses).length >= 3 && Object.values(report.leadBosses).every((b) => b.ahead >= 0.75 && b.attacks > 0), 'lead bosses stay in front of the player and attack'],
    [report.twins.count === 2 && report.twins.halfDone && report.twins.done && report.twins.name.startsWith('Turbo'), 'boss twins with a modifier both have to go down'],
    [!report.relax.objective && report.relax.enemies === 0 && report.relax.pickups === 0 && report.relax.bodyClass && report.relax.panelHidden, 'Relax mode clears objectives, enemies and pickups'],
    [report.relax.backObjective === 'boss', 'leaving relax mode brings back the interrupted boss'],
    [report.longestPowerup >= 45, 'power-ups last longer'],
    [report.weakPointDamage === report.weakPointExpected, 'weak points multiply damage'],
    [report.gondolaStopsBombs && report.cannonDisarmed, 'breaking a part disables that attack'],
    [report.droneFalling && report.droneCrashed, 'a drone that loses its rotors falls and crashes'],
    [report.pickupSpawned && report.pickupCollected, 'power-up spawns ahead and can be collected'],
    [report.powerupsActiveMidway >= 10 && report.powerupsActiveAfterAMinute === 0, 'every power-up runs, then wears off'],
    [report.bulletCrater > 1 && report.orbCrater > 1, 'bullets and orbs that hit the ground leave craters'],
    [report.zoneAdvanced, 'completing objectives advances to the next zone'],
    [report.zones.length >= 28, 'every zone loads (28+)'],
    [(({ city: c }) => c && c.meshes > 10 && c.tallest >= 100 && c.buildings > 200 && c.roof - c.street >= 40 && c.sheer && c.deterministic)(report), 'Metropolis: a street grid of buildings (towers 100 m+), roofs are ground with sheer walls, same seed same city'],
    [(({ city: c }) => c && c.wallCrash === 'ground' && c.ghostOnRoof)(report), 'Metropolis: flying into a tower wall crashes (Ghost Mode skims onto the roof)'],
    [(({ city: c }) => c && c.avenue.lowflyDone && !c.avenue.dead && c.avenue.maxAlt < 30 && c.lowflyStarted && c.buried.length === 0)(report), 'Metropolis: crop-dusting down an avenue works, and air objectives stay out of the buildings'],
    [(({ city: c }) => c && Object.keys(c.props).length >= 10 && ['car', 'streetLamp', 'trafficLight'].every((t) => c.props[t] > 0) && ['waterTower', 'antenna', 'helipad'].some((t) => c.props[t] > 0) && c.misplaced.length === 0)(report), 'Metropolis: city props are instanced, traffic on the streets, rooftop props on the roofs'],
    [['picnicTable', 'tractor', 'camperVan', 'skiLift'].every((t) => report.countrySeen[t] > 0), 'new countryside, desert and snow props turn up in their zones'],
    [(() => { const c = report.zones.find((z) => z.name === 'Crystal Caverns'); return c && c.gap >= 55 && c.planeUnderRoof && report.caveObjective.underRoof; })(), 'the cave has a roof, and the plane and objectives stay under it'],
    [report.zones.filter((z) => z.name !== 'Crystal Caverns' && z.name !== 'Sunken Reef').every((z) => z.roof === null), 'only the cave has a roof (and the reef, see below)'],
    [(({ underwater: u }, r) => r && r.roof === r.sea - 4 && r.planeUnderRoof && !u.dead && u.pressedSecs >= 1 && u.maxY < u.sea && u.aboveSurface.length === 0 && u.hues >= 6)(report, report.zones.find((z) => z.name === 'Sunken Reef')), 'underwater: the surface is the roof, the plane and objectives stay under it, and the seabed is colourful'],
    [report.zones.find((z) => z.name === 'Planet Pebble').curve > 1 && report.zones[0].curve < 0.5, 'Planet Pebble curves the horizon (and nothing else does)'],
    [(({ axisCurve: k, axis: a }) => k < -1 && a[0] === 1 && a[1] === 0)(report.zones.find((z) => z.name === 'Ringworld')), 'Ringworld bends the ground up, across one axis only'],
    [report.zones.filter((z, i) => z.name !== 'Ringworld' && report.zones[i - 1]?.name !== 'Ringworld').every((z) => Math.abs(z.axisCurve) < 0.05), 'no other zone bends across an axis'],
    [(({ tunnel: t }) => t && !t.dead && t.through && t.underSecs >= 2)(report), 'Hollow Peaks: the plane flies clean through a tunnel in the mountains'],
    [(({ tunnel: t }) => t && t.roofCrash === 'roof' && t.ghostInside)(report), 'Hollow Peaks: the tunnel roof is solid (Ghost Mode skims it instead)'],
    [(({ tunnel: t }) => t && t.rockAbove && t.openOnTop && t.hudToTop)(report), 'Hollow Peaks: above a tunnel, the mountain top is the ground (open sky, HUD altitude to the top)'],
    [report.zones.filter((z) => /Orbit|Meteor/.test(z.name)).every((z) => z.ground < -500), 'space zones put the ground far below'],
    [report.zones.find((z) => z.name === 'Meteor Belt').asteroids >= 30 && report.asteroidSplit, 'the meteor belt is full of asteroids that split when shot'],
    [report.level >= 5 && report.perks === report.level - 1, 'levelling up grants a perk per level'],
    [(({ up: s }) => s.name === 'Immelmann' && s.back < -0.9 && s.upright > 0.9 && s.climb > 15)(report.stunts), 'double-tap up: Immelmann turns you back and up'],
    [(({ down: s }) => s.name === 'Split-S' && s.back < -0.9 && s.upright > 0.9 && s.climb < -15)(report.stunts), 'double-tap down: Split-S turns you back and down'],
    [(({ right: s }) => s.name === 'Barrel roll' && s.back > 0.95 && s.upright > 0.9 && s.side > 18 && s.dodgedMidway === true)(report.stunts), 'double-tap right: barrel roll slides right, dodging hits'],
    [(({ touchLeft: s, touchUp: u }) => s.name === 'Barrel roll' && s.side < -18 && u.name === 'Immelmann')(report.stunts), 'two touch flicks trigger stunts'],
    [!report.stunts.lowSplitS.name && !report.stunts.slowTaps.name, 'no Split-S near the ground, and slow taps are not a double tap'],
    [!report.devmenu.shortHold.open && !report.devmenu.shortHold.paused, 'dev menu: a 1 s hold of 1 + 0 does nothing'],
    [!report.devmenu.earlyOpen && report.devmenu.opened.open && report.devmenu.opened.paused && !report.devmenu.opened.space, 'dev menu: holding 1 + 0 for 3 s (not 2) opens it, pauses, and swallows gameplay keys'],
    [!report.devmenu.zone.open && !report.devmenu.zone.paused && report.devmenu.zone.zone === 3, 'dev menu: a zone button enters that zone'],
    [report.devmenu.boss.boss === 'gooseQueen' && report.devmenu.objective.type === 'stars', 'dev menu: boss and objective buttons start them'],
    [!report.devmenu.escaped.open && !report.devmenu.escaped.paused, 'dev menu: Esc closes it and play resumes'],
    [!S.sixClicks && S.title.found && S.title.rolled && /Secret found: Title Tinkerer \(1\/10\)/.test(S.title.toast) && /Secrets: 1\/10/.test(S.title.count), 'secrets: 7 clicks on the title (not 6) find one, with a toast and the title card counter'],
    [S.whilePaused === 0 && S.whileLocked === 0, 'secrets: typed words and the Konami code are ignored while paused or in the dev menu'],
    [S.konami.found.includes('konami') && S.konami.rainbow > 25 && S.konamiAgain.fanfares === S.konami.fanfares && S.konamiAgain.rainbow > 25, 'secrets: the Konami code turns on rainbow mode; re-entering it replays without a new fanfare'],
    [S.quack.found.includes('quack') && S.quack.theme === 'duck', 'secrets: typing QUACK starts The Duckening'],
    [S.gary.found && S.gary.flying && S.gary.gone, 'secrets: typing BOGEY sends Gary on a harmless flyby that ends'],
    [S.honk.found.includes('honk') && S.honkPoints[0] >= 50 && S.honkPoints[1] < 50 && S.honkAgain.fanfares === S.honk.fanfares, 'secrets: typing GOOSE pays golden points once per flight'],
    [S.wordsSafe.length === 0 && !S.gary.relax && !S.afterWords.relax && !S.afterWords.paused, 'secrets: no secret word contains a toggle key (R N M P I), so typing them leaves Relax Mode and pause alone'],
    [!S.feats.edgeInSpace && S.feats.edge, 'secrets: edge of space counts very high up in an ordinary zone, not in space'],
    [!S.feats.mowUpright && !S.feats.mowEarly && S.feats.lawnmower, 'secrets: lawnmower needs 3 s upside down just above the ground'],
    [S.feats.plainDay === null && S.feats.halloween.found && S.feats.halloween.sky === 'halloween' && S.feats.halloween.weather === 'spooky' && S.feats.halloween.theme === 'spooky', 'secrets: Halloween dresses the world up (sky, bats, spooky props); ordinary days do nothing'],
    [S.feats.christmas.found && S.feats.christmas.weather === 'snow', 'secrets: Christmas brings snow'],
    [S.feats.april.found && S.feats.april.rankChanged && S.feats.april.hud === S.feats.april.rank && S.feats.april.label === 'POINTZ', 'secrets: April 1 renames the ranks and the HUD'],
    [S.feats.list === 10 && S.feats.all && S.feats.stored === 10, 'secrets: all 10 found and saved in localStorage'],
    [S.reloaded.found === 10 && S.reloaded.holiday === 'aprilFools' && S.reloaded.logo === 'Crashed' && /Secrets: 10\/10/.test(S.reloaded.count), 'secrets: found secrets survive a reload, and the boot date check runs (April 1)'],
    [!report.devmenu.oneCorner && report.devmenu.touchOpened.open && report.devmenu.touchOpened.paused && report.devmenu.touchReleased, 'dev menu: touching both top corners for 3 s opens it (one corner does not)'],
  ];
  for (const [ok, label] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failed = true; }
} catch (e) {
  errors.push(`test: ${e.stack || e.message}`);
} finally {
  await browser.close();
  server.close();
}

if (errors.length) { console.error('Errors:\n' + errors.join('\n')); failed = true; }
if (failed) process.exit(1);
console.log('Smoke test passed.');
