import express from 'express';
import request from 'supertest';
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
    imageUrl: 'https://images.example.com/items/1.jpg', title: '二手檯燈合成測試', description: '合成測試資料，並非真實待售商品。',
    priceTwd: 590, condition: 'USED', county: '新北市', district: '板橋區', observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
let sourceId: string;
afterAll(async () => {
    if (sourceId) {
        await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId } } });
        await prisma.externalListingCandidate.deleteMany({ where: { sourceId } });
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
        const staged = await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey).send({ items: [candidate()] });
        expect(staged.status).toBe(202); expect(staged.body).toMatchObject({ publicCount: 0,
            items: [{ sourceItemId: 'test-1', status: 'PENDING_REVIEW', aiStatus: 'NOT_ELIGIBLE', changed: true }] });
        expect(await prisma.listing.count()).toBe(originalCount);
        const repeated = await request(app).post(`${url}/sources/${sourceId}/candidates`).set('x-admin-key', adminKey).send({ items: [candidate()] });
        expect(repeated.status).toBe(202);
        expect(repeated.body.items[0].changed).toBe(false);
        expect(await prisma.externalListingCandidate.count({ where: { sourceId } })).toBe(1);
        const rows = await request(app).get(url + '/candidates').set('x-admin-key', adminKey);
        expect(rows.status).toBe(200); expect(rows.headers['cache-control']).toBe('private, no-store');
        expect(rows.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId, canonicalUrl: 'https://partner.example.com/items/1' })]));
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
            await prisma.externalListingSource.delete({ where: { id: aiSourceId } });
        }
    });
    it('publishes only a freshly observed, explicitly reviewed source item and revokes stale approval', async () => {
        const priorFlag = process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;
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
            const reviews = await request(app).get(`${url}/candidates/${id}/reviews`).set('x-admin-key', adminKey);
            expect(reviews.status).toBe(200);
            expect(reviews.body.items).toEqual([expect.objectContaining({ decision: 'APPROVED',
                contentHash: first.contentHash, reviewRef: approval.reviewRef,
                authorizationRef: sourceBody.authorizationRef })]);
            expect((await request(app).get(`${url}/candidates/${id}/reviews`)).status).toBe(401);
            const approvedAdmin = await request(app).get(url + '/candidates?status=APPROVED').set('x-admin-key', adminKey);
            expect(approvedAdmin.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
            const publicPage = await request(app).get('/api/external-listings').query({ county: '新北市', district: '板橋區', q: '檯燈' });
            expect(publicPage.status).toBe(200);
            expect(publicPage.headers['cache-control']).toBe('no-store');
            expect(publicPage.body.items).toEqual([expect.objectContaining({ id, title: candidate().title,
                canonicalUrl: candidate().canonicalUrl, condition: 'USED', priceTwd: '590',
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
            process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = '1';
            await prisma.externalListingCandidate.update({ where: { id }, data: { approvedContentHash: '0'.repeat(64) } });
            expect((await request(app).get('/api/external-listings')).body.items).toEqual([]);
            await prisma.externalListingCandidate.update({ where: { id }, data: { approvedContentHash: first.contentHash } });
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
            if (priorFlag === undefined) delete process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;
            else process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = priorFlag;
            await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId: reviewSourceId } } });
            await prisma.externalListingCandidate.deleteMany({ where: { sourceId: reviewSourceId } });
            await prisma.externalListingSource.delete({ where: { id: reviewSourceId } });
        }
    });
});
