// Grumbleglobe, the Planet With Opinions: the world boss of its own zone (zones.js `siege`). The whole small planet
// is the boss, and its face is where the fight is: the one angry eye, four pores around it and the crown on top. The far
// side is plain rock. It never moves; it turns its face to follow you. Three Moonlets orbit it in open sky, tethered to
// the eye's shield bubble: pop all three and the shield drops. Every gadget (moons included) is a boss part
// (Enemies.damagePart / breakPart): each hit drains the bar by part.mult = worth / hp, so a gadget is worth its share of
// the bar however hard it is to break. Bare rock is armour 0: shoot it and nothing happens.
// The planet is one entity in Enemies.list (e.planet = the Globe) that runs its own update instead of bossBehave:
// the sphere and its moons are solid (touch them and you bounce off; bullets and orbs stop at the planet), the moons
// take potshots, the face spits fans of spitballs, the pores burp Grumblings (enemies.js), phase 2 starts when the
// shield drops and phase 3 at 33%, and at 0 it deflates and bursts into shootable rubble (Asteroids.spawn). Timers are
// enemy-time s (Enemies.update's dt, at PACE and the Slow-Mo / Time Freeze scale); collisions, bullets and the finale
// use real time, so they still work frozen.
import * as THREE from 'three';
import { makeCrown } from './models.js';
import { pick, rand } from './texts.js';
import { makeMarker, PACE, CEILING } from './enemies.js';
import { heightAt } from './world.js';
import { objective } from './objectives.js';

const R = 160; // planet radius (m)
export const GLOBE = {
  R, ahead: 760, floorGap: 200, top: 1150 - R - 150, // spawn: 760 m ahead at your altitude, clamped between floor and ceiling
  track: [0.12, 0.2, 0.3], trackOpen: 0,            // rad/s the face turns toward you (about world up), by phase; while the eye is open it holds its stare
  crashPad: 4, ghostPad: 3,                          // closer than R + crashPad: you bounce off; ghost / god mode skims at R + ghostPad
  respawn: 450, breather: 500,                       // respawn distance from the centre; farther than breather: a breather
  grow: 1.2,                                         // s to scale in on arrival
  meltdown: 0.33,                                    // bar fraction where phase 3 starts (phase 2 starts when the shield drops)
  lapHp: 1.4, easier: 0.7,                           // gadget hp on lap 2+; the persuasion 'easier' step
  reward: 1.5,                                       // × the regular boss formula
};
// The gadgets. worth: how much of the 100-point bar it drains in all (moons 34, pores 16, eye 50). The eye is shielded
// until every moon is gone, and breaking it ends the fight whatever is left of the bar.
const KINDS = {
  moon: { hp: 10, worth: 34 / 3, score: 80 },
  pore: { hp: 3, worth: 4, score: 40, line: 'Pore plugged! Fewer opinions.' },
  eye: { hp: 18, worth: 50, score: 40, line: 'The eye is out! It can\'t see you now. It can still feel you.' },
  crown: { hp: 10, worth: 0, score: 40, line: 'CROWN KNOCKED OFF! Every gadget takes 30% more damage now. The planet is mortified.' },
};
// Where the surface gadgets sit: [kind, longitude°, latitude°]. Longitude 0 is the face, turned toward you.
const LAYOUT = [['eye', 0, 0], ['crown', 0, 90], ['pore', 50, 35], ['pore', -50, 35], ['pore', 50, -35], ['pore', -50, -35]];
// Moonlets: radius r, orbiting MOON.R m from the centre at `speed` rad/s (lap 2+: × lapSpeed), each on its own tilted
// plane (tilt°), starting 120° apart. A faint orbit ring (ring: tube, segments, opacity) and a cyan tether to the eye's
// shield (tether: radius, opacity; it fades over `fade` s when its moon pops). Potshots: an aimed orb every `every` s,
// only at you within `range` m with the planet not in the way; the moon's mouth glows `wind` s first. At most
// `perWindow` moons fire per `every` s. Lap 2+: two shots, `burstGap` apart.
const MOON = {
  R: 290, r: 22, speed: 0.12, lapSpeed: 1.25, tilt: [20, 65, -40],
  every: 4, first: 1.5, wind: 0.6, range: 380, perWindow: 2, burstGap: 0.25,
  shot: { speed: 80, dmg: 10, lead: 0.5, color: '#ff4d4d', size: 1.2 },
  ring: { tube: 0.6, segs: 96, opacity: 0.18 }, tether: { r: 1.2, opacity: 0.55, fade: 0.3 },
};
// The three of them: colour and face.
const MOONS = [{ color: '#7ab8ff', face: 'pouty' }, { color: '#ff9ad0', face: 'smug' }, { color: '#ffe08a', face: 'sleepy' }];
// Spitballs from the mouth: only with you within `cos` of the face (normal · dir; 70°) and `range` m. Cheeks puff up to
// `puff` × over `wind` s (with a rising hum), then n orbs (phase 3: nMad) `spread`° apart in a level fan, its centre
// aimed `lead` of the way to where you'll be when they arrive (like the moons' potshots). Cooldown by phase. Never
// starts while the eye is twitching or open: that's your turn.
const SPIT = { wind: 1.0, n: 5, nMad: 7, spread: 12, speed: 100, lead: 0.5, dmg: 8, size: 2.5, color: '#ff9a3a', cd: [6, 4.5, 3.5], first: 3, cos: 0.35, range: 600, puff: 1.4, oFire: 0.4, oShock: 1 };
// Pores: glow and rumble `warn` s, then burp n Grumblings out along the normal at `out` m/s. Each pore every cd ± jitter
// s (phase 3: × madK), never two within `gap` s, only with you within `range` m of the centre. Alive at once: cap
// (phase 3: capMad; lap 2+: +lap; persuasion 'easier': -easier), never past the CEILING; `total` per fight, then they stop.
// A Grumbling about for over `life` s, or more than `leash` m off the surface, sulks off (no points) to make room.
const PORE = { warn: 1.0, n: 3, out: 40, cd: 9, jitter: 2, madK: 0.7, gap: 8, range: 450, cap: 6, capMad: 8, lap: 2, easier: 2, total: 24, first: 4, life: 10, leash: 220 };
// Touching the planet (R + crashPad) or a moon (r + moonPad): you're pushed out to `out` m off it, your nose flicked back
// out (reflected about the normal, then at least minOut along it), `dmg` hull (never the last 1), `invuln` s of
// invulnerability. At most one bounce every `cd` s (in between you just skim).
const BOUNCE = { dmg: 12, invuln: 1.0, cd: 0.5, out: 6, minOut: 0.5, moonPad: 4 };
// The eye: a shield bubble (r) while any moon stands; then the lid opens `open` s (phase 3: openMad) every `every`
// s, after `twitch` s of twitching and creaking, but only once the face is within `facing` rad of you (it stays shut
// until then, `held` s at most: then it opens anyway, and skips that opening's glare if still off you). Phase 3, once
// per opening: a glare. A thin "laser sight" from the eye (radius sight[0] thickening to sight[1] over glareWarn s),
// then a steady beam that thick (beamOpacity, no flicker), drawn only up to where it aimed (and stopping camGap m short
// of the camera), its last `tip` m narrowing to a point; it hits glareOver m past that. Its hit radius is glareR (+ 4 m
// for the plane), whatever the sight looks like. A beam that misses you pays `dodge`. Open, the eye bulges `bulge` m out.
const EYE = { shield: 45, every: 9, open: 5, openMad: 6, twitch: 1, facing: 0.7, held: 6, glareR: 6, glareWarn: 1.2, glareBeam: 0.4, glareDmg: 20, glareAhead: 1, glareOver: 30, camGap: 50, tip: 40, sight: [2, 4], beamOpacity: 0.7, lidOpen: -1.9, dodge: 25, bulge: 20 };
const HORIZON = 0.15; // the eye only glares at you above its horizon (normal · dir)
const ROCKS = { n: 2, every: 12, max: 2 };
const RUBBLE = { n: 8, size: [12, 14], speed: 15, safe: 3 };
// The finale: `freeze` s shuddering with an "x" for an eye, then over `shrink` s it shrinks to `to` × (ease-in) while
// spinning up to `spin` rad/s with a long raspberry (at most `puffs` particles a frame), then it bursts.
const DEFLATE = { freeze: 0.5, shrink: 1.6, to: 0.35, spin: 3, puffs: 6, shudder: 1.5 };
// Brow angle (rad about the normal; + is an angry V, - worried) by phase.
const BROWS = [0.42, 0.62, -0.3];

