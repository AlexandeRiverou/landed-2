// Prints the files map for publishing the test preview artifact (see CLAUDE.md, "Test preview").
// Run `npm run preview` first so dist/VERSION.json describes the build being previewed.
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const files = { 'style.css': 'style.css' };
for (const f of (await readdir('assets')).sort()) files[`assets/${f}`] = `assets/${f}`;
for (const f of (await readdir('src')).filter((f) => f.endsWith('.js')).sort()) files[`src/${f}`] = `src/${f}`;
if (existsSync('dist/VERSION.json')) files['VERSION.json'] = 'dist/VERSION.json';
console.log(JSON.stringify(files));
