import { createRequire } from 'node:module';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
const { verifyWebInstall } = createRequire(import.meta.url)('../../scripts/verify-web-install.cjs') as { verifyWebInstall: (root: string) => unknown };
const folders: string[] = [];
const manifest = { name: 'Wishlist.ai', start_url: '/', display: 'standalone', theme_color: '#78716c', icons: [{ src: '/icon192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon512.png', sizes: '512x512', type: 'image/png' }] };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wishlist-install-build-')); folders.push(root);
  writeFileSync(join(root, 'index.html'), '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" sizes="180x180" href="/apple.png"><meta name="theme-color" content="#78716c">');
  writeFileSync(join(root, 'manifest.webmanifest'), JSON.stringify(manifest));
  // These unit fixtures inspect PNG signatures/IHDR metadata only; actual
  // decoding of the product icons is a separate browser acceptance check.
  for (const [name, size] of [['icon192.png', 192], ['icon512.png', 512], ['apple.png', 180]] as const) {
    const bytes = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes); bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(size, 16); bytes.writeUInt32BE(size, 20); writeFileSync(join(root, name), bytes);
  }
  return root;
}
afterEach(() => { for (const root of folders.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('published installation asset gate', () => {
  it('rejects the existing 1024px logo masquerading as a 192px installation icon', () => {
    const root = fixture(); copyFileSync(new NodeURL('../../public/logo.png', import.meta.url), join(root, 'icon192.png'));
    expect(() => verifyWebInstall(root)).toThrow('physical dimensions');
  });
  it('accepts matching public PNG metadata and unchanged Home launch behavior', () => { expect(verifyWebInstall(fixture())).toMatchObject({ appleTouchIcon: '/apple.png', startUrl: '/' }); });
  it('rejects an HTML fallback even when the filename ends in PNG', () => { const root = fixture(); writeFileSync(join(root, 'icon512.png'), '<!doctype html>'); expect(() => verifyWebInstall(root)).toThrow('PNG bytes'); });
  it('rejects a missing Safari Home Screen asset', () => { const root = fixture(); rmSync(join(root, 'apple.png')); expect(() => verifyWebInstall(root)).toThrow(); });
  it('rejects a Safari icon with mismatched physical dimensions', () => { const root = fixture(); copyFileSync(join(root, 'icon192.png'), join(root, 'apple.png')); expect(() => verifyWebInstall(root)).toThrow(); });
  it('rejects an account, external, queried or traversing install icon instead of silently using a fallback', () => {
    const root = fixture();
    mkdirSync(join(root, 'api')); copyFileSync(join(root, 'icon192.png'), join(root, 'api/avatar.png'));
    for (const src of ['https://external.invalid/icon.png', '/icon192.png?credential=synthetic', '/../private.png', '/api/avatar.png']) {
      writeFileSync(join(root, 'manifest.webmanifest'), JSON.stringify({ ...manifest, icons: [{ ...manifest.icons[0], src }, manifest.icons[1]] })); expect(() => verifyWebInstall(root)).toThrow('public same-origin');
    }
  });
  it('rejects a manifest that diverts Web installation to native store instead of keeping the existing Website', () => { const root = fixture(); writeFileSync(join(root, 'manifest.webmanifest'), JSON.stringify({ ...manifest, prefer_related_applications: true })); expect(() => verifyWebInstall(root)).toThrow('unrelated native release'); });
  it('rejects an installed-window theme inconsistent with the website', () => { const root = fixture(); writeFileSync(join(root, 'manifest.webmanifest'), JSON.stringify({ ...manifest, theme_color: '#ffffff' })); expect(() => verifyWebInstall(root)).toThrow('theme colors'); });
  it('requires one manifest instead of ambiguous competing installation identities', () => { const root = fixture(); const html = readFileSync(join(root, 'index.html'), 'utf8'); writeFileSync(join(root, 'index.html'), html + '<link rel="manifest" href="/second.webmanifest">'); expect(() => verifyWebInstall(root)).toThrow('exactly one'); });
});
