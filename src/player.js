// Arcade flight: pitch/roll on the local axes, bank turns you, auto-levels when you let go.
import * as THREE from 'three';
import { makePlane, PLANE_SKINS, deckSpot } from './models.js';
import { pick, T } from './texts.js';
import { waterLine } from './world.js';
import { MEGA } from './powerups.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();

// Shooting: about 4 volleys a second; slower bullets live longer, so the reach stays ~680 m.
const FIRE_INTERVAL = 0.26, BULLET_SPEED = 300, BULLET_LIFE = 2;
const BULLET_CRATER = { r: 13, depth: 4 }; // per ground hit; repeat hits dig +depth/2 and widen +depth/4 (world.js addCrater)
const PITCH_RATE = 1.1, ROLL_RATE = 2.3, YAW_RATE = 0.45, TURN = 0.95, MAX_BANK = 0.9, BANK_RESPONSE = 5;

// Double-tap stunts. Each is a short script of steps: level the wings, then turn about a local axis
// (X = pitch, nose up is +; Z = roll, a right roll is -). Controls are ignored until it's done.
const PI = Math.PI;
const MANEUVERS = {
  up: { name: 'Immelmann', text: 'Immelmann! Half a loop and a roll: back the way you came.', steps: [{ level: 0.2 }, { axis: X, angle: PI, dur: 1.0 }, { axis: Z, angle: PI, dur: 0.5 }] },
  down: { name: 'Split-S', text: 'Split-S! Roll over, pull through, and you\'re heading back. Lower.', steps: [{ level: 0.2 }, { axis: Z, angle: PI, dur: 0.5 }, { axis: X, angle: PI, dur: 1.0 }] },
  left: { name: 'Barrel roll', text: 'Barrel roll! Nothing can hit you mid-roll.', steps: [{ axis: Z, angle: 2 * PI, dur: 0.7 }], slide: -1, dodge: true },
  right: { name: 'Barrel roll', text: 'Barrel roll! Nothing can hit you mid-roll.', steps: [{ axis: Z, angle: -2 * PI, dur: 0.7 }], slide: 1, dodge: true },
};
// Boost tank (0..1) per second, before perks: a full tank lasts 4 s and refills in 5 s.
const BOOST_DRAIN = 0.25, BOOST_REGEN = 0.2, WHOOSH_GAP = 0.6;
// Boost speed over base speed. With Turbo active, boost goes faster (TURBO_BOOST) and costs no tank, but only while
// you hold it: Turbo never forces speed on you.
export const BOOST_MUL = 1.7, TURBO_BOOST = 2.1;
const MANEUVER_COOLDOWN = 0.9, SLIDE = 24; // seconds between stunts; metres a barrel roll moves you sideways
const SURFACE_HOLD = 7; // underwater, you're held this far below the sea surface
// Cave tuck: under a rock roof, pulling up (pitch held up) scales the pitch rate by your speed over BASE_SPEED from
// the start, so boosting (or the speed mutation) can't make a loop bigger. Past TUCK_FROM rad of loop the rate also
// ramps to loopTuck × over TUCK_RAMP s: TUCK (1.5×) is a ~27 m radius, a loop ~53 m tall (71 m untucked); easier()
// raises it. Between ROOF_TUCK.from and .to rad, if the rest of the circle wouldn't clear the roof by ROOF_TUCK.margin
// m, the plane tucks harder (up to ROOF_TUCK.max × base, times the speed factor). A loop past ROOF_WARN.angle rad with
// the roof under ROOF_WARN.dist m away gets a warning.
export const TUCK = 1.5; // the base tuck (objectives.js easier() raises it for one loop)
const TUCK_FROM = 0.7, TUCK_RAMP = 0.4, ROOF_WARN = { angle: PI / 3, dist: 20, gap: 3 };
const ROOF_TUCK = { from: 0.35, to: PI, margin: 8, max: 2.6 };

