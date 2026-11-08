// Grumbleglobe, the Planet With Opinions: the world boss of its own zone (zones.js `siege`). The whole small planet
// is the boss. It never moves; it spins, and its gadgets do the fighting: red turrets, three cyan shield generators,
// orange magma vents, yellow sweeper towers, the one angry eye and a crown on the north pole. Every gadget is a boss
// part (Enemies.damagePart / breakPart): each hit drains the bar by part.mult = worth / hp, so a gadget is worth its
// share of the bar however hard it is to break. Bare rock is armour 0: shoot it and nothing happens.
// The planet is one entity in Enemies.list (e.planet = the Globe) that runs its own update instead of bossBehave:
// the sphere is solid (you crash into it; bullets and orbs stop at it), the gadgets attack, phases change at 66% and
// 33%, and at 0 it breaks up into shootable rubble (Asteroids.spawn). Timers are enemy-time s (Enemies.update's dt, at
// PACE and the Slow-Mo / Time Freeze scale); collisions and bullets use real time, so they still work frozen.
import * as THREE from 'three';
import { makeCrown } from './models.js';
import { pick, rand } from './texts.js';
import { makeMarker, PACE } from './enemies.js';
import { heightAt } from './world.js';
import { objective } from './objectives.js';

const R = 160; // planet radius (m)
export const GLOBE = {
  R, ahead: 760, floorGap: 200, top: 1150 - R - 150, // spawn: 760 m ahead at your altitude, clamped between floor and ceiling
  spin: 0.035, spinAwake: 0.055,                     // rad/s about world up (phase 2+: faster)
  crashPad: 4, ghostPad: 3,                          // closer than R + crashPad crashes; ghost / god mode skims at R + ghostPad
  respawn: 450, breather: 500,                       // respawn distance from the centre; farther than breather: a breather
  grow: 1.2,                                         // s to scale in on arrival
  phases: [0.66, 0.33],                              // bar fractions where phase 2 and 3 start
  lapHp: 1.4, easier: 0.7,                           // gadget hp on lap 2+; the persuasion 'easier' step
  reward: 1.5,                                       // × the regular boss formula
};
// The gadgets (count = entries in LAYOUT). worth: how much of the 100-point bar it drains in all; they add up to 112, so
// a few can be skipped, but never the generators (the eye is shielded until they're gone) nor the eye (82 without it).
const KINDS = {
  turret: { hp: 4, worth: 6, score: 40, icon: '🔫', line: 'Turret popped! The planet felt that.' },
  generator: { hp: 8, worth: 8, score: 60, icon: '🛡', line: 'Shield generator down! {n} to go.' },
  vent: { hp: 3, worth: 3, score: 40, icon: '🌋', line: 'Vent plugged! Burp denied.' },
  sweeper: { hp: 6, worth: 5, score: 40, icon: '🌀', line: 'Sweeper snapped! Hair day: ruined.' },
  eye: { hp: 20, worth: 30, score: 40, line: 'The eye is out! It can\'t see you now. It can still feel you.' },
  crown: { hp: 10, worth: 0, score: 40, line: 'CROWN KNOCKED OFF! Every gadget takes 30% more damage now. The planet is mortified.' },
};
// Where they sit: [kind, longitude°, latitude°]. Longitude 0 is the face, turned toward you when it arrives.
const LAYOUT = [
  ['eye', 0, 0], ['crown', 0, 90],
  ['turret', 30, 40], ['turret', 90, -40], ['turret', 150, 40], ['turret', 210, -40], ['turret', 270, 40], ['turret', 330, -40],
  ['generator', 120, 25], ['generator', 200, -25], ['generator', 280, 25],
  ['vent', 60, 30], ['vent', 60, -30], ['vent', 240, 30], ['vent', 240, -30],
  ['sweeper', 40, 0], ['sweeper', -40, 0],
];
// Turrets: an aimed orb every `every` s, only at you within `range` m and above its horizon (normal · dir > horizon); the
// barrel tip glows `wind` s first. At most `perWindow` turrets fire per `every` s. Phase 2+: two shots, `burstGap` apart.
// Orbs live 7 s (fireOrb's default).
const TURRET = { speed: 80, dmg: 10, lead: 0.5, every: 3.2, first: 1.5, wind: 0.6, range: 450, horizon: 0.15, perWindow: 3, burstGap: 0.25, color: '#ff4d4d', size: 1.2 };
// Vents: a column warning (r, h) for `warn` s, then a `blast` s eruption (dmg once) along the surface normal. Only with you
// within range (phase 3: rangeMad) of it; cooldown cd ± jitter (phase 3 × madK); never two starting within `gap` s.
const VENT = { r: 14, h: 130, warn: 1.4, blast: 1.2, dmg: 15, range: 260, rangeMad: 320, cd: 7, jitter: 1.5, madK: 0.7, gap: 2 };
// Sweepers: a `len` m bar spinning `up` m over the surface; touching it (within `hit` m) costs dmg, at most every cd s.
const SWEEP = { len: 120, up: 22, rate: 0.6, rateAwake: 0.8, dmg: 12, hit: 5, cd: 1.5, whir: 150 };
// The eye: a shield bubble (r) while any generator stands; then the lid opens `open` s (phase 3: openMad) every `every`
// s, after `twitch` s of twitching and creaking. Phase 3, once per opening: a glare (column warning, then a beam).
const EYE = { shield: 45, every: 9, open: 4, openMad: 5, twitch: 1, glareR: 10, glareWarn: 1.2, glareBeam: 0.4, glareDmg: 20, glareAhead: 1, lidOpen: -1.9 };
const DRONES = 3, ROCKS = { n: 2, every: 12, max: 2 };
const RUBBLE = { n: 8, size: [12, 14], speed: 15, safe: 3 };
const DYING = { chain: 1.4, split: 1.8 }; // s for every gadget left to go off, one by one; s until it splits

