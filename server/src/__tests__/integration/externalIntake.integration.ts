import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import { createExternalIntakeRoutes } from '../../routes/externalIntakeRoutes';
import { expireExternalCandidates } from '../../lib/externalCandidateExpiry';
import externalListingRoutes from '../../routes/externalListingRoutes';

const { assertTestDatabase } = require('../../../../scripts/assert-test-database.cjs');
assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Explicit matching test database configuration required');

const adminKey = 'synthetic-external-intake-integration-key-not-a-production-secret';
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/external-intake', createExternalIntakeRoutes(() => adminKey));
app.use('/api/external-listings', externalListingRoutes);
const url = '/api/external-intake';
const sourceBody = { name: 'Synthetic Taipei partner', kind: 'PARTNER_FEED', canonicalHost: 'partner.example.com',
    imageHost: 'images.example.com', authorizationRef: 'contract:synthetic-test-2026', textReuseAllowed: true,
    imageReuseAllowed: true, aiProcessingAllowed: false };
const candidate = () => ({ sourceItemId: 'test-1', canonicalUrl: 'https://partner.example.com/items/1',
    imageUrl: 'https://images.example.com/items/1.jpg', thumbnailUrl: 'https://images.example.com/items/1-320.jpg',
    title: '二手檯燈合成測試', description: '合成測試資料，並非真實待售商品。',
    priceTwd: 590, condition: 'USED', county: '新北市', district: '板橋區', observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
let sourceId: string;
afterAll(async () => {
    if (sourceId) {
        await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId } } });
        await prisma.externalListingCandidate.deleteMany({ where: { sourceId } });
        await prisma.externalIntakeBatch.deleteMany({ where: { sourceId } });
        await prisma.externalListingSource.delete({ where: { id: sourceId } });
    }
    await prisma.$disconnect();
});

