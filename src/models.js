// Low-poly models built from primitives. Props are merged into one vertex-coloured
// geometry each so terrain chunks can draw them with a single InstancedMesh per type.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
const PI = Math.PI;

const Cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
const Cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
const Ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const Sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const Dod = (r) => new THREE.DodecahedronGeometry(r, 0);
const Oct = (r) => new THREE.OctahedronGeometry(r, 0);
const Tor = (r, t, rs = 6, ts = 14, arc = PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

// Part: transform a primitive and paint it a flat vertex colour.
function P(geo, color, t = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
  _q.setFromEuler(_e);
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  _s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const M = (parts) => {
  const g = mergeGeometries(parts.flat());
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
};

const C = {
  trunk: '#7a5232', leaf: '#3f8f3a', leaf2: '#63b046', pine: '#2e6b3c', pine2: '#3c8048', snow: '#f4f8ff',
  rock: '#8a8378', rock2: '#6f685f', white: '#f2efe6', red: '#d8433a', roof: '#b8452f', sand: '#d9c08a',
  cactus: '#4f9a45', yellow: '#ffd23a', orange: '#ff8a1f', black: '#1d1d22', blue: '#3d6fd1', skin: '#f1c7a0',
  pink: '#ff7ac0', purple: '#9b5cff', gray: '#9aa0a6', grass: '#5aa040', brown: '#8a5a3a',
};

export const propMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const PROPS = {};

function def(name, parts, meta = {}) {
  PROPS[name] = {
    geo: M(parts),
    scale: meta.scale || [0.8, 1.3],
    sink: meta.sink ?? 0.6,
    tilt: meta.tilt || 0,
    nonUniform: !!meta.nonUniform,
    tints: meta.tints ? meta.tints.map((c) => new THREE.Color(c)) : null,
    sea: !!meta.sea,
  };
}

const trunk = (h = 4, r = 0.9) => P(Cyl(r * 0.75, r * 1.2, h), C.trunk, { y: h / 2 });

function treeTop(x, y, z, s) {
  return [P(Ico(5.5 * s), C.leaf, { x, y: y + 9.5 * s, z }), P(Ico(3.6 * s), C.leaf2, { x: x + 2.4 * s, y: y + 11.5 * s, z: z + s })];
}

export function buildProps() {
  if (PROPS.pine) return;
  def('pine', [trunk(4), P(Cone(6, 8), C.pine, { y: 7 }), P(Cone(4.6, 7), C.pine2, { y: 10.5 }), P(Cone(3, 5.5), C.pine, { y: 13.8 })], { scale: [0.8, 1.6] });
  def('snowPine', [trunk(4), P(Cone(6, 8), C.pine, { y: 7 }), P(Cone(4.6, 7), C.snow, { y: 10.5 }), P(Cone(3, 5.5), C.snow, { y: 13.8 })], { scale: [0.8, 1.5] });
  def('roundTree', [P(Cyl(0.8, 1.2, 6), C.trunk, { y: 3 }), ...treeTop(0, 0, 0, 1)], { scale: [0.8, 1.4] });
  def('birch', [P(Cyl(0.45, 0.6, 11), '#eeeeea', { y: 5.5 }), P(Box(0.6, 0.4, 0.6), C.black, { y: 4 }), P(Box(0.6, 0.4, 0.6), C.black, { y: 7 }), P(Ico(3.4), '#9cc84a', { y: 12, sy: 1.4 })]);

  const palm = [];
  for (let k = 0; k < 4; k++) palm.push(P(Cyl(0.55 - k * 0.07, 0.7 - k * 0.07, 3.4), '#9a7a4a', { x: k * k * 0.18, y: 1.7 + k * 3.2, rz: -0.06 * k }));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2;
    palm.push(P(Box(7, 0.3, 1.6), k % 2 ? C.leaf : C.leaf2, { x: 2 + Math.cos(a) * 3.2, y: 12.3, z: -Math.sin(a) * 3.2, ry: a, rz: -0.35 }));
  }
  palm.push(P(Ico(0.7), C.brown, { x: 2, y: 12, z: 0.6 }), P(Ico(0.7), C.brown, { x: 1.4, y: 12, z: -0.5 }));
  def('palm', palm, { scale: [0.8, 1.3] });

  def('deadTree', [
    P(Cyl(0.5, 0.9, 10, 5), '#6a5a4a', { y: 5 }),
    P(Cyl(0.25, 0.35, 5, 4), '#6a5a4a', { x: 1.6, y: 7.5, rz: -0.9 }),
    P(Cyl(0.25, 0.35, 4, 4), '#6a5a4a', { x: -1.3, y: 5.5, z: 0.4, rz: 0.8 }),
    P(Cyl(0.2, 0.3, 4, 4), '#6a5a4a', { y: 8.8, z: -1.2, rx: -0.8 }),
  ]);
  def('cactus', [
    P(Cyl(1.2, 1.3, 10, 7), C.cactus, { y: 5 }), P(Sph(1.2, 7, 4), C.cactus, { y: 10 }),
    P(Cyl(0.7, 0.7, 2.2, 6), C.cactus, { x: 1.7, y: 4.5, rz: PI / 2 }), P(Cyl(0.7, 0.7, 4, 6), C.cactus, { x: 2.7, y: 6.3 }),
    P(Cyl(0.6, 0.6, 2, 6), C.cactus, { x: -1.6, y: 3.2, rz: PI / 2 }), P(Cyl(0.6, 0.6, 3, 6), C.cactus, { x: -2.5, y: 4.4 }),
    P(Sph(0.6, 5, 4), '#ff6aa0', { y: 11 }),
  ], { scale: [0.7, 1.4] });
  def('bush', [P(Ico(2.5), C.leaf, { y: 1.4, sy: 0.75 }), P(Ico(1.8), C.leaf2, { x: 1.8, y: 1.2, z: 0.5, sy: 0.75 })], { scale: [0.7, 1.5] });
  def('rock', [P(Dod(4), C.rock, { y: 1 })], { scale: [0.5, 2.2], nonUniform: true, tilt: 0.4, sink: 1.5 });
  def('rockB', [P(Ico(5), C.rock2, { y: 0.5, sy: 0.6 }), P(Ico(2.5), C.rock, { x: 3.5, y: 0.5 })], { scale: [0.6, 2], nonUniform: true, tilt: 0.3, sink: 1 });
  def('house', [
    P(Box(8, 6, 10), C.white, { y: 3 }), P(Cone(7.5, 4.5, 4), C.roof, { y: 8.25, ry: PI / 4, sx: 0.85, sz: 1.05 }),
    P(Box(1.6, 3, 0.2), C.brown, { y: 1.5, z: 5.05 }), P(Box(1.6, 1.6, 0.2), '#7ac8ff', { x: 2.4, y: 3.6, z: 5.05 }),
    P(Box(1.2, 3, 1.2), C.rock2, { x: 2, y: 9, z: 2 }),
  ], { scale: [0.9, 1.2], tints: ['#ffffff', '#ffe0b0', '#d0e8ff', '#ffd0d0', '#e0ffd0'] });
  const windmill = [P(Cyl(2, 3.5, 16, 6), C.white, { y: 8 }), P(Cone(3, 3, 6), C.red, { y: 17.5 }), P(Box(1, 1, 3), C.gray, { y: 16, z: 2.5 })];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + PI / 4;
    windmill.push(P(Box(1.2, 10, 0.3), '#e8d8b8', { x: Math.cos(a) * 5, y: 16 + Math.sin(a) * 5, z: 4, rz: a - PI / 2 }));
  }
  def('windmill', windmill, { scale: [1, 1.4] });
  const lh = [];
  for (let k = 0; k < 4; k++) lh.push(P(Cyl(3.2 - k * 0.4, 3.6 - k * 0.4, 5, 10), k % 2 ? C.white : C.red, { y: 2.5 + k * 5 }));
  lh.push(P(Cyl(1.8, 1.8, 2.5, 8), C.yellow, { y: 21.2 }), P(Cone(2.4, 2.4, 8), C.red, { y: 23.6 }));
  def('lighthouse', lh, { scale: [1, 1.4] });
  const castle = [P(Cyl(5, 5.5, 22, 8), '#a8a49a', { y: 11 }), P(Cone(6, 9, 8), C.blue, { y: 26.5 }), P(Box(0.2, 3, 2), C.red, { y: 32.5, z: 1 }), P(Box(2, 3.5, 0.3), C.brown, { y: 1.75, z: 5.4 })];
  def('castleTower', castle, { scale: [1, 1.5] });
  def('moai', [P(Box(4, 9, 4), '#8a7a6a', { y: 4.5 }), P(Box(1.2, 3.2, 1.6), '#7a6a5a', { y: 5, z: 2.6 }), P(Box(4.3, 1, 1.4), '#7a6a5a', { y: 7, z: 1.8 }), P(Box(3, 0.6, 1), '#6a5a4a', { y: 2.6, z: 2.2 })], { scale: [1.2, 2] });
  def('pyramid', [P(Cone(14, 16, 4), '#e0c080', { y: 8, ry: PI / 4 }), P(Box(3, 4, 0.5), '#5a4a3a', { y: 2, z: 7.5 })], { scale: [1, 1.8] });
  const shroom = [P(Cyl(1.5, 2, 8, 8), '#f4ead0', { y: 4 }), P(new THREE.SphereGeometry(7, 10, 6, 0, PI * 2, 0, PI / 2), C.red, { y: 7.5, sy: 0.75 })];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * PI * 2; shroom.push(P(Ico(0.9), C.white, { x: Math.cos(a) * 4.2, y: 11.2, z: Math.sin(a) * 4.2 })); }
  shroom.push(P(Ico(1), C.white, { y: 12.8 }));
  def('mushroom', shroom, { scale: [0.7, 1.6], tints: ['#ffffff', '#ffd0ff', '#d0d0ff', '#ffe0a0'] });
  def('crystal', [P(Oct(3), C.purple, { y: 6, sy: 3 }), P(Oct(1.8), '#c49bff', { x: 2.5, y: 3, sy: 2.5, rz: -0.5 }), P(Oct(1.5), '#7a3aff', { x: -2, y: 2.5, z: 1, sy: 2.4, rz: 0.5 })], { scale: [0.7, 1.6], tints: ['#ffffff', '#a0ffff', '#ffa0e0', '#a0ffa0'] });
  def('lollipop', [P(Cyl(0.4, 0.4, 12, 5), C.white, { y: 6 }), P(Cyl(5, 5, 1.5, 16), C.pink, { y: 14, rx: PI / 2 }), P(Cyl(2.6, 2.6, 1.6, 12), C.white, { y: 14, rx: PI / 2 })], { scale: [0.7, 1.4], tints: ['#ffffff', '#a0d0ff', '#ffe080', '#c0ffa0'] });
  def('donut', [P(Tor(4, 2, 6, 12), '#d8a060', { y: 2, rx: PI / 2 }), P(Tor(4, 1.6, 6, 12), C.pink, { y: 2.9, rx: PI / 2, sz: 0.6 })], { scale: [0.8, 1.6], tilt: 0.3, sink: 1 });
  def('gnome', [
    P(Cone(1.6, 3, 8), C.blue, { y: 1.5 }), P(Sph(1, 6, 5), C.skin, { y: 3.3 }), P(Cone(1, 1.8, 6), C.white, { y: 2.5, z: 0.6, rx: PI }),
    P(Cone(1.3, 3.5, 8), C.red, { y: 5.4, rz: 0.15 }), P(Sph(0.3, 4, 3), '#ff9a8a', { y: 3.3, z: 1 }),
  ], { scale: [1.8, 3] });
  def('trafficCone', [P(Cone(2, 6, 10), C.orange, { y: 3.3 }), P(Box(4.5, 0.4, 4.5), C.orange, { y: 0.2 }), P(Cyl(1.25, 1.45, 1, 10), C.white, { y: 3 })], { scale: [0.8, 2] });
  def('duck', [
    P(Sph(6, 10, 8), C.yellow, { y: 2, sy: 0.7, sz: 1.2 }), P(Sph(3.5, 10, 8), C.yellow, { y: 7.5, z: 3.5 }),
    P(Cone(1.3, 3, 6), C.orange, { y: 7, z: 7.3, rx: PI / 2, sx: 1.4, sz: 0.5 }),
    P(Sph(0.6, 5, 4), C.black, { x: 1.6, y: 8.5, z: 6.4 }), P(Sph(0.6, 5, 4), C.black, { x: -1.6, y: 8.5, z: 6.4 }),
    P(Cone(2, 3, 5), C.yellow, { y: 4, z: -7, rx: -1.2 }),
  ], { scale: [0.8, 1.6], sea: true, sink: 0 });
  def('boat', [P(Box(4, 2, 10), C.brown, { y: 1 }), P(Cone(2, 3, 4), C.brown, { y: 1, z: 6.2, rx: PI / 2, ry: PI / 4, sx: 1.4 }), P(Box(3, 2.5, 3), C.white, { y: 3.2, z: -2 }), P(Cyl(0.2, 0.2, 9), C.trunk, { y: 6.5, z: 1.5 }), P(Box(0.15, 6, 4), C.white, { y: 7, z: 3.4 })], { scale: [0.9, 1.3], sea: true, sink: 0.6, tints: ['#ffffff', '#ffd0d0', '#d0e0ff'] });
  def('buoy', [P(Cyl(1, 1.5, 3, 8), C.red, { y: 1 }), P(Cone(1, 2, 8), C.white, { y: 3.5 }), P(Sph(0.5, 5, 4), C.yellow, { y: 4.8 })], { scale: [1, 1.5], sea: true, sink: 0.5 });
  def('floatingIsland', [
    P(Cone(16, 28, 7), '#7a6a58', { y: -14, rx: PI }), P(Cone(9, 14, 6), '#5f544a', { x: 4, y: -24, rx: PI }),
    P(Cyl(16, 16, 3, 7), C.grass, { y: 0.5 }),
    P(Cyl(0.8, 1.2, 6), C.trunk, { x: 4, y: 5 }), ...treeTop(4, 2, 0, 1),
    P(Dod(2.5), C.rock, { x: -7, y: 3 }), P(Box(0.6, 26, 3), '#a8e0ff', { x: -15.6, y: -11, z: 0 }),
  ], { scale: [0.8, 1.6], sink: 0 });
  def('hotAirBalloon', [
    P(Sph(9, 10, 8), '#ffffff', { y: 18, sy: 1.15 }), P(Cone(5.5, 7, 10), '#ffffff', { y: 8.5, rx: PI }),
    P(Box(3, 2.5, 3), C.brown, { y: 1.5 }), P(Box(0.2, 5, 0.2), C.black, { x: 1.2, y: 4.5, z: 1.2 }), P(Box(0.2, 5, 0.2), C.black, { x: -1.2, y: 4.5, z: -1.2 }),
  ], { scale: [0.9, 1.3], sink: 0, tints: ['#ff5a5a', '#ffd23a', '#5ad0ff', '#a05aff', '#5aff8a', '#ff8ad8'] });
}

