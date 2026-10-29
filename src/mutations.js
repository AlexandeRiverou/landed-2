// Every completed objective reshapes the world: sky, weather, palette, mountains,
// sea level, cliffs, canyons, prop themes, your plane... Several at once, every time.
import * as THREE from 'three';
import { PALETTES, reseed } from './world.js';
import { THEMES } from './terrain.js';
import { TOD } from './sky.js';
import { PLANE_SKINS } from './models.js';
import { pick, rand } from './texts.js';
import { flatForward } from './objectives.js';

const TOD_TEXT = {
  noon: 'High noon. The sun is directly overhead, judging you.',
  morning: 'Good morning! Someone fast-forwarded time. Breakfast is cancelled.',
  sunset: 'Instant sunset! Very romantic. The enemies are blushing.',
  dusk: 'Dusk has fallen. Not on anyone, thankfully.',
  night: 'Someone turned off the sun. Probably budget cuts.',
  dawn: 'Dawn breaks! (We\'ll pay for it.)',
  alien: 'The sky is now lime-flavored. Do not lick the sky.',
  candy: 'The sky is pink now. Nobody voted for this, but here we are.',
  eclipse: 'Surprise eclipse! Do not look at it. Look at the objectives instead.',
  storm: 'Overcast. The sky is in a mood.',
};
const WEATHER_TEXT = {
  clear: 'Weather cleared. Blue skies, no excuses.',
  rain: 'Mild drizzle of regret has begun.',
  snow: 'It\'s snowing! Every flake is unique, just like your flying.',
  confetti: 'It is now raining confetti. Paid for by your taxes.',
  bubbles: 'Somebody left the bubble machine on. For the whole planet.',
  leaves: 'Leaves are falling from... nowhere? There are no trees up here.',
  glitter: 'Glitter storm! You will be finding this in the cockpit for years.',
};
const THEME_TEXT = {
  default: 'Trees have returned to being trees. Boring, but stable.',
  mushroom: 'All trees have been replaced with giant mushrooms. Don\'t ask. Don\'t eat.',
  candy: 'The forest is now lollipops and donuts. Dentists are circling.',
  crystal: 'Rocks have become magic crystals. Market value: priceless. Resale value: zero.',
  gnome: 'GNOME INVASION. They were always here. Now they\'re bigger.',
  spooky: 'Spooky season! All the trees died of fright. They\'re fine. Mostly.',
  tropical: 'Palm trees everywhere. Even on the snowy mountains. Especially there.',
  construction: 'Traffic cones have replaced the rocks. The sky is under construction.',
  duck: 'The Duckening has begun. Houses are ducks now. Boats are ducks now.',
};

