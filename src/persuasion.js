// The persuasion engine. Tracks how hard the player is ignoring the objective ("neglect")
// and escalates through increasingly desperate tactics: nagging, arrows, beams, bigger
// hoops, hoops that come to you, rainbow roads... and finally a participation trophy.
import * as THREE from 'three';
import { makeArrow3D, makeSign, makeTextSprite, makeRing, makeBird, disposeTree } from './models.js';
import { pick, rand, fmt, T, weightedPick } from './texts.js';
import { crossRing, flatForward, groundAt } from './objectives.js';

const _v = new THREE.Vector3();

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
    texts: ['Arrow added to your screen. Follow it. It\'s pointy for a reason.', 'The arrow is now BIGGER and PINKER. Like, way bigger.', 'Screen arrow deployed. It has one job.'],
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
    id: 'birds', tier: 2, need: 'target',
    can: () => true,
    apply: (G, o) => birds(G, o),
    texts: ['A flock of helpful birds is flying to {noun}. Birds know things.', 'Follow the birds. They\'ve done this before.'],
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
    can: (o, P) => P.G.enemies.list.some((e) => !e.quest) && o.type !== 'hunt' && o.type !== 'boss',
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
    id: 'flatten', tier: 3,
    can: (o, P) => !P.flattened && P.G.world.amp > 0.5,
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
      if (this.awayTime > 0.5) rate = 1.5;
      if (d < this.bestDist - 25) { this.bestDist = d; rate = 0.15; }
      if (this.awayTime > 5 && this.time - this.lastWrongWay > 14) {
        this.lastWrongWay = this.time;
        G.ui.notify(fmt(pick(T.wrongWay), obj.noun), 'warn', 4);
        G.audio.nag();
      }
      if (d < 220 && !this.closeShown && this.stage >= 1) {
        this.closeShown = true;
        G.ui.notify(fmt(pick(T.close), obj.noun), 'good', 3, 0);
      }
    }
    if (obj.progressed) { obj.progressed = false; rate = 0; this.neglect = Math.max(0, this.neglect - 4); }
    this.neglect += dt * rate;
    if (this.neglect >= 11 + this.stage * 8) this.escalate();
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
    if (this.stage >= 13) {
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

function birds(G, o) {
  const flock = [];
  for (let k = 0; k < 7; k++) { const b = makeBird(); b.scale.setScalar(2); G.scene.add(b); flock.push({ b, off: new THREE.Vector3(rand(-15, 15), rand(-6, 6), rand(-15, 15)) }); }
  let t = 99, center = new THREE.Vector3();
  return {
    update(dt) {
      const tg = o.target();
      if (!tg) return;
      t += dt;
      const p = G.player;
      if (t > 9 || center.distanceTo(tg) < 30) { t = 0; center.copy(p.pos).addScaledVector(p.forward, 40).add(new THREE.Vector3(0, 12, 0)); }
      _v.subVectors(tg, center).normalize();
      center.addScaledVector(_v, 60 * dt);
      for (const f of flock) {
        f.b.position.copy(center).add(f.off);
        f.b.lookAt(_v.clone().add(f.b.position));
        const w = Math.sin(G.time * 14 + f.off.x) * 0.7;
        f.b.userData.wings[0].rotation.z = -w; f.b.userData.wings[1].rotation.z = w;
      }
    },
    dispose() { for (const f of flock) { G.scene.remove(f.b); disposeTree(f.b); } },
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
