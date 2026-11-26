// Enemies: chasing drones, spiky balloon mines, dive-bombing seagulls, orb-spitting UFOs,
// grumpy storm clouds, bee swarms, ad blimps, sky jellyfish, ground cannons, Rival Pilot Gary,
// umbrella goons, grudge rocks, sniper owls, kite twins, clingy moths, (quest-only) evil pigeons and (from
// Grumbleglobe's pores only) Grumblings. Land enemies turn up only in their own land (TYPES `lands`), at least one kind
// in every land: Ember Bats and Magma Spitters in Volcano Land, Comet Chargers out in space, Flying Squirrels, Hail
// Sprites, Crystal Bats, Glitch Bugs, Spore Poppers, Sand Noodles, Gumdrop Poppers, Icicle Lancers, Swordfish and
// Dragonlings elsewhere.
// Regular enemies spawn in a cone in front of the player (Hold The Line also sends them from the flanks and above).
import * as THREE from 'three';
import { makeDrone, makeMine, makeGull, makeUfo, makeStorm, makePigeon, makeGoose, makeCrown, makeBlimp, makeBee, makeJelly, makeCannon, makeRivalJet, makeOctopus, makeCrab, makePuffer, makeUmbrella, makeGrudgeRock, makePebble, makeGrumbling, makeOwl, makeKite, makeMoth, makeCarrier, makeFort, makeDeckFighter, makeEmberBat, makeMagmaSpitter, makeCometCharger, makeFlyingSquirrel, makeCrystalBat, makeHailSprite, makeGlitchBug, makeSporePopper, makeSandNoodle, makeGumdropPopper, makeIcicleLancer, makeSwordfish, makeDragonling, makeLavaSerpent, makeAuroraRay, makeSunBeetle, makeHarvestOwl, makeToadBaron, makeCastleDragon, makeIslandTurtle, CARRIER_HULL, CARRIER_DECK, FORT_HULL, deckSpot, disposeTree } from './models.js';
import { pick, rand, T } from './texts.js';
import { waterLine } from './world.js';
import { MEGA, TINY } from './powerups.js';
import { MOVES as BOSS_MOVES, Hazards, guardStep, animateBoss, endMoves, dropBoss, daze } from './bossmoves.js';

export const TYPES = {
  drone: { hp: 2, radius: 5, dmg: 18, speed: 38, make: makeDrone, score: 50, minScore: 0, weight: 3, kamikaze: true, name: 'Angry Drone' },
  mine: { hp: 1, radius: 6, dmg: 25, speed: 10, make: makeMine, score: 30, minScore: 0, weight: 2, kamikaze: true, name: 'Spiky Balloon', intro: 'Spiky Balloon! Get close and it blinks red. Then it pops. Shoot it or get out of there.' },
  gull: { hp: 1, radius: 4, dmg: 8, speed: 58, make: makeGull, score: 25, minScore: 150, weight: 2, kamikaze: true, name: 'Seagull Gang' },
  ufo: { hp: 4, radius: 10, dmg: 15, speed: 34, make: makeUfo, score: 120, minScore: 350, weight: 1.2, kamikaze: false, name: 'UFO' },
  storm: { hp: 6, radius: 22, dmg: 12, speed: 16, make: makeStorm, score: 150, minScore: 650, weight: 0.8, kamikaze: false, name: 'Grumpy Cloud' },
  pigeon: { hp: 2, radius: 5, dmg: 10, speed: 36, make: makePigeon, score: 80, minScore: Infinity, weight: 0, kamikaze: true, name: 'Evil Pigeon' },
  bee: { hp: 1, radius: 3, dmg: 6, speed: 44, make: makeBee, score: 15, minScore: 80, weight: 1.6, kamikaze: true, name: 'Bee Swarm', intro: 'A bee swarm! Not the bees! Okay, the bees.' },
  blimp: { hp: 6, radius: 15, dmg: 15, speed: 12, make: makeBlimp, score: 110, minScore: 220, weight: 1, kamikaze: false, name: 'Ad Blimp', intro: 'An Ad Blimp is dropping "special offers". They explode.' },
  jelly: { hp: 3, radius: 8, dmg: 10, speed: 8, make: makeJelly, score: 70, minScore: 180, weight: 1.2, kamikaze: false, name: 'Sky Jellyfish', intro: 'Sky Jellyfish ahead. Do not hug. They zap up close.' },
  cannon: { hp: 4, radius: 8, dmg: 10, speed: 0, make: makeCannon, score: 100, minScore: 300, weight: 1, kamikaze: false, ground: true, armor: 0.5, name: 'Grumpy Ground Cannon', intro: 'Grumpy Ground Cannons are shooting at the sky. The sky did nothing wrong.' },
  rival: { hp: 3, radius: 6, dmg: 20, speed: 62, make: makeRivalJet, score: 150, minScore: 450, weight: 0.9, kamikaze: false, name: 'Rival Pilot Gary', intro: 'Rival Pilot Gary has entered the sky. Nobody likes Gary.' },
  // guard: front hits bounce off (see guarded). split: pops into that many of another type. max: at most this many alive.
  // pair: spawns as two, joined by a string. latch: clings to the plane instead of bumping it. quiet: no intro.
  umbrella: { hp: 3, radius: 6, dmg: 12, speed: 30, make: makeUmbrella, score: 90, minScore: 250, weight: 1, kamikaze: false, guard: true, name: 'Umbrella Goon', intro: 'An Umbrella Goon. Bullets bounce off the front. It is very proud of its umbrella.' },
  grudgeRock: { hp: 4, radius: 9, dmg: 15, speed: 14, make: makeGrudgeRock, score: 60, minScore: 120, weight: 1.2, kamikaze: false, split: ['pebble', 3], name: 'Grudge Rock', intro: 'A Grudge Rock! Break it and you get several smaller rocks. They keep the grudge.' },
  pebble: { hp: 1, radius: 3, dmg: 10, speed: 48, make: makePebble, score: 10, minScore: 0, weight: 0, kamikaze: true, quiet: true, name: 'Grudge Pebble' },
  // squeak: a short high squeak instead of the explosion when it pops. Only Grumbleglobe's pores make these (planetboss.js).
  grumbling: { hp: 1, radius: 4, dmg: 8, speed: 52, make: makeGrumbling, score: 5, minScore: Infinity, weight: 0, kamikaze: true, quiet: true, squeak: true, name: 'Grumbling' },
  sniperOwl: { hp: 2, radius: 5, dmg: 18, speed: 40, make: makeOwl, score: 140, minScore: 400, weight: 0.8, kamikaze: false, max: 2, name: 'Sniper Owl', intro: 'A Sniper Owl is watching you. Red line means it\'s aiming. Wiggle!' },
  kites: { hp: 2, radius: 5, dmg: 22, speed: 26, make: makeKite, score: 110, minScore: 200, weight: 1, kamikaze: false, pair: true, max: 1, name: 'Kite Twins', intro: 'Kite Twins, holding a very long string. They keep up, and when it flashes red they snap it at you. Go over, under, or roll.' },
  // fighter: only HMS Overkill launches these (see launchFighters): off the catapult, then it hunts you like Gary.
  fighter: { hp: 2, radius: 6, dmg: 10, speed: 58, make: makeDeckFighter, score: 30, minScore: Infinity, weight: 0, kamikaze: false, quiet: true, name: 'Deck Fighter' },
  moth: { hp: 1, radius: 4, dmg: 0, speed: 40, make: makeMoth, score: 70, minScore: 160, weight: 1, kamikaze: false, latch: true, name: 'Clingy Moth', intro: 'A Clingy Moth! It loves you. Too much. Do a stunt (barrel roll, loop) to break up with it.' },
  // Land enemies: `lands` (zone names) is where they may spawn, and the land is their only gate (minScore 0). Every land
  // has at least one (Grumbleglobe has its Grumblings). act: the move they share (see behave()): swoop (circle ahead,
  // flare, swoop in: see BAT), ambush (hide under the ground, rise, spit a fan, sink: MAGMA), charge (hold off to one
  // side, wind up, ram: COMET). trail: its particle colours; orb: an ambusher's shot colour; chirp: a swooper's flare
  // pitch (Hz).
  emberBat: { hp: 1, radius: 4, dmg: 12, speed: 50, make: makeEmberBat, score: 35, minScore: 0, weight: 1.8, kamikaze: true, act: 'swoop', lands: ['Volcano Land'], name: 'Ember Bats', intro: 'Ember Bats! They circle ahead, then swoop. A bat that stops and flares is about to dive at you.' },
  magmaSpitter: { hp: 4, radius: 7, dmg: 15, speed: 0, make: makeMagmaSpitter, score: 110, minScore: 0, weight: 1.6, kamikaze: false, vent: true, act: 'ambush', max: 3, markerUp: 10, lands: ['Volcano Land'], name: 'Magma Spitter', intro: 'Magma Spitters hide in the lava. A bubbling ring means one is coming up to spit fire. Shoot it while it\'s up: under the lava it\'s safe.' },
  cometCharger: { hp: 4, radius: 6, dmg: 24, speed: 46, make: makeCometCharger, score: 130, minScore: 0, weight: 2, kamikaze: false, act: 'charge', max: 3, lands: ['Low Orbit', 'Meteor Belt', 'Gas Giant', 'The Moon', 'Planet Pebble', 'Ringworld'], name: 'Comet Charger', intro: 'A Comet Charger! When its thruster glows it\'s about to ram where you\'re going. Turn or climb when it lights up.' },
  flyingSquirrel: { hp: 1, radius: 4, dmg: 12, speed: 52, make: makeFlyingSquirrel, score: 35, minScore: 0, weight: 1.8, kamikaze: true, act: 'swoop', trail: ['#c49a5a', '#8ac44a', '#e8c49a'], chirp: 1800, lands: ['Meadowlands', 'Autumn Woods', 'Giant\'s Garden', 'Ringworld'], name: 'Flying Squirrels', intro: 'Flying Squirrels! They glide in a ring ahead, then dive. A squirrel that puffs up is coming for you. You have no nuts. They don\'t believe you. One on your tail? Roll to shake it off.', tailShy: true },
  hailSprite: { hp: 1, radius: 4, dmg: 10, speed: 54, make: makeHailSprite, score: 30, minScore: 0, weight: 1.6, kamikaze: true, act: 'swoop', trail: ['#ffffff', '#cfefff', '#9ad8ff'], chirp: 2200, lands: ['Frozen Peaks', 'Hollow Peaks', 'Stratosphere'], name: 'Hail Sprites', intro: 'Hail Sprites! They spin ahead, then pelt down. One that sparkles is about to dive. Weather, but personal.' },
  crystalBat: { hp: 2, radius: 4, dmg: 12, speed: 50, make: makeCrystalBat, score: 45, minScore: 0, weight: 1.8, kamikaze: true, act: 'swoop', trail: ['#c49aff', '#7a4ad8', '#e0fff8'], chirp: 1300, lands: ['Crystal Caverns', 'Alien World'], name: 'Crystal Bats', intro: 'Crystal Bats! Shiny, pointy, and tougher than they look. One that flashes is about to swoop.' },
  glitchBug: { hp: 1, radius: 4, dmg: 12, speed: 56, make: makeGlitchBug, score: 35, minScore: 0, weight: 1.8, kamikaze: true, act: 'swoop', trail: ['#ff3ad0', '#3af4ff', '#ffffff'], chirp: 900, lands: ['Metropolis', 'Neon Grid', 'Blockland'], name: 'Glitch Bugs', intro: 'Glitch Bugs! They flicker ahead, then zip at you. One that freezes mid air is about to dive. Have you tried turning it off and on again?' },
  sporePopper: { hp: 5, radius: 7, dmg: 15, speed: 0, make: makeSporePopper, score: 120, minScore: 0, weight: 1.6, kamikaze: false, vent: true, act: 'ambush', max: 3, markerUp: 10, trail: ['#5affb0', '#b06aff', '#f4ffd0'], orb: '#7aff9a', lands: ['Mushroom Forest', 'Alien World'], name: 'Spore Popper', intro: 'Spore Poppers hide under the moss. When the ground bubbles, one pops up to sneeze spores at you. Bless you. Now shoot it.' },
  sandNoodle: { hp: 5, radius: 7, dmg: 15, speed: 0, make: makeSandNoodle, score: 120, minScore: 0, weight: 1.6, kamikaze: false, vent: true, act: 'ambush', max: 3, markerUp: 12, trail: ['#e8c47a', '#c49a5a', '#8a6a3a'], orb: '#ffb03a', lands: ['Canyon Country', 'Dune Sea', 'Salt Mirror', 'Mars'], name: 'Sand Noodle', intro: 'A Sand Noodle! A ring of puffing sand means it\'s coming up to spit. Shoot it while it\'s up. It is not a real noodle. Do not eat it.' },
  gumdropPopper: { hp: 4, radius: 7, dmg: 15, speed: 0, make: makeGumdropPopper, score: 110, minScore: 0, weight: 1.6, kamikaze: false, vent: true, act: 'ambush', max: 3, markerUp: 10, trail: ['#ff4a8a', '#ffd23a', '#ffffff'], orb: '#ff6ad0', lands: ['Candy Kingdom'], name: 'Gumdrop Popper', intro: 'Gumdrop Poppers hide in the frosting. Bubbling sprinkles mean one is popping up to spit gumdrops. Shoot it while it\'s up. Do not lick.' },
  icicleLancer: { hp: 4, radius: 6, dmg: 26, speed: 50, make: makeIcicleLancer, score: 140, minScore: 0, weight: 1.8, kamikaze: false, act: 'charge', max: 3, trail: ['#e0fbff', '#9ad8ff', '#ffffff'], lands: ['Frozen Peaks', 'Hollow Peaks'], name: 'Icicle Lancer', intro: 'An Icicle Lancer! When it glows blue and hums, it charges where you\'re going. It is pointy on purpose.' },
  swordfish: { hp: 4, radius: 6, dmg: 24, speed: 52, make: makeSwordfish, score: 130, minScore: 0, weight: 2, kamikaze: false, act: 'charge', max: 3, trail: ['#bff8ff', '#7af0ff', '#ffffff'], lands: ['Tropical Archipelago', 'Sunken Reef'], name: 'Swordfish', intro: 'A Swordfish! When its gills glow, it charges. It has one idea and it\'s pointy.' },
  dragonling: { hp: 5, radius: 6, dmg: 24, speed: 50, make: makeDragonling, score: 150, minScore: 0, weight: 1.8, kamikaze: false, act: 'charge', max: 2, trail: ['#ffd23a', '#ff6a1a', '#ff9ad0'], lands: ['Princess Kingdom', 'Cloud Kingdom', 'Sky Islands'], name: 'Dragonling', intro: 'A Dragonling! Tiny, pink and furious. When its mouth glows it charges. It thinks it\'s a big dragon. Do not tell it.' },
};
const SWARMS = { gull: 4, bee: 6, emberBat: 3, flyingSquirrel: 4, hailSprite: 4, crystalBat: 3, glitchBug: 4 };
// Hold The Line ("The Rush"): mkSurvive (challenges.js) sets `frenzy` and runs five waves; these tables drive them.
// frenzy: { wave: 1..5, phase ('count' before a wave, 'wave', 'result' after one, 'down' while you're shot down),
// easier, burst, first, spent, score }. Nothing spawns outside the 'wave' phase.
// time: the wave's clock (s). roster: how many enemies it sends in all (units: small fry count SMALL each); once it's
// spent nothing more spawns, and shooting down the lot clears the wave early. every: real s between spawns; cap: active
// enemies (see active()); flank / above: the chance a spawn comes from the side (±70° off your heading) or from
// overhead (open sky only); chase: the chasers' (drones, bees, pebbles, diving gulls) top speed × your base speed, so
// flying straight doesn't leave them behind (boosting still does); only: the types it may send (no score needed in
// Hold The Line); null: anything RUSH_FREE, or past 0.4 × its minScore; spread: how far off your line (m, either side)
// groups from ahead appear (default 0-RUSH_SPREAD; wave 1's come in wider, so a warm-up pass isn't a head-on hit);
// shooter: keep at least one SHOOTERS type alive; burst: opens with three groups at once (front, left and right);
// bonus: the score you came in with adds up to 4 to the cap (one per 600 points); gary: the elite Rival Pilot Gary
// (GARY) joins. Each `easier` step (frenzy.easier) makes the clock ×EASIER_TIME, takes EASIER_ROSTER off the roster
// (down to 3) and EASIER_CAP off the cap (down to 2), stretches the interval ×EASIER_SLOW and slows chasers by
// EASIER_CHASE (× your base speed).
const W1 = ['drone', 'mine', 'gull'], W2 = [...W1, 'bee', 'grudgeRock', 'umbrella', 'ufo'], W3 = [...W2, 'blimp', 'jelly', 'kites', 'sniperOwl'];
export const WAVES = [
  { time: 12, roster: 5, cap: 4, every: [1.1, 1.4], flank: 0.25, above: 0, chase: 0.85, only: W1, spread: [50, 90] },
  { time: 15, roster: 7, cap: 5, every: [1.0, 1.3], flank: 0.35, above: 0, chase: 0.9, only: W2, shooter: true },
  { time: 18, roster: 9, cap: 7, every: [0.8, 1.1], flank: 0.35, above: 0.2, chase: 0.95, only: W3, shooter: true, bonus: true },
  { time: 20, roster: 11, cap: 8, every: [0.7, 0.9], flank: 0.4, above: 0.2, chase: 1, only: null, burst: true, bonus: true },
  { time: 24, roster: 10, cap: 8, every: [0.7, 0.9], flank: 0.4, above: 0.2, chase: 1.05, only: null, gary: true, bonus: true },
];
const RUSH_FREE = W3;
const EASIER_SLOW = 1.25, EASIER_CAP = 2, EASIER_TIME = 0.8, EASIER_ROSTER = 2, EASIER_CHASE = 0.05;
const SHOOTERS = ['ufo', 'blimp', 'cannon', 'sniperOwl'];
// The final wave's elite: Rival Pilot Gary, bigger (scale), tougher (hp; his propeller takes prop hits to shoot off,
// and like a boss's that only slows him and costs him a tenth of his hp: propText says so), worth score × his usual
// points, and `ahead` m in front of you when the wave starts. intro: his own line when he turns up. Aimed at 8-15 s of
// focused fire from a good shot.
export const GARY = {
  hp: 42, prop: 8, scale: 1.35, score: 3, ahead: 300, name: 'Rival Pilot Gary (Big Day)',
  intro: 'Gary\'s having a Big Day. Gary is unbearable on Big Days.', propText: 'Gary\'s propeller is gone. He\'s flapping his arms.',
};
// Hold The Line: new-enemy intros wait their turn, one every INTRO_GAP s (real time), so they don't pile up mid-wave.
// At most INTRO_MAX wait (the oldest goes), and one whose enemy is gone by its turn is skipped.
const INTRO_GAP = 4, INTRO_MAX = 4;
// Never more regular (non-quest) enemies than this at once, whatever spawns them. Small fry count a third each
// toward a wave's cap.
export const CEILING = 18;
const SMALL = { gull: 1 / 3, bee: 1 / 3, pebble: 1 / 3, emberBat: 1 / 3, flyingSquirrel: 1 / 3, hailSprite: 1 / 3, crystalBat: 1 / 3, glitchBug: 1 / 3 };
// Frenzy spawn distances (m): ahead, from a flank, from above (that many m over you).
// Ahead they come in closer to your line (±RUSH_SPREAD m to the side, ±RUSH_RISE m up or down), so you meet them.
const RUSH_AHEAD = [180, 320], RUSH_SPREAD = 25, RUSH_RISE = 8, RUSH_FLANK = [240, 320], FLANK_YAW = (70 * Math.PI) / 180, RUSH_ABOVE = 70;
// How far ahead of you orb shooters aim (× your speed × the orb's flight time): out of a frenzy half-hearted, so flying
// straight is enough to dodge; in Hold The Line they mean it, and you have to weave.
const LEAD = 0.5, RUSH_LEAD = 1; // 1: right at where you will be (see leadK)
const RUSH_KEEP = 1.1; // see keepUp
// Frenzy clean-up: regulars this far away and behind you are quietly dropped (a wave's own come back round a flank,
// RUSH_RETURN m away: see sweep); the cap counts those within ACTIVE_R m and no more than ACTIVE_BEHIND m behind you.
const STRAGGLER = 550, ACTIVE_R = 700, ACTIVE_BEHIND = 300, RUSH_RETURN = 250;
const KILL_MEND = 3; // hull each kill mends during Hold The Line
// Kill streak: kills less than STREAK_WINDOW s apart chain, and the 2nd, 3rd and 4th+ kill in a chain score
// STREAK_MULT[1], [2], [3] times their points (shown on the "+N" popup). Dying, or a new plane (player.spawn), ends it.
const STREAK_WINDOW = 3;
const STREAK_MULT = [1, 1.5, 2, 3];
// Hit-stop: shooting down anything bigger than small fry freezes the game this long (s), so the kill lands with a
// thump. Never with reduced motion. main.js's frame() spends it; G.step (scripted tests) ignores it.
export const HIT_STOP = 0.05;
// Grumblings aim GRUMBLE_LEAD s ahead of you, each at its own spot up to GRUMBLE_SPREAD m off that point (circling
// slowly); GRUMBLE_GAP s after one bites, the rest of the clump doesn't.
const GRUMBLE_LEAD = 1, GRUMBLE_SPREAD = 20, GRUMBLE_GAP = 0.3;
// Umbrella Goon: how fast its umbrella swings round to you (rad per enemy-s), and how far off its facing a bullet may
// come in and still bounce off (cos of 60°). Circling it 120 m out (about 0.37 rad/s) outturns it.
const UMBRELLA_TURN = 0.25, UMBRELLA_COS = Math.cos((60 * Math.PI) / 180);
// Sniper Owl: real s between locks, lock time before the shot, shot speed, and how far you may turn off it (rad).
const OWL_EVERY = 4, OWL_LOCK = 1.5, OWL_SHOT = 130, OWL_BREAK = (35 * Math.PI) / 180;
// Kite Twins: string length (m, open sky / under a roof), how close counts as flying through it, its cooldown (s).
const KITE_GAP = 70, KITE_GAP_ROOF = 40, STRING_HIT = 5, STRING_CD = 1.5;
// Where the pair parks (m ahead of you, ± sideways sweep) and how fast it keeps up (× your speed), then its snap attack
// (enemy s): every KITE_EVERY it winds up (the string blinks red for KITE_WIND while it drops back to KITE_CLOSE m in
// front of you), then lunges (KITE_LUNGE m per enemy-s) to lay the string across the spot you'll reach in about
// KITE_SNAP. After a snap, or once you're past it, it flies back out ahead, over your head and harmless, until it's
// KITE_BACK m in front again. The string stays KITE_FLOOR m above the ground.
const KITE_AHEAD = 110, KITE_CLOSE = 55, KITE_SWEEP = 40, KITE_KEEP = 1.15, KITE_EVERY = 6, KITE_WIND = 1, KITE_SNAP = 0.8;
const KITE_LUNGE = 120, KITE_BACK = 80, KITE_FLOOR = 8, KITE_RED = '#ff3b30';
// Clingy Moth while latched: boost tank drained per s, hull per s.
const MOTH_BOOST = 0.15, MOTH_HP = 2;
// Ember Bats: circle `ring` m round a point `ahead` m in front of you; every `every` s one stops and flares for `flare`
// s (a chirp), then swoops at `swoop` × its speed for up to `swoopT` s.
export const BAT = { ahead: 90, ring: 45, every: [2.5, 4.5], flare: 0.4, swoop: 1.7, swoopT: 2.2, range: 240 };
// Tail-shy swoopers (TYPES `tailShy`: Flying Squirrels). One only flares while it's in front of you (`front`: the cosine
// off your nose). Its dive homes until it's `commit` m away, then glides straight at where you were, so a hard turn or
// a roll makes it overshoot. One on your tail (cosine below `behind`, within `near` m) for `tail` s, or the moment you
// do a stunt, peels off: it tumbles for `tumble` s, then glides out `wide` m to one side and back round ahead of you at
// `back` × its speed, touching nothing (no contact damage), and can't flare again for `rest` s. `giveUp`: s before a
// peel ends anyway.
export const SQUIRREL = { front: 0.3, commit: 35, behind: -0.3, near: 90, tail: 2, tumble: 0.5, wide: 28, back: 1.6, rest: 1.5, giveUp: 6 };
// Magma Spitters: under the lava (bullets do nothing, a bubbling ring shows where) for `under` s, `rise` s up, `up` s
// out (cracks brighten for `wind` s, then a fan of `shots` fireballs, `spread` rad apart, at `speed`), `sink` s down.
// They only come up for a plane within `range` m. `depth`: how far under the mound sits (model units).
export const MAGMA = { under: [2, 3.5], rise: 0.6, up: 2.8, wind: 0.7, sink: 0.5, depth: 11, shots: 3, spread: 0.2, speed: 58, dmg: 12, range: 420 };
// Comet Chargers: hold `hold` m off to one side ahead of you; every `every` s within `range` m, `wind` s of wind-up
// (thruster and eye glow, a rising hum, a fixed aim at where you'll be), then a straight charge at `speed` for `dash`
// s, then `coast` s drifting.
export const COMET = { hold: 170, side: 80, every: [3.5, 5.5], wind: 1.1, speed: 150, dash: 1.5, coast: 1.4, range: 380 };
// Everything enemy-side (movement, shots, attack timers) runs at this pace so the game feels unhurried.
export const PACE = 0.85;
// Spiky Balloon proximity fuse: inside arm m it stops, blinks red and beeps for fuse s (enemy time), then pops.
// Everything inside blast m takes dmgMax at the centre down to dmgMin at the edge (before ENEMY_DMG). Shoot it while
// it blinks to pop it safely, or veer or boost away: flying straight past close still gets you nicked.
export const MINE = { arm: 34, fuse: 0.9, blast: 24, dmgMax: 30, dmgMin: 8 };
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

