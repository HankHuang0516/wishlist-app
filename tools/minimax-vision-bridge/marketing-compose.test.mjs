import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { composeFramedMarketingImage, cutoutMayOmitPhotoDetails } from './marketing-compose.mjs';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const sharp = require('sharp');
const source = new URL('../../mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function photographedFixture({ cable = '#161616', includeCable = true, accessory = false } = {}) {
  const body = '<rect x="130" y="50" width="100" height="220" fill="#e68032"/>';
  const wire = `<path d="M130 245 H25" stroke="${cable}" stroke-width="6"/>`;
  const extra = accessory ? '<circle cx="55" cy="45" r="16" fill="#244d83"/>' : '';
  const original = await sharp(Buffer.from(`<svg width="320" height="320"><rect width="320" height="320" fill="#dddddd"/>${wire}${extra}${body}</svg>`)).png().toBuffer();
  const cutout = await sharp(Buffer.from(`<svg width="320" height="320">${includeCable ? wire : ''}${body}</svg>`)).png().toBuffer();
  return { original, cutout };
}

test('retains a complete isolated foreground with its photographed cable', async () => {
  const { original, cutout } = await photographedFixture();
  assert.equal(await cutoutMayOmitPhotoDetails(original, cutout), false);
});

test('rejects masks that lose attached dark or bright colored cables', async () => {
  for (const cable of ['#161616', '#fff200', '#258be0']) {
    const { original, cutout } = await photographedFixture({ cable, includeCable: false });
    assert.equal(await cutoutMayOmitPhotoDetails(original, cutout), true);
  }
});

test('rejects a missing disconnected photographed accessory', async () => {
  const { original, cutout } = await photographedFixture({ accessory: true });
  assert.equal(await cutoutMayOmitPhotoDetails(original, cutout), true);
});

test('uses the full photo when mask dimensions, alpha or decoding are invalid', async () => {
  const { original, cutout } = await photographedFixture();
  const smaller = await sharp(cutout).resize(160, 160).png().toBuffer();
  const opaque = await sharp(cutout).flatten({ background: '#dddddd' }).png().toBuffer();
  for (const mask of [smaller, opaque, Buffer.from('not-an-image')]) {
    assert.equal(await cutoutMayOmitPhotoDetails(original, mask), true);
  }
});

test('whole-photo recovery preserves all four corners and the omitted cable', async () => {
  const { original, cutout } = await photographedFixture({ includeCable: false });
  assert.equal(await cutoutMayOmitPhotoDetails(original, cutout), true);
  const background = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#c8e4ed' } }).jpeg().toBuffer();
  const art = await composeFramedMarketingImage(background, original);
  const photoLeft = 352, photoTop = 382;
  // The 320px original is not enlarged: every corner and cable region remains
  // in the final JPEG at its original relative position, within JPEG tolerance.
  for (const region of [{ left: 2, top: 2 }, { left: 302, top: 2 }, { left: 2, top: 302 },
    { left: 302, top: 302 }, { left: 40, top: 241 }]) {
    const expected = await sharp(original).extract({ ...region, width: 12, height: 12 }).removeAlpha().raw().toBuffer();
    const actual = await sharp(art).extract({ left: photoLeft + region.left, top: photoTop + region.top, width: 12, height: 12 }).raw().toBuffer();
    assert.equal(actual.length, expected.length);
    const meanError = actual.reduce((sum, value, i) => sum + Math.abs(value - expected[i]), 0) / actual.length;
    assert.ok(meanError < 8, `Photographed region changed: ${meanError}`);
  }
});

test('whole-photo fallback keeps a valid, distinct four-scene marketing set', async () => {
  const original = await readFile(source);
  const originalHash = hash(original);
  const outputs = [];
  for (const fill of ['#faf0dc', '#d2e6d6', '#36424b', '#d4e8fa']) {
    const background = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: fill } })
      .jpeg().toBuffer();
    const result = await composeFramedMarketingImage(background, original);
    const info = await sharp(result).metadata();
    assert.equal(info.width, 1024);
    assert.equal(info.height, 1024);
    assert.equal(info.format, 'jpeg');
    assert.ok(result.length > 20_000);
    outputs.push(hash(result));
  }
  assert.equal(new Set(outputs).size, 4);
  assert.equal(hash(await readFile(source)), originalHash);
});
