export type InquiryAllowance = { premium: boolean; freeWeeklyLimit: 3; freeUsedThisWeek: number; freeRemaining: number; resetsAt: string; timeZone: 'Asia/Taipei' };
export type BillingBenefits = { inquiry: InquiryAllowance; accountToken: string; obfuscatedAccountId: string;
    environment: 'Production' | 'Sandbox'; availability: { apple: boolean; google: boolean; web: boolean } };
export function parseBillingBenefits(raw: unknown): BillingBenefits {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid benefits');
    const value = raw as BillingBenefits, q = value.inquiry;
    if (!q || typeof q.premium !== 'boolean' || q.freeWeeklyLimit !== 3 || !Number.isSafeInteger(q.freeUsedThisWeek) || q.freeUsedThisWeek < 0 || q.freeUsedThisWeek > 3 ||
        q.freeRemaining !== Math.max(0, 3 - q.freeUsedThisWeek) || q.timeZone !== 'Asia/Taipei' || !Number.isFinite(Date.parse(q.resetsAt)) ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.accountToken) || !/^[a-f0-9]{64}$/.test(value.obfuscatedAccountId) ||
        !['Production','Sandbox'].includes(value.environment) || !value.availability ||
        !['apple','google','web'].every(key => typeof value.availability[key as keyof typeof value.availability] === 'boolean')) throw new Error('Invalid benefits');
    return value;
}
