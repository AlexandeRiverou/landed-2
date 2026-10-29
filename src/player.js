// Arcade flight: pitch/roll on the local axes, bank turns you, auto-levels when you let go.
import * as THREE from 'three';
import { makePlane, PLANE_SKINS } from './models.js';
import { pick, T } from './texts.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

const PITCH_RATE = 1.25, ROLL_RATE = 2.2, YAW_RATE = 0.5, TURN = 1.1, MAX_BANK = 0.9, BANK_RESPONSE = 4;

export class Player {
  constructor(G) {
    this.G = G;
    this.model = makePlane();
    this.skin = PLANE_SKINS[0];
    this.model.setSkin(this.skin);
    G.scene.add(this.model.group);
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.wind = new THREE.Vector3();
    this.baseSpeed = 52;
    this.speed = 52;
    this.boost = 1;
    this.freeBoost = 0;
    this.health = 100;
    this.sinceHit = 99;
    this.invuln = 0;
    this.grace = 0;        // after the world mutates: terrain pushes you up instead of killing you
    this.dead = false;
    this.deadTimer = 0;
    this.loopAccum = 0;
    this.loopIdle = 0;
    this.loopRequirement = 1;
    this.events = [];
    this.shootCd = 0;
    this.bullets = [];
    this.ceilingWarned = 0;
    this.bulletGeo = new THREE.SphereGeometry(0.7, 6, 4);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: '#fff36a' });
  }

  setSkin(s) { this.skin = s; this.model.setSkin(s); }

  spawn(x, z, yaw = 0) {
    const G = this.G;
    const g = Math.max(G.terrain.surfaceHeight(x, z), G.world.seaLevel);
    this.pos.set(x, g + 140, z);
    this.prevPos.copy(this.pos);
    this.quat.setFromAxisAngle(Y, yaw);
    this.speed = this.baseSpeed;
    this.health = 100;
    this.dead = false;
    this.invuln = 3;
    this.model.group.visible = true;
    this.loopAccum = 0;
    this.updateAxes();
  }

  updateAxes() {
    this.forward.set(0, 0, -1).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
  }

  update(dt, input) {
    const G = this.G;
    this.updateBullets(dt);
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        const f = this.forward;
        this.spawn(this.pos.x, this.pos.z, Math.atan2(-f.x, -f.z));
        G.ui.notify(pick(T.respawn), 'info', 3, 0);
      }
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.grace = Math.max(0, this.grace - dt);
    if (this.grace <= 0) this.graceNotified = false;
    this.sinceHit += dt;
    if (this.sinceHit > 4 && this.health < 100) this.health = Math.min(100, this.health + dt * 5);

    // Rotation in local space. Roll input sets a target bank angle (casual: let go → wings level).
    const q = this.quat;
    const bank = Math.asin(THREE.MathUtils.clamp(-this.right.y, -1, 1));
    const dRoll = THREE.MathUtils.clamp((input.roll * MAX_BANK - bank) * BANK_RESPONSE, -ROLL_RATE, ROLL_RATE) * dt;
    q.multiply(_q.setFromAxisAngle(X, input.pitch * PITCH_RATE * dt));
    q.multiply(_q.setFromAxisAngle(Z, -dRoll));
    q.multiply(_q.setFromAxisAngle(Y, -input.yaw * YAW_RATE * dt));
    this.updateAxes();

    // Banking turns the plane around world up (lift has a sideways component).
    _v.set(this.forward.x, 0, this.forward.z);
    if (_v.lengthSq() > 0.01) {
      _v.normalize().cross(Y); // flat right
      const side = this.up.dot(_v);
      q.premultiply(_q.setFromAxisAngle(Y, -side * TURN * dt));
    }
    // Soft ceiling.
    if (this.pos.y > 1150) {
      q.multiply(_q.setFromAxisAngle(X, -0.9 * dt));
      if (G.time - this.ceilingWarned > 10) { G.ui.notify(pick(T.ceiling), 'warn'); this.ceilingWarned = G.time; }
    }
    q.normalize();
    this.updateAxes();

    // Loop detection: accumulate pitch rotation in one direction.
    const dp = input.pitch * PITCH_RATE * dt;
    if (Math.abs(input.pitch) > 0.25) {
      if (Math.sign(dp) !== Math.sign(this.loopAccum) && Math.abs(this.loopAccum) > 0.5) this.loopAccum *= 0.5;
      this.loopAccum += dp;
      this.loopIdle = 0;
    } else if ((this.loopIdle += dt) > 1.2) this.loopAccum = 0;
    if (Math.abs(this.loopAccum) >= Math.PI * 2 * this.loopRequirement) { this.events.push('loop'); this.loopAccum = 0; }

    // Speed + boost.
    const boosting = this.freeBoost > 0 || (input.boost && this.boost > 0.02);
    if (this.freeBoost > 0) this.freeBoost -= dt;
    else if (boosting) this.boost = Math.max(0, this.boost - dt * 0.35);
    else this.boost = Math.min(1, this.boost + dt * 0.15);
    const target = (boosting ? this.baseSpeed * 1.8 : this.baseSpeed) - this.forward.y * 12;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (boosting ? 2.5 : 1.2)));
    this.boosting = boosting;

    this.prevPos.copy(this.pos);
    this.pos.addScaledVector(this.forward, this.speed * dt).addScaledVector(this.wind, dt);

    // Terrain + water.
    const ground = G.terrain.surfaceHeight(this.pos.x, this.pos.z);
    const sea = G.world.seaLevel;
    if (this.pos.y < ground + 1.8) {
      if (this.grace > 0 || this.invuln > 0) {
        this.pos.y = ground + 30;
        if (this.grace > 0 && !this.graceNotified) {
          this.graceNotified = true;
          G.ui.notify('A mountain grew under you. We relocated you upward. Free of charge.', 'warn');
        }
      } else return this.crash('ground');
    } else if (ground < sea && this.pos.y < sea + 0.6) {
      if (this.grace > 0 || this.invuln > 0) this.pos.y = sea + 25;
      else return this.crash('water');
    }

    // Shooting.
    this.shootCd -= dt;
    if (input.shoot && this.shootCd <= 0) this.fire();

    // Visuals.
    const g = this.model.group;
    g.position.copy(this.pos);
    g.quaternion.copy(this.quat);
    g.visible = this.invuln <= 0 || Math.floor(G.time * 12) % 2 === 0;
    this.model.prop.rotation.z += dt * (30 + this.speed * 0.5);
    if (boosting && Math.random() < 0.6) G.fx.trail(_v.copy(this.pos).addScaledVector(this.forward, -6), '#7ad8ff');
  }

  fire() {
    const G = this.G;
    this.shootCd = 0.14;
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(this.bulletGeo, this.bulletMat);
      const p = this.pos.clone().addScaledVector(this.right, side * 3.5).addScaledVector(this.forward, 2);
      m.position.copy(p);
      G.scene.add(m);
      this.bullets.push({ mesh: m, pos: p, vel: this.forward.clone().multiplyScalar(this.speed + 380), life: 1.6 });
    }
    G.audio.shoot();
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.life <= 0 || b.pos.y < this.G.terrain.surfaceHeight(b.pos.x, b.pos.z)) this.removeBullet(i);
    }
  }

  removeBullet(i) {
    this.G.scene.remove(this.bullets[i].mesh);
    this.bullets.splice(i, 1);
  }

  damage(n) {
    if (this.dead || this.invuln > 0) return;
    const G = this.G;
    this.health -= n;
    this.sinceHit = 0;
    G.ui.flash('#ff3a3a', 0.35);
    G.audio.hit();
    if (Math.random() < 0.2) G.ui.notify(pick(T.hurt), 'bad', 2, 0);
    if (this.health <= 0) this.crash('enemy');
  }

  crash(reason) {
    const G = this.G;
    this.dead = true;
    this.deadTimer = 2.2;
    this.health = 0;
    this.model.group.visible = false;
    this.wind.set(0, 0, 0);
    G.stats.crashes++;
    if (reason === 'water') G.fx.splash(this.pos); else G.fx.explosion(this.pos);
    G.audio.explode();
    G.ui.flash('#ffffff', 0.7);
    G.ui.notify(pick(reason === 'water' ? T.crashWater : reason === 'enemy' ? T.crashEnemy : T.crashGround), 'bad', 4);
  }

  // Gently steer the nose toward a point (used by the "tailwind" persuasion).
  nudgeToward(target, rate, dt) {
    _m.lookAt(this.pos, target, Y);
    _q.setFromRotationMatrix(_m);
    this.quat.slerp(_q, Math.min(1, rate * dt));
  }
}
