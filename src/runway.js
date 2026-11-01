// The runway: a landing strip on the ground ahead, flattened for it (terrain.flatten). Touch down on it, then roll
// to a stop (or keep rolling along it for a couple of seconds). Same contract as objectives.js: hooks the persuasion
// system can use.
import * as THREE from 'three';
import { disposeTree } from './models.js';
import { pick, rand } from './texts.js';
import { objective, flatForward, underRoof } from './objectives.js';
import { waterLine, heightAt, craterDepthAt } from './world.js';

const Y = new THREE.Vector3(0, 1, 0);
const W = 24, L = 180;   // strip width and length in metres, before persuasion grows it
const LIFT = 0.3;        // the asphalt sits this far over the flattened ground, the paint a little more
// The ground flattened under it: this much wider and longer on each side (m), blending back to the land over BLEND m.
const PAD_SIDE = 6, PAD_END = 12, BLEND = 40;
// A good spot needs at most this much height range under the strip (m), and this much headroom under a cave roof.
const FLAT = { span: 22, room: 60 };
const NEED = 2, STOP = 12; // seconds on the strip after touchdown, or slower than this (m/s): done

// Strip-local (x across, z along; -z is the landing direction) to world, for a strip at c turned by yaw.
const toWorld = (c, yaw, lx, lz, out) => out.set(c.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), 0, c.z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
const _w = new THREE.Vector3();

// How well a strip fits at centre c, heading `dir` (the way you land): { c, yaw, ok, score }, c.y being the height
// to flatten to (the average, kept above the sea). Lower score is flatter. Water or a tunnel under it, a low cave
// roof or a height range over FLAT.span make it a bad fit.
function survey(G, c, dir, scale = 1) {
  const yaw = Math.atan2(-dir.x, -dir.z), off = (W * scale) / 2 + PAD_SIDE, l = L * scale;
  let lo = Infinity, hi = -Infinity, sum = 0, n = 0, dry = 0, bored = false;
  for (let z = -l / 2; z <= l / 2 + 0.1; z += 10) {
    for (const x of [-off, 0, off]) {
      toWorld(c, yaw, x, z, _w);
      const h = heightAt(_w.x, _w.z);
      lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
      if (h > waterLine() + 1) dry++;
      bored ||= !!G.terrain.overhang(_w.x, _w.z); // flattening over a tunnel would cut its roof open
    }
  }
  const y = sum / n;
  const wet = dry < n || G.world.underwater, cramped = G.terrain.ceilingHeight(c.x, c.z) - y < FLAT.room;
  const ok = !wet && !cramped && !bored && hi - lo <= FLAT.span;
  // Bad fits rank behind every good one; the driest of them first (a spit of land beats open sea).
  return { c: new THREE.Vector3(c.x, Math.max(y, waterLine() + 2), c.z), yaw, ok, score: hi - lo + (ok ? 0 : 1000 + (1 - dry / n) * 500) };
}

// The flattest of a few spots dMin..dMax ahead along dir (within `spread` radians), the strip pointing roughly the
// same way so it's easy to line up with. With nothing good ahead (open sea, say), anywhere around within `wide` m.
// If none is good it's the least bad: flattening still makes it a runway (out at sea, on a brand-new island).
// Exported for the smoke test.
export function findStrip(G, from, dir, { dMin = 520, dMax = 820, spread = 0.8, tries = 60, scale = 1, wide = 1100 } = {}) {
  let best = null;
  const tryAt = (head, d, along) => {
    const s = survey(G, new THREE.Vector3(from.x + head.x * d, 0, from.z + head.z * d), along.clone().applyAxisAngle(Y, rand(-0.35, 0.35)), scale);
    if (!best || s.score < best.score) best = s;
  };
  for (let k = 0; k < tries; k++) tryAt(dir.clone().applyAxisAngle(Y, rand(-spread, spread)), rand(dMin, dMax), dir);
  for (let k = 0; k < tries && !best.ok && wide > dMax; k++) {
    const head = dir.clone().applyAxisAngle(Y, rand(-Math.PI, Math.PI));
    tryAt(head, rand(Math.max(dMin, 350), wide), head); // pointing away from you: fly out to it and you're lined up
  }
  return best;
}

const lam = (color) => new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

