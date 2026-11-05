import express from 'express';
import request from 'supertest';
import { accountReadBudget } from '../middleware/websiteRateLimits';
import { ListingSnapshot, ListingReportUnavailable, buildListingReport, createListingReportProvider } from '../lib/publicListingReport';
import { LISTING_REPORT_RATE_LIMIT, createPublicListingReportRoutes } from '../routes/publicListingReportRoutes';

const base = (over: Partial<ListingSnapshot> = {}): ListingSnapshot => ({
  asOf: '2026-11-05T04:30:00.000Z',
  buckets: [],
  last60Minutes: 0,
  coverageStart: '2026-10-12T09:13:54.811Z',
  latestFirstPublishAt: '2026-11-05T04:00:00.000Z',
  firstPublishedNotPublishedNow: 0,
  records: { total: 0, published: 0, privatePending: 0, withdrawn: 0, publishedWithoutPublishEvent: 0 },
  privatePendingOlderThan24h: 0,
  oldestPrivatePendingSince: null,
  publicSearchEnabled: true,
  publiclyVisible: 0,
  ...over,
});
const build = (snapshot: ListingSnapshot, hours = 48, over: { stale?: boolean; servedAt?: number; targetPerHour?: number | null } = {}) =>
  buildListingReport(snapshot, { hours, servedAt: over.servedAt ?? Date.parse(snapshot.asOf) + 5000, stale: over.stale ?? false, targetPerHour: over.targetPerHour ?? null });
const bucket = (hour: string, firstPublished: number, republished = 0, stillPublished = firstPublished) => ({ hour, firstPublished, republished, stillPublished });

describe('counting', () => {
  test('splits days at Taipei midnight (16:00Z), not at UTC midnight', () => {
    const report = build(base({
      asOf: '2026-11-05T04:30:00.000Z',
      coverageStart: '2026-11-03T15:00:00.000Z',
      buckets: [
        bucket('2026-11-03T15:00:00.000Z', 1), // 11/03 23:00 Taipei
        bucket('2026-11-03T16:00:00.000Z', 2), // 11/04 00:00 Taipei
        bucket('2026-11-04T15:00:00.000Z', 4), // 11/04 23:00 Taipei
        bucket('2026-11-04T16:00:00.000Z', 8), // 11/05 00:00 Taipei
        bucket('2026-11-05T04:00:00.000Z', 16),
      ],
    }));
    expect(report.daily.map(d => [d.date, d.firstPublished])).toEqual([['2026-11-03', 1], ['2026-11-04', 6], ['2026-11-05', 24]]);
    expect(report.successfulListings.today).toMatchObject({ date: '2026-11-05', count: 24, startsAt: '2026-11-04T16:00:00.000Z', partial: true });
    expect(report.successfulListings.yesterday).toMatchObject({ date: '2026-11-04', count: 6, endsAt: '2026-11-04T16:00:00.000Z' });
    expect(report.successfulListings.cumulative.count).toBe(31);
    expect(report.daily[2].partial).toBe(true);
    expect(report.daily[0]).not.toHaveProperty('partial');
  });

  test('a moment on either side of Taipei midnight lands on the right "today"', () => {
    const before = build(base({ asOf: '2026-11-04T15:59:59.000Z', buckets: [bucket('2026-11-04T15:00:00.000Z', 3)] }));
    const after = build(base({ asOf: '2026-11-04T16:00:01.000Z', buckets: [bucket('2026-11-04T15:00:00.000Z', 3)] }));
    expect(before.successfulListings.today).toMatchObject({ date: '2026-11-04', count: 3 });
    expect(after.successfulListings.today).toMatchObject({ date: '2026-11-05', count: 0 });
    expect(after.successfulListings.yesterday).toMatchObject({ date: '2026-11-04', count: 3 });
  });

  test('republished events are reported apart and never add to successes', () => {
    const report = build(base({ buckets: [bucket('2026-11-05T03:00:00.000Z', 1, 5)] }));
    expect(report.successfulListings.cumulative.count).toBe(1);
    expect(report.successfulListings.republishedNotCounted).toBe(5);
    expect(report.hourly.points.find(p => p.hourStart === '2026-11-05T03:00:00.000Z')).toMatchObject({ firstPublished: 1, republishedNotCounted: 5 });
  });

  test('a withdrawal leaves history intact and shows up only as "not published now"', () => {
    const report = build(base({ firstPublishedNotPublishedNow: 1, buckets: [bucket('2026-11-05T03:00:00.000Z', 2, 0, 1)] }));
    expect(report.successfulListings.cumulative.count).toBe(2);
    expect(report.successfulListings.firstPublishedNotPublishedNow).toBe(1);
    expect(report.daily[report.daily.length - 1]).toMatchObject({ firstPublished: 2, stillPublishedNow: 1 });
  });
});

