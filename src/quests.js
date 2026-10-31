// Quests: objectives with new verbs. Pizza delivery, barrel rolls, a race against Gary, joining up a
// constellation, sneaking past a searchlight, a cake with a fuse, herding balloons, playing a tune on
// floating notes, catching falling stars and a photo safari.
// Same contract as objectives.js: hooks the persuasion system can use on a player who ignores them.
import * as THREE from 'three';
import { makeRing, setRingColor, makeStar, makeBalloon, makePlane, makeLandmark, makeTextSprite, disposeTree } from './models.js';
import { pick, rand, T } from './texts.js';
import { objective, pointAhead, groundAt, clearance, underRoof, inFront, flatForward, faceFlat, anim, moveToward, spinRing, crossRing } from './objectives.js';

const Y = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _o = new THREE.Object3D();

// ---------- shared bits ----------

const glowMat = (color, opacity = 0.3) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const label = (text, scale = 9, fg = '#ffffff') => makeTextSprite([String(text)], scale, { w: 256, h: 256, bg: null, fg, size: 190 });

// Keep a point in the open air: above the ground (and anything on it), below a cave roof.
function lift(G, v, clear = 30, roof = 20) {
  v.y = underRoof(G, v.x, v.z, Math.max(v.y, clearance(G, v.x, v.z, 15) + clear), roof);
  return v;
}

// A point d metres ahead of the player (within `spread` radians of the heading), near their altitude.
function ahead(G, d, spread = 0.5, dy = 25) {
  const f = flatForward(G).applyAxisAngle(Y, rand(-spread, spread)), p = G.player.pos;
  return lift(G, new THREE.Vector3(p.x + f.x * d, p.y + rand(-dy, dy), p.z + f.z * d));
}

// Over a sky-island void the ground is hundreds of metres down: things that would stand on it float instead.
const FAR_DOWN = 220;

// Carried things ride just under the plane.
function carry(o3, p) {
  o3.position.copy(p.pos).addScaledVector(p.up, -3.6);
  o3.quaternion.copy(p.quat);
  o3.visible = !p.dead;
}

// Remove pieces from the scene and free them. Text sprites share three's sprite geometry: only their
// own texture and material go.
function drop(G, ...objs) {
  for (const o of objs) {
    G.scene.remove(o);
    o.traverse((s) => { if (s.isSprite) { s.material.map?.dispose(); s.material.dispose(); s.userData.keep = true; } });
    disposeTree(o);
  }
}

function nearestOf(G, list) {
  let best = null, bd = Infinity;
  for (const m of list) { const d = m.position.distanceToSquared(G.player.pos); if (d < bd) { bd = d; best = m; } }
  return best;
}

// ---------- pizza delivery ----------

function makePizza() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(9, 1.8, 9), lam('#e8d2a8')));
  const logo = mesh(new THREE.CircleGeometry(3, 16), new THREE.MeshBasicMaterial({ color: '#d8433a' }), 0, 0.95, 0);
  logo.rotation.x = -Math.PI / 2;
  g.add(logo, mesh(new THREE.SphereGeometry(9, 10, 8), glowMat('#ffb04a', 0.2)));
  return g;
}

// A landing pad with a light beam (or, with no ground, a floating mailbox). Both have a sign on top.
function makeDropOff(floating, beamH) {
  const g = new THREE.Group();
  if (floating) {
    g.add(mesh(new THREE.BoxGeometry(8, 7, 12), lam('#3d6fd1')), mesh(new THREE.BoxGeometry(0.6, 5, 0.6), lam('#d8433a'), 4.4, 3, 3));
    g.add(mesh(new THREE.BoxGeometry(0.6, 2.4, 3.4), lam('#d8433a'), 4.4, 5.2, 4.4), mesh(new THREE.CylinderGeometry(1, 1, 14, 6), lam('#8a5a3a'), 0, -10, 0));
    g.add(mesh(new THREE.SphereGeometry(16, 12, 8), glowMat('#ffb04a', 0.14)));
  } else {
    g.add(mesh(new THREE.CylinderGeometry(24, 24, 1.2, 28), lam('#f2efe6')), mesh(new THREE.CylinderGeometry(15, 15, 1.4, 24), lam('#ff8a1f')));
    const beam = mesh(new THREE.CylinderGeometry(6, 6, beamH, 12, 1, true), glowMat('#ffb04a', 0.28), 0, beamH / 2, 0);
    beam.material.side = THREE.DoubleSide;
    g.add(beam);
  }
  const sign = makeTextSprite(['PIZZA', 'GOES HERE'], 14, { bg: '#fff6d8' });
  sign.position.y = floating ? 22 : Math.min(beamH, 36);
  g.add(sign);
  return g;
}

