import * as THREE from 'three';
import { world, reseed, waterLine } from './world.js';
import { buildProps } from './models.js';
import { Terrain } from './terrain.js';
import { Sky } from './sky.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Objectives } from './objectives.js';
import { Persuasion } from './persuasion.js';
import { Mutations } from './mutations.js';
import { PowerUps } from './powerups.js';
import { Progress } from './progression.js';
import { Zones } from './zones.js';
import { DevMenu } from './devmenu.js';
import { Secrets } from './secrets.js';
import { PullUp } from './pullup.js';
import { pick, T } from './texts.js';
import { installCurvature } from './curve.js';
import { installDesktop } from './desktop.js';

installCurvature(); // before anything compiles a shader

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 9000);

const G = { scene, camera, renderer, world, score: 0, stats: { crashes: 0, kills: 0 }, time: 0, paused: true, started: false, relax: false, gameOver: false };
window.G = G; // handy for poking at the world from the console
// Comfort: when the system asks for reduced motion, no camera shake, no cinematic camera turns, softer flashes.
G.comfort = { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
// Settings (I / N / M) survive a reload: pitch invert, music and sound.
const SETTINGS_KEY = 'landed-settings', SETTINGS_DEFAULT = { invert: false, music: true, muted: false };
const settings = { ...SETTINGS_DEFAULT };
try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); for (const k in settings) if (typeof s?.[k] === 'boolean') settings[k] = s[k]; } catch { /* storage unavailable */ }
function saveSettings() {
  Object.assign(settings, { invert: G.input.invert, muted: G.audio.muted }, G.audio.music && { music: G.audio.music.enabled });
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode: forgotten next time */ }
}

buildProps();
reseed((Math.random() * 1e9) | 0);
G.audio = new Sfx();
G.ui = new UI(G);
G.fx = new FX(G);
G.terrain = new Terrain(G);
G.player = new Player(G);
G.pullup = new PullUp(G);
G.sky = new Sky(G);
G.enemies = new Enemies(G);
G.objectives = new Objectives(G);
G.persuasion = new Persuasion(G);
G.mutations = new Mutations(G);
G.progress = new Progress(G);
G.powerups = new PowerUps(G);
G.zones = new Zones(G);
G.input = new Input(canvas);
G.input.invert = settings.invert;
G.audio.muted = settings.muted; // music waits for start(): it only exists once the audio is up
G.devmenu = new DevMenu(G); // secret: hold 1 + 0 (or both top corners on touch) for 3 s mid-flight
G.secrets = new Secrets(G); // Easter eggs; before the first terrain build, so a holiday prop theme is there from the start

G.player.spawn(0, 0, Math.random() * Math.PI * 2);
G.terrain.update(G.player.pos, 999);
G.player.spawn(0, 0, Math.atan2(-G.player.forward.x, -G.player.forward.z));
G.sky.clouds.setStyle('#ffffff', 40);

// ---------- camera ----------
const camUp = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _l = new THREE.Vector3(), _u = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
// Camera shake (G.shake(amp m, dur s)): a jolt that dies away linearly. Never with reduced motion.
const shake = (G.camShake = { amp: 0, dur: 1, t: 0, off: new THREE.Vector3() });
G.shake = (amp, dur) => {
  if (G.comfort.reducedMotion || amp < (shake.amp * shake.t) / shake.dur) return; // a bigger jolt already running wins
  Object.assign(shake, { amp, dur, t: dur });
};
const BASE_FOV = 70, PORTRAIT_FOV = 95, HALF_FOV = THREE.MathUtils.degToRad(37.5);

