import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createLoopbackRequest } from './loopbackHttp';
import prisma from '../../lib/prisma';
import { createSourceLeadAdmin, createSourceLeadRoutes } from '../../routes/sourceLeadRoutes';
import { buildListingReport, loadListingSnapshot } from '../../lib/publicListingReport';
import { createPublicListingReportRoutes } from '../../routes/publicListingReportRoutes';
import { adminRequestBudget } from '../../middleware/websiteRateLimits';

// Real routes and real SQL against an isolated database: every expected number
// is recomputed here from the raw rows, independently of the report's own query.
describe('public listing report against raw records (isolated only)', () => {
  const admin = 'synthetic-report-admin', prefix = 'SYNTHETIC-REPORT-', SECRET_TITLE = '合成私密商品名稱不可外洩';
  const previous = process.env.SOURCE_LEADS_PUBLIC_ENABLED;
  const app = express();
  app.use(express.json());
  app.use(adminRequestBudget(() => admin)); // as in production, so a verified key skips the 30/min guard
  app.use('/api/admin', createSourceLeadAdmin(() => admin));
  app.use('/leads', createSourceLeadRoutes());
  const http = createLoopbackRequest(app);

  const facts = (id: string, title = SECRET_TITLE) => ({ canonicalUrl: 'https://www.facebook.com/groups/123456789/posts/' + id, title, summary: '合成測試來源，不是真實商品。', county: '臺南市', district: '永康區', publicPlaceName: '合成公共面交點', publicAddress: '臺南市永康區合成路123號', latitude: 23, longitude: 120.236, postedEarliestAt: new Date(Date.now() - 86400000).toISOString(), postedLatestAt: new Date(Date.now() - 86400000).toISOString(), checkedAt: new Date().toISOString(), evidence: { sourceUrl: 'https://www.facebook.com/groups/123456789/posts/' + id, sourcePublic: true, publicSourceRef: 'source:synthetic-public', dateRef: 'source:synthetic-date', locationRef: 'source:synthetic-location', coordinateRef: 'source:synthetic-coordinate', locationSourceUrl: 'https://public.example.invalid/place/qa', coordinateSourceUrl: 'https://public.example.invalid/map/qa', publicPlace: true, locationType: 'PUBLIC_MEETING_POINT', sourceMeetingPointConfirmed: true, independentlyReviewed: true, selfWrittenSummary: true, noCopiedTextOrImages: true, noPrivateData: true, reviewRef: 'review:synthetic-legacy-review', sourceCheckRef: 'source:synthetic-' + id } });
  const post = (path: string, body: object) => http.post('/api/admin/records/' + path).set('x-admin-key', admin).send(body);
  const read = async (id: string) => (await http.get('/api/admin/records/' + id).set('x-admin-key', admin)).body;
  const save = (id: string, f: object, old?: any) => post('save', { operationId: randomUUID(), items: [{ archiveItemId: id, expectedRevision: old?.recordRevision ?? 0, expectedStateHash: old?.stateHash ?? null, facts: f }] });
  const publish = (r: any, operationId: string = randomUUID()) => post('publish', { operationId, confirmSourceReference: true, items: [{ id: r.id, expectedRevision: r.recordRevision, expectedStateHash: r.stateHash, pendingHash: r.pendingHash, reviewRef: 'review:synthetic-db-publication' }] });
  const createPublished = async (id: string, f = facts(id)) => { const saved = await save(id, f); expect(saved.status).toBe(200); const r = await read(saved.body.results[0].id); const op = randomUUID(); expect((await publish(r, op)).status).toBe(200); return { id: r.id as string, op, row: r }; };
  const backdateFreshPublishes = (date: string) => prisma.$executeRaw`UPDATE "SourceLeadRecordEvent" SET "createdAt" = ${date}::timestamp WHERE action = 'PUBLISH' AND "leadId" IN (SELECT id FROM "ExternalSourceLead" WHERE "archiveItemId" LIKE ${prefix + '%'}) AND "createdAt" > now() AT TIME ZONE 'UTC' - interval '1 minute'`;

  beforeAll(() => {
    require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Equal isolated DB required');
    process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1';
  });
  const cleanup = async () => {
    const rows = await prisma.externalSourceLead.findMany({ where: { archiveItemId: { startsWith: prefix } }, select: { id: true } });
    await prisma.sourceLeadRecordEvent.deleteMany({ where: { leadId: { in: rows.map(r => r.id) } } });
    await prisma.externalSourceLead.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
  };
  afterEach(cleanup);
  afterAll(async () => {
    if (previous === undefined) delete process.env.SOURCE_LEADS_PUBLIC_ENABLED; else process.env.SOURCE_LEADS_PUBLIC_ENABLED = previous;
    await prisma.$disconnect();
  });

  // Independent recomputation from raw rows; nothing here shares the report's SQL.
  const rawTruth = async () => {
    const leads = await prisma.externalSourceLead.findMany({ select: { id: true, status: true } });
    const status = new Map(leads.map(l => [l.id, l.status]));
    const events = await prisma.sourceLeadRecordEvent.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const success = events.filter(e => e.action === 'PUBLISH' || (e.action === 'AUTO_REFERENCE_SAVE' && (e.afterSnapshot as any)?.result?.autoDisplay?.state === 'DISPLAYED'));
    const seen = new Set<string>(), first: typeof success = [], again: typeof success = [];
    for (const e of success) { (seen.has(e.leadId) ? again : first).push(e); seen.add(e.leadId); }
    return {
      first, again, status,
      firstNotPublished: first.filter(e => status.get(e.leadId) !== 'PUBLISHED').length,
      published: leads.filter(l => l.status === 'PUBLISHED').length,
      pending: leads.filter(l => l.status === 'PRIVATE_PENDING').length,
      withdrawn: leads.filter(l => l.status === 'WITHDRAWN').length,
      total: leads.length,
      publishedNoEvent: leads.filter(l => l.status === 'PUBLISHED' && !seen.has(l.id)).length,
    };
  };

  test('totals equal the raw rows through replay, republish, withdrawal, pending, legacy and auto display', async () => {
    const before = await rawTruth();

    // Published once; the same operation retried replays without a new event.
    const a = await createPublished(prefix + randomUUID());
    expect((await publish(a.row, a.op)).body.replayed).toBe(true);

    // Published, updated and published again: one listing, one republish.
    const bId = prefix + randomUUID();
    const bFacts = facts(bId);
    const b = await createPublished(bId, bFacts);
    const bLive = await read(b.id);
    expect((await save(bId, { ...bFacts, title: '合成改價商品' }, bLive)).status).toBe(200);
    expect((await publish(await read(b.id))).status).toBe(200);

    // Published and then sold: still a success that happened, no longer public.
    const cId = prefix + randomUUID();
    const cFacts = facts(cId);
    const c = await createPublished(cId, cFacts);
    expect((await save(cId, { ...cFacts, sourceClaimState: 'SOLD', stateEvidenceRef: 'source:synthetic-sold' }, await read(c.id))).status).toBe(200);
    expect((await read(c.id)).status).toBe('WITHDRAWN');

    // Saved but never published.
    const pendingId = prefix + randomUUID();
    expect((await save(pendingId, facts(pendingId))).status).toBe(200);

    // Legacy import with no publish event, and an auto display in both outcomes.
    const legacyId = prefix + randomUUID();
    const { sourceCheckRef: _ignored, ...legacyEvidence } = facts(legacyId).evidence;
    expect((await http.post('/api/admin/import').set('x-admin-key', admin).send({ items: [{ ...facts(legacyId), evidence: legacyEvidence, archiveItemId: legacyId, libraryFileId: 'libfile_' + 'a'.repeat(32), archiveVersion: 16, archiveSha256: 'a'.repeat(64) }], dryRun: false })).status).toBe(200);
    const pendingForAuto = async () => { const id = prefix + randomUUID(); return (await save(id, facts(id))).body.results[0].id as string; };
    const autoEvent = (leadId: string, state: string) => prisma.sourceLeadRecordEvent.create({ data: { leadId, operationId: randomUUID(), action: 'AUTO_REFERENCE_SAVE', requestHash: 'h', appliedRevision: 1, afterSnapshot: { result: { autoDisplay: { state } } } } });
    await autoEvent(await pendingForAuto(), 'DISPLAYED');
    await autoEvent(await pendingForAuto(), 'HELD');

    const snapshot = await loadListingSnapshot(prisma, true);
    const report = buildListingReport(snapshot, { hours: 24, servedAt: Date.now(), stale: false, targetPerHour: null });
    const truth = await rawTruth();

    expect(truth.first.length - before.first.length).toBe(4); // a, b, c and the displayed auto save, not the held one
    expect(truth.again.length - before.again.length).toBe(1); // b's republish, and no extra row from a's replay
    expect(report.successfulListings.cumulative.count).toBe(truth.first.length);
    expect(report.successfulListings.republishedNotCounted).toBe(truth.again.length);
    expect(report.successfulListings.firstPublishedNotPublishedNow).toBe(truth.firstNotPublished);
    expect(report.live.records).toEqual({ total: truth.total, published: truth.published, privatePending: truth.pending, withdrawn: truth.withdrawn, publishedWithoutPublishEvent: truth.publishedNoEvent });
    expect(report.daily.reduce((n, d) => n + d.firstPublished, 0)).toBe(truth.first.length);
    expect(report.daily.reduce((n, d) => n + d.stillPublishedNow, 0)).toBe(truth.first.length - truth.firstNotPublished);
    expect(snapshot.buckets.reduce((n, h) => n + h.firstPublished, 0)).toBe(truth.first.length);
    expect(snapshot.last60Minutes).toBe(truth.first.filter(e => e.createdAt.getTime() > Date.parse(snapshot.asOf) - 3600000).length);
    expect(report.freshness.latestFirstPublishAt).toBe(truth.first.map(e => e.createdAt.toISOString()).sort().pop());

    // Visible count agrees with the existing public summary for the same data.
    const summary = await http.get('/leads/summary');
    expect(report.live.publiclyVisible).toEqual({ count: summary.body.count, publicSearchEnabled: true });

    // Aggregates only: nothing from the private rows reaches the public report.
    const text = JSON.stringify(report);
    for (const secret of [SECRET_TITLE, prefix, a.id, b.id, c.id, 'example.invalid', 'facebook.com', '合成路', 'synthetic']) expect(text).not.toContain(secret);
  });

  test('buckets by Taipei day regardless of the database session time zone', async () => {
    // 15:59:59Z is 23:59:59 on day one in Taipei; 16:00:00Z is 00:00:00 on day two.
    await createPublished(prefix + randomUUID());
    await backdateFreshPublishes('2026-09-01T15:59:59');
    await createPublished(prefix + randomUUID());
    await backdateFreshPublishes('2026-09-01T16:00:00');
    const inZone = (zone: string) => ({
      externalSourceLead: prisma.externalSourceLead,
      $transaction: (run: any, options: any) => prisma.$transaction(async tx => { await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`); return run(tx); }, options),
    }) as any;
    const shapes = [];
    for (const zone of ['UTC', 'Asia/Taipei', 'Pacific/Auckland']) {
      const snapshot = await loadListingSnapshot(inZone(zone), false);
      const report = buildListingReport(snapshot, { hours: 1, servedAt: Date.now(), stale: false, targetPerHour: null });
      const dayOne = report.daily.find(d => d.date === '2026-09-01'), dayTwo = report.daily.find(d => d.date === '2026-09-02');
      expect(dayOne?.firstPublished).toBeGreaterThanOrEqual(1);
      expect(dayTwo?.firstPublished).toBeGreaterThanOrEqual(1);
      expect(snapshot.buckets.find(b => b.hour === '2026-09-01T15:00:00.000Z')?.firstPublished).toBe(1);
      expect(snapshot.buckets.find(b => b.hour === '2026-09-01T16:00:00.000Z')?.firstPublished).toBe(1);
      expect(Math.abs(Date.parse(snapshot.asOf) - Date.now())).toBeLessThan(60_000);
      shapes.push(JSON.stringify(report.daily));
    }
    expect(new Set(shapes).size).toBe(1);
  });

  test('a disabled public search reports zero visible without scanning', async () => {
    await createPublished(prefix + randomUUID());
    const snapshot = await loadListingSnapshot(prisma, false);
    expect(snapshot.publicSearchEnabled).toBe(false);
    expect(snapshot.publiclyVisible).toBe(0);
    expect(snapshot.records.published).toBeGreaterThan(0);
  });

  test('a failed visibility scan gives null, not a lost report or a zero', async () => {
    await createPublished(prefix + randomUUID());
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = { $transaction: prisma.$transaction.bind(prisma), externalSourceLead: { findMany: async () => { throw new Error('postgres://secret'); } } } as any;
    const snapshot = await loadListingSnapshot(broken, true);
    expect(snapshot.publiclyVisible).toBeNull();
    expect(snapshot.records.published).toBeGreaterThan(0);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('secret');
    errorLog.mockRestore();
  });

  test('the real route serves the report, and the existing admin routes stay protected', async () => {
    await createPublished(prefix + randomUUID());
    const server = express();
    server.use('/api/public/listing-report', createPublicListingReportRoutes());
    server.use('/admin', createSourceLeadAdmin(() => admin));
    const local = request(server);
    const r = await local.get('/api/public/listing-report?hours=1').set('User-Agent', 'minimax-monitor-dot/1.0');
    expect(r.status).toBe(200);
    expect(r.body.successfulListings.cumulative.count).toBeGreaterThan(0);
    expect((await local.get('/admin/records')).status).toBe(401);
    expect((await local.post('/api/public/listing-report').send({})).status).toBe(405);
  });
});