describe('hourly series and gaps', () => {
  test('hours inside coverage with no events are real zeros; the running hour is partial', () => {
    const { points, gaps } = build(base(), 3).hourly;
    expect(points.map(p => p.hourStart)).toEqual(['2026-11-05T02:00:00.000Z', '2026-11-05T03:00:00.000Z', '2026-11-05T04:00:00.000Z']);
    expect(points.map(p => p.firstPublished)).toEqual([0, 0, 0]);
    expect(points[2]).toMatchObject({ partial: true, covered: true });
    expect(points[0]).not.toHaveProperty('partial');
    expect(gaps).toEqual([]);
  });

  test('hours before the event log began stay null and are declared as a gap', () => {
    const { points, gaps } = build(base({ coverageStart: '2026-11-05T03:20:00.000Z', buckets: [bucket('2026-11-05T03:00:00.000Z', 1)] }), 4).hourly;
    expect(points.map(p => p.firstPublished)).toEqual([null, null, 1, 0]);
    expect(points[0]).toMatchObject({ covered: false, republishedNotCounted: null });
    expect(gaps).toEqual([{ from: '2026-11-05T01:00:00.000Z', to: '2026-11-05T03:00:00.000Z', reason: 'BEFORE_EVENT_LOG' }]);
  });

  test('no events at all reports null everywhere, never zero', () => {
    const report = build(base({ coverageStart: null, latestFirstPublishAt: null }), 2);
    const s = report.successfulListings;
    expect([s.last60Minutes.count, s.currentHour.count, s.today.count, s.yesterday.count, s.cumulative.count, s.republishedNotCounted, s.firstPublishedNotPublishedNow]).toEqual([null, null, null, null, null, null, null]);
    expect(report.daily).toEqual([]);
    expect(report.hourly.points.every(p => p.firstPublished === null && p.covered === false)).toBe(true);
    expect(report.hourly.gaps).toHaveLength(1);
    expect(report.measuredRates.last24CompleteHours).toMatchObject({ coveredHours: 0, perHour: null, firstPublished: null });
    expect(report.freshness.secondsSinceLatestFirstPublish).toBeNull();
  });

  test('rates use only finished covered hours as the denominator', () => {
    const report = build(base({
      coverageStart: '2026-11-05T02:10:00.000Z',
      buckets: [bucket('2026-11-05T02:00:00.000Z', 3), bucket('2026-11-05T03:00:00.000Z', 1), bucket('2026-11-05T04:00:00.000Z', 900)],
    }));
    expect(report.measuredRates.last24CompleteHours).toMatchObject({ coveredHours: 2, firstPublished: 4, perHour: 2, to: '2026-11-05T04:00:00.000Z' });
  });
});

describe('target and unavailable values', () => {
  test('the target is not published by default and is never mixed into actuals', () => {
    const report = build(base());
    expect(report.target).toEqual({ kind: 'target_not_actual', state: 'unavailable', reason: 'TARGET_NOT_PUBLISHED', perHour: null, gapFromLast24hAverage: null });
    expect(JSON.stringify(report.successfulListings)).not.toContain('target');
  });

  test('a configured target gives a gap from measured speed only', () => {
    const buckets = [bucket('2026-11-05T03:00:00.000Z', 24)];
    expect(build(base({ buckets }), 48, { targetPerHour: 100 }).target).toMatchObject({ state: 'available', perHour: 100, gapFromLast24hAverage: -99 });
    expect(build(base({ coverageStart: null }), 48, { targetPerHour: 100 }).target).toMatchObject({ perHour: 100, gapFromLast24hAverage: null });
  });

  test('state the server does not hold is null with a reason, not zero', () => {
    const report = build(base());
    for (const value of [report.live.processing, report.pipelineOutcomes.failed, report.pipelineOutcomes.skipped, report.pipelineOutcomes.failureReasons]) {
      expect(value.value).toBeNull();
      expect(value.state).toBe('unavailable');
      expect(value.reason).toMatch(/^[A-Z_]+$/);
    }
    expect(report.estimates).toBeNull();
  });
});

describe('freshness', () => {
  test('age counts from the snapshot; a long publishing lull is not staleness', () => {
    const report = build(base({ latestFirstPublishAt: '2026-11-01T04:30:00.000Z' }), 1, { servedAt: Date.parse('2026-11-05T04:31:00.000Z') });
    expect(report.freshness).toMatchObject({ state: 'fresh', ageSeconds: 60, secondsSinceLatestFirstPublish: 4 * 86400 });
    expect(build(base(), 1, { stale: true }).freshness.state).toBe('stale');
  });
});

