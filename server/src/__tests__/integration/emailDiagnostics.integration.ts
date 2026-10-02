import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
jest.mock('../../lib/emailService', () => ({ sendEmail: jest.fn() }));
import prisma from '../../lib/prisma';
import feedbackRoutes from '../../routes/feedbackRoutes';
import { sendEmail } from '../../lib/emailService';
import { signUserJwt } from '../../lib/jwtConfig';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Equal isolated test database required');
const names = ['JWT_SECRET','EMAIL_DIAGNOSTICS_ADMIN_USER_IDS','EMAIL_DIAGNOSTICS_ENABLED'] as const;
const previous = names.map(name => process.env[name]);
const secret = 'synthetic-diagnostics-only-session-secret';
const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use('/api/feedback', feedbackRoutes);
const server = createServer(app); let owner: number, other: number;
const token = (id = owner, authVersion = 0) => signUserJwt({ id, authVersion });
const read = (bearer = token()) => request(server).get('/api/feedback/test').set('Authorization', 'Bearer ' + bearer);
const send = (bearer = token()) => request(server).post('/api/feedback/test').set('Authorization', 'Bearer ' + bearer);
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); });
beforeEach(async () => {
  process.env.JWT_SECRET = secret; process.env.EMAIL_DIAGNOSTICS_ENABLED = 'true';
  owner = (await prisma.user.create({ data: { phoneNumber: 'diagnostics-owner-' + randomUUID(), password: 'synthetic-unusable', apiKey: 'synthetic-key-' + randomUUID() } })).id;
  other = (await prisma.user.create({ data: { phoneNumber: 'diagnostics-other-' + randomUUID(), password: 'synthetic-unusable' } })).id;
  process.env.EMAIL_DIAGNOSTICS_ADMIN_USER_IDS = String(owner);
  (sendEmail as jest.Mock).mockReset().mockResolvedValue({ success: true, id: 'synthetic-provider-id', error: 'private-provider-error', log: 'private-provider-log' });
});
afterEach(async () => { jest.restoreAllMocks(); await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } }); });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; }); });