// Your heading, flattened onto the ground (into `out`).
function flatForward(p, out) {
  out.set(p.forward.x, 0, p.forward.z);
  if (out.lengthSq() < 0.01) out.set(0, 0, -1);
  return out.normalize();
}

let markerMat = null, beamMat = null;
export function makeMarker() {
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
    desc: 'The grumpiest cloud ever. It hangs over you and calls down lightning where you\'re going. Yellow rings mark the spot: don\'t fly between them.',
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
    make: makeRivalJet, scale: 4, crownY: 2, crownS: 0.8, radius: 18, hp: 70, speed: 46, orbit: 160, orbitRate: 0.4, dmg: 22, dashDmg: 10, burstShot: [105, 5, '#ff3ad0', 0.8], face: 'vel',
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
    make: makeFort, scale: 3.8, crownX: -1.6, crownY: 8.8, crownZ: -1.6, crownS: 0.5, radius: 36, hp: 105, speed: 0, orbit: 0, dmg: 20, face: 'none', ground: true,
    boxes: FORT_HULL, markerUp: 50,
    name: 'Fort Grumpington', short: 'Fort Grumpington', noun: 'Fort Grumpington',
    move: 'duck',
    desc: 'A grumpy stone fortress. Its tower cannons fire orb volleys, the great mortar on the keep lobs shells at marked spots, then it all ducks behind the walls. Shoot the towers\' cannons and the mortar while they\'re up.',
    taunts: ['Fort Grumpington: "GET OFF MY LAWN. (The sky is my lawn.)"', 'Fort Grumpington: "In my day, planes were made of WOOD."', 'Fort Grumpington: "I have one setting: grump."'],
    rage: ['Fort Grumpington is extremely grumped.', 'The fort is shouting at clouds now. Literally.'],
  },
  // Sea boss (sea: true): spawns on open water ahead, steams along it and never leaves it. Solid hull boxes (`boxes`, model
  // units) take the hits and bump planes, a long health bar (`long`), and no twins or breakaways (ground: true).
  carrier: {
    make: makeCarrier, scale: 3.5, crownX: 5.2, crownY: 13.8, crownZ: 7.1, crownS: 1, radius: 68, hp: 300, speed: 12, orbit: 0, dmg: 15,
    face: 'none', ground: true, sea: true, boxes: CARRIER_HULL, deck: CARRIER_DECK, markerUp: 70, long: true,
    name: 'HMS Overkill, the Unsinkable Aircraft Carrier', short: 'HMS Overkill', noun: 'HMS Overkill',
    move: 'steam',
    desc: 'A floating fortress with six deck guns, flak and a very loud captain. It takes a LOT of shooting: knock out the guns and hit the glowing bridge.',
    taunts: ['HMS Overkill: "This is your captain speaking. Please return to your seat. Forever."', 'HMS Overkill: "I have six guns and a gift shop."', 'HMS Overkill: "Unsinkable. It says so right on the brochure."'],
    rage: ['All hands to the guns! Even the cook.', 'The captain has taken off his hat. This is serious.'],
  },
  // Land boss (lands: zone names): the deck only brings it in its own land. Magmadora lives in the lava (swim: its move
  // sets its whole path; bullets do nothing while it's all under), surfacing in telegraphed arcs across your path.
  // reach: how far from its head (m, at scale) its trailing body can still be hit.
  lavaSerpent: {
    make: makeLavaSerpent, scale: 3, crownY: 1.6, crownZ: -0.3, crownS: 0.5, radius: 7, hp: 115, speed: 0, orbit: 0, dmg: 20,
    face: 'none', ground: true, swim: true, lands: ['Volcano Land'], reach: 110, markerUp: 40,
    name: 'Magmadora, the Molten Noodle', short: 'Magmadora', noun: 'Magmadora',
    move: 'breach',
    desc: 'A lava serpent as long as a runway. A glowing ring on the lava shows where she\'ll burst out: she arcs right over your path and spits fireballs from the top. Fly under the arch, shoot her while she\'s up (the frills behind her head and the ember on her back are soft), and she can\'t be hurt under the lava.',
    taunts: ['Magmadora: "I am not a noodle. I am a SPICY noodle."', 'Magmadora: "Ssssurf\'s up. The surf is lava."', 'Magmadora: "I swim in lava. You can\'t even land."'],
    rage: ['Magmadora has reached a rolling boil.', 'She is boiling over. Mostly onto you.'],
  },
  // Land boss for the cold lands: a lead boss that fires telegraphed shard fans in the plane her wings show (see SHARDS).
  auroraRay: {
    make: makeAuroraRay, scale: 4, crownY: 1, crownS: 0.8, radius: 20, hp: 95, speed: 34, lead: 170, sway: 50, dmg: 20, face: 'player',
    lands: ['Frozen Peaks', 'Hollow Peaks', 'Stratosphere'],
    name: 'Glacierra, the Aurora Ray', short: 'Glacierra', noun: 'Glacierra',
    move: 'fans',
    desc: 'A giant ice manta trailing the northern lights. She rolls her wings into the shape of her next shard fan: wings level, climb or dive out of it; wings on edge, turn aside. Each shard ices up your boost. Shoot the crystals off her wingtips for smaller fans.',
    taunts: ['Glacierra: "Chill. No, really. I insist."', 'Glacierra: "I am a ray of sunshine. A frozen one."', 'Glacierra: "Mind the draft. I AM the draft."'],
    rage: ['Glacierra is giving you the cold shoulder. Both of them.', 'Her aurora has gone a very angry green.'],
  },
  // Land boss for the desert lands: circles you; every 3rd attack two mirage copies shimmer in and copy its volleys
  // with harmless fake orbs. Only the real one casts a shadow, and hitting it pops the mirages (see MIRAGE).
  sunBeetle: {
    make: makeSunBeetle, scale: 4, crownY: 1.3, crownZ: 1, crownS: 0.6, radius: 18, hp: 95, speed: 30, orbit: 150, orbitRate: 0.3, dmg: 20, face: 'player',
    lands: ['Canyon Country', 'Dune Sea', 'Salt Mirror', 'Mars'],
    name: 'Pharaoh Scarabus, the Sun Beetle', short: 'Pharaoh Scarabus', noun: 'Pharaoh Scarabus',
    move: 'mirage',
    desc: 'A giant golden scarab rolling the desert sun. It calls up mirage copies of itself that fire fake orbs: only the real one casts a shadow on the sand, and one hit on it pops the mirages. Shoot its horn off for smaller volleys; the sun-disc it carries is soft.',
    taunts: ['Pharaoh Scarabus: "I roll the sun across the sky. You are a much smaller job."', 'Pharaoh Scarabus: "Is that me? Is THAT me? Guess."', 'Pharaoh Scarabus: "Sand in your engine. Sand everywhere. Forever."'],
    rage: ['Pharaoh Scarabus is seeing double. So are you.', 'The heat haze is getting personal.'],
  },
  // Land boss for the woods lands: starts on the top of her giant oak (see PERCH), then circles you lobbing acorns; every 3rd attack she rears up and beats a band of leaves
  // at you that shoves you off course (see GUST). Her ear tufts are breakable (weaker gusts), her chest is soft.
  harvestOwl: {
    make: makeHarvestOwl, scale: 4, crownY: 2.4, crownS: 0.55, radius: 18, hp: 95, speed: 30, orbit: 150, orbitRate: 0.3, dmg: 20, face: 'owl', // 'owl': MOVES.gust.fly turns her
    lands: ['Autumn Woods', 'Giant\'s Garden'],
    name: 'Lady Hootrude, the Harvest Owl', short: 'Lady Hootrude', noun: 'Lady Hootrude',
    move: 'gust',
    desc: 'A grand old owl in harvest colours who keeps watch from the top of a giant oak. She circles you lobbing acorns; when she rears up with her wings raised high, a storm of leaves is coming: slip aside or over it, or get blown off course. Pluck her ear tufts for weaker gusts; her puffed-out chest is soft.',
    taunts: ['Lady Hootrude: "Who? WHO? You. Obviously you."', 'Lady Hootrude: "I have read every book in this forest. You are not in any of them."', 'Lady Hootrude: "Leaf me alone. No, wait. Leaf THIS."'],
    rage: ['Lady Hootrude is in a fowl mood.', 'Her feathers are ruffled. All of them. Toward you.'],
  },
  // Land boss for the mushroom lands: starts on his giant toadstool, then hops after you across the ground (see LEAP),
  // puffing spores between hops; every 3rd attack (2nd enraged) his throat swells and a tongue lash follows the pink line.
  // He sets his own height (hop). His glowing crests are breakable (fewer spores), his throat sac is soft.
  toadBaron: {
    make: makeToadBaron, scale: 4, crownY: 2.9, crownZ: 0.9, crownS: 0.55, radius: 20, hp: 95, speed: 0, orbit: 0, dmg: 20, face: 'toad', ground: true, hop: true, markerUp: 30, // 'toad': MOVES.leap.pose turns him
    lands: ['Mushroom Forest', 'Alien World'],
    name: 'Count Ribbiton, the Toadstool Toad', short: 'Count Ribbiton', noun: 'Count Ribbiton',
    move: 'leap',
    desc: 'A huge, very proper toad with a monocle and glowing crests, who holds court from the top of a giant toadstool. He bounds after you across the ground in great hops, puffing spores; when his throat swells pink, a tongue lash is coming down the pink line: turn or climb off it. Shoot his crests for fewer spores; his throat sac is soft.',
    taunts: ['Count Ribbiton: "One does not simply fly over a Count."', 'Count Ribbiton: "Ribbit. That is French for you are doomed."', 'Count Ribbiton: "My tongue is faster than your propeller. I have measured."'],
    rage: ['Count Ribbiton has lost his monocle. And his temper.', 'The Count is hopping mad. Literally.'],
  },
  // Land boss for the storybook kingdoms: starts curled on top of her castle tower (see ROOST), then circles you lobbing hot
  // bonbons; every 3rd attack (2nd enraged) she rears up and rakes a sparkle line across your path with fire that hangs
  // there a moment (see RAKE). Her curled horns are breakable (a shorter curtain), her belly furnace plate is soft.
  castleDragon: {
    make: makeCastleDragon, scale: 4, crownY: 1.0, crownZ: 0.2, crownS: 0.5, radius: 20, hp: 95, speed: 32, orbit: 160, orbitRate: 0.28, dmg: 20, face: 'dragon', // 'dragon': MOVES.rake.fly turns her
    lands: ['Princess Kingdom', 'Candy Kingdom', 'Cloud Kingdom'],
    name: 'Duchess Brûlée, the Castle Dragon', short: 'Duchess Brûlée', noun: 'Duchess Brûlée',
    move: 'rake',
    desc: 'A very grand, very pink dragon who guards her castle from the top of its tallest tower. She circles you lobbing hot bonbons; when her throat glows and a line of sparkles crosses your path, she rakes it with candy-pink fire that hangs there a moment: climb or dive off the line. Snap off her horns for shorter flames; her glowing belly is soft.',
    taunts: ['Duchess Brûlée: "This castle has a strict no-fly zone. I AM the zone."', 'Duchess Brûlée: "I prefer my pilots lightly caramelized."', 'Duchess Brûlée: "My Dragonlings told me EVERYTHING."'],
    rage: ['Duchess Brûlée has flipped her tiara.', 'She is now medium-well furious.'],
  },
  // Land boss for the island seas: she starts asleep, looking like a little palm island (see NAP), then wakes and swims
  // the surface round you (sea: like the carrier, she spawns on open water and stays on it), lobbing coconuts from her
  // palms; every 3rd attack (2nd enraged) a foam ring opens on the sea ahead of you, she dives, and a Whirlpool there
  // pulls low planes in and down before she bursts up from its middle (see WHIRL). Her palms are breakable (fewer
  // coconuts), her pale throat is soft.
  islandTurtle: {
    make: makeIslandTurtle, scale: 4, crownY: 0.9, crownZ: 0.6, crownS: 0.5, radius: 26, hp: 95, speed: 22, orbit: 0, dmg: 20,
    face: 'none', ground: true, sea: true, markerUp: 40, // her move turns her
    lands: ['Tropical Archipelago'],
    name: 'Grandma Atolla, the Island Turtle', short: 'Grandma Atolla', noun: 'Grandma Atolla',
    move: 'whirl',
    desc: 'A sea turtle so old an island grew on her back: palm trees, a beach hut, the lot. She naps among the islands until you get close, then paddles after you lobbing coconuts. When a ring of foam opens on the sea ahead and she rears up, she dives and the sea there spins into a whirlpool that drags low planes in and down: climb or swing wide. Knock her palms off for fewer coconuts; her pale throat is soft.',
    taunts: ['Grandma Atolla: "Back in my day, islands stayed put."', 'Grandma Atolla: "I am three hundred years old. I have outlived worse pilots than you."', 'Grandma Atolla: "Mind the hut. My hermit crab rents it."', 'Grandma Atolla: "Slow and steady. Mostly steady."'],
    rage: ['Grandma Atolla has put her reading glasses away. Uh oh.', 'The tide has turned. So has Grandma.'],
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
const _s = new THREE.Vector3(), _t = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const FLIP = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI);

