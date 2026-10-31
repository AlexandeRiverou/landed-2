// World parameters + the procedural height/colour functions.
// Everything here is mutable: success events tweak these and the terrain rebuilds.
import * as THREE from 'three';
import { createNoise2D, mulberry32, fbm, ridged, smoothstep, lerp, hash3 } from './noise.js';

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
function palette(name, o) {
  const p = { name };
  for (const k in o) p[k] = Array.isArray(o[k]) ? o[k].map(hex) : hex(o[k]);
  p.waterHex = o.water;
  p.waterGlow = !!o.waterGlow;
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

// Palettes only zones use (random world changes never pick these).
export const ZONE_PALETTES = {
  volcanic: palette('Volcanic', { grass: '#3a3030', grass2: '#4a3a34', forest: '#2a2424', sand: '#5a4a40', desert: '#6a3a2a', desert2: '#4a2a20', rock: '#2a2628', rock2: '#1a1618', snow: '#8a8484', seabed: '#ff6a1a', water: '#ff4a0a', waterGlow: true, bands: ['#3a2a2a', '#5a2a1a', '#2a1a1a', '#7a3a1a'] }),
  princess: palette('Royal Pastel', { grass: '#b8f0c8', grass2: '#d8ffd8', forest: '#ff9ad0', sand: '#fff4d0', desert: '#ffd8f0', desert2: '#f0c0e8', rock: '#c8b0f0', rock2: '#a890e0', snow: '#ffffff', seabed: '#f0d0f0', water: '#9ad8ff', bands: ['#ffb0d8', '#d8c0ff', '#ffe8a0', '#ffd0e8'] }),
  cavern: palette('Cavern', { grass: '#4a6a5a', grass2: '#5a7a6a', forest: '#3a5a60', sand: '#7a7088', desert: '#6a6078', desert2: '#5a5068', rock: '#5a5070', rock2: '#4a4260', snow: '#a0e8ff', seabed: '#1a3a4a', water: '#1a9ac0', waterGlow: true, bands: ['#5a4a7a', '#3a5a7a', '#6a4a8a', '#2a4a5a'] }),
  dunes: palette('Dunes', { grass: '#e8c890', grass2: '#f0d8a0', forest: '#d8b070', sand: '#f4e0b0', desert: '#e8c080', desert2: '#d8a868', rock: '#b08a5a', rock2: '#9a7448', snow: '#fff4e0', seabed: '#c8a878', water: '#3aa8c8', bands: ['#d89a5a', '#e8b878', '#c0804a', '#f0cc98'] }),
  reef: palette('Reef', { grass: '#e87a6a', grass2: '#f0a070', forest: '#3aa88a', sand: '#f0e0b0', desert: '#f0c070', desert2: '#e89a5a', rock: '#7a5a9a', rock2: '#5a6aa0', snow: '#ffd0e0', seabed: '#c8b890', water: '#4ab8e8', bands: ['#ff7a8a', '#ffb05a', '#c07aff', '#5ad8c8'] }),
  neon: palette('Neon', { grass: '#ff2ad8', grass2: '#ff2ad8', forest: '#ff2ad8', sand: '#ff2ad8', desert: '#ff2ad8', desert2: '#ff2ad8', rock: '#120820', rock2: '#0a0418', snow: '#2af0ff', seabed: '#0a0418', water: '#180a30', bands: ['#120820', '#160a28', '#0e0618', '#1a0c2c'] }),
  salt: palette('Salt', { grass: '#f4f2ee', grass2: '#ffffff', forest: '#e8e4e0', sand: '#fbfaf6', desert: '#f0ebe2', desert2: '#e6ded2', rock: '#b8aca0', rock2: '#a09488', snow: '#ffffff', seabed: '#f6f4f0', water: '#b8c4e8', waterGlow: true, bands: ['#e8e0d8', '#f4eee8', '#d8d0c8', '#fffaf4'] }),
  toy: palette('Toy Box', { grass: '#4ad04a', grass2: '#8ae84a', forest: '#1fa04a', sand: '#ffe46a', desert: '#ffb43a', desert2: '#ff8a3a', rock: '#a0a4b8', rock2: '#80849a', snow: '#ffffff', seabed: '#3a9ae0', water: '#3ac8ff', bands: ['#ff5a5a', '#ffd23a', '#5ab4ff', '#c07aff'] }),
  jovian: palette('Jovian', { grass: '#f0c890', grass2: '#f6e2c0', forest: '#e8a060', sand: '#fff0d8', desert: '#d08850', desert2: '#c8743a', rock: '#e8b07a', rock2: '#d89a6a', snow: '#fff4e0', seabed: '#a85a2a', water: '#c0703a', bands: ['#e8b07a', '#f6e2c0', '#c8743a', '#f0c890'] }),
  peaks: palette('Peaks', { grass: '#6f9a4a', grass2: '#8fb25a', forest: '#3f6a3a', sand: '#d8c89a', desert: '#c8a070', desert2: '#b08058', rock: '#8a8278', rock2: '#6a6460', snow: '#f4f6fa', seabed: '#6a7a6a', water: '#3a8ab8', bands: ['#a86a4a', '#c8946a', '#8a5a40', '#d8b088'] }),
  metro: palette('Metro', { grass: '#5a9a48', grass2: '#74b052', forest: '#3a7a3a', sand: '#d0c4a8', desert: '#b8ac90', desert2: '#a89c80', rock: '#6a6a70', rock2: '#5a5a60', snow: '#f0f0f0', seabed: '#3a4a52', water: '#2a6a9a', bands: ['#8a8a90', '#9a9aa0', '#7a7a80', '#aaaab0'] }),
  lunar: palette('Lunar', { grass: '#9a9a9e', grass2: '#b4b4b8', forest: '#86868c', sand: '#c4c4c8', desert: '#a8a8ac', desert2: '#909094', rock: '#6e6e74', rock2: '#5a5a60', snow: '#e4e4e8', seabed: '#7a7a80', water: '#2a2a30', bands: ['#8a8a90', '#a0a0a6', '#74747a', '#b8b8be'] }),
};

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
  floor: 0,          // whole-terrain vertical offset (space zones drop the ground far below)
  tempBias: 0,       // + pushes everything toward desert, - toward snow and green
  craters: 0,        // natural impact craters (the Moon)
  cave: 0,           // 1 = a rock ceiling over everything (the caverns)
  balloons: 1,       // hot-air balloon chance multiplier
  curve: 0,          // tiny-planet curvature: vertices drop by curve·d² away from the camera (see curve.js)
  axisCurve: 0,      // curvature across one world axis only (curveAxis); negative bends the ground up (the ringworld)
  curveAxis: 'x',
  underwater: 0,     // 1 = you fly under the sea: the surface is the roof and the water doesn't kill (the reef)
  grid: 0,           // > 0: neon grid lines every `grid` metres painted over dark ground (the synthwave zone)
  voxel: 0,          // > 0: the ground is built from blocks this many metres wide (Blockland)
  hillBase: 1,       // scales the broad rise every mountain range sits on (the salt flats want almost none)
  ranges: 0,         // + spreads the mountain ranges over more of the land (Hollow Peaks)
  tunnels: 0,        // 0..1: chance each TUNNEL_CELL square gets a tunnel bored through its mountain (Hollow Peaks)
  city: 0,           // > 0: a street grid of city blocks this many metres apart, with solid skyscrapers (Metropolis)
};
export const WORLD_DEFAULTS = { ...world };

