// Explicit host-only integration: synthetic feed -> real admin routes ->
// isolated PostgreSQL. No partner request or production origin is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { feedConfig, syncAuthorizedFeed } from './poller.mjs';

const require = createRequire(import.meta.url);
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');
assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Matching isolated DB bindings required');

const express = require('../../server/node_modules/express');
const request = require('../../server/node_modules/supertest');
const prisma = require('../../server/dist/lib/prisma.js').default;
const { createExternalIntakeRoutes } = require('../../server/dist/routes/externalIntakeRoutes.js');
const minimaxRoute = require('../../server/dist/routes/minimaxRecognitionRoutes.js').default;
const adminKey = 'synthetic-feed-bridge-integration-key';
const workerToken = 'synthetic-feed-bridge-worker-token-at-least-32-chars';
const authorizationRef = 'contract:synthetic-bridge-integration';
const host = 'partner.example.com';
const previousWorkerToken = process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
const previousExternalAi = process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED;
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/external-intake', createExternalIntakeRoutes(() => adminKey));
app.use('/api/internal/minimax-vision', minimaxRoute);

async function routeFetch(url, options) {
  const route = new URL(url);
  assert.equal(route.origin, 'https://wishlist-app-production.up.railway.app');
  const operation = request(app)[options.method.toLowerCase()](route.pathname)
    .set('x-admin-key', options.headers['x-admin-key'])
    .set('x-forwarded-for', '203.0.113.84');
  const received = await (options.body ? operation.send(JSON.parse(options.body)) : operation);
  return new Response(JSON.stringify(received.body), { status: received.status });
}

