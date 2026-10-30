// Renders the title-screen cover (assets/cover.webp) from the real game: the actual plane, terrain, props and sky.
// It loads a built copy of the game, seeds Math.random so the world is repeatable, poses the plane and a camera,
// renders one frame and saves the canvas as a PNG.
//
//   npm run build && (cd dist && python3 -m http.server 8765 &)
//   node docs/art/render-cover.cjs cover@2x.png            # the shipped shot, 3840x2160
//   node docs/art/render-cover.cjs try.png '{"seed": 3}'    # any option below can be overridden
//
// Then downscale to 1920x1080 and save as assets/cover.webp. Terrain or prop changes can move things around, so
// re-check the framing (the title card covers the middle third) when re-rendering.
const { chromium } = require('playwright');
const [out = 'cover@2x.png', json] = process.argv.slice(2);
const o = Object.assign({
  url: 'http://localhost:8765/', seed: 11, zone: 0, sky: 'morning', fog: 1.4, azimuth: 2.2,
  x: 0, z: 0, alt: 110, yaw: Math.PI / 2,          // where the plane is, and which way the camera frame faces
  planeYaw: -0.6, pitch: 0.06, bank: -0.55,         // the plane's attitude, relative to that frame
  cam: [-4, 7, 30], look: [78, -24, -100], fov: 45, // camera offset and aim point, in that frame
  w: 1920, h: 1080, scale: 2,
}, JSON.parse(json || '{}'));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.scale });
  p.on('pageerror', (e) => console.error('pageerror', e.message));
  await p.addInitScript((seed) => {
    let s = seed >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, o.seed);
  await p.goto(o.url);
  await p.waitForFunction(() => window.G && G.terrain);
  await p.waitForTimeout(500);
  const info = await p.evaluate(async (o) => {
    window.requestAnimationFrame = () => 0; G.started = true; G.paused = true; // the loop keeps rendering, but no title orbit and no simulation
    await new Promise((r) => setTimeout(r, 100));
    for (const id of ['title', 'ui']) document.getElementById(id).style.display = 'none';
    const THREE_V = G.camera.position.constructor, THREE_Q = G.camera.quaternion.constructor;
    if (o.zone) G.zones.enter(o.zone, { instant: true });
    if (o.sky) G.sky.setPreset(o.sky, true);
    if (o.azimuth != null) G.sky.azimuth = o.azimuth;
    const pl = G.player;
    pl.spawn(o.x, o.z, o.yaw);
    const g = Math.max(G.terrain.surfaceHeight(o.x, o.z), 0);
    for (let i = 0; i < 400; i++) G.terrain.update(pl.pos, 20);
    const gh = G.terrain.surfaceHeight(o.x, o.z);
    pl.pos.y = Math.max(gh, G.world?.seaLevel ?? 0) + o.alt;
    const q = new THREE_Q(), e = pl.quat.clone();
    const ax = (x, y, z) => new THREE_V(x, y, z);
    q.setFromAxisAngle(ax(0, 1, 0), o.yaw + (o.planeYaw || 0));
    q.multiply(new THREE_Q().setFromAxisAngle(ax(1, 0, 0), o.pitch));
    q.multiply(new THREE_Q().setFromAxisAngle(ax(0, 0, 1), o.bank));
    pl.quat.copy(q); pl.updateAxes();
    const m = pl.model;
    m.group.position.copy(pl.pos); m.group.quaternion.copy(pl.quat); m.prop.rotation.z = 0.6;
    if (o.planeScale) m.group.scale.setScalar(o.planeScale);
    // camera in a yaw-only frame around the plane, so the horizon stays level
    const yq = new THREE_Q().setFromAxisAngle(ax(0, 1, 0), o.yaw);
    const cam = G.camera;
    cam.fov = o.fov; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    cam.position.copy(pl.pos).add(ax(...o.cam).applyQuaternion(yq));
    cam.up.set(0, 1, 0);
    cam.lookAt(pl.pos.clone().add(ax(...o.look).applyQuaternion(yq)));
    if (o.roll) cam.rotateZ(o.roll);
    for (let i = 0; i < 300; i++) G.sky.update(1 / 30);
    G.sky.fogScale = o.fog ?? G.sky.fogScale;
    for (let i = 0; i < 300; i++) G.sky.update(1 / 30);
    for (let i = 0; i < 100; i++) G.terrain.update(pl.pos, 20);
    cam.position.copy(pl.pos).add(ax(...o.cam).applyQuaternion(yq));
    cam.lookAt(pl.pos.clone().add(ax(...o.look).applyQuaternion(yq)));
    if (o.roll) cam.rotateZ(o.roll);
    G.renderer.setSize(innerWidth, innerHeight);
    G.renderer.render(G.scene, cam);
    window.__png = G.renderer.domElement.toDataURL('image/png');
    const sp = m.group.getWorldPosition(new THREE_V()).project(cam);
    return { ground: gh, pos: pl.pos.toArray(), cam: cam.position.toArray(), model: m.group.getWorldPosition(new THREE_V()).toArray(), sp: [sp.x, sp.y], parent: m.group.parent?.type, sc: m.group.scale.toArray() };
  }, o);
  console.log(JSON.stringify(info));
  const url = await p.evaluate(() => window.__png);
  require('fs').writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  await b.close();
})();