const TEXT = {
  name: 'Grumbleglobe, the Planet With Opinions',
  arrive: '⚠ THE WHOLE PLANET IS THE BOSS: Grumbleglobe! It is NOT a morning planet.',
  phase2: 'Grumbleglobe is properly awake now. It\'s launching drones. From its pores.',
  phase3: 'MELTDOWN! The planet is cracking. Its eye stays open longer: finish it!',
  shieldDown: 'SHIELD DOWN! Its eye is open for business. Wait for it to blink.',
  firstEye: 'Right in the eye! It\'s really upset now.',
  rock: 'That\'s just rock. Shoot the gadgets!',
  far: 'Out of range. The planet is fuming quietly.',
  crash: 'You hugged the planet. It did not hug back.',
  easier: 'The planet pulled a tectonic muscle. All gadgets -30% HP.',
  wake: 'Grumbleglobe woke up from its nap. It remembers everything.',
  breakup: 'Grumbleglobe is falling apart! Shoot the rubble if it bothers you.',
  taunts: ['Grumbleglobe: "Get off my atmosphere."', '"I\'m not round. I\'m big-boned."', '"I have one moon and it never calls."', '"Do you know how long it took to grow these turrets?"', '"Stop orbiting me. It\'s weird."'],
};

const Y = new THREE.Vector3(0, 1, 0), TAU = Math.PI * 2, DEG = Math.PI / 180;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3(), _s0 = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

// Closest approach of segment p0-p1 (a bullet's last frame, say) to segment a-b: the squared distance, and in SEG.s the
// fraction along p0-p1 where it happens. (Ericson, Real-Time Collision Detection 5.1.9.)
const SEG = { s: 0 };
function segSeg(p0, p1, a, b) {
  const d1 = _d1.subVectors(p1, p0), d2 = _d2.subVectors(b, a), r = _r.subVectors(p0, a);
  const A = d1.dot(d1), E = d2.dot(d2), F = d2.dot(r), EPS = 1e-9;
  let s = 0, t = 0;
  if (A > EPS || E > EPS) {
    if (A <= EPS) t = clamp(F / E, 0, 1);
    else {
      const C = d1.dot(r);
      if (E <= EPS) s = clamp(-C / A, 0, 1);
      else {
        const B = d1.dot(d2), den = A * E - B * B;
        s = den > EPS ? clamp((B * F - C * E) / den, 0, 1) : 0;
        t = (B * s + F) / E;
        if (t < 0) { t = 0; s = clamp(-C / A, 0, 1); } else if (t > 1) { t = 1; s = clamp((B - C) / A, 0, 1); }
      }
    }
  }
  SEG.s = s;
  const x = p0.x + d1.x * s - (a.x + d2.x * t), y = p0.y + d1.y * s - (a.y + d2.y * t), z = p0.z + d1.z * s - (a.z + d2.z * t);
  return x * x + y * y + z * z;
}
// Where along p0-p1 (0..1) it first enters the sphere (c, r): 0 if it starts inside, Infinity if it never does.
function segSphere(p0, p1, c, r) {
  const d = _d1.subVectors(p1, p0), m = _r.subVectors(p0, c);
  const k = m.dot(m) - r * r;
  if (k <= 0) return 0;
  const a = d.dot(d), b = m.dot(d), disc = b * b - a * k;
  if (a < 1e-9 || b > 0 || disc < 0) return Infinity;
  const s = (-b - Math.sqrt(disc)) / a;
  return s <= 1 ? s : Infinity;
}
const pointSeg = (p, a, b) => Math.sqrt(segSeg(p, p, a, b));

// ---------- the model ----------

