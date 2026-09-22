import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID, randomInt } from 'crypto';
// Prevent all real email delivery, SDK initialization and credential loading.
jest.mock('../../lib/emailService', () => ({ sendEmail: jest.fn(async () => ({ success: true, id: 'synthetic-mail' })) }));
import prisma from '../../lib/prisma';
import authRoutes from '../../routes/authRoutes';
import userRoutes from '../../routes/userRoutes';
import wishRoutes from '../../routes/nativeWishRoutes';
import { sendEmail } from '../../lib/emailService';
import { optionalAuthenticateToken, AuthRequest } from '../../middleware/auth';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'account-security-integration-only'; const oldSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/auth', authRoutes); app.use('/api/users', userRoutes); app.use('/api/native-wishes', wishRoutes);
app.get('/optional', optionalAuthenticateToken, (req: AuthRequest, res) => res.json({ user: req.user ?? null }));
const server = createServer(app); let owner: number, outsider: number, phone: string, hash: string, ip = 0;
const additionalOwners: number[] = [];
const originalPassword = 'Original123', nextPassword = 'Changed456', key = 'synthetic-personal-api-key-' + randomUUID();
const api = (method: 'get' | 'post' | 'put', path: string, bearer?: string) => {
    const call = request(server)[method](path).set('X-Forwarded-For', `192.0.2.${++ip}`);
    return bearer ? call.set('Authorization', 'Bearer ' + bearer) : call;
};
const login = async (password = originalPassword) => {
    const res = await api('post', '/api/auth/login').send({ phoneNumber: phone, password }); expect(res.status).toBe(200); return res.body.token as string;
};
const legacy = () => jwt.sign({ id: owner, isAdmin: true }, secret, { algorithm: 'HS256' });
const change = (token: string, body: object) => api('put', '/api/users/me/password', token).send(body);
const revoke = (token: string, body: object = { currentPassword: originalPassword }) => api('post', '/api/users/me/sessions/revoke', token).send(body);
const me = (token: string) => api('get', '/api/users/me', token);
const reset = (token: string, newPassword = nextPassword) => api('post', '/api/auth/reset-password').send({ token, newPassword });
const nonce = 'b'.repeat(64), future = () => new Date(Date.now() + 60000);
beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    hash = await bcrypt.hash(originalPassword, 10); phone = 'account-security-' + randomUUID();
    owner = (await prisma.user.create({ data: { phoneNumber: phone, password: hash, name: '合成帳號', email: phone + '@example.invalid', isEmailVerified: true } })).id;
    outsider = (await prisma.user.create({ data: { phoneNumber: 'account-outsider-' + randomUUID(), password: hash } })).id;
});
beforeEach(async () => {
    (sendEmail as jest.Mock).mockReset().mockResolvedValue({ success: true, id: 'synthetic-mail' });
    await prisma.user.update({ where: { id: owner }, data: { password: hash, authVersion: 0, apiKey: key, otp: null, otpExpires: null, passwordResetToken: null, passwordResetExpires: null, emailVerificationToken: null, emailVerificationExpires: null, isEmailVerified: true } });
});
afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner, outsider, ...additionalOwners] } } }); await prisma.$disconnect();
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
});
describe('account security / actual API routers and isolated PostgreSQL', () => {
    it('allows version-zero legacy sessions without leaking token role claims', async () => {
        expect((await me(legacy())).status).toBe(200);
        expect((await api('get', '/optional', legacy())).body).toEqual({ user: { id: owner } });
        expect(jwt.decode(await login())).toMatchObject({ id: owner, authVersion: 0 });
    });
    it('requires fresh password proof for session revocation, then revokes legacy and minted JWTs', async () => {
        const minted = await login(), old = legacy(); expect((await revoke(minted, { currentPassword: 'Wrong123' })).status).toBe(401);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: owner } })).authVersion).toBe(0);
        const res = await revoke(minted); expect(res.status).toBe(200); expect(res.body).toEqual({ changed: true, requiresLogin: true });
        expect((await me(old)).status).toBe(401); expect((await me(minted)).status).toBe(401);
        expect((await api('get', '/api/native-wishes/lists', old)).status).toBe(401);
        expect((await api('get', '/optional', old)).body).toEqual({ user: null });
        const fresh = await login(); expect(jwt.decode(fresh)).toMatchObject({ authVersion: 1 }); expect((await me(fresh)).status).toBe(200);
        expect((await api('get', '/api/users/me').set('x-api-key', key)).status).toBe(200);
    });
    it('changes the password and revokes both prior JWTs and personal API credentials', async () => {
        const token = await login(); await prisma.user.update({ where: { id: owner }, data: { otp: '123456', otpExpires: future(), passwordResetToken: nonce, passwordResetExpires: future() } });
        const changed = await change(token, { currentPassword: originalPassword, newPassword: nextPassword });
        expect(changed.status).toBe(200); expect(changed.body).toEqual({ changed: true, requiresLogin: true, personalApiKeysRevoked: true });
        const user = await prisma.user.findUniqueOrThrow({ where: { id: owner } });
        expect(user).toMatchObject({ authVersion: 1, apiKey: null, otp: null, otpExpires: null, passwordResetToken: null, passwordResetExpires: null });
        expect(await bcrypt.compare(nextPassword, user.password)).toBe(true); expect(await bcrypt.compare(originalPassword, user.password)).toBe(false);
        expect((await me(token)).status).toBe(401); expect((await api('get', '/api/users/me').set('x-api-key', key)).status).toBe(401);
        expect((await api('post', '/api/auth/login').send({ phoneNumber: phone, password: originalPassword })).status).toBe(400);
        expect((await me(await login(nextPassword))).status).toBe(200);
    });
    it('rejects weak, bcrypt-truncated and injected security payloads without changing credentials', async () => {
        const token = await login();
        for (const body of [
            { currentPassword: originalPassword, newPassword: 'weak' },
            { currentPassword: originalPassword, newPassword: 'A1' + 'a'.repeat(71) },
            { currentPassword: originalPassword, newPassword: nextPassword, userId: outsider },
            { currentPassword: originalPassword, newPassword: nextPassword, authVersion: 999 },
            { currentPassword: ['Original123'], newPassword: nextPassword },
        ]) expect((await change(token, body)).status).toBe(400);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: owner } }))).toMatchObject({ password: hash, authVersion: 0, apiKey: key });
    });
    it('serializes competing password changes, requiring current credentials under the user lock', async () => {
        const token = await login(); const results = await Promise.all([nextPassword, 'Different789'].map(newPassword => change(token, { currentPassword: originalPassword, newPassword })));
        expect(results.map(r => r.status).sort()).toEqual([200, 401]);
        const user = await prisma.user.findUniqueOrThrow({ where: { id: owner } }); expect(user.authVersion).toBe(1);
        const winner = results[0].status === 200 ? nextPassword : 'Different789'; expect(await bcrypt.compare(winner, user.password)).toBe(true);
    });
    it.each([null, new Date(0)])('rejects reset links without a live expiry %p', async expiry => {
        await prisma.user.update({ where: { id: owner }, data: { passwordResetToken: nonce, passwordResetExpires: expiry } });
        expect((await reset(nonce)).status).toBe(400); expect((await prisma.user.findUniqueOrThrow({ where: { id: owner } })).authVersion).toBe(0);
    });
    it('consumes a reset nonce once under concurrency and invalidates old sessions and API keys', async () => {
        const token = await login(); await prisma.user.update({ where: { id: owner }, data: { passwordResetToken: nonce, passwordResetExpires: future(), otp: '123456', otpExpires: future() } });
        const results = await Promise.all([reset(nonce), reset(nonce)]); expect(results.map(r => r.status).sort()).toEqual([200, 400]);
        expect(results.find(r => r.status === 200)!.body).toMatchObject({ changed: true, requiresLogin: true, personalApiKeysRevoked: true });
        expect((await reset(nonce)).status).toBe(400);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: owner } }))).toMatchObject({ authVersion: 1, apiKey: null, passwordResetToken: null, passwordResetExpires: null, otp: null, otpExpires: null });
        expect((await me(token)).status).toBe(401); expect((await api('get', '/api/users/me').set('x-api-key', key)).status).toBe(401); expect((await me(await login(nextPassword))).status).toBe(200);
    });
    it('consumes email verification once and never accepts missing expiration', async () => {
        await prisma.user.update({ where: { id: owner }, data: { isEmailVerified: false, emailVerificationToken: nonce, emailVerificationExpires: null } });
        expect((await api('post', '/api/auth/verify-email').send({ token: nonce })).status).toBe(400);
        await prisma.user.update({ where: { id: owner }, data: { emailVerificationExpires: future(), authVersion: 2 } });
        const results = await Promise.all([1, 2].map(() => api('post', '/api/auth/verify-email').send({ token: nonce })));
        expect(results.map(r => r.status).sort()).toEqual([200, 400]); const token = results.find(r => r.status === 200)!.body.token;
        expect(jwt.decode(token)).toMatchObject({ authVersion: 2 }); expect((await me(token)).status).toBe(200);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: owner } }))).toMatchObject({ isEmailVerified: true, emailVerificationToken: null, emailVerificationExpires: null });
    });
    it('keeps secrets out of both profile read and profile update responses', async () => {
        await prisma.user.update({ where: { id: owner }, data: { otp: '123456', otpExpires: future(), passwordResetToken: nonce, passwordResetExpires: future(), emailVerificationToken: 'c'.repeat(64), emailVerificationExpires: future() } });
        const token = await login(); const read = await me(token), edited = await api('put', '/api/users/me', token).send({ name: '合成新名稱' });
        for (const res of [read, edited]) {
            expect(res.status).toBe(200); expect(res.headers['cache-control']).toBe('private, no-store'); expect(res.body).toMatchObject({ id: owner, phoneNumber: phone });
            for (const field of ['password', 'authVersion', 'apiKey', 'otp', 'otpExpires', 'passwordResetToken', 'passwordResetExpires', 'emailVerificationToken', 'emailVerificationExpires']) expect(res.body).not.toHaveProperty(field);
        }
        expect(edited.body.name).toBe('合成新名稱');
    });
    it('rejects erased users in required auth and treats them as anonymous in optional auth', async () => {
        const user = await prisma.user.create({ data: { phoneNumber: 'erased-security-' + randomUUID(), password: hash } });
        try {
            const token = jwt.sign({ id: user.id, authVersion: 0 }, secret); expect((await me(token)).status).toBe(200);
            await prisma.user.delete({ where: { id: user.id } }); expect((await me(token)).status).toBe(401); expect((await api('get', '/optional', token)).body).toEqual({ user: null });
        } finally { await prisma.user.deleteMany({ where: { id: user.id } }); }
    });
    it('checks the password before returning verification details', async () => {
        await prisma.user.update({ where: { id: owner }, data: { isEmailVerified: false } });
        const wrong = await api('post', '/api/auth/login').send({ phoneNumber: phone, password: 'Wrong123' });
        expect(wrong.status).toBe(400); expect(wrong.body).not.toHaveProperty('email');
        const right = await api('post', '/api/auth/login').send({ phoneNumber: phone, password: originalPassword }); expect(right.status).toBe(403); expect(right.body.errorCode).toBe('EMAIL_NOT_VERIFIED');
    });
    it('rejects injected authentication bodies and invalid bounded registration fields', async () => {
        for (const body of [[], { phoneNumber: phone, password: originalPassword, isAdmin: true }]) expect((await api('post', '/api/auth/login').send(body)).status).toBe(400);
        const base = { phoneNumber: 'synthetic-register-' + randomUUID(), email: 'synthetic-' + randomUUID() + '@example.invalid', password: originalPassword };
        for (const body of [{ ...base, isPremium: true }, { ...base, email: ['invalid'] }, { ...base, email: 'not-email' }, { ...base, name: {} }, { ...base, birthday: [] }]) expect((await api('post', '/api/auth/register').send(body)).status).toBe(400);
        expect(await prisma.user.count({ where: { phoneNumber: base.phoneNumber } })).toBe(0); expect(sendEmail).not.toHaveBeenCalled();
    });
    it.each([true, false])('reports actual synthetic verification-mail delivery %p without claiming verification', async delivered => {
        (sendEmail as jest.Mock).mockResolvedValue({ success: delivered, error: delivered ? undefined : 'synthetic-private-provider-error' });
        const phoneNumber = 'synthetic-register-' + randomUUID();
        const res = await api('post', '/api/auth/register').send({ phoneNumber, email: phoneNumber + '@example.invalid', password: originalPassword });
        const created = await prisma.user.findUnique({ where: { phoneNumber } }); if (created) additionalOwners.push(created.id);
        expect(res.status).toBe(201); expect(res.headers['cache-control']).toBe('private, no-store'); expect(res.body.emailVerification.sent).toBe(delivered); expect(res.body.emailVerification.required).toBe(true);
        expect(created?.isEmailVerified).toBe(false); expect(jwt.decode(res.body.token)).toMatchObject({ id: created!.id, authVersion: 0 }); expect(JSON.stringify(res.body)).not.toContain('synthetic-private-provider-error');
    });
    it('consumes an existing server-issued OTP only once, without creating an SMS provider or token', async () => {
        await prisma.user.update({ where: { id: owner }, data: { otp: '123456', otpExpires: future(), isPhoneVerified: false } });
        const results = await Promise.all([1, 2].map(() => api('post', '/api/auth/verify-otp').send({ phoneNumber: phone, otp: '123456' })));
        expect(results.map(r => r.status).sort()).toEqual([200, 400]); expect(results.find(r => r.status === 200)!.body).not.toHaveProperty('token');
        expect((await prisma.user.findUniqueOrThrow({ where: { id: owner } }))).toMatchObject({ otp: null, otpExpires: null, isPhoneVerified: true, authVersion: 0 });
    });
    it('keeps public resend responses uniform for missing, verified and unverified accounts', async () => {
        const absent = await api('post', '/api/auth/resend-verification').send({ email: 'absent-' + randomUUID() + '@example.invalid' });
        const user = await prisma.user.findUniqueOrThrow({ where: { id: owner } });
        const verified = await api('post', '/api/auth/resend-verification').send({ email: user.email }); expect(sendEmail).not.toHaveBeenCalled();
        await prisma.user.update({ where: { id: owner }, data: { isEmailVerified: false } });
        const attempted = await api('post', '/api/auth/resend-verification').send({ email: user.email });
        const firstToken = (await prisma.user.findUniqueOrThrow({ where: { id: owner } })).emailVerificationToken;
        (sendEmail as jest.Mock).mockResolvedValue({ success: false, error: 'synthetic-private-provider-error' });
        const failed = await api('post', '/api/auth/resend-verification').send({ email: user.email });
        for (const res of [absent, verified, attempted, failed]) { expect(res.status).toBe(200); expect(res.body).toEqual(absent.body); expect(res.body).not.toHaveProperty('messageId'); expect(res.body).not.toHaveProperty('sentTo'); }
        const currentToken = (await prisma.user.findUniqueOrThrow({ where: { id: owner } })).emailVerificationToken;
        expect(firstToken).toMatch(/^[0-9a-f]{64}$/); expect(currentToken).not.toBe(firstToken);
        expect((await api('post', '/api/auth/verify-email').send({ token: firstToken })).status).toBe(400);
    });
    it('rate-limits actual account recovery endpoints before excessive mail attempts', async () => {
        const statuses: number[] = [];
        for (let n = 0; n < 6; n++) statuses.push((await request(server).post('/api/auth/forgot-password').set('X-Forwarded-For', '198.51.100.200').send({ email: 'absent-' + randomUUID() + '@example.invalid' })).status);
        expect(statuses).toEqual([200, 200, 200, 200, 200, 429]); expect(sendEmail).not.toHaveBeenCalled();
    });
    it('completes real register, Email proof, password login, wish creation and reset without losing wishes', async () => {
        const phoneNumber = '09' + randomInt(100000000).toString().padStart(8, '0'), email = 'native-onboarding-' + randomUUID() + '@example.invalid';
        const registration = await api('post', '/api/auth/register').send({ name: '合成新用戶', phoneNumber, email, password: originalPassword });
        const created = await prisma.user.findUnique({ where: { phoneNumber } }); if (created) additionalOwners.push(created.id);
        expect(registration.status).toBe(201); expect(registration.body.emailVerification).toMatchObject({ required: true, sent: true, sentTo: email });
        expect((await api('post', '/api/auth/login').send({ phoneNumber: email, password: originalPassword })).status).toBe(403);
        const proof = await api('post', '/api/auth/verify-email').send({ token: created!.emailVerificationToken }); expect(proof.status).toBe(200);
        const entered = await api('post', '/api/auth/login').send({ phoneNumber: email, password: originalPassword }); expect(entered.status).toBe(200);
        const oldSession = entered.body.token;
        expect((await me(oldSession)).body).toMatchObject({ id: created!.id, isEmailVerified: true });
        const wish = await api('post', '/api/native-wishes/lists', oldSession).send({ clientRequestId: randomUUID(), title: '合成願望，重設後保留' }); expect(wish.status).toBe(201);
        expect((await api('post', '/api/auth/forgot-password').send({ email })).status).toBe(200);
        const resetToken = (await prisma.user.findUniqueOrThrow({ where: { id: created!.id } })).passwordResetToken;
        expect(resetToken).toMatch(/^[0-9a-f]{64}$/); expect((await reset(resetToken!)).status).toBe(200);
        expect((await me(oldSession)).status).toBe(401);
        const renewed = await api('post', '/api/auth/login').send({ phoneNumber, password: nextPassword }); expect(renewed.status).toBe(200);
        const lists = await api('get', '/api/native-wishes/lists', renewed.body.token); expect(lists.status).toBe(200);
        expect(lists.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: wish.body.resource.id, title: '合成願望，重設後保留' })]));
        expect((await reset(resetToken!)).status).toBe(400);
    });
});
