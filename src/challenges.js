// More objective types: drifting and shrinking hoops, a shooting gallery, follow-the-leader,
// a ground bullseye, stunt flying (speed, upside down), pest control, survival and a sightseeing tour.
// Same contract as objectives.js: hooks the persuasion system can use on a player who ignores them.
import * as THREE from 'three';
import { makeRing, makeBalloon, makeGoose, makePlane, makeLandmark, disposeTree } from './models.js';
import { pick, rand, T } from './texts.js';
import { objective, pointAhead, groundAt, clearance, inFront, faceFlat, anim, moveToward, spinRing, crossRing, BUZZ } from './objectives.js';

const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// ---------- hoops with attitude ----------

export function mkMovingHoop(G) {
  const R = 18;
  const ring = makeRing(R, '#7aff6a');
  const holder = new THREE.Object3D(); // the hoop's anchor; persuasion moves this, the hoop wanders around it
  holder.position.copy(pointAhead(G, 380, 560, 0.9, 60, 110));
  ring.position.copy(holder.position);
  faceFlat(ring, G.player.pos);
  G.scene.add(ring);
  const eight = Math.random() < 0.5;
  let amp = 1;
  return objective({
    type: 'moving', reward: 190, noun: 'the wandering hoop',
    title: pick(['The Hoop That Wanders', 'Catch Me If You Hoop', 'Restless Ring']),
    desc: pick(['This hoop has places to be. Fly through it while it drifts around.', 'A hoop that cannot sit still. Time your approach.']),
    caps: new Set(['grow', 'approach', 'teleport', 'easier']),
    signText: ['MOVING HOOP', 'THAT WAY →'],
    hints: ['Aim for where the hoop is GOING, not where it is.', 'Let go of boost near it and line it up calmly.'],
    target() { return ring.position; },
    onUpdate(dt, G) {
      spinRing(ring, dt, this.t);
      anim(holder, dt);
      anim(ring, dt);
      const t = this.t;
      if (eight) _a.set(Math.sin(t * 0.45) * 55, Math.sin(t * 0.9) * 18, Math.sin(t * 0.9) * 25);
      else _a.set(Math.sin(t * 0.6) * 30, Math.sin(t * 0.8) * 35, 0);
      ring.position.copy(holder.position).addScaledVector(_a, amp);
      ring.position.y = Math.max(ring.position.y, clearance(G, ring.position.x, ring.position.z, 20) + 25);
      if (G.player.pos.distanceTo(ring.position) > 150) faceFlat(ring, G.player.pos, dt);
      const r = crossRing(ring, G.player.prevPos, G.player.pos, R);
      if (r === 'hit') return 'done';
      if (r === 'miss') G.ui.notify(pick(T.nearMiss), 'warn', 2.5, 0);
      return null;
    },
    grow(f) { ring.userData.tscale = Math.min((ring.userData.tscale || 1) * f, 6); },
    approach(G, f) { moveToward(G, holder, f); },
    teleport(G) { holder.userData.tpos = null; holder.position.copy(inFront(G, 190)); faceFlat(ring, G.player.pos); },
    easier() { amp *= 0.5; return 'The hoop had a nice cup of tea. It drifts much less now.'; },
    dispose(G) { G.scene.remove(ring); disposeTree(ring); },
  });
}

