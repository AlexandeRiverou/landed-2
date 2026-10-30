// Low-poly models built from primitives. Props are merged into one vertex-coloured
// geometry each so terrain chunks can draw them with a single InstancedMesh per type.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pick } from './texts.js';

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
  buildMoreProps();
  buildFantasyProps();
  buildNewWorldProps();
  buildCityProps();
  buildCountryProps();
}

// ---------- the countryside, the beach, the snow, and some questionable landmarks ----------
function buildMoreProps() {
  const apple = [P(Cyl(0.8, 1.2, 5), C.trunk, { y: 2.5 }), P(Ico(5, 1), '#4f9a3a', { y: 8 })];
  for (let k = 0; k < 7; k++) { const a = k * 2.4; apple.push(P(Ico(0.6), '#e8302a', { x: Math.cos(a) * 4.2, y: 7 + (k % 3) * 1.6, z: Math.sin(a) * 4.2 })); }
  def('appleTree', apple, { scale: [0.8, 1.3] });
  def('haybale', [P(Cyl(2, 2, 3, 10), '#e0c060', { y: 2, rz: PI / 2 }), P(Cyl(2.05, 2.05, 0.4, 10), '#b89a40', { y: 2, rz: PI / 2 })], { scale: [0.9, 1.3], sink: 0.3 });
  const legs = (w, l, h, c) => [[w, l], [-w, l], [w, -l], [-w, -l]].map(([x, z]) => P(Box(0.5, h, 0.5), c, { x, y: h / 2, z }));
  def('sheep', [P(Ico(2, 1), '#f4f4ee', { y: 3, sz: 1.3 }), P(Box(1.2, 1.4, 1.6), C.black, { y: 3.6, z: 2.6 }), ...legs(1, 1.3, 2, C.black)], { scale: [1.6, 2.2], sink: 0.1 });
  def('cow', [
    P(Box(3, 2.4, 5), '#ffffff', { y: 3.4 }), P(Box(1.4, 1.2, 1.6), C.black, { x: 0.9, y: 4.2, z: 0.6 }), P(Box(1.6, 1, 1.2), C.black, { x: -0.8, y: 3, z: -1.4 }),
    P(Box(1.8, 1.8, 2), '#ffffff', { y: 4.4, z: 3.2 }), P(Box(1.9, 0.8, 0.8), '#ffb0b0', { y: 3.8, z: 4.3 }),
    P(Cone(0.3, 1, 4), '#f0e8d0', { x: 0.8, y: 5.6, z: 3, rz: -0.4 }), P(Cone(0.3, 1, 4), '#f0e8d0', { x: -0.8, y: 5.6, z: 3, rz: 0.4 }),
    ...legs(1.1, 1.8, 2.2, '#ffffff'),
  ], { scale: [1.5, 2] , sink: 0.1 });
  def('scarecrow', [P(Box(0.4, 9, 0.4), C.trunk, { y: 4.5 }), P(Box(6, 0.4, 0.4), C.trunk, { y: 6.5 }), P(Box(3, 3, 1.2), '#5a7ad0', { y: 6 }), P(Sph(1.2, 7, 5), '#e8c890', { y: 8.6 }), P(Cone(1.8, 2, 8), '#c89a50', { y: 10 })], { scale: [0.9, 1.2] });
  const fl = [];
  [['#ff4d6d', 0, 0], ['#ffd23a', 1.6, 0.8], ['#c77dff', -1.4, 1.2], ['#ffffff', 0.8, -1.5], ['#ff9a3a', -1.2, -1], ['#4dd6ff', 2, -0.6]].forEach(([c, x, z]) => {
    fl.push(P(Box(0.15, 1.6, 0.15), '#3a8a2a', { x, y: 0.8, z }), P(Ico(0.55), c, { x, y: 1.7, z }));
  });
  def('flowers', fl, { scale: [1.4, 2.2], sink: 0 });
  def('barn', [
    P(Box(12, 8, 16), '#c0392b', { y: 4 }), P(Box(13, 0.6, 9.6), '#5a3a2a', { y: 10.2, z: 0, x: 3.1, rz: -0.62 }), P(Box(13, 0.6, 9.6), '#5a3a2a', { y: 10.2, x: -3.1, rz: 0.62 }),
    P(Box(4, 5, 0.3), '#f4f0e0', { y: 2.5, z: 8.05 }), P(Cyl(3, 3, 16, 10), '#d0d4d8', { x: 9.5, y: 8 }), P(Sph(3, 10, 6), '#8a9098', { x: 9.5, y: 16, sy: 0.6 }),
  ], { scale: [1, 1.3] });
  def('well', [P(Cyl(2.5, 2.5, 2, 10), '#9a948a', { y: 1 }), P(Box(0.4, 5, 0.4), C.trunk, { x: 2, y: 3.5 }), P(Box(0.4, 5, 0.4), C.trunk, { x: -2, y: 3.5 }), P(Cone(3.4, 2, 4), C.roof, { y: 6.6, ry: PI / 4 })], { scale: [1, 1.3] });
  def('log', [P(Cyl(1, 1, 8, 7), '#7a5232', { y: 0.9, rz: PI / 2 }), P(Cyl(0.9, 0.9, 8.05, 7), '#c8a070', { y: 0.9, rz: PI / 2, sy: 1.001 }), P(Ico(0.8), C.leaf2, { x: 2, y: 2 })], { scale: [0.8, 1.4], sink: 0.2 });
  def('tent', [P(Cone(4, 5, 4), '#ff8a1f', { y: 2.5, ry: PI / 4 }), P(Box(1.5, 2.5, 0.2), '#5a3a1a', { y: 1.2, z: 2.1 }), P(Ico(0.8), '#ff5a1a', { x: 4, y: 0.5 })], { scale: [1, 1.3], sink: 0.2 });
  const totem = [];
  ['#c0392b', '#2a7ad0', '#e8b030', '#2a9a5a'].forEach((c, k) => {
    totem.push(P(Box(2.4, 3, 2.4), c, { y: 1.5 + k * 3 }), P(Box(0.5, 0.5, 0.2), C.white, { x: 0.6, y: 2 + k * 3, z: 1.25 }), P(Box(0.5, 0.5, 0.2), C.white, { x: -0.6, y: 2 + k * 3, z: 1.25 }));
  });
  totem.push(P(Box(7, 0.6, 1.2), '#e8b030', { y: 11 }));
  def('totemPole', totem, { scale: [1, 1.4] });
  def('tumbleweed', [P(Ico(2, 1), '#a8864a', { y: 2 }), P(Ico(1.6, 0), '#8a6a3a', { y: 2, rx: 0.7 })], { scale: [0.7, 1.3], sink: 0 });
  const ruins = [P(Box(14, 1, 9), '#d8d0b8', { y: 0.5 })];
  [[-5, 3, 9], [-1.7, 3, 4], [1.7, 3, 7.5], [5, 3, 2.5], [-5, -3, 6], [5, -3, 9]].forEach(([x, z, h]) => ruins.push(P(Cyl(0.9, 1, h, 8), '#e8e0c8', { x, y: 1 + h / 2, z })));
  ruins.push(P(Box(12, 1, 1.6), '#e8e0c8', { x: 0, y: 10.5, z: -3 }), P(Cyl(0.9, 0.9, 7, 8), '#d0c8b0', { x: 1, y: 1.8, z: -1, rz: PI / 2, ry: 0.4 }));
  def('ruins', ruins, { scale: [1.2, 1.8] });
  def('snowman', [P(Sph(2.6, 8, 6), C.snow, { y: 2.4 }), P(Sph(1.9, 8, 6), C.snow, { y: 6 }), P(Sph(1.3, 8, 6), C.snow, { y: 8.8 }), P(Cone(0.3, 1.6, 5), C.orange, { y: 8.8, z: 1.6, rx: PI / 2 }), P(Cyl(1, 1, 1.6, 8), C.black, { y: 10.6 }), P(Cyl(1.5, 1.5, 0.2, 8), C.black, { y: 9.9 }), P(Box(4, 0.4, 0.4), '#c0392b', { y: 7.5 })], { scale: [0.9, 1.4], sink: 0.3 });
  def('igloo', [P(new THREE.SphereGeometry(5, 10, 6, 0, PI * 2, 0, PI / 2), '#f0f6ff', {}), P(new THREE.CylinderGeometry(1.8, 1.8, 3.5, 8, 1, false, 0, PI), '#e0eaf6', { y: 0, z: 5, rx: PI / 2, rz: PI / 2 })], { scale: [1, 1.4], sink: 0.2 });
  def('parasol', [P(Box(0.3, 6, 0.3), C.white, { y: 3 }), P(Cone(4, 1.6, 8), '#ff4d6d', { y: 6.4 }), P(Box(2, 0.1, 4), '#4dd6ff', { x: 2.5, y: 0.1 })], { scale: [0.9, 1.3], sink: 0, tints: ['#ffffff', '#ffe08a', '#a0d0ff', '#c0ffa0'] });
  const castle = [P(Box(6, 2, 6), '#e8d090', { y: 1 })];
  for (const [x, z] of [[2.6, 2.6], [-2.6, 2.6], [2.6, -2.6], [-2.6, -2.6]]) castle.push(P(Cyl(0.9, 1, 3.5, 8), '#e0c880', { x, y: 1.75, z }), P(Cone(1.1, 1.4, 8), '#d8b870', { x, y: 4.2, z }));
  castle.push(P(Box(0.1, 1, 0.8), '#ff4d6d', { y: 3, x: 2.6, z: 2.6 }));
  def('sandcastle', castle, { scale: [0.9, 1.4], sink: 0.2 });
  def('iceberg', [P(Ico(8), '#eaf6ff', { y: 0, sy: 1.5 }), P(Ico(5), '#c8e8ff', { x: 6, y: 1, z: 2, sy: 1.8 })], { scale: [0.8, 1.6], sea: true, sink: 3, nonUniform: true });
  def('whale', [
    P(Sph(6, 10, 8), '#4a6a8a', { y: 0, sz: 2.4 }), P(Sph(5.6, 10, 6), '#d8e0e8', { y: -1.2, z: 1, sz: 2.2 }),
    P(Box(7, 0.6, 2.6), '#4a6a8a', { y: 1.5, z: -15, rx: -0.4 }), P(Sph(0.6, 5, 4), C.black, { x: 4.6, y: 1.5, z: 9 }), P(Sph(0.6, 5, 4), C.black, { x: -4.6, y: 1.5, z: 9 }),
    P(Cone(1, 4, 6), '#e0f4ff', { y: 8, z: 5 }), P(Cone(0.7, 3, 6), '#e0f4ff', { x: 1, y: 9, z: 5, rz: -0.5 }), P(Cone(0.7, 3, 6), '#e0f4ff', { x: -1, y: 9, z: 5, rz: 0.5 }),
  ], { scale: [0.8, 1.3], sea: true, sink: 1 });
  def('sailboat', [P(Box(3, 1.6, 9), C.white, { y: 0.8 }), P(Box(3.1, 0.4, 9.1), '#2a5ad0', { y: 0.4 }), P(Cyl(0.15, 0.15, 12), C.trunk, { y: 7 }), P(Cone(4, 10, 3), '#fff8e0', { y: 7.5, z: -2.2, sx: 0.05 })], { scale: [0.9, 1.3], sea: true, sink: 0.5, tints: ['#ffffff', '#ffd0d0', '#d0ffe0'] });
  const tower = [];
  for (let k = 0; k < 6; k++) tower.push(P(Cyl(1.6 - k * 0.22, 1.8 - k * 0.22, 7, 4), k % 2 ? C.white : '#e8302a', { y: 3.5 + k * 7, ry: PI / 4 }));
  tower.push(P(Sph(0.8, 6, 4), '#ff2020', { y: 43 }), P(new THREE.SphereGeometry(3, 10, 6, 0, PI * 2, 0, PI / 2), '#d0d4d8', { y: 26, z: 2.5, rx: PI / 2 }));
  def('radioTower', tower, { scale: [1, 1.3] });
  const fw = [];
  for (const z of [-1.5, 1.5]) fw.push(P(Tor(12, 0.5, 4, 32), '#e8e8f0', { y: 17, z }));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    fw.push(P(Box(0.3, 24, 0.3), '#c8c8d8', { y: 17, rz: a / 2 }));
    fw.push(P(Box(2.2, 2, 2.2), ['#ff4d6d', '#ffd23a', '#4dd6ff', '#7aff6a'][k % 4], { x: Math.cos(a) * 12, y: 17 + Math.sin(a) * 12 - 1.6 }));
  }
  for (const x of [-1, 1]) for (const z of [-3, 3]) fw.push(P(Box(0.6, 19, 0.6), '#8a8aa0', { x: x * 4.5, y: 8, z, rz: -x * 0.24 }));
  fw.push(P(Cyl(0.8, 0.8, 7, 8), '#8a8aa0', { y: 17, rx: PI / 2 }));
  def('ferrisWheel', fw, { scale: [1, 1.3] });
  const stones = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2; stones.push(P(Box(2.2, 7, 1.4), '#9a968c', { x: Math.cos(a) * 10, y: 3.5, z: Math.sin(a) * 10, ry: -a })); }
  for (let k = 0; k < 8; k += 2) { const a = ((k + 0.5) / 8) * PI * 2; stones.push(P(Box(1.6, 1.2, 8.5), '#8a867c', { x: Math.cos(a) * 9.6, y: 7.6, z: Math.sin(a) * 9.6, ry: -a })); }
  def('stoneCircle', stones, { scale: [1, 1.4], sink: 0.4 });
}

