import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import listingRoutes from '../../routes/listingRoutes';
import { getApiUrl } from '../../config/constants';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'wish-match-integration-only-not-production'; process.env.JWT_SECRET = secret;
const app = express(); app.use(express.json()); app.use('/api/listings', listingRoutes);
let buyer: number, seller: number, third: number, wishlistId: number, wishId: number;
const call = (path: string, userId = buyer) => request(app).get('/api/listings' + path).set('Authorization', 'Bearer ' + jwt.sign({ id: userId }, secret, { algorithm: 'HS256' }));
const match = (query: Record<string, string> = {}, userId = buyer) => call('/matches', userId).query({ wishItemId: String(wishId), ...query });
async function seed(title = 'Sony 相機 A7', overrides: Record<string, unknown> = {}, location = { county: '臺北市', district: '中正區', publicLatitude: 25.05, publicLongitude: 121.51, precisionMeters: 2200 }) {
    const mediaId = randomUUID(); const row = await prisma.listing.create({ data: { ownerUserId: seller, clientListingId: randomUUID(), requestHash: 'synthetic-only', title, description: '合成測試實拍相機', brand: 'Sony', category: 'electronics', price: 4000, currency: 'TWD', status: 'ACTIVE', publishedAt: new Date(), lastVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000), deliveryMethods: ['MEETUP'], ...overrides, location: { create: location }, media: { create: { id: mediaId, ownerUserId: seller, imageUrl: getApiUrl() + '/listing-media/' + mediaId + '/image', thumbnailUrl: getApiUrl() + '/listing-media/' + mediaId + '/thumbnail', contentHash: 'synthetic-no-file' } } } }); return row.id;
}
beforeAll(async () => { const run = randomUUID(); const users = await Promise.all(['buyer', 'seller', 'third'].map(role => prisma.user.create({ data: { phoneNumber: `wish-match-${run}-${role}`, password: 'synthetic-only', name: role }, select: { id: true } }))); [buyer, seller, third] = users.map(u => u.id); });
beforeEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerUserId: { in: [seller, buyer] } } }); await prisma.wishlist.deleteMany({ where: { userId: { in: [buyer, third] } } });
    const wishlist = await prisma.wishlist.create({ data: { userId: buyer, title: '合成私密願望清單', isPublic: false, items: { create: { name: 'Sony 相機', maxPrice: 5000, priceCurrency: 'TWD', price: '1' } } }, include: { items: true } }); wishlistId = wishlist.id; wishId = wishlist.items[0].id;
});
afterAll(async () => { if (buyer) { await prisma.listingMedia.deleteMany({ where: { ownerUserId: seller } }); await prisma.user.deleteMany({ where: { id: { in: [buyer, seller, third] } } }); } await prisma.$disconnect(); });
describe('private explainable matching / PostgreSQL', () => {
    it('requires JWT and authentic ownership, even when the wishlist is public', async () => {
        expect((await request(app).get('/api/listings/matches').query({ wishItemId: String(wishId) })).status).toBe(401); expect((await match({}, third)).status).toBe(404);
        await prisma.wishlist.update({ where: { id: wishlistId }, data: { isPublic: true } }); expect((await match({}, third)).status).toBe(404); expect((await call('/match-wishes', third)).body.items).toEqual([]);
    });
    it('returns matching public listings with reasons, budget, no private contacts or meetup data', async () => {
        const id = await seed(); const r = await match(); expect(r.status).toBe(200); expect(r.body.items).toHaveLength(1); expect(r.body.items[0]).toMatchObject({ listing: { id }, budget: 'WITHIN', wishItemId: wishId }); expect(r.body.items[0].reasons.map((v: { code: string }) => v.code)).toContain('NAME');
        for (const value of ['phoneNumber', 'password', 'apiKey', 'clientListingId', 'requestHash', 'meetup']) expect(r.body.items[0].listing).not.toHaveProperty(value); expect(r.headers['cache-control']).toBe('private, no-store');
    });
    it('excludes unrelated, expensive, expired, sold, removed and own listings', async () => {
        const keep = await seed(); await seed('Canon 相機', { price: 6000 }); await seed('二手電冰箱'); await seed('Sony 相機', { status: 'SOLD' }); await seed('Sony 相機', { status: 'REMOVED' }); await seed('Sony 相機', { publishedAt: new Date('2020-01-01'), expiresAt: new Date('2020-02-01') }); await seed('Sony 相機', { ownerUserId: buyer }); expect((await match()).body.items.map((v: { listing: { id: string } }) => v.listing.id)).toEqual([keep]);
    });
    it('shows the owner a clearly opt-in private preview without making own goods a default buyer result', async () => {
        const own = await seed('三國演義漫畫', { ownerUserId: buyer, brand: null, category: 'books' });
        await prisma.item.update({ where: { id: wishId }, data: { name: '三國演義漫畫', maxPrice: null } });
        expect((await match()).body.items).toEqual([]);
        const preview = await match({ includeOwnPreview: '1' });
        expect(preview.status).toBe(200);
        expect(preview.body.items.map((v: { listing: { id: string } }) => v.listing.id)).toEqual([own]);
        expect(preview.body.notice).toContain('自己刊登');
        expect((await match({ includeOwnPreview: '1' }, third)).status).toBe(404);
    });
    it('matches fullwidth names using actual PostgreSQL NFKC, not only JS mocks', async () => { await seed('Ｓｏｎｙ 相機 A7'); const r = await match(); expect(r.status).toBe(200); expect(r.body.items).toHaveLength(1); });
    it('matches a published item with an unknown brand without bypassing explicit brand filters', async () => {
        const id = await seed('Sony 相機 A7', { brand: null });
        const result = await match();
        expect(result.status).toBe(200);
        expect(result.body.items).toHaveLength(1);
        expect(result.body.items[0].listing).toMatchObject({ id, brand: null });
        expect((await match({ brand: 'Sony' })).body.items).toEqual([]);
    });
    it('does not use legacy estimated price as a budget or pretend foreign currency is within budget', async () => {
        await seed(); await prisma.item.update({ where: { id: wishId }, data: { maxPrice: null } }); expect((await match()).body.items[0].budget).toBe('UNSPECIFIED'); await prisma.item.update({ where: { id: wishId }, data: { maxPrice: 1, priceCurrency: 'USD' } }); expect((await match()).body.items[0].budget).toBe('CURRENCY_UNKNOWN');
    });
    it('enforces condition, delivery, brand, category and viewport equally in SQL and scoring', async () => {
        const rejected: Record<string, string>[] = [{ condition: 'NEW' }, { delivery: 'SHIPPING' }, { brand: 'Canon' }, { category: 'books' }, { bbox: '120,22,121,23' }];
        await seed(); for (const query of rejected) expect((await match(query)).body.items).toEqual([]);
        expect((await match({ condition: 'USED', brand: 'Sony', category: 'electronics', delivery: 'MEETUP', bbox: '121,25,122,26' })).body.items).toHaveLength(1);
    });
    it('enforces approximate distance, refuses precise GPS and does not return out-of-radius candidates', async () => {
        const near = await seed(); await seed('Sony 相機南部', {}, { county: '高雄市', district: '前金區', publicLatitude: 22.63, publicLongitude: 120.31, precisionMeters: 2200 });
        const r = await match({ center: '25.05,121.51', radiusKm: '10' }); expect(r.status).toBe(200); expect(r.body.items.map((v: { listing: { id: string } }) => v.listing.id)).toEqual([near]); expect(r.body.items[0].distanceKm).toBe(0); expect((await match({ center: '25.04735,121.51731', radiusKm: '10' })).status).toBe(400);
    });
    it('searches matching candidates before pagination, including older than hundreds of unrelated rows', async () => {
        const old = await seed('Sony 相機較早', { createdAt: new Date('2020-01-01') });
        const bulk = Array.from({ length: 600 }, () => ({ id: randomUUID(), ownerUserId: seller, clientListingId: randomUUID(), requestHash: 'synthetic-only', title: '毫不相關的冰箱', description: '合成完整刊登', brand: 'Panasonic', category: 'home', price: 2000, currency: 'TWD', deliveryMethods: ['MEETUP' as const], status: 'ACTIVE' as const, publishedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) }));
        await prisma.listing.createMany({ data: bulk });
        await prisma.listingLocation.createMany({ data: bulk.map(row => ({ listingId: row.id, county: '臺北市', district: '中正區', publicLatitude: 25.05, publicLongitude: 121.51, precisionMeters: 2200 })) });
        await prisma.listingMedia.createMany({ data: bulk.map(row => { const id = randomUUID(); return { id, listingId: row.id, ownerUserId: seller, imageUrl: getApiUrl() + '/listing-media/' + id + '/image', thumbnailUrl: getApiUrl() + '/listing-media/' + id + '/thumbnail', contentHash: 'synthetic-no-physical-photo' }; }) });
        expect((await match({ limit: '1' })).body.items[0].listing.id).toBe(old);
    });
    it('paginates recent matching candidates without duplicate IDs or leaking a private cursor anchor', async () => {
        const ids = await Promise.all(['Sony 相機A', 'Sony 相機B', 'Sony 相機C'].map(title => seed(title))); const found: string[] = []; let cursor: string | undefined;
        for (let n = 0; n < 3; n++) { const r = await match({ limit: '1', ...(cursor ? { cursor } : {}) }); expect(r.status).toBe(200); found.push(r.body.items[0].listing.id); cursor = r.body.nextCursor; } expect(new Set(found)).toEqual(new Set(ids)); expect(cursor).toBeNull();
        const privateId = await seed('Sony 相機草稿', { status: 'DRAFT' }); expect((await match({ cursor: privateId })).status).toBe(404);
    });
    it('offers only eligible own wishes with bounded private paging and rejects outsider anchors', async () => {
        await prisma.item.createMany({ data: [{ name: 'hidden', wishlistId, isHidden: true }, { name: 'purchased', wishlistId, isPurchased: true }, { name: 'another', wishlistId }] });
        const first = await call('/match-wishes').query({ limit: '1' }); expect(first.status).toBe(200); const second = await call('/match-wishes').query({ limit: '1', cursor: String(first.body.nextCursor) }); expect(second.status).toBe(200); expect(new Set([...first.body.items, ...second.body.items].map((v: { name: string }) => v.name))).toEqual(new Set(['Sony 相機', 'another'])); expect((await call('/match-wishes', third).query({ cursor: String(wishId) })).status).toBe(404);
        expect((await call('/match-wishes').query({ limit: '101' })).status).toBe(400); expect((await match({ ownerUserId: String(third) })).status).toBe(400);
    });
    it('fails closed for hidden/completed wishes and returns an honest empty result for insufficient names', async () => {
        await seed(); for (const flags of [{ isHidden: true, isPurchased: false }, { isHidden: false, isPurchased: true }]) { await prisma.item.update({ where: { id: wishId }, data: flags }); expect((await match()).status).toBe(404); }
        await prisma.item.update({ where: { id: wishId }, data: { isHidden: false, isPurchased: false, name: 'x' } }); const r = await match(); expect(r.status).toBe(200); expect(r.body.items).toEqual([]); expect(r.body.notice).toContain('不足');
    });
    it('keeps query values literal, with no SQL injection or unsupported price matches', async () => {
        const id = await seed(); expect((await match({ q: "' OR '1'='1" })).body.items).toEqual([]); expect((await match({ brand: "Sony' OR '1'='1" })).body.items).toEqual([]); expect((await match({ maxPrice: '3000' })).body.items).toEqual([]); expect((await match({ minPrice: '4500' })).body.items).toEqual([]); expect((await match({ q: '合成測試' })).body.items[0].listing.id).toBe(id);
    });
    it('does not recommend a same-brand fridge or a mismatched explicit model, and handles near-term UTC expiry', async () => {
        await seed('Sony 冰箱'); await seed('Canon 相機', { brand: 'Canon' }); const keep = await seed('Sony 相機 A7', { expiresAt: new Date(Date.now() + 15 * 60000) });
        // A same-brand title is insufficient when a wish names the model.
        await prisma.item.update({ where: { id: wishId }, data: { name: 'Sony相機A7' } }); expect((await match()).body.items.map((v: { listing: { id: string } }) => v.listing.id)).toEqual([keep]);
    });
});
