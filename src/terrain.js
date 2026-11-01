// Infinite chunked terrain. Chunks build nearest-first a few per frame; a rebuild
// (after the world mutates) swaps chunks in progressively so the world "morphs".
import * as THREE from 'three';
import { world, heightAt, groundHeight, ceilingAt, terrainInfo, CAT, addCrater, craterDepthAt, addPad, removePad, padAt, clearTunnels, clearCity, tunnelInBox, tunnelColumn, cityRoofAt } from './world.js';
import { mulberry32, hash3 } from './noise.js';
import { PROPS, propMaterial } from './models.js';
import { buildCityMesh, cityProps } from './city.js';

export const CHUNK = 320;
export const SEG = 40;
const STEP = CHUNK / SEG;
const GW = SEG + 3; // height grid width incl. one-vertex border for normals
export const RADIUS = 4;
const AIRBORNE = new Set(['floatingIsland', 'hotAirBalloon', 'fishSchool']);
const SCORCH = (() => { const c = new THREE.Color('#4a3424'); return [c.r, c.g, c.b]; })();
const rgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const CEIL_ROCK = [rgb('#6a6080'), rgb('#5a5470'), rgb('#7a7090')];
const CEIL_GLOW = [rgb('#7af0ff'), rgb('#c07aff'), rgb('#7aff9a')];
const TUNNEL_ROCK = [rgb('#4a4440'), rgb('#3a3634'), rgb('#57504a')];
const THIN = 0.01; // overhang thinner than this is no overhang
const NO_PROPS = 255; // category for tunnel floors and mouths: nothing grows in there

const TABLES = {
  [CAT.GRASS]: [['roundTree', 3], ['pine', 1.5], ['birch', 1.2], ['bush', 3], ['rock', 0.6], ['house', 0.35], ['gnome', 0.06], ['appleTree', 1.2], ['flowers', 1.5], ['haybale', 0.4], ['sheep', 0.5], ['cow', 0.3], ['scarecrow', 0.12], ['well', 0.08], ['picnicTable', 0.12], ['tractor', 0.1], [null, 2]],
  [CAT.FOREST]: [['pine', 4], ['roundTree', 2], ['bush', 1], ['birch', 0.5], ['log', 0.8], ['tent', 0.12]],
  [CAT.DESERT]: [['cactus', 3], ['rock', 2], ['rockB', 1], ['deadTree', 0.8], ['bush', 0.4], ['tumbleweed', 0.9], ['totemPole', 0.15], ['camperVan', 0.1], [null, 3]],
  [CAT.ROCK]: [['rock', 2], ['rockB', 1.5], ['pine', 0.8], [null, 3]],
  [CAT.MESA]: [['rock', 1.5], ['rockB', 1], [null, 4]],
  [CAT.SNOW]: [['snowPine', 3], ['rock', 1], ['snowman', 0.25], ['igloo', 0.12], ['skiLift', 0.15], [null, 2]],
  [CAT.BEACH]: [['palm', 3], ['rockB', 0.6], ['parasol', 0.7], ['sandcastle', 0.35], [null, 2]],
  [CAT.SEA]: [['buoy', 0.25], ['boat', 0.18], ['sailboat', 0.14], ['iceberg', 0.05], ['whale', 0.025], ['duck', 0.015], [null, 6]],
};
// Underwater, the boats and whales float on the surface far above you.
const SURFACE = [['boat', 1], ['sailboat', 1], ['buoy', 0.6], ['whale', 0.35], ['duck', 0.2], ['iceberg', 0.05]];
// How far under the sea surface the underwater "roof" sits.
const SURFACE_MARGIN = 4;
const LANDMARKS = {
  [CAT.GRASS]: ['windmill', 'windmill', 'castleTower', 'house', 'barn', 'barn', 'ferrisWheel', 'stoneCircle', 'radioTower'],
  [CAT.FOREST]: ['castleTower', 'windmill', 'stoneCircle', 'ruins'],
  [CAT.DESERT]: ['pyramid', 'moai', 'ruins', 'radioTower', 'gasStation'],
  [CAT.MESA]: ['moai', 'ruins'],
  [CAT.BEACH]: ['lighthouse', 'ferrisWheel'],
  [CAT.SNOW]: ['castleTower', 'radioTower', 'igloo'],
};

