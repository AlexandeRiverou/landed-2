// The Hangar and the Lore shelf: two panels off the title card (and the Game Over card).
// Hangar: hidden coins (finds.js, a lifetime tally) buy planes. Your wallet is the coins you ever found minus the price
// of every plane you own, so it can never go wrong when a price changes. Planes are sidegrades: each trades a little
// of one thing for a little of another. The plane you pick flies from the next fresh run (at once on the title card)
// and is remembered. The panel has a slot (`paint`) for the paint shop that comes later (rank-unlocked colours).
// Lore: every note you've read, in order; the ones still out there show as "???", the last one stays sealed until
// the other eleven are found. All in-game coins only: nothing here costs money.
import { LORE } from './finds.js';

const OWN_KEY = 'landed.hangar', PLANE_KEY = 'landed.plane';

// mods multiply BASE_STATS (player.js); `speed` multiplies BASE_SPEED (the speed mutation still stacks on top),
// `hull` replaces BASE_HEALTH (perks still add to it).
export const PLANES = [
  { id: 'pup', name: 'Sky Pup', price: 0, look: 'The plane you know. Never lets you down, rarely shows off.', perks: 'Balanced: nothing up, nothing down.', mods: {} },
  { id: 'dart', name: 'Dart', price: 3, look: 'All wing, no patience. Swept delta, no tailplane.', perks: '+8% speed, boost refills 15% faster, 10% less hull.', mods: { speed: 1.08, boostRegen: 1.15, hull: 90 } },
  { id: 'bee', name: 'Bumblebee', price: 7, look: 'Two wings, one opinion, very sturdy.', perks: '+25% hull, mends 25% faster, 6% slower, boost drains 10% faster.', mods: { hull: 125, regen: 1.25, speed: 0.94, boostDrain: 1.1 } },
  { id: 'hornet', name: 'Twin Hornet', price: 12, look: 'Twice the tail, half the leg room.', perks: '+12% fire rate, boost lasts 10% longer, 10% less hull.', mods: { fireRate: 1.12, boostDrain: 0.9, hull: 90 } },
];
const byId = (id) => PLANES.find((p) => p.id === id);

export class Hangar {
  constructor(G) {
    this.G = G;
    this.owned = loadOwned();
    const sel = load(PLANE_KEY);
    this.selected = this.owned.has(sel) ? sel : 'pup';
    this.panels = {};
    this.buildButtons();
    this.buildHangar();
    this.buildLore();
    document.addEventListener('keydown', (e) => {
      const open = this.openPanel();
      if (!open) return;
      if (e.code === 'Escape') { this.close(); e.preventDefault(); }
      e.stopPropagation(); // the game's keys sleep while a panel is open: Enter never takes off, Space never flies again
    }, true);
    if (this.selected !== 'pup') G.player.usePlane(byId(this.selected));
    this.refresh();
  }

  // ---------- public API (also G.hangar in the console and tests) ----------

  get coins() { return this.G.finds?.coins || 0; }
  get spent() { return [...this.owned].reduce((a, id) => a + (byId(id)?.price || 0), 0); }
  get wallet() { return Math.max(0, this.coins - this.spent); }
  openPanel() { return Object.keys(this.panels).find((k) => !this.panels[k].el.classList.contains('hidden')) || null; }

  buy(id) {
    const p = byId(id);
    if (!p || this.owned.has(id) || this.wallet < p.price) return false;
    this.owned.add(id);
    save(OWN_KEY, JSON.stringify([...this.owned]));
    this.toast('Keys handed over. Mind the paint.');
    this.fly(id);
    return true;
  }

  fly(id) {
    if (!this.owned.has(id) || !byId(id)) return false;
    this.selected = id;
    save(PLANE_KEY, id);
    this.G.player.usePlane(byId(id));
    if (this.G.started) this.toast(`${byId(id).name} is fuelled up for your next flight.`);
    this.refresh();
    return true;
  }

  open(which) {
    this.close();
    this.opener = document.activeElement;
    this.refresh();
    this.panels[which].el.classList.remove('hidden');
    this.panels[which].el.querySelector('button:not(:disabled)')?.focus();
  }

  close() {
    for (const k in this.panels) this.panels[k].el.classList.add('hidden');
    if (this.opener?.focus) this.opener.focus({ preventScroll: true });
    this.opener?.blur?.(); // Space and Enter must not re-click a menu button
    this.opener = null;
  }

  // The menu buttons' counts, and the open panel's rows.
  refresh() {
    const n = this.G.finds?.lore?.size || 0;
    for (const b of this.hangarBtns || []) b.textContent = `🛩️ HANGAR · 🪙 ${this.wallet}`;
    for (const b of this.loreBtns || []) b.textContent = `📜 LORE · ${n}/${LORE.length}`;
    // The title card's finds line stays only as the nudge before your first find: after that the buttons say it all.
    document.getElementById('finds-count')?.classList.toggle('hidden', n > 0 || this.coins > 0);
    if (this.panels.hangar) this.fillHangar();
    if (this.panels.lore) this.fillLore();
  }