function updateCamera(dt, snap = false) {
  const p = G.player;
  camera.position.sub(shake.off); // last frame's jolt
  _u.copy(Y).lerp(p.up, 0.45).normalize();
  _d.copy(p.pos).addScaledVector(p.forward, -26).addScaledVector(_u, 7.5);
  const ground = Math.max(G.terrain.surfaceHeight(_d.x, _d.z, _d.y), waterLine()) + 3;
  if (_d.y < ground) _d.y = ground;
  if (world.tunnels) _d.y = Math.min(_d.y, G.terrain.ceilingHeight(_d.x, _d.z, _d.y) - 3); // in a tunnel, stay under its roof
  if (world.underwater) _d.y = Math.min(_d.y, world.seaLevel - 2); // keep the camera in the water
  if (snap) camera.position.copy(_d);
  else camera.position.lerp(_d, 1 - Math.exp(-dt * 6));
  shake.t = snap ? 0 : Math.max(0, shake.t - dt);
  const jolt = (shake.amp * shake.t) / shake.dur;
  shake.off.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * jolt);
  camera.position.add(shake.off);
  camUp.lerp(_u, 1 - Math.exp(-dt * 4)).normalize();
  camera.up.copy(camUp);
  camera.lookAt(_l.copy(p.pos).addScaledVector(p.forward, 30));
  // Persuasion's "cinematic look" (G.camPeek = { at, w }): turn the view toward `at`, by w (0..1).
  const peek = G.camPeek;
  if (peek && peek.w > 0 && !G.comfort.reducedMotion) {
    _q.copy(camera.quaternion);
    camera.lookAt(peek.at);
    camera.quaternion.slerpQuaternions(_q, _q2.copy(camera.quaternion), Math.min(1, peek.w));
    camera.updateMatrixWorld(); // the HUD marker projects through it before the next render
  }
  // Portrait screens get a wider view, so as much of the world fits across as on a landscape one (up to 95°).
  const a = camera.aspect, base = a >= 1 ? BASE_FOV : THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(HALF_FOV) / a)), BASE_FOV, PORTRAIT_FOV);
  const fov = base + Math.max(0, (p.speed - p.baseSpeed) / p.baseSpeed) * 16 * (base === BASE_FOV ? 1 : 0.6);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
}

let orbit = 0;
function titleCamera(dt) {
  orbit += dt * 0.15;
  const p = G.player.pos;
  camera.position.set(p.x + Math.cos(orbit) * 60, p.y + 18, p.z + Math.sin(orbit) * 60);
  camera.up.set(0, 1, 0);
  camera.lookAt(p);
  G.player.model.group.position.copy(p);
  G.player.model.group.quaternion.copy(G.player.quat);
  G.player.model.prop.rotation.z += dt * 30;
}

// ---------- game flow ----------
const $ = (id) => document.getElementById(id);

