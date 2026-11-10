const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* The built index.html carries the first-screen boot script (src/firstScreen/boot.ts) with the list of files each
 * route needs. This reads that list back out of the page that will actually be served: a name in it that is not on
 * disk would make every first visit ask for a file that does not exist, so the build fails here instead. */
exports.verifyFirstScreen = dist => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.equal(html.includes('FIRST_SCREEN_BOOT'), false, 'The placeholder for the boot script must not reach the built page.');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].filter(match => match[1].includes('/*plan:*/'));
  assert.equal(scripts.length, 1, 'The built page must carry the first-screen boot script exactly once.');
  // It only helps while nothing else has been asked for yet.
  for (const later of ['<link rel="stylesheet"', '<script type="module"']) {
    assert.ok(html.indexOf(later) > scripts[0].index, `The boot script must come before the page's ${later}.`);
  }
  // The server writes its hints in place of this marker (server/src/lib/firstScreenHints.ts); the boot script reads
  // them, so they must come before it.
  const hints = '<!-- FIRST_SCREEN_HINTS -->';
  assert.equal(html.split(hints).length, 2, 'The built page must keep the marker for the server\'s hints exactly once.');
  assert.ok(html.indexOf(hints) < scripts[0].index, 'The server\'s hints must come before the boot script.');
  const text = scripts[0][1], from = text.indexOf('/*plan:*/') + '/*plan:*/'.length, to = text.indexOf('/*:plan*/');
  assert.ok(to > from, 'The boot script must carry its plan.');
  const plan = JSON.parse(text.slice(from, to));
  assert.ok(Array.isArray(plan.a) && plan.a.length && Array.isArray(plan.r) && plan.r.length && Array.isArray(plan.x), 'The plan is incomplete.');
  const listed = index => Number.isInteger(index) && index >= 0 && index < plan.a.length;
  for (const name of plan.a) {
    assert.ok(/^[A-Za-z0-9._-]+\.(?:js|css)$/.test(name) && fs.existsSync(path.join(dist, 'assets', name)), `The boot script names assets/${name}, which the build did not produce.`);
    // What the page already asks for by itself must not be asked for twice.
    assert.equal(html.split(`/assets/${name}"`).length, 1, `assets/${name} is already loaded by the page itself.`);
  }
  for (const [template, files, extras] of plan.r) {
    assert.ok(typeof template === 'string' && Array.isArray(files) && files.every(listed), `The files of the route "${template}" are not in the list.`);
    assert.ok(extras === -1 || Number.isInteger(extras) && extras >= 0 && extras < plan.x.length, `The extras of the route "${template}" are missing.`);
  }
  for (const extra of plan.x) {
    assert.ok((extra.l ?? []).every(listed), 'The legacy files are not in the list.');
    for (const image of extra.i ?? []) assert.ok(/^\/[A-Za-z0-9._/-]+$/.test(image) && fs.existsSync(path.join(dist, image)), `The boot script names the image ${image}, which the build did not produce.`);
  }
  return { routes: plan.r.length, files: plan.a.length, bytes: Buffer.byteLength(scripts[0][0]) };
};
