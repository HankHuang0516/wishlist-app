/** Real authenticated HTTP + private PostgreSQL; no production credential. */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import prisma from '../../lib/prisma';
import listingRoutes from '../../routes/listingRoutes';
import chatRoutes from '../../routes/chatRoutes';
import reportRoutes, { createListingModerationRoutes } from '../../routes/listingReportRoutes';
import { lockListingAdmission } from '../../lib/listingAdmission';
import { parseListingReport } from '../../lib/moderationRules';
import { authenticateToken } from '../../middleware/auth';
import { abandonMyReport, createListingReport } from '../../controllers/listingModerationController';

const db = process.env.TEST_DATABASE_URL;
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(db);
if (!db || process.env.DATABASE_URL !== db) throw new Error('Identical explicit isolated database URLs required');
const secret = 'moderation-integration-only-not-production';
const adminKey = 'synthetic-moderation-header-only';
process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/listings', listingRoutes); app.use('/api/chat', chatRoutes);
app.use('/api/listing-reports', reportRoutes); app.use('/api/moderation', createListingModerationRoutes(() => adminKey));
const server = createServer(app);
let seller: number, buyer: number, third: number, seq = 0;
const fixtureUsers: number[] = [];
const token = (id: number, extra = {}) => jwt.sign({ id, ...extra }, secret, { algorithm: 'HS256', expiresIn: '1h' });
const post = (path: string, id?: number) => {
    const r = request(server).post(path).set('X-Forwarded-For', '192.0.2.' + (++seq % 250 + 1));
    return id === undefined ? r : r.set('Authorization', 'Bearer ' + token(id));
};
const get = (path: string, id?: number) => { const r = request(server).get(path); return id === undefined ? r : r.set('Authorization', 'Bearer ' + token(id)); };
const decisionBody = (extra = {}) => ({ clientDecisionId: randomUUID(), decision: 'REMOVE_LISTING', expectedReportVersion: 1, expectedListingVersion: 1, notes: '人工審核：商品違反刊登規則', ...extra });
const decide = (id: string, body = decisionBody()) => post('/api/moderation/listing-reports/' + id + '/decisions').set('x-admin-key', adminKey).send(body);
async function createListing(publish = true) {
    const id = randomUUID();
    // Synthetic image DB fixture, not a claim of real native upload/EXIF QA.
    await prisma.listingMedia.create({ data: { id, ownerUserId: seller, imageUrl: '/fixture/' + id + '.webp', thumbnailUrl: '/fixture/' + id + '-thumb.webp', contentHash: 'synthetic-only' } });
    const r = await post('/api/listings', seller).send({ clientListingId: randomUUID(), title: 'Switch OLED', description: '完整盒裝功能正常', category: 'electronics', brand: 'Nintendo', price: 7500,
        condition: 'USED', deliveryMethods: ['MEETUP'], location: { county: '台北市', district: '中山區', latitude: 25.05, longitude: 121.53 }, mediaIds: [id], publish, consentToMap: publish });
    expect(r.status).toBe(201); return r.body;
}
const reportBody = (listingId: string) => ({ listingId, clientReportId: randomUUID(), reason: 'FRAUD', details: '僅檢舉者與管理員能看見的合成證據' });
async function createReport(listingId: string, id = buyer) { const r = await post('/api/listing-reports', id).send(reportBody(listingId)); expect(r.status).toBe(201); return r.body.report; }
async function openRoom(listingId: string, id = buyer) { const r = await post('/api/chat/conversations', id).send({ listingId }); expect(r.status).toBe(201); return r.body; }
const terms = () => ({ startsAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 30, timeZone: 'Asia/Taipei', placeName: '合成面交地點', latitude: 25.05, longitude: 121.53, notes: '雙方私密預約內容' });
async function cleanOwnRows() {
    await prisma.listingReportOperation.deleteMany({ where: { reporterUserId: { in: fixtureUsers } } });
    await prisma.conversation.deleteMany({ where: { OR: [{ buyerUserId: { in: fixtureUsers } }, { sellerUserId: { in: fixtureUsers } }] } });
    await prisma.listing.deleteMany({ where: { ownerUserId: { in: fixtureUsers } } });
    await prisma.listingMedia.deleteMany({ where: { ownerUserId: { in: fixtureUsers } } });
}
beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    const run = randomUUID();
    for (const role of ['seller', 'buyer', 'third']) {
        const user = await prisma.user.create({ data: { phoneNumber: `moderation-${run}-${role}`, password: 'synthetic-unused-login', name: role, email: `${run}-${role}@example.invalid`, isEmailVerified: true }, select: { id: true } }); fixtureUsers.push(user.id);
    }
    [seller, buyer, third] = fixtureUsers;
});
beforeEach(cleanOwnRows);
afterAll(async () => {
    try {
        if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await cleanOwnRows(); await prisma.user.deleteMany({ where: { id: { in: fixtureUsers } } });
    } finally { await prisma.$disconnect(); }
});

