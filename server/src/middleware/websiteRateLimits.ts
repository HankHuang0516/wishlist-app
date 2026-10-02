import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';

const rootFiles = new Set(['index.html', 'web-version.json', 'sw.js', 'registerSW.js', 'manifest.webmanifest', 'pwa-cache-policy.js', 'analytics-frame.html', 'analytics-frame.js', 'robots.txt', 'vite.svg', 'logo.png', 'og-image.png']);
const assetExtension = /\.(?:js|css|png|jpe?g|webp|svg|gif|ico|woff2?|json)$/i;

// Only actual published build files qualify. Uploads, private media, API paths,
// missing files, traversal and non-read methods keep the original request budget.
// Missing/unreadable build directories fail closed; they do not disable limits.
export function publicBuildPaths(buildRoot: string): ReadonlySet<string> {
  const paths = new Set<string>();
  const visit = (directory: string, prefix: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(entry.name)) continue;
      const url = prefix + '/' + entry.name;
      if (entry.isDirectory() && (prefix !== '' || ['assets', 'icons', 'images', 'features'].includes(entry.name))) visit(path.join(directory, entry.name), url);
      else if (entry.isFile() && (prefix ? assetExtension.test(entry.name) : rootFiles.has(entry.name) || /^workbox-[a-zA-Z0-9_-]+\.js$/.test(entry.name))) paths.add(url);
    }
  };
  visit(buildRoot, '');
  if (paths.has('/index.html')) paths.add('/');
  return paths;
}

export function websiteRateLimits(buildRoot: string) {
  const assets = publicBuildPaths(buildRoot);
  const isBuildRead = (req: Request) => (req.method === 'GET' || req.method === 'HEAD') && assets.has(req.path);
  const create = (skip: (req: Request) => boolean) => rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '請求過於頻繁，請稍後再試。(Too many requests, please try again later.)', errorCode: 'RATE_LIMIT_EXCEEDED' },
    skip,
  });
  // Separate process-local stores, each retaining the original500/IP/15min.
  // Downloading a new shell cannot exhaust account/chat reads, and saturated
  // data requests cannot stop downloading the recovery/update interface.
  return [create(isBuildRead), create(req => !isBuildRead(req))];
}