// ---------- the princess kingdom and the caverns ----------
function buildFantasyProps() {
  // A fairy-tale castle: a keep with four pink-roofed towers, a gate and pennants.
  const fc = [P(Box(14, 12, 14), '#f4ecf8', { y: 6 }), P(Cyl(3.2, 3.6, 22, 10), '#f8f0fc', { y: 11 }), P(Cone(4.2, 9, 10), '#ff7ac0', { y: 26.5 }), P(Box(0.15, 2.4, 1.8), '#ffd23a', { y: 32, z: 0.9 })];
  for (const [x, z] of [[7, 7], [-7, 7], [7, -7], [-7, -7]]) fc.push(P(Cyl(2.2, 2.4, 16, 8), '#f8f0fc', { x, y: 8, z }), P(Cone(3, 6, 8), '#c07aff', { x, y: 19, z }));
  fc.push(P(Box(4, 6, 0.3), '#a05ad0', { y: 3, z: 7.05 }), P(new THREE.CylinderGeometry(2, 2, 0.31, 12, 1, false, 0, PI), '#a05ad0', { y: 6, z: 7.05, rx: PI / 2, rz: PI / 2 }));
  for (let k = 0; k < 6; k++) fc.push(P(Box(1.4, 1.2, 1.4), '#f4ecf8', { x: -6 + k * 2.4, y: 12.6, z: 7 }));
  def('fairyCastle', fc, { scale: [1, 1.4] });

  const legs = [[0.9, 1.4], [-0.9, 1.4], [0.9, -1.4], [-0.9, -1.4]].map(([x, z]) => P(Box(0.5, 2.4, 0.5), '#ffffff', { x, y: 1.2, z }));
  def('unicorn', [
    P(Box(2.4, 2.2, 4.4), '#ffffff', { y: 3.3 }), ...legs, P(Box(1.2, 2.4, 1.2), '#ffffff', { y: 4.8, z: 2.4, rx: -0.4 }),
    P(Box(1.3, 1.3, 2.2), '#ffffff', { y: 5.9, z: 3.4 }), P(Cone(0.3, 2.2, 6), '#ffd23a', { y: 7.4, z: 3.8, rx: 0.5 }),
    P(Box(0.5, 2.6, 1.6), '#ff7ac0', { y: 5.4, z: 2.1, rx: -0.4 }), P(Box(0.5, 0.6, 0.5), '#7ad8ff', { y: 6.4, z: 1.5 }),
    P(Box(0.6, 2.6, 0.6), '#c07aff', { y: 3, z: -2.6, rx: 0.5 }), P(Sph(0.18, 4, 3), C.black, { x: 0.66, y: 6.2, z: 3.8 }), P(Sph(0.18, 4, 3), C.black, { x: -0.66, y: 6.2, z: 3.8 }),
  ], { scale: [1.4, 2], sink: 0.1 });

  // Two puffs and a point: a heart-shaped canopy on a slim trunk.
  def('heartTree', [
    P(Cyl(0.6, 0.9, 6, 6), '#b07a5a', { y: 3 }), P(Ico(3.2, 1), '#ff8ac8', { x: -2, y: 9.5 }), P(Ico(3.2, 1), '#ff8ac8', { x: 2, y: 9.5 }),
    P(Cone(4.6, 5.5, 4), '#ff8ac8', { y: 6.6, rz: PI, ry: PI / 4, sz: 0.55 }),
  ], { scale: [0.8, 1.3], tints: ['#ffffff', '#ffd0f0', '#e0d0ff', '#fff0d0'] });

  def('carriage', [
    P(Sph(3.2, 10, 8), '#ff9a3a', { y: 4.4, sx: 1.1 }), P(Box(0.4, 2.4, 0.4), '#3a8a2a', { y: 8 }), P(Ico(0.7), '#3a8a2a', { x: 0.5, y: 9.2 }),
    P(Box(1.6, 1.8, 0.2), '#ffe08a', { y: 4.4, z: 3.2 }),
    ...[[2.6, 2], [-2.6, 2], [2.6, -2], [-2.6, -2]].map(([x, z]) => P(Tor(1.2, 0.2, 4, 12), '#ffd23a', { x, y: 1.4, z, ry: PI / 2 })),
  ], { scale: [1.1, 1.5], sink: 0.2, tints: ['#ffffff', '#ffd0f0', '#e0ffe0'] });

  const glow = [];
  [[0, 0, 1], [2.2, 0.8, 0.7], [-1.8, -1, 0.8], [0.6, -2.2, 0.55]].forEach(([x, z, s]) => {
    glow.push(P(Cyl(0.35 * s, 0.5 * s, 4 * s, 6), '#e0f0ff', { x, y: 2 * s, z }), P(new THREE.SphereGeometry(2.2 * s, 8, 5, 0, PI * 2, 0, PI / 2), '#5af0ff', { x, y: 3.8 * s, z, sy: 0.7 }));
  });
  def('glowShroom', glow, { scale: [1, 2], sink: 0.1, tints: ['#ffffff', '#b0ffd0', '#e0b0ff', '#b0d0ff'] });

  def('stalagmite', [P(Cone(3, 14, 6), '#6a6070', { y: 7 }), P(Cone(1.8, 8, 5), '#7a7080', { x: 2.6, y: 4, z: 1 }), P(Cone(1.4, 6, 5), '#5a5060', { x: -2.2, y: 3, z: -1.2 })], { scale: [0.8, 2], sink: 0.5, tilt: 0.15 });
}

