// Gradient sky dome, sun/hemisphere lights, fog, time-of-day presets, weather and clouds.
import * as THREE from 'three';
import { rand } from './texts.js';

export const TOD = {
  noon: { top: '#2f6fd0', horizon: '#a8d3f5', bottom: '#c6e2f6', sun: '#fff3d6', sunI: 2.4, hemiSky: '#cfe7ff', hemiGround: '#6b7a4a', hemiI: 1.1, elev: 62, stars: 0 },
  morning: { top: '#4a86d6', horizon: '#f6d6ad', bottom: '#e8d9c4', sun: '#ffe0b0', sunI: 2.0, hemiSky: '#ffe4c4', hemiGround: '#6a6a4a', hemiI: 1.0, elev: 22, stars: 0 },
  sunset: { top: '#38388a', horizon: '#ff9156', bottom: '#c25a4a', sun: '#ffad6b', sunI: 1.8, hemiSky: '#ffb48a', hemiGround: '#4a3a4a', hemiI: 0.9, elev: 6, stars: 0.1 },
  dusk: { top: '#151a44', horizon: '#b5577a', bottom: '#4a2a4a', sun: '#ff8aa0', sunI: 0.9, hemiSky: '#8a6aa0', hemiGround: '#2a2a3a', hemiI: 0.75, elev: 3, stars: 0.5 },
  night: { top: '#040714', horizon: '#18224a', bottom: '#0a0f22', sun: '#b8c8ff', sunI: 0.6, hemiSky: '#3a4a8a', hemiGround: '#101020', hemiI: 0.6, elev: 40, stars: 1 },
  dawn: { top: '#28407e', horizon: '#f3a99a', bottom: '#8a6a7a', sun: '#ffc0a0', sunI: 1.4, hemiSky: '#f0b8b0', hemiGround: '#4a4a5a', hemiI: 0.85, elev: 8, stars: 0.3 },
  alien: { top: '#0c5a3c', horizon: '#b8ff7a', bottom: '#4a8a3a', sun: '#eaff8a', sunI: 2.0, hemiSky: '#c8ff9a', hemiGround: '#3a2a5a', hemiI: 1.0, elev: 45, stars: 0.2 },
  candy: { top: '#ff6fbf', horizon: '#ffe1f3', bottom: '#ffd0ea', sun: '#ffffff', sunI: 2.1, hemiSky: '#ffd0f0', hemiGround: '#a06aa0', hemiI: 1.1, elev: 50, stars: 0 },
  eclipse: { top: '#07070d', horizon: '#ff5e1a', bottom: '#3a1a0a', sun: '#ff4a1a', sunI: 0.8, hemiSky: '#8a4a3a', hemiGround: '#1a1010', hemiI: 0.65, elev: 30, stars: 0.7 },
  volcano: { top: '#1a0606', horizon: '#c2401a', bottom: '#3a1008', sun: '#ff7a3a', sunI: 1.2, hemiSky: '#c2603a', hemiGround: '#2a1010', hemiI: 0.8, elev: 20, stars: 0.2 },
  stratosphere: { top: '#020418', horizon: '#6a9ae0', bottom: '#d8e8ff', sun: '#ffffff', sunI: 2.4, hemiSky: '#a8c8ff', hemiGround: '#e8f0ff', hemiI: 1.1, elev: 30, stars: 0.6 },
  space: { top: '#000000', horizon: '#04050c', bottom: '#000000', sun: '#ffffff', sunI: 2.4, hemiSky: '#8a90b0', hemiGround: '#1a1a24', hemiI: 0.55, elev: 25, stars: 1 },
  storm: { top: '#3a4048', horizon: '#8d949c', bottom: '#5a6068', sun: '#d8dde2', sunI: 0.9, hemiSky: '#a0a8b0', hemiGround: '#3a3f44', hemiI: 0.95, elev: 50, stars: 0 },
};
const COLOR_KEYS = ['top', 'horizon', 'bottom', 'sun', 'hemiSky', 'hemiGround'];
const NUM_KEYS = ['sunI', 'hemiI', 'elev', 'stars'];

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir;
uniform float stars; uniform float time;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 1.0, h), 0.55)) : mix(horizon, bottom, smoothstep(0.0, -0.25, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (smoothstep(0.9975, 0.999, s) * 2.0 + pow(s, 12.0) * 0.3);
  if (stars > 0.0) {
    vec3 p = floor(d * 260.0);
    float r = fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    float tw = 0.6 + 0.4 * sin(time * 3.0 + r * 50.0);
    col += stars * tw * step(0.9975, r) * smoothstep(0.0, 0.25, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(G) {
    this.G = G;
    this.cur = {}; this.tgt = {};
    for (const k of COLOR_KEYS) { this.cur[k] = new THREE.Color(); this.tgt[k] = new THREE.Color(); }
    this.uniforms = {
      top: { value: this.cur.top }, horizon: { value: this.cur.horizon }, bottom: { value: this.cur.bottom },
      sunColor: { value: this.cur.sun }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, stars: { value: 0 }, time: { value: 0 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    G.scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    G.scene.add(this.hemi, this.sun, this.sun.target);
    G.scene.fog = new THREE.Fog('#a8d3f5', 260, 1250);

    this.azimuth = rand(0, Math.PI * 2);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sunOverride = null;   // persuasion: point the sun at the objective
    this.fogBoost = 1;         // persuasion: clear the fog
    this.fogScale = 1;         // mutation: foggier / clearer world
    this.fogNow = 1;
    this.decor = new THREE.Group(); // planets and other sky junk, follows the camera
    G.scene.add(this.decor);
    this.preset = null;
    this.weather = new Weather(G);
    this.clouds = new Clouds(G);
    this.setPreset('noon', true);
  }

  setPreset(name, instant = false) {
    const p = TOD[name];
    this.preset = name;
    for (const k of COLOR_KEYS) { this.tgt[k].set(p[k]); if (instant) this.cur[k].copy(this.tgt[k]); }
    for (const k of NUM_KEYS) { this.tgt[k] = p[k]; if (instant) this.cur[k] = p[k]; }
  }

  update(dt) {
    const G = this.G;
    const a = 1 - Math.exp(-dt * 0.9);
    for (const k of COLOR_KEYS) this.cur[k].lerp(this.tgt[k], a);
    for (const k of NUM_KEYS) this.cur[k] += (this.tgt[k] - this.cur[k]) * a;

    const el = THREE.MathUtils.degToRad(this.cur.elev);
    const want = new THREE.Vector3(Math.cos(el) * Math.sin(this.azimuth), Math.sin(el), Math.cos(el) * Math.cos(this.azimuth));
    if (this.sunOverride) {
      const o = this.sunOverride;
      const l = Math.hypot(o.x, o.z) || 1;
      want.set((o.x / l) * Math.cos(0.15), Math.sin(0.15), (o.z / l) * Math.cos(0.15));
    }
    this.sunDir.lerp(want, 1 - Math.exp(-dt * 1.5)).normalize();
    this.uniforms.sunDir.value.copy(this.sunDir);
    this.uniforms.stars.value = this.cur.stars;
    this.uniforms.time.value += dt;

    const cam = G.camera.position;
    this.dome.position.copy(cam);
    this.decor.position.copy(cam);

    this.sun.color.copy(this.cur.sun);
    this.sun.intensity = this.cur.sunI;
    this.hemi.color.copy(this.cur.hemiSky);
    this.hemi.groundColor.copy(this.cur.hemiGround);
    this.hemi.intensity = this.cur.hemiI;
    const pp = G.player.pos;
    this.sun.position.set(pp.x + this.sunDir.x * 500, pp.y + Math.max(0.15, this.sunDir.y) * 500, pp.z + this.sunDir.z * 500);
    this.sun.target.position.copy(pp);

    this.fogNow += (this.fogBoost * this.fogScale - this.fogNow) * a;
    G.scene.fog.color.copy(this.cur.horizon);
    G.scene.fog.near = Math.min(900, 260 * this.fogNow);
    G.scene.fog.far = Math.min(1380, 1250 * this.fogNow);

    this.weather.update(dt, cam);
    this.clouds.update(dt, pp, this.cur);
  }
}

// ---------- weather ----------

export const WEATHER = {
  clear: null,
  rain: { colors: ['#b8d4ff'], size: 1.4, fall: 230, sway: 0, count: 3000, opacity: 0.65 },
  snow: { colors: ['#ffffff'], size: 2.4, fall: 18, sway: 6, count: 3000, opacity: 0.95 },
  confetti: { colors: ['#ff4d6d', '#ffd23a', '#4dd6ff', '#7aff6a', '#c77dff'], size: 2.8, fall: 22, sway: 10, count: 2400, opacity: 1 },
  bubbles: { colors: ['#c8f6ff', '#e8ffff'], size: 3.4, fall: -14, sway: 5, count: 1400, opacity: 0.55 },
  leaves: { colors: ['#e07a2a', '#c94f1f', '#e8b33a'], size: 2.8, fall: 15, sway: 14, count: 1600, opacity: 1 },
  ash: { colors: ['#5a5a5a', '#8a8a8a', '#3a3a3a'], size: 2.2, fall: 9, sway: 4, count: 2600, opacity: 0.85 },
  stardust: { colors: ['#ffffff', '#a8c8ff', '#ffe8c8'], size: 1.1, fall: 1.5, sway: 1, count: 1600, opacity: 0.9 },
  glitter: { colors: ['#fff1a8', '#ffd700', '#ffffff'], size: 1.6, fall: 8, sway: 3, count: 3000, opacity: 1 },
};

function dotTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

const BOX = 160, BOXY = 110;

class Weather {
  constructor(G) {
    this.G = G;
    this.max = 3000;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.phase = new Float32Array(this.max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size: 2, vertexColors: true, map: dotTexture(), transparent: true, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    G.scene.add(this.points);
    this.type = 'clear';
    this.t = 0;
  }

  set(type) {
    this.type = type;
    const w = WEATHER[type];
    this.points.visible = !!w;
    if (!w) return;
    const cam = this.G.camera.position;
    const c = new THREE.Color();
    for (let i = 0; i < w.count; i++) {
      this.pos[i * 3] = cam.x + rand(-BOX, BOX);
      this.pos[i * 3 + 1] = cam.y + rand(-BOXY, BOXY);
      this.pos[i * 3 + 2] = cam.z + rand(-BOX, BOX);
      c.set(w.colors[i % w.colors.length]);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.phase[i] = Math.random() * 100;
    }
    this.geo.setDrawRange(0, w.count);
    this.geo.attributes.color.needsUpdate = true;
    this.mat.size = w.size;
    this.mat.opacity = w.opacity;
  }

  update(dt, cam) {
    const w = WEATHER[this.type];
    if (!w) return;
    this.t += dt;
    const p = this.pos;
    for (let i = 0; i < w.count; i++) {
      const k = i * 3;
      p[k + 1] -= w.fall * dt;
      if (w.sway) { p[k] += Math.sin(this.t * 1.3 + this.phase[i]) * w.sway * dt; p[k + 2] += Math.cos(this.t * 1.1 + this.phase[i]) * w.sway * dt; }
      let d = p[k] - cam.x; if (d > BOX) p[k] -= 2 * BOX; else if (d < -BOX) p[k] += 2 * BOX;
      d = p[k + 1] - cam.y; if (d > BOXY) p[k + 1] -= 2 * BOXY; else if (d < -BOXY) p[k + 1] += 2 * BOXY;
      d = p[k + 2] - cam.z; if (d > BOX) p[k + 2] -= 2 * BOX; else if (d < -BOX) p[k + 2] += 2 * BOX;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// ---------- clouds ----------

const CLOUD_R = 1500, PUFFS = 6, MAX_CLOUDS = 70;

class Clouds {
  constructor(G) {
    this.G = G;
    this.mat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, transparent: true, opacity: 0.92, emissive: '#ffffff', emissiveIntensity: 0.25 });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.mat, MAX_CLOUDS * PUFFS);
    this.mesh.frustumCulled = false;
    G.scene.add(this.mesh);
    this.list = [];
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const puffs = [];
      for (let k = 0; k < PUFFS; k++) puffs.push({ x: rand(-30, 30), y: rand(-5, 8), z: rand(-18, 18), s: rand(12, 24) });
      this.list.push({ pos: new THREE.Vector3(rand(-CLOUD_R, CLOUD_R), rand(320, 560), rand(-CLOUD_R, CLOUD_R)), puffs, size: rand(0.7, 1.5) });
    }
    this.count = 40;
    this.tint = new THREE.Color('#ffffff');
    this.target = new THREE.Color('#ffffff');
    this.wind = new THREE.Vector3(6, 0, 3);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.initialized = false;
  }

  setStyle(color, count, altitude) {
    this.target.set(color);
    this.count = Math.max(0, Math.min(MAX_CLOUDS, count));
    // Zones can move the cloud layer, e.g. below you in the stratosphere.
    if (altitude !== undefined) for (const c of this.list) c.pos.y = altitude + rand(-80, 80);
  }

  update(dt, pp, sky) {
    if (!this.initialized) {
      for (const c of this.list) { c.pos.x += pp.x; c.pos.z += pp.z; }
      this.initialized = true;
    }
    this.tint.lerp(this.target, 1 - Math.exp(-dt));
    this.mat.color.copy(this.tint).lerp(sky.horizon, 0.25);
    this.mat.emissive.copy(this.tint).multiplyScalar(0.5).lerp(sky.horizon, 0.5);
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      const c = this.list[i];
      c.pos.addScaledVector(this.wind, dt);
      const dx = c.pos.x - pp.x, dz = c.pos.z - pp.z;
      if (dx > CLOUD_R) c.pos.x -= 2 * CLOUD_R; else if (dx < -CLOUD_R) c.pos.x += 2 * CLOUD_R;
      if (dz > CLOUD_R) c.pos.z -= 2 * CLOUD_R; else if (dz < -CLOUD_R) c.pos.z += 2 * CLOUD_R;
      for (const p of c.puffs) {
        this.v.set(c.pos.x + p.x * c.size, c.pos.y + p.y * c.size, c.pos.z + p.z * c.size);
        this.s.set(p.s * c.size, p.s * c.size * 0.65, p.s * c.size);
        this.mesh.setMatrixAt(n++, this.m.compose(this.v, this.q, this.s));
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
