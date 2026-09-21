/** Real HTTP + production auth middleware + isolated PostgreSQL. Not a mock DB. */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import prisma from '../../lib/prisma';
import listingRoutes from '../../routes/listingRoutes';

const db = process.env.TEST_DATABASE_URL;
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(db);
if (!db || process.env.DATABASE_URL !== db) throw new Error('Explicit identical TEST_DATABASE_URL / DATABASE_URL required');
const url = new URL(db);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/^\/wishlist_marketplace_test_[a-z0-9_]+$/.test(url.pathname)) {
    throw new Error('Integration tests refuse non-local or non-test databases');
}
const secret = 'integration-only-not-a-production-secret';
process.env.JWT_SECRET = secret;
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/listings', listingRoutes);
// Own one real listener for the suite. Passing the Express function creates
// and closes a transient listener per request, including every concurrent pair.
const server = createServer(app);
let seller: number, buyer: number, third: number;
let seq = 1;
const token = (id: number) => jwt.sign({ id }, secret, { expiresIn: '1h', algorithm: 'HS256' });
const post = (path: string, id = seller) => request(server).post('/api/listings' + path).set('Authorization', 'Bearer ' + token(id)).set('X-Forwarded-For', '192.0.2.' + (seq++ % 250 + 1));
const get = (path = '', id?: number) => {
    const r = request(server).get('/api/listings' + path);
    return id === undefined ? r : r.set('Authorization', 'Bearer ' + token(id));
};
async function media(ownerUserId = seller) {
    const id = randomUUID();
    // Synthetic database fixture only. Real image upload and EXIF stripping
    // remain separate acceptance gates; this does not claim a real photo flow.
    await prisma.listingMedia.create({ data: { id, ownerUserId, imageUrl: '/fixture/' + id + '.webp', thumbnailUrl: '/fixture/' + id + '-thumb.webp', contentHash: 'synthetic-test-only' } });
    return id;
}
async function body(overrides: Record<string, unknown> = {}) {
    return { clientListingId: randomUUID(), title: 'Switch OLED', description: '盒裝完整功能正常', category: 'electronics', brand: 'Nintendo', condition: 'USED', price: 7500,
        deliveryMethods: ['MEETUP', 'SHIPPING'], location: { county: '台北市', district: '中山區', latitude: 25.052349, longitude: 121.523456 }, mediaIds: [await media()], publish: true, consentToMap: true, ...overrides };
}
async function create(overrides: Record<string, unknown> = {}) {
    const payload = await body(overrides);
    const r = await post('').send(payload);
    expect(r.status).toBe(201);
    return r.body;
}

beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    const run = randomUUID();
    const ids = await Promise.all(['seller', 'buyer', 'third'].map(role => prisma.user.create({ data: { phoneNumber: `integration-${run}-${role}`, password: 'synthetic-never-used-for-login', name: role,
        email: `${run}-${role}@example.invalid`, isEmailVerified: role === 'seller' }, select: { id: true } })));
    [seller, buyer, third] = ids.map(x => x.id);
});
beforeEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerUserId: { in: [seller, buyer, third] } } });
    await prisma.listingMedia.deleteMany({ where: { ownerUserId: { in: [seller, buyer, third] } } });
});
afterAll(async () => {
    try {
        if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        if (seller) await prisma.user.deleteMany({ where: { id: { in: [seller, buyer, third] } } });
    } finally { await prisma.$disconnect(); }
});

