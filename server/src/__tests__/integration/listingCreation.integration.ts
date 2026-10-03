/** Real HTTP, production auth, and isolated PostgreSQL; no external services. */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import prisma from '../../lib/prisma';
import routes from '../../routes/listingRoutes';
import { authenticateToken } from '../../middleware/auth';
import { createListing, getListingCreation, abandonListingCreation } from '../../controllers/listingController';
import { parseListingCreate } from '../../lib/listingRules';

require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Equal isolated DB URLs required');
const secret = 'listing-creation-isolated-integration-only'; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/listings', routes);
let admitted: (() => void) | undefined, release: Promise<void>;
for (const [path, handler] of [['create', createListing], ['read', getListingCreation], ['abandon', abandonListingCreation]] as const)
    app[path === 'read' ? 'get' : 'post']('/paused/' + path + '/:clientListingId', authenticateToken,
        async (_req, _res, next) => { admitted?.(); await release; next(); }, handler);
const server = createServer(app);
let owners: number[] = [], sequence = 1;
const token = (id: number) => jwt.sign({ id, authVersion: 0 }, secret, { algorithm: 'HS256', expiresIn: '1h' });
const http = (method: 'get' | 'post', path: string, id = owners[0]) => request(server)[method](path)
    .set('Authorization', 'Bearer ' + token(id)).set('X-Forwarded-For', '192.0.2.' + (sequence++ % 250 + 1));
