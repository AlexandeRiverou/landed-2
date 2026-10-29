// Enemies: chasing drones, spiky balloon mines, dive-bombing seagulls, orb-spitting UFOs,
// grumpy storm clouds, bee swarms, ad blimps, sky jellyfish, ground cannons, Rival Pilot Gary,
// and (quest-only) evil pigeons. Regular enemies spawn in a cone in front of the player.
import * as THREE from 'three';
import { makeDrone, makeMine, makeGull, makeUfo, makeStorm, makePigeon, makeGoose, makeCrown, makeBlimp, makeBee, makeJelly, makeCannon, makeRivalJet, disposeTree } from './models.js';
import { pick, rand, T } from './texts.js';

const TYPES = {
  drone: { hp: 2, radius: 5, dmg: 18, speed: 38, make: makeDrone, score: 50, minScore: 0, weight: 3, kamikaze: true, name: 'Angry Drone' },
  mine: { hp: 1, radius: 6, dmg: 25, speed: 10, make: makeMine, score: 30, minScore: 0, weight: 2, kamikaze: true, name: 'Spiky Balloon' },
  gull: { hp: 1, radius: 4, dmg: 8, speed: 58, make: makeGull, score: 25, minScore: 150, weight: 2, kamikaze: true, name: 'Seagull Gang' },
  ufo: { hp: 4, radius: 10, dmg: 15, speed: 34, make: makeUfo, score: 120, minScore: 350, weight: 1.2, kamikaze: false, name: 'UFO' },
  storm: { hp: 6, radius: 22, dmg: 12, speed: 16, make: makeStorm, score: 150, minScore: 650, weight: 0.8, kamikaze: false, name: 'Grumpy Cloud' },
  pigeon: { hp: 2, radius: 5, dmg: 10, speed: 36, make: makePigeon, score: 80, minScore: Infinity, weight: 0, kamikaze: true, name: 'Evil Pigeon' },
  bee: { hp: 1, radius: 3, dmg: 6, speed: 44, make: makeBee, score: 15, minScore: 80, weight: 1.6, kamikaze: true, name: 'Bee Swarm', intro: 'A bee swarm! Not the bees! Okay, the bees.' },
  blimp: { hp: 6, radius: 15, dmg: 15, speed: 12, make: makeBlimp, score: 110, minScore: 220, weight: 1, kamikaze: false, name: 'Ad Blimp', intro: 'An Ad Blimp is dropping "special offers". They explode.' },
  jelly: { hp: 3, radius: 8, dmg: 10, speed: 8, make: makeJelly, score: 70, minScore: 180, weight: 1.2, kamikaze: false, name: 'Sky Jellyfish', intro: 'Sky Jellyfish ahead. Do not hug. They zap up close.' },
  cannon: { hp: 4, radius: 8, dmg: 10, speed: 0, make: makeCannon, score: 100, minScore: 300, weight: 1, kamikaze: false, ground: true, name: 'Grumpy Ground Cannon', intro: 'Grumpy Ground Cannons are shooting at the sky. The sky did nothing wrong.' },
  rival: { hp: 3, radius: 6, dmg: 20, speed: 62, make: makeRivalJet, score: 150, minScore: 450, weight: 0.9, kamikaze: false, name: 'Rival Pilot Gary', intro: 'Rival Pilot Gary has entered the sky. Nobody likes Gary.' },
};
const SWARMS = { gull: 4, bee: 6 };
// Everything enemy-side (movement, shots, attack timers) runs at this pace so the game feels unhurried.
const PACE = 0.85;

let markerMat = null;
function makeMarker() {
  if (!markerMat) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#ff3a4a'; c.strokeStyle = '#ffffff'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(8, 10); c.lineTo(56, 10); c.lineTo(32, 54); c.closePath(); c.stroke(); c.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    markerMat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true, fog: false });
  }
  const m = new THREE.Sprite(markerMat);
  m.scale.set(0.022, 0.022, 1);
  m.renderOrder = 15;
  return m;
}

