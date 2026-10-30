// The journey: a fixed sequence of zones, each a whole new world (terrain shape, colours, props,
// sky, weather, music). Every few completed objectives you fly on into the next one, from green
// meadows up through the stratosphere into orbit, a meteor belt, the Moon and beyond.
import * as THREE from 'three';
import { world, WORLD_DEFAULTS, PALETTES, ZONE_PALETTES, reseed, clearCraters, clearTunnels } from './world.js';
import { Asteroids } from './asteroids.js';
import { CURVE, AXIS_CURVE, CURVE_AXIS, noCurve } from './curve.js';
import { disposeTree } from './models.js';

export const ZONE_EVERY = 3; // completed objectives per zone

// Random world changes that would break a zone's identity are locked while you're in it.
const LOCK = ['sky', 'palette', 'theme', 'seed'];
const SHAPE_LOCK = ['amp', 'shape', 'spikes', 'mesa', 'canyon'];
const SPACE_LOCK = [...LOCK, 'sea', 'clouds', 'weather', 'amp', 'shape', 'islands', 'fog', 'canyon', 'mesa', 'spikes'];
const GROUND_OBJECTIVES = new Set(['lowfly', 'gate', 'buzz', 'tour', 'bullseye']);

export const ZONES = [
  {
    name: 'Meadowlands', blurb: 'Where it all began. Grass, sheep, mild peril.',
    world: { palette: 'Classic Countryside' }, sky: 'noon', weather: 'clear', clouds: ['#ffffff', 40], mood: 'day', lock: LOCK,
  },
  {
    name: 'Autumn Woods', blurb: 'Crunchy leaves, cozy forests and pumpkin-coloured everything.',
    world: { palette: 'Autumn Spice', propDensity: 1.5, amp: 0.8, tempBias: -0.45, mesa: 0.3 }, sky: 'morning', weather: 'leaves', clouds: ['#fff0e0', 35], mood: 'day', lock: [...LOCK, 'weather'],
  },
  {
    name: 'Canyon Country', blurb: 'Red rock, deep gorges and table mountains. Bring sunscreen.',
    world: { palette: 'Classic Countryside', tempBias: 0.7, canyon: 1.4, canyonWidth: 2.2, mesa: 2, spikes: 1.2, amp: 0.8 },
    sky: 'morning', weather: 'clear', clouds: ['#fff4e0', 15], mood: 'day', lock: LOCK,
  },
  {
    name: 'Dune Sea', blurb: 'Endless golden dunes. Somewhere out here, a cactus is very lonely.',
    world: { palette: 'dunes', tempBias: 1.3, amp: 0.2, roughness: 1.8, terrace: 0, mesa: 0.3, canyon: 0, spikes: 0.1, seaLevel: -40, propDensity: 0.5, floatingIslands: 0 },
    sky: 'noon', weather: 'dust', clouds: ['#fff8e8', 10], fog: 0.85, mood: 'day', lock: [...LOCK, 'weather', 'sea'],
  },
  {
    name: 'Frozen Peaks', blurb: 'Jagged ice-cold mountains. The snowmen here are judgmental.',
    world: { palette: 'Winter Wonderland', amp: 1.9, terrace: 0.9, snowLine: 60, tempBias: -0.5 },
    sky: 'dawn', weather: 'snow', clouds: ['#e8f0ff', 55], mood: 'dusk', lock: [...LOCK, 'weather'],
  },
  {
    name: 'Hollow Peaks', blurb: 'Huge mountains with holes clean through them. Yes, you can fly in there. The mountain is fine with it.',
    world: { palette: 'peaks', ranges: 0.55, hillBase: 3, tunnels: 1, amp: 2.2, roughness: 1.1, terrace: 0.35, mesa: 0.5, canyon: 1.6, canyonWidth: 1.8, spikes: 0.5, seaLevel: -30, snowLine: 480, floatingIslands: 0.1, tempBias: -0.15 },
    sky: 'morning', weather: 'clear', clouds: ['#ffffff', 30], fog: 1.15, mood: 'day',
    lock: [...LOCK, ...SHAPE_LOCK, 'sea', 'weather', 'islands'], // reshaped mountains would move the tunnels under you
  },
  {
    name: 'Crystal Caverns', blurb: 'You flew into a cave. There is a ceiling now. Please respect the ceiling.',
    world: { palette: 'cavern', cave: 1, amp: 0.45, terrace: 0, mesa: 0, canyon: 0.8, spikes: 1.1, seaLevel: -5, snowLine: 9999, floatingIslands: 0, propTheme: 'cave', propDensity: 1.1, tempBias: -0.2 },
    sky: 'cave', weather: 'spores', clouds: ['#ffffff', 0], fog: 0.45, mood: 'dusk', noObjectives: ['altitude', 'stairs'],
    lock: [...LOCK, 'weather', 'clouds', 'islands', 'fog', 'amp', 'sea', 'shape', 'spikes', 'mesa', 'canyon'],
  },
  {
    name: 'Volcano Land', blurb: 'Lava seas and falling ash. Do not land. Really, do not.',
    world: { palette: 'volcanic', amp: 1.4, spikes: 1.5, seaLevel: 25, propTheme: 'spooky', propDensity: 0.6 },
    sky: 'volcano', weather: 'ash', clouds: ['#5a4a48', 50], fog: 0.75, mood: 'dusk', lock: [...LOCK, 'weather', 'sea'],
  },
  {
    name: 'Tropical Archipelago', blurb: 'A thousand islands, palm trees, and suspiciously calm whales.',
    world: { palette: 'Deep Jungle', seaLevel: 70, propTheme: 'tropical', tempBias: -0.1 },
    sky: 'sunset', weather: 'clear', clouds: ['#ffd8c0', 35], mood: 'day', lock: LOCK,
  },
  {
    name: 'Sunken Reef', blurb: 'The sea won. You fly underwater now. The surface is the ceiling; the fish are unimpressed.',
    world: { palette: 'reef', underwater: 1, seaLevel: 250, amp: 0.35, roughness: 1.2, terrace: 0, mesa: 0.6, canyon: 0, spikes: 0.7, snowLine: 9999, floatingIslands: 0, propTheme: 'reef', propDensity: 1.3, tempBias: -0.1 },
    sky: 'reef', weather: 'bubbles', clouds: ['#ffffff', 0], fog: 0.5, mood: 'dream', noObjectives: ['altitude', 'stairs'],
    lock: [...LOCK, ...SHAPE_LOCK, 'weather', 'clouds', 'islands', 'fog', 'sea', 'decor'],
  },
  {
    name: 'Giant\'s Garden', blurb: 'Everything here is enormous. You are basically a bug with a propeller.',
    world: { palette: 'Deep Jungle', propTheme: 'garden', propScale: 3.2, propDensity: 0.9, amp: 0.6, tempBias: -0.3 },
    sky: 'noon', weather: 'petals', clouds: ['#ffffff', 30], mood: 'day', lock: [...LOCK, 'weather'],
  },
  {
    name: 'Mushroom Forest', blurb: 'Glowing toxic jungle. The mushrooms are bigger than your plane.',
    world: { palette: 'Toxic Neon', propTheme: 'mushroom', propScale: 2, propDensity: 1.4 },
    sky: 'alien', weather: 'bubbles', clouds: ['#c8ffd8', 30], mood: 'dream', lock: [...LOCK, 'weather'],
  },
  {
    name: 'Neon Grid', blurb: 'Synthwave country. The mountains are pointy, the sun is striped, the year is 1986.',
    world: { palette: 'neon', grid: 64, amp: 1.8, roughness: 0.7, terrace: 0, mesa: 0, canyon: 0.6, spikes: 0.9, seaLevel: 0, propTheme: 'neon', propDensity: 0.35, floatingIslands: 0, balloons: 0 },
    sky: 'synthwave', weather: 'clear', clouds: ['#ff7ad8', 6], fog: 0.9, mood: 'dusk', decor: 'retroSun', sunAzimuth: Math.PI, lock: [...LOCK, 'weather', 'islands', 'decor'],
  },
  {
    name: 'Princess Kingdom', blurb: 'Pink castles, heart-shaped trees and unicorns. Curtsy while flying.',
    world: { palette: 'princess', propTheme: 'princess', propDensity: 1.3, amp: 0.7, spikes: 0.2, tempBias: -0.2 },
    sky: 'royal', weather: 'petals', clouds: ['#fff0fa', 45], mood: 'dream', lock: [...LOCK, 'weather'],
  },
  {
    name: 'Candy Kingdom', blurb: 'Lollipop forests and donut boulders. Dentists fear this place.',
    world: { palette: 'Cotton Candy', propTheme: 'candy', propDensity: 1.3 },
    sky: 'candy', weather: 'confetti', clouds: ['#ffd0ec', 50], mood: 'dream', lock: [...LOCK, 'weather', 'clouds'],
  },
  {
    name: 'Blockland', blurb: 'Everything is made of blocks. The cows are suspicious about it too.',
    world: { palette: 'toy', voxel: 24, amp: 0.7, roughness: 1.2, terrace: 0, mesa: 0.5, canyon: 0.6, spikes: 0.3, seaLevel: 4, propTheme: 'blocks', propDensity: 1, floatingIslands: 0.3, tempBias: -0.2 },
    sky: 'noon', weather: 'clear', clouds: ['#ffffff', 40], mood: 'day', lock: [...LOCK, 'shape'],
  },
  {
    name: 'Salt Mirror', blurb: 'A salt flat under an inch of water. The sky is above you and below you. Pick one.',
    world: { palette: 'salt', amp: 0.04, hillBase: 0.05, roughness: 0.08, terrace: 0, mesa: 0, canyon: 0, spikes: 0, seaLevel: 30, snowLine: 9999, propTheme: 'salt', propDensity: 0.25, floatingIslands: 0, balloons: 0.4, tempBias: -0.3 },
    sky: 'pastel', weather: 'clear', clouds: ['#ffffff', 30], mood: 'dream', lock: [...LOCK, ...SHAPE_LOCK, 'sea', 'islands'],
  },
  {
    name: 'Sky Islands', blurb: 'The ground fell away. Islands float. Physics filed for leave.',
    world: { palette: 'Pastel Dream', floor: -260, seaLevel: -270, floatingIslands: 1, propDensity: 0.8 },
    sky: 'morning', weather: 'clear', clouds: ['#ffffff', 60, 60], mood: 'dream', lock: [...LOCK, 'sea', 'islands'],
  },
  {
    name: 'Stratosphere', blurb: 'Above the clouds. The sky is getting dark. That is space up there.',
    world: { palette: 'Pastel Dream', floor: -650, seaLevel: -700, floatingIslands: 0.5 },
    sky: 'stratosphere', weather: 'clear', clouds: ['#ffffff', 70, -120], mood: 'space', noGround: true, lock: SPACE_LOCK,
  },
  {
    name: 'Low Orbit', blurb: 'You are in space. In a propeller plane. Nobody can explain this.',
    world: { palette: 'lunar', floor: -900, seaLevel: -1000, floatingIslands: 0, propDensity: 0.3 },
    sky: 'space', weather: 'stardust', clouds: ['#ffffff', 0], mood: 'space', decor: 'earthBelow', asteroids: 14, noGround: true, lock: SPACE_LOCK,
  },
  {
    name: 'Meteor Belt', blurb: 'Rocks. Everywhere. Shoot them apart or dodge. Preferably both.',
    world: { palette: 'lunar', floor: -900, seaLevel: -1000, floatingIslands: 0, propDensity: 0.3 },
    sky: 'space', weather: 'stardust', clouds: ['#ffffff', 0], mood: 'space', decor: 'earthBelow', asteroids: 70, comets: true, noGround: true, lock: SPACE_LOCK,
  },
  {
    name: 'Gas Giant', blurb: 'No ground. Just warm, stripy clouds all the way down. Do not look for a landing strip.',
    world: { palette: 'jovian', floor: -900, seaLevel: -1000, amp: 0.3, roughness: 1.6, terrace: 0, mesa: 0, canyon: 0, spikes: 0, snowLine: 9999, floatingIslands: 0, balloons: 0, propTheme: 'bare', propDensity: 0 },
    sky: 'jovian', weather: 'dust', clouds: ['#fff6ea', 60, -120], fog: 0.9, mood: 'space', decor: 'gasGiant', noGround: true, lock: [...SPACE_LOCK, 'decor'],
  },
  {
    name: 'The Moon', blurb: 'Craters, dust and a great view of home. Mind the boulders.',
    world: { palette: 'lunar', craters: 1, seaLevel: -400, amp: 0.7, terrace: 0, canyon: 0, mesa: 0, spikes: 0.3, propTheme: 'lunar', propDensity: 0.5, floatingIslands: 0, tempBias: -1 },
    sky: 'space', weather: 'clear', clouds: ['#ffffff', 0], mood: 'space', decor: 'earthrise', asteroids: 6, lock: SPACE_LOCK,
  },
  {
    name: 'Mars', blurb: 'Red dust, deep canyons, two tiny moons and zero Wi-Fi.',
    world: { palette: 'Mars Vacation', craters: 0.6, amp: 1.1, canyon: 1.2, mesa: 1.2, seaLevel: -60, propTheme: 'lunar', propDensity: 0.4, floatingIslands: 0, balloons: 0, tempBias: 0.6 },
    sky: 'mars', weather: 'dust', clouds: ['#f0c8a0', 8], fog: 0.8, mood: 'dusk', decor: 'marsMoons', lock: [...LOCK, 'weather', 'sea', 'islands'],
  },
  {
    name: 'Planet Pebble', blurb: 'A planet so small you can watch it curve away. Try not to fall off.',
    world: { palette: 'Classic Countryside', curve: 1 / 2400, amp: 0.7, seaLevel: 10, floatingIslands: 0, propDensity: 1.2 },
    sky: 'pebble', weather: 'clear', clouds: ['#ffffff', 14, 220], mood: 'dream', lock: [...LOCK, 'islands'],
  },
  {
    name: 'Ringworld', blurb: 'You live on the inside of a giant ring. The ground goes up on both sides. Do not think about it.',
    world: { palette: 'Classic Countryside', axisCurve: -1 / 2000, curveAxis: 'x', amp: 0.8, seaLevel: 8, floatingIslands: 0, propDensity: 1.1 },
    sky: 'noon', weather: 'clear', clouds: ['#ffffff', 20], fog: 1.1, mood: 'day', decor: 'ringArch', lock: [...LOCK, 'islands', 'decor'],
  },
  {
    name: 'Alien World', blurb: 'Purple grass, crystal forests, a lime sky. You are far from home.',
    world: { palette: 'Alien Planet', amp: 1.5, spikes: 1, propTheme: 'crystal', propDensity: 1.2 },
    sky: 'alien', weather: 'glitter', clouds: ['#b0ffe8', 35], mood: 'dream', decor: 'twoMoons', lock: [...LOCK, 'weather'],
  },
];