// ---------- player ----------

export const PLANE_SKINS = [
  { name: 'Classic Red', body: '#e8473c', wing: '#f5f2ea', accent: '#2b2b3a' },
  { name: 'Banana Deluxe', body: '#ffd83a', wing: '#fff4b0', accent: '#5a3a1a' },
  { name: 'Hot Dog Stand', body: '#ff3a2a', wing: '#ffe23a', accent: '#ffffff' },
  { name: 'Bubblegum', body: '#ff7ac8', wing: '#b8f0ff', accent: '#ffffff' },
  { name: 'Midnight Ninja', body: '#2a2a3a', wing: '#4a4a5a', accent: '#ff3a5a' },
  { name: 'Lime Crime', body: '#7aff3a', wing: '#2a8a2a', accent: '#ff3ad0' },
  { name: 'Gold Rush', body: '#e8b830', wing: '#fff0a0', accent: '#8a5a10' },
  { name: 'Police Box Blue', body: '#2a5ad0', wing: '#e0e8ff', accent: '#ffd23a' },
  { name: 'Camouflage (it\'s just green)', body: '#5a7a3a', wing: '#7a8a4a', accent: '#3a4a2a' },
];

export function makePlane() {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: '#e8473c', flatShading: true });
  const wing = new THREE.MeshLambertMaterial({ color: '#f5f2ea', flatShading: true });
  const accent = new THREE.MeshLambertMaterial({ color: '#2b2b3a', flatShading: true });
  const glass = new THREE.MeshPhongMaterial({ color: '#2a4a7a', shininess: 120, specular: '#ffffff' });
  const mesh = (g, m, t = {}) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(t.x || 0, t.y || 0, t.z || 0);
    o.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    if (t.s) o.scale.set(...t.s);
    group.add(o);
    return o;
  };
  mesh(Cyl(1.15, 0.55, 9, 10), body, { rx: -PI / 2 });
  mesh(Cone(1.15, 1.8, 10), body, { z: -5.4, rx: -PI / 2 });
  mesh(Box(13.5, 0.35, 2.4), wing, { y: -0.2, z: -0.9 });
  mesh(Box(1, 0.4, 2.45), accent, { x: 6.4, y: -0.2, z: -0.9 });
  mesh(Box(1, 0.4, 2.45), accent, { x: -6.4, y: -0.2, z: -0.9 });
  mesh(Box(4.6, 0.25, 1.3), wing, { y: 0.2, z: 4 });
  mesh(Box(0.25, 2.2, 1.6), body, { y: 1.3, z: 4.1 });
  mesh(Sph(0.85, 10, 8), glass, { y: 0.85, z: -1.4, s: [1, 0.8, 1.6] });
  mesh(Box(0.3, 1.3, 0.3), accent, { x: 1.2, y: -1.1, z: -2 });
  mesh(Box(0.3, 1.3, 0.3), accent, { x: -1.2, y: -1.1, z: -2 });
  mesh(Cyl(0.5, 0.5, 0.4, 8), accent, { x: 1.2, y: -1.8, z: -2, rz: PI / 2 });
  mesh(Cyl(0.5, 0.5, 0.4, 8), accent, { x: -1.2, y: -1.8, z: -2, rz: PI / 2 });
  const prop = new THREE.Group();
  prop.position.z = -6.4;
  prop.add(new THREE.Mesh(Box(0.3, 5.4, 0.15), accent));
  prop.add(new THREE.Mesh(Box(5.4, 0.3, 0.15), accent));
  group.add(prop);
  return {
    group, prop,
    setSkin(s) { body.color.set(s.body); wing.color.set(s.wing); accent.color.set(s.accent); },
  };
}

