// Explicitly configured partner JSON feed -> private, attributed intake only.
// Nothing runs on import. No source URL, authorization or admin key is bundled.
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { isPublicIpv4 } from '../minimax-vision-bridge/server.mjs';

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const SOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTH_REF = /^(?:contract|consent|license|self):[A-Za-z0-9._/-]{4,160}$/;
const ITEM_FIELDS = ['sourceItemId', 'canonicalUrl', 'imageUrl', 'thumbnailUrl', 'title', 'description',
  'priceTwd', 'condition', 'county', 'district', 'observedAt', 'expiresAt'];
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => fields.includes(key));

export function feedUrl(raw, expectedHost) {
  try {
    const url = new URL(raw);
    if (typeof expectedHost !== 'string' || !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(expectedHost) ||
      url.protocol !== 'https:' || url.hostname !== expectedHost || url.port || url.username || url.password ||
      url.search || url.hash || url.pathname === '/' || raw.length > 2048) throw new Error();
    return url;
  } catch { throw new Error('FEED_URL_UNSAFE'); }
}

export function feedConfig(environment) {
  const sourceId = environment.WISHLIST_FEED_SOURCE_ID;
  const authorizationRef = environment.WISHLIST_FEED_AUTHORIZATION_REF;
  const host = environment.WISHLIST_FEED_HOST;
  const apiOrigin = environment.WISHLIST_FEED_API_ORIGIN;
  const adminKey = environment.WISHLIST_FEED_ADMIN_KEY;
  const intervalMinutes = Number(environment.WISHLIST_FEED_INTERVAL_MINUTES || '15');
  if (!SOURCE_ID.test(sourceId || '') || !AUTH_REF.test(authorizationRef || '') ||
    apiOrigin !== 'https://wishlist-app-production.up.railway.app' ||
    typeof adminKey !== 'string' || !adminKey || adminKey.length > 4096 || /[\u0000-\u001f\u007f]/.test(adminKey) ||
    !Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 1440)
    throw new Error('FEED_CONFIG_INVALID');
  return { sourceId, authorizationRef, host, url: feedUrl(environment.WISHLIST_FEED_URL, host),
    apiOrigin, adminKey, intervalMinutes };
}

export function parseFeedEnvelope(raw, config, now = new Date()) {
  if (!exact(raw, ['version', 'sourceId', 'authorizationRef', 'generatedAt', 'items', 'withdrawals']) ||
    raw.version !== 1 || raw.sourceId !== config.sourceId || raw.authorizationRef !== config.authorizationRef ||
    typeof raw.generatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(raw.generatedAt) ||
    !Number.isFinite(Date.parse(raw.generatedAt)) || Date.parse(raw.generatedAt) > now.getTime() + 5 * 60_000 ||
    now.getTime() - Date.parse(raw.generatedAt) > 24 * 60 * 60_000 ||
    !Array.isArray(raw.items) || raw.items.length > 200 ||
    !Array.isArray(raw.withdrawals) || raw.withdrawals.length > 50) throw new Error('FEED_ENVELOPE_INVALID');
  const seen = new Set();
  for (const item of raw.items) {
    if (!exact(item, ITEM_FIELDS) || typeof item.sourceItemId !== 'string' ||
      !item.sourceItemId || seen.has(item.sourceItemId) || typeof item.observedAt !== 'string' ||
      !Number.isFinite(Date.parse(item.observedAt)) || Date.parse(item.observedAt) > Date.parse(raw.generatedAt) + 5 * 60_000)
      throw new Error('FEED_ITEM_INVALID');
    seen.add(item.sourceItemId);
  }
  for (const withdrawal of raw.withdrawals) {
    if (!exact(withdrawal, ['sourceItemId', 'reason']) || typeof withdrawal.sourceItemId !== 'string' ||
      !withdrawal.sourceItemId || seen.has(withdrawal.sourceItemId) ||
      !['SOLD', 'REMOVED'].includes(withdrawal.reason)) throw new Error('FEED_WITHDRAWAL_INVALID');
    seen.add(withdrawal.sourceItemId);
  }
  // Missing items are not interpreted as sold. They age out through the
  // server's 24-hour freshness gate unless the source sends an explicit signal.
  return { items: raw.items, withdrawals: raw.withdrawals };
}

