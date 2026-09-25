import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { feedConfig, feedUrl, parseFeedEnvelope, pinnedFeedJson, preflightAuthorizedFeed, syncAuthorizedFeed } from './poller.mjs';

const sourceId = 'f38a84b3-82e8-44a3-9cc0-1f2667655f02';
const authorizationRef = 'contract:synthetic-bridge-test';
const now = new Date('2026-09-25T03:00:00Z');
const environment = {
  WISHLIST_FEED_SOURCE_ID: sourceId,
  WISHLIST_FEED_AUTHORIZATION_REF: authorizationRef,
  WISHLIST_FEED_HOST: 'partner.example.com',
  WISHLIST_FEED_URL: 'https://partner.example.com/listings/feed.json',
  WISHLIST_FEED_API_ORIGIN: 'https://wishlist-app-production.up.railway.app',
  WISHLIST_FEED_ADMIN_KEY: 'synthetic-test-only-key',
};
const config = feedConfig(environment);
const item = (sourceItemId, observedAt = now.toISOString()) => ({ sourceItemId,
  canonicalUrl: `https://partner.example.com/items/${sourceItemId}`,
  imageUrl: `https://images.example.com/items/${sourceItemId}.jpg`,
  thumbnailUrl: `https://images.example.com/items/${sourceItemId}-small.jpg`,
  title: '二手檯燈合成測試', description: '此為測試商品，不對外公開', priceTwd: 590,
  condition: 'USED', county: '新北市', district: '板橋區', observedAt,
  expiresAt: '2026-09-28T03:00:00Z' });
const envelope = (items = [], withdrawals = []) => ({ version: 1, sourceId, authorizationRef,
  generatedAt: now.toISOString(), items, withdrawals });

test('requires explicit source, rights reference, key and production API origin', () => {
  assert.equal(config.url.href, environment.WISHLIST_FEED_URL);
  for (const [key, value] of [
    ['WISHLIST_FEED_ADMIN_KEY', ''], ['WISHLIST_FEED_API_ORIGIN', 'https://evil.example.com'],
    ['WISHLIST_FEED_URL', 'http://partner.example.com/feed.json'],
    ['WISHLIST_FEED_URL', 'https://partner.example.com/feed.json?token=secret'],
    ['WISHLIST_FEED_URL', 'https://127.0.0.1/feed.json'],
    ['WISHLIST_FEED_INTERVAL_MINUTES', '1'],
  ]) assert.throws(() => feedConfig({ ...environment, [key]: value }), /FEED_/);
  assert.throws(() => feedUrl('https://partner.example.com.evil.test/feed.json', 'partner.example.com'), /FEED_URL_UNSAFE/);
});

test('accepts only attributed fresh snapshots and explicit disjoint withdrawal signals', () => {
  assert.deepEqual(parseFeedEnvelope(envelope([item('one')]), config, now).withdrawals, []);
  assert.throws(() => parseFeedEnvelope(envelope([item('one'), item('one')]), config, now), /FEED_ITEM_INVALID/);
  assert.throws(() => parseFeedEnvelope(envelope([item('one')], [{ sourceItemId: 'one', reason: 'SOLD' }]), config, now), /FEED_WITHDRAWAL_INVALID/);
  assert.throws(() => parseFeedEnvelope(envelope([], [{ sourceItemId: 'two', reason: 'UNKNOWN' }]), config, now), /FEED_WITHDRAWAL_INVALID/);
  assert.throws(() => parseFeedEnvelope({ ...envelope(), authorizationRef: 'contract:other-ref' }, config, now), /FEED_ENVELOPE_INVALID/);
  assert.throws(() => parseFeedEnvelope({ ...envelope(), generatedAt: '2026-09-23T03:00:00Z' }, config, now), /FEED_ENVELOPE_INVALID/);
  assert.throws(() => parseFeedEnvelope(envelope([item('one', '2026-09-26T03:00:00Z')]), config, now), /FEED_ITEM_INVALID/);
});

test('refuses private DNS answers before making an HTTPS request', async () => {
  let requested = false;
  await assert.rejects(pinnedFeedJson(config.url, config.host, {
    lookup: async () => [{ family: 4, address: '127.0.0.1' }],
    request: () => { requested = true; throw new Error('must not run'); },
  }), /FEED_HOST_UNSAFE/);
  assert.equal(requested, false);
});

