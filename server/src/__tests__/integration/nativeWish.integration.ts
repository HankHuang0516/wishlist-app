import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import routes from '../../routes/nativeWishRoutes';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'native-wish-integration-only'; process.env.JWT_SECRET = secret;
const app = express(); app.use(express.json()); app.use('/api/native-wishes', routes);
const server = createServer(app); const root = '/api/native-wishes';
let owner: number, outsider: number;
const auth = (id = owner) => 'Bearer ' + jwt.sign({ id }, secret, { algorithm: 'HS256' });
const post = (path: string, body: object, user = owner) => request(server).post(root + path).set('Authorization', auth(user)).send(body);
const list = async (body = {}) => { const payload = { clientRequestId: randomUUID(), title: '合成願望清單', ...body }; const res = await post('/lists', payload); expect(res.status).toBe(201); return { payload, id: res.body.resource.id as number }; };
beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    const run = randomUUID(); const users = await Promise.all(['owner', 'outsider'].map(role => prisma.user.create({ data: { phoneNumber: `native-wish-${run}-${role}`, password: 'synthetic-only', name: role }, select: { id: true } })));
    [owner, outsider] = users.map(u => u.id);
});
beforeEach(async () => { await prisma.wishlist.deleteMany({ where: { userId: { in: [owner, outsider] } } }); await prisma.wishCreateReceipt.deleteMany({ where: { userId: { in: [owner, outsider] } } }); });
afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner, outsider] } } }); await prisma.$disconnect();
});
describe('native wish ownership and durable create receipts / PostgreSQL and real router', () => {
    it('requires authentication', async () => { expect((await request(server).get(root + '/lists')).status).toBe(401); });
    it('serializes parallel list retries, preserving private defaults and exactly one resource', async () => {
        const body = { clientRequestId: randomUUID(), title: 'Camera' }; const results = await Promise.all(Array.from({ length: 12 }, () => post('/lists', body)));
        expect(results.every(r => r.status === 201)).toBe(true); expect(new Set(results.map(r => r.body.resource.id)).size).toBe(1); expect(results.filter(r => !r.body.replayed)).toHaveLength(1);
        expect(results[0].body.resource.isPublic).toBe(false); expect(await prisma.wishlist.count({ where: { userId: owner } })).toBe(1);
        expect((await post('/lists', { ...body, title: 'Different' })).status).toBe(409);
        const other = await post('/lists', body, outsider); expect(other.status).toBe(201); expect(other.body.resource.id).not.toBe(results[0].body.resource.id);
    });
    it('serializes wish retries, preserving zero budget without triggering AI or third-party fetch', async () => {
        const { id } = await list(); const body = { clientRequestId: randomUUID(), name: 'Sony A7', maxPrice: 0, notes: '合成備註', link: 'https://example.com/item' };
        const attempts = await Promise.all(Array.from({ length: 12 }, () => post(`/lists/${id}/items`, body)));
        expect(attempts.every(r => r.status === 201)).toBe(true); expect(new Set(attempts.map(r => r.body.resource.id)).size).toBe(1);
        expect(attempts[0].body.resource).toMatchObject({ maxPrice: 0, priceCurrency: 'TWD', notes: '合成備註' });
        expect(await prisma.item.count({ where: { wishlistId: id } })).toBe(1); expect(await prisma.item.findFirst({ where: { wishlistId: id } })).toMatchObject({ aiStatus: 'SKIPPED', uploadStatus: 'COMPLETED' });
        expect((await post(`/lists/${id}/items`, { ...body, maxPrice: 1 })).status).toBe(409);
    });
    it('queues one EClaw image recognition job for an idempotent native image wish', async () => {
        const { id } = await list(); const body = { clientRequestId: randomUUID(), name: '待辨識商品', imageUrl: 'https://images.example.com/camera.jpg' };
        const first = await post(`/lists/${id}/items`, body), replayed = await post(`/lists/${id}/items`, body);
        expect(first.status).toBe(201); expect(first.body.replayed).toBe(false); expect(first.body.resource).toMatchObject({ imageUrl: body.imageUrl, aiStatus: 'PENDING' });
        expect(replayed.status).toBe(201); expect(replayed.body.replayed).toBe(true); expect(replayed.body.resource.id).toBe(first.body.resource.id);
        expect(await prisma.item.count({ where: { wishlistId: id } })).toBe(1);
    });
    it.each(['http://images.example.com/camera.jpg', 'https://example.com/product', 'https://user:pass@example.com/camera.jpg'])('rejects unsafe or non-image native AI resource %s', async imageUrl => {
        const { id } = await list(); expect((await post(`/lists/${id}/items`, { clientRequestId: randomUUID(), name: 'bad', imageUrl })).status).toBe(400);
        expect(await prisma.item.count({ where: { wishlistId: id } })).toBe(0);
    });
    it('keeps the request namespace independent of target and refuses changed kind or parent', async () => {
        const a = await list(), b = await list(); const body = { clientRequestId: randomUUID(), name: 'Sony' }; expect((await post(`/lists/${a.id}/items`, body)).status).toBe(201);
        expect((await post(`/lists/${b.id}/items`, body)).status).toBe(409); expect((await post('/lists', { clientRequestId: body.clientRequestId, title: 'x' })).status).toBe(409);
    });
    it('enforces the per-list cap atomically for parallel native creators', async () => {
        const { id } = await list(); await prisma.wishlist.update({ where: { id }, data: { maxItems: 1 } });
        const results = await Promise.all(['a', 'b'].map(name => post(`/lists/${id}/items`, { clientRequestId: randomUUID(), name })));
        expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect(await prisma.item.count({ where: { wishlistId: id } })).toBe(1);
    });
    it('denies outsider CRUD even on public wishes', async () => {
        const { id } = await list({ isPublic: true }); const created = await post(`/lists/${id}/items`, { clientRequestId: randomUUID(), name: 'Sony' }); const itemId = created.body.resource.id;
        expect((await request(server).get(`${root}/lists/${id}`).set('Authorization', auth(outsider))).status).toBe(404);
        expect((await request(server).put(`${root}/lists/${id}`).set('Authorization', auth(outsider)).send({ isPublic: false })).status).toBe(404);
        expect((await post(`/lists/${id}/items`, { clientRequestId: randomUUID(), name: 'intrusion' }, outsider)).status).toBe(404);
        expect((await request(server).put(`${root}/items/${itemId}`).set('Authorization', auth(outsider)).send({ isPurchased: true })).status).toBe(404);
        expect((await request(server).delete(`${root}/items/${itemId}`).set('Authorization', auth(outsider))).status).toBe(404);
        expect((await request(server).delete(`${root}/lists/${id}`).set('Authorization', auth(outsider))).status).toBe(404);
    });
    it('allows list privacy and wish edits with minimal own management data', async () => {
        const { id } = await list(); const created = await post(`/lists/${id}/items`, { clientRequestId: randomUUID(), name: 'Sony' });
        const updated = await request(server).put(`${root}/lists/${id}`).set('Authorization', auth()).send({ title: '新名稱', isPublic: true, description: '' }); expect(updated.status).toBe(200); expect(updated.body).toMatchObject({ title: '新名稱', isPublic: true, description: '' });
        expect((await request(server).put(`${root}/items/${created.body.resource.id}`).set('Authorization', auth()).send({ name: 'Canon', maxPrice: 200, isHidden: true })).status).toBe(200);
        const detail = await request(server).get(`${root}/lists/${id}`).set('Authorization', auth()); expect(detail.status).toBe(200); expect(detail.body.items[0]).toMatchObject({ name: 'Canon', maxPrice: 200, isHidden: true }); expect(detail.body.items[0]).not.toHaveProperty('proxy_end_user_id'); expect(detail.headers['cache-control']).toBe('private, no-store');
    });
    it('keeps a deleted item receipt and never resurrects it through a late retry', async () => {
        const { id } = await list(), body = { clientRequestId: randomUUID(), name: 'Sony' }; const created = await post(`/lists/${id}/items`, body);
        expect((await request(server).delete(`${root}/items/${created.body.resource.id}`).set('Authorization', auth())).status).toBe(200);
        expect((await post(`/lists/${id}/items`, body)).status).toBe(410); expect(await prisma.item.count({ where: { wishlistId: id } })).toBe(0);
        expect(await prisma.wishCreateReceipt.count({ where: { userId: owner, clientRequestId: body.clientRequestId } })).toBe(1);
    });
    it('keeps list and child request tombstones when a whole list is deleted', async () => {
        const { id, payload } = await list(), body = { clientRequestId: randomUUID(), name: 'Sony' }; expect((await post(`/lists/${id}/items`, body)).status).toBe(201);
        expect((await request(server).delete(`${root}/lists/${id}`).set('Authorization', auth())).status).toBe(200);
        expect((await post('/lists', payload)).status).toBe(410); expect((await post(`/lists/${id}/items`, body)).status).toBe(410); expect(await prisma.wishlist.count({ where: { userId: owner } })).toBe(0);
    });
    it('paginates wish details without fetching or returning the entire list', async () => {
        const { id } = await list(); await prisma.item.createMany({ data: Array.from({ length: 51 }, (_, i) => ({ wishlistId: id, name: '合成願望' + i, aiStatus: 'SKIPPED' })) });
        const a = await request(server).get(`${root}/lists/${id}`).set('Authorization', auth()); expect(a.body.items).toHaveLength(50); expect(a.body.nextCursor).toBe(a.body.items[49].id);
        const b = await request(server).get(`${root}/lists/${id}?cursor=${a.body.nextCursor}`).set('Authorization', auth()); expect(b.body.items).toHaveLength(1); expect(b.body.nextCursor).toBe(null); expect(b.body.items[0].id).toBeGreaterThan(a.body.nextCursor);
    });
    it('paginates list headers and rejects malformed or repeated cursor values', async () => {
        await prisma.wishlist.createMany({ data: Array.from({ length: 26 }, (_, i) => ({ userId: owner, title: '合成清單' + i })) });
        const a = await request(server).get(root + '/lists').set('Authorization', auth()); expect(a.status).toBe(200); expect(a.body.items).toHaveLength(25);
        const b = await request(server).get(`${root}/lists?cursor=${a.body.nextCursor}`).set('Authorization', auth()); expect(b.body.items).toHaveLength(1); expect(b.body.nextCursor).toBe(null); expect(b.body.items[0].id).toBeGreaterThan(a.body.nextCursor);
        for (const query of ['cursor=0', 'cursor=-1', 'cursor=1&cursor=2']) expect((await request(server).get(root + '/lists?' + query).set('Authorization', auth())).status).toBe(400);
    });
    it('refuses a create with a formerly valid token after the owning user is erased', async () => {
        const created = await prisma.user.create({ data: { phoneNumber: 'native-erased-' + randomUUID(), password: 'synthetic-only' }, select: { id: true } });
        try {
            const body = { clientRequestId: randomUUID(), title: '合成清單' }; expect((await post('/lists', body, created.id)).status).toBe(201);
            await prisma.user.delete({ where: { id: created.id } });
            expect(await prisma.wishCreateReceipt.count({ where: { userId: created.id } })).toBe(0); expect((await post('/lists', body, created.id)).status).toBe(401);
        } finally { await prisma.user.deleteMany({ where: { id: created.id } }); }
    });
    it('avoids a user/parent lock inversion while an owner completes a wish', async () => {
        const { id } = await list(); const existing = await prisma.item.create({ data: { wishlistId: id, name: '合成舊願望' }, select: { id: true } });
        let acquired!: () => void, allowClaim!: () => void;
        const ready = new Promise<void>(resolve => { acquired = resolve; }), claim = new Promise<void>(resolve => { allowClaim = resolve; });
        const completion = prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Wishlist" WHERE "id" = ${id} FOR UPDATE`;
            acquired(); await claim;
            // FK validation needs KEY SHARE on this user. The waiting native
            // create must serialize without blocking that share and deadlocking.
            await tx.item.update({ where: { id: existing.id }, data: { isPurchased: true, purchasedById: owner } });
        });
        await ready;
        const creation = post(`/lists/${id}/items`, { clientRequestId: randomUUID(), name: '合成新願望' }).then(res => res);
        try {
            let waiting = false;
            for (let n = 0; n < 50 && !waiting; n++) {
                const rows = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'SELECT "id" FROM "Wishlist" WHERE%'`;
                waiting = rows[0].count > 0; if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
            }
            expect(waiting).toBe(true);
        } finally { allowClaim(); }
        await completion; expect((await creation).status).toBe(201);
        expect(await prisma.item.findUnique({ where: { id: existing.id } })).toMatchObject({ isPurchased: true, purchasedById: owner });
    });
});