// ---------- enemies ----------

const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });
const basic = (c, extra = {}) => new THREE.MeshBasicMaterial({ color: c, ...extra });
function add(group, geo, mat, t = {}) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(t.x || 0, t.y || 0, t.z || 0);
  o.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
  if (t.s) o.scale.set(...t.s);
  group.add(o);
  return o;
}

function partyHat(g, y) {
  add(g, Cone(1.4, 3.5, 8), lam('#ff3ad0'), { y, rz: 0.2 });
  add(g, Sph(0.5, 5, 4), lam('#ffd23a'), { x: -0.35, y: y + 1.8 });
}

export function makeDrone(hat) {
  const g = new THREE.Group();
  add(g, Ico(3, 1), lam('#e0453a'));
  add(g, Sph(1.3, 8, 6), basic('#ffffff'), { z: 2.4, y: 0.4 });
  add(g, Sph(0.6, 6, 4), basic('#111111'), { z: 3.5, y: 0.4 });
  add(g, Box(2.6, 0.5, 0.4), lam('#111111'), { z: 2.7, y: 1.9, rz: 0.25 });
  const rotors = [];
  for (const [x, z] of [[4, 4], [-4, 4], [4, -4], [-4, -4]]) {
    add(g, Box(Math.abs(x) * 0.9, 0.4, 0.4), lam('#333333'), { x: x / 2, z: z / 2, ry: Math.atan2(-z, x) });
    rotors.push(add(g, Cyl(1.8, 1.8, 0.2, 10), lam('#c8c8c8', { transparent: true, opacity: 0.7 }), { x, y: 0.6, z }));
  }
  if (hat) partyHat(g, 3.8);
  g.userData.rotors = rotors;
  return g;
}

