import type { Product, ProductSubscription, RequestPurchaseProps } from 'expo-iap';
import type { BillingBenefits } from './billingBenefits';

export const billingPlans = [
  { id: 'wishlist_premium_monthly', name: '尊榮版', kind: '每月訂閱', icon: 'diamond' as const,
    action: '查看尊榮方案', headline: '讓好物更快找到對的人',
    features: ['尊榮代問權益', '每月 100 次行銷額度'],
    note: '代問不保證賣家回覆或成交。每月自動續訂，可於原商店取消。' },
  { id: 'wishlist_marketing_10', name: '行銷小助手', kind: '10 次永久額度', icon: 'bar-chart' as const,
    action: '查看加值方案', headline: '為你的好物增加曝光機會',
    features: ['一次加值 10 次行銷額度', '不限期，用完再買'],
    note: '單次加值，不會自動續購。行銷內容仍需由你確認後使用。' },
  { id: 'wishlist_sponsor_90', name: '支持 Wishlist', kind: '單次贊助', icon: 'heart' as const,
    action: '查看贊助方案', headline: '支持 Wishlist 持續優化',
    features: ['單次支持服務營運', '不含尊榮或行銷額度'],
    note: '這是單次贊助，不會開通尊榮權益，也不會自動續訂。' },
] as const;
export type BillingPlan = typeof billingPlans[number];
export type StoreProduct = Product | ProductSubscription;
export function monthlyOffer(product: StoreProduct) {
  return 'subscriptionOffers' in product ? product.subscriptionOffers?.find(offer => offer.basePlanIdAndroid === 'monthly') : undefined;
}
export function storePrice(product: StoreProduct | undefined): string | null {
  return product?.displayPrice?.trim() || null;
}
export function purchaseRequest(product: StoreProduct, benefits: BillingBenefits, platform: string): RequestPurchaseProps {
  if (!billingPlans.some(plan => plan.id === product.id) || !storePrice(product)) throw Error('Store product unavailable');
  const common = { apple: { sku: product.id, appAccountToken: benefits.accountToken },
    google: { skus: [product.id], obfuscatedAccountId: benefits.obfuscatedAccountId } };
  if (product.id !== 'wishlist_premium_monthly') return { type: 'in-app', request: common };
  const offer = monthlyOffer(product);
  if (platform === 'android' && !offer?.offerTokenAndroid) throw Error('Monthly offer unavailable');
  return { type: 'subs', request: { ...common, google: { ...common.google,
    ...(offer?.offerTokenAndroid ? { subscriptionOffers: [{ sku: product.id, offerToken: offer.offerTokenAndroid }] } : {}) } } };
}
