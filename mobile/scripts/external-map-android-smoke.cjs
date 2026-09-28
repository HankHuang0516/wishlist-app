// Device workload: run only through Simulator Manager with its assigned serial.
// Uses an existing, distinct-package Debug APK and fresh Metro JS. No store
// package, production account, provider secret or other app data is reset.
// Usage: node external-map-android-smoke.cjs <12-digit QA APK label>
//        [--wish-banner-only | --reuse-owned-qa <previous owned run UUID>]
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { startNativeQa } = require('./native-qa.cjs');
const { MARKETPLACE_FIXTURE, VISUAL_MARKETPLACE_FIXTURE, CHAT_VISUAL_MESSAGES, seedNativeMarketplace } = require('./native-qa-marketplace-fixture.cjs');
const { assignedSerial, hostEnvironment, metroArguments, METRO_PORT, qaLabel, qaPackage } = require('./android-qa-config.cjs');
const { androidQaSources } = require('./android-qa-sources.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

const runFile = promisify(execFile);
const mobile = path.resolve(__dirname, '..');
const sourceLabel = qaLabel(process.argv[2]);
const packageName = qaPackage(sourceLabel);
const wishBannerOnly = process.argv[3] === '--wish-banner-only';
const priorId = process.argv[3] === '--reuse-owned-qa' ? process.argv[4] : null;
const managementOnly = process.env.NATIVE_QA_MANAGE_ONLY === '1' || process.argv[5] === '--manage-only';
const meetupOnly = process.env.NATIVE_QA_MEETUP_ONLY === '1';
const chatOnly = process.env.NATIVE_QA_CHAT_ONLY === '1' || meetupOnly;
const removalOnly = process.env.NATIVE_QA_REMOVE_ONLY === '1';
const requestedFontScale = process.env.NATIVE_QA_FONT_SCALE ?? null;
const visualFixture = process.env.NATIVE_QA_VISUAL_FIXTURE ?? null;
const visualOnly = visualFixture === 'visual-mug';
const singleMapOnly = process.env.NATIVE_QA_SINGLE_MAP_ONLY === '1';
if (process.argv[3] && !wishBannerOnly && (!priorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(priorId)))
  throw new Error('Exact prior owned QA report required');
if (wishBannerOnly && (process.argv[4] || process.argv[5])) throw new Error('Wish banner QA requires a fresh package');
if (process.argv[5] && process.argv[5] !== '--manage-only') throw new Error('Unknown QA mode');
if (process.env.NATIVE_QA_MANAGE_ONLY !== undefined && process.env.NATIVE_QA_MANAGE_ONLY !== '1') throw new Error('Unknown QA mode');
if (process.env.NATIVE_QA_CHAT_ONLY !== undefined && process.env.NATIVE_QA_CHAT_ONLY !== '1') throw new Error('Unknown QA mode');
if (process.env.NATIVE_QA_MEETUP_ONLY !== undefined && process.env.NATIVE_QA_MEETUP_ONLY !== '1') throw new Error('Unknown QA mode');
if (meetupOnly && process.env.NATIVE_QA_CHAT_ONLY === '1') throw new Error('Meetup QA requires its own isolated mode');
if (chatOnly && (managementOnly || wishBannerOnly || removalOnly || visualFixture || requestedFontScale && !meetupOnly)) throw new Error('Chat QA requires its own isolated mode');
if (process.env.NATIVE_QA_REMOVE_ONLY !== undefined && process.env.NATIVE_QA_REMOVE_ONLY !== '1') throw new Error('Unknown QA mode');
if (removalOnly && !managementOnly) throw new Error('Removal QA requires management-only mode');
if (requestedFontScale && (requestedFontScale !== '1.5' || !(managementOnly || meetupOnly))) throw new Error('Unsupported QA font scale');
if (visualFixture && (!visualOnly || !managementOnly || removalOnly || wishBannerOnly)) throw new Error('Unsupported visual QA fixture');
if (process.env.NATIVE_QA_SINGLE_MAP_ONLY !== undefined && !singleMapOnly) throw new Error('Unsupported single-map QA mode');
if (singleMapOnly && (wishBannerOnly || managementOnly || chatOnly || removalOnly || visualFixture || requestedFontScale))
  throw new Error('Single-map QA requires one isolated external listing and standard font scale');
const debugBuild = path.join(mobile, 'build', `android-debug-qa-${sourceLabel}`);
const debugApk = path.join(debugBuild, 'app.apk');
const legacyApk = path.join(mobile, 'build', `android-batch-qa-${sourceLabel}`, 'app.apk');
let apk;
const adbPath = '/Users/hank/Library/Android/sdk/platform-tools/adb';
const aaptPath = '/Users/hank/Library/Android/sdk/build-tools/36.0.0/aapt2';
const serial = assignedSerial(process.env);
const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (process.env.DATABASE_URL !== database) throw new Error('Explicit identical isolated test database required');
const runId = randomUUID();
const evidence = path.join(mobile, 'build', 'android-external-map-' + runId);
const uiPath = `/sdcard/wishlist-external-map-${runId}.xml`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = async (args, timeout = 20_000) => (await runFile(adbPath, ['-s', serial, ...args],
  { timeout, maxBuffer: 4 * 1024 * 1024 })).stdout;
const adbBytes = async (args, timeout = 20_000) => (await runFile(adbPath, ['-s', serial, ...args],
  { timeout, encoding: 'buffer', maxBuffer: 15 * 1024 * 1024 })).stdout;
let qa, metro, metroExit, installed = false, stage = 'preflight', passed = false, stopping = false;
let originalFontScale = null, fontScaleActiveVerified = false, fontScaleRestored = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; });
const reverses = [];
const result = { kind: 'isolated-android-external-map-smoke', passed: false, stage: null,
  mode: singleMapOnly ? 'single-map' : wishBannerOnly ? 'wish-banner-only' : meetupOnly ? 'meetup-only' : chatOnly ? 'chat-only' : visualOnly ? 'visual-seller' : managementOnly ? 'management-only' : 'full-map',
  visualFixture,
  package: packageName, sourceLabel, evidenceDirectory: evidence, screenshots: [], cleanup: null };

