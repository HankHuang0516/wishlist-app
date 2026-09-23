import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import prisma from '../../lib/prisma';
import listingRoutes from '../../routes/listingRoutes';
import mediaRoutes from '../../routes/listingMediaRoutes';
import wishRoutes from '../../routes/nativeWishRoutes';
import { drainMediaErasureTasks } from '../../lib/accountErasure';

const { assertTestDatabase } = require('../../../../scripts/assert-test-database.cjs');
assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Explicit matching test database configuration required');
const secret = 'media-integration-only-test-secret'; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/listings', listingRoutes); app.use('/api/listing-media', mediaRoutes); app.use('/api/native-wishes', wishRoutes);
let seller: number, third: number, root: string, jpeg: Buffer, sequence = 1;
const savedRoot = process.env.LISTING_MEDIA_STORAGE_ROOT;
const savedMode = process.env.NODE_ENV;
const token = (id: number) => jwt.sign({ id }, secret, { expiresIn: '1h' });
const upload = (id = seller, clientUploadId: string = randomUUID(), input?: Buffer, mime = 'image/jpeg') => request(app).post('/api/listing-media')
    .set('Authorization', 'Bearer ' + token(id)).set('X-Forwarded-For', '198.51.100.' + (sequence++ % 250 + 1))
    .field('clientUploadId', clientUploadId).attach('image', input ?? jpeg, { filename: '../../private-address.jpg', contentType: mime });
const image = (id: string, variant = 'image', user?: number) => {
    const r = request(app).get(`/api/listing-media/${id}/${variant}`); return user ? r.set('Authorization', 'Bearer ' + token(user)) : r;
};
const del = (id: string, user = seller) => request(app).delete('/api/listing-media/' + id).set('Authorization', 'Bearer ' + token(user));
const listingBody = (mediaId: string, publish = true) => ({ clientListingId: randomUUID(), title: '測試商品照片', description: '合成測試圖片與商品', brand: '測試品牌', category: 'other', condition: 'USED',
    price: 99, deliveryMethods: ['MEETUP'], mediaIds: [mediaId], location: { county: '台北市', district: '中山區', latitude: 25.05, longitude: 121.52 }, publish, consentToMap: publish });

