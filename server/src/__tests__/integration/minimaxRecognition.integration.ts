import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import route from '../../routes/minimaxRecognitionRoutes';
import { getApiUrl } from '../../config/constants';

require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated matching test database required');

const app = express(); app.use(express.json()); app.use('/api/internal/minimax-vision', route);
const token = 'synthetic-minimax-pilot-token-at-least-32-chars';
const previous = { user: process.env.MINIMAX_PILOT_USER_ID, token: process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN,
    listingEnabled: process.env.MINIMAX_LISTING_AI_ENABLED, listingPilot: process.env.MINIMAX_LISTING_AI_PILOT_USER_ID };
let userId: number, listId: number;
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
});
afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
    if (previous.user === undefined) delete process.env.MINIMAX_PILOT_USER_ID; else process.env.MINIMAX_PILOT_USER_ID = previous.user;
    if (previous.token === undefined) delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN; else process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = previous.token;
    if (previous.listingEnabled === undefined) delete process.env.MINIMAX_LISTING_AI_ENABLED; else process.env.MINIMAX_LISTING_AI_ENABLED = previous.listingEnabled;
    if (previous.listingPilot === undefined) delete process.env.MINIMAX_LISTING_AI_PILOT_USER_ID; else process.env.MINIMAX_LISTING_AI_PILOT_USER_ID = previous.listingPilot;
});

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
});