export function mkDelivery(G) {
  const pizza = makePizza();
  pizza.position.copy(pointAhead(G, 230, 320, 0.5, 40, 80));
  G.scene.add(pizza);
  // The drop-off: a few hundred metres past the pizza, so the second leg is a real trip.
  _a.subVectors(pizza.position, G.player.pos).setY(0).normalize().applyAxisAngle(Y, rand(-0.8, 0.8));
  const d = rand(380, 480);
  const spot = new THREE.Vector3(pizza.position.x + _a.x * d, pizza.position.y + rand(-30, 30), pizza.position.z + _a.z * d);
  const ground = groundAt(G, spot.x, spot.z);
  const floating = !!G.zones.current.noGround || spot.y - ground > FAR_DOWN;
  const beamH = Math.max(20, Math.min(150, G.terrain.ceilingHeight(spot.x, spot.z) - ground - 8)); // a cave roof caps the beam
  const pad = makeDropOff(floating, beamH);
  const placePad = (v) => { if (floating) pad.position.copy(lift(G, v, 40)); else pad.position.set(v.x, groundAt(G, v.x, v.z) + 0.6, v.z); };
  placePad(spot);
  G.scene.add(pad);
  let carrying = false, warmth = 100, rate = 2.4, scale = 1, warned = false;
  const tgt = new THREE.Vector3();
  return objective({
    type: 'delivery', reward: 210, noun: 'the pizza',
    title: pick(['Pizza Delivery', 'Hot Slice Express', '30 Minutes Or It\'s Free']),
    desc: 'Grab the pizza floating ahead, then fly it to the drop-off. It cools down fast. The customer has pre-written a one-star review, just in case.',
    caps: new Set(['grow', 'approach', 'teleport', 'easier']),
    signText: ['PIZZA', 'THAT WAY →', '(STILL WARM)'],
    hints: ['Fly INTO the pizza box to pick it up.', 'The drop-off has a beacon. Get over the pad and you\'re done.', 'Boost (Shift) keeps the pizza warmer. Not scientifically. It just gets there sooner.'],
    target() {
      if (!carrying) return pizza.position;
      return tgt.set(pad.position.x, underRoof(G, pad.position.x, pad.position.z, pad.position.y + (floating ? 0 : 12), 10), pad.position.z);
    },
    onUpdate(dt, G) {
      const p = G.player;
      anim(pad, dt);
      if (!floating && pad.userData.tpos) pad.userData.tpos.y = groundAt(G, pad.userData.tpos.x, pad.userData.tpos.z) + 0.6;
      if (!carrying) {
        anim(pizza, dt);
        pizza.rotation.y += dt * 1.5;
        pizza.position.y += Math.sin(this.t * 2) * dt * 2;
        this.progress = '🍕 Pick up the pizza';
        if (!p.dead && p.pos.distanceTo(pizza.position) < 11 * scale) {
          carrying = true;
          this.progressed = true;
          this.noun = 'the drop-off';
          pizza.scale.setScalar(0.5);
          pizza.userData.tscale = null;
          pizza.children[2].visible = false; // no glow while it rides along
          G.fx.sparkle(pizza.position, '#ffb04a');
          G.audio.ding(1.1);
          G.ui.notify('Pizza acquired! Deliver it before it goes cold. Follow the beacon.', 'good', 3);
        }
        return null;
      }
      carry(pizza, p);
      if (!p.dead) warmth -= dt * rate;
      if (Math.random() < dt * 8) G.fx.emit(pizza.position, 1, { color: '#ffffff', speed: 2, life: 1, size: 3, up: 6 }); // steam
      this.progress = `🍕 Warmth ${Math.max(0, Math.round(warmth))}% · deliver it!`;
      if (warmth < 30 && !warned) { warned = true; G.ui.notify('The pizza is getting lukewarm. The cheese is losing hope.', 'warn'); }
      if (warmth <= 0) { G.ui.notify('The pizza went cold. The customer is eating cereal instead.', 'bad', 3); return 'fail'; }
      const dx = p.pos.x - pad.position.x, dz = p.pos.z - pad.position.z, dy = p.pos.y - pad.position.y;
      const there = floating ? p.pos.distanceTo(pad.position) < 22 * scale : Math.hypot(dx, dz) < 24 * scale && dy > -5 && dy < 80;
      if (p.dead || !there) return null;
      G.fx.confetti(pad.position);
      G.audio.success();
      G.ui.notify(`Delivered at ${Math.round(warmth)}%! ${warmth > 60 ? 'Piping hot. Five stars.' : 'Lukewarm. Three stars and a sigh.'}`, 'good', 3);
      return 'done';
    },
    grow(f) { scale = Math.min(scale * f, 4); (carrying ? pad : pizza).userData.tscale = Math.min(scale, carrying ? 2.5 : 4); },
    approach(G, f) { moveToward(G, carrying ? pad : pizza, f, carrying && !floating ? 0 : 35); },
    teleport(G) {
      if (!carrying) { pizza.userData.tpos = null; pizza.position.copy(inFront(G, 160)); return; }
      pad.userData.tpos = null;
      placePad(inFront(G, 220));
    },
    easier() { warmth = Math.min(100, warmth + 35); rate *= 0.7; return 'We wrapped the pizza in a tiny blanket. Warmth +35%, and it cools slower now.'; },
    dispose(G) { drop(G, pizza, pad); },
  });
}

// ---------- barrel roll ----------

const ROLL_RATE_MIN = 1.5; // rad/s about the nose: only a real roll is this fast (a normal bank tops out at 2, and only to 52°)

export function mkRoll(G) {
  let need = Math.random() < 0.5 ? 2 : 3, done = 0, acc = 0, idle = 0, req = 1;
  const prevUp = G.player.up.clone();
  return objective({
    type: 'roll', reward: 100 + need * 30, noun: 'the barrel roll', virtual: true,
    title: pick(['Do A Barrel Roll!', 'Rotisserie Practice', 'Spin To Win']),
    desc: `Do ${need} full barrel rolls. Double-tap left or right (A / D or ← / →). A rabbit somewhere is very proud of you.`,
    caps: new Set(['easier']),
    signText: ['DO A', 'BARREL ROLL!', '↻ ↻ ↻'],
    hints: ['Double-tap A or D (or ← / →). On touch, flick the stick sideways twice.', 'Wait for one roll to finish, then do the next one.', 'Holding left only banks you. It takes a double tap to roll all the way.'],
    onUpdate(dt, G) {
      const p = G.player;
      // How far the wings turned about the nose this frame (signed): rolls count, turns and loops don't.
      _a.crossVectors(prevUp, p.up);
      const d = Math.atan2(_a.dot(p.forward), prevUp.dot(p.up));
      prevUp.copy(p.up);
      if (!p.dead && Math.abs(d) > ROLL_RATE_MIN * dt) {
        if (Math.sign(d) !== Math.sign(acc)) acc = 0;
        acc += d;
        idle = 0;
      } else if ((idle += dt) > 0.6) acc = 0;
      if (Math.abs(acc) >= Math.PI * 2 * req) {
        acc = 0;
        done++;
        this.progressed = true;
        G.audio.ding(1 + done * 0.12);
        G.fx.sparkle(p.pos, '#7ad8ff');
        if (done < need) G.ui.notify(pick(['Wheee! Again!', 'One more! The horizon is getting dizzy.', 'Nice roll. Do it again, but with feeling.']), 'good', 2);
      }
      const pct = Math.min(100, Math.round((Math.abs(acc) / (Math.PI * 2 * req)) * 100));
      this.progress = `↻ Rolls ${done}/${need} · current ${pct}%`;
      return done >= need ? 'done' : null;
    },
    easier() {
      req = Math.max(0.5, req - 0.2);
      if (need - done > 1) need--;
      return `New rule: ${need} roll${need > 1 ? 's' : ''}, and a roll only needs ${Math.round(req * 360)}°. Physics looked the other way.`;
    },
  });
}

// ---------- rival race ----------

const TAUNTS = ['Gary: "Too slow!"', 'Gary: "Is that a plane or a parked car?"', 'Gary: "I\'m not even boosting."', 'Gary: "See you at the finish. Eventually."'];

