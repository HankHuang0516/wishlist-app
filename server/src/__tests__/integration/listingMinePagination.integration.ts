/** Real owner routes, auth middleware, HTTP listener and isolated PostgreSQL. */
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ListingStatus } from '@prisma/client';
import prisma from '../../lib/prisma';
import listingRoutes from '../../routes/listingRoutes';
import { createLoopbackRequest } from './loopbackHttp';

require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Explicit isolated database required');
const secret = 'synthetic-management-pagination-only';
process.env.JWT_SECRET = secret;
const app = express(); app.use(express.json()); app.use('/api/listings', listingRoutes);
const http = createLoopbackRequest(app);
let owner: number, other: number;
const token = (id = owner) => jwt.sign({ id, authVersion: 0 }, secret, { expiresIn: '1h', algorithm: 'HS256' });
const get = (query = '', id = owner) => http.get('/api/listings/mine' + query).set('Authorization', 'Bearer ' + token(id));
const statuses: ListingStatus[] = ['DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'RESERVED', 'SOLD', 'EXPIRED', 'REMOVED'];
const fixtureId = (i: number) => '40000000-0000-4000-8000-' + String(i + 1).padStart(12, '0');
async function seed(count = 107) {
    await prisma.listing.createMany({ data: Array.from({ length: count }, (_, i) => ({
        id: fixtureId(i), ownerUserId: owner, clientListingId: randomUUID(), requestHash: 'synthetic-read-only-fixture',
        title: `Synthetic owner listing ${i}`, status: statuses[i % statuses.length], price: i === 0 ? 0 : i,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, Math.floor(i / 9))),
        publishedAt: new Date('2026-09-01T00:00:00Z'), expiresAt: new Date('2100-10-30T15:59:59.999Z'),
    })) });
    return Array.from({ length: count }, (_, i) => fixtureId(count - 1 - i));
}
beforeAll(async () => {
    const run = randomUUID();
    owner = (await prisma.user.create({ data: { phoneNumber: `mine-${run}-owner`, password: 'synthetic-not-used', name: 'owner' } })).id;
    other = (await prisma.user.create({ data: { phoneNumber: `mine-${run}-other`, password: 'synthetic-not-used', name: 'other' } })).id;
});
beforeEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerUserId: { in: [owner, other] } } });
    await prisma.user.update({ where: { id: owner }, data: { authVersion: 0 } });
});
afterAll(async () => {
    try { await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } }); }
    finally { await prisma.$disconnect(); }
});

