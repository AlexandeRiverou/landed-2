// Hidden finds: rare coins and lore notes tucked where only curious pilots look. One waits somewhere off your path
// at a time: skimming the ground in a dip, behind a peak (on its far side, so the mountain hides it), or high in the
// sky. From far off only a faint twinkle gives it away (a mountain in the way hides the twinkle too). Closer in it gets
// warmer and warmer, without giving the spot away from afar (no pillar or column of light): a
// chime pings faster, higher and louder the nearer you get, panned to its side, the twinkle grows, motes of light drift
// up from it, and the HUD notices ("something glints nearby") with a ring on it or a sparkle at the screen edge. Coins pay points, refill boost and patch the hull; lore
// notes (paper planes) pay points and open a short card. Lore and the coin tally are remembered between visits.
import * as THREE from 'three';
import { rand } from './texts.js';
import { flatForward, groundAt } from './objectives.js';
import { world } from './world.js';
import { curveDrop } from './curve.js';

const LORE_KEY = 'landed.lore', COIN_KEY = 'landed.coins';

// Timing and placement. A find appears first `first` s into a flight, then `every` s after the last one was grabbed
// or lost; it waits `ahead` m in front and `side` m off to one side (never on your line), for `life` s.
export const FINDS = {
  first: 30, every: [45, 75], ahead: [340, 540], side: [70, 170], life: 120, lose: 1600, radius: 16,
  low: 6,          // m over the lowest ground of a dip
  tuck: 22,        // m past a peak, on its far side, and…
  tuckUp: 7,       // …this far over the ground there
  sky: [200, 300], // m over you (or the ground, whichever is higher)
  top: 1080,       // never above this (the soft ceiling starts at 1150)
  chime: 220,      // m: within this the chime pings, every 1.2 s far out down to 0.3 s close in, and the twinkle grows
  hint: 260,       // m: within this the HUD says something glints nearby and marks where
  motes: 200,      // m: within this motes of light drift up from it (not with reduced motion)
  lore: 0.4,       // chance a find is a lore note while notes are left to find
  spots: { low: 0.4, peak: 0.35, sky: 0.25 },
};
export const COIN = { points: 120, hull: 20 };   // and boost refilled to full
export const NOTE = { points: 150, minShow: 7, perWord: 0.32 };

