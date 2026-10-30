// Builds a self-contained, offline-ready copy of the game into dist/.
// The dev page loads three.js from a CDN through an import map; the release vendors the
// exact same three.js files and points the import map at them instead.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const threeRoot = join(root, 'node_modules', 'three'); // three doesn't export package.json, so resolve by path
const threeVersion = JSON.parse(await readFile(join(threeRoot, 'package.json'), 'utf8')).version;

const CDN = `https://cdn.jsdelivr.net/npm/three@${threeVersion}/`;
const html = await readFile(join(root, 'index.html'), 'utf8');
if (!html.includes(CDN)) {
  throw new Error(`index.html does not load three@${threeVersion} from ${CDN}; keep package.json and the import map in sync.`);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'src'), join(dist, 'src'), { recursive: true });
await cp(join(root, 'style.css'), join(dist, 'style.css'));
await cp(join(root, 'assets'), join(dist, 'assets'), { recursive: true });

// Only the three.js files the game imports (plus their own relative imports).
const vendor = join(dist, 'vendor', 'three');
for (const file of ['build/three.module.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'LICENSE']) {
  await mkdir(dirname(join(vendor, file)), { recursive: true });
  await cp(join(threeRoot, file), join(vendor, file));
}
await writeFile(join(dist, 'index.html'), html.replaceAll(CDN, './vendor/three/'));

let commit = process.env.GITHUB_SHA || '';
try { commit ||= execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); } catch { /* not a git checkout */ }
const version = process.env.RELEASE_VERSION || (commit ? commit.slice(0, 7) : 'dev');
await writeFile(join(dist, 'VERSION.json'), JSON.stringify({ version, commit, three: threeVersion, builtAt: new Date().toISOString() }, null, 2) + '\n');
await writeFile(join(dist, 'README.txt'), [
  `Landed ${version}`,
  '',
  'Browsers block ES modules on file://, so serve this folder with any static server, e.g.',
  '  python3 -m http.server 8000',
  '  npx serve .',
  'then open http://localhost:8000',
  '',
].join('\n'));

console.log(`Built dist/ (version ${version}, three ${threeVersion})`);
