// Land set pieces: big landmarks that belong to one land. Volcano Land's fire geysers, Princess Kingdom's castle, and
// meteors falling onto the Moon and Mars.
// Fire geysers: Dark rock cones sit
// on the slopes above the lava; every so often one rumbles (its crater glows brighter, smoke and embers puff out) and
// then blows a tall pillar of fire straight up. Flying through the pillar scorches you; skimming past it, close but
// not in it, is a "Toasty!" near miss worth a few points. The effects are kept subtle: a warm glow, not a light show.
import * as THREE from 'three';
import { rand } from './texts.js';

export const GEYSER = {
  count: 5,              // vents kept around the player at once
  near: 260, far: 720,   // new vents appear this far ahead (out in the haze)
  drop: 1000,            // a vent this far behind is recycled
  dry: 6,                // only on rock at least this high above the lava
  idle: [5, 11],         // s between eruptions
  rumble: 1.6,           // s of warning (brighter crater, smoke, embers)
  blast: 2.4,            // s the pillar of fire lasts
  height: 110,           // how tall the pillar gets
  radius: 9,             // pillar radius that scorches
  dmg: 8,                // per scorch (x1.5 enemy damage = 12 hull), once per eruption
  nearMiss: 22,          // within this (but outside the pillar) while it blows: Toasty!
  nearScore: 15,
};

export const CASTLE = {
  near: 650, far: 950,    // a new castle appears this far ahead, out in the haze
  drop: 1600,             // and goes once it's this far behind
  half: 75,               // half the curtain walls' square
  slope: 30,              // the most the ground may rise and fall across its footprint
  wallH: 34, wallT: 8, base: 40,
  gateW: 36, gateH: 26,   // the way in
  towerR: 11, towerH: 80,
  keep: 44, keepH: 44, keepZ: -0.45, // the keep sits back, so there's room to climb over it after the gate
  dmg: 6,                 // a bump (x1.5 enemy damage = 9 hull), at most once per bumpEvery s
  bumpEvery: 1,
  gateScore: 50,
};

// Meteors (The Moon, Mars): every few seconds a burning rock streaks down at the ground somewhere ahead. A faint ring
// marks where it will land. Shoot it on the way down for points; left alone it digs a crater, and the blast hurts if
// you're close. Flying into one hurts too.
export const METEOR = {
  first: [3, 6],         // s before the first one in a land
  every: [5, 9],         // s between meteors
  max: 3,                // in the air at once
  ahead: [320, 700],     // where it lands, ahead of the player
  height: 420,           // starts this high above its landing spot
  speed: 95,             // m/s on the way down
  size: [5, 8],
  hp: 2,
  score: 20,             // shot down
  crater: [20, 7],       // radius, depth
  blast: 34,             // the impact hurts within this
  dmg: 8,                // x1.5 enemy damage = 12 hull (impact blast or ramming one)
};

const _local = new THREE.Vector3();
const FIRE = ['#ffd23a', '#ff8a1f', '#ff5a14'];
const SMOKE = ['#3a3030', '#4a4040', '#5a504c'];