describe('listing reports and administrative atomic removal', () => {
    it.each(['JWT', 'API_KEY'])('rechecks admitted %s after a concurrent credential revocation before creating/replaying/fencing', async credential => {
        for (const operation of ['create', 'replay', 'abandon']) {
            const listing = await createListing(), body = reportBody(listing.id);
            if (operation === 'replay') expect((await post('/api/listing-reports', buyer).send(body)).status).toBe(201);
            let release!: () => void, admitted!: () => void;
            const admission = new Promise<void>(resolve => { admitted = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
            const syntheticKey = 'moderation-runtime-test-' + randomUUID();
            if (credential === 'API_KEY') await prisma.user.update({ where: { id: buyer }, data: { apiKey: syntheticKey } });
            const paused = express(); paused.use(express.json());
            // Actual production authentication, with an explicit local-only
            // interleaving barrier. Never inject req.user or bypass the gate.
            paused.post(operation === 'abandon' ? '/report/:clientReportId' : '/report', authenticateToken,
                async (_req, _res, next) => { admitted(); await resume; next(); }, operation === 'abandon' ? abandonMyReport : createListingReport);
            const isolated = createServer(paused);
            await new Promise<void>(resolve => isolated.listen(0, '127.0.0.1', resolve));
            try {
                const path = '/report' + (operation === 'abandon' ? '/' + body.clientReportId : '');
                const http = request(isolated).post(path).set(credential === 'API_KEY' ? 'x-api-key' : 'Authorization', credential === 'API_KEY' ? syntheticKey : 'Bearer ' + token(buyer));
                const response = http.send(operation === 'abandon' ? { requestHash: parseListingReport(body).requestHash } : body).then(value => value);
                await admission;
                await prisma.user.update({ where: { id: buyer }, data: credential === 'API_KEY' ? { apiKey: null } : { authVersion: 1 } });
                release(); const denied = await response; expect(denied.status).toBe(401); expect(denied.body.errorCode).toBe('REPORT_SESSION_UNAVAILABLE');
                expect(await prisma.listingReportOperation.count({ where: { reporterUserId: buyer, clientReportId: body.clientReportId } })).toBe(operation === 'replay' ? 1 : 0);
            } finally {
                release(); await prisma.user.update({ where: { id: buyer }, data: { authVersion: 0, apiKey: null } });
                await new Promise<void>((resolve, reject) => isolated.close(error => error ? reject(error) : resolve()));
            }
        }
    });
    it('retains a minimal accepted receipt after target removal without copying its evidence', async () => {
        const listing = await createListing(), body = reportBody(listing.id), response = await post('/api/listing-reports', buyer).send(body);
        expect(response.status).toBe(201);
        await prisma.listing.delete({ where: { id: listing.id } });
        expect((await get('/api/listing-reports/receipts/' + body.clientReportId, buyer)).status).toBe(404);
        const receipt = await get('/api/listing-reports/operations/' + body.clientReportId, buyer);
        expect(receipt.status).toBe(200); expect(receipt.body).toEqual({ operation: { clientReportId: body.clientReportId, requestHash: parseListingReport(body).requestHash, state: 'RECEIVED', createdAt: expect.any(String) }, report: null });
        expect(receipt.headers['cache-control']).toBe('private, no-store');
        const stored = await prisma.listingReportOperation.findUniqueOrThrow({ where: { reporterUserId_clientReportId: { reporterUserId: buyer, clientReportId: body.clientReportId } } });
        for (const forbidden of [listing.id, body.details, 'listingId', 'ownerUserId', 'reason', 'details']) expect(JSON.stringify(stored)).not.toContain(forbidden);
        expect((await post('/api/listing-reports', buyer).send(body)).body.errorCode).toBe('REPORT_RECEIVED_CASE_REMOVED');
        const abandoned = await post('/api/listing-reports/operations/' + body.clientReportId + '/abandon', buyer).send({ requestHash: parseListingReport(body).requestHash });
        expect(abandoned.status).toBe(200); expect(abandoned.body.operation.state).toBe('RECEIVED'); // Not falsely cancelled.
        expect((await get('/api/listing-reports/operations/' + body.clientReportId, third)).status).toBe(404);
    });
    it('fences every delayed original after explicit abandonment and preserves different keys', async () => {
        const listing = await createListing(), body = reportBody(listing.id), requestHash = parseListingReport(body).requestHash, route = '/api/listing-reports/operations/' + body.clientReportId;
        expect((await get(route, buyer)).status).toBe(404); // GET/404 is not a fence.
        expect((await post(route + '/abandon', buyer).send({ requestHash })).body.operation.state).toBe('ABANDONED');
        expect((await post('/api/listing-reports', buyer).send(body)).body.errorCode).toBe('REPORT_OPERATION_ABANDONED');
        expect((await post('/api/listing-reports', buyer).send({ ...body, details: 'changed' })).status).toBe(409);
        expect(await prisma.listingReport.count({ where: { listingId: listing.id } })).toBe(0);
        expect((await post(route + '/abandon', buyer).send({ requestHash })).body.operation.state).toBe('ABANDONED');
        expect((await post(route + '/abandon', buyer).send({ requestHash: '0'.repeat(64) })).status).toBe(409);
        expect((await post('/api/listing-reports', buyer).send({ ...body, clientReportId: randomUUID() })).status).toBe(201);
    });
    it('atomically resolves report versus abandonment races without later resurrection', async () => {
        for (let i = 0; i < 5; i++) {
            const listing = await createListing(), body = reportBody(listing.id), requestHash = parseListingReport(body).requestHash;
            const [submitted, abandon] = await Promise.all([post('/api/listing-reports', buyer).send(body), post('/api/listing-reports/operations/' + body.clientReportId + '/abandon', buyer).send({ requestHash })]);
            expect(abandon.status).toBe(200);
            const received = abandon.body.operation.state === 'RECEIVED';
            expect(submitted.status).toBe(received ? 201 : 409);
            expect(await prisma.listingReport.count({ where: { listingId: listing.id } })).toBe(received ? 1 : 0);
            const retry = await post('/api/listing-reports', buyer).send(body); expect(retry.status).toBe(received ? 200 : 409);
        }
    });
    it('serializes the same operation key across different listings without taking unsorted member locks', async () => {
        const first = await createListing(), second = await createListing(), body = reportBody(first.id);
        const results = await Promise.all([post('/api/listing-reports', buyer).send(body), post('/api/listing-reports', buyer).send({ ...body, listingId: second.id })]);
        expect(results.map(r => r.status).sort()).toEqual([201, 409]);
        expect(await prisma.listingReportOperation.count({ where: { reporterUserId: buyer, clientReportId: body.clientReportId } })).toBe(1);
    });
    it('allows minimal abandonment when the original target never existed and rejects authority overposting', async () => {
        const body = reportBody(randomUUID()), route = '/api/listing-reports/operations/' + body.clientReportId + '/abandon', payload = { requestHash: parseListingReport(body).requestHash };
        expect((await post(route).send(payload)).status).toBe(401);
        expect((await post(route, buyer).send({ ...payload, reporterUserId: third })).status).toBe(400);
        expect((await post(route, buyer).send(payload)).body).toMatchObject({ operation: { state: 'ABANDONED' }, report: null });
        expect((await post('/api/listing-reports', buyer).send(body)).body.errorCode).toBe('REPORT_OPERATION_ABANDONED');
    });
    it('acquires the actual parameterized PostgreSQL listing gate without integer overflow', async () => {
        await expect(prisma.$transaction(async tx => { await lockListingAdmission(tx, randomUUID()); })).resolves.toBeUndefined();
    });
    it('requires a fresh real JWT and refuses self/private/expired reports', async () => {
        const listing = await createListing(), body = reportBody(listing.id);
        expect((await post('/api/listing-reports').send(body)).status).toBe(401);
        expect((await post('/api/listing-reports').set('Authorization', 'Bearer ' + jwt.sign({ id: buyer }, 'wrong')).send(body)).status).toBe(401);
        expect((await post('/api/listing-reports', seller).send(body)).status).toBe(403);
        const draft = await createListing(false);
        expect((await post('/api/listing-reports', buyer).send(reportBody(draft.id))).status).toBe(404);
        // Keep the publication/expiry database invariant intact while making
        // this exact fixture naturally expired. Never disable a constraint.
        await prisma.listing.update({ where: { id: listing.id }, data: { publishedAt: new Date(Date.now() - 2 * 86_400_000), expiresAt: new Date(Date.now() - 86_400_000) } });
        expect((await post('/api/listing-reports', buyer).send(body)).status).toBe(404);
        expect(await prisma.listingReport.count({ where: { reporterUserId: buyer } })).toBe(0);
    });
    it('rejects body authority/state overposting before any case is created', async () => {
        const listing = await createListing();
        for (const extra of [{ reporterUserId: third }, { isAdmin: true }, { status: 'REMOVED' }, { reason: 'unknown' }]) expect((await post('/api/listing-reports', buyer).send({ ...reportBody(listing.id), ...extra })).status).toBe(400);
        expect(await prisma.listingReport.count({ where: { listingId: listing.id } })).toBe(0);
    });
    it('checks the current user authVersion instead of admitting a revoked JWT', async () => {
        const listing = await createListing(), oldToken = token(buyer);
        try {
            await prisma.user.update({ where: { id: buyer }, data: { authVersion: 1 } });
            expect((await post('/api/listing-reports').set('Authorization', 'Bearer ' + oldToken).send(reportBody(listing.id))).status).toBe(401);
            expect(await prisma.listingReport.count({ where: { listingId: listing.id } })).toBe(0);
        } finally { await prisma.user.update({ where: { id: buyer }, data: { authVersion: 0 } }); }
    });
    it('deduplicates concurrent reports and conflicts on changed same-key payload', async () => {
        const listing = await createListing(), body = reportBody(listing.id);
        const results = await Promise.all([post('/api/listing-reports', buyer).send(body), post('/api/listing-reports', buyer).send(body)]);
        expect(results.map(r => r.status).sort()).toEqual([200, 201]); expect(results[0].body.report.id).toBe(results[1].body.report.id);
        expect((await post('/api/listing-reports', buyer).send({ ...body, reason: 'OTHER' })).status).toBe(409);
        expect(await prisma.listingReport.count({ where: { listingId: listing.id } })).toBe(1);
    });
    it('limits private cases/receipts/cursors to their reporter and excludes them from public listings', async () => {
        const listing = await createListing(), report = await createReport(listing.id);
        expect((await get('/api/listing-reports/mine', buyer)).body.items).toHaveLength(1);
        expect((await get('/api/listing-reports/mine', third)).body.items).toEqual([]);
        expect((await get('/api/listing-reports/receipts/' + report.clientReportId, third)).status).toBe(404);
        expect((await get('/api/listing-reports/mine', third).query({ cursor: report.id })).status).toBe(404);
        const publicResponse = await get('/api/listings/' + listing.id);
        for (const value of ['listingReports', 'reports', 'moderationActions', 'reporterUserId', 'details', report.details, 'requestHash', adminKey]) expect(publicResponse.text).not.toContain(value);
        expect((await get('/api/listing-reports/receipts/' + report.clientReportId, buyer)).headers['cache-control']).toBe('private, no-store');
    });
    it('admits only the runtime admin header, not JWT role, query key or client authority', async () => {
        const listing = await createListing(), report = await createReport(listing.id), path = '/api/moderation/listing-reports/' + report.id + '/decisions';
        expect((await post(path, buyer).send(decisionBody())).status).toBe(401);
        expect((await post(path).set('Authorization', 'Bearer ' + token(buyer, { isAdmin: true })).send(decisionBody())).status).toBe(401);
        expect((await post(path).query({ key: adminKey }).set('x-admin-key', adminKey).send(decisionBody())).status).toBe(400);
        expect((await post(path).set('x-admin-key', adminKey).send(decisionBody({ actorKeyRef: 'forged' }))).status).toBe(400);
        expect(await prisma.listingModerationAction.count({ where: { listingId: listing.id } })).toBe(0);
    });
    it('returns a bounded authorized queue with the current listing version and no reporter profile', async () => {
        const listing = await createListing(), report = await createReport(listing.id);
        expect((await get('/api/moderation/listing-reports', buyer)).status).toBe(401);
        const queue = await get('/api/moderation/listing-reports').set('x-admin-key', adminKey).query({ status: 'OPEN' });
        expect(queue.status).toBe(200); expect(queue.body.items).toHaveLength(1);
        expect(queue.body.items[0]).toMatchObject({ id: report.id, listing: { id: listing.id, version: 1, status: 'ACTIVE' } });
        for (const key of ['reporterUserId', 'phoneNumber', 'email', 'password', 'requestHash']) expect(queue.text).not.toContain(key);
        expect(queue.headers['cache-control']).toBe('private, no-store');
        expect((await get('/api/moderation/listing-reports').set('x-admin-key', adminKey).query({ limit: '1000' })).status).toBe(400);
    });
    it('dismisses atomically without touching listing version, expiry or images', async () => {
        const listing = await createListing(), report = await createReport(listing.id);
        const body = decisionBody({ decision: 'DISMISS', expectedListingVersion: undefined });
        const result = await decide(report.id, body); expect(result.status).toBe(201);
        expect(result.body.action.actorKeyRef).toBe('wishlist-primary-admin'); expect(result.text).not.toContain(adminKey); expect(result.text).not.toContain('requestHash');
        expect(await prisma.listingReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({ status: 'DISMISSED', version: 2 });
        const unchanged = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } }); expect(unchanged.version).toBe(1); expect(unchanged.status).toBe('ACTIVE'); expect(unchanged.expiresAt?.toISOString()).toBe(listing.expiresAt);
        expect(await prisma.listingMedia.count({ where: { listingId: listing.id } })).toBe(1);
    });
    it('rolls back stale case/listing versions without archiving or recording a decision', async () => {
        const listing = await createListing(), report = await createReport(listing.id), room = await openRoom(listing.id);
        for (const extra of [{ expectedReportVersion: 2 }, { expectedListingVersion: 2 }]) expect((await decide(report.id, decisionBody(extra))).status).toBe(409);
        expect(await prisma.listingReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({ status: 'OPEN', version: 1 });
        expect(await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: 'ACTIVE', version: 1 });
        expect((await prisma.conversation.findUniqueOrThrow({ where: { id: room.id } })).archivedAt).toBeNull();
        expect(await prisma.listingModerationAction.count({ where: { listingId: listing.id } })).toBe(0);
    });
    it('removes only the target, archives rooms and private meetup terms, preserves real messages', async () => {
        const listing = await createListing(), unrelated = await createListing(), report = await createReport(listing.id), room = await openRoom(listing.id), otherRoom = await openRoom(unrelated.id);
        const path = '/api/chat/conversations/' + room.id;
        for (const id of [buyer, seller]) expect((await post(path + '/messages', id).send({ clientMessageId: randomUUID(), text: '保留雙方合成歷史訊息' })).status).toBe(201);
        expect((await post(path + '/meetup', buyer).send({ clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: terms() })).status).toBe(201);
        const result = await decide(report.id); expect(result.status).toBe(201);
        expect((await get(path, buyer)).body).toMatchObject({ archived: true, listingAvailable: false });
        expect((await get(path + '/messages', seller)).body.items).toHaveLength(2);
        expect((await post(path + '/messages', buyer).send({ clientMessageId: randomUUID(), text: '不可繼續交易' })).status).toBe(403);
        expect((await post(path + '/meetup', buyer).send({ clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: terms() })).status).toBe(409);
        expect(await prisma.meetupAppointment.count({ where: { conversationId: room.id } })).toBe(0); expect(await prisma.meetupOperation.count({ where: { conversationId: room.id } })).toBe(0);
        expect((await get('/api/chat/conversations/' + otherRoom.id, buyer)).body.archived).toBe(false);
        expect((await get('/api/listings/' + listing.id, third)).status).toBe(404);
        expect((await get('/api/listings')).body.items.map((row: { id: string }) => row.id)).toContain(unrelated.id);
        expect((await get('/api/listings')).body.items.map((row: { id: string }) => row.id)).not.toContain(listing.id);
        expect((await post('/api/listings/' + listing.id + '/publish', seller).send({ expectedVersion: 2, consentToMap: true })).status).toBe(409);
        expect((await post('/api/listings/' + listing.id + '/extend', seller).send({ expectedVersion: 2, expiryDate: '2028-12-31' })).status).toBe(409);
        expect((await post('/api/chat/conversations', third).send({ listingId: listing.id })).status).toBe(404);
    });
    it('acknowledges a repeated administrative operation once, including concurrent requests', async () => {
        const listing = await createListing(), report = await createReport(listing.id), body = decisionBody();
        const results = await Promise.all([decide(report.id, body), decide(report.id, body)]);
        expect(results.map(r => r.status).sort()).toEqual([200, 201]); expect(results[0].body.action.id).toBe(results[1].body.action.id);
        expect((await decide(report.id, body)).status).toBe(200);
        expect((await decide(report.id, { ...body, notes: '不同決定' })).status).toBe(409);
        expect(await prisma.listingModerationAction.count({ where: { listingId: listing.id } })).toBe(1);
        expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).version).toBe(2);
        const receipt = await get('/api/moderation/decisions/' + body.clientDecisionId).set('x-admin-key', adminKey); expect(receipt.status).toBe(200); expect(receipt.body.action.id).toBe(results[0].body.action.id);
    });
    it('allows only one competing versioned administrative decision to commit', async () => {
        const listing = await createListing(), report = await createReport(listing.id);
        const results = await Promise.all([decide(report.id), decide(report.id)]);
        expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect(await prisma.listingModerationAction.count({ where: { listingId: listing.id } })).toBe(1);
    });
    it('serializes removal against new rooms/messages/meetups without live orphan transactions', async () => {
        for (let i = 0; i < 5; i++) {
            const listing = await createListing(), report = await createReport(listing.id), room = await openRoom(listing.id), path = '/api/chat/conversations/' + room.id;
            const [removed, opened, sent, proposed] = await Promise.all([decide(report.id), post('/api/chat/conversations', third).send({ listingId: listing.id }),
                post(path + '/messages', buyer).send({ clientMessageId: randomUUID(), text: '競爭合成訊息' }), post(path + '/meetup', buyer).send({ clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: terms() })]);
            expect(removed.status).toBe(201); expect([201, 404]).toContain(opened.status); expect([201, 403]).toContain(sent.status); expect([201, 409]).toContain(proposed.status);
            const rooms = await prisma.conversation.findMany({ where: { listingId: listing.id } }); expect(rooms.length).toBeGreaterThanOrEqual(1); expect(rooms.every(row => row.archivedAt !== null)).toBe(true);
            expect(await prisma.meetupAppointment.count({ where: { conversationId: { in: rooms.map(row => row.id) } } })).toBe(0);
            expect((await post(path + '/messages', buyer).send({ clientMessageId: randomUUID(), text: '下架 ACK 後不可寫入' })).status).toBe(403);
        }
    }, 30_000);
    it('erases reporter evidence via FK lifecycle without duplicating it in the minimal ledger', async () => {
        const actor = await prisma.user.create({ data: { phoneNumber: 'moderation-extra-' + randomUUID(), password: 'synthetic-only' }, select: { id: true } }); fixtureUsers.push(actor.id);
        const listing = await createListing(), report = await createReport(listing.id, actor.id); expect((await decide(report.id)).status).toBe(201);
        // This exercises database erasure lifecycle, not the native password /
        // two-confirmation account-erasure UI, which remains a separate gate.
        await prisma.user.delete({ where: { id: actor.id } });
        expect(await prisma.listingReportOperation.count({ where: { reporterUserId: actor.id } })).toBe(0);
        expect(await prisma.listingReport.findUnique({ where: { id: report.id } })).toBeNull();
        const action = await prisma.listingModerationAction.findFirstOrThrow({ where: { listingId: listing.id } }); expect(action.reportId).toBeNull();
        expect(JSON.stringify(action)).not.toContain(report.details); expect(Object.keys(action)).not.toContain('reporterUserId');
        await prisma.listing.delete({ where: { id: listing.id } }); expect(await prisma.listingModerationAction.count({ where: { listingId: listing.id } })).toBe(0);
    });
});