// Landing. A touchdown is a landing (not a crash) when the sink rate (m/s), bank (rad), nose (forward.y) and
// wings (up.y) are within these, on dry ground whose slope (rise per metre) is gentle enough.
export const LAND = { sink: 7, bank: 0.44, noseDown: -0.25, upright: 0.7, slope: 0.3 };
const WHEELS = 2.5; // the plane's centre sits this high on the ground: wheels down, on a runway's asphalt (times Mega Ram / Tiny Ace's scale)
// On the ground: roll out to taxi speed (m/s), braking/accelerating at these m/s², turning at TAXI_TURN rad/s.
// Pulling up takes off once you're at LIFTOFF × cruise speed. Bonus points need this long in the air first (s).
const TAXI_SPEED = 10, BRAKE = 10, THROTTLE = 12, TAXI_TURN = 0.9, LIFTOFF = 0.7, BONUS_AIRTIME = 15;
// Lined up on a runway's glide path (runway.js GLIDE), the plane eases down to this × cruise speed on its own.
export const APPROACH_SLOW = 0.6;
// Within CHAIN_SLOW_RANGE m of a chain's next link (rings, constellation stars, melody notes: objectives with chainSlow),
// the plane eases down to CHAIN_SLOW × cruise on its own, so it can turn into the link. Boost still overrides it.
export const CHAIN_SLOW = 0.65, CHAIN_SLOW_RANGE = 220;
// Softest first: a touchdown gets the first grade whose sink (m/s) and bank (rad) limits it meets.
const LANDING_GRADES = [
  { id: 'butter', title: 'BUTTER!', sink: 1.5, bank: 0.09, points: 150, texts: 'landButter' },
  { id: 'nice', title: 'Nice landing!', sink: 3.5, bank: 0.2, points: 80, texts: 'landNice' },
  { id: 'firm', title: 'Firm landing.', sink: 5.5, bank: 0.35, points: 40, texts: 'landFirm' },
  { id: 'technically', title: 'That counts. Technically.', sink: Infinity, bank: Infinity, points: 10, texts: 'landMeh' },
];
const DUST = ['#c8b89a', '#a89878', '#e0d4bc'];
// The secret deck landing (HMS Overkill, the carrier boss): a gentle approach this close (m) above its flight deck lands on
// it (the hull bumps you off any closer). The first landing on each carrier patches your hull to full and pays `points`;
// catching the angled deck's 3-wire (the one real carrier pilots aim for) pays `wire` more. On the deck you brake `brake`
// × harder (arrester wires: a carrier deck is short). After a take-off it takes `air` s in the air before the deck
// catches you again, so climbing away low and level doesn't land you straight back.
export const DECK = { catch: 7, points: 300, wire: 100, brake: 3, air: 2.5 };

// Lives and hull. Every crash costs a life (not in Relax Mode or god mode); the last one ends the run (main.js
// endRun). The hull mends itself only after REGEN_DELAY s without a hit, at REGEN_RATE × stats.regen hp/s; levelling up
// patches LEVEL_MEND of it (progression.js). Enemy hits are scaled by ENEMY_DMG so a fight can cost a life, not only a crash.
export const LIVES = 3;
export const MAX_LIVES = 5; // beating a boss gives a spare plane, up to this many (objectives.js complete)
const REGEN_DELAY = 12, REGEN_RATE = 0.6;
export const LEVEL_MEND = 50;
const ENEMY_DMG = 1.5; // every damage(n) call except a raw one (the planet bounce, which never takes your last hull)
// Breather (every boss alive has lost you, see enemies.js): repairs start sooner and run faster.
const BREATHER_DELAY = 5, BREATHER_REGEN = 2;
// Permanent upgrades from levelling up (see progression.js) start from these every run.
const BASE_STATS = { fireRate: 1, boostRegen: 1, boostDrain: 1, regen: 1, damage: 1 };
const BASE_HEALTH = 100, BASE_SPEED = 44;

