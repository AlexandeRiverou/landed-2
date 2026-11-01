// Arcade flight: pitch/roll on the local axes, bank turns you, auto-levels when you let go.
import * as THREE from 'three';
import { makePlane, PLANE_SKINS } from './models.js';
import { pick, T } from './texts.js';
import { waterLine } from './world.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

// Shooting: about 4 volleys a second; slower bullets live longer, so the reach stays ~680 m.
const FIRE_INTERVAL = 0.26, BULLET_SPEED = 300, BULLET_LIFE = 2;
const PITCH_RATE = 1.1, ROLL_RATE = 2.0, YAW_RATE = 0.45, TURN = 0.95, MAX_BANK = 0.9, BANK_RESPONSE = 4;

// Double-tap stunts. Each is a short script of steps: level the wings, then turn about a local axis
// (X = pitch, nose up is +; Z = roll, a right roll is -). Controls are ignored until it's done.
const PI = Math.PI;
const MANEUVERS = {
  up: { name: 'Immelmann', text: 'Immelmann! Half a loop and a roll: back the way you came.', steps: [{ level: 0.2 }, { axis: X, angle: PI, dur: 1.0 }, { axis: Z, angle: PI, dur: 0.5 }] },
  down: { name: 'Split-S', text: 'Split-S! Roll over, pull through, and you\'re heading back. Lower.', steps: [{ level: 0.2 }, { axis: Z, angle: PI, dur: 0.5 }, { axis: X, angle: PI, dur: 1.0 }] },
  left: { name: 'Barrel roll', text: 'Barrel roll! Nothing can hit you mid-roll.', steps: [{ axis: Z, angle: 2 * PI, dur: 0.7 }], slide: -1, dodge: true },
  right: { name: 'Barrel roll', text: 'Barrel roll! Nothing can hit you mid-roll.', steps: [{ axis: Z, angle: -2 * PI, dur: 0.7 }], slide: 1, dodge: true },
};
const MANEUVER_COOLDOWN = 1.2, SLIDE = 24; // seconds between stunts; metres a barrel roll moves you sideways
const SURFACE_HOLD = 7; // underwater, you're held this far below the sea surface

// Landing. A touchdown is a landing (not a crash) when the sink rate (m/s), bank (rad), nose (forward.y) and
// wings (up.y) are within these, on dry ground whose slope (rise per metre) is gentle enough.
const LAND = { sink: 7, bank: 0.44, noseDown: -0.25, upright: 0.7, slope: 0.3 };
const WHEELS = 2.5; // the plane's centre sits this high on the ground: wheels down, on a runway's asphalt (times Mega / Tiny Plane's scale)
// On the ground: roll out to taxi speed (m/s), braking/accelerating at these m/s², turning at TAXI_TURN rad/s.
// Pulling up takes off once you're at LIFTOFF × cruise speed. Bonus points need this long in the air first (s).
const TAXI_SPEED = 10, BRAKE = 10, THROTTLE = 12, TAXI_TURN = 0.9, LIFTOFF = 0.7, BONUS_AIRTIME = 15;
// Softest first: a touchdown gets the first grade whose sink (m/s) and bank (rad) limits it meets.
const LANDING_GRADES = [
  { id: 'butter', title: 'BUTTER!', sink: 1.5, bank: 0.09, points: 150, texts: 'landButter' },
  { id: 'nice', title: 'Nice landing!', sink: 3.5, bank: 0.2, points: 80, texts: 'landNice' },
  { id: 'firm', title: 'Firm landing.', sink: 5.5, bank: 0.35, points: 40, texts: 'landFirm' },
  { id: 'technically', title: 'That counts. Technically.', sink: Infinity, bank: Infinity, points: 10, texts: 'landMeh' },
];
const DUST = ['#c8b89a', '#a89878', '#e0d4bc'];

