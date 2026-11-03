// Landed desktop shell (Electron main process). Steam ships these packaged folders.
//
// The game is the web build (root `npm run build` -> dist/), copied into ./app at desktop build time.
// Browsers block ES modules and import maps on file://, so the game is served from a privileged
// custom scheme instead: app://landed/index.html. Nothing is loaded from the network: every
// non-app:// request is cancelled, and a strict CSP is sent with every response.
//
// Environment / command line:
//   --windowed         start in a 1280x720 window instead of fullscreen (Steam launch option friendly)
//   LANDED_SMOKE=1     boot test: load the game, wait for window.G, exit 0 (or 1 on error/timeout)
//   LANDED_STEAM_OVERLAY=1  force the GPU switches the Steam overlay needs (see steamOverlaySwitches)
'use strict';

const { app, BrowserWindow, Menu, ipcMain, protocol, session } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SCHEME = 'app';
const HOST = 'landed';
const ORIGIN = `${SCHEME}://${HOST}`;
const START_URL = `${ORIGIN}/index.html`;
const GAME_ROOT = path.join(__dirname, 'app'); // inside app.asar when packaged; fs is asar-aware
const BACKGROUND = '#8ec5f0'; // html/body background in style.css, so there's no white flash
const SMOKE = process.env.LANDED_SMOKE === '1';
const SMOKE_TIMEOUT_MS = 60_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

// Must run before `ready`: makes app:// behave like https (standard origin, secure context, fetch,
// module scripts, V8 code cache).
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
]);

// --- Steam ---------------------------------------------------------------------------------------
// The Steam overlay injects into the GPU process; Chromium's out-of-process GPU and (on Windows)
// DirectComposition stop it from drawing. These switches are what steamworks.js documents for
// Electron. They cost a little stability/perf, so they are only applied when Steam launched us
// (Steam sets SteamGameId / SteamAppId) or when forced with LANDED_STEAM_OVERLAY=1.
function steamOverlaySwitches() {
  const underSteam = Boolean(process.env.SteamGameId || process.env.SteamAppId);
  if (!underSteam && process.env.LANDED_STEAM_OVERLAY !== '1') return;
  app.commandLine.appendSwitch('in-process-gpu');
  if (process.platform === 'win32') app.commandLine.appendSwitch('disable-direct-composition');
}
steamOverlaySwitches();

// STEAMWORKS HOOK (not wired up yet). When the game gets a Steam app id:
//   1. `npm install steamworks.js@<exact>` in electron/ (native module: keep it out of app.asar with
//      `asarUnpack`, and set `npmRebuild` accordingly in electron-builder.json).
//   2. In app.whenReady() below: `const steam = require('steamworks.js'); const client = steam.init(APP_ID);`
//      and `steam.electronEnableSteamOverlay()` (it applies the switches above itself).
//   3. Expose narrow, fixed IPC channels (e.g. 'landed:achievement' with a string id validated
//      against a known list) and add matching functions to preload.js. Never expose `client` itself.
//   4. steam_appid.txt is for local testing only; see the notes in electron/steam/app_build.vdf.

// Headless boot test: software WebGL, since CI machines have no GPU.
if (SMOKE) {
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}

