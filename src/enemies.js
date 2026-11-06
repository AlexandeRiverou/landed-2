// Enemies: chasing drones, spiky balloon mines, dive-bombing seagulls, orb-spitting UFOs,
// grumpy storm clouds, bee swarms, ad blimps, sky jellyfish, ground cannons, Rival Pilot Gary,
// and (quest-only) evil pigeons. Regular enemies spawn in a cone in front of the player.
import * as THREE from 'three';
import { makeDrone, makeMine, makeGull, makeUfo, makeStorm, makePigeon, makeGoose, makeCrown, makeBlimp, makeBee, makeJelly, makeCannon, makeRivalJet, makeOctopus, makeCrab, makePuffer, disposeTree } from './models.js';
import { pick, rand, T } from './texts.js';
import { waterLine } from './world.js';
import { MOVES as BOSS_MOVES, Hazards, guardStep, animateBoss, endMoves, dropBoss, daze } from './bossmoves.js';

const TYPES = {
  drone: { hp: 2, radius: 5, dmg: 18, speed: 38, make: makeDrone, score: 50, minScore: 0, weight: 3, kamikaze: true, name: 'Angry Drone' },
  mine: { hp: 1, radius: 6, dmg: 25, speed: 10, make: makeMine, score: 30, minScore: 0, weight: 2, kamikaze: true, name: 'Spiky Balloon' },
  gull: { hp: 1, radius: 4, dmg: 8, speed: 58, make: makeGull, score: 25, minScore: 150, weight: 2, kamikaze: true, name: 'Seagull Gang' },
  ufo: { hp: 4, radius: 10, dmg: 15, speed: 34, make: makeUfo, score: 120, minScore: 350, weight: 1.2, kamikaze: false, name: 'UFO' },
  storm: { hp: 6, radius: 22, dmg: 12, speed: 16, make: makeStorm, score: 150, minScore: 650, weight: 0.8, kamikaze: false, name: 'Grumpy Cloud' },
  pigeon: { hp: 2, radius: 5, dmg: 10, speed: 36, make: makePigeon, score: 80, minScore: Infinity, weight: 0, kamikaze: true, name: 'Evil Pigeon' },
  bee: { hp: 1, radius: 3, dmg: 6, speed: 44, make: makeBee, score: 15, minScore: 80, weight: 1.6, kamikaze: true, name: 'Bee Swarm', intro: 'A bee swarm! Not the bees! Okay, the bees.' },
  blimp: { hp: 6, radius: 15, dmg: 15, speed: 12, make: makeBlimp, score: 110, minScore: 220, weight: 1, kamikaze: false, name: 'Ad Blimp', intro: 'An Ad Blimp is dropping "special offers". They explode.' },
  jelly: { hp: 3, radius: 8, dmg: 10, speed: 8, make: makeJelly, score: 70, minScore: 180, weight: 1.2, kamikaze: false, name: 'Sky Jellyfish', intro: 'Sky Jellyfish ahead. Do not hug. They zap up close.' },
  cannon: { hp: 4, radius: 8, dmg: 10, speed: 0, make: makeCannon, score: 100, minScore: 300, weight: 1, kamikaze: false, ground: true, armor: 0.5, name: 'Grumpy Ground Cannon', intro: 'Grumpy Ground Cannons are shooting at the sky. The sky did nothing wrong.' },
  rival: { hp: 3, radius: 6, dmg: 20, speed: 62, make: makeRivalJet, score: 150, minScore: 450, weight: 0.9, kamikaze: false, name: 'Rival Pilot Gary', intro: 'Rival Pilot Gary has entered the sky. Nobody likes Gary.' },
};
const SWARMS = { gull: 4, bee: 6 };
// Everything enemy-side (movement, shots, attack timers) runs at this pace so the game feels unhurried.
const PACE = 0.85;
// Boss breathing room: fly away from a boss and it lets you go (hovers where it lost you, holds its fire unless you shoot
// it) so you can patch up and turn around, until you're LEASH m away or its loose time is up. Then it comes back, but only to a
// standoff (its fight distance + STANDOFF m) where it waits: you get the first move. The loose time starts at LOOSE_T s
// and shrinks ×LOOSE_SHRINK (to LOOSE_MIN) for every breakaway in a row that didn't cost it any HP. Per boss: def.leash.
const LEASH = 650, LOOSE_T = 8, LOOSE_SHRINK = 0.75, LOOSE_MIN = 4, ENGAGED_T = 4;
// Speeds below are real m/s (enemy code runs at PACE, so it divides by that), times real s.
// Engaged, but you're flying off past half its orbit: an orbiting boss goes no faster than PURSUIT × your speed, and
// lets you go after BEHIND_T s of that once out past its orbit.
const PURSUIT = 0.7, BEHIND_T = 3;
// Loose: it hovers by the spot where it lost you at up to LOOSE_SPEED, braking from LOOSE_BRAKE over LOOSE_BRAKE_T s.
const LOOSE_SPEED = 8, LOOSE_BRAKE = 12, LOOSE_BRAKE_T = 1.5;
// Coming back ('catch'): it closes on you at most RETURN_GAIN m/s faster than you fly away, and stops at the standoff
// (± STANDOFF_HOLD). Waiting there ('wait') it keeps pace if you flee, and re-engages once you're within its fight
// distance + WAIT_NEAR, you hit it, or you've spent WAIT_T s not fleeing. Parked, it drifts at up to WAIT_DRIFT.
const RETURN_GAIN = 30, STANDOFF = 150, STANDOFF_HOLD = 30, WAIT_NEAR = 60, WAIT_T = 4, WAIT_DRIFT = 8;
// Re-engaging after a break it holds its first attack this long (enemy-time s), less if your hit woke it up.
const REENGAGE_CD = 2.5, REENGAGE_HIT_CD = 1.2;
// While loose, coming back or waiting a boss doesn't attack; it holds its next attack at least this long (s).
const CHASE_HOLD = 1.5;
// How far from you a boss waits after a breakaway (and the closest a persuasion "approach" may pull an engaged one).
export const bossStandoff = (def) => (def.lead || def.orbit) + STANDOFF;

let markerMat = null;
function makeMarker() {
  if (!markerMat) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#ff3a4a'; c.strokeStyle = '#ffffff'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(8, 10); c.lineTo(56, 10); c.lineTo(32, 54); c.closePath(); c.stroke(); c.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    markerMat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true, fog: false });
  }
  const m = new THREE.Sprite(markerMat);
  m.scale.set(0.022, 0.022, 1);
  m.renderOrder = 15;
  return m;
}

