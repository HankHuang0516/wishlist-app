#!/usr/bin/env node
// Anonymous release navigation only, inside an assigned supervised lease.
// Never submits credentials, registers a real account or sends verification mail.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const serial = process.env.SIM_MANAGER_SERIAL;
if (!process.env.SIM_MANAGER_TOKEN || !/^emulator-\d{4,5}$/.test(serial ?? '')) throw new Error('Assigned simulator-manager Android lease required');
const pkg = 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1';
const apk = path.resolve(__dirname, '../android/app/build/outputs/apk/release/app-release.apk');
const directory = process.argv[2], prefix = process.argv[3];
if (!directory || !path.isAbsolute(directory) || !fs.existsSync(directory) || !/^[a-z0-9-]+$/.test(prefix ?? '')) throw new Error('Reviewed absolute output directory and new prefix required');
const names = ['product-notice', 'login', 'register', 'forgot', 'verify-link', 'reset-link'];
const outputs = Object.fromEntries(names.map(name => [name, path.join(directory, prefix + '-' + name + '.png')]));
if (Object.values(outputs).some(file => fs.existsSync(file))) throw new Error('Preserve existing screenshots; use a new run prefix');
const adb = (args, timeout = 20000) => execFileSync('/Users/hank/Library/Android/sdk/platform-tools/adb', ['-s', serial, ...args], { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deviceXml = '/sdcard/wishlist-auth-qa-' + randomUUID() + '.xml', devicePhoto = deviceXml.replace('.xml', '.png');
function nodes(xml) {
  return (xml.match(/<node\b[^>]*>/g) ?? []).map(value => Object.fromEntries([...value.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]])));
}
function bounds(node) {
  const numbers = node.bounds?.match(/\d+/g)?.map(Number);
  if (!numbers || numbers.length !== 4 || numbers[2] <= numbers[0] || numbers[3] <= numbers[1]) throw new Error('No usable observed UI bounds');
  return numbers;
}
function dump() { adb(['shell', 'uiautomator', 'dump', deviceXml]); return adb(['shell', 'cat', deviceXml]); }
async function awaitLabels(labels) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await wait(400); const xml = dump();
    if (labels.every(label => nodes(xml).some(node => node['content-desc'] === label || node.text === label))) return xml;
  }
  throw new Error('Expected anonymous auth UI did not render');
}
async function tapLabel(label) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const xml = dump(), all = nodes(xml);
    const node = all.find(item => item['content-desc'] === label && item.clickable === 'true');
    if (node) { const [x1, y1, x2, y2] = bounds(node); adb(['shell', 'input', 'tap', String(Math.floor((x1 + x2) / 2)), String(Math.floor((y1 + y2) / 2))]); await wait(500); return; }
    const scroll = all.find(item => item.scrollable === 'true'); if (!scroll) break;
    const [x1, y1, x2, y2] = bounds(scroll), x = Math.floor((x1 + x2) / 2), height = y2 - y1;
    adb(['shell', 'input', 'swipe', String(x), String(Math.floor(y1 + height * .8)), String(x), String(Math.floor(y1 + height * .25)), '300']); await wait(300);
  }
  throw new Error('Expected accessible auth navigation button was not reachable');
}
function screenshot(name) { adb(['shell', 'screencap', '-p', devicePhoto]); adb(['pull', devicePhoto, outputs[name]]); }
function openLink(mode) {
  // Synthetic nonce only: prefill is observed; no confirmation button is tapped.
  const url = `weesh://${mode}?token=${'a'.repeat(64)}`;
  const result = adb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-c', 'android.intent.category.BROWSABLE', '-d', url, pkg]);
  if (!/Status: ok/.test(result)) throw new Error('Own-package deep link did not launch');
}
(async () => {
  adb(['install', '-r', apk], 60000); adb(['shell', 'am', 'force-stop', pkg]);
  const start = adb(['shell', 'am', 'start', '-W', '-n', pkg + '/.MainActivity']); if (!/Status: ok/.test(start)) throw new Error('Own app failed to start');
  const noticeXml = await awaitLabels(['WEESH → WISHLIST.AI', '我了解，繼續使用']);
  if (!noticeXml.includes('不會自動匯入舊 Weesh 帳號或資料')) throw new Error('Explicit account migration notice absent');
  screenshot('product-notice'); await tapLabel('我了解，繼續使用');
  await awaitLabels(['Wishlist.ai', '手機號碼或 Email', '密碼']); screenshot('login');
  await tapLabel('建立帳號'); await awaitLabels(['顯示名稱', '手機號碼', 'Email']); screenshot('register');
  await tapLabel('返回登入'); await awaitLabels(['手機號碼或 Email']);
  await tapLabel('忘記密碼'); await awaitLabels(['忘記密碼', '註冊時的 Email']); screenshot('forgot');
  openLink('verify-email'); const verifyXml = await awaitLabels(['驗證 Email', 'Email 驗證連結或驗證碼']);
  if (!verifyXml.includes('不會自動操作或切換登入帳號')) throw new Error('Deep link confirmation notice absent'); screenshot('verify-link');
  openLink('reset-password'); await awaitLabels(['重設密碼', '密碼重設連結或驗證碼', '新密碼']); screenshot('reset-link');
  const pid = adb(['shell', 'pidof', pkg]).trim(); if (!/^\d+$/.test(pid)) throw new Error('Own app is not alive');
  const logs = adb(['logcat', '-d', '--pid=' + pid, '-v', 'brief']); if (/FATAL EXCEPTION|Fatal signal|ReactNativeJS.*(?:TypeError|ReferenceError|Invariant Violation)/i.test(logs)) throw new Error('Native or JavaScript fatal error during navigation');
  adb(['shell', 'am', 'force-stop', pkg]);
  const restart = adb(['shell', 'am', 'start', '-W', '-n', pkg + '/.MainActivity']);
  if (!/Status: ok/.test(restart)) throw new Error('Own app failed to restart');
  const afterRestart = await awaitLabels(['Wishlist.ai', '手機號碼或 Email']);
  if (afterRestart.includes('我了解，繼續使用')) throw new Error('Remembered rebrand notice appeared again');
  console.log(JSON.stringify({ scope: 'anonymous-release-auth-navigation-and-synthetic-deep-link-prefill-not-authenticated-e2e', serial, package: pkg, apkSha256: createHash('sha256').update(fs.readFileSync(apk)).digest('hex'), observedPages: names, productNoticeRememberedAfterRestart: true, syntheticLinksOnly: true, noCredentialOrMailSubmission: true, fatalErrors: false, screenshots: outputs }));
})().catch(() => { console.error('Anonymous auth navigation failed; raw UI, links and process arguments withheld'); process.exitCode = 1; }).finally(() => {
  try { adb(['shell', 'rm', '-f', deviceXml, devicePhoto]); } catch { /* Supervisor releases its owned lease. */ }
});