const N = {};
export function reseed(seed) {
  world.seed = seed >>> 0;
  const r = mulberry32(world.seed);
  for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) N[k] = createNoise2D(r);
  clearTunnels();
  clearCity();
}

// The height the sea stops you at: its surface, or nowhere when you fly beneath it.
export const waterLine = () => (world.underwater ? -Infinity : world.seaLevel);

// Underwater, the seabed stays at least this far below the surface, so there's always room to fly.
export const REEF_GAP = 60;

export function heightAt(x, z) {
  const W = world;
  if (W.voxel) {
    // Blockland: one height per block (sampled at its centre), snapped to steps a third of a block tall.
    const b = W.voxel, s = b / 3;
    const h = landHeight((Math.floor(x / b) + 0.5) * b, (Math.floor(z / b) + 0.5) * b) - W.floor;
    return Math.round(h / s) * s + W.floor - craterDepthAt(x, z);
  }
  if (W.tunnels) { tunnelColumn(x, z, _col); return _col.floor; }
  if (W.city) return Math.max(cityGround(x, z) - craterDepthAt(x, z), cityRoofAt(x, z)); // rooftops are ground too
  return landHeight(x, z) - craterDepthAt(x, z);
}

// The ground without any buildings on it (the terrain mesh). Same as heightAt() outside the city.
export function groundHeight(x, z) {
  return world.city ? cityGround(x, z) - craterDepthAt(x, z) : heightAt(x, z);
}

