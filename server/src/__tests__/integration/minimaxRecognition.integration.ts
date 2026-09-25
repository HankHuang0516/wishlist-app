import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import route from '../../routes/minimaxRecognitionRoutes';
import { getApiUrl } from '../../config/constants';
import { expireExternalCandidates } from '../../lib/externalCandidateExpiry';
import { EXTERNAL_OBSERVATION_MAX_AGE_MS } from '../../lib/externalListingIntake';
import { createExternalIntakeRoutes } from '../../routes/externalIntakeRoutes';

require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated matching test database required');

const app = express(); app.use(express.json()); app.use('/api/internal/minimax-vision', route);
const token = 'synthetic-minimax-pilot-token-at-least-32-chars';
const adminKey = 'synthetic-minimax-external-review-key';
app.use('/api/external-intake', createExternalIntakeRoutes(() => adminKey));
const previous = { user: process.env.MINIMAX_PILOT_USER_ID, token: process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN,
    listingEnabled: process.env.MINIMAX_LISTING_AI_ENABLED, listingPilot: process.env.MINIMAX_LISTING_AI_PILOT_USER_ID,
    externalEnabled: process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED };
let userId: number, listId: number;
const sourceIds: string[] = [];
const auth = (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const callback = (jobId: string, body: object) => request(app).post(`/api/internal/minimax-vision/${jobId}/result`)
    .set('Authorization', `Bearer ${token}`).send(body);

async function wish() {
    const id = randomUUID();
    const imageUrl = `${getApiUrl().replace(/\/$/, '')}/listing-media/${id}/image`;
    const item = await prisma.item.create({ data: { wishlistId: listId, name: '等待辨識', imageUrl, aiStatus: 'PENDING', uploadStatus: 'COMPLETED' } });
    await prisma.listingMedia.create({ data: { id, ownerUserId: userId, wishItemId: item.id, imageUrl,
        thumbnailUrl: `${getApiUrl().replace(/\/$/, '')}/listing-media/${id}/thumbnail`, contentHash: 'synthetic' } });
    return item.id;
}

beforeAll(async () => {
    const user = await prisma.user.create({ data: { phoneNumber: `minimax-pilot-${randomUUID()}`, password: 'synthetic-unused' } });
    userId = user.id;
    listId = (await prisma.wishlist.create({ data: { userId, title: 'isolated pilot' } })).id;
    process.env.MINIMAX_PILOT_USER_ID = String(userId);
    process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = token;
    process.env.MINIMAX_LISTING_AI_ENABLED = '1';
    process.env.MINIMAX_LISTING_AI_PILOT_USER_ID = String(userId);
    process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED = '1';
});
afterAll(async () => {
    await prisma.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId: { in: sourceIds } } } });
    await prisma.externalListingCandidate.deleteMany({ where: { sourceId: { in: sourceIds } } });
    await prisma.externalListingSource.deleteMany({ where: { id: { in: sourceIds } } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
    if (previous.user === undefined) delete process.env.MINIMAX_PILOT_USER_ID; else process.env.MINIMAX_PILOT_USER_ID = previous.user;
    if (previous.token === undefined) delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN; else process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = previous.token;
    if (previous.listingEnabled === undefined) delete process.env.MINIMAX_LISTING_AI_ENABLED; else process.env.MINIMAX_LISTING_AI_ENABLED = previous.listingEnabled;
    if (previous.listingPilot === undefined) delete process.env.MINIMAX_LISTING_AI_PILOT_USER_ID; else process.env.MINIMAX_LISTING_AI_PILOT_USER_ID = previous.listingPilot;
    if (previous.externalEnabled === undefined) delete process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED; else process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED = previous.externalEnabled;
});

