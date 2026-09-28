const assert = require('node:assert/strict');
const { startNativeQa } = require('./native-qa.cjs');
const { MARKETPLACE_FIXTURE, VISUAL_MARKETPLACE_FIXTURE, CHAT_VISUAL_MESSAGES, seedNativeMarketplace } = require('./native-qa-marketplace-fixture.cjs');

async function main() {
  const qa = await startNativeQa(process.env.TEST_DATABASE_URL, 60);
  try {
    const fixture = await seedNativeMarketplace(qa, 'seller', 'switch', { seedChatForVisualQa: true });
    assert.equal(fixture.title, MARKETPLACE_FIXTURE.title);
    assert.equal(fixture.cardLabel, MARKETPLACE_FIXTURE.cardLabel);
    assert.equal(fixture.chatSeeded, true);
    assert.equal(CHAT_VISUAL_MESSAGES.length, 5);
    assert.match(fixture.listingId, /^[0-9a-f-]{36}$/);
    const buyerFixture = await seedNativeMarketplace(qa, 'buyer');
    assert.equal(buyerFixture.title, MARKETPLACE_FIXTURE.title);
    assert.notEqual(buyerFixture.listingId, fixture.listingId);
    const visual = await seedNativeMarketplace(qa, 'seller', 'visual-mug');
    assert.equal(visual.title, VISUAL_MARKETPLACE_FIXTURE.title);
    assert.equal(visual.cardLabel, VISUAL_MARKETPLACE_FIXTURE.cardLabel);
    assert.equal(visual.preset, 'visual-mug');
    await assert.rejects(seedNativeMarketplace(qa, 'third'), /owner unavailable/);
    await assert.rejects(seedNativeMarketplace(qa, 'seller', 'unknown'), /preset unavailable/);
    const cleanup = await qa.stop();
    assert.ok(Object.values(cleanup).every(value => value === 0));
    const visualQa = await startNativeQa(process.env.TEST_DATABASE_URL, 60, { marketingVisualOwnerRole: 'seller' });
    let visualCleanup;
    try {
      await seedNativeMarketplace(visualQa, 'seller', 'visual-mug');
      const login = async actor => {
        const response = await fetch(visualQa.apiUrl + '/api/auth/login', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: actor.email, password: actor.password }) });
        assert.equal(response.status, 200);
        return (await response.json()).token;
      };
      const sellerToken = await login(visualQa.actors.seller);
      const buyerToken = await login(visualQa.actors.buyer);
      const get = (route, token) => fetch(visualQa.apiUrl + route, { headers: { Authorization: 'Bearer ' + token } });
      const sellerAvailability = await get('/api/marketing/availability', sellerToken);
      assert.equal(sellerAvailability.status, 200);
      assert.equal(sellerAvailability.headers.get('cache-control'), 'private, no-store');
      assert.equal((await sellerAvailability.json()).available, true);
      const buyerAvailability = await get('/api/marketing/availability', buyerToken);
      assert.equal(buyerAvailability.status, 200);
      assert.equal((await buyerAvailability.json()).available, false);
      const mine = await get('/api/listings/mine?limit=50', sellerToken);
      assert.equal(mine.status, 200);
      const sourceMediaId = (await mine.json()).items[0]?.media[0]?.id;
      assert.match(sourceMediaId, /^[0-9a-f-]{36}$/);
      const latestJob = await get('/api/marketing/jobs?sourceMediaId=' + sourceMediaId, sellerToken);
      assert.equal(latestJob.status, 200);
      assert.equal((await latestJob.json()).job, null);
      const blockedWrite = await fetch(visualQa.apiUrl + '/api/marketing/jobs', { method: 'POST',
        headers: { Authorization: 'Bearer ' + sellerToken, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(blockedWrite.status, 404);
      assert.equal((await blockedWrite.json()).errorCode, 'QA_ROUTE_DISABLED');
    } finally { visualCleanup = await visualQa.stop(); }
    assert.ok(Object.values(visualCleanup).every(value => value === 0));
    console.log(JSON.stringify({ kind: 'isolated-native-marketplace-fixture', passed: true, cleanup,
      marketingVisualCleanup: visualCleanup, marketingVisualReadOnly: true, credentialsSerialized: false, productionMutations: 0 }));
  } finally { await qa.stop(); }
}

main().catch(() => {
  console.error('Isolated marketplace fixture verification failed; details withheld');
  process.exitCode = 1;
});