export function mkRace(G) {
  const n = 5 + (Math.random() < 0.5 ? 1 : 0), R = 16;
  const rings = [];
  let at = pointAhead(G, 260, 320, 0.3, 40, 80);
  const dir = new THREE.Vector3().subVectors(at, G.player.pos).setY(0).normalize();
  for (let k = 0; k < n; k++) {
    const r = makeRing(R, k === n - 1 ? '#ffffff' : '#c77dff');
    r.position.copy(at);
    _o.position.copy(at);
    _o.lookAt(k === 0 ? _a.copy(G.player.pos).setY(at.y) : rings[k - 1].position);
    r.quaternion.copy(_o.quaternion);
    G.scene.add(r);
    rings.push(r);
    dir.applyAxisAngle(Y, rand(-0.45, 0.45));
    at = lift(G, at.clone().addScaledVector(dir, rand(150, 180)).setY(at.y + rand(-25, 25)), 35);
  }
  // Gary starts on your wing. He knows the line and never misses a ring; you have boost and shortcuts.
  const rival = new THREE.Group();
  const plane = makePlane();
  plane.setSkin({ body: '#8a3ab0', wing: '#ffd23a', accent: '#1d1d22' });
  plane.group.rotation.y = Math.PI; // the model flies toward -Z; lookAt points +Z
  plane.group.scale.setScalar(1.2);
  rival.add(plane.group);
  const vel = flatForward(G);
  rival.position.copy(G.player.pos).addScaledVector(_a.set(-vel.z, 0, vel.x), 28); // on your right wing
  vel.multiplyScalar(30);
  G.scene.add(rival);
  const want = new THREE.Vector3(), rprev = new THREE.Vector3();
  let idx = 0, ri = 0, speed = 41, scale = 1, lastTaunt = 0;
  const mark = () => rings.forEach((r, k) => { r.visible = k >= idx; if (k < n - 1) setRingColor(r, k === idx ? '#ffc23a' : '#c77dff'); });
  mark();
  return objective({
    type: 'race', reward: 230, noun: 'the next race ring',
    title: pick(['Rival Race: Gary', 'Grand Prix Of Spite', 'Race You To The Last Ring!']),
    desc: `Gary challenged you to a race through ${n} rings. First through the white one wins. He's not shooting today. Just smirking.`,
    caps: new Set(['grow', 'easier']),
    signText: ['RACE', 'NEXT RING →', 'BEAT GARY!'],
    hints: ['Gary is a bit faster than cruising speed. Boost (Shift) on the straights.', 'Cut the corners. Gary flies textbook lines, which are long.'],
    target() { return rings[idx].position; },
    onUpdate(dt, G) {
      for (const r of rings) { spinRing(r, dt, this.t); anim(r, dt); }
      // Gary: eases up to racing speed, slows a touch if he's miles ahead, hurries if you lead.
      const lead = ri - idx;
      const s = speed * Math.min(1, 0.55 + this.t * 0.2) * (lead >= 2 ? 0.85 : lead < 0 ? 1.08 : 1);
      want.subVectors(rings[Math.min(ri, n - 1)].position, rival.position).normalize().multiplyScalar(s);
      vel.lerp(want, 1 - Math.exp(-dt * 2.2));
      rprev.copy(rival.position);
      rival.position.addScaledVector(vel, dt);
      lift(G, rival.position, 12, 12);
      rival.lookAt(_a.copy(rival.position).add(vel));
      plane.prop.rotation.z += dt * 50;
      if (Math.random() < dt * 10) G.fx.trail(rival.position, '#c77dff');
      if (ri < n && (crossRing(rings[ri], rprev, rival.position, R * 2) || rival.position.distanceTo(rings[ri].position) < 10)) {
        ri++;
        if (ri >= n) { G.ui.notify('Gary won. He\'s doing a victory lap. Nobody asked for the victory lap.', 'bad', 3); return 'fail'; }
        if (ri > idx && this.t - lastTaunt > 6) { lastTaunt = this.t; G.ui.notify(pick(TAUNTS), 'warn', 2.5, 0); }
      }
      const r = crossRing(rings[idx], G.player.prevPos, G.player.pos, R * scale);
      if (r === 'hit') {
        G.fx.sparkle(rings[idx].position, '#ffd23a');
        G.audio.ding(1 + idx * 0.12);
        idx++;
        this.progressed = true;
        if (idx >= n) { G.ui.notify('You beat Gary! He says it doesn\'t count. It counts.', 'good', 3); return 'done'; }
        mark();
      } else if (r === 'miss') G.ui.notify(pick(T.nearMiss), 'warn', 2.5, 0);
      this.progress = `🏁 You ${idx}/${n} · Gary ${ri}/${n}${ri > idx ? ' (he\'s ahead!)' : ri < idx ? ' (you lead!)' : ''}`;
      return null;
    },
    grow(f) { scale = Math.min(scale * f, 4); for (const r of rings) r.userData.tscale = scale; },
    easier() { speed *= 0.8; return 'Gary stopped for a sandwich. He is 20% slower now, and 100% as smug.'; },
    dispose(G) { drop(G, rival, ...rings); },
  });
}

// ---------- constellation ----------

// Shapes in the sky: x is sideways, y runs away from you and up (the drawing leans back, so you can see it
// on the way in and still fly it without a vertical climb).
// `close` joins the last star back to that one when you finish.
const SHAPES = [
  { name: 'a heart', title: 'Love Is In The Air (Literally)', close: 0, pts: [[0, 0], [-0.55, 0.42], [-0.78, 0.85], [-0.42, 1.12], [0, 0.85], [0.42, 1.12], [0.78, 0.85], [0.55, 0.42]] },
  { name: 'the Big Dipper', title: 'Big Dipper, Small Plane', close: 3, pts: [[-0.6, 0], [-0.3, 0.22], [-0.05, 0.45], [0.2, 0.68], [0.65, 0.66], [0.72, 1.08], [0.24, 1.1]] },
  { name: 'a lightning bolt', title: 'Ride The Lightning (Bolt)', close: -1, pts: [[0, 0], [0.38, 0.38], [-0.08, 0.55], [0.4, 0.98], [-0.05, 1.12], [0.42, 1.55]] },
  { name: 'a snake', title: 'Ssssskywriting', close: -1, pts: [0, 1, 2, 3, 4, 5, 6].map((k) => [Math.sin(k * 1.15) * 0.42, k * 0.24]) },
];
const STAR_DIM = '#6a7aa8', STAR_NEXT = '#ffe066', STAR_LIT = '#7affff';

