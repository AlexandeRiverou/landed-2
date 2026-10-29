import * as THREE from 'three';
import { world, reseed } from './world.js';
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
import { pick, T } from './texts.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 9000);

const G = { scene, camera, renderer, world, score: 0, stats: { crashes: 0, kills: 0 }, time: 0, paused: true, started: false };
window.G = G; // handy for poking at the world from the console

buildProps();
reseed((Math.random() * 1e9) | 0);
G.audio = new Sfx();
G.ui = new UI(G);
G.fx = new FX(G);
G.terrain = new Terrain(G);
G.player = new Player(G);
G.sky = new Sky(G);
G.enemies = new Enemies(G);
G.objectives = new Objectives(G);
G.persuasion = new Persuasion(G);
G.mutations = new Mutations(G);
G.input = new Input(canvas);

G.player.spawn(0, 0, Math.random() * Math.PI * 2);
G.terrain.update(G.player.pos, 999);
G.player.spawn(0, 0, Math.atan2(-G.player.forward.x, -G.player.forward.z));
G.sky.clouds.setStyle('#ffffff', 40);

// ---------- camera ----------
const camUp = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _l = new THREE.Vector3(), _u = new THREE.Vector3();

function updateCamera(dt, snap = false) {
  const p = G.player;
  _u.copy(Y).lerp(p.up, 0.45).normalize();
  _d.copy(p.pos).addScaledVector(p.forward, -26).addScaledVector(_u, 7.5);
  const ground = Math.max(G.terrain.surfaceHeight(_d.x, _d.z), world.seaLevel) + 3;
  if (_d.y < ground) _d.y = ground;
  if (snap) camera.position.copy(_d);
  else camera.position.lerp(_d, 1 - Math.exp(-dt * 6));
  camUp.lerp(_u, 1 - Math.exp(-dt * 4)).normalize();
  camera.up.copy(camUp);
  camera.lookAt(_l.copy(p.pos).addScaledVector(p.forward, 30));
  const fov = 70 + Math.max(0, (p.speed - p.baseSpeed) / p.baseSpeed) * 16;
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

function start() {
  $('title').classList.add('hidden');
  G.audio.init();
  G.paused = false;
  if (!G.started) {
    G.started = true;
    updateCamera(0, true);
    setTimeout(() => G.ui.notify(pick(T.intro), 'info', 5), 400);
    setTimeout(() => G.ui.notify('Objectives appear top-right. Ignore them at your own risk. They get clingy.', 'persuade', 6), 2200);
  }
}

function setPaused(v) {
  if (!G.started) return;
  G.paused = v;
  $('pause').classList.toggle('hidden', !v);
  if (v) $('pause-quip').textContent = pick(T.pause);
  G.audio.setEngine(0, !v);
}

$('start').addEventListener('click', start);
$('resume').addEventListener('click', () => setPaused(false));
G.input.on('Enter', () => { if (!G.started) start(); });
G.input.on('KeyP', () => setPaused(!G.paused));
G.input.on('Escape', () => setPaused(!G.paused));
G.input.on('KeyM', () => G.ui.notify(G.audio.toggleMute() ? 'Muted. The engine is now imaginary.' : 'Sound on. Vroom.', 'info', 2));
G.input.on('KeyI', () => { G.input.invert = !G.input.invert; G.ui.notify(G.input.invert ? 'Pitch inverted: W dives, like a real pilot.' : 'Pitch normal: W climbs, like a sensible person.', 'info', 3); });
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
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.paused) {
    if (!G.started) titleCamera(dt);
    G.terrain.update(G.player.pos, 1);
    G.sky.update(dt);
  } else step(dt);
  renderer.render(scene, camera);
}

function step(dt) {
  G.time += dt;
  const input = G.input.state(dt);
  const p = G.player;
  p.update(dt, input);
  G.terrain.update(p.pos, G.terrain.stale ? 4 : 2);
  G.enemies.update(dt);
  G.objectives.update(dt);
  G.persuasion.update(dt);
  p.events.length = 0;
  G.fx.update(dt);
  updateCamera(dt);
  G.sky.update(dt);
  G.ui.update(dt);
  G.audio.setEngine(p.speed / 140, !p.dead);
}

G.step = step; // console/debug: advance the simulation without rendering
frame();
