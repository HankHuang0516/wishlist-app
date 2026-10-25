import {createDiscoveryRoutes} from '../../routes/discoveryRoutes';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import prisma from '../../lib/prisma';
import chatRoutes from '../../routes/chatRoutes';
import listingRoutes from '../../routes/listingRoutes';
import productInterestRoutes from '../../routes/productInterestRoutes';
import { getStorefront } from '../../controllers/storefrontController';
import { authenticateToken } from '../../middleware/auth';

require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Explicit isolated DB required');
const previous = process.env.PRIVATE_REVIEW_DEMO_ROOMS;
const secret = 'isolated-review-demo-integration'; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/chat', chatRoutes); app.use('/api/listings', listingRoutes); app.use('/api/product-interest', productInterestRoutes);
app.use('/api/discovery',createDiscoveryRoutes());
app.get('/api/storefronts/:id', authenticateToken, getStorefront);
const server = createServer(app);
let seller: number, buyer: number, third: number, listingId: string, roomId: string, ip = 1;
const token = (id: number) => jwt.sign({ id }, secret, { algorithm: 'HS256', expiresIn: '1h' });
const call = (method: 'get' | 'post' | 'delete' | 'patch', path: string, id = buyer) =>
    request(server)[method]('/api' + path).set('Authorization', 'Bearer ' + token(id)).set('X-Forwarded-For', '192.0.2.' + (ip++ % 250 + 1));
const message = (id = buyer, clientMessageId = randomUUID()) => call('post', '/chat/conversations/' + roomId + '/messages', id).send({ clientMessageId, text: '合成審查示範，不是真實交易' });
const terms = () => ({ startsAt: new Date(Date.now() + 30 * 86400000).toISOString(), durationMinutes: 30, timeZone: 'Asia/Taipei', placeName: '合成示範點，請勿前往', notes: 'QA only: do not travel or pay.' });
const propose = (id = buyer) => call('post', '/chat/conversations/' + roomId + '/meetup', id).send({ clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: terms() });

beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    const run = randomUUID();
    const users = await Promise.all(['seller', 'buyer', 'third'].map(role => prisma.user.create({ data: {
        phoneNumber: 'private-review-' + run + role, email: run + role + '@example.invalid', password: 'synthetic-not-login', name: '合成審查' + role,
    }, select: { id: true } })));
    [seller, buyer, third] = users.map(u => u.id);
});
beforeEach(async () => {
    delete process.env.PRIVATE_REVIEW_DEMO_ROOMS;
    await prisma.conversation.deleteMany({ where: { sellerUserId: seller } });
    await prisma.listing.deleteMany({ where: { ownerUserId: seller } });
    await prisma.userBlock.deleteMany({ where: { blockerUserId: { in: [buyer, seller, third] } } });
    await prisma.pushDevice.deleteMany({ where: { userId: { in: [buyer, seller, third] } } });
    const listing = await prisma.listing.create({ data: { ownerUserId: seller, clientListingId: randomUUID(), requestHash: 'synthetic-only',
        title: '【QA測試非販售】明確合成示範', description: 'QA only. Do not pay or travel.', price: 50, status: 'ACTIVE',
        publishedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 86400000), deliveryMethods: ['MEETUP'] } });
    listingId = listing.id;
    const room = await prisma.conversation.create({ data: { listingId, buyerUserId: buyer, sellerUserId: seller,
        participants: { create: [{ userId: buyer, role: 'BUYER' }, { userId: seller, role: 'SELLER' }] } } });
    roomId = room.id;
    process.env.PRIVATE_REVIEW_DEMO_ROOMS = JSON.stringify([{ conversationId: roomId, listingId, buyerUserId: buyer, sellerUserId: seller }]);
});
afterAll(async () => {
    if (previous === undefined) delete process.env.PRIVATE_REVIEW_DEMO_ROOMS; else process.env.PRIVATE_REVIEW_DEMO_ROOMS = previous;
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await prisma.conversation.deleteMany({ where: { sellerUserId: seller } });
    await prisma.user.deleteMany({ where: { id: { in: [buyer, seller, third] } } });
    await prisma.$disconnect();
});

it('allows only the registered existing pair to operate private chat and exact-version meetups', async () => {
    expect((await call('post', '/chat/conversations').send({ listingId })).status).toBe(200);
    expect((await call('get', '/chat/conversations/' + roomId)).body.listingAvailable).toBe(true);
    const key = randomUUID(); expect((await message(buyer, key)).status).toBe(201); expect((await message(buyer, key)).status).toBe(200);
    expect((await message(seller)).status).toBe(201);
    const proposed = await propose(); expect(proposed.status).toBe(201); expect(proposed.body.appointment.status).toBe('PROPOSED');
    const confirmed = await call('post', '/chat/conversations/' + roomId + '/meetup', seller).send({ clientActionId: randomUUID(), action: 'CONFIRM', expectedVersion: 1 });
    expect(confirmed.status).toBe(201); expect(confirmed.body.appointment.status).toBe('CONFIRMED');
    expect(await prisma.message.count({ where: { conversationId: roomId } })).toBe(2);
    const detail = await call('get', '/listings/' + listingId); expect(detail.status).toBe(200); expect(detail.headers['cache-control']).toContain('no-store');
});

