import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import userRoutes from '../../routes/userRoutes';
import paymentRoutes from '../../routes/paymentRoutes';

require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');

const previousSecret = process.env.JWT_SECRET;
const secret = 'payment-availability-isolated-test-only';
process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json());
app.use('/api/users', userRoutes); app.use('/api/payment', paymentRoutes);
let freeId: number, legacyPremiumId: number;
const token = (id: number) => jwt.sign({ id, authVersion: 0 }, secret);
const paths = [
    '/api/users/me/subscription',
    '/api/users/me/subscription/cancel',
    '/api/payment/pay',
    '/api/payment/cancel-subscription',
];

beforeAll(async () => {
    const suffix = randomUUID();
    const users = await prisma.$transaction([
        prisma.user.create({ data: { phoneNumber: 'payment-free-' + suffix, password: 'synthetic-hash', isPremium: false } }),
        prisma.user.create({ data: { phoneNumber: 'payment-premium-' + suffix, password: 'synthetic-hash', isPremium: true } }),
    ]);
    freeId = users[0].id; legacyPremiumId = users[1].id;
});
afterAll(async () => {
    if (freeId && legacyPremiumId) await prisma.user.deleteMany({ where: { id: { in: [freeId, legacyPremiumId] } } });
    await prisma.$disconnect();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});

describe('legacy payment controls are closed until provider verification exists', () => {
    it.each(paths)('requires authentication for %s', async path => {
        expect((await request(app).post(path).send({ type: 'premium', purchaseType: 'PREMIUM', details: { amount: 90 } })).status).toBe(401);
    });

    it.each(paths)('refuses %s without changing free account or purchase history', async path => {
        const before = await prisma.purchase.count({ where: { userId: freeId } });
        const result = await request(app).post(path).set('Authorization', 'Bearer ' + token(freeId))
            .send({ type: 'premium', purchaseType: 'PREMIUM', prime: 'synthetic-prime', details: { amount: 90 } });
        expect(result.status).toBe(503);
        expect(result.body.errorCode).toBe('PAYMENT_VERIFICATION_REQUIRED');
        expect(result.headers['cache-control']).toBe('private, no-store');
        expect(await prisma.user.findUniqueOrThrow({ where: { id: freeId }, select: { isPremium: true } })).toEqual({ isPremium: false });
        expect(await prisma.purchase.count({ where: { userId: freeId } })).toBe(before);
    });

    it.each(paths)('preserves existing Premium rights through %s', async path => {
        const before = await prisma.purchase.count({ where: { userId: legacyPremiumId } });
        const response = await request(app).post(path).set('Authorization', 'Bearer ' + token(legacyPremiumId))
            .send({ purchaseType: 'limit', details: { amount: 30 }, prime: 'synthetic-prime' });
        expect(response.status).toBe(503);
        expect(await prisma.user.findUniqueOrThrow({ where: { id: legacyPremiumId }, select: { isPremium: true } })).toEqual({ isPremium: true });
        expect(await prisma.purchase.count({ where: { userId: legacyPremiumId } })).toBe(before);
    });
});