// The natural landscape, before any craters are blasted into it.
function landHeight(x, z) {
  const W = world;
  const sel = N.a(x * 0.00042, z * 0.00042);
  const mount = smoothstep(0.0, 0.5, sel + W.ranges);
  const sea = 1 - smoothstep(-0.62, -0.32, sel);

  // Rolling base + small bumps.
  let h = 28 + fbm(N.b, x * 0.0022, z * 0.0022, 4) * 38 * W.roughness;
  h += N.b(x * 0.02 + 17, z * 0.02 - 5) * 2.5 * W.roughness;

  // Ridged mountain ranges.
  if (mount > 0) {
    const r = ridged(N.c, x * 0.0011, z * 0.0011, 5);
    h += mount * (40 * W.hillBase + r * r * 380 * W.amp);
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
    const isl = W.city ? 0 : N.b(x * 0.004 + 50, z * 0.004 + 50); // a city's harbour is open water
    h = lerp(h, -45 + Math.max(0, isl - 0.35) * 160, sea);
  }
  if (W.craters > 0) h -= moonCraters(x, z) * W.craters;
  if (W.underwater) h = Math.min(h, W.seaLevel - W.floor - REEF_GAP); // reef tops flatten out well under the surface
  return h + W.floor;
}

// The cave roof: a lumpy rock ceiling that follows the floor at a safe distance, with stalactites
// hanging from it. Infinity when there's no cave.
export const CAVE_MIN_GAP = 55;
export function ceilingAt(x, z, floor = heightAt(x, z)) {
  if (!world.cave) return Infinity;
  let c = 185 + fbm(N.c, x * 0.0016 + 91, z * 0.0016 - 37, 3) * 70;
  c = Math.max(c, floor + 95);
  const s = N.f(x * 0.011 - 41, z * 0.011 + 90);
  if (s > 0.55) c -= (s - 0.55) * 260; // stalactites
  return Math.max(c, floor + CAVE_MIN_GAP);
}

// ---------- tunnels ----------
// Hollow Peaks: big bores clean through the mountains. Each TUNNEL_CELL square holds at most one: a gently
// curving tube with a flat floor and an arched roof that tapers into the floor at its sides. It stays inside
// its cell, so a point only ever asks one tunnel. Rock is solid below the floor and from the roof up to the
// mountain top: heightAt() is the floor, and tunnelColumn() adds the overhang, which Terrain builds as a
// second mesh (roof underside + mountain top) only in the chunks that have one.
export const TUNNEL_CELL = 720;
const tunnelPlans = new Map(); // cell key → plan, or null for a cell without a tunnel
export function clearTunnels() { tunnelPlans.clear(); }

function tunnelPlan(cx, cz) {
  const k = cellKey(cx, cz);
  let t = tunnelPlans.get(k);
  if (t === undefined) { t = planTunnel(cx, cz); tunnelPlans.set(k, t); }
  return t;
}

