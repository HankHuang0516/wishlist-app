import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
jest.mock('../../lib/flickr', () => ({ flickrService: {} }));
jest.mock('../../lib/emailService', () => ({ sendEmail: jest.fn() }));
import userRoutes from '../../routes/userRoutes';
import prisma from '../../lib/prisma';
import { signUserJwt } from '../../lib/jwtConfig';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Equal isolated database required');
const previous = process.env.JWT_SECRET;
const app = express(); app.use(express.json()); app.use('/api/users', userRoutes); const server = createServer(app);
let owner: number, other: number, publicList: number, privateList: number, ownList: number;
const itemIds: number[] = [], purchaseIds: number[] = [];
const read = (kind = 'purchases', id = owner) => request(server).get('/api/users/me/' + kind).set('Authorization', 'Bearer ' + signUserJwt({ id, authVersion: 0 }));
async function claim(data: { name?: string; wishlistId?: number; isHidden?: boolean; purchasedById?: number | null; price?: string | null; imageUrl?: string | null }) {
    const row = await prisma.item.create({ data: { name: 'synthetic-visible-gift', wishlistId: publicList, purchasedById: owner, isPurchased: true, notes: 'private-note-never-projected', aiError: 'private-provider-error', proxy_end_user_id: 'private-proxy', ...data } }); itemIds.push(row.id); return row;
}
async function transaction(id = owner, data: { amount?: number; type?: string; currency?: string; status?: string; createdAt?: Date } = {}) {
    const row = await prisma.purchase.create({ data: { userId: id, amount: 0, type: 'PREMIUM', currency: 'TWD', ...data } }); purchaseIds.push(row.id); return row;
}
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); });
beforeEach(async () => {
    process.env.JWT_SECRET = 'synthetic-purchase-history-session-secret';
    owner = (await prisma.user.create({ data: { phoneNumber: 'history-owner-' + randomUUID(), password: 'synthetic-unusable', apiKey: 'synthetic-history-key-' + randomUUID(), name: 'synthetic-owner' } })).id;
    other = (await prisma.user.create({ data: { phoneNumber: 'history-other-' + randomUUID(), password: 'synthetic-unusable', name: 'synthetic-other', nicknames: 'synthetic-nickname', avatarUrl: 'https://example.invalid/private-avatar', isAvatarVisible: false, address: 'private-address' } })).id;
    publicList = (await prisma.wishlist.create({ data: { userId: other, title: 'synthetic-public-list', description: 'private-parent-description', isPublic: true } })).id;
    privateList = (await prisma.wishlist.create({ data: { userId: other, title: 'private-title', description: 'private-description' } })).id;
    ownList = (await prisma.wishlist.create({ data: { userId: owner, title: 'synthetic-own-private' } })).id;
});
afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.item.deleteMany({ where: { id: { in: itemIds.splice(0) } } });
    await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds.splice(0) } } });
    await prisma.wishlist.deleteMany({ where: { id: { in: [publicList, privateList, ownList] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });

describe('retained account and claim history through actual routes and PostgreSQL', () => {
    it('authenticates both private reads, including private cache headers before refusal', async () => {
        for (const path of ['purchases','transaction-history']) for (const res of [await request(server).get('/api/users/me/' + path), await request(server).get('/api/users/me/' + path).set('Authorization','Bearer invalid'), await request(server).get('/api/users/me/' + path).set('X-Api-Key','synthetic-invalid')]) {
            expect(res.status).toBe(401); expect(res.headers['cache-control']).toBe('private, no-store');
        }
    });
    it('returns actual empty arrays only when both queries succeed', async () => {
        for (const path of ['purchases','transaction-history']) { const res = await read(path); expect(res.status).toBe(200); expect(res.body).toEqual([]); expect(res.headers['cache-control']).toBe('private, no-store'); }
    });
    it('preserves all own transactions and original amounts, currencies, statuses and deterministic ordering', async () => {
        const at = new Date('2020-01-01T00:00:00.000Z'); const a = await transaction(owner, { amount: 123.4567, status: 'FAILED', createdAt: at });
        const b = await transaction(owner, { amount: -1.125, type: 'CUSTOM', currency: 'USD', status: 'REFUNDED', createdAt: at }); await transaction(other, { amount: 999 });
        const res = await read('transaction-history'); expect(res.body).toEqual([b,a].map(({ id,type,amount,currency,status,createdAt }) => ({ id,type,amount,currency,status,createdAt:createdAt.toISOString() })));
        expect((await read('transaction-history').query({ userId: other })).body).toEqual(res.body);
    });
    it('preserves the existing personal-key read capability without exposing another user history', async () => {
        const mine = await transaction(); await transaction(other); const key = (await prisma.user.findUniqueOrThrow({ where: { id: owner }, select: { apiKey: true } })).apiKey!;
        const res = await request(server).get('/api/users/me/transaction-history').set('X-Api-Key',key);
        expect(res.status).toBe(200); expect(res.body.map((row: { id: number }) => row.id)).toEqual([mine.id]);
        await prisma.user.update({ where: { id: owner }, data: { apiKey: null } }); expect((await request(server).get('/api/users/me/purchases').set('X-Api-Key',key)).status).toBe(401);
    });
    it('projects only visible claim fields and respects the original owner avatar privacy', async () => {
        const mine = await claim({ price: '0', imageUrl: 'https://example.invalid/public-image' }); await claim({ name: 'another-purchaser-record', purchasedById: other });
        const res = await read(); expect(res.status).toBe(200); expect(res.body).toEqual([{ id: mine.id, name: mine.name, price:'0',currency:mine.currency,link:null,imageUrl:mine.imageUrl,updatedAt:mine.updatedAt.toISOString(),unavailable:false,wishlist:{title:'synthetic-public-list',user:{id:other,name:'synthetic-other',nicknames:'synthetic-nickname',avatarUrl:null}} }]);
        expect(JSON.stringify(res.body)).not.toMatch(/private|notes|aiError|proxy|password|address|apiKey/);
        expect((await read().query({ purchasedById: other })).body).toEqual(res.body);
    });
    it('retains minimal claim reminders while denying newly private and hidden outsider content', async () => {
        const a = await claim({ name: 'private-item-name', wishlistId: privateList }); const b = await claim({ name:'hidden-item-name', isHidden:true });
        const res = await read(); expect(res.body).toHaveLength(2);
        for (const row of res.body) expect(Object.keys(row).sort()).toEqual(['id','unavailable','updatedAt']);
        expect(res.body.map((r: { id: number }) => r.id).sort()).toEqual([a.id,b.id].sort()); expect(res.body.every((r: { unavailable: boolean }) => r.unavailable)).toBe(true);
        expect(JSON.stringify(res.body)).not.toMatch(/private-title|private-item|hidden-item|image|wishlist|name/);
    });
    it('allows the actual owner to read their own private and hidden claim display', async () => {
        const mine = await claim({ wishlistId: ownList, isHidden:true }); expect((await read()).body[0]).toMatchObject({ id:mine.id,unavailable:false,name:mine.name,wishlist:{title:'synthetic-own-private'} });
    });
    it('rechecks current privacy and claimed-by membership on every read rather than treating history as lasting authority', async () => {
        const mine = await claim({}); expect((await read()).body[0].unavailable).toBe(false);
        await prisma.wishlist.update({ where:{id:publicList},data:{isPublic:false} }); expect((await read()).body).toEqual([{id:mine.id,updatedAt:mine.updatedAt.toISOString(),unavailable:true}]);
        await prisma.item.update({where:{id:mine.id},data:{purchasedById:null,isPurchased:false}}); expect((await read()).body).toEqual([]);
    });
    it('does not silently truncate more than100 account and claimed records', async () => {
        for (let i=0;i<105;i++) { await transaction(owner,{type:'synthetic-'+i}); await claim({name:'synthetic-'+i}); }
        expect((await read()).body).toHaveLength(105); expect((await read('transaction-history')).body).toHaveLength(105);
    });
    it('denies revoked and deleted sessions on both reads', async () => {
        const bearer=signUserJwt({id:owner,authVersion:0}); await prisma.user.update({where:{id:owner},data:{authVersion:1}});
        for(const kind of ['purchases','transaction-history']) expect((await request(server).get('/api/users/me/'+kind).set('Authorization','Bearer '+bearer)).status).toBe(401);
        await prisma.user.delete({where:{id:owner}}); expect((await request(server).get('/api/users/me/purchases').set('Authorization','Bearer '+bearer)).status).toBe(401);
    });
    it('returns bounded unavailable errors rather than empty or raw database details', async () => {
        jest.spyOn(prisma.purchase,'findMany').mockRejectedValueOnce(Error('private-database-url'));
        const tx=await read('transaction-history'); expect(tx.status).toBe(500); expect(tx.body).toEqual({error:'History unavailable',errorCode:'INTERNAL_ERROR'}); expect(tx.headers['cache-control']).toBe('private, no-store');
        jest.spyOn(prisma,'$transaction').mockRejectedValueOnce(Error('private-database-url')); const items=await read(); expect(items.status).toBe(500); expect(items.body).toEqual(tx.body);
    });
});
