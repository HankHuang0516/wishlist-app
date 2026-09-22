const assert = require('node:assert/strict');
const { startNativeQa } = require('./native-qa.cjs');
const { MARKETPLACE_FIXTURE, seedNativeMarketplace } = require('./native-qa-marketplace-fixture.cjs');

async function main() {
  const qa = await startNativeQa(process.env.TEST_DATABASE_URL, 60);
  try {
    const fixture = await seedNativeMarketplace(qa);
    assert.equal(fixture.title, MARKETPLACE_FIXTURE.title);
    assert.equal(fixture.cardLabel, MARKETPLACE_FIXTURE.cardLabel);
    assert.match(fixture.listingId, /^[0-9a-f-]{36}$/);
    const cleanup = await qa.stop();
    assert.ok(Object.values(cleanup).every(value => value === 0));
    console.log(JSON.stringify({ kind: 'isolated-native-marketplace-fixture', passed: true, cleanup, credentialsSerialized: false, productionMutations: 0 }));
  } finally { await qa.stop(); }
}

main().catch(() => {
  console.error('Isolated marketplace fixture verification failed; details withheld');
  process.exitCode = 1;
});