export class Player {
  constructor(G) {
    this.G = G;
    this.model = makePlane();
    G.scene.add(this.model.group);
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.wind = new THREE.Vector3();
    this.resetRun();
    this.speed = this.baseSpeed;
    this.sizeScale = 1;    // Mega Ram / Tiny Ace power-ups
    this.invuln = 0;
    this.grace = 0;        // after the world mutates: terrain pushes you up instead of killing you
    this.dead = false;
    this.deadTimer = 0;
    this.loopAccum = 0;
    this.loopIdle = 0;
    this.tuckT = -1;         // seconds into a cave tuck; -1 when not tucking
    this.roofWarned = -99;
    this.events = [];
    this.maneuver = null;    // double-tap stunt in progress (see MANEUVERS)
    this.maneuverCd = 0;
    this.maneuversSeen = new Set();
    this.dodging = false;    // mid barrel roll: shots and bumps miss
    this.god = false;        // developer menu: no damage, and the ground can't hurt you
    this.shootCd = 0;
    this.pressedBoost = false; // boost held (by you, not Turbo / free boost) last frame
    this.whooshAt = -99;
    this.bullets = [];
    this.ceilingWarned = 0;
    this.surfaceWarned = -99;
    this.landed = null;      // on the ground: { yaw, t, ground } (see taxi); on a carrier's deck also { deck, local, rel } (see rollDeck)
    this.onGlide = false;    // on a runway's glide path this frame: easing down to APPROACH_SLOW (see fly)
    this.glideNoted = null;  // the runway objective whose glide-path note already showed
    this.onChain = false;    // near a chain's next link this frame: easing down to CHAIN_SLOW (see fly)
    this.chainNoted = null;  // the chain objective whose slow-down note already showed
    this.lastLanding = null; // the latest touchdown: { grade, title, sink, bank, points, x, z }
    this.airTime = 0;        // seconds airborne since the last touchdown or respawn (landing bonus needs BONUS_AIRTIME)
    this.everLanded = false;
    this.tipShown = false;   // the landing tip shows once per session
    this.bulletGeo = new THREE.SphereGeometry(0.7, 6, 4);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: '#fff36a' });
  }

  setSkin(s) { this.skin = s; this.model.setSkin(s); }

  // A fresh run (boot, and "Fly again" after a Game Over): full lives, base stats, the first skin and speed.
  resetRun() {
    this.lives = LIVES;
    this.stats = { ...BASE_STATS };
    this.maxHealth = this.health = BASE_HEALTH;
    this.baseSpeed = BASE_SPEED; // the speed mutation raises it
    this.boost = 1;
    this.freeBoost = 0;
    this.sinceHit = 99;
    this.loopRequirement = 1;
    this.loopTuck = TUCK;
    this.setSkin(PLANE_SKINS[0]);
  }

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
    if (G.enemies) G.enemies.streakAt = -Infinity; // a new plane starts a new kill streak
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
        if (this.lives <= 0) { if (!G.gameOver) G.endRun(); return; } // out of planes: Game Over (main.js)
        const f = this.forward, at = this.pos.clone();
        this.spawn(this.pos.x, this.pos.z, Math.atan2(-f.x, -f.z));
        G.enemies.placeRespawn(this, at); // a planet fight moves you back out in front of the planet
        G.ui.notify(pick(T.respawn), 'info', 3, 0);
      }
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.grace = Math.max(0, this.grace - dt);
    if (this.grace <= 0) this.graceNotified = false;
    this.sinceHit += dt;
    const breather = G.enemies.breather;
    if (this.sinceHit > (breather ? BREATHER_DELAY : REGEN_DELAY) && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + dt * REGEN_RATE * this.stats.regen * (breather ? BREATHER_REGEN : 1));

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
    const tuck = this.tuckRate(dt, input);
    if (this.maneuver) this.stepManeuver(dt);
    else this.steer(dt, input, tuck);

    // Loop detection: accumulate pitch rotation in one direction (as applied, tuck included).
    const dp = input.pitch * PITCH_RATE * tuck * dt;
    if (Math.abs(input.pitch) > 0.25) {
      if (Math.sign(dp) !== Math.sign(this.loopAccum) && Math.abs(this.loopAccum) > 0.5) this.loopAccum *= 0.5;
      this.loopAccum += dp;
      this.loopIdle = 0;
    } else if ((this.loopIdle += dt) > 1.2) this.loopAccum = 0;
    if (Math.abs(this.loopAccum) >= Math.PI * 2 * this.loopRequirement) { this.events.push('loop'); this.loopAccum = 0; }
    if (G.world.cave && Math.abs(this.loopAccum) > ROOF_WARN.angle && G.time - this.roofWarned > ROOF_WARN.gap
      && G.terrain.ceilingHeight(this.pos.x, this.pos.z, this.pos.y) - this.pos.y < ROOF_WARN.dist) {
      this.roofWarned = G.time;
      G.ui.notify('Roof! Pull harder!', 'warn', 1.5, 2);
    }

    // Speed + boost.
    const boosting = this.throttle(dt, input);
    const glide = !boosting && !!G.objectives.current?.onGlidePath?.(this);
    if (glide && this.glideNoted !== G.objectives.current) { // once per runway
      this.glideNoted = G.objectives.current;
      G.ui.notify('On the glide path: easing the throttle for you.', 'info', 2.5, 1);
    }
    this.onGlide = glide;
    const cur = G.objectives.current, link = !boosting && !glide && cur?.chainSlow ? cur.target() : null;
    const chain = !!link && link.distanceToSquared(this.pos) < CHAIN_SLOW_RANGE * CHAIN_SLOW_RANGE;
    if (chain && this.chainNoted !== cur) { // once per chain
      this.chainNoted = cur;
      G.ui.notify('Chain ahead: easing the throttle so you can steer. Boost to go full speed.', 'info', 2.5, 1);
    }
    this.onChain = chain;
    const cruise = glide ? APPROACH_SLOW : chain ? CHAIN_SLOW : 1;
    const target = (boosting ? this.baseSpeed * this.boostMul() : this.baseSpeed * cruise) - this.forward.y * 10;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (boosting ? 2.5 : 1.2)));

    this.prevPos.copy(this.pos);
    this.pos.addScaledVector(this.forward, this.speed * dt).addScaledVector(this.wind, dt);

    // A carrier's flight deck: come down on it gently and you land there (the secret; see deckTouchdown).
    const deck = G.enemies.deckAt(this.pos, _d);
    if (deck?.spot.at === 'deck' && this.pos.y < deck.y + DECK.catch && this.prevPos.y > deck.y && this.prevPos.y - this.pos.y > -1 && this.airTime > DECK.air && this.canLandOn(deck.y, dt)) { this.deckTouchdown(deck, dt); return true; }

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

  // The pitch-rate multiplier for this frame: 1, except during a cave tuck (see TUCK_FROM). A soft rising whoosh starts it.
  tuckRate(dt, input) {
    const G = this.G;
    if (!G.world.cave || this.maneuver || input.pitch <= 0.25) { this.tuckT = -1; return 1; }
    const fast = Math.max(1, this.speed / BASE_SPEED);
    let k = fast;
    if (this.loopAccum > TUCK_FROM) {
      if (this.tuckT < 0) { this.tuckT = 0; G.audio.tone(200, 0.6, { type: 'sine', vol: 0.05, slide: 260 }); }
      this.tuckT += dt;
      k *= 1 + (this.loopTuck - 1) * Math.min(1, this.tuckT / TUCK_RAMP);
    } else this.tuckT = -1;
    if (this.loopAccum > ROOF_TUCK.from && this.loopAccum < ROOF_TUCK.to) {
      // The circle you're on (radius speed / pitch rate) still climbs R × (1 + up.y) to its top. Its centre is R × up
      // away: the roof is checked here, over the top and over the circle's far side. Not enough room under the
      // lowest of them: pitch faster so it fits.
      const p = this.pos, rate = PITCH_RATE * input.pitch, R = this.speed / (rate * k);
      const cx = p.x + this.up.x * R, cz = p.z + this.up.z * R;
      _v.set(this.forward.x, 0, this.forward.z).normalize().multiplyScalar(R);
      const roof = Math.min(G.terrain.ceilingHeight(p.x, p.z, p.y), G.terrain.ceilingHeight(cx, cz, p.y), G.terrain.ceilingHeight(cx + _v.x, cz + _v.z, p.y));
      const room = roof - 2.5 - ROOF_TUCK.margin - p.y, climb = 1 + this.up.y;
      const need = room > 0 ? (this.speed * climb) / (room * rate) : Infinity;
      k = Math.max(k, Math.min(need, ROOF_TUCK.max * fast));
    }
    return k;
  }

  // Normal flying. Roll input sets a target bank angle (casual: let go → wings level). `tuck` scales the pitch rate.
  steer(dt, input, tuck = 1) {
    const G = this.G, q = this.quat;
    const bank = Math.asin(THREE.MathUtils.clamp(-this.right.y, -1, 1));
    const dRoll = THREE.MathUtils.clamp((input.roll * MAX_BANK - bank) * BANK_RESPONSE, -ROLL_RATE, ROLL_RATE) * dt;
    q.multiply(_q.setFromAxisAngle(X, input.pitch * PITCH_RATE * tuck * dt));
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

  // Boost: drains while held (free boost and Turbo cost nothing), recharges otherwise. Returns whether it's on.
  // Pressing it yourself goes whoosh (at most every WHOOSH_GAP s); free boost stays quiet. Turbo only acts while you
  // hold boost: faster (TURBO_BOOST) and free, so you pick when to go fast.
  throttle(dt, input) {
    const G = this.G, turbo = G.powerups.has('turbo');
    const pressed = this.freeBoost <= 0 && input.boost && (turbo || this.boost > 0.02);
    const boosting = this.freeBoost > 0 || pressed;
    if (pressed && !this.pressedBoost && G.time - this.whooshAt >= WHOOSH_GAP) { this.whooshAt = G.time; G.audio.whoosh(); }
    this.pressedBoost = pressed;
    if (this.freeBoost > 0) this.freeBoost -= dt;
    else if (boosting && !turbo) this.boost = Math.max(0, this.boost - dt * BOOST_DRAIN * this.stats.boostDrain);
    else this.boost = Math.min(1, this.boost + dt * BOOST_REGEN * this.stats.boostRegen);
    this.boosting = boosting;
    return boosting;
  }

  // Boost speed over base speed: higher while Turbo is active (only when you're actually boosting, see throttle).
  boostMul() { return this.G.powerups.has('turbo') && this.freeBoost <= 0 ? TURBO_BOOST : BOOST_MUL; }

  bank() { return Math.asin(THREE.MathUtils.clamp(-this.right.y, -1, 1)); }

  // Steepest rise per metre of the ground a few metres around (x, z), asked at height y (tunnel floors count).
  slopeAt(x, z, y) {
    const h = (dx, dz) => this.G.terrain.surfaceHeight(x + dx, z + dz, y);
    return Math.max(Math.abs(h(4, 0) - h(-4, 0)), Math.abs(h(0, 4) - h(0, -4))) / 8;
  }

  // Could you land on the ground g at (x, z), asked at height y? Dry and flat enough, never the seabed.
  // canLand and the pull-up warning (pullup.js) both ask this, so they can't disagree.
  landableAt(x, z, y, g) {
    return !this.G.world.underwater && g > waterLine() && this.slopeAt(x, z, y) < LAND.slope;
  }

  // Reaching the ground gently, wings level and nose up enough, on dry and flat-enough ground: that's a landing.
  // Not mid-stunt, and never on the seabed. The ground under the last position must be close too (no wall in the way).
  canLand(ground, dt) {
    const G = this.G, p = this.pos, q = this.prevPos;
    if (G.world.underwater || ground <= waterLine()) return false;
    return this.canLandOn(ground, dt) && Math.abs(ground - G.terrain.surfaceHeight(q.x, q.z, q.y)) < 2 && this.landableAt(p.x, p.z, p.y, ground);
  }

  // The approach part of a landing, on any surface at height y (the ground, or a carrier's deck): not mid-stunt, a
  // gentle sink, wings level and the nose up enough.
  canLandOn(y, dt) {
    const sink = (this.prevPos.y - this.pos.y) / dt;
    return !this.maneuver && sink < LAND.sink && Math.abs(this.bank()) < LAND.bank && this.forward.y > LAND.noseDown && this.up.y > LAND.upright;
  }

  touchdown(ground, dt) {
    const grade = this.grade(dt);
    this.landed = { yaw: Math.atan2(-this.forward.x, -this.forward.z), t: 0 };
    this.sitOnGround(ground);
    this.landingFx(grade);
  }

  // How soft this touchdown was: its LANDING_GRADES entry, and the points it pays (none for a hop). Records lastLanding.
  grade(dt) {
    const sink = Math.max(0, (this.prevPos.y - this.pos.y) / dt), bank = Math.abs(this.bank());
    const grade = LANDING_GRADES.find((g) => sink <= g.sink && bank <= g.bank);
    const points = this.airTime >= BONUS_AIRTIME ? grade.points : 0; // no farming points by hopping
    this.lastLanding = { grade: grade.id, title: grade.title, sink: +sink.toFixed(2), bank: +((bank * 180) / PI).toFixed(1), points, x: this.pos.x, z: this.pos.z };
    this.everLanded = true;
    this.airTime = 0;
    this.events.push('landed');
    this.G.score += points;
    return { ...grade, points };
  }

  // Dust, a thump and the grade's line (`extra` follows it, for a deck landing).
  landingFx(grade, extra = '') {
    const G = this.G, points = grade.points;
    G.fx.emit(_v.copy(this.pos).addScaledVector(this.up, -WHEELS * this.sizeScale), 26, { colors: DUST, speed: 14, life: 1.1, size: 5, gravity: -6, up: 7 });
    G.audio.tone(72, 0.3, { type: 'sine', vol: 0.22, slide: -30 });
    G.audio.noise(0.2, { vol: 0.12, freq: 500 });
    G.ui.notify(extra || `${grade.title} ${pick(T[grade.texts])}${points ? ` +${points}` : ' (No points for hops: fly a while first.)'}`, 'good', extra ? 5 : 3.5, 2);
  }

  // The secret: landing on HMS Overkill's flight deck mid-fight. Its deck carries you along as it steams and turns
  // (rollDeck), its guns hold fire while you're parked there (enemies.js), and the first landing on each carrier patches
  // your hull to full and pays DECK.points (more on the 3-wire). Taking off is the usual pull up.
  deckTouchdown(deck, dt) {
    const G = this.G, e = deck.e, wire = deck.spot.wire;
    const grade = this.grade(dt), yaw = Math.atan2(-this.forward.x, -this.forward.z);
    this.landed = { yaw, t: 0, deck: e, local: deck.local.clone().setY(e.def.deck.y), rel: yaw - e.mesh.rotation.y, ground: deck.y };
    this.pos.y = deck.y + WHEELS * this.sizeScale;
    this.quat.setFromAxisAngle(Y, yaw);
    this.updateAxes();
    this.lastLanding.deck = true;
    this.lastLanding.wire = wire;
    let line = `${grade.title} on the deck of ${e.def.short}!`;
    if (!e.deckVisited) {
      e.deckVisited = true;
      const bonus = DECK.points + (wire === 3 ? DECK.wire : 0);
      G.score += bonus;
      this.health = this.maxHealth;
      line = `Welcome aboard ${e.def.short}! ${wire === 3 ? 'You caught the 3-wire, like a real navy pilot. ' : wire ? `Caught the ${wire}-wire. ` : ''}The deck crew patched your hull. The captain is furious. +${bonus + grade.points}`;
    } else if (wire) line += ` Caught the ${wire}-wire.`;
    this.landingFx(grade, line);
    G.fx.emit(_v.copy(this.pos), 30, { colors: ['#ffd23a', '#ffffff', '#5ad8ff'], speed: 20, life: 1.4, size: 4, gravity: -10, up: 12 });
    G.secrets?.trigger('aboard');
    G.ui.notify('Pull up to take off again. The guns can\'t aim this low, but its fighters can.', 'info', 4, 1);
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
    if (L.deck) L.yaw = L.deck.mesh.rotation.y + L.rel; // the carrier turned under you
    const boosting = this.throttle(dt, input), pull = input.pitch > 0.3;
    const target = boosting ? this.baseSpeed * this.boostMul() : pull ? this.baseSpeed : TAXI_SPEED;
    const rate = this.speed > target ? BRAKE * (L.deck ? DECK.brake : 1) : boosting ? THROTTLE * 1.5 : THROTTLE;
    this.speed += THREE.MathUtils.clamp(target - this.speed, -rate * dt, rate * dt);
    L.yaw -= THREE.MathUtils.clamp(input.roll + input.yaw, -1, 1) * TAXI_TURN * dt;
    if (L.deck) L.rel = L.yaw - L.deck.mesh.rotation.y;
    if (pull && this.speed >= this.baseSpeed * LIFTOFF) { this.liftoff(); return true; }
    if (L.deck) return this.rollDeck(dt);

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

  // Rolling on a carrier's deck, in its own frame (model units), so it carries you along as it steams and turns. Off
  // the edge you're flying again; into the island is a crash (like a wall); a sunk carrier leaves you in the air.
  rollDeck(dt) {
    const G = this.G, L = this.landed, e = L.deck, s = e.mesh.scale.x;
    this.prevPos.copy(this.pos);
    if (e.dead || !G.enemies.list.includes(e)) {
      this.landed = null;
      this.pos.y += 4;
      G.ui.notify('The deck went down under you. Good news: you\'re a plane.', 'warn', 2.5, 1);
      return true;
    }
    const run = (this.speed * dt) / s;
    L.local.x -= Math.sin(L.rel) * run;
    L.local.z -= Math.cos(L.rel) * run;
    const spot = deckSpot(L.local.x, L.local.z);
    e.mesh.updateMatrixWorld();
    this.pos.copy(e.mesh.localToWorld(_v.copy(L.local)));
    if (!spot) { // rolled off the edge
      this.landed = null;
      G.ui.notify('Ran out of deck. Good news: you\'re still a plane.', 'info', 2.5, 0);
      return true;
    }
    if (spot.at === 'island' && !(G.powerups.has('ghost') || this.god)) {
      if (this.grace <= 0 && this.invuln <= 0) { this.crash('ground'); return false; }
      this.landed = null;
      this.pos.y += 30;
      return true;
    }
    L.ground = this.pos.y;
    this.pos.y += WHEELS * this.sizeScale;
    this.quat.setFromAxisAngle(Y, L.yaw);
    this.updateAxes();
    if (this.speed > 15 && Math.random() < 0.5) G.fx.trail(_v.copy(this.pos).addScaledVector(this.forward, -3).addScaledVector(this.up, -2), '#8a9098');
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
        // Bullets blast real holes in the ground: a fresh hit digs a pit, more hits on it dig it out fast.
        this.G.terrain.deform(b.pos.x, b.pos.z, BULLET_CRATER.r, BULLET_CRATER.depth);
        this.G.fx.dirt(b.pos);
        this.G.audio.thump();
        this.removeBullet(i);
      }
    }
  }

  // Homing Bullets power-up: curve toward the nearest enemy in front of the bullet. A planet boss offers its nearest
  // gadget that can be hurt right now instead of its centre (planetboss.js homeAt).
  steerBullet(b, dt) {
    let best = null, bd = 260 * 260;
    for (const e of this.G.enemies.list) {
      const at = e.planet ? e.planet.homeAt(b.pos) : e.pos;
      if (!at) continue;
      _v.subVectors(at, b.pos);
      const d = _v.lengthSq();
      if (d < bd && _v.dot(b.vel) > 0) { bd = d; best = at; }
    }
    if (!best) return;
    const speed = b.vel.length();
    _v.subVectors(best, b.pos).setLength(speed);
    b.vel.lerp(_v, 1 - Math.exp(-dt * 6)).setLength(speed);
  }

  removeBullet(i) {
    this.G.scene.remove(this.bullets[i].mesh);
    this.bullets.splice(i, 1);
  }

  // raw: skip ENEMY_DMG (the caller already chose the exact amount).
  damage(n, raw = false) {
    if (this.dead || this.invuln > 0 || this.dodging || this.god) return;
    const G = this.G;
    if (G.powerups.has('shield')) { G.powerups.shieldHit(); return; }
    this.health -= (raw ? n : n * ENEMY_DMG) * (G.powerups.has('mega') ? MEGA.armor : 1); // Mega Ram is armoured
    this.sinceHit = 0;
    G.ui.flash('#ff3a3a', 0.35);
    G.audio.hit();
    G.shake?.(0.6, 0.15);
    if (Math.random() < 0.2) G.ui.notify(pick(T.hurt), 'bad', 2, 0);
    if (this.health <= 0) this.crash('enemy');
  }

  // text: a line of its own instead of the usual quip for this reason.
  crash(reason, text = null) {
    const G = this.G;
    this.dead = true;
    this.landed = null;
    this.deadTimer = 2.2;
    this.health = 0;
    this.model.group.visible = false;
    this.wind.set(0, 0, 0);
    G.stats.crashes++;
    const free = G.relax || this.god; // Relax Mode is no-pressure, and god mode is for testing: no life lost
    if (!free) this.lives = Math.max(0, this.lives - 1);
    if (reason === 'water') G.fx.splash(this.pos);
    else {
      G.fx.explosion(this.pos);
      if (reason === 'ground') G.terrain.deform(this.pos.x, this.pos.z, 12, 6); // you left a mark
    }
    G.audio.explode();
    G.ui.flash('#ffffff', 0.5);
    G.shake?.(1.5, 0.35);
    G.ui.notify(text || pick(reason === 'water' ? T.crashWater : reason === 'enemy' ? T.crashEnemy : T.crashGround), 'bad', 4);
    if (free) return;
    G.ui.livesLost();
    if (this.lives === 1) G.ui.notify(`Last life! ${pick(T.lastLife)}`, 'warn', 4, 2);
    else if (this.lives > 1) G.ui.notify(`${this.lives} lives left. ${pick(T.lifeLost)}`, 'warn', 4, 2);
  }

  // Gently steer the nose toward a point (used by the "tailwind" persuasion).
  nudgeToward(target, rate, dt) {
    _m.lookAt(this.pos, target, Y);
    _q.setFromRotationMatrix(_m);
    this.quat.slerp(_q, Math.min(1, rate * dt));
  }
}