// Bosses: one shows up every few completed objectives. They orbit you, attack in patterns,
// and get ENRAGED (faster attacks) below half health.
export const BOSSES = {
  kingDrone: {
    make: makeDrone, scale: 5, crownY: 3.2, crownS: 1, radius: 18, hp: 80, speed: 30, orbit: 150, dmg: 20, score: 0,
    name: 'King Drone the Unpleasant', short: 'King Drone', noun: 'King Drone',
    desc: 'A giant drone with a crown and a superiority complex. It summons minions.',
    taunts: ['King Drone: "Kneel before my rotors!"', 'King Drone: "My minions are unionized, but loyal!"', 'King Drone: "I have FOUR propellers. You have ONE. Do the math."'],
    rage: ['Its rotors are spinning with pure spite.', 'It is now buzzing aggressively.'],
  },
  gooseQueen: {
    make: makeGoose, scale: 5, crownY: 5.6, crownS: 1, radius: 16, hp: 80, speed: 42, orbit: 130, dmg: 20, score: 0,
    name: 'Her Royal Honkness, the Goose Queen', short: 'The Goose Queen', noun: 'the Goose Queen',
    desc: 'You caught her son. She remembers. She throws golden eggs.',
    taunts: ['Goose Queen: "HONK. (You will pay for the goose incident.)"', 'Goose Queen: "My eggs are 24 karat. And pointy."', 'Goose Queen: "HOOOOONK."'],
    rage: ['She has entered her HONK ERA.', 'Feathers are flying. Mostly hers.'],
  },
  megaUfo: {
    make: makeUfo, scale: 4, crownY: 4.5, crownS: 1.2, radius: 30, hp: 95, speed: 26, orbit: 190, dmg: 20, score: 0,
    name: 'The Mothership (Mildly Rude)', short: 'The Mothership', noun: 'the Mothership',
    desc: 'The UFOs called their mom. She fires orb shotguns.',
    taunts: ['Mothership: "We come in peace. Just kidding."', 'Mothership: "Your planet\'s Wi-Fi is terrible."', 'Mothership: "Prepare to be mildly probed."'],
    rage: ['The Mothership has switched to "angry disco" mode.', 'All the little lights are blinking menacingly.'],
  },
  thunder: {
    make: makeStorm, scale: 2.5, crownY: 13, crownS: 2.2, radius: 38, hp: 110, speed: 22, orbit: 110, dmg: 20, score: 0,
    name: 'Thunderclaus, Cloud of Bad Moods', short: 'Thunderclaus', noun: 'Thunderclaus',
    desc: 'The grumpiest cloud ever. Lightning up close, hail from afar.',
    taunts: ['Thunderclaus: "I am NOT a fluffy cloud."', 'Thunderclaus: "It\'s going to rain. On YOU. Specifically."', 'Thunderclaus: "Brrrrumble. That means \'go away\'."'],
    rage: ['Thunderclaus is now a category 5 grump.', 'The forecast says: extremely angry.'],
  },
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Enemies {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.shots = [];
    this.spawnTimer = 6;
    this.calmTimer = 0;
    this.hats = false;
    this.orbGeo = new THREE.SphereGeometry(1.6, 8, 6);
    this.orbMat = new THREE.MeshBasicMaterial({ color: '#7aff5a' });
    this.introduced = new Set();
    this.orbMats = new Map();
  }

  spawnBoss(kind, pos, level = 0) {
    const def = BOSSES[kind];
    const mesh = new THREE.Group();
    const body = def.make(false);
    const crown = makeCrown(def.crownS);
    crown.position.y = def.crownY;
    body.add(crown);
    mesh.add(body);
    mesh.scale.setScalar(def.scale);
    mesh.userData = body.userData;
    mesh.position.copy(pos);
    this.G.scene.add(mesh);
    const hp = def.hp + level * 20;
    const e = {
      type: 'boss', kind, def, mesh, pos: mesh.position, vel: new THREE.Vector3(), hp, maxHp: hp, radius: def.radius,
      t: 0, cd: 3, state: 'idle', stateT: 0, quest: true, boss: true, anchor: pos.clone(), dead: false, attacks: 0, tauntT: 6,
    };
    this.list.push(e);
    return e;
  }

  fireOrb(from, dir, speed, dmg, color = '#7aff5a', size = 1) {
    if (!this.orbMats.has(color)) this.orbMats.set(color, new THREE.MeshBasicMaterial({ color }));
    const m = new THREE.Mesh(this.orbGeo, this.orbMats.get(color));
    m.scale.setScalar(size);
    m.position.copy(from);
    this.G.scene.add(m);
    this.shots.push({ mesh: m, pos: m.position, vel: dir.clone().normalize().multiplyScalar(speed), life: 7, dmg, r2: (4 + size * 1.6) ** 2 });
  }

  bossBehave(e, toP, dist, dt) {
    const G = this.G, p = G.player, d = e.def;
    if (!e.enraged && e.hp < e.maxHp / 2) {
      e.enraged = true;
      G.ui.notify(`${d.short} is ENRAGED! ${pick(d.rage)}`, 'bad', 4);
      G.audio.zap();
    }
    const ang = e.t * (e.kind === 'gooseQueen' ? 0.45 : 0.28);
    _w.set(Math.cos(ang) * d.orbit, 25 + Math.sin(e.t * 0.7) * 15, Math.sin(ang) * d.orbit).add(p.pos).sub(e.pos);
    e.vel.lerp(_w.clampLength(0, d.speed * (e.enraged ? 1.25 : 1)), 1 - Math.exp(-dt * 1.2));

    e.tauntT -= dt;
    if (e.tauntT <= 0) { e.tauntT = rand(12, 18); G.ui.notify(pick(d.taunts), 'warn', 3.5, 0); if (e.kind === 'gooseQueen') G.audio.honk(); }

    e.cd -= dt * (e.enraged ? 1.6 : 1);
    if (e.cd > 0 || dist > 650 || p.dead) return;
    e.attacks++;
    const aim = (spread) => _w.copy(toP).normalize().add(new THREE.Vector3(rand(-spread, spread), rand(-spread, spread), rand(-spread, spread)));
    switch (e.kind) {
      case 'kingDrone':
        e.cd = 3;
        for (let k = -1; k <= 1; k++) this.fireOrb(e.pos, aim(0).applyAxisAngle(new THREE.Vector3(0, 1, 0), k * 0.15), 60, 14, '#ff5a3a', 1.3);
        if (e.attacks % 2 === 0 && this.list.filter((x) => x.type === 'drone').length < 4) {
          for (const s of [-1, 1]) this.spawn('drone', e.pos.clone().add(new THREE.Vector3(s * 25, -10, 0)));
          G.ui.notify('King Drone summoned minions. They look nervous.', 'warn', 2.5, 0);
        }
        break;
      case 'gooseQueen':
        e.cd = 2.4;
        for (let k = 0; k < 2; k++) {
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 55) * 0.6).sub(e.pos);
          this.fireOrb(e.pos, lead.add(new THREE.Vector3(rand(-15, 15), rand(-10, 10), rand(-15, 15))), 55, 16, '#ffd23a', 1.6);
        }
        G.audio.honk();
        break;
      case 'megaUfo':
        e.cd = 3.4;
        for (let k = 0; k < 7; k++) this.fireOrb(e.pos, aim(0.22), 52, 12, '#7aff5a', 1.1);
        G.audio.tone(200, 0.4, { type: 'sine', vol: 0.08, slide: 500 });
        break;
      case 'thunder':
        if (dist < 150) {
          e.cd = 2;
          G.fx.lightning(e.pos, p.pos);
          G.audio.zap();
          p.damage(16);
        } else {
          e.cd = 2.6;
          for (let k = 0; k < 3; k++) this.fireOrb(e.pos, aim(0.15), 50, 10, '#cfe8ff', 1);
        }
        break;
    }
  }

  calm(seconds) { this.calmTimer = Math.max(this.calmTimer, seconds); }

  spawn(type, pos, opts = {}) {
    const def = TYPES[type];
    const mesh = def.make(this.hats);
    mesh.position.copy(pos);
    this.G.scene.add(mesh);
    const e = {
      type, def, mesh, pos: mesh.position, vel: new THREE.Vector3(), hp: def.hp, radius: def.radius * (opts.scale || 1),
      t: Math.random() * 10, cd: rand(1, 3), state: 'idle', stateT: 0, quest: !!opts.quest, anchor: opts.anchor ? opts.anchor.clone() : pos.clone(), dead: false,
    };
    if (opts.scale) mesh.scale.setScalar(opts.scale);
    e.marker = makeMarker();
    this.G.scene.add(e.marker);
    this.list.push(e);
    if (!e.quest && !this.introduced.has(type)) {
      this.introduced.add(type);
      this.G.ui.notify(def.intro || `New enemy spotted: ${def.name}. It seems upset about something.`, 'warn', 4, 1);
    }
    return e;
  }

  maybeSpawn(dt) {
    const G = this.G, p = G.player;
    if (this.calmTimer > 0 || p.dead) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = rand(3, 6);
    const max = 3 + Math.min(7, Math.floor(G.score / 400));
    if (this.list.filter((e) => !e.quest).length >= max) return;
    const avail = Object.entries(TYPES).filter(([, d]) => G.score >= d.minScore && d.weight > 0);
    let total = avail.reduce((s, [, d]) => s + d.weight, 0), r = Math.random() * total, type = avail[0][0];
    for (const [k, d] of avail) { r -= d.weight; if (r <= 0) { type = k; break; } }

    _v.set(p.forward.x, 0, p.forward.z);
    if (_v.lengthSq() < 0.01) _v.set(0, 0, -1);
    _v.normalize();
    _w.set(-_v.z, 0, _v.x);
    // Straight ahead, inside the camera's view, so you see them coming.
    const d = rand(300, 500), side = rand(-130, 130);
    const pos = p.pos.clone().addScaledVector(_v, d).addScaledVector(_w, side);
    const g = Math.max(G.terrain.surfaceHeight(pos.x, pos.z), G.world.seaLevel);
    if (TYPES[type].ground) {
      if (G.terrain.surfaceHeight(pos.x, pos.z) < G.world.seaLevel) return; // cannons can't swim
      pos.y = g;
    } else pos.y = Math.max(p.pos.y + rand(-15, 35), g + 45);
    if (SWARMS[type]) {
      for (let k = 0; k < SWARMS[type]; k++) this.spawn(type, pos.clone().add(new THREE.Vector3(rand(-25, 25), rand(-8, 8), rand(-25, 25))));
    } else this.spawn(type, pos);
  }

  update(dt) {
    const G = this.G, p = G.player;
    dt *= PACE * G.powerups.enemyTimeScale(); // Slow-Mo / Time Freeze power-ups
    this.calmTimer = Math.max(0, this.calmTimer - dt);
    this.maybeSpawn(dt);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      e.stateT += dt;
      const toP = _v.subVectors(p.pos, e.pos);
      const dist = toP.length();
      const calm = this.calmTimer > 0 && !e.quest;
      if (!e.quest && dist > 1700) { this.remove(i); continue; }
      if (calm) {
        e.vel.lerp(_w.copy(toP).multiplyScalar(-1).setY(0).normalize().multiplyScalar(60).setY(30), 1 - Math.exp(-dt));
        if (dist > 500) { this.remove(i); continue; }
      } else if (e.boss) this.bossBehave(e, toP, dist, dt);
      else this.behave(e, toP, dist, dt);

      e.pos.addScaledVector(e.vel, dt);
      if (e.def.ground) e.pos.y = G.terrain.surfaceHeight(e.pos.x, e.pos.z) - 0.5;
      else {
        const g = Math.max(G.terrain.surfaceHeight(e.pos.x, e.pos.z), G.world.seaLevel) + (e.boss ? e.radius : 12);
        if (e.pos.y < g) { e.pos.y = g; if (e.vel.y < 0) e.vel.y = 0; }
      }
      this.animate(e, dt);
      if (e.marker) {
        e.marker.position.set(e.pos.x, e.pos.y + e.radius * (e.mesh.scale.x || 1) + 6, e.pos.z);
        e.marker.visible = dist > 70 && !calm;
      }

      // Player contact.
      e.contactCd = Math.max(0, (e.contactCd || 0) - dt);
      if (!p.dead && !calm && dist < e.radius + 4 * p.sizeScale && e.contactCd <= 0) {
        // Mega Plane flattens anything smaller than a boss.
        if (G.powerups.has('mega') && !e.boss) { G.fx.explosion(e.pos); this.kill(i, true); continue; }
        e.contactCd = 1.5; // big enemies bump you once, not every frame
        p.damage(e.def.dmg);
        if (e.def.kamikaze) { G.fx.explosion(e.pos); this.kill(i, false); continue; }
        e.vel.copy(toP).normalize().multiplyScalar(-60);
      }
      // Bullets.
      for (let b = p.bullets.length - 1; b >= 0; b--) {
        if (p.bullets[b].pos.distanceToSquared(e.pos) < (e.radius + 2) ** 2) {
          e.hp -= p.bullets[b].dmg || 1;
          p.removeBullet(b);
          G.fx.sparkle(e.pos, '#ffaa55');
          G.audio.hit();
          if (e.hp <= 0) break;
        }
      }
      if (e.hp <= 0) { G.fx.explosion(e.pos); G.fx.confetti(e.pos); this.kill(i, true); }
    }
    this.updateShots(dt);
  }

  behave(e, toP, dist, dt) {
    const G = this.G, p = G.player, d = e.def;
    const steer = (desired, k = 2) => e.vel.lerp(desired, 1 - Math.exp(-dt * k));
    switch (e.type) {
      case 'drone':
        steer(_w.copy(toP).normalize().multiplyScalar(d.speed).add(new THREE.Vector3(Math.sin(e.t * 2) * 10, Math.cos(e.t * 3) * 6, 0)), 1.5);
        break;
      case 'mine':
        if (dist < 120) steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 1);
        else steer(_w.set(0, Math.sin(e.t) * 3, 0), 1);
        break;
      case 'gull':
        if (e.state === 'idle') {
          steer(_w.set(Math.cos(e.t * 0.8) * 30, Math.sin(e.t) * 4, Math.sin(e.t * 0.8) * 30));
          if (dist < 260) { e.state = 'dive'; e.stateT = 0; }
        } else if (e.state === 'dive') {
          steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 3);
          if (e.stateT > 4) { e.state = 'leave'; e.stateT = 0; }
        } else {
          steer(_w.copy(toP).normalize().multiplyScalar(-d.speed).setY(15), 2);
          if (e.stateT > 5) { e.state = 'idle'; e.stateT = 0; }
        }
        break;
      case 'ufo': {
        _w.copy(toP).setY(0).normalize().multiplyScalar(-170).add(p.pos).setY(p.pos.y + 45).sub(e.pos);
        steer(_w.clampLength(0, d.speed), 1.2);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 450) {
          e.cd = 2.8;
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 65) * 0.5);
          const m = new THREE.Mesh(this.orbGeo, this.orbMat);
          m.position.copy(e.pos);
          G.scene.add(m);
          this.shots.push({ mesh: m, pos: m.position, vel: lead.sub(e.pos).normalize().multiplyScalar(65), life: 6, dmg: TYPES.ufo.dmg, r2: 36 });
          G.audio.tone(300, 0.3, { type: 'sine', vol: 0.06, slide: 400 });
        }
        break;
      }
      case 'storm':
        steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 0.6);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 75 && !p.dead) {
          e.cd = 1.6;
          G.fx.lightning(e.pos, p.pos);
          G.audio.zap();
          p.damage(d.dmg);
        }
        break;
      case 'bee':
        steer(_w.copy(toP).normalize().multiplyScalar(d.speed).add(new THREE.Vector3(Math.sin(e.t * 9) * 18, Math.cos(e.t * 7) * 10, Math.cos(e.t * 8) * 18)), 2.5);
        break;
      case 'blimp':
        _w.copy(p.pos).addScaledVector(p.forward, 120).setY(p.pos.y + 70).sub(e.pos);
        steer(_w.clampLength(0, d.speed), 0.5);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 350) {
          e.cd = 3;
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 45) * 0.5);
          this.fireOrb(e.pos.clone().add(new THREE.Vector3(0, -8, 0)), lead.sub(e.pos), 45, 14, '#ff9a3a', 1.3);
        }
        break;
      case 'jelly':
        steer(_w.copy(toP).setY(0).normalize().multiplyScalar(d.speed).setY(Math.sin(e.t * 0.8) * 6), 0.5);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 55 && !p.dead) {
          e.cd = 1.5;
          G.fx.lightning(e.pos, p.pos);
          G.audio.zap();
          p.damage(d.dmg);
        }
        break;
      case 'cannon':
        e.cd -= dt;
        if (e.cd <= 0 && dist < 420 && !p.dead) {
          e.cd = 2.6;
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 60) * 0.5);
          this.fireOrb(e.pos.clone().add(new THREE.Vector3(0, 5, 0)), lead.sub(e.pos), 60, 12, '#ff4d4d', 1.2);
          G.audio.tone(140, 0.25, { type: 'square', vol: 0.06, slide: -60 });
        }
        break;
      case 'rival':
        if (e.state !== 'extend') {
          steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 1.6);
          e.cd -= dt;
          if (e.cd <= 0 && dist < 260 && e.vel.dot(toP) > 0.8 * e.vel.length() * dist) {
            e.cd = 1.8;
            for (let k = 0; k < 3; k++) setTimeout(() => !e.dead && this.fireOrb(e.pos, _w.copy(p.pos).sub(e.pos), 110, 6, '#ff3ad0', 0.6), k * 120);
          }
          if (dist < 40 || e.stateT > 7) { e.state = 'extend'; e.stateT = 0; }
        } else {
          steer(_w.copy(toP).normalize().multiplyScalar(-d.speed).setY(8), 1.2);
          if (e.stateT > 4) { e.state = 'idle'; e.stateT = 0; }
        }
        break;
      case 'pigeon':
        if (dist < 170 && e.stateT < 4) steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 2);
        else {
          const a = e.t * 0.6;
          _w.set(e.anchor.x + Math.cos(a) * 70, e.anchor.y + Math.sin(e.t * 0.9) * 12, e.anchor.z + Math.sin(a) * 70).sub(e.pos);
          steer(_w.clampLength(0, d.speed), 1.5);
          if (e.stateT > 8) e.stateT = 0;
        }
        break;
    }
  }

  animate(e, dt) {
    const u = e.mesh.userData;
    if (u.rotors) for (const r of u.rotors) r.rotation.y += dt * 30;
    if (u.wings) { const f = Math.sin(e.t * 14) * 0.6; u.wings[0].rotation.z = -f; u.wings[1].rotation.z = f; }
    if (u.lights) u.lights.forEach((l, k) => l.visible = Math.floor(e.t * 6 + k) % 2 === 0);
    if (u.spin) for (const s of u.spin) s.rotation.z += dt * 25;
    if (u.tentacles) u.tentacles.forEach((t, k) => { t.rotation.x = Math.sin(e.t * 2 + k) * 0.35; t.rotation.z = Math.cos(e.t * 1.7 + k) * 0.35; });
    if (u.barrel) u.barrel.lookAt(this.G.player.pos);
    if (e.boss) {
      if (e.kind === 'gooseQueen') e.mesh.lookAt(_w.copy(e.pos).add(e.vel));
      else if (e.kind === 'megaUfo') e.mesh.rotation.y += dt * 1.2;
      else e.mesh.lookAt(this.G.player.pos.x, e.pos.y, this.G.player.pos.z);
      return;
    }
    if (e.type === 'cannon' || e.type === 'jelly') return;
    if (e.type === 'mine' || e.type === 'storm') e.mesh.rotation.y += dt * 0.4;
    if (e.type === 'ufo') e.mesh.rotation.y += dt * 1.5;
    if (e.type === 'drone' || e.type === 'storm') e.mesh.lookAt(this.G.player.pos.x, e.pos.y, this.G.player.pos.z);
    else if (e.vel.lengthSq() > 1 && e.type !== 'mine' && e.type !== 'ufo') e.mesh.lookAt(_w.copy(e.pos).add(e.vel));
  }

  updateShots(dt) {
    const p = this.G.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.pos.addScaledVector(s.vel, dt);
      const hit = !p.dead && s.pos.distanceToSquared(p.pos) < s.r2 * p.sizeScale * p.sizeScale;
      if (hit) p.damage(s.dmg);
      const ground = !hit && s.pos.y < this.G.terrain.surfaceHeight(s.pos.x, s.pos.z);
      if (ground) {
        // Orbs that miss blow holes in the landscape.
        this.G.terrain.deform(s.pos.x, s.pos.z, 5, 2.5);
        this.G.fx.emit(s.pos, 25, { colors: ['#ffb03a', '#8a6a4a', '#555555'], speed: 30, life: 0.8, size: 6, up: 15 });
      }
      if (hit || ground || s.life <= 0) { this.G.scene.remove(s.mesh); this.shots.splice(i, 1); }
    }
  }

  kill(i, byPlayer) {
    const G = this.G, e = this.list[i];
    e.dead = true;
    // Blowing up close to the ground leaves a crater: bosses leave a big one.
    const above = e.pos.y - G.terrain.surfaceHeight(e.pos.x, e.pos.z);
    if (above < e.radius * 2 + 15) G.terrain.deform(e.pos.x, e.pos.z, e.boss ? 26 : 5 + e.radius * 0.5, e.boss ? 12 : 3);
    if (e.boss) {
      for (let k = 0; k < 5; k++) setTimeout(() => G.fx.explosion(e.pos.clone().add(new THREE.Vector3(rand(-20, 20), rand(-15, 15), rand(-20, 20)))), k * 150);
      G.stats.kills++;
      G.powerups.drop(e.pos.clone()); // bosses always drop a power-up
    } else if (byPlayer) {
      G.score += e.def.score;
      G.stats.kills++;
      if (Math.random() < 0.3) G.ui.notify(`${pick(T.kill)} +${e.def.score}`, 'good', 2.5, 0);
    }
    G.audio.explode();
    this.remove(i);
  }

  remove(i) {
    const e = this.list[i];
    e.dead = true;
    this.G.scene.remove(e.mesh);
    if (e.marker) this.G.scene.remove(e.marker);
    disposeTree(e.mesh);
    this.list.splice(i, 1);
  }

  removeEnemy(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.remove(i);
  }
}
