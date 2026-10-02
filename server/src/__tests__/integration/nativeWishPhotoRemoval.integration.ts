import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import prisma from '../../lib/prisma';
import wishRoutes from '../../routes/nativeWishRoutes';
import mediaRoutes from '../../routes/listingMediaRoutes';
import { ListingMediaStorage } from '../../lib/listingMediaStorage';
import { ListingFlickrStorage } from '../../lib/listingFlickrStorage';
import { drainMediaErasureTasks } from '../../lib/accountErasure';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Explicit equal isolated test DB required');
const secret = 'wish-photo-removal-integration-only'; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/native-wishes', wishRoutes); app.use('/api/listing-media', mediaRoutes);
const server = createServer(app), root = '/api/native-wishes/photo-removals/';
const saved = { NODE_ENV: process.env.NODE_ENV, LISTING_MEDIA_STORAGE_ROOT: process.env.LISTING_MEDIA_STORAGE_ROOT,
    LISTING_MEDIA_STORAGE_PROVIDER: process.env.LISTING_MEDIA_STORAGE_PROVIDER, API_URL: process.env.API_URL };
let owner: number, outsider: number, folder: string, jpeg: Buffer, sequence = 1;
const ids = new Set<string>();
const auth = (user = owner) => 'Bearer ' + jwt.sign({ id: user }, secret);
const get = (uploadId: string, user = owner) => request(server).get(root + uploadId).set('Authorization', auth(user));
const remove = (uploadId: string, mediaId: string, user = owner) => request(server).post(root + uploadId).set('Authorization', auth(user)).send({ mediaId });
async function upload(uploadId: string = randomUUID(), user = owner, purpose = 'MANUAL_PHOTO') {
    const res = await request(server).post('/api/listing-media').set('Authorization', auth(user))
        .set('X-Forwarded-For', '198.51.100.' + (sequence++ % 250 + 1))
        .field('clientUploadId', uploadId).field('capturePurpose', purpose).attach('image', jpeg, 'synthetic-lamp.jpg');
    if (res.body.id) ids.add(res.body.id);
    return { res, uploadId, mediaId: res.body.id as string };
}
async function photo() { const result = await upload(); expect(result.res.status).toBe(201); return result; }
async function cleanup() {
    if (!owner) return;
    await prisma.marketingJob.deleteMany({ where: { ownerUserId: { in: [owner, outsider] } } });
    await prisma.wishlist.deleteMany({ where: { userId: { in: [owner, outsider] } } });
    await prisma.wishCreateReceipt.deleteMany({ where: { userId: { in: [owner, outsider] } } });
    await prisma.wishPhotoRemovalReceipt.deleteMany({ where: { userId: { in: [owner, outsider] } } });
    await prisma.listingMedia.deleteMany({ where: { ownerUserId: { in: [owner, outsider] } } });
    await prisma.mediaErasureTask.deleteMany({ where: { mediaId: { in: [...ids] } } });
    const storage = new ListingMediaStorage(); for (const id of ids) await storage.remove(id);
}
beforeAll(async () => {
    process.env.NODE_ENV = 'test'; process.env.LISTING_MEDIA_STORAGE_PROVIDER = 'local'; process.env.API_URL = 'https://example.invalid/api';
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'wishlist-wish-photo-removal-test-')); process.env.LISTING_MEDIA_STORAGE_ROOT = folder;
    jpeg = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#aa7722' } }).jpeg().toBuffer();
    const run = randomUUID(), users = await Promise.all(['owner', 'outsider'].map(role => prisma.user.create({ data: { phoneNumber: `wish-removal-${run}-${role}`, password: 'synthetic-unused', name: role }, select: { id: true } })));
    [owner, outsider] = users.map(user => user.id);
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
});
beforeEach(cleanup);
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
    await cleanup(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner, outsider] } } }); await prisma.$disconnect();
    if (folder) await fs.rmdir(folder); // Empty suite-owned temporary root only.
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
describe('unused wish photo removal / real HTTP, PostgreSQL and local photo storage', () => {
    it('requires auth and rejects malformed/query/extra-field requests without deleting the media', async () => {
        const p = await photo();
        expect((await request(server).post(root + p.uploadId).send({ mediaId: p.mediaId })).status).toBe(401);
        expect((await request(server).get(root + p.uploadId)).status).toBe(401);
        expect((await get('bad')).status).toBe(400);
        expect((await get(p.uploadId + '?extra=1')).status).toBe(400);
        for (const body of [{}, { mediaId: 'bad' }, { mediaId: p.mediaId, ownerUserId: owner }]) {
            expect((await request(server).post(root + p.uploadId).set('Authorization', auth()).send(body)).status).toBe(400);
        }
        expect(await prisma.listingMedia.count({ where: { id: p.mediaId } })).toBe(1);
    });
    it('records one durable minimal private receipt and queues physical cleanup without falsely reporting it done', async () => {
        const p = await photo(); expect((await get(p.uploadId)).status).toBe(404);
        const result = await remove(p.uploadId, p.mediaId);
        expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('private, no-store');
        expect(result.body).toEqual({ clientUploadId: p.uploadId, mediaId: p.mediaId, removed: true, removedAt: expect.any(String), cleanupPending: true });
        expect(await prisma.listingMedia.count({ where: { id: p.mediaId } })).toBe(0);
        expect(await prisma.mediaErasureTask.findUnique({ where: { mediaId: p.mediaId } })).toMatchObject({ attempts: 0 });
        expect((await get(p.uploadId)).body).toEqual(result.body);
        expect((await fs.stat(path.join(folder, p.mediaId, 'image.webp'))).isFile()).toBe(true);
    });
    it('serializes 12 parallel repeats and preserves the original receipt timestamp and one cleanup task', async () => {
        const p = await photo(), attempts = await Promise.all(Array.from({ length: 12 }, () => remove(p.uploadId, p.mediaId)));
        expect(attempts.map(result => result.status)).toEqual(Array(12).fill(200));
        expect(new Set(attempts.map(result => result.body.removedAt)).size).toBe(1);
        expect(await prisma.wishPhotoRemovalReceipt.count({ where: { userId: owner } })).toBe(1);
        expect(await prisma.mediaErasureTask.count({ where: { mediaId: p.mediaId } })).toBe(1);
    });
    it('normalizes UUID case and blocks delayed re-upload in both original and uppercase forms', async () => {
        const original = randomUUID().toUpperCase(), p = await upload(original); expect(p.res.status).toBe(201);
        const result = await remove(original.toLowerCase(), p.mediaId.toUpperCase()); expect(result.status).toBe(200);
        expect((await get(original)).body.clientUploadId).toBe(original.toLowerCase());
        expect((await upload(original)).res.status).toBe(409); expect((await upload(original.toLowerCase())).res.status).toBe(409);
        expect(await prisma.listingMedia.count({ where: { ownerUserId: owner } })).toBe(0);
        expect(await fs.readdir(folder)).toEqual([p.mediaId]);
    });
    it('does not substitute a different media ID for the same removal operation', async () => {
        const a = await photo(), b = await photo(); expect((await remove(a.uploadId, a.mediaId)).status).toBe(200);
        expect((await remove(a.uploadId, b.mediaId)).status).toBe(409);
        expect(await prisma.listingMedia.count({ where: { id: b.mediaId } })).toBe(1);
        expect((await remove(randomUUID(), b.mediaId)).status).toBe(404);
    });
    it('hides both media and receipts from another owner, while allowing independent same-ID ownership', async () => {
        const a = await photo(); expect((await remove(a.uploadId, a.mediaId, outsider)).status).toBe(404);
        expect((await remove(a.uploadId, a.mediaId)).status).toBe(200); expect((await get(a.uploadId, outsider)).status).toBe(404);
        const other = await upload(a.uploadId, outsider); expect(other.res.status).toBe(201);
        expect((await remove(a.uploadId, other.mediaId, outsider)).status).toBe(200);
        expect((await get(a.uploadId)).body.mediaId).toBe(a.mediaId);
    });
    it('refuses a photo attached to a wish and preserves the wish image and both original identities', async () => {
        const p = await photo(), parent = await prisma.wishlist.create({ data: { userId: owner, title: 'synthetic' } });
        const created = await request(server).post(`/api/native-wishes/lists/${parent.id}/items`).set('Authorization', auth())
            .send({ clientRequestId: randomUUID(), mediaId: p.mediaId, name: '合成照片願望' });
        expect(created.status).toBe(201); expect((await remove(p.uploadId, p.mediaId)).status).toBe(409);
        expect(await prisma.listingMedia.findUnique({ where: { id: p.mediaId } })).toMatchObject({ wishItemId: created.body.resource.id });
        expect((await get(p.uploadId)).status).toBe(404);
    });
    it.each(['batch', 'sellerDraft', 'aiPending', 'marketingSource', 'marketingOutput'])('protects a non-unused-wish media: %s', async kind => {
        const p = await photo();
        if (kind === 'batch') await prisma.listingMedia.update({ where: { id: p.mediaId }, data: { capturePurpose: 'BATCH_ITEM' } });
        if (kind === 'sellerDraft') await prisma.listingMedia.update({ where: { id: p.mediaId }, data: { sellerDraft: { title: 'protected' } } });
        if (kind === 'aiPending') await prisma.listingMedia.update({ where: { id: p.mediaId }, data: { aiDraftStatus: 'PENDING' } });
        if (kind === 'marketingSource') await prisma.marketingJob.create({ data: { ownerUserId: owner, sourceMediaId: p.mediaId, clientRequestId: randomUUID(), requestHash: 'synthetic', snapshot: {}, status: 'FAILED' } });
        if (kind === 'marketingOutput') await prisma.listingMedia.update({ where: { id: p.mediaId }, data: { capturePurpose: 'AI_MARKETING' } });
        expect((await remove(p.uploadId, p.mediaId)).status).toBe(409);
        expect(await prisma.listingMedia.count({ where: { id: p.mediaId } })).toBe(1);
        expect(await prisma.mediaErasureTask.count({ where: { mediaId: p.mediaId } })).toBe(0);
    });
    it('keeps failed physical cleanup pending, then actually erases both files while preserving unrelated photos', async () => {
        const p = await photo(), untouched = await photo(); expect((await remove(p.uploadId, p.mediaId)).status).toBe(200);
        // Worker candidates can include older isolated fixtures. Never erase
        // those: reject every ID outside this exact test target.
        const storage = new ListingMediaStorage(), realRemove = storage.remove.bind(storage);
        const removeFile = jest.spyOn(storage, 'remove').mockRejectedValue(new Error('synthetic provider offline'));
        const flickr = new ListingFlickrStorage(); jest.spyOn(flickr, 'remove').mockRejectedValue(new Error('no external transport in this test'));
        await drainMediaErasureTasks(100, storage, flickr); expect((await get(p.uploadId)).body.cleanupPending).toBe(true);
        expect(await prisma.mediaErasureTask.findUnique({ where: { mediaId: p.mediaId } })).toMatchObject({ attempts: 1 });
        removeFile.mockImplementation(async id => { if (id !== p.mediaId) throw new Error('outside this test'); await realRemove(id); });
        await drainMediaErasureTasks(100, storage, flickr); expect((await get(p.uploadId)).body.cleanupPending).toBe(false);
        await expect(fs.stat(path.join(folder, p.mediaId))).rejects.toMatchObject({ code: 'ENOENT' });
        expect((await fs.stat(path.join(folder, untouched.mediaId, 'thumbnail.webp'))).isFile()).toBe(true);
        expect((await remove(p.uploadId, p.mediaId)).body.cleanupPending).toBe(false);
    });
    it('serializes wish attachment versus removal: one wins, and neither outcome produces an orphaned wish', async () => {
        const p = await photo(), parent = await prisma.wishlist.create({ data: { userId: owner, title: 'synthetic race' } });
        const [deleted, attached] = await Promise.all([remove(p.uploadId, p.mediaId), request(server).post(`/api/native-wishes/lists/${parent.id}/items`).set('Authorization', auth()).send({ clientRequestId: randomUUID(), mediaId: p.mediaId, name: 'race' })]);
        expect([[200, 409], [409, 201]]).toContainEqual([deleted.status, attached.status]);
        expect(await prisma.item.count({ where: { wishlistId: parent.id } })).toBe(attached.status === 201 ? 1 : 0);
        expect(await prisma.listingMedia.count({ where: { id: p.mediaId } })).toBe(attached.status === 201 ? 1 : 0);
    });
    it('canonicalizes case-variant retries before provider work and fences later wish removal without duplicate files', async () => {
        const p = await photo(), write = jest.spyOn(ListingMediaStorage.prototype, 'write');
        // A case variant now resolves the SAME durable receipt before provider
        // work. Never wait for the obsolete duplicate-write path to occur.
        const [late, removed] = await Promise.all([upload(p.uploadId.toUpperCase()), remove(p.uploadId, p.mediaId)]);
        expect(removed.status).toBe(200); expect([200,409]).toContain(late.res.status);
        if(late.res.status===200)expect(late.mediaId).toBe(p.mediaId);
        expect(write).not.toHaveBeenCalled();
        expect((await upload(p.uploadId.toUpperCase())).res.status).toBe(409);
        expect(await prisma.listingMedia.count({ where: { ownerUserId: owner } })).toBe(0);
        expect(await fs.readdir(folder)).toEqual([p.mediaId]);
    });
    it('rolls back photo deletion and erasure outbox if the durable receipt cannot be committed', async () => {
        const p = await photo(), transaction = prisma.$transaction.bind(prisma);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(prisma, '$transaction').mockImplementation(((action: (tx: unknown) => Promise<unknown>, options?: unknown) => transaction(async (tx: any) => {
            const proxy = new Proxy(tx, { get: (target, key) => key === 'wishPhotoRemovalReceipt' ? { ...target[key], create: async () => { throw new Error('synthetic write failure'); } } : target[key] });
            return action(proxy);
        }, options as any)) as any);
        expect((await remove(p.uploadId, p.mediaId)).status).toBe(503);
        expect(await prisma.listingMedia.count({ where: { id: p.mediaId } })).toBe(1);
        expect(await prisma.mediaErasureTask.count({ where: { mediaId: p.mediaId } })).toBe(0);
        expect(await prisma.wishPhotoRemovalReceipt.count({ where: { userId: owner } })).toBe(0);
    });
    it('cascades account-owned receipts on erasure while retaining identity-free physical cleanup', async () => {
        const temporary = await prisma.user.create({ data: { phoneNumber: 'wish-removal-erased-' + randomUUID(), password: 'synthetic' } });
        try {
            const p = await upload(randomUUID(), temporary.id); expect(p.res.status).toBe(201);
            expect((await remove(p.uploadId, p.mediaId, temporary.id)).status).toBe(200);
            await prisma.user.delete({ where: { id: temporary.id } });
            expect(await prisma.wishPhotoRemovalReceipt.count({ where: { userId: temporary.id } })).toBe(0);
            expect(await prisma.mediaErasureTask.findUnique({ where: { mediaId: p.mediaId } })).not.toBeNull();
            expect((await get(p.uploadId, temporary.id)).status).toBe(401);
        } finally { await prisma.user.deleteMany({ where: { id: temporary.id } }); }
    });
});
