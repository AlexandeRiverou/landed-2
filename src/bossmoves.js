// Boss signature moves: each boss def names a `move` (see BOSSES in enemies.js); Enemies.bossBehave dispatches to
// MOVES[move].step while the boss is engaged, and falls back to the plain orbit (or lead slot) when it returns false.
// Also here: telegraphed area hazards (Hazards / Enemies.warn), boss bodyguards (guards), the dazed stars and the
// tractor beam. Leash contract (enforced in bossBehave): moves only run engaged, special manoeuvres only start when
// `special(e)`, a breakaway calls endMoves (state, hazards and guards go), and fleeing caps every orbiter's speed.
// Speeds are enemy units (real m/s ÷ c.pace), times enemy-time s, like the rest of the enemy code.
import * as THREE from 'three';
import { rand, pick } from './texts.js';
import { waterLine } from './world.js';
import { SERPENT_GAP, disposeTree, makeCrown, makeHarvestOak, makeGiantToadstool, TOAD_FEET, makeDragonTower, DRAGON_FEET, SPIDER_FEET, MECH_FEET, HERMIT_FEET } from './models.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

// A special manoeuvre (teleport, dive, joust, hop, lane snap, jet) may only start engaged, in front-ish, not on a rematch opener.
export const special = (e) => !e.chase && !e.behind && !e.fresh;
// The carrier's steaming: water must be `depth` m deep `probe` m past its bow; it turns at `turn` rad/s. flakDmg: a
// flak burst's damage within its 16 m sphere.
export const STEAM = { probe: 120, depth: 4, turn: 0.3, flakDmg: 7 };
// Magmadora's breach (enemy-time s, m): `under` s out of reach under the lava (`underRage` enraged); `warn` s before she
// breaks, rings mark where she'll come up and dive back in, `side` m either side of where you'll be; she arcs across
// your path in `arc` s, its top `apex` m over you (kept `high` m above the lava), and spits `spit` fireballs from her
// mouth at the top (`spitRage` enraged, one fewer per frill shot off), `windup` s after her jaw opens.
export const SERPENT = { under: 3, underRage: 2, warn: 1.4, arc: 3, side: [50, 70, 85, 100], apex: 25, high: [40, 120], spit: 3, spitRage: 5, spitSpeed: 60, spitDmg: 18, windup: 0.5, clear: 80 };
const LAVA_FX = ['#ff6a1a', '#ffd23a', '#ff3a0a', '#3a1a10'];
// Glacierra's shard fans (enemy-time s, m/s, rad): she rolls her wings into the fan's plane and glows for `wind` s, then
// fires `shards` ice shards (the first fan winds up for `first` s, so there's time to read the tip) (two fewer per wingtip crystal shot off, never under `min`) spread over `spread` rad around
// where you'll be. Level wings = a flat fan (climb or dive out of it); wings on edge = an upright fan (turn out of it).
// Each shard costs `dmg` and frosts `frost` of your boost tank. Enraged, a second fan in the other plane follows.
export const SHARDS = { wind: 1.1, first: 1.8, shards: 7, min: 3, spread: 0.9, speed: 80, dmg: 14, frost: 0.35, color: '#4fc8ff' };

// Pharaoh Scarabus's mirages (enemy-time s, rad, m): every 3rd attack two mirage copies shimmer in for `last` s
// (`lastRage` enraged), at the boss's spot turned `turn` rad either way around you (up to `dy` m higher or lower); the real one takes any of the three spots. They copy its
// volleys with harmless fake orbs; only the real one casts a shadow, and a hit on the real one pops them. A volley:
// `orbs` orbs (`orbsHorn` once its horn is shot off), `dmg` each.
export const MIRAGE = { last: 8, lastRage: 10, turn: 0.6, dy: 14, fadeIn: 0.5, fadeOut: 0.6, opacity: 0.75, orbs: 5, orbsHorn: 3, speed: 70, dmg: 8, spread: 0.1, color: '#ffb03a' };

// Lady Hootrude's gusts (enemy-time s, m, enemy-unit m/s): every 3rd attack (every 2nd enraged) she stops and rears up,
// wings raised high in a V, for `tell` s (`first` the first time, with a tip; `tellRage` enraged), then beats a band of
// leaves at where you'll be when it gets there (`lead` ≈ 1/PACE: its speed is enemy units): `width` m wide (`widthTuft` with one or two ear tufts shot off), `height` m tall,
// `depth` m deep, at `speed` (`speedRage` enraged). It starts at half width and is full width by `grow` m, and is gone
// after `range` m (or 80 m past where you were). It doesn't hurt: it shoves you `push` m/s (real) along its flat travel
// (`pushTuft`; the part of it straight back against your nose is halved, so a head-on gust blows you aside rather
// than stalling you), fading at `decay`/s (Player.gust), and costs `slow` m/s of speed (none with both tufts gone). Once per
// gust, and never while you're landed, under `clear` m off the ground, or `probe` m from a hill or wall along the shove.
// Other attacks: `acorns` acorns, `acornDmg` each.
export const GUST = { tell: 1.2, first: 1.8, tellRage: 1, width: 70, widthTuft: [56, 42], height: 30, depth: 12, speed: 90, speedRage: 100, grow: 120, range: 260, lead: 1.15, push: 45, pushTuft: [32, 22], decay: 2.2, slow: 8, clear: 15, probe: 25, acorns: 5, acornSpeed: 70, acornDmg: 9, acornSpread: 0.1, acornColor: '#8a5a2b', leaves: 120 };
// Her oak (enemy-time s, m, enemy-unit m/s): she spawns sitting on its top and takes off with a hoot when you come within
// `near` m, when she's hit, or after `wait` s at most (≈2 real s); no attacks while she sits. The tree's height is scaled
// (`scale`) to meet her; none over water or under a roof (she just flies). It goes when she does, or `gone` m behind you.
// In flight (MOVES.gust.fly): a few wingbeats at `flap` Hz (`flapUp` taking off or climbing), then a glide of `glide` s;
// she banks up to `bank` rad into turns and pitches up to `pitch` rad.
export const PERCH = { near: 260, wait: 1.7, hop: 24, scale: [0.7, 1], gone: 2500, flap: 1.1, flapUp: 1.6, beats: 3, glide: [1, 1.8], bank: 0.6, pitch: 0.35 };
// Duchess Brûlée's tower and flight (enemy-time s, m, enemy-unit m/s): like Lady Hootrude's PERCH, she starts curled on
// top of her castle tower (scaled `scale`; on a cloud bank where there's no dry ground; none under a roof) and takes
// off with a roar when you come within `near` m, when hit, or after `wait` s; the tower goes when it's `gone` m behind
// you. In flight (MOVES.rake.fly) she's heavier than the owl: `beats` wingbeats at `flap` Hz (`flapUp` taking off or
// climbing), then a glide of `glide` s, banking up to `bank` rad and pitching up to `pitch` rad.
export const ROOST = { wide: 1.55, near: 260, wait: 1.7, hop: 24, scale: [0.7, 1], gone: 2500, flap: 0.8, flapUp: 1.4, beats: 2, glide: [1.2, 2], bank: 0.7, pitch: 0.35 };
// Grandma Atolla: asleep (an island) till you're within `near` m, she's hit, or `wait` s pass.
export const NAP = { near: 260, wait: 8 };
// Her swim and her Whirlpool (see MOVES.whirl): she keeps `keep` m off you, turning up to `turn` rad/s. Tell `tell` s
// (`first` the first time, `tellRage` enraged), `dive` s down to `deep` (model units), `spin` s of pull, `up` s back.
// The pull reaches planes within `r` m of the middle and under `safe` m: in at up to `pull` m/s, round at `swirl`,
// down at `sink`. Coconuts: 5 / 4 / 3 / 2 with 0-3 palms down, 9 hull each.
export const WHIRL = {
  keep: 150, turn: 0.55, far: 340, reach: 160, tell: 1.4, first: 2, tellRage: 1.1, lead: 1, dive: 0.8, deep: 7, spin: 3.2, up: 0.7,
  r: 80, safe: 70, pull: 18, swirl: 9, sink: 11, touch: 8, splash: 18, snap: 22, snapR: 32,
  coconuts: [5, 4, 3, 2], nutSpeed: 70, nutDmg: 9, nutSpread: 0.1,
};
const SPLASH = ['#ffffff', '#e8fbff', '#bfefff', '#8ad8f0'];
// Her Rake (enemy-time s, m): every 3rd attack (every 2nd enraged), with you `near`-`far` m off and not landed, she
// hovers and rears up for `tell` s (`first` the first time, with a tip; `tellRage` enraged), throat and belly glowing.
// A dotted sparkle line (and its twin on the ground under it) lies across your path at your height, where you'll be
// when it fires (at least `ahead` m in front of you; `lead` ≈ 1/PACE), following you until `lock` s before it fires.
// Then a jet of candy-pink fire sweeps it from her end to the far end in `sweep` s, leaving a curtain `len` m long
// (with 0 / 1 / 2 horns shot off), `height` m tall and `depth` m deep that hangs `linger` s and fades in `fade` s.
// Flying through it costs `dmg`, once a Rake; climbing or diving more than `height`/2 m off the line clears it (+25 Dodge!).
// One she couldn't do (you were too far, or landed) comes at the next attack in range. Other attacks: `bonbons` hot
// bonbons, `bonbonDmg` each.
export const RAKE = { tell: 1.3, first: 1.9, tellRage: 1, lock: 0.4, ahead: 50, lead: 1.15, sweep: 0.9, len: [180, 130, 90], linger: [1.2, 0.7, 0], fade: 0.4, height: 16, depth: 8, dmg: 20, near: 0, far: 260, dots: 36, flames: 54, bonbons: 5, bonbonSpeed: 70, bonbonDmg: 9, bonbonSpread: 0.1, colors: ['#ff6ac8', '#f2c23a'] };
const RAKE_FX = ['#ff6ac8', '#ffb0e0', '#ffe08a', '#ffffff'];
// Count Ribbiton's hops and tongue (enemy-time s, m, enemy-unit m/s). He starts on his giant toadstool (scaled `stool`)
// and hops off when you come within `near` m, when hit, or after `perch` s. A hop: a `crouch`, then an arc to dry, gentle,
// roofless ground on a ring `ring` m round a point `ahead` m in front of you, `turn` rad further round you, at most `reach`
// m away; airtime `air` (+ distance/`airK`), apex `apexK` x the distance (within `apex`, raised to clear the hills on the
// way by `clear` m). He lands with a squash (`settle` s, no attacks), sits `sit` s (`sitRage` enraged; once he's attacked,
// or `restless` s at most), and stops following beyond `follow` m. Attacks (only sitting): `spores` puffs (4 / 3 / 2 with
// 0 / 1 / 2 crests shot off), `sporeDmg` each; every 3rd (2nd enraged), within `lashRange` m and in clear line, a tongue
// lash: a `tell` s tell (`first` the first time, with a tip; `tellRage` enraged), aimed at where you'll be at the strike,
// locked for the last `lock` s; then the tongue shoots `tongue` m out in `out` s, stays `hold` s and goes back in `back` s.
// It hits within `width` m (+ the plane's size): `dmg`, and `slow` m/s of speed.
export const LEAP = {
  stool: 1, perch: 1.7, near: 260, crouch: 0.35, ring: 140, ahead: 80, turn: 0.8, reach: 220, air: [1.1, 1.6], airK: 400,
  apex: [30, 70], apexK: 0.3, clear: 15, settle: 0.3, sit: [1.6, 2.4], sitRage: [1.1, 1.6], restless: 3.5, follow: 700,
  spores: [4, 3, 2], sporeSpeed: 62, sporeDmg: 9, spread: 0.12, sporeColor: '#c66cff', sporeColor2: '#3fd6c6',
  lashRange: 200, tongue: 230, tell: 1.2, first: 1.6, tellRage: 1, lock: 0.35, out: 0.2, hold: 0.15, back: 0.3, width: 6, dmg: 18, slow: 10,
  dust: ['#c66cff', '#3fd6c6', '#e8e0d0', '#9dff6a'],
};
// Queen Quartzelle's walk and her Web Wall (enemy-time s, m, enemy-unit m/s). She walks upside down on the cave roof
// (on the ground where there's no roof), `walk` m/s (`walkRage` enraged; a gait cycle per `stride` m), turning up to
// `turn` rad/s, toward a spot `ahead` m in front of you and `side` m to one side (straight at you beyond `chase` m), and follows the rock up and down at up to `climb` m/s (`drop` when
// she has a long way to go, like dropping off a roof that ends). Attacks: `shards` crystal shards, `shardDmg` each. Every
// 3rd (2nd enraged), with you within `far` m and not landed: she rears up, front legs high, for `tell` s (`first` the
// first time, with a tip; `tellRage` enraged) while a web spins up across your path, where you'll be `lead` s after it
// sets (following you until `lock` s before), facing the way you fly. Then it hangs, solid, for `hold` s: `R` m round
// (with 0 / 1 / 2 / 3 back crystals shot off), anchored to the roof and floor. Flying through it costs `dmg` and `slow`
// m/s of speed (it tears); getting by it untouched within `pass` m of its edge, or barrel-rolling through it, is +25 Dodge!
// DJ Gigawatt, the Boombox Mech (Neon Grid, Blockland): stomps the ground toward a spot beside your path (`ahead` m on,
// `side` m aside; straight at you beyond `chase` m) at `walk`/`walkRage`, so a plane outruns him. Every `every` s
// (`everyRage` enraged, the first `opener` s in) he kicks on the jets in his sneakers and skates past you at
// `dash`/`dashRage` to a spot `front` m ahead and `frontSide` m aside (giving up after `dashMax` s), then keeps pace there
// `show` s, turned round to face you: your clear shot at his LED eyes. Most attacks are `notes` neon notes from his
// speakers. Every 3rd (2nd enraged), in front of you, he crouches, arms up, speakers swelling, for `tell` s (`first` the
// first time, with a tip; `tellRage` enraged) and stomps a Bass Drop: a neon shockwave wall riding the ground, `rise` m over your height (`H` to `cap` by speakers
// lost) that spreads along the ground from him at `ringSpeed` out to `ringMax` m. Caught inside it (under its top) costs
// `dmg` hull and `slow` m/s; climbing over it within `over` m of its top is a dodge (+25, he's dazed) if you were under it when it rose.
export const BEAT = {
  walk: 40, walkRage: 48, turn: 1.4, ahead: 80, side: 55, near: 12, chase: 220, stride: 15, tilt: 0.3,
  every: 6, everyRage: 4, opener: 3, dash: 110, dashRage: 125, dashTurn: 2.6, dashMax: 7, front: 140, frontSide: 25, show: 9,
  tell: 1.3, first: 1.9, tellRage: 1, reach: 250, cliff: 2, ringSpeed: 90, ringMax: 280, H: [28, 22, 16], cap: [60, 48, 36], rise: 12, under: 6, dmg: 18, slow: 10, over: 60,
  notes: 4, noteSpeed: 75, noteDmg: 9, spread: 0.08, colors: ['#ff3ad0', '#3af0ff'],
};
const NEON = ['#ff3ad0', '#3af0ff', '#8a4aff', '#ffffff'];
const WALL_N = 64, _neonA = new THREE.Color(NEON[0]), _neonB = new THREE.Color(NEON[1]); // the Bass Drop wall's columns, and its top band's two colours
// Baron Barnacle (geyser, the reef): he walks the seabed like DJ Gigawatt (BEAT's walk numbers), but side-on while he
// trails (sideways), face and eyestalks turned your way. Most attacks are `bubbles` bubbles from his claws (his mouth
// once both are off). Every 3rd (2nd enraged), in front of you, he raises both claws and drums the seabed for `tell` s
// (`first` the first time, with a tip; `tellRage` enraged): a Geyser Row lands `lead` s of flight past where you'll be
// at the eruption, `width` m across your way in `slots` slots `gap` m apart, following you until `lock` s before it
// erupts. Sand puffs mark each column's spot, then the columns (radius `r`) roar up from the seabed to the surface in
// `rise` s, hold `last` s and fizz out in `fade` s (harmless while fading). `gaps[k]` slots stay clear (k = claws lost),
// one of them always `near` m off your line. Flying into a column costs `dmg` hull and `slow` m/s and bobs you up
// `shove` m/s; crossing the row through a gap (or rolling through a column) is a dodge (+25, he's dazed).
export const GEYSER = {
  ...BEAT, sideways: true, walk: 38, walkRage: 46, stride: 10, tilt: 0.3, dash: 105, dashRage: 120,
  tell: 1.3, first: 1.9, tellRage: 1, ringMax: 280, lead: 0.9, lock: 0.8, width: 252, slots: 15, gap: 18, r: 7, near: [15, 40],
  rise: 0.5, last: 3, fade: 0.6, gaps: [3, 5, 7], dmg: 16, slow: 12, shove: 8, tall: 160,
  bubbles: 4, bubbleSpeed: 70, bubbleDmg: 9, spread: 0.09, colors: ['#e8fbff', '#9ae8ff'],
};
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _q0 = new THREE.Quaternion(), _qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // the Geyser Row's instances
export const WEB = {
  walk: 46, walkRage: 54, turn: 1.6, ahead: 80, side: 60, near: 12, chase: 220, stride: 18, climb: 60, drop: 110, tilt: 0.35, far: 300,
  // Now and then (every `every` s, `everyRage` enraged, the first `opener` s in) she dashes past you at `dash`/`dashRage`
  // (faster than a boosting plane) to a spot `front` m ahead and `frontSide` m aside, gives up after `dashMax` s, then
  // keeps pace there `show` s, turned round to face you: your clear shot at her eyes (no Web Wall meanwhile). Then she
  // drops back. Every `dropEvery`th time, once ahead she lets go of the roof and drops on a silk line to the cave floor,
  // walking there `floorTime` s (an easy target) before she climbs her line back up.
  every: 6, everyRage: 4, opener: 3, dash: 115, dashRage: 130, dashTurn: 2.6, dashMax: 7, front: 140, frontSide: 25, show: 9,
  dropEvery: 2, floorTime: 11,
  tell: 1.3, first: 1.9, tellRage: 1, lock: 0.8, lead: 0.9, hold: 3, R: [24, 20, 16, 12], pass: 40, dmg: 16, slow: 14,
  shards: 5, shardSpeed: 75, shardDmg: 9, spread: 0.1, colors: ['#b48cff', '#e6d8ff'], spokes: 12, turns: 6,
};
const SILK = ['#ffffff', '#e6d8ff', '#b48cff', '#7affff'];
const SAC = new THREE.Color('#ff9ad6'), SAC_HOT = new THREE.Color('#fff0a0');
const BEAM_LINE = new THREE.CylinderGeometry(1.1, 1.1, 1, 6, 1, true);
// A world mesh of height 1 along +Y stretched from `from` along unit `dir` for `len` m (an aim line, a tongue).
function place(mesh, from, dir, len) {
  mesh.position.copy(from).addScaledVector(dir, len / 2);
  mesh.quaternion.setFromUnitVectors(Y, dir);
  mesh.scale.set(1, len, 1);
}
// A boss's shadow on the ground under it (`R` m across at the ground, bigger and softer as it climbs), none over water
// or above ~200 m. One flat disc per boss, in the scene (dropBoss).
function shade(en, e, R) {
  const u = e.mesh.userData, G = en.G;
  if (!u.groundShadow) {
    u.groundShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    u.groundShadow.rotation.x = -Math.PI / 2;
    G.scene.add(u.groundShadow);
  }
  const sh = u.groundShadow, land = G.terrain.surfaceHeight(e.pos.x, e.pos.z, e.pos.y), h = e.pos.y - land, k = 1 - h / 200;
  sh.visible = Number.isFinite(land) && land > waterLine() && k > 0.02;
  if (!sh.visible) return;
  sh.position.set(e.pos.x, land + 0.6, e.pos.z);
  sh.scale.setScalar(R * (1 + h / 600));
  sh.material.opacity = 0.4 * Math.min(1, k * 1.5);
}
const LEAF_COLORS = ['#d2691e', '#e8a33a', '#b8452a', '#f2c14e', '#8a5a2b'];
const _o = new THREE.Object3D(), CHEST = new THREE.Color('#ffa040'), CHEST_HOT = new THREE.Color('#ffe08a');

// ---------- small helpers ----------

// Your flat heading, smoothed (as the lead bosses do) so sharp turns don't whip a boss around.
function heading(e, p, dt, rate = 1.5) {
  _a.set(p.forward.x, 0, p.forward.z);
  if (_a.lengthSq() < 0.01) _a.set(0, 0, -1);
  if (e.heading.lengthSq() < 0.5) e.heading.copy(_a.normalize());
  else e.heading.lerp(_a.normalize(), 1 - Math.exp(-dt * rate)).normalize();
  return e.heading;
}
const flatFwd = (p, out) => { out.set(p.forward.x, 0, p.forward.z); if (out.lengthSq() < 0.01) out.set(0, 0, -1); return out.normalize(); };
const sideOf = (h, out) => out.set(-h.z, 0, h.x);

// Steer toward a point: velocity (target - pos) × gain, capped at speed, eased in at rate.
function arrive(e, target, speed, dt, gain = 1.6, rate = 3) {
  _c.copy(target).sub(e.pos).multiplyScalar(gain).clampLength(0, speed);
  e.vel.lerp(_c, 1 - Math.exp(-dt * rate));
}
// Slow to a hover (with a gentle bob).
function park(e, dt, rate = 3) { e.vel.lerp(_c.set(0, Math.sin(e.t * 1.3) * 1.5, 0), 1 - Math.exp(-dt * rate)); }

// A height that's safe for a boss of radius r at (x, z): over the ground (or sea), under any cave roof.
function safeY(G, x, z, y, r) {
  const floor = Math.max(G.terrain.surfaceHeight(x, z, y), waterLine()) + r + 8;
  const roof = G.terrain.ceilingHeight(x, z, y) - r - 8;
  return roof < floor ? (floor + roof) / 2 : THREE.MathUtils.clamp(y, floor, roof);
}
const floorAt = (G, v) => Math.max(G.terrain.surfaceHeight(v.x, v.z, v.y), waterLine());

// A spot `d` m from where you'll be in `lookT` s, `ang` rad off your nose, `up` m above you, made safe for the boss.
function spotNear(en, e, d, ang, up, lookT = 0) {
  const p = en.G.player;
  const dir = flatFwd(p, _b).applyAxisAngle(Y, ang);
  const v = p.pos.clone().addScaledVector(flatFwd(p, _a), p.speed * lookT).addScaledVector(dir, d);
  v.y = safeY(en.G, v.x, v.z, p.pos.y + up, e.radius);
  return v;
}

// Dodging a big move unhurt is worth +25 and leaves the boss dazed for a moment.
function dodgeStart(en, e) { e.mv.dodge = en.G.time; }
function dodgeEnd(en, e) {
  const m = e.mv, G = en.G, p = G.player;
  if (!m || m.dodge == null) return;
  const since = G.time - m.dodge;
  m.dodge = null;
  if (p.dead || p.sinceHit < since) return;
  G.score += 25;
  G.fx.popText(p.pos.clone().addScaledVector(p.forward, 25).add(_a.set(0, 6, 0)), '+25 Dodge!');
  G.audio.tone(990, 0.14, { type: 'triangle', vol: 0.06 });
  G.audio.tone(1320, 0.18, { type: 'triangle', vol: 0.05, delay: 0.09 });
  daze(e, 1.5);
}
export function daze(e, s) { e.dazed = Math.max(e.dazed || 0, s); }

// A falling bomb or egg: an orb with gravity (not aimed).
function drop(en, e, at, color, dmg, size, vel = null) {
  const s = en.fireOrb(at, _a.set(0, -1, 0), 4, dmg, color, size);
  if (vel) s.vel.add(vel);
  s.g = 25;
  return s;
}

// ---------- guards: regular enemies that hold a slot around their boss ----------

export const guardsOf = (en, e, kind) => en.list.filter((x) => x.guard && x.guard.boss === e && x.guard.kind === kind && !x.guard.pop);
function addGuard(en, e, type, kind, slot) {
  const g = en.spawn(type, guardSlot(e, kind, slot, new THREE.Vector3()));
  g.guard = { boss: e, kind, slot };
  return g;
}
const freeSlot = (en, e, kind, n) => { const used = new Set(guardsOf(en, e, kind).map((g) => g.guard.slot)); for (let k = 0; k < n; k++) if (!used.has(k)) return k; return -1; };
// Let them go (CHARGE!): they turn back into ordinary enemies.
function releaseGuards(en, e, kind) { for (const g of guardsOf(en, e, kind)) g.guard = null; }
// Pop them (a ring reset, a breakaway): they burst on their next update. No kind: all of that boss's guards.
function popGuards(en, e, kind = null) { for (const g of en.list) if (g.guard?.boss === e && (!kind || g.guard.kind === kind)) g.guard.pop = true; }

const SHELL = Array.from({ length: 8 }, (_, k) => { const y = 1 - (2 * (k + 0.5)) / 8, r = Math.sqrt(1 - y * y), a = k * 2.39996; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); });
function guardSlot(b, kind, slot, out) {
  const t = b.t;
  if (kind === 'ring') {
    // Mother Spiky's children: 8 slots on a slowly spinning, breathing ring (70 to 110 m). Some slots are always empty.
    const a = slot * (TAU / 8) + t * 0.4, r = 90 + 20 * Math.sin(t * 0.5);
    return out.set(Math.cos(a) * r, Math.sin(t * 0.8 + slot) * 6, Math.sin(a) * r).add(b.pos);
  }
  if (kind === 'royal') { const a = slot * (TAU / 4) + t * 1.2; return out.set(Math.cos(a) * 25, 4, Math.sin(a) * 25).add(b.pos); }
  return out.copy(SHELL[slot % 8]).applyAxisAngle(Y, t * 1.5).multiplyScalar(20).add(b.pos); // a tight ball of bees
}
// Per frame, from Enemies.update. True when it should go (its boss is gone, or its ring was reset).
export function guardStep(en, g) {
  const b = g.guard.boss;
  if (b.dead || g.guard.pop) { en.G.fx.emit(g.pos, 10, { colors: ['#ffffff', '#c8c8d8'], speed: 20, life: 0.6, size: 5 }); return true; }
  g.vel.copy(guardSlot(b, g.guard.kind, g.guard.slot, _a)).sub(g.pos).multiplyScalar(6).clampLength(0, 160);
  return false;
}

// ---------- telegraphed hazards ----------

const GEO = {
  disc: new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
  column: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
  sphere: new THREE.SphereGeometry(1, 16, 12),
};
const POOL_MAX = 24;
// A flak shell in flight (see Hazards.warn `from`): a dark slug with a hot orange nose glow.
const SHELL_GEO = new THREE.SphereGeometry(2.2, 8, 6), SHELL_MAT = new THREE.MeshBasicMaterial({ color: '#ffb03a' });
// Translucent warning shapes: opacity eases 0.2 → 0.6 with a slow 2 Hz pulse (never a flash), then `onFire` runs.
// Visual-only clouds (`cloud`) fade out instead. Meshes are pooled per shape; materials stay with their mesh.
export class Hazards {
  constructor(G) { this.G = G; this.list = []; this.pool = {}; }

  mesh(shape) {
    const m = (this.pool[shape] ||= []).pop() || new THREE.Mesh(GEO[shape], new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.G.scene.add(m);
    return m;
  }

  // dir: a column stands along this unit vector (default straight up), e.g. a planet's surface normal.
  // from: a shell flies there from this point over the warning time, on an arc, trailing smoke (the carrier's flak), and
  // bursts as the hazard fires.
  warn(pos, r, color, t, onFire, { shape = 'disc', owner = null, h = 1, dir = null, from = null } = {}) {
    const mesh = this.mesh(shape);
    mesh.material.color.set(color);
    mesh.material.opacity = 0.2;
    mesh.position.copy(pos);
    if (dir) mesh.quaternion.setFromUnitVectors(Y, dir); else mesh.quaternion.identity(); // pooled: undo a last tilt
    mesh.scale.set(r, shape === 'column' ? h : r, r);
    const hz = { mesh, shape, pos: mesh.position, r, t: 0, T: t, onFire, owner, born: this.G.time };
    if (from) {
      hz.from = from.clone();
      hz.shell = (this.shells ||= []).pop() || new THREE.Mesh(SHELL_GEO, SHELL_MAT);
      hz.shell.position.copy(from);
      this.G.scene.add(hz.shell);
    }
    this.list.push(hz);
    return hz;
  }

  cloud(pos, r, color, t, owner = null) {
    const hz = this.warn(pos, r, color, t, null, { shape: 'sphere', owner });
    hz.fade = true;
    hz.mesh.material.opacity = 0.55;
    return hz;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const hz = this.list[i];
      hz.t += dt;
      const k = Math.min(1, hz.t / hz.T);
      if (hz.fade) hz.mesh.material.opacity = 0.55 * (1 - k);
      else hz.mesh.material.opacity = (0.2 + 0.4 * k * k * (3 - 2 * k)) * (0.88 + 0.12 * Math.sin(hz.t * TAU * 2));
      if (hz.shell) { // up and over: an arc as high as a third of the way
        const sh = hz.shell.position.lerpVectors(hz.from, hz.pos, k);
        sh.y += Math.sin(k * Math.PI) * hz.from.distanceTo(hz.pos) * 0.33;
        if (Math.random() < dt * 30) this.G.fx.emit(sh, 1, { colors: ['#9aa0a6', '#c8ccd2'], speed: 3, life: 0.9, size: 5 });
      }
      if (k < 1) continue;
      this.release(i);
      hz.onFire?.(hz);
    }
  }

