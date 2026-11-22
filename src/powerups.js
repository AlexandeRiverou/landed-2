// Timed power-ups. One floats into view ahead of the player every minute or so (never more than
// one waiting at a time), bosses always drop one, and each lasts a limited time (most close to a minute).
import * as THREE from 'three';
import { makeTextSprite, disposeTree } from './models.js';
import { pick, rand } from './texts.js';
import { flatForward, groundAt } from './objectives.js';

export const POWERUPS = {
  shield: { name: 'Bubble Shield', icon: '🛡️', color: '#4dd6ff', dur: 50, text: 'Bubble Shield! Bullets bounce off. Mountains still do not.' },
  rapid: { name: 'Rapid Fire', icon: '🔥', color: '#ff7a3a', dur: 50, text: 'Rapid Fire! Your trigger finger is now legally a machine.' },
  triple: { name: 'Triple Shot', icon: '🔱', color: '#ffd23a', dur: 50, text: 'Triple Shot! Twice the bullets, for the price of none.' },
  homing: { name: 'Homing Bullets', icon: '🎯', color: '#ff4dc4', dur: 50, text: 'Homing Bullets! Aiming is now optional (it always was).' },
  turbo: { name: 'Turbo', icon: '🚀', color: '#7ad8ff', dur: 40, text: 'Turbo! Hold boost to go extra fast, and it never runs dry. Point it at the sky, not the ground.' },
  slowmo: { name: 'Slow-Mo', icon: '🐌', color: '#a07aff', dur: 40, text: 'Slow-Mo! Enemies now move like it\'s Monday morning.' },
  freeze: { name: 'Time Freeze', icon: '⏸️', color: '#c8f0ff', dur: 22, text: 'Time Freeze! Every enemy is frozen. Rude, but effective.' },
  double: { name: 'Double Points', icon: '💰', color: '#7aff6a', dur: 70, text: 'Double Points! Everything is worth twice as much for a while.' },
  repair: { name: 'Repair Kit', icon: '🔧', color: '#3ccf7a', dur: 0, text: 'Repair Kit! Hull fully patched with duct tape and optimism.' },
  ghost: { name: 'Ghost Mode', icon: '👻', color: '#e8e8ff', dur: 35, text: 'Ghost Mode! You can\'t crash into the ground or sea. Go wild.' },
  mega: { name: 'Mega Ram', icon: '🦖', color: '#ff9a3a', dur: 40, text: 'Mega Ram! You\'re HUGE and armoured. Ram enemies for bonus points, and ram bosses to daze them.' },
  tiny: { name: 'Tiny Ace', icon: '🐜', color: '#c8ff7a', dur: 50, text: 'Tiny Ace! Shots whiff past you for points. Hug the ground or fly through tunnels for daredevil points.' },
  shock: { name: 'Shockwave', icon: '💥', color: '#ffe08a', dur: 45, text: 'Shockwave! Anything that gets too close gets a blast ring to the face. Personal space, enforced.' },
};
const IDS = Object.keys(POWERUPS);
// Mega Ram: regular enemies pop on contact for bonus× their points (a "RAM!" popup, still part of the kill streak). A
// boss takes boss× its max hull (times its shield and weak-spot multipliers), is shoved shove m/s away and dazed for daze
// s (bullets do ×1.5 on a dazed boss), and can't be rammed again for cd s; you take no bump. Enemy hits on you do armor×.
export const MEGA = { scale: 2.2, bonus: 1.5, boss: 0.12, cd: 1.5, daze: 2.5, shove: 70, armor: 0.5 };
// Tiny Ace: half the size, so an enemy shot that would have hit a normal plane whiffs past for +whiff points. Flying
// within low m of the ground, the water or a tunnel roof earns rate daredevil points a second, paid every pay s.
export const TINY = { scale: 0.5, whiff: 15, low: 15, rate: 15, pay: 1 };
// Shockwave: every SHOCK.every s, if an enemy or an enemy shot is within range m, a blast ring bursts out of the plane.
// Regular enemies in range take dmg (times their armor: small fry pop, blimps and clouds take two), enemy shots in range
// are wiped, and a boss in range loses boss× its max hull. Kills pay as usual and count toward the kill streak.
export const SHOCK = { every: 3, range: 60, dmg: 3, boss: 0.02 };
const OPPOSITES = { mega: 'tiny', tiny: 'mega' };

const FIRST_SPAWN = 40;                  // seconds into a flight before the first one appears
const SPAWN_EVERY = [55, 85];            // then one every 55–85 s (shortened by a level-up perk)
const PICKUP_LIFE = 45;                  // a missed pickup floats away after this long
const PICKUP_RADIUS = 13;

