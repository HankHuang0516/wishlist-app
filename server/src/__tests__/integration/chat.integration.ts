/** Real first-party chat through HTTP/auth and isolated PostgreSQL. */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import prisma from '../../lib/prisma';
import chatRoutes from '../../routes/chatRoutes';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Explicit isolated DB required');
const secret = 'chat-integration-only-not-production'; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use('/api/chat', chatRoutes);
// One owned loopback listener matches the deployed backend's persistent HTTP
// transport; request(app) otherwise opens and closes a server for every call.
const server = createServer(app);
let seller: number, buyer: number, third: number, listingId: string; let ip = 1;
const token = (userId: number) => jwt.sign({ id: userId }, secret, { algorithm: 'HS256', expiresIn: '1h' });
const call = (method: 'get' | 'post' | 'delete', path: string, userId = buyer) => request(server)[method]('/api/chat' + path).set('Authorization', 'Bearer ' + token(userId)).set('X-Forwarded-For', '192.0.2.' + (ip++ % 250 + 1));
const open = (userId = buyer) => call('post', '/conversations', userId).send({ listingId });
const send = (room: string, text: string, userId = buyer, clientMessageId = randomUUID()) => call('post', '/conversations/' + room + '/messages', userId).send({ clientMessageId, text });
beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    const run = randomUUID(); const users = await Promise.all(['seller', 'buyer', 'third'].map(role => prisma.user.create({ data: { phoneNumber: `chat-test-${run}-${role}`, password: 'synthetic-not-login', name: `合成${role}`, email: `${run}-${role}@example.invalid` }, select: { id: true } })));
    [seller, buyer, third] = users.map(user => user.id);
});
beforeEach(async () => {
    await prisma.conversation.deleteMany({ where: { OR: [{ buyerUserId: { in: [seller, buyer, third] } }, { sellerUserId: { in: [seller, buyer, third] } }] } });
    await prisma.listing.deleteMany({ where: { ownerUserId: seller } });
    await prisma.userBlock.deleteMany({ where: { blockerUserId: { in: [seller, buyer, third] } } });
    const now = new Date(); const listing = await prisma.listing.create({ data: { ownerUserId: seller, clientListingId: randomUUID(), requestHash: 'synthetic-only', title: '合成二手相機', status: 'ACTIVE', publishedAt: now, expiresAt: new Date(now.getTime() + 30 * 86400000) } }); listingId = listing.id;
});
afterAll(async () => {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (seller) {
        await prisma.conversation.deleteMany({ where: { OR: [{ buyerUserId: { in: [seller, buyer, third] } }, { sellerUserId: { in: [seller, buyer, third] } }] } });
        await prisma.user.deleteMany({ where: { id: { in: [seller, buyer, third] } } });
    }
    await prisma.$disconnect();
});