// ---------- the reef and Blockland ----------
function buildNewWorldProps() {
  // Branching coral: a stubby trunk with forked arms and round tips.
  const coral = [P(Cyl(0.9, 1.3, 4, 6), '#ff7a8a', { y: 2 })];
  [[0, 0.6], [2.1, -0.5], [4.2, 0.5], [1, -0.9], [3.1, 0.8]].forEach(([a, t], k) => {
    const h = 5 + (k % 3) * 1.5;
    coral.push(P(Cyl(0.45, 0.7, h, 5), '#ff7a8a', { x: Math.cos(a) * 1.6, y: 3 + h / 2, z: Math.sin(a) * 1.6, rx: Math.sin(a) * t, rz: -Math.cos(a) * t }));
    coral.push(P(Sph(0.9, 6, 4), '#ffd0a0', { x: Math.cos(a) * (1.6 + h * 0.45 * Math.abs(t)), y: 3 + h * 0.95, z: Math.sin(a) * (1.6 + h * 0.45 * Math.abs(t)) }));
  });
  coral.push(P(Sph(2.2, 8, 5), '#c07aff', { x: 3, y: 1, z: 2, sy: 0.7 }));
  def('coral', coral, { scale: [0.9, 2.2], sink: 0.4, tints: ['#ffffff', '#ffb0d8', '#a0f0ff', '#ffe08a', '#c8a0ff'] });

  // Kelp: a few tall swaying strands with leaf blades.
  const kelp = [];
  [[0, 0, 26], [2, 1, 20], [-1.6, 1.4, 17], [0.8, -1.8, 22]].forEach(([x, z, h], k) => {
    for (let i = 0; i < 5; i++) {
      const y = (i + 0.5) * (h / 5), sway = Math.sin(i * 1.3 + k) * 0.8;
      kelp.push(P(Cyl(0.25, 0.3, h / 5 + 0.3, 4), '#4a8a2a', { x: x + sway, y, z }));
      kelp.push(P(Box(2.4, 0.15, 1), i % 2 ? '#6ab03a' : '#8ac84a', { x: x + sway + 1, y: y + 1, z, ry: i * 1.7 + k, rz: -0.5 }));
    }
  });
  def('kelp', kelp, { scale: [0.8, 1.6], sink: 0.2, tints: ['#ffffff', '#e0ffb0', '#c0e8a0'] });

  // A school of little fish swimming in a loose ring.
  const fish = [];
  for (let k = 0; k < 14; k++) {
    const a = k * 2.4, r = 5 + (k % 4) * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, y = Math.sin(k * 1.7) * 3;
    fish.push(P(Sph(1, 6, 4), '#ffb03a', { x, y, z, sz: 1.8, ry: a }), P(Cone(0.8, 1.2, 4), '#ff7a2a', { x: x - Math.sin(a) * 2, y, z: z - Math.cos(a) * 2, rx: PI / 2, ry: a }));
  }
  def('fishSchool', fish, { scale: [1, 1.8], sink: 0, tints: ['#ffffff', '#a0e0ff', '#ffe060', '#ff9ad0'] });

  // A sunken ship, listing on the seabed.
  def('shipwreck', [
    P(Box(7, 5, 22), '#6a4a32', { y: 2, rz: 0.25 }), P(Cone(3.6, 6, 4), '#5a3a26', { y: 2, z: 13.5, rx: PI / 2, ry: PI / 4, sx: 1.3, rz: 0.25 }),
    P(Box(6, 0.4, 20), '#8a6a4a', { x: 1.2, y: 4.6, rz: 0.25 }), P(Cyl(0.4, 0.5, 18, 5), '#5a3a26', { x: 3, y: 12, z: 2, rz: 0.4 }),
    P(Box(0.2, 7, 6), '#d8d0b8', { x: 3.6, y: 11, z: 2, rz: 0.4 }), P(Box(2.4, 1.8, 1.6), '#c8a03a', { x: -6, y: 0.4, z: -4 }),
  ], { scale: [1, 1.5], sink: 0.8, tilt: 0.1 });

  // Blockland's trees are cubes on sticks.
  def('blockTree', [P(Box(1.6, 6, 1.6), '#8a5a32', { y: 3 }), P(Box(7, 6, 7), '#3ab03a', { y: 9 }), P(Box(4, 3, 4), '#5ad04a', { y: 13.5 })], { scale: [0.8, 1.4], tints: ['#ffffff', '#c0ffa0', '#ffe080', '#ffb0b0'] });
}