// Bosses: one shows up every few completed objectives. They orbit you (or dig in, for the fort),
// attack in patterns, and get ENRAGED (faster attacks) below half health.
// Lead bosses (lead: distance) instead fly ahead of you, facing back, weaving side to side (sway).
// face: how the model turns ('player', 'vel' = along its flight, 'spin', 'none').
// move: its signature movement (MOVES in bossmoves.js). orbit / lead stay its fight distance (breakaway, standoff).
export const BOSSES = {
  kingDrone: {
    make: makeDrone, scale: 5, crownY: 3.2, crownS: 1, radius: 18, hp: 80, speed: 30, orbit: 150, dmg: 20, face: 'player',
    name: 'King Drone the Unpleasant', short: 'King Drone', noun: 'King Drone',
    move: 'throne',
    desc: 'A giant drone with a crown and a superiority complex. Hides behind a ring of minion bodyguards. Sometimes he yells CHARGE.',
    taunts: ['King Drone: "Kneel before my rotors!"', 'King Drone: "My minions are unionized, but loyal!"', 'King Drone: "I have FOUR propellers. You have ONE. Do the math."'],
    rage: ['Its rotors are spinning with pure spite.', 'It is now buzzing aggressively.'],
  },
  gooseQueen: {
    make: makeGoose, scale: 5, crownY: 5.6, crownS: 1, radius: 16, hp: 80, speed: 42, orbit: 130, orbitRate: 0.45, dmg: 20, face: 'vel',
    name: 'Her Royal Honkness, the Goose Queen', short: 'The Goose Queen', noun: 'the Goose Queen',
    move: 'joust',
    desc: 'You caught her son. She remembers. She jousts head-on and drops golden eggs as she passes.',
    taunts: ['Goose Queen: "HONK. (You will pay for the goose incident.)"', 'Goose Queen: "My eggs are 24 karat. And pointy."', 'Goose Queen: "HOOOOONK."'],
    rage: ['She has entered her HONK ERA.', 'Feathers are flying. Mostly hers.'],
  },
  megaUfo: {
    make: makeUfo, scale: 4, crownY: 4.5, crownS: 1.2, radius: 30, hp: 95, speed: 26, orbit: 190, dmg: 20, face: 'spin', spin: 1.2,
    name: 'The Mothership (Mildly Rude)', short: 'The Mothership', noun: 'the Mothership',
    move: 'blink',
    desc: 'The UFOs called their mom. She teleports, fires orb shotguns, and has a tractor beam. Rude.',
    taunts: ['Mothership: "We come in peace. Just kidding."', 'Mothership: "Your planet\'s Wi-Fi is terrible."', 'Mothership: "Prepare to be mildly probed."'],
    rage: ['The Mothership has switched to "angry disco" mode.', 'All the little lights are blinking menacingly.'],
  },
  thunder: {
    make: makeStorm, scale: 2.5, crownY: 13, crownS: 2.2, radius: 38, hp: 110, speed: 22, orbit: 110, dmg: 20, face: 'player',
    name: 'Thunderclaus, Cloud of Bad Moods', short: 'Thunderclaus', noun: 'Thunderclaus',
    move: 'loom',
    desc: 'The grumpiest cloud ever. It hangs over you and calls down lightning where you\'re going. Don\'t fly under the dark spots.',
    taunts: ['Thunderclaus: "I am NOT a fluffy cloud."', 'Thunderclaus: "It\'s going to rain. On YOU. Specifically."', 'Thunderclaus: "Brrrrumble. That means \'go away\'."'],
    rage: ['Thunderclaus is now a category 5 grump.', 'The forecast says: extremely angry.'],
  },
  blimpBaron: {
    make: makeBlimp, scale: 3, crownY: 7, crownS: 1.3, radius: 30, hp: 100, speed: 26, orbit: 170, orbitRate: 0.2, dmg: 20, face: 'vel',
    name: 'Baron von Blimpenstein', short: 'The Blimp Baron', noun: 'the Blimp Baron',
    move: 'racetrack',
    desc: 'An airship full of hot air and worse deals. Makes bombing runs across your path: don\'t fly under it. Shoot the gondola!',
    taunts: ['Blimp Baron: "LIMITED TIME OFFER: explosions!"', 'Blimp Baron: "Have you considered upgrading to Ground Premium?"', 'Blimp Baron: "I am 90% helium and 10% marketing."'],
    rage: ['Everything must go! Including you!', 'The Baron is having a CLEARANCE SALE on bombs.'],
  },
  jellyEmpress: {
    make: makeJelly, scale: 4.5, crownY: 4.2, crownS: 1, radius: 22, hp: 90, speed: 18, orbit: 120, orbitRate: 0.22, dmg: 18, face: 'spin', spin: 0.3,
    name: 'Empress Wobblina of the Upper Jellies', short: 'Empress Wobblina', noun: 'Empress Wobblina',
    move: 'pulse',
    desc: 'A royal sky jellyfish. Swims in pulses, leaves stingers floating behind her, and fires rings of goo (fly through the middle!).',
    taunts: ['Wobblina: "Bow before my wobble."', 'Wobblina: "I have no brain and I am STILL winning."', 'Wobblina: "Bloop. (That was a threat.)"'],
    rage: ['She is wobbling at a dangerous frequency.', 'The Empress has gone full jiggle.'],
  },
  garyPrime: {
    make: makeRivalJet, scale: 4, crownY: 2, crownS: 0.8, radius: 18, hp: 85, speed: 46, orbit: 160, orbitRate: 0.4, dmg: 22, face: 'vel',
    name: 'Gary Prime (Gary\'s Dad)', short: 'Gary Prime', noun: 'Gary Prime',
    move: 'wingman',
    desc: 'You kept shooting Gary. His dad flies alongside you, copies your moves, and dodges if you hold the trigger. Short bursts! Shoot the propeller!',
    taunts: ['Gary Prime: "Nobody shoots down MY son. Except me, in parenting."', 'Gary Prime: "I flew before flying was invented."', 'Gary Prime: "Gary, get in the car. Oh wait, I AM the car."'],
    rage: ['Gary Prime has taken off his reading glasses.', 'He is now in "dad driving" mode.'],
  },
  hiveQueen: {
    make: makeBee, scale: 7, crownY: 1.3, crownZ: 1.6, crownS: 0.5, radius: 14, hp: 80, speed: 34, orbit: 120, orbitRate: 0.5, dmg: 18, face: 'vel',
    name: 'Queen Bee-atrice the Buzzkill', short: 'Queen Bee-atrice', noun: 'Queen Bee-atrice',
    move: 'darts',
    desc: 'The bees elected a queen. She darts around inside a ball of bodyguard bees. Pop the shell, then hit her.',
    taunts: ['Bee-atrice: "Bzzzz. (Translation: you\'re grounded.)"', 'Bee-atrice: "My kingdom for some pollen."', 'Bee-atrice: "To bee or not to bee? Bee. Always bee."'],
    rage: ['The Queen is buzzing in all caps.', 'Honey production halted. War production started.'],
  },
  pigeonDon: {
    make: makePigeon, scale: 5.5, crownY: 4.3, crownZ: 2.2, crownS: 0.7, radius: 16, hp: 85, speed: 32, orbit: 140, orbitRate: 0.35, dmg: 18, face: 'vel',
    name: 'Don Pigeone, the Godfeather', short: 'The Godfeather', noun: 'the Godfeather',
    move: 'perch',
    desc: 'The boss of all evil pigeons. Sits on a perch, sends "associates", and arranges special air mail. Keeps moving house.',
    taunts: ['Godfeather: "I\'m gonna make you an offer you can\'t re-coo-se."', 'Godfeather: "You come to me, on the day of my bread crumbs..."', 'Godfeather: "Leave the plane. Take the cannoli."'],
    rage: ['The Godfeather has taken this personally.', 'It\'s not business anymore. It\'s pigeon.'],
  },
  seagullSteven: {
    make: makeGull, scale: 7, crownY: 1.4, crownZ: 2.2, crownS: 0.6, radius: 16, hp: 80, speed: 40, orbit: 150, orbitRate: 0.42, dmg: 20, face: 'vel',
    name: 'Steven, Seagull Overlord', short: 'Steven', noun: 'Steven',
    move: 'dive',
    desc: 'He circles high, then dive-bombs. Dodge and he faceplants, wide open. If he hits you, he steals your boost. And your chips.',
    taunts: ['Steven: "MINE. MINE. MINE."', 'Steven: "Is that a chip? It\'s MY chip now."', 'Steven: "I have no manners and I must screech."'],
    rage: ['Steven has spotted a french fry. He is unstoppable.', 'Steven is screeching at a frequency only dogs can hear.'],
  },
  mineMother: {
    make: makeMine, scale: 5, crownY: 5.4, crownS: 1.1, radius: 24, hp: 90, speed: 16, orbit: 130, orbitRate: 0.2, dmg: 25, face: 'spin', spin: 0.4,
    name: 'The Mother of All Spiky Balloons', short: 'Mother Spiky', noun: 'Mother Spiky',
    move: 'anchor',
    desc: 'A huge spiky balloon guarded by a spinning ring of her children. Find the gap. Mind the spike nova.',
    taunts: ['Mother Spiky: "Hug? HUG?"', 'Mother Spiky: "I\'m not round, I\'m pointy-curvy."', 'Mother Spiky: "My children are everywhere. Watch your step. Er, flight."'],
    rage: ['She is inflating with fury.', 'Mother Spiky is now extra pointy.'],
  },
  fortGrump: {
    make: makeCannon, scale: 4.5, crownY: 6.2, crownS: 1.2, radius: 26, hp: 95, speed: 0, orbit: 0, dmg: 20, face: 'none', ground: true,
    name: 'Fort Grumpington', short: 'Fort Grumpington', noun: 'Fort Grumpington',
    move: 'duck',
    desc: 'A giant grumpy cannon dug into the ground. Pops up to fire mortars at marked spots, then ducks. Shoot it while it\'s up, aim for the barrel.',
    taunts: ['Fort Grumpington: "GET OFF MY LAWN. (The sky is my lawn.)"', 'Fort Grumpington: "In my day, planes were made of WOOD."', 'Fort Grumpington: "I have one setting: grump."'],
    rage: ['Fort Grumpington is extremely grumped.', 'The fort is shouting at clouds now. Literally.'],
  },
  octopus: {
    make: makeOctopus, scale: 3.5, crownY: 8.2, crownS: 1.1, radius: 24, hp: 95, speed: 30, lead: 170, sway: 60, dmg: 20, face: 'player',
    name: 'Admiral Inkworth, the Sky Octopus', short: 'Admiral Inkworth', noun: 'Admiral Inkworth',
    move: 'jets',
    desc: 'A giant octopus that flies ahead of you backwards, jetting away behind ink clouds, lobbing ink and orb spirals. Shoot the tentacles off!',
    taunts: ['Inkworth: "Eight arms. Zero hugs."', 'Inkworth: "I am leading this flight. Follow me. Into ink."', 'Inkworth: "Technically I am a sea creature. Technically you are lunch."'],
    rage: ['The Admiral is turning a furious shade of purple.', 'All remaining arms are flailing with intent.'],
  },
  crab: {
    make: makeCrab, scale: 3, crownY: 3.6, crownZ: -3, crownS: 1, radius: 22, hp: 90, speed: 34, lead: 160, sway: 80, dmg: 20, face: 'player',
    name: 'Captain Clawdia, Terror of the Clouds', short: 'Captain Clawdia', noun: 'Captain Clawdia',
    move: 'lanes',
    desc: 'A flying crab that snaps sideways between lanes in front of you. Bubble streams and pincer shots. Snap off the claws!',
    taunts: ['Clawdia: "Pinch, pinch. That\'s a warning."', 'Clawdia: "I walk sideways AND fly sideways. Beat that."', 'Clawdia: "You\'re not getting past me, sky shrimp."'],
    rage: ['Clawdia is snapping at the air itself.', 'Captain Clawdia has gone full crustacean.'],
  },
  puffer: {
    make: makePuffer, scale: 3.5, crownY: 6.5, crownS: 0.9, radius: 20, hp: 85, speed: 30, lead: 180, sway: 45, dmg: 22, face: 'player',
    name: 'Sir Puffington the Inflatable', short: 'Sir Puffington', noun: 'Sir Puffington',
    move: 'puff',
    desc: 'A royal pufferfish that leads the way. Spits water jets, puffs up (bullets bounce off) and floats at you, then pops a spike nova. Shoot him while he\'s small!',
    taunts: ['Puffington: "I am not fat. I am ARMORED."', 'Puffington: "Pfffff. (That was me being intimidating.)"', 'Puffington: "One more word and I puff."'],
    rage: ['Sir Puffington is puffing with rage. Also with air.', 'He is holding his breath out of pure spite.'],
  },
};