describe('listing API / PostgreSQL integration', () => {
    it('persists supported map boundary coordinates without a database constraint failure', async () => {
        const listing = await create({ location: { county: '測試邊界', district: '合成位置', latitude: 26.6, longitude: 123.8 } });
        expect(listing.location).toMatchObject({ publicLatitude: 26.59, publicLongitude: 123.79 });
    });
    it('rejects anonymous and forged-JWT writes through the real route middleware', async () => {
        const payload = await body();
        expect((await request(server).post('/api/listings').send(payload)).status).toBe(401);
        expect((await request(server).post('/api/listings').set('Authorization', 'Bearer ' + jwt.sign({ id: seller }, 'different-test-secret')).send(payload)).status).toBe(401);
        expect(await prisma.listing.count()).toBe(0);
    });
    it('requires verification for publication but allows an unverified user to save a draft', async () => {
        const payload = await body({ mediaIds: [await media(buyer)] });
        expect((await post('', buyer).send(payload)).status).toBe(403);
        const draft = await post('', buyer).send({ clientListingId: randomUUID(), title: '未完成草稿', publish: false });
        expect(draft.status).toBe(201);
        expect(draft.body.status).toBe('DRAFT');
        expect(draft.body.expiresAt).toBeNull();
    });
    it('persists the exact default 30-day clock and coarse location without private profile fields', async () => {
        const listing = await create();
        expect(new Date(listing.expiresAt).getTime() - new Date(listing.publishedAt).getTime()).toBe(30 * 86400000);
        expect(listing.expiryMode).toBe('DEFAULT_30_DAYS');
        expect(listing.location).toMatchObject({ publicLatitude: 25.05, publicLongitude: 121.53, precisionMeters: 2200 });
        for (const key of ['password', 'phoneNumber', 'email', 'apiKey', 'address', 'requestHash', 'clientListingId', '25.052349', '121.523456']) expect(JSON.stringify(listing)).not.toContain(key);
        const saved = await prisma.listingLocation.findUniqueOrThrow({ where: { listingId: listing.id } });
        expect(Object.keys(saved)).not.toContain('latitude');
    });
    it('uses a selected Taiwan date instead of silently applying 30 days', async () => {
        const listing = await create({ expiryDate: '2028-02-29' });
        expect(listing.expiresAt).toBe('2028-02-29T15:59:59.999Z');
        expect(listing.expiryMode).toBe('CUSTOM_DATE');
    });
    it('rejects invalid/past custom dates before any row is written', async () => {
        expect((await post('').send(await body({ expiryDate: '2020-01-01' }))).status).toBe(400);
        expect((await post('').send(await body({ expiryDate: null }))).status).toBe(400);
        expect(await prisma.listing.count()).toBe(0);
    });
    it('deduplicates a retry and rejects the same key reused with different data', async () => {
        const payload = await body();
        const first = await post('').send(payload);
        const retry = await post('').send(payload);
        expect(first.status).toBe(201);
        expect(retry.status).toBe(200);
        expect(retry.body.id).toBe(first.body.id);
        expect(retry.body.expiresAt).toBe(first.body.expiresAt);
        expect((await post('').send({ ...payload, price: 7000 })).status).toBe(409);
        expect(await prisma.listing.count()).toBe(1);
    });
    it('deduplicates concurrent creates without partially attaching media', async () => {
        const address = server.address();
        expect(server.listening).toBe(true);
        for (let i = 0; i < 20; i++) {
            const payload = await body();
            const results = await Promise.all([post('').send(payload), post('').send(payload)]);
            expect(results.map(x => x.status).sort()).toEqual([200, 201]);
            expect(results[0].body.id).toBe(results[1].body.id);
            expect(await prisma.listing.count()).toBe(i + 1);
            expect(await prisma.listingMedia.count({ where: { listingId: results[0].body.id } })).toBe(1);
            expect(server.listening).toBe(true); expect(server.address()).toEqual(address);
        }
    });
    it('allows only one of two different listings competing for the same photo to commit', async () => {
        const payload = await body();
        const results = await Promise.all([post('').send(payload), post('').send({ ...payload, clientListingId: randomUUID() })]);
        expect(results.filter(r => r.status === 201)).toHaveLength(1);
        expect(results.filter(r => r.status === 403 || r.status === 409)).toHaveLength(1);
        const winner = results.find(r => r.status === 201)!;
        expect(await prisma.listing.count()).toBe(1);
        expect(await prisma.listingMedia.count({ where: { listingId: winner.body.id } })).toBe(1);
    });
    it('rejects another user’s media, missing media and previously bound media atomically', async () => {
        expect((await post('').send(await body({ mediaIds: [await media(third)] }))).status).toBe(403);
        expect((await post('').send(await body({ mediaIds: [randomUUID()] }))).status).toBe(403);
        const first = await create();
        expect((await post('').send(await body({ mediaIds: [first.media[0].id] }))).status).toBe(403);
        expect(await prisma.listing.count()).toBe(1);
    });
    it('rejects ownership overposting, missing map consent and prohibited merchandise', async () => {
        expect((await post('').send(await body({ ownerUserId: third }))).status).toBe(400);
        expect((await post('').send(await body({ consentToMap: false }))).status).toBe(400);
        expect((await post('').send(await body({ title: '出售毒品' }))).status).toBe(400);
        expect(await prisma.listing.count()).toBe(0);
    });
    it.each([
        { field: 'title', value: '槍\u200b枝' },
        { field: 'description', value: '個 人 資 料 販 售' },
        { field: 'brand', value: 'ｆｉｒｅａｒｍ' },
    ])('rejects obfuscated restricted $field without binding photos or writing a listing', async ({ field, value }) => {
        const payload = await body({ [field]: value });
        const response = await post('').send(payload);
        expect(response.status).toBe(400); expect(response.body.field).toBe(field);
        expect(await prisma.listing.count({ where: { ownerUserId: seller } })).toBe(0);
        expect((await prisma.listingMedia.findUniqueOrThrow({ where: { id: payload.mediaIds[0] } })).listingId).toBeNull();
    });
    it('rejects restricted branding on edit without changing version, expiry or original product data', async () => {
        const listing = await create();
        const response = await request(server).patch('/api/listings/' + listing.id).set('Authorization', 'Bearer ' + token(seller))
            .send({ expectedVersion: 1, brand: '槍\u200b械' });
        expect(response.status).toBe(400); expect(response.body.field).toBe('brand');
        const saved = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
        expect(saved.brand).toBe('Nintendo'); expect(saved.version).toBe(1); expect(saved.expiresAt?.toISOString()).toBe(listing.expiresAt);
    });
    it('rechecks persisted restricted branding at publication instead of trusting a prior draft', async () => {
        const draft = await create({ publish: false, consentToMap: false });
        // Simulate a legacy unreviewed draft through exact fixture ID only.
        await prisma.listing.update({ where: { id: draft.id }, data: { brand: '槍\u200b械' } });
        const response = await post('/' + draft.id + '/publish').send({ expectedVersion: 1, consentToMap: true });
        expect(response.status).toBe(400); expect(response.body.field).toBe('brand');
        const saved = await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } });
        expect(saved.status).toBe('DRAFT'); expect(saved.publishedAt).toBeNull(); expect(saved.expiresAt).toBeNull(); expect(saved.version).toBe(1);
    });
    it('hides drafts from anonymous and other users, but allows their owner to read them', async () => {
        const draft = (await post('').send({ clientListingId: randomUUID(), title: '私人草稿', publish: false })).body;
        expect((await get('/' + draft.id)).status).toBe(404);
        expect((await get('/' + draft.id, third)).status).toBe(404);
        expect((await get('/' + draft.id, seller)).status).toBe(200);
        expect((await get()).body.items).toEqual([]);
        expect((await get('/mine', seller)).body.items.map((x: { id: string }) => x.id)).toEqual([draft.id]);
        expect((await get('/mine', buyer)).body.items).toEqual([]);
    });
    it('applies keyword, brand, category, price, condition, delivery and viewport filters in PostgreSQL', async () => {
        const wanted = await create();
        await create({ title: '木製書桌', brand: '無品牌', category: 'home', price: 1000, condition: 'NEW', deliveryMethods: ['SHIPPING'], location: { county: '高雄市', district: '三民區', latitude: 22.65, longitude: 120.3 } });
        const result = await get().query({ q: 'switch', brand: 'nintendo', category: 'electronics', condition: 'USED', minPrice: '7000', maxPrice: '8000', delivery: 'MEETUP', bbox: '121,24,122,26' });
        expect(result.status).toBe(200);
        expect(result.body.items.map((x: { id: string }) => x.id)).toEqual([wanted.id]);
        expect((await get().query({ maxPrice: '1' })).body.items).toEqual([]);
        expect((await get().query({ limit: '100000' })).status).toBe(400);
    });
    it('returns stable cursor pages without duplicates', async () => {
        const ids = await Promise.all([create(), create(), create()]);
        const page1 = (await get().query({ limit: '2' })).body;
        const page2 = (await get().query({ limit: '2', cursor: page1.nextCursor })).body;
        expect(page1.items.length).toBe(2);
        expect(page2.items.length).toBe(1);
        expect(page2.nextCursor).toBeNull();
        expect(new Set([...page1.items, ...page2.items].map(x => x.id))).toEqual(new Set(ids.map(x => x.id)));
    });
    it('excludes expired, sold and removed rows even before a background expiry job runs', async () => {
        const expired = await create(); const sold = await create(); const removed = await create();
        await prisma.listing.update({ where: { id: expired.id }, data: { publishedAt: new Date('2020-01-01'), expiresAt: new Date('2020-02-01') } });
        expect((await post('/' + sold.id + '/status').send({ action: 'sold', expectedVersion: 1 })).status).toBe(200);
        expect((await post('/' + removed.id + '/status').send({ action: 'remove', expectedVersion: 1 })).status).toBe(200);
        expect((await get()).body.items).toEqual([]);
        expect((await get('/' + expired.id)).status).toBe(404);
        expect((await get('/' + sold.id)).status).toBe(404);
    });
    it('only permits the owner to mutate status, checks versions and does not reset expiry', async () => {
        const listing = await create();
        expect((await post('/' + listing.id + '/status', third).send({ action: 'sold', expectedVersion: 1 })).status).toBe(404);
        const reserved = await post('/' + listing.id + '/status').send({ action: 'reserve', expectedVersion: 1 });
        expect(reserved.status).toBe(200);
        expect(reserved.body.version).toBe(2);
        expect(reserved.body.expiresAt).toBe(listing.expiresAt);
        expect((await post('/' + listing.id + '/status').send({ action: 'sold', expectedVersion: 1 })).status).toBe(409);
        expect((await post('/' + listing.id + '/status').send({ action: 'constructor', expectedVersion: 2 })).status).toBe(400);
    });
    it('requires an explicit, later date for extension and enforces owner/version checks', async () => {
        const listing = await create({ expiryDate: '2027-01-01' });
        const path = '/' + listing.id + '/extend';
        expect((await post(path, third).send({ expectedVersion: 1, expiryDate: '2028-01-01' })).status).toBe(404);
        expect((await post(path).send({ expectedVersion: 1 })).status).toBe(400);
        expect((await post(path).send({ expectedVersion: 1, expiryDate: '2026-12-31' })).status).toBe(400);
        const result = await post(path).send({ expectedVersion: 1, expiryDate: '2028-01-01' });
        expect(result.status).toBe(200);
        expect(result.body.expiresAt).toBe('2028-01-01T15:59:59.999Z');
        expect(result.body.publishedAt).toBe(listing.publishedAt);
        expect(result.body.version).toBe(2);
        expect((await post(path).send({ expectedVersion: 1, expiryDate: '2029-01-01' })).status).toBe(409);
    });
    it('database constraints reject invalid public publication rows even outside the parser', async () => {
        const listing = await create();
        await expect(prisma.listing.update({ where: { id: listing.id }, data: { price: -1 } })).rejects.toThrow();
        await expect(prisma.listing.update({ where: { id: listing.id }, data: { expiresAt: null } })).rejects.toThrow();
        await expect(prisma.listingLocation.update({ where: { listingId: listing.id }, data: { precisionMeters: 1 } })).rejects.toThrow();
        expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).price?.toString()).toBe('7500');
    });
    it('edits normal fields without resetting either custom or default expiry', async () => {
        for (const custom of [undefined, '2028-01-01']) {
            const listing = await create(custom ? { expiryDate: custom } : {});
            const r = await request(server).patch('/api/listings/' + listing.id).set('Authorization', 'Bearer ' + token(seller)).send({ expectedVersion: 1, title: 'Switch OLED 黑色', price: 7200 });
            expect(r.status).toBe(200);
            expect(r.body.title).toBe('Switch OLED 黑色');
            expect(r.body.expiresAt).toBe(listing.expiresAt);
            expect(r.body.publishedAt).toBe(listing.publishedAt);
            expect(r.body.expiryMode).toBe(listing.expiryMode);
            expect(r.body.version).toBe(2);
            const bad = await request(server).patch('/api/listings/' + listing.id).set('Authorization', 'Bearer ' + token(seller)).send({ expectedVersion: 2, expiryDate: '2029-01-01' });
            expect(bad.status).toBe(400);
        }
    });
    it('prevents foreign-owner edits and rolls back an invalid image replacement', async () => {
        const listing = await create();
        const patch = (id: number, data: Record<string, unknown>) => request(server).patch('/api/listings/' + listing.id).set('Authorization', 'Bearer ' + token(id)).send(data);
        expect((await patch(third, { expectedVersion: 1, title: '越權' })).status).toBe(404);
        expect((await patch(seller, { expectedVersion: 1, title: '不應寫入', mediaIds: [await media(third)] })).status).toBe(403);
        const saved = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
        expect(saved.title).toBe(listing.title);
        expect(saved.version).toBe(1);
    });
    it('starts the default clock on draft publication, not on draft creation/editing', async () => {
        const draft = await create({ publish: false, consentToMap: false });
        expect(draft.expiresAt).toBeNull();
        await prisma.listing.update({ where: { id: draft.id }, data: { createdAt: new Date('2020-01-01') } });
        expect((await post('/' + draft.id + '/publish').send({ expectedVersion: 1, consentToMap: false })).status).toBe(400);
        const result = await post('/' + draft.id + '/publish').send({ expectedVersion: 1, consentToMap: true });
        expect(result.status).toBe(200);
        expect(new Date(result.body.publishedAt).getTime()).toBeGreaterThan(Date.now() - 3000);
        expect(new Date(result.body.expiresAt).getTime() - new Date(result.body.publishedAt).getTime()).toBe(30 * 86400000);
        expect(result.body.version).toBe(2);
        expect((await post('/' + draft.id + '/publish').send({ expectedVersion: 1, consentToMap: true })).status).toBe(409);
    });
    it('lets a draft be completed and honours its explicitly selected expiry on publication', async () => {
        const draft = (await post('').send({ clientListingId: randomUUID(), title: '待整理', publish: false, expiryDate: '2028-01-01' })).body;
        const complete = await body();
        const { clientListingId, publish, consentToMap, ...fields } = complete;
        const edited = await request(server).patch('/api/listings/' + draft.id).set('Authorization', 'Bearer ' + token(seller)).send({ ...fields, expectedVersion: 1 });
        expect(edited.status).toBe(200);
        expect(edited.body.status).toBe('DRAFT');
        expect(edited.body.expiresAt).toBe('2028-01-01T15:59:59.999Z');
        const published = await post('/' + draft.id + '/publish').send({ expectedVersion: 2, consentToMap: true });
        expect(published.status).toBe(200);
        expect(published.body.expiresAt).toBe('2028-01-01T15:59:59.999Z');
        expect(published.body.expiryMode).toBe('CUSTOM_DATE');
    });
});
