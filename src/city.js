// Metropolis: the buildings and street furniture for one terrain chunk. The layout (blocks, lots, tiers)
// lives in world.js, where heightAt() makes every building solid; this file only draws it. Each chunk gets
// ONE mesh for all its buildings (window walls + plain roofs, two shared materials), and its street,
// park and rooftop props go into the chunk's instanced prop buckets like any other prop.
import * as THREE from 'three';
import { world, cityBlock, cityGround, CITY_FLOOR, CITY_WALK } from './world.js';
import { mulberry32, hash3 } from './noise.js';

const rgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
// Facade tint, roof colour and window spacing (m). Towers are mostly glass; low-rise mostly stone and brick.
const style = (wall, roof, win) => ({ wall: rgb(wall), roof: rgb(roof), win });
const TALL = [style('#9cc0e0', '#4a5058', 3.2), style('#6a7a92', '#3a3e46', 3.2), style('#88d0c8', '#46585a', 3.6), style('#d8dce2', '#5a5e66', 4), style('#e8dcc4', '#6a645a', 4)];
const LOW = [style('#ece4d4', '#9a948a', 4), style('#d08a68', '#7a6a60', 4), style('#e8cfa0', '#a8987e', 4.4), style('#c8ccd2', '#6a6e76', 4), style('#b86a50', '#8a7a70', 3.6)];
const GREEN_ROOF = rgb('#5a8a48');
const TILE = 8; // the window texture holds 8 × 8 windows (8 windows across, 8 floors up)

// One window texture shared by every building: light frames, dark glass, and a few lit windows that glow.
let wallMat = null;
function wallMaterial() {
  if (wallMat) return wallMat;
  const S = 256, cell = S / TILE;
  const make = () => { const cv = document.createElement('canvas'); cv.width = cv.height = S; return cv; };
  const cv = make(), glow = make(), c = cv.getContext('2d'), g = glow.getContext('2d');
  c.fillStyle = '#e4e4e4'; c.fillRect(0, 0, S, S);
  g.fillStyle = '#000000'; g.fillRect(0, 0, S, S);
  const rng = mulberry32(1234);
  for (let j = 0; j < TILE; j++) {
    for (let i = 0; i < TILE; i++) {
      const x = i * cell + 4, y = j * cell + 7, w = cell - 8, h = cell - 13;
      const lit = rng() < 0.22;
      c.fillStyle = lit ? '#ffe2a8' : ['#34465a', '#3c5068', '#2c3a4a', '#4a6078', '#56708a'][Math.floor(rng() * 5)];
      c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, y, w * 0.35, h); // a glint
      if (lit) { g.fillStyle = '#ffc870'; g.fillRect(x, y, w, h); }
    }
  }
  const tex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: tex(cv), emissiveMap: tex(glow), emissive: '#ffffff', emissiveIntensity: 0.55 });
  return wallMat;
}

// Every block whose cell starts inside the chunk belongs to it (so each building is drawn exactly once).
function eachBlock(ox, oz, size, fn) {
  const B = world.city;
  for (let bx = Math.ceil(ox / B); bx * B < ox + size; bx++) {
    for (let bz = Math.ceil(oz / B); bz * B < oz + size; bz++) fn(cityBlock(bx, bz));
  }
}