export class Zones {
  constructor(G) {
    this.G = G;
    this.index = 0;
    this.lap = 1;
    this.sinceZone = 0;
    this.asteroids = new Asteroids(G);
    this.decor = new THREE.Group(); // planets in the sky, follows the camera like the sky dome
    this.decks = [];                // gas giant cloud decks (part of the decor) that scroll as you fly
    G.scene.add(this.decor);
    this.el = { label: document.getElementById('zone'), card: document.getElementById('zone-card') };
    this.cardTimer = 0;
  }

  get current() { return ZONES[this.index]; }

  allowsMutation(group) { return !this.current.lock.includes(group); }
  allowsObjective(type) {
    const z = this.current;
    return !(z.noGround && GROUND_OBJECTIVES.has(type)) && !z.noObjectives?.includes(type);
  }
  allowsEnemy(def) { return !(this.current.noGround && def.ground); }

  // Called once per completed objective. Returns lines for the success card when a new zone begins.
  onObjectiveComplete() {
    if (++this.sinceZone < ZONE_EVERY) return null;
    this.sinceZone = 0;
    let next = this.index + 1;
    if (next >= ZONES.length) { next = 0; this.lap++; }
    this.enter(next);
    const z = this.current;
    return [`New zone: ${z.name}${this.lap > 1 ? ` (lap ${this.lap})` : ''}!`, z.blurb];
  }

