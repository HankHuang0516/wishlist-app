#!/usr/bin/env node
// Managed-emulator-only, non-store visual evidence against the real isolated
// HTTP backend. No credentials are written to logs, screenshots or reports.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { startNativeQa } = require('./native-qa.cjs');
const { seedUiuxHomeQa } = require('./seed-uiux-home-qa.cjs');
const { qaLabel, assignedSerial } = require('./android-qa-config.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

const runFile = promisify(execFile);
const mobile = path.resolve(__dirname, '..');
const label = qaLabel(process.argv[2]);
if (process.argv.length !== 3) throw new Error('One exact Android visual QA build label required');
const serial = assignedSerial(process.env);
const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (process.env.DATABASE_URL !== database) throw new Error('Isolated QA database mismatch');
const packageName = 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.visualqa' + label;
const build = path.join(mobile, 'build', 'android-visual-qa-' + label);
const apk = path.join(build, 'app.apk');
const evidence = path.join(mobile, 'build', 'android-visual-home-' + randomUUID());
const adbPath = '/Users/hank/Library/Android/sdk/platform-tools/adb';
const aaptPath = '/Users/hank/Library/Android/sdk/build-tools/36.0.0/aapt2';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = async (args, timeout = 20000) => (await runFile(adbPath, ['-s', serial, ...args],
  { timeout, maxBuffer: 4_000_000 })).stdout;
const adbBytes = async (args, timeout = 20000) => (await runFile(adbPath, ['-s', serial, ...args],
  { timeout, maxBuffer: 15_000_000, encoding: 'buffer' })).stdout;
const xmlPath = '/sdcard/wishlist-visual-home-' + label + '.xml';
const xmlEscape = value => value.replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
const nodes = xml => xml.match(/<node\b[^>]*>/g) || [];
const nodeWith = (xml, label) => nodes(xml).find(node =>
  ['text', 'content-desc'].some(key => node.includes(`${key}="${xmlEscape(label)}"`))) || null;
let qa, installed = false, reverseOwned = false, stage = 'preflight', fixture, cleanup;
const report = { kind: 'isolated-android-release-equivalent-home-visual-smoke', passed: false,
  label, package: packageName, evidenceDirectory: evidence, screenshots: [],
  fixtureVersion: 'uiux-home-multiple-blue-mug-v2', stage: null };
async function dump() {
  await adb(['shell', 'uiautomator', 'dump', xmlPath], 30000);
  return adb(['exec-out', 'cat', xmlPath]);
}
async function waitNode(label, timeout = 35000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const found = nodeWith(await dump(), label);
    if (found) return found;
    await sleep(850);
  }
  throw new Error('Expected accessible control not found');
}
async function waitInput(label, timeout = 35000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const field = nodes(await dump()).find(node => node.includes('class="android.widget.EditText"') &&
      node.includes(`content-desc="${xmlEscape(label)}"`));
    if (field) return field;
    await sleep(850);
  }
  throw new Error('Expected editable input not found');
}
async function waitText(label, timeout = 35000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if ((await dump()).includes(xmlEscape(label))) return;
    await sleep(850);
  }
  throw new Error('Expected visible text not found');
}
async function tap(node) {
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) throw new Error('Visible control bounds missing');
  const x = Math.floor((+bounds[1] + +bounds[3]) / 2), y = Math.floor((+bounds[2] + +bounds[4]) / 2);
  await adb(['shell', 'input', 'tap', String(x), String(y)]);
}
async function tapVisibleLoginButton() {
  report.loginButtonAttempts = [];
  for (let attempt = 0; attempt < 7; attempt++) {
    const activity = await adb(['shell', 'dumpsys', 'activity', 'activities']);
    if (!activity.match(/^\s*topResumedActivity=([^\n]+)/m)?.[1]?.includes(packageName + '/'))
      throw new Error('Isolated QA app left foreground before login submit');
    const screen = await dump();
    const button = nodes(screen).find(node =>
      (node.includes('content-desc="登入"') || node.includes('text="登入"')) && node.includes('clickable="true"'));
    const bounds = button?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    const visibleBottom = report.keyboardBeforeSubmit ? 290 : 600;
    report.loginButtonAttempts.push({ found: !!button, bounds: bounds ? bounds.slice(1).map(Number) : null,
      visibleBottom });
    if (bounds && Number(bounds[2]) >= 80 && Number(bounds[4]) <= visibleBottom) return tap(button);
    await adb(['shell', 'input', 'swipe', '160', '460', '160', '305', '320']);
    await sleep(500);
  }
  throw new Error('Visible login button unavailable');
}
async function screenshot(name) {
  if (!['pre-login-diagnostic', 'home-collapsed', 'home-expanded', 'home-scrolled'].includes(name)) throw new Error('Unsafe screenshot name');
  const target = path.join(evidence, name + '.png');
  const bytes = await adbBytes(['exec-out', 'screencap', '-p']);
  const sharp = require('../../server/node_modules/sharp');
  const info = await sharp(bytes).metadata();
  if (info.format !== 'png' || info.width !== 320 || info.height !== 640) throw new Error('Android review canvas differs from 320x640');
  await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
  report.screenshots.push({ name, path: target, sha256: sha(bytes), width: info.width, height: info.height });
}
async function preflight() {
  const metadata = JSON.parse(await fs.readFile(path.join(build, 'build.json'), 'utf8'));
  const apkBytes = await fs.readFile(apk);
  if (metadata.kind !== 'isolated-android-release-equivalent-visual-qa' || metadata.label !== label ||
      metadata.package !== packageName || metadata.apiOrigin !== 'http://127.0.0.1:18889' ||
      metadata.apkSha256 !== sha(apkBytes) || metadata.storeDeliverable !== false ||
      metadata.nonDebuggable !== true || metadata.staticJsBundle !== true)
    throw new Error('Visual QA APK provenance mismatch');
  for (const source of metadata.sourceFiles) {
    const current = sha(await fs.readFile(path.join(mobile, source)));
    if (current !== metadata.sourceHashes[source]) throw new Error('Visual QA build source changed');
  }
  const badging = (await runFile(aaptPath, ['dump', 'badging', apk], { maxBuffer: 2_000_000 })).stdout;
  if (!badging.includes(`package: name='${packageName}'`) || badging.includes('application-debuggable'))
    throw new Error('APK is not the isolated Release-equivalent identity');
  const screen = await adb(['shell', 'wm', 'size']);
  if (!screen.includes('320x640')) throw new Error('This pass requires the managed 320x640 Android device');
  const packages = await adb(['shell', 'pm', 'list', 'packages', '-u', packageName]);
  if (packages.split(/\r?\n/).includes('package:' + packageName)) throw new Error('Visual QA package already installed; refuse overwrite');
  report.apkSha256 = metadata.apkSha256;
}
async function main() {
  await preflight();
  await fs.mkdir(evidence, { mode: 0o700 });
  stage = 'isolated-service';
  qa = await startNativeQa(database, 300, { visualHomeFixture: true });
  fixture = await seedUiuxHomeQa(qa);
  report.matchScores = fixture.scores.map(item => item.score);
  stage = 'isolated-loopback-bridge';
  const endpoint = 'tcp:18889';
  const existing = await adb(['reverse', '--list']);
  if (existing.split(/\r?\n/).some(line => line.trim().split(/\s+/).includes(endpoint)))
    throw new Error('Visual QA loopback bridge already occupied');
  await adb(['reverse', endpoint, endpoint]);
  reverseOwned = true;
  stage = 'install';
  await adb(['install', apk], 90000);
  installed = true;
  await adb(['shell', 'am', 'start', '-n', packageName + '/com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.MainActivity']);
  stage = 'notice';
  const noticeEnd = Date.now() + 45000;
  while (Date.now() < noticeEnd) {
    const screen = await dump();
    const consent = nodeWith(screen, '我了解，繼續使用');
    if (consent) { await tap(consent); break; }
    if (nodeWith(screen, '手機號碼或 Email')) break;
    if (screen.includes('新的願望') || screen.includes('帳號與資料說明'))
      await adb(['shell', 'input', 'swipe', '160', '470', '160', '150', '350']);
    await sleep(850);
  }
  const foreground = await adb(['shell', 'dumpsys', 'activity', 'activities']);
  const resumed = foreground.match(/^\s*topResumedActivity=([^\n]+)/m)?.[1] ?? '';
  if (!resumed.includes(packageName + '/')) throw new Error('Isolated QA app left foreground before login');
  stage = 'login-identifier';
  await tap(await waitInput('手機號碼或 Email'));
  await adb(['shell', 'input', 'text', qa.actors.buyer.phoneNumber]);
  const identifierScreen = await dump();
  if (!identifierScreen.includes(`text="${xmlEscape(qa.actors.buyer.phoneNumber)}"`))
    throw new Error('Synthetic account identifier was not entered in its field');
  stage = 'login-password';
  await tap(await waitInput('密碼'));
  await adb(['shell', 'input', 'text', qa.actors.buyer.password]);
  const passwordNode = nodes(await dump()).find(node => node.includes('class="android.widget.EditText"') &&
    node.includes('content-desc="密碼"'));
  if (!passwordNode?.includes('focused="true"') || !passwordNode?.match(/\btext="[^"]+"/) ||
      passwordNode.includes('text="密碼"'))
    throw new Error('Synthetic password was not entered in its field');
  stage = 'login-submit';
  const inputMethod = await adb(['shell', 'dumpsys', 'input_method']);
  report.keyboardBeforeSubmit = /mInputShown=true/.test(inputMethod);
  if (report.keyboardBeforeSubmit) {
    await adb(['shell', 'input', 'keyevent', '4']);
    await sleep(450);
    const activity = await adb(['shell', 'dumpsys', 'activity', 'activities']);
    if (!activity.match(/^\s*topResumedActivity=([^\n]+)/m)?.[1]?.includes(packageName + '/'))
      throw new Error('Back from the actual password input left the QA app');
    report.keyboardDismissedForSubmit = true;
    report.keyboardBeforeSubmit = false;
  }
  await tapVisibleLoginButton();
  stage = 'home-collapsed';
  await waitNode('所有願望吻合的商品', 45000);
  await waitText('二手深藍色陶瓷馬克杯', 45000);
  await waitText('吻合 73 分');
  await waitText('查看全部 3 件');
  await sleep(1800); // Image download is separately inspected in the saved screenshot.
  await screenshot('home-collapsed');
  stage = 'home-expanded';
  await tap(await waitNode('深藍色陶瓷馬克杯共有3件吻合商品，查看全部'));
  await waitText('深藍陶瓷馬克杯（二手）');
  await waitText('深藍色陶瓷杯');
  await screenshot('home-expanded');
  stage = 'home-scrolled';
  await adb(['shell', 'input', 'swipe', '160', '480', '160', '210', '360']);
  await waitNode('在地圖交叉比對深藍色陶瓷馬克杯');
  await screenshot('home-scrolled');
  report.passed = true;
}
(async () => {
  try { await main(); }
  catch (error) {
    report.failureStage = stage; report.failure = error.message;
    if (installed && stage.startsWith('login')) {
      try {
        const screen = await dump();
        report.safeLoginDiagnostics = Object.fromEntries(
          ['我了解，繼續使用', '手機號碼或 Email', '密碼', '登入', '帳號與資料說明']
            .map(label => [label, !!nodeWith(screen, label)]));
        report.safeLoginDiagnostics.nodeCount = nodes(screen).length;
        const activity = await adb(['shell', 'dumpsys', 'activity', 'activities']);
        report.safeLoginDiagnostics.qaForeground = !!activity.match(/^\s*topResumedActivity=([^\n]+)/m)?.[1]?.includes(packageName + '/');
        if (stage === 'login-identifier' && report.safeLoginDiagnostics.qaForeground)
          await screenshot('pre-login-diagnostic');
      } catch { report.safeLoginDiagnostics = { unavailable: true }; }
    }
    if (installed && stage.startsWith('home')) {
      try {
        const screen = await dump();
        report.safeHomeDiagnostics = Object.fromEntries(
          ['所有願望吻合的商品', '二手深藍色陶瓷馬克杯', '查看全部 3 件',
            '手機號碼或 Email', '密碼', '登入', '請輸入帳號與密碼。', '目前無法完成，請稍後再試。']
            .map(label => [label, !!nodeWith(screen, label)]));
        const activity = await adb(['shell', 'dumpsys', 'activity', 'activities']);
        report.safeHomeDiagnostics.qaForeground = !!activity.match(/^\s*topResumedActivity=([^\n]+)/m)?.[1]
          ?.includes(packageName + '/');
      } catch { report.safeHomeDiagnostics = { unavailable: true }; }
    }
    if (installed && (stage === 'notice' || stage.startsWith('login'))) {
      try {
        const activity = await adb(['shell', 'dumpsys', 'activity', 'activities']);
        const resumed = activity.match(/^\s*topResumedActivity=([^\n]+)/m)?.[1] ?? '';
        report.safeActivityDiagnostics = {
          topPackage: resumed.match(/([a-zA-Z0-9_.]+)\//)?.[1] ?? 'unknown',
          qaProcessAlive: !!(await adb(['shell', 'pidof', packageName]).catch(() => '')).trim(),
        };
      } catch { report.safeActivityDiagnostics = { unavailable: true }; }
      try {
        const raw = await adb(['logcat', '-d', '-v', 'brief', '-t', '3000', 'AndroidRuntime:E', 'ReactNativeJS:E', '*:S'], 15000);
        const lines = raw.split(/\r?\n/);
        const processAt = lines.findIndex(line => line.includes('Process: ' + packageName + ','));
        if (processAt >= 0) {
          const after = lines.slice(processAt + 1, processAt + 12);
          const exception = after.find(line => /\b(?:java|android|com)\.[A-Za-z0-9_.$]+(?:Exception|Error)\b/.test(line));
          report.safeCrashDiagnostics = {
            ownProcessFatal: true,
            exceptionClass: exception?.match(/\b(?:java|android|com)\.[A-Za-z0-9_.$]+(?:Exception|Error)\b/)?.[0] ?? 'unknown',
            exceptionSummary: exception?.split('JavascriptException: ')[1]?.split(', stack:')[0]
              ?.replace(/https?:\/\/\S+/g, '<url>').replace(/[A-Za-z0-9_-]{28,}/g, '<identifier>').slice(0, 240) ?? null,
          };
        } else report.safeCrashDiagnostics = { ownProcessFatal: false };
      } catch { report.safeCrashDiagnostics = { unavailable: true }; }
    }
  }
  finally {
    report.stage = stage;
    try { await adb(['shell', 'rm', xmlPath]); } catch { /* Exact owned temporary UI dump only. */ }
    if (installed) {
      try {
        await adb(['shell', 'am', 'force-stop', packageName]);
        await adb(['uninstall', packageName], 30000);
        const packages = await adb(['shell', 'pm', 'list', 'packages', '-u', packageName]);
        report.packageRemoved = !packages.split(/\r?\n/).includes('package:' + packageName);
      } catch { report.packageRemoved = false; }
    }
    if (reverseOwned) {
      try { await adb(['reverse', '--remove', 'tcp:18889']); report.reverseRemoved = true; }
      catch { report.reverseRemoved = false; }
    }
    if (qa) {
      try { cleanup = await qa.stop(); report.cleanup = cleanup; }
      catch { report.cleanup = null; }
    }
    if (report.packageRemoved !== true || report.reverseRemoved !== true ||
        !cleanup || Object.values(cleanup).some(value => value !== 0)) report.passed = false;
    if (await fs.stat(evidence).catch(() => null))
      await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ kind: report.kind, passed: report.passed, stage: report.stage,
      failureStage: report.failureStage, failure: report.failure, evidenceDirectory: evidence,
      screenshotCount: report.screenshots.length, cleanup: report.cleanup, packageRemoved: report.packageRemoved }));
    if (!report.passed) process.exitCode = 1;
  }
})();
