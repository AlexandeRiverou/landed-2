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
  buildCloudKingdomProps();
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

// ---------- the Cloud Kingdom ----------
// Marble, gold and cloud. The island is a fixed size (scale [1, 1]) with its flat top at y = 2, so the
// terrain can stand things on it (see ISLAND_DECKS in terrain.js).
const K = { marble: '#f6f2ea', marble2: '#e4ddd0', gold: '#f2c23a', gold2: '#ffe08a', sky: '#9ac8ff', cloud: '#ffffff', cloud2: '#eef4ff' };
// A ring of cloud puffs (dodecahedra: round enough to read as cloud, cheap enough to repeat).
const puffRing = (n, r, y, s, a0 = 0) => Array.from({ length: n }, (_, k) => {
  const a = a0 + (k / n) * PI * 2;
  return P(Dod(s * (0.8 + (k % 3) * 0.2)), k % 2 ? K.cloud : K.cloud2, { x: Math.cos(a) * r, y: y + (k % 2) * s * 0.2, z: Math.sin(a) * r, sy: 0.65 });
});
function buildCloudKingdomProps() {
  def('cloudIsland', [
    P(Cyl(24, 21, 4, 10), '#cfeeb4', { y: 0 }), P(Cyl(21.5, 21.5, 0.3, 10), '#e2f6c8', { y: 2.05 }),
    P(Cone(21, 26, 9), K.marble2, { y: -15, rx: PI }), P(Cone(11, 16, 7), '#d8c8a8', { x: 5, y: -26, z: -2, rx: PI }),
    ...puffRing(9, 21, -3.5, 7, 0.3), ...puffRing(5, 10, -12, 7.5, 1.1), // the cloud skirt
  ], { scale: [1, 1], sink: 0 });

  // A white castle with gold and sky-blue spires, pennants up top and a cloud bank at its feet.
  const cc = [P(Box(14, 12, 14), K.marble, { y: 6 }), P(Cyl(3.4, 3.8, 26, 10), K.marble, { y: 13 }), P(Cone(4.4, 10, 10), K.gold, { y: 31 }), P(Box(0.15, 2.2, 3), K.sky, { y: 37, z: 1.5 })];
  for (const [x, z] of [[7, 7], [-7, 7], [7, -7], [-7, -7]]) {
    cc.push(P(Cyl(2.4, 2.6, 17, 8), K.marble, { x, y: 8.5, z }), P(Cone(3.2, 7, 8), K.sky, { x, y: 20.5, z }), P(Box(0.12, 1.6, 2.2), K.gold, { x, y: 25, z: z + 1.1 }));
  }
  cc.push(P(Box(4, 6, 0.3), K.gold, { y: 3, z: 7.05 }), P(new THREE.CylinderGeometry(2, 2, 0.31, 12, 1, false, 0, PI), K.gold, { y: 6, z: 7.05, rx: PI / 2, rz: PI / 2 }));
  for (let k = 0; k < 6; k++) cc.push(P(Box(1.4, 1.2, 1.4), K.marble, { x: -6 + k * 2.4, y: 12.6, z: 7 }));
  cc.push(...puffRing(7, 9, 0.5, 4, 0.4));
  def('cloudCastle', cc, { scale: [1, 1.3], sink: 0.2 });

  // The golden gate: two marble pillars, a gold arch and gold bars, standing on a cloud.
  const gate = [];
  for (const x of [-7, 7]) gate.push(P(Box(2.6, 15, 2.6), K.marble, { x, y: 7.5 }), P(Box(3.4, 1, 3.4), K.gold, { x, y: 15.3 }), P(Sph(1.1, 8, 6), K.gold2, { x, y: 16.6 }));
  gate.push(P(Tor(7, 1.1, 5, 14, PI), K.gold, { y: 15 }));
  for (let k = -2; k <= 2; k++) gate.push(P(Box(0.35, 13 + (2 - Math.abs(k)) * 2.2, 0.35), K.gold2, { x: k * 2.2, y: (13 + (2 - Math.abs(k)) * 2.2) / 2 }));
  gate.push(P(Box(12, 0.5, 0.4), K.gold2, { y: 6 }), ...puffRing(6, 7, 0, 4.2, 0.2));
  def('goldenGate', gate, { scale: [1, 1.4], sink: 0.3 });

  // A round marble temple: steps, a ring of columns, and a gold dome.
  const tmp = [P(Cyl(11, 12, 1.4, 14), K.marble2, { y: 0.7 }), P(Cyl(9.5, 10.5, 1.2, 14), K.marble, { y: 2 })];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2; tmp.push(P(Cyl(0.8, 0.95, 10, 7), K.marble, { x: Math.cos(a) * 8, y: 7.6, z: Math.sin(a) * 8 })); }
  tmp.push(P(Cyl(10, 10, 1.4, 14), K.marble2, { y: 13.3 }), P(new THREE.SphereGeometry(7.5, 12, 6, 0, PI * 2, 0, PI / 2), K.gold, { y: 14 }), P(Cone(0.8, 3, 6), K.gold2, { y: 23 }));
  def('marbleTemple', tmp, { scale: [1, 1.3], sink: 0.2 });

  // A giant golden harp. Nobody has tuned it in a thousand years.
  const harp = [P(Box(12, 1.6, 3), K.gold, { y: 0.8 }), P(Cyl(0.9, 1.2, 20, 7), K.gold, { x: -5.5, y: 11 }), P(Sph(1.6, 8, 6), K.gold2, { x: -5.5, y: 21.5 })];
  harp.push(P(Box(1.2, 18.4, 1.4), K.gold, { x: 0.25, y: 14, rz: Math.atan2(11.5, 14) })); // the neck, from the pillar top down to the far end
  harp.push(P(Tor(1.4, 0.45, 4, 10), K.gold2, { x: 6, y: 7, rx: PI / 2 }));
  for (let k = 0; k < 8; k++) { const x = -4.3 + k * 1.3, top = 21 - (x + 5.5) * (14 / 11.5); harp.push(P(Box(0.14, top - 1.6, 0.14), '#fffbe8', { x, y: 1.6 + (top - 1.6) / 2 })); }
  def('giantHarp', harp, { scale: [0.9, 1.3], sink: 0.2 });

  // A rainbow arching from one cloud to another.
  const rb = [];
  ['#ff5a5a', '#ffa03a', '#ffe04a', '#6ad86a', '#5ab0ff', '#a07aff'].forEach((c, k) => rb.push(P(Tor(15 - k * 1.1, 0.6, 3, 14, PI), c, { y: 1 })));
  rb.push(...[-12.3, 12.3].flatMap((x) => [P(Dod(4), K.cloud, { x, y: 1.5, sy: 0.7 }), P(Dod(3), K.cloud2, { x: x + 3, y: 1, z: 2, sy: 0.7 }), P(Dod(3), K.cloud2, { x: x - 3, y: 1, z: -1.5, sy: 0.7 })]));
  def('rainbowArch', rb, { scale: [0.9, 1.3], sink: 0.3 });

  // A sky lighthouse: white and blue bands, a gold lamp, and little wings to keep it up here.
  const sl = [];
  for (let k = 0; k < 4; k++) sl.push(P(Cyl(2.8 - k * 0.35, 3.2 - k * 0.35, 5, 10), k % 2 ? K.sky : K.marble, { y: 2.5 + k * 5 }));
  sl.push(P(Cyl(1.7, 1.7, 2.6, 8), '#fff2a0', { y: 21.3 }), P(Tor(2.2, 0.25, 4, 12), K.gold, { y: 20, rx: PI / 2 }), P(Cone(2.3, 3, 8), K.gold, { y: 24.1 }), P(Sph(0.5, 6, 4), K.gold2, { y: 25.9 }));
  for (const s of [-1, 1]) sl.push(P(Box(5, 0.4, 2.2), K.cloud, { x: s * 4.4, y: 14, rz: s * 0.35 }), P(Box(3.6, 0.4, 1.6), K.cloud2, { x: s * 4, y: 12.8, rz: s * 0.5 }));
  def('skyLighthouse', sl, { scale: [1, 1.4], sink: 0.2 });

  // Cloud puffs: bushes on the islands, cloud banks on the cloud sea below.
  def('cloudPuff', [P(Ico(3.2, 1), K.cloud, { y: 2, sy: 0.75 }), P(Ico(2.4, 1), K.cloud2, { x: 2.6, y: 1.6, z: 0.8, sy: 0.75 }), P(Ico(2, 1), K.cloud, { x: -2.3, y: 1.4, z: -0.6, sy: 0.75 })], { scale: [0.8, 1.8], sink: 0.2, tints: ['#ffffff', '#fff6e0', '#f0f4ff', '#fff0f8'] });

  // A paper lantern, floating (it's airborne: the terrain puts these beside the islands).
  def('skyLantern', [P(Cyl(1, 0.8, 2.4, 6), '#ffd06a', { y: 1.4 }), P(Cyl(0.6, 1, 0.5, 6), '#ff8a3a', { y: 2.85 }), P(Cyl(0.5, 0.5, 0.3, 6), '#fff2a0', { y: 0.1 })], { scale: [1.4, 2.4], sink: 0, tints: ['#ffffff', '#ffe0a0', '#ffd0d0', '#fff4c0'] });

  // A winged statue on a plinth, with a gold halo.
  const ws = [P(Box(4, 4, 4), K.marble2, { y: 2 }), P(Box(4.6, 0.6, 4.6), K.marble, { y: 4.3 }), P(Cone(1.8, 6, 8), K.marble, { y: 7.6 }), P(Sph(1, 8, 6), K.marble, { y: 11.4 }), P(Tor(1.1, 0.15, 4, 12), K.gold, { y: 12.9, rx: PI / 2 })];
  for (const s of [-1, 1]) ws.push(P(Box(4, 1.6, 0.4), K.cloud, { x: s * 2.2, y: 10, z: -0.6, rz: s * 0.5 }), P(Box(3, 1.2, 0.4), K.cloud2, { x: s * 2.6, y: 8.7, z: -0.6, rz: s * 0.8 }));
  def('wingedStatue', ws, { scale: [1, 1.4], sink: 0.2 });

  // A hot-air balloon dock: a little pier on posts, a mooring post, and a balloon tied up at it.
  const dock = [P(Box(14, 0.6, 5), '#c8a070', { x: 3, y: 2.2 })];
  for (const x of [-3, 3, 9]) for (const z of [-2, 2]) dock.push(P(Box(0.5, 2.2, 0.5), '#8a5a32', { x, y: 1.1, z }));
  dock.push(P(Box(0.6, 4, 0.6), '#8a5a32', { x: 9.5, y: 4.4 }), P(Box(0.08, 6, 0.08), '#5a4030', { x: 9.6, y: 8.5, z: 0.4, rz: -0.6 }));
  dock.push(P(Sph(7, 10, 8), '#ff9ad0', { x: 14, y: 20, sy: 1.15 }), P(Cyl(7.05, 7.05, 1.4, 10), K.gold, { x: 14, y: 20 }), P(Cone(4.5, 6, 10), '#ff9ad0', { x: 14, y: 12.5, rx: PI }));
  dock.push(P(Box(2.6, 2, 2.6), '#a87a4a', { x: 14, y: 6.5 }), P(Box(0.15, 4, 0.15), C.black, { x: 15, y: 9.5, z: 1 }), P(Box(0.15, 4, 0.15), C.black, { x: 13, y: 9.5, z: -1 }));
  def('balloonDock', dock, { scale: [1, 1.2], sink: 0.2, tints: ['#ffffff', '#d0e8ff', '#fff0c0', '#e0ffe0'] });

  // A sleepy cloud whale drifting by: eyes shut, a puff of cloud for a spout.
  def('cloudWhale', [
    P(Sph(6, 12, 8), '#dfeaff', { sz: 2.4 }), P(Sph(5.6, 12, 6), K.cloud, { y: -1.3, z: 1, sz: 2.2 }),
    P(Box(8, 0.6, 3), '#dfeaff', { y: 1.5, z: -15.5, rx: -0.4 }), P(Box(5, 0.5, 2.2), '#dfeaff', { x: 6.2, y: -2, z: 4, rz: -0.5 }), P(Box(5, 0.5, 2.2), '#dfeaff', { x: -6.2, y: -2, z: 4, rz: 0.5 }),
    P(Box(1.6, 0.25, 0.3), '#4a5a7a', { x: 4.8, y: 1.4, z: 9, ry: 0.5, rz: -0.2 }), P(Box(1.6, 0.25, 0.3), '#4a5a7a', { x: -4.8, y: 1.4, z: 9, ry: -0.5, rz: 0.2 }), // closed eyes
    P(Ico(1.6, 1), K.cloud, { y: 7.4, z: 5 }), P(Ico(1.2, 1), K.cloud2, { x: 1.4, y: 8.4, z: 5 }), P(Ico(1.2, 1), K.cloud2, { x: -1.3, y: 8.2, z: 5.3 }),
  ], { scale: [1.4, 2], sink: 0 });
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

// Planes you can fly (the hangar store, src/hangar.js, sells them for hidden coins). Every shape uses the same three
// paint materials (body, wing, accent), so paint jobs (PLANE_SKINS, the skin mutation, rainbow mode) work on all of
// them; each also has its own factory paint, `skin`. The prop group spins about its own axis (main.js, player.js).
export const PLANE_KINDS = {
  pup: { skin: PLANE_SKINS[0] },
  dart: { skin: { name: 'Dart', body: '#3a8ad8', wing: '#e8f2ff', accent: '#ff8a1f' } },
  bee: { skin: { name: 'Bumblebee', body: '#ffc21a', wing: '#2b2b3a', accent: '#2b2b3a' } },
  hornet: { skin: { name: 'Twin Hornet', body: '#2a3a6a', wing: '#e8e0c8', accent: '#ff7a1a' } },
};

