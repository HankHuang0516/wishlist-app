const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

// Integrity binds the manual review to this version's actual published bytes.
// It cannot judge legibility or replace the required visual inspection.
function verifyWebIcons(client, dist) {
  const version = JSON.parse(fs.readFileSync(path.join(client, 'package.json'))).version;
  const inputs = path.join(client, 'icon-source');
  const recipe = JSON.parse(fs.readFileSync(path.join(inputs, 'recipe.json')));
  let review = JSON.parse(fs.readFileSync(path.join(inputs, 'reviews', version + '.json')));
  assert.equal(review.version, version);
  if (review.reusedFrom) {
    assert.match(review.reusedFrom, /^\d+\.\d+\.\d+$/);
    assert.equal(review.actualBuildInspected, false, 'Reuse is not a new visual inspection.');
    const prior = JSON.parse(fs.readFileSync(path.join(inputs, 'reviews', review.reusedFrom + '.json')));
    assert.equal(prior.status, 'passed');
    assert.equal(prior.actualBuildInspected, true);
    assert.deepEqual(review.inputHashes, prior.inputHashes);
    assert.deepEqual(review.outputHashes, prior.outputHashes);
    review = { ...prior, version };
  }
  assert.equal(review.version, version, 'This release requires its own icon review.');
  assert.equal(review.status, 'passed', 'Unfinished visual inspection blocks publication.');
  assert.equal(review.actualBuildInspected, true, 'Source previews cannot replace actual build inspection.');
  assert.equal(recipe.originalTransform, 'identity');
  for (const key of ['original', 'H']) {
    assert.equal(hash(path.join(inputs, recipe[key].path)), recipe[key].sha256, `The fixed ${key} input has changed.`);
    assert.equal(review.inputHashes[key], recipe[key].sha256);
  }
  assert.deepEqual(Object.keys(recipe.outputs).sort(), ['apple-touch-icon.png', 'logo.png', 'pwa-icon-192.png', 'pwa-icon-512.png']);
  for (const [name, expected] of Object.entries(recipe.outputs)) {
    assert.equal(hash(path.join(dist, name)), expected.sha256, `Published ${name} differs from the reviewed H composition.`);
    assert.equal(review.outputHashes[name], expected.sha256, `The ${name} review does not match this artifact.`);
  }
  return { version, status: review.status, assets: Object.keys(recipe.outputs) };
}
module.exports = { verifyWebIcons };