export const THEMES = {
  default: {},
  mushroom: { appleTree: 'mushroom', roundTree: 'mushroom', pine: 'mushroom', birch: 'mushroom', palm: 'mushroom', snowPine: 'mushroom', deadTree: 'mushroom' },
  candy: { appleTree: 'lollipop', haybale: 'donut', roundTree: 'lollipop', pine: 'lollipop', birch: 'lollipop', rock: 'donut', rockB: 'donut', bush: 'donut', cactus: 'lollipop', palm: 'lollipop' },
  crystal: { tumbleweed: 'crystal', iceberg: 'crystal', rock: 'crystal', rockB: 'crystal', pine: 'crystal', snowPine: 'crystal', deadTree: 'crystal', cactus: 'crystal' },
  gnome: { scarecrow: 'gnome', snowman: 'gnome', flowers: 'gnome', bush: 'gnome', rock: 'gnome', cactus: 'gnome', rockB: 'gnome' },
  spooky: { appleTree: 'deadTree', flowers: 'rock', scarecrow: 'deadTree', roundTree: 'deadTree', pine: 'deadTree', birch: 'deadTree', palm: 'deadTree', snowPine: 'deadTree', bush: 'rock', house: 'castleTower' },
  tropical: { appleTree: 'palm', snowman: 'parasol', igloo: 'sandcastle', skiLift: 'palm', pine: 'palm', roundTree: 'palm', birch: 'palm', snowPine: 'palm', cactus: 'palm', deadTree: 'palm' },
  construction: { haybale: 'trafficCone', tumbleweed: 'trafficCone', rock: 'trafficCone', bush: 'trafficCone', cactus: 'trafficCone', rockB: 'trafficCone', gnome: 'trafficCone' },
  lunar: { roundTree: 'rock', pine: 'rockB', birch: 'rock', bush: 'rockB', palm: 'rock', snowPine: 'rockB', cactus: 'rock', deadTree: 'rockB', appleTree: 'rock', flowers: null, haybale: 'rockB', sheep: null, cow: null, scarecrow: null, house: 'crystal', gnome: null, picnicTable: null, tractor: null, camperVan: 'rockB', skiLift: null, gasStation: 'ruins' },
  princess: {
    roundTree: 'heartTree', appleTree: 'heartTree', birch: 'heartTree', pine: 'heartTree', snowPine: 'heartTree', palm: 'heartTree', cactus: 'heartTree', deadTree: 'heartTree',
    sheep: 'unicorn', cow: 'unicorn', scarecrow: 'unicorn', haybale: 'carriage', house: 'carriage', well: 'flowers', rock: 'flowers', bush: 'flowers', tumbleweed: 'flowers', log: 'flowers', tent: 'carriage',
    picnicTable: 'flowers', tractor: 'carriage', camperVan: 'carriage', skiLift: 'heartTree', gasStation: 'fairyCastle',
    castleTower: 'fairyCastle', windmill: 'fairyCastle', barn: 'fairyCastle', radioTower: 'fairyCastle', pyramid: 'fairyCastle', moai: 'fairyCastle', ruins: 'fairyCastle', igloo: 'fairyCastle',
  },
  cave: {
    roundTree: 'glowShroom', appleTree: 'glowShroom', birch: 'glowShroom', palm: 'glowShroom', bush: 'glowShroom', flowers: 'glowShroom', mushroom: 'glowShroom',
    pine: 'stalagmite', snowPine: 'stalagmite', cactus: 'stalagmite', deadTree: 'stalagmite', tumbleweed: 'rockB', totemPole: 'crystal', iceberg: 'crystal',
    house: 'tent', haybale: 'rock', sheep: null, cow: null, scarecrow: null, well: null, parasol: null, sandcastle: null, boat: null, sailboat: null, buoy: null, whale: null,
    picnicTable: null, tractor: null, camperVan: null, skiLift: 'stalagmite', gasStation: 'ruins',
    windmill: 'crystal', castleTower: 'ruins', barn: 'stalagmite', ferrisWheel: null, radioTower: 'stalagmite', lighthouse: 'crystal', pyramid: 'ruins', igloo: 'crystal',
  },
  garden: { pine: 'roundTree', snowPine: 'roundTree', birch: 'flowers', bush: 'flowers', rock: 'mushroom', rockB: 'gnome', haybale: 'flowers', log: 'flowers', deadTree: 'appleTree', cactus: 'flowers' },
  reef: {
    roundTree: 'coral', appleTree: 'coral', birch: 'coral', bush: 'coral', flowers: 'coral', tumbleweed: 'coral',
    pine: 'kelp', snowPine: 'kelp', palm: 'kelp', cactus: 'kelp', deadTree: 'kelp', totemPole: 'kelp', log: 'rockB', haybale: 'rock',
    house: 'shipwreck', barn: 'shipwreck', windmill: 'shipwreck', castleTower: 'ruins', lighthouse: 'shipwreck', radioTower: 'kelp', ferrisWheel: 'shipwreck', igloo: 'coral',
    sheep: null, cow: null, scarecrow: null, gnome: null, well: null, tent: null, snowman: null, parasol: null, sandcastle: null,
    picnicTable: null, tractor: 'shipwreck', camperVan: 'rockB', skiLift: 'kelp', gasStation: 'shipwreck',
  },
  neon: {
    roundTree: 'crystal', appleTree: 'crystal', birch: 'crystal', pine: 'crystal', snowPine: 'crystal', palm: 'crystal', cactus: 'crystal', deadTree: 'crystal', totemPole: 'crystal',
    bush: null, flowers: null, rock: null, rockB: null, log: null, haybale: null, tumbleweed: null, sheep: null, cow: null, scarecrow: null, gnome: null, well: null,
    tent: null, snowman: null, igloo: null, parasol: null, sandcastle: null, house: null, buoy: null, boat: null, sailboat: null, whale: null, duck: null, iceberg: null,
    windmill: 'radioTower', barn: 'radioTower', castleTower: 'radioTower', stoneCircle: 'crystal', ruins: 'crystal', moai: 'crystal',
    picnicTable: null, tractor: null, camperVan: null, skiLift: null, gasStation: 'radioTower',
  },
  salt: {
    roundTree: null, appleTree: null, birch: null, pine: null, snowPine: null, palm: null, cactus: 'rockB', deadTree: null, bush: null, flowers: null, log: null, haybale: null,
    tumbleweed: null, sheep: null, cow: null, scarecrow: null, gnome: null, well: null, tent: null, snowman: null, igloo: null, parasol: null, sandcastle: null, house: null,
    totemPole: null, buoy: null, boat: null, sailboat: null, whale: null, duck: null, iceberg: null,
    windmill: 'rock', barn: 'rock', castleTower: 'rock', ferrisWheel: 'rock', radioTower: 'rock', lighthouse: 'rock', stoneCircle: 'rock', ruins: 'rockB', pyramid: 'rockB',
    picnicTable: null, tractor: null, camperVan: null, skiLift: null, gasStation: 'rock',
  },
  bare: Object.fromEntries([...new Set(Object.values(LANDMARKS).flat())].map((k) => [k, null])), // no landmarks (the gas giant's cloud tops)
  blocks: { roundTree: 'blockTree', appleTree: 'blockTree', birch: 'blockTree', pine: 'blockTree', palm: 'blockTree', bush: 'blockTree', snowPine: 'blockTree', rock: 'rockB', deadTree: 'blockTree' },
  // Metropolis: the parks keep their trees; farm animals and cottages stay in the countryside.
  city: {
    appleTree: 'roundTree', bush: 'parkTree', flowers: 'bench', haybale: 'bench', rock: null, rockB: null, house: null, sheep: null, cow: null, scarecrow: 'streetLamp',
    well: 'fountain', tractor: null, picnicTable: 'bench', gnome: 'statue', log: 'bench', tent: null, iceberg: null,
    windmill: 'statue', castleTower: 'statue', barn: 'fountain', stoneCircle: 'fountain', radioTower: 'statue', ruins: 'fountain',
  },
  duck: { cow: 'duck', sheep: 'duck', sailboat: 'duck', whale: 'duck', boat: 'duck', buoy: 'duck', house: 'duck', rockB: 'duck', bush: 'duck' },
};