export class SetPieces {
  constructor(G) {
    this.G = G;
    this.kind = null;
    this.list = [];
    this.meteors = [];
    this.meteorT = 0;
    this.meteorGeo = new THREE.DodecahedronGeometry(1, 0);
    this.meteorRock = new THREE.MeshLambertMaterial({ color: '#4a3a34', flatShading: true });
    this.meteorCore = new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 32);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.tip = false;
    this.rock = new THREE.MeshLambertMaterial({ color: '#2e2426', flatShading: true });
    this.rock2 = new THREE.MeshLambertMaterial({ color: '#3c2e2c', flatShading: true });
    this.coneGeo = new THREE.ConeGeometry(16, 22, 7, 1, true);
    this.lipGeo = new THREE.CylinderGeometry(5.2, 7, 3, 7, 1, true);
    this.mouthGeo = new THREE.CircleGeometry(5, 10);
    this.bumpGeo = new THREE.DodecahedronGeometry(1, 0);
    this.pillarGeo = new THREE.CylinderGeometry(1, 1.15, 1, 10, 1, true); // scaled by GEYSER.radius: what you see is what scorches
    this.pillarGeo.translate(0, 0.5, 0); // grows up from its base
  }

  // The current zone's set piece (null removes them all). Every zone entry starts afresh: the land under the old vents
  // was just reseeded, even when it's the same zone again (developer menu).
  configure(kind) {
    this.kind = kind || null;
    while (this.list.length) this.remove(this.list.length - 1);
    this.dropCastle();
    this.siteT = 0;
    while (this.meteors.length) this.dropMeteor(0);
    this.meteorT = rand(...METEOR.first);
  }

  get geysers() { return this.kind === 'geysers' ? this.list : []; }

  // Dry rock high enough above the lava sea, or null.
  ground(x, z) {
    const h = this.G.terrain.surfaceHeight(x, z), sea = this.G.world.seaLevel;
    return h >= sea + GEYSER.dry ? h : null;
  }

  spawnGeyser(x, z, h) {
    const g = new THREE.Group();
    g.position.set(x, h - 4, z); // sunk a little so it sits on a slope
    const cone = new THREE.Mesh(this.coneGeo, this.rock);
    cone.position.y = 11;
    cone.scale.set(1, 1, 1);
    g.add(cone);
    const lip = new THREE.Mesh(this.lipGeo, this.rock2);
    lip.position.y = 21.5;
    g.add(lip);
    for (let k = 0; k < 5; k++) { // a few boulders round the foot
      const b = new THREE.Mesh(this.bumpGeo, k % 2 ? this.rock : this.rock2);
      const a = (k / 5) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(12, 17);
      b.position.set(Math.cos(a) * r, rand(1, 3), Math.sin(a) * r);
      b.scale.setScalar(rand(2.5, 4.5));
      b.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      g.add(b);
    }
    // The crater: a dim orange glow that brightens while it rumbles.
    const glow = new THREE.MeshBasicMaterial({ color: '#ff5a14', transparent: true, opacity: 0.55, depthWrite: false });
    const mouth = new THREE.Mesh(this.mouthGeo, glow);
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.y = 22.6;
    g.add(mouth);
    // The pillar: a soft additive column under the particles, so the danger reads from far off.
    const fire = new THREE.MeshBasicMaterial({ color: '#ff8a1f', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const pillar = new THREE.Mesh(this.pillarGeo, fire);
    pillar.position.y = 22.6;
    pillar.scale.set(GEYSER.radius, 0.01, GEYSER.radius);
    pillar.visible = false;
    g.add(pillar);
    g.rotation.y = rand(0, 6);
    this.G.scene.add(g);
    this.list.push({
      group: g, glow, fire, pillar, state: 'idle', t: rand(1, GEYSER.idle[1]), hit: false, close: false,
      mouth: new THREE.Vector3(x, h - 4 + 22.6, z),
    });
  }

  remove(i) {
    const v = this.list[i];
    this.G.scene.remove(v.group);
    v.glow.dispose(); v.fire.dispose();
    this.list.splice(i, 1);
  }

  // Top up the vents out of sight ahead, so the land always has a few on its slopes.
  topUp() {
    if (this.list.length >= GEYSER.count) return;
    const p = this.G.player;
    const f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const side = new THREE.Vector3(-f.z, 0, f.x);
    for (let tries = 0; tries < 6 && this.list.length < GEYSER.count; tries++) {
      const d = rand(GEYSER.near, GEYSER.far), s = rand(-0.8, 0.8) * d;
      const x = p.pos.x + f.x * d + side.x * s, z = p.pos.z + f.z * d + side.z * s;
      const h = this.ground(x, z);
      if (h === null) continue;
      if (this.list.some((v) => (v.mouth.x - x) ** 2 + (v.mouth.z - z) ** 2 < 140 ** 2)) continue; // keep them apart
      this.spawnGeyser(x, z, h);
    }
  }

  update(dt) {
    if (this.kind === 'castle') { this.updateCastle(dt); return; }
    if (this.kind === 'meteors') { this.updateMeteors(dt); return; }
    if (this.kind !== 'geysers') return;
    const G = this.G, p = G.player;
    if (!G.terrain.stale) this.topUp(); // not while a new land is still forming under the fog bank
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      const dx = v.mouth.x - p.pos.x, dz = v.mouth.z - p.pos.z;
      if (dx * dx + dz * dz > GEYSER.drop ** 2) { this.remove(i); continue; }
      v.t -= dt;
      if (v.state === 'idle') {
        v.glow.opacity = 0.45 + 0.1 * Math.sin(G.time * 1.3 + i);
        if (v.t <= 0) { v.state = 'rumble'; v.t = GEYSER.rumble; }
      } else if (v.state === 'rumble') {
        const k = 1 - v.t / GEYSER.rumble;
        v.glow.opacity = 0.55 + 0.4 * k;
        // Particle counts are per second (emit rounds a fraction up by chance), so the density doesn't follow the frame rate.
        G.fx.emit(v.mouth, 15 * dt, { colors: SMOKE, speed: 4, up: 14, life: 1.6, size: 10, drag: 0.8 });
        G.fx.emit(v.mouth, 18 * k * dt, { colors: FIRE, speed: 10, up: 22, life: 0.7, size: 3, gravity: -30 });
        if (v.t <= 0) { v.state = 'blast'; v.t = GEYSER.blast; v.hit = false; v.close = false; v.pillar.visible = true; }
      } else if (v.state === 'blast') {
        const age = GEYSER.blast - v.t, grow = Math.min(1, age / 0.35), fade = Math.min(1, v.t / 0.5);
        v.pillar.scale.y = GEYSER.height * grow;
        v.fire.opacity = 0.32 * fade;
        v.glow.opacity = 0.95;
        G.fx.emit(v.mouth, 90 * dt, { colors: FIRE, speed: 9, up: GEYSER.height * 0.75, life: 1.1, size: 8, drag: 0.5 });
        G.fx.emit(v.mouth, 12 * dt, { colors: SMOKE, speed: 6, up: GEYSER.height * 0.6, life: 1.8, size: 13, drag: 0.6 });
        this.touch(v, grow * fade);
        if (v.t <= 0) { v.state = 'idle'; v.t = rand(...GEYSER.idle); v.pillar.visible = false; v.fire.opacity = 0; }
      }
    }
  }

  // The player against one erupting pillar: inside it scorches (once per eruption), close beside it is a near miss.
  touch(v, strength) {
    const G = this.G, p = G.player;
    if (p.dead || strength < 0.3) return;
    const up = p.pos.y - v.mouth.y;
    if (up < -4 || up > GEYSER.height * strength + 6) return;
    const r = Math.hypot(p.pos.x - v.mouth.x, p.pos.z - v.mouth.z);
    if (r < GEYSER.radius + (p.sizeScale || 1)) {
      if (v.hit) return;
      v.hit = true;
      p.damage(GEYSER.dmg);
      G.fx.emit(p.pos, 20, { colors: FIRE, speed: 25, life: 0.6, size: 5 });
      if (!this.tip) { this.tip = true; G.ui.notify('Fire geysers scorch! Watch for a glowing, smoking crater and fly round it.', 'warn', 4, 1); }
    } else if (r < GEYSER.nearMiss && !v.close && !v.hit) {
      v.close = true;
      G.score += GEYSER.nearScore;
      G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${GEYSER.nearScore} Toasty!`);
    }
  }

  // ---- Princess Kingdom: the castle ------------------------------------------------------------------------------
  // One huge fairy-tale castle at a time, out ahead of you: a square of pink curtain walls with a round tower at each
  // corner, a tall keep in the middle and a gate in the front wall. The stone is solid (a bump costs a little hull and
  // shoves you clear, it never wrecks the plane); flying in through the gate is a "Royal welcome!" bonus, once.

  get castleInfo() { return this.castle; }

  dropCastle() {
    const c = this.castle;
    if (!c) return;
    this.G.scene.remove(c.group);
    c.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of c.mats) m.dispose();
    this.castle = null;
  }

  placeCastle() {
    const p = this.G.player, f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    for (let tries = 0; tries < 6; tries++) {
      const d = rand(CASTLE.near, CASTLE.far), s = rand(-0.5, 0.5) * d;
      const x = p.pos.x + f.x * d - f.z * s, z = p.pos.z + f.z * d + f.x * s;
      // The footprint's corners and middle: on dry ground, and not on a steep hillside.
      const hs = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => this.G.terrain.surfaceHeight(x + a * CASTLE.half, z + b * CASTLE.half));
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (lo < this.G.world.seaLevel + 2 || hi - lo > CASTLE.slope) continue;
      // Face the gate back toward where you're coming from, so the way in is the first thing you see, and make sure
      // the ground in front of the gate is level with it (not burying the way in, nor leaving it on stilts).
      const y = (lo + hs[0]) / 2, yaw = Math.atan2(p.pos.x - x, p.pos.z - z), gz = CASTLE.half + 12;
      if (Math.abs(this.G.terrain.surfaceHeight(x + Math.sin(yaw) * gz, z + Math.cos(yaw) * gz) - y) > 6) continue;
      this.buildCastle(x, y, z, yaw);
      return;
    }
  }

  buildCastle(x, y, z, yaw) {
    const g = new THREE.Group(), mats = [];
    const mat = (color, o = {}) => { const m = o.basic ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: !o.basic }) : new THREE.MeshLambertMaterial({ color, flatShading: true }); mats.push(m); return m; };
    const stone = mat('#f2d8e4'), stone2 = mat('#e6c2d4'), roof = mat('#d9649e'), roof2 = mat('#b84f86'), gold = mat('#f0c860');
    const glass = mat('#ffe6a8', { basic: true, opacity: 0.75 }), flagM = mat('#ff7fb8', { basic: true, side: THREE.DoubleSide });
    const add = (geo, m, px, py, pz, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.y = ry; g.add(o); return o; };
    const C = CASTLE, H = C.half, W = C.wallH, T = C.wallT, B = C.base; // walls go down B below the ground, for slopes
    const solids = [], flags = [];
    const box = (cx, cz, sx, sz, top, bottom = -B) => solids.push({ box: true, x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2, y0: bottom, y1: top });
    const crenels = (len, px, pz, alongX, top) => { // little battlements along a wall top
      for (let t = -len / 2 + 3; t < len / 2 - 2; t += 7) add(new THREE.BoxGeometry(3.4, 3.4, T + 0.6), stone2, alongX ? px + t : px, top + 1.7, alongX ? pz : pz + t, alongX ? 0 : Math.PI / 2);
    };
    // Curtain walls. The front one (+z, the gate side) is two halves and a lintel over the gate.
    const gw = C.gateW, gh = C.gateH, side = (2 * H - gw) / 2;
    for (const sx of [-1, 1]) {
      const cx = sx * (gw / 2 + side / 2);
      add(new THREE.BoxGeometry(side, W + B, T), stone, cx, (W - B) / 2, H); box(cx, H, side, T, W);
    }
    add(new THREE.BoxGeometry(gw, W - gh, T), stone, 0, (W + gh) / 2, H); box(0, H, gw, T, W, gh);
    add(new THREE.BoxGeometry(gw + 6, 2.4, T + 1.6), gold, 0, gh + 1.2, H); // gilded arch line over the gate
    crenels(2 * H, 0, H, true, W);
    add(new THREE.BoxGeometry(2 * H, W + B, T), stone, 0, (W - B) / 2, -H); box(0, -H, 2 * H, T, W); crenels(2 * H, 0, -H, true, W);
    for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(T, W + B, 2 * H), stone, sx * H, (W - B) / 2, 0); box(sx * H, 0, T, 2 * H, W); crenels(2 * H, sx * H, 0, false, W); }
    // Towers: round, with a pointed roof, a gold finial and a pennant.
    const tower = (tx, tz, r, h, rm) => {
      add(new THREE.CylinderGeometry(r, r * 1.08, h + B, 10), stone, tx, (h - B) / 2, tz);
      add(new THREE.CylinderGeometry(r * 1.18, r * 1.18, 3, 10), stone2, tx, h + 1.5, tz);
      add(new THREE.ConeGeometry(r * 1.3, r * 3.2, 10), rm, tx, h + 3 + r * 1.6, tz);
      add(new THREE.SphereGeometry(1.4, 6, 4), gold, tx, h + 3 + r * 3.2 + 0.8, tz);
      const pole = h + 3 + r * 3.2 + 1.6;
      add(new THREE.CylinderGeometry(0.25, 0.25, 7, 4), gold, tx, pole + 3.5, tz);
      const fl = add(new THREE.PlaneGeometry(7, 3.2), flagM, tx + 3.6, pole + 5.4, tz);
      flags.push({ mesh: fl, phase: rand(0, 6), x: tx });
      for (let k = 0; k < 3; k++) { // a ring of warm windows, faint
        const a = (k / 3) * Math.PI * 2 + 0.5, wy = h * (0.45 + 0.2 * k);
        add(new THREE.BoxGeometry(1.6, 3, 0.4), glass, tx + Math.sin(a) * (r + 0.1), wy, tz + Math.cos(a) * (r + 0.1), a);
      }
      solids.push({ x: tx, z: tz, r: r * 1.15, y0: -B, y1: h + 3 + r * 2.2 }); // the roof's lower half counts too
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tower(sx * H, sz * H, C.towerR, C.towerH, roof);
    for (const sx of [-1, 1]) tower(sx * (gw / 2 + 5), H + 1, 6, W + 12, roof2); // the gatehouse towers
    // The keep in the courtyard: a big block with its own tall tower.
    const K = C.keep;
    add(new THREE.BoxGeometry(K, C.keepH + B, K), stone2, 0, (C.keepH - B) / 2, H * C.keepZ); box(0, H * C.keepZ, K, K, C.keepH);
    crenels(K, 0, H * C.keepZ + K / 2, true, C.keepH);
    tower(0, H * C.keepZ, 10, C.keepH + 40, roof);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.G.scene.add(g);
    this.castle = { group: g, mats, solids, flags, pos: g.position, yaw, welcomed: false, bumpT: 0, inside: false, prevZ: null };
  }

  // The player in the castle's own frame (gate on +z).
  castleLocal(c, out) {
    const p = this.G.player.pos, dx = p.x - c.pos.x, dz = p.z - c.pos.z, cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw);
    out.set(dx * cs + dz * sn, p.y - c.pos.y, -dx * sn + dz * cs);
    return out;
  }

  updateCastle(dt) {
    const G = this.G, p = G.player;
    let c = this.castle;
    if (c && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > CASTLE.drop) { this.dropCastle(); c = null; }
    if (!c) { // look for a site twice a second, not every frame
      if (!G.terrain.stale && (this.siteT = (this.siteT || 0) - dt) <= 0) { this.siteT = 0.5; this.placeCastle(); }
      return;
    }
    for (const f of c.flags) f.mesh.rotation.y = 0.25 * Math.sin(G.time * 2.2 + f.phase); // a lazy flutter
    c.bumpT = Math.max(0, c.bumpT - dt);
    if (p.dead) { c.prevZ = null; return; }
    const L = this.castleLocal(c, _local), r = 2.5 * (p.sizeScale || 1);
    // The gate: crossing the front wall's line inside the opening, heading in.
    const C = CASTLE;
    if (c.prevZ !== null && c.prevZ > C.half && L.z <= C.half && Math.abs(L.x) < C.gateW / 2 && L.y < C.gateH && L.y > -2 && !c.welcomed) {
      c.welcomed = true;
      G.score += C.gateScore;
      G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${C.gateScore} Royal welcome!`);
      G.fx.emit(p.pos, 40, { colors: ['#ff9ccf', '#ffffff', '#f0c860'], speed: 22, life: 1.2, size: 4, gravity: -8 });
    }
    c.prevZ = L.z;
    // Solid stone: push out of anything you're inside, with a small knock once a second.
    for (const s of c.solids) {
      if (L.y < s.y0 - r || L.y > s.y1 + r) continue;
      let px = 0, pz = 0;
      if (s.box) {
        if (L.x < s.x0 - r || L.x > s.x1 + r || L.z < s.z0 - r || L.z > s.z1 + r) continue;
        const outs = [[s.x0 - r - L.x, 0], [s.x1 + r - L.x, 0], [0, s.z0 - r - L.z], [0, s.z1 + r - L.z]];
        const top = s.y1 + r - L.y; // over the wall top is a way out too
        let best = outs[0];
        for (const o of outs) if (Math.abs(o[0] + o[1]) < Math.abs(best[0] + best[1])) best = o;
        if (top < Math.abs(best[0] + best[1])) { p.pos.y += top; this.castleLocal(c, L); this.bump(c); continue; }
        [px, pz] = best;
      } else {
        const dx = L.x - s.x, dz = L.z - s.z, d = Math.hypot(dx, dz), rr = s.r + r;
        if (d >= rr) continue;
        const k = d > 1e-3 ? (rr - d) / d : rr;
        px = d > 1e-3 ? dx * k : rr; pz = d > 1e-3 ? dz * k : 0;
      }
      // Back to the world's frame.
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      p.pos.x += px * cs + pz * sn; p.pos.z += -px * sn + pz * cs;
      this.castleLocal(c, L);
      this.bump(c);
    }
  }

  bump(c) {
    if (c.bumpT > 0) return;
    c.bumpT = CASTLE.bumpEvery;
    const G = this.G;
    G.player.damage(CASTLE.dmg);
    G.fx.emit(G.player.pos, 18, { colors: ['#f2d8e4', '#e6c2d4', '#ffffff'], speed: 20, life: 0.8, size: 4 });
    if (!this.castleTip) { this.castleTip = true; G.ui.notify('Castle walls are solid! Try the front gate instead.', 'warn', 4, 1); }
  }

  // ---- The Moon and Mars: meteors ---------------------------------------------------------------------------------
  get meteorList() { return this.meteors; }

  // target: where it will land (world x, z); defaults to a spot ahead of the player.
  spawnMeteor(tx, tz) {
    const G = this.G, p = G.player;
    if (tx === undefined) {
      const f = p.forward.clone().setY(0);
      if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
      f.normalize();
      const d = rand(...METEOR.ahead), s = rand(-0.4, 0.4) * d;
      tx = p.pos.x + f.x * d - f.z * s; tz = p.pos.z + f.z * d + f.x * s;
    }
    const ty = G.terrain.surfaceHeight(tx, tz), target = new THREE.Vector3(tx, ty, tz);
    // It comes in at a slant from a random side, so the streak reads against the sky.
    const a = rand(0, Math.PI * 2), slant = 0.55;
    const from = target.clone().add(new THREE.Vector3(Math.cos(a) * METEOR.height * slant, METEOR.height, Math.sin(a) * METEOR.height * slant));
    const vel = target.clone().sub(from).normalize().multiplyScalar(METEOR.speed);
    const size = rand(...METEOR.size);
    const g = new THREE.Group();
    const rock = new THREE.Mesh(this.meteorGeo, this.meteorRock);
    rock.scale.set(size, size * 0.85, size * 1.1);
    g.add(rock);
    const core = new THREE.Mesh(this.meteorGeo, this.meteorCore); // a soft hot glow around it
    core.scale.setScalar(size * 1.35);
    g.add(core);
    g.position.copy(from);
    G.scene.add(g);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ff9a4a', transparent: true, opacity: 0, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.set(tx, ty + 0.6, tz);
    ring.scale.setScalar(METEOR.blast);
    G.scene.add(ring);
    const total = from.distanceTo(target) / METEOR.speed;
    this.meteors.push({ group: g, rock, pos: g.position, vel, target, size, hp: METEOR.hp, ring, ringMat, t: 0, total, trailAcc: 0 });
    return this.meteors.at(-1);
  }

  dropMeteor(i) {
    const m = this.meteors[i];
    this.G.scene.remove(m.group);
    this.G.scene.remove(m.ring);
    m.ringMat.dispose();
    this.meteors.splice(i, 1);
  }

  updateMeteors(dt) {
    const G = this.G, p = G.player;
    if (!G.terrain.stale && (this.meteorT -= dt) <= 0) {
      this.meteorT = rand(...METEOR.every);
      if (this.meteors.length < METEOR.max && !p.dead) this.spawnMeteor();
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      m.pos.addScaledVector(m.vel, dt);
      m.rock.rotation.x += 2.1 * dt; m.rock.rotation.z += 1.3 * dt;
      // The landing ring fades in as it comes down (faint, a hint rather than a siren).
      m.ringMat.opacity = 0.35 * Math.min(1, m.t / m.total);
      // A short warm trail, emitted per second.
      G.fx.emit(m.pos, 24 * dt, { colors: ['#ffd23a', '#ff8a1f', '#a05a3a'], speed: 3, life: 0.7, size: m.size * 0.7, drag: 1.5 });
      G.fx.emit(m.pos, 6 * dt, { colors: ['#5a4a44', '#6a5a50'], speed: 2, life: 1.4, size: m.size, drag: 1 });
      if (!p.dead && m.pos.distanceTo(p.pos) < m.size + 3 * (p.sizeScale || 1)) { // rammed
        p.damage(METEOR.dmg);
        G.fx.explosion(m.pos);
        this.dropMeteor(i);
        continue;
      }
      let shot = false;
      for (let b = p.bullets.length - 1; b >= 0; b--) {
        if (p.bullets[b].pos.distanceToSquared(m.pos) < (m.size + 2) ** 2) {
          m.hp -= p.bullets[b].dmg || 1;
          p.removeBullet(b);
          G.fx.sparkle(m.pos, '#ffb070');
          if (m.hp <= 0) { shot = true; break; }
        }
      }
      if (shot) {
        G.score += METEOR.score;
        G.fx.explosion(m.pos);
        G.fx.emit(m.pos, 30, { colors: ['#5a4a44', '#7a6a58', '#ff8a1f'], speed: 35, life: 1.4, size: 4, gravity: -20 });
        G.fx.popText(m.pos.clone(), `+${METEOR.score} Meteor smashed!`);
        G.audio.explode?.();
        if (!this.meteorTip) { this.meteorTip = true; G.ui.notify('Nice shot! Meteors are worth points if you hit them before they land.', 'info', 4, 1); }
        this.dropMeteor(i);
        continue;
      }
      if (m.pos.y <= m.target.y + m.size * 0.3 || m.t >= m.total) this.impact(i);
    }
  }

  impact(i) {
    const G = this.G, p = G.player, m = this.meteors[i], at = m.target;
    G.terrain.deform(at.x, at.z, ...METEOR.crater);
    G.fx.explosion(at);
    G.fx.emit(at, 60, { colors: ['#8a7a6a', '#6a5a50', '#a89888'], speed: 40, life: 2, size: 9, up: 20, gravity: -15 });
    const d = p.pos.distanceTo(at);
    if (d < 260) { G.shake?.(0.6 * (1 - d / 260), 0.35); G.audio.explode?.(); }
    if (!p.dead && d < METEOR.blast) {
      p.damage(METEOR.dmg);
      if (!this.meteorHitTip) { this.meteorHitTip = true; G.ui.notify('Meteors leave craters! Shoot them down, or steer clear of the glowing rings.', 'warn', 4, 1); }
    }
    this.dropMeteor(i);
  }
}