const create = (body: object, id = owners[0]) => http('post', '/api/listings', id).send(body);
const read = (id: string, user = owners[0]) => http('get', '/api/listings/creation-receipts/' + id, user);
const abandon = (id: string, hash: string, user = owners[0]) => http('post', '/api/listings/creation-receipts/' + id + '/abandon', user).send({ requestHash: hash });
async function payload() {
    const media = await prisma.listingMedia.create({ data: { ownerUserId: owners[0], imageUrl: '/synthetic-original.webp', thumbnailUrl: '/synthetic-thumb.webp', contentHash: 'synthetic-no-image-provider' } });
    return { clientListingId: randomUUID(), title: '合成桌上檯燈', description: '合成流程資料，非真實商品或模型結果。', category: 'home', condition: 'USED', price: 350, currency: 'TWD', mediaIds: [media.id], deliveryMethods: ['MEETUP'],
        location: { county: '臺北市', district: '中山區', latitude: 25.05, longitude: 121.53 }, publish: true, consentToMap: true };
}
const hash = (body: unknown) => parseListingCreate(body, new Date(0)).requestHash;
beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const run = randomUUID();
    owners = (await Promise.all(['owner', 'other'].map(role => prisma.user.create({ data: { phoneNumber: `receipt-${run}-${role}`, password: 'synthetic-not-used', name: role, isEmailVerified: true }, select: { id: true } })))).map(x => x.id);
});
beforeEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerUserId: { in: owners } } });
    await prisma.listingCreateReceipt.deleteMany({ where: { userId: { in: owners } } });
    await prisma.listingMedia.deleteMany({ where: { ownerUserId: { in: owners } } });
    await prisma.user.updateMany({ where: { id: { in: owners } }, data: { authVersion: 0, isEmailVerified: true } });
});
afterAll(async () => {
    try { if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
        if (owners.length) await prisma.user.deleteMany({ where: { id: { in: owners } } });
    } finally { await prisma.$disconnect(); }
});
describe('durable owner-scoped listing creation receipts', () => {
    it('saves a name-only unverified-owner draft without photos, expiry, map exposure or a second row on replay', async () => {
        await prisma.user.update({where:{id:owners[0]},data:{isEmailVerified:false,isPhoneVerified:false}});
        const body={clientListingId:randomUUID(),title:'合成名稱草稿',condition:'USED',category:'other',currency:'TWD',publish:false,consentToMap:false,mediaIds:[],deliveryMethods:[],negotiable:false};
        const first=await create(body);expect(first.status).toBe(201);
        expect(first.body).toMatchObject({status:'DRAFT',description:null,price:null,media:[],location:null,publishedAt:null,expiresAt:null,lastVerifiedAt:null,expiryMode:'DEFAULT_30_DAYS'});
        expect((await read(body.clientListingId)).body.receipt).toMatchObject({state:'CREATED',requestHash:hash(body),listingId:first.body.id});
        expect((await create(body)).body.id).toBe(first.body.id);
        expect(await prisma.listing.count({where:{ownerUserId:owners[0]}})).toBe(1);
        expect((await http('get','/api/listings/mine')).body.items).toHaveLength(1);
        expect((await request(server).get('/api/listings/'+first.body.id)).status).toBe(404);
        expect((await http('get','/api/listings/'+first.body.id,owners[1])).status).toBe(404);
        expect((await request(server).get('/api/listings')).body.items).toEqual([]);
    });
    it('round-trips optional draft fields and owned manual photos without starting publication', async () => {
        const media=await prisma.listingMedia.create({data:{ownerUserId:owners[0],capturePurpose:'MANUAL_PHOTO',imageUrl:'/synthetic-manual.webp',thumbnailUrl:'/synthetic-manual-thumb.webp',contentHash:'draft-only-synthetic'}});
        const body={clientListingId:randomUUID(),title:'合成選填草稿',description:'草稿完整欄位驗收。',brand:'合成品牌',condition:'NEW',category:'books',price:0,currency:'TWD',publish:false,consentToMap:false,mediaIds:[media.id],deliveryMethods:['SHIPPING','MEETUP'],negotiable:true,location:{county:'臺北市',district:'中山區',latitude:25.05,longitude:121.53},expiryDate:'2100-01-31'};
        const first=await create(body);expect(first.status).toBe(201);
        expect(first.body).toMatchObject({status:'DRAFT',brand:'合成品牌',price:'0',condition:'NEW',category:'books',deliveryMethods:['SHIPPING','MEETUP'],negotiable:true,expiryMode:'CUSTOM_DATE',expiresAt:'2100-01-31T15:59:59.999Z',publishedAt:null,location:{publicLatitude:25.05,publicLongitude:121.53,precisionMeters:2200}});
        expect(first.body.media).toHaveLength(1);expect(first.body.media[0].capturePurpose).toBe('MANUAL_PHOTO');
        expect((await read(body.clientListingId)).body.receipt.requestHash).toBe(hash(body));
        expect((await prisma.listingMedia.findUniqueOrThrow({where:{id:media.id}})).listingId).toBe(first.body.id);
        expect((await request(server).get('/api/listings')).body.items).toEqual([]);
    });
    it('cannot turn the original private draft operation into a publication or bind another owner photo', async () => {
        const body={clientListingId:randomUUID(),title:'合成保持私人草稿',publish:false};const first=await create(body);
        expect(first.status).toBe(201);expect((await create({...body,publish:true,consentToMap:true})).status).toBe(400);
        const another=await prisma.listingMedia.create({data:{ownerUserId:owners[1],capturePurpose:'MANUAL_PHOTO',imageUrl:'/other.webp',thumbnailUrl:'/other-thumb.webp',contentHash:'other-synthetic'}});
        expect((await create({...body,clientListingId:randomUUID(),mediaIds:[another.id]})).status).toBe(403);
        expect(await prisma.listing.count({where:{ownerUserId:owners[0]}})).toBe(1);
    });
    it('preserves native POST projection and returns an immutable hash-only GET receipt', async () => {
        const body = await payload(), first = await create(body);
        expect(first.status).toBe(201); expect(first.body.status).toBe('ACTIVE');
        expect(first.body.requestHash).toBeUndefined(); expect(first.body.clientListingId).toBeUndefined();
        const row = await read(body.clientListingId);
        expect(row.status).toBe(200); expect(row.headers['cache-control']).toBe('private, no-store');
        expect(row.body.receipt).toEqual({ clientListingId: body.clientListingId, requestHash: hash(body), state: 'CREATED', listingId: first.body.id, createdAt: expect.any(String) });
        expect(row.body.listing).toEqual(first.body);
        expect(JSON.stringify(row.body)).not.toMatch(/password|apiKey|phoneNumber|authVersion|exactLatitude/);
    });
    it('a missing GET is read-only and remains absent after repeated reads', async () => {
        const id = randomUUID();
        expect((await read(id)).status).toBe(404); expect((await read(id)).status).toBe(404);
        expect(await prisma.listingCreateReceipt.count({ where: { userId: owners[0] } })).toBe(0);
        expect(await prisma.listing.count({ where: { ownerUserId: owners[0] } })).toBe(0);
    });
    it('isolates the same client ID across owners and does not expose another owner receipt', async () => {
        const body = await payload(), first = await create(body);
        expect((await read(body.clientListingId, owners[1])).status).toBe(404);
        const second = await create({ clientListingId: body.clientListingId, title: '另一帳號的草稿', publish: false }, owners[1]);
        expect(second.status).toBe(201); expect(second.body.id).not.toBe(first.body.id);
        expect((await read(body.clientListingId)).body.listing.ownerUserId).toBe(owners[0]);
    });
    it('canonicalizes UUID letter case without creating a second operation', async () => {
        const body = await payload(), first = await create({ ...body, clientListingId: body.clientListingId.toUpperCase() });
        expect(first.status).toBe(201);
        const retry = await create(body); expect(retry.status).toBe(200); expect(retry.body.id).toBe(first.body.id);
        expect((await read(body.clientListingId.toUpperCase())).body.receipt.clientListingId).toBe(body.clientListingId);
        expect(await prisma.listingCreateReceipt.count({ where: { userId: owners[0] } })).toBe(1);
    });
    it('rejects changed request data and changed cancellation hash', async () => {
        const body = await payload(); await create(body);
        expect((await create({ ...body, price: 351 })).status).toBe(409);
        expect((await abandon(body.clientListingId, 'f'.repeat(64))).status).toBe(409);
        expect((await read(body.clientListingId)).body.receipt.requestHash).toBe(hash(body));
    });
    it.each(['ACTIVE', 'RESERVED', 'SOLD', 'REMOVED', 'EXPIRED'] as const)('confirms creation independently of later %s state and edits/expiry', async status => {
        const body = await payload(), first = await create(body);
        await prisma.listing.update({ where: { id: first.body.id }, data: { status, title: '後來編輯的名稱', price: 999, publishedAt: new Date(0), expiresAt: new Date(86400000), version: 3 } });
        const row = await read(body.clientListingId);
        expect(row.body.receipt.requestHash).toBe(hash(body)); expect(row.body.receipt.state).toBe('CREATED');
        expect(row.body.listing).toMatchObject({ id: first.body.id, title: '後來編輯的名稱', status, version: 3 });
        const retry = await create(body); expect(retry.status).toBe(200); expect(retry.body.id).toBe(first.body.id);
    });
    it('physical listing deletion retains the receipt and cannot resurrect the original create', async () => {
        const body = await payload(), first = await create(body);
        await prisma.listing.delete({ where: { id: first.body.id } });
        const row = await read(body.clientListingId);
        expect(row.body.receipt).toMatchObject({ state: 'CREATED', listingId: first.body.id, requestHash: hash(body) }); expect(row.body.listing).toBeNull();
        const retry = await create(body); expect(retry.status).toBe(409); expect(retry.body.errorCode).toBe('LISTING_CREATE_ALREADY_REMOVED');
        expect(await prisma.listing.count({ where: { ownerUserId: owners[0] } })).toBe(0);
    });
    it('cancels an uncommitted operation once and rejects a delayed original POST', async () => {
        const body = await payload(), canceled = await abandon(body.clientListingId, hash(body));
        expect(canceled.status).toBe(200); expect(canceled.body).toMatchObject({ receipt: { state: 'ABANDONED', listingId: null }, listing: null });
        expect((await abandon(body.clientListingId, hash(body))).body).toEqual(canceled.body);
        const retry = await create(body); expect(retry.status).toBe(409); expect(retry.body.errorCode).toBe('LISTING_CREATE_ABANDONED');
        expect(await prisma.listing.count({ where: { ownerUserId: owners[0] } })).toBe(0);
        expect((await prisma.listingMedia.findUniqueOrThrow({ where: { id: body.mediaIds[0] } })).listingId).toBeNull();
    });
    it('cancellation after a committed create returns CREATED and does not remove the listing', async () => {
        const body = await payload(), first = await create(body), result = await abandon(body.clientListingId, hash(body));
        expect(result.body.receipt).toMatchObject({ state: 'CREATED', listingId: first.body.id });
        expect(result.body.listing.id).toBe(first.body.id);
    });
    it('serializes racing create and cancellation into exactly one terminal winner', async () => {
        for (let i = 0; i < 5; i++) {
            const body = await payload();
            const [created, canceled] = await Promise.all([create(body), abandon(body.clientListingId, hash(body))]);
            const receipt = (await read(body.clientListingId)).body.receipt;
            expect(canceled.status).toBe(200);
            expect(['CREATED', 'ABANDONED']).toContain(receipt.state);
            expect(created.status).toBe(receipt.state === 'CREATED' ? 201 : 409);
            expect(await prisma.listing.count({ where: { ownerUserId: owners[0], clientListingId: body.clientListingId } })).toBe(receipt.state === 'CREATED' ? 1 : 0);
            expect((await create(body)).status).toBe(receipt.state === 'CREATED' ? 200 : 409);
        }
    });
    it('a rejected media attachment atomically rolls back listing and receipt', async () => {
        const body = await payload();
        const result = await create({ ...body, mediaIds: [randomUUID()] }); expect(result.status).toBe(403);
        expect((await read(body.clientListingId)).status).toBe(404);
        expect(await prisma.listing.count({ where: { ownerUserId: owners[0] } })).toBe(0);
    });
    it('rejects anonymous, malformed, extra-query and extra-body receipt requests', async () => {
        const body = await payload();
        expect((await request(server).get('/api/listings/creation-receipts/' + body.clientListingId)).status).toBe(401);
        expect((await read('not-an-id')).status).toBe(400); expect((await read(body.clientListingId + '?ownerUserId=1')).status).toBe(400);
        expect((await http('post', '/api/listings/creation-receipts/' + body.clientListingId + '/abandon').send({ requestHash: hash(body), publish: true })).status).toBe(400);
        expect((await abandon(body.clientListingId, 'invalid')).status).toBe(400);
    });
    it.each(['create', 'read', 'abandon'] as const)('rechecks revoked authorization after %s passes route middleware', async operation => {
        const body = await payload(); if (operation === 'read') await create(body);
        let resume!: () => void; release = new Promise(resolve => { resume = resolve; });
        const admission = new Promise<void>(resolve => { admitted = resolve; });
        const task = http(operation === 'read' ? 'get' : 'post', '/paused/' + operation + '/' + body.clientListingId)
            .send(operation === 'create' ? body : operation === 'abandon' ? { requestHash: hash(body) } : undefined).then(r => r);
        await admission; await prisma.user.update({ where: { id: owners[0] }, data: { authVersion: 1 } }); resume();
        const result = await task; expect(result.status).toBe(401); expect(result.body.errorCode).toBe('LISTING_SESSION_INVALID');
        expect(await prisma.listingCreateReceipt.count({ where: { userId: owners[0] } })).toBe(operation === 'read' ? 1 : 0);
    });
});
