// Explicit synthetic-only full-chain QA. Railway credentials are inherited at
// runtime and never written to this project or report output.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');
const express = require('../../server/node_modules/express');
const jwt = require('../../server/node_modules/jsonwebtoken');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');
const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (database !== process.env.DATABASE_URL || process.env.NODE_ENV !== 'test' ||
    !process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN || !process.env.FLICKR_API_KEY)
  throw new Error('MARKETING_QA_ENVIRONMENT_INVALID');

const prisma = require('../../server/dist/lib/prisma').default;
const { ListingFlickrStorage } = require('../../server/dist/lib/listingFlickrStorage');
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/listing-media', require('../../server/dist/routes/listingMediaRoutes').default);
app.use('/api/marketing', require('../../server/dist/routes/marketingRoutes').default);
app.use('/api/internal/marketing', require('../../server/dist/routes/marketingWorkerRoutes').default);
app.use('/api/listings', require('../../server/dist/routes/listingRoutes').default);
const fixture = resolve(__dirname, '../qa-fixtures/synthetic-used-orange-desk-lamp.png');
const EXPECTED_SHA = 'abdaabda6b85bd4037f976638b4b93faf6702c9e1ab0997809e7fa18b4468ab0';
let userId, server, sourceId, listingId, stage = 'setup';
const proof = { passed: false, stages: [], generated: 0, allPrivateBeforeApproval: false,
  selectedRevisionPreserved: false, publicAfterApproval: false, originalRetained: false,
  copyValidated: false, cleanup: false };
function stageIs(value) { stage = value; proof.stages.push(value); }
async function call(base, path, options = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(40_000) });
  if (response.status !== expected) throw new Error(`${stage}:HTTP_${response.status}`);
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : response;
}
function runWorker(api) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [resolve(__dirname, '../../tools/minimax-vision-bridge/marketing-poller.mjs'), '--once'],
      { cwd: resolve(__dirname, '../..'), env: { ...process.env, NODE_ENV: 'test', WISHLIST_MINIMAX_API_URL: api },
        stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', chunk => { out += chunk.toString(); if (out.length > 3000) out = out.slice(-3000); });
    child.stderr.on('data', chunk => { err += chunk.toString(); if (err.length > 3000) err = err.slice(-3000); });
    const timeout = setTimeout(() => child.kill('SIGTERM'), 12 * 60_000);
    child.once('error', rejectRun);
    child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolveRun(out.trim()) : rejectRun(new Error(`${stage}:WORKER_${code}:${err.slice(-300)}`)); });
  });
}