export function mkShrinkHoop(G) {
  const R = 16, START = 2.4, MIN = 0.3;
  const ring = makeRing(R, '#ff9a3a');
  ring.position.copy(pointAhead(G, 380, 560, 0.9));
  faceFlat(ring, G.player.pos);
  G.scene.add(ring);
  let size = START, rate = 0.03, warned = false;
  return objective({
    type: 'shrink', reward: 170, noun: 'the shrinking hoop',
    title: pick(['The Incredible Shrinking Hoop', 'Hoop On A Diet', 'Going, Going…']),
    desc: 'This hoop is shrinking. Fly through it before it disappears completely. No pressure.',
    caps: new Set(['grow', 'approach', 'teleport', 'easier']),
    signText: ['SHRINKING', 'HOOP →', 'HURRY!'],
    target() { return ring.position; },
    onUpdate(dt, G) {
      spinRing(ring, dt, this.t);
      anim(ring, dt);
      size -= dt * rate;
      ring.scale.setScalar(Math.max(MIN, size));
      if (G.player.pos.distanceTo(ring.position) > 150) faceFlat(ring, G.player.pos, dt);
      this.progress = `🔍 Hoop size: ${Math.max(0, Math.round((size / START) * 100))}%`;
      if (size < 0.8 && !warned) { warned = true; G.ui.notify('The hoop is tiny now. Last chance!', 'warn'); }
      if (size <= MIN) return 'fail';
      const r = crossRing(ring, G.player.prevPos, G.player.pos, R); // worldToLocal already accounts for the scale
      if (r === 'hit') return 'done';
      if (r === 'miss') G.ui.notify(pick(T.nearMiss), 'warn', 2.5, 0);
      return null;
    },
    grow(f) { size = Math.min(size * f, 3.5); warned = false; },
    approach(G, f) { moveToward(G, ring, f); },
    teleport(G) { ring.userData.tpos = null; ring.position.copy(inFront(G, 170)); faceFlat(ring, G.player.pos); },
    easier() { rate *= 0.5; return 'We told the hoop to stop dieting. It shrinks half as fast now.'; },
    dispose(G) { G.scene.remove(ring); disposeTree(ring); },
  });
}

// ---------- shooting gallery: balloons you have to SHOOT ----------

export function mkGallery(G) {
  const n = 6;
  const center = pointAhead(G, 380, 520, 0.6, 50, 100);
  const colors = ['#ff4d6d', '#ffd23a', '#4dd6ff', '#7aff6a', '#c77dff', '#ff9a3a'];
  const items = [];
  for (let k = 0; k < n; k++) {
    const m = makeBalloon(colors[k % colors.length]);
    m.position.copy(center).add(new THREE.Vector3(rand(-70, 70), rand(-25, 35), rand(-70, 70)));
    m.position.y = Math.max(m.position.y, clearance(G, m.position.x, m.position.z, 10) + 25);
    m.userData.phase = Math.random() * 10;
    G.scene.add(m);
    items.push(m);
  }
  let got = 0, scale = 1;
  const alive = () => items.filter((m) => !m.userData.got);
  return objective({
    type: 'gallery', reward: 170, noun: 'the target balloons',
    title: pick(['Shooting Gallery', 'Balloon Sniper', 'Carnival Of Pop']),
    desc: `${n} balloons. SHOOT them (Space / click). Flying into them is cheating and they will tell everyone.`,
    caps: new Set(['grow', 'approach', 'teleport']),
    signText: ['TARGETS', 'SHOOT THEM →'],
    hints: ['Point your nose at a balloon and hold Space.', 'Bullets travel far. Start shooting early.'],
    target() {
      let best = null, bd = Infinity;
      for (const m of alive()) { const d = m.position.distanceToSquared(G.player.pos); if (d < bd) { bd = d; best = m; } }
      return best ? best.position : null;
    },
    onUpdate(dt, G) {
      this.progress = `🎯 ${got} / ${n} popped`;
      const bullets = G.player.bullets;
      for (const m of alive()) {
        anim(m, dt);
        const ph = this.t + m.userData.phase;
        m.position.x += Math.sin(ph * 0.7) * dt * 6; // gentle sway: a moving target
        m.position.y += Math.sin(ph) * dt * 3;
        const r2 = (6 * scale) ** 2;
        for (let b = bullets.length - 1; b >= 0; b--) {
          if (bullets[b].pos.distanceToSquared(_b.copy(m.position).setY(m.position.y + 1)) > r2) continue;
          G.player.removeBullet(b);
          m.userData.got = true;
          m.visible = false;
          got++;
          this.progressed = true;
          G.score += 10;
          G.fx.confetti(m.position);
          G.audio.pop();
          break;
        }
      }
      return got >= n ? 'done' : null;
    },
    grow(f) { scale = Math.min(scale * f, 4); for (const m of items) m.userData.tscale = scale; },
    approach(G, f) { for (const m of alive()) moveToward(G, m, f, 20); },
    teleport(G) {
      const c = inFront(G, 220);
      alive().forEach((m, k) => { m.userData.tpos = null; m.position.copy(c).add(new THREE.Vector3(Math.cos(k * 1.3) * 35, Math.sin(k) * 15, Math.sin(k * 1.3) * 35)); });
    },
    dispose(G) { for (const m of items) { G.scene.remove(m); disposeTree(m); } },
  });
}