// The tunnel's centre line at distance t along it.
export function tunnelPoint(T, t, out = {}) {
  const off = T.bend * Math.sin((Math.PI * t) / T.len);
  out.x = T.ax + T.dx * t - T.dz * off;
  out.z = T.az + T.dz * t + T.dx * off;
  out.floor = T.f0 + ((T.f1 - T.f0) * t) / T.len;
  return out;
}

// Try a few spots and headings in the cell; keep the first whose ends are open (floor at or above the
// ground there) and whose middle third runs deep inside the mountain. No such heading: no tunnel here.
function planTunnel(cx, cz) {
  const W = world, rng = mulberry32(hash3(cx, cz, W.seed ^ 0x7a11e));
  if (rng() >= W.tunnels) return null;
  const hw = 28 + rng() * 17, H = 42 + rng() * 26, len = 340 + rng() * 200, bend = (rng() - 0.5) * 70;
  const room = TUNNEL_CELL / 2 - Math.hypot(len / 2, hw + Math.abs(bend)) - 4;
  const S = 16, M = new Array(S + 1), p = {};
  let ox = 0, oz = 0, a0 = 0;
  for (let k = 0; k < 32; k++) {
    if (k % 8 === 0) { // a fresh spot in the cell every 8 headings
      ox = (cx + 0.5) * TUNNEL_CELL + (rng() * 2 - 1) * room; oz = (cz + 0.5) * TUNNEL_CELL + (rng() * 2 - 1) * room; a0 = rng() * Math.PI;
    }
    const a = a0 + (k * Math.PI) / 8, dx = Math.cos(a), dz = Math.sin(a);
    const T = { ax: ox - (dx * len) / 2, az: oz - (dz * len) / 2, dx, dz, len, hw, H, bend, f0: 0, f1: 0 };
    for (let i = 0; i <= S; i++) { tunnelPoint(T, (i / S) * len, p); M[i] = landHeight(p.x, p.z); }
    const low = W.seaLevel + 8; // never a flooded floor
    let f0 = Math.max(M[0], low) + 2, f1 = Math.max(M[S], low) + 2;
    const rise = 0.18 * len; // gentle enough to fly: a high end opens out of a cliff face instead
    if (f1 - f0 > rise) f0 = f1 - rise; else if (f0 - f1 > rise) f1 = f0 - rise;
    if (Math.max(f0, f1) + H > 1000) continue; // stay under the sky's soft ceiling
    let ok = true;
    for (let i = 5; i <= 11 && ok; i++) ok = M[i] > f0 + ((f1 - f0) * i) / S + H + 24;
    if (ok) { T.f0 = f0; T.f1 = f1; T.r = Math.hypot(len / 2 + MOUTH_EDGE, hw + Math.abs(bend)); T.ox = ox; T.oz = oz; return T; }
  }
  return null;
}

// Tunnels whose cells lie within `r` of (x, z) (the smoke test and debugging use this).
export function tunnelsNear(x, z, r) {
  const out = [];
  if (!world.tunnels) return out;
  for (let cx = Math.floor((x - r) / TUNNEL_CELL); cx <= Math.floor((x + r) / TUNNEL_CELL); cx++) {
    for (let cz = Math.floor((z - r) / TUNNEL_CELL); cz <= Math.floor((z + r) / TUNNEL_CELL); cz++) {
      const t = tunnelPlan(cx, cz);
      if (t) out.push(t);
    }
  }
  return out;
}

// Does any tunnel reach into this box? Chunks without one skip the overhang work entirely.
export function tunnelInBox(minX, minZ, maxX, maxZ) {
  if (!world.tunnels) return false;
  for (const t of tunnelsNear((minX + maxX) / 2, (minZ + maxZ) / 2, Math.max(maxX - minX, maxZ - minZ) / 2 + 1)) {
    if (t.ox + t.r > minX && t.ox - t.r < maxX && t.oz + t.r > minZ && t.oz - t.r < maxZ) return true;
  }
  return false;
}

