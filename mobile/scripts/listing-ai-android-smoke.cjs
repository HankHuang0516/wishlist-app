// Supervised Android-only native listing AI smoke with owned synthetic photos.
// Uses an existing distinct-package Debug shell + fresh Metro JS, never a store build.
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const sharp = require('../../server/node_modules/sharp');
const { startNativeQa } = require('./native-qa.cjs');
const { nativeQaFailureCode } = require('./native-qa-failure.cjs');
const { assignedSerial, hostEnvironment, metroArguments, METRO_PORT, qaLabel, qaPackage } = require('./android-qa-config.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

const runFile = promisify(execFile);
const mobile = path.resolve(__dirname, '..');
const label = qaLabel(process.argv[2]);
const mode = process.argv[3];
if (!['--inspect-picker', '--inspect-picker-two', '--inspect-selection', '--recognize-one', '--recognize-two', '--publish-one', '--interrupt-upload', '--stale-recovery', '--retry-uncommitted'].includes(mode) || process.argv.length !== 4) throw new Error('Explicit QA mode required');
const twoPhotos = mode === '--inspect-picker-two' || mode === '--recognize-two' || mode === '--publish-one';
const serial = assignedSerial(process.env);
const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (process.env.DATABASE_URL !== database) throw new Error('Matching isolated QA database required');
const packageName = qaPackage(label);
const runId = randomUUID();
const evidence = path.join(mobile, 'build', 'android-listing-ai-' + runId);
const uiPath = `/sdcard/wishlist-listing-ai-${runId}.xml`;
const galleryPath = `/sdcard/Pictures/wishlist-listing-ai-${runId}.png`;
const secondGalleryPath = `/sdcard/Pictures/wishlist-listing-ai-${runId}-mug.png`;
const fixturePath = path.join(mobile, 'qa-fixtures', 'synthetic-used-orange-desk-lamp.png');
const fixtureHash = 'abdaabda6b85bd4037f976638b4b93faf6702c9e1ab0997809e7fa18b4468ab0';
const secondFixturePath = path.join(mobile, 'qa-fixtures', 'synthetic-used-blue-mug.png');
const secondFixtureHash = '4bf0d16e92bff216bdf0521ba878886b0a31c734d43ee9363dbc69dda6aa06f9';
const apk = path.join(mobile, 'build', `android-batch-qa-${label}`, 'app.apk');
const priorPath = path.join(mobile, 'build', 'android-external-map-a6cc02cd-b5da-427c-bf89-287167d87f5b', 'result.json');
const adbPath = '/Users/hank/Library/Android/sdk/platform-tools/adb';
const aaptPath = '/Users/hank/Library/Android/sdk/build-tools/36.0.0/aapt2';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = async (args, timeout = 20_000) => (await runFile(adbPath, ['-s', serial, ...args], { timeout, maxBuffer: 4 * 1024 * 1024 })).stdout;
const adbBytes = async (args, timeout = 20_000) => (await runFile(adbPath, ['-s', serial, ...args],
  { timeout, encoding: 'buffer', maxBuffer: 15 * 1024 * 1024 })).stdout;
let qa, metro, metroExit, stage = 'preflight', launched = false, stopping = false;
const galleryAdded = [];
const reverses = [];
const report = { kind: 'isolated-android-listing-ai-smoke', mode, passed: false, stage, sourceLabel: label,
  package: packageName, evidenceDirectory: evidence, screenshots: [], cleanup: null };
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; });