test('pins a public DNS answer and rejects redirects and oversized bodies', async () => {
  const requestFor = (status, bytes) => (_url, options, callback) => {
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    const request = new EventEmitter();
    request.end = () => {
      options.lookup(config.host, {}, (_error, address) => assert.equal(address, '93.184.216.34'));
      options.lookup(config.host, { all: true }, (_error, addresses) =>
        assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]));
      const response = Readable.from([bytes]);
      response.statusCode = status;
      response.headers = { 'content-type': 'application/json' };
      queueMicrotask(() => callback(response));
    };
    request.destroy = () => {};
    return request;
  };
  const transport = { lookup: async () => [{ family: 4, address: '93.184.216.34' }] };
  assert.deepEqual(await pinnedFeedJson(config.url, config.host,
    { ...transport, request: requestFor(200, Buffer.from(JSON.stringify(envelope()))) }), envelope());
  await assert.rejects(pinnedFeedJson(config.url, config.host,
    { ...transport, request: requestFor(302, Buffer.from('{}')) }), /FEED_FETCH_FAILED/);
  await assert.rejects(pinnedFeedJson(config.url, config.host,
    { ...transport, request: requestFor(200, Buffer.alloc(2 * 1024 * 1024 + 1)) }), /FEED_TOO_LARGE/);
});

test('total deadline stops a trickling feed, not just an idle socket', async () => {
  let destroyed = false;
  let ticks = 0;
  const request = (_url, _options, callback) => {
    const req = new EventEmitter();
    let interval;
    req.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-type': 'application/json' };
      response.destroy = () => {};
      callback(response);
      ticks++;
      response.emit('data', Buffer.from(' '));
      interval = setInterval(() => { ticks++; response.emit('data', Buffer.from(' ')); }, 5);
    };
    req.destroy = () => { destroyed = true; clearInterval(interval); };
    return req;
  };
  await assert.rejects(pinnedFeedJson(config.url, config.host, {
    lookup: async () => [{ family: 4, address: '93.184.216.34' }],
    request, deadlineMs: 50,
  }), /FEED_FETCH_TIMEOUT/);
  assert.equal(destroyed, true);
  assert.ok(ticks > 0);
});

test('DNS resolving after the total deadline cannot start a request', async () => {
  let resolveLookup;
  let requested = false;
  const pendingLookup = new Promise(resolve => { resolveLookup = resolve; });
  await assert.rejects(pinnedFeedJson(config.url, config.host, {
    lookup: () => pendingLookup,
    request: () => { requested = true; throw new Error('must not run'); },
    deadlineMs: 10,
  }), /FEED_FETCH_TIMEOUT/);
  resolveLookup([{ family: 4, address: '93.184.216.34' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requested, false);
});

test('checks current source before fetching and sends sold signals before private candidates', async () => {
  const calls = [];
  const fetchApi = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null,
      key: options.headers['x-admin-key'] });
    if (url.endsWith('/sources/' + sourceId) && options.method === 'GET') return new Response(JSON.stringify({
      id: sourceId, kind: 'PARTNER_FEED', enabled: true, enabledAt: now.toISOString(),
      authorizationRef, canonicalHost: config.host,
    }), { status: 200 });
    if (url.endsWith('/withdraw')) return new Response(JSON.stringify({ publicCount: 0, withdrawn: 1, unknown: 1 }), { status: 200 });
    if (url.endsWith('/validate-candidates')) return new Response(JSON.stringify({ validCount: 1,
      publicCount: 0, persistedCount: 0 }), { status: 200 });
    if (url.endsWith('/candidates')) return new Response(JSON.stringify({ publicCount: 0,
      items: [{ sourceItemId: 'one', status: 'PENDING_REVIEW' }] }), { status: 202 });
    throw new Error('unexpected API call');
  };
  const current = new Date().toISOString();
  const result = await syncAuthorizedFeed(config, { fetchApi,
    fetchFeed: async () => ({ ...envelope([item('one', current)], [{ sourceItemId: 'sold-1', reason: 'SOLD' },
      { sourceItemId: 'never-imported', reason: 'SOLD' }]), generatedAt: current }) });
  assert.deepEqual(result, { kind: 'authorized-private-feed-sync', staged: 1, withdrawn: 1, unmatchedWithdrawals: 1, publishedByBridge: 0 });
  assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'POST', 'POST']);
  assert.ok(calls[1].url.endsWith('/withdraw'));
  assert.ok(calls[2].url.endsWith('/validate-candidates'));
  assert.equal(calls[2].body.authorizationRef, authorizationRef);
  assert.ok(calls[3].url.endsWith('/candidates'));
  assert.ok(calls.every(call => call.key === environment.WISHLIST_FEED_ADMIN_KEY));
  assert.ok(calls.every(call => !call.url.includes(config.host)));
  let feedCalled = false;
  await assert.rejects(syncAuthorizedFeed(config, {
    fetchApi: async () => new Response(JSON.stringify({ id: sourceId, kind: 'PARTNER_FEED', enabled: false,
      authorizationRef, canonicalHost: config.host }), { status: 200 }),
    fetchFeed: async () => { feedCalled = true; return envelope(); },
  }), /FEED_SOURCE_NOT_AUTHORIZED/);
  assert.equal(feedCalled, false);
});