  enter(i, { instant = false, keepSeed = false } = {}) {
    const G = this.G;
    this.index = i;
    const z = this.current;
    const { palette, ...params } = z.world;
    Object.assign(world, WORLD_DEFAULTS, params);
    world.palette = ZONE_PALETTES[palette] || PALETTES.find((p) => p.name === palette) || PALETTES[0];
    if (!keepSeed) reseed((Math.random() * 1e9) | 0); // a fresh landscape for every zone
    clearCraters(); // the old zone's blast holes don't belong in the new world
    clearTunnels(); // nor its tunnels
    G.sky.setPreset(z.sky, instant);
    G.sky.weather.set(z.weather);
    G.sky.clouds.setStyle(z.clouds[0], z.clouds[1], z.clouds[2] ?? 440); // default cloud layer height
    G.sky.fogScale = z.fog ?? 1;
    // Line the sky's sun up with a sun in the decor; other zones get a fresh random sun direction.
    G.sky.azimuth = z.sunAzimuth ?? Math.random() * Math.PI * 2;
    G.sky.decor.clear();
    this.asteroids.configure(z.asteroids || 0, !!z.comets);
    this.buildDecor(z.decor);
    G.audio.music?.setMood(z.mood);
    if (!instant) {
      G.terrain.rebuildAll();
      G.player.grace = 8; // the ground may jump up under you while the new world forms
      this.showCard();
    }
  }