export function mkConstellation(G) {
  const S = pick(SHAPES), n = S.pts.length, SIZE = 200, DEPTH = 0.55, RISE = 0.75;
  const origin = pointAhead(G, 250, 300, 0.25, 40, 60);
  const fwd = new THREE.Vector3().subVectors(origin, G.player.pos).setY(0).normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const shape = new THREE.Group(); // stars and lines in local coordinates; moving the group moves the lot
  shape.position.copy(origin);
  const stars = S.pts.map(([x, y], k) => {
    const g = new THREE.Group();
    g.position.copy(origin).addScaledVector(side, x * SIZE).addScaledVector(fwd, y * SIZE * DEPTH);
    g.position.y += y * SIZE * RISE;
    lift(G, g.position, 30, 15);
    g.position.sub(origin);
    const core = mesh(new THREE.OctahedronGeometry(3.2), new THREE.MeshBasicMaterial({ color: STAR_DIM }));
    const glow = mesh(new THREE.SphereGeometry(8, 10, 8), glowMat(STAR_DIM, 0.15));
    const num = label(k + 1, 9);
    num.position.y = 11;
    g.add(core, glow, num);
    g.userData = { core, glow, lit: false };
    shape.add(g);
    return g;
  });
  // Every line of the drawing is there from the start as a faint ghost; connecting two stars lights it up.
  const segGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const ghostMat = glowMat('#8ab0ff', 0.08), litMat = glowMat(STAR_LIT, 0.75);
  const segs = [];
  const link = (a, b) => {
    const m = new THREE.Mesh(segGeo, ghostMat);
    const A = stars[a].position, B = stars[b].position;
    m.position.addVectors(A, B).multiplyScalar(0.5);
    _a.subVectors(B, A);
    m.scale.set(1, _a.length(), 1);
    m.quaternion.setFromUnitVectors(Y, _a.normalize());
    shape.add(m);
    segs.push(m);
  };
  for (let k = 1; k < n; k++) link(k - 1, k);
  if (S.close >= 0) link(n - 1, S.close);
  G.scene.add(shape);
  let idx = 0, scale = 1, finishing = 0, lastOops = -99;
  const tgt = new THREE.Vector3();
  const worldOf = (k, v) => v.addVectors(shape.position, stars[k].position);
  const paint = () => stars.forEach((s, k) => {
    const c = s.userData.lit ? STAR_LIT : k === idx ? STAR_NEXT : STAR_DIM;
    s.userData.core.material.color.set(c);
    s.userData.glow.material.color.set(c);
    s.userData.glow.material.opacity = s.userData.lit ? 0.35 : k === idx ? 0.3 : 0.12;
  });
  paint();
  return objective({
    type: 'constellation', reward: 60 + n * 25, noun: 'the next star',
    title: pick([S.title, 'Join The Dots (Sky Edition)', 'Constellation Prize']),
    desc: `${n} faint stars ahead make ${S.name}. Fly through them in numbered order and draw it across the sky. Skipping ahead is cheating. The stars will know.`,
    caps: new Set(['grow', 'teleport']),
    signText: ['STARS', 'THAT WAY →', '(JOIN THE DOTS)'],
    hints: ['The yellow star is next. Numbers float above each one.', 'Wide turns are fine. The stars are patient. Unlike the hoops.'],
    stars: n,
    starAt(k) { return worldOf(k, new THREE.Vector3()); },
    target() { return worldOf(Math.min(idx, n - 1), tgt); },
    onUpdate(dt, G) {
      for (const s of stars) { anim(s, dt); s.userData.core.rotation.y += dt * 1.5; }
      if (idx < n) { const s = stars[idx]; s.userData.glow.scale.setScalar(1 + Math.sin(this.t * 6) * 0.25); }
      this.progress = `✨ Star ${Math.min(idx + 1, n)} / ${n}: ${S.name}`;
      if (finishing) { finishing -= dt; return finishing <= 0 ? 'done' : null; } // a moment to admire the drawing
      if (G.player.dead) return null;
      const r = 14 * scale;
      for (let k = 0; k < n; k++) {
        if (stars[k].userData.lit || worldOf(k, _b).distanceTo(G.player.pos) > r) continue;
        if (k !== idx) {
          if (this.t - lastOops > 4) { lastOops = this.t; G.ui.notify(pick([`That's star ${k + 1}. You want star ${idx + 1}. Counting is hard.`, 'Wrong star! It is flattered, but no.', 'Out of order. The constellation refuses to be abstract art.']), 'warn', 2.5); }
          continue;
        }
        stars[k].userData.lit = true;
        if (k > 0) segs[k - 1].material = litMat;
        G.fx.sparkle(_b, STAR_LIT);
        G.audio.ding(1 + k * 0.1);
        idx++;
        this.progressed = true;
        if (idx >= n) {
          if (S.close >= 0) segs[n - 1].material = litMat;
          G.ui.notify(`You drew ${S.name}! Astronomers are updating their charts.`, 'good', 3);
          G.audio.success();
          finishing = 1.2;
        }
        paint();
        break;
      }
      return null;
    },
    grow(f) { scale = Math.min(scale * f, 3.5); for (const s of stars) s.userData.tscale = Math.min(scale, 2.5); },
    teleport(G) {
      // The drawing slides over so the next star sits right in front of you (and nothing ends up in a hill).
      const p = inFront(G, 150);
      shape.position.add(p.sub(worldOf(Math.min(idx, n - 1), _b)));
      let up = 0;
      for (let k = 0; k < n; k++) { worldOf(k, _b); up = Math.max(up, clearance(G, _b.x, _b.z, 15) + 25 - _b.y); }
      shape.position.y += up;
    },
    dispose(G) { drop(G, shape); segGeo.dispose(); ghostMat.dispose(); litMat.dispose(); },
  });
}

// ---------- sneak past the searchlight ----------