async function externalCandidate() {
    const source = await prisma.externalListingSource.create({ data: { name: 'Synthetic authorized source', kind: 'PARTNER_FEED',
        canonicalHost: 'partner.example.com', imageHost: 'images.example.com', authorizationRef: 'contract:synthetic-test-2026',
        textReuseAllowed: true, imageReuseAllowed: true, aiProcessingAllowed: true, enabled: true, enabledAt: new Date() } });
    sourceIds.push(source.id);
    const candidate = await prisma.externalListingCandidate.create({ data: { sourceId: source.id, sourceItemId: randomUUID(),
        canonicalUrl: 'https://partner.example.com/item/1', imageUrl: 'https://images.example.com/item/1.jpg',
        title: '二手藍色檯燈', description: '來源註記已測試可開燈', priceTwd: 590, condition: 'USED',
        county: '臺北市', district: '大安區', observedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
        contentHash: 'a'.repeat(64), aiInputHash: 'a'.repeat(64), aiStatus: 'PENDING' } });
    return { source, candidate };
}

const externalResult = { recognizable: true, name: '藍色桌上檯燈',
    description: '可見藍色燈罩、白色底座與細小刮痕，功能仍須來源確認。', category: 'home', brand: null,
    condition: 'NEW', estimatedPriceLowTwd: 10, estimatedPriceHighTwd: 999999, priceBasis: '猜測',
    evidence: ['藍色燈罩', '白色底座'], uncertainties: ['未能確認燈泡'], confidence: 0.9 };

