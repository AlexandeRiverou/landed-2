// The persuasion engine. Tracks how hard the player is ignoring the objective ("neglect")
// and escalates through increasingly desperate tactics: nagging, arrows, beams, bigger
// hoops, hoops that come to you, rainbow roads... and finally a participation trophy.
import * as THREE from 'three';
import { makeArrow3D, makeSign, makeTextSprite, makeRing, disposeTree } from './models.js';
import { pick, rand, fmt, T, weightedPick } from './texts.js';
import { crossRing, flatForward, groundAt, underRoof } from './objectives.js';
import { curveDrop } from './curve.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// Pacing. The first tactic comes after FIRST_NEGLECT s of neglect, each later one NEGLECT_STEP s of neglect after
// that; whatever the neglect rate (flying away fills it 1.5x), two tactics are at least MIN_GAP real seconds apart.
const FIRST_NEGLECT = 20, NEGLECT_STEP = 14, MIN_GAP = 15;
const WRONG_WAY_GAP = 25;  // real seconds between two "wrong way" nags
const TROPHY_STAGE = 13;   // this many escalations and we just hand over the participation trophy

// Each tactic: tier (1 mild → 3 desperate), repeat (max uses per objective), can(), apply() → effect | text.
export const TACTICS = [
  {
    id: 'nag', tier: 1, repeat: 3, weight: 0.6, kind: 'persuade',
    can: () => true,
    apply: (G, o) => { G.audio.nag(); return { text: pick(T.nag) }; },
  },
  {
    id: 'guilt', tier: 1, repeat: 2, weight: 0.6,
    can: () => true,
    apply: (G) => { G.ui.tint('#8aa0c8', 4); G.audio.sad(); return { text: pick(T.guilt) }; },
  },
  {
    id: 'hint', tier: 1, repeat: 2, weight: 1.5,
    can: (o) => !!o.hints,
    apply: (G, o) => ({ text: 'Pro tip: ' + pick(o.hints) }),
  },
  {
    id: 'gps', tier: 1, need: 'target',
    can: () => true,
    apply: (G) => { G.ui.showDistance = true; },
    texts: ['GPS activated. Recalculating your life choices.', 'We installed a distance counter. The numbers should go DOWN.', 'Distance is no longer classified. You\'re welcome.'],
  },
  {
    id: 'edgeArrow', tier: 1, need: 'target', repeat: 2,
    can: () => true,
    apply: (G) => { G.ui.edgeArrow = Math.min(2, G.ui.edgeArrow + 1); },
    texts: ['The little arrow got promoted. Follow it. It\'s pointy for a reason.', 'The arrow is now BIGGER and PINKER. Like, way bigger.', 'Screen arrow deployed. It has one job.'],
  },
  {
    id: 'ping', tier: 1, need: 'target',
    can: () => true,
    apply: (G, o) => sonar(G, o),
    texts: ['Sonar enabled. Follow the beeps. Higher beep = closer. Like a bat with a plane.', 'We attached a beeper to {noun}. Listen for it. Ignore the neighbors.'],
  },
  {
    id: 'beam', tier: 1, need: 'place',
    can: () => true,
    apply: (G, o) => beam(G, o),
    texts: ['We installed a 900 m laser pointer on {noun}. Very subtle.', 'Behold: a giant beam of light. If you miss this, we need to talk.', 'Light pillar activated. Visible from space. And from your plane, hopefully.'],
  },
  {
    id: 'reverse', tier: 1, repeat: 2, weight: 0.8,
    can: () => true,
    // Reverse psychology. The second time, it stops being subtle.
    apply: (G, o, P) => ({ text: pick(P.used.get('reverse') > 1 ? T.reverseAgain : T.reverse) }),
  },
  {
    id: 'petition', tier: 1,
    can: () => true,
    apply: (G, o) => petition(G, o),
  },
  {
    id: 'hotCold', tier: 1, need: 'place',
    can: () => true,
    apply: (G, o) => hotCold(G, o),
    texts: ['Let\'s play hot & cold! Check the objective card. Hint: you\'re cold.', 'Temperature sensor attached to {noun}. Fly toward the warm.'],
  },
  {
    id: 'giantText', tier: 2, need: 'place',
    can: () => true,
    apply: (G, o) => giantText(G, o),
    texts: ['We wrote "HERE" over {noun}. In giant letters. Like an adult.', 'Floating text installed above {noun}. The font is "Desperate Bold".'],
  },
  {
    id: 'grow', tier: 2, repeat: 3, cap: 'grow',
    can: () => true,
    apply: (G, o) => { o.grow(1.6); },
    texts: ['{Noun} has been supersized. Free of charge.', '{Noun} grew. It\'s been eating its vegetables.', 'We made {noun} BIGGER. Any bigger and it needs its own zip code.', 'Size upgrade for {noun}! It\'s self-conscious about it now.'],
  },
  {
    id: 'arrow3d', tier: 2, need: 'target',
    can: () => true,
    apply: (G, o) => arrow3d(G, o),
    texts: ['Giant arrow mounted in front of your plane. It\'s pointing. Rudely.', 'A floating arrow now follows you around. It\'s judgmental but accurate.'],
  },
  {
    id: 'breadcrumbs', tier: 2, need: 'place',
    can: () => true,
    apply: (G, o) => breadcrumbs(G, o),
    texts: ['We dropped glowing breadcrumbs to {noun}. Unlike Hansel, please actually follow them.', 'Glowing orb trail installed. Each one is worth 5 points. Bribery? Yes.'],
  },
  {
    id: 'sign', tier: 2,
    can: () => true,
    apply: (G, o) => sign(G, o),
    texts: ['A road sign was installed. In the sky. Don\'t ask about permits.', 'Billboard deployed! Held up by balloons and pure hope.'],
  },
  {
    id: 'fireworks', tier: 2, need: 'place',
    can: () => true,
    apply: (G, o) => fireworks(G, o),
    texts: ['Fireworks at {noun}! If that\'s not a hint, we don\'t know what is.', '{Noun} is throwing itself a party. You\'re invited. Please come.'],
  },
  {
    id: 'sunMove', tier: 2, need: 'place',
    can: () => true,
    apply: (G, o) => sunMove(G, o),
    texts: ['We moved the SUN so it sets right behind {noun}. Astronomers are furious.', 'The sun has been relocated to point at {noun}. Physics filed a complaint.'],
  },
  {
    id: 'fogClear', tier: 2,
    can: (o, P) => P.G.sky.fogNow < 1.5,
    apply: (G) => { G.sky.fogBoost = 1.8; G.sky.weather.set('clear'); },
    texts: ['Fog removed. Weather cancelled. Visibility: suspiciously perfect.', 'We turned off the weather. No more excuses.'],
  },
  {
    id: 'calmEnemies', tier: 2,
    can: (o, P) => P.G.enemies.list.some((e) => !e.quest) && !o.needsEnemies,
    apply: (G) => { G.enemies.calm(45); },
    texts: ['We bribed the enemies to take a coffee break. 45 seconds. GO.', 'Enemies are on strike. They want better dental. Fly freely!'],
  },
  {
    id: 'sadRain', tier: 2,
    can: (o, P) => P.G.sky.weather.type !== 'rain',
    apply: (G) => { G.sky.weather.set('rain'); G.ui.tint('#7a90b8', 5); G.audio.sad(); },
    texts: ['It\'s raining because {noun} is sad. Look what you did.', 'Local weather update: {noun} is crying. Heavily.'],
  },
  {
    id: 'easier', tier: 2, repeat: 3, cap: 'easier',
    can: () => true,
    apply: (G, o) => { const t = o.easier(G); return t ? { text: t } : null; },
    texts: ['We lowered the bar. Then lowered it again.', 'Difficulty reduced. Nobody has to know.'],
  },
  {
    id: 'magnet', tier: 2, cap: 'magnet',
    can: () => true,
    apply: (G, o) => { o.magnet(); },
    texts: ['Your plane is now magnetic. {Noun} will come to you if you get close-ish.', 'Magnet mode! Get within 450 m and {noun} will start drifting over.'],
  },
  {
    id: 'cheerSquad', tier: 2, need: 'place',
    can: () => true,
    apply: (G, o) => cheerSquad(G, o),
    texts: ['We hired a cheer squad. They cheer every time you turn toward {noun}. Only then.', 'A live studio audience has been added. They LOVE it when you face {noun}.'],
  },
  {
    id: 'redCarpet', tier: 2, need: 'place',
    can: () => true,
    apply: (G, o) => redCarpet(G, o),
    texts: ['We rolled out the red carpet. All the way to {noun}. Dress code: plane.', 'Red carpet installed. Paparazzi not included. VIP access to {noun}.'],
  },
  {
    id: 'limitedOffer', tier: 2,
    can: () => true,
    apply: (G, o, P) => limitedOffer(G, o, P),
    texts: ['LIMITED-TIME OFFER! Finish {noun} in 60 seconds for +100 bonus points! Terms and conditions: none.', 'Act now! {Noun}, today only, comes with +100 FREE points. 60 seconds left!'],
  },
  {
    id: 'skywriting', tier: 2, need: 'place',
    can: () => true,
    apply: (G, o) => skywriting(G, o),
    texts: ['We hired a skywriter. It cost a fortune. Please read it.', 'Message in the clouds, just for you. Cloud font, size: enormous.'],
  },
  {
    id: 'cinematic', tier: 2, need: 'place',
    // Only with sky to spare: for two seconds you're watching {noun}, not the ground.
    can: (o, P) => !P.G.player.dead && P.G.player.pos.y - groundAt(P.G, P.G.player.pos.x, P.G.player.pos.z) > 80,
    apply: (G, o) => cinematic(G, o),
    texts: ['Mission control has borrowed your camera for a short presentation about {noun}.', 'And now, a brief cinematic of {noun}. Please hold your applause.'],
  },
  {
    id: 'approach', tier: 3, repeat: 3, cap: 'approach',
    can: () => true,
    apply: (G, o) => { o.approach(G, 0.45); },
    texts: ['{Noun} is coming to you. Slowly. Awkwardly.', '{Noun} got tired of waiting and started walking over. It doesn\'t have legs.', 'Mountain, Muhammad, you know the drill. {Noun} is moving closer.'],
  },
  {
    id: 'tailwind', tier: 3, need: 'target', repeat: 2,
    can: () => true,
    apply: (G, o) => tailwind(G, o),
    texts: ['A suspiciously convenient tailwind has appeared. It\'s also steering. Relax.', 'Autopilot (lite) engaged for 12 seconds. Hands off the wheel. Or don\'t.'],
  },
  {
    id: 'rainbow', tier: 3, need: 'place',
    can: () => true,
    apply: (G, o) => rainbow(G, o),
    texts: ['A rainbow road now leads to {noun}. Very regal. Very obvious.', 'We built you a RAINBOW. To {noun}. Do you understand how hard that was?'],
  },
  {
    id: 'ringParade', tier: 3, need: 'place',
    can: (o) => o.type !== 'gate',
    apply: (G, o) => ringParade(G, o),
    texts: ['Practice rings installed along the way. Like training wheels, but rings. +15 each!', 'A tunnel of rings now leads to {noun}. It\'s basically a waterslide.'],
  },
  {
    id: 'escort', tier: 3, need: 'place',
    can: () => true,
    apply: (G, o) => escort(G, o),
    texts: ['A squadron of paper planes will now escort you to {noun}. They\'re very patient. And very folded.', 'Follow the paper planes! They know the way. They read the brief.'],
  },
  {
    id: 'coinTrail', tier: 3, need: 'place',
    can: () => true,
    apply: (G, o) => coinTrail(G, o),
    texts: ['We paved the way to {noun} with gold coins. 10 points each. Yes, this is bribery.', 'Coins! Real(ish) money! Lying in the sky on the way to {noun}. Just saying.'],
  },
  {
    id: 'ultimatum', tier: 3,
    can: () => true,
    apply: (G, o) => ultimatum(G, o),
    texts: ['Final warning: reach {noun} in 30 seconds or we send it a "we need to talk" text.'],
  },
  {
    id: 'flatten', tier: 3,
    can: (o, P) => !P.flattened && P.G.world.amp > 0.5 && !P.G.zones.current.noGround, // no mountains to sit down in space
    apply: (G, o, P) => {
      P.flattened = { prev: G.world.amp, now: G.world.amp * 0.35 };
      G.world.amp = P.flattened.now;
      G.terrain.rebuildAll();
      G.player.grace = 5;
    },
    texts: ['We asked the mountains to sit down. They\'re sitting.', 'Terrain flattened to remove obstacles. Geologists are crying.'],
  },
  {
    id: 'speedBoost', tier: 3,
    can: () => true,
    apply: (G) => { G.player.freeBoost = 12; },
    texts: ['FREE UNLIMITED BOOST for 12 seconds! Point it at {noun}, please.', 'We put rocket fuel in your tank. The good kind. 12 seconds.'],
  },
  {
    id: 'teleport', tier: 3, repeat: 2, cap: 'teleport', minStage: 8,
    can: () => true,
    apply: (G, o) => { o.teleport(G); },
    texts: ['FINE. {Noun} is now RIGHT IN FRONT OF YOU.', 'We teleported {noun} directly ahead. If you miss this, we\'re calling your mom.'],
  },
];

