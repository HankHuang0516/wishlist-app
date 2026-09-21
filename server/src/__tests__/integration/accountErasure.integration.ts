import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import prisma from '../../lib/prisma';
import chatRoutes from '../../routes/chatRoutes';
import userRoutes from '../../routes/userRoutes';
import { eraseAccountData, erasureIdentityHash, drainMediaErasureTasks, readAccountErasureReceipt } from '../../lib/accountErasure';
import { ListingMediaStorage } from '../../lib/listingMediaStorage';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'account-erasure-integration-only', password = 'SyntheticPass123';
const priorSecret = process.env.JWT_SECRET, priorRoot = process.env.LISTING_MEDIA_STORAGE_ROOT;
process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use('/api/chat', chatRoutes); app.use('/api/users', userRoutes);
const server = createServer(app), storage = new ListingMediaStorage();
const users: number[] = [], rooms: string[] = [], media: string[] = [], purchases: number[] = [], identities: string[] = [];
let rejectReceiptFor: string | null = null;
// Test-client middleware only. All preceding DELETEs run on real PostgreSQL
// inside the same transaction; an unavailable final persistence rolls them back.
prisma.$use(async (params, next) => {
    if (rejectReceiptFor && params.model === 'AccountErasureReceipt' && params.action === 'create' && params.args?.data?.identityHash === rejectReceiptFor) throw new Error('Synthetic durable receipt persistence unavailable');
    return next(params);
});
let root: string, owner: number, other: number, room: string, ownedListing: string, otherListing: string, otherWish: number, ownMedia: string, otherMedia: string, purchaseId: number, action: string, oldApiKey: string;
const call = (method: 'get' | 'post', suffix: string, id = other) => request(server)[method](suffix).set('Authorization', 'Bearer ' + jwt.sign({ id, authVersion: 0 }, secret, { algorithm: 'HS256' }));
const erase = () => eraseAccountData(owner, 0, password, action);
beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wishlist-owned-erasure-'));
    process.env.LISTING_MEDIA_STORAGE_ROOT = root;
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
});
beforeEach(async () => {
    const hash = await bcrypt.hash(password, 4);
    const run = randomUUID();
    oldApiKey = 'synthetic-key-' + run;
    owner = (await prisma.user.create({ data: { phoneNumber: 'erasure-core-owner-' + run, password: hash, name: 'erased-private-name', apiKey: oldApiKey, passwordResetToken: 'synthetic-reset-' + run } })).id;
    other = (await prisma.user.create({ data: { phoneNumber: 'erasure-core-other-' + run, password: hash, name: 'surviving-other' } })).id;
    users.push(owner, other); identities.push(erasureIdentityHash(owner, 0)); action = randomUUID();
    const data = { clientListingId: randomUUID(), requestHash: 'synthetic', title: 'synthetic-listing', status: 'ACTIVE' as const, publishedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000), deliveryMethods: ['MEETUP' as const] };
    ownedListing = (await prisma.listing.create({ data: { ...data, ownerUserId: owner } })).id;
    otherListing = (await prisma.listing.create({ data: { ...data, clientListingId: randomUUID(), ownerUserId: other } })).id;
    room = (await prisma.conversation.create({ data: { listingId: ownedListing, buyerUserId: other, sellerUserId: owner, lastMessageSequence: 2, participants: { create: [{ userId: owner, role: 'SELLER' }, { userId: other, role: 'BUYER' }] } } })).id; rooms.push(room);
    for (const [id, sequence, text] of [[owner, 1, 'erased-private-message'], [other, 2, 'surviving-authored-message']] as const) await prisma.message.create({ data: { conversationId: room, senderUserId: id, sequence, clientMessageId: randomUUID(), text } });
    const startsAt = new Date(Date.now() + 3600000);
    await prisma.meetupAppointment.create({ data: { conversationId: room, proposedByUserId: other, startsAt, endsAt: new Date(startsAt.getTime() + 3600000), placeName: 'erased-private-place', latitude: 25.04123, longitude: 121.55321, notes: 'erased-private-notes' } });
    const list = await prisma.wishlist.create({ data: { userId: owner, title: 'erased-private-list', items: { create: [{ name: 'own-private-wish' }] } } });
    await prisma.wishCreateReceipt.create({ data: { userId: owner, clientRequestId: randomUUID(), requestHash: 'a'.repeat(64), kind: 'LIST', resourceId: list.id } });
    otherWish = (await prisma.wishlist.create({ data: { userId: other, title: 'surviving-list', items: { create: [{ name: 'surviving-wish', originalUserId: owner, purchasedById: owner, isPurchased: true }] } } })).id;
    purchaseId = (await prisma.purchase.create({ data: { userId: owner, amount: 123, currency: 'TWD', type: 'synthetic-ledger' } })).id; purchases.push(purchaseId);
    for (const id of [owner, other]) {
        const photo = (await prisma.listingMedia.create({ data: { ownerUserId: id, imageUrl: '/synthetic-image', thumbnailUrl: '/synthetic-thumb', contentHash: 'synthetic' } })).id;
        media.push(photo); await storage.write(photo, Buffer.from('owned-synthetic-image'), Buffer.from('owned-synthetic-thumb'));
        if (id === owner) ownMedia = photo; else otherMedia = photo;
    }
    await prisma.follow.create({ data: { followerId: other, followingId: owner } });
    await prisma.userBlock.create({ data: { blockerUserId: owner, blockedUserId: other } });
    await prisma.feedback.create({ data: { userId: owner, content: 'erased-private-feedback' } });
    await prisma.crawlerLog.create({ data: { userId: owner, url: 'https://example.invalid/private', errorMessage: 'erased-private-crawler' } });
});
afterAll(async () => {
    try {
        if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await prisma.$transaction(async tx => {
            await tx.conversation.deleteMany({ where: { id: { in: rooms } } });
            await tx.purchase.deleteMany({ where: { id: { in: purchases } } });
            await tx.feedback.deleteMany({ where: { userId: { in: users } } });
            await tx.crawlerLog.deleteMany({ where: { userId: { in: users } } });
            await tx.follow.deleteMany({ where: { OR: [{ followerId: { in: users } }, { followingId: { in: users } }] } });
            await tx.wishlist.deleteMany({ where: { userId: { in: users } } });
            await tx.user.deleteMany({ where: { id: { in: users } } });
            await tx.mediaErasureTask.deleteMany({ where: { mediaId: { in: media } } });
            await tx.legacyAssetErasureTask.deleteMany({ where: { identityHash: { in: identities } } });
            await tx.accountErasureReceipt.deleteMany({ where: { identityHash: { in: identities } } });
        });
        for (const id of media) await storage.remove(id);
        if (root) await fs.rmdir(root);
    } finally {
        await prisma.$disconnect();
        if (priorSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = priorSecret;
        if (priorRoot === undefined) delete process.env.LISTING_MEDIA_STORAGE_ROOT; else process.env.LISTING_MEDIA_STORAGE_ROOT = priorRoot;
    }
});
describe('physical account erasure core / real PostgreSQL and private files', () => {
    it('requires fresh exact password and performs no writes on rejection', async () => {
        await expect(eraseAccountData(owner, 0, password + ' ', action)).rejects.toMatchObject({ status: 401 });
        expect(await prisma.user.count({ where: { id: owner } })).toBe(1);
        expect(await prisma.accountErasureReceipt.count({ where: { identityHash: erasureIdentityHash(owner, 0) } })).toBe(0);
        expect(await prisma.mediaErasureTask.count({ where: { mediaId: ownMedia } })).toBe(0);
        expect(await prisma.message.count({ where: { conversationId: room } })).toBe(2);
    });
    it('rejects a revoked session even with the correct current password', async () => {
        await prisma.user.update({ where: { id: owner }, data: { authVersion: 1 } });
        await expect(erase()).rejects.toMatchObject({ status: 401 });
        expect(await prisma.user.count({ where: { id: owner } })).toBe(1);
    });
    it('physically erases its own data, preserves others, detaches ledger and invalidates old auth', async () => {
        const result = await erase(); expect(result).toMatchObject({ accountDeleted: true, photoCleanupPending: 1 });
        expect(await prisma.user.findUnique({ where: { id: owner } })).toBeNull();
        expect(await prisma.wishlist.count({ where: { userId: owner } })).toBe(0);
        expect(await prisma.wishCreateReceipt.count({ where: { userId: owner } })).toBe(0);
        expect(await prisma.listing.findUnique({ where: { id: ownedListing } })).toBeNull();
        expect(await prisma.listingMedia.findUnique({ where: { id: ownMedia } })).toBeNull();
        expect(await prisma.meetupAppointment.count({ where: { conversationId: room } })).toBe(0);
        expect(await prisma.feedback.count({ where: { userId: owner } })).toBe(0);
        expect(await prisma.crawlerLog.count({ where: { userId: owner } })).toBe(0);
        expect(await prisma.conversation.findUnique({ where: { id: room } })).toMatchObject({ sellerUserId: null, buyerUserId: other, listingId: null, archivedAt: expect.any(Date) });
        expect(await prisma.message.findMany({ where: { conversationId: room }, select: { senderUserId: true, text: true } })).toEqual([{ senderUserId: other, text: 'surviving-authored-message' }]);
        expect(await prisma.purchase.findUnique({ where: { id: purchaseId } })).toMatchObject({ userId: null, amount: 123, currency: 'TWD', type: 'synthetic-ledger' });
        expect(await prisma.item.findFirstOrThrow({ where: { wishlistId: otherWish } })).toMatchObject({ originalUserId: null, purchasedById: null, isPurchased: false, name: 'surviving-wish' });
        expect(await prisma.listing.findUnique({ where: { id: otherListing } })).not.toBeNull();
        expect((await call('get', '/api/users/me', owner)).status).toBe(401);
        expect((await request(server).get('/api/users/me').set('x-api-key', oldApiKey)).status).toBe(401);
        await expect(prisma.wishlist.create({ data: { userId: owner, title: 'delayed-resurrection' } })).rejects.toMatchObject({ code: 'P2003' });
    });
    it('allows the survivor to read only surviving history, never send, book or expose the erased identity', async () => {
        await erase(); const roomRes = await call('get', '/api/chat/conversations/' + room);
        expect(roomRes.status).toBe(200); expect(roomRes.body).toMatchObject({ archived: true, seller: null, sellerUserId: null, listing: null, listingAvailable: false });
        expect(JSON.stringify(roomRes.body)).not.toMatch(/erased-private|latitude|longitude|password|apiKey/);
        const messagesRes = await call('get', '/api/chat/conversations/' + room + '/messages');
        expect(messagesRes.status).toBe(200); expect(messagesRes.body.items.map((m: { text: string }) => m.text)).toEqual(['surviving-authored-message']);
        expect((await call('post', '/api/chat/conversations/' + room + '/messages').send({ clientMessageId: randomUUID(), text: 'cannot-send' })).status).toBe(403);
        expect((await call('get', '/api/chat/conversations/' + room + '/meetup')).status).toBe(409);
        expect((await call('post', '/api/chat/conversations/' + room + '/read').send({ throughSequence: 2 })).status).toBe(200);
        expect((await call('get', '/api/chat/conversations')).body.items.find((r: { id: string }) => r.id === room)).toMatchObject({ archived: true });
    });
    it('also erases a buyer without deleting the seller or seller listing', async () => {
        const buyerRoom = (await prisma.conversation.create({ data: { listingId: otherListing, buyerUserId: owner, sellerUserId: other, participants: { create: [{ userId: owner, role: 'BUYER' }, { userId: other, role: 'SELLER' }] } } })).id; rooms.push(buyerRoom);
        await erase(); expect(await prisma.conversation.findUnique({ where: { id: buyerRoom } })).toMatchObject({ buyerUserId: null, sellerUserId: other });
        expect(await prisma.listing.findUnique({ where: { id: otherListing } })).not.toBeNull();
        expect((await call('get', '/api/chat/conversations/' + buyerRoom)).status).toBe(200);
    });
    it('rolls back all erasure writes if the final durable receipt cannot commit', async () => {
        rejectReceiptFor = erasureIdentityHash(owner, 0);
        try { await expect(erase()).rejects.toThrow(); }
        finally { rejectReceiptFor = null; }
        expect(await prisma.user.findUnique({ where: { id: owner } })).not.toBeNull();
        expect(await prisma.message.count({ where: { conversationId: room } })).toBe(2);
        expect(await prisma.mediaErasureTask.count({ where: { mediaId: ownMedia } })).toBe(0);
        expect(await prisma.purchase.findUnique({ where: { id: purchaseId } })).toMatchObject({ userId: owner });
    });
    it('keeps failed physical cleanup durable, then removes only erased UUID files on retry', async () => {
        await erase();
        const failing = new ListingMediaStorage(); failing.remove = async () => { throw new Error('synthetic storage interruption'); };
        await drainMediaErasureTasks(100, failing);
        expect(await prisma.mediaErasureTask.findUnique({ where: { mediaId: ownMedia } })).toMatchObject({ attempts: 1 });
        expect(await fs.stat(path.join(root, ownMedia, 'image.webp'))).toBeDefined();
        await drainMediaErasureTasks(100, storage);
        expect(await prisma.mediaErasureTask.findUnique({ where: { mediaId: ownMedia } })).toBeNull();
        await expect(fs.stat(path.join(root, ownMedia))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await fs.readFile(path.join(root, otherMedia, 'image.webp'), 'utf8')).toBe('owned-synthetic-image');
    });
    it('refuses to drain a mistakenly queued still-owned photo', async () => {
        await prisma.mediaErasureTask.create({ data: { mediaId: ownMedia } });
        await drainMediaErasureTasks(100, storage);
        expect(await prisma.mediaErasureTask.findUnique({ where: { mediaId: ownMedia } })).not.toBeNull();
        expect(await fs.readFile(path.join(root, ownMedia, 'image.webp'), 'utf8')).toBe('owned-synthetic-image');
    });
    it('binds a lost-response receipt to the exact original identity/version and operation only', async () => {
        await erase(); expect(await readAccountErasureReceipt(owner, 0, action)).toMatchObject({ accountDeleted: true, erasedAt: expect.any(String) });
        expect(await readAccountErasureReceipt(other, 0, action)).toBeNull();
        expect(await readAccountErasureReceipt(owner, 1, action)).toBeNull();
        expect(await readAccountErasureReceipt(owner, 0, randomUUID())).toBeNull();
        expect(JSON.stringify(await readAccountErasureReceipt(owner, 0, action))).not.toMatch(/password|identityHash|userId|private/);
    });
    it('serializes an in-flight own send against erasure without message resurrection', async () => {
        await prisma.userBlock.deleteMany({ where: { blockerUserId: owner } });
        const [result, send] = await Promise.all([erase(), call('post', '/api/chat/conversations/' + room + '/messages', owner).send({ clientMessageId: randomUUID(), text: 'in-flight-private-message' })]);
        expect(result.accountDeleted).toBe(true); expect([201, 401, 403, 404]).toContain(send.status);
        expect(await prisma.message.count({ where: { senderUserId: owner } })).toBe(0);
        expect(await prisma.message.count({ where: { conversationId: room, senderUserId: other } })).toBe(1);
    });
    it('cannot miss a concurrently opened unknown pair behind its member gate', async () => {
        const third = (await prisma.user.create({ data: { phoneNumber: 'erasure-core-third-' + randomUUID(), password: 'synthetic-only' } })).id; users.push(third);
        const [result, opened] = await Promise.all([erase(), call('post', '/api/chat/conversations', third).send({ listingId: ownedListing })]);
        expect(result.accountDeleted).toBe(true); expect([201, 404]).toContain(opened.status);
        if (opened.status === 201) {
            rooms.push(opened.body.id);
            expect(await prisma.conversation.findUnique({ where: { id: opened.body.id } })).toMatchObject({ archivedAt: expect.any(Date), sellerUserId: null, listingId: null });
        }
        expect(await prisma.conversation.count({ where: { sellerUserId: owner } })).toBe(0);
    });
    it('preserves a survivor until they too erase, then removes the final empty room', async () => {
        await erase(); expect(await prisma.message.count({ where: { conversationId: room } })).toBe(1);
        identities.push(erasureIdentityHash(other, 0));
        await eraseAccountData(other, 0, password, randomUUID());
        expect(await prisma.conversation.findUnique({ where: { id: room } })).toBeNull();
        expect(await prisma.message.count({ where: { conversationId: room } })).toBe(0);
    });
});
