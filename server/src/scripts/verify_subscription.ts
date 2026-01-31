import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { payByPrime, cancelSubscription } from '../controllers/paymentController';
import axios from 'axios';

// Mock Axios
(axios as any).post = async (url: string, data: any) => {
    console.log('[Mock Axios] POST', url, data);
    return {
        data: {
            status: 0,
            msg: 'Success',
            rec_trade_id: 'test_trade_id_' + Date.now()
        }
    };
};

const mockRes = () => {
    const res: any = {};
    res.status = (code: number) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data: any) => {
        res.body = data;
        return res;
    };
    return res;
};

async function main() {
    console.log('--- Starting Subscription Verification ---');

    // 1. Create Test User
    const email = `test_sub_${Date.now()}@example.com`;
    const user = await prisma.user.create({
        data: {
            phoneNumber: `09${Math.floor(Math.random() * 100000000)}`,
            password: 'hashed_password',
            email
        }
    });
    console.log('Created User:', user.id);

    try {
        // 2. Test Subscribe (payByPrime)
        console.log('\n--- Testing Subscription Purchase ---');
        const reqBuy: any = {
            user: { id: user.id },
            body: {
                prime: 'test_prime_token',
                paymentMethod: 'credit_card',
                purchaseType: 'SUBSCRIPTION',
                details: {
                    amount: 90,
                    currency: 'TWD',
                    orderId: 'order_123'
                }
            }
        };
        const resBuy = mockRes();

        await payByPrime(reqBuy, resBuy);
        console.log('Buy Response:', resBuy.body);

        // Verify DB
        const userAfterBuy = await prisma.user.findUnique({ where: { id: user.id } });
        console.log('User Status:', {
            isPremium: userAfterBuy?.isPremium,
            status: userAfterBuy?.subscriptionStatus,
            expires: userAfterBuy?.subscriptionExpiresAt,
            autoRenew: userAfterBuy?.autoRenew
        });

        if (userAfterBuy?.subscriptionStatus !== 'ACTIVE') throw new Error('Subscription not active');
        if (!userAfterBuy?.subscriptionExpiresAt) throw new Error('No expiry date');
        if (userAfterBuy?.autoRenew !== true) throw new Error('AutoRenew should be true');

        // 3. Test Cancel (cancelSubscription)
        console.log('\n--- Testing Cancellation ---');
        const reqCancel: any = { user: { id: user.id } };
        const resCancel = mockRes();

        await cancelSubscription(reqCancel, resCancel);
        console.log('Cancel Response:', resCancel.body);

        // Verify DB
        const userAfterCancel = await prisma.user.findUnique({ where: { id: user.id } });
        console.log('User Status After Cancel:', {
            isPremium: userAfterCancel?.isPremium,
            status: userAfterCancel?.subscriptionStatus,
            expires: userAfterCancel?.subscriptionExpiresAt,
            autoRenew: userAfterCancel?.autoRenew
        });

        if (userAfterCancel?.autoRenew !== false) throw new Error('AutoRenew should be false');
        if (userAfterCancel?.subscriptionStatus !== 'CANCELED') throw new Error('Status should be CANCELED');
        if (userAfterCancel?.isPremium !== true) throw new Error('Should still be premium (benefits remain)');

        // 4. Clean up
        console.log('\n--- Cleaning up ---');
        await prisma.purchase.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
        console.log('Cleanup done.');

    } catch (e) {
        console.error('Test Failed:', e);
        // Attempt cleanup
        await prisma.user.delete({ where: { id: user.id } });
        process.exit(1);
    }
}

main();