it('does not grant outsider reads, sends, photos, appointments or new rooms', async () => {
    for (const path of ['/chat/conversations/' + roomId, '/chat/conversations/' + roomId + '/messages', '/listings/' + listingId])
        expect((await call('get', path, third)).status).toBe(404);
    expect((await request(server).get('/api/listings/' + listingId)).status).toBe(404);
    expect((await message(third)).status).toBe(404); expect((await propose(third)).status).toBe(404);
    expect((await call('post', '/chat/conversations', third).send({ listingId })).status).toBe(404);
    expect(await prisma.conversation.count({ where: { listingId } })).toBe(1);
});

it('preserves the non-sale restriction when configuration is absent, malformed, or references another pair', async () => {
    for (const config of ['', '{bad json', JSON.stringify([{ conversationId: roomId, listingId, buyerUserId: third, sellerUserId: seller }])]) {
        process.env.PRIVATE_REVIEW_DEMO_ROOMS = config;
        expect((await message()).status).toBe(409); expect((await propose()).status).toBe(409);
        expect((await call('get', '/chat/conversations/' + roomId)).body.listingAvailable).toBe(false);
        expect((await call('post', '/chat/conversations').send({ listingId })).status).toBe(404);
    }
    expect(await prisma.message.count({ where: { conversationId: roomId } })).toBe(0);
});

it('revokes private listing detail access when the actual conversation is archived or membership is removed', async () => {
    expect((await call('get', '/listings/' + listingId)).status).toBe(200);
    await prisma.conversation.update({ where: { id: roomId }, data: { archivedAt: new Date() } });
    expect((await call('get', '/listings/' + listingId)).status).toBe(404);
    await prisma.conversation.update({ where: { id: roomId }, data: { archivedAt: null } });
    await prisma.conversationParticipant.delete({ where: { conversationId_userId: { conversationId: roomId, userId: buyer } } });
    expect((await call('get', '/listings/' + listingId)).status).toBe(404);
    expect((await call('get', '/listings/' + listingId, seller)).status).toBe(200);
});

it('keeps block enforcement, acknowledgement replay and archive protection intact', async () => {
    const key = randomUUID(); expect((await message(buyer, key)).status).toBe(201);
    expect((await call('post', '/chat/blocks/' + seller).send({})).status).toBe(200);
    expect((await message(buyer, key)).status).toBe(200);
    expect((await message()).status).toBe(403); expect((await message(seller)).status).toBe(403); expect((await propose()).status).toBe(403);
    await call('delete', '/chat/blocks/' + seller).send({});
    await prisma.conversation.update({ where: { id: roomId }, data: { archivedAt: new Date() } });
    expect((await message()).status).toBe(403); expect((await propose()).status).toBe(409);
});

it('keeps sample data out of discovery, public storefronts and anonymous or member interest counts even if its marker is damaged', async () => {
    await prisma.listing.update({ where: { id: listingId }, data: { title: 'malformed sample marker' } });
    const search = await call('get', '/listings?limit=100', third); expect(search.status).toBe(200);
    expect(search.body.items.some((l: { id: string }) => l.id === listingId)).toBe(false);
    const discovery=await call('get','/discovery?source=listing',third);expect(discovery.status).toBe(200);expect(discovery.body.items.some((l:{id:string})=>l.id===listingId)).toBe(false);
    const storefront = await call('get', '/storefronts/' + seller, third); expect(storefront.status).toBe(200); expect(storefront.body.items).toEqual([]);
    for (const viewer of [buyer, seller, third]) {
        const interest = await call('get', '/product-interest?keys=' + encodeURIComponent('listing:' + listingId), viewer);
        expect(interest.status).toBe(200); expect(interest.body.items).toEqual([]);
    }
    expect((await request(server).get('/api/product-interest').query({ keys: 'listing:' + listingId })).body.items).toEqual([]);
    expect((await call('get', '/listings/' + listingId, third)).status).toBe(404);
    expect((await message()).status).toBe(409); expect((await propose()).status).toBe(409);
});

it('prevents normal editing from stripping the explicit non-sale label', async () => {
    const changed = await call('patch', '/listings/' + listingId, seller).send({ expectedVersion: 1, title: 'looks like real goods' });
    expect(changed.status).toBe(400);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).title.startsWith('【QA測試非販售】')).toBe(true);
});

it('retains private photo authorization without generating provider notifications for synthetic activity', async () => {
    await prisma.pushDevice.create({ data: { id: randomUUID(), userId: seller, authVersion: 0, expoPushToken: 'ExponentPushToken[synthetic-review-only]', bindingId: randomUUID(), platform: 'android' } });
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#247a88' } }).jpeg().toBuffer();
    const photo = await call('post', '/chat/conversations/' + roomId + '/photo-messages').field('clientMessageId', randomUUID()).field('text', '合成照片').attach('photo', bytes, 'qa.jpg');
    expect(photo.status).toBe(201);
    const path = '/chat/conversations/' + roomId + '/messages/' + photo.body.id + '/photo';
    for (const id of [buyer, seller]) { const response = await call('get', path, id); expect(response.status).toBe(200); expect(response.headers['cache-control']).toContain('no-store'); }
    expect((await call('get', path, third)).status).toBe(404); expect((await request(server).get('/api' + path)).status).toBe(401);
    expect((await propose()).status).toBe(201);
    expect(await prisma.pushOutbox.count({ where: { userId: seller } })).toBe(0);
    delete process.env.PRIVATE_REVIEW_DEMO_ROOMS;
    await prisma.listing.update({ where: { id: listingId }, data: { title: '一般流程的隔離合成商品' } });
    expect((await message()).status).toBe(201);
    expect(await prisma.pushOutbox.count({ where: { userId: seller } })).toBe(1);
});