// Turn the unit vector `v` toward `to` (any length) by at most `max` rad.
function turnToward(v, to, max) {
  _a.copy(to).normalize();
  const ang = v.angleTo(_a);
  if (ang <= max) return v.copy(_a);
  _b.crossVectors(v, _a);
  if (_b.lengthSq() < 1e-8) _b.set(0, 1, 0);
  return v.applyAxisAngle(_b.normalize(), max);
}

// Distance from point `p` to the segment a-b.
function segDist(p, a, b) {
  _a.subVectors(b, a);
  const l2 = _a.lengthSq(), k = l2 ? THREE.MathUtils.clamp(_b.subVectors(p, a).dot(_a) / l2, 0, 1) : 0;
  return _b.copy(a).addScaledVector(_a, k).distanceTo(p);
}

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
  barrel: 'Mortar smashed! The fort can only manage sad little mortars now.',
  wing: 'Wing clipped! She\'s flying slower now.',
  tentacle: 'Tentacle severed! Fewer arms, fewer orbs in the spiral.',
  gun: 'Deck gun destroyed! One less cannon on that deck.',
  cannon: 'Tower cannon down! One less cannon on the walls.',
  frill: 'Frill snapped off! Less spit, same attitude.',
  crystal: 'Wingtip crystal shattered! Her shard fans are thinner now.',
  horn: 'Horn snapped off! Pharaoh Scarabus fires smaller volleys now.',
  tuft: 'Ear tuft plucked! Her gusts are narrower now.',
  crest: 'Crest popped! Count Ribbiton puffs fewer spores now.',
  dragonHorn: 'Horn snapped off! Duchess Brûlée\'s flames are shorter now.',
  palm: 'Palm tree down! Grandma Atolla has fewer coconuts to throw.',
};
// Breakaway news ({short} = the boss): when it loses you, and when it comes back.
const SHOOK_OFF = ['{short} lost you! Hull mending fast.', 'Clean getaway! {short} is sulking.', '{short} lost sight of you. Hull mending!'];
const COMING_BACK = ['{short} is back for round two!', 'Break\'s over! {short} is coming back.', '{short} wants a rematch!'];
const WAITING = ['{short} is waiting for you. Your move.', '{short} is hovering menacingly. From a polite distance.', '{short} saved you a seat. Round two starts when you say so.'];
const TOAST_GAP = 10; // s between breakaway toasts, so twins don't double up

// HMS Overkill's air wing: at most `max` Deck Fighters up at once; `launch` s off the catapult before they hunt you.
export const FIGHTERS = { max: 4, launch: 1.2, lines: ['HMS Overkill is launching fighters!', 'Fighters off the deck! The captain is showing off.', 'Two more jets off the catapults.'] };
// A part hidden under the lava (it, or the segment or head it's on): Magmadora's (see MOVES.breach.lay).
const underLava = (o) => { for (; o; o = o.parent) if (!o.visible) return true; return false; };
// Weak-point halo: its hit flash (see Enemies.animateMark).
const MARK_WHITE = new THREE.Color('#ffffff'), MARK_FLASH = 0.2; // the hit flash, s