export function makePlane(kind = 'pup') {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: '#e8473c', flatShading: true });
  const wing = new THREE.MeshLambertMaterial({ color: '#f5f2ea', flatShading: true });
  const accent = new THREE.MeshLambertMaterial({ color: '#2b2b3a', flatShading: true });
  const glass = new THREE.MeshPhongMaterial({ color: '#2a4a7a', shininess: 120, specular: '#ffffff' });
  const mesh = (g, m, t = {}, parent = group) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(t.x || 0, t.y || 0, t.z || 0);
    o.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    if (t.s) o.scale.set(...t.s);
    parent.add(o);
    return o;
  };
  const wheels = (x, y, z) => {
    for (const sx of [x, -x]) {
      mesh(Box(0.3, 1.3, 0.3), accent, { x: sx, y, z });
      mesh(Cyl(0.5, 0.5, 0.4, 8), accent, { x: sx, y: y - 0.7, z, rz: PI / 2 });
    }
  };
  const prop = new THREE.Group();
  const blades = (r) => {
    prop.add(new THREE.Mesh(Box(0.3, r, 0.15), accent));
    prop.add(new THREE.Mesh(Box(r, 0.3, 0.15), accent));
  };
  if (kind === 'dart') {
    // Slim and pointy: a long needle nose, swept delta wings, a tall swept fin, no tailplane.
    mesh(Cyl(0.95, 0.45, 10, 8), body, { z: 0.4, rx: -PI / 2 });
    mesh(Cone(0.95, 3, 8), body, { z: -6.1, rx: -PI / 2 });
    for (const sd of [1, -1]) {
      const w = new THREE.Group();
      w.position.set(sd * 0.8, -0.15, -1.5);
      w.rotation.y = -sd * 0.62; // swept back
      mesh(Box(6.4, 0.3, 2.2), wing, { x: sd * 3 }, w);
      mesh(Box(0.9, 0.36, 2.25), accent, { x: sd * 6.1 }, w);
      group.add(w);
    }
    mesh(Box(0.22, 2.4, 2.2), body, { y: 1.3, z: 4.2, rx: 0.45 }); // leaning back
    mesh(Sph(0.7, 10, 8), glass, { y: 0.7, z: -1.8, s: [1, 0.75, 2] });
    wheels(1, -0.9, -1.5);
    prop.position.z = -7.7;
    blades(4.4);
  } else if (kind === 'bee') {
    // A round, chunky biplane: two stacked wings joined by struts, a fat body with stripes, a little stinger tail.
    mesh(Sph(1.6, 10, 8), body, { z: -0.6, s: [1, 1, 2.6] });
    mesh(Cyl(1.62, 1.62, 0.6, 10), accent, { z: -1.2, rx: -PI / 2 });
    mesh(Cyl(1.5, 1.5, 0.6, 10), accent, { z: 1, rx: -PI / 2 });
    mesh(Cone(0.6, 2.4, 8), accent, { z: 4.6, rx: PI / 2 });
    mesh(Box(12, 0.32, 2.2), wing, { y: -0.8, z: -1.2 });
    mesh(Box(12, 0.32, 2.2), wing, { y: 1.9, z: -1.5 });
    for (const sx of [4.4, -4.4]) mesh(Box(0.22, 2.6, 0.22), accent, { x: sx, y: 0.55, z: -1.3 });
    mesh(Box(4, 0.25, 1.2), wing, { y: 0.3, z: 3.4 });
    mesh(Box(0.25, 1.8, 1.3), body, { y: 1.3, z: 3.6 });
    mesh(Sph(0.75, 10, 8), glass, { y: 1.35, z: 0.7, s: [1, 0.8, 1.3] }); // behind the upper wing
    wheels(1.3, -1.6, -2);
    prop.position.z = -4.8;
    blades(5);
  } else if (kind === 'hornet') {
    // Twin booms: a short pod in the middle, two booms (with intake cones) running back to a shared tailplane.
    mesh(Cyl(1.05, 0.8, 6, 10), body, { z: -1.4, rx: -PI / 2 });
    mesh(Cone(1.05, 1.6, 10), body, { z: -5.2, rx: -PI / 2 });
    mesh(Box(14.5, 0.35, 2.4), wing, { y: -0.1, z: -0.9 });
    mesh(Box(1, 0.4, 2.45), accent, { x: 6.9, y: -0.1, z: -0.9 });
    mesh(Box(1, 0.4, 2.45), accent, { x: -6.9, y: -0.1, z: -0.9 });
    for (const sx of [3, -3]) {
      mesh(Cyl(0.45, 0.35, 9, 8), body, { x: sx, z: 2.2, rx: -PI / 2 });
      mesh(Cone(0.55, 1.4, 8), accent, { x: sx, z: -3, rx: -PI / 2 });
      mesh(Box(0.22, 1.9, 1.3), body, { x: sx, y: 1, z: 6.2 });
    }
    mesh(Box(6.4, 0.25, 1.2), wing, { y: 0.4, z: 6.4 });
    mesh(Sph(0.85, 10, 8), glass, { y: 0.8, z: -1.8, s: [1, 0.8, 1.5] });
    wheels(1, -1, -2);
    prop.position.z = -6.2;
    blades(4.8);
  } else {
    mesh(Cyl(1.15, 0.55, 9, 10), body, { rx: -PI / 2 });
    mesh(Cone(1.15, 1.8, 10), body, { z: -5.4, rx: -PI / 2 });
    mesh(Box(13.5, 0.35, 2.4), wing, { y: -0.2, z: -0.9 });
    mesh(Box(1, 0.4, 2.45), accent, { x: 6.4, y: -0.2, z: -0.9 });
    mesh(Box(1, 0.4, 2.45), accent, { x: -6.4, y: -0.2, z: -0.9 });
    mesh(Box(4.6, 0.25, 1.3), wing, { y: 0.2, z: 4 });
    mesh(Box(0.25, 2.2, 1.6), body, { y: 1.3, z: 4.1 });
    mesh(Sph(0.85, 10, 8), glass, { y: 0.85, z: -1.4, s: [1, 0.8, 1.6] });
    wheels(1.2, -1.1, -2);
    prop.position.z = -6.4;
    blades(5.4);
  }
  group.add(prop);
  return {
    group, prop, kind,
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

// Weak points multiply damage; breakable parts have their own hp and an effect when destroyed (see
// Enemies.breakPart). Both are listed in g.userData.parts for hit testing.
// A weak point wears a faint warm halo in its own colour, a little bigger than it, that breathes slowly: easy to find
// when you look for it, never shouting. A hit flashes it white for a moment (part.hitT; Enemies.animateMark).
function weak(g, obj, r, mult = 3, extra = {}) {
  const tint = new THREE.Color(obj.material?.color ?? '#ffb060').lerp(new THREE.Color('#ffc070'), 0.6);
  const halo = new THREE.Mesh(Sph(1, 12, 8), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.14, depthWrite: false }));
  halo.scale.setScalar(r * 1.15);
  obj.add(halo);
  (g.userData.parts ||= []).push({ obj, r, mult, hp: Infinity, glow: halo, mark: { halo, tint }, hitT: 0, ...extra });
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
  g.userData.light = add(g, Sph(0.9, 6, 4), basic('#ff2a2a'), { y: 4.2, z: 1.2 }); // blinks when armed (enemies.js mineFuse)
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