// The strip: draped asphalt, paint (centre dashes, edge lines, threshold "piano keys", aiming marks) and lights
// (edges, green threshold, red far end, and a row of approach lights that flash toward the runway).
// Paint and lights keep their strip-local spot (metres, at scale 1) in userData; layout() places them.
function makeRunway() {
  const g = new THREE.Group();
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), lam('#3c3c46'));
  g.add(asphalt);
  const box = new THREE.BoxGeometry(1, 0.1, 1), white = lam('#f4f2ea');
  const paint = [];
  const stripe = (x, z, w, l) => { const m = new THREE.Mesh(box, white); m.userData.paint = { x, z, w, l }; g.add(m); paint.push(m); };
  for (let z = -L / 2 + 22; z < L / 2 - 30; z += 16) stripe(0, z, 1, 8);
  for (let z = -L / 2 + 5; z < L / 2; z += 10) for (const s of [-1, 1]) stripe(s * (W / 2 - 1), z, 0.5, 10);
  for (const end of [-1, 1]) for (const x of [2.6, 4.8, 7, 9.2]) for (const s of [-1, 1]) stripe(s * x, end * (L / 2 - 9), 1.4, 12);
  for (const s of [-1, 1]) stripe(s * 5, L / 2 - 45, 3, 20);
  const bulb = new THREE.SphereGeometry(0.6, 8, 6), halo = new THREE.SphereGeometry(1.6, 8, 6), pole = new THREE.CylinderGeometry(0.15, 0.15, 1, 5);
  const lights = [], approach = [];
  const light = (x, z, color, h = 0.6) => {
    const m = new THREE.Mesh(bulb, new THREE.MeshBasicMaterial({ color }));
    m.add(new THREE.Mesh(halo, glow(color, 0.25)));
    m.userData.light = { x, z, h };
    if (h > 1) { const p = new THREE.Mesh(pole, lam('#6a6a70')); p.scale.y = h; p.position.y = -h / 2; m.add(p); }
    g.add(m);
    lights.push(m);
    return m;
  };
  for (let z = -L / 2; z <= L / 2 + 0.1; z += 30) for (const s of [-1, 1]) light(s * (W / 2 + 1.5), z, '#fff1b0');
  for (let x = -W / 2 + 2; x <= W / 2 - 2 + 0.1; x += 4) { light(x, L / 2 + 1.5, '#5aff7a'); light(x, -L / 2 - 1.5, '#ff4a3a'); }
  for (let k = 1; k <= 6; k++) approach.push(light(0, L / 2 + k * 15, '#ffffff', 2.5));
  g.userData = { asphalt, paint, lights, approach };
  return g;
}

