import { billingEnabled, billingEnvironment, billingPurchasesAvailable } from '../lib/billingCatalog';

const previous = { ...process.env };
beforeEach(() => {
    process.env = { ...previous };
    for (const name of Object.keys(process.env)) if (/^(BILLING_|APPLE_BILLING_|GOOGLE_BILLING_)/.test(name)) delete process.env[name];
    Object.assign(process.env, {
        BILLING_RECEIPT_KEY: Buffer.alloc(32, 9).toString('base64'),
        APPLE_BILLING_ENABLED: '1', GOOGLE_BILLING_ENABLED: '1',
        APPLE_IAP_PRIVATE_KEY: 'synthetic-configured-key', APPLE_IAP_KEY_ID: 'synthetic-id',
        APPLE_IAP_ISSUER_ID: 'synthetic-issuer', GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: 'synthetic-configured-service-account',
        BILLING_SANDBOX_USER_IDS: '946',
    });
});
afterAll(() => { process.env = previous; });

test('checkout stays closed by default despite provider credentials', () => {
    expect(billingEnabled('APPLE')).toBe(true);
    expect(billingEnabled('GOOGLE')).toBe(true);
    for (const user of [42, 946]) for (const provider of ['APPLE', 'GOOGLE'] as const)
        expect(billingPurchasesAvailable(provider, user)).toBe(false);
});
test('Google production can open while Apple new purchases remain closed', () => {
    Object.assign(process.env, { BILLING_PRODUCTION_ENABLED: '1', GOOGLE_BILLING_PRODUCTION_ENABLED: '1', APPLE_BILLING_PRODUCTION_ENABLED: '0' });
    expect(billingPurchasesAvailable('GOOGLE', 42)).toBe(true);
    expect(billingPurchasesAvailable('APPLE', 42)).toBe(false);
    expect(billingEnabled('APPLE')).toBe(true); // Restore/reconciliation remains independent.
    expect(billingPurchasesAvailable('GOOGLE', 946)).toBe(false);
});
test('global production off overrides both platform opt-ins', () => {
    Object.assign(process.env, { BILLING_PRODUCTION_ENABLED: '0', GOOGLE_BILLING_PRODUCTION_ENABLED: '1', APPLE_BILLING_PRODUCTION_ENABLED: '1' });
    expect(billingPurchasesAvailable('GOOGLE', 42)).toBe(false);
    expect(billingPurchasesAvailable('APPLE', 42)).toBe(false);
});
test('Sandbox is allowlisted and independently gated per platform', () => {
    Object.assign(process.env, { BILLING_SANDBOX_ENABLED: '1', APPLE_BILLING_SANDBOX_ENABLED: '1', GOOGLE_BILLING_SANDBOX_ENABLED: '0' });
    expect(billingEnvironment(946)).toBe('Sandbox');
    expect(billingEnvironment(42)).toBe('Production');
    expect(billingPurchasesAvailable('APPLE', 946)).toBe(true);
    expect(billingPurchasesAvailable('GOOGLE', 946)).toBe(false);
    expect(billingPurchasesAvailable('APPLE', 42)).toBe(false);
});
test.each(['0', '', 'true', 'false', 'yes', '2'])('platform gate %j fails closed', value => {
    Object.assign(process.env, { BILLING_PRODUCTION_ENABLED: '1', GOOGLE_BILLING_PRODUCTION_ENABLED: value });
    expect(billingPurchasesAvailable('GOOGLE', 42)).toBe(false);
});
test('unset platform gates preserve the existing global rollout contract', () => {
    process.env.BILLING_PRODUCTION_ENABLED = '1';
    expect(billingPurchasesAvailable('APPLE', 42)).toBe(true);
    expect(billingPurchasesAvailable('GOOGLE', 42)).toBe(true);
});
test('invalid receipt encryption or missing provider configuration still prevents checkout', () => {
    process.env.BILLING_PRODUCTION_ENABLED = '1';
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    expect(billingPurchasesAvailable('GOOGLE', 42)).toBe(false);
    process.env.BILLING_RECEIPT_KEY = Buffer.alloc(31).toString('base64');
    expect(billingPurchasesAvailable('APPLE', 42)).toBe(false);
});