  buildDecor(kind) {
    for (const c of this.decor.children) disposeTree(c); // planets, suns, rings: free their textures and geometry
    this.decor.clear();
    this.decks = [];
    if (kind === 'earthBelow') {
      // A huge Earth filling the view below you: you're in orbit.
      const earth = planet(2600, '#2a6ad0');
      earth.position.set(0, -3700, -1200);
      this.decor.add(earth);
    } else if (kind === 'earthrise') {
      const earth = planet(320, '#2a6ad0');
      earth.position.set(1800, 1500, -2600);
      this.decor.add(earth);
    } else if (kind === 'twoMoons' || kind === 'marsMoons') {
      const moons = kind === 'twoMoons' ? [[260, '#ffd0f0', -1600, 1200], [140, '#c8fff0', 1300, 1700]] : [[90, '#b8a898', -1200, 1500], [50, '#a89888', 900, 1900]];
      for (const [r, c, x, y] of moons) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), noCurve(new THREE.MeshBasicMaterial({ color: c, fog: false })));
        m.position.set(x, y, -2800);
        this.decor.add(m);
      }
    } else if (kind === 'retroSun') {
      // A huge striped synthwave sun sitting on the horizon.
      const sun = new THREE.Sprite(noCurve(new THREE.SpriteMaterial({ map: retroSunTexture(), fog: false, depthWrite: false })));
      sun.scale.setScalar(1500);
      sun.position.set(0, 500, -3300);
      this.decor.add(sun);
    } else if (kind === 'gasGiant') {
      // A banded giant with a ring in the sky, and see-through stripy cloud decks over the cloud tops (the terrain) below.
      const giant = new THREE.Mesh(new THREE.SphereGeometry(750, 48, 32), noCurve(new THREE.MeshBasicMaterial({ map: bandTexture(['#e8b07a', '#f6e2c0', '#c8743a', '#f0c890', '#a85a2a', '#fff0d8']), fog: false })));
      giant.rotation.z = 0.35;
      const ring = new THREE.Mesh(new THREE.RingGeometry(1000, 1600, 96), noCurve(new THREE.MeshBasicMaterial({ map: ringTexture(), fog: false, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
      ring.rotation.set(1.3, 0.2, 0.35);
      giant.add(ring);
      giant.position.set(-1700, 1150, -2800);
      this.decor.add(giant);
      [[-260, 0.45], [-520, 0.7]].forEach(([y, opacity], k) => {
        const tex = bandTexture(k % 2 ? ['#f0c890', '#c8743a', '#fff0d8', '#e8a060'] : ['#e8b07a', '#fff0d8', '#d08850', '#f6e2c0'], true);
        tex.repeat.set(3, 3);
        const deck = new THREE.Mesh(new THREE.PlaneGeometry(DECK, DECK), noCurve(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })));
        deck.rotation.x = -Math.PI / 2;
        deck.userData.y = y; // a fixed altitude in the world (the rest of the decor only follows the camera)
        deck.userData.drift = 0.004 * (k + 1); // the bands slide past at different speeds
        this.decor.add(deck);
        this.decks.push(deck);
      });
    } else if (kind === 'ringArch') {
      // The far side of the ring, arching across the sky overhead.
      const arch = new THREE.Mesh(new THREE.TorusGeometry(2300, 70, 4, 96, Math.PI), noCurve(new THREE.MeshBasicMaterial({ map: archTexture(), fog: false, transparent: true, opacity: 0.55, depthWrite: false })));
      arch.scale.z = 8;
      arch.position.y = -250;
      this.decor.add(arch);
    }
  }

  showCard() {
    const z = this.current, el = this.el.card;
    el.querySelector('.zone-step').textContent = `ZONE ${this.index + 1} / ${ZONES.length}${this.lap > 1 ? ` · LAP ${this.lap}` : ''}`;
    el.querySelector('.zone-name').textContent = z.name;
    el.querySelector('.zone-blurb').textContent = z.blurb;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.cardTimer = 4.5;
  }

  update(dt) {
    const G = this.G, z = this.current;
    this.asteroids.update(dt);
    const cam = G.camera.position;
    this.decor.position.copy(cam);
    for (const d of this.decks) { // the cloud decks travel with you, so their bands scroll to stay put in the world
      const t = d.material.map;
      d.position.y = d.userData.y - cam.y;
      t.offset.set(cam.x * t.repeat.x / DECK + G.time * d.userData.drift, -cam.z * t.repeat.y / DECK);
    }
    const ease = 1 - Math.exp(-dt * 0.8);
    CURVE.value += (world.curve - CURVE.value) * ease; // the horizon bends in (and back out) gently
    AXIS_CURVE.value += (world.axisCurve - AXIS_CURVE.value) * ease;
    if (world.axisCurve) CURVE_AXIS.value.set(world.curveAxis === 'z' ? 0 : 1, world.curveAxis === 'z' ? 1 : 0);
    const music = G.audio.music;
    if (music && music.mood !== undefined) music.setMood(z.mood); // music starts after the first click
    if (this.cardTimer > 0 && (this.cardTimer -= dt) <= 0) this.el.card.classList.remove('show');
    const left = ZONE_EVERY - this.sinceZone;
    this.el.label.textContent = `🗺 ${z.name} · next zone in ${left} objective${left > 1 ? 's' : ''}`;
  }
}