export function mkLanding(G) {
  const p = G.player;
  const strip = { ...findStrip(G, p.pos, flatForward(G)), scale: 1 };
  const g = makeRunway();
  G.scene.add(g);
  const { asphalt, paint, lights, approach } = g.userData;
  let margin = 3, need = NEED, nearCounts = false, touched = false, onFor = 0;
  let pad = null;
  // Put the strip at strip.c / strip.yaw / strip.scale: flatten the ground there (the old spot goes back to normal)
  // and stand everything on it. Approach lights out past the end stand on the land there.
  const layout = () => {
    const { c, yaw, scale: s } = strip;
    if (pad !== null) G.terrain.unflatten(pad);
    pad = G.terrain.flatten(c.x, c.z, yaw, (W * s) / 2 + PAD_SIDE, (L * s) / 2 + PAD_END, c.y, BLEND);
    c.y = heightAt(c.x, c.z) + craterDepthAt(c.x, c.z); // what the flattened ground really is (Blockland rounds it to its block steps)
    g.position.copy(c);
    g.rotation.y = yaw;
    asphalt.position.y = LIFT;
    asphalt.scale.set(W * s, 1, L * s);
    for (const m of paint) { const { x, z, w, l } = m.userData.paint; m.position.set(x * s, LIFT + 0.06, z * s); m.scale.set(w * s, 1, l * s); }
    for (const m of lights) {
      const { x, z, h } = m.userData.light;
      toWorld(c, yaw, x * s, z * s, _w);
      m.position.set(x * s, heightAt(_w.x, _w.z) - c.y + h, z * s);
    }
  };
  layout();
  // Strip-local coordinates (metres) of a world point; on the strip within `margin` metres of its edges?
  const local = (x, z) => { const dx = x - strip.c.x, dz = z - strip.c.z, cy = Math.cos(strip.yaw), sy = Math.sin(strip.yaw); return [dx * cy - dz * sy, dx * sy + dz * cy]; };
  const onStrip = (x, z) => { const [lx, lz] = local(x, z); return Math.abs(lx) < (W * strip.scale) / 2 + margin && Math.abs(lz) < (L * strip.scale) / 2 + margin; };
  // Moving it un-flattens the old spot, so never with you on the ground (it could be on that spot).
  const move = (s) => { if (s.ok && !p.landed) { Object.assign(strip, s, { scale: strip.scale }); layout(); } };
  const tgt = new THREE.Vector3();
  return objective({
    type: 'landing', reward: 220, noun: 'the runway', strip,
    title: pick(['Land On The Runway', 'Cleared To Land', 'Wheels Down', 'It\'s In The Name']),
    desc: 'A runway has been built just for you. LAND on it: slow, wings level, gentle sink. Then let it roll to a stop. The game is called Landed. It\'s time.',
    caps: new Set(['grow', 'approach', 'teleport', 'easier']),
    signText: ['RUNWAY', 'THAT WAY →', '(LAND ON IT)'],
    hints: [
      'Line up with the white dashes from far out. Turning on the ground is slow.',
      'Come in slow and level: no boost, wings flat, nose just under the horizon. Ease it down.',
      'Touch down near the green lights, then let it roll. Pitch down to sink, level off right before the ground.',
    ],
    target() { // over the threshold, where you aim to touch down
      toWorld(strip.c, strip.yaw, 0, (L * strip.scale) / 2 - 20, tgt);
      return tgt.setY(underRoof(G, tgt.x, tgt.z, G.terrain.surfaceHeight(tgt.x, tgt.z) + 12, 10));
    },
    onUpdate(dt, G) {
      const k = Math.floor(this.t * 8) % 9; // the approach lights flash in sequence toward the strip
      approach.forEach((m, i) => { m.children[0].material.opacity = k === approach.length - 1 - i ? 0.9 : 0.12; });
      if (p.events.includes('landed')) {
        touched = onStrip(p.lastLanding.x, p.lastLanding.z);
        if (touched) { this.progressed = true; G.ui.notify('On the runway! Now let it roll to a stop.', 'good', 2.5, 1); }
        else if (!nearCounts) G.ui.notify('Lovely landing. Wrong place. The runway is the long stripy thing.', 'warn', 3, 1);
      }
      if (!p.landed) { touched = false; onFor = 0; }
      else if (nearCounts && onStrip(p.pos.x, p.pos.z)) touched = true; // easier: taxiing onto it counts too
      if (!touched) {
        this.progress = p.landed ? '🛬 Taxi or take off: the runway is elsewhere' : `🛬 Land on the runway (${Math.round(p.pos.distanceTo(this.target()))} m)`;
        return null;
      }
      if (onStrip(p.pos.x, p.pos.z)) { onFor += dt; this.progressed = true; } else onFor = 0;
      this.progress = `🛬 Rolling… ${onFor.toFixed(1)} / ${need}s on the strip`;
      if (onFor < need && !(onFor > 0.3 && p.speed <= STOP)) return null;
      G.fx.confetti(p.pos);
      G.audio.success();
      return 'done';
    },
    grow(f) { if (!p.landed) { strip.scale = Math.min(strip.scale * f, 2.2); layout(); } }, // a bigger strip, on more flattened ground
    approach(G, f) { // a flat spot part of the way toward you; it stays put if there isn't one
      const c = strip.c.clone().lerp(p.pos, f);
      const s = findStrip(G, c, flatForward(G), { dMin: 0, dMax: 160, spread: Math.PI, tries: 40, scale: strip.scale, wide: 0 });
      move(s);
    },
    teleport(G) {
      const s = findStrip(G, p.pos, flatForward(G), { dMin: 380, dMax: 560, spread: 0.3, tries: 80, scale: strip.scale, wide: 0 });
      move(s);
    },
    easier() {
      nearCounts = true;
      margin += 10;
      need = 1;
      return 'New rule: landing NEAR the runway counts, as long as you taxi onto it. And one second on it is plenty.';
    },
    // The flattened ground stays (until the next zone): you may well be rolling along it right now.
    dispose(G) { G.scene.remove(g); disposeTree(g); },
  });
}