describe('private management pagination', () => {
    it('loads all 107 owned rows in 50/50/7 pages including every status and equal creation timestamps', async () => {
        const expected = await seed();
        const all: string[] = [], returnedStatuses = new Set<string>();
        let cursor: string | null = null;
        for (const count of [50, 50, 7]) {
            const result = await get('?limit=50' + (cursor ? '&cursor=' + cursor : ''));
            expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('private, no-store');
            expect(result.body.items).toHaveLength(count);
            for (const row of result.body.items) {
                expect(row.ownerUserId).toBe(owner); expect(row.owner.id).toBe(owner);
                returnedStatuses.add(row.status); all.push(row.id);
            }
            cursor = result.body.nextCursor;
            if (count === 50) expect(cursor).toBe(all[all.length - 1]);
        }
        expect(cursor).toBeNull(); expect(all).toEqual(expected); expect(new Set(all).size).toBe(107);
        expect([...returnedStatuses].sort()).toEqual([...statuses].sort());
        expect((await get('', other)).body).toEqual({ items: [], nextCursor: null });
    });
    it('retains the existing native limit 100 contract', async () => {
        const expected = await seed();
        const first = await get('?limit=100'); expect(first.body.items).toHaveLength(100);
        const last = await get('?limit=100&cursor=' + first.body.nextCursor);
        expect(last.status).toBe(200); expect(last.body.items).toHaveLength(7); expect(last.body.nextCursor).toBeNull();
        expect([...first.body.items, ...last.body.items].map(row => row.id)).toEqual(expected);
    });
    it('rejects foreign and missing cursor IDs identically without leaking another owner or moving the boundary', async () => {
        await seed(12);
        const foreign = await prisma.listing.create({ data: { ownerUserId: other, clientListingId: randomUUID(), requestHash: 'synthetic', title: 'Private other draft' } });
        const a = await get('?limit=2&cursor=' + foreign.id), b = await get('?limit=2&cursor=' + randomUUID());
        expect(a.status).toBe(400); expect(b.status).toBe(400); expect(a.body).toEqual(b.body);
        expect(a.body).toMatchObject({ field: 'cursor', errorCode: 'INVALID_LISTING_INPUT' });
        expect(JSON.stringify(a.body)).not.toContain(foreign.title); expect(a.headers['cache-control']).toBe('private, no-store');
        expect((await get('?limit=2')).body.items.map((row: { id: string }) => row.id)).toEqual([fixtureId(11), fixtureId(10)]);
        expect(await prisma.listing.count({ where: { ownerUserId: owner } })).toBe(12);
    });
    it('reports a cursor deleted between pages rather than claiming the remaining listings are empty', async () => {
        await seed(12); const first = await get('?limit=2');
        await prisma.listing.delete({ where: { id: first.body.nextCursor } });
        const next = await get('?limit=2&cursor=' + first.body.nextCursor);
        expect(next.status).toBe(400); expect(next.body.field).toBe('cursor'); expect(next.body.items).toBeUndefined();
        const reloaded = await get('?limit=2'); expect(reloaded.body.items).toHaveLength(2); expect(reloaded.body.nextCursor).not.toBeNull();
    });
    it('allows an owned removed listing as a boundary and keeps all statuses visible to its owner', async () => {
        await seed(12); const first = await get('?limit=2');
        await prisma.listing.update({ where: { id: first.body.nextCursor }, data: { status: 'REMOVED' } });
        const next = await get('?limit=2&cursor=' + first.body.nextCursor);
        expect(next.status).toBe(200); expect(next.body.items.map((row: { id: string }) => row.id)).toEqual([fixtureId(9), fixtureId(8)]);
    });
    it('keeps an existing boundary stable across a new front row and deletion of an unloaded row; reload reveals new rows', async () => {
        await seed(12); const first = await get('?limit=2');
        const inserted = await prisma.listing.create({ data: { ownerUserId: owner, clientListingId: randomUUID(), requestHash: 'synthetic', title: 'New front row', createdAt: new Date('2026-10-02T00:00:00Z') } });
        await prisma.listing.delete({ where: { id: fixtureId(8) } });
        const next = await get('?limit=100&cursor=' + first.body.nextCursor);
        expect(next.status).toBe(200); expect(next.body.items.map((row: { id: string }) => row.id)).toEqual([9, 7, 6, 5, 4, 3, 2, 1, 0].map(fixtureId));
        expect(next.body.nextCursor).toBeNull(); expect((await get('?limit=2')).body.items[0].id).toBe(inserted.id);
    });
    it('returns no private data and disables caching for absent, forged and revoked sessions', async () => {
        await seed(2);
        const anonymous = await http.get('/api/listings/mine');
        const forged = await http.get('/api/listings/mine').set('Authorization', 'Bearer ' + jwt.sign({ id: owner }, 'wrong'));
        await prisma.user.update({ where: { id: owner }, data: { authVersion: 1 } });
        const revoked = await get();
        for (const response of [anonymous, forged, revoked]) {
            expect(response.status).toBe(401); expect(response.headers['cache-control']).toBe('private, no-store'); expect(response.body.items).toBeUndefined();
        }
    });
    it('rejects malformed, duplicate and unsupported private query fields without writes', async () => {
        await seed(2);
        for (const query of ['?cursor=bad', '?cursor[]=bad', '?limit=0', '?limit=101', '?limit=1.5', '?limit=2&limit=3', '?q=private', '?ownerUserId=' + other]) {
            const response = await get(query); expect(response.status).toBe(400); expect(response.headers['cache-control']).toBe('private, no-store');
        }
        expect(await prisma.listing.count({ where: { ownerUserId: owner } })).toBe(2);
    });
});