// ---------- the city (Metropolis) ----------
// Vehicles, lamps and anything with an arm face +z; the city places them with a fixed heading.
// Cities hold thousands of these, so they're mostly boxes: an axle box pokes out both sides as a pair of wheels.
const wheels = (xs, zs, r) => xs.flatMap((x) => zs.map((z) => P(Cyl(r, r, 0.5, 8), C.black, { x, y: r, z, rz: PI / 2 })));
const axles = (w, zs, r) => zs.map((z) => P(Box(w, r * 2, r * 2), C.black, { y: r, z }));
function buildCityProps() {
  const car = (body) => [
    P(Box(2, 0.9, 4.6), body, { y: 0.95 }), P(Box(1.8, 0.8, 2.4), body, { y: 1.8, z: -0.2 }), P(Box(1.84, 0.5, 2.2), '#2a3440', { y: 1.85, z: -0.2 }),
    P(Box(1.7, 0.25, 0.1), '#fff4c0', { y: 1.05, z: 2.31 }), P(Box(1.7, 0.2, 0.1), '#ff3030', { y: 1.05, z: -2.31 }),
    ...axles(2.1, [-1.45, 1.45], 0.42),
  ];
  def('car', car('#f2f2f2'), { scale: [1.2, 1.3], sink: 0, tints: ['#d8433a', '#3d6fd1', '#f2efe6', '#3a3a44', '#9aa0a6', '#4aa05a', '#ff8a1f', '#8a3ab0'] });
  def('taxi', [...car('#ffc81a'), P(Box(2.02, 0.2, 4.62), '#2a2a2a', { y: 1.1 }), P(Box(0.9, 0.35, 0.5), '#fff4c0', { y: 2.38, z: -0.2 })], { scale: [1.2, 1.3], sink: 0 });
  const bus = [P(Box(2.6, 2.6, 11), '#f2f2f2', { y: 1.9 }), P(Box(2.64, 1, 10.2), '#2a3440', { y: 2.4, z: -0.2 }), P(Box(2.3, 1, 0.1), '#2a3440', { y: 2.4, z: 5.51 }), P(Box(2.4, 0.3, 4), '#d0d0d0', { y: 3.35, z: -2 }), ...axles(2.7, [-3.6, 3.4], 0.6)];
  def('bus', bus, { scale: [1.2, 1.25], sink: 0, tints: ['#e8402a', '#3d7fd1', '#3aa05a', '#ffb020'] });
  def('streetLamp', [
    P(Box(0.3, 8, 0.3), '#3a3e44', { y: 4 }), P(Box(0.16, 0.16, 2.6), '#3a3e44', { y: 8, z: 1.2 }), P(Box(0.6, 0.3, 1.1), '#fff2b0', { y: 7.9, z: 2.4 }),
  ], { scale: [1.15, 1.25], sink: 0 });
  def('trafficLight', [
    P(Box(0.36, 6.6, 0.36), '#3a3e44', { y: 3.3 }), P(Box(0.18, 0.18, 5), '#3a3e44', { y: 6.4, z: 2.5 }), P(Box(0.7, 2.1, 0.6), '#22252a', { y: 5.4, z: 4.8 }),
    P(Box(0.44, 0.44, 0.8), '#ff3a2a', { y: 6.05, z: 4.8 }), P(Box(0.44, 0.44, 0.8), '#ffc21a', { y: 5.4, z: 4.8 }), P(Box(0.44, 0.44, 0.8), '#3aff6a', { y: 4.75, z: 4.8 }),
  ], { scale: [1.15, 1.2], sink: 0 });
  def('parkTree', [
    P(Box(2.6, 0.9, 2.6), '#a09a90', { y: 0.45 }), P(Box(0.6, 3.4, 0.6), C.trunk, { y: 2.4 }), P(Ico(2.6), C.leaf, { y: 5.4 }), P(Ico(1.7), C.leaf2, { x: 1.2, y: 6.4, z: 0.5 }),
  ], { scale: [1, 1.25], sink: 0 });
  def('bench', [
    P(Box(2.4, 0.15, 0.7), '#a87a4a', { y: 0.55 }), P(Box(2.4, 0.6, 0.12), '#a87a4a', { y: 1, z: -0.32 }),
    P(Box(0.12, 0.55, 0.6), C.black, { x: 1, y: 0.27 }), P(Box(0.12, 0.55, 0.6), C.black, { x: -1, y: 0.27 }),
  ], { scale: [1.4, 1.6], sink: 0 });
  // Rooftops: water towers, helipads, antennas, billboards, building-site cranes and a supertall's spire.
  const wt = [P(Cyl(2.6, 2.6, 4.2, 10), '#8a5a3a', { y: 8.1 }), P(Cyl(2.66, 2.66, 0.25, 10), '#4a3a2a', { y: 7 }), P(Cyl(2.66, 2.66, 0.25, 10), '#4a3a2a', { y: 9.2 }), P(Cone(2.9, 1.8, 10), '#5a4030', { y: 11.1 })];
  for (const [x, z] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) wt.push(P(Box(0.35, 6, 0.35), '#3a3a3a', { x, y: 3, z }));
  def('waterTower', wt, { scale: [1, 1.3], sink: 0 });
  def('helipad', [
    P(Cyl(9, 9, 0.5, 16), '#4a4e56', { y: 0.25 }), P(Tor(7.8, 0.35, 3, 24), '#ffd23a', { y: 0.55, rx: PI / 2, sz: 0.3 }),
    P(Box(0.9, 0.12, 5.5), '#ffffff', { x: 1.6, y: 0.56 }), P(Box(0.9, 0.12, 5.5), '#ffffff', { x: -1.6, y: 0.56 }), P(Box(2.4, 0.12, 0.9), '#ffffff', { y: 0.56 }),
  ], { scale: [0.9, 1], sink: 0 });
  def('antenna', [
    P(Box(2.4, 1.5, 2.4), '#9aa0a6', { y: 0.75 }), P(Cyl(0.25, 0.5, 22, 4), '#c8ccd2', { y: 12 }),
    P(Box(3.2, 0.2, 0.2), '#c8ccd2', { y: 9 }), P(Box(0.2, 0.2, 2.4), '#c8ccd2', { y: 15 }), P(Sph(0.5, 6, 4), '#ff2020', { y: 23.3 }),
  ], { scale: [0.8, 1.4], sink: 0 });
  def('billboard', [
    P(Box(0.4, 6, 0.4), '#3a3e44', { x: 4, y: 3 }), P(Box(0.4, 6, 0.4), '#3a3e44', { x: -4, y: 3 }), P(Box(12.4, 5.4, 0.4), '#2a2a30', { y: 8.5 }),
    P(Box(11.6, 4.6, 0.1), '#ffffff', { y: 8.5, z: 0.25 }), P(Box(11.6, 1.2, 0.12), '#ff4d6d', { y: 7.3, z: 0.26 }), P(Sph(1.2, 8, 6), '#ffd23a', { x: -3.6, y: 9.4, z: 0.3, sz: 0.2 }),
  ], { scale: [1, 1.2], sink: 0, tints: ['#ffffff', '#ffe08a', '#a0e0ff', '#ffb0d0', '#b0ffb0'] });
  def('crane', [
    P(Box(4, 1, 4), '#7a7a80', { y: 0.5 }), P(Box(2, 56, 2), '#ffc020', { y: 28 }), P(Box(2.6, 2.4, 2.6), '#e8e8e8', { y: 57.2, z: 1.4 }),
    P(Box(1.2, 1.4, 40), '#ffc020', { y: 59, z: 18 }), P(Box(1.2, 1.2, 12), '#ffc020', { y: 59, z: -6 }), P(Box(2.4, 2.4, 3), '#7a7a80', { y: 57.6, z: -10.5 }),
    P(Cone(1.4, 6, 4), '#ffc020', { y: 62.5, ry: PI / 4 }), P(Box(0.12, 18, 0.12), C.black, { y: 49.5, z: 30 }), P(Box(1.2, 1, 1.2), '#e8402a', { y: 40, z: 30 }),
  ], { scale: [0.9, 1.15], sink: 0 });
  def('spire', [P(Cyl(1.4, 2.6, 10, 6), '#c8ccd2', { y: 5 }), P(Cyl(0.7, 1.4, 14, 6), '#d8dce2', { y: 17 }), P(Cone(0.7, 16, 6), '#e8ecf2', { y: 32 }), P(Sph(0.7, 6, 4), '#ff2020', { y: 40.2 })], { scale: [1, 1.3], sink: 0 });
  // Plazas and parks: a copper statue holding up a torch, and a three-tier fountain.
  def('statue', [
    P(Box(10, 8, 10), '#b8b0a0', { y: 4 }), P(Box(11, 1, 11), '#a8a090', { y: 8.5 }), P(Cone(3.4, 13, 8), '#6ab8a0', { y: 15.5 }),
    P(Cyl(1.5, 2.1, 5, 8), '#6ab8a0', { y: 21 }), P(Sph(1.3, 8, 6), '#6ab8a0', { y: 24.6 }), P(Cone(1.6, 1.4, 7), '#6ab8a0', { y: 25.9 }),
    P(Cyl(0.5, 0.6, 6, 6), '#6ab8a0', { x: 2, y: 25.5, rz: -0.3 }), P(Cone(0.9, 1.6, 6), '#c8a03a', { x: 2.9, y: 29, rx: PI }), P(Ico(0.8), '#ffd23a', { x: 3, y: 30.2 }),
    P(Box(1.4, 2.2, 0.6), '#5aa890', { x: -1.8, y: 20, z: 1.2, rz: 0.3 }),
  ], { scale: [1, 1.15], sink: 0.2 });
  def('fountain', [
    P(Cyl(6, 6.2, 1.2, 14), '#c8c0b0', { y: 0.6 }), P(Cyl(5.5, 5.5, 0.2, 14), '#6ac8f0', { y: 1.15 }), P(Cyl(0.6, 0.8, 3.5, 8), '#c8c0b0', { y: 2.5 }),
    P(Cyl(2.4, 1, 0.8, 10), '#c8c0b0', { y: 4.4 }), P(Cyl(2.1, 2.1, 0.1, 10), '#6ac8f0', { y: 4.8 }), P(Cone(1.2, 3, 8), '#bfe8ff', { y: 6.3 }),
  ], { scale: [0.9, 1.2], sink: 0 });
}