  release(i) {
    const hz = this.list[i];
    this.list.splice(i, 1);
    this.G.scene.remove(hz.mesh);
    if (hz.shell) { this.G.scene.remove(hz.shell); this.shells.push(hz.shell); hz.shell = null; }
    const pool = this.pool[hz.shape];
    if (pool.length < POOL_MAX) pool.push(hz.mesh);
    else hz.mesh.material.dispose();
  }

  // Without firing: everything (relax mode), or one boss's (breakaway, death).
  clear(owner = undefined) { for (let i = this.list.length - 1; i >= 0; i--) if (owner === undefined || this.list[i].owner === owner) this.release(i); }
}

// ---------- dazed stars, tractor beam ----------

let starMat = null;
function makeStars() {
  if (!starMat) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2, r = k % 2 ? 12 : 28; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    c.closePath();
    c.fillStyle = '#ffe23a'; c.strokeStyle = '#8a5a00'; c.lineWidth = 4; c.fill(); c.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    starMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  }
  const g = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const s = new THREE.Sprite(starMat);
    const a = (k / 5) * TAU;
    s.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
    s.scale.set(0.35, 0.35, 1);
    g.add(s);
  }
  return g;
}
const BEAM_GEO = new THREE.CylinderGeometry(0.12, 1, 1, 20, 1, true); // narrow end up (+Y) at the saucer

// ---------- per-boss visuals (from Enemies.animate) ----------

export function animateBoss(en, e, dt) {
  const m = e.mv, body = e.mesh.children[0], ease = 1 - Math.exp(-dt * 8);
  // Body squash (jelly bell, octopus squeeze, Mother Spiky inflating), the fort's duck, Gary's barrel roll.
  const s = m?.bodyS || [1, 1, 1];
  body.scale.set(body.scale.x + (s[0] - body.scale.x) * ease, body.scale.y + (s[1] - body.scale.y) * ease, body.scale.z + (s[2] - body.scale.z) * ease);
  body.position.y += (-(m?.sink || 0) * 4 - body.position.y) * (1 - Math.exp(-dt * 5));
  body.rotation.z = m?.rollT > 0 ? (1 - m.rollT / 0.8) * TAU : 0;
  if (m?.blur && e.mesh.userData.legs) e.mesh.userData.legs.forEach((l, k) => { l.rotation.x = Math.sin(e.t * 30 + k * 1.3) * 0.5; });
  // The Mothership's blink: shrink away, pop up elsewhere, grow back.
  if (m?.scale0) e.mesh.scale.setScalar(m.scale0 * Math.max(0.001, m.k ?? 1));
  // Dazed: a little ring of stars over its head, turning slowly.
  if (e.dazed > 0 && !e.stars) { e.stars = makeStars(); en.G.scene.add(e.stars); }
  if (e.stars) {
    e.stars.visible = e.dazed > 0;
    e.stars.position.set(e.pos.x, e.pos.y + e.radius * 1.1, e.pos.z);
    e.stars.scale.setScalar(e.radius);
    e.stars.rotation.y += dt * 1.6;
  }
  if (e.beam) {
    const on = m?.beamT > 0 && !en.G.player.dead;
    e.beam.visible = on;
    if (on) {
      const p = en.G.player.pos, len = _a.subVectors(e.pos, p).length();
      e.beam.position.copy(p).addScaledVector(_a, 0.5);
      e.beam.quaternion.setFromUnitVectors(Y, _a.normalize());
      e.beam.scale.set(6, len, 6);
      e.beam.material.opacity = 0.13 + 0.04 * Math.sin(e.t * TAU * 1.5);
    }
  }
}

// A breakaway: drop the move (and put the model back), its hazards, stingers and guards (they pop). Then e.mv = null.
export function endMoves(en, e) {
  const m = e.mv;
  if (m?.scale0) e.mesh.scale.setScalar(m.scale0);
  if (m?.immune) e.shield = 1;
  en.hazards.clear(e);
  clearBlobs(en, e);
  popGuards(en, e);
  if (e.mesh.userData.mirages) MOVES.mirage.hide(e);
  if (e.mesh.userData.owl) MOVES.gust.hide(e);
  if (e.mesh.userData.dragon) MOVES.rake.hide(e);
  if (e.mesh.userData.toad) MOVES.leap.hide(e);
  if (e.mesh.userData.turtle) { MOVES.whirl.hide(e); en.G.player.gustDecay = 2.2; }
  if (e.mesh.userData.spider) MOVES.web.hide(e);
  if (e.mesh.userData.mech) MOVES.beat.hide(e);
  if (e.mesh.userData.hermit) MOVES.geyser.hide(e);
  e.mv = null;
}
// The boss is gone (death, relax mode): its hazards, stingers and extras go too; guards pop on their next update.
export function dropBoss(en, e) {
  en.hazards.clear(e);
  clearBlobs(en, e);
  if (e.stars) en.G.scene.remove(e.stars);
  if (e.beam) { en.G.scene.remove(e.beam); e.beam.material.dispose(); }
  const u = e.mesh.userData;
  if (u.free) for (const o of [...u.mirages, u.shadow]) { en.G.scene.remove(o); disposeTree(o); } // they live in the scene
  if (u.leaves) { en.G.scene.remove(u.leaves); disposeTree(u.leaves); u.leaves.dispose(); u.leaves = null; } // Lady Hootrude's gust leaves
  if (u.rakeFx) { for (const x of Object.values(u.rakeFx)) { en.G.scene.remove(x); disposeTree(x); if (x.dispose) x.dispose(); } u.rakeFx = null; } // Duchess Brûlée's sparkle line, flames and jet
  if (u.dragon) e.mesh.traverse((o) => o.isInstancedMesh && o.dispose()); // her scales' instance buffers (disposeTree frees only geometry and material)
  if (e.markerOwn) { e.marker.material.dispose(); e.markerOwn = false; } // Queen Quartzelle's flipped marker
  if (u.webFx) { en.G.scene.remove(u.webFx.group); u.webFx.disc.geometry.dispose(); u.webFx.disc.children[0].geometry.dispose(); u.webFx.silk.dispose(); u.webFx.fill.dispose(); u.webFx = null; } // Queen Quartzelle's web (its threads share BEAM_LINE)
  if (u.dragFx) { en.G.scene.remove(u.dragFx); u.dragFx.material.dispose(); u.dragFx = null; } // and her drop line
  if (u.wallFx) { en.G.scene.remove(u.wallFx.group); u.wallFx.wall.geometry.dispose(); u.wallFx.top.geometry.dispose(); u.wallFx.wallMat.dispose(); u.wallFx.topMat.dispose(); u.wallFx = null; } // DJ Gigawatt's Bass Drop wall
  if (u.rowFx) { const f = u.rowFx; en.G.scene.remove(f.group); for (const x of [f.core, f.foam, f.mark]) { x.geometry.dispose(); x.dispose(); } f.coreMat.dispose(); f.foamMat.dispose(); f.markMat.dispose(); u.rowFx = null; } // Baron Barnacle's Geyser Row
  if (u.whirlFx) { en.G.scene.remove(u.whirlFx); disposeTree(u.whirlFx); u.whirlFx = null; } // Grandma Atolla's whirlpool
  if (u.tree) { en.G.scene.remove(u.tree); disposeTree(u.tree); u.tree = null; } // Lady Hootrude's oak, Count Ribbiton's toadstool, Duchess Brûlée's tower
  if (u.groundShadow) { en.G.scene.remove(u.groundShadow); disposeTree(u.groundShadow); u.groundShadow = null; } // a boss's shadow (shade)
  if (u.tongueFx) { // Count Ribbiton's aim line and tongue (the tongue and its tip share a material)
    const fx = Object.values(u.tongueFx);
    for (const x of fx) { en.G.scene.remove(x); if (x.geometry !== BEAM_LINE) x.geometry.dispose(); }
    new Set(fx.map((x) => x.material)).forEach((m) => m.dispose());
    u.tongueFx = null;
  }
}
function clearBlobs(en, e) {
  for (let i = en.shots.length - 1; i >= 0; i--) if (en.shots[i].owner === e) { en.G.scene.remove(en.shots[i].mesh); en.shots.splice(i, 1); }
}

// ---------- the moves ----------
// step(en, e, c) with c = { p, toP, dist, dt, pace, fight }: set e.vel, return true (false: plain orbit / lead slot).
// hold(e): true while the boss shouldn't start a regular attack. Extra entry points are called from the attack switch.

// The walk shared by the striding land bosses (DJ Gigawatt, Baron Barnacle), B their numbers (see BEAT), ground(en, e,
// x, z) their standing height there, tip the line shown on their first dash. Sets e.pos, e.yaw and m's gait.
function strideCycle(en, e, c, B, ground, tip) {
  const G = en.G, p = c.p, dt = c.dt, m = e.mv;
  // His run: mostly he trails toward a spot beside your path (a plane outruns him); every so often he skates past
  // you to a spot well ahead, then keeps pace there facing you. Not while crouching for a Bass Drop (or drumming).
  const f = flatFwd(p, _a), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  m.clock -= dt;
  const lead = (e.pos.x - p.pos.x) * f.x + (e.pos.z - p.pos.z) * f.z;
  if (m.phase === 'trail' && m.clock <= 0 && m.tell <= 0 && !p.landed) {
    m.phase = 'dash'; m.clock = B.dashMax; m.dashes++;
    if (!e.dashTip) { e.dashTip = true; G.ui.notify(tip, 'info', 3, 1); }
  } else if (m.phase === 'dash' && (m.clock <= 0 || lead > B.front * 0.7)) {
    m.phase = 'show'; m.clock = B.show;
  } else if (m.phase === 'show' && m.clock <= 0) {
    m.phase = 'trail'; m.clock = e.enraged ? B.everyRage : B.every;
  }
  const run = m.phase !== 'trail', far = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) > B.chase;
  const spot = run ? B.front : B.ahead, off = run ? B.frontSide * m.side : far ? 0 : B.side * m.side;
  const tx = p.pos.x + f.x * spot - f.z * off, tz = p.pos.z + f.z * spot + f.x * off;
  const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz), turnRate = run ? B.dashTurn : B.turn;
  e.yaw ??= Math.atan2(dx, dz);
  m.head ??= e.yaw;
  let go = 0;
  // (Keeping pace ahead of you he crouches on the move: a Bass Drop never lets you fly up behind him.)
  if ((m.phase === 'show' || (m.tell <= 0 && m.slam <= 0)) && d > (m.phase === 'show' ? 1 : B.near)) {
    const turn = wrap(Math.atan2(dx, dz) - m.head);
    m.head += THREE.MathUtils.clamp(turn, -turnRate * dt, turnRate * dt);
    const top = run ? (e.enraged ? B.dashRage : B.dash) : e.enraged ? B.walkRage : B.walk;
    const want = m.phase === 'show' ? Math.min(top, p.speed / c.pace + d * 1.5) : top * Math.min(1, d / 40);
    go = want * Math.max(0.25, Math.cos(Math.min(Math.abs(turn), 1.4)));
    const nx = e.pos.x + Math.sin(m.head) * go * dt, nz = e.pos.z + Math.cos(m.head) * go * dt;
    // Only on dry land, and never down a cliff (steeper than `cliff`:1) or down to more than `reach` m below you (a pit
    // or a canyon floor would put him out of your reach): blocked, he turns away. Level or uphill is always fine.
    const gn = G.terrain.surfaceHeight(nx, nz), drop = G.terrain.surfaceHeight(e.pos.x, e.pos.z) - gn;
    if (gn > waterLine() + 1 && (drop <= 0.5 || (drop <= B.cliff * go * dt + 0.5 && gn > p.pos.y - B.reach))) { e.pos.x = nx; e.pos.z = nz; m.walked += go * dt; } else { m.head += turnRate * dt * m.side; go = 0; m.blocked = (m.blocked || 0) + 1; }
  }
  // He looks where he goes, except when keeping pace ahead of you: then he turns round to face you.
  // (B.sideways: a crab, trailing, walks side-on with his face turned your way.)
  const toYou = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  let look = m.phase === 'show' ? toYou : m.head;
  if (B.sideways && m.phase === 'trail') { const l = m.head + Math.PI / 2, r = m.head - Math.PI / 2; look = Math.abs(wrap(l - toYou)) < Math.abs(wrap(r - toYou)) ? l : r; }
  e.yaw += THREE.MathUtils.clamp(wrap(look - e.yaw), -B.dashTurn * dt, B.dashTurn * dt);
  m.moving += ((go > 1 ? go : 0) - m.moving) * (1 - Math.exp(-dt * 6));
  m.gait += (Math.min(m.moving, B.walkRage) * dt) / B.stride; // (skating, his legs don't run any faster)
  // Feet on the ground, and lean with it along his way.
  const want = ground(en, e, e.pos.x, e.pos.z), dy = want - e.pos.y, rate = Math.max(150, m.moving * 8);
  e.pos.y += THREE.MathUtils.clamp(dy, -rate * dt, rate * dt);
  const o = 3 * e.mesh.scale.x, sx = Math.sin(e.yaw) * o, sz = Math.cos(e.yaw) * o, T = G.terrain;
  const slope = -Math.atan2(T.surfaceHeight(e.pos.x + sx, e.pos.z + sz) - T.surfaceHeight(e.pos.x - sx, e.pos.z - sz), 2 * o);
  m.pitch += (THREE.MathUtils.clamp(Number.isFinite(slope) ? slope : 0, -B.tilt, B.tilt) - m.pitch) * (1 - Math.exp(-dt * 4));
  if (m.walked > 400 && !run) { m.walked = 0; m.side = -m.side; }
}

