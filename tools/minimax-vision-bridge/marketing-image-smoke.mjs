// Explicit opt-in image-to-image smoke using a project-owned synthetic photo.
// This never reads seller media or a production database.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const fixture = resolve('mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png');
const output = resolve('mobile/build/marketing-image-smoke-20260926');
const backgroundOnly = process.argv.includes('--background');
const fourBackgrounds = process.argv.includes('--four-backgrounds');
const prompt = backgroundOnly ? [
  'Create only an empty square product-photography scene: a clean natural-wood tabletop and warm off-white wall.',
  'Use the reference image only for palette and lighting; REMOVE the lamp completely.',
  'No products, objects, accessories, people, logos, text or price tags anywhere in the frame.',
  'Keep the center and lower center clear so the real photographed product can be composited later.',
].join(' ') : [
  'Create a square marketing photograph of the exact orange used desk lamp shown in the reference image.',
  'Keep the shape, orange color, visible wear and every real part faithful to the source.',
  'Place the same lamp on a clean neutral tabletop with soft natural light and uncluttered background.',
  'Do not add a logo, accessory, new feature, misleading repair, price tag, text, people or extra product.',
  'The result is an illustrative marketing image, not a replacement for the real seller photo.',
].join(' ');

function json(stdout, stage) {
  try { return JSON.parse(stdout); } catch { throw new Error(`${stage}_BAD_RESPONSE`); }
}
function httpsUrl(value, stage) {
  if (typeof value !== 'string') throw new Error(`${stage}_MISSING_URL`);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${stage}_UNSAFE_URL`);
  return url;
}

const original = await readFile(fixture);
if (!original.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('FIXTURE_NOT_PNG');
const upload = json((await exec('mcode-tools', ['upload-temp-url', fixture], { timeout: 45_000, maxBuffer: 1_000_000 })).stdout, 'UPLOAD');
const temp = httpsUrl(upload.temp_url, 'UPLOAD');
const basename = backgroundOnly ? 'orange-lamp-empty-background' : 'orange-lamp-marketing-smoke';
const scenes = [
  'warm natural wood tabletop and cream wall, bright clean catalog lighting',
  'calm sage-green studio wall and pale oak tabletop, soft daylight from the left',
  'deep graphite studio wall and dark walnut tabletop, gentle premium rim lighting',
  'pale powder-blue wall and white tabletop, balanced soft light with generous clear space',
];
const requests = fourBackgrounds ? scenes.map((scene, i) => ({
  prompt: `Create an empty square product-photography background with ${scene}. Use the reference photo only as a color and lighting guide. Remove the lamp entirely. No products, silhouettes, accessories, people, logos, text, price tags or shadows from a missing object. Keep the center clear for compositing the real photographed product later.`,
  input_urls: [temp.href], aspect_ratio: '1:1', resolution: '1K', output_file: `orange-lamp-scene-${i + 1}`,
})) : [{ prompt, input_urls: [temp.href], aspect_ratio: '1:1', resolution: '1K', output_file: basename }];
const args = JSON.stringify({ requests });
const generated = json((await exec('mcode-tools', ['connector', 'call', 'connector__matrix__generate_image', '--args', args],
  { timeout: 360_000, maxBuffer: 2_000_000 })).stdout, 'GENERATE');
if (!Array.isArray(generated.success_items) || generated.success_items.length !== requests.length ||
    generated.success_items.some(item => !item?.node_id)) {
  throw new Error(`GENERATE_FAILED:${JSON.stringify({ code: generated.code, successes: generated.success_items?.length ?? 0,
    failures: generated.failed_items?.length ?? generated.failure_items?.length ?? 0 })}`);
}
await mkdir(output, { recursive: true });
const files = [];
for (const [index, item] of generated.success_items.entries()) {
  const asset = json((await exec('mcode-tools', ['get-asset-url', item.node_id], { timeout: 30_000, maxBuffer: 1_000_000 })).stdout, 'ASSET');
  const assetUrl = httpsUrl(asset.url ?? asset.asset_url ?? asset.download_url, 'ASSET');
  const response = await fetch(assetUrl, { redirect: 'error', signal: AbortSignal.timeout(45_000) });
  if (!response.ok || !response.body) throw new Error('ASSET_FETCH_FAILED');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10_000 || bytes.length > 12_000_000) throw new Error('ASSET_SIZE_INVALID');
  const png = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpeg = bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpeg && !webp) throw new Error('ASSET_FORMAT_INVALID');
  const name = fourBackgrounds ? `orange-lamp-scene-${index + 1}` : basename;
  const path = join(output, `${name}.${png ? 'png' : jpeg ? 'jpg' : 'webp'}`);
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  files.push({ file: path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
console.log(JSON.stringify({ passed: true, files, originalSha256: createHash('sha256').update(original).digest('hex') }));
