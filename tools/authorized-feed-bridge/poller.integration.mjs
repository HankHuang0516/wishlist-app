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
const adminKey = 'synthetic-feed-bridge-integration-key';
const authorizationRef = 'contract:synthetic-bridge-integration';
const host = 'partner.example.com';
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/external-intake', createExternalIntakeRoutes(() => adminKey));

async function routeFetch(url, options) {
  const route = new URL(url);
  assert.equal(route.origin, 'https://wishlist-app-production.up.railway.app');
  const operation = request(app)[options.method.toLowerCase()](route.pathname)
    .set('x-admin-key', options.headers['x-admin-key'])
    .set('x-forwarded-for', '203.0.113.84');
  const received = await (options.body ? operation.send(JSON.parse(options.body)) : operation);
  return new Response(JSON.stringify(received.body), { status: received.status });
}

test('authorized feed bridge stages only private candidates, withdraws sold items, and stops after source pause', async () => {
  let sourceId;
  try {
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

    const sold = await syncAuthorizedFeed(config, { fetchApi: routeFetch,
      fetchFeed: async () => envelope([], [{ sourceItemId: candidate.sourceItemId, reason: 'SOLD' }]) });
    assert.equal(sold.withdrawn, 1);
    assert.equal(sold.publishedByBridge, 0);
    const withdrawn = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: rows[0].id } });
    assert.equal(withdrawn.status, 'STALE');
    assert.equal(withdrawn.aiStatus, 'NOT_ELIGIBLE');
    assert.equal(await prisma.listing.count(), originalPublicCount);
    assert.equal(await prisma.externalIntakeBatch.count({ where: { sourceId } }), 2);

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
  }
});
