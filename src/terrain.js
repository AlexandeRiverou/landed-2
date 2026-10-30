// Infinite chunked terrain. Chunks build nearest-first a few per frame; a rebuild
// (after the world mutates) swaps chunks in progressively so the world "morphs".
import * as THREE from 'three';
import { world, heightAt, ceilingAt, terrainInfo, CAT, addCrater, craterDepthAt } from './world.js';
import { mulberry32, hash3 } from './noise.js';
import { PROPS, propMaterial } from './models.js';

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

const TABLES = {
  [CAT.GRASS]: [['roundTree', 3], ['pine', 1.5], ['birch', 1.2], ['bush', 3], ['rock', 0.6], ['house', 0.35], ['gnome', 0.06], ['appleTree', 1.2], ['flowers', 1.5], ['haybale', 0.4], ['sheep', 0.5], ['cow', 0.3], ['scarecrow', 0.12], ['well', 0.08], [null, 2]],
  [CAT.FOREST]: [['pine', 4], ['roundTree', 2], ['bush', 1], ['birch', 0.5], ['log', 0.8], ['tent', 0.12]],
  [CAT.DESERT]: [['cactus', 3], ['rock', 2], ['rockB', 1], ['deadTree', 0.8], ['bush', 0.4], ['tumbleweed', 0.9], ['totemPole', 0.15], [null, 3]],
  [CAT.ROCK]: [['rock', 2], ['rockB', 1.5], ['pine', 0.8], [null, 3]],
  [CAT.MESA]: [['rock', 1.5], ['rockB', 1], [null, 4]],
  [CAT.SNOW]: [['snowPine', 3], ['rock', 1], ['snowman', 0.25], ['igloo', 0.12], [null, 2]],
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
  [CAT.DESERT]: ['pyramid', 'moai', 'ruins', 'radioTower'],
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
  tropical: { appleTree: 'palm', snowman: 'parasol', igloo: 'sandcastle', pine: 'palm', roundTree: 'palm', birch: 'palm', snowPine: 'palm', cactus: 'palm', deadTree: 'palm' },
  construction: { haybale: 'trafficCone', tumbleweed: 'trafficCone', rock: 'trafficCone', bush: 'trafficCone', cactus: 'trafficCone', rockB: 'trafficCone', gnome: 'trafficCone' },
  lunar: { roundTree: 'rock', pine: 'rockB', birch: 'rock', bush: 'rockB', palm: 'rock', snowPine: 'rockB', cactus: 'rock', deadTree: 'rockB', appleTree: 'rock', flowers: null, haybale: 'rockB', sheep: null, cow: null, scarecrow: null, house: 'crystal', gnome: null },
  princess: {
    roundTree: 'heartTree', appleTree: 'heartTree', birch: 'heartTree', pine: 'heartTree', snowPine: 'heartTree', palm: 'heartTree', cactus: 'heartTree', deadTree: 'heartTree',
    sheep: 'unicorn', cow: 'unicorn', scarecrow: 'unicorn', haybale: 'carriage', house: 'carriage', well: 'flowers', rock: 'flowers', bush: 'flowers', tumbleweed: 'flowers', log: 'flowers', tent: 'carriage',
    castleTower: 'fairyCastle', windmill: 'fairyCastle', barn: 'fairyCastle', radioTower: 'fairyCastle', pyramid: 'fairyCastle', moai: 'fairyCastle', ruins: 'fairyCastle', igloo: 'fairyCastle',
  },
  cave: {
    roundTree: 'glowShroom', appleTree: 'glowShroom', birch: 'glowShroom', palm: 'glowShroom', bush: 'glowShroom', flowers: 'glowShroom', mushroom: 'glowShroom',
    pine: 'stalagmite', snowPine: 'stalagmite', cactus: 'stalagmite', deadTree: 'stalagmite', tumbleweed: 'rockB', totemPole: 'crystal', iceberg: 'crystal',
    house: 'tent', haybale: 'rock', sheep: null, cow: null, scarecrow: null, well: null, parasol: null, sandcastle: null, boat: null, sailboat: null, buoy: null, whale: null,
    windmill: 'crystal', castleTower: 'ruins', barn: 'stalagmite', ferrisWheel: null, radioTower: 'stalagmite', lighthouse: 'crystal', pyramid: 'ruins', igloo: 'crystal',
  },
  garden: { pine: 'roundTree', snowPine: 'roundTree', birch: 'flowers', bush: 'flowers', rock: 'mushroom', rockB: 'gnome', haybale: 'flowers', log: 'flowers', deadTree: 'appleTree', cactus: 'flowers' },
  reef: {
    roundTree: 'coral', appleTree: 'coral', birch: 'coral', bush: 'coral', flowers: 'coral', tumbleweed: 'coral',
    pine: 'kelp', snowPine: 'kelp', palm: 'kelp', cactus: 'kelp', deadTree: 'kelp', totemPole: 'kelp', log: 'rockB', haybale: 'rock',
    house: 'shipwreck', barn: 'shipwreck', windmill: 'shipwreck', castleTower: 'ruins', lighthouse: 'shipwreck', radioTower: 'kelp', ferrisWheel: 'shipwreck', igloo: 'coral',
    sheep: null, cow: null, scarecrow: null, gnome: null, well: null, tent: null, snowman: null, parasol: null, sandcastle: null,
  },
  neon: {
    roundTree: 'crystal', appleTree: 'crystal', birch: 'crystal', pine: 'crystal', snowPine: 'crystal', palm: 'crystal', cactus: 'crystal', deadTree: 'crystal', totemPole: 'crystal',
    bush: null, flowers: null, rock: null, rockB: null, log: null, haybale: null, tumbleweed: null, sheep: null, cow: null, scarecrow: null, gnome: null, well: null,
    tent: null, snowman: null, igloo: null, parasol: null, sandcastle: null, house: null, buoy: null, boat: null, sailboat: null, whale: null, duck: null, iceberg: null,
    windmill: 'radioTower', barn: 'radioTower', castleTower: 'radioTower', stoneCircle: 'crystal', ruins: 'crystal', moai: 'crystal',
  },
  salt: {
    roundTree: null, appleTree: null, birch: null, pine: null, snowPine: null, palm: null, cactus: 'rockB', deadTree: null, bush: null, flowers: null, log: null, haybale: null,
    tumbleweed: null, sheep: null, cow: null, scarecrow: null, gnome: null, well: null, tent: null, snowman: null, igloo: null, parasol: null, sandcastle: null, house: null,
    totemPole: null, buoy: null, boat: null, sailboat: null, whale: null, duck: null, iceberg: null,
    windmill: 'rock', barn: 'rock', castleTower: 'rock', ferrisWheel: 'rock', radioTower: 'rock', lighthouse: 'rock', stoneCircle: 'rock', ruins: 'rockB', pyramid: 'rockB',
  },
  bare: Object.fromEntries([...new Set(Object.values(LANDMARKS).flat())].map((k) => [k, null])), // no landmarks (the gas giant's cloud tops)
  blocks: { roundTree: 'blockTree', appleTree: 'blockTree', birch: 'blockTree', pine: 'blockTree', palm: 'blockTree', bush: 'blockTree', snowPine: 'blockTree', rock: 'rockB', deadTree: 'blockTree' },
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

  rebuildAll() { this.version++; }

  // Blast a crater: the height function changes at once; the chunks under it rebuild over the next frames.
  deform(x, z, r, depth) {
    const box = addCrater(x, z, Math.max(r, STEP), depth); // anything narrower than the vertex grid wouldn't show
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
    for (const m of c.props.children) m.dispose();
  }

  build(cx, cz) {
    const k = key(cx, cz);
    const old = this.chunks.get(k);
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const hs = new Float32Array(GW * GW);
    for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) hs[j * GW + i] = heightAt(ox + (i - 1) * STEP, oz + (j - 1) * STEP);

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

    const chunk = { cx, cz, hs, mesh, version: this.version };
    chunk.props = this.buildProps(chunk, cats);
    if (world.cave) {
      chunk.cs = new Float32Array(GW * GW);
      for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) chunk.cs[j * GW + i] = ceilingAt(ox + (i - 1) * STEP, oz + (j - 1) * STEP, hs[j * GW + i]);
      chunk.ceil = this.buildCeiling(chunk, index);
    }
    if (old) this.unload(old);
    this.G.scene.add(mesh, chunk.props);
    if (chunk.ceil) this.G.scene.add(chunk.ceil);
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

  // Height of the rendered cave roof above (x, z); Infinity in the open. Underwater, the sea surface
  // (a little below it) is the roof, so everything placed in the air stays in the water.
  ceilingHeight(x, z) {
    const sea = world.underwater ? world.seaLevel - SURFACE_MARGIN : Infinity;
    if (!world.cave) return sea;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = this.chunks.get(key(cx, cz));
    if (!ch || !ch.cs) return Math.min(sea, ceilingAt(x, z));
    return Math.min(sea, gridHeight(ch.cs, (x - cx * CHUNK) / STEP, (z - cz * CHUNK) / STEP));
  }

  // Exact height of the rendered (triangulated) surface; falls back to the noise.
  surfaceHeight(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = this.chunks.get(key(cx, cz));
    if (!ch) return heightAt(x, z);
    return gridHeight(ch.hs, (x - cx * CHUNK) / STEP, (z - cz * CHUNK) / STEP);
  }

  buildProps(chunk, cats) {
    const group = new THREE.Group();
    const { cx, cz, hs } = chunk;
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const rng = mulberry32(hash3(cx, cz, world.seed * 7 + world.propSalt));
    const theme = THEMES[world.propTheme] || {};
    const buckets = {};
    const V = SEG + 1;
    const place = (type, x, y, z, scaleMul = 1) => {
      const meta = PROPS[type];
      if (!meta) return;
      (buckets[type] ||= []).push({ x, y, z, meta, s: scaleMul });
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
        if (type) place(type, ox + u * STEP, gridHeight(hs, u, v), oz + v * STEP, 1.6);
      }
    }
    if (world.underwater) { // the boats and whales up on the surface
      for (let k = 0; k < 2; k++) {
        const type = rng() < 0.35 && pickWeighted(rng, SURFACE);
        if (type) place(type, ox + rng() * CHUNK, world.seaLevel, oz + rng() * CHUNK);
      }
    }
    if (rng() < world.floatingIslands && !world.cave) {
      const u = rng() * SEG, v = rng() * SEG;
      place('floatingIsland', ox + u * STEP, Math.max(gridHeight(hs, u, v), world.seaLevel) + 140 + rng() * 240, oz + v * STEP);
    }
    if (world.underwater) { // where the sky would have balloons, the sea has fish
      for (let k = 0; k < 2; k++) {
        if (rng() > 0.3) continue;
        const u = rng() * SEG, v = rng() * SEG, g = gridHeight(hs, u, v);
        place('fishSchool', ox + u * STEP, g + 25 + rng() * Math.max(0, world.seaLevel - g - 60), oz + v * STEP);
      }
    } else if (rng() < 0.07 * world.balloons && !world.cave) { // nothing floats above a cave roof
      const u = rng() * SEG, v = rng() * SEG;
      place('hotAirBalloon', ox + u * STEP, Math.max(gridHeight(hs, u, v), world.seaLevel) + 90 + rng() * 200, oz + v * STEP);
    }

    for (const type in buckets) {
      const list = buckets[type];
      const im = new THREE.InstancedMesh(PROPS[type].geo, propMaterial, list.length);
      list.forEach((it, i) => {
        const m = it.meta;
        const s = (m.scale[0] + rng() * (m.scale[1] - m.scale[0])) * world.propScale * it.s;
        _e.set((rng() - 0.5) * m.tilt, rng() * Math.PI * 2, (rng() - 0.5) * m.tilt);
        _q.setFromEuler(_e);
        if (m.nonUniform) _s.set(s * (0.7 + rng() * 0.6), s * (0.5 + rng() * 0.7), s * (0.7 + rng() * 0.6));
        else _s.setScalar(s);
        _p.set(it.x, it.y - m.sink * s, it.z);
        // Anything standing in a crater was blown away (sky and sea props are out of reach).
        if (!m.sea && !AIRBORNE.has(type) && craterDepthAt(it.x, it.z) > 1) _s.setScalar(0);
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
