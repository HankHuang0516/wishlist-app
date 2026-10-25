import { createCipheriv, createDecipheriv, createHash, createSign, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import axios from 'axios';
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { BillingEnvironment, BillingError, BillingProductId, BillingProvider } from './billingCatalog';

export const APPLE_BUNDLE_ID = 'com.hankhuang.weesh';
export const GOOGLE_PACKAGE = 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1';
export const accountBinding = (token: string) => createHash('sha256').update(token.toLowerCase()).digest('hex');
export const purchaseReference = (provider: BillingProvider, environment: BillingEnvironment, id: string) =>
    createHash('sha256').update(`${provider}:${environment}:${id}`).digest('hex');
function encryptionKey() {
    const key = Buffer.from(process.env.BILLING_RECEIPT_KEY?.trim() ?? '', 'base64');
    if (key.length !== 32) throw new BillingError('BILLING_NOT_CONFIGURED');
    return key;
}
// Receipt tokens are bearer credentials. Persist authenticated ciphertext only;
// bind it to the immutable purchase reference to prevent swapping rows.
export function sealReceipt(value: string, reference: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
    cipher.setAAD(Buffer.from(reference));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function openReceipt(value: string, reference: string) {
    const raw = Buffer.from(value, 'base64');
    if (raw.length < 29) throw new BillingError('BILLING_RECEIPT_UNAVAILABLE');
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12));
    cipher.setAAD(Buffer.from(reference)); cipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([cipher.update(raw.subarray(28)), cipher.final()]).toString('utf8');
}
export type VerifiedPurchase = {
    provider: BillingProvider; productId: BillingProductId; externalId: string;
    environment: BillingEnvironment; binding: string; active: boolean; expiresAt: Date | null;
    amount: number; currency: string; receipt: string; needsFinish?: boolean;
};
function apple(environment: BillingEnvironment) {
    const env = environment === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX;
    const roots = ['AppleRootCA-G2.cer', 'AppleRootCA-G3.cer'].map(name => readFileSync(path.resolve(__dirname, '../../certs', name)));
    const verifier = new SignedDataVerifier(roots, true, env, APPLE_BUNDLE_ID, 6468950847);
    const client = new AppStoreServerAPIClient(process.env.APPLE_IAP_PRIVATE_KEY?.trim() ?? '',
        process.env.APPLE_IAP_KEY_ID?.trim() ?? '', process.env.APPLE_IAP_ISSUER_ID?.trim() ?? '', APPLE_BUNDLE_ID, env);
    return { verifier, client };
}
export async function verifyApple(productId: BillingProductId, receipt: string, environment: BillingEnvironment): Promise<VerifiedPurchase> {
    const { verifier, client } = apple(environment);
    // Only an already verified transaction ID is allowed into the provider API.
    const original = await verifier.verifyAndDecodeTransaction(receipt);
    if (!original.transactionId || original.productId !== productId) throw new BillingError('BILLING_INVALID_RECEIPT', 422);
    const result = await client.getTransactionInfo(original.transactionId);
    if (!result.signedTransactionInfo) throw new BillingError('BILLING_INVALID_RECEIPT', 422);
    let transaction = await verifier.verifyAndDecodeTransaction(result.signedTransactionInfo);
    if (productId === 'wishlist_premium_monthly') {
        const status = await client.getAllSubscriptionStatuses(original.transactionId);
        const candidates: JWSTransactionDecodedPayload[] = [];
        for (const group of status.data ?? []) for (const item of group.lastTransactions ?? []) {
            if (![1, 4].includes(Number(item.status)) || !item.signedTransactionInfo) continue;
            const decoded = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
            if (decoded.productId === productId && decoded.appAccountToken === original.appAccountToken) candidates.push(decoded);
        }
        transaction = candidates.sort((a, b) => (b.expiresDate ?? 0) - (a.expiresDate ?? 0))[0] ?? { ...transaction, expiresDate: 0 };
    }
    if (!transaction.transactionId || transaction.productId !== productId || !transaction.appAccountToken ||
        transaction.bundleId !== APPLE_BUNDLE_ID || transaction.environment !== environment || transaction.quantity !== 1 ||
        !Number.isFinite(transaction.price) || !/^[A-Z]{3}$/.test(transaction.currency ?? '')) throw new BillingError('BILLING_INVALID_RECEIPT', 422);
    return { provider: 'APPLE', productId, externalId: transaction.transactionId, environment,
        binding: accountBinding(transaction.appAccountToken), active: !transaction.revocationDate && !transaction.isUpgraded &&
            (productId !== 'wishlist_premium_monthly' || (transaction.expiresDate ?? 0) > Date.now()),
        expiresAt: productId === 'wishlist_premium_monthly' ? new Date(transaction.expiresDate ?? 0) : null,
        amount: transaction.price! / 1000, currency: transaction.currency!, receipt: result.signedTransactionInfo };
}