test('preflight checks all candidate batches without staging or withdrawing', async () => {
  const calls = [];
  const current = new Date().toISOString();
  const fetchApi = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (options.method === 'GET') return new Response(JSON.stringify({ id: sourceId,
      kind: 'PARTNER_FEED', enabled: true, enabledAt: current,
      authorizationRef, canonicalHost: config.host }), { status: 200 });
    assert.ok(url.endsWith('/validate-candidates'));
    return new Response(JSON.stringify({ validCount: JSON.parse(options.body).items.length,
      publicCount: 0, persistedCount: 0 }), { status: 200 });
  };
  const items = Array.from({ length: 51 }, (_, index) => item('item-' + index, current));
  const result = await preflightAuthorizedFeed(config, { fetchApi, fetchFeed: async () => ({
    ...envelope(items, [{ sourceItemId: 'sold-1', reason: 'SOLD' }]), generatedAt: current,
  }) });
  assert.deepEqual(result, { kind: 'authorized-feed-preflight', validItems: 51,
    withdrawalSignals: 1, persistedByBridge: 0, publishedByBridge: 0 });
  assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'POST']);
  assert.deepEqual(calls.slice(1).map(call => call.body.items.length), [50, 1]);
  assert.ok(calls.slice(1).every(call => call.body.authorizationRef === authorizationRef));
});

test('a later invalid batch cannot partly stage candidates, but sold signals still withdraw', async () => {
  const calls = [];
  const current = new Date().toISOString();
  const fetchApi = async (url, options) => {
    calls.push(url);
    if (options.method === 'GET') return new Response(JSON.stringify({ id: sourceId,
      kind: 'PARTNER_FEED', enabled: true, enabledAt: current,
      authorizationRef, canonicalHost: config.host }), { status: 200 });
    if (url.endsWith('/withdraw')) return new Response(JSON.stringify({ publicCount: 0,
      withdrawn: 1, unknown: 0 }), { status: 200 });
    if (url.endsWith('/validate-candidates')) return calls.filter(call => call.endsWith('/validate-candidates')).length === 2
      ? new Response('{}', { status: 400 }) : new Response(JSON.stringify({ validCount: 50,
        publicCount: 0, persistedCount: 0 }), { status: 200 });
    throw new Error('Candidates must not be staged after failed validation');
  };
  const items = Array.from({ length: 51 }, (_, index) => item('item-' + index, current));
  await assert.rejects(syncAuthorizedFeed(config, { fetchApi, fetchFeed: async () => ({
    ...envelope(items, [{ sourceItemId: 'sold-1', reason: 'SOLD' }]), generatedAt: current,
  }) }), /FEED_API_400/);
  assert.ok(calls[1].endsWith('/withdraw'));
  assert.equal(calls.filter(call => call.endsWith('/validate-candidates')).length, 2);
  assert.equal(calls.some(call => call.endsWith('/candidates')), false);
});