export class Player {
  constructor(G) {
    this.G = G;
    this.model = makePlane();
    this.skin = PLANE_SKINS[0];
    this.model.setSkin(this.skin);
    G.scene.add(this.model.group);
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.wind = new THREE.Vector3();
    this.baseSpeed = 44;
    this.speed = 44;
    this.boost = 1;
    this.freeBoost = 0;
    this.health = 100;
    this.maxHealth = 100;
    // Permanent upgrades from levelling up (see progression.js).
    this.stats = { fireRate: 1, boostRegen: 1, boostDrain: 1, regen: 5, damage: 1 };
    this.sizeScale = 1;    // Mega / Tiny Plane power-ups
    this.sinceHit = 99;
    this.invuln = 0;
    this.grace = 0;        // after the world mutates: terrain pushes you up instead of killing you
    this.dead = false;
    this.deadTimer = 0;
    this.loopAccum = 0;
    this.loopIdle = 0;
    this.loopRequirement = 1;
    this.events = [];
    this.maneuver = null;    // double-tap stunt in progress (see MANEUVERS)
    this.maneuverCd = 0;
    this.maneuversSeen = new Set();
    this.dodging = false;    // mid barrel roll: shots and bumps miss
    this.god = false;        // developer menu: no damage, and the ground can't hurt you
    this.shootCd = 0;
    this.bullets = [];
    this.ceilingWarned = 0;
    this.surfaceWarned = -99;
    this.landed = null;      // on the ground: { yaw, t, ground } (see taxi)
    this.lastLanding = null; // the latest touchdown: { grade, title, sink, bank, points, x, z }
    this.airTime = 0;        // seconds airborne since the last touchdown or respawn (landing bonus needs BONUS_AIRTIME)
    this.everLanded = false;
    this.tipShown = false;   // the landing tip shows once per session
    this.bulletGeo = new THREE.SphereGeometry(0.7, 6, 4);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: '#fff36a' });
  }

  setSkin(s) { this.skin = s; this.model.setSkin(s); }

  spawn(x, z, yaw = 0) {
    const G = this.G;
    const g = Math.max(G.terrain.surfaceHeight(x, z), waterLine());
    this.pos.set(x, g + 140, z);
    this.pos.y = Math.max(g + 20, Math.min(this.pos.y, G.terrain.ceilingHeight(x, z) - 40)); // in a cave, mid-gap
    this.prevPos.copy(this.pos);
    this.quat.setFromAxisAngle(Y, yaw);
    this.speed = this.baseSpeed;
    this.health = this.maxHealth;
    this.dead = false;
    this.invuln = 3;
    this.maneuver = null; // a crash ends any stunt
    this.dodging = false;
    this.landed = null;
    this.airTime = 0;
    this.model.group.visible = true;
    this.loopAccum = 0;
    this.updateAxes();
  }

  updateAxes() {
    this.forward.set(0, 0, -1).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
  }

  update(dt, input) {
    const G = this.G;
    this.updateBullets(dt);
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        const f = this.forward;
        this.spawn(this.pos.x, this.pos.z, Math.atan2(-f.x, -f.z));
        G.ui.notify(pick(T.respawn), 'info', 3, 0);
      }
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.grace = Math.max(0, this.grace - dt);
    if (this.grace <= 0) this.graceNotified = false;
    this.sinceHit += dt;
    if (this.sinceHit > 4 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + dt * this.stats.regen);

    this.maneuverCd = Math.max(0, this.maneuverCd - dt);
    if (this.landed ? !this.taxi(dt, input) : !this.fly(dt, input)) return; // false: crashed

    // Shooting.
    this.shootCd -= dt;
    if (input.shoot && this.shootCd <= 0) this.fire();

    // Visuals.
    const g = this.model.group;
    g.position.copy(this.pos);
    g.quaternion.copy(this.quat);
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, this.sizeScale, 1 - Math.exp(-dt * 4)));
    g.visible = this.invuln <= 0 || Math.floor(G.time * 12) % 2 === 0;
    this.model.prop.rotation.z += dt * (30 + this.speed * 0.5);
    if (this.boosting && Math.random() < 0.6) G.fx.trail(_v.copy(this.pos).addScaledVector(this.forward, -6), '#7ad8ff');
  }

  // Normal flight. Returns false if the plane crashed.
  fly(dt, input) {
    const G = this.G;
    this.airTime += dt;
    // Double-tap stunts take over the controls while they run.
    if (input.gesture && !this.maneuver && this.maneuverCd <= 0) this.startManeuver(input.gesture);
    if (this.maneuver) this.stepManeuver(dt);
    else this.steer(dt, input);

    // Loop detection: accumulate pitch rotation in one direction.
    const dp = input.pitch * PITCH_RATE * dt;
    if (Math.abs(input.pitch) > 0.25) {
      if (Math.sign(dp) !== Math.sign(this.loopAccum) && Math.abs(this.loopAccum) > 0.5) this.loopAccum *= 0.5;
      this.loopAccum += dp;
      this.loopIdle = 0;
    } else if ((this.loopIdle += dt) > 1.2) this.loopAccum = 0;
    if (Math.abs(this.loopAccum) >= Math.PI * 2 * this.loopRequirement) { this.events.push('loop'); this.loopAccum = 0; }

    // Speed + boost.
    const boosting = this.throttle(dt, input);
    const target = (boosting ? this.baseSpeed * 1.7 : this.baseSpeed) - this.forward.y * 10;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (boosting ? 2.5 : 1.2)));

    this.prevPos.copy(this.pos);
    this.pos.addScaledVector(this.forward, this.speed * dt).addScaledVector(this.wind, dt);

    // Terrain + water. Heights are asked at your altitude: in a tunnel, the floor and roof are the tunnel's.
    const ground = G.terrain.surfaceHeight(this.pos.x, this.pos.z, this.pos.y);
    const sea = G.world.seaLevel;
    const ghost = G.powerups.has('ghost') || this.god;
    if (this.pos.y < ground + 1.8) {
      if (ghost) this.pos.y = ground + 1.8; // Ghost Mode: skim the ground instead of hitting it
      else if (this.grace > 0 || this.invuln > 0) {
        this.pos.y = ground + 30;
        if (this.grace > 0 && !this.graceNotified) {
          this.graceNotified = true;
          G.ui.notify('A mountain grew under you. We relocated you upward. Free of charge.', 'warn');
        }
      } else if (this.canLand(ground, dt)) { this.touchdown(ground, dt); return true; } // the normal path only: no landing by accident
      else {
        const nearly = this.up.y > 0.5 && this.forward.y > -0.45 && ground > waterLine() && !G.world.underwater; // close, but no
        this.crash('ground');
        if (nearly) this.showTip();
        return false;
      }
    } else if (!G.world.underwater && ground < sea && this.pos.y < sea + 0.6) {
      if (ghost) this.pos.y = sea + 0.6;
      else if (this.grace > 0 || this.invuln > 0) this.pos.y = sea + 25;
      else { this.crash('water'); return false; }
    }
    // Underwater, the sea surface is a soft lid: you're held just under it and the nose eases down. No crash.
    if (G.world.underwater && this.pos.y > sea - SURFACE_HOLD) {
      this.pos.y = sea - SURFACE_HOLD;
      if (!this.maneuver && this.forward.y > 0) { this.quat.multiply(_q.setFromAxisAngle(X, -1.5 * dt)).normalize(); this.updateAxes(); }
      if (G.time - this.surfaceWarned > 10) { G.ui.notify('That\'s the surface. Planes stay under it here. House rules.', 'warn', 2.5, 1); this.surfaceWarned = G.time; }
    }
    // Cave roof. Right after the world changes (or with Ghost Mode) you're moved into the open gap instead.
    const roof = G.terrain.ceilingHeight(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y > roof - 2.5) {
      if (ghost || G.world.underwater) this.pos.y = roof - 2.5; // underwater the roof is the sea surface: never a crash
      else if (this.grace > 0 || this.invuln > 0) this.pos.y = Math.max(ground + 12, roof - 25);
      else { this.crash('roof'); return false; }
    }
    if (!ghost) this.landingTip(ground);
    return true;
  }

  // Normal flying. Roll input sets a target bank angle (casual: let go → wings level).
  steer(dt, input) {
    const G = this.G, q = this.quat;
    const bank = Math.asin(THREE.MathUtils.clamp(-this.right.y, -1, 1));
    const dRoll = THREE.MathUtils.clamp((input.roll * MAX_BANK - bank) * BANK_RESPONSE, -ROLL_RATE, ROLL_RATE) * dt;
    q.multiply(_q.setFromAxisAngle(X, input.pitch * PITCH_RATE * dt));
    q.multiply(_q.setFromAxisAngle(Z, -dRoll));
    q.multiply(_q.setFromAxisAngle(Y, -input.yaw * YAW_RATE * dt));
    this.updateAxes();

    // Banking turns the plane around world up (lift has a sideways component).
    _v.set(this.forward.x, 0, this.forward.z);
    if (_v.lengthSq() > 0.01) {
      _v.normalize().cross(Y); // flat right
      const side = this.up.dot(_v);
      q.premultiply(_q.setFromAxisAngle(Y, -side * TURN * dt));
    }
    // Soft ceiling.
    if (this.pos.y > 1150) {
      q.multiply(_q.setFromAxisAngle(X, -0.9 * dt));
      if (G.time - this.ceilingWarned > 10) { G.ui.notify(pick(T.ceiling), 'warn'); this.ceilingWarned = G.time; }
    }
    q.normalize();
    this.updateAxes();
  }

  // Boost: drains while held (Turbo and free boost cost nothing), recharges otherwise. Returns whether it's on.
  throttle(dt, input) {
    const turbo = this.G.powerups.has('turbo');
    const boosting = turbo || this.freeBoost > 0 || (input.boost && this.boost > 0.02);
    if (this.freeBoost > 0) this.freeBoost -= dt;
    else if (boosting && !turbo) this.boost = Math.max(0, this.boost - dt * 0.35 * this.stats.boostDrain);
    else this.boost = Math.min(1, this.boost + dt * 0.15 * this.stats.boostRegen);
    this.boosting = boosting;
    return boosting;
  }

  bank() { return Math.asin(THREE.MathUtils.clamp(-this.right.y, -1, 1)); }

  // Steepest rise per metre of the ground a few metres around (x, z), asked at height y (tunnel floors count).
  slopeAt(x, z, y) {
    const h = (dx, dz) => this.G.terrain.surfaceHeight(x + dx, z + dz, y);
    return Math.max(Math.abs(h(4, 0) - h(-4, 0)), Math.abs(h(0, 4) - h(0, -4))) / 8;
  }

  // Reaching the ground gently, wings level and nose up enough, on dry and flat-enough ground: that's a landing.
  // Not mid-stunt, and never on the seabed. The ground under the last position must be close too (no wall in the way).
  canLand(ground, dt) {
    const G = this.G, p = this.pos, q = this.prevPos;
    if (this.maneuver || G.world.underwater || ground <= waterLine()) return false;
    const sink = (q.y - p.y) / dt;
    return sink < LAND.sink && Math.abs(this.bank()) < LAND.bank && this.forward.y > LAND.noseDown && this.up.y > LAND.upright
      && Math.abs(ground - G.terrain.surfaceHeight(q.x, q.z, q.y)) < 2 && this.slopeAt(p.x, p.z, p.y) < LAND.slope;
  }

  touchdown(ground, dt) {
    const G = this.G;
    const sink = Math.max(0, (this.prevPos.y - this.pos.y) / dt), bank = Math.abs(this.bank());
    const grade = LANDING_GRADES.find((g) => sink <= g.sink && bank <= g.bank);
    const points = this.airTime >= BONUS_AIRTIME ? grade.points : 0; // no farming points by hopping
    this.lastLanding = { grade: grade.id, title: grade.title, sink: +sink.toFixed(2), bank: +((bank * 180) / PI).toFixed(1), points, x: this.pos.x, z: this.pos.z };
    this.landed = { yaw: Math.atan2(-this.forward.x, -this.forward.z), t: 0 };
    this.everLanded = true;
    this.airTime = 0;
    this.events.push('landed');
    G.score += points;
    this.sitOnGround(ground);
    G.fx.emit(_v.copy(this.pos).addScaledVector(this.up, -WHEELS * this.sizeScale), 26, { colors: DUST, speed: 14, life: 1.1, size: 5, gravity: -6, up: 7 });
    G.audio.tone(72, 0.3, { type: 'sine', vol: 0.22, slide: -30 });
    G.audio.noise(0.2, { vol: 0.12, freq: 500 });
    G.ui.notify(`${grade.title} ${pick(T[grade.texts])}${points ? ` +${points}` : ' (No points for hops: fly a while first.)'}`, 'good', 3.5, 2);
  }

  // Wings level, the nose following the slope under the wheels.
  sitOnGround(ground) {
    const G = this.G, p = this.pos, yaw = this.landed.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rise = G.terrain.surfaceHeight(p.x + fx * 3, p.z + fz * 3, p.y) - G.terrain.surfaceHeight(p.x - fx * 3, p.z - fz * 3, p.y);
    this.landed.ground = ground;
    p.y = ground + WHEELS * this.sizeScale;
    this.quat.setFromAxisAngle(Y, yaw).multiply(_q.setFromAxisAngle(X, THREE.MathUtils.clamp(Math.atan2(rise, 6), -0.3, 0.3)));
    this.updateAxes();
  }

  // On the ground: roll out to taxi speed (boost speeds you up), steer with roll or yaw (about world up), pull up to
  // take off. Pitch down and stunts do nothing here. Rolling off an edge just makes you airborne; a wall still crashes.
  // Returns false if the plane crashed.
  taxi(dt, input) {
    const G = this.G, L = this.landed;
    L.t += dt;
    const boosting = this.throttle(dt, input), pull = input.pitch > 0.3;
    const target = boosting ? this.baseSpeed * 1.7 : pull ? this.baseSpeed : TAXI_SPEED;
    const rate = this.speed > target ? BRAKE : boosting ? THROTTLE * 1.5 : THROTTLE;
    this.speed += THREE.MathUtils.clamp(target - this.speed, -rate * dt, rate * dt);
    L.yaw -= THREE.MathUtils.clamp(input.roll + input.yaw, -1, 1) * TAXI_TURN * dt;
    if (pull && this.speed >= this.baseSpeed * LIFTOFF) { this.liftoff(); return true; }

    this.prevPos.copy(this.pos);
    const run = this.speed * dt;
    this.pos.x -= Math.sin(L.yaw) * run;
    this.pos.z -= Math.cos(L.yaw) * run;
    const ground = G.terrain.surfaceHeight(this.pos.x, this.pos.z, this.pos.y);
    const was = L.ground; // the ground under the wheels a moment ago
    const ghost = G.powerups.has('ghost') || this.god;
    if (ground - was > 1.5 + run * 0.6) { // a wall, or a cliff face
      if (!ghost) {
        if (this.grace <= 0 && this.invuln <= 0) { this.crash('ground'); return false; }
        this.landed = null; // right after the world changes: moved up out of the way, like in the air
        this.pos.y = ground + 30;
        return true;
      } // Ghost Mode rolls right up it
    } else if (was - ground > 1 + run * 0.8) { // the ground dropped away: you're flying again
      this.landed = null;
      G.ui.notify('Ran out of ground. Good news: you\'re a plane.', 'info', 2.5, 0);
      return true;
    }
    if (ground < waterLine()) { // rolled into the sea
      this.landed = null;
      if (ghost) this.pos.y = waterLine() + 0.6;
      else if (this.grace > 0 || this.invuln > 0) this.pos.y = waterLine() + 25;
      else { this.crash('water'); return false; }
      return true;
    }
    this.sitOnGround(ground);
    if (this.pos.y > G.terrain.ceilingHeight(this.pos.x, this.pos.z, this.pos.y) - 2.5 && !ghost) { this.crash('roof'); return false; }
    if (this.speed > 15 && Math.random() < 0.5) G.fx.trail(_v.copy(this.pos).addScaledVector(this.forward, -3).addScaledVector(this.up, -2), DUST[0]);
    return true;
  }

  liftoff() {
    const G = this.G, yaw = this.landed.yaw;
    this.landed = null;
    this.quat.setFromAxisAngle(Y, yaw).multiply(_q.setFromAxisAngle(X, 0.18)); // a little nose-up: you climb from here
    this.updateAxes();
    this.pos.y += 0.4;
    G.audio.tone(220, 0.4, { type: 'triangle', vol: 0.06, slide: 220 });
    G.ui.notify(pick(T.takeoff), 'good', 2.5, 0);
  }

  // The landing tip: shown once, the first time you're low, slow-ish and level over flat dry ground (or after a
  // crash that was nearly a landing), and never after your first real landing.
  landingTip(ground) {
    if (this.tipShown || this.everLanded) return;
    const G = this.G, alt = this.pos.y - ground;
    if (alt > 25 || this.boosting || this.speed > this.baseSpeed * 1.15 || Math.abs(this.bank()) > 0.3 || this.forward.y < -0.2 || this.up.y < 0.8) return;
    if (G.world.underwater || ground <= waterLine() || this.slopeAt(this.pos.x, this.pos.z, this.pos.y) > 0.15) return;
    this.showTip();
  }

  showTip() {
    if (this.tipShown || this.everLanded) return;
    this.tipShown = true;
    this.G.ui.notify(pick(T.landingTip), 'info', 6, 2);
  }

  startManeuver(dir) {
    const G = this.G, M = MANEUVERS[dir];
    const ground = Math.max(G.terrain.surfaceHeight(this.pos.x, this.pos.z, this.pos.y), waterLine());
    const roof = G.terrain.ceilingHeight(this.pos.x, this.pos.z, this.pos.y);
    // Turning back through a half loop needs room: 45 m below you for a Split-S, 45 m above for an Immelmann.
    if (dir === 'down' && this.pos.y - ground < 45) { G.ui.notify('Too low for a Split-S! Climb a bit first. The ground is not a stunt partner.', 'warn', 2.5, 1); return; }
    if (dir === 'up' && roof - this.pos.y < 45) { G.ui.notify('No room to loop under this roof. Find a taller bit of cave.', 'warn', 2.5, 1); return; }
    const yaw = Math.atan2(-this.forward.x, -this.forward.z);
    this.maneuver = {
      ...M, i: 0, t: 0, left: M.steps[0].angle ?? 0, from: this.quat.clone(), level: new THREE.Quaternion().setFromAxisAngle(Y, yaw),
      slideDir: new THREE.Vector3(this.right.x, 0, this.right.z).normalize().multiplyScalar(M.slide || 0), slideT: 0,
    };
    this.dodging = !!M.dodge;
    // The first time, explain the move; after that, just name it.
    if (this.maneuversSeen.has(M.name)) G.ui.notify(`${M.name}!`, 'good', 1.5, 0);
    else { this.maneuversSeen.add(M.name); G.ui.notify(M.text, 'good', 3, 1); }
    G.audio.tone(260, 0.45, { type: 'sine', vol: 0.05, slide: 380 });
  }

  stepManeuver(dt) {
    const m = this.maneuver, s = m.steps[m.i];
    m.t += dt;
    if (s.level) {
      this.quat.slerpQuaternions(m.from, m.level, Math.min(1, m.t / s.level));
      if (m.t >= s.level) this.nextStep();
    } else {
      const d = Math.sign(s.angle) * Math.min(Math.abs(m.left), (Math.abs(s.angle) / s.dur) * dt);
      this.quat.multiply(_q.setFromAxisAngle(s.axis, d));
      m.left -= d;
      if (Math.abs(m.left) < 1e-6) this.nextStep();
    }
    if (m.slide) {
      // Sideways dodge with a smooth start and stop: the speed follows a sine, so the total is exactly SLIDE metres.
      const T = m.steps[0].dur, t0 = m.slideT;
      m.slideT = Math.min(T, t0 + dt);
      this.pos.addScaledVector(m.slideDir, (SLIDE / 2) * (Math.cos((PI * t0) / T) - Math.cos((PI * m.slideT) / T)));
    }
    this.quat.normalize();
    this.updateAxes();
    // Wingtip smoke while stunting.
    for (const side of [-1, 1]) this.G.fx.trail(_v.copy(this.pos).addScaledVector(this.right, side * 6.5), '#ffffff');
  }

  nextStep() {
    const m = this.maneuver;
    m.i++;
    m.t = 0;
    if (m.i >= m.steps.length) { this.maneuver = null; this.dodging = false; this.maneuverCd = MANEUVER_COOLDOWN; return; }
    m.left = m.steps[m.i].angle ?? 0;
  }

  fire() {
    const G = this.G, P = G.powerups;
    this.shootCd = FIRE_INTERVAL / this.stats.fireRate / (P.has('rapid') ? 2.5 : 1);
    const guns = [[-1, 0], [1, 0]];
    if (P.has('triple')) guns.push([-1, -0.12], [1, 0.12]);
    const homing = P.has('homing'), s = this.sizeScale;
    for (const [side, spread] of guns) {
      const m = new THREE.Mesh(this.bulletGeo, this.bulletMat);
      m.scale.setScalar(s);
      const p = this.pos.clone().addScaledVector(this.right, side * 3.5 * s).addScaledVector(this.forward, 2);
      m.position.copy(p);
      G.scene.add(m);
      const vel = this.forward.clone().applyAxisAngle(this.up, -spread).multiplyScalar(this.speed + BULLET_SPEED);
      this.bullets.push({ mesh: m, pos: p, vel, life: BULLET_LIFE, dmg: this.stats.damage, homing });
    }
    G.audio.shoot();
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      if (b.homing) this.steerBullet(b, dt);
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.life <= 0) { this.removeBullet(i); continue; }
      if (b.pos.y < this.G.terrain.surfaceHeight(b.pos.x, b.pos.z, b.pos.y)) {
        // Bullets chew small holes in the ground.
        this.G.terrain.deform(b.pos.x, b.pos.z, 8, 1.6);
        this.G.fx.emit(b.pos, 6, { colors: ['#8a6a4a', '#b89a70', '#6a5a4a'], speed: 18, life: 0.7, size: 4, gravity: -30, up: 12 });
        this.removeBullet(i);
      }
    }
  }

  // Homing Bullets power-up: curve toward the nearest enemy in front of the bullet.
  steerBullet(b, dt) {
    let best = null, bd = 260 * 260;
    for (const e of this.G.enemies.list) {
      _v.subVectors(e.pos, b.pos);
      const d = _v.lengthSq();
      if (d < bd && _v.dot(b.vel) > 0) { bd = d; best = e; }
    }
    if (!best) return;
    const speed = b.vel.length();
    _v.subVectors(best.pos, b.pos).setLength(speed);
    b.vel.lerp(_v, 1 - Math.exp(-dt * 6)).setLength(speed);
  }

  removeBullet(i) {
    this.G.scene.remove(this.bullets[i].mesh);
    this.bullets.splice(i, 1);
  }

  damage(n) {
    if (this.dead || this.invuln > 0 || this.dodging || this.god) return;
    const G = this.G;
    if (G.powerups.has('shield')) { G.powerups.shieldHit(); return; }
    this.health -= n;
    this.sinceHit = 0;
    G.ui.flash('#ff3a3a', 0.35);
    G.audio.hit();
    if (Math.random() < 0.2) G.ui.notify(pick(T.hurt), 'bad', 2, 0);
    if (this.health <= 0) this.crash('enemy');
  }

  crash(reason) {
    const G = this.G;
    this.dead = true;
    this.landed = null;
    this.deadTimer = 2.2;
    this.health = 0;
    this.model.group.visible = false;
    this.wind.set(0, 0, 0);
    G.stats.crashes++;
    if (reason === 'water') G.fx.splash(this.pos);
    else {
      G.fx.explosion(this.pos);
      if (reason === 'ground') G.terrain.deform(this.pos.x, this.pos.z, 12, 6); // you left a mark
    }
    G.audio.explode();
    G.ui.flash('#ffffff', 0.7);
    G.ui.notify(pick(reason === 'water' ? T.crashWater : reason === 'enemy' ? T.crashEnemy : T.crashGround), 'bad', 4);
  }

  // Gently steer the nose toward a point (used by the "tailwind" persuasion).
  nudgeToward(target, rate, dt) {
    _m.lookAt(this.pos, target, Y);
    _q.setFromRotationMatrix(_m);
    this.quat.slerp(_q, Math.min(1, rate * dt));
  }
}