export function mkSearchlight(G) {
  const R = 18, L = 320, CATCH = 1.5, MAX_CATCHES = 3;
  const hoop = makeRing(R, '#7aff6a');
  hoop.position.copy(pointAhead(G, 480, 600, 0.5, 40, 90));
  faceFlat(hoop, G.player.pos);
  G.scene.add(hoop);
  // The lamp stands off to one side of the hoop and a bit higher, on a tower; with no ground, it's a floating eye.
  _a.subVectors(hoop.position, G.player.pos).setY(0).normalize().applyAxisAngle(Y, (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2);
  const rig = new THREE.Group();
  rig.position.copy(hoop.position).addScaledVector(_a, 70);
  rig.position.y = underRoof(G, rig.position.x, rig.position.z, Math.max(hoop.position.y + 45, clearance(G, rig.position.x, rig.position.z, 10) + 20), 12);
  const floating = !!G.zones.current.noGround || rig.position.y - groundAt(G, rig.position.x, rig.position.z) > FAR_DOWN;
  const head = new THREE.Group();
  if (floating) {
    head.add(mesh(new THREE.SphereGeometry(8, 14, 10), lam('#ffffff')), mesh(new THREE.SphereGeometry(4, 12, 8), lam('#3ab0ff'), 0, 0, 5.6));
    head.add(mesh(new THREE.SphereGeometry(2, 8, 6), new THREE.MeshBasicMaterial({ color: '#111111' }), 0, 0, 8.2));
    head.children[1].scale.z = 0.5;
  } else {
    const housing = mesh(new THREE.CylinderGeometry(4, 5, 8, 10), lam('#2b2b3a'));
    housing.rotation.x = Math.PI / 2;
    head.add(housing, mesh(new THREE.CircleGeometry(4, 14), new THREE.MeshBasicMaterial({ color: '#fff3a0' }), 0, 0, 4.1));
    const h = Math.max(4, rig.position.y - groundAt(G, rig.position.x, rig.position.z) - 5);
    rig.add(mesh(new THREE.CylinderGeometry(2.5, 5, h, 8), lam('#8a8378'), 0, -5 - h / 2, 0), mesh(new THREE.CylinderGeometry(7, 7, 1.5, 12), lam('#5a5a66'), 0, -5, 0));
  }
  rig.add(head);
  const beamGeo = new THREE.ConeGeometry(L * Math.tan(0.16), L, 24, 1, true);
  beamGeo.translate(0, -L / 2, 0); // apex at the lamp, pointing down local -Y
  const beamMat = glowMat('#fff3a0', 0.16);
  beamMat.side = THREE.DoubleSide;
  const beam = new THREE.Mesh(beamGeo, beamMat);
  rig.add(beam);
  G.scene.add(rig);
  const axis = new THREE.Vector3();
  let half = 0.16, sweep = 0.7, spotted = 0, catches = 0, grace = 0, phase = Math.random() * 6;
  const cosHalf = () => Math.cos(half);
  return objective({
    type: 'searchlight', reward: 220, noun: 'the hoop',
    title: pick(['Sneak Past The Searchlight', 'Mission: Improbable', 'Stealth Mode (Propeller Edition)']),
    desc: `Fly through the green hoop. A searchlight sweeps around it: stay out of the beam. Spotted ${MAX_CATCHES} times and the mission is off.`,
    caps: new Set(['grow', 'easier']),
    signText: ['SHHH!', 'HOOP →', '(AVOID THE LIGHT)'],
    hints: ['Watch the beam sweep round, then dash in right behind it.', 'Crossing the beam quickly is fine. Flying along it is not.', 'Low and fast. Very ninja.'],
    target() { return hoop.position; },
    onUpdate(dt, G) {
      const p = G.player;
      spinRing(hoop, dt, this.t);
      anim(hoop, dt);
      if (p.pos.distanceTo(hoop.position) > 150) faceFlat(hoop, p.pos, dt);
      // The beam circles the lamp, nodding up and down so it sweeps the whole approach.
      const yaw = this.t * sweep + phase, pitch = 0.36 + Math.sin(this.t * 0.6) * 0.14;
      axis.set(Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
      beam.quaternion.setFromUnitVectors(DOWN, axis);
      head.lookAt(_a.copy(rig.position).add(axis));
      _b.subVectors(p.pos, rig.position);
      const d = _b.length();
      const lit = !p.dead && grace <= 0 && d < L && _b.dot(axis) > d * cosHalf();
      grace = Math.max(0, grace - dt);
      spotted = lit ? spotted + dt : Math.max(0, spotted - dt * 0.25);
      const k = Math.min(1, spotted / CATCH);
      beamMat.color.setRGB(1, 0.95 - k * 0.75, 0.62 - k * 0.5);
      beamMat.opacity = grace > 0 ? 0.06 : 0.16 + k * 0.12;
      if (lit && Math.random() < dt * 6) G.audio.tone(900 + k * 600, 0.06, { type: 'square', vol: 0.03 });
      if (spotted >= CATCH) {
        spotted = 0;
        catches++;
        grace = 2.5;
        G.audio.zap();
        G.ui.tint('#ff3a3a', 1.5);
        if (catches >= MAX_CATCHES) { G.ui.notify('SPOTTED. Mission over. The guard is writing a very long report.', 'bad', 3); return 'fail'; }
        G.ui.notify(`SPOTTED! (${catches}/${MAX_CATCHES}) The guard rubs his eyes. Go, go, go!`, 'bad', 3);
      }
      this.progress = `👁 Spotted ${Math.round(k * 100)}% · caught ${catches}/${MAX_CATCHES}`;
      const r = crossRing(hoop, p.prevPos, p.pos, R);
      if (r === 'hit') { G.ui.notify(catches ? 'Made it! Mostly unseen.' : 'Ghosted it! Not a single sighting. Legendary.', 'good', 3); return 'done'; }
      if (r === 'miss') G.ui.notify(pick(T.nearMiss), 'warn', 2.5, 0);
      return null;
    },
    grow(f) { hoop.userData.tscale = Math.min((hoop.userData.tscale || 1) * f, 5); },
    easier() {
      sweep *= 0.65;
      half = Math.max(0.08, half * 0.8);
      beam.scale.set(Math.tan(half) / Math.tan(0.16), 1, Math.tan(half) / Math.tan(0.16));
      return 'The guard had a big lunch. The light sweeps slower and the beam got narrower.';
    },
    dispose(G) { drop(G, hoop, rig); },
  });
}

// ---------- hot potato (a cake with a fuse) ----------

function makeCake() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(3.2, 3.2, 2, 14), lam('#ff7ac0')), mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.5, 14), lam('#ffffff'), 0, 1.1, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.2, 6), lam('#4dd6ff'), 0, 2.4, 0));
  const flame = mesh(new THREE.ConeGeometry(0.45, 1.2, 6), new THREE.MeshBasicMaterial({ color: '#ffd23a' }), 0, 4, 0);
  g.add(flame, mesh(new THREE.SphereGeometry(1.8, 8, 6), glowMat('#ff9a3a', 0.4), 0, 4, 0));
  g.userData.flame = flame;
  g.scale.setScalar(0.6); // small enough not to hide the view under the plane
  return g;
}

export function mkBomb(G) {
  const R = 16, need = 6, CAP = 16;
  const cake = makeCake();
  G.scene.add(cake);
  const ring = makeRing(R, '#ff9a3a');
  const place = () => { ring.userData.tpos = null; ring.position.copy(ahead(G, rand(200, 250), 0.55, 25)); faceFlat(ring, G.player.pos); };
  place();
  G.scene.add(ring);
  let fuse = 12, bonus = 7, got = 0, tick = 0, scale = 1, warned = false;
  return objective({
    type: 'bomb', reward: 230, noun: 'the next ring',
    title: pick(['Hot Potato', 'The Cake Is A Bomb', 'Birthday Countdown']),
    desc: `You're carrying a birthday cake with a VERY short fuse. Each ring adds ${bonus} seconds. Get through ${need} rings and it pops into harmless confetti. Probably harmless.`,
    caps: new Set(['grow', 'approach', 'teleport', 'easier']),
    signText: ['RING!', 'THAT WAY →', 'TICK TOCK'],
    hints: ['Rings appear ahead of you. Don\'t overshoot, there\'s no time to turn around.', 'Boost to the next ring when the fuse gets short.'],
    target() { return ring.position; },
    onUpdate(dt, G) {
      const p = G.player;
      spinRing(ring, dt, this.t);
      anim(ring, dt);
      carry(cake, p);
      cake.userData.flame.scale.y = 1 + Math.sin(this.t * 30) * 0.35;
      if (fuse < 4) cake.position.x += Math.sin(this.t * 60) * 0.3; // nervous wobble
      if (!p.dead) fuse -= dt; // the fuse waits while you respawn: we're not monsters
      if ((tick -= dt) <= 0) { tick = fuse > 4 ? 1 : 0.33; G.audio.tone(fuse > 4 ? 1100 : 1600, 0.04, { type: 'square', vol: 0.04 }); }
      if (fuse < 4 && !warned) { warned = true; G.ui.notify('The candle is VERY short now. Ring! Ring! RING!', 'warn', 2.5); }
      this.progress = `🎂 Fuse ${Math.max(0, fuse).toFixed(1)}s · ring ${got}/${need}`;
      if (fuse <= 0) {
        G.fx.explosion(cake.position);
        G.fx.confetti(cake.position);
        G.ui.flash('#ffd0f0', 0.6);
        G.ui.notify('KABOOM. Cake everywhere. Your windscreen is now frosted.', 'bad', 3);
        return 'fail';
      }
      const r = crossRing(ring, p.prevPos, p.pos, R * scale);
      if (r === 'hit') {
        got++;
        fuse = Math.min(CAP, fuse + bonus);
        warned = false;
        this.progressed = true;
        G.fx.sparkle(ring.position, '#ff9a3a');
        G.audio.ding(1 + got * 0.1);
        if (got >= need) {
          G.fx.confetti(cake.position);
          G.audio.pop();
          G.ui.notify('POP! The cake turned into confetti. Happy birthday to nobody in particular!', 'good', 3);
          return 'done';
        }
        place();
      } else if (r === 'miss') G.ui.notify(pick(T.nearMiss), 'warn', 2.5, 0);
      else {
        // Overshot it? A fresh ring appears ahead. The fuse didn't stop for it.
        _a.subVectors(ring.position, p.pos);
        if (!p.dead && _a.dot(p.forward) < 0 && _a.length() > 90) { place(); G.ui.notify('Missed! New ring ahead. The fuse did not wait.', 'warn', 2, 0); }
      }
      return null;
    },
    grow(f) { scale = Math.min(scale * f, 4); ring.userData.tscale = scale; },
    approach(G, f) { moveToward(G, ring, f); },
    teleport(G) { ring.userData.tpos = null; ring.position.copy(inFront(G, 150)); faceFlat(ring, G.player.pos); },
    easier() { bonus += 3; fuse = Math.min(CAP + 6, fuse + 6); return `We trimmed the fuse the other way. +6 seconds now, and each ring adds ${bonus}.`; },
    dispose(G) { drop(G, cake, ring); },
  });
}

