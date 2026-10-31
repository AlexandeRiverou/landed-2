// Secret developer menu for testing: hold 1 and 0 together for 3 seconds mid-flight (on touch screens: one finger
// in each top corner). Jump to any zone, boss or objective, grab power-ups, and cheat. The game pauses while it's open.
import { ZONES } from './zones.js';
import { BOSSES, BOSS_MODS } from './enemies.js';
import { OBJECTIVE_TYPES } from './objectives.js';
import { POWERUPS } from './powerups.js';
import { xpForLevel } from './progression.js';

const HOLD_MS = 3000;
const ONE = ['Digit1', 'Numpad1'], ZERO = ['Digit0', 'Numpad0'];
const CHORD_KEYS = new Set([...ONE, ...ZERO]); // the only keys the game still tracks while the menu is open
// Touch chord: a finger in each top corner. Corner size is 15% of the width, kept between 60 and 120 px.
const cornerSize = () => Math.max(60, Math.min(120, innerWidth * 0.15));
function cornersHeld(touches) {
  const c = cornerSize();
  let left = false, right = false;
  for (const t of touches) {
    if (t.clientY > c) continue;
    if (t.clientX <= c) left = true;
    else if (t.clientX >= innerWidth - c) right = true;
  }
  return left && right;
}

// Tiny DOM helper: text always goes in through textContent.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class DevMenu {
  constructor(G) {
    this.G = G;
    this.isOpen = false;
    this.since = null;   // performance.now() when the chord started (drives the hint pill)
    this.timer = null;   // fires HOLD_MS after the chord is complete; key events, not frames, so slow devices still get it
    this.down = new Set(); // chord keys held right now (tracked here: Input clears its keys on blur and while locked)
    this.corners = false;  // both top corners touched right now
    this.objButtons = new Map();
    this.build();
    addEventListener('keydown', (e) => {
      // Esc closes the menu. Input (whose listener was added first) ignores every key but the chord while it's
      // open, so Esc doesn't also reach the pause toggle.
      if (this.isOpen && e.code === 'Escape') { e.preventDefault(); this.close(); }
      // Auto-repeat is ignored, so after the chord toggles the menu you have to let go before it can again.
      if (CHORD_KEYS.has(e.code) && !e.repeat) { this.down.add(e.code); this.arm(); }
    });
    addEventListener('keyup', (e) => { if (CHORD_KEYS.has(e.code)) { this.down.delete(e.code); this.disarm(); } });
    // Touches are recounted from e.touches on every event, so a finger sliding out of its corner cancels too.
    // Passive and on window: Input's canvas and button handlers still get every touch, and it works over the menu.
    const touch = (e) => { this.corners = cornersHeld(e.touches); if (this.corners) this.arm(); else this.disarm(); };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) addEventListener(type, touch, { passive: true });
    addEventListener('blur', () => { this.down.clear(); this.corners = false; this.disarm(); });
  }

  chordHeld() { return this.corners || (ONE.some((c) => this.down.has(c)) && ZERO.some((c) => this.down.has(c))); }

  arm() {
    if (this.timer || !this.G.started || !this.chordHeld()) return;
    this.since = performance.now();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.since = null;
      this.hint.classList.add('hidden');
      if (this.isOpen) this.close(); else this.open();
    }, HOLD_MS);
  }

  disarm() {
    if (this.chordHeld()) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.since = null;
    this.hint.classList.add('hidden');
  }

  // ---------- DOM ----------

  build() {
    const G = this.G;
    this.hint = el('div', 'hidden');
    this.hint.id = 'dev-hint';
    this.hintText = el('div');
    const track = el('div', 'track');
    this.hintFill = el('div');
    track.append(this.hintFill);
    this.hint.append(this.hintText, track);

    this.root = el('div', 'overlay hidden');
    this.root.id = 'devmenu';
    const card = el('div', 'card');
    const head = el('div', 'dev-head');
    const close = el('button', 'dev-close', '✕');
    close.title = 'Close (Esc)';
    close.addEventListener('click', () => this.close());
    head.append(el('h1', null, '🛠️ Developer menu'), close);
    card.append(head);

    const section = (title) => {
      const grid = el('div', 'dev-grid');
      card.append(el('h2', null, title), grid);
      return grid;
    };
    const button = (grid, label, fn, title) => {
      const b = el('button', null, label);
      if (title) b.title = title;
      b.addEventListener('click', () => fn(b));
      grid.append(b);
      return b;
    };

    const zones = section('Zones');
    ZONES.forEach((z, i) => { button(zones, `${i + 1}. ${z.name}`, () => this.enterZone(i), z.blurb).dataset.zone = i; });

    const bosses = section('Bosses');
    const opts = el('div', 'dev-opts');
    const modLabel = el('label', null, 'Modifier ');
    this.mod = el('select');
    this.mod.append(el('option', null, 'none'));
    this.mod.options[0].value = '';
    for (const [id, m] of Object.entries(BOSS_MODS)) { const o = el('option', null, m.prefix); o.value = id; this.mod.append(o); }
    modLabel.append(this.mod);
    const duoLabel = el('label');
    this.duo = el('input');
    this.duo.type = 'checkbox';
    duoLabel.append(this.duo, document.createTextNode(' Twins'));
    opts.append(modLabel, duoLabel);
    bosses.before(opts);
    for (const [kind, def] of Object.entries(BOSSES)) button(bosses, def.short, () => this.startBoss(kind), def.desc).dataset.boss = kind;

    const objectives = section('Objectives');
    for (const type of OBJECTIVE_TYPES) {
      const b = button(objectives, type, () => this.startObjective(type));
      b.dataset.objective = type;
      this.objButtons.set(type, b);
    }

    const powerups = section('Power-ups');
    for (const [id, p] of Object.entries(POWERUPS)) button(powerups, `${p.icon} ${p.name}`, () => G.powerups.activate(id), p.text);

    const cheats = section('Cheats & tools');
    this.godBtn = button(cheats, '', () => this.toggleGod(), 'No damage, no crashing');
    this.relaxBtn = button(cheats, '', () => { G.setRelax(!G.relax); this.refresh(); });
    button(cheats, 'Complete objective', () => this.completeObjective());
    button(cheats, 'Level up', () => this.levelUp());
    button(cheats, 'Clear enemies', () => this.clearEnemies());

    this.root.append(card);
    document.body.append(this.hint, this.root);
  }

  // Labels and enabled states that depend on the game right now.
  refresh() {
    const G = this.G;
    this.godBtn.textContent = `😇 God mode: ${G.player.god ? 'ON' : 'off'}`;
    this.godBtn.classList.toggle('on', G.player.god);
    this.relaxBtn.textContent = `☁️ Relax Mode: ${G.relax ? 'ON' : 'off'}`;
    this.relaxBtn.classList.toggle('on', G.relax);
    for (const [type, b] of this.objButtons) {
      const ok = G.zones.allowsObjective(type);
      b.disabled = !ok;
      b.title = ok ? '' : `${G.zones.current.name} doesn't offer this objective`;
    }
  }

  // ---------- open / close ----------

  // Called every frame (paused or not). Real time, so a slow frame rate can't stretch the hold.
  // Per frame: only the hint pill. Opening and closing run on the timer from arm().
  update() {
    if (this.since === null) return;
    const t = Math.min(HOLD_MS, performance.now() - this.since);
    this.hint.classList.remove('hidden');
    this.hintText.textContent = `${this.isOpen ? 'Closing' : 'Developer menu'}… ${Math.ceil((HOLD_MS - t) / 1000)}s`;
    this.hintFill.style.width = `${(t / HOLD_MS) * 100}%`;
  }

  open() {
    const G = this.G;
    if (this.isOpen || !G.started) return;
    this.isOpen = true;
    G.paused = true;
    G.input.lock = CHORD_KEYS;
    G.audio.setEngine(0, false);
    G.audio.music?.duck(true);
    this.refresh();
    this.root.classList.remove('hidden');
  }

  close() {
    const G = this.G;
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    G.input.lock = null;
    document.activeElement?.blur(); // Space must shoot, not click the last menu button again
    // Back to whatever the pause card says: if the menu was opened over the Pause card, stay paused.
    G.paused = !document.getElementById('pause').classList.contains('hidden');
    if (!G.paused) G.audio.music?.duck(false);
  }

  // ---------- actions ----------

  enterZone(i) {
    this.G.zones.enter(i);
    this.G.zones.sinceZone = 0; // a full zone's worth of objectives before the journey moves on
    this.close();
  }

  // The current objective makes way; relax mode would only suspend the new one, so it ends too.
  clearObjective() {
    const G = this.G;
    if (G.relax) G.setRelax(false);
    if (G.objectives.current) { G.objectives.current.dispose(G); G.objectives.current = null; }
  }

  startBoss(kind) {
    const G = this.G, def = BOSSES[kind];
    this.clearObjective();
    const duo = this.duo.checked && !def.ground; // the fort never comes as twins
    const obj = G.objectives.makeBoss(kind, { mod: this.mod.value || null, duo });
    G.objectives.start(obj, 'boss');
    if (obj.boss !== kind) G.ui.notify(`No room for ${def.short} here (it needs flat land), so ${BOSSES[obj.boss].short} came instead.`, 'warn', 4, 2);
    else if (this.duo.checked && !duo) G.ui.notify(`${def.short} doesn't do twins. Just the one.`, 'info', 3, 2);
    this.close();
  }

  startObjective(type) {
    const G = this.G;
    if (!G.zones.allowsObjective(type)) return;
    this.clearObjective();
    G.objectives.startType(type);
    this.close();
  }

  toggleGod() {
    const p = this.G.player;
    p.god = !p.god;
    this.G.ui.notify(p.god ? '😇 God mode on. Nothing can touch you.' : 'God mode off. Mortal again.', 'info', 3, 2);
    this.refresh();
  }

  completeObjective() {
    const G = this.G;
    if (!G.objectives.current) { G.ui.notify('No objective to complete right now.', 'info', 3, 2); return; }
    G.objectives.complete(false);
  }

  levelUp() {
    const G = this.G;
    G.score = Math.max(G.score, xpForLevel(G.progress.level + 1));
    G.progress.update(0);
  }

  // Everything hostile goes, except what an objective needs (bosses, hunt targets...).
  clearEnemies() {
    const G = this.G, E = G.enemies;
    E.list.filter((e) => !e.quest).forEach((e) => E.removeEnemy(e));
    for (const s of E.shots) G.scene.remove(s.mesh);
    E.shots.length = 0;
    G.ui.notify('Sky swept clean.', 'info', 2, 2);
  }
}
