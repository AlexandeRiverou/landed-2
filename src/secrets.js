// Hidden Easter eggs ("secrets"): the Konami code, words typed mid-flight, special dates, two flight feats and a
// title that gets clicked far too often. Found secrets are remembered between visits; the title card counts them.
import * as THREE from 'three';
import { makeRivalJet } from './models.js';
import { pick } from './texts.js';
import { world, waterLine } from './world.js';

const STORE_KEY = 'landed.secrets';
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
// Typed letters → secret id. Never use a toggle key (R relax, N music, M mute, P pause, I invert): typing the word would flip it.
export const WORDS = { QUACK: 'quack', BOGEY: 'gary', GOOSE: 'honk' };
export const TOGGLE_LETTERS = /[RNMPI]/;
for (const w in WORDS) if (TOGGLE_LETTERS.test(w)) throw new Error(`secret word ${w} contains a toggle key`);
const WORD_MAX = 8;              // letters remembered (longest word + a little)
const RAINBOW_SECS = 30;
const EDGE_ALT = 1100;           // absolute height; the soft ceiling starts nosing you down at 1150
const MOW_ALT = 5, MOW_SECS = 3; // upside down, this close to the ground, this long
const TITLE_CLICKS = 7, TITLE_GAP_MS = 1500;
const GARY_SECS = 7;
const TOAST_SECS = 3.6;
const HONK_POINTS = 50;

const KONAMI_LINES = [
  'Konami code accepted. 30 extra lives were not included, but here\'s a rainbow.',
  'Up up down down... you\'ve done this before. Enjoy 30 seconds of fabulous.',
];
const GARY_LINES = [
  'Bogey? That\'s just Gary. Gary: "I\'m NOT a villain! I\'m misunderstood. And purple."',
  'Bogey at twelve o\'clock! Oh, it\'s Gary. Gary: "Everyone says nobody likes Gary. My mom likes Gary. Bye!"',
  'Bogey? That\'s just Gary. Gary: "Just passing through. No strafing today. I\'m on my lunch break."',
];

// Special dates. m is 0-based (0 = January), like Date.getMonth().
const DATES = [
  { id: 'halloween', on: (m, d) => m === 9 && d === 31 },
  { id: 'christmas', on: (m, d) => m === 11 && d >= 24 && d <= 26 },
  { id: 'aprilFools', on: (m, d) => m === 3 && d === 1 },
];
// April 1: every rank is comically wrong (same count as the real ones in progression.js).
const SILLY_RANKS = [
  'Admiral Of The Submarine Fleet', 'Professional Pedestrian', 'Head Of Ground Operations', 'Junior Gravity Consultant',
  'Wing Inspector (Left Only)', 'Bird (Probationary)', 'Senior Parachute Folder', 'Chief Of Falling With Style',
  'Captain Obvious', 'Lord Of The Landing Gear', 'Grand Duke Of Down', 'Supreme Commander Of Sideways',
];
const APRIL_TEXT = { logo: 'Crashed', tag: 'A serious, realistic flight simulator. Please read the 400-page manual first.', start: 'FALL UPWARDS', points: 'POINTZ', hull: 'HULK', boost: 'ZOOM' };