export function makeMine(hat) {
  const g = new THREE.Group();
  add(g, Ico(4, 1), lam('#4a2a6a'));
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, -0.7, 0], [0, 0.7, 0.7], [0, -0.7, -0.7]];
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of dirs) {
    const v = new THREE.Vector3(...d).normalize();
    const o = add(g, Cone(0.9, 3, 5), lam('#c8c8d8'));
    o.position.copy(v).multiplyScalar(4.6);
    o.quaternion.setFromUnitVectors(up, v);
  }
  add(g, Sph(0.9, 6, 4), basic('#ff2a2a'), { y: 4.2, z: 1.2 });
  add(g, Box(0.4, 10, 0.4), lam('#ffffff'), { y: -9 });
  if (hat) partyHat(g, 5.5);
  return g;
}

function wings(g, color, span, chord, y = 0) {
  const l = new THREE.Group(), r = new THREE.Group();
  add(l, Box(span, 0.25, chord), lam(color), { x: -span / 2 });
  add(r, Box(span, 0.25, chord), lam(color), { x: span / 2 });
  l.position.y = r.position.y = y;
  g.add(l, r);
  g.userData.wings = [l, r];
}

export function makeGull(hat) {
  const g = new THREE.Group();
  add(g, Box(1.4, 1.2, 4), lam('#f4f4f4'));
  add(g, Sph(0.9, 6, 5), lam('#f4f4f4'), { y: 0.6, z: 2.2 });
  add(g, Cone(0.35, 1.4, 5), lam(C.orange), { y: 0.5, z: 3.4, rx: PI / 2 });
  add(g, Sph(0.22, 4, 3), basic('#000'), { x: 0.5, y: 0.9, z: 2.7 });
  add(g, Sph(0.22, 4, 3), basic('#000'), { x: -0.5, y: 0.9, z: 2.7 });
  add(g, Box(1.2, 0.2, 1.6), lam('#888'), { z: -2.6 });
  wings(g, '#e8e8e8', 4, 1.6, 0.3);
  if (hat) partyHat(g, 1.8);
  return g;
}

