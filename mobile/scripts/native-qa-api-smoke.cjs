// Real HTTP and PostgreSQL precursor for native UI QA, NOT native acceptance.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { startNativeQa } = require('./native-qa.cjs');
let step = 'startup';

async function main() {
  const qa = await startNativeQa(process.env.TEST_DATABASE_URL, 120);
  const tokens = {};
  let calls = 0;
  const request = async (route, status = 200, actor, method = 'GET', body) => {
    const headers = {};
    if (actor) headers.Authorization = 'Bearer ' + tokens[actor];
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(qa.apiUrl + '/api' + route, {
      method, headers, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000), redirect: 'error',
    });
    calls++;
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    return response.json();
  };
  try {
    step = 'real-bcrypt-login';
    for (const role of ['buyer', 'seller', 'third']) {
      const actor = qa.actors[role];
      const result = await request('/auth/login', 200, undefined, 'POST', { phoneNumber: actor.email, password: actor.password });
      assert.equal(result.user.id, actor.id); tokens[role] = result.token;
      assert.equal((await request('/users/me', 200, role)).id, actor.id);
    }
    await request('/auth/login', 400, undefined, 'POST', { phoneNumber: qa.actors.buyer.email, password: 'WrongSynthetic123' });
    await request('/auth/login', 404, undefined, 'POST', { phoneNumber: 'not-a-fixture@example.invalid', password: 'Synthetic123' });
    await request('/auth/register', 503, undefined, 'POST', {});
    await request('/auth/forgot-password', 503, undefined, 'POST', {});
    await request('/admin/health', 404);
    await request('/users/me/apikey', 404, 'buyer', 'POST', {});
    await request('/native-wishes/lists', 401);

    step = 'private-wish-and-idempotency';
    const listPayload = { clientRequestId: randomUUID(), title: 'QA 合成願望清單' };
    const list = (await request('/native-wishes/lists', 201, 'buyer', 'POST', listPayload)).resource;
    assert.equal(list.isPublic, false);
    const wishPayload = { clientRequestId: randomUUID(), name: 'Nintendo Switch OLED', maxPrice: 8000 };
    const wish = (await request('/native-wishes/lists/' + list.id + '/items', 201, 'buyer', 'POST', wishPayload)).resource;
    assert.equal((await request('/native-wishes/lists/' + list.id + '/items', 201, 'buyer', 'POST', wishPayload)).resource.id, wish.id);
    await request('/native-wishes/lists/' + list.id + '/items', 409, 'buyer', 'POST', { ...wishPayload, name: 'Different' });
    await request('/native-wishes/lists/' + list.id, 404, 'third');
    await request('/native-wishes/items/' + wish.id, 404, 'third', 'PUT', { name: 'intrusion' });

    step = 'real-photo-publish-expiry-search';
    const sharp = require('../../server/node_modules/sharp');
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#123456' } }).png().toBuffer();
    const photos = [];
    for (let index = 0; index < 2; index++) {
      const form = new FormData(); form.append('clientUploadId', randomUUID());
      form.append('image', new Blob([png], { type: 'image/png' }), 'synthetic.png');
      const photo = await request('/listing-media', 201, 'seller', 'POST', form);
      assert.equal(new URL(photo.imageUrl).origin, qa.apiUrl);
      await request('/listing-media/' + photo.id + '/thumbnail', 404, 'third');
      photos.push(photo);
    }
    const listingPayload = index => ({ clientListingId: randomUUID(), title: 'Nintendo Switch OLED QA ' + index,
      description: '合成測試商品，非真實刊登', category: 'electronics', brand: 'Nintendo', condition: 'USED', price: 7500,
      deliveryMethods: ['MEETUP'], location: { county: '台北市', district: '中山區', latitude: 25.052349, longitude: 121.523456 },
      mediaIds: [photos[index].id], publish: true, consentToMap: true });
    const payload = listingPayload(0);
    const listing = await request('/listings', 201, 'seller', 'POST', payload);
    assert.equal(listing.expiryMode, 'DEFAULT_30_DAYS');
    assert.equal(new Date(listing.expiresAt) - new Date(listing.publishedAt), 30 * 86400000);
    assert.equal((await request('/listings', 200, 'seller', 'POST', payload)).id, listing.id);
    const customDate = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    const custom = await request('/listings', 201, 'seller', 'POST', { ...listingPayload(1), expiryDate: customDate });
    assert.equal(custom.expiryMode, 'CUSTOM_DATE'); assert.equal(custom.expiresAt, customDate + 'T15:59:59.999Z');
    const search = await request('/listings?q=OLED&condition=USED&maxPrice=8000');
    assert.ok(search.items.some(item => item.id === listing.id));
    assert.ok(!JSON.stringify(search).includes('25.052349')); assert.ok(!JSON.stringify(search).includes('121.523456'));
    const thumbnail = await fetch(photos[0].thumbnailUrl, { signal: AbortSignal.timeout(10_000) });
    assert.equal(thumbnail.status, 200); assert.equal(thumbnail.headers.get('content-type'), 'image/webp');
    const metadata = await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.exif, undefined);

    step = 'wish-cross-match-and-outsider';
    assert.ok((await request('/listings/matches?wishItemId=' + wish.id, 200, 'buyer')).items.some(match => match.listing.id === listing.id));
    await request('/listings/matches?wishItemId=' + wish.id, 404, 'third');

    step = 'actual-private-report-route-and-receipt';
    const reportPayload = { clientReportId: randomUUID(), listingId: listing.id, reason: 'FRAUD', details: 'QA 合成檢舉證據，不公開於商品' };
    await request('/listing-reports', 401, undefined, 'POST', reportPayload);
    const report = (await request('/listing-reports', 201, 'buyer', 'POST', reportPayload)).report;
    assert.equal(report.status, 'OPEN');
    assert.equal((await request('/listing-reports', 200, 'buyer', 'POST', reportPayload)).report.id, report.id);
    await request('/listing-reports', 409, 'buyer', 'POST', { ...reportPayload, reason: 'OTHER' });
    assert.deepEqual((await request('/listing-reports/mine', 200, 'buyer')).items.map(item => item.id), [report.id]);
    assert.equal((await request('/listing-reports/receipts/' + reportPayload.clientReportId, 200, 'buyer')).report.id, report.id);
    await request('/listing-reports/receipts/' + reportPayload.clientReportId, 404, 'third');
    assert.deepEqual((await request('/listing-reports/mine', 200, 'third')).items, []);
    await request('/listing-reports', 403, 'seller', 'POST', { ...reportPayload, clientReportId: randomUUID() });
    assert.ok(!JSON.stringify(await request('/listings/' + listing.id)).includes(reportPayload.details));
    await request('/moderation/listing-reports', 404); // No admin credential or namespace in the native fixture.
    const reportHash = body => createHash('sha256').update(JSON.stringify({ listingId: body.listingId, reason: body.reason, details: body.details ?? null })).digest('hex');
    const operationRoute = '/listing-reports/operations/' + reportPayload.clientReportId;
    const operation = await request(operationRoute, 200, 'buyer');
    assert.equal(operation.operation.requestHash, reportHash(reportPayload)); assert.equal(operation.report.id, report.id);
    await request(operationRoute, 404, 'third');
    assert.equal((await request(operationRoute + '/abandon', 200, 'buyer', 'POST', { requestHash: reportHash(reportPayload) })).operation.state, 'RECEIVED');
    const pendingPayload = { ...reportPayload, clientReportId: randomUUID() };
    const pendingRoute = '/listing-reports/operations/' + pendingPayload.clientReportId;
    assert.equal((await request(pendingRoute + '/abandon', 200, 'third', 'POST', { requestHash: reportHash(pendingPayload) })).operation.state, 'ABANDONED');
    await request('/listing-reports', 409, 'third', 'POST', pendingPayload);
    assert.equal((await request(pendingRoute, 200, 'third')).operation.state, 'ABANDONED');

    step = 'buyer-seller-chat-private-meetup';
    const room = await request('/chat/conversations', 201, 'buyer', 'POST', { listingId: listing.id });
    const messagesRoute = '/chat/conversations/' + room.id + '/messages';
    const messagePayload = { clientMessageId: randomUUID(), text: 'QA 買家詢問面交' };
    const message = await request(messagesRoute, 201, 'buyer', 'POST', messagePayload);
    assert.equal((await request(messagesRoute, 200, 'buyer', 'POST', messagePayload)).id, message.id);
    await request(messagesRoute, 201, 'seller', 'POST', { clientMessageId: randomUUID(), text: 'QA 賣家保留的本人訊息' });
    assert.equal((await request(messagesRoute, 200, 'seller')).items.length, 2);
    await request(messagesRoute, 404, 'third');
    const meetupRoute = '/chat/conversations/' + room.id + '/meetup';
    const proposed = await request(meetupRoute, 201, 'buyer', 'POST', {
      clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0,
      terms: { startsAt: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 30, timeZone: 'Asia/Taipei',
        placeName: 'QA 合成面交點', latitude: 25.052349, longitude: 121.523456, notes: '僅測試資料' },
    });
    assert.equal(proposed.appointment.status, 'PROPOSED');
    const confirmed = await request(meetupRoute, 201, 'seller', 'POST', {
      clientActionId: randomUUID(), action: 'CONFIRM', expectedVersion: proposed.appointment.version,
    });
    assert.equal(confirmed.appointment.status, 'CONFIRMED');
    await request(meetupRoute, 404, 'third');
    assert.ok(!JSON.stringify(await request('/listings/' + listing.id)).includes('QA 合成面交點'));

    step = 'deletion-recovery-survivor-and-abandon';
    const preview = await request('/users/me/deletion-impact', 200, 'buyer');
    assert.equal(preview.previewOnly, true); assert.equal(preview.accountDeleted, false);
    assert.equal(preview.version, 2); assert.equal(Object.keys(preview.counts).length, 23);
    assert.equal(preview.counts.reportsAuthored, 1); assert.equal(preview.counts.reportOperationReceipts, 1);
    const action = randomUUID();
    const erased = await request('/users/me', 200, 'buyer', 'DELETE', {
      currentPassword: qa.actors.buyer.password, clientActionId: action, confirmation: 'DELETE_MY_ACCOUNT',
    });
    assert.equal(erased.state, 'ERASED'); assert.equal(erased.accountDeleted, true);
    await request('/users/me', 401, 'buyer');
    await request('/listing-reports/receipts/' + reportPayload.clientReportId, 401, 'buyer');
    await request(operationRoute, 401, 'buyer');
    await request('/listing-reports/receipts/' + reportPayload.clientReportId, 404, 'seller');
    assert.deepEqual(await request('/users/me/deletion-operations/' + action, 200, 'buyer'), erased);
    const survivor = await request('/chat/conversations/' + room.id, 200, 'seller');
    assert.equal(survivor.archived, true); assert.equal(survivor.buyer, null);
    assert.deepEqual((await request(messagesRoute, 200, 'seller')).items.map(item => item.text), ['QA 賣家保留的本人訊息']);
    await request(messagesRoute, 403, 'seller', 'POST', { clientMessageId: randomUUID(), text: '不得發送' });
    await request(meetupRoute, 409, 'seller');
    const abandonId = randomUUID();
    const abandoned = await request('/users/me/deletion-operations/' + abandonId + '/abandon', 200, 'third', 'POST', {});
    assert.equal(abandoned.state, 'ABANDONED'); assert.equal(abandoned.accountDeleted, false);
    await request('/users/me', 409, 'third', 'DELETE', {
      currentPassword: qa.actors.third.password, clientActionId: abandonId, confirmation: 'DELETE_MY_ACCOUNT',
    });
    // Third reporter survives target-owner erasure; only its minimal operation
    // receipt remains. The evidence and target ID must not be copied there.
    const survivorPayload = { ...reportPayload, clientReportId: randomUUID(), listingId: custom.id };
    assert.equal((await request('/listing-reports', 201, 'third', 'POST', survivorPayload)).report.status, 'OPEN');
    // Erase the surviving seller too; captured room IDs must still permit exact
    // cleanup even if both nullable membership FKs have been detached.
    assert.equal((await request('/users/me', 200, 'seller', 'DELETE', {
      currentPassword: qa.actors.seller.password, clientActionId: randomUUID(), confirmation: 'DELETE_MY_ACCOUNT',
    })).photoCleanupPending, 2);
    const survivorRoute = '/listing-reports/operations/' + survivorPayload.clientReportId;
    await request('/listing-reports/receipts/' + survivorPayload.clientReportId, 404, 'third');
    const minimal = await request(survivorRoute, 200, 'third');
    assert.equal(minimal.report, null); assert.equal(minimal.operation.state, 'RECEIVED'); assert.equal(minimal.operation.requestHash, reportHash(survivorPayload));
    assert.ok(!JSON.stringify(minimal).includes(custom.id)); assert.ok(!JSON.stringify(minimal).includes(survivorPayload.details));
    assert.equal((await request(survivorRoute + '/abandon', 200, 'third', 'POST', { requestHash: reportHash(survivorPayload) })).operation.state, 'RECEIVED');
    await request('/listing-reports', 409, 'third', 'POST', survivorPayload);
    step = 'owned-fixture-cleanup';
    const cleanup = await qa.stop();
    console.log(JSON.stringify({ scope: 'REAL_LOCAL_API_NOT_NATIVE_UI', httpChecks: calls + 1, jsonHttpChecks: calls, thumbnailHttpChecks: 1,
      originalStoreIdsAndSigningUntouched: true, productionMutations: 0, cleanup }));
  } finally { await qa.stop(); }
}
main().catch(failure => {
  console.error('Native QA API verification failed at ' + step + '; credentials and response details withheld');
  if (step === 'startup' && /^QA failed at /.test(failure.message)) console.error(failure.message);
  process.exitCode = 1;
});
