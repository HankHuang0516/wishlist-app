import express from 'express';
import request from 'supertest';
import prisma from '../lib/prisma';
import router from '../routes/exploreCountRoutes';
import { NON_SALE_QA_PREFIX } from '../lib/listingRules';

jest.mock('../lib/prisma', () => ({ __esModule: true, default: { $transaction: jest.fn() } }));
jest.mock('../lib/sourceLeadRules', () => ({ leadCurrent: (row: any, now: Date) =>
  now.getTime() - row.checkedAt.getTime() <= 48 * 3600000 }));
jest.mock('../routes/externalListingRoutes', () => ({ select: { id: true },
  publicCandidate: (row: any) => row.valid ? {} : null }));
const app = express(); app.use('/counts', router);
const previous = { source: process.env.SOURCE_LEADS_PUBLIC_ENABLED, external: process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED };
afterAll(() => {
  if (previous.source === undefined) delete process.env.SOURCE_LEADS_PUBLIC_ENABLED; else process.env.SOURCE_LEADS_PUBLIC_ENABLED = previous.source;
  if (previous.external === undefined) delete process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED; else process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = previous.external;
});
beforeEach(() => { jest.clearAllMocks(); process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1'; process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = '1'; });
it('counts a full publication snapshot, not the first page or map check-in; stale source remains separately published', async () => {
  const sourceRows = Array.from({ length: 101 }, (_, i) => ({ id: String(i),
    checkedAt: new Date(Date.now() - (i === 100 ? 49 : 1) * 3600000) }));
  const tx = { listing: { count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1) },
    externalSourceLead: { findMany: jest.fn().mockResolvedValueOnce(sourceRows.slice(0,100)).mockResolvedValueOnce(sourceRows.slice(100)) },
    externalListingCandidate: { findMany: jest.fn().mockResolvedValue([{ id:'partner', valid:true }, { id:'stale', valid:false }]) } };
  (prisma.$transaction as jest.Mock).mockImplementation(async fn => fn(tx));
  const r = await request(app).get('/counts');
  expect(r.status).toBe(200); expect(r.headers['cache-control']).toBe('no-store');
  expect(r.body.published).toEqual({ sellerListings:3, sourceReferences:101, partnerListings:2, total:106 });
  expect(r.body.explorable).toEqual({ sellerListings:1, sourceReferences:100, partnerListings:1, total:102 });
  const base = tx.listing.count.mock.calls[0][0].where;
  expect(base).toMatchObject({ status:{in:['ACTIVE','RESERVED']}, NOT:{title:{startsWith:NON_SALE_QA_PREFIX}} });
  expect(base).not.toHaveProperty('mapVisibleUntil'); expect(base).not.toHaveProperty('location');
  expect(tx.listing.count.mock.calls[1][0].where).toHaveProperty('mapVisibleUntil');
  expect(tx.externalSourceLead.findMany.mock.calls[1][0]).toMatchObject({cursor:{id:'99'},skip:1});
  expect(tx.externalSourceLead.findMany.mock.calls[0][0].where.status).toBe('PUBLISHED');
  expect(tx.externalListingCandidate.findMany.mock.calls[0][0].where.status).toBe('APPROVED');
  expect(JSON.stringify(r.body)).not.toContain('checkedAt'); expect(r.body.stockVerified).toBe(false);
});
it.each(['bbox=121,24,122,25','q=camera','category=books','minPrice=10','cursor=next','checkIn=1','limit=1'])('rejects scope-changing filters %s', async query => {
  expect((await request(app).get('/counts?'+query)).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it('returns unavailable, never a fabricated zero, when the snapshot fails', async () => {
  (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('database unavailable'));
  const r = await request(app).get('/counts'); expect(r.status).toBe(503);
  expect(r.body).toEqual({errorCode:'EXPLORE_COUNTS_UNAVAILABLE'});
});
