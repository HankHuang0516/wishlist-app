import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createApi } from './api';
import { PublicListing, emptySearchFilters, listingPrice, TAIWAN_BOUNDS } from './listingSearch';
import { MatchWish, WishMatch, parseMatchWishes, parseWishMatchPage, wishMatchPath } from './wishData';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
export function WishHome({ api, apiUrl, userId, onExplore, onWishes }: { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; onExplore: (wishId?: number, listing?: PublicListing) => void; onWishes: () => void }) {
  const [wishes, setWishes] = useState<MatchWish[]>([]), [selected, setSelected] = useState<number | null>(null), [cursor, setCursor] = useState<number | null>(null), [matches, setMatches] = useState<WishMatch[]>([]);
  const [loading, setLoading] = useState(false), [matching, setMatching] = useState(false), [error, setError] = useState(''), [matchError, setMatchError] = useState(''), [notice, setNotice] = useState(''), [clock, setClock] = useState(Date.now());
  const alive = useRef(true), wishSeq = useRef(0), matchSeq = useRef(0), busy = useRef(false);
  async function load(next?: number) {
    if (busy.current) return; busy.current = true; const seq = ++wishSeq.current; setLoading(true); setError('');
    try {
      const page = parseMatchWishes(await api<unknown>('/listings/match-wishes?limit=50' + (next ? '&cursor=' + next : '')));
      if (alive.current && seq === wishSeq.current) {
        if (page.nextCursor === next) throw new Error('Wishlist cursor did not advance');
        setWishes(old => next ? [...new Map([...old, ...page.items].map(w => [w.id, w])).values()] : page.items); setCursor(page.nextCursor);
        if (!next) setSelected(old => page.items.some(w => w.id === old) ? old : page.items[0]?.id ?? null);
      }
    } catch { if (alive.current && seq === wishSeq.current) setError('無法載入願望，請確認網路或登入後重試。'); }
    finally { busy.current = false; if (alive.current && seq === wishSeq.current) setLoading(false); }
  }
  async function match(wishId: number) {
    const seq = ++matchSeq.current; setMatching(true); setMatches([]); setMatchError('');
    try {
      const page = parseWishMatchPage(await api<unknown>(wishMatchPath(wishId, emptySearchFilters, TAIWAN_BOUNDS, '', true)), wishId, apiUrl, __DEV__);
      if (alive.current && seq === matchSeq.current) { setMatches(page.items); setNotice(page.notice); setClock(Date.now()); }
    } catch { if (alive.current && seq === matchSeq.current) setMatchError('無法更新商品配對，請重試；願望可能已完成或隱藏。'); }
    finally { if (alive.current && seq === matchSeq.current) setMatching(false); }
  }
  useEffect(() => {
    alive.current = true; void load(); const timer = setInterval(() => setClock(Date.now()), 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') { setClock(Date.now()); void load(); } });
    return () => { alive.current = false; wishSeq.current++; matchSeq.current++; clearInterval(timer); subscription.remove(); };
  }, []);
  useEffect(() => { if (selected !== null) void match(selected); else { matchSeq.current++; setMatches([]); setMatching(false); } }, [selected, wishes]);
  const wish = wishes.find(w => w.id === selected), visible = matches.filter(m => Date.parse(m.listing.expiresAt) > clock);
  const otherListings = visible.filter(m => m.listing.owner.id !== userId), ownPreviews = visible.filter(m => m.listing.owner.id === userId);
  return <ScrollView contentContainerStyle={s.content}><Text style={s.title}>讓願望更靠近。</Text><Text style={s.body}>願望先行，地圖幫你發現下一個好物。</Text>
    {loading && <ActivityIndicator accessibilityLabel="載入願望中" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!wishes.length && <><Text style={s.heading}>今天想找什麼？</Text><ScrollView horizontal contentContainerStyle={s.row}>{wishes.map(w => <Pressable key={w.id} accessibilityRole="radio" accessibilityState={{ checked: selected === w.id }} onPress={() => setSelected(w.id)} style={[s.chip, selected === w.id && s.selected]}><Text numberOfLines={2} style={s.body}>{w.name}</Text><Text style={s.small}>{w.wishlist.title}</Text></Pressable>)}</ScrollView></>}
    {wish && <View style={s.card}><Text style={s.heading}>{wish.name}</Text><Text style={s.small}>{wish.maxPrice === null ? '未設定購買上限；不使用估計商品價格假造預算' : `購買上限：${wish.priceCurrency ?? '未指定幣別'} ${wish.maxPrice.toLocaleString('zh-TW')}`}</Text><Pressable accessibilityRole="button" style={s.button} onPress={() => onExplore(wish.id)}><Text style={s.white}>在地圖交叉比對這個願望</Text></Pressable></View>}
    {matching && <ActivityIndicator accessibilityLabel="比對商品中" />}{!!matchError && <Text accessibilityRole="alert" style={s.error}>{matchError}</Text>}{!!notice && !!wish && <Text style={s.small}>{notice}</Text>}
    {!matching && !matchError && !!wish && <Text style={s.heading}>{otherListings.length ? '其他賣家的願望線索' : '目前沒有其他賣家的吻合商品'}</Text>}
    {ownPreviews.length > 0 && <Text style={s.small}>另有 {ownPreviews.length} 件自己的刊登符合文字條件，僅供檢查配對；不能向自己購買。</Text>}
    {[...otherListings, ...ownPreviews].slice(0, 5).map(m => <Pressable key={m.listing.id} accessibilityRole="button" onPress={() => onExplore(m.wishItemId, m.listing)} style={s.card}>{m.listing.owner.id === userId && <Text style={s.small}>我的商品 · 配對預覽，非買家推薦</Text>}<View style={s.row}><Image source={{ uri: m.listing.media[0].thumbnailUrl }} accessibilityLabel={m.listing.title} style={s.image} /><View style={s.flex}><Text style={s.heading}>{m.listing.title}</Text><Text style={s.body}>{listingPrice(m.listing)}</Text><Text style={s.small}>{m.listing.location.county} · {m.listing.location.district}</Text></View></View><Text style={s.small}>本頁吻合分數 {m.score}／100</Text>{m.reasons.map(r => <Text key={r.code} style={s.small}>{r.text}</Text>)}</Pressable>)}
    {visible.length > 5 && <Text style={s.small}>本頁吻合{visible.length}筆，首頁先顯示5筆；到探索地圖載入更多。</Text>}
    {!loading && !error && !wishes.length && <View style={s.card}><Text style={s.heading}>先留下你的第一個願望</Text><Text style={s.body}>只有未完成、未隱藏的本人願望會參與配對。</Text><Pressable accessibilityRole="button" style={s.chip} onPress={onWishes}><Text style={s.body}>前往願望清單</Text></Pressable></View>}
    {cursor && wishes.length < 200 && <Pressable accessibilityRole="button" disabled={loading} style={s.chip} onPress={() => void load(cursor)}><Text style={s.body}>載入更多願望</Text></Pressable>}
    <Pressable accessibilityRole="button" disabled={loading || matching} style={s.chip} onPress={() => void load()}><Text style={s.body}>重新整理願望與配對</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => onExplore()}><Text style={s.body}>不套用願望，瀏覽商品地圖</Text></Pressable>
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: iosSpacing.lg, paddingTop: iosSpacing.xs, paddingBottom: iosSpacing.xxl, gap: iosSpacing.lg },
  title: { color: iosColors.label, ...iosType.largeTitle },
  heading: { color: iosColors.label, ...iosType.headline },
  body: { color: iosColors.label, ...iosType.body },
  small: { color: iosColors.secondaryLabel, ...iosType.subheadline },
  error: { color: iosColors.danger, ...iosType.subheadline },
  card: { backgroundColor: iosColors.surface, borderRadius: iosRadius.card, padding: iosSpacing.md, gap: iosSpacing.sm, ...iosShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: iosSpacing.sm },
  chip: { minHeight: minimumTapSize, maxWidth: 240, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.sm, justifyContent: 'center' },
  selected: { backgroundColor: iosColors.tintSoft, borderColor: iosColors.tint },
  button: { minHeight: 52, backgroundColor: iosColors.tint, borderRadius: iosRadius.control, padding: iosSpacing.md, justifyContent: 'center', alignItems: 'center' },
  white: { color: iosColors.white, ...iosType.headline },
  image: { width: 72, height: 72, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary },
  flex: { flex: 1 },
});
