// Opt-in, read-only smoke for the installed macOS MiniMax worker code.
// Uses an owned synthetic photo; never creates a listing or calls Railway.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (process.argv.length !== 2) throw new Error('No runtime arguments accepted');

const sourcePath = fileURLToPath(new URL('./server.mjs', import.meta.url));
const installedPath = join(homedir(), 'Library/Application Support/WishlistMiniMax/server.mjs');
const fixturePath = fileURLToPath(new URL('../../mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png', import.meta.url));
const imageHost = 'raw.githubusercontent.com';
const imageUrl = 'https://raw.githubusercontent.com/HankHuang0516/wishlist-app/adf7157/mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const sourceHash = sha256(readFileSync(sourcePath));
assert.equal(sha256(readFileSync(installedPath)), sourceHash, 'Installed worker source is stale');
const { pinnedExternalFetch, recognizeExternalCandidateImage } = await import(pathToFileURL(installedPath).href);

const response = await pinnedExternalFetch(imageUrl, { imageHost });
assert.equal(response.headers.get('content-type'), 'image/png');
const chunks = [];
let length = 0;
for await (const chunk of response.body) {
  length += chunk.length;
  assert.ok(length <= 8 * 1024 * 1024, 'Synthetic image exceeded byte limit');
  chunks.push(chunk);
}
assert.equal(sha256(Buffer.concat(chunks)), sha256(readFileSync(fixturePath)), 'Remote image differs from owned fixture');

const draft = await recognizeExternalCandidateImage(imageUrl, imageHost);
assert.match(draft.name, /燈/);
assert.ok(draft.evidence.length >= 2);
assert.equal(draft.condition, null);
assert.equal(draft.estimatedPriceLowTwd, null);
assert.equal(draft.estimatedPriceHighTwd, null);
assert.equal(draft.priceBasis, null);
process.stdout.write(JSON.stringify({ kind: 'installed-worker-external-image-smoke', passed: true,
  installedSourceSha256: sourceHash, ownedFixtureSha256: sha256(readFileSync(fixturePath)),
  recognizedItem: 'synthetic-desk-lamp', evidenceCount: draft.evidence.length,
  inferredPrice: false, inferredCondition: false, createdListings: 0 }) + '\n');
