import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import { authenticateToken } from '../../middleware/auth';
import { updateItem } from '../../controllers/wishItemController';
import { createWishlist, getWishlist } from '../../controllers/wishlistController';
import { getItem, getPublicItems } from '../../controllers/wishItemReadController';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'wish-ownership-integration-only'; process.env.JWT_SECRET = secret;
const app = express(); app.use(express.json()); app.put('/api/items/:id', authenticateToken, updateItem); app.post('/api/wishlists', authenticateToken, createWishlist);
app.get('/api/items/public', getPublicItems);
app.get('/api/items/:id', authenticateToken, getItem);
app.get('/api/wishlists/:id', authenticateToken, getWishlist);
const server = createServer(app);
let owner: number, first: number, second: number, listId: number, itemId: number;
const auth = (id: number) => 'Bearer ' + jwt.sign({ id }, secret, { algorithm: 'HS256' });
const edit = (body: unknown, userId = owner) => request(server).put('/api/items/' + itemId).set('Authorization', auth(userId)).send(body as object);
beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    const run = randomUUID(); const users = await Promise.all(['owner', 'first', 'second'].map(role => prisma.user.create({ data: { phoneNumber: `wish-owner-${run}-${role}`, name: role, password: 'synthetic-only' }, select: { id: true } })));
    [owner, first, second] = users.map(u => u.id);
});
beforeEach(async () => {
    await prisma.wishlist.deleteMany({ where: { userId: { in: [owner, first, second] } } });
    const list = await prisma.wishlist.create({ data: { userId: owner, title: '合成私密清單', items: { create: { name: 'Sony 相機', price: '45000', currency: 'USD', maxPrice: 5000, priceCurrency: 'TWD', notes: '合成私密筆記', proxy_end_user_id: 'synthetic-private-reference' } } }, include: { items: true } });
    listId = list.id; itemId = list.items[0].id;
});
afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner, first, second] } } });
    await prisma.$disconnect();
});
describe('wish privacy and fulfillment / actual PostgreSQL transactions', () => {
    it('requires authentication', async () => { expect((await request(server).put('/api/items/' + itemId).send({ isPurchased: true })).status).toBe(401); });
    it('defaults new wishlists to private, preserving an explicit public choice', async () => {
        const a = await request(server).post('/api/wishlists').set('Authorization', auth(owner)).send({ title: '新增合成願望' }); expect(a.status).toBe(201); expect(a.body.isPublic).toBe(false);
        const b = await request(server).post('/api/wishlists').set('Authorization', auth(owner)).send({ title: '新增合成公開願望', isPublic: true }); expect(b.status).toBe(201); expect(b.body.isPublic).toBe(true);
    });
    it('refuses outsider completion on a private wish, leaving DB state untouched', async () => {
        for (const isPurchased of [true, false]) expect((await edit({ isPurchased }, first)).status).toBe(403);
        expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ isPurchased: false, purchasedById: null, maxPrice: 5000 });
    });
    it('refuses hidden public wishes', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } }); await prisma.item.update({ where: { id: itemId }, data: { isHidden: true } });
        expect((await edit({ isPurchased: true }, first)).status).toBe(403);
    });
    it('denies falsy edits to public wishes as well as injected ownership fields', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        for (const extra of [{ notes: '' }, { price: null }, { isHidden: false }, { maxPrice: 0 }]) expect((await edit({ isPurchased: true, ...extra }, first)).status).toBe(403);
        expect((await edit({ purchasedById: first })).status).toBe(400);
    });
    it('preserves public gift fulfillment without sending private wish metadata in its acknowledgment', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        const claim = await edit({ isPurchased: true }, first); expect(claim.status).toBe(200); expect(claim.body).toEqual({ id: itemId, isPurchased: true }); expect(claim.headers['cache-control']).toBe('private, no-store');
        expect((await edit({ isPurchased: true }, first)).status).toBe(200);
        for (const isPurchased of [false, true]) expect((await edit({ isPurchased }, second)).status).toBe(409);
        expect((await edit({ isPurchased: false }, first)).status).toBe(200);
        expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ isPurchased: false, purchasedById: null });
    });
    it('serializes concurrent claims: one fulfiller wins, the other cannot overwrite it', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        const attempts = await Promise.all([edit({ isPurchased: true }, first), edit({ isPurchased: true }, second)]); expect(attempts.map(r => r.status).sort()).toEqual([200, 409]);
        const winner = attempts[0].status === 200 ? first : second; expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ isPurchased: true, purchasedById: winner });
    });
    it('checks the committed privacy setting after waiting on the parent row lock', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        let ready!: () => void, unlock!: () => void; const acquired = new Promise<void>(resolve => { ready = resolve; }), held = new Promise<void>(resolve => { unlock = resolve; });
        const change = prisma.$transaction(async tx => { await tx.wishlist.update({ where: { id: listId }, data: { isPublic: false } }); ready(); await held; });
        await acquired; const attempt = edit({ isPurchased: true }, first).then(r => r);
        try {
            let waiting = false;
            for (let n = 0; n < 50 && !waiting; n++) {
                const rows = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'SELECT "id" FROM "Wishlist" WHERE%'`;
                waiting = rows[0].count > 0;
                if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
            }
            expect(waiting).toBe(true); // Prove the HTTP transaction actually waited.
        } finally { unlock(); }
        await change; expect((await attempt).status).toBe(403);
    });
    it('permits explicit zero budgets, updates both currency fields separately, and clears editable values', async () => {
        const result = await edit({ maxPrice: 0, priceCurrency: 'twd', price: 0, currency: 'usd', notes: '', link: '' }); expect(result.status).toBe(200); expect(result.body).toMatchObject({ maxPrice: 0, priceCurrency: 'TWD', price: '0', currency: 'USD', notes: '', link: null });
        expect((await edit({ maxPrice: null, price: null, notes: null })).status).toBe(200); expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ maxPrice: null, priceCurrency: null, price: null, notes: null });
        expect((await edit({ priceCurrency: 'JPY' })).status).toBe(400); expect((await edit({ maxPrice: 10 })).body.priceCurrency).toBe('TWD');
    });
    it('rejects malformed booleans, unsafe links and invalid budgets without DB changes', async () => {
        for (const patch of [{ isPurchased: 'true' }, { link: 'javascript:alert(1)' }, { maxPrice: -1 }, { maxPrice: 'Infinity' }, { name: [] }]) expect((await edit(patch)).status).toBe(400);
        expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ isPurchased: false, name: 'Sony 相機', maxPrice: 5000 });
    });
    it('never returns private or hidden wishes in the anonymous public feed', async () => {
        const privateFeed = await request(server).get('/api/items/public'); expect(privateFeed.status).toBe(200); expect(privateFeed.body.some((v: { id: number }) => v.id === itemId)).toBe(false);
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        await prisma.item.update({ where: { id: itemId }, data: { isHidden: true } });
        expect((await request(server).get('/api/items/public')).body.some((v: { id: number }) => v.id === itemId)).toBe(false);
        await prisma.item.update({ where: { id: itemId }, data: { isHidden: false } });
        const feed = await request(server).get('/api/items/public'); const visible = feed.body.find((v: { id: number }) => v.id === itemId);
        expect(visible).toMatchObject({ id: itemId, name: 'Sony 相機', maxPrice: 5000, wishlist: { id: listId, isPublic: true } });
        expect(visible).not.toHaveProperty('proxy_end_user_id'); expect(visible).not.toHaveProperty('aiError'); expect(visible.wishlist).not.toHaveProperty('user'); expect(visible.wishlist).not.toHaveProperty('userId');
        expect(feed.headers['cache-control']).toBe('no-store');
    });
    it('allows the owner to read private and hidden wishes but denies outsider item-ID enumeration', async () => {
        const url = '/api/items/' + itemId;
        expect((await request(server).get(url)).status).toBe(401);
        expect((await request(server).get(url).set('Authorization', auth(first))).status).toBe(404);
        const own = await request(server).get(url).set('Authorization', auth(owner)); expect(own.status).toBe(200); expect(own.body).toMatchObject({ id: itemId, proxy_end_user_id: 'synthetic-private-reference' });
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } }); await prisma.item.update({ where: { id: itemId }, data: { isHidden: true } });
        expect((await request(server).get(url).set('Authorization', auth(first))).status).toBe(404);
        expect((await request(server).get(url).set('Authorization', auth(owner))).status).toBe(200);
    });
    it('returns only public display fields in an outsider item detail', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true, description: 'parent description should not be in item detail' } });
        const visible = await request(server).get('/api/items/' + itemId).set('Authorization', auth(first)); expect(visible.status).toBe(200);
        expect(visible.body).not.toHaveProperty('proxy_end_user_id'); expect(visible.body).not.toHaveProperty('purchasedById'); expect(visible.body.wishlist).toEqual({ id: listId, title: '合成私密清單', isPublic: true });
        expect(visible.headers['cache-control']).toBe('private, no-store');
        for (const invalid of ['0', '-1', '1.5', '2147483648']) expect((await request(server).get('/api/items/' + invalid).set('Authorization', auth(first))).status).toBe(400);
    });
    it('filters hidden wishes and integration references from public wishlist details without changing owner reads', async () => {
        const url = '/api/wishlists/' + listId;
        expect((await request(server).get(url).set('Authorization', auth(first))).status).toBe(403);
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } }); await prisma.item.update({ where: { id: itemId }, data: { isHidden: true } });
        const visible = await request(server).get(url).set('Authorization', auth(first)); expect(visible.status).toBe(200); expect(visible.body.items).toEqual([]);
        expect((await request(server).get(url).set('Authorization', auth(owner))).body.items).toHaveLength(1);
        await prisma.item.update({ where: { id: itemId }, data: { isHidden: false } });
        const unhidden = await request(server).get(url).set('Authorization', auth(first)); expect(unhidden.body.items).toHaveLength(1); expect(unhidden.body.items[0]).not.toHaveProperty('proxy_end_user_id');
    });
});
