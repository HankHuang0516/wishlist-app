#!/usr/bin/env node
/* Prints the JavaScript to evaluate in a signed-in tab on the site: the read-only
 * observer (instrument.js) followed by the frame runner (in-frame-runner.js).
 *
 *   node scripts/page-load/build-in-frame-payload.cjs            readable
 *   node scripts/page-load/build-in-frame-payload.cjs --minify   smaller, for pasting through a tool
 */
const fs = require('fs');
const path = require('path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
let instrument = read('instrument.js'), runner = read('in-frame-runner.js');
if (process.argv.includes('--minify')) {
  const candidates = ['esbuild', path.join(__dirname, '../../client/node_modules/esbuild')];
  let esbuild = null;
  for (const candidate of candidates) { try { esbuild = require(candidate); break; } catch { /* Try the next location. */ } }
  if (!esbuild) { console.error('esbuild was not found; run without --minify.'); process.exit(1); }
  const shrink = code => esbuild.transformSync(code, { minify: true, target: 'es2020' }).code.trim();
  instrument = shrink(instrument); runner = shrink(runner);
}
process.stdout.write('window.__plbInstrumentSource=' + JSON.stringify(instrument) + ';\n' + runner + '\n');