describe('first-party chat / PostgreSQL integration', () => {
    it('requires real JWT auth and rejects forged tokens', async () => {
        expect((await request(server).get('/api/chat/conversations')).status).toBe(401);
        expect((await request(server).post('/api/chat/conversations').set('Authorization', 'Bearer ' + jwt.sign({ id: buyer }, 'different-test-secret')).send({ listingId })).status).toBe(401);
        expect(await prisma.conversation.count({ where: { listingId } })).toBe(0);
    });
    it('infers buyer/seller from authentication/listing and deduplicates an existing room', async () => {
        const first = await open(); const retry = await open(); expect(first.status).toBe(201); expect(retry.status).toBe(200); expect(retry.body.id).toBe(first.body.id);
        const participants = await prisma.conversationParticipant.findMany({ where: { conversationId: first.body.id } }); expect(participants.map(p => [p.userId, p.role])).toEqual(expect.arrayContaining([[buyer, 'BUYER'], [seller, 'SELLER']])); expect(participants).toHaveLength(2);
        expect(first.body).toMatchObject({ buyerUserId: buyer, sellerUserId: seller, unreadCount: 0, listingAvailable: true });
        for (const privateKey of ['phoneNumber', 'email', 'password', 'apiKey', 'address', 'participants']) expect(first.body).not.toHaveProperty(privateKey);
        expect(first.body.buyer).toEqual({ id: buyer, name: '合成buyer' });
    });
    it('deduplicates concurrent room opens using a database pair lock', async () => {
        const results = await Promise.all(Array.from({ length: 10 }, () => open())); expect(results.filter(result => result.status === 201)).toHaveLength(1); expect(results.filter(result => result.status === 200)).toHaveLength(9);
        expect(new Set(results.map(result => result.body.id)).size).toBe(1); expect(await prisma.conversation.count({ where: { listingId } })).toBe(1);
    });
    it('does not create rooms for self, drafts, expired or stopped listings', async () => {
        expect((await open(seller)).status).toBe(400);
        for (const status of ['DRAFT', 'SOLD', 'REMOVED'] as const) { await prisma.listing.update({ where: { id: listingId }, data: { status } }); expect((await open()).status).toBe(404); }
        await prisma.listing.update({ where: { id: listingId }, data: { status: 'ACTIVE', publishedAt: new Date('2020-01-01'), expiresAt: new Date('2020-02-01') } }); expect((await open()).status).toBe(404);
    });
    it('rejects spoofed seller/buyer/member fields and absent listing IDs', async () => {
        expect((await call('post', '/conversations').send({ listingId, sellerUserId: third })).status).toBe(400);
        expect((await call('post', '/conversations').send({ listingId: randomUUID() })).status).toBe(404);
        expect((await call('post', '/conversations').send({ listingId: 'invalid' })).status).toBe(400);
    });
    it('allows only participants to read a room, messages, or update read status', async () => {
        const room = (await open()).body.id; await send(room, '您好');
        expect((await call('get', '/conversations/' + room, seller)).status).toBe(200);
        expect((await call('get', '/conversations/' + room, third)).status).toBe(404);
        expect((await call('get', '/conversations/' + room + '/messages', third)).status).toBe(404);
        expect((await call('post', '/conversations/' + room + '/read', third).send({ throughSequence: 1 })).status).toBe(404);
        expect((await send(room, '越權', third)).status).toBe(404); expect((await call('get', '/conversations', third)).body.items).toEqual([]);
    });
    it('actually exchanges text between two identities and exposes only immutable message fields', async () => {
        const room = (await open()).body.id; const buyerMessage = await send(room, '週六可以面交嗎？'); const sellerMessage = await send(room, '可以，下午兩點方便嗎？', seller);
        expect(buyerMessage.status).toBe(201); expect(sellerMessage.status).toBe(201); expect(buyerMessage.body).toMatchObject({ senderUserId: buyer, sequence: 1 }); expect(sellerMessage.body).toMatchObject({ senderUserId: seller, sequence: 2 });
        const history = await call('get', '/conversations/' + room + '/messages'); expect(history.body.items.map((item: { text: string }) => item.text)).toEqual(['週六可以面交嗎？', '可以，下午兩點方便嗎？']);
        expect(Object.keys(history.body.items[0]).sort()).toEqual(['id', 'conversationId', 'senderUserId', 'clientMessageId', 'sequence', 'text', 'createdAt'].sort());
    });
    it('deduplicates same-key retries, rejects conflicting content and does not increment sequence twice', async () => {
        const room = (await open()).body.id; const key = randomUUID(); const first = await send(room, ' 同一則訊息 ', buyer, key); const retry = await send(room, '同一則訊息', buyer, key);
        expect(retry.status).toBe(200); expect(retry.body.id).toBe(first.body.id); expect((await send(room, '不同訊息', buyer, key)).status).toBe(409);
        expect((await prisma.conversation.findUniqueOrThrow({ where: { id: room } })).lastMessageSequence).toBe(1);
    });
    it('deduplicates concurrent same-key sends without gaps or fragments', async () => {
        const room = (await open()).body.id; const key = randomUUID(); const results = await Promise.all(Array.from({ length: 10 }, () => send(room, '並行重送', buyer, key)));
        expect(results.filter(result => result.status === 201)).toHaveLength(1); expect(results.filter(result => result.status === 200)).toHaveLength(9); expect(new Set(results.map(result => result.body.id)).size).toBe(1);
        expect(await prisma.message.count({ where: { conversationId: room } })).toBe(1); expect((await prisma.conversation.findUniqueOrThrow({ where: { id: room } })).lastMessageSequence).toBe(1);
    });
    it('assigns stable contiguous sequences to concurrent distinct sends', async () => {
        const room = (await open()).body.id; const results = await Promise.all(Array.from({ length: 20 }, (_, index) => send(room, '合成訊息' + index, index % 2 ? seller : buyer)));
        expect(results.every(result => result.status === 201)).toBe(true); expect(results.map(result => result.body.sequence).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
        expect((await prisma.conversation.findUniqueOrThrow({ where: { id: room } })).lastMessageSequence).toBe(20);
    });
    it('counts only incoming unread messages and keeps read position monotonic', async () => {
        const room = (await open()).body.id; await send(room, '買家訊息'); await send(room, '賣家訊息', seller); await send(room, '買家訊息2');
        expect((await call('get', '/conversations/' + room, seller)).body.unreadCount).toBe(2); expect((await call('get', '/conversations/' + room)).body.unreadCount).toBe(1);
        const read = await call('post', '/conversations/' + room + '/read', seller).send({ throughSequence: 3 }); expect(read.body.unreadCount).toBe(0);
        const older = await call('post', '/conversations/' + room + '/read', seller).send({ throughSequence: 1 }); expect(older.body.lastReadSequence).toBe(3);
        expect((await call('post', '/conversations/' + room + '/read', seller).send({ throughSequence: 99 })).status).toBe(400);
    });
    it('pages both older history and reconnect catch-up without duplication', async () => {
        const room = (await open()).body.id; for (let index = 0; index < 6; index++) await send(room, '分頁' + index);
        const latest = (await call('get', '/conversations/' + room + '/messages').query({ limit: '2' })).body; expect(latest.items.map((item: { sequence: number }) => item.sequence)).toEqual([5, 6]); expect(latest.nextBeforeSequence).toBe(5);
        const older = (await call('get', '/conversations/' + room + '/messages').query({ limit: '2', beforeSequence: String(latest.nextBeforeSequence) })).body; expect(older.items.map((item: { sequence: number }) => item.sequence)).toEqual([3, 4]);
        const reconnect = (await call('get', '/conversations/' + room + '/messages').query({ limit: '2', afterSequence: '0' })).body; expect(reconnect.items.map((item: { sequence: number }) => item.sequence)).toEqual([1, 2]); expect(reconnect.nextAfterSequence).toBe(2);
        const caughtUp = (await call('get', '/conversations/' + room + '/messages').query({ afterSequence: '4' })).body; expect(caughtUp.items.map((item: { sequence: number }) => item.sequence)).toEqual([5, 6]); expect(caughtUp.nextAfterSequence).toBeNull();
    });
    it('blocks new messages in both directions, retains history, and permits only original send retry', async () => {
        const room = (await open()).body.id; const key = randomUUID(); const sent = await send(room, '封鎖前訊息', buyer, key);
        expect((await call('post', '/blocks/' + buyer, seller).send({})).status).toBe(200);
        expect((await send(room, '封鎖後訊息')).status).toBe(403); expect((await send(room, '封鎖後訊息', seller)).status).toBe(403);
        expect((await send(room, '封鎖前訊息', buyer, key)).body.id).toBe(sent.body.id); expect((await call('get', '/conversations/' + room + '/messages')).body.items).toHaveLength(1);
        expect((await call('get', '/conversations/' + room)).body).toMatchObject({ blocked: true, blockedByMe: false, blockedByOther: true });
        expect((await call('get', '/conversations/' + room, seller)).body).toMatchObject({ blocked: true, blockedByMe: true, blockedByOther: false });
        await call('delete', '/blocks/' + buyer, seller).send({}); expect((await send(room, '解除封鎖後')).status).toBe(201);
    });
    it('looks up only this sender’s committed receipt to recover a lost response beyond the latest history page', async () => {
        const room = (await open()).body.id; const key = randomUUID(); const message = await send(room, '待確認訊息', buyer, key);
        const path = '/conversations/' + room + '/messages/by-client-id/' + key;
        expect((await call('get', path)).body.id).toBe(message.body.id); expect((await call('get', path, seller)).status).toBe(404); expect((await call('get', path, third)).status).toBe(404);
        expect((await call('get', '/conversations/' + room + '/messages/by-client-id/' + randomUUID())).status).toBe(404);
        await call('post', '/blocks/' + buyer, seller).send({}); expect((await call('get', path)).body.id).toBe(message.body.id);
    });
    it('serializes a committed block with in-flight sends across concurrent transactions', async () => {
        const room = (await open()).body.id;
        let count = 0;
        for (let round = 0; round < 25; round++) {
            expect((await call('delete', '/blocks/' + buyer, seller).send({})).status).toBe(200);
            const racing = await Promise.all([call('post', '/blocks/' + buyer, seller).send({}), send(room, '同時傳送' + round)]);
            expect(racing[0].status).toBe(200); expect([201, 403]).toContain(racing[1].status);
            for (let index = 0; index < 5; index++) {
                const response = await send(room, '封鎖已提交' + round + '-' + index);
                if (response.status !== 403) {
                    const [current, members] = await Promise.all([prisma.conversation.findUnique({ where: { id: room }, select: { id: true } }), prisma.conversationParticipant.count({ where: { conversationId: room } })]);
                    throw new Error(JSON.stringify({ issue: 'Unexpected post-block response', status: response.status, errorCode: response.body.errorCode, round, conversationExists: !!current, memberCount: members }));
                }
            }
            count += racing[1].status === 201 ? 1 : 0; expect(await prisma.message.count({ where: { conversationId: room } })).toBe(count);
        }
    });
    it('prevents a blocked pair from opening a new room and forbids self/actor spoofing', async () => {
        await call('post', '/blocks/' + seller).send({}); expect((await open()).status).toBe(403);
        expect((await call('post', '/blocks/' + buyer).send({})).status).toBe(400); expect((await call('post', '/blocks/' + seller).send({ blockerUserId: third })).status).toBe(400);
        expect((await call('delete', '/blocks/' + buyer, third).send({})).status).toBe(200); expect((await open()).status).toBe(403);
    });
    it('retains an existing room after listing expiry and does not leak raw coordinates', async () => {
        const room = (await open()).body.id; await send(room, '之前的訊息');
        await prisma.listing.update({ where: { id: listingId }, data: { publishedAt: new Date('2020-01-01'), expiresAt: new Date('2020-02-01') } });
        const detail = await call('get', '/conversations/' + room); expect(detail.status).toBe(200); expect(detail.body.listingAvailable).toBe(false);
        expect((await open()).body.id).toBe(room); expect((await call('get', '/conversations/' + room + '/messages')).body.items).toHaveLength(1);
        expect(detail.body.listing).not.toHaveProperty('location.latitude');
    });
    it('rejects forged sender IDs and private payload extras before writes', async () => {
        const room = (await open()).body.id;
        expect((await call('post', '/conversations/' + room + '/messages').send({ clientMessageId: randomUUID(), text: '偽造', senderUserId: seller })).status).toBe(400);
        expect((await send(room, 'x'.repeat(2001))).status).toBe(400); expect((await send(room, ' \n ')).status).toBe(400);
        expect(await prisma.message.count({ where: { conversationId: room } })).toBe(0);
        await expect(prisma.message.create({ data: { conversationId: room, senderUserId: third, clientMessageId: randomUUID(), sequence: 1, text: 'DB bypass outsider' } })).rejects.toThrow();
    });
    it('pages the inbox without exposing another user’s cursor anchor', async () => {
        const first = (await open()).body.id;
        const secondListing = await prisma.listing.create({ data: { ownerUserId: seller, clientListingId: randomUUID(), requestHash: 'synthetic-only', title: '另一筆合成商品', status: 'ACTIVE', publishedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) } });
        const second = (await call('post', '/conversations').send({ listingId: secondListing.id })).body.id;
        const page1 = (await call('get', '/conversations').query({ limit: '1' })).body; const page2 = (await call('get', '/conversations').query({ limit: '1', cursor: page1.nextCursor })).body;
        expect(new Set([...page1.items, ...page2.items].map((item: { id: string }) => item.id))).toEqual(new Set([first, second]));
        expect((await call('get', '/conversations', third).query({ cursor: first })).status).toBe(404); expect((await call('get', '/conversations').query({ limit: '1000' })).status).toBe(400);
    });
});