// Later bosses can roll a modifier. Names get a prefix; stats get a nudge.
export const BOSS_MODS = {
  jumbo: { prefix: 'Jumbo', text: 'It\'s 30% bigger. And 30% angrier.', size: 1.3, hp: 1.3 },
  turbo: { prefix: 'Turbo', text: 'It drank three espressos. Faster everything.', speed: 1.35, cd: 0.8 },
  fragile: { prefix: 'Furious But Fragile', text: 'Less health, way more attitude.', hp: 0.7, cd: 0.7 },
  shiny: { prefix: 'Shiny', text: 'Extra shiny. Worth double points.', score: 2 },
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _pp = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// What happens when a breakable part is shot off. Regular enemies and bosses share these.
const BREAK_TEXT = {
  rotor: 'Rotor down! It can\'t stay up much longer.',
  turret: 'Turret destroyed! Fewer orbs incoming.',
  gondola: 'Gondola gone! No more "special offers" from that blimp.',
  fin: 'Fin snapped off. Very aerodynamic of you.',
  tentacle: 'Tentacle severed. Rude, but effective.',
  barrel: 'Barrel destroyed! That cannon is just a sad bucket now.',
  prop: 'Propeller shot off! Gary is going down. Bye, Gary.',
  puff: 'You popped a piece of cloud. The cloud is shrinking.',
  wing: 'Wing clipped! She\'s flying slower now.',
  crown: 'CROWN KNOCKED OFF! It takes 30% more damage now. Also, embarrassment.',
  claw: 'Claw snapped off! One less pincer to worry about.',
};
// Bosses shrug off what would floor a regular enemy, so some parts read differently on them.
const BOSS_BREAK_TEXT = {
  rotor: 'Rotor down! The King wobbles. Fewer minions incoming.',
  prop: 'Propeller shot off! Gary Prime is sputtering: slower, with shorter bursts.',
  gondola: 'Gondola gone! The Baron\'s bombing runs are mostly bluster now.',
  barrel: 'Barrel smashed! The fort can only manage sad little mortars now.',
  wing: 'Wing clipped! She\'s flying slower now.',
  tentacle: 'Tentacle severed! Fewer arms, fewer orbs in the spiral.',
};
// Breakaway news ({short} = the boss): when it loses you, and when it comes back.
const SHOOK_OFF = ['{short} lost you! Hull mending fast.', 'Clean getaway! {short} is sulking.', '{short} lost sight of you. Hull mending!'];
const COMING_BACK = ['{short} is back for round two!', 'Break\'s over! {short} is coming back.', '{short} wants a rematch!'];
const WAITING = ['{short} is waiting for you. Your move.', '{short} is hovering menacingly. From a polite distance.', '{short} saved you a seat. Round two starts when you say so.'];
const TOAST_GAP = 10; // s between breakaway toasts, so twins don't double up

export class Enemies {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.shots = [];
    this.spawnTimer = 6;
    this.calmTimer = 0;
    this.frenzy = false;
    this.hats = false;
    this.orbGeo = new THREE.SphereGeometry(1.6, 8, 6);
    this.orbMat = new THREE.MeshBasicMaterial({ color: '#7aff5a' });
    this.introduced = new Set();
    this.orbMats = new Map();
    this.breather = false; // every boss alive has lost you or is coming back (not waiting): see player.js regen
    this.shookAt = -99;
    this.backAt = -99;
    this.waitAt = -99;
    this.hazards = new Hazards(G); // bosses' telegraphed area attacks (see warn)
  }

  spawnBoss(kind, pos, level = 0, opts = {}) {
    const def = BOSSES[kind], mod = BOSS_MODS[opts.mod] || null;
    const mesh = new THREE.Group();
    const body = def.make(false);
    const crown = makeCrown(def.crownS);
    crown.position.set(0, def.crownY, def.crownZ || 0);
    body.add(crown);
    (body.userData.parts ||= []).push({ obj: crown, r: 2.4 * def.crownS, mult: 2, hp: 10, name: 'crown' });
    for (const part of body.userData.parts) if (Number.isFinite(part.hp) && part.name !== 'crown') part.hp *= 6;
    mesh.add(body);
    const size = (opts.size || 1) * (mod?.size || 1);
    mesh.scale.setScalar(def.scale * size);
    mesh.userData = body.userData;
    mesh.position.copy(pos);
    this.G.scene.add(mesh);
    const hp = Math.round((def.hp + level * 20) * (opts.hp || 1) * (mod?.hp || 1));
    const short = mod ? `${mod.prefix} ${def.short}` : def.short;
    const e = {
      type: 'boss', kind, def, mesh, pos: mesh.position, vel: new THREE.Vector3(), hp, maxHp: hp, radius: def.radius * size,
      t: Math.random() * 10, cd: 3, state: 'idle', stateT: 0, quest: true, boss: true, anchor: pos.clone(), dead: false, attacks: 0, tauntT: 6,
      mod, short, name: mod ? `${mod.prefix} ${def.name}` : def.name, speedMul: mod?.speed || 1, cdMul: mod?.cd || 1,
      orbitPhase: opts.phase || 0, burst: 0, burstT: 0, dash: 0, dashDir: new THREE.Vector3(), heading: new THREE.Vector3(), chase: null, looseT: 0, engagedT: 0,
      looseMax: LOOSE_T, breaks: 0, lastHp: hp, chaseT: 0, waitT: 0, home: new THREE.Vector3(), fresh: false,
    };
    this.list.push(e);
    return e;
  }

  // Summon helpers, capped so the sky never turns into soup.
  count(type) { return this.list.filter((x) => x.type === type).length; }
  summon(type, n, cap, at) {
    let made = 0;
    for (let k = 0; k < n && this.count(type) < cap; k++, made++) this.spawn(type, at.clone().add(new THREE.Vector3(rand(-25, 25), rand(-10, 10), rand(-25, 25))));
    return made;
  }

  fireOrb(from, dir, speed, dmg, color = '#7aff5a', size = 1) {
    if (!this.orbMats.has(color)) this.orbMats.set(color, new THREE.MeshBasicMaterial({ color }));
    const m = new THREE.Mesh(this.orbGeo, this.orbMats.get(color));
    m.scale.setScalar(size);
    m.position.copy(from);
    this.G.scene.add(m);
    const shot = { mesh: m, pos: m.position, vel: dir.clone().normalize().multiplyScalar(speed), life: 7, dmg, r2: (4 + size * 1.6) ** 2 };
    this.shots.push(shot);
    return shot;
  }

  // A boss's area attack, telegraphed: a translucent disc / ring / column at pos (radius r) for t s, then onFire(hazard).
  // Every one gets at least 1 s. Cleared (unfired) by clearAll, by its owner's breakaway and by its owner's death.
  warn(pos, r, color, t, onFire, opts) { return this.hazards.warn(pos, r, color, Math.max(1, t), onFire, opts); }

  // Own cruise speed (enemy units) with rage, mods and damage.
  cruise(e) { return e.def.speed * e.speedMul * (e.enraged ? 1.25 : 1) * 0.7 ** (e.broken?.wing || 0) * (e.slow || 1); }

  // Engaged (e.chase null) -> 'loose' when you fly away past its fight distance -> 'catch' when its loose time is up (or
  // you're past the leash) -> 'wait' at the standoff -> engaged when you come in, hit it, or hang about. Flying bosses only.
  breakState(e, toP, dist, dt) {
    const d = e.def, p = this.G.player, fight = d.lead || d.orbit, leash = d.leash || LEASH;
    const fleeing = toP.dot(p.forward) > dist * 0.3; // the boss is behind you, more or less
    e.behind = fleeing;
    // A lead boss belongs in front of you, so getting past it at all counts as flying off.
    const off = d.lead ? d.lead * 0.5 : fight + 40;
    e.engagedT += dt;
    e.chaseT += dt / PACE;
    e.behindT = fleeing && !e.chase ? (e.behindT || 0) + dt / PACE : 0; // real s you've been flying off from it, engaged
    const hurt = e.hp < e.lastHp;
    if (hurt) e.breaks = 0; // you hurt it: the next breakaway gets the full loose time again
    e.lastHp = e.hp;
    e.hurt = hurt; // hit this frame (the Godfeather counts hits on his perch)
    if (e.chase === 'loose') {
      if (fleeing) e.looseT += dt; // only the time you spend flying away counts, not coming back for a pass
      if (hurt) this.reengage(e, true); // shot while it sulks: it fights back (no free sniping)
      else if (dist < fight + WAIT_NEAR && !fleeing) this.reengage(e, false); // you came back for it
      else if (dist > leash || e.looseT > e.looseMax) { this.setChase(e, 'catch'); this.breakNews(e, COMING_BACK, 'backAt', 'warn', 2.5, 440, 260); }
    } else if (e.chase === 'catch') {
      if (hurt) this.reengage(e, true);
      else if (dist < bossStandoff(d) + STANDOFF_HOLD) {
        this.setChase(e, 'wait');
        e.waitT = 0;
        this.breakNews(e, WAITING, 'waitAt', 'warn', 3, 330, 0, 0.3);
      }
    } else if (e.chase === 'wait') {
      if (!fleeing) e.waitT += dt / PACE; // fleeing doesn't end the wait (nor count as a new breakaway)
      if (hurt || dist < fight + WAIT_NEAR || e.waitT > WAIT_T) this.reengage(e, hurt);
      else if (dist > leash) this.setChase(e, 'catch'); // you outran it (boosting): it comes back quietly
    }
    // Engaged it just flies in, however far (a fresh boss may spawn past the leash): returning and waiting only follow a
    // breakaway. Freshly back in range it stays on you a moment (a lead boss needs that to swing round in front again).
    // An orbiter you've been flying off from for BEHIND_T s lets go a little sooner, once out past its orbit.
    else if (fleeing && e.engagedT > ENGAGED_T && (dist > off || (!d.lead && e.behindT > BEHIND_T && dist > d.orbit))) {
      this.setChase(e, 'loose');
      e.looseT = 0;
      e.looseMax = Math.max(LOOSE_MIN, LOOSE_T * LOOSE_SHRINK ** e.breaks++);
      e.home.copy(e.pos);
      e.vel.clampLength(0, LOOSE_BRAKE / PACE); // it gives up the chase at once
      e.burst = e.dash = 0; // a half-fired burst or a charge in progress is called off too
      endMoves(this, e); // so is its signature move (e.mv = null), with its hazards, stingers and bodyguards
      if (e.puffT > 0) { e.puffT = 0; e.shield = 1; } // a puffed-up boss deflates quietly
      this.calm(3); // its minions give up too
      this.breakNews(e, SHOOK_OFF, 'shookAt', 'good', 3, 520, -200);
    }
  }

  setChase(e, chase) { e.chase = chase; e.chaseT = 0; }

  // Back in the fight after a break: no lunge (cruise speed at most), a beat before its first attack, and that attack
  // isn't a charge (see `fresh` in the attack switch).
  reengage(e, byHit) {
    this.setChase(e, null);
    e.engagedT = 0;
    e.fresh = true;
    e.vel.clampLength(0, this.cruise(e));
    e.cd = byHit ? REENGAGE_HIT_CD : Math.max(e.cd, REENGAGE_CD);
  }

  // Movement while loose (hover by the spot where it lost you), coming back or waiting (along the line to you, toward
  // the standoff, never backing off as you come in). Target speeds in real m/s, then into enemy units.
  breakMove(e, toP, dist, dt) {
    const p = this.G.player;
    let cap;
    if (e.chase === 'loose') {
      cap = LOOSE_SPEED + (LOOSE_BRAKE - LOOSE_SPEED) * Math.max(0, 1 - e.chaseT / LOOSE_BRAKE_T);
      _w.copy(e.home).sub(e.pos).multiplyScalar(0.6);
      _w.y += Math.sin(e.t * 0.9) * 2;
    } else {
      const r = Math.max(dist, 1), away = (p.speed * toP.dot(p.forward)) / r; // how fast you fly away from it
      cap = e.chase === 'catch' ? Math.max(0, away) + RETURN_GAIN : Math.max(WAIT_DRIFT, p.speed);
      const closing = THREE.MathUtils.clamp(away + (dist - bossStandoff(e.def)) * 0.5, 0, cap);
      _w.copy(toP).multiplyScalar(closing / r);
      _w.y += Math.sin(e.t * 1.1) * 3; // a gentle bob
    }
    e.vel.lerp(_w.divideScalar(PACE).clampLength(0, cap / PACE), 1 - Math.exp(-dt * 2.5));
    e.vel.clampLength(0, cap / PACE);
  }

  // A breakaway toast + tone, at most one per TOAST_GAP s (so twins share it). `at` names the timestamp field.
  breakNews(e, lines, at, kind, dur, freq, slide, len = 0.35) {
    const G = this.G;
    if (G.time - this[at] < TOAST_GAP) return false;
    this[at] = G.time;
    G.ui.notify(pick(lines).replace('{short}', () => e.short), kind, dur); // a function: no `$` patterns in the name
    G.audio.tone(freq, len, { type: 'sine', vol: 0.05, slide });
    return true;
  }

  bossBehave(e, toP, dist, dt) {
    const G = this.G, p = G.player, d = e.def;
    if (!e.enraged && e.hp < e.maxHp / 2) {
      e.enraged = true;
      G.ui.notify(`${e.short} is ENRAGED! ${pick(d.rage)}`, 'bad', 4);
      G.audio.zap();
    }
    // Movement: its signature move (bossmoves.js) while engaged, else circle the player (dashing bosses sometimes charge
    // straight through), or sit tight if dug in. A break (loose, coming back, waiting) overrides every move.
    if (!d.ground) this.breakState(e, toP, dist, dt);
    const move = BOSS_MOVES[d.move], fight = d.lead || d.orbit;
    const c = move && { p, toP, dist, dt, pace: PACE, fight };
    if (e.dazed > 0) e.dazed -= dt;
    if (d.ground) { e.vel.set(0, 0, 0); move?.step(this, e, c); }
    else if (e.chase) this.breakMove(e, toP, dist, dt);
    else if (e.dash > 0) {
      e.dash -= dt;
      if (e.behind && dist > d.orbit * 0.5) e.dash = 0; // you turned away mid-charge: it doesn't run you down from behind
      e.vel.lerp(_w.copy(e.dashDir).multiplyScalar(d.speed * 2.4 * e.speedMul), 1 - Math.exp(-dt * 4));
    } else if (move && !d.lead && move.step(this, e, c)) {
      // You're flying off and it's out past half its fight distance: whatever the move, it can't keep up (and sheds a
      // charge's speed quickly), so the gap opens and you can break away. No teleport or hop starts then either.
      const cap = (PURSUIT * Math.max(p.speed, p.baseSpeed)) / PACE, v = e.vel.length();
      if (e.behind && dist > fight * 0.5 && v > cap) e.vel.multiplyScalar((cap + (v - cap) * Math.exp(-dt * 3)) / v);
    } else if (d.lead) {
      // A lead move (jets, lanes, puff) only retunes the slot: distance, side offset, how hard it snaps there.
      const mv = move?.step(this, e, c) === false ? e.mv : null;
      // Hold a slot ahead of the player (along a smoothed heading, so sharp turns don't whip it around).
      _w.set(p.forward.x, 0, p.forward.z);
      if (_w.lengthSq() < 0.01) _w.set(0, 0, -1);
      if (e.heading.lengthSq() < 0.5) e.heading.copy(_w.normalize());
      else e.heading.lerp(_w.normalize(), 1 - Math.exp(-dt * 1.5)).normalize();
      const sway = mv?.side ?? Math.sin(e.t * 0.6 + e.orbitPhase) * d.sway;
      _w.copy(p.pos).addScaledVector(e.heading, mv?.lead ?? d.lead).add(_pp.set(-e.heading.z, 0, e.heading.x).multiplyScalar(sway));
      _w.y += 10 + Math.sin(e.t * 0.8) * 10;
      _w.sub(e.pos).multiplyScalar(mv?.gain ?? 1.6);
      // Swinging back in front after a U-turn: go around the player, not through them (no closing in, nudged off).
      if (dist < e.radius + (e.behind ? 110 : mv?.near ?? 110)) {
        const r = Math.max(dist, 1), closing = _w.dot(toP) / r;
        if (closing > 0) _w.addScaledVector(toP, -closing / r);
        _w.addScaledVector(toP, -60 / r).y += 30;
      }
      const speed = (p.speed * 1.8 + d.speed * e.speedMul * (e.enraged ? 1.25 : 1) * (e.slow || 1)) * (mv?.speedK ?? 1);
      e.vel.lerp(_w.clampLength(0, speed), 1 - Math.exp(-dt * 3));
    } else {
      const ang = e.t * (d.orbitRate || 0.28) + e.orbitPhase;
      _w.set(Math.cos(ang) * d.orbit, 25 + Math.sin(e.t * 0.7) * 15, Math.sin(ang) * d.orbit).add(p.pos).sub(e.pos);
      let speed = this.cruise(e), turn = 1.2;
      // You're flying off and it's out past half its orbit: it can't keep up (and sheds a charge's speed quickly), so the
      // gap opens and you can break away.
      if (e.behind && dist > d.orbit * 0.5) { speed = Math.min(speed, (PURSUIT * Math.max(p.speed, p.baseSpeed)) / PACE); turn = 3; }
      e.vel.lerp(_w.clampLength(0, speed), 1 - Math.exp(-dt * turn));
    }
    // Rapid-fire bursts are fired over several frames.
    if (e.burst > 0 && (e.burstT -= dt) <= 0 && !p.dead) {
      e.burst--;
      e.burstT = 0.12;
      const [speed, dmg, color, size] = e.burstShot || [105, 7, '#ff3ad0', 0.8];
      this.fireOrb(e.pos, _w.copy(p.pos).addScaledVector(p.forward, p.speed * 0.4).sub(e.pos), speed, dmg, color, size);
    }
    // Sir Puffington stays puffed up (and bulletproof-ish) for a while, then pops a spike nova.
    if (e.puffT > 0 && (e.puffT -= dt) <= 0) {
      e.shield = 1;
      for (let k = 0; k < 24; k++) {
        const y = 1 - (2 * (k + 0.5)) / 24, r = Math.sqrt(1 - y * y), a = k * 2.39996;
        this.fireOrb(e.pos, _w.set(Math.cos(a) * r, y, Math.sin(a) * r), 42, 12, '#e8c86a', 1);
      }
      G.audio.pop();
      G.ui.notify('POP! Sir Puffington deflated. Shoot him now!', 'good', 2.5, 0);
      daze(e, 2); // out of breath: a window to hit him hard
    }

    if (!e.chase) e.tauntT -= dt; // no taunts while it has lost you, is coming back or waiting
    if (e.tauntT <= 0) { e.tauntT = rand(12, 18); G.ui.notify(pick(d.taunts), 'warn', 3.5, 0); if (e.kind === 'gooseQueen') G.audio.honk(); }

    e.cd -= dt * (e.enraged ? 1.6 : 1);
    // No attacks (shots, summons, dashes) while it's on a break, nor from a lead boss still swinging back round in front.
    if (e.chase || (d.lead && e.behind)) e.cd = Math.max(e.cd, CHASE_HOLD);
    if (move?.hold?.(e)) e.cd = Math.max(e.cd, 0.3); // mid-move (a blink, a dive, a joust, ducked...): attacks wait
    if (e.cd > 0 || dist > 650 || p.dead) return;
    e.attacks++;
    const aim = (spread) => _w.copy(toP).normalize().add(new THREE.Vector3(rand(-spread, spread), rand(-spread, spread), rand(-spread, spread)));
    const lead = (k = 0.6, speed = 55) => p.pos.clone().addScaledVector(p.forward, p.speed * (dist / speed) * k).sub(e.pos);
    const ahead = (m) => p.pos.clone().addScaledVector(p.forward, m);
    const n = e.attacks;
    // Charges (strafing runs, dives): not the opener of a rematch, nor from behind a plane flying off (that would run
    // it down and glue the fight back together just as you break away).
    const charge = !e.fresh && !e.behind;
    let cd = 3;
    switch (e.kind) {
      case 'kingDrone':
        for (let k = -1; k <= 1; k++) this.fireOrb(e.pos, aim(0).applyAxisAngle(new THREE.Vector3(0, 1, 0), k * 0.15), 60, 14, '#ff5a3a', 1.3);
        // Minions orbit him as a royal guard (none once 2 rotors are down) until he yells CHARGE (every 3rd attack).
        if (n % 3 === 0 && BOSS_MOVES.throne.charge(this, e)) break;
        if (n % 2 === 0 && (e.broken?.rotor || 0) < 2 && BOSS_MOVES.throne.guard(this, e, 2)) G.ui.notify('King Drone summoned his royal guard. They look nervous.', 'warn', 2.5, 0);
        break;
      case 'gooseQueen':
        cd = 2.4;
        for (let k = 0; k < 2; k++) this.fireOrb(e.pos, lead().add(new THREE.Vector3(rand(-15, 15), rand(-10, 10), rand(-15, 15))), 55, 16, '#ffd23a', 1.6);
        G.audio.honk();
        break;
      case 'megaUfo':
        cd = 3.4;
        if (n % 3 === 0 && charge && BOSS_MOVES.blink.start(this, e)) break; // every 3rd: teleport instead
        for (let k = 0; k < Math.max(2, 7 - (e.broken?.turret || 0)); k++) this.fireOrb(e.pos, aim(0.22), 52, 12, '#7aff5a', 1.1);
        G.audio.tone(200, 0.4, { type: 'sine', vol: 0.08, slide: 500 });
        break;
      case 'thunder':
        if (dist < 100) {
          cd = 2;
          G.fx.lightning(e.pos, p.pos);
          G.audio.zap();
          p.damage(16);
        } else {
          cd = 3;
          BOSS_MOVES.loom.strike(this, e); // lightning columns along your path, each on a dark disc first
        }
        break;
      case 'blimpBaron':
        cd = 3.2;
        // Arms the current bombing run (a horn): its bombs drop as it crosses your path. Mines come every 3rd run.
        BOSS_MOVES.racetrack.arm(this, e);
        break;
      case 'jellyEmpress': {
        cd = 2.8;
        if (dist < 130 && !e.noZap) { G.fx.lightning(e.pos, p.pos); G.audio.zap(); p.damage(14); break; }
        // A ring of goo with a safe hole in the middle.
        const dir = _w.copy(toP).normalize(), side = new THREE.Vector3().crossVectors(dir, Y).normalize(), up = new THREE.Vector3().crossVectors(side, dir);
        const count = Math.max(5, 12 - (e.broken?.tentacle || 0));
        for (let k = 0; k < count; k++) {
          const a = (k / count) * Math.PI * 2;
          this.fireOrb(e.pos, dir.clone().addScaledVector(side, Math.cos(a) * 0.3).addScaledVector(up, Math.sin(a) * 0.3), 45, 12, '#ff8ad8', 1.2);
        }
        G.audio.tone(320, 0.35, { type: 'sine', vol: 0.07, slide: -150 });
        break;
      }
      case 'garyPrime':
        cd = 2.4;
        if (n % 3 === 0 && charge) {
          BOSS_MOVES.wingman.cut(this, e); // across your nose, guns blazing
          G.ui.notify('Gary Prime is cutting across your nose! Get out of the way!', 'warn', 2.5, 1);
        } else e.burst = e.slow ? 3 : 5;
        break;
      case 'hiveQueen':
        cd = 2.6;
        for (let k = -2; k <= 2; k++) this.fireOrb(e.pos, aim(0.02).applyAxisAngle(Y, k * 0.12), 75, 8, '#ffcc1a', 0.7);
        break; // her bees are a shell around her now (see the darts move)
      case 'pigeonDon':
        if (n % 2 === 0) { if (this.summon('pigeon', 2, 4, e.pos)) G.ui.notify('The Godfeather sent some "associates".', 'warn', 2.5, 0); }
        else {
          // Air mail: a ring marks each drop zone where you're heading for 1 s, then it's dropped from high above.
          for (let k = 0; k < 4; k++) {
            const at = ahead(80 + k * 25).add(new THREE.Vector3(rand(-20, 20), 0, rand(-20, 20)));
            this.warn(at, 14, '#f4f4f4', 1, () => this.fireOrb(at.clone().setY(at.y + 60), new THREE.Vector3(rand(-0.05, 0.05), -1, rand(-0.05, 0.05)), 55, 12, '#f4f4f4', 1.3), { shape: 'ring', owner: e });
          }
          G.audio.tone(1500, 0.6, { type: 'sine', vol: 0.03, slide: -900 });
          G.ui.notify('Incoming air mail! Mind the rings!', 'warn', 2, 0);
        }
        break;
      case 'seagullSteven':
        cd = 2.6;
        if (n % 3 === 1 && charge && BOSS_MOVES.dive.start(this, e)) {
          // A shadow ring marks the spot, then he dives (see the dive move).
        } else if (n % 3 === 2 && this.summon('gull', 4, 8, e.pos)) G.ui.notify('Steven brought the gang.', 'warn', 2.5, 0);
        else for (let k = 0; k < 3; k++) this.fireOrb(e.pos, aim(0.12), 60, 10, '#9ab0c8', 1);
        break;
      case 'mineMother':
        cd = 3.8;
        BOSS_MOVES.anchor.inflate(this, e); // she swells for 1 s, then the spike nova goes off in every direction
        break;
      case 'octopus': {
        cd = 2.6;
        const arms = e.mesh.userData.parts.filter((x) => x.name === 'tentacle' && !x.broken);
        if (n % 3 === 0 && arms.length) {
          // Orb spiral: one orb from the tip of every arm still attached, fanned around the line to you.
          const dir = _w.copy(toP).normalize(), side = new THREE.Vector3().crossVectors(dir, Y).normalize(), up = new THREE.Vector3().crossVectors(side, dir);
          for (let k = 0; k < arms.length * 2; k++) {
            const a = (k / (arms.length * 2)) * Math.PI * 2 + e.t, from = arms[k % arms.length].obj.getWorldPosition(new THREE.Vector3());
            this.fireOrb(from, dir.clone().addScaledVector(side, Math.cos(a) * 0.35).addScaledVector(up, Math.sin(a) * 0.35), 42, 11, '#c86aff', 1.1);
          }
          G.audio.tone(260, 0.4, { type: 'sine', vol: 0.07, slide: 300 });
        } else {
          // Ink blobs: big, slow, aimed where you're going.
          for (let k = 0; k < 3; k++) this.fireOrb(e.pos, lead(0.6, 45).add(new THREE.Vector3(rand(-12, 12), rand(-8, 8), rand(-12, 12))), 45, 15, '#3a1a5a', 2);
          G.audio.tone(140, 0.25, { type: 'sine', vol: 0.08, slide: -60 });
        }
        break;
      }
      case 'crab': {
        cd = 2.4;
        if (n % 2 === 0 && BOSS_MOVES.lanes.pincers(this, e, true)) {
          // Pincer shots (enraged: she closes to 90 m and fires a double).
        } else {
          e.burst = e.enraged ? 10 : 7;
          e.burstShot = [75, 6, '#bfefff', 1];
        }
        break;
      }
      case 'puffer':
        if (e.puffT > 0) { cd = 1; break; }
        if (n % 3 === 0) {
          cd = 4;
          e.puffT = 3;
          e.shield = 0.2;
          G.ui.notify('Sir Puffington is puffing up! Bullets bounce off. Wait for the pop!', 'warn', 2.5, 1);
          G.audio.tone(180, 0.6, { type: 'sine', vol: 0.08, slide: 200 });
        } else {
          cd = 2.2;
          for (let k = 0; k < 4; k++) this.fireOrb(e.pos, aim(0.1), 65, 10, '#5ad8ff', 0.9);
          G.audio.tone(600, 0.15, { type: 'triangle', vol: 0.05, slide: -300 });
        }
        break;
      case 'fortGrump': {
        cd = 2.4;
        const muzzle = e.pos.clone().add(new THREE.Vector3(0, 6 * e.mesh.scale.x, 0));
        if (n % 3 === 0 && !e.disarmed) {
          for (let k = 0; k < 8; k++) this.fireOrb(muzzle, lead(0.5, 70).add(new THREE.Vector3(rand(-40, 40), rand(-25, 25), rand(-40, 40))), 70, 9, '#ffb03a', 1);
        } else {
          // Mortars: they land on marked rings along your path (one sad mortar without a barrel).
          BOSS_MOVES.duck.mortars(this, e, e.disarmed ? 1 : 3);
          G.fx.emit(muzzle, 12, { colors: ['#888888', '#ffb03a'], speed: 20, life: 0.6, size: 6, up: 20 });
        }
        G.audio.tone(110, 0.3, { type: 'square', vol: 0.07, slide: -50 });
        break;
      }
    }
    e.fresh = false;
    e.cd = cd * e.cdMul;
  }

  // Flat enough for a ground cannon: its barrel must stay clear of the hillside to be shootable.
  isGentleGround(x, z) {
    const h = (dx, dz) => this.G.terrain.surfaceHeight(x + dx, z + dz);
    return Math.abs(h(8, 0) - h(-8, 0)) < 5 && Math.abs(h(0, 8) - h(0, -8)) < 5;
  }

  calm(seconds) { this.calmTimer = Math.max(this.calmTimer, seconds); }

  // Relax mode: everything hostile leaves the sky at once, orbs included.
  clearAll() {
    for (let i = this.list.length - 1; i >= 0; i--) { this.G.fx.emit(this.list[i].pos, 10, { colors: ['#ffffff', '#ffd0f4'], speed: 20, life: 0.8, size: 6 }); this.remove(i); }
    for (const s of this.shots) this.G.scene.remove(s.mesh);
    this.shots.length = 0;
    this.hazards.clear(); // boss warnings vanish unfired
  }

  spawn(type, pos, opts = {}) {
    const def = TYPES[type];
    const mesh = def.make(this.hats);
    mesh.position.copy(pos);
    // In a cave, nothing starts inside the roof (the per-frame clamp in update() only kicks in after the first move).
    if (!def.ground) mesh.position.y = Math.min(mesh.position.y, this.G.terrain.ceilingHeight(pos.x, pos.z) - 10);
    this.G.scene.add(mesh);
    const e = {
      type, def, mesh, pos: mesh.position, vel: new THREE.Vector3(), hp: def.hp, radius: def.radius * (opts.scale || 1),
      t: Math.random() * 10, cd: rand(1, 3), state: 'idle', stateT: 0, quest: !!opts.quest, anchor: opts.anchor ? opts.anchor.clone() : pos.clone(), dead: false,
    };
    if (opts.scale) mesh.scale.setScalar(opts.scale);
    e.marker = makeMarker();
    this.G.scene.add(e.marker);
    this.list.push(e);
    if (!e.quest && !this.introduced.has(type)) {
      this.introduced.add(type);
      this.G.ui.notify(def.intro || `New enemy spotted: ${def.name}. It seems upset about something.`, 'warn', 4, 1);
    }
    return e;
  }

  maybeSpawn(dt) {
    const G = this.G, p = G.player;
    if (this.calmTimer > 0 || p.dead || G.relax) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    // A "Hold The Line" objective turns on frenzy: enemies arrive twice as often, and more of them.
    this.spawnTimer = this.frenzy ? rand(1.5, 3) : rand(3, 6);
    const max = 3 + Math.min(7, Math.floor(G.score / 400)) + (this.frenzy ? 4 : 0);
    if (this.list.filter((e) => !e.quest).length >= max) return;
    const avail = Object.entries(TYPES).filter(([, d]) => G.score >= d.minScore && d.weight > 0 && G.zones.allowsEnemy(d));
    let total = avail.reduce((s, [, d]) => s + d.weight, 0), r = Math.random() * total, type = avail[0][0];
    for (const [k, d] of avail) { r -= d.weight; if (r <= 0) { type = k; break; } }

    _v.set(p.forward.x, 0, p.forward.z);
    if (_v.lengthSq() < 0.01) _v.set(0, 0, -1);
    _v.normalize();
    _w.set(-_v.z, 0, _v.x);
    // Straight ahead, inside the camera's view, so you see them coming.
    const d = rand(300, 500), side = rand(-130, 130);
    const pos = p.pos.clone().addScaledVector(_v, d).addScaledVector(_w, side);
    const g = Math.max(G.terrain.surfaceHeight(pos.x, pos.z), waterLine());
    if (TYPES[type].ground) {
      if (G.terrain.surfaceHeight(pos.x, pos.z) < waterLine()) return; // cannons can't swim (on a seabed they don't have to)
      if (!this.isGentleGround(pos.x, pos.z)) return; // on a steep slope the barrel would sink into the hill
      pos.y = g;
    } else pos.y = Math.min(Math.max(p.pos.y + rand(-15, 35), g + 45), G.terrain.ceilingHeight(pos.x, pos.z) - 25);
    if (SWARMS[type]) {
      for (let k = 0; k < SWARMS[type]; k++) this.spawn(type, pos.clone().add(new THREE.Vector3(rand(-25, 25), rand(-8, 8), rand(-25, 25))));
    } else this.spawn(type, pos);
  }

  update(dt) {
    const G = this.G, p = G.player;
    dt *= PACE * G.powerups.enemyTimeScale(); // Slow-Mo / Time Freeze power-ups
    this.calmTimer = Math.max(0, this.calmTimer - dt);
    this.maybeSpawn(dt);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      e.stateT += dt;
      const toP = _v.subVectors(p.pos, e.pos);
      const dist = toP.length();
      const calm = this.calmTimer > 0 && !e.quest;
      if (!e.quest && dist > 1700) { this.remove(i); continue; }
      if (calm) {
        e.vel.lerp(_w.copy(toP).multiplyScalar(-1).setY(0).normalize().multiplyScalar(60).setY(30), 1 - Math.exp(-dt));
        if (dist > 500) { this.remove(i); continue; }
      } else if (e.state === 'falling') {
        e.vel.y -= 35 * dt;
        e.vel.x *= Math.exp(-dt * 0.5); e.vel.z *= Math.exp(-dt * 0.5);
        e.mesh.rotation.z += dt * 4;
        if (Math.random() < 0.5) G.fx.emit(e.pos, 1, { color: '#555555', speed: 4, life: 1.2, size: 6 });
      } else if (e.guard) {
        if (guardStep(this, e)) { this.remove(i); continue; } // a boss's bodyguard holds its slot (or pops with its boss)
      } else if (e.boss) this.bossBehave(e, toP, dist, dt);
      else this.behave(e, toP, dist, dt);

      e.pos.addScaledVector(e.vel, dt);
      if (e.def.ground) e.pos.y = G.terrain.surfaceHeight(e.pos.x, e.pos.z) - 0.5;
      else {
        const g = Math.max(G.terrain.surfaceHeight(e.pos.x, e.pos.z, e.pos.y), waterLine()) + (e.boss ? e.radius : 12); // tunnels: enemies can follow you in
        if (e.state === 'falling' && e.pos.y <= g) { G.fx.explosion(e.pos); this.kill(i, true); continue; }
        if (e.pos.y < g) { e.pos.y = g; if (e.vel.y < 0) e.vel.y = 0; }
        const roof = G.terrain.ceilingHeight(e.pos.x, e.pos.z, e.pos.y) - (e.boss ? e.radius : 10);
        if (e.pos.y > roof) { e.pos.y = Math.max(roof, g); if (e.vel.y > 0) e.vel.y = 0; }
      }
      this.animate(e, dt);
      if (e.marker) {
        e.marker.position.set(e.pos.x, e.pos.y + e.radius * (e.mesh.scale.x || 1) + 6, e.pos.z);
        e.marker.visible = dist > 70 && !calm;
      }

      // Player contact.
      e.contactCd = Math.max(0, (e.contactCd || 0) - dt);
      if (!p.dead && !calm && dist < e.radius + 4 * p.sizeScale && e.contactCd <= 0) {
        // Mega Plane flattens anything smaller than a boss.
        if (G.powerups.has('mega') && !e.boss) { G.fx.explosion(e.pos); this.kill(i, true); continue; }
        e.contactCd = 1.5; // big enemies bump you once, not every frame
        p.damage(e.def.dmg);
        if (e.dash > 0 || e.mv?.charge) {
          e.dash = 0;
          if (e.mv) e.mv.charge = false;
          if (e.kind === 'seagullSteven' && p.boost > 0.1) { p.boost = 0; G.ui.notify('Steven stole your boost. And your chips. Mostly the chips.', 'bad', 3); }
        }
        if (e.def.kamikaze) { G.fx.explosion(e.pos); this.kill(i, false); continue; }
        e.vel.copy(toP).normalize().multiplyScalar(-60);
      }
      // Bullets: weak points and breakable parts first, then the body.
      const broad = (e.radius * 1.8 + 3) ** 2;
      for (let b = p.bullets.length - 1; b >= 0; b--) {
        const bp = p.bullets[b].pos;
        if (bp.distanceToSquared(e.pos) > broad) continue;
        const part = this.hitPart(e, bp);
        if (!part && bp.distanceToSquared(e.pos) > (e.radius + 2) ** 2) continue;
        const dmg = (p.bullets[b].dmg || 1) * (e.vulnerable || 1) * (e.shield ?? 1) * (e.dazed > 0 ? 1.5 : 1); // dazed bosses take ×1.5
        p.removeBullet(b);
        if (part) this.damagePart(e, part, dmg, bp);
        else {
          e.hp -= dmg * (e.def.armor ?? 1);
          G.fx.sparkle(bp, e.def.armor || e.shield < 1 ? '#9aa0a6' : '#ffaa55');
          G.audio.tick();
        }
        if (e.hp <= 0) break;
      }
      if (e.hp <= 0) { G.fx.explosion(e.pos); G.fx.confetti(e.pos); this.kill(i, true); }
    }
    const bosses = this.list.filter((e) => e.boss && !e.dead);
    // Faster mending only while it has lost you or is coming back: shadowing you from its standoff isn't a rest.
    this.breather = bosses.length > 0 && bosses.every((e) => e.chase === 'loose' || e.chase === 'catch');
    this.updateShots(dt);
    this.hazards.update(dt);
  }

  hitPart(e, pos) {
    const parts = e.mesh.userData.parts;
    if (!parts) return null;
    const s = e.mesh.scale.x;
    let best = null, bd = Infinity;
    for (const part of parts) {
      if (part.broken) continue;
      part.obj.getWorldPosition(_pp);
      const d = _pp.distanceToSquared(pos), r = part.r * s + 1.5;
      if (d < r * r && d < bd) { bd = d; best = part; }
    }
    return best;
  }

  damagePart(e, part, dmg, pos) {
    const G = this.G;
    e.hp -= dmg * part.mult;
    if (part.mult > 1) {
      G.fx.sparkle(pos, '#ffd23a');
      G.fx.emit(pos, 12, { colors: ['#ffffff', '#ffd23a'], speed: 45, life: 0.4, size: 5 });
      G.audio.tone(1500, 0.07, { type: 'triangle', vol: 0.05 });
      if (!this.weakTip) { this.weakTip = true; G.ui.notify('WEAK SPOT! Glowing parts take extra damage. Aim there.', 'good', 4, 1); }
    } else {
      G.fx.sparkle(pos, '#ffaa55');
      G.audio.tick();
    }
    if (!Number.isFinite(part.hp)) return;
    part.hp -= dmg;
    if (part.hp <= 0) this.breakPart(e, part);
  }

  breakPart(e, part) {
    const G = this.G;
    part.broken = true;
    part.obj.visible = false;
    part.obj.getWorldPosition(_pp);
    G.fx.explosion(_pp);
    G.audio.pop();
    (e.broken ||= {})[part.name] = (e.broken[part.name] || 0) + 1;
    const n = e.broken[part.name];
    const total = e.mesh.userData.parts.filter((x) => x.name === part.name).length;
    G.score += e.boss ? 40 : 10;
    G.fx.popText(_pp, e.boss ? '+40' : '+10');
    switch (part.name) {
      case 'rotor': if (e.boss) e.hp -= e.maxHp * 0.06; else if (n >= 2) e.state = 'falling'; break;
      // A boss doesn't drop out of the sky from one part: it slows down and takes a chunk of damage instead.
      case 'prop': if (e.boss) { e.slow = 0.7; e.hp -= e.maxHp * 0.1; } else e.state = 'falling'; break;
      case 'gondola': e.noBombs = true; break;
      case 'barrel': e.disarmed = true; if (e.boss) e.hp -= e.maxHp * 0.1; break;
      case 'fin': if (e.boss) e.hp -= e.maxHp * 0.03; break;
      case 'tentacle': if (n >= total) e.noZap = true; if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'claw': if (e.boss) e.hp -= e.maxHp * 0.1; break;
      case 'puff': e.radius *= 0.9; if (!e.boss && n >= total) e.hp = 0; else if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'crown': e.vulnerable = 1.3; break;
      case 'turret': if (e.boss) e.hp -= e.maxHp * 0.02; break;
    }
    // Every boss break is news; regular enemies only mention the dramatic ones, quietly.
    const text = (e.boss && BOSS_BREAK_TEXT[part.name]) || BREAK_TEXT[part.name];
    if (text && (e.boss || ['prop', 'gondola', 'barrel', 'rotor'].includes(part.name))) G.ui.notify(text, 'good', 3, e.boss ? 1 : 0);
  }

  behave(e, toP, dist, dt) {
    const G = this.G, p = G.player, d = e.def;
    const steer = (desired, k = 2) => e.vel.lerp(desired, 1 - Math.exp(-dt * k));
    switch (e.type) {
      case 'drone':
        steer(_w.copy(toP).normalize().multiplyScalar(d.speed).add(new THREE.Vector3(Math.sin(e.t * 2) * 10, Math.cos(e.t * 3) * 6, 0)), 1.5);
        break;
      case 'mine':
        if (dist < 120) steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 1);
        else steer(_w.set(0, Math.sin(e.t) * 3, 0), 1);
        break;
      case 'gull':
        if (e.state === 'idle') {
          steer(_w.set(Math.cos(e.t * 0.8) * 30, Math.sin(e.t) * 4, Math.sin(e.t * 0.8) * 30));
          if (dist < 260) { e.state = 'dive'; e.stateT = 0; }
        } else if (e.state === 'dive') {
          steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 3);
          if (e.stateT > 4) { e.state = 'leave'; e.stateT = 0; }
        } else {
          steer(_w.copy(toP).normalize().multiplyScalar(-d.speed).setY(15), 2);
          if (e.stateT > 5) { e.state = 'idle'; e.stateT = 0; }
        }
        break;
      case 'ufo': {
        _w.copy(toP).setY(0).normalize().multiplyScalar(-170).add(p.pos).setY(p.pos.y + 45).sub(e.pos);
        steer(_w.clampLength(0, d.speed), 1.2);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 450) {
          e.cd = 2.8;
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 65) * 0.5);
          const m = new THREE.Mesh(this.orbGeo, this.orbMat);
          m.position.copy(e.pos);
          G.scene.add(m);
          this.shots.push({ mesh: m, pos: m.position, vel: lead.sub(e.pos).normalize().multiplyScalar(65), life: 6, dmg: TYPES.ufo.dmg, r2: 36 });
          G.audio.tone(300, 0.3, { type: 'sine', vol: 0.06, slide: 400 });
        }
        break;
      }
      case 'storm':
        steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 0.6);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 75 && !p.dead) {
          e.cd = 1.6;
          G.fx.lightning(e.pos, p.pos);
          G.audio.zap();
          p.damage(d.dmg);
        }
        break;
      case 'bee':
        steer(_w.copy(toP).normalize().multiplyScalar(d.speed).add(new THREE.Vector3(Math.sin(e.t * 9) * 18, Math.cos(e.t * 7) * 10, Math.cos(e.t * 8) * 18)), 2.5);
        break;
      case 'blimp':
        _w.copy(p.pos).addScaledVector(p.forward, 120).setY(p.pos.y + 70).sub(e.pos);
        steer(_w.clampLength(0, d.speed), 0.5);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 350 && !e.noBombs) {
          e.cd = 3;
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 45) * 0.5);
          this.fireOrb(e.pos.clone().add(new THREE.Vector3(0, -8, 0)), lead.sub(e.pos), 45, 14, '#ff9a3a', 1.3);
        }
        break;
      case 'jelly':
        steer(_w.copy(toP).setY(0).normalize().multiplyScalar(d.speed).setY(Math.sin(e.t * 0.8) * 6), 0.5);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 55 && !p.dead && !e.noZap) {
          e.cd = 1.5;
          G.fx.lightning(e.pos, p.pos);
          G.audio.zap();
          p.damage(d.dmg);
        }
        break;
      case 'cannon':
        e.cd -= dt;
        if (e.cd <= 0 && dist < 420 && !p.dead && !e.disarmed) {
          e.cd = 2.6;
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 60) * 0.5);
          this.fireOrb(e.pos.clone().add(new THREE.Vector3(0, 5, 0)), lead.sub(e.pos), 60, 12, '#ff4d4d', 1.2);
          G.audio.tone(140, 0.25, { type: 'square', vol: 0.06, slide: -60 });
        }
        break;
      case 'rival':
        if (e.state !== 'extend') {
          steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 1.6);
          e.cd -= dt;
          if (e.cd <= 0 && dist < 260 && e.vel.dot(toP) > 0.8 * e.vel.length() * dist) {
            e.cd = 1.8;
            for (let k = 0; k < 3; k++) setTimeout(() => !e.dead && this.fireOrb(e.pos, _w.copy(p.pos).sub(e.pos), 110, 6, '#ff3ad0', 0.6), k * 120);
          }
          if (dist < 40 || e.stateT > 7) { e.state = 'extend'; e.stateT = 0; }
        } else {
          steer(_w.copy(toP).normalize().multiplyScalar(-d.speed).setY(8), 1.2);
          if (e.stateT > 4) { e.state = 'idle'; e.stateT = 0; }
        }
        break;
      case 'pigeon':
        if (dist < 170 && e.stateT < 4) steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 2);
        else {
          const a = e.t * 0.6;
          _w.set(e.anchor.x + Math.cos(a) * 70, e.anchor.y + Math.sin(e.t * 0.9) * 12, e.anchor.z + Math.sin(a) * 70).sub(e.pos);
          steer(_w.clampLength(0, d.speed), 1.5);
          if (e.stateT > 8) e.stateT = 0;
        }
        break;
    }
  }

  animate(e, dt) {
    const u = e.mesh.userData;
    if (u.parts) for (const part of u.parts) if (part.glow) { const k = Math.sin(e.t * 6); part.glow.material.opacity = 0.45 + 0.25 * k; part.glow.scale.setScalar(1 + 0.12 * k); }
    if (u.rotors) for (const r of u.rotors) r.rotation.y += dt * 30;
    if (u.wings) { const f = Math.sin(e.t * 14) * 0.6; u.wings[0].rotation.z = -f; u.wings[1].rotation.z = f; }
    if (u.lights) u.lights.forEach((l, k) => l.visible = Math.floor(e.t * 6 + k) % 2 === 0);
    if (u.spin) for (const s of u.spin) s.rotation.z += dt * 25;
    if (u.tentacles) u.tentacles.forEach((t, k) => { t.rotation.x = Math.sin(e.t * 2 + k) * 0.35; t.rotation.z = Math.cos(e.t * 1.7 + k) * 0.35; });
    if (u.barrel) u.barrel.lookAt(this.G.player.pos);
    if (u.legs) u.legs.forEach((l, k) => { l.rotation.x = Math.sin(e.t * 8 + k * 1.3) * 0.3; });
    if (u.claws) {
      e.snap = Math.max(0, (e.snap || 0) - dt);
      u.claws.forEach((c, k) => { c.rotation.y = (k ? -1 : 1) * (e.snap > 0 ? 0.5 : Math.sin(e.t * 2) * 0.15); });
    }
    if (u.puff) { const s = u.puff.scale.x, k = e.puffT > 0 ? 1.7 : 1; u.puff.scale.setScalar(s + (k - s) * (1 - Math.exp(-dt * 6))); }
    if (e.boss) {
      animateBoss(this, e, dt); // squash, duck, roll, blink, dazed stars, tractor beam
      const face = e.mv?.face || e.def.face, pp = this.G.player.pos;
      // On a break it barely moves: waiting it eyes you, loose it keeps the heading it had (no nodding with the bob).
      if (face === 'vel' && e.chase === 'wait') e.mesh.lookAt(pp.x, e.pos.y, pp.z);
      else if (face === 'vel' && e.chase === 'loose') return;
      else if (face === 'vel' && e.vel.lengthSq() > 1) e.mesh.lookAt(_w.copy(e.pos).add(e.vel));
      else if (face === 'spin') e.mesh.rotation.y += dt * e.def.spin;
      else if (face === 'player') e.mesh.lookAt(pp.x, e.pos.y, pp.z);
      return;
    }
    if (e.type === 'cannon' || e.type === 'jelly') return;
    if (e.type === 'mine' || e.type === 'storm') e.mesh.rotation.y += dt * 0.4;
    if (e.type === 'ufo') e.mesh.rotation.y += dt * 1.5;
    if (e.type === 'drone' || e.type === 'storm') e.mesh.lookAt(this.G.player.pos.x, e.pos.y, this.G.player.pos.z);
    else if (e.vel.lengthSq() > 1 && e.type !== 'mine' && e.type !== 'ufo') e.mesh.lookAt(_w.copy(e.pos).add(e.vel));
  }

  updateShots(dt) {
    const p = this.G.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      if (s.g) s.vel.y -= s.g * dt; // dropped bombs and eggs fall
      s.pos.addScaledVector(s.vel, dt);
      const hit = !p.dead && s.pos.distanceToSquared(p.pos) < s.r2 * p.sizeScale * p.sizeScale;
      if (hit) p.damage(s.dmg);
      const ground = !hit && s.pos.y < this.G.terrain.surfaceHeight(s.pos.x, s.pos.z, s.pos.y);
      if (ground) {
        // Orbs that miss blow holes in the landscape.
        this.G.terrain.deform(s.pos.x, s.pos.z, 5, 2.5);
        this.G.fx.emit(s.pos, 25, { colors: ['#ffb03a', '#8a6a4a', '#555555'], speed: 30, life: 0.8, size: 6, up: 15 });
      }
      if (hit || ground || s.life <= 0) { this.G.scene.remove(s.mesh); this.shots.splice(i, 1); }
    }
  }

  kill(i, byPlayer) {
    const G = this.G, e = this.list[i];
    e.dead = true;
    // Blowing up close to the ground leaves a crater: bosses leave a big one.
    const above = e.pos.y - G.terrain.surfaceHeight(e.pos.x, e.pos.z, e.pos.y);
    if (above < e.radius * 2 + 15) G.terrain.deform(e.pos.x, e.pos.z, e.boss ? 26 : 5 + e.radius * 0.5, e.boss ? 12 : 3);
    if (e.boss) {
      for (let k = 0; k < 5; k++) setTimeout(() => G.fx.explosion(e.pos.clone().add(new THREE.Vector3(rand(-20, 20), rand(-15, 15), rand(-20, 20)))), k * 150);
      G.stats.kills++;
      G.powerups.drop(e.pos.clone()); // bosses always drop a power-up
    } else if (byPlayer) {
      G.score += e.def.score;
      G.fx.popText(e.pos, `+${e.def.score}`);
      G.stats.kills++;
      if (Math.random() < 0.3) G.ui.notify(`${pick(T.kill)} +${e.def.score}`, 'good', 2.5, 0);
    }
    G.audio.explode();
    this.remove(i);
  }

  remove(i) {
    const e = this.list[i];
    e.dead = true;
    this.G.scene.remove(e.mesh);
    if (e.marker) this.G.scene.remove(e.marker);
    if (e.boss) dropBoss(this, e); // its hazards and stingers go with it
    disposeTree(e.mesh);
    this.list.splice(i, 1);
  }

  removeEnemy(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.remove(i);
  }
}