// ---------- balloon herding ----------

export function mkHerd(G) {
  const RP = 42, n = 3, PUSH_R = 50;
  const pen = new THREE.Group();
  pen.position.copy(pointAhead(G, 420, 520, 0.5, 50, 80));
  const hoop = makeRing(RP, '#7aff6a');
  hoop.rotation.x = Math.PI / 2; // lying flat
  const wall = mesh(new THREE.CylinderGeometry(RP, RP, 40, 32, 1, true), glowMat('#7aff6a', 0.1));
  wall.material.side = THREE.DoubleSide;
  const sign = makeTextSprite(['BALLOON', 'PEN'], 26, { bg: null, fg: '#7aff6a' });
  sign.position.y = 34;
  pen.add(hoop, wall, sign);
  G.scene.add(pen);
  // Balloons start roughly between you and the pen, so the first push is the right way.
  _a.subVectors(G.player.pos, pen.position).setY(0).normalize();
  const colors = ['#ff4d6d', '#ffd23a', '#4dd6ff'];
  const balloons = colors.map((c, k) => {
    const b = makeBalloon(c);
    _b.copy(_a).applyAxisAngle(Y, (k - 1) * 0.8 + rand(-0.2, 0.2));
    b.position.copy(pen.position).addScaledVector(_b, rand(95, 130));
    b.position.y += rand(-10, 15);
    lift(G, b.position, 20, 15);
    b.userData = { vel: new THREE.Vector3(), penned: false, phase: Math.random() * 10, slot: new THREE.Vector3(Math.cos(k * 2.1) * 14, 0, Math.sin(k * 2.1) * 14) };
    G.scene.add(b);
    return b;
  });
  let push = 60, pull = 1.6, scale = 1, inPen = 0;
  const free = () => balloons.filter((b) => !b.userData.penned);
  return objective({
    type: 'herd', reward: 210, noun: 'the balloons',
    title: pick(['Balloon Herding', 'Sheepdog Of The Skies', 'Round Up The Floaties']),
    desc: 'Three balloons wandered off. Push them into the green pen. Your plane shoves the air around it: fly past (or through) a balloon to send it where you are going.',
    caps: new Set(['grow', 'easier']),
    signText: ['BALLOONS', 'NEED HERDING →'],
    hints: ['Fly THROUGH a balloon toward the pen: it gets shoved the way you\'re flying.', 'Gentle passes work. Balloons spook easily.', 'The pen pulls in balloons that get close. It wants them too.'],
    target() { const b = nearestOf(G, free()); return b ? b.position : pen.position; },
    onUpdate(dt, G) {
      const p = G.player, c = pen.position, R = RP * scale;
      anim(pen, dt);
      hoop.userData.studs.rotation.z += dt * 0.5;
      for (const b of balloons) {
        const u = b.userData, ph = this.t + u.phase;
        b.rotation.z = Math.sin(ph) * 0.15;
        if (u.penned) { _c.copy(c).add(u.slot); _c.y += Math.sin(ph * 1.5) * 2; b.position.lerp(_c, 1 - Math.exp(-dt * 1.5)); continue; }
        _a.subVectors(b.position, p.pos);
        const d = _a.length();
        if (!p.dead && d < PUSH_R && d > 0.01) {
          // The air push: half "away from the plane", half "along its wake". Fly through one and it goes your way.
          const k = 1 - d / PUSH_R;
          _a.multiplyScalar(0.5 / d).addScaledVector(p.forward, 0.5);
          _a.y *= 0.3;
          u.vel.addScaledVector(_a, push * k * k * dt);
        }
        _b.subVectors(c, b.position);
        const h = Math.hypot(_b.x, _b.z);
        if (h < R * 1.7) u.vel.addScaledVector(_b.setY(0).normalize(), pull * dt); // the pen's gentle suction
        else if (h > 450) u.vel.addScaledVector(_b.setY(0).normalize(), 3 * dt);  // too far: drift home
        u.vel.y += (c.y - b.position.y) * 0.25 * dt;
        u.vel.x += Math.sin(ph * 0.3) * 0.4 * dt;
        u.vel.multiplyScalar(Math.exp(-dt * 0.7));
        b.position.addScaledVector(u.vel, dt);
        const floor = clearance(G, b.position.x, b.position.z, 8) + 14;
        if (b.position.y < floor) { b.position.y = floor; u.vel.y = Math.max(0, u.vel.y); }
        b.position.y = underRoof(G, b.position.x, b.position.z, b.position.y, 15);
        if (h < R * 0.9 && Math.abs(b.position.y - c.y) < 22) {
          u.penned = true;
          inPen++;
          this.progressed = true;
          G.fx.sparkle(b.position, '#7aff6a');
          G.audio.ding(1 + inPen * 0.15);
          if (inPen < n) G.ui.notify(pick(['One in the pen! It seems happy. Balloons always seem happy.', 'Herded! Good dog. Er, plane.']), 'good', 2.5);
        }
      }
      this.progress = `🎈 ${inPen} / ${n} in the pen`;
      return inPen >= n ? 'done' : null;
    },
    grow(f) { scale = Math.min(scale * f, 2.5); pen.userData.tscale = scale; },
    easier() { push *= 1.4; pull *= 2; return 'Balloons are now 40% more pushable, and the pen sucks harder. In a nice way.'; },
    dispose(G) { drop(G, pen, ...balloons); },
  });
}

// ---------- sky melody ----------

// Semitones above C5. Short, famous and public domain.
const TUNES = [
  { name: 'Twinkle Twinkle Little Star', notes: [0, 0, 7, 7, 9, 9, 7] },
  { name: 'Ode To Joy', notes: [4, 4, 5, 7, 7, 5, 4, 2] },
  { name: 'Mary Had A Little Lamb', notes: [4, 2, 0, 2, 4, 4, 4] },
  { name: 'Frère Jacques', notes: [0, 2, 4, 0, 0, 2, 4, 0] },
];
const freqOf = (s) => 523.25 * 2 ** (s / 12);