(async () => {
  try {
    process.env.JWT_SECRET = 'isolated-marketing-qa-jwt-only';
    process.env.MARKETING_ASSISTANT_ENABLED = '1';
    process.env.LISTING_MEDIA_STORAGE_PROVIDER = 'flickr';
    const created = await prisma.user.create({ data: { phoneNumber: `marketing-qa-${randomUUID()}`,
      password: 'synthetic-only', isPhoneVerified: true }, select: { id: true } });
    userId = created.id;
    process.env.MARKETING_ASSISTANT_PILOT_USER_ID = String(userId);
    process.env.LISTING_MEDIA_FLICKR_PILOT_USER_ID = String(userId);
    await new Promise(done => { server = app.listen(0, '127.0.0.1', done); });
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    const api = `${origin}/api`;
    process.env.API_URL = api;
    const token = jwt.sign({ id: userId, authVersion: 0 }, process.env.JWT_SECRET);
    const owner = { Authorization: `Bearer ${token}` };
    const original = await readFile(fixture);
    assert.equal(createHash('sha256').update(original).digest('hex'), EXPECTED_SHA);
    stageIs('private-flickr-upload');
    const form = new FormData(); form.append('clientUploadId', randomUUID());
    form.append('capturePurpose', 'BATCH_ITEM');
    form.append('image', new Blob([Uint8Array.from(original)], { type: 'image/png' }), 'synthetic-lamp.png');
    const source = await call(api, '/listing-media', { method: 'POST', headers: owner, body: form }, 201);
    sourceId = source.id;
    assert.ok((await prisma.listingMedia.findUniqueOrThrow({ where: { id: source.id } })).flickrPhotoId);
    await call(origin, new URL(source.imageUrl).pathname, {}, 404);
    stageIs('confirmed-private-draft');
    const sellerDraft = { clientListingId: randomUUID(), form: { title: '合成橘色二手檯燈',
      description: '橘色金屬檯燈一盞，燈罩邊緣可見使用痕跡。實際運作狀態請面交確認。', brand: '', category: 'home',
      condition: 'USED', price: '450' }, touched: { title: true, description: true, price: true } };
    await prisma.listingMedia.update({ where: { id: source.id }, data: { aiDraftStatus: 'COMPLETED' } });
    await call(api, `/listing-media/${source.id}/seller-draft`, { method: 'PUT', headers: { ...owner,
      'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: 0, draft: sellerDraft }) });
    stageIs('marketing-queue');
    const queued = await call(api, '/marketing/jobs', { method: 'POST', headers: { ...owner,
      'Content-Type': 'application/json' }, body: JSON.stringify({ clientRequestId: randomUUID(), sourceMediaId: source.id }) }, 202);
    await call(api, `/marketing/jobs/${queued.id}`, {}, 401);
    await call(origin, new URL(source.imageUrl).pathname, {}, 404);
    stageIs('four-image-generation');
    await runWorker(api);
    const completed = await call(api, `/marketing/jobs/${queued.id}`, { headers: owner });
    assert.equal(completed.status, 'REVIEW');
    assert.equal(completed.generatedMedia.length, 4);
    proof.generated = completed.generatedMedia.length;
    assert.equal(new Set(completed.generatedMedia.map(media => media.id)).size, 4);
    assert.match(completed.copy, /合成橘色二手檯燈/);
    assert.match(completed.copy, /NT\$450/);
    assert.match(completed.copy, /請以實拍照片與面交檢查為準/);
    proof.copyValidated = true;
    stageIs('private-four-image-review');
    for (const media of completed.generatedMedia) {
      await call(origin, new URL(media.imageUrl).pathname, {}, 404);
      const image = await call(origin, new URL(media.imageUrl).pathname, { headers: owner });
      assert.match(image.headers.get('content-type') || '', /^image\/jpeg/);
      assert.ok((await image.arrayBuffer()).byteLength > 5000);
      assert.ok((await prisma.listingMedia.findUniqueOrThrow({ where: { id: media.id } })).flickrPhotoId);
    }
    proof.allPrivateBeforeApproval = true;
    stageIs('one-free-selected-image-revision');
    const revised = await call(api, `/marketing/jobs/${queued.id}/revision`, { method: 'POST', headers: { ...owner,
      'Content-Type': 'application/json' }, body: JSON.stringify({ clientRequestId: randomUUID(),
      slots: [2], prompt: '把第二張背景調得更明亮，檯燈本體維持原始實拍樣貌' }) }, 202);
    await runWorker(api);
    const revisedResult = await call(api, `/marketing/jobs/${revised.id}`, { headers: owner });
    assert.equal(revisedResult.status, 'REVIEW');
    assert.equal(revisedResult.generatedMedia.length, 4);
    assert.notEqual(revisedResult.generatedMedia[1].id, completed.generatedMedia[1].id);
    for (const slot of [0, 2, 3]) assert.equal(revisedResult.generatedMedia[slot].id, completed.generatedMedia[slot].id);
    assert.equal((await prisma.marketingJob.count({ where: { ownerUserId: userId, parentJobId: null } })), 1);
    proof.selectedRevisionPreserved = true;
    stageIs('seller-approval');
    await call(api, `/marketing/jobs/${revised.id}/approve`, { method: 'POST', headers: { ...owner,
      'Content-Type': 'application/json' }, body: JSON.stringify({ selectedMediaIds: revisedResult.generatedMedia.map(media => media.id),
        copy: revisedResult.copy }) });
    const saved = await prisma.listingMedia.findUniqueOrThrow({ where: { id: source.id }, select: { sellerDraft: true } });
    const confirmed = saved.sellerDraft;
    assert.match(confirmed.form.description, /【行銷小助手文案】/);
    stageIs('seller-publication');
    const listing = await call(api, '/listings', { method: 'POST', headers: { ...owner, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientListingId: sellerDraft.clientListingId, title: sellerDraft.form.title,
        description: confirmed.form.description, condition: 'USED', category: 'home', price: 450, currency: 'TWD',
        deliveryMethods: ['MEETUP'], mediaIds: [source.id], publish: true, consentToMap: true,
        location: { county: '臺北市', district: '中正區', latitude: 25.05, longitude: 121.51 } }) }, 201);
    listingId = listing.id;
    assert.equal(listing.media.length, 5);
    assert.equal(listing.media.at(-1).id, source.id);
    assert.equal(listing.media.filter(media => media.capturePurpose === 'AI_MARKETING').length, 4);
    proof.originalRetained = true;
    const publicImage = await call(origin, new URL(listing.media[0].imageUrl).pathname);
    assert.match(publicImage.headers.get('content-type') || '', /^image\/jpeg/);
    proof.publicAfterApproval = true;
    proof.passed = true;
  } catch (error) {
    proof.error = String(error.message || error).slice(0, 300);
    process.exitCode = 1;
  } finally {
    stageIs('cleanup');
    try {
      if (userId) {
        const records = await prisma.listingMedia.findMany({ where: { ownerUserId: userId },
          select: { flickrPhotoId: true } });
        const flickr = new ListingFlickrStorage();
        for (const photoId of records.map(row => row.flickrPhotoId).filter(Boolean)) await flickr.remove(photoId);
        await prisma.user.delete({ where: { id: userId } });
        const remain = await prisma.user.count({ where: { id: userId } });
        assert.equal(remain, 0);
      }
      proof.cleanup = true;
    } catch (error) { proof.cleanup = false; proof.cleanupError = String(error.message || error).slice(0, 180); process.exitCode = 1; }
    if (server) await new Promise(done => server.close(done));
    await prisma.$disconnect();
    console.log(JSON.stringify(proof));
  }
})().catch(error => { console.error(`MARKETING_QA_FATAL:${String(error.message || error).slice(0, 120)}`); process.exitCode = 1; });