// All the buildings of one chunk as one mesh (walls first, then roofs, as two material groups), or null.
export function buildCityMesh(ox, oz, size, roofMaterial) {
  const wp = [], wu = [], wc = [], rp = [], rc = [];
  eachBlock(ox, oz, size, (blk) => {
    for (const b of blk.lots) {
      const st = (b.tall ? TALL : LOW)[b.style];
      const tileW = TILE * st.win, tileH = TILE * CITY_FLOOR;
      const u0 = (b.seed % TILE) / TILE, v0 = ((b.seed >>> 4) % TILE) / TILE; // a different window pattern per building
      b.tiers.forEach((t, k) => {
        const y0 = k ? b.tiers[k - 1].top : b.base - 4, y1 = t.top;
        const shade = 1 - k * 0.05; // upper tiers a touch darker, so the setbacks read
        // Walls round the perimeter (outward-facing), the texture running on round the corners.
        const ring = [[t.x0, t.z1], [t.x1, t.z1], [t.x1, t.z0], [t.x0, t.z0], [t.x0, t.z1]];
        let run = 0;
        for (let e = 0; e < 4; e++) {
          const [ax, az] = ring[e], [bx, bz] = ring[e + 1], len = Math.hypot(bx - ax, bz - az);
          const ua = u0 + run / tileW, ub = u0 + (run + len) / tileW, va = v0 + (y0 - b.base) / tileH, vb = v0 + (y1 - b.base) / tileH;
          run += len;
          const side = e % 2 ? 0.88 : 1; // two faces a little darker: corners stay crisp even in flat light
          const quad = [[ax, y0, az, ua, va], [bx, y0, bz, ub, va], [bx, y1, bz, ub, vb], [ax, y0, az, ua, va], [bx, y1, bz, ub, vb], [ax, y1, az, ua, vb]];
          for (const [x, y, z, u, v] of quad) { wp.push(x, y, z); wu.push(u, v); wc.push(st.wall[0] * shade * side, st.wall[1] * shade * side, st.wall[2] * shade * side); }
        }
        const roof = k < b.tiers.length - 1 && (b.seed >>> 9) % 4 === 0 ? GREEN_ROOF : st.roof; // some podiums have a roof garden
        for (const [x, z] of [[t.x0, t.z0], [t.x0, t.z1], [t.x1, t.z1], [t.x0, t.z0], [t.x1, t.z1], [t.x1, t.z0]]) { rp.push(x, y1, z); rc.push(...roof); }
      });
    }
  });
  if (!wp.length) return null;
  const nw = wp.length / 3, nr = rp.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...wp, ...rp]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([...wu, ...new Array(nr * 2).fill(0)]), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([...wc, ...rc]), 3));
  geo.addGroup(0, nw, 0);
  geo.addGroup(nw, nr, 1);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, [wallMaterial(), roofMaterial]);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Heading (yaw) that turns a +z-facing model toward (dx, dz).
const face = (dx, dz) => Math.atan2(dx, dz);

