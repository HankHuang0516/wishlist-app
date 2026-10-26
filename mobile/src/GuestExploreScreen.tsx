import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createApi } from './api';
import { guestReadApi } from './guestAccess';
import { NativeDiscovery } from './NativeDiscovery';
import { PublicProductInterestProvider, ProductInterest } from './ProductInterestView';
import { ListingDetailContent } from './ListingDetailContent';
import { ListingPhoto } from './ListingPhoto';
import { SafeAreaModal } from './SafeAreaModal';
import { parsePublicListing, type PublicListing } from './listingSearch';
import { discoveryPrice, parseNativeDiscovery, type DiscoveryProduct } from './discoveryData';
import { ProductRetailPriceInfo } from './ProductRetailPriceInfo';
import { parseStorefront, type Storefront } from './storefrontData';
import { iosColors as c } from './iosTheme';

// Always uses an anonymous API, even if an old session could not be restored.
// No private operation journals, push registration or personal feeds are mounted.
export function GuestExploreScreen({ apiUrl, active, onSignIn }: { apiUrl: string; active: boolean; onSignIn: () => void }) {
  const api = useMemo(() => guestReadApi(createApi(apiUrl, () => null, __DEV__)), [apiUrl]);
  const [detail, setDetail] = useState<PublicListing | DiscoveryProduct | null>(null);
  const [storefront, setStorefront] = useState<Storefront | null>(null), [issue, setIssue] = useState('');
  const generation = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  const signIn = useCallback(() => onSignIn(), [onSignIn]);
  async function open(product: DiscoveryProduct) {
    const seq = ++generation.current;
    const value = product.kind === 'listing'
      ? parsePublicListing(await api('/listings/' + product.id), apiUrl, __DEV__, true)
      : parseNativeDiscovery(await api('/discovery/products/' + product.kind + '/' + product.id), apiUrl, __DEV__).items[0];
    if (!value || value.id !== product.id) throw Error('Public product unavailable');
    if (alive.current && generation.current === seq) { setStorefront(null); setIssue(''); setDetail(value); }
  }
  async function openStorefront(id: number) {
    const seq = ++generation.current; setIssue('');
    try {
      const value = parseStorefront(await api('/users/' + id + '/storefront'), id, apiUrl, __DEV__);
      if (alive.current && generation.current === seq) setStorefront(value);
    } catch { if (alive.current && generation.current === seq) setIssue('公開賣場暫時無法讀取，請稍後重試。'); }
  }
  function closeDetail() { generation.current++; setStorefront(null); setDetail(null); setIssue(''); }
  return <PublicProductInterestProvider read={api} onRequireLogin={signIn}>
    <View style={s.page}>
      <View style={s.header}><View style={{ flex: 1 }}><Text style={s.title}>探索</Text><Text style={s.note}>訪客瀏覽 · 不需要建立帳號</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="登入或建立帳號" style={s.signIn} onPress={signIn}><Text style={s.link}>登入／建立帳號</Text></Pressable></View>
      <NativeDiscovery hideIdentityHeader api={api} apiUrl={apiUrl} userId={null} onRequireLogin={signIn} active={active} onMap={() => {}} onOpen={open} onReports={signIn} />
      <Text style={s.footerNote}>公開商品可直接瀏覽；收藏、聯絡賣家與檢舉時才需要登入。</Text>
    </View>
    <SafeAreaModal visible={active && !!detail} animationType="slide" onRequestClose={closeDetail}>
      {storefront ? <View style={s.page}><View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="返回商品詳情" onPress={() => setStorefront(null)} style={s.back}><Ionicons name="chevron-back" size={24} color={c.tint} /></Pressable><Text style={s.title}>{storefront.seller.name || '賣場'}</Text></View>
        <ScrollView contentContainerStyle={s.content}><Text style={s.note}>加入日期：{new Date(storefront.seller.joinedAt).toLocaleDateString('zh-TW')}</Text><Text style={s.note}>電子郵件：{storefront.seller.emailVerified ? '已驗證' : '尚未驗證'}。不代表身分認證或交易保證。</Text>
          {storefront.items.map(item => <Pressable key={item.id} accessibilityRole="button" style={s.card} onPress={() => { setStorefront(null); setDetail(item); }}><Text style={s.heading}>{item.title}</Text><Text style={s.price}>NT${item.price.toLocaleString('zh-TW')}</Text></Pressable>)}
          {!storefront.items.length && <Text style={s.note}>目前沒有販售中的商品。</Text>}
          {storefront.nextCursor && <Pressable accessibilityRole="button" style={s.signIn} onPress={() => { const id = storefront.seller.id; const seq = ++generation.current; void api('/users/' + id + '/storefront?cursor=' + encodeURIComponent(storefront.nextCursor!)).then(raw => parseStorefront(raw, id, apiUrl, __DEV__)).then(next => { if (alive.current && seq === generation.current) setStorefront(prior => prior ? { ...next, items: [...new Map([...prior.items, ...next.items].map(item => [item.id, item])).values()] } : next); }).catch(() => { if (alive.current && seq === generation.current) setIssue('更多商品暫時無法讀取，請重試。'); }); }}><Text style={s.link}>載入更多商品</Text></Pressable>}
          {!!issue && <Text accessibilityRole="alert" style={s.note}>{issue}</Text>}
          <Pressable accessibilityRole="button" onPress={signIn} style={s.signIn}><Text style={s.link}>登入後追蹤、檢舉或封鎖</Text></Pressable>
        </ScrollView></View> : detail && !('kind' in detail)
        ? <ListingDetailContent api={api} apiUrl={apiUrl} listing={detail} userId={0} error={issue} reasons={[]} onBack={closeDetail} onStorefront={() => void openStorefront(detail.owner.id)} onReport={signIn} onContact={async () => signIn()} />
        : detail && 'kind' in detail && <View style={s.page}><View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="返回探索" style={s.back} onPress={closeDetail}><Ionicons name="chevron-back" size={24} color={c.tint} /></Pressable><Text style={s.title}>商品詳情</Text></View>
          <ScrollView contentContainerStyle={s.content}>{detail.photos.length ? detail.photos.map(photo => <Image key={photo.id} source={{ uri: photo.url }} accessibilityLabel={detail.title + '商品照片'} style={s.photo} resizeMode="contain" />) : <ListingPhoto label={detail.title} uri={detail.thumbnailUrl ?? undefined} detail style={s.photo} />}
            <Text style={s.heading}>{detail.title}</Text><Text style={s.price}>{discoveryPrice(detail)}</Text><Text style={s.note}>{detail.county} {detail.district} · {detail.sourceLabel}</Text>
            <ProductRetailPriceInfo api={api} apiUrl={apiUrl} kind={detail.kind} id={detail.id} title={detail.title} price={detail.price??undefined} /><ProductInterest kind={detail.kind} id={detail.id} />
            <Text style={s.heading}>商品說明</Text><Text style={s.body}>{detail.description}</Text><Text style={s.note}>公開來源資料，庫存與品況仍需向賣家確認。</Text>
          </ScrollView><Pressable accessibilityRole="button" style={s.signIn} onPress={signIn}><Text style={s.link}>登入後詢問商品</Text></Pressable></View>}
    </SafeAreaModal>
  </PublicProductInterestProvider>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background }, header: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: c.label }, heading: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: c.label },
  note: { fontSize: 14, lineHeight: 21, color: c.secondaryLabel }, footerNote: { fontSize: 12, lineHeight: 18, color: c.secondaryLabel, paddingHorizontal: 16, paddingVertical: 6 },
  body: { fontSize: 17, lineHeight: 25, color: c.label }, price: { fontSize: 23, lineHeight: 30, color: c.tint, fontWeight: '700' },
  signIn: { minHeight: 48, padding: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: c.tintSoft }, link: { color: c.tint, fontSize: 16, lineHeight: 23, fontWeight: '600' },
  back: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, content: { padding: 16, gap: 14, paddingBottom: 28 },
  card: { padding: 16, borderRadius: 16, gap: 8, backgroundColor: c.surface }, photo: { width: '100%', height: 280, borderRadius: 16 },
});