export class Persuasion {
  constructor(G) {
    this.G = G;
    this.effects = [];
    this.flattened = null;
    this.reset(null);
  }

  reset(obj) {
    this.clear();
    this.obj = obj;
    this.stage = 0;
    this.neglect = 0;
    this.used = new Map();
    this.bestDist = Infinity;
    this.prevDist = null;
    this.awayTime = 0;
    this.lastWrongWay = -99;
    this.lastEscalate = -99;
    this.closeShown = false;
    this.time = 0;
  }

  clear() {
    for (const e of this.effects) e.dispose?.();
    this.effects = [];
    const G = this.G;
    G.ui.edgeArrow = 0;
    G.ui.showDistance = false;
    G.sky.sunOverride = null;
    G.sky.fogBoost = 1;
    G.player.wind.set(0, 0, 0);
    G.camPeek = null;
    if (this.flattened) {
      if (G.world.amp === this.flattened.now) { G.world.amp = this.flattened.prev; G.terrain.rebuildAll(); G.player.grace = 5; }
      this.flattened = null;
    }
  }

  update(dt) {
    const G = this.G, obj = this.obj;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (e.update && e.update(dt) === false) { e.dispose?.(); this.effects.splice(i, 1); }
    }
    if (!obj || obj !== G.objectives.current || G.player.dead) return;
    this.time += dt;
    let rate = 1;
    const t = obj.target();
    if (t && !obj.virtual) {
      const d = G.player.pos.distanceTo(t);
      if (this.prevDist !== null) {
        const closing = (this.prevDist - d) / dt;
        if (closing < -15) this.awayTime += dt;
        else this.awayTime = Math.max(0, this.awayTime - dt * 2);
      }
      this.prevDist = d;
      // Breaking away from a boss is a tactic, not neglect; so is circling round during any flying-boss fight.
      const breather = G.enemies.breather || (obj.type === 'boss' && G.enemies.list.some((e) => e.boss && !e.dead && !e.def.ground));
      if (this.awayTime > 0.5 && !breather) rate = 1.5;
      if (d < this.bestDist - 25) { this.bestDist = d; rate = 0.15; }
      if (this.awayTime > 5 && !breather && this.time - this.lastWrongWay > WRONG_WAY_GAP) {
        this.lastWrongWay = this.time;
        G.ui.notify(fmt(pick(T.wrongWay), obj.noun), 'warn', 4);
        G.audio.nag();
      }
      if (d < 220 && !this.closeShown && this.stage >= 1 && !G.enemies.breather) {
        this.closeShown = true;
        G.ui.notify(fmt(pick(T.close), obj.noun), 'good', 3, 0);
      }
    }
    if (obj.progressed) { obj.progressed = false; rate = 0; this.neglect = Math.max(0, this.neglect - 4); }
    this.neglect += dt * rate;
    if (this.neglect >= FIRST_NEGLECT + this.stage * NEGLECT_STEP && this.time - this.lastEscalate >= MIN_GAP) this.escalate();
  }

  available(obj) {
    const tier = this.stage <= 3 ? 1 : this.stage <= 7 ? 2 : 3;
    const hasTarget = !!obj.target();
    return TACTICS.filter((t) => {
      if (t.tier > tier || (this.used.get(t.id) || 0) >= (t.repeat || 1)) return false;
      if (t.minStage && this.stage < t.minStage) return false;
      if (t.need === 'target' && !hasTarget) return false;
      if (t.need === 'place' && (!hasTarget || obj.virtual)) return false;
      if (t.cap && !obj.caps.has(t.cap)) return false;
      return t.can(obj, this);
    }).map((t) => ({ t, w: (t.weight || 1) * (t.tier === tier ? 3 : 1) }));
  }

  escalate() {
    const G = this.G, obj = this.obj;
    this.stage++;
    this.lastEscalate = this.time;
    if (this.stage >= TROPHY_STAGE) {
      G.ui.notify(pick(T.trophy), 'good', 6);
      G.objectives.complete(true);
      return;
    }
    const opts = this.available(obj);
    if (!opts.length) return;
    const { t } = weightedPick(opts, (o) => o.w);
    this.used.set(t.id, (this.used.get(t.id) || 0) + 1);
    const res = t.apply(G, obj, this) || null;
    if (res && (res.update || res.dispose)) this.effects.push(res);
    const text = res?.text || pick(t.texts);
    G.ui.notify(fmt(text, obj.noun), t.kind || 'persuade', 6);
    if (t.id !== 'nag' && t.id !== 'guilt') G.audio.ping(0, 0.8);
  }
}