export function makePigeon(hat) {
  const g = new THREE.Group();
  add(g, Ico(2.2, 1), lam('#7a84a0'), { s: [1, 0.9, 1.4] });
  add(g, Sph(1.3, 7, 5), lam('#5a6a8a'), { y: 1.6, z: 2.4 });
  add(g, Cone(0.4, 1.2, 5), lam('#d8b880'), { y: 1.4, z: 3.9, rx: PI / 2 });
  add(g, Sph(0.35, 5, 4), basic('#ff2020'), { x: 0.7, y: 2, z: 3.2 });
  add(g, Sph(0.35, 5, 4), basic('#ff2020'), { x: -0.7, y: 2, z: 3.2 });
  add(g, Cyl(0.9, 0.9, 1.6, 8), lam('#111'), { y: 3.4, z: 2.2 });
  add(g, Cyl(1.4, 1.4, 0.2, 8), lam('#111'), { y: 2.7, z: 2.2 });
  wings(g, '#6a7490', 3.6, 2, 0.5);
  if (hat) partyHat(g, 4.8);
  return g;
}

export function makeUfo(hat) {
  const g = new THREE.Group();
  add(g, Cyl(8, 10, 2.2, 16), new THREE.MeshPhongMaterial({ color: '#b8c0c8', shininess: 90 }));
  add(g, Cyl(4, 6, 1.5, 12), lam('#4a5058'), { y: -1.6 });
  add(g, new THREE.SphereGeometry(4.2, 12, 8, 0, PI * 2, 0, PI / 2), new THREE.MeshPhongMaterial({ color: '#7affd8', transparent: true, opacity: 0.6 }), { y: 1 });
  add(g, Sph(1.4, 8, 6), lam('#5aff5a'), { y: 2 });
  const lights = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    lights.push(add(g, Sph(0.6, 5, 4), basic('#ffd23a'), { x: Math.cos(a) * 9, z: Math.sin(a) * 9 }));
  }
  if (hat) partyHat(g, 6);
  g.userData.lights = lights;
  return g;
}