const MUTATIONS = [
  { id: 'tod', group: 'sky', apply(G) {
    const name = pick(Object.keys(TOD).filter((k) => k !== G.sky.preset));
    G.sky.setPreset(name);
    return TOD_TEXT[name];
  } },
  { id: 'weather', group: 'weather', apply(G) {
    const name = pick(Object.keys(WEATHER_TEXT).filter((k) => k !== G.sky.weather.type));
    G.sky.weather.set(name);
    return WEATHER_TEXT[name];
  } },
  { id: 'palette', group: 'palette', rebuild: true, apply(G) {
    G.world.palette = pick(PALETTES.filter((p) => p !== G.world.palette));
    return pick([
      `The world was repainted in "${G.world.palette.name}". The painters were not consulted.`,
      `New color scheme: "${G.world.palette.name}". The grass is confused about its identity.`,
    ]);
  } },
  { id: 'mountainsUp', group: 'amp', rebuild: true, can: (G) => G.world.amp < 2.2, apply(G) {
    G.world.amp = Math.min(2.4, G.world.amp * rand(1.3, 1.6));
    return pick(['Mountains have been working out. They\'re TALLER now.', 'Mountains grew. Watch your head. And your wings.']);
  } },
  { id: 'mountainsDown', group: 'amp', rebuild: true, can: (G) => G.world.amp > 0.5, apply(G) {
    G.world.amp = Math.max(0.35, G.world.amp * 0.6);
    return pick(['Mountains filed for early retirement. They\'re shorter now.', 'Mountains got shy and shrank.']);
  } },
  { id: 'seaUp', group: 'sea', rebuild: true, can: (G) => G.world.seaLevel < 120, apply(G) {
    G.world.seaLevel = Math.min(140, G.world.seaLevel + rand(25, 45));
    return pick(['Sea level rose. Beachfront property just got a lot more beachy.', 'Flood! The fish are throwing a welcome party.']);
  } },
  { id: 'seaDown', group: 'sea', rebuild: true, can: (G) => G.world.seaLevel > -20, apply(G) {
    G.world.seaLevel = Math.max(-35, G.world.seaLevel - rand(30, 50));
    return pick(['Someone pulled the plug on the ocean.', 'The sea went on a diet. More land for everyone!']);
  } },
  { id: 'terraces', group: 'shape', rebuild: true, apply(G) {
    G.world.terrace = rand(0.85, 1);
    G.world.mesa = Math.max(G.world.mesa, 1.3);
    return 'Cliffs everywhere! The mountains got terraced. Very trendy. Very stair-y.';
  } },
  { id: 'smooth', group: 'shape', rebuild: true, apply(G) {
    G.world.terrace = 0; G.world.roughness = 0.6; G.world.spikes = 0.2;
    return 'The world has been ironed. Smooth hills only. Like butter.';
  } },
  { id: 'canyons', group: 'canyon', rebuild: true, apply(G) {
    G.world.canyon = 1.4; G.world.canyonWidth = rand(1.6, 2.6);
    return 'Canyon season! Deep river gorges have been carved. Fly through them, show-off.';
  } },
  { id: 'spikes', group: 'spikes', rebuild: true, apply(G) {
    G.world.spikes = rand(1.3, 1.8); G.world.roughness = Math.max(G.world.roughness, 1.1);
    return 'Rock spikes sprouted everywhere. Fly responsibly. Or pointily.';
  } },
  { id: 'mesas', group: 'mesa', rebuild: true, apply(G) {
    G.world.mesa = rand(1.6, 2.2);
    return 'Table mountains for everyone! Flat tops, sheer cliffs, zero tablecloths.';
  } },
  { id: 'theme', group: 'theme', rebuild: true, apply(G) {
    G.world.propTheme = pick(Object.keys(THEMES).filter((k) => k !== G.world.propTheme));
    return THEME_TEXT[G.world.propTheme];
  } },
  { id: 'scale', group: 'scale', rebuild: true, apply(G) {
    const big = G.world.propScale < 1.5 && Math.random() < 0.65;
    G.world.propScale = big ? rand(1.9, 2.6) : rand(0.45, 0.6);
    return big ? 'Everything on the ground is HUGE now. Trees the size of buildings!' : 'Shrink ray accident. Everything on the ground is tiny. Adorable.';
  } },
  { id: 'density', group: 'density', rebuild: true, apply(G) {
    const more = G.world.propDensity < 1.5;
    G.world.propDensity = more ? rand(1.7, 2.2) : rand(0.4, 0.7);
    return more ? 'The forest got denser. The trees unionized and reproduced.' : 'Half the trees went on vacation.';
  } },
  { id: 'islands', group: 'islands', rebuild: true, can: (G) => G.world.floatingIslands < 0.9, apply(G) {
    G.world.floatingIslands = Math.min(1, G.world.floatingIslands + 0.35);
    return 'More floating islands! Physics took the day off.';
  } },
  { id: 'drift', group: 'seed', rebuild: true, apply(G) {
    reseed((Math.random() * 1e9) | 0);
    return 'Continental drift (accelerated 40,000,000×). The entire map just changed.';
  } },
  { id: 'props', group: 'propsalt', rebuild: true, apply(G) {
    G.world.propSalt++;
    return 'Every tree, rock and house swapped places overnight. Nobody saw anything.';
  } },
  { id: 'skin', group: 'skin', apply(G) {
    const s = pick(PLANE_SKINS.filter((k) => k !== G.player.skin));
    G.player.setSkin(s);
    return `Your plane got a new paint job: "${s.name}". It's... a choice.`;
  } },
  { id: 'speed', group: 'speed', can: (G) => G.player.baseSpeed < 60, apply(G) {
    G.player.baseSpeed = Math.min(62, G.player.baseSpeed + 4);
    return 'Engine upgrade: +4 speed! Warranty void.';
  } },
  { id: 'clouds', group: 'clouds', apply(G) {
    const [color, count, text] = pick([
      ['#ffd0ec', 55, 'Clouds are now cotton candy. Please do not fly through them with your mouth open.'],
      ['#ffffff', 68, 'Cloud production doubled. The sky is fluffier than ever.'],
      ['#8a8f9a', 50, 'Clouds are grumpy and gray now. They read the news.'],
      ['#ffe08a', 45, 'Golden clouds! Very fancy. Very heavenly.'],
      ['#b0ffe8', 45, 'Minty clouds. The sky smells fresh now.'],
      ['#ffffff', 10, 'Most clouds left. They had places to be.'],
    ]);
    G.sky.clouds.setStyle(color, count);
    return text;
  } },
  { id: 'planet', group: 'decor', apply(G) {
    G.sky.decor.clear();
    const kind = pick(['planet', 'moons', 'rainbow']);
    const dir = flatForward(G).applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.6, 0.6));
    if (kind === 'planet') {
      const p = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 16), new THREE.MeshBasicMaterial({ color: pick(['#ffb46a', '#8ad0ff', '#d08aff']), fog: false }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(520, 40, 2, 48), new THREE.MeshBasicMaterial({ color: '#fff0c8', fog: false, transparent: true, opacity: 0.7 }));
      ring.rotation.x = 1.2;
      p.add(ring);
      p.position.copy(dir).multiplyScalar(3300).setY(900);
      G.sky.decor.add(p);
      return 'A ringed planet parked in the sky. It hasn\'t paid for parking.';
    }
    if (kind === 'moons') {
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(rand(80, 160), 16, 12), new THREE.MeshBasicMaterial({ color: pick(['#f4f0e0', '#ffd0d0', '#d0e0ff']), fog: false }));
        m.position.copy(dir).applyAxisAngle(new THREE.Vector3(0, 1, 0), (k - 1) * 0.35).multiplyScalar(3300).setY(700 + k * 300);
        G.sky.decor.add(m);
      }
      return 'Three moons have entered the chat. Tides are VERY confused.';
    }
    const colors = ['#ff3a3a', '#ff9a3a', '#ffe03a', '#4aff6a', '#3ab0ff', '#9a5aff'];
    colors.forEach((c, i) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(1800 - i * 60, 30, 4, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, fog: false, transparent: true, opacity: 0.55 }));
      t.position.copy(dir).multiplyScalar(2500).setY(-300);
      t.rotation.y = Math.atan2(dir.x, dir.z);
      G.sky.decor.add(t);
    });
    return 'A permanent rainbow. Leprechauns have been notified.';
  } },
  { id: 'fog', group: 'fog', apply(G) {
    const thick = G.sky.fogScale >= 1 && Math.random() < 0.5;
    G.sky.fogScale = thick ? 0.6 : 1.1;
    return thick ? 'Fog machine set to 11. Very moody. Very mysterious.' : 'The fog has been politely asked to leave.';
  } },
  { id: 'hats', group: 'hats', can: (G) => !G.enemies.hats, apply(G) {
    G.enemies.hats = true;
    return 'All new enemies wear party hats. It does NOT make them friendlier.';
  } },
];

