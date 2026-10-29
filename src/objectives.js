// Objective types. Each one exposes hooks (grow / approach / teleport / easier / magnet)
// so the persuasion system can bend it toward a player who is ignoring it.
import * as THREE from 'three';
import { makeRing, setRingColor, makeStar, makeBalloon, makeGoose, makeArch, makeLandmark, disposeTree } from './models.js';
import { pick, rand, T, weightedPick } from './texts.js';
import { BOSSES, BOSS_MODS } from './enemies.js';
import * as C from './challenges.js';

const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _dummy = new THREE.Object3D();

export const groundAt = (G, x, z) => Math.max(G.terrain.surfaceHeight(x, z), G.world.seaLevel);

export function clearance(G, x, z, r = 30) {
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

export function inFront(G, d, minClear = 35) {
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

export function faceFlat(o3, from, dt = 0) {
  _dummy.position.copy(o3.position);
  _dummy.lookAt(from.x, o3.position.y, from.z);
  if (dt) o3.quaternion.slerp(_dummy.quaternion, 1 - Math.exp(-dt * 2));
  else o3.quaternion.copy(_dummy.quaternion);
}

// Smoothly ease toward userData.tpos / userData.tscale.
export function anim(o3, dt) {
  const u = o3.userData;
  if (u.tpos) o3.position.lerp(u.tpos, 1 - Math.exp(-dt * 2.5));
  if (u.tscale) o3.scale.setScalar(THREE.MathUtils.lerp(o3.scale.x, u.tscale, 1 - Math.exp(-dt * 3)));
}

export function moveToward(G, o3, f, minClear = 35) {
  const from = o3.userData.tpos || o3.position;
  const np = from.clone().lerp(G.player.pos, f);
  np.y = Math.max(np.y, clearance(G, np.x, np.z, 25) + minClear);
  o3.userData.tpos = np;
}

export function spinRing(ring, dt, t) {
  const u = ring.userData;
  u.studs.rotation.z += dt * 0.8;
  u.glowMat.opacity = 0.22 + Math.sin(t * 4) * 0.1;
}

export function objective(o) {
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

// Ring chains come in styles: a classic slalom, a corkscrew, a climbing staircase, a long dive,
// or a slalom against the clock.
const CHAIN_STYLES = {
  slalom: { titles: ['Ring Chain', 'The Hoop Highway', 'Slalom Of Destiny'], desc: (n) => `${n} rings in a row. Gold is next. Blue is later. Missing is forever.` },
  spiral: { titles: ['Corkscrew Alley', 'The Spiral Of Mild Nausea', 'Twisty Rings'], desc: (n) => `${n} rings arranged in a corkscrew. Roll with it. Literally.` },
  stairs: { titles: ['Stairway To Heaven', 'Ring Ladder', 'Going Up!'], desc: (n) => `${n} rings, each one higher than the last. Climb, little plane, climb.` },
  dive: { titles: ['The Waterslide', 'Downhill Ring Run', 'Plummet With Style'], desc: (n) => `${n} rings stepping down toward the ground. Dive through them. Pull up after. Please.` },
  trial: { titles: ['Ring Time Trial', 'Hoops Against The Clock', 'Speedrun Any%'], desc: (n) => `${n} rings before the timer runs out. Boost is your friend.` },
};

export function mkChain(G, style = 'slalom') {
  const S = CHAIN_STYLES[style];
  const n = style === 'spiral' ? 7 : 4 + Math.floor(Math.random() * 3);
  const rings = [];
  let p = pointAhead(G, 300, 450, 0.7, style === 'dive' ? 170 : 50, style === 'dive' ? 220 : 100);
  const dir = new THREE.Vector3().subVectors(p, G.player.pos).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const axis = p.clone();
  for (let k = 0; k < n; k++) {
    const r = makeRing(15, k === 0 ? '#ffc23a' : '#7ad8ff');
    r.position.copy(p);
    G.scene.add(r);
    rings.push(r);
    const prev = p.clone();
    if (style === 'spiral') {
      axis.addScaledVector(dir, 95);
      const a = (k + 1) * 1.1;
      p = axis.clone().addScaledVector(side, Math.cos(a) * 40).add(new THREE.Vector3(0, Math.sin(a) * 40, 0));
      p.y = Math.max(p.y, clearance(G, p.x, p.z) + 35);
    } else {
      dir.applyAxisAngle(Y, rand(-0.4, 0.4) * (style === 'slalom' || style === 'trial' ? 1 : 0.5));
      p = p.clone().addScaledVector(dir, rand(120, 150));
      const dy = style === 'stairs' ? rand(28, 38) : style === 'dive' ? -rand(25, 35) : rand(-30, 30);
      p.y = Math.max(prev.y + dy, clearance(G, p.x, p.z) + 35);
    }
    _dummy.position.copy(r.position);
    _dummy.lookAt(k === 0 ? G.player.pos.clone().setY(r.position.y) : rings[k - 1].position);
    r.quaternion.copy(_dummy.quaternion);
  }
  let idx = 0, timeLimit = style === 'trial' ? 20 + n * 9 : 0, warned = false;
  const mark = () => rings.forEach((r, k) => { r.visible = k >= idx; setRingColor(r, k === idx ? '#ffc23a' : '#7ad8ff'); });
  mark();
  return objective({
    type: style === 'slalom' ? 'chain' : style, reward: 80 + n * 25 + (style === 'trial' ? 40 : 0), noun: 'the ring chain',
    title: pick(S.titles), desc: S.desc(n),
    caps: new Set(['grow', 'approach', 'teleport', ...(timeLimit ? ['easier'] : [])]),
    signText: ['RINGS', 'THAT WAY →', '(SEVERAL!)'],
    target() { return rings[idx].position; },
    onUpdate(dt, G) {
      this.progress = `Ring ${idx + 1} / ${n}`;
      if (timeLimit) {
        const left = timeLimit - this.t;
        this.progress += ` · ⏱ ${Math.max(0, left).toFixed(1)}s`;
        if (left < 8 && !warned) { warned = true; G.ui.notify('8 seconds left! The rings are tapping their feet.', 'warn'); }
        if (left <= 0) return 'fail';
      }
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
    easier() { timeLimit += 15; warned = false; return 'The clock got 15 extra seconds. The clock is a softie.'; },
    dispose(G) { for (const r of rings) { G.scene.remove(r); disposeTree(r); } },
  });
}

// ---------- collectibles ----------

// kind 'stars' / 'balloons' scatter around a spot; 'trail' lays a long wiggly line of stars to follow.
function mkCollect(G, kind) {
  const trail = kind === 'trail';
  const stars = kind === 'stars' || trail;
  const n = trail ? 10 : stars ? 6 : 5;
  const center = pointAhead(G, 420, 620, 0.8, 60, 130);
  const items = [];
  const colors = ['#ff4d6d', '#ffd23a', '#4dd6ff', '#7aff6a', '#c77dff'];
  const start = trail ? pointAhead(G, 260, 340, 0.5, 50, 90) : null;
  const dir = trail ? new THREE.Vector3().subVectors(start, G.player.pos).setY(0).normalize() : null;
  for (let k = 0; k < n; k++) {
    const m = stars ? makeStar() : makeBalloon(colors[k % colors.length]);
    if (trail) {
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      m.position.copy(start).addScaledVector(dir, k * 55).addScaledVector(side, Math.sin(k * 0.8) * 45);
      m.position.y += Math.sin(k * 0.55) * 30;
    } else {
      const a = (k / n) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(60, 190);
      m.position.set(center.x + Math.cos(a) * r, center.y + rand(-30, 50), center.z + Math.sin(a) * r);
    }
    m.position.y = Math.max(m.position.y, clearance(G, m.position.x, m.position.z, 10) + 25);
    m.userData.phase = Math.random() * 10;
    G.scene.add(m);
    items.push(m);
  }
  let got = 0, scale = 1, magnet = false;
  const alive = () => items.filter((m) => !m.userData.got);
  return objective({
    type: kind, reward: trail ? 180 : stars ? 150 : 140, noun: trail ? 'the star trail' : stars ? 'the stars' : 'the balloons',
    title: trail ? pick(['Star Trail', 'Follow The Shiny Road', 'Twinkle Highway']) : stars ? pick(['Star Collector', 'Twinkle Twinkle Grab That Star', 'Shiny Things Department']) : pick(['Balloon Popper', 'Party Pooper', 'Pop Goes The Balloon']),
    desc: trail ? `A wiggly trail of ${n} stars. Follow it like breadcrumbs, but shinier.` : stars ? `Collect ${n} stars. They're not real stars. Please don't tell them.` : `Pop ${n} balloons by flying into them. They knew the risks.`,
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

export const BUZZ = [
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
    type: 'hunt', reward: 200, noun: 'the evil pigeons', needsEnemies: true,
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

export const BOSS_EVERY = 3;
// The first two bosses are the gentler classics; after that, anything goes.
const OPENERS = ['kingDrone', 'gooseQueen'];

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

// Where a boss appears: in the air ahead, or (for the fort) on flat, dry land ahead. Null when there's none.
function bossSpot(G, def) {
  if (!def.ground) return pointAhead(G, 420, 560, 0.4, 70, 110);
  if (G.zones.current.noGround) return null;
  const flat = (x, z) => G.enemies.isGentleGround(x, z) && [[15, 0], [-15, 0], [0, 15], [0, -15]].every(([dx, dz]) => G.enemies.isGentleGround(x + dx, z + dz));
  for (let k = 0; k < 80; k++) {
    const s = pointAhead(G, 380, 750, 1.1);
    const g = G.terrain.surfaceHeight(s.x, s.z);
    if (g > G.world.seaLevel + 2 && flat(s.x, s.z)) return s.setY(g);
  }
  return null;
}

function mkBoss(G, level, kind, spot, { mod = null, duo = false } = {}) {
  const def = BOSSES[kind], M = BOSS_MODS[mod] || null;
  const side = new THREE.Vector3(-G.player.forward.z, 0, G.player.forward.x).normalize();
  const list = duo
    ? [-1, 1].map((s, k) => G.enemies.spawnBoss(kind, spot.clone().addScaledVector(side, s * 60), level, { mod, hp: 0.6, size: 0.8, phase: k * Math.PI }))
    : [G.enemies.spawnBoss(kind, spot, level, { mod })];
  const lead = list[0];
  const name = duo ? `The ${lead.short} Twins` : lead.name;
  const alive = () => list.filter((e) => !e.dead);
  const bar = () => {
    let hp = 0, maxHp = 0;
    for (const e of list) { maxHp += e.maxHp; if (!e.dead) hp += Math.max(0, e.hp); }
    return { name, hp, maxHp, enraged: alive().some((e) => e.enraged) };
  };
  G.ui.bossBar(bar());
  G.ui.notify(`⚠ BOSS INCOMING: ${name}!${M ? ` ${M.text}` : ''}${duo ? ' There are TWO of them.' : ''}`, 'bad', 5);
  G.audio.zap();
  return objective({
    type: 'boss', boss: kind, needsEnemies: true, noun: duo ? `the ${lead.short} twins` : def.noun,
    reward: Math.round((400 + level * 100) * (M?.score || 1) * (duo ? 1.5 : 1)),
    title: `BOSS: ${duo ? `${lead.short} ×2` : lead.short}`,
    desc: `${duo ? 'Double trouble! Two of them, each a bit smaller. ' : ''}${def.desc} Shoot it with Space / click!`,
    caps: new Set(['grow', 'approach', 'easier']),
    signText: ['BOSS FIGHT', 'THAT WAY →'],
    hints: ['Keep shooting (Space or click). Bosses are big, aim is optional.', 'Weave left and right to dodge the orbs.', 'Your hull repairs itself if you avoid hits for 4 seconds.', 'Glowing parts are weak spots. Knock the crown off for extra damage.'],
    target() {
      let best = null, bd = Infinity;
      for (const e of alive()) { const d = e.pos.distanceToSquared(G.player.pos); if (d < bd) { bd = d; best = e; } }
      return best ? best.pos : null;
    },
    onUpdate(dt, G) {
      const b = bar();
      G.ui.bossBar(b);
      this.progress = `❤️ Boss HP ${Math.ceil(b.hp)} / ${b.maxHp}`;
      if (b.hp !== this.lastHp) { if (this.lastHp !== undefined) this.progressed = true; this.lastHp = b.hp; }
      return alive().length ? null : 'done';
    },
    grow(f) { const k = Math.min(f, 1.4); for (const e of alive()) { e.radius *= k; e.mesh.scale.multiplyScalar(k); } },
    approach(G, f) { for (const e of alive()) e.pos.lerp(G.player.pos, f * 0.6); },
    easier() { for (const e of alive()) e.hp = Math.max(1, Math.ceil(e.hp * 0.7)); return `${lead.short} pulled a muscle. Boss HP -30%. Embarrassing for them, great for you.`; },
    dispose(G) { G.ui.bossBar(null); for (const e of alive()) G.enemies.removeEnemy(e); },
  });
}

// ---------- manager ----------

const TYPES = [
  ['hoop', 3, mkHoop], ['chain', 1.6, (G) => mkChain(G, 'slalom')], ['tiny', 1, mkTinyHoop], ['timed', 1, mkTimedHoop],
  ['spiral', 1, (G) => mkChain(G, 'spiral')], ['stairs', 0.9, (G) => mkChain(G, 'stairs')], ['dive', 0.9, (G) => mkChain(G, 'dive')],
  ['trial', 0.9, (G) => mkChain(G, 'trial')], ['moving', 1.3, C.mkMovingHoop], ['shrink', 1.1, C.mkShrinkHoop],
  ['stars', 1.6, (G) => mkCollect(G, 'stars')], ['balloons', 1.3, (G) => mkCollect(G, 'balloons')], ['trail', 1.3, (G) => mkCollect(G, 'trail')],
  ['gallery', 1.3, C.mkGallery], ['goose', 1.4, mkGoose], ['follow', 1.3, C.mkFollow],
  ['loop', 1.4, mkLoop], ['inverted', 1, C.mkInverted], ['speed', 1, C.mkSpeed], ['lowfly', 1, mkLowFly], ['altitude', 0.9, mkAltitude],
  ['buzz', 1.4, mkBuzz], ['tour', 1, C.mkTour], ['gate', 1.3, mkGate], ['bullseye', 1.1, C.mkBullseye],
  ['hunt', 1.1, mkHunt], ['pest', 1, C.mkPest], ['survive', 0.8, C.mkSurvive],
];
export const OBJECTIVE_TYPES = TYPES.map((t) => t[0]);

export class Objectives {
  constructor(G) {
    this.G = G;
    this.current = null;
    this.recent = [];
    this.completed = 0;
    this.cooldown = 4;
    this.bossLevel = 0;
    this.bossAt = 0;
    this.bossDeck = [...shuffle([...OPENERS]), ...shuffle(Object.keys(BOSSES).filter((k) => !OPENERS.includes(k)))];
    this.pendingBoss = false; // a boss interrupted by relax mode comes back first
  }

  // Next boss from the deck that fits the current zone (no fort in space). Reshuffles when it runs out.
  makeBoss(kind = null, opts = null) {
    const G = this.G;
    let spot = null;
    if (kind) spot = bossSpot(G, BOSSES[kind]);
    else {
      if (!this.bossDeck.length) this.bossDeck = shuffle(Object.keys(BOSSES));
      for (let i = 0; i < this.bossDeck.length && !spot; i++) {
        spot = bossSpot(G, BOSSES[this.bossDeck[i]]);
        if (spot) kind = this.bossDeck.splice(i, 1)[0];
      }
    }
    if (!spot) { kind = 'kingDrone'; spot = bossSpot(G, BOSSES[kind]); }
    const level = this.bossLevel++;
    opts ??= {
      mod: level >= 2 && Math.random() < 0.5 ? pick(Object.keys(BOSS_MODS)) : null,
      duo: level >= 3 && !BOSSES[kind].ground && Math.random() < 0.3,
    };
    return mkBoss(G, level, kind, spot, opts);
  }

  next() {
    const G = this.G;
    if (this.pendingBoss || (this.completed > 0 && this.completed % BOSS_EVERY === 0 && this.bossAt !== this.completed)) {
      this.bossAt = this.completed;
      this.pendingBoss = false;
      return this.start(this.makeBoss(), 'boss');
    }
    const pool = this.completed === 0 ? TYPES.filter((t) => t[0] === 'hoop') : TYPES.filter((t) => !this.recent.includes(t[0]) && G.zones.allowsObjective(t[0]));
    const [type, , make] = weightedPick(pool, (t) => t[1]);
    this.start(make(G), type);
  }

  start(obj, type) {
    const G = this.G;
    this.recent = [type, ...this.recent].slice(0, 4);
    this.current = obj;
    G.persuasion.reset(obj);
    G.ui.setObjective(obj);
    if (type !== 'boss') G.ui.notify(`${pick(T.newObjective)} ${obj.title}`, 'good', 4);
    G.audio.ding(0.8);
  }

  // Relax mode: the objective quietly leaves (no penalty). An interrupted boss returns first afterwards.
  suspend() {
    const G = this.G, obj = this.current;
    this.cooldown = 3;
    if (!obj) return;
    if (obj.type === 'boss') { this.pendingBoss = true; this.bossLevel--; this.bossDeck.unshift(obj.boss); }
    G.persuasion.reset(null);
    obj.dispose(G);
    this.current = null;
    G.ui.setObjective(null);
  }

  update(dt) {
    if (this.G.relax) return;
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
