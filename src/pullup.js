// Pull-up warning: a short look ahead along your flight path. If the ground (or the sea) is coming up within
// 1.5 s, a red glow, a "PULL UP!" chip and a beep. Pull out of it very close to the ground for a Close shave bonus.
import { LAND } from './player.js';
import { pick, T } from './texts.js';

const PROBE = [0.5, 1.0, 1.5, 2.0]; // seconds ahead, along forward · speed + wind
const CLEARANCE = 1.8;              // the height above the floor where flying turns into crashing (player.js fly)
const WARN = 1.5, URGENT = 0.8;     // warn when a hit is this close (s); beep faster below URGENT
const MIN_SHOW = 0.6;               // once on, the warning stays at least this long (s)
const BEEP = 0.4, BEEP_URGENT = 0.25;
const SHAVE = { clearance: 8, points: 25, cooldown: 15 }; // a pull-out lower than this (m) pays, once per cooldown (s)

export class PullUp {
  constructor(G) {
    this.G = G;
    this.on = false;
    this.shownFor = 0;
    this.beepT = 0;
    this.tti = Infinity;     // time to impact of the first probe that hits (s)
    this.minClear = Infinity; // lowest clearance under the plane during this warning (m)
    this.lastShave = -Infinity;
    this.shows = 0;          // warnings shown so far (for the smoke test)
    const el = (id, text = '') => { const d = document.createElement('div'); d.id = id; d.textContent = text; return d; };
    this.glow = el('pullup-glow');
    this.chip = el('pullup-chip', 'PULL UP!');
    document.getElementById('flash').before(this.glow, this.chip); // under the crash flash
  }

  // The floor at (x, y, z): the ground (a tunnel's at height y), or the sea surface where that's higher.
  floor(x, y, z) {
    const G = this.G, g = G.terrain.surfaceHeight(x, z, y);
    return !G.world.underwater && G.world.seaLevel > g ? G.world.seaLevel : g;
  }

  // Gliding in to land (wings level, nose up enough, sinking gently): the ground is the point, so no warning.
  approach() {
    const p = this.G.player, sink = -(p.forward.y * p.speed + p.wind.y);
    return Math.abs(p.bank()) < LAND.bank && p.up.y > LAND.upright && p.forward.y > LAND.noseDown && sink < LAND.sink * 1.5;
  }

  update(dt) {
    const G = this.G, p = G.player;
    if (p.dead || p.landed || p.god || G.powerups.has('ghost') || p.grace > 0 || p.invuln > 0) { this.set(false); this.minClear = Infinity; return; }
    let tti = Infinity;
    if (!this.approach()) {
      const vx = p.forward.x * p.speed + p.wind.x, vy = p.forward.y * p.speed + p.wind.y, vz = p.forward.z * p.speed + p.wind.z;
      for (const t of PROBE) {
        const x = p.pos.x + vx * t, y = p.pos.y + vy * t, z = p.pos.z + vz * t;
        if (y < this.floor(x, y, z) + CLEARANCE) { tti = t; break; }
      }
    }
    this.tti = tti;
    if (this.on) {
      this.shownFor += dt;
      this.minClear = Math.min(this.minClear, p.pos.y - this.floor(p.pos.x, p.pos.y, p.pos.z));
      if (tti === Infinity && this.shownFor >= MIN_SHOW) { this.set(false); this.closeShave(); }
    } else if (tti <= WARN) {
      this.set(true);
      this.shownFor = 0;
      this.beepT = 0;
      this.minClear = p.pos.y - this.floor(p.pos.x, p.pos.y, p.pos.z);
      this.shows++;
    }
    if (!this.on) return;
    const urgent = tti < URGENT;
    if ((this.beepT -= dt) <= 0) { G.audio.pullUp(urgent); this.beepT = urgent ? BEEP_URGENT : BEEP; }
  }

  // The warning ended and you're still flying: a low enough pull-out is worth bragging about.
  closeShave() {
    const G = this.G;
    if (this.minClear >= SHAVE.clearance || G.time - this.lastShave < SHAVE.cooldown) return;
    this.lastShave = G.time;
    if (G.relax) { G.ui.notify('Close shave! Bragging rights only (Relax Mode).', 'good', 3, 1); return; }
    G.score += SHAVE.points;
    G.ui.notify(`${pick(T.closeShave)} +${SHAVE.points}`, 'good', 3, 1);
  }

  set(on) {
    if (this.on === on) return;
    this.on = on;
    this.glow.classList.toggle('on', on);
    this.chip.classList.toggle('on', on);
  }
}
