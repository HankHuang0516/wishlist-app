#!/usr/bin/env node
// Supervised simulator launch only. Screenshot UI must be separately reviewed;
// a running process alone is not evidence of working authenticated features.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const udid = process.env.SIM_MANAGER_UDID;
if (!process.env.SIM_MANAGER_TOKEN || !/^[a-fA-F0-9-]{36}$/.test(udid ?? '')) throw new Error('A real simulator-manager iOS lease is required');
const build = process.argv[3] ?? 'ios-simulator';
if (!['ios-simulator', 'ios-simulator-signed'].includes(build) && !(build.length === 27 && /^ios-simulator-\d{8}-\d{4}$/.test(build))) throw new Error('Only this project\'s reviewed simulator builds are permitted');
const app = path.resolve(__dirname, '../build/' + build + '/Build/Products/Release-iphonesimulator/Wishlistai.app');
const pkg = 'com.hankhuang.weesh';
const screenshot = process.argv[2];
if (!fs.existsSync(app)) throw new Error('Build the release simulator app before acquiring a simulator');
const actualPackage = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', path.join(app, 'Info.plist')], { encoding: 'utf8' }).trim();
if (actualPackage !== pkg) throw new Error('The built app does not have the original bundle identity');
if (!screenshot || !path.isAbsolute(screenshot) || path.extname(screenshot) !== '.png' || !fs.existsSync(path.dirname(screenshot))) throw new Error('An existing absolute screenshot output directory is required');
if (fs.existsSync(screenshot)) throw new Error('Preserve previous screenshots; choose a new reviewed output path');
const simctl = args => execFileSync('/usr/bin/xcrun', ['simctl', ...args], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  simctl(['install', udid, app]);
  const result = simctl(['launch', '--terminate-running-process', udid, pkg]);
  const pid = Number(result.match(/: (\d+)\s*$/)?.[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Simulator did not return a valid application PID');
  await wait(10_000);
  const alive = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' }).trim();
  if (!alive.endsWith('/Wishlistai')) throw new Error('The launched native process did not survive observation');
  simctl(['io', udid, 'screenshot', screenshot]);
  console.log(JSON.stringify({ scope: 'release-simulator-process-launch-only-ui-needs-review', udid, package: pkg, tenSecondProcessStability: true, appExecutableSha256: createHash('sha256').update(fs.readFileSync(path.join(app, 'Wishlistai'))).digest('hex'), screenshot, authenticatedFlowsVerified: false }));
})().catch(error => { console.error(error instanceof Error ? error.message : 'iOS release smoke failed'); process.exitCode = 1; });