function makeNote(color, k) {
  const g = new THREE.Group();
  const mat = lam(color, { emissive: color, emissiveIntensity: 0.5 });
  const head = mesh(new THREE.SphereGeometry(3.2, 10, 8), mat);
  head.scale.set(1.3, 1, 1);
  head.rotation.z = 0.4;
  g.add(head, mesh(new THREE.BoxGeometry(0.7, 10, 0.7), mat, 3.6, 5, 0), mesh(new THREE.BoxGeometry(3.4, 1.2, 0.7), mat, 5, 9.4, 0));
  g.add(mesh(new THREE.SphereGeometry(9, 10, 8), glowMat(color, 0.18), 1, 3, 0));
  const num = label(k + 1, 8);
  num.position.y = 16;
  g.add(num);
  return g;
}

export function mkMelody(G) {
  const tune = pick(TUNES), n = tune.notes.length;
  const start = pointAhead(G, 230, 290, 0.35, 40, 70);
  const dir = new THREE.Vector3().subVectors(start, G.player.pos).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  // A wiggly line of notes; higher notes float higher, so the path looks a bit like the tune.
  const notes = tune.notes.map((s, k) => {
    const m = makeNote(new THREE.Color().setHSL((s / 12) % 1, 0.85, 0.6).getStyle(), k);
    m.position.copy(start).addScaledVector(dir, k * 70).addScaledVector(side, Math.sin(k * 0.9) * 35);
    m.position.y += s * 4;
    lift(G, m.position, 25, 20);
    m.userData.phase = k;
    G.scene.add(m);
    return m;
  });
  let idx = 0, scale = 1, sour = 0;
  const sing = (s, delay = 0) => { G.audio.tone(freqOf(s), 0.45, { type: 'triangle', vol: 0.2, delay }); G.audio.tone(freqOf(s) * 2, 0.3, { type: 'sine', vol: 0.05, delay }); };
  return objective({
    type: 'melody', reward: 60 + n * 22, noun: 'the next note',
    title: pick(['Sky Melody', 'Air Guitar, But Plane', 'The Flying Jukebox']),
    desc: `Fly through the ${n} floating notes in order to play "${tune.name}". Wrong note? The tune starts over. Music is cruel.`,
    caps: new Set(['grow', 'approach', 'teleport']),
    signText: ['♪ NOTES ♪', 'THAT WAY →'],
    hints: ['Follow the numbers. Higher notes float higher.', 'Missed one? Loop back. The audience is very patient (they are clouds).'],
    target() { return notes[idx].position; },
    onUpdate(dt, G) {
      sour = Math.max(0, sour - dt);
      for (const m of notes) { anim(m, dt); m.rotation.y = Math.sin(this.t + m.userData.phase) * 0.6; }
      this.progress = `🎵 Note ${idx + 1} / ${n} · ${tune.name}`;
      if (G.player.dead) return null;
      const r = 13 * scale;
      for (let k = 0; k < n; k++) {
        const m = notes[k];
        if (!m.visible || m.position.distanceTo(G.player.pos) > r) continue;
        if (k === idx) {
          sing(tune.notes[k]);
          m.visible = false;
          G.fx.sparkle(m.position, '#ffffff');
          idx++;
          this.progressed = true;
          if (idx < n) return null;
          tune.notes.forEach((s, i) => sing(s, 0.6 + i * 0.3)); // encore: the whole tune
          G.ui.notify(`🎶 "${tune.name}"! The clouds are giving you a standing ovation.`, 'good', 3);
          return 'done';
        }
        if (sour > 0) continue;
        // Wrong note: a sour honk, and the tune starts over (no fail, just shame).
        sour = 1.2;
        const f = freqOf(tune.notes[k]);
        G.audio.tone(f * 0.94, 0.5, { type: 'sawtooth', vol: 0.08, slide: -80 });
        G.audio.tone(f * 1.06, 0.5, { type: 'sawtooth', vol: 0.06, slide: -60 });
        G.ui.notify(pick(['BWAAMP. Wrong note! From the top...', 'That was note ' + (k + 1) + '. The tune starts over. The clouds wince.', 'Sour note! Your music teacher felt that from here.']), 'warn', 2.5);
        idx = 0;
        for (const x of notes) x.visible = true;
        return null;
      }
      return null;
    },
    grow(f) { scale = Math.min(scale * f, 4); for (const m of notes) m.userData.tscale = Math.min(scale, 2.5); },
    approach(G, f) {
      const cur = notes[idx].userData.tpos || notes[idx].position;
      _c.subVectors(G.player.pos, cur).multiplyScalar(f);
      for (const m of notes) m.userData.tpos = lift(G, (m.userData.tpos || m.position).clone().add(_c), 20, 20);
    },
    teleport(G) {
      _c.copy(inFront(G, 150)).sub(notes[idx].position);
      for (const m of notes) { m.userData.tpos = null; lift(G, m.position.add(_c), 20, 20); }
    },
    dispose(G) { drop(G, ...notes); },
  });
}

// ---------- catch the falling stars ----------

export function mkMeteors(G) {
  const need = 5;
  const star = new THREE.Group();
  const body = makeStar();
  body.scale.setScalar(1.5);
  const tailGeo = new THREE.CylinderGeometry(0.6, 5, 50, 8, 1, true);
  tailGeo.translate(0, 25, 0); // the tail streams back from the star
  const tail = new THREE.Mesh(tailGeo, glowMat('#ffb04a', 0.35));
  star.add(body, tail);
  G.scene.add(star);
  const vel = new THREE.Vector3();
  let got = 0, missed = 0, wait = 0, slow = 1, scale = 1;
  const spawn = () => {
    const p = G.player.pos, f = flatForward(G).applyAxisAngle(Y, rand(-0.7, 0.7)), d = rand(260, 420);
    const lx = p.x + f.x * d, lz = p.z + f.z * d, ly = groundAt(G, lx, lz);
    const a = rand(0, Math.PI * 2), off = rand(60, 140);
    star.position.set(lx + Math.cos(a) * off, Math.max(p.y + rand(110, 170), ly + 220), lz + Math.sin(a) * off);
    star.position.y = underRoof(G, star.position.x, star.position.z, star.position.y, 15);
    vel.set(lx - star.position.x, ly - star.position.y, lz - star.position.z).divideScalar(rand(10, 13) / slow);
    tail.quaternion.setFromUnitVectors(Y, _a.copy(vel).normalize().negate());
    star.visible = true;
  };
  spawn();
  return objective({
    type: 'meteors', reward: 200, noun: 'the falling star',
    title: pick(['Catch The Falling Stars', 'Wish Collector', 'Meteor Shower Of Opportunity']),
    desc: `Shooting stars are falling. Catch ${need} before they hit the ground. Each one is a wish. We wished for you to catch them.`,
    caps: new Set(['grow', 'teleport', 'easier']),
    signText: ['FALLING STAR', 'CATCH IT →'],
    hints: ['Fly to where the star will LAND, then pull up into it.', 'They fall slower than you fly. Mostly.'],
    target() { return star.visible ? star.position : null; },
    onUpdate(dt, G) {
      this.progress = `🌠 ${got} / ${need} caught${missed ? ` · ${missed} fizzled` : ''}`;
      if (!star.visible) { if ((wait -= dt) <= 0) spawn(); return null; }
      star.position.addScaledVector(vel, dt);
      body.rotation.y += dt * 4;
      if (Math.random() < dt * 20) G.fx.trail(star.position, '#ffd23a');
      const ground = groundAt(G, star.position.x, star.position.z, star.position.y);
      if (!G.player.dead && star.position.distanceTo(G.player.pos) < 14 * scale) {
        got++;
        this.progressed = true;
        G.score += 15;
        G.fx.sparkle(star.position, '#ffd23a');
        G.audio.ding(1 + got * 0.12);
        star.visible = false;
        wait = 0.8;
        if (got < need) G.ui.notify(pick(['Caught one! Make a wish. Not that one.', 'Got it! Still warm.', 'Star caught! The sky has one fewer star now. Worth it.']), 'good', 2);
        return got >= need ? 'done' : null;
      }
      if (star.position.y <= ground + 2) {
        missed++;
        G.fx.emit(star.position, 30, { colors: ['#ffd23a', '#888888', '#ffffff'], speed: 20, life: 1.2, size: 5, up: 12 });
        G.ui.notify(pick(['Fssst. That one fizzled. Another is coming.', 'Missed! It landed in a field and is now a very expensive rock.', 'Plonk. Wish cancelled. Next!']), 'warn', 2, 0);
        star.visible = false;
        wait = 0.8;
      }
      return null;
    },
    grow(f) { scale = Math.min(scale * f, 4); body.scale.setScalar(1.5 * Math.min(scale, 2.5)); },
    teleport(G) { if (!star.visible) spawn(); star.position.copy(inFront(G, 150)); star.position.y += 30; },
    easier() { slow *= 0.7; vel.multiplyScalar(0.7); return 'Gravity agreed to work part-time. The stars fall 30% slower.'; },
    dispose(G) { drop(G, star); },
  });
}