const lambert = (color, emissive = '#000000', k = 0) => new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: k, flatShading: true, fog: false });
const basic = (color, opacity = 1, add = false) => new THREE.MeshBasicMaterial({ color, fog: false, transparent: opacity < 1 || add, opacity, depthWrite: !(opacity < 1 || add), blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// The surface's radius along unit vector n: a lumpy sphere, pulled in by up to 2% of R (the same at every face sharing a corner).
const lump = (n) => R * (1 - 0.01 * (1 + Math.sin(n.x * R * 0.05 + 1.3) * Math.sin(n.y * R * 0.07 + 0.4) * Math.sin(n.z * R * 0.06 + 2.1)));
const dirOf = (lon, lat) => new THREE.Vector3(Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG), Math.cos(lat * DEG) * Math.cos(lon * DEG));
// A group on the surface at (lon, lat), its local +Y along the surface normal.
function mount(body, lon, lat) {
  const g = new THREE.Group(), n = dirOf(lon, lat);
  g.position.copy(n).multiplyScalar(lump(n) - 0.5);
  g.quaternion.setFromUnitVectors(Y, n);
  body.add(g);
  return g;
}

// Each builder fills a gadget's group and returns its hit shape (a capsule: local points a, b and radius r) and its
// moving bits. `top`: where its marker floats (m along the normal).
const BUILD = {
  turret(g) {
    add(g, new THREE.CylinderGeometry(9, 10, 2, 10), lambert('#4a3a4a'), 0, 1, 0);
    add(g, new THREE.SphereGeometry(7, 12, 6, 0, TAU, 0, Math.PI / 2), lambert('#ff4d4d', '#ff4d4d', 0.25), 0, 2, 0);
    const pivot = new THREE.Group();
    pivot.position.y = 6;
    pivot.rotation.x = -Math.PI / 2; // the barrel (+Z) points out until it has something to aim at
    g.add(pivot);
    add(pivot, new THREE.CylinderGeometry(1.4, 1.9, 12, 8).rotateX(Math.PI / 2).translate(0, 0, 6), lambert('#3a2a3a'));
    const tip = add(pivot, new THREE.SphereGeometry(2.6, 10, 8), basic('#ff4d4d', 0.0001, true), 0, 0, 12.5);
    return { a: [0, 4], r: 9, top: 22, pivot, tip };
  },
  generator(g) {
    const cyan = lambert('#5ae0ff', '#5ae0ff', 0.35);
    add(g, new THREE.CylinderGeometry(6, 8, 4, 10), lambert('#3a4a5a'), 0, 2, 0);
    add(g, new THREE.CylinderGeometry(2, 3.8, 55, 8), cyan, 0, 27.5, 0);
    for (const y of [16, 31, 46]) add(g, new THREE.TorusGeometry(5.5, 0.9, 6, 16).rotateX(Math.PI / 2), basic('#bff4ff'), 0, y, 0);
    add(g, new THREE.SphereGeometry(5, 12, 8), basic('#5ae0ff'), 0, 58, 0);
    return { a: [0, 58], r: 6.5, top: 72 };
  },
  vent(g) {
    add(g, new THREE.TorusGeometry(9, 2.8, 6, 18).rotateX(Math.PI / 2), lambert('#ff7a2a', '#ff7a2a', 0.3), 0, 1.5, 0);
    const core = add(g, new THREE.CircleGeometry(8, 18).rotateX(-Math.PI / 2), basic('#3a1a10'), 0, 1.8, 0);
    const blast = add(g, new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0), basic('#ffb03a', 0.7, true), 0, 0, 0);
    blast.scale.set(VENT.r, VENT.h, VENT.r);
    blast.visible = false;
    return { a: [0, 3], r: 12, top: 18, core, blast };
  },
  sweeper(g) {
    add(g, new THREE.CylinderGeometry(2.5, 4, SWEEP.up, 8), lambert('#8a7a3a'), 0, SWEEP.up / 2, 0);
    const hub = new THREE.Group();
    hub.position.y = SWEEP.up;
    g.add(hub);
    add(hub, new THREE.SphereGeometry(4, 10, 8), lambert('#ffd23a', '#ffd23a', 0.4));
    add(hub, new THREE.BoxGeometry(SWEEP.len, 2.2, 2.2), basic('#ffd23a'));
    for (const x of [-1, 1]) add(hub, new THREE.SphereGeometry(2.4, 8, 6), basic('#fff2a0'), (x * SWEEP.len) / 2, 0, 0);
    return { a: [0, SWEEP.up + 2], r: 5.5, top: 36, hub };
  },
  eye(g) {
    // Local +Y looks out of the face; local -Z is up the planet (toward the north pole).
    add(g, new THREE.SphereGeometry(16, 20, 14), lambert('#ffffff', '#ffffff', 0.25), 0, 2, 0);
    add(g, new THREE.CircleGeometry(8, 24).rotateX(-Math.PI / 2), basic('#ff3ad0'), 0, 18.05, 0);
    add(g, new THREE.CircleGeometry(3.6, 16).rotateX(-Math.PI / 2), basic('#1a0a1a'), 0, 18.15, 0);
    const lid = new THREE.Group();
    lid.position.y = 2;
    g.add(lid);
    add(lid, new THREE.SphereGeometry(17.5, 20, 8, 0, TAU, 0, Math.PI / 2), lambert('#7a6a8a', '#2a2030', 1));
    const shield = add(g, new THREE.SphereGeometry(EYE.shield, 28, 18), basic('#5ae0ff', 0.2, true), 0, 0, 0);
    return { a: [2, 10], r: 15, top: 34, lid, shield };
  },
  crown(g) {
    g.add(makeCrown(5));
    return { a: [3, 12], r: 10, top: 30 };
  },
};

// The face around the eye (not shootable): an angry V of a brow above it and a frown below, and the "x" it gets at the end.
function buildFace(body) {
  const dark = lambert('#2a1a3a');
  const brow = mount(body, 0, 9);
  for (const s of [-1, 1]) { const b = add(brow, new THREE.BoxGeometry(22, 5, 6), dark, s * 11, 3, 0); b.rotation.y = s * 0.42; }
  const mouth = mount(body, 0, -16);
  const arc = Math.PI * 0.7;
  add(mouth, new THREE.TorusGeometry(26, 2.6, 6, 18, arc).rotateZ(Math.PI / 2 - arc / 2).rotateX(-Math.PI / 2), dark, 0, 1, 22);
  const x = mount(body, 0, 0);
  for (const s of [-1, 1]) { const b = add(x, new THREE.BoxGeometry(34, 4, 4), basic('#1a0a1a'), 0, 21, 0); b.rotation.y = s * Math.PI / 4; }
  x.visible = false;
  return x;
}

// Glowing cracks for the meltdown: wiggly lines over the surface, hidden until phase 3.
function buildCracks(body) {
  const g = new THREE.Group(), mat = basic('#ff3a1a', 0.9, true);
  for (let k = 0; k < 8; k++) {
    let p = dirOf(rand(0, 360), rand(-60, 60)), dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).cross(p).normalize();
    const pts = [p.clone().multiplyScalar(R + 0.5)];
    for (let i = 0; i < 9; i++) {
      dir.applyAxisAngle(p, rand(-0.7, 0.7));
      p = p.clone().addScaledVector(dir, 0.16).normalize();
      dir.sub(_a.copy(p).multiplyScalar(dir.dot(p))).normalize(); // keep it tangent
      pts.push(p.clone().multiplyScalar(R + 0.5));
    }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 1.6, 4), mat);
  }
  g.visible = false;
  body.add(g);
  return g;
}

function buildPlanet() {
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  // A lumpy, flat-shaded icosphere (see lump).
  const geo = new THREE.IcosahedronGeometry(R, 6), pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    v.multiplyScalar(lump(v));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const rock = lambert('#6a5a7a', '#2a2030', 1);
  add(body, geo, rock);
  add(group, new THREE.SphereGeometry(R * 1.12, 32, 16), new THREE.MeshBasicMaterial({ color: '#b88aff', transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false, fog: false }));
  return { group, body, rock };
}

// ---------- the boss ----------