// Street furniture, traffic, parks and rooftop clutter for one chunk. place(type, x, y, z, scale, yaw).
export function cityProps(ox, oz, size, place) {
  const B = world.city, sea = world.seaLevel;
  eachBlock(ox, oz, size, (blk) => {
    const rng = mulberry32(hash3(blk.bx, blk.bz, world.seed ^ 0x5eed));
    const { x0, z0, x1, z1, dens } = blk, cx = blk.bx * B, cz = blk.bz * B;
    const dry = (x, z) => cityGround(x, z) > sea + 1;
    const put = (type, x, z, yaw, s = 1) => { if (dry(x, z)) place(type, x, cityGround(x, z), z, s, yaw); };

    // Traffic on this cell's two roads: lanes each way, buses mostly on the avenues.
    const traffic = (w, len, at) => { // at(across, along) → [x, z, heading yaw]
      const lanes = w > 30 ? [0.14, 0.34, 0.66, 0.86] : [0.28, 0.72];
      for (const l of lanes) {
        for (let s = 5; s < len - 5; s += 10) {
          if (rng() > 0.06 + 0.2 * dens) continue;
          const r = rng(), type = w > 30 && r < 0.12 ? 'bus' : r < 0.06 + 0.3 * dens ? 'taxi' : 'car';
          const [x, z, yaw] = at(l * w, s + rng() * 2, l > 0.5);
          put(type, x, z, yaw);
          if (type === 'bus') s += 10;
        }
      }
    };
    const rx = x0 - cx, rz = z0 - cz;
    traffic(rx, z1 - z0, (a, s, fwd) => [cx + a, z0 + s, fwd ? 0 : Math.PI]); // the road along z, west of the block
    traffic(rz, x1 - x0, (a, s, fwd) => [x0 + s, cz + a, fwd ? -Math.PI / 2 : Math.PI / 2]); // the road along x, north of it

    // A traffic light on the block's corner at its crossing.
    put('trafficLight', x0 + 1.5, z0 + 1.5, face(-1, -1));
    // Lamps (and in leafy blocks, planted trees) along all four sidewalks, the lamp arms over the road.
    const trees = rng() < 0.3 + 0.4 * (1 - dens);
    const sides = [[x0, z0, 1, 0, 0, -1], [x1, z0, 0, 1, 1, 0], [x1, z1, -1, 0, 0, 1], [x0, z1, 0, -1, -1, 0]]; // start, direction, outward
    for (const [sx, sz, dx, dz, nx, nz] of sides) {
      const len = Math.abs(dx ? x1 - x0 : z1 - z0);
      for (let s = 14; s < len - 8; s += 36) {
        put('streetLamp', sx + dx * s - nx * 1.4, sz + dz * s - nz * 1.4, face(nx, nz));
        if (trees && s + 18 < len - 8) put('parkTree', sx + dx * (s + 18) - nx * 2.6, sz + dz * (s + 18) - nz * 2.6, rng() * 6);
      }
    }

    const ix0 = x0 + CITY_WALK, iz0 = z0 + CITY_WALK, ix1 = x1 - CITY_WALK, iz1 = z1 - CITY_WALK, mx = (ix0 + ix1) / 2, mz = (iz0 + iz1) / 2;
    if (blk.kind === 'park') {
      const fountain = rng() < 0.6;
      if (fountain) put('fountain', mx, mz, rng() * 6);
      for (let x = ix0 + 7; x < ix1 - 4; x += 13) {
        for (let z = iz0 + 7; z < iz1 - 4; z += 13) {
          if (fountain && Math.hypot(x - mx, z - mz) < 14) continue;
          const r = rng();
          if (r < 0.55) put(r < 0.3 ? 'roundTree' : r < 0.42 ? 'birch' : 'pine', x + (rng() - 0.5) * 6, z + (rng() - 0.5) * 6, rng() * 6);
          else if (r < 0.65) put('bench', x, z, face(mx - x, mz - z));
        }
      }
    } else if (blk.kind === 'plaza') {
      put(rng() < 0.65 ? 'statue' : 'fountain', mx, mz, face(rng() - 0.5, rng() - 0.5), rng() < 0.4 ? 1.4 : 1);
      for (const [x, z] of [[ix0 + 6, iz0 + 6], [ix1 - 6, iz0 + 6], [ix0 + 6, iz1 - 6], [ix1 - 6, iz1 - 6]]) put('parkTree', x, z, rng() * 6);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; put('bench', mx + Math.cos(a) * 18, mz + Math.sin(a) * 18, face(-Math.cos(a), -Math.sin(a))); }
    }

    // Rooftops: one thing on most roofs, picked by the building's size.
    for (const b of blk.lots) {
      const t = b.tiers[b.tiers.length - 1], h = t.top - b.base;
      const w = t.x1 - t.x0, d = t.z1 - t.z0, rcx = (t.x0 + t.x1) / 2, rcz = (t.z0 + t.z1) / 2;
      const spot = (m) => [t.x0 + m + rng() * Math.max(0, w - 2 * m), t.z0 + m + rng() * Math.max(0, d - 2 * m)];
      const r = rng();
      if (b.site) place('crane', t.x0 + 4, t.top, t.z0 + 4, 1, face(rcx - t.x0, rcz - t.z0) + (rng() - 0.5));
      else if (h > 230) place('spire', rcx, t.top, rcz, 1, 0);
      else if (b.tall && Math.min(w, d) >= 21 && r < 0.3) place('helipad', rcx, t.top, rcz, 1, rng() * 6);
      else if (b.tall && r < 0.75) { const [x, z] = spot(3); place('antenna', x, t.top, z, 1, rng() * 6); }
      else if (!b.tall && r < 0.4) { const [x, z] = spot(4); place('waterTower', x, t.top, z, 1, rng() * 6); }
      else if (!b.tall && r < 0.6 && Math.min(w, d) >= 14) {
        const k = Math.floor(rng() * 4), n = [[0, -1], [1, 0], [0, 1], [-1, 0]][k]; // stand at one edge, facing out
        place('billboard', rcx + n[0] * (w / 2 - 3), t.top, rcz + n[1] * (d / 2 - 3), 1, face(n[0], n[1]));
      }
    }
  });
}
