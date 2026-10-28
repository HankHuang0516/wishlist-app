'use strict';
// Deterministic rendering of the existing Web SVG, not AI-generated artwork.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../..');
const inputs = path.join(root, 'mobile/icon-source');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const placement = { size: [80, 84], position: [148, 186], colorOrOpacityAdjustment: false };

(async () => {
  const svg = fs.readFileSync(path.join(inputs, 'web-gift.svg'));
  const H = fs.readFileSync(path.join(inputs, 'general-H.png'));
  assert.equal(hash(H), '29bb4c6f54024441b675d9f04233dc0283dcc3dff2b78fbb08cd61581d61b9fa', 'Use the selected original H.');
  const original = await sharp(svg).ensureAlpha().png().toBuffer();
  const layer = await sharp(H).resize(...placement.size, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const output = await sharp(original).composite([{ input: layer, left: placement.position[0], top: placement.position[1] }]).removeAlpha().png().toBuffer();
  const before = await sharp(original).raw().toBuffer();
  const after = await sharp(output).ensureAlpha().raw().toBuffer();
  const alpha = await sharp(layer).ensureAlpha().raw().toBuffer();
  let changedOutsideH = 0, HOverGift = 0, HOutsideCircle = 0, visibleHPixels = 0;
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const [left, top] = placement.position, [width, height] = placement.size;
    const inLayer = x >= left && x < left + width && y >= top && y < top + height;
    const hasH = inLayer && alpha[((y - top) * width + x - left) * 4 + 3] > 0;
    const p = (y * 1024 + x) * 4;
    const changed = before[p] !== after[p] || before[p + 1] !== after[p + 1] || before[p + 2] !== after[p + 2];
    if (changed && !hasH) changedOutsideH++;
    if (hasH) {
      if (changed) visibleHPixels++;
      if (Math.min(before[p], before[p + 1], before[p + 2]) < 250) HOverGift++;
      if ((x + 0.5 - 512) ** 2 + (y + 0.5 - 512) ** 2 > 512 ** 2) HOutsideCircle++;
    }
  }
  assert.equal(changedOutsideH, 0);
  assert.equal(HOverGift, 0, 'H must not cover the gift.');
  assert.equal(HOutsideCircle, 0, 'H must remain within the circular mask.');
  assert.ok(visibleHPixels > 0);
  const recipe = {
    source: 'client/src/layouts/Layout.tsx: Lucide Gift v0.562.0',
    original: { path: 'web-gift.svg', sha256: hash(svg) },
    renderedOriginal: { path: 'original-no-H.png', sha256: hash(original) },
    H: { path: 'general-H.png', sha256: hash(H) },
    canvas: [1024, 1024], background: '#FFFFFF', stroke: '#2D2D2D',
    originalTransform: 'identity', HPlacement: placement,
    output: { path: '../assets/app-icon.png', sha256: hash(output), alpha: false },
    changedOutsideH, HOverGift, HOutsideCircle, visibleHPixels,
    inspectionScope: 'Source master only. Native package, store and installed-icon checks are separate.'
  };
  if (process.argv.includes('--verify')) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(inputs, 'recipe.json'))), recipe);
    assert.equal(hash(fs.readFileSync(path.join(inputs, 'original-no-H.png'))), hash(original));
    assert.equal(hash(fs.readFileSync(path.join(root, 'mobile/assets/app-icon.png'))), hash(output));
  } else {
    fs.writeFileSync(path.join(inputs, 'original-no-H.png'), original);
    fs.writeFileSync(path.join(root, 'mobile/assets/app-icon.png'), output);
    fs.writeFileSync(path.join(inputs, 'recipe.json'), JSON.stringify(recipe, null, 2) + '\n');
  }
  console.log(JSON.stringify(recipe));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