// ---------- effect builders (return {update(dt) → false to end, dispose()}) ----------

function sonar(G, o) {
  let t = 0;
  return {
    update(dt) {
      const tg = o.target();
      if (!tg) return;
      const d = G.player.pos.distanceTo(tg);
      t -= dt;
      if (t > 0) return;
      t = THREE.MathUtils.clamp(d / 500, 0.25, 1.6);
      _v.subVectors(tg, G.player.pos).normalize();
      G.audio.ping(THREE.MathUtils.clamp(_v.dot(G.player.right), -1, 1), THREE.MathUtils.clamp(1.6 - d / 1000, 0.6, 1.6));
    },
  };
}

function beam(G, o) {
  const geo = new THREE.CylinderGeometry(7, 7, 900, 14, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: '#7affd8', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(geo, mat);
  G.scene.add(m);
  let t = 0;
  return {
    update(dt) {
      const tg = o.target();
      if (!tg) return;
      t += dt;
      m.position.set(tg.x, groundAt(G, tg.x, tg.z) + 450, tg.z);
      mat.color.setHSL((t * 0.1) % 1, 1, 0.65);
      mat.opacity = 0.28 + Math.sin(t * 5) * 0.08;
    },
    dispose() { G.scene.remove(m); geo.dispose(); mat.dispose(); },
  };
}

function giantText(G, o) {
  const s = makeTextSprite([pick(['HERE!!!', 'OVER HERE', 'LOOK. AT. ME.', '↓ THIS ONE ↓', 'HELLO??'])], 34, { bg: null, fg: '#ffd23a' });
  s.material.depthTest = false;
  s.renderOrder = 20;
  G.scene.add(s);
  let t = 0;
  return {
    update(dt) {
      const tg = o.target();
      if (!tg) return;
      t += dt;
      s.position.set(tg.x, tg.y + 45 + Math.sin(t * 3) * 5, tg.z);
    },
    dispose() { G.scene.remove(s); s.material.map.dispose(); s.material.dispose(); },
  };
}

function arrow3d(G, o) {
  const a = makeArrow3D();
  G.scene.add(a);
  let t = 0;
  return {
    update(dt) {
      const tg = o.target();
      const p = G.player;
      a.visible = !!tg && !p.dead;
      if (!tg) return;
      t += dt;
      a.position.copy(p.pos).addScaledVector(p.forward, 26).addScaledVector(p.up, 7 + Math.sin(t * 4));
      a.lookAt(tg);
      a.scale.setScalar(1 + Math.sin(t * 6) * 0.1);
    },
    dispose() { G.scene.remove(a); disposeTree(a); },
  };
}

function pathPoints(G, from, to, n, lift = 0) {
  const pts = [];
  for (let k = 1; k <= n; k++) {
    const f = k / (n + 1);
    const p = new THREE.Vector3().lerpVectors(from, to, f);
    p.y += Math.sin(f * Math.PI) * lift;
    p.y = Math.max(p.y, groundAt(G, p.x, p.z) + 18);
    pts.push(p);
  }
  return pts;
}

function breadcrumbs(G, o) {
  const p = G.player;
  const start = p.pos.clone().addScaledVector(p.forward, 50);
  const pts = pathPoints(G, start, o.target().clone(), 24);
  const geo = new THREE.SphereGeometry(2.2, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: '#7affd8' });
  const halo = new THREE.MeshBasicMaterial({ color: '#7affd8', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloGeo = new THREE.SphereGeometry(5, 8, 6);
  const orbs = pts.map((pt) => {
    const m = new THREE.Mesh(geo, mat);
    m.add(new THREE.Mesh(haloGeo, halo));
    m.position.copy(pt);
    G.scene.add(m);
    return m;
  });
  let t = 0;
  return {
    update(dt) {
      t += dt;
      for (const m of orbs) {
        if (!m.visible) continue;
        m.scale.setScalar(1 + Math.sin(t * 5 + m.position.x) * 0.2);
        if (m.position.distanceTo(G.player.pos) < 14) {
          m.visible = false;
          G.score += 5;
          G.audio.ding(1.5);
          G.fx.sparkle(m.position, '#7affd8');
        }
      }
    },
    dispose() { for (const m of orbs) G.scene.remove(m); geo.dispose(); mat.dispose(); halo.dispose(); haloGeo.dispose(); },
  };
}

function sign(G, o) {
  const lines = o.signText && Math.random() < 0.7 ? o.signText : pick([['YOU ARE HERE.', 'OBJECTIVE IS', 'NOT HERE.'], ['WRONG SKY,', 'BUDDY'], ['SCENIC ROUTE', 'CLOSED'], ['OBJECTIVE →', '(PROBABLY)']]);
  const s = makeSign(lines);
  const p = G.player;
  const f = flatForward(G);
  s.position.set(p.pos.x + f.x * 230, p.pos.y + 10, p.pos.z + f.z * 230);
  s.position.y = Math.max(s.position.y, groundAt(G, s.position.x, s.position.z) + 40);
  s.lookAt(p.pos.x, s.position.y, p.pos.z);
  G.scene.add(s);
  const arrow = makeArrow3D('#ffd23a');
  arrow.scale.setScalar(3);
  arrow.position.copy(s.position).add(new THREE.Vector3(0, -26, 0));
  G.scene.add(arrow);
  return {
    update() { const tg = o.target(); arrow.visible = !!tg; if (tg) arrow.lookAt(tg); },
    dispose() { G.scene.remove(s, arrow); disposeTree(s); disposeTree(arrow); },
  };
}

function fireworks(G, o) {
  let t = 0;
  return {
    update(dt) {
      const tg = o.target();
      if (!tg) return;
      t -= dt;
      if (t > 0) return;
      t = rand(0.5, 1);
      G.fx.firework(_v.copy(tg).add(new THREE.Vector3(rand(-40, 40), rand(30, 90), rand(-40, 40))));
    },
  };
}

function sunMove(G, o) {
  return {
    update() {
      const tg = o.target();
      if (tg) G.sky.sunOverride = _v.subVectors(tg, G.player.pos).clone();
    },
    dispose() { G.sky.sunOverride = null; },
  };
}

function tailwind(G, o) {
  let t = 12;
  return {
    update(dt) {
      const tg = o.target();
      const p = G.player;
      t -= dt;
      if (!tg || t <= 0) { p.wind.set(0, 0, 0); return false; }
      if (p.dead) return;
      _v.subVectors(tg, p.pos).normalize();
      p.wind.copy(_v).multiplyScalar(24);
      p.nudgeToward(tg, 0.9, dt);
    },
    dispose() { G.player.wind.set(0, 0, 0); },
  };
}

function rainbow(G, o) {
  const p = G.player;
  const start = p.pos.clone().addScaledVector(p.forward, 80);
  start.y = Math.max(start.y, groundAt(G, start.x, start.z) + 20);
  const end = o.target().clone();
  const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
  mid.y += start.distanceTo(end) * 0.3;
  const group = new THREE.Group();
  const colors = ['#ff3a3a', '#ff9a3a', '#ffe03a', '#4aff6a', '#3ab0ff', '#9a5aff'];
  colors.forEach((c, i) => {
    const off = new THREE.Vector3(0, (colors.length - i) * 3, 0);
    const curve = new THREE.QuadraticBezierCurve3(start.clone().add(off), mid.clone().add(off), end.clone().add(off));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 1.6, 5, false), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 })));
  });
  G.scene.add(group);
  return { dispose() { G.scene.remove(group); disposeTree(group); } };
}

