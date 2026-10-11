import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { NON_SALE_QA_PREFIX } from '../lib/listingRules';
import { leadCurrent } from '../lib/sourceLeadRules';
import { select as externalSelect, publicCandidate } from './externalListingRoutes';

const router = Router();
router.use(rateLimit({ windowMs: 60000, limit: 30 }));
// Aggregate official publication state only. Never return IDs, contacts, private
// drafts or row contents; viewport/search/check-in do not change published totals.
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (Object.keys(req.query).length) return res.status(400).json({ errorCode: 'EXPLORE_COUNT_QUERY_INVALID' });
  const now = new Date();
  try {
    const result = await prisma.$transaction(async tx => {
      const sellerWhere: Prisma.ListingWhereInput = {
        status: { in: ['ACTIVE', 'RESERVED'] }, expiresAt: { gt: now },
        NOT: { title: { startsWith: NON_SALE_QA_PREFIX } },
      };
      const sellerListings = await tx.listing.count({ where: sellerWhere });
      const sellerExplorable = await tx.listing.count({ where: { ...sellerWhere,
        mapVisibleUntil: { gt: now }, location: { isNot: null } } });
      let sourceReferences = 0, sourceExplorable = 0, sourceCursor: string | undefined;
      // Scan the complete snapshot in bounded pages, including stale PUBLISHED
      // references in publication totals. Freshness remains mandatory for display.
      for (;;) {
        const rows = await tx.externalSourceLead.findMany({ where: { status: 'PUBLISHED',
          NOT: { title: { startsWith: NON_SALE_QA_PREFIX } } }, orderBy: { id: 'asc' }, take: 100,
          ...(sourceCursor ? { cursor: { id: sourceCursor }, skip: 1 } : {}) });
        sourceReferences += rows.length;
        if (process.env.SOURCE_LEADS_PUBLIC_ENABLED === '1') sourceExplorable += rows.filter(row => leadCurrent(row, now)).length;
        if (rows.length < 100) break;
        sourceCursor = rows[rows.length - 1].id;
      }
      let partnerListings = 0, partnerExplorable = 0, partnerCursor: string | undefined;
      for (;;) {
        const rows = await tx.externalListingCandidate.findMany({ where: { status: 'APPROVED',
          NOT: { title: { startsWith: NON_SALE_QA_PREFIX } }, source: { enabled: true } },
          select: externalSelect, orderBy: { id: 'asc' }, take: 100,
          ...(partnerCursor ? { cursor: { id: partnerCursor }, skip: 1 } : {}) });
        // APPROVED is a publication state, not a claim that stock is still live.
        // A disabled public partner rollout is not counted as a public listing.
        if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED === '1') {
          partnerListings += rows.length;
          partnerExplorable += rows.filter(row => publicCandidate(row, now) !== null).length;
        }
        if (rows.length < 100) break;
        partnerCursor = rows[rows.length - 1].id;
      }
      const published = { sellerListings, sourceReferences, partnerListings,
        total: sellerListings + sourceReferences + partnerListings };
      const explorable = { sellerListings: sellerExplorable, sourceReferences: sourceExplorable,
        partnerListings: partnerExplorable, total: sellerExplorable + sourceExplorable + partnerExplorable };
      return { schemaVersion: 1, asOf: now.toISOString(), published, explorable,
        stockVerified: false, scope: 'GLOBAL_PUBLICATION_STATE' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return res.json(result);
  } catch {
    return res.status(503).json({ errorCode: 'EXPLORE_COUNTS_UNAVAILABLE' });
  }
});
export default router;