export function makeStorm(hat) {
  const g = new THREE.Group();
  const m = lam('#5a5f6c');
  for (const [x, y, z, r] of [[0, 0, 0, 12], [10, -2, 2, 9], [-10, -1, -1, 9], [4, 5, -3, 8], [-5, 4, 3, 8], [0, -3, 8, 7]]) add(g, Ico(r, 1), m, { x, y, z });
  add(g, Sph(2.2, 8, 6), basic('#ffffff'), { x: 4, y: 2, z: 11.5 });
  add(g, Sph(2.2, 8, 6), basic('#ffffff'), { x: -4, y: 2, z: 11.5 });
  add(g, Sph(1, 6, 4), basic('#000000'), { x: 4, y: 1.5, z: 13.4 });
  add(g, Sph(1, 6, 4), basic('#000000'), { x: -4, y: 1.5, z: 13.4 });
  add(g, Box(4, 0.8, 0.8), basic('#222222'), { x: 4, y: 4.6, z: 12.6, rz: -0.4 });
  add(g, Box(4, 0.8, 0.8), basic('#222222'), { x: -4, y: 4.6, z: 12.6, rz: 0.4 });
  if (hat) partyHat(g, 14);
  return g;
}

// ---------- objective pieces ----------

export function makeRing(R, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.55, flatShading: true });
  const torus = new THREE.Mesh(Tor(R, Math.max(1, R * 0.09), 8, 36), mat);
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(Tor(R, R * 0.2, 6, 36), glowMat);
  const studs = new THREE.Group();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    const s = new THREE.Mesh(Oct(R * 0.12), basic('#ffffff'));
    s.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    studs.add(s);
  }
  g.add(torus, glow, studs);
  g.userData = { torus, glow, studs, mat, glowMat, R };
  return g;
}

