// Enemies: chasing drones, spiky balloon mines, dive-bombing seagulls, orb-spitting UFOs,
// grumpy storm clouds, and (quest-only) evil pigeons.
import * as THREE from 'three';
import { makeDrone, makeMine, makeGull, makeUfo, makeStorm, makePigeon, disposeTree } from './models.js';
import { pick, rand, T } from './texts.js';

const TYPES = {
  drone: { hp: 2, radius: 5, dmg: 18, speed: 50, make: makeDrone, score: 50, minScore: 0, weight: 3, kamikaze: true, name: 'Angry Drone' },
  mine: { hp: 1, radius: 6, dmg: 25, speed: 14, make: makeMine, score: 30, minScore: 0, weight: 2, kamikaze: true, name: 'Spiky Balloon' },
  gull: { hp: 1, radius: 4, dmg: 8, speed: 80, make: makeGull, score: 25, minScore: 150, weight: 2, kamikaze: true, name: 'Seagull Gang' },
  ufo: { hp: 4, radius: 10, dmg: 15, speed: 45, make: makeUfo, score: 120, minScore: 350, weight: 1.2, kamikaze: false, name: 'UFO' },
  storm: { hp: 6, radius: 22, dmg: 12, speed: 20, make: makeStorm, score: 150, minScore: 650, weight: 0.8, kamikaze: false, name: 'Grumpy Cloud' },
  pigeon: { hp: 2, radius: 5, dmg: 10, speed: 46, make: makePigeon, score: 80, minScore: Infinity, weight: 0, kamikaze: true, name: 'Evil Pigeon' },
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
    this.list.push(e);
    if (!e.quest && !this.introduced.has(type)) {
      this.introduced.add(type);
      this.G.ui.notify(`New enemy spotted: ${def.name}. It seems upset about something.`, 'warn');
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
    const d = rand(450, 800), side = rand(-350, 350);
    const pos = p.pos.clone().addScaledVector(_v, d).addScaledVector(_w, side);
    const g = Math.max(G.terrain.surfaceHeight(pos.x, pos.z), G.world.seaLevel);
    pos.y = Math.max(p.pos.y + rand(-40, 60), g + 45);
    if (type === 'gull') {
      for (let k = 0; k < 4; k++) this.spawn('gull', pos.clone().add(new THREE.Vector3(rand(-25, 25), rand(-8, 8), rand(-25, 25))));
    } else this.spawn(type, pos);
  }

  update(dt) {
    const G = this.G, p = G.player;
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
      } else this.behave(e, toP, dist, dt);

      e.pos.addScaledVector(e.vel, dt);
      const g = Math.max(G.terrain.surfaceHeight(e.pos.x, e.pos.z), G.world.seaLevel) + 12;
      if (e.pos.y < g) { e.pos.y = g; if (e.vel.y < 0) e.vel.y = 0; }
      this.animate(e, dt);

      // Player contact.
      if (!p.dead && !calm && dist < e.radius + 4) {
        p.damage(e.def.dmg);
        if (e.def.kamikaze) { G.fx.explosion(e.pos); this.kill(i, false); continue; }
        e.vel.copy(toP).normalize().multiplyScalar(-60);
      }
      // Bullets.
      for (let b = p.bullets.length - 1; b >= 0; b--) {
        if (p.bullets[b].pos.distanceToSquared(e.pos) < (e.radius + 2) ** 2) {
          p.removeBullet(b);
          e.hp--;
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
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 90) * 0.5);
          const m = new THREE.Mesh(this.orbGeo, this.orbMat);
          m.position.copy(e.pos);
          G.scene.add(m);
          this.shots.push({ mesh: m, pos: m.position, vel: lead.sub(e.pos).normalize().multiplyScalar(90), life: 6 });
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
      let hit = !p.dead && s.pos.distanceToSquared(p.pos) < 36;
      if (hit) p.damage(TYPES.ufo.dmg);
      if (hit || s.life <= 0) { this.G.scene.remove(s.mesh); this.shots.splice(i, 1); }
    }
  }

  kill(i, byPlayer) {
    const G = this.G, e = this.list[i];
    e.dead = true;
    if (byPlayer) {
      G.score += e.def.score;
      G.stats.kills++;
      if (Math.random() < 0.3) G.ui.notify(`${pick(T.kill)} +${e.def.score}`, 'good', 2.5);
    }
    G.audio.explode();
    this.remove(i);
  }

  remove(i) {
    const e = this.list[i];
    e.dead = true;
    this.G.scene.remove(e.mesh);
    disposeTree(e.mesh);
    this.list.splice(i, 1);
  }

  removeEnemy(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.remove(i);
  }
}