function ringParade(G, o) {
  const p = G.player;
  const start = p.pos.clone().addScaledVector(p.forward, 120);
  const end = o.target().clone();
  const pts = pathPoints(G, start, end, 7);
  const rings = pts.map((pt, i) => {
    const r = makeRing(14, '#ff9ae0');
    r.position.copy(pt);
    r.lookAt(i + 1 < pts.length ? pts[i + 1] : end);
    G.scene.add(r);
    return r;
  });
  return {
    update() {
      for (const r of rings) {
        if (!r.visible) continue;
        r.userData.studs.rotation.z += 0.02;
        if (crossRing(r, G.player.prevPos, G.player.pos, 14) === 'hit') {
          r.visible = false;
          G.score += 15;
          G.audio.ding(1.3);
          G.fx.sparkle(r.position, '#ff9ae0');
        }
      }
    },
    dispose() { for (const r of rings) { G.scene.remove(r); disposeTree(r); } },
  };
}

// A line of text under the objective card (hot & cold, countdowns). The caller removes it in dispose().
function hudLine(color) {
  const el = document.createElement('div');
  Object.assign(el.style, { fontSize: '14px', fontWeight: '700', marginTop: '4px', color });
  document.getElementById('objective').append(el);
  return el;
}

// Notifications on a timer: [[seconds, text], ...], then the effect ends.
function chain(G, o, steps, kind = 'persuade') {
  let t = 0, i = 0;
  return {
    update(dt) {
      t += dt;
      while (i < steps.length && t >= steps[i][0]) G.ui.notify(fmt(steps[i++][1], o.noun), kind, 5);
      if (i >= steps.length) return false;
    },
  };
}