describe('provider', () => {
  const setup = (over: { fail?: () => boolean } = {}) => {
    let now = 1_000_000;
    const load = jest.fn(async () => { if (over.fail?.()) throw Object.assign(new Error('postgres://secret@host/db'), { code: 'P1001' }); return base(); });
    const provider = createListingReportProvider({ load, clock: () => now, refreshMs: 120_000, maxStaleMs: 900_000, retryMs: 30_000 });
    return { load, provider, advance: (ms: number) => { now += ms; } };
  };
  let errorLog: jest.SpyInstance;
  beforeEach(() => { errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => errorLog.mockRestore());

  test('serves one load per interval and joins concurrent callers', async () => {
    const { load, provider, advance } = setup();
    await Promise.all([provider(), provider(), provider()]);
    expect(load).toHaveBeenCalledTimes(1);
    advance(119_000);
    await provider();
    expect(load).toHaveBeenCalledTimes(1);
    advance(2_000);
    await provider();
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('a failed refresh serves the last result as stale, then gives up past the limit', async () => {
    let failing = false;
    const { load, provider, advance } = setup({ fail: () => failing });
    await provider();
    failing = true;
    advance(130_000);
    expect(await provider()).toMatchObject({ stale: true });
    expect(load).toHaveBeenCalledTimes(2);
    await provider();
    expect(load).toHaveBeenCalledTimes(2); // backed off, the database is not hammered
    advance(800_000);
    await expect(provider()).rejects.toBeInstanceOf(ListingReportUnavailable);
    failing = false;
    advance(31_000);
    expect(await provider()).toMatchObject({ stale: false });
  });

  test('with no earlier result a failure is unavailable, and logs only a code', async () => {
    const { provider } = setup({ fail: () => true });
    await expect(provider()).rejects.toBeInstanceOf(ListingReportUnavailable);
    expect(JSON.stringify(errorLog.mock.calls)).toContain('P1001');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('secret');
  });

  test('a hung load times out instead of holding requests forever', async () => {
    const provider = createListingReportProvider({ load: () => new Promise(() => undefined), timeoutMs: 5 });
    await expect(provider()).rejects.toBeInstanceOf(ListingReportUnavailable);
  });
});

describe('route', () => {
  const app = (provider: () => Promise<{ snapshot: ListingSnapshot; stale: boolean }> = async () => ({ snapshot: base(), stale: false })) => {
    const server = express();
    server.use('/report', createPublicListingReportRoutes({ provider, clock: () => Date.parse('2026-11-05T04:30:05.000Z') }));
    return server;
  };
  let errorLog: jest.SpyInstance;
  beforeEach(() => { errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => { errorLog.mockRestore(); delete process.env.LISTING_REPORT_DISABLED; delete process.env.LISTING_REPORT_TARGET_PER_HOUR; });

  test('GET returns JSON, is cacheable and asks not to be indexed', async () => {
    const r = await request(app()).get('/report').set('User-Agent', 'minimax-monitor-dot/1.0');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/json');
    expect(r.headers['cache-control']).toBe('public, max-age=60');
    expect(r.headers['x-robots-tag']).toBe('noindex');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(r.body).toMatchObject({ schemaVersion: 1, timeZone: 'Asia/Taipei', asOf: '2026-11-05T04:30:00.000Z' });
    expect(r.body.hourly.requestedHours).toBe(168);
    expect(r.body.hourly.points).toHaveLength(168);
  });

  test('every other method is 405 with Allow: GET', async () => {
    for (const method of ['post', 'put', 'patch', 'delete', 'head'] as const) {
      const r = await request(app())[method]('/report');
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('GET');
    }
  });

  test('rejects unknown parameters and out-of-range hours', async () => {
    for (const query of ['hours=0', 'hours=2161', 'hours=abc', 'hours=-1', 'hours=1.5', 'hours=1&hours=2', 'x=1', 'key=abc']) {
      const r = await request(app()).get('/report?' + query);
      expect(r.status).toBe(400);
      expect(r.body.errorCode).toBe('INVALID_QUERY');
    }
    expect((await request(app()).get('/report?hours=2160')).body.hourly.points).toHaveLength(2160);
  });

  test('rate limits per client with a machine-readable code', async () => {
    const server = app();
    for (let i = 0; i < LISTING_REPORT_RATE_LIMIT; i++) expect((await request(server).get('/report?hours=1')).status).toBe(200);
    const blocked = await request(server).get('/report?hours=1');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ errorCode: 'LISTING_REPORT_RATE_LIMIT' });
    expect(blocked.headers['ratelimit-limit'] ?? blocked.headers['ratelimit']).toBeDefined();
  });

  test('failure is 503 with no numbers and no internal detail', async () => {
    const r = await request(app(async () => { throw new ListingReportUnavailable('postgres://secret'); })).get('/report');
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ errorCode: 'LISTING_REPORT_UNAVAILABLE', retryAfterSeconds: 30 });
    expect(r.headers['retry-after']).toBe('30');
    expect(r.headers['cache-control']).toBe('no-store');
  });

  test('a stale result says so and is not cached downstream', async () => {
    const r = await request(app(async () => ({ snapshot: base(), stale: true }))).get('/report');
    expect(r.status).toBe(200);
    expect(r.body.freshness.state).toBe('stale');
    expect(r.headers['cache-control']).toBe('no-store');
  });

  test('the off switch stops the report without touching the data', async () => {
    process.env.LISTING_REPORT_DISABLED = '1';
    const provider = jest.fn(async () => ({ snapshot: base(), stale: false }));
    const r = await request(app(provider)).get('/report');
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ errorCode: 'LISTING_REPORT_DISABLED' });
    expect(provider).not.toHaveBeenCalled();
  });

  test('only a positive integer publishes the target', async () => {
    for (const value of ['0', '-5', 'abc', '100.5', '']) {
      process.env.LISTING_REPORT_TARGET_PER_HOUR = value;
      expect((await request(app()).get('/report?hours=1')).body.target.state).toBe('unavailable');
    }
    process.env.LISTING_REPORT_TARGET_PER_HOUR = '100';
    expect((await request(app()).get('/report?hours=1')).body.target).toMatchObject({ state: 'available', perHour: 100 });
  });

  test('credentials are ignored: the report does not enter the account or admin paths', async () => {
    const reject = jest.fn((_req, res) => res.status(401).json({ errorCode: 'INVALID_TOKEN' }));
    const server = express();
    server.use(accountReadBudget(reject));
    server.use('/api/public/listing-report', createPublicListingReportRoutes({ provider: async () => ({ snapshot: base(), stale: false }) }));
    const r = await request(server).get('/api/public/listing-report?hours=1').set('Authorization', 'Bearer not-a-real-token').set('x-api-key', 'not-a-real-key');
    expect(r.status).toBe(200);
    expect(reject).not.toHaveBeenCalled();
  });
});

