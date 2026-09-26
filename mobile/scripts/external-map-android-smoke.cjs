// Device workload: run only through Simulator Manager with its assigned serial.
// Uses an existing, distinct-package Debug APK and fresh Metro JS. No store
// package, production account, provider secret or other app data is reset.
// Usage: node external-map-android-smoke.cjs <12-digit QA APK label>
//        [--reuse-owned-qa <previous owned run UUID>]
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { startNativeQa } = require('./native-qa.cjs');
const { seedNativeMarketplace } = require('./native-qa-marketplace-fixture.cjs');
const { assignedSerial, hostEnvironment, metroArguments, METRO_PORT, qaLabel, qaPackage } = require('./android-qa-config.cjs');
const { androidQaSources } = require('./android-qa-sources.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

const runFile = promisify(execFile);
const mobile = path.resolve(__dirname, '..');
const sourceLabel = qaLabel(process.argv[2]);
const packageName = qaPackage(sourceLabel);
const priorId = process.argv[3] === '--reuse-owned-qa' ? process.argv[4] : null;
const managementOnly = process.env.NATIVE_QA_MANAGE_ONLY === '1' || process.argv[5] === '--manage-only';
const removalOnly = process.env.NATIVE_QA_REMOVE_ONLY === '1';
if (process.argv[3] && (!priorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(priorId)))
  throw new Error('Exact prior owned QA report required');
if (process.argv[5] && process.argv[5] !== '--manage-only') throw new Error('Unknown QA mode');
if (process.env.NATIVE_QA_MANAGE_ONLY !== undefined && process.env.NATIVE_QA_MANAGE_ONLY !== '1') throw new Error('Unknown QA mode');
if (process.env.NATIVE_QA_REMOVE_ONLY !== undefined && process.env.NATIVE_QA_REMOVE_ONLY !== '1') throw new Error('Unknown QA mode');
if (removalOnly && !managementOnly) throw new Error('Removal QA requires management-only mode');
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
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; });
const reverses = [];
const result = { kind: 'isolated-android-external-map-smoke', passed: false, stage: null,
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
async function waitNode(label, { exact = true, timeout = 35_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !stopping) {
    const node = nodeWith(await dump(), label, exact);
    if (node) return node;
    await sleep(900);
  }
  throw new Error('Required UI control missing at ' + stage);
}
async function tap(node) {
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
  const size = await adb(['shell', 'wm', 'size']);
  const dimensions = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!dimensions) throw new Error('Device size unavailable');
  const width = Number(dimensions[1]), height = Number(dimensions[2]);
  await adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * 0.82)),
    String(Math.floor(width / 2)), String(Math.floor(height * 0.22)), '360']);
}
async function dismissDebugToast() {
  // Expo's Debug-only warning banner can intercept controls immediately above
  // the navigation bar. This distinct-package QA shell never ships to Play.
  const size = await adb(['shell', 'wm', 'size']);
  const dimensions = size.match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!dimensions) throw new Error('Device size unavailable');
  await adb(['shell', 'input', 'tap', String(Number(dimensions[1]) - 29), String(Number(dimensions[2]) - 49)]);
}
async function waitWithScroll(label, exact = true, maxSwipes = 6) {
  for (let attempt = 0; attempt < maxSwipes; attempt++) {
    if (stopping) throw new Error('QA interrupted');
    const node = nodeWith(await dump(), label, exact);
    if (node) return node;
    await swipeUp(); await sleep(800);
  }
  throw new Error('Scrollable UI control missing at ' + stage);
}
async function screenshot(name) {
  if (!/^(?:external-map|multi-focused|external-list|paged-list|paged-map|zero-results|search-focused|list-to-map|return-results|external-detail|wish-map|wish-list|my-listings|my-listings-edit|my-listings-edit-typed|my-listings-expiry|my-listings-extended|my-listings-reserved|my-listings-sold|my-listings-removed)$/.test(name)) throw new Error('Unsafe screenshot name');
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
    await seedNativeMarketplace(qa);
    stage = 'switch-to-seller';
    await tapLabel('我的');
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
  stage = 'my-listings-entry';
  await tapLabel('我的商品 · 閱覽與管理');
  await waitNode('我的商品');
  await waitNode('Native QA Switch OLED', { exact: false });
  await waitNode('NT$ 7,500');
  await dismissDebugToast();
  await screenshot('my-listings');
  stage = 'my-listings-edit';
  await tapLabel('編輯資訊');
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
    await tapLabel('已移除');
    await waitNode('本頁「已移除」已載入 1 件', { exact: false });
    await waitNode('NT$ 7,400');
    await screenshot('my-listings-removed');
    return;
  }
  stage = 'my-listings-reserve';
  await tapLabel('標記保留');
  await waitNode('確認標記已保留？');
  await tapLabel('標記已保留');
  await waitNode('已標記已保留', { exact: false });
  await tapLabel('已保留');
  await waitNode('Native QA Switch OLED', { exact: false });
  await screenshot('my-listings-reserved');
  stage = 'my-listings-release';
  await tapLabel('恢復在售');
  await waitNode('確認恢復在售？');
  await tapLabel('恢復在售');
  await waitNode('已恢復在售', { exact: false });
  await tapLabel('在售');
  stage = 'my-listings-sold';
  await tapLabel('標記售出');
  await waitNode('確認標記已售出？');
  await tapLabel('標記已售出');
  await waitNode('已標記已售出', { exact: false });
  await tapLabel('已售出');
  await waitNode('本頁「已售出」已載入 1 件', { exact: false });
  await waitNode('NT$ 7,400');
  await screenshot('my-listings-sold');
}
async function main() {
  await verifyApk();
  await fs.mkdir(evidence, { mode: 0o700 });
  stage = 'fresh-package';
  const packages = (await adb(['shell', 'pm', 'list', 'packages', '-u', packageName])).split(/\r?\n/).map(line => line.trim());
  if (packages.includes('package:' + packageName) !== !!priorId)
    throw new Error('QA package ownership state changed; no overwrite');
  stage = 'isolated-service';
  await freeMetroPort();
  qa = await startNativeQa(database, 850, { externalListingsPilot: true, externalMapStress: true });
  if (managementOnly) await seedNativeMarketplace(qa);
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
  stage = 'login-password';
  await tapLabel('密碼');
  await adb(['shell', 'input', 'text', actor.password]);
  await adb(['shell', 'input', 'keyevent', '4']);
  stage = 'login-submit';
  await tapLabel('登入');
  if (managementOnly) { await managementSequence(true); passed = true; return; }
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
  await tap(await waitWithScroll('載入更多外部商品', true, 55));
  await waitNode('外部 102 件', { exact: false });
  await screenshot('paged-list');
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
  stage = 'external-detail';
  await waitNode('外部 1 件', { exact: false });
  await tap(await waitWithScroll('外部來源商品，Native QA 外部檯燈，來源售價 NT$ 590，新北市板橋區'));
  await waitNode('外部來源 · github.com');
  await waitNode('來源商品圖片');
  await waitWithScroll('Wishlist.ai 並非此商品賣家', false);
  await waitWithScroll('前往來源網站查看');
  await waitWithScroll('不提供站內賣家聊天或面交預約', false);
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
  await tap(await waitWithScroll('查附近符合商品'));
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
    if (failure instanceof Error && /^(?:Required UI control missing|Tappable UI control missing|Scrollable UI control missing|Synthetic price input)/.test(failure.message))
      result.failureReason = failure.message;
    if (installed) try {
      const screen = await dump();
      result.uiMarkers = {
        notice: !!nodeWith(screen, '我了解，繼續使用'), loginForm: !!nodeWith(screen, '手機號碼或 Email'),
        passwordField: !!nodeWith(screen, '密碼'), loginButton: !!nodeWith(screen, '登入'),
        exploreTab: !!nodeWith(screen, '探索'), bundleError: screen.includes('Unable to load script') ||
          screen.includes('Could not connect to development server'),
        networkIssue: screen.includes('請確認網路'), storageIssue: screen.includes('無法安全儲存登入'),
      };
      if (stage === 'my-listings-edit') result.uiMarkers.syntheticPrice = nodeWith(screen, '編輯商品售價，新臺幣')?.match(/\btext="(\d{0,10})"/)?.[1] ?? null;
      if (stage === 'login-identifier' || stage === 'login-submit' && !result.uiMarkers.loginForm && !result.uiMarkers.passwordField || stage.startsWith('private-wish-') || stage.startsWith('external-') || stage === 'multiple-search-focus' || stage === 'single-search-focus' || stage.startsWith('my-listings-')) {
        // Before-login contains no input; the wish route contains only owned
        // synthetic content. Never capture a filled login or other account.
        const target = path.join(evidence, stage === 'login-identifier' ? 'before-login-failure.png' : stage === 'login-submit' ? 'after-login-failure.png' : stage.startsWith('my-listings-') ? 'my-listings-failure.png' : stage.startsWith('external-') || stage === 'multiple-search-focus' || stage === 'single-search-focus' ? 'external-failure.png' : 'private-wish-failure.png');
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
  try { await adb(['shell', 'rm', uiPath], 10_000); } catch { /* Exact temporary dump may not exist. */ }
  result.passed = passed && !stopping && !cleanupFailed && result.cleanup?.externalCandidatesRemaining === 0 &&
    result.cleanup?.externalSourcesRemaining === 0;
  result.interrupted = stopping;
  result.stage = result.passed ? 'complete' : cleanupFailed ? 'cleanup-failed' : result.failedStage || stage;
  if (evidence) await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 }).catch(() => { result.passed = false; result.stage = 'report-failed'; });
  console.log(JSON.stringify({ kind: result.kind, passed: result.passed, stage: result.stage,
    evidenceDirectory: evidence, screenshots: result.screenshots.length, uiMarkers: result.uiMarkers,
    cleanup: result.cleanup, package: packageName }));
  if (!result.passed) process.exitCode = 1;
})().catch(() => { console.error('Android external map QA could not complete; raw private input withheld'); process.exitCode = 1; });
