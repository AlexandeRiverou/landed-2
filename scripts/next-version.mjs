// Prints the version the next release from main should get, e.g. "v1.0.3".
//
// - If HEAD already carries a v* tag (a re-run of a released commit), print that tag, so re-runs
//   never publish a second release for the same code.
// - Otherwise take the higher of: the latest v* tag with its patch number bumped, and the
//   "version" in package.json. Bumping package.json (e.g. to 1.1.0 or 2.0.0) in a PR is how
//   minor/major releases happen; every other merge is a patch release.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
const parse = (v) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? m.slice(1).map(Number) : null;
};
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const onHead = git("tag --points-at HEAD --list 'v*'").split('\n').filter((t) => parse(t));
if (onHead.length) {
  console.log(onHead.sort((a, b) => cmp(parse(b), parse(a)))[0]);
  process.exit(0);
}

const tags = git("tag --list 'v*'").split('\n').map(parse).filter(Boolean).sort(cmp);
const latest = tags.at(-1);
const bumped = latest ? [latest[0], latest[1], latest[2] + 1] : null;
const pkg = parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
if (!pkg) throw new Error('package.json "version" must look like 1.2.3');

const next = !bumped || cmp(pkg, bumped) > 0 ? pkg : bumped;
console.log(`v${next.join('.')}`);