function petition(G, o) {
  let n = Math.round(rand(900, 1600));
  const sig = () => (n = Math.round(n * rand(3, 5))).toLocaleString('en-US');
  const line = (k) => T.petition[k].replace('{n}', k ? sig() : n.toLocaleString('en-US'));
  return { text: line(0), ...chain(G, o, [[8, line(1)], [16, line(2)]]) };
}

function ultimatum(G, o) {
  const c = chain(G, o, [[15, T.ultimatum[0]], [30, T.ultimatum[1]]], 'warn');
  let t = 0;
  return { update(dt) { t += dt; if (t >= 30 && t - dt < 30) G.audio.sad(); return c.update(dt); } };
}

// How much the nose points at the target: 1 dead ahead, -1 straight behind.
function facing(G, tg) { return _v.subVectors(tg, G.player.pos).normalize().dot(G.player.forward); }

const HEAT = [ // [min facing, label, colour], hottest first
  [0.95, '🔥 ON FIRE!!!', '#ff3a2a'], [0.75, '♨️ Hot', '#ff7a2a'], [0.35, '🌤️ Warmer', '#e0a000'],
  [-0.2, '🌥️ Colder', '#4a9ad8'], [-2, '❄️ FREEZING', '#2a6ad8'],
];

function hotCold(G, o) {
  const el = hudLine('');
  let t = 35, last = null, tintCd = 0;
  return {
    update(dt) {
      const tg = o.target();
      t -= dt; tintCd -= dt;
      if (!tg || t <= 0) return false;
      const h = HEAT.find((x) => facing(G, tg) >= x[0]) ?? HEAT[4]; // NaN facing (on the target): no match
      if (h === last) return;
      if (last && tintCd <= 0 && (h === HEAT[0] || h === HEAT[4])) { G.ui.tint(h[2], 1.5); tintCd = 4; } // a warm or icy flush at the extremes
      last = h;
      el.textContent = 'Hot & cold: ' + h[1];
      el.style.color = h[2];
    },
    dispose() { el.remove(); },
  };
}