// The bore at (x, z): its floor and roof heights, or null outside every tunnel.
const _bore = { floor: 0, roof: 0, past: false };
const MOUTH_EDGE = 12; // m past each end, more than one terrain grid step (8 m)
function boreAt(x, z) {
  const T = tunnelPlan(Math.floor(x / TUNNEL_CELL), Math.floor(z / TUNNEL_CELL));
  if (!T) return null;
  const px = x - T.ax, pz = z - T.az, u = px * T.dx + pz * T.dz;
  if (u < -MOUTH_EDGE || u > T.len + MOUTH_EDGE) return null;
  const t = Math.min(T.len, Math.max(0, u));
  const s = Math.abs(pz * T.dx - px * T.dz - T.bend * Math.sin((Math.PI * t) / T.len)) / T.hw;
  if (s >= 1) return null;
  _bore.floor = T.f0 + ((T.f1 - T.f0) * t) / T.len;
  _bore.roof = _bore.floor + T.H * Math.sqrt(1 - s * s); // an arch that meets the floor at the walls
  _bore.past = u !== t; // just past an end: no bore here, only the roof line the rock's edge tapers to
  return _bore;
}

// One column of a tunnel zone: the floor you'd land on, and the rock overhead (`under` = tunnel roof,
// `top` = the mountain above it). Returns true when rock hangs over the floor here. Elsewhere under and
// top collapse onto one height (the ground, or the roof line in a mouth), so the overhang mesh tapers
// out to nothing instead of ending in a gap.
const _col = { floor: 0, under: 0, top: 0 };
export function tunnelColumn(x, z, out) {
  const m = landHeight(x, z), c = craterDepthAt(x, z), b = world.tunnels ? boreAt(x, z) : null;
  if (!b) { out.floor = out.under = out.top = m - c; return false; } // solid ground
  // The bore in the open air, or just past a mouth: plain ground, and the rock's edge tapers out along the
  // roof line (onto the ground, it would hang a lip of rock down into the bore across one grid cell).
  if (b.past || m <= b.floor) { out.floor = m - c; out.under = out.top = Math.max(m - c, b.roof); return false; }
  out.floor = b.floor - c;
  if (m <= b.roof) { out.under = out.top = b.roof; return false; } // a mouth: the bore cuts open to the sky
  out.under = b.roof;
  out.top = Math.max(b.roof, m - c);
  return true;
}

// ---------- the city ----------
// Metropolis: gentle land cut into a street grid. Every `city`-metre cell has its road along its low-x and low-z
// edges (every 4th line a wide avenue) and a city block in the rest: a park, a plaza, or up to four buildings.
// A building is a stack of boxes ("tiers"), each narrower than the one below, with its roof at a whole number
// of floors. heightAt() returns the rooftop over a building and street level everywhere else, so walls are as
// solid as the ground. Blocks are planned lazily from the seed and cached; reseed(), Terrain.rebuildAll() and
// zone changes clear the cache (clearCity()). Lock the shape and sea mutations in a city zone.
export const CITY_STREET = 24, CITY_AVENUE = 40, CITY_WALK = 6, CITY_FLOOR = 3.6;
const LOT_GAP = 4; // the alley between two buildings of one block
const cityPlans = new Map(); // cell key → block plan
export function clearCity() { cityPlans.clear(); }

// Width of the road along grid line i (the low edge of cell i).
export const cityRoad = (i) => ((i % 4) + 4) % 4 === 0 ? CITY_AVENUE : CITY_STREET;

// Street level: the gentle land, with a flat quay along the water so no street slopes into the harbour.
export function cityGround(x, z) {
  const h = landHeight(x, z), sea = world.seaLevel;
  return h > sea - 12 ? Math.max(h, sea + 4) : h;
}

// How built-up a district is: 0 (low-rise outskirts) to 1 (downtown).
export function cityDensity(x, z) {
  return smoothstep(-0.25, 0.5, N.d(x * 0.0005 + 13, z * 0.0005 - 29) * 0.85 + N.c(x * 0.0021 - 7, z * 0.0021 + 3) * 0.25);
}

