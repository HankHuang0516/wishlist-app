// Preserve the seller's actual photographed product pixels and use an AI-made
// empty scene only behind it. Publication remains seller-controlled in the API.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

// Installed LaunchAgents cannot rely on macOS background access to ~/Desktop.
// Use the private runtime's pinned dependency when installed, and the server's
// existing dependency during repository tests.
const dependencyRoot = process.env.WISHLIST_MARKETING_DEPENDENCY_ROOT;
const require = createRequire(dependencyRoot
  ? pathToFileURL(resolve(dependencyRoot, 'package.json'))
  : new URL('../../server/package.json', import.meta.url));
const sharp = require('sharp');

export async function composeMarketingImage(backgroundBytes, cutoutBytes, { badge = 'AI 行銷示意', outputSize = 1024,
  groundY = 980 } = {}) {
  const scene = await sharp(backgroundBytes).resize(outputSize, outputSize, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();
  const subjectHeight = Math.round(outputSize * 0.77);
  const subject = await sharp(cutoutBytes).trim().resize({ height: subjectHeight }).png().toBuffer();
  const info = await sharp(subject).metadata();
  if (!info.hasAlpha || !info.width || info.width > outputSize * 0.85) throw new Error('SUBJECT_CUTOUT_INVALID');
  if (!Number.isFinite(groundY) || groundY < subjectHeight || groundY > outputSize) throw new Error('SUBJECT_PLACEMENT_INVALID');
  const left = Math.round((outputSize - info.width) / 2), top = Math.round(groundY - subjectHeight);
  const shadow = Buffer.from(`<svg width="${outputSize}" height="${outputSize}"><ellipse cx="${outputSize / 2}" cy="${groundY - 7}" rx="${Math.round(info.width * 0.34)}" ry="13" fill="#30231b" opacity="0.20"/></svg>`);
  const escaped = badge.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const label = Buffer.from(`<svg width="${outputSize}" height="${outputSize}"><rect x="24" y="24" width="180" height="43" rx="21" fill="#111827" opacity="0.82"/><text x="43" y="53" fill="white" font-family="PingFang TC, sans-serif" font-size="20" font-weight="600">${escaped}</text></svg>`);
  return sharp(scene).composite([{ input: shadow, top: 0, left: 0 }, { input: subject, top, left }, { input: label, top: 0, left: 0 }])
    .jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

// Flat objects and busy photos may not yield a safe foreground mask. Preserve
// the complete seller photo in an inset rather than inventing a cutout.
export async function composeFramedMarketingImage(backgroundBytes, originalBytes, { outputSize = 1024 } = {}) {
  const scene = await sharp(backgroundBytes).resize(outputSize, outputSize, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();
  const photo = await sharp(originalBytes).rotate().resize(760, 760, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 94 }).toBuffer();
  const info = await sharp(photo).metadata();
  if (!info.width || !info.height || info.width > 760 || info.height > 760) throw new Error('SOURCE_PHOTO_INVALID');
  const border = 18, width = info.width + border * 2, height = info.height + border * 2;
  const frame = await sharp({ create: { width, height, channels: 4, background: '#fffdf7' } })
    .composite([{ input: photo, top: border, left: border }]).png().toBuffer();
  const left = Math.round((outputSize - width) / 2), top = Math.round((outputSize - height) / 2) + 30;
  if (left < 0 || top < 0 || top + height > outputSize) throw new Error('PHOTO_FRAME_INVALID');
  const label = Buffer.from(`<svg width="${outputSize}" height="${outputSize}"><rect x="24" y="24" width="180" height="43" rx="21" fill="#111827" opacity="0.82"/><text x="43" y="53" fill="white" font-family="PingFang TC, sans-serif" font-size="20" font-weight="600">AI 行銷示意</text></svg>`);
  return sharp(scene).composite([{ input: frame, top, left }, { input: label, top: 0, left: 0 }])
    .jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  if (process.argv.length !== 5) throw new Error('usage: node marketing-compose.mjs background-image cutout-png output-jpg');
  const [background, cutout, output] = process.argv.slice(2);
  const image = await composeMarketingImage(resolve(background), resolve(cutout));
  await writeFile(resolve(output), image, { flag: 'wx', mode: 0o600 });
  console.log(`COMPOSITE_OK bytes=${image.length}`);
}
