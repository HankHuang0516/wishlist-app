// Supervised Android-only native listing AI smoke with one owned synthetic photo.
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
const { assignedSerial, hostEnvironment, metroArguments, METRO_PORT, qaLabel, qaPackage } = require('./android-qa-config.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

const runFile = promisify(execFile);
const mobile = path.resolve(__dirname, '..');
const label = qaLabel(process.argv[2]);
const mode = process.argv[3];
if (!['--inspect-picker', '--inspect-selection', '--recognize-one'].includes(mode) || process.argv.length !== 4) throw new Error('Explicit QA mode required');
const serial = assignedSerial(process.env);
const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (process.env.DATABASE_URL !== database) throw new Error('Matching isolated QA database required');
const packageName = qaPackage(label);
const runId = randomUUID();
const evidence = path.join(mobile, 'build', 'android-listing-ai-' + runId);
const uiPath = `/sdcard/wishlist-listing-ai-${runId}.xml`;
const galleryPath = `/sdcard/Pictures/wishlist-listing-ai-${runId}.png`;
const fixturePath = path.join(mobile, 'qa-fixtures', 'synthetic-used-orange-desk-lamp.png');
const fixtureHash = 'abdaabda6b85bd4037f976638b4b93faf6702c9e1ab0997809e7fa18b4468ab0';
const apk = path.join(mobile, 'build', `android-batch-qa-${label}`, 'app.apk');
const priorPath = path.join(mobile, 'build', 'android-external-map-a6cc02cd-b5da-427c-bf89-287167d87f5b', 'result.json');
const adbPath = '/Users/hank/Library/Android/sdk/platform-tools/adb';
const aaptPath = '/Users/hank/Library/Android/sdk/build-tools/36.0.0/aapt2';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = async (args, timeout = 20_000) => (await runFile(adbPath, ['-s', serial, ...args], { timeout, maxBuffer: 4 * 1024 * 1024 })).stdout;
const adbBytes = async (args, timeout = 20_000) => (await runFile(adbPath, ['-s', serial, ...args],
  { timeout, encoding: 'buffer', maxBuffer: 15 * 1024 * 1024 })).stdout;
let qa, metro, metroExit, stage = 'preflight', launched = false, galleryAdded = false, stopping = false;
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
async function waitWithScroll(label, exact = true) {
  for (let attempt = 0; attempt < 8 && !stopping; attempt++) {
    const node = findNode(await dump(), label, exact);
    if (node) return node;
    await swipeUp(); await sleep(900);
  }
  throw new Error('QA_SCROLLED_CONTROL_MISSING');
}
async function shot(name) {
  if (!['picker', 'selected', 'ai-draft'].includes(name)) throw new Error('QA_SHOT_NAME');
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
  const packages = (await adb(['shell', 'pm', 'list', 'packages', '-u', packageName])).split(/\r?\n/).map(line => line.trim());
  if (!packages.includes('package:' + packageName)) throw new Error('QA_PACKAGE_NOT_OWNED');
}
async function main() {
  await preflight();
  await fs.mkdir(evidence, { mode: 0o700 });
  await freeMetroPort();
  stage = 'fixture'; qa = await startNativeQa(database, 600, { listingAiPilot: true });
  const environment = hostEnvironment(process.execPath, '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/Users/hank/Library/Android/sdk', os.homedir());
  stage = 'metro';
  metro = spawn(process.execPath, metroArguments(mobile), { cwd: mobile,
    env: { ...environment, EXPO_PUBLIC_API_URL: qa.apiUrl }, stdio: ['ignore', 'ignore', 'ignore'] });
  metroExit = new Promise(resolve => { metro.once('exit', resolve); metro.once('error', () => resolve(-1)); });
  await metroReady();
  stage = 'reverse'; await reverse(Number(new URL(qa.apiUrl).port)); await reverse(METRO_PORT);
  stage = 'gallery';
  await adb(['push', fixturePath, galleryPath], 30_000); galleryAdded = true;
  await adb(['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + galleryPath]);
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
  stage = 'composer'; await tapLabel('我的'); await tapLabel('刊登好物');
  await waitNode('連續拍照刊登');
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
  if (mode === '--inspect-picker') { report.passed = true; return; }
  // The private QA emulator was visually inspected at 320x640. Fail closed
  // if the picker layout changes or the first tile lacks the fixture's orange lamp.
  const { data: pixels, info } = await sharp(path.join(evidence, 'picker.png')).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 320 || info.height !== 640 || info.channels < 3) throw new Error('QA_PICKER_LAYOUT_CHANGED');
  let orangePixels = 0;
  for (let y = 422; y < 529; y++) for (let x = 0; x < 106; x++) {
    const offset = (y * info.width + x) * info.channels;
    const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
    if (red > 100 && green > 40 && green < 170 && red > green * 1.25 && green > blue * 1.2) orangePixels++;
  }
  report.pickerMarkers.orangeFixtureVerified = orangePixels > 300;
  if (!report.pickerMarkers.orangeFixtureVerified || !report.pickerMarkers.photoTab) throw new Error('QA_PICKER_FIXTURE_NOT_VISIBLE');
  stage = 'selection';
  await adb(['shell', 'input', 'tap', '53', '474']);
  await sleep(2500);
  await shot('selected');
  const selected = await dump();
  report.selectionMarkers = { composer: !!findNode(selected, '連續拍照刊登'),
    addButton: !!findNode(selected, 'Add', false) || !!findNode(selected, '新增', false),
    doneButton: !!findNode(selected, 'Done'), selectedCount: selected.includes('1 selected') || selected.includes('已選取 1') };
  if (mode === '--inspect-selection') { report.passed = true; return; }
  if (!report.selectionMarkers.doneButton) throw new Error('QA_PICKER_CONFIRM_MISSING');
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
  let photo;
  const uploadDeadline = Date.now() + 45_000;
  while (Date.now() < uploadDeadline && !stopping) {
    const unused = await json(base + '/listing-media/unused', { headers: owner });
    if (unused.items?.length === 1) { photo = unused.items[0]; break; }
    if (unused.items?.length > 1) throw new Error('QA_UNEXPECTED_PRIVATE_MEDIA');
    await sleep(1200);
  }
  if (!photo?.id || !photo.imageUrl) throw new Error('QA_UPLOAD_MISSING');
  const ownerImage = await fetch(photo.imageUrl, { headers: owner, signal: AbortSignal.timeout(15_000) });
  const anonymousImage = await fetch(photo.imageUrl, { signal: AbortSignal.timeout(15_000) });
  const otherImage = await fetch(photo.imageUrl, { headers: outsider, signal: AbortSignal.timeout(15_000) });
  if (ownerImage.status !== 200 || anonymousImage.status !== 404 || otherImage.status !== 404) throw new Error('QA_PRIVATE_IMAGE_ACCESS');
  await ownerImage.arrayBuffer();
  const queued = await json(base + '/listing-media/' + photo.id + '/ai-draft', { headers: owner });
  if (!['PENDING', 'PROCESSING'].includes(queued.status)) throw new Error('QA_AI_NOT_QUEUED');
  if ((await json(base + '/listings')).items?.length !== 0) throw new Error('QA_PRECONFIRM_PUBLICATION');
  stage = 'minimax-claim';
  const worker = { Authorization: 'Bearer ' + qa.callbackToken };
  let job;
  const claimDeadline = Date.now() + 20_000;
  while (Date.now() < claimDeadline && !stopping) {
    const response = await fetch(base + '/internal/minimax-vision/next', { headers: worker, signal: AbortSignal.timeout(15_000) });
    if (response.status === 200) { job = await response.json(); break; }
    if (response.status !== 204) throw new Error('QA_AI_CLAIM_' + response.status);
    await sleep(900);
  }
  if (job?.kind !== 'LISTING_DRAFT' || job.imageUrl !== photo.imageUrl || !job.jobId) throw new Error('QA_AI_JOB_MISMATCH');
  stage = 'minimax-vision';
  const { recognizeListingImage } = await import('../../tools/minimax-vision-bridge/server.mjs');
  const draft = await recognizeListingImage(job.imageUrl, { authToken: qa.callbackToken });
  if (!/燈/.test(draft.name) || draft.estimatedPriceLowTwd === null ||
    draft.estimatedPriceHighTwd < draft.estimatedPriceLowTwd) throw new Error('QA_AI_DRAFT_UNGROUNDED');
  stage = 'minimax-callback';
  await json(base + '/internal/minimax-vision/' + job.jobId + '/result', { method: 'POST',
    headers: { ...worker, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'COMPLETED', result: draft }) }, 204);
  const serverDraft = await json(base + '/listing-media/' + photo.id + '/ai-draft', { headers: owner });
  if (serverDraft.status !== 'COMPLETED' || serverDraft.draft?.title !== draft.name) throw new Error('QA_AI_CALLBACK_MISSING');
  stage = 'native-ai-result';
  await waitWithScroll('AI 草稿已完成，請確認');
  await waitWithScroll('AI 二手參考價：', false);
  const screen = await dump();
  const expectedPrice = `NT$ ${draft.estimatedPriceLowTwd}–${draft.estimatedPriceHighTwd}`;
  if (!screen.includes(expectedPrice)) throw new Error('QA_NATIVE_PRICE_MISSING');
  await shot('ai-draft');
  if ((await json(base + '/listings')).items?.length !== 0) throw new Error('QA_PRECONFIRM_PUBLICATION');
  stage = 'native-edit';
  await tap(await waitWithScroll('第1件商品名稱'));
  await adb(['shell', 'input', 'keyevent', '123']); // Move to end of this synthetic title.
  await adb(['shell', 'input', 'text', 'NativeQA']);
  if (!findNode(await dump(), '連續拍照刊登')) throw new Error('QA_EDITOR_CLOSED_UNEXPECTEDLY');
  const editedTitle = draft.name + 'NativeQA';
  let editedSaved = false;
  const editDeadline = Date.now() + 18_000;
  while (Date.now() < editDeadline && !stopping) {
    const media = await json(base + '/listing-media/unused', { headers: owner });
    if (media.items?.length !== 1) throw new Error('QA_EDIT_PRIVATE_MEDIA');
    if (media.items[0].sellerDraft?.form?.title === editedTitle && media.items[0].sellerDraftVersion >= 1) {
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
  if ((await json(base + '/listings')).items?.length !== 0) throw new Error('QA_PRECONFIRM_PUBLICATION');
  report.ai = { status: 'COMPLETED', name: draft.name, referencePriceTwd: [draft.estimatedPriceLowTwd, draft.estimatedPriceHighTwd],
    nativePriceVisible: true, sellerEditRestored: true, unpublished: true, ownerOnly: true };
  report.passed = true;
}

(async () => {
  try { await main(); } catch (error) {
    report.failedStage = stage;
    report.failure = /^QA_[A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'QA_ASSERTION_FAILED';
    if (launched) try {
      const xml = await dump();
      report.uiMarkers = { notice: !!findNode(xml, '我了解，繼續使用'), login: !!findNode(xml, '手機號碼或 Email'),
        account: !!findNode(xml, '我的'), listingEntry: !!findNode(xml, '刊登好物'),
        composer: !!findNode(xml, '連續拍照刊登'), draftCount: !!findNode(xml, '商品草稿 1/12'),
        recoveryError: xml.includes('暫時無法安全恢復先前的商品照片'),
        picker: !!findNode(xml, 'Photos') || !!findNode(xml, '相片') };
    } catch { report.uiMarkers = { unavailable: true }; }
  }
  let cleanupFailed = false;
  if (launched) try { await adb(['shell', 'am', 'force-stop', packageName], 10_000); } catch { cleanupFailed = true; }
  if (galleryAdded) try {
    await adb(['shell', 'rm', galleryPath], 10_000);
    await adb(['shell', 'test', '!', '-e', galleryPath], 10_000);
    await adb(['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + galleryPath]);
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
    cleanup: report.cleanup, failure: report.failure, uiMarkers: report.uiMarkers }));
  if (!report.passed) process.exitCode = 1;
})().catch(() => { console.error('Isolated Android listing AI QA could not complete; private input withheld'); process.exitCode = 1; });