export function cityBlock(bx, bz) {
  const k = cellKey(bx, bz);
  let b = cityPlans.get(k);
  if (!b) {
    if (cityPlans.size > 8000) cityPlans.clear(); // a very long flight: start over rather than grow forever
    b = planBlock(bx, bz);
    cityPlans.set(k, b);
  }
  return b;
}

function planBlock(bx, bz) {
  const W = world, B = W.city, rng = mulberry32(hash3(bx, bz, W.seed ^ 0xc17e));
  const x0 = bx * B + cityRoad(bx), z0 = bz * B + cityRoad(bz), x1 = (bx + 1) * B, z1 = (bz + 1) * B;
  const dens = cityDensity((x0 + x1) / 2, (z0 + z1) / 2);
  const blk = { bx, bz, x0, z0, x1, z1, dens, kind: 'lots', lots: [] };
  const r = rng();
  if (r < 0.04 + 0.08 * (1 - dens)) { blk.kind = 'park'; return blk; }
  if (r < 0.07 + 0.08 * (1 - dens) && dens > 0.3) { blk.kind = 'plaza'; return blk; }
  // Split the block (inside its sidewalk) into 1 or 2 lots each way, with alleys between them.
  const split = (a, b) => {
    if (rng() < 0.4) return [[a, b]];
    const m = a + (b - a) * (0.38 + rng() * 0.24);
    return [[a, m - LOT_GAP / 2], [m + LOT_GAP / 2, b]];
  };
  const xs = split(x0 + CITY_WALK, x1 - CITY_WALK), zs = split(z0 + CITY_WALK, z1 - CITY_WALK);
  const floors = (h) => Math.max(2, Math.round(h / CITY_FLOOR)) * CITY_FLOOR;
  for (const [ax, bxx] of xs) {
    for (const [az, bzz] of zs) {
      const lx0 = ax + rng() * 2.5, lx1 = bxx - rng() * 2.5, lz0 = az + rng() * 2.5, lz1 = bzz - rng() * 2.5;
      const base = Math.min(cityGround(lx0, lz0), cityGround(lx1, lz0), cityGround(lx0, lz1), cityGround(lx1, lz1));
      if (base < W.seaLevel + 2) continue; // no buildings in the harbour
      const tall = rng() < 0.03 + 0.85 * dens * dens;
      const site = !tall && rng() < 0.06; // a building site: a few floors and a crane on top
      const h = site ? 7 + rng() * 8 : tall ? 70 + rng() * (50 + 210 * dens) : 9 + rng() * (12 + 40 * dens);
      const b = { x0: lx0, z0: lz0, x1: lx1, z1: lz1, base, tall, site, style: Math.floor(rng() * 5), seed: (rng() * 1e9) | 0, tiers: [] };
      const tier = (inset, top) => {
        const s = Math.min(inset, (Math.min(lx1 - lx0, lz1 - lz0) - 12) / 2); // never thinner than 12 m
        b.tiers.push({ x0: lx0 + s, z0: lz0 + s, x1: lx1 - s, z1: lz1 - s, top: base + floors(top) });
      };
      const w = Math.min(lx1 - lx0, lz1 - lz0);
      if (tall && rng() < 0.75) { // a tower on a podium, maybe with a narrower crown
        tier(0, 8 + rng() * 16);
        const crown = h > 140 && rng() < 0.6;
        tier(w * (0.1 + rng() * 0.12), crown ? h * (0.6 + rng() * 0.2) : h);
        if (crown) tier(w * (0.24 + rng() * 0.08), h);
      } else tier(0, h);
      blk.lots.push(b);
    }
  }
  return blk;
}

// The rooftop under (x, z), or -Infinity on a road, a sidewalk, a park or in an alley.
export function cityRoofAt(x, z) {
  const B = world.city, bx = Math.floor(x / B), bz = Math.floor(z / B);
  if (x - bx * B < cityRoad(bx) || z - bz * B < cityRoad(bz)) return -Infinity;
  for (const b of cityBlock(bx, bz).lots) {
    if (x < b.x0 || x >= b.x1 || z < b.z0 || z >= b.z1) continue;
    for (let i = b.tiers.length - 1; i >= 0; i--) {
      const t = b.tiers[i];
      if (x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1) return t.top;
    }
  }
  return -Infinity;
}

