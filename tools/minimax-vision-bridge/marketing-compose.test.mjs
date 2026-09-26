import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { composeFramedMarketingImage } from './marketing-compose.mjs';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const sharp = require('sharp');
const source = new URL('../../mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

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