export class PowerUps {
  constructor(G) {
    this.G = G;
    this.active = new Map();   // id → seconds left
    this.pickups = [];
    this.timer = FIRST_SPAWN;
    this.seenFirst = false;
    this.tray = document.getElementById('powerups');
    this.chips = new Map();
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(10, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#4dd6ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.shield.visible = false;
    G.scene.add(this.shield);
  }

  has(id) { return this.active.has(id); }

  enemyTimeScale() {
    if (this.has('freeze')) return 0;
    if (this.has('slowmo')) return 0.35;
    return 1;
  }

  // ---------- pickups in the world ----------

  spawnAhead() {
    const G = this.G, p = G.player;
    const f = flatForward(G), side = new THREE.Vector3(-f.z, 0, f.x);
    const pos = p.pos.clone().addScaledVector(f, rand(220, 320)).addScaledVector(side, rand(-60, 60));
    pos.y = Math.min(Math.max(p.pos.y + rand(-5, 20), groundAt(G, pos.x, pos.z, p.pos.y) + 30), G.terrain.ceilingHeight(pos.x, pos.z, p.pos.y) - 20); // in a tunnel, it spawns in there with you
    this.drop(pos);
    if (!this.seenFirst) {
      this.seenFirst = true;
      G.ui.notify('A power-up appeared ahead! Fly through the spinning gift to grab it.', 'good', 4.5, 1);
    }
  }

  drop(pos, id = pick(IDS)) {
    const def = POWERUPS[id];
    const g = new THREE.Group();
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(5, 0),
      new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.6, flatShading: true }),
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(9, 12, 8),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(8.5, 0.5, 6, 32),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    );
    const label = makeTextSprite([def.icon], 9, { bg: null, w: 256, h: 256, size: 180 });
    label.position.y = 13;
    g.add(gem, glow, ring, label);
    g.position.copy(pos);
    g.userData = { gem, ring };
    this.G.scene.add(g);
    this.pickups.push({ id, mesh: g, pos: g.position, life: PICKUP_LIFE, t: Math.random() * 10 });
  }

  removePickup(i) {
    const k = this.pickups[i];
    this.G.scene.remove(k.mesh);
    disposeTree(k.mesh);
    this.pickups.splice(i, 1);
  }

  activate(id) {
    const G = this.G, def = POWERUPS[id];
    G.audio.success();
    G.ui.notify(`${def.icon} ${def.text}`, 'good', 4, 2);
    if (id === 'repair') { G.player.health = G.player.maxHealth; return; }
    const other = OPPOSITES[id];
    if (other) this.active.delete(other);
    const dur = def.dur * G.progress.durationMul;
    this.active.set(id, Math.max(this.active.get(id) || 0, dur));
  }

  // A fresh run after a Game Over: nothing active, nothing waiting to be picked up.
  resetRun() {
    this.active.clear();
    for (let i = this.pickups.length - 1; i >= 0; i--) this.removePickup(i);
    this.timer = FIRST_SPAWN;
    this.renderTray();
  }

  shieldHit() {
    this.G.fx.sparkle(this.G.player.pos, '#4dd6ff');
    this.G.audio.tone(900, 0.12, { type: 'triangle', vol: 0.08 });
  }

  // ---------- per frame ----------

  update(dt) {
    const G = this.G, p = G.player;

    for (const [id, left] of this.active) {
      if (left - dt > 0) { this.active.set(id, left - dt); continue; }
      this.active.delete(id);
      G.ui.notify(`${POWERUPS[id].name} wore off.`, 'info', 2.5, 0);
    }

    if (!this.pickups.length && !p.dead && !G.relax) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = rand(...SPAWN_EVERY) * G.progress.spawnMul;
        this.spawnAhead();
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.life -= dt;
      k.t += dt;
      k.mesh.userData.gem.rotation.y += dt * 2;
      k.mesh.userData.ring.rotation.y += dt * 1.2;
      k.mesh.position.y += Math.sin(k.t * 2) * dt * 3;
      const d = k.pos.distanceTo(p.pos);
      if (!p.dead && d < PICKUP_RADIUS * G.progress.pickupMul * Math.max(1, p.sizeScale)) {
        G.fx.sparkle(k.pos, POWERUPS[k.id].color);
        this.activate(k.id);
        this.removePickup(i);
      } else if (k.life <= 0 || d > 1200) this.removePickup(i);
    }

    // Visual effects that follow the plane.
    this.shield.visible = this.has('shield') && !p.dead;
    if (this.shield.visible) {
      this.shield.position.copy(p.pos);
      this.shield.scale.setScalar(p.sizeScale * (1 + Math.sin(G.time * 6) * 0.04));
    }
    p.sizeScale = this.has('mega') ? MEGA.scale : this.has('tiny') ? TINY.scale : 1;
    this.daredevil(dt);
    this.shockwave(dt);
    if (this.has('ghost') && !p.dead) p.model.group.visible = Math.floor(G.time * 8) % 3 !== 0; // ghostly flicker
    this.renderTray();
  }

  // Tiny Ace: daredevil points for flying low (ground, water or a tunnel roof within TINY.low m), paid in chunks.
  daredevil(dt) {
    const G = this.G, p = G.player;
    const low = this.has('tiny') && !p.dead && !p.landed && (p.pos.y - groundAt(G, p.pos.x, p.pos.z, p.pos.y) < TINY.low
      || G.terrain.ceilingHeight(p.pos.x, p.pos.z, p.pos.y) - p.pos.y < TINY.low);
    if (!low) { this.lowT = 0; return; }
    this.lowT = (this.lowT || 0) + dt;
    if (this.lowT < TINY.pay) return;
    this.lowT -= TINY.pay;
    const pts = Math.round(TINY.rate * TINY.pay);
    G.score += pts;
    G.fx.popText(p.pos.clone().addScaledVector(p.up, 6), `Daredevil +${pts}`);
  }

  // Shockwave: a pulse every SHOCK.every s, held back until something is in range so every ring hits.
  shockwave(dt) {
    const G = this.G, p = G.player;
    if (!this.has('shock') || p.dead || p.landed) { this.shockT = 0; return; }
    this.shockT = Math.max(0, (this.shockT ?? 0) - dt);
    if (this.shockT > 0) return;
    const E = G.enemies, r = SHOCK.range * Math.max(1, p.sizeScale), r2 = r * r;
    const near = (e) => !e.dead && !e.planet && e.pos.distanceToSquared(p.pos) < (r + e.radius) ** 2;
    if (!E.list.some(near) && !E.shots.some((s) => s.pos.distanceToSquared(p.pos) < r2)) return;
    this.shockT = SHOCK.every;
    this.pulse(r);
    for (let i = E.shots.length - 1; i >= 0; i--) {
      const s = E.shots[i];
      if (s.pos.distanceToSquared(p.pos) >= r2) continue;
      G.scene.remove(s.mesh);
      E.shots.splice(i, 1);
    }
    let hits = 0;
    for (let i = E.list.length - 1; i >= 0; i--) {
      const e = E.list[i];
      if (!near(e)) continue;
      hits++;
      if (e.boss) e.hp -= e.maxHp * SHOCK.boss * (e.vulnerable || 1) * (e.shield ?? 1);
      else e.hp -= SHOCK.dmg * (e.def.armor ?? 1);
      G.fx.sparkle(e.pos, '#ffe08a');
      if (e.hp <= 0) { G.fx.explosion(e.pos); E.kill(i, true); }
    }
    if (hits) G.shake?.(0.35, 0.15);
  }

  // The visible ring: a flat, bright torus that races out to the shockwave's edge and fades, plus a spark ring.
  pulse(r) {
    const G = this.G, p = G.player;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.08, 6, 48),
      new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.position.copy(p.pos);
    ring.quaternion.copy(p.model.group.quaternion);
    ring.rotateX(Math.PI / 2); // flat in the plane of the wings
    G.fx.addTimed(ring, 0.45, (o, t) => { o.scale.setScalar(4 + (r - 4) * (1 - t * t)); o.material.opacity = 0.9 * t; });
    G.fx.emit(p.pos, 40, { colors: ['#ffe08a', '#ffffff', '#ffb03a'], speed: r * 1.6, life: 0.4, size: 5, ring: true, uniform: true, drag: 0.5 });
    G.audio.tone(140, 0.25, { type: 'sawtooth', vol: 0.09, slide: 60 });
  }

  renderTray() {
    for (const [id, left] of this.active) {
      let chip = this.chips.get(id);
      if (!chip) {
        const def = POWERUPS[id];
        chip = document.createElement('div');
        chip.className = 'pu';
        chip.style.setProperty('--pu', def.color);
        chip.innerHTML = '<span class="pu-name"></span><div class="pu-track"><div class="pu-fill"></div></div>';
        chip.querySelector('.pu-name').textContent = `${def.icon} ${def.name}`;
        this.tray.append(chip);
        this.chips.set(id, chip);
      }
      const total = POWERUPS[id].dur * this.G.progress.durationMul;
      chip.querySelector('.pu-fill').style.width = `${Math.min(100, (left / total) * 100)}%`;
      chip.classList.toggle('ending', left < 3);
    }
    for (const [id, chip] of this.chips) if (!this.active.has(id)) { chip.remove(); this.chips.delete(id); }
  }
}
