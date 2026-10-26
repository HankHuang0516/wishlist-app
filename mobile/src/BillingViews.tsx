import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesome6, Ionicons } from '@expo/vector-icons';
import { billingPlans, type BillingPlan, type StoreProduct, storePrice } from './billingPlans';
import type { BillingBenefits } from './billingBenefits';
import { iosColors as c } from './iosTheme';

function PlanIcon({ plan, size }: { plan: BillingPlan; size: number }) {
  return plan.id === 'wishlist_premium_monthly' ? <FontAwesome6 name="crown" size={size} color={c.tint} />
    : <Ionicons name={plan.icon} size={size} color={plan.id === 'wishlist_sponsor_90' ? '#E53959' : c.tint} />;
}
export function BillingButton({ label, onPress, secondary = false, disabled = false, loading = false }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; loading?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy: loading }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary ? s.secondary : s.primary, disabled && s.disabled, pressed && !disabled && s.pressed]}>
    {loading && <ActivityIndicator color={secondary ? c.tint : c.white} />}
    <Text style={[s.buttonText, { color: secondary ? c.tint : c.white }]}>{label}</Text>
  </Pressable>;
}
export function BillingBalance({ benefits, credits }: { benefits: BillingBenefits | null; credits: number | null }) {
  const quota = benefits?.inquiry;
  return <View style={s.card}>
    <Text style={s.badge}>{quota?.premium ? '尊榮方案' : '免費方案'}</Text>
    <Text style={s.body}>{quota ? quota.premium ? '尊榮代問權益已啟用' : `本週免費代問剩 ${quota.freeRemaining}／3 次` : '權益尚未確認'}</Text>
    {quota && !quota.premium && <View accessible accessibilityRole="progressbar" accessibilityLabel="本週剩餘免費代問"
      accessibilityValue={{ min: 0, max: 3, now: quota.freeRemaining }} style={s.track}><View style={[s.progress, { width: `${quota.freeRemaining / 3 * 100}%` }]} /></View>}
    <Text style={s.note}>每週一台灣時間 00:00 重置，不累積。</Text>
    <View style={s.separator} />
    <Text style={s.body}>永久行銷額度 {credits === null ? '尚未確認' : `${credits} 次`}</Text>
  </View>;
}
export function BillingHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel={title === '贊助與升級' ? '返回我的' : '返回方案總覽'} onPress={onBack} style={s.back}>
    <Ionicons name="chevron-back" size={25} color={c.tint} /></Pressable><Text accessibilityRole="header" style={s.headerTitle}>{title}</Text><View style={s.back} /></View>;
}
export function BillingOverview({ benefits, credits, products, available, loading, busy, onSelect, onRestore, onManage, onReload, onBenefits }: {
  benefits: BillingBenefits; credits: number; products: StoreProduct[]; available: boolean; loading: boolean; busy: boolean;
  onSelect: (plan: BillingPlan) => void; onRestore: () => void; onManage: () => void; onReload: () => void; onBenefits: () => void;
}) {
  return <ScrollView style={s.flex} contentContainerStyle={s.content}>
    <BillingBalance benefits={benefits} credits={credits} />
    {!available && <View style={s.notice}><Text style={s.heading}>付費方案尚未開放</Text><Text style={s.note}>目前無法購買，免費功能與既有權益可正常使用。</Text><BillingButton label="重新確認狀態" secondary onPress={onBenefits} /></View>}
    {loading && <View accessibilityRole="progressbar" style={s.status}><ActivityIndicator color={c.tint} /><Text style={s.note}>正在讀取商店價格…</Text></View>}
    {billingPlans.map((plan, index) => {
      const price = storePrice(products.find(product => product.id === plan.id));
      const header = <View style={s.planHeader}><View style={[s.icon, index === 2 && s.heart]}><PlanIcon plan={plan} size={26} /></View>
        <View style={s.planCopy}><Text style={s.heading}>{plan.name}</Text><Text style={s.note}>{plan.kind}</Text></View>
        <Text style={s.price}>{available ? price ? `${price}${index === 0 ? '／月' : ''}` : loading ? '讀取中' : '價格尚未確認' : '尚未開放'}</Text>
      </View>;
      if (index === 2) return <Pressable key={plan.id} accessibilityRole="button" accessibilityLabel={plan.action} onPress={() => onSelect(plan)}
        style={({ pressed }) => [s.card, pressed && s.pressed]}>{header}<View style={s.supportRow}><Text style={s.note}>不含尊榮或行銷額度</Text><Text style={s.link}>查看贊助方案 ›</Text></View></Pressable>;
      return <View key={plan.id} style={[s.card, index === 0 && s.featured]}>{header}
        {index === 0 && plan.features.map(feature => <View style={s.feature} key={feature}><Ionicons name="checkmark-circle" size={21} color={c.tint} /><Text style={s.body}>{feature}</Text></View>)}
        <BillingButton label={plan.action} secondary={index !== 0} onPress={() => onSelect(plan)} />
      </View>;
    })}
    <View style={s.card}><BillingButton label="恢復並查核既有購買" secondary disabled={busy} onPress={onRestore} />
      <BillingButton label="在原商店管理訂閱" secondary onPress={onManage} />
      <Text style={s.note}>恢復購買只查核原交易，不會新增購買。</Text>
      {available && <BillingButton label="重新讀取商店價格" secondary disabled={busy || loading} onPress={onReload} />}
      <BillingButton label="重新核對權益" secondary disabled={busy} onPress={onBenefits} /></View>
    <Text style={s.centerNote}>實付金額與條款以商店最後確認畫面為準。</Text>
  </ScrollView>;
}
export function BillingDetail({ plan, product, available, connected, busy, uncertain, pending, onBuy, onRestore, onRetry, onManage, onPolicy }: {
  plan: BillingPlan; product?: StoreProduct; available: boolean; connected: boolean; busy: boolean; uncertain: boolean; pending: boolean;
  onBuy: () => void; onRestore: () => void; onRetry: () => void; onManage: () => void; onPolicy: (path: string) => void;
}) {
  const subscription = plan.id === 'wishlist_premium_monthly', price = storePrice(product);
  const canBuy = available && connected && !!price && !busy && !uncertain && !pending;
  return <View style={s.flex}><ScrollView style={s.flex} contentContainerStyle={s.content}>
    <View style={s.hero}><View style={s.heroIcon}><PlanIcon plan={plan} size={46} /></View>
      <Text style={s.heroTitle}>{plan.headline}</Text><Text style={s.heroPrice}>{available ? price ? `${price}${subscription ? '／月' : ''}` : '價格尚未確認' : '尚未開放'}</Text></View>
    <View style={s.card}>{plan.features.map(feature => <View style={s.feature} key={feature}><Ionicons name="checkmark-circle" size={23} color={c.tint} /><Text style={s.heading}>{feature}</Text></View>)}</View>
    <Text style={s.note}>{plan.note}</Text>
    <View style={s.card}>{[['付款週期', subscription ? '每月' : '單次'], ['續訂方式', subscription ? '自動續訂' : '不自動續購'], ['取消方式', subscription ? '至原商店管理' : '非訂閱方案']].map(([label, value]) =>
      <View key={label} style={s.detailRow}><Text style={s.body}>{label}</Text><Text style={s.body}>{value}</Text></View>)}</View>
    {subscription && <BillingButton label="在原商店管理訂閱" secondary onPress={onManage} />}
    {(uncertain || pending) && <BillingButton label={pending ? '重新查核原交易' : '查核商店購買結果'} secondary disabled={busy} onPress={onRestore} />}
    {available && !price && <BillingButton label="重新讀取商店價格" secondary disabled={busy} onPress={onRetry} />}
    <View style={s.policyRow}>{['terms', 'privacy'].map(path => <Pressable key={path} accessibilityRole="link" onPress={() => onPolicy(path)} style={s.policy}><Text style={s.link}>{path === 'terms' ? '使用條款' : '隱私政策'}</Text></Pressable>)}</View>
  </ScrollView><View style={s.footer}>
    <Text style={s.footerPrice}>{price && available ? `${price}${subscription ? '／月' : ''}` : available ? '價格尚未確認' : '付費方案尚未開放'}</Text>
    <BillingButton label={busy ? '正在確認購買狀態…' : uncertain || pending ? '請先查核原交易' : !available ? '目前尚未開放購買' : !price ? '請先讀取商店價格' : !connected ? '商店尚未連線' : subscription ? '前往商店確認訂閱' : '前往商店確認購買'}
      loading={busy} disabled={!canBuy} onPress={onBuy} />
    <Text style={s.centerNote}>{subscription ? '每月自動續訂，可於原商店取消。' : '單次付款，不會自動續購。'}商店會再次顯示金額。</Text>
  </View></View>;
}
export const billingStyles = StyleSheet.create({
  flex: { flex: 1 }, container: { flex: 1, backgroundColor: c.background },
  entry: { padding: 18, borderRadius: 18, backgroundColor: c.surface, gap: 12 },
  heading: { fontSize: 19, lineHeight: 26, fontWeight: '700', color: c.label },
  note: { fontSize: 14, lineHeight: 21, color: c.secondaryLabel },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 58, backgroundColor: c.background },
  headerTitle: { fontSize: 19, fontWeight: '700', color: c.label, flexShrink: 1, textAlign: 'center' },
  back: { width: 52, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 28, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: { padding: 16, gap: 12, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: '#E5E7EF' },
  featured: { borderColor: '#007AFF', backgroundColor: '#F8FBFF', borderWidth: 1.5 },
  badge: { fontSize: 14, color: c.label, backgroundColor: '#EAF0F9', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 12, alignSelf: 'flex-start' },
  body: { fontSize: 16, lineHeight: 23, color: c.label, flexShrink: 1 },
  track: { height: 8, borderRadius: 8, backgroundColor: '#E6E9F1', overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: '#1680F8', borderRadius: 8 },
  separator: { height: 1, backgroundColor: '#E5E7EF' },
  notice: { padding: 16, backgroundColor: '#EAF3FF', borderRadius: 14, color: c.label, fontSize: 15, lineHeight: 23, gap: 10 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  planCopy: { flex: 1, minWidth: 120, gap: 3 },
  price: { fontSize: 19, lineHeight: 27, fontWeight: '700', color: c.tint, flexShrink: 1 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5F0FF', alignItems: 'center', justifyContent: 'center' },
  supportRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  heart: { backgroundColor: '#FFECF0' },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  button: { minHeight: 50, padding: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primary: { backgroundColor: c.tint }, secondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: '#B8D4F6' },
  buttonText: { fontSize: 16, lineHeight: 23, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  disabled: { opacity: 0.5 }, pressed: { opacity: 0.72 },
  hero: { alignItems: 'center', gap: 18, paddingVertical: 22 },
  heroIcon: { width: 86, height: 86, borderRadius: 43, backgroundColor: '#E1EDFF', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 25, lineHeight: 34, fontWeight: '800', color: c.label, textAlign: 'center' },
  heroPrice: { fontSize: 29, lineHeight: 38, color: '#007AFF', fontWeight: '800', textAlign: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingVertical: 7 },
  footer: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: '#E2E4EC', padding: 16, gap: 9, width: '100%', maxWidth: 640, alignSelf: 'center' },
  footerPrice: { fontSize: 23, fontWeight: '700', color: c.tint },
  centerNote: { fontSize: 12, lineHeight: 18, color: c.secondaryLabel, textAlign: 'center' },
  policyRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14 },
  policy: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  link: { fontSize: 14, lineHeight: 21, color: c.tint, textDecorationLine: 'underline' },
});
const s = billingStyles;