// ---------- extras for the countryside, the desert and the snow ----------
function buildCountryProps() {
  def('picnicTable', [
    P(Box(3.6, 0.2, 1.6), '#a87a4a', { y: 1.4 }), P(Box(1.6, 0.04, 1.62), '#e84a4a', { y: 1.52 }),
    P(Box(3.6, 0.15, 0.5), '#a87a4a', { y: 0.85, z: 1.3 }), P(Box(3.6, 0.15, 0.5), '#a87a4a', { y: 0.85, z: -1.3 }),
    ...[1.4, -1.4].map((x) => P(Box(0.2, 1.4, 3), '#8a5a32', { x, y: 0.7 })), P(Box(0.6, 0.5, 0.4), '#c89a50', { x: 0.8, y: 1.75 }),
  ], { scale: [1.3, 1.6], sink: 0.1 });
  def('tractor', [
    P(Box(1.8, 1.4, 3.2), '#f2f2f2', { y: 1.7, z: 0.6 }), P(Box(1.9, 0.3, 2), '#f2f2f2', { y: 4.6, z: -0.7 }), P(Box(1.8, 2, 1.8), '#2a3440', { y: 3.4, z: -0.7 }),
    P(Cyl(0.12, 0.12, 1.8, 5), C.black, { x: 0.5, y: 3, z: 1.6 }), P(Box(1.4, 0.8, 0.1), '#ffe08a', { y: 1.8, z: 2.21 }),
    ...[1.2, -1.2].map((x) => P(Cyl(1.35, 1.35, 0.7, 10), C.black, { x, y: 1.35, z: -0.8, rz: PI / 2 })),
    ...[1.2, -1.2].map((x) => P(Cyl(0.5, 0.5, 0.74, 8), C.yellow, { x, y: 1.35, z: -0.8, rz: PI / 2 })),
    ...[1, -1].map((x) => P(Cyl(0.7, 0.7, 0.5, 8), C.black, { x, y: 0.7, z: 1.7, rz: PI / 2 })),
  ], { scale: [1.2, 1.4], sink: 0.1, tints: ['#d8433a', '#3a9a3a', '#3d6fd1', '#ff8a1f'] });
  def('camperVan', [
    P(Box(2.4, 2.4, 6), '#f2efe6', { y: 1.9 }), P(Box(2.42, 0.5, 6.02), '#ff8a1f', { y: 1.3 }), P(Box(2.1, 0.9, 0.1), '#2a3440', { y: 2.5, z: 3.01 }),
    P(Box(2.44, 0.7, 2.4), '#2a3440', { y: 2.5, z: -0.8 }), P(Box(2, 0.5, 3), '#f2efe6', { y: 3.35, z: -0.6 }), P(Cyl(0.6, 0.6, 0.3, 8), C.black, { y: 1.6, z: -3.1, rx: PI / 2 }),
    ...wheels([-1.1, 1.1], [-1.9, 1.9], 0.55),
  ], { scale: [1.2, 1.3], sink: 0.1, tints: ['#ffffff', '#a0e0ff', '#ffe08a', '#c0ffc0', '#ffc8c0'] });
  const gas = [
    P(Box(16, 0.2, 20), '#8a8a8a', { y: 0.1, z: -4 }), P(Box(14, 0.8, 9), '#f2efe6', { y: 5.6 }), P(Box(14.1, 0.4, 9.1), '#d8433a', { y: 5.3 }),
    P(Box(8, 3.6, 6), '#e8dcc8', { y: 1.8, z: -10 }), P(Box(6, 1.4, 0.1), '#7ac8ff', { y: 1.9, z: -6.95 }), P(Box(8.4, 0.5, 6.4), '#d8433a', { y: 3.8, z: -10 }),
    P(Cyl(0.2, 0.2, 9, 5), '#9aa0a6', { x: 8, y: 4.5, z: 4 }), P(Box(0.3, 2.4, 3), C.yellow, { x: 8, y: 9.6, z: 4 }),
  ];
  for (const [x, z] of [[5, 3], [-5, 3], [5, -3], [-5, -3]]) gas.push(P(Box(0.5, 5, 0.5), '#e8e8e8', { x, y: 2.5, z }));
  for (const x of [2.5, -2.5]) gas.push(P(Box(0.8, 1.6, 0.6), '#d8433a', { x, y: 0.9 }), P(Box(0.6, 0.4, 0.62), '#ffffff', { x, y: 1.4 }));
  def('gasStation', gas, { scale: [1, 1.2], sink: 0.2 });
  const lift = [
    P(Box(1.6, 0.6, 1.6), '#7a7f88', { y: 0.3 }), P(Cyl(0.45, 0.65, 16, 6), '#8a8f98', { y: 8 }), P(Box(7, 0.6, 0.6), '#8a8f98', { y: 16 }),
    P(Box(0.08, 0.08, 30), C.black, { x: 3.2, y: 15.4 }), P(Box(0.08, 0.08, 30), C.black, { x: -3.2, y: 15.4 }),
  ];
  for (const [x, z] of [[3.2, 6], [-3.2, -7]]) {
    lift.push(P(Cyl(0.45, 0.45, 0.4, 8), '#5a5f68', { x, y: 15.7 }));
    lift.push(P(Box(0.1, 2.4, 0.1), '#3a3a3a', { x, y: 14.2, z }), P(Box(1.6, 0.2, 0.8), '#d8433a', { x, y: 13, z }), P(Box(1.6, 0.8, 0.12), '#d8433a', { x, y: 13.4, z: z - 0.4 }));
  }
  def('skiLift', lift, { scale: [1, 1.2], sink: 0.4 });
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

// Weak points glow orange and multiply damage; breakable parts have their own hp and an effect
// when destroyed (see Enemies.breakPart). Both are listed in g.userData.parts for hit testing.
function weak(g, obj, r, mult = 3, extra = {}) {
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.35, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#ff8a1a', transparent: true, opacity: 0.5, depthWrite: false }), // solid halo: shows even over white
  );
  obj.add(glow);
  (g.userData.parts ||= []).push({ obj, r, mult, hp: Infinity, glow, ...extra });
}
function breakable(g, obj, r, name, hp, extra = {}) {
  (g.userData.parts ||= []).push({ obj, r, mult: 1, hp, name, ...extra });
}