const CITY_RGB = { road: hex('#3c3e44'), walk: hex('#a8a49c'), plaza: hex('#c8b8a0'), lot: hex('#6a6866') };
// City colours for the ground mesh: asphalt roads, concrete sidewalks, paved plazas and grass parks.
function cityColor(x, z, out) {
  const B = world.city, bx = Math.floor(x / B), bz = Math.floor(z / B), P = world.palette;
  let c = CITY_RGB.road, cat = CAT.CITY;
  if (x - bx * B >= cityRoad(bx) && z - bz * B >= cityRoad(bz)) {
    const blk = cityBlock(bx, bz);
    const inner = x >= blk.x0 + CITY_WALK && x < blk.x1 - CITY_WALK && z >= blk.z0 + CITY_WALK && z < blk.z1 - CITY_WALK;
    if (!inner) c = CITY_RGB.walk;
    else if (blk.kind === 'park') { mix(P.grass, P.grass2, smoothstep(-0.5, 0.5, N.b(x * 0.03, z * 0.03)), out); return CAT.GRASS; }
    else c = blk.kind === 'plaza' ? CITY_RGB.plaza : CITY_RGB.lot;
  }
  const r = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, jit = 0.95 + 0.1 * (r - Math.floor(r));
  out[0] = c[0] * jit; out[1] = c[1] * jit; out[2] = c[2] * jit;
  return cat;
}

// Natural impact craters: one per 140 m cell at a random spot, bowl + raised rim.
function moonCraters(x, z) {
  const S = 140, cx = Math.floor(x / S), cz = Math.floor(z / S);
  let depth = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const hsh = hash3(cx + i, cz + j, world.seed);
      const r = 18 + (hsh % 47);
      const ox = ((cx + i) + ((hsh >>> 8) % 1000) / 1000) * S, oz = ((cz + j) + ((hsh >>> 18) % 1000) / 1000) * S;
      const d = Math.hypot(x - ox, z - oz) / r;
      if (d < 1) depth += r * 0.35 * (1 - d * d);
      else if (d < 1.35) depth -= r * 0.08 * Math.sin(((d - 1) / 0.35) * Math.PI);
    }
  }
  return depth;
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

export const CAT = { SEA: 0, BEACH: 1, GRASS: 2, FOREST: 3, DESERT: 4, ROCK: 5, SNOW: 6, MESA: 7, CITY: 8 };

function mix(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

// Writes an RGB colour into `out` and returns the biome category.
export function terrainInfo(x, z, h, ny, out) {
  const W = world, P = W.palette;
  if (W.voxel) { const b = W.voxel; x = (Math.floor(x / b) + 0.5) * b; z = (Math.floor(z / b) + 0.5) * b; } // one biome and shade per block
  const temp = N.f(x * 0.00035 + 500, z * 0.00035 - 200) + W.tempBias;
  const v = N.b(x * 0.013 + 3, z * 0.013 - 7);
  const sl = W.underwater ? -Infinity : W.seaLevel; // underwater, the seabed gets the land biomes
  if (W.city && h >= sl + 1.2) return cityColor(x, z, out); // streets, sidewalks, plazas and parks
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
  if (W.grid) {
    // Neon grid: dark ground with glowing lines on a world-space grid, magenta low down to cyan up high.
    const g = W.grid, on = ((x % g) + g) % g < 1 || ((z % g) + g) % g < 1;
    if (on) mix(P.grass, P.snow, smoothstep(W.seaLevel, W.seaLevel + 260, h), out);
    else mix(P.rock, P.rock2, v > 0 ? 0 : 1, out);
    return cat;
  }
  const r = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  const jit = 0.92 + 0.16 * (r - Math.floor(r));
  out[0] *= jit; out[1] *= jit; out[2] *= jit;
  return cat;
}