// ---------- follow the leader ----------

const LEADERS = [
  { name: 'Larry', noun: 'Larry', title: ['Follow Larry', 'Wingman Duty', 'Larry\'s Scenic Route'],
    desc: 'Larry is Gary\'s nice cousin. He\'s giving you a tour. Stay close to him.' },
  { name: 'Professor Honk', noun: 'Professor Honk', title: ['Follow Professor Honk', 'Goose Migration Practice', 'The Honk Tour'],
    desc: 'A wise goose wants to show you the way. Stay in formation. Do not honk back.' },
];

export function mkFollow(G) {
  const L = pick(LEADERS);
  const goose = L.name !== 'Larry';
  const leader = new THREE.Group();
  if (goose) leader.add(makeGoose());
  else {
    const plane = makePlane();
    plane.setSkin({ body: '#3ad8ff', wing: '#ffffff', accent: '#ffd23a' });
    plane.group.rotation.y = Math.PI; // the plane model flies toward -Z, the leader moves along +Z
    plane.group.scale.setScalar(1.3);
    leader.add(plane.group);
    leader.userData.prop = plane.prop;
  }
  const f = new THREE.Vector3(G.player.forward.x, 0, G.player.forward.z).normalize();
  leader.position.copy(G.player.pos).addScaledVector(f, 220);
  leader.position.y = Math.max(leader.position.y, clearance(G, leader.position.x, leader.position.z) + 60);
  G.scene.add(leader);
  const heading = f.clone(), vel = f.clone().multiplyScalar(44);
  let need = 14, near = 90, time = 0, wasClose = false;
  return objective({
    type: 'follow', reward: 190, noun: L.noun,
    title: pick(L.title), desc: L.desc,
    caps: new Set(['easier', 'approach', 'teleport']),
    signText: [L.name.toUpperCase(), 'IS THAT WAY →'],
    hints: [`Boost to catch up, then match ${L.name}'s turns.`, `You only need to stay within ${near} m. Not ON him.`],
    target() { return leader.position; },
    onUpdate(dt, G) {
      const p = G.player, d = p.pos.distanceTo(leader.position);
      // Rubber band: speeds up when you're on his tail, waits for you when you fall behind.
      const speed = d < 50 ? 54 : d > 160 ? 34 : 44;
      heading.applyAxisAngle(Y, Math.sin(this.t * 0.25) * 0.35 * dt);
      const want = heading.clone().multiplyScalar(speed);
      const ground = clearance(G, leader.position.x + heading.x * 80, leader.position.z + heading.z * 80, 25);
      want.y = THREE.MathUtils.clamp((ground + 70 + Math.sin(this.t * 0.4) * 30 - leader.position.y) * 0.5, -12, 16);
      vel.lerp(want, 1 - Math.exp(-dt * 1.5));
      leader.position.addScaledVector(vel, dt);
      anim(leader, dt);
      leader.lookAt(_a.copy(leader.position).add(vel));
      const u = leader.children[0].userData;
      if (u.wings) { const k = Math.sin(this.t * 10) * 0.6; u.wings[0].rotation.z = -k; u.wings[1].rotation.z = k; }
      if (leader.userData.prop) leader.userData.prop.rotation.z += dt * 40;
      if (Math.random() < dt * 12) G.fx.emit(leader.position, 1, { color: '#ffffff', speed: 2, life: 1.6, size: 5 });
      const close = !p.dead && d < near;
      if (close) { time += dt; this.progressed = true; if (!wasClose) G.ui.notify(`In formation with ${L.name}! Stay there.`, 'info', 2, 0); }
      wasClose = close;
      this.progress = `🤝 ${time.toFixed(1)} / ${need}s near ${L.name} (${Math.round(d)} m)`;
      return time >= need ? 'done' : null;
    },
    approach(G, f) { leader.position.lerp(G.player.pos, f * 0.7); },
    teleport(G) { leader.position.copy(inFront(G, 120)); heading.set(G.player.forward.x, 0, G.player.forward.z).normalize(); },
    easier() { near += 40; need = Math.max(6, need - 3); return `${L.name} agreed that "close" can mean ${near} m. He\'s very understanding.`; },
    dispose(G) { G.scene.remove(leader); disposeTree(leader); },
  });
}