describe('admin-only attributed external supply staging', () => {
    it('is closed without the header and requires separate authorization activation', async () => {
        expect((await request(app).get(url + '/sources')).status).toBe(401);
        expect((await request(app).get(url + '/sources?key=' + encodeURIComponent(adminKey)).set('x-admin-key', adminKey)).status).toBe(400);
        const created = await request(app).post(url + '/sources').set('x-admin-key', adminKey).send(sourceBody);
        expect(created.status).toBe(201); sourceId = created.body.id;
        expect(created.body).toMatchObject({ enabled: false, authorizationRef: sourceBody.authorizationRef });
        expect((await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey).send({ items: [candidate()] })).status).toBe(404);
        expect((await request(app).post(`${url}/sources/${sourceId}/activate`).set('x-admin-key', adminKey)
            .send({ authorizationRef: 'contract:wrong', confirmRights: true })).status).toBe(400);
        const enabled = await request(app).post(`${url}/sources/${sourceId}/activate`).set('x-admin-key', adminKey)
            .send({ authorizationRef: sourceBody.authorizationRef, confirmRights: true });
        expect(enabled.status).toBe(200); expect(enabled.body.enabled).toBe(true);
    });
    it('atomically stages sourced records and never inserts public seller listings', async () => {
        const originalCount = await prisma.listing.count();
        const bad = await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey)
            .send({ items: [candidate(), { ...candidate(), sourceItemId: 'test-2', canonicalUrl: 'https://evil.example/items/2' }] });
        expect(bad.status).toBe(400);
        expect(await prisma.externalListingCandidate.count({ where: { sourceId } })).toBe(0);
        expect(await prisma.externalIntakeBatch.count({ where: { sourceId } })).toBe(0);
        const staged = await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey).send({ items: [candidate()] });
        expect(staged.status).toBe(202); expect(staged.body).toMatchObject({ publicCount: 0,
            intakeBatchId: expect.any(String),
            items: [{ sourceItemId: 'test-1', status: 'PENDING_REVIEW', aiStatus: 'NOT_ELIGIBLE', changed: true }] });
        expect((await request(app).get(`${url}/sources/${sourceId}/intake-batches`)).status).toBe(401);
        expect((await request(app).get(`${url}/sources/${sourceId}/intake-batches`).set('x-admin-key', adminKey)
            .query({ cursor: 'not-a-uuid' })).status).toBe(400);
        const history = await request(app).get(`${url}/sources/${sourceId}/intake-batches`).set('x-admin-key', adminKey);
        expect(history.status).toBe(200);
        expect(history.headers['cache-control']).toBe('private, no-store');
        expect(history.body).toMatchObject({ nextCursor: null, items: [{ id: staged.body.intakeBatchId,
            sourceId, authorizationRef: sourceBody.authorizationRef, itemCount: 1,
            sourceEnabledAt: expect.any(String), observations: [{
                sourceItemIdSha256: createHash('sha256').update('test-1').digest('hex'),
                canonicalUrlSha256: createHash('sha256').update(candidate().canonicalUrl).digest('hex'),
                contentHash: expect.stringMatching(/^[0-9a-f]{64}$/), status: 'PENDING_REVIEW', changed: true }] }] });
        expect(JSON.stringify(history.body.items[0].observations)).not.toContain('二手檯燈');
        expect(JSON.stringify(history.body.items[0].observations)).not.toContain('test-1');
        expect(JSON.stringify(history.body.items[0].observations)).not.toContain('https://partner.example.com/items/1');
        expect(await prisma.listing.count()).toBe(originalCount);
        const repeated = await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey).send({ items: [candidate()] });
        expect(repeated.status).toBe(202);
        expect(repeated.body.items[0].changed).toBe(false);
        expect(await prisma.externalListingCandidate.count({ where: { sourceId } })).toBe(1);
        expect(await prisma.externalIntakeBatch.count({ where: { sourceId } })).toBe(2);
        const rows = await request(app).get(url + '/candidates').set('x-admin-key', adminKey);
        expect(rows.status).toBe(200); expect(rows.headers['cache-control']).toBe('private, no-store');
        expect(rows.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId, canonicalUrl: 'https://partner.example.com/items/1' })]));
    });
    it('pages private batch receipts without accepting another source cursor', async () => {
        const source = await prisma.externalListingSource.create({ data: {
            name: 'Synthetic receipt pagination partner', kind: 'PARTNER_FEED', canonicalHost: 'partner.example.com',
            authorizationRef: 'contract:synthetic-pagination-2026', enabled: true, enabledAt: new Date(),
        } });
        try {
            await prisma.externalIntakeBatch.createMany({ data: Array.from({ length: 26 }, (_, index) => ({
                id: randomUUID(), sourceId: source.id, authorizationRef: source.authorizationRef,
                sourceEnabledAt: source.enabledAt!, receivedAt: new Date(Date.now() - index * 1000),
                itemCount: 1, observations: [{ sourceItemIdSha256: createHash('sha256').update(`synthetic-${index}`).digest('hex') }],
            })) });
            const page = await request(app).get(`${url}/sources/${source.id}/intake-batches`).set('x-admin-key', adminKey);
            expect(page.status).toBe(200);
            expect(page.body.items).toHaveLength(25);
            expect(page.body.nextCursor).toEqual(page.body.items[24].id);
            const later = await request(app).get(`${url}/sources/${source.id}/intake-batches`).set('x-admin-key', adminKey)
                .query({ cursor: page.body.nextCursor });
            expect(later.status).toBe(200);
            expect(later.body.items).toHaveLength(1);
            expect(later.body.nextCursor).toBeNull();
            expect(page.body.items.map((row: { id: string }) => row.id)).not.toContain(later.body.items[0].id);
            expect((await request(app).get(`${url}/sources/${sourceId}/intake-batches`).set('x-admin-key', adminKey)
                .query({ cursor: page.body.nextCursor })).status).toBe(400);
        } finally {
            await prisma.externalIntakeBatch.deleteMany({ where: { sourceId: source.id } });
            await prisma.externalListingSource.delete({ where: { id: source.id } });
        }
    });
    it('withdraws sold source items immediately and requires a new review after re-import', async () => {
        const previousFlag = process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;
        process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = '1';
        const admin = (path: string) => request(app).post(url + path).set('x-admin-key', adminKey)
            .set('x-forwarded-for', '203.0.113.93');
        const created = await admin('/sources').send({ ...sourceBody, name: 'Synthetic sold-item source' });
        expect(created.status).toBe(201);
        const soldSourceId: string = created.body.id;
        try {
            expect((await admin(`/sources/${soldSourceId}/activate`).send({ authorizationRef: sourceBody.authorizationRef,
                confirmRights: true })).status).toBe(200);
            const first = { ...candidate(), sourceItemId: 'sold-item', canonicalUrl: 'https://partner.example.com/items/sold' };
            const staged = await admin(`/sources/${soldSourceId}/candidates`).send({ items: [first] });
            expect(staged.status).toBe(202);
            const id: string = staged.body.items[0].id;
            const row = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id } });
            const review = { expectedContentHash: row.contentHash, authorizationRef: sourceBody.authorizationRef,
                reviewRef: 'review:synthetic-sold-item', confirmRights: true, confirmItem: true };
            expect((await admin(`/candidates/${id}/approve`).send(review)).status).toBe(200);
            expect((await request(app).get('/api/external-listings')).body.items.some((item: { id: string }) => item.id === id)).toBe(true);
            const endpoint = `/sources/${soldSourceId}/withdraw`;
            expect((await request(app).post(url + endpoint).send({ sourceItemIds: ['sold-item'], reason: 'SOLD' })).status).toBe(401);
            expect((await admin(endpoint).send({ sourceItemIds: ['sold-item', 'missing'], reason: 'SOLD' })).status).toBe(400);
            expect((await request(app).get('/api/external-listings')).body.items.some((item: { id: string }) => item.id === id)).toBe(true);
            expect((await admin(endpoint).send({ sourceItemIds: ['sold-item', 'sold-item'], reason: 'SOLD' })).status).toBe(400);
            const withdrawn = await admin(endpoint).send({ sourceItemIds: ['sold-item'], reason: 'SOLD' });
            expect(withdrawn.status).toBe(200);
            expect(withdrawn.body).toMatchObject({ withdrawn: 1, intakeBatchId: expect.any(String), publicCount: 0 });
            expect((await request(app).get('/api/external-listings')).body.items.some((item: { id: string }) => item.id === id)).toBe(false);
            expect((await request(app).get(`/api/external-listings/${id}`)).status).toBe(404);
            expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id } })).toMatchObject({
                status: 'STALE', approvalRef: null, approvedContentHash: null, aiStatus: 'NOT_ELIGIBLE' });
            const receipt = await prisma.externalIntakeBatch.findUniqueOrThrow({ where: { id: withdrawn.body.intakeBatchId } });
            expect(receipt.observations).toEqual([expect.objectContaining({ withdrawalReason: 'SOLD', status: 'STALE', changed: true,
                sourceItemIdSha256: createHash('sha256').update('sold-item').digest('hex') })]);
            expect(JSON.stringify(receipt.observations)).not.toContain('sold-item');
            expect((await admin(endpoint).send({ sourceItemIds: ['sold-item'], reason: 'SOLD' })).body.withdrawn).toBe(0);
            const refreshed = await admin(`/sources/${soldSourceId}/candidates`).send({ items: [first] });
            expect(refreshed.body.items[0]).toMatchObject({ id, status: 'PENDING_REVIEW', changed: false });
            expect((await request(app).get('/api/external-listings')).body.items.some((item: { id: string }) => item.id === id)).toBe(false);
        } finally {
            if (previousFlag === undefined) delete process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;
            else process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = previousFlag;
            await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId: soldSourceId } } });
            await prisma.externalListingCandidate.deleteMany({ where: { sourceId: soldSourceId } });
            await prisma.externalIntakeBatch.deleteMany({ where: { sourceId: soldSourceId } });
            await prisma.externalListingSource.delete({ where: { id: soldSourceId } });
        }
    });
    it('does not resurrect rejected candidates from a repeated feed and can pause a source', async () => {
        await prisma.externalListingCandidate.update({ where: { sourceId_sourceItemId: { sourceId, sourceItemId: 'test-1' } },
            data: { expiresAt: new Date(Date.now() - 1_000) } });
        expect(await expireExternalCandidates()).toBe(1);
        expect((await prisma.externalListingCandidate.findUniqueOrThrow({ where: { sourceId_sourceItemId: { sourceId, sourceItemId: 'test-1' } } })).status).toBe('STALE');
        const refreshed = await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey).send({ items: [candidate()] });
        expect(refreshed.body.items[0].status).toBe('PENDING_REVIEW');
        const current = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { sourceId_sourceItemId: { sourceId, sourceItemId: 'test-1' } } });
        const rejection = { expectedContentHash: current.contentHash, reason: 'ITEM_UNVERIFIED', reviewRef: 'review:synthetic-test-2026' };
        expect((await request(app).post(`${url}/candidates/${current.id}/reject`).send(rejection)).status).toBe(401);
        expect((await request(app).post(`${url}/candidates/${current.id}/reject`).set('x-admin-key', adminKey)
            .send({ ...rejection, expectedContentHash: '0'.repeat(64) })).status).toBe(409);
        expect((await request(app).post(`${url}/candidates/${current.id}/reject`).set('x-admin-key', adminKey)
            .send({ ...rejection, reviewRef: 'private raw notes' })).status).toBe(400);
        expect((await request(app).post(`${url}/candidates/${current.id}/reject`).set('x-admin-key', adminKey).send(rejection)).status).toBe(200);
        expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: current.id } })).toMatchObject({
            status: 'REJECTED', rejectionRef: rejection.reviewRef, rejectionReason: rejection.reason,
            rejectedContentHash: current.contentHash, rejectedAt: expect.any(Date), aiStatus: 'NOT_ELIGIBLE',
            aiInputHash: null, aiJobId: null, aiDraft: null,
        });
        expect((await prisma.externalCandidateReviewEvent.findMany({ where: { candidateId: current.id } }))).toEqual([
            expect.objectContaining({ decision: 'REJECTED', contentHash: current.contentHash,
                reviewRef: rejection.reviewRef, reason: rejection.reason }),
        ]);
        const repeated = await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey).send({ items: [candidate()] });
        expect(repeated.body.items[0].status).toBe('REJECTED');
        const second = await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey)
            .send({ items: [{ ...candidate(), sourceItemId: 'test-2', canonicalUrl: 'https://partner.example.com/items/2' }] });
        expect(second.status).toBe(202);
        expect((await request(app).post(`${url}/sources/${sourceId}/pause`).set('x-admin-key', adminKey).send({})).status).toBe(204);
        expect(await expireExternalCandidates()).toBe(0);
        expect((await prisma.externalListingCandidate.findUniqueOrThrow({ where: { sourceId_sourceItemId: { sourceId, sourceItemId: 'test-2' } } })).status).toBe('STALE');
        expect((await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey).send({ items: [candidate()] })).status).toBe(404);
    });
    it('requires a separate AI-processing authorization confirmation and keeps image jobs private', async () => {
        const publicListingCount = await prisma.listing.count();
        const aiAdmin = (path: string) => request(app).post(url + path).set('x-admin-key', adminKey)
            .set('x-forwarded-for', '203.0.113.70');
        const source = await aiAdmin('/sources')
            .send({ ...sourceBody, name: 'Synthetic AI-authorized partner', aiProcessingAllowed: true });
        expect(source.status).toBe(201);
        const aiSourceId: string = source.body.id;
        try {
            expect((await aiAdmin(`/sources/${aiSourceId}/activate`)
                .send({ authorizationRef: sourceBody.authorizationRef, confirmRights: true })).status).toBe(400);
            expect((await aiAdmin(`/sources/${aiSourceId}/activate`)
                .send({ authorizationRef: sourceBody.authorizationRef, confirmRights: true, confirmAiProcessing: true })).status).toBe(200);
            const staged = await aiAdmin(`/sources/${aiSourceId}/candidates`)
                .send({ items: [candidate()] });
            expect(staged.status).toBe(202);
            expect(staged.body.items[0]).toMatchObject({ aiStatus: 'PENDING', changed: true });
            const row = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { sourceId_sourceItemId: { sourceId: aiSourceId, sourceItemId: 'test-1' } } });
            expect(row).toMatchObject({ aiInputHash: row.contentHash, aiDraft: null, aiJobId: null, aiAttempts: 0 });
            const repeated = await aiAdmin(`/sources/${aiSourceId}/candidates`)
                .send({ items: [candidate()] });
            expect(repeated.body.items[0]).toMatchObject({ changed: false, aiStatus: 'PENDING' });
            const changed = await aiAdmin(`/sources/${aiSourceId}/candidates`)
                .send({ items: [{ ...candidate(), title: '二手橘色檯燈合成測試' }] });
            expect(changed.body.items[0]).toMatchObject({ changed: true, aiStatus: 'PENDING' });
            await prisma.externalListingCandidate.update({ where: { id: row.id },
                data: { aiStatus: 'PROCESSING', aiJobId: 'synthetic-old-job', aiAttempts: 1 } });
            expect((await aiAdmin(`/sources/${aiSourceId}/pause`).send({})).status).toBe(204);
            expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
                status: 'STALE', aiStatus: 'NOT_ELIGIBLE', aiJobId: null });
            expect((await aiAdmin(`/sources/${aiSourceId}/activate`)
                .send({ authorizationRef: sourceBody.authorizationRef, confirmRights: true, confirmAiProcessing: true })).status).toBe(200);
            const reimported = await aiAdmin(`/sources/${aiSourceId}/candidates`)
                .send({ items: [{ ...candidate(), title: '二手橘色檯燈合成測試' }] });
            expect(reimported.body.items[0]).toMatchObject({ changed: false, status: 'PENDING_REVIEW', aiStatus: 'PENDING' });
            expect(await prisma.listing.count()).toBe(publicListingCount);
        } finally {
            await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId: aiSourceId } } });
            await prisma.externalListingCandidate.deleteMany({ where: { sourceId: aiSourceId } });
            await prisma.externalIntakeBatch.deleteMany({ where: { sourceId: aiSourceId } });
            await prisma.externalListingSource.delete({ where: { id: aiSourceId } });
        }
    });
    it('revokes an unobserved 48-hour approval and requires a new private AI/review cycle', async () => {
        const priorFlag = process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;
        process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = '1';
        const admin = (path: string) => request(app).post(url + path).set('x-admin-key', adminKey)
            .set('x-forwarded-for', '203.0.113.71');
        const created = await admin('/sources').send({ ...sourceBody,
            name: 'Synthetic 48-hour refresh partner', aiProcessingAllowed: true });
        expect(created.status).toBe(201);
        const refreshSourceId: string = created.body.id;
        try {
            expect((await admin(`/sources/${refreshSourceId}/activate`).send({ authorizationRef: sourceBody.authorizationRef,
                confirmRights: true, confirmAiProcessing: true })).status).toBe(200);
            const staged = await admin(`/sources/${refreshSourceId}/candidates`).send({ items: [candidate()] });
            expect(staged.status).toBe(202);
            const id: string = staged.body.items[0].id;
            const first = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id } });
            const approval = { expectedContentHash: first.contentHash, authorizationRef: sourceBody.authorizationRef,
                reviewRef: 'review:synthetic-refresh-first', confirmRights: true, confirmItem: true };
            expect((await admin(`/candidates/${id}/approve`).send(approval)).status).toBe(200);
            await prisma.externalListingCandidate.update({ where: { id }, data: {
                observedAt: new Date(Date.now() - 49 * 3_600_000) } });
            expect((await request(app).get('/api/external-listings')).body.items
                .some((item: { id: string }) => item.id === id)).toBe(false);
            // A same-content feed refresh can arrive before the 15-minute
            // expiry cycle; it must not silently restore yesterday's review.
            const immediate = await admin(`/sources/${refreshSourceId}/candidates`).send({ items: [candidate()] });
            expect(immediate.status).toBe(202);
            expect(immediate.body.items[0]).toMatchObject({ id, status: 'PENDING_REVIEW', aiStatus: 'PENDING', changed: false });
            expect((await request(app).get('/api/external-listings')).body.items
                .some((item: { id: string }) => item.id === id)).toBe(false);
            expect((await admin(`/candidates/${id}/approve`).send({ ...approval,
                reviewRef: 'review:synthetic-refresh-second' })).status).toBe(200);
            await prisma.externalListingCandidate.update({ where: { id }, data: {
                observedAt: new Date(Date.now() - 49 * 3_600_000), aiDraft: { title: 'stale private suggestion' } } });
            expect(await expireExternalCandidates()).toBeGreaterThanOrEqual(1);
            expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id } })).toMatchObject({
                status: 'STALE', approvalRef: null, approvedAuthorizationRef: null,
                approvedContentHash: null, aiStatus: 'NOT_ELIGIBLE', aiInputHash: null, aiDraft: null });
            const reobserved = await admin(`/sources/${refreshSourceId}/candidates`).send({ items: [candidate()] });
            expect(reobserved.status).toBe(202);
            expect(reobserved.body.items[0]).toMatchObject({ id, status: 'PENDING_REVIEW', aiStatus: 'PENDING', changed: false });
            expect((await request(app).get('/api/external-listings')).body.items
                .some((item: { id: string }) => item.id === id)).toBe(false);
            expect((await prisma.externalCandidateReviewEvent.count({ where: { candidateId: id } }))).toBe(2);
        } finally {
            if (priorFlag === undefined) delete process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;
            else process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = priorFlag;
            await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId: refreshSourceId } } });
            await prisma.externalListingCandidate.deleteMany({ where: { sourceId: refreshSourceId } });
            await prisma.externalIntakeBatch.deleteMany({ where: { sourceId: refreshSourceId } });
            await prisma.externalListingSource.delete({ where: { id: refreshSourceId } });
        }
    });
    it('publishes only a freshly observed, explicitly reviewed source item and revokes stale approval', async () => {
        const priorFlag = process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;
        const priorJwt = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'synthetic-external-wish-match-test-only';
        const testUsers: number[] = [];
        const sellerListingCount = await prisma.listing.count();
        const admin = (path: string) => request(app).post(url + path).set('x-admin-key', adminKey)
            .set('x-forwarded-for', '203.0.113.90');
        const source = await admin('/sources').send({ ...sourceBody, name: 'Synthetic reviewed source' });
        expect(source.status).toBe(201);
        const reviewSourceId: string = source.body.id;
        try {
            expect((await request(app).get('/api/external-listings')).body).toMatchObject({ items: [], enabled: false });
            expect((await admin(`/sources/${reviewSourceId}/activate`).send({ authorizationRef: sourceBody.authorizationRef,
                confirmRights: true })).status).toBe(200);
            const staged = await admin(`/sources/${reviewSourceId}/candidates`).send({ items: [candidate()] });
            expect(staged.status).toBe(202);
            const { id } = staged.body.items[0];
            const first = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id } });
            process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = '1';
            expect((await request(app).get('/api/external-listings')).body.items).toEqual([]);
            const approval = { expectedContentHash: first.contentHash, authorizationRef: sourceBody.authorizationRef,
                reviewRef: 'review:synthetic-approved-2026', confirmRights: true, confirmItem: true };
            expect((await admin(`/candidates/${id}/approve`).send({ ...approval, expectedContentHash: '0'.repeat(64) })).status).toBe(409);
            expect((await admin(`/candidates/${id}/approve`).send({ ...approval, authorizationRef: 'contract:wrong' })).status).toBe(409);
            expect((await admin(`/candidates/${id}/approve`).send(approval)).status).toBe(200);
            const buyer = await prisma.user.create({ data: { phoneNumber: 'external-match-buyer-' + id,
                password: 'synthetic-only', name: 'source match buyer' } });
            const other = await prisma.user.create({ data: { phoneNumber: 'external-match-other-' + id,
                password: 'synthetic-only', name: 'source match other' } });
            testUsers.push(buyer.id, other.id);
            const wishlist = await prisma.wishlist.create({ data: { userId: buyer.id, title: '合成私密檯燈願望',
                items: { create: { name: '檯燈', maxPrice: 600, priceCurrency: 'TWD' } } }, include: { items: true } });
            const wishItemId = wishlist.items[0].id;
            const match = (userId: number, query: Record<string, string> = {}) => request(app)
                .get('/api/external-listings/matches').set('Authorization', 'Bearer ' + jwt.sign({ id: userId },
                    process.env.JWT_SECRET!, { algorithm: 'HS256' })).query({ wishItemId: String(wishItemId), ...query });
            expect((await request(app).get('/api/external-listings/matches').query({ wishItemId })).status).toBe(401);
            expect((await match(other.id)).status).toBe(404);
            const matched = await match(buyer.id, { bbox: '121.44,25.00,121.48,25.03' });
            expect(matched.status).toBe(200);
            expect(matched.headers['cache-control']).toBe('private, no-store');
            expect(matched.body.items).toEqual([expect.objectContaining({ id, priceTwd: '590',
                inAppSeller: false, aiDerivedPublicFields: false })]);
            expect(matched.body.notice).toContain('不保證');
            expect((await match(buyer.id, { bbox: '121.50,25.00,121.52,25.03' })).body.items).toEqual([]);
            expect((await match(buyer.id, { brand: 'Sony' })).status).toBe(400);
            await prisma.item.update({ where: { id: wishItemId }, data: { maxPrice: 500 } });
            expect((await match(buyer.id)).body.items).toEqual([]);
            await prisma.item.update({ where: { id: wishItemId }, data: { maxPrice: 600 } });
            expect((await request(app).get(`/api/external-listings/${id}`)).body).toMatchObject({ id,
                canonicalUrl: candidate().canonicalUrl, locationPrecision: 'DISTRICT_ONLY' });
            expect((await request(app).get('/api/external-listings').query({ bbox: '121.44,25.00,121.48,25.03',
                minPrice: '590', maxPrice: '590' })).body.items).toHaveLength(1);
            expect((await request(app).get('/api/external-listings').query({ bbox: '121.44,25.00,121.48,25.03',
                minPrice: '591' })).body.items).toEqual([]);
            expect((await request(app).get('/api/external-listings').query({ bbox: '121.50,25.00,121.52,25.03' })).body.items).toEqual([]);
            expect((await request(app).get('/api/external-listings').query({ bbox: '121.48,25.03,121.44,25.00' })).status).toBe(400);
            const reviews = await request(app).get(`${url}/candidates/${id}/reviews`).set('x-admin-key', adminKey);
            expect(reviews.status).toBe(200);
            expect(reviews.body.items).toEqual([expect.objectContaining({ decision: 'APPROVED',
                contentHash: first.contentHash, reviewRef: approval.reviewRef,
                authorizationRef: sourceBody.authorizationRef })]);
            expect((await request(app).get(`${url}/candidates/${id}/reviews`)).status).toBe(401);
            const approvedAdmin = await request(app).get(url + '/candidates?status=APPROVED').set('x-admin-key', adminKey);
            expect(approvedAdmin.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
            const takedownAdmin = (path: string) => request(app).post(url + path).set('x-admin-key', adminKey)
                .set('x-forwarded-for', '203.0.113.91');
            const secondItem = { ...candidate(), sourceItemId: 'test-2',
                canonicalUrl: 'https://partner.example.com/items/2', title: '二手檯燈待撤下合成測試' };
            const stagedSecond = await takedownAdmin(`/sources/${reviewSourceId}/candidates`).send({ items: [secondItem] });
            expect(stagedSecond.status).toBe(202);
            const secondId: string = stagedSecond.body.items[0].id;
            const second = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: secondId } });
            expect((await takedownAdmin(`/candidates/${secondId}/approve`).send({ ...approval,
                expectedContentHash: second.contentHash, reviewRef: 'review:synthetic-second-approval' })).status).toBe(200);
            const firstMatchPage = await match(buyer.id, { limit: '1' });
            expect(firstMatchPage.status).toBe(200);
            expect(firstMatchPage.body.items).toHaveLength(1);
            expect(firstMatchPage.body.nextCursor).toBe(firstMatchPage.body.items[0].id);
            const nextMatchPage = await match(buyer.id, { limit: '1', cursor: firstMatchPage.body.nextCursor });
            expect(nextMatchPage.status).toBe(200);
            expect(nextMatchPage.body.items).toHaveLength(1);
            expect(new Set([firstMatchPage.body.items[0].id, nextMatchPage.body.items[0].id])).toEqual(new Set([id, secondId]));
            expect((await request(app).get('/api/external-listings')).body.items).toHaveLength(2);
            const firstPage = await request(app).get('/api/external-listings').query({ limit: '1' });
            expect(firstPage.body.items).toHaveLength(1);
            expect(firstPage.body.nextCursor).toBe(firstPage.body.items[0].id);
            const secondPage = await request(app).get('/api/external-listings').query({ limit: '1', cursor: firstPage.body.nextCursor });
            expect(secondPage.body.items).toHaveLength(1);
            expect(secondPage.body.items[0].id).not.toBe(firstPage.body.items[0].id);
            expect((await takedownAdmin(`/candidates/${secondId}/reject`).send({ expectedContentHash: second.contentHash,
                reviewRef: 'review:synthetic-second-takedown', reason: 'ITEM_UNVERIFIED' })).status).toBe(200);
            expect((await match(buyer.id)).body.items).toHaveLength(1);
            expect((await match(buyer.id, { cursor: secondId })).status).toBe(400);
            expect((await request(app).get('/api/external-listings')).body.items).toHaveLength(1);
            expect((await request(app).get(`/api/external-listings/${secondId}`)).status).toBe(404);
            expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: secondId } })).toMatchObject({
                status: 'REJECTED', approvalRef: null, approvedAuthorizationRef: null, approvedContentHash: null,
                rejectionReason: 'ITEM_UNVERIFIED',
            });
            expect((await request(app).get(`${url}/candidates/${secondId}/reviews`).set('x-admin-key', adminKey)).body.items)
                .toEqual(expect.arrayContaining([
                    expect.objectContaining({ decision: 'APPROVED', contentHash: second.contentHash }),
                    expect.objectContaining({ decision: 'REJECTED', contentHash: second.contentHash,
                        reason: 'ITEM_UNVERIFIED' }),
                ]));
            const repeatedSecond = await takedownAdmin(`/sources/${reviewSourceId}/candidates`).send({ items: [secondItem] });
            expect(repeatedSecond.body.items[0].status).toBe('REJECTED');
            const publicPage = await request(app).get('/api/external-listings').query({ county: '新北市', district: '板橋區', q: '檯燈' });
            expect(publicPage.status).toBe(200);
            expect(publicPage.headers['cache-control']).toBe('no-store');
            expect(publicPage.body.items).toEqual([expect.objectContaining({ id, title: candidate().title,
                canonicalUrl: candidate().canonicalUrl, thumbnailUrl: candidate().thumbnailUrl,
                condition: 'USED', priceTwd: '590',
                locationPrecision: 'DISTRICT_ONLY', priceSource: 'SOURCE_STATED', inAppSeller: false,
                location: { latitude: 25.01186, longitude: 121.45797, precision: 'DISTRICT_CENTER',
                    source: 'https://data.gov.tw/dataset/25489' },
                aiDerivedPublicFields: false, source: { host: 'partner.example.com', imageHost: 'images.example.com', kind: 'PARTNER_FEED' } })]);
            expect(await prisma.listing.count()).toBe(sellerListingCount);
            for (const privateField of ['owner', 'authorizationRef', 'aiDraft', 'aiJobId', 'rejectionRef', 'approvalRef'])
                expect(publicPage.body.items[0]).not.toHaveProperty(privateField);
            await prisma.externalListingCandidate.update({ where: { id }, data: { aiStatus: 'COMPLETED',
                aiDraft: { title: 'AI 假建議不可公開', description: '模型私人文字' } } });
            const afterAi = await request(app).get('/api/external-listings');
            expect(afterAi.body.items[0]).toMatchObject({ title: candidate().title, description: candidate().description,
                priceTwd: '590', aiDerivedPublicFields: false });
            expect(JSON.stringify(afterAi.body)).not.toContain('AI 假建議不可公開');
            process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = '0';
            expect((await request(app).get('/api/external-listings')).body).toMatchObject({ items: [], enabled: false });
            expect((await match(buyer.id)).body).toMatchObject({ items: [], enabled: false });
            process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = '1';
            await prisma.externalListingCandidate.update({ where: { id }, data: { approvedContentHash: '0'.repeat(64) } });
            expect((await request(app).get('/api/external-listings')).body.items).toEqual([]);
            expect((await match(buyer.id)).body.items).toEqual([]);
            await prisma.externalListingCandidate.update({ where: { id }, data: { approvedContentHash: first.contentHash } });
            await prisma.externalListingCandidate.update({ where: { id }, data: { thumbnailUrl: null } });
            expect((await request(app).get('/api/external-listings')).body.items).toEqual([]);
            expect((await request(app).get(`/api/external-listings/${id}`)).status).toBe(404);
            await prisma.externalListingCandidate.update({ where: { id }, data: { thumbnailUrl: candidate().thumbnailUrl } });
            await prisma.externalListingCandidate.update({ where: { id }, data: { approvedAuthorizationRef: 'contract:other-rights' } });
            expect((await request(app).get('/api/external-listings')).body.items).toEqual([]);
            await prisma.externalListingCandidate.update({ where: { id }, data: { approvedAuthorizationRef: sourceBody.authorizationRef } });
            await prisma.externalListingSource.update({ where: { id: reviewSourceId }, data: { imageReuseAllowed: false } });
            expect((await request(app).get('/api/external-listings')).body.items).toEqual([]);
            await prisma.externalListingSource.update({ where: { id: reviewSourceId }, data: { imageReuseAllowed: true } });
            const repeat = await admin(`/sources/${reviewSourceId}/candidates`).send({ items: [candidate()] });
            expect(repeat.body.items[0]).toMatchObject({ status: 'APPROVED', changed: false });
            expect((await request(app).get('/api/external-listings')).body.items).toHaveLength(1);
            const revised = await admin(`/sources/${reviewSourceId}/candidates`).send({ items: [{ ...candidate(), title: '二手白色檯燈合成測試' }] });
            expect(revised.body.items[0]).toMatchObject({ status: 'PENDING_REVIEW', changed: true });
            expect((await request(app).get('/api/external-listings')).body.items).toEqual([]);
            const changed = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id } });
            expect(changed).toMatchObject({ approvedContentHash: null, approvedAuthorizationRef: null,
                approvalRef: null, approvedAt: null });
            expect((await request(app).get(`${url}/candidates/${id}/reviews`).set('x-admin-key', adminKey)).body.items)
                .toEqual([expect.objectContaining({ decision: 'APPROVED', contentHash: first.contentHash })]);
            expect((await admin(`/candidates/${id}/approve`).send({ ...approval, expectedContentHash: changed.contentHash })).status).toBe(200);
            expect((await request(app).get(`${url}/candidates/${id}/reviews`).set('x-admin-key', adminKey)).body.items).toHaveLength(2);
            expect((await request(app).get('/api/external-listings')).body.items).toHaveLength(1);
            expect((await admin(`/sources/${reviewSourceId}/pause`).send({})).status).toBe(204);
            expect((await request(app).get('/api/external-listings')).body.items).toEqual([]);
            expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id } })).toMatchObject({
                status: 'STALE', approvedContentHash: null, approvedAuthorizationRef: null,
                approvalRef: null, approvedAt: null,
            });
        } finally {
            if (priorJwt === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = priorJwt;
            if (priorFlag === undefined) delete process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;
            else process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = priorFlag;
            if (testUsers.length) await prisma.user.deleteMany({ where: { id: { in: testUsers } } });
            await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId: reviewSourceId } } });
            await prisma.externalListingCandidate.deleteMany({ where: { sourceId: reviewSourceId } });
            await prisma.externalIntakeBatch.deleteMany({ where: { sourceId: reviewSourceId } });
            await prisma.externalListingSource.delete({ where: { id: reviewSourceId } });
        }
    });
});
