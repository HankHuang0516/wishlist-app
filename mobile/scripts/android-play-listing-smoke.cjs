#!/usr/bin/env node
// Real Google Play App Signing APK against the production pilot. Owned synthetic
// photos only; never publishes a listing. Run inside a simulator-manager lease.
const { execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../../server/node_modules/sharp');
const { fixtureDistance } = require('./native-qa-photo-fingerprint.cjs');

const serial = process.env.SIM_MANAGER_SERIAL;
if (!process.env.SIM_MANAGER_TOKEN || !/^emulator-\d{4,5}$/.test(serial ?? '')) throw new Error('Managed Android emulator required');
const pkg = 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1';
const { version: versionName, android: { versionCode } } = require('../app.config.js').expo;
const base = 'https://wishlist-app-production.up.railway.app/api';
const batchCount = process.argv.length === 2 ? 1 : process.argv.length === 3 && process.argv[2] === '--two' ? 2 : 0;
if (!batchCount) throw new Error('Use no argument or --two');
const credentialFile = process.env.QA_CREDENTIALS_FILE;
const runId = randomUUID();
const fixtures = [
  { kind: 'orange-lamp', path: path.resolve(__dirname, '../qa-fixtures/synthetic-used-orange-desk-lamp.png'),
    hash: 'abdaabda6b85bd4037f976638b4b93faf6702c9e1ab0997809e7fa18b4468ab0',
    gallery: `/sdcard/Pictures/wishlist-play-v${versionCode}-${runId}-lamp.png`, label: /燈|lamp/i },
  { kind: 'blue-mug', path: path.resolve(__dirname, '../qa-fixtures/synthetic-used-blue-mug.png'),
    hash: '4bf0d16e92bff216bdf0521ba878886b0a31c734d43ee9363dbc69dda6aa06f9',
    gallery: `/sdcard/Pictures/wishlist-play-v${versionCode}-${runId}-mug.png`, label: /杯|mug|cup/i },
].slice(0, batchCount);
const ui = `/sdcard/wishlist-play-v${versionCode}-${runId}.xml`;
const adbPath = '/Users/hank/Library/Android/sdk/platform-tools/adb';
const adb = (args, options = {}) => execFileSync(adbPath, ['-s', serial, ...args], {
  encoding: options.binary ? undefined : 'utf8', timeout: options.timeout ?? 25_000,
  maxBuffer: options.binary ? 15 * 1024 * 1024 : 4 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let stage = 'preflight', bearer, loggedIn = false, baselineIds, uploadStarted = false, candidateCleanupConfirmed = false, verifiedOwnedCount = 0;
// A new ID alone is not ownership proof: only fingerprint-matched fixtures may be deleted.
const candidateIds = new Set(), ownedCandidateIds = new Set();

const nodes = xml => xml.match(/<node\b[^>]*>/g) ?? [];
const find = (xml, label) => {
  const matches = nodes(xml).filter(node => node.includes(`content-desc="${label}"`) || node.includes(`text="${label}"`));
  return matches.find(node => node.includes('clickable="true"')) ?? matches[0];
};
function dump() { adb(['shell', 'uiautomator', 'dump', ui], { timeout: 30_000 }); return adb(['exec-out', 'cat', ui]); }
function tap(node) {
  const hit = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!hit) throw new Error('ui_control_missing_bounds');
  adb(['shell', 'input', 'tap', String(Math.floor((+hit[1] + +hit[3]) / 2)), String(Math.floor((+hit[2] + +hit[4]) / 2))]);
}
async function waitNode(label, timeout = 35_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const found = find(dump(), label); if (found) return found; await sleep(850); }
  throw new Error('ui_control_not_found');
}
async function swipeUp() {
  const size = adb(['shell', 'wm', 'size']).match(/(?:Physical|Override) size: (\d+)x(\d+)/);
  if (!size) throw new Error('device_size_missing');
  const width = +size[1], height = +size[2];
  adb(['shell', 'input', 'swipe', String(Math.floor(width / 2)), String(Math.floor(height * .82)),
    String(Math.floor(width / 2)), String(Math.floor(height * .23)), '360']);
  await sleep(600);
}
async function waitWithScroll(label, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const found = find(dump(), label); if (found) return found; await swipeUp(); }
  throw new Error('scrollable_control_not_found');
}
async function api(route, options = {}) {
  const response = await fetch(base + route, { ...options, headers: { Authorization: `Bearer ${bearer}`, ...options.headers }, signal: AbortSignal.timeout(20_000) });
  return response;
}
async function unused() {
  const response = await api('/listing-media/unused?purpose=BATCH_ITEM');
  if (!response.ok) throw new Error('private_drafts_unavailable');
  const data = await response.json();
  if (!Array.isArray(data.items) || data.nextCursor) throw new Error('private_drafts_ambiguous');
  return data.items;
}
async function cleanupCandidate(candidateId) {
  if (!bearer || !candidateId) return 'NOT_IDENTIFIED';
  try {
    const response = await api(`/listing-media/${candidateId}`, { method: 'DELETE' });
    return response.status === 204 || response.status === 404 ? 'DELETE_ACCEPTED' : 'MANUAL_REVIEW_REQUIRED';
  } catch { return 'MANUAL_REVIEW_REQUIRED'; }
}
function tileColorCounts(pixels, info, tile) {
  let orange = 0, blue = 0;
  for (let y = 422; y < 529; y++) for (let x = tile * 107; x < tile * 107 + 106; x++) {
    const offset = (y * info.width + x) * info.channels;
    const red = pixels[offset], green = pixels[offset + 1], indigo = pixels[offset + 2];
    if (red > 100 && green > 40 && green < 170 && red > green * 1.25 && green > indigo * 1.2) orange++;
    if (indigo > 80 && indigo > red * 1.45 && indigo > green * 1.2) blue++;
  }
  return { orange, blue };
}
async function priceShownForCard(index, timeout = 45_000) {
  const prefix = `第${index}件 AI 二手參考價：NT$ `;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = nodes(dump()).find(node => node.includes(`content-desc="${prefix}`));
    const range = visible?.match(/AI 二手參考價：NT\$ (\d+)–(\d+)/);
    if (range) return `${range[1]}–${range[2]}`;
    await swipeUp();
  }
  throw new Error('native_reference_price_missing');
}
async function signOutDevice() {
  for (let attempt = 0; attempt < 9; attempt++) {
    const screen = dump();
    if (find(screen, '手機號碼或 Email')) return true;
    const signOut = find(screen, '登出此裝置');
    if (signOut) { tap(signOut); await sleep(900); continue; }
    if (find(screen, '帳號安全') || find(screen, '刊登好物')) { await swipeUp(); continue; }
    const account = find(screen, '我的');
    if (account) { tap(account); await sleep(600); continue; }
    adb(['shell', 'input', 'keyevent', '4']);
    await sleep(600);
  }
  return !!find(dump(), '手機號碼或 Email');
}
async function main() {
  if (!credentialFile || !fs.existsSync(credentialFile) ||
    fixtures.some(fixture => createHash('sha256').update(fs.readFileSync(fixture.path)).digest('hex') !== fixture.hash))
    throw new Error('private_fixture_or_credentials_missing');
  const credentials = fs.readFileSync(credentialFile, 'utf8');
  const line = label => credentials.split('\n').find(value => value.startsWith(label))?.slice(label.length).trim();
  const phone = line('測試帳號：'), password = line('測試密碼：');
  if (!phone || !password || !/^[0-9]+$/.test(phone) || !/^[a-zA-Z0-9]+$/.test(password)) throw new Error('test_credentials_invalid');
  stage = 'api-login';
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone, password }), signal: AbortSignal.timeout(20_000) });
  if (!login.ok) throw new Error('test_login_failed');
  bearer = (await login.json()).token;
  if (!bearer) throw new Error('test_token_missing');
  stage = 'baseline';
  baselineIds = new Set((await unused()).map(item => item.id));
  const before = await api('/listings/mine');
  if (!before.ok) throw new Error('seller_listings_unavailable');
  const initialListings = new Set((await before.json()).items.map(item => item.id));
  stage = 'installed-play-apk';
  const installed = adb(['shell', 'dumpsys', 'package', pkg]);
  if (!installed.includes(`versionCode=${versionCode} `) || !installed.includes(`versionName=${versionName}`)) throw new Error('installed_build_mismatch');
  for (const fixture of fixtures) {
    adb(['push', fixture.path, fixture.gallery], { timeout: 40_000 });
    adb(['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + fixture.gallery]);
  }
  stage = 'native-login';
  adb(['shell', 'am', 'force-stop', pkg]);
  adb(['shell', 'am', 'start', '-W', '-n', pkg + '/.MainActivity']);
  for (let attempt = 0; attempt < 10; attempt++) {
    const screen = dump();
    if (find(screen, '手機號碼或 Email')) break;
    if (screen.includes('新的願望，附近的好物')) {
      const accept = find(screen, '我了解，繼續使用');
      if (accept) tap(accept); else await swipeUp();
    } else if (find(screen, '我的')) {
      if (!await signOutDevice()) throw new Error('existing_device_session_logout_failed');
    } else await sleep(700);
  }
  tap(await waitNode('手機號碼或 Email'));
  adb(['shell', 'input', 'text', phone]);
  tap(await waitNode('密碼'));
  adb(['shell', 'input', 'text', password]);
  adb(['shell', 'input', 'keyevent', '4']);
  stage = 'native-login-submit';
  tap(await waitNode('登入'));
  loggedIn = true;
  stage = 'home-navigation';
  tap(await waitNode('我的', 45_000));
  stage = 'account-navigation';
  tap(await waitNode('刊登好物'));
  stage = 'listing-navigation';
  await waitNode('連續拍照刊登');
  stage = 'photo-picker';
  tap(await waitNode('批次選照片'));
  await sleep(2300);
  const picker = dump();
  if (!find(picker, 'Photos') && !find(picker, '相片')) throw new Error('photo_picker_not_open');
  const { data: pixels, info } = await sharp(adb(['exec-out', 'screencap', '-p'], { binary: true })).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 320 || info.height !== 640 || info.channels < 3) throw new Error('photo_picker_layout_changed');
  const first = tileColorCounts(pixels, info, 0);
  const second = batchCount === 2 ? tileColorCounts(pixels, info, 1) : null;
  if (batchCount === 1 ? first.orange <= 300 :
    !((first.orange > 300 && second.blue > 300) || (first.blue > 300 && second.orange > 300))) {
    console.error(JSON.stringify({ pickerFixturePixels: [first, second] }));
    throw new Error('owned_fixture_tiles_not_verified');
  }
  adb(['shell', 'input', 'tap', '53', '474']);
  if (batchCount === 2) adb(['shell', 'input', 'tap', '160', '474']);
  tap(await waitNode('Done'));
  uploadStarted = true;
  stage = 'private-upload';
  for (let attempt = 0; attempt < 60; attempt++) {
    const added = (await unused()).filter(item => !baselineIds.has(item.id));
    if (added.length > batchCount) throw new Error('private_upload_ambiguous');
    for (const item of added) candidateIds.add(item.id);
    if (candidateIds.size === batchCount) break;
    await sleep(1200);
  }
  if (candidateIds.size !== batchCount) throw new Error('private_upload_missing');
  const recognized = new Map();
  for (const candidateId of candidateIds) {
    const anonymous = await fetch(`${base}/listing-media/${candidateId}/image`, { signal: AbortSignal.timeout(20_000) });
    if (anonymous.status !== 404) throw new Error('private_photo_exposed');
    const owner = await api(`/listing-media/${candidateId}/image`);
    if (owner.status !== 200 || !owner.headers.get('content-type')?.startsWith('image/')) throw new Error('private_photo_owner_unavailable');
    const bytes = Buffer.from(await owner.arrayBuffer());
    const distances = await Promise.all(fixtures.map(fixture => fixtureDistance(sharp, bytes, fs.readFileSync(fixture.path))));
    const fixtureIndex = distances.indexOf(Math.min(...distances));
    if (distances[fixtureIndex] >= 12 || distances.some((distance, index) => index !== fixtureIndex && distance <= 40) ||
      recognized.has(fixtures[fixtureIndex].kind)) throw new Error('private_photo_identity_mismatch');
    recognized.set(fixtures[fixtureIndex].kind, candidateId);
    ownedCandidateIds.add(candidateId);
    verifiedOwnedCount = ownedCandidateIds.size;
  }
  if (recognized.size !== batchCount) throw new Error('distinct_private_photos_missing');
  stage = 'ai-draft';
  const draftFor = async candidateId => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const response = await api(`/listing-media/${candidateId}/ai-draft`);
      if (!response.ok) throw new Error('ai_status_unavailable');
      const result = await response.json();
      if (result.status === 'FAILED') throw new Error('ai_draft_failed');
      if (result.status === 'COMPLETED') return result.draft;
      await sleep(3500);
    }
    throw new Error('ai_draft_timeout');
  };
  const drafts = new Map(await Promise.all([...recognized].map(async ([kind, candidateId]) => [kind, await draftFor(candidateId)])));
  for (const fixture of fixtures) {
    const ai = drafts.get(fixture.kind);
    if (!ai || ai.source !== 'MINIMAX_CODE_VISION' || !ai.title || !ai.description ||
      !fixture.label.test(ai.title + ' ' + ai.description) ||
      !Number.isSafeInteger(ai.estimatedPriceLowTwd) || !Number.isSafeInteger(ai.estimatedPriceHighTwd) ||
      ai.estimatedPriceLowTwd < 0 || ai.estimatedPriceHighTwd < ai.estimatedPriceLowTwd)
      throw new Error('ai_draft_incomplete_or_wrong_item');
  }
  stage = 'native-ai-display';
  const expectedRanges = fixtures.map(fixture => {
    const ai = drafts.get(fixture.kind);
    return `${ai.estimatedPriceLowTwd}–${ai.estimatedPriceHighTwd}`;
  }).sort();
  const shownRanges = [];
  for (let index = 0; index < batchCount; index++)
    shownRanges.push(await priceShownForCard(baselineIds.size + index + 1, 60_000));
  if (shownRanges.sort().join('|') !== expectedRanges.join('|')) throw new Error('native_reference_prices_mismatch');
  await waitWithScroll('目前售價由 AI 參考區間中間值預填，不是已驗證行情；刊登前請確認或修改。', 35_000);
  stage = 'seller-edit';
  const editedIndex = baselineIds.size + batchCount;
  const editMarker = `QA${runId.slice(0, 8)}`;
  tap(await waitWithScroll(`第${editedIndex}件商品名稱`));
  adb(['shell', 'input', 'keyevent', '123']);
  adb(['shell', 'input', 'text', editMarker]);
  adb(['shell', 'input', 'keyevent', '4']);
  // Android Back may dismiss the keyboard or the Modal. Both paths call the
  // composer's guarded leave/flush; tap the explicit leave control if needed.
  const afterBack = dump();
  if (find(afterBack, '連續拍照刊登')) tap(await waitNode('稍後繼續'));
  stage = 'seller-draft-resume';
  tap(await waitNode('刊登好物', 45_000));
  await waitNode('連續拍照刊登');
  await waitWithScroll(`第${editedIndex}件商品名稱`);
  if (!dump().includes(editMarker))
    throw new Error('native_seller_edit_not_restored');
  const savedDrafts = (await unused()).filter(item => candidateIds.has(item.id));
  if (savedDrafts.length !== batchCount ||
    savedDrafts.filter(item => item.sellerDraft?.form?.title?.endsWith(editMarker) && item.sellerDraft?.touched?.title === true).length !== 1)
    throw new Error('server_seller_edit_not_restored');
  const after = await api('/listings/mine');
  if (!after.ok || (await after.json()).items.some(item => !initialListings.has(item.id))) throw new Error('listing_published_without_consent');
  stage = 'cleanup';
  for (const candidateId of [...ownedCandidateIds]) {
    if (await cleanupCandidate(candidateId) !== 'DELETE_ACCEPTED') throw new Error('private_photo_cleanup_incomplete');
    ownedCandidateIds.delete(candidateId);
  }
  const remaining = (await unused()).filter(item => !baselineIds.has(item.id));
  if (remaining.length) throw new Error('private_photo_still_listed');
  console.log(JSON.stringify({ result: 'PASS', scope: 'play-signed-native-private-listing-ai', versionCode,
    fixtures: fixtures.map(fixture => fixture.kind), privateUploadCount: batchCount, anonymousAccessDenied: true,
    aiDraftDisplayed: true, referencePriceDisplayed: true, sellerEditRestored: true,
    unconfirmedPublicListings: 0, cleanup: 'DELETE_ACCEPTED' }));
  candidateCleanupConfirmed = true;
}

