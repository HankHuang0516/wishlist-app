import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const { verifyWebIcons } = createRequire(import.meta.url)('../../scripts/verify-web-icons.cjs');
const sha = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
let client: string;
function review(change = {}) {
  const recipe = JSON.parse(fs.readFileSync(path.join(client, 'icon-source/recipe.json'), 'utf8'));
  fs.writeFileSync(path.join(client, 'icon-source/reviews/2.0.687.json'), JSON.stringify({
    version: '2.0.687', status: 'passed', actualBuildInspected: true,
    inputHashes: { original: recipe.original.sha256, H: recipe.H.sha256 },
    outputHashes: Object.fromEntries(Object.entries(recipe.outputs).map(([name, value]) => [name, (value as {sha256: string}).sha256])),
    ...change,
  }));
}
beforeEach(() => {
  client = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-icon-gate-'));
  fs.mkdirSync(path.join(client, 'icon-source/reviews'), { recursive: true });
  fs.mkdirSync(path.join(client, 'dist'));
  fs.writeFileSync(path.join(client, 'package.json'), JSON.stringify({ version: '2.0.687' }));
  fs.writeFileSync(path.join(client, 'icon-source/original.png'), 'true-original');
  fs.writeFileSync(path.join(client, 'icon-source/H.png'), 'fixed-H');
  const outputs = Object.fromEntries(['logo.png', 'pwa-icon-192.png', 'pwa-icon-512.png', 'apple-touch-icon.png'].map(name => {
    fs.writeFileSync(path.join(client, 'dist', name), name + '-with-H');
    return [name, { sha256: sha(name + '-with-H') }];
  }));
  fs.writeFileSync(path.join(client, 'icon-source/recipe.json'), JSON.stringify({ originalTransform: 'identity',
    original: { path: 'original.png', sha256: sha('true-original') }, H: { path: 'H.png', sha256: sha('fixed-H') }, outputs }));
  review();
});
afterEach(() => fs.rmSync(client, { recursive: true, force: true }));
describe('release icon review binding', () => {
  it('checks all four actual artifacts and fixed inputs', () => expect(verifyWebIcons(client, path.join(client, 'dist')).status).toBe('passed'));
  it('rejects an older release review', () => {
    fs.writeFileSync(path.join(client, 'package.json'), JSON.stringify({ version: '2.0.688' }));
    expect(() => verifyWebIcons(client, path.join(client, 'dist'))).toThrow();
  });
  it('rejects missing H bytes even at the original dimensions', () => {
    fs.writeFileSync(path.join(client, 'dist/logo.png'), 'true-original');
    expect(() => verifyWebIcons(client, path.join(client, 'dist'))).toThrow('differs from the reviewed');
  });
  it('rejects a preview-only or unfinished inspection', () => {
    review({ actualBuildInspected: false });
    expect(() => verifyWebIcons(client, path.join(client, 'dist'))).toThrow('Source previews');
    review({ status: 'pending' });
    expect(() => verifyWebIcons(client, path.join(client, 'dist'))).toThrow('Unfinished');
  });
  it('rejects changed inputs and stale artifact receipts', () => {
    review({ outputHashes: {} });
    expect(() => verifyWebIcons(client, path.join(client, 'dist'))).toThrow('does not match');
    review();
    fs.writeFileSync(path.join(client, 'icon-source/H.png'), 'changed-H');
    expect(() => verifyWebIcons(client, path.join(client, 'dist'))).toThrow('fixed H');
  });
});
