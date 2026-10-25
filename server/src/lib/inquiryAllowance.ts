import { Prisma } from '@prisma/client';

export const INQUIRY_FREE_WEEKLY_LIMIT = 3;
const DAY = 86400000;
// Asia/Taipei has a fixed UTC+08 offset. A week starts Monday at 00:00 there.
export function inquiryWeek(now = new Date()) {
    const local = new Date(now.getTime() + 8 * 3600000);
    const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
        - ((local.getUTCDay() + 6) % 7) * DAY - 8 * 3600000;
    return { startsAt: new Date(monday), resetsAt: new Date(monday + 7 * DAY) };
}
export class InquiryAllowanceError extends Error {
    readonly code = 'INQUIRY_WEEKLY_LIMIT';
    constructor(readonly resetsAt: Date) { super('本週 3 次免費代問已用完，可於下週重置後使用，或升級尊榮版。'); }
}

// Preserve existing server-granted membership. Expired/revoked subscriptions
// never gain paid access through an unverified client boolean or a sponsorship.
export function legacyPremium(user: { isPremium: boolean; subscriptionStatus: string | null; subscriptionExpiresAt: Date | null }, now = new Date()) {
    return user.isPremium && !['EXPIRED', 'REVOKED'].includes(user.subscriptionStatus ?? '')
        && (!user.subscriptionExpiresAt || user.subscriptionExpiresAt > now);
}
export async function inquiryAllowance(tx: Prisma.TransactionClient, userId: number, premium: boolean, now = new Date()) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { inquiryWeekStart: true, inquiryFreeUsed: true } });
    const week = inquiryWeek(now);
    const used = user.inquiryWeekStart?.getTime() === week.startsAt.getTime() ? user.inquiryFreeUsed : 0;
    return { premium, freeWeeklyLimit: INQUIRY_FREE_WEEKLY_LIMIT, freeUsedThisWeek: used,
        freeRemaining: Math.max(0, INQUIRY_FREE_WEEKLY_LIMIT - used), resetsAt: week.resetsAt.toISOString(), timeZone: 'Asia/Taipei' as const };
}
// Caller holds the User row lock for the entire inquiry action transaction.
// Invocation is AFTER immutable operation replay and validation, BEFORE saving
// a newly authorized round. Any error rolls back both the counter and inquiry.
export async function reserveInquiry(tx: Prisma.TransactionClient, userId: number, premium: boolean, now = new Date()) {
    if (premium) return;
    const allowance = await inquiryAllowance(tx, userId, false, now);
    if (!allowance.freeRemaining) throw new InquiryAllowanceError(new Date(allowance.resetsAt));
    await tx.user.update({ where: { id: userId }, data: { inquiryWeekStart: inquiryWeek(now).startsAt, inquiryFreeUsed: allowance.freeUsedThisWeek + 1 } });
}