export class Globe {
  constructor(G) {
    this.G = G;
    const p = G.player, f = _a.set(p.forward.x, 0, p.forward.z);
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    const C = p.pos.clone().addScaledVector(f, GLOBE.ahead);
    C.y = clamp(p.pos.y, heightAt(C.x, C.z) + R + GLOBE.floorGap, GLOBE.top); // the zone's own ground (its chunks may not be built yet)
    const { group, body, rock } = buildPlanet();
    group.position.copy(C);
    group.scale.setScalar(0.01);
    body.rotation.y = Math.atan2(p.pos.x - C.x, p.pos.z - C.z); // face first
    Object.assign(this, { group, body, rock, grow: 0, phase: 1, dozing: false, dying: -1, far: false, farAt: -99, shieldDown: false });
    this.xEye = buildFace(body);
    this.cracks = buildCracks(body);
    // Every gadget (and the crown) is a boss part: hit shape, surface normal (local), and its own state.
    const hpK = G.zones.lap > 1 ? GLOBE.lapHp : 1;
    this.parts = LAYOUT.map(([kind, lon, lat]) => {
      const obj = mount(body, lon, lat), K = KINDS[kind], s = BUILD[kind](obj);
      const hp = kind === 'crown' ? K.hp : K.hp * hpK;
      const part = {
        obj, name: kind, kind, hp, r: s.r, mult: K.worth / hp, counted: kind !== 'crown', ...s,
        a: new THREE.Vector3(0, s.a[0], 0), b: new THREE.Vector3(0, s.a[1], 0), wa: new THREE.Vector3(), wb: new THREE.Vector3(), mid: new THREE.Vector3(),
        n: dirOf(lon, lat), wn: new THREE.Vector3(), cd: 0, t: 0, state: 'quiet',
      };
      if (kind === 'turret') part.cd = TURRET.first;
      if (kind === 'vent') part.cd = rand(2, VENT.cd + VENT.jitter);
      if (kind === 'generator' || kind === 'eye') {
        part.marker = makeMarker();
        part.marker.userData.keep = true; // its material is shared with every enemy marker: disposeTree leaves it alone
        part.marker.position.y = s.top;
        obj.add(part.marker);
      }
      const scar = add(body, new THREE.CircleGeometry(kind === 'eye' ? 18 : 10, 10).rotateX(-Math.PI / 2), basic('#2a1e2e'));
      scar.position.copy(part.n).multiplyScalar(lump(part.n) + 0.3);
      scar.quaternion.setFromUnitVectors(Y, part.n);
      scar.visible = false;
      part.scar = scar;
      return part;
    });
    this.eye = this.parts.find((x) => x.kind === 'eye');
    this.eye.state = 'wait'; // lid shut while it scales in; then it snaps open and stares (shielded)
    this.window = { t: 0, n: 0 }; // turret fire window
    this.lastVent = -99;
    this.rocks = [];
    this.rockT = 0;
    this.tauntT = 6;
    this.tinkAt = -1;
    this.tips = {};
    this.glare = add(group, new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), basic('#ff6aff', 0.8, true));
    this.glare.visible = false;
    this.target0 = new THREE.Vector3();
    this.home = new THREE.Vector3();
    G.scene.add(group);
    // The entity Enemies knows: a boss that is never in BOSSES (no modifiers, no twins, no deck).
    this.e = {
      type: 'boss', kind: 'grumbleglobe', planet: this, mesh: group, pos: group.position, vel: new THREE.Vector3(), hp: 100, maxHp: 100,
      radius: R, t: 0, quest: true, boss: true, dead: false, enraged: false, chase: null, attacks: 0,
      def: { name: TEXT.name, short: 'Grumbleglobe', noun: 'Grumbleglobe', radius: R, dmg: 0 },
    };
    this.e.mesh.userData.parts = this.parts;
    G.enemies.list.push(this.e);
  }

  get k() { return this.group.scale.x; } // scale while it grows in (1 after)
  get C() { return this.group.position; }
  left(kind) { return this.parts.filter((x) => x.kind === kind && !x.broken).length; }
  gens() { return this.left('generator'); }
  eyeOpen() { return !this.gens() && !this.eye.broken && this.eye.state === 'open' && !this.dozing; }
  // A gadget you can hurt right now (homing, the objective marker): not the crown, an erupting vent, a shut or shielded eye.
  hurtable(x) { return !x.broken && x.kind !== 'crown' && !(x.kind === 'vent' && x.state !== 'quiet') && (x.kind !== 'eye' || this.eyeOpen()); }

  // Within crash distance of the surface?
  inside(at) { return _c.set(at.x, at.y, at.z).distanceTo(this.C) < R * this.k + GLOBE.crashPad; }

  // ---------- per frame (from Enemies.update). True once it has split (Enemies removes it). ----------
  update(dt, real) {
    const G = this.G, p = G.player, e = this.e;
    e.t += dt;
    this.grow = Math.min(1, this.grow + real / GLOBE.grow);
    this.group.scale.setScalar(Math.max(0.01, 1 - (1 - this.grow) ** 3));
    if (this.dying < 0) this.body.rotation.y += dt * (this.phase > 1 ? GLOBE.spinAwake : GLOBE.spin);
    for (const s of this.of('sweeper')) s.hub.rotation.y += dt * (this.phase > 1 ? SWEEP.rateAwake : SWEEP.rate);
    this.group.updateMatrixWorld(true);
    for (const x of this.parts) {
      x.wa.copy(x.a).applyMatrix4(x.obj.matrixWorld);
      x.wb.copy(x.b).applyMatrix4(x.obj.matrixWorld);
      x.mid.addVectors(x.wa, x.wb).multiplyScalar(0.5);
      x.wn.copy(x.n).applyQuaternion(this.body.quaternion);
    }
    const toP = _b.subVectors(p.pos, this.C), dist = toP.length();
    this.collide(toP, dist);
    this.blockShots();
    this.bullets(real);
    this.animate(real);
    if (this.dying >= 0) return this.crumble(real);
    if (e.hp <= 0) { this.startDying(); return false; }
    this.checkFar(dist);
    if (this.dozing || this.grow < 1) return false;
    this.phases();
    this.eyeStep(dt);
    this.sweepers(real);
    this.turrets(dt);
    this.vents(dt);
    if (p.dead) return false;
    this.spawns(dt);
    if (!this.far && (this.tauntT -= dt) <= 0) { this.tauntT = rand(12, 18); G.ui.notify(pick(TEXT.taunts), 'warn', 3.5, 0); }
    return false;
  }

  of(kind) { return this.parts.filter((x) => x.kind === kind && !x.broken); }

  // The planet is solid: fly into it and you crash (ghost or god mode skims the surface; just respawned too).
  // Drones and rocks are pushed back out of it.
  collide(toP, dist) {
    const G = this.G, p = G.player, Rk = R * this.k;
    for (const x of G.enemies.list) {
      if (x === this.e || x.dead) continue;
      _a.subVectors(x.pos, this.C);
      if (_a.length() < Rk + x.radius) x.pos.copy(this.C).addScaledVector(_a.normalize(), Rk + x.radius);
    }
    if (p.dead || dist >= Rk + GLOBE.crashPad * p.sizeScale) return;
    if (p.god || G.powerups.has('ghost') || p.invuln > 0 || p.grace > 0 || this.dying >= 0) {
      p.pos.copy(this.C).addScaledVector(toP.normalize(), Rk + GLOBE.ghostPad * p.sizeScale);
      return;
    }
    p.crash('ground', TEXT.crash);
  }

  // Enemy orbs that reach the sphere stop there: nothing shoots through the planet.
  blockShots() {
    const G = this.G, shots = G.enemies.shots, r2 = (R * this.k) ** 2;
    for (let i = shots.length - 1; i >= 0; i--) {
      if (shots[i].pos.distanceToSquared(this.C) > r2) continue;
      G.fx.emit(shots[i].pos, 6, { colors: ['#8a7a9a', '#5a4a6a'], speed: 12, life: 0.5, size: 5 });
      G.scene.remove(shots[i].mesh);
      shots.splice(i, 1);
    }
  }

  // Your bullets, swept over the last frame (gadgets are small and bullets fast): the first thing each one meets is a
  // gadget (Enemies.damagePart: gold sparkle, the bar drains), the shield bubble or bare rock (a grey tink, nothing).
  bullets(real) {
    const G = this.G, p = G.player, k = this.k, Rk = R * k, reach = (R + 80) * k, shield = this.gens() > 0 && !this.eye.broken && !this.dozing;
    for (let i = p.bullets.length - 1; i >= 0; i--) {
      const B = p.bullets[i], b1 = B.pos, b0 = _s0.copy(b1).addScaledVector(B.vel, -real);
      if (b1.distanceTo(this.C) > reach && b0.distanceTo(this.C) > reach) continue;
      let best = null, bs = Infinity;
      for (const x of this.parts) {
        if (x.broken) continue;
        const r = x.r * k;
        if (segSeg(b0, b1, x.wa, x.wb) < r * r && SEG.s < bs) { bs = SEG.s; best = x; }
      }
      if (shield) { const s = segSphere(b0, b1, this.eye.wa, EYE.shield * k); if (s < bs) { bs = s; best = 'shield'; } }
      const s = segSphere(b0, b1, this.C, Rk);
      if (s < bs) { bs = s; best = 'rock'; }
      if (!best) continue;
      const at = _a.lerpVectors(b0, b1, bs).clone();
      const dmg = (B.dmg || 1) * (this.e.vulnerable || 1);
      p.removeBullet(i);
      this.hit(best, at, dmg);
    }
  }

  hit(what, at, dmg) {
    const G = this.G;
    const bounce = what === 'rock' || what === 'shield' || this.dozing || this.dying >= 0 || this.grow < 1
      || (what.kind === 'vent' && what.state !== 'quiet') || (what.kind === 'eye' && !this.eyeOpen());
    if (bounce) {
      G.fx.sparkle(at, what === 'shield' ? '#a8f0ff' : '#9aa0a6');
      if (what === 'rock') G.fx.emit(at, 8, { colors: ['#6a5a7a', '#8a7a9a'], speed: 18, life: 0.6, size: 5 }); // a chip off the rock
      if (G.time - this.tinkAt > 0.06) { this.tinkAt = G.time; G.audio.tone(1800, 0.05, { type: 'triangle', vol: 0.04 }); }
      if (what === 'rock') this.tip('rock', TEXT.rock);
      return;
    }
    if (what.kind === 'eye') this.tip('eye', TEXT.firstEye, 'good');
    G.enemies.damagePart(this.e, what, dmg, at);
  }

  tip(id, text, kind = 'info') {
    if (this.tips[id]) return;
    this.tips[id] = true;
    this.G.ui.notify(text, kind, 3.5, 1);
  }

  // A gadget fell (from Enemies.breakPart, which already hid it, popped and exploded it at its base).
  broke(part) {
    const G = this.G, K = KINDS[part.kind];
    G.fx.explosion(part.mid);
    part.scar.visible = true;
    G.score += K.score;
    G.fx.popText(part.mid, `+${K.score}`);
    if (part.kind === 'crown') this.e.vulnerable = 1.3;
    if (part.kind === 'vent') this.quiet(part);
    if (part.kind === 'turret') part.tip.material.opacity = 0;
    const n = this.left(part.kind);
    if (part.kind === 'generator' && n === 0) return; // eyeStep announces the shield going down
    G.ui.notify(K.line.replace('{n}', n), 'good', 3, 1);
  }

  // ---------- attacks ----------

  // Can this gadget see you? Within range and above its horizon (so the far side never fires through the planet).
  sees(x, range, out = _c) {
    const p = this.G.player;
    out.subVectors(p.pos, x.mid);
    const d = out.length();
    return d < range && x.wn.dot(out) > TURRET.horizon * d;
  }

  // Each turret's x.cd counts down to its next shot; the last TURRET.wind s of it the barrel tip glows (and a rising tone
  // plays). It only winds up while it sees you and the window has room; losing sight of you calls the shot off.
  turrets(dt) {
    const G = this.G, p = G.player, W = this.window;
    if ((W.t += dt) >= TURRET.every) { W.t = 0; W.n = 0; }
    for (const x of this.of('turret')) {
      const vis = !p.dead && this.sees(x, TURRET.range);
      if (vis) { x.pivot.lookAt(p.pos); if (!x.seen) { x.seen = true; x.cd = Math.max(x.cd, TURRET.first); } }
      x.cd -= dt;
      if (x.shots > 0) { // mid-burst: the second shot of the pair
        if (x.cd <= 0) { if (vis) this.fire(x); x.shots--; x.cd = TURRET.every; }
      } else if (x.wind > 0 && !vis) { x.wind = 0; x.cd = TURRET.wind; } // lost you: it glows again before it fires
      else if (x.wind > 0) {
        if ((x.wind -= dt) <= 0) { this.fire(x); x.shots = this.phase > 1 ? 1 : 0; x.cd = x.shots ? TURRET.burstGap : TURRET.every; }
      } else if (x.cd <= TURRET.wind) {
        x.cd = TURRET.wind; // waiting for you, or for room in the window
        if (vis && x.seen && W.n < TURRET.perWindow) {
          W.n++;
          x.wind = TURRET.wind;
          G.audio.tone(420, TURRET.wind, { type: 'sine', vol: 0.04, slide: 700 });
        }
      }
      x.tip.material.opacity = x.wind > 0 ? 0.35 + 0.65 * (1 - x.wind / TURRET.wind) : x.shots > 0 ? 0.8 : 0.0001;
      x.tip.scale.setScalar(x.wind > 0 ? 1 + 0.6 * (1 - x.wind / TURRET.wind) : 1);
    }
  }

  fire(x) {
    const G = this.G, p = G.player, from = x.tip.getWorldPosition(new THREE.Vector3());
    const t = from.distanceTo(p.pos) / (TURRET.speed * PACE); // real s to reach you: orbs fly at PACE
    const to = p.pos.clone().addScaledVector(p.forward, p.speed * t * TURRET.lead).sub(from);
    G.enemies.fireOrb(from, to, TURRET.speed, TURRET.dmg, TURRET.color, TURRET.size).owner = this.e;
    G.audio.tone(160, 0.2, { type: 'square', vol: 0.05, slide: -60 });
    this.e.attacks++;
  }

  vents(dt) {
    const G = this.G, p = G.player, mad = this.phase > 2, range = mad ? VENT.rangeMad : VENT.range;
    for (const x of this.of('vent')) {
      if (x.state === 'quiet') {
        x.cd -= dt;
        if (x.cd > 0 || p.dead || this.e.t - this.lastVent < VENT.gap || p.pos.distanceTo(x.wa) > range) continue;
        this.lastVent = this.e.t;
        x.state = 'warn';
        x.hz = G.enemies.warn(_a.copy(x.wa).addScaledVector(x.wn, VENT.h / 2), VENT.r, '#ff7a2a', VENT.warn, () => this.blast(x), { shape: 'column', owner: this.e, h: VENT.h, dir: x.wn });
        G.audio.tone(55, VENT.warn, { type: 'sawtooth', vol: 0.05, slide: 30 }); // the rumble
        this.e.attacks++;
      } else if (x.state === 'warn') {
        x.hz.pos.copy(x.wa).addScaledVector(x.wn, VENT.h / 2); // the column rides the spin
        x.hz.mesh.quaternion.setFromUnitVectors(Y, x.wn);
      } else if (x.state === 'blast') {
        x.t -= dt;
        // Once per eruption, if you're in the column (a barrel roll still dodges it: Player.damage).
        if (!x.burnt && pointSeg(p.pos, x.wa, _a.copy(x.wa).addScaledVector(x.wn, VENT.h)) < VENT.r + 4 * p.sizeScale) { x.burnt = true; p.damage(VENT.dmg); }
        if (x.t <= 0) { this.quiet(x); x.cd = (VENT.cd + rand(-VENT.jitter, VENT.jitter)) * (mad ? VENT.madK : 1); }
      }
    }
  }

  blast(x) {
    const G = this.G;
    if (x.broken || this.dozing) return;
    Object.assign(x, { state: 'blast', t: VENT.blast, burnt: false, hz: null });
    x.blast.visible = true;
    G.audio.whoosh();
    G.audio.noise(0.9, { vol: 0.12, freq: 420 });
    if (G.player.pos.distanceTo(x.wa) < 200) G.shake(0.5, 0.3); // no shake with reduced motion (main.js)
  }

  // A vent goes quiet (its eruption ends, it's plugged, the planet dozes off): no column, no hazard.
  quiet(x) {
    if (x.hz) { x.hz.onFire = null; x.hz.t = x.hz.T; x.hz = null; } // released unfired on the next Hazards.update
    x.state = 'quiet';
    x.blast.visible = false;
  }

  sweepers(real) {
    const G = this.G, p = G.player;
    for (const x of this.of('sweeper')) {
      const A = _a.set(-SWEEP.len / 2, 0, 0).applyMatrix4(x.hub.matrixWorld), B = _c.set(SWEEP.len / 2, 0, 0).applyMatrix4(x.hub.matrixWorld);
      x.cd -= real;
      if (!p.dead && x.cd <= 0 && !p.dodging && p.invuln <= 0 && pointSeg(p.pos, A, B) < SWEEP.hit * p.sizeScale) {
        x.cd = SWEEP.cd;
        p.damage(SWEEP.dmg);
        this.e.attacks++;
      }
      if ((x.whirT = (x.whirT || 0) - real) <= 0 && p.pos.distanceTo(x.wb) < SWEEP.whir) { x.whirT = 0.4; G.audio.tone(130, 0.35, { type: 'sawtooth', vol: 0.015, slide: 30 }); }
    }
  }

  // The eye: stares out of its bubble while any generator stands; then shut → twitch (1 s, creaking) → open, on a cycle.
  eyeStep(dt) {
    const G = this.G, x = this.eye;
    if (x.broken) return;
    if (x.state === 'wait') x.state = 'stare'; // grown in: it snaps open
    if (this.gens()) return;
    if (!this.shieldDown) {
      this.shieldDown = true;
      G.ui.notify(TEXT.shieldDown, 'good', 4, 2);
      G.audio.zap();
      Object.assign(x, { state: 'shut', t: 2 });
    }
    x.t -= dt;
    if (x.state === 'shut' && x.t <= 0) {
      Object.assign(x, { state: 'twitch', t: EYE.twitch });
      G.audio.tone(70, EYE.twitch, { type: 'sawtooth', vol: 0.05, slide: 50 }); // the creak
    } else if (x.state === 'twitch' && x.t <= 0) {
      Object.assign(x, { state: 'open', t: this.phase > 2 ? EYE.openMad : EYE.open, glared: false });
    } else if (x.state === 'open') {
      if (this.phase > 2 && !x.glared && !G.player.dead) { x.glared = true; this.glareAt(); }
      if (x.t <= 0) Object.assign(x, { state: 'shut', t: EYE.every - EYE.twitch - (this.phase > 2 ? EYE.openMad : EYE.open) });
    }
  }

  // Phase 3, once per opening: a column marks the line from the eye to where you'll be in 1 s, then the beam.
  glareAt() {
    const G = this.G, p = G.player, x = this.eye;
    if (!this.sees(x, 650)) return;
    const from = x.wb.clone(), to = p.pos.clone().addScaledVector(p.forward, p.speed * EYE.glareAhead), dir = to.clone().sub(from), len = dir.length();
    dir.normalize();
    G.enemies.warn(from.clone().addScaledVector(dir, len / 2), EYE.glareR, '#ff4dff', EYE.glareWarn, () => this.beam(from, dir, len), { shape: 'column', owner: this.e, h: len, dir });
    G.audio.tone(300, EYE.glareWarn, { type: 'square', vol: 0.03, slide: 500 });
    this.e.attacks++;
  }

  beam(from, dir, len) {
    if (this.dozing || this.dying >= 0) return;
    const L = len + 80;
    this.beamT = EYE.glareBeam;
    this.beamHit = false;
    this.beamA = from;
    this.beamB = from.clone().addScaledVector(dir, L);
    this.glare.visible = true;
    this.glare.position.copy(from).addScaledVector(dir, L / 2).sub(this.C);
    this.glare.quaternion.setFromUnitVectors(Y, dir);
    this.glare.scale.set(EYE.glareR * 0.6, L, EYE.glareR * 0.6);
    this.G.audio.zap();
  }

  phases() {
    const G = this.G, f = this.e.hp / this.e.maxHp;
    const want = f <= GLOBE.phases[1] ? 3 : f <= GLOBE.phases[0] ? 2 : 1;
    if (want <= this.phase) return;
    this.phase = want;
    G.audio.zap();
    G.shake(0.8, 0.4);
    if (want === 2) {
      G.ui.notify(TEXT.phase2, 'bad', 4, 2);
      const at = this.surfaceToward(G.player.pos, 15);
      for (let k = 0; k < DRONES; k++) G.enemies.spawn('drone', at.clone().add(_a.set(rand(-20, 20), rand(-10, 10), rand(-20, 20))));
    } else {
      G.ui.notify(TEXT.phase3, 'bad', 4, 2);
      this.e.enraged = true;
      this.cracks.visible = true;
      this.rockT = 3;
    }
  }

  // The surface point under you (plus `up` m).
  surfaceToward(at, up = 0) { return _a.subVectors(at, this.C).setLength(R + up).add(this.C).clone(); }

  // Phase 3: Grudge Rocks, ROCKS.n every ROCKS.every s, at most ROCKS.max of them about.
  spawns(dt) {
    if (this.phase < 3 || (this.rockT -= dt) > 0) return;
    this.rockT = ROCKS.every;
    this.rocks = this.rocks.filter((r) => !r.dead);
    const at = this.surfaceToward(this.G.player.pos, 20);
    for (let k = 0; k < ROCKS.n && this.rocks.length < ROCKS.max; k++) this.rocks.push(this.G.enemies.spawn('grudgeRock', at.clone().add(_c.set(rand(-25, 25), rand(-10, 10), rand(-25, 25)))));
  }

  // More than GLOBE.breather m out, once you've come in: a breather (repairs sooner, faster), with one quiet line.
  checkFar(dist) {
    if (dist <= GLOBE.breather) this.engaged = true;
    const far = this.engaged && dist > GLOBE.breather && !this.G.player.dead;
    if (far && !this.far && this.G.time - this.farAt > 10) { this.farAt = this.G.time; this.G.ui.notify(TEXT.far, 'info', 3, 1); }
    this.far = far;
  }

  // ---------- looks ----------

  animate(real) {
    const G = this.G, x = this.eye, t = this.e.t, ease = 1 - Math.exp(-real * 10);
    const lid = x.state === 'open' || x.state === 'stare' ? EYE.lidOpen : x.state === 'twitch' ? -0.25 * Math.abs(Math.sin(t * 30)) : 0;
    x.lid.rotation.x += ((this.dozing || this.dying >= 0 ? 0 : lid) - x.lid.rotation.x) * ease;
    x.shield.visible = this.gens() > 0 && !x.broken;
    x.shield.material.opacity = 0.16 + 0.05 * Math.sin(t * 2 * TAU / 2);
    for (const v of this.of('vent')) {
      v.core.material.color.set(v.state === 'quiet' ? '#3a1a10' : '#ff9a3a');
      if (v.blast.visible) v.blast.material.opacity = 0.55 + 0.25 * Math.sin(t * 25);
    }
    if (this.phase > 2) {
      const k = 0.5 + 0.5 * Math.sin(t * 4);
      this.cracks.children[0].material.opacity = 0.55 + 0.45 * k;
      this.rock.emissive.setRGB(0.16 + 0.12 * k, 0.05, 0.06);
    }
    if (this.beamT > 0) {
      this.beamT -= real;
      this.glare.material.opacity = 0.5 + 0.4 * Math.sin(t * 40);
      const p = G.player;
      if (!this.beamHit && !p.dead && pointSeg(p.pos, this.beamA, this.beamB) < EYE.glareR + 4 * p.sizeScale) { this.beamHit = true; p.damage(EYE.glareDmg); }
      if (this.beamT <= 0) this.glare.visible = false;
    }
    // Red markers only where to shoot: the generators while the shield is up, the eye once it's open. Not on the far side.
    const cam = G.camera.position;
    for (const p of this.parts) {
      if (!p.marker) continue;
      const want = p.kind === 'generator' ? !this.dozing && this.dying < 0 : this.eyeOpen();
      p.marker.visible = want && this.grow >= 1 && _a.subVectors(cam, p.mid).dot(p.wn) > 0;
    }
  }

  // ---------- the end ----------

  startDying() {
    const G = this.G;
    this.dying = 0;
    this.e.hp = 0;
    G.enemies.hazards.clear(this.e);
    for (const v of this.of('vent')) this.quiet(v);
    this.glare.visible = false;
    this.beamT = 0;
    this.chain = this.parts.filter((x) => !x.broken).sort(() => Math.random() - 0.5);
    this.chainGap = (DYING.chain - 0.2) / Math.max(1, this.chain.length);
    this.chainAt = 0.2;
    this.xEye.visible = true;
    G.ui.notify(TEXT.breakup, 'good', 3, 1);
    G.audio.zap();
    G.shake(1, 0.5);
  }

  // Its gadgets go off one by one, then it splits into rubble. True when it's gone.
  crumble(real) {
    const G = this.G;
    this.dying += real;
    while (this.chain.length && this.dying >= this.chainAt) {
      const x = this.chain.shift();
      x.broken = true;
      x.obj.visible = false;
      x.scar.visible = true;
      G.fx.explosion(x.mid);
      G.audio.pop();
      this.chainAt += this.chainGap;
    }
    if (this.dying < DYING.split) return false;
    for (let k = 0; k < RUBBLE.n; k++) {
      const y = 1 - (2 * (k + 0.5)) / RUBBLE.n, r = Math.sqrt(1 - y * y), a = k * 2.39996, dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      G.zones.asteroids.spawn(this.C.clone().addScaledVector(dir, R * 0.5), rand(...RUBBLE.size), dir.multiplyScalar(RUBBLE.speed), RUBBLE.safe);
      G.fx.explosion(_a.copy(this.C).addScaledVector(dir, R * 0.8));
    }
    G.fx.emit(this.C, 160, { colors: ['#6a5a7a', '#8a7a9a', '#ff7a2a', '#5ae0ff'], speed: 120, life: 2.5, size: 12 });
    G.fx.confetti(this.C);
    G.shake(1.2, 0.6);
    return true;
  }

  // ---------- helpers for the objective, homing and respawns ----------

  // After a crash: 450 m out on the side you went down, level with its centre, nose on the planet.
  respawn(p, at) {
    if (this.e.dead || this.dying >= 0) return;
    const d = _a.subVectors(at, this.C).setY(0);
    if (d.lengthSq() < 1) d.set(-p.forward.x, 0, -p.forward.z);
    d.normalize();
    p.pos.copy(this.C).addScaledVector(d, GLOBE.respawn);
    p.prevPos.copy(p.pos);
    p.quat.setFromAxisAngle(Y, Math.atan2(d.x, d.z)); // forward = -d: facing the planet
    p.updateAxes();
  }

  // The nearest gadget you can hurt right now, else null (Homing Bullets).
  homeAt(from) {
    let best = null, bd = Infinity;
    for (const x of this.parts) {
      if (!this.hurtable(x)) continue;
      const d = x.mid.distanceToSquared(from);
      if (d < bd) { bd = d; best = x; }
    }
    return best ? this.home.copy(best.mid) : null;
  }

  // The objective marker: a generator while the shield is up, then the eye, then whatever's left.
  target() {
    const pp = this.G.player.pos, gens = this.of('generator');
    const pool = gens.length ? gens : !this.eye.broken ? [this.eye] : this.parts.filter((x) => !x.broken && x.kind !== 'crown');
    let best = null, bd = Infinity;
    for (const x of pool) { const d = x.mid.distanceToSquared(pp); if (d < bd) { bd = d; best = x; } }
    return this.target0.copy(best ? best.mid : this.C);
  }

  bar() {
    const e = this.e, gens = this.gens();
    return { name: TEXT.name, hp: Math.max(0, e.hp), maxHp: e.maxHp, enraged: e.enraged, away: this.far, note: gens ? `shield: ${gens}` : this.eyeOpen() ? 'eye open!' : '' };
  }

  progress() { return ['generator', 'turret', 'vent', 'sweeper'].map((k) => `${KINDS[k].icon}${this.left(k)}`).join(' '); }

  // Persuasion 'easier': every gadget -30% hp, worth the same (so the bar can still be emptied).
  easier() { for (const x of this.parts) if (!x.broken && x.counted) { x.hp *= GLOBE.easier; x.mult /= GLOBE.easier; } }

  // Relax mode: it dozes (eye shut, no attacks, nothing hurts it) until you come back.
  doze(on) {
    this.dozing = on;
    if (!on) return;
    this.G.enemies.hazards.clear(this.e);
    for (const v of this.of('vent')) this.quiet(v);
    for (const t of this.of('turret')) { t.wind = 0; t.shots = 0; t.tip.material.opacity = 0.0001; }
    this.glare.visible = false;
    this.beamT = 0;
  }
}