function pickWeighted(rng, table) {
  let total = 0;
  for (const e of table) total += e[1];
  let r = rng() * total;
  for (const e of table) { r -= e[1]; if (r <= 0) return e[0]; }
  return null;
}

const key = (cx, cz) => cx + ',' + cz;
const _oh = { floor: 0, under: 0, top: 0 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Terrain {
  constructor(G) {
    this.G = G;
    this.chunks = new Map();
    this.version = 0;
    this.dirty = new Set(); // chunks with fresh craters
    this.nextDirtyBuild = 0;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.water = new Water(G);
  }

  rebuildAll() { this.version++; clearTunnels(); clearCity(); } // the tunnels follow the new mountains, the city its new ground

  // Blast a crater: the height function changes at once; the chunks under it rebuild over the next frames.
  deform(x, z, r, depth) {
    this.touch(addCrater(x, z, Math.max(r, STEP), depth)); // anything narrower than the vertex grid wouldn't show
  }

  // Flatten a rectangle (centre, yaw, half width, half length) to height y, blending out over `blend` metres.
  // Returns an id for unflatten(). Same as a crater: the chunks under it rebuild over the next frames.
  flatten(x, z, yaw, hw, hl, y, blend) {
    const { id, box } = addPad(x, z, yaw, hw, hl, y, blend);
    this.touch(box);
    return id;
  }
  unflatten(id) { const box = removePad(id); if (box) this.touch(box); }

  // Mark the built chunks overlapping a box for a rebuild.
  touch(box) {
    for (let cx = Math.floor(box.minX / CHUNK); cx <= Math.floor(box.maxX / CHUNK); cx++) {
      for (let cz = Math.floor(box.minZ / CHUNK); cz <= Math.floor(box.maxZ / CHUNK); cz++) {
        if (this.chunks.has(key(cx, cz))) this.dirty.add(key(cx, cz));
      }
    }
  }

  get stale() {
    for (const c of this.chunks.values()) if (c.version !== this.version) return true;
    return false;
  }

  update(pos, budget = 2) {
    const pcx = Math.floor(pos.x / CHUNK), pcz = Math.floor(pos.z / CHUNK);
    for (let b = 0; b < budget; b++) {
      let best = null, bestD = Infinity;
      for (let dz = -RADIUS; dz <= RADIUS; dz++) {
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          const d = dx * dx + dz * dz;
          if (d > (RADIUS + 0.5) ** 2 || d >= bestD) continue;
          const c = this.chunks.get(key(pcx + dx, pcz + dz));
          if (c && c.version === this.version) continue;
          best = [pcx + dx, pcz + dz]; bestD = d;
        }
      }
      if (!best) break;
      this.build(best[0], best[1]);
    }
    // Rebuild cratered chunks at most every 0.15 s: sustained fire into the ground then costs one
    // rebuild per batch of hits instead of one per frame.
    const now = this.G.time;
    if (this.dirty.size && now >= this.nextDirtyBuild) {
      for (const k of this.dirty) {
        this.dirty.delete(k);
        const c = this.chunks.get(k);
        if (c) this.build(c.cx, c.cz);
        break;
      }
      this.nextDirtyBuild = now + 0.15;
    }
    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      const d = dx * dx + dz * dz;
      // Far chunks (and stale ones outside the build radius, which would never be rebuilt) go away.
      if (d > (RADIUS + 2) ** 2 || (c.version !== this.version && d > (RADIUS + 0.5) ** 2)) { this.unload(c); this.chunks.delete(k); }
    }
    this.water.update(pos);
  }

  unload(c) {
    this.G.scene.remove(c.mesh, c.props);
    c.mesh.geometry.dispose();
    if (c.ceil) { this.G.scene.remove(c.ceil); c.ceil.geometry.dispose(); }
    if (c.over) { this.G.scene.remove(c.over); c.over.geometry.dispose(); }
    if (c.city) { this.G.scene.remove(c.city); c.city.geometry.dispose(); }
    for (const m of c.props.children) m.dispose();
  }

  build(cx, cz) {
    const k = key(cx, cz);
    const old = this.chunks.get(k);
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const hs = new Float32Array(GW * GW);
    // Tunnel chunks also keep the rock over each bore: its underside (us) and the mountain top (ts).
    let us = null, ts = null;
    if (tunnelInBox(ox - STEP, oz - STEP, ox + CHUNK + STEP, oz + CHUNK + STEP)) {
      us = new Float32Array(GW * GW); ts = new Float32Array(GW * GW);
      const col = {};
      let any = false;
      for (let j = 0; j < GW; j++) {
        for (let i = 0; i < GW; i++) {
          const g = j * GW + i;
          any = tunnelColumn(ox + (i - 1) * STEP, oz + (j - 1) * STEP, col) || any;
          hs[g] = col.floor; us[g] = col.under; ts[g] = col.top;
        }
      }
      if (!any) us = ts = null; // the tunnel stays in the open air here
    } else {
      for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) hs[j * GW + i] = groundHeight(ox + (i - 1) * STEP, oz + (j - 1) * STEP); // the city's buildings are a mesh of their own
    }

    const V = SEG + 1;
    const pos = new Float32Array(V * V * 3), nor = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
    const cats = new Uint8Array(V * V);
    const tmp = [0, 0, 0];
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const idx = j * V + i, gi = (j + 1) * GW + (i + 1);
        const x = ox + i * STEP, z = oz + j * STEP, h = hs[gi];
        let nx = hs[gi - 1] - hs[gi + 1], ny = 2 * STEP, nz = hs[gi - GW] - hs[gi + GW];
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        pos[idx * 3] = x; pos[idx * 3 + 1] = h; pos[idx * 3 + 2] = z;
        nor[idx * 3] = nx; nor[idx * 3 + 1] = ny; nor[idx * 3 + 2] = nz;
        cats[idx] = terrainInfo(x, z, h, ny, tmp);
        const scorch = craterDepthAt(x, z);
        if (scorch > 0.3) { // blasted earth: blends toward burnt brown the deeper the crater
          const k = Math.min(0.8, scorch * 0.14);
          tmp[0] += (SCORCH[0] - tmp[0]) * k; tmp[1] += (SCORCH[1] - tmp[1]) * k; tmp[2] += (SCORCH[2] - tmp[2]) * k;
        }
        if (us && ts[gi] - us[gi] > THIN) { // a tunnel floor: bare rock, in the dark
          const r = TUNNEL_ROCK[(i + j) % 3];
          tmp[0] = r[0] * 0.8; tmp[1] = r[1] * 0.8; tmp[2] = r[2] * 0.8;
        }
        if (us && us[gi] !== hs[gi]) cats[idx] = NO_PROPS; // inside a bore or its mouth
        col[idx * 3] = tmp[0]; col[idx * 3 + 1] = tmp[1]; col[idx * 3 + 2] = tmp[2];
      }
    }
    const index = new Uint16Array(SEG * SEG * 6);
    let n = 0;
    for (let j = 0; j < SEG; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = j * V + i, b = a + V, c = a + 1, d = b + 1;
        index[n++] = a; index[n++] = b; index[n++] = c;
        index[n++] = c; index[n++] = b; index[n++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.matrixAutoUpdate = false;

    const chunk = { cx, cz, hs, us, ts, mesh, version: this.version };
    chunk.props = this.buildProps(chunk, cats);
    if (us) chunk.over = this.buildOverhang(chunk, index);
    if (world.city) chunk.city = buildCityMesh(ox, oz, CHUNK, this.material);
    if (world.cave) {
      chunk.cs = new Float32Array(GW * GW);
      for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) chunk.cs[j * GW + i] = ceilingAt(ox + (i - 1) * STEP, oz + (j - 1) * STEP, hs[j * GW + i]);
      chunk.ceil = this.buildCeiling(chunk, index);
    }
    if (old) this.unload(old);
    this.G.scene.add(mesh, chunk.props);
    if (chunk.ceil) this.G.scene.add(chunk.ceil);
    if (chunk.over) this.G.scene.add(chunk.over);
    if (chunk.city) this.G.scene.add(chunk.city);
    this.chunks.set(k, chunk);
  }

  // The cave roof for one chunk: the floor's grid, flipped to face down, in dark rock with glowing veins.
  buildCeiling(chunk, floorIndex) {
    const { cx, cz, cs } = chunk, V = SEG + 1, ox = cx * CHUNK, oz = cz * CHUNK;
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const idx = j * V + i, x = ox + i * STEP, z = oz + j * STEP;
        pos[idx * 3] = x; pos[idx * 3 + 1] = cs[(j + 1) * GW + (i + 1)]; pos[idx * 3 + 2] = z;
        const h = hash3(Math.round(x / STEP), Math.round(z / STEP), world.seed);
        const c = h % 23 === 0 ? CEIL_GLOW[(h >>> 5) % 3] : CEIL_ROCK[(h >>> 5) % 3];
        col[idx * 3] = c[0]; col[idx * 3 + 1] = c[1]; col[idx * 3 + 2] = c[2];
      }
    }
    const index = new Uint16Array(floorIndex.length);
    for (let k = 0; k < index.length; k += 3) { index[k] = floorIndex[k]; index[k + 1] = floorIndex[k + 2]; index[k + 2] = floorIndex[k + 1]; } // reversed: faces point down
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  // The rock over a tunnel for one chunk: the mountain top facing up and the tunnel roof facing down, as
  // one mesh. Only triangles with some thickness are kept, and the two layers meet where it thins out.
  buildOverhang(chunk, floorIndex) {
    const { cx, cz, us, ts } = chunk, V = SEG + 1, VV = V * V, ox = cx * CHUNK, oz = cz * CHUNK;
    const pos = new Float32Array(VV * 6), col = new Float32Array(VV * 6), thick = new Uint8Array(VV);
    const tmp = [0, 0, 0];
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const idx = j * V + i, g = (j + 1) * GW + (i + 1), x = ox + i * STEP, z = oz + j * STEP;
        thick[idx] = ts[g] - us[g] > THIN ? 1 : 0;
        pos[idx * 3] = x; pos[idx * 3 + 1] = ts[g]; pos[idx * 3 + 2] = z;
        const nx = ts[g - 1] - ts[g + 1], nz = ts[g - GW] - ts[g + GW];
        terrainInfo(x, z, ts[g], (2 * STEP) / Math.hypot(nx, 2 * STEP, nz), tmp); // the mountain keeps its biomes
        col[idx * 3] = tmp[0]; col[idx * 3 + 1] = tmp[1]; col[idx * 3 + 2] = tmp[2];
        const u = (VV + idx) * 3, r = TUNNEL_ROCK[hash3(i, j, cx * 31 + cz) % 3];
        pos[u] = x; pos[u + 1] = us[g]; pos[u + 2] = z;
        col[u] = r[0]; col[u + 1] = r[1]; col[u + 2] = r[2];
      }
    }
    const index = [];
    for (let k = 0; k < floorIndex.length; k += 3) {
      const a = floorIndex[k], b = floorIndex[k + 1], c = floorIndex[k + 2];
      if (!(thick[a] | thick[b] | thick[c])) continue;
      index.push(a, b, c, VV + a, VV + c, VV + b); // top faces up, the roof underside (reversed) faces down
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(index), 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  // Rock hanging over (x, z) in a tunnel zone, as { under, top }; null where nothing overhangs.
  overhang(x, z) {
    if (!world.tunnels) return null;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = this.chunks.get(key(cx, cz));
    if (ch) {
      if (!ch.us) return null;
      const fx = (x - cx * CHUNK) / STEP, fz = (z - cz * CHUNK) / STEP;
      _oh.under = gridHeight(ch.us, fx, fz); _oh.top = gridHeight(ch.ts, fx, fz);
    } else tunnelColumn(x, z, _oh);
    return _oh.top - _oh.under > THIN ? _oh : null;
  }

  // Height of the rendered cave roof above (x, z); Infinity in the open. Underwater, the sea surface
  // (a little below it) is the roof, so everything placed in the air stays in the water.
  // Give `y` to ask from inside a tunnel: below the middle of the rock over it, the tunnel roof is
  // your roof; above that (or without y) you're over the mountain, with open sky.
  ceilingHeight(x, z, y = Infinity) {
    const sea = world.underwater ? world.seaLevel - SURFACE_MARGIN : Infinity;
    if (world.tunnels) {
      const o = this.overhang(x, z);
      return o && y < (o.under + o.top) / 2 ? Math.min(sea, o.under) : sea;
    }
    if (!world.cave) return sea;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = this.chunks.get(key(cx, cz));
    if (!ch || !ch.cs) return Math.min(sea, ceilingAt(x, z));
    return Math.min(sea, gridHeight(ch.cs, (x - cx * CHUNK) / STEP, (z - cz * CHUNK) / STEP));
  }

  // Exact height of the rendered (triangulated) surface; falls back to the noise. Over a tunnel it's the
  // mountain top, unless `y` is below the middle of the rock: then it's the tunnel floor. In the city, a
  // building's roof (its walls are sheer: one step from the street to the roof).
  surfaceHeight(x, z, y = Infinity) {
    if (world.tunnels) {
      const o = this.overhang(x, z);
      if (o && y >= (o.under + o.top) / 2) return o.top;
    }
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = this.chunks.get(key(cx, cz));
    if (!ch) return heightAt(x, z);
    const g = gridHeight(ch.hs, (x - cx * CHUNK) / STEP, (z - cz * CHUNK) / STEP);
    return world.city ? Math.max(g, cityRoofAt(x, z)) : g;
  }

  buildProps(chunk, cats) {
    const group = new THREE.Group();
    const { cx, cz, hs, us, ts } = chunk;
    const ox = cx * CHUNK, oz = cz * CHUNK;
    // Over a tunnel, things in the air float above the mountain top, and nothing stands under a rock lip.
    // In the city, things in the air float above the rooftops.
    const top = (u, v) => Math.max(gridHeight(hs, u, v), us ? gridHeight(ts, u, v) : -Infinity, world.city ? cityRoofAt(ox + u * STEP, oz + v * STEP) : -Infinity);
    const overhung = (u, v) => us && gridHeight(ts, u, v) - gridHeight(us, u, v) > THIN;
    const rng = mulberry32(hash3(cx, cz, world.seed * 7 + world.propSalt));
    const theme = THEMES[world.propTheme] || {};
    const buckets = {};
    const V = SEG + 1;
    const place = (type, x, y, z, scaleMul = 1, yaw = null) => { // yaw: a fixed heading (cars follow their lane)
      const meta = PROPS[type];
      if (!meta) return;
      (buckets[type] ||= []).push({ x, y, z, meta, s: scaleMul, yaw });
    };

    const attempts = Math.round(64 * world.propDensity);
    for (let a = 0; a < attempts; a++) {
      const u = rng() * SEG, v = rng() * SEG;
      const cat = cats[Math.round(v) * V + Math.round(u)];
      const table = TABLES[cat];
      let type = table && pickWeighted(rng, table);
      if (!type) continue;
      if (type in theme) type = theme[type]; // a theme can swap a prop, or remove it (null)
      if (!type) continue;
      if (overhung(u, v)) continue;
      const x = ox + u * STEP, z = oz + v * STEP;
      const h = gridHeight(hs, u, v);
      if (cat === CAT.SEA && h > world.seaLevel - 3) continue;
      place(type, x, PROPS[type]?.sea && cat === CAT.SEA ? world.seaLevel : h, z);
    }

    if (rng() < 0.2) {
      const u = 4 + rng() * (SEG - 8), v = 4 + rng() * (SEG - 8);
      const cat = cats[Math.round(v) * V + Math.round(u)];
      const list = LANDMARKS[cat];
      if (list) {
        let type = list[Math.floor(rng() * list.length)];
        if (type in theme) type = theme[type];
        if (type && !overhung(u, v)) place(type, ox + u * STEP, gridHeight(hs, u, v), oz + v * STEP, 1.6);
      }
    }
    if (world.city) cityProps(ox, oz, CHUNK, place); // traffic, street furniture, parks and rooftops
    if (world.underwater) { // the boats and whales up on the surface
      for (let k = 0; k < 2; k++) {
        const type = rng() < 0.35 && pickWeighted(rng, SURFACE);
        if (type) place(type, ox + rng() * CHUNK, world.seaLevel, oz + rng() * CHUNK);
      }
    }
    if (rng() < world.floatingIslands && !world.cave) {
      const u = rng() * SEG, v = rng() * SEG;
      place('floatingIsland', ox + u * STEP, Math.max(top(u, v), world.seaLevel) + 140 + rng() * 240, oz + v * STEP);
    }
    if (world.underwater) { // where the sky would have balloons, the sea has fish
      for (let k = 0; k < 2; k++) {
        if (rng() > 0.3) continue;
        const u = rng() * SEG, v = rng() * SEG, g = gridHeight(hs, u, v);
        place('fishSchool', ox + u * STEP, g + 25 + rng() * Math.max(0, world.seaLevel - g - 60), oz + v * STEP);
      }
    } else if (rng() < 0.07 * world.balloons && !world.cave) { // nothing floats above a cave roof
      const u = rng() * SEG, v = rng() * SEG;
      place('hotAirBalloon', ox + u * STEP, Math.max(top(u, v), world.seaLevel) + 90 + rng() * 200, oz + v * STEP);
    }

    for (const type in buckets) {
      const list = buckets[type];
      const im = new THREE.InstancedMesh(PROPS[type].geo, propMaterial, list.length);
      list.forEach((it, i) => {
        const m = it.meta;
        const s = (m.scale[0] + rng() * (m.scale[1] - m.scale[0])) * world.propScale * it.s;
        _e.set((rng() - 0.5) * m.tilt, it.yaw ?? rng() * Math.PI * 2, (rng() - 0.5) * m.tilt);
        _q.setFromEuler(_e);
        if (m.nonUniform) _s.set(s * (0.7 + rng() * 0.6), s * (0.5 + rng() * 0.7), s * (0.7 + rng() * 0.6));
        else _s.setScalar(s);
        _p.set(it.x, it.y - m.sink * s, it.z);
        // Anything standing in a crater was blown away (sky and sea props are out of reach).
        // Nor does anything stand on flattened ground (a runway).
        if (!m.sea && !AIRBORNE.has(type) && (craterDepthAt(it.x, it.z) > 1 || padAt(it.x, it.z) > 0.3)) _s.setScalar(0);
        im.setMatrixAt(i, _m.compose(_p, _q, _s));
        if (m.tints) _c.copy(m.tints[Math.floor(rng() * m.tints.length)]);
        else { const b = 0.85 + rng() * 0.3; _c.setRGB(b, b, b); }
        im.setColorAt(i, _c);
      });
      im.computeBoundingSphere();
      group.add(im);
    }
    return group;
  }
}