export async function pinnedFeedJson(url, host, { lookup = dnsLookup, request = https.request } = {}) {
  feedUrl(url.href, host);
  let addresses;
  try { addresses = await lookup(host, { all: true }); } catch { throw new Error('FEED_FETCH_FAILED'); }
  const ipv4 = addresses.filter(entry => entry.family === 4);
  if (!ipv4.length || ipv4.some(entry => !isPublicIpv4(entry.address))) throw new Error('FEED_HOST_UNSAFE');
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', agent: false, timeout: 20_000,
      headers: { Accept: 'application/json' },
      lookup: (_hostname, _options, callback) => callback(null, ipv4[0].address, 4) }, response => {
      const type = String(response.headers['content-type'] || '').split(';')[0].toLowerCase();
      if (response.statusCode !== 200 || type !== 'application/json' ||
        Number(response.headers['content-length'] || 0) > MAX_FEED_BYTES) {
        response.destroy(); reject(new Error('FEED_FETCH_FAILED')); return;
      }
      const chunks = []; let length = 0;
      response.on('data', chunk => {
        length += chunk.length;
        if (length > MAX_FEED_BYTES) { response.destroy(); reject(new Error('FEED_TOO_LARGE')); }
        else chunks.push(chunk);
      });
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('FEED_JSON_INVALID')); }
      });
      response.on('error', () => reject(new Error('FEED_FETCH_FAILED')));
    });
    req.on('error', () => reject(new Error('FEED_FETCH_FAILED')));
    req.on('timeout', () => req.destroy(new Error('FEED_FETCH_FAILED')));
    req.end();
  });
}

export async function syncAuthorizedFeed(config, { fetchFeed = pinnedFeedJson, fetchApi = fetch } = {}) {
  if (!SOURCE_ID.test(config?.sourceId || '') || !AUTH_REF.test(config?.authorizationRef || '') ||
    config?.apiOrigin !== 'https://wishlist-app-production.up.railway.app' ||
    typeof config?.adminKey !== 'string' || !config.adminKey || /[\u0000-\u001f\u007f]/.test(config.adminKey))
    throw new Error('FEED_CONFIG_INVALID');
  feedUrl(config.url?.href, config.host);
  const endpoint = config.apiOrigin + '/api/external-intake';
  const headers = { 'x-admin-key': config.adminKey, 'Content-Type': 'application/json' };
  const api = async (path, method = 'GET', body) => {
    const response = await fetchApi(endpoint + path, { method, redirect: 'error', headers,
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error('FEED_API_' + response.status);
    return response.status === 204 ? null : response.json();
  };
  const source = await api('/sources/' + config.sourceId);
  if (source?.id !== config.sourceId || source.kind !== 'PARTNER_FEED' || source.enabled !== true ||
    !source.enabledAt || source.authorizationRef !== config.authorizationRef ||
    source.canonicalHost !== config.host) throw new Error('FEED_SOURCE_NOT_AUTHORIZED');
  const envelope = parseFeedEnvelope(await fetchFeed(config.url, config.host), config);
  let withdrawn = 0, unmatchedWithdrawals = 0, staged = 0;
  for (const reason of ['SOLD', 'REMOVED']) {
    const sourceItemIds = envelope.withdrawals.filter(item => item.reason === reason).map(item => item.sourceItemId);
    if (!sourceItemIds.length) continue;
    const result = await api('/sources/' + config.sourceId + '/withdraw', 'POST', { reason, sourceItemIds });
    if (result?.publicCount !== 0 || !Number.isInteger(result.withdrawn) || result.withdrawn < 0 ||
      result.withdrawn > sourceItemIds.length || !Number.isInteger(result.unknown ?? 0) ||
      (result.unknown ?? 0) < 0 || result.withdrawn + (result.unknown ?? 0) > sourceItemIds.length)
      throw new Error('FEED_WITHDRAW_ACK_INVALID');
    withdrawn += result.withdrawn;
    unmatchedWithdrawals += result.unknown ?? 0;
  }
  for (let index = 0; index < envelope.items.length; index += 50) {
    const items = envelope.items.slice(index, index + 50);
    const result = await api('/sources/' + config.sourceId + '/candidates', 'POST', { items });
    if (result?.publicCount !== 0 || result.items?.length !== items.length ||
      result.items.some(item => item.status !== 'PENDING_REVIEW' && item.status !== 'APPROVED' && item.status !== 'REJECTED'))
      throw new Error('FEED_INTAKE_ACK_INVALID');
    staged += result.items.length;
  }
  return { kind: 'authorized-private-feed-sync', staged, withdrawn, unmatchedWithdrawals, publishedByBridge: 0 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.length !== 3 || !['--once', '--run'].includes(process.argv[2])) throw new Error('Explicit --once or --run required');
  const config = feedConfig(process.env);
  do {
    try { process.stdout.write(JSON.stringify(await syncAuthorizedFeed(config)) + '\n'); }
    catch (error) {
      const code = /^FEED_[A-Z_]+(?:\d{3})?$/.test(error?.message || '') ? error.message : 'FEED_UNAVAILABLE';
      process.stderr.write('Authorized feed sync unavailable: ' + code + '\n');
      if (process.argv[2] === '--once') process.exitCode = 1;
    }
    if (process.argv[2] === '--run') await new Promise(resolve => setTimeout(resolve, config.intervalMinutes * 60_000));
  } while (process.argv[2] === '--run');
}
