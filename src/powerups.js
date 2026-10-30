// Timed power-ups. One floats into view ahead of the player every minute or so (never more than
// one waiting at a time), bosses always drop one, and each lasts a limited time (most about half a minute).
import * as THREE from 'three';
import { makeTextSprite, disposeTree } from './models.js';
import { pick, rand } from './texts.js';
import { flatForward, groundAt } from './objectives.js';

export const POWERUPS = {
  shield: { name: 'Bubble Shield', icon: '🛡️', color: '#4dd6ff', dur: 30, text: 'Bubble Shield! Bullets bounce off. Mountains still do not.' },
  rapid: { name: 'Rapid Fire', icon: '🔥', color: '#ff7a3a', dur: 30, text: 'Rapid Fire! Your trigger finger is now legally a machine.' },
  triple: { name: 'Triple Shot', icon: '🔱', color: '#ffd23a', dur: 30, text: 'Triple Shot! Twice the bullets, for the price of none.' },
  homing: { name: 'Homing Bullets', icon: '🎯', color: '#ff4dc4', dur: 30, text: 'Homing Bullets! Aiming is now optional (it always was).' },
  turbo: { name: 'Turbo', icon: '🚀', color: '#7ad8ff', dur: 20, text: 'Turbo! Unlimited boost. Point it at the sky, not the ground.' },
  slowmo: { name: 'Slow-Mo', icon: '🐌', color: '#a07aff', dur: 25, text: 'Slow-Mo! Enemies now move like it\'s Monday morning.' },
  freeze: { name: 'Time Freeze', icon: '⏸️', color: '#c8f0ff', dur: 14, text: 'Time Freeze! Every enemy is frozen. Rude, but effective.' },
  double: { name: 'Double Points', icon: '💰', color: '#7aff6a', dur: 45, text: 'Double Points! Everything is worth twice as much for a while.' },
  repair: { name: 'Repair Kit', icon: '🔧', color: '#3ccf7a', dur: 0, text: 'Repair Kit! Hull fully patched with duct tape and optimism.' },
  ghost: { name: 'Ghost Mode', icon: '👻', color: '#e8e8ff', dur: 20, text: 'Ghost Mode! You can\'t crash into the ground or sea. Go wild.' },
  mega: { name: 'Mega Plane', icon: '🦖', color: '#ff9a3a', dur: 25, text: 'Mega Plane! You\'re HUGE. Small enemies pop on contact.' },
  tiny: { name: 'Tiny Plane', icon: '🐜', color: '#c8ff7a', dur: 30, text: 'Tiny Plane! Half the size, half as easy to hit.' },
  radar: { name: 'Objective Radar', icon: '📡', color: '#ffe08a', dur: 45, text: 'Objective Radar! Arrow and distance to the objective, no nagging needed.' },
};
const IDS = Object.keys(POWERUPS);
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
    p.sizeScale = this.has('mega') ? 2.2 : this.has('tiny') ? 0.5 : 1;
    if (this.has('ghost') && !p.dead) p.model.group.visible = Math.floor(G.time * 8) % 3 !== 0; // ghostly flicker
    this.renderTray();
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
