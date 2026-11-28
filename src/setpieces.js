// Land set pieces: big landmarks that belong to one land. Volcano Land's fire geysers, Princess Kingdom's castle,
// meteors falling onto the Moon and Mars, Frozen Peaks' ice arches, the Tropical Archipelago's breaching whales and
// the Mushroom Forest's giant bounce mushrooms, the Autumn Woods' great windmill, Canyon Country's railway trestle, the Candy Kingdom's
// gumball machine, the Dune Sea's camel caravan, the Meadowlands' big red barn, the Giant's Garden watering can, the
// Salt Mirror's flamingo flock and the Cloud Kingdom's golden harp.
// Fire geysers: Dark rock cones sit
// on the slopes above the lava; every so often one rumbles (its crater glows brighter, smoke and embers puff out) and
// then blows a tall pillar of fire straight up. Flying through the pillar scorches you; skimming past it, close but
// not in it, is a "Toasty!" near miss worth a few points. The effects are kept subtle: a warm glow, not a light show.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
// Meadowlands: a big red barn with doors open at both ends. Flying in one door and out the other is "Barnstormer!".
export const BARN = {
  near: 550, far: 900,   // a new barn appears this far ahead, doorway toward you
  drop: 1500,
  wait: 20,              // s airborne in the land before the first one, so the starting runway stays clear
  len: 60, wid: 32,      // along the doors' line, and across
  wall: 1.6,             // wall thickness
  doorW: 22, doorH: 16,  // each end's doorway
  eave: 18, brk: 26, ridge: 30, // the gambrel roof: eaves, where the slope breaks, the ridge
  brkX: 10,              // half width at the break
  base: 14,              // the stone footing, walls and floor go this far down, for a rolling meadow
  slope: 12,             // the most the ground may rise and fall across the footprint (the footing makes up the rest)
  apron: 40,             // the ground this far out of each door must not block it
  siloR: 6, siloH: 34, siloGap: 8, // the silo, standing off one long side
  chickens: 6, scare: 30, scareUp: 20, // chickens scatter when you pass this close, this low
  hop: 3, flee: 8, settle: 3,          // up 3 m, 8 m away, pecking again after 3 s
  score: 40,
  dmg: 6, bumpEvery: 1,  // x1.5 enemy damage = 9 hull, at most once a second
};

// Giant's Garden: a giant's watering can stands in the flowerbeds, its rose still dripping a curtain of water. Its top
// handle arches over the open can: fly under it, through the gap, for a bonus. The water is harmless: it pushes you
// down a little and splashes you clean. The tin is solid.
export const CAN = {
  near: 550, far: 900, drop: 1500,
  R: 16, H: 26,          // the can's radius and height (local y 0 is the ground on its low side)
  slope: 8,              // the most the ground may rise across its foot (the can sinks into the high side)
  handleR: 16, tube: 1.6, // the top handle: an arch over the can's mouth, in the plane of the spout
  backR: 8,              // the back handle, on the side away from the spout
  spoutLen: 34, spoutTip: 34, // the spout reaches out this far beyond the rim, up to this height
  roseR: 5,              // the sprinkler head on the spout's tip
  streamR: 5, streamPush: 10, // the dripping curtain: its radius, and how fast it pushes you down (m/s), easing off
  streamEase: 8,         // over this many metres above the puddle, so it never pushes you into the ground
  drops: 36,
  score: 30,             // through the handle, once per can
  splash: 10,            // flying through the water, once per can
  dmg: 6, bumpEvery: 1,
};

// Salt Mirror: a flock of flamingos wading in the shallow water, feeding and preening. Buzz them low and the whole
// flock runs across the water and takes off, circles the flat in a V and glides back down to its spot. Fly along with
// the flock for a bonus. The birds are harmless: brushing one only ruffles its feathers.
export const FLOCK = {
  near: 450, far: 800, drop: 1500,
  birds: 14, spread: 24, gap: 4.5, // the flock stands within this radius of its middle, birds at least this far apart
  size: 2.6,             // a flamingo is about 1.5 m tall, shown at this scale so you see them from the air
  wade: [-1.5, 0],       // the ground under every bird, from the water's surface: they wade in the shallows
  scare: 55, scareUp: 30, // buzzing the flock this close, this low, sends it up
  rest: 8,               // s on the ground after landing before it can be sent up again
  takeoff: 6, landing: 8, // s of the run and climb, and of the glide down
  loop: 110, speed: 26,  // the flight: one loop of this radius at this speed (m/s), back to where they started
  alt: 40,               // m over the water
  rank: [4.5, 3.6],      // the V: each rank this far behind and to the side
  startle: 10,           // sending them up, once per flock
  with: 30, withT: 2.5, score: 40, // this close to any bird of the flock for this long, in the air: "Flying with the flamingos!"
  brush: 3.5,            // m: closer than this ruffles a bird's feathers
};

// Cloud Kingdom: a giant golden harp stands on the clouds, the one nobody tunes. Its strings are harmless: fly through
// one and it rings out; skim along them and you play a glissando for a bonus. Its gold frame is solid.
export const HARP = {
  near: 550, far: 900, drop: 1500,
  slope: 8, base: 10,    // the ground may fall this much across the pedestal, which sinks this far into the cloud
  P: 6, padW: 16, padD: 10, padX: -21, // the pedestal: its height over the low side, its length and depth, and where
                         // it stands (under the pillar and the soundboard's foot, the harp's base)
  pillarX: -24, top: 76, // the pillar (the harp's front column) and the height of its capital
  board: [[-20, 9], [24, 50]], boardR: [3.2, 1.6], // the soundboard, from its foot up to the neck, widest at the foot
  neck: [[-24, 76], [-12, 74], [0, 66], [10, 61], [18, 60], [24, 54]], neckR: 1.8, // the neck's S-curve
  strings: 13, x0: -17, dx: 3, sR: 0.18, // the strings: how many, where the first stands, how far apart, how thick
  reach: 0.8,            // a string sounds when you pass this close to it (past your plane's own size)
  gliss: 6, glissT: 2.5, score: 40, // this many different strings within this many seconds: "Glissando!", once per harp
  ghost: [2, 5], ghostNear: 400, // now and then a string rings on its own, when you're this close
  dmg: 6, bumpEvery: 1,
};

const GUM_COLORS = ['#ff4d8d', '#ffd23a', '#4dc4ff', '#7aff7a', '#b07aff', '#ff8a3a', '#ffffff'];

const _Y = new THREE.Vector3(0, 1, 0), _qb = new THREE.Quaternion();
const CAPS = ['#ff4dc4', '#7aff5a', '#4de8ff', '#b07aff'];