const TEXT = {
  name: 'Grumbleglobe, the Planet With Opinions',
  arrive: '⚠ THE WHOLE PLANET IS THE BOSS: Grumbleglobe! Its moons are its bodyguards. Its eye is its weak spot. Its opinions are everywhere.',
  moonDown: ['Moon down! It\'s going to tell Mum.', 'Moon down! It wasn\'t even its fault.'],
  lastMoon: 'Last moon down! The planet is very alone now.',
  shieldDown: 'SHIELD DOWN! Its moons left. It\'s taking it badly.',
  phase2: 'No moons, no shield, no chill. Shoot the eye when it opens!',
  phase3: 'MELTDOWN! It\'s cracking. And getting desperate.',
  grumblings: 'Grumblings! Tiny opinions with teeth.',
  noOpinions: 'Grumbleglobe has run out of opinions. Temporarily.',
  bounce: ['The planet flicked you off. Rude.', 'Grumbleglobe: "Personal space!"', 'Boing. That was your dignity.'],
  glareBack: 'Grumbleglobe is glaring at your back. Swerve!',
  firstEye: 'Right in the eye! It\'s really upset now.',
  rock: 'That\'s just rock. Shoot the moons, the pores and the eye!',
  far: 'Out of range. The planet is fuming quietly.',
  easier: 'The planet pulled a tectonic muscle. All gadgets -30% HP. Fewer Grumblings.',
  wake: 'Grumbleglobe woke up from its nap. It remembers everything.',
  breakup: 'Grumbleglobe is deflating! That sound was the planet. Probably.',
  taunts: ['Grumbleglobe: "Get off my atmosphere."', '"I\'m not round. I\'m big-boned."', '"My moons are NOT clingy. They\'re supportive."', '"Do you know how long it took to grow these moons?"', '"Stop orbiting me. It\'s weird."'],
  begging: ['"Okay. Truce? I\'ll stop spinning."', '"I HAD moons. Plural."', '"If you stop now I\'ll tell everyone you won."'],
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

// Each builder fills a surface gadget's group and returns its hit shape (a capsule: local points a, b and radius r) and
// its moving bits. `top`: where its marker floats (m along the normal).
const BUILD = {
  pore(g) {
    add(g, new THREE.TorusGeometry(8, 2.6, 6, 18).rotateX(Math.PI / 2), lambert('#4a3a5a'), 0, 1.2, 0);
    const core = add(g, new THREE.CircleGeometry(7.5, 18).rotateX(-Math.PI / 2), basic('#1a0e20'), 0, 1.5, 0);
    return { a: [0, 3], r: 11, top: 18, core };
  },
  eye(g) {
    // Local +Y looks out of the face; local -Z is up the planet (toward the north pole). The ball (with its lid) bulges
    // out of the socket while the eye is open (animate).
    const ball = new THREE.Group();
    g.add(ball);
    add(g, new THREE.TorusGeometry(17, 3, 6, 20).rotateX(Math.PI / 2), lambert('#4a3a5a'), 0, 1, 0); // the socket's rim
    add(ball, new THREE.SphereGeometry(16, 20, 14), lambert('#ffffff', '#ffffff', 0.25), 0, 2, 0);
    add(ball, new THREE.CircleGeometry(8, 24).rotateX(-Math.PI / 2), basic('#ff3ad0'), 0, 18.05, 0);
    add(ball, new THREE.CircleGeometry(3.6, 16).rotateX(-Math.PI / 2), basic('#1a0a1a'), 0, 18.15, 0);
    const lid = new THREE.Group();
    lid.position.y = 2;
    ball.add(lid);
    add(lid, new THREE.SphereGeometry(17.5, 20, 8, 0, TAU, 0, Math.PI / 2), lambert('#7a6a8a', '#2a2030', 1));
    // The stalk it bulges out on: 1 m tall, stretched to the bulge (animate).
    const stalk = add(g, new THREE.CylinderGeometry(8, 11, 1, 12).translate(0, 0.5, 0), lambert('#8a5a8a', '#3a1a30', 1), 0, 1, 0);
    stalk.visible = false;
    const shield = add(g, new THREE.SphereGeometry(EYE.shield, 28, 18), basic('#5ae0ff', 0.2, true), 0, 0, 0);
    return { a: [2, 10], r: 15, top: 34, lid, shield, ball, stalk };
  },
  crown(g) {
    g.add(makeCrown(5));
    return { a: [3, 12], r: 10, top: 30 };
  },
};

// The face around the eye (not shootable): two brows (their angle is its mood), two cheeks that puff up before it spits,
// a frown that turns into a shocked "O", and the "x" it gets at the end.
function buildFace(body) {
  const dark = lambert('#2a1a3a');
  const brow = mount(body, 0, 9), brows = [];
  for (const s of [-1, 1]) { const b = add(brow, new THREE.BoxGeometry(22, 5, 6), dark, s * 11, 3, 0); b.rotation.y = s * BROWS[0]; b.userData.side = s; brows.push(b); }
  const cheekGeo = new THREE.SphereGeometry(13, 14, 8, 0, TAU, 0, Math.PI / 2), cheekMat = lambert('#b07aa8', '#3a1a30', 1);
  const cheeks = [-1, 1].map((s) => add(mount(body, s * 22, -11), cheekGeo, cheekMat, 0, -3, 0));
  const mouth = mount(body, 0, -16);
  const arc = Math.PI * 0.7;
  const frown = add(mouth, new THREE.TorusGeometry(26, 2.6, 6, 18, arc).rotateZ(Math.PI / 2 - arc / 2).rotateX(-Math.PI / 2), dark, 0, 1, 22);
  const o = add(mouth, new THREE.TorusGeometry(9, 2.8, 6, 18).rotateX(-Math.PI / 2), dark, 0, 1.5, 6);
  add(o, new THREE.CircleGeometry(7, 16).rotateX(-Math.PI / 2), basic('#1a0a1a'), 0, -0.3, 0);
  o.visible = false;
  const x = mount(body, 0, 0);
  for (const s of [-1, 1]) { const b = add(x, new THREE.BoxGeometry(34, 4, 4), basic('#1a0a1a'), 0, 21, 0); b.rotation.y = s * Math.PI / 4; }
  x.visible = false;
  return { brows, cheeks, mouth, frown, o, x };
}

// A Moonlet: a lumpy ball in its colour with a face on its +Z side (it turns to look at you) and a mouth that glows
// before it fires. Local origin at its centre.
function buildMoon(k) {
  const { color, face } = MOONS[k], g = new THREE.Group(), r = MOON.r, dark = basic('#1a0e20');
  add(g, new THREE.IcosahedronGeometry(r, 1), lambert(color, color, 0.18));
  const z = r * 0.93, eye = new THREE.SphereGeometry(2.6, 8, 6);
  for (const s of [-1, 1]) {
    if (face === 'sleepy') { const b = add(g, new THREE.BoxGeometry(6, 1.2, 1.2), dark, s * 7, 5, z); b.rotation.z = s * -0.15; continue; } // shut, content
    add(g, eye, dark, s * 7, 5, z);
    if (face === 'smug') add(g, new THREE.BoxGeometry(7, 1.6, 1.6), basic(color === '#ff9ad0' ? '#c0508a' : color), s * 7, 6.4, z + 1); // heavy lids
    if (face === 'pouty') { const b = add(g, new THREE.BoxGeometry(6, 1.2, 1.2), dark, s * 7, 9.5, z - 1); b.rotation.z = s * 0.35; }
  }
  if (face === 'pouty') add(g, new THREE.TorusGeometry(4, 1, 5, 10, Math.PI), dark, 0, -9, z - 1);        // a frown
  else if (face === 'smug') { const m = add(g, new THREE.TorusGeometry(5, 1, 5, 10, Math.PI * 0.6), dark, 2, -6, z - 1); m.rotation.z = Math.PI + 0.5; } // a lopsided smirk
  // The mouth: dark, and where its potshots come from; it glows red while winding up (sleepy's is a little "o").
  add(g, new THREE.CircleGeometry(face === 'sleepy' ? 2.4 : 3, 12), dark, 0, -6, z + 0.6);
  const tip = add(g, new THREE.SphereGeometry(4.5, 10, 8), basic(MOON.shot.color, 0.0001, true), 0, -6, z + 2);
  return { obj: g, tip };
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
    Object.assign(this, { group, body, rock, grow: 0, phase: 1, dozing: false, dying: -1, far: false, farAt: -99, shieldDown: false, deflateK: 1 });
    this.face = buildFace(body);
    this.xEye = this.face.x;
    this.cracks = buildCracks(body);
    this.lap2 = G.zones.lap > 1;
    // Every gadget (and the crown) is a boss part: hit shape, surface normal (local), and its own state.
    const hpK = this.lap2 ? GLOBE.lapHp : 1;
    const part = (obj, kind, s, n) => {
      const K = KINDS[kind], hp = kind === 'crown' ? K.hp : K.hp * hpK;
      return {
        obj, name: kind, kind, hp, r: s.r, mult: K.worth / hp, counted: kind !== 'crown', ...s,
        a: new THREE.Vector3(0, s.a[0], 0), b: new THREE.Vector3(0, s.a[1], 0), wa: new THREE.Vector3(), wb: new THREE.Vector3(), mid: new THREE.Vector3(),
        n, wn: new THREE.Vector3(), cd: 0, t: 0, state: 'quiet',
      };
    };
    const marker = (x, obj, y) => {
      x.marker = makeMarker();
      x.marker.userData.keep = true; // its material is shared with every enemy marker: disposeTree leaves it alone
      x.marker.position.y = y;
      obj.add(x.marker);
    };
    this.parts = LAYOUT.map(([kind, lon, lat]) => {
      const obj = mount(body, lon, lat), s = BUILD[kind](obj), x = part(obj, kind, s, dirOf(lon, lat));
      if (kind === 'pore') x.cd = rand(PORE.first, PORE.first + PORE.cd);
      if (kind === 'eye' || kind === 'pore') marker(x, obj, s.top); // a pore's only while it glows
      const scar = add(body, new THREE.CircleGeometry(kind === 'eye' ? 18 : 10, 10).rotateX(-Math.PI / 2), basic('#2a1e2e'));
      scar.position.copy(x.n).multiplyScalar(lump(x.n) + 0.3);
      scar.quaternion.setFromUnitVectors(Y, x.n);
      scar.visible = false;
      x.scar = scar;
      return x;
    });
    // The moons hang off orbit pivots in `group` (not `body`), so the planet turning its face doesn't drag them along.
    this.moonA = [];
    MOON.tilt.forEach((tilt, k) => {
      const plane = new THREE.Group(), spin = new THREE.Group();
      plane.rotation.set(tilt * DEG, (k * TAU) / 3, 0, 'YXZ');
      group.add(plane);
      plane.add(spin);
      const ring = add(plane, new THREE.TorusGeometry(MOON.R, MOON.ring.tube, 4, MOON.ring.segs).rotateX(Math.PI / 2), basic(MOONS[k].color, MOON.ring.opacity, true));
      const { obj, tip } = buildMoon(k);
      obj.position.x = MOON.R;
      spin.add(obj);
      const tether = add(group, new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), basic('#5ae0ff', MOON.tether.opacity, true));
      const x = part(obj, 'moon', { a: [0, 0], r: MOON.r }, null);
      Object.assign(x, { name: 'moon', idx: k, spin, ring, tip, tether, fade: -1, cd: MOON.first });
      marker(x, obj, MOON.r + 14);
      this.moonA.push((k * TAU) / 3);
      spin.rotation.y = this.moonA[k];
      this.parts.push(x);
    });
    this.eye = this.parts.find((x) => x.kind === 'eye');
    this.eye.state = 'wait'; // lid shut while it scales in; then it snaps open and stares (shielded)
    this.window = { t: 0, n: 0 }; // moon potshot window
    this.spit = { cd: SPIT.first, wind: 0, n: 0 };
    this.oT = 0;            // s left showing the shocked "O" mouth
    this.lastBurp = -99;
    this.grumbs = [];       // its Grumblings (alive or not; pruned when counted)
    this.burped = 0;        // Grumblings this fight
    this.bounceCd = 0;
    this.bounceN = 0;
    this.moonsDown = 0;
    this.rocks = [];
    this.rockT = 0;
    this.tauntT = 6;
    this.tinkAt = -1;
    this.tips = {};
    this.glare = add(group, new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), basic('#ff6aff', EYE.beamOpacity, true));
    this.glare.visible = false;
    // The narrowing near ends of the beam (its material) and of the sight (it borrows the warning's, see sightLine).
    const tipGeo = new THREE.CylinderGeometry(0, 1, 1, 16, 1, true);
    this.glareTip = add(group, tipGeo, this.glare.material);
    this.sightTip = add(group, tipGeo, this.glare.material);
    this.sightTip.userData.keep = true; // it borrows the pooled warning's material; tipGeo is disposed via glareTip
    this.glareTip.visible = this.sightTip.visible = false;
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

  get k() { return this.group.scale.x; } // scale while it grows in (1 after) and while it deflates
  get C() { return this.group.position; }
  left(kind) { return this.parts.filter((x) => x.kind === kind && !x.broken).length; }
  moons() { return this.left('moon'); }
  eyeOpen() { return !this.moons() && !this.eye.broken && this.eye.state === 'open' && !this.dozing; }
  // A gadget you can hurt right now (homing): not the crown, nor a shut or shielded eye. (A pore takes hits glowing or
  // not: plugging one mid-glow calls its burp off.)
  hurtable(x) { return !x.broken && x.kind !== 'crown' && (x.kind !== 'eye' || this.eyeOpen()); }

  // Within bounce distance of the surface or a moon? (The pull-up warning asks: Enemies.solidAt.)
  inside(at) {
    _c.set(at.x, at.y, at.z);
    if (_c.distanceTo(this.C) < R * this.k + GLOBE.crashPad) return true;
    return this.parts.some((x) => x.kind === 'moon' && !x.broken && _c.distanceTo(x.mid) < MOON.r * this.k + BOUNCE.moonPad);
  }

  // ---------- per frame (from Enemies.update). True once it has burst (Enemies removes it). ----------
  update(dt, real) {
    const G = this.G, p = G.player, e = this.e;
    e.t += dt;
    this.grow = Math.min(1, this.grow + real / GLOBE.grow);
    this.group.scale.setScalar(Math.max(0.01, 1 - (1 - this.grow) ** 3) * this.deflateK);
    if (this.dying < 0 && !this.dozing) this.turn(dt, p);
    if (this.dying < 0 && !this.dozing && this.grow >= 1) this.orbit(dt);
    this.group.updateMatrixWorld(true);
    for (const x of this.parts) {
      x.wa.copy(x.a).applyMatrix4(x.obj.matrixWorld);
      x.wb.copy(x.b).applyMatrix4(x.obj.matrixWorld);
      x.mid.addVectors(x.wa, x.wb).multiplyScalar(0.5);
      if (x.n) x.wn.copy(x.n).applyQuaternion(this.body.quaternion);
      else x.wn.subVectors(x.mid, this.C).normalize(); // a moon: straight out from the planet
    }
    this.tethers(real);
    const toP = _b.subVectors(p.pos, this.C), dist = toP.length();
    this.collide(toP, dist, real);
    this.blockShots();
    this.bullets(real);
    this.animate(real);
    if (this.dying >= 0) return this.crumble(real);
    if (e.hp <= 0) { this.startDying(); return false; }
    this.checkFar(dist);
    if (this.dozing || this.grow < 1) return false;
    this.phases();
    this.eyeStep(dt);
    this.potshots(dt);
    this.spitStep(dt, dist);
    this.sulk();
    this.pores(dt, dist);
    if (p.dead) return false;
    this.spawns(dt);
    if (!this.far && (this.tauntT -= dt) <= 0) { this.tauntT = rand(12, 18); G.ui.notify(pick(this.phase > 2 ? TEXT.begging : TEXT.taunts), 'warn', 3.5, 0); }
    return false;
  }

  of(kind) { return this.parts.filter((x) => x.kind === kind && !x.broken); }

  // The face (longitude 0, local +Z) turns toward you about world up, at up to GLOBE.track[phase] rad/s, easing in over
  // the last few degrees; while the eye is open it holds its stare (so you can come round at it). faceErr: how far
  // it's off you (the eye only opens within EYE.facing: eyeStep).
  turn(dt, p) {
    const b = this.body, want = Math.atan2(p.pos.x - this.C.x, p.pos.z - this.C.z), d = Math.atan2(Math.sin(want - b.rotation.y), Math.cos(want - b.rotation.y));
    const max = this.eye.state === 'open' ? GLOBE.trackOpen : GLOBE.track[this.phase - 1];
    this.faceErr = Math.abs(d);
    b.rotation.y += clamp(d * 1.5, -max, max) * dt;
  }

  // The moons go round (enemy time: Slow-Mo slows them, Time Freeze and dozing stop them) and look at you.
  orbit(dt) {
    const w = MOON.speed * (this.lap2 ? MOON.lapSpeed : 1), pp = this.G.player.pos;
    for (const x of this.of('moon')) {
      this.moonA[x.idx] = (this.moonA[x.idx] + w * dt) % TAU;
      x.spin.rotation.y = this.moonA[x.idx];
      x.obj.lookAt(pp); // its parents' world matrices are a frame old: close enough for a face
    }
  }

  // Each moon's tether, from its centre to the shield bubble's, re-laid every frame (in the group's own frame: it only
  // has a position and a uniform scale). A popped moon's tether fades out over MOON.tether.fade s.
  tethers(real) {
    const k = this.k, eyeAt = this.eye.obj.getWorldPosition(_c);
    for (const x of this.parts) {
      if (x.kind !== 'moon') continue;
      const t = x.tether;
      if (x.broken) {
        if (x.fade < 0) { t.visible = false; x.ring.visible = false; continue; }
        x.fade -= real;
        t.material.opacity = MOON.tether.opacity * Math.max(0, x.fade / MOON.tether.fade);
        x.ring.material.opacity = MOON.ring.opacity * Math.max(0, x.fade / MOON.tether.fade);
        if (x.fade <= 0) x.fade = -1;
      }
      const dir = _a.subVectors(eyeAt, x.mid), len = dir.length() / k;
      dir.normalize();
      t.position.subVectors(x.mid, this.C).divideScalar(k).addScaledVector(dir, len / 2);
      t.quaternion.setFromUnitVectors(Y, dir);
      t.scale.set(MOON.tether.r, len, MOON.tether.r);
      t.visible = !this.eye.broken;
    }
  }

  // The planet and its moons are solid but bouncy: touch one and you're flicked back out (BOUNCE: some hull, never a
  // life). Ghost or god mode, invulnerable, mid barrel roll, just respawned or within BOUNCE.cd of the last
  // bounce: you skim along it instead. Drones, rocks and Grumblings are pushed back out of the planet.
  collide(toP, dist, real) {
    const G = this.G, p = G.player, Rk = R * this.k, s = p.sizeScale;
    for (const x of G.enemies.list) {
      if (x === this.e || x.dead) continue;
      _a.subVectors(x.pos, this.C);
      if (_a.length() < Rk + x.radius) x.pos.copy(this.C).addScaledVector(_a.normalize(), Rk + x.radius);
    }
    this.bounceCd -= real;
    if (p.dead) return;
    let from = null, r = 0;
    if (dist < Rk + GLOBE.crashPad * s) { from = this.C; r = Rk; }
    else {
      for (const x of this.parts) {
        if (x.kind !== 'moon' || x.broken) continue;
        const mr = MOON.r * this.k;
        if (p.pos.distanceTo(x.mid) < mr + BOUNCE.moonPad * s) { from = x.mid; r = mr; break; }
      }
    }
    if (!from) return;
    const n = _n.subVectors(p.pos, from);
    if (n.lengthSq() < 1e-6) n.copy(p.forward).negate();
    n.normalize();
    const free = p.god || G.powerups.has('ghost') || p.invuln > 0 || p.grace > 0 || p.dodging || this.dying >= 0 || this.bounceCd > 0;
    if (free) { p.pos.copy(from).addScaledVector(n, r + GLOBE.ghostPad * s); return; }
    p.pos.copy(from).addScaledVector(n, r + BOUNCE.out * s);
    p.prevPos.copy(p.pos);
    this.bounceCd = BOUNCE.cd;
    const dmg = Math.min(BOUNCE.dmg, p.health - 1); // the planet never takes a life by itself: a bounce leaves you 1 hull
    if (dmg > 0) p.damage(dmg, true); // raw: no enemy multiplier, or it could take the last hull
    p.invuln = Math.max(p.invuln, BOUNCE.invuln);
    // Flick the nose back out: reflected about the normal, and at least BOUNCE.minOut along it.
    const f = _a.copy(p.forward).addScaledVector(n, -2 * p.forward.dot(n));
    if (f.dot(n) < BOUNCE.minOut) {
      f.addScaledVector(n, -f.dot(n));
      if (f.lengthSq() < 1e-6) f.set(1, 0, 0).cross(n);
      if (f.lengthSq() < 1e-6) f.set(0, 0, 1).cross(n);
      f.normalize().multiplyScalar(Math.sqrt(1 - BOUNCE.minOut ** 2)).addScaledVector(n, BOUNCE.minOut);
    }
    p.maneuver = null; // a bounce ends any stunt
    p.nudgeToward(_c.copy(p.pos).add(f), 99, 1);
    p.updateAxes();
    G.audio.tone(180, 0.35, { type: 'sine', vol: 0.12, slide: 320 });
    G.shake(0.4, 0.25);
    G.fx.popText(_c.copy(p.pos).addScaledVector(p.forward, 25).addScaledVector(p.up, 6), 'BOING!');
    G.fx.emit(_c.copy(from).addScaledVector(n, r), 14, { colors: ['#b88aff', '#ffffff'], speed: 30, life: 0.6, size: 6 });
    G.ui.notify(TEXT.bounce[this.bounceN++ % TEXT.bounce.length], 'warn', 2.5, 1);
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
    const G = this.G, p = G.player, k = this.k, Rk = R * k, reach = (MOON.R + MOON.r + 20) * k, shield = this.moons() > 0 && !this.eye.broken && !this.dozing;
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
      || (what.kind === 'eye' && !this.eyeOpen());
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
    if (part.scar) part.scar.visible = true;
    G.score += K.score;
    G.fx.popText(part.mid, `+${K.score}`);
    if (part.kind === 'crown') this.e.vulnerable = 1.3;
    if (part.kind === 'pore') this.quiet(part);
    if (part.kind === 'eye') { this.e.hp = 0; return; } // the finisher: the deflate (startDying) takes whatever's left
    if (part.kind === 'moon') {
      part.fade = MOON.tether.fade;
      part.tip.material.opacity = 0.0001;
      this.oT = SPIT.oShock; // the face is shocked
      const n = this.moons();
      G.ui.notify(n ? TEXT.moonDown[this.moonsDown++ % TEXT.moonDown.length] : TEXT.lastMoon, 'good', 3, 1);
      return; // eyeStep announces the shield going down
    }
    G.ui.notify(K.line, 'good', 3, 1);
  }

  // ---------- attacks ----------

  // Can this gadget see you? Within range and above its horizon (so the far side never fires through the planet).
  sees(x, range, out = _c) {
    const p = this.G.player;
    out.subVectors(p.pos, x.mid);
    const d = out.length();
    return d < range && x.wn.dot(out) > HORIZON * d;
  }

  // Can this moon see you? Within range, with the planet not in the way.
  moonSees(x) {
    const p = this.G.player;
    return p.pos.distanceTo(x.mid) < MOON.range && segSphere(x.mid, p.pos, this.C, R * this.k) === Infinity;
  }

  // Each moon's x.cd counts down to its next shot; the last MOON.wind s of it its mouth glows (and a rising tone plays).
  // It only winds up while it sees you and the window has room; losing sight of you calls the shot off.
  potshots(dt) {
    const G = this.G, p = G.player, W = this.window;
    if ((W.t += dt) >= MOON.every) { W.t = 0; W.n = 0; }
    for (const x of this.of('moon')) {
      const vis = !p.dead && this.moonSees(x);
      if (vis && !x.seen) { x.seen = true; x.cd = Math.max(x.cd, MOON.first); }
      x.cd -= dt;
      if (x.shots > 0) { // mid-burst: the second shot of the pair
        if (x.cd <= 0) { if (vis) this.fire(x); x.shots--; x.cd = MOON.every; }
      } else if (x.wind > 0 && !vis) { x.wind = 0; x.cd = MOON.wind; } // lost you: it glows again before it fires
      else if (x.wind > 0) {
        if ((x.wind -= dt) <= 0) { this.fire(x); x.shots = this.lap2 ? 1 : 0; x.cd = x.shots ? MOON.burstGap : MOON.every; }
      } else if (x.cd <= MOON.wind) {
        x.cd = MOON.wind; // waiting for you, or for room in the window
        if (vis && x.seen && W.n < MOON.perWindow) {
          W.n++;
          x.wind = MOON.wind;
          G.audio.tone(420, MOON.wind, { type: 'sine', vol: 0.04, slide: 700 });
        }
      }
      x.tip.material.opacity = x.wind > 0 ? 0.35 + 0.65 * (1 - x.wind / MOON.wind) : x.shots > 0 ? 0.8 : 0.0001;
      x.tip.scale.setScalar(x.wind > 0 ? 1 + 0.6 * (1 - x.wind / MOON.wind) : 1);
    }
  }

  fire(x) {
    const G = this.G, p = G.player, S = MOON.shot, from = x.tip.getWorldPosition(new THREE.Vector3());
    const t = from.distanceTo(p.pos) / (S.speed * PACE); // real s to reach you: orbs fly at PACE
    const to = p.pos.clone().addScaledVector(p.forward, p.speed * t * S.lead).sub(from);
    G.enemies.fireOrb(from, to, S.speed, S.dmg, S.color, S.size).owner = this.e;
    G.audio.tone(160, 0.2, { type: 'square', vol: 0.05, slide: -60 });
    this.e.attacks++;
  }

  // Is the face toward you (within SPIT.cos and SPIT.range)? Then it may spit.
  facesYou(dist) {
    const p = this.G.player;
    return dist < SPIT.range && _a.subVectors(p.pos, this.C).normalize().dot(this.eye.wn) > SPIT.cos;
  }

  // The spit fan: cheeks puff up for SPIT.wind s with a rising "mmmMMM", then a level fan of orbs at where you are. Its
  // turn only: never starts while the eye is twitching or open.
  spitStep(dt, dist) {
    const G = this.G, p = G.player, s = this.spit, x = this.eye;
    if (s.wind > 0) {
      if ((s.wind -= dt) <= 0) { s.wind = 0; this.spitFire(); }
      return;
    }
    if ((s.cd -= dt) > 0 || p.dead || this.far || x.state === 'twitch' || x.state === 'open' || !this.facesYou(dist)) return;
    s.wind = SPIT.wind;
    s.n = this.phase > 2 ? SPIT.nMad : SPIT.n;
    s.startedAt = this.e.t; // (for the smoke test)
    G.audio.tone(110, SPIT.wind, { type: 'sawtooth', vol: 0.04, slide: 220 });
    this.e.attacks++;
  }

  spitFire() {
    const G = this.G, p = G.player, s = this.spit;
    s.cd = SPIT.cd[this.phase - 1];
    this.oT = Math.max(this.oT, SPIT.oFire);
    if (p.dead || this.dozing) return;
    const from = this.face.o.getWorldPosition(new THREE.Vector3()).addScaledVector(this.eye.wn, 10);
    const t = from.distanceTo(p.pos) / (SPIT.speed * PACE); // real s to reach you: orbs fly at PACE
    const aim = _a.copy(p.pos).addScaledVector(p.forward, p.speed * t * SPIT.lead).sub(from).normalize();
    // The fan turns about "up" as seen along the aim (world up made square to it), so it stays level.
    const axis = _b.copy(Y).addScaledVector(aim, -aim.dot(Y));
    if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
    axis.normalize();
    for (let i = 0; i < s.n; i++) {
      const dir = aim.clone().applyAxisAngle(axis, (i - (s.n - 1) / 2) * SPIT.spread * DEG);
      G.enemies.fireOrb(from, dir, SPIT.speed, SPIT.dmg, SPIT.color, SPIT.size).owner = this.e;
    }
    s.fired = (s.fired || 0) + 1;
    G.audio.tone(140, 0.25, { type: 'square', vol: 0.06, slide: -80 });
    G.audio.noise(0.2, { vol: 0.08, freq: 700 });
  }

  // A Grumbling that has been about over PORE.life s (enemy time) or strayed over PORE.leash m from the surface sulks
  // off (a puff, no points), freeing its slot for the next burp.
  sulk() {
    const G = this.G, far = R * this.k + PORE.leash;
    for (const x of this.alive()) {
      if (x.stateT <= PORE.life && x.pos.distanceTo(this.C) <= far) continue;
      G.fx.emit(x.pos, 8, { colors: ['#7a6a8a', '#b8a8c8'], speed: 14, life: 0.5, size: 5 });
      G.enemies.removeEnemy(x);
    }
  }

  // Grumblings (enemies.js) from this planet still about.
  alive() { return (this.grumbs = this.grumbs.filter((x) => !x.dead)); }
  grumbCap() { return (this.phase > 2 ? PORE.capMad : PORE.cap) + (this.lap2 ? PORE.lap : 0) - (this.easy ? PORE.easier : 0); }

  // Pores: quiet → glow (PORE.warn s, a rumble) → a burp of Grumblings → quiet, on a jittered cooldown. Only with you
  // near, room under the caps, and Grumblings left in this fight's budget.
  pores(dt, dist) {
    const G = this.G, p = G.player, mad = this.phase > 2;
    for (const x of this.of('pore')) {
      if (x.state === 'quiet') {
        x.cd -= dt;
        if (x.cd > 0 || p.dead || this.far || dist > PORE.range || this.e.t - this.lastBurp < PORE.gap) continue;
        if (this.burped >= PORE.total || this.alive().length >= this.grumbCap()) continue;
        this.lastBurp = this.e.t;
        Object.assign(x, { state: 'glow', t: PORE.warn });
        G.audio.tone(60, PORE.warn, { type: 'sawtooth', vol: 0.05, slide: 40 }); // the rumble
        this.e.attacks++;
      } else if (x.state === 'glow' && (x.t -= dt) <= 0) {
        this.burp(x);
        this.quiet(x);
        x.cd = (PORE.cd + rand(-PORE.jitter, PORE.jitter)) * (mad ? PORE.madK : 1);
      }
    }
  }

  burp(x) {
    const G = this.G, E = G.enemies, k = this.k;
    const n = Math.min(PORE.n, PORE.total - this.burped, this.grumbCap() - this.alive().length, CEILING - E.regulars().length);
    for (let i = 0; i < n; i++) {
      const at = x.wa.clone().addScaledVector(x.wn, 5 * k).add(_a.set(rand(-2, 2), rand(-2, 2), rand(-2, 2)));
      const g = E.spawn('grumbling', at);
      g.vel.copy(x.wn).multiplyScalar(PORE.out).add(_a.set(rand(-8, 8), rand(-8, 8), rand(-8, 8)));
      this.grumbs.push(g);
      this.burped++;
    }
    if (n > 0) {
      G.fx.emit(x.wa, 16, { colors: ['#7a6a8a', '#ff9a3a'], speed: 25, life: 0.6, size: 6 });
      G.audio.tone(90, 0.25, { type: 'square', vol: 0.06, slide: -40 }); // *burp*
      this.tip('grumblings', TEXT.grumblings, 'warn');
    }
    if (this.burped >= PORE.total) this.tip('noOpinions', TEXT.noOpinions, 'good');
  }

  // A pore goes quiet (it's plugged, the planet dozes off or dies): no glow, no burp.
  quiet(x) { x.state = 'quiet'; x.t = 0; x.marker.visible = false; }

  // Its Grumblings pop all at once (it dozes off, it dies, the fight is called off).
  popGrumblings() {
    const G = this.G;
    for (const x of this.alive()) { G.fx.emit(x.pos, 8, { colors: ['#7a6a8a', '#ffffff'], speed: 18, life: 0.5, size: 5 }); G.enemies.removeEnemy(x); }
    this.grumbs.length = 0;
  }

  // The eye: stares out of its bubble while any moon stands; then shut → twitch (1 s, creaking) → open, on a cycle.
  // It holds shut past its time until the face looks your way (faceErr < EYE.facing), so it never opens on empty sky;
  // but never more than EYE.held s (x.t runs on below 0), so a chase round the far side can't keep it shut for good.
  eyeStep(dt) {
    const G = this.G, x = this.eye;
    if (x.broken) return;
    if (x.state === 'wait') x.state = 'stare'; // grown in: it snaps open
    if (this.moons()) return;
    if (!this.shieldDown) this.dropShield();
    x.t -= dt;
    if (x.state === 'shut' && x.t <= 0 && (this.faceErr < EYE.facing || x.t <= -EYE.held)) {
      Object.assign(x, { state: 'twitch', t: EYE.twitch, forced: this.faceErr >= EYE.facing });
      G.audio.tone(70, EYE.twitch, { type: 'sawtooth', vol: 0.05, slide: 50 }); // the creak
    } else if (x.state === 'twitch' && x.t <= 0) {
      Object.assign(x, { state: 'open', t: this.phase > 2 ? EYE.openMad : EYE.open, glared: false });
    } else if (x.state === 'open') {
      // No glare from a forced opening while the face is still off you: it never beams from the side that isn't looking.
      if (this.phase > 2 && !x.glared && !G.player.dead) { x.glared = true; if (!(x.forced && this.faceErr > EYE.facing)) this.glareAt(); }
      if (x.t <= 0) Object.assign(x, { state: 'shut', t: EYE.every - EYE.twitch - (this.phase > 2 ? EYE.openMad : EYE.open) });
    }
  }

  // The last moon popped: the bubble shatters and phase 2 starts, whatever the bar says.
  dropShield() {
    const G = this.G, x = this.eye;
    this.shieldDown = true;
    G.fx.emit(x.obj.getWorldPosition(_a), 80, { colors: ['#5ae0ff', '#bff4ff', '#ffffff'], speed: 70, life: 1.2, size: 6 });
    G.audio.zap();
    G.shake(0.6, 0.4);
    G.ui.notify(TEXT.shieldDown, 'good', 4, 2);
    this.oT = SPIT.oShock;
    Object.assign(x, { state: 'shut', t: 2 });
    this.enter(2);
  }

  // Phase 3 "Meltdown": once the shield is down and the bar is at 33% or less.
  phases() {
    if (this.phase === 2 && this.e.hp / this.e.maxHp <= GLOBE.meltdown) this.enter(3);
  }

  enter(phase) {
    const G = this.G;
    this.phase = phase;
    if (phase === 2) { G.ui.notify(TEXT.phase2, 'bad', 4, 1); return; }
    G.audio.zap();
    G.shake(0.8, 0.4);
    G.ui.notify(TEXT.phase3, 'bad', 4, 2);
    this.e.enraged = true;
    this.cracks.visible = true;
    this.rockT = 3;
  }

  // Phase 3, once per opening: a thin sight line from the eye to where you'll be in 1 s (it thickens as it charges:
  // animate), then the beam. The warning keeps r = glareR (the hit radius); only its mesh is drawn thin.
  glareAt() {
    const G = this.G, p = G.player, x = this.eye;
    if (!this.sees(x, 650)) return;
    const from = x.wb.clone(), to = p.pos.clone().addScaledVector(p.forward, p.speed * EYE.glareAhead), dir = to.clone().sub(from), len = dir.length();
    dir.normalize();
    const cam = G.camera, look = cam.getWorldDirection(new THREE.Vector3());
    if (look.dot(new THREE.Vector3().subVectors(from, cam.position)) < 0) G.ui.notify(TEXT.glareBack, 'bad', 2);
    this.sight = G.enemies.warn(from.clone().addScaledVector(dir, len / 2), EYE.glareR, '#ff4dff', EYE.glareWarn, () => this.beam(from, dir, len), { shape: 'column', owner: this.e, h: len, dir });
    this.aim = { from, dir, len };
    this.sightLine();
    G.audio.tone(300, EYE.glareWarn, { type: 'square', vol: 0.03, slide: 500 });
    this.e.attacks++;
  }

  // The sight's drawn radius: sight[0] → sight[1] over the warning. Its length is clipped like the beam's, every frame
  // (the camera moves); the warning mesh is the body and sightTip, in the same material, the narrowing end.
  sightLine() {
    const hz = this.sight;
    if (!this.G.enemies.hazards.list.includes(hz)) { this.sight = null; this.sightTip.visible = false; return; } // cleared elsewhere: its mesh is back in the pool
    const k = Math.min(1, hz.t / hz.T), r = EYE.sight[0] + (EYE.sight[1] - EYE.sight[0]) * k, { from, dir, len } = this.aim;
    this.sightTip.material = hz.mesh.material;
    this.rod(hz.mesh, _c.set(0, 0, 0), this.sightTip, from, dir, this.drawn(from, dir, len), r);
  }

  // How far a glare from `from` along `dir` (aimed `len` m out) is drawn: to the aim point, but never within camGap m
  // of the camera (so it can't fill the screen when you fly away from the eye).
  drawn(from, dir, len) {
    const cam = _a.subVectors(this.G.camera.position, from).dot(dir);
    return cam > 0 ? clamp(cam - EYE.camGap, 1, len) : len;
  }

  // Lay a body cylinder (its parent at `origin`) and a tip cone (in the planet group) from `from` along `dir`, L m in
  // all, radius r: the tip is the last EYE.tip m (half of a short one), narrowing to a point at the near end.
  rod(body, origin, tip, from, dir, L, r) {
    const t = Math.min(EYE.tip, L / 2), b = L - t;
    body.position.copy(from).addScaledVector(dir, b / 2).sub(origin);
    body.quaternion.setFromUnitVectors(Y, dir);
    body.scale.set(r, b, r);
    tip.position.copy(from).addScaledVector(dir, b + t / 2).sub(this.C);
    tip.quaternion.copy(body.quaternion);
    tip.scale.set(r, t, r);
    tip.visible = true;
  }

  // The hit segment runs glareOver m past the aim point; the mesh only as far as drawn() allows (beamLen m).
  beam(from, dir, len) {
    this.sight = null;
    this.sightTip.visible = false;
    if (this.dozing || this.dying >= 0) return;
    const L = this.drawn(from, dir, len);
    this.beamT = EYE.glareBeam;
    this.beamHit = false;
    this.beamA = from;
    this.beamB = from.clone().addScaledVector(dir, len + EYE.glareOver);
    this.beamLen = L;
    this.glare.visible = true;
    this.rod(this.glare, this.C, this.glareTip, from, dir, L, EYE.sight[1]); // as thick as the sight ended; steady (EYE.beamOpacity), no flashing
    this.G.audio.zap();
  }

  // A glare beam ran out without touching you: +25, like dodging any boss's big move (bossmoves.js dodgeEnd).
  dodged() {
    const G = this.G, p = G.player;
    G.score += EYE.dodge;
    G.fx.popText(p.pos.clone().addScaledVector(p.forward, 25).add(_a.set(0, 6, 0)), `+${EYE.dodge} Dodge!`);
    G.audio.tone(990, 0.14, { type: 'triangle', vol: 0.06 });
    G.audio.tone(1320, 0.18, { type: 'triangle', vol: 0.05, delay: 0.09 });
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
    const G = this.G, x = this.eye, t = this.e.t, ease = 1 - Math.exp(-real * 10), F = this.face;
    const lid = x.state === 'open' || x.state === 'stare' ? EYE.lidOpen : x.state === 'twitch' ? -0.35 * Math.abs(Math.sin(t * 6)) : 0; // ~1.9 Hz wobble, no flashing
    x.lid.rotation.x += ((this.dozing || this.dying >= 0 ? 0 : lid) - x.lid.rotation.x) * ease;
    // Open, it bulges out of its socket (easier to hit from the side); its hit capsule goes with it.
    const bulge = x.state === 'open' && !this.dozing && this.dying < 0 ? EYE.bulge : 0;
    x.ball.position.y += (bulge - x.ball.position.y) * ease * 0.6;
    x.stalk.scale.y = Math.max(0.01, x.ball.position.y);
    x.stalk.visible = x.ball.position.y > 0.5;
    x.a.y = 2 + x.ball.position.y;
    x.b.y = 10 + x.ball.position.y;
    x.shield.visible = this.moons() > 0 && !x.broken;
    x.shield.material.opacity = 0.16 + 0.05 * Math.sin(t * TAU * 0.5); // 0.5 Hz
    // The face: brows by mood, cheeks puffing over a spit wind-up, the "O" when shocked or spitting.
    const brow = BROWS[this.phase - 1];
    for (const b of F.brows) b.rotation.y += (b.userData.side * brow - b.rotation.y) * ease * 0.5;
    const puff = this.spit.wind > 0 ? 1 + (SPIT.puff - 1) * (1 - this.spit.wind / SPIT.wind) : 1;
    for (const c of F.cheeks) c.scale.setScalar(this.spit.wind > 0 ? puff : c.scale.x + (1 - c.scale.x) * ease);
    this.oT -= real;
    F.o.visible = this.oT > 0 && this.dying < 0;
    F.frown.visible = !F.o.visible;
    for (const v of this.of('pore')) {
      const k = v.state === 'glow' ? 1 - v.t / PORE.warn : 0; // a steady ramp, no flashing
      v.core.material.color.setRGB(0.1 + 0.9 * k, 0.055 + 0.55 * k, 0.125 + 0.1 * k);
    }
    if (this.phase > 2) {
      const k = 0.5 + 0.5 * Math.sin(t * 4); // ~0.64 Hz
      this.cracks.children[0].material.opacity = 0.55 + 0.45 * k;
      this.rock.emissive.setRGB(0.16 + 0.12 * k, 0.05, 0.06);
    }
    if (this.sight) this.sightLine();
    if (this.beamT > 0) {
      this.beamT -= real;
      const p = G.player;
      // Only a hit that cost hull counts: a barrel roll (or invulnerability) through the beam is still a dodge.
      if (!this.beamHit && !p.dead && pointSeg(p.pos, this.beamA, this.beamB) < EYE.glareR + 4 * p.sizeScale) { const h = p.health; p.damage(EYE.glareDmg); this.beamHit = p.dead || p.health < h; }
      if (this.beamT <= 0) {
        this.glare.visible = this.glareTip.visible = false;
        if (!this.beamHit && !p.dead && this.dying < 0) this.dodged();
      }
    }
    // Red markers only where to shoot: the moons while the shield is up, the eye once it's open (not from behind).
    const cam = G.camera.position;
    for (const p of this.parts) {
      if (!p.marker) continue;
      const want = p.kind === 'moon' ? !this.dozing && this.dying < 0 : p.kind === 'pore' ? p.state === 'glow' : this.eyeOpen() && _a.subVectors(cam, p.mid).dot(p.wn) > 0;
      p.marker.visible = want && this.grow >= 1;
    }
  }

  // ---------- the end ----------

  // The eye broke (or the bar ran out): it freezes with an "x" for an eye, then deflates like a punctured balloon.
  startDying() {
    const G = this.G;
    this.dying = 0;
    this.e.hp = 0;
    G.enemies.hazards.clear(this.e);
    for (const v of this.of('pore')) this.quiet(v);
    this.spit.wind = 0;
    this.glare.visible = this.glareTip.visible = this.sightTip.visible = false;
    this.beamT = 0;
    this.sight = null;
    this.popGrumblings();
    this.chain = this.parts.filter((x) => !x.broken).sort(() => Math.random() - 0.5);
    this.chainGap = (DEFLATE.shrink - 0.2) / Math.max(1, this.chain.length);
    this.chainAt = DEFLATE.freeze + 0.1;
    this.xEye.visible = true;
    G.ui.notify(TEXT.breakup, 'good', 3, 1);
    G.audio.zap();
    G.shake(1, 0.5);
  }

  // Shudder, then shrink and spin up with a raspberry while what's left of its gadgets pops, then burst. True when gone.
  crumble(real) {
    const G = this.G, D = DEFLATE, b = this.body;
    this.dying += real;
    const t = this.dying;
    if (t < D.freeze) b.position.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(D.shudder);
    else {
      b.position.set(0, 0, 0);
      if (!this.raspberry) {
        this.raspberry = true;
        G.audio.tone(220, D.shrink, { type: 'sawtooth', vol: 0.08, slide: -160 });
        for (let k = 0; k < 5; k++) G.audio.noise(0.14, { vol: 0.08, freq: 500, delay: k * 0.3 });
      }
      const u = Math.min(1, (t - D.freeze) / D.shrink);
      this.deflateK = 1 - (1 - D.to) * u * u;
      this.group.scale.setScalar(this.deflateK);
      b.rotation.y += D.spin * u * real;
      // Air rushing out of the eye socket.
      G.fx.emit(this.eye.obj.getWorldPosition(_a), D.puffs, { colors: ['#b88aff', '#8a7a9a', '#ffffff'], speed: 50, life: 0.6, size: 6 });
    }
    while (this.chain.length && t >= this.chainAt) {
      const x = this.chain.shift();
      x.broken = true;
      x.obj.visible = false;
      if (x.scar) x.scar.visible = true;
      if (x.kind === 'moon') x.fade = MOON.tether.fade;
      G.fx.explosion(x.mid);
      G.audio.pop();
      this.chainAt += this.chainGap;
    }
    if (t < D.freeze + D.shrink) return false;
    const k = this.k;
    for (let i = 0; i < RUBBLE.n; i++) {
      const y = 1 - (2 * (i + 0.5)) / RUBBLE.n, r = Math.sqrt(1 - y * y), a = i * 2.39996, dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      G.zones.asteroids.spawn(this.C.clone().addScaledVector(dir, R * k * 0.5), rand(...RUBBLE.size), dir.multiplyScalar(RUBBLE.speed), RUBBLE.safe);
      G.fx.explosion(_a.copy(this.C).addScaledVector(dir, R * k * 0.8));
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

  nearest(pool, to) {
    let best = null, bd = Infinity;
    for (const x of pool) { const d = x.mid.distanceToSquared(to); if (d < bd) { bd = d; best = x; } }
    return best;
  }

  // Homing Bullets: the nearest moon while the shield stands, then the open eye or a pore. Never the crown or a shut
  // eye. Null if there's nothing to hurt right now.
  homeAt(from) {
    const moons = this.of('moon'), best = this.nearest(moons.length ? moons : this.parts.filter((x) => this.hurtable(x)), from);
    return best ? this.home.copy(best.mid) : null;
  }

  // The objective marker: the nearest moon while the shield is up, then the eye, then whatever's left.
  target() {
    const moons = this.of('moon');
    const pool = moons.length ? moons : !this.eye.broken ? [this.eye] : this.parts.filter((x) => !x.broken && x.kind !== 'crown');
    const best = this.nearest(pool, this.G.player.pos);
    return this.target0.copy(best ? best.mid : this.C);
  }

  bar() {
    const e = this.e, moons = this.moons();
    return { name: TEXT.name, hp: Math.max(0, e.hp), maxHp: e.maxHp, enraged: e.enraged, away: this.far, note: moons ? `moons: ${moons}` : this.eyeOpen() ? 'eye open!' : this.eye.broken ? '' : 'eye shut' };
  }

  // The objective card's progress line: what to do now, and the pores left.
  progress() {
    const moons = this.moons(), pores = this.left('pore');
    const now = moons ? `🌙 ${moons} moon${moons > 1 ? 's' : ''} left` : this.eyeOpen() ? '👁 EYE OPEN: shoot it!' : '👁 Eye shut: dodge!';
    return pores ? `${now} · pores ${pores}` : now;
  }

  // Persuasion 'easier': every gadget -30% hp, worth the same (so the bar can still be emptied); fewer Grumblings.
  easier() {
    this.easy = true;
    for (const x of this.parts) if (!x.broken && x.counted) { x.hp *= GLOBE.easier; x.mult /= GLOBE.easier; }
  }

  // Relax mode: it dozes (eye shut, moons still, no attacks, nothing hurts it) until you come back. Its Grumblings pop.
  doze(on) {
    this.dozing = on;
    if (!on) return;
    this.G.enemies.hazards.clear(this.e);
    for (const v of this.of('pore')) this.quiet(v);
    for (const m of this.of('moon')) { m.wind = 0; m.shots = 0; m.tip.material.opacity = 0.0001; }
    this.spit.wind = 0;
    this.glare.visible = this.glareTip.visible = this.sightTip.visible = false;
    this.beamT = 0;
    this.sight = null;
    this.popGrumblings();
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
    par: 100, // s: a fair fight's length (objectives.js keeps an objective's own par; other bosses get 25)
    title: 'BOSS: Grumbleglobe',
    desc: 'The whole planet is the boss. Pop its 3 moons to drop the shield, then hit its eye when it opens. Bare rock does nothing.',
    caps: new Set(['easier']),
    signText: ['THE PLANET', 'IS THE BOSS →'],
    hints: ['Moons first: their cyan tethers hold the shield.', 'Cheeks puffing? It\'s about to spit. Slide sideways.', 'Eye open means your turn. Eye shut means its turn.', 'Barrel roll through the glare for a bonus.', 'Shoot the glowing pores to stop the Grumblings.'],
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
    dispose(G) { G.ui.bossBar(null); globe.popGrumblings(); if (!e.dead) G.enemies.removeEnemy(e); },
  });
}
