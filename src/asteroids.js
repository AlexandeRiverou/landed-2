// Floating rocks for the space zones. They tumble around the player, hurt on contact, and can be
// shot apart: big ones split into smaller ones, small ones crumble to dust. Plus the odd comet.
import * as THREE from 'three';
import { rand, pick } from './texts.js';

const FIELD = 650;          // asteroids live in a box this far around the player (wrapping like clouds)
const FIELD_Y = 220;
const COLORS = ['#6e665e', '#5a544e', '#7a6a58', '#4e4a48'];

export class Asteroids {
  constructor(G) {
    this.G = G;
    this.geo = new THREE.DodecahedronGeometry(1, 0);
    this.mats = COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    this.list = [];
    this.density = 0;
    this.comets = false;
    this.cometTimer = 4;
  }

  // How many asteroids the current zone wants (0 removes them all).
  configure(density, comets) {
    this.density = density;
    this.comets = comets;
    while (this.list.length > density) this.remove(this.list.length - 1);
  }

  spawn(pos, size, vel) {
    const m = new THREE.Mesh(this.geo, pick(this.mats));
    m.scale.set(size * rand(0.8, 1.2), size * rand(0.7, 1.1), size * rand(0.8, 1.2));
    m.position.copy(pos);
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    this.G.scene.add(m);
    this.list.push({
      mesh: m, pos: m.position, size, hp: Math.ceil(size / 7),
      vel: vel || new THREE.Vector3(rand(-6, 6), rand(-2, 2), rand(-6, 6)),
      spin: new THREE.Vector3(rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.6, 0.6)),
    });
  }

  remove(i) {
    this.G.scene.remove(this.list[i].mesh);
    this.list.splice(i, 1);
  }

  smash(i, byPlayer) {
    const G = this.G, a = this.list[i];
    G.fx.explosion(a.pos);
    G.fx.emit(a.pos, 30, { colors: COLORS, speed: 40, life: 1.5, size: 6 });
    G.audio.explode();
    if (byPlayer) G.score += 10;
    // Big rocks break into smaller rocks that fly apart.
    if (a.size > 14) {
      for (let k = 0; k < 3; k++) {
        const v = new THREE.Vector3(rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1)).normalize().multiplyScalar(rand(10, 22));
        this.spawn(a.pos.clone().addScaledVector(v, 0.4), a.size * rand(0.4, 0.55), v);
      }
    }
    this.remove(i);
  }

  update(dt) {
    const G = this.G, p = G.player;
    // Top the field up out of sight, ahead of the player, so it feels endless.
    if (this.list.length < this.density) {
      const f = p.forward.clone().setY(0).normalize();
      const side = new THREE.Vector3(-f.z, 0, f.x);
      const pos = p.pos.clone().addScaledVector(f, rand(350, FIELD)).addScaledVector(side, rand(-FIELD, FIELD));
      pos.y = p.pos.y + rand(-FIELD_Y, FIELD_Y);
      this.spawn(pos, rand(6, 32));
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.rotation.x += a.spin.x * dt; a.mesh.rotation.y += a.spin.y * dt; a.mesh.rotation.z += a.spin.z * dt;
      // Wrap around the player.
      for (const [k, lim] of [['x', FIELD], ['y', FIELD_Y], ['z', FIELD]]) {
        const d = a.pos[k] - p.pos[k];
        if (d > lim) a.pos[k] -= 2 * lim; else if (d < -lim) a.pos[k] += 2 * lim;
      }
      if (p.dead) continue;
      // Ram it: it hurts, and the rock doesn't survive either.
      if (a.pos.distanceTo(p.pos) < a.size + 3 * p.sizeScale) {
        p.damage(Math.round(10 + a.size * 0.6));
        if (!this.hitTip) { this.hitTip = true; G.ui.notify('Asteroids hurt! Shoot them apart or fly around them.', 'warn', 4, 1); }
        this.smash(i, false);
        continue;
      }
      for (let b = p.bullets.length - 1; b >= 0; b--) {
        if (p.bullets[b].pos.distanceToSquared(a.pos) < (a.size + 1.5) ** 2) {
          a.hp -= p.bullets[b].dmg || 1;
          p.removeBullet(b);
          G.fx.sparkle(a.pos, '#c8b8a0');
          if (a.hp <= 0) { this.smash(i, true); break; }
        }
      }
    }

    // Comets: pretty streaks across the sky, nothing more.
    if (this.comets && (this.cometTimer -= dt) <= 0) {
      this.cometTimer = rand(3, 7);
      const start = p.pos.clone().add(new THREE.Vector3(rand(-600, 600), rand(150, 400), rand(-600, 600)));
      const dir = new THREE.Vector3(rand(-1, 1), rand(-0.4, -0.1), rand(-1, 1)).normalize();
      for (let k = 0; k < 40; k++) G.fx.emit(start.clone().addScaledVector(dir, k * 9), 2, { colors: ['#ffffff', '#a8d8ff'], speed: 3, life: 0.6 + k * 0.03, size: 9 - k * 0.15 });
    }
  }
}
