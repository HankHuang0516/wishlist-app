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
const previous = { user: process.env.MINIMAX_PILOT_USER_ID, token: process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN };
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
});
afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
    if (previous.user === undefined) delete process.env.MINIMAX_PILOT_USER_ID; else process.env.MINIMAX_PILOT_USER_ID = previous.user;
    if (previous.token === undefined) delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN; else process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = previous.token;
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
});
