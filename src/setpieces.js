// Land set pieces: big landmarks that belong to one land. Volcano Land's fire geysers, Princess Kingdom's castle,
// meteors falling onto the Moon and Mars, Frozen Peaks' ice arches, the Tropical Archipelago's breaching whales and
// the Mushroom Forest's giant bounce mushrooms, the Autumn Woods' great windmill, Canyon Country's railway trestle, the Candy Kingdom's
// gumball machine and the Dune Sea's camel caravan.
// Fire geysers: Dark rock cones sit
// on the slopes above the lava; every so often one rumbles (its crater glows brighter, smoke and embers puff out) and
// then blows a tall pillar of fire straight up. Flying through the pillar scorches you; skimming past it, close but
// not in it, is a "Toasty!" near miss worth a few points. The effects are kept subtle: a warm glow, not a light show.
import * as THREE from 'three';
import { rand } from './texts.js';

export const GEYSER = {
  count: 5,              // vents kept around the player at once
  near: 260, far: 720,   // new vents appear this far ahead (out in the haze)
  drop: 1000,            // a vent this far behind is recycled
  dry: 6,                // only on rock at least this high above the lava
  idle: [5, 11],         // s between eruptions
  rumble: 1.6,           // s of warning (brighter crater, smoke, embers)
  blast: 2.4,            // s the pillar of fire lasts
  height: 110,           // how tall the pillar gets
  radius: 9,             // pillar radius that scorches
  dmg: 8,                // per scorch (x1.5 enemy damage = 12 hull), once per eruption
  nearMiss: 22,          // within this (but outside the pillar) while it blows: Toasty!
  nearScore: 15,
};

export const CASTLE = {
  near: 650, far: 950,    // a new castle appears this far ahead, out in the haze
  drop: 1600,             // and goes once it's this far behind
  half: 75,               // half the curtain walls' square
  slope: 30,              // the most the ground may rise and fall across its footprint
  wallH: 34, wallT: 8, base: 40,
  gateW: 36, gateH: 26,   // the way in
  towerR: 11, towerH: 80,
  keep: 44, keepH: 44, keepZ: -0.45, // the keep sits back, so there's room to climb over it after the gate
  dmg: 6,                 // a bump (x1.5 enemy damage = 9 hull), at most once per bumpEvery s
  bumpEvery: 1,
  gateScore: 50,
};

// Meteors (The Moon, Mars): every few seconds a burning rock streaks down at the ground somewhere ahead. A faint ring
// marks where it will land. Shoot it on the way down for points; left alone it digs a crater, and the blast hurts if
// you're close. Flying into one hurts too.
export const METEOR = {
  first: [3, 6],         // s before the first one in a land
  every: [5, 9],         // s between meteors
  max: 3,                // in the air at once
  ahead: [320, 700],     // where it lands, ahead of the player
  height: 420,           // starts this high above its landing spot
  speed: 95,             // m/s on the way down
  size: [5, 8],
  hp: 2,
  score: 20,             // shot down
  crater: [20, 7],       // radius, depth
  blast: 34,             // the impact hurts within this
  dmg: 8,                // x1.5 enemy damage = 12 hull (impact blast or ramming one)
};

// Ice arches (Frozen Peaks): a couple of great natural arches of blue ice stand in the valleys ahead, icicles hanging
// from their spans. Threading one is a "+30 Ice threader!", once per arch. The ice is solid: like the castle, a bump
// knocks a little hull and shoves you clear, never a wreck.
export const ARCH = {
  count: 2,              // arches around at once
  near: 450, far: 900,   // a new one appears this far ahead
  drop: 1300,
  apart: 400,            // arches keep at least this far from each other
  span: [70, 100],       // inner width of the opening
  rise: [28, 40],        // how high the arch's legs stand before the curve starts
  thick: 6,              // half the thickness of the ice
  score: 30,
  dmg: 6, bumpEvery: 1,  // x1.5 enemy damage = 9 hull, at most once a second
};

// Breaching whales (Tropical Archipelago): every so often the sea ahead froths white, then a great whale bursts out,
// arcs through the air with a lazy twist and crashes back in a big splash. Skimming close past one while it's in the
// air is a "+25 Whale watcher!", once per jump. The whale is solid: flying into it knocks a little hull (once per
// jump) and shoves you clear, never a wreck.
export const WHALE = {
  first: [3, 6],         // s before the first one in a land
  every: [6, 11],        // s between jumps
  max: 2,                // in the sea at once
  ahead: [260, 560],     // where it comes up, ahead of the player
  deep: 12,              // only where the sea is at least this deep (the whole jump)
  warn: 1.8,             // s of white froth before it breaks the surface
  height: [30, 44],      // how high its middle rises above the sea
  gravity: 28,
  speed: 14,             // m/s along its jump
  size: [1, 1.3],        // scale: about 40 m nose to flukes at 1
  radius: 5,             // body radius (x size) that's solid
  close: 16,             // within this of its body (but not touching) while it's up: Whale watcher!
  score: 25,
  dmg: 7,                // x1.5 enemy damage = 10.5 hull, once per jump
};

// Bounce mushrooms (Mushroom Forest): a few giant glowing toadstools tower over the forest ahead. Their caps are
// springy: touch one and it boings you up into the sky, nose lifted ("+15 Boing!", once per mushroom; more bounces
// are just for fun). Nothing here hurts: the stalks are soft and only nudge you aside.
export const SHROOM = {
  count: 3,              // around at once
  near: 380, far: 850,   // a new one appears this far ahead
  drop: 1300,
  apart: 260,            // they keep at least this far from each other
  stem: [45, 75],        // stalk height
  cap: [28, 38],         // cap radius
  capH: 0.55,            // cap height, x its radius
  lift: 0.8,             // s the bounce lifts you
  rise: 70,              // m/s up at the start of a bounce
  nose: 1.4,             // rad/s the nose is lifted, up to noseMax
  noseMax: 0.45,         // forward.y
  every: 2,              // s before the same cap bounces you again (so circling low over one isn't a pogo)
  score: 15,
};
// The great windmill (Autumn Woods): one huge old harvest mill stands on a rise ahead, its four canvas sails turning
// in the wind (faster in the gusts), shedding the odd autumn leaf. It faces you. Flying through the turning sails,
// between two of them, is a "+25 Through the sails!", once per mill. The sails, the tower and its roof are solid:
// a bump costs a little hull at most once a second and shoves you clear, never a wreck.
export const MILL = {
  near: 550, far: 900,   // a new mill appears this far ahead
  drop: 1500,
  foot: 18,              // footprint radius checked for flat ground
  slope: 10,             // the most the ground may rise and fall across it
  base: 10,              // stone foundation height (it also sinks 8 m into the ground)
  towerH: 58,
  hubZ: 15,              // the sails turn this far in front of the tower
  sail: 46,              // sail length from the hub
  sailW: 9,              // canvas width
  thick: 3,              // half the depth of the sails' plane that's solid
  spin: 0.45,            // rad/s, and up to gust x that in the gusts
  gust: 0.35,
  score: 25,
  dmg: 6, bumpEvery: 1,  // x1.5 enemy damage = 9 hull, at most once a second
};

// The trestle (Canyon Country): a tall timber railway trestle spans a gorge ahead, from a rocky bluff on one side to
// another, each with a tunnel mouth. Every so often a little steam train puffs out of one tunnel, rattles across and
// disappears into the other (its wheels turn, its chimney smokes, now and then it blows off steam). Flying under the
// deck between two of its bents is "+25 Under the trestle!", and skimming close past the engine is "+25 Racing the
// train!", each once per trestle. The deck, the bents, the bluffs and the train are solid: a bump costs a little hull
// at most once a second and shoves you clear, never a wreck.
export const TRESTLE = {
  near: 550, far: 950,   // a new trestle appears this far ahead, across your way
  drop: 1600,
  len: 240,              // deck length, bluff to bluff
  deep: 25,              // the gorge drops at least this far under the middle of the deck
  tries: 40,             // spots tried every half second (gorges that fit are rare)
  bentEvery: 24,
  deckW: 9,
  splay: 0.18,           // the bents widen this much per metre down
  speed: 20,             // the train, m/s
  wait: [3, 7],          // s before the next train comes out of the first tunnel
  width: 5, gauge: 3.4, wheel: 1.1,
  cars: [{ kind: 'loco', len: 16, h: 9 }, { kind: 'tender', len: 9, h: 6.5 }, { kind: 'coach', len: 15, h: 7.5 }, { kind: 'coach', len: 15, h: 7.5 }],
  gap: 1.6,              // between cars
  close: 16,             // m from the engine's middle: racing it
  score: 25,
  dmg: 6, bumpEvery: 1,  // x1.5 enemy damage = 9 hull, at most once a second
  steamEvery: [5, 9],
};

// The gumball machine (Candy Kingdom): a giant old penny gumball machine stands on a rise ahead, its glass globe
// heaped with gumballs. Every few seconds its big silver crank turns by itself, the gumballs churn, the chute's flap
// swings open and a huge gumball pops out and rolls away down the hills, spinning and bouncing as it goes. Shooting a
// rolling gumball pops it for "+10 Gumball popped!"; flying into one just splats it (sticky, harmless). The machine
// itself is solid: a bump costs a little hull at most once a second and shoves you clear, never a wreck.
export const GUMBALL = {
  near: 550, far: 900,   // a new machine appears this far ahead
  drop: 1500,
  foot: 16,              // footprint radius checked for flat ground
  slope: 10,             // the most the ground may rise and fall across it
  baseR: 13, baseH: 24,  // the red pedestal (it also sinks 8 m into the ground)
  globeR: 19,
  ball: 2.6,             // a rolling gumball's radius
  every: [4, 8],         // s between gumballs
  crank: 1.4,            // s for one turn of the crank
  max: 6,                // rolling at once
  push: 12,              // m/s out of the chute
  gravity: 30,
  roll: 0.15,            // rolling friction, per s
  life: 30,              // s before a gumball goes pop by itself
  score: 10,
  dmg: 6, bumpEvery: 1,  // x1.5 enemy damage = 9 hull, at most once a second
};
// The camel caravan (Dune Sea): a line of camels plods across the dunes ahead, a robed rider on the lead camel, rugs
// and packs on the rest, legs swinging, necks nodding, kicking up little puffs of sand. Each camel follows the dunes
// underfoot, tilting up and down their slopes, and the caravan rests at the end of its route. Buzzing low past the
// lead camel is "+25 Buzzing the caravan!", once per caravan. The camels are solid: a bump costs a little hull at most
// once a second and shoves you clear, never a wreck.
export const CARAVAN = {
  near: 500, far: 850,   // a new caravan appears this far ahead, crossing your way
  drop: 1500,
  route: 360,            // m it walks before it stops to rest
  camels: 5,
  spacing: 13,           // m between camels
  scale: 1.5,            // the camels are a bit larger than life, so you see them from the air
  speed: 2.6,            // m/s
  swing: 0.32,           // rad each leg swings fore and aft (the pace follows the ground covered, so feet never skate)
  leg: 3.8,              // hip to hoof, unscaled
  close: 15,             // m from the lead camel's middle: buzzing it
  score: 25,
  dmg: 6, bumpEvery: 1,  // x1.5 enemy damage = 9 hull, at most once a second
};
const GUM_COLORS = ['#ff4d8d', '#ffd23a', '#4dc4ff', '#7aff7a', '#b07aff', '#ff8a3a', '#ffffff'];

const _Y = new THREE.Vector3(0, 1, 0), _qb = new THREE.Quaternion();
const CAPS = ['#ff4dc4', '#7aff5a', '#4de8ff', '#b07aff'];

const _local = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Vector3();
const SPRAY = ['#ffffff', '#e8f6ff', '#bfe4ff'];
const FIRE = ['#ffd23a', '#ff8a1f', '#ff5a14'];
const SMOKE = ['#3a3030', '#4a4040', '#5a504c'];

