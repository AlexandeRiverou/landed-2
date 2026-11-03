// Electron desktop build of Landed (for Steam). The web build is untouched: this script takes the
// finished dist/ from `npm run build` and wraps it in the Electron shell in electron/.
//
//   node scripts/desktop.mjs build   copy dist/ -> electron/app/, then electron-builder -> export/desktop/
//   node scripts/desktop.mjs start   copy dist/ -> electron/app/, then run it unpackaged (windowed)
//   node scripts/desktop.mjs smoke [executable]
//                                    boot the packaged app with LANDED_SMOKE=1 (xvfb-run on headless Linux)
//
// The root npm scripts (desktop:build, desktop:start) run `npm run build` first. Electron and
// electron-builder live in electron/package.json so the root `npm ci` never downloads them:
// install them with `npm run desktop:install` (npm ci --prefix electron).
//
// Version: RELEASE_VERSION when it is a semver (a leading "v" is dropped), else package.json's.
import { cp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const electronDir = join(root, 'electron');
const dist = join(root, 'dist');
const stageDir = join(electronDir, 'app');
const outDir = join(root, 'export', 'desktop');
const [command, ...rest] = process.argv.slice(2);

const exists = (p) => access(p).then(() => true, () => false);
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

async function desktopVersion() {
  const m = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(process.env.RELEASE_VERSION || '');
  if (m) return m[1];
  return JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
}

async function requireElectronDeps() {
  if (!(await exists(join(electronDir, 'node_modules', 'electron-builder')))) {
    throw new Error('Electron dependencies are missing. Run `npm run desktop:install` (npm ci --prefix electron) first.');
  }
}

// Copy the finished web build into the Electron app, minus the remote Google Fonts links: the
// desktop build is fully offline and its CSP allows no remote origins (the CSS has a font fallback).
async function stage() {
  if (!(await exists(join(dist, 'index.html')))) throw new Error('dist/ is missing; run `npm run build` first.');
  await rm(stageDir, { recursive: true, force: true });
  await cp(dist, stageDir, { recursive: true });
  const indexPath = join(stageDir, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const offline = html.replace(/^[ \t]*<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>[ \t]*\r?\n?/gim, '');
  await writeFile(indexPath, offline);
  await rm(join(stageDir, 'README.txt'), { force: true }); // its "serve this folder" advice is for the web zip
  const remote = offline.match(/\b(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi);
  if (remote) console.warn(`warning: index.html still references remote URLs (blocked in the desktop app): ${remote.join(', ')}`);
  console.log(`Staged dist/ -> electron/app/`);
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(signal ? 1 : code));
  });
}

async function build() {
  await requireElectronDeps();
  await stage();
  const version = await desktopVersion();
  const platformFlag = { linux: '--linux', win32: '--win', darwin: '--mac' }[process.platform];
  if (!platformFlag) throw new Error(`unsupported platform ${process.platform}`);
  const cli = join(electronDir, 'node_modules', 'electron-builder', 'cli.js');
  console.log(`Building Landed desktop ${version} (${process.platform}) -> export/desktop/`);
  const code = await run(process.execPath, [
    cli, platformFlag, '--publish', 'never',
    '--projectDir', electronDir, '--config', 'electron-builder.json',
    `-c.extraMetadata.version=${version}`,
  ], { cwd: electronDir, env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
  if (code !== 0) throw new Error(`electron-builder failed (exit ${code})`);
}

function packagedExecutable() {
  switch (process.platform) {
    case 'linux': return join(outDir, 'linux-unpacked', 'landed');
    case 'win32': return join(outDir, 'win-unpacked', 'Landed.exe');
    case 'darwin': return join(outDir, 'mac-universal', 'Landed.app', 'Contents', 'MacOS', 'Landed');
    default: throw new Error(`unsupported platform ${process.platform}`);
  }
}

// Chromium refuses to run as root with its sandbox on (e.g. in a container). Real players never
// run as root; this only keeps local/containers runs possible, and says so.
function sandboxArgs() {
  if (!isRoot) return [];
  console.warn('warning: running as root, so Chromium needs --no-sandbox (the OS-level sandbox is off for this run only).');
  return ['--no-sandbox'];
}

async function smoke() {
  const exe = rest[0] ? resolve(rest[0]) : packagedExecutable();
  if (!(await exists(exe))) throw new Error(`${exe} not found; run \`npm run desktop:build\` first.`);
  let cmd = exe;
  let args = sandboxArgs();
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    if (spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' }).error) throw new Error('no display and no xvfb-run; install xvfb.');
    args = ['-a', '--server-args=-screen 0 1280x720x24', exe, ...args];
    cmd = 'xvfb-run';
  }
  console.log(`Smoke test: ${[cmd, ...args].join(' ')}`);
  const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, LANDED_SMOKE: '1' } });
  // main.js gives up after 60 s on its own; this is the backstop if the app hangs harder than that.
  const killer = setTimeout(() => { console.error('Smoke test: no exit after 120 s, killing.'); child.kill('SIGKILL'); }, 120_000);
  const code = await new Promise((resolve) => child.on('exit', (c, s) => resolve(s ? 1 : c)));
  clearTimeout(killer);
  if (code !== 0) throw new Error(`desktop smoke test failed (exit ${code})`);
  console.log('Desktop smoke test passed.');
}

async function start() {
  await requireElectronDeps();
  await stage();
  const electronPath = createRequire(join(electronDir, 'package.json'))('electron'); // downloads Electron on first use
  process.exitCode = await run(electronPath, [electronDir, '--windowed', ...sandboxArgs(), ...rest]);
}

const commands = { build, start, smoke };
if (!commands[command]) {
  console.error('usage: node scripts/desktop.mjs build | start | smoke [executable]');
  process.exit(2);
}
try {
  await commands[command]();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
