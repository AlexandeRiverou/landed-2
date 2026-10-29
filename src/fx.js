// Pooled particle bursts (explosions, fireworks, confetti, sparkles) + short-lived meshes.
import * as THREE from 'three';
import { rand, pick } from './texts.js';

const VERT = `
attribute float size;
attribute vec4 pcolor;
uniform float uScale;
varying vec4 vC;
void main() {
  vC = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec4 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - d * 2.0));
  #include <colorspace_fragment>
}`;

// Bursts (explosions, confetti, sparkles...) spawn this share of their particles, so effects read clearly without
// filling the screen. Small counts round randomly, so one-particle trails still appear at a matching rate.
const BURST_DENSITY = 0.5;

const FIREWORK_COLORS = ['#ff4d6d', '#ffd23a', '#4dd6ff', '#7aff6a', '#c77dff', '#ff9a3a', '#ffffff'];

export class FX {
  constructor(G) {
    this.G = G;
    const N = (this.N = 6000);
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.col = new Float32Array(N * 4);
    this.size = new Float32Array(N);
    this.baseSize = new Float32Array(N);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N);
    this.grav = new Float32Array(N);
    this.drag = new Float32Array(N);
    this.cursor = 0;
    const geo = (this.geo = new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { uScale: { value: innerHeight * 0.6 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    G.scene.add(this.points);
    this.timed = [];
    this._c = new THREE.Color();
  }

  resize() { this.uniforms.uScale.value = innerHeight * 0.6; }

  emit(p, n, o = {}) {
    const colors = o.colors || [o.color || '#ffffff'];
    const speed = o.speed ?? 40, life = o.life ?? 1.2, size = o.size ?? 4;
    n *= BURST_DENSITY;
    n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.N;
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = speed * (o.uniform ? 1 : rand(0.3, 1));
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = r * Math.cos(th) * sp + (o.vx || 0);
      this.vel[i * 3 + 1] = u * sp + (o.up || 0);
      this.vel[i * 3 + 2] = r * Math.sin(th) * sp + (o.vz || 0);
      this._c.set(pick(colors));
      this.col[i * 4] = this._c.r; this.col[i * 4 + 1] = this._c.g; this.col[i * 4 + 2] = this._c.b; this.col[i * 4 + 3] = 1;
      this.baseSize[i] = size * rand(0.7, 1.3);
      this.size[i] = this.baseSize[i];
      this.life[i] = this.maxLife[i] = life * rand(0.6, 1.2);
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.2;
    }
  }

  explosion(p) {
    this.emit(p, 90, { colors: ['#ffd23a', '#ff8a1f', '#ff3a2a'], speed: 60, life: 1.0, size: 7 });
    this.emit(p, 40, { colors: ['#555555', '#888888'], speed: 25, life: 2, size: 10, up: 10 });
  }
  firework(p) {
    const c = [pick(FIREWORK_COLORS), pick(FIREWORK_COLORS)];
    this.emit(p, 140, { colors: c, speed: 70, life: 1.8, size: 5, gravity: -18, drag: 1.6, uniform: true });
    this.G.audio.firework();
  }
  confetti(p) { this.emit(p, 160, { colors: FIREWORK_COLORS, speed: 55, life: 3, size: 4, gravity: -12, drag: 2, up: 30 }); }
  sparkle(p, color = '#fff3a0') { this.emit(p, 50, { colors: [color, '#ffffff'], speed: 30, life: 0.9, size: 4 }); }
  splash(p) { this.emit(p, 120, { colors: ['#ffffff', '#b8e0ff', '#7ac8ff'], speed: 35, life: 1.6, size: 6, gravity: -40, up: 45 }); }
  trail(p, color) { this.emit(p, 1, { color, speed: 2, life: 0.5, size: 2.5 }); }

  lightning(a, b) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const v = new THREE.Vector3().lerpVectors(a, b, t);
      if (i > 0 && i < 8) v.add(new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)));
      pts.push(v);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#fff7a0', transparent: true }));
    this.addTimed(line, 0.25, (o, t) => { o.material.opacity = t; });
  }

  addTimed(obj, life, fn) {
    this.G.scene.add(obj);
    this.timed.push({ obj, life, max: life, fn });
  }

  update(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      const k = i * 3, dr = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr + this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = Math.min(1, f * 2);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * f);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;

    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i];
      t.life -= dt;
      if (t.fn) t.fn(t.obj, Math.max(0, t.life / t.max), dt);
      if (t.life <= 0) {
        this.G.scene.remove(t.obj);
        t.obj.geometry?.dispose();
        t.obj.material?.dispose();
        this.timed.splice(i, 1);
      }
    }
  }
}
