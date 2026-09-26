// Supervised, isolated Android UI smoke for the private batch composer.
// No production account, provider credential, upload key or existing app data.
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { startNativeQa } = require('./native-qa.cjs');
const { assignedSerial, hostEnvironment, metroArguments, METRO_PORT, qaLabel, qaPackage } = require('./android-qa-config.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

const runFile = promisify(execFile);
const label = qaLabel(process.argv[2]);
const inspectExisting = process.argv[3] === '--inspect-existing';
const resumeExisting = process.argv[3] === '--resume-existing';
const cameraExisting = process.argv[3] === '--camera-existing';
const cameraReadyExisting = process.argv[3] === '--camera-ready-existing';
const captureExisting = process.argv[3] === '--capture-existing';
const photoExisting = process.argv[3] === '--photo-existing';
const twoPhotosExisting = process.argv[3] === '--two-photos-existing';
if (process.argv[3] && !inspectExisting && !resumeExisting && !cameraExisting && !cameraReadyExisting && !captureExisting && !photoExisting && !twoPhotosExisting) throw new Error('Unknown QA action');
const mobile = path.resolve(__dirname, '..');
const debugArtifact = path.join(mobile, 'build', `android-debug-qa-${label}`);
const artifact = fsSync.existsSync(path.join(debugArtifact, 'app.apk')) ? debugArtifact : path.join(mobile, 'build', `android-batch-qa-${label}`);
const packageName = qaPackage(label);
const adbPath = '/Users/hank/Library/Android/sdk/platform-tools/adb';
const serial = assignedSerial(process.env);
const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (process.env.DATABASE_URL !== database) throw new Error('Explicit matching test database configuration required');
let stage = 'start', qa, metro, metroExit, reversed = [], installed = false;
const uiPath = `/sdcard/wishlist-batch-${label}-${randomUUID()}.xml`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = async (args, timeout = 20_000) => (await runFile(adbPath, ['-s', serial, ...args], { timeout, maxBuffer: 4 * 1024 * 1024 })).stdout;
const adbBytes = async (args, timeout = 20_000) => (await runFile(adbPath, ['-s', serial, ...args], { timeout, encoding: 'buffer', maxBuffer: 15 * 1024 * 1024 })).stdout;
const tap = async node => {
  const match = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) throw new Error('Visible control has no bounds');
  await adb(['shell', 'input', 'tap', String(Math.floor((Number(match[1]) + Number(match[3])) / 2)), String(Math.floor((Number(match[2]) + Number(match[4])) / 2))]);
};
const xmlNode = (xml, label, attribute = 'content-desc') => {
  const escaped = label.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
  return xml.match(/<node\b[^>]*>/g)?.find(node => node.includes(`${attribute}="${escaped}"`)) ?? null;
};
async function dump() {
  await adb(['shell', 'uiautomator', 'dump', uiPath], 30_000);
  return adb(['exec-out', 'cat', uiPath]);
}
async function waitNode(label, attribute = 'content-desc', timeout = 35_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const node = xmlNode(await dump(), label, attribute);
    if (node) return node;
    await sleep(1300);
  }
  throw new Error(`Required UI control missing at ${stage}`);
}
async function swipeUp() {
  const size = await adb(['shell', 'wm', 'size']);
  const match = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!match) throw new Error('Device dimensions unavailable');
  const width = Number(match[1]), height = Number(match[2]);
  await adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * 0.82)),
    String(Math.floor(width / 2)), String(Math.floor(height * 0.24)), '360']);
}
async function tapRelative(x, y) {
  const size = await adb(['shell', 'wm', 'size']);
  const match = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!match) throw new Error('Device dimensions unavailable');
  await adb(['shell', 'input', 'tap', String(Math.floor(Number(match[1]) * x)), String(Math.floor(Number(match[2]) * y))]);
}
async function waitWithScroll(label, attribute = 'content-desc') {
  for (let attempt = 0; attempt < 5; attempt++) {
    const found = xmlNode(await dump(), label, attribute);
    if (found) return found;
    await swipeUp(); await sleep(800);
  }
  throw new Error(`Required scrollable UI control missing at ${stage}`);
}
async function portFree() {
  await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', () => reject(new Error('QA Metro port occupied; no process changed')));
    listener.listen(METRO_PORT, '127.0.0.1', () => listener.close(resolve));
  });
}
async function metroReady() {
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (metro.exitCode !== null) throw new Error('QA Metro exited early');
    try {
      const response = await fetch(`http://127.0.0.1:${METRO_PORT}/status`, { signal: AbortSignal.timeout(1200) });
      if (response.ok && await response.text() === 'packager-status:running') return;
    } catch { /* booting */ }
    await sleep(350);
  }
  throw new Error('QA Metro did not become ready');
}
async function main() {
  stage = 'fresh-package';
  const packages = (await adb(['shell', 'pm', 'list', 'packages', '-u', packageName])).split(/\r?\n/).map(line => line.trim());
  const alreadyInstalled = packages.includes('package:' + packageName);
  if (alreadyInstalled !== (inspectExisting || resumeExisting || cameraExisting || cameraReadyExisting || captureExisting || photoExisting || twoPhotosExisting)) throw new Error((inspectExisting || resumeExisting || cameraExisting || cameraReadyExisting || captureExisting || photoExisting || twoPhotosExisting) ? 'Expected isolated QA package was not found' : 'QA package or retained data already exists; will not overwrite it');
  await portFree();
  stage = 'fixture'; qa = await startNativeQa(database, 600);
  const apiPort = Number(new URL(qa.apiUrl).port);
  stage = 'metro';
  const env = hostEnvironment(process.execPath, '/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/Users/hank/Library/Android/sdk', os.homedir());
  metro = spawn(process.execPath, metroArguments(mobile), { cwd: mobile,
    env: { ...env, EXPO_PUBLIC_API_URL: qa.apiUrl }, stdio: ['ignore', 'ignore', 'ignore'] });
  metroExit = new Promise(resolve => { metro.once('exit', resolve); metro.once('error', () => resolve(-1)); });
  await metroReady();
  stage = 'private-connections';
  const existingReverse = await adb(['reverse', '--list']);
  for (const port of [apiPort, METRO_PORT]) {
    if (existingReverse.includes(`tcp:${port}`)) throw new Error('QA port already reversed; will not overwrite another mapping');
    await adb(['reverse', `tcp:${port}`, `tcp:${port}`]); reversed.push(port);
  }
  stage = 'install';
  if (!inspectExisting && !resumeExisting && !cameraExisting && !cameraReadyExisting && !captureExisting && !photoExisting && !twoPhotosExisting) await adb(['install', path.join(artifact, 'app.apk')], 90_000);
  installed = true;
  stage = 'launch';
  await adb(['shell', 'am', 'force-stop', packageName]);
  await adb(['shell', 'am', 'start', '-n', `${packageName}/com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.MainActivity`]);
  if (inspectExisting) {
    stage = 'initial-screen-inspection'; await sleep(12_000);
    const xml = await dump();
    const screenshot = await adbBytes(['exec-out', 'screencap', '-p']);
    const target = path.join(artifact, 'initial-screen.png');
    await fs.writeFile(target, screenshot, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ result: 'inspected', stage, package: packageName, screenshot: target,
      markers: { notice: !!xmlNode(xml, '我了解，繼續使用'), login: !!xmlNode(xml, '手機號碼或 Email'),
        bundleError: xml.includes('Unable to load script') || xml.includes('Could not connect to development server') } }));
    return;
  }
  stage = 'product-notice';
  const initialDeadline = Date.now() + 40_000;
  while (Date.now() < initialDeadline) {
    const initial = await dump();
    if (xmlNode(initial, '手機號碼或 Email')) break;
    if (initial.includes('新的願望')) { await tap(await waitWithScroll('我了解，繼續使用')); break; }
    await sleep(1000);
  }
  stage = 'real-login';
  await tap(await waitNode('手機號碼或 Email'));
  await adb(['shell', 'input', 'text', qa.actors.seller.phoneNumber]);
  const identifierNode = xmlNode(await dump(), '手機號碼或 Email');
  if (!identifierNode?.includes(`text="${qa.actors.seller.phoneNumber}"`)) throw new Error('Synthetic identifier was not entered into the visible field');
  await tap(await waitNode('密碼'));
  await adb(['shell', 'input', 'text', qa.actors.seller.password]);
  await adb(['shell', 'input', 'keyevent', '4']);
  await tap(await waitNode('登入'));
  stage = 'account-tab';
  try { await tap(await waitNode('我的')); }
  catch (error) {
    const xml = await dump();
    const screenshot = path.join(artifact, `failure-account-tab-${Date.now()}.png`);
    await fs.writeFile(screenshot, await adbBytes(['exec-out', 'screencap', '-p']), { flag: 'wx', mode: 0o600 });
    console.error(JSON.stringify({ stage, uiMarkers: { loginForm: !!xmlNode(xml, '手機號碼或 Email'),
      invalidCredentials: xml.includes('帳號或密碼不正確'), networkIssue: xml.includes('請確認網路'),
      incompleteResponse: xml.includes('服務回應不完整'), storageIssue: xml.includes('無法安全儲存登入'),
      notice: !!xmlNode(xml, '我了解，繼續使用'), accountTab: !!xmlNode(xml, '我的') }, screenshot }));
    throw error;
  }
  stage = 'batch-entry'; await tap(await waitNode('刊登好物', 'text'));
  stage = 'batch-composer';
  await waitNode('連續拍照刊登', 'text');
  await waitNode('連續拍照', 'text');
  await waitNode('批次選照片', 'text');
  if (cameraExisting || cameraReadyExisting || captureExisting || photoExisting || twoPhotosExisting) {
    stage = 'camera-picker';
    await tap(await waitNode('連續拍照', 'text'));
    await sleep(6_000);
    if (cameraReadyExisting || captureExisting || photoExisting || twoPhotosExisting) {
      const permissions = await dump();
      const allow = xmlNode(permissions, 'While using the app', 'text') || xmlNode(permissions, 'Only this time', 'text');
      if (allow) { await tap(allow); await sleep(7_000); }
    }
    if (captureExisting || photoExisting || twoPhotosExisting) {
      stage = 'camera-shutter';
      await tapRelative(0.5, 0.91); await sleep(4_000);
      if (photoExisting || twoPhotosExisting) {
        stage = 'camera-confirmation';
        await tapRelative(0.5, 0.91); await sleep(8_000);
        const afterConfirmation = await dump();
        const afterConfirmationPath = path.join(artifact, `after-confirmation-${Date.now()}.png`);
        await fs.writeFile(afterConfirmationPath, await adbBytes(['exec-out', 'screencap', '-p']), { flag: 'wx', mode: 0o600 });
        console.log(JSON.stringify({ stage, afterConfirmationPath, composer: !!xmlNode(afterConfirmation, '連續拍照刊登', 'text'),
          photo: !!xmlNode(afterConfirmation, '第1件商品照片') }));
        if (twoPhotosExisting) {
          stage = 'second-camera-shutter';
          await tapRelative(0.5, 0.91); await sleep(4_000);
          stage = 'second-camera-confirmation';
          await tapRelative(0.5, 0.91); await sleep(8_000);
        }
        stage = 'camera-cancel-next';
        await adb(['shell', 'input', 'keyevent', '4']);
        const afterCancelPath = path.join(artifact, `after-cancel-${Date.now()}.png`);
        await fs.writeFile(afterCancelPath, await adbBytes(['exec-out', 'screencap', '-p']), { flag: 'wx', mode: 0o600 });
        console.log(JSON.stringify({ stage, afterCancelPath }));
        stage = 'photo-upload';
        const count = twoPhotosExisting ? 2 : 1;
        const card = await waitWithScroll(`第${count}件商品照片`);
        if (!card) throw new Error('Photo card unavailable');
        let record;
        const deadline = Date.now() + 45_000;
        const loginResponse = await fetch(`${qa.apiUrl}/api/auth/login`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: qa.actors.seller.email, password: qa.actors.seller.password }),
          signal: AbortSignal.timeout(10_000) });
        if (loginResponse.status !== 200) throw new Error('Synthetic seller login unavailable');
        const { token } = await loginResponse.json();
        while (Date.now() < deadline) {
          const response = await fetch(`${qa.apiUrl}/api/listing-media/unused`, {
            headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
          if (response.status !== 200) throw new Error('Private media query failed');
          const body = await response.json();
          if (body.items?.length === count) { record = body.items[0]; break; }
          await sleep(1500);
        }
        if (!record?.id) throw new Error('Expected private uploaded photos were not found');
        stage = 'private-photo-access';
        const ownerImage = await fetch(record.imageUrl, { headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000) });
        if (ownerImage.status !== 200 || !ownerImage.headers.get('content-type')?.startsWith('image/')) {
          throw new Error('Owner cannot retrieve the private photo');
        }
        const anonymousImage = await fetch(record.imageUrl, { signal: AbortSignal.timeout(10_000) });
        if (anonymousImage.status !== 404) throw new Error('Private photo was visible anonymously');
        const thirdLogin = await fetch(`${qa.apiUrl}/api/auth/login`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: qa.actors.third.email, password: qa.actors.third.password }),
          signal: AbortSignal.timeout(10_000) });
        if (thirdLogin.status !== 200) throw new Error('Third-party synthetic login unavailable');
        const thirdToken = (await thirdLogin.json()).token;
        const thirdImage = await fetch(record.imageUrl, { headers: { Authorization: `Bearer ${thirdToken}` },
          signal: AbortSignal.timeout(10_000) });
        if (thirdImage.status !== 404) throw new Error('Private photo was visible to another account');
        stage = 'photo-upload';
        const xml = await dump();
        const screenshot = await adbBytes(['exec-out', 'screencap', '-p']);
        const target = path.join(artifact, `${count === 2 ? 'two-photos' : 'photo'}-uploaded-${Date.now()}.png`);
        await fs.writeFile(target, screenshot, { flag: 'wx', mode: 0o600 });
        console.log(JSON.stringify({ result: 'photo-uploaded', stage, screenshot: target,
          privateMediaCount: count, imageShownInComposer: !!xmlNode(xml, `第${count}件商品照片`),
          privateImageOwnerOnly: true,
          aiUnavailableInIsolatedFixture: xml.includes('AI 尚未對此帳號開放') }));
        return;
      }
      const after = await dump();
      const screenshot = await adbBytes(['exec-out', 'screencap', '-p']);
      const target = path.join(artifact, 'camera-after-shutter.png');
      await fs.writeFile(target, screenshot, { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ result: 'shutter-inspected', stage, screenshot: target, markers: {
        composerVisible: !!xmlNode(after, '連續拍照刊登', 'text'),
        confirmControl: after.includes('OK') || after.includes('Done') || after.includes('Use photo'),
        cameraControl: after.includes('Take photo') || after.includes('Shutter') } }));
      return;
    }
    const cameraXml = await dump();
    const screenshot = await adbBytes(['exec-out', 'screencap', '-p']);
    const target = path.join(artifact, cameraReadyExisting ? 'camera-ready.png' : 'camera-picker.png');
    await fs.writeFile(target, screenshot, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ result: 'camera-inspected', stage, screenshot: target, markers: {
      composerStillVisible: !!xmlNode(cameraXml, '連續拍照刊登', 'text'),
      permissionDialog: cameraXml.includes('Allow') || cameraXml.includes('允許'),
      cameraControls: cameraXml.includes('Shutter') || cameraXml.includes('拍照') } }));
    return;
  }
  const screenshot = await adbBytes(['exec-out', 'screencap', '-p']);
  await fs.writeFile(path.join(artifact, 'batch-composer.png'), screenshot, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ result: 'passed', stage, package: packageName, authenticatedThroughUi: true,
    batchEntryVisible: true, cameraAndAlbumVisible: true, screenshot: path.join(artifact, 'batch-composer.png') }));
}
(async () => {
  let failed = false, cleanupFailed = false;
  try { await main(); } catch {
    failed = true;
    if (stage.startsWith('camera') || stage === 'photo-upload') {
      try {
        const screenshot = await adbBytes(['exec-out', 'screencap', '-p']);
        await fs.writeFile(path.join(artifact, `failure-${stage}-${Date.now()}.png`), screenshot, { flag: 'wx', mode: 0o600 });
        const xml = await dump();
        console.error(JSON.stringify({ stage, uiMarkers: { composer: !!xmlNode(xml, '連續拍照刊登', 'text'),
          photo: !!xmlNode(xml, '第1件商品照片'), camera: xml.includes('Take photo') || xml.includes('Camera'),
          save: xml.includes('AI 尚未對此帳號開放'), gallery: xml.includes('批次選照片'),
          imageError: xml.includes('無法取得或處理照片') } }));
        if (stage === 'photo-upload') {
          await swipeUp();
          await fs.writeFile(path.join(artifact, `failure-photo-scrolled-${Date.now()}.png`),
            await adbBytes(['exec-out', 'screencap', '-p']), { flag: 'wx', mode: 0o600 });
          const scrolled = await dump();
          console.error(JSON.stringify({ stage, scrolledMarkers: { photo: !!xmlNode(scrolled, '第1件商品照片'),
            imageError: scrolled.includes('無法取得或處理照片'), uploadError: scrolled.includes('照片上傳或 AI 排隊未完成') } }));
        }
      } catch { /* screenshot is diagnostic only */ }
    }
    console.error(`Android batch UI smoke failed at ${stage}; private inputs and raw UI withheld`);
  }
  for (const port of reversed.reverse()) try { await adb(['reverse', '--remove', `tcp:${port}`]); } catch { cleanupFailed = true; }
  try { await adb(['shell', 'rm', uiPath]); } catch { /* diagnostic file may not exist */ }
  if (metro && metro.exitCode === null) metro.kill('SIGTERM');
  if (metroExit) await metroExit;
  if (qa) try { await qa.stop(); } catch { cleanupFailed = true; }
  console.log(JSON.stringify({ kind: 'isolated-batch-ui-smoke', passed: !failed && !cleanupFailed, installedQa: installed, cleanupComplete: !cleanupFailed }));
  if (failed || cleanupFailed) process.exitCode = 1;
})().catch(() => { console.error('Android batch UI smoke could not complete; details withheld'); process.exitCode = 1; });