let access: { signature: string; value: string; until: number } | null = null;
async function googleAccessToken() {
    const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim() ?? '';
    const signature = createHash('sha256').update(raw).digest('hex');
    if (access?.signature === signature && access.until > Date.now() + 60000) return access.value;
    const key = JSON.parse(raw), now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })).toString('base64url');
    const value = `${header}.${claims}`, signer = createSign('RSA-SHA256'); signer.update(value);
    const assertion = `${value}.${signer.sign(key.private_key).toString('base64url')}`;
    const response = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), { timeout: 15000 });
    if (typeof response.data.access_token !== 'string') throw new BillingError('BILLING_PROVIDER_UNAVAILABLE');
    access = { signature, value: response.data.access_token, until: Date.now() + 3500000 };
    return access.value;
}
async function googleRequest(suffix: string, method: 'GET' | 'POST' = 'GET') {
    const result = await axios.request({ url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE}/${suffix}`,
        method, headers: { Authorization: `Bearer ${await googleAccessToken()}` }, timeout: 15000, ...(method === 'POST' ? { data: {} } : {}) });
    return result.data;
}
export async function verifyGoogle(productId: BillingProductId, token: string, environment: BillingEnvironment): Promise<VerifiedPurchase> {
    const subscription = productId === 'wishlist_premium_monthly';
    const result = await googleRequest(subscription ? `purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`
        : `purchases/products/${productId}/tokens/${encodeURIComponent(token)}`);
    const test = subscription ? !!result.testPurchase : result.purchaseType === 0;
    if (test !== (environment === 'Sandbox')) throw new BillingError('BILLING_ENVIRONMENT_MISMATCH', 422);
    if (!subscription && result.purchaseState === 2) throw new BillingError('BILLING_PURCHASE_PENDING', 409);
    const item = subscription ? result.lineItems?.find((row: any) => row.productId === productId) : null;
    const expiry = subscription && item?.expiryTime ? new Date(item.expiryTime) : null;
    const binding = subscription ? result.externalAccountIdentifiers?.obfuscatedExternalAccountId : result.obfuscatedExternalAccountId;
    if (!/^[a-f0-9]{64}$/.test(binding ?? '') || subscription && (!item || !expiry || !Number.isFinite(expiry.getTime())) ||
        !subscription && (result.quantity ?? 1) !== 1) throw new BillingError('BILLING_INVALID_RECEIPT', 422);
    const active = subscription ? ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(result.subscriptionState) && expiry! > new Date()
        : result.purchaseState === 0;
    const orderId = item?.latestSuccessfulOrderId ?? result.latestOrderId ?? result.orderId;
    if (typeof orderId !== 'string' || !orderId || orderId.length > 200) throw new BillingError('BILLING_ORDER_UNCONFIRMED');
    // Price comes from the actual order, including tax/discounts, never the
    // client amount or a converted catalogue price. Test transactions cost 0.
    let amount=0,currency='XXX';
    if(environment==='Production'){
        const order=await googleRequest(`orders/${encodeURIComponent(orderId)}`);
        const price=order.lineItems?.find((row:any)=>row.productId===productId)?.total;
        amount=Number(price?.units??0)+Number(price?.nanos??0)/1e9;currency=price?.currencyCode??'';
        if(!price||!Number.isFinite(amount)||amount<0||!/^[A-Z]{3}$/.test(currency))throw new BillingError('BILLING_ORDER_UNCONFIRMED');
    }
    return { provider: 'GOOGLE', productId, externalId: orderId, environment, binding, active,
        expiresAt: expiry, amount, currency, receipt: token,
        needsFinish: subscription ? result.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' : result.consumptionState === 0 };
}
export async function finishGooglePurchase(productId: BillingProductId, token: string) {
    const prefix = `purchases/${productId === 'wishlist_premium_monthly' ? 'subscriptions' : 'products'}/${productId}/tokens/${encodeURIComponent(token)}`;
    // Consumables can be bought again. Consumption also acknowledges payment.
    await googleRequest(`${prefix}:${productId === 'wishlist_premium_monthly' ? 'acknowledge' : 'consume'}`, 'POST');
}
