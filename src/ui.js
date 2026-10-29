// DOM HUD: score, objective card, notifications, banner, target marker + edge arrow.
import * as THREE from 'three';
import { curveDrop } from './curve.js';

const $ = (id) => document.getElementById(id);
const MAX_NOTES = 2;   // on screen at once
const MAX_QUEUE = 3;   // waiting; anything beyond this is dropped
const _v = new THREE.Vector3(), _t = new THREE.Vector3();

export class UI {
  constructor(G) {
    this.G = G;
    this.el = {
      score: $('score'), stats: $('stats'), obj: $('objective'), objTitle: $('obj-title'), objDesc: $('obj-desc'),
      objProgress: $('obj-progress'), objDist: $('obj-dist'), hp: $('hp-fill'), boost: $('boost-fill'), speed: $('speed'),
      notes: $('notifications'), banner: $('banner'), marker: $('marker'), arrow: $('edge-arrow'), tint: $('tint'), flash: $('flash'),
    };
    this.edgeArrow = 0;      // 0 off, 1 normal, 2 big & pulsing (persuasion unlocks)
    this.showDistance = false;
    this.shownScore = 0;
    this.bannerTimer = 0;
    this.flashA = 0;
    this.tintTimer = 0;
    this.notes = [];       // visible
    this.queue = [];       // waiting, highest priority first
    this.seen = new Map(); // text → time, to drop repeats
    this.lastChatter = -99;
  }

  // prio 0 = chatter (only shown when nothing else is on screen), 1 = normal, 2 = important.
  notify(text, kind = 'info', dur = 4, prio) {
    prio ??= kind === 'bad' || kind === 'good' || kind === 'persuade' ? 2 : 1;
    const now = this.G.time;
    if (now - (this.seen.get(text) ?? -99) < 15) return;
    if (this.seen.size > 200) this.seen.clear();
    this.seen.set(text, now);
    if (prio === 0) {
      if (this.notes.length || this.queue.length || now - this.lastChatter < 8) return;
      this.lastChatter = now;
    }
    this.queue.push({ text, kind, dur: Math.min(dur, 4.5), prio });
    this.queue.sort((a, b) => b.prio - a.prio);
    if (this.queue.length > MAX_QUEUE) this.queue.length = MAX_QUEUE;
    this.pump();
  }

  pump() {
    while (this.notes.length < MAX_NOTES && this.queue.length) this.showNote(this.queue.shift());
    // Important news never waits behind something less important: retire the weaker note early.
    const head = this.queue[0];
    if (head) for (const n of this.notes) if (n.prio < head.prio && n.t > 0.4) { n.t = 0.4; break; }
  }

  showNote(n) {
    const icons = { info: '✈️', warn: '⚠️', bad: '💥', good: '🎉', persuade: '📣' };
    const el = document.createElement('div');
    el.className = `note ${n.kind}`;
    const i = document.createElement('span');
    i.className = 'icon';
    i.textContent = icons[n.kind] || '✈️';
    el.append(i, document.createTextNode(n.text));
    this.el.notes.append(el);
    n.el = el;
    n.t = n.dur;
    this.notes.push(n);
  }

  tickNotes(dt) {
    for (let k = this.notes.length - 1; k >= 0; k--) {
      const n = this.notes[k];
      n.t -= dt;
      if (n.t > 0) continue;
      n.el.classList.add('out');
      setTimeout(() => n.el.remove(), 400);
      this.notes.splice(k, 1);
    }
    if (this.queue.length) this.pump();
  }

  banner(title, lines, dur = 5.5) {
    const b = this.el.banner;
    b.querySelector('h1').textContent = title;
    const ul = b.querySelector('ul');
    ul.replaceChildren(...lines.map((l) => { const li = document.createElement('li'); li.textContent = l; return li; }));
    b.classList.add('show');
    this.bannerTimer = dur;
  }

  setObjective(obj) {
    const e = this.el;
    if (!obj) { e.obj.classList.add('hidden'); return; }
    e.obj.classList.remove('hidden', 'pop');
    void e.obj.offsetWidth;
    e.obj.classList.add('pop');
    e.objTitle.textContent = obj.title;
    e.objDesc.textContent = obj.desc;
  }

  // b: { name, hp, maxHp, enraged } for the current boss fight (twins share one bar), or null.
  bossBar(b) {
    const bar = document.getElementById('boss-bar');
    if (!b) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    document.getElementById('boss-name').textContent = `👑 ${b.name}${b.enraged ? ' (ENRAGED)' : ''}`;
    document.getElementById('boss-fill').style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
  }

