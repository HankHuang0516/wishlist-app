const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../../server/node_modules/sharp');
const { meanRgbDistance, fixtureDistance } = require('./native-qa-photo-fingerprint.cjs');

const fixture = name => fs.readFileSync(path.join(__dirname, '..', 'qa-fixtures', name));
test('the expected blue mug survives JPEG/WebP conversion but the orange lamp cannot pass as it', async () => {
  const blue = fixture('synthetic-used-blue-mug.png');
  const orange = fixture('synthetic-used-orange-desk-lamp.png');
  const encoded = async input => sharp(await sharp(input).jpeg({ quality: 85 }).toBuffer()).webp({ quality: 82 }).toBuffer();
  assert.ok(await fixtureDistance(sharp, await encoded(blue), blue) < 12);
  assert.ok(await fixtureDistance(sharp, await encoded(orange), orange) < 12);
  assert.ok(await fixtureDistance(sharp, await encoded(orange), blue) > 40);
  assert.ok(await fixtureDistance(sharp, await encoded(blue), orange) > 40);
});
test('malformed samples cannot be marked as an expected photo', () => {
  assert.throws(() => meanRgbDistance(Buffer.alloc(3), Buffer.alloc(3)), /Invalid QA photo sample/);
});
