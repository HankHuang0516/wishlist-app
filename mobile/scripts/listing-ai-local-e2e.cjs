// Synthetic-only, isolated PostgreSQL + local-photo + real MiniMax Connector QA.
// No store build, production Railway/Flickr credentials, or public listings.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { startNativeQa } = require('./native-qa.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (process.env.DATABASE_URL !== database) throw new Error('Matching isolated QA database required');
const { PrismaClient } = require('../../server/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: database } } });
const fixtures = [
  { name: 'lamp', file: 'synthetic-used-orange-desk-lamp.png',
    sha256: 'abdaabda6b85bd4037f976638b4b93faf6702c9e1ab0997809e7fa18b4468ab0', match: /燈/, defect: /刮|磨|掉漆/ },
  { name: 'mug', file: 'synthetic-used-blue-mug.png',
    sha256: '4bf0d16e92bff216bdf0521ba878886b0a31c734d43ee9363dbc69dda6aa06f9', match: /杯/, defect: /缺|刮|磨/ },
];
let stage = 'start', qa, cleanup;
const report = { passed: false, stage, photos: [], cleanup: null };

async function call(url, options = {}, expected = 200) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (response.status !== expected) throw new Error('QA_HTTP_' + response.status);
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : response;
}

async function main() {
  qa = await startNativeQa(database, 600, { listingAiPilot: true });
  const base = qa.apiUrl + '/api';
  const { recognizeListingImage } = await import('../../tools/minimax-vision-bridge/server.mjs');
  const login = async actor => {
    const result = await call(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: actor.email, password: actor.password }) });
    assert.equal(result.user.id, actor.id);
    return result.token;
  };
  stage = 'authenticate';
  const sellerToken = await login(qa.actors.buyer);
  const outsiderToken = await login(qa.actors.seller);
  const seller = { Authorization: 'Bearer ' + sellerToken };
  const outsider = { Authorization: 'Bearer ' + outsiderToken };
  const worker = { Authorization: 'Bearer ' + qa.callbackToken };
  const reviewed = [];
  await call(base + '/internal/minimax-vision/next', {}, 404);
  for (const fixture of fixtures) {
    stage = 'upload-' + fixture.name;
    const bytes = await fs.readFile(path.join(__dirname, '..', 'qa-fixtures', fixture.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256, 'Only approved synthetic fixture may be uploaded');
    const form = new FormData();
    form.append('clientUploadId', randomUUID());
    form.append('image', new Blob([bytes], { type: 'image/png' }), fixture.file);
    const photo = await call(base + '/listing-media', { method: 'POST', headers: seller, body: form }, 201);
    assert.equal(new URL(photo.imageUrl).origin, qa.apiUrl);
    await call(photo.imageUrl, { headers: outsider }, 404);
    await call(photo.imageUrl, {}, 404);
    await call(photo.imageUrl, { headers: worker }, 404);
    stage = 'queue-' + fixture.name;
    const queued = await call(base + '/listing-media/' + photo.id + '/ai-draft', { method: 'POST', headers: seller }, 202);
    assert.equal(queued.status, 'PENDING');
    await call(base + '/listing-media/' + photo.id + '/ai-draft', { method: 'POST', headers: outsider }, 404);
    const job = await call(base + '/internal/minimax-vision/next', { headers: worker });
    assert.equal(job.kind, 'LISTING_DRAFT');
    assert.equal(job.imageUrl, photo.imageUrl);
    const accessible = await call(photo.imageUrl, { headers: worker });
    assert.match(accessible.headers.get('content-type') || '', /^image\//);
    await accessible.arrayBuffer();
    stage = 'recognize-' + fixture.name;
    const draft = await recognizeListingImage(job.imageUrl, { authToken: qa.callbackToken });
    assert.match(draft.name, fixture.match);
    assert.match(draft.description, fixture.defect);
    assert.equal(draft.category, 'home');
    assert.ok(draft.evidence.length >= 2 && draft.uncertainties.length > 0);
    if (draft.estimatedPriceLowTwd !== null) {
      assert.ok(draft.estimatedPriceHighTwd >= draft.estimatedPriceLowTwd);
      assert.match(draft.priceBasis || '', /未查詢即時市場成交價/);
    }
    stage = 'callback-' + fixture.name;
    await call(base + '/internal/minimax-vision/' + job.jobId + '/result', { method: 'POST', headers: { ...worker, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED', result: draft }) }, 204);
    const state = await call(base + '/listing-media/' + photo.id + '/ai-draft', { headers: seller });
    assert.equal(state.status, 'COMPLETED');
    assert.equal(state.draft.title, draft.name);
    await call(base + '/listing-media/' + photo.id + '/ai-draft', { headers: outsider }, 404);
    await call(photo.imageUrl, { headers: worker }, 404);
    const row = await prisma.listingMedia.findUniqueOrThrow({ where: { id: photo.id } });
    assert.equal(row.ownerUserId, qa.actors.buyer.id);
    assert.equal(row.listingId, null);
    assert.equal(row.wishItemId, null);
    assert.equal(row.aiDraftStatus, 'COMPLETED');
    report.photos.push({ fixture: fixture.name, status: state.status, name: draft.name,
      price: draft.estimatedPriceLowTwd === null ? 'not-justified' : 'reference-only', private: true });
    reviewed.push({ id: photo.id, imageUrl: photo.imageUrl, draft });
  }
  stage = 'not-published-before-seller-confirmation';
  assert.equal((await call(base + '/listings')).items.length, 0);
  stage = 'seller-confirms-one-listing';
  const first = reviewed[0];
  const listing = await call(base + '/listings', { method: 'POST', headers: { ...seller, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientListingId: randomUUID(), title: first.draft.name + ' QA',
      description: first.draft.description + ' 合成測試商品，由賣家確認後才公開。',
      category: first.draft.category, ...(first.draft.brand ? { brand: first.draft.brand } : {}), condition: 'USED', price: 100,
      deliveryMethods: ['MEETUP'], location: { county: '台北市', district: '中山區', latitude: 25.052349, longitude: 121.523456 },
      mediaIds: [first.id], publish: true, consentToMap: true }) }, 201);
  stage = 'seller-confirm-response';
  if (listing.ownerUserId !== qa.actors.buyer.id) throw new Error('QA_OWNER_MISMATCH');
  if (Number(listing.price) !== 100 || listing.currency !== 'TWD') throw new Error('QA_PRICE_MISMATCH');
  stage = 'public-listing-check';
  const visible = await call(base + '/listings');
  assert.deepEqual(visible.items.map(item => item.id), [listing.id]);
  await (await call(first.imageUrl)).arrayBuffer();
  await call(reviewed[1].imageUrl, {}, 404);
  const published = await prisma.listingMedia.findUniqueOrThrow({ where: { id: first.id } });
  const stillPrivate = await prisma.listingMedia.findUniqueOrThrow({ where: { id: reviewed[1].id } });
  assert.equal(published.listingId, listing.id);
  assert.equal(stillPrivate.listingId, null);
  report.photos[0].private = false;
  report.photos[0].publishedAfterConfirmation = true;
  report.photos[1].private = true;
  report.passed = true;
}

main().catch(error => { report.error = /^[A-Z_]+$/.test(error?.message || '') ? error.message : 'QA_ASSERTION_FAILED'; })
  .finally(async () => {
    try { if (qa) cleanup = await qa.stop(); report.cleanup = cleanup;
      const remaining = await prisma.user.count({ where: { phoneNumber: { startsWith: 'native-qa-' + (qa?.runId || '') } } });
      assert.equal(remaining, 0);
    } catch { report.passed = false; report.cleanupError = 'QA_CLEANUP_FAILED'; }
    await prisma.$disconnect();
    report.stage = stage;
    process.stdout.write(JSON.stringify(report) + '\n');
    if (!report.passed || !cleanup) process.exitCode = 1;
  });
