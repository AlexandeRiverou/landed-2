// Keyboard, mouse and touch → { pitch, roll, yaw, boost, shoot, gesture }.
// A gesture is a double tap of a direction key, or two quick flicks of the touch stick the same way.
const clamp1 = (v) => Math.max(-1, Math.min(1, v));
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const KEY_DIR = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
const DOUBLE_TAP_MS = 350;
const FLICK_OUT = 55, FLICK_BACK = 22; // px: a flick pushes the stick past FLICK_OUT; it re-arms once back inside FLICK_BACK

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.handlers = {};
    this.invert = false;
    this.p = 0; this.r = 0;
    this.mouseFire = false;
    this.stick = { id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
    this.touchFire = false; this.touchBoost = false;
    this.gestures = [];
    this.lastTap = {};
    this.flickArmed = true;
    this.lock = null; // a Set of codes: while set (developer menu open), only these keys are tracked, and no handlers run

    addEventListener('keydown', (e) => {
      if (this.lock) { if (this.lock.has(e.code)) this.keys.add(e.code); return; }
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) { this.handlers[e.code]?.(); if (KEY_DIR[e.code]) this.tap(KEY_DIR[e.code]); }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseFire = false; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseFire = true; });
    addEventListener('mouseup', () => { this.mouseFire = false; });

    canvas.addEventListener('touchstart', (e) => {
      document.body.classList.add('touch');
      for (const t of e.changedTouches) {
        if (this.stick.id === null) { Object.assign(this.stick, { id: t.identifier, sx: t.clientX, sy: t.clientY, dx: 0, dy: 0 }); this.flickArmed = true; }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick.dx = t.clientX - this.stick.sx; this.stick.dy = t.clientY - this.stick.sy; this.flick(); }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === this.stick.id) this.stick.id = null; };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);

    const btn = (id, prop) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { this[prop] = true; el.classList.add('on'); e.preventDefault(); }, { passive: false });
      el.addEventListener('touchend', () => { this[prop] = false; el.classList.remove('on'); });
    };
    btn('t-fire', 'touchFire');
    btn('t-boost', 'touchBoost');
  }

  on(code, fn) { this.handlers[code] = fn; }

  // Two taps of the same direction within DOUBLE_TAP_MS make a gesture.
  tap(dir) {
    const now = performance.now();
    if (now - (this.lastTap[dir] ?? -1e9) < DOUBLE_TAP_MS) { this.gestures.push(dir); this.lastTap[dir] = -1e9; }
    else this.lastTap[dir] = now;
  }

  // Touch: each push of the stick out past FLICK_OUT counts as one tap of that direction.
  flick() {
    const { dx, dy } = this.stick, d = Math.hypot(dx, dy);
    if (d < FLICK_BACK) { this.flickArmed = true; return; }
    if (!this.flickArmed || d < FLICK_OUT) return;
    this.flickArmed = false;
    this.tap(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'up' : 'down'));
  }

  state(dt) {
    const k = this.keys;
    let tp = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let tr = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const yaw = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (this.stick.id !== null) { tr = clamp1(this.stick.dx / 70); tp = clamp1(-this.stick.dy / 70); }
    if (this.invert) tp = -tp;
    const a = 1 - Math.exp(-dt * 8);
    this.p += (tp - this.p) * a;
    this.r += (tr - this.r) * a;
    return {
      pitch: this.p, roll: this.r, yaw,
      boost: k.has('ShiftLeft') || k.has('ShiftRight') || this.touchBoost,
      shoot: k.has('Space') || k.has('KeyJ') || this.mouseFire || this.touchFire,
      gesture: this.gestures.shift() || null,
    };
  }
}