// Confetti and applause whenever the player turns to face the target. Not before.
function cheerSquad(G, o) {
  let t = 40, away = true, cd = 0;
  return {
    update(dt) {
      const tg = o.target(), p = G.player;
      t -= dt; cd -= dt;
      if (!tg || t <= 0) return false;
      if (p.dead) return;
      const f = facing(G, tg);
      if (f < 0.5) away = true;
      else if (f > 0.9 && away && cd <= 0) {
        away = false; cd = 3;
        G.fx.confetti(_w.copy(p.pos).addScaledVector(p.forward, 45));
        G.audio.cheer();
        G.ui.notify(pick(['The crowd goes WILD!', 'YES! THAT WAY! *applause*', 'Standing ovation for your heading!', 'The cheer squad is losing its voice. Worth it.']), 'good', 2, 0);
      }
    },
  };
}

// Points from just ahead of the player to the target, kept above ground and under any cave roof.
function route(G, o, n, ahead) {
  const p = G.player;
  const pts = pathPoints(G, p.pos.clone().addScaledVector(p.forward, ahead), o.target().clone(), n);
  for (const pt of pts) pt.y = underRoof(G, pt.x, pt.z, pt.y, 10);
  return pts;
}

function redCarpet(G, o) {
  const pts = route(G, o, 18, 60);
  pts.push(o.target().clone());
  const box = new THREE.BoxGeometry(1, 1, 1), post = new THREE.CylinderGeometry(0.35, 0.45, 6, 6), knob = new THREE.SphereGeometry(0.9, 8, 6), flame = new THREE.ConeGeometry(1.2, 3.5, 7);
  const red = new THREE.MeshLambertMaterial({ color: '#c8102e' }), gold = new THREE.MeshLambertMaterial({ color: '#ffcc33', emissive: '#6a4a00' });
  const fire = new THREE.MeshBasicMaterial({ color: '#ffa020', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const group = new THREE.Group(), segs = [], flames = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
    const seg = new THREE.Group();
    seg.position.lerpVectors(a, b, 0.5);
    seg.lookAt(b);
    const rug = new THREE.Mesh(box, red);
    rug.scale.set(9, 0.4, len + 0.5);
    const trim = new THREE.Mesh(box, gold);
    trim.scale.set(10.5, 0.3, len + 0.5);
    trim.position.y = -0.15;
    seg.add(rug, trim);
    for (const x of [-6, 6]) { // stanchions, and a little torch on every other one
      const s = new THREE.Mesh(post, gold);
      s.position.set(x, 3, -len / 2);
      const k = new THREE.Mesh(knob, gold);
      k.position.y = 3.3;
      s.add(k);
      if (i % 2 === 0) { const f = new THREE.Mesh(flame, fire); f.position.y = 5.5; s.add(f); flames.push(f); }
      seg.add(s);
    }
    seg.visible = false;
    group.add(seg);
    segs.push(seg);
  }
  G.scene.add(group);
  let t = 0;
  return {
    update(dt) {
      t += dt;
      segs.forEach((s, i) => { s.visible = t * 9 > i; }); // rolls out over two seconds
      for (const f of flames) f.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    },
    dispose() { G.scene.remove(group); for (const x of [box, post, knob, flame, red, gold, fire]) x.dispose(); },
  };
}

// +100 if the objective is done within 60 s. Paid out when the objective completes (not by the trophy).
function limitedOffer(G, o, P) {
  const BONUS = 100;
  const el = hudLine('#ff4dc4'), done0 = G.objectives.completed;
  let left = 60, shown = -1;
  return {
    update(dt) {
      left -= dt;
      if (left <= 0) { G.ui.notify(fmt('Offer expired. {Noun} is still available at full price.', o.noun), 'info', 4); return false; }
      const s = Math.ceil(left);
      if (s !== shown) { shown = s; el.textContent = `⏰ LIMITED OFFER: +${BONUS} · 0:${String(s).padStart(2, '0')}`; }
    },
    dispose() {
      el.remove();
      // Objectives.complete() counts the win, then resets persuasion while the objective is still current.
      if (left > 0 && G.objectives.current === o && G.objectives.completed > done0 && P.stage < TROPHY_STAGE) {
        G.score += BONUS;
        G.ui.notify(`Limited-time offer redeemed! +${BONUS} bonus points. What a bargain.`, 'good', 4);
      }
    },
  };
}

// Pixels of `text` drawn small on a canvas, as [x, y] cells centred on 0.
function textCells(text, W = 96, H = 20) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  let fs = H - 2;
  c.font = `700 ${fs}px Fredoka, 'Trebuchet MS', sans-serif`;
  const w = c.measureText(text).width;
  if (w > W - 4) { fs = Math.floor((fs * (W - 4)) / w); c.font = `700 ${fs}px Fredoka, 'Trebuchet MS', sans-serif`; }
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, W / 2, H / 2 + 1);
  const d = c.getImageData(0, 0, W, H).data, cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 120) cells.push([x - W / 2, H / 2 - y]);
  return cells;
}