function xmlNodes(xml) { return xml.match(/<node\b[^>]*>/g) || []; }
function xmlEscape(value) { return value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]); }
function nodeWith(xml, label, exact = true) {
  const term = xmlEscape(label);
  return xmlNodes(xml).find(node => ['text', 'content-desc'].some(key =>
    exact ? node.includes(`${key}="${term}"`) : node.includes(`${key}="`) && node.includes(term))) || null;
}
async function dump() {
  await adb(['shell', 'uiautomator', 'dump', uiPath], 30_000);
  return adb(['exec-out', 'cat', uiPath]);
}
async function assertQaForeground() {
  if (!requestedFontScale && !visualOnly && !singleMapOnly) return;
  const state = await adb(['shell', 'dumpsys', 'activity', 'activities'], 10_000);
  const top = state.match(/^\s*topResumedActivity=([^\n]+)/m)?.[1];
  if (!top?.includes(packageName + '/')) throw new Error('QA package is not foreground');
}
async function waitNode(label, { exact = true, timeout = 35_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !stopping) {
    const node = nodeWith(await dump(), label, exact);
    if (node) return node;
    await sleep(900);
  }
  throw new Error('Required UI control missing at ' + stage);
}
async function waitExternalPhotoReady(timeout = 35_000) {
  const deadline = Date.now() + timeout;
  const readyLabels = ['來源商品圖片', '來源商品圖片，縮圖已載入', '來源商品圖片，顯示縮圖'];
  while (Date.now() < deadline && !stopping) {
    const screen = await dump();
    const ready = readyLabels.find(label => nodeWith(screen, label, true));
    if (ready) { result.externalPhotoReadyLabel = ready; return; }
    if (nodeWith(screen, '來源商品圖片無法載入', true))
      throw new Error('External product photo and thumbnail both failed to load');
    await sleep(900);
  }
  throw new Error('External product photo did not finish loading at ' + stage);
}
async function waitHierarchyContains(label, timeout = 35_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !stopping) {
    if ((await dump()).includes(xmlEscape(label))) return;
    await sleep(900);
  }
  throw new Error('Required accessible hierarchy text missing at ' + stage);
}
async function waitEnabledNode(label, timeout = 35_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !stopping) {
    const node = nodeWith(await dump(), label);
    if (node?.includes('enabled="true"')) return node;
    await sleep(900);
  }
  throw new Error('Enabled UI control missing at ' + stage);
}
async function tap(node) {
  await assertQaForeground();
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) throw new Error('UI control bounds missing at ' + stage);
  await adb(['shell', 'input', 'tap', String(Math.floor((+bounds[1] + +bounds[3]) / 2)),
    String(Math.floor((+bounds[2] + +bounds[4]) / 2))]);
}
async function tapLabel(label) {
  const term = xmlEscape(label), deadline = Date.now() + 35_000;
  while (Date.now() < deadline && !stopping) {
    const nodes = xmlNodes(await dump());
    const control = nodes.find(node => node.includes(`content-desc="${term}"`) && node.includes('clickable="true"')) ||
      nodes.find(node => node.includes(`content-desc="${term}"`)) ||
      nodes.find(node => node.includes(`text="${term}"`) && node.includes('clickable="true"')) ||
      nodes.find(node => node.includes(`text="${term}"`));
    if (control) return tap(control);
    await sleep(900);
  }
  throw new Error('Tappable UI control missing at ' + stage);
}
async function replaceSearchText(value) {
  const field = await waitNode('搜尋商品名稱與說明');
  const current = field.match(/\btext="([^"]*)"/)?.[1] ?? '';
  await tap(field);
  await sleep(350);
  await adb(['shell', 'input', 'keyevent', '123']);
  for (let index = 0; index < current.length; index++) await adb(['shell', 'input', 'keyevent', '67']);
  await sleep(250);
  await adb(['shell', 'input', 'text', value]);
  const updated = await waitNode('搜尋商品名稱與說明');
  if (!updated.includes(`text="${value}"`)) throw new Error('Synthetic search text not reflected');
}
async function swipeUp() {
  await assertQaForeground();
  const size = await adb(['shell', 'wm', 'size']);
  const dimensions = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!dimensions) throw new Error('Device size unavailable');
  const width = Number(dimensions[1]), height = Number(dimensions[2]);
  await adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * 0.82)),
    String(Math.floor(width / 2)), String(Math.floor(height * 0.22)), '360']);
}
async function swipeUpSmall() {
  await assertQaForeground();
  const size = await adb(['shell', 'wm', 'size']);
  const dimensions = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!dimensions) throw new Error('Device size unavailable');
  const width = Number(dimensions[1]), height = Number(dimensions[2]);
  await adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * 0.72)),
    String(Math.floor(width / 2)), String(Math.floor(height * 0.48)), '320']);
}
async function swipeDown() {
  await assertQaForeground();
  const size = await adb(['shell', 'wm', 'size']);
  const dimensions = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!dimensions) throw new Error('Device size unavailable');
  const width = Number(dimensions[1]), height = Number(dimensions[2]);
  await adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * 0.22)),
    String(Math.floor(width / 2)), String(Math.floor(height * 0.82)), '360']);
}
async function dismissDebugToast() {
  await assertQaForeground();
  // Expo's Debug-only warning banner can intercept controls immediately above
  // the navigation bar. This distinct-package QA shell never ships to Play.
  if (!(await dump()).includes('Open debugger to view warnings.')) return;
  const size = await adb(['shell', 'wm', 'size']);
  const dimensions = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!dimensions) throw new Error('Device size unavailable');
  await adb(['shell', 'input', 'tap', String(Number(dimensions[1]) - 29), String(Number(dimensions[2]) - 49)]);
}
async function waitWithScroll(label, exact = true, maxSwipes = 6) {
  for (let attempt = 0; attempt < maxSwipes; attempt++) {
    if (stopping) throw new Error('QA interrupted');
    if (stage.startsWith('pagination-')) result.paginationScrollAttempts = attempt + 1;
    const node = nodeWith(await dump(), label, exact);
    if (node) return node;
    if (requestedFontScale) await swipeUpSmall(); else await swipeUp();
    await sleep(800);
  }
  throw new Error('Scrollable UI control missing at ' + stage);
}
async function waitVisibleWithScroll(label, exact = true, maxSwipes = 6, top = 205, bottom = 565) {
  for (let attempt = 0; attempt < maxSwipes; attempt++) {
    if (stopping) throw new Error('QA interrupted');
    if (stage.startsWith('pagination-')) result.paginationScrollAttempts = attempt + 1;
    const node = nodeWith(await dump(), label, exact);
    const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds && Number(bounds[2]) >= top && Number(bounds[4]) <= bottom) return node;
    if (requestedFontScale) await swipeUpSmall(); else await swipeUp();
    await sleep(800);
  }
  throw new Error('Visible scrollable UI control missing at ' + stage);
}
async function tapVisibleLoginButton() {
  const size = await adb(['shell', 'wm', 'size']);
  const dimensions = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  const width = Number(dimensions?.[1]), height = Number(dimensions?.[2]);
  if (!Number.isSafeInteger(width) || width < 250 || !Number.isSafeInteger(height) || height < 500)
    throw new Error('Login viewport unavailable');
  for (let attempt = 0; attempt < 7; attempt++) {
    await assertQaForeground();
    const nodes = xmlNodes(await dump());
    const button = nodes.find(node => node.includes('content-desc="登入"') && node.includes('clickable="true"')) ||
      nodes.find(node => node.includes('text="登入"') && node.includes('clickable="true"'));
    const bounds = button?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds && Number(bounds[2]) >= 80 && Number(bounds[4]) <= height - 40) return tap(button);
    await adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * 0.72)),
      String(Math.floor(width / 2)), String(Math.floor(height * 0.48)), '320']);
    await sleep(550);
  }
  throw new Error('Visible login button unavailable at ' + stage);
}
async function focusVisibleLoginInput(label) {
  const size = await adb(['shell', 'wm', 'size']);
  const dimensions = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  const width = Number(dimensions?.[1]), height = Number(dimensions?.[2]);
  if (!Number.isSafeInteger(width) || width < 250 || !Number.isSafeInteger(height) || height < 500)
    throw new Error('Login viewport unavailable');
  for (let attempt = 0; attempt < 7; attempt++) {
    await assertQaForeground();
    const field = xmlNodes(await dump()).find(node => node.includes('class="android.widget.EditText"') &&
      node.includes(`content-desc="${xmlEscape(label)}"`));
    const bounds = field?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds && Number(bounds[2]) >= 80 && Number(bounds[4]) <= height - 65) {
      await tap(field);
      await sleep(450);
      const focused = xmlNodes(await dump()).some(node => node.includes('class="android.widget.EditText"') &&
        node.includes(`content-desc="${xmlEscape(label)}"`) && node.includes('focused="true"'));
      result.passwordFieldFocusedAfterTap = focused;
      return;
    }
    await adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * 0.72)),
      String(Math.floor(width / 2)), String(Math.floor(height * 0.48)), '320']);
    await sleep(550);
  }
  throw new Error('Visible login input unavailable');
}
async function tapVisibleWishBrowse(captureBefore = false) {
  // Android may expose off-screen ScrollView children in the accessibility
  // tree. Move the real control into view before tapping its reported bounds.
  await swipeUp();
  await sleep(450);
  const browseWish = await waitWithScroll('查附近符合商品');
  const bounds = browseWish.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds || Number(bounds[2]) < 90 || Number(bounds[4]) > 570)
    throw new Error('Wish browse control is outside the safe visible area');
  if (captureBefore) await screenshot('wish-before-explore');
  await tap(browseWish);
}
async function screenshot(name) {
  if (!/^(?:home|account|account-lower|chat-home|chat-explore-list|chat-detail|chat|chat-compose|meetup|chat-meetup-preview|meetup-summary-detail|chat-history-oldest|chat-history-attempt|social-inbox|external-map|multi-focused|external-list|pagination-footer|paged-list|paged-map|zero-results|search-focused|list-to-map|return-results|external-detail|single-map-default|single-map-list|single-map-selected|single-map-detail|wish-before-explore|wish-map|wish-explanation|wish-map-settled|wish-list|my-listings|my-listings-edit|my-listings-marketing-open|my-listings-edit-typed|my-listings-expiry|my-listings-extended|my-listings-reserved|my-listings-sold|my-listings-removed)$/.test(name)) throw new Error('Unsafe screenshot name');
  const target = path.join(evidence, name + '.png');
  await fs.writeFile(target, await adbBytes(['exec-out', 'screencap', '-p']), { flag: 'wx', mode: 0o600 });
  result.screenshots.push(target);
}
async function freeMetroPort() {
  await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', () => reject(new Error('Private Metro port occupied')));
    listener.listen(METRO_PORT, '127.0.0.1', () => listener.close(resolve));
  });
}
async function metroReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && metro.exitCode === null && !stopping) {
    try {
      const response = await fetch(`http://127.0.0.1:${METRO_PORT}/status`,
        { signal: AbortSignal.timeout(1200), redirect: 'error' });
      if (response.ok && await response.text() === 'packager-status:running') return;
    } catch { /* Bounded startup probe. */ }
    await sleep(300);
  }
  throw new Error('Private Metro unavailable');
}
async function reverse(port) {
  const endpoint = `tcp:${port}`;
  const existing = await adb(['reverse', '--list']);
  if (existing.split(/\r?\n/).some(line => line.trim().split(/\s+/).includes(endpoint)))
    throw new Error('Private reverse occupied');
  await adb(['reverse', endpoint, endpoint]); reverses.push(endpoint);
}
async function verifyApk() {
  const debugExists = await fs.stat(debugApk).then(stat => stat.isFile()).catch(() => false);
  const legacyExists = await fs.stat(legacyApk).then(stat => stat.isFile()).catch(() => false);
  if (debugExists === legacyExists) throw new Error('Exactly one isolated QA APK must match the label');
  apk = debugExists ? debugApk : legacyApk;
  result.buildKind = debugExists ? 'isolated-android-debug-qa' : 'legacy-android-batch-qa';
  const stat = await fs.stat(apk);
  if (!stat.isFile() || stat.size < 10_000_000) throw new Error('QA APK unavailable');
  const badging = (await runFile(aaptPath, ['dump', 'badging', apk], { timeout: 20_000, maxBuffer: 2_000_000 })).stdout;
  if (!badging.includes(`package: name='${packageName}'`) || !badging.includes('application-debuggable'))
    throw new Error('APK is not the isolated Debug identity');
  result.apkSha256 = createHash('sha256').update(await fs.readFile(apk)).digest('hex');
  if (debugExists) {
    const metadata = JSON.parse(await fs.readFile(path.join(debugBuild, 'build.json'), 'utf8'));
    const sources = androidQaSources(mobile, { includeInstrumentation: false });
    if (metadata.kind !== result.buildKind || metadata.label !== sourceLabel ||
      metadata.package !== packageName || metadata.metroPort !== METRO_PORT ||
      metadata.storeDeliverable !== false || metadata.instrumented !== false ||
      metadata.hashes?.app !== result.apkSha256 ||
      !Array.isArray(metadata.sourceFiles) || metadata.sourceFiles.join('\n') !== sources.join('\n'))
      throw new Error('Isolated Debug QA provenance mismatch');
    for (const source of sources) {
      const hash = createHash('sha256').update(await fs.readFile(path.join(mobile, source))).digest('hex');
      if (metadata.sourceHashes?.[source] !== hash) throw new Error('QA source changed since compilation');
    }
  }
  if (priorId) {
    const prior = JSON.parse(await fs.readFile(path.join(mobile, 'build', 'android-external-map-' + priorId, 'result.json'), 'utf8'));
    if (prior.kind !== result.kind || prior.package !== packageName || prior.sourceLabel !== sourceLabel ||
      (prior.buildKind ?? 'legacy-android-batch-qa') !== result.buildKind ||
      prior.apkSha256 !== result.apkSha256 || typeof prior.passed !== 'boolean' ||
      !prior.cleanup || Object.values(prior.cleanup).some(value => value !== 0))
      throw new Error('Prior owned QA receipt does not authorize reuse');
  }
}
async function managementSequence(alreadySeller) {
  if (!alreadySeller) {
    stage = 'my-listings-fixture';
    await seedNativeMarketplace(qa, 'seller', visualFixture ?? 'switch');
    stage = 'switch-to-seller';
    await dismissDebugToast();
    await tapLabel('我的');
    await waitNode('展開帳號安全');
    if (nodeWith(await dump(), '目前密碼')) throw new Error('Account security fields should be collapsed');
    await tapLabel('展開帳號安全');
    await waitNode('目前密碼');
    await tap(await waitWithScroll('登出此裝置'));
    await waitNode('手機號碼或 Email');
    await tapLabel('手機號碼或 Email');
    await adb(['shell', 'input', 'text', qa.actors.seller.phoneNumber]);
    await tapLabel('密碼');
    await adb(['shell', 'input', 'text', qa.actors.seller.password]);
    await adb(['shell', 'input', 'keyevent', '4']);
    await tapLabel('登入');
  }
  await waitNode('我的');
  await tapLabel('我的');
  if (visualOnly) {
    await waitNode('展開帳號安全');
    await waitNode('購買與訂閱操作暫停');
    await sleep(350);
    await screenshot('account');
    await swipeUp();
    await sleep(350);
    await screenshot('account-lower');
    await swipeDown();
  }
  stage = 'my-listings-entry';
  await tapLabel('我的商品 · 閱覽與管理');
  await waitNode('我的商品');
  await waitNode(visualOnly ? VISUAL_MARKETPLACE_FIXTURE.title : 'Native QA Switch OLED', { exact: false });
  await waitNode(visualOnly ? 'NT$ 50' : 'NT$ 7,500');
  await dismissDebugToast();
  await screenshot('my-listings');
  stage = 'my-listings-edit';
  await tapLabel('編輯資訊');
  if (visualOnly) {
    await waitWithScroll('編輯商品名稱');
    await waitWithScroll('編輯商品售價，新臺幣');
    await screenshot('my-listings-edit');
    stage = 'my-listings-marketing';
    await tap(await waitVisibleWithScroll('開啟行銷小助手 Beta', true, 10, 130, 565));
    await waitVisibleWithScroll('生成四張行銷圖', true, 10, 130, 565);
    await screenshot('my-listings-marketing-open');
    return;
  }
  await waitWithScroll('編輯商品名稱');
  await waitWithScroll('編輯商品說明');
  await waitWithScroll('編輯商品售價，新臺幣');
  await waitWithScroll('售價（NT$，0 代表免費贈送）');
  await screenshot('my-listings-edit');
  await tapLabel('編輯商品售價，新臺幣');
  await sleep(350);
  let corrected = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = nodeWith(await dump(), '編輯商品售價，新臺幣');
    const current = before?.match(/\btext="(\d{0,10})"/)?.[1];
    if (current === undefined) throw new Error('Synthetic price input unavailable');
    await adb(['shell', 'input', 'keyevent', '123']);
    for (let index = 0; index < current.length; index++) await adb(['shell', 'input', 'keyevent', '67']);
    await sleep(300);
    await adb(['shell', 'input', 'text', '7400']);
    await sleep(350);
    corrected = !!nodeWith(await dump(), '編輯商品售價，新臺幣')?.includes('text="7400"');
    if (corrected) break;
  }
  if (!corrected) throw new Error('Synthetic price input not reflected');
  await screenshot('my-listings-edit-typed');
  // The numeric keyboard's Done action blurs the field without closing the
  // management modal (Android Back would close the modal itself).
  await adb(['shell', 'input', 'keyevent', '66']);
  await tap(await waitWithScroll('儲存修改'));
  await waitNode('資料已更新', { exact: false });
  await waitNode('NT$ 7,400');
  stage = 'my-listings-expiry';
  await tapLabel('延長期限');
  await waitNode('OK');
  await screenshot('my-listings-expiry');
  await tapLabel('OK');
  await waitNode('確認延長刊登？');
  await tapLabel('確認延長');
  await waitNode('已延長至', { exact: false });
  await screenshot('my-listings-extended');
  if (removalOnly) {
    stage = 'my-listings-remove';
    await tapLabel('移除');
    await waitNode('確認移除商品？');
    await tapLabel('移除商品');
    await waitNode('已移除商品', { exact: false });
    await tapLabel('已移除 (1)');
    await waitNode('本頁「已移除」已載入 1 件', { exact: false });
    await waitNode('NT$ 7,400');
    await screenshot('my-listings-removed');
    return;
  }
  stage = 'my-listings-reserve';
  await tapLabel('查看詳情');
  if (requestedFontScale) await tap(await waitVisibleWithScroll('標記保留', true, 10, 210, 600));
  else await tapLabel('標記保留');
  await waitNode('確認標記已保留？');
  await tapLabel('標記已保留');
  await waitNode('已標記已保留', { exact: false });
  await tapLabel('已保留 (1)');
  await waitNode('Native QA Switch OLED', { exact: false });
  await screenshot('my-listings-reserved');
  stage = 'my-listings-release';
  if (requestedFontScale) await tap(await waitVisibleWithScroll('恢復在售', true, 10, 210, 600));
  else await tapLabel('恢復在售');
  await waitNode('確認恢復在售？');
  await tapLabel('恢復在售');
  await waitNode('已恢復在售', { exact: false });
  await tapLabel('在售 (1)');
  stage = 'my-listings-sold';
  if (requestedFontScale) await tap(await waitVisibleWithScroll('標記售出', true, 10, 210, 600));
  else await tapLabel('標記售出');
  await waitNode('確認標記已售出？');
  await tapLabel('標記已售出');
  await waitNode('已標記已售出', { exact: false });
  await tapLabel('已售出 (1)');
  // The page-count summary is intentionally shown only while another page
  // exists. The selected tab count and the item's own status are the stable
  // assertions for a fully loaded single-item sold list.
  await waitNode('已售出');
  await waitNode('NT$ 7,400');
  await screenshot('my-listings-sold');
}
async function chatSequence() {
  stage = 'chat-home-ready';
  await waitNode('探索');
  await screenshot('chat-home');
  stage = 'chat-toast-dismiss';
  await dismissDebugToast();
  stage = 'chat-tab-tap';
  await tapLabel('探索');
  stage = 'chat-list-control';
  await waitNode('切換清單');
  await tapLabel('切換清單');
  stage = 'chat-list-card';
  await waitNode(MARKETPLACE_FIXTURE.title, { exact: false });
  await screenshot('chat-explore-list');
  const card = await waitNode(MARKETPLACE_FIXTURE.title, { exact: false });
  result.chatCardBounds = card.match(/bounds="\[[^\]]+\]\[[^\]]+\]"/)?.[0] ?? null;
  result.chatCardClickable = card.includes('clickable="true"');
  await tap(card);
  stage = 'chat-detail-contact';
  await sleep(350);
  await screenshot('chat-detail');
  await dismissDebugToast();
  await tap(await waitVisibleWithScroll('聯絡賣家', true, 8, 80, 565));
  stage = 'chat-room';
  await waitNode('NT$7,500');
  await waitNode(CHAT_VISUAL_MESSAGES.at(-1).text);
  await waitEnabledNode('商品聊天訊息');
  await screenshot('chat');
  stage = 'chat-compose-tap';
  await tapLabel('商品聊天訊息');
  stage = 'chat-compose-type';
  await adb(['shell', 'input', 'text', 'NativeQAChatSmoke']);
  stage = 'chat-compose-check';
  await waitNode('NativeQAChatSmoke');
  stage = 'chat-send';
  const composeXml = await dump();
  const sendNode = nodeWith(composeXml, '傳送');
  const sendBounds = sendNode?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  const keyboardTop = Math.min(...xmlNodes(composeXml).filter(node => /package="(?:com\.google\.android\.inputmethod\.latin|com\.android\.inputmethod\.latin)"/.test(node))
    .map(node => Number(node.match(/bounds="\[\d+,(\d+)\]/)?.[1])).filter(Number.isFinite));
  result.chatSendButton = sendNode ? { enabled: sendNode.includes('enabled="true"'), clickable: sendNode.includes('clickable="true"'),
    bounds: sendBounds?.[0] ?? null, keyboardTop: Number.isFinite(keyboardTop) ? keyboardTop : null } : null;
  await screenshot('chat-compose');
  if (!sendNode || !sendNode.includes('enabled="true"') || !sendBounds || (Number.isFinite(keyboardTop) && Number(sendBounds[4]) > keyboardTop))
    throw new Error('Chat send control is unavailable above the keyboard');
  await tap(sendNode);
  stage = 'chat-sent';
  await waitNode('NativeQAChatSmoke');
  if (meetupOnly) {
    stage = 'meetup-open';
    await tapLabel('查看或提議面交預約');
    await waitNode('面交預約');
    await tapLabel('提出面交邀約');
    stage = 'meetup-place';
    let placeField = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const node = xmlNodes(await dump()).find(candidate => candidate.includes('class="android.widget.EditText"') && candidate.includes('content-desc="私密面交地點名稱"'));
      const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (bounds && Number(bounds[2]) >= 75 && Number(bounds[4]) <= 565) { placeField = node; break; }
      await swipeUpSmall(); await sleep(500);
    }
    if (!placeField) throw new Error('Meetup place field unavailable in safe viewport');
    await tap(placeField);
    await adb(['shell', 'input', 'text', 'TaipeiStationQA']);
    const edited = xmlNodes(await dump()).find(candidate => candidate.includes('class="android.widget.EditText"') && candidate.includes('content-desc="私密面交地點名稱"'));
    if (!edited?.includes('text="TaipeiStationQA"')) throw new Error('Meetup place text not reflected');
    await adb(['shell', 'input', 'keyevent', '66']);
    stage = 'meetup-submit-control';
    await tap(await waitVisibleWithScroll('提出此版本（改期需對方重新同意）', true, 10, 75, 565));
    stage = 'meetup-status';
    await waitNode('提議中', { exact: false });
    stage = 'meetup-version';
    await waitNode('第1版', { exact: false });
    stage = 'meetup-place-result';
    await waitHierarchyContains('TaipeiStationQA');
    await screenshot('meetup');
    stage = 'meetup-chat-preview';
    await tapLabel('返回聊天');
    if (requestedFontScale) {
      await waitHierarchyContains('提議中');
      await waitHierarchyContains('TaipeiStationQA');
    } else {
      await waitHierarchyContains('面交預約 · 提議中');
      await waitHierarchyContains('TaipeiStationQA');
      await waitNode('查看面交預約詳情並確認或調整');
    }
    await dismissDebugToast();
    if ((await dump()).includes('Open debugger to view warnings.')) throw new Error('Debug overlay still covers meetup preview');
    await screenshot('chat-meetup-preview');
    const refreshControl = nodeWith(await dump(), '更新聊天');
    const refreshBounds = refreshControl?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!refreshControl?.includes('clickable="true"') || !refreshBounds ||
        Number(refreshBounds[3]) - Number(refreshBounds[1]) < 44 ||
        Number(refreshBounds[4]) - Number(refreshBounds[2]) < 44)
      throw new Error('Chat refresh control lacks a visible 44dp target');
    stage = 'chat-refresh-tap';
    await tap(refreshControl);
    stage = 'chat-refresh-ready';
    await waitEnabledNode('更新聊天', 10_000);
    await waitHierarchyContains('TaipeiStationQA');
    await sleep(350);
    result.chatRefreshControlVerified = true;
    stage = 'meetup-chat-preview';
    if (requestedFontScale) {
      const latest = nodeWith(await dump(), 'NativeQAChatSmoke');
      const bounds = latest?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      const deviceSize = await adb(['shell', 'wm', 'size']);
      const dimensions = deviceSize.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
      const height = Number(dimensions?.[2]);
      result.chatLatestInitiallyVisible = !!bounds && Number(bounds[2]) >= Math.round(height * 0.22) &&
        Number(bounds[4]) <= Math.round(height * 0.78);
      if (!result.chatLatestInitiallyVisible) throw new Error('Latest chat message hidden by large-type meetup summary');
      stage = 'meetup-summary-open';
      const place = await waitNode('TaipeiStationQA', { exact: false });
      const placeBounds = place.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      const input = await waitNode('商品聊天訊息');
      const inputBounds = input.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (!placeBounds || Number(placeBounds[2]) < Math.round(height * 0.45) ||
          !inputBounds || Number(placeBounds[4]) > Number(inputBounds[2]) - 8)
        throw new Error('Large-type meetup summary overlaps the composer safe tap area');
      await tap(place);
      await sleep(450);
      await screenshot('meetup-summary-detail');
      await waitNode('面交預約');
      await waitNode('提議中', { exact: false });
      await tapLabel('返回聊天');
      await waitNode('NativeQAChatSmoke');
      result.chatCompactMeetupOpened = true;
    }
    stage = 'chat-history-scroll';
    const deviceSize = await adb(['shell', 'wm', 'size']);
    const dimensions = deviceSize.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
    const width = Number(dimensions?.[1]), height = Number(dimensions?.[2]);
    if (!Number.isSafeInteger(width) || width < 300 || !Number.isSafeInteger(height) || height < 600)
      throw new Error('Chat history viewport unavailable');
    let oldestVisible = false;
    result.chatHistoryBounds = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const first = nodeWith(await dump(), CHAT_VISUAL_MESSAGES[0].text);
      const bounds = first?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (bounds) result.chatHistoryBounds.push({ attempt, top: Number(bounds[2]), bottom: Number(bounds[4]) });
      if (bounds && Number(bounds[2]) >= Math.round(height * (requestedFontScale ? 0.34 : 0.24)) &&
          Number(bounds[4]) <= Math.round(height * 0.78) &&
          Number(bounds[4]) - Number(bounds[2]) >= (requestedFontScale ? 50 : 15)) {
        oldestVisible = true;
        result.chatHistoryScrolls = attempt;
        break;
      }
      await assertQaForeground();
      // Start inside a visible message, not just below the product context:
      // two-line large-type titles increase the fixed context card height.
      const top = bounds ? Number(bounds[2]) : null;
      const targetTop = Math.round(height * (requestedFontScale ? 0.34 : 0.24));
      const nearVisibleBoundary = top !== null && top >= targetTop - 40 && top < targetTop &&
        Number(bounds[4]) <= Math.round(height * 0.78);
      await adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * 0.40)),
        String(Math.floor(width / 2)), String(Math.floor(height * (nearVisibleBoundary ? 0.50 : 0.65))),
        nearVisibleBoundary ? '260' : '360']);
      await sleep(350);
    }
    if (!oldestVisible) {
      await screenshot('chat-history-attempt');
      throw new Error('Oldest chat message not reachable in visible viewport');
    }
    await screenshot('chat-history-oldest');
  }
  stage = 'chat-inbox';
  await tapLabel('返回');
  await waitNode('聊天與面交');
  await waitNode('NativeQAChatSmoke');
  await dismissDebugToast();
  await waitNode('聊天與面交');
  await waitNode('NativeQAChatSmoke');
  await screenshot('social-inbox');
}
async function main() {
  await verifyApk();
  await fs.mkdir(evidence, { mode: 0o700 });
  if (requestedFontScale) {
    stage = 'font-scale-preflight';
    const previous = (await adb(['shell', 'settings', 'get', 'system', 'font_scale'])).trim();
    if (!/^(?:null|\d+(?:\.\d+)?)$/.test(previous)) throw new Error('Original font scale unavailable');
    originalFontScale = previous;
    await adb(['shell', 'settings', 'put', 'system', 'font_scale', requestedFontScale]);
    fontScaleActiveVerified = (await adb(['shell', 'settings', 'get', 'system', 'font_scale'])).trim() === requestedFontScale;
    if (!fontScaleActiveVerified) throw new Error('QA font scale was not applied');
  }
  stage = 'fresh-package';
  const packages = (await adb(['shell', 'pm', 'list', 'packages', '-u', packageName])).split(/\r?\n/).map(line => line.trim());
  if (packages.includes('package:' + packageName) !== !!priorId)
    throw new Error('QA package ownership state changed; no overwrite');
  stage = 'isolated-service';
  await freeMetroPort();
  qa = await startNativeQa(database, wishBannerOnly ? 360 : 850,
    { externalListingsPilot: !chatOnly, externalMapStress: !wishBannerOnly && !chatOnly && !singleMapOnly,
      marketingVisualOwnerRole: visualOnly ? 'seller' : null });
  if (managementOnly || chatOnly) await seedNativeMarketplace(qa, 'seller', visualFixture ?? 'switch',
    { seedChatForVisualQa: chatOnly });
  const apiPort = Number(new URL(qa.apiUrl).port);
  stage = 'private-metro';
  const environment = hostEnvironment(process.execPath, '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/Users/hank/Library/Android/sdk', os.homedir());
  metro = spawn(process.execPath, metroArguments(mobile), { cwd: mobile,
    env: { ...environment, EXPO_PUBLIC_API_URL: qa.apiUrl }, stdio: ['ignore', 'ignore', 'ignore'] });
  metroExit = new Promise(resolve => { metro.once('exit', resolve); metro.once('error', () => resolve(-1)); });
  await metroReady();
  stage = 'private-device-connections';
  await reverse(apiPort); await reverse(METRO_PORT);
  stage = 'qa-only-install';
  if (priorId) await adb(['shell', 'pm', 'clear', packageName], 30_000);
  else await adb(['install', apk], 90_000);
  installed = true;
  await adb(['shell', 'am', 'start', '-n', `${packageName}/com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.MainActivity`]);
  stage = 'product-notice';
  const noticeDeadline = Date.now() + 45_000;
  while (Date.now() < noticeDeadline && !stopping) {
    const screen = await dump();
    if (nodeWith(screen, '手機號碼或 Email')) break;
    const notice = nodeWith(screen, '我了解，繼續使用');
    if (notice) { await tap(notice); break; }
    if (screen.includes('新的願望') || screen.includes('帳號與資料說明')) await swipeUp();
    await sleep(900);
  }
  stage = 'login-identifier';
  await tapLabel('手機號碼或 Email');
  const actor = managementOnly ? qa.actors.seller : qa.actors.buyer;
  await adb(['shell', 'input', 'text', actor.phoneNumber]);
  if (!(await dump()).includes(`text="${actor.phoneNumber}"`))
    throw new Error('Synthetic identifier not reflected in editable field');
  if (requestedFontScale) {
    // On a 320 px-wide device at 1.5x, the password field sits under the
    // identifier keyboard. Close that keyboard before targeting the field.
    await adb(['shell', 'input', 'keyevent', '4']);
    await waitNode('手機號碼或 Email');
  }
  stage = 'login-password';
  if (requestedFontScale) await focusVisibleLoginInput('密碼');
  else await tapLabel('密碼');
  await adb(['shell', 'input', 'text', actor.password]);
  if (requestedFontScale) {
    const passwordField = xmlNodes(await dump()).find(node => node.includes('class="android.widget.EditText"') &&
      node.includes('content-desc="密碼"'));
    const masked = passwordField?.match(/\btext="([^"]*)"/)?.[1] ?? '';
    result.passwordFieldAcceptedInput = !!masked && masked !== '密碼';
    if (!result.passwordFieldAcceptedInput) throw new Error('QA password field did not accept input');
  }
  await adb(['shell', 'input', 'keyevent', '4']);
  if (requestedFontScale) await assertQaForeground();
  stage = 'login-submit';
  if (requestedFontScale) await tapVisibleLoginButton();
  else await tapLabel('登入');
  if (managementOnly) { await managementSequence(true); passed = true; return; }
  if (chatOnly) { await chatSequence(); passed = true; return; }
  stage = 'home-matches-section';
  await waitNode('所有願望吻合的商品');
  await waitNode('今天想找什麼？');
  await screenshot('home');
  if (singleMapOnly) {
    stage = 'single-map-default';
    await tapLabel('探索');
    await waitNode('外部 1 件', { exact: false });
    await waitNode('Native QA 外部檯燈', { exact: false });
    await dismissDebugToast();
    await sleep(1200);
    await screenshot('single-map-default');
    stage = 'single-map-list';
    await tapLabel('切換清單');
    await waitNode('Native QA 外部檯燈', { exact: false });
    await waitNode('來源售價 NT$ 590', { exact: false });
    await screenshot('single-map-list');
    stage = 'single-map-selected';
    await tapLabel('在地圖上查看Native QA 外部檯燈');
    await waitNode('切換清單');
    await waitNode('Native QA 外部檯燈', { exact: false });
    await sleep(900);
    await screenshot('single-map-selected');
    stage = 'single-map-detail';
    await tapLabel('外部來源商品，Native QA 外部檯燈，來源售價 NT$ 590，新北市板橋區');
    await waitNode('外部來源 · github.com');
    await waitExternalPhotoReady();
    await dismissDebugToast();
    await waitWithScroll('Wishlist.ai 並非此商品賣家', false);
    await screenshot('single-map-detail');
    passed = true;
    return;
  }
  if (wishBannerOnly) {
    stage = 'private-wish-tab';
    await tapLabel('願望');
    await waitNode('Native QA 外部比對清單');
    await tapLabel('查看清單');
    await waitWithScroll('最高預算 TWD 600', false);
    await tapVisibleWishBrowse(true);
    stage = 'wish-map';
    await sleep(1200);
    await screenshot('wish-map');
    stage = 'wish-map-banner';
    await waitNode('符合所選願望', { exact: false });
    stage = 'wish-map-count';
    await waitNode('外部 1 件', { exact: false });
    stage = 'wish-map-help';
    await waitNode('比對說明');
    stage = 'wish-explanation';
    await tapLabel('比對說明');
    await waitNode('圖片不直接比對', { exact: false });
    await screenshot('wish-explanation');
    await tapLabel('收合說明');
    await waitNode('比對說明');
    stage = 'wish-map-settled';
    await sleep(350);
    await screenshot('wish-map-settled');
    stage = 'floating-card-detail';
    await tapLabel('外部來源商品，Native QA 外部檯燈，來源售價 NT$ 590，新北市板橋區');
    await waitNode('外部來源 · github.com');
    await waitNode('來源售價 NT$ 590');
    await waitExternalPhotoReady();
    await screenshot('external-detail');
    await tapLabel('返回探索');
    await waitNode('符合所選願望', { exact: false });
    stage = 'wish-list';
    await tapLabel('切換清單');
    await waitNode('Native QA 外部檯燈', { exact: false });
    await waitNode('來源售價 NT$ 590', { exact: false });
    await screenshot('wish-list');
    passed = true;
    return;
  }
  stage = 'external-map';
  await tapLabel('探索');
  await waitNode('外部 100 件', { exact: false });
  await waitNode('還有更多', { exact: false });
  await screenshot('external-map');
  stage = 'multiple-search-focus';
  await tapLabel('搜尋');
  await waitNode('回到搜尋結果');
  await waitNode('外部 100 件', { exact: false });
  await sleep(1400);
  await screenshot('multi-focused');
  stage = 'external-list-and-pagination';
  await tapLabel('切換清單');
  await waitNode('Native QA 外部檯燈', { exact: false });
  await waitNode('來源售價 NT$ 590', { exact: false });
  await screenshot('external-list');
  stage = 'pagination-find-footer';
  const paginationFooter = await waitVisibleWithScroll('載入更多外部商品', true, 95);
  await screenshot('pagination-footer');
  await tap(paginationFooter);
  stage = 'pagination-await-next-page';
  await waitVisibleWithScroll('QA map sample 101', false, 12);
  stage = 'pagination-capture-list';
  await screenshot('paged-list');
  stage = 'pagination-return-map';
  await tapLabel('切換地圖');
  await waitNode('外部 102 件', { exact: false });
  await sleep(1000);
  await screenshot('paged-map');
  stage = 'zero-results-scope';
  await replaceSearchText('noresultz');
  await adb(['shell', 'input', 'keyevent', '4']);
  await tapLabel('搜尋');
  await waitNode('已載入 0 件', { exact: false });
  await waitNode('不代表全站沒有商品', { exact: false });
  await screenshot('zero-results');
  stage = 'single-search-focus';
  await replaceSearchText('Native');
  await adb(['shell', 'input', 'keyevent', '4']);
  await tapLabel('搜尋');
  await waitNode('外部 1 件', { exact: false });
  await waitNode('回到搜尋結果');
  await waitNode('Native QA 外部檯燈', { exact: false });
  await sleep(900);
  await screenshot('search-focused');
  stage = 'single-result-list';
  await tapLabel('切換清單');
  await waitNode('Native QA 外部檯燈', { exact: false });
  stage = 'list-to-map';
  await tapLabel('在地圖上查看Native QA 外部檯燈');
  await waitNode('切換清單');
  await waitNode('Native QA 外部檯燈', { exact: false });
  await screenshot('list-to-map');
  stage = 'return-results';
  await tapLabel('回到搜尋結果');
  await waitNode('切換清單');
  await screenshot('return-results');
  await tapLabel('切換清單');
  stage = 'external-detail-card';
  await waitNode('外部 1 件', { exact: false });
  await tap(await waitWithScroll('外部來源商品，Native QA 外部檯燈，來源售價 NT$ 590，新北市板橋區'));
  stage = 'external-detail-source';
  await waitNode('外部來源 · github.com');
  stage = 'external-detail-photo';
  await waitExternalPhotoReady();
  await dismissDebugToast();
  stage = 'external-detail-disclaimer';
  await waitWithScroll('Wishlist.ai 並非此商品賣家', false);
  stage = 'external-detail-source-link';
  await waitWithScroll('前往來源網站查看');
  stage = 'external-detail-no-chat';
  await waitWithScroll('不提供站內賣家聊天或面交預約', false);
  stage = 'external-detail-capture';
  await screenshot('external-detail');
  // The visible safety notice is below the fold; Android Back closes this
  // modal without depending on its now off-screen header button.
  await adb(['shell', 'input', 'keyevent', '4']);
  await waitNode('切換地圖');
  stage = 'private-wish-tab';
  await dismissDebugToast();
  await tapLabel('願望');
  stage = 'private-wish-list-title';
  await waitNode('Native QA 外部比對清單');
  stage = 'private-wish-open-list';
  await tapLabel('查看清單');
  stage = 'private-wish-budget';
  await waitWithScroll('最高預算 TWD 600', false);
  stage = 'private-wish-explore';
  await tapVisibleWishBrowse();
  stage = 'wish-map';
  await waitNode('符合所選願望', { exact: false });
  await waitNode('外部 1 件', { exact: false });
  await screenshot('wish-map');
  stage = 'wish-list';
  await tapLabel('切換清單');
  await waitNode('Native QA 外部檯燈', { exact: false });
  await waitNode('來源售價 NT$ 590', { exact: false });
  await screenshot('wish-list');
  await managementSequence(false);
  passed = true;
}

