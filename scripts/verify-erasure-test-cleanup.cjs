// Read-only evidence for this explicit isolated local database. Never load .env.
const { assertTestDatabase } = require('./assert-test-database.cjs');
const { PrismaClient } = require('../server/node_modules/@prisma/client');
async function main() {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  try {
    const counts = await db.$transaction(async tx => ({
      syntheticErasureUsers: await tx.user.count({ where: { OR: ['erasure-http-', 'erasure-core-', 'deletion-preview-', 'native-qa-'].map(prefix => ({ phoneNumber: { startsWith: prefix } })) } }),
      mediaErasureTasks: await tx.mediaErasureTask.count(),
      legacyAssetErasureTasks: await tx.legacyAssetErasureTask.count(),
      accountErasureReceipts: await tx.accountErasureReceipt.count(),
      listingReports: await tx.listingReport.count(),
      listingReportOperations: await tx.listingReportOperation.count(),
      listingModerationActions: await tx.listingModerationAction.count(),
    }), { isolationLevel: 'RepeatableRead' });
    console.log(JSON.stringify(counts));
    if (Object.values(counts).some(count => count !== 0)) throw new Error('Isolated erasure fixture cleanup remains incomplete; no automatic deletion performed');
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Read-only isolated erasure fixture verification failed; connection details withheld'); process.exitCode = 1; });