function partyHat(g, y) {
  add(g, Cone(1.4, 3.5, 8), lam('#ff3ad0'), { y, rz: 0.2 });
  add(g, Sph(0.5, 5, 4), lam('#ffd23a'), { x: -0.35, y: y + 1.8 });
}

export function makeDrone(hat) {
  const g = new THREE.Group();
  add(g, Ico(3, 1), lam('#e0453a'));
  const eye = add(g, Sph(1.3, 8, 6), basic('#ffffff'), { z: 2.4, y: 0.4 });
  add(g, Sph(0.6, 6, 4), basic('#111111'), { z: 3.5, y: 0.4 });
  weak(g, eye, 1.4);
  add(g, Box(2.6, 0.5, 0.4), lam('#111111'), { z: 2.7, y: 1.9, rz: 0.25 });
  const rotors = [];
  for (const [x, z] of [[4, 4], [-4, 4], [4, -4], [-4, -4]]) {
    add(g, Box(Math.abs(x) * 0.9, 0.4, 0.4), lam('#333333'), { x: x / 2, z: z / 2, ry: Math.atan2(-z, x) });
    rotors.push(add(g, Cyl(1.8, 1.8, 0.2, 10), lam('#c8c8c8', { transparent: true, opacity: 0.7 }), { x, y: 0.6, z }));
  }
  for (const r of rotors) breakable(g, r, 1.9, 'rotor', 1);
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
  const pilot = add(g, Sph(1.4, 8, 6), lam('#5aff5a'), { y: 2 });
  weak(g, pilot, 2.6);
  const lights = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    lights.push(add(g, Sph(0.6, 5, 4), basic('#ffd23a'), { x: Math.cos(a) * 9, z: Math.sin(a) * 9 }));
  }
  for (const l of lights) breakable(g, l, 1.2, 'turret', 1);
  if (hat) partyHat(g, 6);
  g.userData.lights = lights;
  return g;
}

