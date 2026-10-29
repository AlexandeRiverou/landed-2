// World parameters + the procedural height/colour functions.
// Everything here is mutable: success events tweak these and the terrain rebuilds.
import * as THREE from 'three';
import { createNoise2D, mulberry32, fbm, ridged, smoothstep, lerp } from './noise.js';

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
function palette(name, o) {
  const p = { name };
  for (const k in o) p[k] = Array.isArray(o[k]) ? o[k].map(hex) : hex(o[k]);
  p.waterHex = o.water;
  return p;
}

export const PALETTES = [
  palette('Classic Countryside', { grass: '#5c9e3c', grass2: '#86b54a', forest: '#3b742b', sand: '#e6d49c', desert: '#dcaa66', desert2: '#c98448', rock: '#827a6e', rock2: '#5f574f', snow: '#f3f6fa', seabed: '#b09f74', water: '#2b8bd1', bands: ['#c26a3c', '#dc985e', '#b0552f', '#e5b57f'] }),
  palette('Autumn Spice', { grass: '#a8822f', grass2: '#c9682a', forest: '#8a3a1c', sand: '#e2cf9a', desert: '#d19a52', desert2: '#b9743a', rock: '#7a6e64', rock2: '#5a5048', snow: '#f6f2ea', seabed: '#9a8a64', water: '#2d7fa8', bands: ['#b4552f', '#d88a4a', '#9a3f22', '#e0a86a'] }),
  palette('Alien Planet', { grass: '#7b3fc4', grass2: '#4fd2c2', forest: '#3b1f7a', sand: '#f0e56a', desert: '#e050a6', desert2: '#b03a8a', rock: '#2f2a4c', rock2: '#46407a', snow: '#b8ffee', seabed: '#5a3a7a', water: '#ff5aa0', bands: ['#ff7ad0', '#7af0ff', '#c07aff', '#ffe07a'] }),
  palette('Cotton Candy', { grass: '#ff9fd0', grass2: '#ffc8e6', forest: '#e05aa2', sand: '#fff1b8', desert: '#ffd08a', desert2: '#ffb07a', rock: '#b48df2', rock2: '#9670d6', snow: '#ffffff', seabed: '#ffd6a8', water: '#79e6fa', bands: ['#ff8ac0', '#a8e0ff', '#ffe08a', '#c8a8ff'] }),
  palette('Winter Wonderland', { grass: '#e6eef4', grass2: '#d0dde6', forest: '#5d7f72', sand: '#dfe7ea', desert: '#c8d6dd', desert2: '#b4c6d0', rock: '#6e7b88', rock2: '#56626e', snow: '#ffffff', seabed: '#8aa0b0', water: '#3a6e90', bands: ['#9ab0c4', '#c8d8e4', '#7a90a8', '#e0ecf4'] }),
  palette('Mars Vacation', { grass: '#b5532d', grass2: '#c9703c', forest: '#8a3a22', sand: '#e2a472', desert: '#c4582e', desert2: '#a8441f', rock: '#6e3121', rock2: '#552616', snow: '#f2d4b6', seabed: '#7a3a2a', water: '#c0392b', bands: ['#d06a3a', '#e8a070', '#9a3a1a', '#f0c090'] }),
  palette('Toxic Neon', { grass: '#2bff88', grass2: '#b6ff3a', forest: '#00a86b', sand: '#fff95a', desert: '#ff9a1a', desert2: '#ff5a1a', rock: '#2a2a3a', rock2: '#1a1a28', snow: '#e0fff8', seabed: '#1a4a3a', water: '#00ffd0', bands: ['#ff3ad0', '#3affd8', '#ffe03a', '#8a3aff'] }),
  palette('Film Noir', { grass: '#8a8a8a', grass2: '#a0a0a0', forest: '#5a5a5a', sand: '#c8c8c8', desert: '#b0b0b0', desert2: '#989898', rock: '#606060', rock2: '#484848', snow: '#f4f4f4', seabed: '#707070', water: '#3a3a3a', bands: ['#7a7a7a', '#9a9a9a', '#5a5a5a', '#b8b8b8'] }),
  palette('Golden Hour Forever', { grass: '#c9a83a', grass2: '#e0c25a', forest: '#9a7a1a', sand: '#f4e2a0', desert: '#e8b84a', desert2: '#d09a2a', rock: '#a07a3a', rock2: '#7a5a2a', snow: '#fff6d0', seabed: '#c0a060', water: '#e0a020', bands: ['#d8a040', '#f0d070', '#b07a20', '#ffe8a0'] }),
  palette('Pastel Dream', { grass: '#a8e6b0', grass2: '#c8f0c0', forest: '#7ac8a0', sand: '#fff0c8', desert: '#ffd8b0', desert2: '#ffc0a0', rock: '#b8b0d8', rock2: '#a098c8', snow: '#ffffff', seabed: '#d8c8b0', water: '#a0d8f0', bands: ['#ffc0c8', '#c0e0ff', '#fff0a8', '#d8c0ff'] }),
  palette('Deep Jungle', { grass: '#2f8a2a', grass2: '#4aa83a', forest: '#1a5a20', sand: '#e8d08a', desert: '#a8b04a', desert2: '#8a983a', rock: '#5a6a4a', rock2: '#4a5a3a', snow: '#e8f4e0', seabed: '#6a7a4a', water: '#1a8a7a', bands: ['#7a8a4a', '#9aaa5a', '#5a6a3a', '#b0c070'] }),
];