// Fort Grumpington, the ground boss: a stone fortress on a rocky plinth (its gate toward +Z). Crenellated curtain walls,
// a gatehouse with a portcullis (it drops when the fort ducks), four corner towers, each with a cannon that swivels to
// aim and can be shot off into a smoking ruin (its stair turret's red roof and pennant go with it), braziers at the
// gate, and a central keep with a grumpy face (glowing window eyes, stone brows, a frown), pepperpot turrets, a
// chimney, the big flag and, on its roof, the great mortar (the breakable barrel) that sinks into the keep when the
// fort ducks. Damage shows as it loses hp (userData.damage): fires and scorch marks at 2/3, a wall top falling to
// rubble, cracks glowing in the keep and the flag on fire at 1/3. The static stone is merged into one mesh.
// FORT_HULL lists its solid boxes in model units [x0, x1, y0, y1, z0, z1]: bullets hit them and planes bump off them.
export const FORT_HULL = [
  [-6.6, 6.6, -1, 5.5, 6, 7.2], [-3.2, 3.2, -1, 6.8, 5.4, 7.8], [-6.6, 6.6, -1, 5.5, -7.2, -6], [-7.2, -6, -1, 5.5, -6.6, 6.6], [6, 7.2, -1, 5.5, -6.6, 6.6],
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [a * 6.6 - 2.2, a * 6.6 + 2.2, -1, 8.4, b * 6.6 - 2.2, b * 6.6 + 2.2]),
  [-2.9, 2.9, -1, 9.2, -2.9, 2.9], [-9.5, 9.5, -3, 0.5, -9.5, 9.5],
];
const FV = {
  stone: '#aaa190', stone2: '#958c7c', stone3: '#bdb4a2', course: '#857c6d', dark: '#2a2622', rock: '#8a8378', rock2: '#6f685f',
  earth: '#8a7a5a', flag: '#c0322a', gold: '#ffcf3a', wood: '#6e4a2c', iron: '#2c2c33', roof: '#b8452f', moss: '#6a8a48',
  soot: '#2b2724', ember: '#ff8a3a', glass: '#ffc860',
};
// A run of curtain wall along x (axis 'x', at z = c) or along z (axis 'z', at x = c), from a0 to a1, between heights
// y0 and y1; `out` (±1) is the outer face's side. With cap: the wall walk, merlons on the outer edge, arrow slits.
function fortWall(S, axis, c, a0, a1, out, y0, y1, cap) {
  const len = a1 - a0, mid = (a0 + a1) / 2, T = 1.2;
  const at = (u, y, v, size, color, extra = {}) => S.push(axis === 'x'
    ? P(Box(size[0], size[1], size[2]), color, { x: u, y, z: c + v, ...extra })
    : P(Box(size[2], size[1], size[0]), color, { x: c + v, y, z: u, ...extra }));
  at(mid, (y0 + y1) / 2, 0, [len, y1 - y0, T], FV.stone);
  for (const y of [1.5, 2.6, 3.7]) if (y > y0 + 0.1 && y < y1 - 0.1) at(mid, y, 0, [len + 0.02, 0.12, T + 0.04], FV.course);
  if (y0 < 1) at(mid, 0.8, out * 0.12, [len + 0.05, 0.8, T + 0.3], FV.stone2); // a sloped foot
  if (!cap) return;
  at(mid, y1 + 0.12, 0, [len + 0.1, 0.25, T + 0.25], FV.stone3);
  const n = Math.max(1, Math.round(len / 1.3));
  for (let k = 0; k < n; k++) at(a0 + (k + 0.5) * (len / n), y1 + 0.7, out * (T / 2 - 0.15), [0.75, 0.9, 0.45], FV.stone);
  for (let k = 0; k < n; k += 2) at(a0 + (k + 0.5) * (len / n), y1 - 1.8, out * 0.02, [0.16, 0.9, T + 0.06], FV.dark);
}
// A little flame: an orange cone round a yellow one (unlit, flickers in Enemies.animate).
function fortFlame(g, x, y, z, s = 1) {
  const f = new THREE.Group();
  f.position.set(x, y, z);
  f.scale.setScalar(s);
  add(f, Cone(0.45, 1.1, 6), basic('#ff7a2a', { transparent: true, opacity: 0.9 }), { y: 0.55 });
  add(f, Cone(0.25, 0.7, 5), basic('#fff0a0'), { y: 0.4 });
  g.add(f);
  return f;
}
export function makeFort() {
  const g = new THREE.Group(), S = [], L = []; // S: stone and paint (lit); L: lights (unlit, they glow)
  // The plinth: a rocky mound reaching down below the ground (so it never floats on a gentle slope), boulders at its rim.
  S.push(P(Cyl(10.4, 11.6, 4, 9), FV.rock, { y: -1.6 }), P(Cyl(11.6, 12.4, 1.6, 9), FV.rock2, { y: -4.2 }));
  S.push(P(Cyl(10.5, 10.5, 0.3, 9), FV.earth, { y: 0.35 }));
  for (let k = 0; k < 11; k++) { const a = k * 0.57 + 0.3, r = 10.6 + (k % 3) * 0.4; S.push(P(Dod(0.8 + (k % 4) * 0.25), k % 2 ? FV.rock : FV.rock2, { x: Math.cos(a) * r, y: 0.1, z: Math.sin(a) * r, ry: k })); }
  S.push(P(Box(12, 0.2, 12), FV.stone2, { y: 0.5 })); // the courtyard's flagstones
  // Curtain walls. The left wall's front half has its top built separately: it falls to rubble at 1/3 hp.
  const breach = [];
  fortWall(S, 'x', -6.6, -4.6, 4.6, -1, 0.4, 4.4, true);
  fortWall(S, 'z', 6.6, -4.6, 4.6, 1, 0.4, 4.4, true);
  fortWall(S, 'z', -6.6, -4.6, 0.2, -1, 0.4, 4.4, true);
  fortWall(S, 'z', -6.6, 0.2, 4.6, -1, 0.4, 2.9, false);
  fortWall(breach, 'z', -6.6, 0.2, 4.6, -1, 2.9, 4.4, true);
  for (const s of [-1, 1]) fortWall(S, 'x', 6.6, s > 0 ? 3.1 : -4.6, s > 0 ? 4.6 : -3.1, 1, 0.4, 4.4, true);
  S.push(P(Box(0.06, 1.4, 1.6), FV.moss, { x: -7.22, y: 1.3, z: -2 }), P(Box(0.06, 1.2, 1.4), FV.moss, { x: 7.22, y: 1.5, z: 3 }), P(Box(1.6, 1, 0.06), FV.moss, { x: 3.5, y: 1.2, z: -7.22 }));
  // The gatehouse: two flanking towers, the lintel over a dark passage, an iron portcullis (below), the lowered
  // drawbridge with its chains, and the red banner with the fort's grumpy crest.
  for (const s of [-1, 1]) {
    S.push(P(Box(1.6, 6, 2.4), FV.stone, { x: s * 2.4, y: 3.4, z: 6.6 }));
    for (const y of [1.6, 3, 4.6]) S.push(P(Box(1.64, 0.12, 2.44), FV.course, { x: s * 2.4, y, z: 6.6 }));
    S.push(P(Box(1.9, 0.3, 2.7), FV.stone3, { x: s * 2.4, y: 6.5, z: 6.6 }));
    for (const [dx, dz] of [[-0.55, 1.1], [0.55, 1.1], [-0.55, -1.1], [0.55, -1.1]]) S.push(P(Box(0.6, 0.9, 0.5), FV.stone, { x: s * 2.4 + dx, y: 7.1, z: 6.6 + dz }));
    S.push(P(Box(0.16, 1, 0.1), FV.dark, { x: s * 2.4, y: 4.6, z: 7.82 }));
  }
  S.push(P(Box(3.2, 2.4, 2.4), FV.stone, { x: 0, y: 4.6, z: 6.6 }), P(Box(3.3, 0.3, 2.6), FV.stone3, { y: 3.4, z: 6.6 }));
  S.push(P(Box(3.2, 3, 0.3), FV.dark, { y: 1.9, z: 5.6 }), P(Box(0.1, 3, 2.4), FV.dark, { x: -1.55, y: 1.9, z: 6.6 }), P(Box(0.1, 3, 2.4), FV.dark, { x: 1.55, y: 1.9, z: 6.6 }));
  S.push(P(Box(3, 0.22, 2.8), FV.wood, { y: 0.5, z: 9.1 }));
  for (let k = -1; k <= 1; k++) S.push(P(Box(0.06, 0.24, 2.8), FV.dark, { x: k * 0.75, y: 0.52, z: 9.1 }));
  for (const s of [-1, 1]) S.push(P(Box(0.08, 0.08, 4.2), FV.iron, { x: s * 1.4, y: 2.4, z: 8.6, rx: 0.85 }));
  S.push(P(Box(1.8, 2.2, 0.08), FV.flag, { y: 4.7, z: 7.85 }), P(Box(1.8, 0.22, 0.1), FV.gold, { y: 5.75, z: 7.86 }), P(Box(1.8, 0.22, 0.1), FV.gold, { y: 3.65, z: 7.86 }));
  S.push(P(Cyl(0.42, 0.42, 0.1, 10), FV.gold, { y: 4.5, z: 7.9, rx: PI / 2 }));
  for (const s of [-1, 1]) S.push(P(Box(0.6, 0.14, 0.1), FV.dark, { x: s * 0.4, y: 5.15, z: 7.92, rz: -s * 0.4 }));
  const portcullis = new THREE.Group();
  portcullis.position.set(0, 1.9, 7.45);
  const bars = [];
  for (let k = -3; k <= 3; k++) bars.push(P(Box(0.12, 3, 0.12), FV.iron, { x: k * 0.42 }));
  for (const y of [-0.9, 0, 0.9]) bars.push(P(Box(2.9, 0.12, 0.12), FV.iron, { y }));
  for (let k = -3; k <= 3; k++) bars.push(P(Cone(0.09, 0.3, 4), FV.iron, { x: k * 0.42, y: -1.6, rx: PI }));
  portcullis.add(new THREE.Mesh(M(bars), lam('#ffffff', { vertexColors: true })));
  g.add(portcullis);
  // Braziers either side of the drawbridge.
  const flames = [];
  for (const s of [-1, 1]) {
    S.push(P(Cyl(0.12, 0.18, 1.4, 5), FV.iron, { x: s * 2.2, y: 1.1, z: 8.4 }), P(Cyl(0.55, 0.3, 0.45, 8), FV.iron, { x: s * 2.2, y: 1.95, z: 8.4 }));
    flames.push(fortFlame(g, s * 2.2, 2.05, 8.4, 0.9));
  }
  // Corner towers: a battered base, stone courses, arrow slits, a corbelled top ring and eight merlons.
  const guns = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = sx * 6.6, cz = sz * 6.6;
    S.push(P(Cyl(2.05, 2.2, 6.8, 9), FV.stone, { x: cx, y: 3.8, z: cz }), P(Cyl(2.25, 2.7, 1.4, 9), FV.stone2, { x: cx, y: 1.1, z: cz }));
    for (const y of [2.6, 4.1, 5.6]) S.push(P(Cyl(2.12, 2.12, 0.12, 9), FV.course, { x: cx, y, z: cz }));
    S.push(P(Cyl(2.45, 2.1, 0.6, 9), FV.stone3, { x: cx, y: 7.4, z: cz }));
    for (let k = 0; k < 8; k++) {
      const a = k * PI / 4 + PI / 8;
      S.push(P(Box(0.75, 0.9, 0.45), FV.stone, { x: cx + Math.cos(a) * 2.2, y: 8.15, z: cz + Math.sin(a) * 2.2, ry: PI / 2 - a }));
    }
    for (const a of [Math.atan2(sz, sx), Math.atan2(sz, sx) + 0.9, Math.atan2(sz, sx) - 0.9]) for (const y of [3.3, 5]) {
      S.push(P(Box(0.16, 0.85, 0.2), FV.dark, { x: cx + Math.cos(a) * 2.08, y, z: cz + Math.sin(a) * 2.08, ry: PI / 2 - a }));
    }
    // Its cannon on a swivel ring, and its stair turret (red roof, pennant): shot off together, leaving a wreck.
    const gun = new THREE.Group();
    gun.position.set(cx, 7.7, cz);
    add(gun, Cyl(1.15, 1.25, 0.4, 9), lam(FV.iron));
    const aim = new THREE.Group();
    aim.position.y = 0.55;
    add(aim, Box(1.3, 0.7, 1.6), lam(FV.wood));
    for (const s of [-0.7, 0.7]) add(aim, Cyl(0.35, 0.35, 0.15, 8), lam(FV.dark), { x: s, y: -0.15, rz: PI / 2 });
    add(aim, Cyl(0.28, 0.38, 2.8, 8), lam(FV.iron), { y: 0.35, z: 1.1, rx: PI / 2 });
    add(aim, Cyl(0.42, 0.42, 0.35, 8), lam('#e8302a'), { y: 0.35, z: 2.45, rx: PI / 2 });
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.35, 2.8);
    aim.add(muzzle);
    gun.add(aim);
    const turret = new THREE.Group();
    turret.position.set(sx * 1.35, 0.4, sz * 1.35); // on the outer corner, clear of the cannon's swing
    add(turret, Cyl(0.6, 0.6, 1.6, 8), lam(FV.stone3), { y: 0.8 });
    add(turret, Cone(0.85, 1.5, 8), lam(FV.roof), { y: 2.35 });
    add(turret, Sph(0.16, 5, 4), lam(FV.gold), { y: 3.15 });
    add(turret, Cyl(0.04, 0.04, 1.6, 4), lam(FV.dark), { y: 3.9 });
    const pennant = new THREE.Group();
    pennant.position.y = 4.5;
    add(pennant, Box(0.04, 0.5, 1), lam(FV.flag), { z: -0.5 });
    add(pennant, Box(0.04, 0.26, 0.7), lam(FV.gold), { z: -1.3 });
    turret.add(pennant);
    gun.add(turret);
    g.add(gun);
    const wreck = new THREE.Group();
    wreck.position.copy(gun.position);
    add(wreck, Cyl(1.15, 1.25, 0.35, 9), lam(FV.soot));
    add(wreck, Box(1.2, 0.5, 1.2), lam('#3a2f2a'), { y: 0.35, rz: 0.35 });
    add(wreck, Cyl(0.26, 0.32, 1.4, 6), lam(FV.iron), { x: 0.3, y: 0.6, z: 0.5, rx: 1.2, rz: -0.5 });
    add(wreck, Cyl(0.6, 0.6, 0.8, 8), lam(FV.soot), { x: sx * 1.35, y: 0.8, z: sz * 1.35 });
    add(wreck, Cone(0.8, 0.9, 8), lam('#6a2a20'), { x: sx * 1.35 + 0.3, y: 1.1, z: sz * 1.35, rz: 1.1 });
    wreck.visible = false;
    g.add(wreck);
    breakable(g, gun, 2.2, 'cannon', GUN_HP, { keepHp: true, wreck });
    guns.push({ gun, aim, wreck, muzzle, y0: gun.position.y, pennant });
  }
  // The keep: stepped stone, courses, a corbelled top with merlons, pepperpot turrets on its corners, a chimney.
  S.push(P(Box(5.4, 7.4, 5.4), FV.stone, { y: 4.1 }), P(Box(5.9, 1, 5.9), FV.stone2, { y: 0.9 }));
  for (const y of [2.4, 4.4, 7]) S.push(P(Box(5.46, 0.12, 5.46), FV.course, { y }));
  S.push(P(Box(6, 0.5, 6), FV.stone3, { y: 8 }), P(Box(5.6, 0.2, 5.6), FV.stone2, { y: 8.3 }));
  for (let k = 0; k < 5; k++) for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const u = -2.4 + k * 1.2;
    S.push(P(Box(az ? 0.65 : 0.4, 0.8, az ? 0.4 : 0.65), FV.stone, { x: ax ? ax * 2.8 : u, y: 8.8, z: az ? az * 2.8 : u }));
  }
  for (const [x, z] of [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9]]) {
    S.push(P(Cyl(0.7, 0.55, 1.6, 8), FV.stone3, { x, y: 8.7, z }), P(Cone(0.95, 1.6, 8), FV.roof, { x, y: 10.3, z }), P(Sph(0.15, 5, 4), FV.gold, { x, y: 11.15, z }));
  }
  S.push(P(Box(0.7, 1.6, 0.7), FV.stone2, { x: 1.9, y: 9.1, z: 1.9 }), P(Box(0.85, 0.2, 0.85), FV.dark, { x: 1.9, y: 9.95, z: 1.9 }));
  // The grumpy face on the keep's front: stone brows over glowing window eyes, pupils glaring down, a frown, a door.
  for (const s of [-1, 1]) {
    S.push(P(Box(1.15, 1.45, 0.12), FV.dark, { x: s * 1.2, y: 5.6, z: 2.72 }));
    L.push(P(Box(0.9, 1.2, 0.1), FV.glass, { x: s * 1.2, y: 5.6, z: 2.76 }));
    S.push(P(Box(0.34, 0.42, 0.06), FV.dark, { x: s * 1.05, y: 5.3, z: 2.83 }));
    S.push(P(Box(1.6, 0.38, 0.4), FV.stone2, { x: s * 1.2, y: 6.6, z: 2.8, rz: s * 0.38 }));
    S.push(P(Box(0.75, 0.24, 0.12), FV.dark, { x: s * 1.05, y: 4.15, z: 2.74, rz: -s * 0.45 }));
  }
  S.push(P(Box(1.3, 0.24, 0.12), FV.dark, { y: 4.42, z: 2.74 }));
  S.push(P(Box(1.3, 1.7, 0.12), FV.wood, { y: 1.3, z: 3 }), P(Box(1.5, 0.18, 0.14), FV.dark, { y: 2.2, z: 3.02 }));
  for (const [x, z, ry] of [[2.72, 0, PI / 2], [-2.72, 0, PI / 2], [0, -2.72, 0]]) for (const y of [3.4, 5.8]) S.push(P(Box(0.6, 0.9, 0.1), FV.dark, { x, y, z, ry }));
  // The crown rests on a red cushion on the keep roof's back corner (Enemies.spawnBoss puts it there: crownX/Y/Z).
  S.push(P(Box(1.5, 0.4, 1.5), FV.flag, { x: -1.6, y: 8.6, z: -1.6 }), P(Box(1.56, 0.08, 1.56), FV.gold, { x: -1.6, y: 8.8, z: -1.6 }));
  const paint = new THREE.Mesh(M(S), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  g.add(paint);
  g.add(new THREE.Mesh(M(L), new THREE.MeshBasicMaterial({ vertexColors: true })));
  const breachMesh = new THREE.Mesh(M(breach), paint.material);
  g.add(breachMesh);
  // The big flag on the keep's back corner.
  add(g, Cyl(0.08, 0.1, 4.2, 5), lam(FV.dark), { x: 1.9, y: 10.5, z: -1.9 });
  add(g, Sph(0.18, 5, 4), lam(FV.gold), { x: 1.9, y: 12.65, z: -1.9 });
  const flag = new THREE.Group();
  flag.position.set(1.9, 11.7, -1.9);
  add(flag, Box(0.05, 1.5, 2.6), lam(FV.flag), { z: -1.3 });
  add(flag, Box(0.06, 0.3, 2.6), basic(FV.gold), { z: -1.3 });
  add(flag, Cyl(0.35, 0.35, 0.07, 8), basic(FV.gold), { z: -1.3, y: 0.1, rz: PI / 2 });
  g.add(flag);
  // The great mortar on the keep roof (it sinks into the keep when the fort ducks): an iron mount, and the barrel
  // (banded, with a red muzzle) that turns to aim at you, never lower than a mortar's lob (Enemies.animateFort). Shot off, it leaves a smoking stump.
  const mortar = new THREE.Group();
  mortar.position.y = 8.4;
  add(mortar, Cyl(1.3, 1.5, 0.9, 10), lam(FV.iron), { y: 0.45 });
  add(mortar, Cyl(1.55, 1.55, 0.2, 10), lam(FV.gold), { y: 0.9 });
  const barrel = new THREE.Group();
  barrel.position.y = 1.9;
  const tube = new THREE.Group();
  tube.position.z = 1.4;
  add(tube, Cyl(0.95, 1.25, 3.6, 10), lam(FV.iron), { rx: PI / 2 });
  for (const z of [-1.2, 0.2]) add(tube, Cyl(1.15, 1.15, 0.3, 10), lam('#4a4a52'), { z, rx: PI / 2 });
  add(tube, Cyl(1.25, 1.25, 0.5, 10), lam('#e8302a'), { z: 1.8, rx: PI / 2 });
  add(tube, Cyl(0.7, 0.7, 0.1, 10), basic('#111111'), { z: 2.06, rx: PI / 2 });
  for (const s of [-1, 1]) add(barrel, Box(0.5, 0.5, 0.5), lam('#4a4a52'), { x: s * 1.25 });
  barrel.add(tube);
  const muzzle = new THREE.Object3D();
  muzzle.position.z = 3.8;
  barrel.add(muzzle);
  mortar.add(barrel);
  const stump = new THREE.Group();
  add(stump, Cyl(0.9, 1.1, 1.2, 8), lam(FV.soot), { y: 1.6, rx: 0.4 });
  add(stump, Box(1.2, 0.4, 0.8), lam('#3a2f2a'), { y: 2.1, z: 0.3, rz: 0.4 });
  stump.visible = false;
  mortar.add(stump);
  g.add(mortar);
  breakable(g, tube, 2.2, 'barrel', 3, { wreck: stump });
  // Damage, in two stages (Enemies.animate): fires and soot at 2/3 hp; at 1/3 the breached wall top falls (rubble
  // shows at its foot), cracks glow in the keep and the flag burns. `smoke` marks where each stage smokes.
  const hidden = (o) => { o.visible = false; return o; };
  const scorch = hidden(new THREE.Mesh(M([
    P(Box(0.06, 1.6, 2.2), FV.soot, { x: -7.25, y: 3.4, z: -3 }), P(Box(2.4, 1.4, 0.06), FV.soot, { x: 3.5, y: 3.5, z: -7.25 }),
    P(Box(0.06, 1.4, 2), FV.soot, { x: 7.25, y: 3.5, z: 2.4 }), P(Box(1.6, 1.2, 0.06), FV.soot, { x: -0.6, y: 6.6, z: 2.74 }),
  ]), lam('#ffffff', { vertexColors: true })));
  g.add(scorch);
  const rubble = hidden(new THREE.Mesh(M([0, 1, 2, 3, 4, 5, 6].map((k) => P(Dod(0.5 + (k % 3) * 0.25), k % 2 ? FV.stone : FV.stone2, { x: -7.8 - (k % 3) * 0.5, y: 0.6 + (k % 2) * 0.3, z: 0.8 + k * 0.55, ry: k, rx: k * 0.7 }))), paint.material));
  g.add(rubble);
  const cracks = hidden(new THREE.Mesh(M([
    P(Box(0.14, 1.4, 0.06), FV.ember, { x: 0.3, y: 7.1, z: 2.76, rz: 0.5 }), P(Box(0.14, 1.2, 0.06), FV.ember, { x: 0.65, y: 6.2, z: 2.76, rz: -0.4 }),
    P(Box(0.12, 1.3, 0.06), FV.ember, { x: -2.2, y: 3.2, z: 2.76, rz: 0.3 }), P(Box(0.06, 1.5, 0.12), FV.ember, { x: 2.76, y: 5, z: 0.8, rx: 0.5 }),
  ]), new THREE.MeshBasicMaterial({ vertexColors: true })));
  g.add(cracks);
  const fire1 = [fortFlame(g, -6.6, 4.5, -3, 1.1), fortFlame(g, 3.5, 4.5, -6.6, 1), fortFlame(g, 6.6, 4.5, 2.4, 1.1)].map(hidden);
  const fire2 = [fortFlame(g, -6.6, 2.9, 2.4, 1.4), fortFlame(g, 1.9, 11.2, -1.9, 0.9), fortFlame(g, -1.8, 8.4, 1.8, 1)].map(hidden);
  flames.push(...fire1, ...fire2);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const damage = [
    { at: 2 / 3, show: [scorch, ...fire1], hide: [], smoke: [V(-6.6, 5.5, -3), V(3.5, 5.5, -6.6), V(6.6, 5.5, 2.4)] },
    { at: 1 / 3, show: [rubble, cracks, ...fire2], hide: [breachMesh], smoke: [V(-6.6, 3.5, 2.4), V(1.9, 12, -1.9), V(-1.8, 9.5, 1.8)], burst: V(-6.6, 3.6, 2.4) },
  ];
  // Chimney smoke: four puffs that rise, swell and fade in turn.
  const puffs = [];
  for (let k = 0; k < 4; k++) puffs.push(add(g, Dod(0.6), new THREE.MeshLambertMaterial({ color: '#8a8f96', transparent: true, opacity: 0.5, depthWrite: false, flatShading: true }), { x: 1.9, y: 10, z: 1.9 }));
  Object.assign(g.userData, {
    guns, barrel, muzzle, mortar, portcullis, flames, damage, flag, wrecks: [stump], chimney: { puffs, at: [1.9, 10, 1.9], rise: 6, drift: [1, -2.5] },
    duck: { mortar: 3.6, gun: 0.7, gate: 2.4 }, faceYou: true,
  });
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
  const m = lam('#a9b0c2', { emissive: '#4a5068' }); // soft slate, lit from within: never a black blot overhead
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

// A drone hiding behind an umbrella (+Z, its front). Bullets from the front bounce off (enemies.js guarded), so the
// drone's eye isn't a weak point here: the glowing battery on its back is.
export function makeUmbrella(hat) {
  const g = makeDrone(hat);
  for (const part of g.userData.parts.filter((x) => x.glow)) part.obj.remove(part.glow);
  g.userData.parts = g.userData.parts.filter((x) => !x.glow);
  add(g, Cone(7.5, 2.2, 8), lam('#3d6fd1'), { z: 5.2, rx: PI / 2 });
  add(g, Sph(0.6, 5, 4), lam(C.white), { z: 6.6 });
  add(g, Cyl(0.18, 0.18, 4.5, 5), lam('#333333'), { z: 3.4, rx: PI / 2 });
  weak(g, add(g, Box(2, 1.6, 1.2), basic('#ffd23a'), { z: -3.2, y: 0.4 }), 1.4, 2);
  return g;
}

// A Grudge Rock: a mossy boulder with a flower on top and an angry face on its front (+Z).
export function makeGrudgeRock(hat) {
  const g = new THREE.Group(), stone = lam(C.rock);
  add(g, Ico(6, 0), stone, { s: [1.1, 0.8, 1] });
  add(g, Cone(5, 6, 6), lam(C.rock2), { y: -6, rx: PI }); // the underside, point down
  add(g, Cyl(4.8, 5.4, 1, 7), lam(C.grass), { y: 4.2 }); // a moss cap
  add(g, Box(0.15, 1.2, 0.15), lam(C.leaf), { x: 2, y: 5.2 });
  add(g, Sph(0.55, 5, 4), basic(C.yellow), { x: 2, y: 5.9 });
  for (const s of [-1, 1]) {
    add(g, Sph(1.1, 8, 6), basic('#ffffff'), { x: s * 1.8, y: 0.8, z: 5.6 });
    add(g, Sph(0.5, 6, 4), basic('#111111'), { x: s * 1.8, y: 0.8, z: 6.6 });
    add(g, Box(2.4, 0.5, 0.5), basic('#222222'), { x: s * 1.8, y: 2.3, z: 6, rz: s * 0.4 }); // inner ends down: cross
  }
  if (hat) partyHat(g, 6);
  return g;
}

// One of the pebbles a Grudge Rock breaks into. Still cross about it.
export function makePebble() {
  const g = new THREE.Group();
  add(g, Ico(2.2, 0), lam(C.rock), { s: [1, 0.85, 1.1] });
  add(g, Sph(0.7, 4, 3), lam(C.grass), { y: 1.6 });
  for (const x of [-0.6, 0.6]) add(g, Sph(0.4, 5, 4), basic('#ffffff'), { x, y: 0.4, z: 2 });
  add(g, Box(1.6, 0.35, 0.35), basic(C.black), { y: 1, z: 2, rz: 0.3 }); // one angry brow
  return g;
}

// A Grumbling: a lumpy little rock the colour of Grumbleglobe that its pores burp out, with one dark angry brow.
// Up to a dozen fly at once, so they all share one set of geometry and materials (userData.keep: disposeTree skips them).
let GRUMBLING = null;
export function makeGrumbling() {
  GRUMBLING ||= { body: Dod(4), brow: Box(4.4, 0.9, 0.9), rock: lam('#7a6a8a'), dark: basic('#2a1a3a') };
  const g = new THREE.Group(), G = GRUMBLING;
  add(g, G.body, G.rock, { s: [1, 0.85, 1.05] }).userData.keep = true;
  add(g, G.brow, G.dark, { y: 1.6, z: 3.6, rz: 0.25 }).userData.keep = true;
  return g;
}

// The pigeon, recoloured as a brown owl (yellow eyes), with a telescope.
export function makeOwl(hat) {
  const g = makePigeon(hat), RECOLOR = { '7a84a0': '#8a5a32', '5a6a8a': '#6a4426', '6a7490': '#7a4e2a', ff2020: '#ffd23a' };
  g.traverse((o) => { const to = o.material && RECOLOR[o.material.color.getHexString()]; if (to) o.material.color.set(to); });
  add(g, Cyl(0.45, 0.6, 4, 8), lam('#c8a040'), { x: 1.2, y: 1.6, z: 4.4, rx: PI / 2 });
  add(g, Cyl(0.5, 0.5, 0.2, 8), basic('#ff3a3a'), { x: 1.2, y: 1.6, z: 6.45, rx: PI / 2 });
  return g;
}

// A kite (it faces +Z) with a bow-tied tail hanging below.
export function makeKite(hat) {
  const g = new THREE.Group(), color = pick(['#ff4d6a', '#ffd23a', '#4dc4ff', '#7aff5a']);
  add(g, Oct(4), lam(color), { s: [0.8, 1.3, 0.12] });
  add(g, Box(0.2, 10, 0.2), lam(C.white), { z: 0.3 });
  add(g, Box(6.4, 0.2, 0.2), lam(C.white), { z: 0.3 });
  for (let k = 0; k < 4; k++) add(g, Box(1.4, 0.5, 0.2), lam(k % 2 ? C.white : color), { y: -6 - k * 2, rz: k % 2 ? 0.4 : -0.4 });
  add(g, Box(0.12, 8, 0.12), basic(C.white), { y: -9 });
  if (hat) partyHat(g, 6);
  return g;
}

// A moth: a round body and two flat triangle wings that flap (userData.wings).
export function makeMoth(hat) {
  const g = new THREE.Group(), wingMat = lam('#d8c8a0', { side: THREE.DoubleSide });
  add(g, Sph(1.2, 8, 6), lam('#8a7a60'), { s: [1, 1, 1.8] });
  for (const x of [-0.5, 0.5]) {
    add(g, Sph(0.4, 5, 4), basic('#1d1d22'), { x, y: 0.4, z: 1.9 });
    add(g, Box(0.1, 0.1, 1.8), lam('#5a4a3a'), { x: x * 1.4, y: 1, z: 2.4, rx: -0.6 });
  }
  const l = new THREE.Group(), r = new THREE.Group();
  add(l, new THREE.CircleGeometry(3.4, 3), wingMat, { x: -3, rx: -PI / 2, rz: PI });
  add(r, new THREE.CircleGeometry(3.4, 3), wingMat, { x: 3, rx: -PI / 2 });
  g.add(l, r);
  g.userData.wings = [l, r];
  if (hat) partyHat(g, 1.6);
  return g;
}

// Land enemies (enemies.js TYPES `lands`): they only turn up in their own land.

// Ember Bat (Volcano Land): a basalt bat with glowing lava veins, ember-edged wings and hot yellow eyes.
export function makeEmberBat(hat) {
  const g = new THREE.Group(), rock = lam('#2b2226'), vein = basic('#ff6a1a'), edge = basic('#ffb03a');
  const wingMat = lam('#3a2a2e', { side: THREE.DoubleSide, emissive: '#5a1408' });
  add(g, Sph(1.4, 8, 6), rock, { s: [1, 0.9, 1.5] });
  add(g, Sph(1, 7, 5), rock, { y: 0.6, z: 1.6 }); // head
  for (const x of [-0.55, 0.55]) {
    add(g, Cone(0.45, 1.3, 4), rock, { x, y: 1.7, z: 1.5, rz: -x * 0.6 }); // ears
    add(g, Sph(0.32, 5, 4), basic('#ffe14a'), { x: x * 0.8, y: 0.8, z: 2.5 });
  }
  add(g, Box(0.25, 0.25, 2.2), vein, { y: 0.9, z: -0.2 }); // a lava vein down its back
  for (const x of [-0.7, 0.7]) add(g, Box(0.15, 0.15, 1.4), vein, { x, y: 0.5, z: -0.6, ry: x * 0.4 });
  const wings = [-1, 1].map((sd) => {
    const w = new THREE.Group();
    // three scalloped membrane panels from the shoulder out, ember edges along the bottom
    for (let k = 0; k < 3; k++) {
      add(w, new THREE.CircleGeometry(1.6, 3), wingMat, { x: sd * (1.2 + k * 1.5), y: -0.2 * k, rx: -PI / 2, rz: sd > 0 ? 0 : PI });
      add(w, Box(1.4, 0.12, 0.18), edge, { x: sd * (1.4 + k * 1.5), y: -0.15 * k, z: -0.9 });
    }
    add(w, Box(4.6, 0.18, 0.18), rock, { x: sd * 2.6, y: 0.05, z: 0.6 }); // the wing bone
    g.add(w);
    return w;
  });
  g.userData.wings = wings;
  g.userData.embers = true; // trails sparks (enemies.js)
  if (hat) partyHat(g, 2);
  return g;
}

// Magma Spitter (Volcano Land): a lumpy basalt mound that hides in lava (or a rock vent), then heaves up, glows and
// spits fireballs. The mound itself is userData.body (enemies.js raises and sinks it); its mouth is the weak point.
export function makeMagmaSpitter(hat) {
  const g = new THREE.Group(), body = new THREE.Group();
  const rock = lam('#3a2c2a'), rock2 = lam('#2a2022'), crack = basic('#ff5a14'), glow = basic('#ffd23a');
  add(body, Dod(5.5), rock, { y: 2, s: [1.2, 0.9, 1.2] });
  add(body, Dod(3.6), rock2, { x: 3.2, y: 0.5, z: -1.5 });
  add(body, Dod(3.2), rock2, { x: -3.4, y: 0.2, z: -1 });
  for (const [x, y, z, ry, rz] of [[2.4, 3.2, 4.2, 0.3, 0.8], [-2.6, 2.6, 4.1, -0.4, -0.6], [0.4, 5.4, 2.8, 0.1, 0.2], [4.4, 1.6, 2.4, 0.9, 1.1], [-4.6, 1.2, 1.6, -0.8, -1.2]]) {
    add(body, Box(0.35, 2.6, 0.3), crack, { x, y, z, ry, rz }); // glowing cracks
  }
  add(body, Cyl(2, 2.8, 1.6, 8), rock2, { y: 6.2 }); // the crater lip
  const mouth = add(body, Cyl(1.6, 1.6, 0.4, 8), glow, { y: 6.9 });
  weak(g, mouth, 2.2);
  for (const x of [-1.6, 1.6]) {
    add(body, Sph(0.7, 6, 4), glow, { x, y: 3.6, z: 5.6 });
    add(body, Box(1.8, 0.45, 0.45), basic('#140a0a'), { x, y: 4.6, z: 5.4, rz: x > 0 ? 0.45 : -0.45 }); // cross brows
  }
  g.add(body);
  // While it's under, a ring of bubbling lava gives it away.
  const ring = add(g, Tor(4.5, 0.5, 5, 12), basic('#ff8a1f', { transparent: true, opacity: 0.7 }), { y: 0.3, rx: PI / 2 });
  g.userData.body = body;
  g.userData.ring = ring;
  g.userData.cracks = crack; // brightens before it spits
  heat(g, '#ff5a14', '#ffd947');
  if (hat) partyHat(body, 8);
  return g;
}

// Magmadora, the Lava Serpent (Volcano Land's boss): a horned basalt head with a hinged jaw and a throat that glows
// before it spits, then SERPENT_SEGS body segments, each a cooled crust plate over a hot orange belly with a glowing seam
// between plates, tapering to a spiked tail. enemies.js lays the segments along the head's path every frame
// (userData.segs, model units apart SERPENT_GAP). Weak points: two gill frills behind the head (they can be shot off) and
// an ember core on the mid-back, all with the usual faint halo.
export const SERPENT_SEGS = 16, SERPENT_GAP = 1.9;
export function makeLavaSerpent(hat) {
  const g = new THREE.Group();
  const crust = lam('#2b2226'), crust2 = lam('#3a2c2a'), belly = lam('#ff7a2a', { emissive: '#7a2008' });
  const seam = basic('#ff5a14'), hot = basic('#ffd23a'), horn = lam('#1a1416'), fin = lam('#8a2a14', { side: THREE.DoubleSide, emissive: '#3a0a04' });
  const head = new THREE.Group();
  add(head, Dod(1.9), crust, { s: [1, 0.75, 1.35] }); // the skull
  add(head, Box(2.2, 0.9, 1.8), crust2, { y: 0.15, z: 1.9 }); // the snout
  add(head, Box(2.6, 0.25, 0.3), horn, { y: 1.05, z: 1.1, rx: 0.2 }); // the brow ridge
  for (const x of [-0.7, 0.7]) {
    add(head, Sph(0.36, 6, 4), hot, { x, y: 0.75, z: 1.35 }); // eyes
    add(head, Box(0.1, 0.42, 0.1), basic('#140a0a'), { x, y: 0.75, z: 1.68 }); // slit pupils
    add(head, Cone(0.38, 2.2, 5), horn, { x: x * 1.25, y: 1.25, z: -0.9, rx: -1.15, rz: -x * 0.5 }); // swept-back horns
    add(head, Cone(0.22, 1.1, 4), horn, { x: x * 1.5, y: 0.5, z: -0.4, rx: -1.3, rz: -x * 1.1 }); // cheek spikes
    add(head, Box(0.12, 0.12, 1.6), seam, { x: x * 1.05, y: 0.15, z: 0.6, ry: x * 0.25 }); // glowing cheek cracks
    add(head, Sph(0.12, 4, 3), hot, { x: x * 0.4, y: 0.55, z: 2.85 }); // nostrils
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.35, 0.6); // hinged at the back of the mouth
  add(jaw, Box(2, 0.45, 2.4), crust2, { y: -0.2, z: 1.1 });
  add(jaw, Box(1.6, 0.12, 2), seam, { y: 0.06, z: 1.1 }); // the hot inside of the mouth
  for (const x of [-0.75, -0.25, 0.25, 0.75]) add(jaw, Cone(0.13, 0.4, 4), basic('#f4e8d0'), { x, y: 0.25, z: 2.1 }); // teeth
  head.add(jaw);
  const throat = add(head, Sph(0.55, 8, 6), basic('#ff5a14', { transparent: true, opacity: 0.6 }), { y: -0.2, z: 1.6 });
  const mouth = new THREE.Object3D();
  mouth.position.set(0, -0.2, 3);
  head.add(mouth);
  const frills = [-1, 1].map((sd) => {
    const f = new THREE.Group();
    f.position.set(sd * 1.5, 0.2, -0.9);
    add(f, new THREE.CircleGeometry(1.15, 5, -0.9, 1.8), fin, { ry: sd * 1.1 }); // a fan of webbing
    for (const a of [-0.5, 0, 0.5]) add(f, Box(0.1, 0.1, 1.2), seam, { x: sd * 0.35, y: a * 1.1, z: -0.3, ry: sd * 0.9, rx: -a }); // its glowing ribs
    head.add(f);
    weak(g, f, 1.1, 2, { name: 'frill', hp: 1.5 });
    return f;
  });
  g.add(head);
  const segs = [];
  for (let k = 0; k < SERPENT_SEGS; k++) {
    const t = k / (SERPENT_SEGS - 1), r = 1.75 - 1.15 * t ** 1.4; // thick behind the head, thin at the tail
    const sg = new THREE.Group();
    add(sg, Dod(r), crust, { y: r * 0.18, s: [1, 0.78, 1.25] }); // the cooled crust plate on top
    add(sg, Sph(r * 0.86, 8, 6), belly, { y: -r * 0.22, s: [1.02, 0.7, 1.2] }); // the hot belly
    add(sg, Tor(r * 0.92, r * 0.1, 4, 12), seam, { z: -r * 1.05 }); // the glowing seam to the next plate
    if (k % 2 === 0 && k < SERPENT_SEGS - 1) add(sg, Cone(r * 0.32, r * 1.1, 4), horn, { y: r * 0.95, z: -r * 0.2, rx: -0.5 }); // dorsal spikes
    if (k === SERPENT_SEGS - 1) add(sg, Cone(r * 0.7, r * 3.2, 5), horn, { z: -r * 2, rx: -PI / 2 }); // the tail spike
    if (k === 6) { // the ember core, a slow hot heart showing through a split in the crust
      const core = add(sg, Ico(r * 0.42, 0), hot, { y: r * 0.95, z: r * 0.1 });
      weak(g, core, r * 0.5, 3);
    }
    g.add(sg);
    segs.push(sg);
    (g.userData.parts ||= []).push({ obj: sg, r: r * 1.15, mult: 1, hp: Infinity, name: 'seg', seg: true });
  }
  Object.assign(g.userData, { head, jaw, throat, mouth, frills, segs, segR: segs.map((_, k) => 1.75 - 1.15 * (k / (SERPENT_SEGS - 1)) ** 1.4), crownOn: head });
  if (hat) partyHat(head, 2);
  return g;
}

// Glacierra, the Aurora Ray (the snowy peaks' boss): a giant manta of blue ice with an aurora shimmering in the webbing
// of her wings. She rolls her wings into the plane of the shard fan she's about to fire (userData.tilt: level = a flat fan,
// on edge = an upright one). Weak points: an ice crystal on each wingtip (they can be shot off, two fewer shards each)
// and the aurora core on her back, all with the usual faint halo.
export function makeAuroraRay(hat) {
  const g = new THREE.Group(), tilt = new THREE.Group();
  const ice = lam('#a8dcf0', { emissive: '#0a2433' }), ice2 = lam('#6aa8cc', { emissive: '#06182a' }), belly = lam('#e8f8ff');
  const glint = basic('#e8fbff'), aurora = basic('#7affc8', { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const aurora2 = basic('#b48aff', { transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  add(tilt, Sph(2.3, 12, 8), ice, { s: [1, 0.38, 1.3] }); // the body
  add(tilt, Sph(2.1, 10, 6), belly, { y: -0.25, s: [0.95, 0.25, 1.2] }); // the pale belly
  for (const x of [-0.85, 0.85]) {
    add(tilt, Cone(0.45, 2, 4), ice2, { x, y: 0.1, z: 3.2, rx: PI / 2, s: [1, 1, 0.45] }); // the cephalic fins, curled forward
    add(tilt, Sph(0.32, 6, 4), glint, { x: x * 1.05, y: 0.45, z: 2.2 }); // eyes
    add(tilt, Sph(0.14, 4, 3), basic('#0a1a2a'), { x: x * 1.05, y: 0.55, z: 2.45 }); // pupils
  }
  for (const [x, c] of [[-0.45, aurora], [0, aurora2], [0.45, aurora]]) add(tilt, Box(0.16, 0.06, 3.4), c, { x, y: 0.82, z: -0.2 }); // aurora stripes down the back
  const wings = [-1, 1].map((sd) => {
    const w = new THREE.Group();
    w.position.set(sd * 1.7, 0, -0.2);
    add(w, Cone(1.7, 6.2, 4), ice, { x: sd * 3, rz: -sd * PI / 2, s: [0.22, 1, 1] }); // the wing, thin and swept
    add(w, Cone(1.2, 5, 4), aurora, { x: sd * 2.8, y: 0.05, z: -0.9, rz: -sd * PI / 2, s: [0.1, 1, 1] }); // the aurora webbing
    add(w, Cone(0.9, 4, 4), aurora2, { x: sd * 2.4, y: -0.05, z: -1.4, rz: -sd * PI / 2, s: [0.1, 1, 1] });
    for (const k of [1, 2, 3]) add(w, Cone(0.18, 1, 4), glint, { x: sd * k * 1.5, y: 0.25, z: 0.6 - k * 0.25, rx: -0.4 }); // frost spines on the leading edge
    const crystal = add(w, Ico(0.7, 0), glint, { x: sd * 6.1, s: [1, 1.4, 1] }); // the wingtip crystal
    weak(g, crystal, 0.9, 2, { name: 'crystal', hp: 1.5 });
    tilt.add(w);
    return w;
  });
  add(tilt, Cone(0.35, 7, 5), ice2, { z: -5.2, rx: -PI / 2 }); // the whip tail
  for (const z of [-3.4, -4.6, -5.8]) add(tilt, Cone(0.16, 0.8, 4), glint, { y: 0.3, z, rx: -0.6 }); // icicles along it
  const core = add(tilt, Ico(0.6, 0), basic('#7affc8'), { y: 0.95, z: 0.6 }); // the aurora core
  weak(g, core, 0.8, 3);
  g.add(tilt);
  Object.assign(g.userData, { tilt, wings, webs: [aurora, aurora2], crownOn: tilt });
  if (hat) partyHat(tilt, 1);
  return g;
}

// Pharaoh Scarabus (desert lands): a giant flying scarab, gold shell over teal, a carved horn and a sun-disc between its
// horns. Two mirage copies ride along hidden (userData.mirages: see MOVES.mirage), made of the same parts in see-through
// shimmer; only the real one casts the shadow disc on the ground (userData.shadow).
function scarabBody(g, mat, real) {
  const { shell, shell2, belly, dark, gold, sun, eye } = mat;
  add(g, Sph(2.2, 10, 7), belly, { y: -0.2, s: [1, 0.55, 1.25] }); // underside
  const wings = [-1, 1].map((sd) => {
    const w = new THREE.Group();
    w.position.set(sd * 0.05, 0.35, 0.2);
    add(w, Sph(2.1, 10, 7), sd < 0 ? shell : shell2, { x: sd * 1.05, s: [0.55, 0.42, 1.25] }); // the elytra halves
    add(w, Box(0.12, 0.1, 4.6), gold, { x: sd * 0.08, y: 0.85 }); // gold seam
    g.add(w);
    return w;
  });
  add(g, Sph(1.15, 8, 6), dark, { z: 2.7, y: 0.1, s: [1.1, 0.7, 0.8] }); // head
  const horn = add(g, Cone(0.45, 2.4, 6), gold, { z: 3.6, y: 0.9, rx: -0.5 });
  const disc = add(g, Cyl(1, 1, 0.25, 12), sun, { z: 3.3, y: 2.3, rx: PI / 2 }); // the sun-disc it carries
  for (const sd of [-1, 1]) {
    add(g, Sph(0.28, 6, 4), eye, { x: sd * 0.55, y: 0.35, z: 3.45 }); // eyes
    for (let k = 0; k < 3; k++) add(g, Cyl(0.12, 0.08, 2, 4), dark, { x: sd * 1.9, y: -0.7, z: 1.3 - k * 1.3, rz: sd * 1.1, rx: (k - 1) * 0.3 }); // legs
  }
  return { wings, horn, disc, real };
}
export function makeSunBeetle(hat) {
  const g = new THREE.Group();
  const look = () => ({ shell: lam('#e0a42a', { emissive: '#3a2200' }), shell2: lam('#d08e1a', { emissive: '#331c00' }), belly: lam('#1f6f6a'), dark: lam('#24333a'), gold: lam('#ffd66a', { emissive: '#4a3200' }), sun: basic('#ffb03a'), eye: basic('#ffe066') });
  const real = scarabBody(g, look(), true);
  weak(g, real.disc, 1.4, 3); // the sun-disc is the soft spot
  breakable(g, real.horn, 1.1, 'horn', 2); // a horn shot off: smaller volleys
  // Mirages: same body, see-through and a little washed out (they shimmer, see MOVES.mirage.pose).
  const mirages = [0, 1].map(() => {
    const m = new THREE.Group(), mats = look();
    for (const mat of Object.values(mats)) Object.assign(mat, { transparent: true, opacity: 0.75 });
    const body = scarabBody(m, mats, false);
    // The same faint halo as the real one's soft spot (no part: shots go straight through a mirage).
    const halo = new THREE.Mesh(Sph(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffc070', transparent: true, opacity: 0.14, depthWrite: false }));
    halo.scale.setScalar(1.4 * 1.15);
    body.disc.add(halo);
    m.visible = false;
    Object.assign(m.userData, { mats: Object.values(mats), halo });
    g.add(m);
    return m;
  });
  // The real one's shadow on the ground: a soft dark disc, kept flat and under it (see MOVES.mirage.pose).
  const shadowGeo = new THREE.CircleGeometry(1, 20);
  shadowGeo.rotateX(-PI / 2);
  const shadow = new THREE.Mesh(shadowGeo, basic('#000000', { transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.visible = false;
  g.add(shadow);
  Object.assign(g.userData, { wings: real.wings, scarab: true, mirages, shadow, crownOn: g });
  if (hat) partyHat(g, 1.6);
  return g;
}

// Lady Hootrude (woods lands): a plump autumn owl, russet and pumpkin, a cream face disc with a dark rim, amber eyes, two
// tall ear tufts (breakable: weaker gusts) and a glowing amber chest (the soft spot, brighter while she rears up). She is
// rigged to fly (posed every frame by MOVES.gust.fly): userData.rig bobs with the wingbeat, head swivels and tilts, each
// wing is an arm with a hand that lags the stroke (wings, hands), lids blink, talons tuck back, the tail fans.
export function makeHarvestOwl(hat) {
  const g = new THREE.Group(), rig = new THREE.Group();
  g.add(rig);
  const russet = lam('#a0522d', { emissive: '#2a1206' }), pumpkin = lam('#c8692a', { emissive: '#2a1406' }), dark = lam('#6a3418');
  const cream = lam('#f2e2c0'), wingMat = lam('#8a4a24', { emissive: '#1e0c04' }), tip = lam('#e8a33a'), buff = lam('#d9a066');
  const gold = lam('#e8b030'), streak = lam('#7a4422');
  add(rig, Sph(2.4, 14, 10), russet, { s: [1, 1.15, 0.95] }); // the plump body
  for (let k = -1; k <= 1; k++) add(rig, Sph(0.95, 6, 4), dark, { x: k * 1.25, y: 0.9 - Math.abs(k) * 0.3, z: -2.05, ry: k * 0.5, s: [1, 0.6, 0.3] }); // back scales
  add(rig, Sph(1.9, 12, 8), cream, { y: -1.25, z: 0.85, s: [1, 0.9, 0.62] }); // the cream bib under the chest
  for (let r = 0; r < 2; r++) for (let k = -1; k <= 1; k++) { // its dark chevrons
    if (r && !k) continue;
    add(rig, Cone(0.2, 0.5, 3), streak, { x: k * 0.65 + r * 0.32 * (k || 1), y: -1.35 - r * 0.6, z: 1.98 - r * 0.12, rx: PI, s: [1, 1, 0.4] });
  }
  const chest = add(rig, Sph(1.3, 10, 8), basic('#ffa040'), { y: -0.2, z: 1.75, s: [1, 1.2, 0.45] }); // the glowing chest
  weak(g, chest, 1.5, 3);
  for (let k = 0; k < 3; k++) add(rig, Box(1.6 - k * 0.3, 0.12, 0.2), dark, { y: 0.6 - k * 0.55, z: 2.15 }); // chest bars
  // The head turns on her neck (y 1.9): everything on it is placed from there, the crown too (BOSSES crownY).
  const head = new THREE.Group();
  head.position.set(0, 1.9, 0.3);
  rig.add(head);
  add(head, Sph(1.9, 14, 10), pumpkin, { y: 0.7, s: [1.1, 0.95, 1] });
  add(head, Sph(1.6, 14, 9), cream, { y: 0.7, z: 1.25, s: [1.05, 0.9, 0.35] }); // face disc
  add(head, Tor(1.55, 0.16, 5, 20), dark, { y: 0.7, z: 1.38, s: [1.07, 0.92, 1] }); // its dark rim
  for (const k of [-1, 0, 1]) add(head, Cone(0.35, 0.9, 4), russet, { x: k * 0.6, y: 1.9, z: -1.1, rx: -1, rz: -k * 0.3 }); // nape feathers
  const lids = [];
  for (const sd of [-1, 1]) {
    add(head, Sph(0.52, 10, 8), basic('#ffbf2a'), { x: sd * 0.68, y: 0.88, z: 1.65 }); // amber eyes
    add(head, Sph(0.26, 8, 6), basic('#1a1008'), { x: sd * 0.68, y: 0.88, z: 2.08 }); // pupils
    add(head, Sph(0.08, 4, 3), basic('#ffffff'), { x: sd * 0.68 + 0.1, y: 1.0, z: 2.3 }); // a glint
    const lid = add(head, Sph(0.56, 10, 6), pumpkin, { x: sd * 0.68, y: 0.88, z: 1.72, s: [1, 1, 0.75] }); // eyelids (for a blink)
    lid.visible = false;
    lids.push(lid);
    add(head, Box(0.9, 0.18, 0.2), dark, { x: sd * 0.7, y: 1.45, z: 1.65, rz: sd * 0.3 }); // stern brows
    const tuft = add(head, Cone(0.45, 1.9, 4), dark, { x: sd * 1.05, y: 2.35, z: -0.05, rz: -sd * 0.35 }); // ear tufts
    add(tuft, Cone(0.22, 0.9, 4), tip, { y: 0.75, x: -sd * 0.12 }); // their light tips (they go with the tuft)
    breakable(g, tuft, 0.9, 'tuft', 2);
  }
  add(head, Cone(0.32, 1, 4), lam('#5a3a1a'), { y: 0.35, z: 1.9, rx: PI / 2 + 0.5 }); // beak
  // Legs from the hip, feathered to the ankle, gold toes: they tuck back in flight and reach forward in a rear-up.
  const legs = new THREE.Group();
  legs.position.set(0, -2.2, 0.5);
  rig.add(legs);
  for (const sd of [-1, 1]) {
    add(legs, Sph(0.6, 8, 6), buff, { x: sd * 0.7, y: -0.15, s: [1, 1.3, 1] });
    add(legs, Cyl(0.13, 0.13, 0.6, 4), gold, { x: sd * 0.7, y: -0.75 });
    for (const t of [-0.3, 0, 0.3]) add(legs, Cone(0.12, 0.6, 4), gold, { x: sd * 0.7 + t, y: -0.95, z: 0.35, rx: PI / 2 }); // talons
  }
  // The tail: a fan of five banded feathers (fans out in a rear-up).
  const tail = new THREE.Group();
  tail.position.set(0, -1.1, -1.9);
  rig.add(tail);
  for (let k = 0; k < 5; k++) {
    const f = add(tail, Cone(0.5, 2.6, 4), k % 2 ? tip : streak, { y: -0.4, z: -1.1, rx: PI / 2 - 0.5, s: [1, 1, 0.3] });
    f.rotation.order = 'YXZ';
    f.rotation.y = (k - 2) * 0.2;
  }
  // Wings: an arm from the shoulder (coverts on top, banded secondaries trailing) and a hand from the wrist with five
  // separate primaries spread like fingers.
  const hands = [];
  const wings = [-1, 1].map((sd) => {
    const w = new THREE.Group();
    w.position.set(sd * 2.1, 0.8, -0.1);
    add(w, Sph(1.45, 10, 6), wingMat, { x: sd * 1.35, y: -0.1, s: [1, 0.26, 1.05] });
    for (const k of [0, 1]) add(w, Sph(0.6, 6, 4), russet, { x: sd * (0.7 + k * 1.1), y: 0.2, z: 0.55, s: [1, 0.4, 0.7] }); // coverts
    for (const k of [0, 1, 2]) add(w, Cone(0.42, 1.7, 4), k % 2 ? tip : wingMat, { x: sd * (0.6 + k * 0.9), y: -0.15, z: -1.1, rx: -PI / 2, s: [1, 1, 0.3] });
    const hand = new THREE.Group();
    hand.position.set(sd * 2.7, -0.1, 0);
    w.add(hand);
    add(hand, Sph(1.05, 8, 6), wingMat, { x: sd * 0.85, s: [1, 0.24, 0.85] });
    for (let k = 0; k < 5; k++) {
      const f = add(hand, Cone(0.26, 2.3, 4), k % 2 ? tip : streak, { x: sd * (1.5 + k * 0.08), z: 0.35 - k * 0.32, rz: -sd * PI / 2, s: [0.3, 1, 1] });
      f.rotation.order = 'YXZ';
      f.rotation.y = sd * k * 0.16; // fanned back like fingers
    }
    hands.push(hand);
    w.rotation.z = -sd * 1.15; // folded until she flies (MOVES.gust.fly)
    rig.add(w);
    return w;
  });
  Object.assign(g.userData, { wings, hands, head, lids, talons: legs, tail, rig, owl: true, chest: chest.material, crownOn: head });
  if (hat) partyHat(head, 2.5);
  return g;
}

// Lady Hootrude's harvest oak: a giant autumn tree with a bare snag and crossbar on top (userData.perchY) where she sits
// until you come near (MOVES.gust.spawn / PERCH). Decoration only: no collision, like the world's other trees.
export function makeHarvestOak() {
  const g = new THREE.Group(), bark = lam('#5a3a22'), bark2 = lam('#47301e');
  const leaves = ['#c8511e', '#e08a2a', '#b8452a', '#e8b23a'].map((c) => lam(c));
  add(g, Cyl(3.4, 5.8, 52, 7), bark, { y: 22 }); // the trunk, a little under the ground
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + 0.4; add(g, Cone(2.4, 9, 5), bark2, { x: Math.cos(a) * 4.2, y: 1.5, z: Math.sin(a) * 4.2, rx: Math.sin(a) * 0.7, rz: -Math.cos(a) * 0.7 }); } // roots
  for (let k = 0; k < 5; k++) { // boughs
    const a = k * 1.3, y = 30 + (k % 3) * 5;
    add(g, Cyl(0.9, 1.8, 20, 5), bark, { x: Math.cos(a) * 7, y: y + 4, z: Math.sin(a) * 7, rx: Math.sin(a) * 1, rz: -Math.cos(a) * 1 });
  }
  for (let k = 0; k < 10; k++) { // the canopy: faceted clumps in four autumn colours
    const a = k * 2.4, r = k < 7 ? 13 : 4, y = k < 7 ? 40 + (k % 3) * 4 : 52 + (k - 7) * 2;
    add(g, Ico(k < 7 ? 10 + (k % 3) * 2 : 11, 0), leaves[k % 4], { x: Math.cos(a) * r, y, z: Math.sin(a) * r });
  }
  add(g, Cyl(0.9, 1.7, 22, 5), bark2, { y: 57, rz: 0.06 }); // the bare snag above the leaves
  add(g, Cyl(0.7, 0.7, 11, 5), bark2, { x: 0.65, y: 67.4, rz: PI / 2 }); // her perch
  g.userData.perchY = 68;
  g.userData.canopyY = 46;
  return g;
}

// Comet Charger (space lands): a cratered rock with a cyan thruster ring behind and one red eye in front. It winds up
// (thruster and eye brighten), then charges in a straight line.
export function makeCometCharger(hat) {
  const g = new THREE.Group(), rock = lam('#7a7480'), rock2 = lam('#5a5462');
  add(g, Ico(4.5, 0), rock, { s: [1, 0.85, 1.15] });
  for (const [x, y, z, r] of [[2.6, 2, 1.5, 1.1], [-2.8, 1.2, -1, 1.3], [0.8, -2.6, 0.5, 1], [-1.2, 2.6, -2.2, 0.9]]) add(g, Ico(r, 0), rock2, { x, y, z });
  const eye = add(g, Sph(1.3, 10, 8), basic('#ff3b30'), { y: 0.6, z: 4.6 });
  add(g, Sph(0.55, 6, 4), basic('#1d1d22'), { y: 0.6, z: 5.7 });
  add(g, Box(3, 0.6, 0.6), basic('#1d1d22'), { y: 2.2, z: 4.9, rz: 0.15 }); // one long scowl
  weak(g, eye, 1.4);
  const jet = add(g, Tor(2.4, 0.55, 6, 14), basic('#5ae8ff', { transparent: true, opacity: 0.85 }), { z: -4.6 });
  const flame = add(g, Cone(2, 5, 8), basic('#9af4ff', { transparent: true, opacity: 0.5 }), { z: -7, rx: -PI / 2 });
  for (const a of [0, 2.1, 4.2]) add(g, Box(0.5, 0.5, 2.4), lam('#3a3640'), { x: Math.cos(a) * 3, y: Math.sin(a) * 3, z: -3.6 }); // thruster struts
  g.userData.jet = jet;
  g.userData.flame = flame;
  g.userData.eye = eye;
  if (hat) partyHat(g, 4.6);
  return g;
}

// ---- More land enemies (TYPES `lands` in enemies.js). Each one wears one of three moves (TYPES `act`):
// swoop: a small flapping swarm critter (userData.wings optional); ambush: hides under the ground and pops up to fire
// (userData.body, ring, cracks, cool, hot); charge: winds up and rams (userData.jet, flame, eye).

// An ambusher's glowing bits warm from `cool` to `hot` before it fires (enemies.js magmaSpitter()).
function heat(g, cool, hot) {
  g.userData.cool = new THREE.Color(cool);
  g.userData.hot = new THREE.Color(hot);
}

// A pair of flapping wings, each a group (rotated about z by animate()) holding `parts(w, sd)`.
function flappers(g, parts) {
  g.userData.wings = [-1, 1].map((sd) => {
    const w = new THREE.Group();
    parts(w, sd);
    g.add(w);
    return w;
  });
}

// A pair of eyes (x = ±ex) with pupils, at height y, front z. The first eye is the weak point when `weakR` is set.
function eyes(g, ex, y, z, r, white = '#ffffff', pupil = '#111111', weakR = 0) {
  const out = [-ex, ex].map((x) => {
    const eye = add(g, Sph(r, 8, 6), basic(white), { x, y, z });
    add(g, Sph(r * 0.5, 6, 4), basic(pupil), { x, y, z: z + r * 0.7 });
    return eye;
  });
  if (weakR) for (const e of out) weak(g, e, weakR);
  return out;
}

// Flying Squirrel (Meadowlands, Autumn Woods, Giant's Garden, Ringworld): a fluffy glider with a big tail, in fours.
export function makeFlyingSquirrel(hat) {
  const g = new THREE.Group(), fur = lam('#9a5b2e'), belly = lam('#e8c49a'), skin = lam('#7a4422', { side: THREE.DoubleSide });
  add(g, Sph(1.4, 8, 6), fur, { s: [1, 0.8, 1.4] });
  add(g, Sph(1, 7, 5), belly, { y: -0.4, z: 0.3, s: [1, 0.6, 1.2] });
  add(g, Sph(1, 7, 5), fur, { y: 0.5, z: 1.7 }); // head
  for (const x of [-0.55, 0.55]) add(g, Cone(0.35, 0.8, 4), fur, { x, y: 1.4, z: 1.6 });
  eyes(g, 0.4, 0.8, 2.5, 0.3);
  add(g, Box(0.35, 0.3, 0.3), lam('#3a2216'), { y: 0.35, z: 2.7 }); // nose
  add(g, Cyl(0.7, 0.3, 3.2, 6), fur, { y: 1, z: -2.4, rx: -1.1 }); // the bushy tail
  add(g, Sph(0.9, 6, 5), belly, { y: 2.2, z: -3.3 });
  flappers(g, (w, sd) => {
    add(w, Box(2.8, 0.12, 2.4), skin, { x: sd * 2, y: -0.1 }); // the gliding flap
    add(w, Sph(0.3, 5, 4), fur, { x: sd * 3.4, z: 1.1 });
    add(w, Sph(0.3, 5, 4), fur, { x: sd * 3.4, z: -1.1 });
  });
  if (hat) partyHat(g, 2);
  return g;
}

// Crystal Bat (Crystal Caverns, Alien World): an amethyst bat with shard wings that glints as it flies.
export function makeCrystalBat(hat) {
  const g = new THREE.Group(), gem = lam('#7a4ad8', { emissive: '#2a0a5a' }), shard = lam('#c49aff', { emissive: '#4a1a8a', side: THREE.DoubleSide });
  add(g, Oct(1.6), gem, { s: [1, 0.8, 1.4] });
  add(g, Oct(1), gem, { y: 0.6, z: 1.6 });
  for (const x of [-0.5, 0.5]) add(g, Cone(0.35, 1.4, 4), shard, { x, y: 1.6, z: 1.5, rz: -x * 0.5 });
  eyes(g, 0.4, 0.8, 2.3, 0.28, '#e0fff8', '#0a0a1a');
  flappers(g, (w, sd) => {
    for (let k = 0; k < 3; k++) add(w, Cone(0.7, 2.6, 4), shard, { x: sd * (1.4 + k * 1.2), y: -0.2 * k, rz: -sd * (PI / 2), ry: 0.3 * k });
  });
  if (hat) partyHat(g, 2);
  return g;
}

// Hail Sprite (Frozen Peaks, Hollow Peaks, Stratosphere): a grumpy hailstone with frost wings.
export function makeHailSprite(hat) {
  const g = new THREE.Group(), ice = lam('#dff4ff', { emissive: '#3a6a8a' }), frost = lam('#9ad8ff', { transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  add(g, Ico(1.6, 0), ice);
  for (const [x, y, z] of [[1.2, 0.8, -0.4], [-1.1, -0.6, -0.3], [0.2, 1.3, -0.9]]) add(g, Cone(0.35, 1.2, 4), ice, { x, y, z, rx: y, rz: -x });
  eyes(g, 0.55, 0.35, 1.3, 0.3, '#ffffff', '#1a3a5a');
  add(g, Box(1.6, 0.25, 0.25), lam('#1a3a5a'), { y: 0.85, z: 1.4, rz: 0.15 }); // a frosty frown
  flappers(g, (w, sd) => add(w, new THREE.CircleGeometry(1.5, 5), frost, { x: sd * 2.2, rx: -PI / 2 }));
  if (hat) partyHat(g, 1.9);
  return g;
}

// Glitch Bug (Metropolis, Neon Grid, Blockland): a buzzing neon cube whose side cubes stutter.
export function makeGlitchBug(hat) {
  const g = new THREE.Group(), core = lam('#1a1030'), neon = basic('#ff3ad0'), cyan = basic('#3af4ff');
  add(g, Box(2.4, 2.4, 2.4), core);
  for (const [x, y] of [[1.25, 1.25], [-1.25, 1.25], [1.25, -1.25], [-1.25, -1.25]]) add(g, Box(0.2, 0.2, 2.6), neon, { x, y }); // edges
  const eye = add(g, Box(1.6, 0.6, 0.3), cyan, { y: 0.2, z: 1.3 }); // one wide visor
  weak(g, eye, 1.2);
  flappers(g, (w, sd) => {
    add(w, Box(1, 1, 1), cyan, { x: sd * 2.2 });
    add(w, Box(0.5, 0.5, 0.5), neon, { x: sd * 3.2, y: 0.5 });
  });
  if (hat) partyHat(g, 2.6);
  return g;
}

// Spore Popper (Mushroom Forest, Alien World): a big glowing toadstool that hides underground, then pops up and puffs
// spore balls. Its spots warm up before it puffs.
export function makeSporePopper(hat) {
  const g = new THREE.Group(), body = new THREE.Group();
  const stem = lam('#efe2c8'), cap = lam('#8a2ad8'), spot = basic('#5affb0');
  add(body, Cyl(2.2, 2.8, 5, 8), stem, { y: 2.5 });
  add(body, new THREE.SphereGeometry(5, 12, 7, 0, PI * 2, 0, PI / 2), cap, { y: 4.6, s: [1, 0.7, 1] });
  for (const [x, z] of [[2.5, 2.4], [-2.6, 2], [0.2, -3.2], [3.2, -1], [-2.8, -1.8], [0, 1]]) add(body, Sph(0.7, 6, 4), spot, { x, y: 6.4 + (Math.abs(x) < 1 ? 1.2 : 0), z });
  const mouth = add(body, Sph(1.2, 8, 6), basic('#3a0a2a'), { y: 2.6, z: 2.3, s: [1, 0.7, 0.5] });
  weak(g, mouth, 1.8);
  eyes(body, 0.9, 4, 2.4, 0.5);
  g.add(body);
  const ring = add(g, Tor(4.5, 0.5, 5, 12), basic('#5affb0', { transparent: true, opacity: 0.7 }), { y: 0.3, rx: PI / 2 });
  g.userData.body = body;
  g.userData.ring = ring;
  g.userData.cracks = spot;
  heat(g, '#5affb0', '#f4ffd0');
  if (hat) partyHat(body, 8.6);
  return g;
}

// Sand Noodle (Canyon Country, Dune Sea, Salt Mirror, Mars): a segmented worm that bursts out of the ground, opens a
// ring of teeth (its gullet glows) and spits rocks.
export function makeSandNoodle(hat) {
  const g = new THREE.Group(), body = new THREE.Group();
  const hide = lam('#c49a5a'), band = lam('#8a6a3a'), tooth = lam('#fff4dc'), gullet = basic('#ff8a2a');
  for (let k = 0; k < 4; k++) {
    add(body, Cyl(3.2 - k * 0.2, 3.4 - k * 0.2, 1.8, 10), hide, { y: k * 1.9 });
    add(body, Cyl(3.5 - k * 0.2, 3.5 - k * 0.2, 0.4, 10), band, { y: k * 1.9 + 0.9 });
  }
  add(body, Cyl(2.6, 3, 1, 10), hide, { y: 7.8 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    add(body, Cone(0.45, 1.4, 4), tooth, { x: Math.cos(a) * 2.1, y: 8.6, z: Math.sin(a) * 2.1, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 });
  }
  const mouth = add(body, Cyl(1.7, 1.7, 0.5, 10), gullet, { y: 8.6 });
  weak(g, mouth, 2.2);
  eyes(body, 1.6, 6.4, 2.7, 0.55, '#fff2c8', '#1a0a00');
  for (const x of [-1.6, 1.6]) add(body, Sph(0.35, 6, 4), gullet, { x, y: 5.6, z: 2.9 }); // glowing cheeks, warm with the gullet
  g.add(body);
  const ring = add(g, Tor(4.5, 0.6, 5, 12), basic('#e8c47a', { transparent: true, opacity: 0.7 }), { y: 0.3, rx: PI / 2 });
  g.userData.body = body;
  g.userData.ring = ring;
  g.userData.cracks = gullet;
  heat(g, '#ff8a2a', '#fff0a0');
  if (hat) partyHat(body, 10);
  return g;
}

// Gumdrop Popper (Candy Kingdom): a sugared gumdrop that hides in the candy ground, then pops up and lobs jelly beans.
export function makeGumdropPopper(hat) {
  const g = new THREE.Group(), body = new THREE.Group();
  const gum = lam('#ff4a8a', { emissive: '#5a0a2a' }), sugar = basic('#ffffff'), glow = basic('#ffd23a');
  add(body, new THREE.SphereGeometry(5, 12, 8, 0, PI * 2, 0, PI / 2), gum, { y: 0.5, s: [1, 1.3, 1] });
  add(body, Cyl(5, 5, 1, 12), gum, { y: 0 });
  for (const [x, y, z] of [[2, 4, 3], [-2.5, 3, 3.2], [3.5, 2, -2], [-1, 5.6, -1], [-3.4, 2.4, -2.5], [1, 6, 1.2]]) add(body, Box(0.5, 0.5, 0.5), sugar, { x, y, z, ry: x, rx: y });
  const mouth = add(body, Sph(1.3, 8, 6), glow, { y: 2.4, z: 4.3, s: [1, 0.6, 0.5] });
  weak(g, mouth, 1.8);
  eyes(body, 1.5, 4.4, 3.6, 0.6);
  g.add(body);
  const ring = add(g, Tor(4.5, 0.5, 5, 12), basic('#ff8ad0', { transparent: true, opacity: 0.7 }), { y: 0.3, rx: PI / 2 });
  g.userData.body = body;
  g.userData.ring = ring;
  g.userData.cracks = glow;
  heat(g, '#ffd23a', '#ffffff');
  if (hat) partyHat(body, 7.6);
  return g;
}

// Icicle Lancer (Frozen Peaks, Hollow Peaks): a long icicle with one blue eye and a frosty jet ring. It winds up,
// then lances at you.
export function makeIcicleLancer(hat) {
  const g = new THREE.Group(), ice = lam('#cfefff', { emissive: '#2a4a6a' }), ice2 = lam('#9ad0f0');
  add(g, Cone(2.4, 11, 6), ice, { z: 2.5, rx: PI / 2 });
  for (const a of [0, 2.1, 4.2]) add(g, Cone(0.8, 4, 4), ice2, { x: Math.cos(a) * 2, y: Math.sin(a) * 2, z: -1.6, rx: -PI / 2 });
  const eye = add(g, Sph(1, 10, 8), basic('#3ab8ff'), { y: 1.3, z: 1.2 });
  add(g, Sph(0.45, 6, 4), basic('#0a1a2a'), { y: 1.3, z: 2.1 });
  weak(g, eye, 1.1);
  const jet = add(g, Tor(2, 0.45, 6, 14), basic('#e0fbff', { transparent: true, opacity: 0.85 }), { z: -3 });
  const flame = add(g, Cone(1.7, 4.5, 8), basic('#bff4ff', { transparent: true, opacity: 0.5 }), { z: -5.4, rx: -PI / 2 });
  g.userData.jet = jet;
  g.userData.flame = flame;
  g.userData.eye = eye;
  if (hat) partyHat(g, 2.6);
  return g;
}

// Swordfish (Tropical Archipelago, Sunken Reef): a sleek fish with a long sword. Its gills glow before it lunges.
export function makeSwordfish(hat) {
  const g = new THREE.Group(), skin = lam('#2a5a9a'), belly = lam('#cfe0f0'), fin = lam('#1a3a6a', { side: THREE.DoubleSide });
  add(g, Sph(2.4, 10, 7), skin, { s: [0.8, 0.9, 2.2] });
  add(g, Sph(2, 8, 6), belly, { y: -0.7, z: 0.6, s: [0.7, 0.5, 1.8] });
  add(g, Cone(0.35, 7, 5), lam('#d8d0b8'), { z: 8, rx: PI / 2 }); // the sword
  add(g, Cone(1.4, 3, 3), fin, { y: 2.6, z: -0.5, rx: -0.3 }); // dorsal fin
  add(g, Cone(1.6, 2.6, 3), fin, { y: 1.4, z: -6.2, rx: -2.2 }); // tail, upper lobe
  add(g, Cone(1.6, 2.6, 3), fin, { y: -1.4, z: -6.2, rx: 2.2 }); // lower lobe
  const eye = add(g, Sph(0.7, 8, 6), basic('#ffe14a'), { x: 1.4, y: 0.6, z: 3 });
  add(g, Sph(0.7, 8, 6), basic('#ffe14a'), { x: -1.4, y: 0.6, z: 3 });
  weak(g, eye, 0.9);
  const jet = add(g, Tor(1.8, 0.4, 6, 14), basic('#7af0ff', { transparent: true, opacity: 0.85 }), { z: 1.6 }); // glowing gills
  const flame = add(g, Cone(1.5, 4, 8), basic('#bff8ff', { transparent: true, opacity: 0.45 }), { z: -8, rx: -PI / 2 }); // its wake
  g.userData.jet = jet;
  g.userData.flame = flame;
  g.userData.eye = eye;
  if (hat) partyHat(g, 2.4);
  return g;
}

// Dragonling (Princess Kingdom, Cloud Kingdom, Sky Islands): a small pink dragon. The fire in its mouth swells, then it
// rockets at you on its own tail flame. Flaps all the while.
export function makeDragonling(hat) {
  const g = new THREE.Group(), scale = lam('#e85aa0'), belly = lam('#ffd0e0'), wingMat = lam('#b83a7a', { side: THREE.DoubleSide });
  add(g, Sph(2.2, 10, 7), scale, { s: [1, 0.9, 1.5] });
  add(g, Sph(1.6, 8, 6), belly, { y: -0.7, z: 0.8, s: [0.9, 0.6, 1.2] });
  add(g, Sph(1.5, 8, 6), scale, { y: 1.4, z: 3 }); // head
  add(g, Box(1.4, 0.9, 1.6), scale, { y: 1, z: 4.4 }); // snout
  for (const x of [-0.6, 0.6]) add(g, Cone(0.3, 1.4, 4), lam('#fff4dc'), { x, y: 2.8, z: 2.6, rx: -0.5 }); // horns
  const eye = add(g, Sph(0.5, 8, 6), basic('#ffe14a'), { x: 0.75, y: 1.9, z: 4.1 });
  add(g, Sph(0.5, 8, 6), basic('#ffe14a'), { x: -0.75, y: 1.9, z: 4.1 });
  weak(g, eye, 0.8);
  const mouth = add(g, Sph(0.7, 8, 6), basic('#ffb03a'), { y: 0.8, z: 5.2, s: [1, 0.6, 0.6] }); // the fire inside, swells as it winds up
  add(g, Cone(0.9, 4, 6), scale, { z: -4, rx: -PI / 2 }); // tail
  flappers(g, (w, sd) => {
    add(w, new THREE.CircleGeometry(2.6, 3), wingMat, { x: sd * 3, y: 0.8, rx: -PI / 2, rz: sd > 0 ? 0 : PI });
    add(w, Box(4.4, 0.25, 0.25), scale, { x: sd * 2.4, y: 0.9, z: 0.8 });
  });
  const jet = add(g, Tor(1.2, 0.4, 6, 12), basic('#ffb03a', { transparent: true, opacity: 0.85 }), { z: -6.2 });
  const flame = add(g, Cone(1.2, 3.6, 8), basic('#ffd23a', { transparent: true, opacity: 0.55 }), { z: -7.8, rx: -PI / 2 });
  g.userData.jet = jet;
  g.userData.flame = flame;
  g.userData.eye = mouth;
  if (hat) partyHat(g, 3.4);
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

// HMS Overkill, the aircraft carrier boss: a long two-tone hull (bow toward +Z) with a painted flight deck and an
// angled landing deck, an island tower on the starboard side (its bridge windows are the weak spot) with a funnel,
// mast, radars and blinking lights, parked jets, a foaming wake, and six deck guns that swivel to aim and can be shot
// off. The static detail is merged into two meshes (lit paint, glowing lights), so the extra detail costs no draw calls.
// CARRIER_HULL lists its solid boxes in model units [x0, x1, y0, y1, z0, z1]: bullets hit them and planes bump off them.
// GUN_HP: bullets it takes to shoot a deck gun off (bosses' other parts get ×6; these don't).
export const GUN_HP = 6;
export const CARRIER_HULL = [[-7, 7, -2, 5.6, -33, 30], [-4, 4, -2, 5.6, 30, 36], [-10.8, -7, 3.6, 5.6, -10, 16], [3, 7.4, 5.6, 15, -3, 9]];
// The flight deck you can land on (the secret, player.js): its top (model y), the deck plates as [centre x, centre z,
// half width, half length, turn] (the main deck and the angled deck), the island standing on it [x0, x1, z0, z1], and
// the angled deck's four arrester wires (z along it). Above the deck only `solid` (the island's hull box) bumps planes.
export const CARRIER_DECK = {
  y: 4.9, plates: [[0, 0, 7, 33, 0], [-3.5, -6, 4, 20, -0.16]], island: [3, 7.4, -3, 9], wires: [-13, -11.4, -9.8, -8.2], solid: [CARRIER_HULL[3]],
};
// What's at deck point (x, z), model units: 'island', 'deck', or null (off the edge). With the angled deck's
// arrester wire you touched down on (1-4), if any: { at, wire }.
export function deckSpot(x, z) {
  const D = CARRIER_DECK, [ix0, ix1, iz0, iz1] = D.island;
  if (x > ix0 && x < ix1 && z > iz0 && z < iz1) return { at: 'island', wire: 0 };
  let at = null, wire = 0;
  for (const [cx, cz, hw, hl, ry] of D.plates) {
    const dx = x - cx, dz = z - cz, c = Math.cos(ry), s = Math.sin(ry);
    const u = dx * c - dz * s, v = dx * s + dz * c; // into the plate's own frame
    if (Math.abs(u) > hw || Math.abs(v) > hl) continue;
    at = 'deck';
    if (ry && v < D.wires[3] + 0.8 && v > D.wires[0] - 0.8) wire = 1 + D.wires.reduce((k, w, i) => (Math.abs(v - w) < Math.abs(v - D.wires[k]) ? i : k), 0);
  }
  return at && { at, wire };
}
const CV = {
  hull: '#7c8794', hull2: '#929eab', gallery: '#5d6773', seam: '#6d7884', boot: '#1d1f24', red: '#b8402a',
  deck: '#33383f', deck2: '#3d434c', white: '#eef2f5', yellow: '#ffcf2e', line: '#7a808a', dark: '#262a31',
  island: '#86919d', island2: '#9aa5b0', glass: '#2b3d52', jet: '#8d9aa8', jet2: '#5f6b78', accent: '#d8433a',
  orange: '#ff8a1f', dome: '#e6eaee',
};
// 7-segment digits: seg(u, v, du, dv) makes one bar (u across, v up, the bar's size along each).
const SEG7 = { 0: 'abcdef', 7: 'abc' };
function digits7(str, w, h, t, seg) {
  const out = [];
  [...str].forEach((ch, i) => {
    const u0 = i * (w + t * 2.2);
    for (const s of SEG7[ch]) {
      if (s === 'a') out.push(seg(u0 + w / 2, h, w, t));
      if (s === 'd') out.push(seg(u0 + w / 2, 0, w, t));
      if (s === 'g') out.push(seg(u0 + w / 2, h / 2, w, t));
      if (s === 'f') out.push(seg(u0, h * 0.75, t, h / 2 + t / 2));
      if (s === 'e') out.push(seg(u0, h * 0.25, t, h / 2 + t / 2));
      if (s === 'b') out.push(seg(u0 + w, h * 0.75, t, h / 2 + t / 2));
      if (s === 'c') out.push(seg(u0 + w, h * 0.25, t, h / 2 + t / 2));
    }
  });
  return out;
}
// A group of parts built in its own frame, then turned by ry and moved to (x, y, z).
function placed(parts, x, y, z, ry = 0) {
  const g = mergeGeometries(parts);
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1)));
  return g;
}
// A parked jet, nose toward +Z: fuselage, nose, wings, twin tails, canopy (a hint of the air wing to come).
function carrierJet(accent) {
  return [
    P(Box(0.9, 0.6, 3.8), CV.jet, { y: 0.55 }),
    P(Cone(0.45, 1.3, 4), CV.jet, { y: 0.55, z: 2.55, rx: PI / 2, ry: PI / 4 }),
    P(Box(3.6, 0.12, 1.5), CV.jet2, { y: 0.45, z: -0.2 }),
    P(Box(1.8, 0.1, 0.7), CV.jet2, { y: 0.5, z: -1.7 }),
    P(Box(0.1, 0.9, 0.8), accent, { x: -0.35, y: 1.15, z: -1.5, rz: 0.25 }),
    P(Box(0.1, 0.9, 0.8), accent, { x: 0.35, y: 1.15, z: -1.5, rz: -0.25 }),
    P(Box(0.5, 0.3, 1.1), CV.glass, { y: 0.95, z: 0.9 }),
    P(Box(0.15, 0.45, 0.15), CV.dark, { y: 0.15, z: 1.4 }),
  ];
}
// A Deck Fighter, launched off HMS Overkill's catapults: the parked jets' twin, 2.2× bigger, with a hot exhaust.
export function makeDeckFighter() {
  const g = new THREE.Group(), body = new THREE.Mesh(M(carrierJet(CV.accent)), lam('#ffffff', { vertexColors: true }));
  body.scale.setScalar(2.2);
  g.add(body);
  add(g, Box(1.1, 0.8, 0.5), basic('#ffb03a'), { y: 1.2, z: -4.3 });
  return g;
}
export function makeCarrier() {
  const g = new THREE.Group(), S = [], L = []; // S: painted (lit) parts; L: lights (unlit, they glow)
  // Hull: two-tone grey, a gallery band with a dark window strip, plating seams, portholes, a black boot top at the
  // waterline over red antifouling, a diamond bow and a recessed stern.
  S.push(P(Box(12, 6, 62), CV.hull, { y: 1.5, z: -2 }));
  S.push(P(Cyl(0.2, 6, 8, 4), CV.hull, { y: 1.5, z: 32.6, rx: PI / 2, s: 1, sz: 0.55 }));
  S.push(P(Box(12.5, 1.6, 61), CV.hull2, { y: 3.5, z: -2 }));
  S.push(P(Box(12.6, 0.35, 58), CV.gallery, { y: 3.4, z: -3 }));
  S.push(P(Box(12.15, 0.55, 62.15), CV.boot, { y: 0.1, z: -2 }));
  S.push(P(Box(12.1, 1.4, 62.1), CV.red, { y: -1.1, z: -2 }));
  for (let z = -29; z <= 26; z += 8) S.push(P(Box(12.08, 2.4, 0.14), CV.seam, { y: 1.5, z }));
  for (let z = -28; z <= 16; z += 3.4) S.push(P(Box(12.12, 0.32, 0.45), CV.dark, { y: 2.35, z }));
  S.push(P(Box(10, 2.6, 0.4), CV.dark, { y: 2.6, z: -32.9 }));
  for (const s of [-1, 1]) S.push(P(Box(0.4, 0.7, 0.9), CV.dark, { x: s * 3.6, y: 3, z: 31.6 })); // hawse pipes
  // The hull number 07 on both bows, readable from either side (starboard reads toward the stern, port toward the bow).
  for (const s of [-1, 1]) {
    S.push(...digits7('07', 1.2, 1.9, 0.28, (u, v, du, dv) => P(Box(0.08, dv, du), CV.white, { x: s * 6.08, y: 0.6 + v, z: s > 0 ? 25 - u : 20 + u })));
  }
  // Life-raft canisters and boats on the gallery: an orange accent.
  for (const [x, z] of [[6.3, -20], [6.3, -15], [-6.3, -22], [-6.3, -2], [-6.3, 12]]) S.push(P(Cyl(0.35, 0.35, 1.2, 6), CV.orange, { x, y: 3.9, z, rx: PI / 2 }));
  // Sponsons under the guns.
  const GUNS = [[-6.4, -24], [6.4, -24], [-6.4, -9], [-6.4, 8], [6.4, 18], [-6.4, 24]];
  for (const [x, z] of GUNS) S.push(P(Box(2.2, 1.4, 3.4), CV.gallery, { x: x + Math.sign(x) * 0.9, y: 3.9, z }));
  // Flight deck: dark non-skid, white edge lines, a dashed yellow centre line, two bow catapults with blast deflectors,
  // elevators outlined in yellow, and a big 07 on the bow.
  const y = 4.93; // the painted lines sit on the deck
  S.push(P(Box(14, 0.6, 66), CV.deck, { y: 4.6 }));
  for (const s of [-1, 1]) S.push(P(Box(0.25, 0.05, 64), CV.white, { x: s * 6.75, y }));
  for (let z = -30; z <= 22; z += 4) S.push(P(Box(0.3, 0.05, 2.2), CV.yellow, { x: 1.5, y, z }));
  for (const x of [-2.5, 3]) {
    S.push(P(Box(0.22, 0.06, 20), CV.line, { x, y, z: 22 }));
    S.push(P(Box(0.9, 0.12, 0.6), CV.yellow, { x, y: 5, z: 31.5 }));
    S.push(P(Box(3.4, 0.8, 0.18), CV.seam, { x, y: 5.15, z: 11.6, rx: -0.6 }));
  }
  for (const [ex, ez] of [[4.4, -9], [4.4, 13.5]]) {
    S.push(P(Box(4.4, 0.06, 0.2), CV.yellow, { x: ex, y, z: ez - 2.6 }), P(Box(4.4, 0.06, 0.2), CV.yellow, { x: ex, y, z: ez + 2.6 }));
    S.push(P(Box(0.2, 0.06, 5.4), CV.yellow, { x: ex - 2.2, y, z: ez }));
  }
  S.push(...digits7('07', 1.6, 2.8, 0.4, (u, v, du, dv) => P(Box(du, 0.06, dv), CV.white, { x: 2.2 - u, y, z: 28.4 + v })));
  // The angled landing deck, swung out to port: lighter deck, edge lines, a dashed white centre line, four arrester
  // wires and a red and white stripe at its far end.
  const A = [P(Box(8, 0.62, 40), CV.deck2, { y: 4.61 })];
  for (const s of [-1, 1]) A.push(P(Box(0.2, 0.06, 38), CV.white, { x: s * 3.8, y }));
  for (let z = -18; z <= 18; z += 3) A.push(P(Box(0.25, 0.06, 1.5), CV.white, { y, z }));
  for (let k = 0; k < 4; k++) A.push(P(Box(6.4, 0.08, 0.12), CV.line, { y, z: -13 + k * 1.6 }));
  for (let k = 0; k < 6; k++) A.push(P(Box(1.3, 0.06, 0.6), k % 2 ? CV.white : CV.accent, { x: -3.25 + k * 1.3, y, z: 19.4 }));
  S.push(placed(A, -3.5, 0, -6, -0.16));
  // Parked jets, wingtip to wingtip on the starboard aft deck, and one on the port catapult.
  for (const [x, z, a] of [[2.8, -14.5, -0.7], [2.8, -19.5, -0.7], [2.8, -24.5, -0.7], [-2.5, 22.5, 0]]) S.push(placed(carrierJet(CV.accent), x, 4.9, z, a));
  // Close-in defence domes on the deck corners.
  for (const [x, z] of [[-6, -31.5], [5.6, 31.2]]) S.push(P(Cyl(0.7, 0.9, 0.9, 8), CV.dark, { x, y: 5.35, z }), P(Sph(0.75, 8, 5), CV.dome, { x, y: 6.1, z }));
  // The island: a stepped tower with its number, a bridge band (the weak spot, below), sensor panels, pri-fly on top,
  // a funnel and a tripod mast with yards and whip antennas.
  S.push(P(Box(4.2, 4.6, 11), CV.island, { x: 5.2, y: 7.6, z: 3 }));
  S.push(P(Box(3.8, 3.4, 8), CV.island2, { x: 5.3, y: 11.6, z: 4 }));
  S.push(P(Box(3.4, 1.4, 5), CV.island, { x: 5.2, y: 14, z: 3.6 }));
  S.push(P(Box(3.6, 0.5, 5.6), CV.glass, { x: 5.2, y: 14.1, z: 3.6 }));
  for (const [z, ry] of [[0.4, 0], [7.6, 0]]) S.push(P(Box(0.2, 1.7, 1.7), CV.dark, { x: 7.3, y: 11.2, z, ry }));
  S.push(...digits7('07', 0.9, 1.8, 0.24, (u, v, du, dv) => P(Box(0.06, dv, du), CV.white, { x: 7.33, y: 6.6 + v, z: 5.5 - u })));
  for (let k = 0; k < 4; k++) S.push(P(Box(4.3, 0.06, 0.25), CV.yellow, { x: 5.2, y, z: -4.4 + k * 0.55, ry: 0.5 })); // hazard stripes at the island's foot
  S.push(P(Box(2.4, 2.4, 3), CV.island2, { x: 5.4, y: 16, z: -0.6 }), P(Box(2.6, 0.5, 3.2), CV.boot, { x: 5.4, y: 17.4, z: -0.6 }));
  for (const [dx, dz] of [[-0.8, 0], [0.8, 0], [0, 1.2]]) S.push(P(Cyl(0.12, 0.18, 6.5, 4), CV.dark, { x: 5.2 + dx, y: 17.9, z: 3.6 + dz, rz: -dx * 0.08, rx: -dz * 0.1 }));
  S.push(P(Box(4.6, 0.18, 0.18), CV.dark, { x: 5.2, y: 19.4, z: 3.6 }), P(Box(3.2, 0.18, 0.18), CV.dark, { x: 5.2, y: 20.6, z: 3.6 }));
  for (const [x, h] of [[3.4, 3], [7, 2.4], [5.2, 4]]) S.push(P(Cyl(0.05, 0.08, h, 3), CV.dark, { x, y: (x === 5.2 ? 21.2 : 19.5) + h / 2, z: 3.6 }));
  const paint = new THREE.Mesh(M(S), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  g.add(paint);
  // The bridge windows: the weak spot. Glass glowing pale blue, framed by dark mullions.
  const bridge = add(g, Box(4.3, 1.3, 6), basic('#9ae8ff'), { x: 5.2, y: 12.4, z: 5.2 });
  for (let z = 2.7; z <= 7.7; z += 1) add(bridge, Box(4.4, 1.35, 0.12), lam(CV.dark), { z: z - 5.2 });
  weak(g, bridge, 3, 2);
  // Radars: a big rotating array up the mast and a small dish on the aft yard.
  const radar = new THREE.Group(), dish = new THREE.Group();
  radar.position.set(5.2, 22, 3.6);
  add(radar, Box(4.4, 1.3, 0.3), lam('#d8dde3'));
  add(radar, Box(0.3, 0.8, 0.8), lam(CV.dark), { y: -0.8 });
  dish.position.set(5.2, 20.9, 1.9);
  add(dish, Cone(0.9, 0.5, 8), lam('#d8dde3'), { rx: -PI / 2 + 0.4 });
  g.add(radar, dish);
  // Lights: deck-edge lights (always on) and blinking mast and wingtip strobes.
  for (let z = -30; z <= 30; z += 5) for (const s of [-1, 1]) L.push(P(Box(0.3, 0.15, 0.3), s < 0 ? '#ff5a4a' : '#5aff8a', { x: s * 7.05, y: 4.95, z }));
  for (let k = 0; k < 6; k++) { // along the angled deck's outer (port) edge
    const a = -0.16, along = -18 + k * 7.2, out = -4.1;
    L.push(P(Box(0.25, 0.15, 0.25), '#fff3b0', { x: -3.5 + along * Math.sin(a) + out * Math.cos(a), y: 4.97, z: -6 + along * Math.cos(a) - out * Math.sin(a) }));
  }
  g.add(new THREE.Mesh(M(L), new THREE.MeshBasicMaterial({ vertexColors: true })));
  const lights = [
    add(g, Sph(0.35, 6, 4), basic('#ff3a2a'), { x: 5.2, y: 25.4, z: 3.6 }),
    add(g, Sph(0.3, 6, 4), basic('#ffffff'), { x: 5.2, y: 17.8, z: -0.6 }),
    add(g, Sph(0.3, 6, 4), basic('#ff3a2a'), { x: -6.8, y: 5.4, z: -32.5 }),
  ];
  add(g, Cyl(0.06, 0.06, 1.6, 3), lam(CV.dark), { x: 5.2, y: 24.6, z: 3.6 });
  // The ensign: a little flag that streams back off the mast.
  const flag = new THREE.Group();
  flag.position.set(5.2, 23.6, 3.5);
  add(flag, Box(0.05, 1, 1.6), lam(CV.accent), { z: -0.8 });
  add(flag, Box(0.06, 0.3, 1.6), basic(CV.white), { z: -0.8 });
  g.add(flag);
  // Funnel smoke: four puffs that rise, swell and fade in turn (see Enemies.animate).
  const smoke = [];
  for (let k = 0; k < 4; k++) smoke.push(add(g, Dod(1), new THREE.MeshLambertMaterial({ color: '#8a8f96', transparent: true, opacity: 0.5, depthWrite: false, flatShading: true }), { x: 5.4, y: 18, z: -0.6 }));
  // The wake: foam fanning out behind the stern and curling off the bow, at the waterline.
  const foam = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
  add(g, Box(11, 0.05, 14), foam, { y: 0.35, z: -40 });
  add(g, Box(7, 0.05, 22), foam, { y: 0.32, z: -57, s: [1, 1, 1] });
  for (const s of [-1, 1]) add(g, Box(1.4, 0.05, 14), foam, { x: s * 6.6, y: 0.35, z: 24, ry: s * 0.22 });
  // Deck guns on sponsons along both edges, clear of the island: a hazard-striped ring, an armoured turret and twin
  // barrels with red muzzles that swivel to aim at you.
  const guns = [];
  for (const [x, z] of GUNS) {
    const gun = new THREE.Group();
    gun.position.set(x, 5.6, z);
    add(gun, Cyl(1.5, 1.8, 0.9, 8), lam(CV.dark));
    add(gun, Cyl(1.62, 1.62, 0.25, 8), lam(CV.yellow), { y: 0.2 });
    const aim = new THREE.Group();
    aim.position.y = 0.9;
    add(aim, Box(2.1, 1.1, 2.1), lam(CV.hull2));
    add(aim, Box(2.1, 0.6, 0.9), lam(CV.hull), { y: 0.2, z: 1.2, rx: 0.5 });
    add(aim, Box(1.4, 0.3, 1.4), lam(CV.gallery), { y: 0.65, z: -0.2 });
    for (const s of [-0.45, 0.45]) {
      add(aim, Cyl(0.2, 0.26, 3.6, 6), lam('#2a2a30'), { x: s, z: 2.6, rx: PI / 2 });
      add(aim, Cyl(0.28, 0.28, 0.45, 6), lam(CV.accent), { x: s, z: 4.4, rx: PI / 2 });
    }
    gun.add(aim);
    g.add(gun);
    // The wreck left when it's shot off (hidden till then): a scorched ring and a stub of bent barrel, smoking.
    const wreck = new THREE.Group();
    wreck.position.copy(gun.position);
    add(wreck, Cyl(1.5, 1.8, 0.7, 8), lam('#1d1f24'));
    add(wreck, Box(1.6, 0.6, 1.4), lam('#3a2f2a'), { y: 0.5, rz: 0.3 });
    add(wreck, Cyl(0.2, 0.24, 1.8, 5), lam('#2a2a30'), { x: 0.4, y: 0.9, z: 0.6, rx: 1.1, rz: -0.4 });
    wreck.visible = false;
    g.add(wreck);
    breakable(g, gun, 2.4, 'gun', GUN_HP, { keepHp: true, wreck }); // a few shots, not the boss ×6
    guns.push({ gun, aim, wreck });
  }
  Object.assign(g.userData, { guns, radars: [radar, dish], lights, flag, smoke, foam });
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

// Hoop styles, so each hoop objective reads at a glance (B3). The classic gold hoop keeps its studs; the others swap
// them for a look that says what the hoop does. Everything sits on or outside the rim, never in the opening, and is
// visual only (crossRing does the hit test). spinRing calls u.dress(dt, t) every frame.
//   tiny:   a scope reticle, four ticks pointing in and a faint bezel that breathes
//   timed:  a clock, twelve ticks and an outer arc that drains clockwise as time runs out (u.timeFrac, 0..1)
//   moving: a pair of feathered wings that flap
//   shrink: eight chevrons that keep sliding inward
// Ring chains (they keep gold = next, blue = later; the extras are neutral so they suit both colours):
//   slalom: a fluttering pennant   trial: two crossed chequered flags   spiral: swirl arcs chasing round the rim
//   stairs / dive: soft chevrons above / below that drift the way to fly
// phase0 offsets the animation so the rings of one chain don't move in lockstep.
export function dressRing(ring, style, phase0 = 0) {
  const u = ring.userData, R = u.R, color = u.mat.color;
  const rim = R + Math.max(1, R * 0.09); // outer edge of the tube
  const soft = (opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const dress = new THREE.Group();
  ring.add(dress);
  if (style === 'tiny') {
    u.studs.visible = false;
    const ticks = new THREE.Group(), tickMat = basic('#ffffff');
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * PI * 2;
      add(ticks, Box(R * 0.32, 0.35, 0.35), tickMat, { x: Math.cos(a) * (rim + R * 0.3), y: Math.sin(a) * (rim + R * 0.3), rz: a });
    }
    const bezelMat = soft(0.18);
    add(dress, Tor(R * 1.75, 0.22, 4, 40), bezelMat);
    dress.add(ticks);
    u.dress = (dt, t) => { ticks.rotation.z -= dt * 0.25; bezelMat.opacity = 0.12 + Math.sin(t * 2) * 0.06; };
  } else if (style === 'timed') {
    u.studs.visible = false;
    const tickMat = basic('#ffffff');
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * PI * 2, long = k % 3 === 0;
      add(dress, Box(0.5, long ? 3 : 1.8, 0.5), tickMat, { x: Math.cos(a) * (rim + 2), y: Math.sin(a) * (rim + 2), rz: a - PI / 2 });
    }
    const N = 24, step = (PI * 2) / N, arcMat = soft(0.5), segs = [];
    for (let i = 0; i < N; i++) {
      // Segment i starts at 12 o'clock and runs clockwise; the sweep hides them from the top as time passes.
      segs.push(add(dress, Tor(rim + 5, 0.45, 4, 3, step * 0.8), arcMat, { rz: PI / 2 - (i + 0.9) * step }));
    }
    u.timeFrac = 1;
    u.dress = (dt, t) => {
      const gone = Math.round((1 - THREE.MathUtils.clamp(u.timeFrac, 0, 1)) * N);
      for (let i = 0; i < N; i++) segs[i].visible = i >= gone;
      arcMat.opacity = u.timeFrac < 0.3 ? 0.45 + Math.sin(t * 9) * 0.15 : 0.5;
    };
  } else if (style === 'moving') {
    const featherMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 0.25, flatShading: true });
    const wings = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * rim, R * 0.15, 0);
      [R * 0.55, R * 0.44, R * 0.32].forEach((len, k) => {
        add(pivot, Box(len, R * 0.1, 0.4), featherMat, { x: side * len / 2, y: -k * R * 0.1, rz: side * -0.12 * k });
      });
      dress.add(pivot);
      return pivot;
    });
    u.dress = (dt, t) => { wings.forEach((w, k) => { w.rotation.z = (k ? 1 : -1) * Math.sin(t * 3.2) * 0.35; }); };
  } else if (style === 'shrink') {
    u.studs.visible = false;
    const chevMat = soft(0.6), chevs = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * PI * 2;
      const c = add(dress, Cone(R * 0.08, R * 0.2, 4), chevMat, { rz: a + PI / 2 });
      c.userData.a = a;
      chevs.push(c);
    }
    u.dress = (dt, t) => {
      const phase = (t * 0.9) % 1; // each sweep: slide in from outside, fade out near the rim
      for (const c of chevs) {
        const r = rim + R * (0.45 - 0.3 * phase);
        c.position.set(Math.cos(c.userData.a) * r, Math.sin(c.userData.a) * r, 0);
      }
      chevMat.opacity = 0.6 * Math.sin(phase * PI);
    };
  } else if (style === 'slalom') {
    // A slalom gate: a pennant on a short pole above the rim, fluttering.
    const pole = new THREE.Group();
    pole.position.y = rim;
    add(pole, Cyl(0.25, 0.25, R * 0.45), basic('#ffffff'), { y: R * 0.22 });
    const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -R * 0.2, 0), new THREE.Vector3(R * 0.38, -R * 0.1, 0)]);
    flagGeo.computeVertexNormals();
    const flag = add(pole, flagGeo, lam('#ff5a4a', { side: THREE.DoubleSide, emissive: '#801808' }), { x: 0.2, y: R * 0.44 });
    dress.add(pole);
    u.dress = (dt, t) => { flag.rotation.y = Math.sin(t * 5 + phase0) * 0.45; };
  } else if (style === 'trial') {
    // A race: two small chequered flags crossed above the rim.
    const flags = [-1, 1].map((side) => {
      const f = new THREE.Group();
      f.position.set(side * R * 0.12, rim, 0);
      f.rotation.z = side * -0.4;
      add(f, Cyl(0.22, 0.22, R * 0.5), basic('#ffffff'), { y: R * 0.25 });
      const sq = R * 0.09, black = basic('#202020'), white = basic('#f4f4f4');
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        add(f, Box(sq, sq, 0.2), (i + j) % 2 ? black : white, { x: side * (0.3 + sq * (i + 0.5)), y: R * 0.5 - sq * (j + 0.5) });
      }
      dress.add(f);
      return f;
    });
    u.dress = (dt, t) => { flags.forEach((f, k) => { f.rotation.y = Math.sin(t * 4 + k + phase0) * 0.25; }); };
  } else if (style === 'spiral') {
    // A corkscrew: three soft swirl arcs that chase each other round the rim.
    u.studs.visible = false;
    const swirl = new THREE.Group(), swirlMat = soft(0.45);
    for (let k = 0; k < 3; k++) add(swirl, Tor(rim + 2.5, 0.4, 4, 10, PI * 0.38), swirlMat, { rz: (k / 3) * PI * 2 });
    dress.add(swirl);
    u.dress = (dt, t) => { swirl.rotation.z -= dt * 1.6; swirlMat.opacity = 0.35 + Math.sin(t * 2 + phase0) * 0.1; };
  } else if (style === 'stairs' || style === 'dive') {
    // A climb or a dive: three soft chevrons above (or below) the rim that keep drifting the way to fly.
    u.studs.visible = false;
    const up = style === 'stairs' ? 1 : -1, arrowMat = soft(0.55), arrows = [];
    for (let k = 0; k < 3; k++) {
      const c = add(dress, Cone(R * 0.16, R * 0.16, 4), arrowMat, { rz: up > 0 ? 0 : PI });
      c.scale.set(1, 1, 0.25);
      arrows.push(c);
    }
    u.dress = (dt, t) => {
      const phase = (t * 0.7 + phase0) % 1;
      arrows.forEach((c, k) => { c.position.y = up * (rim + R * (0.2 + 0.22 * (k + phase))); });
      arrowMat.opacity = 0.55 * Math.sin(phase * PI);
    };
  }
  return ring;
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

// glow: the Balloon Popper's party balloon (fly into it). A quarter bigger, a halo about its touch radius,
// a white shine and a string in its own colour. The size lives in an inner group: grow sets the outer scale.
export function makeBalloon(color, { glow = false } = {}) {
  const g = new THREE.Group(), b = glow ? new THREE.Group() : g;
  add(b, Sph(4.5, 12, 10), new THREE.MeshPhongMaterial({ color, shininess: 80, specular: '#ffffff' }), { s: [1, 1.2, 1] });
  add(b, Cone(0.8, 1.2, 6), lam(color), { y: -5.6, rx: PI });
  add(b, Box(0.15, 10, 0.15), basic(glow ? new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5) : '#ffffff'), { y: -11 });
  if (glow) {
    add(b, Sph(0.9, 6, 4), basic('#ffffff'), { x: -1.8, y: 2.8, z: 3.6, s: [1, 1.3, 0.6] });
    b.scale.setScalar(1.25);
    g.add(b);
    g.userData.halo = add(g, Sph(9.5, 10, 8), basic(color, { transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  }
  return g;
}

// The Shooting Gallery's target (shoot it): a carnival bullseye on a wooden handle, face toward +Z.
// Everything hangs off userData.body, so the gallery can wobble and knock it back while the group faces the player.
// The face is centred at y=+1, where the gallery tests its bullets.
export function makeGalleryTarget() {
  const g = new THREE.Group(), b = new THREE.Group();
  b.position.y = 1;
  const wood = lam('#7a4a22');
  [['#ff3a4a', 5.5], ['#ffffff', 4], ['#ff3a4a', 2.6], ['#ffd23a', 1.1]].forEach(([c, r], k) =>
    add(b, Cyl(r, r, 0.3, 16), lam(c, { emissive: c, emissiveIntensity: 0.25 }), { z: k * 0.2, rx: PI / 2 }));
  add(b, Tor(5.6, 0.45, 6, 16), wood);
  add(b, Cyl(5.6, 5.6, 0.6, 16), wood, { z: -0.4, rx: PI / 2 });
  add(b, Box(0.9, 8, 0.9), lam('#8a5a2a'), { y: -9 });
  add(b, Sph(0.8, 6, 4), lam('#8a5a2a'), { y: -13 });
  g.add(b);
  g.userData.body = b;
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