  // ---------- building ----------

  buildButtons() {
    this.hangarBtns = []; this.loreBtns = [];
    const row = (before) => {
      if (!before) return;
      const r = document.createElement('div');
      r.className = 'menu-row';
      const h = button('menu-btn', () => this.open('hangar'));
      const l = button('menu-btn', () => this.open('lore'));
      r.append(h, l);
      before.before(r);
      this.hangarBtns.push(h); this.loreBtns.push(l);
    };
    row(document.querySelector('#title .desktop-row'));
    row(document.getElementById('again'));
  }

  panel(id, title) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'overlay menu-panel hidden';
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h2');
    h.textContent = title;
    const sub = document.createElement('p');
    sub.className = 'panel-sub';
    const list = document.createElement('div');
    list.className = 'panel-list';
    const back = button('panel-back', () => this.close());
    back.textContent = 'BACK';
    card.append(h, sub, list, back);
    el.append(card);
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
    document.body.append(el);
    return { el, sub, list };
  }

  buildHangar() {
    this.panels.hangar = this.panel('hangar', '🛩️ Hangar');
    // Paint shop slot (rank-unlocked colours, a later task) goes here, above the planes.
    this.panels.hangar.paint = document.createElement('div');
    this.panels.hangar.paint.className = 'paint-slot';
    this.panels.hangar.list.before(this.panels.hangar.paint);
  }

  buildLore() { this.panels.lore = this.panel('lore-book', '📜 Lore'); }

  fillHangar() {
    const P = this.panels.hangar;
    P.sub.textContent = `🪙 ${this.wallet} coin${this.wallet === 1 ? '' : 's'} to spend · hidden coins hide low, behind peaks and up high`;
    P.list.replaceChildren(...PLANES.map((p) => {
      const row = document.createElement('div');
      row.className = 'plane-row';
      row.dataset.plane = p.id;
      const info = document.createElement('div');
      info.className = 'plane-info';
      const name = document.createElement('b');
      name.textContent = p.price ? `${p.name} · 🪙 ${p.price}` : `${p.name} · free`;
      const look = document.createElement('span');
      look.textContent = p.look;
      const perks = document.createElement('span');
      perks.className = 'plane-perks';
      perks.textContent = p.perks;
      info.append(name, look, perks);
      const own = this.owned.has(p.id), flying = this.selected === p.id;
      const b = button('plane-btn', () => (own ? this.fly(p.id) : this.buy(p.id)));
      if (flying) { b.textContent = 'FLYING'; b.disabled = true; b.classList.add('flying'); }
      else if (own) b.textContent = 'FLY THIS';
      else if (this.wallet >= p.price) b.textContent = 'BUY';
      else { b.textContent = `NEED ${p.price - this.wallet} MORE`; b.disabled = true; }
      row.append(info, b);
      return row;
    }));
  }

  fillLore() {
    const P = this.panels.lore, read = this.G.finds?.lore || new Set();
    const others = LORE.filter((n) => !n.last);
    const allOthers = others.every((n) => read.has(n.id));
    P.sub.textContent = `${read.size}/${LORE.length} notes found${read.size === LORE.length ? ' · every note read!' : ''}`;
    P.list.replaceChildren(...LORE.map((n, i) => {
      const row = document.createElement('div');
      row.className = 'lore-row';
      row.dataset.note = n.id;
      const t = document.createElement('b');
      const p = document.createElement('p');
      if (read.has(n.id)) { t.textContent = `${i + 1}. ${n.title}`; p.textContent = n.text; }
      else if (n.last && !allOthers) { row.classList.add('locked'); t.textContent = `${i + 1}. 🔒 Sealed`; p.textContent = `Find the other ${others.length} first.`; }
      else { row.classList.add('locked'); t.textContent = `${i + 1}. ???`; p.textContent = 'Still out there.'; }
      row.append(t, p);
      return row;
    }));
  }

  toast(text) { this.G.ui?.notify?.(text, 'good', 3); }
}

function button(cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}
function load(key) { try { return localStorage.getItem(key); } catch { return null; } }
function save(key, v) { try { localStorage.setItem(key, v); } catch { /* storage unavailable */ } }
function loadOwned() {
  const set = new Set(['pup']);
  try {
    const ids = JSON.parse(load(OWN_KEY) || '[]');
    if (Array.isArray(ids)) for (const id of ids) if (byId(id)) set.add(id);
  } catch { /* broken save: start with the Sky Pup */ }
  return set;
}
