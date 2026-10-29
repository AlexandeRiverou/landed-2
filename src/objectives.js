// Objective types. Each one exposes hooks (grow / approach / teleport / easier / magnet)
// so the persuasion system can bend it toward a player who is ignoring it.
import * as THREE from 'three';
import { makeRing, setRingColor, makeStar, makeBalloon, makeGoose, makeArch, makeLandmark, disposeTree } from './models.js';
import { pick, rand, T, weightedPick } from './texts.js';

const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _dummy = new THREE.Object3D();

export const groundAt = (G, x, z) => Math.max(G.terrain.surfaceHeight(x, z), G.world.seaLevel);

function clearance(G, x, z, r = 30) {
  let g = groundAt(G, x, z);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g = Math.max(g, groundAt(G, x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return g;
}

export function flatForward(G) {
  const f = new THREE.Vector3(G.player.forward.x, 0, G.player.forward.z);
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  return f.normalize();
}

export function pointAhead(G, dMin, dMax, spread = 0.9, hMin = 40, hMax = 120) {
  const f = flatForward(G).applyAxisAngle(Y, (Math.random() * 2 - 1) * spread);
  const d = rand(dMin, dMax), p = G.player.pos;
  const x = p.x + f.x * d, z = p.z + f.z * d;
  let y = clearance(G, x, z) + rand(hMin, hMax);
  // No ground worth the name (space zones): put it near the player's altitude instead.
  if (G.zones.current.noGround) y = Math.max(y, p.y + rand(-50, 60));
  return new THREE.Vector3(x, y, z);
}

function inFront(G, d, minClear = 35) {
  const f = flatForward(G), p = G.player.pos;
  const v = new THREE.Vector3(p.x + f.x * d, p.y, p.z + f.z * d);
  v.y = Math.max(v.y, clearance(G, v.x, v.z, 25) + minClear);
  return v;
}

// Did the segment prev→cur pass through the ring's disc? 'hit' / 'miss' (near) / null.
export function crossRing(ring, prev, cur, radius, halfOnly = false) {
  const a = ring.worldToLocal(_a.copy(prev)), b = ring.worldToLocal(_b.copy(cur));
  if ((a.z > 0) === (b.z > 0)) return null;
  const t = a.z / (a.z - b.z);
  const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
  const r = Math.hypot(x, y);
  if (halfOnly && y < -3) return r < radius * 2 ? 'miss' : null;
  if (r < radius) return 'hit';
  return r < radius * 2.2 ? 'miss' : null;
}

function faceFlat(o3, from, dt = 0) {
  _dummy.position.copy(o3.position);
  _dummy.lookAt(from.x, o3.position.y, from.z);
  if (dt) o3.quaternion.slerp(_dummy.quaternion, 1 - Math.exp(-dt * 2));
  else o3.quaternion.copy(_dummy.quaternion);
}

// Smoothly ease toward userData.tpos / userData.tscale.
function anim(o3, dt) {
  const u = o3.userData;
  if (u.tpos) o3.position.lerp(u.tpos, 1 - Math.exp(-dt * 2.5));
  if (u.tscale) o3.scale.setScalar(THREE.MathUtils.lerp(o3.scale.x, u.tscale, 1 - Math.exp(-dt * 3)));
}

function moveToward(G, o3, f, minClear = 35) {
  const from = o3.userData.tpos || o3.position;
  const np = from.clone().lerp(G.player.pos, f);
  np.y = Math.max(np.y, clearance(G, np.x, np.z, 25) + minClear);
  o3.userData.tpos = np;
}

function spinRing(ring, dt, t) {
  const u = ring.userData;
  u.studs.rotation.z += dt * 0.8;
  u.glowMat.opacity = 0.22 + Math.sin(t * 4) * 0.1;
}

function objective(o) {
  const obj = Object.assign({
    t: 0, caps: new Set(), reward: 100, noun: 'the objective', progress: '', hints: null, signText: null, virtual: false, progressed: false,
    target() { return null; }, grow() {}, approach() {}, teleport() {}, easier() {}, magnet() {},
    onUpdate() { return null; }, dispose() {},
  }, o);
  obj.update = function (dt, G) { this.t += dt; return this.onUpdate(dt, G); };
  return obj;
}

// ---------- hoops ----------

function mkHoop(G, opt = {}) {
  const R = opt.radius || 17;
  const ring = makeRing(R, opt.color ?? '#ffc23a');
  ring.position.copy(pointAhead(G, opt.dMin ?? 350, opt.dMax ?? 620, opt.spread ?? 1.1));
  faceFlat(ring, G.player.pos);
  G.scene.add(ring);
  let warnedTime = false;
  return objective({
    type: opt.type || 'hoop',
    title: opt.title || pick(['Fly Through The Hoop', 'Hoop Dreams', 'Thread The Donut', 'The Hoop Awaits']),
    desc: opt.desc || pick([
      'A golden loop is floating somewhere ahead. Fly through it. Yes, THROUGH.',
      'It is a ring. You are a plane. You know what to do.',
      'Fly through the shiny circle. Society depends on it.',
    ]),
    noun: opt.noun || 'the hoop',
    reward: opt.reward || 100,
    caps: new Set(['grow', 'approach', 'teleport']),
    signText: ['THE HOOP', 'IS THAT WAY →'],
    timeLimit: opt.timeLimit || 0,
    target() { return ring.position; },
    onUpdate(dt, G) {
      spinRing(ring, dt, this.t);
      anim(ring, dt);
      if (G.player.pos.distanceTo(ring.position) > 150) faceFlat(ring, G.player.pos, dt);
      if (this.timeLimit) {
        const left = this.timeLimit - this.t;
        this.progress = `⏱ ${Math.max(0, left).toFixed(1)}s left`;
        if (left < 8 && !warnedTime) { warnedTime = true; G.ui.notify('8 seconds! The hoop is checking its watch.', 'warn'); }
        if (left <= 0) return 'fail';
      }
      const r = crossRing(ring, G.player.prevPos, G.player.pos, R);
      if (r === 'hit') return 'done';
      if (r === 'miss') G.ui.notify(pick(T.nearMiss), 'warn', 2.5, 0);
      return null;
    },
    grow(f) { ring.userData.tscale = Math.min((ring.userData.tscale || 1) * f, 7); },
    approach(G, f) { moveToward(G, ring, f); },
    teleport(G) { ring.userData.tpos = null; ring.position.copy(inFront(G, 170)); faceFlat(ring, G.player.pos); },
    dispose(G) { G.scene.remove(ring); disposeTree(ring); },
  });
}

const mkTinyHoop = (G) => mkHoop(G, {
  type: 'tiny', radius: 7, reward: 200, color: '#ff4dc4', noun: 'the tiny hoop',
  title: pick(['Precision Hoop', 'The Itty Bitty Ring', 'Needle Threader 3000']),
  desc: pick(['This hoop is emotionally small. Be gentle.', 'Tiny ring. Big reward. Bigger chance of embarrassment.']),
});

const mkTimedHoop = (G) => mkHoop(G, {
  type: 'timed', timeLimit: 28, reward: 180, color: '#3ad8ff', dMin: 320, dMax: 480, noun: 'the speed hoop',
  title: pick(['Speed Hoop', 'Hoop, But Hurry', 'Express Delivery Ring']),
  desc: pick(['You have 28 seconds. The hoop has a dinner reservation.', 'Fly through it before it gets bored. It bores easily.']),
});

function mkChain(G) {
  const n = 4 + Math.floor(Math.random() * 3);
  const rings = [];
  let p = pointAhead(G, 300, 450, 0.7, 50, 100);
  const dir = new THREE.Vector3().subVectors(p, G.player.pos).setY(0).normalize();
  for (let k = 0; k < n; k++) {
    const r = makeRing(15, k === 0 ? '#ffc23a' : '#7ad8ff');
    r.position.copy(p);
    G.scene.add(r);
    rings.push(r);
    const prev = p.clone();
    dir.applyAxisAngle(Y, rand(-0.4, 0.4));
    p = p.clone().addScaledVector(dir, rand(120, 150));
    p.y = Math.max(prev.y + rand(-30, 30), clearance(G, p.x, p.z) + 35);
    _dummy.position.copy(r.position);
    _dummy.lookAt(k === 0 ? G.player.pos.clone().setY(r.position.y) : rings[k - 1].position);
    r.quaternion.copy(_dummy.quaternion);
  }
  let idx = 0;
  const mark = () => rings.forEach((r, k) => { r.visible = k >= idx; setRingColor(r, k === idx ? '#ffc23a' : '#7ad8ff'); });
  mark();
  return objective({
    type: 'chain', reward: 80 + n * 25, noun: 'the ring chain',
    title: pick(['Ring Chain', 'The Hoop Highway', 'Slalom Of Destiny']),
    desc: `${n} rings in a row. Gold is next. Blue is later. Missing is forever.`,
    caps: new Set(['grow', 'approach', 'teleport']),
    signText: ['RINGS', 'THAT WAY →', '(SEVERAL!)'],
    target() { return rings[idx].position; },
    onUpdate(dt, G) {
      this.progress = `Ring ${idx + 1} / ${n}`;
      for (const r of rings) { spinRing(r, dt, this.t); anim(r, dt); }
      const r = crossRing(rings[idx], G.player.prevPos, G.player.pos, 15);
      if (r === 'hit') {
        G.fx.sparkle(rings[idx].position, '#ffd23a');
        G.audio.ding(1 + idx * 0.12);
        idx++;
        this.progressed = true;
        if (idx >= n) return 'done';
        mark();
      } else if (r === 'miss') G.ui.notify(pick(T.nearMiss), 'warn', 2.5, 0);
      return null;
    },
    grow(f) { for (const r of rings) r.userData.tscale = Math.min((r.userData.tscale || 1) * f, 6); },
    approach(G, f) {
      const cur = rings[idx].userData.tpos || rings[idx].position;
      const delta = new THREE.Vector3().subVectors(G.player.pos, cur).multiplyScalar(f);
      for (const r of rings) {
        const np = (r.userData.tpos || r.position).clone().add(delta);
        np.y = Math.max(np.y, clearance(G, np.x, np.z) + 35);
        r.userData.tpos = np;
      }
    },
    teleport(G) {
      const delta = inFront(G, 170).sub(rings[idx].position);
      for (const r of rings) { r.userData.tpos = null; r.position.add(delta); r.position.y = Math.max(r.position.y, clearance(G, r.position.x, r.position.z) + 35); }
      faceFlat(rings[idx], G.player.pos);
    },
    dispose(G) { for (const r of rings) { G.scene.remove(r); disposeTree(r); } },
  });
}

// ---------- collectibles ----------

function mkCollect(G, kind) {
  const stars = kind === 'stars';
  const n = stars ? 6 : 5;
  const center = pointAhead(G, 420, 620, 0.8, 60, 130);
  const items = [];
  const colors = ['#ff4d6d', '#ffd23a', '#4dd6ff', '#7aff6a', '#c77dff'];
  for (let k = 0; k < n; k++) {
    const m = stars ? makeStar() : makeBalloon(colors[k % colors.length]);
    const a = (k / n) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(60, 190);
    m.position.set(center.x + Math.cos(a) * r, center.y + rand(-30, 50), center.z + Math.sin(a) * r);
    m.position.y = Math.max(m.position.y, clearance(G, m.position.x, m.position.z, 10) + 25);
    m.userData.phase = Math.random() * 10;
    G.scene.add(m);
    items.push(m);
  }
  let got = 0, scale = 1, magnet = false;
  const alive = () => items.filter((m) => !m.userData.got);
  return objective({
    type: kind, reward: stars ? 150 : 140, noun: stars ? 'the stars' : 'the balloons',
    title: stars ? pick(['Star Collector', 'Twinkle Twinkle Grab That Star', 'Shiny Things Department']) : pick(['Balloon Popper', 'Party Pooper', 'Pop Goes The Balloon']),
    desc: stars ? `Collect ${n} stars. They're not real stars. Please don't tell them.` : `Pop ${n} balloons by flying into them. They knew the risks.`,
    caps: new Set(['grow', 'approach', 'teleport', 'magnet']),
    signText: stars ? ['STARS!', 'THAT WAY →'] : ['BALLOONS', 'NEED POPPING →'],
    target() {
      let best = null, bd = Infinity;
      for (const m of alive()) { const d = m.position.distanceToSquared(G.player.pos); if (d < bd) { bd = d; best = m; } }
      return best ? best.position : null;
    },
    onUpdate(dt, G) {
      this.progress = `${stars ? '⭐' : '🎈'} ${got} / ${n}`;
      const pp = G.player.pos;
      for (const m of alive()) {
        anim(m, dt);
        const ph = this.t + m.userData.phase;
        if (stars) { m.rotation.y += dt * 2; m.position.y += Math.sin(ph * 2) * dt * 3; }
        else { m.position.y += dt * 2.5; m.position.x += Math.sin(ph) * dt * 2; m.rotation.z = Math.sin(ph) * 0.15; }
        if (magnet && m.position.distanceTo(pp) < 450) { m.userData.tpos = null; m.position.lerp(pp, 1 - Math.exp(-dt * 0.5)); }
        if (!G.player.dead && m.position.distanceTo(pp) < (stars ? 11 : 10) * scale) {
          m.userData.got = true;
          m.visible = false;
          got++;
          this.progressed = true;
          G.score += 10;
          if (stars) { G.fx.sparkle(m.position); G.audio.ding(1 + got * 0.1); }
          else { G.fx.confetti(m.position); G.audio.pop(); }
        }
      }
      return got >= n ? 'done' : null;
    },
    grow(f) { scale = Math.min(scale * f, 5); for (const m of items) m.userData.tscale = scale; },
    approach(G, f) { for (const m of alive()) moveToward(G, m, f, 20); },
    teleport(G) {
      const c = inFront(G, 200);
      alive().forEach((m, k) => { m.userData.tpos = null; m.position.copy(c).add(new THREE.Vector3(Math.cos(k * 1.3) * 30, Math.sin(k) * 15, Math.sin(k * 1.3) * 30 + k * 25)); });
    },
    magnet() { magnet = true; },
    dispose(G) { for (const m of items) { G.scene.remove(m); disposeTree(m); } },
  });
}

// ---------- golden goose ----------

function mkGoose(G) {
  const goose = makeGoose();
  goose.position.copy(pointAhead(G, 320, 480, 0.6, 50, 90));
  G.scene.add(goose);
  const vel = new THREE.Vector3();
  let speedMul = 1, scale = 1, lastHonk = 0;
  const wander = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
  return objective({
    type: 'goose', reward: 220, noun: 'the golden goose',
    title: pick(['Catch The Golden Goose', 'Goose Chase (Literal)', 'Operation: Honk']),
    desc: 'A golden goose is fleeing. Fly into it. It is fast, smug, and mildly radioactive.',
    caps: new Set(['grow', 'approach', 'teleport', 'easier']),
    signText: ['GOOSE', 'WENT THAT WAY →'],
    hints: ['Use BOOST (Shift) to catch up. The goose hates that.', 'Cut corners! Geese only fly in straight-ish lines.'],
    target() { return goose.position; },
    onUpdate(dt, G) {
      const p = G.player.pos;
      const away = new THREE.Vector3().subVectors(goose.position, p);
      const d = away.length();
      wander.applyAxisAngle(Y, rand(-1, 1) * dt);
      const desired = d < 350 ? away.normalize().multiplyScalar(0.75).addScaledVector(wander, 0.5) : wander.clone().multiplyScalar(0.4);
      desired.y *= 0.3;
      desired.normalize().multiplyScalar(34 * speedMul * (d < 350 ? 1 : 0.4));
      vel.lerp(desired, 1 - Math.exp(-dt * 1.5));
      goose.position.addScaledVector(vel, dt);
      anim(goose, dt);
      const g = clearance(G, goose.position.x, goose.position.z, 15);
      if (goose.position.y < g + 30) goose.position.y += (g + 30 - goose.position.y) * Math.min(1, dt * 3);
      if (goose.position.y > g + 200) goose.position.y -= dt * 20;
      goose.lookAt(_a.copy(goose.position).add(vel));
      const f = Math.sin(this.t * 12) * 0.7;
      goose.userData.wings[0].rotation.z = -f; goose.userData.wings[1].rotation.z = f;
      if (d < 300 && this.t - lastHonk > 7) { lastHonk = this.t; G.ui.notify(pick(T.goose), 'info', 2.5, 0); G.audio.honk(); }
      this.progress = d < 300 ? '🪿 It knows you are coming.' : '🪿 Goose status: smug';
      return !G.player.dead && d < 10 * scale ? 'done' : null;
    },
    grow(f) { scale = Math.min(scale * f, 5); goose.userData.tscale = scale; },
    approach(G, f) { goose.position.lerp(G.player.pos, f * 0.8); },
    teleport(G) { goose.position.copy(inFront(G, 160)); },
    easier() { speedMul = Math.max(0.3, speedMul * 0.65); return 'The goose ate a big lunch. It is now noticeably slower.'; },
    dispose(G) { G.scene.remove(goose); disposeTree(goose); },
  });
}

// ---------- maneuvers ----------

function mkLoop(G) {
  const need = Math.random() < 0.35 ? 2 : 1;
  let done = 0;
  return objective({
    type: 'loop', reward: 120 + need * 40, noun: 'the loop-de-loop',
    title: need > 1 ? 'Double Loop-de-Loop' : pick(['Do A Loop-de-Loop', 'Loop The Loop', 'Upside-Down Appreciation Day']),
    desc: need > 1 ? 'Two full vertical loops. Your lunch will understand.' : 'Pull up and keep pulling until you\'re back where you started. Classic!',
    caps: new Set(['easier']),
    signText: ['DO A', 'LOOP! ↺'],
    hints: ['Hold W (or ↑) and DON\'T let go. Trust the process.', 'Speed helps! Boost (Shift) then hold W.', 'Upside down is a phase. It will pass.'],
    onUpdate(dt, G) {
      const p = G.player;
      if (p.events.includes('loop')) { done++; this.progressed = true; G.audio.ding(); if (done < need) G.ui.notify('One down! Again! The crowd is mildly interested!', 'good'); }
      const pct = Math.min(100, Math.round((Math.abs(p.loopAccum) / (Math.PI * 2 * p.loopRequirement)) * 100));
      this.progress = `↺ Loops ${done}/${need} · current ${pct}%`;
      return done >= need ? 'done' : null;
    },
    easier(G) {
      G.player.loopRequirement = Math.max(0.5, G.player.loopRequirement - 0.15);
      return `New rule: a loop only needs ${Math.round(G.player.loopRequirement * 360)}°. Standards are dropping.`;
    },
    dispose(G) { G.player.loopRequirement = 1; },
  });
}

function mkLowFly(G) {
  let thr = 30, need = 6, time = 0, wasLow = false;
  return objective({
    type: 'lowfly', reward: 160, noun: 'the ground', virtual: true,
    title: pick(['Crop Duster', 'Low And Slow (But Fast)', 'Lawnmower Mode']),
    desc: 'Fly very close to the ground (or water) for a while. Close, not IN.',
    caps: new Set(['easier']),
    signText: ['GO LOWER', '↓ ↓ ↓'],
    hints: ['The altitude readout is bottom-left. Get it under the limit.', 'Water counts as ground. Splashing does not.'],
    target() { const p = G.player; return _b.set(p.pos.x + p.forward.x * 60, groundAt(G, p.pos.x, p.pos.z), p.pos.z + p.forward.z * 60); },
    onUpdate(dt, G) {
      const p = G.player;
      const alt = p.pos.y - groundAt(G, p.pos.x, p.pos.z);
      const low = !p.dead && alt < thr;
      if (low) { time += dt; this.progressed = true; if (!wasLow) G.ui.notify('Brrrrrrr (crop dusting noises)', 'info', 2, 0); }
      wasLow = low;
      this.progress = `🌾 ${time.toFixed(1)} / ${need}s below ${thr} m (now ${Math.round(alt)} m)`;
      return time >= need ? 'done' : null;
    },
    easier() { thr += 15; need = Math.max(3, need - 1); return `Low-flying now means under ${thr} m. That's basically high-flying.`; },
  });
}

function mkAltitude(G) {
  let goal = Math.max(500, G.player.pos.y + 320);
  const start = G.player.pos.y;
  return objective({
    type: 'altitude', reward: 130, noun: 'the sky', virtual: true,
    title: pick(['Touch The Sky', 'Altitude Sickness Speedrun', 'Up, Up And Away']),
    desc: 'Climb really high. The clouds are having a party and you are invited.',
    caps: new Set(['easier']),
    signText: ['GO UP', '↑ ↑ ↑'],
    hints: ['Point the nose up (W) and boost. Gravity is just a suggestion.'],
    target() { const p = G.player.pos; return _b.set(p.x, goal + 40, p.z); },
    onUpdate(dt, G) {
      const y = G.player.pos.y;
      this.progress = `🏔 ${Math.round(y)} / ${Math.round(goal)} m`;
      if (y > start + 30) this.progressed = y > (this.best || 0) + 5;
      this.best = Math.max(this.best || 0, y);
      return y >= goal ? 'done' : null;
    },
    easier() { goal = Math.max(start + 80, goal - 90); return `Target altitude lowered to ${Math.round(goal)} m. The sky came down a bit to meet you.`; },
  });
}

// ---------- landmarks ----------

const BUZZ = [
  ['gnome', 'Giant Gnome', 'He knows what you did. Fly close and stare him down.'],
  ['duck', 'Colossal Rubber Duck', 'It squeaks at 140 decibels. Buzz it anyway.'],
  ['moai', 'Suspicious Stone Head', 'It has been judging everyone for 800 years. Fly by and judge it back.'],
  ['lighthouse', 'Lost Lighthouse', 'Nobody knows how it got here. Not even the lighthouse.'],
  ['donut', 'Monument To Donuts', 'A sacred donut. Fly close. Do NOT take a bite.'],
  ['mushroom', 'The Mega Mushroom', 'Fly near it. Don\'t eat it. We are serious this time.'],
  ['castleTower', 'Wizard Tower', 'A wizard lives here. He ordered a fly-by.'],
  ['trafficCone', 'The Cone Of Shame', 'A giant traffic cone. No one knows what road it\'s closing.'],
  ['cow', 'Enormous Cow', 'She has seen things. Fly past and say moo.'],
  ['snowman', 'Abominable Snowman', 'He is not abominable, he is just big. Go say hi.'],
  ['ferrisWheel', 'Abandoned Ferris Wheel', 'Ride closed. Fly-bys still allowed.'],
  ['totemPole', 'Totem Of Many Faces', 'Every face is judging your flying differently.'],
  ['radioTower', 'Radio Tower Of Bad Music', 'It only plays elevator music. Fly close and complain.'],
];

function mkBuzz(G) {
  const [kind, name, desc] = pick(BUZZ);
  const spot = pointAhead(G, 500, 700, 0.8);
  const scale = rand(4, 6);
  const m = makeLandmark(kind, scale);
  const g = new THREE.Group();
  g.add(m);
  g.position.set(spot.x, groundAt(G, spot.x, spot.z) - 2, spot.z);
  G.scene.add(g);
  let R = 55;
  const top = new THREE.Vector3();
  return objective({
    type: 'buzz', reward: 140, noun: `the ${name.toLowerCase()}`,
    title: `Buzz The ${name}`, desc,
    caps: new Set(['grow', 'approach', 'teleport']),
    signText: [name.toUpperCase(), 'THAT WAY →'],
    target() { return top.set(g.position.x, g.position.y + m.userData.height * g.scale.x + 15, g.position.z); },
    onUpdate(dt, G) {
      anim(g, dt);
      if (g.userData.tpos) g.userData.tpos.y = groundAt(G, g.userData.tpos.x, g.userData.tpos.z) - 2;
      g.rotation.y += dt * 0.2;
      const d = G.player.pos.distanceTo(this.target());
      this.progress = d < R * 3 ? '👀 Closer… closer…' : `Get within ${Math.round(R)} m`;
      return !G.player.dead && d < R ? 'done' : null;
    },
    grow(f) { R *= f; g.userData.tscale = Math.min((g.userData.tscale || 1) * Math.sqrt(f), 3); },
    approach(G, f) { moveToward(G, g, f, 0); },
    teleport(G) { const p = inFront(G, 260); g.userData.tpos = null; g.position.set(p.x, groundAt(G, p.x, p.z) - 2, p.z); },
    dispose(G) { G.scene.remove(g); disposeTree(g); },
  });
}

function mkGate(G) {
  const R = 32;
  const spot = pointAhead(G, 480, 680, 0.8);
  const arch = makeArch(R);
  arch.position.set(spot.x, groundAt(G, spot.x, spot.z) + 2, spot.z);
  faceFlat(arch, G.player.pos);
  G.scene.add(arch);
  return objective({
    type: 'gate', reward: 150, noun: 'the stone arch',
    title: pick(['Thread The Needle', 'Under The Arch', 'Stone Gate Of Mild Peril']),
    desc: 'A stone arch has appeared. Fly UNDER it. Over it is for cowards.',
    caps: new Set(['grow', 'approach', 'teleport']),
    signText: ['ARCH', 'FLY UNDER →'],
    hints: ['Get low before you reach it. The arch is not as tall as your ego.'],
    target() { return _b.set(arch.position.x, arch.position.y + R * 0.5 * arch.scale.x, arch.position.z); },
    onUpdate(dt, G) {
      anim(arch, dt);
      if (arch.userData.tpos) arch.userData.tpos.y = groundAt(G, arch.userData.tpos.x, arch.userData.tpos.z) + 2;
      if (G.player.pos.distanceTo(arch.position) > 200) faceFlat(arch, G.player.pos, dt);
      arch.userData.glowMat.opacity = 0.2 + Math.sin(this.t * 4) * 0.1;
      const r = crossRing(arch, G.player.prevPos, G.player.pos, R - 4, true);
      if (r === 'hit') return 'done';
      if (r === 'miss') G.ui.notify('Over the arch is NOT under the arch. Geometry is hard.', 'warn', 3, 0);
      return null;
    },
    grow(f) { arch.userData.tscale = Math.min((arch.userData.tscale || 1) * f, 4); },
    approach(G, f) { moveToward(G, arch, f, 0); },
    teleport(G) { const p = inFront(G, 260); arch.userData.tpos = null; arch.position.set(p.x, groundAt(G, p.x, p.z) + 2, p.z); faceFlat(arch, G.player.pos); },
    dispose(G) { G.scene.remove(arch); disposeTree(arch); },
  });
}

// ---------- hunt ----------

function mkHunt(G) {
  const n = 3;
  const center = pointAhead(G, 400, 560, 0.7, 50, 100);
  const list = [];
  for (let k = 0; k < n; k++) list.push(G.enemies.spawn('pigeon', center.clone().add(new THREE.Vector3(rand(-60, 60), rand(-10, 20), rand(-60, 60))), { quest: true, anchor: center }));
  let scale = 1;
  const alive = () => list.filter((e) => !e.dead);
  return objective({
    type: 'hunt', reward: 200, noun: 'the evil pigeons',
    title: pick(['Pigeon Patrol', 'The Pigeon Problem', 'Coo-ntermeasures']),
    desc: `${n} evil pigeons are plotting something. Shoot them (Space / click). They wear tiny top hats. It's not cute. It's evil.`,
    caps: new Set(['grow', 'approach', 'teleport']),
    signText: ['EVIL PIGEONS', 'THAT WAY →'],
    hints: ['Shoot with Space or click. Ramming them works too, but ouch.'],
    target() {
      let best = null, bd = Infinity;
      for (const e of alive()) { const d = e.pos.distanceToSquared(G.player.pos); if (d < bd) { bd = d; best = e; } }
      return best ? best.pos : null;
    },
    onUpdate() {
      const left = alive().length;
      if (left !== this.last) { if (this.last !== undefined) this.progressed = true; this.last = left; }
      this.progress = `🐦 ${n - left} / ${n} pigeons dealt with`;
      return left === 0 ? 'done' : null;
    },
    grow(f) { scale = Math.min(scale * f, 4); for (const e of alive()) { e.radius = e.def.radius * scale; e.mesh.scale.setScalar(scale); } },
    approach(G, f) { for (const e of alive()) { e.anchor.lerp(G.player.pos, f); e.pos.lerp(G.player.pos, f * 0.7); } },
    teleport(G) { const c = inFront(G, 200); for (const e of alive()) { e.anchor.copy(c); e.pos.copy(c).add(new THREE.Vector3(rand(-30, 30), rand(-5, 10), rand(-30, 30))); } },
    dispose(G) { for (const e of alive()) G.enemies.removeEnemy(e); },
  });
}

// ---------- bosses ----------

const BOSS_ORDER = ['kingDrone', 'gooseQueen', 'megaUfo', 'thunder'];
export const BOSS_EVERY = 4;

function mkBoss(G, level) {
  const kind = BOSS_ORDER[level % BOSS_ORDER.length];
  const e = G.enemies.spawnBoss(kind, pointAhead(G, 420, 560, 0.4, 70, 110), level);
  const d = e.def;
  G.ui.bossBar(e);
  G.ui.notify(`⚠ BOSS INCOMING: ${d.name}!`, 'bad', 5);
  G.audio.zap();
  return objective({
    type: 'boss', reward: 400 + level * 100, noun: d.noun,
    title: `BOSS: ${d.short}`, desc: `${d.desc} Shoot it with Space / click!`,
    caps: new Set(['grow', 'approach', 'easier']),
    signText: ['BOSS FIGHT', 'THAT WAY →'],
    hints: ['Keep shooting (Space or click). Bosses are big, aim is optional.', 'Weave left and right to dodge the orbs.', 'Your hull repairs itself if you avoid hits for 4 seconds.'],
    target() { return e.dead ? null : e.pos; },
    onUpdate(dt, G) {
      G.ui.bossBar(e);
      this.progress = `❤️ Boss HP ${Math.max(0, Math.ceil(e.hp))} / ${e.maxHp}`;
      if (e.hp !== this.lastHp) { if (this.lastHp !== undefined) this.progressed = true; this.lastHp = e.hp; }
      return e.dead ? 'done' : null;
    },
    grow(f) { const k = Math.min(f, 1.4); e.radius *= k; e.mesh.scale.multiplyScalar(k); },
    approach(G, f) { e.pos.lerp(G.player.pos, f * 0.6); },
    easier() { e.hp = Math.max(1, Math.ceil(e.hp * 0.7)); return `${d.short} pulled a muscle. Boss HP -30%. Embarrassing for them, great for you.`; },
    dispose(G) { G.ui.bossBar(null); if (!e.dead) G.enemies.removeEnemy(e); },
  });
}

// ---------- manager ----------

const TYPES = [
  ['hoop', 3, mkHoop], ['chain', 2, mkChain], ['tiny', 1, mkTinyHoop], ['timed', 1, mkTimedHoop],
  ['stars', 2, (G) => mkCollect(G, 'stars')], ['balloons', 1.6, (G) => mkCollect(G, 'balloons')],
  ['goose', 1.5, mkGoose], ['loop', 1.6, mkLoop], ['lowfly', 1, mkLowFly], ['altitude', 0.9, mkAltitude],
  ['buzz', 1.5, mkBuzz], ['hunt', 1.2, mkHunt], ['gate', 1.4, mkGate],
];

export class Objectives {
  constructor(G) {
    this.G = G;
    this.current = null;
    this.recent = [];
    this.completed = 0;
    this.cooldown = 4;
    this.bossLevel = 0;
    this.bossAt = 0;
  }

  next() {
    const G = this.G;
    if (this.completed > 0 && this.completed % BOSS_EVERY === 0 && this.bossAt !== this.completed) {
      this.bossAt = this.completed;
      return this.start(mkBoss(G, this.bossLevel++), 'boss');
    }
    const pool = this.completed === 0 ? TYPES.filter((t) => t[0] === 'hoop') : TYPES.filter((t) => !this.recent.includes(t[0]) && G.zones.allowsObjective(t[0]));
    const [type, , make] = weightedPick(pool, (t) => t[1]);
    this.start(make(G), type);
  }

  start(obj, type) {
    const G = this.G;
    this.recent = [type, ...this.recent].slice(0, 3);
    this.current = obj;
    G.persuasion.reset(obj);
    G.ui.setObjective(obj);
    if (type !== 'boss') G.ui.notify(`${pick(T.newObjective)} ${obj.title}`, 'good', 4);
    G.audio.ding(0.8);
  }

  update(dt) {
    if (!this.current) {
      if (this.G.player.dead) return;
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.next();
      return;
    }
    const r = this.current.update(dt, this.G);
    if (r === 'done') this.complete(false);
    else if (r === 'fail') this.fail();
  }

  complete(forced) {
    const G = this.G, obj = this.current;
    if (!obj) return;
    const stage = G.persuasion.stage;
    let reward = forced ? 10 : obj.reward;
    const lines = [];
    if (!forced) {
      if (obj.t < 25) { reward += 60; lines.push('Speed bonus! +60 (show-off)'); }
      if (stage > 0) {
        const fee = Math.min(reward - 20, stage * 12);
        reward -= fee;
        lines.push(`Hand-holding fee: -${fee} (${stage} hint${stage > 1 ? 's' : ''})`);
      } else lines.push('No hints needed! Natural talent!');
    }
    G.score += reward;
    this.completed++;
    G.persuasion.reset(null);
    obj.dispose(G);
    this.current = null;
    this.cooldown = 4;
    G.ui.setObjective(null);
    const changes = G.mutations.celebrate(forced);
    G.ui.banner(forced ? 'PARTICIPATION TROPHY!' : obj.type === 'boss' ? 'BOSS DEFEATED!' : pick(T.successTitle), [`+${reward} points`, ...lines, ...changes.map((c) => '• ' + c)], 6);
    document.getElementById('score').classList.remove('bump');
    void document.getElementById('score').offsetWidth;
    document.getElementById('score').classList.add('bump');
  }

  fail() {
    const G = this.G, obj = this.current;
    G.persuasion.reset(null);
    obj.dispose(G);
    this.current = null;
    this.cooldown = 2.5;
    G.ui.setObjective(null);
    G.ui.notify(pick(T.fail), 'bad', 4);
    G.audio.sad();
  }
}
