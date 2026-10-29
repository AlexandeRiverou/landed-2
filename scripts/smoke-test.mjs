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
  await page.evaluate(async () => { window.POWERUPS_FOR_TEST = (await import('./src/powerups.js')).POWERUPS; });

  const report = await page.evaluate(() => {
    const G = window.G;
    const step = (n) => { for (let i = 0; i < n; i++) { G.player.invuln = 99; G.step(1 / 30); } };
    const out = {};
    step(150);
    out.firstObjective = G.objectives.current?.type;

    // Ignore the objective until persuasion gives up and awards the participation trophy.
    let stages = 0;
    for (let k = 0; k < 40 && G.objectives.completed === 0; k++) { G.persuasion.neglect = 1e4; step(2); stages = Math.max(stages, G.persuasion.stage); }
    out.persuasionStages = stages;
    out.completedAfterTrophy = G.objectives.completed;

    // Every objective type once, then completed normally (each triggers world mutations).
    const types = ['hoop', 'chain', 'tiny', 'timed', 'stars', 'balloons', 'goose', 'loop', 'lowfly', 'altitude', 'buzz', 'hunt', 'gate'];
    for (const t of types) {
      step(150);
      if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
      G.objectives.completed = 1;
      G.objectives.recent = types.filter((x) => x !== t);
      G.objectives.next();
      if (G.objectives.current.type !== t) throw new Error(`expected objective ${t}, got ${G.objectives.current.type}`);
      step(30);
      G.objectives.complete(false);
    }
    step(150);

    // A boss fight: fly at the boss with guns blazing until it falls.
    if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
    G.objectives.completed = 4;
    G.objectives.next();
    const boss = G.enemies.list.find((e) => e.boss);
    if (!boss) throw new Error('boss did not spawn');
    G.input.keys.add('Space');
    for (let i = 0; i < 30 * 120 && !boss.dead; i++) { G.player.grace = 1; G.player.nudgeToward(boss.pos, 6, 1 / 30); step(1); }
    G.input.keys.delete('Space');
    out.bossDefeated = boss.dead;
    step(10);
    out.bossDroppedPowerup = G.powerups.pickups.length > 0;

    // Power-ups: a pickup spawns ahead, flying into it activates it, and every type runs and expires.
    G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
    G.powerups.timer = 0;
    step(2);
    const pickup = G.powerups.pickups[0];
    out.pickupSpawned = !!pickup;
    if (pickup) { G.player.pos.copy(pickup.pos); step(2); }
    out.pickupCollected = G.powerups.active.size > 0 || G.player.health === G.player.maxHealth;
    for (const id of Object.keys(window.POWERUPS_FOR_TEST || {})) { G.powerups.activate(id); }
    G.input.keys.add('Space');
    step(30 * 5);
    G.input.keys.delete('Space');
    out.powerupsActiveMidway = G.powerups.active.size;
    step(30 * 60);
    out.powerupsActiveAfterAMinute = G.powerups.active.size;

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
    [report.persuasionStages >= 10, 'persuasion escalated through its stages'],
    [report.completedAfterTrophy === 1, 'participation trophy completed the objective'],
    [report.bossDefeated, 'boss can be defeated'],
    [report.chunks > 20, 'terrain is loaded'],
    [report.bossDroppedPowerup, 'boss drops a power-up'],
    [report.pickupSpawned && report.pickupCollected, 'power-up spawns ahead and can be collected'],
    [report.powerupsActiveMidway >= 10 && report.powerupsActiveAfterAMinute === 0, 'every power-up runs, then wears off'],
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