describe('manual mail diagnostic authority through real HTTP and PostgreSQL', () => {
  it('requires a valid live bearer on both routes and does not accept a personal API key', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: owner } });
    for (const result of [await request(server).get('/api/feedback/test'), await request(server).post('/api/feedback/test'), await send('invalid'), await request(server).post('/api/feedback/test').set('X-Api-Key', user.apiKey!), await send().set('X-Api-Key', user.apiKey!)]) {
      expect(result.status).toBe(401); expect(result.body).toEqual({ errorCode: 'EMAIL_DIAGNOSTICS_AUTH_REQUIRED' }); expect(result.headers['cache-control']).toBe('private, no-store');
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('uses operator identity rather than a JWT role, phone or client property', async () => {
    const forged = jwt.sign({ id: other, authVersion: 0, isAdmin: true, phoneNumber: 'admin', role: 'admin' }, secret, { algorithm: 'HS256' });
    expect((await read(forged)).body).toEqual({ userId: other, canSend: false });
    expect((await send(forged).send({ userId: owner, isAdmin: true })).status).toBe(403);
    expect((await send(forged).query({ adminUserId: owner })).status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('fails closed with missing, malformed, excessive or out-of-range administrator configuration', async () => {
    for (const value of ['', '0', '-1', '01', String(owner) + ',bad', String(owner) + ',2147483648', Array(33).fill(String(owner)).join(',')]) {
      process.env.EMAIL_DIAGNOSTICS_ADMIN_USER_IDS = value;
      expect((await read()).body).toEqual({ userId: owner, canSend: false }); expect((await send()).status).toBe(403);
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('requires explicit enabling even for an admitted administrator and trims only configuration values', async () => {
    process.env.EMAIL_DIAGNOSTICS_ADMIN_USER_IDS = ' ' + owner + ' , ' + other + ' ';
    for (const value of ['', 'false', 'TRUE', '1']) {
      process.env.EMAIL_DIAGNOSTICS_ENABLED = value;
      expect((await read()).body.canSend).toBe(false); expect((await send()).body).toEqual({ errorCode: 'EMAIL_DIAGNOSTICS_DISABLED' });
    }
    process.env.EMAIL_DIAGNOSTICS_ENABLED = ' true '; expect((await read()).body.canSend).toBe(true); expect(sendEmail).not.toHaveBeenCalled();
  });
  it('rejects modified payloads and query parameters before invoking a mail provider', async () => {
    for (const body of [{ to: 'elsewhere@example.invalid' }, { subject: 'changed' }, { html: '<script>bad</script>' }, { userId: owner }, []]) expect((await send().send(body)).status).toBe(400);
    expect((await send().query({ to: 'elsewhere@example.invalid' })).status).toBe(400);
    expect((await read().query({ userId: owner })).status).toBe(400); expect(sendEmail).not.toHaveBeenCalled();
  });
  it('retains the original fixed diagnostic message, returns minimal acceptance and limits by user rather than spoofed IP', async () => {
    expect((await read()).body).toEqual({ userId: owner, canSend: true });
    const sent = await send().send({}); expect(sent.status).toBe(200); expect(sent.body).toEqual({ success: true, notificationStatus: 'ACCEPTED' });
    expect(JSON.stringify(sent.body)).not.toMatch(/private|provider-id|@|stack|error|log/);
    expect((sendEmail as jest.Mock).mock.calls[0]).toEqual(['hankhuang0516@gmail.com','Live Debug Test Email','<p>This is a manual test triggered from Settings Page. <br>System Status: <b>Online</b></p>']);
    expect((await send().set('X-Forwarded-For', '192.0.2.10')).status).toBe(429); expect(sendEmail).toHaveBeenCalledTimes(1);
    process.env.EMAIL_DIAGNOSTICS_ADMIN_USER_IDS = String(owner) + ',' + other;
    expect((await send(token(other)).set('X-Forwarded-For', '192.0.2.10')).status).toBe(200); expect(sendEmail).toHaveBeenCalledTimes(2);
  });
  it.each([{ success: false, error: 'private-password', log: 'private-stack' }, { success: true }, { success: true, id: 'private id with spaces' }])('does not treat malformed provider evidence as acceptance %#', async result => {
    (sendEmail as jest.Mock).mockResolvedValueOnce(result); const response = await send(); expect(response.status).toBe(503); expect(response.body).toEqual({ success: false, errorCode: 'EMAIL_DIAGNOSTICS_UNCONFIRMED' }); expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it('bounds a provider exception without returning its message or stack', async () => {
    (sendEmail as jest.Mock).mockRejectedValueOnce(Error('private-provider-credential')); expect((await send()).body).toEqual({ success: false, errorCode: 'EMAIL_DIAGNOSTICS_UNCONFIRMED' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it('denies deleted and revoked sessions on reads and writes', async () => {
    const old = token(); await prisma.user.update({ where: { id: owner }, data: { authVersion: 1 } });
    expect((await read(old)).status).toBe(401); expect((await send(old)).status).toBe(401);
    await prisma.user.delete({ where: { id: owner } }); expect((await send(old)).status).toBe(401); expect(sendEmail).not.toHaveBeenCalled();
  });
  it('rechecks a session revoked after admission and never dispatches using the earlier proof', async () => {
    const find = prisma.user.findUnique.bind(prisma.user); let calls = 0;
    // The route only awaits this query. The barrier promise does not expose
    // Prisma's unused relation helpers, while retaining real database reads.
    jest.spyOn(prisma.user, 'findUnique').mockImplementation(args => find(args).then(async result => { if (++calls === 1) await prisma.user.update({ where: { id: owner }, data: { authVersion: 1 } }); return result; }) as unknown as ReturnType<typeof prisma.user.findUnique>);
    expect((await send()).status).toBe(401); expect(calls).toBe(2); expect(sendEmail).not.toHaveBeenCalled();
  });
  it('does not dispatch if operator admission changes between authentication and sending', async () => {
    const find = prisma.user.findUnique.bind(prisma.user); let calls = 0;
    jest.spyOn(prisma.user, 'findUnique').mockImplementation(args => find(args).then(result => { if (++calls === 2) delete process.env.EMAIL_DIAGNOSTICS_ADMIN_USER_IDS; return result; }) as unknown as ReturnType<typeof prisma.user.findUnique>);
    expect((await send()).status).toBe(403); expect(sendEmail).not.toHaveBeenCalled();
  });
  it('fails closed on authentication storage or signing configuration failure', async () => {
    const bearer = token(); const find = jest.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(Error('private-database-url'));
    expect((await send(bearer)).body).toEqual({ errorCode: 'EMAIL_DIAGNOSTICS_UNAVAILABLE' }); find.mockRestore();
    delete process.env.JWT_SECRET; expect((await send(bearer)).status).toBe(503); expect(sendEmail).not.toHaveBeenCalled();
  });
  it('keeps a stalled provider bounded and leaves capability GET read-only while one call remains in flight', async () => {
    let finish!: (value: unknown) => void; (sendEmail as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const sending = send().then(response => response);
    for (let i = 0; i < 100 && !(sendEmail as jest.Mock).mock.calls.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(sendEmail).toHaveBeenCalledTimes(1); expect((await read()).body.canSend).toBe(true);
    expect((await send()).status).toBe(429); const timedOut = await sending;
    expect(timedOut.status).toBe(503); expect(timedOut.body).toEqual({ success: false, errorCode: 'EMAIL_DIAGNOSTICS_UNCONFIRMED' });
    finish({ success: true, id: 'synthetic-late-id' }); await new Promise(resolve => setImmediate(resolve)); expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