function gridHeight(hs, fx, fz) {
  const i = Math.max(0, Math.min(SEG - 1, Math.floor(fx)));
  const j = Math.max(0, Math.min(SEG - 1, Math.floor(fz)));
  const u = fx - i, v = fz - j;
  const g = (j + 1) * GW + (i + 1);
  const ha = hs[g], hb = hs[g + GW], hc = hs[g + 1], hd = hs[g + GW + 1];
  if (u + v <= 1) return ha + (hc - ha) * u + (hb - ha) * v;
  return hd + (hb - hd) * (1 - u) + (hc - hd) * (1 - v);
}

const BLACK = new THREE.Color(0, 0, 0);

class Water {
  constructor(G) {
    const geo = new THREE.PlaneGeometry(12000, 12000, 60, 60); // subdivided so it can bend with the tiny-planet curvature
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshPhongMaterial({ color: world.palette.waterHex, transparent: true, opacity: 0.82, shininess: 90, specular: '#ffffff' });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = world.seaLevel;
    this.target = new THREE.Color(world.palette.waterHex);
    G.scene.add(this.mesh);
  }
  update(pos) {
    this.mesh.position.x = Math.round(pos.x / 100) * 100;
    this.mesh.position.z = Math.round(pos.z / 100) * 100;
    this.mesh.position.y += (world.seaLevel - this.mesh.position.y) * 0.03;
    this.target.set(world.palette.waterHex);
    this.mat.color.lerp(this.target, 0.03);
    // Lava glows; water doesn't. Seas far below a space zone simply aren't drawn.
    // Seen from underwater, the surface glows with daylight.
    this.mat.emissive.lerp(world.palette.waterGlow ? this.target : world.underwater ? _c.copy(this.target).multiplyScalar(0.6) : BLACK, 0.03);
    this.mesh.visible = world.seaLevel > -600;
    // From underwater you look up at the surface, so it needs a back side too.
    const side = world.underwater ? THREE.DoubleSide : THREE.FrontSide;
    if (this.mat.side !== side) { this.mat.side = side; this.mat.needsUpdate = true; }
  }
}
