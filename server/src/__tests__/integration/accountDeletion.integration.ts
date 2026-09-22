import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import userRoutes from '../../routes/userRoutes';
import { parseListingReport } from '../../lib/moderationRules';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'account-deletion-preview-integration-only', priorSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use('/api/users', userRoutes);
const server = createServer(app), users: number[] = [];
let owner: number, other: number, outsider: number, otherWish: number, ip = 0;
const token = (id: number, authVersion = 0) => jwt.sign({ id, authVersion }, secret, { algorithm: 'HS256' });
const preview = (id = owner, query = '', version = 0) => request(server).get('/api/users/me/deletion-impact' + query).set('Authorization', 'Bearer ' + token(id, version)).set('X-Forwarded-For', '192.0.2.' + ++ip);
beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    for (const role of ['owner', 'other', 'outsider']) users.push((await prisma.user.create({ data: { phoneNumber: 'deletion-preview-' + role + '-' + randomUUID(), password: 'synthetic-only', name: 'private-name', apiKey: 'synthetic-private-' + randomUUID(), address: 'private-address' } })).id);
    [owner, other, outsider] = users;
    const list = await prisma.wishlist.create({ data: { userId: owner, title: 'private-wishlist', items: { create: [{ name: 'own-one' }, { name: 'own-two', isHidden: true }] } } });
    otherWish = (await prisma.wishlist.create({ data: { userId: other, title: 'other-private-wishlist', items: { create: [{ name: 'other-private-item', purchasedById: owner, originalUserId: owner, isPurchased: true }] } } })).id;
    await prisma.wishCreateReceipt.create({ data: { userId: owner, clientRequestId: randomUUID(), requestHash: 'a'.repeat(64), kind: 'LIST', resourceId: list.id } });
    const listing = await prisma.listing.create({ data: { ownerUserId: owner, clientListingId: randomUUID(), requestHash: 'synthetic-only', title: 'private-listing', status: 'REMOVED' } });
    // Deliberately synthetic DB inventory, not native report/moderation UI QA.
    const otherListing = await prisma.listing.create({ data: { ownerUserId: other, clientListingId: randomUUID(), requestHash: 'synthetic-only', title: 'private-other-listing', status: 'REMOVED' } });
    for (const [reporterUserId, target] of [[owner, otherListing], [other, listing]] as const) {
        const input = parseListingReport({ clientReportId: randomUUID(), listingId: target.id, reason: 'FRAUD', details: 'private-report-evidence' });
        const report = await prisma.listingReport.create({ data: { reporterUserId, ...input } });
        await prisma.listingReportOperation.create({ data: { reporterUserId, clientReportId: input.clientReportId, requestHash: input.requestHash, state: 'RECEIVED', reportId: report.id } });
        await prisma.listingModerationAction.create({ data: { reportId: report.id, listingId: target.id, clientDecisionId: randomUUID(), requestHash: 'a'.repeat(64), decision: 'REMOVE_LISTING', notes: 'private-moderation-notes', actorKeyRef: 'synthetic-admin', expectedReportVersion: 1, expectedListingVersion: 1, listingStatusBefore: 'ACTIVE', listingVersionBefore: 1 } });
    }
    await prisma.listingReportOperation.create({ data: { reporterUserId: owner, clientReportId: randomUUID(), requestHash: 'b'.repeat(64), state: 'ABANDONED' } });
    await prisma.listingMedia.create({ data: { ownerUserId: owner, imageUrl: '/synthetic-image', thumbnailUrl: '/synthetic-thumb', contentHash: 'synthetic-only' } });
    const room = await prisma.conversation.create({ data: { listingId: listing.id, sellerUserId: owner, buyerUserId: other, participants: { create: [{ userId: owner, role: 'SELLER' }, { userId: other, role: 'BUYER' }] } } });
    for (const [senderUserId, sequence] of [[owner, 1], [other, 2]]) await prisma.message.create({ data: { conversationId: room.id, senderUserId, sequence, clientMessageId: randomUUID(), text: 'private-message' } });
    const startsAt = new Date(Date.now() + 3600000);
    await prisma.meetupAppointment.create({ data: { conversationId: room.id, proposedByUserId: owner, startsAt, endsAt: new Date(startsAt.getTime() + 3600000), placeName: 'private-meetup-place', latitude: 25.041, longitude: 121.551, notes: 'private-notes' } });
    await prisma.purchase.create({ data: { userId: owner, type: 'synthetic-purchase', amount: 100 } });
    await prisma.itemWatch.create({ data: { userId: owner, itemId: (await prisma.item.findFirstOrThrow({ where: { wishlistId: otherWish } })).id } });
    await prisma.follow.create({ data: { followerId: other, followingId: owner } });
    await prisma.userBlock.create({ data: { blockerUserId: owner, blockedUserId: other } });
    await prisma.feedback.create({ data: { userId: owner, content: 'private-feedback' } });
    await prisma.crawlerLog.create({ data: { userId: owner, url: 'https://example.invalid/private', errorMessage: 'private-crawler-error' } });
});
afterAll(async () => {
    try {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        if (users.length) await prisma.$transaction(async tx => {
            await tx.conversation.deleteMany({ where: { OR: [{ buyerUserId: { in: users } }, { sellerUserId: { in: users } }] } });
            await tx.purchase.deleteMany({ where: { userId: { in: users } } });
            await tx.feedback.deleteMany({ where: { userId: { in: users } } });
            await tx.crawlerLog.deleteMany({ where: { userId: { in: users } } });
            await tx.follow.deleteMany({ where: { OR: [{ followerId: { in: users } }, { followingId: { in: users } }] } });
            // Clear both fixture owners' wishlists before a multi-user deletion:
            // cross-owner Item SET NULL actions can otherwise race the Wishlist
            // cascade within that same statement. This is fixture cleanup only,
            // not an implementation of production account erasure.
            await tx.wishlist.deleteMany({ where: { userId: { in: users } } });
            await tx.user.deleteMany({ where: { id: { in: users } } });
        });
    } finally {
        try { await prisma.$disconnect(); }
        finally { if (priorSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = priorSecret; }
    }
});
describe('read-only account deletion impact / actual routers and isolated PostgreSQL', () => {
    it('requires authentication', async () => expect((await request(server).get('/api/users/me/deletion-impact')).status).toBe(401));
    it('counts own data and shared dependencies without exposing content or deleting anything', async () => {
        const res = await preview(); expect(res.status).toBe(200); expect(res.headers['cache-control']).toBe('private, no-store');
        expect(res.body).toMatchObject({ version: 2, previewOnly: true, accountDeleted: false, counts: {
            wishlists: 1, wishes: 2, wishCreateReceipts: 1, listings: 1, uploadedPhotos: 1, conversations: 1,
            messagesAuthored: 1, otherMessagesInSharedConversations: 1, meetupAppointments: 1, upcomingMeetupAppointments: 1,
            purchaseRecords: 1, giftClaimsInOtherWishlists: 1, originalCreditsInOtherWishlists: 1, itemWatches: 1,
            followRelationships: 1, blockRelationships: 1, feedbackRecords: 1, crawlerRecords: 1,
            reportsAuthored: 1, reportOperationReceipts: 2, reportsOnOwnedListings: 1, moderationActionsOnOwnedListings: 1, moderationActionsDetachingOwnReports: 1,
        } });
        expect(Number.isFinite(Date.parse(res.body.capturedAt))).toBe(true);
        expect(Object.keys(res.body).sort()).toEqual(['accountDeleted', 'capturedAt', 'counts', 'previewOnly', 'version']);
        expect(Object.keys(res.body.counts)).toHaveLength(23);
        expect(JSON.stringify(res.body)).not.toMatch(/private-|latitude|longitude|password|apiKey|token|userId/);
        expect(await prisma.user.count({ where: { id: { in: users } } })).toBe(3);
        expect(await prisma.message.count({ where: { senderUserId: { in: users } } })).toBe(2);
        expect((await prisma.item.findFirstOrThrow({ where: { wishlistId: otherWish } })).isPurchased).toBe(true);
        expect(await prisma.purchase.count({ where: { userId: owner } })).toBe(1);
    });
    it('derives the target only from the authenticated identity', async () => {
        const res = await preview(outsider); expect(res.status).toBe(200);
        expect(Object.values(res.body.counts).every(count => count === 0)).toBe(true);
        const counterpart = await preview(other); expect(counterpart.body.counts).toMatchObject({ wishlists: 1, wishes: 1, listings: 1, purchaseRecords: 0, messagesAuthored: 1, otherMessagesInSharedConversations: 1, reportsAuthored: 1, reportOperationReceipts: 1, reportsOnOwnedListings: 1 });
    });
    it.each(['?userId=1', '?include=credentials', '?cursor=1', '?userId=1&userId=2'])('rejects injected preview filters %s', async query => expect((await preview(owner, query)).status).toBe(400));
    it('rejects a revoked session rather than returning a preview', async () => {
        await prisma.user.update({ where: { id: outsider }, data: { authVersion: 1 } });
        expect((await preview(outsider)).status).toBe(401); expect((await preview(outsider, '', 1)).status).toBe(200);
    });
});