// ---------- photo safari ----------

const FOCUS_OFF = new THREE.Color('#888888'), FOCUS_ON = new THREE.Color('#ffffff'), FOCUS_SHARP = new THREE.Color('#7aff6a');

export function mkPhoto(G) {
  const need = 3;
  const whale = new THREE.Group();
  const body = makeLandmark('whale', 1.4); // shared prop geometry (kept on dispose)
  whale.add(body);
  whale.position.copy(pointAhead(G, 330, 450, 0.5, 60, 110));
  G.scene.add(whale);
  const reticle = makeRing(22, '#ffffff');
  reticle.visible = false;
  G.scene.add(reticle);
  const tint = (c) => { const u = reticle.userData; u.mat.color.copy(c); u.mat.emissive.copy(c); u.glowMat.color.copy(c); };
  const vel = new THREE.Vector3(), wander = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
  let shots = 0, focus = 0, hold = 3, cone = 0.22, maxD = 180, shy = 1, flee = 0;
  return objective({
    type: 'photo', reward: 220, noun: 'the shy sky whale',
    title: pick(['Photo Safari', 'Paparazzi Of The Skies', 'National Geographic (Unofficial)']),
    desc: `A shy sky whale lives here. Take ${need} photos: keep it centred in front of your nose, within ${maxD} m, until the picture focuses. It hates the flash.`,
    caps: new Set(['grow', 'approach', 'teleport', 'easier']),
    signText: ['SKY WHALE', 'SAY CHEESE →'],
    hints: ['Point your nose right at the whale and hold it there. Focus builds while it\'s centred.', 'Don\'t chase it too fast: it panics if you get close. Hang back a bit.'],
    target() { return whale.position; },
    onUpdate(dt, G) {
      const p = G.player;
      _a.subVectors(whale.position, p.pos);
      const d = _a.length();
      // Shy: drifts about, swims away when you get close, and bolts after every photo.
      wander.applyAxisAngle(Y, rand(-0.6, 0.6) * dt);
      flee = Math.max(0, flee - dt);
      const scared = d < 120 || flee > 0;
      _b.copy(wander).multiplyScalar(scared ? 0.4 : 1);
      if (scared) _b.addScaledVector(_c.copy(_a).setY(0).normalize(), 0.8);
      _b.y = 0;
      _b.normalize().multiplyScalar((flee > 0 ? 34 : scared ? 22 : 12) * shy);
      vel.lerp(_b, 1 - Math.exp(-dt * 1.2));
      whale.position.addScaledVector(vel, dt);
      anim(whale, dt);
      const g = clearance(G, whale.position.x, whale.position.z, 20);
      if (whale.position.y < g + 45) whale.position.y += (g + 45 - whale.position.y) * Math.min(1, dt * 2);
      if (whale.position.y > g + 200) whale.position.y -= dt * 10;
      whale.position.y = underRoof(G, whale.position.x, whale.position.z, whale.position.y + Math.sin(this.t * 0.7) * dt * 3, 22);
      if (vel.lengthSq() > 1) faceFlat(whale, _c.copy(whale.position).add(vel), dt); // nose (+Z) the way it swims
      body.rotation.z = Math.sin(this.t * 1.3) * 0.08;
      // The viewfinder: centred, close enough, and alive.
      const framed = !p.dead && d < maxD && _a.dot(p.forward) > d * Math.cos(cone);
      if (framed) { focus += dt; this.progressed = true; }
      const k = Math.min(1, focus / hold);
      reticle.visible = framed || focus > 0;
      if (reticle.visible) {
        reticle.position.copy(whale.position);
        reticle.lookAt(p.pos);
        reticle.scale.setScalar(2.2 - k * 1.2);
        tint(framed ? (k > 0.66 ? FOCUS_SHARP : FOCUS_ON) : FOCUS_OFF);
      }
      this.progress = `📸 Photo ${shots}/${need} · focus ${Math.round(k * 100)}%${d > maxD ? ' · too far!' : framed ? ' · hold it…' : ' · centre it!'}`;
      if (k < 1) return null;
      shots++;
      focus = 0;
      flee = 4;
      G.ui.flash('#ffffff', 0.9);
      G.audio.noise(0.08, { vol: 0.3, freq: 6000 });
      G.audio.tone(1800, 0.05, { type: 'square', vol: 0.05 });
      G.ui.notify(`📸 Snap! ${pick(['Blurry, but in a artistic way.', 'A majestic side profile.', 'It blinked. Still a keeper.', 'Mostly fin. Gallery-worthy fin.', 'The whale is pretending it didn\'t see you.'])}`, 'good', 2.5);
      return shots >= need ? 'done' : null;
    },
    grow(f) { cone = Math.min(cone * 1.25, 0.6); maxD = Math.min(maxD * 1.2, 400); whale.userData.tscale = Math.min((whale.userData.tscale || 1) * Math.sqrt(f), 2.2); },
    approach(G, f) { whale.position.lerp(G.player.pos, f * 0.7); },
    teleport(G) { whale.userData.tpos = null; whale.position.copy(inFront(G, 150, 50)); },
    easier() { shy *= 0.6; hold = Math.max(1.5, hold - 0.75); return `The whale had a calming tea. It swims slower and the camera focuses in ${hold} s now.`; },
    dispose(G) { drop(G, whale, reticle); },
  });
}
