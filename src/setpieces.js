// Land set pieces: big landmarks that belong to one land. First one: Volcano Land's fire geysers. Dark rock cones sit
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

const FIRE = ['#ffd23a', '#ff8a1f', '#ff5a14'];
const SMOKE = ['#3a3030', '#4a4040', '#5a504c'];

export class SetPieces {
  constructor(G) {
    this.G = G;
    this.kind = null;
    this.list = [];
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
}