  flash(color = '#ffffff', a = 0.6) { this.el.flash.style.background = color; this.flashA = a; }
  tint(color, seconds) { this.el.tint.style.background = color; this.el.tint.style.opacity = 0.55; this.tintTimer = seconds; }

  update(dt) {
    const G = this.G, e = this.el, p = G.player;
    this.tickNotes(dt);
    if (Math.round(this.shownScore) !== G.score) {
      const before = Math.round(this.shownScore);
      this.shownScore += (G.score - this.shownScore) * Math.min(1, dt * 6);
      if (Math.abs(G.score - this.shownScore) < 1) this.shownScore = G.score;
      if (Math.round(this.shownScore) !== before) e.score.textContent = Math.round(this.shownScore);
    }
    e.stats.textContent = `✔ ${G.objectives.completed}  💥 ${G.stats.crashes}  🎯 ${G.stats.kills}`;
    e.hp.style.width = `${Math.max(0, (p.health / p.maxHealth) * 100)}%`;
    const hpPct = p.health / p.maxHealth;
    e.hp.style.background = hpPct > 0.5 ? 'var(--good)' : hpPct > 0.25 ? 'var(--warn)' : 'var(--bad)';
    e.boost.style.width = `${p.freeBoost > 0 ? 100 : p.boost * 100}%`;
    e.boost.style.background = p.freeBoost > 0 ? '#ff4dc4' : '#3aa8ff';
    const alt = Math.max(0, Math.round(p.pos.y - Math.max(G.terrain.surfaceHeight(p.pos.x, p.pos.z), G.world.seaLevel)));
    e.speed.textContent = `SPD ${Math.round(p.speed * 3.6)} km/h · ALT ${alt} m`;

    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) e.banner.classList.remove('show'); }
    if (this.flashA > 0) { this.flashA = Math.max(0, this.flashA - dt * 2); e.flash.style.opacity = this.flashA; }
    if (this.tintTimer > 0) { this.tintTimer -= dt; if (this.tintTimer <= 0) e.tint.style.opacity = 0; }

    const obj = G.objectives.current;
    e.objProgress.textContent = obj ? obj.progress || '' : '';
    const t = obj && obj.target();
    if (!t || p.dead) {
      e.marker.style.display = 'none';
      e.arrow.style.display = 'none';
      e.objDist.textContent = '';
      return;
    }
    const dist = Math.round(p.pos.distanceTo(t));
    this.radar = G.powerups.has('radar'); // Objective Radar power-up = free GPS + arrow
    e.objDist.textContent = this.showDistance || this.radar ? `📍 ${dist} m away` : obj.virtual ? '' : '📍 Distance: classified';
    this.updatePointer(t, dist);
  }

  updatePointer(target, dist) {
    const cam = this.G.camera, e = this.el;
    const w = innerWidth, h = innerHeight;
    // On a curved (tiny-planet) world the target is drawn lower than it really is: point at where it's drawn.
    const t = _t.copy(target);
    t.y -= curveDrop(t.x, t.z, cam.position);
    _v.copy(t).applyMatrix4(cam.matrixWorldInverse);
    const behind = _v.z > 0;
    const camX = _v.x, camY = _v.y;
    _v.copy(t).project(cam);
    const onScreen = !behind && Math.abs(_v.x) < 0.92 && Math.abs(_v.y) < 0.88;
    const label = this.showDistance || this.radar ? `${dist} m` : '';
    const arrow = Math.max(this.edgeArrow, this.radar ? 1 : 0);
    if (onScreen) {
      e.marker.style.display = 'block';
      e.marker.style.left = `${((_v.x + 1) / 2) * w}px`;
      e.marker.style.top = `${((1 - _v.y) / 2) * h}px`;
      e.marker.querySelector('span').textContent = label;
      e.arrow.style.display = 'none';
      return;
    }
    e.marker.style.display = 'none';
    if (!arrow) { e.arrow.style.display = 'none'; return; }
    const ang = Math.atan2(camY, camX);
    const rx = w / 2 - 60, ry = h / 2 - 70;
    e.arrow.style.display = 'block';
    e.arrow.classList.toggle('big', arrow > 1);
    e.arrow.style.left = `${w / 2 + Math.cos(ang) * rx}px`;
    e.arrow.style.top = `${h / 2 - Math.sin(ang) * ry}px`;
    e.arrow.querySelector('.rot').style.transform = `rotate(${-ang}rad)`;
    e.arrow.querySelector('span').textContent = label || (arrow > 1 ? 'THIS WAY!!!' : '');
  }
}