// ---------- ground target ----------

function makeTarget(R) {
  const g = new THREE.Group();
  const colors = ['#ff3a4a', '#ffffff', '#ff3a4a', '#ffffff', '#ffd23a'];
  colors.forEach((c, k) => {
    const r1 = R * (1 - k / colors.length), r0 = R * (1 - (k + 1) / colors.length);
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.05 * k;
    g.add(m);
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 30, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  pole.position.y = 15;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshBasicMaterial({ color: '#ff3a4a', side: THREE.DoubleSide }));
  flag.position.set(5, 26, 0);
  g.add(pole, flag);
  return g;
}

export function mkBullseye(G) {
  const R = 24;
  let spot = pointAhead(G, 450, 650, 0.7);
  for (let k = 0; k < 20 && !G.enemies.isGentleGround(spot.x, spot.z); k++) spot = pointAhead(G, 450, 650, 0.7);
  const target = makeTarget(R);
  target.position.set(spot.x, groundAt(G, spot.x, spot.z) + 1, spot.z);
  G.scene.add(target);
  let need = 10, hits = 0, scale = 1;
  return objective({
    type: 'bullseye', reward: 160, noun: 'the bullseye',
    title: pick(['Bullseye!', 'Target Practice', 'Ground Control To Major Bullet']),
    desc: `A giant target is painted on the ground. Shoot it ${need} times. Dive at it, guns blazing, then PULL UP.`,
    caps: new Set(['grow', 'approach', 'teleport', 'easier']),
    signText: ['BULLSEYE', 'SHOOT IT →'],
    hints: ['Point your nose down at the target and hold Space. Then pull up. PULL UP.', 'Start the dive from high up: more time to shoot.'],
    target() { return _b.set(target.position.x, target.position.y + 10, target.position.z); },
    onUpdate(dt, G) {
      anim(target, dt);
      if (target.userData.tpos) target.userData.tpos.y = groundAt(G, target.userData.tpos.x, target.userData.tpos.z) + 1;
      const bullets = G.player.bullets, r = R * scale;
      for (let b = bullets.length - 1; b >= 0; b--) {
        const bp = bullets[b].pos;
        if (bp.y - target.position.y > 18 || Math.hypot(bp.x - target.position.x, bp.z - target.position.z) > r) continue;
        G.player.removeBullet(b);
        hits++;
        this.progressed = true;
        G.fx.sparkle(bp, '#ffd23a');
        G.audio.ding(1 + hits * 0.05);
      }
      this.progress = `🎯 ${Math.min(hits, need)} / ${need} hits`;
      return hits >= need ? 'done' : null;
    },
    grow(f) { scale = Math.min(scale * f, 3); target.userData.tscale = scale; },
    approach(G, f) { moveToward(G, target, f, 0); },
    teleport(G) { const p = inFront(G, 280); target.userData.tpos = null; target.position.set(p.x, groundAt(G, p.x, p.z) + 1, p.z); },
    easier() { need = Math.max(hits + 2, need - 3); return `Only ${need} hits needed now. The target felt sorry for you.`; },
    dispose(G) { G.scene.remove(target); disposeTree(target); },
  });
}

// ---------- stunts ----------

export function mkSpeed(G) {
  const p = G.player;
  let factor = 1.4, need = 5, time = 0;
  return objective({
    type: 'speed', reward: 140, noun: 'the speed limit', virtual: true,
    title: pick(['Need For Speed (Mild)', 'Speeding Ticket Speedrun', 'Gotta Go Fast-ish']),
    desc: 'Go really fast for a few seconds. Boost (Shift), or dive. Ideally not into the ground.',
    caps: new Set(['easier']),
    signText: ['GO FAST', '>>> >>> >>>'],
    hints: ['Hold Shift to boost. Diving adds speed too.', 'Boost runs out: let it recharge, then go again. Time adds up.'],
    onUpdate(dt) {
      const goal = p.baseSpeed * factor;
      if (!p.dead && p.speed >= goal) { time += dt; this.progressed = true; }
      this.progress = `🏎 ${time.toFixed(1)} / ${need}s above ${Math.round(goal * 3.6)} km/h (now ${Math.round(p.speed * 3.6)})`;
      return time >= need ? 'done' : null;
    },
    easier() { factor = Math.max(1.15, factor - 0.1); need = Math.max(2, need - 1); return `Speed limit lowered to ${Math.round(p.baseSpeed * factor * 3.6)} km/h. Basically a brisk jog.`; },
  });
}

export function mkInverted(G) {
  const p = G.player;
  let need = 4, time = 0, was = false;
  return objective({
    type: 'inverted', reward: 150, noun: 'the upside-down', virtual: true,
    title: pick(['Upside Down Appreciation Day', 'Australian Mode', 'Ceiling Is The New Floor']),
    desc: `Fly upside down for ${need} seconds. The world looks better from up there. Down there. You know what we mean.`,
    caps: new Set(['easier']),
    signText: ['FLIP IT', '↻ ↻ ↻'],
    hints: ['Pull up (W) until you\'re upside down at the top of a loop, then LET GO. You\'ll keep flying inverted.', 'Climb a bit first so you have room.'],
    onUpdate(dt, G) {
      const inv = !p.dead && p.up.y < -0.3;
      if (inv) { time += dt; this.progressed = true; if (!was) G.ui.notify('Upside down! Hold it there!', 'info', 2, 0); }
      was = inv;
      this.progress = `🙃 ${time.toFixed(1)} / ${need}s inverted`;
      return time >= need ? 'done' : null;
    },
    easier() { need = Math.max(1.5, need - 1); return `Only ${need} seconds upside down now. Blood rushing to the head is optional.`; },
  });
}

// ---------- enemy objectives ----------

export function mkPest(G) {
  const start = G.stats.kills;
  let need = 5;
  G.enemies.spawnTimer = Math.min(G.enemies.spawnTimer, 1.5);
  const nearest = () => {
    let best = null, bd = Infinity;
    for (const e of G.enemies.list) { if (e.quest) continue; const d = e.pos.distanceToSquared(G.player.pos); if (d < bd) { bd = d; best = e; } }
    return best;
  };
  return objective({
    type: 'pest', reward: 170, noun: 'the pests', needsEnemies: true,
    title: pick(['Pest Control', 'Sky Cleanup Crew', 'Exterminator Training']),
    desc: `Shoot down ${need} enemies. Any kind. The sky would like its personal space back.`,
    caps: new Set(['easier']),
    signText: ['PESTS', 'THAT WAY →'],
    hints: ['Enemies with a red marker are fair game. Hold Space.', 'Glowing parts are weak spots. Aim there.'],
    target() { return nearest()?.pos || null; },
    onUpdate() {
      const got = G.stats.kills - start;
      if (got !== this.last) { if (this.last !== undefined) this.progressed = true; this.last = got; }
      if (G.enemies.spawnTimer > 2 && G.enemies.list.every((e) => e.quest)) G.enemies.spawnTimer = 2; // nobody to shoot? send someone
      this.progress = `🪳 ${Math.min(got, need)} / ${need} shot down`;
      return got >= need ? 'done' : null;
    },
    easier() { need = Math.max(G.stats.kills - start + 1, need - 2); return `Quota lowered to ${need}. The pests unionized.`; },
  });
}

export function mkSurvive(G) {
  let need = 40, time = 0;
  G.enemies.frenzy = true;
  return objective({
    type: 'survive', reward: 200, noun: 'the onslaught', virtual: true, needsEnemies: true,
    title: pick(['Hold The Line', 'Survive The Rush Hour', 'Enemy Party (You Are The Piñata)']),
    desc: `Enemies are coming in twice as fast. Survive ${need} seconds without getting shot down. Shooting back is encouraged.`,
    caps: new Set(['easier']),
    signText: ['SURVIVE!', '(GOOD LUCK)'],
    hints: ['Keep moving: weaving makes you harder to hit.', 'Your hull repairs itself if you avoid hits for 4 seconds.'],
    onUpdate(dt, G) {
      if (G.player.dead) { if (time > 0) G.ui.notify('Shot down! The survival clock starts over.', 'bad', 3); time = 0; }
      else { time += dt; this.progressed = true; }
      this.progress = `🛡 ${time.toFixed(0)} / ${need}s survived`;
      return time >= need ? 'done' : null;
    },
    easier() { need = Math.max(15, need - 10); return `Survival time cut to ${need} seconds. The enemies are getting tired too.`; },
    dispose(G) { G.enemies.frenzy = false; },
  });
}

// ---------- sightseeing tour: several landmarks in order ----------

export function mkTour(G) {
  const stops = [...BUZZ].sort(() => Math.random() - 0.5).slice(0, 3);
  const f = new THREE.Vector3(G.player.forward.x, 0, G.player.forward.z).normalize();
  let at = G.player.pos.clone().addScaledVector(f, 420);
  const sites = stops.map(([kind, name]) => {
    const g = new THREE.Group();
    const m = makeLandmark(kind, rand(4, 5.5));
    g.add(m);
    g.position.set(at.x, groundAt(G, at.x, at.z) - 2, at.z);
    G.scene.add(g);
    f.applyAxisAngle(Y, rand(-0.9, 0.9));
    at = at.clone().addScaledVector(f, rand(300, 380));
    return { g, m, name };
  });
  let idx = 0, R = 60;
  const top = new THREE.Vector3();
  const cur = () => sites[idx];
  return objective({
    type: 'tour', reward: 220, noun: 'the next sight',
    title: pick(['Sightseeing Tour', 'The Grand Tour Of Weird Stuff', 'Tourist Trap Express']),
    desc: `Visit ${sites.map((s) => `the ${s.name}`).join(', then ')}. In that order. Photos encouraged.`,
    caps: new Set(['grow', 'approach', 'teleport']),
    signText: ['TOUR', 'NEXT STOP →'],
    target() { const s = cur(); return top.set(s.g.position.x, s.g.position.y + s.m.userData.height * s.g.scale.x + 15, s.g.position.z); },
    onUpdate(dt, G) {
      for (const s of sites) { anim(s.g, dt); s.g.rotation.y += dt * 0.2; }
      const s = cur();
      if (s.g.userData.tpos) s.g.userData.tpos.y = groundAt(G, s.g.userData.tpos.x, s.g.userData.tpos.z) - 2;
      const d = G.player.pos.distanceTo(this.target());
      this.progress = `📸 Stop ${idx + 1} / ${sites.length}: the ${s.name}${d < R * 3 ? ' (closer…)' : ''}`;
      if (G.player.dead || d >= R) return null;
      G.fx.sparkle(top, '#ffd23a');
      G.audio.ding(1 + idx * 0.15);
      G.ui.notify(`📸 Snap! The ${s.name}: ${pick(['gorgeous', 'breathtaking', 'mildly unsettling', 'a solid 7/10', 'smaller than on the brochure'])}.`, 'good', 3, 0);
      idx++;
      this.progressed = true;
      return idx >= sites.length ? 'done' : null;
    },
    grow(f) { R *= f; for (const s of sites) s.g.userData.tscale = Math.min((s.g.userData.tscale || 1) * Math.sqrt(f), 3); },
    approach(G, f) { moveToward(G, cur().g, f, 0); },
    teleport(G) { const p = inFront(G, 260), g = cur().g; g.userData.tpos = null; g.position.set(p.x, groundAt(G, p.x, p.z) - 2, p.z); },
    dispose(G) { for (const s of sites) { G.scene.remove(s.g); disposeTree(s.g); } },
  });
}
