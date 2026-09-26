import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import marketingRoutes from '../../routes/marketingRoutes';
import marketingWorkerRoutes from '../../routes/marketingWorkerRoutes';
import listingRoutes from '../../routes/listingRoutes';
import { getApiUrl } from '../../config/constants';

require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const saved = { secret: process.env.JWT_SECRET, enabled: process.env.MARKETING_ASSISTANT_ENABLED,
    worker: process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN, device: process.env.ECLAW_RECOGNITION_DEVICE_ID,
    deviceSecret: process.env.ECLAW_RECOGNITION_DEVICE_SECRET };
const secret = 'isolated-marketing-jwt-only';
const worker = 'isolated-marketing-worker-token-never-production';
process.env.JWT_SECRET = secret;
process.env.MARKETING_ASSISTANT_ENABLED = '1';
process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = worker;
process.env.ECLAW_RECOGNITION_DEVICE_ID = 'synthetic-device';
process.env.ECLAW_RECOGNITION_DEVICE_SECRET = 'synthetic-secret';
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/marketing', marketingRoutes); app.use('/api/internal/marketing', marketingWorkerRoutes);
app.use('/api/listings', listingRoutes);
let owner: number, outsider: number;
const token = (id: number) => jwt.sign({ id, authVersion: 0 }, secret);
let requestIp = 1;
const post = (path: string, body: object, id = owner) => request(app).post(`/api/marketing${path}`)
    .set('Authorization', `Bearer ${token(id)}`).set('X-Forwarded-For', `198.51.100.${requestIp++ % 250 + 1}`).send(body);
async function listingPhoto() {
    const listingId = randomUUID(), mediaId = randomUUID();
    await prisma.listing.create({ data: { id: listingId, ownerUserId: owner, clientListingId: randomUUID(),
        requestHash: randomUUID(), title: '合成橘色二手檯燈', description: '燈罩邊緣可見使用痕跡，運作狀態請面交確認。',
        price: 450, currency: 'TWD', condition: 'USED', category: 'home', deliveryMethods: ['MEETUP'],
        status: 'ACTIVE', publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
        media: { create: { id: mediaId, ownerUserId: owner, imageUrl: `${getApiUrl()}/listing-media/${mediaId}/image`,
            thumbnailUrl: `${getApiUrl()}/listing-media/${mediaId}/thumbnail`, contentHash: randomUUID() } } } });
    return { listingId, mediaId };
}
async function candidate(jobId: string, slot: number) {
    const mediaId = randomUUID();
    return prisma.listingMedia.create({ data: { id: mediaId, ownerUserId: owner,
        imageUrl: `${getApiUrl()}/listing-media/${mediaId}/image`,
        thumbnailUrl: `${getApiUrl()}/listing-media/${mediaId}/thumbnail`, contentHash: randomUUID(),
        capturePurpose: 'AI_MARKETING', marketingJobId: jobId, marketingSlot: slot } });
}
beforeAll(async () => {
    const suffix = randomUUID();
    const users = await Promise.all(['owner', 'outsider'].map(role => prisma.user.create({ data: {
        phoneNumber: `marketing-${suffix}-${role}`, password: 'synthetic-only' }, select: { id: true } })));
    [owner, outsider] = users.map(user => user.id);
});
beforeEach(async () => {
    await prisma.marketingJob.deleteMany({ where: { ownerUserId: owner } });
    await prisma.listingMedia.deleteMany({ where: { ownerUserId: owner } });
    await prisma.listing.deleteMany({ where: { ownerUserId: owner } });
});
afterAll(async () => {
    if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner, outsider] } } });
    await prisma.$disconnect();
    const restore = (key: string, value?: string) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
    restore('JWT_SECRET', saved.secret); restore('MARKETING_ASSISTANT_ENABLED', saved.enabled);
    restore('WISHLIST_MINIMAX_CALLBACK_TOKEN', saved.worker);
    restore('ECLAW_RECOGNITION_DEVICE_ID', saved.device); restore('ECLAW_RECOGNITION_DEVICE_SECRET', saved.deviceSecret);
});

