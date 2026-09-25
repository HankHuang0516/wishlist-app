#!/usr/bin/env node
// Real Google Play App Signing APK against the production pilot. Own synthetic
// photo only; never publishes a listing. Run inside a simulator-manager lease.
const { execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../../server/node_modules/sharp');

const serial = process.env.SIM_MANAGER_SERIAL;
if (!process.env.SIM_MANAGER_TOKEN || !/^emulator-\d{4,5}$/.test(serial ?? '')) throw new Error('Managed Android emulator required');
const pkg = 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1';
const base = 'https://wishlist-app-production.up.railway.app/api';
const fixture = path.resolve(__dirname, '../qa-fixtures/synthetic-used-orange-desk-lamp.png');
const expectedFixtureHash = 'abdaabda6b85bd4037f976638b4b93faf6702c9e1ab0997809e7fa18b4468ab0';
const credentialFile = process.env.QA_CREDENTIALS_FILE;
const runId = randomUUID();
const gallery = `/sdcard/Pictures/wishlist-play-v21-${runId}.png`;
const ui = `/sdcard/wishlist-play-v21-${runId}.xml`;
const adbPath = '/Users/hank/Library/Android/sdk/platform-tools/adb';
const adb = (args, options = {}) => execFileSync(adbPath, ['-s', serial, ...args], {
  encoding: options.binary ? undefined : 'utf8', timeout: options.timeout ?? 25_000,
  maxBuffer: options.binary ? 15 * 1024 * 1024 : 4 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let stage = 'preflight', bearer, candidateId, loggedIn = false, baselineIds;

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
async function cleanupCandidate() {
  if (!bearer) return 'NOT_CREATED';
  try {
    if (!candidateId && baselineIds) {
      const added = (await unused()).filter(item => !baselineIds.has(item.id));
      if (added.length === 1) candidateId = added[0].id;
      else if (added.length > 1) return 'MANUAL_REVIEW_REQUIRED';
    }
    if (!candidateId) return 'NOT_CREATED';
    const response = await api(`/listing-media/${candidateId}`, { method: 'DELETE' });
    return response.status === 204 || response.status === 404 ? 'DELETE_ACCEPTED' : 'MANUAL_REVIEW_REQUIRED';
  } catch { return 'MANUAL_REVIEW_REQUIRED'; }
}
async function main() {
  if (!credentialFile || !fs.existsSync(credentialFile) ||
    createHash('sha256').update(fs.readFileSync(fixture)).digest('hex') !== expectedFixtureHash) throw new Error('private_fixture_or_credentials_missing');
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
  if (baselineIds.size) throw new Error('test_account_has_existing_batch_drafts');
  const before = await api('/listings/mine');
  if (!before.ok) throw new Error('seller_listings_unavailable');
  const initialListings = new Set((await before.json()).items.map(item => item.id));
  stage = 'installed-play-apk';
  const installed = adb(['shell', 'dumpsys', 'package', pkg]);
  if (!/versionCode=21\b/.test(installed) || !/versionName=2\.0\.6\b/.test(installed)) throw new Error('installed_build_mismatch');
  adb(['push', fixture, gallery], { timeout: 40_000 });
  adb(['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + gallery]);
  stage = 'native-login';
  adb(['shell', 'am', 'force-stop', pkg]);
  adb(['shell', 'am', 'start', '-W', '-n', pkg + '/.MainActivity']);
  for (let attempt = 0; attempt < 10; attempt++) {
    const screen = dump();
    if (find(screen, '手機號碼或 Email')) break;
    if (screen.includes('新的願望，附近的好物')) {
      const accept = find(screen, '我了解，繼續使用');
      if (accept) tap(accept); else await swipeUp();
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
  let orangePixels = 0;
  for (let y = 422; y < 529; y++) for (let x = 0; x < 106; x++) {
    const offset = (y * info.width + x) * info.channels;
    const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
    if (red > 100 && green > 40 && green < 170 && red > green * 1.25 && green > blue * 1.2) orangePixels++;
  }
  if (orangePixels <= 300) throw new Error('synthetic_lamp_not_first_tile');
  adb(['shell', 'input', 'tap', '53', '474']);
  tap(await waitNode('Done'));
  stage = 'private-upload';
  for (let attempt = 0; attempt < 25; attempt++) {
    const added = (await unused()).filter(item => !baselineIds.has(item.id));
    if (added.length > 1) throw new Error('private_upload_ambiguous');
    if (added.length === 1) { candidateId = added[0].id; break; }
    await sleep(1200);
  }
  if (!candidateId) throw new Error('private_upload_missing');
  const anonymous = await fetch(`${base}/listing-media/${candidateId}/image`, { signal: AbortSignal.timeout(20_000) });
  if (anonymous.status !== 404) throw new Error('private_photo_exposed');
  stage = 'ai-draft';
  let ai;
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await api(`/listing-media/${candidateId}/ai-draft`);
    if (!response.ok) throw new Error('ai_status_unavailable');
    const result = await response.json();
    if (result.status === 'FAILED') throw new Error('ai_draft_failed');
    if (result.status === 'COMPLETED') { ai = result.draft; break; }
    await sleep(3500);
  }
  if (!ai || ai.source !== 'MINIMAX_CODE_VISION' || !ai.title || !ai.description ||
    !Number.isSafeInteger(ai.estimatedPriceLowTwd) || !Number.isSafeInteger(ai.estimatedPriceHighTwd)) throw new Error('ai_draft_incomplete');
  stage = 'native-ai-display';
  await waitWithScroll('AI 草稿已完成，請確認', 60_000);
  await waitWithScroll(`第1件 AI 二手參考價：NT$ ${ai.estimatedPriceLowTwd}–${ai.estimatedPriceHighTwd}`, 35_000);
  const after = await api('/listings/mine');
  if (!after.ok || (await after.json()).items.some(item => !initialListings.has(item.id))) throw new Error('listing_published_without_consent');
  stage = 'cleanup';
  const cleanup = await cleanupCandidate();
  if (cleanup !== 'DELETE_ACCEPTED') throw new Error('private_photo_cleanup_incomplete');
  const remaining = (await unused()).filter(item => !baselineIds.has(item.id));
  if (remaining.length) throw new Error('private_photo_still_listed');
  console.log(JSON.stringify({ result: 'PASS', scope: 'play-signed-native-private-listing-ai', versionCode: 21,
    fixture: 'owned-synthetic-used-orange-lamp', privateUpload: true, anonymousAccessDenied: true,
    aiDraftDisplayed: true, referencePriceDisplayed: true, unconfirmedPublicListings: 0, cleanup }));
  candidateId = undefined;
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
  if (candidateId || baselineIds) {
    const cleanup = await cleanupCandidate();
    if (cleanup === 'MANUAL_REVIEW_REQUIRED') { console.error('Test photo cleanup needs manual review.'); process.exitCode = 1; }
  }
  try { adb(['shell', 'rm', '-f', gallery, ui]); } catch { /* Device lease is still released. */ }
  if (loggedIn) try { adb(['shell', 'pm', 'clear', pkg]); } catch { console.error('QA emulator login state could not be cleared.'); process.exitCode = 1; }
});