// The registry. kind: 'keys' (keyboard), 'date', 'feat' (flying) or 'title'. hint: shown on the title card, cryptic.
export const SECRETS = [
  { id: 'konami', name: 'Thirty Lives (Not Included)', kind: 'keys', line: 'Rainbow mode for 30 seconds!', hint: 'Old games remember a code. So does this one.' },
  { id: 'quack', name: 'The Duckening', kind: 'keys', line: 'You said the word. The ducks listened.', hint: 'Some words are louder than others. Especially duck words.' },
  { id: 'gary', name: 'Say His Name', kind: 'keys', line: 'Gary came. Gary went. Gary was harmless.', hint: 'Pilots have a word for an unknown aircraft. It\'s usually Gary.' },
  { id: 'honk', name: 'Golden Honk', kind: 'keys', line: 'The professor approves. Have some golden feathers.', hint: 'Professor Honk answers to what he is.' },
  { id: 'halloween', name: 'Spooky Season', kind: 'date', line: 'Happy Halloween! The trees are spooked and the sky dressed up.', hint: 'Some days, the sky dresses up.' },
  { id: 'christmas', name: 'Snow Day', kind: 'date', line: 'Merry Christmas! The snow is on the house.', hint: 'Some days, the sky dresses up.' },
  { id: 'aprilFools', name: 'Upside-Down Day', kind: 'date', line: 'Happy April 1st. The intern renamed everything.', hint: 'Some days, the sky dresses up.' },
  { id: 'edge', name: 'Edge Of Space', kind: 'feat', line: 'There\'s nothing up here. Go back down.', hint: 'How high is too high?' },
  { id: 'lawnmower', name: 'Lawnmower', kind: 'feat', line: 'Upside down, five metres up. The grass is impressed.', hint: 'The grass needs a trim. From an unusual angle.' },
  { id: 'tinkerer', name: 'Title Tinkerer', kind: 'title', line: 'You clicked the title until it did a barrel roll. Happy?', hint: 'This title has been clicked before. Not enough, though.' },
];
const BY_ID = new Map(SECRETS.map((s) => [s.id, s]));

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Secrets {
  constructor(G) {
    this.G = G;
    this.found = load();
    this.today = null;       // tests: set a Date here (or pass one to checkDate) to pretend it's that day
    this.holiday = null;     // id of today's date secret, if any
    this.keys = [];          // last few key codes (Konami)
    this.word = '';          // last few letters typed
    this.rainbow = 0;        // seconds of rainbow paint left
    this.mow = 0;            // seconds upside down near the ground
    this.mowArmed = true;
    this.edgeArmed = true;
    this.honked = false;     // the golden shower pays once per flight
    this.gary = null;        // { t, side } while Gary flies by
    this.garyModel = null;
    this.clicks = 0;
    this.lastClick = -1e9;
    this.fanfares = 0;       // "Secret found" toasts shown (re-finding one doesn't add)
    this.pending = [];       // found before take-off: announced on the first flying frame
    this.toastQueue = [];
    this.toastTimer = null;
    this.paint = { body: new THREE.Color(), wing: new THREE.Color(), accent: new THREE.Color() };
    this.trailColor = new THREE.Color();
    this.el = {
      count: document.getElementById('secrets-count'), holiday: document.getElementById('holiday'),
      logo: document.getElementById('logo'), tag: document.querySelector('#title .tag'), start: document.getElementById('start'),
    };
    this.buildToast();

    addEventListener('keydown', (e) => { if (!e.repeat) this.feed(e.code); });
    // Click (or tap) the title 7 times in a row, each within 1.5 s of the last.
    this.el.logo.addEventListener('click', () => {
      const now = performance.now();
      this.clicks = now - this.lastClick < TITLE_GAP_MS ? this.clicks + 1 : 1;
      this.lastClick = now;
      if (this.clicks >= TITLE_CLICKS) { this.clicks = 0; this.trigger('tinkerer'); }
    });

    this.booting = true;
    this.checkDate();
    this.booting = false;
    this.refreshTitle();
  }

  // ---------- public API (also G.secrets in the console) ----------

  list() { return SECRETS.map((s) => ({ id: s.id, name: s.name, kind: s.kind, found: this.found.has(s.id) })); }

  // Play a secret's effect and record it. Used by every real trigger, the developer menu and tests.
  trigger(id) {
    const s = BY_ID.get(id);
    if (!s) return false;
    // An Easter egg must never take the game down (date secrets run at boot): a broken effect only warns.
    try { this[`fx_${id}`](); } catch (e) { console.warn(`secret ${id}: effect failed`, e); }
    this.discover(s);
    return true;
  }

  reset() {
    this.found.clear();
    this.pending.length = 0;
    this.honked = false;
    try { localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ }
    this.refreshTitle();
  }

  // One key press. Ignored on the title, while paused and while the developer menu holds the keys.
  feed(code) {
    const G = this.G;
    if (!G.started || G.paused || G.input.lock) return;
    const k = this.keys;
    k.push(code);
    if (k.length > KONAMI.length) k.shift();
    if (k.length === KONAMI.length && k.every((c, i) => c === KONAMI[i])) { k.length = 0; this.trigger('konami'); }
    // Letters only: shooting (Space), boosting (Shift) or arrows mid-word don't break it.
    if (code.length !== 4 || !code.startsWith('Key')) return;
    this.word = (this.word + code[3]).slice(-WORD_MAX);
    for (const w in WORDS) if (this.word.endsWith(w)) { this.word = ''; this.trigger(WORDS[w]); return; }
  }

  // Today's date secret (Halloween, Christmas, April 1). Runs at boot; tests can pass any date.
  checkDate(date = this.today || new Date()) {
    const m = date.getMonth(), d = date.getDate();
    const hit = DATES.find((x) => x.on(m, d));
    if (!hit) return null;
    this.holiday = hit.id;
    this.trigger(hit.id);
    return hit.id;
  }

  // ---------- per frame (flying only) ----------

  update(dt) {
    const G = this.G, p = G.player;
    if (this.pending.length) { for (const s of this.pending) this.fanfare(s); this.pending.length = 0; }

    if (this.rainbow > 0) {
      this.rainbow -= dt;
      if (this.rainbow <= 0) p.model.setSkin(p.skin); // back to the real paint job (even if it changed meanwhile)
      else {
        const h = (G.time * 0.35) % 1, P = this.paint;
        P.body.setHSL(h, 0.85, 0.55); P.wing.setHSL((h + 0.33) % 1, 0.85, 0.7); P.accent.setHSL((h + 0.66) % 1, 0.9, 0.5);
        p.model.setSkin(P);
        if (!p.dead) G.fx.trail(_a.copy(p.pos).addScaledVector(p.forward, -6), this.trailColor.setHSL((G.time * 1.5) % 1, 1, 0.6));
      }
    }

    if (this.gary) this.flyGary(dt);
    if (p.dead) { this.mow = 0; return; }

    // Edge of space: very high up in a zone that isn't space already. Re-arms once you come back down.
    const z = G.zones.current;
    if (p.pos.y > EDGE_ALT) {
      if (this.edgeArmed && z.mood !== 'space' && !z.noGround && !world.cave && !world.underwater) { this.edgeArmed = false; this.trigger('edge'); }
    } else if (p.pos.y < EDGE_ALT - 150) this.edgeArmed = true;

    // Lawnmower: upside down, just above the ground (or sea), for 3 s in a row.
    let low = false;
    if (p.up.y < -0.5) low = p.pos.y - Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z, p.pos.y), waterLine()) < MOW_ALT;
    if (!low) { this.mow = 0; this.mowArmed = true; return; }
    this.mow += dt;
    if (this.mow >= MOW_SECS && this.mowArmed) { this.mowArmed = false; this.trigger('lawnmower'); }
  }

  // ---------- effects (fx_<id>) ----------

  fx_konami() {
    this.rainbow = RAINBOW_SECS;
    this.G.ui.notify(pick(KONAMI_LINES), 'good', 4.5, 2);
  }

  fx_quack() {
    const G = this.G;
    G.audio.quack();
    if (G.zones.current.world.propTheme) { // zones with props of their own (city, reef, cave, candy...) keep them
      G.ui.notify('QUACK. The ducks heard you, but this zone has a dress code. Try somewhere ordinary.', 'info', 4.5, 2);
      return;
    }
    if (world.propTheme !== 'duck') {
      world.propTheme = 'duck';
      G.terrain.rebuildAll();
      G.player.grace = Math.max(G.player.grace, 6);
    }
    G.ui.notify('The Duckening has begun. Houses are ducks now. Boats are ducks now. You did this.', 'good', 4.5, 2);
  }

  fx_gary() {
    const G = this.G;
    if (!this.garyModel) this.garyModel = makeRivalJet(false);
    if (!this.gary) G.scene.add(this.garyModel);
    this.gary = { t: 0, side: Math.random() < 0.5 ? -1 : 1 };
    G.audio.tone(300, 0.6, { type: 'sawtooth', vol: 0.05, slide: 500 });
    G.ui.notify(pick(GARY_LINES), 'info', 4.5, 2);
  }

  // Gary crosses in front of you, left to right (or right to left), a little above your nose. Purely scenery.
  flyGary(dt) {
    const G = this.G, p = G.player, g = this.gary, m = this.garyModel;
    g.t += dt;
    const u = g.t / GARY_SECS;
    if (u >= 1) { G.scene.remove(m); this.gary = null; return; }
    const x = (u * 2 - 1) * 260 * g.side;
    m.position.copy(p.pos).addScaledVector(p.forward, 150).addScaledVector(p.right, x);
    m.position.y += 14 + Math.sin(g.t * 2) * 6;
    m.lookAt(_b.copy(m.position).addScaledVector(p.right, g.side * 75).addScaledVector(p.forward, p.speed));
    m.rotateZ(Math.sin(g.t * 1.3) * 0.5); // a cheeky wing wave
    for (const s of m.userData.spin) s.rotation.z += dt * 40;
  }

  fx_honk() {
    const G = this.G, p = G.player;
    G.audio.honk(); G.audio.honk(1.25, 0.3); // honk, HONK
    if (this.honked) { G.ui.notify('Professor Honk: "HONK." (Translation: "Once per flight, pilot.")', 'info', 3, 1); return; }
    this.honked = true;
    G.score += HONK_POINTS;
    G.fx.emit(_a.copy(p.pos).addScaledVector(p.up, 12), 90, { colors: ['#ffd23a', '#fff1a8', '#ffffff'], speed: 30, life: 2, size: 5, gravity: -20, up: 20 });
    G.ui.notify(`Professor Honk: "HONK." (Translation: "Well flown. Have ${HONK_POINTS} golden points.")`, 'good', 4.5, 2);
  }

  fx_halloween() {
    this.holidayText('🎃 Happy Halloween! The trees are spooked, the sky dressed up, and the bats are free.');
    this.dressWorld({ sky: 'halloween', weather: 'spooky', theme: 'spooky' });
  }

  fx_christmas() {
    this.holidayText('🎄 Merry Christmas! The snow is on the house. Thunderclaus is (probably) off duty.');
    this.dressWorld({ weather: 'snow' });
  }

  fx_aprilFools() {
    const G = this.G, $ = (id) => document.getElementById(id), A = APRIL_TEXT;
    this.holidayText('🃏 Happy April 1st! Nothing here has been changed. Nothing at all.');
    this.el.logo.textContent = A.logo;
    this.el.tag.textContent = A.tag;
    this.el.start.textContent = A.start;
    const label = $('score-label');
    if (label) label.textContent = A.points;
    const bars = document.querySelectorAll('#bars .bar > span');
    if (bars[0]) bars[0].textContent = A.hull;
    if (bars[1]) bars[1].textContent = A.boost;
    G.progress.ranks = SILLY_RANKS;
  }

  fx_edge() {
    const G = this.G;
    G.ui.notify('There\'s nothing up here. Go back down.', 'info', 4.5, 2);
    G.audio.tone(140, 1.4, { type: 'sine', vol: 0.08, slide: -60 });
  }

  fx_lawnmower() {
    const G = this.G, p = G.player;
    G.fx.emit(_a.copy(p.pos).addScaledVector(p.up, 3), 80, { colors: ['#5ac83a', '#8ae05a', '#3a8a2a'], speed: 25, life: 1.4, size: 4, gravity: -30, up: 15 });
    G.ui.notify('Lawnmower! You mowed the lawn upside down. The grass is impressed and slightly scared.', 'good', 4.5, 2);
  }

  fx_tinkerer() {
    const logo = this.el.logo;
    logo.classList.remove('roll');
    void logo.offsetWidth; // restart the animation
    logo.classList.add('roll');
    if (this.G.started) this.G.ui.notify('Somewhere, a title card is doing a barrel roll. You can\'t see it. Trust us.', 'info', 3, 1);
  }

  // ---------- helpers ----------

  // The title card's holiday line.
  holidayText(text) { this.el.holiday.textContent = text; }

  // A holiday look for the world, but only in an ordinary zone (it's the start zone at boot), so caves, the reef,
  // the city and space keep theirs. Zone changes put the zone's own look back.
  dressWorld({ sky, weather, theme }) {
    const G = this.G, z = G.zones.current;
    if (z.mood === 'space' || z.noGround || world.cave || world.underwater || world.city) return;
    if (sky) G.sky.setPreset(sky, !G.started);
    if (weather) G.sky.weather.set(weather);
    if (theme && world.propTheme === 'default') {
      world.propTheme = theme;
      if (G.started) { G.terrain.rebuildAll(); G.player.grace = Math.max(G.player.grace, 6); } // at boot nothing is built yet
    }
  }

  discover(s) {
    if (this.found.has(s.id)) return;
    this.found.add(s.id);
    save(this.found);
    this.refreshTitle();
    if (this.booting) this.pending.push(s); // date secrets: announced once you take off
    else this.fanfare(s);
  }

  fanfare(s) {
    this.fanfares++;
    this.G.audio.sparkle();
    this.toastQueue.push(s);
    if (!this.toastTimer) this.nextToast();
  }

  // Toasts run on real time (setTimeout), so they also show on the title card and the pause screen.
  nextToast() {
    const s = this.toastQueue.shift();
    if (!s) { this.toast.classList.remove('show'); this.toastTimer = null; return; }
    this.toastTitle.textContent = `🥚 Secret found: ${s.name} (${this.found.size}/${SECRETS.length})`;
    this.toastLine.textContent = s.line;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    this.toastTimer = setTimeout(() => this.nextToast(), TOAST_SECS * 1000);
  }

  buildToast() {
    this.toast = document.createElement('div');
    this.toast.id = 'secret-toast';
    this.toastTitle = document.createElement('b');
    this.toastLine = document.createElement('span');
    this.toast.append(this.toastTitle, this.toastLine);
    document.body.append(this.toast);
  }

  // "🥚 Secrets: n/N" on the title card, plus a cryptic hint for one secret still hidden.
  refreshTitle() {
    const n = this.found.size, N = SECRETS.length;
    const left = SECRETS.filter((s) => !this.found.has(s.id));
    const hint = left.length ? `Hint: ${pick(left).hint}` : 'You found them all. Go outside. (Then come back.)';
    this.el.count.textContent = `🥚 Secrets: ${n}/${N} · ${hint}`;
  }
}

function load() {
  try {
    const ids = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(ids)) return new Set(ids.filter((id) => BY_ID.has(id)));
  } catch { /* storage unavailable or garbled: start fresh */ }
  return new Set();
}

function save(found) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...found])); } catch { /* private mode: they're found for this visit */ }
}
