export const BILLING_PRODUCTS = [
    { id: 'wishlist_sponsor_90', kind: 'SPONSOR', amount: 90, currency: 'TWD', credits: 0 },
    { id: 'wishlist_premium_monthly', kind: 'SUBSCRIPTION', amount: 90, currency: 'TWD', credits: 0 },
    { id: 'wishlist_marketing_10', kind: 'MARKETING_CREDITS', amount: 1, currency: 'USD', credits: 10 },
] as const;
export type BillingProductId = typeof BILLING_PRODUCTS[number]['id'];
export type BillingProvider = 'APPLE' | 'GOOGLE';
export type BillingEnvironment = 'Production' | 'Sandbox';
export function billingProduct(id: unknown) { return BILLING_PRODUCTS.find(product => product.id === id); }
export class BillingError extends Error {
    constructor(readonly code: string, readonly status = 503) { super(code); }
}
export function billingEnvironment(userId: number): BillingEnvironment {
    return (process.env.BILLING_SANDBOX_USER_IDS ?? '').split(',').some(id => id.trim() === String(userId)) ? 'Sandbox' : 'Production';
}
export function billingEnabled(provider: BillingProvider) {
    const receiptKey = process.env.BILLING_RECEIPT_KEY?.trim();
    if (!receiptKey || Buffer.from(receiptKey, 'base64').length !== 32) return false;
    return provider === 'APPLE' ? process.env.APPLE_BILLING_ENABLED === '1' &&
        !!process.env.APPLE_IAP_PRIVATE_KEY?.trim() && !!process.env.APPLE_IAP_KEY_ID?.trim() && !!process.env.APPLE_IAP_ISSUER_ID?.trim()
        : process.env.GOOGLE_BILLING_ENABLED === '1' && !!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
}
export function billingPurchasesAvailable(provider: BillingProvider,userId:number) {
    return billingEnabled(provider) && (billingEnvironment(userId)==='Sandbox'
        ? process.env.BILLING_SANDBOX_ENABLED==='1' : process.env.BILLING_PRODUCTION_ENABLED==='1');
}
