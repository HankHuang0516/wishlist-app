// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeBilling } from '../NativeBilling';
import { billingPlans, purchaseRequest } from '../billingPlans';
import type { BillingBenefits } from '../billingBenefits';
import type { StoreProduct } from '../billingPlans';

const store = vi.hoisted(() => ({
  callbacks: {} as any, platform: 'android', connected: true, products: [] as StoreProduct[], subscriptions: [] as StoreProduct[],
  fetchProducts: vi.fn(async () => {}), requestPurchase: vi.fn(async (_: unknown) => {}), finishTransaction: vi.fn(async () => {}),
  restore: vi.fn(async (_options?: unknown): Promise<any[]> => []), reconnect: vi.fn(async () => true), link: vi.fn(async (_url: string) => {}),
}));
vi.mock('expo-iap', () => ({ useIAP: (callbacks: unknown) => { store.callbacks = callbacks; return store; }, getAvailablePurchases: (options: unknown) => store.restore(options) }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { apiUrl: 'https://example.com/api' } } } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('../SafeAreaModal', () => ({ SafeAreaModal: ({ children }: any) => <div>{children}</div> }));
vi.mock('react-native', () => ({
  Platform: { get OS() { return store.platform; } }, Linking: { openURL: (url: string) => store.link(url) },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: any) => <div>{children}</div>, ScrollView: ({ children }: any) => <div data-native-scroll="true">{children}</div>,
  ActivityIndicator: () => <span>Loading</span>,
  Text: ({ children, accessibilityRole }: any) => <span role={accessibilityRole === 'alert' ? 'alert' : undefined}>{children}</span>,
  Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityRole }: any) => <button type="button" aria-label={accessibilityLabel}
    role={accessibilityRole === 'link' ? 'link' : undefined} disabled={disabled} onClick={onPress}>{children}</button>,
}));
const benefits: BillingBenefits = {
  inquiry: { premium: false, freeWeeklyLimit: 3, freeUsedThisWeek: 1, freeRemaining: 2, resetsAt: '2026-11-01T16:00:00Z', timeZone: 'Asia/Taipei' },
  accountToken: '16ccfd6d-427e-4a64-848f-fb51f3c03de8', obfuscatedAccountId: 'a'.repeat(64), environment: 'Production',
  availability: { apple: false, google: true, web: false },
};
const subscription = { id: billingPlans[0].id, displayPrice: 'NT$90.00', subscriptionOffers: [{ basePlanIdAndroid: 'monthly', offerTokenAndroid: 'synthetic-monthly-token' }] } as StoreProduct;
const receipt = { productId: billingPlans[0].id, purchaseState: 'purchased', purchaseToken: 'synthetic-receipt' };
let api: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); store.platform = 'android'; store.connected = true;
  store.products = [{ id: billingPlans[1].id, displayPrice: 'NT$35.00' }, { id: billingPlans[2].id, displayPrice: 'NT$90.00' }] as StoreProduct[];
  store.subscriptions = [subscription]; store.restore.mockResolvedValue([]); store.requestPurchase.mockResolvedValue();
  api = vi.fn(async (path: string) => path === '/payment/benefits' ? benefits : path === '/marketing/availability' ? { permanentCreditsRemaining: 7 }
    : { verified: true, active: true, environment: 'Production' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function open() {
  render(<NativeBilling api={api as any} />);
  fireEvent.click(await screen.findByRole('button', { name: '查看方案與購買' }));
  await screen.findByRole('button', { name: '查看尊榮方案' });
  await waitFor(() => expect(screen.queryByText('正在讀取商店價格…')).toBeNull());
}
async function detail() { await open(); fireEvent.click(screen.getByRole('button', { name: '查看尊榮方案' })); }
describe('native billing entry and purchase flow', () => {
  it('makes all three plans actionable and uses store currency with actual account balances', async () => {
    await open();
    expect(screen.getAllByText('永久行銷額度 7 次').length).toBeGreaterThan(0);
    expect(screen.getByText('NT$35.00')).toBeTruthy(); expect(screen.queryByText(/US\$1/)).toBeNull();
    for (const plan of billingPlans) {
      fireEvent.click(screen.getByRole('button', { name: plan.action }));
      expect(screen.getByText(plan.headline)).toBeTruthy();
      expect(store.requestPurchase).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '返回方案總覽' }));
    }
  });
  it('only the final explicit CTA opens the store, once, with correct account binding and monthly token', async () => {
    await detail(); const button = screen.getByRole('button', { name: '前往商店確認訂閱' });
    fireEvent.click(button); fireEvent.click(button);
    expect(store.requestPurchase).toHaveBeenCalledExactlyOnceWith({ type: 'subs', request: {
      apple: { sku: billingPlans[0].id, appAccountToken: benefits.accountToken },
      google: { skus: [billingPlans[0].id], obfuscatedAccountId: benefits.obfuscatedAccountId,
        subscriptionOffers: [{ sku: billingPlans[0].id, offerToken: 'synthetic-monthly-token' }] },
    } });
    expect(screen.getByRole('button', { name: '正在確認購買狀態…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('正在開啟商店確認畫面…')).toBeTruthy();
  });
  it('treats cancellation as cancellation and permits a new explicit attempt without verifying a receipt', async () => {
    await detail(); fireEvent.click(screen.getByRole('button', { name: '前往商店確認訂閱' }));
    act(() => store.callbacks.onPurchaseError({ code: 'user-cancelled' }));
    expect(screen.getByText('已取消本次購買，未新增權益。')).toBeTruthy();
    // Status belongs to the fixed checkout header, outside its content scroller.
    const alert = screen.getByText('已取消本次購買，未新增權益。');
    const scrollParents = Array.from(document.querySelectorAll('[data-native-scroll]')).filter(node => node.contains(alert));
    expect(scrollParents).toHaveLength(0);
    expect(screen.getByRole('button', { name: '前往商店確認訂閱' }).hasAttribute('disabled')).toBe(false);
    expect(api.mock.calls.filter(call => call[0] === '/payment/verify')).toHaveLength(0);
  });
  it('verifies server-side before showing success and leaves Google finish to the durable backend ledger', async () => {
    await detail(); await act(async () => store.callbacks.onPurchaseSuccess(receipt));
    await screen.findByText('付款已核對。請返回我的，重新讀取權益。');
    expect(api).toHaveBeenCalledWith('/payment/verify', expect.objectContaining({ method: 'POST', body: JSON.stringify({ provider: 'GOOGLE', productId: receipt.productId, receipt: receipt.purchaseToken }) }));
    expect(store.finishTransaction).not.toHaveBeenCalled();
  });
  it('retains an unverified original receipt and retry only verifies instead of purchasing again', async () => {
    api.mockImplementation(async (path: string) => path === '/payment/benefits' ? benefits : path === '/marketing/availability' ? { permanentCreditsRemaining: 7 } : Promise.reject(Error('synthetic')));
    await detail(); await act(async () => store.callbacks.onPurchaseSuccess(receipt));
    await screen.findByText('付款結果尚未確認。請保留原交易並查核，不要再次購買。');
    expect(screen.getByRole('button', { name: '請先查核原交易' }).hasAttribute('disabled')).toBe(true);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '重新查核原交易' })));
    expect(api.mock.calls.filter(call => call[0] === '/payment/verify')).toHaveLength(2); expect(store.requestPurchase).not.toHaveBeenCalled();
  });
  it('never enables repeat payment merely because the store callback timed out', async () => {
    await detail(); vi.useFakeTimers(); fireEvent.click(screen.getByRole('button', { name: '前往商店確認訂閱' }));
    await act(async () => vi.advanceTimersByTime(35001));
    expect(screen.getByText('商店尚未回覆。請先查核商店購買結果，不要再次付款。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '請先查核原交易' }).hasAttribute('disabled')).toBe(true);
    expect(store.requestPurchase).toHaveBeenCalledTimes(1);
  });
  it('restores more than the first returned purchase without initiating checkout', async () => {
    store.restore.mockResolvedValue([receipt, { ...receipt, productId: billingPlans[1].id, purchaseToken: 'synthetic-second' }]);
    await open(); await act(async () => fireEvent.click(screen.getByRole('button', { name: '恢復並查核既有購買' })));
    expect(api.mock.calls.filter(call => call[0] === '/payment/verify')).toHaveLength(2); expect(store.requestPurchase).not.toHaveBeenCalled();
  });
  it('reports an empty restore rather than spinning or granting benefits', async () => {
    await open(); await act(async () => fireEvent.click(screen.getByRole('button', { name: '恢復並查核既有購買' })));
    expect(screen.getByText(/商店目前沒有可恢復的購買/)).toBeTruthy();
    expect(api.mock.calls.filter(call => call[0] === '/payment/verify')).toHaveLength(0);
  });
  it('allows browsing and restore while Apple checkout is closed and never presents an enabled purchase CTA', async () => {
    store.platform = 'ios'; await detail();
    expect(screen.getByRole('button', { name: '目前尚未開放購買' }).hasAttribute('disabled')).toBe(true);
    expect(store.fetchProducts).not.toHaveBeenCalled(); expect(store.requestPurchase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '返回方案總覽' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '恢復並查核既有購買' })));
    expect(store.restore).toHaveBeenCalledOnce();
  });
  it('does not purchase without a store price or a required Android subscription offer', async () => {
    expect(() => purchaseRequest({ id: billingPlans[0].id, displayPrice: '' } as StoreProduct, benefits, 'android')).toThrow();
    expect(() => purchaseRequest({ id: billingPlans[0].id, displayPrice: 'NT$90' } as StoreProduct, benefits, 'android')).toThrow();
    store.subscriptions = []; await detail();
    expect(screen.getByRole('button', { name: '請先讀取商店價格' }).hasAttribute('disabled')).toBe(true);
    expect(store.requestPurchase).not.toHaveBeenCalled();
  });
  it('finishes Apple transactions only after matching server verification, including restore while new checkout is closed', async () => {
    store.platform = 'ios'; await detail();
    await act(async () => store.callbacks.onPurchaseSuccess(receipt));
    await screen.findByText('付款已核對。請返回我的，重新讀取權益。');
    expect(store.finishTransaction).toHaveBeenCalledWith({ purchase: receipt, isConsumable: false });
    expect(store.requestPurchase).not.toHaveBeenCalled();
  });
  it('rejects mismatched receipt environments and never finishes or grants unconfirmed transactions', async () => {
    store.platform = 'ios';
    api.mockImplementation(async (path: string) => path === '/payment/benefits' ? benefits : path === '/marketing/availability' ? { permanentCreditsRemaining: 7 }
      : { verified: true, active: true, environment: 'Sandbox' });
    await detail(); await act(async () => store.callbacks.onPurchaseSuccess(receipt));
    await screen.findByText('付款結果尚未確認。請保留原交易並查核，不要再次購買。');
    expect(store.finishTransaction).not.toHaveBeenCalled();
  });
  it('keeps pending-payment approval distinct from completed payment', async () => {
    await detail(); await act(async () => store.callbacks.onPurchaseSuccess({ ...receipt, purchaseState: 'pending' }));
    await screen.findByText('商店正在等待付款核准。請稍後查核原交易，不要重複購買。');
    expect(api.mock.calls.filter(call => call[0] === '/payment/verify')).toHaveLength(0);
    expect(screen.getByRole('button', { name: '請先查核原交易' }).hasAttribute('disabled')).toBe(true);
  });
  it('keeps one-time add-on and pure support as distinct non-recurring purchases', () => {
    for (const product of store.products) expect(purchaseRequest(product, benefits, 'android').type).toBe('in-app');
    expect(billingPlans[2].features).toContain('不含尊榮或行銷額度');
  });
});