export class SetPieces {
  constructor(G) {
    this.G = G;
    this.kind = null;
    this.list = [];
    this.meteors = [];
    this.arches = [];
    this.archT = 0;
    this.ice = new THREE.MeshLambertMaterial({ color: '#cbeaff', flatShading: true, transparent: true, opacity: 0.88 });
    this.ice2 = new THREE.MeshLambertMaterial({ color: '#9fd4f4', flatShading: true });
    this.iceGlow = new THREE.MeshBasicMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    this.whales = [];
    this.whaleT = 0;
    this.whaleSkin = new THREE.MeshLambertMaterial({ color: '#3f5f80', flatShading: true });
    this.whaleBelly = new THREE.MeshLambertMaterial({ color: '#d8e0e8', flatShading: true });
    this.whaleEye = new THREE.MeshBasicMaterial({ color: '#1d1d22' });
    this.whaleBody = new THREE.SphereGeometry(1, 12, 8);
    this.whaleTail = new THREE.ConeGeometry(1, 1, 8);
    this.whaleTail.rotateX(-Math.PI / 2); // points back along -z
    this.whaleFluke = new THREE.BoxGeometry(1, 1, 1);
    this.mill = null;
    this.millT = 0;
    this.millTip = false;
    this.millMats = null; // made with the first mill, so a run that never meets one never builds them
    this.trestle = null;
    this.trestleT = 0;
    this.trestleTip = false;
    this.trestleMats = null; // made with the first trestle, like the mill's
    this.gum = null;
    this.gumT = 0;
    this.gumTip = false;
    this.gumBumpTip = false;
    this.gumMats = null; // made with the first machine, like the mill's
    this.caravan = null;
    this.caravanT = 0;
    this.caravanTip = false;
    this.caravanMats = null; // made with the first caravan, like the mill's
    this.shrooms = [];
    this.shroomT = 0;
    this.liftT = 0;
    this.stemGeo = new THREE.CylinderGeometry(0.75, 1, 1, 10);
    this.stemGeo.translate(0, 0.5, 0);
    this.capGeo = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.gillGeo = new THREE.CircleGeometry(1, 18);
    this.gillGeo.rotateX(Math.PI / 2); // faces down
    this.spotGeo = new THREE.SphereGeometry(1, 6, 4);
    this.stemMat = new THREE.MeshLambertMaterial({ color: '#efe6d6', flatShading: true });
    this.gillMat = new THREE.MeshLambertMaterial({ color: '#c9b8c8', side: THREE.DoubleSide });
    this.spotMat = new THREE.MeshBasicMaterial({ color: '#fff6e8' });
    this.capMats = CAPS.map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: c, emissiveIntensity: 0.25 }));
    this.frothGeo = new THREE.CircleGeometry(0.85, 24);
    this.frothGeo.rotateX(-Math.PI / 2);
    this.whaleTip = false;
    this.shroomTip = false;
    this.meteorT = 0;
    this.meteorGeo = new THREE.DodecahedronGeometry(1, 0);
    this.meteorRock = new THREE.MeshLambertMaterial({ color: '#4a3a34', flatShading: true });
    this.meteorCore = new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 32);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.tip = false;
    this.rock = new THREE.MeshLambertMaterial({ color: '#2e2426', flatShading: true });
    this.rock2 = new THREE.MeshLambertMaterial({ color: '#3c2e2c', flatShading: true });
    this.coneGeo = new THREE.ConeGeometry(16, 22, 7, 1, true);
    this.lipGeo = new THREE.CylinderGeometry(5.2, 7, 3, 7, 1, true);
    this.mouthGeo = new THREE.CircleGeometry(5, 10);
    this.bumpGeo = new THREE.DodecahedronGeometry(1, 0);
    this.pillarGeo = new THREE.CylinderGeometry(1, 1.15, 1, 10, 1, true); // scaled by GEYSER.radius: what you see is what scorches
    this.pillarGeo.translate(0, 0.5, 0); // grows up from its base
  }

  // The current zone's set piece (null removes them all). Every zone entry starts afresh: the land under the old vents
  // was just reseeded, even when it's the same zone again (developer menu).
  configure(kind) {
    this.kind = kind || null;
    while (this.list.length) this.remove(this.list.length - 1);
    this.dropCastle();
    this.siteT = 0;
    while (this.meteors.length) this.dropMeteor(0);
    this.meteorT = rand(...METEOR.first);
    while (this.arches.length) this.dropArch(0);
    this.archT = 0;
    while (this.whales.length) this.dropWhale(0);
    this.whaleT = rand(...WHALE.first);
    this.dropMill();
    this.millT = 0;
    this.dropTrestle();
    this.trestleT = 0;
    this.dropGumball();
    this.gumT = 0;
    this.dropCaravan();
    this.caravanT = 0;
    while (this.shrooms.length) this.dropShroom(0);
    this.shroomT = 0;
    this.liftT = 0;
  }

  get geysers() { return this.kind === 'geysers' ? this.list : []; }

  // Dry rock high enough above the lava sea, or null.
  ground(x, z) {
    const h = this.G.terrain.surfaceHeight(x, z), sea = this.G.world.seaLevel;
    return h >= sea + GEYSER.dry ? h : null;
  }

  spawnGeyser(x, z, h) {
    const g = new THREE.Group();
    g.position.set(x, h - 4, z); // sunk a little so it sits on a slope
    const cone = new THREE.Mesh(this.coneGeo, this.rock);
    cone.position.y = 11;
    cone.scale.set(1, 1, 1);
    g.add(cone);
    const lip = new THREE.Mesh(this.lipGeo, this.rock2);
    lip.position.y = 21.5;
    g.add(lip);
    for (let k = 0; k < 5; k++) { // a few boulders round the foot
      const b = new THREE.Mesh(this.bumpGeo, k % 2 ? this.rock : this.rock2);
      const a = (k / 5) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(12, 17);
      b.position.set(Math.cos(a) * r, rand(1, 3), Math.sin(a) * r);
      b.scale.setScalar(rand(2.5, 4.5));
      b.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      g.add(b);
    }
    // The crater: a dim orange glow that brightens while it rumbles.
    const glow = new THREE.MeshBasicMaterial({ color: '#ff5a14', transparent: true, opacity: 0.55, depthWrite: false });
    const mouth = new THREE.Mesh(this.mouthGeo, glow);
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.y = 22.6;
    g.add(mouth);
    // The pillar: a soft additive column under the particles, so the danger reads from far off.
    const fire = new THREE.MeshBasicMaterial({ color: '#ff8a1f', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const pillar = new THREE.Mesh(this.pillarGeo, fire);
    pillar.position.y = 22.6;
    pillar.scale.set(GEYSER.radius, 0.01, GEYSER.radius);
    pillar.visible = false;
    g.add(pillar);
    g.rotation.y = rand(0, 6);
    this.G.scene.add(g);
    this.list.push({
      group: g, glow, fire, pillar, state: 'idle', t: rand(1, GEYSER.idle[1]), hit: false, close: false,
      mouth: new THREE.Vector3(x, h - 4 + 22.6, z),
    });
  }

  remove(i) {
    const v = this.list[i];
    this.G.scene.remove(v.group);
    v.glow.dispose(); v.fire.dispose();
    this.list.splice(i, 1);
  }

  // Top up the vents out of sight ahead, so the land always has a few on its slopes.
  topUp() {
    if (this.list.length >= GEYSER.count) return;
    const p = this.G.player;
    const f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const side = new THREE.Vector3(-f.z, 0, f.x);
    for (let tries = 0; tries < 6 && this.list.length < GEYSER.count; tries++) {
      const d = rand(GEYSER.near, GEYSER.far), s = rand(-0.8, 0.8) * d;
      const x = p.pos.x + f.x * d + side.x * s, z = p.pos.z + f.z * d + side.z * s;
      const h = this.ground(x, z);
      if (h === null) continue;
      if (this.list.some((v) => (v.mouth.x - x) ** 2 + (v.mouth.z - z) ** 2 < 140 ** 2)) continue; // keep them apart
      this.spawnGeyser(x, z, h);
    }
  }

  update(dt) {
    if (this.kind === 'castle') { this.updateCastle(dt); return; }
    if (this.kind === 'meteors') { this.updateMeteors(dt); return; }
    if (this.kind === 'arches') { this.updateArches(dt); return; }
    if (this.kind === 'whales') { this.updateWhales(dt); return; }
    if (this.kind === 'mushrooms') { this.updateShrooms(dt); return; }
    if (this.kind === 'windmill') { this.updateMill(dt); return; }
    if (this.kind === 'trestle') { this.updateTrestle(dt); return; }
    if (this.kind === 'gumball') { this.updateGumball(dt); return; }
    if (this.kind === 'caravan') { this.updateCaravan(dt); return; }
    if (this.kind !== 'geysers') return;
    const G = this.G, p = G.player;
    if (!G.terrain.stale) this.topUp(); // not while a new land is still forming under the fog bank
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      const dx = v.mouth.x - p.pos.x, dz = v.mouth.z - p.pos.z;
      if (dx * dx + dz * dz > GEYSER.drop ** 2) { this.remove(i); continue; }
      v.t -= dt;
      if (v.state === 'idle') {
        v.glow.opacity = 0.45 + 0.1 * Math.sin(G.time * 1.3 + i);
        if (v.t <= 0) { v.state = 'rumble'; v.t = GEYSER.rumble; }
      } else if (v.state === 'rumble') {
        const k = 1 - v.t / GEYSER.rumble;
        v.glow.opacity = 0.55 + 0.4 * k;
        // Particle counts are per second (emit rounds a fraction up by chance), so the density doesn't follow the frame rate.
        G.fx.emit(v.mouth, 15 * dt, { colors: SMOKE, speed: 4, up: 14, life: 1.6, size: 10, drag: 0.8 });
        G.fx.emit(v.mouth, 18 * k * dt, { colors: FIRE, speed: 10, up: 22, life: 0.7, size: 3, gravity: -30 });
        if (v.t <= 0) { v.state = 'blast'; v.t = GEYSER.blast; v.hit = false; v.close = false; v.pillar.visible = true; }
      } else if (v.state === 'blast') {
        const age = GEYSER.blast - v.t, grow = Math.min(1, age / 0.35), fade = Math.min(1, v.t / 0.5);
        v.pillar.scale.y = GEYSER.height * grow;
        v.fire.opacity = 0.32 * fade;
        v.glow.opacity = 0.95;
        G.fx.emit(v.mouth, 90 * dt, { colors: FIRE, speed: 9, up: GEYSER.height * 0.75, life: 1.1, size: 8, drag: 0.5 });
        G.fx.emit(v.mouth, 12 * dt, { colors: SMOKE, speed: 6, up: GEYSER.height * 0.6, life: 1.8, size: 13, drag: 0.6 });
        this.touch(v, grow * fade);
        if (v.t <= 0) { v.state = 'idle'; v.t = rand(...GEYSER.idle); v.pillar.visible = false; v.fire.opacity = 0; }
      }
    }
  }

  // The player against one erupting pillar: inside it scorches (once per eruption), close beside it is a near miss.
  touch(v, strength) {
    const G = this.G, p = G.player;
    if (p.dead || strength < 0.3) return;
    const up = p.pos.y - v.mouth.y;
    if (up < -4 || up > GEYSER.height * strength + 6) return;
    const r = Math.hypot(p.pos.x - v.mouth.x, p.pos.z - v.mouth.z);
    if (r < GEYSER.radius + (p.sizeScale || 1)) {
      if (v.hit) return;
      v.hit = true;
      p.damage(GEYSER.dmg);
      G.fx.emit(p.pos, 20, { colors: FIRE, speed: 25, life: 0.6, size: 5 });
      if (!this.tip) { this.tip = true; G.ui.notify('Fire geysers scorch! Watch for a glowing, smoking crater and fly round it.', 'warn', 4, 1); }
    } else if (r < GEYSER.nearMiss && !v.close && !v.hit) {
      v.close = true;
      G.score += GEYSER.nearScore;
      G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${GEYSER.nearScore} Toasty!`);
    }
  }

  // ---- Princess Kingdom: the castle ------------------------------------------------------------------------------
  // One huge fairy-tale castle at a time, out ahead of you: a square of pink curtain walls with a round tower at each
  // corner, a tall keep in the middle and a gate in the front wall. The stone is solid (a bump costs a little hull and
  // shoves you clear, it never wrecks the plane); flying in through the gate is a "Royal welcome!" bonus, once.

  get castleInfo() { return this.castle; }

  dropCastle() {
    const c = this.castle;
    if (!c) return;
    this.G.scene.remove(c.group);
    c.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of c.mats) m.dispose();
    this.castle = null;
  }

  placeCastle() {
    const p = this.G.player, f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    for (let tries = 0; tries < 6; tries++) {
      const d = rand(CASTLE.near, CASTLE.far), s = rand(-0.5, 0.5) * d;
      const x = p.pos.x + f.x * d - f.z * s, z = p.pos.z + f.z * d + f.x * s;
      // The footprint's corners and middle: on dry ground, and not on a steep hillside.
      const hs = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => this.G.terrain.surfaceHeight(x + a * CASTLE.half, z + b * CASTLE.half));
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (lo < this.G.world.seaLevel + 2 || hi - lo > CASTLE.slope) continue;
      // Face the gate back toward where you're coming from, so the way in is the first thing you see, and make sure
      // the ground in front of the gate is level with it (not burying the way in, nor leaving it on stilts).
      const y = (lo + hs[0]) / 2, yaw = Math.atan2(p.pos.x - x, p.pos.z - z), gz = CASTLE.half + 12;
      if (Math.abs(this.G.terrain.surfaceHeight(x + Math.sin(yaw) * gz, z + Math.cos(yaw) * gz) - y) > 6) continue;
      this.buildCastle(x, y, z, yaw);
      return;
    }
  }

  buildCastle(x, y, z, yaw) {
    const g = new THREE.Group(), mats = [];
    const mat = (color, o = {}) => { const m = o.basic ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: !o.basic }) : new THREE.MeshLambertMaterial({ color, flatShading: true }); mats.push(m); return m; };
    const stone = mat('#f2d8e4'), stone2 = mat('#e6c2d4'), roof = mat('#d9649e'), roof2 = mat('#b84f86'), gold = mat('#f0c860');
    const glass = mat('#ffe6a8', { basic: true, opacity: 0.75 }), flagM = mat('#ff7fb8', { basic: true, side: THREE.DoubleSide });
    const add = (geo, m, px, py, pz, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.y = ry; g.add(o); return o; };
    const C = CASTLE, H = C.half, W = C.wallH, T = C.wallT, B = C.base; // walls go down B below the ground, for slopes
    const solids = [], flags = [];
    const box = (cx, cz, sx, sz, top, bottom = -B) => solids.push({ box: true, x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2, y0: bottom, y1: top });
    const crenels = (len, px, pz, alongX, top) => { // little battlements along a wall top
      for (let t = -len / 2 + 3; t < len / 2 - 2; t += 7) add(new THREE.BoxGeometry(3.4, 3.4, T + 0.6), stone2, alongX ? px + t : px, top + 1.7, alongX ? pz : pz + t, alongX ? 0 : Math.PI / 2);
    };
    // Curtain walls. The front one (+z, the gate side) is two halves and a lintel over the gate.
    const gw = C.gateW, gh = C.gateH, side = (2 * H - gw) / 2;
    for (const sx of [-1, 1]) {
      const cx = sx * (gw / 2 + side / 2);
      add(new THREE.BoxGeometry(side, W + B, T), stone, cx, (W - B) / 2, H); box(cx, H, side, T, W);
    }
    add(new THREE.BoxGeometry(gw, W - gh, T), stone, 0, (W + gh) / 2, H); box(0, H, gw, T, W, gh);
    add(new THREE.BoxGeometry(gw + 6, 2.4, T + 1.6), gold, 0, gh + 1.2, H); // gilded arch line over the gate
    crenels(2 * H, 0, H, true, W);
    add(new THREE.BoxGeometry(2 * H, W + B, T), stone, 0, (W - B) / 2, -H); box(0, -H, 2 * H, T, W); crenels(2 * H, 0, -H, true, W);
    for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(T, W + B, 2 * H), stone, sx * H, (W - B) / 2, 0); box(sx * H, 0, T, 2 * H, W); crenels(2 * H, sx * H, 0, false, W); }
    // Towers: round, with a pointed roof, a gold finial and a pennant.
    const tower = (tx, tz, r, h, rm) => {
      add(new THREE.CylinderGeometry(r, r * 1.08, h + B, 10), stone, tx, (h - B) / 2, tz);
      add(new THREE.CylinderGeometry(r * 1.18, r * 1.18, 3, 10), stone2, tx, h + 1.5, tz);
      add(new THREE.ConeGeometry(r * 1.3, r * 3.2, 10), rm, tx, h + 3 + r * 1.6, tz);
      add(new THREE.SphereGeometry(1.4, 6, 4), gold, tx, h + 3 + r * 3.2 + 0.8, tz);
      const pole = h + 3 + r * 3.2 + 1.6;
      add(new THREE.CylinderGeometry(0.25, 0.25, 7, 4), gold, tx, pole + 3.5, tz);
      const fl = add(new THREE.PlaneGeometry(7, 3.2), flagM, tx + 3.6, pole + 5.4, tz);
      flags.push({ mesh: fl, phase: rand(0, 6), x: tx });
      for (let k = 0; k < 3; k++) { // a ring of warm windows, faint
        const a = (k / 3) * Math.PI * 2 + 0.5, wy = h * (0.45 + 0.2 * k);
        add(new THREE.BoxGeometry(1.6, 3, 0.4), glass, tx + Math.sin(a) * (r + 0.1), wy, tz + Math.cos(a) * (r + 0.1), a);
      }
      solids.push({ x: tx, z: tz, r: r * 1.15, y0: -B, y1: h + 3 + r * 2.2 }); // the roof's lower half counts too
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tower(sx * H, sz * H, C.towerR, C.towerH, roof);
    for (const sx of [-1, 1]) tower(sx * (gw / 2 + 5), H + 1, 6, W + 12, roof2); // the gatehouse towers
    // The keep in the courtyard: a big block with its own tall tower.
    const K = C.keep;
    add(new THREE.BoxGeometry(K, C.keepH + B, K), stone2, 0, (C.keepH - B) / 2, H * C.keepZ); box(0, H * C.keepZ, K, K, C.keepH);
    crenels(K, 0, H * C.keepZ + K / 2, true, C.keepH);
    tower(0, H * C.keepZ, 10, C.keepH + 40, roof);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.G.scene.add(g);
    this.castle = { group: g, mats, solids, flags, pos: g.position, yaw, welcomed: false, bumpT: 0, inside: false, prevZ: null };
  }

  // The player in the castle's own frame (gate on +z).
  castleLocal(c, out) {
    const p = this.G.player.pos, dx = p.x - c.pos.x, dz = p.z - c.pos.z, cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw);
    out.set(dx * cs + dz * sn, p.y - c.pos.y, -dx * sn + dz * cs);
    return out;
  }

  updateCastle(dt) {
    const G = this.G, p = G.player;
    let c = this.castle;
    if (c && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > CASTLE.drop) { this.dropCastle(); c = null; }
    if (!c) { // look for a site twice a second, not every frame
      if (!G.terrain.stale && (this.siteT = (this.siteT || 0) - dt) <= 0) { this.siteT = 0.5; this.placeCastle(); }
      return;
    }
    for (const f of c.flags) f.mesh.rotation.y = 0.25 * Math.sin(G.time * 2.2 + f.phase); // a lazy flutter
    c.bumpT = Math.max(0, c.bumpT - dt);
    if (p.dead) { c.prevZ = null; return; }
    const L = this.castleLocal(c, _local), r = 2.5 * (p.sizeScale || 1);
    // The gate: crossing the front wall's line inside the opening, heading in.
    const C = CASTLE;
    if (c.prevZ !== null && c.prevZ > C.half && L.z <= C.half && Math.abs(L.x) < C.gateW / 2 && L.y < C.gateH && L.y > -2 && !c.welcomed) {
      c.welcomed = true;
      G.score += C.gateScore;
      G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${C.gateScore} Royal welcome!`);
      G.fx.emit(p.pos, 40, { colors: ['#ff9ccf', '#ffffff', '#f0c860'], speed: 22, life: 1.2, size: 4, gravity: -8 });
    }
    c.prevZ = L.z;
    // Solid stone: push out of anything you're inside, with a small knock once a second.
    for (const s of c.solids) {
      if (L.y < s.y0 - r || L.y > s.y1 + r) continue;
      let px = 0, pz = 0;
      if (s.box) {
        if (L.x < s.x0 - r || L.x > s.x1 + r || L.z < s.z0 - r || L.z > s.z1 + r) continue;
        const outs = [[s.x0 - r - L.x, 0], [s.x1 + r - L.x, 0], [0, s.z0 - r - L.z], [0, s.z1 + r - L.z]];
        const top = s.y1 + r - L.y; // over the wall top is a way out too
        let best = outs[0];
        for (const o of outs) if (Math.abs(o[0] + o[1]) < Math.abs(best[0] + best[1])) best = o;
        if (top < Math.abs(best[0] + best[1])) { p.pos.y += top; this.castleLocal(c, L); this.bump(c); continue; }
        [px, pz] = best;
      } else {
        const dx = L.x - s.x, dz = L.z - s.z, d = Math.hypot(dx, dz), rr = s.r + r;
        if (d >= rr) continue;
        const k = d > 1e-3 ? (rr - d) / d : rr;
        px = d > 1e-3 ? dx * k : rr; pz = d > 1e-3 ? dz * k : 0;
      }
      // Back to the world's frame.
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      p.pos.x += px * cs + pz * sn; p.pos.z += -px * sn + pz * cs;
      this.castleLocal(c, L);
      this.bump(c);
    }
  }

  bump(c) {
    if (c.bumpT > 0) return;
    c.bumpT = CASTLE.bumpEvery;
    const G = this.G;
    G.player.damage(CASTLE.dmg);
    G.fx.emit(G.player.pos, 18, { colors: ['#f2d8e4', '#e6c2d4', '#ffffff'], speed: 20, life: 0.8, size: 4 });
    if (!this.castleTip) { this.castleTip = true; G.ui.notify('Castle walls are solid! Try the front gate instead.', 'warn', 4, 1); }
  }

  // ---- The Moon and Mars: meteors ---------------------------------------------------------------------------------
  get meteorList() { return this.meteors; }

  // target: where it will land (world x, z); defaults to a spot ahead of the player.
  spawnMeteor(tx, tz) {
    const G = this.G, p = G.player;
    if (tx === undefined) {
      const f = p.forward.clone().setY(0);
      if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
      f.normalize();
      const d = rand(...METEOR.ahead), s = rand(-0.4, 0.4) * d;
      tx = p.pos.x + f.x * d - f.z * s; tz = p.pos.z + f.z * d + f.x * s;
    }
    const ty = G.terrain.surfaceHeight(tx, tz), target = new THREE.Vector3(tx, ty, tz);
    // It comes in at a slant from a random side, so the streak reads against the sky.
    const a = rand(0, Math.PI * 2), slant = 0.55;
    const from = target.clone().add(new THREE.Vector3(Math.cos(a) * METEOR.height * slant, METEOR.height, Math.sin(a) * METEOR.height * slant));
    const vel = target.clone().sub(from).normalize().multiplyScalar(METEOR.speed);
    const size = rand(...METEOR.size);
    const g = new THREE.Group();
    const rock = new THREE.Mesh(this.meteorGeo, this.meteorRock);
    rock.scale.set(size, size * 0.85, size * 1.1);
    g.add(rock);
    const core = new THREE.Mesh(this.meteorGeo, this.meteorCore); // a soft hot glow around it
    core.scale.setScalar(size * 1.35);
    g.add(core);
    g.position.copy(from);
    G.scene.add(g);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ff9a4a', transparent: true, opacity: 0, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.set(tx, ty + 0.6, tz);
    ring.scale.setScalar(METEOR.blast);
    G.scene.add(ring);
    const total = from.distanceTo(target) / METEOR.speed;
    this.meteors.push({ group: g, rock, pos: g.position, vel, target, size, hp: METEOR.hp, ring, ringMat, t: 0, total, trailAcc: 0 });
    return this.meteors.at(-1);
  }

  dropMeteor(i) {
    const m = this.meteors[i];
    this.G.scene.remove(m.group);
    this.G.scene.remove(m.ring);
    m.ringMat.dispose();
    this.meteors.splice(i, 1);
  }

  updateMeteors(dt) {
    const G = this.G, p = G.player;
    if (!G.terrain.stale && (this.meteorT -= dt) <= 0) {
      this.meteorT = rand(...METEOR.every);
      if (this.meteors.length < METEOR.max && !p.dead) this.spawnMeteor();
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      m.pos.addScaledVector(m.vel, dt);
      m.rock.rotation.x += 2.1 * dt; m.rock.rotation.z += 1.3 * dt;
      // The landing ring fades in as it comes down (faint, a hint rather than a siren).
      m.ringMat.opacity = 0.35 * Math.min(1, m.t / m.total);
      // A short warm trail, emitted per second.
      G.fx.emit(m.pos, 24 * dt, { colors: ['#ffd23a', '#ff8a1f', '#a05a3a'], speed: 3, life: 0.7, size: m.size * 0.7, drag: 1.5 });
      G.fx.emit(m.pos, 6 * dt, { colors: ['#5a4a44', '#6a5a50'], speed: 2, life: 1.4, size: m.size, drag: 1 });
      if (!p.dead && m.pos.distanceTo(p.pos) < m.size + 3 * (p.sizeScale || 1)) { // rammed
        p.damage(METEOR.dmg);
        G.fx.explosion(m.pos);
        this.dropMeteor(i);
        continue;
      }
      let shot = false;
      for (let b = p.bullets.length - 1; b >= 0; b--) {
        if (p.bullets[b].pos.distanceToSquared(m.pos) < (m.size + 2) ** 2) {
          m.hp -= p.bullets[b].dmg || 1;
          p.removeBullet(b);
          G.fx.sparkle(m.pos, '#ffb070');
          if (m.hp <= 0) { shot = true; break; }
        }
      }
      if (shot) {
        G.score += METEOR.score;
        G.fx.explosion(m.pos);
        G.fx.emit(m.pos, 30, { colors: ['#5a4a44', '#7a6a58', '#ff8a1f'], speed: 35, life: 1.4, size: 4, gravity: -20 });
        G.fx.popText(m.pos.clone(), `+${METEOR.score} Meteor smashed!`);
        G.audio.explode?.();
        if (!this.meteorTip) { this.meteorTip = true; G.ui.notify('Nice shot! Meteors are worth points if you hit them before they land.', 'info', 4, 1); }
        this.dropMeteor(i);
        continue;
      }
      if (m.pos.y <= m.target.y + m.size * 0.3 || m.t >= m.total) this.impact(i);
    }
  }

  impact(i) {
    const G = this.G, p = G.player, m = this.meteors[i], at = m.target;
    G.terrain.deform(at.x, at.z, ...METEOR.crater);
    G.fx.explosion(at);
    G.fx.emit(at, 60, { colors: ['#8a7a6a', '#6a5a50', '#a89888'], speed: 40, life: 2, size: 9, up: 20, gravity: -15 });
    const d = p.pos.distanceTo(at);
    if (d < 260) { G.shake?.(0.6 * (1 - d / 260), 0.35); G.audio.explode?.(); }
    if (!p.dead && d < METEOR.blast) {
      p.damage(METEOR.dmg);
      if (!this.meteorHitTip) { this.meteorHitTip = true; G.ui.notify('Meteors leave craters! Shoot them down, or steer clear of the glowing rings.', 'warn', 4, 1); }
    }
    this.dropMeteor(i);
  }

  // ---- Frozen Peaks: ice arches -----------------------------------------------------------------------------------
  get archList() { return this.arches; }

  placeArch() {
    const G = this.G, p = G.player, f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    for (let tries = 0; tries < 4; tries++) {
      const d = rand(ARCH.near, ARCH.far), s = rand(-0.5, 0.5) * d;
      const x = p.pos.x + f.x * d - f.z * s, z = p.pos.z + f.z * d + f.x * s;
      if (this.arches.some((a) => Math.hypot(a.pos.x - x, a.pos.z - z) < ARCH.apart)) continue;
      // Square on to the way you're flying, so the opening faces you.
      if (this.buildArch(x, z, Math.atan2(f.x, f.z), rand(...ARCH.span), rand(...ARCH.rise))) return;
    }
  }

  // An arch centred on (x, z), its opening facing along yaw: legs at local x = +-(R + t), the curve's centre at local
  // height `spring` (above the higher leg's ground), radius R + t through the middle of the ice.
  buildArch(x, z, yaw, span, rise) {
    const G = this.G, t = ARCH.thick, R = span / 2 + t, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const legGround = [-1, 1].map((k) => G.terrain.surfaceHeight(x + k * R * cs, z - k * R * sn));
    const base = Math.min(...legGround), spring = Math.max(...legGround) + rise - base; // local heights from `base`
    if (G.terrain.surfaceHeight(x, z) - base > spring - 15) return null; // a hill in the way: the opening would be buried
    const g = new THREE.Group(), geos = [];
    const mesh = (geo, m) => { geos.push(geo); const o = new THREE.Mesh(geo, m); g.add(o); return o; };
    for (const k of [-1, 1]) { // the legs, flaring out at the foot
      const h = spring + 20;
      const leg = mesh(new THREE.CylinderGeometry(t, t * 1.6, h, 7), this.ice);
      leg.position.set(k * R, spring - h / 2, 0);
    }
    const span3 = mesh(new THREE.TorusGeometry(R, t, 6, 24, Math.PI), this.ice); // the curve
    span3.position.y = spring;
    const glow = mesh(new THREE.TorusGeometry(R, t * 1.5, 6, 24, Math.PI), this.iceGlow); // a faint frosty halo
    glow.position.y = spring;
    for (let k = 0; k < 9; k++) { // icicles under the span
      const a = 0.25 + (k / 8) * (Math.PI - 0.5), len = rand(4, 10);
      const ic = mesh(new THREE.ConeGeometry(rand(0.8, 1.4), len, 5), this.ice2);
      ic.rotation.x = Math.PI; // point down
      ic.position.set(Math.cos(a) * (R - t), spring + Math.sin(a) * (R - t) - len / 2, rand(-t * 0.5, t * 0.5));
    }
    g.position.set(x, base, z);
    g.rotation.y = yaw;
    G.scene.add(g);
    this.arches.push({ group: g, geos, pos: g.position, yaw, R, spring, threaded: false, bumpT: 0, prevZ: null });
    return this.arches.at(-1);
  }

  dropArch(i) {
    const a = this.arches[i];
    this.G.scene.remove(a.group);
    for (const geo of a.geos) geo.dispose();
    this.arches.splice(i, 1);
  }

  // The player in an arch's frame: x across the opening, y up from its base, z through it.
  archLocal(a, out) {
    const p = this.G.player.pos, dx = p.x - a.pos.x, dz = p.z - a.pos.z, cs = Math.cos(-a.yaw), sn = Math.sin(-a.yaw);
    return out.set(dx * cs + dz * sn, p.y - a.pos.y, -dx * sn + dz * cs);
  }

  updateArches(dt) {
    const G = this.G, p = G.player;
    for (let i = this.arches.length - 1; i >= 0; i--) {
      if (Math.hypot(this.arches[i].pos.x - p.pos.x, this.arches[i].pos.z - p.pos.z) > ARCH.drop) this.dropArch(i);
    }
    if (this.arches.length < ARCH.count && !G.terrain.stale && (this.archT -= dt) <= 0) { this.archT = 0.5; this.placeArch(); }
    if (p.dead) { for (const a of this.arches) a.prevZ = null; return; }
    const r = 2.5 * (p.sizeScale || 1), t = ARCH.thick;
    for (const a of this.arches) {
      a.bumpT = Math.max(0, a.bumpT - dt);
      const L = this.archLocal(a, _local);
      // Threading: crossing the arch's plane inside the opening (under the curve, between the legs).
      const inner = a.R - t - r, h = L.y - a.spring;
      const inside = Math.abs(L.x) < inner && (h < 0 ? L.y > 0 : Math.hypot(L.x, h) < inner);
      if (a.prevZ !== null && Math.sign(a.prevZ) !== Math.sign(L.z) && inside && !a.threaded) {
        a.threaded = true;
        G.score += ARCH.score;
        G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${ARCH.score} Ice threader!`);
        G.fx.emit(p.pos, 40, { colors: ['#ffffff', '#cbeaff', '#9fd4f4'], speed: 20, life: 1.2, size: 4, gravity: -6 });
      }
      a.prevZ = L.z;
      if (Math.abs(L.z) > t + r) continue; // nowhere near the ice
      // The ice: the curve (a half ring) and the two legs below it.
      let px = 0, py = 0;
      if (h >= 0) {
        const d = Math.hypot(L.x, h), gap = Math.abs(d - a.R);
        if (gap >= t + r || d < 1e-3) continue;
        const push = (t + r - gap) * Math.sign(d - a.R || 1) / d; // straight out of the ring, in or out
        px = L.x * push; py = h * push;
      } else {
        const leg = Math.sign(L.x || 1) * a.R, gap = Math.abs(L.x - leg);
        if (gap >= t * 1.3 + r) continue;
        px = (t * 1.3 + r - gap) * Math.sign(L.x - leg || -Math.sign(L.x || 1));
      }
      const cs = Math.cos(a.yaw), sn = Math.sin(a.yaw);
      p.pos.x += px * cs; p.pos.z += -px * sn; p.pos.y += py;
      if (a.bumpT > 0) continue;
      a.bumpT = ARCH.bumpEvery;
      p.damage(ARCH.dmg);
      G.fx.emit(p.pos, 18, { colors: ['#ffffff', '#cbeaff'], speed: 18, life: 0.8, size: 4 });
      if (!this.archTip) { this.archTip = true; G.ui.notify('Ice is hard! Thread the arch through the middle for points.', 'warn', 4, 1); }
    }
  }
  // ---- Tropical Archipelago: breaching whales ---------------------------------------------------------------------
  get whaleList() { return this.whales; }

  // A spot ahead with deep water for a whole jump, crossing your path side-on so you see it, or null.
  placeWhale() {
    const G = this.G, p = G.player, sea = G.world.seaLevel, f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    for (let tries = 0; tries < 6; tries++) {
      const d = rand(...WHALE.ahead), s = rand(-0.4, 0.4) * d;
      const x = p.pos.x + f.x * d - f.z * s, z = p.pos.z + f.z * d + f.x * s;
      const yaw = Math.atan2(f.x, f.z) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2 + rand(-0.6, 0.6);
      const run = 70; // about how far one jump carries it
      const deep = [0, 0.5, 1].every((k) => G.terrain.surfaceHeight(x + Math.sin(yaw) * run * k, z + Math.cos(yaw) * run * k) < sea - WHALE.deep);
      if (deep && !this.whales.some((w) => Math.hypot(w.x0 - x, w.z0 - z) < 120)) return this.spawnWhale(x, z, yaw);
    }
    return null;
  }

  // A whale that will come up at (x, z), heading along yaw. Its body runs along local +z (the nose).
  spawnWhale(x, z, yaw) {
    const G = this.G, sea = G.world.seaLevel, s = rand(...WHALE.size), g = new THREE.Group();
    const part = (geo, mat, px, py, pz, sx, sy, sz, rx = 0, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, 0);
      g.add(m);
    };
    part(this.whaleBody, this.whaleSkin, 0, 0, 0, 5, 4.6, 14);
    part(this.whaleBody, this.whaleBelly, 0, -1.2, 0.8, 4.6, 3.9, 13);
    part(this.whaleTail, this.whaleSkin, 0, 0.3, -18, 2.6, 2.2, 10);
    part(this.whaleFluke, this.whaleSkin, 3.6, 0.4, -23.5, 7, 0.7, 3, 0, 0.35);
    part(this.whaleFluke, this.whaleSkin, -3.6, 0.4, -23.5, 7, 0.7, 3, 0, -0.35);
    part(this.whaleFluke, this.whaleSkin, 5, -2.4, 4, 6, 0.6, 2.4, 0, -0.5); // flippers
    part(this.whaleFluke, this.whaleSkin, -5, -2.4, 4, 6, 0.6, 2.4, 0, 0.5);
    part(this.whaleBody, this.whaleEye, 4.2, 0.6, 9.5, 0.6, 0.6, 0.6);
    part(this.whaleBody, this.whaleEye, -4.2, 0.6, 9.5, 0.6, 0.6, 0.6);
    g.scale.setScalar(s);
    g.rotation.order = 'YXZ';
    g.visible = false;
    G.scene.add(g);
    const foamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    const foam = new THREE.Mesh(this.ringGeo, foamMat);
    foam.position.set(x, sea + 0.4, z);
    foam.scale.setScalar(14 * s);
    const frothMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    foam.add(new THREE.Mesh(this.frothGeo, frothMat)); // a soft white patch inside the ring
    G.scene.add(foam);
    const rise = rand(...WHALE.height), sink = 12 * s; // it starts this far under the surface
    const vy = Math.sqrt(2 * WHALE.gravity * (rise + sink));
    const w = { group: g, pos: g.position, s, yaw, x0: x, z0: z, y0: sea - sink, vy, state: 'warn', t: WHALE.warn, foam, foamMat, frothMat, passed: false, hit: false, splashed: false, roll: rand(0.5, 1.1) * (Math.random() < 0.5 ? 1 : -1) };
    g.position.set(x, w.y0, z);
    this.whales.push(w);
    return w;
  }

  dropWhale(i) {
    const w = this.whales[i];
    this.G.scene.remove(w.group);
    this.G.scene.remove(w.foam);
    w.foamMat.dispose();
    w.frothMat.dispose();
    this.whales.splice(i, 1);
  }

  // How high in the air a whale is at time t of its jump, and its pitch (nose up positive).
  whalePose(w, t) {
    const vy = w.vy - WHALE.gravity * t;
    return { y: w.y0 + w.vy * t - 0.5 * WHALE.gravity * t * t, pitch: Math.atan2(vy, WHALE.speed) };
  }

  updateWhales(dt) {
    const G = this.G, p = G.player, sea = G.world.seaLevel;
    if (!G.terrain.stale && (this.whaleT -= dt) <= 0) {
      this.whaleT = 0.5; // try again soon if there's no deep water ahead
      if (this.whales.length < WHALE.max && !p.dead && this.placeWhale()) this.whaleT = rand(...WHALE.every);
    }
    for (let i = this.whales.length - 1; i >= 0; i--) {
      const w = this.whales[i], top = new THREE.Vector3(w.x0, sea + 0.5, w.z0);
      if (Math.hypot(w.x0 - p.pos.x, w.z0 - p.pos.z) > 1500) { this.dropWhale(i); continue; }
      if (w.state === 'warn') {
        w.t -= dt;
        const k = 1 - w.t / WHALE.warn;
        w.foamMat.opacity = 0.5 * k; // a faint white patch, a hint rather than a siren
        w.frothMat.opacity = 0.22 * k;
        G.fx.emit(top, 22 * k * dt, { colors: SPRAY, speed: 5, up: 4, life: 0.9, size: 3, gravity: -8 });
        if (w.t <= 0) {
          w.state = 'air'; w.t = 0; w.group.visible = true;
          G.fx.emit(top, 45, { colors: SPRAY, speed: 14, up: 26, life: 1.4, size: 5, gravity: -22 });
        }
        continue;
      }
      w.t += dt;
      const { y, pitch } = this.whalePose(w, w.t);
      w.pos.set(w.x0 + Math.sin(w.yaw) * WHALE.speed * w.t, y, w.z0 + Math.cos(w.yaw) * WHALE.speed * w.t);
      w.group.rotation.set(-pitch, w.yaw, w.roll * Math.min(1, w.t / 3));
      w.foamMat.opacity = Math.max(0, w.foamMat.opacity - dt * 0.25);
      w.frothMat.opacity = w.foamMat.opacity * 0.45;
      if (y > sea) G.fx.emit(w.pos, 16 * dt, { colors: SPRAY, speed: 4, life: 0.8, size: 3 * w.s, gravity: -18 }); // water streaming off it
      if (!w.splashed && w.t > 0.5 && y < sea + 2 && pitch < 0) { // back in: a big splash
        w.splashed = true;
        const at = w.pos.clone().setY(sea + 0.5);
        G.fx.emit(at, 70, { colors: SPRAY, speed: 22, up: 34, life: 1.8, size: 7 * w.s, gravity: -22 });
        w.foam.position.set(at.x, sea + 0.4, at.z); w.foamMat.opacity = 0.45;
        const d = p.pos.distanceTo(at);
        if (d < 200) G.shake?.(0.25 * (1 - d / 200), 0.3);
      }
      if (y < w.y0 - 6 * w.s) { this.dropWhale(i); continue; }
      if (p.dead || y < sea - 8 * w.s) continue;
      // Its body: a capsule along its length, tail stock to head.
      const ax = Math.sin(w.yaw) * Math.cos(pitch), ay = Math.sin(pitch), az = Math.cos(w.yaw) * Math.cos(pitch);
      _a.set(ax, ay, az).multiplyScalar(-20 * w.s).add(w.pos); // back to the flukes
      _b.set(ax, ay, az).multiplyScalar(10 * w.s).add(w.pos);
      const seg = _q.subVectors(_b, _a), k = Math.max(0, Math.min(1, _local.subVectors(p.pos, _a).dot(seg) / seg.lengthSq()));
      const near = _a.addScaledVector(seg, k), off = _local.subVectors(p.pos, near), d = off.length();
      const rad = WHALE.radius * w.s, r = 2.5 * (p.sizeScale || 1);
      if (d < rad + r) {
        if (d > 1e-3) p.pos.addScaledVector(off, (rad + r - d) / d); else p.pos.y += rad + r;
        if (!w.hit) {
          w.hit = true;
          p.damage(WHALE.dmg);
          G.fx.emit(p.pos, 24, { colors: SPRAY, speed: 18, life: 0.8, size: 4 });
          if (!this.whaleTip) { this.whaleTip = true; G.ui.notify('Whales are big! Watch for white froth on the sea and skim past instead.', 'warn', 4, 1); }
        }
      } else if (d < rad + WHALE.close && !w.passed && !w.hit) {
        w.passed = true;
        G.score += WHALE.score;
        G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${WHALE.score} Whale watcher!`);
        G.fx.emit(p.pos, 20, { colors: SPRAY, speed: 10, life: 1, size: 3, gravity: -10 });
      }
    }
  }
  // ---- Mushroom Forest: giant bounce mushrooms --------------------------------------------------------------------
  get shroomList() { return this.shrooms; }

  placeShroom() {
    const G = this.G, p = G.player, f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    for (let tries = 0; tries < 4; tries++) {
      const d = rand(SHROOM.near, SHROOM.far), s = rand(-0.6, 0.6) * d;
      const x = p.pos.x + f.x * d - f.z * s, z = p.pos.z + f.z * d + f.x * s;
      if (this.shrooms.some((m) => Math.hypot(m.pos.x - x, m.pos.z - z) < SHROOM.apart)) continue;
      const y = G.terrain.surfaceHeight(x, z);
      if (y < G.world.seaLevel + 2) continue; // never out of a pond
      return this.buildShroom(x, y, z, rand(...SHROOM.stem), rand(...SHROOM.cap));
    }
    return null;
  }

  // A mushroom standing at (x, y, z): its stalk `stem` m tall, a domed cap of radius R on top.
  buildShroom(x, y, z, stem, R) {
    const G = this.G, g = new THREE.Group(), H = R * SHROOM.capH, sr = R * 0.2;
    const add = (geo, mat, px, py, pz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); g.add(m); return m; };
    add(this.stemGeo, this.stemMat, 0, -4, 0, sr, stem + 6, sr); // sunk a little, so a slope never shows its foot
    const capMat = this.capMats[Math.floor(Math.random() * this.capMats.length)];
    const cap = add(this.capGeo, capMat, 0, stem, 0, R, H, R);
    add(this.gillGeo, this.gillMat, 0, stem + 0.2, 0, R * 0.97, 1, R * 0.97);
    for (let k = 0; k < 9; k++) { // pale spots on the dome
      const a = rand(0, Math.PI * 2), r = rand(0.15, 0.8), sz = R * rand(0.07, 0.12);
      add(this.spotGeo, this.spotMat, Math.cos(a) * r * R, stem + H * Math.sqrt(1 - r * r) - sz * 0.2, Math.sin(a) * r * R, sz, sz * 0.35, sz);
    }
    const haloMat = new THREE.MeshBasicMaterial({ color: capMat.color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
    add(this.capGeo, haloMat, 0, stem - 0.5, 0, R * 1.12, H * 1.25, R * 1.12); // a faint glow round the cap
    g.position.set(x, y, z);
    G.scene.add(g);
    this.shrooms.push({ group: g, pos: g.position, stem, R, H, sr, cap, haloMat, glow: 0, t0: rand(0, 6), bumpT: 0, scored: false });
    return this.shrooms.at(-1);
  }

  dropShroom(i) {
    const m = this.shrooms[i];
    this.G.scene.remove(m.group);
    m.haloMat.dispose();
    this.shrooms.splice(i, 1);
  }

  // How high the cap's dome is at horizontal distance d from the stalk (null outside the cap).
  capTop(m, d) {
    return d < m.R ? m.pos.y + m.stem + m.H * Math.sqrt(1 - (d / m.R) ** 2) : null;
  }

  updateShrooms(dt) {
    const G = this.G, p = G.player;
    for (let i = this.shrooms.length - 1; i >= 0; i--) {
      if (Math.hypot(this.shrooms[i].pos.x - p.pos.x, this.shrooms[i].pos.z - p.pos.z) > SHROOM.drop) this.dropShroom(i);
    }
    if (this.shrooms.length < SHROOM.count && !G.terrain.stale && (this.shroomT -= dt) <= 0) { this.shroomT = 0.5; this.placeShroom(); }
    // A bounce in progress: up, and the nose lifted (not while landed or mid-stunt).
    if (this.liftT > 0) {
      this.liftT -= dt;
      if (!p.dead && !p.landed) {
        const k = Math.max(0, this.liftT / SHROOM.lift);
        p.pos.y += SHROOM.rise * k * dt;
        if (!p.maneuver && p.forward.y < SHROOM.noseMax) {
          _local.crossVectors(p.forward, _Y);
          if (_local.lengthSq() > 1e-4) { p.quat.premultiply(_qb.setFromAxisAngle(_local.normalize(), SHROOM.nose * dt)).normalize(); p.updateAxes(); }
        }
      }
    }
    const r = 2.5 * (p.sizeScale || 1);
    for (const m of this.shrooms) {
      m.bumpT = Math.max(0, m.bumpT - dt);
      m.glow = Math.max(0, m.glow - dt * 1.5);
      m.haloMat.opacity = 0.1 + 0.04 * Math.sin(G.time * 1.1 + m.t0) + 0.35 * m.glow; // a slow breathing glow, brighter after a boing
      m.cap.scale.y = m.H * (1 - 0.18 * m.glow * Math.sin(m.glow * 18)); // a wobble after a boing
      if (p.dead || p.landed) continue;
      const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, d = Math.hypot(dx, dz);
      if (d > m.R + r) continue;
      const top = this.capTop(m, Math.min(d, m.R - 0.01)), under = m.pos.y + m.stem;
      if (p.pos.y > under - r && p.pos.y < top + r) { // on (or in) the cap: boing
        p.pos.y = Math.max(p.pos.y, top + r);
        if (m.bumpT > 0) continue;
        m.bumpT = SHROOM.every;
        m.glow = 1;
        this.liftT = SHROOM.lift;
        G.fx.emit(p.pos, 26, { colors: ['#ffffff', '#c8ffd8', '#ff9ae0'], speed: 16, up: 10, life: 1, size: 4, gravity: -12 });
        if (!m.scored) {
          m.scored = true;
          G.score += SHROOM.score;
          G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${SHROOM.score} Boing!`);
          if (!this.shroomTip) { this.shroomTip = true; G.ui.notify('Bouncy caps! Touch the giant mushrooms to boing up into the sky.', 'info', 4, 1); }
        }
      } else if (p.pos.y <= under - r && d < m.sr + r && d > 1e-3) { // the stalk: soft, it only nudges you aside
        const push = (m.sr + r - d) / d;
        p.pos.x += dx * push; p.pos.z += dz * push;
      }
    }
  }
  // ---- Autumn Woods: the great windmill ---------------------------------------------------------------------------
  get millInfo() { return this.mill; }

  dropMill() {
    if (!this.mill) return;
    this.G.scene.remove(this.mill.group);
    for (const geo of this.mill.geos) geo.dispose();
    this.mill = null;
  }

  // A flat-enough rise ahead (not in water): the mill's foundation is sunk into the lowest ground of its footprint,
  // so it never floats.
  placeMill() {
    const G = this.G, p = G.player, f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    for (let tries = 0; tries < 4; tries++) {
      const d = rand(MILL.near, MILL.far), s = rand(-0.4, 0.4) * d;
      const x = p.pos.x + f.x * d - f.z * s, z = p.pos.z + f.z * d + f.x * s;
      const hs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([a, b]) => G.terrain.surfaceHeight(x + a * MILL.foot, z + b * MILL.foot));
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (hi - lo > MILL.slope || lo < G.world.seaLevel + 2) continue;
      return this.buildMill(x, lo, z, Math.atan2(-f.x, -f.z)); // facing you: local +z points back along your path
    }
    return null;
  }

  // The tower's radius at local height y (null above the roof): foundation, tapering tower, conical roof.
  millRadius(y) {
    const B = MILL.base, H = B + MILL.towerH;
    if (y < B) return 16;
    if (y < H) return 13 - 5 * (y - B) / MILL.towerH;
    if (y < H + 14) return 10.5 * (1 - (y - H) / 14);
    return null;
  }

  buildMill(x, y, z, yaw) {
    const M = (this.millMats ||= {
      stone: new THREE.MeshLambertMaterial({ color: '#8a7e70', flatShading: true }),
      wall: new THREE.MeshLambertMaterial({ color: '#efe2c8', flatShading: true }),
      roof: new THREE.MeshLambertMaterial({ color: '#b5532e', flatShading: true }),
      wood: new THREE.MeshLambertMaterial({ color: '#6a4a30', flatShading: true }),
      canvas: new THREE.MeshLambertMaterial({ color: '#f3e6c8', flatShading: true, side: THREE.DoubleSide }),
      dark: new THREE.MeshLambertMaterial({ color: '#3a2a20' }),
    });
    const G = this.G, g = new THREE.Group(), geos = [], B = MILL.base, H = B + MILL.towerH;
    const mesh = (geo, mat, parent = g) => { geos.push(geo); const o = new THREE.Mesh(geo, mat); parent.add(o); return o; };
    mesh(new THREE.CylinderGeometry(16, 17, B + 8, 10), M.stone).position.y = (B - 8) / 2; // sunk 8 m
    mesh(new THREE.CylinderGeometry(8, 13, MILL.towerH, 8), M.wall).position.y = B + MILL.towerH / 2;
    for (const h of [0.3, 0.62]) { // timber bands
      const r = 13 - 5 * h;
      mesh(new THREE.CylinderGeometry(r + 0.4, r + 0.5, 1.4, 8), M.wood).position.y = B + MILL.towerH * h;
    }
    mesh(new THREE.ConeGeometry(10.5, 14, 8), M.roof).position.y = H + 7;
    const door = mesh(new THREE.BoxGeometry(5, 8, 1), M.dark);
    door.position.set(0, B + 4, 12.6);
    for (const [wx, wy] of [[-4, B + 22], [4, B + 38], [0, B + 50]]) { // little windows up the front
      const w = mesh(new THREE.BoxGeometry(2.4, 3.2, 1), M.dark);
      const r = 13 - 5 * (wy - B) / MILL.towerH;
      w.position.set(wx, wy, Math.sqrt(Math.max(0, r * r - wx * wx)) + 0.2);
    }
    const axle = mesh(new THREE.CylinderGeometry(1.2, 1.2, MILL.hubZ - 4, 6), M.wood);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, H, 4 + (MILL.hubZ - 4) / 2);
    // The sails: a rotor at the hub, turning about the axle (local z). Each sail's arm runs along its +y, the canvas
    // to its +x side.
    const rotor = new THREE.Group();
    rotor.position.set(0, H, MILL.hubZ);
    g.add(rotor);
    mesh(new THREE.SphereGeometry(3.5, 8, 6), M.wood, rotor);
    const reach = 6 + MILL.sail * 0.82;
    for (let k = 0; k < 4; k++) {
      const sail = new THREE.Group();
      sail.rotation.z = k * Math.PI / 2;
      rotor.add(sail);
      mesh(new THREE.BoxGeometry(1.4, MILL.sail, 1.4), M.wood, sail).position.set(0, 3 + MILL.sail / 2, 0);
      const cloth = mesh(new THREE.BoxGeometry(MILL.sailW, reach - 6, 0.4), M.canvas, sail);
      cloth.position.set(MILL.sailW / 2 + 0.7, 6 + (reach - 6) / 2, 0.4);
      for (let j = 0; j <= 5; j++) { // the lattice
        const slat = mesh(new THREE.BoxGeometry(MILL.sailW + 0.6, 0.45, 0.8), M.wood, sail);
        slat.position.set(MILL.sailW / 2 + 0.7, 6 + (reach - 6) * j / 5, 0.5);
      }
    }
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    G.scene.add(g);
    this.mill = { group: g, geos, rotor, pos: g.position, yaw, H, reach, angle: rand(0, Math.PI * 2), seed: rand(0, 10), threaded: false, bumpT: 0, prevZ: null, leafAcc: 0 };
    return this.mill;
  }

  // Is the point (x, y) in the sails' plane, relative to the hub, on a sail at the rotor's angle? r: the plane's size.
  onSail(m, x, y, r) {
    if (Math.hypot(x, y) < 3.5 + r) return true; // the hub
    for (let k = 0; k < 4; k++) {
      const a = -(m.angle + k * Math.PI / 2), cs = Math.cos(a), sn = Math.sin(a);
      const u = x * cs - y * sn, v = x * sn + y * cs; // into that sail's frame
      if (v > 3 && v < 3 + MILL.sail && Math.abs(u) < 0.7 + r) return true; // its arm
      if (v > 6 && v < m.reach && u > -0.7 - r && u < MILL.sailW + 0.7 + r) return true; // its canvas
    }
    return false;
  }

  updateMill(dt) {
    const G = this.G, p = G.player;
    if (this.mill && Math.hypot(this.mill.pos.x - p.pos.x, this.mill.pos.z - p.pos.z) > MILL.drop) this.dropMill();
    if (!this.mill && !G.terrain.stale && (this.millT -= dt) <= 0) { this.millT = 0.5; this.placeMill(); }
    const m = this.mill;
    if (!m) return;
    // The sails turn, faster in the gusts.
    m.angle += MILL.spin * (1 + MILL.gust * Math.max(0, Math.sin(G.time * 0.35 + m.seed))) * dt;
    m.rotor.rotation.z = m.angle;
    m.bumpT = Math.max(0, m.bumpT - dt);
    // Now and then a leaf blows off a sail tip (only when you're near enough to see it).
    if ((m.leafAcc += dt) > 0.4 && p.pos.distanceToSquared(m.pos) < 800 * 800) {
      m.leafAcc = 0;
      const a = m.angle + Math.floor(Math.random() * 4) * Math.PI / 2 + Math.PI / 2, cs = Math.cos(m.yaw), sn = Math.sin(m.yaw);
      const lx = Math.cos(a) * m.reach, ly = m.H + Math.sin(a) * m.reach;
      _q.set(m.pos.x + lx * cs + MILL.hubZ * sn, m.pos.y + ly, m.pos.z - lx * sn + MILL.hubZ * cs);
      G.fx.emit(_q, 1, { colors: ['#e8902a', '#d8602a', '#f0c040'], speed: 4, life: 2.5, size: 2, gravity: -4, drag: 0.6 });
    }
    if (p.dead) { m.prevZ = null; return; }
    const L = this.archLocal(m, _local), r = 2.5 * (p.sizeScale || 1), z = L.z - MILL.hubZ, hx = L.x, hy = L.y - m.H;
    const cs = Math.cos(m.yaw), sn = Math.sin(m.yaw);
    let hit = false;
    // The sails' plane (taxiing on the ground never reaches it; the tower below still stops you).
    if (p.landed) m.prevZ = null;
    else if (Math.abs(z) < MILL.thick + r && this.onSail(m, hx, hy, r)) {
      const side = Math.sign(m.prevZ ?? z) || 1, out = side * (MILL.thick + r) - z; // back out the way you came
      p.pos.x += out * sn; p.pos.z += out * cs;
      hit = true;
    } else if (m.prevZ !== null && Math.sign(m.prevZ) !== Math.sign(z) && !m.threaded && Math.hypot(hx, hy) < m.reach) {
      m.threaded = true;
      G.score += MILL.score;
      G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${MILL.score} Through the sails!`);
      G.fx.emit(p.pos, 30, { colors: ['#e8902a', '#d8602a', '#f0c040', '#f3e6c8'], speed: 16, life: 1.4, size: 3, gravity: -5 });
    }
    if (!p.landed) m.prevZ = hit ? Math.sign(m.prevZ ?? z) || 1 : z;
    // The tower, foundation and roof.
    const tr = this.millRadius(L.y);
    const d = Math.hypot(L.x, L.z);
    if (tr !== null && d < tr + r) {
      const k = d > 1e-3 ? (tr + r - d) / d : 0, px = L.x * k, pz = d > 1e-3 ? L.z * k : tr + r;
      p.pos.x += px * cs + pz * sn; p.pos.z += -px * sn + pz * cs;
      hit = true;
    }
    if (hit && m.bumpT <= 0) {
      m.bumpT = MILL.bumpEvery;
      p.damage(MILL.dmg);
      G.fx.emit(p.pos, 18, { colors: ['#f3e6c8', '#6a4a30', '#e8902a'], speed: 18, life: 0.8, size: 4 });
      if (!this.millTip) { this.millTip = true; G.ui.notify('The windmill is solid! Slip between the turning sails for points.', 'warn', 4, 1); }
    }
  }
  // ---- Canyon Country: the railway trestle -------------------------------------------------------------------------
  get trestleInfo() { return this.trestle; }

  dropTrestle() {
    if (!this.trestle) return;
    this.G.scene.remove(this.trestle.group);
    for (const geo of this.trestle.geos) geo.dispose();
    this.trestle = null;
  }

  // A gorge ahead, across your way: high ground at both ends of the deck, a deep drop under its middle, all dry.
  placeTrestle() {
    const G = this.G, p = G.player, f = p.forward.clone().setY(0), L = TRESTLE.len, n = 12;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const hs = [];
    for (let tries = 0; tries < TRESTLE.tries; tries++) {
      const d = rand(TRESTLE.near, TRESTLE.far), s = rand(-0.35, 0.35) * d, yaw = Math.atan2(-f.x, -f.z) + rand(-0.5, 0.5);
      const x = p.pos.x + f.x * d - f.z * s, z = p.pos.z + f.z * d + f.x * s, cs = Math.cos(yaw), sn = Math.sin(yaw);
      for (let i = 0; i <= n; i++) { const l = (i / n - 0.5) * L; hs[i] = G.terrain.surfaceHeight(x + cs * l, z - sn * l); }
      if (Math.min(...hs) < G.world.seaLevel + 2) continue;
      const deck = Math.min(hs[0], hs[n]) + 2;
      if (Math.max(hs[0], hs[n]) > deck + 30 || Math.min(...hs) < deck - 70) continue; // the bents stay under ~70 m
      // The bluffs' footprints: solid ground under every corner (they reach 76 m down).
      let rock = true;
      for (const sx of [-1, 1]) for (const ex of [L / 2 - 1, L / 2 + 19]) for (const ez of [-15, 15]) {
        if (G.terrain.surfaceHeight(x + cs * sx * ex + sn * ez, z - sn * sx * ex + cs * ez) < deck - 70) rock = false;
      }
      if (!rock) continue;
      let ok = true;
      for (let i = 1; i < n && ok; i++) ok = hs[i] <= deck - (i >= 5 && i <= 7 ? TRESTLE.deep : 6);
      if (!ok) continue;
      return this.buildTrestle(x, deck, z, yaw);
    }
    return null;
  }

  // The ground under a point along the deck (local x, z), in the trestle's frame (y up from the deck top).
  trestleGround(t, lx, lz = 0) {
    const cs = Math.cos(t.yaw), sn = Math.sin(t.yaw);
    return this.G.terrain.surfaceHeight(t.pos.x + lx * cs + lz * sn, t.pos.z - lx * sn + lz * cs) - t.pos.y;
  }

  buildTrestle(x, y, z, yaw) {
    const M = (this.trestleMats ||= {
      timber: new THREE.MeshLambertMaterial({ color: '#7a5636', flatShading: true }),
      plank: new THREE.MeshLambertMaterial({ color: '#a8845a', flatShading: true }),
      rock: new THREE.MeshLambertMaterial({ color: '#b0643a', flatShading: true }),
      mouth: new THREE.MeshBasicMaterial({ color: '#120c08' }),
      black: new THREE.MeshLambertMaterial({ color: '#2a2622', flatShading: true }),
      red: new THREE.MeshLambertMaterial({ color: '#9a2a22', flatShading: true }),
      green: new THREE.MeshLambertMaterial({ color: '#2e5a3a', flatShading: true }),
      cream: new THREE.MeshLambertMaterial({ color: '#efe0bc', flatShading: true }),
      brass: new THREE.MeshLambertMaterial({ color: '#d8a83a', flatShading: true }),
      steel: new THREE.MeshLambertMaterial({ color: '#8a8e94', flatShading: true }),
      roof: new THREE.MeshLambertMaterial({ color: '#4a5a6a', flatShading: true }),
      glass: new THREE.MeshLambertMaterial({ color: '#2a3440' }),
      coal: new THREE.MeshLambertMaterial({ color: '#141414', flatShading: true }),
      lamp: new THREE.MeshBasicMaterial({ color: '#fff2a0' }),
    });
    const G = this.G, T = TRESTLE, L = T.len, g = new THREE.Group(), geos = [];
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const t = { group: g, geos, pos: g.position, yaw, bents: [], cars: [], wheels: [] };
    const mesh = (geo, mat, parent) => { geos.push(geo); const o = new THREE.Mesh(geo, mat); parent.add(o); return o; };
    const box = (w, h, l, mat, parent, bx = 0, by = 0, bz = 0) => { const o = mesh(new THREE.BoxGeometry(w, h, l), mat, parent); o.position.set(bx, by, bz); return o; };
    // Timber: every post, brace and tie is one instance of a unit beam, stretched from end to end.
    const beams = [], dummy = new THREE.Object3D();
    const beam = (ax, ay, az, bx, by, bz, w = 0.9) => {
      dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      dummy.lookAt(bx, by, bz);
      dummy.scale.set(w, w, Math.hypot(bx - ax, by - ay, bz - az) + 0.3);
      dummy.updateMatrix();
      beams.push(dummy.matrix.clone());
    };
    // The bents: two splayed legs each, sunk into the ground, with an X brace and a tie every 14 m down.
    for (let bx = -L / 2 + T.bentEvery / 2; bx < L / 2; bx += T.bentEvery) {
      const w = (yy) => T.deckW / 2 + T.splay * -yy;
      let gy = Math.min(this.trestleGround(t, bx, -6), this.trestleGround(t, bx, 6));
      gy = Math.min(gy, this.trestleGround(t, bx, -w(gy - 3)), this.trestleGround(t, bx, w(gy - 3))); // where the splayed feet land
      if (gy > -4) continue; // the bluff carries the deck here
      const bottom = gy - 3;
      t.bents.push({ x: bx, bottom });
      for (const sz of [-1, 1]) beam(bx, -2.6, sz * w(-2.6), bx, bottom, sz * w(bottom), 1.2);
      let prev = -2.6;
      for (let yy = -2.6 - 14; yy > bottom + 2; yy -= 14) {
        beam(bx, prev, -w(prev), bx, yy, w(yy), 0.6);
        beam(bx, prev, w(prev), bx, yy, -w(yy), 0.6);
        beam(bx, yy, -w(yy), bx, yy, w(yy), 0.7);
        prev = yy;
      }
      beam(bx, -2.6, -w(-2.6) - 1, bx, -2.6, w(-2.6) + 1, 1); // the cap
    }
    // Stringers from bent to bent under the deck, and a handrail on posts along both sides.
    for (const sz of [-1, 1]) {
      beam(-L / 2, -2.2, sz * 3, L / 2, -2.2, sz * 3, 1.1);
      beam(-L / 2, 2.6, sz * (T.deckW / 2 - 0.3), L / 2, 2.6, sz * (T.deckW / 2 - 0.3), 0.35);
      for (let px = -L / 2 + 4; px < L / 2; px += 8) beam(px, 0, sz * (T.deckW / 2 - 0.3), px, 2.7, sz * (T.deckW / 2 - 0.3), 0.35);
    }
    const unit = new THREE.BoxGeometry(1, 1, 1);
    geos.push(unit);
    const timber = new THREE.InstancedMesh(unit, M.timber, beams.length);
    beams.forEach((m, i) => timber.setMatrixAt(i, m));
    g.add(timber);
    // The deck: planks, sleepers and the two rails.
    box(L, 1.2, T.deckW, M.plank, g, 0, -0.6, 0);
    const sleeperGeo = new THREE.BoxGeometry(1.2, 0.4, T.gauge + 2);
    geos.push(sleeperGeo);
    const ns = Math.floor(L / 3), sleepers = new THREE.InstancedMesh(sleeperGeo, M.timber, ns);
    for (let i = 0; i < ns; i++) { dummy.position.set(-L / 2 + 1.5 + i * 3, 0.2, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); sleepers.setMatrixAt(i, dummy.matrix); }
    g.add(sleepers);
    for (const sz of [-1, 1]) box(L + 40, 0.4, 0.35, M.steel, g, 0, 0.6, sz * T.gauge / 2);
    // A rocky bluff at each end, sunk deep into the ground, with a tunnel mouth facing the gorge.
    for (const sx of [-1, 1]) {
      const bl = box(20, 90, 30, M.rock, g, sx * (L / 2 + 9), -31, 0); // from 76 m down up to 14 m over the deck
      bl.rotation.set(0, sx * 0.05, 0);
      const cap = box(24, 4, 34, M.rock, g, sx * (L / 2 + 10), 15, 0);
      cap.rotation.y = -sx * 0.08;
      box(0.6, 10, 7, M.mouth, g, sx * (L / 2 - 1.2), 5, 0);
      const arch = mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.6, 12), M.mouth, g); // the round top of the mouth
      arch.rotation.z = Math.PI / 2; arch.position.set(sx * (L / 2 - 1.2), 10, 0);
    }
    // The train: each car is a group built nose along +z, sitting on its wheels at y = 0.
    let off = 0;
    for (const c of T.cars) {
      const cg = new THREE.Group(), CL = c.len, W = T.width, wr = T.wheel;
      g.add(cg);
      const wheel = (wz, r = wr) => {
        for (const sx of [-1, 1]) {
          const geo = new THREE.CylinderGeometry(r, r, 0.6, 10); geo.rotateZ(Math.PI / 2); geos.push(geo);
          const w = new THREE.Mesh(geo, M.black); cg.add(w); w.position.set(sx * (T.gauge / 2), r, wz); t.wheels.push({ w, r });
          box(0.8, r * 1.6, 0.35, M.red, w); // a spoke (sticking out of both faces), so you can see it turn
        }
      };
      box(W, 1, CL, M.black, cg, 0, wr + 0.9, 0); // the frame
      if (c.kind === 'loco') {
        const boiler = mesh(new THREE.CylinderGeometry(2.1, 2.1, 10, 12), M.black, cg); boiler.rotation.x = Math.PI / 2; boiler.position.set(0, wr + 3.5, 2.5);
        for (const bz of [-1, 2.5, 6]) { const b = mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.4, 12), M.brass, cg); b.rotation.x = Math.PI / 2; b.position.set(0, wr + 3.5, bz); }
        const face = mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.6, 12), M.steel, cg); face.rotation.x = Math.PI / 2; face.position.set(0, wr + 3.5, 7.6);
        mesh(new THREE.CylinderGeometry(1.1, 0.7, 3.2, 10), M.black, cg).position.set(0, wr + 7, 5.4); // the chimney
        mesh(new THREE.CylinderGeometry(1.4, 1.1, 0.7, 10), M.brass, cg).position.set(0, wr + 8.8, 5.4);
        mesh(new THREE.SphereGeometry(1.1, 10, 6), M.brass, cg).position.set(0, wr + 5.6, 1.4); // the dome
        box(W, 5, 4.5, M.red, cg, 0, wr + 4.4, -5.2); // the cab
        box(W + 0.8, 0.5, 5.4, M.black, cg, 0, wr + 7.1, -5.2);
        box(W + 0.05, 1.6, 1.6, M.glass, cg, 0, wr + 5.4, -4.4);
        mesh(new THREE.SphereGeometry(0.7, 8, 6), M.lamp, cg).position.set(0, wr + 6, 7.9);
        const catcher = mesh(new THREE.ConeGeometry(2.6, 2.6, 4), M.red, cg); catcher.rotation.set(Math.PI / 2, Math.PI / 4, 0); catcher.scale.set(1, 0.5, 1); catcher.position.set(0, 1.1, 8.4);
        for (const wz of [-4.5, -0.5, 3.5]) wheel(wz, 1.5);
        for (const sx of [-1, 1]) box(0.2, 0.3, 8, M.steel, cg, sx * (T.gauge / 2 + 0.4), 1.5, -0.5); // coupling rods
      } else if (c.kind === 'tender') {
        box(W, 4, CL - 1, M.black, cg, 0, wr + 3.4, 0);
        box(W - 1, 1.2, CL - 2, M.coal, cg, 0, wr + 5.8, 0);
        box(W + 0.1, 0.6, CL - 0.8, M.brass, cg, 0, wr + 5.1, 0);
        for (const wz of [-3, 3]) wheel(wz);
      } else {
        box(W, 4.2, CL - 1, M.green, cg, 0, wr + 3.6, 0);
        box(W + 0.1, 1.2, CL - 1.4, M.cream, cg, 0, wr + 4.6, 0); // the window band
        for (let k = 0; k < 4; k++) box(W + 0.15, 1, 1.8, M.glass, cg, 0, wr + 4.6, -CL / 2 + 2.6 + k * ((CL - 5.2) / 3));
        const top = mesh(new THREE.CylinderGeometry(W * 0.62, W * 0.62, CL - 0.6, 10, 1, false, -Math.PI / 2, Math.PI), M.roof, cg);
        top.rotation.set(-Math.PI / 2, 0, 0); top.scale.set(1, 1, 0.4); top.position.set(0, wr + 5.6, 0);
        for (const wz of [-CL / 2 + 2.5, CL / 2 - 2.5]) wheel(wz);
      }
      t.cars.push({ ...c, group: cg, off: off + c.len / 2, x: 0 });
      off += c.len + T.gap;
    }
    t.trainLen = off;
    Object.assign(t, { dir: Math.random() < 0.5 ? 1 : -1, tx: 0, wait: rand(0, 2), under: false, raced: false, prevZ: null, bumpT: 0, smokeT: 0, steamT: rand(...T.steamEvery) });
    t.tx = -t.dir * (L / 2 + 6);
    G.scene.add(g);
    this.trestle = t;
    this.placeTrain();
    return t;
  }

  // The train along the deck: the engine's nose at tx, heading dir (+1 or -1 along the deck). Cars inside a tunnel
  // are hidden.
  placeTrain() {
    const t = this.trestle, edge = TRESTLE.len / 2 - 1;
    for (const c of t.cars) {
      c.x = t.tx - t.dir * c.off;
      c.group.position.set(c.x, 0.8, 0);
      c.group.rotation.y = t.dir * Math.PI / 2;
      c.group.visible = t.wait <= 0 && Math.abs(c.x) - c.len / 2 < edge; // shown as soon as its nose leaves the tunnel
    }
  }

  updateTrestle(dt) {
    const G = this.G, p = G.player, T = TRESTLE, L = T.len;
    if (this.trestle && Math.hypot(this.trestle.pos.x - p.pos.x, this.trestle.pos.z - p.pos.z) > T.drop) this.dropTrestle();
    if (!this.trestle && !G.terrain.stale && (this.trestleT -= dt) <= 0) { this.trestleT = 0.5; this.placeTrestle(); }
    const t = this.trestle;
    if (!t) return;
    // The train: out of one tunnel, across and into the other; a little later the next one comes out the first.
    if (t.wait > 0) {
      t.wait -= dt;
    } else {
      t.tx += t.dir * T.speed * dt;
      for (const { w, r } of t.wheels) w.rotation.x += (T.speed / r) * dt;
      if (t.dir * t.tx > L / 2 + t.trainLen + 4) { t.tx = -t.dir * (L / 2 + 6); t.wait = rand(...T.wait); }
    }
    this.placeTrain();
    t.bumpT = Math.max(0, t.bumpT - dt);
    const loco = t.cars[0], near = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) < 900;
    // Smoke from the chimney while the engine is out in the open, and now and then a hiss of steam.
    if (near && loco.group.visible && (t.smokeT -= dt) <= 0) {
      t.smokeT = 0.14;
      t.group.updateMatrixWorld();
      G.fx.emit(loco.group.localToWorld(_q.set(0, T.wheel + 9.2, 5.4)), 2, { colors: ['#5a5652', '#8a8682', '#c8c4be'], speed: 3, life: 3, size: 6, gravity: 6, up: 6, drag: 0.5 });
    }
    if ((t.steamT -= dt) <= 0) {
      t.steamT = rand(...T.steamEvery);
      if (near && loco.group.visible) {
        t.group.updateMatrixWorld();
        for (const sx of [-1, 1]) G.fx.emit(loco.group.localToWorld(_q.set(sx * 3, 1.4, 4)), 14, { colors: ['#ffffff', '#e8eef2'], speed: 9, life: 1.4, size: 5, gravity: 3, drag: 1.4 });
      }
    }
    if (p.dead) { t.prevZ = null; return; }
    const P = this.archLocal(t, _local), r = 2.5 * (p.sizeScale || 1), cs = Math.cos(t.yaw), sn = Math.sin(t.yaw);
    let hit = false, ox = 0, oy = 0, oz = 0;
    // A box in the trestle's frame: if you're in it, out the shallowest way.
    const solid = (x0, x1, y0, y1, hz) => {
      if (P.x <= x0 - r || P.x >= x1 + r || P.y <= y0 - r || P.y >= y1 + r || Math.abs(P.z) >= hz + r) return;
      const dx = P.x - (x0 + x1) / 2 < 0 ? x0 - r - P.x : x1 + r - P.x, dy = P.y - (y0 + y1) / 2 < 0 ? y0 - r - P.y : y1 + r - P.y;
      const dz = (P.z < 0 ? -1 : 1) * (hz + r) - P.z;
      if (Math.abs(dy) <= Math.abs(dx) && Math.abs(dy) <= Math.abs(dz)) oy += dy; else if (Math.abs(dx) <= Math.abs(dz)) ox += dx; else oz += dz;
      hit = true;
    };
    solid(-L / 2, L / 2, -2.6, 0.6, T.deckW / 2); // the deck
    for (const b of t.bents) if (P.y < -2.6 && P.y > b.bottom - r) solid(b.x - 1.2, b.x + 1.2, b.bottom, -2.6, T.deckW / 2 + T.splay * Math.max(0, -P.y));
    for (const sx of [-1, 1]) solid(sx > 0 ? L / 2 - 1 : -L / 2 - 21, sx > 0 ? L / 2 + 21 : -L / 2 + 1, -80, 17, 17); // the bluffs
    for (const c of t.cars) if (c.group.visible) solid(c.x - c.len / 2, c.x + c.len / 2, 0.8, 0.8 + T.wheel + c.h, T.width / 2);
    if (hit) { p.pos.x += ox * cs + oz * sn; p.pos.y += oy; p.pos.z += -ox * sn + oz * cs; }
    // Under the deck, from one side to the other between the bluffs: a pass under the trestle.
    if (!hit && t.prevZ !== null && Math.sign(t.prevZ) !== Math.sign(P.z) && !t.under && P.y < -2.6 - r && Math.abs(P.x) < L / 2 - 2) {
      t.under = true;
      G.score += T.score;
      G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${T.score} Under the trestle!`);
      G.fx.emit(p.pos, 30, { colors: ['#d8a83a', '#b0643a', '#efe0bc', '#ffffff'], speed: 16, life: 1.4, size: 3, gravity: -5 });
    }
    t.prevZ = hit ? t.prevZ : P.z;
    // Close past the engine out in the open: racing the train.
    if (!hit && !t.raced && !p.landed && loco.group.visible && Math.hypot(P.x - loco.x, P.y - 5, P.z) < T.close) {
      t.raced = true;
      G.score += T.score;
      G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${T.score} Racing the train!`);
      G.fx.emit(p.pos, 30, { colors: ['#d8a83a', '#9a2a22', '#efe0bc', '#ffffff'], speed: 16, life: 1.4, size: 3, gravity: -5 });
    }
    if (hit && t.bumpT <= 0) {
      t.bumpT = T.bumpEvery;
      p.damage(T.dmg);
      G.fx.emit(p.pos, 18, { colors: ['#a8845a', '#7a5636', '#d8a83a'], speed: 18, life: 0.8, size: 4 });
      if (!this.trestleTip) { this.trestleTip = true; G.ui.notify('The trestle is solid! Fly under the deck between its legs for points.', 'warn', 4, 1); }
    }
  }
  // ---- Candy Kingdom: the gumball machine --------------------------------------------------------------------------
  get gumballInfo() { return this.gum; }
  get gumballList() { return this.gum ? this.gum.balls : []; }

  dropGumball() {
    const m = this.gum;
    if (!m) return;
    for (const b of m.balls) this.G.scene.remove(b.mesh);
    this.G.scene.remove(m.group);
    for (const geo of m.geos) geo.dispose();
    m.heap.dispose(); // its instance buffers (the gumball geometry itself is shared)
    this.gum = null;
  }

  // A flat-enough rise ahead (not in water), like the windmill's: the plinth is sunk into the lowest ground of its
  // footprint, so the machine never floats.
  placeGumball() {
    const G = this.G, p = G.player, f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    for (let tries = 0; tries < 4; tries++) {
      const d = rand(GUMBALL.near, GUMBALL.far), s = rand(-0.4, 0.4) * d;
      const x = p.pos.x + f.x * d - f.z * s, z = p.pos.z + f.z * d + f.x * s;
      const hs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([a, b]) => G.terrain.surfaceHeight(x + a * GUMBALL.foot, z + b * GUMBALL.foot));
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (hi - lo > GUMBALL.slope || lo < G.world.seaLevel + 2) continue;
      return this.buildGumball(x, lo, z, Math.atan2(-f.x, -f.z)); // facing you: local +z points back along your path
    }
    return null;
  }

  // The machine's radius at local height y (null above its lid): plinth, pedestal, collar, glass globe, lid.
  gumRadius(m, y) {
    const T = GUMBALL;
    if (y < 2) return T.baseR + 2.5;
    if (y < T.baseH) return T.baseR;
    let r = y < T.baseH + 3 ? 10 : null;
    const dy = y - m.C;
    if (Math.abs(dy) < T.globeR) r = Math.max(r ?? 0, Math.sqrt(T.globeR ** 2 - dy * dy));
    const ly = y - m.lidY;
    if (ly >= 0 && ly < 10) r = Math.max(r ?? 0, Math.sqrt(100 - ly * ly));
    return r;
  }

  buildGumball(x, y, z, yaw) {
    const T = GUMBALL;
    const M = (this.gumMats ||= {
      red: new THREE.MeshPhongMaterial({ color: '#d8202e', shininess: 60, flatShading: true }),
      gold: new THREE.MeshPhongMaterial({ color: '#f0c040', shininess: 90, flatShading: true }),
      steel: new THREE.MeshPhongMaterial({ color: '#d8dce4', shininess: 110, flatShading: true }),
      dark: new THREE.MeshLambertMaterial({ color: '#2a1a22' }),
      glass: new THREE.MeshPhongMaterial({ color: '#eaf8ff', specular: '#ffffff', shininess: 140, transparent: true, opacity: 0.2, depthWrite: false }),
      heap: new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 70 }), // tinted per gumball
      balls: GUM_COLORS.map((c) => new THREE.MeshPhongMaterial({ color: c, shininess: 70, emissive: c, emissiveIntensity: 0.08 })),
      ballGeo: new THREE.SphereGeometry(1, 14, 10),
    });
    const G = this.G, g = new THREE.Group(), geos = [], B = T.baseH, R = T.globeR, C = B + 2 + R * 0.9, lidY = C + Math.sqrt(R * R - 100);
    const mesh = (geo, mat, parent = g) => { geos.push(geo); const o = new THREE.Mesh(geo, mat); parent.add(o); return o; };
    const rAt = (h) => T.baseR - 1.5 * (h - 2) / (B - 2), face = Math.cos(Math.PI / 8); // the pedestal's radius, and its flat faces' share of it
    mesh(new THREE.CylinderGeometry(T.baseR + 2, T.baseR + 2.5, 10, 16), M.red).position.y = -3; // the plinth, sunk 8 m
    mesh(new THREE.CylinderGeometry(T.baseR + 2.2, T.baseR + 2.2, 0.8, 16), M.gold).position.y = 2.1;
    const ped = new THREE.CylinderGeometry(rAt(B), T.baseR, B - 2, 8);
    ped.rotateY(Math.PI / 8); // a flat face to the front
    mesh(ped, M.red).position.y = 2 + (B - 2) / 2;
    for (const h of [5, B - 1.5]) {
      const band = new THREE.CylinderGeometry(rAt(h) + 0.35, rAt(h) + 0.35, 1, 8);
      band.rotateY(Math.PI / 8);
      mesh(band, M.gold).position.y = h;
    }
    for (let k = 0; k < 8; k++) { // gold studs round the top band
      const a = k * Math.PI / 4, rr = rAt(B - 1.5) * face + 0.5;
      mesh(new THREE.SphereGeometry(0.6, 6, 4), M.gold).position.set(Math.sin(a) * rr, B - 1.5, Math.cos(a) * rr);
    }
    mesh(new THREE.CylinderGeometry(9, 10, 3, 16), M.steel).position.y = B + 1.5; // the collar
    const globe = mesh(new THREE.SphereGeometry(R, 28, 20), M.glass);
    globe.position.y = C;
    globe.renderOrder = 2;
    // The heap of gumballs inside, filling the globe to a little above its middle. It churns when the crank turns.
    const churn = new THREE.Group();
    churn.position.y = C;
    g.add(churn);
    const heap = new THREE.InstancedMesh(M.ballGeo, M.heap, 150), _m = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3();
    let n = 0;
    for (let k = 0; k < 900 && n < heap.count; k++) {
      _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(R - 2.6);
      if (_v.length() > R - 2.6 || _v.y > 5 + 2 * Math.cos(_v.x * 0.3) * Math.cos(_v.z * 0.3)) continue;
      _m.makeScale(2.3, 2.3, 2.3).setPosition(_v);
      heap.setMatrixAt(n, _m);
      heap.setColorAt(n, _c.set(GUM_COLORS[n % GUM_COLORS.length]));
      n++;
    }
    heap.count = n;
    churn.add(heap);
    // The lid: a red cap with a gold knob.
    mesh(new THREE.CylinderGeometry(10.6, 10.6, 2, 18), M.red).position.y = lidY;
    mesh(new THREE.SphereGeometry(10, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.red).position.y = lidY + 1;
    mesh(new THREE.CylinderGeometry(1.4, 2.4, 1.6, 10), M.gold).position.y = lidY + 11.6;
    mesh(new THREE.SphereGeometry(2.2, 10, 8), M.gold).position.y = lidY + 13.4;
    // The front: a steel plate with a coin slot, a price tag, the big crank and the chute with its flap.
    const py = B * 0.6, apo = rAt(py) * face;
    mesh(new THREE.BoxGeometry(9, 10, 0.6), M.steel).position.set(0, py, apo + 0.3);
    mesh(new THREE.BoxGeometry(0.8, 3, 0.4), M.dark).position.set(3, py + 3, apo + 0.7);
    mesh(new THREE.BoxGeometry(6, 2.2, 0.5), M.gold).position.set(0, py + 7.2, apo + 0.4);
    const crank = new THREE.Group();
    crank.position.set(0, py - 0.8, apo + 0.9);
    g.add(crank);
    mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.8, 16), M.steel, crank).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(1, 8, 6), M.gold, crank).position.z = 0.6;
    mesh(new THREE.BoxGeometry(1, 4.4, 0.6), M.steel, crank).position.set(0, 2.2, 0.7);
    const grip = mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.6, 8), M.red, crank);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0, 4.1, 1.9);
    const low = rAt(4.8) * face;
    mesh(new THREE.BoxGeometry(6, 5, 1), M.dark).position.set(0, 4.8, low + 0.1);
    const lip = mesh(new THREE.BoxGeometry(7, 0.8, 6), M.steel);
    lip.position.set(0, 2.4, low + 3);
    lip.rotation.x = 0.18; // sloping down and out
    for (const sx of [-3.5, 3.5]) mesh(new THREE.BoxGeometry(0.6, 1.8, 6), M.steel).position.set(sx, 3, low + 3);
    const flap = new THREE.Group();
    flap.position.set(0, 7.3, low + 0.7);
    g.add(flap);
    mesh(new THREE.BoxGeometry(5.6, 4.8, 0.4), M.gold, flap).position.y = -2.4;
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    G.scene.add(g);
    this.gum = { group: g, geos, pos: g.position, yaw, C, lidY, crank, flap, churn, heap, chuteZ: low + 1, balls: [], wait: rand(1, 3), crankT: 0, spun: false, flapA: 0, bumpT: 0 };
    return this.gum;
  }

  // A gumball out of the chute's mouth, rolling off down the lip and away from the machine.
  spawnGumball(m = this.gum) {
    const T = GUMBALL, M = this.gumMats, cs = Math.cos(m.yaw), sn = Math.sin(m.yaw), ez = m.chuteZ, side = rand(-1.5, 1.5);
    const k = Math.floor(Math.random() * GUM_COLORS.length), mesh = new THREE.Mesh(M.ballGeo, M.balls[k]);
    mesh.scale.setScalar(T.ball);
    mesh.position.set(m.pos.x + ez * sn, m.pos.y + 2.4 + T.ball, m.pos.z + ez * cs);
    this.G.scene.add(mesh);
    const b = { mesh, pos: mesh.position, vel: new THREE.Vector3(T.push * sn + side * cs, 0, T.push * cs - side * sn), color: GUM_COLORS[k], t: 0, slow: 0 };
    m.balls.push(b);
    return b;
  }

  popGumball(i, many = 24) {
    const m = this.gum, b = m.balls[i];
    this.G.fx.emit(b.pos, many, { colors: [b.color, '#ffffff', '#ffd0ec'], speed: 14, life: 1, size: 2.5, gravity: -8 });
    this.G.scene.remove(b.mesh);
    m.balls.splice(i, 1);
  }

  updateGumball(dt) {
    const G = this.G, p = G.player, T = GUMBALL;
    if (this.gum && Math.hypot(this.gum.pos.x - p.pos.x, this.gum.pos.z - p.pos.z) > T.drop) this.dropGumball();
    if (!this.gum && !G.terrain.stale && (this.gumT -= dt) <= 0) { this.gumT = 0.5; this.placeGumball(); }
    const m = this.gum;
    if (!m) return;
    const near = p.pos.distanceToSquared(m.pos) < 1000 * 1000;
    // Every few seconds (while you're near enough to see it) the crank turns, the heap churns, and out pops a gumball.
    m.wait -= dt;
    if (m.crankT <= 0 && m.wait <= 0 && near && m.balls.length < T.max) { m.crankT = T.crank; m.spun = false; m.wait = rand(...T.every); }
    if (m.crankT > 0) {
      m.crankT = Math.max(0, m.crankT - dt);
      const k = 1 - m.crankT / T.crank;
      m.crank.rotation.z = -k * Math.PI * 2;
      m.churn.rotation.y += 1.2 * dt;
      m.churn.position.y = m.C + Math.abs(Math.sin(k * Math.PI * 5)) * 0.5;
      if (!m.spun && k >= 0.7) {
        m.spun = true;
        m.flapA = 1;
        const b = this.spawnGumball(m);
        G.fx.emit(b.pos, 12, { colors: ['#ffffff', '#ffd0ec', b.color], speed: 8, life: 0.8, size: 2, gravity: -4 });
      }
    } else m.churn.position.y = m.C;
    m.flapA = Math.max(0, m.flapA - dt * 1.2);
    m.flap.rotation.x = -1.1 * Math.min(1, m.flapA * 1.5);
    m.bumpT = Math.max(0, m.bumpT - dt);
    // The gumballs roll down the chute's lip and away down the hills (and bob along in water), spinning as they go.
    const h = (x, z) => G.terrain.surfaceHeight(x, z), sea = G.world.seaLevel, e = 2;
    for (let i = m.balls.length - 1; i >= 0; i--) {
      const b = m.balls[i], P = b.pos, V = b.vel;
      b.t += dt;
      const dx = P.x - m.pos.x, dz = P.z - m.pos.z, d = Math.hypot(dx, dz), keep = T.baseR + 2.5 + T.ball, chute = b.t < 0.7;
      const ground = h(P.x, P.z), wet = ground < sea;
      let floor = wet ? sea + T.ball * 0.4 + Math.sin(b.t * 2.5) * 0.3 : ground + T.ball;
      if (chute && d < keep) floor = Math.max(floor, m.pos.y + 2 + T.ball); // rolling off the lip over the plinth
      if (P.y - floor < 0.3 && !wet) {
        const gx = (h(P.x + e, P.z) - h(P.x - e, P.z)) / (2 * e), gz = (h(P.x, P.z + e) - h(P.x, P.z - e)) / (2 * e), k = T.gravity * 5 / 7 / (1 + gx * gx + gz * gz);
        V.x -= gx * k * dt; V.z -= gz * k * dt;
      }
      const drag = Math.exp(-(wet ? 1.5 : T.roll) * dt);
      V.x *= drag; V.z *= drag;
      V.y -= T.gravity * dt;
      P.x += V.x * dt; P.y += V.y * dt; P.z += V.z * dt;
      if (P.y <= floor) { P.y = floor; V.y = V.y < -6 ? -V.y * 0.35 : 0; } // a little bounce off a big drop
      // Never back into the machine (once it's off the lip).
      if (!chute && d < keep && P.y < m.pos.y + T.baseH + 5) {
        const nx = d > 1e-3 ? dx / d : Math.sin(m.yaw), nz = d > 1e-3 ? dz / d : Math.cos(m.yaw), vn = V.x * nx + V.z * nz;
        P.x = m.pos.x + nx * keep; P.z = m.pos.z + nz * keep;
        if (vn < 0) { V.x -= vn * nx * 1.3; V.z -= vn * nz * 1.3; }
      }
      const speed = Math.hypot(V.x, V.z);
      if (speed > 0.05) {
        _a.set(V.z, 0, -V.x).normalize();
        _qb.setFromAxisAngle(_a, speed * dt / T.ball);
        b.mesh.quaternion.premultiply(_qb);
      }
      if (speed > 3 && P.y - floor < 0.3 && p.pos.distanceToSquared(P) < 600 * 600) G.fx.emit(P, 4 * dt, { colors: ['#ffffff', b.color], speed: 2, life: 0.8, size: 1.2, drag: 1.5 }); // sugar dust
      b.slow = speed < 0.4 ? b.slow + dt : 0;
      if (b.t > T.life || b.slow > 4 || d > 600) { this.popGumball(i); continue; }
      // Shot: popped, for points.
      let shot = false;
      for (let j = p.bullets.length - 1; j >= 0; j--) {
        if (p.bullets[j].pos.distanceToSquared(P) < (T.ball + 2) ** 2) { p.removeBullet(j); shot = true; break; }
      }
      if (shot) {
        G.score += T.score;
        G.fx.popText(P.clone().setY(P.y + 5), `+${T.score} Gumball popped!`);
        G.audio.pop?.();
        if (!this.gumTip) { this.gumTip = true; G.ui.notify('Pop! Shoot the gumballs the machine rolls out for points.', 'info', 4, 1); }
        this.popGumball(i, 40);
        continue;
      }
      // Flown into: just a sticky splat, no harm done.
      if (!p.dead && p.pos.distanceTo(P) < T.ball + 2.5 * (p.sizeScale || 1)) {
        G.fx.popText(P.clone().setY(P.y + 5), 'Splat!');
        G.audio.pop?.();
        this.popGumball(i, 30);
      }
    }
    if (p.dead) return;
    // The machine itself: plinth, pedestal, globe and lid.
    const L = this.archLocal(m, _local), r = 2.5 * (p.sizeScale || 1), tr = this.gumRadius(m, L.y), d = Math.hypot(L.x, L.z);
    if (tr !== null && d < tr + r) {
      const cs = Math.cos(m.yaw), sn = Math.sin(m.yaw);
      const k = d > 1e-3 ? (tr + r - d) / d : 0, px = L.x * k, pz = d > 1e-3 ? L.z * k : tr + r;
      p.pos.x += px * cs + pz * sn; p.pos.z += -px * sn + pz * cs;
      if (m.bumpT <= 0) {
        m.bumpT = T.bumpEvery;
        p.damage(T.dmg);
        G.fx.emit(p.pos, 18, { colors: ['#d8202e', '#f0c040', '#ffffff'], speed: 18, life: 0.8, size: 4 });
        if (!this.gumBumpTip) { this.gumBumpTip = true; G.ui.notify('The gumball machine is solid! Shoot the gumballs it rolls out for points.', 'warn', 4, 1); }
      }
    }
  }
  // ---- Dune Sea: the camel caravan ---------------------------------------------------------------------------------
  get caravanInfo() { return this.caravan; }

  dropCaravan() {
    if (!this.caravan) return;
    this.G.scene.remove(this.caravan.group);
    for (const geo of this.caravan.geos) geo.dispose();
    this.caravan = null;
  }

  // A dry route ahead, roughly across your way: every point of it on sand above the sea.
  placeCaravan() {
    const G = this.G, p = G.player, f = p.forward.clone().setY(0), T = CARAVAN;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    for (let tries = 0; tries < 6; tries++) {
      const d = rand(T.near, T.far), s = rand(-0.3, 0.3) * d, a = Math.atan2(-f.z, f.x) + Math.PI / 2 + rand(-0.5, 0.5) + (Math.random() < 0.5 ? 0 : Math.PI);
      const dx = Math.cos(a), dz = -Math.sin(a); // the way it walks
      const mx = p.pos.x + f.x * d - f.z * s, mz = p.pos.z + f.z * d + f.x * s;
      const x0 = mx - dx * T.route / 2, z0 = mz - dz * T.route / 2;
      let dry = true;
      for (let k = -2; k <= 10 && dry; k++) dry = G.terrain.surfaceHeight(x0 + dx * T.route * k / 8, z0 + dz * T.route * k / 8) > G.world.seaLevel + 2;
      if (!dry) continue;
      return this.buildCaravan(x0, z0, Math.atan2(dx, dz));
    }
    return null;
  }

  // One camel (its local +z is forward), on its own group so it can follow the ground. lead: with a rider.
  buildCamel(M, mesh, k, lead) {
    const c = new THREE.Group(), body = new THREE.Group();
    c.add(body);
    const ball = (sx, sy, sz, mat, x, y, z, parent = body) => { const o = mesh(new THREE.SphereGeometry(1, 10, 8), mat, parent); o.scale.set(sx, sy, sz); o.position.set(x, y, z); return o; };
    const box = (w, h, d, mat, x, y, z, parent = body) => { const o = mesh(new THREE.BoxGeometry(w, h, d), mat, parent); o.position.set(x, y, z); return o; };
    ball(1.35, 1.1, 2.5, M.camel, 0, 4.3, 0);
    ball(1.05, 1.0, 1.3, M.camel, 0, 5.4, -0.4); // the hump
    // Legs: hips at the corners, swinging from there; knobbly knees, dark hooves.
    const legs = [], hooves = [];
    for (const [lx, lz] of [[-0.8, 1.6], [0.8, 1.6], [-0.8, -1.7], [0.8, -1.7]]) {
      const hip = new THREE.Group();
      hip.position.set(lx, 3.9, lz);
      body.add(hip);
      box(0.55, 2.1, 0.6, M.camel, 0, -1, 0, hip);
      ball(0.36, 0.36, 0.36, M.camel, 0, -2.1, 0, hip);
      box(0.42, 1.8, 0.45, M.camel, 0, -3, 0, hip);
      hooves.push(box(0.7, 0.3, 0.8, M.hoof, 0, -3.8, 0.1, hip));
      legs.push(hip);
    }
    // The long neck curving up and forward to the head; it nods as it walks.
    const neck = new THREE.Group();
    neck.position.set(0, 4.6, 2.2);
    body.add(neck);
    const n1 = box(0.8, 2.6, 0.9, M.camel, 0, 1.0, 0.6, neck);
    n1.rotation.x = 0.7;
    const head = new THREE.Group();
    head.position.set(0, 2.2, 1.6);
    neck.add(head);
    box(0.8, 0.85, 1.7, M.camel, 0, 0, 0.5, head);
    box(0.62, 0.55, 0.5, M.hoof, 0, -0.15, 1.35, head); // the muzzle
    for (const ex of [-0.42, 0.42]) { box(0.12, 0.22, 0.22, M.dark, ex, 0.18, 0.7, head); box(0.18, 0.4, 0.18, M.camel, ex * 0.7, 0.55, -0.1, head); } // eyes, ears
    box(0.3, 1.1, 0.3, M.camel, 0, 3.9, -2.6).rotation.x = 0.35; // the tail
    // Tack: a striped rug over the hump; packs on the followers; the lead carries its rider.
    const rug = M.rugs[k % M.rugs.length];
    box(2.9, 0.25, 2.2, rug, 0, 5.75, 0.9);
    for (const sx of [-1, 1]) box(0.25, 1.4, 2.2, rug, sx * 1.45, 5.0, 0.9);
    box(3.0, 0.3, 0.3, M.gold, 0, 5.95, 2.05);
    if (lead) {
      const rider = new THREE.Group();
      rider.position.set(0, 6, 0.9);
      body.add(rider);
      mesh(new THREE.ConeGeometry(0.9, 2.8, 10), M.robe, rider).position.y = 1.2;
      ball(0.5, 0.55, 0.5, M.skin, 0, 2.9, 0, rider);
      ball(0.62, 0.42, 0.62, M.indigo, 0, 3.25, 0, rider); // the turban
      box(0.9, 0.9, 0.12, M.indigo, 0, 2.7, 0.45, rider); // the face veil
      for (const sx of [-1, 1]) box(0.3, 0.3, 1.6, M.robe, sx * 0.55, 2.1, 0.6, rider).rotation.x = 0.5; // arms on the reins
      box(0.06, 0.06, 3.2, M.dark, 0, 1.6, 1.8, rider).rotation.x = 0.35; // the reins
    } else {
      for (const sx of [-1, 1]) {
        box(0.9, 1.6, 1.6, M.pack, sx * 1.85, 4.4, -0.5);
        box(0.95, 0.2, 1.7, M.dark, sx * 1.85, 4.9, -0.5);
      }
      mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.6, 8), M.rugs[(k + 1) % M.rugs.length], body).rotation.z = Math.PI / 2; // a rolled rug
      body.children[body.children.length - 1].position.set(0, 6.2, -0.9);
    }
    return { group: c, body, legs, hooves, lead, x: 0, z: 0, s: 0, ds: 0, neck, head, phase: rand(0, 6), walking: false, dustT: rand(0, 0.3) };
  }

  buildCaravan(x0, z0, yaw) {
    const T = CARAVAN;
    const M = (this.caravanMats ||= {
      camel: new THREE.MeshLambertMaterial({ color: '#c8965a', flatShading: true }),
      hoof: new THREE.MeshLambertMaterial({ color: '#6a4a30', flatShading: true }),
      dark: new THREE.MeshLambertMaterial({ color: '#2a1e18' }),
      robe: new THREE.MeshLambertMaterial({ color: '#f2ece0', flatShading: true }),
      indigo: new THREE.MeshLambertMaterial({ color: '#2e3f8a', flatShading: true }),
      skin: new THREE.MeshLambertMaterial({ color: '#a8704a', flatShading: true }),
      gold: new THREE.MeshLambertMaterial({ color: '#e8b830', flatShading: true }),
      pack: new THREE.MeshLambertMaterial({ color: '#8a6a44', flatShading: true }),
      rugs: ['#c0302a', '#2a6ab0', '#d88a20', '#7a2a7a'].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true })),
    });
    const G = this.G, g = new THREE.Group(), geos = [];
    const mesh = (geo, mat, parent) => { geos.push(geo); const o = new THREE.Mesh(geo, mat); parent.add(o); return o; };
    const camels = [];
    for (let k = 0; k < T.camels; k++) {
      const c = this.buildCamel(M, mesh, k, k === 0);
      g.add(c.group);
      camels.push(c);
    }
    G.scene.add(g);
    this.caravan = { group: g, geos, camels, x0, z0, yaw, dx: Math.sin(yaw), dz: Math.cos(yaw), s: T.spacing * (T.camels - 1), buzzed: false, bumpT: 0 };
    this.placeCamels(0);
    return this.caravan;
  }

  // Walk the caravan on by dt and set every camel on the ground underfoot, tilted to the slope.
  placeCamels(dt) {
    const t = this.caravan, T = CARAVAN, G = this.G, h = (x, z) => G.terrain.surfaceHeight(x, z);
    t.s = Math.min(T.route, t.s + T.speed * dt);
    t.camels.forEach((c, k) => {
      const s = Math.max(0, t.s - k * T.spacing);
      c.walking = dt > 0 && s > c.s + 1e-6;
      c.ds = s - c.s;
      c.s = s;
      c.x = t.x0 + t.dx * s; c.z = t.z0 + t.dz * s;
      const L = 2.5 * T.scale, W = 1.2 * T.scale, y = h(c.x, c.z), yf = h(c.x + t.dx * L, c.z + t.dz * L), yb = h(c.x - t.dx * L, c.z - t.dz * L);
      const yr = h(c.x + t.dz * W, c.z - t.dx * W), yl = h(c.x - t.dz * W, c.z + t.dx * W); // its right (+x) and left
      c.group.position.set(c.x, y, c.z);
      c.group.rotation.set(0, t.yaw, 0);
      c.group.scale.setScalar(T.scale);
      c.body.rotation.x = -Math.atan2(yf - yb, 2 * L); // nose up a rising dune
      c.roll = Math.atan2(yr - yl, 2 * W); // and leaning with the slope across it
    });
  }

  updateCaravan(dt) {
    const G = this.G, p = G.player, T = CARAVAN;
    const lead0 = this.caravan?.camels[0];
    if (lead0 && Math.hypot(lead0.x - p.pos.x, lead0.z - p.pos.z) > T.drop) this.dropCaravan();
    if (!this.caravan && !G.terrain.stale && (this.caravanT -= dt) <= 0) { this.caravanT = 0.5; this.placeCaravan(); }
    const t = this.caravan;
    if (!t) return;
    this.placeCamels(dt);
    const near = p.pos.distanceToSquared(t.camels[0].group.position) < 800 * 800;
    for (const c of t.camels) {
      // Legs swing in diagonal pairs, the neck nods, the body sways; at rest they stand and look about.
      if (c.walking) c.phase += c.ds / (T.swing * T.leg * T.scale); // a stance hoof moves back as fast as the ground goes by
      const w = c.walking ? 1 : 0, sw = Math.sin(c.phase) * T.swing * w;
      c.body.position.y = -T.leg * (1 - Math.cos(sw)); // dips as the legs swing out, so the hooves stay on the sand
      c.legs[0].rotation.x = sw; c.legs[3].rotation.x = sw;
      c.legs[1].rotation.x = -sw; c.legs[2].rotation.x = -sw;
      c.neck.rotation.x = c.walking ? Math.sin(c.phase * 2) * 0.12 : Math.sin(G.time * 0.6 + c.phase) * 0.08;
      c.head.rotation.y = c.walking ? 0 : Math.sin(G.time * 0.4 + c.phase) * 0.5;
      c.body.rotation.z = (c.roll || 0) + Math.sin(c.phase) * 0.04 * w;
      // Each leg reaches down (or folds up) to the sand under its own hoof, so none floats or sinks on a rough dune.
      if (near) {
        for (let pass = 0; pass < 2; pass++) { // twice: a tilted leg reaches a little less far than it stretches
          c.group.updateMatrixWorld(true);
          c.hooves.forEach((hf, i) => {
            hf.getWorldPosition(_q);
            const gap = _q.y - (G.terrain.surfaceHeight(_q.x, _q.z) + 0.2 * T.scale), leg = c.legs[i];
            leg.scale.y = Math.min(1.7, Math.max(0.5, leg.scale.y + gap / (T.leg * T.scale))); // too high: a longer leg
          });
        }
      }
      if (c.walking && near && (c.dustT -= dt) <= 0) {
        c.dustT = 0.35;
        G.fx.emit(c.group.position, 2, { colors: ['#e8c890', '#d8b070', '#f0dcb0'], speed: 3, life: 1.3, size: 2.5, gravity: 1, drag: 1.2 });
      }
    }
    t.bumpT = Math.max(0, t.bumpT - dt);
    if (p.dead) return;
    const r = 2.5 * (p.sizeScale || 1), cs = Math.cos(t.yaw), sn = Math.sin(t.yaw);
    let hit = false;
    for (const c of t.camels) {
      // Into the camel's own frame: x across, y up from its feet, z forward.
      const q = c.group.position, k = T.scale, dx = (p.pos.x - q.x) / k, dz = (p.pos.z - q.z) / k, rr = r / k;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, ly = (p.pos.y - q.y) / k; // in the unscaled camel's metres
      const hx = (c.lead ? 1.6 : 2.4) + rr, z0 = -3.4 - rr, z1 = (ly > 4 ? 6.2 : 3.2) + rr, y1 = 6.6 + (c === t.camels[0] ? 3.5 : 0) + rr;
      if (Math.abs(lx) >= hx || lz <= z0 || lz >= z1 || ly >= y1 || ly <= -rr) continue;
      // Out along the shallowest way: sideways, ahead or behind, or up.
      const ox = (lx >= 0 ? hx : -hx) - lx, oz = (lz >= 0 ? z1 : z0) - lz, oy = y1 - ly;
      const m = Math.min(Math.abs(ox), Math.abs(oz), oy);
      let mx = 0, mz = 0;
      if (m === Math.abs(ox)) mx = ox * k; else if (m === Math.abs(oz)) mz = oz * k; else p.pos.y += oy * k;
      p.pos.x += mx * cs + mz * sn; p.pos.z += -mx * sn + mz * cs;
      hit = true;
    }
    // Low past the lead camel: buzzing the caravan.
    const lead = t.camels[0].group.position;
    if (!hit && !t.buzzed && !p.landed && Math.hypot(p.pos.x - lead.x, p.pos.y - lead.y - 4 * T.scale, p.pos.z - lead.z) < T.close) {
      t.buzzed = true;
      G.score += T.score;
      G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${T.score} Buzzing the caravan!`);
      G.fx.emit(p.pos, 30, { colors: ['#e8c890', '#c0302a', '#2a6ab0', '#e8b830'], speed: 16, life: 1.4, size: 3, gravity: -5 });
    }
    if (hit && t.bumpT <= 0) {
      t.bumpT = T.bumpEvery;
      p.damage(T.dmg);
      G.fx.emit(p.pos, 18, { colors: ['#c8965a', '#e8c890', '#f2ece0'], speed: 18, life: 0.8, size: 4 });
      if (!this.caravanTip) { this.caravanTip = true; G.ui.notify('Camels are solid! Buzz low past the lead camel for points.', 'warn', 4, 1); }
    }
  }
}
