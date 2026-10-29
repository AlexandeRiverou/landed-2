// The journey: a fixed sequence of zones, each a whole new world (terrain shape, colours, props,
// sky, weather, music). Every few completed objectives you fly on into the next one, from green
// meadows up through the stratosphere into orbit, a meteor belt, the Moon and beyond.
import * as THREE from 'three';
import { world, WORLD_DEFAULTS, PALETTES, ZONE_PALETTES, reseed } from './world.js';
import { Asteroids } from './asteroids.js';

export const ZONE_EVERY = 3; // completed objectives per zone

// Random world changes that would break a zone's identity are locked while you're in it.
const LOCK = ['sky', 'palette', 'theme', 'seed'];
const SPACE_LOCK = [...LOCK, 'sea', 'clouds', 'weather', 'amp', 'shape', 'islands', 'fog', 'canyon', 'mesa', 'spikes'];
const GROUND_OBJECTIVES = new Set(['lowfly', 'gate', 'buzz']);

export const ZONES = [
  {
    name: 'Meadowlands', blurb: 'Where it all began. Grass, sheep, mild peril.',
    world: { palette: 'Classic Countryside' }, sky: 'noon', weather: 'clear', clouds: ['#ffffff', 40], mood: 'day', lock: LOCK,
  },
  {
    name: 'Canyon Country', blurb: 'Red rock, deep gorges and table mountains. Bring sunscreen.',
    world: { palette: 'Classic Countryside', tempBias: 0.7, canyon: 1.4, canyonWidth: 2.2, mesa: 2, spikes: 1.2, amp: 0.8 },
    sky: 'morning', weather: 'clear', clouds: ['#fff4e0', 15], mood: 'day', lock: LOCK,
  },
  {
    name: 'Frozen Peaks', blurb: 'Jagged ice-cold mountains. The snowmen here are judgmental.',
    world: { palette: 'Winter Wonderland', amp: 1.9, terrace: 0.9, snowLine: 60, tempBias: -0.5 },
    sky: 'dawn', weather: 'snow', clouds: ['#e8f0ff', 55], mood: 'dusk', lock: [...LOCK, 'weather'],
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
    name: 'Mushroom Forest', blurb: 'Glowing toxic jungle. The mushrooms are bigger than your plane.',
    world: { palette: 'Toxic Neon', propTheme: 'mushroom', propScale: 2, propDensity: 1.4 },
    sky: 'alien', weather: 'bubbles', clouds: ['#c8ffd8', 30], mood: 'dream', lock: [...LOCK, 'weather'],
  },
  {
    name: 'Candy Kingdom', blurb: 'Lollipop forests and donut boulders. Dentists fear this place.',
    world: { palette: 'Cotton Candy', propTheme: 'candy', propDensity: 1.3 },
    sky: 'candy', weather: 'confetti', clouds: ['#ffd0ec', 50], mood: 'dream', lock: [...LOCK, 'weather', 'clouds'],
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
    name: 'The Moon', blurb: 'Craters, dust and a great view of home. Mind the boulders.',
    world: { palette: 'lunar', craters: 1, seaLevel: -400, amp: 0.7, terrace: 0, canyon: 0, mesa: 0, spikes: 0.3, propTheme: 'lunar', propDensity: 0.5, floatingIslands: 0, tempBias: -1 },
    sky: 'space', weather: 'clear', clouds: ['#ffffff', 0], mood: 'space', decor: 'earthrise', asteroids: 6, lock: SPACE_LOCK,
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
    G.scene.add(this.decor);
    this.el = { label: document.getElementById('zone'), card: document.getElementById('zone-card') };
    this.cardTimer = 0;
  }

  get current() { return ZONES[this.index]; }

  allowsMutation(group) { return !this.current.lock.includes(group); }
  allowsObjective(type) { return !(this.current.noGround && GROUND_OBJECTIVES.has(type)); }
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
    G.sky.setPreset(z.sky, instant);
    G.sky.weather.set(z.weather);
    G.sky.clouds.setStyle(z.clouds[0], z.clouds[1], z.clouds[2] ?? 440); // default cloud layer height
    G.sky.fogScale = z.fog ?? 1;
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
    this.decor.clear();
    if (kind === 'earthBelow') {
      // A huge Earth filling the view below you: you're in orbit.
      const earth = planet(2600, '#2a6ad0');
      earth.position.set(0, -3700, -1200);
      this.decor.add(earth);
    } else if (kind === 'earthrise') {
      const earth = planet(320, '#2a6ad0');
      earth.position.set(1800, 1500, -2600);
      this.decor.add(earth);
    } else if (kind === 'twoMoons') {
      for (const [r, c, x, y] of [[260, '#ffd0f0', -1600, 1200], [140, '#c8fff0', 1300, 1700]]) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color: c, fog: false }));
        m.position.set(x, y, -2800);
        this.decor.add(m);
      }
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
    this.decor.position.copy(G.camera.position);
    const music = G.audio.music;
    if (music && music.mood !== undefined) music.setMood(z.mood); // music starts after the first click
    if (this.cardTimer > 0 && (this.cardTimer -= dt) <= 0) this.el.card.classList.remove('show');
    const left = ZONE_EVERY - this.sinceZone;
    this.el.label.textContent = `🗺 ${z.name} · next zone in ${left} objective${left > 1 ? 's' : ''}`;
  }
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
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshBasicMaterial({ map: tex, fog: false })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.04, 48, 32), new THREE.MeshBasicMaterial({ color: '#8ac8ff', transparent: true, opacity: 0.25, fog: false, side: THREE.BackSide })));
  return g;
}
