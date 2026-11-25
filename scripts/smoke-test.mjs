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

// Repeatable randomness. The game rolls Math.random for everything: the world seed at boot, every zone's new landscape,
// enemy spawns, objective picks, power-ups. With real randomness each run flew a different world, so a check that
// needs, say, a cave dome ahead or dry land under the X failed now and then, a different one each run. In the test,
// Math.random is a seeded generator instead, and it is seeded again at the start of every page.evaluate (a different
// seed each call, worked out from the run's seed, the page and the call's number), so frames that run between two
// calls in real time can't shift the rolls the next check sees. SMOKE_SEED=<n> flies another world; SMOKE_SEED=random
// picks one and prints it, so a failure it finds can be replayed.
const SEED = process.env.SMOKE_SEED === 'random' ? (Math.random() * 2 ** 32) >>> 0 : (Number(process.env.SMOKE_SEED) || 20261124) >>> 0;
console.log(`Smoke test seed: ${SEED} (replay with SMOKE_SEED=${SEED})`);
const mix = (...xs) => { let h = 0x811c9dc5; for (const x of xs) { h = Math.imul(h ^ (x >>> 0), 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; } return h >>> 0; };
let pages = 0;
const seedRandom = async (page) => {
  const pageNo = ++pages;
  await page.addInitScript((s) => {
    let a = s >>> 0;
    const rand = () => { // mulberry32
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    Object.defineProperty(Math, 'random', { value: rand, writable: true, configurable: true });
    Object.defineProperty(window, '__smokeSeed', { value: (n) => { a = n >>> 0; } });
    // A second stream for code whose rolls are paced by a real clock (the music picks its next notes by the audio
    // clock): wrapped with __smokeAside, it rolls from this one, so how fast the machine ran can't shift the main stream.
    let b = (s ^ 0x9e3779b9) >>> 0;
    const aside = () => {
      b = (b + 0x6d2b79f5) | 0;
      let t = Math.imul(b ^ (b >>> 15), 1 | b);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const asideCall = (f, self, args) => { const main = Math.random; Math.random = aside; try { return f.apply(self, args); } finally { Math.random = main; } };
    Object.defineProperty(window, '__smokeAside', {
      value: (obj, name) => { const f = obj[name]; obj[name] = function (...args) { return asideCall(f, this, args); }; },
    });
    // Timers fire on real time too (a boss's follow-up orbs, firework bursts, the opening tips): they roll aside.
    const setT = window.setTimeout.bind(window);
    window.setTimeout = (cb, ms, ...rest) => (typeof cb === 'function' ? setT((...x) => asideCall(cb, window, x), ms, ...rest) : setT(cb, ms, ...rest));
    // Held frames: while F.hold is set, the game's requestAnimationFrame callbacks wait (no real-time step or render),
    // so only the test's own G.step calls move the world. F.onStart (a seed) holds them from the Fly click on, and
    // reseeds just before the game's own click handler rolls the first flight.
    const F = { hold: false, onStart: null };
    Object.defineProperty(window, '__smokeFrames', { value: F });
    const raf = window.requestAnimationFrame.bind(window);
    // Real-time frames step the game by however much time passed, so whatever they roll comes from the side stream.
    window.requestAnimationFrame = (cb) => raf(function tick(t) { if (F.hold) raf(tick); else asideCall(cb, window, [t]); });
    document.addEventListener('click', (e) => {
      if (F.onStart === null || !e.target?.closest?.('#start')) return;
      a = F.onStart >>> 0;
      F.onStart = null;
      F.hold = true;
    }, true);
  }, mix(SEED, pageNo, 0));
  // page.evaluate(fn, arg) runs `async (arg) => { reseed; return fn(arg) }` instead: one call, so no frame can come
  // between the reseed and the check. Playwright sends String(fn) to the page, so the wrapper only needs its text.
  const evaluate = page.evaluate.bind(page);
  let call = 0;
  page.evaluate = (fn, arg) => {
    if (typeof fn !== 'function') return evaluate(fn, arg);
    const src = `async (arg) => { window.__smokeSeed?.(${mix(SEED, pageNo, ++call)}); return (${fn.toString()})(arg); }`;
    const wrapped = () => {};
    wrapped.toString = () => src;
    return evaluate(wrapped, arg);
  };
};

try {
  // Every page records page and console errors, and gets no network beyond the local server.
  const guard = async (page) => {
    await seedRandom(page);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // External requests are blocked on purpose (see below); only local failures count.
      if (m.text().startsWith('Failed to load resource') && !(m.location().url || '').startsWith(origin)) return;
      errors.push(`console: ${m.text()}`);
    });
    // The release must not depend on the network (the web font is optional and has a fallback).
    await page.route('**/*', (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
    return page;
  };
  const page = await guard(await browser.newPage({ viewport: { width: 1024, height: 640 } }));

  await page.goto(origin + '/');
  await page.waitForFunction(() => window.G && window.G.terrain.chunks.size > 20, null, { timeout: 30000 });
  await page.evaluate(() => { window.G.finds.off = true; }); // no surprise hidden finds while other systems are measured
  // Crater and runway-pad rebuilds stop once DIRTY_MS of wall-clock time is spent in a pass (terrain.js update), and the
  // ground height checks read comes from the rebuilt chunks. So a slow or busy CI machine rebuilt fewer chunks per step
  // and the same simulated flight met different ground ("runways that end flatten no ground for good" and anything
  // that shot the ground first). In the test, the clock stands still during terrain.update, so each pass rebuilds its
  // full DIRTY_MAX chunks whatever the machine's speed; the cap on chunks per pass is the game's own. Likewise the
  // music, which rolls Math.random whenever the audio clock (real time) says the next note is due, rolls from a side
  // stream, so it can't shift the rolls the simulation sees.
  await page.evaluate(() => {
    const T = window.G.terrain, update = T.update.bind(T);
    T.update = (...args) => {
      // Whatever performance.now is right now (Playwright's fake clock replaces it later on), put back afterwards.
      const had = Object.getOwnPropertyDescriptor(performance, 'now'), t = performance.now();
      try { Object.defineProperty(performance, 'now', { value: () => t, configurable: true, writable: true }); } catch { return update(...args); }
      try { return update(...args); } finally { if (had) Object.defineProperty(performance, 'now', had); else delete performance.now; }
    };
    window.__smokeAside(window.G.audio, 'update'); // the music rolls its notes when the audio clock says it's time
    // The Autumn Woods' windmill (land 2, flown through by many early checks) stays out of them until its own check sets
    // __smokeMill, like the hidden finds above: no tower in the way of a boss fight, no rolls taken from the stream those
    // checks were tuned on. Once on, it rolls its spot and its leaves aside.
    const SP = window.G.zones.setPieces, updateMill = SP.updateMill;
    SP.updateMill = function (dt) { if (window.__smokeMill) return updateMill.call(this, dt); };
    for (const k of ['placeMill', 'updateMill']) window.__smokeAside(SP, k);
  });
  // The first gift shows up within 25 s of a fresh flight (was 40 s), so new players meet power-ups early.
  const firstPowerupTimer = await page.evaluate(() => {
    const t = window.G.powerups.timer;
    window.G.powerups.timer = 40; // the checks below were timed with the old 40 s first gift; keep them measuring what they did
    return t;
  });
  // In a browser (no desktop bridge) the desktop-only Quit / Fullscreen buttons stay hidden.
  const desktopShown = () => [...document.querySelectorAll('.desktop-row, .desktop-quit, .desktop-fs')].filter((el) => el.getClientRects().length).length;
  const browserDesktop = { count: await page.evaluate(() => document.querySelectorAll('.desktop-quit').length), shown: await page.evaluate(desktopShown) };
  // Title card rows: keyboard rows with a mouse, touch rows on a phone (the phone side is in the phone HUD context below).
  const titleRows = () => ({
    touch: document.querySelector('#title .touch-rows').getClientRects().length > 0,
    keys: [...document.querySelectorAll('#title .controls > div')].some((d) => d.textContent.includes('W / ↑') && d.getClientRects().length > 0),
  });
  const desktopTitleRows = await page.evaluate(titleRows);
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
  // From the Fly click until the long simulated report below is done, real-time frames are held: how many ran between
  // the click and the report changed where the plane was, and so what ground lay under each check (a drone placed
  // 120 m ahead sometimes sat inside a hill). The report steps the simulation itself.
  await page.evaluate((s) => { window.__smokeFrames.onStart = s; }, mix(SEED, 0xf1, 0));
  await page.click('#start');
  await page.evaluate(async () => {
    window.POWERUPS_FOR_TEST = (await import('./src/powerups.js')).POWERUPS;
    window.OBJ_FOR_TEST = await import('./src/objectives.js');
    window.BOSSES_FOR_TEST = (await import('./src/enemies.js')).BOSSES;
    window.BOSS_MOVES_FOR_TEST = (await import('./src/bossmoves.js')).MOVES;
    window.MINE_FOR_TEST = (await import('./src/enemies.js')).MINE;
    window.TOAD_FEET_FOR_TEST = (await import('./src/models.js')).TOAD_FEET;
    window.QUESTS_FOR_TEST = await import('./src/quests.js');
    window.WORLD_FOR_TEST = await import('./src/world.js');
  });

  // A run starts with three lives, shown as hearts on the HUD.
  const livesAtStart = await page.evaluate(() => { window.G.step(1 / 30); return { lives: window.G.player.lives, hearts: document.getElementById('lives').textContent, over: window.G.gameOver }; });

  const report = await page.evaluate(async () => {
    const G = window.G;
    const step = (n) => { for (let i = 0; i < n; i++) { G.player.invuln = 99; G.step(1 / 30); } };
    const out = {};
    // Lives aren't what these checks are about (several crash on purpose): spare planes until the lives checks near the end.
    G.player.lives = 1e6;
    step(150);
    out.firstObjective = G.objectives.current?.type;
    out.musicPlaying = !!G.audio.music && G.audio.music.chordIndex > 0;
    out.engineGain = G.audio.engGain ? G.audio.engGain.gain.value : 0;
    out.musicSection = G.audio.music?.section && { ...G.audio.music.section, motif: undefined };

    // Music variation: every zone's mood exists, each mood has 3+ four-chord progressions, and rolling 300
    // sections never repeats a progression back to back, uses 3+ textures, and keys stay one small step from home.
    {
      const { MOODS, PADS, pickSection } = await import('./src/music.js');
      const { ZONES } = await import('./src/zones.js');
      const res = (out.music = { missing: ZONES.filter((z) => !MOODS[z.mood]).map((z) => z.name), moods: Object.keys(MOODS).length, bad: [] });
      for (const [name, m] of Object.entries(MOODS)) {
        if (m.progs.length < 3 || m.progs.some((p) => p.length !== 4 || p.some((c) => c.length !== 4))) res.bad.push(`${name}: progressions`);
        if (m.pads.length < 2 || m.pads.some((p) => !PADS[p])) res.bad.push(`${name}: pads`);
        let s = pickSection(name, null);
        if (s.progression !== 0 || s.shift !== 0 || s.pad !== 'home') res.bad.push(`${name}: signature section`);
        const textures = new Set([s.texture]);
        let keyChanges = 0;
        for (let i = 0; i < 300; i++) {
          const n = pickSection(name, s);
          if (n.progression === s.progression) res.bad.push(`${name}: progression repeated`);
          if (![0, 2, -2, 5, -5].includes(n.shift) || (s.shift && n.shift && n.shift !== s.shift)) res.bad.push(`${name}: key wandered ${s.shift} -> ${n.shift}`);
          if (n.root !== m.root + n.shift) res.bad.push(`${name}: root`);
          if (n.shift !== s.shift) keyChanges++;
          textures.add(n.texture);
          s = n;
        }
        if (textures.size < 3) res.bad.push(`${name}: only ${textures.size} textures`);
        if (!keyChanges) res.bad.push(`${name}: never changed key`);
      }
      res.bad = [...new Set(res.bad)];
    }

    // Persuasion pacing: however much neglect piles up, tactics come at least 15 s of real time apart.
    {
      const s0 = G.persuasion.stage;
      for (let k = 0; k < 150; k++) { G.persuasion.neglect = 1e4; step(1); } // 5 s
      out.persuasionPaced = G.persuasion.stage - s0;
    }

    // Ignore the objective until persuasion gives up and awards the participation trophy (skipping the cooldown).
    let stages = 0;
    for (let k = 0; k < 40 && G.objectives.completed === 0; k++) { G.persuasion.neglect = 1e4; G.persuasion.lastEscalate = -1e4; step(2); stages = Math.max(stages, G.persuasion.stage); }
    out.persuasionStages = stages;
    out.completedAfterTrophy = G.objectives.completed;

    // Persuasion, every tactic: applied to a live hoop, run for a bit, then cleaned up by reset(). Nothing it put in
    // the scene or on the objective card may stay behind, and the camera, wind and edge arrow go back to normal.
    {
      const { TACTICS } = await import('./src/persuasion.js');
      const P = G.persuasion, p = G.player, card = document.getElementById('objective');
      const hoop = () => {
        if (G.objectives.current) G.objectives.current.dispose(G);
        G.objectives.current = null;
        G.objectives.startType('hoop');
        return G.objectives.current;
      };
      let obj = hoop();
      const cardKids = card.childElementCount, added = [], add = G.scene.add;
      const res = (out.tactics = { total: TACTICS.length, applied: 0, skipped: [], errors: [], peeked: false, hudLine: false });
      for (const t of TACTICS) {
        if (G.objectives.current !== obj) obj = hoop(); // a teleported hoop may have been flown through
        P.reset(obj);
        if (!t.can(obj, P)) { res.skipped.push(t.id); continue; } // e.g. hints: the hoop has none
        p.pos.y = p.prevPos.y = Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z), G.world.seaLevel) + 200;
        try {
          G.scene.add = function (...o) { added.push(...o); return add.apply(this, o); };
          const r = t.apply(G, obj, P) || null;
          delete G.scene.add;
          if (r && (r.update || r.dispose)) P.effects.push(r);
          for (let i = 0; i < 20; i++) {
            step(1);
            if (G.camPeek?.w > 0) res.peeked = true;
            if (card.childElementCount > cardKids) res.hudLine = true;
          }
          P.reset(obj);
          res.applied++;
        } catch (e) { delete G.scene.add; res.errors.push(`${t.id}: ${e.message}`); }
      }
      // The light pillar stands on the ground and reaches an objective floating far above it (cloud and island lands put
      // the ground hundreds of metres down): its full-strength part (below the top 30% fade) passes the objective.
      {
        const beamT = TACTICS.find((t) => t.id === 'beam'), at = p.pos.clone();
        const ground = Math.max(G.terrain.surfaceHeight(at.x, at.z), G.world.seaLevel);
        at.y = ground + 1500;
        const mark = [], add0 = G.scene.add;
        G.scene.add = function (...o) { mark.push(...o); return add0.apply(this, o); };
        const r = beamT.apply(G, { target: () => at }, P);
        delete G.scene.add;
        r.update(0.1);
        const m = mark[0];
        res.pillar = { onGround: Math.abs(m.position.y - ground) < 0.5, solidTop: Math.round(m.position.y + m.scale.y * 0.7), target: Math.round(at.y), faded: !!m.material.alphaMap };
        r.dispose();
      }
      res.leftovers = added.filter((o) => o.parent).map((o) => o.type);
      res.clean = card.childElementCount === cardKids && G.camPeek == null && G.ui.edgeArrow === 0 && p.wind.lengthSq() === 0;
      P.reset(null);
      G.objectives.current?.dispose(G);
      G.objectives.current = null;
    }

    // Guidance and the success card: the first hoop sits ahead, a faint arrow points at an off-screen objective, the
    // first objectives charge no hint fee, par times, the 4-line banner, and a spare plane for beating a boss.
    {
      const O = G.objectives, p = G.player, celebrate = G.mutations.celebrate, has = G.powerups.has, cooldown = O.cooldown;
      const res = (out.guide = { firstHoop: [], markerSeen: 0 });
      const drop = () => { if (O.current) { O.current.dispose(G); O.current = null; } G.persuasion.reset(null); };
      const start = (type, completed = 1) => { drop(); O.completed = completed; O.startType(type); return O.current; };
      const lines = () => [...document.querySelectorAll('#banner li')].map((l) => l.textContent);
      const finish = (obj, { t = 30, stage = 0, completed = O.completed, forced = false } = {}) => {
        obj.t = t; G.persuasion.stage = stage; O.completed = completed; G.zones.sinceZone = 1;
        const s0 = G.score;
        O.complete(forced);
        return { gain: G.score - s0, lines: lines(), title: document.querySelector('#banner h1').textContent };
      };
      O.cooldown = 1e9;
      G.mutations.celebrate = () => []; // no world changes (and no zone change) unless a check asks for them
      // 20 first hoops: within 20° of straight ahead, 300-450 m away, and on screen.
      for (let k = 0; k < 20; k++) {
        const ring = start('hoop', 0).target();
        const f = p.forward.clone().setY(0).normalize(), d = ring.clone().sub(p.pos).setY(0);
        res.firstHoop.push({ deg: +(f.angleTo(d) * 180 / Math.PI).toFixed(1), dist: Math.round(d.length()) });
        G.step(1 / 30);
        if (document.getElementById('marker').style.display === 'block') res.markerSeen++;
      }
      // Off screen behind the plane with no arrow unlocked: a faint arrow, no label. Persuasion steps make it normal, then big.
      G.powerups.has = () => false; // no power-up changes the arrow
      const arrowAt = (level) => {
        G.ui.edgeArrow = level; G.ui.showDistance = true;
        O.current.target().copy(p.pos).addScaledVector(p.forward, -300);
        p.invuln = 99; G.step(1 / 30);
        const a = document.getElementById('edge-arrow');
        return { shown: a.style.display === 'block', faint: a.classList.contains('faint'), big: a.classList.contains('big'), label: a.querySelector('span').textContent };
      };
      start('hoop');
      res.arrow = [0, 1, 2].map(arrowAt);
      G.ui.edgeArrow = 0; G.ui.showDistance = false;
      G.powerups.has = has;
      // Hint fee: waived for the first 3 objectives of a run, charged from then on.
      res.feeFree = finish(start('hoop'), { stage: 2, completed: 0 });
      res.feeFree2 = finish(start('hoop'), { stage: 2, completed: 2 });
      res.feePaid = finish(start('hoop'), { stage: 2, completed: 3 });
      // Par: the hoop's card shows "Par 12 s" until 12 s pass; done at 10 s earns the bonus, at 14 s not.
      let obj = start('hoop');
      G.step(1 / 30);
      res.par = { card: document.getElementById('obj-par').textContent, hoop: obj.par };
      obj.t = 12.5; G.step(1 / 30);
      res.par.cardAfter = document.getElementById('obj-par').textContent;
      res.par.at10 = finish(obj, { t: 10 });
      res.par.at14 = finish(start('hoop'), { t: 14 });
      res.par.timed = start('timed').par;
      // Hold The Line runs on its wave clocks: no par line on its card, and no speed bonus however it ends.
      obj = start('survive');
      G.step(1 / 30);
      res.par.survive = { par: obj.par, card: document.getElementById('obj-par').textContent, done: finish(obj, { t: 1 }).lines.join() };
      // The banner: 4 world changes show the first and "+3 more", and it leaves within 3.6 s (still up at 3 s).
      G.mutations.celebrate = () => ['The trees are blue now.', 'Gravity is optional.', 'Clouds got bigger.', 'Sheep learned to fly.'];
      res.four = finish(start('hoop'));
      for (let i = 0; i < 90; i++) { p.invuln = 99; G.step(1 / 30); }
      res.four.showAt3s = document.getElementById('banner').classList.contains('show');
      for (let i = 0; i < 18; i++) { p.invuln = 99; G.step(1 / 30); }
      res.four.showAt36s = document.getElementById('banner').classList.contains('show');
      G.mutations.celebrate = () => [];
      // 200 hoops never say LOOP-TASTIC!; the loop objective does, about half the time.
      res.loopTasticHoops = 0; res.loopTasticLoops = 0;
      for (let k = 0; k < 200; k++) if (finish(start('hoop')).title === 'LOOP-TASTIC!') res.loopTasticHoops++;
      for (let k = 0; k < 30; k++) if (finish(start('loop')).title === 'LOOP-TASTIC!') res.loopTasticLoops++;
      // Spare plane: beating a boss adds a life, up to 5; never lowers a big stack; not for a forced finish.
      const level = O.bossLevel;
      const boss = (lives, forced = false) => {
        drop(); p.lives = lives;
        O.start(O.makeBoss('kingDrone'), 'boss');
        const par = O.current.par, r = finish(O.current, { forced });
        return { lives: p.lives, par, detail: r.lines[1] || '' };
      };
      res.spare = { from2: boss(2), from5: boss(5), big: boss(1e6), forced: boss(2, true) };
      O.bossLevel = level;
      p.lives = 4; G.ui.renderLives();
      res.spare.hearts4 = document.getElementById('lives').textContent;
      p.lives = 1e6;
      G.mutations.celebrate = celebrate;
      O.completed = 1;
      O.cooldown = cooldown;
    }

    // Every objective type once, run for a bit, then completed normally (each triggers world mutations).
    // Stay in the first zone: space zones don't offer the ground objectives.
    const { OBJECTIVE_TYPES: types, BOSS_GAP } = window.OBJ_FOR_TEST;
    out.objectiveTypes = types.length;
    out.noHerd = !types.includes('herd') && types.includes('treasure');
    out.bannerMaxLines = 0;
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
      out.bannerMaxLines = Math.max(out.bannerMaxLines, document.querySelectorAll('#banner li').length);
    }
    step(150);

    // No repeats (B1): 400 picks in a row never bring back one of the last 6 types, nor the last one's family.
    {
      const { pickType, familyOf } = window.OBJ_FOR_TEST, eligible = types.map((t) => [t, 1]);
      let recent = [], repeats = 0;
      for (let i = 0; i < 400; i++) {
        const [t] = pickType(eligible, recent);
        if (recent.includes(t) || (recent.length && familyOf(recent[0]) === familyOf(t))) repeats++;
        recent = [t, ...recent].slice(0, 6);
      }
      out.objectiveRepeats = repeats;
      out.objectiveFallback = pickType([['hoop', 1]], ['hoop'])?.[0]; // nothing else allowed: still picks
    }

    // Shoot it vs fly into it: the gallery's bullseye targets face the player, count bullets only (ramming gets a
    // quip, once); the popper's balloons glow, and count the plane only (bullets go through).
    {
      const O = G.objectives, p = G.player, cooldown = O.cooldown, notify = G.ui.notify, clank = G.audio.clank;
      const V = p.pos.constructor;
      const res = (out.shootOrFly = {});
      const drop = () => { if (O.current) { O.current.dispose(G); O.current = null; } G.persuasion.reset(null); };
      const ours = (test) => G.scene.children.filter(test);
      const shootAt = (m) => { p.fire(); for (const b of p.bullets) { b.pos.copy(m.position).add(new V(0, 1, 0)); b.vel.set(0, 0, 0); } };
      const ram = (m) => { p.pos.copy(m.position); p.prevPos.copy(m.position); step(1); };
      let quips = 0, clanks = 0;
      G.ui.notify = function (text, ...a) { if (text === "Shoot it, don't hug it!") quips++; return notify.call(this, text, ...a); };
      G.audio.clank = function () { clanks++; return clank.call(this); };
      O.cooldown = 1e9;
      drop(); O.startType('gallery');
      const targets = ours((o) => o.userData.body);
      res.gallery = { count: targets.length, balloons: targets.filter((m) => m.userData.halo).length };
      // Circle a target: it turns to face the plane (its face is +Z), wherever the plane is.
      const m0 = targets[0], fwd = new V();
      res.gallery.facing = [0, 1, 2, 3].map((k) => {
        const a = k * Math.PI / 2;
        p.pos.copy(m0.position).add(new V(Math.cos(a) * 150, 0, Math.sin(a) * 150)); p.prevPos.copy(p.pos);
        step(1);
        m0.getWorldDirection(fwd).setY(0).normalize();
        return +fwd.dot(new V().subVectors(p.pos, m0.position).setY(0).normalize()).toFixed(3);
      });
      ram(targets[1]); ram(targets[2]); step(1); // progress is written at the start of a frame: one more to see it
      res.gallery.afterRam = O.current.progress;
      shootAt(targets[1]); step(9);
      res.gallery.afterShot = O.current.progress;
      res.gallery.hidden = !targets[1].visible;
      res.gallery.quips = quips; res.gallery.clanks = clanks;
      drop(); O.startType('balloons');
      const balloons = ours((o) => o.userData.halo);
      res.popper = { count: balloons.length, haloR: balloons[0]?.userData.halo.geometry.parameters.radius };
      shootAt(balloons[0]); step(2);
      res.popper.afterShot = O.current.progress;
      ram(balloons[0]); step(1);
      res.popper.afterRam = O.current.progress;
      drop();
      G.ui.notify = notify; G.audio.clank = clank;
      O.cooldown = cooldown;
    }

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
        // A win just before reshapes the world (celebrate → rebuildAll), but surfaceHeight reads the old chunks
        // until each is rebuilt, a couple a frame. Play has a 4 s cooldown before the next objective; here wait for
        // the rebuild, or a quest placed now sits on the old ground and the risen mountains swallow its targets.
        for (let i = 0; i < 600 && G.terrain.stale; i++) step(1);
        if (G.terrain.stale) throw new Error('terrain still rebuilding after 20 s');
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
      // Chains: within range of the next link the plane eases down so it can turn into it (boost still overrides);
      // far from it, cruise speed comes back. The ring time trial is a race, so it keeps full speed.
      {
        const mel = fresh('melody'), at = mel.target().clone();
        const hold = (spot, frames, boost = false) => {
          if (boost) G.input.keys.add('ShiftLeft');
          for (let k = 0; k < frames; k++) {
            p.maneuver = null; p.invuln = 5; p.freeBoost = 0; if (boost) p.boost = 1; p.quat.setFromAxisAngle(p.up.set(0, 1, 0), 0); p.updateAxes();
            p.pos.copy(spot); p.prevPos.copy(spot); step(1);
          }
          G.input.keys.delete('ShiftLeft');
          return { on: p.onChain, speed: Math.round(p.speed) };
        };
        p.speed = p.baseSpeed;
        const near = hold(at.clone().add(new p.pos.constructor(150, 0, 0)), 90);
        const boost = hold(at.clone().add(new p.pos.constructor(150, 0, 0)), 60, true);
        const far = hold(at.clone().add(new p.pos.constructor(900, 0, 0)), 150);
        out.chainSlow = { near, boost, far, base: p.baseSpeed, open: G.objectives.current === mel };
        const tr = fresh('trial');
        out.chainSlow.trial = tr.chainSlow;
        tr.dispose(G); G.objectives.current = null; // back to no objective, as after the constellation
      }
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
      // X marks the spot: real bullets fired from a hover above the X dig it out; the chest pops up and it's done.
      // The X sits on dry land, and digging shows as progress on the way. (The world doesn't reshape itself after
      // these wins, as in the landing check below: that's not what's checked, and it would only add noise.)
      const cheer = G.mutations.celebrate;
      G.mutations.celebrate = () => [];
      {
        const tr = fresh('treasure');
        done0 = G.objectives.completed;
        const t = tr.target().clone(), V = p.pos.constructor;
        const X = new V(t.x, G.terrain.surfaceHeight(t.x, t.z), t.z);
        const W = window.WORLD_FOR_TEST;
        out.quests.treasureDry = W.heightAt(X.x, X.z) > W.waterLine(); // the world itself: a mutation may still be rebuilding the chunks
        // Almost straight over it, and clear of the land under the plane (a hover inside a hill would shoot the hill).
        const hover = X.clone().add(new V(0, 0, 25));
        hover.y = Math.max(X.y + 120, G.terrain.surfaceHeight(hover.x, hover.z) + 60);
        let dugSeen = 0;
        for (let i = 0; i < 30 * 40 && G.objectives.current === tr; i++) {
          p.pos.copy(hover); p.prevPos.copy(hover); p.speed = 44;
          X.y = G.terrain.surfaceHeight(X.x, X.z);
          p.nudgeToward(X, 1e9, 1);
          p.updateAxes();
          if (p.shootCd <= 0) p.fire();
          step(1);
          dugSeen = Math.max(dugSeen, +(tr.progress.match(/Dug ([\d.]+)/) || [0, 0])[1]);
        }
        out.quests.treasure = G.objectives.current !== tr && G.objectives.completed === done0 + 1 && dugSeen > 3;
        out.quests.treasureLog = `${tr.progress} · max seen ${dugSeen} m`;
      }
      // Searchlights: two lamps; hanging about at the hoop gets you spotted twice (mission over), but waiting out of
      // reach for a beam to pass the hoop, then boosting straight in, makes it.
      {
        const sl = fresh('searchlight');
        const hoop = sl.target().clone(), V = p.pos.constructor;
        const back = p.pos.clone().sub(hoop).setY(0).normalize();
        const done1 = G.objectives.completed;
        const loiter = hoop.clone().addScaledVector(back, 30);
        for (let i = 0; i < 30 * 25 && G.objectives.current === sl; i++) { p.pos.copy(loiter); p.prevPos.copy(loiter); step(1); }
        out.quests.searchlightCaught = sl.lamps.length === 2 && G.objectives.current !== sl && G.objectives.completed === done1;
        const sl2 = fresh('searchlight');
        const h2 = sl2.target().clone(), b2 = p.pos.clone().sub(h2).setY(0).normalize();
        const park = () => { p.pos.copy(h2).addScaledVector(b2, 900); p.pos.y += 150; p.prevPos.copy(p.pos); p.boost = 1; };
        let was = false;
        for (let i = 0; i < 30 * 12; i++) { park(); step(1); const s = sl2.lamps.some((l) => l.userData.sees(h2, 0.24)); if (was && !s) break; was = s; }
        const done2 = G.objectives.completed;
        p.pos.copy(h2).addScaledVector(b2, 420); p.prevPos.copy(p.pos); p.maneuver = null;
        p.nudgeToward(h2, 1e9, 1); p.updateAxes(); p.speed = 75;
        G.input.keys.add('ShiftLeft');
        for (let i = 0; i < 30 * 15 && G.objectives.current === sl2; i++) { p.nudgeToward(h2, 4, 1 / 30); p.updateAxes(); step(1); }
        G.input.keys.delete('ShiftLeft');
        out.quests.searchlightDash = G.objectives.current !== sl2 && G.objectives.completed === done2 + 1;
        out.quests.searchlightLog = sl2.progress;
      }
      G.mutations.celebrate = cheer;
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
        // Flying the wrong way along the strip is no approach: no glide-path assist, cruise speed kept.
        fly(at(0, 20), new Q().setFromAxisAngle(UP, S.yaw + Math.PI), 45);
        const wrongWay = { glide: p.onGlide, speed: p.speed };
        const pullUps = G.pullup.shows; // a landing approach is not a reason to PULL UP!
        fly(at(85, 4.5), glide, 150, () => p.landed);
        const L = out.landing = { landed: !!p.landed, dead: p.dead, ...p.lastLanding, pullUps: G.pullup.shows - pullUps };
        Object.assign(L, { glide: p.onGlide, touchSpeed: p.speed, base: p.baseSpeed, wrongWay });
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
    // Flood calm land under 200 m of sea, the plane well above it (the carrier's turns). Callers restore amp and seaLevel.
    const seaUp = () => {
      const p = G.player;
      Object.assign(G.world, { amp: 0.15, seaLevel: 200 });
      G.terrain.rebuildAll();
      p.pos.y = p.prevPos.y = 330;
      step(30);
    };
    // HMS Overkill: a long bar; a bullet on the hull 90 m from its middle hits it (the hull boxes, not a sphere); a plane
    // flown into the hull is lifted out over the deck; a deck gun shot off costs it 4% of its hull.
    // Fort Grumpington: its hull boxes take hits on a tower 30 m+ from its middle, a tower cannon takes a few plain hits
    // (no boss x6), costs it 3% and leaves a wreck, its damage shows in two stages (the breached wall top falls), and
    // ducking sinks only its mortar (the fort itself stays put).
    const fortChecks = (e) => {
      const p = G.player, V = p.pos.constructor, u = e.mesh.userData, r = { spawned: true, maxHp: e.maxHp };
      e.mesh.updateMatrixWorld();
      const tower = e.mesh.localToWorld(new V(8.4, 4, 6.6));
      r.towerDist = Math.round(tower.distanceTo(e.pos));
      // (A plane that bumped into the walls, or a fort mid-duck, would make this about the run-up, not the hull.)
      r.wasDead = p.dead;
      if (p.dead) { p.spawn(e.pos.x + 300, e.pos.z); p.invuln = 99; }
      for (let i = 0; i < 30 * 10 && (e.shield ?? 1) < 1; i++) step(1);
      r.shieldAt = e.shield ?? 1;
      while (p.bullets.length) p.removeBullet(0);
      const hp0 = e.hp;
      p.shootCd = 0; p.fire();
      for (const b of p.bullets) { b.pos.copy(tower); b.vel.set(0, 0, 0); }
      // Straight to the hit test (a full frame would first let the ground under a tower on a slope eat the bullets).
      G.enemies.update(0);
      r.hullHit = e.hp < hp0;
      const c = u.parts.find((x) => x.name === 'cannon' && !x.broken), at = c.obj.getWorldPosition(new V()), hp1 = e.hp;
      let hits = 0;
      while (!c.broken && hits < 50) { G.enemies.damagePart(e, c, 1, at); hits++; }
      Object.assign(r, { cannonHits: hits, cannonCost: +((hp1 - e.hp - hits) / e.maxHp).toFixed(3), wreck: !!c.wreck?.visible });
      e.hp = e.maxHp * 0.3;
      step(2);
      r.stages = u.damage.filter((st) => st.on).length;
      r.breached = !u.damage[1].hide[0].visible;
      e.mv.up = false; e.mv.t = 0;
      step(15);
      r.mortarDown = +(8.4 - u.mortar.position.y).toFixed(1);
      r.fortStill = Math.abs(e.mesh.children[0].position.y) < 0.01;
      return r;
    };
    const carrierChecks = (e, afloat) => {
      const p = G.player, V = p.pos.constructor, s = e.mesh.scale.x, r = { spawned: true, afloat, maxHp: e.maxHp };
      r.longBar = document.getElementById('boss-bar').classList.contains('long');
      e.mesh.updateMatrixWorld();
      const stern = e.mesh.localToWorld(new V(-2, 3, -26));
      r.sternDist = Math.round(stern.distanceTo(e.pos));
      while (p.bullets.length) p.removeBullet(0);
      const hp0 = e.hp;
      p.shootCd = 0; p.fire();
      r.shots = p.bullets.length;
      for (const b of p.bullets) { b.pos.copy(stern); b.vel.set(0, 0, 0); }
      step(1);
      r.hullHit = e.hp < hp0;
      const deckY = e.pos.y + 5.6 * s;
      p.pos.copy(e.mesh.localToWorld(new V(-2, 3, -10))); p.prevPos.copy(p.pos);
      step(1);
      r.bumpedAbove = +(p.pos.y - deckY).toFixed(1);
      p.pos.y = p.prevPos.y = deckY + 150;
      const gun = e.mesh.userData.parts.find((x) => x.name === 'gun'), hp1 = e.hp;
      G.enemies.breakPart(e, gun);
      r.gunCost = +((hp1 - e.hp) / e.maxHp).toFixed(3);
      r.gunHidden = !gun.obj.visible;
      // Another gun takes a few plain hits (no boss ×6) and leaves a wreck; the catapults launch two fighters that shoot
      // out ahead of the bow and climb.
      const gun2 = e.mesh.userData.parts.filter((x) => x.name === 'gun' && !x.broken)[0], at = gun2.obj.getWorldPosition(new V());
      let hits = 0;
      while (!gun2.broken && hits < 50) { G.enemies.damagePart(e, gun2, 1, at); hits++; }
      Object.assign(r, { gunHits: hits, wreck: !!gun2.wreck?.visible });
      G.enemies.list.filter((x) => x.type === 'fighter').forEach((x) => G.enemies.removeEnemy(x));
      r.launched = G.enemies.launchFighters(e);
      const jets = G.enemies.list.filter((x) => x.type === 'fighter'), y0 = jets.map((x) => x.pos.y);
      step(15);
      r.climbed = jets.length > 0 && jets.every((x, k) => x.pos.y > y0[k] + 2 && !x.dead);
      // The secret: a gentle, level approach over the stern lands on the deck (hull patched, a bonus, the secret found),
      // the deck carries you along as it steams and its guns hold fire; pulling up takes off without a bump. A steep dive
      // onto the deck doesn't land.
      G.enemies.list.filter((x) => x.type === 'fighter').forEach((x) => G.enemies.removeEnemy(x));
      const D = e.def.deck, top = e.pos.y + D.y * s, nose = e.mesh.rotation.y + Math.PI; // the plane flies along -Z, the bow is +Z
      const approach = (lz, pitch) => {
        e.mesh.updateMatrixWorld();
        p.pos.copy(e.mesh.localToWorld(new V(-1, D.y, lz))); p.pos.y = top + 5; p.prevPos.copy(p.pos);
        p.quat.setFromAxisAngle(new V(0, 1, 0), nose).multiply(new p.quat.constructor().setFromAxisAngle(new V(1, 0, 0), pitch)); p.updateAxes();
        Object.assign(p, { landed: null, maneuver: null, airTime: 20, grace: 0, invuln: 0, speed: p.baseSpeed });
      };
      G.secrets.found.delete('aboard');
      approach(-20, -0.7);
      let dived = false;
      for (let k = 0; k < 8; k++) { step(1); if (p.landed) dived = true; }
      r.diveLanded = dived;
      approach(-22, 0);
      p.health = p.maxHealth / 2;
      const score0 = G.score;
      step(1);
      const L = p.landed;
      r.deck = { landed: L?.deck === e, secret: G.secrets.found.has('aboard'), patched: p.health === p.maxHealth, bonus: G.score - score0, onTop: L ? +(p.pos.y - top).toFixed(2) : null };
      if (L?.deck === e) {
        e.burst = 0; // a rattle already under way
        const z0 = L.local.z, at0 = e.pos.clone(), shots0 = G.enemies.shots.length;
        step(60);
        r.deck.rode = p.landed?.deck === e && e.pos.distanceTo(at0) > 3 && L.local.z > z0 && L.local.z < 33 && Math.abs(p.pos.y - top - 2.5 * p.sizeScale) < 0.01;
        r.deck.held = G.enemies.shots.length <= shots0;
        e.contactCd = 0;
        p.invuln = 5; // only the hull's bump is being checked here, not a shot on the way up
        p.speed = p.baseSpeed; p.liftoff();
        step(20);
        r.deck.tookOff = !p.landed && !p.dead && p.pos.y > top + 3 && e.contactCd === 0;
      }
      p.pos.y = p.prevPos.y = top + 150;
      return r;
    };
    // Magmadora: out of reach under the lava; a ring on the lava 1.2 s+ before she breaks, where her head comes up; her
    // arc crosses your path; 3 fireballs out of her mouth at the top; her body hurts (and can be hit) while it's up; two
    // frills shot off leave one fireball a spit.
    const serpentChecks = (e) => {
      const p = G.player, V = p.pos.constructor, WL = G.world.seaLevel, r = { spawned: true, maxHp: e.maxHp, segs: e.mesh.userData.segs.length };
      const fly = (n, until = () => false) => { for (let i = 0; i < n; i++) { p.grace = 1; p.health = p.maxHealth; e.hp = e.maxHp; p.pos.y = p.prevPos.y = WL + 90; step(1); if (until()) return true; } return false; };
      const shoot = (at) => { while (p.bullets.length) p.removeBullet(0); const hp0 = e.hp; p.shootCd = 0; p.fire(); for (const b of p.bullets) { b.pos.copy(at); b.vel.set(0, 0, 0); } G.enemies.update(0); return hp0 - e.hp; };
      fly(30 * 12, () => e.mv?.phase === 'under' && !e.mv.plan && !e.mv.visible);
      r.shieldUnder = e.shield;
      r.hitUnder = +shoot(e.pos.clone()).toFixed(2);
      const hz0 = G.enemies.hazards.list.filter((h) => h.owner === e).length;
      fly(30 * 8, () => !!e.mv.plan);
      const plan = e.mv.plan, ringAt = G.time;
      r.rings = G.enemies.hazards.list.filter((h) => h.owner === e).length - hz0;
      if (plan) {
        // Where the top of the arc is against your path: the plan's middle, off your flat heading.
        const mid = new V().lerpVectors(plan.A, plan.B, 0.5), f = new V(p.forward.x, 0, p.forward.z).normalize(), to = mid.clone().sub(p.pos).setY(0);
        r.crossOff = Math.round(to.clone().addScaledVector(f, -to.dot(f)).length());
        r.crossAhead = Math.round(to.dot(f));
        r.span = Math.round(plan.A.distanceTo(plan.B));
      }
      let up = null, mouthOff = -1, spat = 0, seg = null;
      const shots0 = new Set(G.enemies.shots);
      fly(30 * 8, () => {
        if (!up && e.mv.phase === 'arc' && e.mesh.userData.head.visible) up = { warned: +(G.time - ringAt).toFixed(2), fromRing: Math.round(Math.hypot(e.pos.x - plan.A.x, e.pos.z - plan.A.z)) };
        const fresh = G.enemies.shots.filter((x) => !shots0.has(x) && x.owner === e);
        if (fresh.length && mouthOff < 0) {
          const m = e.mesh.userData.mouth.getWorldPosition(new V());
          // How far past one frame of flight from the mouth (closer than that is 0: it left the mouth this frame).
          mouthOff = Math.max(0, Math.round(Math.min(...fresh.map((x) => x.pos.distanceTo(m) - x.vel.length() / 30))));
          spat = fresh.length;
          seg = e.mesh.userData.segs.findIndex((x) => x.visible);
        }
        return spat > 0 && seg >= 0;
      });
      Object.assign(r, { up, mouthOff, spat, shieldUp: e.shield });
      if (seg >= 0) {
        const at = e.mesh.userData.segs[seg].getWorldPosition(new V());
        r.bodyHit = shoot(at) > 0;
        r.touches = window.BOSS_MOVES_FOR_TEST.breach.touches(e, at, 4);
      }
      for (const fr of e.mesh.userData.parts.filter((x) => x.name === 'frill')) { let n = 0; while (!fr.broken && n < 60) { G.enemies.damagePart(e, fr, 1, fr.obj.getWorldPosition(new V())); n++; } r.frillHits = n; }
      const shots1 = new Set(G.enemies.shots);
      let spat2 = 0;
      fly(30 * 16, () => (spat2 = G.enemies.shots.filter((x) => !shots1.has(x) && x.owner === e).length) > 0);
      r.spatNoFrills = spat2;
      return r;
    };
    // Glacierra: each shard fan comes 1 s+ after she starts lining her wings up, 7 shards wide; a flat fan when her wings
    // are level (shards spread sideways), an upright fan when they're on edge (spread up and down); a shard that hits
    // costs hull and frosts a third of the boost tank; with both wingtip crystals shot off, a fan is 3 shards.
    const rayChecks = (e) => {
      const p = G.player, V = p.pos.constructor, r = { fans: [] };
      const fly = (n, until = () => false) => { for (let i = 0; i < n; i++) { p.grace = 1; p.health = p.maxHealth; e.hp = e.maxHp; step(1); if (until()) return true; } return false; };
      const fan = () => {
        if (!fly(30 * 12, () => e.mv?.wind > 0)) return null;
        const at = G.time, plane = e.mv.plane, shots0 = new Set(G.enemies.shots);
        let fresh = [];
        fly(30 * 4, () => (fresh = G.enemies.shots.filter((x) => !shots0.has(x) && x.owner === e)).length > 0);
        if (!fresh.length) return { plane, shards: 0 };
        const a = fresh[0].vel.clone().normalize(), b = fresh.at(-1).vel.clone().normalize(), spread = b.sub(a).normalize();
        return { plane, shards: fresh.length, wound: +(G.time - at).toFixed(2), spreadY: +Math.abs(spread.y).toFixed(2), roll: +Math.abs(e.mv.roll).toFixed(2), frost: fresh[0].frost, shots: fresh };
      };
      for (let k = 0; k < 4 && !(r.fans.some((f) => f.plane === 'h') && r.fans.some((f) => f.plane === 'v')); k++) {
        const f = fan();
        if (!f) break;
        r.fans.push(f);
      }
      // A shard on the player: hull and a chunk of boost.
      const shard = r.fans.at(-1)?.shots?.find((x) => G.enemies.shots.includes(x));
      if (shard) {
        p.health = p.maxHealth; p.boost = 1; p.invuln = 0; p.dodging = false;
        shard.pos.copy(p.pos);
        G.enemies.updateShots(0);
        r.hit = { hull: +(p.maxHealth - p.health).toFixed(1), boost: +p.boost.toFixed(2) };
        p.health = p.maxHealth; p.invuln = 99;
      }
      for (const f of r.fans) delete f.shots;
      for (const c of e.mesh.userData.parts.filter((x) => x.name === 'crystal')) { let n = 0; while (!c.broken && n < 60) { G.enemies.damagePart(e, c, 1, c.obj.getWorldPosition(new V())); n++; } r.crystalHits = n; }
      e.mv.queue = 0;
      r.noCrystals = fan()?.shards ?? 0;
      return r;
    };
    // Pharaoh Scarabus: every 3rd attack two mirages shimmer in, well apart from it; only the real one has a shadow, flat on
    // the ground under it; a mirage's orb is harmless, a real one hurts; a hit on the real one pops the mirages; with its
    // horn shot off a volley is 3 orbs.
    const beetleChecks = (e) => {
      const p = G.player, V = p.pos.constructor, u = e.mesh.userData, r = { deaths: 0 };
      // Kept near it (as the boss loop flies), and back in the air if the plane crashed: a dead plane draws no attacks.
      const fly = (n, until = () => false) => {
        for (let i = 0; i < n; i++) {
          if (p.dead) { r.deaths++; p.spawn(e.pos.x + 150, e.pos.z); p.invuln = 99; }
          p.grace = 1; p.health = p.maxHealth; e.hp = e.maxHp; p.nudgeToward(e.pos, 2, 1 / 30); step(1);
          if (until()) return true;
        }
        return false;
      };
      const volley = () => { const shots0 = new Set(G.enemies.shots); let fresh = []; fly(30 * 10, () => (fresh = G.enemies.shots.filter((x) => !shots0.has(x) && x.src === e)).some((x) => !x.fake)); return fresh; };
      r.up = fly(30 * 15, () => u.mirages.every((x) => x.visible));
      if (!r.up) return r;
      fly(15); // past the fade-in
      r.mirages = u.mirages.filter((x) => x.visible).length;
      r.gap = Math.round(Math.min(...u.mirages.map((x) => x.position.distanceTo(e.pos))));
      r.away = Math.round(e.pos.distanceTo(p.pos));
      const ground = Math.max(G.terrain.surfaceHeight(e.pos.x, e.pos.z, e.pos.y), G.world.underwater ? -Infinity : G.world.seaLevel);
      r.shadow = { on: u.shadow.visible, off: +Math.hypot(u.shadow.position.x - e.pos.x, u.shadow.position.z - e.pos.z).toFixed(1), above: +(u.shadow.position.y - ground).toFixed(1) };
      const v = volley();
      r.fake = v.filter((x) => x.fake).length; r.real = v.filter((x) => !x.fake).length;
      const onYou = (shot) => {
        if (!shot || !G.enemies.shots.includes(shot)) return null;
        p.health = p.maxHealth; p.invuln = 0; p.dodging = false;
        shot.pos.copy(p.pos);
        G.enemies.updateShots(0);
        const lost = +(p.maxHealth - p.health).toFixed(1);
        p.health = p.maxHealth; p.invuln = 99;
        return lost;
      };
      r.fakeHurt = onYou(v.find((x) => x.fake));
      r.realHurt = onYou(v.find((x) => !x.fake));
      // A hit on the real one (its hull): the mirages pop.
      if (!u.mirages.some((x) => x.visible)) fly(30 * 15, () => u.mirages.every((x) => x.visible));
      r.before = u.mirages.filter((x) => x.visible).length;
      e.hp = e.maxHp - 3; p.grace = 1; step(2);
      r.after = u.mirages.filter((x) => x.visible).length;
      for (const h of u.parts.filter((x) => x.name === 'horn')) { let n = 0; while (!h.broken && n < 60) { G.enemies.damagePart(e, h, 1, h.obj.getWorldPosition(new V())); n++; } r.hornHits = n; }
      r.noHorn = volley().filter((x) => !x.fake).length;
      return r;
    };
    // Lady Hootrude: her first attacks are 5-acorn volleys; every 3rd she hovers and rears up (1 s+, 1.8 s the first
    // time), then beats a band of leaves. A band that reaches you shoves you flat along its travel (up to 45 m/s, fading
    // within a second) and costs some speed, once a gust, and leaves the tailwind vector alone; low over the ground it
    // doesn't shove at all. With both ear tufts shot off a gust is 42 m wide, shoves 22 m/s and costs no speed.
    const owlChecks = (e) => {
      const p = G.player, V = p.pos.constructor, r = { deaths: 0 };
      const fly = (n, until = () => false) => {
        for (let i = 0; i < n; i++) {
          if (p.dead) { r.deaths++; p.spawn(e.pos.x + 150, e.pos.z); p.invuln = 99; }
          p.grace = 1; p.health = p.maxHealth; e.hp = e.maxHp; p.nudgeToward(e.pos, 2, 1 / 30); step(1);
          if (until()) return true;
        }
        return false;
      };
      const shots0 = new Set(G.enemies.shots);
      let fresh = [];
      fly(30 * 10, () => (fresh = G.enemies.shots.filter((x) => !shots0.has(x) && x.src === e)).length > 0);
      r.acorns = fresh.length;
      // The next band, with the player put just ahead of it at `lift` m over the ground: what it did to them.
      const gust = (lift) => {
        if (!fly(30 * 20, () => e.mv?.tell > 0)) return null;
        const g = { tell: +e.mv.tell0.toFixed(2) };
        fly(20);
        g.hover = Math.round(e.vel.length());
        if (!fly(30 * 4, () => !!e.mv?.band)) return g;
        const b = e.mv.band, hits = e.mv.hits;
        g.w = b.w; g.pushK = b.push; g.slowK = b.slow;
        const ground = Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z, p.pos.y), G.world.underwater ? -Infinity : G.world.seaLevel);
        p.pos.y = p.prevPos.y = ground + lift;
        p.gust.set(0, 0, 0); p.wind.set(1, 0, 2); p.invuln = 0;
        const put = () => b.at.copy(p.pos).addScaledVector(b.dir, -(b.dist + 3)); // the band's middle 3 m behind them
        put();
        const speed0 = p.speed;
        p.grace = 1; G.step(1 / 30); // not step(): it makes the plane invulnerable, and a gust leaves an invulnerable plane alone
        g.hit = e.mv.hits - hits;
        g.push = +p.gust.length().toFixed(1);
        g.flatY = +Math.abs(p.gust.y).toFixed(2);
        g.slowed = +(speed0 - p.speed).toFixed(1);
        g.wind = p.wind.x === 1 && p.wind.z === 2;
        p.wind.set(0, 0, 0);
        if (e.mv.band) { put(); p.grace = 1; step(1); }
        g.once = e.mv.hits - hits === 1;
        for (let i = 0; i < 30; i++) { p.grace = 1; step(1); }
        g.after = +p.gust.length().toFixed(1);
        p.invuln = 99;
        return g;
      };
      r.high = gust(120);
      r.low = gust(8);
      for (const t of e.mesh.userData.parts.filter((x) => x.name === 'tuft')) { let n = 0; while (!t.broken && n < 60) { G.enemies.damagePart(e, t, 1, t.obj.getWorldPosition(new V())); n++; } r.tuftHits = n; }
      const k = gust(120);
      r.tufts = k && { w: k.w, push: k.pushK, slow: k.slowK };
      return r;
    };
    // Count Ribbiton: spore volleys (4 puffs; 2 with both crests popped), and his tongue lash: a tell of 1.2 s+ with his
    // throat swelling, then a tongue along the pink line that hits a plane on it (18 hull, some speed) and misses one
    // 40 m off it. Parked 120 m off him and 40 m up, so a lash is in reach.
    const toadChecks = (e) => {
      const p = G.player, V = p.pos.constructor, r = { volleys: [] }, mv = () => e.mv || {};
      const park = () => {
        const d = new V(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z);
        if (d.lengthSq() < 1) d.set(1, 0, 0);
        p.pos.copy(e.pos).addScaledVector(d.normalize(), 120).setY(e.pos.y + 40); p.prevPos.copy(p.pos);
      };
      const fly = (n, until = () => false) => {
        for (let i = 0; i < n; i++) {
          const shots0 = new Set(G.enemies.shots), v0 = mv().sporeVolleys;
          p.grace = 1; p.health = p.maxHealth; e.hp = e.maxHp; park(); step(1);
          if (mv().sporeVolleys > v0) r.volleys.push(G.enemies.shots.filter((x) => !shots0.has(x) && x.src === e).length);
          if (until()) return true;
        }
        return false;
      };
      // The next lash, with the plane put `off` m to the side of its line (`off` 0: right on it) while it's out.
      const lash = (off) => {
        if (!fly(30 * 30, () => mv().tell > 0)) return null;
        const l = { tell: +mv().tell0.toFixed(2) };
        fly(Math.round(mv().tell0 * 15));
        l.swell = +e.mesh.userData.sac.scale.x.toFixed(2);
        if (!fly(30 * 3, () => !!mv().lash)) return l;
        const L = mv().lash, hits = mv().hits, hull = p.health, speed0 = p.speed;
        const side = new V().crossVectors(L.dir, new V(0, 1, 0)).normalize();
        for (let i = 0; i < 6 && mv().lash === L; i++) {
          p.pos.copy(L.from).addScaledVector(L.dir, 120).addScaledVector(side, off); p.prevPos.copy(p.pos);
          p.invuln = 0; p.grace = 1; G.step(1 / 30); // not step(): it makes the plane invulnerable, and a tongue leaves an invulnerable plane alone
        }
        l.hit = mv().hits - hits;
        l.hull = +(hull - p.health).toFixed(1);
        l.slowed = +(speed0 - p.speed).toFixed(1);
        p.invuln = 99; p.health = p.maxHealth;
        return l;
      };
      r.on = lash(0);
      r.off = lash(40);
      for (const c of e.mesh.userData.parts.filter((x) => x.name === 'crest')) { let n = 0; while (!c.broken && n < 60) { G.enemies.damagePart(e, c, 1, c.obj.getWorldPosition(new V())); n++; } r.crestHits = n; }
      const n0 = r.volleys.length;
      fly(30 * 20, () => r.volleys.length > n0);
      r.popped = r.volleys[n0] ?? null;
      r.volleys = r.volleys.slice(0, n0);
      return r;
    };
    // Where the player is (and back there): Glacierra's long checks shouldn't move every later boss's fight elsewhere.
    const place = () => ({ pos: G.player.pos.clone(), prev: G.player.prevPos.clone(), quat: G.player.quat.clone(), speed: G.player.speed });
    const putBack = (s) => { const p = G.player; p.pos.copy(s.pos); p.prevPos.copy(s.prev); p.quat.copy(s.quat); p.speed = s.speed; p.updateAxes(); };
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
      // The carrier needs open sea: calm land under a deep sea for its turn (see seaUp).
      // Magmadora needs a lava sea (any sea will do for her test): the same flood.
      const { ground, sea, swim } = window.BOSSES_FOR_TEST[kind], { amp, seaLevel } = G.world;
      if (sea || swim) seaUp();
      else if (ground) { Object.assign(G.world, { amp: 0.15, seaLevel: -400 }); G.terrain.rebuildAll(); step(30); }
      const done0 = G.objectives.completed, spot0 = (kind === 'auroraRay' || kind === 'sunBeetle' || kind === 'harvestOwl') && place();
      const list = startBoss(kind, { mod: null, duo: false });
      const e = list[0];
      let afloat = true;
      // Lady Hootrude starts on top of her oak (rooted in the ground under her spawn spot; none over water or under a
      // roof), takes off within about 2 s, then flaps (her wings swing through a wide arc), banks, and her shadow lies on
      // the ground under her.
      const owlFly = kind === 'harvestOwl' && e.kind === kind && (() => {
        const u = e.mesh.userData, a = e.anchor, T = u.tree, sea = G.world.underwater ? -Infinity : G.world.seaLevel;
        const dry = G.terrain.surfaceHeight(a.x, a.z) > sea + 2 && !Number.isFinite(G.terrain.ceilingHeight(a.x, a.z, a.y));
        return { tree: !!T, dry, perched: !!u.perch, rooted: !!T && Math.abs(T.position.y - (G.terrain.surfaceHeight(T.position.x, T.position.z) - 1)) < 0.01, launch: -1, wing: [9, -9], bank: 0, shadow: null, crab: 0, backward: 0 };
      })();
      // Count Ribbiton starts on top of his giant toadstool (rooted in the ground), then hops: each hop clears the ground
      // (apex 30-70 m over a straight line, higher only to clear a hill), lands him on dry ground (feet on it), never
      // attacks in the air, and his shadow lies on the ground under him.
      const toadHop = kind === 'toadBaron' && e.kind === kind && (() => {
        const u = e.mesh.userData, T = u.tree;
        return { tree: !!T, perched: !!u.perch, rooted: !!T && Math.abs(T.position.y - (G.terrain.surfaceHeight(T.position.x, T.position.z) - 1)) < 0.01, hops: 0, apex: [Infinity, -Infinity], feet: 0, wet: 0, airAttacks: 0, shadow: null };
      })();
      for (let i = 0; i < 30 * 10; i++) {
        G.player.grace = 1; G.player.health = G.player.maxHealth; G.player.nudgeToward(swim ? e.pos.clone().setY(G.world.seaLevel + 90) : e.pos, 2, 1 / 30); step(1);
        if (sea && Math.abs(e.pos.y - G.world.seaLevel) > 0.01) afloat = false;
        if (owlFly) {
          const u = e.mesh.userData, w = u.wings[1].rotation.z, sh = u.groundShadow;
          if (owlFly.launch < 0 && !u.perch) owlFly.launch = +((i + 1) / 30).toFixed(2);
          if (!u.perch) { owlFly.wing[0] = Math.min(owlFly.wing[0], +w.toFixed(2)); owlFly.wing[1] = Math.max(owlFly.wing[1], +w.toFixed(2)); }
          owlFly.bank = Math.max(owlFly.bank, +Math.abs(e.mesh.rotation.z).toFixed(3));
          // Flying at speed (not rearing up), her body points within ~80° of where she's going: never tail first.
          if (!u.perch && !(e.mv?.tell > 0) && Math.hypot(e.vel.x, e.vel.z) > 24) {
            const d = Math.abs(Math.atan2(Math.sin(e.mesh.rotation.y - Math.atan2(e.vel.x, e.vel.z)), Math.cos(e.mesh.rotation.y - Math.atan2(e.vel.x, e.vel.z))));
            owlFly.crab = Math.max(owlFly.crab, Math.round((d * 180) / Math.PI));
            if (d > 1.4) owlFly.backward++;
          }
          if (sh?.visible) owlFly.shadow = +(sh.position.y - G.terrain.surfaceHeight(sh.position.x, sh.position.z, e.pos.y)).toFixed(2);
        }
        if (toadHop && e.mv) {
          const m = e.mv, u = e.mesh.userData;
          if (m.phase === 'air' && m.t < 0.05) toadHop.apex = [Math.min(toadHop.apex[0], Math.round(m.apex)), Math.max(toadHop.apex[1], Math.round(m.apex))];
          if (m.phase === 'air' && e.attacks > (toadHop.a0 ?? e.attacks)) toadHop.airAttacks++;
          toadHop.a0 = e.attacks;
          if (m.hops > toadHop.hops) {
            toadHop.hops = m.hops;
            const g = G.terrain.surfaceHeight(e.pos.x, e.pos.z);
            toadHop.feet = Math.max(toadHop.feet, +Math.abs(e.pos.y - window.TOAD_FEET_FOR_TEST * e.mesh.scale.x - g).toFixed(2));
            if (g < G.world.seaLevel + 2) toadHop.wet++;
          }
          const sh = u.groundShadow;
          if (sh?.visible) toadHop.shadow = +(sh.position.y - G.terrain.surfaceHeight(sh.position.x, sh.position.z, e.pos.y)).toFixed(2);
        }
      }
      if (owlFly) out.owlFly = owlFly;
      if (toadHop) { delete toadHop.a0; out.toadHop = toadHop; }
      const attacks = e.attacks;
      if (sea && e.kind === kind) out.carrier = carrierChecks(e, afloat);
      if (kind === 'fortGrump' && e.kind === kind) out.fort = fortChecks(e);
      if (swim && e.kind === kind) out.serpent = serpentChecks(e);
      if (kind === 'auroraRay' && e.kind === kind) out.ray = rayChecks(e);
      if (kind === 'sunBeetle' && e.kind === kind) out.beetle = beetleChecks(e);
      if (kind === 'harvestOwl' && e.kind === kind) out.owl = owlChecks(e);
      if (kind === 'toadBaron' && e.kind === kind) out.toad = toadChecks(e);
      e.hp = 0;
      step(3);
      out.bosses[kind] = { spawned: e.kind, attacks, done: G.objectives.completed === done0 + 1 };
      if (spot0) putBack(spot0);
      if (ground) { Object.assign(G.world, { amp, seaLevel }); G.terrain.rebuildAll(); step(30); }
      G.enemies.list.filter((x) => !x.boss).forEach((x) => G.enemies.removeEnemy(x));
    }
    if (!out.carrier) out.carrier = { spawned: false };
    if (!out.serpent) out.serpent = { spawned: false };
    // Magmadora is Volcano Land's: the deck never brings her anywhere else (another boss comes instead), and in Volcano
    // Land, once the openers are done, she comes first.
    {
      // (The land is only looked up by name, so the zone index is swapped without entering the zone.)
      const { ZONES } = await import('./src/zones.js');
      const O = G.objectives, saved = { deck: O.bossDeck.slice(), level: O.bossLevel, zone: G.zones.index, amp: G.world.amp, seaLevel: G.world.seaLevel };
      const draw = () => { const obj = O.makeBoss(); const k = obj.boss; obj.dispose(G); return k; };
      const L = out.serpent.lands = {};
      seaUp();
      O.bossLevel = 3;
      O.bossDeck = ['lavaSerpent', 'gooseQueen']; // (not King Drone: he's also the no-room fallback)
      G.zones.index = ZONES.findIndex((z) => z.name === 'Meadowlands');
      L.elsewhere = draw();
      L.waits = O.bossDeck.includes('lavaSerpent');
      O.bossDeck = ['lavaSerpent'];
      L.topUp = draw(); // only another land's boss left: the deck tops up rather than always bringing King Drone
      O.bossDeck = ['kingDrone', 'gooseQueen', 'lavaSerpent'];
      G.zones.index = ZONES.findIndex((z) => z.name === 'Volcano Land');
      L.home = draw();
      // Glacierra the same way, in the cold lands.
      O.bossDeck = ['auroraRay', 'gooseQueen'];
      G.zones.index = ZONES.findIndex((z) => z.name === 'Meadowlands');
      L.rayElsewhere = draw();
      O.bossDeck = ['kingDrone', 'gooseQueen', 'auroraRay'];
      G.zones.index = ZONES.findIndex((z) => z.name === 'Frozen Peaks');
      L.rayHome = draw();
      // Pharaoh Scarabus in the desert lands.
      O.bossDeck = ['sunBeetle', 'gooseQueen'];
      G.zones.index = ZONES.findIndex((z) => z.name === 'Meadowlands');
      L.beetleElsewhere = draw();
      O.bossDeck = ['kingDrone', 'gooseQueen', 'sunBeetle'];
      G.zones.index = ZONES.findIndex((z) => z.name === 'Dune Sea');
      L.beetleHome = draw();
      // Lady Hootrude in the woods lands (not Meadowlands, where it all begins).
      O.bossDeck = ['harvestOwl', 'gooseQueen'];
      G.zones.index = ZONES.findIndex((z) => z.name === 'Meadowlands');
      L.owlElsewhere = draw();
      O.bossDeck = ['kingDrone', 'gooseQueen', 'harvestOwl'];
      G.zones.index = ZONES.findIndex((z) => z.name === 'Autumn Woods');
      L.owlHome = draw();
      // Count Ribbiton in the mushroom lands (on dry land: he's a ground boss).
      Object.assign(G.world, { amp: 0.15, seaLevel: -400 }); G.terrain.rebuildAll(); step(30);
      O.bossDeck = ['toadBaron', 'gooseQueen'];
      G.zones.index = ZONES.findIndex((z) => z.name === 'Meadowlands');
      L.toadElsewhere = draw();
      O.bossDeck = ['kingDrone', 'gooseQueen', 'toadBaron'];
      G.zones.index = ZONES.findIndex((z) => z.name === 'Mushroom Forest');
      L.toadHome = draw();
      G.zones.index = saved.zone;
      Object.assign(O, { bossDeck: saved.deck, bossLevel: saved.level });
      Object.assign(G.world, { amp: saved.amp, seaLevel: saved.seaLevel }); G.terrain.rebuildAll(); step(30);
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
      const spot0 = kind === 'auroraRay' && place();
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
      if (spot0) putBack(spot0);
      G.enemies.list.filter((x) => !x.boss).forEach((x) => G.enemies.removeEnemy(x));
    }
    // Boss signature moves: ~20 s engaged with each boss shows its move at least once (a blink, a dive, a perch...).
    // Every telegraphed hazard gives at least 1 s of warning, and no hazard or teleport starts while a boss is on a break.
    out.moves = { kinds: {}, hazards: [], chaseTeleports: 0 };
    {
      const M = out.moves, warn = G.enemies.warn, V = G.player.pos.constructor;
      G.enemies.warn = function (pos, r, color, t, onFire, opts) {
        const owner = opts?.owner, rec = { kind: owner?.kind, onBreak: !!owner?.chase, at: G.time, fired: -1 };
        M.hazards.push(rec);
        return warn.call(this, pos, r, color, t, (h) => { rec.fired = +(G.time - rec.at).toFixed(2); onFire?.(h); }, opts);
      };
      const tidy = () => {
        G.powerups.active.clear();
        G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
        G.enemies.list.filter((x) => !x.boss).forEach((x) => G.enemies.removeEnemy(x));
        G.enemies.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
      };
      const end = () => { if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; } tidy(); };
      const flat = (v) => v.set(G.player.forward.x, 0, G.player.forward.z).normalize();
      // Fly level at it (orbiters), or straight on (lead bosses and the Baron, who crosses in front of you).
      const STRAIGHT = new Set(['octopus', 'crab', 'puffer', 'blimpBaron', 'auroraRay']);
      // In open sky (Meadowlands, calm land): a cave's roof and bends would cut a bombing run or a dive short depending
      // on where in the cave you happen to be. Bosses in a cave and in space have their own check (moveZones).
      const { ZONES } = await import('./src/zones.js'), zone0 = G.zones.index, open = { amp: G.world.amp, seaLevel: G.world.seaLevel };
      G.zones.enter(ZONES.findIndex((z) => z.name === 'Meadowlands'), { instant: true, keepSeed: true });
      Object.assign(G.world, open); G.terrain.rebuildAll(); step(60);
      try {
        for (const [kind, def] of Object.entries(window.BOSSES_FOR_TEST)) {
          tidy();
          const land = (def.sea || def.swim) && { amp: G.world.amp, seaLevel: G.world.seaLevel };
          if (def.sea || def.swim) seaUp(); // the carrier needs open sea, Magmadora a lava sea
          G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
          const spot0 = kind === 'auroraRay' && place();
          const [e] = startBoss(kind, { mod: null, duo: false });
          const prev = e.pos.clone(), f = new V(), side = new V(), track = [];
          const S = { teleport: 0, hazards: 0, run: 0, maxSpeed: 0, blobs: 0, ring: 0, angles: 0, guards: 0, shell: 0, still: 0, diveVy: 0, joust: 0, roll: -1, shields: '', lead: [Infinity, -Infinity], lateral: 0, puffShrink: 0 };
          const buckets = new Set(), lat = [];
          let stillN = 0, fireAt = -1, puff0 = -1, h0 = M.hazards.length;
          for (let i = 0; i < 30 * 20; i++) {
            G.player.grace = 1; G.player.health = G.player.maxHealth;
            e.hp = e.maxHp; // a long look at the move, not a kill (nor rage)
            if (!STRAIGHT.has(kind)) G.player.nudgeToward(new V(e.pos.x, G.player.pos.y, e.pos.z), 2, 1 / 30);
            if (kind === 'garyPrime' && i === 30 * 4) { G.input.keys.add('Space'); fireAt = G.time; }
            step(1);
            const to = new V().subVectors(e.pos, G.player.pos), dist = to.length(), speed = e.vel.length() * 0.85;
            flat(f); side.set(-f.z, 0, f.x);
            const jump = e.pos.distanceTo(prev);
            if (jump > 80) { S.teleport++; if (e.chase) M.chaseTeleports++; }
            prev.copy(e.pos);
            if (i % 15 === 0) track.push(e.pos.clone());
            S.maxSpeed = Math.max(S.maxSpeed, Math.round(speed));
            S.blobs = Math.max(S.blobs, G.enemies.shots.filter((s) => s.owner === e).length);
            const guards = G.enemies.list.filter((x) => x.guard && x.guard.boss === e && !x.guard.pop);
            const ring = guards.filter((x) => x.guard.kind === 'ring');
            S.ring = Math.max(S.ring, ring.length);
            for (const g of ring) buckets.add(Math.floor(((Math.atan2(g.pos.z - e.pos.z, g.pos.x - e.pos.x) + Math.PI) / (Math.PI * 2)) * 12));
            S.guards = Math.max(S.guards, guards.filter((x) => x.guard.kind === 'royal' && x.pos.distanceTo(e.pos) < 30).length);
            S.shell = Math.max(S.shell, guards.filter((x) => x.guard.kind === 'shell').length);
            stillN = e.mv?.sit && speed < 2 ? stillN + 1 : 0;
            S.still = Math.max(S.still, +(stillN / 30).toFixed(1));
            S.diveVy = Math.min(S.diveVy, Math.round(e.vel.y));
            // Closing from in front of your nose: its own speed toward you (real m/s).
            if (-to.dot(G.player.forward) < -0.5 * dist) S.joust = Math.max(S.joust, Math.round((-e.vel.dot(to) / dist) * 0.85));
            if (fireAt >= 0 && S.roll < 0 && e.shield === 0) S.roll = +(G.time - fireAt).toFixed(2);
            const sh = e.shield ?? 1;
            if (S.shields.at(-1) !== (sh < 1 ? 'd' : 'u')) S.shields += sh < 1 ? 'd' : 'u';
            if (i >= 180 && !e.chase) { const ahead = to.dot(f); S.lead = [Math.min(S.lead[0], Math.round(ahead)), Math.max(S.lead[1], Math.round(ahead))]; }
            lat.push(to.dot(side));
            if (lat.length > 30) lat.shift(); // 1 s
            if (i >= 180) S.lateral = Math.max(S.lateral, Math.round(Math.max(...lat) - Math.min(...lat)));
            if (e.puffT > 0 && puff0 < 0) puff0 = dist;
            if (e.puffT > 0 && puff0 >= 0) S.puffShrink = Math.max(S.puffShrink, Math.round(puff0 - dist));
            if (!(e.puffT > 0)) puff0 = -1;
          }
          G.input.keys.delete('Space');
          // The longest straight stretch: 8 s of track whose end-to-end distance is ~its path length.
          for (let a = 0; a + 16 < track.length; a++) {
            let path = 0;
            for (let k = a; k < a + 16; k++) path += track[k].distanceTo(track[k + 1]);
            const span = track[a].distanceTo(track[a + 16]);
            if (span > path * 0.97) S.run = Math.max(S.run, Math.round(span));
          }
          S.angles = buckets.size;
          S.hazards = M.hazards.length - h0;
          S.attacks = e.attacks; // context when a signature is missing
          if (e.mv?.fired !== undefined) S.fans = e.mv.fired;
          if (e.mv?.peak !== undefined) S.mirage = e.mv.peak;
          if (e.mv?.gusts !== undefined) S.gust = e.mv.gusts;
          if (e.mv?.hops !== undefined) S.hops = e.mv.hops;
          M.kinds[kind] = S;
          end();
          if (spot0) putBack(spot0);
          if (land) { Object.assign(G.world, land); G.terrain.rebuildAll(); step(30); }
        }
      } finally {
        G.enemies.warn = warn;
        G.input.keys.delete('Space');
        G.zones.enter(zone0, { instant: true, keepSeed: true });
        Object.assign(G.world, open); G.terrain.rebuildAll(); step(60);
      }
    }
    // Gary Prime's cut: aimed 140 m ahead of you and 25 m up (it crosses in front of you, not through you), and a bump
    // mid-cut costs 10 hull, not his full 22.
    {
      const { MOVES } = await import('./src/bossmoves.js'), p = G.player;
      G.powerups.active.clear();
      const [e] = startBoss('garyPrime', { mod: null, duo: false });
      e.pos.copy(p.pos).addScaledVector(p.right, 120);
      MOVES.wingman.cut(G.enemies, e);
      const aim = p.pos.clone().addScaledVector(p.forward, 140).setY(p.pos.y + 25).sub(e.pos).normalize();
      out.garyCut = { aimErr: +e.dashDir.angleTo(aim).toFixed(3), burst: e.burst };
      // Ram him (no shots in flight, none due): the first bump is mid-cut, the second after it.
      const hits = [], damage = p.damage;
      p.damage = function (n, ...rest) { hits.push(n); return damage.call(this, n, ...rest); };
      const bump = () => {
        G.enemies.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
        Object.assign(e, { cd: 99, burst: 0, contactCd: 0 }); e.pos.copy(p.pos); e.vel.set(0, 0, 0);
        Object.assign(p, { invuln: 0, grace: 0, health: p.maxHealth });
        hits.length = 0; G.step(1 / 30); return hits.slice();
      };
      try { out.garyCut.bump = bump(); e.dash = 0; out.garyCut.bumpPlain = bump(); } finally { p.damage = damage; }
      G.objectives.current.dispose(G); G.objectives.current = null;
      G.enemies.list.slice().forEach((x) => G.enemies.removeEnemy(x));
      G.enemies.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
      p.health = p.maxHealth;
    }
    // Breathing room: fly straight away from a boss (an orbiter and a lead boss) and it lets the gap open well past its
    // fight distance, hovering where it lost you (within 30 m, 8 m/s once it has braked), holding its fire and letting the
    // hull mend faster (50 hp at the breakaway, 70+ 12 s later). Then it comes back, but only to a standoff (fight + 150 m,
    // ± 30) within 15 s (from up to the 650 m leash, closing at 30 m/s), and waits there, keeping its distance for the
    // 10 s you keep fleeing. Turn in and it re-engages within 8 s, its first attack 2.5 to 7 s later.
    // The breakaway is announced once (once for twins too), so are its return and its wait, and the boss bar says
    // "(lost you)" while it's loose, nothing on the way back, "(your move)" while it waits.
    out.breathing = {};
    const toasts = [], notify = G.ui.notify.bind(G.ui), spawnTimer = G.enemies.spawnTimer, baseSpeed = G.player.baseSpeed;
    try { // always undo the stubs below, even if a step throws
      G.ui.notify = (text, ...rest) => { toasts.push(text); return notify(text, ...rest); };
      const SHOOK = /lost you!|lost sight of you|Clean getaway/, BACK = /round two!|Break's over|wants a rematch/, WAIT = /waiting for you|polite distance|saved you a seat/;
      // Wrong-way nags: breaking away from a boss is a tactic, not ignoring the objective.
      const { T: TEXTS, fmt } = await import('./src/texts.js');
      const nags = (from) => toasts.slice(from).filter((t) => TEXTS.wrongWay.some((w) => fmt(w, G.objectives.current?.noun) === t)).length;
      const count = (re) => (from) => toasts.slice(from).filter((t) => re.test(t)).length;
      const shook = count(SHOOK), back = count(BACK), waiting = count(WAIT);
      const barText = () => document.getElementById('boss-name').textContent;
      // Real hits from here on (step() makes the plane invulnerable); grace still saves it from the terrain.
      const live = () => { G.player.grace = 1; G.player.invuln = 0; G.enemies.spawnTimer = 1e9; G.step(1 / 30); };
      const awayFrom = (e) => G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z));
      const towards = (e) => G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(G.player.pos.x - e.pos.x, G.player.pos.z - e.pos.z));
      const safe = (n = 1) => { for (let i = 0; i < n; i++) { G.player.grace = 1; G.player.health = G.player.maxHealth; step(1); } };
      // Fly at it (a lead boss settles in front by itself) until it's in range and has been on you a while: only then
      // does flying off count as a breakaway (passing it on the way in may have set one off already).
      const engage = (list) => {
        const near = (e) => e.def.lead || e.pos.distanceTo(G.player.pos) < e.def.orbit + 20;
        for (let i = 0; i < 30 * 30 && !list.every((e) => near(e) && !e.chase && e.engagedT > 4.5); i++) {
          G.player.grace = 1; G.player.health = G.player.maxHealth;
          if (!list[0].def.lead) G.player.nudgeToward(list[0].pos, 2, 1 / 30);
          step(1);
        }
      };
      const clearSky = () => { G.enemies.list.filter((x) => !x.boss).forEach((x) => G.enemies.removeEnemy(x)); G.enemies.shots.splice(0).forEach((s) => G.scene.remove(s.mesh)); };
      const endBoss = () => { G.objectives.current.dispose(G); G.objectives.current = null; clearSky(); };
      for (const kind of ['kingDrone', 'octopus']) {
        G.powerups.active.clear();
        G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
        const [e] = startBoss(kind, { mod: null, duo: false });
        const fight = e.def.lead || e.def.orbit, hint4s = G.objectives.current.hints.some((h) => /4 seconds/.test(h));
        // Engage it (a lead boss settles in front by itself; fly at an orbiter), then turn straight away from it.
        const fly = (n, at) => { for (let i = 0; i < n; i++) { G.player.grace = 1; G.player.health = G.player.maxHealth; if (at) G.player.nudgeToward(e.pos, 2, 1 / 30); step(1); } };
        fly(30 * 8);
        for (let i = 0; i < 30 * 30 && !e.def.lead && e.pos.distanceTo(G.player.pos) > fight + 20; i++) fly(1, true);
        fly(e.def.lead ? 30 * 5 : 30 * 2);
        engage([e]);
        // A pass on the way in may already have counted as a breakaway (and had its toast): start this one fresh.
        e.breaks = 0;
        G.enemies.shookAt = G.enemies.backAt = G.enemies.waitAt = -99;
        awayFrom(e);
        let gap = 0, start = -1, caughtAt = -1, waitAt = -1, waitIn = -1, waitDist = -1, minWait = Infinity, stayed = true, turnAt = -1, backAt = -1, reIn = -1;
        let quiet = false, attacks0 = 0, attacksBack = 0, again = -1, hull = -1, homeOff = 0, braking = 0, hovering = 0;
        let lostYou = false, barBack = true, barReturn = false, barWait = false, breatherWait = false, toasts0 = toasts.length, shookN = 0, backN = 0, waitN = 0, nags0 = 0, nagsAway = -1;
        for (let i = 0; i < 30 * 75; i++) {
          if (start < 0) safe(); else {
            if (turnAt >= 0) G.player.nudgeToward(e.pos, 2, 1 / 30); // 10 s into its wait: turn in for the rematch
            live();
          }
          const dist = e.pos.distanceTo(G.player.pos);
          if (start < 0 && e.chase === 'loose') {
            // The breakaway starts: patch-up test from 50 hp, as if just hit (orbs already in flight are cleared).
            start = i; attacks0 = e.attacks; nags0 = toasts.length; G.player.health = 50; G.player.sinceHit = 0; clearSky();
          }
          if (start >= 0 && e.chase === 'loose') {
            // Hovering where it lost you (enemies run at 0.85 pace: real speed is vel × 0.85).
            homeOff = Math.max(homeOff, e.pos.distanceTo(e.home));
            const v = e.vel.length() * 0.85;
            if ((i - start) / 30 < 1.55) braking = Math.max(braking, v); else hovering = Math.max(hovering, v);
          }
          if (caughtAt < 0 && e.chase === 'catch') { caughtAt = i; backN = back(toasts0); barBack = barText().includes('(lost you)'); }
          if (caughtAt < 0) gap = Math.max(gap, dist);
          if (start >= 0 && caughtAt < 0 && barText().includes('(lost you)')) lostYou = true;
          if (e.chase === 'catch' && /\((lost you|your move)\)/.test(barText())) barReturn = true;
          if (caughtAt >= 0 && waitAt < 0 && e.chase === 'wait') { waitAt = i; waitIn = (i - caughtAt) / 30; waitDist = Math.round(dist - fight); }
          if (waitAt >= 0 && turnAt < 0) {
            // Keep fleeing for 10 s: it keeps its distance and keeps waiting.
            minWait = Math.min(minWait, dist - fight);
            stayed &&= e.chase === 'wait';
            barWait ||= barText().includes('(your move)');
            breatherWait ||= G.enemies.breather; // shadowing you from its standoff is no rest: normal mending
            if (i - waitAt >= 30 * 10) { turnAt = i; shookN = shook(toasts0); waitN = waiting(toasts0); nagsAway = nags(nags0); }
          }
          if (turnAt >= 0 && backAt < 0 && !e.chase) { backAt = i; reIn = (i - turnAt) / 30; quiet = e.attacks === attacks0; attacksBack = e.attacks; }
          if (start >= 0 && i - start === 30 * 12) hull = Math.round(G.player.health);
          if (backAt >= 0 && again < 0 && e.attacks > attacksBack) again = (i - backAt) / 30;
          if (hull >= 0 && backAt >= 0 && (again >= 0 || i - backAt > 30 * 8)) break;
          if (turnAt >= 0 && backAt < 0 && i - turnAt > 30 * 10) break;
        }
        out.breathing[kind] = {
          fight, gap: Math.round(gap), waitIn, waitDist, minWait: Math.round(minWait), stayed, reIn, quiet, again, hull,
          homeOff: Math.round(homeOff), braking: +braking.toFixed(1), hovering: +hovering.toFixed(1),
          lostYou, barBack, barReturn, barWait, breatherWait, shook: shookN, back: backN, wait: waitN, nags: nagsAway, hint4s,
        };
        if (kind === 'kingDrone') {
          // Breaking away again without hurting it: a shorter loose spell (8 s, then 6 s of enemy time, which runs at 0.85
          // pace; the leash may end one sooner), and it really is over within that. Shooting it resets that.
          const looseFor = () => {
            engage([e]);
            awayFrom(e);
            let t0 = -1;
            for (let i = 0; i < 30 * 30; i++) {
              fly(1);
              if (t0 < 0 && e.chase === 'loose') t0 = i;
              if (t0 >= 0 && e.chase !== 'loose') return { t: (i - t0) / 30, max: e.looseMax };
            }
            return { t: -1 };
          };
          const first = { t: +((caughtAt - start) / 30).toFixed(2), max: e.looseMax };
          const second = looseFor();
          e.hp -= 5;
          out.breathing.repeat = { first, second, afterHit: looseFor() };
        }
        G.objectives.current.dispose(G);
        G.objectives.current = null;
        G.enemies.list.filter((x) => !x.boss).forEach((x) => G.enemies.removeEnemy(x));
      }
      // Twins: two bosses losing you is still one breakaway, so one "shook off" toast.
      {
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
        const pair = startBoss('kingDrone', { mod: null, duo: true });
        engage(pair);
        // Passes on the way in may have set off a breakaway (and its toast, which rate-limits the next one), as may the
        // King Drone's repeats above: start this one fresh, and count from here.
        pair.forEach((e) => { e.breaks = 0; });
        G.enemies.shookAt = G.enemies.backAt = -99;
        const t0 = toasts.length, mid = pair[0].pos.clone().lerp(pair[1].pos, 0.5);
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(mid.x - G.player.pos.x, mid.z - G.player.pos.z));
        let both = false;
        for (let i = 0; i < 30 * 12 && !pair.some((e) => e.chase === 'catch'); i++) { step(1); both ||= pair.every((e) => e.chase === 'loose'); }
        out.breathing.twins = { shook: shook(t0), both, breaks: pair.map((e) => e.breaks) };
        G.objectives.current.dispose(G);
        G.objectives.current = null;
        clearSky();
      }
      // From here on at a fresh run's top speed (BASE_SPEED in player.js): the world mutations above may have raised it.
      G.player.baseSpeed = 44;
      // A fresh boss that turns up past the leash (spawn spot plus height) just flies in and fights: no "coming back" or
      // waiting at a standoff before you ever met it.
      {
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
        const [e] = startBoss('kingDrone', { mod: null, duo: false }), t0 = toasts.length;
        e.pos.copy(G.player.pos).addScaledVector(G.player.forward.clone().setY(0).normalize(), 700).setY(G.player.pos.y + 60);
        let onBreak = false, attackIn = -1;
        for (let i = 0; i < 30 * 15 && attackIn < 0; i++) { G.player.nudgeToward(e.pos, 2, 1 / 30); safe(); onBreak ||= !!e.chase; if (e.attacks > 0) attackIn = +(i / 30).toFixed(1); }
        out.breathing.farSpawn = { onBreak, attackIn, waitToasts: waiting(t0) };
        endBoss();
      }
      // A boss faster than you still can't keep up with you flying off: Turbo Gary Prime, enraged (a 66 m/s cruise), is
      // shaken off flying straight at base speed, no boost, within 6 s (turning away from his orbit, not mid strafing run).
      {
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
        const [e] = startBoss('garyPrime', { mod: 'turbo', duo: false });
        e.enraged = true;
        engage([e]);
        for (let i = 0; i < 30 * 20 && !(e.dash <= 0 && Math.abs(e.pos.distanceTo(G.player.pos) - e.def.orbit) < 30); i++) { G.player.nudgeToward(e.pos, 2, 1 / 30); safe(); }
        e.breaks = 0;
        awayFrom(e);
        let t = -1;
        for (let i = 0; i < 30 * 12 && t < 0; i++) { safe(); if (e.chase === 'loose') t = +(i / 30).toFixed(1); }
        out.breathing.gary = { t, speed: Math.round(G.player.speed) };
        endBoss();
      }
      // Boosted U-turn from deep inside the orbit (Gary Prime, Steven), not mid-charge: it lets go within 4 s of the turn.
      out.breathing.uturn = {};
      for (const kind of ['garyPrime', 'seagullSteven']) {
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
        const [e] = startBoss(kind, { mod: null, duo: false });
        engage([e]);
        for (let i = 0; i < 30 * 20 && !(e.dash <= 0 && e.pos.distanceTo(G.player.pos) < e.def.orbit * 0.5); i++) { G.player.nudgeToward(e.pos, 2, 1 / 30); safe(); }
        e.breaks = 0;
        const d0 = Math.round(e.pos.distanceTo(G.player.pos));
        G.player.boost = 1;
        G.input.keys.add('ShiftLeft');
        const V = G.player.forward.constructor, f0 = G.player.forward.clone().setY(0).normalize(), turn = new V(), up = new V(0, 1, 0);
        for (let i = 0; i < 30 * 10 && G.player.forward.dot(f0) > -0.95; i++) {
          turn.copy(G.player.forward).setY(0).normalize().applyAxisAngle(up, -0.6);
          G.player.nudgeToward(G.player.pos.clone().addScaledVector(turn, 100), 3, 1 / 30);
          safe();
        }
        let t = e.chase === 'loose' ? 0 : -1;
        for (let i = 0; i < 30 * 10 && t < 0; i++) { safe(); if (e.chase === 'loose') t = +((i + 1) / 30).toFixed(1); }
        G.input.keys.delete('ShiftLeft');
        out.breathing.uturn[kind] = { d0, t };
        endBoss();
      }
      // No free sniping: shoot a boss that has lost you and it fights back at once (out of 'loose' within 0.1 s, first
      // attack about 1.2 s of enemy time later).
      {
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
        const [e] = startBoss('kingDrone', { mod: null, duo: false });
        engage([e]);
        awayFrom(e);
        for (let i = 0; i < 30 * 20 && e.chase !== 'loose'; i++) safe();
        safe(30); // well into its sulk
        const loose = e.chase === 'loose', a0 = e.attacks;
        e.hp -= 5;
        let left = -1, attack = -1;
        for (let i = 0; i < 30 * 5 && attack < 0; i++) {
          safe();
          if (left < 0 && e.chase !== 'loose') left = +((i + 1) / 30).toFixed(2);
          if (e.attacks > a0) attack = +((i + 1) / 30).toFixed(2);
        }
        out.breathing.snipe = { loose, left, attack, chase: e.chase };
        endBoss();
      }
      // Turn-back rematch: flee for 14 s, then turn round. It's well clear (fight + 120 m+), comes in no faster than
      // 33 m/s while you close, and its first attack comes at least 4 s after the turn.
      {
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
        const [e] = startBoss('gooseQueen', { mod: null, duo: false });
        engage([e]);
        e.breaks = 0;
        awayFrom(e);
        safe(30 * 14);
        const atTurn = Math.round(e.pos.distanceTo(G.player.pos) - e.def.orbit), state = e.chase, a0 = e.attacks;
        towards(e);
        let speed = 0, reIn = -1, firstAtk = -1;
        for (let i = 0; i < 30 * 15 && firstAtk < 0; i++) {
          G.player.nudgeToward(e.pos, 2, 1 / 30);
          safe();
          if (reIn < 0) { if (e.chase) speed = Math.max(speed, e.vel.length() * 0.85); else reIn = +(i / 30).toFixed(1); }
          if (e.attacks > a0) firstAtk = +(i / 30).toFixed(1);
        }
        out.breathing.rematch = { atTurn, state, speed: +speed.toFixed(1), reIn, firstAtk };
        endBoss();
      }
      // Hanging about at the standoff (circling it, not fleeing) doesn't stall the fight: it attacks within ~7 s of
      // arriving there. Persuasion's "approach" leaves a waiting boss where it is, and pulls an engaged one no closer
      // than its standoff.
      {
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
        const [e] = startBoss('kingDrone', { mod: null, duo: false });
        const standoff = e.def.orbit + 150;
        engage([e]);
        e.breaks = 0;
        awayFrom(e);
        for (let i = 0; i < 30 * 40 && e.chase !== 'wait'; i++) safe();
        const arrived = e.chase === 'wait', was = e.pos.clone();
        G.objectives.current.approach(G, 0.45);
        const pulledWaiting = +e.pos.distanceTo(was).toFixed(1), a0 = e.attacks, V = G.player.forward.constructor, side = new V();
        const round = () => side.subVectors(e.pos, G.player.pos).setY(0).normalize().set(side.z, 0, -side.x); // neither towards nor away
        round();
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-side.x, -side.z)); // stop fleeing: turn to circle it
        let attackIn = -1;
        for (let i = 0; i < 30 * 12 && attackIn < 0; i++) {
          round();
          G.player.nudgeToward(G.player.pos.clone().addScaledVector(side, 100), 2, 1 / 30);
          safe();
          if (e.attacks > a0) attackIn = +(i / 30).toFixed(1);
        }
        // Engaged, 350 m off: a 0.45 approach (27% of the way) would bring it to 255 m, but it stops at the standoff.
        const dir = new V().subVectors(e.pos, G.player.pos).normalize();
        e.pos.copy(G.player.pos).addScaledVector(dir, 350);
        const engaged = !e.chase;
        G.objectives.current.approach(G, 0.45);
        out.breathing.standoff = { arrived, pulledWaiting, attackIn, engaged, pulledTo: +(e.pos.distanceTo(G.player.pos) - standoff).toFixed(1) };
        endBoss();
      }
      // Realistic flee from a lead boss: bank round 180° on boost, then fly on. Little damage once the turn is done, and
      // once it has fallen back past fight + 120 m (within 4 s of the turn) it never comes closer while behind you: it
      // lets you go, then waits at its standoff for as long as you keep going (25 s here).
      out.fleeLead = {};
      for (const [kind, def] of Object.entries(window.BOSSES_FOR_TEST)) {
        if (!def.lead) continue;
        G.powerups.active.clear();
        G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
        G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
        const [e] = startBoss(kind, { mod: null, duo: false });
        step(30 * 12); // it flies in and settles in front
        G.player.health = G.player.maxHealth;
        G.player.boost = 1;
        G.input.keys.add('ShiftLeft');
        const V = G.player.forward.constructor, f0 = G.player.forward.clone().setY(0).normalize(), turn = new V(), up = new V(0, 1, 0);
        let turned = 0;
        for (; turned < 30 * 10 && G.player.forward.dot(f0) > -0.95; turned++) {
          // Bank right: keep aiming a little to the right of the nose, level.
          turn.copy(G.player.forward).setY(0).normalize().applyAxisAngle(up, -0.6);
          G.player.nudgeToward(G.player.pos.clone().addScaledVector(turn, 100), 3, 1 / 30);
          live();
        }
        const hp0 = G.player.health;
        let lost = 0, clear = -1, closest = Infinity;
        for (let i = 0; i < 30 * 25; i++) {
          live();
          if (i === 30 * 15 - 1) { lost = Math.round(hp0 - G.player.health); G.input.keys.delete('ShiftLeft'); }
          const dist = e.pos.distanceTo(G.player.pos) - def.lead;
          if (clear < 0 && dist > 120) clear = +(i / 30).toFixed(1);
          if (clear >= 0 && e.behind) closest = Math.min(closest, Math.round(dist));
        }
        out.fleeLead[kind] = { turn: +(turned / 30).toFixed(1), lost, clear, closest, chase: e.chase };
        G.objectives.current.dispose(G);
        G.objectives.current = null;
        clearSky();
      }
    } finally {
      G.player.baseSpeed = baseSpeed;
      G.ui.notify = notify;
      G.enemies.spawnTimer = spawnTimer;
    }
    G.player.health = G.player.maxHealth;
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
    // Durations were stretched ~1.6x (Nov 2026): every timed power-up lasts at least 1.5x what it used to.
    const OLD_DUR = { shield: 30, rapid: 30, triple: 30, homing: 30, turbo: 20, slowmo: 25, freeze: 14, double: 45, ghost: 20, mega: 25, tiny: 30 };
    out.powerupDurShort = Object.entries(OLD_DUR).filter(([id, d]) => !(window.POWERUPS_FOR_TEST[id]?.dur >= d * 1.5)).map(([id]) => id);
    // Turbo never boosts for you: with it active and boost not held, no boost. Held, it's faster than plain boost and
    // the tank doesn't drain, even from nearly empty.
    {
      const p = G.player, fb = p.freeBoost, tank = p.boost;
      p.freeBoost = 0;
      const plainMul = p.boostMul();
      G.powerups.active.set('turbo', 10);
      const idle = p.throttle(1 / 30, { boost: false });
      p.boost = 0.01;
      let held = true;
      for (let i = 0; i < 30; i++) held = p.throttle(1 / 30, { boost: true }) && held;
      out.turbo = { idle, held, tank: +p.boost.toFixed(3), plainMul, turboMul: p.boostMul() };
      G.powerups.active.delete('turbo');
      p.freeBoost = fb; p.boost = tank; p.boosting = false;
    }

    // Mega Ram (Nov 2026): a regular enemy pops on contact for 1.5x its points, a boss rammed loses MEGA.boss of its
    // max hull, is dazed and shoved, and enemy hits on you do half. Tiny Ace: a shot that would have hit a normal plane
    // whiffs past for +15, and flying low pays daredevil points (none high up).
    {
      const p = G.player, E = G.enemies, P = G.powerups;
      const { MEGA, TINY } = await import('./src/powerups.js');
      const st = E.spawnTimer, calm = E.calmTimer;
      E.spawnTimer = 1e9; E.calmTimer = 0; E.streakAt = -Infinity;
      P.active.clear(); P.active.set('mega', 10); P.update(0);
      const mega = { scale: p.sizeScale };
      const drone = E.spawn('drone', p.pos.clone().addScaledVector(p.forward, 2));
      const s0 = G.score;
      step(1);
      Object.assign(mega, { popped: drone.dead, pts: G.score - s0, want: Math.round(drone.def.score * MEGA.bonus) });
      const boss = E.spawnBoss('thunder', p.pos.clone().addScaledVector(p.forward, 3));
      boss.contactCd = 0;
      const bhp = boss.hp, h0 = p.health;
      step(1);
      Object.assign(mega, { boss: +((bhp - boss.hp) / boss.maxHp).toFixed(3), dazed: boss.dazed > 0, cd: boss.contactCd > 0, bump: +(h0 - p.health).toFixed(2) });
      E.removeEnemy(boss); E.hazards.clear();
      p.invuln = 0; p.dodging = false; p.health = p.maxHealth;
      p.damage(10);
      mega.armored = +(p.maxHealth - p.health).toFixed(2);
      P.active.clear(); P.update(0); p.health = p.maxHealth;
      p.damage(10);
      mega.plain = +(p.maxHealth - p.health).toFixed(2);
      p.health = p.maxHealth; p.invuln = 99;
      // Tiny Ace.
      P.active.set('tiny', 10); P.update(0);
      const tiny = { scale: p.sizeScale };
      const shot = E.fireOrb(p.pos.clone().addScaledVector(p.right, 4), p.forward.clone(), 0, 5);
      const s1 = G.score, h1 = p.health;
      E.updateShots(1 / 30);
      Object.assign(tiny, { whiffed: !!shot.whiffed, pts: G.score - s1, hurt: h1 - p.health });
      shot.life = 0; E.updateShots(1 / 30);
      const y0 = p.pos.y;
      P.lowT = 0; p.pos.y = G.terrain.surfaceHeight(p.pos.x, p.pos.z, p.pos.y) + 5;
      const s2 = G.score; P.daredevil(TINY.pay + 0.05); tiny.low = G.score - s2;
      // High up: 300 m over the ground, or halfway to the roof in a cave, tunnel or the reef (a boss test's extra win can
      // move the run on a zone, and 300 m up in the caverns is inside the rock, which counts as low).
      const roof = G.terrain.ceilingHeight(p.pos.x, p.pos.z, p.pos.y);
      P.lowT = 0; p.pos.y = Number.isFinite(roof) ? (p.pos.y + roof) / 2 : p.pos.y + 300;
      Object.assign(tiny, { zone: G.zones.current.name, room: Number.isFinite(roof) ? Math.round(roof - p.pos.y) : null });
      const s3 = G.score; P.daredevil(TINY.pay + 0.05); tiny.high = G.score - s3;
      p.pos.y = y0;
      P.active.clear(); P.update(0);
      // Shockwave (replaced Objective Radar, Nov 2026): a pulse pops a drone in range, chips a blimp, wipes a shot in
      // range, leaves a drone out of range alone, then waits SHOCK.every s; with nothing near it holds its charge; a boss
      // in range loses a slice of its hull.
      const { SHOCK } = await import('./src/powerups.js');
      P.active.set('shock', 10); P.shockT = 0;
      const ahead = (m) => p.pos.clone().addScaledVector(p.forward, m).addScaledVector(p.up, 2);
      const nearD = E.spawn('drone', ahead(30)), farD = E.spawn('drone', ahead(160)), blimp = E.spawn('blimp', ahead(-40));
      const orb = E.fireOrb(ahead(20), p.forward.clone(), 0, 5), bhp0 = blimp.hp;
      const s4 = G.score;
      P.shockwave(0.01);
      const shock = { popped: nearD.dead, farAlive: !farD.dead, blimpHit: +(bhp0 - blimp.hp).toFixed(2), shotGone: !E.shots.includes(orb), pts: G.score - s4, cd: +P.shockT.toFixed(2) };
      const bhp1 = blimp.hp; P.shockwave(1); shock.waits = blimp.hp === bhp1;
      for (const e of [farD, blimp]) if (!e.dead) E.removeEnemy(e);
      P.shockT = 0; P.shockwave(0.01); shock.holds = P.shockT === 0;
      const sb = E.spawnBoss('thunder', ahead(30)), sbh = sb.hp;
      P.shockwave(0.01); shock.boss = +((sbh - sb.hp) / sb.maxHp).toFixed(3);
      E.removeEnemy(sb); E.hazards.clear();
      P.active.clear(); P.update(0); P.shockT = 0;
      E.spawnTimer = st; E.calmTimer = calm;
      out.sizePU = { mega, tiny, shock, whiff: TINY.whiff, rate: TINY.rate, megaBoss: MEGA.boss, shockDmg: SHOCK.dmg, shockEvery: SHOCK.every };
    }

    // Hit-stop (Nov 2026): shooting down a regular freezes frame() for HIT_STOP; small fry (a bee) and kills not by
    // the player don't, and nothing does with reduced motion.
    {
      const E = G.enemies, { HIT_STOP } = await import('./src/enemies.js');
      const at = G.player.pos.clone().addScaledVector(G.player.forward, 200).setY(G.player.pos.y + 150), hs = {}, rm = G.comfort.reducedMotion;
      const keep = { score: G.score, kills: G.stats.kills, streak: E.streak, streakAt: E.streakAt };
      const killOne = (type, by) => { G.hitStop = 0; const e = E.spawn(type, at.clone(), { quiet: true }); E.kill(E.list.indexOf(e), by); return +G.hitStop.toFixed(3); };
      G.comfort.reducedMotion = false;
      Object.assign(hs, { drone: killOne('drone', true), bee: killOne('bee', true), crash: killOne('drone', false) });
      G.comfort.reducedMotion = true; hs.reduced = killOne('drone', true);
      G.comfort.reducedMotion = rm; G.hitStop = 0;
      G.score = keep.score; G.stats.kills = keep.kills; E.streak = keep.streak; E.streakAt = keep.streakAt;
      out.hitStop = { ...hs, want: HIT_STOP };
    }

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
    // A burst of 20 bullets into one spot digs a big pit, and the mesh shows it right away (not a chunk per 0.15 s).
    const pitSpot = spot.clone().addScaledVector(G.player.right, -60);
    const pitBefore = snapshot(pitSpot);
    for (let s = 0; s < 10; s++) {
      G.player.shootCd = 0;
      const n0 = G.player.bullets.length;
      G.player.fire();
      for (const b of G.player.bullets.slice(n0)) { b.pos.set(pitSpot.x, G.terrain.surfaceHeight(pitSpot.x, pitSpot.z) - 1, pitSpot.z); b.vel.set(0, 0, 0); }
      step(2);
    }
    step(6); // 0.2 s after the last hit
    out.pit = { mesh: deepestDrop(pitSpot, pitBefore), depth: +window.WORLD_FOR_TEST.craterDepthAt(pitSpot.x, pitSpot.z).toFixed(1) };
    // A minute's worth of hits scattered over one 160 m crater cell (far away, so nothing rebuilds) keeps the cell's
    // crater list short: hits merge into the craters already there.
    const far = G.player.pos.clone().addScaledVector(G.player.forward, 6000);
    for (let k = 0; k < 3000; k++) G.terrain.deform(far.x + Math.random() * 160, far.z + Math.random() * 160, 13, 4);
    out.pit.cellMax = window.WORLD_FOR_TEST.craterCellMax();

    // Boss moves in a cave (a roof) and in space (no ground): movers that pick spots in the air (Steven's circle, the
    // Godfeather's perches, the Mothership's blinks, King Drone's thrones) stay inside the gap and keep fighting.
    {
      const zone = G.zones.index, { ZONES } = await import('./src/zones.js'), V = G.player.pos.constructor;
      const tidy = () => {
        G.powerups.active.clear();
        G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
        G.enemies.list.filter((x) => !x.boss).forEach((x) => G.enemies.removeEnemy(x));
        G.enemies.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
      };
      out.moveZones = {};
      for (const name of ['Crystal Caverns', 'Low Orbit']) {
        G.zones.enter(ZONES.findIndex((z) => z.name === name));
        step(60);
        for (const kind of ['seagullSteven', 'pigeonDon', 'megaUfo', 'kingDrone']) {
          tidy();
          G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
          if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
          G.objectives.start(G.objectives.makeBoss(kind, { mod: null, duo: false }), 'boss');
          const e = G.enemies.list.find((x) => x.boss);
          let outside = 0, sat = false;
          for (let i = 0; i < 30 * 12; i++) {
            G.player.grace = 1; G.player.health = G.player.maxHealth; e.hp = e.maxHp;
            G.player.nudgeToward(new V(e.pos.x, G.player.pos.y, e.pos.z), 2, 1 / 30);
            step(1);
            const roof = G.terrain.ceilingHeight(e.pos.x, e.pos.z, e.pos.y), floor = G.terrain.surfaceHeight(e.pos.x, e.pos.z, e.pos.y);
            if (e.pos.y > roof - e.radius + 1 || e.pos.y < floor) outside++;
            sat ||= !!e.mv?.sit;
          }
          out.moveZones[`${name}/${kind}`] = { outside, sat, attacks: e.attacks };
          G.objectives.current.dispose(G);
          G.objectives.current = null;
          tidy();
        }
      }
      G.zones.enter(zone);
      step(60);
    }
    // Zones: completing objectives flies you on to the next zone; every zone loads cleanly.
    const zone0 = G.zones.index;
    G.zones.sinceZone = 2; // one objective away from the next zone
    if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
    G.objectives.completed = 1;
    G.objectives.next();
    G.objectives.complete(false);
    out.zoneAdvanced = G.zones.index === zone0 + 1;
    // Smooth arrival: a fog bank rolls in before the land swaps (rebuild waits, counted as stale), then lifts; the sky
    // colours blend slowly (still on their way after 2 s, settled after 15 s).
    {
      const fog = G.scene.fog, sky = G.sky, far0 = Math.min(1380, 1250 * sky.fogNow);
      const pending = G.terrain.rebuildAt !== null && G.terrain.stale, v0 = G.terrain.version;
      const gap = () => sky.cur.horizon.clone().sub(sky.tgt.horizon).toArray().reduce((m, c) => Math.max(m, Math.abs(c)), 0);
      const gap0 = gap();
      step(30);
      const at1 = { far: fog.far / far0, rebuilt: G.terrain.version > v0 };
      step(30);
      const at2 = { gap: gap() };
      step(13 * 30);
      out.zoneShift = { pending, at1, gap0: +gap0.toFixed(3), gap2: +at2.gap.toFixed(3), far15: +(fog.far / Math.min(1380, 1250 * sky.fogNow)).toFixed(2), gap15: +gap().toFixed(3), stale15: G.terrain.stale };
    }
    out.zoneBanner = [...document.querySelectorAll('#banner li')].map((l) => l.textContent);
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
      // ---- Cloud Kingdom: cloud islands float near the player, every island has a centrepiece standing on its top
      // (not on the cloud sea far below), and the new props turn up.
      if (z.name === 'Cloud Kingdom') {
        const isles = [], seen = {}, CENTRE = ['cloudCastle', 'marbleTemple', 'goldenGate', 'skyLighthouse', 'giantHarp', 'balloonDock', 'rainbowArch', 'wingedStatue'];
        instances('cloudIsland', (v) => isles.push(v.clone()));
        for (const t of [...CENTRE, 'cloudPuff', 'skyLantern', 'cloudWhale']) instances(t, () => { seen[t] = (seen[t] || 0) + 1; });
        let onTop = 0;
        for (const t of CENTRE) instances(t, (v) => { if (isles.some((s) => Math.hypot(s.x - v.x, s.z - v.z) < 1 && v.y - s.y > 0 && v.y - s.y < 10)) onTop++; });
        out.cloudKingdom = {
          islands: isles.length, near: isles.filter((s) => Math.hypot(s.x - pp.x, s.z - pp.z) < 800).length, onTop,
          kinds: Object.keys(seen).length, seen, aboveGround: isles.every((s) => s.y > G.terrain.surfaceHeight(s.x, s.z) + 100),
        };
      }
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
          p.pos.set(x, y, z); p.prevPos.copy(p.pos); p.dead = false; p.model.group.visible = true; p.health = 1e6; // a crash zeroed it
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
        // (Height counted over the 500 m stretch checked above: past its end the ground may drop away under you.)
        fly(run.x, run.y, run.z, Math.PI, 30 * 9, () => { if (p.pos.z - run.z <= 500) maxAlt = Math.max(maxAlt, p.pos.y - G.terrain.surfaceHeight(p.pos.x, p.pos.z, p.pos.y)); }); // heading +z
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
        const placeAt = (t, lift) => { const c = W.tunnelPoint(T, t); p.pos.set(c.x, c.floor + T.H * lift, c.z); p.prevPos.copy(p.pos); p.dead = false; p.model.group.visible = true; p.health = 1e6; }; // a crash zeroed it
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
  await page.evaluate(() => { window.__smokeFrames.hold = false; }); // real-time frames again, for the checks below
  // Loops under a cave roof (Crystal Caverns): a loop or upside-down objective finds a tall chamber ahead (the dome)
  // and targets it; from there, holding W (boosting or not) loops without touching the roof, thanks to the tuck; the
  // hints fit a cave; easier() tightens the tuck. Outside caves loops are as before. No safety net: a crash is only
  // recorded (no life lost), grace and invulnerability are off, no enemies, and objectives don't complete mid-check.
  report.caveLoop = await page.evaluate(async () => {
    const G = window.G, p = G.player, V = p.pos.constructor, Y = new V(0, 1, 0);
    const { ZONES } = await import('./src/zones.js');
    const { TUCK } = await import('./src/player.js');
    const { waterLine } = await import('./src/world.js');
    const saved = { zone: G.zones.index, baseSpeed: p.baseSpeed, update: G.objectives.update, spawn: G.enemies.spawnTimer, crash: p.crash, health: p.health, cooldown: G.objectives.cooldown, notify: G.ui.notify };
    const out = {};
    let crashed = null, notes = [];
    p.crash = (r) => { crashed ||= r; };
    G.ui.notify = function (text, ...rest) { notes.push({ text, t: G.time }); return saved.notify.call(this, text, ...rest); };
    G.objectives.update = () => {};
    G.enemies.spawnTimer = 1e9;
    p.baseSpeed = 44; // a fresh run's cruise speed (the speed mutation may have raised it by now)
    const clearObj = () => { if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; } G.persuasion.reset(null); };
    const calm = () => { G.enemies.list.slice().forEach((e) => G.enemies.removeEnemy(e)); G.enemies.shots.splice(0).forEach((s) => G.scene.remove(s.mesh)); };
    const frame = () => { p.invuln = 0; p.grace = 0; p.health = 1e6; G.step(1 / 60); };
    const enter = (i) => { G.zones.enter(i); for (let k = 0; k < 30; k++) G.step(0.1); G.objectives.cooldown = 1e9; clearObj(); calm(); };
    const floor = (x, z) => Math.max(G.terrain.surfaceHeight(x, z), waterLine());
    const chamber = (t, d) => { // lowest roof minus highest floor over the loop's footprint (as the dome search sees it)
      let f = -Infinity, r = Infinity;
      for (let a = -10; a <= 70; a += 10) for (const s of [-15, 0, 15]) { const x = t.x + d.x * a - d.z * s, z = t.z + d.z * a + d.x * s; f = Math.max(f, floor(x, z)); r = Math.min(r, G.terrain.ceilingHeight(x, z)); }
      return Math.round(r - f);
    };
    const place = (pos, dir) => {
      p.pos.copy(pos); p.prevPos.copy(p.pos);
      p.quat.setFromAxisAngle(Y, Math.atan2(-dir.x, -dir.z)); p.updateAxes();
      Object.assign(p, { speed: p.baseSpeed, loopAccum: 0, boost: 1, maneuver: null, landed: null, dead: false, god: false });
      p.model.group.visible = true;
    };
    // Hold W (boosting: at full boost speed already, Shift held) until one full loop, or (invert) until upside down, then let go for 4 s inverted.
    const fly = ({ boost = false, invert = false, max = 9 } = {}) => {
      crashed = null; calm();
      let t = 0, pa = 0, inv = 0, done = false, released = false, y0 = p.pos.y, ymax = y0, tucked = false;
      if (boost) { G.input.keys.add('ShiftLeft'); p.speed = p.baseSpeed * 1.7; }
      G.input.keys.add('KeyW');
      while (t < max && !crashed && !done) {
        frame(); t += 1 / 60; ymax = Math.max(ymax, p.pos.y); tucked ||= p.tuckT > 0;
        if (invert) {
          if (!released && p.up.y < -0.9 && p.forward.y < 0.15) { G.input.keys.delete('KeyW'); released = true; }
          if (p.up.y < -0.3) inv += 1 / 60;
          done = inv >= 4;
        } else { done = pa > 5 && Math.abs(p.loopAccum) < 1; pa = Math.abs(p.loopAccum); }
      }
      G.input.keys.clear();
      return { done, crashed, climb: Math.round(ymax - y0), secs: +t.toFixed(2), tucked };
    };
    // Start the objective from a few spots (wandering a little between tries) until it finds a dome.
    const startDome = (type) => {
      for (let k = 0; k < 12; k++) {
        clearObj();
        p.god = true; p.quat.setFromAxisAngle(Y, k * 2.4); p.updateAxes();
        for (let i = 0; i < 30; i++) G.step(1 / 20);
        p.god = false;
        G.objectives.startType(type);
        const o = G.objectives.current, tg = o.target();
        if (!tg) continue;
        return { o, tg: tg.clone(), dir: o.dome.dir.clone(), tries: k + 1, dist: Math.round(tg.distanceTo(p.pos)), chamber: chamber(tg, o.dome.dir), above: Math.round(tg.y - floor(tg.x, tg.z)), virtual: o.virtual, hints: o.hints };
      }
      return null;
    };
    try {
      enter(ZONES.findIndex((z) => z.world.cave));
      for (const type of ['loop', 'inverted']) {
        const d = startDome(type);
        out[type] = d && { tries: d.tries, dist: d.dist, chamber: d.chamber, above: d.above, virtual: d.virtual, hints: d.hints };
        if (!d) continue;
        G.persuasion.reset(null);
        if (type === 'loop') {
          // The "LOOP HERE" sign fades out as you arrive, so it isn't sitting over your plane and crosshair.
          const signAt = (pos) => { p.pos.copy(pos); d.o.dome.update(0); return d.o.dome.sign.material.opacity; };
          out.signFade = { at: signAt(d.tg), far: signAt(d.tg.clone().addScaledVector(d.dir, -200)) };
          place(d.tg, d.dir); out.loopW = fly();
          place(d.tg, d.dir); out.loopBoost = fly({ boost: true });
          // easier() under a roof tightens the tuck (+0.25, up to 2.2): each loop from the dome is shorter. dispose() resets it.
          out.easier = [];
          for (let k = 0; k < 4; k++) {
            const text = k ? d.o.easier(G) : null;
            place(d.tg, d.dir);
            out.easier.push({ tuck: +p.loopTuck.toFixed(2), req: p.loopRequirement, text, ...fly() });
          }
          clearObj();
          out.tuckAfter = p.loopTuck;
          // The roof warning: a loop past 60° with the roof 15 m up warns once, then not again for 3 s.
          const r = G.terrain.ceilingHeight(d.tg.x, d.tg.z);
          const at = new V(d.tg.x, r - 15, d.tg.z);
          place(at, d.dir);
          notes = [];
          const t0 = G.time;
          G.input.keys.add('KeyW');
          for (let i = 0; i < 60 * 3.3; i++) { p.pos.copy(at); p.loopAccum = 1.2; frame(); } // held in place, mid-loop
          G.input.keys.clear();
          out.roofWarns = notes.filter((n) => n.text === 'Roof! Pull harder!').map((n) => +(n.t - t0).toFixed(2));
        } else {
          // 4 s inverted flies on well past the dome, where the roof may come down again: up to 3 domes, one miss allowed.
          out.inverted.fly = [];
          for (let k = 0, e = d; k < 3 && e; k++) {
            place(e.tg, e.dir);
            out.inverted.fly.push(fly({ invert: true, max: 14 }));
            if (out.inverted.fly.at(-1).done) break;
            e = startDome('inverted');
            G.persuasion.reset(null);
          }
          clearObj();
        }
      }
      // Hot & cold survives a target it can't face (NaN): it used to throw.
      const d = startDome('loop');
      if (d) {
        const P = G.persuasion, avail = P.available;
        P.available = (o) => avail.call(P, o).filter((x) => x.t.id === 'hotCold');
        P.escalate();
        P.available = avail;
        const fx = P.effects.at(-1);
        d.o.target = () => new V(NaN, 0, 0);
        try { fx.update(0.1); out.hotColdNaN = 'ok'; } catch (e) { out.hotColdNaN = e.message; }
        clearObj();
      }
      // Outside caves nothing changed: a held-W loop in the start zone climbs ~71 m in ~5.8 s, with no tuck; the hints
      // still suggest boost and climbing; easier() lowers the loop requirement.
      enter(0);
      const dir = new V(0, 0, -1);
      place(new V(p.pos.x, floor(p.pos.x, p.pos.z) + 350, p.pos.z), dir);
      for (let i = 0; i < 20; i++) frame(); // settle level
      place(p.pos.clone(), dir);
      out.zone0 = fly();
      G.objectives.startType('loop');
      out.zone0.loopHints = G.objectives.current.hints;
      out.zone0.loopTarget = G.objectives.current.target();
      G.objectives.current.easier(G);
      out.zone0.easier = { req: +p.loopRequirement.toFixed(2), tuck: p.loopTuck };
      clearObj();
      G.objectives.startType('inverted');
      out.zone0.invHints = G.objectives.current.hints;
      out.zone0.invVirtual = G.objectives.current.virtual;
      clearObj();
    } finally {
      G.input.keys.clear();
      p.crash = saved.crash;
      G.ui.notify = saved.notify;
      G.objectives.update = saved.update;
      G.enemies.spawnTimer = saved.spawn;
      G.objectives.cooldown = saved.cooldown;
      G.zones.enter(saved.zone);
      for (let k = 0; k < 30; k++) G.step(0.1);
      p.dead = false; p.god = false; p.health = saved.health; p.baseSpeed = saved.baseSpeed; p.loopTuck = TUCK; p.loopRequirement = 1;
    }
    return out;
  });
  // Stunts, driven by real double key presses and synthetic touch flicks on the steering stick. Over flat land (no
  // mountains, hills, cliffs, canyons or pinnacles): 200 m up over a mountain range, grace would lift the plane over a
  // peak mid-stunt. Not drained: a drained sea carves its canyons 400 m deep, and the plane would start in one.
  const FLAT = { amp: 0, roughness: 0, hillBase: 0, terrace: 0, mesa: 0, canyon: 0, spikes: 0 };
  const land = await page.evaluate((FLAT) => {
    const G = window.G, was = Object.fromEntries(Object.keys(FLAT).map((k) => [k, G.world[k]]));
    Object.assign(G.world, FLAT);
    G.terrain.rebuildAll();
    G.terrain.update(G.player.pos, 999); // every chunk around rebuilt now: heights are read from built chunks
    return was;
  }, FLAT);
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
    G.input.clearKeyTaps();
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
  // Flicks in real time: each touch is a list of [dx px, ms to get there] stick moves (each ramped in ~10 px steps).
  // Returns how many gestures fired. A flick must pass 80 px within 220 ms of leaving the centre.
  const timedFlicks = (touches) => page.evaluate(async (touches) => {
    const G = window.G, c = document.getElementById('game'), g = G.input.gestures;
    let n = 0;
    g.push = (...a) => { n += a.length; return Array.prototype.push.apply(g, a); };
    const ev = (type, x) => {
      const t = new Touch({ identifier: 8, target: c, clientX: 150 + x, clientY: 400 });
      c.dispatchEvent(new TouchEvent(type, { changedTouches: [t], touches: type === 'touchend' ? [] : [t], bubbles: true, cancelable: true }));
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const moves of touches) {
      let x = 0;
      ev('touchstart', 0);
      for (const [to, ms] of moves) {
        const k = Math.max(1, Math.round(Math.abs(to - x) / 10)), from = x;
        for (let i = 1; i <= k; i++) { if (ms) await wait(ms / k); x = from + ((to - from) * i) / k; ev('touchmove', x); }
      }
      ev('touchend', x);
    }
    delete g.push;
    g.length = 0;
    return n;
  }, touches);
  report.flicks = {};
  await setUp(200); report.flicks.quick90 = await timedFlicks([[[45, 0], [90, 20], [0, 0], [45, 0], [90, 20]]]);
  await setUp(200); report.flicks.steer75 = await timedFlicks([[[75, 300], [0, 50], [75, 100]]]);
  await setUp(200); report.flicks.push70 = await timedFlicks([[[70, 0]], [[70, 0]]]);
  // Slow: from the edge of the centre (20 px) it takes 280 ms to reach 70 px, then 90. The old rule (55 px, no clock) made this a stunt.
  await setUp(200); report.flicks.slow90 = await timedFlicks([[[20, 0], [70, 280], [90, 0], [0, 0], [20, 0], [70, 280], [90, 0]]]);
  await setUp(20); await keyTwice('ArrowDown'); report.stunts.lowSplitS = await measure();
  await setUp(200); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(500); await page.keyboard.press('ArrowLeft'); report.stunts.slowTaps = await measure();
  // Holding a key to steer (300 ms: past KEY_TAP_HOLD_MS, inside the old 350 ms window), then pressing it again, is not
  // a double tap; nor is W, D, W.
  await setUp(200); await page.keyboard.down('ArrowUp'); await page.waitForTimeout(300); await page.keyboard.up('ArrowUp'); await page.keyboard.press('ArrowUp'); report.stunts.heldThenTap = await measure();
  await setUp(200); await page.keyboard.press('KeyW'); await page.keyboard.press('KeyD'); await page.keyboard.press('KeyW'); report.stunts.otherKeyBetween = await measure();
  await page.evaluate((land) => { const G = window.G; Object.assign(G.world, land); G.terrain.rebuildAll(); G.terrain.update(G.player.pos, 999); }, land);

  // Phone HUD (a touch phone context per size): the title card shows the touch rows, and with the objective card, an
  // enraged boss bar, two notes, a power-up and the touch buttons up, no HUD panel overlaps another; nor does the success card.
  report.phone = {};
  for (const [w, h] of [[390, 844], [360, 640]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const pp = await guard(await ctx.newPage());
    await pp.goto(origin + '/');
    await pp.waitForFunction(() => window.G && window.G.terrain.chunks.size > 20, null, { timeout: 30000 });
    await pp.evaluate(() => { window.G.finds.off = true; }); // no surprise hidden finds while other systems are measured
    const rows = await pp.evaluate(titleRows);
    await pp.evaluate(() => document.getElementById('start').click());
    const hud = await pp.evaluate(async () => {
      const G = window.G, p = G.player, c = document.getElementById('game');
      const t = new Touch({ identifier: 1, target: c, clientX: 100, clientY: 500 });
      c.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [t], touches: [t], bubbles: true, cancelable: true }));
      c.dispatchEvent(new TouchEvent('touchend', { changedTouches: [t], touches: [], bubbles: true, cancelable: true }));
      p.lives = 1e6; p.god = true;
      G.enemies.spawnTimer = 1e9;
      for (let i = 0; i < 30; i++) { p.invuln = 99; G.step(1 / 30); }
      if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
      G.objectives.cooldown = 1e9;
      G.objectives.start(G.objectives.makeBoss('kingDrone'), 'boss');
      for (const e of G.enemies.list) if (e.boss) e.enraged = true;
      G.powerups.activate('shock');
      G.ui.notify('A first note, long enough to wrap onto a second line on a phone.', 'info', 4, 2);
      G.ui.notify('A second note, also rather chatty.', 'warn', 4, 2);
      p.invuln = 99; G.step(1 / 30);
      await new Promise((r) => setTimeout(r, 1300)); // the card's pop animation settles
      const ids = ['topleft', 'objective', 'boss-bar', 'bars', 't-boost', 't-fire'];
      const rect = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { id, left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
      const out = { rects: ids.map(rect), name: document.getElementById('boss-name').textContent, notes: document.querySelectorAll('.note').length, pu: document.querySelectorAll('.pu').length };
      G.objectives.complete(false); // the success card, with real lines
      await new Promise((r) => setTimeout(r, 600)); // it slides in
      out.banner = { ...rect('banner'), show: document.getElementById('banner').classList.contains('show') };
      return out;
    });
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const overlaps = [];
    hud.rects.forEach((a, i) => hud.rects.slice(i + 1).forEach((b) => { if (hit(a, b)) overlaps.push(`${a.id}/${b.id}`); }));
    hud.rects.filter((a) => a.id !== 'boss-bar').forEach((a) => { if (hit(a, hud.banner)) overlaps.push(`banner/${a.id}`); });
    report.phone[`${w}x${h}`] = { rows, overlaps, enraged: /ENRAGED/.test(hud.name), notes: hud.notes, pu: hud.pu, banner: hud.banner.show, sized: hud.rects.every((r) => r.right > r.left && r.bottom > r.top) };
    await ctx.close();
  }

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
  // HMS Overkill from the Dune Sea: never King Drone instead (it finds open sea, or flies off to the Tropical Archipelago).
  await page.evaluate(() => window.G.devmenu.open());
  await page.click('#devmenu [data-boss="carrier"]');
  report.devmenu.carrier = await page.evaluate(() => {
    const G = window.G, e = G.enemies.list.find((x) => x.boss);
    return { boss: G.objectives.current?.boss || null, zone: G.zones.current.name, afloat: !!e && Math.abs(e.pos.y - G.world.seaLevel) < 0.01, dist: e ? Math.round(e.pos.distanceTo(G.player.pos)) : null };
  });
  await page.evaluate(() => window.G.devmenu.open());
  await page.click('#devmenu [data-zone="3"]');
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

  // Hidden finds (finds.js): rare coins and lore notes off your line, low, behind peaks and up high.
  report.finds = await page.evaluate(async () => {
    const G = window.G, F = G.finds, p = G.player;
    const { groundAt } = await import('./src/objectives.js');
    const { FINDS, COIN, NOTE, LORE } = await import('./src/finds.js');
    G.zones.enter(0);
    G.powerups.active.clear(); // no Double Points
    F.reset(); F.resetRun(); F.off = false; p.god = true;
    const out = { first: F.timer, n: LORE.length, cfg: { first: FINDS.first, every: FINDS.every, coin: COIN, note: NOTE.points } };
    const flat = (v) => Math.hypot(v.x - p.pos.x, v.z - p.pos.z);
    const side = { x: -p.forward.z, z: p.forward.x }, sl = Math.hypot(side.x, side.z);
    // Hiding spots, 20 of each kind.
    out.spots = {};
    for (const kind of ['low', 'peak', 'sky']) {
      const r = { kinds: new Set(), minD: 1e9, maxD: 0, minUp: 1e9, maxUp: -1e9, minSide: 1e9, maxY: -1e9 };
      for (let k = 0; k < 20; k++) {
        const { pos, spot } = F.hidingSpot(kind);
        r.kinds.add(spot);
        const d = flat(pos), g = groundAt(G, pos.x, pos.z, p.pos.y);
        const up = kind === 'sky' ? pos.y - Math.max(p.pos.y, g) : pos.y - g;
        r.minD = Math.min(r.minD, d); r.maxD = Math.max(r.maxD, d);
        r.minUp = Math.min(r.minUp, up); r.maxUp = Math.max(r.maxUp, up);
        r.minSide = Math.min(r.minSide, Math.abs(((pos.x - p.pos.x) * side.x + (pos.z - p.pos.z) * side.z) / sl));
        r.maxY = Math.max(r.maxY, pos.y);
      }
      r.kinds = [...r.kinds];
      out.spots[kind] = r;
    }
    // Spawning: off means none; on, one appears when the timer runs out, and the next waits 55-95 s.
    F.off = true; F.timer = 0.01; F.update(0.02); out.offNone = !F.find;
    F.off = false; F.timer = 0.01; F.update(0.02);
    out.spawned = !!F.find && ['coin', 'note'].includes(F.find.kind) && F.G.scene.children.includes(F.find.mesh);
    out.nextIn = F.timer;
    out.glint = { inScene: G.scene.children.includes(F.glint), fixedSize: F.glint.material.sizeAttenuation === false, hidesBehind: F.glint.material.depthTest === true };
    // Lost: past its life it goes away.
    F.find.life = 0.01; F.update(0.02); out.expired = !F.find && !G.scene.children.includes(F.glint);
    // The chime: 100 m to your right, a ping panned right, higher than far out.
    const pings = [], ping = G.audio.ping;
    G.audio.ping = (pan, pitch) => pings.push([pan, pitch]);
    F.drop('coin', p.pos.clone().addScaledVector(p.right, 100));
    F.update(0.016); F.update(0.016);
    out.chime = pings.slice();
    F.clear(); pings.length = 0;
    F.drop('coin', p.pos.clone().addScaledVector(p.right, 300)); F.update(0.016);
    out.farPings = pings.length;
    G.audio.ping = ping;
    // Warmer, warmer: no HUD hint from far away or mid range, and never a light column; close in the HUD says so once
    // and rings it (or points at it from the screen edge), and the twinkle is bigger than far out.
    const notes = [], notify = G.ui.notify;
    G.ui.notify = (t) => notes.push(t);
    const pip = document.getElementById('find-pip');
    const at = (m, dir = p.forward) => { F.clear(); F.drop('coin', p.pos.clone().addScaledVector(dir, m)); F.find.t = 0; F.update(0.016); };
    at(700);
    out.warm = { far: { beam: 'beam' in F, pip: pip.style.display, glint: F.glint.scale.x, notes: notes.length } };
    at(380);
    out.warm.mid = { beam: 'beam' in F, pip: pip.style.display, notes: notes.length };
    at(120);
    F.update(0.016);
    out.warm.near = { beam: 'beam' in F, tall: G.scene.children.filter((o) => o.visible && o.geometry?.type === 'CylinderGeometry' && o.position.distanceTo(F.find.pos) < 1).length, pip: pip.style.display, ring: !pip.classList.contains('edge'), glint: F.glint.scale.x, notes: notes.slice() };
    at(120, p.right.clone().negate());
    out.warm.side = { edge: pip.classList.contains('edge'), note: notes[notes.length - 1] };
    F.clear();
    out.warm.cleared = pip.style.display;
    G.ui.notify = notify;
    // A coin: points, full boost, a hull patch, counted (and remembered).
    F.clear();
    p.boost = 0.1; p.health = p.maxHealth - 50;
    let s0 = G.score;
    F.drop('coin', p.pos.clone().addScaledVector(p.forward, 4)); F.update(0.016);
    out.coin = { gone: !F.find, score: G.score - s0, boost: p.boost, hull: p.maxHealth - p.health, run: F.runCoins, total: F.coins, stored: localStorage.getItem('landed.coins') };
    // A lore note: points and its card (no pause), remembered; a click folds it away.
    s0 = G.score;
    const paused0 = G.paused;
    F.drop('note', p.pos.clone().addScaledVector(p.forward, 4));
    const id = F.find.note.id;
    F.update(0.016);
    const card = document.getElementById('lore-card');
    out.note = {
      score: G.score - s0, shown: card.classList.contains('show'), paused: G.paused !== paused0, count: card.querySelector('.lore-count').textContent,
      title: card.querySelector('b').textContent === LORE.find((n) => n.id === id).title, stored: JSON.parse(localStorage.getItem('landed.lore')).includes(id),
      notLast: !LORE.find((n) => n.id === id).last,
    };
    card.click(); out.note.folded = !card.classList.contains('show');
    out.title = document.getElementById('finds-count').textContent;
    // The last page turns up only once every other note is read; with every note read, a note drop is a coin.
    F.lore = new Set(LORE.filter((n) => !n.last && n.id !== 'dent').map((n) => n.id));
    let lastEarly = 0;
    for (let k = 0; k < 40; k++) if (F.nextNote().last) lastEarly++;
    F.lore.add('dent');
    out.last = { early: lastEarly, then: F.nextNote()?.last === true };
    F.lore = new Set(LORE.map((n) => n.id));
    out.allRead = F.drop('note', p.pos.clone().addScaledVector(p.up, 300)).kind;
    // A new run: nothing out there, the clock starts over, what you found stays found.
    F.resetRun();
    out.reset = { none: !F.find, timer: F.timer, runCoins: F.runCoins, lore: F.lore.size };
    F.reset(); F.off = true; p.god = false;
    return out;
  });

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
    s.trigger('aboard'); // its real path (landing on the carrier's deck) is in the boss checks
    out.list = s.list().length;
    out.all = s.list().every((x) => x.found);
    try { out.stored = JSON.parse(localStorage.getItem('landed.secrets')).length; } catch { out.stored = 0; }
    return out;
  });
  // Feel: the pull-up warning (ground glow) and close shaves, hit / kill feedback (tick, score pop-ups, camera shake, boost whoosh),
  // the boost tank's timing, the crash flash, the portrait FOV, reduced motion and saved settings. Over calmed,
  // drained land (as for the forts), with no enemies, objectives or power-ups, and no safety net where it matters.
  const F = await page.evaluate((FLAT) => {
    const G = window.G, p = G.player, out = {}, U = G.pullup;
    const V = p.pos.constructor, Q = p.quat.constructor, UP = new V(0, 1, 0), XA = new V(1, 0, 0);
    const god = p.god, land = Object.fromEntries([...Object.keys(FLAT), 'seaLevel'].map((k) => [k, G.world[k]]));
    p.god = false;
    if (G.relax) G.setRelax(false);
    G.enemies.spawnTimer = 1e9;
    G.enemies.list.slice().forEach((e) => G.enemies.removeEnemy(e));
    G.enemies.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
    if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
    G.persuasion.reset(null);
    G.objectives.cooldown = 1e9;
    G.powerups.active.clear();
    G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
    G.powerups.timer = 1e9;
    Object.assign(G.world, FLAT, { seaLevel: -400 }); // flat (see the stunts) and drained: canyons are off, so no 400 m gorges
    G.terrain.rebuildAll();
    G.terrain.update(p.pos, 999); // every chunk around rebuilt now: heights are read from built chunks
    for (let k = 0; k < 30; k++) { p.invuln = 99; G.step(1 / 30); }
    const notes = [], notify = G.ui.notify.bind(G.ui);
    G.ui.notify = (text, ...a) => { notes.push(text); return notify(text, ...a); };
    let flashPeak = 0;
    const flash = G.ui.flash.bind(G.ui);
    G.ui.flash = (...a) => { flash(...a); flashPeak = Math.max(flashPeak, G.ui.flashA); };
    let reason = null;
    const crash = p.crash.bind(p);
    p.crash = (r) => { reason = `${r} at ${Math.round(p.pos.y - ground())} m, hp ${Math.round(p.health)}, zone ${G.zones.index}, tunnels ${!!G.world.tunnels}`; crash(r); };
    const ground = () => G.terrain.surfaceHeight(p.pos.x, p.pos.z, p.pos.y);
    const nose = (pitch) => { const yaw = Math.atan2(-p.forward.x, -p.forward.z); return new Q().setFromAxisAngle(UP, yaw).multiply(new Q().setFromAxisAngle(XA, pitch)); };
    // A fresh plane `above` m over the ground, nose at `pitch` rad, cruising, no boost, no safety net. Where the whole
    // corridor it flies (600 m ahead, 10 m either side) is flat: flat land still has sea basins and old craters or
    // bullet pits, so the terrain roll never matters. Pending crater rebuilds land first, or the scan would read the
    // ground from before them and the hole (or its rim) would open under the plane mid-dive. No flat corridor: throw.
    const flush = (at) => {
      G.terrain.update(at, 999);
      for (let n = 0; n < 99 && G.terrain.dirty.size; n++) { G.terrain.nextDirtyBuild = 0; G.terrain.update(at, 0); }
    };
    const place = (above, pitch) => {
      const f = new V(p.forward.x, 0, p.forward.z).normalize(), at = p.pos.clone();
      let flat = false;
      for (let k = 0; k < 60 && !flat; k++) {
        if (k) at.addScaledVector(f, 300);
        flush(at); // the ground the scan reads is the ground the plane will meet
        let lo = Infinity, hi = -Infinity;
        for (let d = -20; d <= 600; d += 5) {
          for (const s of [-10, 0, 10]) { const g = G.terrain.surfaceHeight(at.x + f.x * d - f.z * s, at.z + f.z * d + f.x * s); lo = Math.min(lo, g); hi = Math.max(hi, g); }
        }
        flat = hi - lo < 3;
      }
      if (!flat) throw new Error('feel: no flat corridor found to place the plane');
      p.pos.copy(at);
      p.spawn(p.pos.x, p.pos.z, Math.atan2(-p.forward.x, -p.forward.z));
      p.quat.copy(nose(pitch)); p.updateAxes();
      p.pos.y = ground() + above; p.prevPos.copy(p.pos);
      p.invuln = 0; p.grace = 0; p.freeBoost = 0; p.wind.set(0, 0, 0);
    };
    const warned = () => U.on && U.glow.classList.contains('on') && +U.glow.style.opacity > 0;
    // Fly `frames` steps (or until something returns true / the plane crashes); was the glow ever on screen?
    const live = (frames, each = () => {}) => {
      let shown = false;
      for (let k = 0; k < frames && !p.dead; k++) { if (each(k)) break; p.invuln = 0; p.grace = 0; G.step(1 / 30); shown ||= warned(); }
      return shown;
    };
    const settle = () => { for (let k = 0; k < 120 && p.dead; k++) G.step(1 / 30); for (let k = 0; k < 100; k++) { p.invuln = 99; G.step(1 / 30); } };

    // Diving at the ground: the warning shows over a second before the crash, and the glow grows stronger as the
    // ground nears. No "PULL UP!" text anywhere while it's on. The crash flash peaks at 0.5.
    place(60, -Math.PI / 6);
    let t = 0, shownAt = null, glowFirst = null, glowNear = null, text = null;
    const pullUpText = () => [...document.querySelectorAll('body *')].some((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      && [...e.childNodes].some((n) => n.nodeType === 3 && /PULL UP/i.test(n.textContent)));
    for (let k = 0; k < 300 && !p.dead; k++) {
      p.invuln = 0; p.grace = 0; G.step(1 / 30); t += 1 / 30;
      if (shownAt === null && warned()) { shownAt = t; glowFirst = +U.glow.style.opacity; }
      if (U.on && U.tti <= 0.6) glowNear = Math.max(glowNear ?? 0, +U.glow.style.opacity);
      if (U.on && text === null) text = pullUpText();
    }
    out.dive = { dead: p.dead, lead: shownAt === null ? null : +(t - shownAt).toFixed(2), flashPeak, glowFirst, glowNear, text, chipEl: document.querySelector('#pullup-chip') };
    settle();
    // Level at 100 m for 10 s: never. And cruising on a landscape screen keeps the 70° view.
    place(100, 0);
    reason = null;
    out.level = { shown: live(300), dead: p.dead, reason, fov: +G.camera.fov.toFixed(1) };
    settle();
    // Level flight (which looks like a landing approach) still warns when the ground ahead isn't landable. Seconds
    // from the warning to the crash, and the crash reason; null lead: it never showed.
    const lead = (frames) => {
      let t = 0, at = null;
      reason = null;
      for (let k = 0; k < frames && !p.dead; k++) { p.invuln = 0; p.grace = 0; G.step(1 / 30); t += 1 / 30; if (at === null && warned()) at = t; }
      return { dead: p.dead, reason, lead: at === null ? null : +(t - at).toFixed(2) };
    };
    // 15 m up, level, toward a rise of 0.6 m per metre starting 150 m ahead (laid over the flat land, for this check
    // only: the crash and the warning both read G.terrain.surfaceHeight).
    place(15, 0);
    {
      const sh = G.terrain.surfaceHeight, o = p.pos.clone(), f = new V(p.forward.x, 0, p.forward.z).normalize();
      G.terrain.surfaceHeight = function (x, z, y) { return sh.call(this, x, z, y) + Math.max(0, (x - o.x) * f.x + (z - o.z) * f.z - 150) * 0.6; };
      out.rise = lead(300);
      G.terrain.surfaceHeight = sh;
    }
    settle();
    // On approach (wings level, nose -0.06, 4 m up) over flat, landable ground with a steep rise (2 m per metre)
    // 75 m ahead: the near probes touch the landable strip, a later one hits the rise, and that one still warns.
    place(4, -0.06);
    {
      const sh = G.terrain.surfaceHeight, o = p.pos.clone(), f = new V(p.forward.x, 0, p.forward.z).normalize();
      G.terrain.surfaceHeight = function (x, z, y) { return sh.call(this, x, z, y) + Math.max(0, (x - o.x) * f.x + (z - o.z) * f.z - 75) * 2; };
      out.approachWall = { approach: U.approach(), ...lead(300) };
      G.terrain.surfaceHeight = sh;
    }
    settle();
    // The sea is never landable: a gentle glide (wings level, nose -0.08) from 30 m onto it warns; level 6 m over it doesn't.
    place(30, -0.08);
    G.world.seaLevel = ground() + 5; // the flat land is under the sea now
    p.pos.y = G.world.seaLevel + 30; p.prevPos.copy(p.pos);
    out.seaGlide = lead(600);
    settle();
    place(6, 0);
    G.world.seaLevel = ground() + 5;
    p.pos.y = G.world.seaLevel + 6; p.prevPos.copy(p.pos);
    reason = null;
    out.seaLevel = { shown: live(240), dead: p.dead, reason };
    G.world.seaLevel = -400;
    settle();
    // Pulling out low: dive steeply from 10 m (faster than any slope here falls away) to under 5 m, then climb away. Exactly +25 and a "Close shave!" note; a second
    // one straight after pays nothing (15 s cooldown); in Relax Mode the warning still shows, for no points.
    const pullOut = () => {
      const s0 = G.score, n0 = notes.length;
      reason = null;
      place(10, -0.5);
      let shown = live(60, () => p.pos.y - ground() < 5);
      const up = nose(0.35);
      shown = live(60, () => { p.quat.copy(up); p.updateAxes(); }) || shown;
      return { shown, dead: p.dead, reason, min: +U.minClear.toFixed(1), off: !U.on, points: G.score - s0, notes: notes.slice(n0).filter((n) => /^Close shave!/.test(n)) };
    };
    out.shave1 = pullOut();
    out.shave2 = pullOut();
    U.lastShave = -Infinity; // past the cooldown
    G.setRelax(true);
    out.shaveRelax = pullOut();
    G.setRelax(false);
    G.enemies.spawnTimer = 1e9;
    // Developer god mode and Ghost Mode can't hit the ground: no warning.
    p.god = true; place(60, -Math.PI / 6); out.godShown = live(90); p.god = false;
    G.powerups.active.set('ghost', 10); place(60, -Math.PI / 6); out.ghostShown = live(90); G.powerups.active.clear();
    p.crash = crash;
    place(150, 0);
    settle();

    // Hitting sounds like a tick, being hit like a hit. Kills and broken parts pop their points; at most 6 at once.
    const calls = { tick: 0, hit: 0, whoosh: 0 };
    for (const name of Object.keys(calls)) { const f = G.audio[name].bind(G.audio); G.audio[name] = (...a) => { calls[name]++; return f(...a); }; }
    const step = (n) => { for (let k = 0; k < n; k++) { p.invuln = 99; G.step(1 / 30); } };
    const pops = () => [...document.querySelectorAll('.pop-score')].map((el) => el.textContent);
    const shoot = (at) => { while (p.bullets.length) p.removeBullet(0); p.shootCd = 0; p.fire(); for (const b of p.bullets) { b.pos.copy(at); b.vel.set(0, 0, 0); } step(1); };
    const ahead = () => p.pos.clone().addScaledVector(p.forward, 120).setY(p.pos.y + 20);
    G.powerups.active.set('freeze', 999); // hold them still so a placed bullet stays on target
    const mine = G.enemies.spawn('mine', ahead()); // no weak points or parts: a body hit
    mine.hp = 100;
    step(1);
    shoot(mine.pos);
    out.bulletHit = { ...calls, hp: mine.hp };
    const drone = G.enemies.spawn('drone', ahead().addScaledVector(p.right, 60)); // a rotor: a breakable part, not a weak point
    drone.hp = 100;
    step(1);
    const rotor = drone.mesh.userData.parts.find((x) => x.name === 'rotor');
    const ticks = calls.tick;
    shoot(rotor.obj.getWorldPosition(new V()));
    out.partHit = { tick: calls.tick - ticks, hit: calls.hit, broken: rotor.broken, pops: pops() };
    G.enemies.removeEnemy(drone);
    step(36);
    mine.hp = 0.1;
    shoot(mine.pos);
    out.kill = { dead: mine.dead, pops: pops(), score: mine.def.score };
    step(36);
    out.kill.after = pops().length;
    G.powerups.active.clear();
    for (let k = 0; k < 10; k++) G.fx.popText(p.pos.clone().addScaledVector(p.forward, 100), `+${k}`);
    out.popMax = pops().length;
    step(36);
    out.popGone = pops().length;
    // Spiky Balloon proximity fuse: close by (held beside you) it arms, blinks and beeps, then pops and costs hull;
    // one that's far away never arms; one you leave before it pops misses.
    {
      const M = window.MINE_FOR_TEST, side = (d) => p.pos.clone().addScaledVector(p.right, d);
      const run = (m, d, away = null) => {
        let blinks = 0, was = false, n = 0;
        const h0 = p.health;
        while (!m.dead && n++ < 90) {
          p.invuln = 0;
          m.pos.copy(side(m.fuse !== undefined && away !== null ? away : d));
          G.step(1 / 30);
          if (m.blink && !was) blinks++;
          was = !!m.blink;
        }
        const r = { armed: m.fuse !== undefined, dead: m.dead, blinks, secs: +(n / 30).toFixed(2), lost: +(h0 - p.health).toFixed(1) };
        p.health = p.maxHealth;
        if (!m.dead) G.enemies.removeEnemy(m);
        return r;
      };
      G.enemies.spawnTimer = 1e9;
      out.mineNear = run(G.enemies.spawn('mine', side(14)), 14);
      out.mineFar = run(G.enemies.spawn('mine', side(M.arm + 20)), M.arm + 20);
      out.mineLeft = run(G.enemies.spawn('mine', side(20)), 20, M.blast + 10);
      out.mineConst = M;
      step(10);
    }
    // Taking damage goes hit, and shakes the camera.
    const hits = calls.hit;
    p.invuln = 0;
    p.damage(5);
    p.health = p.maxHealth;
    step(1);
    out.shake = { hit: calls.hit - hits, off: +G.camShake.off.length().toFixed(3) };
    step(30);
    // The cinematic look (G.camPeek) turns the view; the reduced-motion check below shows it doesn't there.
    const look = () => { const d = new V(); G.camera.getWorldDirection(d); return +d.dot(p.pos.clone().addScaledVector(p.forward, 30).sub(G.camera.position).normalize()).toFixed(3); };
    G.camPeek = { at: p.pos.clone().addScaledVector(p.right, 300), w: 1 };
    step(1);
    out.peekLook = look();
    G.camPeek = null;
    step(1);
    // Boost, at base stats: pressing it from full goes whoosh once while held; a full tank lasts 4 s, refills in 5 s.
    const stats = { ...p.stats };
    Object.assign(p.stats, { boostDrain: 1, boostRegen: 1 });
    p.boost = 1;
    const w0 = calls.whoosh;
    G.input.keys.add('ShiftLeft');
    step(60);
    out.boost = { whooshes: calls.whoosh - w0 };
    let frames = 60;
    while (p.boosting && frames < 30 * 8) { step(1); frames++; }
    out.boost.drain = +(frames / 30).toFixed(2);
    G.input.keys.delete('ShiftLeft');
    p.boost = 0;
    frames = 0;
    while (p.boost < 1 && frames < 30 * 8) { step(1); frames++; }
    out.boost.regen = +(frames / 30).toFixed(2);
    Object.assign(p.stats, stats);
    for (const name of Object.keys(calls)) delete G.audio[name];
    G.ui.notify = notify;
    G.ui.flash = flash;
    Object.assign(G.world, land);
    G.terrain.rebuildAll();
    step(30);
    p.god = god;
    return out;
  }, FLAT);

  // Hold The Line ("The Rush": five waves with countdowns, a beacon whose ring holds the clock, a restart when you're
  // shot down) and the five newer regular enemies (Umbrella Goon, Grudge Rock, Sniper Owl, Kite Twins, Clingy Moth).
  // Simulated, with nothing else around; world changes for completing an objective are held back, and score, lives and
  // god mode are put back afterwards.
  const RUSH = await page.evaluate(async () => {
    const G = window.G, p = G.player, E = G.enemies, out = {};
    const { CEILING, WAVES, GARY } = await import('./src/enemies.js');
    const { LINE_R } = await import('./src/challenges.js');
    const { groundAt } = await import('./src/objectives.js');
    const V = p.pos.constructor, UP = new V(0, 1, 0);
    const saved = { god: p.god, lives: p.lives, score: G.score, completed: G.objectives.completed, cooldown: G.objectives.cooldown, celebrate: G.mutations.celebrate, notify: G.ui.notify, callout: G.ui.callout, complete: G.objectives.complete, payout: E.payout };
    try {
      G.mutations.celebrate = () => [];
      if (G.relax) G.setRelax(false);
      const notes = [], intros = []; // intros: [sim s, text] of every new-enemy intro shown ('warn', 4 s, priority 1)
      G.ui.notify = (t, ...a) => { notes.push(t); if (a.join() === 'warn,4,1') intros.push([G.time, t]); return saved.notify.call(G.ui, t, ...a); };
      const clear = () => { E.list.slice().forEach((e) => E.removeEnemy(e)); E.shots.splice(0).forEach((s) => G.scene.remove(s.mesh)); E.calmTimer = 0; };
      const quiet = () => { if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; } G.persuasion.reset(null); G.ui.setObjective(null); };
      quiet();
      clear();
      G.objectives.cooldown = 1e9;
      G.powerups.active.clear();
      G.powerups.timer = 1e9;
      G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
      G.input.mouseFire = false;
      p.god = false;
      p.lives = 1e6;
      // safe: no damage (grace always: the ground pushes the plane up instead of crashing it).
      const step = (n, safe = true) => { for (let k = 0; k < n; k++) { if (safe) p.invuln = 99; p.grace = 99; G.step(1 / 30); } };
      const regulars = () => E.list.filter((e) => !e.quest).length;
      const calls = []; // every callout shown: [title, sub]
      G.ui.callout = (t, sub = '', ...a) => { if (t !== null) calls.push([t, sub]); return saved.callout.call(G.ui, t, sub, ...a); };
      const progress = () => { const m = /^🛡 WAVE (\d)\/(\d) · (.*)$/.exec(G.objectives.current?.progress || ''); return m && { wave: +m[1], of: +m[2], rest: m[3] }; };
      const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      // A pilot who never shoots but stays near the line: past 250 m from the beacon it turns back toward it.
      const pilot = (o) => { const b = o.line.position; if (flat(p.pos, b) > 250) { p.nudgeToward(new V(b.x, p.pos.y, b.z), 1.5, 1 / 30); p.updateAxes(); } };

      // Hold The Line, never shooting (safe): PREPARE FOR WAVE 1, 3, 2, 1, GO! before anything spawns; five waves, each
      // with its countdown and flavour line, each sending more than the last (new types in waves 2 and 3), never more than
      // CEILING regulars; done within ~115 s; at the end everything pops (no points) within a second. Each countdown
      // plants the beacon under the plane. New-enemy intros (all of them due again) come one at a time, INTRO_GAP s apart.
      G.score = 800;
      E.introduced.clear();
      const intros0 = intros.length;
      G.objectives.startType('survive');
      let obj = G.objectives.current;
      const F = E.frenzy;
      const htl = (out.htl = { waves: [], maxRegulars: 0, desc: obj.desc, reward: obj.reward, countSpawns: 0, perWave: {}, progress: [], planted: {} });
      const track = () => {
        const c = progress();
        if (F.phase === 'count' && !(F.wave in htl.planted)) htl.planted[F.wave] = +flat(obj.line.position, p.pos).toFixed(1);
        if (c && !htl.waves.includes(c.wave)) htl.waves.push(c.wave);
        if (c && /left$/.test(c.rest) && !htl.progress.some((t) => t.startsWith(`🛡 WAVE ${c.wave}/`))) htl.progress.push(G.objectives.current.progress); // one per wave
        htl.maxRegulars = Math.max(htl.maxRegulars, regulars());
        if (F.phase === 'count') htl.countSpawns += regulars();
        if (F.phase === 'wave') {
          const w = (htl.perWave[F.wave] ||= { roster: E.roster(), spent: 0, types: [] });
          w.spent = +F.spent.toFixed(2);
          for (const e of E.list) if (e.wave === F.wave && !w.types.includes(e.type)) w.types.push(e.type);
        }
      };
      const c0 = calls.length;
      for (let k = 0; k < 30 * 3 && F.phase === 'count'; k++) { step(1); track(); }
      htl.opening = { calls: calls.slice(c0).map((c) => c[0]), shown: document.getElementById('wave-call').classList.contains('show'), title: document.querySelector('#wave-call .call-title').textContent };
      for (let k = 0; k < 30 * 20 && F.phase === 'count'; k++) { pilot(obj); step(1); track(); }
      htl.opening.calls = calls.slice(c0).map((c) => c[0]);
      htl.opening.at = +obj.t.toFixed(2);
      let addedAtEnd = null, scorePrev = G.score;
      const complete = G.objectives.complete;
      G.objectives.complete = function (f) { addedAtEnd = G.score - scorePrev; return complete.call(this, f); };
      for (let k = 0; k < 30 * 150 && G.objectives.current === obj; k++) { scorePrev = G.score; pilot(obj); step(1); track(); }
      G.objectives.complete = complete;
      htl.done = G.objectives.current !== obj;
      htl.total = +obj.t.toFixed(1);
      htl.addedAtEnd = addedAtEnd;
      htl.held = notes.includes('THE LINE HELD!');
      htl.dentist = notes.some((t) => /dentist/.test(t));
      const seen = intros.slice(intros0);
      htl.intros = { n: seen.length, gap: +Math.min(...seen.slice(1).map(([t], i) => t - seen[i][0])).toFixed(2) };
      // Each wave after the first opens with its own countdown: PREPARE FOR WAVE n (with its flavour line), 3, 2, 1, GO!
      htl.countdowns = [2, 3, 4, 5].map((n) => { const i = calls.findIndex((c) => c[0] === `PREPARE FOR WAVE ${n}`); return i >= 0 && calls.slice(i, i + 5).map((c) => c[0]).join() === `PREPARE FOR WAVE ${n},3,2,1,GO!` && calls[i][1].length > 10; });
      step(30);
      htl.after1s = regulars();
      htl.frenzyAfter = E.frenzy;
      htl.ceiling = CEILING;
      htl.beaconGone = !obj.line.parent;

      // Shot down mid-wave (wave 2): the wave starts over from its countdown (same wave, clock back to 0, "Wave 2 again,
      // from the top."); the second time it gets easier by itself (one easier step, a shorter wave clock).
      G.objectives.startType('survive');
      obj = G.objectives.current;
      const F2 = E.frenzy;
      Object.assign(F2, { wave: 2, phase: 'count', t: 0, step: -1 });
      for (let k = 0; k < 30 * 12 && !(F2.phase === 'wave' && F2.clock > 5); k++) { pilot(obj); step(1); }
      const before = { wave: F2.wave, clock: +F2.clock.toFixed(1) };
      const n0 = calls.length;
      p.invuln = 0;
      p.damage(1e4);
      step(1, false);
      const dead = p.dead;
      for (let k = 0; k < 30 * 10 && F2.phase !== 'count'; k++) step(1);
      htl.restart = { before, dead, wave: F2.wave, clock: F2.clock, phase: F2.phase, regulars: regulars(), line: calls.slice(n0).some((c) => c[1] === 'Wave 2 again, from the top.') };
      for (let k = 0; k < 30 * 10 && !(F2.phase === 'wave' && F2.clock > 2); k++) { pilot(obj); step(1); }
      htl.restart.calls = calls.slice(n0).map((c) => c[0]).join(); // no PREPARE: straight to 3, 2, 1
      const easier0 = F2.easier, need0 = E.waveTime();
      p.invuln = 0;
      p.damage(1e4);
      step(1, false);
      htl.second = { easier: F2.easier - easier0, need0, need: E.waveTime(), toast: notes.some((t) => /They feel a bit bad about it/.test(t)) };
      for (let k = 0; k < 30 * 10 && F2.phase !== 'wave'; k++) step(1);

      // Away from the line (over LINE_R m from the beacon): the clock waits, the HUD says so, the arrow points home, and
      // the first time a big TURN BACK callout tells you. The beacon is lit up out there.
      const home = obj.line.position.clone();
      step(30);
      const dim = obj.line.material.opacity, c1 = calls.length;
      const awayAt = p.pos.clone().sub(home).setY(0).normalize().multiplyScalar(LINE_R + 150).add(home);
      p.pos.x = awayAt.x; p.pos.z = awayAt.z; p.prevPos.copy(p.pos);
      step(2);
      const clockOut = F2.clock;
      step(60);
      const t = obj.target();
      htl.away = { clock0: clockOut, clock: F2.clock, hud: obj.progress, target: +flat(t, home).toFixed(1), turn: calls.slice(c1).filter((c) => c.join() === 'TURN BACK,The clock waits for you.').length, dim: +dim.toFixed(2), lit: +obj.line.material.opacity.toFixed(2) };
      p.pos.x = home.x; p.pos.z = home.z; p.prevPos.copy(p.pos);
      step(30);
      htl.away.back = F2.clock - clockOut;

      // Shooting down everything a wave sends clears it early: WAVE n CLEARED! +40n, and +25 hull.
      let jump = null;
      for (let k = 0; k < 30 * 30 && F2.phase === 'wave'; k++) {
        for (const e of E.ofWave(F2.wave)) E.kill(E.list.indexOf(e), true);
        p.health = 40;
        const s0 = G.score, wave = F2.wave;
        step(1);
        if (F2.phase === 'result') jump = { wave, score: G.score - s0, hull: p.health - 40, clock: +F2.clock.toFixed(1), need: +E.waveTime().toFixed(1), call: calls.at(-1)[0] };
      }
      htl.clear = jump;
      // The next countdown plants the beacon under the plane, wherever it is (here 400 m off the old spot).
      const old = obj.line.position.clone();
      const there = p.pos.clone().sub(old).setY(0).normalize().multiplyScalar(400).add(old);
      p.pos.x = there.x; p.pos.z = there.z; p.prevPos.copy(p.pos);
      for (let k = 0; k < 30 * 5 && F2.phase !== 'count'; k++) step(1);
      step(1); // the opacity follows on the next frame: right under you the column is only a faint ghost
      htl.replant = { ghost: +obj.line.material.opacity.toFixed(2), phase: F2.phase, moved: +flat(obj.line.position, old).toFixed(1), under: +flat(obj.line.position, p.pos).toFixed(1), standing: Math.abs(obj.line.position.y - obj.line.scale.y / 2 - groundAt(G, obj.line.position.x, obj.line.position.z)) < 0.01 };
      // Climb high above the ground (the old 300 m beacon stopped well below): the beacon stretches so its full-strength
      // part (below the top fade) still passes you. Under 1100 m, so the Edge Of Space secret and the soft ceiling stay out of it.
      const y0 = p.pos.y, g0 = groundAt(G, p.pos.x, p.pos.z);
      p.pos.y = p.prevPos.y = Math.min(g0 + 600, 950);
      htl.replant.climb = Math.round(p.pos.y - g0);
      step(1);
      htl.replant.passes = Math.round(obj.line.position.y - obj.line.scale.y / 2 + obj.line.scale.y * 0.7 - p.pos.y);
      p.pos.y = p.prevPos.y = y0; // back down, so the checks below fly where they did
      step(1);
      // The types each wave may send (sampled): wave 1 only drones, mines and gulls; new ones in waves 2 and 3.
      htl.mix = [1, 2, 3, 4, 5].map((n) => { F2.wave = n; const s = new Set(); for (let k = 0; k < 3000; k++) s.add(E.pickType(WAVES[n - 1].only)); return [...s]; });
      G.objectives.suspend();

      // Wave 5: elite Gary, with his boss bar. Shooting him down ends it at once: THE LINE HELD!, the rest pop for no points.
      G.objectives.startType('survive');
      obj = G.objectives.current;
      const F5 = E.frenzy;
      Object.assign(F5, { wave: 5, phase: 'count', t: 0, step: -1 });
      for (let k = 0; k < 30 * 10 && F5.phase !== 'wave'; k++) step(1);
      step(60);
      const gary = E.list.find((e) => e.elite);
      const bar = document.getElementById('boss-bar');
      htl.gary = { found: !!gary, hp: gary?.maxHp, bar: !bar.classList.contains('hidden') && document.getElementById('boss-name').textContent, regulars: regulars(), intro: notes.includes(GARY.intro) };
      // Shooting off his propeller only slows him (×0.7) and costs him a tenth of his hp: he doesn't fall, the wave goes on.
      const prop = gary.mesh.userData.parts.find((x) => x.name === 'prop'), hp0 = gary.hp;
      E.breakPart(gary, prop);
      step(1);
      htl.gary.prop = { falling: gary.state === 'falling', slow: gary.slow, lost: +(hp0 - gary.hp).toFixed(2), wave: F5.phase === 'wave' && G.objectives.current === obj, toast: notes.includes(GARY.propText) };
      const s0 = G.score, held0 = notes.filter((n) => n === 'THE LINE HELD!').length;
      let pays = 0;
      const payout = E.payout;
      E.payout = function (e) { pays += e.elite ? 0 : 1; return payout.call(this, e); };
      G.objectives.complete = function (f) { htl.gary.paid = G.score - s0; return complete.call(this, f); };
      E.kill(E.list.indexOf(gary), true);
      step(1);
      G.objectives.complete = complete;
      E.payout = payout;
      htl.gary.done = G.objectives.current !== obj;
      htl.gary.held = notes.filter((n) => n === 'THE LINE HELD!').length > held0;
      htl.gary.others = pays;
      htl.gary.barAfter = !bar.classList.contains('hidden');
      htl.gary.score = gary.def.score;
      step(30);
      htl.gary.after1s = regulars();

      // The intro queue (mid-Hold The Line): at most 4 wait, the oldest goes (a first-in-line one too); at its turn an
      // intro whose enemy type has nobody alive (or whose one enemy, like Gary, is gone) is skipped for the next.
      G.objectives.startType('survive');
      {
        E.intros.length = 0;
        E.introCd = 1e9;
        for (let i = 1; i <= 6; i++) E.intro(`q${i}`, false, { type: 'drone' });
        const capped = E.intros.map((q) => q.text).join();
        E.intro('qF', true, { type: 'drone' });
        const first = E.intros.map((q) => q.text).join();
        E.intros.length = 0;
        const drone = E.spawn('drone', p.pos.clone().add(new V(0, 0, 300)), { quiet: true });
        const gone = E.spawn('drone', p.pos.clone().add(new V(0, 0, -300)), { quiet: true });
        E.removeEnemy(gone);
        for (const e of E.list.filter((x) => x.type === 'mine')) E.removeEnemy(e); // 'no mines' really means none
        E.intro('no mines', false, { type: 'mine' });
        E.intro('gone one', false, { e: gone });
        E.intro('drone here', false, { type: 'drone' });
        E.intro('after', false, { type: 'drone' });
        const n1 = intros.length;
        E.introCd = 0;
        step(1);
        htl.queue = { capped, first, shown: intros.slice(n1).map(([, t]) => t).join(), left: E.intros.map((q) => q.text).join(), alive: !drone.dead };
      }
      quiet();
      clear();

      // Flying dead straight from the start (never turning, never shooting): past LINE_R in wave 1 the clock waits, and
      // a TURN BACK callout shows, again 8+ s later; after 12 s out the line moves under the plane (THE LINE MOVED), the
      // clock runs again, and wave 1 ends without ever turning back.
      G.objectives.startType('survive');
      obj = G.objectives.current;
      const FS = E.frenzy, c2 = calls.length;
      let outAt = null, outT0 = null, moved = null, cs = calls.length;
      const turnAt = [];
      for (let k = 0; k < 30 * 90 && FS.wave === 1 && FS.phase !== 'result'; k++) {
        if (outAt === null && FS.phase === 'wave' && /PAUSED · BACK TO THE LINE$/.test(obj.progress)) { outAt = +FS.clock.toFixed(1); outT0 = G.time; }
        step(1);
        for (const c of calls.slice(cs)) {
          if (c[0] === 'TURN BACK' && !moved) turnAt.push(G.time);
          if (c[0] === 'THE LINE MOVED' && !moved) moved = { after: +(G.time - outT0).toFixed(2), sub: c[1], under: +flat(obj.line.position, p.pos).toFixed(1), clock: FS.clock, hud: obj.progress };
        }
        cs = calls.length;
        if (moved && moved.clock1 === undefined && G.time - outT0 >= moved.after + 1) moved.clock1 = +(FS.clock - moved.clock).toFixed(2);
      }
      htl.straight = { outAt, moved, phase: FS.phase, wave: FS.wave, at: +obj.t.toFixed(1), turn: calls.slice(c2).filter((c) => c[0] === 'TURN BACK').length, turnsBeforeMove: turnAt.length, turnGap: turnAt.length > 1 ? +(turnAt[1] - turnAt[0]).toFixed(2) : null };
      quiet();
      clear();

      // Reduced motion: the callout fades in, no pop.
      G.comfort.reducedMotion = true;
      G.ui.callout('3', 'test', 1);
      htl.calm = { pop: document.getElementById('wave-call').classList.contains('pop'), shown: document.getElementById('wave-call').classList.contains('show') };
      G.comfort.reducedMotion = false;
      G.ui.callout('3', 'test', 1);
      htl.calm.popNormally = document.getElementById('wave-call').classList.contains('pop');
      G.ui.callout(null);

      // Relax Mode mid-wave: enemies, callout, boss bar and beacon all go; nothing spawns, even with a frenzy set.
      G.objectives.startType('survive');
      obj = G.objectives.current;
      Object.assign(E.frenzy, { wave: 5, phase: 'count', t: 0, step: -1 });
      for (let k = 0; k < 30 * 10 && E.frenzy.phase !== 'wave'; k++) step(1);
      step(30);
      const busy = { regulars: regulars(), bar: !bar.classList.contains('hidden') };
      G.ui.callout('GO!', '', 5);
      G.setRelax(true);
      out.relax = { busy, cleared: regulars(), call: document.getElementById('wave-call').classList.contains('show'), bar: !bar.classList.contains('hidden'), beacon: !!obj.line.parent };
      E.frenzy = { wave: 4, phase: 'wave', easier: 0, burst: true, spent: 0, score: 0 };
      E.spawnTimer = 0;
      step(150);
      out.relax = { ...out.relax, regulars: regulars(), objective: !!G.objectives.current };
      E.frenzy = null;
      G.setRelax(false);
      quiet();
      clear();
      G.objectives.cooldown = 1e9; // Relax Mode (suspend) set it to 3 s: no new objective may start (and pay) mid-test

      // The new regular enemies. Each spawns with its intro (once), and a scripted aim pilot shoots it down within 15 s:
      // it flies at the nearest, firing (round the back of an Umbrella Goon; barrel-rolling off a moth).
      E.spawnTimer = 1e9;
      const fresh = () => { clear(); p.spawn(p.pos.x, p.pos.z, Math.atan2(-p.forward.x, -p.forward.z)); p.invuln = 0; G.powerups.active.clear(); };
      const ahead = (m, up = 0) => p.pos.clone().addScaledVector(p.forward, m).add(new V(0, up, 0));
      const near = (list) => list.sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos))[0];
      G.score = 5000;
      out.types = {};
      for (const type of ['umbrella', 'grudgeRock', 'sniperOwl', 'kites', 'moth']) {
        fresh();
        E.introduced.delete(type);
        const n0 = notes.length;
        E.spawnGroup(type, 'front');
        const spawned = E.list.filter((e) => e.type === type).length;
        const extra = E.spawn(type, ahead(600, 40)); // a second one (pair) of the same type: no second intro
        const res = (out.types[type] = { spawned, intro: notes.slice(n0).filter((t) => t === extra.def.intro).length, extra: !!extra, t: null });
        // The hunt: one (pair) 250 m ahead.
        clear();
        E.spawn(type, ahead(250, 10));
        const mine = E.list.filter((e) => e.type === type), k0 = G.stats.kills;
        let pass = null;
        for (let i = 0; i < 30 * 15; i++) {
          const alive = mine.filter((e) => !e.dead && e.state !== 'falling');
          if (!alive.length) { res.t = +(i / 30).toFixed(1); break; }
          const e = near(alive), d = e.pos.distanceTo(p.pos);
          // Aimed where it will be when the bullets get there (enemies move at 0.85 pace, bullets ~340 m/s).
          const at = e.pos.clone().addScaledVector(e.vel, (0.85 * d) / 340);
          // An umbrella facing you (within 65°): boost past it, 35 m to the side, to a spot 100 m behind it, then turn and shoot.
          const off = p.pos.clone().sub(e.pos);
          if (pass && (--pass.t <= 0 || p.pos.distanceTo(pass.at) < 30)) pass = null;
          if (e.face && !pass && off.clone().normalize().dot(e.face) > 0.42) pass = { at: e.pos.clone().addScaledVector(new V().crossVectors(off, UP).normalize(), 35).addScaledVector(off.clone().normalize(), -100), t: 30 * 6 };
          if (pass) at.copy(pass.at);
          if (pass && d > 150) G.input.keys.add('ShiftLeft');
          else G.input.keys.delete('ShiftLeft');
          if (e.latched) { if (!p.maneuver && p.maneuverCd <= 0) p.startManeuver('left'); }
          else p.nudgeToward(at, 2.5, 1 / 30);
          G.input.mouseFire = true;
          step(1);
        }
        G.input.mouseFire = false;
        G.input.keys.delete('ShiftLeft');
        res.kills = G.stats.kills - k0;
      }
      // They all turn up in the ordinary spawn mix (not the bits), and at most 2 Sniper Owls at a time.
      fresh();
      const picks = new Set();
      for (let k = 0; k < 3000; k++) picks.add(E.pickType());
      E.spawn('sniperOwl', ahead(400, 40));
      E.spawn('sniperOwl', ahead(450, 40));
      let owls = 0;
      for (let k = 0; k < 2000; k++) if (E.pickType() === 'sniperOwl') owls++;
      out.picks = { all: [...picks], third: owls };

      // Shooting a bullet into `e` (it arrives this frame, flying the way the plane faces). Returns hp lost, and the damage sent.
      const shootAt = (e, hp = 100) => {
        while (p.bullets.length) p.removeBullet(0);
        p.shootCd = 0;
        p.fire();
        let dmg = 0;
        for (const b of p.bullets) { b.pos.copy(e.pos).addScaledVector(b.vel, -1 / 30); dmg += b.dmg; }
        e.hp = hp;
        step(1);
        return { lost: hp - e.hp, dmg };
      };
      const face = (at) => { p.nudgeToward(at, 1e3, 1); p.updateAxes(); };
      // Umbrella Goon: nothing gets through the front; from behind, full damage.
      fresh();
      G.powerups.active.set('freeze', 999); // held still, so the placed bullets are on target
      const u = E.spawn('umbrella', ahead(80));
      step(1);
      face(u.pos);
      const toU = u.pos.clone().sub(p.pos).normalize();
      u.face = toU.clone().negate(); // facing you
      const front = shootAt(u);
      u.face = toU.clone(); // facing away: you're behind it
      const back = shootAt(u);
      out.umbrella = { front, back };
      // Grudge Rock: breaks into 3 pebbles; a pebble doesn't split again.
      fresh();
      const dog = E.spawn('grudgeRock', ahead(80));
      step(1);
      shootAt(dog, 0.5);
      const bits = E.list.filter((e) => e.type === 'pebble');
      out.dog = { dead: dog.dead, bits: bits.length };
      step(1); // past their 0.8 s scatter, before they've had long to ram the plane
      // Bits home in and ram the plane (kamikaze), so some can vanish while we wait or shoot: count only bits that
      // weren't there before the shot. Shooting one must kill it and make no new ones.
      const bitsBefore = E.list.filter((e) => e.type === 'pebble');
      const target = bitsBefore[0];
      out.dog.beforeBit = bitsBefore.length;
      out.dog.planeUp = !p.dead;
      // Just the one bit, held still for the shot: a sibling right next to it could take the bullet, and one ramming the
      // plane now would leave it unable to fire.
      bitsBefore.slice(1).forEach((b) => E.removeEnemy(b));
      G.powerups.active.set('freeze', 999);
      if (target) shootAt(target, 0.5);
      G.powerups.active.delete('freeze');
      out.dog.bitDead = !!target?.dead;
      out.dog.newBits = E.list.filter((e) => e.type === 'pebble' && !bitsBefore.includes(e)).length;
      // Sniper Owl: a red line for 1.5 s before the shot; a barrel roll during the line: no shot, no damage.
      fresh();
      const owl = E.spawn('sniperOwl', ahead(330, 30));
      owl.cd = 0.3;
      let on = null, fired = null;
      const shots0 = new Set(E.shots);
      for (let k = 0; k < 30 * 8 && fired === null; k++) {
        step(1, false);
        if (on === null && owl.beam?.visible) on = k;
        if (E.shots.some((s) => !shots0.has(s))) fired = k;
      }
      out.owl = { lock: on !== null && fired !== null ? +((fired - on) / 30).toFixed(3) : null, dist: Math.round(owl.pos.distanceTo(p.pos)) };
      let on2 = null;
      for (let k = 0; k < 30 * 8 && on2 === null; k++) { step(1, false); if (owl.beam.visible) on2 = k; }
      step(8, false);
      const hp1 = p.health, shots1 = new Set(E.shots);
      p.startManeuver('left');
      step(1, false);
      out.owl.broken = on2 !== null && !owl.beam.visible && owl.state !== 'aim';
      step(30 * 2.5, false);
      out.owl.newShots = E.shots.filter((s) => !shots1.has(s)).length;
      out.owl.lost = hp1 - p.health;
      // Kite Twins: flying through the string hurts (22 × 1.5 = 33) and says so; shooting a kite snaps the string.
      fresh();
      G.powerups.active.set('freeze', 999);
      const ka = E.spawn('kites', ahead(120)), pair = ka.pair, kb = pair?.kites[1];
      step(1);
      const mid = ka.pos.clone().add(kb.pos).multiplyScalar(0.5);
      const across = new V().crossVectors(kb.pos.clone().sub(ka.pos), UP).normalize();
      p.pos.copy(mid).addScaledVector(across, -8);
      p.prevPos.copy(p.pos);
      face(mid.clone().addScaledVector(across, 60));
      p.invuln = 0;
      p.health = p.maxHealth; // full: no mending in the way
      const n1 = notes.length;
      step(12, false);
      out.kites = { pair: !!pair && kb !== ka, gap: Math.round(ka.pos.distanceTo(kb.pos)), lost: +(p.maxHealth - p.health).toFixed(2), toast: notes.slice(n1).some((t) => /kite string/.test(t)), inScene: !!pair.line.parent };
      face(ka.pos);
      shootAt(ka, 0.5);
      out.kites.snapped = ka.dead && !pair.line.parent && kb.pair === null;
      // Kite Twins hunt: flying straight, the pair keeps pace in front of you, winds up (the string blinks red) and
      // snaps the string across your path (33). A barrel roll through the snap gets you out of it unhurt.
      const kiteRun = (roll) => {
        fresh();
        p.pos.y = G.terrain.surfaceHeight(p.pos.x, p.pos.z) + 150;
        p.prevPos.copy(p.pos);
        const k = E.spawn('kites', ahead(120)), kp = k.pair;
        p.health = p.maxHealth;
        const r = { ahead: [Infinity, -Infinity], windAt: null, snapAt: null, hitAt: null, lost: 0, red: false, rolled: false };
        for (let i = 0; i < 30 * 12; i++) {
          p.invuln = 0; p.grace = 99;
          G.step(1 / 30);
          const t = (i + 1) / 30;
          // What the pair and the sky were doing 3 s in, kept in the report so a failure says why the pair fell behind.
          if (i === 89) r.at3 = { kites: kp.kites.map((x) => (E.list.includes(x) ? x.state || 'ok' : 'gone')), paired: kp.kites.every((x) => x.pair === kp), calm: +E.calmTimer.toFixed(2), scale: G.powerups.enemyTimeScale(), active: [...G.powerups.active.keys()].join('+'), frenzy: !!E.frenzy, relax: G.relax, dead: p.dead, speed: Math.round(p.speed), obj: G.objectives.current?.type || null, others: E.list.filter((x) => !kp.kites.includes(x)).map((x) => x.type).join('+') };
          if (kp.phase === 'park' && !kp.back && t > 2 && r.windAt === null) {
            const a = Math.round(kp.centre.clone().sub(p.pos).dot(p.forward));
            r.ahead = [Math.min(r.ahead[0], a), Math.max(r.ahead[1], a)];
          }
          if (kp.phase === 'wind' && r.windAt === null) r.windAt = t;
          if (kp.phase === 'wind' && kp.mat.color.getHexString() === 'ff3b30') r.red = true;
          if (kp.phase === 'snap' && r.snapAt === null) r.snapAt = t;
          if (roll && r.snapAt !== null && !r.rolled) { p.startManeuver('left'); r.rolled = true; }
          if (r.hitAt === null && p.health < p.maxHealth) { r.hitAt = t; r.lost = +(p.maxHealth - p.health).toFixed(2); }
          if (r.snapAt !== null && t - r.snapAt > 1.5) break;
        }
        r.ahead = r.ahead.map((a) => (Number.isFinite(a) ? a : null));
        r.lead = r.hitAt !== null && r.windAt !== null ? +(r.hitAt - r.windAt).toFixed(2) : null;
        return r;
      };
      // Over flat, drained ground (as the stunts are): the pair stays KITE_FLOOR m over the ground, so a mountain in the
      // way had it climb out of reach and fall behind, and the check failed or passed with whatever world was rolled.
      {
        const FLAT = { amp: 0, roughness: 0, hillBase: 0, terrace: 0, mesa: 0, canyon: 0, spikes: 0, seaLevel: -400 };
        const land = Object.fromEntries(Object.keys(FLAT).map((k) => [k, G.world[k]]));
        Object.assign(G.world, FLAT);
        G.terrain.rebuildAll();
        G.terrain.update(p.pos, 999); // every chunk around rebuilt now: heights are read from built chunks
        try {
          out.kiteHunt = { straight: kiteRun(false), rolled: kiteRun(true) };
        } finally {
          Object.assign(G.world, land);
          G.terrain.rebuildAll();
          G.terrain.update(p.pos, 999);
        }
      }
      // Clingy Moth: latches on, drains boost (and hull) while there; a stunt shakes it off, for its points (once).
      fresh();
      const moth = E.spawn('moth', ahead(6));
      step(1, false);
      const latched = moth.latched;
      p.boost = 1;
      const hp2 = p.health;
      step(60, false);
      out.moth = { latched, boost: +p.boost.toFixed(2), lost: +(hp2 - p.health).toFixed(1) };
      const k1 = G.stats.kills, s1 = G.score;
      p.startManeuver('left');
      step(1, false);
      out.moth.off = !moth.latched && moth.state === 'falling';
      for (let k = 0; k < 30 * 15 && !moth.dead; k++) step(1);
      out.moth.paid = { kills: G.stats.kills - k1, score: G.score - s1, dead: moth.dead };
      // Shot down with a moth on: it drops off.
      fresh();
      const moth2 = E.spawn('moth', ahead(6));
      step(1, false);
      p.damage(1e4);
      step(1, false);
      out.moth.dropped = !moth2.latched;
      // Thunderclaus's volley: per strike a charged yellow ring up top, one at the bottom and a thin spine (no dark
      // column to block the view). Only the hazards tick, so the boss itself never gets a turn; sitting on the first
      // strike's axis costs exactly 18, and the zap sounds when it lands, not at the cast.
      fresh();
      const { MOVES } = await import('./src/bossmoves.js');
      const cloud = E.spawnBoss('thunder', ahead(120, 60));
      let zaps = 0;
      const zap = G.audio.zap;
      G.audio.zap = function () { zaps++; return zap.call(this); };
      try {
        MOVES.loom.strike(E, cloud);
        const hz = E.hazards.list.filter((h) => h.owner === cloud);
        const rings = hz.filter((h) => h.shape === 'ring'), cols = hz.filter((h) => h.shape === 'column');
        out.thunder = { rings: rings.length, spines: cols.length, thick: cols.filter((h) => h.mesh.scale.x > 1).length, other: hz.length - rings.length - cols.length, dark: hz.filter((h) => h.mesh.material.color.getHexString() === '2a2440').length, castZaps: zaps };
        // The cloud body itself must read as soft slate, not a black blot across the top of the view.
        let shade = null;
        cloud.mesh.traverse((o) => { if (shade === null && o.material?.isMeshLambertMaterial) shade = +(o.material.color.getHSL({}, 'srgb').l + o.material.emissive.getHSL({}, 'srgb').l).toFixed(2); });
        out.thunder.shade = shade;
        const [top, bottom, spine] = hz;
        out.thunder.span = +(top.pos.y - bottom.pos.y).toFixed(1);
        p.pos.set(top.pos.x + 10, spine.pos.y, top.pos.z);
        p.invuln = 0;
        const hp3 = p.health;
        for (let k = 0; k < 30 * 1.3; k++) { E.hazards.update(1 / 30); p.pos.set(top.pos.x + 10, spine.pos.y, top.pos.z); }
        out.thunder.lost = +(hp3 - p.health).toFixed(1);
        out.thunder.landZaps = zaps - out.thunder.castZaps;
      } finally {
        G.audio.zap = zap;
      }
      E.hazards.clear(cloud);

      clear();
      quiet();
      step(30 * 3); // respawned
      G.powerups.active.clear();
      return out;
    } finally { // the stubs go back even if a check above throws
      Object.assign(G, { score: saved.score });
      Object.assign(G.objectives, { completed: saved.completed, cooldown: saved.cooldown, complete: saved.complete });
      G.mutations.celebrate = saved.celebrate;
      G.ui.notify = saved.notify;
      G.ui.callout = saved.callout;
      E.payout = saved.payout;
      E.spawnTimer = 6;
      p.god = saved.god;
      p.lives = saved.lives;
    }
  });
  // Grumbleglobe (planetboss.js): the zone where the whole small planet is the boss. Arrival in front of you with its
  // moons, rock vs gadget hits, the moons' potshots and the face's spit fans, the pores' Grumblings, bouncing off it,
  // the shield (its moons) and the eye's cycle, the face turning, phases, relax mode, the pull-up warning, the deflating
  // finale and the objective after it. Score, lives, zone and pacing go back after.
  const GLOBE = await page.evaluate(async () => {
    const G = window.G, p = G.player, E = G.enemies, O = G.objectives, out = {};
    const { ZONES } = await import('./src/zones.js');
    const { BOSSES } = await import('./src/enemies.js');
    const { MAX_LIVES } = await import('./src/player.js');
    const V = p.pos.constructor, Obj3 = G.player.model.group.constructor;
    const saved = { zone: G.zones.index, lap: G.zones.lap, god: p.god, lives: p.lives, score: G.score, completed: O.completed, bossLevel: O.bossLevel, nextBossAt: O.nextBossAt, deck: O.bossDeck.slice(), celebrate: G.mutations.celebrate, notify: G.ui.notify, sinceZone: G.zones.sinceZone, persuade: G.persuasion.update };
    G.mutations.celebrate = () => [];
    G.persuasion.update = () => {}; // no nagging (or participation trophy) while the checks take their time
    if (G.relax) G.setRelax(false);
    const notes = [];
    G.ui.notify = (t, ...a) => { notes.push(t); return saved.notify.call(G.ui, t, ...a); };
    const pops = [], popText = G.fx.popText.bind(G.fx);
    G.fx.popText = (pos, t) => { pops.push(t); return popText(pos, t); };
    const clear = () => { E.list.slice().forEach((e) => E.removeEnemy(e)); E.shots.splice(0).forEach((s) => G.scene.remove(s.mesh)); E.hazards.clear(); };
    const quiet = () => { if (O.current) { O.current.dispose(G); O.current = null; } O.dropHeld(); G.persuasion.reset(null); G.ui.setObjective(null); };
    quiet();
    clear();
    G.powerups.active.clear();
    G.powerups.timer = 1e9;
    G.powerups.pickups.splice(0).forEach((k) => G.scene.remove(k.mesh));
    G.input.keys.clear();
    G.input.mouseFire = false;
    p.god = false;
    p.lives = 1e6;
    const step = (n, safe = true) => { for (let k = 0; k < n; k++) { if (safe) p.invuln = 99; G.step(1 / 30); } };
    const level = (yaw) => { p.quat.setFromAxisAngle(new V(0, 1, 0), yaw); p.updateAxes(); };
    // Put the plane `up` m over a gadget (along its normal), nose on it, and keep it there.
    const hover = (x, up) => { p.pos.copy(x.mid).addScaledVector(x.wn, up); p.prevPos.copy(p.pos); p.nudgeToward(x.mid, 99, 1); p.speed = 0.001; };
    // A bullet fired from `from` straight at `to`, stepped until it's gone.
    const shoot = (from, to, n = 30) => {
      const dir = new V().subVectors(to, from).normalize(), mesh = new Obj3();
      const b = { mesh, pos: from.clone(), vel: dir.multiplyScalar(344), life: 2, dmg: 1 };
      G.scene.add(mesh);
      p.bullets.push(b);
      for (let k = 0; k < n && p.bullets.includes(b); k++) { p.invuln = 99; G.step(1 / 30); }
      return !p.bullets.includes(b);
    };
    const globe = () => O.current?.globe;
    const grumblings = () => E.list.filter((x) => x.type === 'grumbling');
    const yawRate = (g, s) => { const r0 = g.body.rotation.y; step(Math.round(s * 30)); return +(Math.abs(Math.atan2(Math.sin(g.body.rotation.y - r0), Math.cos(g.body.rotation.y - r0))) / (s * 0.85)).toFixed(3); };

    // ---- Arrival: the zone card, then the planet ~760 m ahead within 6 s, face first, nose on it; the bar's name.
    const zi = ZONES.findIndex((z) => z.siege);
    out.zone = { index: zi, name: ZONES[zi]?.name, after: ZONES[zi - 1]?.name, before: ZONES[zi + 1]?.name, mood: ZONES[zi]?.mood, asteroids: ZONES[zi]?.asteroids, blurb: ZONES[zi]?.blurb };
    out.notInDeck = !Object.keys(BOSSES).includes('grumbleglobe') && !Object.values(BOSSES).some((d) => d.world) && !O.bossDeck.includes('grumbleglobe');
    p.spawn(p.pos.x, p.pos.z, 0.7);
    O.cooldown = 4; // as after the objective that flew you here
    G.zones.enter(zi);
    G.zones.sinceZone = 0;
    out.card = document.querySelector('#zone-card .zone-name').textContent;
    let t = 0;
    while (!globe() && t < 6) { step(1); t += 1 / 30; }
    let g = globe();
    out.arrival = { t: +t.toFixed(2), level: O.bossLevel - saved.bossLevel, nextGap: O.nextBossAt - O.completed };
    for (let k = 0; k < 45; k++) step(1);
    if (!g) return out;
    const moons = g.parts.filter((x) => x.kind === 'moon'), pores = g.parts.filter((x) => x.kind === 'pore'), eye = g.eye;
    {
      const to = new V().subVectors(g.C, p.pos);
      // Each moon's orbit plane normal (its pivot's up): three different tilts.
      const normals = moons.map((m) => new V(0, 1, 0).applyQuaternion(m.spin.parent.quaternion));
      Object.assign(out.arrival, {
        dist: Math.round(to.length()), deg: +(p.forward.angleTo(to) * 57.3).toFixed(1), grown: g.k, eye: eye.state, facing: +eye.wn.dot(to.clone().normalize().negate()).toFixed(2), bar: document.getElementById('boss-name').textContent, progress: O.current.progress,
        moons: moons.map((m) => Math.round(m.mid.distanceTo(g.C))), tilts: normals.map((n, i) => +Math.min(...normals.filter((_, j) => j !== i).map((o) => n.angleTo(o) * 57.3)).toFixed(0)),
        tethers: moons.every((m) => m.tether.visible && m.tether.scale.x === 1.2 && Math.abs(m.tether.material.opacity - 0.55) < 1e-6), rings: moons.every((m) => m.ring.visible && m.ring.geometry.parameters.radius === 290 && m.ring.geometry.parameters.tube === 0.6 && Math.abs(m.ring.material.opacity - 0.18) < 1e-6),
        markers: moons.every((m) => m.marker.visible), surfaceSide: pores.every((x) => x.n.z > 0) && eye.n.z > 0, // every gadget on the face side
      });
    }
    out.devButton = !!document.querySelector('#devmenu [data-boss="grumbleglobe"]');
    // Its own par (a fair fight is under 2 min), not the 25 s every regular boss gets; the card says so.
    out.par = { obj: O.current.par, card: document.getElementById('obj-par').textContent, desc: O.current.desc, hints: O.current.hints.length, hp: Object.fromEntries(['moon', 'pore', 'eye'].map((k) => [k, g.parts.find((x) => x.kind === k).hp])) };
    // No "mountains sit down" persuasion in space, whatever the world's amplitude says.
    {
      const { TACTICS } = await import('./src/persuasion.js');
      const amp = G.world.amp;
      G.world.amp = 1;
      out.par.flatten = TACTICS.find((x) => x.id === 'flatten').can(O.current, G.persuasion);
      G.world.amp = amp;
    }

    // Park far out (and quiet) for the shooting checks: nothing fires at you from 2 km, no pore burps, no spitting.
    const park = () => { p.pos.copy(g.C).add(new V(0, 0, 2000)); p.prevPos.copy(p.pos); p.speed = 0.001; };
    park();
    const e = g.e, bar = () => e.hp;
    // Phase 1: the face turns toward you at up to 0.12 rad/s (126° off it, 2 s).
    {
      const side = eye.wn.clone().setY(0).normalize().applyAxisAngle(new V(0, 1, 0), 2.2);
      p.pos.copy(g.C).addScaledVector(side, 2000); p.prevPos.copy(p.pos);
      out.track = { p1: yawRate(g, 2) };
      park();
    }
    // ---- Rock does nothing (grey), a gadget hit drains the bar (gold). A bullet at the far side of the planet stops at
    // the near side: the gadget behind it is untouched.
    const rockAt = g.C.clone().add(new V(0, -1, 0).multiplyScalar(160)); // the south pole: bare rock
    const sparks = [], sparkle = G.fx.sparkle.bind(G.fx);
    G.fx.sparkle = (pos, c) => { sparks.push(c); return sparkle(pos, c); };
    const h0 = bar();
    shoot(rockAt.clone().add(new V(0, -40, 0)), rockAt);
    out.rock = { drop: h0 - bar(), sparks: sparks.splice(0), tip: notes.includes('That\'s just rock. Shoot the moons, the pores and the eye!') };
    const pore = pores[0];
    const pHp = pore.hp, h1 = bar();
    shoot(pore.mid.clone().addScaledVector(pore.wn, 40), pore.mid);
    out.gadget = { drop: +(h1 - bar()).toFixed(2), partDrop: +(pHp - pore.hp).toFixed(2), sparks: sparks.splice(0) };
    // A moon: gold, and the bar drains (34 / 3 / 10 a hit).
    const moon0 = moons[0], h1m = bar();
    shoot(moon0.mid.clone().add(new V(0, 60, 0)), moon0.mid);
    out.gadget.moonDrop = +(h1m - bar()).toFixed(2);
    out.gadget.moonSparks = sparks.splice(0);
    // From under the south pole (bare rock) straight up through the planet at the crown on the north pole.
    const crown = g.parts.find((x) => x.kind === 'crown'), under = g.C.clone().add(new V(0, -260, 0));
    const h2 = bar(), cHp = crown.hp;
    out.through = { stopped: shoot(under, crown.mid), drop: h2 - bar(), partDrop: cHp - crown.hp };
    // An orb aimed through the planet stops at it too.
    const orb = E.fireOrb(under, new V(0, 1, 0), 80, 10);
    step(30 * 3);
    out.through.orbGone = !E.shots.includes(orb);
    G.fx.sparkle = sparkle;
    // While a moon stands the eye takes nothing (cyan bubble).
    const eyeShot = () => { const hb = bar(), eh = eye.hp; shoot(eye.mid.clone().addScaledVector(eye.wn, 70), eye.mid); return { drop: +(hb - bar()).toFixed(2), eyeDrop: +(eh - eye.hp).toFixed(2) }; };
    out.shield = { note3: g.bar().note, shot: eyeShot(), bubble: eye.shield.visible };

    // ---- Moon potshots (and the spit fans) over a slow orbit, phase 1, god mode: every moon shot comes after a 0.6 s
    // glow, only within 380 m with the planet out of the way; no more than ~1 damaging orb/s all told. Every spit fan
    // has a 1 s+ cheek-puff wind-up and fires 5 orbs.
    const fired = [], fire = g.fire.bind(g);
    g.fire = (x) => { const d = p.pos.distanceTo(x.mid); fired.push({ d: Math.round(d), glow: x.glowFrom != null ? +(G.time - x.glowFrom).toFixed(2) : null, x, blocked: (() => { const c = g.C, a = x.mid, b = p.pos, ab = new V().subVectors(b, a), s = Math.max(0, Math.min(1, new V().subVectors(c, a).dot(ab) / ab.lengthSq())); return a.clone().addScaledVector(ab, s).distanceTo(c) < 160 * g.k; })() }); return fire(x); };
    const glowWatch = () => { for (const x of moons) { if (x.wind > 0 && x.glowFrom == null) x.glowFrom = G.time; if (!(x.wind > 0) && !(x.shots > 0)) x.glowFrom = null; } };
    const fans = [], spitFire = g.spitFire.bind(g);
    g.spitFire = () => { const n0 = E.shots.length, ns = E.shots.length, wind = +(e.t - g.spit.startedAt).toFixed(2), state = eye.state, puff = +g.face.cheeks[0].scale.x.toFixed(2); spitFire(); const mine = E.shots.slice(ns).filter((s) => s.mesh.material.color.getHexString() === 'ff9a3a'); fans.push({ wind, orbs: mine.length, speed: mine.length ? Math.round(mine[0].vel.length()) : 0, state, puff, phase: g.phase }); };
    const spitStarts = [], spitStep = g.spitStep.bind(g);
    g.spitStep = (dt, dist) => { const w = g.spit.wind; spitStep(dt, dist); if (!(w > 0) && g.spit.wind > 0) spitStarts.push({ state: eye.state, phase: g.phase, cos: +new V().subVectors(p.pos, g.C).normalize().dot(eye.wn).toFixed(2) }); };
    const R = 160;
    p.god = true;
    const shots0 = E.shots.length;
    let made = 0;
    const countNew = (() => { const seen = new Set(E.shots); return () => { for (const s of E.shots) if (!seen.has(s)) { seen.add(s); if (s.dmg > 0) made++; } }; })();
    // Slow orbit: 300 m from the centre, round the equator then over the poles (30 s), level heading along the path.
    for (let k = 0; k < 30 * 30; k++) {
      const a = (k / (30 * 30)) * Math.PI * 2, tilt = k < 30 * 15 ? 0 : 1;
      const pos = tilt ? new V(Math.cos(a) * 300, Math.sin(a) * 300, 0) : new V(Math.cos(a) * 300, 0, Math.sin(a) * 300);
      p.pos.copy(g.C).add(pos); p.prevPos.copy(p.pos); p.speed = 0.001; p.health = p.maxHealth;
      G.step(1 / 30); glowWatch(); countNew();
    }
    p.god = false;
    out.potshots = { orbs: fired.length, perS: +(made / 30).toFixed(2), maxD: Math.max(...fired.map((f) => f.d)), minGlow: Math.min(...fired.map((f) => f.glow ?? 0)), blocked: fired.filter((f) => f.blocked).length, made, shots0 };
    // Hold in front of the face 400 m out for 14 s (god mode): it spits.
    {
      const n = eye.wn.clone();
      p.god = true;
      for (let k = 0; k < 30 * 14; k++) { p.pos.copy(g.C).addScaledVector(n, 400); p.prevPos.copy(p.pos); p.speed = 0.001; G.step(1 / 30); }
      p.god = false;
      out.spit1 = { fans: fans.slice(), starts: spitStarts.slice(), maxCos: null };
    }
    // Slow-Mo: the moons orbit at 0.35 × (enemy time); Time Freeze stops them.
    {
      park();
      const da = (a, b) => (((b - a) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const a0 = g.moonA[1]; step(30); const w = da(a0, g.moonA[1]);
      G.powerups.activate('slowmo'); const a1 = g.moonA[1]; step(30); const ws = da(a1, g.moonA[1]);
      G.powerups.active.clear();
      G.powerups.activate('freeze'); const a2 = g.moonA[1], r2 = g.body.rotation.y; step(30); const wf = da(a2, g.moonA[1]);
      out.freeze = { w: +(w / 0.85).toFixed(3), slow: +(ws / w).toFixed(2), frozen: wf === 0 && g.body.rotation.y === r2 };
      G.powerups.active.clear();
    }

    // ---- Pores: a 1 s+ glow (and rumble), then a burp of 3 Grumblings at the pore mouth along its normal. Capped: 6
    // alive, 30 a fight; none while you're more than 500 m out.
    const spawned = [], spawn = E.spawn.bind(E);
    E.spawn = (type, pos, opts) => { const x = spawn(type, pos, opts); if (type === 'grumbling') spawned.push({ at: pos.clone(), near: Math.min(...pores.map((q) => q.wa.distanceTo(pos))), t: G.time, glowFor: null, vel: null, x }); return x; };
    const glowAt = new Map();
    const poreWatch = () => { for (const q of pores) { if (q.state === 'glow' && !glowAt.has(q)) glowAt.set(q, e.t); if (q.state !== 'glow' && glowAt.has(q)) { const since = e.t - glowAt.get(q); glowAt.delete(q); spawned.filter((s) => s.glowFor == null).forEach((s) => { s.glowFor = +since.toFixed(2); }); } } };
    // Far: 600 m out (and every pore due): nothing.
    {
      for (const q of pores) q.cd = 0;
      for (let k = 0; k < 30 * 8; k++) { p.pos.copy(g.C).addScaledVector(eye.wn, 600); p.prevPos.copy(p.pos); p.speed = 0.001; step(1); poreWatch(); }
      out.pores = { farBurps: spawned.length };
    }
    // Near (340 m, in front): pores due all the time. The first 4 s even the 4 s gap between burps is skipped, so they
    // pile up to the cap; after 15 s they're also shot every 2 s, so the 24 run out. A pore's red marker shows only
    // while it glows.
    {
      let maxAlive = 0, n = 0;
      g.burped = 0; g.tips.noOpinions = false; // (the orbit above spent the budget already: a fresh one)
      const burped0 = g.burped;
      const n0 = notes.length;
      const v0 = [];
      let markerGlow = false, markerQuiet = false;
      for (let k = 0; k < 30 * 90 && g.burped < 24; k++) {
        for (const q of pores) if (!q.broken && q.state === 'quiet') q.cd = Math.min(q.cd, 0);
        if (k < 30 * 4) g.lastBurp = -99;
        p.pos.copy(g.C).addScaledVector(eye.wn, 340); p.prevPos.copy(p.pos); p.speed = 0.001; p.health = p.maxHealth;
        step(1); poreWatch();
        for (const q of pores) { if (q.state === 'glow' && q.marker.visible) markerGlow = true; if (q.state === 'quiet' && q.marker.visible) markerQuiet = true; }
        if (spawned.length && !v0.length) v0.push(...spawned.map((s) => +s.x.vel.clone().normalize().dot(pores.reduce((b, q) => (q.wa.distanceTo(s.at) < b.wa.distanceTo(s.at) ? q : b)).wn).toFixed(2)));
        maxAlive = Math.max(maxAlive, g.alive().length);
        if (++n > 30 * 15 && n % 60 === 0) for (const x of grumblings()) { x.hp = 0; } // shot down
      }
      for (let k = 0; k < 30 * 8; k++) { for (const q of pores) if (!q.broken) q.cd = 0; step(1); poreWatch(); } // spent: no more
      Object.assign(out.pores, {
        burped: g.burped, spawned: spawned.length, burped0, maxAlive, markerGlow, markerQuiet, near: Math.max(...spawned.map((s) => s.near)), minGlow: Math.min(...spawned.map((s) => s.glowFor ?? 0)), outward: Math.min(...v0),
        firstTip: notes.includes('Grumblings! Tiny opinions with teeth.'), spent: notes.slice(n0).includes('Grumbleglobe has run out of opinions. Temporarily.'),
      });
      for (const x of grumblings()) E.removeEnemy(x);
    }
    // A Grumbling: 1 hp, 5 points, a squeak (no explosion) when it pops.
    {
      const tones = [], tone = G.audio.tone.bind(G.audio), explode = G.audio.explode.bind(G.audio);
      let booms = 0;
      G.audio.tone = (f, ...a) => { tones.push(f); return tone(f, ...a); };
      G.audio.explode = () => { booms++; return explode(); };
      const x = spawn('grumbling', p.pos.clone().add(new V(0, 0, -60)));
      const s0 = G.score;
      shoot(p.pos.clone().add(new V(0, 0, -20)), x.pos);
      const y = spawn('grumbling', p.pos.clone().add(new V(0, 0, -300)));
      const shared = y.mesh.children.every((c, i) => c.geometry === x.mesh.children[i].geometry && c.material === x.mesh.children[i].material);
      let disposed = 0;
      for (const c of y.mesh.children) { c.geometry.addEventListener('dispose', () => disposed++); c.material.addEventListener('dispose', () => disposed++); }
      E.removeEnemy(y);
      out.pores.pop = { dead: x.dead, score: G.score - s0, squeak: tones.includes(1400), booms, shared, disposed }; // removing one leaves the shared geometry and materials alone
      G.audio.tone = tone; G.audio.explode = explode;
    }
    // Grumblings cut across in front of your nose (where you'll be in 1 s), each to its own spot (they don't stack),
    // at 52; one about for over 10 s, or over 220 m off the surface, sulks off: no points, its slot freed.
    {
      park(); level(0); p.speed = p.baseSpeed;
      const a = spawn('grumbling', p.pos.clone().add(new V(150, 0, -100))), b = spawn('grumbling', a.pos.clone());
      a.seed = 0; b.seed = 3; // (spots 3 rad apart round the aim point)
      let lead = 1, gap = Infinity;
      for (let k = 0; k < 30 * 3; k++) {
        p.pos.addScaledVector(p.forward, -p.speed / 30); // (park() would undo the flight: keep it level, flying on)
        step(1);
        if (k >= 30 * 1.5 && !a.dead && !b.dead) {
          const want = p.pos.clone().addScaledVector(p.forward, p.speed).sub(a.pos).normalize();
          lead = Math.min(lead, a.vel.clone().normalize().dot(want)); gap = a.pos.distanceTo(b.pos);
        }
      }
      out.pores.steer = { lead: +lead.toFixed(2), gap: +gap.toFixed(1), speed: E.list.find((x) => x.type === 'grumbling')?.def.speed };
      for (const x of grumblings()) E.removeEnemy(x);
      p.pos.copy(g.C).addScaledVector(eye.wn, 600); p.prevPos.copy(p.pos); p.speed = 0.001;
      const old = spawn('grumbling', g.C.clone().addScaledVector(eye.wn, 200)), stray = spawn('grumbling', g.C.clone().addScaledVector(eye.wn, 400)), fresh = spawn('grumbling', g.C.clone().addScaledVector(eye.wn, 200));
      g.grumbs.push(old, stray, fresh);
      old.stateT = 10.5;
      const s0 = G.score;
      step(1);
      out.pores.sulk = { old: old.dead, stray: stray.dead, fresh: !fresh.dead, score: G.score - s0 };
      for (const x of grumblings()) E.removeEnemy(x);
    }
    // A clump of 6 Grumblings reaching you in the same frame: small puffs (no explosions), and one or two bites.
    {
      park(); step(2);
      let booms = 0;
      const explosion = G.fx.explosion.bind(G.fx);
      G.fx.explosion = (...a) => { booms++; return explosion(...a); };
      p.health = p.maxHealth; p.invuln = 0;
      const h0 = p.health;
      for (let k = 0; k < 6; k++) spawn('grumbling', p.pos.clone().add(new V(k * 0.3, 0, 0)));
      G.step(1 / 30);
      for (let k = 0; k < 4; k++) { p.invuln = 0; G.step(1 / 30); }
      G.fx.explosion = explosion;
      out.pores.clump = { lost: +(h0 - p.health).toFixed(1), booms, left: grumblings().length };
      p.health = p.maxHealth;
      for (const x of grumblings()) E.removeEnemy(x);
    }

    // ---- Relax mode: the planet stays and dozes: moons still, no orbs, its Grumblings pop, none come. Back from it,
    // the same planet resumes, broken gadgets still broken.
    {
      g.burped = 0; // a fresh budget for the doze check
      g.lastBurp = -99;
      for (const q of pores) q.cd = 0;
      for (let k = 0; k < 30 * 3 && !grumblings().length; k++) { p.pos.copy(g.C).addScaledVector(eye.wn, 300); p.prevPos.copy(p.pos); step(1); }
      const before = grumblings().length;
      const broken0 = g.parts.filter((x) => x.broken).length, f0 = fired.length, fans0 = fans.length, sp0 = spawned.length;
      G.setRelax(true);
      const a0 = g.moonA.slice(), afterPop = grumblings().length;
      for (let k = 0; k < 30 * 5; k++) { for (const q of pores) q.cd = 0; p.pos.copy(g.C).addScaledVector(eye.wn, 300); p.prevPos.copy(p.pos); step(1); }
      out.relax = { stays: E.list.includes(e) && !e.dead, dozing: g.dozing, before, afterPop, grumblings: grumblings().length, spawned: spawned.length - sp0, still: g.moonA.every((a, i) => a === a0[i]), shots: fired.length - f0, fans: fans.length - fans0, bar: document.getElementById('boss-bar').classList.contains('hidden') };
      G.setRelax(false);
      park();
      for (let k = 0; k < 30 * 5 && !O.current; k++) step(1);
      out.relax.back = O.current?.globe === g && !g.dozing && g.parts.filter((x) => x.broken).length === broken0;
      for (const x of grumblings()) E.removeEnemy(x);
    }

    // ---- Bouncing: fly into the planet (god off) and it flicks you back out: 12 hull, no life, BOING!, a line; within
    // 0.5 s you're outside R + 4 m heading away. God mode and Ghost Mode skim it: no damage. A nose-in dive lights the
    // pull-up glow first. A moon bounces you too. A bounce never takes your last hull point.
    {
      E.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
      park(); step(2);
      const hits = [], damage = p.damage;
      p.damage = function (n, ...rest) { hits.push(n); return damage.call(this, n, ...rest); };
      const lives0 = p.lives = 5;
      g.burped = 99; // no Grumblings in the way
      const back = g.eye.wn.clone().negate(); // round the back: plain rock, nothing fires
      const dive = (from = back) => { p.pos.copy(g.C).addScaledVector(from, R + 120); p.prevPos.copy(p.pos); p.nudgeToward(g.C, 99, 1); p.speed = p.baseSpeed; p.invuln = 0; p.grace = 0; p.health = p.maxHealth; };
      const into = (until = 30 * 6) => {
        let glow = false, at = null, k = 0, tti = Infinity;
        const n0 = notes.length, p0 = pops.length, h0 = hits.length;
        for (; k < until && at == null; k++) { g.spit.cd = 99; for (const m of moons) { m.cd = 99; m.wind = 0; } G.step(1 / 30); if (G.pullup.on) glow = true; tti = Math.min(tti, G.pullup.tti); if (pops.slice(p0).includes('BOING!')) at = k; }
        let out1 = null;
        for (let j = 0; j < 15; j++) { G.step(1 / 30); } // 0.5 s
        const n = new V().subVectors(p.pos, g.C), d = n.length();
        out1 = { d: Math.round(d), away: +p.forward.dot(n.normalize()).toFixed(2) };
        return { tti, glow, boing: at != null, hull: hits.slice(h0), line: notes.slice(n0).some((x) => ['The planet flicked you off. Rude.', 'Grumbleglobe: "Personal space!"', 'Boing. That was your dignity.'].includes(x)), dead: p.dead, lives: p.lives, ...out1 };
      };
      dive();
      const h0b = p.health;
      out.bounce = into();
      out.bounce.lost = h0b - p.health - 0; // (regen is slow: within a frame or two of 12)
      // God mode: skims, no damage, no BOING.
      p.god = true; dive(); out.bounce.god = into(30 * 4); p.god = false;
      // Ghost Mode: the same.
      G.powerups.activate('ghost'); dive(); out.bounce.ghost = into(30 * 4); G.powerups.active.clear();
      // Mega Plane: a bounce too (no life).
      G.powerups.activate('mega'); dive(); out.bounce.mega = into(); G.powerups.active.clear();
      // Low hull: a bounce leaves 1, never a crash.
      dive(); p.health = 5; out.bounce.low = into(); out.bounce.low.health = +p.health.toFixed(1);
      // On a landing approach over ground you could land on, the planet still lights the pull-up glow (it isn't a runway).
      {
        const approach = G.pullup.approach, landable = p.landableAt;
        try {
          G.pullup.approach = () => true; p.landableAt = () => true;
          dive(); out.bounce.runway = into(); out.bounce.runway = { glow: out.bounce.runway.glow, boing: out.bounce.runway.boing };
        } finally { G.pullup.approach = approach; p.landableAt = landable; }
      }
      // A moon: fly at one (it orbits on; aim at where it is every frame).
      {
        const m = moons.find((x) => !x.broken);
        p.pos.copy(m.mid).addScaledVector(m.wn, 120); p.prevPos.copy(p.pos); p.speed = p.baseSpeed; p.invuln = 0; p.health = p.maxHealth;
        const p0 = pops.length;
        let boing = false;
        for (let k = 0; k < 30 * 5 && !boing; k++) { p.nudgeToward(m.mid, 99, 1); g.spit.cd = 99; G.step(1 / 30); boing = pops.slice(p0).includes('BOING!'); }
        for (let j = 0; j < 15; j++) G.step(1 / 30);
        out.bounce.moon = { boing, d: +(p.pos.distanceTo(m.mid) - 22).toFixed(1), lives: p.lives };
      }
      out.bounce.lives0 = lives0;
      p.damage = damage;
      // Hull run out near it (anything but the planet): an ordinary crash, and the respawn is 450 m out, level with it,
      // nose on it, what you destroyed still destroyed.
      const broken0 = g.parts.filter((x) => x.broken).length;
      dive(); step(1, false);
      p.health = 1; p.invuln = 0; p.damage(5);
      out.respawnCrash = { dead: p.dead, lives: p.lives };
      for (let k = 0; k < 30 * 3 && p.dead; k++) G.step(1 / 30);
      const to = new V().subVectors(g.C, p.pos);
      out.respawn = { dist: Math.round(to.length()), dy: Math.round(p.pos.y - g.C.y), deg: +(p.forward.angleTo(to) * 57.3).toFixed(1), invuln: +p.invuln.toFixed(1), broken: g.parts.filter((x) => x.broken).length === broken0 };
      p.lives = 1e6;
      park();
    }

    // ---- Homing Bullets: while the shield stands, the nearest moon.
    out.homing = { moon: (() => { const h = g.homeAt(p.pos); return !!h && moons.some((m) => !m.broken && m.mid.distanceTo(h) < 1); })() };

    // ---- The shield: three pores plugged first (one is kept for later), then the moons, one by one. The bar note
    // counts them down; the last one drops the shield and starts phase 2 at once.
    {
      for (const q of pores.slice(0, 3)) for (let k = 0; k < 6 && !q.broken; k++) shoot(q.mid.clone().addScaledVector(q.wn, 40), q.mid);
      out.shield.plugged = pores.slice(0, 3).every((q) => q.broken) && notes.includes('Pore plugged! Fewer opinions.');
      const notes1 = [], phases = [];
      for (const m of moons) {
        for (let k = 0; k < 14 && !m.broken; k++) shoot(m.mid.clone().add(new V(0, 60, 0)), m.mid, 10);
        notes1.push(g.bar().note); phases.push(g.phase);
      }
      out.shield.notes = notes1;
      out.shield.phases = phases;
      out.shield.down = {
        broken: moons.every((x) => x.broken), toast: notes.some((n) => /^SHIELD DOWN!/.test(n)), bubble: eye.shield.visible, progress: O.current.progress, phase: g.phase, hp: +bar().toFixed(1),
        lines: ['Moon down! It\'s going to tell Mum.', 'Moon down! It wasn\'t even its fault.', 'Last moon down! The planet is very alone now.'].every((l) => notes.includes(l)), phase2: notes.includes('No moons, no shield, no chill. Shoot the eye when it opens!'),
        shocked: g.face.o.visible, score80: pops.filter((x) => x === '+80').length, note: g.bar().note,
      };
      step(15);
      out.shield.down.tethersGone = moons.every((m) => !m.tether.visible);
      out.homing.pore = (() => { const h = g.homeAt(p.pos); return !!h && h.distanceTo(pores[3].mid) < 1; })(); // the eye's shut: the last pore, never the crown or the eye
    }

    // ---- The eye's cycle: shut → twitch (1 s) → open (5 s), on a 9 s loop. Shut: no damage. Open: the bar drops.
    // (It only opens once its face has turned your way.)
    {
      const cycle = [];
      let last = null, at = 0, shutShot = null, openShot = null;
      for (let k = 0; k < 30 * 30; k++) {
        step(1);
        const s = eye.state;
        if (s !== last) { cycle.push([s, +(G.time - at).toFixed(2)]); last = s; at = G.time; }
        if (s === 'shut' && !shutShot) shutShot = eyeShot();
        if (s === 'open' && G.time - at > 0.5 && !openShot) { out.openLook = { progress: O.current.progress, note: g.bar().note, stalk: eye.stalk.visible && eye.stalk.scale.y > 10 }; openShot = eyeShot(); out.homing.eye = (() => { const h = g.homeAt(eye.mid.clone().addScaledVector(eye.wn, 30)); return !!h && h.distanceTo(eye.mid) < 1; })(); }
      }
      out.eye = { cycle, shutShot, openShot, firstHit: notes.includes('Right in the eye! It\'s really upset now.') };
    }
    // Phase 2: the face turns at up to 0.2 rad/s; while the eye is open it holds still.
    {
      const side = () => { p.pos.copy(g.C).addScaledVector(eye.wn.clone().setY(0).normalize().applyAxisAngle(new V(0, 1, 0), 2.2), 600); p.prevPos.copy(p.pos); };
      side();
      Object.assign(eye, { state: 'shut', t: 99 });
      out.track.p2 = yawRate(g, 2);
      side();
      Object.assign(eye, { state: 'open', t: 99 });
      out.track.open = yawRate(g, 1);
      Object.assign(eye, { state: 'shut', t: 2 });
    }
    // ---- Phase 2, three eye cycles in front of the face (god mode): it spits only on its turn (eye shut), never
    // while the eye twitches or is open, 5 orbs a fan after a 1 s+ wind-up.
    {
      const f0 = fans.length, s0 = spitStarts.length;
      g.spit.cd = 0;
      p.god = true;
      for (let k = 0; k < 30 * 32; k++) { p.pos.copy(g.C).addScaledVector(eye.wn.clone().setY(0).normalize(), 400); p.prevPos.copy(p.pos); p.speed = 0.001; G.step(1 / 30); }
      p.god = false;
      out.spit2 = { fans: fans.slice(f0), starts: spitStarts.slice(s0), drones: E.list.filter((x) => x.type === 'drone').length, phase: g.phase };
      E.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
      for (const x of grumblings()) E.removeEnemy(x);
    }
    park();

    // ---- Phase 3 (33%): ENRAGED, cracks, a longer eye, the glare, Grudge Rocks, 7-orb fans, begging.
    const warns = [], warn = E.warn;
    E.warn = function (pos, r, color, tt, onFire, opts) { const rec = { r, t: tt, at: G.time, dir: opts?.dir?.clone(), shape: opts?.shape, fired: -1 }; warns.push(rec); return warn.call(this, pos, r, color, tt, (hz) => { rec.fired = +(G.time - rec.at).toFixed(2); onFire?.(hz); }, opts); };
    const hits = [], damage = p.damage;
    p.damage = function (n, ...rest) { hits.push([n, +G.time.toFixed(2)]); return damage.call(this, n, ...rest); };
    E.list.filter((x) => !x.quest).forEach((x) => E.removeEnemy(x));
    e.hp = 32;
    step(2);
    out.phase3 = { phase: g.phase, enraged: e.enraged, cracks: g.cracks.visible, bar: document.getElementById('boss-name').textContent, toast: notes.some((n) => /^MELTDOWN!/.test(n)) };
    {
      const side = eye.wn.clone().setY(0).normalize().applyAxisAngle(new V(0, 1, 0), 2.2);
      p.pos.copy(g.C).addScaledVector(side, 600); p.prevPos.copy(p.pos);
      Object.assign(eye, { state: 'shut', t: 99 });
      out.track.p3 = yawRate(g, 2);
      Object.assign(eye, { state: 'shut', t: 0 });
    }
    // The glare: from an open eye, a column warning (1.2 s+) toward where you'll be, then the beam: 20 if you stay on it.
    // (You hold still over the eye from the moment it opens, so the glare is aimed right at you.)
    hits.length = 0;
    const w0 = warns.length;
    let openFor = 0, opened = false, closed = false;
    const sight = [], beamOp = new Set();
    let beamOver = null, beamDrawn = null, firstHits = null; // hits from the first opening (the face keeps turning to you, so later ones aim at you too)
    for (let k = 0; k < 30 * 14; k++) {
      if (eye.state !== 'open' && !opened) { p.pos.copy(eye.mid).addScaledVector(eye.wn, 200); p.nudgeToward(eye.mid, 99, 1); } // nose on it: the camera sits behind you
      p.prevPos.copy(p.pos); p.speed = 0.001; p.health = p.maxHealth; p.invuln = 0;
      g.spit.cd = 99; // no spit fans in the way of this one
      G.step(1 / 30);
      if (eye.state === 'open' && !closed) { opened = true; openFor += 1 / 30; } else if (opened && !closed) { closed = true; firstHits = hits.filter((h) => h[0] === 20).length; }
      if (g.sight) sight.push(g.sight.mesh.scale.x);
      if (g.beamT > 0) {
        beamOp.add(g.glare.material.opacity); beamOver ??= Math.round(g.beamB.distanceTo(p.pos));
        // The drawn beam: from the eye to the aim point (you), its far end that far along the hit segment.
        // Its tip cone (the narrowing last 40 m) ends there, or 50 m short of the camera if that's nearer (the camera
        // sits behind you, so in at the eye it is); the body ends where the tip starts.
        const dir = new V().subVectors(g.beamB, g.beamA).normalize(), end = g.glareTip.position.clone().add(g.C).addScaledVector(dir, g.glareTip.scale.y / 2);
        const bodyEnd = g.glare.position.clone().add(g.C).addScaledVector(dir, g.glare.scale.y / 2);
        beamDrawn ??= { endToAim: +end.distanceTo(p.pos).toFixed(1), camGap: +(G.camera.position.clone().sub(g.beamA).dot(dir) - g.beamLen).toFixed(1), hitPast: +(g.beamA.distanceTo(g.beamB) - g.beamLen).toFixed(1), shortOfAim: +end.distanceTo(g.beamB.clone().addScaledVector(dir, -30)).toFixed(1), tip: +bodyEnd.distanceTo(end).toFixed(1), point: g.glareTip.geometry.parameters.radiusTop };
      }
    }
    const gw = warns.slice(w0).find((w) => w.r === 6);
    out.phase3.eyeOpen = +(openFor * 0.85).toFixed(2); // enemy-time s
    out.phase3.glare = gw && { t: gw.t, fired: gw.fired, hit: firstHits, sight: sight.length ? [+Math.min(...sight).toFixed(2), +Math.max(...sight).toFixed(2)] : null, beamOp: [...beamOp], beamOver, beamDrawn };
    // A glare that misses pays +25 ("Dodge!"): the beam runs out with you 40 m off its line.
    {
      const s0 = G.score, p0 = pops.length;
      const from = p.pos.clone().add(new V(0, 0, -200)), dir = new V(0, 0, 1);
      g.beam(from, dir, 200);
      p.pos.copy(from).add(new V(40, 0, 200)); p.prevPos.copy(p.pos); p.invuln = 0;
      for (let k = 0; k < 30 && g.beamT > 0; k++) g.animate(1 / 30);
      out.phase3.dodge = { score: G.score - s0, pop: pops.slice(p0).includes('+25 Dodge!') };
      // ...and one that hits pays nothing.
      const s1 = G.score;
      g.beam(from, dir, 200);
      p.pos.copy(from).add(new V(0, 0, 200)); p.prevPos.copy(p.pos); p.invuln = 0; p.health = p.maxHealth;
      for (let k = 0; k < 30 && g.beamT > 0; k++) { p.invuln = 0; g.animate(1 / 30); }
      out.phase3.dodge.hitPays = G.score - s1;
      // ...and a barrel roll straight through it is a dodge too: +25, no damage.
      const s2 = G.score, h2 = p.health = p.maxHealth;
      g.beam(from, dir, 200);
      p.pos.copy(from).add(new V(0, 0, 200)); p.prevPos.copy(p.pos); p.invuln = 0; p.dodging = true;
      for (let k = 0; k < 30 && g.beamT > 0; k++) { p.invuln = 0; g.animate(1 / 30); }
      p.dodging = false;
      out.phase3.dodge.roll = { score: G.score - s2, lost: h2 - p.health };
      p.health = p.maxHealth;
    }
    // The beam's reach, fired by hand along +Z from 200 m in front of you: its hit radius is 6 + 4 m (you at 9 m off the
    // line: hit; 11 m: not), the hit segment runs 30 m past the aim point (25 m past: hit; 45 m: not) and with the camera between
    // the eye and the aim point the mesh stops 50 m short of it, and so does the sight (both narrowing to a point there).
    {
      const from = p.pos.clone().add(new V(0, 0, -200)), dir = new V(0, 0, 1), beamHits = (off) => {
        g.beam(from, dir, 200);
        p.pos.copy(from).add(off); p.prevPos.copy(p.pos); p.invuln = 0; p.health = p.maxHealth;
        const n = hits.length; g.animate(1 / 30); g.beamT = 0; g.glare.visible = g.glareTip.visible = false;
        return hits.slice(n).filter((h) => h[0] === 20).length;
      };
      const cam = G.camera.position.clone();
      out.phase3.reach = { in9: beamHits(new V(9, 0, 120)), out11: beamHits(new V(11, 0, 120)), past25: beamHits(new V(0, 0, 225)), past45: beamHits(new V(0, 0, 245)) };
      G.camera.position.copy(from).add(new V(3, 2, 120)); // the camera 120 m down the line, short of the aim point
      const tipEnd = (tip) => Math.round(tip.position.clone().add(g.C).addScaledVector(dir, tip.scale.y / 2).z - from.z);
      g.beam(from, dir, 200); out.phase3.reach.camDrawn = Math.round(g.beamLen); out.phase3.reach.camEnd = tipEnd(g.glareTip);
      g.sight = E.warn(from.clone().addScaledVector(dir, 100), 6, '#ff4dff', 1.2, null, { shape: 'column', owner: e, h: 200, dir }); // a glare warning, by hand
      g.aim = { from, dir, len: 200 }; g.sightLine();
      out.phase3.reach.sight = { end: tipEnd(g.sightTip), body: Math.round(g.sight.mesh.position.z + g.sight.mesh.scale.y / 2 - from.z), same: g.sightTip.material === g.sight.mesh.material };
      E.hazards.clear(e); g.sightLine(); out.phase3.reach.sight.gone = !g.sight && !g.sightTip.visible; g.beamT = 0; g.glare.visible = g.glareTip.visible = false;
      G.camera.position.copy(cam);
    }
    // A glare from behind the camera gets a toast ("glaring at your back"); one in front of it doesn't.
    {
      const cam = G.camera.position.clone(), q = G.camera.quaternion.clone(), attacks = e.attacks;
      const back = (away) => {
        p.pos.copy(eye.mid).addScaledVector(eye.wn, 200); p.prevPos.copy(p.pos);
        G.camera.position.copy(p.pos).addScaledVector(eye.wn, 30);
        G.camera.lookAt(G.camera.position.clone().addScaledVector(eye.wn, away ? 100 : -100)); G.camera.updateMatrixWorld(true);
        const n = notes.length; g.glareAt();
        E.hazards.clear(e); g.sightLine();
        return notes.slice(n).includes('Grumbleglobe is glaring at your back. Swerve!');
      };
      out.phase3.glareBack = { behind: back(true), ahead: back(false) };
      G.camera.position.copy(cam); G.camera.quaternion.copy(q); G.camera.updateMatrixWorld(true); e.attacks = attacks;
    }
    // The treadmill: you keep 126° round from the face (as if chasing round the far side), so it never looks at you. The
    // eye, due to open, holds shut 6 s (enemy time), then twitches and opens anyway. Then, in front of the eye but with
    // the face reported 2 rad off: the same forced opening, and no glare from it.
    {
      const forced = (place) => {
        Object.assign(eye, { state: 'shut', t: 0 });
        const t0 = e.t, w = warns.length, r = { held: null, err: null, opened: false };
        for (let k = 0; k < 30 * 16 && !(r.opened && eye.state !== 'open'); k++) {
          place(); p.prevPos.copy(p.pos); p.speed = 0.001; p.health = p.maxHealth; step(1);
          if (eye.state === 'twitch' && r.held == null) { r.held = +(e.t - t0).toFixed(2); r.err = +g.faceErr.toFixed(2); }
          if (eye.state === 'open') r.opened = true;
        }
        r.glares = warns.slice(w).filter((x) => x.r === 6).length;
        return r;
      };
      out.phase3.held = forced(() => { const a = g.body.rotation.y + 2.2; p.pos.copy(g.C).add(new V(Math.sin(a) * 600, 0, Math.cos(a) * 600)); });
      const turn = g.turn;
      g.turn = function (dt, pl) { turn.call(this, dt, pl); this.faceErr = 2; };
      out.phase3.held.inView = forced(() => { p.pos.copy(eye.mid).addScaledVector(eye.wn, 200); p.nudgeToward(eye.mid, 99, 1); });
      out.phase3.held.inView.sees = g.sees(eye, 650);
      g.turn = turn;
    }
    // Phase 3 fans: 7 orbs.
    {
      const f0 = fans.length;
      p.god = true;
      Object.assign(eye, { state: 'shut', t: 99 });
      g.spit.cd = 0; g.spit.wind = 0;
      for (let k = 0; k < 30 * 3; k++) { p.pos.copy(g.C).addScaledVector(eye.wn.clone().setY(0).normalize(), 400); p.prevPos.copy(p.pos); p.speed = 0.001; G.step(1 / 30); }
      p.god = false;
      out.phase3.fans = fans.slice(f0);
      Object.assign(eye, { state: 'shut', t: 1 });
      E.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
    }
    out.phase3.rocks = E.list.filter((x) => x.type === 'grudgeRock').length;
    out.hazards = warns.filter((w) => w.t < 1).length; // every warning lasts 1 s or more
    E.warn = warn;
    p.damage = damage;
    // Begging taunts once it's melting down.
    out.phase3.brows = +g.face.brows.find((b) => b.userData.side === 1).rotation.y.toFixed(2); // worried: inner ends up
    { const n0 = notes.length; g.tauntT = 0; p.god = true; for (let k = 0; k < 2; k++) { p.pos.copy(g.C).addScaledVector(eye.wn, 400); p.prevPos.copy(p.pos); G.step(1 / 30); } p.god = false; park(); out.phase3.begs = notes.slice(n0).some((n) => ['"Okay. Truce? I\'ll stop spinning."', '"I HAD moons. Plural."', '"If you stop now I\'ll tell everyone you won."'].includes(n)); }

    // ---- The end: the eye breaks, the face goes "x", it freezes 0.5 s, then deflates (scale falling to 0.4 or less
    // within 2.3 s), its last gadgets popping, its Grumblings gone; then 8 rubble chunks (harmless for 3 s), BOSS
    // DEFEATED, 1.5× the boss reward, a spare plane. Then the zone's next objective comes as usual.
    p.lives = 2;
    E.list.filter((x) => !x.quest).forEach((x) => E.removeEnemy(x));
    const front = () => { p.pos.copy(g.C).addScaledVector(eye.wn.clone().setY(0).normalize(), 400); p.prevPos.copy(p.pos); p.speed = 0.001; };
    p.god = true;
    for (let k = 0; k < 30 * 12 && eye.state !== 'open'; k++) { front(); step(1); }
    g.burped = 0; g.lastBurp = -99; pores[3].state = 'glow'; pores[3].t = 0.01;
    front(); step(2);
    const grumbs0 = grumblings().length;
    const score0 = G.score, done0 = O.completed, rubble0 = G.zones.asteroids.list.length, reward = O.current.reward, lvl = O.bossLevel - 1;
    const rubbleAt = [], aspawn = G.zones.asteroids.spawn.bind(G.zones.asteroids);
    G.zones.asteroids.spawn = (pos, ...a) => { rubbleAt.push(+pos.distanceTo(g.C).toFixed(1)); return aspawn(pos, ...a); };
    eye.hp = 0.5;
    const t0 = G.time;
    shoot(eye.mid.clone().addScaledVector(eye.wn, 60), eye.mid);
    p.god = false;
    out.end = { eyeBroke: eye.broken, dying: g.dying >= 0, xEye: g.xEye.visible, grumbs0, grumbsAfter: grumblings().length };
    const ks = [];
    let lowAt = null;
    for (let k = 0; k < 30 * 3 && !e.dead; k++) { park(); step(1); if (!e.dead) { ks.push(g.k); if (lowAt == null && g.k <= 0.4) lowAt = +(G.time - t0).toFixed(2); } }
    step(2);
    const chunks = G.zones.asteroids.list.slice(rubble0);
    Object.assign(out.end, {
      frozen: ks.slice(0, 13).every((k) => k === 1), monotonic: ks.every((k, i) => i === 0 || k <= ks[i - 1] + 1e-9), minK: +Math.min(...ks).toFixed(3), lowAt,
      dead: e.dead, allGone: g.parts.every((x) => x.broken), rubble: chunks.length, sizes: chunks.every((a) => a.size >= 12 && a.size <= 14 && a.safe > 0), rubbleAt,
      completed: O.completed - done0, banner: document.querySelector('#banner h1').textContent, lives: p.lives, reward, expected: Math.round((400 + lvl * 100) * 1.5), gained: G.score - score0,
      inList: E.list.includes(e), bar: document.getElementById('boss-bar').classList.contains('hidden'), toast: notes.includes('Grumbleglobe is deflating! That sound was the planet. Probably.'),
    });
    // The rubble can be shot apart.
    delete G.zones.asteroids.spawn;
    const chunk = chunks[0];
    if (chunk) { const n1 = G.zones.asteroids.list.length; for (let k = 0; k < 3 && G.zones.asteroids.list.includes(chunk); k++) shoot(chunk.pos.clone().add(new V(0, 0, 30)), chunk.pos, 6); out.end.rubbleShot = !G.zones.asteroids.list.includes(chunk) && G.zones.asteroids.list.length < n1; }
    for (let k = 0; k < 30 * 6 && !O.current; k++) step(1);
    out.next = { type: O.current?.type, siege: !!O.current?.siege, zone: G.zones.current.name };

    // ---- Lap 2: gadgets have 1.4× hp, the moons orbit 1.25× faster and fire two-shot bursts. A fresh run continued from
    // this zone (resetRun + enter, as "CONTINUE") gets a fresh planet.
    quiet(); clear();
    G.zones.lap = 2;
    O.resetRun();
    G.zones.enter(zi);
    for (let k = 0; k < 30 * 6 && !globe(); k++) step(1);
    const g2 = globe();
    out.fresh = g2 && { other: g2 !== g, intact: g2.parts.every((x) => !x.broken), moonHp: +g2.parts.find((x) => x.kind === 'moon').hp.toFixed(2), eyeHp: +g2.eye.hp.toFixed(2), hp: g2.e.hp };
    if (g2) {
      for (let k = 0; k < 30 * 2; k++) step(1); // grown in
      const park2 = () => { p.pos.copy(g2.C).add(new V(0, 0, 2000)); p.prevPos.copy(p.pos); p.speed = 0.001; };
      park2();
      const a0 = g2.moonA[0]; step(30);
      out.fresh.w = +(((((g2.moonA[0] - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / 0.85).toFixed(3);
      // Bursts: hover over a moon until it fires twice in a row 0.25 s apart.
      const m2 = g2.parts.find((x) => x.kind === 'moon'), times = [], fire2 = g2.fire.bind(g2);
      g2.fire = (x) => { if (x === m2) times.push(G.time); return fire2(x); };
      for (let k = 0; k < 30 * 8 && times.length < 2; k++) { p.pos.copy(m2.mid).add(new V(0, 150, 0)); p.prevPos.copy(p.pos); p.speed = 0.001; p.health = p.maxHealth; step(1); }
      out.fresh.burst = times.length >= 2 && times[1] - times[0] < 0.4;
      park2();
      // Persuasion 'easier': -30% hp on what's left, two fewer Grumblings at once.
      const cap0 = g2.grumbCap();
      O.current.easier();
      out.fresh.easier = { cap: [cap0, g2.grumbCap()], eyeHp: +g2.eye.hp.toFixed(2) };
      // Every pore plugged first, then the moons: the shield still drops and phase 2 starts at once.
      for (const q of g2.parts.filter((y) => y.kind === 'pore')) for (let k = 0; k < 8 && !q.broken; k++) shoot(q.mid.clone().addScaledVector(q.wn, 40), q.mid);
      for (const x of g2.parts.filter((y) => y.kind === 'moon')) for (let k = 0; k < 20 && !x.broken; k++) shoot(x.mid.clone().add(new V(0, 60, 0)), x.mid, 10);
      out.fresh.shieldPores = { pores: g2.left('pore'), moons: g2.moons(), shieldDown: g2.shieldDown, phase: g2.phase, hp: +g2.e.hp.toFixed(1) };
      // The eye is the finisher: breaking it ends the fight with the bar well above 0.
      for (let k = 0; k < 30 * 12 && !g2.eyeOpen(); k++) { park2(); step(1); }
      const hpBefore = +g2.e.hp.toFixed(1);
      for (let k = 0; k < 40 && !g2.eye.broken && g2.eyeOpen(); k++) shoot(g2.eye.mid.clone().addScaledVector(g2.eye.wn, 60), g2.eye.mid);
      const broke = g2.eye.broken, dying = g2.dying >= 0;
      for (let k = 0; k < 30 * 3 && !g2.e.dead; k++) { park2(); step(1); }
      out.eyeKill = { hpBefore, broke, dying, dead: g2.e.dead, allGone: g2.parts.every((x) => x.broken) };
    }
    quiet(); clear();
    // A fresh planet whose fight is called off (dispose) takes its Grumblings with it.
    {
      O.resetRun();
      G.zones.enter(zi);
      for (let k = 0; k < 30 * 6 && !globe(); k++) step(1);
      const g3 = globe();
      if (g3) { step(45); g3.burp(g3.parts.find((x) => x.kind === 'pore')); const before = grumblings().length; quiet(); out.disposed = { before, after: grumblings().length, inList: E.list.includes(g3.e) }; }
    }
    quiet(); clear();

    G.zones.lap = saved.lap;
    G.zones.enter(saved.zone);
    step(30);
    quiet(); clear();
    Object.assign(G, { score: saved.score });
    Object.assign(O, { completed: saved.completed, bossLevel: saved.bossLevel, nextBossAt: saved.nextBossAt, bossDeck: saved.deck, cooldown: 4 });
    G.zones.sinceZone = saved.sinceZone;
    G.mutations.celebrate = saved.celebrate;
    G.ui.notify = saved.notify;
    delete G.fx.popText;
    delete E.spawn;
    E.spawnTimer = 6;
    p.god = saved.god;
    p.lives = saved.lives;
    G.persuasion.update = saved.persuade;
    return out;
  });
  // A portrait phone gets the wider view.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pp = await guard(await ctx.newPage());
    await pp.goto(origin + '/');
    await pp.waitForFunction(() => window.G && window.G.terrain.chunks.size > 20, null, { timeout: 30000 });
    await pp.evaluate(() => { window.G.finds.off = true; }); // no surprise hidden finds while other systems are measured
    await pp.click('#start');
    F.portraitFov = await pp.evaluate(() => { const G = window.G; for (let k = 0; k < 120; k++) { G.player.invuln = 99; G.step(1 / 30); } return +G.camera.fov.toFixed(1); });
    // At that wider view, a fresh run's first hoop is on screen too (20 first hoops, from fresh headings).
    F.portraitMarker = await pp.evaluate(() => {
      const G = window.G, O = G.objectives, p = G.player;
      O.cooldown = 1e9;
      G.enemies.spawnTimer = 1e9;
      let seen = 0;
      for (let k = 0; k < 20; k++) {
        if (O.current) { O.current.dispose(G); O.current = null; }
        G.persuasion.reset(null);
        p.spawn(p.pos.x, p.pos.z, Math.random() * Math.PI * 2);
        for (let i = 0; i < 30; i++) { p.invuln = 99; G.step(1 / 30); } // the camera swings round behind the new heading
        O.completed = 0;
        O.startType('hoop');
        p.invuln = 99; G.step(1 / 30);
        if (document.getElementById('marker').style.display === 'block') seen++;
      }
      return seen;
    });
    await ctx.close();
  }
  // Reduced motion: no shake, no cinematic look, and the CSS throbs and spins stop.
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 640 }, reducedMotion: 'reduce' });
    const rp = await guard(await ctx.newPage());
    await rp.goto(origin + '/');
    await rp.waitForFunction(() => window.G && window.G.terrain.chunks.size > 20, null, { timeout: 30000 });
    await rp.evaluate(() => { window.G.finds.off = true; }); // no surprise hidden finds while other systems are measured
    await rp.click('#start');
    F.reduced = await rp.evaluate(() => {
      const G = window.G, p = G.player, V = p.pos.constructor;
      const step = (n) => { for (let k = 0; k < n; k++) { p.invuln = 99; G.step(1 / 30); } };
      step(30);
      p.invuln = 0;
      p.damage(5);
      step(1);
      const off = G.camShake.off.length();
      G.camPeek = { at: p.pos.clone().addScaledVector(p.right, 300), w: 1 };
      step(1);
      const d = new V();
      G.camera.getWorldDirection(d);
      const look = +d.dot(p.pos.clone().addScaledVector(p.forward, 30).sub(G.camera.position).normalize()).toFixed(3);
      G.camPeek = null;
      G.pullup.glow.classList.add('on');
      const anim = ['#pullup-glow', '#marker .diamond'].map((s) => getComputedStyle(document.querySelector(s)).animationName);
      G.pullup.glow.classList.remove('on');
      p.invuln = 0;
      p.crash('ground');
      const flash = G.ui.flashA; // the crash flash's peak (halved under reduced motion by ui.js flash())
      return { on: G.comfort.reducedMotion, off, look, anim, flash };
    });
    await ctx.close();
  }
  // Settings: I, N and M are remembered across a reload (and said so at take-off). Cleared afterwards.
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    const sp = await guard(await ctx.newPage());
    await sp.goto(origin + '/');
    await sp.waitForFunction(() => window.G && window.G.step, null, { timeout: 30000 });
    await sp.evaluate(() => { window.G.finds.off = true; }); // no surprise hidden finds while other systems are measured
    F.settingsDefault = await sp.evaluate(() => ({ invert: window.G.input.invert, muted: window.G.audio.muted, stored: localStorage.getItem('landed-settings') }));
    await sp.click('#start');
    for (const k of ['KeyI', 'KeyN', 'KeyM']) await sp.keyboard.press(k);
    await sp.reload();
    await sp.waitForFunction(() => window.G && window.G.step, null, { timeout: 30000 });
    const before = await sp.evaluate(() => ({ invert: window.G.input.invert, muted: window.G.audio.muted }));
    await sp.click('#start');
    F.settings = await sp.evaluate((before) => {
      const G = window.G;
      const notes = [...G.ui.notes, ...G.ui.queue].map((n) => n.text);
      return { before, invert: G.input.invert, music: G.audio.music?.enabled, muted: G.audio.muted, master: G.audio.master?.gain.value, note: notes.find((n) => /Remembered/.test(n)) || null };
    }, before);
    await sp.evaluate(() => localStorage.removeItem('landed-settings'));
    F.settingsCleared = await sp.evaluate(() => localStorage.getItem('landed-settings') === null);
    await ctx.close();
  }
  // Junk in storage (hand-edited, or from another build): the game boots with the defaults, no page errors, and no
  // "Furthest" line for a zone the list doesn't have or an absurd lap. Cleared afterwards.
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    const jp = await guard(await ctx.newPage());
    await jp.goto(origin + '/');
    await jp.waitForFunction(() => window.G && window.G.step, null, { timeout: 30000 });
    await jp.evaluate(() => { window.G.finds.off = true; }); // no surprise hidden finds while other systems are measured
    const errors0 = errors.length;
    F.junk = [];
    for (const [settings, furthest] of [['{bad', '{"index":99,"lap":1}'], ['5', '{"index":0,"lap":1e21}'], ['{"invert":"yes"}', '{"index":0,"lap":1e21}']]) {
      await jp.evaluate(([s, f]) => { localStorage.setItem('landed-settings', s); localStorage.setItem('landed-furthest', f); }, [settings, furthest]);
      await jp.reload();
      await jp.waitForFunction(() => window.G && window.G.step, null, { timeout: 30000 });
      F.junk.push(await jp.evaluate(() => {
        const G = window.G, el = document.getElementById('furthest');
        return { invert: G.input.invert, muted: G.audio.muted, furthest: G.progress.furthest, text: el.textContent, shown: el.checkVisibility() };
      }));
    }
    F.junkErrors = errors.slice(errors0);
    await jp.evaluate(() => { localStorage.removeItem('landed-settings'); localStorage.removeItem('landed-furthest'); });
    F.junkCleared = await jp.evaluate(() => localStorage.getItem('landed-settings') === null && localStorage.getItem('landed-furthest') === null);
    await ctx.close();
  }
  report.feel = F;

  // Lives and Game Over: each crash costs a life and respawns with a full hull (Relax Mode crashes are free), the hull
  // mends slowly (nothing in the first 10 s after a hit), a promotion repairs it, and losing the last life shows the
  // Game Over card and freezes the game. "Fly again" (a real click, then Enter) starts a fresh run in place.
  const L = {};
  L.run = await page.evaluate(() => {
    const G = window.G, p = G.player, out = {};
    const hearts = () => document.getElementById('lives').textContent;
    const step = (n) => { for (let i = 0; i < n; i++) { p.invuln = 99; G.step(1 / 30); } };
    const settle = () => { for (let i = 0; i < 90 && p.dead; i++) G.step(1 / 30); }; // 3 s: the explosion, then respawn or Game Over
    const crash = () => { p.invuln = 0; p.crash('ground'); };
    G.enemies.spawnTimer = 1e9;
    G.enemies.list.slice().forEach((e) => G.enemies.removeEnemy(e));
    G.enemies.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
    if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
    G.persuasion.reset(null);
    G.objectives.cooldown = 1e9; // no points (so no promotion) and no repair kit mid-check
    G.powerups.resetRun();
    G.powerups.timer = 1e9;
    out.was = { relax: G.relax, god: p.god };
    if (G.relax) G.setRelax(false);
    p.god = false;
    p.lives = 3;
    step(1);
    out.hearts3 = hearts();
    p.health = 10;
    const max0 = p.maxHealth, lvl0 = G.progress.level;
    G.devmenu.levelUp();
    // One promotion: its perk may add hull (Hull +20 adds to both), then +50, capped at the max.
    out.levelUp = { health: p.health, max: p.maxHealth, want: Math.min(p.maxHealth, 10 + (p.maxHealth - max0) + 50), levels: G.progress.level - lvl0, note: [...G.ui.notes, ...G.ui.queue].some((n) => /Hull \+50/.test(n.text)) };
    p.health = 50; p.sinceHit = 0;
    step(30 * 11);
    out.regen = { at11s: p.health, rate: p.stats.regen };
    step(30 * 3);
    out.regen.at14s = p.health;
    crash();
    out.crash1 = { lives: p.lives, hearts: hearts(), dead: p.dead };
    settle();
    out.respawn1 = { dead: p.dead, full: p.health === p.maxHealth, lives: p.lives };
    G.setRelax(true);
    crash();
    settle();
    out.relax = { lives: p.lives, dead: p.dead };
    G.setRelax(false);
    crash();
    settle();
    G.score = G.progress.best.score + 777; // a new best, saved before the card shows it
    G.step(1 / 30);
    crash();
    out.last = { lives: p.lives, hearts: hearts(), overAtOnce: G.gameOver };
    settle();
    const card = document.getElementById('gameover');
    let saved = 0;
    try { saved = JSON.parse(localStorage.getItem('landed-best')).score; } catch { /* none */ }
    out.over = {
      gameOver: G.gameOver, paused: G.paused, shown: !card.classList.contains('hidden'), score: G.score, level: G.progress.level,
      cardScore: document.getElementById('go-score').textContent, cardText: card.textContent, saved,
    };
    return out;
  });
  L.time0 = await page.evaluate(() => window.G.time);
  await page.waitForTimeout(400);
  L.frozen = (await page.evaluate(() => window.G.time)) === L.time0;
  await page.click('#again');
  const fresh = () => page.evaluate(() => {
    const G = window.G, p = G.player;
    G.step(1 / 30);
    return {
      lives: p.lives, hearts: document.getElementById('lives').textContent, score: G.score, level: G.progress.level, perks: G.progress.perks.length,
      maxHealth: p.maxHealth, health: p.health, regen: p.stats.regen, over: G.gameOver, paused: G.paused, dead: p.dead,
      hidden: document.getElementById('gameover').classList.contains('hidden'), completed: G.objectives.completed, zone: G.zones.index,
    };
  });
  L.again = await fresh();
  await page.evaluate(() => { const p = window.G.player; p.lives = 1; p.invuln = 0; p.crash('water'); for (let i = 0; i < 90 && !window.G.gameOver; i++) window.G.step(1 / 30); });
  L.overByKey = await page.evaluate(() => window.G.gameOver);
  await page.keyboard.press('Space'); // a shot just as the card appears doesn't skip it...
  await page.keyboard.press('Enter');
  L.keyLocked = await page.evaluate(() => window.G.gameOver && !document.getElementById('gameover').classList.contains('hidden'));
  // A Game Over back in zone 1 (lap 1) has nothing to continue from: no Continue button.
  L.noContinueAtZone0 = await page.evaluate(() => window.G.zones.index === 0 && window.G.zones.lap === 1 && !document.getElementById('continue').checkVisibility());
  await page.waitForTimeout(1100); // ...but after a second, Enter flies again
  await page.keyboard.press('Enter');
  L.againByKey = await fresh();
  // Continue: a Game Over in zone 5 (index 4) offers to continue from it. Clicking starts the same fresh run as Fly
  // again, but in that zone; that run's Game Over card says where it continued from, and C (after the key lock) works too.
  const zoneOver = () => page.evaluate(() => {
    const G = window.G, p = G.player;
    G.score = 321;
    G.devmenu.levelUp();
    G.objectives.completed = 2;
    p.lives = 1; p.invuln = 0; p.crash('ground');
    for (let i = 0; i < 90 && !G.gameOver; i++) G.step(1 / 30);
    const btn = document.getElementById('continue');
    return { over: G.gameOver, shown: btn.checkVisibility(), label: btn.textContent, lines: document.getElementById('go-lines').textContent };
  });
  L.zone4 = await page.evaluate(async () => {
    const { ZONES } = await import('./src/zones.js');
    window.G.zones.enter(4);
    window.G.step(1 / 30);
    return { name: ZONES[4].name, zone: window.G.zones.index };
  });
  L.continueCard = await zoneOver();
  await page.click('#continue');
  L.continued = await fresh();
  L.continuedCard = await zoneOver();
  await page.keyboard.press('KeyC');
  L.continueKeyLocked = await page.evaluate(() => window.G.gameOver);
  await page.waitForTimeout(1100);
  await page.keyboard.press('KeyC');
  L.continuedByKey = await fresh();
  // Furthest zone: three objectives in zone 1 fly on into zone 2, and that's remembered (checked after the reload
  // below, on the title card). A dev-menu jump further on doesn't count.
  L.furthest = await page.evaluate(() => {
    const G = window.G;
    localStorage.removeItem('landed-furthest');
    G.progress.furthest = null;
    G.zones.lap = 1;
    G.zones.sinceZone = 0;
    G.zones.enter(0);
    for (let k = 0; k < 3; k++) G.zones.onObjectiveComplete();
    const saved = localStorage.getItem('landed-furthest');
    G.devmenu.enterZone(9);
    return { zone: G.zones.index, saved, afterJump: localStorage.getItem('landed-furthest') };
  });
  report.lives = L;

  // Land enemies (Nov 2026): Ember Bats and Magma Spitters spawn only in Volcano Land, Comet Chargers only in the space
  // lands. A spitter under the lava can't be hurt, comes up, spits a fan of fireballs and sinks again; a charger winds
  // up, then charges; a bat flares, then swoops into you.
  report.landEnemies = await page.evaluate(async () => {
    const G = window.G, p = G.player, E = G.enemies, out = {};
    const { ZONES } = await import('./src/zones.js');
    const { MAGMA, COMET, SQUIRREL } = await import('./src/enemies.js');
    const zi = (n) => ZONES.findIndex((z) => z.name === n);
    const god = p.god, timer = E.spawnTimer, calm = E.calmTimer, score = G.score, damage = p.damage;
    E.spawnTimer = 1e9; E.calmTimer = 0;
    G.powerups.active.clear(); // Time Freeze or a Shield would change what's measured
    const clear = () => { E.list.slice().forEach((x) => E.removeEnemy(x)); E.shots.splice(0).forEach((s) => G.scene.remove(s.mesh)); };
    const LAND = ['emberBat', 'magmaSpitter', 'cometCharger'];
    const picked = () => { const seen = new Set(); for (let k = 0; k < 600; k++) seen.add(E.pickType()); return LAND.filter((t) => seen.has(t)); };
    G.score = 5000;
    const into = (name) => { G.zones.enter(zi(name)); G.objectives.cooldown = 1e9; clear(); };
    into('Meadowlands'); out.meadow = picked();
    into('Volcano Land'); out.volcano = picked();
    into('Meteor Belt'); out.belt = picked();
    into('The Moon'); out.moon = picked();
    let hits = [];
    p.god = true; // no crashing into a volcano mid-check; hits are counted here instead
    p.damage = function (n) { hits.push(n); };
    const step = (n, f) => { for (let k = 0; k < n; k++) { f?.(); G.step(1 / 30); } };
    const ahead = (d, up = 0) => p.pos.clone().addScaledVector(p.forward, d).setY(p.pos.y + up);
    // Magma Spitter, 150 m ahead: under, then up with a 3-fireball fan, then under again.
    into('Volcano Land');
    p.pos.y = Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z), G.world.seaLevel) + 120;
    const s = E.spawn('magmaSpitter', ahead(150));
    const S = { states: [], shotsMax: 0, fired: 0, hpUnder: null };
    // Count the fireballs as they're launched: one that spawns inside a slope 150 m ahead bursts on the ground in the
    // same step, so the live shot list alone can miss a fan that was fired.
    const fireOrb = E.fireOrb;
    E.fireOrb = function (...a) { S.fired++; return fireOrb.apply(this, a); };
    step(1);
    s.state = 'under'; s.stateT = 0; s.hold = 0.5;
    // Pinned 150 m ahead of the plane so it's always in range.
    const pin = () => { s.pos.copy(ahead(150)); };
    step(1, pin);
    S.shieldUnder = s.shield;
    const hp0 = s.hp;
    for (let k = 0; k < 30 * 8; k++) {
      pin();
      G.step(1 / 30);
      if (S.states.at(-1) !== s.state) S.states.push(s.state);
      S.shotsMax = Math.max(S.shotsMax, E.shots.length);
      if (S.fired && S.firedIn == null) S.firedIn = s.state; // the fan goes out while it's up
      if (s.state === 'up') S.shieldUp = s.shield;
      if (S.states.length >= 5) break;
    }
    E.fireOrb = fireOrb;
    S.hp = [hp0, s.hp];
    out.spitter = S;
    clear();
    // Ember Bats: a bat right ahead flares, then swoops; contact costs hull and pops it.
    hits = [];
    const bats = [0, 1, 2].map((k) => E.spawn('emberBat', k ? ahead(60 + k * 5, 5) : ahead(25))); // the first one close: it flares and swoops at once
    const B = { states: new Set(), popped: 0 };
    bats[0].cd = 0;
    step(30 * 6, () => { for (const b of bats) B.states.add(b.state); });
    B.popped = bats.filter((b) => b.dead).length;
    B.hits = hits.slice();
    out.bats = { states: [...B.states], popped: B.popped, hits: B.hits };
    clear();
    // Flying Squirrels are tail-shy (SQUIRREL): one behind you never dives and comes round wide without bumping you; a
    // dive that ends up behind you, or a barrel roll, makes it peel off, harmless, and come back round in front. A dive
    // from the front still hits.
    into('Meadowlands');
    p.pos.y = Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z), G.world.seaLevel) + 120;
    const nose = (e) => e.pos.clone().sub(p.pos).normalize().dot(p.forward);
    const Q = {};
    // A: 45 m behind, ready to dive: it doesn't, and nothing touches you while it's behind.
    hits = [];
    let q = E.spawn('flyingSquirrel', ahead(-45, 5)), prev = q.state;
    q.cd = 0;
    Q.behind = { flares: [], bumps: 0, states: new Set() };
    step(30 * 3, () => {
      if (q.state === 'flare' && prev !== 'flare') Q.behind.flares.push(+nose(q).toFixed(2));
      if (hits.length && nose(q) < SQUIRREL.front) Q.behind.bumps = hits.length;
      Q.behind.states.add(q.state); prev = q.state;
    });
    Q.behind.states = [...Q.behind.states];
    clear();
    // B: a dive that ends up 40 m behind you peels off: harmless while it peels, back in front within a few seconds.
    hits = [];
    q = E.spawn('flyingSquirrel', ahead(-40, 3));
    q.state = 'swoop'; q.stateT = 0;
    G.step(1 / 30);
    Q.dive = { state: q.state, harmless: q.contactCd === Infinity, backIn: null };
    for (let k = 1; k <= 30 * 6 && Q.dive.backIn == null; k++) { G.step(1 / 30); if (q.state === 'idle') Q.dive.backIn = +(k / 30).toFixed(1); }
    Q.dive.nose = +nose(q).toFixed(2);
    Q.dive.hits = hits.length;
    clear();
    // C: a barrel roll with a squirrel on your tail shakes it off (and says why, once).
    hits = [];
    q = E.spawn('flyingSquirrel', ahead(-50, 3));
    q.cd = 99;
    E.shakeTold = false;
    p.maneuverCd = 0; p.startManeuver('left');
    step(3);
    Q.roll = { state: q.state, told: E.shakeTold };
    p.maneuver = null; p.dodging = false; p.maneuverCd = 0;
    clear();
    // D: dead ahead, it flares, dives and hits you for its 12 hull.
    hits = [];
    q = E.spawn('flyingSquirrel', ahead(80));
    q.cd = 0;
    Q.front = { states: new Set(), dives: 0 };
    // One dive can still come in from wide and miss (the plane's own path isn't scripted): up to 8 s, put back dead
    // ahead and ready again after each miss, until one connects.
    for (let k = 0; k < 30 * 8 && !hits.length && !q.dead; k++) {
      if (q.state === 'idle' && q.cd > 0 && Q.front.states.has('swoop')) { q.pos.copy(ahead(80)); q.vel.set(0, 0, 0); q.cd = 0; q.restT = 0; } // a miss: dead ahead again
      const was = q.state;
      G.step(1 / 30);
      if (q.state === 'swoop' && was !== 'swoop') Q.front.dives++;
      Q.front.states.add(q.state);
    }
    Q.front.states = [...Q.front.states];
    Q.front.hits = hits.slice();
    out.squirrels = Q;
    clear();
    // Comet Charger in Low Orbit: winds up, then charges at COMET.speed.
    into('Low Orbit');
    hits = [];
    const c = E.spawn('cometCharger', ahead(160, 10));
    c.cd = 0;
    const C = { states: [], topSpeed: 0, windT: 0 };
    for (let k = 0; k < 30 * 6; k++) {
      G.step(1 / 30);
      if (C.states.at(-1) !== c.state) C.states.push(c.state);
      if (c.state === 'wind') C.windT += 1 / 30;
      if (c.state === 'dash') C.topSpeed = Math.max(C.topSpeed, c.vel.length());
      if (c.state === 'coast') break;
    }
    C.windT = +C.windT.toFixed(2);
    C.topSpeed = Math.round(C.topSpeed);
    C.hits = hits.slice();
    out.charger = C;
    out.consts = { wind: COMET.wind, speed: COMET.speed, shots: MAGMA.shots };
    clear();
    // Every land has at least one enemy of its own (Grumbleglobe: its Grumblings), and none turns up outside its lands.
    // Each new land enemy, flown in its first land, goes through its move: a swooper flares, an ambusher rises out of
    // the ground (and can be hurt only then), a charger winds up and charges.
    const { TYPES } = await import('./src/enemies.js');
    const own = Object.keys(TYPES).filter((k) => TYPES[k].lands);
    out.perLand = {}; out.stray = [];
    for (const z of ZONES) {
      if (z.siege) continue;
      into(z.name);
      const seen = new Set(); for (let k = 0; k < 800; k++) seen.add(E.pickType());
      out.perLand[z.name] = own.filter((t) => seen.has(t));
      for (const t of out.perLand[z.name]) if (!TYPES[t].lands.includes(z.name)) out.stray.push(`${t}@${z.name}`);
    }
    out.moves = {};
    for (const t of own.filter((k) => !LAND.includes(k))) {
      const d = TYPES[t];
      into(d.lands[0]);
      p.pos.y = Math.min(Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z), G.world.seaLevel) + 90, G.terrain.ceilingHeight(p.pos.x, p.pos.z) - 30);
      const e = E.spawn(t, d.act === 'ambush' ? ahead(150) : ahead(d.act === 'charge' ? 160 : 25, d.act === 'charge' ? 10 : 0));
      e.cd = 0;
      if (d.act === 'ambush') { step(1); e.state = 'under'; e.stateT = 0; e.hold = 0.5; }
      const seen = new Set(), M = { shieldUp: null };
      for (let k = 0; k < 30 * 8 && !e.dead; k++) {
        if (d.act === 'ambush') e.pos.copy(ahead(150));
        G.step(1 / 30);
        seen.add(e.state);
        if (d.act === 'ambush' && e.state === 'up') M.shieldUp = e.shield;
      }
      out.moves[t] = { act: d.act, states: [...seen], shieldUp: M.shieldUp };
      clear();
    }
    p.damage = damage;
    p.god = god;
    E.spawnTimer = timer; E.calmTimer = calm;
    G.score = score;
    G.zones.enter(0);
    return out;
  });

  // Land set pieces: Volcano Land keeps a few fire geysers on dry rock round the player (none in other lands). A vent
  // idles, rumbles, then blows a pillar of fire: flying through it scorches once per eruption, skimming past is a
  // "Toasty!" near miss worth a few points.
  report.setPieces = await page.evaluate(async () => {
    const G = window.G, p = G.player, E = G.enemies, SP = G.zones.setPieces, out = {};
    const { ZONES } = await import('./src/zones.js');
    const { GEYSER } = await import('./src/setpieces.js');
    const zi = (n) => ZONES.findIndex((z) => z.name === n);
    const god = p.god, timer = E.spawnTimer, damage = p.damage, score = G.score;
    E.spawnTimer = 1e9;
    G.powerups.active.clear();
    const clear = () => { E.list.slice().forEach((x) => E.removeEnemy(x)); E.shots.splice(0).forEach((s) => G.scene.remove(s.mesh)); };
    const step = (n, f) => { for (let k = 0; k < n; k++) { f?.(); G.step(1 / 30); } };
    const into = (name) => { G.zones.enter(zi(name)); G.objectives.cooldown = 1e9; clear(); p.god = true; };
    into('Meadowlands'); step(60); out.meadow = SP.list.length;
    into('Volcano Land');
    for (let k = 0; k < 40 && SP.list.length < 3; k++) { step(15); p.pos.addScaledVector(p.forward, 40); }
    out.count = SP.list.length;
    out.dry = SP.list.every((v) => v.mouth.y + 4 - 22.6 >= G.world.seaLevel + GEYSER.dry - 0.01);
    const hits = [];
    p.damage = function (n) { hits.push(n); };
    // One vent through its cycle, with the plane parked inside the pillar.
    const v = SP.list[0], states = [];
    const at = (dx) => () => { p.pos.set(v.mouth.x + dx, v.mouth.y + 40, v.mouth.z); p.vel?.set?.(0, 0, 0); clear(); };
    v.state = 'idle'; v.t = 0.05;
    for (let k = 0; k < 30 * 6 && !(states.includes('blast') && v.state === 'idle'); k++) {
      at(0)(); G.step(1 / 30);
      if (states.at(-1) !== v.state) states.push(v.state);
    }
    out.states = states;
    out.hits = hits.slice();
    // Next eruption, parked just beside the pillar: a near miss, no scorch.
    hits.length = 0;
    const s0 = G.score;
    v.state = 'rumble'; v.t = 0.05;
    step(30 * 3, at(GEYSER.radius + 6));
    out.nearHits = hits.length;
    out.nearScore = G.score - s0;
    out.volcanoCastle = !!SP.castleInfo;
    // Princess Kingdom: one huge castle ahead. Its gate is a bonus way in, its stone is solid but only knocks you.
    const { CASTLE } = await import('./src/setpieces.js');
    out.volcanoMeteorsAll = SP.meteorList.length; // still in Volcano Land here
    into('Princess Kingdom');
    for (let k = 0; k < 40 && !SP.castleInfo; k++) { step(15); p.pos.addScaledVector(p.forward, 40); }
    const c = SP.castleInfo;
    out.castle = !!c;
    if (c) {
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      const put = (lx, ly, lz) => p.pos.set(c.pos.x + lx * cs + lz * sn, c.pos.y + ly, c.pos.z - lx * sn + lz * cs);
      hits.length = 0;
      const s1 = G.score;
      for (let k = 0; k <= 40; k++) { put(0, 12, CASTLE.half + 20 - k); clear(); G.step(1 / 30); }
      out.gate = { welcomed: c.welcomed, score: G.score - s1, hits: hits.length };
      hits.length = 0;
      c.bumpT = 0;
      put(CASTLE.half, 40, CASTLE.half); // in the middle of a corner tower
      G.step(1 / 30);
      const L = SP.castleLocal(c, p.pos.clone());
      out.tower = { hits: hits.slice(), out: Math.hypot(L.x - CASTLE.half, L.z - CASTLE.half) >= CASTLE.towerR * 1.15 - 0.01 };
    }
    // The Moon: meteors streak down ahead. Shot down: +20. Left alone: a crater, and a knock if you're close.
    const { METEOR } = await import('./src/setpieces.js');
    into('The Moon');
    let most = 0;
    for (let k = 0; k < 30 * 25 && !most; k++) { G.step(1 / 30); most = Math.max(most, SP.meteorList.length); }
    out.moonMeteors = most;
    SP.meteorT = 1e9; // no new ones while the checks run
    SP.meteorList.slice().forEach(() => SP.dropMeteor(0));
    const fwd = (d) => p.pos.clone().addScaledVector(p.forward, d);
    {
      const t = fwd(500), m = SP.spawnMeteor(t.x, t.z), s2 = G.score;
      for (let k = 0; k < 6 && SP.meteorList.includes(m); k++) { const mesh = new (p.model.group.constructor)(); G.scene.add(mesh); p.bullets.push({ mesh, pos: m.pos.clone(), vel: m.vel.clone(), life: 1, dmg: 1 }); G.step(1 / 30); }
      out.shot = { gone: !SP.meteorList.includes(m), score: G.score - s2 };
    }
    {
      hits.length = 0;
      const t = fwd(500), m = SP.spawnMeteor(t.x, t.z), far = p.pos.clone();
      for (let k = 0; k < 30 * 8 && SP.meteorList.includes(m); k++) { p.pos.copy(far); G.step(1 / 30); }
      out.landedFar = { gone: !SP.meteorList.includes(m), hits: hits.filter((n) => n === METEOR.dmg).length }; // the Moon's asteroids hit harder, they don't count
      hits.length = 0;
      // In the blast but out of its path: 18 m from where it lands, on the side away from where it comes in, at the
      // spot whose ground keeps you closest (a crater rim or a boulder hill could otherwise lift you out of the blast).
      const t2 = fwd(300), m2 = SP.spawnMeteor(t2.x, t2.z), inA = Math.atan2(-m2.vel.z, -m2.vel.x);
      let near = null;
      for (let k = 0; k < 8; k++) {
        const a = inA + Math.PI * (0.5 + k / 7), x = m2.target.x + Math.cos(a) * 18, z = m2.target.z + Math.sin(a) * 18;
        const spot = new far.constructor(x, Math.max(m2.target.y + 10, G.terrain.surfaceHeight(x, z) + 4), z);
        if (!near || spot.distanceTo(m2.target) < near.distanceTo(m2.target)) near = spot;
      }
      for (let k = 0; k < 30 * 8 && SP.meteorList.includes(m2); k++) { p.pos.copy(near); G.step(1 / 30); }
      out.landedNear = { gone: !SP.meteorList.includes(m2), hits: hits.filter((n) => n === METEOR.dmg) };
    }
    // Frozen Peaks: ice arches ahead. Threading one is +30 once; the ice is solid, a leg knocks once and shoves you off.
    const { ARCH } = await import('./src/setpieces.js');
    out.moonArches = SP.archList.length;
    into('Frozen Peaks');
    for (let k = 0; k < 40 && !SP.archList.length; k++) { step(15); p.pos.addScaledVector(p.forward, 40); }
    out.arches = SP.archList.length;
    const a = SP.archList[0];
    if (a) {
      const cs = Math.cos(a.yaw), sn = Math.sin(a.yaw);
      const put = (lx, ly, lz) => p.pos.set(a.pos.x + lx * cs + lz * sn, a.pos.y + ly, a.pos.z - lx * sn + lz * cs);
      hits.length = 0;
      const s3 = G.score;
      for (let k = 0; k <= 40; k++) { put(0, a.spring * 0.6, 20 - k); clear(); G.step(1 / 30); }
      for (let k = 0; k <= 40; k++) { put(0, a.spring * 0.6, -20 + k); clear(); G.step(1 / 30); } // back through: no second bonus
      out.thread = { threaded: a.threaded, score: G.score - s3, hits: hits.filter((n) => n === ARCH.dmg).length };
      hits.length = 0;
      a.bumpT = 0;
      // Nearly still for the one step, so the plane's own flight (whatever heading the world left it on) can't carry it
      // back into the leg after the shove.
      const v0 = p.speed, w0 = p.wind.clone();
      p.speed = 0.001; p.wind.set(0, 0, 0);
      put(a.R, a.spring * 0.5, 0); // inside a leg
      G.step(1 / 30);
      const L = SP.archLocal(a, p.pos.clone());
      out.leg = { hits: hits.filter((n) => n === ARCH.dmg).length, off: Math.abs(Math.abs(L.x) - a.R) >= ARCH.thick * 1.3 - 0.01, gap: +(Math.abs(L.x) - a.R).toFixed(2) };
      p.speed = v0; p.wind.copy(w0);
    }
    // Tropical Archipelago: whales breach out of the sea ahead. Skimming past one in the air is +25 once; the whale is
    // solid: one knock per jump, and you're shoved clear.
    const { WHALE } = await import('./src/setpieces.js');
    out.frozenWhales = SP.whaleList.length;
    into('Tropical Archipelago');
    for (let k = 0; k < 40 && !SP.whaleList.length; k++) { step(15); p.pos.addScaledVector(p.forward, 40); }
    out.whales = SP.whaleList.length;
    SP.whaleT = 1e9; // no new ones while the checks run
    SP.whaleList.slice().forEach(() => SP.dropWhale(0));
    // The search above can fly the plane into an island; a downed plane meets no whales, so bring it back first.
    out.whaleDead = p.dead;
    if (p.dead) { p.spawn(p.pos.x, p.pos.z); p.pos.y = Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z), G.world.seaLevel) + 60; }
    {
      const t = p.pos.clone().addScaledVector(p.forward, 300), apex = (w) => Math.abs(w.vy / WHALE.gravity - w.t);
      const jump = (w, f) => { for (let k = 0; k < 30 * 10 && SP.whaleList.includes(w); k++) { if (w.state === 'air' && apex(w) < 0.6) f(); else p.pos.set(t.x, t.y + 400, t.z); p.grace = 1; clear(); G.step(1 / 30); } }; // grace: no crashing into the sea beside it
      hits.length = 0;
      const s4 = G.score, w = SP.spawnWhale(t.x, t.z, 1.2), side = new t.constructor(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
      jump(w, () => p.pos.copy(w.pos).addScaledVector(side, WHALE.radius * w.s + 8));
      out.pass = { passed: w.passed, splashed: w.splashed, gone: !SP.whaleList.includes(w), score: G.score - s4, hits: hits.filter((n) => n === WHALE.dmg).length, downed: out.whaleDead };
      hits.length = 0;
      const w2 = SP.spawnWhale(t.x, t.z, 1.2);
      let off = null;
      jump(w2, () => { p.pos.copy(w2.pos); if (off === null) { G.step(1 / 30); off = p.pos.distanceTo(w2.pos) >= WHALE.radius * w2.s; } });
      out.ram = { hits: hits.filter((n) => n === WHALE.dmg).length, off };
    }
    // Mushroom Forest: giant bounce mushrooms ahead. Touching a cap boings you up, nose lifted, +15 once per mushroom;
    // nothing about them hurts.
    out.tropicShrooms = SP.shroomList.length;
    into('Mushroom Forest');
    for (let k = 0; k < 40 && !SP.shroomList.length; k++) { step(15); p.pos.addScaledVector(p.forward, 40); }
    out.shrooms = SP.shroomList.length;
    const m = SP.shroomList[0];
    if (m) {
      hits.length = 0;
      const s5 = G.score, top = SP.capTop(m, 0);
      p.pos.set(m.pos.x, top - 1, m.pos.z);
      const y0 = p.pos.y, f0 = p.forward.y;
      clear(); G.step(1 / 30);
      const lifted = SP.liftT > 0;
      step(20, clear);
      out.boing = { lifted, score: G.score - s5, rise: p.pos.y - y0, nose: p.forward.y - f0 };
      m.bumpT = 0;
      p.pos.set(m.pos.x, SP.capTop(m, 0) - 1, m.pos.z);
      clear(); G.step(1 / 30);
      out.boing.again = G.score - s5; // a second bounce is just for fun
      out.boing.hits = hits.length;
    }
    // Autumn Woods: the great windmill. Slipping between its turning sails is +25 once; the sails and tower are solid:
    // one knock, and you're shoved clear.
    const { MILL } = await import('./src/setpieces.js');
    out.shroomMill = !!SP.millInfo;
    window.__smokeMill = true;
    into('Autumn Woods');
    for (let k = 0; k < 40 && !SP.millInfo; k++) { step(15); p.pos.addScaledVector(p.forward, 40); }
    const mill = SP.millInfo;
    out.mill = !!mill;
    if (mill) {
      const cs = Math.cos(mill.yaw), sn = Math.sin(mill.yaw);
      const put = (lx, ly, lz) => p.pos.set(mill.pos.x + lx * cs + lz * sn, mill.pos.y + ly, mill.pos.z - lx * sn + lz * cs);
      out.millGrounded = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => { const h = G.terrain.surfaceHeight(mill.pos.x + a * MILL.foot, mill.pos.z + b * MILL.foot); return h >= mill.pos.y - 0.01 && h <= mill.pos.y + MILL.base; }); // sunk into the low side, never floating or buried
      hits.length = 0;
      const s6 = G.score;
      // Sails on the diagonals: straight up from the hub is the gap between two of them.
      for (let k = 0; k <= 40; k++) { mill.angle = Math.PI / 4; put(0, mill.H + 26, MILL.hubZ + 20 - k); clear(); G.step(1 / 30); }
      for (let k = 0; k <= 40; k++) { mill.angle = Math.PI / 4; put(0, mill.H + 26, MILL.hubZ - 20 + k); clear(); G.step(1 / 30); } // back through: no second bonus
      out.sails = { threaded: mill.threaded, score: G.score - s6, hits: hits.filter((n) => n === MILL.dmg).length };
      hits.length = 0;
      mill.bumpT = 0;
      mill.prevZ = 3;
      mill.angle = 0; // one sail straight up, its canvas to the right of the arm
      put(MILL.sailW / 2 + 0.7, mill.H + 6 + MILL.sail * 0.4, MILL.hubZ + 1);
      clear(); G.step(1 / 30);
      const L = SP.archLocal(mill, p.pos.clone());
      out.sail = { hits: hits.filter((n) => n === MILL.dmg).length, off: L.z - MILL.hubZ >= MILL.thick + 2.5 * (p.sizeScale || 1) - 0.1 };
    }
    into('Meteor Belt'); step(30); out.belt = SP.list.length; out.beltCastle = !!SP.castleInfo; out.beltMeteors = SP.meteorList.length; out.beltArches = SP.archList.length; out.beltWhales = SP.whaleList.length; out.beltShrooms = SP.shroomList.length; out.beltMill = !!SP.millInfo;
    p.damage = damage;
    p.god = god;
    E.spawnTimer = timer;
    G.score = score;
    G.zones.enter(0);
    return out;
  });

  // A clock that jumps back mid-flight (the fake April-1 clock below sets performance.now() back to about 0): live
  // frames keep running across it, never step time backwards, and the plane stays finite. Two frames always run
  // after the jump, so this doesn't depend on whether the reload wins the race.
  const jump0 = await page.evaluate(() => {
    const G = window.G, dm = G.devmenu, update = dm.update.bind(dm);
    window.framesSeen = 0;
    dm.update = () => { window.framesSeen++; update(); }; // frame() calls it once a frame, paused or not
    return { paused: G.paused, time: G.time, perf: performance.now() };
  });
  // Found secrets survive a reload. The reload pretends it's April 1, so the boot-time date check runs too.
  await page.clock.setFixedTime(new Date('2026-04-01T10:00:00'));
  L.clockJump = await page.evaluate(async (j) => {
    const G = window.G, p = G.player;
    window.framesSeen = 0;
    for (let k = 0; k < 200 && window.framesSeen < 3; k++) await new Promise((r) => setTimeout(r, 20));
    return { ...j, frames: window.framesSeen, perfAfter: performance.now(), timeAfter: G.time, speed: p.speed, finite: [p.speed, p.pos.x, p.pos.y, p.pos.z, G.time].every(Number.isFinite) };
  }, jump0);
  await page.reload();
  await page.waitForFunction(() => window.G && window.G.secrets, null, { timeout: 30000 });
  S.reloaded = await page.evaluate(() => ({
    found: window.G.secrets.found.size, holiday: window.G.secrets.holiday, logo: document.getElementById('logo').textContent,
    rank: window.G.progress.rank, count: document.getElementById('secrets-count').textContent,
  }));
  L.furthestTitle = await page.evaluate(async () => ({ text: document.getElementById('furthest').textContent, name: (await import('./src/zones.js')).ZONES[1].name, shown: document.getElementById('furthest').checkVisibility() }));

  // Desktop (Electron) build: a fake window.landedDesktop bridge, injected before the game boots, shows Quit and
  // Fullscreen on the title and pause cards, and they call the bridge. A second, short-lived context.
  const desk = {};
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    await ctx.addInitScript(() => {
      window.desktopCalls = [];
      window.landedDesktop = { isDesktop: true, platform: 'linux', quit: () => window.desktopCalls.push('quit'), toggleFullscreen: () => window.desktopCalls.push('fs') };
    });
    const dp = await guard(await ctx.newPage());
    await dp.goto(origin + '/');
    await dp.waitForFunction(() => window.G && window.G.step, null, { timeout: 30000 });
    await dp.evaluate(() => { window.G.finds.off = true; }); // no surprise hidden finds while other systems are measured
    desk.titleShown = await dp.isVisible('#title-quit') && await dp.isVisible('#title-fullscreen');
    await dp.click('#title-fullscreen');
    await dp.click('#title-quit');
    desk.titleCalls = await dp.evaluate(() => window.desktopCalls.join());
    desk.blurred = await dp.evaluate(() => !document.activeElement?.matches('button'));
    await dp.click('#start');
    await dp.keyboard.press('KeyP');
    desk.pauseShown = await dp.isVisible('#pause-quit');
    await dp.click('#pause-quit');
    desk.pauseCalls = await dp.evaluate(() => window.desktopCalls.join());
    await ctx.close();
  }

  // Hangar and Lore shelf (hangar.js): a fresh context with 5 hidden coins and one note read. The title card's
  // buttons show both; Dart (3 coins) is bought and flown at once, Twin Hornet (12) is out of reach; Enter in a panel
  // doesn't take off and Escape closes it; the plane and wallet survive a reload; the Lore shelf shows the read note,
  // "???" for the rest and the last page sealed; then the Dart takes off and flies.
  const shop = {};
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    await ctx.addInitScript(() => {
      if (localStorage.getItem('landed.coins') === null) { localStorage.setItem('landed.coins', '5'); localStorage.setItem('landed.lore', '["dent"]'); }
    });
    const hp = await guard(await ctx.newPage());
    await hp.goto(origin + '/');
    await hp.waitForFunction(() => window.G && window.G.step && window.G.hangar, null, { timeout: 30000 });
    await hp.evaluate(() => { window.G.finds.off = true; }); // no surprise hidden finds while other systems are measured
    const btns = () => hp.evaluate(() => [...document.querySelectorAll('#title .menu-btn')].map((b) => b.textContent));
    shop.title = await btns();
    shop.overButtons = await hp.evaluate(() => document.querySelectorAll('#gameover .menu-btn').length);
    await hp.click('#title .menu-btn >> nth=0');
    const rows = () => hp.evaluate(() => Object.fromEntries([...document.querySelectorAll('#hangar .plane-row')].map((r) => [r.dataset.plane, { text: r.querySelector('button').textContent, off: r.querySelector('button').disabled }])));
    shop.before = { open: await hp.isVisible('#hangar'), rows: await rows() };
    await hp.click('#hangar .plane-row[data-plane="dart"] button');
    shop.after = await hp.evaluate(() => { const G = window.G, p = G.player; return { wallet: G.hangar.wallet, kind: p.model.kind, speed: p.baseSpeed, hull: p.maxHealth, regen: p.stats.boostRegen, sub: document.querySelector('#hangar .panel-sub').textContent }; });
    shop.after.rows = await rows();
    await hp.keyboard.press('Enter');
    shop.enterStarted = await hp.evaluate(() => window.G.started);
    await hp.keyboard.press('Escape');
    shop.closed = !(await hp.isVisible('#hangar'));
    shop.titleAfter = await btns();
    await hp.reload();
    await hp.waitForFunction(() => window.G && window.G.step && window.G.hangar, null, { timeout: 30000 });
    await hp.evaluate(() => { window.G.finds.off = true; });
    shop.reloaded = await hp.evaluate(() => { const G = window.G; return { selected: G.hangar.selected, kind: G.player.model.kind, wallet: G.hangar.wallet, owned: [...G.hangar.owned].sort().join(), speed: G.player.baseSpeed }; });
    await hp.click('#title .menu-btn >> nth=1');
    shop.lore = await hp.evaluate(() => {
      const r = [...document.querySelectorAll('#lore-book .lore-row')];
      return { open: !document.getElementById('lore-book').classList.contains('hidden'), n: r.length, sub: document.querySelector('#lore-book .panel-sub').textContent,
        dent: r.find((x) => x.dataset.note === 'dent')?.textContent, locked: r.filter((x) => x.classList.contains('locked')).length, last: r.at(-1).textContent };
    });
    await hp.click('#lore-book .panel-back');
    shop.loreClosed = !(await hp.isVisible('#lore-book'));
    await hp.click('#start');
    shop.flight = await hp.evaluate(() => { const G = window.G, p = G.player; for (let k = 0; k < 60; k++) G.step(1 / 30); return { started: G.started, kind: p.model.kind, inScene: !!p.model.group.parent, finite: Number.isFinite(p.pos.x + p.pos.y + p.pos.z), dead: p.dead }; });
    await ctx.close();
  }
  report.shop = shop;

  console.log(JSON.stringify(report, null, 2));

  const checks = [
    [(({ finds: f }) => f.first === 30 && f.cfg.every[0] === 45 && f.cfg.every[1] === 75 && f.offNone && f.spawned && f.nextIn >= 45 && f.nextIn <= 75 && f.glint.inScene && f.glint.fixedSize && f.glint.hidesBehind && f.expired)(report), `hidden finds: the first waits 30 s, then 45-75 s between finds, none while switched off; each twinkles at a fixed screen size that terrain hides, and goes after its life (${JSON.stringify(report.finds)})`],
    [(({ finds: { spots: s } }) => ['low', 'peak', 'sky'].every((k) => s[k].kinds.length === 1 && s[k].kinds[0] === k && s[k].minD > 150 && s[k].maxD < 1000)
      && s.low.minUp >= 4.9 && s.low.maxUp <= 6.1 && s.peak.minUp >= 4.9 && s.peak.maxUp <= 7.1 && s.sky.minSide >= 69 && (s.sky.minUp >= 199 || s.sky.maxY <= 1080) && s.sky.maxY <= 1080)(report), `hidden finds: spots 150-1000 m away; low ones 6 m over the ground, behind-a-peak ones 7 m over it, sky ones 200-300 m up (never over 1080 m) and 70 m+ off your line (${JSON.stringify(report.finds.spots)})`],
    [(({ finds: { chime: c, farPings: far } }) => c.length === 1 && c[0][0] > 0.5 && c[0][1] > 0.9 && c[0][1] < 1.5 && far === 0)(report), `hidden finds: within 220 m a chime pings on the find's side, none from 300 m (${JSON.stringify({ chime: report.finds.chime, far: report.finds.farPings })})`],
    [(({ finds: { warm: w } }) => !w.far.beam && w.far.pip === 'none' && w.far.notes === 0 && !w.mid.beam && w.mid.pip === 'none' && w.mid.notes === 0
      && !w.near.beam && w.near.tall === 0 && w.near.pip === 'block' && w.near.ring && w.near.glint > w.far.glint * 1.4 && w.near.notes.length === 1 && w.near.notes[0].startsWith('✨ Something glints nearby, just ahead')
      && w.side.edge && w.side.note.includes('off to your left') && w.cleared === 'none')(report), `hidden finds get warmer: no column of light at any range, nothing extra from 700 m or 380 m, and at 120 m a bigger twinkle, one "something glints nearby" line and a ring on it (a sparkle at the screen edge when it's off to the side) (${JSON.stringify(report.finds.warm)})`],
    [(({ finds: { coin: c } }) => c.gone && c.score === 120 && c.boost === 1 && Math.abs(c.hull - 30) < 0.01 && c.run === 1 && c.total === 1 && c.stored === '1')(report), `hidden coin: +120, boost refilled, +20 hull, counted and remembered (${JSON.stringify(report.finds.coin)})`],
    [(({ finds: { note: n, title: t, last: l, allRead: a, reset: r, n: N } }) => N === 12 && n.score === 150 && n.shown && !n.paused && n.count === '📜 Lore 1/12' && n.title && n.stored && n.notLast && n.folded && t.startsWith('📜 Lore 1/12 · 🪙 1 hidden coin found') && l.early === 0 && l.then && a === 'coin' && r.none && r.timer === 30 && r.runCoins === 0 && r.lore === 12)(report), `lore notes: +150 and a card "Lore 1/12" (no pause, a click folds it), remembered, counted on the title card; the last page only comes last, then notes turn into coins; a new run keeps what you read (${JSON.stringify({ note: report.finds.note, title: report.finds.title, last: report.finds.last, allRead: report.finds.allRead, reset: report.finds.reset })})`],
    [report.firstObjective === 'hoop', 'first objective is a hoop'],
    [report.musicPlaying && report.engineGain <= 0.015, 'calm music plays and the engine stays quiet'],
    [report.musicSection && report.musicSection.mood === 'day' && report.musicSection.texture, 'the music is in a section (music.section shows mood, progression, texture, root)'],
    [report.music.missing.length === 0 && report.music.moods >= 8 && report.music.bad.length === 0, 'every zone\'s mood exists; sections vary progression, texture and key (small steps, back home)'],
    [report.persuasionStages >= 10, 'persuasion escalated through its stages'],
    [report.persuasionPaced === 1, 'persuasion waits 15 s between tactics, however big the neglect'],
    [report.tactics.errors.length === 0 && report.tactics.applied + report.tactics.skipped.length === report.tactics.total && report.tactics.skipped.length <= 3 && report.tactics.total >= 35, 'every persuasion tactic applies and disposes without errors'],
    [report.tactics.leftovers.length === 0 && report.tactics.clean, 'persuasion reset() removes every tactic\'s meshes, HUD lines, camera peek and wind'],
    [report.tactics.pillar.onGround && report.tactics.pillar.faded && report.tactics.pillar.solidTop >= report.tactics.pillar.target + 100, `the persuasion light pillar stands on the ground and reaches an objective 1500 m above it, fading out at the top (${JSON.stringify(report.tactics.pillar)})`],
    [report.tactics.peeked && report.tactics.hudLine, 'the cinematic look turns the camera and hot & cold / offers show on the objective card'],
    [report.completedAfterTrophy === 1, 'participation trophy completed the objective'],
    [(({ firstHoop: f }) => f.length === 20 && f.every((h) => h.deg <= 20.1 && h.dist >= 299 && h.dist <= 451))(report.guide), `guidance: a run's first hoop is within 20° of straight ahead and 300-450 m away (${JSON.stringify(report.guide.firstHoop.map((h) => h.deg))})`],
    [report.guide.markerSeen >= 19, `guidance: the first hoop's marker is on screen at the start (${report.guide.markerSeen}/20, 1024×640)`],
    [F.portraitMarker >= 19, `guidance: the first hoop's marker is on screen at the start on a portrait phone too (${F.portraitMarker}/20, 390×844)`],
    [(({ arrow: [a0, a1, a2] }) => a0.shown && a0.faint && !a0.big && a0.label === '' && a1.shown && !a1.faint && !a1.big && a2.shown && !a2.faint && a2.big)(report.guide), 'guidance: an off-screen objective gets a faint unlabelled arrow before persuasion; its arrow steps make it normal, then big'],
    [(({ feeFree: a, feeFree2: b, feePaid: c }) => [a, b].every((r) => r.gain === 100 && r.lines[1] === 'Hints on the house' && !/fee/i.test(r.lines.join())) && c.gain === 76 && c.lines[1] === 'Hint fee -24')(report.guide), 'hint fee: none for the first 3 objectives ("Hints on the house"), charged from the 4th'],
    [(({ par: p }) => p.hoop === 12 && p.card === '⏱ Par 12 s · beat it for +60' && p.cardAfter === '' && p.at10.gain === 160 && p.at10.lines[1].includes('Speed bonus +60 (under par!)') && p.at14.gain === 100 && !/Speed bonus/.test(p.at14.lines.join()) && p.timed === 17)(report.guide), 'par: the hoop card shows "Par 12 s"; done in 10 s earns the speed bonus, in 14 s not; timed objectives get 60% of their clock'],
    [((g) => g && g.aimErr < 0.01 && g.burst === 3 && g.bump.includes(10) && !g.bump.includes(22) && g.bumpPlain.includes(22))(report.garyCut), `Gary Prime's cut aims 140 m ahead and 25 m up, fires 3, and a bump mid-cut costs 10 (22 otherwise) (${JSON.stringify(report.garyCut)})`],
    [(({ par: { survive: s } }) => s.par === Infinity && s.card === '' && !/Speed bonus/.test(s.done))(report.guide), `par: Hold The Line shows no par and never pays a speed bonus (${JSON.stringify(report.guide.par.survive)})`],
    [(({ four: f }) => f.lines.length === 4 && /^\+3 more world changes/.test(f.lines[3]) && f.lines[2] === 'The trees are blue now.' && f.showAt3s && !f.showAt36s)(report.guide) && report.bannerMaxLines >= 2 && report.bannerMaxLines <= 4, 'banner: at most 4 lines (4 world changes show one and "+3 more"), gone within 3.6 s'],
    [report.zoneBanner.length === 2 && /^New zone: /.test(report.zoneBanner[1]), `banner: a zone change shows the points and "New zone" only (${JSON.stringify(report.zoneBanner)})`],
    [report.guide.loopTasticHoops === 0 && report.guide.loopTasticLoops > 0 && report.guide.loopTasticLoops < 30, 'banner: "LOOP-TASTIC!" is only for the loop objective (200 hoops never), and not every time'],
    [(({ spare: s }) => s.from2.lives === 3 && s.from2.detail.includes('Spare plane +1 ❤️') && s.from5.lives === 5 && s.from5.detail.includes('Hangar full (5 planes)') && s.big.lives === 1e6 && s.forced.lives === 2 && s.from2.par === 25 && s.hearts4 === '❤️❤️❤️❤️')(report.guide), 'spare plane: beating a boss adds a life up to 5 (never removes any, not when forced); 4 lives show 4 hearts'],
    [((g) => g.count === 6 && g.balloons === 0 && g.facing.every((d) => d > 0.99) && g.afterRam === '🎯 0 / 6 hit' && g.afterShot === '🎯 1 / 6 hit' && g.hidden && g.quips === 1 && g.clanks === 1)(report.shootOrFly.gallery), `shooting gallery: 6 bullseye targets (no balloons) face the plane as it circles; a bullet counts with a clank, ramming doesn't and quips once (${JSON.stringify(report.shootOrFly.gallery)})`],
    [((b) => b.count === 5 && b.haloR === 9.5 && b.afterShot === '🎈 0 / 5 popped' && b.afterRam === '🎈 1 / 5 popped')(report.shootOrFly.popper), `balloon popper: 5 glowing balloons; bullets go through, flying into one pops it (${JSON.stringify(report.shootOrFly.popper)})`],
    [report.bossDefeated, 'boss can be defeated'],
    [report.firstBossGap >= 4 && report.firstBossGap <= 7 && report.nextBossGap >= 4 && report.nextBossGap <= 7, 'bosses come every 4 to 7 objectives'],
    [report.chunks > 20, 'terrain is loaded'],
    [report.bossDroppedPowerup, 'boss drops a power-up'],
    [report.objectiveTypes >= 38, 'all objective types are on the menu (38+)'],
    [report.objectiveRepeats === 0 && report.objectiveFallback === 'hoop', 'objectives never repeat a recent type or the last family back to back, and still pick when only one is left'],
    [report.quests.roll && report.quests.halfRollIgnored, 'barrel roll quest: real rolls count, an Immelmann\'s half roll does not'],
    [report.quests.rollAnyDt, 'barrel roll quest: each roll counts once at any frame rate (dt 0.0349, 1/60, 0.0371)'],
    [report.quests.delivery && report.quests.deliveryStages, 'pizza delivery: pick up, the pizza cools, deliver to the drop-off'],
    [report.quests.constellation && report.quests.constellationOrder, 'constellation: stars only count in order, and joining them all completes it'],
    [(({ near, boost, far, base, open, trial }) => open && near.on && near.speed < base * 0.75 && !boost.on && boost.speed > base && !far.on && far.speed > base * 0.9 && trial === false)(report.chainSlow), `chain slow-down: near a chain's next link the plane eases to about 0.65x cruise, boost overrides it, far away cruise comes back, the ring time trial keeps full speed (${JSON.stringify(report.chainSlow)})`],
    [report.quests.starClear, 'a falling star never starts inside the ground (born over a hill, it would fizzle uncatchably)'],
    [report.quests.meteors && report.quests.photo, 'falling stars can be caught, and the shy whale can be photographed'],
    [report.quests.treasure && report.quests.treasureDry, 'X marks the spot: on dry land, and shooting the X digs out the treasure'],
    [report.quests.searchlightCaught, 'searchlights: two lamps, and loitering by the hoop gets you spotted out of the mission'],
    [report.quests.searchlightDash, 'searchlights: waiting for a beam to pass, then boosting straight in, makes the hoop'],
    [report.noHerd, 'balloon herding is gone and X marks the spot took its place in the objective list'],
    [report.landing.landed && !report.landing.dead && report.landing.grade && report.landing.sink < 7 && report.landing.points > 0, 'landing: a gentle, level descent onto flat ground lands, graded, with a bonus'],
    [report.landing.done, 'landing objective: touch down on the runway and roll along it to complete it'],
    [(({ landing: l }) => l.glide && l.touchSpeed < l.base * 0.8 && !l.wrongWay.glide && l.wrongWay.speed > l.base * 0.95)(report), `landing: lined up on the runway's glide path the plane eases down to approach speed by itself; flying the wrong way along it keeps cruise speed (${JSON.stringify({ touch: report.landing.touchSpeed, base: report.landing.base, wrongWay: report.landing.wrongWay })})`],
    [report.takeoff.airborne && report.takeoff.lifted > 0 && report.takeoff.climb > 5, 'landing: pulling up on the ground takes off and climbs away'],
    [report.hop.landed && report.hop.points === 0, 'landing: hopping straight back down earns no bonus'],
    [report.diveCrash === 'ground' && report.waterCrash.reason === 'water' && !report.waterCrash.landed, 'landing: a steep dive onto flat ground still crashes, and so does settling onto water'],
    [report.ghostLanded === false, 'landing: Ghost Mode skims the ground instead of landing'],
    [report.pads.landed && /🌾 0\.0 \//.test(report.pads.dusting), 'landing: taxiing on the ground is not crop dusting'],
    [report.pads.groundKept && report.pads.whileRolling === 1 && report.pads.max === 1 && report.pads.after === 0, 'runways that end flatten no ground for good: only under a plane rolling on it, gone once it leaves'],
    [Object.keys(report.bosses).length >= 17, 'at least 17 bosses'],
    [(({ carrier: c }) => c.spawned && c.afloat && c.longBar && c.maxHp >= 300 && c.sternDist >= 80 && c.shots > 0 && c.hullHit && c.bumpedAbove >= 4 && c.gunCost === 0.04 && c.gunHidden && c.gunHits >= 3 && c.gunHits <= 8 && c.wreck && c.launched === 2 && c.climbed)(report), `HMS Overkill: spawns on open sea and stays afloat, a long health bar (300+ hp), its hull boxes take hits 80 m+ from its middle, a plane flown into the hull is lifted out over the deck, a deck gun shot off costs it 4% and takes only a few hits (3 to 8), leaving a wreck, and its catapults launch two climbing fighters (${JSON.stringify(report.carrier)})`],
    [(({ carrier: c }) => !c.diveLanded && c.deck?.landed && c.deck.secret && c.deck.patched && c.deck.bonus >= 300 && c.deck.onTop === 2.5 && c.deck.rode && c.deck.held && c.deck.tookOff)(report), `HMS Overkill's secret: a gentle approach lands on its deck (hull patched, +300 or more, the Welcome Aboard secret), the deck carries you along with its guns quiet, and pulling up takes off unhurt; a steep dive onto it doesn't land (${JSON.stringify(report.carrier?.deck)}, dive landed: ${report.carrier?.diveLanded})`],
    [(({ fort: f }) => f?.spawned && f.towerDist >= 30 && f.hullHit && f.cannonHits >= 3 && f.cannonHits <= 8 && f.cannonCost === 0.03 && f.wreck && f.stages === 2 && f.breached && f.mortarDown >= 2 && f.fortStill)(report), `Fort Grumpington: its hull boxes take hits on a tower 30 m+ from its middle, a tower cannon takes only a few hits (3 to 8), costs it 3% and leaves a wreck, its damage shows in two stages (a wall top falls), and ducking sinks only its mortar (${JSON.stringify(report.fort)})`],
    [Object.entries(report.bosses).every(([k, b]) => b.done && b.attacks > 0 && b.spawned === k), 'every boss attacks and can be defeated'],
    [(({ serpent: s }) => s.spawned && s.segs >= 12 && s.shieldUnder === 0 && s.hitUnder === 0 && s.rings === 2 && s.crossOff <= 40 && s.crossAhead > 0 && s.span >= 90 && s.up && s.up.warned >= 1.2 && s.up.fromRing <= 20 && s.mouthOff >= 0 && s.mouthOff <= 6 && s.spat === 3 && s.shieldUp === 1 && s.bodyHit && s.touches && s.frillHits >= 3 && s.frillHits <= 12 && s.spatNoFrills === 1)(report), `Magmadora: can't be hurt under the lava; two rings mark where she comes up 1.2 s+ before she breaks, and her head breaks the lava at the near one; her arc spans 90 m+ across your path, ahead of you; 3 fireballs come out of her mouth at the top; her body can be shot and hurts while it's up; a frill takes a few hits, and with both gone she spits one fireball (${JSON.stringify(report.serpent)})`],
    [(({ ray: r }) => {
      const h = r?.fans?.find((f) => f.plane === 'h'), v = r?.fans?.find((f) => f.plane === 'v');
      return h && v && [h, v].every((f) => f.shards === 7 && f.wound >= 1 && f.wound <= 2.5 && f.frost > 0) && h.spreadY < 0.3 && v.spreadY > 0.7 && h.roll < 0.3 && v.roll > 1.3 && r.hit && r.hit.hull > 0 && r.hit.boost <= 0.7 && r.crystalHits >= 1 && r.crystalHits <= 12 && r.noCrystals === 3;
    })(report), `Glacierra: a shard fan comes 1-2.5 s after she lines her wings up, 7 shards; wings level = a flat fan, wings on edge = an upright one; a shard hurts and frosts a third of the boost; with both wingtip crystals gone a fan is 3 shards (${JSON.stringify(report.ray)})`],
    [(({ beetle: b }) => b?.up && b.mirages === 2 && b.gap >= 10 && b.gap >= b.away * 0.4 && b.shadow.on && b.shadow.off < 1 && b.shadow.above >= 0 && b.shadow.above < 2 && b.real === 5 && b.fake >= 5 && b.fakeHurt === 0 && b.realHurt > 0 && b.before === 2 && b.after === 0 && b.hornHits >= 1 && b.hornHits <= 12 && b.noHorn === 3)(report), `Pharaoh Scarabus: two mirages shimmer in well apart from it; only it casts a shadow, flat on the ground under it; mirages copy its 5-orb volleys with fake orbs that don't hurt (real ones do); a hit on it pops the mirages; with its horn shot off a volley is 3 orbs (${JSON.stringify(report.beetle)})`],
    [(({ owl: o }) => o?.acorns === 5 && o.high?.tell >= 1 && o.high.hover < 12 && o.high.hit === 1 && o.high.push >= 20 && o.high.push <= 45.01 && o.high.flatY === 0 && o.high.slowed >= 4 && o.high.wind && o.high.once && o.high.after < 9 && o.low?.hit === 1 && o.low.push === 0 && o.tuftHits >= 1 && o.tuftHits <= 12 && o.tufts?.w === 42 && o.tufts.push === 22 && o.tufts.slow === 0)(report), `Lady Hootrude: 5-acorn volleys; she hovers through a 1 s+ rear-up, then a leaf gust shoves you flat along it (up to 45 m/s, half of any part straight back at you, fading within a second, some speed lost, the tailwind left alone), once a gust, and not at all low over the ground; with both ear tufts off a gust is 42 m wide, shoves 22 m/s and costs no speed (${JSON.stringify(report.owl)})`],
    [(({ owlFly: f }) => f && (f.tree ? f.perched && f.rooted && f.launch > 0 && f.launch <= 2.2 : !f.dry) && f.wing[1] - f.wing[0] > 0.3 && f.bank > 0.02 && f.backward <= 6 && (f.shadow === null || Math.abs(f.shadow - 0.6) < 0.05))(report), `Lady Hootrude: she starts on top of her giant oak (rooted in the ground; none over water or under a roof), takes off within about 2 s, then flaps, banks into her turns, flies head first (never more than ~80° off her heading for more than a moment) and casts a shadow on the ground (${JSON.stringify(report.owlFly)})`],
    [(({ toad: t }) => t?.volleys?.length >= 1 && t.volleys.every((n) => n === 4) && t.on?.tell >= 1.2 && t.on.swell > 1.3 && t.on.hit === 1 && t.on.hull > 0 && t.on.slowed >= 4 && t.off?.hit === 0 && t.off.hull === 0 && t.crestHits >= 1 && t.crestHits <= 12 && t.popped === 2)(report), `Count Ribbiton: 4-spore volleys; a 1.2 s+ tell with his throat swelling, then a tongue lash that hits a plane on its line (hull and some speed lost) and misses one 40 m off it; with both crests popped a volley is 2 spores (${JSON.stringify(report.toad)})`],
    [(({ toadHop: h }) => h && h.tree && h.perched && h.rooted && h.hops >= 1 && h.apex[0] >= 30 && h.apex[1] <= 112 && h.feet < 0.6 && h.wet === 0 && h.airAttacks === 0 && h.shadow !== null && Math.abs(h.shadow - 0.6) < 0.05)(report), `Count Ribbiton: he starts on top of his giant toadstool (rooted in the ground), then hops after you: arcs 30 m+ high, lands feet first on dry ground, never attacks in the air, and casts a shadow on the ground (${JSON.stringify(report.toadHop)})`],
    [(({ lands: l }) => l && l.toadElsewhere === 'gooseQueen' && l.toadHome === 'toadBaron')(report.serpent || {}), `Count Ribbiton only comes in the mushroom lands, and comes first there (${JSON.stringify(report.serpent?.lands)})`],
    [(({ lands: l }) => l && l.owlElsewhere === 'gooseQueen' && l.owlHome === 'harvestOwl')(report.serpent || {}), `Lady Hootrude only comes in the woods lands, and comes first there (${JSON.stringify(report.serpent?.lands)})`],
    [(({ lands: l }) => l && l.beetleElsewhere === 'gooseQueen' && l.beetleHome === 'sunBeetle')(report.serpent || {}), `Pharaoh Scarabus only comes in the desert lands, and comes first there (${JSON.stringify(report.serpent?.lands)})`],
    [(({ lands: l }) => l && l.rayElsewhere === 'gooseQueen' && l.rayHome === 'auroraRay')(report.serpent || {}), `Glacierra only comes in the cold lands, and comes first there (${JSON.stringify(report.serpent?.lands)})`],
    [(({ lands: l }) => l && l.elsewhere === 'gooseQueen' && l.waits && l.topUp !== 'lavaSerpent' && l.home === 'lavaSerpent')(report.serpent || {}), `Magmadora only comes in Volcano Land (another boss comes elsewhere, she waits in the deck, a deck of only her tops up), and comes first there (${JSON.stringify(report.serpent?.lands)})`],
    [Object.keys(report.leadBosses).length >= 3 && Object.values(report.leadBosses).every((b) => b.ahead >= 0.75 && b.attacks > 0), 'lead bosses stay in front of the player and attack'],
    // Boss signature moves: each one shows within ~20 s engaged (and none of these held for the old orbit-and-shoot).
    ...(() => {
      const SIG = {
        megaUfo: (s) => s.teleport >= 1, thunder: (s) => s.hazards >= 1, blimpBaron: (s) => s.run > 300,
        jellyEmpress: (s) => s.maxSpeed > 35 && s.blobs > 0, mineMother: (s) => s.ring >= 6 && s.angles >= 6,
        kingDrone: (s) => s.guards >= 1, hiveQueen: (s) => s.shell >= 6, pigeonDon: (s) => s.still >= 2,
        seagullSteven: (s) => s.diveVy < -40, gooseQueen: (s) => s.joust > 60, garyPrime: (s) => s.roll >= 1.45 && s.roll < 3,
        fortGrump: (s) => /udu/.test(s.shields), lavaSerpent: (s) => /dud/.test(s.shields) && s.hazards >= 2, carrier: (s) => s.hazards >= 1 && s.run >= 40, octopus: (s) => s.lead[1] - s.lead[0] >= 150, crab: (s) => s.lateral > 75, puffer: (s) => s.puffShrink >= 40,
        auroraRay: (s) => /h/.test(s.fans) && /v/.test(s.fans), sunBeetle: (s) => s.mirage >= 2, harvestOwl: (s) => s.gust >= 1, toadBaron: (s) => s.hops >= 2,
      };
      const kinds = report.moves?.kinds || {}, miss = Object.keys(SIG).filter((k) => !kinds[k] || !SIG[k](kinds[k]));
      const hz = report.moves?.hazards || [], fired = hz.filter((h) => h.fired >= 0);
      const zones = Object.entries(report.moveZones || {});
      return [
        [Object.keys(kinds).length >= 15 && miss.length === 0, `every boss shows its signature move: blink, lightning columns, bombing runs, pulses, mine ring, royal guard, bee shell, perch, dive, joust, wingman roll, duck, jets, lane snaps, puffed approach, lava breach (missing: ${miss.map((k) => `${k} ${JSON.stringify(kinds[k])}`).join('; ') || 'none'})`],
        [fired.length >= 10 && fired.every((h) => h.fired >= 1) && hz.every((h) => !h.onBreak) && report.moves.chaseTeleports === 0, `boss hazards give 1 s+ of warning, and none (nor a teleport) starts while a boss is on a break (${hz.length} hazards, quickest ${Math.min(...fired.map((h) => h.fired))} s, on a break ${hz.filter((h) => h.onBreak).length}, teleports on a break ${report.moves?.chaseTeleports})`],
        [zones.length === 8 && zones.every(([, z]) => z.outside === 0 && z.attacks > 0) && zones.filter(([k, z]) => k.endsWith('pigeonDon') && z.sat).length === 2, `boss moves in a cave and in space: bosses stay between floor and roof, keep attacking, and the Godfeather finds perches (${JSON.stringify(report.moveZones)})`],
      ];
    })(),
    [(({ kingDrone, octopus }) => [kingDrone, octopus].every((b) => b && b.gap > b.fight + 120 && b.waitIn >= 0 && b.waitIn <= 15 && Math.abs(b.waitDist - 150) <= 30 && b.stayed && b.minWait > 120 && b.reIn >= 0 && b.reIn <= 8))(report.breathing || {}), `bosses let you fly off, come back only to a standoff (fight + 150 ± 30 m) within 15 s, stay past fight + 120 m while you keep fleeing, and re-engage within 8 s of you turning in (${JSON.stringify((report.breathing || {}))})`],
    [(({ kingDrone, octopus }) => [kingDrone, octopus].every((b) => b && b.gap >= b.fight + 250 && b.quiet && b.again >= 2.5 && b.again <= 7))(report.breathing || {}), 'boss breakaway: the gap opens 250 m+ past fight distance, no attacks until it re-engages, then its first attack is 2.5 to 7 s later'],
    [(({ kingDrone, octopus }) => [kingDrone, octopus].every((b) => b && b.homeOff <= 30 && b.braking <= 12 && b.hovering <= 8))(report.breathing || {}), 'boss breakaway: a loose boss hovers within 30 m of where it lost you, at 8 m/s (12 while braking, the first 1.5 s)'],
    [(({ kingDrone, octopus }) => [kingDrone, octopus].every((b) => b && b.wait === 1 && b.barWait && !b.barReturn))(report.breathing || {}), 'boss breakaway: one "waiting for you" toast at the standoff; the boss bar says "(your move)" while it waits and nothing on the way back'],
    [(({ farSpawn: f }) => f && !f.onBreak && f.waitToasts === 0 && f.attackIn >= 0 && f.attackIn <= 10)(report.breathing || {}), `a boss that spawns past the leash flies straight in and attacks within 10 s, never "coming back" or waiting at a standoff (${JSON.stringify(report.breathing?.farSpawn)})`],
    [(({ gary: g }) => g && g.t >= 0 && g.t <= 6)(report.breathing || {}), `a boss faster than you (enraged Turbo Gary Prime) is still shaken off flying straight without boost within 6 s (${JSON.stringify(report.breathing?.gary)})`],
    [(({ uturn: u }) => u && ['garyPrime', 'seagullSteven'].every((k) => u[k] && u[k].t >= 0 && u[k].t <= 4))(report.breathing || {}), `a boosted U-turn from deep inside the orbit (Gary Prime, Steven) breaks away within 4 s of the turn (${JSON.stringify(report.breathing?.uturn)})`],
    [(({ snipe: n }) => n && n.loose && n.left >= 0 && n.left <= 0.1 && n.attack >= 1 && n.attack <= 2)(report.breathing || {}), `shooting a boss that has lost you wakes it at once (out of 'loose' within 0.1 s) and it fights back about 1.2 s later (${JSON.stringify(report.breathing?.snipe)})`],
    [(({ kingDrone, octopus }) => [kingDrone, octopus].every((b) => b && b.breatherWait === false))(report.breathing || {}), 'boss breakaway: no faster mending while the boss waits at its standoff (only while it has lost you or is coming back)'],
    [(({ rematch: r }) => r && r.atTurn >= 120 && r.speed <= 33 && r.reIn >= 0 && r.firstAtk >= 4)(report.breathing || {}), `turn-back rematch after 14 s of fleeing: the boss is fight + 120 m+ away, comes in at 33 m/s or less (30 m/s faster than you fly away, plus slack) until it re-engages, and attacks no sooner than 4 s after the turn (${JSON.stringify(report.breathing?.rematch)})`],
    [(({ standoff: s }) => s && s.arrived && s.attackIn >= 0 && s.attackIn <= 7.5)(report.breathing || {}), `circling a waiting boss (not fleeing) gets it attacking within ~7 s of reaching its standoff (${JSON.stringify(report.breathing?.standoff)})`],
    [(({ standoff: s }) => s && s.pulledWaiting === 0 && s.engaged && Math.abs(s.pulledTo) < 1)(report.breathing || {}), 'persuasion "approach" leaves a waiting boss where it is and pulls an engaged one no closer than its standoff'],
    [(({ kingDrone, octopus }) => [kingDrone, octopus].every((b) => b && b.hull >= 54))(report.breathing || {}), 'boss breakaway: the hull mends from 50 to 54+ hp within 12 s of breaking away (normal mending would not have started)'],
    [(({ repeat: r }) => r && r.first.max === 8 && r.second.max < r.first.max && r.second.t > 0 && r.second.t < r.second.max / 0.85 + 0.2 && r.afterHit.max === 8)(report.breathing || {}), 'boss breakaway: each one in a row without hurting the boss is shorter; hurting it resets that'],
    [(({ kingDrone, octopus, twins }) => [kingDrone, octopus].every((b) => b && b.shook === 1 && b.back === 1 && b.lostYou && !b.barBack && b.nags === 0) && twins?.both && twins.shook === 1)(report.breathing || {}), 'boss breakaway: one "shook off" toast (one for twins), one "coming back" toast, boss bar shows "(lost you)" while away, no wrong-way nag'],
    [Object.keys(report.fleeLead || {}).length >= 3 && Object.values(report.fleeLead).every((b) => b.turn < 10 && b.lost < 25), `fleeing a lead boss (180° boost turn, then straight) costs under 25 hp in 15 s (${JSON.stringify(report.fleeLead || {})})`],
    [Object.keys(report.fleeLead || {}).length >= 3 && Object.values(report.fleeLead).every((b) => b.clear >= 0 && b.clear <= 4 && b.closest >= 120), `fleeing a lead boss: once it's fight + 120 m behind (within 4 s of the turn) it never comes closer while you keep going (${JSON.stringify(report.fleeLead || {})})`],
    [[report.breathing?.kingDrone, report.breathing?.octopus].every((b) => b?.hint4s === false), 'boss hints no longer promise repairs after "4 seconds"'],
    [report.twins.count === 2 && report.twins.halfDone && report.twins.done && report.twins.name.startsWith('Turbo'), 'boss twins with a modifier both have to go down'],
    [!report.relax.objective && report.relax.enemies === 0 && report.relax.pickups === 0 && report.relax.bodyClass && report.relax.panelHidden, 'Relax mode clears objectives, enemies and pickups'],
    [report.relax.backObjective === 'boss', 'leaving relax mode brings back the interrupted boss'],
    [report.longestPowerup >= 45, 'power-ups last longer'],
    [report.powerupDurShort?.length === 0, `every timed power-up lasts at least 1.5x its old duration (short: ${JSON.stringify(report.powerupDurShort)})`],
    [(({ hitStop: h }) => h.want >= 0.04 && h.want <= 0.06 && h.drone === h.want && h.bee === 0 && h.crash === 0 && h.reduced === 0)(report), `A kill you make freezes the frame for a beat, except small fry, crashes and with reduced motion (${JSON.stringify(report.hitStop)})`],
    [(({ sizePU: { mega: m, tiny: t, whiff, rate, megaBoss } }) => m.scale > 2 && m.popped && m.pts >= m.want && m.boss >= megaBoss * 0.5 && m.dazed && m.cd && m.bump === 0 && m.armored > 0 && Math.abs(m.armored * 2 - m.plain) < 0.01 && t.scale === 0.5 && t.whiffed && t.pts === whiff && t.hurt === 0 && t.low === rate && t.high === 0)(report), `Mega Ram pops regulars for 1.5x points, rams and dazes bosses, halves hits; Tiny Ace whiffs shots for points and pays daredevil points low down only (${JSON.stringify(report.sizePU)})`],
    [(({ sizePU: { shock: k, shockDmg, shockEvery } }) => k.popped && k.pts > 0 && k.farAlive && k.blimpHit === shockDmg && k.shotGone && k.cd === shockEvery && k.waits && k.holds && k.boss > 0)(report), `Shockwave pops and chips enemies in range, wipes their shots, spares the far ones, recharges, holds its charge with nothing near and chips bosses (${JSON.stringify(report.sizePU?.shock)})`],
    [(({ turbo: t }) => t && !t.idle && t.held && t.tank >= 0.01 && t.turboMul > t.plainMul)(report), `Turbo only boosts while held, faster than plain boost and free (${JSON.stringify(report.turbo)})`],
    [report.weakPointDamage === report.weakPointExpected, 'weak points multiply damage'],
    [report.gondolaStopsBombs && report.cannonDisarmed, 'breaking a part disables that attack'],
    [report.droneFalling && report.droneCrashed, 'a drone that loses its rotors falls and crashes'],
    [report.pickupSpawned && report.pickupCollected, 'power-up spawns ahead and can be collected'],
    [report.powerupsActiveMidway >= 10 && report.powerupsActiveAfterAMinute === 0, 'every power-up runs, then wears off'],
    [firstPowerupTimer > 0 && firstPowerupTimer <= 25, `the first power-up comes within 25 s of take-off (timer at boot: ${firstPowerupTimer})`],
    [report.bulletCrater > 1 && report.orbCrater > 1, 'bullets and orbs that hit the ground leave craters'],
    [report.pit.depth >= 30 && report.pit.mesh >= 25 && report.pit.cellMax <= 100, 'a 20-bullet burst digs a 30 m+ pit that shows on the mesh within 0.2 s, and crater lists stay short'],
    [report.zoneAdvanced, 'completing objectives advances to the next zone'],
    [(({ zoneShift: z }) => z.pending && z.at1.far < 0.6 && z.at1.rebuilt && (z.gap0 < 0.05 || z.gap2 > z.gap0 * 0.25) && z.far15 > 0.9 && z.gap15 < 0.02 && !z.stale15)(report), `a new zone eases in: fog bank before the land swaps, slow sky blend, clear again after 15 s (${JSON.stringify(report.zoneShift)})`],
    [report.zones.length >= 30, 'every zone loads (30+)'],
    // ---- Cloud Kingdom (see the zones loop)
    [(({ cloudKingdom: k }) => k && k.near >= 3 && k.aboveGround && k.islands > 0 && k.onTop >= k.islands)(report), 'Cloud Kingdom: cloud islands float near the player, each with a centrepiece standing on its top'],
    [(({ cloudKingdom: k }) => k && k.kinds >= 8 && k.seen.cloudPuff > 0 && k.seen.skyLantern > 0)(report), 'Cloud Kingdom: the new props (castles, temples, gates, harps, lanterns, cloud puffs...) spawn'],
    [(({ city: c }) => c && c.meshes > 10 && c.tallest >= 100 && c.buildings > 200 && c.roof - c.street >= 40 && c.sheer && c.deterministic)(report), 'Metropolis: a street grid of buildings (towers 100 m+), roofs are ground with sheer walls, same seed same city'],
    [(({ city: c }) => c && c.wallCrash === 'ground' && c.ghostOnRoof)(report), 'Metropolis: flying into a tower wall crashes (Ghost Mode skims onto the roof)'],
    [(({ city: c }) => c && c.avenue.lowflyDone && !c.avenue.dead && c.avenue.maxAlt < 30 && c.lowflyStarted && c.buried.length === 0)(report), 'Metropolis: crop-dusting down an avenue works, and air objectives stay out of the buildings'],
    [(({ city: c }) => c && Object.keys(c.props).length >= 10 && ['car', 'streetLamp', 'trafficLight'].every((t) => c.props[t] > 0) && ['waterTower', 'antenna', 'helipad'].some((t) => c.props[t] > 0) && c.misplaced.length === 0)(report), 'Metropolis: city props are instanced, traffic on the streets, rooftop props on the roofs'],
    [['picnicTable', 'tractor', 'camperVan', 'skiLift'].every((t) => report.countrySeen[t] > 0), 'new countryside, desert and snow props turn up in their zones'],
    [(() => { const c = report.zones.find((z) => z.name === 'Crystal Caverns'); return c && c.gap >= 55 && c.planeUnderRoof && report.caveObjective.underRoof; })(), 'the cave has a roof, and the plane and objectives stay under it'],
    ...(({ caveLoop: c }) => [
      [['loop', 'inverted'].every((k) => c[k] && c[k].dist >= 200 && c[k].dist <= 650 && c[k].chamber >= 120 && c[k].above >= 25 && c[k].above <= 45 && !c[k].virtual), `cave loops: a loop or upside-down objective targets a dome 200-650 m ahead, with >= 120 m from floor to roof over the loop and the start 25-45 m up (${JSON.stringify({ loop: c.loop && { ...c.loop, hints: undefined }, inverted: c.inverted && { ...c.inverted, hints: undefined, fly: undefined } })})`],
      [c.signFade?.at === 0 && c.signFade.far === 1, `cave loops: the LOOP HERE sign is fully shown from 200 m out and gone once you're at the dome (${JSON.stringify(c.signFade)})`],
      [c.loopW?.done && !c.loopW.crashed && c.loopW.tucked && c.loopBoost?.done && !c.loopBoost.crashed, `cave loops: from the dome, holding W loops under the roof (tucked), and so does a boosted loop (${JSON.stringify([c.loopW, c.loopBoost])})`],
      [c.inverted?.fly?.at(-1)?.done && c.inverted.fly.length <= 2, `cave loops: from the dome, pulling up and letting go flies 4 s inverted without touching the roof (${JSON.stringify(c.inverted?.fly)})`],
      [c.loop?.hints.includes('In here, NO boost. Speed makes the loop bigger and the roof is not negotiable.') && c.loop.hints.includes('Fly to the glowing crystal dome, stay low, then hold W.') && !c.loop.hints.some((h) => /Shift/.test(h))
        && c.inverted?.hints.includes('Under the tall dome, pull up until you\'re upside down, then LET GO.') && !c.inverted.hints.some((h) => /climb/i.test(h)), 'cave loops: the hints say no boost and point at the dome, and never suggest boosting (loop) or climbing (inverted)'],
      [c.easier?.length === 4 && c.easier.slice(1).every((e, i) => e.tuck === [1.75, 2, 2.2][i] && e.req === 1 && e.done && !e.crashed && e.climb <= c.easier[i].climb - 2 && /roomier/.test(e.text)) && c.tuckAfter === 1.5, `cave loops: each easier() tightens the tuck (+0.25, to 2.2 at most) and makes the loop at least 2 m shorter; the requirement stays 360°, and dispose resets the tuck (${JSON.stringify(c.easier?.map((e) => [e.tuck, e.climb]))})`],
      [c.roofWarns?.length === 2 && c.roofWarns[0] < 0.2 && c.roofWarns[1] >= 3, `cave loops: a loop past 60° with the roof close warns "Roof! Pull harder!", at most every 3 s (${JSON.stringify(c.roofWarns)})`],
      [c.hotColdNaN === 'ok', `hot & cold: a target it can't face (NaN) doesn't throw (${c.hotColdNaN})`],
      [c.zone0?.done && !c.zone0.crashed && !c.zone0.tucked && Math.abs(c.zone0.climb - 71) <= 5 && Math.abs(c.zone0.secs - 5.8) <= 0.3 && c.zone0.loopTarget === null, `loops outside caves are unchanged: no tuck, ~71 m up, ~5.8 s, no dome (${JSON.stringify(c.zone0 && { climb: c.zone0.climb, secs: c.zone0.secs })})`],
      [c.zone0?.loopHints.includes('Speed helps! Boost (Shift) then hold W.') && c.zone0.invHints.includes('Climb a bit first so you have room.') && c.zone0.invVirtual && c.zone0.easier.req === 0.85 && c.zone0.easier.tuck === 1.5, 'loops outside caves: the old hints stay, and easier() still lowers the loop requirement'],
    ])(report),
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
    [F.dive.dead && F.dive.lead >= 1.0, `pull up: diving at flat ground warns at least 1 s before the crash (${F.dive.lead} s)`],
    [F.dive.chipEl === null && F.dive.text === false, `pull up: no PULL UP! chip, and no visible "PULL UP" text while warning (${F.dive.text})`],
    [F.dive.glowFirst > 0 && F.dive.glowNear > F.dive.glowFirst, `pull up: the glow is stronger near impact than at the first warning (${F.dive.glowFirst} -> ${F.dive.glowNear})`],
    [!F.level.shown && !F.level.dead, 'pull up: level flight 100 m up for 10 s never warns'],
    [report.landing.pullUps === 0, 'pull up: a landing approach never warns'],
    [F.rise.dead && F.rise.reason?.startsWith('ground') && F.rise.lead >= 1.0, `pull up: level flight 15 m up into a 0.6 rise warns at least 1 s before the crash (${JSON.stringify(F.rise)})`],
    [F.approachWall.approach && F.approachWall.dead && F.approachWall.reason?.startsWith('ground') && F.approachWall.lead >= 1.0, `pull up: on approach, a steep rise behind a landable strip warns at least 1 s before the crash (${JSON.stringify(F.approachWall)})`],
    [F.seaGlide.dead &&F.seaGlide.reason?.startsWith('water') && F.seaGlide.lead >= 1.0, `pull up: a gentle glide onto the sea warns at least 1 s before the splash (${JSON.stringify(F.seaGlide)})`],
    [!F.seaLevel.shown && !F.seaLevel.dead, `pull up: level flight 6 m over the sea for 8 s never warns (${JSON.stringify(F.seaLevel)})`],
    [(({ shave1: a }) => a.shown && !a.dead && a.off && a.min >= 3 && a.min < 7 && a.points === 25 && a.notes.length === 1 && / \+25$/.test(a.notes[0]))(F), `pull up: pulling out 3-7 m above the ground pays a close shave, +25 (${JSON.stringify(F.shave1)})`],
    [(({ shave2: b }) => b.shown && !b.dead && b.points === 0 && b.notes.length === 0)(F), 'pull up: a second close shave inside 15 s pays nothing'],
    [(({ shaveRelax: r }) => r.shown && r.points === 0 && /Bragging rights only/.test(r.notes[0]))(F), 'pull up: Relax Mode still warns, and a close shave is bragging rights only'],
    [!F.godShown && !F.ghostShown, 'pull up: never in god mode or Ghost Mode'],
    [F.bulletHit.tick >= 1 && F.bulletHit.hit === 0 && F.bulletHit.hp < 100 && F.partHit.tick >= 1 && F.partHit.hit === 0 && F.shake.hit === 1, 'feel: your bullets hitting a body or a part go tick, being hit goes hit'],
    [F.partHit.broken && F.partHit.pops.includes('+10'), 'feel: breaking off a part pops +10'],
    [F.kill.dead && F.kill.pops.includes(`+${F.kill.score}`) && F.kill.after === 0, 'feel: a kill pops its points, gone within 1.2 s'],
    [F.popMax === 6 && F.popGone === 0, 'feel: at most 6 score pop-ups at once'],
    [F.mineNear.armed && F.mineNear.dead && F.mineNear.blinks >= 3 && F.mineNear.secs <= F.mineConst.fuse / 0.85 + 0.2 && F.mineNear.lost > F.mineConst.dmgMin && F.mineNear.lost <= F.mineConst.dmgMax * 1.5 + 0.1
      && !F.mineFar.armed && F.mineFar.lost === 0 && F.mineLeft.armed && F.mineLeft.dead && F.mineLeft.lost === 0,
      `enemies: a Spiky Balloon close by blinks, then pops and costs hull; a far one never arms; leaving the blast before it pops is safe (${JSON.stringify({ near: F.mineNear, far: F.mineFar, left: F.mineLeft })})`],
    [F.shake.off > 0 && F.reduced.on && F.reduced.off === 0, 'feel: damage shakes the camera; not with reduced motion'],
    [F.peekLook < 0.9 && F.reduced.look > 0.999, 'comfort: the cinematic look turns the camera, but not with reduced motion'],
    [F.reduced.anim.every((a) => a === 'none'), 'comfort: reduced motion stops the marker spin, and the pull-up glow never throbs'],
    [F.dive.flashPeak > 0 && F.dive.flashPeak <= 0.5, `feel: the crash flash peaks at 0.5 at most (${F.dive.flashPeak})`],
    [F.reduced.flash > 0 && F.reduced.flash <= 0.25, `comfort: under reduced motion the crash flash peaks at 0.25 at most (${F.reduced.flash})`],
    [F.boost.whooshes === 1, 'feel: pressing boost goes whoosh once while held'],
    [Math.abs(F.boost.drain - 4) <= 0.2 && Math.abs(F.boost.regen - 5) <= 0.2, `boost: a full tank lasts 4 s and refills in 5 s (${F.boost.drain} s, ${F.boost.regen} s)`],
    [Math.abs(F.level.fov - 70) <= 1 && Math.abs(F.portraitFov - 95) <= 1, `camera: 70° cruising on a landscape screen, 95° on a portrait phone (${F.level.fov}, ${F.portraitFov})`],
    [(({ settingsDefault: d, settings: s }) => !d.invert && !d.muted && d.stored === null && s.before.invert && s.before.muted && s.invert && s.music === false && s.muted && s.master === 0 && /Remembered/.test(s.note))(F) && F.settingsCleared, 'settings: I, N and M survive a reload, with a "Remembered" note at take-off'],
    [F.junk.length === 3 && F.junk.every((j) => !j.invert && !j.muted && j.furthest === null && j.text === '' && !j.shown) && !F.junkErrors.length && F.junkCleared, `storage: junk settings and furthest-zone data boot with the defaults, no errors, no "Furthest" line (${JSON.stringify(F.junk)} ${F.junkErrors})`],
    [livesAtStart.lives === 3 && livesAtStart.hearts === '❤️❤️❤️' && !livesAtStart.over, 'lives: a run starts with 3 lives, shown as hearts'],
    [(({ levelUp: u }) => u.levels === 1 && u.health === u.want && u.health < u.max && u.note)(L.run), `lives: levelling up (the dev menu button, same path) patches 50 hull, not a full repair, and says so (${JSON.stringify(L.run.levelUp)})`],
    [(({ regen: r }) => r.at11s === 50 && r.at14s > 50 && r.at14s <= 50 + 0.6 * r.rate * 2.2)(L.run), 'hull: no repairs for 12 s after a hit, then slowly (0.6 × stats.regen hp/s)'],
    [(({ crash1: c, respawn1: r }) => c.lives === 2 && c.dead && c.hearts === '❤️❤️🖤' && !r.dead && r.full && r.lives === 2)(L.run), 'lives: a crash costs a life, and you respawn with a full hull'],
    [L.run.relax.lives === 2 && !L.run.relax.dead, 'lives: a crash in Relax Mode costs no life'],
    [(({ last: l, over: o }) => l.lives === 0 && l.hearts === '🖤🖤🖤' && !l.overAtOnce && o.gameOver && o.paused && o.shown && o.cardScore === String(o.score) && o.cardText.includes(`Level ${o.level}`) && /New best/.test(o.cardText) && o.saved === o.score)(L.run), 'lives: the third crash shows the Game Over card (after the explosion) with score, level and a saved best'],
    [L.frozen, 'lives: the game is paused behind the Game Over card'],
    [L.keyLocked, 'lives: Space / Enter in the first second of the Game Over card do not skip it'],
    [L.noContinueAtZone0, 'continue: a Game Over in zone 1, lap 1 shows no Continue button'],
    [(({ continueCard: c, zone4: z }) => z.zone === 4 && c.over && c.shown && c.label === `CONTINUE FROM ${z.name.toUpperCase()}` && !/Continued from/.test(c.lines))(L), 'continue: a Game Over in zone 5 shows "CONTINUE FROM <zone>"'],
    [[L.again, L.againByKey].every((a) => a.lives === 3 && a.hearts === '❤️❤️❤️' && a.score === 0 && a.level === 1 && a.perks === 0 && a.maxHealth === 100 && a.health === 100 && a.regen === 1 && !a.over && !a.paused && !a.dead && a.hidden && a.completed === 0 && a.zone === 0) && L.overByKey, 'lives: Fly again (click, or Enter) starts a fresh run: 3 lives, score 0, level 1, base hull'],
    [[L.continued, L.continuedByKey].every((a) => a.lives === 3 && a.hearts === '❤️❤️❤️' && a.score === 0 && a.level === 1 && a.perks === 0 && a.maxHealth === 100 && !a.over && !a.paused && !a.dead && a.hidden && a.completed === 0 && a.zone === 4), 'continue: clicking (or C) starts a fresh run in the same zone: 3 lives, score 0, level 1, no perks'],
    [L.continuedCard.over && L.continuedCard.lines.includes(`Continued from ${L.zone4.name}`) && L.continueKeyLocked, 'continue: a continued run\'s Game Over card says so, and C in its first second does not skip it'],
    [(({ furthest: f, furthestTitle: t }) => f.zone === 9 && JSON.parse(f.saved).index === 1 && f.afterJump === f.saved && t.shown && t.text.includes(t.name) && /\(zone 2 of \d+\)/.test(t.text))(L), 'furthest zone: flying on into zone 2 is saved and shown on the title card after a reload; a dev-menu jump does not count'],
    [(({ clockJump: c }) => !c.paused && c.frames >= 3 && c.perfAfter < c.perf && c.timeAfter >= c.time && c.finite)(L), `clock: a backwards clock jump mid-flight never runs game time backwards; speed and position stay finite (${JSON.stringify(L.clockJump)})`],
    [(({ up: s }) => s.name === 'Immelmann' && s.back < -0.9 && s.upright > 0.9 && s.climb > 15)(report.stunts), 'double-tap up: Immelmann turns you back and up'],
    [(({ down: s }) => s.name === 'Split-S' && s.back < -0.9 && s.upright > 0.9 && s.climb < -15)(report.stunts), 'double-tap down: Split-S turns you back and down'],
    [(({ right: s }) => s.name === 'Barrel roll' && s.back > 0.95 && s.upright > 0.9 && s.side > 18 && s.dodgedMidway === true)(report.stunts), 'double-tap right: barrel roll slides right, dodging hits'],
    [(({ touchLeft: s, touchUp: u }) => s.name === 'Barrel roll' && s.side < -18 && u.name === 'Immelmann')(report.stunts), 'two touch flicks trigger stunts'],
    [report.flicks.quick90 === 1 && report.flicks.steer75 === 0 && report.flicks.push70 === 0 && report.flicks.slow90 === 0, `touch flicks: two quick 90 px pushes are a stunt; steering to 75 px and back, two 70 px pushes, or two slow 90 px pushes are not (${JSON.stringify(report.flicks)})`],
    [Object.values(report.phone).every((p) => p.rows.touch && !p.rows.keys) && desktopTitleRows.keys && !desktopTitleRows.touch, 'title card: a touch phone shows the touch rows (not the keyboard rows); a desktop the keyboard rows'],
    [Object.values(report.phone).every((p) => p.sized && p.enraged && p.notes >= 2 && p.pu >= 1 && p.banner && p.overlaps.length === 0), `phone HUD (390×844, 360×640): score, objective, boss bar, hull bars and touch buttons don't overlap; nor does the success card (${JSON.stringify(Object.values(report.phone).map((p) => p.overlaps))})`],
    [!report.stunts.lowSplitS.name && !report.stunts.slowTaps.name, 'no Split-S near the ground, and slow taps are not a double tap'],
    [!report.stunts.heldThenTap.name && !report.stunts.otherKeyBetween.name, 'a held key then a tap, or W D W, is not a double tap'],
    [!report.devmenu.shortHold.open && !report.devmenu.shortHold.paused, 'dev menu: a 1 s hold of 1 + 0 does nothing'],
    [!report.devmenu.earlyOpen && report.devmenu.opened.open && report.devmenu.opened.paused && !report.devmenu.opened.space, 'dev menu: holding 1 + 0 for 3 s (not 2) opens it, pauses, and swallows gameplay keys'],
    [!report.devmenu.zone.open && !report.devmenu.zone.paused && report.devmenu.zone.zone === 3, 'dev menu: a zone button enters that zone'],
    [report.devmenu.boss.boss === 'gooseQueen' && report.devmenu.objective.type === 'stars', 'dev menu: boss and objective buttons start them'],
    [report.devmenu.carrier.boss === 'carrier' && report.devmenu.carrier.afloat, `dev menu: HMS Overkill from a desert zone still comes, on open sea, never King Drone instead (${JSON.stringify(report.devmenu.carrier)})`],
    [!report.devmenu.escaped.open && !report.devmenu.escaped.paused, 'dev menu: Esc closes it and play resumes'],
    [!S.sixClicks && S.title.found && S.title.rolled && /Secret found: Title Tinkerer \(1\/11\)/.test(S.title.toast) && /Secrets: 1\/11/.test(S.title.count), 'secrets: 7 clicks on the title (not 6) find one, with a toast and the title card counter'],
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
    [S.feats.list === 11 && S.feats.all && S.feats.stored === 11, 'secrets: all 11 found and saved in localStorage'],
    [S.reloaded.found === 11 && S.reloaded.holiday === 'aprilFools' && S.reloaded.logo === 'Crashed' && /Secrets: 11\/11/.test(S.reloaded.count), 'secrets: found secrets survive a reload, and the boot date check runs (April 1)'],
    [!report.devmenu.oneCorner && report.devmenu.touchOpened.open && report.devmenu.touchOpened.paused && report.devmenu.touchReleased, 'dev menu: touching both top corners for 3 s opens it (one corner does not)'],
    // ---- Hold The Line ("The Rush") and the newer regular enemies (see the RUSH block)
    [(({ htl: h }) => [1, 2, 3, 4, 5].every((w) => h.waves.includes(w)) && h.progress.length === 5 && h.progress.every((t) => /^🛡 WAVE \d\/5 · \d+s · \d+ left$/.test(t)) && h.reward === 350)(RUSH), `Hold The Line: "WAVE n/5 · <secs>s · <k> left" in the progress text, and the waves reach 5 (${JSON.stringify({ waves: RUSH.htl.waves, progress: RUSH.htl.progress })})`],
    [(({ opening: o, countSpawns: c }) => o.calls.slice(0, 5).join() === 'PREPARE FOR WAVE 1,3,2,1,GO!' && o.shown && c === 0 && o.at >= 3 && o.at <= 4)(RUSH.htl), `Hold The Line: it opens with PREPARE FOR WAVE 1, 3, 2, 1, GO! (big, centred), and nothing spawns during any countdown (${JSON.stringify({ ...RUSH.htl.opening, countSpawns: RUSH.htl.countSpawns })})`],
    [RUSH.htl.countdowns.every(Boolean), `Hold The Line: waves 2-5 each open with PREPARE FOR WAVE n (and a flavour line), 3, 2, 1, GO! (${JSON.stringify(RUSH.htl.countdowns)})`],
    [(({ perWave: w, mix: m }) => [1, 2, 3, 4, 5].every((n) => w[n] && w[n].spent <= w[n].roster + 1 + 1e-6) && [5, 7, 9, 11, 10].every((r, i) => w[i + 1].roster === r) && w[5].types.includes('rival') && m[0].every((t) => ['drone', 'mine', 'gull'].includes(t)) && m[1].some((t) => !m[0].includes(t)) && m[2].some((t) => !m[1].includes(t)) && m[3].length >= m[2].length)(RUSH.htl), `Hold The Line: each wave sends more than the last (5/7/9/11/10 + Gary) and stops when its roster is spent (its last group never takes it more than 1 past it), with new types in waves 2 and 3 (${JSON.stringify({ perWave: RUSH.htl.perWave, mix: RUSH.htl.mix })})`],
    [RUSH.htl.maxRegulars <= RUSH.htl.ceiling && RUSH.htl.maxRegulars >= 6, `Hold The Line: never more than ${RUSH.htl.ceiling} regular enemies at once (peak ${RUSH.htl.maxRegulars})`],
    [RUSH.htl.done && RUSH.htl.total <= 116 && RUSH.htl.total >= 100, `Hold The Line: never shooting, it's over in about 115 s (${RUSH.htl.total} s)`],
    [(({ restart: r }) => r.dead && r.wave === r.before.wave && r.before.clock > 3 && r.clock === 0 && r.phase === 'count' && r.regulars === 0 && r.line && r.calls.startsWith('3,2,1,GO!') && !/PREPARE/.test(r.calls))(RUSH.htl), `Hold The Line: getting shot down restarts the current wave from its countdown, straight to 3, 2, 1 ("Wave 2 again, from the top."), clock back to 0 (${JSON.stringify(RUSH.htl.restart)})`],
    [(({ second: s }) => s.easier === 1 && s.need < s.need0 - 1 && s.toast)(RUSH.htl), `Hold The Line: the second death makes it easier by itself, with a shorter wave clock (${JSON.stringify(RUSH.htl.second)})`],
    [(({ away: a }) => a.clock === a.clock0 && /· PAUSED · BACK TO THE LINE$/.test(a.hud) && a.target < 1 && a.turn === 1 && a.back > 0.5 && a.dim < 0.5 && a.lit >= 0.85)(RUSH.htl), `Hold The Line: past LINE_R from the beacon the wave clock waits, a TURN BACK callout shows once, the HUD says PAUSED · BACK TO THE LINE, the beacon lights up and the arrow points home (${JSON.stringify(RUSH.htl.away)})`],
    [(({ planted: w, replant: r }) => [1, 2, 3, 4, 5].every((n) => w[n] <= 10) && r.phase === 'count' && r.moved >= 350 && r.under <= 10 && r.standing && r.ghost <= 0.15 && r.climb > 300 && r.passes >= 100)(RUSH.htl), `Hold The Line: every countdown plants the beacon under the plane, standing on the ground, faded so it doesn't fill the screen, and tall enough to pass the plane flying high above it (${JSON.stringify({ planted: RUSH.htl.planted, replant: RUSH.htl.replant })})`],
    [(({ straight: s }) => s.outAt !== null && s.outAt < 12 && s.turnsBeforeMove === 2 && s.turnGap > 8 && s.turnGap < 8.2 && s.wave === 1 && s.phase === 'result')(RUSH.htl), `Hold The Line: flying dead straight, wave 1's clock waits past LINE_R with a TURN BACK callout, shown again 8 s later while still away, and the wave still finishes without turning back (${JSON.stringify(RUSH.htl.straight)})`],
    [(({ straight: { moved: m } }) => m && m.after >= 11.9 && m.after <= 12.1 && m.sub === 'Fine. The line comes to you.' && m.under <= 10 && !/PAUSED/.test(m.hud) && m.clock1 > 0.9)(RUSH.htl), `Hold The Line: after 12 s outside the line in a wave, the beacon moves under the plane, THE LINE MOVED shows, and the wave clock runs again (${JSON.stringify(RUSH.htl.straight.moved)})`],
    [(({ queue: q }) => q.capped === 'q3,q4,q5,q6' && q.first === 'qF,q4,q5,q6' && q.shown === 'drone here' && q.left === 'after' && q.alive)(RUSH.htl), `Hold The Line: at most 4 intros wait (the oldest goes), and one whose enemy is gone by its turn is skipped (${JSON.stringify(RUSH.htl.queue)})`],
    [(({ intros: i }) => i.n >= 3 && i.gap >= 3.9)(RUSH.htl), `Hold The Line: new-enemy intros come one at a time, at least 4 s apart (${JSON.stringify(RUSH.htl.intros)})`],
    [(({ clear: c }) => c && c.clock < c.need && c.score === 40 * c.wave && c.hull >= 25 && c.hull < 25.5 && c.call === `WAVE ${c.wave} CLEARED! +${40 * c.wave}`)(RUSH.htl), `Hold The Line: shooting down everything a wave sends clears it early, for +40 × the wave and +25 hull (${JSON.stringify(RUSH.htl.clear)})`],
    [(({ gary: g }) => g.found && g.hp === 42 && g.intro && !g.prop.falling && g.prop.slow === 0.7 && Math.abs(g.prop.lost - 4.2) < 0.01 && g.prop.wave && g.prop.toast && /Rival Pilot Gary \(Big Day\)/.test(g.bar) && g.done && g.held && g.paid === 3 * g.score && g.others === 0 && !g.barAfter && g.after1s === 0)(RUSH.htl), `Hold The Line: wave 5 brings elite Gary (42 hp, his own intro) with a boss bar; shooting off his propeller only slows him and costs 10% hp; downing him (×3 points) ends it at once, THE LINE HELD!, the rest pop for nothing (${JSON.stringify(RUSH.htl.gary)})`],
    [(({ htl: h }) => h.done && h.held && h.dentist && h.addedAtEnd === 0 && h.after1s === 0 && h.frenzyAfter === null && h.beaconGone)(RUSH), `Hold The Line: when it holds, every regular enemy is gone within 1 s, with no points for them, and the beacon goes (${JSON.stringify({ ...RUSH.htl, waves: undefined, desc: undefined, perWave: undefined, progress: undefined })})`],
    [(({ calm: c }) => c.shown && !c.pop && c.popNormally)(RUSH.htl), `Hold The Line: with reduced motion the callout fades in, no pop (${JSON.stringify(RUSH.htl.calm)})`],
    [(({ relax: r }) => r.busy.regulars > 0 && r.busy.bar && r.cleared === 0 && !r.call && !r.bar && !r.beacon)(RUSH), `Hold The Line: Relax Mode mid-wave clears the enemies, the callout, the boss bar and the beacon (${JSON.stringify(RUSH.relax)})`],
    [RUSH.relax.regulars === 0 && !RUSH.relax.objective, 'Hold The Line: nothing spawns in Relax Mode'],
    [Object.values(RUSH.types).every((r) => r.spawned >= 1 && r.intro === 1 && r.extra), `new enemies: each one spawns and shows its intro once (${JSON.stringify(RUSH.types)})`],
    [Object.values(RUSH.types).every((r) => r.t !== null && r.t <= 15 && r.kills >= 1), `new enemies: a scripted aim pilot shoots each one down within 15 s (${JSON.stringify(Object.fromEntries(Object.entries(RUSH.types).map(([k, r]) => [k, r.t])))})`],
    [['umbrella', 'grudgeRock', 'sniperOwl', 'kites', 'moth'].every((t) => RUSH.picks.all.includes(t)) && !RUSH.picks.all.includes('pebble') && RUSH.picks.third === 0, `new enemies: they join the spawn mix (pebbles never on their own), at most 2 Sniper Owls (${JSON.stringify(RUSH.picks)})`],
    [(({ front: f, back: b }) => f.lost === 0 && b.dmg > 0 && b.lost === b.dmg)(RUSH.umbrella), `Umbrella Goon: no damage from the front, full damage from behind (${JSON.stringify(RUSH.umbrella)})`],
    [RUSH.dog.dead && RUSH.dog.bits === 3 && RUSH.dog.beforeBit > 0 && RUSH.dog.bitDead && RUSH.dog.newBits === 0, `Grudge Rock: breaks into 3 pebbles, which don't split again (${JSON.stringify(RUSH.dog)})`],
    [RUSH.thunder && RUSH.thunder.rings === 2 * RUSH.thunder.spines && RUSH.thunder.spines >= 3 && !RUSH.thunder.thick && !RUSH.thunder.other && !RUSH.thunder.dark && RUSH.thunder.castZaps === 0 && RUSH.thunder.landZaps === 1 && RUSH.thunder.lost === 27 && RUSH.thunder.shade >= 0.6, `Thunderclaus volley: two yellow rings and a thin spine per strike (no dark column), the bolt costs 27 (18 × 1.5) on its axis, the zap sounds on landing, and the cloud body is light slate (${JSON.stringify(RUSH.thunder)})`],
    [(({ owl: o }) => o.lock >= 1.499 && o.lock <= 1.6 && o.broken && o.newShots === 0 && o.lost === 0)(RUSH), `Sniper Owl: a red line for 1.5 s before it fires; a barrel roll during the line breaks it: no shot, no damage (${JSON.stringify(RUSH.owl)})`],
    [(({ kites: k }) => k.pair && k.gap >= 60 && k.lost === 33 && k.toast && k.inScene && k.snapped)(RUSH), `Kite Twins: flying through the string hurts (22 × 1.5 = 33), and shooting a kite snaps the string (${JSON.stringify(RUSH.kites)})`],
    [(({ straight: s, rolled: r }) => s.ahead[0] >= 80 && s.ahead[1] <= 200 && s.red && s.lost === 33 && s.lead >= 0.9 && r.snapAt !== null && r.rolled && r.lost === 0)(RUSH.kiteHunt), `Kite Twins hunt: they keep pace 80 to 200 m ahead, wind up (red string) and snap it at you for 33; a barrel roll dodges it (${JSON.stringify(RUSH.kiteHunt)})`],
    [(({ moth: m }) => m.latched && m.boost <= 0.75 && m.lost > 0 && m.off && m.paid.kills === 1 && m.paid.score === 70 && m.paid.dead && m.dropped)(RUSH), `Clingy Moth: latches on and drains boost; a stunt shakes it off for its points (once); getting shot down drops it (${JSON.stringify(RUSH.moth)})`],
    // ---- Grumbleglobe, the Planet With Opinions (see the GLOBE block)
    ...(({ zone: z, arrival: a }) => [
      [z.name === 'Grumbleglobe' && z.after === 'Gas Giant' && z.before === 'The Moon' && z.mood === 'ember' && z.asteroids === 0 && GLOBE.card === 'Grumbleglobe' && GLOBE.notInDeck && GLOBE.devButton && z.blurb === 'A tiny planet with a big frown, three clingy moons and one very angry eye.', `Grumbleglobe: its own zone between Gas Giant and The Moon, never in the regular boss deck, a dev-menu button (${JSON.stringify(z)})`],
      [a.t <= 6 && a.dist >= 650 && a.dist <= 800 && a.deg <= 15 && a.grown === 1 && a.eye === 'stare' && a.facing > 0.9 && a.bar === '👑 Grumbleglobe, the Planet With Opinions (moons: 3)' && a.progress === '🌙 3 moons left · pores 4' && a.level === 1 && a.nextGap >= 4 && a.nextGap <= 7 && a.surfaceSide, `Grumbleglobe: the zone's first objective; within 6 s the planet is ~760 m off your nose, face first (every gadget on the face side), with its boss bar (and it takes the boss slot) (${JSON.stringify(a)})`],
      [a.moons.length === 3 && a.moons.every((d) => d >= 280 && d <= 300) && a.tilts.every((x) => x >= 20) && a.tethers && a.rings && a.markers, `Grumbleglobe: 3 moons orbit 280-300 m from its centre on different tilts, each with a faint orbit ring, a cyan tether to the shield and a red marker (${JSON.stringify({ moons: a.moons, tilts: a.tilts, tethers: a.tethers, rings: a.rings, markers: a.markers })})`],
    ])(GLOBE),
    [GLOBE.rock.drop === 0 && GLOBE.rock.sparks.length > 0 && GLOBE.rock.sparks.every((c) => c === '#9aa0a6') && GLOBE.rock.tip && GLOBE.gadget.drop === 1.33 && GLOBE.gadget.partDrop === 1 && GLOBE.gadget.sparks.includes('#ffd23a') && GLOBE.gadget.moonDrop === 1.13 && GLOBE.gadget.moonSparks.includes('#ffd23a'), `Grumbleglobe: bare rock never moves the bar (grey, with a tip); a pore or moon hit drains it at once (gold) (${JSON.stringify({ rock: GLOBE.rock, gadget: GLOBE.gadget })})`],
    [GLOBE.through.stopped && GLOBE.through.drop === 0 && GLOBE.through.partDrop === 0 && GLOBE.through.orbGone, `Grumbleglobe: bullets and orbs stop at the planet, nothing passes through (${JSON.stringify(GLOBE.through)})`],
    [(({ shield: s }) => s.note3 === 'moons: 3' && s.shot.drop === 0 && s.shot.eyeDrop === 0 && s.bubble && s.plugged && s.notes[0] === 'moons: 2' && s.notes[1] === 'moons: 1' && s.notes[2] !== 'moons: 0' && s.phases[0] === 1 && s.phases[1] === 1 && s.phases[2] === 2 && s.down.broken && s.down.toast && s.down.phase2 && s.down.lines && !s.down.bubble && s.down.progress === '👁 Eye shut: dodge! · pores 1' && s.down.note === 'eye shut' && s.down.phase === 2 && s.down.hp > 33 && s.down.shocked && s.down.score80 >= 3 && s.down.tethersGone)(GLOBE), `Grumbleglobe: while a moon stands the eye takes no damage (cyan bubble); the bar note counts the moons down, each with its line, +80 and a shocked face; the last one (pores plugged first or not) drops the shield, its tethers fade and phase 2 starts at once (${JSON.stringify(GLOBE.shield)})`],
    [(({ eye: y }) => { const tw = y.cycle.findIndex((c) => c[0] === 'twitch'); return tw >= 0 && y.cycle[tw + 1]?.[0] === 'open' && y.cycle[tw + 1][1] >= 0.9 && y.cycle[tw + 2]?.[0] === 'shut' && Math.abs(y.cycle[tw + 2][1] * 0.85 - 5) < 0.1 && y.shutShot?.drop === 0 && y.openShot?.drop === 2.78 && y.openShot.eyeDrop === 1 && y.firstHit; })(GLOBE), `Grumbleglobe: the lid opens for 5 s on a cycle after a 1 s twitch; shut it bounces, open the bar drains (${JSON.stringify(GLOBE.eye)})`],
    [(({ openLook: o }) => o && o.progress === '👁 EYE OPEN: shoot it! · pores 1' && o.note === 'eye open!' && o.stalk)(GLOBE), `Grumbleglobe: once the eye opens the card says "EYE OPEN: shoot it!" and the eye bulges out on its stalk (${JSON.stringify(GLOBE.openLook)})`],
    [(({ potshots: t }) => t.orbs > 0 && t.perS <= 1 && t.maxD < 380 && t.minGlow >= 0.55 && t.blocked === 0)(GLOBE), `Grumbleglobe moons: a 0.6 s glow before every potshot, only at you within 380 m with the planet out of the way; over a 30 s orbit at 300 m (phase 1) at most 1 damaging orb/s all told (${JSON.stringify(GLOBE.potshots)})`],
    [(({ spit1: a, spit2: b, phase3: c }) => a.fans.length >= 1 && a.fans.every((f) => f.wind >= 1 && f.orbs === 5 && f.speed === 100 && f.puff >= 1.35) && a.starts.every((s) => s.cos > 0.35) && b.fans.length >= 2 && b.fans.every((f) => f.wind >= 1 && f.orbs === 5) && b.starts.length >= 2 && b.starts.every((s) => s.state !== 'twitch' && s.state !== 'open' && s.cos > 0.35) && b.drones === 0 && b.phase === 2 && c.fans.length >= 1 && c.fans.every((f) => f.wind >= 1 && f.orbs === 7))(GLOBE), `Grumbleglobe spit fans: cheeks puff for 1 s+ first, then 5 orbs (7 in phase 3), only with you in front of the face; in phase 2 (no drones) a fan never starts while the eye twitches or is open (${JSON.stringify({ spit1: GLOBE.spit1, spit2: GLOBE.spit2, p3: GLOBE.phase3.fans })})`],
    [(({ pores: q }) => q.farBurps === 0 && q.burped === 24 && q.spawned === 24 - q.burped0 && q.maxAlive === 6 && q.markerGlow && !q.markerQuiet && q.near <= 10 && q.minGlow >= 1 && q.outward > 0.85 && q.firstTip && q.spent)(GLOBE), `Grumbleglobe pores: a 1 s+ glow, then Grumblings pop out at the pore mouth along its normal; its red marker only while it glows; at most 6 alive, 24 a fight (then a line), none while you're over 500 m out (${JSON.stringify(GLOBE.pores)})`],
    [(({ pores: { steer: q, sulk: u, clump: c } }) => q.lead > 0.8 && q.gap > 8 && q.speed === 52 && u.old && u.stray && u.fresh && u.score === 0 && c.lost >= 8 && c.lost <= 16 && c.booms === 0 && c.left === 0)(GLOBE), `Grumblings: after the scatter they cut in ahead of your nose at 52, each to its own spot; one about over 10 s or 220 m off the surface sulks off (no points); a clump of 6 reaching you at once puffs (no explosions) and bites 8-16 hull, not 48 (${JSON.stringify({ steer: GLOBE.pores.steer, sulk: GLOBE.pores.sulk, clump: GLOBE.pores.clump })})`],
    [(({ pores: { pop: q } }) => q.dead && q.score === 5 && q.squeak && q.booms === 0 && q.shared && q.disposed === 0)(GLOBE), `Grumblings: one hit pops one for 5 points with a squeak (no explosion); they share their geometry and materials, and removing one disposes none of it (${JSON.stringify(GLOBE.pores.pop)})`],
    [(({ bounce: b }) => b.boing && b.line && b.hull.length === 1 && b.hull[0] === 12 && b.lost >= 11 && b.lost <= 12.5 && !b.dead && b.lives === b.lives0 && b.d >= 164 && b.away >= 0.5 && b.glow && !b.god.boing && b.god.hull.length === 0 && !b.ghost.boing && b.ghost.hull.length === 0 && b.mega.boing && b.mega.lives === b.lives0 && b.low.boing && !b.low.dead && b.low.health >= 1 && b.low.health <= 2 && b.moon.boing && b.moon.d >= 4 && b.moon.lives === b.lives0 && b.runway.glow && b.runway.boing)(GLOBE), `Grumbleglobe: flying into it (or a moon) bounces you back out: BOING!, a line, 12 hull, no life, outside it and heading away within 0.5 s; the pull-up glow comes first, even on a landing approach over landable ground; God and Ghost Mode skim it unhurt; Mega Plane bounces too; a bounce never takes your last hull point (${JSON.stringify(GLOBE.bounce)})`],
    [(({ respawnCrash: c, respawn: r }) => c.dead && c.lives === 4 && r.dist >= 445 && r.dist <= 455 && Math.abs(r.dy) <= 2 && r.deg <= 5 && r.invuln > 2 && r.broken)(GLOBE), `Grumbleglobe: running out of hull near it costs a life as usual; the respawn is 450 m out facing it, destroyed gadgets still gone (${JSON.stringify({ crash: GLOBE.respawnCrash, respawn: GLOBE.respawn })})`],
    [(({ track: q }) => q.p1 >= 0.11 && q.p1 <= 0.121 && q.p2 >= 0.19 && q.p2 <= 0.201 && q.p3 >= 0.29 && q.p3 <= 0.301 && q.open === 0)(GLOBE), `Grumbleglobe: its face turns toward you at up to 0.12 / 0.2 / 0.3 rad/s by phase, and holds still while the eye is open (${JSON.stringify(GLOBE.track)})`],
    [(({ phase3: q }) => q.phase === 3 && q.enraged && q.cracks && /ENRAGED/.test(q.bar) && q.toast && q.brows < 0 && q.begs && q.eyeOpen >= 5.8 && q.glare && q.glare.t >= 1.2 && q.glare.fired >= 1.2 && q.glare.hit === 1 && q.glare.sight && q.glare.sight[0] >= 2 && q.glare.sight[0] < 2.5 && q.glare.sight[1] > 3.5 && q.glare.sight[1] <= 4 && q.glare.beamOp.length === 1 && q.glare.beamOp[0] === 0.7 && q.glare.beamOver >= 25 && q.glare.beamOver <= 35 && q.glare.beamDrawn && (q.glare.beamDrawn.endToAim <= 1 || Math.abs(q.glare.beamDrawn.camGap - 50) <= 0.5) && Math.abs(q.glare.beamDrawn.hitPast - 30 - q.glare.beamDrawn.shortOfAim) <= 0.2 && q.glare.beamDrawn.tip === 40 && q.glare.beamDrawn.point === 0 && q.rocks >= 1 && q.rocks <= 2)(GLOBE), `Grumbleglobe phase 3 (33%): ENRAGED, cracks, worried brows, begging taunts, the eye open 6 s, a 1.2 s+ glare warning (a thin sight, 2 m thickening to 4 m) before its 20-damage beam (steady 0.7, drawn up to where it aimed or 50 m short of the camera, narrowing over its last 40 m, hitting ~30 m past you), up to 2 Grudge Rocks (${JSON.stringify(GLOBE.phase3)})`],
    [(({ phase3: { dodge: q } }) => q && q.score === 25 && q.pop && q.hitPays === 0 && q.roll.score === 25 && q.roll.lost === 0)(GLOBE), `Grumbleglobe glare: a beam that misses you pays +25 "Dodge!", and so does a barrel roll straight through it; one that hits pays nothing (${JSON.stringify(GLOBE.phase3.dodge)})`],
    [(({ phase3: { held: q } }) => q && q.held >= 5.9 && q.held <= 6.2 && q.err > 0.7 && q.opened && q.inView && q.inView.held >= 5.9 && q.inView.held <= 6.2 && q.inView.opened && q.inView.sees && q.inView.glares === 0)(GLOBE), `Grumbleglobe: an eye the face can't bring round to you (you keep 126° off it) still twitches and opens after 6 s held shut; a forced opening with the face off you fires no glare (${JSON.stringify(GLOBE.phase3.held)})`],
    [(({ phase3: { glareBack: q } }) => q && q.behind === true && q.ahead === false)(GLOBE), `Grumbleglobe glare: from behind the camera it toasts "glaring at your back"; from in front, no toast (${JSON.stringify(GLOBE.phase3.glareBack)})`],
    [(({ phase3: { reach: q } }) => q && q.in9 === 1 && q.out11 === 0 && q.past25 === 1 && q.past45 === 0 && q.camDrawn === 70 && q.camEnd === 70 && q.sight && q.sight.end === 70 && q.sight.body === 35 && q.sight.same && q.sight.gone)(GLOBE), `Grumbleglobe glare: hit radius 6 + 4 m, the hit segment 30 m past the aim point, the drawn beam and the sight stopping 50 m short of the camera, their last 40 m (half, for these 70 m) a narrowing tip (${JSON.stringify(GLOBE.phase3.reach)})`],
    [GLOBE.hazards === 0 && GLOBE.freeze.w >= 0.119 && GLOBE.freeze.w <= 0.121 && GLOBE.freeze.slow === 0.35 && GLOBE.freeze.frozen && GLOBE.homing.moon && GLOBE.homing.pore && GLOBE.homing.eye, `Grumbleglobe: every warning lasts 1 s+; the moons orbit at 0.12 rad/s, 0.35× under Slow-Mo, and Time Freeze stops them and the face; Homing Bullets pick a moon while the shield stands, then a pore (eye shut) or the open eye (${JSON.stringify({ hazards: GLOBE.hazards, freeze: GLOBE.freeze, homing: GLOBE.homing })})`],
    [(({ relax: r }) => r.stays && r.dozing && r.before > 0 && r.afterPop === 0 && r.grumblings === 0 && r.spawned === 0 && r.still && r.shots === 0 && r.fans === 0 && r.bar && r.back)(GLOBE), `Grumbleglobe: in Relax Mode it dozes (moons still, no orbs, its Grumblings pop, none come); back from it the same planet resumes (${JSON.stringify(GLOBE.relax)})`],
    [(({ end: d }) => d.eyeBroke && d.dying && d.xEye && d.grumbs0 > 0 && d.grumbsAfter === 0 && d.frozen && d.monotonic && d.minK <= 0.4 && d.lowAt != null && d.lowAt <= 2.3 && d.dead && d.allGone && d.rubble === 8 && d.sizes && d.rubbleAt.length === 8 && d.rubbleAt.every((r) => r <= 160 * 0.4 * 0.5 + 1) && d.rubbleShot && d.completed === 1 && d.banner === 'BOSS DEFEATED!' && d.lives === 3 && d.reward === d.expected && d.gained >= d.reward && !d.inList && d.bar && d.toast)(GLOBE), `Grumbleglobe: the eye breaks, its face goes "x", its Grumblings pop; it freezes 0.5 s, then deflates (scale falling to 0.4 within 2.3 s), its last gadgets popping, and bursts into 8 shootable rubble chunks; BOSS DEFEATED, 1.5× reward, a spare plane (${JSON.stringify(GLOBE.end)})`],
    [GLOBE.next.type && GLOBE.next.type !== 'boss' && !GLOBE.next.siege && GLOBE.next.zone === 'Grumbleglobe', `Grumbleglobe: the zone's next objective comes as usual among the rubble (${JSON.stringify(GLOBE.next)})`],
    [(({ par: q }) => q.obj === 100 && q.card === '⏱ Par 100 s · beat it for +60' && q.flatten === false && /Pop its 3 moons/.test(q.desc) && q.hints === 5)(GLOBE), `Grumbleglobe: its own par, 100 s, on the card; no "flatten" persuasion in space (${JSON.stringify(GLOBE.par)})`],
    [(({ par: { hp: h } }) => h.moon === 10 && h.pore === 3 && h.eye === 18)(GLOBE), `Grumbleglobe: gadget hp moon 10, pore 3, eye 18 (${JSON.stringify(GLOBE.par.hp)})`],
    [(({ eyeKill: k }) => k && k.hpBefore > 20 && k.broke && k.dying && k.dead && k.allGone)(GLOBE), `Grumbleglobe: breaking the eye ends the fight, whatever is left of the bar (${JSON.stringify(GLOBE.eyeKill)})`],
    [(({ fresh: f }) => f && f.other && f.intact && f.moonHp === 14 && f.eyeHp === 25.2 && f.hp === 100 && f.w >= 0.149 && f.w <= 0.151 && f.burst && f.easier.cap[0] === 8 && f.easier.cap[1] === 6 && f.easier.eyeHp === 17.64 && f.shieldPores.pores === 0 && f.shieldPores.moons === 0 && f.shieldPores.shieldDown && f.shieldPores.phase === 2)(GLOBE), `Grumbleglobe: a fresh run continued from its zone gets a fresh planet; lap 2 gadgets have 1.4× hp, its moons orbit 1.25× faster with two-shot bursts, 8 Grumblings at once (6 after "easier"); with every pore plugged first the last moon still drops the shield into phase 2 (${JSON.stringify(GLOBE.fresh)})`],
    [(({ disposed: q }) => q && q.before > 0 && q.after === 0 && !q.inList)(GLOBE), `Grumbleglobe: calling the fight off takes its Grumblings with it (${JSON.stringify(GLOBE.disposed)})`],
    [(({ landEnemies: q }) => q.meadow.length === 0 && q.volcano.includes('emberBat') && q.volcano.includes('magmaSpitter') && !q.volcano.includes('cometCharger') && q.belt.length === 1 && q.belt[0] === 'cometCharger' && q.moon.includes('cometCharger'))(report), `land enemies: Ember Bats and Magma Spitters only in Volcano Land, Comet Chargers only in space lands (${JSON.stringify(report.landEnemies && { meadow: report.landEnemies.meadow, volcano: report.landEnemies.volcano, belt: report.landEnemies.belt, moon: report.landEnemies.moon })})`],
    [(({ landEnemies: { spitter: s, consts: k } }) => s.shieldUnder === 0 && s.shieldUp === 1 && s.states.join() === 'under,rise,up,sink,under' && s.fired >= k.shots && s.firedIn === 'up')(report), `land enemies: a Magma Spitter is out of reach under the lava, rises, spits a fan of fireballs and sinks again (${JSON.stringify(report.landEnemies?.spitter)})`],
    [(({ landEnemies: { bats: b } }) => b.states.includes('flare') && b.states.includes('swoop') && b.popped >= 1 && b.hits.length >= 1 && b.hits.every((n) => n === 12))(report), `land enemies: an Ember Bat flares, swoops into you for 12 hull and pops (${JSON.stringify(report.landEnemies?.bats)})`],
    [(({ landEnemies: { squirrels: q } }) => q.behind.flares.length === 0 && q.behind.bumps === 0 && q.dive.state === 'peel' && q.dive.harmless && q.dive.backIn != null && q.dive.backIn <= 5 && q.dive.nose > 0.3 && q.dive.hits === 0 && q.roll.state === 'peel' && q.roll.told && q.front.states.includes('flare') && q.front.hits.length >= 1 && q.front.hits.every((n) => n === 12))(report), `land enemies: a Flying Squirrel behind you never dives or bumps you, peels off harmlessly when it ends up on your tail or you roll, comes back round in front, and still hits from the front (${JSON.stringify(report.landEnemies?.squirrels)})`],
    [(({ landEnemies: { perLand: q, stray } }) => Object.keys(q).length === 29 && Object.values(q).every((t) => t.length >= 1) && stray.length === 0 && q['Frozen Peaks'].length >= 2 && q['Alien World'].length >= 2)(report), `land enemies: every land (but Grumbleglobe, which has its Grumblings) spawns at least one enemy of its own, none outside its lands (${JSON.stringify(report.landEnemies && { perLand: report.landEnemies.perLand, stray: report.landEnemies.stray })})`],
    [(({ landEnemies: { moves: m } }) => Object.keys(m).length === 10 && Object.values(m).every((v) => (v.act === 'swoop' && v.states.includes('flare')) || (v.act === 'ambush' && v.states.includes('rise') && v.states.includes('up') && v.shieldUp === 1) || (v.act === 'charge' && v.states.includes('wind') && v.states.includes('dash'))))(report), `land enemies: each new land enemy goes through its move in its own land (${JSON.stringify(report.landEnemies?.moves)})`],
    [(({ setPieces: q }) => q.meadow === 0 && q.count >= 3 && q.dry && q.belt === 0)(report), `set pieces: Volcano Land keeps 3+ fire geysers on dry rock, other lands none (${JSON.stringify(report.setPieces && { meadow: report.setPieces.meadow, count: report.setPieces.count, dry: report.setPieces.dry, belt: report.setPieces.belt })})`],
    [(({ setPieces: q }) => q.moonMeteors >= 1 && q.volcanoMeteorsAll === 0 && q.beltMeteors === 0 && q.shot?.gone && q.shot.score >= 20 && q.landedFar?.gone && q.landedFar.hits === 0 && q.landedNear?.gone && q.landedNear.hits.length === 1 && q.landedNear.hits[0] === 8)(report), `set pieces: meteors fall on the Moon (not elsewhere); one shot down is +20, one landing far off doesn't touch you, one landing beside you knocks once (${JSON.stringify(report.setPieces && { moon: report.setPieces.moonMeteors, volcano: report.setPieces.volcanoMeteorsAll, belt: report.setPieces.beltMeteors, shot: report.setPieces.shot, far: report.setPieces.landedFar, near: report.setPieces.landedNear })})`],
    [(({ setPieces: q }) => q.mill && !q.shroomMill && !q.beltMill && q.millGrounded && q.sails?.threaded && q.sails.score >= 25 && q.sails.score < 50 && q.sails.hits === 0 && q.sail?.hits === 1 && q.sail.off)(report), `set pieces: the Autumn Woods has its great windmill (no other land does), sunk into the ground; slipping between its turning sails is +25 once with no bump, a sail is solid: one knock and you're shoved clear (${JSON.stringify(report.setPieces && { mill: report.setPieces.mill, shroom: report.setPieces.shroomMill, belt: report.setPieces.beltMill, grounded: report.setPieces.millGrounded, sails: report.setPieces.sails, sail: report.setPieces.sail })})`],
    [(({ setPieces: q }) => q.shrooms >= 1 && q.tropicShrooms === 0 && q.beltShrooms === 0 && q.boing?.lifted && q.boing.score >= 15 && q.boing.score < 30 && q.boing.again === q.boing.score && q.boing.rise > 10 && q.boing.nose > 0.1 && q.boing.hits === 0)(report), `set pieces: the Mushroom Forest has giant bounce mushrooms (no other land does); touching a cap boings you up with the nose lifted, +15 once per mushroom, and never hurts (${JSON.stringify(report.setPieces && { shrooms: report.setPieces.shrooms, tropic: report.setPieces.tropicShrooms, belt: report.setPieces.beltShrooms, boing: report.setPieces.boing })})`],
    [(({ setPieces: q }) => q.whales >= 1 && q.frozenWhales === 0 && q.beltWhales === 0 && q.pass?.passed && q.pass.splashed && q.pass.gone && q.pass.score >= 25 && q.pass.score < 50 && q.pass.hits === 0 && q.ram?.hits === 1 && q.ram.off)(report), `set pieces: the Tropical Archipelago has breaching whales (no other land does); skimming past one in the air is +25 once, it splashes back down and goes; flying into one is one knock per jump and you're shoved clear (${JSON.stringify(report.setPieces && { whales: report.setPieces.whales, frozen: report.setPieces.frozenWhales, belt: report.setPieces.beltWhales, pass: report.setPieces.pass, ram: report.setPieces.ram })})`],
    [(({ setPieces: q }) => q.arches >= 1 && q.moonArches === 0 && q.beltArches === 0 && q.thread?.threaded && q.thread.score >= 30 && q.thread.score < 60 && q.thread.hits === 0 && q.leg?.hits === 1 && q.leg.off)(report), `set pieces: Frozen Peaks has ice arches (no other land does); threading one is +30 once with no bump, a leg is solid: one knock and you're shoved off (${JSON.stringify(report.setPieces && { arches: report.setPieces.arches, moon: report.setPieces.moonArches, belt: report.setPieces.beltArches, thread: report.setPieces.thread, leg: report.setPieces.leg })})`],
    [(({ setPieces: q }) => q.castle && !q.volcanoCastle && !q.beltCastle && q.gate?.welcomed && q.gate.score >= 50 && q.gate.hits === 0 && q.tower?.hits.length === 1 && q.tower.out)(report), `set pieces: Princess Kingdom has its castle (no other land does); flying in through the gate is +50 with no bump, a tower is solid: one knock and you're pushed clear (${JSON.stringify(report.setPieces && { castle: report.setPieces.castle, gate: report.setPieces.gate, tower: report.setPieces.tower })})`],
    [(({ setPieces: q }) => q.states.join() === 'idle,rumble,blast,idle' && q.hits.length === 1 && q.nearHits === 0 && q.nearScore >= 15)(report), `set pieces: a fire geyser rumbles, blows, scorches once inside the pillar, and a near miss beside it gives +15 (${JSON.stringify(report.setPieces && { states: report.setPieces.states, hits: report.setPieces.hits, nearHits: report.setPieces.nearHits, nearScore: report.setPieces.nearScore })})`],
    [(({ landEnemies: { charger: c, consts: k } }) => c.states[0] === 'wind' && c.states.includes('dash') && c.windT >= k.wind - 0.05 && c.topSpeed >= k.speed - 1 && c.topSpeed <= k.speed * 1.05)(report), `land enemies: a Comet Charger winds up first, then charges at its full speed (${JSON.stringify(report.landEnemies?.charger)})`],
    [browserDesktop.count === 2 && browserDesktop.shown === 0, 'desktop: in a browser (no bridge) the Quit and Fullscreen buttons stay hidden'],
    [desk.titleShown && desk.titleCalls === 'fs,quit' && desk.blurred, 'desktop: with the bridge, the title card shows Fullscreen and Quit, and they call it'],
    [desk.pauseShown && desk.pauseCalls === 'fs,quit,quit', 'desktop: with the bridge, the pause card has Quit too'],
    [shop.title[0] === '🛩️ HANGAR · 🪙 5' && shop.title[1] === '📜 LORE · 1/12' && shop.overButtons === 2, `hangar: the title card shows HANGAR with the coin wallet and LORE with notes read, and Game Over has both (${JSON.stringify({ title: shop.title, over: shop.overButtons })})`],
    [shop.before.open && shop.before.rows.pup.text === 'FLYING' && shop.before.rows.dart.text === 'BUY' && !shop.before.rows.dart.off && shop.before.rows.hornet.text === 'NEED 7 MORE' && shop.before.rows.hornet.off, `hangar: Sky Pup flying, Dart (3) for sale, Twin Hornet (12) out of reach with 5 coins (${JSON.stringify(shop.before)})`],
    [shop.after.wallet === 2 && shop.after.kind === 'dart' && Math.abs(shop.after.speed - 44 * 1.08) < 0.01 && shop.after.hull === 90 && Math.abs(shop.after.regen - 1.15) < 1e-9 && shop.after.rows.dart.text === 'FLYING' && shop.after.rows.pup.text === 'FLY THIS' && shop.after.sub.startsWith('🪙 2 coins'), `hangar: buying the Dart takes 3 coins and flies it at once (+8% speed, 90 hull, boost refills 15% faster) (${JSON.stringify(shop.after)})`],
    [!shop.enterStarted && shop.closed && shop.titleAfter[0] === '🛩️ HANGAR · 🪙 2', `hangar: Enter in a panel doesn't take off, Escape closes it, the title button shows the new wallet (${JSON.stringify({ enter: shop.enterStarted, closed: shop.closed, title: shop.titleAfter })})`],
    [shop.reloaded.selected === 'dart' && shop.reloaded.kind === 'dart' && shop.reloaded.wallet === 2 && shop.reloaded.owned === 'dart,pup' && Math.abs(shop.reloaded.speed - 44 * 1.08) < 0.01, `hangar: the bought plane, the pick and the wallet survive a reload (${JSON.stringify(shop.reloaded)})`],
    [shop.lore.open && shop.lore.n === 12 && shop.lore.sub.startsWith('1/12') && shop.lore.dent.includes('The First Landing') && shop.lore.locked === 11 && shop.lore.last.includes('Sealed') && shop.loreClosed, `lore shelf: 12 rows, the read note in full, "???" for the rest, the last page sealed, Back closes it (${JSON.stringify(shop.lore)})`],
    [shop.flight.started && shop.flight.kind === 'dart' && shop.flight.inScene && shop.flight.finite && !shop.flight.dead, `hangar: the picked plane takes off and flies (${JSON.stringify(shop.flight)})`],
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
