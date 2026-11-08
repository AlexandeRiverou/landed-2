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
  // Every page records page and console errors, and gets no network beyond the local server.
  const guard = async (page) => {
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
  await page.click('#start');
  await page.evaluate(async () => {
    window.POWERUPS_FOR_TEST = (await import('./src/powerups.js')).POWERUPS;
    window.OBJ_FOR_TEST = await import('./src/objectives.js');
    window.BOSSES_FOR_TEST = (await import('./src/enemies.js')).BOSSES;
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
      G.powerups.has = () => false; // no Objective Radar arrow
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
      // Hold The Line runs a fixed 40 s clock: no par line on its card, and no speed bonus however it ends.
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
        const pullUps = G.pullup.shows; // a landing approach is not a reason to PULL UP!
        fly(at(85, 4.5), glide, 150, () => p.landed);
        const L = out.landing = { landed: !!p.landed, dead: p.dead, ...p.lastLanding, pullUps: G.pullup.shows - pullUps };
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
      const STRAIGHT = new Set(['octopus', 'crab', 'puffer', 'blimpBaron']);
      try {
        for (const [kind, def] of Object.entries(window.BOSSES_FOR_TEST)) {
          tidy();
          G.player.spawn(G.player.pos.x, G.player.pos.z, Math.atan2(-G.player.forward.x, -G.player.forward.z));
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
          M.kinds[kind] = S;
          end();
        }
      } finally {
        G.enemies.warn = warn;
        G.input.keys.delete('Space');
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
      p.damage = function (n) { hits.push(n); return damage.call(this, n); };
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
      G.powerups.activate('radar');
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

  // Hold The Line ("The Rush": four waves, a clock that slips back when you're shot down) and the five newer regular
  // enemies (Umbrella Goon, Grudge Rock, Sniper Owl, Kite Twins, Clingy Moth). Simulated, with nothing else around;
  // world changes for completing an objective are held back, and score, lives and god mode are put back afterwards.
  const RUSH = await page.evaluate(async () => {
    const G = window.G, p = G.player, E = G.enemies, out = {};
    const { CEILING } = await import('./src/enemies.js');
    const V = p.pos.constructor, UP = new V(0, 1, 0);
    const saved = { god: p.god, lives: p.lives, score: G.score, completed: G.objectives.completed, cooldown: G.objectives.cooldown, celebrate: G.mutations.celebrate, notify: G.ui.notify };
    G.mutations.celebrate = () => [];
    if (G.relax) G.setRelax(false);
    const notes = [];
    G.ui.notify = (t, ...a) => { notes.push(t); return saved.notify.call(G.ui, t, ...a); };
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
    const clock = () => { const m = /🛡 (\d+) \/ (\d+)s · WAVE (\d)\/4/.exec(G.objectives.current?.progress || ''); return m && { t: +m[1], need: +m[2], wave: +m[3] }; };

    // Hold The Line: waves 1-4 in the progress text, never more than CEILING regulars, a death knocks 15 s off the
    // clock, the second one makes it easier, and at the end everything pops (no points) within a second.
    G.score = 800;
    G.objectives.startType('survive');
    const obj = G.objectives.current;
    const htl = (out.htl = { waves: [], maxRegulars: 0, desc: obj.desc, reward: obj.reward });
    const track = () => { const c = clock(); if (c && !htl.waves.includes(c.wave)) htl.waves.push(c.wave); htl.maxRegulars = Math.max(htl.maxRegulars, regulars()); };
    for (let k = 0; k < 30 * 22; k++) { step(1); track(); }
    htl.progress = obj.progress;
    const before = clock();
    p.invuln = 0;
    p.damage(1e4);
    step(1, false);
    htl.slip = { before: before.t, after: clock().t, dead: p.dead, toast: notes.some((t) => /clock slipped back 15 seconds/.test(t)) };
    step(30 * 3);
    const easier0 = E.frenzy.easier, need0 = clock().need;
    p.invuln = 0;
    p.damage(1e4);
    step(1, false);
    htl.second = { easier: E.frenzy.easier - easier0, need0, need: clock().need, toast: notes.some((t) => /They feel a bit bad about it/.test(t)) };
    let addedAtEnd = null, scorePrev = G.score;
    const complete = G.objectives.complete;
    G.objectives.complete = function (f) { addedAtEnd = G.score - scorePrev; return complete.call(this, f); };
    for (let k = 0; k < 30 * 60 && G.objectives.current === obj; k++) { scorePrev = G.score; step(1); track(); }
    G.objectives.complete = complete;
    htl.done = G.objectives.current !== obj;
    htl.addedAtEnd = addedAtEnd;
    htl.held = notes.includes('THE LINE HELD!');
    step(30);
    htl.after1s = regulars();
    htl.frenzyAfter = E.frenzy;
    htl.ceiling = CEILING;
    // Relax Mode: no spawns, even with a frenzy set.
    G.objectives.startType('survive');
    step(60);
    G.setRelax(true);
    E.frenzy = { wave: 4, easier: 0, burst: true, score: 0 };
    E.spawnTimer = 0;
    step(150);
    out.relax = { regulars: regulars(), objective: !!G.objectives.current };
    E.frenzy = null;
    G.setRelax(false);
    quiet();
    clear();

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
    // Kite Twins: flying through the string hurts (12) and says so; shooting a kite snaps the string.
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
    Object.assign(G, { score: saved.score });
    Object.assign(G.objectives, { completed: saved.completed, cooldown: saved.cooldown });
    G.mutations.celebrate = saved.celebrate;
    G.ui.notify = saved.notify;
    E.spawnTimer = 6;
    p.god = saved.god;
    p.lives = saved.lives;
    return out;
  });
  // Grumbleglobe (planetboss.js): the zone where the whole small planet is the boss. Arrival in front of you, rock vs
  // gadget hits, the shield and the eye's cycle, every gadget's attack and its warning, phases, crashing and respawning,
  // relax mode, the pull-up warning, the break-up and the objective after it. Score, lives, zone and pacing go back after.
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

    // ---- Arrival: the zone card, then the planet ~760 m ahead within 6 s, face first, nose on it; the bar's name.
    const zi = ZONES.findIndex((z) => z.siege);
    out.zone = { index: zi, name: ZONES[zi]?.name, after: ZONES[zi - 1]?.name, before: ZONES[zi + 1]?.name, mood: ZONES[zi]?.mood, asteroids: ZONES[zi]?.asteroids };
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
    if (g) {
      const to = new V().subVectors(g.C, p.pos);
      Object.assign(out.arrival, { dist: Math.round(to.length()), deg: +(p.forward.angleTo(to) * 57.3).toFixed(1), grown: g.k, eye: g.eye.state, facing: +g.eye.wn.dot(to.clone().normalize().negate()).toFixed(2), bar: document.getElementById('boss-name').textContent, progress: O.current.progress });
    }
    if (!g) return out;
    out.devButton = !!document.querySelector('#devmenu [data-boss="grumbleglobe"]');
    // Its own par (a fair fight is ~2 min), not the 25 s every regular boss gets; the card says so.
    out.par = { obj: O.current.par, card: document.getElementById('obj-par').textContent, hp: Object.fromEntries(['turret', 'generator', 'vent', 'sweeper', 'eye'].map((k) => [k, g.parts.find((x) => x.kind === k).hp])) };
    // No "mountains sit down" persuasion in space, whatever the world's amplitude says.
    {
      const { TACTICS } = await import('./src/persuasion.js');
      const amp = G.world.amp;
      G.world.amp = 1;
      out.par.flatten = TACTICS.find((x) => x.id === 'flatten').can(O.current, G.persuasion);
      G.world.amp = amp;
    }

    // Park far out (and quiet) for the shooting checks: nothing fires at you from 2 km.
    const park = () => { p.pos.copy(g.C).add(new V(0, 0, 2000)); p.prevPos.copy(p.pos); p.speed = 0.001; };
    park();
    const e = g.e, bar = () => e.hp;
    // ---- Rock does nothing (grey), a gadget hit drains the bar (gold). A bullet at the far side of the planet stops at
    // the near side: the gadget behind it is untouched.
    const rockAt = g.C.clone().add(new V(0, -1, 0).multiplyScalar(160)); // the south pole: bare rock
    const sparks = [], sparkle = G.fx.sparkle.bind(G.fx);
    G.fx.sparkle = (pos, c) => { sparks.push(c); return sparkle(pos, c); };
    const h0 = bar();
    shoot(rockAt.clone().add(new V(0, -40, 0)), rockAt);
    out.rock = { drop: h0 - bar(), sparks: sparks.splice(0), tip: notes.includes('That\'s just rock. Shoot the gadgets!') };
    const turret = g.parts.find((x) => x.kind === 'turret');
    const tHp = turret.hp, h1 = bar();
    shoot(turret.mid.clone().addScaledVector(turret.wn, 40), turret.mid);
    out.gadget = { drop: +(h1 - bar()).toFixed(2), partDrop: +(tHp - turret.hp).toFixed(2), sparks: sparks.splice(0) };
    // From under the south pole (bare rock) straight up through the planet at the crown on the north pole.
    const crown = g.parts.find((x) => x.kind === 'crown'), under = g.C.clone().add(new V(0, -260, 0));
    const h2 = bar(), cHp = crown.hp;
    out.through = { stopped: shoot(under, crown.mid), drop: h2 - bar(), partDrop: cHp - crown.hp };
    // An orb aimed through the planet stops at it too.
    const orb = E.fireOrb(under, new V(0, 1, 0), 80, 10);
    step(30 * 3);
    out.through.orbGone = !E.shots.includes(orb);
    G.fx.sparkle = sparkle;

    // ---- The shield: while a generator stands the eye takes nothing (cyan bubble); the bar note counts them down.
    const eye = g.eye, gens = g.parts.filter((x) => x.kind === 'generator');
    const eyeShot = () => { const hb = bar(), eh = eye.hp; shoot(eye.mid.clone().addScaledVector(eye.wn, 70), eye.mid); return { drop: +(hb - bar()).toFixed(2), eyeDrop: +(eh - eye.hp).toFixed(2) }; };
    out.shield = { note3: g.bar().note, shot: eyeShot(), bubble: eye.shield.visible };
    // Shoot the generators down for real (6 hits each), one by one.
    const notes1 = [];
    for (const x of gens) { for (let k = 0; k < 8 && !x.broken; k++) shoot(x.mid.clone().addScaledVector(x.wn, 40), x.mid); notes1.push(g.bar().note); }
    out.shield.notes = notes1;
    out.shield.down = { broken: gens.every((x) => x.broken), toast: notes.some((n) => /^SHIELD DOWN!/.test(n)), bubble: eye.shield.visible, progress: O.current.progress };
    // ---- The eye's cycle: shut → twitch (1 s) → open (5 s), on a 9 s loop. Shut: no damage. Open: the bar drops.
    // (30 s: it only opens once its face has turned your way, at 0.30 rad/s.)
    const cycle = [];
    let last = null, at = 0, shutShot = null, openShot = null;
    for (let k = 0; k < 30 * 30; k++) {
      step(1);
      const s = eye.state;
      if (s !== last) { cycle.push([s, +(G.time - at).toFixed(2)]); last = s; at = G.time; }
      if (s === 'shut' && !shutShot) shutShot = eyeShot();
      if (s === 'open' && G.time - at > 0.5 && !openShot) { openShot = eyeShot(); }
    }
    out.eye = { cycle, shutShot, openShot, firstHit: notes.includes('Right in the eye! It\'s really upset now.') };

    // ---- Turrets: every shot comes after a 0.6 s glow, only at a plane above its horizon and within 450 m. Over a
    // slow orbit (nobody shooting back) no more than ~1 orb/s. A turret on the far side never fires.
    const fired = [], fire = g.fire.bind(g);
    g.fire = (x) => { const to = new V().subVectors(p.pos, x.mid), d = to.length(); fired.push({ cos: +(x.wn.dot(to) / d).toFixed(2), d: Math.round(d), glow: x.glowFrom != null ? +(G.time - x.glowFrom).toFixed(2) : null, x }); return fire(x); };
    const glowWatch = () => { for (const x of g.parts) if (x.kind === 'turret') { if (x.wind > 0 && x.glowFrom == null) x.glowFrom = G.time; if (!(x.wind > 0) && !(x.shots > 0)) x.glowFrom = null; } };
    const R = 160, orbit = { n0: 0 };
    // Slow orbit: 300 m from the centre, round the equator then over the poles (30 s), level heading along the path.
    for (let k = 0; k < 30 * 30; k++) {
      const a = (k / (30 * 30)) * Math.PI * 2, tilt = k < 30 * 15 ? 0 : 1;
      const pos = tilt ? new V(Math.cos(a) * 300, Math.sin(a) * 300, 0) : new V(Math.cos(a) * 300, 0, Math.sin(a) * 300);
      p.pos.copy(g.C).add(pos); p.prevPos.copy(p.pos); p.speed = 0.001; p.health = p.maxHealth;
      step(1); glowWatch();
    }
    out.turrets = { orbs: fired.length, perS: +(fired.length / 30).toFixed(2), minCos: Math.min(...fired.map((f) => f.cos)), maxD: Math.max(...fired.map((f) => f.d)), minGlow: Math.min(...fired.map((f) => f.glow ?? 0)) };
    // Far side: hover 250 m out on the opposite side from one turret, 12 s: that turret stays quiet.
    const far = g.parts.find((x) => x.kind === 'turret' && !x.broken);
    const n0 = fired.length;
    for (let k = 0; k < 30 * 12; k++) { p.pos.copy(g.C).addScaledVector(far.wn, -(R + 120)); p.prevPos.copy(p.pos); p.speed = 0.001; step(1); }
    out.turrets.farSide = fired.slice(n0).filter((f) => f.x === far).length;
    out.turrets.nearSide = fired.slice(n0).length;

    // ---- Vents: a column warning (along the surface normal) for 1.4 s+, then the blast; 15 damage once.
    const warns = [], warn = E.warn;
    E.warn = function (pos, r, color, tt, onFire, opts) { const rec = { r, t: tt, at: G.time, dir: opts?.dir?.clone(), shape: opts?.shape, fired: -1 }; warns.push(rec); return warn.call(this, pos, r, color, tt, (hz) => { rec.fired = +(G.time - rec.at).toFixed(2); onFire?.(hz); }, opts); };
    const vent = g.parts.find((x) => x.kind === 'vent' && !x.broken);
    vent.cd = 0; g.lastVent = -99;
    const hits = [], damage = p.damage;
    p.damage = function (n) { hits.push([n, +G.time.toFixed(2)]); return damage.call(this, n); };
    p.invuln = 0;
    let vt0 = null, vn = null;
    for (let k = 0; k < 30 * 4; k++) {
      p.pos.copy(vent.wa).addScaledVector(vent.wn, 60); p.prevPos.copy(p.pos); p.speed = 0.001; p.health = p.maxHealth; p.invuln = 0;
      G.step(1 / 30);
      if (vent.state === 'warn' && vt0 == null) { vt0 = G.time; vn = vent.wn.clone(); } // its normal when the warning went up (the planet turns)
    }
    const vw = warns.find((w) => w.shape === 'column' && w.r === 14);
    out.vent = { warn: vw && { t: vw.t, fired: vw.fired, normal: +vw.dir.dot(vn).toFixed(3) }, hits: hits.filter((h) => h[0] === 15).length, firstHit: hits.find((h) => h[0] === 15)?.[1] - vt0 };
    // Erupting, it bounces bullets; quiet, a shot plugs it.
    vent.state = 'blast'; vent.t = 1;
    const vh = vent.hp;
    shoot(vent.mid.clone().addScaledVector(vent.wn, 40), vent.mid);
    out.vent.bounced = vh === vent.hp;
    g.quiet(vent);
    // ---- Sweepers: the beam (always visible) costs 12; a barrel roll passes straight through it.
    const sw = g.parts.find((x) => x.kind === 'sweeper' && !x.broken);
    const onBeam = () => { const end = new V(55, 0, 0).applyMatrix4(sw.hub.matrixWorld); p.pos.copy(end); p.prevPos.copy(p.pos); p.speed = 0.001; p.health = p.maxHealth; };
    hits.length = 0;
    sw.cd = 0;
    for (let k = 0; k < 15; k++) { onBeam(); p.invuln = 0; p.dodging = true; G.step(1 / 30); }
    const rolled = hits.filter((h) => h[0] === 12).length;
    p.dodging = false;
    for (let k = 0; k < 15; k++) { onBeam(); p.invuln = 0; G.step(1 / 30); }
    out.sweeper = { rolled, hit: hits.filter((h) => h[0] === 12).length, visible: sw.hub.children.some((c) => c.geometry?.parameters?.width === 120 && c.visible) };
    park();

    // ---- Phases: 66% wakes it (drones, faster spin, two-shot bursts), 33% melts it down (ENRAGED, cracks, longer eye,
    // the glare, Grudge Rocks).
    E.list.filter((x) => !x.quest).forEach((x) => E.removeEnemy(x));
    p.pos.copy(g.C).add(new V(0, 0, 400)); p.prevPos.copy(p.pos); // close enough to keep its drones about
    e.hp = 65;
    step(2);
    step(30);
    out.phase2 = { phase: g.phase, drones: E.list.filter((x) => x.type === 'drone').length, spin: null, toast: notes.some((n) => /properly awake/.test(n)) }; // spin: on the fresh planet below (this one's shield is down)
    // Bursts: hover over a live turret until it fires twice in a row 0.25 s apart.
    const tur = g.parts.find((x) => x.kind === 'turret' && !x.broken);
    const nb = fired.length;
    for (let k = 0; k < 30 * 6; k++) { hover(tur, 200); p.health = p.maxHealth; step(1); }
    const pair = fired.slice(nb).filter((f) => f.x === tur);
    out.phase2.burst = pair.length >= 2;
    // Shield down: no spin; the face turns toward you at up to 0.30 rad/s (enemy time) until it looks right at you.
    // The eye, due to open, holds shut while the face is more than 0.7 rad off you; it starts twitching once within.
    {
      const face = () => { const to = new V().subVectors(p.pos, g.C).setY(0).normalize(); return g.eye.wn.clone().setY(0).normalize().dot(to); };
      const side = g.eye.wn.clone().setY(0).normalize().applyAxisAngle(new V(0, 1, 0), 2.2); // 126° round from where it looks
      const sit = () => { p.pos.copy(g.C).addScaledVector(side, 600); p.prevPos.copy(p.pos); p.speed = 0.001; p.health = p.maxHealth; };
      sit(); step(1);
      Object.assign(g.eye, { state: 'shut', t: 0 }); // due to open right now
      const f0 = face(), r0 = g.body.rotation.y;
      let held = 0, heldErr = 0, twitchErr = null;
      const watch = () => {
        if (g.eye.state === 'shut' && g.eye.t <= 0 && g.faceErr > 0.7) { held++; heldErr = Math.max(heldErr, g.faceErr); }
        if (g.eye.state === 'twitch' && twitchErr == null) twitchErr = +g.faceErr.toFixed(3);
      };
      for (let k = 0; k < 30 * 2; k++) { sit(); step(1); watch(); }
      const rate = Math.abs(g.body.rotation.y - r0) / (2 * 0.85);
      for (let k = 0; k < 30 * 22; k++) { sit(); step(1); watch(); }
      out.turn = { f0: +f0.toFixed(2), rate: +rate.toFixed(3), f1: +face().toFixed(3), toast: notes.includes('Grumbleglobe turned to glare at you. Rude. Effective.'), held: +(held / 30).toFixed(2), heldErr: +heldErr.toFixed(2), twitchErr };
    }
    park();
    E.list.filter((x) => !x.quest).forEach((x) => E.removeEnemy(x));
    e.hp = 32;
    step(2);
    out.phase3 = { phase: g.phase, enraged: e.enraged, cracks: g.cracks.visible, bar: document.getElementById('boss-name').textContent, toast: notes.some((n) => /^MELTDOWN!/.test(n)) };
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
    // The treadmill: you keep 126° round from the face (as if chasing a far-side gadget), so it never looks at you. The
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
    out.phase3.rocks = E.list.filter((x) => x.type === 'grudgeRock').length;
    out.hazards = warns.filter((w) => w.t < 1).length; // every warning lasts 1 s or more
    E.warn = warn;

    // ---- Time Freeze stops the spin (and every gadget timer).
    p.pos.copy(g.C).addScaledVector(g.eye.wn.clone().setY(0).normalize().applyAxisAngle(new V(0, 1, 0), 1.5), 600); p.prevPos.copy(p.pos); // off to its side: it would turn
    G.powerups.activate('freeze');
    const fr0 = g.body.rotation.y;
    step(30);
    out.freeze = g.body.rotation.y === fr0;
    G.powerups.active.clear();
    // ---- Homing bullets curve toward a gadget you can hurt, not the centre.
    out.homing = (() => { const h = g.homeAt(p.pos); return !!h && h.distanceTo(g.C) > R - 5; })();

    // ---- Crashing into it costs a life (Mega Plane too); the respawn is 450 m out, level with it, nose on it, and what
    // you destroyed stays destroyed. A nose-in dive lights the pull-up glow first.
    E.list.filter((x) => !x.quest).forEach((x) => E.removeEnemy(x));
    E.shots.splice(0).forEach((s) => G.scene.remove(s.mesh));
    const broken0 = g.parts.filter((x) => x.broken).length;
    p.lives = 5;
    const dive = () => { p.pos.copy(g.C).add(new V(0, 0, R + 120)); p.prevPos.copy(p.pos); level(0); p.speed = p.baseSpeed; p.invuln = 0; p.grace = 0; p.health = p.maxHealth; };
    dive();
    let glow = false, k2 = 0;
    for (; k2 < 30 * 6 && !p.dead; k2++) { G.step(1 / 30); if (G.pullup.on) glow = true; }
    out.crash = { dead: p.dead, lives: p.lives, glow, toast: notes.includes('You hugged the planet. It did not hug back.') };
    for (let k = 0; k < 30 * 3 && p.dead; k++) G.step(1 / 30);
    const to = new V().subVectors(g.C, p.pos);
    out.respawn = { dist: Math.round(to.length()), dy: Math.round(p.pos.y - g.C.y), deg: +(p.forward.angleTo(to) * 57.3).toFixed(1), invuln: +p.invuln.toFixed(1), broken: g.parts.filter((x) => x.broken).length === broken0 };
    G.powerups.activate('mega');
    dive();
    for (let k = 0; k < 30 * 6 && !p.dead; k++) G.step(1 / 30);
    out.crash.mega = p.dead && p.lives === 3;
    for (let k = 0; k < 30 * 3 && p.dead; k++) G.step(1 / 30);
    G.powerups.active.clear();
    p.lives = 1e6;

    // ---- Relax mode: the planet stays and dozes (no attacks); back from it, the same planet resumes, gadgets still gone.
    G.setRelax(true);
    const shots0 = fired.length;
    for (let k = 0; k < 30 * 6; k++) { hover(tur, 200); step(1); }
    out.relax = { stays: E.list.includes(e) && !e.dead, dozing: g.dozing, shots: fired.length - shots0, bar: document.getElementById('boss-bar').classList.contains('hidden') };
    G.setRelax(false);
    park();
    for (let k = 0; k < 30 * 5 && !O.current; k++) step(1);
    out.relax.back = O.current?.globe === g && !g.dozing && g.parts.filter((x) => x.broken).length >= broken0;

    // ---- The end: the last hit sets off every gadget left, it splits into 8 rubble chunks (harmless for 3 s), BOSS
    // DEFEATED, 1.5× the boss reward, a spare plane. Then the zone's next objective comes as usual.
    p.lives = 2;
    const score0 = G.score, done0 = O.completed, rubble0 = G.zones.asteroids.list.length, reward = O.current.reward, lvl = O.bossLevel - 1;
    e.hp = 0.5;
    const final = g.parts.find((x) => !x.broken && x.counted && x.kind !== 'eye' && x.kind !== 'vent');
    shoot(final.mid.clone().addScaledVector(final.wn, 40), final.mid);
    out.end = { dying: g.dying >= 0, xEye: g.xEye.visible };
    for (let k = 0; k < 30 * 3 && !e.dead; k++) { park(); step(1); }
    step(2);
    const chunks = G.zones.asteroids.list.slice(rubble0);
    Object.assign(out.end, {
      dead: e.dead, allGone: g.parts.every((x) => x.broken), rubble: chunks.length, sizes: chunks.every((a) => a.size >= 12 && a.size <= 14 && a.safe > 0),
      completed: O.completed - done0, banner: document.querySelector('#banner h1').textContent, lives: p.lives, reward, expected: Math.round((400 + lvl * 100) * 1.5), gained: G.score - score0,
      inList: E.list.includes(e), bar: document.getElementById('boss-bar').classList.contains('hidden'),
    });
    // The rubble can be shot apart.
    const chunk = chunks[0];
    if (chunk) { const n1 = G.zones.asteroids.list.length; for (let k = 0; k < 3 && G.zones.asteroids.list.includes(chunk); k++) shoot(chunk.pos.clone().add(new V(0, 0, 30)), chunk.pos, 6); out.end.rubbleShot = !G.zones.asteroids.list.includes(chunk) && G.zones.asteroids.list.length < n1; }
    for (let k = 0; k < 30 * 6 && !O.current; k++) step(1);
    out.next = { type: O.current?.type, siege: !!O.current?.siege, zone: G.zones.current.name };

    // ---- Lap 2: gadgets have 1.4× hp. A fresh run continued from this zone (resetRun + enter, as "CONTINUE") gets a
    // fresh planet.
    quiet(); clear();
    G.zones.lap = 2;
    O.resetRun();
    G.zones.enter(zi);
    for (let k = 0; k < 30 * 6 && !globe(); k++) step(1);
    const g2 = globe();
    out.fresh = g2 && { other: g2 !== g, intact: g2.parts.every((x) => !x.broken), turretHp: +g2.parts.find((x) => x.kind === 'turret').hp.toFixed(2), eyeHp: +g2.eye.hp.toFixed(2), hp: g2.e.hp };
    if (g2) {
      // Phase 2 with the shield up: it spins faster (once the shield drops it stops and turns to you instead).
      g2.e.hp = 65;
      for (let k = 0; k < 30 * 3 && g2.phase < 2; k++) step(1); // once it has grown in
      const s0 = g2.body.rotation.y;
      step(30);
      out.phase2.spin = +((g2.body.rotation.y - s0) / (1 * 0.85)).toFixed(3);
      // The eye is the finisher: generators down, then breaking the eye ends the fight with the bar well above 0.
      const park2 = () => { p.pos.copy(g2.C).add(new V(0, 0, 2000)); p.prevPos.copy(p.pos); p.speed = 0.001; };
      park2();
      g2.e.hp = 80;
      for (const x of g2.parts.filter((y) => y.kind === 'generator')) for (let k = 0; k < 12 && !x.broken; k++) shoot(x.mid.clone().addScaledVector(x.wn, 40), x.mid);
      for (let k = 0; k < 30 * 12 && !g2.eyeOpen(); k++) step(1);
      const hpBefore = +g2.e.hp.toFixed(1);
      for (let k = 0; k < 40 && !g2.eye.broken && g2.eyeOpen(); k++) shoot(g2.eye.mid.clone().addScaledVector(g2.eye.wn, 60), g2.eye.mid);
      const broke = g2.eye.broken, dying = g2.dying >= 0;
      for (let k = 0; k < 30 * 3 && !g2.e.dead; k++) { park2(); step(1); }
      out.eyeKill = { hpBefore, broke, dying, dead: g2.e.dead, allGone: g2.parts.every((x) => x.broken) };
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
    p.damage = damage;
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
    G.devmenu.levelUp();
    out.levelUp = { health: p.health, max: p.maxHealth, note: [...G.ui.notes, ...G.ui.queue].some((n) => /Hull repaired/.test(n.text)) };
    p.health = 50; p.sinceHit = 0;
    step(30 * 9);
    out.regen = { at9s: p.health, rate: p.stats.regen };
    step(30 * 3);
    out.regen.at12s = p.health;
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

  console.log(JSON.stringify(report, null, 2));

  const checks = [
    [report.firstObjective === 'hoop', 'first objective is a hoop'],
    [report.musicPlaying && report.engineGain <= 0.015, 'calm music plays and the engine stays quiet'],
    [report.musicSection && report.musicSection.mood === 'day' && report.musicSection.texture, 'the music is in a section (music.section shows mood, progression, texture, root)'],
    [report.music.missing.length === 0 && report.music.moods >= 8 && report.music.bad.length === 0, 'every zone\'s mood exists; sections vary progression, texture and key (small steps, back home)'],
    [report.persuasionStages >= 10, 'persuasion escalated through its stages'],
    [report.persuasionPaced === 1, 'persuasion waits 15 s between tactics, however big the neglect'],
    [report.tactics.errors.length === 0 && report.tactics.applied + report.tactics.skipped.length === report.tactics.total && report.tactics.skipped.length <= 3 && report.tactics.total >= 35, 'every persuasion tactic applies and disposes without errors'],
    [report.tactics.leftovers.length === 0 && report.tactics.clean, 'persuasion reset() removes every tactic\'s meshes, HUD lines, camera peek and wind'],
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
    [report.quests.treasure && report.quests.treasureDry, 'X marks the spot: on dry land, and shooting the X digs out the treasure'],
    [report.quests.searchlightCaught, 'searchlights: two lamps, and loitering by the hoop gets you spotted out of the mission'],
    [report.quests.searchlightDash, 'searchlights: waiting for a beam to pass, then boosting straight in, makes the hoop'],
    [report.noHerd, 'balloon herding is gone and X marks the spot took its place in the objective list'],
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
    // Boss signature moves: each one shows within ~20 s engaged (and none of these held for the old orbit-and-shoot).
    ...(() => {
      const SIG = {
        megaUfo: (s) => s.teleport >= 1, thunder: (s) => s.hazards >= 1, blimpBaron: (s) => s.run > 300,
        jellyEmpress: (s) => s.maxSpeed > 35 && s.blobs > 0, mineMother: (s) => s.ring >= 6 && s.angles >= 6,
        kingDrone: (s) => s.guards >= 1, hiveQueen: (s) => s.shell >= 6, pigeonDon: (s) => s.still >= 2,
        seagullSteven: (s) => s.diveVy < -40, gooseQueen: (s) => s.joust > 60, garyPrime: (s) => s.roll >= 1.45 && s.roll < 3,
        fortGrump: (s) => /udu/.test(s.shields), octopus: (s) => s.lead[1] - s.lead[0] >= 150, crab: (s) => s.lateral > 75, puffer: (s) => s.puffShrink >= 40,
      };
      const kinds = report.moves?.kinds || {}, miss = Object.keys(SIG).filter((k) => !kinds[k] || !SIG[k](kinds[k]));
      const hz = report.moves?.hazards || [], fired = hz.filter((h) => h.fired >= 0);
      const zones = Object.entries(report.moveZones || {});
      return [
        [Object.keys(kinds).length >= 15 && miss.length === 0, `every boss shows its signature move: blink, lightning columns, bombing runs, pulses, mine ring, royal guard, bee shell, perch, dive, joust, wingman roll, duck, jets, lane snaps, puffed approach (missing: ${miss.map((k) => `${k} ${JSON.stringify(kinds[k])}`).join('; ') || 'none'})`],
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
    [(({ kingDrone, octopus }) => [kingDrone, octopus].every((b) => b && b.hull >= 70))(report.breathing || {}), 'boss breakaway: the hull mends from 50 to 70+ hp within 12 s of breaking away'],
    [(({ repeat: r }) => r && r.first.max === 8 && r.second.max < r.first.max && r.second.t > 0 && r.second.t < r.second.max / 0.85 + 0.2 && r.afterHit.max === 8)(report.breathing || {}), 'boss breakaway: each one in a row without hurting the boss is shorter; hurting it resets that'],
    [(({ kingDrone, octopus, twins }) => [kingDrone, octopus].every((b) => b && b.shook === 1 && b.back === 1 && b.lostYou && !b.barBack && b.nags === 0) && twins?.both && twins.shook === 1)(report.breathing || {}), 'boss breakaway: one "shook off" toast (one for twins), one "coming back" toast, boss bar shows "(lost you)" while away, no wrong-way nag'],
    [Object.keys(report.fleeLead || {}).length >= 3 && Object.values(report.fleeLead).every((b) => b.turn < 10 && b.lost < 25), `fleeing a lead boss (180° boost turn, then straight) costs under 25 hp in 15 s (${JSON.stringify(report.fleeLead || {})})`],
    [Object.keys(report.fleeLead || {}).length >= 3 && Object.values(report.fleeLead).every((b) => b.clear >= 0 && b.clear <= 4 && b.closest >= 120), `fleeing a lead boss: once it's fight + 120 m behind (within 4 s of the turn) it never comes closer while you keep going (${JSON.stringify(report.fleeLead || {})})`],
    [[report.breathing?.kingDrone, report.breathing?.octopus].every((b) => b?.hint4s === false), 'boss hints no longer promise repairs after "4 seconds"'],
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
    [report.pit.depth >= 30 && report.pit.mesh >= 25 && report.pit.cellMax <= 100, 'a 20-bullet burst digs a 30 m+ pit that shows on the mesh within 0.2 s, and crater lists stay short'],
    [report.zoneAdvanced, 'completing objectives advances to the next zone'],
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
    [(({ levelUp: u }) => u.health === u.max && u.note)(L.run), 'lives: levelling up (the dev menu button, same path) repairs the hull, and says so'],
    [(({ regen: r }) => r.at9s === 50 && r.at12s > 50 && r.at12s <= 50 + r.rate * 2.2)(L.run), 'hull: no repairs for 10 s after a hit, then slowly (stats.regen hp/s)'],
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
    // ---- Hold The Line ("The Rush") and the newer regular enemies (see the RUSH block)
    [(({ htl: h }) => [1, 2, 3, 4].every((w) => h.waves.includes(w)) && /· WAVE \d\/4$/.test(h.progress) && h.reward === 250)(RUSH), `Hold The Line: "WAVE n/4" in the progress text, and the waves reach 4 (${JSON.stringify(RUSH.htl.waves)})`],
    [RUSH.htl.maxRegulars <= RUSH.htl.ceiling && RUSH.htl.maxRegulars >= 8, `Hold The Line: never more than ${RUSH.htl.ceiling} regular enemies at once (peak ${RUSH.htl.maxRegulars})`],
    [(({ slip: s }) => s.dead && s.toast && Math.abs(s.before - s.after - 15) <= 1)(RUSH.htl), `Hold The Line: getting shot down knocks the clock back 15 s (${JSON.stringify(RUSH.htl.slip)})`],
    [(({ second: s }) => s.easier === 1 && s.need === s.need0 - 8 && s.toast)(RUSH.htl), `Hold The Line: the second death makes it easier by itself (${JSON.stringify(RUSH.htl.second)})`],
    [(({ htl: h }) => h.done && h.held && h.addedAtEnd === 0 && h.after1s === 0 && h.frenzyAfter === null)(RUSH), `Hold The Line: when it holds, every regular enemy is gone within 1 s, with no points for them (${JSON.stringify({ ...RUSH.htl, waves: undefined, desc: undefined })})`],
    [RUSH.relax.regulars === 0 && !RUSH.relax.objective, 'Hold The Line: nothing spawns in Relax Mode'],
    [Object.values(RUSH.types).every((r) => r.spawned >= 1 && r.intro === 1 && r.extra), `new enemies: each one spawns and shows its intro once (${JSON.stringify(RUSH.types)})`],
    [Object.values(RUSH.types).every((r) => r.t !== null && r.t <= 15 && r.kills >= 1), `new enemies: a scripted aim pilot shoots each one down within 15 s (${JSON.stringify(Object.fromEntries(Object.entries(RUSH.types).map(([k, r]) => [k, r.t])))})`],
    [['umbrella', 'grudgeRock', 'sniperOwl', 'kites', 'moth'].every((t) => RUSH.picks.all.includes(t)) && !RUSH.picks.all.includes('pebble') && RUSH.picks.third === 0, `new enemies: they join the spawn mix (pebbles never on their own), at most 2 Sniper Owls (${JSON.stringify(RUSH.picks)})`],
    [(({ front: f, back: b }) => f.lost === 0 && b.dmg > 0 && b.lost === b.dmg)(RUSH.umbrella), `Umbrella Goon: no damage from the front, full damage from behind (${JSON.stringify(RUSH.umbrella)})`],
    [RUSH.dog.dead && RUSH.dog.bits === 3 && RUSH.dog.beforeBit > 0 && RUSH.dog.bitDead && RUSH.dog.newBits === 0, `Grudge Rock: breaks into 3 pebbles, which don't split again (${JSON.stringify(RUSH.dog)})`],
    [RUSH.thunder && RUSH.thunder.rings === 2 * RUSH.thunder.spines && RUSH.thunder.spines >= 3 && !RUSH.thunder.thick && !RUSH.thunder.other && !RUSH.thunder.dark && RUSH.thunder.castZaps === 0 && RUSH.thunder.landZaps === 1 && RUSH.thunder.lost === 18 && RUSH.thunder.shade >= 0.6, `Thunderclaus volley: two yellow rings and a thin spine per strike (no dark column), the bolt costs 18 on its axis, the zap sounds on landing, and the cloud body is light slate (${JSON.stringify(RUSH.thunder)})`],
    [(({ owl: o }) => o.lock >= 1.499 && o.lock <= 1.6 && o.broken && o.newShots === 0 && o.lost === 0)(RUSH), `Sniper Owl: a red line for 1.5 s before it fires; a barrel roll during the line breaks it: no shot, no damage (${JSON.stringify(RUSH.owl)})`],
    [(({ kites: k }) => k.pair && k.gap >= 60 && k.lost === 12 && k.toast && k.inScene && k.snapped)(RUSH), `Kite Twins: flying through the string hurts (12), and shooting a kite snaps the string (${JSON.stringify(RUSH.kites)})`],
    [(({ moth: m }) => m.latched && m.boost <= 0.75 && m.lost > 0 && m.off && m.paid.kills === 1 && m.paid.score === 70 && m.paid.dead && m.dropped)(RUSH), `Clingy Moth: latches on and drains boost; a stunt shakes it off for its points (once); getting shot down drops it (${JSON.stringify(RUSH.moth)})`],
    // ---- Grumbleglobe, the Planet With Opinions (see the GLOBE block)
    ...(({ zone: z, arrival: a }) => [
      [z.name === 'Grumbleglobe' && z.after === 'Gas Giant' && z.before === 'The Moon' && z.mood === 'ember' && z.asteroids === 0 && GLOBE.card === 'Grumbleglobe' && GLOBE.notInDeck && GLOBE.devButton, `Grumbleglobe: its own zone between Gas Giant and The Moon, never in the regular boss deck, a dev-menu button (${JSON.stringify(z)})`],
      [a.t <= 6 && a.dist >= 650 && a.dist <= 800 && a.deg <= 15 && a.grown === 1 && a.eye === 'stare' && a.facing > 0.9 && a.bar === '👑 Grumbleglobe, the Planet With Opinions (shield: 3)' && a.progress === '🛡3 🔫6 🌋4 🌀2' && a.level === 1 && a.nextGap >= 4 && a.nextGap <= 7, `Grumbleglobe: the zone's first objective; within 6 s the planet is ~760 m off your nose, face first, with its boss bar (and it takes the boss slot) (${JSON.stringify(a)})`],
    ])(GLOBE),
    [GLOBE.rock.drop === 0 && GLOBE.rock.sparks.length > 0 && GLOBE.rock.sparks.every((c) => c === '#9aa0a6') && GLOBE.rock.tip && GLOBE.gadget.drop === 2 && GLOBE.gadget.partDrop === 1 && GLOBE.gadget.sparks.includes('#ffd23a'), `Grumbleglobe: bare rock never moves the bar (grey, with a tip); a gadget hit drains it at once (gold) (${JSON.stringify({ rock: GLOBE.rock, gadget: GLOBE.gadget })})`],
    [GLOBE.through.stopped && GLOBE.through.drop === 0 && GLOBE.through.partDrop === 0 && GLOBE.through.orbGone, `Grumbleglobe: bullets and orbs stop at the planet, nothing passes through (${JSON.stringify(GLOBE.through)})`],
    [(({ shield: s }) => s.note3 === 'shield: 3' && s.shot.drop === 0 && s.shot.eyeDrop === 0 && s.bubble && s.notes[0] === 'shield: 2' && s.notes[1] === 'shield: 1' && s.notes[2] !== 'shield: 0' && s.down.broken && s.down.toast && !s.down.bubble && s.down.progress.startsWith('🛡0'))(GLOBE), `Grumbleglobe: while a generator stands the eye takes no damage (cyan bubble), the bar note counts them down, and the last one drops the shield (${JSON.stringify(GLOBE.shield)})`],
    [(({ eye: y }) => { const tw = y.cycle.findIndex((c) => c[0] === 'twitch'); return tw >= 0 && y.cycle[tw + 1]?.[0] === 'open' && y.cycle[tw + 1][1] >= 0.9 && y.cycle[tw + 2]?.[0] === 'shut' && Math.abs(y.cycle[tw + 2][1] * 0.85 - 5) < 0.1 && y.shutShot?.drop === 0 && y.openShot?.drop === 2.14 && y.openShot.eyeDrop === 1 && y.firstHit; })(GLOBE), `Grumbleglobe: the lid opens for 5 s on a cycle after a 1 s twitch; shut it bounces, open the bar drains (${JSON.stringify(GLOBE.eye)})`],
    [(({ turrets: t }) => t.orbs > 0 && t.perS <= 1.05 && t.minCos > 0.15 && t.maxD < 450 && t.minGlow >= 0.55 && t.farSide === 0)(GLOBE), `Grumbleglobe turrets: a 0.6 s glow before every shot, only at you above their horizon within 450 m (never from the far side), at most ~1 orb/s over a slow orbit (${JSON.stringify(GLOBE.turrets)})`],
    [(({ vent: v }) => v.warn && v.warn.t >= 1.4 && v.warn.fired >= 1.4 && v.warn.normal > 0.98 && v.hits === 1 && v.firstHit >= 1.4 && v.bounced)(GLOBE), `Grumbleglobe vents: a column along the surface normal for 1.4 s+, then one 15-damage blast; erupting, they bounce bullets (${JSON.stringify(GLOBE.vent)})`],
    [GLOBE.sweeper.visible && GLOBE.sweeper.rolled === 0 && GLOBE.sweeper.hit === 1, `Grumbleglobe sweepers: the beam costs 12, a barrel roll passes through unhurt (${JSON.stringify(GLOBE.sweeper)})`],
    [(({ phase2: q }) => q.phase === 2 && q.drones === 3 && Math.abs(q.spin - 0.055) < 0.005 && q.toast && q.burst)(GLOBE), `Grumbleglobe phase 2 (66%): 3 drones, faster spin (shield up), two-shot bursts (${JSON.stringify(GLOBE.phase2)})`],
    [(({ phase3: q }) => q.phase === 3 && q.enraged && q.cracks && /ENRAGED/.test(q.bar) && q.toast && q.eyeOpen >= 5.8 && q.glare && q.glare.t >= 1.2 && q.glare.fired >= 1.2 && q.glare.hit === 1 && q.glare.sight && q.glare.sight[0] >= 2 && q.glare.sight[0] < 2.5 && q.glare.sight[1] > 3.5 && q.glare.sight[1] <= 4 && q.glare.beamOp.length === 1 && q.glare.beamOp[0] === 0.7 && q.glare.beamOver >= 25 && q.glare.beamOver <= 35 && q.glare.beamDrawn && (q.glare.beamDrawn.endToAim <= 1 || Math.abs(q.glare.beamDrawn.camGap - 50) <= 0.5) && Math.abs(q.glare.beamDrawn.hitPast - 30 - q.glare.beamDrawn.shortOfAim) <= 0.2 && q.glare.beamDrawn.tip === 40 && q.glare.beamDrawn.point === 0 && q.rocks >= 1 && q.rocks <= 2)(GLOBE), `Grumbleglobe phase 3 (33%): ENRAGED, cracks, the eye open 6 s, a 1.2 s+ glare warning (a thin sight, 2 m thickening to 4 m) before its 20-damage beam (steady 0.7, drawn up to where it aimed or 50 m short of the camera, narrowing over its last 40 m, hitting ~30 m past you), up to 2 Grudge Rocks (${JSON.stringify(GLOBE.phase3)})`],
    [(({ phase3: { held: q } }) => q && q.held >= 5.9 && q.held <= 6.2 && q.err > 0.7 && q.opened && q.inView && q.inView.held >= 5.9 && q.inView.held <= 6.2 && q.inView.opened && q.inView.sees && q.inView.glares === 0)(GLOBE), `Grumbleglobe: an eye the face can't bring round to you (you keep 126° off it) still twitches and opens after 6 s held shut; a forced opening with the face off you fires no glare (${JSON.stringify(GLOBE.phase3.held)})`],
    [(({ phase3: { reach: q } }) => q && q.in9 === 1 && q.out11 === 0 && q.past25 === 1 && q.past45 === 0 && q.camDrawn === 70 && q.camEnd === 70 && q.sight && q.sight.end === 70 && q.sight.body === 35 && q.sight.same && q.sight.gone)(GLOBE), `Grumbleglobe glare: hit radius 6 + 4 m, the hit segment 30 m past the aim point, the drawn beam and the sight stopping 50 m short of the camera, their last 40 m (half, for these 70 m) a narrowing tip (${JSON.stringify(GLOBE.phase3.reach)})`],
    [GLOBE.hazards === 0 && GLOBE.freeze && GLOBE.homing, `Grumbleglobe: every warning lasts 1 s+, Time Freeze stops the spin, Homing Bullets pick a gadget (${JSON.stringify({ hazards: GLOBE.hazards, freeze: GLOBE.freeze, homing: GLOBE.homing })})`],
    [(({ crash: c, respawn: r }) => c.dead && c.lives === 4 && c.glow && c.toast && c.mega && r.dist >= 445 && r.dist <= 455 && Math.abs(r.dy) <= 2 && r.deg <= 5 && r.invuln > 2 && r.broken)(GLOBE), `Grumbleglobe: flying into it shows the pull-up glow, then crashes and costs a life (Mega Plane too); the respawn is 450 m out facing it, destroyed gadgets still gone (${JSON.stringify({ crash: GLOBE.crash, respawn: GLOBE.respawn })})`],
    [(({ relax: r }) => r.stays && r.dozing && r.shots === 0 && r.bar && r.back)(GLOBE), `Grumbleglobe: in Relax Mode it dozes (no attacks); back from it the same planet resumes (${JSON.stringify(GLOBE.relax)})`],
    [(({ end: d }) => d.dying && d.xEye && d.dead && d.allGone && d.rubble === 8 && d.sizes && d.rubbleShot && d.completed === 1 && d.banner === 'BOSS DEFEATED!' && d.lives === 3 && d.reward === d.expected && d.gained >= d.reward && !d.inList && d.bar)(GLOBE), `Grumbleglobe: beaten, its gadgets chain-explode and it splits into 8 shootable rubble chunks; BOSS DEFEATED, 1.5× reward, a spare plane (${JSON.stringify(GLOBE.end)})`],
    [GLOBE.next.type && GLOBE.next.type !== 'boss' && !GLOBE.next.siege && GLOBE.next.zone === 'Grumbleglobe', `Grumbleglobe: the zone's next objective comes as usual among the rubble (${JSON.stringify(GLOBE.next)})`],
    [(({ par: q }) => q.obj === 110 && q.card === '⏱ Par 110 s · beat it for +60' && q.flatten === false)(GLOBE), `Grumbleglobe: its own par, 110 s, on the card; no "flatten" persuasion in space (${JSON.stringify(GLOBE.par)})`],
    [(({ par: { hp: h } }) => h.turret === 3 && h.generator === 6 && h.vent === 3 && h.sweeper === 6 && h.eye === 14)(GLOBE), `Grumbleglobe: gadget hp turret 3, generator 6, vent 3, sweeper 6, eye 14 (${JSON.stringify(GLOBE.par.hp)})`],
    [(({ turn: t }) => t && t.f0 < -0.4 && t.rate > 0.27 && t.rate <= 0.301 && t.f1 > 0.99 && t.toast && t.held >= 1 && t.heldErr > 1.5 && t.twitchErr !== null && t.twitchErr < 0.7)(GLOBE), `Grumbleglobe: once the shield is down it stops spinning and turns its face to you at up to 0.30 rad/s; the eye holds shut while the face is over 0.7 rad off you, then opens (${JSON.stringify(GLOBE.turn)})`],
    [(({ eyeKill: k }) => k && k.hpBefore > 20 && k.broke && k.dying && k.dead && k.allGone)(GLOBE), `Grumbleglobe: breaking the eye ends the fight, whatever is left of the bar (${JSON.stringify(GLOBE.eyeKill)})`],
    [(({ fresh: f }) => f && f.other && f.intact && f.turretHp === 4.2 && f.eyeHp === 19.6 && f.hp === 100)(GLOBE), `Grumbleglobe: a fresh run continued from its zone gets a fresh planet; lap 2 gadgets have 1.4× hp (${JSON.stringify(GLOBE.fresh)})`],
    [browserDesktop.count === 2 && browserDesktop.shown === 0, 'desktop: in a browser (no bridge) the Quit and Fullscreen buttons stay hidden'],
    [desk.titleShown && desk.titleCalls === 'fs,quit' && desk.blurred, 'desktop: with the bridge, the title card shows Fullscreen and Quit, and they call it'],
    [desk.pauseShown && desk.pauseCalls === 'fs,quit,quit', 'desktop: with the bridge, the pause card has Quit too'],
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
