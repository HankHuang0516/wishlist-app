import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import prisma from '../../lib/prisma';
import chatRoutes from '../../routes/chatRoutes';
import listingRoutes from '../../routes/listingRoutes';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Explicit isolated DB required');
const secret = 'meetup-integration-only-not-production'; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use('/api/chat', chatRoutes); app.use('/api/listings', listingRoutes);
// Own a persistent loopback transport; do not reopen/close the HTTP listener
// for every request during concurrent appointment mutations.
const server = createServer(app);
let seller: number, buyer: number, third: number, listingId: string, room: string, ip = 1;
const call = (method: 'get' | 'post' | 'delete', path: string, userId = buyer) => request(server)[method]('/api/chat' + path).set('Authorization', 'Bearer ' + jwt.sign({ id: userId }, secret, { algorithm: 'HS256' })).set('X-Forwarded-For', '192.0.2.' + (ip++ % 250 + 1));
const t = (offset = 0) => ({ startsAt: new Date(Date.now() + 86400000 + offset).toISOString(), durationMinutes: 60, timeZone: 'Asia/Taipei', placeName: '合成面交站', latitude: 25.04735, longitude: 121.51731, notes: '合成私密東門' });
const act = (action: string, version = 1, userId = buyer, terms?: ReturnType<typeof t>, clientActionId = randomUUID(), roomId = room) => call('post', '/conversations/' + roomId + '/meetup', userId).send({ clientActionId, action, expectedVersion: version, ...(terms ? { terms } : {}) });
const propose = (terms = t(), userId = buyer) => act('PROPOSE', 0, userId, terms);
beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    const run = randomUUID(); const users = await Promise.all(['seller', 'buyer', 'third'].map(role => prisma.user.create({ data: { phoneNumber: `meetup-test-${run}-${role}`, password: 'synthetic-only', name: role }, select: { id: true } }))); [seller, buyer, third] = users.map(u => u.id);
});
beforeEach(async () => {
    await prisma.conversation.deleteMany({ where: { OR: [{ buyerUserId: { in: [seller, buyer, third] } }, { sellerUserId: { in: [seller, buyer, third] } }] } });
    await prisma.listing.deleteMany({ where: { ownerUserId: seller } }); await prisma.userBlock.deleteMany({ where: { blockerUserId: { in: [seller, buyer, third] } } });
    listingId = (await prisma.listing.create({ data: { ownerUserId: seller, clientListingId: randomUUID(), requestHash: 'synthetic-only', title: '合成面交商品', status: 'ACTIVE', publishedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000), deliveryMethods: ['MEETUP'] } })).id;
    room = (await call('post', '/conversations').send({ listingId })).body.id;
});
afterAll(async () => {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (seller) {
        await prisma.conversation.deleteMany({ where: { OR: [{ buyerUserId: { in: [seller, buyer, third] } }, { sellerUserId: { in: [seller, buyer, third] } }] } });
        await prisma.user.deleteMany({ where: { id: { in: [seller, buyer, third] } } });
    }
    await prisma.$disconnect();
});
describe('private meetup / real HTTP and PostgreSQL', () => {
    it('requires auth and actual membership for reads and mutations', async () => {
        expect((await request(server).get('/api/chat/conversations/' + room + '/meetup')).status).toBe(401);
        expect((await call('get', '/conversations/' + room + '/meetup', third)).status).toBe(404); expect((await act('PROPOSE', 0, third, t())).status).toBe(404);
        expect((await call('get', '/conversations/' + room + '/meetup')).body.appointment).toBeNull();
    });
    it('needs two parties agreeing to EXACT same version, without automatically reserving the listing', async () => {
        const proposed = await propose(); expect(proposed.status).toBe(201); expect(proposed.body.appointment).toMatchObject({ status: 'PROPOSED', version: 1, proposedByUserId: buyer, sellerConfirmedAt: null }); expect(proposed.body.appointment.buyerConfirmedAt).not.toBeNull();
        expect((await act('CONFIRM')).body.appointment.status).toBe('PROPOSED');
        const confirmed = await act('CONFIRM', 1, seller); expect(confirmed.body.appointment.status).toBe('CONFIRMED'); expect(confirmed.body.appointment.sellerConfirmedAt).not.toBeNull();
        expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('ACTIVE');
    });
    it('resets confirmations on revised terms and rejects stale-version consent', async () => {
        await propose(); await act('CONFIRM', 1, seller); const revised = await act('REVISE', 1, seller, t(3600000));
        expect(revised.body.appointment).toMatchObject({ version: 2, status: 'PROPOSED', buyerConfirmedAt: null, proposedByUserId: seller });
        expect((await act('CONFIRM', 1)).body.errorCode).toBe('MEETUP_VERSION_CONFLICT'); expect((await act('CONFIRM', 2)).body.appointment.status).toBe('CONFIRMED');
    });
    it('deduplicates ten concurrent same-key proposals and preserves a retry receipt after later edits', async () => {
        const terms = t(), key = randomUUID(); const results = await Promise.all(Array.from({ length: 10 }, () => act('PROPOSE', 0, buyer, terms, key)));
        expect(results.filter(r => r.status === 201)).toHaveLength(1); expect(results.filter(r => r.status === 200)).toHaveLength(9); expect(new Set(results.map(r => r.body.appointment.id)).size).toBe(1);
        await act('REVISE', 1, seller, t(3600000)); const retry = await act('PROPOSE', 0, buyer, terms, key); expect(retry.status).toBe(200); expect(retry.body).toMatchObject({ appointment: { version: 2, status: 'PROPOSED' }, receipt: { resultingVersion: 1 }, replayed: true });
        expect((await act('PROPOSE', 0, buyer, { ...terms, notes: '不同條件' }, key)).body.errorCode).toBe('MEETUP_ACTION_CONFLICT');
    });
    it('allows only one of distinct concurrent edits of the same version to commit', async () => {
        await propose(); const results = await Promise.all([act('REVISE', 1, buyer, t(3600000)), act('REVISE', 1, seller, t(7200000))]); expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect((await prisma.meetupAppointment.findUniqueOrThrow({ where: { conversationId: room } })).version).toBe(2);
    });
    it('keeps exact meeting terms private from public listing detail/search and outsider chat access', async () => {
        const proposal = await propose(); expect(proposal.body.appointment).toMatchObject({ latitude: 25.04735, longitude: 121.51731, placeName: '合成面交站' });
        const detail = await request(server).get('/api/listings/' + listingId); const search = await request(server).get('/api/listings');
        expect(detail.status).toBe(200); expect(search.status).toBe(200); expect(detail.body.id).toBe(listingId); expect(search.body.items.map((item: { id: string }) => item.id)).toContain(listingId);
        for (const body of [detail.body, search.body]) { const json = JSON.stringify(body); expect(json).not.toContain('25.04735'); expect(json).not.toContain('合成私密東門'); expect(json).not.toContain('合成面交站'); }
        expect((await call('get', '/conversations/' + room + '/meetup', third)).status).toBe(404); expect((await call('get', '/conversations/' + room)).body).not.toHaveProperty('meetup');
        expect((await call('get', '/conversations/' + room + '/meetup')).headers['cache-control']).toBe('private, no-store');
    });
    it('blocks proposal/revision/confirmation but always permits cancellation after blocking or removal', async () => {
        await propose(); await call('post', '/blocks/' + buyer, seller).send({});
        expect((await act('CONFIRM', 1, seller)).status).toBe(403); expect((await act('REVISE', 1, buyer, t())).status).toBe(403);
        await prisma.listing.update({ where: { id: listingId }, data: { status: 'REMOVED' } }); expect((await act('CANCEL', 1, buyer)).body.appointment.status).toBe('CANCELLED');
        expect((await act('CONFIRM', 1, seller)).body.errorCode).toBe('MEETUP_STATE_CONFLICT'); expect((await call('get', '/conversations/' + room + '/meetup', seller)).status).toBe(200);
    });
    it('rejects invalid times and non-meetup/stopped listings without creating records', async () => {
        expect((await propose({ ...t(), startsAt: new Date(Date.now() - 1).toISOString() })).status).toBe(400);
        expect((await propose({ ...t(), startsAt: new Date(Date.now() + 366 * 86400000).toISOString() })).status).toBe(400);
        await prisma.listing.update({ where: { id: listingId }, data: { deliveryMethods: ['SHIPPING'] } }); expect((await propose()).body.errorCode).toBe('MEETUP_NOT_SUPPORTED');
        await prisma.listing.update({ where: { id: listingId }, data: { status: 'SOLD' } }); expect((await propose()).body.errorCode).toBe('MEETUP_LISTING_UNAVAILABLE'); expect(await prisma.meetupAppointment.count({ where: { conversationId: room } })).toBe(0);
    });
    it('does not complete early or pretend that one user’s report means both completed', async () => {
        await propose(); expect((await act('COMPLETE')).status).toBe(409); await act('CONFIRM', 1, seller); expect((await act('COMPLETE')).status).toBe(409);
        await prisma.meetupAppointment.update({ where: { conversationId: room }, data: { startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() - 1) } });
        const one = await act('COMPLETE'); expect(one.body.appointment).toMatchObject({ status: 'CONFIRMED', sellerCompletedAt: null });
        expect((await act('COMPLETE', 1, seller)).body.appointment.status).toBe('COMPLETED'); expect((await act('REVISE', 1, seller, t())).status).toBe(409); expect((await act('CANCEL')).status).toBe(409);
    });
    it('allows explicit re-proposal after cancellation only as a new unconfirmed version', async () => {
        await propose(); await act('CANCEL'); const revised = await act('REVISE', 1, seller, t()); expect(revised.body.appointment).toMatchObject({ version: 2, status: 'PROPOSED', buyerConfirmedAt: null });
    });
    it('serializes shared-user conflicts across DIFFERENT buyer/seller pairs', async () => {
        const terms = t(); await propose(terms);
        const secondRoom = (await call('post', '/conversations', third).send({ listingId })).body.id;
        expect((await act('PROPOSE', 0, third, terms, randomUUID(), secondRoom)).status).toBe(201);
        const results = await Promise.all([act('CONFIRM', 1, seller), act('CONFIRM', 1, seller, undefined, randomUUID(), secondRoom)]);
        expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect(results.find(r => r.status === 409)!.body.errorCode).toBe('MEETUP_TIME_CONFLICT');
        expect(await prisma.meetupAppointment.count({ where: { conversationId: { in: [room, secondRoom] }, status: 'CONFIRMED' } })).toBe(1);
        const winner = results[0].status === 201 ? room : secondRoom; await act('CANCEL', 1, seller, undefined, randomUUID(), winner);
        const loser = winner === room ? secondRoom : room; expect((await act('CONFIRM', 1, seller, undefined, randomUUID(), loser)).status).toBe(201);
    });
    it('rejects party spoofing, invalid versions and outsider DB inserts', async () => {
        const input = { clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: t() };
        expect((await call('post', '/conversations/' + room + '/meetup').send({ ...input, sellerUserId: third })).status).toBe(400);
        expect((await act('CONFIRM', 0)).status).toBe(400); await propose();
        await expect(prisma.meetupOperation.create({ data: { conversationId: room, actorUserId: third, clientActionId: randomUUID(), requestHash: 'synthetic', action: 'CONFIRM', resultingVersion: 1 } })).rejects.toThrow();
        await expect(prisma.meetupAppointment.update({ where: { conversationId: room }, data: { proposedByUserId: third } })).rejects.toThrow();
    });
    it('atomically abandons an uncommitted action and rejects a delayed original even after unblocking', async () => {
        const input = { clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: t() };
        await call('post', '/blocks/' + buyer, seller).send({});
        const abandoned = await call('post', '/conversations/' + room + '/meetup/abandon').send(input); expect(abandoned.status).toBe(200); expect(abandoned.body).toMatchObject({ appointment: null, receipt: { abandoned: true, resultingVersion: 0 } });
        await call('delete', '/blocks/' + buyer, seller).send({});
        const late = await call('post', '/conversations/' + room + '/meetup').send(input); expect(late.body.receipt.abandoned).toBe(true); expect(await prisma.meetupAppointment.count({ where: { conversationId: room } })).toBe(0);
        expect((await call('post', '/conversations/' + room + '/meetup/abandon', third).send(input)).status).toBe(404);
        expect((await call('post', '/conversations/' + room + '/meetup/abandon').send({ ...input, terms: { ...input.terms, notes: 'different' } })).status).toBe(409);
        expect((await propose()).status).toBe(201);
    });
    it('acknowledges an already committed operation instead of silently cancelling the actual appointment', async () => {
        const input = { clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: t() };
        await call('post', '/conversations/' + room + '/meetup').send(input);
        const abandon = await call('post', '/conversations/' + room + '/meetup/abandon').send(input); expect(abandon.body).toMatchObject({ appointment: { status: 'PROPOSED', version: 1 }, receipt: { abandoned: false, resultingVersion: 1 } });
        expect((await prisma.meetupAppointment.findUniqueOrThrow({ where: { conversationId: room } })).status).toBe('PROPOSED');
    });
    it('serializes abandon versus a racing original, so exactly one outcome is durable', async () => {
        const input = { clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: t() };
        const result = await Promise.all([call('post', '/conversations/' + room + '/meetup').send(input), call('post', '/conversations/' + room + '/meetup/abandon').send(input)]);
        expect([200, 201]).toContain(result[0].status); expect(result[1].status).toBe(200);
        const receipt = await prisma.meetupOperation.findUniqueOrThrow({ where: { conversationId_actorUserId_clientActionId: { conversationId: room, actorUserId: buyer, clientActionId: input.clientActionId } } });
        expect(await prisma.meetupAppointment.count({ where: { conversationId: room } })).toBe(receipt.abandoned ? 0 : 1);
        const retry = await call('post', '/conversations/' + room + '/meetup').send(input); expect(retry.body.receipt.abandoned).toBe(receipt.abandoned); expect(await prisma.meetupOperation.count({ where: { conversationId: room } })).toBe(1);
    });
    it('handles seller proposals, named locations without GPS and repeated confirmation without resetting consent', async () => {
        const { latitude, longitude, ...terms } = t(); const input = { clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms };
        const proposed = await call('post', '/conversations/' + room + '/meetup', seller).send(input); expect(proposed.body.appointment).toMatchObject({ proposedByUserId: seller, buyerConfirmedAt: null, latitude: null, longitude: null });
        await act('CONFIRM'); const before = (await call('get', '/conversations/' + room + '/meetup')).body.appointment;
        await act('CONFIRM', 1, seller); await act('CONFIRM'); const after = (await call('get', '/conversations/' + room + '/meetup')).body.appointment;
        expect(after.buyerConfirmedAt).toBe(before.buyerConfirmedAt); expect(after.sellerConfirmedAt).toBe(before.sellerConfirmedAt); expect(after.status).toBe('CONFIRMED');
    });
    it('allows seller-first completion and keeps the initial completion timestamp on an identical user report', async () => {
        await propose(); await act('CONFIRM', 1, seller);
        await prisma.meetupAppointment.update({ where: { conversationId: room }, data: { startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() - 1) } });
        const first = await act('COMPLETE', 1, seller); const again = await act('COMPLETE', 1, seller); expect(again.body.appointment.sellerCompletedAt).toBe(first.body.appointment.sellerCompletedAt); expect(again.body.appointment.buyerCompletedAt).toBeNull();
        expect((await act('COMPLETE')).body.appointment.status).toBe('COMPLETED');
    });
    it('keeps abandonment idempotent and rejects altered content after a committed action', async () => {
        const input = { clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: t() };
        await call('post', '/conversations/' + room + '/meetup/abandon').send(input);
        expect((await call('post', '/conversations/' + room + '/meetup/abandon').send(input)).body).toMatchObject({ replayed: true, receipt: { abandoned: true } });
        expect((await call('get', '/conversations/not-a-uuid/meetup')).status).toBe(400);
        expect((await call('get', '/conversations/' + randomUUID() + '/meetup')).status).toBe(404);
        expect((await request(server).post('/api/chat/conversations/' + room + '/meetup/abandon').send(input)).status).toBe(401);
    });
    it('permits adjacent meetings but rejects overlapping proposals with another confirmed pair', async () => {
        const terms = t(); await propose(terms); await act('CONFIRM', 1, seller);
        const secondRoom = (await call('post', '/conversations', third).send({ listingId })).body.id;
        expect((await act('PROPOSE', 0, third, terms, randomUUID(), secondRoom)).body.errorCode).toBe('MEETUP_TIME_CONFLICT');
        const adjacent = { ...terms, startsAt: new Date(Date.parse(terms.startsAt) + 3600000).toISOString() };
        expect((await act('PROPOSE', 0, third, adjacent, randomUUID(), secondRoom)).status).toBe(201);
        expect((await act('CONFIRM', 1, seller, undefined, randomUUID(), secondRoom)).body.appointment.status).toBe('CONFIRMED');
    });
});