const DECK = 9000; // size of a gas giant cloud deck

// Wavy horizontal bands of colour (a gas giant, or a cloud deck when it should tile).
function bandTexture(colors, tile = false) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = colors[0];
  c.fillRect(0, 0, 512, 256);
  let y = 0;
  for (let k = 0; y < 256; k++) {
    const h = 8 + Math.random() * 26, amp = 2 + Math.random() * 6, f = (Math.PI * 2 * (1 + Math.floor(Math.random() * 3))) / 512;
    c.fillStyle = colors[k % colors.length];
    c.beginPath();
    c.moveTo(0, y);
    for (let x = 0; x <= 512; x += 16) c.lineTo(x, y + Math.sin(x * f + k) * amp);
    for (let x = 512; x >= 0; x -= 16) c.lineTo(x, y + h + Math.sin(x * f + k + 1) * amp);
    c.fill();
    y += h;
  }
  if (!tile) { // a great big storm
    c.fillStyle = '#c0502a';
    c.beginPath(); c.ellipse(340, 160, 30, 13, 0, 0, Math.PI * 2); c.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (tile) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Concentric rings for the gas giant (RingGeometry maps its UVs flat across the disc).
function ringTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const c = cv.getContext('2d');
  for (let r = 160; r < 256; r += 3) {
    c.strokeStyle = `rgba(255, ${200 + Math.floor(Math.random() * 50)}, ${150 + Math.floor(Math.random() * 60)}, ${(0.15 + Math.random() * 0.6).toFixed(2)})`;
    c.lineWidth = 3;
    c.beginPath(); c.arc(256, 256, r, 0, Math.PI * 2); c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The synthwave sun: a yellow-to-magenta disc sliced by ever-wider gaps toward the bottom.
function retroSunTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 16, 0, 496);
  g.addColorStop(0, '#fff27a'); g.addColorStop(0.45, '#ffa040'); g.addColorStop(1, '#ff2aa0');
  c.fillStyle = g;
  c.beginPath(); c.arc(256, 256, 240, 0, Math.PI * 2); c.fill();
  c.globalCompositeOperation = 'destination-out';
  for (let k = 0, y = 270; y < 512; k++) { const h = 4 + k * 3; c.fillRect(0, y, 512, h); y += h + 22 - k * 1.5; }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Fields, seas and deserts along the far side of the ring.
function archTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#5c9e3c';
  c.fillRect(0, 0, 1024, 64);
  for (let k = 0; k < 90; k++) {
    c.fillStyle = ['#3b742b', '#2b8bd1', '#86b54a', '#e6d49c', '#2b8bd1'][k % 5];
    c.fillRect(Math.random() * 1024, Math.random() * 64, 10 + Math.random() * 50, 6 + Math.random() * 30);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A planet with procedurally painted continents and a soft atmosphere halo.
function planet(radius, ocean) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = ocean;
  c.fillRect(0, 0, 512, 256);
  for (let k = 0; k < 40; k++) {
    c.fillStyle = k % 3 ? '#3a8a3a' : '#b89a5a';
    c.beginPath();
    c.ellipse(Math.random() * 512, 40 + Math.random() * 176, 10 + Math.random() * 50, 6 + Math.random() * 25, Math.random() * 3, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.75)';
  for (let k = 0; k < 60; k++) { c.beginPath(); c.ellipse(Math.random() * 512, Math.random() * 256, 8 + Math.random() * 40, 3 + Math.random() * 8, 0, 0, Math.PI * 2); c.fill(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), noCurve(new THREE.MeshBasicMaterial({ map: tex, fog: false }))));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.04, 48, 32), noCurve(new THREE.MeshBasicMaterial({ color: '#8ac8ff', transparent: true, opacity: 0.25, fog: false, side: THREE.BackSide }))));
  return g;
}
