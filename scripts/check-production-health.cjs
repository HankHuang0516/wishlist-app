// Read-only pre-work. Credential value exists only inside this process.
const { execFileSync } = require('node:child_process');
const { setDefaultResultOrder } = require('node:dns');
const { getApiUrl } = require('../server/dist/config/constants');
function classifyCrawlerRecord(record) {
  const detail = [record?.errorMessage, record?.debugMessage].filter(value => typeof value === 'string').join(' ');
  const status = detail.match(/(?:^|\D)(408|429|500|502|503|504)(?:\D|$)/)?.[1] || null;
  let host = null;
  try { host = typeof record?.url === 'string' ? new URL(record.url).hostname : null; } catch { host = 'invalid-url'; }
  return {
    createdAt: record?.createdAt || null,
    host,
    provider: /gemini|generative/i.test(detail) ? 'gemini' : /google/i.test(detail) ? 'google' : 'unknown',
    classification: status ? 'transient-upstream-' + status : 'unclassified',
  };
}
async function main() {
  setDefaultResultOrder('ipv4first');
  const key = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'com.aihankapps.wishlist.admin-key', '-a', 'AiHankApps', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!key) throw new Error('Credential unavailable');
  const origin = getApiUrl();
  const logs = await fetch(origin + '/admin/crawler-logs', { headers: { 'x-admin-key': key }, signal: AbortSignal.timeout(10000) });
  if (!logs.ok) throw new Error('Crawler status unavailable');
  const record = await logs.json();
  console.log(JSON.stringify({ crawlerStatus: logs.status, count: record.count,
    records: Array.isArray(record.logs) ? record.logs.map(classifyCrawlerRecord) : [] }));
  const stats = await fetch(origin + '/admin/stats', { headers: { 'x-admin-key': key }, signal: AbortSignal.timeout(10000) });
  if (!stats.ok) throw new Error('Stats unavailable');
  const counts = await stats.json();
  console.log(JSON.stringify({ statsStatus: stats.status, users: counts.users, wishlists: counts.wishlists,
    items: counts.items, crawlerErrors: counts.crawlerErrors }));
  const health = await fetch(origin + '/admin/health', { signal: AbortSignal.timeout(10000) });
  if (!health.ok) throw new Error('Health unavailable');
  const status = await health.json();
  console.log(JSON.stringify({ healthStatus: health.status, status: status.status, version: status.version }));
  if (record.count > 0) console.log('Production deployment paused: existing crawler error records preserved');
}
main().catch(() => { console.error('Read-only production check unavailable; credential and response details withheld'); process.exitCode = 1; });