export const world = {
  seed: 1,
  amp: 1,            // mountain height multiplier
  roughness: 1,      // rolling hills
  terrace: 0.4,      // stepped cliffs
  mesa: 1,           // table mountains
  canyon: 1,         // river canyon strength
  canyonWidth: 1,
  spikes: 0.6,       // rock pinnacles
  seaLevel: 0,
  snowLine: 240,
  palette: PALETTES[0],
  propTheme: 'default',
  propScale: 1,
  propDensity: 1,
  floatingIslands: 0.25,
  propSalt: 0,
};

const N = {};
export function reseed(seed) {
  world.seed = seed >>> 0;
  const r = mulberry32(world.seed);
  for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) N[k] = createNoise2D(r);
}

export function heightAt(x, z) {
  const W = world;
  const sel = N.a(x * 0.00042, z * 0.00042);
  const mount = smoothstep(0.0, 0.5, sel);
  const sea = 1 - smoothstep(-0.62, -0.32, sel);

  // Rolling base + small bumps.
  let h = 28 + fbm(N.b, x * 0.0022, z * 0.0022, 4) * 38 * W.roughness;
  h += N.b(x * 0.02 + 17, z * 0.02 - 5) * 2.5 * W.roughness;

  // Ridged mountain ranges.
  if (mount > 0) {
    const r = ridged(N.c, x * 0.0011, z * 0.0011, 5);
    h += mount * (40 + r * r * 380 * W.amp);
  }

  // Mesas: plateaus with near-vertical cliff walls (narrow smoothstep bands).
  if (W.mesa > 0) {
    const mm = smoothstep(0.1, 0.35, N.e(x * 0.0005 + 33, z * 0.0005 - 71)) * (1 - mount) * (1 - sea);
    if (mm > 0) {
      const v = N.e(x * 0.0026 - 9, z * 0.0026 + 41);
      const plateau = smoothstep(0.05, 0.13, v) * 0.55 + smoothstep(0.4, 0.47, v) * 0.45;
      h += mm * plateau * 150 * W.mesa * W.amp;
    }
  }

  // Terraces: turns slopes into stepped cliffs.
  if (W.terrace > 0 && h > 20) {
    const tm = smoothstep(0.0, 0.4, N.e(x * 0.0008 - 300, z * 0.0008 + 120)) * W.terrace;
    if (tm > 0) {
      const step = 26, k = h / step, fl = Math.floor(k);
      const th = (fl + smoothstep(0.55, 0.8, k - fl)) * step;
      h = lerp(h, th, Math.min(1, tm));
    }
  }

  // Canyons / rivers carved below sea level.
  if (W.canyon > 0) {
    const c = Math.abs(N.d(x * 0.0009, z * 0.0009));
    const cut = 1 - smoothstep(0.012 * W.canyonWidth, 0.06 * W.canyonWidth, c);
    if (cut > 0) {
      const cm = (1 - mount * 0.7) * (1 - sea) * Math.min(1, W.canyon);
      h = lerp(h, Math.min(h, W.seaLevel - 14), cut * cm);
    }
  }

  // Rock pinnacles.
  if (W.spikes > 0) {
    const s = N.f(x * 0.012 + 77, z * 0.012 - 13);
    if (s > 0.6) h += (s - 0.6) * 275 * W.spikes * (1 - sea);
  }

  // Open sea with scattered islands.
  if (sea > 0) {
    const isl = N.b(x * 0.004 + 50, z * 0.004 + 50);
    h = lerp(h, -45 + Math.max(0, isl - 0.35) * 160, sea);
  }
  return h - craterDepthAt(x, z);
}

// ---------- destructible terrain ----------
// Craters blasted into the ground live in world space, bucketed on a coarse grid so the height
// function only checks the few near each point. Everything (mesh, collision, props) reads heightAt,
// so a crater is consistent everywhere as soon as the chunks under it rebuild.
const CRATER_CELL = 160;
const craters = new Map();   // cell key → craters overlapping that cell
const cellKey = (cx, cz) => cx * 100003 + cz;
export const MAX_CRATER_DEPTH = 18;

