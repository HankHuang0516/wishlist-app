// Complete local visual QA from four verified empty AI scenes and an original
// photo cutout. No account, listing or production service is mutated.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { composeMarketingImage } from './marketing-compose.mjs';

const base = resolve('mobile/build/marketing-image-smoke-20260926');
const cutout = await readFile(`${base}/orange-lamp-cutout.png`);
const sources = ['orange-lamp-scene-1.jpg', 'orange-lamp-scene-2.jpg', 'orange-lamp-scene-3.png', 'orange-lamp-scene-4.jpg'];
const images = [];
for (const [index, source] of sources.entries()) {
  const background = await readFile(`${base}/${source}`);
  const bytes = await composeMarketingImage(background, cutout, { groundY: [930, 980, 930, 980][index] });
  const path = `${base}/orange-lamp-art-v2-${index + 1}.jpg`;
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  images.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
if (new Set(images.map(item => item.sha256)).size !== 4) throw new Error('MARKETING_IMAGES_NOT_DISTINCT');
console.log(JSON.stringify({ passed: true, images }));
