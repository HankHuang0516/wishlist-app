import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import userRoutes from '../../routes/userRoutes';
import { erasureIdentityHash } from '../../lib/accountErasure';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'erasure-transport-integration-only', previous = process.env.JWT_SECRET, password = 'SyntheticPass123';
process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use('/api/users', userRoutes);
const server = createServer(app), users: number[] = [], hashes: string[] = [], media: string[] = [];
let owner: number, other: number, action: string, otherWish: number, photoId: string, ip = 0;
const token = (id = owner, version = 0) => jwt.sign({ id, authVersion: version }, secret, { algorithm: 'HS256', expiresIn: '1h' });
const call = (method: 'get' | 'post' | 'delete', suffix: string, id = owner, version = 0) => request(server)[method]('/api/users' + suffix).set('Authorization', 'Bearer ' + token(id, version)).set('X-Forwarded-For', '192.0.2.' + (ip++ % 250 + 1));
const body = () => ({ currentPassword: password, clientActionId: action, confirmation: 'DELETE_MY_ACCOUNT' });
const erase = () => call('delete', '/me').send(body());
const receipt = (id = owner, version = 0) => call('get', '/me/deletion-operations/' + action, id, version);
const abandon = () => call('post', '/me/deletion-operations/' + action + '/abandon').send({});
beforeAll(async () => { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); }); });
beforeEach(async () => {
    const hash = await bcrypt.hash(password, 4), run = randomUUID();
    const created = await Promise.all(['owner', 'other'].map(role => prisma.user.create({ data: { phoneNumber: 'erasure-http-' + role + '-' + run, password: hash } })));
    [owner, other] = created.map(u => u.id); users.push(owner, other); hashes.push(erasureIdentityHash(owner, 0), erasureIdentityHash(other, 0)); action = randomUUID();
    await prisma.wishlist.create({ data: { userId: owner, title: 'synthetic-private-list', items: { create: [{ name: 'synthetic-private-wish' }] } } });
    otherWish = (await prisma.wishlist.create({ data: { userId: other, title: 'synthetic-other-list' } })).id;
    photoId = (await prisma.listingMedia.create({ data: { ownerUserId: owner, imageUrl: '/synthetic-image', thumbnailUrl: '/synthetic-thumb', contentHash: 'synthetic' } })).id; media.push(photoId);
});
afterAll(async () => {
    try {
        if (server.listening) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
        await prisma.$transaction(async tx => {
            await tx.wishlist.deleteMany({ where: { userId: { in: users } } });
            await tx.user.deleteMany({ where: { id: { in: users } } });
            await tx.mediaErasureTask.deleteMany({ where: { mediaId: { in: media } } });
            await tx.legacyAssetErasureTask.deleteMany({ where: { identityHash: { in: hashes } } });
            await tx.accountErasureReceipt.deleteMany({ where: { identityHash: { in: hashes } } });
        });
    } finally { await prisma.$disconnect(); if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
});
describe('actual erasure/recovery/abandon HTTP, JWT and PostgreSQL', () => {
    it.each(['missing', 'forged', 'expired', 'wrong-algorithm', 'api-key', 'ambiguous'])('rejects invalid deletion authority %s without writing', async kind => {
        let req = request(server).delete('/api/users/me');
        if (kind === 'forged') req = req.set('Authorization', 'Bearer ' + jwt.sign({ id: owner }, 'wrong-secret'));
        if (kind === 'expired') req = req.set('Authorization', 'Bearer ' + jwt.sign({ id: owner }, secret, { expiresIn: -1 }));
        if (kind === 'wrong-algorithm') req = req.set('Authorization', 'Bearer ' + jwt.sign({ id: owner }, secret, { algorithm: 'HS384' }));
        if (kind === 'api-key') req = req.set('x-api-key', 'synthetic-invalid');
        if (kind === 'ambiguous') req = req.set('Authorization', 'Bearer ' + token()).set('x-api-key', 'synthetic-invalid');
        const res = await req.send(body()); expect(res.status).toBe(401); expect(res.headers['cache-control']).toBe('private, no-store');
        expect(await prisma.user.findUnique({ where: { id: owner } })).not.toBeNull();
    });
    it.each([{ confirmation: undefined }, { confirmation: 'yes' }, { clientActionId: 'invalid' }, { currentPassword: null }, { currentPassword: '' }, { userId: 1 }, { keepData: true }, { admin: true }])('rejects malformed or expanded deletion bodies %j', async change => {
        expect((await call('delete', '/me').send({ ...body(), ...change })).status).toBe(400);
        expect((await call('delete', '/me?userId=' + other).send(body())).status).toBe(400);
        expect(await prisma.user.count({ where: { id: { in: [owner, other] } } })).toBe(2);
    });
    it('requires current password and version, not just a cryptographically valid old JWT', async () => {
        expect((await call('delete', '/me').send({ ...body(), currentPassword: password + ' ' })).status).toBe(401);
        await prisma.user.update({ where: { id: owner }, data: { authVersion: 1 } });
        expect((await erase()).status).toBe(401); expect((await receipt()).status).toBe(404);
        expect(await prisma.user.findUnique({ where: { id: owner } })).not.toBeNull();
    });
    it('returns a bound deletion ACK and recovers it with the original JWT after User is gone', async () => {
        const res = await erase(); expect(res.status).toBe(200); expect(res.headers['cache-control']).toBe('private, no-store');
        expect(res.body).toMatchObject({ state: 'ERASED', accountDeleted: true, clientActionId: action, photoCleanupPending: 1, legacyCleanupPending: 0 });
        expect((await call('get', '/me')).status).toBe(401);
        const recovered = await receipt(); expect(recovered.status).toBe(200); expect(recovered.body).toEqual(res.body);
        expect(JSON.stringify(recovered.body)).not.toMatch(/password|token|identityHash|resourceId|synthetic-private/);
        expect(await prisma.wishlist.findUnique({ where: { id: otherWish } })).not.toBeNull();
        expect((await receipt(other)).status).toBe(404); expect((await receipt(owner, 1)).status).toBe(404);
    });
    it('deduplicates ten simultaneous deletes and same-ID retries without recreating User or tasks', async () => {
        const results = await Promise.all(Array.from({ length: 10 }, erase));
        expect(results.map(r => r.status)).toEqual(Array(10).fill(200));
        expect(new Set(results.map(r => r.body.erasedAt)).size).toBe(1);
        expect(await prisma.accountErasureReceipt.count({ where: { identityHash: erasureIdentityHash(owner, 0), clientActionId: action } })).toBe(1);
        expect(await prisma.mediaErasureTask.count({ where: { mediaId: photoId } })).toBe(1);
        expect((await erase()).body).toEqual(results[0].body);
    });
    it('does not treat GET/404 as cancellation; abandon commits a barrier before delayed originals', async () => {
        expect((await receipt()).status).toBe(404);
        const cancelled = await abandon(); expect(cancelled.status).toBe(200); expect(cancelled.body).toMatchObject({ state: 'ABANDONED', accountDeleted: false, erasedAt: null, clientActionId: action });
        expect((await abandon()).body).toEqual(cancelled.body);
        expect((await erase()).status).toBe(409); expect((await erase()).body.errorCode).toBe('ERASURE_ABANDONED');
        expect((await receipt()).body).toEqual(cancelled.body); expect((await call('get', '/me')).status).toBe(200);
        expect(await prisma.mediaErasureTask.count({ where: { mediaId: photoId } })).toBe(0);
    });
    it('cannot cancel an already committed deletion or report it as abandoned', async () => {
        const erased = await erase(); expect((await abandon()).body).toEqual(erased.body);
        expect(await prisma.user.findUnique({ where: { id: owner } })).toBeNull();
    });
    it('serializes deletion against abandon; either erased ACK or a real no-delete barrier wins', async () => {
        const [deleted, cancelled] = await Promise.all([erase(), abandon()]); expect(cancelled.status).toBe(200);
        if (cancelled.body.state === 'ERASED') { expect(deleted.status).toBe(200); expect(await prisma.user.findUnique({ where: { id: owner } })).toBeNull(); }
        else { expect(deleted.status).toBe(409); expect(await prisma.user.findUnique({ where: { id: owner } })).not.toBeNull(); }
        expect((await receipt()).body).toEqual(cancelled.body);
    });
    it('forbids injected receipt queries, cross-identity reads and extra abandon fields', async () => {
        expect((await call('get', '/me/deletion-operations/' + action + '?userId=' + other)).status).toBe(400);
        expect((await call('get', '/me/deletion-operations/invalid')).status).toBe(400);
        expect((await call('post', '/me/deletion-operations/' + action + '/abandon').send({ userId: other })).status).toBe(400);
        await prisma.user.update({ where: { id: owner }, data: { authVersion: 1 } }); expect((await abandon()).status).toBe(401);
    });
    it('retains legacy candidate provenance without fetching, exposing URLs or pretending physical erasure', async () => {
        await prisma.user.update({ where: { id: owner }, data: { avatarUrl: '/uploads/avatar_1789470000000.jpg' } });
        await prisma.item.updateMany({ where: { wishlist: { userId: owner } }, data: { imageUrl: 'https://live.staticflickr.com/1234/90000000000101_aabbccdd_b.jpg' } });
        const res = await erase(); expect(res.status).toBe(200); expect(res.body.legacyCleanupPending).toBe(2);
        const tasks = await prisma.legacyAssetErasureTask.findMany({ where: { identityHash: erasureIdentityHash(owner, 0) }, select: { kind: true, target: true, resourceType: true } });
        expect(tasks).toEqual(expect.arrayContaining([{ kind: 'LOCAL', target: 'avatar_1789470000000.jpg', resourceType: 'AVATAR' }, { kind: 'FLICKR', target: '90000000000101', resourceType: 'WISH_IMAGE' }]));
        expect(JSON.stringify(res.body)).not.toMatch(/staticflickr|avatar_|resourceId|target|token/);
        expect((await receipt()).body.legacyCleanupPending).toBe(2);
    });
    it('keeps receipt/abandon recovery available after the separate five-password-attempt limit', async () => {
        for (let attempt = 0; attempt < 5; attempt++) expect((await call('delete', '/me').set('X-Forwarded-For', '198.51.100.99').send({ ...body(), currentPassword: 'wrong-synthetic' })).status).toBe(401);
        expect((await call('delete', '/me').set('X-Forwarded-For', '198.51.100.99').send(body())).status).toBe(429);
        expect((await receipt().set('X-Forwarded-For', '198.51.100.99')).status).toBe(404);
        expect((await abandon().set('X-Forwarded-For', '198.51.100.99')).status).toBe(200);
        expect(await prisma.user.findUnique({ where: { id: owner } })).not.toBeNull();
    });
});
