#!/usr/bin/env node
// Run only inside a supervised simulator-manager lease. No account is created,
// no login is attempted, and no production data is mutated by this smoke test.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const serial = process.env.SIM_MANAGER_SERIAL;
if (!process.env.SIM_MANAGER_TOKEN || !/^emulator-\d{4,5}$/.test(serial ?? '')) throw new Error('A real simulator-manager Android lease is required');
const pkg = 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1';
const { version: versionName, android: { versionCode } } = require('../app.config.js').expo;
const apk = path.resolve(__dirname, process.env.WISHLIST_QA_USE_PLAY_APK === '1'
  ? `../build/google-play-${versionName}-v${versionCode}/wishlist-play-v${versionCode}-universal.apk`
  : '../android/app/build/outputs/apk/release/app-release.apk');
const reuseInstalled = process.argv.includes('--reuse-installed');
const upgradeExisting = process.argv.includes('--upgrade-existing');
if (reuseInstalled && upgradeExisting) throw new Error('Choose reuse or upgrade, not both');
const screenshot = process.argv.slice(2).find(argument => !['--reuse-installed', '--upgrade-existing'].includes(argument));
if (!fs.existsSync(apk)) throw new Error('Build the release APK before acquiring a simulator');
if (screenshot && (!path.isAbsolute(screenshot) || path.extname(screenshot) !== '.png' || !fs.existsSync(path.dirname(screenshot)) || fs.existsSync(screenshot))) throw new Error('Screenshot must be a new file in an existing absolute output directory');
const adb = (args, timeout = 20_000) => execFileSync('/Users/hank/Library/Android/sdk/platform-tools/adb', ['-s', serial, ...args], { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deviceXml = '/sdcard/wishlist-qa-' + randomUUID() + '.xml';
const devicePhoto = deviceXml.replace('.xml', '.png');
(async () => {
  const model = adb(['shell', 'getprop', 'ro.product.model']).trim();
  const sdk = adb(['shell', 'getprop', 'ro.build.version.sdk']).trim();
  const pageSize = adb(['shell', 'getconf', 'PAGESIZE']).trim();
  const alreadyInstalled = adb(['shell', 'pm', 'list', 'packages', pkg]).split(/\r?\n/).includes('package:' + pkg);
  if (alreadyInstalled !== (reuseInstalled || upgradeExisting)) throw new Error(reuseInstalled || upgradeExisting ? 'Expected previously installed release package is missing' : 'The release package is already installed; refusing to overwrite existing app data');
  if (!reuseInstalled) adb(['install', ...(upgradeExisting ? ['-r'] : []), apk], 60_000);
  const installed = adb(['shell', 'dumpsys', 'package', pkg]);
  if (!installed.includes(`versionCode=${versionCode} `) || !installed.includes(`versionName=${versionName}`)) throw new Error('Installed build identity/version did not match');
  adb(['shell', 'am', 'force-stop', pkg]);
  const start = adb(['shell', 'am', 'start', '-W', '-n', pkg + '/.MainActivity'], 30_000);
  if (!/Status: ok/.test(start)) throw new Error('Android did not report a successful launch');
  let xml = '', rendered = false, loginRendered = false, authenticatedNavigationRendered = false, productNoticeAcknowledged = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    await wait(1000);
    adb(['shell', 'uiautomator', 'dump', deviceXml]);
    xml = adb(['shell', 'cat', deviceXml]);
    loginRendered = xml.includes('content-desc="手機號碼或 Email"') && xml.includes('content-desc="密碼"');
    authenticatedNavigationRendered = xml.includes('content-desc="首頁"') && xml.includes('content-desc="願望"');
    rendered = xml.includes('text="Wishlist.ai"') && (loginRendered || authenticatedNavigationRendered);
    if (rendered) break;
    if (!productNoticeAcknowledged && xml.includes('新的願望，附近的好物')) {
      const node = xml.match(/<node\b[^>]*(?:text|content-desc)="我了解，繼續使用"[^>]*>/)?.[0];
      const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (bounds) {
        const x = Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2);
        const y = Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2);
        adb(['shell', 'input', 'tap', String(x), String(y)]);
        productNoticeAcknowledged = true;
      } else {
        const size = adb(['shell', 'wm', 'size']).match(/(?:Physical|Override) size: (\d+)x(\d+)/);
        if (!size) throw new Error('Cannot scroll product notice without device dimensions');
        const width = Number(size[1]), height = Number(size[2]);
        adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * 0.82)), String(Math.floor(width / 2)), String(Math.floor(height * 0.24)), '360']);
      }
    }
  }
  if (!rendered) throw new Error('Neither the native login form nor authenticated navigation rendered; this is a runtime failure, not a passing build');
  if (xml.includes('無法恢復登入') || xml.includes('無法存取裝置的安全儲存空間')) throw new Error('The login form reported a secure-storage startup failure');
  const pid = adb(['shell', 'pidof', pkg]).trim();
  if (!/^\d+$/.test(pid)) throw new Error('Application process was not alive after rendering');
  await wait(10_000);
  if (adb(['shell', 'pidof', pkg]).trim() !== pid) throw new Error('Application process died or restarted during stability observation');
  const logs = adb(['logcat', '-d', '--pid=' + pid, '-v', 'brief']);
  if (/FATAL EXCEPTION|Fatal signal|ReactNativeJS.*(?:TypeError|ReferenceError|Invariant Violation)/i.test(logs)) throw new Error('A native or JavaScript fatal error occurred');
  if (screenshot) { adb(['shell', 'screencap', '-p', devicePhoto]); adb(['pull', devicePhoto, screenshot]); }
  console.log(JSON.stringify({ scope: 'release-native-cold-launch-only', serial, model, sdk: Number(sdk), pageSize: Number(pageSize), package: pkg, versionCode, versionName, apkSha256: createHash('sha256').update(fs.readFileSync(apk)).digest('hex'), productNoticeAcknowledged, nativeLoginRendered: loginRendered, authenticatedNavigationRendered, tenSecondStability: true, fatalErrors: false, launchTiming: start.match(/(?:TotalTime|WaitTime|ThisTime): \d+/g), screenshot: screenshot ?? null }));
})().catch(error => { console.error(error instanceof Error ? error.message : 'Release smoke failed'); process.exitCode = 1; }).finally(() => {
  // Only remove artifacts created by this test, not device data or other apps.
  try { adb(['shell', 'rm', '-f', deviceXml, devicePhoto]); } catch { /* The supervisor still releases the lease. */ }
});
