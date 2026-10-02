import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'crypto';
import { createServer } from 'http';
import prisma from '../../lib/prisma';
import socialRoutes from '../../routes/socialRoutes';
import { authenticateToken } from '../../middleware/auth';
import { createUpcomingBirthdaysHandler } from '../../controllers/birthdayController';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Explicit isolated database required');
const oldSecret = process.env.JWT_SECRET, secret = 'synthetic-birthday-http-isolated'; process.env.JWT_SECRET = secret;
const app = express(); app.use('/api/users', socialRoutes);
let clock = new Date('2026-12-20T23:59:59.000Z');
app.get('/api/calendar-boundary', authenticateToken, createUpcomingBirthdaysHandler(prisma, () => clock));
app.get('/api/calendar-fault', authenticateToken, createUpcomingBirthdaysHandler({ follow: { findMany: async () => { throw Error('synthetic secret query detail'); } } } as any));
const server = createServer(app), run = randomUUID();
const ids: number[] = []; let viewer: number, otherViewer: number, token: string, personalKey: string;
async function owner(birthday: string | null, extra: Record<string, unknown> = {}, follow = true) {
  const user = await prisma.user.create({ data: { phoneNumber: 'birthday-' + randomUUID(), password: 'synthetic-password', name: 'Public birthday friend', email: randomUUID() + '@example.invalid', realName: 'Private real name', address: 'Private address', birthday: birthday ? new Date(birthday) : null, isBirthdayVisible: true, isPhoneVisible: false, isEmailVisible: false, ...extra } });
  ids.push(user.id); if (follow) await prisma.follow.create({ data: { followerId: viewer, followingId: user.id } }); return user.id;
}
const get = (path = '/api/users/upcoming-birthdays') => request(server).get(path).set('Authorization', 'Bearer ' + token);
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); personalKey = randomBytes(32).toString('hex');
  viewer = (await prisma.user.create({ data: { phoneNumber: 'birthday-viewer-' + run, password: 'synthetic', apiKey: personalKey } })).id;
  otherViewer = (await prisma.user.create({ data: { phoneNumber: 'birthday-other-' + run, password: 'synthetic' } })).id;
  token = jwt.sign({ id: viewer, authVersion: 0 }, secret);
});
beforeEach(async () => { await prisma.follow.deleteMany({ where: { followingId: { in: ids } } }); await prisma.user.deleteMany({ where: { id: { in: ids } } }); ids.length = 0; await prisma.user.update({ where: { id: viewer }, data: { authVersion: 0 } }); clock = new Date('2026-12-20T23:59:59.000Z'); });
afterAll(async () => { try { await new Promise<void>(resolve => server.close(() => resolve())); const all = [...ids, viewer, otherViewer]; await prisma.follow.deleteMany({ where: { OR: [{ followerId: { in: all } }, { followingId: { in: all } }] } }); await prisma.user.deleteMany({ where: { id: { in: all } } }); } finally { await prisma.$disconnect(); if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; } });
describe('real HTTP/PostgreSQL birthday privacy and UTC calendar', () => {
  it('is private/no-store before authentication and denies revoked sessions', async () => {
    const unauthorized = await request(server).get('/api/users/upcoming-birthdays'); expect(unauthorized.status).toBe(401); expect(unauthorized.headers['cache-control']).toBe('private, no-store');
    await prisma.user.update({ where: { id: viewer }, data: { authVersion: 1 } }); const revoked = await get(); expect(revoked.status).toBe(401); expect(revoked.headers['cache-control']).toBe('private, no-store');
  });
  it('returns only the current viewer follow relation and public birthday, retaining original six fields', async () => {
    const date = new Date(); date.setUTCDate(date.getUTCDate() + 2); const birthday = date.toISOString().slice(0, 10);
    const visible = await owner(birthday, { name: null, nicknames: null, isAvatarVisible: false, avatarUrl: 'https://example.invalid/private-avatar.jpg' });
    await owner(birthday, { isBirthdayVisible: false }); await owner(null); const unfollowed = await owner(birthday, {}, false);
    await prisma.follow.create({ data: { followerId: otherViewer, followingId: unfollowed } });
    const response = await get(); expect(response.status).toBe(200); expect(response.body).toHaveLength(1); expect(response.body[0]).toMatchObject({ id: visible, name: null, nicknames: null, avatarUrl: null });
    expect(Object.keys(response.body[0]).sort()).toEqual(['id', 'name', 'nicknames', 'avatarUrl', 'birthday', 'nextBirthday'].sort());
    expect(response.body[0].nextBirthday).toMatch(/T00:00:00\.000Z$/); const body = JSON.stringify(response.body);
    for (const privateValue of ['synthetic-password', 'Private real name', 'Private address', 'private-avatar', personalKey, 'phoneNumber', 'email']) expect(body).not.toContain(privateValue);
  });
  it('respects birthday and avatar changes on each explicit GET without changing relationships', async () => {
    const date = new Date(); date.setUTCDate(date.getUTCDate() + 2); const id = await owner(date.toISOString().slice(0, 10), { avatarUrl: '/uploads/synthetic-birthday.png', isAvatarVisible: true });
    expect((await get()).body[0].avatarUrl).toBe('/uploads/synthetic-birthday.png');
    await prisma.user.update({ where: { id }, data: { isAvatarVisible: false } }); expect((await get()).body[0].avatarUrl).toBeNull();
    await prisma.user.update({ where: { id }, data: { isBirthdayVisible: false } }); expect((await get()).body).toEqual([]);
    expect(await prisma.follow.count({ where: { followerId: viewer, followingId: id } })).toBe(1);
  });
  it('keeps personal-key reads and refuses query-based identity or calendar overrides', async () => {
    const response = await request(server).get('/api/users/upcoming-birthdays').set('x-api-key', personalKey); expect(response.status).toBe(200); expect(response.body).toEqual([]);
    for (const query of [{ viewerId: otherViewer }, { now: '2026-01-01' }, { token: 'synthetic' }]) { const r = await get().query(query); expect(r.status).toBe(400); expect(r.headers['cache-control']).toBe('private, no-store'); expect(Object.keys(r.body)).toEqual(['errorCode']); }
  });
  it('includes today and day 30 across year boundaries, excludes passed/day 31 and sorts equal dates by identity', async () => {
    const today = await owner('1995-12-20'), january = await owner('1995-01-01'), last = await owner('1995-01-19'), same = await owner('1996-01-01');
    await owner('1995-01-20'); await owner('1995-12-19');
    const r = await get('/api/calendar-boundary'); expect(r.status).toBe(200); expect(r.body.map((x: any) => x.id)).toEqual([today, january, same, last]);
    expect(r.body.map((x: any) => x.nextBirthday)).toEqual(['2026-12-20T00:00:00.000Z', '2027-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', '2027-01-19T00:00:00.000Z']);
  });
  it('handles Feb 29 as Mar 1 in non-leap years and Feb 29 in leap years', async () => {
    await owner('1996-02-29'); clock = new Date('2027-02-01T00:00:00.000Z'); expect((await get('/api/calendar-boundary')).body[0].nextBirthday).toBe('2027-03-01T00:00:00.000Z');
    clock = new Date('2028-02-01T23:59:59.000Z'); expect((await get('/api/calendar-boundary')).body[0].nextBirthday).toBe('2028-02-29T00:00:00.000Z');
  });
  it('reports bounded query failure rather than a successful empty array or raw database exception', async () => {
    const r = await get('/api/calendar-fault'); expect(r.status).toBe(500); expect(r.headers['cache-control']).toBe('private, no-store'); expect(r.body).toEqual({ errorCode: 'INTERNAL_ERROR' }); expect(JSON.stringify(r.body)).not.toContain('synthetic secret');
  });
});