export class Enemies {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.shots = [];
    this.spawnTimer = 6;
    this.calmTimer = 0;
    this.frenzy = null; // Hold The Line: { wave, phase, easier, burst, first, spent, score } (see WAVES)
    this.hats = false;
    this.orbGeo = new THREE.SphereGeometry(1.6, 8, 6);
    this.orbMat = new THREE.MeshBasicMaterial({ color: '#7aff5a' });
    this.introduced = new Set();
    this.intros = []; // intro lines waiting their turn (Hold The Line, see INTRO_GAP): { text, type, e, n }
    this.introN = 0; // queue order, to find the oldest
    this.introCd = 0;
    this.nibbleAt = -99; // when a Grumbling last bit you (see GRUMBLE_GAP)
    this.orbMats = new Map();
    this.breather = false; // every boss alive has lost you or is coming back (not waiting): see player.js regen
    this.shookAt = -99;
    this.shakeTold = false; // the squirrel shake-off tip (see peel), once
    this.backAt = -99;
    this.waitAt = -99;
    this.hazards = new Hazards(G); // bosses' telegraphed area attacks (see warn)
  }

  spawnBoss(kind, pos, level = 0, opts = {}) {
    const def = BOSSES[kind], mod = BOSS_MODS[opts.mod] || null;
    const mesh = new THREE.Group();
    const body = def.make(false);
    const crown = makeCrown(def.crownS);
    crown.position.set(def.crownX || 0, def.crownY, def.crownZ || 0);
    (body.userData.crownOn || body).add(crown); // on its head, for a boss whose head moves on its own (Magmadora)
    (body.userData.parts ||= []).push({ obj: crown, r: 2.4 * def.crownS, mult: 2, hp: 10, name: 'crown' });
    for (const part of body.userData.parts) if (Number.isFinite(part.hp) && part.name !== 'crown' && !part.keepHp) part.hp *= 6;
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
    BOSS_MOVES[def.move]?.spawn?.(this, e); // a boss that starts somewhere of its own (Lady Hootrude on her oak)
    return e;
  }

  // Summon helpers, capped so the sky never turns into soup.
  count(type) { return this.list.filter((x) => x.type === type).length; }
  summon(type, n, cap, at) {
    let made = 0;
    for (let k = 0; k < n && this.count(type) < cap; k++, made++) this.spawn(type, at.clone().add(new THREE.Vector3(rand(-25, 25), rand(-10, 10), rand(-25, 25))));
    return made;
  }

  // HMS Overkill launches Deck Fighters off its two bow catapults (FIGHTERS.max in the air at once): each shoots out
  // along the deck and climbs for FIGHTERS.launch s before it turns on you. Returns how many went.
  launchFighters(e) {
    const V = THREE.Vector3, fwd = new V(0, 0, 1).applyQuaternion(e.mesh.quaternion).setY(0).normalize();
    let made = 0;
    for (const x of [-2.5, 3]) {
      if (this.count('fighter') >= FIGHTERS.max) break;
      e.mesh.updateMatrixWorld();
      const f = this.spawn('fighter', e.mesh.localToWorld(new V(x, 7, 30)));
      f.launchDir = fwd.clone().add(new V(0, 0.35, 0)).normalize();
      f.launchT = FIGHTERS.launch;
      f.vel.copy(f.launchDir).multiplyScalar(TYPES.fighter.speed);
      made++;
    }
    if (made) {
      this.G.audio.noise(0.6, { vol: 0.12, freq: 1600 }); // the catapult's whoosh
      this.G.ui.notify(pick(FIGHTERS.lines), 'warn', 2.5, 0);
    }
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
      const [speed, dmg, color, size] = e.burstShot || e.def.burstShot || [105, 7, '#ff3ad0', 0.8]; // this attack's, the boss's, or the default bolt
      const from = e.def.sea ? _s.copy(e.pos).setY(e.pos.y + 13 * e.mesh.scale.x) : e.pos; // the carrier fires from its island
      this.fireOrb(from, _w.copy(p.pos).addScaledVector(p.forward, p.speed * 0.4).sub(from), speed, dmg, color, size);
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
        // Every 3rd attack: teleport instead. One due while you're turned away waits for the next attack, not 3 more.
        if (n % 3 === 0) e.blinkDue = true;
        if (e.blinkDue && charge && BOSS_MOVES.blink.start(this, e)) { e.blinkDue = false; break; }
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
          BOSS_MOVES.loom.strike(this, e); // lightning bolts along your path, each marked by yellow rings first
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
        } else e.burst = e.slow ? 2 : 3;
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
          // Pincer shots (enraged: she closes to 120 m and fires a double).
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
      case 'carrier': {
        cd = 2.6;
        // You're parked on its deck: its guns can't point that low, and the deck crew are too busy staring at you.
        if (p.landed?.deck === e) { cd = 1; break; }
        const guns = e.mesh.userData.guns.filter((g) => g.gun.visible); // shot-off guns are hidden (a wreck shows instead)
        if (n % 4 === 3 && this.launchFighters(e)) break; // fighters off the catapults
        if (n % 4 === 1 && guns.length) {
          // Broadside: every deck gun still standing fires a pair at where you're heading.
          const tgt = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 70) * 0.6);
          for (const g of guns) {
            const from = g.aim.getWorldPosition(new THREE.Vector3());
            for (let k = 0; k < 2; k++) this.fireOrb(from, _w.copy(tgt).sub(from).add(_s.set(rand(-14, 14), rand(-8, 8), rand(-14, 14))), 70, 6, '#ffb03a', 1.1);
          }
          G.audio.tone(130, 0.35, { type: 'square', vol: 0.07, slide: -60 });
        } else if (n % 4 === 2) BOSS_MOVES.steam.flak(this, e, e.enraged ? 5 : 4); // flak shells bursting along your path
        else {
          // Close-in guns on the island: a long rattle (longer once the deck guns are gone).
          e.burst = guns.length ? 8 : 12;
          e.burstShot = [110, 3, '#ffe14a', 0.7];
        }
        break;
      }
      case 'auroraRay':
        cd = 3.2; // the wing-up and fan come from her move (fans); attacks wait while she aims
        BOSS_MOVES.fans.start(this, e, n);
        break;
      case 'sunBeetle':
        cd = 2.6; // volleys; every 3rd attack calls up the mirages instead (see the mirage move)
        BOSS_MOVES.mirage.attack(this, e, n);
        break;
      case 'toadBaron':
        cd = 1.6; // spore puffs, only while he sits (a long sit gets two); every 3rd attack (2nd enraged) a tongue lash instead (see the leap move)
        BOSS_MOVES.leap.attack(this, e, n);
        break;
      case 'castleDragon':
        cd = 2.8; // bonbon volleys; every 3rd attack (2nd enraged) a rear-up and a Rake instead (see the rake move)
        BOSS_MOVES.rake.attack(this, e, n);
        break;
      case 'islandTurtle':
        cd = 2.6; // coconut volleys; every 3rd attack (2nd enraged) a Whirlpool instead (see the whirl move)
        BOSS_MOVES.whirl.attack(this, e, n);
        break;
      case 'harvestOwl':
        cd = 2.8; // acorn volleys; every 3rd attack (2nd enraged) a rear-up and a gust instead (see the gust move)
        BOSS_MOVES.gust.attack(this, e, n);
        break;
      case 'lavaSerpent':
        cd = 0.5; // she only spits at the top of an arc (her move holds every other attack)
        BOSS_MOVES.breach.spit(this, e);
        break;
      case 'fortGrump': {
        cd = 2.4;
        const u = e.mesh.userData, guns = (u.guns || []).filter((g) => g.gun.visible);
        const muzzle = u.muzzle ? u.muzzle.getWorldPosition(new THREE.Vector3()) : e.pos.clone().add(new THREE.Vector3(0, 6 * e.mesh.scale.x, 0));
        // The volley: 8 orbs, shared out among the tower cannons still standing (from their muzzles); with every tower
        // down, the great mortar fires them all; with the mortar gone too, there's no volley.
        const from = guns.length ? guns.map((g) => g.muzzle.getWorldPosition(new THREE.Vector3())) : e.disarmed ? [] : [muzzle];
        if (n % 3 === 0 && from.length) {
          for (let k = 0; k < 8; k++) {
            const at = from[k % from.length], dir = lead(0.5, 70).add(e.pos).sub(at);
            this.fireOrb(at, dir.add(new THREE.Vector3(rand(-40, 40), rand(-25, 25), rand(-40, 40))), 70, 9, '#ffb03a', 1);
          }
          for (const at of from) G.fx.emit(at, 6, { colors: ['#ffe08a', '#888888'], speed: 14, life: 0.4, size: 5 }); // muzzle flashes
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
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].planet) continue; // Grumbleglobe dozes through it (its objective holds it, objectives.js suspend)
      this.G.fx.emit(this.list[i].pos, 10, { colors: ['#ffffff', '#ffd0f4'], speed: 20, life: 0.8, size: 6 });
      this.remove(i);
    }
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
      t: Math.random() * 10, seed: Math.random() * 6.283, cd: rand(1, 3), state: 'idle', stateT: 0, quest: !!opts.quest, anchor: opts.anchor ? opts.anchor.clone() : pos.clone(), dead: false,
    };
    if (opts.scale) mesh.scale.setScalar(opts.scale);
    e.marker = makeMarker();
    this.G.scene.add(e.marker);
    this.list.push(e);
    if (!e.quest && !def.quiet && !opts.quiet && !this.introduced.has(type)) {
      this.introduced.add(type);
      this.intro(def.intro || `New enemy spotted: ${def.name}. It seems upset about something.`, false, { type });
    }
    if (def.pair && !opts.twin) this.pairUp(e, opts);
    return e;
  }

  // A new-enemy intro: at once, or in Hold The Line queued (first: to the front), shown one at a time by update()
  // (Hold The Line drops what's left when it ends). about: { type } (any of that type alive) or { e } (that one enemy):
  // what must still be alive when its turn comes. Over INTRO_MAX waiting, the oldest goes.
  intro(text, first = false, about = {}) {
    if (!this.frenzy) { this.G.ui.notify(text, 'warn', 4, 1); return; }
    const q = { text, type: about.type, e: about.e, n: this.introN++ };
    if (first) this.intros.unshift(q); else this.intros.push(q);
    if (this.intros.length > INTRO_MAX) this.intros.splice(this.intros.indexOf(this.intros.reduce((a, b) => (b.n < a.n ? b : a))), 1);
  }

  // Is a queued intro still worth showing (its enemy, or one of its type, still alive)?
  introLive(q) {
    if (q.e) return !q.e.dead && this.list.includes(q.e);
    return !q.type || this.list.some((x) => x.type === q.type && !x.dead);
  }

  // Kite Twins: a second kite across your path from the first, and the string between them (see drawString).
  pairUp(a, opts) {
    const G = this.G;
    const gap = this.roofed(a.pos) ? KITE_GAP_ROOF : KITE_GAP;
    const axis = flatForward(G.player, new THREE.Vector3()).applyAxisAngle(Y, Math.PI / 2);
    const b = this.spawn(a.type, a.pos.clone().addScaledVector(axis, gap), { ...opts, twin: a });
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: '#ffffff' }); // its own, so its red wind-up tints no other string
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false; // its two ends move every frame
    G.scene.add(line);
    const pair = { kites: [a, b], line, mat, gap, axis, centre: a.pos.clone().addScaledVector(axis, gap / 2), hitCd: 0, phase: 'park', phaseT: 0, strike: new THREE.Vector3(), back: false };
    a.pair = b.pair = pair;
    a.side = -1; b.side = 1;
    this.drawString(pair);
  }

  drawString(pair) {
    const [a, b] = pair.kites, at = pair.line.geometry.attributes.position;
    at.setXYZ(0, a.pos.x, a.pos.y, a.pos.z);
    at.setXYZ(1, b.pos.x, b.pos.y, b.pos.z);
    at.needsUpdate = true;
  }

  // One kite of a pair is gone: the string snaps, and the survivor flutters away (see behave).
  snap(e) {
    const pair = e.pair;
    this.G.scene.remove(pair.line);
    pair.line.geometry.dispose();
    pair.mat.dispose();
    for (const k of pair.kites) k.pair = null;
  }

  // Under a cave roof, a tunnel's or the sea's: no room for long strings, nor for spawns from above.
  roofed(at) { return Number.isFinite(this.G.terrain.ceilingHeight(at.x, at.z, at.y)); }

  leadK() { return this.frenzy ? RUSH_LEAD / PACE : LEAD; } // orbs fly at PACE too
  // A shooter's top speed (enemy units). In Hold The Line it keeps up with you (RUSH_KEEP × your speed), so flying
  // straight on doesn't leave it behind.
  keepUp(d) { return this.frenzy ? Math.max(d.speed, (RUSH_KEEP * this.G.player.speed) / PACE) : d.speed; }
  // A chaser's top speed (enemy units): in a wave, the wave's `chase` × your base speed (not your current one, so
  // boosting always gets away).
  chase(d) {
    const F = this.frenzy, W = F && WAVES[F.wave - 1];
    return W ? Math.max(d.speed, ((W.chase - EASIER_CHASE * F.easier) * this.G.player.baseSpeed) / PACE) : d.speed;
  }
  // The current wave's roster (in units: small fry count SMALL each), easier steps taken off.
  roster() { const F = this.frenzy; return Math.max(3, WAVES[F.wave - 1].roster - EASIER_ROSTER * F.easier); }
  // The current wave's clock (s), easier steps taken off.
  waveTime() { const F = this.frenzy; return WAVES[F.wave - 1].time * EASIER_TIME ** F.easier; }
  // Enemies of wave n still in the sky (Gary too), and the same in units.
  ofWave(n) { return this.list.filter((e) => e.wave === n && !e.quest && !e.dead); }
  unitsOf(list) { return list.reduce((s, e) => s + (SMALL[e.type] || 1), 0); }

  // Between waves (and when one restarts): every regular puffs away, no points, and the orbs in the air vanish.
  clearRegulars() {
    for (const e of this.regulars()) { this.G.fx.emit(e.pos, 10, { colors: ['#ffffff', '#ffd0f4'], speed: 20, life: 0.8, size: 6 }); this.removeEnemy(e); }
    for (const s of this.shots) this.G.scene.remove(s.mesh);
    this.shots.length = 0;
  }

  // The final wave's elite Gary (GARY), straight ahead of you, tagged with the current wave.
  spawnGary() {
    const G = this.G, p = G.player, f = flatForward(p, _v);
    const pos = p.pos.clone().addScaledVector(f, GARY.ahead);
    const g = Math.max(G.terrain.surfaceHeight(pos.x, pos.z), waterLine());
    pos.y = Math.min(Math.max(p.pos.y, g + 45), G.terrain.ceilingHeight(pos.x, pos.z) - 25);
    const e = this.spawn('rival', pos, { scale: GARY.scale, quiet: true });
    Object.assign(e, { hp: GARY.hp, maxHp: GARY.hp, elite: true, wave: this.frenzy?.wave });
    for (const part of e.mesh.userData.parts || []) if (part.name === 'prop') part.hp = GARY.prop;
    this.intro(GARY.intro, true, { e }); // his own line, not the everyday Gary's (shown while he's alive)
    return e;
  }

  // Regular (non-quest) enemies alive.
  regulars() { return this.list.filter((e) => !e.quest); }

  // Hold The Line's cap counts regulars near enough to matter: within ACTIVE_R m and not more than ACTIVE_BEHIND m
  // behind you. Small fry (gulls, bees, pebbles) count a third each.
  active() {
    const p = this.G.player, f = flatForward(p, _pp);
    let n = 0;
    for (const e of this.list) {
      if (e.quest) continue;
      _w.subVectors(e.pos, p.pos);
      if (_w.lengthSq() > ACTIVE_R * ACTIVE_R || _w.dot(f) < -ACTIVE_BEHIND) continue;
      n += SMALL[e.type] || 1;
    }
    return n;
  }

  // Hold The Line: stragglers far away behind you leave quietly (no score), making room. One the current wave sent
  // comes back round a flank instead (RUSH_RETURN m off), so outflying a wave never clears it.
  sweep() {
    const G = this.G, p = G.player, f = flatForward(p, _pp);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.quest || e.latched || e.state === 'falling') continue;
      _w.subVectors(e.pos, p.pos);
      if (_w.lengthSq() <= STRAGGLER * STRAGGLER || _w.dot(f) >= 0) continue;
      if (e.wave !== this.frenzy.wave) { this.remove(i); continue; }
      _s.copy(f).applyAxisAngle(Y, (Math.random() < 0.5 ? -1 : 1) * FLANK_YAW).multiplyScalar(RUSH_RETURN).add(p.pos);
      const g = Math.max(G.terrain.surfaceHeight(_s.x, _s.z), waterLine());
      _s.y = e.def.ground || e.def.vent ? g : Math.min(Math.max(p.pos.y, g + 45), G.terrain.ceilingHeight(_s.x, _s.z) - 25);
      _t.subVectors(_s, e.pos);
      for (const k of e.pair ? e.pair.kites : [e]) { k.pos.add(_t); k.vel.set(0, 0, 0); }
      if (e.pair) e.pair.centre.add(_t);
    }
  }

  // A weighted random type that may spawn here and now (`only`: from this list). In a frenzy the score gates are
  // 0.4 × minScore, and RUSH_FREE types have none. A forced pick (`only`) ignores the score if nothing on its list is
  // unlocked yet.
  pickType(only = null) {
    const G = this.G, gate = this.frenzy ? 0.4 : 1;
    const ok = ([k, d], g) => d.weight > 0 && G.score >= d.minScore * (this.frenzy && RUSH_FREE.includes(k) ? 0 : g) && G.zones.allowsEnemy(d) && (!d.lands || d.lands.includes(G.zones.current.name)) && (!only || only.includes(k)) && !(d.max && this.count(k) >= d.max);
    let avail = Object.entries(TYPES).filter((t) => ok(t, gate));
    if (!avail.length && only) avail = Object.entries(TYPES).filter((t) => ok(t, 0));
    if (!avail.length) return null;
    let r = Math.random() * avail.reduce((s, [, d]) => s + d.weight, 0);
    for (const [k, d] of avail) { r -= d.weight; if (r <= 0) return k; }
    return avail[0][0];
  }

  maybeSpawn(dt) {
    const G = this.G, p = G.player, F = this.frenzy;
    if (this.calmTimer > 0 || p.dead || G.relax || this.planet()) return; // the planet fight brings its own company
    if (F && F.phase !== 'wave') return; // the countdown, a wave's result: a breather
    if (F) this.sweep();
    const W = F && WAVES[F.wave - 1], easier = F?.easier || 0;
    if (W && F.spent >= this.roster()) return; // the wave has sent everyone it had
    // Wave 4 opens with three groups at once: ahead, left and right.
    if (F?.burst) { F.burst = false; for (const side of [0, -1, 1]) this.spawnGroup(this.pickType(W.only), side ? 'flank' : 'front', side); }
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    // Out of a frenzy enemies arrive every 3-6 s (enemy time); a wave's interval is in real s (dt runs at PACE).
    this.spawnTimer = W ? rand(...W.every) * PACE * EASIER_SLOW ** easier : rand(3, 6);
    const max = W ? Math.max(2, W.cap - EASIER_CAP * easier) + (W.bonus ? Math.min(4, Math.floor(F.score / 600)) : 0) : 3 + Math.min(7, Math.floor(G.score / 400));
    if ((W ? this.active() : this.regulars().length) >= max) return;
    const needShooter = W?.shooter && !this.list.some((e) => !e.quest && SHOOTERS.includes(e.type));
    // A shooter from the wave's list if one's due (else any shooter), else anything on the list, else anything at all.
    const only = W?.only;
    let type = (needShooter && (this.pickType(only ? SHOOTERS.filter((k) => only.includes(k)) : SHOOTERS) || this.pickType(SHOOTERS))) || this.pickType(only) || this.pickType();
    // Less than one left on the roster: no pair (two at once would take it more than 1 past). Swarms get trimmed
    // (placeGroup).
    if (W && TYPES[type]?.pair && this.roster() - F.spent < 1) type = this.pickType((only || Object.keys(TYPES)).filter((k) => !TYPES[k].pair));
    if (!type) return;
    const r = Math.random(), first = F?.first;
    if (F) F.first = false; // a wave's first group comes from ahead, where you see it
    this.spawnGroup(type, !W || first ? 'front' : r < W.above && !this.roofed(p.pos) ? 'above' : r < W.above + W.flank ? 'flank' : 'front');
  }

  // One spawn of `type` (a swarm, a kite pair or a single enemy), from 'front' (in view ahead), 'flank' (±70° off your
  // heading; side -1 left, 1 right, 0 either) or 'above' (overhead, a little ahead). Never past the CEILING. In a wave
  // each one is tagged with it (e.wave) and counts toward its roster.
  spawnGroup(type, from = 'front', side = 0) {
    const G = this.G, p = G.player, def = TYPES[type], F = this.frenzy, n0 = this.list.length;
    if (!def) return;
    this.placeGroup(type, def, from, side);
    if (!F) return;
    const fresh = this.list.slice(n0);
    for (const e of fresh) e.wave = F.wave;
    F.spent = (F.spent || 0) + this.unitsOf(fresh);
  }

  // spawnGroup's placing: where the group appears, and how many of it (a swarm, a pair, one).
  placeGroup(type, def, from, side) {
    const G = this.G, p = G.player;
    // In a wave a swarm is no bigger than what's left of its roster (so the last group never takes it 1 past it).
    const F = this.frenzy, left = F ? Math.ceil((this.roster() - (F.spent || 0)) / (SMALL[type] || 1) - 1e-6) : Infinity;
    const room = CEILING - this.regulars().length, n = Math.max(1, Math.min(SWARMS[type] || (def.pair ? 2 : 1), def.pair ? 2 : left));
    if (room < (def.pair ? 2 : 1)) return;
    const f = flatForward(p, _v);
    let d = this.frenzy ? rand(...RUSH_AHEAD) : rand(300, 500), lateral = this.frenzy ? (Math.random() < 0.5 ? -1 : 1) * rand(...(WAVES[this.frenzy.wave - 1]?.spread || [0, RUSH_SPREAD])) : rand(-130, 130);
    if (from === 'flank') {
      f.applyAxisAngle(Y, (side || (Math.random() < 0.5 ? -1 : 1)) * FLANK_YAW);
      d = rand(...RUSH_FLANK);
      lateral = rand(-40, 40);
    } else if (from === 'above') { d = rand(120, 240); lateral = rand(-80, 80); }
    _w.set(-f.z, 0, f.x);
    // Ahead it's inside the camera's view, so you see them coming.
    const pos = p.pos.clone().addScaledVector(f, d).addScaledVector(_w, lateral);
    const g = Math.max(G.terrain.surfaceHeight(pos.x, pos.z), waterLine());
    if (def.ground) {
      if (G.terrain.surfaceHeight(pos.x, pos.z) < waterLine()) return; // cannons can't swim (on a seabed they don't have to)
      if (!this.isGentleGround(pos.x, pos.z)) return; // on a steep slope the barrel would sink into the hill
      pos.y = g;
    } else if (def.vent) pos.y = g; // a Magma Spitter lives in the lava, or in a rock vent
    else if (from === 'above') pos.y = Math.max(p.pos.y + RUSH_ABOVE, g + 45);
    else pos.y = Math.min(Math.max(p.pos.y + (this.frenzy ? rand(-RUSH_RISE, RUSH_RISE) : rand(-15, 35)), g + 45), G.terrain.ceilingHeight(pos.x, pos.z) - 25);
    if (def.pair) this.spawn(type, pos);
    else if (n > 1) for (let k = 0; k < Math.min(n, room); k++) this.spawn(type, pos.clone().add(new THREE.Vector3(rand(-25, 25), rand(-8, 8), rand(-25, 25))));
    else this.spawn(type, pos);
  }

  // Grumbleglobe (planetboss.js) while it's in the sky and awake, else null.
  planet() { return this.list.find((e) => e.planet && !e.planet.dozing)?.planet || null; }

  // Close enough to a planet boss to crash into it? The pull-up warning's probes ask this (pullup.js).
  solidAt(at) { return this.list.some((e) => e.planet && e.planet.inside(at)); }

  // After a crash, a planet fight puts you back out where you can see it (Player.update): `at` is where you went down.
  placeRespawn(p, at) { for (const e of this.list) if (e.planet) e.planet.respawn(p, at); }

  update(dt) {
    const G = this.G, p = G.player, real = dt;
    dt *= PACE * G.powerups.enemyTimeScale(); // Slow-Mo / Time Freeze power-ups
    this.calmTimer = Math.max(0, this.calmTimer - dt);
    this.introCd -= real;
    while (this.intros.length && this.introCd <= 0) { // skip intros whose enemies are gone
      const q = this.intros.shift();
      if (this.introLive(q)) { this.G.ui.notify(q.text, 'warn', 4, 1); this.introCd = INTRO_GAP; }
    }
    this.maybeSpawn(dt);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      // The planet boss runs itself (collisions and bullets in real time); true once it has broken up.
      if (e.planet) { if (e.planet.update(dt, real)) this.kill(i, true); continue; }
      e.t += dt;
      e.stateT += dt;
      const toP = _v.subVectors(p.pos, e.pos);
      const dist = toP.length();
      const calm = this.calmTimer > 0 && !e.quest;
      if (!e.quest && dist > 1700 && !(this.frenzy && e.wave === this.frenzy.wave)) { this.remove(i); continue; } // a wave's own: see sweep
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
      if (e.boom) { this.mineBlast(e); this.kill(i, false); continue; }

      e.pos.addScaledVector(e.vel, dt);
      if (e.def.swim) { /* its move sets its whole path, in and out of the lava */ }
      else if (e.def.sea) e.pos.y = waterLine(); // afloat (its move keeps it on open water)
      else if (e.def.hop) e.vel.set(0, 0, 0); // Count Ribbiton: his move sets his height (sitting, or in a hop), and nothing else moves him
      else if (e.def.ground) e.pos.y = G.terrain.surfaceHeight(e.pos.x, e.pos.z) - 0.5;
      else if (e.def.vent) e.pos.y = Math.max(G.terrain.surfaceHeight(e.pos.x, e.pos.z), waterLine()) - 0.5; // in the lava (or rock)
      else {
        const g = Math.max(G.terrain.surfaceHeight(e.pos.x, e.pos.z, e.pos.y), waterLine()) + (e.boss ? e.radius : 12); // tunnels: enemies can follow you in
        if (e.state === 'falling' && e.pos.y <= g) { G.fx.explosion(e.pos); this.kill(i, true); continue; }
        if (e.pos.y < g) { e.pos.y = g; if (e.vel.y < 0) e.vel.y = 0; }
        const roof = G.terrain.ceilingHeight(e.pos.x, e.pos.z, e.pos.y) - (e.boss ? e.radius : 10);
        if (e.pos.y > roof) { e.pos.y = Math.max(roof, g); if (e.vel.y > 0) e.vel.y = 0; }
      }
      this.animate(e, dt);
      if (e.marker) {
        e.marker.position.set(e.pos.x, e.pos.y + (e.def.markerUp ?? e.radius * (e.mesh.scale.x || 1)) + 6, e.pos.z);
        e.marker.visible = dist > 70 && !calm && !(e.mv?.mir > 0); // (no marker on the real Sun Beetle among its mirages)
      }

      // Player contact.
      e.contactCd = Math.max(0, (e.contactCd || 0) - dt);
      // A boss with a solid hull (the carrier) is touched where its boxes are, not inside a sphere round its middle.
      // Parked on its deck (the secret, player.js) isn't touching it, and above the deck only its island is solid (so you
      // can come in low over the stern to land). Coming down through the deck is.
      const above = e.def.deck && p.pos.y > e.pos.y + e.def.deck.y * e.mesh.scale.x;
      const touching = p.landed?.deck === e ? false
        : e.def.swim ? BOSS_MOVES.breach.touches(e, p.pos, 4 * p.sizeScale)
        : e.mesh.userData.turtle && e.mv?.pool ? false // Grandma Atolla under her Whirlpool (her snap does the biting)
        : e.def.boxes ? dist < e.radius * 1.8 && this.inHull(e, p.pos, 4 * p.sizeScale, above ? e.def.deck.solid : e.def.boxes) : dist < e.radius + 4 * p.sizeScale;
      if (e.def.boxes && touching && !p.dead && !calm) this.bumpOffHull(e);
      if (!p.dead && !calm && touching && e.contactCd <= 0) {
        // Mega Ram flattens anything smaller than a boss (for bonus points), and rams a boss (see ram).
        if (G.powerups.has('mega') && !e.boss) { e.rammed = true; G.fx.explosion(e.pos); G.shake?.(0.5, 0.15); this.kill(i, true); continue; }
        if (G.powerups.has('mega') && !e.planet) this.ram(e, toP);
        else {
        e.contactCd = 1.5; // big enemies bump you once, not every frame
        // A clump of Grumblings costs one or two bites, not six: GRUMBLE_GAP s after one gets you, the next ones don't.
        const nibble = e.def.squeak && G.time - this.nibbleAt < GRUMBLE_GAP;
        if (e.def.squeak && !nibble) this.nibbleAt = G.time;
        if (!nibble) p.damage(e.dash > 0 && e.def.dashDmg ? e.def.dashDmg : e.def.dmg); // dashDmg: a glancing bump mid-strafe (Gary's cut)
        if (e.dash > 0 || e.mv?.charge) {
          e.dash = 0;
          if (e.mv) e.mv.charge = false;
          if (e.kind === 'seagullSteven' && p.boost > 0.1) { p.boost = 0; G.ui.notify('Steven stole your boost. And your chips. Mostly the chips.', 'bad', 3); }
        }
        if (e.def.kamikaze) { this.burst(e); this.kill(i, false); continue; }
        e.vel.copy(toP).normalize().multiplyScalar(-60);
        }
      }
      // Bullets: weak points and breakable parts first, then the body. A moth on your wing is out of your line of fire.
      const broad = e.latched ? -1 : (e.def.reach ? e.def.reach * e.mesh.scale.x / e.def.scale : e.radius * 1.8 + 3) ** 2;
      for (let b = p.bullets.length - 1; b >= 0; b--) {
        const bp = p.bullets[b].pos;
        if (bp.distanceToSquared(e.pos) > broad) continue;
        const part = this.hitPart(e, bp);
        if (!part && (e.def.boxes ? !this.inHull(e, bp, 2) : bp.distanceToSquared(e.pos) > (e.radius + 2) ** 2)) continue;
        if (this.guarded(e, p.bullets[b], bp)) { p.removeBullet(b); continue; }
        if (e.shield === 0 && (!e.boss || e.def.swim)) { p.removeBullet(b); G.fx.sparkle(bp, '#9aa0a6'); continue; } // a Magma Spitter (or Magmadora) under the lava
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
      if (e.hp <= 0) { if (e.def.swim) BOSS_MOVES.breach.surface(e); G.fx.explosion(e.pos); G.fx.confetti(e.pos); this.kill(i, true); }
    }
    const bosses = this.list.filter((e) => e.boss && !e.dead);
    // Faster mending only while it has lost you or is coming back: shadowing you from its standoff isn't a rest.
    this.breather = bosses.length > 0 && bosses.every((e) => (e.planet ? e.planet.far : e.chase === 'loose' || e.chase === 'catch')); // a planet: you're out of its range
    this.updateShots(dt);
    this.hazards.update(dt);
  }

  // Is `pos` inside one of the boss's hull boxes (def.boxes, or just `boxes`; model units), padded by `pad` m?
  inHull(e, pos, pad = 0, boxes = e.def.boxes) {
    const s = e.mesh.scale.x, k = pad / s;
    e.mesh.updateMatrixWorld();
    e.mesh.worldToLocal(_pp.copy(pos));
    return boxes.some(([x0, x1, y0, y1, z0, z1]) => _pp.x > x0 - k && _pp.x < x1 + k && _pp.y > y0 - k && _pp.y < y1 + k && _pp.z > z0 - k && _pp.z < z1 + k);
  }

  // A flight deck under `pos` (a live boss with def.deck, the carrier): { e, y (deck top, world m), local (model units,
  // written into `out`), spot: deckSpot's { at, wire } }, or null.
  deckAt(pos, out = new THREE.Vector3()) {
    for (const e of this.list) {
      const d = this.deckOf(e, pos, out);
      if (d) return d;
    }
    return null;
  }

  // The same, for one boss.
  deckOf(e, pos, out = new THREE.Vector3()) {
    if (!e.def.deck || e.dead || pos.distanceToSquared(e.pos) > (e.radius * 1.8) ** 2) return null;
    e.mesh.updateMatrixWorld();
    e.mesh.worldToLocal(out.copy(pos));
    const spot = deckSpot(out.x, out.z);
    return spot && { e, y: e.pos.y + e.def.deck.y * e.mesh.scale.x, local: out, spot };
  }

  // A plane that flies into the hull is lifted out over the deck (it's solid). A gentle one lands on it (player.js).
  bumpOffHull(e) {
    const p = this.G.player, s = e.mesh.scale.x;
    e.mesh.worldToLocal(_pp.copy(p.pos));
    const top = e.def.boxes.reduce((t, b) => (_pp.x > b[0] && _pp.x < b[1] && _pp.z > b[4] && _pp.z < b[5] ? Math.max(t, b[3]) : t), e.def.boxes[0][3]);
    const y = e.pos.y + top * s + 6 * p.sizeScale;
    if (p.pos.y < y) { p.pos.y = y; p.prevPos.y = Math.max(p.prevPos.y, y); }
  }

  hitPart(e, pos) {
    const parts = e.mesh.userData.parts;
    if (!parts) return null;
    const s = e.mesh.scale.x;
    let best = null, bd = Infinity;
    for (const part of parts) {
      if (part.broken || (e.def.swim && underLava(part.obj))) continue; // Magmadora's parts under the lava
      part.obj.getWorldPosition(_pp);
      const d = _pp.distanceToSquared(pos), r = part.r * s + 1.5;
      if (d < r * r && d < bd) { bd = d; best = part; }
    }
    return best;
  }

  damagePart(e, part, dmg, pos) {
    const G = this.G;
    e.hp -= dmg * part.mult;
    if (part.mult > 1 || part.counted) { // counted: a planet gadget, whose every hit drains the bar whatever its mult
      if (part.mark) part.hitT = MARK_FLASH; // the halo flashes white
      G.fx.sparkle(pos, '#ffd23a');
      G.fx.emit(pos, 12, { colors: ['#ffffff', '#ffd23a'], speed: 45, life: 0.4, size: 5 });
      G.audio.tone(1500, 0.07, { type: 'triangle', vol: 0.05 });
      if (!this.weakTip && !e.planet) { this.weakTip = true; G.ui.notify('WEAK SPOT! Glowing parts take extra damage. Aim there.', 'good', 4, 1); }
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
    if (part.wreck) part.wreck.visible = true; // a carrier gun leaves a smoking wreck
    part.obj.getWorldPosition(_pp);
    G.fx.explosion(_pp);
    G.audio.pop();
    (e.broken ||= {})[part.name] = (e.broken[part.name] || 0) + 1;
    if (e.planet) { e.planet.broke(part); return; } // Grumbleglobe scores and announces its own gadgets
    const n = e.broken[part.name];
    const total = e.mesh.userData.parts.filter((x) => x.name === part.name).length;
    G.score += e.boss ? 40 : 10;
    G.fx.popText(_pp, e.boss ? '+40' : '+10');
    switch (part.name) {
      case 'rotor': if (e.boss) e.hp -= e.maxHp * 0.06; else if (n >= 2) e.state = 'falling'; break;
      // A boss (or Hold The Line's elite Gary) doesn't drop out of the sky from one part: it slows down and takes a
      // chunk of damage instead.
      case 'prop': if (e.boss || e.elite) { e.slow = 0.7; e.hp -= e.maxHp * 0.1; } else e.state = 'falling'; break;
      case 'gondola': e.noBombs = true; break;
      case 'barrel': e.disarmed = true; if (e.boss) e.hp -= e.maxHp * 0.1; break;
      case 'fin': if (e.boss) e.hp -= e.maxHp * 0.03; break;
      case 'tentacle': if (n >= total) e.noZap = true; if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'claw': if (e.boss) e.hp -= e.maxHp * 0.1; break;
      case 'puff': e.radius *= 0.9; if (!e.boss && n >= total) e.hp = 0; else if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'crown': e.vulnerable = 1.3; break;
      case 'turret': if (e.boss) e.hp -= e.maxHp * 0.02; break;
      case 'gun': if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'cannon': if (e.boss) e.hp -= e.maxHp * 0.03; break;
      case 'frill': if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'crystal': if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'horn': if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'tuft': if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'crest': if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'dragonHorn': if (e.boss) e.hp -= e.maxHp * 0.04; break;
      case 'palm': if (e.boss) e.hp -= e.maxHp * 0.04; break;
    }
    // Every boss break is news; regular enemies only mention the dramatic ones, quietly.
    const text = (e.elite && part.name === 'prop' && GARY.propText) || (e.boss && BOSS_BREAK_TEXT[part.name]) || BREAK_TEXT[part.name];
    if (text && (e.boss || ['prop', 'gondola', 'barrel', 'rotor'].includes(part.name))) G.ui.notify(text, 'good', 3, e.boss || e.elite ? 1 : 0);
  }

  behave(e, toP, dist, dt) {
    const G = this.G, p = G.player, d = e.def;
    const steer = (desired, k = 2) => e.vel.lerp(desired, 1 - Math.exp(-dt * k));
    // Land enemies share three moves (TYPES `act`): swoop (Ember Bats), ambush (Magma Spitters), charge (Comet Chargers).
    if (d.act === 'swoop') return this.emberBat(e, toP, dist, dt, steer);
    if (d.act === 'ambush') return this.magmaSpitter(e, dist, dt);
    if (d.act === 'charge') return this.cometCharger(e, toP, dist, dt, steer);
    switch (e.type) {
      case 'drone':
        steer(_w.copy(toP).normalize().multiplyScalar(this.chase(d)).add(new THREE.Vector3(Math.sin(e.t * 2) * 10, Math.cos(e.t * 3) * 6, 0)), 1.5);
        break;
      case 'mine':
        if (e.fuse === undefined && dist < MINE.arm && !p.dead) { e.fuse = MINE.fuse; e.blink = false; }
        if (e.fuse !== undefined) { this.mineFuse(e, dt); break; }
        if (dist < 120) steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 1);
        else steer(_w.set(0, Math.sin(e.t) * 3, 0), 1);
        break;
      case 'gull':
        if (e.state === 'idle') {
          steer(_w.set(Math.cos(e.t * 0.8) * 30, Math.sin(e.t) * 4, Math.sin(e.t * 0.8) * 30));
          if (dist < 260) { e.state = 'dive'; e.stateT = 0; }
        } else if (e.state === 'dive') {
          steer(_w.copy(toP).normalize().multiplyScalar(this.chase(d)), 3);
          if (e.stateT > 4) { e.state = 'leave'; e.stateT = 0; }
        } else {
          steer(_w.copy(toP).normalize().multiplyScalar(-d.speed).setY(15), 2);
          if (e.stateT > 5) { e.state = 'idle'; e.stateT = 0; }
        }
        break;
      case 'ufo': {
        _w.copy(toP).setY(0).normalize().multiplyScalar(-170).add(p.pos).setY(p.pos.y + 45).sub(e.pos);
        steer(_w.clampLength(0, this.keepUp(d)), 1.2);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 450) {
          e.cd = 2.8;
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 65) * this.leadK());
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
        steer(_w.copy(toP).normalize().multiplyScalar(this.chase(d)).add(new THREE.Vector3(Math.sin(e.t * 9) * 18, Math.cos(e.t * 7) * 10, Math.cos(e.t * 8) * 18)), 2.5);
        break;
      case 'blimp':
        _w.copy(p.pos).addScaledVector(p.forward, 120).setY(p.pos.y + 70).sub(e.pos);
        steer(_w.clampLength(0, this.keepUp(d)), 0.5);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 350 && !e.noBombs) {
          e.cd = 3;
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 45) * this.leadK());
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
          const lead = p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 60) * this.leadK());
          this.fireOrb(e.pos.clone().add(new THREE.Vector3(0, 5, 0)), lead.sub(e.pos), 60, 12, '#ff4d4d', 1.2);
          G.audio.tone(140, 0.25, { type: 'square', vol: 0.06, slide: -60 });
        }
        break;
      case 'fighter':
        // Off the catapult: straight out along the deck and climbing for a moment, then it turns on you.
        if (e.launchT > 0) { e.launchT -= dt; steer(_w.copy(e.launchDir).multiplyScalar(d.speed), 3); break; }
        if (e.state !== 'extend') {
          steer(_w.copy(toP).normalize().multiplyScalar(d.speed), 1.4);
          e.cd -= dt;
          if (e.cd <= 0 && dist < 240 && e.vel.dot(toP) > 0.8 * e.vel.length() * dist) {
            e.cd = 2.2;
            for (let k = 0; k < 2; k++) setTimeout(() => !e.dead && this.fireOrb(e.pos, _w.copy(p.pos).sub(e.pos), 100, 4, '#ffb03a', 0.6), k * 150);
          }
          if (dist < 45 || e.stateT > 7) { e.state = 'extend'; e.stateT = 0; }
        } else {
          steer(_w.copy(toP).normalize().multiplyScalar(-d.speed).setY(10), 1.2);
          if (e.stateT > 3.5) { e.state = 'idle'; e.stateT = 0; }
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
      case 'umbrella': {
        // Closes in to ~120 m (it never backs off) and circles you slowly. The umbrella swings round to face you, but not
        // quickly: fly past (or round) it and its back is open.
        turnToward(e.face ||= toP.clone().normalize(), toP, UMBRELLA_TURN * dt);
        _w.copy(toP).multiplyScalar(Math.max(0, dist - 120) / Math.max(dist, 1)).add(_pp.set(-toP.z, 0, toP.x).normalize().multiplyScalar(12));
        _w.y += (p.pos.y + 15 - e.pos.y) * 0.5;
        steer(_w.clampLength(0, this.keepUp(d)), 1.2);
        e.cd -= dt;
        if (e.cd <= 0 && dist < 420 && !p.dead) {
          e.cd = 2.6;
          this.fireOrb(e.pos, p.pos.clone().addScaledVector(p.forward, p.speed * (dist / 60) * this.leadK()).sub(e.pos), 60, d.dmg, '#5ab0ff', 1);
          G.audio.tone(420, 0.2, { type: 'sine', vol: 0.05, slide: 200 });
        }
        break;
      }
      case 'grudgeRock':
        // Bobs toward you, slowly. A bump just bounces off: breaking it is where the trouble starts (see kill).
        steer(_w.copy(toP).normalize().multiplyScalar(d.speed).add(_pp.set(0, Math.sin(e.t * 1.5) * 6, 0)), 0.8);
        break;
      case 'pebble':
        // Scatters from the break for 0.8 s (real), then homes in.
        if (e.stateT < 0.8 * PACE) e.vel.multiplyScalar(Math.exp(-dt * 1.5));
        else steer(_w.copy(toP).normalize().multiplyScalar(this.chase(d)).add(_pp.set(Math.sin(e.t * 7) * 8, Math.cos(e.t * 6) * 5, 0)), 2.5);
        break;
      case 'grumbling':
        // Scatters out of its pore for 0.8 s (real), then cuts across in front of your nose (where you'll be in
        // GRUMBLE_LEAD s), each aiming at its own spot round that point and wiggling to its own beat (e.seed), so they
        // swarm rather than stack. Grumbleglobe sends off the ones that hang about too long (planetboss.js).
        if (e.stateT < 0.8 * PACE) e.vel.multiplyScalar(Math.exp(-dt * 1.5));
        else {
          const k = GRUMBLE_SPREAD, s = e.seed;
          _w.copy(p.pos).addScaledVector(p.forward, p.speed * GRUMBLE_LEAD).add(_pp.set(Math.sin(s + e.stateT * 0.8) * k, Math.cos(s * 1.7 + e.stateT * 0.6) * k * 0.6, Math.cos(s + e.stateT * 0.8) * k));
          steer(_w.sub(e.pos).normalize().multiplyScalar(d.speed).add(_pp.set(Math.sin(e.t * 7 + s) * 10, Math.cos(e.t * 6 + s * 1.7) * 7, 0)), 2.5);
        }
        break;
      case 'sniperOwl': {
        // Holds 320-380 m off (200-240 under a roof). Closer than 250 m (160) it backs off at 0.7 × your speed: catchable.
        const roof = this.roofed(e.pos), near = roof ? 160 : 250, r = Math.max(dist, 1);
        if (dist < near) _w.copy(toP).multiplyScalar(-(0.7 * p.speed) / PACE / r);
        else {
          const hold = THREE.MathUtils.clamp(dist, roof ? 200 : 320, roof ? 240 : 380);
          _w.copy(toP).multiplyScalar(THREE.MathUtils.clamp((dist - hold) * 0.5, -Math.min(d.speed, (0.7 * p.speed) / PACE), this.keepUp(d)) / r);
        }
        _w.y += (p.pos.y + 30 - e.pos.y) * 0.4;
        steer(_w, 2);
        this.aim(e, dist, dt);
        break;
      }
      case 'kites': {
        const pair = e.pair;
        if (!pair) {
          // The string snapped: the survivor flutters away.
          steer(_w.copy(toP).normalize().multiplyScalar(-d.speed).add(_pp.set(Math.sin(e.t * 5) * 10, 5, Math.cos(e.t * 4) * 10)), 1.5);
          break;
        }
        if (pair.kites[0] === e) this.flyPair(pair, dt);
        // Each kite holds its end of the string (keeping up with a lunge).
        const fast = pair.phase === 'snap' || pair.back;
        _w.copy(pair.centre).addScaledVector(pair.axis, (e.side * pair.gap) / 2).sub(e.pos).multiplyScalar(fast ? 6 : 2);
        steer(_w.clampLength(0, fast ? KITE_LUNGE * 1.5 : Math.max(d.speed, (KITE_KEEP * p.speed) / PACE) * 3), fast ? 8 : 3);
        break;
      }
      case 'moth':
        e.contactCd = Infinity; // it never bumps you: it latches on
        if (e.latched) { this.cling(e, dt); break; }
        // Flutters at you, erratically.
        steer(_w.copy(toP).normalize().multiplyScalar(d.speed).add(_pp.set(Math.sin(e.t * 6.3) * 25, Math.sin(e.t * 4.1) * 15, Math.cos(e.t * 5.7) * 25)), 2.5);
        if (!p.dead && !p.dodging && dist < e.radius + 5 * p.sizeScale && !this.list.some((x) => x.latched)) {
          if (G.powerups.has('mega')) { this.unlatch(e, true); break; } // too big to cling to: it bounces off for points
          e.latched = true;
          e.tank = p.boost;
          G.ui.notify('A Clingy Moth latched on! It\'s draining your boost. Do a stunt (barrel roll, loop) to break up with it.', 'bad', 3, 1);
          G.audio.tone(700, 0.25, { type: 'triangle', vol: 0.05, slide: -300 });
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

  // Ember Bat (see BAT): circles ahead of you trailing sparks; now and then it stops, flares (eyes and a chirp) and
  // swoops at you, trailing more.
  emberBat(e, toP, dist, dt, steer) {
    const G = this.G, p = G.player, d = e.def, S = SQUIRREL, shy = d.tailShy;
    // Where it is round your nose: 1 dead ahead, -1 right behind (tail-shy swoopers only care, see SQUIRREL).
    const nose = shy ? -toP.dot(p.forward) / Math.max(dist, 1) : 1;
    if (shy) {
      if (e.state === 'peel') return this.peelBack(e, nose, dist, dt, steer);
      e.restT = Math.max(0, (e.restT || 0) - dt);
      const onTail = !p.dead && nose < S.behind && dist < S.near && e.state !== 'flare';
      e.tailT = onTail ? (e.tailT || 0) + dt : 0;
      // A dive that ends up behind you before it commits has lost you, too.
      if (onTail && (p.maneuver || e.tailT >= S.tail || (e.state === 'swoop' && !e.commit))) return this.peel(e, !!p.maneuver);
    }
    if (Math.random() < dt * (e.state === 'swoop' ? 30 : 8)) G.fx.emit(e.pos, 1, { colors: d.trail || ['#ff6a1a', '#ffb03a', '#ffe14a'], speed: 4, life: 0.6, size: e.state === 'swoop' ? 6 : 4 });
    if (e.state === 'flare') {
      e.vel.multiplyScalar(Math.exp(-dt * 6));
      e.mesh.scale.setScalar(e.baseScale * (1 + 0.25 * Math.sin(e.stateT * 40))); // a shiver: here it comes
      if (e.stateT >= BAT.flare) { e.state = 'swoop'; e.stateT = 0; e.mesh.scale.setScalar(e.baseScale); }
    } else if (e.state === 'swoop') {
      // A tail-shy one commits inside S.commit m: straight at where you were, no more homing.
      if (shy && !e.commit && dist < S.commit) { e.commit = true; e.vel.copy(toP).normalize().multiplyScalar(this.chase(d) * BAT.swoop); }
      if (!e.commit) steer(_w.copy(toP).normalize().multiplyScalar(this.chase(d) * BAT.swoop), 3.5);
      if (e.stateT > BAT.swoopT) { e.state = 'idle'; e.stateT = 0; e.commit = false; e.cd = rand(...BAT.every); }
    } else {
      const a = e.t * 1.3 + e.seed;
      _w.copy(p.pos).addScaledVector(flatForward(p, _s), BAT.ahead).add(_pp.set(Math.cos(a) * BAT.ring, 10 + Math.sin(e.t * 2.3 + e.seed) * 8, Math.sin(a) * BAT.ring)).sub(e.pos);
      if (shy && nose < 0) this.besideYou(e, nose).sub(e.pos); // behind you, it comes round wide, not through you
      steer(_w.multiplyScalar(1.5).clampLength(0, this.chase(d) * 1.2), 2);
      e.cd -= dt;
      // One bat at a time flares (the swarm takes turns).
      if (e.cd <= 0 && dist < BAT.range && !p.dead && (!shy || (nose > S.front && e.restT <= 0)) && !this.list.some((x) => x !== e && x.type === e.type && x.state === 'flare')) {
        e.state = 'flare'; e.stateT = 0; e.baseScale = e.mesh.scale.x;
        G.fx.emit(e.pos, 8, { colors: d.trail || ['#ff6a1a', '#ffb03a', '#ffe14a'], speed: 10, life: 0.5, size: 5 }); // a sparkle: this one's next
        G.audio.tone(d.chirp || 1500, 0.12, { type: 'square', vol: 0.04, slide: 900 });
      }
    }
  }

  // A tail-shy swooper loses its glide (see SQUIRREL): a puff of fur, a sliding chirp, and off it tumbles. `shaken`: you
  // did a stunt (the first time, you hear why it worked). No points: the reward is a squirrel back in front of your guns.
  peel(e, shaken) {
    const G = this.G, d = e.def;
    e.state = 'peel'; e.stateT = 0; e.tailT = 0; e.commit = false;
    e.contactCd = Infinity; // harmless until it's back in front (peelBack clears it)
    G.fx.emit(e.pos, 10, { colors: d.trail || ['#c49a5a', '#e8c49a'], speed: 9, life: 0.6, size: 5 });
    G.audio.tone((d.chirp || 1500) * 1.2, 0.18, { type: 'triangle', vol: 0.04, slide: -900 });
    if (shaken && !this.shakeTold) { this.shakeTold = true; G.ui.notify('Shook it off! Squirrels hate barrel rolls.', 'good', 2.5, 0); }
  }

  // Where a tail-shy swooper behind you heads (into _w): SQUIRREL.wide m out to its side of you, a little ahead and up;
  // once it's in front, on round to the ring ahead.
  besideYou(e, nose) {
    const p = this.G.player, f = flatForward(p, _s);
    e.side ??= Math.random() < 0.5 ? -1 : 1;
    return _w.copy(p.pos).add(_pp.set(-f.z, 0, f.x).multiplyScalar(e.side * SQUIRREL.wide).setY(10)).addScaledVector(f, nose < SQUIRREL.front ? 20 : BAT.ahead);
  }

  // Peeling off: a short tumble, then out wide beside you and round to the ring ahead. Done once it's in front again.
  peelBack(e, nose, dist, dt, steer) {
    const S = SQUIRREL;
    if (e.stateT < S.tumble) { e.tumble = (e.tumble || 0) + dt * 14; e.vel.multiplyScalar(Math.exp(-dt * 3)); e.vel.y -= 25 * dt; return; }
    e.tumble = 0;
    // Fast enough to get back round you even while you boost.
    steer(this.besideYou(e, nose).sub(e.pos).normalize().multiplyScalar(Math.max(this.chase(e.def) * S.back, this.G.player.speed * 1.3)), 3);
    if ((nose > S.front && dist > S.commit) || e.stateT > S.giveUp) {
      e.state = 'idle'; e.stateT = 0; e.tumble = 0; e.contactCd = 0; e.restT = S.rest; e.cd = Math.max(e.cd || 0, S.rest);
    }
  }

  // Magma Spitter (see MAGMA): sits put in the lava; its mound (userData.body) sinks out of reach, heaves up, glows,
  // spits a fan of fireballs at where you'll be, and sinks again. Under the lava its shield is 0 (bullets sparkle off).
  magmaSpitter(e, dist, dt) {
    const G = this.G, p = G.player, u = e.mesh.userData, M = MAGMA, d = e.def, dust = d.trail || ['#ff5a14', '#ffb03a', '#2a2022'];
    e.vel.set(0, 0, 0);
    e.hold ??= rand(...M.under);
    if (e.state === 'idle') { e.state = 'under'; e.stateT = rand(0, 1); }
    const next = (s) => { e.state = s; e.stateT = 0; };
    let y = -M.depth;
    if (e.state === 'under') {
      if (e.stateT >= e.hold && dist < M.range && !p.dead) next('rise');
    } else if (e.state === 'rise') {
      y = -M.depth * (1 - Math.min(1, e.stateT / M.rise));
      if (Math.random() < dt * 30) G.fx.emit(e.pos, 2, { colors: dust, speed: 14, life: 0.7, size: 7, up: 18 });
      if (e.stateT >= M.rise) { next('up'); e.fired = false; }
    } else if (e.state === 'up') {
      y = Math.sin(e.stateT * 3) * 0.4;
      const hot = Math.min(1, e.stateT / M.wind);
      u.cracks.color.copy(u.cool).lerp(u.hot, hot); // the cracks (or spots) heat up: orange to yellow-white on a spitter
      if (!e.fired && e.stateT >= M.wind) {
        e.fired = true;
        if (dist < M.range && !p.dead) {
          const from = _a.copy(e.pos).setY(e.pos.y + 7 * e.mesh.scale.x);
          const lead = _b.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / M.speed) * this.leadK()).sub(from);
          const half = (M.shots - 1) / 2;
          for (let k = 0; k < M.shots; k++) this.fireOrb(from, _t.copy(lead).applyAxisAngle(Y, (k - half) * M.spread), M.speed, M.dmg, d.orb || '#ff6a1a', 1.4);
          G.fx.emit(from, 14, { colors: dust, speed: 25, life: 0.8, size: 8, up: 25 });
          G.audio.tone(110, 0.35, { type: 'sawtooth', vol: 0.07, slide: -40 });
        }
      }
      if (e.stateT >= M.up) next('sink');
    } else if (e.state === 'sink') {
      y = -M.depth * Math.min(1, e.stateT / M.sink);
      if (e.stateT >= M.sink) { next('under'); e.hold = rand(...M.under); u.cracks.color.copy(u.cool); }
    }
    u.body.position.y = y;
    e.shield = y > -M.depth * 0.5 ? 1 : 0; // under the lava, out of reach
    u.ring.visible = e.state === 'under' || e.state === 'rise';
    u.ring.material.opacity = 0.45 + 0.35 * Math.abs(Math.sin(e.t * (e.state === 'rise' ? 12 : 3)));
    u.ring.scale.setScalar(1 + 0.08 * Math.sin(e.t * 5));
    e.contactCd = Math.max(e.contactCd || 0, e.shield ? 0 : 0.2); // no bumping into one you can't see
  }

  // Comet Charger (see COMET): holds a spot off to one side ahead of you, then winds up (thruster and eye swell, a
  // rising hum), locks on to where you'll be, and charges in a straight line, trailing a comet tail. A hit ends the
  // charge (the bump pushes it back).
  cometCharger(e, toP, dist, dt, steer) {
    const G = this.G, p = G.player, d = e.def, u = e.mesh.userData, C = COMET, tail = d.trail || ['#9af4ff', '#5ae8ff', '#ffffff'];
    const next = (s) => { e.state = s; e.stateT = 0; };
    let glow = 0;
    if (e.state === 'wind') {
      e.vel.multiplyScalar(Math.exp(-dt * 4));
      glow = Math.min(1, e.stateT / C.wind);
      if (e.stateT >= C.wind) {
        // Locked: at where you'll be when it gets there.
        const lead = _w.copy(p.pos).addScaledVector(p.forward, p.speed * (dist / C.speed) * this.leadK()).sub(e.pos).normalize();
        (e.look ||= new THREE.Vector3()).copy(lead);
        e.vel.copy(lead).multiplyScalar(C.speed);
        next('dash');
        G.audio.tone(90, 0.5, { type: 'sawtooth', vol: 0.07, slide: 200 });
      } else (e.look ||= new THREE.Vector3()).copy(toP).normalize();
    } else if (e.state === 'dash') {
      glow = 1;
      if (Math.random() < dt * 40) G.fx.emit(_a.copy(e.pos).addScaledVector(e.look, -6), 2, { colors: tail, speed: 6, life: 0.8, size: 8 });
      if (e.stateT >= C.dash || (e.contactCd || 0) > 1) next('coast'); // a bump (contactCd 1.5) ends it; still facing along its charge
    } else if (e.state === 'coast') {
      e.vel.multiplyScalar(Math.exp(-dt * 1.5));
      if (e.stateT >= C.coast) { next('idle'); e.look = null; e.cd = rand(...C.every); }
    } else {
      e.look = null;
      const f = flatForward(p, _s), sd = e.seed > Math.PI ? 1 : -1; // not _v: that's toP
      _w.copy(p.pos).addScaledVector(f, C.hold).addScaledVector(_pp.set(-f.z, 0, f.x), sd * C.side).setY(p.pos.y + 15 + Math.sin(e.t) * 10).sub(e.pos);
      steer(_w.clampLength(0, this.keepUp(d)), 1.2);
      e.cd -= dt;
      if (e.cd <= 0 && dist < C.range && !p.dead) {
        next('wind');
        G.audio.tone(200, C.wind, { type: 'sine', vol: 0.05, slide: 500 });
      }
    }
    u.jet.scale.setScalar(1 + glow * 0.5);
    u.jet.material.opacity = 0.5 + 0.5 * glow;
    u.flame.scale.set(1 + glow * 0.4, 1 + glow * 1.6, 1 + glow * 0.4);
    u.eye.scale.setScalar(1 + glow * 0.4 + (e.state === 'wind' ? 0.1 * Math.sin(e.stateT * 30) : 0));
  }

  // Umbrella Goon: a bullet coming in at the front of its umbrella bounces off (a grey plink, no damage).
  guarded(e, b, at) {
    if (!e.face || e.state === 'falling' || b.vel.dot(e.face) > -UMBRELLA_COS * b.vel.length()) return false;
    this.G.fx.sparkle(at, '#9aa0a6');
    this.G.audio.tone(2400, 0.05, { type: 'triangle', vol: 0.04, slide: 600 });
    return true;
  }

  // Sniper Owl: every OWL_EVERY s it locks a steady red line on you for OWL_LOCK s, then fires one fast shot at where
  // you'll be. Any stunt, or turning more than OWL_BREAK off the heading you had when it locked, breaks the lock.
  aim(e, dist, dt) {
    const G = this.G, p = G.player;
    if (e.state === 'aim') {
      if (p.dead || p.maneuver || p.dodging || p.forward.angleTo(e.aimFwd) > OWL_BREAK) {
        e.state = 'idle';
        e.cd = (OWL_EVERY / 2) * PACE;
        e.beam.visible = false;
        if (!p.dead) { G.ui.notify('Lock broken! The owl is recalculating.', 'good', 1.5, 0); G.audio.tone(500, 0.2, { type: 'sine', vol: 0.05, slide: -250 }); }
      } else if (e.stateT >= OWL_LOCK * PACE) {
        e.state = 'idle';
        e.cd = (OWL_EVERY - OWL_LOCK) * PACE; // lock to lock: OWL_EVERY s
        e.beam.visible = false;
        const t = dist / (OWL_SHOT * PACE); // real s to reach you: shots fly at PACE too
        this.fireOrb(e.pos, _w.copy(p.pos).addScaledVector(p.forward, p.speed * t).sub(e.pos), OWL_SHOT, e.def.dmg, '#ff3a3a', 0.8);
        G.audio.tone(1800, 0.15, { type: 'square', vol: 0.06, slide: -1500 });
      }
      return;
    }
    e.cd -= dt;
    if (e.cd > 0 || dist > 600 || p.dead) return;
    e.state = 'aim';
    e.stateT = 0;
    (e.aimFwd ||= new THREE.Vector3()).copy(p.forward);
    if (!e.beam) {
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      e.beam = new THREE.Line(geo, beamMat || (beamMat = new THREE.LineBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.85, fog: false })));
      e.beam.frustumCulled = false;
      G.scene.add(e.beam);
    }
    e.beam.visible = true;
    this.drawBeam(e);
    G.audio.tone(900, 0.3, { type: 'sine', vol: 0.04 });
  }

  drawBeam(e) {
    // Calmed (or shot down) mid-aim, it gives up the lock.
    if (e.state !== 'aim' || (this.calmTimer > 0 && !e.quest)) { e.beam.visible = false; e.state = e.state === 'aim' ? 'idle' : e.state; return; }
    const at = e.beam.geometry.attributes.position, pp = this.G.player.pos;
    at.setXYZ(0, e.pos.x, e.pos.y, e.pos.z);
    at.setXYZ(1, pp.x, pp.y, pp.z);
    at.needsUpdate = true;
  }

  // Kite Twins: the pair keeps pace KITE_AHEAD m in front of you, sweeping side to side, with the string held across
  // your path. Every KITE_EVERY s it winds up (the string blinks red, a rising twang) and snaps the string at where
  // you're about to be. Flying through the string hurts and wobbles you (once per STRING_CD s); a stunt, going over or
  // under, or shooting a kite (it snaps the string) gets you out of it.
  flyPair(pair, dt) {
    const G = this.G, p = G.player, [a, b] = pair.kites;
    const f = flatForward(p, _s), side = _t.set(-f.z, 0, f.x);
    const roof = this.roofed(pair.centre);
    pair.phaseT += dt;
    if (pair.phase === 'park' && !pair.back && pair.phaseT >= KITE_EVERY && !p.dead) {
      pair.phase = 'wind'; pair.phaseT = 0;
      G.audio.tone(330, 0.9, { type: 'triangle', vol: 0.07, slide: 660 });
      if (!this.kiteWarned) { this.kiteWarned = true; G.ui.notify('The kites are winding up! Over, under, or roll!', 'bad', 2, 0); }
    } else if (pair.phase === 'wind' && pair.phaseT >= KITE_WIND) {
      pair.phase = 'snap'; pair.phaseT = 0; pair.rolled = false;
      // Where you'll be about halfway through the snap, at your height (sideways only under a roof).
      pair.strike.copy(p.pos).addScaledVector(p.forward, (p.speed * KITE_SNAP * 0.55) / PACE);
      if (roof) pair.strike.y = pair.centre.y;
      G.audio.tone(880, 0.15, { type: 'sawtooth', vol: 0.06, slide: -500 });
    } else if (pair.phase === 'snap' && pair.phaseT >= KITE_SNAP) {
      pair.phase = 'park'; pair.phaseT = 0; pair.back = true;
    }
    pair.mat.color.set(pair.phase === 'snap' || (pair.phase === 'wind' && Math.floor(pair.phaseT * 8) % 2 === 0) ? KITE_RED : '#ffffff');
    const ahead = _a.copy(pair.centre).sub(p.pos).dot(f);
    if (pair.phase === 'park' && ahead < -5) pair.back = true; // you got past it (a snap you dodged, or boosting)
    else if (pair.back && ahead >= KITE_BACK) pair.back = false;
    let top = Math.max(a.def.speed, (KITE_KEEP * p.speed) / PACE);
    if (pair.phase === 'snap') { _w.copy(pair.strike); top = KITE_LUNGE; }
    else {
      const wind = pair.phase === 'wind';
      _w.copy(p.pos).addScaledVector(f, wind ? KITE_CLOSE : KITE_AHEAD).addScaledVector(side, Math.sin(a.t * 0.5) * KITE_SWEEP);
      _w.y = p.pos.y + (wind ? 0 : Math.sin(a.t * 0.7) * 12);
      if (wind) top = KITE_LUNGE;
      if (pair.back) { top = KITE_LUNGE; if (!roof) _w.y = p.pos.y + 30; } // back out ahead, over your head
    }
    _w.y = Math.max(_w.y, G.terrain.surfaceHeight(_w.x, _w.z) + KITE_FLOOR);
    pair.centre.add(_w.sub(pair.centre).clampLength(0, top * dt));
    pair.axis.lerp(side, 1 - Math.exp(-dt * (pair.phase === 'snap' ? 4 : 1))).normalize(); // the string lies across your path
    pair.hitCd = Math.max(0, pair.hitCd - dt);
    // A roll through the snap dodges all of it: the roll (0.7 s) ends before the snap (0.8 s) does.
    if (pair.phase === 'snap' && p.dodging) pair.rolled = true;
    if (pair.back || p.dead || p.dodging || (pair.phase === 'snap' && pair.rolled) || p.invuln > 0 || pair.hitCd > 0 || segDist(p.pos, a.pos, b.pos) > STRING_HIT * p.sizeScale) return;
    pair.hitCd = STRING_CD * PACE;
    p.damage(a.def.dmg);
    p.quat.multiply(_q.setFromAxisAngle(_s.set(0, 0, 1), (Math.random() < 0.5 ? -1 : 1) * 0.7)).normalize(); // a wobble
    p.updateAxes();
    G.ui.notify('Tangled in the kite string! Over or under, remember?', 'bad', 2.5, 0);
  }

  // A Clingy Moth on your wing drains boost (MOTH_BOOST of the tank per s: the tank can't refill meanwhile) and hull
  // until a stunt (any) or Mega Ram shakes it off, for points. Going down just drops it.
  // Mega Ram into a boss: MEGA.boss of its max hull (shields and weak-spot multipliers apply), shoved away, dazed,
  // and no bump on you. toP points from the boss to the player. The usual hp <= 0 check after bullets finishes it off.
  ram(e, toP) {
    const G = this.G;
    e.contactCd = MEGA.cd;
    e.hp -= e.maxHp * MEGA.boss * (e.vulnerable || 1) * (e.shield ?? 1);
    e.vel.copy(toP).normalize().multiplyScalar(-MEGA.shove);
    daze(e, MEGA.daze);
    G.fx.explosion(e.pos);
    G.fx.popText(e.pos, 'RAM!');
    G.shake?.(1.2, 0.3);
    G.audio.explode();
    if (!this.rammedBoss) { this.rammedBoss = true; G.ui.notify('RAM! The boss is dazed: shoot it now for extra damage.', 'good', 3, 0); }
  }

  cling(e, dt) {
    const G = this.G, p = G.player, rdt = dt / PACE;
    if (p.dead) { this.unlatch(e, false); return; }
    if (p.maneuver || G.powerups.has('mega')) {
      this.unlatch(e, true);
      G.ui.notify(p.maneuver ? 'You shook off the moth! It was never going to work out.' : 'The moth let go. You got too big for it.', 'good', 2.5, 0);
      return;
    }
    p.boost = e.tank = Math.max(0, Math.min(e.tank, p.boost) - MOTH_BOOST * rdt);
    if (p.god || p.invuln > 0) return;
    p.health -= MOTH_HP * rdt;
    p.sinceHit = 0;
    if (p.health <= 0) p.crash('enemy');
  }

  unlatch(e, scored) {
    e.latched = false;
    e.state = 'falling';
    e.vel.set(rand(-6, 6), -4, rand(-6, 6));
    if (scored) this.payout(e);
    else e.paid = true; // it just fell off: no points when it lands
  }

  // A latched moth sits on your right wing.
  pin(e) {
    const p = this.G.player, s = p.sizeScale;
    e.pos.copy(p.pos).addScaledVector(p.right, 5 * s).addScaledVector(p.up, 0.9 * s).addScaledVector(p.forward, 0.6 * s);
    e.vel.set(0, 0, 0);
    e.mesh.quaternion.copy(p.quat).multiply(FLIP); // models face +Z, the plane flies toward -Z
  }

  // A weak point's halo (see weak() in models.js): a slow, faint breath; a hit flashes it white and swells it briefly.
  animateMark(part, t, dt) {
    const m = part.mark, hit = part.hitT > 0 ? part.hitT / MARK_FLASH : 0;
    part.hitT = Math.max(0, part.hitT - dt);
    m.halo.material.opacity = 0.12 + 0.05 * Math.sin(t * 1.6) + 0.45 * hit;
    m.halo.scale.setScalar(part.r * (1.15 + 0.2 * hit));
    m.halo.material.color.copy(m.tint).lerp(MARK_WHITE, hit);
  }

  // Fort Grumpington (makeFort): it turns its gate to you once; ducking sinks the mortar into the keep, tips the tower
  // cannons down behind their merlons and drops the portcullis; braziers and fires flicker, the chimney smokes,
  // pennants wave, wrecks smoke, and damage builds up in stages as it loses hp (userData.damage).
  animateFort(e, u, dt) {
    const G = this.G, ease = 1 - Math.exp(-dt * 6), down = e.mv && !e.mv.up ? 1 : 0;
    if (!e.facedYou) { e.facedYou = true; e.mesh.rotation.y = Math.atan2(G.player.pos.x - e.pos.x, G.player.pos.z - e.pos.z); }
    u.duckK = (u.duckK || 0) + (down - (u.duckK || 0)) * ease;
    u.mortar.position.y = 8.4 - u.duck.mortar * u.duckK;
    // The mortar turns to you but never aims lower than a lob (0.5 rad up): it stays a mortar, clear of the roof.
    // Ducked, it points straight up inside the keep.
    u.mortar.updateMatrixWorld();
    const to = u.mortar.worldToLocal(_pp.copy(G.player.pos)).sub(u.barrel.position);
    const lob = Math.max(0.5, Math.atan2(to.y, Math.hypot(to.x, to.z)));
    u.barrel.rotation.set(-(lob + (Math.PI / 2 - lob) * u.duckK), Math.atan2(to.x, to.z), 0, 'YXZ');
    u.portcullis.position.y = 1.9 + u.duck.gate * (1 - u.duckK);
    for (const g of u.guns) {
      g.gun.position.y = g.y0 - u.duck.gun * u.duckK;
      g.pennant.rotation.y = Math.sin(e.t * 6 + g.y0 + g.gun.position.x) * 0.3;
    }
    u.flames.forEach((f, k) => { if (f.visible) f.scale.y = f.scale.x * (1 + 0.25 * Math.sin(e.t * 17 + k * 1.7) + 0.1 * Math.sin(e.t * 31 + k)); });
    const ch = u.chimney;
    ch.puffs.forEach((m, k) => {
      const f = (e.t * 0.3 + k / ch.puffs.length) % 1;
      m.position.set(ch.at[0] + f * ch.drift[0], ch.at[1] + f * ch.rise, ch.at[2] + f * ch.drift[1]);
      m.scale.setScalar(0.8 + f * 2.4);
      m.material.opacity = 0.5 * (1 - f);
    });
    for (const w of u.wrecks) if (w.visible && Math.random() < dt * 8) G.fx.emit(w.getWorldPosition(_pp), 1, { colors: ['#2a2a2a', '#555555', '#777777'], speed: 5, life: 2, size: 10, up: 16 });
    const frac = e.hp / e.maxHp;
    for (const st of u.damage) {
      if (!st.on && frac < st.at && e.hp > 0) {
        st.on = true;
        for (const o of st.show) o.visible = true;
        for (const o of st.hide) o.visible = false;
        for (const at of [st.burst, ...st.smoke]) if (at) G.fx.emit(e.mesh.localToWorld(_pp.copy(at)), 10, { colors: ['#8a8378', '#b8b0a4', '#ff8a3a'], speed: 22, life: 0.8, size: 7, up: 10 });
        if (st.burst) { G.fx.explosion(e.mesh.localToWorld(_pp.copy(st.burst))); G.audio.noise(0.5, { vol: 0.2, freq: 400 }); G.shake?.(0.4, 0.3); }
      }
      if (st.on) for (const at of st.smoke) if (Math.random() < dt * 5) G.fx.emit(e.mesh.localToWorld(_pp.copy(at)), 1, { colors: ['#3a3a3a', '#5a5a5a', '#7a7a7a'], speed: 5, life: 2.4, size: 12, up: 14 });
    }
  }

  animate(e, dt) {
    const u = e.mesh.userData;
    if (u.parts) for (const part of u.parts) if (part.mark) this.animateMark(part, e.t, dt);
    if (u.rotors) for (const r of u.rotors) r.rotation.y += dt * 30;
    if (u.wings && !u.webs && !u.scarab && !u.owl && !u.dragon) { const f = Math.sin(e.t * 14) * 0.6; u.wings[0].rotation.z = -f; u.wings[1].rotation.z = f; }
    if (u.lights) u.lights.forEach((l, k) => l.visible = Math.floor(e.t * 6 + k) % 2 === 0);
    if (u.spin) for (const s of u.spin) s.rotation.z += dt * 25;
    if (u.tentacles) u.tentacles.forEach((t, k) => { t.rotation.x = Math.sin(e.t * 2 + k) * 0.35; t.rotation.z = Math.cos(e.t * 1.7 + k) * 0.35; });
    if (u.barrel) u.barrel.lookAt(this.G.player.pos);
    if (u.guns) for (const g of u.guns) {
      if (g.gun.visible) g.aim.lookAt(this.G.player.pos);
      else if (g.wreck && Math.random() < dt * 8) this.G.fx.emit(g.wreck.getWorldPosition(_pp), 1, { colors: ['#2a2a2a', '#555555', '#777777'], speed: 5, life: 2, size: 10, up: 16 }); // a wreck smokes
    }
    if (u.faceYou) this.animateFort(e, u, dt);
    if (u.radars) u.radars.forEach((r, k) => { r.rotation.y += dt * (k ? -3 : 2); });
    if (u.flag) u.flag.rotation.y = Math.sin(e.t * 7) * 0.25;
    if (u.foam) u.foam.opacity = 0.45 + 0.12 * Math.sin(e.t * 2.5);
    if (u.smoke) u.smoke.forEach((m, k) => { // funnel smoke: each puff rises 9 units, swelling and fading, then starts again
      const f = (e.t * 0.35 + k / u.smoke.length) % 1;
      m.position.set(5.4 - f * 2, 18 + f * 9, -0.6 - f * 4);
      m.scale.setScalar(0.8 + f * 2.2);
      m.material.opacity = 0.55 * (1 - f);
    });
    if (u.legs) u.legs.forEach((l, k) => { l.rotation.x = Math.sin(e.t * 8 + k * 1.3) * 0.3; });
    if (u.claws) {
      e.snap = Math.max(0, (e.snap || 0) - dt);
      u.claws.forEach((c, k) => { c.rotation.y = (k ? -1 : 1) * (e.snap > 0 ? 0.5 : Math.sin(e.t * 2) * 0.15); });
    }
    if (u.webs) BOSS_MOVES.fans.pose(this, e, dt); // Glacierra rolls her wings into her next fan's plane
    if (u.scarab) BOSS_MOVES.mirage.pose(this, e, dt); // the Sun Beetle's mirages and its shadow
    if (u.toad) BOSS_MOVES.leap.pose(this, e, dt); // Count Ribbiton's facing, sac, tongue and shadow
    if (u.owl) BOSS_MOVES.gust.pose(this, e, dt); // Lady Hootrude's rear-up, her gust and its leaves
    if (u.turtle) BOSS_MOVES.whirl.pose(this, e, dt); // Grandma Atolla's nap, paddling, rear-up and her Whirlpool
    if (u.dragon) BOSS_MOVES.rake.pose(this, e, dt); // Duchess Brûlée's rear-up, her Rake and its curtain, her wings
    if (u.segs) BOSS_MOVES.breach.lay(this, e, dt); // Magmadora's body follows her head, in and out of the lava
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
    // After the move (and the ground and roof clamps): strings, aiming lines and a moth stuck to your wing follow.
    if (e.pair?.kites[0] === e) this.drawString(e.pair);
    if (e.beam?.visible) this.drawBeam(e);
    if (e.latched && this.calmTimer > 0 && !e.quest) this.unlatch(e, false); // calmed down, it lets go
    if (e.latched) { this.pin(e); return; }
    if (e.face) { e.mesh.lookAt(_w.copy(e.pos).add(e.face)); return; }
    if (e.look) { e.mesh.lookAt(_w.copy(e.pos).add(e.look)); return; } // a Comet Charger, locked on
    if (e.type === 'cannon' || e.type === 'jelly') return;
    if (e.type === 'mine' || e.type === 'storm') e.mesh.rotation.y += dt * 0.4;
    if (e.type === 'ufo') e.mesh.rotation.y += dt * 1.5;
    if (e.type === 'drone' || e.type === 'storm' || e.type === 'kites' || e.type === 'sniperOwl' || e.type === 'grudgeRock' || e.type === 'grumbling' || e.def.act === 'ambush') e.mesh.lookAt(this.G.player.pos.x, e.pos.y, this.G.player.pos.z);
    else if (e.vel.lengthSq() > 1 && e.type !== 'mine' && e.type !== 'ufo' && e.def.act !== 'ambush') e.mesh.lookAt(_w.copy(e.pos).add(e.vel));
    if (e.tumble) e.mesh.rotateZ(e.tumble); // a peeling squirrel tumbles head over tail
  }

  updateShots(dt) {
    const p = this.G.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      if (s.g) s.vel.y -= s.g * dt; // dropped bombs and eggs fall
      s.pos.addScaledVector(s.vel, dt);
      const d2 = s.pos.distanceToSquared(p.pos), hit = !p.dead && d2 < s.r2 * p.sizeScale * p.sizeScale;
      if (hit && s.fake) {
        // A mirage's orb: it shimmers away on you, harmless.
        this.G.fx.emit(s.pos, 10, { colors: ['#ffe8a0', '#bfefff'], speed: 20, life: 0.5, size: 4 });
        if (!(this.mirageNews > this.G.time)) { this.mirageNews = this.G.time + 6; this.G.ui.notify('Just a mirage! That orb was fake.', 'good', 2); }
      } else if (hit) {
        const h0 = p.health;
        p.damage(s.dmg);
        // Glacierra's shards also frost part of your boost tank (only when they actually hurt).
        if (s.frost && p.health < h0) {
          p.boost = Math.max(0, p.boost - s.frost);
          if (!(this.frostNews > this.G.time)) { this.frostNews = this.G.time + 6; this.G.ui.notify('Frostbite! Your boost iced over.', 'bad', 2); }
        }
      }
      else if (!p.dead && !s.whiffed && d2 < s.r2 && this.G.powerups.has('tiny')) {
        // Tiny Ace: it would have hit a normal-size plane.
        s.whiffed = true;
        this.G.score += TINY.whiff;
        this.G.fx.popText(_pp.copy(p.pos).addScaledVector(p.up, 5), `Whiff! +${TINY.whiff}`);
      }
      const ground = !hit && s.pos.y < this.G.terrain.surfaceHeight(s.pos.x, s.pos.z, s.pos.y);
      if (ground && s.fake) this.G.fx.emit(s.pos, 6, { colors: ['#ffe8a0', '#bfefff'], speed: 12, life: 0.5, size: 4 }); // no crater
      else if (ground) {
        // Orbs that miss blow holes in the landscape.
        this.G.terrain.deform(s.pos.x, s.pos.z, 5, 2.5);
        this.G.fx.emit(s.pos, 25, { colors: ['#ffb03a', '#8a6a4a', '#555555'], speed: 30, life: 0.8, size: 6, up: 15 });
      }
      if (hit || ground || s.life <= 0) { this.G.scene.remove(s.mesh); this.shots.splice(i, 1); }
    }
  }

  // An armed Spiky Balloon: it brakes, swells and blinks faster and faster (a beep on each blink), then sets e.boom.
  mineFuse(e, dt) {
    e.vel.multiplyScalar(Math.exp(-dt * 5));
    e.fuse -= dt;
    const k = 1 - Math.max(0, e.fuse) / MINE.fuse; // 0 armed .. 1 boom
    e.blinkPhase = (e.blinkPhase || 0) + dt * (5 + 15 * k);
    const on = e.blinkPhase % 1 < 0.5;
    if (on && !e.blink) this.G.audio.tone(900 + 700 * k, 0.07, { type: 'square', vol: 0.06 });
    e.blink = on;
    const light = e.mesh.userData.light;
    if (light) { light.material.color.set(on ? '#ffffff' : '#ff2a2a'); light.scale.setScalar(on ? 2.2 : 1.2); }
    e.mesh.scale.setScalar((e.radius / e.def.radius) * (1 + 0.25 * k + (on ? 0.06 : 0)));
    if (e.fuse <= 0) e.boom = true;
  }

  // The pop: a ring of fire, and hull damage that falls off from the centre to the edge of MINE.blast.
  mineBlast(e) {
    const G = this.G, p = G.player, dist = p.pos.distanceTo(e.pos);
    G.fx.explosion(e.pos);
    G.fx.emit(e.pos, 50, { colors: ['#ff3a2a', '#ffd23a'], speed: 70, life: 0.6, size: 6, ring: true });
    if (p.dead) return;
    if (dist < MINE.blast * 2) G.shake?.(dist < MINE.blast ? 1 : 0.5, 0.3);
    if (dist < MINE.blast && this.calmTimer <= 0) p.damage(MINE.dmgMax + (MINE.dmgMin - MINE.dmgMax) * (dist / MINE.blast));
  }

  // A kamikaze going off: small fry (quiet ones: pebbles, Grumblings) just puff, so a clump of them doesn't white out
  // the screen; the rest explode.
  burst(e) {
    if (e.def.quiet) this.G.fx.emit(e.pos, 10, { colors: ['#ffd23a', '#8a7a9a', '#ffffff'], speed: 25, life: 0.5, size: 5 });
    else this.G.fx.explosion(e.pos);
  }

  kill(i, byPlayer) {
    const G = this.G, e = this.list[i];
    e.dead = true;
    if (e.def.swim) BOSS_MOVES.breach.surface(e); // Magmadora goes up (and drops her power-up) above the lava
    // Blowing up close to the ground leaves a crater: bosses leave a big one.
    const above = e.pos.y - G.terrain.surfaceHeight(e.pos.x, e.pos.z, e.pos.y);
    if (above < e.radius * 2 + 15) G.terrain.deform(e.pos.x, e.pos.z, e.boss ? 26 : 5 + e.radius * 0.5, e.boss ? 12 : 3);
    if (e.boss) {
      const w = e.def.sea ? 90 : e.def.boxes ? 30 : 20; // a carrier goes up all along its length, the fort across its walls
      for (let k = 0; k < 5; k++) setTimeout(() => G.fx.explosion(e.pos.clone().add(new THREE.Vector3(rand(-w, w), rand(-15, 15), rand(-w, w)))), k * 150);
      G.stats.kills++;
      G.powerups.drop(e.pos.clone()); // bosses always drop a power-up
    } else if (byPlayer && !e.paid) this.payout(e);
    if (byPlayer && !SMALL[e.type] && !e.def.quiet && !G.comfort?.reducedMotion) G.hitStop = Math.max(G.hitStop || 0, HIT_STOP);
    if (e.def.squeak) G.audio.tone(1400, 0.08, { type: 'square', vol: 0.05, slide: 600 });
    else G.audio.explode();
    this.remove(i);
    // A Grudge Rock breaks into pebbles (and a puff of grit) that scatter, then home in (never past the CEILING).
    if (e.def.split && !e.boss) {
      G.fx.emit(e.pos, 18, { colors: ['#8a8378', '#6f685f', '#b8b0a4'], speed: 30, life: 0.7, size: 6 });
      const [type, n] = e.def.split;
      for (let k = 0; k < Math.min(n, CEILING - this.regulars().length); k++) {
        const bit = this.spawn(type, e.pos.clone().add(new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3))), { quest: e.quest });
        bit.wave = e.wave; // a wave's rock: its pebbles belong to the wave too (not to its roster)
        bit.vel.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).setLength(rand(35, 50));
      }
    }
  }

  // Points (and the kill) for a regular enemy you brought down (an elite: GARY.score × as many), times the kill-streak
  // multiplier (STREAK_MULT). Hold The Line: each kill mends 3 hull.
  payout(e) {
    const G = this.G, p = G.player;
    this.streak = !p.dead && G.time - (this.streakAt ?? -Infinity) < STREAK_WINDOW ? (this.streak || 0) + 1 : 0;
    this.streakAt = G.time;
    const mult = STREAK_MULT[Math.min(this.streak, STREAK_MULT.length - 1)];
    const pts = Math.round(e.def.score * (e.elite ? GARY.score : 1) * mult * (e.rammed ? MEGA.bonus : 1)); // Mega Ram: bonus
    e.paid = true;
    G.score += pts;
    G.fx.popText(e.pos, `${e.rammed ? 'RAM! ' : ''}+${pts}${mult > 1 ? ` x${mult}` : ''}`);
    G.stats.kills++;
    if (Math.random() < 0.3) G.ui.notify(`${pick(T.kill)} +${pts}`, 'good', 2.5, 0);
    if (this.frenzy && !e.quest && !p.dead) {
      p.health = Math.min(p.maxHealth, p.health + KILL_MEND);
      G.fx.popText(_pp.copy(e.pos).addScaledVector(p.up, 8), `+${KILL_MEND} hull`);
    }
  }

  remove(i) {
    const e = this.list[i];
    e.dead = true;
    this.G.scene.remove(e.mesh);
    if (e.marker) this.G.scene.remove(e.marker);
    if (e.boss) dropBoss(this, e); // its hazards and stingers go with it
    if (e.pair) this.snap(e);
    if (e.beam) { this.G.scene.remove(e.beam); e.beam.geometry.dispose(); }
    disposeTree(e.mesh);
    this.list.splice(i, 1);
  }

  removeEnemy(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.remove(i);
  }
}