// Build badge on the title card. Test previews and release zips ship a VERSION.json; plain dev serving doesn't.
fetch('VERSION.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((v) => { if (v) $('build-info').textContent = `Build ${v.version} · ${new Date(v.builtAt).toLocaleString()}`; })
  .catch(() => {});

function start() {
  $('title').classList.add('hidden');
  G.audio.init();
  G.paused = false;
  if (!G.started) {
    G.started = true;
    if (!settings.music && G.audio.music?.enabled) G.audio.music.toggle();
    const remembered = [settings.invert && 'pitch inverted', !settings.music && 'music off', settings.muted && 'sound off'].filter(Boolean);
    if (remembered.length) G.ui.notify(`Remembered: ${remembered.join(', ')}. (I / N / M to change)`, 'info', 4, 1);
    $('relax-btn').classList.remove('hidden');
    updateCamera(0, true);
    setTimeout(() => G.ui.notify(pick(T.intro), 'info', 5), 400);
    setTimeout(() => G.ui.notify('Objectives appear top-right. Ignore them at your own risk. They get clingy.', 'persuade', 6), 2200);
  }
}

// Relax mode: objectives and enemies leave, the HUD fades, cinema bars slide in. Like what you see? Stay a while.
function setRelax(on) {
  if (!G.started || G.player.lives <= 0 || G.relax === on) return; // out of lives: the run is ending, no escaping into Relax
  G.relax = on;
  document.body.classList.toggle('relax', on);
  $('relax-btn').querySelector('.ico').textContent = on ? '⚡' : '☁️';
  $('relax-btn').querySelector('.lbl').textContent = on ? 'Back to the action' : 'Relax Mode';
  if (on) {
    G.objectives.suspend();
    G.enemies.clearAll();
    G.ui.bossBar(null);
    G.ui.notify(pick(T.relaxOn), 'info', 5, 2);
  } else {
    G.enemies.spawnTimer = 8;
    G.ui.notify(pick(T.relaxOff), 'good', 4, 2);
  }
}

// Enter / Space only work on the Game Over card after this long (real ms): a shot fired (Space) just as it appears
// mustn't skip it. The FLY AGAIN button works at once.
const KEY_LOCK_MS = 1000;
let overAt = -Infinity;
let continuedFrom = null; // the zone name a continued run started in (the Game Over card says so), null for a fresh run
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Out of lives (Player.update calls this once the last crash's explosion has played): the run is over. The game
// pauses behind the Game Over card, and the best run is saved before the card shows it.
function endRun() {
  const p = G.progress;
  G.gameOver = true;
  overAt = performance.now();
  G.paused = true;
  p.save();
  const best = G.score > p.bestBefore; // the record before this run (autosaves during it already moved p.best)
  $('go-quip').textContent = pick(T.gameOver);
  $('go-score').textContent = G.score;
  $('go-lines').replaceChildren(...[
    `Level ${p.level} · ${p.rank}`,
    `✔ ${plural(G.objectives.completed, 'objective')} · 🎯 ${plural(G.stats.kills, 'kill')}`,
    ...(continuedFrom ? [`Continued from ${continuedFrom}`] : []),
  ].map((t) => { const d = document.createElement('div'); d.textContent = t; return d; }));
  $('go-best').textContent = best ? '🏆 New best run!' : `Your best: ${p.best.score} points · Level ${p.best.level}`;
  $('go-continue').classList.toggle('hidden', !canContinue());
  $('continue').textContent = `CONTINUE FROM ${G.zones.current.name.toUpperCase()}`;
  $('gameover').classList.remove('hidden');
  G.audio.setEngine(0, false);
  G.audio.music?.duck(true);
}

// "Fly again": a fresh run in place, no reload. Lives, score, level and perks, power-ups, enemies, the objective and
// the journey all start over from zone 1 (a new landscape, as on every boot). With `keepZone` ("Continue") it's the
// same fresh run, but the journey stays in the zone and lap it reached.
function flyAgain(keepZone = false) {
  if (!G.gameOver) return;
  continuedFrom = keepZone ? G.zones.current.name : null;
  G.score = 0;
  G.stats.crashes = G.stats.kills = 0;
  G.player.resetRun();
  G.progress.resetRun();
  G.powerups.resetRun();
  G.objectives.resetRun();
  G.enemies.clearAll();
  Object.assign(G.enemies, { spawnTimer: 6, calmTimer: 0, frenzy: false, hats: false }); // as on boot (hats: a mutation)
  if (!keepZone) G.zones.lap = 1;
  G.zones.sinceZone = 0;
  G.zones.enter(keepZone ? G.zones.index : 0);
  G.player.spawn(G.player.pos.x, G.player.pos.z, Math.random() * Math.PI * 2);
  G.ui.resetRun();
  G.gameOver = false;
  G.paused = false;
  $('gameover').classList.add('hidden');
  document.activeElement?.blur(); // Space must shoot, not click the button again
  G.audio.music?.duck(false);
  updateCamera(0, true);
  G.ui.notify(pick(keepZone ? T.continueRun : T.flyAgain), 'info', 4, 2);
}

// "Continue": only once the journey got past zone 1. Back in Meadowlands on lap 1 it would just be Fly again.
const canContinue = () => G.zones.index > 0 || G.zones.lap > 1;
function continueRun() { if (canContinue()) flyAgain(true); }

function setPaused(v) {
  if (!G.started || G.gameOver) return;
  G.paused = v;
  $('pause').classList.toggle('hidden', !v);
  if (v) $('pause-quip').textContent = pick(T.pause);
  G.audio.setEngine(0, !v);
  G.audio.music?.duck(v);
}

$('start').addEventListener('click', start);
$('resume').addEventListener('click', () => setPaused(false));
$('again').addEventListener('click', () => flyAgain());
$('continue').addEventListener('click', continueRun);
$('relax-btn').addEventListener('click', (e) => { setRelax(!G.relax); e.currentTarget.blur(); }); // blur: Space must keep shooting, not re-click
installDesktop(); // desktop (Electron) build only: Quit and Fullscreen buttons on the title and pause cards
G.input.on('KeyR', () => setRelax(!G.relax));
const flyAgainKey = () => { if (performance.now() - overAt >= KEY_LOCK_MS) flyAgain(); }; // flyAgain: only on the Game Over card
G.input.on('Enter', () => { if (!G.started) start(); else flyAgainKey(); });
G.input.on('Space', flyAgainKey);
G.input.on('KeyC', () => { if (performance.now() - overAt >= KEY_LOCK_MS) continueRun(); }); // the same key lock
G.input.on('KeyP', () => setPaused(!G.paused));
G.input.on('Escape', () => setPaused(!G.paused));
G.input.on('KeyM', () => { G.ui.notify(G.audio.toggleMute() ? 'Muted. The engine is now imaginary.' : 'Sound on. Vroom.', 'info', 2); saveSettings(); });
G.input.on('KeyN', () => { if (G.audio.music) G.ui.notify(G.audio.music.toggle() ? 'Music on. Breathe in. Fly calmly.' : 'Music off. Just you and the wind.', 'info', 2); saveSettings(); });
G.input.on('KeyI', () => { G.input.invert = !G.input.invert; G.ui.notify(G.input.invert ? 'Pitch inverted: W dives, like a real pilot.' : 'Pitch normal: W climbs, like a sensible person.', 'info', 3); saveSettings(); });
addEventListener('visibilitychange', () => { if (document.hidden && G.started && !G.paused) setPaused(true); });

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  G.fx.resize();
});

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  // At most 0.05 s a frame, and never negative: a clock that jumps back (a test's fake clock) mustn't run time backwards.
  const dt = THREE.MathUtils.clamp(clock.getDelta(), 0, 0.05);
  G.devmenu.update();
  if (G.paused) {
    if (!G.started) titleCamera(dt);
    G.terrain.update(G.player.pos, 1);
    G.sky.update(dt);
    G.audio.update();
  } else step(dt);
  renderer.render(scene, camera);
}

function step(dt) {
  G.time += dt;
  const input = G.input.state(dt);
  const p = G.player;
  const scoreBefore = G.score;
  p.update(dt, input);
  G.pullup.update(dt);
  G.terrain.update(p.pos, G.terrain.stale ? 4 : 2);
  G.enemies.update(dt);
  G.objectives.update(dt);
  G.persuasion.update(dt);
  G.powerups.update(dt);
  G.zones.update(dt);
  G.secrets.update(dt);
  p.events.length = 0;
  // Double Points: whatever was earned this frame counts twice.
  if (G.powerups.has('double') && G.score > scoreBefore) G.score += G.score - scoreBefore;
  G.progress.update(dt);
  G.fx.update(dt);
  updateCamera(dt);
  G.sky.update(dt);
  G.ui.update(dt);
  G.audio.setEngine(p.speed / 100, !p.dead, THREE.MathUtils.clamp((p.speed - p.baseSpeed) / (0.7 * p.baseSpeed), 0, 1)); // wind: 0 at cruise, 1 at full boost
  G.audio.update();
}

G.step = step; // console/debug: advance the simulation without rendering
G.setRelax = setRelax;
G.endRun = endRun;
G.flyAgain = flyAgain;
frame();
