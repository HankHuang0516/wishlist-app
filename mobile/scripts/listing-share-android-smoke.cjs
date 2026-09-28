#!/usr/bin/env node
// Read-only release UI smoke on an already authenticated managed emulator.
// It opens the OS share sheet but never sends a message or creates/deletes goods.
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const serial = process.env.SIM_MANAGER_SERIAL;
if (!process.env.SIM_MANAGER_TOKEN || !/^emulator-\d{4,5}$/.test(serial ?? '')) throw new Error('Managed Android lease required');
const pkg = 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1';
const xmlPath = `/sdcard/wishlist-share-${randomUUID()}.xml`;
const adb = (args, timeout = 25000) => execFileSync('/Users/hank/Library/Android/sdk/platform-tools/adb', ['-s', serial, ...args],
  { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const nodes = xml => (xml.match(/<node\b[^>]*>/g) ?? []).map(line => Object.fromEntries([...line.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]])));
const dump = () => { adb(['shell', 'uiautomator', 'dump', xmlPath]); return nodes(adb(['shell', 'cat', xmlPath])); };
const found = (all, label) => all.find(node => node['content-desc'] === label || node.text === label);
async function waitFor(label) {
  for (let i = 0; i < 12; i++) { const all = dump(); if (found(all, label)) return all; await pause(500); }
  throw new Error(`Expected screen element unavailable: ${label}`);
}
async function tap(label) {
  const node = found(await waitFor(label), label);
  const numbers = node?.bounds?.match(/\d+/g)?.map(Number);
  if (!numbers || numbers.length !== 4) throw new Error(`No bounds for ${label}`);
  adb(['shell', 'input', 'tap', String(Math.floor((numbers[0] + numbers[2]) / 2)), String(Math.floor((numbers[1] + numbers[3]) / 2))]);
  await pause(450);
}
(async () => {
  const installed = adb(['shell', 'dumpsys', 'package', pkg]);
  if (!installed.includes('versionCode=28 ') || !installed.includes('versionName=2.0.11')) throw new Error('Expected internal candidate is not installed');
  adb(['shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`]);
  await waitFor('我的');
  await tap('我的');
  await tap('我的商品 · 閱覽與管理');
  await waitFor('我的商品');
  let tab = '在售';
  if (!found(dump(), '分享連結')) {
    for (const next of ['已保留', '已售出', '已失效', '已移除']) {
      const all = dump();
      const entry = all.find(node => (node['content-desc'] ?? node.text ?? '').startsWith(`${next} (`));
      if (!entry) continue;
      const bounds = entry.bounds?.match(/\d+/g)?.map(Number);
      if (!bounds || bounds.length !== 4) continue;
      adb(['shell', 'input', 'tap', String(Math.floor((bounds[0] + bounds[2]) / 2)), String(Math.floor((bounds[1] + bounds[3]) / 2))]);
      await pause(400);
      if (found(dump(), '分享連結')) { tab = next; break; }
    }
  }
  if (!found(dump(), '分享連結')) throw new Error('No published listing share action found in loaded seller tabs');
  await tap('分享連結');
  const focus = adb(['shell', 'dumpsys', 'window', 'windows']);
  if (!/ChooserActivity|ResolverActivity|sharesheet/i.test(focus)) throw new Error('System share sheet did not open');
  adb(['shell', 'input', 'keyevent', '4']);
  console.log(JSON.stringify({ versionCode: 28, managementEntry: true, publishedListingTab: tab,
    shareActionVisible: true, systemShareSheetOpened: true, messageSent: false, productionDataChanged: false }));
})().catch(error => { console.error(error instanceof Error ? error.message : 'Listing share smoke failed'); process.exitCode = 1; })
  .finally(() => { try { adb(['shell', 'rm', '-f', xmlPath]); } catch { /* supervisor releases device */ } });