export function makeBlimp(hat) {
  const g = new THREE.Group();
  add(g, Sph(7, 12, 8), lam('#c8ccd4'), { s: [1, 1, 2.6] });
  for (const [x, y] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) breakable(g, add(g, Box(x ? 4 : 0.4, y ? 4 : 0.4, 4), lam('#e8302a'), { x: x * 2.5, y: y * 2.5, z: -17 }), 2.5, 'fin', 2);
  const gondola = add(g, Box(3, 2, 6), lam('#5a5a6a'), { y: -7.5 });
  weak(g, gondola, 3.2, 2, { hp: 4, name: 'gondola' });
  const tex = makeTextTexture([pick(['BUY MORE LOOPS', 'HOOPS: 50% OFF', 'VOTE GOOSE', 'TRY GROUND!', 'GARY WAS HERE'])], { w: 1024, h: 256, size: 120, bg: '#ffd23a' });
  for (const s of [-1, 1]) add(g, new THREE.PlaneGeometry(24, 6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), { x: s * 7.05, ry: s * PI / 2 });
  const prop = add(g, Box(0.3, 5, 0.3), lam('#333'), { z: -19.5 });
  g.userData.spin = [prop];
  if (hat) partyHat(g, 7);
  return g;
}

export function makeBee(hat) {
  const g = new THREE.Group();
  add(g, Sph(1.4, 8, 6), lam('#ffcc1a'), { s: [1, 1, 1.4] });
  for (const z of [-0.5, 0.5]) add(g, Cyl(1.42, 1.42, 0.4, 10), lam('#1d1d22'), { z, rx: PI / 2, s: [1, 1, 1] });
  add(g, Sph(0.8, 6, 5), lam('#1d1d22'), { z: 2 });
  add(g, Cone(0.3, 1, 5), lam('#1d1d22'), { z: -2.3, rx: -PI / 2 });
  for (const x of [-0.4, 0.4]) add(g, Sph(0.25, 4, 3), basic('#ffffff'), { x, y: 0.3, z: 2.6 });
  wings(g, '#e8f8ff', 1.6, 1, 1);
  if (hat) partyHat(g, 1.6);
  return g;
}

export function makeJelly(hat) {
  const g = new THREE.Group();
  add(g, new THREE.SphereGeometry(5, 12, 8, 0, PI * 2, 0, PI / 2), new THREE.MeshPhongMaterial({ color: '#ff8ad8', emissive: '#a03a90', transparent: true, opacity: 0.75, shininess: 80 }), { s: [1, 0.8, 1] });
  const core = add(g, Sph(2, 8, 6), basic('#ffd0f4', { transparent: true, opacity: 0.6 }), { y: 1.2 });
  weak(g, core, 2.2);
  const tent = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * PI * 2;
    const t = new THREE.Group();
    t.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 3);
    breakable(g, add(t, Box(0.4, 9, 0.4), basic('#ffb0ec', { transparent: true, opacity: 0.8 }), { y: -4.5 }), 2.4, 'tentacle', 1);
    g.add(t);
    tent.push(t);
  }
  g.userData.tentacles = tent;
  if (hat) partyHat(g, 4.5);
  return g;
}

export function makeCannon(hat) {
  const g = new THREE.Group();
  add(g, Cyl(5, 6, 2.5, 8), lam('#4a5a3a'), { y: 1.2 });
  add(g, new THREE.SphereGeometry(3.6, 10, 6, 0, PI * 2, 0, PI / 2), lam('#5a6a4a'), { y: 2.4 });
  const barrel = new THREE.Group();
  barrel.position.y = 4.2;
  breakable(g, add(barrel, Cyl(0.9, 1.1, 7, 8), lam('#2a2a30'), { z: 3.4, rx: PI / 2 }), 2.2, 'barrel', 3);
  add(barrel, Cyl(1.2, 1.2, 0.8, 8), lam('#e8302a'), { z: 6.8, rx: PI / 2 });
  g.add(barrel);
  for (const x of [-1.2, 1.2]) add(g, Sph(0.5, 5, 4), basic('#ffffff'), { x, y: 4.6, z: 3 });
  add(g, Box(3.4, 0.5, 0.5), basic('#1d1d22'), { y: 5.4, z: 3, rz: 0.1 });
  if (hat) partyHat(g, 6);
  g.userData.barrel = barrel;
  return g;
}

export function makeRivalJet(hat) {
  const g = new THREE.Group();
  const p = makePlane();
  p.setSkin({ body: '#6a2aa0', wing: '#2a2a3a', accent: '#ff3ad0' });
  p.group.rotation.y = PI; // plane model flies toward -Z, enemies face +Z
  g.add(p.group);
  if (hat) partyHat(g, 2.2);
  g.userData.spin = [p.prop];
  breakable(g, p.prop, 2.4, 'prop', 2);
  return g;
}

