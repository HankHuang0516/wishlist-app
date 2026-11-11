import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, createApi } from './api';
import { discoveryPrice, type DiscoveryProduct } from './discoveryData';
import { parseHomeWishMatches, type HomeWishGroup } from './homeWishMatches';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';

type Actions = { onOpen: (product: DiscoveryProduct) => void; onMore: (wishId: number) => void };

function Preview({ product, onOpen }: { product: DiscoveryProduct; onOpen: Actions['onOpen'] }) {
  const reason = product.match?.reasons.includes('BUDGET') ? '符合願望與預算' : '符合願望名稱';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${product.title}，${discoveryPrice(product)}，${reason}`} onPress={() => onOpen(product)} style={s.product}>
    {product.thumbnailUrl ? <Image source={{ uri: product.thumbnailUrl }} accessibilityLabel={product.title} style={s.image} /> : <View style={[s.image, s.noImage]}><Text style={s.small}>無照片</Text></View>}
    <View style={s.flex}>
      <Text numberOfLines={2} ellipsizeMode="tail" style={s.productTitle}>{product.title}</Text>
      <Text style={s.body}>{discoveryPrice(product)}</Text>
      <Text style={s.productMeta}>{product.kind === 'listing' ? '站內刊登' : '公開來源'}{product.county ? ' · ' + product.county : ''} · {reason}</Text>
    </View>
  </Pressable>;
}

/** Every wish that has matches, each with its best one; the rest open in place. Wishes nothing matches are named in
 *  one line, so it is clear every wish was checked. No wish has to be chosen first. */
export function HomeWishMatches({ groups, expanded, onToggle, onOpen, onMore }: Actions & { groups: HomeWishGroup[]; expanded: number | null; onToggle: (wishId: number) => void }) {
  const matched = groups.filter(group => group.total > 0 && group.items.length > 0), unmatched = groups.filter(group => group.total === 0);
  return <>
    {matched.map(group => {
      const open = expanded === group.wish.id;
      return <View key={group.wish.id} style={s.card}>
        <View style={s.wishHeader}>
          <Text style={s.wishLabel}>{group.wish.name}</Text>
          {group.wish.maxPrice !== null && group.wish.priceCurrency === 'TWD' && <Text style={s.small}>預算 NT$ {group.wish.maxPrice.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}</Text>}
        </View>
        <Preview product={group.items[0]} onOpen={onOpen} />
        {group.total > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`${group.wish.name}共有${group.total}件吻合商品，${open ? '收合' : '查看全部'}`} accessibilityState={{ expanded: open }} onPress={() => onToggle(group.wish.id)} style={s.multiple}>
          <View style={s.multipleThumbnails}>{group.items.slice(1, 4).map(item => item.thumbnailUrl ? <Image key={item.key} source={{ uri: item.thumbnailUrl }} accessibilityLabel={item.title} style={s.multipleImage} /> : null)}</View>
          <View style={s.flex}><Text style={s.multipleTitle}>多件吻合</Text><Text style={s.multipleText}>{open ? '收合結果' : `查看全部 ${group.total} 件`}</Text></View><Text style={s.multipleChevron}>{open ? '⌃' : '›'}</Text>
        </Pressable>}
        {open && <View style={s.matchList}>
          {group.items.slice(1).map(item => <Preview key={item.key} product={item} onOpen={onOpen} />)}
          {group.total > group.items.length && <Pressable accessibilityRole="button" onPress={() => onMore(group.wish.id)} style={s.more}><Text style={s.moreText}>在探索看這個願望的全部 {group.total} 件</Text></Pressable>}
        </View>}
      </View>;
    })}
    {!!unmatched.length && <Text style={s.small}>這些願望目前沒有吻合的商品：{unmatched.map(group => group.wish.name).join('、')}</Text>}
  </>;
}

/** The home tab: every open wish is matched against all public products (on-site listings and public references) as
 *  it opens, with the same rule as 你會想要. */
export function WishHome({ api, apiUrl, onOpenProduct, onExplore, onWishes }: { api: ReturnType<typeof createApi>; apiUrl: string; userId?: number; onOpenProduct: (product: DiscoveryProduct) => void; onExplore: (wishId?: number) => void; onWishes: () => void }) {
  const [groups, setGroups] = useState<HomeWishGroup[] | null>(null), [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), seq = useRef(0);
  async function load() {
    const request = ++seq.current; setLoading(true); setError('');
    try {
      const next = parseHomeWishMatches(await api<unknown>('/discovery/wish-matches'), apiUrl, __DEV__);
      if (alive.current && request === seq.current) setGroups(next);
    } catch (failure) {
      if (alive.current && request === seq.current) { setGroups(null); setError(failure instanceof ApiError && failure.status === 429 ? failure.message : '目前無法比對願望，請確認網路或登入後重新比對；這不代表沒有商品。'); }
    } finally { if (alive.current && request === seq.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; void load();
    // Coming back to the app matches again, so a product listed meanwhile shows up.
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { alive.current = false; seq.current++; subscription.remove(); };
  }, []);
  return <ScrollView contentContainerStyle={s.content}>
    <Text style={s.title}>讓願望更靠近。</Text><Text style={s.body}>每個願望都已幫你比對所有商品。</Text>
    <Text style={s.sectionTitle}>所有願望吻合的商品</Text>
    <Text style={s.small}>站內刊登與公開來源都會自動比對，依願望名稱與預算排序；自己的刊登不列入買家推薦。圖片不直接比對，請核對型號與真偽。</Text>
    {loading && <ActivityIndicator accessibilityLabel="比對所有願望中" />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {groups && <HomeWishMatches groups={groups} expanded={expanded} onToggle={id => setExpanded(old => old === id ? null : id)} onOpen={onOpenProduct} onMore={id => onExplore(id)} />}
    {!loading && !error && groups?.length === 0 && <View style={s.card}><Text style={s.heading}>先留下你的第一個願望</Text><Text style={s.body}>只有未完成、未隱藏的本人願望會參與配對。</Text><Pressable accessibilityRole="button" style={s.chip} onPress={onWishes}><Text style={s.body}>前往願望清單</Text></Pressable></View>}
    <Pressable accessibilityRole="button" disabled={loading} style={s.chip} onPress={() => void load()}><Text style={s.body}>重新比對</Text></Pressable>
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: iosSpacing.lg, paddingTop: iosSpacing.xs, paddingBottom: iosSpacing.xxl, gap: 14 },
  title: { color: iosColors.label, ...iosType.largeTitle },
  sectionTitle: { color: iosColors.label, ...iosType.title2 },
  wishHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: iosSpacing.xs },
  wishLabel: { color: iosColors.brand, ...iosType.headline, flexShrink: 1 },
  heading: { color: iosColors.label, ...iosType.headline },
  productTitle: { color: iosColors.label, ...iosType.subheadline, fontWeight: '700' },
  productMeta: { color: iosColors.secondaryLabel, ...iosType.caption },
  body: { color: iosColors.label, ...iosType.body },
  small: { color: iosColors.secondaryLabel, ...iosType.subheadline },
  error: { color: iosColors.danger, ...iosType.subheadline },
  card: { backgroundColor: iosColors.surface, borderRadius: iosRadius.card, padding: iosSpacing.md, gap: iosSpacing.sm, ...iosShadow },
  product: { flexDirection: 'row', alignItems: 'center', gap: iosSpacing.sm, minHeight: minimumTapSize },
  matchList: { gap: iosSpacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, paddingTop: iosSpacing.sm },
  multiple: { minHeight: 60, alignItems: 'center', flexDirection: 'row', gap: iosSpacing.sm, borderRadius: iosRadius.control, backgroundColor: iosColors.tintSoft, paddingHorizontal: iosSpacing.sm, paddingVertical: iosSpacing.xs },
  multipleThumbnails: { flexDirection: 'row', paddingLeft: 2 },
  multipleImage: { width: 34, height: 42, marginLeft: -2, borderWidth: 2, borderColor: iosColors.tintSoft, borderRadius: iosRadius.small, backgroundColor: iosColors.surface },
  multipleTitle: { color: iosColors.label, ...iosType.footnote, fontWeight: '700' },
  multipleText: { color: iosColors.tint, ...iosType.footnote, fontWeight: '700' },
  multipleChevron: { color: iosColors.tint, ...iosType.title2 },
  more: { minHeight: minimumTapSize, justifyContent: 'center' },
  moreText: { color: iosColors.tint, ...iosType.subheadline, fontWeight: '700' },
  chip: { minHeight: minimumTapSize, maxWidth: 240, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.sm, justifyContent: 'center' },
  image: { width: 72, height: 72, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary },
  noImage: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
