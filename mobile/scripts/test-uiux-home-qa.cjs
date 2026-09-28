#!/usr/bin/env node
// Host-only proof that the candidate data can be created through production
// routes in the isolated QA database. No device, production service or store.
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');
const { startNativeQa } = require('./native-qa.cjs');
const { seedUiuxHomeQa } = require('./seed-uiux-home-qa.cjs');

async function main() {
  const database = process.env.TEST_DATABASE_URL;
  assertTestDatabase(database);
  if (process.env.DATABASE_URL !== database) throw new Error('Isolated QA database mismatch');
  let qa, seeded, cleaned;
  try {
    qa = await startNativeQa(database, 180, { visualHomeFixture: true });
    seeded = await seedUiuxHomeQa(qa);
  } finally {
    if (qa) cleaned = await qa.stop();
  }
  if (!seeded || !cleaned || Object.values(cleaned).some(value => value !== 0))
    throw new Error('Visual QA fixture or cleanup incomplete');
  console.log(JSON.stringify({ kind: 'isolated-uiux-home-http-fixture',
    realApiListingCount: seeded.listingIds.length,
    realApiMatchCount: seeded.scores.length,
    matchScores: seeded.scores.map(row => row.score),
    photoSha256: seeded.photoSha256, cleanup: cleaned }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
