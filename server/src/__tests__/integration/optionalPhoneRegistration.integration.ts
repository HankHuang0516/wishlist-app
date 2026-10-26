import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import { randomUUID } from 'crypto';
jest.mock('../../lib/emailService', () => ({ sendEmail: jest.fn(async () => ({ success: true })) }));
import prisma from '../../lib/prisma';
import authRoutes from '../../routes/authRoutes';
import userRoutes from '../../routes/userRoutes';
import socialRoutes from '../../routes/socialRoutes';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Isolated test DB required');
process.env.JWT_SECRET = 'optional-phone-isolated-test-secret';
const app = express(); app.set('trust proxy','loopback'); app.use(express.json()); app.use('/api/auth', authRoutes); app.use('/api/users', userRoutes); app.use('/api/users', socialRoutes);
const server = createServer(app), run = randomUUID(), emails: string[] = [];
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.user.deleteMany({ where: { email: { in: emails } } }); await prisma.$disconnect(); });
function fields() { const email = `${run}-${emails.length}@example.invalid`; emails.push(email); return { email, name: 'Email-only QA', password: 'Synthetic123!' }; }
it('registers, verifies and logs in with email only; persists NULL rather than a fabricated phone and supports old clients', async () => {
  const data = fields(), registered = await request(server).post('/api/auth/register').set('X-Forwarded-For', '192.0.2.' + (emails.length + 1)).send(data); expect(registered.status).toBe(201); expect(registered.body.user.contactPhoneNumber).toBeNull(); expect(registered.body.user.phoneNumber).toMatch(/^account:/);
  let user = await prisma.user.findUniqueOrThrow({ where: { email: data.email } }); expect(user.phoneNumber).toBeNull(); expect(user.isEmailVerified).toBe(false);
  expect((await request(server).post('/api/auth/login').send({ phoneNumber: data.email, password: data.password })).status).toBe(403);
  const verified = await request(server).post('/api/auth/verify-email').send({ token: user.emailVerificationToken }); expect(verified.status).toBe(200); expect(verified.body.user.contactPhoneNumber).toBeNull();
  const login = await request(server).post('/api/auth/login').send({ phoneNumber: data.email, password: data.password }); expect(login.status).toBe(200);
  expect(login.body.user.contactPhoneNumber).toBeNull(); expect(login.body.user.phoneNumber).toBe('account:' + user.id);
  const profile = await request(server).get('/api/users/me').set('Authorization', 'Bearer ' + login.body.token);
  expect(profile.status).toBe(200); expect(profile.body.contactPhoneNumber).toBeNull(); expect(profile.body.phoneNumber).toBe('account:' + user.id);
  expect(profile.body.password).toBeUndefined(); expect(profile.body.emailVerificationToken).toBeUndefined();
  user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } }); expect(user.phoneNumber).toBeNull();
});
it('accepts multiple distinct email-only accounts and normalizes a blank optional phone to NULL', async () => {
  for (const phoneNumber of [undefined, '', '  ', null]) {
    const data = fields(); const result = await request(server).post('/api/auth/register').set('X-Forwarded-For', '192.0.2.' + (emails.length + 1)).send({ ...data, phoneNumber }); expect(result.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: data.email } })).phoneNumber).toBeNull();
  }
});
it('still rejects malformed provided phones and duplicate email without creating an extra account', async () => {
  const data = fields(); expect((await request(server).post('/api/auth/register').set('X-Forwarded-For', '192.0.2.' + (emails.length + 1)).send({ ...data, phoneNumber: {} })).status).toBe(400);
  expect((await request(server).post('/api/auth/register').set('X-Forwarded-For', '192.0.2.' + (emails.length + 1)).send(data)).status).toBe(201);
  expect((await request(server).post('/api/auth/register').set('X-Forwarded-For', '192.0.2.' + (emails.length + 1)).send(data)).status).toBe(400);
  expect(await prisma.user.count({ where: { email: data.email } })).toBe(1);
});
it('keeps private and mutating endpoints authenticated for guests', async () => {
  expect((await request(server).get('/api/users/me')).status).toBe(401);
  expect((await request(server).post('/api/users/7/follow').send({})).status).toBe(401);
});
