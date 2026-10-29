// Keyboard, mouse and touch → { pitch, roll, yaw, boost, shoot }.
const clamp1 = (v) => Math.max(-1, Math.min(1, v));
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.handlers = {};
    this.invert = false;
    this.p = 0; this.r = 0;
    this.mouseFire = false;
    this.stick = { id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
    this.touchFire = false; this.touchBoost = false;

    addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.handlers[e.code]?.();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseFire = false; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseFire = true; });
    addEventListener('mouseup', () => { this.mouseFire = false; });

    canvas.addEventListener('touchstart', (e) => {
      document.body.classList.add('touch');
      for (const t of e.changedTouches) {
        if (this.stick.id === null) Object.assign(this.stick, { id: t.identifier, sx: t.clientX, sy: t.clientY, dx: 0, dy: 0 });
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick.dx = t.clientX - this.stick.sx; this.stick.dy = t.clientY - this.stick.sy; }
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
    };
  }
}