// --- Content Security Policy ---------------------------------------------------------------------
// The import map is an inline <script>; it is allowed by hash (computed from the shipped
// index.html at startup, so it follows any change to the map). No remote origins at all: the
// desktop build is fully offline (the Google Fonts link is stripped at build time; the game has a
// font fallback). Inline styles stay allowed because the UI sets style attributes from JS.
async function buildCsp() {
  const html = await fs.readFile(path.join(GAME_ROOT, 'index.html'), 'utf8');
  const hashes = [];
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hashes.push(`'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// --- app:// file server --------------------------------------------------------------------------
// Serves files strictly from GAME_ROOT. Anything else (other host, traversal, directories,
// missing files, non-GET) is a plain 404/405.
function makeHandler(csp) {
  const headers = (type) => ({
    'content-type': type,
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'cross-origin-opener-policy': 'same-origin',
  });
  const notFound = () => new Response('Not found', { status: 404, headers: headers('text/plain; charset=utf-8') });

  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: headers('text/plain; charset=utf-8') });
    }
    let rel;
    try {
      const url = new URL(request.url);
      if (url.host !== HOST) return notFound();
      rel = decodeURIComponent(url.pathname);
    } catch {
      return notFound(); // malformed URL or percent-encoding
    }
    if (rel.includes('\0')) return notFound();
    if (rel.endsWith('/')) rel += 'index.html';

    const file = path.resolve(GAME_ROOT, '.' + rel); // rel starts with '/'
    const inside = path.relative(GAME_ROOT, file);
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return notFound();

    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) return notFound();
      const body = request.method === 'HEAD' ? null : await fs.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(body, { status: 200, headers: headers(type) });
    } catch {
      return notFound();
    }
  };
}

const isAppUrl = (url) => typeof url === 'string' && (url === ORIGIN || url.startsWith(ORIGIN + '/'));

// --- Hardening for every webContents -------------------------------------------------------------
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
  contents.on('will-redirect', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

function hardenSession(ses) {
  // Fullscreen is the only permission the game can use; everything else is refused.
  const allowed = new Set(['fullscreen']);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allowed.has(permission) && isAppUrl(details.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => allowed.has(permission) && requestingOrigin === ORIGIN);
  ses.setDevicePermissionHandler(() => false);

  // Offline only: cancel every request that isn't app://, data: or blob: (DevTools aside).
  ses.webRequest.onBeforeRequest((details, callback) => {
    let proto = '';
    try { proto = new URL(details.url).protocol; } catch { /* unparsable URL: cancel below */ }
    const ok = proto === `${SCHEME}:` || proto === 'data:' || proto === 'blob:' || proto === 'devtools:';
    if (!ok && SMOKE) console.log(`[smoke] blocked request: ${details.url}`);
    callback({ cancel: !ok });
  });
}

// --- Window --------------------------------------------------------------------------------------
let win = null;

function toggleFullscreen() {
  if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
}

function createWindow() {
  // Games start fullscreen; `--windowed` (e.g. a Steam launch option) and the boot test don't.
  const fullscreen = !SMOKE && !process.argv.includes('--windowed');
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    fullscreen,
    show: false,
    title: 'Landed',
    backgroundColor: BACKGROUND,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  // F11 everywhere, Alt+Enter on Windows/Linux, Ctrl+Cmd+F on macOS: toggle fullscreen.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mac = process.platform === 'darwin';
    if (input.key === 'F11' || (!mac && input.alt && input.key === 'Enter') || (mac && input.meta && input.control && input.key.toLowerCase() === 'f')) {
      event.preventDefault();
      toggleFullscreen();
    }
  });

  if (SMOKE) attachSmokeTest(win);
  win.loadURL(START_URL);
  return win;
}

// --- Bridge (see preload.js) ---------------------------------------------------------------------
// Fixed channels only, and only from our own top-level page.
function fromApp(event) {
  return win && event.sender === win.webContents && isAppUrl(event.senderFrame && event.senderFrame.url);
}
ipcMain.on('landed:quit', (event) => { if (fromApp(event)) app.quit(); });
ipcMain.on('landed:toggle-fullscreen', (event) => { if (fromApp(event)) toggleFullscreen(); });

// --- Boot test (LANDED_SMOKE=1) ------------------------------------------------------------------
function attachSmokeTest(w) {
  const errors = [];
  let finished = false;
  const finish = (code, message) => {
    if (finished) return;
    finished = true;
    console.log(`[smoke] ${code === 0 ? 'PASS' : 'FAIL'}: ${message}`);
    for (const e of errors) console.log(`[smoke]   ${e}`);
    app.exit(code);
  };
  const timer = setTimeout(() => finish(1, `window.G not ready after ${SMOKE_TIMEOUT_MS / 1000}s`), SMOKE_TIMEOUT_MS);

  const wc = w.webContents;
  wc.on('console-message', ({ level, message, lineNumber, sourceId }) => {
    if (level === 'error') errors.push(`console: ${message} (${sourceId}:${lineNumber})`);
  });
  wc.on('preload-error', (_e, p, error) => errors.push(`preload-error (${p}): ${error}`));
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => { if (isMainFrame) errors.push(`did-fail-load ${code} ${desc} ${url}`); });
  wc.on('render-process-gone', (_e, details) => finish(1, `renderer gone: ${details.reason}`));

  wc.on('did-finish-load', async () => {
    try {
      const probe = `(() => ({
        g: typeof window.G === 'object' && window.G !== null,
        chunks: window.G && window.G.terrain && window.G.terrain.chunks ? window.G.terrain.chunks.size : null,
        bridge: !!(window.landedDesktop && window.landedDesktop.isDesktop === true
          && typeof window.landedDesktop.quit === 'function' && typeof window.landedDesktop.toggleFullscreen === 'function'),
        platform: window.landedDesktop && window.landedDesktop.platform,
        webgl: !!document.createElement('canvas').getContext('webgl2'),
      }))()`;
      let state;
      for (;;) {
        state = await wc.executeJavaScript(probe);
        // Ready = the game state exists and, if the world has terrain chunks, some were built.
        if (state.g && (state.chunks === null || state.chunks > 0)) break;
        if (errors.length) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      await new Promise((r) => setTimeout(r, 1500)); // let late errors surface
      clearTimeout(timer);
      const summary = `window.G=${state.g} chunks=${state.chunks} bridge=${state.bridge} platform=${state.platform} webgl2=${state.webgl}`;
      if (errors.length) finish(1, `errors during boot (${summary})`);
      else if (!state.bridge) finish(1, `window.landedDesktop bridge missing (${summary})`);
      else finish(0, summary);
    } catch (err) {
      finish(1, `probe failed: ${err && err.message}`);
    }
  });
}

// --- Lifecycle -----------------------------------------------------------------------------------
// One copy of the game at a time (the boot test skips this so it can't silently exit 0).
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    // No menu bar on Windows/Linux. macOS keeps a minimal one so Cmd+Q / Cmd+H / fullscreen work.
    Menu.setApplicationMenu(process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { label: 'View', submenu: [{ role: 'togglefullscreen' }] }, { role: 'windowMenu' }])
      : null);

    hardenSession(session.defaultSession);
    protocol.handle(SCHEME, makeHandler(await buildCsp()));
    createWindow();
  }).catch((err) => {
    console.error(err);
    app.exit(1);
  });

  // It's a game: closing the window quits, on macOS too.
  app.on('window-all-closed', () => app.quit());
}