export class Mutations {
  constructor(G) { this.G = G; }

  celebrate(forced) {
    const G = this.G, p = G.player;
    G.audio.success();
    // Fireworks well off to the sides and high up, so they celebrate without blocking the view.
    for (let k = 0; k < 6; k++) {
      const side = (k % 2 ? 1 : -1) * rand(120, 200);
      const pos = p.pos.clone().addScaledVector(p.forward, rand(180, 320)).addScaledVector(p.right, side).add(new THREE.Vector3(0, rand(70, 140), 0));
      setTimeout(() => G.fx.firework(pos), k * 220);
    }

    // Every few objectives you fly on into a whole new zone; that *is* this round's world change.
    const zone = G.zones.onObjectiveComplete();
    if (zone) return zone;

    const count = forced ? 2 : Math.min(6, 3 + Math.floor(G.objectives.completed / 2));
    const pool = MUTATIONS.filter((m) => (!m.can || m.can(G)) && G.zones.allowsMutation(m.group));
    const chosen = [], groups = new Set();
    while (chosen.length < count && pool.length) {
      const m = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      if (groups.has(m.group)) continue;
      groups.add(m.group);
      chosen.push(m);
    }
    const lines = [];
    let rebuild = false;
    for (const m of chosen) {
      lines.push(m.apply(G));
      if (m.rebuild) rebuild = true;
    }
    if (rebuild) { G.terrain.rebuildAll(); p.grace = 6; }
    return lines;
  }
}
