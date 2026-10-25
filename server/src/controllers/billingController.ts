import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { listingCreationGate, ListingCreationError } from '../lib/listingCreation';
import { BILLING_PRODUCTS, billingPurchasesAvailable, billingEnvironment, BillingError } from '../lib/billingCatalog';
import { accountBinding } from '../lib/storeVerification';
import { refreshBilling, verifiedPremium, verifyStorePurchase } from '../lib/billingService';
import { inquiryAllowance } from '../lib/inquiryAllowance';
export function billingFailure(res: Response, error: unknown) {
    if (error instanceof ListingCreationError) return res.status(error.status).json({ error: '請重新登入原帳號。', errorCode: error.code });
    const status = error instanceof BillingError ? error.status : 503;
    return res.status(status).json({ error: status === 422 || status === 403 || status === 409 ? '此筆付款尚未通過帳號與商店核對，請保留原交易並重新查核。' : '付款與權益暫時無法核對，請稍後重新查核。', errorCode: error instanceof BillingError ? error.code : 'BILLING_VERIFICATION_UNAVAILABLE' });
}
export async function billingBenefits(req: AuthRequest, res: Response) {
    if (!req.user) return res.sendStatus(401);
    res.set('Cache-Control', 'private, no-store');
    try {
        await refreshBilling(req.user.id);
        const benefits = await prisma.$transaction(async tx => {
            await listingCreationGate(tx, req, req.user!.id);
            const premium = await verifiedPremium(tx, req.user!.id);
            const quota = await inquiryAllowance(tx, req.user!.id, premium);
            const user = await tx.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { billingAccountToken: true } });
            return { inquiry: quota, accountToken: user.billingAccountToken, obfuscatedAccountId: accountBinding(user.billingAccountToken) };
        });
        return res.json({ ...benefits, environment: billingEnvironment(req.user.id), products: BILLING_PRODUCTS,
            availability: { apple: billingPurchasesAvailable('APPLE',req.user.id), google: billingPurchasesAvailable('GOOGLE',req.user.id), web: false } });
    } catch (error) { return billingFailure(res, error); }
}
export async function verifyBillingReceipt(req: AuthRequest, res: Response) {
    if (!req.user) return res.sendStatus(401);
    res.set('Cache-Control', 'private, no-store');
    try {
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['provider', 'productId', 'receipt'].includes(key)) || !['APPLE', 'GOOGLE'].includes(body.provider)) throw new BillingError('BILLING_INVALID_RECEIPT', 422);
        return res.json(await verifyStorePurchase(req.user.id, body.provider, body.productId, body.receipt));
    } catch (error) { return billingFailure(res, error); }
}