export const MOVES = {
  // The Mothership: hovers, and every 3rd attack blinks (column warning at the destination, shrink, jump, grow).
  blink: {
    step(en, e, c) {
      const m = e.mv ||= { scale0: 0, k: 1 };
      if (m.blinkT >= 0) {
        m.blinkT += c.dt;
        m.k = m.blinkT < 0.8 ? 1 : m.blinkT < 1.2 ? 1 - (m.blinkT - 0.8) / 0.4 : Math.min(1, (m.blinkT - 1.2) / 0.4);
        if (m.blinkT > 1.6 && m.jumped) { m.blinkT = -1; m.k = 1; e.mesh.scale.setScalar(m.scale0); m.scale0 = 0; }
      }
      if (m.beamT > 0) {
        m.beamT -= c.dt;
        const p = c.p;
        // The tractor beam pulls you in at 6 m/s (real); boosting breaks free.
        if (!p.boosting && !p.dead) p.pos.addScaledVector(_a.copy(c.toP).normalize(), (-6 * c.dt) / c.pace);
        if (m.beamT <= 0) dodgeEnd(en, e);
      }
      if (c.dist > c.fight + 80) arrive(e, _b.copy(e.pos).sub(c.p.pos).setY(0).setLength(c.fight).add(c.p.pos).setY(c.p.pos.y + 30), en.cruise(e), c.dt, 1, 1.2);
      else park(e, c.dt);
      return true;
    },
    hold: (e) => e.mv?.blinkT >= 0,
    start(en, e) {
      const m = e.mv;
      if (!m || m.blinkT >= 0) return false;
      const dest = spotNear(en, e, rand(150, 200), rand(-1, 1) * (Math.PI / 3), rand(10, 40), 1.2);
      m.scale0 = e.mesh.scale.x;
      m.blinkT = 0;
      m.jumped = false;
      en.G.audio.tone(300, 1.2, { type: 'sine', vol: 0.05, slide: 600 });
      en.warn(dest, 30, '#5aff7a', 1.2, () => {
        // No teleporting after a fleeing player: if you've turned away, it just reappears where it was.
        if (!e.behind) {
          en.G.fx.emit(e.pos, 30, { colors: ['#7aff5a', '#ffffff'], speed: 40, life: 0.6, size: 6 });
          e.pos.copy(dest);
          e.vel.set(0, 0, 0);
          en.G.audio.tone(900, 0.25, { type: 'sine', vol: 0.06, slide: -500 });
          if (e.enraged) { m.beamT = 2; dodgeStart(en, e); beamMesh(en, e); en.G.audio.tone(90, 2, { type: 'sawtooth', vol: 0.04, slide: 160 }); }
        }
        m.jumped = true;
      }, { shape: 'column', owner: e, h: 140 });
      return true;
    },
  },

  // Thunderclaus: looms ~75 m above and 200 m ahead of you (near the top of the view, not over it); lightning volleys
  // strike along your path, each spot marked by a yellow ring at the cloud base, one at the bottom and a thin pale spine
  // between them (nothing to block your view).
  loom: {
    step(en, e, c) {
      const h = heading(e, c.p, c.dt);
      arrive(e, _b.copy(c.p.pos).addScaledVector(h, 200).add(_a.set(0, 75, 0)), en.cruise(e), c.dt, 1.2, 1);
      return true;
    },
    strike(en, e) {
      const G = en.G, p = G.player, f = flatFwd(p, new THREE.Vector3()), side = sideOf(f, new THREE.Vector3());
      const n = e.enraged ? 5 : 3;
      for (let k = 0; k < n; k++) {
        // A bolt from the cloud base (55 m over you) down past your altitude: don't fly between the rings. Fuses stagger
        // 0.12 s each, so the volley rolls along your path.
        const at = p.pos.clone().addScaledVector(f, p.speed * 1.2 + k * 35).addScaledVector(side, rand(-20, 20));
        const top = Math.min(p.pos.y + 55, G.terrain.ceilingHeight(at.x, at.z, p.pos.y) - 5), bottom = Math.max(floorAt(G, at), p.pos.y - 80);
        const fuse = 1.2 + 0.12 * k;
        en.warn(at.clone().setY(top), 22, '#ffe14a', fuse, (hz) => {
          const x = hz.pos.x, z = hz.pos.z;
          // Two bolts ~3 m apart read as one thick one.
          for (const o of [-1.5, 1.5]) G.fx.lightning(_a.set(x + o, top, z - o), _b.set(x - o, bottom, z + o));
          G.fx.emit(_a.set(x, THREE.MathUtils.clamp(p.pos.y, bottom, top), z), 12, { colors: ['#fff7a0', '#ffffff'], speed: 25, life: 0.5, size: 5 });
          if (k === 0) G.audio.zap();
          const dx = p.pos.x - x, dz = p.pos.z - z;
          if (dx * dx + dz * dz < 22 * 22 && p.pos.y < top + 5 && p.pos.y > bottom - 5) p.damage(18);
        }, { shape: 'ring', owner: e });
        en.warn(at.clone().setY(bottom + 2), 22, '#ffe14a', fuse, null, { shape: 'ring', owner: e }); // where it lands
        en.warn(at.clone().setY((top + bottom) / 2), 0.45, '#fff7a0', fuse, null, { shape: 'column', owner: e, h: Math.max(10, top - bottom) }); // the spine
      }
      G.audio.tone(70, 0.9, { type: 'sawtooth', vol: 0.05, slide: -20 });
    },
  },

  // Baron von Blimpenstein: straight 500 m runs across your path, 110 m ahead and 70 m up, with an oval U-turn at each
  // end. A run's salvo (armed by its attack, with a horn) drops as it crosses over your path, where he eases to 60%
  // (the middle 120 m): your best shot.
  racetrack: {
    step(en, e, c) {
      const p = c.p, h = heading(e, p, c.dt, 1);
      const m = e.mv ||= { s: -250, dir: e.orbitPhase ? -1 : 1, turn: -1, runs: 0, armed: false, drops: 0, dropT: 0 };
      let s, D = 110;
      if (m.turn < 0) {
        m.s += m.dir * en.cruise(e) * 1.4 * (Math.abs(m.s) < 60 ? 0.6 : 1) * c.dt;
        if (m.s * m.dir >= 250) { m.turn = 0; m.s = 250 * m.dir; }
        s = m.s;
      } else {
        // An oval loop out past the end of the line and back onto it, heading the other way.
        m.turn += c.dt / 5;
        const u = Math.min(1, m.turn);
        s = m.dir * (250 + 50 * Math.sin(Math.PI * u));
        D = 110 + 60 * Math.sin(TAU * u);
        if (u >= 1) newRun(en, e, m);
      }
      m.side = s;
      // 70 m up, but never above 1100 m: you can't climb past the soft ceiling (1150 m, player.js) to reach him.
      const target = _b.copy(p.pos).addScaledVector(h, D).addScaledVector(sideOf(h, _a), s).setY(Math.min(p.pos.y + 70, 1100));
      arrive(e, target, p.speed * 1.2 + en.cruise(e), c.dt, 2, 3); // catching up after a U-turn: a bit over your speed
      // Bombs away while over your path (not aimed: they just fall).
      if (m.armed && m.drops > 0 && m.turn < 0 && Math.abs(s) < 120 && (m.dropT -= c.dt) <= 0) {
        m.drops--;
        m.dropT = 0.3;
        drop(en, e, _a.copy(e.pos).add(_c.set(0, -15, 0)), '#ff9a3a', 13, 1.4);
        en.G.audio.tone(500, 0.3, { type: 'sine', vol: 0.03, slide: -300 });
      }
      return true;
    },
    arm(en, e) {
      const m = e.mv;
      if (!m || m.armed || m.turn >= 0) return;
      m.armed = true;
      m.drops = e.noBombs ? 2 : 6;
      // BWAAMP.
      en.G.audio.tone(98, 0.7, { type: 'sawtooth', vol: 0.09, slide: -12 });
      en.G.audio.tone(147, 0.7, { type: 'square', vol: 0.04, slide: -18 });
    },
  },

  // Empress Wobblina: a 0.6 s thrust every 2.2 s (the bell contracts first), then a slow glide; each pulse leaves stingers.
  pulse: {
    step(en, e, c) {
      const m = e.mv ||= { cyc: 0.6 };
      const d = e.def, prev = m.cyc;
      m.cyc = (m.cyc + c.dt) % 2.2;
      const ang = e.t * (d.orbitRate || 0.28) + e.orbitPhase;
      const target = _b.set(Math.cos(ang) * d.orbit, 25 + Math.sin(e.t * 0.35) * 40, Math.sin(ang) * d.orbit).add(c.p.pos);
      if (m.cyc < prev && special(e)) { // a new pulse
        if (en.shots.filter((s) => s.owner === e).length <= 9) {
          for (let k = 0; k < 3; k++) {
            const s = en.fireOrb(_a.copy(e.pos).add(_c.set(rand(-15, 15), rand(-12, 4), rand(-15, 15))), Y, 0.001, 10, '#ff6ad8', 1.5);
            s.owner = e;
            s.life = 6;
          }
        }
        en.G.audio.tone(240, 0.25, { type: 'sine', vol: 0.05, slide: -120 });
      }
      const thrust = m.cyc < 0.6 && !e.chase;
      m.bodyS = m.cyc > 1.85 ? [0.85, 0.85, 0.85] : thrust ? [1.08, 0.95, 1.08] : [1, 1, 1];
      if (thrust) arrive(e, target, en.cruise(e) * 3, c.dt, 3, 6);
      else arrive(e, target, en.cruise(e) * 0.35, c.dt, 0.5, 1.5);
      return true;
    },
  },

  // Mother Spiky: parks, with a spinning ring of mines around her. Every 25% of her HP she rolls ~250 m to a new anchor
  // ahead of you and the ring resets. She inflates for 1 s before each spike nova.
  anchor: {
    step(en, e, c) {
      // First, settle at an anchor (ahead of you if she turned up far off) and put the ring up.
      const m = e.mv ||= { anchor: c.dist > 420 ? spotNear(en, e, 250, 0, 15) : e.pos.clone(), q: Math.ceil((e.hp / e.maxHp) * 4), rolling: true, regrow: 0, novaT: 0 };
      const q = Math.ceil((Math.max(0, e.hp) / e.maxHp) * 4);
      if (!m.rolling && special(e) && (q < m.q || c.dist > 420)) {
        m.q = q;
        m.anchor = spotNear(en, e, 250, rand(-0.4, 0.4), rand(0, 30));
        m.rolling = true;
        popGuards(en, e, 'ring');
        en.G.audio.tone(140, 0.8, { type: 'sine', vol: 0.06, slide: 120 });
      }
      if (m.rolling) {
        arrive(e, m.anchor, 60 / c.pace, c.dt, 1.5, 2);
        if (e.pos.distanceTo(m.anchor) < 20) {
          m.rolling = false;
          for (let k = 0; k < 6; k++) addGuard(en, e, 'mine', 'ring', k + (k >= 3 ? 1 : 0)); // two gaps, opposite each other
        }
      } else {
        park(e, c.dt);
        const ring = guardsOf(en, e, 'ring');
        if ((m.regrow += c.dt) > 4 && ring.length < (e.enraged ? 7 : 6)) { const k = freeSlot(en, e, 'ring', 8); if (k >= 0) addGuard(en, e, 'mine', 'ring', k); m.regrow = 0; }
      }
      if (m.novaT > 0 && (m.novaT -= c.dt) <= 0) nova(en, e);
      m.bodyS = m.novaT > 0 ? [1.15, 1.15, 1.15] : [1, 1, 1];
      return true;
    },
    hold: (e) => e.mv?.rolling || e.mv?.novaT > 0,
    inflate(en, e) { if (e.mv) { e.mv.novaT = 1; en.G.audio.tone(160, 1, { type: 'sine', vol: 0.06, slide: 260 }); } },
  },

  // King Drone: holds a throne (150 m, 30 to 60° off your nose, 40 m up) for 5 s, then hops to the next with a rising
  // rotor whine. Minions orbit him as a royal guard until he yells CHARGE.
  throne: {
    step(en, e, c) {
      const m = e.mv ||= { throne: null, holdT: 0, whineT: 0, side: e.orbitPhase ? -1 : 1, chargeT: 0 };
      if (m.chargeT > 0 && (m.chargeT -= c.dt) <= 0) releaseGuards(en, e, 'royal'); // now they kamikaze
      if (!m.throne) { if (!special(e)) return false; hop(en, e, m); }
      m.holdT += c.dt;
      const nose = -c.toP.dot(c.p.forward) / Math.max(c.dist, 1); // cos of its angle off your nose
      if (m.whineT > 0) {
        if ((m.whineT -= c.dt) <= 0) hop(en, e, m);
      } else if (special(e) && (m.holdT > 5 || (nose < 0.1 && m.holdT > 1.5) || c.dist > 320)) {
        m.whineT = 0.6;
        en.G.audio.tone(300, 0.6, { type: 'sawtooth', vol: 0.03, slide: 700 });
      }
      const far = e.pos.distanceTo(m.throne) > 25;
      arrive(e, m.throne, far ? en.cruise(e) * 2.5 : en.cruise(e), c.dt, far ? 2 : 1, far ? 3 : 2);
      return true;
    },
    charge(en, e) {
      if (!e.mv || !guardsOf(en, e, 'royal').length) return false;
      e.mv.chargeT = 1;
      en.G.ui.notify('King Drone: "CHARGE!"', 'warn', 2, 1);
      en.G.audio.tone(520, 0.3, { type: 'square', vol: 0.05, slide: 200 });
      return true;
    },
    guard(en, e, n) {
      let made = 0;
      for (let k = 0; k < n; k++) { const s = freeSlot(en, e, 'royal', 4); if (s < 0) break; addGuard(en, e, 'drone', 'royal', s); made++; }
      return made;
    },
  },

  // Queen Bee-atrice: zig-zag darts of 40 m every 0.8 s inside a shell of 8 bees. Pop the whole shell and she's exposed.
  darts: {
    step(en, e, c) {
      const m = e.mv ||= { dartT: 0, off: new THREE.Vector3(), shell: false, shellT: 0.5 };
      const d = e.def;
      if (!m.shell && (m.shellT -= c.dt) <= 0) {
        for (let k = 0; k < 8; k++) addGuard(en, e, 'bee', 'shell', k);
        m.shell = true;
      } else if (m.shell && !guardsOf(en, e, 'shell').length) {
        m.shell = false;
        m.shellT = 5;
        daze(e, 5);
        en.G.ui.notify('Bee-atrice is exposed! Hit her now!', 'good', 2.5, 1);
        en.G.audio.tone(700, 0.3, { type: 'triangle', vol: 0.06, slide: -300 });
      }
      if ((m.dartT -= c.dt) <= 0 && special(e)) {
        m.dartT = 0.8;
        m.off.add(_a.set(rand(-1, 1), rand(-0.6, 0.6), rand(-1, 1)).setLength(40)).clampLength(0, 60);
        en.G.audio.tone(rand(380, 460), 0.08, { type: 'sawtooth', vol: 0.02 });
      }
      const ang = e.t * (d.orbitRate || 0.28) + e.orbitPhase;
      const target = _b.set(Math.cos(ang) * d.orbit, 25, Math.sin(ang) * d.orbit).add(c.p.pos).add(m.off);
      arrive(e, target, en.cruise(e) * 1.8, c.dt, 3, 4);
      return true;
    },
  },

  // The Godfeather: sits on a perch 160 to 220 m ahead (high ground, a roof, or a hover point), then relocates after 4
  // hits or 10 s with a fast, low flight.
  perch: {
    step(en, e, c) {
      const m = e.mv ||= { perch: null, sit: false, t: 0, hits: 0 };
      if (!m.perch) { if (!special(e)) return false; m.perch = perchSpot(en, e); }
      if (e.hurt) m.hits++;
      if (m.sit) {
        m.t += c.dt;
        e.vel.multiplyScalar(Math.exp(-c.dt * 8));
        if (e.vel.lengthSq() < 0.5) e.vel.set(0, 0, 0);
        m.face = 'player';
        if (special(e) && (m.hits >= 4 || m.t > 10 || c.dist > 350)) {
          m.perch = perchSpot(en, e);
          m.sit = false;
          m.face = null;
          en.G.ui.notify('Godfeather: "Relocating. Nothing personal."', 'warn', 2.5, 0);
          en.G.audio.tone(520, 0.2, { type: 'triangle', vol: 0.05, slide: -200 });
        }
      } else {
        // Low and fast: under the line to the perch until it's close.
        const left = e.pos.distanceTo(m.perch);
        const via = _b.copy(m.perch);
        if (left > 60) via.y = Math.max(floorAt(en.G, via) + e.radius + 10, via.y - 30);
        arrive(e, via, 50 / c.pace, c.dt, 2, 4);
        if (left < 12) { m.sit = true; m.t = 0; m.hits = 0; }
      }
      return true;
    },
  },

  // Steven: circles 120 to 140 m above you; every 3rd attack a dive at your projected spot (a shadow ring warns 1 s
  // ahead), then a pull-up. Dive too close to the ground and he faceplants (dazed).
  dive: {
    step(en, e, c) {
      const G = en.G, p = c.p;
      const m = e.mv ||= { a: Math.random() * TAU, diving: false };
      if (m.diving) {
        m.diveT += c.dt;
        _a.copy(m.target).sub(e.pos);
        e.vel.lerp(_a.setLength(en.cruise(e) * 2.6), 1 - Math.exp(-c.dt * 8));
        const low = e.pos.y - floorAt(G, e.pos) < e.radius + 25;
        // You turned away mid-dive (out past half his orbit): he calls it off and lets you go, like any boss charge.
        const fled = e.behind && c.dist > e.def.orbit * 0.5;
        if (_a.subVectors(m.target, e.pos).length() < 15 || m.diveT > 2.5 || low || fled) {
          m.diving = false;
          m.charge = false;
          m.pull = fled ? 0 : 1.2;
          if (low && !fled) { daze(e, 2.5); G.ui.notify('Steven faceplanted! He\'s wide open!', 'good', 2.5, 0); G.audio.tone(200, 0.3, { type: 'square', vol: 0.06, slide: -120 }); }
          dodgeEnd(en, e);
        }
        return true;
      }
      if (m.pull > 0) { m.pull -= c.dt; e.vel.lerp(_a.copy(e.vel).setY(0).setLength(en.cruise(e)).setY(en.cruise(e)), 1 - Math.exp(-c.dt * 3)); return true; }
      m.a += c.dt * 0.5;
      const t = _b.set(Math.cos(m.a) * 70, 130 + Math.sin(e.t * 0.7) * 10, Math.sin(m.a) * 70).add(p.pos);
      t.y = Math.min(t.y, G.terrain.ceilingHeight(t.x, t.z, p.pos.y) - e.radius - 15); // caves: circle under the roof
      arrive(e, t, en.cruise(e), c.dt, 1.2, 1.5);
      return true;
    },
    hold: (e) => e.mv?.diving || e.mv?.warned,
    start(en, e) {
      const G = en.G, p = G.player, m = e.mv;
      if (!m || m.diving || m.warned) return false;
      const spot = p.pos.clone().addScaledVector(p.forward, p.speed * 2.4);
      m.warned = true;
      dodgeStart(en, e);
      G.ui.notify('Steven is diving at you! He wants your chips!', 'warn', 2, 1);
      G.audio.tone(1400, 0.5, { type: 'sawtooth', vol: 0.04, slide: -800 });
      en.warn(_a.copy(spot).add(_c.set(0, -3, 0)), 20, '#1a1a22', 1.0, () => {
        m.warned = false;
        if (e.behind) { m.dodge = null; return; } // you've turned away: no dive from behind
        m.diving = true;
        m.charge = true; // a hit on the way down steals your boost
        m.diveT = 0;
        m.target = spot.clone().setY(Math.max(floorAt(G, spot) + e.radius, spot.y - 40));
      }, { shape: 'ring', owner: e });
      return true;
    },
  },

  // The Goose Queen: out to 250 to 300 m, a honk, then a head-on charge that passes 25 to 35 m to one side, dropping
  // golden eggs. Then again from the other side. Only from in front of your nose.
  joust: {
    step(en, e, c) {
      const G = en.G, p = c.p;
      const m = e.mv ||= { phase: 'out', t: 0, side: e.orbitPhase ? -1 : 1, bearing: new THREE.Vector3() };
      m.t += c.dt;
      const nose = -c.toP.dot(p.forward) / Math.max(c.dist, 1);
      if (m.phase === 'out') {
        m.face = null;
        m.bearing.subVectors(e.pos, p.pos).setY(0);
        if (m.bearing.lengthSq() < 1) m.bearing.copy(flatFwd(p, _a));
        m.bearing.normalize().applyAxisAngle(Y, c.dt * 0.15);
        arrive(e, _b.copy(p.pos).addScaledVector(m.bearing, 275).setY(p.pos.y + 15), en.cruise(e) * 1.3, c.dt, 1.2, 2);
        if (special(e) && c.dist > 220 && c.dist < 340 && nose > 0.8 && m.t > 1.5) { m.phase = 'turn'; m.t = 0; G.audio.honk(0.8); G.audio.honk(0.8, 0.25); }
        return true;
      }
      if (m.phase === 'turn') {
        m.face = 'player';
        park(e, c.dt, 4);
        if (e.behind) { m.phase = 'out'; m.t = 0; }
        else if (m.t > 0.6) { m.phase = 'charge'; m.t = 0; m.eggs = false; m.charge = true; dodgeStart(en, e); }
        return true;
      }
      if (m.phase === 'charge') {
        m.face = null;
        // Aim at a point beside you until close, then hold the line and thunder past.
        if (c.dist > 80) m.dir = _a.copy(p.pos).addScaledVector(sideOf(flatFwd(p, _c), _b), m.side * 30).sub(e.pos).normalize().clone();
        e.vel.lerp(_a.copy(m.dir).multiplyScalar(70 / c.pace), 1 - Math.exp(-c.dt * 5));
        if (!m.eggs && c.dist < 60) {
          m.eggs = true;
          for (let k = 0; k < 3; k++) drop(en, e, _b.copy(e.pos).add(_c.set(rand(-6, 6), -8, rand(-6, 6))), '#ffd23a', 16, 1.6, _c.copy(m.dir).multiplyScalar(10));
          G.audio.honk(1.2);
        }
        if ((m.t > 0.6 && c.toP.dot(e.vel) < 0) || m.t > 4 || (e.behind && c.dist > 120)) { m.phase = 'past'; m.t = 0; m.charge = false; }
        return true;
      }
      // Past: carry on a moment, then round again from the other side.
      e.vel.lerp(_a.copy(m.dir || e.vel).setLength(en.cruise(e)), 1 - Math.exp(-c.dt * 1.5));
      if (m.t > 1.2) { dodgeEnd(en, e); m.phase = 'out'; m.t = 0; m.side *= -1; }
      return true;
    },
    hold: (e) => e.mv && e.mv.phase !== 'out',
  },

  // Gary Prime: flies alongside you, 80 to 110 m off a wing, copying your turns; strafing runs cut across your nose
  // (the dash). Hold the trigger 1.5 s and he barrel-rolls out of it (immune 0.8 s, then 5 s before the next).
  wingman: {
    step(en, e, c) {
      const p = c.p;
      const m = e.mv ||= { side: e.orbitPhase ? -1 : 1, fireT: 0, rollCd: 0, rollT: 0 };
      const f = flatFwd(p, _a), side = sideOf(f, new THREE.Vector3());
      const slot = _b.copy(p.pos).addScaledVector(side, m.side * (105 + Math.sin(e.t * 0.4) * 5)).addScaledVector(f, 30);
      slot.y += 5;
      arrive(e, slot, en.cruise(e), c.dt, 1.6, 3);
      // Dad reflexes. You're firing while the gun's cooldown keeps getting topped up.
      m.fireT = p.shootCd > -0.15 && !p.dead ? m.fireT + c.dt / c.pace : 0;
      m.rollCd -= c.dt;
      if (m.rollT > 0 && (m.rollT -= c.dt) <= 0) { e.shield = 1; m.immune = false; }
      if (m.fireT > 1.5 && m.rollCd <= 0 && m.rollT <= 0) {
        m.rollT = 0.8;
        m.rollCd = 5;
        m.immune = true;
        e.shield = 0;
        en.G.fx.popText(e.pos.clone().add(_c.set(0, e.radius + 4, 0)), 'Nope.');
        en.G.audio.tone(330, 0.12, { type: 'triangle', vol: 0.06 });
        en.G.audio.tone(247, 0.2, { type: 'triangle', vol: 0.06, delay: 0.13 });
      }
      return true;
    },
    // A strafing run across your nose: it ends on your other wing. Aimed 140 m ahead and 25 m up, so it crosses in
    // front of you rather than through you.
    cut(en, e) {
      const p = en.G.player;
      e.dash = 2;
      e.dashDir.copy(p.pos).addScaledVector(p.forward, 140).add(_c.set(0, 25, 0)).sub(e.pos).normalize();
      e.burst = e.slow ? 2 : 3;
      if (e.mv) e.mv.side *= -1;
    },
  },

  // Fort Grumpington: up for 4 s, then ducks for 2.5 s (bullets mostly bounce off), with a harrumph before popping up.
  duck: {
    step(en, e, c) {
      const m = e.mv ||= { up: true, t: 0, sink: 0 };
      m.t += c.dt;
      if (m.up && m.t > 4) { m.up = false; m.t = 0; en.G.audio.tone(180, 0.3, { type: 'sine', vol: 0.05, slide: -100 }); }
      else if (!m.up && m.t > 2.5) { m.up = true; m.t = 0; }
      if (!m.up && !m.harrumph && m.t > 2.1) { m.harrumph = true; en.G.audio.tone(90, 0.35, { type: 'sawtooth', vol: 0.07, slide: 40 }); }
      if (m.up) m.harrumph = false;
      // The fort sinks only its mortar (and battens down, Enemies.animateFort); a model without that sinks whole: 60%
      // of its height (animateBoss sinks 4 units per 1).
      m.sink = m.up || e.mesh.userData.duck ? 0 : 0.6 * 6.5 / 4;
      e.shield = m.up ? 1 : 0.15;
      return true;
    },
    hold: (e) => e.mv && !e.mv.up,
    // Mortars land on marked rings along your projected path.
    mortars(en, e, n) {
      const G = en.G, p = G.player, f = flatFwd(p, new THREE.Vector3()), side = sideOf(f, new THREE.Vector3());
      for (let k = 0; k < n; k++) {
        const at = p.pos.clone().addScaledVector(p.forward, p.speed * 1.4 + k * 30).addScaledVector(side, rand(-20, 20));
        en.warn(at, 18, '#ff6a2a', 1.4, (hz) => {
          G.fx.explosion(hz.pos);
          G.audio.noise(0.4, { vol: 0.2, freq: 700 });
          if (!p.dead && p.pos.distanceTo(hz.pos) < 18) p.damage(14);
        }, { shape: 'ring', owner: e });
      }
      G.audio.tone(120, 0.5, { type: 'sine', vol: 0.05, slide: 500, delay: 0.1 }); // the whistle on the way up
    },
  },

  // HMS Overkill: steams slowly along open water, broadside on to you at first. When the water ahead runs out (it
  // probes STEAM.probe m past its bow) it turns toward whichever side is open, and stops if neither is.
  steam: {
    step(en, e, c) {
      const G = en.G, s = e.mesh.scale.x, m = e.mv ||= { yaw: null, turn: 0 };
      if (m.yaw === null) { const f = flatFwd(c.p, _a); m.yaw = Math.atan2(-f.z, f.x); } // heading across your nose
      const open = (yaw) => {
        const d = 36 * s + STEAM.probe, x = e.pos.x + Math.sin(yaw) * d, z = e.pos.z + Math.cos(yaw) * d;
        return G.terrain.surfaceHeight(x, z) < waterLine() - STEAM.depth;
      };
      let go = 1;
      if (open(m.yaw)) m.turn = 0;
      else {
        if (!m.turn) m.turn = open(m.yaw + 0.7) ? 1 : open(m.yaw - 0.7) ? -1 : 1;
        go = open(m.yaw + m.turn * 0.7) ? 0.4 : 0; // squeeze round a headland, or stop and turn on the spot
      }
      m.yaw += m.turn * STEAM.turn * c.dt;
      e.vel.set(Math.sin(m.yaw), 0, Math.cos(m.yaw)).multiplyScalar(en.cruise(e) * go);
      e.mesh.rotation.y = m.yaw;
      return true;
    },
    // Flak: grey puffs mark spots along your path for 1.3 s, then burst (16 m, 12 hull).
    // Flak: each deck gun still standing (or the island, with none left) lobs a shell that bursts where a grey sphere
    // marks it, along your path.
    flak(en, e, n) {
      const G = en.G, p = G.player, guns = e.mesh.userData.guns.filter((g) => g.gun.visible);
      for (let k = 0; k < n; k++) {
        const at = p.pos.clone().addScaledVector(p.forward, p.speed * 1.3 + k * 35).add(_c.set(rand(-18, 18), rand(-10, 10), rand(-18, 18)));
        const from = guns.length ? guns[k % guns.length].aim.getWorldPosition(new THREE.Vector3()) : e.pos.clone().setY(e.pos.y + 14 * e.mesh.scale.x);
        en.warn(at, 16, '#b8bcc4', 1.3, (hz) => {
          G.fx.explosion(hz.pos);
          G.fx.emit(hz.pos, 30, { colors: ['#6a6e74', '#9aa0a6'], speed: 14, life: 2.2, size: 12 }); // a flak puff hangs there
          G.audio.noise(0.3, { vol: 0.15, freq: 900 });
          if (!p.dead && p.pos.distanceTo(hz.pos) < 16) p.damage(STEAM.flakDmg);
        }, { shape: 'sphere', owner: e, from });
      }
      G.audio.noise(0.15, { vol: 0.1, freq: 300 }); // the guns' thump
      G.audio.tone(900, 0.4, { type: 'sine', vol: 0.04, slide: -500 });
    },
  },

  // Magmadora (Volcano Land): under the lava (shield 0) for SERPENT.under s; SERPENT.warn s before she breaks, a ring
  // marks where she'll come up and a smaller, darker one where she'll dive back in, either side of where you'll be.
  // Then her head runs a parabola from one ring to the other, crossing your path with its top SERPENT.apex m over you,
  // her body following along the same path (lay), and spits at the top. She carries on down into the lava until her
  // tail is in. No ring fits the lava near your path: she waits (and says so once, if it goes on).
  breach: {
    step(en, e, c) {
      const G = en.G, WL = waterLine(), m = e.mv ||= { phase: 'under', t: 0, plan: null, waitT: 0, visible: false, dir: new THREE.Vector3(0, 0, 1) };
      m.t += c.dt;
      const under = (e.enraged ? SERPENT.underRage : SERPENT.under) * e.cdMul;
      if (m.phase === 'under') {
        if (!m.plan && m.t >= under - SERPENT.warn) {
          m.plan = this.plan(en, e, c, WL);
          if (!m.plan) {
            m.t = under - SERPENT.warn - 0.5; // look again in half a second
            if ((m.waitT += 0.5) > 6 && !m.hinted) { m.hinted = true; G.ui.notify(`${e.short} only surfaces in the lava. Fly out over the lava sea!`, 'warn', 3.5, 0); }
            return true;
          }
          m.waitT = 0;
          e.pos.copy(this.at(m.plan, 0, WL)); // she swims there unseen
          e.trail = null; // her body comes up out of the lava behind her
          en.warn(m.plan.A.clone().setY(WL + 0.3), 14, '#ff6a1a', SERPENT.warn, null, { shape: 'ring', owner: e });
          en.warn(m.plan.B.clone().setY(WL + 0.3), 10, '#8a2a10', SERPENT.warn, null, { shape: 'ring', owner: e });
          G.fx.emit(m.plan.A.clone().setY(WL), 14, { colors: LAVA_FX, speed: 8, life: 1.4, size: 6, up: 6 }); // the lava bubbles
          G.audio.noise(1.2, { vol: 0.1, freq: 140 }); // a low rumble
        }
        if (m.plan && m.t >= under) { m.phase = 'arc'; m.t = 0; m.spat = false; m.wind = false; }
        return true;
      }
      // The arc: u 0 (8 m under the near ring) → 0.5 (the top, over your path) → 1 (8 m under the far ring) and on down.
      const u = m.t * e.speedMul / SERPENT.arc;
      const next = this.at(m.plan, u + 0.01, WL);
      e.pos.copy(this.at(m.plan, u, WL));
      m.dir.subVectors(next, e.pos).normalize();
      const wind = 0.5 - SERPENT.windup / SERPENT.arc;
      if (!m.spat && u >= wind) m.wind = true; // her jaw opens and her throat glows
      if (!m.spat && u >= 0.5) m.spitDue = true; // the attack switch spits (Enemies.bossBehave, see spit)
      if (u > 0.85) { m.spitDue = false; m.wind = false; }
      if ((u > 1.05 && !m.visible) || u > 3) { m.phase = 'under'; m.t = 0; m.plan = null; m.spitDue = false; m.wind = false; }
      return true;
    },
    hold: (e) => !e.mv?.spitDue,
    // Where her head is at u along a plan (see step).
    at(plan, u, WL) {
      return new THREE.Vector3().lerpVectors(plan.A, plan.B, u).setY(WL - 8 + (plan.H + 8) * 4 * u * (1 - u));
    },
    // Two rings on lava either side of where you'll be at the top of her arc (or a bit before or past it), or null.
    plan(en, e, c, WL) {
      const G = en.G, p = c.p, f = flatFwd(p, new THREE.Vector3()), side = sideOf(f, new THREE.Vector3());
      const look = (SERPENT.warn + SERPENT.arc * 0.5 / e.speedMul) / c.pace; // real s until the top
      const X = p.pos.clone().addScaledVector(f, p.speed * look);
      const lava = (v) => G.terrain.surfaceHeight(v.x, v.z) < WL - 2;
      const H = THREE.MathUtils.clamp(p.pos.y + SERPENT.apex - WL, SERPENT.high[0], SERPENT.high[1]);
      const flip = Math.random() < 0.5 ? 1 : -1, d = new THREE.Vector3();
      for (const along of [0, 25, -25, 50, 80, 120]) for (const half of SERPENT.side) for (const tilt of [0, 0.35, -0.35]) {
        const mid = X.clone().addScaledVector(f, along);
        d.copy(side).applyAxisAngle(Y, tilt).multiplyScalar(half * flip);
        const A = mid.clone().add(d), B = mid.clone().sub(d);
        if (lava(A) && lava(B)) return { A, B, H };
      }
      return null;
    },
    // At the top of the arc: fireballs out of her mouth, led at where you'll be, in a narrow fan.
    spit(en, e) {
      const m = e.mv, G = en.G, p = G.player, u = e.mesh.userData;
      if (!m?.spitDue) return;
      m.spitDue = false; m.spat = true;
      e.mesh.updateMatrixWorld(true); // her head moved since it was last laid
      const from = u.mouth.getWorldPosition(new THREE.Vector3());
      const n = Math.max(1, (e.enraged ? SERPENT.spitRage : SERPENT.spit) - (e.broken?.frill || 0));
      const tgt = p.pos.clone().addScaledVector(p.forward, p.speed * (from.distanceTo(p.pos) / SERPENT.spitSpeed) * 0.6);
      const aim = tgt.sub(from), across = sideOf(aim.clone().setY(0).normalize(), new THREE.Vector3());
      for (let k = 0; k < n; k++) {
        const fan = (k - (n - 1) / 2) * 0.09 * aim.length();
        en.fireOrb(from, aim.clone().addScaledVector(across, fan).add(_c.set(0, rand(-4, 4), 0)), SERPENT.spitSpeed, SERPENT.spitDmg, '#ff6a1a', 1.3).owner = e;
      }
      G.fx.emit(from, 18, { colors: ['#ffd23a', '#ff6a1a', '#ff3a0a'], speed: 22, life: 0.5, size: 7 }); // the flame out of her mouth
      G.audio.noise(0.4, { vol: 0.14, freq: 600 });
      G.audio.tone(160, 0.35, { type: 'sawtooth', vol: 0.05, slide: -60 });
    },
    // Per frame (Enemies.animate): lay her body along the path her head took, hide whatever is under the lava (bullets
    // do nothing to her while all of her is), splash where each part crosses the surface, open the jaw for a spit.
    lay(en, e, dt) {
      const G = en.G, u = e.mesh.userData, m = e.mv, s = e.mesh.scale.x, WL = waterLine(), step = (SERPENT_GAP * s) / 4;
      let tr = e.trail;
      if (!tr || tr.at(-1).distanceTo(e.pos) > 60) tr = e.trail = [e.pos.clone()]; // a fresh dive point
      for (let last = tr.at(-1), d = last.distanceTo(e.pos); d >= step; d -= step) {
        last = last.clone().lerp(e.pos, step / d);
        tr.push(last);
      }
      const keep = (u.segs.length + 2) * 4;
      if (tr.length > keep) tr.splice(0, tr.length - keep);
      e.mesh.updateMatrixWorld(true);
      const splash = (at, big) => {
        const v = _a.set(at.x, WL + 0.5, at.z);
        G.fx.emit(v, big ? 22 : 5, { colors: LAVA_FX, speed: big ? 26 : 16, life: 0.9, size: big ? 8 : 6, up: big ? 30 : 18, gravity: 40 });
        if (big) G.audio.noise(0.5, { vol: 0.12, freq: 300 });
      };
      const headUp = e.pos.y > WL - 2 * s;
      if (u.head.visible !== headUp && m?.phase === 'arc') splash(e.pos, true);
      u.head.visible = headUp;
      u.head.lookAt(_b.copy(e.pos).add(m?.dir || _c.set(0, 0, 1)));
      let visible = headUp;
      u.segs.forEach((sg, k) => {
        const i = Math.max(0, tr.length - 1 - (k + 1) * 4), pt = tr[i], ahead = k ? tr[Math.min(tr.length - 1, i + 4)] : e.pos;
        sg.position.copy(pt).sub(e.pos).divideScalar(s);
        sg.updateMatrixWorld();
        if (ahead.distanceToSquared(pt) > 0.01) sg.lookAt(ahead);
        const up = pt.y > WL - u.segR[k] * s * 1.2;
        if (sg.visible !== up && m?.phase === 'arc') splash(pt, false);
        sg.visible = up;
        if (up) visible = true;
      });
      if (m) m.visible = visible;
      e.shield = visible ? 1 : 0;
      // Embers drip off her while she's up.
      if (visible && Math.random() < dt * 10) {
        const sg = u.segs[Math.floor(Math.random() * u.segs.length)];
        if (sg.visible) G.fx.emit(sg.getWorldPosition(_a), 1, { colors: ['#ffb03a', '#ff6a1a'], speed: 3, life: 1.3, size: 5, gravity: 25 });
      }
      const open = m?.wind ? 0.6 : 0.06 + 0.04 * Math.sin(e.t * 3);
      u.jaw.rotation.x += (open - u.jaw.rotation.x) * (1 - Math.exp(-dt * 10));
      u.throat.material.opacity = m?.wind ? 0.95 : 0.45 + 0.1 * Math.sin(e.t * 2);
      u.throat.scale.setScalar(m?.wind ? 1.35 : 1);
    },
    // Her highest part above the lava (or the lava's surface over her head): where she blows up when beaten.
    surface(e) {
      if (e.surfaced) return;
      e.surfaced = true;
      const u = e.mesh.userData, WL = waterLine();
      let best = u.head.visible ? e.pos.clone() : null;
      for (const sg of u.segs) if (sg.visible) { const w = sg.getWorldPosition(new THREE.Vector3()); if (!best || w.y > best.y) best = w; }
      e.pos.copy(best || e.pos.clone().setY(WL + 10));
    },
    // Is `pos` touching her (head or any part above the lava), padded by `pad` m?
    touches(e, pos, pad) {
      const u = e.mesh.userData, s = e.mesh.scale.x;
      if (u.head.visible && e.pos.distanceTo(pos) < e.radius + pad) return true;
      return u.segs.some((sg, k) => sg.visible && sg.getWorldPosition(_a).distanceTo(pos) < u.segR[k] * s * 1.1 + pad);
    },
  },

  // Glacierra (lead): holds her slot ahead of you; each attack is a telegraphed shard fan (see SHARDS). The attack only
  // starts the wind-up (fanStart); the fan fires from here when it ends, and attacks wait meanwhile.
  fans: {
    step(en, e, c) {
      const m = e.mv ||= { wind: 0, after: 0, plane: 'h', queue: 0, fired: '', roll: 0 };
      if (m.after > 0 && (m.after -= c.dt) <= 0 && m.next) { MOVES.fans.wind(en, e, m.next); m.next = null; }
      m.gain = m.wind > 0 ? 1 : 1.6; // she steadies while she aims
      if (m.wind > 0 && (m.wind -= c.dt) <= 0) {
        MOVES.fans.fire(en, e, m.plane);
        m.fired += m.plane;
        m.after = 0.4; // her wings stay in the fan's plane a moment, so the fan reads as coming off them
        if (m.queue > 0) { m.queue--; m.next = m.plane === 'h' ? 'v' : 'h'; } // enraged: the other plane, once she's done
      }
      return false;
    },
    hold: (e) => e.mv?.wind > 0 || !!e.mv?.next,
    // The attack: a wind-up in the plane `plane` (a second one queued when enraged).
    start(en, e, n) {
      const m = e.mv;
      if (!m || m.wind > 0 || m.next) return;
      m.queue = e.enraged ? 1 : 0;
      MOVES.fans.wind(en, e, n % 2 ? 'h' : 'v');
      if (!e.fanTip) {
        e.fanTip = true;
        m.wind = SHARDS.first;
        en.G.ui.notify('Watch her wings! Level: climb or dive. On edge: turn aside.', 'warn', 4, 1);
      }
    },
    wind(en, e, plane) {
      const m = e.mv;
      m.plane = plane;
      m.wind = SHARDS.wind;
      en.G.audio.tone(plane === 'h' ? 700 : 1900, 0.5, { type: 'sine', vol: 0.05, slide: 500 });
    },
    // The fan: from her core, centred on where you'll be, spread in her wings' plane.
    fire(en, e, plane) {
      const p = en.G.player, from = e.pos, dist = from.distanceTo(p.pos);
      const at = _a.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / SHARDS.speed) * 0.5);
      const dir = _b.copy(at).sub(from).normalize(), side = _c.crossVectors(dir, Y);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      // Flat fan: turn the aim about the axis square to it and to your side (roughly up). Upright: about your side.
      const axis = plane === 'h' ? new THREE.Vector3().crossVectors(side, dir).normalize() : side.clone();
      const n = Math.max(SHARDS.min, SHARDS.shards - 2 * (e.broken?.crystal || 0));
      for (let k = 0; k < n; k++) {
        const d = dir.clone().applyAxisAngle(axis, (k / (n - 1) - 0.5) * SHARDS.spread);
        const shot = en.fireOrb(from, d, SHARDS.speed, SHARDS.dmg, SHARDS.color, 0.9);
        shot.owner = e;
        shot.frost = SHARDS.frost;
      }
      en.G.audio.tone(2400, 0.25, { type: 'triangle', vol: 0.06, slide: -1600 });
      en.G.fx.emit(from, 14, { colors: ['#e8fbff', '#bfefff', '#7affc8'], speed: 30, life: 0.8, size: 5 });
    },
    // Her look: wings flap slowly, then hold still and roll into the plane of the fan, the aurora brightening.
    pose(en, e, dt) {
      const m = e.mv, u = e.mesh.userData;
      if (!m) return;
      const aim = m.wind > 0 || m.after > 0 ? (m.plane === 'v' ? Math.PI / 2 : 0) : Math.sin(e.t * 0.5) * 0.12;
      m.roll += (aim - m.roll) * (1 - Math.exp(-dt * 6));
      u.tilt.rotation.z = m.roll;
      const flap = m.wind > 0 ? 0.08 : Math.sin(e.t * 2.2) * 0.3;
      u.wings.forEach((w, k) => { w.rotation.z = (k ? 1 : -1) * flap; });
      const glow = m.wind > 0 ? 0.75 : 0.35;
      for (const mat of u.webs) mat.opacity += (glow - mat.opacity) * (1 - Math.exp(-dt * 5));
    },
  },

  // Pharaoh Scarabus (orbit): circles you like the classic bosses; every 3rd attack two mirage copies of it shimmer in
  // (see MIRAGE). They fire fake orbs with its volleys; only the real one casts a shadow on the ground.
  mirage: {
    step(en, e, c) {
      const m = e.mv ||= { mir: 0, hp0: 0, peak: 0, shown: 0 };
      if (m.mir > 0) {
        m.mir -= c.dt;
        m.shown += c.dt;
        m.peak = Math.max(m.peak, e.mesh.userData.mirages.filter((x) => x.visible).length);
        if (e.hp < m.hp0 - 0.5) { // you hit the real one: the mirages pop
          m.mir = 0;
          for (const x of e.mesh.userData.mirages) if (x.visible) en.G.fx.emit(x.position, 18, { colors: ['#ffe8a0', '#ffd66a', '#bfefff'], speed: 25, life: 0.7, size: 6 });
          en.G.ui.notify('Found the real one! The mirages pop.', 'good', 2, 0);
          en.G.audio.tone(1600, 0.3, { type: 'sine', vol: 0.05, slide: -900 });
        }
      }
      return false; // it keeps the plain orbit
    },
    // The attack: every 3rd one calls up the mirages (a shimmer, no shots); the others are volleys, copied by any mirages.
    attack(en, e, n) {
      const m = e.mv ||= { mir: 0, hp0: 0, peak: 0, shown: 0 };
      if (n % 3 === 0 && !(m.mir > 0)) {
        m.mir = e.enraged ? MIRAGE.lastRage : MIRAGE.last;
        m.hp0 = e.hp;
        m.shown = 0;
        // Three spots: where it is, and that turned either way around you. A puff of sand on each, and the real one takes
        // any of them (its orbit turns with it), the mirages the other two. So keeping your aim on it isn't enough.
        const p = en.G.player, slots = [-MIRAGE.turn, 0, MIRAGE.turn], mine = slots[Math.floor(Math.random() * 3)];
        for (const t of slots) en.G.fx.emit(_a.copy(e.pos).sub(p.pos).applyAxisAngle(Y, t).add(p.pos), 24, { colors: ['#e8c98a', '#d9b070', '#fff2c8'], speed: 30, life: 1, size: 9 });
        if (mine) { e.pos.sub(p.pos).applyAxisAngle(Y, mine).add(p.pos); e.mesh.position.copy(e.pos); e.orbitPhase -= mine; }
        m.offs = slots.filter((t) => t !== mine).map((t) => t - mine); // the mirages' turns from the real one
        m.dy = [rand(-1, 1), rand(-1, 1)].map((k) => k * MIRAGE.dy); // and heights, so the real one isn't always in the middle
        en.G.audio.tone(500, 0.7, { type: 'sine', vol: 0.05, slide: 700 });
        if (!e.mirageTip) { e.mirageTip = true; en.G.ui.notify('Mirages! Only the real Sun Beetle casts a shadow.', 'warn', 4, 1); }
        return;
      }
      const p = en.G.player, k = Math.max(0, e.broken?.horn || 0);
      const orbs = k ? MIRAGE.orbsHorn : MIRAGE.orbs;
      const volley = (from, fake) => {
        const dist = from.distanceTo(p.pos);
        const at = _a.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / MIRAGE.speed) * 0.6);
        for (let j = 0; j < orbs; j++) {
          const d = _b.copy(at).sub(from).normalize().add(_c.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(MIRAGE.spread));
          const shot = en.fireOrb(from, d, MIRAGE.speed, MIRAGE.dmg, MIRAGE.color, 1);
          shot.src = e;
          if (fake) { shot.fake = true; shot.owner = e; } // (owned: they go with the mirages on a breakaway)
        }
      };
      volley(e.pos, false);
      if (m.mir > 0) for (const x of e.mesh.userData.mirages) if (x.visible) volley(x.position, true);
      en.G.audio.tone(420, 0.2, { type: 'triangle', vol: 0.06, slide: -200 });
    },
    // Where the mirages sit, how see-through they are, and the real one's shadow. Called every frame (animate).
    pose(en, e, dt) {
      const u = e.mesh.userData, p = en.G.player, m = e.mv;
      if (!u.free) { // world-placed from now on, each mirage with a copy of its crown
        const crown = u.parts.find((x) => x.name === 'crown')?.obj;
        for (const x of u.mirages) {
          if (crown) {
            const c = makeCrown(e.def.crownS);
            c.position.copy(crown.position);
            c.traverse((o) => { const mt = o.material; if (mt && !x.userData.mats.includes(mt)) { mt.transparent = true; x.userData.mats.push(mt); } });
            x.add(c);
            x.userData.crown = c;
          }
          en.G.scene.add(x);
        }
        en.G.scene.add(u.shadow);
        u.free = true;
      }
      const crownOn = !!u.parts.find((x) => x.name === 'crown' && !x.broken && x.obj.visible);
      // The shadow: flat on the ground (or sea) under the real one, softer the higher it flies.
      const ground = Math.max(en.G.terrain.surfaceHeight(e.pos.x, e.pos.z, e.pos.y), waterLine());
      const h = Math.max(0, e.pos.y - ground), R = e.radius * 0.8;
      u.shadow.visible = e.pos.y > ground;
      u.shadow.position.set(e.pos.x, ground + 0.6, e.pos.z);
      u.shadow.scale.setScalar(R * (1 + h / 600));
      u.shadow.material.opacity = 0.42 * Math.max(0.6, 1 - h / 500);
      // The mirages: its own spot turned around you, facing you like it does, fading in and out with a shimmer.
      const left = m?.mir || 0, a = left <= 0 ? 0 : Math.min(1, (m.shown || 0) / MIRAGE.fadeIn, left / MIRAGE.fadeOut);
      u.mirages.forEach((x, k) => {
        x.visible = a > 0.01;
        if (!x.visible) return;
        _a.copy(e.pos).sub(p.pos).applyAxisAngle(Y, m.offs?.[k] ?? (k ? 1 : -1) * MIRAGE.turn);
        x.position.copy(p.pos).add(_a);
        x.position.y += m.dy?.[k] ?? 0;
        x.scale.setScalar(e.mesh.scale.x * (1 + 0.03 * Math.sin(e.t * 7 + k * 2)));
        x.lookAt(p.pos.x, x.position.y, p.pos.z);
        const o = a * MIRAGE.opacity * (0.85 + 0.15 * Math.sin(e.t * 9 + k * 3));
        for (const mat of x.userData.mats) mat.opacity = o;
        x.userData.halo.material.opacity = 0.14 * a;
        if (x.userData.crown) x.userData.crown.visible = crownOn; // knocked off the real one: gone from the mirages too
      });
      // Its wing cases hum, half open.
      const f = Math.sin(e.t * 9) * 0.12;
      u.wings.forEach((w, k) => { w.rotation.z = (k ? 1 : -1) * f; });
    },
    hide(e) { for (const x of e.mesh.userData.mirages) x.visible = false; },
  },

  // Lady Hootrude (orbit): circles you lobbing acorns; every 3rd attack she hovers and rears up, then beats a band of
  // leaves at you that shoves you off course (see GUST). Attacks wait from the rear-up until the gust is gone.
  gust: {
    step(en, e, c) {
      const m = e.mv ||= { tell: 0, gusts: 0, hits: 0, shoves: 0, beat: 0 }, P = e.mesh.userData.perch;
      if (P) { // on her oak, till you come near, hit her, or she tires of waiting
        P.t += c.dt;
        if (c.dist > PERCH.near && P.t < PERCH.wait && e.hp >= P.hp) { e.vel.set(0, 0, 0); e.pos.copy(P.at); return true; }
        MOVES.gust.launch(en, e);
        return true;
      }
      if (!(m.tell > 0)) return false; // the plain orbit
      park(e, c.dt, 4); // she hovers while she rears up
      return true;
    },
    hold: (e) => e.mv?.tell > 0 || !!e.mv?.band || !!e.mesh.userData.perch,
    // At spawn (Enemies.spawnBoss): a giant oak grows under her and she sits on its top, a little lower if need be.
    spawn(en, e) {
      const G = en.G, u = e.mesh.userData, { x, z } = e.pos, ground = G.terrain.surfaceHeight(x, z);
      if (!Number.isFinite(ground) || ground < waterLine() + 2 || Number.isFinite(G.terrain.ceilingHeight(x, z, e.pos.y))) return;
      const tree = makeHarvestOak(), feet = 3.3 * e.mesh.scale.x, top = tree.userData.perchY;
      const k = THREE.MathUtils.clamp((e.pos.y - feet - ground) / top, PERCH.scale[0], PERCH.scale[1]);
      tree.scale.setScalar(k);
      tree.position.set(x, ground - 1, z);
      const yaw = Math.atan2(G.player.pos.x - x, G.player.pos.z - z); // she sits facing you, the bar under both feet
      tree.rotation.y = yaw;
      G.scene.add(tree);
      u.tree = tree;
      e.pos.y = ground - 1 + top * k + feet;
      u.perch = { at: e.pos.clone(), t: 0, hp: e.hp, yaw, leaves: ground - 1 + tree.userData.canopyY * k };
    },
    // Off her perch: a hop up and toward you, a burst of leaves from the canopy, a hoot, wings beating hard.
    launch(en, e) {
      const G = en.G, u = e.mesh.userData, P = u.perch;
      if (!P) return;
      u.perch = null;
      _a.copy(G.player.pos).sub(e.pos).setY(0);
      if (_a.lengthSq() > 1) _a.normalize();
      e.vel.set(0, PERCH.hop, 0).addScaledVector(_a, PERCH.hop * 0.6);
      G.fx.emit(_b.set(e.pos.x, P.leaves, e.pos.z), 26, { colors: LEAF_COLORS, speed: 30, life: 1.4, size: 5 });
      G.audio.tone(392, 0.22, { type: 'sine', vol: 0.07, slide: -40 }); // hoo
      G.audio.tone(330, 0.45, { type: 'sine', vol: 0.07, slide: -50, delay: 0.3 }); // hooo
      (e.owl ||= {}).launch = 0.9;
    },
    attack(en, e, n) {
      const m = e.mv ||= { tell: 0, gusts: 0, hits: 0, shoves: 0, beat: 0 };
      const G = en.G, p = G.player;
      if (m.tell > 0 || m.band) return;
      if (n % (e.enraged ? 2 : 3) === 0) {
        m.tell = m.tell0 = !e.gustTip ? GUST.first : e.enraged ? GUST.tellRage : GUST.tell;
        if (!e.gustTip) { e.gustTip = true; G.ui.notify('Gust incoming! Wings raised high means a leaf storm: dodge sideways, over or under it.', 'warn', 4, 1); }
        G.audio.tone(260, m.tell, { type: 'sine', vol: 0.05, slide: 420 }); // a rising whoosh
        return;
      }
      const from = e.pos, dist = from.distanceTo(p.pos);
      const at = _a.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / GUST.acornSpeed) * 0.6);
      for (let j = 0; j < GUST.acorns; j++) {
        const d = _b.copy(at).sub(from).normalize().add(_c.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(GUST.acornSpread));
        en.fireOrb(from, d, GUST.acornSpeed, GUST.acornDmg, GUST.acornColor, 1).src = e;
      }
      G.audio.tone(320, 0.18, { type: 'triangle', vol: 0.06, slide: -150 });
    },
    // The beat: a band of leaves from her toward where you'll be, its size and shove set by her tufts and rage.
    blow(en, e) {
      const m = e.mv, p = en.G.player, k = Math.min(2, e.broken?.tuft || 0), speed = e.enraged ? GUST.speedRage : GUST.speed;
      const d0 = e.pos.distanceTo(p.pos);
      const at = _a.copy(p.pos).addScaledVector(p.forward, p.speed * (d0 / speed) * GUST.lead);
      const dir = at.sub(e.pos).normalize();
      const side = new THREE.Vector3().crossVectors(dir, Y);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      const flat = dir.clone().setY(0);
      if (flat.lengthSq() < 1e-4) flat.copy(side).cross(Y);
      m.band = {
        at: e.pos.clone(), dir: dir.clone(), side, up: new THREE.Vector3().crossVectors(side, dir).normalize(), flat: flat.normalize(),
        dist: 0, prev: Infinity, speed, range: Math.max(GUST.range, d0 + 80), hit: false,
        w: k ? GUST.widthTuft[k - 1] : GUST.width, push: k ? GUST.pushTuft[k - 1] : GUST.push, slow: k >= 2 ? 0 : GUST.slow,
      };
      m.gusts++;
      m.beat = 0.45;
      en.G.audio.noise(0.7, { vol: 0.12, freq: 700 });
      en.G.fx.emit(e.pos, 20, { colors: LEAF_COLORS, speed: 35, life: 1, size: 5 });
    },
    // The band caught you: the shove (flat, along its travel, capped), a little speed, a puff of leaves.
    shove(en, e, b) {
      const G = en.G, p = G.player, m = e.mv;
      m.hits++;
      G.fx.emit(p.pos, 16, { colors: LEAF_COLORS, speed: 20, life: 0.9, size: 4 });
      const ground = Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z, p.pos.y), waterLine());
      let ok = !p.landed && !(p.invuln > 0) && p.pos.y - ground >= GUST.clear;
      if (ok) {
        _c.copy(p.pos).addScaledVector(b.flat, GUST.probe);
        const g2 = Math.max(G.terrain.surfaceHeight(_c.x, _c.z, p.pos.y), waterLine());
        if (g2 > p.pos.y - 6 || G.terrain.ceilingHeight(_c.x, _c.z, p.pos.y) < p.pos.y + 6) ok = false;
      }
      if (!ok) return;
      m.shoves++;
      const ff = flatFwd(p, new THREE.Vector3()), shove = _c.copy(b.flat).multiplyScalar(b.push), back = shove.dot(ff);
      if (back < 0) shove.addScaledVector(ff, -back * 0.5);
      p.gust.add(shove).clampLength(0, GUST.push);
      p.gust.y = 0;
      p.gustDecay = GUST.decay;
      if (b.slow) p.speed = Math.max(p.baseSpeed * 0.5, p.speed - b.slow);
      G.shake?.(0.3, 0.25);
      G.audio.noise(0.4, { vol: 0.1, freq: 500 });
      if (!(en.gustNews > G.time)) { en.gustNews = G.time + 6; G.ui.notify('Blown away! Leaves in your propeller.', 'bad', 2); }
    },
    // Every frame (animate): the rear-up and the beat, the band's flight and its leaves, her wings and glowing chest.
    pose(en, e, dt) {
      const u = e.mesh.userData, m = e.mv, G = en.G, p = G.player;
      if (m?.tell > 0) {
        if (Math.random() < dt * 25) G.fx.emit(_a.copy(e.pos).add(_b.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).multiplyScalar(e.radius * 1.4)), 1, { colors: LEAF_COLORS, speed: 14, life: 1, size: 4 });
        if ((m.tell -= dt) <= 0) { m.tell = 0; MOVES.gust.blow(en, e); }
      }
      const b = m?.band;
      if (b) {
        b.dist += b.speed * dt;
        const w = b.w * (0.5 + 0.5 * Math.min(1, b.dist / GUST.grow));
        _a.copy(b.at).addScaledVector(b.dir, b.dist); // the band's middle
        _b.copy(p.pos).sub(_a);
        const along = _b.dot(b.dir), lat = _b.dot(b.side), vert = _b.dot(b.up);
        if (!b.hit && !p.dead && Math.abs(lat) < w / 2 && Math.abs(vert) < GUST.height / 2 && (Math.abs(along) < GUST.depth / 2 || (b.prev > 0 && along <= 0))) {
          b.hit = true;
          MOVES.gust.shove(en, e, b);
        }
        b.prev = along;
        const leaves = MOVES.gust.leaves(en, e), seeds = leaves.userData.seeds, fade = Math.min(1, (b.range - b.dist) / 60);
        leaves.visible = true;
        leaves.material.opacity = 0.9 * Math.max(0, fade);
        for (let k = 0; k < seeds.length; k++) {
          const [sx, sy, sz, ph, spin] = seeds[k];
          _o.position.copy(_a).addScaledVector(b.side, sx * w).addScaledVector(b.up, sy * GUST.height + Math.sin(e.t * 3 + ph) * 2).addScaledVector(b.dir, sz * GUST.depth);
          _o.rotation.set(e.t * spin + ph, e.t * spin * 0.7, ph);
          _o.updateMatrix();
          leaves.setMatrixAt(k, _o.matrix);
        }
        leaves.instanceMatrix.needsUpdate = true;
        if (b.dist >= b.range) { m.band = null; leaves.visible = false; }
      }
      if (m) m.beat = Math.max(0, (m.beat || 0) - dt);
      if (u.perch && e.chase) MOVES.gust.launch(en, e); // a break pulls her off her oak too
      if (!e.dead) { MOVES.gust.fly(en, e, dt); shade(en, e, e.radius * 0.7); } // (a dead one's shadow is gone: dropBoss)
      if (u.tree && (!u.perch && u.tree.position.distanceToSquared(p.pos) > PERCH.gone ** 2)) MOVES.gust.fell(en, e);
      u.chest.color.copy(m?.tell > 0 ? CHEST_HOT : CHEST);
    },
    // Her body language, every frame: she faces you (her chest stays in view), turning a little toward where she's going,
    // banks into turns and pitches with her climb. Wings: perched folded; a few beats then a glide (flat, tips a touch
    // up); in a rear-up raised high in a V, quivering, tail fanned, talons forward, leaning back; the beat sweeps down.
    fly(en, e, dt) {
      const u = e.mesh.userData, m = e.mv, o = (e.owl ||= {}), p = en.G.player, tell = m?.tell > 0, beat = m?.beat > 0, sit = !!u.perch;
      const ease = (r) => 1 - Math.exp(-dt * r), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), clamp = THREE.MathUtils.clamp;
      if (!o.init) Object.assign(o, { init: true, yaw: u.perch?.yaw ?? Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), away: false, roll: 0, pitch: 0, ph: 0, beats: 0, glide: 0, w: 1, acc: new THREE.Vector3(), v0: e.vel.clone(), blink: rand(2, 5), tilt: rand(6, 10), tiltK: 0, A: [-1.2, -1.2], H: [-0.5, -0.5], look: 0 });
      e.mesh.rotation.order = 'YXZ';
      const toYaw = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), sp = Math.hypot(e.vel.x, e.vel.z);
      if (dt > 0) { _a.subVectors(e.vel, o.v0).divideScalar(dt); o.acc.lerp(_a, ease(4)); o.v0.copy(e.vel); }
      // Mostly facing you, turned a little toward where she's going; heading well away from you she turns to fly that
      // way (her head still on you), and back once you're in front of her again. Perched she keeps still; her head turns.
      const velYaw = Math.atan2(e.vel.x, e.vel.z), off = wrap(velYaw - toYaw);
      if (sit || tell || sp < 8) o.away = false;
      else if (Math.abs(off) > 1.1) o.away = true;
      else if (Math.abs(off) < 0.9) o.away = false;
      const lead = sit || tell || sp < 8 ? 0 : clamp(off, -PERCH.bank, PERCH.bank) * Math.min(1, sp / 25);
      if (!sit) o.yaw += wrap((o.away ? velYaw : toYaw + lead) - o.yaw) * ease(4);
      const lat = o.acc.x * Math.cos(o.yaw) - o.acc.z * Math.sin(o.yaw); // toward her left (+X)
      o.roll += ((sit || tell ? 0 : clamp(-lat / 28, -PERCH.bank, PERCH.bank)) - o.roll) * ease(3);
      o.pitch += ((sit ? 0 : tell ? -PERCH.pitch : clamp(-e.vel.y / 70, -PERCH.pitch, PERCH.pitch)) - o.pitch) * ease(3);
      e.mesh.rotation.set(o.pitch, o.yaw, o.roll);
      // The wingbeat: 3 strokes, then a glide unless she needs the lift (taking off, climbing, slow).
      o.launch = Math.max(0, (o.launch || 0) - dt);
      const lift = o.launch > 0 || e.vel.y > 5 || e.vel.length() < 18;
      if (o.glide > 0) { o.glide -= dt; if (lift) o.glide = 0; }
      const flapping = !sit && !tell && !beat && o.glide <= 0;
      if (flapping) {
        const ph = o.ph + dt * TAU * (lift ? PERCH.flapUp : PERCH.flap);
        if (Math.floor(ph / TAU) > Math.floor(o.ph / TAU) && ++o.beats >= PERCH.beats && !lift) { o.beats = 0; o.glide = rand(...PERCH.glide); }
        o.ph = ph;
      }
      o.w += ((flapping ? 1 : 0) - o.w) * ease(6); // flap <-> glide eases over ~0.2 s
      const S = Math.sin(o.ph), quiver = Math.sin(e.t * 40) * 0.04;
      const [A, H, rate] = sit ? [-1.2, -0.5, 6]
        : beat ? [-0.9, -0.2, 16]
        : tell ? [1.05 + quiver, 0.25, 8]
        : [0.1 * (1 - o.w) + (0.05 + 0.55 * S) * o.w, 0.06 * (1 - o.w) + 0.35 * Math.sin(o.ph - 0.9) * o.w, 20];
      u.wings.forEach((wg, k) => {
        const sd = k ? 1 : -1;
        wg.rotation.z += (sd * A - wg.rotation.z) * ease(rate);
        u.hands[k].rotation.z += (sd * H - u.hands[k].rotation.z) * ease(rate);
      });
      u.rig.position.y = flapping ? -0.22 * S * o.w : sit ? 0 : 0.08 * Math.sin(e.t * 1.3);
      // Head: on you, level through her banks; perched she looks about while you're far. Now and then a curious tilt.
      if (sit && e.pos.distanceTo(p.pos) > 500) o.look = Math.sin(e.t * 0.6) * 1.3; else o.look *= 1 - ease(3);
      if ((o.tilt -= dt) <= 0) { o.tilt = rand(6, 10); o.tiltT = 0.9; }
      o.tiltT = Math.max(0, (o.tiltT || 0) - dt);
      o.tiltK += ((o.tiltT > 0 && !tell ? 0.35 : 0) - o.tiltK) * ease(5);
      const hy = clamp(wrap(toYaw - o.yaw) + o.look, -1.9, 1.9);
      u.head.rotation.set(-o.pitch * 0.6, u.head.rotation.y + (hy - u.head.rotation.y) * ease(6), -o.roll * 0.8 + o.tiltK);
      if ((o.blink -= dt) <= 0) o.blink = rand(2, 5);
      u.lids.forEach((l) => { l.visible = o.blink < 0.12; });
      u.talons.rotation.x += ((sit ? 0 : tell ? -0.7 : 0.9) - u.talons.rotation.x) * ease(6);
      const fan = tell ? 1.45 : sit ? 0.8 : 1 + 0.15 * (1 - o.w);
      u.tail.scale.x += (fan - u.tail.scale.x) * ease(6);
      u.tail.rotation.x += ((sit ? 0.45 : -o.pitch * 0.5 + 0.08 * S * o.w) - u.tail.rotation.x) * ease(6);
    },
    // Her oak goes (when she does, or once it's far behind you).
    fell(en, e) {
      const u = e.mesh.userData;
      if (u.tree) { en.G.scene.remove(u.tree); disposeTree(u.tree); u.tree = null; }
    },
    // The leaves of a band: one instanced mesh per boss, made on the first gust and kept in the scene (dropBoss).
    leaves(en, e) {
      const u = e.mesh.userData;
      if (u.leaves) return u.leaves;
      const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false });
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.2, 2), mat, GUST.leaves), col = new THREE.Color();
      mesh.userData.seeds = [];
      for (let k = 0; k < GUST.leaves; k++) {
        mesh.setColorAt(k, col.set(pick(LEAF_COLORS)));
        // Half of them trace the band's outline, so its edges read from a distance.
        const edge = k % 2, onSide = Math.random() < 0.5, out = () => (Math.random() < 0.5 ? -0.5 : 0.5);
        const sx = edge && onSide ? out() : rand(-0.5, 0.5), sy = edge && !onSide ? out() : rand(-0.5, 0.5);
        mesh.userData.seeds.push([sx, sy, rand(-0.5, 0.5), rand(0, TAU), rand(3, 7)]);
      }
      mesh.frustumCulled = false;
      mesh.visible = false;
      en.G.scene.add(mesh);
      return (u.leaves = mesh);
    },
    hide(e) { if (e.mesh.userData.leaves) e.mesh.userData.leaves.visible = false; },
  },

  // Duchess Brûlée (orbit): curled on her castle tower until you come near, then circles you lobbing hot bonbons; every
  // 3rd attack (2nd enraged) she hovers and rears up, a sparkle line crosses your path, and she rakes it with fire that
  // hangs there a moment (see RAKE). Attacks wait from the rear-up until the curtain is gone.
  rake: {
    step(en, e, c) {
      const m = e.mv ||= { tell: 0, rakes: 0, hits: 0, volleys: 0 }, P = e.mesh.userData.perch;
      if (P) { // on her tower, till you come near, hit her, or she tires of waiting
        P.t += c.dt;
        if (c.dist > ROOST.near && P.t < ROOST.wait && e.hp >= P.hp) { e.vel.set(0, 0, 0); e.pos.copy(P.at); return true; }
        MOVES.rake.launch(en, e);
        return true;
      }
      if (!(m.tell > 0) && !m.fire) return false; // the plain orbit
      park(e, c.dt, 4); // she hovers, back-beating, while she aims and breathes
      return true;
    },
    hold: (e) => e.mv?.tell > 0 || !!e.mv?.fire || !!e.mesh.userData.perch,
    // At spawn: her tower rises under her (themed for the land; on a cloud bank with no dry ground) and she lies on top.
    spawn(en, e) {
      const G = en.G, u = e.mesh.userData, { x, z } = e.pos, ground = G.terrain.surfaceHeight(x, z);
      if (Number.isFinite(G.terrain.ceilingHeight(x, z, e.pos.y))) return; // under a roof she just flies
      const zone = G.zones.current.name, theme = /Candy/.test(zone) ? 'candy' : /Cloud/.test(zone) ? 'cloud' : 'princess';
      const dry = Number.isFinite(ground) && ground > waterLine() + 2;
      const base = dry ? ground - 1 : Math.max(Number.isFinite(ground) ? ground : -Infinity, waterLine()) + 4;
      if (!Number.isFinite(base)) return;
      const tower = makeDragonTower(theme, !dry), feet = DRAGON_FEET * e.mesh.scale.x, top = tower.userData.perchY;
      const k = THREE.MathUtils.clamp((e.pos.y - feet - base) / top, ROOST.scale[0], ROOST.scale[1]);
      tower.scale.set(ROOST.wide, k, ROOST.wide); // as wide as she is long, whatever its height: all four feet on the stone
      tower.position.set(x, base, z);
      const yaw = Math.atan2(G.player.pos.x - x, G.player.pos.z - z);
      tower.rotation.y = yaw + Math.PI / 2; // the turret off to her side
      G.scene.add(tower);
      u.tree = tower;
      e.pos.y = base + top * k + feet;
      u.perch = { at: e.pos.clone(), t: 0, hp: e.hp, yaw, top: base + top * k };
    },
    // Off her tower: a roar, a hard push up and toward you, stone dust off the battlements, wings beating hard.
    launch(en, e) {
      const G = en.G, u = e.mesh.userData, P = u.perch;
      if (!P) return;
      u.perch = null;
      _a.copy(G.player.pos).sub(e.pos).setY(0);
      if (_a.lengthSq() > 1) _a.normalize();
      e.vel.set(0, ROOST.hop, 0).addScaledVector(_a, ROOST.hop * 0.6);
      G.fx.emit(_b.set(e.pos.x, P.top, e.pos.z), 24, { colors: ['#d8cce6', '#b8b0c4', '#ffffff', '#ff9ad6'], speed: 26, life: 1.3, size: 5 });
      G.audio.tone(140, 0.7, { type: 'sawtooth', vol: 0.07, slide: -60 }); // the roar
      G.audio.noise(0.5, { vol: 0.08, freq: 300 });
      (e.dragon ||= {}).launch = 1.2;
      (e.dragon.flap ||= 0);
    },
    attack(en, e, n) {
      const m = e.mv ||= { tell: 0, rakes: 0, hits: 0, volleys: 0 };
      const G = en.G, p = G.player;
      if (m.tell > 0 || m.fire) return;
      const dist = e.pos.distanceTo(p.pos);
      const due = m.due || n % (e.enraged ? 2 : 3) === 0;
      if (due && !p.landed && !p.dead && dist > RAKE.near && dist < RAKE.far) {
        m.due = false;
        m.locked = false;
        e.rakeTells = (e.rakeTells || 0) + 1; // (on her, not the move: a breakaway clears the move)
        m.tell = m.tell0 = !e.rakeTip ? RAKE.first : e.enraged ? RAKE.tellRage : RAKE.tell;
        if (!e.rakeTip) { e.rakeTip = true; G.ui.notify('Dragon breath! A sparkle line means fire. Climb or dive off the line.', 'warn', 4, 1); }
        MOVES.rake.aim(en, e);
        G.audio.tone(110, m.tell, { type: 'sawtooth', vol: 0.045, slide: 220 }); // a rising growl
        return;
      }
      m.due = due; // a Rake you were too close (or too far) for comes at the next attack you're in range for
      const from = e.mesh.userData.snout.getWorldPosition(_c);
      const at = _a.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / RAKE.bonbonSpeed) * 0.6);
      for (let j = 0; j < RAKE.bonbons; j++) {
        const d = _b.copy(at).sub(from).normalize().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(RAKE.bonbonSpread));
        en.fireOrb(from, d, RAKE.bonbonSpeed, RAKE.bonbonDmg, RAKE.colors[j % 2], 1.2).src = e;
      }
      m.volleys++;
      m.puff = 0.35;
      G.audio.tone(420, 0.16, { type: 'triangle', vol: 0.06, slide: -200 });
    },
    // Where the line lies: across your path, where you'll be when it fires, at your height; it starts at her end.
    aim(en, e) {
      const m = e.mv, p = en.G.player, f = flatFwd(p, _a);
      const ahead = Math.max(RAKE.ahead, p.speed * (m.tell + RAKE.sweep * 0.5) * RAKE.lead);
      const mid = (m.mid ||= new THREE.Vector3()).copy(p.pos).addScaledVector(f, ahead);
      const side = (m.side ||= new THREE.Vector3()).set(-f.z, 0, f.x);
      if (side.dot(_b.subVectors(e.pos, mid)) > 0) side.negate(); // sweep from her side across
      (m.fwd ||= new THREE.Vector3()).copy(f);
      const k = Math.min(2, e.broken?.dragonHorn || 0);
      m.len = RAKE.len[k];
      m.linger = RAKE.linger[k];
    },
    // Fire! The sweep starts at her end of the line.
    breathe(en, e) {
      const m = e.mv;
      m.fire = { t: 0, hit: false, prev: null, len: m.len, linger: m.linger };
      m.rakes++;
      dodgeStart(en, e);
      en.G.audio.noise(1.2, { vol: 0.14, freq: 900 });
      en.G.shake?.(0.25, 0.4);
    },
    // A point on the line, s from its start (0 .. len).
    at(m, s, out) { return out.copy(m.mid).addScaledVector(m.side, s - m.len / 2); },
    // Every frame (animate): the tell, the line, the sweep and the curtain, the hit test, her shadow and her pose.
    pose(en, e, dt) {
      const u = e.mesh.userData, m = e.mv, G = en.G, p = G.player, fx = MOVES.rake.fx(en, e);
      if (m?.tell > 0) {
        if (m.tell > RAKE.lock) MOVES.rake.aim(en, e); // the line follows you until just before it fires
        else if (!m.locked) { m.locked = true; G.audio.tone(880, 0.08, { type: 'square', vol: 0.05 }); } // locked: a click, and the sparkles hold still
        if (Math.random() < dt * 20) G.fx.emit(u.snout.getWorldPosition(_a), 1, { colors: RAKE_FX, speed: 8, life: 0.7, size: 3 });
        if ((m.tell -= dt) <= 0) { m.tell = 0; MOVES.rake.breathe(en, e); }
      }
      const F = m?.fire, show = !!(m && (m.tell > 0 || F));
      fx.dots.visible = fx.ground.visible = show && !(F && F.t > RAKE.sweep);
      if (fx.dots.visible) {
        const swept = F ? Math.min(1, F.t / RAKE.sweep) : 0;
        for (let k = 0; k < RAKE.dots; k++) {
          const s = ((k + 0.5) / RAKE.dots) * m.len, on = s >= swept * m.len;
          MOVES.rake.at(m, s, _o.position);
          _o.rotation.set(e.t * 3 + k, e.t * 2, 0);
          _o.scale.setScalar(!on ? 0.001 : m.locked || F ? 1.5 : 1.1 + 0.5 * Math.sin(e.t * 9 + k * 1.7));
          _o.updateMatrix();
          fx.dots.setMatrixAt(k, _o.matrix);
          const gy = Math.max(G.terrain.surfaceHeight(_o.position.x, _o.position.z, _o.position.y), waterLine());
          _o.position.y = Number.isFinite(gy) && gy < _o.position.y ? gy + 0.8 : -1e5;
          _o.rotation.set(0, e.t + k, 0);
          _o.scale.set(on ? 1.6 : 0.001, 0.2, on ? 1.6 : 0.001);
          _o.updateMatrix();
          fx.ground.setMatrixAt(k, _o.matrix);
        }
        fx.dots.instanceMatrix.needsUpdate = fx.ground.instanceMatrix.needsUpdate = true;
        fx.dots.material.opacity = F || m.locked ? 1 : 0.35 + 0.5 * Math.min(1, (m.tell0 - m.tell) / 0.4);
      }
      fx.fire.visible = fx.jet.visible = false;
      if (F) {
        F.t += dt;
        const T = RAKE.sweep, end = T + F.linger + RAKE.fade, swept = Math.min(1, F.t / T) * F.len;
        const fade = F.t <= T + F.linger ? 1 : Math.max(0, 1 - (F.t - T - F.linger) / RAKE.fade);
        // The curtain: flames stacked over the swept part of the line, flickering.
        fx.fire.visible = fade > 0;
        for (let k = 0; k < RAKE.flames; k++) {
          const s = ((k % 18) + 0.5) / 18 * F.len, row = Math.floor(k / 18), lit = s <= swept;
          MOVES.rake.at(m, s, _o.position).y += (row - 1) * RAKE.height * 0.33 + Math.sin(e.t * 7 + k) * 1.2;
          const gy = G.terrain.surfaceHeight(_o.position.x, _o.position.z, _o.position.y);
          if (Number.isFinite(gy) && _o.position.y < gy + 2) _o.position.y = gy + 2; // clipped at the ground
          _o.rotation.set(0, e.t * 2 + k, 0);
          const w = lit ? (0.75 + 0.35 * Math.sin(e.t * 13 + k * 2.3)) * fade : 0.001;
          _o.scale.set(w * 6, w * RAKE.height * 0.32, w * RAKE.depth * 0.6);
          _o.updateMatrix();
          fx.fire.setMatrixAt(k, _o.matrix);
        }
        fx.fire.instanceMatrix.needsUpdate = true;
        fx.fire.material.opacity = 0.75 * fade;
        // The jet, from her snout to the head of the sweep, while it sweeps.
        if (F.t <= T) {
          const from = u.snout.getWorldPosition(_a), to = MOVES.rake.at(m, swept, _b), d = _c.subVectors(to, from), len = d.length();
          fx.jet.visible = true;
          fx.jet.position.copy(from).addScaledVector(d, 0.5);
          fx.jet.quaternion.setFromUnitVectors(Y, d.normalize());
          fx.jet.scale.set(3 + Math.sin(e.t * 30), len, 3 + Math.sin(e.t * 30));
          if (Math.random() < dt * 30) G.fx.emit(to, 2, { colors: RAKE_FX, speed: 18, life: 0.8, size: 4, up: 6 });
        }
        // The hit: inside the burning stretch, at its height, through its depth (or across it since the last frame).
        if (!F.hit && !p.dead && F.t <= T + F.linger) { // (not once the curtain is fading out)
          _a.subVectors(p.pos, m.mid);
          const along = _a.dot(m.side) + F.len / 2, across = _a.dot(m.fwd), up = p.pos.y - m.mid.y;
          const thru = Math.abs(across) < RAKE.depth / 2 || (F.prev != null && Math.sign(F.prev) !== Math.sign(across) && Math.abs(F.prev - across) < 40);
          if (along >= 0 && along <= swept && Math.abs(up) < RAKE.height / 2 && thru) {
            F.hit = true;
            m.hits++;
            p.damage(RAKE.dmg);
            G.fx.emit(p.pos, 18, { colors: RAKE_FX, speed: 20, life: 0.9, size: 4 });
            if (!(en.rakeNews > G.time)) { en.rakeNews = G.time + 6; G.ui.notify('Lightly caramelized!', 'bad', 2); }
          }
          F.prev = across;
        }
        if (F.t >= end) { m.fire = null; dodgeEnd(en, e); }
      }
      if (m) m.puff = Math.max(0, (m.puff || 0) - dt);
      if (u.perch && e.chase) MOVES.rake.launch(en, e); // a break pulls her off her tower too
      if (!e.dead) {
        MOVES.rake.fly(en, e, dt);
        shade(en, e, e.radius * 0.8);
        const sh = u.groundShadow; // long, like her: stretched along her body and turned with her
        if (sh?.visible) { const s = sh.scale.x; sh.scale.set(s * 1.4, s * 2.4, 1); sh.rotation.z = e.mesh.rotation.y; }
      }
      if (u.tree) {
        u.tree.userData.flag.rotation.y = Math.sin(e.t * 2.3) * 0.35 + (u.perch ? 0 : Math.sin(e.t * 9) * 0.2);
        if (!u.perch && u.tree.position.distanceToSquared(p.pos) > ROOST.gone ** 2) MOVES.gust.fell(en, e);
      }
    },
    // Her body language, every frame. She faces you (turned a little toward where she's going, or turning to fly that way
    // when she's heading well off), banks into turns and pitches with her climb. Wings: perched folded back along her
    // flanks; in flight a couple of heavy beats then a glide; in a rear-up spread wide and back-beating; breathing held
    // out. Her neck follows her head with a lag, her head stays on you (on the line while she breathes), her tail
    // swishes in a wave, her legs tuck in flight and grip while perched, her jaw opens, her throat and belly glow.
    fly(en, e, dt) {
      const u = e.mesh.userData, m = e.mv, o = (e.dragon ||= {}), p = en.G.player, tell = m?.tell > 0, fire = !!m?.fire && m.fire.t <= RAKE.sweep, sit = !!u.perch;
      const ease = (r) => 1 - Math.exp(-dt * r), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), clamp = THREE.MathUtils.clamp;
      if (!o.init) Object.assign(o, { init: true, yaw: u.perch?.yaw ?? Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), away: false, roll: 0, pitch: 0, ph: 0, beats: 0, glide: 0, w: 1, acc: new THREE.Vector3(), v0: e.vel.clone(), blink: rand(2, 5), launch: o.launch || 0, smoke: 1 });
      e.mesh.rotation.order = 'YXZ';
      const toYaw = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), sp = Math.hypot(e.vel.x, e.vel.z), hold = sit || tell || fire;
      if (dt > 0) { _a.subVectors(e.vel, o.v0).divideScalar(dt); o.acc.lerp(_a, ease(4)); o.v0.copy(e.vel); }
      const velYaw = Math.atan2(e.vel.x, e.vel.z), off = wrap(velYaw - toYaw);
      if (hold || sp < 8) o.away = false;
      else if (Math.abs(off) > 1.1) o.away = true;
      else if (Math.abs(off) < 0.9) o.away = false;
      const lead = hold || sp < 8 ? 0 : clamp(off, -ROOST.bank, ROOST.bank) * Math.min(1, sp / 25);
      if (!sit) o.yaw += wrap((o.away ? velYaw : toYaw + lead) - o.yaw) * ease(3);
      const lat = o.acc.x * Math.cos(o.yaw) - o.acc.z * Math.sin(o.yaw);
      o.roll += ((hold ? 0 : clamp(-lat / 26, -ROOST.bank, ROOST.bank)) - o.roll) * ease(2.5);
      o.pitch += ((sit ? 0 : tell || fire ? -0.25 : clamp(-e.vel.y / 70, -ROOST.pitch, ROOST.pitch)) - o.pitch) * ease(2.5);
      e.mesh.rotation.set(o.pitch, o.yaw, o.roll);
      // The wingbeat: two heavy strokes, then a glide unless she needs the lift.
      o.launch = Math.max(0, (o.launch || 0) - dt);
      const lift = o.launch > 0 || e.vel.y > 5 || e.vel.length() < 18;
      if (o.glide > 0) { o.glide -= dt; if (lift) o.glide = 0; }
      const flapping = !sit && o.glide <= 0;
      if (flapping || tell || fire) {
        const rate = tell || fire ? 1.6 : lift ? ROOST.flapUp : ROOST.flap, ph = o.ph + dt * TAU * rate;
        if (!tell && !fire && Math.floor(ph / TAU) > Math.floor(o.ph / TAU) && ++o.beats >= ROOST.beats && !lift) { o.beats = 0; o.glide = rand(...ROOST.glide); }
        o.ph = ph;
      }
      o.w += ((flapping ? 1 : 0) - o.w) * ease(5);
      const S = Math.sin(o.ph), S2 = Math.sin(o.ph - 0.8);
      // [arm lift, arm sweep back, hand fold, hand lift]: folded / rear-up back-beat / breathing / flight (beat <-> glide).
      const W = sit ? [0.9, 0.7, 1.2, -0.5, 5]
        : tell ? [0.55 + 0.18 * S, -0.15, 0.1, 0.25 + 0.25 * S2, 10]
        : fire ? [0.3 + 0.1 * S, -0.05, 0.05, 0.15 + 0.15 * S2, 10]
        : [0.08 * (1 - o.w) + (0.1 + 0.62 * S) * o.w, 0.05 * (1 - o.w) + 0.12 * Math.cos(o.ph) * o.w, -0.05 + 0.25 * o.w * Math.max(0, -S), 0.05 * (1 - o.w) + 0.45 * S2 * o.w, 14];
      u.wings.forEach((wg, k) => {
        const sd = k ? 1 : -1, h = u.hands[k];
        wg.rotation.order = h.rotation.order = 'YZX';
        wg.rotation.z += (sd * W[0] - wg.rotation.z) * ease(W[4]);
        wg.rotation.y += (sd * W[1] - wg.rotation.y) * ease(W[4]);
        h.rotation.y += (sd * W[2] - h.rotation.y) * ease(W[4]);
        h.rotation.z += (sd * W[3] - h.rotation.z) * ease(W[4]);
      });
      u.rig.position.y = flapping ? -0.25 * S * o.w : sit ? 0 : 0.1 * Math.sin(e.t * 1.2);
      // Head and neck: the head turns to you (or to the head of the sweep); each neck segment takes a share, lagging.
      let hy = clamp(wrap(toYaw - o.yaw), -1.5, 1.5), hp = 0;
      if (sit && e.pos.distanceTo(p.pos) > 500) hy = Math.sin(e.t * 0.5) * 0.9; // perched and you're far: she looks about
      if (fire) {
        const to = MOVES.rake.at(m, Math.min(1, m.fire.t / RAKE.sweep) * m.fire.len, _b);
        hy = clamp(wrap(Math.atan2(to.x - e.pos.x, to.z - e.pos.z) - o.yaw), -1.5, 1.5);
        hp = clamp(Math.atan2(e.pos.y - to.y, Math.hypot(to.x - e.pos.x, to.z - e.pos.z)), -0.6, 0.6);
      }
      const rear = tell ? -0.45 : fire ? 0.15 : sit ? 0.1 : 0;
      const base = [-0.75, -0.25, 0.55];
      u.neck.forEach((n, k) => {
        n.rotation.y += (hy / 3 - n.rotation.y) * ease(5 - k * 1.2);
        n.rotation.x += (base[k] + (k === 0 ? rear : k === 2 ? hp * 0.5 - rear * 0.6 : 0) + (flapping ? 0.06 * Math.sin(o.ph + 0.6 + k * 0.5) * o.w : 0.03 * Math.sin(e.t * 1.1 + k)) - n.rotation.x) * ease(4 - k);
        n.rotation.z += (-o.roll * 0.25 - n.rotation.z) * ease(3);
      });
      u.head.rotation.x += (0.45 + hp * 0.5 + (sit ? 0.15 : 0) - u.head.rotation.x) * ease(5);
      u.jaw.rotation.x += ((fire ? 0.65 : tell ? 0.25 : (m?.puff || 0) > 0 ? 0.4 : 0.04 + 0.03 * Math.sin(e.t * 1.7)) - u.jaw.rotation.x) * ease(8);
      if ((o.blink -= dt) <= 0) o.blink = rand(2.5, 5);
      u.lids.forEach((l) => { l.visible = o.blink < 0.13 && !fire; });
      // Glows: her throat swells pink then white in a rear-up; the mouth glows while she breathes; the belly breathes.
      const k0 = tell ? 1 - m.tell / m.tell0 : 0, hot = fire ? 1 : k0;
      u.throat.material.opacity += (hot * 0.85 - u.throat.material.opacity) * ease(6);
      u.throat.material.color.setRGB(1, 0.42 + 0.58 * Math.max(0, k0 * 2 - 1) * (fire ? 0 : 1), 0.78 + 0.22 * Math.max(0, k0 * 2 - 1));
      u.mouth.material.opacity += ((fire ? 0.95 : tell ? 0.4 * k0 : 0) - u.mouth.material.opacity) * ease(8);
      u.stripe.material.opacity = 0.15 + 0.15 * (0.5 + 0.5 * Math.sin(e.t * TAU / 3)) + 0.6 * hot; // quiet, brighter only as she breathes
      // Smoke from her nostrils now and then (perched, more often).
      if ((o.smoke -= dt) <= 0) { o.smoke = sit ? rand(1, 2) : rand(2.5, 5); en.G.fx.emit(u.snout.getWorldPosition(_a), 3, { colors: ['#ffc8e8', '#ffffff', '#f0b0d8'], speed: 4, life: 1.4, size: 4, up: 4 }); }
      // Tail: a slow wave down its length, curled down the stonework when perched, swung against her banks in flight.
      u.tail.forEach((t, k) => {
        const yw = (sit ? 0.12 : 0.28) * Math.sin(e.t * (sit ? 0.8 : 1.6) - k * 0.75) + (sit ? 0 : o.roll * 0.15);
        const xw = sit ? (k === 0 ? -0.95 : -0.22) : (k ? -0.04 : -0.15) + 0.05 * Math.sin(o.ph - k * 0.6) * o.w + o.pitch * 0.12; // (negative: down)
        t.rotation.y += (yw - t.rotation.y) * ease(4);
        t.rotation.x += (xw - t.rotation.x) * ease(4);
      });
      // Legs: standing on the stone perched, tucked back in flight, reaching forward in a rear-up.
      u.fore.forEach((l) => { l.rotation.x += ((sit ? 0 : tell ? -0.55 : 1.0) - l.rotation.x) * ease(5); });
      u.hind.forEach((l) => { l.rotation.x += ((sit ? 0 : tell ? 0.2 : 1.15) - l.rotation.x) * ease(5); });
    },
    // The line's sparkles (and their twins on the ground), the curtain's flames and the jet: made once per boss.
    fx(en, e) {
      const u = e.mesh.userData;
      if (u.rakeFx) return u.rakeFx;
      const G = en.G, col = new THREE.Color();
      const dots = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false }), RAKE.dots);
      const ground = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshBasicMaterial({ color: '#ff6ac8', transparent: true, opacity: 0.45, depthWrite: false }), RAKE.dots);
      const fire = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }), RAKE.flames);
      for (let k = 0; k < RAKE.dots; k++) dots.setColorAt(k, col.set(k % 3 ? '#ff8ad0' : '#ffe08a'));
      for (let k = 0; k < RAKE.flames; k++) fire.setColorAt(k, col.set(pick(['#ff5ab8', '#ff8ad0', '#ffb0e0', '#ffd8a0'])));
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.25, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#ffb0e0', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      for (const x of [dots, ground, fire, jet]) { x.frustumCulled = false; x.visible = false; G.scene.add(x); }
      return (u.rakeFx = { dots, ground, fire, jet });
    },
    hide(e) { const fx = e.mesh.userData.rakeFx; if (fx) for (const x of Object.values(fx)) x.visible = false; },
  },

  // Grandma Atolla (Tropical Archipelago): asleep at first, only her shell and its islet above the water (see NAP), till
  // you come near, hit her or she's napped long enough. Then she paddles the surface, keeping about WHIRL.keep m off
  // you and steering round headlands, and lobs coconuts from her palms. Every 3rd attack (2nd enraged), when you're
  // within `far` m and under `reach` m over the sea, a foam ring opens on open water where you're heading and she rears
  // up (the tell), dives (she can't be hurt under), and the sea there spins: for `spin` s it pulls a plane inside the
  // ring toward its middle (`pull`, with a `swirl` round it) and down (`sink`), both fading to nothing at `safe` m up.
  // Dipping to `touch` m off the water inside it splashes you (`splash` hull, once) and throws you clear. Then she
  // bursts up from the middle with a beak snap (`snap` hull within `snapR` m). Caught by it and out unhurt: a dodge.
  whirl: {
    step(en, e, c) {
      const G = en.G, u = e.mesh.userData, m = e.mv ||= { tell: 0, whirls: 0, catches: 0, splashes: 0, snaps: 0, volleys: 0, yaw: null, turn: 0 };
      if (m.yaw === null) m.yaw = Math.atan2(c.p.pos.x - e.pos.x, c.p.pos.z - e.pos.z);
      const N = u.nap;
      if (N) { // asleep: an island, till you come near, hit her, or she's napped long enough
        N.t += c.dt;
        if (c.dist < NAP.near || N.t > NAP.wait || e.hp < N.hp) MOVES.whirl.wake(en, e);
        return true;
      }
      if (m.tell > 0 || m.pool) { m.rate = 0; return true; } // rearing up, or under the sea
      // Head for a point WHIRL.keep m off you, round to your side: in when far, along when near, out when too close.
      const to = _a.set(c.p.pos.x - e.pos.x, 0, c.p.pos.z - e.pos.z), d = to.length() || 1;
      let want = Math.atan2(to.x, to.z);
      if (d < WHIRL.keep + 60) want += (m.side ||= Math.random() < 0.5 ? 1 : -1) * Math.PI * (d < WHIRL.keep - 40 ? 0.7 : 0.5);
      const s = e.mesh.scale.x, open = (yaw) => {
        const r = 30 * s + 25, x = e.pos.x + Math.sin(yaw) * r, z = e.pos.z + Math.cos(yaw) * r;
        return G.terrain.surfaceHeight(x, z) < waterLine() - 3;
      };
      let diff = Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw)), go = 1;
      if (!open(m.yaw)) { // land ahead: turn the open way, slowing to squeeze round
        if (!m.turn) m.turn = open(m.yaw + 0.7) ? 1 : open(m.yaw - 0.7) ? -1 : 1;
        diff = m.turn;
        go = open(m.yaw + m.turn * 0.7) ? 0.4 : 0;
        if (go === 0) m.side = -m.side || 1;
      } else m.turn = 0;
      const rate = THREE.MathUtils.clamp(diff * 1.5, -WHIRL.turn, WHIRL.turn);
      m.yaw += rate * c.dt;
      m.rate = rate;
      e.vel.set(Math.sin(m.yaw), 0, Math.cos(m.yaw)).multiplyScalar(en.cruise(e) * go * (e.dazed > 0 ? 0.3 : 1));
      e.mesh.rotation.y = m.yaw;
      return true;
    },
    hold: (e) => e.mv?.tell > 0 || !!e.mv?.pool || !!e.mesh.userData.nap,
    // At spawn: she's asleep, head and flippers in, low in the water, gulls round her palms.
    spawn(en, e) {
      const u = e.mesh.userData;
      u.nap = { t: 0, hp: e.hp, k: 1 };
      e.mesh.rotation.y = Math.atan2(en.G.player.pos.x - e.pos.x, en.G.player.pos.z - e.pos.z) + Math.PI * 0.5; // side-on to you, like an island
      (e.mv ||= { tell: 0, whirls: 0, catches: 0, splashes: 0, snaps: 0, volleys: 0, yaw: null, turn: 0 }).yaw = e.mesh.rotation.y;
    },
    // Awake: a deep, slow bellow, a big splash, the gulls scatter.
    wake(en, e) {
      const G = en.G, u = e.mesh.userData;
      if (!u.nap) return;
      u.nap = null;
      u.wake = 0;
      G.fx.emit(_b.copy(e.pos).setY(waterLine() + 2), 30, { colors: SPLASH, speed: 22, life: 1.4, size: 6, up: 18 });
      G.audio.tone(70, 1.1, { type: 'sawtooth', vol: 0.07, slide: 30 }); // the bellow
      G.audio.noise(0.7, { vol: 0.09, freq: 400 });
      G.ui.notify('That island just opened its eyes. It\'s Grandma Atolla!', 'warn', 3, 1);
    },
    attack(en, e, n) {
      const m = e.mv, G = en.G, p = G.player;
      if (!m || m.tell > 0 || m.pool || e.mesh.userData.nap) return;
      const dist = e.pos.distanceTo(p.pos), sea = waterLine();
      const due = m.due || n % (e.enraged ? 2 : 3) === 0;
      if (due && !p.landed && !p.dead && dist < WHIRL.far && p.pos.y - sea < WHIRL.reach) {
        const tell = !e.whirlTip ? WHIRL.first : e.enraged ? WHIRL.tellRage : WHIRL.tell;
        const at = MOVES.whirl.spot(en, e, tell);
        if (at) {
          m.due = false;
          m.at = at;
          m.tell = m.tell0 = tell;
          e.whirlTells = (e.whirlTells || 0) + 1;
          if (!e.whirlTip) { e.whirlTip = true; G.ui.notify('A ring of foam on the sea means a whirlpool. Climb high or swing wide!', 'warn', 4, 1); }
          en.warn(at, WHIRL.r, '#d8f6ff', m.tell + WHIRL.dive, () => {}, { owner: e });
          G.audio.tone(90, m.tell, { type: 'sine', vol: 0.06, slide: -30 }); // a deep rumble
          return;
        }
      }
      m.due = due; // a Whirlpool with no open water ahead (or you too high or far) comes at the next attack that fits
      // Coconuts: one from each palm still standing (and a couple from the biggest), at where you'll be.
      const u = e.mesh.userData, palms = u.palms.filter((x) => x.visible), k = WHIRL.coconuts[Math.min(3, e.broken?.palm || 0)];
      for (let j = 0; j < k; j++) {
        const from = palms.length ? palms[j % palms.length].localToWorld(_c.copy(palms[j % palms.length].userData.top)) : u.head.getWorldPosition(_c);
        const at = _a.copy(p.pos).addScaledVector(p.forward, p.speed * (from.distanceTo(p.pos) / WHIRL.nutSpeed) * 0.6);
        const d = _b.copy(at).sub(from).normalize().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(WHIRL.nutSpread));
        en.fireOrb(from, d, WHIRL.nutSpeed, WHIRL.nutDmg, j % 2 ? '#8a5a2a' : '#6a4422', 1.3).src = e;
      }
      m.volleys++;
      m.puff = 0.4;
      G.audio.tone(260, 0.12, { type: 'triangle', vol: 0.06, slide: -120 }); // thunk
    },
    // Where the Whirlpool opens: on open water where you'll be when it starts spinning (or a little either side).
    spot(en, e, tell) {
      const G = en.G, p = G.player, f = flatFwd(p, _a), side = sideOf(f, _b), sea = waterLine();
      const ahead = p.speed * (tell + WHIRL.dive) * WHIRL.lead;
      const deep = (x, z) => G.terrain.surfaceHeight(x, z) < sea - 4;
      for (const off of [0, 40, -40, 80, -80]) {
        const x = p.pos.x + f.x * ahead + side.x * off, z = p.pos.z + f.z * ahead + side.z * off;
        if (deep(x, z) && deep(x + WHIRL.r * 0.7, z) && deep(x - WHIRL.r * 0.7, z) && deep(x, z + WHIRL.r * 0.7) && deep(x, z - WHIRL.r * 0.7)) return new THREE.Vector3(x, sea, z);
      }
      return null;
    },
    // The whirlpool's look: a spiral of foam arms on a dark-teal disc, a funnel under it, spinning (in the scene).
    fx(en, e) {
      const u = e.mesh.userData;
      if (u.whirlFx) return u.whirlFx;
      const g = new THREE.Group(), n = 64, rings = 8, pos = [], col = [], idx = [];
      const deep = new THREE.Color('#0e4a5a'), foam = new THREE.Color('#e8fbff'), mid = new THREE.Color('#2a8aa0');
      for (let r = 0; r <= rings; r++) for (let k = 0; k <= n; k++) {
        const a = (k / n) * TAU, rr = 0.08 + (r / rings) * 0.92;
        pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        const arm = 0.5 + 0.5 * Math.sin(a * 4 + rr * 9); // four foam arms spiralling in
        const c = deep.clone().lerp(mid, rr).lerp(foam, arm ** 6 * (0.3 + 0.7 * rr));
        col.push(c.r, c.g, c.b);
      }
      for (let r = 0; r < rings; r++) for (let k = 0; k < n; k++) {
        const a = r * (n + 1) + k, b = a + n + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      const disc = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      const funnel = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#0a3440', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
      funnel.rotation.x = Math.PI; // point down
      funnel.position.y = -0.35;
      g.add(disc, funnel);
      g.visible = false;
      en.G.scene.add(g);
      u.whirlFx = g;
      g.userData = { disc, funnel };
      return g;
    },
    // Her tell is over: she dives.
    dive(en, e) {
      const m = e.mv;
      m.pool = { at: m.at.clone(), t: 0, phase: 'dive', caught: false, hurt: false };
      m.whirls++;
      e.shield = 0;
      dodgeStart(en, e);
      en.G.fx.emit(_b.copy(e.pos).setY(waterLine() + 1), 24, { colors: SPLASH, speed: 18, life: 1.2, size: 6, up: 12 });
      en.G.audio.noise(0.8, { vol: 0.1, freq: 350 });
    },
    // Every frame (animate): the nap and the wake, the paddling, the head following you, the rear-up, the dive, the
    // Whirlpool's pull and its look, the burst back up.
    pose(en, e, dt) {
      const u = e.mesh.userData, m = e.mv, G = en.G, p = G.player, sea = waterLine(), s = e.mesh.scale.x;
      const { rig, neck, head, jaw, lids, flippers, gulls, foam, patch } = u;
      if (m?.tell > 0 && (m.tell -= dt) <= 0) { m.tell = 0; MOVES.whirl.dive(en, e); }
      const P = m?.pool;
      let under = 0; // how far she's down (model units), 0 at the surface
      if (P) {
        P.t += dt;
        const fx = MOVES.whirl.fx(en, e);
        if (P.phase === 'dive') {
          under = WHIRL.deep * Math.min(1, P.t / WHIRL.dive);
          if (P.t >= WHIRL.dive) { P.phase = 'spin'; P.t = 0; e.pos.x = P.at.x; e.pos.z = P.at.z; }
        } else if (P.phase === 'spin') {
          under = WHIRL.deep;
          MOVES.whirl.pull(en, e, P, dt);
          if (P.t >= WHIRL.spin) MOVES.whirl.burst(en, e, P);
        } else { // 'up': she bursts out of the middle
          const k = Math.min(1, P.t / WHIRL.up);
          under = WHIRL.deep * (1 - k) - Math.sin(k * Math.PI) * 1.6;
          if (k >= 1) m.pool = null;
        }
        const grow = P.phase === 'dive' ? Math.min(1, P.t / WHIRL.dive) : P.phase === 'spin' ? 1 : Math.max(0, 1 - P.t / WHIRL.up);
        fx.visible = grow > 0.01;
        fx.position.set(P.at.x, sea + 0.3, P.at.z);
        fx.scale.setScalar(WHIRL.r * (0.3 + 0.7 * grow));
        fx.userData.funnel.scale.set(1, 1 + grow * 0.6, 1);
        fx.userData.disc.rotation.y -= dt * (1.2 + 2.2 * grow);
        fx.userData.disc.material.opacity = 0.85 * grow;
        if (P.phase === 'spin' && Math.random() < dt * 30) { // foam spinning in
          const a = Math.random() * TAU, r = WHIRL.r * (0.5 + Math.random() * 0.5);
          G.fx.emit(_a.set(P.at.x + Math.cos(a) * r, sea + 1, P.at.z + Math.sin(a) * r), 1, { colors: SPLASH, speed: 6, life: 0.8, size: 4 });
        }
      } else if (u.whirlFx) u.whirlFx.visible = false;
      // The nap: k 1 asleep .. 0 awake (head and flippers out, up in the water).
      const N = u.nap, k = N ? 1 : Math.max(0, (u.napK ?? 1) - dt * 1.2);
      u.napK = k;
      u.sw = (u.sw || 0) + dt * (N ? 0.4 : 2.2);
      const sw = u.sw, tell = m?.tell > 0 ? Math.min(1, (m.tell0 - m.tell) / 0.4) : 0;
      const rear = P?.phase === 'up' ? 0.6 * Math.sin(Math.min(1, P.t / WHIRL.up) * Math.PI) : tell;
      rig.visible = under < WHIRL.deep * 0.98;
      rig.position.y = -0.55 - 0.9 * k - under + (N ? 0 : 0.12 * Math.sin(sw * 2));
      rig.rotation.x = -0.3 * rear + (P?.phase === 'dive' ? 0.35 * Math.min(1, P.t / 0.3) : 0) + 0.02 * Math.sin(sw);
      rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, -(m?.rate || 0) * 0.35 + 0.02 * Math.sin(sw * 0.7), 1 - Math.exp(-dt * 3));
      neck.position.z = 5.4 - 2.2 * k;
      neck.scale.setScalar(1 - 0.45 * k);
      // Her head follows you (within a wide arc), higher while she rears.
      _a.copy(p.pos);
      neck.parent.worldToLocal(_a);
      const yaw = THREE.MathUtils.clamp(Math.atan2(_a.x, _a.z - neck.position.z), -0.8, 0.8) * (1 - k);
      const pitch = THREE.MathUtils.clamp(Math.atan2(_a.y - neck.position.y, Math.hypot(_a.x, _a.z)), -0.3, 0.6) * (1 - k);
      neck.rotation.y += (yaw - neck.rotation.y) * (1 - Math.exp(-dt * 3));
      neck.rotation.x += (-pitch * 0.5 - 0.35 * rear - neck.rotation.x) * (1 - Math.exp(-dt * 3));
      head.rotation.x = -pitch * 0.4;
      if (m?.puff > 0) m.puff -= dt;
      jaw.rotation.x = THREE.MathUtils.lerp(jaw.rotation.x, rear > 0.2 || m?.puff > 0 ? 0.55 : 0.04 * (1 + Math.sin(sw * 0.5)), 1 - Math.exp(-dt * 8));
      const blink = N ? 1 : (Math.sin(e.t * 0.9) > 0.985 ? 1 : 0);
      for (const lid of lids) lid.rotation.x = -0.5 + 0.85 * blink;
      // Flippers: a slow power stroke (front pair), a paddle (rear pair); raised high in the rear-up; tucked asleep.
      for (const f of flippers) {
        const { sd, front } = f.userData;
        const flap = front ? Math.sin(sw) : Math.sin(sw + Math.PI);
        f.rotation.z = (front ? sd * (0.12 + 0.45 * flap) * (1 - rear) + sd * 0.95 * rear : sd * 0.1 * flap) * (1 - k) - sd * 0.15 * k;
        f.rotation.y = (front ? -sd * 0.45 * Math.cos(sw) : sd * 0.5 * flap) * (1 - k) + sd * (front ? 0.9 : -0.9) * k;
        f.scale.setScalar(1 - 0.4 * k);
      }
      // Gulls circle the islet while she naps; when she wakes they lift off and are gone.
      if (gulls.visible) {
        u.wake = N ? 0 : (u.wake || 0) + dt;
        gulls.children.forEach((gl, i) => {
          const d = gl.userData, a = d.a + e.t * (0.6 + i * 0.12), r = d.r + u.wake * 6;
          gl.position.set(Math.cos(a) * r, d.h + Math.sin(e.t * 1.3 + i) * 0.3 + u.wake * 5, Math.sin(a) * r);
          gl.rotation.set(0, -a, Math.sin(e.t * 6 + i) * 0.25);
        });
        if (u.wake > 3) gulls.visible = false;
      }
      u.lantern.material.color.setScalar(0.85 + 0.15 * Math.sin(e.t * 7.3) * Math.sin(e.t * 3.1));
      // Foam at the water line round her (and a wake behind while she swims), the dark water under her.
      foam.visible = patch.visible = under < 1.5;
      foam.position.y = patch.position.y = (sea - e.pos.y) / s + 0.04;
      foam.material.opacity = 0.35 + 0.15 * Math.sin(sw * 2);
      const moving = e.vel.lengthSq() > 4;
      foam.scale.set(5.6 * (moving ? 1.06 : 1), 6.7 * (moving ? 1.12 : 1), 1);
      if (moving && Math.random() < dt * 14) {
        e.mesh.updateMatrixWorld();
        const back = e.mesh.localToWorld(_b.set(rand(-4, 4), 0, -7));
        G.fx.emit(back.setY(sea + 0.5), 1, { colors: SPLASH, speed: 4, life: 1.6, size: 5 });
        const bow = e.mesh.localToWorld(_b.set(rand(-3, 3), 0, 7.5));
        G.fx.emit(bow.setY(sea + 0.8), 1, { colors: SPLASH, speed: 8, life: 0.7, size: 4, up: 4 });
      }
    },
    // The pull: in, round and down, fading with height; a dip to the water splashes you clear (once).
    pull(en, e, P, dt) {
      const G = en.G, p = G.player, sea = waterLine();
      if (p.dead || p.landed || P.hurt) return; // splashed: thrown clear, no more pull this time
      const dx = P.at.x - p.pos.x, dz = P.at.z - p.pos.z, d = Math.hypot(dx, dz), h = p.pos.y - sea;
      if (d > WHIRL.r || h > WHIRL.safe) return;
      const k = (1 - h / WHIRL.safe) * (0.35 + 0.65 * (1 - d / WHIRL.r));
      const ix = dx / (d || 1), iz = dz / (d || 1);
      p.gust.set(ix * WHIRL.pull * k - iz * WHIRL.swirl * k, 0, iz * WHIRL.pull * k + ix * WHIRL.swirl * k);
      p.gustDecay = 3;
      if (!P.caught) { P.caught = true; e.mv.catches++; G.ui.notify('Caught in the whirlpool! Pull up and out!', 'bad', 2); }
      if (!P.hurt) p.pos.y = Math.max(p.pos.y - WHIRL.sink * k * dt, sea + WHIRL.touch - 0.5);
      if (!P.hurt && p.pos.y - sea < WHIRL.touch) {
        P.hurt = true;
        P.why = { h: +(p.pos.y - sea).toFixed(1), d: Math.round(d), was: +h.toFixed(1) }; // for the smoke test
        e.mv.splashes++;
        p.damage(WHIRL.splash);
        p.pos.y = sea + WHIRL.touch + 8; // thrown clear
        p.gust.set(-ix * 25, 0, -iz * 25);
        G.fx.emit(_a.copy(p.pos).setY(sea + 1), 26, { colors: SPLASH, speed: 20, life: 1.1, size: 6, up: 14 });
        G.audio.noise(0.5, { vol: 0.12, freq: 600 });
        G.shake?.(0.35, 0.3);
      }
      if (Math.random() < dt * 8) G.shake?.(0.08, 0.15);
    },
    // Up she comes, beak first, from the middle: a snap at anything close, a tower of spray.
    burst(en, e, P) {
      const G = en.G, p = G.player, sea = waterLine();
      P.phase = 'up';
      P.t = 0;
      e.mv.puff = WHIRL.up;
      e.shield = 1; // out of the water: she can be hit again
      p.gustDecay = 2.2; // the player's own default
      G.fx.emit(_a.copy(P.at).setY(sea + 2), 40, { colors: SPLASH, speed: 30, life: 1.6, size: 7, up: 30 });
      G.audio.noise(0.9, { vol: 0.14, freq: 300 });
      G.audio.tone(160, 0.2, { type: 'square', vol: 0.06, slide: -80 }); // the snap
      if (!p.dead && p.pos.distanceTo(_a.copy(P.at).setY(sea + 8)) < WHIRL.snapR) { e.mv.snaps++; p.damage(WHIRL.snap); }
      if (P.caught) dodgeEnd(en, e); else e.mv.dodge = null; // flying nowhere near it isn't a dodge
    },
    // A breakaway or reset: back to the surface, the whirlpool gone.
    hide(e) {
      const u = e.mesh.userData;
      if (u.whirlFx) u.whirlFx.visible = false;
      u.rig.visible = true;
      e.shield = 1;
    },
  },

  // Count Ribbiton (ground, hop): sits on his giant toadstool, then bounds after you across the ground, one big
  // hop at a time (see LEAP), lobbing spore puffs between hops; every 3rd attack (2nd enraged) a tongue lash instead.
  // He sets his own height: sitting on the ground (or his toadstool) or in the arc of a hop.
  leap: {
    spawn(en, e) {
      const G = en.G, u = e.mesh.userData, { x, z } = e.pos, ground = G.terrain.surfaceHeight(x, z), feet = TOAD_FEET * e.mesh.scale.x;
      const m = (e.mv = { phase: 'sit', t: 0, wait: LEAP.perch, hops: 0, sporeVolleys: 0, lashes: 0, hits: 0, tell: 0, settle: 0, at: e.pos.clone() });
      m.at.y = ground + feet;
      if (Number.isFinite(ground) && ground > waterLine() + 2 && !Number.isFinite(G.terrain.ceilingHeight(x, z, e.pos.y))) {
        const stool = makeGiantToadstool(), k = LEAP.stool;
        stool.scale.setScalar(k);
        stool.position.set(x, ground - 1, z);
        stool.rotation.y = rand(0, TAU);
        G.scene.add(stool);
        u.tree = stool;
        m.at.y = ground - 1 + stool.userData.topY * k + feet;
        u.perch = { hp: e.hp };
      }
      e.pos.copy(m.at);
      e.yaw = Math.atan2(G.player.pos.x - x, G.player.pos.z - z);
    },
    step(en, e, c) {
      const G = en.G, u = e.mesh.userData, p = c.p, dt = c.dt;
      const m = e.mv ||= { phase: 'sit', t: 0, wait: 1, hops: 0, sporeVolleys: 0, lashes: 0, hits: 0, tell: 0, settle: 0, at: e.pos.clone() };
      m.t += dt;
      m.settle = Math.max(0, m.settle - dt);
      e.vel.set(0, 0, 0);
      MOVES.leap.tongue(en, e, c);
      const feet = TOAD_FEET * e.mesh.scale.x;
      if (m.phase === 'sit') {
        if (!u.perch) m.at.y = G.terrain.surfaceHeight(m.at.x, m.at.z) + feet; // feet on the ground (even after a persuasion grows him)
        e.pos.copy(m.at);
        m.bodyS = m.settle > 0 ? [1.25, 0.72, 1.25] : [1, 1, 1];
        const busy = m.tell > 0 || !!m.lash;
        const ready = u.perch ? c.dist < LEAP.near || m.t >= LEAP.perch || e.hp < u.perch.hp : m.t >= m.wait && (m.attacked || m.t > LEAP.restless);
        if (!busy && ready && c.dist < LEAP.follow) { m.phase = 'crouch'; m.t = 0; }
      } else if (m.phase === 'crouch') {
        e.pos.copy(m.at);
        m.bodyS = [1.3, 0.68, 1.3];
        if (m.t >= LEAP.crouch) {
          const to = MOVES.leap.spot(en, e, p, feet);
          if (!to) { m.phase = 'sit'; m.t = 0; m.wait = 1; m.attacked = false; return true; } // nowhere to land: stays put
          const d = Math.hypot(to.x - m.at.x, to.z - m.at.z);
          Object.assign(m, { phase: 'air', t: 0, k: 0, from: m.at.clone(), to, T: THREE.MathUtils.clamp(LEAP.air[0] + d / LEAP.airK, LEAP.air[0], LEAP.air[1]), apex: to.apex });
          u.perch = null;
          G.audio.tone(180, 0.25, { type: 'sine', vol: 0.07, slide: 220 }); // boing
        }
      } else if (m.phase === 'air') {
        const k = Math.min(1, m.t / m.T);
        e.pos.lerpVectors(m.from, m.to, k);
        e.pos.y += 4 * m.apex * k * (1 - k);
        m.bodyS = [0.88, 1.18, 0.88];
        m.k = k;
        if (k >= 1) {
          e.pos.copy(m.to);
          Object.assign(m, { phase: 'sit', t: 0, at: m.to.clone(), settle: LEAP.settle, attacked: false, wait: rand(...(e.enraged ? LEAP.sitRage : LEAP.sit)) });
          m.hops++;
          _a.copy(e.pos).setY(e.pos.y - feet + 1);
          G.fx.emit(_a, 22, { colors: LEAP.dust, speed: 30, life: 0.9, size: 5 });
          G.audio.tone(110, 0.3, { type: 'sine', vol: 0.12, slide: -40 }); // thud
          G.audio.tone(300, 0.12, { type: 'square', vol: 0.04, slide: -120, delay: 0.12 }); // rib-
          G.audio.tone(240, 0.16, { type: 'square', vol: 0.04, slide: -100, delay: 0.26 }); // -bit
          if (e.pos.distanceTo(p.pos) < 200) G.shake?.(0.25, 0.2);
        }
      }
      return true;
    },
    // Where to land: on a ring LEAP.ring m round where you're heading, a little further round you than he is now, at most
    // LEAP.reach away. Dry, gentle, roofless ground only, and an arc that clears the hills on the way; else a shorter hop,
    // the other way round, or none (null).
    spot(en, e, p, feet) {
      const G = en.G, from = e.mv.at;
      _b.set(p.forward.x, 0, p.forward.z);
      if (_b.lengthSq() < 0.01) _b.set(0, 0, -1);
      const cx = p.pos.x + _b.normalize().x * LEAP.ahead, cz = p.pos.z + _b.z * LEAP.ahead;
      const a0 = Math.atan2(from.z - cz, from.x - cx), side = (e.mv.hops % 2 ? 1 : -1) * (Math.random() < 0.7 ? 1 : -1);
      for (const [turn, short] of [[side, 1], [-side, 1], [side, 0.5], [-side, 0.5], [0, 0.35]]) {
        const a = a0 + turn * LEAP.turn;
        _c.set(cx + Math.cos(a) * LEAP.ring - from.x, 0, cz + Math.sin(a) * LEAP.ring - from.z);
        _c.clampLength(0, LEAP.reach * short);
        const x = from.x + _c.x, z = from.z + _c.z, g = G.terrain.surfaceHeight(x, z);
        if (!Number.isFinite(g) || g < waterLine() + 2 || !en.isGentleGround(x, z) || Number.isFinite(G.terrain.ceilingHeight(x, z, g + 5))) continue;
        const d = _c.length(), to = new THREE.Vector3(x, g + feet, z);
        let apex = THREE.MathUtils.clamp(d * LEAP.apexK, LEAP.apex[0], LEAP.apex[1]), ok = true;
        for (let s = 1; s < 8 && ok; s++) { // the arc must clear the ground under it by LEAP.clear m
          const k = s / 8, hx = from.x + _c.x * k, hz = from.z + _c.z * k, top = from.y + (to.y - from.y) * k - feet;
          const need = G.terrain.surfaceHeight(hx, hz) + LEAP.clear - top;
          if (need > 4 * apex * k * (1 - k)) apex = need / (4 * k * (1 - k));
          if (apex > LEAP.apex[1] * 1.6) ok = false;
        }
        if (ok) return Object.assign(to, { apex });
      }
      return null;
    },
    hold: (e) => e.mv?.phase !== 'sit' || e.mv.tell > 0 || !!e.mv.lash || e.mv.settle > 0 || !!e.mesh.userData.perch,
    attack(en, e, n) {
      const m = e.mv, G = en.G, p = G.player;
      if (!m || m.phase !== 'sit' || m.tell > 0 || m.lash) return;
      m.attacked = true;
      const mouth = e.mesh.userData.mouth.getWorldPosition(new THREE.Vector3()), dist = mouth.distanceTo(p.pos);
      if (n % (e.enraged ? 2 : 3) === 0 && dist < LEAP.lashRange && MOVES.leap.clearLine(en, mouth, p.pos)) {
        m.tell = m.tell0 = !e.tongueTip ? LEAP.first : e.enraged ? LEAP.tellRage : LEAP.tell;
        if (!e.tongueTip) { e.tongueTip = true; G.ui.notify('Tongue lash! When his throat swells, turn or climb off the pink line.', 'warn', 4, 1); }
        G.audio.tone(140, m.tell, { type: 'sawtooth', vol: 0.035, slide: 160 }); // a swelling croak
        m.aim = p.pos.clone();
        return;
      }
      const k = Math.min(2, e.broken?.crest || 0), count = LEAP.spores[k];
      const at = _a.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / LEAP.sporeSpeed) * 0.6);
      for (let j = 0; j < count; j++) {
        const d = _b.copy(at).sub(mouth).normalize().add(_c.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(LEAP.spread));
        en.fireOrb(mouth, d, LEAP.sporeSpeed, LEAP.sporeDmg, j % 2 ? LEAP.sporeColor : LEAP.sporeColor2, 1.2).src = e;
      }
      m.sporeVolleys++;
      G.audio.tone(420, 0.15, { type: 'triangle', vol: 0.06, slide: -200 }); // puff
    },
    clearLine(en, a, b) {
      for (let s = 1; s < 8; s++) { _c.lerpVectors(a, b, s / 8); if (en.G.terrain.surfaceHeight(_c.x, _c.z, _c.y) > _c.y - 2) return false; }
      return true;
    },
    // The tell (aim leads you to where you'll be at the strike, then locks), the lash out and back, the hit.
    tongue(en, e, c) {
      const m = e.mv, G = en.G, p = c.p, dt = c.dt;
      if (m.tell > 0) {
        if (m.tell > LEAP.lock) m.aim.copy(p.pos).addScaledVector(p.forward, p.speed * (m.tell / c.pace + LEAP.out));
        if ((m.tell -= dt) <= 0) {
          m.tell = 0;
          const from = e.mesh.userData.mouth.getWorldPosition(new THREE.Vector3());
          m.lash = { t: 0, from, dir: m.aim.clone().sub(from).normalize(), len: 0, hit: false };
          m.lashes++;
          G.audio.tone(900, 0.12, { type: 'sine', vol: 0.06, slide: -600 }); // thwip
        }
      }
      const L = m.lash;
      if (!L) return;
      L.t += dt;
      const T = LEAP.out + LEAP.hold, out = L.t < LEAP.out ? L.t / LEAP.out : L.t < T ? 1 : Math.max(0, 1 - (L.t - T) / LEAP.back);
      L.len = LEAP.tongue * out;
      if (!L.hit && L.t < T && !p.dead && !p.landed) {
        _a.subVectors(p.pos, L.from);
        const along = THREE.MathUtils.clamp(_a.dot(L.dir), 0, L.len), off = _b.copy(L.from).addScaledVector(L.dir, along).distanceTo(p.pos);
        if (off < LEAP.width + 3 * (p.sizeScale || 1) && !(p.invuln > 0) && !p.dodging) {
          L.hit = true;
          m.hits++;
          p.damage(LEAP.dmg);
          p.speed = Math.max(p.baseSpeed * 0.5, p.speed - LEAP.slow);
          if (!(en.tongueNews > G.time)) { en.tongueNews = G.time + 6; G.ui.notify('Tongued! Sticky.', 'bad', 2); }
        }
      }
      if (L.t >= T + LEAP.back) m.lash = null;
    },
    // Every frame (animate): he faces you sitting, his hop's way in the air (nose up, then down); sac, jaw, legs, lids,
    // the aim line and the tongue, his shadow.
    pose(en, e, dt) {
      if (e.dead) return MOVES.leap.hide(e);
      const u = e.mesh.userData, m = e.mv, G = en.G, p = G.player, ease = (r) => 1 - Math.exp(-dt * r);
      const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), air = m?.phase === 'air', o = (e.toad ||= { blink: rand(2, 5), pitch: 0 });
      const toYaw = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      const aim = air ? Math.atan2(m.to.x - m.from.x, m.to.z - m.from.z) : m?.tell > 0 || m?.lash ? Math.atan2((m.lash?.dir.x ?? m.aim.x - e.pos.x), (m.lash?.dir.z ?? m.aim.z - e.pos.z)) : toYaw;
      e.yaw = (e.yaw ?? aim) + wrap(aim - (e.yaw ?? aim)) * ease(air ? 6 : 3);
      o.pitch += ((air ? -0.35 * (1 - 2 * m.k) : 0) - o.pitch) * ease(8);
      e.mesh.rotation.order = 'YXZ';
      e.mesh.rotation.set(o.pitch, e.yaw, 0);
      const tell = m?.tell > 0, sit = !air && m?.phase !== 'crouch';
      const swell = tell ? 1.25 + 0.5 * (1 - m.tell / m.tell0) : m?.lash ? 1.2 : 1 + 0.12 * Math.sin(e.t * 3);
      u.sac.scale.setScalar(u.sac.scale.x + (swell - u.sac.scale.x) * ease(10));
      u.sacMat.color.copy(tell || m?.lash ? SAC_HOT : SAC);
      u.jaw.rotation.x += ((tell ? 0.35 : m?.lash ? 0.6 : 0) - u.jaw.rotation.x) * ease(10);
      if ((o.blink -= dt) <= 0) o.blink = rand(2, 5);
      u.lids.forEach((l) => { l.visible = o.blink < 0.12; });
      u.hind.forEach((l) => { l.rotation.x += ((air ? 1.25 : m?.phase === 'crouch' ? -0.2 : 0) - l.rotation.x) * ease(air ? 10 : 8); l.scale.y += ((air ? 1.3 : 1) - l.scale.y) * ease(8); });
      u.fore.forEach((l) => { l.rotation.x += ((air ? -0.9 : 0) - l.rotation.x) * ease(8); });
      // The aim line (faint, then brighter once it locks) and the tongue: world meshes from his mouth.
      const fx = MOVES.leap.tongueMesh(en, e);
      const from = u.mouth.getWorldPosition(_c);
      fx.line.visible = tell;
      if (tell) {
        _a.copy(m.aim).sub(from);
        const len = Math.min(LEAP.tongue, _a.length() + 30);
        place(fx.line, from, _a.normalize(), len);
        fx.line.material.opacity = m.tell <= LEAP.lock ? 0.55 : 0.2;
      }
      const L = m?.lash;
      fx.tongue.visible = fx.tip.visible = !!L && L.len > 1;
      if (fx.tongue.visible) {
        place(fx.tongue, L.from, L.dir, L.len);
        fx.tip.position.copy(L.from).addScaledVector(L.dir, L.len);
      }
      shade(en, e, e.radius * (sit ? 0.75 : 0.6));
      if (u.tree && !u.perch && u.tree.position.distanceTo(p.pos) > PERCH.gone) MOVES.gust.fell(en, e); // his toadstool, far behind you
    },
    tongueMesh(en, e) {
      const u = e.mesh.userData;
      if (u.tongueFx) return u.tongueFx;
      const pink = new THREE.MeshBasicMaterial({ color: '#ff6fae' });
      const line = new THREE.Mesh(BEAM_LINE, new THREE.MeshBasicMaterial({ color: '#ff6fae', transparent: true, opacity: 0.2, depthWrite: false }));
      const tongue = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 8, 1), pink);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), pink);
      for (const x of [line, tongue, tip]) { x.visible = false; x.frustumCulled = false; en.G.scene.add(x); }
      return (u.tongueFx = { line, tongue, tip });
    },
    hide(e) { const f = e.mesh.userData.tongueFx; if (f) for (const x of [f.line, f.tongue, f.tip]) x.visible = false; },
  },

  // Queen Quartzelle (Crystal Caverns): walks the cave roof upside down (the ground where there's no roof) toward a spot
  // beside your path, now and then dashing past you to turn and face you (WEB.every), firing crystal shards; every 3rd attack (2nd enraged) she rears up and spins a Web Wall across
  // your path (see WEB). She sets her own height (hop) and turns herself (pose).
  web: {
    spawn(en, e) {
      const m = (e.mv = MOVES.web.fresh(e));
      MOVES.web.surface(en, e, m, e.pos.x, e.pos.z);
      e.pos.y = m.goalY;
      e.flipK = m.roof ? 1 : 0;
      e.yaw = Math.atan2(en.G.player.pos.x - e.pos.x, en.G.player.pos.z - e.pos.z);
    },
    fresh: (e) => ({ roof: (e.flipK || 0) > 0.5, goalY: e.pos.y, side: Math.random() < 0.5 ? 1 : -1, moving: 0, gait: 0, pitch: 0, tell: 0, tell0: 1, webs: 0, snares: 0, passes: 0, volleys: 0, walked: 0, plan: null, web: null, phase: 'trail', clock: WEB.opener, dashes: 0, head: null, floorT: 0, drops: 0, line: false }),
    // What she stands on at (x, z): the roof over it if there is one (m.roof), else the ground; m.goalY her height there.
    surface(en, e, m, x, z) {
      const T = en.G.terrain, feet = SPIDER_FEET * e.mesh.scale.x, floor = T.surfaceHeight(x, z, e.pos.y);
      const roof = T.ceilingHeight(x, z, m.roof ? e.pos.y : floor + 5);
      m.roof = !(m.floorT > 0) && Number.isFinite(roof) && roof - floor > feet * 3; // (not while she's dropped to the floor)
      m.goalY = m.roof ? roof - feet : Math.max(floor, waterLine()) + feet;
      return m.roof ? roof : floor;
    },
    step(en, e, c) {
      const G = en.G, p = c.p, dt = c.dt, m = (e.mv ||= MOVES.web.fresh(e));
      e.vel.set(0, 0, 0);
      MOVES.web.spin(en, e, c);
      // Her run: mostly she trails toward a spot beside your path (and a plane outruns her); now and then she dashes past
      // you to a spot well ahead, then keeps pace there facing you (WEB.every). Not while rearing up for a web.
      const f = flatFwd(p, _a), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      m.clock -= dt;
      const lead = (e.pos.x - p.pos.x) * f.x + (e.pos.z - p.pos.z) * f.z; // how far ahead of you she is
      if (m.phase === 'trail' && m.clock <= 0 && m.tell <= 0 && !p.landed) {
        m.phase = 'dash'; m.clock = WEB.dashMax; m.dashes++;
        if (!e.dashTip) { e.dashTip = true; G.ui.notify('She scuttles ahead of you and turns round: now her eyes are in your sights!', 'info', 3, 1); }
      } else if (m.phase === 'dash' && (m.clock <= 0 || lead > WEB.front * 0.7)) {
        m.phase = 'show'; m.clock = WEB.show;
        if (m.roof && m.dashes % WEB.dropEvery === 0) {
          m.floorT = WEB.floorTime; m.drops++; m.line = true;
          if (!e.dropTip) { e.dropTip = true; G.ui.notify('She drops to the cave floor on a silk line: hit her while she is down!', 'info', 3, 1); }
        }
      } else if (m.phase === 'show' && m.clock <= 0) {
        m.phase = 'trail'; m.clock = e.enraged ? WEB.everyRage : WEB.every;
      }
      if (m.floorT > 0) m.floorT -= dt;
      if (m.line && m.floorT <= 0 && m.roof && Math.abs(m.goalY - e.pos.y) < 2) m.line = false; // back up her line
      const run = m.phase !== 'trail', far = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) > WEB.chase;
      const spot = run ? WEB.front : WEB.ahead, off = run ? WEB.frontSide * m.side : far ? 0 : WEB.side * m.side;
      const tx = p.pos.x + f.x * spot - f.z * off, tz = p.pos.z + f.z * spot + f.x * off;
      const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz), turnRate = run ? WEB.dashTurn : WEB.turn;
      e.yaw ??= Math.atan2(dx, dz);
      m.head ??= e.yaw;
      let go = 0;
      if (m.tell <= 0 && d > (m.phase === 'show' ? 1 : WEB.near)) {
        const turn = wrap(Math.atan2(dx, dz) - m.head);
        m.head += THREE.MathUtils.clamp(turn, -turnRate * dt, turnRate * dt);
        const top = run ? (e.enraged ? WEB.dashRage : WEB.dash) : e.enraged ? WEB.walkRage : WEB.walk;
        // Keeping pace: your speed, plus a little to close the gap to her spot.
        const want = m.phase === 'show' ? Math.min(top, p.speed / c.pace + d * 1.5) : top * Math.min(1, d / 40);
        go = want * Math.max(0.25, Math.cos(Math.min(Math.abs(turn), 1.4)));
        const nx = e.pos.x + Math.sin(m.head) * go * dt, nz = e.pos.z + Math.cos(m.head) * go * dt;
        // Only where there's rock to hold on to: under a roof if she's on one (no stepping off its edge on purpose), on
        // dry land if she's on the ground. Blocked, she turns away from it.
        const T = G.terrain, roofThere = Number.isFinite(T.ceilingHeight(nx, nz, m.roof ? e.pos.y : T.surfaceHeight(nx, nz) + 5));
        const ok = m.roof ? roofThere : T.surfaceHeight(nx, nz) > waterLine() + 1;
        if (ok) { e.pos.x = nx; e.pos.z = nz; m.walked += go * dt; } else { m.head += turnRate * dt * m.side; go = 0; }
      }
      // She looks where she runs, except when keeping pace ahead of you: then she turns round to face you.
      const look = m.phase === 'show' ? Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z) : m.head;
      e.yaw += THREE.MathUtils.clamp(wrap(look - e.yaw), -WEB.dashTurn * dt, WEB.dashTurn * dt);
      m.moving += ((go > 1 ? go : 0) - m.moving) * (1 - Math.exp(-dt * 6));
      m.gait += (m.moving * dt) / WEB.stride;
      // Follow the rock, and lean with it along her way.
      // Going between roof and floor (on her line, or where a roof ends) she drops or climbs at her own pace; walking the
      // rock she keeps her feet on it, the faster the faster she walks (bumps and all at a dash).
      const was = m.roof, here = MOVES.web.surface(en, e, m, e.pos.x, e.pos.z), dy = m.goalY - e.pos.y;
      if (was !== m.roof) m.over = true;
      if (m.over && Math.abs(dy) < 2) m.over = false;
      const own = Math.abs(dy) > 30 ? WEB.drop : WEB.climb, rate = m.line || m.over ? own : Math.max(own, m.moving * 4);
      e.pos.y += THREE.MathUtils.clamp(dy, -rate * dt, rate * dt);
      const o = 4 * e.mesh.scale.x, sx = Math.sin(e.yaw) * o, sz = Math.cos(e.yaw) * o, T = G.terrain;
      const at = (x, z) => (m.roof ? T.ceilingHeight(x, z, e.pos.y) : T.surfaceHeight(x, z, e.pos.y));
      const ahead = at(e.pos.x + sx, e.pos.z + sz), back = at(e.pos.x - sx, e.pos.z - sz);
      const slope = Number.isFinite(ahead) && Number.isFinite(back) && Number.isFinite(here) ? -Math.atan2(ahead - back, 2 * o) : 0;
      m.pitch += (THREE.MathUtils.clamp(slope, -WEB.tilt, WEB.tilt) - m.pitch) * (1 - Math.exp(-dt * 4));
      if (m.walked > 400 && !run) { m.walked = 0; m.side = -m.side; } // now and then she crosses to your other side
      return true;
    },
    hold: (e) => e.mv?.tell > 0,
    attack(en, e, n) {
      const m = e.mv, G = en.G, p = G.player;
      if (!m || m.tell > 0) return;
      const from = MOVES.web.mouth(e, new THREE.Vector3()), dist = from.distanceTo(p.pos);
      // A web due while she's ahead (your window) waits until she's trailing again.
      const due = n % (e.enraged ? 2 : 3) === 0 || m.webDue;
      if (due && m.phase !== 'trail') m.webDue = true;
      else if (due && !m.web && dist < WEB.far && !p.landed && !p.dead) {
        m.webDue = false;
        m.tell = m.tell0 = !e.webTip ? WEB.first : e.enraged ? WEB.tellRage : WEB.tell;
        if (!e.webTip) { e.webTip = true; G.ui.notify('Web Wall! When she rears up, a web spins across your path. Once it stops following you, turn hard round its edge.', 'warn', 4, 1); }
        m.plan = { c: new THREE.Vector3(), n: new THREE.Vector3(), R: MOVES.web.size(e) };
        MOVES.web.aim(en, e, m, p, 1);
        G.audio.tone(520, m.tell, { type: 'triangle', vol: 0.03, slide: 380 }); // a rising crystal hum
        return;
      }
      const lead = _b.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / WEB.shardSpeed) * 0.6);
      for (let j = 0; j < WEB.shards; j++) {
        const d = _c.copy(lead).sub(from).normalize().add(_a.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(WEB.spread));
        en.fireOrb(from, d, WEB.shardSpeed, WEB.shardDmg, WEB.colors[j % 2], 1.1).src = e;
      }
      m.volleys++;
      m.snap = 0.35;
      G.audio.tone(1500, 0.12, { type: 'triangle', vol: 0.05, slide: -500 }); // tink
    },
    size: (e) => WEB.R[Math.min(3, e.broken?.gem || 0)],
    // Between her fangs.
    mouth: (e, out) => { const h = e.mesh.userData.head; h.updateWorldMatrix(true, false); return h.localToWorld(out.set(0, -0.6, 0.7)); },
    // Where the web goes: where you'll be `lead` s after it sets, facing your way, and clear of the floor and the roof.
    aim(en, e, m, p, pace) {
      const P = m.plan, f = flatFwd(p, _a), T = en.G.terrain;
      P.n.copy(f);
      P.c.copy(p.pos).addScaledVector(f, p.speed * (m.tell / pace + WEB.lead));
      const floor = Math.max(T.surfaceHeight(P.c.x, P.c.z, p.pos.y), waterLine()), roof = T.ceilingHeight(P.c.x, P.c.z, p.pos.y);
      const lo = floor + P.R + 2, hi = Number.isFinite(roof) ? roof - P.R - 2 : Infinity; // (the whole disc clear of the rock, unless the cave's too low)
      P.c.y = lo > hi ? (floor + roof) / 2 : THREE.MathUtils.clamp(p.pos.y, lo, hi);
      P.floor = floor;
      P.roof = roof;
    },
    // The tell (the web spinning up, following you), the web setting, you crossing it (or round it), its end.
    spin(en, e, c) {
      const m = e.mv, G = en.G, p = c.p, dt = c.dt;
      m.snap = Math.max(0, (m.snap || 0) - dt);
      if (m.tell > 0) {
        if (m.tell > WEB.lock) MOVES.web.aim(en, e, m, p, c.pace || 1);
        if ((m.tell -= dt) <= 0) {
          m.tell = 0;
          m.web = Object.assign(m.plan, { t: 0, near: false });
          m.plan = null;
          m.webs++;
          dodgeStart(en, e);
          G.audio.tone(260, 0.3, { type: 'sine', vol: 0.06, slide: -60 }); // thrum
        }
      }
      const W = m.web;
      if (!W) return;
      W.t += dt;
      if (!p.dead && !p.landed) {
        if (p.pos.distanceTo(W.c) < W.R + WEB.pass) W.near = true; // close by it (turned off it, or round its edge)
        const s0 = _a.subVectors(p.prevPos, W.c).dot(W.n), s1 = _b.subVectors(p.pos, W.c).dot(W.n);
        if (s0 * s1 <= 0 && s0 !== s1) {
          const k = s0 / (s0 - s1), r = _c.lerpVectors(p.prevPos, p.pos, k).distanceTo(W.c);
          if (r < W.R + 3 * (p.sizeScale || 1)) return MOVES.web.tear(en, e, m, _c, !(p.invuln > 0) && !p.dodging);
          if (r < W.R + WEB.pass) W.near = true;
        }
      }
      if (W.t >= WEB.hold) {
        m.web = null;
        if (W.near) { m.passes++; dodgeEnd(en, e); } else m.dodge = null;
      }
    },
    tear(en, e, m, at, hurt) {
      const G = en.G, p = G.player;
      m.web = null;
      G.fx.emit(at.clone(), 34, { colors: SILK, speed: 34, life: 1, size: 4 });
      if (p.dodging) dodgeEnd(en, e); // rolled through it: that's a dodge too
      m.dodge = null;
      if (!hurt) return;
      m.snares++;
      p.damage(WEB.dmg);
      p.speed = Math.max(p.baseSpeed * 0.5, p.speed - WEB.slow);
      if (!(en.webNews > G.time)) { en.webNews = G.time + 6; G.ui.notify('Webbed! Sticky crystal silk.', 'bad', 2); }
      G.audio.tone(180, 0.25, { type: 'sawtooth', vol: 0.05, slide: -80 });
    },
    // Every frame (animate): her facing and lean, turning over onto the roof, her gait, the rear-up, fangs and feelers,
    // the crystals' glow, her glint on the rock, the web (spinning up, then solid) and its threads.
    pose(en, e, dt) {
      if (e.dead) return MOVES.web.hide(e);
      const u = e.mesh.userData, m = e.mv, G = en.G, ease = (r) => 1 - Math.exp(-dt * r), t = e.t;
      if (!m) return;
      e.flipK = (e.flipK ?? (m.roof ? 1 : 0)) + ((m.roof ? 1 : 0) - (e.flipK ?? 0)) * ease(3); // (on e: a breakaway's fresh move keeps it)
      e.mesh.rotation.order = 'YXZ';
      e.mesh.rotation.set(m.pitch, e.yaw ?? 0, 0);
      u.flip.rotation.z = e.flipK * Math.PI;
      const tell = m.tell > 0, rear = tell ? 1 : 0, k = tell ? 1 - m.tell / m.tell0 : 0;
      u.rig.rotation.x += (-0.3 * rear - u.rig.rotation.x) * ease(6);
      u.rig.position.y = Math.abs(Math.sin(m.gait * TAU)) * 0.08 * Math.min(1, m.moving / 10);
      const stride = Math.min(1, m.moving / 12);
      for (const hip of u.spiderLegs) {
        const h = hip.userData, ph = m.gait * TAU + h.ph, lift = hip.children[0];
        const up = h.k === 0 && rear ? 0.95 + 0.12 * Math.sin(t * 9 + h.sd) : Math.max(0, Math.cos(ph)) * 0.4 * stride;
        hip.rotation.y += (h.base - h.sd * Math.sin(ph) * 0.28 * stride * (h.k === 0 && rear ? 0 : 1) - hip.rotation.y) * ease(12); // (-sd: both sides step forward)
        lift.rotation.z += (up - lift.rotation.z) * ease(12);
      }
      const bite = tell ? 0.35 + 0.15 * Math.sin(t * 14) : m.snap > 0 ? 0.5 : 0.05 * Math.sin(t * 2);
      for (const f of u.fangs) f.rotation.z += (f.userData.sd * bite - f.rotation.z) * ease(14);
      for (const pp of u.palps) pp.rotation.x = Math.sin(t * 3 + pp.userData.sd) * 0.25 - rear * 0.4;
      u.gemMat.emissiveIntensity = 1 + 0.35 * Math.sin(t * 2.2) + 2.2 * k + (m.snap > 0 ? 1 : 0);
      u.glint.position.y = (m.roof ? 1 : -1) * SPIDER_FEET;
      u.glint.material.opacity = 0.1 + 0.05 * Math.sin(t * 1.7) + 0.25 * k;
      // The web: a world mesh facing you, spun up (faint, growing) in the tell, then solid; threads to the roof and floor.
      // Her drop line, from her spinnerets straight up to the roof, while she's down off it (and climbing back).
      const dl = u.dragFx || (m.line ? (u.dragFx = MOVES.web.dragMesh(en)) : null);
      if (dl) {
        const roofY = m.line ? G.terrain.ceilingHeight(e.pos.x, e.pos.z, e.pos.y) : Infinity;
        u.rig.updateWorldMatrix(true, false);
        const from = u.rig.localToWorld(_c.set(0, 0.1, -5.3)), len = roofY - from.y;
        dl.visible = Number.isFinite(roofY) && len > 2 && len < 500;
        if (dl.visible) { place(dl, from, _a.set(0, 1, 0), len); dl.scale.x = dl.scale.z = 0.25; }
      }
      const W = m.web || m.plan, fx = W ? MOVES.web.webMesh(en, e) : u.webFx;
      if (!fx) return;
      fx.group.visible = !!W;
      if (!W) return;
      const grow = m.web ? 1 : 0.25 + 0.75 * k, R = W.R * grow;
      fx.disc.position.copy(W.c);
      fx.disc.quaternion.setFromUnitVectors(_a.set(0, 0, 1), W.n);
      fx.disc.scale.setScalar(R);
      fx.silk.opacity = m.web ? 0.85 + 0.12 * Math.sin(t * 6) * (1 - W.t / WEB.hold) : 0.2 + 0.35 * k;
      fx.fill.opacity = m.web ? 0.09 : 0.03;
      const side = _b.set(-W.n.z, 0, W.n.x);
      fx.threads.forEach((th, j) => {
        const up = j < 2, end = up ? W.roof : W.floor;
        const from = _c.copy(W.c).addScaledVector(side, (j % 2 ? 1 : -1) * R * 0.7).add(_a.set(0, (up ? 1 : -1) * R * 0.7, 0));
        const len = up ? end - from.y : from.y - end;
        th.visible = Number.isFinite(end) && len > 0 && len < 400;
        if (!th.visible) return;
        place(th, from, _a.set(0, up ? 1 : -1, 0), len);
        th.scale.x = th.scale.z = 0.28;
      });
      // Her line to it, from her spinnerets.
      u.rig.updateWorldMatrix(true, false);
      const tail = u.rig.localToWorld(_c.set(0, 0.1, -5.3)), to = _a.subVectors(W.c, tail), len = to.length();
      fx.line.visible = len > 5 && len < 600;
      if (fx.line.visible) { place(fx.line, tail, to.normalize(), Math.max(1, len - R * 0.9)); fx.line.scale.x = fx.line.scale.z = 0.22; }
    },
    webMesh(en, e) {
      const u = e.mesh.userData;
      if (u.webFx) return u.webFx;
      const group = new THREE.Group(), silk = new THREE.MeshBasicMaterial({ color: '#efe6ff', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
      const fill = new THREE.MeshBasicMaterial({ color: '#b48cff', transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const disc = new THREE.Mesh(MOVES.web.webGeo(), silk);
      disc.add(new THREE.Mesh(new THREE.CircleGeometry(1, 24), fill));
      const threads = [0, 1, 2, 3].map(() => new THREE.Mesh(BEAM_LINE, silk));
      const line = new THREE.Mesh(BEAM_LINE, silk);
      for (const x of [disc, line, ...threads]) { x.frustumCulled = false; group.add(x); }
      en.G.scene.add(group);
      return (u.webFx = { group, disc, threads, line, silk, fill });
    },
    // A unit orb-web in the XY plane: WEB.spokes spokes and a spiral of WEB.turns turns, as thin flat strips.
    webGeo() {
      const pos = [], w = 0.018;
      const strip = (ax, ay, bx, by) => {
        const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * w, ny = (dx / l) * w;
        pos.push(ax + nx, ay + ny, 0, ax - nx, ay - ny, 0, bx + nx, by + ny, 0, bx + nx, by + ny, 0, ax - nx, ay - ny, 0, bx - nx, by - ny, 0);
      };
      for (let s = 0; s < WEB.spokes; s++) { const a = (s / WEB.spokes) * TAU; strip(0, 0, Math.cos(a), Math.sin(a)); }
      const steps = WEB.spokes * WEB.turns;
      for (let s = 0; s < steps; s++) {
        const a0 = (s / WEB.spokes) * TAU, a1 = ((s + 1) / WEB.spokes) * TAU, r0 = 0.08 + 0.92 * (s / steps), r1 = 0.08 + 0.92 * ((s + 1) / steps);
        strip(Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a1) * r1, Math.sin(a1) * r1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return geo;
    },
    dragMesh(en) {
      const line = new THREE.Mesh(BEAM_LINE, new THREE.MeshBasicMaterial({ color: '#efe6ff', transparent: true, opacity: 0.55, depthWrite: false }));
      line.frustumCulled = false;
      line.visible = false;
      en.G.scene.add(line);
      return line;
    },
    hide(e) { const u = e.mesh.userData; if (u.webFx) u.webFx.group.visible = false; if (u.dragFx) u.dragFx.visible = false; },
  },

  // DJ Gigawatt (Neon Grid, Blockland): stomps the ground beside your path, now and then skating ahead of you to turn
  // and face you, firing neon notes; every 3rd attack (2nd enraged), in front of you, a crouch and a Bass Drop (see
  // BEAT). He sets his own height (hop) and turns himself (pose).
  beat: {
    spawn(en, e) {
      e.mv = MOVES.beat.fresh();
      e.pos.y = MOVES.beat.ground(en, e, e.pos.x, e.pos.z);
      e.yaw = Math.atan2(en.G.player.pos.x - e.pos.x, en.G.player.pos.z - e.pos.z);
    },
    fresh: () => ({ side: Math.random() < 0.5 ? 1 : -1, moving: 0, gait: 0, pitch: 0, tell: 0, tell0: 1, slam: 0, drops: 0, hits: 0, passes: 0, volleys: 0, walked: 0, phase: 'trail', clock: BEAT.opener, dashes: 0, head: null, ring: null, due: false }),
    // His waist height standing at (x, z): the ground (or the sea's top), plus his legs.
    ground: (en, e, x, z) => Math.max(en.G.terrain.surfaceHeight(x, z, e.pos.y), waterLine()) + MECH_FEET * e.mesh.scale.x,
    // The wall rises to rise m over the plane's height above the ground (at least H, at most cap: both lower with each
    // speaker busted), so climbing over it always takes a climb.
    height: (e, over = 0) => { const k = Math.min(2, e.broken?.speaker || 0); return THREE.MathUtils.clamp(over + BEAT.rise, BEAT.H[k], BEAT.cap[k]); },
    // The ground under a spot (his stomp height where there's none).
    floor: (en, x, z, y0) => { const g = en.G.terrain.surfaceHeight(x, z); return Number.isFinite(g) ? g : y0; },
    step(en, e, c) {
      const dt = c.dt, m = (e.mv ||= MOVES.beat.fresh());
      e.vel.set(0, 0, 0);
      MOVES.beat.wave(en, e, c);
      if (m.slam > 0) m.slam -= dt;
      strideCycle(en, e, c, BEAT, MOVES.beat.ground, 'He skates ahead of you and turns round: now his LED eyes are in your sights!');
      return true;
    },
    hold: (e) => e.mv?.tell > 0,
    attack(en, e, n) {
      const m = e.mv, G = en.G, p = G.player;
      if (!m || m.tell > 0) return;
      const from = MOVES.beat.mouth(e, new THREE.Vector3()), dist = from.distanceTo(p.pos);
      // A Bass Drop only comes from in front of you, where you can see the crouch (not mid-dash): a due one waits.
      const due = n % (e.enraged ? 2 : 3) === 0 || m.due;
      const fx = p.forward.x, fz = p.forward.z, fl = Math.hypot(fx, fz) || 1, tx = e.pos.x - p.pos.x, tz = e.pos.z - p.pos.z;
      const front = (fx * tx + fz * tz) / (fl * (Math.hypot(tx, tz) || 1)) > 0.3;
      if (due && (m.phase === 'dash' || !front)) m.due = true;
      else if (due && !m.ring && dist < BEAT.ringMax && !p.landed && !p.dead) {
        m.due = false;
        m.tell = m.tell0 = !e.dropTip ? BEAT.first : e.enraged ? BEAT.tellRage : BEAT.tell;
        if (!e.dropTip) { e.dropTip = true; G.ui.notify('Bass Drop! When he crouches with his arms up, a shockwave spreads along the ground. Climb over it!', 'warn', 4, 1); }
        G.audio.tone(110, m.tell, { type: 'sawtooth', vol: 0.03, slide: 220 }); // a rising bass wobble
        return;
      }
      const aim = _b.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / BEAT.noteSpeed) * 0.6);
      for (let j = 0; j < BEAT.notes; j++) {
        const d = _c.copy(aim).sub(from).normalize().add(_a.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(BEAT.spread));
        en.fireOrb(from, d, BEAT.noteSpeed, BEAT.noteDmg, BEAT.colors[j % 2], 1.1).src = e;
      }
      m.volleys++;
      m.kick = 0.3;
      G.audio.tone(330, 0.1, { type: 'square', vol: 0.04, slide: 220 }); // a synth stab
    },
    // Between his speakers, just under the visor.
    mouth(e, out) {
      const u = e.mesh.userData;
      u.face.updateWorldMatrix(true, false);
      return u.face.localToWorld(out.set(0, -0.8, 0.6));
    },
    // The crouch counts down to the stomp; the stomp starts the wave, which spreads until ringMax.
    wave(en, e, c) {
      const m = e.mv, G = en.G, p = c.p, dt = c.dt;
      if (m.tell > 0) {
        m.tell -= dt;
        if (m.tell <= 0) {
          const s = e.mesh.scale.x, y0 = e.pos.y - MECH_FEET * s, h0 = p.pos.y - MOVES.beat.floor(en, p.pos.x, p.pos.z, y0), H = MOVES.beat.height(e, h0);
          // under: the plane was below its top when it rose, so getting over it is a dodge (a plane already high gets none)
          m.ring = { x: e.pos.x, z: e.pos.z, y0, r: 6 * s, H, h0, under: h0 < H - BEAT.under, prev: null };
          m.drops++;
          m.slam = 0.45;
          dodgeStart(en, e);
          G.fx.emit(new THREE.Vector3(e.pos.x, y0 + 2, e.pos.z), 40, { colors: NEON, speed: 40, life: 1, size: 5, up: 6 });
          G.audio.tone(55, 0.5, { type: 'sine', vol: 0.14, slide: -25 }); // the drop
        }
      }
      const R = m.ring;
      if (!R) return;
      R.r += BEAT.ringSpeed * dt;
      // The wall rides the ground, so the plane's height counts from the ground under it.
      const d = Math.hypot(p.pos.x - R.x, p.pos.z - R.z), side = d - R.r, h = p.pos.y - MOVES.beat.floor(en, p.pos.x, p.pos.z, R.y0);
      if (R.prev != null && Math.sign(side) !== Math.sign(R.prev) && !p.dead && !p.landed) {
        // The wall swept past the plane this frame: under its top is a hit, just over it a dodge.
        if (h < R.H && h > -20) {
          if (!(p.invuln > 0) && !p.dodging) {
            m.hits++;
            p.damage(BEAT.dmg);
            p.speed = Math.max(p.baseSpeed * 0.5, p.speed - BEAT.slow);
            if (!(en.beatNews > G.time)) { en.beatNews = G.time + 6; G.ui.notify('Bass Drop! You got rattled.', 'bad', 2); }
            G.audio.tone(70, 0.3, { type: 'square', vol: 0.06, slide: -30 });
          }
          if (p.dodging) dodgeEnd(en, e); // rolled through it: a dodge too
          m.dodge = null;
        } else if (R.under && h >= R.H && h < R.H + BEAT.over) { m.passes++; dodgeEnd(en, e); }
        R.prev = null; // one sweep per wave
        R.past = true;
      } else if (!R.past) R.prev = side;
      if (R.r > BEAT.ringMax) { m.ring = null; m.dodge = null; }
    },
    // Every frame (animate): his facing and lean, his gait, arms, the crouch and slam, the speakers pumping to the beat,
    // the reels, the equalizer, the antenna light, the jets while he skates, his shadow, and the Bass Drop wall.
    pose(en, e, dt) {
      if (e.dead) return MOVES.beat.hide(e);
      const u = e.mesh.userData, m = e.mv, ease = (r) => 1 - Math.exp(-dt * r), t = e.t;
      if (!m) return;
      e.mesh.rotation.order = 'YXZ';
      e.mesh.rotation.set(m.pitch, e.yaw ?? 0, 0);
      const tell = m.tell > 0, k = tell ? 1 - m.tell / m.tell0 : 0, slam = m.slam > 0;
      const stride = Math.min(1, m.moving / BEAT.walk), ph = m.gait * TAU, skate = m.phase !== 'trail' && m.moving > BEAT.walkRage;
      // The crouch: down on his knees' bend before the stomp; a little bob as he walks.
      const crouch = tell ? 0.5 + 0.5 * k : slam ? 0.6 : 0;
      u.rig.position.y += (-crouch * 0.6 + Math.abs(Math.sin(ph)) * 0.18 * stride - u.rig.position.y) * ease(10);
      u.mechLegs.forEach((h) => {
        const a = Math.sin(ph + h.userData.ph) * 0.55 * stride * (skate ? 0.4 : 1);
        h.rotation.x += (-a - crouch * 0.7 - h.rotation.x) * ease(12);
        h.userData.knee.rotation.x += (Math.max(0, Math.sin(ph + h.userData.ph + 0.6)) * 0.8 * stride + crouch * 1.3 - h.userData.knee.rotation.x) * ease(12);
      });
      // Arms swing with the walk, go up in the crouch and come down hard on the stomp.
      u.arms.forEach((a) => {
        const sx = a.userData.sx, up = tell ? -2.6 * Math.min(1, k * 2) : slam ? 0.4 : Math.sin(ph + (sx > 0 ? Math.PI : 0)) * 0.45 * stride;
        a.rotation.x += (up - a.rotation.x) * ease(tell ? 6 : 10);
        a.rotation.z += ((tell ? -0.5 * sx : 0.12 * sx) - a.rotation.z) * ease(6);
        a.userData.el.rotation.x += ((tell ? -0.6 : -0.35 - 0.2 * stride) - a.userData.el.rotation.x) * ease(8);
      });
      // The speakers pump to a 120 bpm beat (and swell in the crouch), the reels turn, the equalizer bounces.
      const beat = Math.pow(Math.max(0, Math.sin(t * TAU * 2)), 4), kick = (m.kick = Math.max(0, (m.kick || 0) - dt));
      u.cones.forEach((c2) => { const z = tell ? 1 + 0.6 * k : 1 + 0.35 * beat + kick * 1.5; c2.scale.set(1, 1, z); c2.position.z = (z - 1) * 0.25; });
      u.reels.forEach((r, j) => { r.rotation.z -= dt * (skate ? 14 : 4) * (j ? 1.2 : 1); });
      u.eq.forEach((b, j) => { b.scale.y = tell ? 0.3 + 1.7 * k : 0.25 + 0.75 * Math.abs(Math.sin(t * (5 + j * 1.7) + j)) * (0.6 + 0.4 * beat); });
      u.tip.visible = Math.sin(t * TAU * 1.5) > 0 || tell;
      u.eyes.scale.setScalar(1 + (tell ? 0.15 * k : 0));
      u.jets.forEach((j) => { j.material.opacity += ((skate ? 0.75 + 0.2 * Math.sin(t * 40) : 0) - j.material.opacity) * ease(10); });
      if (skate && Math.random() < 0.5) en.G.fx.trail(_c.set(e.pos.x, e.pos.y - MECH_FEET * e.mesh.scale.x + 1, e.pos.z), NEON[(Math.random() * 2) | 0]);
      shade(en, e, 16);
      // The Bass Drop wall.
      const R = m.ring, fx = R ? MOVES.beat.wallMesh(en, e) : u.wallFx;
      if (!fx) return;
      fx.group.visible = !!R;
      if (!R) return;
      // Each column of the ring sits on the ground under it: the wall from 5 m below to H over it, the band at its top.
      const fade = 1 - R.r / BEAT.ringMax, wp = fx.wall.geometry.attributes.position, tp = fx.top.geometry.attributes.position;
      for (let i = 0; i <= WALL_N; i++) {
        const a = (i / WALL_N) * TAU, x = R.x + Math.sin(a) * R.r, z = R.z + Math.cos(a) * R.r, g = MOVES.beat.floor(en, x, z, R.y0);
        wp.setXYZ(2 * i, x, g - 5, z); wp.setXYZ(2 * i + 1, x, g + R.H, z);
        tp.setXYZ(2 * i, x, g + R.H - 0.8, z); tp.setXYZ(2 * i + 1, x, g + R.H + 0.8, z);
      }
      wp.needsUpdate = tp.needsUpdate = true;
      fx.wallMat.opacity = 0.32 * (0.4 + 0.6 * fade);
      fx.topMat.opacity = 0.9 * (0.4 + 0.6 * fade);
      fx.topMat.color.lerpColors(_neonA, _neonB, 0.5 + 0.5 * Math.sin(t * TAU * 0.5)); // a slow pink-cyan fade, no flashing
    },
    wallMesh(en, e) {
      const u = e.mesh.userData;
      if (u.wallFx) return u.wallFx;
      // Two strips of WALL_N + 1 columns (bottom and top vertex each), moved onto the ground every frame by pose.
      const strip = () => {
        const geo = new THREE.BufferGeometry(), idx = [];
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((WALL_N + 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
        for (let i = 0; i < WALL_N; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        geo.setIndex(idx);
        return geo;
      };
      const group = new THREE.Group();
      const wallMat = new THREE.MeshBasicMaterial({ color: '#ff3ad0', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const topMat = new THREE.MeshBasicMaterial({ color: '#3af0ff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const wall = new THREE.Mesh(strip(), wallMat), top = new THREE.Mesh(strip(), topMat);
      for (const x of [wall, top]) { x.frustumCulled = false; group.add(x); }
      en.G.scene.add(group);
      return (u.wallFx = { group, wall, top, wallMat, topMat });
    },
    hide(e) { const f = e.mesh.userData.wallFx; if (f) f.group.visible = false; },
  },

  // Baron Barnacle: scuttles the seabed (strideCycle, side-on while he trails), bubble volleys, and the Geyser Row.
  geyser: {
    spawn(en, e) {
      e.mv = MOVES.geyser.fresh();
      e.pos.y = MOVES.geyser.ground(en, e, e.pos.x, e.pos.z);
      e.yaw = Math.atan2(en.G.player.pos.x - e.pos.x, en.G.player.pos.z - e.pos.z);
    },
    fresh: () => ({ side: Math.random() < 0.5 ? 1 : -1, moving: 0, gait: 0, pitch: 0, tell: 0, tell0: 1, slam: 0, rows: 0, hits: 0, passes: 0, volleys: 0, walked: 0, phase: 'trail', clock: GEYSER.opener, dashes: 0, head: null, row: null, due: false }),
    // His body's height standing at (x, z): the seabed (or the ground), plus his legs.
    ground: (en, e, x, z) => Math.max(en.G.terrain.surfaceHeight(x, z, e.pos.y), waterLine()) + HERMIT_FEET * e.mesh.scale.x,
    floor: (en, x, z, y0) => { const g = en.G.terrain.surfaceHeight(x, z); return Number.isFinite(g) ? g : y0; },
    // A column's top: the sea surface underwater, else `tall` m over the ground.
    top: (en, g) => (en.G.world.underwater ? en.G.world.seaLevel : g + GEYSER.tall),
    step(en, e, c) {
      const dt = c.dt, m = (e.mv ||= MOVES.geyser.fresh());
      e.vel.set(0, 0, 0);
      MOVES.geyser.row(en, e, c);
      if (m.slam > 0) m.slam -= dt;
      strideCycle(en, e, c, GEYSER, MOVES.geyser.ground, 'He scuttles ahead of you and turns round: now his eyes on stalks are in your sights!');
      return true;
    },
    hold: (e) => e.mv?.tell > 0,
    attack(en, e, n) {
      const m = e.mv, G = en.G, p = G.player;
      if (!m || m.tell > 0) return;
      const from = MOVES.geyser.mouth(e, new THREE.Vector3()), dist = from.distanceTo(p.pos);
      // A Geyser Row only comes from in front of you, where you can see him drum (not mid-dash): a due one waits.
      const due = n % (e.enraged ? 2 : 3) === 0 || m.due;
      const fx = p.forward.x, fz = p.forward.z, fl = Math.hypot(fx, fz) || 1, tx = e.pos.x - p.pos.x, tz = e.pos.z - p.pos.z;
      const front = (fx * tx + fz * tz) / (fl * (Math.hypot(tx, tz) || 1)) > 0.3;
      if (due && (m.phase === 'dash' || !front)) m.due = true;
      else if (due && !m.row && dist < GEYSER.ringMax && !p.landed && !p.dead) {
        m.due = false;
        m.tell = m.tell0 = !e.rowTip ? GEYSER.first : e.enraged ? GEYSER.tellRage : GEYSER.tell;
        if (!e.rowTip) { e.rowTip = true; G.ui.notify('Geyser Row! When he drums the seabed, bubble geysers erupt across your path where the sand puffs. Fly through a gap!', 'warn', 4, 1); }
        MOVES.geyser.place(en, e, true);
        return;
      }
      const aim = _b.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / GEYSER.bubbleSpeed) * 0.6);
      for (let j = 0; j < GEYSER.bubbles; j++) {
        const d = _c.copy(aim).sub(from).normalize().add(_a.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(GEYSER.spread));
        en.fireOrb(from, d, GEYSER.bubbleSpeed, GEYSER.bubbleDmg, GEYSER.colors[j % 2], 1.2).src = e;
      }
      m.volleys++;
      m.snap = 0.35;
      G.audio.tone(520, 0.12, { type: 'sine', vol: 0.05, slide: 380 }); // a bubbly bloop
    },
    // Between the claws that are left (his mouth once both are off).
    mouth(e, out) {
      const u = e.mesh.userData, left = u.claws.filter((cl) => cl.userData.wr.visible);
      if (left.length) { const at = left[(e.mv?.volleys || 0) % left.length].userData.pinch; at.updateWorldMatrix(true, false); return at.localToWorld(out.set(0, 0, 1)); }
      u.rig.updateWorldMatrix(true, false);
      return u.rig.localToWorld(out.set(0, 0.1, 3.1));
    },
    // Where the row lands (first: pick its gaps): across your way, lead s of flight past where you'll be at the eruption.
    place(en, e, first) {
      const m = e.mv, p = en.G.player, f = flatFwd(p, _a), s = e.mesh.scale.x;
      const ahead = p.speed * (Math.max(0, m.tell) + GEYSER.rise + GEYSER.lead);
      const R = (m.row ||= { x: 0, z: 0, fx: 0, fz: 1, cols: [], t: -1, hit: false, prev: null, y0: e.pos.y - HERMIT_FEET * s });
      R.x = p.pos.x + f.x * ahead; R.z = p.pos.z + f.z * ahead; R.fx = f.x; R.fz = f.z;
      if (first) {
        const k = Math.min(2, e.broken?.pincer || 0), N = GEYSER.slots, mid = (N - 1) / 2, open = new Set();
        // One gap a small nudge off your line (`near` m), the rest anywhere but dead ahead, so every row asks for a turn.
        const nearSlots = [];
        for (let i = 0; i < N; i++) { const o = Math.abs(i - mid) * GEYSER.gap; if (o >= GEYSER.near[0] && o <= GEYSER.near[1]) nearSlots.push(i); }
        open.add(nearSlots[(Math.random() * nearSlots.length) | 0]);
        while (open.size < GEYSER.gaps[k]) { const i = (Math.random() * N) | 0; if (i !== mid) open.add(i); }
        R.cols = [];
        for (let i = 0; i < N; i++) if (!open.has(i)) R.cols.push({ o: (i - mid) * GEYSER.gap, x: 0, z: 0, g: 0 });
        R.open = [...open].sort((a, b) => a - b).map((i) => (i - mid) * GEYSER.gap);
      }
      for (const C of R.cols) { C.x = R.x - R.fz * C.o; C.z = R.z + R.fx * C.o; C.g = MOVES.geyser.floor(en, C.x, C.z, R.y0); }
    },
    // The drum counts down (the row follows you until lock s before it erupts); then the row erupts, holds and fizzes out.
    row(en, e, c) {
      const m = e.mv, G = en.G, p = c.p, dt = c.dt, R = m.row;
      if (m.tell > 0) {
        m.tell -= dt;
        if (m.tell > GEYSER.lock) MOVES.geyser.place(en, e, false);
        // sand puffs on each column's spot (dark sand, so they read in the murk)
        if (R && Math.random() < dt * 14) {
          const C = R.cols[(Math.random() * R.cols.length) | 0];
          if (C) G.fx.emit(_c.set(C.x, C.g + 1.5, C.z), 6, { colors: ['#6a5034', '#8a6a44', '#c8b890'], speed: 10, life: 0.9, size: 3.5, up: 6 });
        }
        if (m.drumT === undefined || G.time > m.drumT) { m.drumT = G.time + 0.22; G.audio.tone(90, 0.1, { type: 'sine', vol: 0.1, slide: -30 }); } // the drumbeat
        if (m.tell <= 0 && R) {
          R.t = 0;
          m.rows++;
          m.slam = 0.4;
          dodgeStart(en, e);
          G.audio.tone(140, 0.8, { type: 'sawtooth', vol: 0.05, slide: 260 }); // the roar
        }
      }
      if (!R || R.t < 0) return;
      R.t += dt;
      const up = Math.min(1, R.t / GEYSER.rise), live = R.t < GEYSER.rise + GEYSER.last;
      if (R.t > GEYSER.rise + GEYSER.last + GEYSER.fade) { m.row = null; m.dodge = null; return; }
      // Bubbles boiling up each column (capped: a few per frame).
      if (R.t < GEYSER.rise + GEYSER.last && Math.random() < 0.7) {
        const C = R.cols[(Math.random() * R.cols.length) | 0];
        if (C) G.fx.emit(_c.set(C.x + rand(-3, 3), C.g + rand(2, 40), C.z + rand(-3, 3)), 2, { colors: ['#ffffff', '#cff6ff'], speed: 4, life: 1.2, size: 2.2, up: 24 });
      }
      if (!live || up < 0.5 || p.dead || p.landed) return;
      // Inside a column (under its top, which has risen up%): a hit, once per row.
      if (!R.hit) for (const C of R.cols) {
        const top = C.g + (MOVES.geyser.top(en, C.g) - C.g) * up;
        if (Math.hypot(p.pos.x - C.x, p.pos.z - C.z) < GEYSER.r && p.pos.y > C.g - 2 && p.pos.y < top + 2) {
          R.hit = true;
          if (p.dodging) { dodgeEnd(en, e); break; } // rolled through it: a dodge
          if (!(p.invuln > 0)) {
            m.hits++;
            p.damage(GEYSER.dmg);
            p.speed = Math.max(p.baseSpeed * 0.5, p.speed - GEYSER.slow);
            p.gust.y += GEYSER.shove;
            if (!(en.geyserNews > G.time)) { en.geyserNews = G.time + 6; G.ui.notify('Geyser! You got bubbled.', 'bad', 2); }
            G.audio.tone(200, 0.3, { type: 'square', vol: 0.05, slide: 300 });
          }
          m.dodge = null;
          break;
        }
      }
      // Crossing the row's line within its width, untouched: a dodge.
      const along = (p.pos.x - R.x) * R.fx + (p.pos.z - R.z) * R.fz, across = -(p.pos.x - R.x) * R.fz + (p.pos.z - R.z) * R.fx;
      if (R.prev != null && Math.sign(along) !== Math.sign(R.prev) && Math.abs(across) < GEYSER.width / 2 && !R.hit && !R.past) { R.past = true; m.passes++; dodgeEnd(en, e); }
      R.prev = along;
    },
    // Every frame (animate): his facing and lean, the scuttle, claws (snap, raised to drum), eyestalks on you, the
    // anemone and sea fan swaying, his shadow, and the Geyser Row's columns and spot marks.
    pose(en, e, dt) {
      if (e.dead) return MOVES.geyser.hide(e);
      const u = e.mesh.userData, m = e.mv, ease = (r) => 1 - Math.exp(-dt * r), t = e.t, G = en.G, p = G.player;
      if (!m) return;
      e.mesh.rotation.order = 'YXZ';
      e.mesh.rotation.set(m.pitch, e.yaw ?? 0, 0);
      const tell = m.tell > 0, k = tell ? 1 - m.tell / m.tell0 : 0, slam = m.slam > 0;
      const stride = Math.min(1, m.moving / GEYSER.walk), ph = m.gait * Math.PI * 2;
      // A low bob as he scuttles; down on the drum.
      const drum = tell ? Math.pow(Math.abs(Math.sin(t * Math.PI * 4.5)), 2) : 0;
      u.rig.position.y += ((slam ? -0.5 : -drum * 0.25) + Math.abs(Math.sin(ph * 2)) * 0.12 * stride - u.rig.position.y) * ease(12);
      // The legs ripple in pairs, lifting and swinging.
      u.crabLegs.forEach((h) => {
        const a = ph + h.userData.ph, lift = Math.max(0, Math.sin(a)) * 0.35 * stride;
        h.rotation.z = h.userData.sx * lift;
        h.userData.knee.rotation.z = -h.userData.sx * lift * 0.6;
        h.rotation.x = Math.cos(a) * 0.25 * stride;
      });
      // Claws: up high and pounding the seabed in the drum, a snap on each volley, a lazy clack otherwise.
      m.snap = Math.max(0, (m.snap || 0) - dt);
      u.claws.forEach((cl, j) => {
        const d = cl.userData, raise = tell ? -1.1 + drum * 1.4 : slam ? 0.5 : -0.15 + Math.sin(t * 1.3 + j) * 0.08;
        cl.rotation.x += (raise - cl.rotation.x) * ease(tell ? 18 : 6);
        cl.rotation.y += ((tell ? -0.3 : 0.15) * d.sx - cl.rotation.y) * ease(6);
        const open = m.snap > 0 ? 0.6 * (m.snap / 0.35) : tell ? 0.4 : 0.12 + 0.12 * Math.max(0, Math.sin(t * 2.2 + j * 2));
        d.pinch.rotation.x += (-open - d.pinch.rotation.x) * ease(20);
      });
      // Eyestalks turn to watch you (antennae sweep).
      _c.copy(p.pos); e.mesh.worldToLocal(_c);
      const yawTo = Math.atan2(_c.x, _c.z);
      u.stalks.forEach((st, j) => {
        if (st.userData.antenna) { st.rotation.y = Math.sin(t * 1.7 + j) * 0.25; st.rotation.x = Math.sin(t * 1.1 + j) * 0.15; return; }
        st.rotation.y += (THREE.MathUtils.clamp(yawTo, -0.7, 0.7) - st.rotation.y) * ease(5);
        st.rotation.x = 0.15 + Math.sin(t * 2 + j) * 0.05 - (tell ? 0.2 * k : 0);
      });
      u.mouth.forEach((mp, j) => { mp.rotation.x = Math.sin(t * 6 + j * Math.PI) * 0.25; });
      // The garden sways with the current.
      u.tentacles.forEach((tg) => { tg.rotation.x = Math.sin(tg.userData.a) * 0.5 + Math.sin(t * 2 + tg.userData.a) * 0.25; tg.rotation.z = -Math.cos(tg.userData.a) * 0.5 + Math.cos(t * 1.7 + tg.userData.a) * 0.25; });
      u.fan.rotation.z = 0.25 + Math.sin(t * 0.9) * 0.12;
      if (Math.random() < dt * 1.5) G.fx.emit(MOVES.geyser.mouth(e, _c), 2, { colors: ['#ffffff', '#cff6ff'], speed: 2, life: 1.4, size: 1.2, up: 8 }); // a few bubbles
      shade(en, e, 18);
      // The Geyser Row: spot marks while he drums, then the columns.
      const R = m.row, fx = R ? MOVES.geyser.rowMesh(en, e) : u.rowFx;
      if (!fx) return;
      fx.group.visible = !!R;
      if (!R) return;
      const up = R.t < 0 ? 0 : Math.min(1, R.t / GEYSER.rise), end = GEYSER.rise + GEYSER.last;
      const fade = R.t < end ? 1 : Math.max(0, 1 - (R.t - end) / GEYSER.fade);
      const n = R.cols.length;
      fx.core.count = fx.foam.count = fx.mark.count = n;
      R.cols.forEach((C, i) => {
        const top = MOVES.geyser.top(en, C.g), h = Math.max(0.1, (top - C.g) * up), wob = 1 + 0.08 * Math.sin(t * 12 + i);
        _m.compose(_c.set(C.x, C.g + h / 2, C.z), _q0, _s.set(GEYSER.r * 0.55 * wob, h, GEYSER.r * 0.55 * wob)); fx.core.setMatrixAt(i, _m);
        _m.compose(_c.set(C.x, C.g + h / 2, C.z), _q0, _s.set(GEYSER.r * wob, h, GEYSER.r * wob)); fx.foam.setMatrixAt(i, _m);
        _m.compose(_c.set(C.x, C.g + 0.4, C.z), _qFlat, _s.set(GEYSER.r * 1.5, GEYSER.r * 1.5, 1)); fx.mark.setMatrixAt(i, _m);
      });
      fx.core.instanceMatrix.needsUpdate = fx.foam.instanceMatrix.needsUpdate = fx.mark.instanceMatrix.needsUpdate = true;
      fx.core.visible = fx.foam.visible = R.t >= 0;
      fx.coreMat.opacity = 0.75 * fade; fx.foamMat.opacity = 0.3 * fade;
      fx.markMat.opacity = R.t < 0 ? 0.5 + 0.35 * Math.abs(Math.sin(t * 6)) : 0.5 * fade;
    },
    rowMesh(en, e) {
      const u = e.mesh.userData;
      if (u.rowFx) return u.rowFx;
      const N = GEYSER.slots, group = new THREE.Group();
      const coreMat = new THREE.MeshBasicMaterial({ color: '#f4feff', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
      const foamMat = new THREE.MeshBasicMaterial({ color: '#7ad8ff', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const markMat = new THREE.MeshBasicMaterial({ color: '#d8f6ff', transparent: true, opacity: 0.5, depthWrite: false }); // pale foam rings, easy to read through the reef's teal fog
      const core = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), coreMat, N);
      const foam = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.2, 1, 14, 1, true), foamMat, N);
      const mark = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), markMat, N);
      for (const x of [core, foam, mark]) { x.frustumCulled = false; x.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(x); }
      en.G.scene.add(group);
      return (u.rowFx = { group, core, foam, mark, coreMat, foamMat, markMat });
    },
    hide(e) { const f = e.mesh.userData.rowFx; if (f) f.group.visible = false; },
  },

  // Admiral Inkworth (lead): drifts in to 110 m, squeezes, then jets back to 280 m behind an ink cloud.
  jets: {
    step(en, e, c) {
      const m = e.mv ||= { L: e.def.lead, phase: 'drift', t: 0 };
      m.t += c.dt;
      m.near = 80;
      m.gain = 1.6; m.speedK = 1; m.bodyS = [1, 1, 1];
      if (m.phase === 'drift') {
        m.L = Math.max(110, m.L - 28 * c.dt);
        if (m.L <= 110 && special(e)) { m.phase = 'squeeze'; m.t = 0; en.G.audio.tone(200, 0.5, { type: 'sine', vol: 0.05, slide: -80 }); }
      } else if (m.phase === 'squeeze') {
        m.bodyS = [1.15, 0.75, 1.15];
        if (m.t > 0.6) {
          m.phase = 'jet'; m.t = 0; m.L = 280;
          en.hazards.cloud(e.pos, 40, '#1a0a2a', 4, e);
          en.G.audio.whoosh();
        }
      } else if (m.phase === 'jet') {
        m.gain = 5; m.speedK = 1.8; m.bodyS = [0.9, 1.15, 0.9];
        if (m.t > 2.5) { m.phase = 'drift'; m.t = 0; }
      }
      m.lead = m.L;
      return false;
    },
  },

  // Captain Clawdia (lead): snaps between 3 lanes (-90 / 0 / +90 m) every 2 s, with a click before each hop. Enraged,
  // her pincer shots come as a double from 120 m.
  lanes: {
    step(en, e, c) {
      const m = e.mv ||= { lane: 0, t: 0, closeT: 0, pincer2: 0 };
      m.t += c.dt;
      if (!m.clicked && m.t > 1.6) { m.clicked = true; en.G.audio.tone(1800, 0.05, { type: 'square', vol: 0.05 }); en.G.audio.tone(1500, 0.05, { type: 'square', vol: 0.05, delay: 0.08 }); }
      if (m.t > 2 && special(e)) {
        m.t = 0; m.clicked = false;
        m.lane = pick([-1, 0, 1].filter((l) => l !== m.lane));
        m.hopT = 0.6;
      }
      m.hopT = Math.max(0, (m.hopT || 0) - c.dt);
      m.blur = m.hopT > 0;
      m.side = m.lane * 90;
      m.gain = m.hopT > 0 ? 5 : 1.6;
      m.speedK = m.hopT > 0 ? 1.6 : 1;
      m.closeT = Math.max(0, m.closeT - c.dt);
      m.lead = m.closeT > 0 ? 120 : null;
      m.near = m.closeT > 0 ? 40 : null;
      if (m.pincer2 > 0 && (m.pincer2 -= c.dt) <= 0) MOVES.lanes.pincers(en, e);
      return false;
    },
    // Pincer shots: a big orb from each claw still attached, converging on where you'll be. Enraged: a double, up close.
    pincers(en, e, first = false) {
      const G = en.G, p = G.player, claws = e.mesh.userData.parts.filter((x) => x.name === 'claw' && !x.broken);
      if (!claws.length) return false;
      const dist = e.pos.distanceTo(p.pos), at = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 65) * 0.6);
      for (const k of claws) { const from = k.obj.getWorldPosition(new THREE.Vector3()); en.fireOrb(from, at.clone().sub(from), 65, 12, '#ff6a3a', 1.8); }
      e.snap = 0.4;
      G.audio.tone(900, 0.12, { type: 'square', vol: 0.06, slide: -400 });
      if (first && e.enraged && e.mv) { e.mv.closeT = 2.5; e.mv.pincer2 = 0.6; }
      return true;
    },
  },

  // Sir Puffington (lead): puffed up, he drifts back at you (180 → 80 m), a bulletproof ball to dodge round.
  puff: {
    step(en, e) {
      const m = e.mv ||= {};
      m.lead = e.puffT > 0 ? 80 : null;
      m.near = e.puffT > 0 ? 40 : null;
      m.speedK = e.puffT > 0 ? 0.9 : 1;
      return false;
    },
  },
};

// ---------- move helpers ----------

function newRun(en, e, m) {
  m.dir *= -1;
  m.turn = -1;
  m.s = 250 * -m.dir;
  m.armed = false;
  m.drops = 0;
  // Every 3rd run brings a "special offer".
  if (++m.runs % 3 === 0 && special(e)) {
    const p = en.G.player;
    if (en.summon('mine', 2, 6, p.pos.clone().addScaledVector(p.forward, 160))) en.G.ui.notify('Blimp Baron: "Special offer! Two spiky balloons for the price of none!"', 'warn', 3, 0);
  }
}

function nova(en, e) {
  const count = 16;
  for (let k = 0; k < count; k++) {
    const y = 1 - (2 * (k + 0.5)) / count, r = Math.sqrt(1 - y * y), a = k * 2.39996;
    en.fireOrb(e.pos, _a.set(Math.cos(a) * r, y, Math.sin(a) * r), 40, 12, '#c8c8d8', 1);
  }
  en.G.audio.pop();
}

function hop(en, e, m) {
  m.throne = spotNear(en, e, 150, m.side * rand(Math.PI / 6, Math.PI / 3), 40, 1.2);
  m.side *= -1;
  m.holdT = 0;
}

// Highest of a few spots 160 to 220 m ahead: ground or roof if there is some near your height, else a hover point
// (no ground zones, caves, deep valleys).
function perchSpot(en, e) {
  const G = en.G, p = G.player, open = !G.zones.current.noGround;
  let best = null;
  for (let k = 0; k < 5; k++) {
    const v = spotNear(en, e, rand(160, 220), rand(-0.6, 0.6), 0, 0.5);
    const g = G.terrain.surfaceHeight(v.x, v.z), roof = G.terrain.ceilingHeight(v.x, v.z);
    const ground = open && roof > 1e6 && g + e.radius > p.pos.y - 80 && g > waterLine();
    v.y = safeY(G, v.x, v.z, ground ? g + e.radius : p.pos.y + rand(10, 40), e.radius);
    if (!best || v.y > best.y) best = v;
  }
  return best;
}

function beamMesh(en, e) {
  if (e.beam) return;
  e.beam = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: '#7aff5a', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  e.beam.visible = false;
  en.G.scene.add(e.beam);
}