describe('marketing four-image workflow / isolated PostgreSQL', () => {
    it('requires ownership and worker capability, queues idempotently, never publishes before approval', async () => {
        const { listingId, mediaId } = await listingPhoto();
        const body = { clientRequestId: randomUUID(), listingId, sourceMediaId: mediaId };
        expect((await request(app).post('/api/marketing/jobs').send(body)).status).toBe(401);
        expect((await post('/jobs', body, outsider)).status).toBe(404);
        expect((await request(app).get('/api/internal/marketing/next')).status).toBe(404);
        const created = await post('/jobs', body);
        expect(created.status).toBe(202); expect(created.body.status).toBe('PENDING');
        expect((await post('/jobs', body)).body.id).toBe(created.body.id);
        expect((await post('/jobs', { ...body, sourceMediaId: randomUUID() })).status).toBe(404);
        expect((await request(app).get(`/api/marketing/jobs/${created.body.id}`).set('Authorization', `Bearer ${token(outsider)}`)).status).toBe(404);
        const workerJob = await request(app).get('/api/internal/marketing/next').set('Authorization', `Bearer ${worker}`);
        expect(workerJob.status).toBe(200);
        expect(workerJob.body).toMatchObject({ id: created.body.id, slots: [1, 2, 3, 4] });
        expect((await request(app).get(`/api/listings/${listingId}`)).body.media).toHaveLength(1);
        const generated = [];
        for (let slot = 1; slot <= 4; slot++) generated.push(await candidate(created.body.id, slot));
        await prisma.marketingJob.update({ where: { id: created.body.id }, data: { status: 'REVIEW',
            workerLeaseId: null, deliveredAt: new Date(), copy: '合成橘色二手檯燈，售價 NT$450。請以實拍照片與面交檢查為準。' } });
        expect((await request(app).get(`/api/listings/${listingId}`)).body.media).toHaveLength(1);
        const approved = await post(`/jobs/${created.body.id}/approve`, { selectedMediaIds: generated.map(item => item.id),
            copy: '合成橘色二手檯燈，售價 NT$450。請以實拍照片與面交檢查為準。' });
        expect(approved.status).toBe(200);
        const publicView = await request(app).get(`/api/listings/${listingId}`);
        expect(publicView.body.media).toHaveLength(5);
        expect(publicView.body.media[0]).toMatchObject({ id: generated[0].id, capturePurpose: 'AI_MARKETING' });
        expect(publicView.body.media.at(-1).id).toBe(mediaId);
    });
    it('only reveals the free limit when reached and does not treat legacy Premium as verified', async () => {
        for (let i = 0; i < 3; i++) {
            const { listingId, mediaId } = await listingPhoto();
            expect((await post('/jobs', { clientRequestId: randomUUID(), listingId, sourceMediaId: mediaId })).status).toBe(202);
        }
        await prisma.user.update({ where: { id: owner }, data: { isPremium: true } });
        const { listingId, mediaId } = await listingPhoto();
        const denied = await post('/jobs', { clientRequestId: randomUUID(), listingId, sourceMediaId: mediaId });
        expect(denied.status).toBe(429); expect(denied.body.errorCode).toBe('MONTHLY_LIMIT');
        expect(denied.body.error).toContain('3 次');
    });
    it('allows exactly one free seven-day revision and keeps unchecked images', async () => {
        const { listingId, mediaId } = await listingPhoto();
        const created = await post('/jobs', { clientRequestId: randomUUID(), listingId, sourceMediaId: mediaId });
        const original = [];
        for (let slot = 1; slot <= 4; slot++) original.push(await candidate(created.body.id, slot));
        await prisma.marketingJob.update({ where: { id: created.body.id }, data: { status: 'REVIEW', deliveredAt: new Date(),
            copy: '合成橘色二手檯燈，售價 NT$450。請以實拍照片與面交檢查為準。' } });
        const revised = await post(`/jobs/${created.body.id}/revision`, { clientRequestId: randomUUID(),
            prompt: '將背景調亮，保留實拍檯燈外觀', slots: [2, 4] });
        expect(revised.status).toBe(202);
        expect((await post(`/jobs/${created.body.id}/revision`, { clientRequestId: randomUUID(),
            prompt: '不同要求', slots: [1] })).status).toBe(409);
        const next = await request(app).get('/api/internal/marketing/next').set('Authorization', `Bearer ${worker}`);
        expect(next.body).toMatchObject({ id: revised.body.id, slots: [2, 4], isRevision: true });
        const replacements = [await candidate(revised.body.id, 2), await candidate(revised.body.id, 4)];
        await prisma.marketingJob.update({ where: { id: revised.body.id }, data: { status: 'REVIEW',
            workerLeaseId: null, deliveredAt: new Date(), copy: '合成橘色二手檯燈，售價 NT$450。請以實拍照片與面交檢查為準。' } });
        const shown = await request(app).get(`/api/marketing/jobs/${revised.body.id}`)
            .set('Authorization', `Bearer ${token(owner)}`);
        expect(shown.body.generatedMedia.map((item: { id: string }) => item.id)).toEqual([
            original[0].id, replacements[0].id, original[2].id, replacements[1].id]);
        expect(shown.body.previousMedia.map((item: { id: string }) => item.id)).toEqual([original[1].id, original[3].id]);
        const approved = await post(`/jobs/${revised.body.id}/approve`, { selectedMediaIds: [
            original[0].id, original[1].id, original[2].id, replacements[1].id],
            copy: '合成橘色二手檯燈，售價 NT$450。請以實拍照片與面交檢查為準。' });
        expect(approved.status).toBe(200);
        const published = await request(app).get(`/api/listings/${listingId}`);
        expect(published.body.media.map((item: { id: string }) => item.id)).toEqual([
            original[0].id, original[1].id, original[2].id, replacements[1].id, mediaId]);
    });
    it('keeps AI draft art private until seller approval and attaches approved art alongside the real photo', async () => {
        const mediaId = randomUUID(), originalDescription = '橘色檯燈，燈罩邊緣有使用痕跡，功能請面交檢查。';
        const draft = { clientListingId: randomUUID(), form: { title: '合成橘色二手檯燈', description: originalDescription,
            brand: '', category: 'home', condition: 'USED', price: '450' }, touched: {} };
        await prisma.listingMedia.create({ data: { id: mediaId, ownerUserId: owner,
            imageUrl: `${getApiUrl()}/listing-media/${mediaId}/image`,
            thumbnailUrl: `${getApiUrl()}/listing-media/${mediaId}/thumbnail`, contentHash: randomUUID(),
            capturePurpose: 'BATCH_ITEM', aiDraftStatus: 'COMPLETED', sellerDraft: draft } });
        const queued = await post('/jobs', { clientRequestId: randomUUID(), sourceMediaId: mediaId });
        expect(queued.status).toBe(202);
        const images = [];
        for (let slot = 1; slot <= 4; slot++) images.push(await candidate(queued.body.id, slot));
        await prisma.marketingJob.update({ where: { id: queued.body.id }, data: { status: 'REVIEW',
            deliveredAt: new Date(), copy: '合成橘色二手檯燈，售價 NT$450。請以實拍照片與面交檢查為準。' } });
        expect(await prisma.listing.count({ where: { ownerUserId: owner } })).toBe(0);
        const revision = await post(`/jobs/${queued.body.id}/revision`, { clientRequestId: randomUUID(),
            prompt: '第二張背景調亮，保留商品本體', slots: [2] });
        expect(revision.status).toBe(202);
        const replacement = await candidate(revision.body.id, 2);
        await prisma.marketingJob.update({ where: { id: revision.body.id }, data: { status: 'REVIEW',
            deliveredAt: new Date(), copy: '合成橘色二手檯燈，售價 NT$450。請以實拍照片與面交檢查為準。' } });
        const chosen = [images[0], replacement, images[2], images[3]];
        const confirmed = await post(`/jobs/${revision.body.id}/approve`, { selectedMediaIds: chosen.map(image => image.id),
            copy: '合成橘色二手檯燈，售價 NT$450。請以實拍照片與面交檢查為準。' });
        expect(confirmed.status).toBe(200);
        const saved = await prisma.listingMedia.findUniqueOrThrow({ where: { id: mediaId }, select: { sellerDraft: true } });
        const approvedDraft = saved.sellerDraft as typeof draft;
        expect(approvedDraft.form.description).toContain('【行銷小助手文案】');
        expect(approvedDraft.touched).toMatchObject({ description: true });
        await prisma.user.update({ where: { id: owner }, data: { isPhoneVerified: true } });
        const published = await request(app).post('/api/listings').set('Authorization', `Bearer ${token(owner)}`).send({
            clientListingId: draft.clientListingId, title: draft.form.title, description: approvedDraft.form.description,
            condition: 'USED', category: 'home', price: 450, currency: 'TWD', deliveryMethods: ['MEETUP'],
            mediaIds: [mediaId], location: { county: '臺北市', district: '中正區', latitude: 25.05, longitude: 121.51 },
            publish: true, consentToMap: true,
        });
        expect(published.status).toBe(201);
        expect(published.body.media.map((image: { id: string }) => image.id)).toEqual([...chosen.map(image => image.id), mediaId]);
    });
});