const _local = new THREE.Vector3(), _col = new THREE.Color(), _white = new THREE.Color('#ffffff');
const _m4 = new THREE.Matrix4(), _dir = new THREE.Vector3(), _pos = new THREE.Vector3();
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
    this.barn = null;
    this.barnT = 0;
    this.barnWait = 0;
    this.barnTip = false;
    this.barnMats = null; // made with the first barn, like the mill's
    this.can = null;
    this.canT = 0;
    this.canTip = false;
    this.canMats = null; // made with the first can, like the mill's
    this.flock = null;
    this.flockT = 0;
    this.flockParts = null; // the flamingo's shared parts and material, made with the first flock
    this.harp = null;
    this.harpT = 0;
    this.harpTip = false;
    this.harpBumpTip = false;
    this.harpMats = null; // made with the first harp, like the mill's
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
    this.dropBarn();
    this.barnT = 0;
    this.barnWait = BARN.wait;
    this.dropCan();
    this.canT = 0;
    this.dropFlock();
    this.flockT = 0;
    this.dropHarp();
    this.harpT = 0;
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
    if (this.kind === 'barn') { this.updateBarn(dt); return; }
    if (this.kind === 'can') { this.updateCan(dt); return; }
    if (this.kind === 'flock') { this.updateFlock(dt); return; }
    if (this.kind === 'harp') { this.updateHarp(dt); return; }
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
  // ---- Meadowlands: the big red barn -------------------------------------------------------------------------------
  // One barn at a time, out ahead of you with a doorway facing your way: red plank walls with white trim, open doors at
  // both ends, a gambrel roof with a cupola and a rooster weathervane, a silo standing off one side, a stack of round
  // hay bales and a few chickens pecking about. In one door and out the other is "Barnstormer!", once per barn. Walls,
  // roof, silo and bales are solid (a little knock, shoved clear, never a wreck); the chickens just scatter.
  get barnInfo() { return this.barn; }

  dropBarn() {
    if (!this.barn) return;
    this.G.scene.remove(this.barn.group);
    for (const geo of new Set(this.barn.geos)) geo.dispose();
    this.barn = null;
  }

  // The ground at a point in a barn's frame (lx across, lz along the doors' line) for a barn at (x, z) facing yaw.
  barnGround(x, z, yaw, lx, lz) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    return this.G.terrain.surfaceHeight(x + lx * cs + lz * sn, z - lx * sn + lz * cs);
  }

  // Gently rolling dry ground ahead, with nothing rising into either doorway.
  placeBarn() {
    const G = this.G, p = G.player, f = p.forward.clone().setY(0), B = BARN, W = B.wid / 2, L = B.len / 2;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    // The meadow rolls a lot, so look at a couple of dozen spots, each turned four ways, and take the first that fits.
    let x = 0, z = 0;
    for (let tries = 0; tries < 24 * 4; tries++) {
      if (tries % 4 === 0) { const d = rand(B.near, B.far), s = rand(-0.35, 0.35) * d; x = p.pos.x + f.x * d - f.z * s; z = p.pos.z + f.z * d + f.x * s; }
      // First with the doors' line pointing back at you (you see straight through), then turned along the hillside.
      const yaw = Math.atan2(p.pos.x - x, p.pos.z - z) + (tries % 4) * Math.PI / 4;
      const hs = [];
      for (const lx of [-W, 0, W]) for (const lz of [-L, -L / 2, 0, L / 2, L]) hs.push(this.barnGround(x, z, yaw, lx, lz));
      const lo = Math.min(...hs), hi = Math.max(...hs), sea = G.world.seaLevel;
      if (hi - lo > B.slope || lo < sea + 2) continue;
      // The floor sits on the highest ground of the footprint (walls and floor reach down into the rest), so no grass
      // pokes up inside; out of each door the meadow must not rise into the doorway.
      let open = true;
      for (const e of [-1, 1]) for (const k of [0.4, 1]) for (const lx of [-B.doorW / 2, 0, B.doorW / 2]) {
        const g = this.barnGround(x, z, yaw, lx, e * (L + B.apron * k));
        if (g > hi + 1 || g < sea + 1) open = false;
      }
      const silo = this.barnGround(x, z, yaw, W + B.siloGap + B.siloR, -L / 3);
      if (!open || silo < sea + 1 || silo < hi - B.base + 1) continue;
      return this.buildBarn(x, hi, z, yaw);
    }
    return null;
  }

  // The top of the roof at |x| = ax across the barn (above the floor): steep below the break, shallow above it. The
  // roof overhangs the walls by 1 m.
  barnRoof(ax) {
    const B = BARN;
    if (ax <= B.brkX) return B.ridge - (B.ridge - B.brk) * ax / B.brkX;
    return B.brk - (B.brk - B.eave) * (Math.min(ax, B.wid / 2 + 1) - B.brkX) / (B.wid / 2 - B.brkX);
  }

  // A chicken (local +z is forward, 2x size), on its own group so it can hop about.
  buildHen(M, mesh, brown) {
    const c = new THREE.Group(), feather = brown ? M.hen2 : M.hen;
    const ball = (sx, sy, sz, mat, x, y, z, parent = c) => { const o = mesh(new THREE.SphereGeometry(1, 8, 6), mat, parent); o.scale.set(sx, sy, sz); o.position.set(x, y, z); return o; };
    const box = (w, h, d, mat, x, y, z, parent = c) => { const o = mesh(new THREE.BoxGeometry(w, h, d), mat, parent); o.position.set(x, y, z); return o; };
    ball(0.42, 0.38, 0.55, feather, 0, 0.75, 0);
    ball(0.2, 0.34, 0.26, feather, 0, 1.02, -0.5).rotation.x = -0.5; // the tail
    const head = new THREE.Group();
    head.position.set(0, 1.08, 0.42);
    c.add(head);
    ball(0.2, 0.22, 0.22, feather, 0, 0.1, 0.06, head);
    const beak = mesh(new THREE.ConeGeometry(0.07, 0.2, 4), M.beak, head);
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.07, 0.32);
    box(0.06, 0.14, 0.22, M.comb, 0, 0.34, 0.06, head);
    box(0.06, 0.12, 0.06, M.comb, 0, -0.06, 0.24, head); // the wattle
    const wings = [-1, 1].map((sx) => {
      const w = new THREE.Group();
      w.position.set(sx * 0.4, 0.88, 0);
      c.add(w);
      box(0.08, 0.32, 0.6, feather, sx * 0.04, -0.12, 0, w);
      return w;
    });
    for (const sx of [-1, 1]) box(0.05, 0.4, 0.05, M.beak, sx * 0.14, 0.2, 0);
    c.scale.setScalar(2);
    return { group: c, head, wings };
  }

  buildBarn(x, y, z, yaw) {
    const M = (this.barnMats ||= {
      red: new THREE.MeshLambertMaterial({ color: '#b3362c', flatShading: true }),
      red2: new THREE.MeshLambertMaterial({ color: '#8e2a24', flatShading: true }),
      trim: new THREE.MeshLambertMaterial({ color: '#f3eee4', flatShading: true }),
      roof: new THREE.MeshLambertMaterial({ color: '#4d4446', flatShading: true }),
      dark: new THREE.MeshLambertMaterial({ color: '#2a1e1a' }),
      floor: new THREE.MeshLambertMaterial({ color: '#8a6a44', flatShading: true }),
      stone: new THREE.MeshLambertMaterial({ color: '#8d877c', flatShading: true }),
      straw: new THREE.MeshLambertMaterial({ color: '#e6c25a', flatShading: true }),
      metal: new THREE.MeshLambertMaterial({ color: '#c3c8cc', flatShading: true }),
      metal2: new THREE.MeshLambertMaterial({ color: '#9aa2a8', flatShading: true }),
      iron: new THREE.MeshLambertMaterial({ color: '#2b2b2e', flatShading: true }),
      hen: new THREE.MeshLambertMaterial({ color: '#f4efe6', flatShading: true }),
      hen2: new THREE.MeshLambertMaterial({ color: '#c8884a', flatShading: true }),
      comb: new THREE.MeshLambertMaterial({ color: '#d8302a', flatShading: true }),
      beak: new THREE.MeshLambertMaterial({ color: '#f0b030', flatShading: true }),
    });
    const B = BARN, G = this.G, g = new THREE.Group(), geos = [], W = B.wid / 2, L = B.len / 2, T = B.wall;
    const mesh = (geo, mat, parent = g) => { geos.push(geo); const o = new THREE.Mesh(geo, mat); parent.add(o); return o; };
    const box = (w, h, d, mat, px, py, pz, parent = g) => { const o = mesh(new THREE.BoxGeometry(w, h, d), mat, parent); o.position.set(px, py, pz); return o; };
    const boxes = []; // the solid ones, in the barn's frame
    const solid = (x0, x1, z0, z1, y0, y1, o = {}) => boxes.push({ x0, x1, z0, z1, y0, y1, ...o });
    // Floor: planks sunk into the meadow, with straw strewn down the middle.
    box(B.wid, B.base, B.len, M.floor, 0, -B.base / 2, 0);
    box(B.wid + T + 0.8, B.base, B.len + T + 0.8, M.stone, 0, -B.base / 2 - 0.05, 0); // the fieldstone footing, on a slope
    solid(-W, W, -L, L, -B.base, 0, { floor: true });
    box(B.wid - 6, 0.3, B.len - 4, M.straw, 0, 0.15, 0);
    // The long walls: red boards with darker battens, white corner trim and white-framed windows.
    for (const sx of [-1, 1]) {
      const out = sx * (W + T / 2);
      box(T, B.eave + B.base, B.len, M.red, sx * W, (B.eave - B.base) / 2, 0);
      solid(W - T / 2, W + T / 2, -L, L, -B.base, B.eave, { mirror: sx });
      for (let k = -L + 5; k < L - 2; k += 5) box(0.3, B.eave - 1, 0.5, M.red2, out + sx * 0.12, B.eave / 2, k);
      for (const e of [-1, 1]) box(0.6, B.eave, 1.2, M.trim, out + sx * 0.2, B.eave / 2, e * (L - 0.4));
      box(0.6, 1, B.len, M.trim, out + sx * 0.2, B.eave - 0.5, 0);
      for (const k of [-L / 2, 0, L / 2]) {
        box(0.6, 4.6, 4.6, M.trim, out + sx * 0.2, 11, k);
        box(0.7, 3.8, 3.8, M.dark, out + sx * 0.25, 11, k);
        box(0.8, 3.8, 0.35, M.trim, out + sx * 0.3, 11, k);
        box(0.8, 0.35, 3.8, M.trim, out + sx * 0.3, 11, k);
      }
    }
    // The end walls: the gambrel gable with the big doorway cut out of it.
    const gable = new THREE.Shape();
    gable.moveTo(-W - T / 2, -B.base); gable.lineTo(W + T / 2, -B.base); gable.lineTo(W + T / 2, B.eave);
    gable.lineTo(B.brkX, B.brk); gable.lineTo(0, B.ridge); gable.lineTo(-B.brkX, B.brk); gable.lineTo(-W - T / 2, B.eave);
    gable.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-B.doorW / 2, 0); hole.lineTo(-B.doorW / 2, B.doorH); hole.lineTo(B.doorW / 2, B.doorH); hole.lineTo(B.doorW / 2, 0);
    hole.closePath();
    gable.holes.push(hole);
    const endGeo = new THREE.ExtrudeGeometry(gable, { depth: T, bevelEnabled: false });
    endGeo.translate(0, 0, -T / 2);
    const leafW = B.doorW / 2, leafH = B.doorH, diag = Math.hypot(leafW - 1, leafH - 1), tilt = Math.atan2(leafH - 1, leafW - 1);
    for (const e of [-1, 1]) {
      mesh(endGeo, M.red).position.z = e * L;
      const fz = e * (L + T / 2 + 0.3);
      for (const sx of [-1, 1]) box(1, B.doorH + 1, 0.6, M.trim, sx * (B.doorW / 2 + 0.5), B.doorH / 2, fz);
      box(B.doorW + 2, 1, 0.6, M.trim, 0, B.doorH + 0.5, fz);
      box(B.doorW + 6, 0.5, 0.7, M.iron, 0, B.doorH + 1.6, e * (L + T / 2 + 0.5)); // the hinge rail
      // The doors, swung wide open: red, framed and crossed in white.
      for (const sx of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(sx * (B.doorW / 2 + 0.2), 0, e * (L + T / 2 + 0.6));
        hinge.rotation.y = -e * sx * 0.45; // open about 155 degrees: the far edge stands off the wall
        g.add(hinge);
        const lx = sx * leafW / 2;
        box(leafW, leafH, 0.5, M.red, lx, leafH / 2, 0, hinge);
        for (const yy of [0.4, leafH - 0.4]) box(leafW, 0.8, 0.7, M.trim, lx, yy, 0, hinge);
        for (const xx of [0.4, leafW - 0.4]) box(0.8, leafH, 0.7, M.trim, sx * xx, leafH / 2, 0, hinge);
        for (const s of [-1, 1]) box(diag, 0.7, 0.7, M.trim, lx, leafH / 2, 0, hinge).rotation.z = s * tilt;
      }
      // The hayloft door up in the gable, with its hoist beam.
      box(6.6, 6.6, 0.5, M.trim, 0, 21.5, fz);
      box(5.4, 5.4, 0.6, M.red2, 0, 21.5, fz + e * 0.05);
      for (const s of [-1, 1]) box(7, 0.5, 0.7, M.trim, 0, 21.5, fz + e * 0.1).rotation.z = s * Math.PI / 4;
      box(1, 1, 4, M.floor, 0, 27, e * (L + 2));
    }
    // The roof: four long panels (steep below the break, shallow above it), white boards along the gable edges, a
    // ridge cap, and a little cupola with the weathervane on top.
    const prof = [[W + 1, this.barnRoof(W + 1)], [B.brkX, B.brk], [0, B.ridge]];
    for (let i = 0; i < 2; i++) {
      const [x1, y1] = prof[i], [x2, y2] = prof[i + 1], len = Math.hypot(x1 - x2, y1 - y2), a = Math.atan2(y1 - y2, x1 - x2);
      const nx = -Math.sin(a), ny = Math.cos(a); // the panel's outward normal (on the +x side)
      for (const sx of [-1, 1]) {
        const px = sx * ((x1 + x2) / 2 + nx * 0.4), py = (y1 + y2) / 2 + ny * 0.4;
        box(len + 0.6, 0.8, B.len + 3, M.roof, px, py, 0).rotation.z = sx * a;
        for (const e of [-1, 1]) box(len + 0.6, 1, 0.5, M.trim, sx * ((x1 + x2) / 2 + nx * 0.9), (y1 + y2) / 2 + ny * 0.9, e * (L + 1.6)).rotation.z = sx * a;
      }
    }
    box(1.6, 0.8, B.len + 3, M.roof, 0, B.ridge + 0.7, 0);
    box(4, 3.6, 4, M.red, 0, B.ridge + 2.4, 0);
    for (const k of [-1, 1]) { box(4.2, 0.4, 4.2, M.trim, 0, B.ridge + 0.8 + k * 1.6 + 1.6, 0); }
    box(4.1, 1.6, 3.2, M.dark, 0, B.ridge + 2.4, 0); box(3.2, 1.6, 4.1, M.dark, 0, B.ridge + 2.4, 0); // the vents
    const cap = mesh(new THREE.ConeGeometry(3.6, 2.6, 4), M.roof);
    cap.position.y = B.ridge + 5.5; cap.rotation.y = Math.PI / 4;
    box(0.25, 4, 0.25, M.iron, 0, B.ridge + 8.5, 0);
    for (const a of [0, Math.PI / 2]) box(3, 0.15, 0.15, M.iron, 0, B.ridge + 8, 0).rotation.y = a; // the compass arms
    const vane = new THREE.Group();
    vane.position.y = B.ridge + 9.6;
    g.add(vane);
    box(0.18, 0.18, 4.2, M.iron, 0, 0, 0, vane); // the arrow: its point into the wind (local +z), the fin behind
    const tipC = mesh(new THREE.ConeGeometry(0.35, 0.8, 4), M.iron, vane);
    tipC.rotation.x = Math.PI / 2; tipC.position.z = 2.4;
    box(0.12, 0.9, 1, M.iron, 0, 0.2, -2, vane);
    box(0.14, 1.1, 1.7, M.iron, 0, 1.1, 0.1, vane); // the rooster: body, tail, neck and head, comb
    box(0.14, 1.4, 0.6, M.iron, 0, 1.5, -0.9, vane);
    box(0.14, 0.9, 0.5, M.iron, 0, 2, 0.8, vane);
    box(0.14, 0.4, 0.5, M.comb, 0, 2.6, 0.85, vane);
    box(0.14, 0.6, 0.12, M.iron, 0, 0.45, 0.2, vane);
    // The silo off the +x side: banded, with a domed cap and a ladder.
    const so = { x: W + B.siloGap + B.siloR, z: -L / 3 }, R = B.siloR, H = B.siloH;
    mesh(new THREE.CylinderGeometry(R, R, H + B.base, 14), M.metal).position.set(so.x, (H - B.base) / 2, so.z);
    for (let h = 4; h < H; h += 6) mesh(new THREE.CylinderGeometry(R + 0.15, R + 0.15, 0.5, 14), M.metal2).position.set(so.x, h, so.z);
    mesh(new THREE.SphereGeometry(R, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), M.metal2).position.set(so.x, H, so.z);
    box(1.2, 1, 1.2, M.metal2, so.x, H + R + 0.3, so.z);
    for (const sx of [-0.6, 0.6]) box(0.15, H, 0.15, M.iron, so.x - R - 0.3, H / 2, so.z + sx);
    for (let h = 1; h < H; h += 1.2) box(0.12, 0.12, 1.3, M.iron, so.x - R - 0.3, h, so.z);
    // Round hay bales stacked against the +x wall, nearer the doors you came in by.
    const bz = L / 3, bx = W + T / 2 + 2.5, br = 2.4;
    const bg = this.barnGround(x, z, yaw, bx, bz) - y; // they sit on the meadow there, not on the floor's level
    const bales = [[bz - 5, 0], [bz, 0], [bz + 5, 0], [bz - 2.5, 1], [bz + 2.5, 1]];
    for (const [zz, row] of bales) {
      const by = bg + br - 0.3 + row * (br * 1.7);
      const bale = mesh(new THREE.CylinderGeometry(br, br, 4.6, 12), M.straw);
      bale.rotation.z = Math.PI / 2; bale.position.set(bx, by, zz);
      for (const s of [-1, 1]) {
        const band = mesh(new THREE.CylinderGeometry(br + 0.05, br + 0.05, 0.25, 12), M.floor);
        band.rotation.z = Math.PI / 2; band.position.set(bx + s * 1.2, by, zz);
      }
    }
    solid(W + T / 2, bx + 2.3, bz - 7.4, bz + 7.4, -B.base, bg + br * 2.7 + br - 0.3);
    // Chickens, pecking about on the -x side, out of both doorways.
    const hens = [];
    for (let k = 0; k < B.chickens; k++) {
      const h = this.buildHen(M, mesh, k % 3 === 2);
      h.lx = -(W + rand(5, 16)); h.lz = rand(-L / 2.5, L / 2.5);
      h.y = this.barnGround(x, z, yaw, h.lx, h.lz) - y;
      h.group.position.set(h.lx, h.y, h.lz);
      h.group.rotation.y = rand(0, Math.PI * 2);
      h.state = 'peck'; h.t = 0; h.phase = rand(0, 6); h.from = [0, 0]; h.to = [0, 0];
      g.add(h.group);
      hens.push(h);
    }
    this.mergeStatic(g, [vane, ...hens.map((h) => h.group)], geos);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    G.scene.add(g);
    this.barn = { group: g, geos, vane, hens, boxes, silo: so, pos: g.position, yaw, heading: rand(0, Math.PI * 2), seed: rand(0, 10), stormed: false, inside: 0, bumpT: 0, prevZ: null };
    return this.barn;
  }

  // A barn is a couple of hundred little boxes: draw everything that never moves as one mesh per material. keep: the
  // groups that move (left as they are).
  mergeStatic(g, keep, geos) {
    g.updateMatrixWorld(true);
    const skip = new Set(), by = new Map(), gone = [];
    for (const k of keep) k.traverse((o) => skip.add(o));
    g.traverse((o) => {
      if (!o.isMesh || skip.has(o)) return;
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      if (!by.has(o.material)) by.set(o.material, []);
      by.get(o.material).push(geo);
      gone.push(o);
    });
    for (const o of gone) { o.parent.remove(o); o.geometry.dispose(); }
    for (const [mat, list] of by) {
      const merged = mergeGeometries(list);
      for (const geo of list) geo.dispose();
      g.add(new THREE.Mesh(merged, mat));
      geos.push(merged);
    }
  }

  updateBarn(dt) {
    const G = this.G, p = G.player, B = BARN;
    if (this.barn && Math.hypot(this.barn.pos.x - p.pos.x, this.barn.pos.z - p.pos.z) > B.drop) this.dropBarn();
    if (!p.landed && !p.dead) this.barnWait -= dt;
    if (!this.barn && this.barnWait <= 0 && !G.terrain.stale && (this.barnT -= dt) <= 0) { this.barnT = 0.5; this.placeBarn(); }
    const b = this.barn;
    if (!b) return;
    const t = G.time;
    // The weathervane: a lazy meadow breeze that wanders and drops away now and then (the vane holds still then),
    // or the game's own wind when there is one. A little wobble in the stronger puffs.
    const air = _a.copy(p.wind).add(p.gust);
    let target, strength;
    if (air.lengthSq() > 1) { target = Math.atan2(-air.x, -air.z); strength = 1; }
    else {
      target = b.seed + 0.9 * Math.sin(t * 0.031 + b.seed) + 0.5 * Math.sin(t * 0.077);
      strength = Math.max(0, Math.sin(t * 0.13 + b.seed) * 0.6 + 0.5);
    }
    let da = (target - b.heading) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
    b.heading += da * Math.min(1, dt * 0.8 * strength);
    b.vane.rotation.y = b.heading - b.yaw + 0.18 * strength * Math.sin(t * 2.3 + b.seed) * Math.sin(t * 0.7);
    this.updateHens(b, dt);
    b.bumpT = Math.max(0, b.bumpT - dt);
    if (p.dead) { b.prevZ = null; b.inside = 0; return; }
    const L = this.archLocal(b, _local), r = 2.5 * (p.sizeScale || 1), W = B.wid / 2, Lz = B.len / 2, T = B.wall;
    // Barnstorming: in through one doorway, out through the other.
    if (Math.abs(L.x) > W + 2) b.inside = 0;
    if (b.prevZ !== null && Math.abs(L.x) < B.doorW / 2 && L.y > -2 && L.y < B.doorH) {
      for (const e of [-1, 1]) {
        const wall = e * Lz;
        if (Math.sign(b.prevZ - wall) === Math.sign(L.z - wall)) continue;
        if (Math.abs(L.z) < Math.abs(b.prevZ)) { b.inside = e; continue; } // in through the e end
        if (b.inside === -e && !b.stormed) {
          b.stormed = true;
          G.score += B.score;
          G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${B.score} Barnstormer!`);
          const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw), oz = e * (Lz + 4);
          _b.set(b.pos.x + oz * sn, b.pos.y + 5, b.pos.z + oz * cs); // a puff of straw blown out after you
          G.fx.emit(_b, 36, { colors: ['#e6c25a', '#f2dc8a', '#c8a040'], speed: 14, up: 4, life: 1.6, size: 3, gravity: -4, drag: 0.5 });
        }
        b.inside = 0;
      }
    }
    b.prevZ = L.z;
    // Solid wood, tin and hay: push out of anything you're in, with a small knock once a second.
    let hit = false;
    const push = (mx, my, mz) => {
      const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      p.pos.x += mx * cs + mz * sn; p.pos.z += -mx * sn + mz * cs; p.pos.y += my;
      this.archLocal(b, L);
      hit = true;
    };
    const sgn = (v) => (v < 0 ? -1 : 1);
    const least = (opts) => opts.reduce((a, o) => (Math.abs(o[0]) + Math.abs(o[1]) + Math.abs(o[2]) < Math.abs(a[0]) + Math.abs(a[1]) + Math.abs(a[2]) ? o : a));
    for (const s of b.boxes) {
      if (s.floor && p.landed) continue; // taxiing goes by the meadow under the wheels
      const x0 = s.mirror === -1 ? -s.x1 : s.x0, x1 = s.mirror === -1 ? -s.x0 : s.x1;
      if (L.x < x0 - r || L.x > x1 + r || L.z < s.z0 - r || L.z > s.z1 + r || L.y < s.y0 - r || L.y > s.y1 + r) continue;
      const was = hit;
      push(...least([[x0 - r - L.x, 0, 0], [x1 + r - L.x, 0, 0], [0, 0, s.z0 - r - L.z], [0, 0, s.z1 + r - L.z], [0, s.y1 + r - L.y, 0]]));
      if (s.floor) hit = was; // skimming the planks only lifts you: flying low through the barn is the fun of it
    }
    // The end walls (the doorway cut out), and the roof over it all.
    for (const e of [-1, 1]) {
      const wall = e * Lz, ax = Math.abs(L.x);
      if (Math.abs(L.z - wall) >= T / 2 + r || ax >= W + T / 2 + r || L.y < -B.base || L.y > this.barnRoof(Math.min(ax, W)) + r) continue;
      if (ax < B.doorW / 2 - r && L.y < B.doorH - r) continue; // clean through the doorway
      const side = Math.sign((b.prevZ ?? L.z) - wall) || e, opts = [[0, 0, wall + side * (T / 2 + r) - L.z]];
      if (L.y < B.doorH - r) opts.push([sgn(L.x) * (B.doorW / 2 - r) - L.x, 0, 0]); // a jamb: nudged into the doorway
      if (ax < B.doorW / 2 - r) opts.push([0, B.doorH - r - L.y, 0]); // the lintel: nudged down into it
      push(...least(opts));
    }
    {
      const ax = Math.abs(L.x), top = this.barnRoof(ax);
      if (ax < W + 1 + r && Math.abs(L.z) < Lz + 1.6 + r && L.y > B.eave - r && L.y < top + r) {
        const opts = [[0, top + r - L.y, 0], [sgn(L.x) * (W + 1 + r) - L.x, 0, 0], [0, 0, sgn(L.z) * (Lz + 1.6 + r) - L.z]];
        if (ax < W - T / 2 && Math.abs(L.z) < Lz) opts.push([0, B.eave - r - L.y, 0]); // inside: under the rafters
        push(...least(opts));
      }
    }
    // The silo: a tin drum with a dome.
    {
      const dx = L.x - b.silo.x, dz = L.z - b.silo.z, R = B.siloR, H = B.siloH, d = Math.hypot(dx, dz);
      if (L.y > H) {
        const up = L.y - H, d3 = Math.hypot(dx, up, dz);
        if (d3 < R + r) { const k = d3 > 1e-3 ? (R + r - d3) / d3 : 0; push(dx * k, d3 > 1e-3 ? up * k : R + r, dz * k); }
      } else if (L.y > -B.base && d < R + r) {
        const k = d > 1e-3 ? (R + r - d) / d : 0;
        push(d > 1e-3 ? dx * k : R + r, 0, dz * k);
      }
    }
    if (hit && b.bumpT <= 0) {
      b.bumpT = B.bumpEvery;
      p.damage(B.dmg);
      G.fx.emit(p.pos, 18, { colors: ['#b3362c', '#f3eee4', '#e6c25a'], speed: 18, life: 0.8, size: 4 });
      if (!this.barnTip) { this.barnTip = true; G.ui.notify('Barns are sturdier than they look! Fly in one door and out the other.', 'warn', 4, 1); }
    }
  }

  // The chickens peck about; fly by low and close and they scatter in a flap of feathers, then settle and peck again.
  updateHens(b, dt) {
    const G = this.G, p = G.player, B = BARN, t = G.time, cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
    const world = (lx, lz) => _q.set(b.pos.x + lx * cs + lz * sn, 0, b.pos.z - lx * sn + lz * cs);
    const L = this.archLocal(b, _local);
    for (const h of b.hens) {
      h.t += dt;
      const near = !p.dead && h.state !== 'flee' && Math.hypot(L.x - h.lx, L.z - h.lz) < B.scare && L.y - h.y < B.scareUp;
      if (near) {
        const ax = h.lx - L.x, az = h.lz - L.z, a = Math.hypot(ax, az) || 1;
        h.from = [h.lx, h.lz]; h.to = [Math.min(h.lx + (ax / a) * B.flee, -(B.wid / 2 + B.wall + 1)), h.lz + (az / a) * B.flee]; // never into the barn
        h.state = 'flee'; h.t = 0;
        h.group.rotation.y = Math.atan2(ax, az);
        _b.copy(world(h.lx, h.lz)).setY(b.pos.y + h.y + 1.5);
        G.fx.emit(_b, 2, { colors: ['#ffffff', '#f4efe6', '#c8884a'], speed: 5, up: 3, life: 1.5, size: 1.5, gravity: -1.5, drag: 1.2 });
      }
      if (h.state === 'flee') {
        const k = Math.min(1, h.t / 0.9);
        h.lx = h.from[0] + (h.to[0] - h.from[0]) * k; h.lz = h.from[1] + (h.to[1] - h.from[1]) * k;
        const w = world(h.lx, h.lz);
        h.y = G.terrain.surfaceHeight(w.x, w.z) - b.pos.y;
        h.group.position.set(h.lx, h.y + B.hop * 4 * k * (1 - k), h.lz);
        const flap = 0.4 + 0.9 * Math.abs(Math.sin(h.t * 28));
        h.wings[0].rotation.z = -flap; h.wings[1].rotation.z = flap;
        h.head.rotation.x = -0.3;
        if (k >= 1) { h.state = 'settle'; h.t = 0; h.wings[0].rotation.z = h.wings[1].rotation.z = 0; }
      } else if (h.state === 'settle') {
        h.head.rotation.x = -0.15 + 0.1 * Math.sin(h.t * 9); // a startled look around
        h.group.position.y = h.y;
        if (h.t > B.settle) { h.state = 'peck'; h.t = 0; }
      } else { // pecking: a quick dip now and then
        h.head.rotation.x = 1.1 * Math.max(0, Math.sin(t * 2.6 + h.phase)) ** 6;
        h.group.position.y = h.y;
      }
    }
  }

  // Giant's Garden: the watering can.
  get canInfo() { return this.can; }

  dropCan() {
    if (!this.can) return;
    this.G.scene.remove(this.can.group);
    for (const geo of new Set(this.can.geos)) geo.dispose();
    for (const m of this.can.rippleMats) m.dispose();
    this.can = null;
  }

  // Fairly level ground ahead for the can's foot, and dry ground under its spout for the water to land on.
  placeCan() {
    const G = this.G, p = G.player, f = p.forward.clone().setY(0), C = CAN, R = C.R, sea = G.world.seaLevel;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    let x = 0, z = 0;
    for (let tries = 0; tries < 24 * 4; tries++) {
      if (tries % 4 === 0) { const d = rand(C.near, C.far), s = rand(-0.35, 0.35) * d; x = p.pos.x + f.x * d - f.z * s; z = p.pos.z + f.z * d + f.x * s; }
      // First with the handle's gap facing you (you fly straight through), then turned a quarter at a time.
      const yaw = Math.atan2(p.pos.x - x, p.pos.z - z) + (tries % 4) * Math.PI / 2;
      const hs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([a, b]) => this.barnGround(x, z, yaw, a * R, b * R));
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (hi - lo > C.slope || lo < sea + 2) continue;
      const fx = R + C.spoutLen + 2.5, fs = [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]].map(([a, b]) => this.barnGround(x, z, yaw, fx + a, b));
      const foot = Math.max(...fs);
      if (Math.min(...fs) < sea + 1 || foot - Math.min(...fs) > 1.5 || foot > lo + 12) continue; // a flat, dry spot for the puddle
      return this.buildCan(x, lo, z, yaw, foot - lo);
    }
    return null;
  }

  buildCan(x, y, z, yaw, footY) {
    const M = (this.canMats ||= {
      paint: new THREE.MeshLambertMaterial({ color: '#2f9e8f', flatShading: true }),
      paint2: new THREE.MeshLambertMaterial({ color: '#237a6f', flatShading: true }),
      brass: new THREE.MeshLambertMaterial({ color: '#d9b45a', flatShading: true }),
      tin: new THREE.MeshLambertMaterial({ color: '#b9c3c8', flatShading: true }),
      dark: new THREE.MeshLambertMaterial({ color: '#28323a' }),
      water: new THREE.MeshLambertMaterial({ color: '#7cc8f0', transparent: true, opacity: 0.75 }),
      drop: new THREE.MeshLambertMaterial({ color: '#a8dcff', transparent: true, opacity: 0.8 }),
      petal: new THREE.MeshLambertMaterial({ color: '#fff6f0', flatShading: true }),
      petal2: new THREE.MeshLambertMaterial({ color: '#ffb3c8', flatShading: true }),
      heart: new THREE.MeshLambertMaterial({ color: '#ffd23a', flatShading: true }),
      leaf: new THREE.MeshLambertMaterial({ color: '#4c9a3a', flatShading: true }),
    });
    const C = CAN, g = new THREE.Group(), geos = [], R = C.R, H = C.H;
    const mesh = (geo, mat, parent = g) => { geos.push(geo); const o = new THREE.Mesh(geo, mat); parent.add(o); return o; };
    // The can: a painted drum sunk a little into the bed, with brass bands, a rolled rim and water inside.
    mesh(new THREE.CylinderGeometry(R, R * 1.04, H + 4, 32), M.paint).position.y = H / 2 - 2;
    for (const [yy, rr] of [[1.2, R * 1.04], [H * 0.45, R + 0.1], [H - 1.4, R + 0.1]]) {
      const band = mesh(new THREE.TorusGeometry(rr, 0.55, 6, 32), M.brass);
      band.rotation.x = Math.PI / 2; band.position.y = yy;
    }
    const rim = mesh(new THREE.TorusGeometry(R, 0.9, 8, 32), M.tin);
    rim.rotation.x = Math.PI / 2; rim.position.y = H;
    const water = mesh(new THREE.CircleGeometry(R - 0.6, 28), M.water);
    water.rotation.x = -Math.PI / 2; water.position.y = H - 2.5;
    mesh(new THREE.CylinderGeometry(R - 0.7, R - 0.7, 1, 28, 1, true), M.paint2).position.y = H - 0.6; // the inside of the rim
    // Painted daisies around the sides.
    for (const [ang, yy, sc, pm] of [[0.25, 11, 1, M.petal], [-0.55, 17, 0.8, M.petal2], [1.1, 7, 0.9, M.petal2], [2.6, 13, 1, M.petal], [-1.9, 9, 0.85, M.petal], [3.6, 18, 0.75, M.petal2]]) {
      const fl = new THREE.Group();
      const rr = R * 1.04 - R * 0.04 * (yy + 4) / (H + 4) + 0.3; // on the drum, which flares a little toward the foot
      fl.position.set(Math.sin(ang) * rr, yy, Math.cos(ang) * rr);
      fl.rotation.y = ang;
      fl.scale.setScalar(sc);
      g.add(fl);
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3, pt = mesh(new THREE.SphereGeometry(1, 7, 5), pm, fl);
        pt.scale.set(0.9, 2, 0.25); pt.position.set(Math.cos(a) * 2, Math.sin(a) * 2, 0); pt.rotation.z = a - Math.PI / 2;
      }
      mesh(new THREE.SphereGeometry(1.1, 8, 6), M.heart, fl).scale.set(1, 1, 0.45);
      const leaf = mesh(new THREE.SphereGeometry(1, 6, 4), M.leaf, fl);
      leaf.scale.set(0.8, 2.2, 0.2); leaf.position.set(1.6, -4.4, 0); leaf.rotation.z = -0.7;
      const stem = mesh(new THREE.BoxGeometry(0.4, 4.5, 0.2), M.leaf, fl);
      stem.position.set(0, -4, 0);
    }
    // The top handle: an arch over the mouth, from the back to the spout side, with brass sockets.
    const handle = mesh(new THREE.TorusGeometry(C.handleR, C.tube, 10, 32, Math.PI), M.paint2);
    handle.position.y = H;
    for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(2.2, 2.6, 2, 12), M.brass).position.set(sx * C.handleR, H + 0.4, 0);
    // The back handle, bowed out the far side.
    const back = mesh(new THREE.TorusGeometry(C.backR, C.tube * 0.9, 8, 24, Math.PI), M.paint2);
    back.rotation.z = Math.PI / 2; back.position.set(-R, H * 0.55, 0);
    // The spout: a long tapering tin pipe out of the low side, up to a brass rose that drips.
    const a = new THREE.Vector3(R - 1, 5, 0), tip = new THREE.Vector3(R + C.spoutLen, C.spoutTip, 0), dir = tip.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const spout = mesh(new THREE.CylinderGeometry(1.9, 3.4, len, 16), M.paint);
    spout.quaternion.setFromUnitVectors(_Y, dir); spout.position.copy(a).addScaledVector(dir, len / 2);
    const collar = mesh(new THREE.CylinderGeometry(4.2, 4.2, 2.4, 16), M.brass);
    collar.quaternion.copy(spout.quaternion); collar.position.copy(a).addScaledVector(dir, 2.5);
    const rose = mesh(new THREE.CylinderGeometry(C.roseR, 2.2, 3.4, 18), M.brass);
    rose.quaternion.copy(spout.quaternion); rose.position.copy(tip).addScaledVector(dir, 1.6);
    const face = new THREE.Group(); // the rose's holes
    face.quaternion.copy(spout.quaternion); face.position.copy(tip).addScaledVector(dir, 3.35);
    g.add(face);
    for (let k = 0; k < 13; k++) {
      const r = k === 0 ? 0 : k < 7 ? 1.8 : 3.5, ang = k < 7 ? k * Math.PI / 3 : k * Math.PI / 3 + 0.5;
      mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 6), M.dark, face).position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    }
    const roseC = tip.clone().addScaledVector(dir, 1.6);
    // The puddle under the rose, and its ripples.
    const sx = roseC.x + 1.5;
    const pud = mesh(new THREE.CircleGeometry(10, 24), M.water);
    pud.rotation.x = -Math.PI / 2; pud.position.set(sx, footY + 0.3, 0);
    const rippleMats = [0, 1].map(() => M.drop.clone()); // each fades as it spreads
    const ripples = rippleMats.map((mat) => {
      const rp = mesh(new THREE.TorusGeometry(4, 0.25, 4, 24), mat);
      rp.rotation.x = Math.PI / 2; rp.position.set(sx, footY + 0.5, 0);
      return rp;
    });
    // The drops, falling from the rose to the puddle.
    const drops = new THREE.Group();
    g.add(drops);
    const dropGeo = new THREE.SphereGeometry(0.55, 6, 4);
    geos.push(dropGeo);
    const list = [];
    for (let k = 0; k < C.drops; k++) {
      const o = new THREE.Mesh(dropGeo, M.drop);
      o.scale.set(1, 2.4, 1);
      drops.add(o);
      const ang = rand(0, Math.PI * 2), r = Math.sqrt(rand(0, 1)) * (C.streamR - 1);
      list.push({ o, x: sx + Math.cos(ang) * r, z: Math.sin(ang) * r, ph: rand(0, 1) });
    }
    this.mergeStatic(g, [drops, ...ripples], geos);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.G.scene.add(g);
    this.can = { group: g, geos, rippleMats, drops: list, ripples, pos: g.position, yaw, top: roseC.y - 2.2, // drops start at the rose's lip
      foot: footY, sx, spoutA: a, spoutB: tip, rose: roseC,
      threaded: false, splashed: false, splashT: 0, bumpT: 0, prevZ: null };
    return this.can;
  }

  updateCan(dt) {
    const G = this.G, p = G.player, C = CAN;
    if (this.can && Math.hypot(this.can.pos.x - p.pos.x, this.can.pos.z - p.pos.z) > C.drop) this.dropCan();
    if (!this.can && !G.terrain.stale && (this.canT -= dt) <= 0) { this.canT = 0.5; this.placeCan(); }
    const c = this.can;
    if (!c) return;
    const t = G.time, fall = c.top - c.foot;
    for (const d of c.drops) {
      const k = (t * 0.9 + d.ph) % 1;
      d.o.position.set(d.x, c.top - k * k * fall, d.z); // speeding up as they fall
    }
    c.ripples.forEach((rp, i) => { const k = (t * 0.6 + i * 0.5) % 1; rp.scale.setScalar(0.4 + 1.6 * k); c.rippleMats[i].opacity = 0.8 * (1 - k); });
    c.bumpT = Math.max(0, c.bumpT - dt);
    c.splashT = Math.max(0, c.splashT - dt);
    if (p.dead) { c.prevZ = null; return; }
    const L = this.archLocal(c, _local), r = 2.5 * (p.sizeScale || 1), R = C.R, H = C.H;
    // Through the handle: across its plane, under the arch, above the rim.
    const q = Math.hypot(L.x, L.y - H);
    if (c.prevZ !== null && Math.sign(c.prevZ) !== Math.sign(L.z) && L.y > H + 1 && q < C.handleR - C.tube && !c.threaded) {
      c.threaded = true;
      G.score += C.score;
      G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${C.score} Through the handle!`);
      G.fx.emit(p.pos, 24, { colors: ['#ffd23a', '#fff6f0', '#ffb3c8'], speed: 12, up: 3, life: 1.2, size: 2.5, gravity: -3, drag: 0.6 });
    }
    c.prevZ = L.z;
    // The dripping water: a gentle push down and a splash, never a knock.
    if (Math.hypot(L.x - c.sx, L.z) < C.streamR + r && L.y < c.top && L.y > c.foot) {
      p.pos.y -= C.streamPush * Math.min(1, Math.max(0, (L.y - c.foot - 2) / C.streamEase)) * dt;
      if (c.splashT <= 0) { c.splashT = 0.15; G.fx.emit(p.pos, 6, { colors: ['#a8dcff', '#ffffff'], speed: 9, up: 2, life: 0.8, size: 1.8, gravity: -6, drag: 0.8 }); }
      if (!c.splashed) { c.splashed = true; G.score += C.splash; G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${C.splash} Splash!`); }
    }
    // Solid tin.
    let hit = false;
    const push = (mx, my, mz) => {
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      p.pos.x += mx * cs + mz * sn; p.pos.z += -mx * sn + mz * cs; p.pos.y += my;
      this.archLocal(c, L);
      hit = true;
    };
    // The drum: out the side, or up out of the mouth.
    {
      const d = Math.hypot(L.x, L.z), Ro = R + 0.9;
      if (d < Ro + r && L.y < H + 0.9 + r && L.y > -4) {
        const side = Ro + r - d, up = H + 0.9 + r - L.y;
        if (side < up) { const k = d > 1e-3 ? side / d : 0; push(d > 1e-3 ? L.x * k : Ro + r, 0, L.z * k); } else push(0, up, 0);
      }
    }
    // The handles: a ring of tube along an arc. Pushed straight out from the nearest point on it.
    const arc = (cx, cy, rad, tube, a0, a1) => {
      let ang = Math.atan2(L.y - cy, L.x - cx);
      if (a1 > Math.PI && ang < 0) ang += Math.PI * 2;
      ang = Math.min(a1, Math.max(a0, ang));
      const ax = cx + Math.cos(ang) * rad, ay = cy + Math.sin(ang) * rad, dx = L.x - ax, dy = L.y - ay, dz = L.z, d = Math.hypot(dx, dy, dz);
      if (d < tube + r) { const k = d > 1e-3 ? (tube + r - d) / d : 0; push(dx * k, d > 1e-3 ? dy * k : tube + r, dz * k); }
    };
    arc(0, H, C.handleR, C.tube, 0, Math.PI);
    arc(-R, H * 0.55, C.backR, C.tube * 0.9, Math.PI / 2, Math.PI * 1.5);
    // The spout, a pipe from the drum to the rose, and the rose itself.
    {
      const A = c.spoutA, B = c.spoutB, ux = B.x - A.x, uy = B.y - A.y, l2 = ux * ux + uy * uy;
      const k = Math.min(1, Math.max(0, ((L.x - A.x) * ux + (L.y - A.y) * uy) / l2));
      const dx = L.x - (A.x + ux * k), dy = L.y - (A.y + uy * k), dz = L.z, d = Math.hypot(dx, dy, dz), rad = 3.4 - 1.5 * k;
      if (d < rad + r) { const m = d > 1e-3 ? (rad + r - d) / d : 0; push(dx * m, d > 1e-3 ? dy * m : rad + r, dz * m); }
      const ex = L.x - c.rose.x, ey = L.y - c.rose.y, e = Math.hypot(ex, ey, L.z);
      if (e < C.roseR + r) { const m = e > 1e-3 ? (C.roseR + r - e) / e : 0; push(ex * m, e > 1e-3 ? ey * m : C.roseR + r, L.z * m); }
    }
    if (hit && c.bumpT <= 0) {
      c.bumpT = C.bumpEvery;
      p.damage(C.dmg);
      G.fx.emit(p.pos, 18, { colors: ['#2f9e8f', '#d9b45a', '#b9c3c8'], speed: 18, life: 0.8, size: 4 });
      if (!this.canTip) { this.canTip = true; G.ui.notify('That watering can is solid tin! Fly under its handle instead.', 'warn', 4, 1); }
    }
  }

  // Salt Mirror: the flamingo flock. Each body part is one instanced mesh for the whole flock (seven draw calls), posed
  // per bird every frame from a small skeleton that is never added to the scene.
  get flockInfo() { return this.flock; }

  dropFlock() {
    if (!this.flock) return;
    this.G.scene.remove(this.flock.group);
    for (const m of this.flock.meshes) m.dispose(); // the instance buffers; the shared parts stay in flockParts
    this.flock = null;
  }

  // The flamingo's parts, built once and shared by every flock: body, neck (with head and beak), each wing and the
  // legs, coloured per vertex so each part is a single mesh. Bird space: feet at the origin, facing +z, about 1.5 tall.
  flockKit() {
    if (this.flockParts) return this.flockParts;
    const PINK = '#ff8fb1', DEEP = '#ff5c8a', PALE = '#ffc2d4', BLACK = '#1d1418', BEAK = '#f4e8e0', LEG = '#e8718e';
    const bits = [], col = new THREE.Color(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler();
    const add = (geo, c, pos, scl = [1, 1, 1], rot = [0, 0, 0], q) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (g !== geo) geo.dispose();
      g.deleteAttribute('uv');
      m4.compose(new THREE.Vector3(...pos), q || qq.setFromEuler(ee.set(...rot)), new THREE.Vector3(...scl));
      g.applyMatrix4(m4);
      col.set(c);
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      bits.push(g);
    };
    // A thin round bone from a to b.
    const seg = (a, b, r0, r1, c) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
      add(new THREE.CylinderGeometry(r1, r0, len, 6), c, A.addScaledVector(d, 0.5).toArray(), [1, 1, 1], null, new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize()));
    };
    const done = () => { const g = mergeGeometries(bits); for (const b of bits) b.dispose(); bits.length = 0; return g; };
    const ball = (w = 14, h = 10) => new THREE.SphereGeometry(1, w, h);
    // The body: a plump oval, deeper pink on the back, a pale tail.
    add(ball(), PINK, [0, 1.12, 0], [0.24, 0.25, 0.46]);
    add(ball(), DEEP, [0, 1.24, -0.06], [0.2, 0.12, 0.36]);
    add(new THREE.ConeGeometry(0.12, 0.3, 8), PALE, [0, 1.16, -0.5], [1, 1, 1], [-Math.PI / 2 - 0.2, 0, 0]);
    const body = done();
    // The neck, an S-curve from the pivot on the front of the body, the head and the bent, black-tipped beak.
    const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0, 0.22, 0.1], [0, 0.42, 0], [0, 0.6, 0.02], [0, 0.72, 0.14]].map((v) => new THREE.Vector3(...v)));
    add(new THREE.TubeGeometry(curve, 24, 0.045, 6), PINK, [0, 0, 0]);
    add(ball(8, 6), PINK, [0, 0, 0], [0.09, 0.09, 0.09]);
    const neck = done();
    // The head, on its own pivot at the top of the neck, so it can stay level in flight.
    add(ball(10, 8), PINK, [0, 0, 0], [0.075, 0.075, 0.09]);
    add(new THREE.ConeGeometry(0.045, 0.14, 8), BEAK, [0, -0.01, 0.12], [1, 1, 1], [Math.PI / 2 + 0.5, 0, 0]);
    add(new THREE.ConeGeometry(0.03, 0.09, 8), BLACK, [0, -0.055, 0.19], [1, 1, 1], [Math.PI / 2 + 1.1, 0, 0]);
    for (const sx of [-1, 1]) add(ball(6, 4), BLACK, [sx * 0.06, 0.03, 0.04], [0.016, 0.016, 0.016]);
    const head = done();
    // A wing from its shoulder, spread along x: pink coverts, black flight feathers at the tip and the trailing edge.
    const wing = (sx) => {
      add(ball(), DEEP, [sx * 0.4, 0, 0], [0.42, 0.03, 0.2]);
      add(ball(), PINK, [sx * 0.25, 0.01, 0.03], [0.3, 0.035, 0.15]);
      add(ball(), BLACK, [sx * 0.85, 0, -0.03], [0.3, 0.025, 0.13]);
      add(ball(), BLACK, [sx * 0.45, -0.005, -0.16], [0.36, 0.02, 0.07]);
      return done();
    };
    const wingR = wing(1), wingL = wing(-1);
    // The legs from the hip: one straight down to a webbed foot, the other tucked up under the body.
    seg([0.05, 0, 0], [0.05, -0.47, 0.01], 0.03, 0.026, LEG);
    add(ball(6, 4), LEG, [0.05, -0.47, 0.01], [0.035, 0.035, 0.035]);
    seg([0.05, -0.47, 0.01], [0.05, -0.94, 0], 0.024, 0.02, LEG);
    add(new THREE.BoxGeometry(0.09, 0.02, 0.16), LEG, [0.05, -0.94, 0.05]);
    seg([-0.05, 0, 0], [-0.05, -0.3, 0.06], 0.03, 0.026, LEG);
    add(ball(6, 4), LEG, [-0.05, -0.3, 0.06], [0.035, 0.035, 0.035]);
    seg([-0.05, -0.3, 0.06], [-0.05, -0.1, -0.32], 0.024, 0.02, LEG);
    const legs = done();
    const ring = new THREE.TorusGeometry(1, 0.05, 4, 24);
    ring.rotateX(Math.PI / 2);
    this.flockParts = {
      body, neck, head, wingR, wingL, legs, ring,
      dummy: new THREE.Object3D(), // poses the ripples (made here, not at load: an Object3D rolls a random id)
      mat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      ringMat: new THREE.MeshBasicMaterial({ color: '#d8ecff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    return this.flockParts;
  }

  // Shallow water or wet salt ahead, wide enough for the whole flock to stand in.
  placeFlock() {
    const G = this.G, p = G.player, F = FLOCK, sea = G.world.seaLevel, f = p.forward.clone().setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const wet = (x, z) => { const h = G.terrain.surfaceHeight(x, z) - sea; return h >= F.wade[0] && h <= F.wade[1]; };
    for (let tries = 0; tries < 24; tries++) {
      const d = rand(F.near, F.far), s = rand(-0.35, 0.35) * d, x = p.pos.x + f.x * d - f.z * s, z = p.pos.z + f.z * d + f.x * s;
      let ok = wet(x, z);
      for (let k = 0; ok && k < 8; k++) ok = wet(x + Math.cos(k * Math.PI / 4) * F.spread, z + Math.sin(k * Math.PI / 4) * F.spread);
      if (!ok) continue;
      const homes = [];
      for (let k = 0; k < F.birds * 5 && homes.length < F.birds; k++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(rand(0, 1)) * F.spread, hx = x + Math.cos(a) * r, hz = z + Math.sin(a) * r;
        if (!wet(hx, hz) || homes.some((h) => Math.hypot(h.x - hx, h.z - hz) < F.gap)) continue;
        homes.push({ x: hx, z: hz, y: G.terrain.surfaceHeight(hx, hz) });
      }
      if (homes.length >= F.birds - 4) return this.buildFlock(x, z, homes);
    }
    return null;
  }

  buildFlock(x, z, homes) {
    const K = this.flockKit(), F = FLOCK, n = homes.length, g = new THREE.Group(), sea = this.G.world.seaLevel;
    g.position.set(x, 0, z);
    const inst = (geo, mat, count = n) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.frustumCulled = false; // the flock flies far from where it was built
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      g.add(m);
      return m;
    };
    const meshes = [inst(K.body, K.mat), inst(K.neck, K.mat), inst(K.head, K.mat), inst(K.wingR, K.mat), inst(K.wingL, K.mat), inst(K.legs, K.mat), inst(K.ring, K.ringMat, n * 2)];
    for (let i = 0; i < n * 2; i++) meshes[6].setColorAt(i, new THREE.Color(0, 0, 0));
    const birds = homes.map((h, i) => {
      const root = new THREE.Object3D();
      root.rotation.order = 'YXZ';
      const pivot = (px, py, pz) => { const o = new THREE.Object3D(); o.position.set(px, py, pz); root.add(o); return o; };
      const neck = pivot(0, 1.2, 0.3), head = new THREE.Object3D();
      head.position.set(0, 0.74, 0.18);
      neck.add(head);
      const b = { hx: h.x, hz: h.z, hy: h.y, x: h.x, y: h.y, z: h.z, yaw: rand(0, Math.PI * 2), yawRate: 0, root,
        neck, head, wingR: pivot(0.17, 1.22, 0.08), wingL: pivot(-0.17, 1.22, 0.08), legs: pivot(0, 0.95, -0.02),
        feed: i % 3 ? 1 : 0, feedTo: i % 3 ? 1 : 0, feedT: rand(1, 8), ph: rand(0, 10), puffT: 0, wet: h.y < sea - 0.05,
        rank: Math.ceil(i / 2), side: (i % 2 ? 1 : -1) * Math.ceil(i / 2), delay: i * 0.07 };
      b.wingR.rotation.order = b.wingL.rotation.order = 'YXZ'; // fold back, then hang down the flank
      return b;
    });
    this.G.scene.add(g);
    this.flock = { group: g, meshes, birds, pos: g.position, mid: { x, z }, water: sea, state: 'feed', t: 0, restT: 0,
      T: (Math.PI * 2 * F.loop) / F.speed, u: [0, 1], nn: [1, 0], startled: false, joined: false, withT: 0 };
    this.poseFlock(0);
    return this.flock;
  }

  // Where a bird of the flying flock wants to be at time t into the flight: its place in the V behind the leader, who
  // flies one loop out from the flock's spot and back.
  flockTarget(f, b, t, out) {
    const F = FLOCK, ph = (Math.PI * 2 * t) / f.T, [ux, uz] = f.u, [nx, nz] = f.nn;
    const cx = f.mid.x + nx * F.loop, cz = f.mid.z + nz * F.loop, cs = Math.cos(ph), sn = Math.sin(ph);
    const tx = nx * sn + ux * cs, tz = nz * sn + uz * cs; // the leader's heading
    return out.set(
      cx - nx * F.loop * cs + ux * F.loop * sn - tx * b.rank * F.rank[0] + tz * b.side * F.rank[1],
      f.water + F.alt - b.rank * 0.5 + 0.6 * Math.sin(t * 1.3 + b.ph),
      cz - nz * F.loop * cs + uz * F.loop * sn - tz * b.rank * F.rank[0] - tx * b.side * F.rank[1]);
  }

  poseFlock(dt) {
    const G = this.G, F = FLOCK, f = this.flock, t = G.time, S = F.size, sm = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
    const [body, neck, head, wingR, wingL, legs, rings] = f.meshes, _dummy = this.flockParts.dummy;
    const flying = f.state === 'fly', ft = f.t;
    f.birds.forEach((b, i) => {
      // How far into the air: kh along the ground, kv up, kw the wings (spread first, folded last).
      let kh = 0, kv = 0, kw = 0;
      if (flying) {
        const a = ft - b.delay, e = f.T - ft;
        kh = Math.min(sm(a / F.takeoff), sm(e / F.landing));
        kv = Math.min(sm((a - 0.9) / (F.takeoff - 0.9)), sm((e - 1) / (F.landing - 1)));
        kw = Math.min(sm(a / 1), sm(e / 1.2));
      }
      const px = b.x, py = b.y, pz = b.z;
      if (kh > 0) {
        this.flockTarget(f, b, ft, _b);
        b.x = b.hx + (_b.x - b.hx) * kh; b.z = b.hz + (_b.z - b.hz) * kh; b.y = b.hy + (_b.y - b.hy) * kv;
      } else { b.x = b.hx; b.z = b.hz; b.y = b.hy; }
      // Face the way it's going (a little nose up while climbing, banked into the turn).
      let pitch = 0;
      if (dt > 0) {
        const vx = (b.x - px) / dt, vy = (b.y - py) / dt, vz = (b.z - pz) / dt, vh = Math.hypot(vx, vz);
        if (vh > 2) {
          let dy = Math.atan2(vx, vz) - b.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          const turn = dy * Math.min(1, dt * 6);
          b.yaw += turn; b.yawRate = turn / dt;
          pitch = Math.max(-0.4, Math.min(0.4, -Math.atan2(vy, vh) * 0.5));
        } else b.yawRate = 0;
        // On the ground: some feed, head down and sweeping, some stand up tall, and they swap now and then.
        if ((b.feedT -= dt) <= 0) { b.feedTo = 1 - b.feedTo; b.feedT = rand(3, 8); }
        b.feed += Math.max(-dt * 1.2, Math.min(dt * 1.2, b.feedTo - b.feed));
        b.puffT = Math.max(0, b.puffT - dt);
        // The run: their feet splash across the water as they go.
        if (flying && kh > 0.02 && b.wet && b.y - f.water < 0.5) G.fx.emit(_b.set(b.x, f.water + 0.3, b.z), 22 * dt, { colors: ['#ffffff', '#e8f6ff', '#ffd6e2'], speed: 4, up: 5, life: 0.7, size: 1.4, gravity: -8, drag: 0.6 });
      }
      const r = b.root;
      r.position.set(b.x - f.pos.x, b.y, b.z - f.pos.z);
      r.rotation.set(pitch * kv + 0.3 * b.feed * (1 - kw), b.yaw, Math.max(-0.5, Math.min(0.5, -b.yawRate * 1.2)) * kv);
      r.scale.setScalar(S);
      const bob = 0.04 * Math.sin(t * 1.1 + b.ph), feedNeck = 2.5 + 0.12 * Math.sin(t * 2 + b.ph);
      b.neck.rotation.set((0.1 + bob + (feedNeck - 0.1) * b.feed) * (1 - kw) + 1.3 * kw, 0.35 * b.feed * Math.sin(t * 0.8 + b.ph) * (1 - kw), 0);
      const flap = 0.6 * kw * (0.25 + 0.75 * sm((f.T - ft - F.landing * 0.6) / 1.5)) * Math.sin(t * Math.PI * 2 * 2.6 + b.ph);
      for (let sx = 1; sx >= -1; sx -= 2) {
        const w = sx > 0 ? b.wingR : b.wingL;
        w.rotation.set(1.2 * (1 - kw), sx * (1 - kw) * Math.PI / 2 * 0.93, sx * flap); // folded, they hang down the flanks
        w.scale.set(0.55 + 0.45 * kw, 1, 1);
      }
      b.head.rotation.x = -1.5 * kw; // level in flight, the beak pointing ahead
      const run = flying && kh > 0.02 && kv < 0.5 ? 1 - kv * 2 : 0; // the run: legs pumping, body bobbing
      b.legs.rotation.x = 1.45 * kv + 0.3 * run * Math.sin(t * 25 + b.ph);
      r.position.y += 0.15 * S * run * Math.abs(Math.sin(t * 25 + b.ph));
      r.updateMatrixWorld(true);
      body.setMatrixAt(i, r.matrixWorld);
      neck.setMatrixAt(i, b.neck.matrixWorld);
      head.setMatrixAt(i, b.head.matrixWorld);
      wingR.setMatrixAt(i, b.wingR.matrixWorld);
      wingL.setMatrixAt(i, b.wingL.matrixWorld);
      legs.setMatrixAt(i, b.legs.matrixWorld);
      // Ripples spread round the legs of the birds standing in water, two at a time, fading as they go.
      for (let j = 0; j < 2; j++) {
        const k = (t * 0.35 + b.ph + j * 0.5) % 1, on = b.wet && kv < 0.02, rad = on ? 0.8 + 3.5 * k : 0;
        _dummy.position.set(b.x - f.pos.x, f.water + 0.06, b.z - f.pos.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(rad, 1, rad);
        _dummy.updateMatrix();
        rings.setMatrixAt(i * 2 + j, _dummy.matrix);
        rings.setColorAt(i * 2 + j, _col.setScalar(0.7 * (1 - k)));
      }
    });
    for (const m of f.meshes) m.instanceMatrix.needsUpdate = true;
    rings.instanceColor.needsUpdate = true;
  }

  updateFlock(dt) {
    const G = this.G, p = G.player, F = FLOCK;
    if (this.flock && Math.hypot(this.flock.mid.x - p.pos.x, this.flock.mid.z - p.pos.z) > F.drop) this.dropFlock();
    if (!this.flock && !G.terrain.stale && (this.flockT -= dt) <= 0) { this.flockT = 0.5; this.placeFlock(); }
    const f = this.flock;
    if (!f) return;
    f.restT = Math.max(0, f.restT - dt);
    const dx = p.pos.x - f.mid.x, dz = p.pos.z - f.mid.z;
    if (f.state === 'feed' && f.restT <= 0 && !p.dead && Math.hypot(dx, dz) < F.scare && p.pos.y - f.water < F.scareUp) {
      // Up they go: away from you first, then round in one big loop.
      f.state = 'fly'; f.t = 0;
      let ux = -dx, uz = -dz, l = Math.hypot(ux, uz);
      if (l < 1) { ux = p.forward.x; uz = p.forward.z; l = Math.hypot(ux, uz) || 1; }
      ux /= l; uz /= l;
      const sd = rand(0, 1) < 0.5 ? 1 : -1;
      f.u = [ux, uz]; f.nn = [-uz * sd, ux * sd];
      for (const b of f.birds) G.fx.emit(_b.set(b.x, Math.max(b.y, f.water) + 0.5, b.z), 4, { colors: ['#ffffff', '#ffd6e2', '#ff8fb1'], speed: 6, up: 6, life: 1, size: 1.6, gravity: -6, drag: 0.8 });
      if (!f.startled) {
        f.startled = true;
        G.score += F.startle;
        G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${F.startle} Up they go!`);
        G.ui.notify('The flamingos are up! Fly along with the flock for a bonus.', 'info', 4, 1);
      }
    }
    if (f.state === 'fly') {
      f.t += dt;
      if (f.t >= f.T) { f.state = 'feed'; f.t = 0; f.restT = F.rest; }
    }
    this.poseFlock(dt);
    if (p.dead) return;
    // Flying with the flock: close to any of its birds while it's up in the air.
    const lead = f.birds[0], up = F.size * 1.1, r = 2.5 * (p.sizeScale || 1);
    if (f.state === 'fly' && lead.y - lead.hy > F.alt * 0.6 && !f.joined) {
      if (f.birds.some((b) => Math.hypot(p.pos.x - b.x, p.pos.y - b.y - up, p.pos.z - b.z) < F.with)) {
        if (f.withT === 0) G.fx.popText(p.pos.clone().setY(p.pos.y + 6), 'Keep with them!');
        f.withT += dt;
        G.fx.emit(p.pos, 12 * dt, { colors: ['#ff8fb1', '#ffc2d4', '#ffffff'], speed: 3, life: 1.2, size: 1.6, gravity: -1, drag: 1 });
      }
      if (f.withT >= F.withT) {
        f.joined = true;
        G.score += F.score;
        G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${F.score} Flying with the flamingos!`);
        G.fx.emit(p.pos, 30, { colors: ['#ff8fb1', '#ffc2d4', '#ffffff', '#ff5c8a'], speed: 12, up: 3, life: 1.4, size: 2.4, gravity: -2, drag: 0.6 });
      }
    }
    // Brushing a bird only ruffles its feathers.
    for (const b of f.birds) {
      if (b.puffT > 0 || Math.hypot(p.pos.x - b.x, p.pos.y - b.y - up, p.pos.z - b.z) > F.brush + r) continue;
      b.puffT = 1;
      G.fx.emit(_b.set(b.x, b.y + up, b.z), 8, { colors: ['#ff8fb1', '#ffc2d4', '#ffffff'], speed: 6, life: 1.2, size: 1.6, gravity: -2, drag: 1 });
    }
  }

  // Cloud Kingdom: the golden harp.
  get harpInfo() { return this.harp; }

  dropHarp() {
    if (!this.harp) return;
    this.G.scene.remove(this.harp.group);
    for (const geo of new Set(this.harp.geos)) geo.dispose();
    this.harp.strings.dispose(); // its instance buffers
    this.harp = null;
  }

  // Fairly level cloud ahead for the pedestal (it sinks into the high side).
  placeHarp() {
    const G = this.G, p = G.player, f = p.forward.clone().setY(0), H = HARP, w = H.padW / 2, d = H.padD / 2;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    for (let tries = 0; tries < 24 * 4; tries++) {
      const k = Math.floor(tries / 4);
      if (tries % 4 === 0) this._harpSpot = [rand(H.near, H.far), rand(-0.35, 0.35)];
      const [dd, ss] = this._harpSpot, s = ss * dd, x = p.pos.x + f.x * dd - f.z * s, z = p.pos.z + f.z * dd + f.x * s;
      // The strings face you first (fly straight through and you pluck one), then turned a little at a time.
      const yaw = Math.atan2(p.pos.x - x, p.pos.z - z) + (tries % 4) * 0.35 * (k % 2 ? 1 : -1);
      const hs = [[0, 0], [w, d], [-w, d], [w, -d], [-w, -d], [w, 0], [-w, 0]].map(([a, b]) => this.barnGround(x, z, yaw, H.padX + a, b));
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (hi - lo > H.slope || lo < G.world.seaLevel + 2) continue;
      // No cloud hill may poke up through the soundboard or the strings over the open side.
      if ([0, 12, 24].some((sx) => this.barnGround(x, z, yaw, sx, 0) > lo + this.harpBoardY(sx) - 3)) continue;
      return this.buildHarp(x, lo, z, yaw);
    }
    return null;
  }

  // The neck's height above local x, read off the curve (it runs from the pillar's top down to the scroll).
  harpNeckY(pts, x) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (x >= a.x && x <= b.x) return a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x || 1));
    }
    return pts[pts.length - 1].y;
  }

  harpBoardY(x) { const [[ax, ay], [bx, by]] = HARP.board; return ay + (by - ay) * ((x - ax) / (bx - ax)); }

  buildHarp(x, y, z, yaw) {
    const M = (this.harpMats ||= {
      gold: new THREE.MeshLambertMaterial({ color: '#e8b84a', emissive: '#5a3a08', emissiveIntensity: 0.35, flatShading: true }),
      gold2: new THREE.MeshLambertMaterial({ color: '#c8922e', emissive: '#3a2404', emissiveIntensity: 0.3, flatShading: true }),
      ivory: new THREE.MeshLambertMaterial({ color: '#fbf3e4', flatShading: true }),
      marble: new THREE.MeshLambertMaterial({ color: '#f2eee8', flatShading: true }),
      cloud: new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.15 }),
      halo: new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
      string: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    });
    const H = HARP, g = new THREE.Group(), geos = [], P = H.P;
    const mesh = (geo, mat, parent = g) => { geos.push(geo); const o = new THREE.Mesh(geo, mat); parent.add(o); return o; };
    const along = (o, a, b) => { const dir = b.clone().sub(a), len = dir.length(); o.quaternion.setFromUnitVectors(_Y, dir.normalize()); o.position.copy(a).addScaledVector(dir, len / 2); return o; };
    // The pedestal: white marble with gold bands, sunk into the cloud, puffs of cloud piled round its foot.
    mesh(new THREE.BoxGeometry(H.padW, P + H.base, H.padD), M.marble).position.set(H.padX, (P - H.base) / 2, 0);
    for (const yy of [P - 0.4, 0.6]) mesh(new THREE.BoxGeometry(H.padW + 0.6, 0.8, H.padD + 0.6), M.gold2).position.set(H.padX, yy, 0);
    mesh(new THREE.BoxGeometry(H.padW - 3, 1.2, H.padD - 2), M.gold).position.set(H.padX, P + 0.6, 0);
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, px = H.padX + Math.cos(a) * (H.padW / 2 + 1), pz = Math.sin(a) * (H.padD / 2 + 1);
      const gy = this.barnGround(x, z, yaw, px, pz) - y, puff = mesh(new THREE.SphereGeometry(1, 10, 7), M.cloud);
      const s = 2.5 + (k % 3) * 1.2;
      puff.scale.set(s * 1.4, s * 0.8, s * 1.2); puff.position.set(px, gy + s * 0.2, pz);
    }
    // The pillar: a fluted gold column with a crowned capital, a pair of carved wings and a halo.
    const px = H.pillarX, top = H.top;
    mesh(new THREE.BoxGeometry(6, 4, 6), M.gold2).position.set(px, P + 2, 0);
    mesh(new THREE.CylinderGeometry(2.0, 2.6, top - P - 4, 16), M.gold).position.set(px, (top + P + 4) / 2, 0);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, fl = mesh(new THREE.BoxGeometry(0.5, top - P - 10, 0.5), M.gold2);
      fl.position.set(px + Math.cos(a) * 2.25, (top + P + 4) / 2, Math.sin(a) * 2.25);
    }
    for (const yy of [P + 5, (top + P) / 2, top - 3]) { const rg = mesh(new THREE.TorusGeometry(2.6, 0.5, 6, 16), M.gold2); rg.rotation.x = Math.PI / 2; rg.position.set(px, yy, 0); }
    mesh(new THREE.CylinderGeometry(3.3, 2.4, 3, 16), M.gold).position.set(px, top, 0);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, sp = mesh(new THREE.ConeGeometry(0.5, 1.8, 6), M.gold2); sp.position.set(px + Math.cos(a) * 2.8, top + 2.4, Math.sin(a) * 2.8); }
    mesh(new THREE.SphereGeometry(1.3, 10, 8), M.gold).position.set(px, top + 3, 0);
    for (const sz of [-1, 1]) {
      const wing = mesh(new THREE.SphereGeometry(1, 12, 8), M.gold);
      wing.scale.set(1.2, 2.8, 5); wing.rotation.x = sz * 0.55; wing.position.set(px - 0.6, top - 1, sz * 4.2);
      const tip = mesh(new THREE.SphereGeometry(1, 10, 6), M.gold2);
      tip.scale.set(0.9, 1.6, 3); tip.rotation.x = sz * 0.9; tip.position.set(px - 0.6, top - 4.2, sz * 6.6);
    }
    const halo = mesh(new THREE.TorusGeometry(3, 0.35, 6, 24), M.halo);
    halo.rotation.x = Math.PI / 2; halo.position.set(px, top + 6.5, 0);
    // The soundboard: an ivory board widening toward its foot, gold-trimmed, with a gold eyelet for every string.
    const [[ax, ay], [bx, by]] = H.board, A = new THREE.Vector3(ax, ay, 0), B = new THREE.Vector3(bx, by, 0);
    const board = along(mesh(new THREE.CylinderGeometry(H.boardR[1], H.boardR[0], A.distanceTo(B), 12), M.ivory), A, B);
    board.scale.z = 0.8;
    const trim = along(mesh(new THREE.CylinderGeometry(H.boardR[1] + 0.25, H.boardR[0] + 0.25, A.distanceTo(B) * 0.98, 12, 1, true), M.gold2), A, B);
    trim.scale.set(1, 1, 0.35);
    mesh(new THREE.BoxGeometry(6, ay - P + 1, 6), M.gold2).position.set(ax, (ay + P) / 2, 0);
    // The neck: a gold S-curve from the capital down to a scroll over the soundboard's top.
    const curve = new THREE.CatmullRomCurve3(H.neck.map(([nx, ny]) => new THREE.Vector3(nx, ny, 0)));
    mesh(new THREE.TubeGeometry(curve, 48, H.neckR, 10), M.gold);
    const scroll = mesh(new THREE.TorusGeometry(2.4, 0.9, 8, 16, Math.PI * 1.5), M.gold);
    scroll.position.set(bx + 1.5, by + 2, 0); scroll.rotation.z = -Math.PI / 2;
    const pts = curve.getSpacedPoints(120);
    // The strings, one instanced mesh, each drawn as two halves so its middle can swing when it's plucked. Real harps
    // colour their Cs red and their Fs blue so you can find your place; this one plays a five-note scale, so its Cs are
    // red and its Gs blue. The rest are pale gold, so they still show against the white clouds.
    const list = [];
    for (let i = 0; i < H.strings; i++) {
      const sx = H.x0 + i * H.dx, lo = this.harpBoardY(sx), hi = this.harpNeckY(pts, sx) - H.neckR * 0.6;
      const pin = mesh(new THREE.SphereGeometry(0.45, 6, 4), M.gold2);
      pin.position.set(sx, hi + H.neckR * 0.7, 0);
      for (const sz of [-1, 1]) mesh(new THREE.SphereGeometry(0.4, 6, 4), M.gold2).position.set(sx, lo + 0.3, sz * H.boardR[0] * 0.55);
      const semis = [0, 2, 4, 7, 9][i % 5] + 12 * Math.floor(i / 5);
      const base = new THREE.Color(semis % 12 === 0 ? '#e0404a' : semis % 12 === 7 ? '#3a5ad8' : '#ffd98a');
      list.push({ x: sx, lo, hi, amp: 0, cd: 0, at: -99, base, freq: 130.81 * 2 ** (semis / 12) });
    }
    const unit = new THREE.CylinderGeometry(1, 1, 1, 6);
    geos.push(unit);
    const strings = new THREE.InstancedMesh(unit, M.string, H.strings * 2);
    strings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(strings);
    this.mergeStatic(g, [strings], geos);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.G.scene.add(g);
    this.harp = { group: g, geos, strings, list, pos: g.position, yaw, neck: pts.filter((_, k) => k % 10 === 0),
      plucked: 0, gliss: false, bumpT: 0, ghostT: rand(...H.ghost) };
    this.poseStrings(0);
    return this.harp;
  }

  // Each string's two halves, its middle swung out of the plane while it rings; it glows as it sounds.
  poseStrings(t) {
    const h = this.harp, H = HARP, m4 = _m4, q = _qb, mid = _a, lo = _b, hi = _q, sc = _local;
    h.list.forEach((s, i) => {
      const len = s.hi - s.lo, swing = s.amp * 0.9 * Math.min(1, len / 30) * Math.sin(t * (30 + 3 * i) + i * 1.7);
      lo.set(s.x, s.lo, 0); hi.set(s.x, s.hi, 0); mid.set(s.x, (s.lo + s.hi) / 2, swing);
      for (let k = 0; k < 2; k++) {
        const a = k ? mid : lo, b = k ? hi : mid, dir = _dir.copy(b).sub(a), l = dir.length();
        q.setFromUnitVectors(_Y, dir.normalize());
        m4.compose(_pos.copy(a).addScaledVector(dir, l / 2), q, sc.set(H.sR, l, H.sR));
        h.strings.setMatrixAt(i * 2 + k, m4);
        const glow = Math.min(1, s.amp);
        h.strings.setColorAt(i * 2 + k, _col.copy(s.base).lerp(_white, glow * 0.8));
      }
    });
    h.strings.instanceMatrix.needsUpdate = true;
    h.strings.instanceColor.needsUpdate = true;
  }

  pluckHarp(s, v, detune = 1) {
    s.amp = Math.max(s.amp, v);
    const A = this.G.audio;
    A?.tone?.(s.freq * detune, 1.4, { type: 'triangle', vol: 0.12 * v });
    // The octave above, unless a sweep is already ringing lots of strings at once.
    if (this.harpRinging() < 4) A?.tone?.(s.freq * 2 * detune, 0.8, { type: 'sine', vol: 0.04 * v });
  }

  // How many strings were plucked within the last `within` seconds.
  harpRinging(within = 0.5) {
    const h = this.harp, t = this.G.time;
    let n = 0;
    if (h) for (const s of h.list) if (t - s.at < within) n++;
    return n;
  }

  updateHarp(dt) {
    const G = this.G, p = G.player, H = HARP;
    if (this.harp && Math.hypot(this.harp.pos.x - p.pos.x, this.harp.pos.z - p.pos.z) > H.drop) this.dropHarp();
    if (!this.harp && !G.terrain.stale && (this.harpT -= dt) <= 0) { this.harpT = 0.5; this.placeHarp(); }
    const h = this.harp;
    if (!h) return;
    const t = G.time;
    for (const s of h.list) { s.amp *= Math.exp(-2.2 * dt); s.cd = Math.max(0, s.cd - dt); }
    this.harpMats.halo.opacity = 0.35 + 0.2 * Math.sin(t * 2);
    h.bumpT = Math.max(0, h.bumpT - dt);
    const dist = Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z);
    // Nobody tunes it: now and then a string rings on its own, a little sharp, when you're near enough to hear.
    if (dist < H.ghostNear && (h.ghostT -= dt) <= 0) {
      h.ghostT = rand(...H.ghost);
      this.pluckHarp(h.list[Math.floor(rand(0, h.list.length))], 0.5 * (1 - dist / H.ghostNear), 1.018);
    }
    // A few gold motes drift up round the strings.
    if (dist < 900) {
      const sx = rand(H.x0, H.x0 + H.dx * (H.strings - 1)), sy = rand(this.harpBoardY(sx), 60), cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
      G.fx.emit(_pos.set(h.pos.x + sx * cs, h.pos.y + sy, h.pos.z - sx * sn), 4 * dt, { colors: ['#fff2b0', '#ffd23a', '#ffffff'], speed: 1, up: 3, life: 2.5, size: 1.4, gravity: 0, drag: 0.5 });
    }
    if (!p.dead) {
      const L = this.archLocal(h, _local), r = 2.5 * (p.sizeScale || 1);
      // Plucking: fly through a string (it never hurts) and it sounds.
      for (const s of h.list) {
        if (s.cd > 0) continue;
        const cy = Math.min(s.hi, Math.max(s.lo, L.y));
        if (Math.hypot(L.x - s.x, L.y - cy, L.z) > r + H.reach) continue;
        s.cd = 0.4; s.at = t;
        this.pluckHarp(s, 1);
        h.plucked++;
        const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
        G.fx.emit(_pos.set(h.pos.x + s.x * cs, h.pos.y + cy, h.pos.z - s.x * sn), 5, { colors: ['#fff2b0', '#ffd23a', '#ffffff'], speed: 6, up: 2, life: 0.9, size: 1.6, gravity: -1, drag: 0.8 });
        if (!this.harpTip) { this.harpTip = true; G.ui.notify('The golden harp plays as you fly through it! Skim along its strings for a glissando.', 'info', 4, 1); }
      }
      // A glissando: enough different strings in one sweep.
      if (!h.gliss && this.harpRinging(H.glissT) >= H.gliss) {
        h.gliss = true;
        G.score += H.score;
        G.fx.popText(p.pos.clone().setY(p.pos.y + 6), `+${H.score} Glissando!`);
        G.fx.emit(p.pos, 30, { colors: ['#fff2b0', '#ffd23a', '#ffffff', '#e0404a', '#3a5ad8'], speed: 12, up: 3, life: 1.4, size: 2.4, gravity: -2, drag: 0.6 });
        G.audio?.sparkle?.();
      }
      // The gold frame and the pedestal are solid.
      let hit = false;
      const push = (mx, my, mz) => {
        const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
        p.pos.x += mx * cs + mz * sn; p.pos.z += -mx * sn + mz * cs; p.pos.y += my;
        this.archLocal(h, L);
        hit = true;
      };
      const bar = (ax, ay, bx, by, ra, rb) => { // a round bar in the harp's plane, from a to b, radius ra to rb
        const ux = bx - ax, uy = by - ay, k = Math.min(1, Math.max(0, ((L.x - ax) * ux + (L.y - ay) * uy) / (ux * ux + uy * uy)));
        const dx = L.x - (ax + ux * k), dy = L.y - (ay + uy * k), d = Math.hypot(dx, dy, L.z), rad = ra + (rb - ra) * k;
        if (d < rad + r) { const m = d > 1e-3 ? (rad + r - d) / d : 0; push(dx * m, d > 1e-3 ? dy * m : rad + r, L.z * m); }
      };
      {
        const w = H.padW / 2 + r, d = H.padD / 2 + r, ox = w - Math.abs(L.x - H.padX), oz = d - Math.abs(L.z), oy = H.P + r - L.y;
        if (ox > 0 && oz > 0 && oy > 0 && L.y > -H.base) { const m = Math.min(ox, oz, oy); if (m === oy) push(0, oy, 0); else if (m === ox) push(Math.sign(L.x - H.padX) * ox, 0, 0); else push(0, 0, Math.sign(L.z) * oz); }
      }
      bar(H.pillarX, H.P, H.pillarX, H.top - 2, 2.6, 2.6);
      bar(H.pillarX, H.top - 2, H.pillarX, H.top + 3, 3.4, 3.4); // the capital
      const [[ax, ay], [bx, by]] = H.board;
      bar(ax, ay, bx, by, H.boardR[0], H.boardR[1]);
      for (let k = 1; k < h.neck.length; k++) bar(h.neck[k - 1].x, h.neck[k - 1].y, h.neck[k].x, h.neck[k].y, H.neckR, H.neckR);
      if (hit && h.bumpT <= 0) {
        h.bumpT = H.bumpEvery;
        p.damage(H.dmg);
        G.fx.emit(p.pos, 18, { colors: ['#e8b84a', '#fff2b0', '#ffffff'], speed: 18, life: 0.8, size: 4 });
        if (!this.harpBumpTip) { this.harpBumpTip = true; G.ui.notify('The harp\'s frame is solid gold! Fly through its strings instead.', 'warn', 4, 1); }
      }
    }
    this.poseStrings(t);
  }
}
