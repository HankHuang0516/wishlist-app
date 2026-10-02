import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import routes from '../../routes/wishlistRoutes';
import nativeRoutes from '../../routes/nativeWishRoutes';
import mediaRoutes from '../../routes/listingMediaRoutes';
import itemRoutes from '../../routes/itemRoutes';
import { ListingMediaStorage } from '../../lib/listingMediaStorage';
import { ListingFlickrStorage, FlickrOrphanedUpload } from '../../lib/listingFlickrStorage';
import { stageWishPhoto } from '../../lib/stagedWishPhoto';
import { drainMediaErasureTasks, eraseAccountData, readAccountErasureReceipt } from '../../lib/accountErasure';
import * as agentVerify from '../../lib/eclawVerify';
import * as bridge from '../../lib/eclawBridge';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'legacy-manual-integration-only'; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/wishlists', routes); app.use('/api/native-wishes', nativeRoutes); app.use('/api/listing-media', mediaRoutes); app.use('/api/items', itemRoutes);
const server = createServer(app), storage = new ListingMediaStorage();
let owner: number, other: number, parent: number, root: string, image: Buffer, ip = 1;
const priorRoot = process.env.LISTING_MEDIA_STORAGE_ROOT, priorProvider = process.env.LISTING_MEDIA_STORAGE_PROVIDER, priorPilot = process.env.LISTING_MEDIA_FLICKR_PILOT_USER_ID;
const auth = (id = owner) => 'Bearer ' + jwt.sign({ id }, secret, { algorithm: 'HS256' });
const post = (id = owner, list = parent) => request(server).post(`/api/wishlists/${list}/items`).set('Authorization', auth(id)).set('X-Forwarded-For', `192.0.2.${ip++ % 250 + 1}`);
const upload = (fields: Record<string, string> = {}, bytes = image, mime = 'image/png') => {
    let req = post(); for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
    return req.attach('image', bytes, { filename: 'synthetic-private-name.png', contentType: mime });
};
async function drain() { await drainMediaErasureTasks(100, storage); }
async function assertEmpty() { expect(await prisma.item.count({ where: { wishlistId: parent } })).toBe(0); expect(await prisma.listingMedia.count({ where: { ownerUserId: owner } })).toBe(0); }
async function heldRequest(send: () => PromiseLike<request.Response>, change: () => Promise<unknown>) {
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
    const real = ListingMediaStorage.prototype.write;
    const spy = jest.spyOn(ListingMediaStorage.prototype, 'write').mockImplementation(async function (this: ListingMediaStorage, ...args) { await real.apply(this, args); entered(); await gate; });
    const response = send().then(x => x);
    try { await waiting; await change(); release(); return await response; }
    finally { release(); spy.mockRestore(); }
}
const heldUpload = (change: () => Promise<unknown>) => heldRequest(() => upload({ name: '合成等待中的照片' }), change);
async function sourceAndTarget() {
    const result = await upload({ name: '合成可複製照片', price: '0', currency: 'USD', maxPrice: '25.5', priceCurrency: 'TWD' }); expect(result.status).toBe(201);
    await prisma.item.update({ where: { id: result.body.id }, data: { aiStatus: 'COMPLETED' } });
    const target = await prisma.wishlist.create({ data: { userId: other, title: '合成圖片複製目的地' } });
    const key = randomUUID(), body = { targetWishlistId: target.id, clientRequestId: key };
    const send = () => request(server).post(`/api/items/${result.body.id}/clone`).set('Authorization', auth(other)).send(body);
    return { source: result.body, target, key, body, send };
}
beforeAll(async () => {
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wishlist-manual39-test-'));
    process.env.LISTING_MEDIA_STORAGE_ROOT = root; process.env.LISTING_MEDIA_STORAGE_PROVIDER = 'local'; delete process.env.LISTING_MEDIA_FLICKR_PILOT_USER_ID;
    image = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#a17b52' } }).png().toBuffer();
    const run = randomUUID(); const users = await Promise.all(['owner', 'other'].map(role => prisma.user.create({ data: { phoneNumber: 'manual39-' + run + '-' + role, password: 'synthetic-only', name: role } })));
    [owner, other] = users.map(x => x.id);
});
beforeEach(async () => {
    jest.restoreAllMocks(); process.env.LISTING_MEDIA_STORAGE_PROVIDER = 'local'; delete process.env.LISTING_MEDIA_FLICKR_PILOT_USER_ID;
    const media = await prisma.listingMedia.findMany({ where: { ownerUserId: { in: [owner, other] } }, select: { id: true } });
    await prisma.listingMedia.deleteMany({ where: { ownerUserId: { in: [owner, other] } } });
    for (const m of media) await storage.remove(m.id);
    await drain(); await prisma.wishlist.deleteMany({ where: { userId: { in: [owner, other] } } });
    await prisma.user.update({ where: { id: owner }, data: { authVersion: 0 } });
    parent = (await prisma.wishlist.create({ data: { userId: owner, title: '合成舊入口清單', isPublic: true } })).id;
});
afterAll(async () => {
    jest.restoreAllMocks(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await drain(); await fs.rm(root, { recursive: true, force: true }); await prisma.$disconnect();
    for (const [key, value] of Object.entries({ LISTING_MEDIA_STORAGE_ROOT: priorRoot, LISTING_MEDIA_STORAGE_PROVIDER: priorProvider, LISTING_MEDIA_FLICKR_PILOT_USER_ID: priorPilot })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
});
describe('legacy multipart and JSON creation / actual handlers, bounded parser, PostgreSQL and storage', () => {
    it('keeps the unkeyed text entry and separate reference/budget fields including zero', async () => {
        const result = await post().send({ name: '  合成文字  ', notes: '合成備註', price: 0, currency: 'usd', maxPrice: '12.50', priceCurrency: 'eur', proxy_end_user_id: 'opaque-external' });
        expect(result.status).toBe(201); expect(result.headers['cache-control']).toBe('private, no-store');
        expect(result.body).toMatchObject({ name: '合成文字', notes: '合成備註', price: '0', currency: 'USD', maxPrice: 12.5, priceCurrency: 'EUR', imageUrl: null, aiStatus: 'SKIPPED', uploadStatus: 'COMPLETED', proxy_end_user_id: 'opaque-external' });
        expect(result.body).not.toHaveProperty('clientRequestId'); expect(await prisma.legacyWishCreateReceipt.count({ where: { userId: owner } })).toBe(0);
        expect((await post().send({})).body.name).toBe('New Item');
    });
    it.each([{ price: -1 }, { price: 'Infinity' }, { price: {} }, { maxPrice: -1 }, { currency: 'bad-currency' }, { name: [] }, { name: 'a'.repeat(201) }, { name: 'x\u0000y' }, { notes: 'a'.repeat(1001) }, { proxy_end_user_id: {} }, { unexpected: true }])('rejects malformed fields without media or wishes %#', async body => {
        expect((await post().send(body)).status).toBe(400); await assertEmpty();
    });
    it('requires auth and ownership before physical storage', async () => {
        const spy = jest.spyOn(ListingMediaStorage.prototype, 'write');
        expect((await request(server).post(`/api/wishlists/${parent}/items`).attach('image', image, 'synthetic.png')).status).toBe(401);
        expect((await post(other).attach('image', image, 'synthetic.png')).status).toBe(403);
        expect((await post(owner, 2147483647).send({ name: 'x' })).status).toBe(404);
        expect((await request(server).post('/api/wishlists/1.5/items').set('Authorization', auth()).send({})).status).toBe(400);
        expect((await request(server).post(`/api/wishlists/${parent}/items?unexpected=1`).set('Authorization', auth()).send({})).status).toBe(400);
        expect(spy).not.toHaveBeenCalled(); await assertEmpty();
    });
    it('preserves verified agent binding and user-code verification fail-closed', async () => {
        const verify = jest.spyOn(agentVerify, 'verifyEclawAgent').mockResolvedValue({ ok: true, publicCode: 'abc123' });
        const agent = (body: object) => request(server).post(`/api/wishlists/${parent}/items`).set('x-eclaw-agent-token', 'synthetic-transient-proof').send(body);
        expect((await agent({ name: '合成代理', proxy_end_user_id: 'ECLAW:ABC123' })).body.proxy_end_user_id).toBe('eclaw:abc123');
        expect((await agent({ name: 'x', proxy_end_user_id: 'eclaw:xyz987' })).status).toBe(403);
        verify.mockResolvedValue({ ok: false, reason: 'upstream_error' }); expect((await agent({ name: 'x' })).status).toBe(503);
        const publicVerify = jest.spyOn(bridge, 'verifyPublicCode').mockResolvedValue({ ok: false, reason: 'not_found' });
        expect((await post().send({ proxy_end_user_id: 'eclaw:abc123' })).status).toBe(403);
        publicVerify.mockResolvedValue({ ok: false, reason: 'upstream_error' }); expect((await post().send({ proxy_end_user_id: 'eclaw:abc123' })).status).toBe(503);
        publicVerify.mockResolvedValue({ ok: true, entity: { publicCode: 'abc123' } } as any);
        expect((await post().send({ proxy_end_user_id: 'ECLAW:ABC123' })).body.proxy_end_user_id).toBe('eclaw:abc123');
        expect(await prisma.item.count({ where: { wishlistId: parent } })).toBe(2);
    });
    it('serializes text capacity with the native creator', async () => {
        await prisma.wishlist.update({ where: { id: parent }, data: { maxItems: 1 } });
        const results = await Promise.all([post().send({ name: '合成舊入口' }), request(server).post(`/api/native-wishes/lists/${parent}/items`).set('Authorization', auth()).send({ clientRequestId: randomUUID(), name: '合成原生入口' })]);
        expect(results.map(x => x.status).sort()).toEqual([201, 409]); expect(await prisma.item.count({ where: { wishlistId: parent } })).toBe(1);
    });
    it('encodes and owns the real uploaded image before acknowledging an attached completed upload', async () => {
        const result = await upload({ name: '合成照片', price: '0', currency: 'USD', maxPrice: '0', priceCurrency: 'TWD', notes: '合成照片備註' });
        expect(result.status).toBe(201); expect(result.body).toMatchObject({ name: '合成照片', price: '0', currency: 'USD', maxPrice: 0, priceCurrency: 'TWD', uploadStatus: 'COMPLETED', aiStatus: 'PENDING' });
        const media = await prisma.listingMedia.findUnique({ where: { wishItemId: result.body.id } });
        expect(media).toMatchObject({ ownerUserId: owner, capturePurpose: 'MANUAL_PHOTO', width: 320, height: 240, imageUrl: result.body.imageUrl });
        expect(media!.imageUrl).toContain('/listing-media/' + media!.id + '/image'); expect(media!.imageUrl).not.toContain('synthetic-private-name');
        expect(await prisma.mediaErasureTask.findUnique({ where: { mediaId: media!.id } })).toBeNull();
        const read = await request(server).get(`/api/listing-media/${media!.id}/image`); expect(read.status).toBe(200); expect(read.headers['content-type']).toContain('image/webp');
        const metadata = await sharp(read.body).metadata(); expect(metadata.exif).toBeUndefined(); expect(metadata.width).toBe(320);
        const deleted = await request(server).delete('/api/items/' + result.body.id).set('Authorization', auth()); expect(deleted.status).toBe(200);
        expect(await prisma.mediaErasureTask.findUnique({ where: { mediaId: media!.id } })).not.toBeNull(); await drain();
        expect((await request(server).get(`/api/listing-media/${media!.id}/image`)).status).toBe(404); await expect(storage.open(media!.id, 'image')).rejects.toThrow();
    });
    it.each([
        [Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 413],
        [Buffer.from('not a photo'), 'image/png', 400],
        [Buffer.from('not a photo'), 'text/plain', 400],
    ] as const)('rejects over-limit or forged multipart bytes %#', async (bytes, mime, status) => { expect((await upload({}, bytes, mime)).status).toBe(status); await assertEmpty(); });
    it('rejects multiple files, duplicate fields and oversized metadata', async () => {
        expect((await post().attach('image', image, 'a.png').attach('image', image, 'b.png')).status).toBe(400);
        expect((await post().field('name', 'one').field('name', 'two').attach('image', image, 'a.png')).status).toBe(400);
        expect((await post().field('notes', 'a'.repeat(4001)).attach('image', image, 'a.png')).status).toBe(400); await assertEmpty();
    });
    it('fails before upload when destination is already full', async () => {
        await post().send({ name: 'full' }); await prisma.wishlist.update({ where: { id: parent }, data: { maxItems: 1 } });
        const spy = jest.spyOn(ListingMediaStorage.prototype, 'write'); expect((await upload()).status).toBe(409); expect(spy).not.toHaveBeenCalled();
    });
    it('rechecks capacity after provider work and durably cleans a losing physical image', async () => {
        const result = await heldUpload(async () => { await post().send({ name: 'capacity winner' }); await prisma.wishlist.update({ where: { id: parent }, data: { maxItems: 1 } }); });
        expect(result.status).toBe(409); expect(await prisma.item.count({ where: { wishlistId: parent } })).toBe(1);
        const tasks = await prisma.mediaErasureTask.findMany(); expect(tasks).toHaveLength(1); expect(tasks[0].notBefore.getTime()).toBeLessThanOrEqual(Date.now());
        await drain(); expect(await prisma.mediaErasureTask.count()).toBe(0); await expect(storage.open(tasks[0].mediaId, 'image')).rejects.toThrow();
    });
    it('rechecks session revocation after provider work and never attaches the photo', async () => {
        expect((await heldUpload(() => prisma.user.update({ where: { id: owner }, data: { authVersion: 1 } }))).status).toBe(401); await assertEmpty();
        expect(await prisma.mediaErasureTask.count()).toBe(1); await drain(); expect(await prisma.mediaErasureTask.count()).toBe(0);
    });
    it('rejects an expired preparation and retains cleanup rather than committing a broken wish', async () => {
        expect((await heldUpload(() => prisma.mediaErasureTask.updateMany({ data: { notBefore: new Date(0) } }))).status).toBe(409); await assertEmpty(); await drain();
    });
    it('protects a live preparation from cleanup and drains an abandoned expired preparation', async () => {
        const photo = await stageWishPhoto(owner, image, 'image/png');
        expect((await drainMediaErasureTasks(100, storage)).completed).toBe(0); const handle = await storage.open(photo.id, 'image'); await handle.close();
        await prisma.mediaErasureTask.update({ where: { mediaId: photo.id }, data: { notBefore: new Date(0) } });
        expect((await drainMediaErasureTasks(100, storage)).completed).toBe(1); await expect(storage.open(photo.id, 'image')).rejects.toThrow();
    });
    it('keeps the exact Flickr identity in the owned row and after later erasure / provider stub only', async () => {
        process.env.LISTING_MEDIA_STORAGE_PROVIDER = 'flickr'; jest.spyOn(ListingFlickrStorage.prototype, 'ready').mockResolvedValue();
        jest.spyOn(ListingFlickrStorage.prototype, 'upload').mockResolvedValue({ photoId: '123456789', imageSource: 'https://live.staticflickr.com/1/123456789_test.jpg', thumbnailSource: 'https://live.staticflickr.com/1/123456789_test_q.jpg' });
        const result = await upload(); expect(result.status).toBe(201); const media = await prisma.listingMedia.findUnique({ where: { wishItemId: result.body.id } }); expect(media!.flickrPhotoId).toBe('123456789');
        expect((await request(server).delete('/api/items/' + result.body.id).set('Authorization', auth())).status).toBe(200);
        const remove = jest.spyOn(ListingFlickrStorage.prototype, 'remove').mockResolvedValue();
        expect((await drainMediaErasureTasks(100, storage)).completed).toBe(1); expect(remove).toHaveBeenCalledWith('123456789');
    });
    it('retains a Flickr orphan metadata failure for exact durable cleanup / provider stub only', async () => {
        process.env.LISTING_MEDIA_STORAGE_PROVIDER = 'flickr'; jest.spyOn(ListingFlickrStorage.prototype, 'ready').mockResolvedValue();
        jest.spyOn(ListingFlickrStorage.prototype, 'upload').mockRejectedValue(new FlickrOrphanedUpload('123456789')); expect((await upload()).status).toBe(503); await assertEmpty();
        expect((await prisma.mediaErasureTask.findMany())[0]).toMatchObject({ flickrPhotoId: '123456789' });
        const remove = jest.spyOn(ListingFlickrStorage.prototype, 'remove').mockResolvedValue(); await drainMediaErasureTasks(100, storage); expect(remove).toHaveBeenCalledWith('123456789');
    });
    it('bounds concurrent multipart decoding without blocking a text creation', async () => {
        const result = await heldUpload(async () => { expect((await upload()).status).toBe(429); expect((await post().send({ name: 'text still works' })).status).toBe(201); });
        expect(result.status).toBe(201); expect(await prisma.item.count({ where: { wishlistId: parent } })).toBe(2);
    });
    it('keeps its decoder slot until an already dispatched upload finishes after the client disconnects', async () => {
        let entered!: () => void, release!: () => void;
        const waiting = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r), real = ListingMediaStorage.prototype.write;
        const spy = jest.spyOn(ListingMediaStorage.prototype, 'write').mockImplementation(async function (this: ListingMediaStorage, ...args) { await real.apply(this, args); entered(); await gate; });
        const active = upload({ name: '合成失聯原上傳' }), result = active.then(x => x, error => error);
        try {
            await waiting; active.abort(); await result;
            expect((await upload({ name: 'busy rejection' })).status).toBe(429);
            release();
            for (let attempt = 0; attempt < 50; attempt++) {
                if (await prisma.item.count({ where: { wishlistId: parent, name: '合成失聯原上傳' } })) break;
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            expect(await prisma.item.count({ where: { wishlistId: parent, name: '合成失聯原上傳' } })).toBe(1);
            await new Promise(resolve => setImmediate(resolve)); spy.mockRestore();
            expect((await upload({ name: '合成後續明確上傳' })).status).toBe(201);
        } finally { release(); spy.mockRestore(); }
    });
    it('copies an independently owned physical photo and keeps it readable after original wish erasure', async () => {
        const p = await sourceAndTarget(), clone = await p.send(); expect(clone.status).toBe(201);
        expect(clone.body).toMatchObject({ clonedFromItemId: p.source.id, originalUserId: owner, aiStatus: 'COMPLETED', uploadStatus: 'COMPLETED', price: '0', currency: 'USD', maxPrice: 25.5, priceCurrency: 'TWD' });
        const original = await prisma.listingMedia.findUnique({ where: { wishItemId: p.source.id } }), copied = await prisma.listingMedia.findUnique({ where: { wishItemId: clone.body.id } });
        expect(copied!.ownerUserId).toBe(other); expect(copied!.id).not.toBe(original!.id); expect(clone.body.imageUrl).toBe(copied!.imageUrl); expect(clone.body.imageUrl).not.toBe(p.source.imageUrl);
        expect((await request(server).delete('/api/items/' + p.source.id).set('Authorization', auth())).status).toBe(200); await drain();
        expect((await request(server).get(`/api/listing-media/${original!.id}/image`)).status).toBe(404);
        const read = await request(server).get(`/api/listing-media/${copied!.id}/image`); expect(read.status).toBe(200); expect((await sharp(read.body).metadata()).width).toBe(320);
        const replay = await p.send(); expect(replay.status).toBe(201); expect(replay.body).toMatchObject({ id: clone.body.id, imageUrl: copied!.imageUrl, replayed: true });
        expect(await prisma.listingMedia.count({ where: { ownerUserId: other } })).toBe(1);
    });
    it('preserves the independently owned clone after source account erasure and removes original attribution', async () => {
        const password = 'Synthetic-account-erasure39!';
        const erasureAction = randomUUID();
        const user = await prisma.user.create({ data: { phoneNumber: 'manual39-erased-' + randomUUID(), password: await bcrypt.hash(password, 4) } });
        try {
            const list = await prisma.wishlist.create({ data: { userId: user.id, title: '合成刪除來源帳號', isPublic: true } });
            const source = await post(user.id, list.id).field('name', '合成帳號照片').attach('image', image, 'synthetic.png'); expect(source.status).toBe(201);
            await prisma.item.update({ where: { id: source.body.id }, data: { aiStatus: 'COMPLETED' } });
            const clone = await request(server).post('/api/items/' + source.body.id + '/clone').set('Authorization', auth()).send({ targetWishlistId: parent, clientRequestId: randomUUID() }); expect(clone.status).toBe(201);
            const copied = await prisma.listingMedia.findUnique({ where: { wishItemId: clone.body.id } });
            const erased = await eraseAccountData(user.id, 0, password, erasureAction); expect(erased.accountDeleted).toBe(true); await drain();
            expect((await prisma.item.findUnique({ where: { id: clone.body.id } }))!.originalUserId).toBeNull();
            expect(await prisma.listingMedia.findUnique({ where: { id: copied!.id } })).toMatchObject({ ownerUserId: owner, wishItemId: clone.body.id });
            expect((await request(server).get(`/api/listing-media/${copied!.id}/image`)).status).toBe(200);
        } finally {
            await prisma.user.deleteMany({ where: { id: user.id } });
            await prisma.accountErasureReceipt.deleteMany({ where: { clientActionId: erasureAction } });
        }
    });
    it.each(['privacy', 'hidden', 'image', 'capacity', 'session'] as const)('rechecks %s after clone provider work without committing a wish', async mode => {
        const p = await sourceAndTarget();
        const result = await heldRequest(p.send, async () => {
            if (mode === 'privacy') await prisma.wishlist.update({ where: { id: parent }, data: { isPublic: false } });
            if (mode === 'hidden') await prisma.item.update({ where: { id: p.source.id }, data: { isHidden: true } });
            if (mode === 'image') await prisma.item.update({ where: { id: p.source.id }, data: { imageUrl: 'https://images.example.com/changed.jpg' } });
            if (mode === 'capacity') { await prisma.item.create({ data: { wishlistId: p.target.id, name: 'capacity winner' } }); await prisma.wishlist.update({ where: { id: p.target.id }, data: { maxItems: 1 } }); }
            if (mode === 'session') await prisma.user.update({ where: { id: other }, data: { authVersion: 1 } });
        });
        expect(result.status).toBe(mode === 'privacy' || mode === 'hidden' ? 404 : mode === 'session' ? 401 : 409);
        expect(await prisma.wishCreateReceipt.count({ where: { userId: other, clientRequestId: p.key } })).toBe(0);
        expect(await prisma.listingMedia.count({ where: { ownerUserId: other } })).toBe(0); await drain();
        await prisma.user.update({ where: { id: other }, data: { authVersion: 0 } });
    });
    it('safe-stop fences an original clone during provider work and cleans only the staged copy', async () => {
        const p = await sourceAndTarget();
        const result = await heldRequest(p.send, async () => {
            const stopped = await request(server).post('/api/items/clone-receipts/' + p.key + '/abandon').set('Authorization', auth(other)).send({ sourceItemId: p.source.id, targetWishlistId: p.target.id });
            expect(stopped.status).toBe(200); expect(stopped.body.state).toBe('ABANDONED');
        });
        expect(result.status).toBe(410); expect(await prisma.item.count({ where: { wishlistId: p.target.id } })).toBe(0); await drain();
        expect(await prisma.listingMedia.findUnique({ where: { wishItemId: p.source.id } })).not.toBeNull();
    });
    it('same-key concurrent copies commit one owned image and keep losing allocations in exact cleanup tasks', async () => {
        const p = await sourceAndTarget();
        const results = await Promise.all([p.send(), p.send(), p.send()]); expect(results.map(x => x.status)).toEqual([201, 201, 201]); expect(new Set(results.map(x => x.body.id)).size).toBe(1);
        expect(await prisma.listingMedia.count({ where: { ownerUserId: other } })).toBe(1); expect(await prisma.item.count({ where: { wishlistId: p.target.id } })).toBe(1);
        await drain(); expect(await prisma.mediaErasureTask.count()).toBe(0); expect(await prisma.listingMedia.count({ where: { ownerUserId: { in: [owner, other] } } })).toBe(2);
    });
    it('returns 503 for a lost controlled source file without a broken clone or receipt', async () => {
        const p = await sourceAndTarget(), sourceMedia = await prisma.listingMedia.findUnique({ where: { wishItemId: p.source.id } }); await storage.remove(sourceMedia!.id);
        expect((await p.send()).status).toBe(503); expect(await prisma.item.count({ where: { wishlistId: p.target.id } })).toBe(0); expect(await prisma.wishCreateReceipt.count({ where: { userId: other, clientRequestId: p.key } })).toBe(0);
    });
    it('reports a newly stored copy as upload-completed while retaining the source AI failure', async () => {
        const p = await sourceAndTarget(); await prisma.item.update({ where: { id: p.source.id }, data: { uploadStatus: 'FAILED', aiStatus: 'FAILED', aiError: 'synthetic-provider-detail' } });
        const result = await p.send(); expect(result.status).toBe(201); expect(result.body).toMatchObject({ uploadStatus: 'COMPLETED', aiStatus: 'FAILED', aiError: null });
        expect(await prisma.listingMedia.findUnique({ where: { wishItemId: result.body.id } })).toMatchObject({ ownerUserId: other });
    });
    it('independently stores a known legacy flat upload and survives removing the original file', async () => {
        const legacyRoot = path.resolve(process.cwd(), 'public/uploads'), filename = Date.now() + '.png', file = path.join(legacyRoot, filename);
        await fs.mkdir(legacyRoot, { recursive: true }); await fs.writeFile(file, image, { flag: 'wx' });
        try {
            const source = await prisma.item.create({ data: { wishlistId: parent, name: '合成舊flat照片', imageUrl: '/uploads/' + filename, uploadStatus: 'COMPLETED', aiStatus: 'SKIPPED' } });
            const target = await prisma.wishlist.create({ data: { userId: other, title: '合成flat複製清單' } });
            const response = await request(server).post('/api/items/' + source.id + '/clone').set('Authorization', auth(other)).send({ targetWishlistId: target.id, clientRequestId: randomUUID() });
            expect(response.status).toBe(201); const media = await prisma.listingMedia.findUnique({ where: { wishItemId: response.body.id } }); expect(media!.ownerUserId).toBe(other);
            await fs.unlink(file); expect((await request(server).get('/api/listing-media/' + media!.id + '/image')).status).toBe(200);
        } finally { await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    });
    it('copies a known legacy Flickr producer image to an independent local asset / provider read stub only', async () => {
        const bytes = await sharp(image).jpeg().toBuffer(); const read = jest.spyOn(ListingFlickrStorage.prototype, 'read').mockResolvedValue(bytes);
        const url = 'https://live.staticflickr.com/1/123456789_test.jpg';
        const source = await prisma.item.create({ data: { wishlistId: parent, name: '合成舊Flickr照片', imageUrl: url, uploadStatus: 'COMPLETED', aiStatus: 'SKIPPED' } });
        const target = await prisma.wishlist.create({ data: { userId: other, title: '合成Flickr複製清單' } });
        const response = await request(server).post('/api/items/' + source.id + '/clone').set('Authorization', auth(other)).send({ targetWishlistId: target.id, clientRequestId: randomUUID() });
        expect(response.status).toBe(201); expect(read).toHaveBeenCalledWith(url, '123456789');
        const media = await prisma.listingMedia.findUnique({ where: { wishItemId: response.body.id } }); expect(media).toMatchObject({ ownerUserId: other, flickrPhotoId: null });
        expect(response.body.imageUrl).not.toBe(url); expect((await request(server).get('/api/listing-media/' + media!.id + '/image')).status).toBe(200);
    });
    it('includes an in-flight preparation in account erasure history and cleans it after the rejected late create', async () => {
        const password = 'Synthetic-inflight-erasure39!', action = randomUUID();
        const user = await prisma.user.create({ data: { phoneNumber: 'manual39-inflight-erased-' + randomUUID(), password: await bcrypt.hash(password, 4) } });
        try {
            const list = await prisma.wishlist.create({ data: { userId: user.id, title: '合成上傳中刪除帳號' } });
            const response = await heldRequest(() => post(user.id, list.id).attach('image', image, 'synthetic.png'), async () => {
                const erased = await eraseAccountData(user.id, 0, password, action); expect(erased).toMatchObject({ accountDeleted: true, photoCleanupPending: 1 });
                expect((await drainMediaErasureTasks(100, storage)).completed).toBe(0);
            });
            expect(response.status).toBe(401); expect(await prisma.listingMedia.count({ where: { ownerUserId: user.id } })).toBe(0);
            await drain(); expect(await readAccountErasureReceipt(user.id, 0, action)).toMatchObject({ state: 'ERASED', photoCleanupPending: 0 });
        } finally {
            await prisma.user.deleteMany({ where: { id: user.id } });
            await prisma.accountErasureReceipt.deleteMany({ where: { clientActionId: action } });
        }
    });
});