test('authorized feed bridge keeps AI suggestions private, rejects sold callbacks, and stops after source pause', async () => {
  let sourceId;
  try {
    process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = workerToken;
    process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED = '1';
    const originalPublicCount = await prisma.listing.count();
    const source = await request(app).post('/api/external-intake/sources').set('x-admin-key', adminKey)
      .set('x-forwarded-for', '203.0.113.84').send({ name: 'Synthetic double-north feed bridge',
        kind: 'PARTNER_FEED', canonicalHost: host, imageHost: 'images.example.com', authorizationRef,
        textReuseAllowed: true, imageReuseAllowed: true, aiProcessingAllowed: true });
    assert.equal(source.status, 201);
    sourceId = source.body.id;
    const activation = await request(app).post(`/api/external-intake/sources/${sourceId}/activate`)
      .set('x-admin-key', adminKey).set('x-forwarded-for', '203.0.113.84')
      .send({ authorizationRef, confirmRights: true, confirmAiProcessing: true });
    assert.equal(activation.status, 200);
    const config = feedConfig({ WISHLIST_FEED_SOURCE_ID: sourceId,
      WISHLIST_FEED_AUTHORIZATION_REF: authorizationRef, WISHLIST_FEED_HOST: host,
      WISHLIST_FEED_URL: `https://${host}/authorized-feed.json`,
      WISHLIST_FEED_API_ORIGIN: 'https://wishlist-app-production.up.railway.app',
      WISHLIST_FEED_ADMIN_KEY: adminKey });
    const observedAt = new Date().toISOString();
    const candidate = { sourceItemId: 'synthetic-lamp-1', canonicalUrl: `https://${host}/items/synthetic-lamp-1`,
      imageUrl: 'https://images.example.com/synthetic-lamp-1.jpg',
      thumbnailUrl: 'https://images.example.com/synthetic-lamp-1-small.jpg',
      title: '合成二手檯燈', description: '僅供隔離測試，不是真實供給。', priceTwd: 590,
      condition: 'USED', county: '新北市', district: '板橋區', observedAt,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    const envelope = (items, withdrawals) => ({ version: 1, sourceId, authorizationRef,
      generatedAt: new Date().toISOString(), items, withdrawals });
    const staged = await syncAuthorizedFeed(config, { fetchApi: routeFetch,
      fetchFeed: async () => envelope([candidate], []) });
    assert.deepEqual(staged, { kind: 'authorized-private-feed-sync', staged: 1, withdrawn: 0,
      unmatchedWithdrawals: 0, publishedByBridge: 0 });
    const rows = await prisma.externalListingCandidate.findMany({ where: { sourceId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'PENDING_REVIEW');
    assert.equal(rows[0].aiStatus, 'PENDING');
    assert.equal(await prisma.listing.count(), originalPublicCount);
    const received = await prisma.externalIntakeBatch.findMany({ where: { sourceId } });
    assert.equal(received.length, 1);
    assert.equal(received[0].itemCount, 1);

    const worker = () => request(app).get('/api/internal/minimax-vision/next')
      .set('Authorization', `Bearer ${workerToken}`);
    const result = (jobId) => request(app).post(`/api/internal/minimax-vision/${jobId}/result`)
      .set('Authorization', `Bearer ${workerToken}`).send({ status: 'COMPLETED', result: {
        recognizable: true, name: '藍色桌上檯燈', description: '可見藍色燈罩和底座，功能待賣家確認。',
        category: 'home', brand: null, condition: 'NEW', estimatedPriceLowTwd: 10,
        estimatedPriceHighTwd: 999999, priceBasis: '模型猜測', evidence: ['藍色燈罩', '可見底座'],
        uncertainties: ['無法從圖片確認功能'], confidence: 0.9 } });
    assert.equal((await request(app).get('/api/internal/minimax-vision/next')).status, 404);
    const claimed = await worker();
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.kind, 'EXTERNAL_CANDIDATE');
    assert.equal(claimed.body.imageUrl, candidate.imageUrl);
    assert.equal((await result(claimed.body.jobId)).status, 204);
    const enriched = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: rows[0].id } });
    assert.equal(enriched.status, 'PENDING_REVIEW');
    assert.equal(enriched.aiStatus, 'COMPLETED');
    assert.equal(enriched.aiDraft.title, '藍色桌上檯燈');
    assert.equal(enriched.aiDraft.estimatedPriceLowTwd, undefined);
    assert.equal(enriched.aiDraft.estimatedPriceHighTwd, undefined);
    assert.equal(enriched.aiDraft.condition, undefined);
    assert.equal(enriched.priceTwd.toString(), '590');
    assert.equal(enriched.condition, 'USED');
    assert.equal(await prisma.listing.count(), originalPublicCount);

    const lateCandidate = { ...candidate, sourceItemId: 'synthetic-lamp-2',
      canonicalUrl: `https://${host}/items/synthetic-lamp-2`,
      imageUrl: 'https://images.example.com/synthetic-lamp-2.jpg',
      thumbnailUrl: 'https://images.example.com/synthetic-lamp-2-small.jpg' };
    const stagedLate = await syncAuthorizedFeed(config, { fetchApi: routeFetch,
      fetchFeed: async () => envelope([lateCandidate], []) });
    assert.equal(stagedLate.staged, 1);
    const lateRow = await prisma.externalListingCandidate.findFirstOrThrow({ where: {
      sourceId, sourceItemId: lateCandidate.sourceItemId } });
    const lateJob = await worker();
    assert.equal(lateJob.status, 200);
    assert.equal(lateJob.body.imageUrl, lateCandidate.imageUrl);
    const soldLate = await syncAuthorizedFeed(config, { fetchApi: routeFetch,
      fetchFeed: async () => envelope([], [{ sourceItemId: lateCandidate.sourceItemId, reason: 'SOLD' }]) });
    assert.equal(soldLate.withdrawn, 1);
    assert.equal((await result(lateJob.body.jobId)).status, 409);
    const withdrawnLate = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: lateRow.id } });
    assert.equal(withdrawnLate.status, 'STALE');
    assert.equal(withdrawnLate.aiStatus, 'NOT_ELIGIBLE');
    assert.equal(withdrawnLate.aiDraft, null);
    assert.equal(await prisma.listing.count(), originalPublicCount);

    const sold = await syncAuthorizedFeed(config, { fetchApi: routeFetch,
      fetchFeed: async () => envelope([], [{ sourceItemId: candidate.sourceItemId, reason: 'SOLD' }]) });
    assert.equal(sold.withdrawn, 1);
    assert.equal(sold.publishedByBridge, 0);
    const withdrawn = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: rows[0].id } });
    assert.equal(withdrawn.status, 'STALE');
    assert.equal(withdrawn.aiStatus, 'NOT_ELIGIBLE');
    assert.equal(withdrawn.aiDraft, null);
    assert.equal(await prisma.listing.count(), originalPublicCount);
    assert.equal(await prisma.externalIntakeBatch.count({ where: { sourceId } }), 4);
    assert.equal((await worker()).status, 204);

    const paused = await request(app).post(`/api/external-intake/sources/${sourceId}/pause`)
      .set('x-admin-key', adminKey).set('x-forwarded-for', '203.0.113.84').send({});
    assert.equal(paused.status, 204);
    let fetched = false;
    await assert.rejects(syncAuthorizedFeed(config, { fetchApi: routeFetch,
      fetchFeed: async () => { fetched = true; return envelope([candidate], []); } }), /FEED_SOURCE_NOT_AUTHORIZED/);
    assert.equal(fetched, false);
  } finally {
    if (sourceId) {
      await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId } } });
      await prisma.externalListingCandidate.deleteMany({ where: { sourceId } });
      await prisma.externalIntakeBatch.deleteMany({ where: { sourceId } });
      await prisma.externalListingSource.delete({ where: { id: sourceId } });
    }
    await prisma.$disconnect();
    if (previousWorkerToken === undefined) delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
    else process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = previousWorkerToken;
    if (previousExternalAi === undefined) delete process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED;
    else process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED = previousExternalAi;
  }
});
