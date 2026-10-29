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
    const { OBJECTIVE_TYPES: types, BOSS_EVERY } = window.OBJ_FOR_TEST;
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
    G.objectives.completed = BOSS_EVERY;
    G.objectives.bossDeck = ['kingDrone'];
    G.objectives.next();
    const boss = G.enemies.list.find((e) => e.boss);
    if (!boss) throw new Error('boss did not spawn');
    // Count drops directly: the plane is usually close enough to grab the drop the moment the boss dies.
    let drops = 0;
    const drop = G.powerups.drop.bind(G.powerups);
    G.powerups.drop = (...args) => { drops++; return drop(...args); };
    G.input.keys.add('Space');
    for (let i = 0; i < 30 * 120 && !boss.dead; i++) { G.player.grace = 1; G.player.nudgeToward(boss.pos, 6, 1 / 30); step(1); }
    G.input.keys.delete('Space');
    out.bossDefeated = boss.dead;
    out.bossDroppedPowerup = drops === 1;
    G.powerups.drop = drop;
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
    for (let i = 0; i < zoneCount; i++) {
      G.zones.enter(i);
      step(90);
      const z = G.zones.current;
      out.zones.push({ name: z.name, ground: Math.round(G.terrain.surfaceHeight(G.player.pos.x, G.player.pos.z)), asteroids: G.zones.asteroids.list.length });
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
  console.log(JSON.stringify(report, null, 2));

  const checks = [
    [report.firstObjective === 'hoop', 'first objective is a hoop'],
    [report.musicPlaying && report.engineGain < 0.01, 'calm music plays and the engine stays quiet'],
    [report.persuasionStages >= 10, 'persuasion escalated through its stages'],
    [report.completedAfterTrophy === 1, 'participation trophy completed the objective'],
    [report.bossDefeated, 'boss can be defeated'],
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
    [report.zones.length >= 10, 'every zone loads'],
    [report.zones.filter((z) => /Orbit|Meteor/.test(z.name)).every((z) => z.ground < -500), 'space zones put the ground far below'],
    [report.zones.find((z) => z.name === 'Meteor Belt').asteroids >= 30 && report.asteroidSplit, 'the meteor belt is full of asteroids that split when shot'],
    [report.level >= 5 && report.perks === report.level - 1, 'levelling up grants a perk per level'],
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