main().catch(error => {
  const code = /^[-a-z0-9_]+$/i.test(error?.message ?? '') ? error.message : 'unexpected_failure';
  let markers = [];
  try {
    const xml = dump();
    markers = ['新的願望，附近的好物', '我了解，繼續使用', '手機號碼或 Email', '密碼', '登入', '首頁', '我的', '刊登好物', '連續拍照刊登', '商品草稿 1/12', '驗證 Email']
      .filter(label => !!find(xml, label));
  } catch { /* Raw UI and credentials are never logged. */ }
  console.error(`Play listing smoke failed (${stage}; ${code}; markers=${JSON.stringify(markers)}).`);
  process.exitCode = 1;
}).finally(async () => {
  if (uploadStarted && verifiedOwnedCount < batchCount && !candidateCleanupConfirmed) {
    console.error('One or more uploaded test photos were not verified as owned fixtures; manual review is required. Existing private drafts were not touched.');
    process.exitCode = 1;
  }
  for (const candidateId of ownedCandidateIds) {
    const cleanup = await cleanupCandidate(candidateId);
    if (cleanup === 'MANUAL_REVIEW_REQUIRED') { console.error('Test photo cleanup needs manual review.'); process.exitCode = 1; }
  }
  try { adb(['shell', 'rm', '-f', ...fixtures.map(fixture => fixture.gallery), ui]); } catch { /* Device lease is still released. */ }
  if (loggedIn) {
    try {
      if (!await signOutDevice()) { console.error('QA emulator remains signed in; local private captures were preserved.'); process.exitCode = 1; }
    } catch { console.error('QA emulator sign-out needs manual review; local private captures were preserved.'); process.exitCode = 1; }
  }
});
