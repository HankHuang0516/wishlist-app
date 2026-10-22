'use strict';
// One-off after the contentHash definition changed (2026-10-22: photos / re-check refs no longer count):
// recompute every published lead's contentHash and carry bound seller routes and open inquiry rooms over,
// so existing buyers' consent survives the deploy. Run from server/ against DATABASE_URL after `npm run build`.
// usage: node scripts/recompute-lead-content-hash.cjs [--apply]
const apply = process.argv.includes('--apply');
const { PrismaClient } = require('@prisma/client');
const { parseLead, digest, transferSnapshot } = require('../dist/lib/sourceLeadRules');
const prisma = new PrismaClient();
const input = row => ({ ...Object.fromEntries(['archiveItemId', 'libraryFileId', 'archiveVersion', 'archiveSha256', 'title', 'summary', 'canonicalUrl', 'county', 'district', 'publicPlaceName', 'publicAddress', 'latitude', 'longitude', 'evidence'].map(k => [k, row[k]])),
  postedEarliestAt: row.postedEarliestAt?.toISOString() ?? null, postedLatestAt: row.postedLatestAt?.toISOString() ?? null, checkedAt: row.checkedAt?.toISOString() ?? null });
(async () => {
  const out = { apply, leads: 0, changed: 0, skipped: [], routes: 0, rooms: 0 };
  for (const row of await prisma.externalSourceLead.findMany({ where: { status: 'PUBLISHED' } })) {
    out.leads++;
    let next; try { next = parseLead(input(row), new Date(), row.recordOrigin === 'DB_MASTER').contentHash; } catch (e) { out.skipped.push({ id: row.id, reason: e.message }); continue; }
    if (next === row.contentHash) continue;
    out.changed++;
    const route = row.sellerRoute && typeof row.sellerRoute === 'object' && row.sellerRoute.contentHash === row.contentHash ? { ...row.sellerRoute, contentHash: next } : row.sellerRoute;
    if (route !== row.sellerRoute) out.routes++;
    const rooms = await prisma.sourceLeadInquiry.findMany({ where: { leadId: row.id, leadContentHash: row.contentHash } });
    const updates = rooms.map(r => {
      const oldConsent = digest(transferSnapshot(row, r.events)), newConsent = digest(transferSnapshot({ ...row, contentHash: next }, r.events));
      return { id: r.id, data: { leadContentHash: next, ...(r.consentHash === oldConsent ? { consentHash: newConsent } : {}) } };
    });
    out.rooms += updates.length;
    if (!apply) continue;
    await prisma.$transaction(async tx => {
      await tx.externalSourceLead.update({ where: { id: row.id }, data: { contentHash: next, ...(route !== row.sellerRoute ? { sellerRoute: route } : {}) } });
      for (const u of updates) await tx.sourceLeadInquiry.update({ where: { id: u.id }, data: u.data });
    });
  }
  console.log(JSON.stringify(out));
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exitCode = 1; });
