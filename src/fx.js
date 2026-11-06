// Pooled particle bursts (explosions, fireworks, confetti, sparkles) + short-lived meshes.
import * as THREE from 'three';
import { rand, pick } from './texts.js';
import { curveDrop } from './curve.js';

const VERT = `
attribute float size;
attribute vec4 pcolor;
uniform float uScale;
varying vec4 vC;
void main() {
  vC = pcolor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); // named like three's own shaders so the curvature patch finds it
  gl_PointSize = size * uScale / max(1.0, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
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

// Score pop-ups ("+40" where a part broke off): at most this many at once (the oldest is reused), each rising
// POP_RISE px while it fades over POP_LIFE s.
const POP_MAX = 6, POP_LIFE = 0.9, POP_RISE = 40;
const _pv = new THREE.Vector3(), _pw = new THREE.Vector3();

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
    this.pops = [];    // on screen: { el, pos, t }
    this.popPool = []; // off screen, ready for reuse
  }

  // A score number floating up from a point in the world. Skipped if that point is behind the camera.
  popText(pos, text) {
    if (_pv.copy(pos).applyMatrix4(this.G.camera.matrixWorldInverse).z > 0) return;
    let pop = this.pops.length >= POP_MAX ? this.pops.shift() : this.popPool.pop();
    if (!pop) { const el = document.createElement('div'); el.className = 'pop-score'; pop = { el, pos: new THREE.Vector3() }; }
    pop.el.textContent = text;
    pop.pos.copy(pos);
    pop.t = 0;
    this.pops.push(pop);
    if (!pop.el.isConnected) document.getElementById('ui').append(pop.el);
    this.placePop(pop);
  }

  placePop(pop) {
    const cam = this.G.camera, k = pop.t / POP_LIFE;
    _pv.copy(pop.pos);
    _pv.y -= curveDrop(_pv.x, _pv.z, cam.position); // drawn where a curved world draws it
    const behind = _pw.copy(_pv).applyMatrix4(cam.matrixWorldInverse).z > 0;
    pop.el.style.visibility = behind ? 'hidden' : '';
    if (behind) return;
    _pv.project(cam);
    const x = ((_pv.x + 1) / 2) * innerWidth, y = ((1 - _pv.y) / 2) * innerHeight - POP_RISE * k;
    pop.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    pop.el.style.opacity = (1 - k).toFixed(3);
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
      const u = o.ring ? Math.random() * 0.2 - 0.1 : Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
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
  // A bullet hitting the ground: a fountain of dirt and a ring of dust rolling out along the ground.
  dirt(p) {
    this.emit(p, 36, { colors: ['#8a6a4a', '#b89a70', '#6a5a4a', '#4a3424'], speed: 30, life: 1.1, size: 8, gravity: -45, up: 32 });
    this.emit(p, 24, { colors: ['#8a7458', '#6a5a44'], speed: 45, life: 0.9, size: 8, drag: 3, up: 3, ring: true });
  }
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

    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i];
      pop.t += dt;
      if (pop.t < POP_LIFE) { this.placePop(pop); continue; }
      pop.el.remove();
      this.pops.splice(i, 1);
      this.popPool.push(pop);
    }

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