// Short, original notes from around the world. The last one only turns up once every other note is found.
export const LORE = [
  { id: 'dent', title: 'The First Landing', text: 'Nobody remembers who landed here first. The grass remembers. It still has the dent.' },
  { id: 'honk', title: 'Professor Honk\'s Notebook', text: 'Theory: the world goes on forever because nobody has told it to stop. Note to self: do not tell it to stop.' },
  { id: 'gary', title: 'Gary\'s Diary', text: 'Dear diary. Flew past a pilot today. Did not shoot them. Nobody wrote it down, so I am writing it down. Gary.' },
  { id: 'list', title: 'A Shopping List', text: 'Propeller grease. Duck food (the good kind). Something for the noise the left wing makes. A map? There is no map.' },
  { id: 'weather', title: 'Weather Report', text: 'Today: palette change around noon, snow by the third hoop, a fair chance of the sky turning purple. Bring a scarf.' },
  { id: 'peaks', title: 'On Mountains', text: 'The mountains here grow when nobody is looking. That is why old pilots always look.' },
  { id: 'globe', title: 'A Warning, Scratched In Tin', text: 'The Grumbleglobe was a nice planet once. Then somebody ignored its objectives. Do not ignore your objectives.' },
  { id: 'bottle', title: 'Note In A Bottle (Airborne)', text: 'If you found this in the sky, the sky is working as intended. If you found it in the sea, please put it back in the sky.' },
  { id: 'rule7', title: 'Flight School, Rule 7', text: 'Any runway is the right runway if you land on it gently enough. Rule 8: there is no Rule 8, we lost it in a loop.' },
  { id: 'postcard', title: 'A Lost Postcard', text: 'Wish you were here. Here is everywhere, actually, it just keeps going. Love, a pilot who missed the last turn.' },
  { id: 'hoops', title: 'Old Graffiti', text: 'THE HOOPS WERE HERE BEFORE US, carved deep in the rock. Under it, smaller: and they will be here after.' },
  { id: 'last', title: 'The Last Page', text: 'You found every note. The world has no edge, but this pile of paper does. Thank you for looking around.', last: true },
];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export class Finds {
  constructor(G) {
    this.G = G;
    this.off = false;        // tests: no surprise finds while other systems are being measured
    this.find = null;        // { kind: 'coin' | 'note', spot, note, mesh, glint, pos, life, t, ping }
    this.timer = FINDS.first;
    this.runCoins = 0;
    this.runNotes = 0;
    this.hinted = false;
    this.lore = loadLore();
    this.coins = loadCoins();
    this.build();
    this.buildCard();
    this.buildPip();
    this.refreshTitle();
  }

  // ---------- public API (also G.finds in the console and the developer menu) ----------

  loreLeft() { return LORE.filter((n) => !this.lore.has(n.id)); }

  // Put a find in the world now: kind 'coin' or 'note', at pos, or (no pos) in a hidden spot ahead.
  drop(kind = 'coin', pos = null, spot = null) {
    this.clear();
    const note = kind === 'note' ? this.nextNote() : null;
    if (kind === 'note' && !note) kind = 'coin';
    if (!pos) ({ pos, spot } = this.hidingSpot(spot));
    else spot = spot || 'here';
    const mesh = kind === 'note' ? this.noteMesh : this.coinMesh;
    mesh.position.copy(pos);
    mesh.visible = true;
    this.glint.material.color.set(kind === 'note' ? '#dff4ff' : '#fff0a0');
    this.glint.position.copy(pos);
    this.glint.visible = true;
    this.pip.classList.toggle('note', kind === 'note');
    this.G.scene.add(mesh, this.glint);
    this.find = { kind, spot, note, mesh, pos: mesh.position, base: pos.y, life: FINDS.life, t: Math.random() * 6, ping: 0, mote: 0, near: false };
    if (!this.hinted) {
      this.hinted = true;
      this.G.ui.notify('✨ Something glints out there. Hidden treasures hide low over the ground, behind peaks and up high.', 'info', 5, 1);
    }
    return this.find;
  }

  clear() {
    if (!this.find) return;
    this.G.scene.remove(this.find.mesh, this.glint);
    this.pip.style.display = 'none';
    this.find = null;
  }

  // A fresh run after a Game Over: nothing waiting out there, the clock starts over. Lore and coins found stay found.
  resetRun() {
    this.clear();
    this.timer = FINDS.first;
    this.runCoins = 0;
    this.runNotes = 0;
  }

  // Forget lore read and coins counted (developer menu, tests).
  reset() {
    this.lore.clear();
    this.coins = 0;
    try { localStorage.removeItem(LORE_KEY); localStorage.removeItem(COIN_KEY); } catch { /* storage unavailable */ }
    this.refreshTitle();
  }

  // ---------- placement ----------

  nextNote() {
    const left = this.loreLeft();
    if (!left.length) return null;
    const pool = left.length > 1 ? left.filter((n) => !n.last) : left;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Somewhere ahead and off to one side, then tucked low, behind a peak or up high.
  hidingSpot(force = null) {
    const G = this.G, p = G.player;
    const f = flatForward(G), side = _w.set(-f.z, 0, f.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
    const base = p.pos.clone().addScaledVector(f, rand(...FINDS.ahead)).addScaledVector(side, rand(...FINDS.side));
    const ground = (x, z) => groundAt(G, x, z, p.pos.y);
    let spot = FINDS.spots[force] ? force : pickWeighted(FINDS.spots);
    if (world.floor < -200) spot = 'sky'; // islands over a far-off floor: no ground worth hugging
    const pos = base.clone();
    if (spot === 'low') {
      // The lowest of a few points around: a dip, a valley floor, a canyon.
      let best = ground(base.x, base.z);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2, x = base.x + Math.cos(a) * 70, z = base.z + Math.sin(a) * 70, g = ground(x, z);
        if (g < best) { best = g; pos.set(x, 0, z); }
      }
      pos.y = best + FINDS.low;
    } else if (spot === 'peak') {
      // The highest of a ring of points, then a little past it, away from you: the peak hides it until you go round.
      let best = -Infinity, px = base.x, pz = base.z;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, r = k % 2 ? 180 : 90;
        const x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r, g = ground(x, z);
        if (g > best) { best = g; px = x; pz = z; }
      }
      _v.set(px - p.pos.x, 0, pz - p.pos.z).normalize();
      pos.set(px + _v.x * FINDS.tuck, 0, pz + _v.z * FINDS.tuck);
      pos.y = ground(pos.x, pos.z) + FINDS.tuckUp;
    } else {
      pos.y = Math.min(FINDS.top, Math.max(p.pos.y, ground(base.x, base.z)) + rand(...FINDS.sky));
      if (world.floor < -200) pos.y = Math.min(FINDS.top, p.pos.y + rand(-40, 120));
    }
    // Under a roof (caverns, the reef's surface, a tunnel): keep it in the air between floor and roof.
    const g = ground(pos.x, pos.z), roof = G.terrain.ceilingHeight(pos.x, pos.z, pos.y);
    pos.y = Math.max(pos.y, g + 5);
    if (pos.y > roof - 12) pos.y = roof - g < 30 ? (g + roof) / 2 : roof - 12;
    return { pos, spot };
  }

  // ---------- per frame ----------

  update(dt) {
    const G = this.G, p = G.player;
    if (!this.find) {
      if (this.off || p.dead) return;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = rand(...FINDS.every);
        this.drop(this.loreLeft().length && Math.random() < FINDS.lore ? 'note' : 'coin');
      }
      return;
    }
    const k = this.find;
    k.life -= dt;
    k.t += dt;
    // Coins spin; paper planes circle lazily on the spot.
    if (k.kind === 'coin') k.mesh.rotation.y += dt * 2.6;
    else { k.mesh.rotation.y = -k.t * 1.1; k.mesh.rotation.z = Math.sin(k.t * 2) * 0.25; }
    k.pos.y = k.base + Math.sin(k.t * 1.8) * 1.2;
    // The twinkle: dim most of the time, a bright flash about every 1.6 s. A mountain in front hides it.
    const flash = Math.max(0, Math.sin(k.t * 3.9)) ** 12;
    this.glint.position.copy(k.pos);
    const d = k.pos.distanceTo(p.pos), close = clamp01(1 - d / FINDS.chime), still = G.comfort?.reducedMotion;
    // Within 220 m the twinkle grows (about 2.5x its far-off size right next to it) and never quite dims.
    this.glint.material.opacity = Math.max(0.35 + 0.65 * flash, 0.4 + 0.5 * close);
    this.glint.material.rotation = still ? 0 : k.t * 0.6;
    this.glint.scale.setScalar(0.028 + 0.03 * flash + 0.045 * close);

    if (!p.dead && d < FINDS.radius * G.progress.pickupMul * Math.max(1, p.sizeScale)) { this.collect(); return; }
    // Motes of light drifting up from it.
    if (!p.dead && !still && d < FINDS.motes) {
      k.mote -= dt;
      if (k.mote <= 0) {
        k.mote = 0.22;
        _c.set(k.pos.x + rand(-4, 4), k.pos.y + rand(-2, 2), k.pos.z + rand(-4, 4));
        G.fx.emit(_c, 2, { colors: k.kind === 'note' ? ['#dff4ff', '#ffffff'] : ['#ffe27a', '#fff6c0'], speed: 4, life: 1.6, size: 3.5, up: 8, drag: 0.6 });
      }
    }
    // The HUD notices: one line the first time you come near, then a ring on it (or a sparkle at the screen edge
    // pointing its way) that firms up as you close in.
    if (!p.dead && d < FINDS.hint) {
      if (!k.near) { k.near = true; G.ui.notify(`✨ Something glints nearby, ${this.whereIs(k.pos)}.`, 'info', 3.5, 1); }
      this.updatePip(k.pos, d);
    } else this.pip.style.display = 'none';
    // Warmer, warmer: a chime that speeds up and rises as you close in, on the side it's on.
    if (!p.dead && d < FINDS.chime) {
      k.ping -= dt;
      if (k.ping <= 0) {
        const c = d / FINDS.chime;
        k.ping = 0.3 + 0.9 * c;
        const pan = THREE.MathUtils.clamp(_v.subVectors(k.pos, p.pos).normalize().dot(p.right), -1, 1) * 0.8;
        G.audio.ping(pan, 1.5 - 0.6 * c, 0.07 + 0.11 * (1 - c));
      }
    }
    if (k.life <= 0 || d > FINDS.lose) { this.clear(); }
  }

  // Which way it is, in words, from the plane's point of view.
  whereIs(pos) {
    const p = this.G.player, rel = _v.subVectors(pos, p.pos);
    const fwd = rel.dot(p.forward), right = rel.dot(p.right), up = rel.y;
    if (fwd < -Math.abs(right)) return 'behind you';
    if (up > 60 && up > Math.abs(right)) return 'high above';
    if (up < -60 && -up > Math.abs(right)) return 'down low';
    if (Math.abs(right) > fwd * 0.5) return right > 0 ? 'off to your right' : 'off to your left';
    return 'just ahead';
  }

  // A ring on the find when it's on screen, a pulsing sparkle at the screen edge when it isn't.
  updatePip(pos, d) {
    const cam = this.G.camera, el = this.pip, w = innerWidth, h = innerHeight;
    const t = _c.copy(pos);
    t.y -= curveDrop(t.x, t.z, cam.position); // on a tiny planet, mark where it's drawn
    _v.copy(t).applyMatrix4(cam.matrixWorldInverse);
    const behind = _v.z > 0, camX = _v.x, camY = _v.y;
    _v.copy(t).project(cam);
    const on = !behind && Math.abs(_v.x) < 0.94 && Math.abs(_v.y) < 0.9;
    el.style.display = 'block';
    el.style.opacity = (0.35 + 0.65 * clamp01(1 - d / FINDS.hint)).toFixed(2);
    el.classList.toggle('edge', !on);
    el.classList.toggle('still', !!this.G.comfort?.reducedMotion);
    if (on) {
      el.style.left = `${((_v.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - _v.y) / 2) * h}px`;
    } else {
      const ang = Math.atan2(camY, camX);
      el.style.left = `${w / 2 + Math.cos(ang) * (w / 2 - 40)}px`;
      el.style.top = `${h / 2 - Math.sin(ang) * (h / 2 - 50)}px`;
    }
  }

  collect() {
    const G = this.G, p = G.player, k = this.find;
    const at = k.pos.clone();
    this.clear();
    if (k.kind === 'coin') {
      this.runCoins++;
      this.coins++;
      saveCoins(this.coins);
      G.score += COIN.points;
      p.boost = 1;
      p.health = Math.min(p.maxHealth, p.health + COIN.hull);
      G.fx.emit(at, 70, { colors: ['#ffd23a', '#fff3a0', '#ffffff'], speed: 45, life: 1.1, size: 5, up: 15 });
      G.fx.popText(at, `🪙 Hidden coin! +${COIN.points}`);
      G.audio.sparkle();
      G.audio.ding(1.25);
      const where = { low: 'Ground skimmer!', peak: 'Peak peeker!', sky: 'Cloud diver!' }[k.spot] || 'Sharp eyes!';
      G.ui.notify(`🪙 ${where} Boost refilled, +${COIN.hull} hull. ${this.runCoins > 1 ? `${this.runCoins} coins this flight.` : ''}`.trim(), 'good', 3.5, 1);
    } else {
      this.runNotes++;
      this.lore.add(k.note.id);
      saveLore(this.lore);
      G.score += NOTE.points;
      G.fx.emit(at, 60, { colors: ['#fff8e0', '#dff4ff', '#ffffff'], speed: 35, life: 1.4, size: 5, up: 10 });
      G.fx.popText(at, `📜 Lore note! +${NOTE.points}`);
      G.audio.success();
      this.showNote(k.note);
    }
    this.refreshTitle();
  }

  // ---------- meshes ----------

  build() {
    // A gold coin with a rim, and a folded paper plane: one of each, reused (only one find is out at a time).
    const coin = new THREE.Group();
    const gold = new THREE.MeshLambertMaterial({ color: '#ffcf3a', emissive: '#b07a00', emissiveIntensity: 0.55, flatShading: true });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.9, 20), gold);
    face.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 6, 24), new THREE.MeshLambertMaterial({ color: '#e0a020', emissive: '#7a5000', emissiveIntensity: 0.5 }));
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), new THREE.MeshBasicMaterial({ color: '#fff6c0' }));
    star.scale.set(1, 1, 0.9);
    coin.add(face, rim, star);
    coin.scale.setScalar(1.3);
    this.coinMesh = coin;

    const paper = new THREE.MeshLambertMaterial({ color: '#fffaf0', emissive: '#806a40', emissiveIntensity: 0.35, side: THREE.DoubleSide, flatShading: true });
    const plane = new THREE.Group();
    const g = new THREE.BufferGeometry();
    // Nose at +z; two wings folded up from a centre keel.
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 4, -3.2, 0.9, -3, 0, -0.6, -3,
      0, 0, 4, 0, -0.6, -3, 3.2, 0.9, -3,
    ], 3));
    g.computeVertexNormals();
    const body = new THREE.Mesh(g, paper);
    body.position.x = 9; // circles a small loop around its spot
    const seal = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ color: '#d8343a' }));
    seal.position.set(9, 0.2, -1.6);
    plane.add(body, seal);
    plane.scale.setScalar(1.4);
    this.noteMesh = plane;

    // The twinkle: a four-point star that keeps its size on screen, so you can spot it from far off.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grad;
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = i % 2 ? 7 : 32;
      x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    x.fill();
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending,
    }));
    this.glint.scale.setScalar(0.03);
  }

  buildPip() {
    const pip = document.createElement('div');
    pip.id = 'find-pip';
    const ring = document.createElement('div');
    ring.className = 'ring';
    const spark = document.createElement('div');
    spark.className = 'spark';
    spark.textContent = '✨';
    pip.append(ring, spark);
    (document.getElementById('ui') || document.body).append(pip); // under the pause and game over overlays
    this.pip = pip;
  }

  // ---------- the lore card (no pause: tap or click it to put it away, or it folds away by itself) ----------

  buildCard() {
    const card = document.createElement('div');
    card.id = 'lore-card';
    card.setAttribute('role', 'status');
    this.cardCount = document.createElement('div');
    this.cardCount.className = 'lore-count';
    this.cardTitle = document.createElement('b');
    this.cardText = document.createElement('p');
    const hint = document.createElement('div');
    hint.className = 'lore-hint';
    hint.textContent = 'tap to fold away';
    card.append(this.cardCount, this.cardTitle, this.cardText, hint);
    card.addEventListener('click', () => this.hideNote());
    document.body.append(card);
    this.card = card;
    this.cardTimer = null;
  }

  showNote(note) {
    this.cardCount.textContent = `📜 Lore ${this.lore.size}/${LORE.length}`;
    this.cardTitle.textContent = note.title;
    this.cardText.textContent = note.text;
    this.card.classList.add('show');
    clearTimeout(this.cardTimer);
    const secs = Math.max(NOTE.minShow, note.text.split(/\s+/).length * NOTE.perWord);
    this.cardTimer = setTimeout(() => this.hideNote(), secs * 1000);
    this.shown = note.id;
  }

  hideNote() {
    clearTimeout(this.cardTimer);
    this.card.classList.remove('show');
  }

  // "📜 Lore n/N · 🪙 k hidden coins" on the title card, or a nudge before the first find.
  refreshTitle() {
    const el = document.getElementById('finds-count');
    if (!el) return;
    const n = this.lore.size;
    el.textContent = n || this.coins
      ? `📜 Lore ${n}/${LORE.length} · 🪙 ${this.coins} hidden coin${this.coins === 1 ? '' : 's'} found${n === LORE.length ? ' · every note read!' : ''}`
      : '✨ Hidden coins and lore notes glint out there. Look low, look behind peaks, look up.';
  }
}

function pickWeighted(w) {
  let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return Object.keys(w)[0];
}

function loadLore() {
  try {
    const ids = JSON.parse(localStorage.getItem(LORE_KEY) || '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => LORE.some((n) => n.id === id)) : []);
  } catch { return new Set(); }
}
function saveLore(set) { try { localStorage.setItem(LORE_KEY, JSON.stringify([...set])); } catch { /* storage unavailable */ } }
function loadCoins() {
  try { const n = Number(localStorage.getItem(COIN_KEY)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; } catch { return 0; }
}
function saveCoins(n) { try { localStorage.setItem(COIN_KEY, String(n)); } catch { /* storage unavailable */ } }