(async () => {
  let cleanupFailed = false;
  try { await main(); } catch (failure) {
    result.failedStage = stage;
    result.failureClass = failure instanceof Error ? failure.name : typeof failure;
    if (failure && typeof failure.code === 'string' && /^[A-Z][A-Z0-9_]{0,32}$/.test(failure.code))
      result.failureCode = failure.code;
    if (failure && typeof failure.signal === 'string' && /^SIG[A-Z0-9]{1,12}$/.test(failure.signal))
      result.failureSignal = failure.signal;
    if (failure && typeof failure.killed === 'boolean') result.failureTimedOut = failure.killed;
    if (failure instanceof Error && /^(?:Required UI control missing|Tappable UI control missing|Scrollable UI control missing|Visible scrollable UI control missing|Visible login (?:input|button)|QA package is not foreground|QA password field|Synthetic price input)/.test(failure.message))
      result.failureReason = failure.message;
    if (installed) try {
      const screen = await dump();
      result.uiMarkers = {
        notice: !!nodeWith(screen, '我了解，繼續使用'), loginForm: !!nodeWith(screen, '手機號碼或 Email'),
        passwordField: !!nodeWith(screen, '密碼'), loginButton: !!nodeWith(screen, '登入'),
        exploreTab: !!nodeWith(screen, '探索'), bundleError: screen.includes('Unable to load script') ||
          screen.includes('Could not connect to development server'),
        debugWarningToast: screen.includes('Open debugger to view warnings.'),
        networkIssue: screen.includes('請確認網路'), storageIssue: screen.includes('無法安全儲存登入'),
        loginInputError: stage === 'login-submit' && screen.includes('請輸入帳號與密碼。'),
        loginCredentialError: stage === 'login-submit' && screen.includes('帳號或密碼不正確。'),
        loginResponseError: stage === 'login-submit' && screen.includes('服務回應不完整'),
        loginNetworkError: stage === 'login-submit' && screen.includes('暫時無法確認結果'),
        loginRateLimit: stage === 'login-submit' && screen.includes('操作過於頻繁'),
      };
      if (stage.startsWith('meetup-')) result.uiMarkers.meetupHierarchy = {
        proposed: screen.includes('提議中'), version: screen.includes('第1版'), place: screen.includes('TaipeiStationQA'),
        heading: screen.includes('面交預約'), nodeCount: xmlNodes(screen).length };
      if (stage.startsWith('chat-refresh-')) {
        const refresh = nodeWith(screen, '更新聊天');
        result.uiMarkers.chatRefresh = { present: !!refresh, enabled: !!refresh?.includes('enabled="true"'),
          clickable: !!refresh?.includes('clickable="true"'), bounds: refresh?.match(/bounds="\[[^\"]+"/)?.[0] ?? null };
      }
      if (stage === 'login-submit') {
        const button = xmlNodes(screen).find(node => node.includes('content-desc="登入"') && node.includes('clickable="true"'));
        const bounds = button?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        result.uiMarkers.loginAction = { present: !!button, enabled: !!button?.includes('enabled="true"'),
          top: bounds ? Number(bounds[2]) : null, bottom: bounds ? Number(bounds[4]) : null };
        const inputs = xmlNodes(screen).filter(node => node.includes('class="android.widget.EditText"'));
        const identifierInput = inputs.find(node => node.includes('content-desc="手機號碼或 Email"'));
        const passwordInput = inputs.find(node => node.includes('content-desc="密碼"'));
        const identifierText = identifierInput?.match(/\btext="([^"]*)"/)?.[1] ?? '';
        const passwordText = passwordInput?.match(/\btext="([^"]*)"/)?.[1] ?? '';
        result.uiMarkers.inputState = { identifierPresent: !!identifierInput, identifierPopulated: !!qa &&
          identifierText === qa.actors.seller.phoneNumber, passwordPresent: !!passwordInput,
          passwordNonEmpty: !!passwordText && passwordText !== '密碼', passwordFocused: !!passwordInput?.includes('focused="true"') };
      }
      if (stage === 'login-password') {
        const passwordInput = xmlNodes(screen).find(node => node.includes('class="android.widget.EditText"') &&
          node.includes('content-desc="密碼"'));
        const bounds = passwordInput?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        result.uiMarkers.passwordAction = { present: !!passwordInput, focused: !!passwordInput?.includes('focused="true"'),
          top: bounds ? Number(bounds[2]) : null, bottom: bounds ? Number(bounds[4]) : null };
      }
      if (stage === 'my-listings-edit') result.uiMarkers.syntheticPrice = nodeWith(screen, '編輯商品售價，新臺幣')?.match(/\btext="(\d{0,10})"/)?.[1] ?? null;
      if (stage === 'login-identifier' || stage === 'login-submit' && !result.uiMarkers.loginForm && !result.uiMarkers.passwordField || stage.startsWith('private-wish-') || stage.startsWith('wish-') || stage.startsWith('pagination-') || stage.startsWith('external-') || stage.startsWith('meetup-') || stage === 'multiple-search-focus' || stage === 'single-search-focus' || stage === 'switch-to-seller' || stage.startsWith('my-listings-')) {
        // Before-login contains no input; the wish route contains only owned
        // synthetic content. Never capture a filled login or other account.
        const target = path.join(evidence, stage === 'login-identifier' ? 'before-login-failure.png' : stage === 'login-submit' ? 'after-login-failure.png' : stage.startsWith('meetup-') ? 'meetup-failure.png' : stage === 'switch-to-seller' || stage.startsWith('my-listings-') ? 'my-listings-failure.png' : stage.startsWith('pagination-') ? 'pagination-failure.png' : stage.startsWith('external-') || stage === 'multiple-search-focus' || stage === 'single-search-focus' ? 'external-failure.png' : 'private-wish-failure.png');
        await fs.writeFile(target, await adbBytes(['exec-out', 'screencap', '-p']), { flag: 'wx', mode: 0o600 });
        result.diagnosticScreenshot = target;
      }
    } catch { result.uiMarkers = { unavailable: true }; }
  }
  if (installed) try { await adb(['shell', 'am', 'force-stop', packageName], 10_000); } catch { cleanupFailed = true; }
  for (const endpoint of reverses.reverse()) try { await adb(['reverse', '--remove', endpoint], 10_000); }
  catch { cleanupFailed = true; }
  if (metro && metro.exitCode === null) metro.kill('SIGTERM');
  if (metroExit) await metroExit;
  if (qa) try { result.cleanup = await qa.stop(); } catch { cleanupFailed = true; }
  if (originalFontScale !== null) try {
    await adb(['shell', 'settings', originalFontScale === 'null' ? 'delete' : 'put', 'system', 'font_scale',
      ...(originalFontScale === 'null' ? [] : [originalFontScale])]);
    fontScaleRestored = (await adb(['shell', 'settings', 'get', 'system', 'font_scale'])).trim() === originalFontScale;
    if (!fontScaleRestored) throw new Error('QA font scale was not restored');
  } catch { cleanupFailed = true; }
  try { await adb(['shell', 'rm', uiPath], 10_000); } catch { /* Exact temporary dump may not exist. */ }
  result.fontScale = requestedFontScale ? { requested: requestedFontScale, before: originalFontScale,
    activeVerified: fontScaleActiveVerified, restored: fontScaleRestored } : null;
  result.passed = passed && !stopping && !cleanupFailed && !!result.cleanup &&
    Object.values(result.cleanup).every(value => value === 0) &&
    (!requestedFontScale || fontScaleActiveVerified && fontScaleRestored);
  result.interrupted = stopping;
  result.stage = result.passed ? 'complete' : cleanupFailed ? 'cleanup-failed' : result.failedStage || stage;
  if (evidence) await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 }).catch(() => { result.passed = false; result.stage = 'report-failed'; });
  console.log(JSON.stringify({ kind: result.kind, passed: result.passed, stage: result.stage,
    evidenceDirectory: evidence, screenshots: result.screenshots.length, uiMarkers: result.uiMarkers,
    cleanup: result.cleanup, package: packageName }));
  if (!result.passed) process.exitCode = 1;
})().catch(() => { console.error('Android external map QA could not complete; raw private input withheld'); process.exitCode = 1; });