export function craterDepthAt(x, z) {
  if (!craters.size) return 0;
  const list = craters.get(cellKey(Math.floor(x / CRATER_CELL), Math.floor(z / CRATER_CELL)));
  if (!list) return 0;
  let depth = 0;
  for (const c of list) {
    const d2 = (x - c.x) ** 2 + (z - c.z) ** 2, r2 = c.r * c.r;
    if (d2 >= r2 * 1.69) continue;
    if (d2 < r2) depth += c.d * (1 - d2 / r2); // round bowl, full enough that the nearest 8 m-grid vertex always sinks
    else { const t = (Math.sqrt(d2) - c.r) / (0.3 * c.r); depth -= c.d * 0.12 * Math.sin(t * Math.PI); } // raised rim
  }
  return depth;
}

// Adds (or deepens) a crater and returns the bounding box it touches, so the caller can rebuild.
export function addCrater(x, z, r, depth) {
  const near = craters.get(cellKey(Math.floor(x / CRATER_CELL), Math.floor(z / CRATER_CELL))) || [];
  let c = near.find((k) => (k.x - x) ** 2 + (k.z - z) ** 2 < (k.r * 0.5) ** 2);
  if (c) {
    // Repeated hits dig the same hole deeper and a little wider instead of piling up tiny craters.
    c.d = Math.min(MAX_CRATER_DEPTH, c.d + depth * 0.5);
    c.r = Math.min(26, Math.max(c.r, r) + 0.4);
  } else {
    c = { x, z, r, d: Math.min(depth, MAX_CRATER_DEPTH) };
  }
  const reach = c.r * 1.3;
  for (let cx = Math.floor((c.x - reach) / CRATER_CELL); cx <= Math.floor((c.x + reach) / CRATER_CELL); cx++) {
    for (let cz = Math.floor((c.z - reach) / CRATER_CELL); cz <= Math.floor((c.z + reach) / CRATER_CELL); cz++) {
      const k = cellKey(cx, cz);
      const list = craters.get(k) || [];
      if (!list.includes(c)) list.push(c);
      craters.set(k, list);
    }
  }
  return { minX: c.x - reach, maxX: c.x + reach, minZ: c.z - reach, maxZ: c.z + reach };
}

export function clearCraters() { craters.clear(); }

export const CAT = { SEA: 0, BEACH: 1, GRASS: 2, FOREST: 3, DESERT: 4, ROCK: 5, SNOW: 6, MESA: 7 };

function mix(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

// Writes an RGB colour into `out` and returns the biome category.
export function terrainInfo(x, z, h, ny, out) {
  const W = world, P = W.palette;
  const temp = N.f(x * 0.00035 + 500, z * 0.00035 - 200);
  const v = N.b(x * 0.013 + 3, z * 0.013 - 7);
  const sl = W.seaLevel;
  let cat;
  if (h < sl + 1.2) {
    mix(P.seabed, P.seabed, 0, out);
    if (h < sl - 6) { out[0] *= 0.7; out[1] *= 0.7; out[2] *= 0.7; }
    cat = CAT.SEA;
  } else if (h < sl + 5 && ny > 0.75) {
    mix(P.sand, P.sand, 0, out); cat = CAT.BEACH;
  } else if (ny < 0.66) {
    if (temp > 0.2) {
      const n = P.bands.length;
      mix(P.bands[((Math.floor(h / 14) % n) + n) % n], P.rock, 0.15, out); cat = CAT.MESA;
    } else {
      mix(P.rock, P.rock2, v > 0 ? 0 : 1, out); cat = CAT.ROCK;
    }
  } else if (h > W.snowLine + temp * 90 + v * 25) {
    mix(P.snow, P.snow, 0, out); cat = CAT.SNOW;
  } else if (temp > 0.28) {
    mix(P.desert, P.desert2, smoothstep(-0.4, 0.6, v), out); cat = CAT.DESERT;
  } else if (N.e(x * 0.004 + 11, z * 0.004 + 5) > 0.25) {
    mix(P.forest, P.grass, 0.15 + v * 0.1, out); cat = CAT.FOREST;
  } else {
    mix(P.grass, P.grass2, smoothstep(-0.5, 0.5, v), out);
    const d = smoothstep(0.12, 0.28, temp);
    if (d > 0) mix(out, P.desert, d * 0.7, out);
    cat = CAT.GRASS;
  }
  const r = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  const jit = 0.92 + 0.16 * (r - Math.floor(r));
  out[0] *= jit; out[1] *= jit; out[2] *= jit;
  return cat;
}
