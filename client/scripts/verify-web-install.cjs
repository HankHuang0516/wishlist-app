const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1].toLowerCase(), match[3]]));
}
function localAsset(dist, url) {
  assert.match(url, /^\/[\w/-]+\.[\w]+$/, 'Installation assets must be public same-origin files without queries.');
  assert.ok(!url.startsWith('/api/') && !url.startsWith('/uploads/'), 'Installation assets must be public same-origin build files, not account data.');
  return path.join(dist, url.slice(1));
}
function pngDimensions(filename) {
  const bytes = fs.readFileSync(filename);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Installation image must be PNG bytes, not HTML or a missing-file fallback.');
  assert.equal(bytes.readUInt32BE(8), 13);
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
function verifyWebInstall(dist) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
  const manifestLinks = links.filter(link => link.rel === 'manifest');
  assert.equal(manifestLinks.length, 1, 'The built page must advertise exactly one manifest.');
  const manifest = JSON.parse(fs.readFileSync(localAsset(dist, manifestLinks[0].href), 'utf8'));
  assert.equal(manifest.name, 'Wishlist.ai');
  assert.equal(manifest.start_url, '/', 'Installation must launch the existing Home route.');
  assert.equal(manifest.display, 'standalone');
  assert.notEqual(manifest.prefer_related_applications, true, 'Web installation must not redirect to an unrelated native release.');
  const icons = [];
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(candidate => candidate.sizes === `${size}x${size}` && candidate.type === 'image/png');
    assert.ok(icon, `A real ${size}px PNG install icon is required.`);
    const dimensions = pngDimensions(localAsset(dist, icon.src));
    assert.deepEqual(dimensions, [size, size], `The ${size}px declaration must match the image's physical dimensions.`);
    icons.push({ url: icon.src, dimensions });
  }
  const apple = links.filter(link => link.rel === 'apple-touch-icon');
  assert.equal(apple.length, 1, 'Safari needs an explicit public Home Screen icon.');
  assert.equal(apple[0].sizes, '180x180');
  assert.deepEqual(pngDimensions(localAsset(dist, apple[0].href)), [180, 180]);
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const theme = meta.find(value => value.name === 'theme-color');
  assert.equal(manifest.theme_color, theme?.content, 'Browser and installed-window theme colors must agree.');
  return { icons, appleTouchIcon: apple[0].href, themeColor: theme.content, startUrl: manifest.start_url };
}
module.exports = { verifyWebInstall };
if (require.main === module) {
  const result = verifyWebInstall(path.join(__dirname, '../dist'));
  console.log('Built Web installation manifest, actual PNG sizes, Safari icon and theme verified.', JSON.stringify(result));
}
