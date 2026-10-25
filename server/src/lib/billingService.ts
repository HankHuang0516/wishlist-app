import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { billingEnvironment, billingEnabled, billingProduct, BillingError, BillingProvider } from './billingCatalog';
import { accountBinding, purchaseReference, sealReceipt, openReceipt, verifyApple, verifyGoogle, finishGooglePurchase, VerifiedPurchase } from './storeVerification';

export async function saveVerifiedPurchase(tx: Prisma.TransactionClient, userId: number, token: string, verified: VerifiedPurchase) {
    const product = billingProduct(verified.productId);
    if (!product || verified.binding !== accountBinding(token) || verified.environment !== billingEnvironment(userId))
        throw new BillingError('BILLING_ACCOUNT_MISMATCH', 403);
    const reference = purchaseReference(verified.provider, verified.environment, verified.externalId);
    const existing = await tx.purchase.findUnique({ where: { providerReference: reference } });
    // Null owner means an erased account. It must never be claimed again.
    if (existing && (existing.userId !== userId || existing.accountBinding !== verified.binding)) throw new BillingError('BILLING_ALREADY_CLAIMED', 409);
    const data = { status: verified.active ? 'COMPLETED' : 'REVOKED', expiresAt: verified.expiresAt,
        verifiedAt: new Date(), verificationData: { sealed: sealReceipt(verified.receipt, reference) },
        ...(!verified.active ? { creditRemaining: 0 } : {}) };
    if (existing) return tx.purchase.update({ where: { id: existing.id }, data });
    return tx.purchase.create({ data: { userId, type: verified.environment==='Sandbox'?'SANDBOX_'+product.kind:product.kind, amount: verified.amount, currency: verified.currency,
        provider: verified.provider, providerReference: reference, productId: product.id, environment: verified.environment,
        accountBinding: verified.binding, creditUnits: product.credits, creditRemaining: verified.active ? product.credits : 0, ...data } });
}

export async function verifiedPremium(tx: Prisma.TransactionClient, userId: number, now = new Date()) {
    // Legacy profile/capacity flags remain intact, but are not verified payment
    // evidence for the NEW inquiry and 100-use marketing subscription benefits.
    const paid = await tx.purchase.findFirst({ where: { userId, productId: 'wishlist_premium_monthly',
        environment: billingEnvironment(userId), status: 'COMPLETED', expiresAt: { gt: now } }, orderBy: { expiresAt: 'desc' } });
    if (!paid) return false;
    if (!paid.verifiedAt || now.getTime() - paid.verifiedAt.getTime() > 5 * 60000) throw new BillingError('BILLING_STATUS_UNAVAILABLE');
    return true;
}

export async function verifyStorePurchase(userId: number, provider: BillingProvider, productId: unknown, receipt: unknown) {
    const product = billingProduct(productId);
    if (!product || typeof receipt !== 'string' || receipt.length < 10 || receipt.length > 30000) throw new BillingError('BILLING_INVALID_RECEIPT', 422);
    if (!billingEnabled(provider)) throw new BillingError('BILLING_NOT_CONFIGURED');
    const env = billingEnvironment(userId), verify = provider === 'APPLE' ? verifyApple : verifyGoogle;
    // No database owner lock is held while contacting a store.
    const verified = await verify(product.id, receipt, env);
    const saved = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR NO KEY UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { billingAccountToken: true } });
        return saveVerifiedPurchase(tx, userId, user.billingAccountToken, verified);
    });
    // Commit a recoverable ledger BEFORE consumption/acknowledgment. If the
    // provider times out, an exact replay verifies and finishes the same row.
    if (provider === 'GOOGLE' && verified.active && verified.needsFinish) await finishGooglePurchase(product.id, receipt);
    return { purchaseId: saved.id, verified: true, active: verified.active, environment: verified.environment };
}

// Read-time refresh bounds the entitlement's staleness even if notifications
// are delayed. Failures keep the original ledger; never convert unknown to 0.
export async function refreshBilling(userId: number) {
    const purchases = await prisma.purchase.findMany({ where: { userId, providerReference: { not: null },
        status: 'COMPLETED', environment: billingEnvironment(userId),
        OR: [{ productId: 'wishlist_premium_monthly' }, { creditRemaining: { gt: 0 } }],
        verifiedAt: { lt: new Date(Date.now() - 4 * 60000) } }, take: 100 });
    for (const purchase of purchases) {
        if (!['APPLE', 'GOOGLE'].includes(purchase.provider ?? '') || !purchase.providerReference) throw new BillingError('BILLING_STATUS_UNAVAILABLE');
        const data = purchase.verificationData as { sealed?: string } | null;
        if (!data?.sealed) throw new BillingError('BILLING_STATUS_UNAVAILABLE');
        await verifyStorePurchase(userId, purchase.provider as BillingProvider, purchase.productId, openReceipt(data.sealed, purchase.providerReference));
        await prisma.purchase.update({where:{id:purchase.id},data:{verifiedAt:new Date()}});
    }
}

export async function reconcileMarketingCredits(tx: Prisma.TransactionClient, userId: number) {
    const purchases = await tx.purchase.findMany({ where: { userId, productId: 'wishlist_marketing_10',
        environment: billingEnvironment(userId), status: 'COMPLETED' }, include: { creditReservations: { where: { refundedAt: null } } } });
    for (const purchase of purchases) for (const reservation of purchase.creditReservations) {
        const job = await tx.marketingJob.findUnique({ where: { id: reservation.jobId }, select: { status: true } });
        // An erased job is not proof of generation failure; no automatic refund.
        if (job?.status !== 'FAILED') continue;
        const changed = await tx.marketingCreditReservation.updateMany({ where: { jobId: reservation.jobId, refundedAt: null }, data: { refundedAt: new Date() } });
        if (changed.count) await tx.purchase.update({ where: { id: purchase.id }, data: { creditRemaining: { increment: 1 } } });
    }
    return tx.purchase.aggregate({ where: { userId, productId: 'wishlist_marketing_10', status: 'COMPLETED',
        environment: billingEnvironment(userId) }, _sum: { creditRemaining: true } });
}

export async function reserveMarketingCredit(tx: Prisma.TransactionClient, userId: number, jobId: string) {
    const purchase = await tx.purchase.findFirst({ where: { userId, productId: 'wishlist_marketing_10', status: 'COMPLETED',
        environment: billingEnvironment(userId), creditRemaining: { gt: 0 }, verifiedAt: { gte: new Date(Date.now() - 5 * 60000) } }, orderBy: { id: 'asc' } });
    if (!purchase) throw new BillingError('MARKETING_CREDITS_EXHAUSTED', 429);
    const changed = await tx.purchase.updateMany({ where: { id: purchase.id, creditRemaining: { gt: 0 }, status: 'COMPLETED' }, data: { creditRemaining: { decrement: 1 } } });
    if (changed.count !== 1) throw new BillingError('MARKETING_CREDITS_EXHAUSTED', 429);
    await tx.marketingCreditReservation.create({ data: { jobId, purchaseId: purchase.id } });
}