// The objective (objectives.js startSiege): beat the planet. Its own maker, never the regular boss deck.
export function mkSiege(G, level) {
  const globe = new Globe(G), e = globe.e;
  G.ui.bossBar(globe.bar());
  G.ui.notify(TEXT.arrive, 'bad', 5);
  G.audio.zap();
  return objective({
    type: 'boss', boss: 'grumbleglobe', siege: true, needsEnemies: true, noun: 'Grumbleglobe', globe, wakeText: TEXT.wake,
    reward: Math.round((400 + level * 100) * GLOBE.reward),
    title: 'BOSS: Grumbleglobe',
    desc: 'The whole planet is the boss. Shoot its gadgets: turrets, vents, sweepers and the 3 cyan shield generators, then its eye. Bare rock does nothing.',
    caps: new Set(['easier']),
    signText: ['THE PLANET', 'IS THE BOSS →'],
    hints: ['Shoot the gadgets, not the rock. Gold sparkles mean it counted.', 'Knock out the 3 cyan shield generators and the eye opens up. Hit it while it\'s open.', 'Barrel roll (double-tap left or right) straight through a yellow sweeper beam.', 'Fly more than 500 m out to patch up. The planet never chases you.'],
    target() { return globe.target(); },
    onUpdate(dt, G) {
      const b = globe.bar();
      G.ui.bossBar(b);
      this.progress = globe.progress();
      if (b.hp !== this.lastHp) { if (this.lastHp !== undefined) this.progressed = true; this.lastHp = b.hp; }
      return e.dead ? 'done' : null;
    },
    easier() { globe.easier(); return TEXT.easier; },
    doze(on) { globe.doze(on); },
    dispose(G) { G.ui.bossBar(null); if (!e.dead) G.enemies.removeEnemy(e); },
  });
}
