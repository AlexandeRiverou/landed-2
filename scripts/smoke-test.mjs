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
  await page.click('#start');
  await page.evaluate(async () => {
    window.POWERUPS_FOR_TEST = (await import('./src/powerups.js')).POWERUPS;
    window.OBJ_FOR_TEST = await import('./src/objectives.js');
    window.BOSSES_FOR_TEST = (await import('./src/enemies.js')).BOSSES;
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
    const { CURVE } = await import('./src/curve.js');
    for (let i = 0; i < zoneCount; i++) {
      G.zones.enter(i);
      step(90);
      const z = G.zones.current, pp = G.player.pos;
      const ground = G.terrain.surfaceHeight(pp.x, pp.z), roof = G.terrain.ceilingHeight(pp.x, pp.z);
      out.zones.push({
        name: z.name, ground: Math.round(ground), asteroids: G.zones.asteroids.list.length,
        roof: Number.isFinite(roof) ? Math.round(roof) : null, gap: Number.isFinite(roof) ? Math.round(roof - ground) : null,
        planeUnderRoof: pp.y < roof, curve: +(CURVE.value * 1e4).toFixed(2),
      });
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
    [report.objectiveTypes >= 28, 'all objective types are on the menu'],
    [Object.keys(report.bosses).length >= 12, 'at least 12 bosses'],
    [Object.entries(report.bosses).every(([k, b]) => b.done && b.attacks > 0 && b.spawned === k), 'every boss attacks and can be defeated'],
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
    [report.zones.length >= 20, 'every zone loads (20+)'],
    [(() => { const c = report.zones.find((z) => z.name === 'Crystal Caverns'); return c && c.gap >= 55 && c.planeUnderRoof && report.caveObjective.underRoof; })(), 'the cave has a roof, and the plane and objectives stay under it'],
    [report.zones.filter((z) => z.name !== 'Crystal Caverns').every((z) => z.roof === null), 'only the cave has a roof'],
    [report.zones.find((z) => z.name === 'Planet Pebble').curve > 1 && report.zones[0].curve < 0.5, 'Planet Pebble curves the horizon (and nothing else does)'],
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