export function setRingColor(ring, color) {
  ring.userData.mat.color.set(color);
  ring.userData.mat.emissive.set(color);
  ring.userData.glowMat.color.set(color);
}

export function makeStar() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 2.4 : 5.5, a = (i / 10) * PI * 2 + PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 1 });
  geo.center();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#ffd23a', emissive: '#ffb000', emissiveIntensity: 0.6, flatShading: true }));
  const g = new THREE.Group();
  g.add(m);
  const glow = new THREE.Mesh(Sph(7, 10, 8), basic('#fff3a0', { transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(glow);
  return g;
}

export function makeBalloon(color) {
  const g = new THREE.Group();
  add(g, Sph(4.5, 12, 10), new THREE.MeshPhongMaterial({ color, shininess: 80, specular: '#ffffff' }), { s: [1, 1.2, 1] });
  add(g, Cone(0.8, 1.2, 6), lam(color), { y: -5.6, rx: PI });
  add(g, Box(0.15, 10, 0.15), basic('#ffffff'), { y: -11 });
  return g;
}

export function makeGoose() {
  const g = new THREE.Group();
  const gold = new THREE.MeshPhongMaterial({ color: '#ffcc33', emissive: '#8a5a00', emissiveIntensity: 0.4, shininess: 100, specular: '#ffffff', flatShading: true });
  add(g, Sph(3, 8, 6), gold, { s: [1, 0.9, 1.6] });
  add(g, Cyl(0.7, 0.9, 4, 6), gold, { y: 2.6, z: 3.6, rx: 0.5 });
  add(g, Sph(1.3, 8, 6), gold, { y: 4.6, z: 4.8 });
  add(g, Cone(0.5, 1.8, 6), lam(C.orange), { y: 4.4, z: 6.6, rx: PI / 2 });
  add(g, Sph(0.3, 4, 3), basic('#000'), { x: 0.8, y: 5, z: 5.5 });
  add(g, Sph(0.3, 4, 3), basic('#000'), { x: -0.8, y: 5, z: 5.5 });
  add(g, Cone(1.2, 2.4, 5), gold, { z: -5, rx: -PI / 2 - 0.4 });
  wings(g, '#ffe080', 6, 3, 1);
  const glow = add(g, Sph(8, 10, 8), basic('#fff0a0', { transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.userData.glow = glow;
  return g;
}

export function makeArch(R) {
  const g = new THREE.Group();
  const stone = lam('#b88a5a');
  add(g, Tor(R, 6, 7, 20, PI), stone);
  add(g, Box(12, 40, 12), stone, { x: R, y: -20 });
  add(g, Box(12, 40, 12), stone, { x: -R, y: -20 });
  const glowMat = basic('#7affd8', { transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  add(g, new THREE.CircleGeometry(R - 6, 24, 0, PI), glowMat);
  g.userData.glowMat = glowMat;
  return g;
}

export function makeLandmark(type, s) {
  const p = PROPS[type];
  const m = new THREE.Mesh(p.geo, propMaterial);
  m.scale.setScalar(s);
  m.userData.keep = true;
  m.userData.height = p.geo.boundingBox.max.y * s;
  return m;
}

export function makeArrow3D(color = '#ff4dc4') {
  const g = new THREE.Group();
  const mat = basic(color, { transparent: true, opacity: 0.9, depthTest: false });
  add(g, Cyl(0.7, 0.7, 7, 8), mat, { rx: PI / 2, z: -1 });
  add(g, Cone(2, 4, 10), mat, { rx: PI / 2, z: 4.5 });
  g.renderOrder = 10;
  g.traverse((o) => { o.renderOrder = 10; });
  return g;
}

export function makeBird() {
  const g = new THREE.Group();
  add(g, Box(0.8, 0.6, 2), lam('#2a2a3a'));
  wings(g, '#2a2a3a', 2.4, 1, 0.1);
  return g;
}

// ---------- text ----------

export function makeTextTexture(lines, { w = 1024, h = 512, bg = '#ffd23a', fg = '#1d1b2e', border = '#1d1b2e', size = 110 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  if (bg) {
    c.fillStyle = border;
    c.beginPath(); c.roundRect(0, 0, w, h, 60); c.fill();
    c.fillStyle = bg;
    c.beginPath(); c.roundRect(18, 18, w - 36, h - 36, 46); c.fill();
  }
  c.fillStyle = fg;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let fs = size;
  c.font = `700 ${fs}px Fredoka, 'Trebuchet MS', sans-serif`;
  const widest = Math.max(...lines.map((l) => c.measureText(l).width));
  if (widest > w - 80) { fs = Math.floor((fs * (w - 80)) / widest); c.font = `700 ${fs}px Fredoka, 'Trebuchet MS', sans-serif`; }
  const lh = fs * 1.15, y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    if (!bg) { c.lineWidth = fs * 0.14; c.strokeStyle = border; c.strokeText(l, w / 2, y0 + i * lh); }
    c.fillText(l, w / 2, y0 + i * lh);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeTextSprite(lines, scale = 40, opts = {}) {
  const tex = makeTextTexture(lines, opts);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  const aspect = (opts.w || 1024) / (opts.h || 512);
  s.scale.set(scale * aspect, scale, 1);
  return s;
}

// A sky billboard held up by two balloons. Front faces +Z.
export function makeSign(lines) {
  const g = new THREE.Group();
  const tex = makeTextTexture(lines, { bg: '#fff6d8' });
  add(g, new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  add(g, Box(62, 32, 0.8), lam('#5a3a1a'), { z: -0.6 });
  for (const x of [-22, 22]) {
    add(g, Box(0.3, 30, 0.3), basic('#ffffff'), { x, y: 30 });
    add(g, Sph(7, 10, 8), new THREE.MeshPhongMaterial({ color: x < 0 ? '#ff4d6d' : '#4dd6ff', shininess: 80 }), { x, y: 48, s: [1, 1.2, 1] });
  }
  return g;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.userData.keep) return;
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m.map) m.map.dispose(); if (m !== propMaterial) m.dispose(); }
    }
  });
}

// Bosses wear crowns. It's in the union contract.
export function makeCrown(s = 1) {
  const g = new THREE.Group();
  const gold = new THREE.MeshPhongMaterial({ color: '#ffcc33', emissive: '#8a5a00', emissiveIntensity: 0.5, shininess: 100, flatShading: true });
  add(g, Cyl(2, 2, 1.2, 10), gold, { y: 0.6 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2;
    add(g, Cone(0.55, 1.8, 5), gold, { x: Math.cos(a) * 1.7, y: 2, z: Math.sin(a) * 1.7 });
    add(g, Sph(0.3, 5, 4), basic(k % 2 ? '#ff3a5a' : '#3ad8ff'), { x: Math.cos(a) * 2, y: 0.6, z: Math.sin(a) * 2 });
  }
  g.scale.setScalar(s);
  return g;
}
