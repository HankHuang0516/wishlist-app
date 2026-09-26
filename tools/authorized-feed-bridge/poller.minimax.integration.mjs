// Opt-in real MiniMax Code QA: an owned synthetic image, an in-process feed
// API, and an isolated PostgreSQL database. Never call a partner or Railway.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { feedConfig, syncAuthorizedFeed } from './poller.mjs';
import { pinnedExternalFetch, recognizeExternalCandidateImage } from '../minimax-vision-bridge/server.mjs';

const require = createRequire(import.meta.url);
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');
assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Matching isolated DB bindings required');

const express = require('../../server/node_modules/express');
const request = require('../../server/node_modules/supertest');
const prisma = require('../../server/dist/lib/prisma.js').default;
const { createExternalIntakeRoutes } = require('../../server/dist/routes/externalIntakeRoutes.js');
const minimaxRoute = require('../../server/dist/routes/minimaxRecognitionRoutes.js').default;
const fixture = fileURLToPath(new URL('../../mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png', import.meta.url));
const imageHost = 'raw.githubusercontent.com';
const imageUrl = 'https://raw.githubusercontent.com/HankHuang0516/wishlist-app/adf7157/mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png';
const host = 'partner.example.com';
const authorizationRef = 'self:synthetic-orange-lamp-qa';
const adminKey = 'synthetic-minimax-feed-integration-admin';
const workerToken = 'synthetic-minimax-feed-integration-worker-token';
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
  const response = await (options.body ? operation.send(JSON.parse(options.body)) : operation);
  return new Response(JSON.stringify(response.body), { status: response.status });
}

async function verifyOwnedFixture() {
  const response = await pinnedExternalFetch(imageUrl, { imageHost });
  assert.equal(response.headers.get('content-type'), 'image/png');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    assert.ok(length <= 8 * 1024 * 1024, 'Synthetic image must remain bounded');
    chunks.push(chunk);
  }
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256(Buffer.concat(chunks)), sha256(readFileSync(fixture)), 'Only the owned synthetic image may reach MiniMax');
}

test('real MiniMax supplements a synthetic authorized feed only in private review', { timeout: 300_000 }, async () => {
  const previousToken = process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
  const previousAi = process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED;
  let sourceId;
  try {
    process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = workerToken;
    process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED = '1';
    await verifyOwnedFixture();
    const publicCount = await prisma.listing.count();
    const source = await request(app).post('/api/external-intake/sources').set('x-admin-key', adminKey)
      .set('x-forwarded-for', '203.0.113.84').send({ name: 'Owned synthetic MiniMax QA feed',
        kind: 'PARTNER_FEED', canonicalHost: host, imageHost, authorizationRef,
        textReuseAllowed: true, imageReuseAllowed: true, aiProcessingAllowed: true });
    assert.equal(source.status, 201);
    sourceId = source.body.id;
    const activation = await request(app).post(`/api/external-intake/sources/${sourceId}/activate`)
      .set('x-admin-key', adminKey).set('x-forwarded-for', '203.0.113.84')
      .send({ authorizationRef, confirmRights: true, confirmAiProcessing: true });
    assert.equal(activation.status, 200);
    const config = feedConfig({ WISHLIST_FEED_SOURCE_ID: sourceId,
      WISHLIST_FEED_AUTHORIZATION_REF: authorizationRef, WISHLIST_FEED_HOST: host,
      WISHLIST_FEED_URL: `https://${host}/synthetic-feed.json`,
      WISHLIST_FEED_API_ORIGIN: 'https://wishlist-app-production.up.railway.app',
      WISHLIST_FEED_ADMIN_KEY: adminKey, WISHLIST_FEED_SYNC_ENABLED: '1' });
    const observedAt = new Date().toISOString();
    const item = { sourceItemId: 'owned-synthetic-orange-lamp',
      canonicalUrl: `https://${host}/items/owned-synthetic-orange-lamp`, imageUrl,
      thumbnailUrl: null, title: '合成二手橘色桌燈',
      description: '僅供隔離測試，不是真實待售商品。', priceTwd: 590,
      condition: 'USED', county: '新北市', district: '板橋區', observedAt,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    const envelope = (items, withdrawals) => ({ version: 1, sourceId, authorizationRef,
      generatedAt: new Date().toISOString(), items, withdrawals });
    const staged = await syncAuthorizedFeed(config, { fetchApi: routeFetch,
      fetchFeed: async () => envelope([item], []) });
    assert.equal(staged.staged, 1);
    assert.equal(staged.publishedByBridge, 0);
    const pending = await prisma.externalListingCandidate.findFirstOrThrow({ where: { sourceId } });
    assert.equal(pending.status, 'PENDING_REVIEW');
    assert.equal(pending.aiStatus, 'PENDING');
    assert.equal(await prisma.listing.count(), publicCount);
    const job = await request(app).get('/api/internal/minimax-vision/next')
      .set('Authorization', `Bearer ${workerToken}`);
    assert.equal(job.status, 200);
    assert.equal(job.body.kind, 'EXTERNAL_CANDIDATE');
    assert.equal(job.body.imageHost, imageHost);
    assert.equal(job.body.imageUrl, imageUrl);
    const suggestion = await recognizeExternalCandidateImage(job.body.imageUrl, job.body.imageHost);
    assert.match(suggestion.name, /燈/);
    assert.equal(suggestion.estimatedPriceLowTwd, null);
    assert.equal(suggestion.estimatedPriceHighTwd, null);
    assert.equal(suggestion.condition, null);
    assert.ok(suggestion.evidence.length >= 2);
    const callback = await request(app).post(`/api/internal/minimax-vision/${job.body.jobId}/result`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ status: 'COMPLETED', result: suggestion });
    assert.equal(callback.status, 204);
    const enriched = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(enriched.status, 'PENDING_REVIEW');
    assert.equal(enriched.aiStatus, 'COMPLETED');
    assert.match(enriched.aiDraft.title, /燈/);
    assert.equal(enriched.aiDraft.condition, undefined);
    assert.equal(enriched.aiDraft.estimatedPriceLowTwd, undefined);
    assert.equal(enriched.aiDraft.estimatedPriceHighTwd, undefined);
    assert.equal(enriched.condition, 'USED');
    assert.equal(enriched.priceTwd.toString(), '590');
    assert.equal(await prisma.listing.count(), publicCount);
    const sold = await syncAuthorizedFeed(config, { fetchApi: routeFetch,
      fetchFeed: async () => envelope([], [{ sourceItemId: item.sourceItemId, reason: 'SOLD' }]) });
    assert.equal(sold.withdrawn, 1);
    const withdrawn = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(withdrawn.status, 'STALE');
    assert.equal(withdrawn.aiDraft, null);
    assert.equal(await prisma.listing.count(), publicCount);
  } finally {
    if (sourceId) {
      await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId } } });
      await prisma.externalListingCandidate.deleteMany({ where: { sourceId } });
      await prisma.externalIntakeBatch.deleteMany({ where: { sourceId } });
      await prisma.externalListingSource.delete({ where: { id: sourceId } });
    }
    await prisma.$disconnect();
    if (previousToken === undefined) delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
    else process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = previousToken;
    if (previousAi === undefined) delete process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED;
    else process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED = previousAi;
  }
});