function nodes(xml) { return xml.match(/<node\b[^>]*>/g) || []; }
function escapeXml(value) { return value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]); }
function findNode(xml, label, exact = true) {
  const term = escapeXml(label);
  return nodes(xml).find(node => ['text', 'content-desc'].some(key => exact
    ? node.includes(`${key}="${term}"`) : node.includes(`${key}="`) && node.includes(term))) || null;
}
async function dump() { await adb(['shell', 'uiautomator', 'dump', uiPath], 30_000); return adb(['exec-out', 'cat', uiPath]); }
async function waitNode(label, { exact = true, timeout = 35_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !stopping) {
    const node = findNode(await dump(), label, exact);
    if (node) return node;
    await sleep(900);
  }
  throw new Error('QA_CONTROL_MISSING');
}
async function tap(node) {
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) throw new Error('QA_CONTROL_BOUNDS');
  await adb(['shell', 'input', 'tap', String(Math.floor((+bounds[1] + +bounds[3]) / 2)),
    String(Math.floor((+bounds[2] + +bounds[4]) / 2))]);
}
async function tapLabel(label) {
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline && !stopping) {
    const term = escapeXml(label);
    const matches = nodes(await dump()).filter(node => node.includes(`content-desc="${term}"`) || node.includes(`text="${term}"`));
    const target = matches.find(node => node.includes('clickable="true"')) || matches[0];
    if (target) return tap(target);
    await sleep(900);
  }
  throw new Error('QA_CONTROL_MISSING');
}
async function swipeUp() {
  const size = await adb(['shell', 'wm', 'size']);
  const match = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!match) throw new Error('QA_DEVICE_SIZE');
  await adb(['shell', 'input', 'swipe', String(Math.floor(+match[1] / 2)), String(Math.floor(+match[2] * 0.82)),
    String(Math.floor(+match[1] / 2)), String(Math.floor(+match[2] * 0.22)), '360']);
}
async function swipeDown() {
  const size = await adb(['shell', 'wm', 'size']);
  const match = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!match) throw new Error('QA_DEVICE_SIZE');
  await adb(['shell', 'input', 'swipe', '10', String(Math.floor(+match[2] * 0.26)),
    '10', String(Math.floor(+match[2] * 0.84)), '400']);
}
async function waitWithScroll(label, exact = true) {
  for (let attempt = 0; attempt < 8 && !stopping; attempt++) {
    const node = findNode(await dump(), label, exact);
    if (node) return node;
    await swipeUp(); await sleep(900);
  }
  throw new Error('QA_SCROLLED_CONTROL_MISSING');
}
function visibleControl(xml, label, exact = true) {
  const term = escapeXml(label);
  const matches = nodes(xml).filter(node => ['text', 'content-desc'].some(key => exact
    ? node.includes(`${key}="${term}"`) : node.includes(`${key}="`) && node.includes(term)));
  const visible = matches.filter(node => {
    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    return bounds && +bounds[1] >= 0 && +bounds[3] <= 320 && +bounds[2] >= 82 && +bounds[4] <= 625 &&
      +bounds[3] > +bounds[1] && +bounds[4] > +bounds[2];
  });
  return visible.find(node => node.includes('clickable="true"')) || visible[0] || null;
}
async function tapVisibleWithScroll(label, exact = true) {
  for (const direction of [swipeUp, swipeDown]) {
    for (let attempt = 0; attempt < 16 && !stopping; attempt++) {
      const node = visibleControl(await dump(), label, exact);
      if (node) { await tap(node); return; }
      await direction(); await sleep(700);
    }
  }
  throw new Error('QA_VISIBLE_CONTROL_MISSING');
}
async function tapInputAboveKeyboard(label) {
  for (let attempt = 0; attempt < 26 && !stopping; attempt++) {
    const node = visibleControl(await dump(), label);
    const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (node && bounds && Number(bounds[4]) <= 480) {
      await tap(node); await sleep(600); return;
    }
    await adb(['shell', 'input', 'swipe', '160', '490', '160', '330', '350']);
    await sleep(500);
  }
  throw new Error('QA_EDIT_INPUT_NOT_VISIBLE');
}
async function fillVisibleInput(label, value, field) {
  stage = 'native-publish-form-' + field;
  await tapInputAboveKeyboard(label);
  await adb(['shell', 'input', 'text', value]);
  if (!(await dump()).includes(`text="${value}"`)) throw new Error('QA_PUBLISH_INPUT_MISSING');
  report.formInputs ??= [];
  report.formInputs.push(field);
  await adb(['shell', 'input', 'keyevent', '66']); // IME Done; Android Back closes the listing modal here.
  if (!findNode(await dump(), '連續拍照刊登')) throw new Error('QA_PUBLISH_EDITOR_CLOSED');
}
async function shot(name) {
  if (!['picker', 'selected', 'ai-draft', 'ai-second-draft', 'second-pending', 'pre-edit', 'edited', 'pre-publish', 'published', 'recovered', 'failed-upload', 'retried-upload', 'failure'].includes(name)) throw new Error('QA_SHOT_NAME');
  const target = path.join(evidence, name + '.png');
  await fs.writeFile(target, await adbBytes(['exec-out', 'screencap', '-p']), { flag: 'wx', mode: 0o600 });
  report.screenshots.push(target);
}
async function freeMetroPort() {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error('QA_METRO_OCCUPIED')));
    server.listen(METRO_PORT, '127.0.0.1', () => server.close(resolve));
  });
}
async function metroReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && metro.exitCode === null && !stopping) {
    try {
      const response = await fetch(`http://127.0.0.1:${METRO_PORT}/status`, { signal: AbortSignal.timeout(1200) });
      if (response.ok && await response.text() === 'packager-status:running') return;
    } catch { /* Metro is still starting. */ }
    await sleep(300);
  }
  throw new Error('QA_METRO_UNAVAILABLE');
}
async function reverse(port) {
  const endpoint = `tcp:${port}`;
  const existing = await adb(['reverse', '--list']);
  if (existing.split(/\r?\n/).some(line => line.trim().split(/\s+/).includes(endpoint))) throw new Error('QA_REVERSE_OCCUPIED');
  await adb(['reverse', endpoint, endpoint]); reverses.push(endpoint);
}
async function json(url, options = {}, expected = 200) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (response.status !== expected) throw new Error('QA_HTTP_' + response.status);
  return response.status === 204 ? null : response.json();
}
async function privateCaptureFiles(apiUrl, userId) {
  const scope = createHash('sha256').update(apiUrl.replace(/\/$/, '').replace(/\/api$/, '')).digest('hex');
  const scopedDirectory = `/wishlist-private-captures-v1/${scope}/${userId}/`;
  const listing = await adb(['shell', 'run-as', packageName, 'sh', '-c',
    'find . -type f -path "*/wishlist-private-captures-v1/*" -name "*.jpg"'], 15000);
  return listing.split(/\r?\n/).map(line => line.trim()).filter(line => line.includes(scopedDirectory));
}
async function preflight() {
  const prior = JSON.parse(await fs.readFile(priorPath, 'utf8'));
  const bytes = await fs.readFile(apk);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const badging = (await runFile(aaptPath, ['dump', 'badging', apk], { timeout: 20_000, maxBuffer: 2_000_000 })).stdout;
  if (!prior.passed || prior.package !== packageName || prior.apkSha256 !== hash ||
    !prior.cleanup || Object.values(prior.cleanup).some(value => value !== 0) ||
    !badging.includes(`package: name='${packageName}'`) || !badging.includes('application-debuggable'))
    throw new Error('QA_APK_PROVENANCE');
  const fixture = await fs.readFile(fixturePath);
  if (createHash('sha256').update(fixture).digest('hex') !== fixtureHash) throw new Error('QA_FIXTURE_CHANGED');
  if (twoPhotos) {
    const secondFixture = await fs.readFile(secondFixturePath);
    if (createHash('sha256').update(secondFixture).digest('hex') !== secondFixtureHash) throw new Error('QA_SECOND_FIXTURE_CHANGED');
  }
  const packages = (await adb(['shell', 'pm', 'list', 'packages', '-u', packageName])).split(/\r?\n/).map(line => line.trim());
  if (!packages.includes('package:' + packageName)) throw new Error('QA_PACKAGE_NOT_OWNED');
}
async function main() {
  await preflight();
  await fs.mkdir(evidence, { mode: 0o700 });
  await freeMetroPort();
  stage = 'fixture'; qa = await startNativeQa(database, 600, { listingAiPilot: !['--interrupt-upload', '--stale-recovery', '--retry-uncommitted'].includes(mode),
    holdListingUploadAck: ['--interrupt-upload', '--stale-recovery'].includes(mode),
    staleBatchRecoverySnapshot: mode === '--stale-recovery', rejectFirstListingUpload: mode === '--retry-uncommitted' });
  const environment = hostEnvironment(process.execPath, '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/Users/hank/Library/Android/sdk', os.homedir());
  stage = 'metro';
  metro = spawn(process.execPath, metroArguments(mobile), { cwd: mobile,
    env: { ...environment, EXPO_PUBLIC_API_URL: qa.apiUrl }, stdio: ['ignore', 'ignore', 'ignore'] });
  metroExit = new Promise(resolve => { metro.once('exit', resolve); metro.once('error', () => resolve(-1)); });
  await metroReady();
  stage = 'reverse'; await reverse(Number(new URL(qa.apiUrl).port)); await reverse(METRO_PORT);
  stage = 'gallery';
  galleryAdded.push(galleryPath); await adb(['push', fixturePath, galleryPath], 30_000);
  await adb(['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + galleryPath]);
  if (twoPhotos) {
    galleryAdded.push(secondGalleryPath); await adb(['push', secondFixturePath, secondGalleryPath], 30_000);
    await adb(['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + secondGalleryPath]);
  }
  stage = 'launch'; await adb(['shell', 'am', 'force-stop', packageName]);
  await adb(['shell', 'am', 'start', '-n', `${packageName}/com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.MainActivity`]);
  launched = true;
  stage = 'notice';
  const noticeDeadline = Date.now() + 40_000;
  while (Date.now() < noticeDeadline && !stopping) {
    const xml = await dump();
    if (findNode(xml, '手機號碼或 Email')) break;
    const notice = findNode(xml, '我了解，繼續使用');
    if (notice) { await tap(notice); break; }
    if (xml.includes('新的願望') || xml.includes('帳號與資料說明')) await swipeUp();
    await sleep(900);
  }
  stage = 'login';
  await tapLabel('手機號碼或 Email');
  await adb(['shell', 'input', 'text', qa.actors.buyer.phoneNumber]);
  if (!(await dump()).includes(`text="${qa.actors.buyer.phoneNumber}"`)) throw new Error('QA_LOGIN_INPUT');
  await tapLabel('密碼'); await adb(['shell', 'input', 'text', qa.actors.buyer.password]);
  await adb(['shell', 'input', 'keyevent', '4']);
  await tapLabel('登入');
  stage = 'composer';
  let composerOpened = false;
  for (let attempt = 0; attempt < 2 && !composerOpened && !stopping; attempt++) {
    if (findNode(await dump(), '連續拍照刊登')) { composerOpened = true; break; }
    await tapLabel('我的'); await sleep(900);
    if (!findNode(await dump(), '刊登好物')) continue;
    await tapLabel('刊登好物');
    try { await waitNode('連續拍照刊登', { timeout: 12_000 }); composerOpened = true; }
    catch { /* Pure navigation may be retried once; no upload or publication has occurred. */ }
  }
  if (!composerOpened) throw new Error('QA_COMPOSER_NOT_OPEN');
  stage = 'picker'; await tapLabel('批次選照片');
  await sleep(3500);
  const picker = await dump();
  await shot('picker');
  report.pickerMarkers = {
    nameVisible: picker.includes('wishlist-listing-ai-'),
    photoTab: !!findNode(picker, 'Photos') || !!findNode(picker, '相片'),
    addButton: !!findNode(picker, 'Add', false) || !!findNode(picker, '新增', false),
    imageNodes: nodes(picker).filter(node => node.includes('class="android.widget.ImageView"')).length,
  };
  // The private QA emulator was visually inspected at 320x640. Fail closed
  // if the picker layout changes or the first tile lacks the fixture's orange lamp.
  const { data: pixels, info } = await sharp(path.join(evidence, 'picker.png')).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 320 || info.height !== 640 || info.channels < 3) throw new Error('QA_PICKER_LAYOUT_CHANGED');
  const tilePixels = (left, right, color) => {
    let count = 0;
    for (let y = 422; y < 529; y++) for (let x = left; x < right; x++) {
      const offset = (y * info.width + x) * info.channels;
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      if (color === 'orange' ? red > 100 && green > 40 && green < 170 && red > green * 1.25 && green > blue * 1.2
        : blue > 80 && blue > red * 1.2 && blue > green * 1.1) count++;
    }
    return count;
  };
  const orangePixels = tilePixels(0, 106, 'orange');
  report.pickerMarkers.orangeFixtureVerified = orangePixels > 300;
  if (twoPhotos) report.pickerMarkers.blueFixtureVerified = tilePixels(107, 213, 'blue') > 300;
  if (!report.pickerMarkers.orangeFixtureVerified || (twoPhotos && !report.pickerMarkers.blueFixtureVerified) ||
    !report.pickerMarkers.photoTab) throw new Error('QA_PICKER_FIXTURE_NOT_VISIBLE');
  if (mode === '--inspect-picker' || mode === '--inspect-picker-two') { report.passed = true; return; }
  stage = 'selection';
  await adb(['shell', 'input', 'tap', '53', '474']);
  if (twoPhotos) await adb(['shell', 'input', 'tap', '159', '474']);
  await sleep(2500);
  await shot('selected');
  const selected = await dump();
  report.selectionMarkers = { composer: !!findNode(selected, '連續拍照刊登'),
    addButton: !!findNode(selected, 'Add', false) || !!findNode(selected, '新增', false),
    doneButton: !!findNode(selected, 'Done'), selectedCount: !!findNode(selected, String(twoPhotos ? 2 : 1)) ||
      selected.includes(twoPhotos ? '2 selected' : '1 selected') || selected.includes(twoPhotos ? '已選取 2' : '已選取 1') };
  if (mode === '--inspect-selection') { report.passed = true; return; }
  if (!report.selectionMarkers.doneButton || !report.selectionMarkers.selectedCount) throw new Error('QA_PICKER_CONFIRM_MISSING');
  await tapLabel('Done');
  stage = 'native-private-upload';
  const base = qa.apiUrl + '/api';
  const login = async actor => {
    const reply = await json(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: actor.email, password: actor.password }) });
    if (reply.user?.id !== actor.id || typeof reply.token !== 'string') throw new Error('QA_ACTOR_LOGIN');
    return { Authorization: 'Bearer ' + reply.token };
  };
  const owner = await login(qa.actors.buyer), outsider = await login(qa.actors.third);
  if (mode === '--retry-uncommitted') {
    stage = 'precommit-upload-rejected';
    await Promise.race([qa.listingUploadRejected, sleep(20_000).then(() => { throw new Error('QA_REJECTION_MISSING'); })]);
    await waitWithScroll('照片上傳尚未確認；已停止連拍，請重試保存。');
    await shot('failed-upload');
    const before = await privateCaptureFiles(qa.apiUrl, qa.actors.buyer.id);
    const captureId = before.length === 1 && before[0].match(/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.jpg$/i)?.[1];
    if (!captureId || (await json(base + '/listing-media/unused?purpose=BATCH_ITEM', { headers: owner })).items?.length !== 0 ||
      (await json(base + '/listings')).items?.length !== 0) throw new Error('QA_UNCOMMITTED_PHOTO_NOT_PRESERVED');
    const missing = await fetch(base + '/listing-media/by-upload-id/' + captureId, { headers: owner, signal: AbortSignal.timeout(10000) });
    if (missing.status !== 404) throw new Error('QA_PRECOMMIT_MEDIA_EXISTS');
    stage = 'precommit-force-stop';
    await adb(['shell', 'am', 'force-stop', packageName]);
    await adb(['shell', 'am', 'start', '-n', `${packageName}/com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.MainActivity`]);
    stage = 'precommit-recovery';
    await waitNode('我的', { timeout: 50_000 });
    await tapLabel('我的'); await tapLabel('刊登好物');
    await waitWithScroll('商品草稿 1/12');
    await waitWithScroll('第1件商品照片預覽已載入');
    await waitWithScroll('重試儲存照片');
    stage = 'precommit-retry';
    await tapVisibleWithScroll('重試儲存照片');
    let saved;
    const retryDeadline = Date.now() + 45_000;
    while (Date.now() < retryDeadline && !stopping) {
      const unused = await json(base + '/listing-media/unused?purpose=BATCH_ITEM', { headers: owner });
      if (unused.items?.length > 1) throw new Error('QA_PRECOMMIT_DUPLICATE');
      if (unused.items?.length === 1) { saved = unused.items[0]; break; }
      await sleep(900);
    }
    if (!saved?.id || (await json(base + '/listing-media/by-upload-id/' + captureId, { headers: owner })).id !== saved.id)
      throw new Error('QA_PRECOMMIT_UPLOAD_ID_CHANGED');
    let previewLoaded = false;
    for (let attempt = 0; attempt < 9 && !stopping; attempt++) {
      if (findNode(await dump(), '第1件商品照片預覽已載入')) { previewLoaded = true; break; }
      await swipeDown(); await sleep(600);
    }
    if (!previewLoaded) throw new Error('QA_PRECOMMIT_THUMBNAIL_NOT_VISIBLE');
    await shot('retried-upload');
    const image = await fetch(saved.imageUrl, { headers: owner, signal: AbortSignal.timeout(15000) });
    const outsiderImage = await fetch(saved.imageUrl, { headers: outsider, signal: AbortSignal.timeout(15000) });
    const anonymousImage = await fetch(saved.imageUrl, { signal: AbortSignal.timeout(15000) });
    if (image.status !== 200 || outsiderImage.status !== 404 || anonymousImage.status !== 404 ||
      saved.aiDraftStatus !== 'SKIPPED' || (await json(base + '/listings')).items?.length !== 0)
      throw new Error('QA_PRECOMMIT_RETRY_PRIVACY');
    const { data: pixels, info } = await sharp(Buffer.from(await image.arrayBuffer())).resize(64, 64).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let orange = 0;
    for (let offset = 0; offset < pixels.length; offset += info.channels) {
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      if (red > 100 && green > 40 && green < 170 && red > green * 1.25 && green > blue * 1.2) orange++;
    }
    const after = await privateCaptureFiles(qa.apiUrl, qa.actors.buyer.id);
    if (orange <= 400 || after.length !== 0 || !qa.imageReads.some(read => read.variant === 'thumbnail' && read.statusCode === 200 && read.hasAuthorization))
      throw new Error('QA_PRECOMMIT_RETRY_INCOMPLETE');
    report.interruption = { rejectedBeforeCommit: true, appForceStopped: true, retainedCaptureBefore: before.length,
      retainedCaptureAfter: after.length, sameUploadIdAfterRetry: true, privatePhotoVerified: true,
      authenticatedThumbnailVerified: true, publicCount: 0 };
    report.passed = true;
    return;
  }
  let photos;
  const uploadDeadline = Date.now() + 45_000;
  while (Date.now() < uploadDeadline && !stopping) {
    const unused = await json(base + '/listing-media/unused', { headers: owner });
    if (unused.items?.length === (twoPhotos ? 2 : 1)) { photos = unused.items; break; }
    if (unused.items?.length > (twoPhotos ? 2 : 1)) throw new Error('QA_UNEXPECTED_PRIVATE_MEDIA');
    await sleep(1200);
  }
  if (!photos?.every(photo => photo?.id && photo.imageUrl)) throw new Error('QA_UPLOAD_MISSING');
  if (mode === '--interrupt-upload' || mode === '--stale-recovery') {
    stage = 'committed-ack-held';
    const heldMediaId = await Promise.race([qa.uploadAckHeld,
      sleep(20_000).then(() => { throw new Error('QA_ACK_HOLD_MISSING'); })]);
    report.interruption = { heldMediaMatches: heldMediaId === photos[0].id,
      aiDraftStatus: photos[0].aiDraftStatus, captureCountBefore: null, imageReads: qa.imageReads };
    if (heldMediaId !== photos[0].id || photos[0].aiDraftStatus !== 'SKIPPED') throw new Error('QA_HELD_MEDIA_MISMATCH');
    const before = await privateCaptureFiles(qa.apiUrl, qa.actors.buyer.id);
    report.interruption.captureCountBefore = before.length;
    if (before.length !== 1) throw new Error('QA_DURABLE_CAPTURE_MISSING');
    stage = 'forced-app-interruption';
    await adb(['shell', 'am', 'force-stop', packageName]);
    await adb(['shell', 'am', 'start', '-n', `${packageName}/com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.MainActivity`]);
    stage = 'native-recovery';
    await waitNode('我的', { timeout: 50_000 });
    await tapLabel('我的'); await tapLabel('刊登好物');
    // Shared location controls precede the draft section; it is below the
    // 320x640 viewport even when recovery has already succeeded.
    await waitWithScroll('商品草稿 1/12');
    await waitWithScroll('第1件商品照片');
    await waitNode('第1件商品照片預覽已載入', { timeout: 25_000 });
    await waitNode('照片已私密保存，可開始 AI 辨識', { timeout: 10_000 });
    if (mode === '--stale-recovery' && qa.batchRecoverySnapshots.slice(0, 2).join(',') !== 'stale,fresh')
      throw new Error('QA_STALE_SNAPSHOT_NOT_REFRESHED');
    if (!qa.imageReads.some(read => read.variant === 'thumbnail' && read.statusCode === 200 && read.hasAuthorization) ||
      qa.imageReads.some(read => read.variant === 'thumbnail' && read.statusCode !== 200))
      throw new Error('QA_PRIVATE_THUMBNAIL_NOT_AUTHENTICATED');
    await shot('recovered');
    const recovered = await json(base + '/listing-media/unused?purpose=BATCH_ITEM', { headers: owner });
    if (recovered.items?.length !== 1 || recovered.items[0].id !== heldMediaId ||
      (await json(base + '/listings')).items?.length !== 0) throw new Error('QA_INTERRUPTED_UPLOAD_DUPLICATE');
    const ownerImage = await fetch(photos[0].imageUrl, { headers: owner, signal: AbortSignal.timeout(15000) });
    const outsiderImage = await fetch(photos[0].imageUrl, { headers: outsider, signal: AbortSignal.timeout(15000) });
    const anonymousImage = await fetch(photos[0].imageUrl, { signal: AbortSignal.timeout(15000) });
    if (ownerImage.status !== 200 || outsiderImage.status !== 404 || anonymousImage.status !== 404)
      throw new Error('QA_INTERRUPTED_IMAGE_PRIVACY');
    const image = Buffer.from(await ownerImage.arrayBuffer());
    const { data: pixels, info: dimensions } = await sharp(image).resize(64, 64).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let orange = 0;
    for (let offset = 0; offset < pixels.length; offset += dimensions.channels) {
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      if (red > 100 && green > 40 && green < 170 && red > green * 1.25 && green > blue * 1.2) orange++;
    }
    if (orange <= 400) throw new Error('QA_INTERRUPTED_WRONG_PHOTO');
    const after = await privateCaptureFiles(qa.apiUrl, qa.actors.buyer.id);
    if (after.length !== 0) throw new Error('QA_REDUNDANT_LOCAL_CAPTURE_RETAINED');
    report.interruption = { committedBeforeAck: true, appForceStopped: true, sameMediaAfterRestart: true,
      localCaptureCountBefore: before.length, localCaptureCountAfter: after.length,
      privateImageVerified: true, authenticatedThumbnailVerified: true, publicCount: 0,
      ...(mode === '--stale-recovery' ? { staleSnapshotRefreshed: true } : {}) };
    report.passed = true;
    return;
  }
  const classified = new Map();
  for (const photo of photos) {
    const ownerImage = await fetch(photo.imageUrl, { headers: owner, signal: AbortSignal.timeout(15_000) });
    const anonymousImage = await fetch(photo.imageUrl, { signal: AbortSignal.timeout(15_000) });
    const otherImage = await fetch(photo.imageUrl, { headers: outsider, signal: AbortSignal.timeout(15_000) });
    if (ownerImage.status !== 200 || anonymousImage.status !== 404 || otherImage.status !== 404) throw new Error('QA_PRIVATE_IMAGE_ACCESS');
    const { data: small, info: imageInfo } = await sharp(Buffer.from(await ownerImage.arrayBuffer())).resize(64, 64)
      .removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let orange = 0, blue = 0;
    for (let offset = 0; offset < small.length; offset += imageInfo.channels) {
      const red = small[offset], green = small[offset + 1], blueValue = small[offset + 2];
      if (red > 100 && green > 40 && green < 170 && red > green * 1.25 && green > blueValue * 1.2) orange++;
      if (blueValue > 80 && blueValue > red * 1.2 && blueValue > green * 1.1) blue++;
    }
    const item = orange > 400 && blue < 100 ? 'lamp' : blue > 600 ? 'mug' : null;
    if (!item || classified.has(item)) throw new Error('QA_UPLOADED_PHOTO_MISMATCH');
    classified.set(item, photo);
    const queued = await json(base + '/listing-media/' + photo.id + '/ai-draft', { headers: owner });
    if (!['PENDING', 'PROCESSING'].includes(queued.status)) throw new Error('QA_AI_NOT_QUEUED');
  }
  if (classified.size !== (twoPhotos ? 2 : 1) || !classified.has('lamp') || (twoPhotos && !classified.has('mug')))
    throw new Error('QA_UPLOADED_PHOTO_MISMATCH');
  if ((await json(base + '/listings')).items?.length !== 0) throw new Error('QA_PRECONFIRM_PUBLICATION');
  stage = 'minimax-claim';
  const worker = { Authorization: 'Bearer ' + qa.callbackToken };
  const { recognizeListingImage } = await import('../../tools/minimax-vision-bridge/server.mjs');
  const recognized = new Map();
  for (let index = 0; index < classified.size; index++) {
    let job;
    const claimDeadline = Date.now() + 20_000;
    while (Date.now() < claimDeadline && !stopping) {
      const response = await fetch(base + '/internal/minimax-vision/next', { headers: worker, signal: AbortSignal.timeout(15_000) });
      if (response.status === 200) { job = await response.json(); break; }
      if (response.status !== 204) throw new Error('QA_AI_CLAIM_' + response.status);
      await sleep(900);
    }
    const kind = [...classified].find(([, photo]) => photo.imageUrl === job?.imageUrl)?.[0];
    if (job?.kind !== 'LISTING_DRAFT' || !kind || recognized.has(kind) || !job.jobId) throw new Error('QA_AI_JOB_MISMATCH');
    stage = 'minimax-vision-' + kind;
    const draft = await recognizeListingImage(job.imageUrl, { authToken: qa.callbackToken });
    if (!(kind === 'lamp' ? /燈/ : /杯/).test(draft.name) || draft.estimatedPriceLowTwd === null ||
      draft.estimatedPriceHighTwd < draft.estimatedPriceLowTwd) throw new Error('QA_AI_DRAFT_UNGROUNDED');
    stage = 'minimax-callback-' + kind;
    await json(base + '/internal/minimax-vision/' + job.jobId + '/result', { method: 'POST',
      headers: { ...worker, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED', result: draft }) }, 204);
    const photo = classified.get(kind);
    const serverDraft = await json(base + '/listing-media/' + photo.id + '/ai-draft', { headers: owner });
    if (serverDraft.status !== 'COMPLETED' || serverDraft.draft?.title !== draft.name) throw new Error('QA_AI_CALLBACK_MISSING');
    recognized.set(kind, draft);
  }
  stage = 'native-ai-result';
  await waitWithScroll('AI 草稿已完成，請確認');
  await waitWithScroll('AI 二手參考價：', false);
  const screen = await dump();
  const draft = recognized.get('lamp');
  const expectedPrice = `NT$ ${draft.estimatedPriceLowTwd}–${draft.estimatedPriceHighTwd}`;
  if (!screen.includes(expectedPrice)) throw new Error('QA_NATIVE_PRICE_MISSING');
  await shot('ai-draft');
  if (twoPhotos) {
    stage = 'native-second-ai-result';
    await waitWithScroll('第2件商品名稱');
    const mug = recognized.get('mug');
    const mugPrice = `NT$ ${mug.estimatedPriceLowTwd}–${mug.estimatedPriceHighTwd}`;
    const secondDeadline = Date.now() + 35_000;
    let secondVisible = false;
    while (Date.now() < secondDeadline && !stopping) {
      const mugScreen = await dump();
      if (mugScreen.includes(escapeXml(mug.name)) && mugScreen.includes(mugPrice)) { secondVisible = true; break; }
      await sleep(1200);
    }
    if (!secondVisible) {
      await shot('second-pending');
      throw new Error('QA_NATIVE_SECOND_AI_MISSING');
    }
    await shot('ai-second-draft');
  }
  if ((await json(base + '/listings')).items?.length !== 0) throw new Error('QA_PRECONFIRM_PUBLICATION');
  if (twoPhotos) {
    stage = 'native-two-restore-before-edit';
    await tapLabel('稍後繼續');
    await waitNode('刊登好物');
    await tapLabel('刊登好物');
    await waitNode('連續拍照刊登');
    await waitWithScroll('第1件商品名稱');
    if (!(await dump()).includes(draft.name)) throw new Error('QA_NATIVE_FIRST_NOT_RESTORED');
  }
  stage = 'native-edit';
  await waitWithScroll('第1件商品名稱');
  await shot('pre-edit');
  await tapInputAboveKeyboard('第1件商品名稱');
  await adb(['shell', 'input', 'keyevent', '123']); // Move to end of this synthetic title.
  await adb(['shell', 'input', 'text', 'NativeQA']);
  if (!findNode(await dump(), '連續拍照刊登')) throw new Error('QA_EDITOR_CLOSED_UNEXPECTEDLY');
  await shot('edited');
  const editedTitle = draft.name + 'NativeQA';
  let editedSaved = false;
  const editDeadline = Date.now() + 18_000;
  while (Date.now() < editDeadline && !stopping) {
    const media = await json(base + '/listing-media/unused', { headers: owner });
    if (media.items?.length !== (twoPhotos ? 2 : 1)) throw new Error('QA_EDIT_PRIVATE_MEDIA');
    const lamp = media.items.find(item => item.id === classified.get('lamp').id);
    report.editObserved = media.items.map(item => ({ fixture: item.id === classified.get('lamp').id ? 'lamp' : 'mug',
      title: item.sellerDraft?.form?.title ?? null, version: item.sellerDraftVersion }));
    if (lamp?.sellerDraft?.form?.title === editedTitle && lamp.sellerDraftVersion >= 1) {
      editedSaved = true; break;
    }
    await sleep(800);
  }
  if (!editedSaved) throw new Error('QA_NATIVE_EDIT_NOT_SAVED');
  stage = 'native-edit-close';
  await tapLabel('稍後繼續');
  const closeDeadline = Date.now() + 45_000;
  let closed = false;
  while (Date.now() < closeDeadline && !stopping) {
    const screenAfterClose = await dump();
    if (findNode(screenAfterClose, '刊登好物') && !findNode(screenAfterClose, '連續拍照刊登')) { closed = true; break; }
    await sleep(900);
  }
  if (!closed) throw new Error('QA_CLOSE_MISSING');
  stage = 'native-edit-reopen';
  let reopened = false;
  for (let attempt = 0; attempt < 2 && !reopened && !stopping; attempt++) {
    await tapLabel('刊登好物');
    const openDeadline = Date.now() + 12_000;
    while (Date.now() < openDeadline) {
      if (findNode(await dump(), '連續拍照刊登')) { reopened = true; break; }
      await sleep(900);
    }
  }
  if (!reopened) throw new Error('QA_REOPEN_MISSING');
  stage = 'native-edit-resume';
  await waitWithScroll('第1件商品名稱');
  if (!(await dump()).includes(editedTitle)) throw new Error('QA_NATIVE_EDIT_NOT_RESTORED');
  if (twoPhotos) {
    await waitWithScroll('第2件商品名稱');
    if (!(await dump()).includes(recognized.get('mug').name)) throw new Error('QA_NATIVE_SECOND_NOT_RESTORED');
  }
  if ((await json(base + '/listings')).items?.length !== 0) throw new Error('QA_PRECONFIRM_PUBLICATION');
  report.ai = { status: 'COMPLETED', items: [...recognized].map(([fixture, result]) => ({ fixture, name: result.name,
    referencePriceTwd: [result.estimatedPriceLowTwd, result.estimatedPriceHighTwd] })),
    nativePriceVisible: true, sellerEditRestored: true, unpublishedUntilConfirmation: true, ownerOnly: true };
  if (mode === '--publish-one') {
    stage = 'native-publish-form';
    // Reopening intentionally clears precise location and consent. Enter only
    // synthetic QA values through the native form, never via a test-only API.
    await tapLabel('稍後繼續');
    await waitNode('刊登好物');
    await tapLabel('刊登好物');
    await waitNode('連續拍照刊登');
    await fillVisibleInput('縣市', 'QA_Taipei', 'county');
    await fillVisibleInput('行政區', 'QA_Zhongshan', 'district');
    await fillVisibleInput('位置緯度', '25.052349', 'latitude');
    await fillVisibleInput('位置經度', '121.523456', 'longitude');
    await tapVisibleWithScroll('我確認資料屬實並同意公開照片與約略位置', false);
    await waitNode('☑ 我確認資料屬實並同意公開照片與約略位置');
    const saved = await json(base + '/listing-media/unused', { headers: owner });
    const lampForm = saved.items?.find(item => item.id === classified.get('lamp').id)?.sellerDraft?.form;
    if (lampForm?.title !== editedTitle || !lampForm.description ||
      !/^\d+(?:\.\d{1,2})?$/.test(lampForm.price || '')) throw new Error('QA_SELLER_DRAFT_INCOMPLETE');
    stage = 'native-confirm-one';
    await tapVisibleWithScroll('我已逐欄確認第 1 件商品的照片、內容及售價', false);
    await waitNode('☑ 我已逐欄確認第 1 件商品的照片、內容及售價');
    if ((await json(base + '/listings')).items?.length !== 0) throw new Error('QA_PRECONFIRM_PUBLICATION');
    await shot('pre-publish');
    stage = 'native-publish-one';
    await tapVisibleWithScroll('刊登已逐件確認的商品（1）');
    let listing;
    const publishDeadline = Date.now() + 30_000;
    while (Date.now() < publishDeadline && !stopping) {
      const publicResult = await json(base + '/listings');
      if (publicResult.items?.length > 1) throw new Error('QA_TOO_MANY_PUBLIC_LISTINGS');
      if (publicResult.items?.length === 1) { listing = publicResult.items[0]; break; }
      await sleep(900);
    }
    if (listing?.status !== 'ACTIVE' || listing.title !== editedTitle ||
      listing.ownerUserId !== qa.actors.buyer.id || listing.media?.length !== 1 ||
      listing.media[0].id !== classified.get('lamp').id ||
      Number(listing.price) !== Number(lampForm.price)) throw new Error('QA_WRONG_ITEM_PUBLISHED');
    if (listing.expiryMode !== 'DEFAULT_30_DAYS' || listing.location?.precisionMeters !== 2200 ||
      listing.location.publicLatitude === 25.052349 || listing.location.publicLongitude === 121.523456)
      throw new Error('QA_PUBLICATION_PRIVACY_OR_EXPIRY');
    const remaining = await json(base + '/listing-media/unused', { headers: owner });
    if (remaining.items?.length !== 1 || remaining.items[0].id !== classified.get('mug').id)
      throw new Error('QA_UNCONFIRMED_ITEM_NOT_PRIVATE');
    const publishedImage = await fetch(classified.get('lamp').imageUrl, { signal: AbortSignal.timeout(15_000) });
    const privateImage = await fetch(classified.get('mug').imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (publishedImage.status !== 200 || privateImage.status !== 404) throw new Error('QA_PUBLICATION_IMAGE_ACCESS');
    await publishedImage.arrayBuffer();
    await shot('published');
    report.publication = { publicCount: 1, publishedFixture: 'lamp', askingPriceTwd: Number(lampForm.price),
      remainingPrivateFixture: 'mug', approximateLocationOnly: true, expiryMode: 'DEFAULT_30_DAYS' };
  }
  report.passed = true;
}

(async () => {
  try { await main(); } catch (error) {
    report.failedStage = stage;
    report.failure = nativeQaFailureCode(error);
    if (launched) try {
      const xml = await dump();
      report.uiMarkers = { notice: !!findNode(xml, '我了解，繼續使用'), login: !!findNode(xml, '手機號碼或 Email'),
        account: !!findNode(xml, '我的'), listingEntry: !!findNode(xml, '刊登好物'),
        composer: !!findNode(xml, '連續拍照刊登'), draftCount: !!findNode(xml, '商品草稿 1/12'),
        recoveryError: xml.includes('暫時無法安全恢復先前的商品照片'),
        picker: !!findNode(xml, 'Photos') || !!findNode(xml, '相片') };
      await shot('failure');
    } catch { report.uiMarkers = { unavailable: true }; }
  }
  let cleanupFailed = false;
  if (launched) try { await adb(['shell', 'am', 'force-stop', packageName], 10_000); } catch { cleanupFailed = true; }
  for (const ownedPath of galleryAdded) try {
    await adb(['shell', 'rm', ownedPath], 10_000);
    await adb(['shell', 'test', '!', '-e', ownedPath], 10_000);
    await adb(['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + ownedPath]);
  } catch { cleanupFailed = true; }
  for (const endpoint of reverses.reverse()) try { await adb(['reverse', '--remove', endpoint], 10_000); } catch { cleanupFailed = true; }
  if (metro && metro.exitCode === null) metro.kill('SIGTERM');
  if (metroExit) await metroExit;
  if (qa) try { report.cleanup = await qa.stop(); } catch { cleanupFailed = true; }
  try { await adb(['shell', 'rm', uiPath], 10_000); } catch { /* Exact dump may not exist. */ }
  report.passed = report.passed && !cleanupFailed && !stopping && !!report.cleanup && Object.values(report.cleanup).every(value => value === 0);
  report.stage = report.passed ? 'complete' : cleanupFailed ? 'cleanup-failed' : report.failedStage || stage;
  if (await fs.stat(evidence).then(stat => stat.isDirectory()).catch(() => false))
    await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      .catch(() => { report.passed = false; report.stage = 'report-failed'; });
  console.log(JSON.stringify({ kind: report.kind, passed: report.passed, stage: report.stage,
    evidenceDirectory: evidence, pickerMarkers: report.pickerMarkers, selectionMarkers: report.selectionMarkers, ai: report.ai,
    screenshots: report.screenshots.length,
    cleanup: report.cleanup, failure: report.failure, uiMarkers: report.uiMarkers, editObserved: report.editObserved,
    publication: report.publication, interruption: report.interruption, formInputs: report.formInputs }));
  if (!report.passed) process.exitCode = 1;
})().catch(() => { console.error('Isolated Android listing AI QA could not complete; private input withheld'); process.exitCode = 1; });
