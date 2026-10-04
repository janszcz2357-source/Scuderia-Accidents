#!/usr/bin/env node
// Builds one self-contained HTML file (CSS, JS, logo and data inlined) that
// works when opened directly from a phone or file manager, without a server.
//
//   node scripts/build-standalone.mjs [out.html] [--sample]
//
// Uses data/simgrid.json if present; --sample embeds the labelled sample data.

import { readFile, writeFile, access } from 'node:fs/promises';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || 'speediots-standalone.html';
const useSample = args.includes('--sample');

const exists = (p) => access(p).then(() => true, () => false);
const read = (p) => readFile(p, 'utf8');

let html = await read('index.html');
const css = await read('style.css');
const js = await read('script.js');
const logo = 'data:image/svg+xml;base64,' + Buffer.from(await read('assets/logo-mark.svg')).toString('base64');

const dataFile = useSample ? 'data/simgrid.sample.json'
  : (await exists('data/simgrid.json')) ? 'data/simgrid.json' : null;
// Escape "<" so the JSON can't close the script tag.
const data = dataFile ? (await read(dataFile)).replace(/</g, '\\u003c') : 'null';

html = html
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="script.js"></script>', () => `<script>window.SIMGRID_DATA = ${data};</script>\n<script>\n${js}\n</script>`)
  .replaceAll('assets/logo-mark.svg', logo);

await writeFile(out, html);
console.log(`Wrote ${out}${dataFile ? ` with ${dataFile}` : ' (no data embedded)'}`);