describe('public payload', () => {
  const allowedKeys = new Set(('schemaVersion report timeZone utcOffset asOf servedAt freshness state ageSeconds refreshIntervalSeconds maxStaleSeconds latestFirstPublishAt secondsSinceLatestFirstPublish ' +
    'coverage from to retention retentionNote successfulListings kind last60Minutes count currentHour hourStart partial today date startsAt yesterday endsAt cumulative republishedNotCounted firstPublishedNotPublishedNow ' +
    'daily firstPublished stillPublishedNow hourly requestedHours gaps reason points covered measuredRates last24CompleteHours last168CompleteHours coveredHours perHour target gapFromLast24hAverage ' +
    'live publiclyVisible publicSearchEnabled records total published privatePending withdrawn publishedWithoutPublishEvent waitingToPublish olderThan24h oldestSince processing value ' +
    'pipelineOutcomes failed skipped failureReasons estimates definitions successfulListing deduplication withdrawals zeroVersusNull legacyRecords rates').split(' '));
  const walk = (value: unknown, visit: (key: string | null, leaf: unknown) => void, key: string | null = null): void => {
    if (Array.isArray(value)) value.forEach(item => walk(item, visit, null));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { visit(k, undefined); walk(v, visit, k); }
    else visit(null, value);
  };

  test('contains only allow-listed fields, and no strings that could carry private data', () => {
    const report = build(base({ buckets: [bucket('2026-11-05T03:00:00.000Z', 1)], firstPublishedNotPublishedNow: 1, oldestPrivatePendingSince: '2026-11-01T00:00:00.000Z' }), 2, { targetPerHour: 100 });
    const keys: string[] = [];
    const strings: string[] = [];
    walk(report, (key, leaf) => { if (key) keys.push(key); if (typeof leaf === 'string') strings.push(leaf); });
    expect(keys.filter(key => !allowedKeys.has(key))).toEqual([]);
    const text = JSON.stringify(report);
    for (const pattern of [/https?:\/\//i, /\/Volumes|\/Users\//, /postgres/i, /railway/i, /facebook|shopee|carousell|ruten|dcard/i, /flickr/i, /archiveItemId|canonicalUrl|sellerRoute|pendingFacts|evidence":/, /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/i, /[\w.+-]+@[\w-]+\.\w+/, /09\d{8}/, /\bFB\d{5,}|\bSP\d{5,}|\bCR\d{5,}|\bRT\d{5,}|\bDC\d{5,}/]) {
      expect(text).not.toMatch(pattern);
    }
  });

  test('a report is small enough for an hourly machine read', () => {
    const size = Buffer.byteLength(JSON.stringify(build(base(), 168)));
    expect(size).toBeLessThan(60_000);
  });
});
