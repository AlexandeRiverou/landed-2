// Boss signature moves: each boss def names a `move` (see BOSSES in enemies.js); Enemies.bossBehave dispatches to
// MOVES[move].step while the boss is engaged, and falls back to the plain orbit (or lead slot) when it returns false.
// Also here: telegraphed area hazards (Hazards / Enemies.warn), boss bodyguards (guards), the dazed stars and the
// tractor beam. Leash contract (enforced in bossBehave): moves only run engaged, special manoeuvres only start when
// `special(e)`, a breakaway calls endMoves (state, hazards and guards go), and fleeing caps every orbiter's speed.
// Speeds are enemy units (real m/s ÷ c.pace), times enemy-time s, like the rest of the enemy code.
import * as THREE from 'three';
import { rand, pick } from './texts.js';
import { waterLine } from './world.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

// A special manoeuvre (teleport, dive, joust, hop, lane snap, jet) may only start engaged, in front-ish, not on a rematch opener.
export const special = (e) => !e.chase && !e.behind && !e.fresh;

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
// Translucent warning shapes: opacity eases 0.2 → 0.6 with a slow 2 Hz pulse (never a flash), then `onFire` runs.
// Visual-only clouds (`cloud`) fade out instead. Meshes are pooled per shape; materials stay with their mesh.
export class Hazards {
  constructor(G) { this.G = G; this.list = []; this.pool = {}; }

  mesh(shape) {
    const m = (this.pool[shape] ||= []).pop() || new THREE.Mesh(GEO[shape], new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.G.scene.add(m);
    return m;
  }

  warn(pos, r, color, t, onFire, { shape = 'disc', owner = null, h = 1 } = {}) {
    const mesh = this.mesh(shape);
    mesh.material.color.set(color);
    mesh.material.opacity = 0.2;
    mesh.position.copy(pos);
    mesh.scale.set(r, shape === 'column' ? h : r, r);
    const hz = { mesh, shape, pos: mesh.position, r, t: 0, T: t, onFire, owner, born: this.G.time };
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
      if (k < 1) continue;
      this.release(i);
      hz.onFire?.(hz);
    }
  }

  release(i) {
    const hz = this.list[i];
    this.list.splice(i, 1);
    this.G.scene.remove(hz.mesh);
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
  e.mv = null;
}
// The boss is gone (death, relax mode): its hazards, stingers and extras go too; guards pop on their next update.
export function dropBoss(en, e) {
  en.hazards.clear(e);
  clearBlobs(en, e);
  if (e.stars) en.G.scene.remove(e.stars);
  if (e.beam) { en.G.scene.remove(e.beam); e.beam.material.dispose(); }
}
function clearBlobs(en, e) {
  for (let i = en.shots.length - 1; i >= 0; i--) if (en.shots[i].owner === e) { en.G.scene.remove(en.shots[i].mesh); en.shots.splice(i, 1); }
}

// ---------- the moves ----------
// step(en, e, c) with c = { p, toP, dist, dt, pace, fight }: set e.vel, return true (false: plain orbit / lead slot).
// hold(e): true while the boss shouldn't start a regular attack. Extra entry points are called from the attack switch.

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
      m.sink = m.up ? 0 : 0.6 * 6.5 / 4; // 60% of the model's height (animateBoss sinks 4 units per 1)
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