beforeAll(async () => {
    process.env.NODE_ENV = 'test'; root = await fs.mkdtemp(path.join(os.tmpdir(), 'wishlist-media-api-test-')); process.env.LISTING_MEDIA_STORAGE_ROOT = root;
    const run = randomUUID(); const users = await Promise.all(['seller', 'third'].map(role => prisma.user.create({ data: { phoneNumber: `${run}-${role}`, password: 'synthetic-unused-password', isEmailVerified: true } })));
    [seller, third] = users.map(x => x.id);
    jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#cc8855' } }).jpeg()
        .withExif({ IFD0: { Artist: 'PRIVATE_TEST_OWNER' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 3/1 1/1', GPSLongitudeRef: 'E', GPSLongitude: '121/1 31/1 1/1' } }).toBuffer();
});
beforeEach(async () => {
    await prisma.wishlist.deleteMany({ where: { userId: { in: [seller, third] } } });
    await prisma.wishCreateReceipt.deleteMany({ where: { userId: { in: [seller, third] } } });
    await prisma.listing.deleteMany({ where: { ownerUserId: { in: [seller, third] } } });
    await prisma.listingMedia.deleteMany({ where: { ownerUserId: { in: [seller, third] } } });
});
afterAll(async () => {
    if (seller) await prisma.user.deleteMany({ where: { id: { in: [seller, third] } } });
    await prisma.$disconnect();
    if (savedRoot === undefined) delete process.env.LISTING_MEDIA_STORAGE_ROOT; else process.env.LISTING_MEDIA_STORAGE_ROOT = savedRoot;
    if (savedMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedMode;
    if (root) await fs.rm(root, { recursive: true, force: true }); // Exactly this suite's generated temp folder.
});

describe('real listing photo upload / private read / PostgreSQL', () => {
    it('requires real authentication before receiving any upload', async () => {
        const r = await request(app).post('/api/listing-media').attach('image', jpeg, 'photo.jpg'); expect(r.status).toBe(401);
        expect(await prisma.listingMedia.count({ where: { ownerUserId: seller } })).toBe(0);
    });
    it('persists only encoded WebP and thumbnail; original names and metadata do not escape', async () => {
        const r = await upload(); expect(r.status).toBe(201);
        expect(r.body).toMatchObject({ width: 640, height: 480 });
        expect(JSON.stringify(r.body)).not.toContain('private-address'); expect(JSON.stringify(r.body)).not.toContain(root);
        const files = (await fs.readdir(path.join(root, r.body.id))).sort(); expect(files).toEqual(['image.webp', 'thumbnail.webp']);
        const actual = await image(r.body.id, 'image', seller); expect(actual.status).toBe(200);
        expect(actual.headers['content-type']).toBe('image/webp'); expect(actual.headers['cache-control']).toBe('private, no-store'); expect(actual.headers['x-content-type-options']).toBe('nosniff');
        const metadata = await sharp(actual.body).metadata(); expect(metadata.exif).toBeUndefined(); expect(metadata.xmp).toBeUndefined();
        expect(actual.body.includes(Buffer.from('PRIVATE_TEST_OWNER'))).toBe(false);
        expect(await sharp((await image(r.body.id, 'thumbnail', seller)).body).metadata()).toMatchObject({ width: 320, height: 320 });
    });
    it('does not expose unbound/draft photos to anonymous users or another authenticated user', async () => {
        const photo = (await upload()).body;
        expect((await image(photo.id)).status).toBe(404); expect((await image(photo.id, 'image', third)).status).toBe(404);
        const draft = await request(app).post('/api/listings').set('Authorization', 'Bearer ' + token(seller)).send(listingBody(photo.id, false)); expect(draft.status).toBe(201);
        expect((await image(photo.id)).status).toBe(404); expect((await image(photo.id, 'thumbnail', third)).status).toBe(404);
        expect((await image(photo.id, 'thumbnail', seller)).status).toBe(200);
    });
    it('attaches a camera/gallery upload to one wish, exposes its opaque image to EClaw, and erases it on deletion', async () => {
        const photo = (await upload()).body;
        expect((await image(photo.id)).status).toBe(404);
        const list = await request(app).post('/api/native-wishes/lists').set('Authorization', 'Bearer ' + token(seller))
            .send({ clientRequestId: randomUUID(), title: '合成照片願望' });
        expect(list.status).toBe(201);
        const body = { clientRequestId: randomUUID(), name: '待辨識商品', mediaId: photo.id };
        const create = () => request(app).post(`/api/native-wishes/lists/${list.body.resource.id}/items`)
            .set('Authorization', 'Bearer ' + token(seller)).send(body);
        const first = await create(), repeat = await create();
        expect(first.status).toBe(201); expect(first.body.replayed).toBe(false);
        expect(first.body.resource).toMatchObject({ imageUrl: photo.imageUrl, aiStatus: 'PENDING' });
        expect(repeat.status).toBe(201); expect(repeat.body.replayed).toBe(true);
        expect((await image(photo.id)).status).toBe(200);
        expect((await request(app).post(`/api/native-wishes/lists/${list.body.resource.id}/items`).set('Authorization', 'Bearer ' + token(third))
            .send({ clientRequestId: randomUUID(), name: 'steal', mediaId: photo.id })).status).toBe(404);
        expect((await request(app).post('/api/listings').set('Authorization', 'Bearer ' + token(seller)).send(listingBody(photo.id))).status).not.toBe(201);
        expect((await del(photo.id)).status).toBe(404);
        const removed = await request(app).delete(`/api/native-wishes/items/${first.body.resource.id}`).set('Authorization', 'Bearer ' + token(seller));
        expect(removed.status).toBe(200);
        expect((await image(photo.id)).status).toBe(404);
        expect(await prisma.mediaErasureTask.findUnique({ where: { mediaId: photo.id } })).not.toBeNull();
        await drainMediaErasureTasks();
        await expect(fs.stat(path.join(root, photo.id))).rejects.toThrow();
    });
    it('refuses to attach another user’s unbound photo', async () => {
        const photo = (await upload(third)).body;
        const list = await request(app).post('/api/native-wishes/lists').set('Authorization', 'Bearer ' + token(seller))
            .send({ clientRequestId: randomUUID(), title: '合成清單' });
        const result = await request(app).post(`/api/native-wishes/lists/${list.body.resource.id}/items`)
            .set('Authorization', 'Bearer ' + token(seller)).send({ clientRequestId: randomUUID(), name: '不應建立', mediaId: photo.id });
        expect(result.status).toBe(409);
        expect(await prisma.item.count({ where: { wishlistId: list.body.resource.id } })).toBe(0);
        expect((await image(photo.id)).status).toBe(404);
    });
    it('shows published photos publicly and stops public reads immediately on removal/expiry', async () => {
        const photo = (await upload()).body;
        const listing = await request(app).post('/api/listings').set('Authorization', 'Bearer ' + token(seller)).send(listingBody(photo.id)); expect(listing.status).toBe(201);
        expect((await image(photo.id)).status).toBe(200);
        await prisma.listing.update({ where: { id: listing.body.id }, data: { publishedAt: new Date('2020-01-01'), expiresAt: new Date('2020-02-01') } });
        expect((await image(photo.id)).status).toBe(404); expect((await image(photo.id, 'image', seller)).status).toBe(200);
        await prisma.listing.update({ where: { id: listing.body.id }, data: { status: 'REMOVED' } }); expect((await image(photo.id)).status).toBe(404);
    });
    it('returns the same photo after an upload retry and rejects key reuse with different pixels', async () => {
        const key = randomUUID(); const first = await upload(seller, key); const retry = await upload(seller, key);
        expect(first.status).toBe(201); expect(retry.status).toBe(200); expect(retry.body.id).toBe(first.body.id);
        const other = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#111111' } }).jpeg().toBuffer();
        expect((await upload(seller, key, other)).status).toBe(409);
        expect(await prisma.listingMedia.count({ where: { ownerUserId: seller } })).toBe(1);
    });
    it('recovers uncertain upload results only for the owner through the client upload key', async () => {
        const key = randomUUID(); const photo = (await upload(seller, key)).body;
        const lookup = (user?: number, value = key) => {
            const r = request(app).get('/api/listing-media/by-upload-id/' + value); return user ? r.set('Authorization', 'Bearer ' + token(user)) : r;
        };
        expect((await lookup()).status).toBe(401); expect((await lookup(third)).status).toBe(404);
        expect((await lookup(seller)).body.id).toBe(photo.id); expect((await lookup(seller, randomUUID())).status).toBe(404);
    });
    it('rejects unsupported, forged and oversized files and malformed multipart IDs', async () => {
        expect((await upload(seller, randomUUID(), Buffer.from('<svg/>'), 'image/svg+xml')).status).toBe(400);
        expect((await upload(seller, randomUUID(), Buffer.from('not jpeg'))).status).toBe(400);
        expect((await upload(seller, 'invalid')).status).toBe(400);
        expect((await upload(seller, randomUUID(), Buffer.alloc(5 * 1024 * 1024 + 1))).status).toBe(413);
        const extra = await request(app).post('/api/listing-media').set('Authorization', 'Bearer ' + token(seller)).field('clientUploadId', randomUUID()).field('ownerUserId', third.toString()).attach('image', jpeg, 'photo.jpg');
        expect(extra.status).toBe(400); expect(await prisma.listingMedia.count({ where: { ownerUserId: seller } })).toBe(0);
    });
    it('only deletes the owner’s unbound photo and keeps another user’s data intact', async () => {
        const photo = (await upload()).body;
        expect((await del(photo.id, third)).status).toBe(404); expect((await image(photo.id, 'image', seller)).status).toBe(200);
        expect((await del(photo.id)).status).toBe(204); expect((await image(photo.id, 'image', seller)).status).toBe(404);
        await expect(fs.stat(path.join(root, photo.id))).rejects.toThrow();
    });
    it('refuses deleting a photo attached to a listing even if its owner requests it', async () => {
        const photo = (await upload()).body;
        const draft = await request(app).post('/api/listings').set('Authorization', 'Bearer ' + token(seller)).send(listingBody(photo.id, false)); expect(draft.status).toBe(201);
        expect((await del(photo.id)).status).toBe(404); expect((await image(photo.id, 'image', seller)).status).toBe(200);
    });
    it('returns generic404 for missing/invalid variants, missing files and traversal attempts', async () => {
        expect((await image(randomUUID())).status).toBe(404); expect((await image('invalid')).status).toBe(404);
        const photo = (await upload()).body; expect((await image(photo.id, 'original', seller)).status).toBe(404);
        await fs.unlink(path.join(root, photo.id, 'image.webp')); expect((await image(photo.id, 'image', seller)).status).toBe(404);
    });
    it('disables production uploads without durable storage instead of losing files on deployment', async () => {
        const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH; delete process.env.RAILWAY_VOLUME_MOUNT_PATH; process.env.NODE_ENV = 'production';
        try { const r = await upload(); expect(r.status).toBe(503); expect(r.body.errorCode).toBe('PHOTO_STORAGE_UNAVAILABLE'); }
        finally { process.env.NODE_ENV = 'test'; if (mount !== undefined) process.env.RAILWAY_VOLUME_MOUNT_PATH = mount; }
        expect(await prisma.listingMedia.count({ where: { ownerUserId: seller } })).toBe(0);
    });
});