export function makeStorm(hat) {
  const g = new THREE.Group();
  const m = lam('#5a5f6c');
  for (const [x, y, z, r] of [[10, -2, 2, 9], [-10, -1, -1, 9], [4, 5, -3, 8], [-5, 4, 3, 8], [0, -3, 8, 7]]) breakable(g, add(g, Ico(r, 1), m, { x, y, z }), r * 0.8, 'puff', 2);
  add(g, Ico(12, 1), m);
  weak(g, add(g, Sph(2.2, 8, 6), basic('#ffffff'), { x: 4, y: 2, z: 11.5 }), 2.4);
  weak(g, add(g, Sph(2.2, 8, 6), basic('#ffffff'), { x: -4, y: 2, z: 11.5 }), 2.4);
  add(g, Sph(1, 6, 4), basic('#000000'), { x: 4, y: 1.5, z: 13.4 });
  add(g, Sph(1, 6, 4), basic('#000000'), { x: -4, y: 1.5, z: 13.4 });
  add(g, Box(4, 0.8, 0.8), basic('#222222'), { x: 4, y: 4.6, z: 12.6, rz: -0.4 });
  add(g, Box(4, 0.8, 0.8), basic('#222222'), { x: -4, y: 4.6, z: 12.6, rz: 0.4 });
  if (hat) partyHat(g, 14);
  return g;
}

// Lead bosses fly ahead of you, facing back (+Z points at the player).
export function makeOctopus() {
  const g = new THREE.Group();
  const skin = lam('#b8407a'), spots = lam('#8a2a5a');
  add(g, Sph(5, 12, 9), skin, { y: 2.5, s: [1, 1.2, 1] });
  for (const [x, y, z] of [[2.5, 5.5, -2], [-3, 4.5, -2.5], [0, 7.5, -1], [3.8, 2.5, -2.4]]) add(g, Sph(0.8, 6, 4), spots, { x, y, z });
  for (const x of [-2, 2]) {
    const eye = add(g, Sph(1.5, 10, 8), basic('#ffffff'), { x, y: 2.2, z: 4.2 });
    add(eye, Sph(0.7, 6, 5), basic('#111111'), { y: -0.2, z: 1.1 });
    weak(g, eye, 1.6);
  }
  add(g, Box(2, 0.5, 0.5), basic('#2a0a1a'), { y: 0.2, z: 4.8 }); // a stern little mouth
  const tent = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2 + PI / 8;
    const t = new THREE.Group();
    t.position.set(Math.cos(a) * 3.2, -1.5, Math.sin(a) * 3.2);
    t.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); // splayed outward
    const arm = add(t, Cyl(1, 0.35, 10, 7), skin, { y: -5 });
    add(arm, Sph(0.6, 6, 4), spots, { y: -5 });
    breakable(g, arm, 2.6, 'tentacle', 2);
    g.add(t);
    tent.push(t);
  }
  g.userData.tentacles = tent;
  return g;
}

export function makeCrab() {
  const g = new THREE.Group();
  const shell = lam('#e8502a'), dark = lam('#a8301a');
  add(g, Sph(6, 12, 8), shell, { s: [1.4, 0.6, 1] });
  add(g, Sph(4, 10, 6), dark, { y: 1.2, s: [1.3, 0.5, 0.9] });
  for (const x of [-1.6, 1.6]) {
    add(g, Cyl(0.3, 0.3, 3, 5), dark, { x, y: 4, z: 3.5 });
    weak(g, add(g, Sph(1, 8, 6), basic('#ffffff'), { x, y: 5.8, z: 3.5 }), 1.2);
    add(g, Sph(0.45, 5, 4), basic('#111111'), { x, y: 5.9, z: 4.4 });
  }
  const claws = [];
  for (const s of [-1, 1]) {
    const c = new THREE.Group();
    c.position.set(s * 8, 0.5, 4);
    add(c, Box(1.4, 1.4, 5), dark, { z: -1.5, ry: -s * 0.5 });
    const pincer = add(c, Sph(2.6, 10, 6), shell, { z: 2.5, s: [1, 0.8, 1.4] });
    add(pincer, Box(0.8, 0.8, 3.5), shell, { x: s * 0.9, y: 1.2, z: 2.6, rx: -0.3 });
    add(pincer, Box(0.8, 0.8, 3.5), shell, { x: s * 0.9, y: -1.2, z: 2.6, rx: 0.3 });
    breakable(g, pincer, 3, 'claw', 4);
    g.add(c);
    claws.push(c);
  }
  const legs = [];
  for (const s of [-1, 1]) for (const z of [-3, -0.5, 2]) legs.push(add(g, Box(6, 0.6, 0.6), dark, { x: s * 9, y: -1.5, z, rz: s * -0.5 }));
  g.userData.claws = claws;
  g.userData.legs = legs;
  return g;
}

export function makePuffer() {
  const g = new THREE.Group();
  const puff = new THREE.Group(); // inflates during the puff-up attack
  add(puff, Sph(5, 12, 9), lam('#f2c84a'));
  add(puff, Sph(4.9, 12, 9, 0, PI * 2, PI * 0.55, PI * 0.45), lam('#fff2c0'));
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 26; k++) {
    const y = 1 - (2 * (k + 0.5)) / 26, r = Math.sqrt(1 - y * y), a = k * 2.39996;
    const v = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const o = add(puff, Cone(0.5, 2, 5), lam('#8a6a2a'));
    o.position.copy(v).multiplyScalar(5.3);
    o.quaternion.setFromUnitVectors(up, v);
  }
  g.add(puff);
  const mouth = add(g, Tor(1, 0.4, 6, 12), lam('#e86a5a'), { z: 5 });
  weak(g, mouth, 1.4);
  for (const x of [-2.2, 2.2]) {
    add(g, Sph(1.3, 8, 6), basic('#ffffff'), { x, y: 2, z: 4 });
    add(g, Sph(0.6, 6, 4), basic('#111111'), { x, y: 2, z: 5.1 });
  }
  const fins = [];
  for (const s of [-1, 1]) fins.push(add(g, Box(0.3, 2.5, 3), lam('#e8a83a'), { x: s * 5, z: 1, rz: s * 0.3 }));
  add(g, Box(0.4, 5, 3.5), lam('#e8a83a'), { z: -6.5 });
  g.userData.puff = puff;
  g.userData.wings = fins;
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
  const head = add(g, Sph(1.3, 8, 6), gold, { y: 4.6, z: 4.8 });
  weak(g, head, 1.6);
  add(g, Cone(0.5, 1.8, 6), lam(C.orange), { y: 4.4, z: 6.6, rx: PI / 2 });
  add(g, Sph(0.3, 4, 3), basic('#000'), { x: 0.8, y: 5, z: 5.5 });
  add(g, Sph(0.3, 4, 3), basic('#000'), { x: -0.8, y: 5, z: 5.5 });
  add(g, Cone(1.2, 2.4, 5), gold, { z: -5, rx: -PI / 2 - 0.4 });
  wings(g, '#ffe080', 6, 3, 1);
  for (const w of g.userData.wings) breakable(g, w.children[0], 3.2, 'wing', 3);
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
