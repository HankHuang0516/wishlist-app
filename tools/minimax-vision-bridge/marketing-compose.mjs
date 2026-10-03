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

// A successful segmentation can still discard a cable, handle or accessory.
// Reject masks when a substantial source-photo edge remains outside them.
// This deliberately prefers the existing whole-photo layout over an uncertain
// cutout; absence of an edge is not proof that every photographed part survived.
export async function cutoutMayOmitPhotoDetails(originalBytes, cutoutBytes) {
  try {
    const original = sharp(originalBytes).rotate(), cutout = sharp(cutoutBytes).rotate();
    const sourceInfo = await original.metadata(), maskInfo = await cutout.metadata();
    if (!maskInfo.hasAlpha || sourceInfo.width !== maskInfo.width || sourceInfo.height !== maskInfo.height)
      return true;
    const { data: source, info } = await original.resize({ width: 512, height: 512, fit: 'inside' })
      .toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const mask = await cutout.resize(info.width, info.height, { kernel: 'nearest' }).ensureAlpha()
      .raw().toBuffer();
    const { width, height } = info, pixels = width * height;
    if (info.channels !== 3 || mask.length !== pixels * 4) return true;
    const foreground = new Uint8Array(pixels), edges = new Uint8Array(pixels);
    let included = 0;
    for (let p = 0; p < pixels; p++) {
      foreground[p] = mask[p * 4 + 3] >= 128 ? 1 : 0;
      included += foreground[p];
    }
    if (included < pixels * 0.01 || included > pixels * 0.95) return true;
    const nearForeground = (x, y, radius) => {
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && foreground[ny * width + nx]) return true;
      }
      return false;
    };
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      // Ignore the normal antialiased silhouette rather than rejecting every
      // valid mask merely because its outermost pixels have partial alpha.
      if (foreground[p] || nearForeground(x, y, 2)) continue;
      for (let dy = -1; dy <= 1 && !edges[p]; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = (y + dy) * width + x + dx;
        if ([0, 1, 2].some(c => Math.abs(source[p * 3 + c] - source[q * 3 + c]) >= 48)) {
          edges[p] = 1; break;
        }
      }
    }
    const queue = new Int32Array(pixels);
    for (let p = 0; p < pixels; p++) {
      if (!edges[p]) continue;
      let head = 0, tail = 1, near = false;
      queue[0] = p; edges[p] = 0;
      let minX = width, maxX = 0, minY = height, maxY = 0;
      while (head < tail) {
        const current = queue[head++], x = current % width, y = Math.floor(current / width);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        near ||= nearForeground(x, y, 4);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, next = ny * width + nx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && edges[next]) {
            edges[next] = 0; queue[tail++] = next;
          }
        }
      }
      const spanX = maxX - minX + 1, spanY = maxY - minY + 1;
      if (tail >= 16 && near && Math.max(spanX, spanY) >= 12 ||
          tail >= 64 && Math.max(spanX, spanY) >= 24 && Math.min(spanX, spanY) >= 6) return true;
    }
    return false;
  } catch {
    return true;
  }
}

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