// Cloud-puff letters in front of the player, saying which way to turn (as seen when it was written).
function skywriting(G, o) {
  const p = G.player, tg = o.target();
  const f = flatForward(G);
  _v.subVectors(tg, p.pos).setY(0).normalize();
  const side = _v.dot(_w.crossVectors(f, Y)); // > 0: target is to the right
  const text = _v.dot(f) > 0.8 ? 'STRAIGHT ON!' : _v.dot(f) < -0.6 ? 'U-TURN!!' : side > 0 ? 'TURN RIGHT →' : '← TURN LEFT';
  const cells = textCells(text);
  const CELL = 3.2;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#9a9aa8', transparent: true, opacity: 0.95, flatShading: true });
  const puffs = new THREE.InstancedMesh(geo, mat, cells.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  cells.forEach(([x, y], i) => {
    sc.setScalar(CELL * rand(0.75, 1.15));
    m.compose(_w.set(x * CELL + rand(-0.6, 0.6), y * CELL + rand(-0.6, 0.6), rand(-1.5, 1.5)), q, sc);
    puffs.setMatrixAt(i, m);
  });
  const pos = p.pos.clone().addScaledVector(f, 330);
  _w.crossVectors(f, Y);
  let ground = -Infinity; // the highest ground under the whole ~300 m line of letters
  for (let k = -2; k <= 2; k++) ground = Math.max(ground, groundAt(G, pos.x + _w.x * k * 80, pos.z + _w.z * k * 80));
  pos.y = underRoof(G, pos.x, pos.z, Math.max(p.pos.y + 45, ground + 70), 40);
  puffs.position.copy(pos);
  puffs.lookAt(p.pos.x, pos.y, p.pos.z); // readable from where the player is now
  G.scene.add(puffs);
  let t = 0;
  const LIFE = 30;
  return {
    update(dt) {
      t += dt;
      if (t >= LIFE) return false;
      puffs.scale.setScalar(1 + t * 0.008);  // the letters slowly spread out...
      mat.opacity = 0.95 * Math.min(1, (LIFE - t) / 6); // ...and blow away
    },
    dispose() { G.scene.remove(puffs); puffs.dispose(); geo.dispose(); mat.dispose(); },
  };
}

// The camera swings over to look at the target for a moment, then back. Flying stays in the player's hands.
function cinematic(G, o) {
  const DUR = 2.6, peek = { at: new THREE.Vector3(), w: 0 };
  G.camPeek = peek;
  let t = 0;
  return {
    update(dt) {
      const tg = o.target();
      t += dt;
      if (!tg || G.player.dead || t >= DUR || G.camPeek !== peek) return false;
      peek.at.copy(tg);
      peek.at.y -= curveDrop(tg.x, tg.z, G.camera.position); // on a tiny planet, look where it's drawn
      const k = Math.min(1, t / 0.6, (DUR - t) / 0.6);
      peek.w = k * k * (3 - 2 * k);
    },
    dispose() { if (G.camPeek === peek) G.camPeek = null; },
  };
}

// A V of paper planes that flies to the target, slowing down to wait when the player falls behind.
function escort(G, o) {
  const p = G.player;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 3, -2.2, 0.4, -2, 0, -0.7, -1.6, 0, 0, 3, 0, -0.7, -1.6, 2.2, 0.4, -2], 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#404040', side: THREE.DoubleSide, flatShading: true });
  const SLOTS = [[0, 0], [-9, -9], [9, -9], [-18, -18], [18, -18]]; // [side, back] in metres
  const planes = SLOTS.map(() => { const m = new THREE.Mesh(geo, mat); m.scale.setScalar(2.2); G.scene.add(m); return m; });
  const lead = p.pos.clone().addScaledVector(p.forward, 70).addScaledVector(Y, 8);
  const dir = p.forward.clone();
  const goal = new THREE.Vector3(), right = new THREE.Vector3();
  let t = 0, ang = 0;
  return {
    update(dt) {
      const tg = o.target();
      t += dt;
      if (!tg || t > 30) return false;
      const near = lead.distanceTo(tg) < 90;
      if (near) { ang += dt * 0.7; goal.set(tg.x + Math.cos(ang) * 70, tg.y + 25, tg.z + Math.sin(ang) * 70); } // there: circle it
      else goal.copy(tg);
      const gap = lead.distanceTo(p.pos);
      const speed = gap > 240 ? 10 : Math.max(45, p.speed * (gap < 100 ? 1.15 : 0.9));
      dir.lerp(_v.subVectors(goal, lead).normalize(), 1 - Math.exp(-dt * 1.5)).normalize();
      lead.addScaledVector(dir, speed * dt);
      lead.y = underRoof(G, lead.x, lead.z, Math.max(lead.y, groundAt(G, lead.x, lead.z) + 25), 15);
      right.crossVectors(dir, Y);
      if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
      right.normalize();
      planes.forEach((m, i) => {
        const [s, b] = SLOTS[i];
        m.position.copy(lead).addScaledVector(right, s).addScaledVector(dir, b).addScaledVector(Y, Math.sin(t * 2 + i) * 1.5);
        m.lookAt(_w.copy(m.position).add(dir));
      });
    },
    dispose() { for (const m of planes) G.scene.remove(m); geo.dispose(); mat.dispose(); },
  };
}

function coinTrail(G, o) {
  const pts = route(G, o, 16, 70);
  const geo = new THREE.CylinderGeometry(3.2, 3.2, 0.7, 16);
  geo.rotateX(Math.PI / 2); // face the player, spin around Y
  const mat = new THREE.MeshLambertMaterial({ color: '#ffcc33', emissive: '#8a5a00' });
  const coins = pts.map((pt) => { const m = new THREE.Mesh(geo, mat); m.position.copy(pt); G.scene.add(m); return m; });
  return {
    update(dt) {
      for (const m of coins) {
        if (!m.visible) continue;
        m.rotation.y += dt * 3;
        if (m.position.distanceTo(G.player.pos) < 15) {
          m.visible = false;
          G.score += 10;
          G.audio.ding(1.8);
          G.fx.sparkle(m.position, '#ffcc33');
        }
      }
    },
    dispose() { for (const m of coins) G.scene.remove(m); geo.dispose(); mat.dispose(); },
  };
}