describe('isolated MiniMax Code pull queue', () => {
    it('authenticates, claims once, rejects forged results, and updates the APP wish', async () => {
        const itemId = await wish();
        expect((await request(app).get('/api/internal/minimax-vision/next')).status).toBe(404);
        const claimed = await auth('/api/internal/minimax-vision/next');
        expect(claimed.status).toBe(200);
        expect(claimed.body).toMatchObject({ jobId: expect.any(String), imageUrl: expect.stringMatching(/\/listing-media\/.+\/image$/) });
        expect((await auth('/api/internal/minimax-vision/next')).status).toBe(204);
        expect((await callback(randomUUID(), { status: 'FAILED' })).status).toBe(409);
        expect((await callback(claimed.body.jobId, { result: { name: '猜測', confidence: 0.1 } })).status).toBe(400);
        expect((await callback(claimed.body.jobId, { status: 'COMPLETED', result: { name: '白糖粿招牌', category: '招牌',
            visibleText: ['白糖粿 40元'], listedPriceTwd: 40, evidence: ['可見品名', '可見標價'], confidence: 0.9 } })).status).toBe(204);
        expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ name: '白糖粿招牌', price: '40', aiStatus: 'COMPLETED' });
    });
    it('reclaims an expired job but rejects a stale callback', async () => {
        const itemId = await wish();
        const first = await auth('/api/internal/minimax-vision/next'); expect(first.status).toBe(200);
        await prisma.item.update({ where: { id: itemId }, data: { updatedAt: new Date(Date.now() - 11 * 60 * 1000) } });
        const second = await auth('/api/internal/minimax-vision/next'); expect(second.status).toBe(200);
        expect(second.body.jobId).not.toBe(first.body.jobId);
        expect((await callback(first.body.jobId, { status: 'FAILED' })).status).toBe(409);
        expect((await callback(second.body.jobId, { status: 'FAILED' })).status).toBe(204);
        expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ aiStatus: 'FAILED', aiError: 'MINIMAX_VISION_FAILED' });
    });
    it('keeps a seller photo private and returns an editable listing draft without publishing', async () => {
        const id = randomUUID();
        const imageUrl = `${getApiUrl().replace(/\/$/, '')}/listing-media/${id}/image`;
        await prisma.listingMedia.create({ data: { id, ownerUserId: userId, imageUrl,
            thumbnailUrl: `${getApiUrl().replace(/\/$/, '')}/listing-media/${id}/thumbnail`, contentHash: 'synthetic',
            aiDraftStatus: 'PENDING', aiDraftAttempts: 1, aiDraftUpdatedAt: new Date() } });
        const claimed = await auth('/api/internal/minimax-vision/next');
        expect(claimed.status).toBe(200);
        expect(claimed.body).toMatchObject({ kind: 'LISTING_DRAFT', imageUrl, jobId: expect.any(String) });
        expect((await auth('/api/internal/minimax-vision/next')).status).toBe(204);
        expect((await callback(claimed.body.jobId, { status: 'COMPLETED', result: { recognizable: true,
            name: '黑色小型相機', description: '可見黑色機身、鏡頭與背面螢幕；功能仍須賣家確認。',
            category: 'electronics', brand: null, condition: null, estimatedPriceLowTwd: 800, estimatedPriceHighTwd: 2000,
            priceBasis: '僅依照片外觀粗估，未查詢即時成交價', evidence: ['可見鏡頭', '可見螢幕'],
            uncertainties: ['功能未驗證'], confidence: 0.86 } })).status).toBe(204);
        const media = await prisma.listingMedia.findUniqueOrThrow({ where: { id } });
        expect(media).toMatchObject({ listingId: null, wishItemId: null, aiDraftStatus: 'COMPLETED', aiDraftJobId: null,
            aiDraft: expect.objectContaining({ title: '黑色小型相機', estimatedPriceLowTwd: 800, source: 'MINIMAX_CODE_VISION' }) });
    });
    it('runs listing and authorized external AI without the legacy wish pilot, but never without the worker token', async () => {
        const savedWishPilot = process.env.MINIMAX_PILOT_USER_ID;
        const savedToken = process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
        const id = randomUUID();
        const imageUrl = `${getApiUrl().replace(/\/$/, '')}/listing-media/${id}/image`;
        await prisma.listingMedia.create({ data: { id, ownerUserId: userId, imageUrl,
            thumbnailUrl: `${getApiUrl().replace(/\/$/, '')}/listing-media/${id}/thumbnail`, contentHash: 'synthetic-independent-queue',
            capturePurpose: 'BATCH_ITEM', aiDraftStatus: 'PENDING', aiDraftAttempts: 1, aiDraftUpdatedAt: new Date() } });
        const { candidate } = await externalCandidate();
        try {
            delete process.env.MINIMAX_PILOT_USER_ID;
            delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
            expect((await auth('/api/internal/minimax-vision/next')).status).toBe(404);
            process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = token;
            const listingJob = await auth('/api/internal/minimax-vision/next');
            expect(listingJob.body).toMatchObject({ kind: 'LISTING_DRAFT', imageUrl, jobId: expect.any(String) });
            const listingResult = { recognizable: true, name: '黑色小型相機',
                description: '可見黑色機身與鏡頭，功能仍須賣家確認。', category: 'electronics', brand: null,
                condition: null, estimatedPriceLowTwd: 800, estimatedPriceHighTwd: 2000,
                priceBasis: '照片粗估，非即時行情', evidence: ['黑色機身', '可見鏡頭'], uncertainties: ['功能未驗證'], confidence: 0.86 };
            expect((await callback(listingJob.body.jobId, { status: 'COMPLETED', result: listingResult })).status).toBe(204);
            expect(await prisma.listingMedia.findUniqueOrThrow({ where: { id } })).toMatchObject({ listingId: null,
                aiDraftStatus: 'COMPLETED', aiDraft: expect.objectContaining({ title: '黑色小型相機' }) });
            const externalJob = await auth('/api/internal/minimax-vision/next');
            expect(externalJob.body).toMatchObject({ kind: 'EXTERNAL_CANDIDATE', imageUrl: candidate.imageUrl });
            expect((await callback(externalJob.body.jobId, { status: 'COMPLETED', result: externalResult })).status).toBe(204);
            expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } }))
                .toMatchObject({ status: 'PENDING_REVIEW', aiStatus: 'COMPLETED' });
        } finally {
            if (savedWishPilot === undefined) delete process.env.MINIMAX_PILOT_USER_ID;
            else process.env.MINIMAX_PILOT_USER_ID = savedWishPilot;
            if (savedToken === undefined) delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
            else process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = savedToken;
        }
    });
    it('claims an authorized external photo and saves only a private suggestion, never an invented price', async () => {
        const { candidate } = await externalCandidate();
        const publicCount = await prisma.listing.count();
        const claimed = await auth('/api/internal/minimax-vision/next');
        expect(claimed.status).toBe(200);
        expect(claimed.body).toMatchObject({ kind: 'EXTERNAL_CANDIDATE', imageHost: 'images.example.com', imageUrl: candidate.imageUrl });
        expect((await callback(claimed.body.jobId, { status: 'COMPLETED', result: externalResult })).status).toBe(204);
        const row = await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
        expect(row).toMatchObject({ status: 'PENDING_REVIEW', condition: 'USED', aiStatus: 'COMPLETED',
            aiDraft: expect.objectContaining({ title: '藍色桌上檯燈', source: 'MINIMAX_CODE_VISION' }) });
        expect(row.priceTwd?.toString()).toBe('590');
        expect(row.aiDraft).not.toHaveProperty('estimatedPriceLowTwd');
        expect(row.aiDraft).not.toHaveProperty('condition');
        expect(await prisma.listing.count()).toBe(publicCount);
    });
    it('refuses an external result after source pause or an input change', async () => {
        const first = await externalCandidate();
        const claimed = await auth('/api/internal/minimax-vision/next');
        expect(claimed.body.kind).toBe('EXTERNAL_CANDIDATE');
        await prisma.externalListingSource.update({ where: { id: first.source.id }, data: { enabled: false } });
        expect((await callback(claimed.body.jobId, { status: 'COMPLETED', result: externalResult })).status).toBe(409);
        expect((await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: first.candidate.id } })).aiDraft).toBeNull();
        const second = await externalCandidate();
        const secondJob = await auth('/api/internal/minimax-vision/next');
        expect(secondJob.body.kind).toBe('EXTERNAL_CANDIDATE');
        await prisma.externalListingCandidate.update({ where: { id: second.candidate.id },
            data: { title: 'changed', contentHash: 'changed-hash', aiStatus: 'PENDING', aiJobId: null } });
        expect((await callback(secondJob.body.jobId, { status: 'COMPLETED', result: externalResult })).status).toBe(409);
    });
    it('never leases an unactivated or expired source image and rejects a callback after rights expire', async () => {
        const { source, candidate } = await externalCandidate();
        await prisma.externalListingSource.update({ where: { id: source.id }, data: { enabledAt: null } });
        expect((await auth('/api/internal/minimax-vision/next')).status).toBe(204);
        expect((await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).aiStatus).toBe('PENDING');
        await prisma.externalListingSource.update({ where: { id: source.id }, data: {
            enabledAt: new Date(), authorizationExpiresAt: new Date(Date.now() - 1000),
        } });
        expect((await auth('/api/internal/minimax-vision/next')).status).toBe(204);
        await prisma.externalListingSource.update({ where: { id: source.id }, data: {
            authorizationExpiresAt: new Date(Date.now() + 86_400_000),
        } });
        const claimed = await auth('/api/internal/minimax-vision/next');
        expect(claimed.body).toMatchObject({ kind: 'EXTERNAL_CANDIDATE', imageUrl: candidate.imageUrl });
        await prisma.externalListingSource.update({ where: { id: source.id }, data: {
            authorizationExpiresAt: new Date(Date.now() - 1000),
        } });
        expect((await callback(claimed.body.jobId, { status: 'COMPLETED', result: externalResult })).status).toBe(409);
        expect((await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).aiDraft).toBeNull();
        expect(await expireExternalCandidates()).toBeGreaterThanOrEqual(1);
        expect((await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).status).toBe('STALE');
    });
    it('expires an external source item and discards an in-flight private AI suggestion', async () => {
        const { candidate } = await externalCandidate();
        const claimed = await auth('/api/internal/minimax-vision/next');
        expect(claimed.body).toMatchObject({ kind: 'EXTERNAL_CANDIDATE', jobId: expect.any(String) });
        await prisma.externalListingCandidate.update({ where: { id: candidate.id }, data: {
            expiresAt: new Date(Date.now() - 1_000), aiDraft: { title: 'stale private suggestion' },
        } });
        const now = new Date();
        const staleEligible = await prisma.externalListingCandidate.count({ where: {
            status: { in: ['PENDING_REVIEW', 'APPROVED'] }, OR: [{ expiresAt: { lte: now } },
                { observedAt: { lt: new Date(now.getTime() - EXTERNAL_OBSERVATION_MAX_AGE_MS) } }, { source: { enabled: false } }],
        } });
        expect(staleEligible).toBeGreaterThanOrEqual(1);
        expect(await expireExternalCandidates(now)).toBe(staleEligible);
        expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).toMatchObject({
            status: 'STALE', aiStatus: 'NOT_ELIGIBLE', aiJobId: null, aiInputHash: null, aiDraft: null,
        });
        expect((await callback(claimed.body.jobId, { status: 'COMPLETED', result: externalResult })).status).toBe(409);
        expect((await auth('/api/internal/minimax-vision/next')).status).toBe(204);
    });
    it('discards a late external AI callback when its source observation ages out', async () => {
        const { candidate } = await externalCandidate();
        const claimed = await auth('/api/internal/minimax-vision/next');
        expect(claimed.body).toMatchObject({ kind: 'EXTERNAL_CANDIDATE', jobId: expect.any(String) });
        await prisma.externalListingCandidate.update({ where: { id: candidate.id }, data: {
            observedAt: new Date(Date.now() - 49 * 3_600_000), aiDraft: { title: 'stale private suggestion' },
        } });
        // Reject the callback even before the 15-minute expiry worker wakes.
        expect((await callback(claimed.body.jobId, { status: 'COMPLETED', result: externalResult })).status).toBe(409);
        expect((await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).aiStatus).toBe('PROCESSING');
        expect(await expireExternalCandidates()).toBeGreaterThanOrEqual(1);
        expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).toMatchObject({
            status: 'STALE', aiStatus: 'NOT_ELIGIBLE', aiJobId: null, aiInputHash: null, aiDraft: null,
        });
        expect((await callback(claimed.body.jobId, { status: 'COMPLETED', result: externalResult })).status).toBe(409);
    });
    it('does not lease an old external image during the expiry worker interval', async () => {
        const { candidate } = await externalCandidate();
        await prisma.externalListingCandidate.update({ where: { id: candidate.id }, data: {
            observedAt: new Date(Date.now() - 49 * 3_600_000),
        } });
        await auth('/api/internal/minimax-vision/next');
        expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).toMatchObject({
            status: 'PENDING_REVIEW', aiStatus: 'PENDING', aiJobId: null,
        });
        expect(await expireExternalCandidates()).toBeGreaterThanOrEqual(1);
        expect((await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).status).toBe('STALE');
    });
    it('rejects a reviewed candidate and refuses its late AI callback', async () => {
        const { candidate } = await externalCandidate();
        const claimed = await auth('/api/internal/minimax-vision/next');
        expect(claimed.body).toMatchObject({ kind: 'EXTERNAL_CANDIDATE', jobId: expect.any(String) });
        const reviewed = await request(app).post(`/api/external-intake/candidates/${candidate.id}/reject`)
            .set('x-admin-key', adminKey).send({ expectedContentHash: candidate.contentHash,
                reason: 'ITEM_UNVERIFIED', reviewRef: 'review:synthetic-minimax-2026' });
        expect(reviewed.status).toBe(200);
        expect((await callback(claimed.body.jobId, { status: 'COMPLETED', result: externalResult })).status).toBe(409);
        expect(await prisma.externalListingCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).toMatchObject({
            status: 'REJECTED', aiStatus: 'NOT_ELIGIBLE', aiDraft: null, aiJobId: null,
        });
    });
});
