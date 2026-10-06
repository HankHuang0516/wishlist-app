import React, { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, createApi } from './api';
import { PublicListing, emptySearchFilters, listingPrice, TAIWAN_BOUNDS } from './listingSearch';
import { MatchWish, WishMatch, parseMatchWishes, parseWishMatchPage, rankHomeMatches, wishMatchPath } from './wishData';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
export function WishHome({ api, apiUrl, userId, onExplore, onWishes }: { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; onExplore: (wishId?: number, listing?: PublicListing) => void; onWishes: () => void }) {
  const [wishes, setWishes] = useState<MatchWish[]>([]), [selected, setSelected] = useState<number | null>(null);
  const [groups, setGroups] = useState<{ wish: MatchWish; matches: WishMatch[] }[]>([]), [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(false), [matching, setMatching] = useState(false), [error, setError] = useState(''), [matchError, setMatchError] = useState(''), [progress, setProgress] = useState(''), [clock, setClock] = useState(Date.now());
  const alive = useRef(true), wishSeq = useRef(0), matchSeq = useRef(0);
  async function load() {
    const seq = ++wishSeq.current; matchSeq.current++; setMatching(false); setLoading(true); setError(''); setGroups([]); setProgress('正在讀取願望…');
    try {
      const all: MatchWish[] = [], seen = new Set<number>();
      let next: number | null = null;
      do {
        const page = parseMatchWishes(await api<unknown>('/listings/match-wishes?limit=100' + (next ? '&cursor=' + next : '')));
        if (!alive.current || seq !== wishSeq.current) return;
        all.push(...page.items); next = page.nextCursor;
        if (next && seen.has(next)) throw new Error('願望分頁未前進');
        if (next) seen.add(next);
      } while (next);
      if (new Set(all.map(w => w.id)).size !== all.length) throw new Error('願望分頁重複');
      if (alive.current && seq === wishSeq.current) {
        setWishes(all); setSelected(old => all.some(w => w.id === old) ? old : all[0]?.id ?? null);
        if (!all.length) setProgress('尚無可比對的願望');
      }
    } catch (failure) { if (alive.current && seq === wishSeq.current) setError(failure instanceof ApiError && failure.status === 429 ? failure.message : '無法載入願望，請確認網路或登入後重試。'); }
    finally { if (alive.current && seq === wishSeq.current) setLoading(false); }
  }
  async function matchAll(items: MatchWish[]) {
    const seq = ++matchSeq.current; setMatching(true); setGroups([]); setMatchError('');
    try {
      let index = 0, finished = 0, failed = 0;
      async function worker() {
        while (index < items.length && alive.current && seq === matchSeq.current) {
          const wish = items[index++], raw: WishMatch[] = [], cursors = new Set<string>();
          let cursor: string | null = null;
          try {
            do {
              const path = wishMatchPath(wish.id, emptySearchFilters, TAIWAN_BOUNDS) + (cursor ? '&cursor=' + cursor : '');
              const page = parseWishMatchPage(await api<unknown>(path), wish.id, apiUrl, __DEV__);
              if (!alive.current || seq !== matchSeq.current) return;
              raw.push(...page.items);
              cursor = page.nextCursor;
              if (cursor && cursors.has(cursor)) throw new Error('商品分頁未前進');
              if (cursor) cursors.add(cursor);
            } while (cursor);
            const matches = rankHomeMatches(raw, userId);
            if (matches.length) setGroups(old => [...old, { wish, matches }].sort((a, b) => items.indexOf(a.wish) - items.indexOf(b.wish)));
          } catch { failed++; }
          setProgress(`已比對 ${++finished}／${items.length} 個願望`);
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, items.length) }, () => worker()));
      if (alive.current && seq === matchSeq.current) { setClock(Date.now()); setProgress(`已比對 ${items.length - failed}／${items.length} 個願望`);
        if (failed) setMatchError(`${failed} 個願望配對失敗；以下結果可能不完整，請重新整理。`); }
    } catch { if (alive.current && seq === matchSeq.current) setMatchError('部分願望或商品配對未完成；以下結果可能不完整，請重新整理。'); }
    finally { if (alive.current && seq === matchSeq.current) setMatching(false); }
  }
  useEffect(() => {
    alive.current = true; void load(); const timer = setInterval(() => setClock(Date.now()), 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') { setClock(Date.now()); void load(); } });
    return () => { alive.current = false; wishSeq.current++; matchSeq.current++; clearInterval(timer); subscription.remove(); };
  }, []);
  useEffect(() => { if (wishes.length) void matchAll(wishes); else { matchSeq.current++; setGroups([]); setMatching(false); } }, [wishes]);
  const visibleGroups = groups.map(group => ({ ...group, matches: group.matches.filter(m => Date.parse(m.listing.expiresAt) > clock) })).filter(group => group.matches.length);
  const wish = wishes.find(w => w.id === selected), selectedMatches = visibleGroups.find(group => group.wish.id === selected)?.matches ?? [];
  const preview = (m: WishMatch) => <Pressable key={m.listing.id} accessibilityRole="button" onPress={() => onExplore(m.wishItemId, m.listing)} style={s.product}><Image source={{ uri: m.listing.media[0].thumbnailUrl }} accessibilityLabel={m.listing.title} style={s.image} /><View style={s.flex}><Text numberOfLines={1} ellipsizeMode="tail" style={s.productTitle}>{m.listing.title}</Text><Text style={s.body}>{listingPrice(m.listing)}</Text><Text style={s.productMeta}>{m.listing.location.county} · {m.listing.location.district} · 吻合 {m.score} 分</Text></View></Pressable>;
  return <ScrollView contentContainerStyle={s.content}><Text style={s.title}>讓願望更靠近。</Text><Text style={s.body}>願望先行，地圖幫你發現下一個好物。</Text>
    {loading && <ActivityIndicator accessibilityLabel="載入願望中" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Text style={s.sectionTitle}>所有願望吻合的商品</Text><Text style={s.small}>每個願望先顯示最吻合的一件；自己的刊登不列入買家推薦。圖片不直接比對，請核對型號與真偽。</Text>
    {matching && <ActivityIndicator accessibilityLabel="比對所有願望中" />}{matching && !!progress && <Text accessibilityLiveRegion="polite" style={s.small}>{progress}</Text>}{!!matchError && <Text accessibilityRole="alert" style={s.error}>{matchError}</Text>}
    {visibleGroups.map(group => <View key={group.wish.id} style={s.card}><Text style={s.wishLabel}>{group.wish.name}</Text>{preview(group.matches[0])}
      {group.matches.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`${group.wish.name}共有${group.matches.length}件吻合商品，${expanded === group.wish.id ? '收合' : '查看全部'}`} accessibilityState={{ expanded: expanded === group.wish.id }} onPress={() => setExpanded(old => old === group.wish.id ? null : group.wish.id)} style={s.multiple}>
        <View style={s.multipleThumbnails}>{group.matches.slice(0, 3).map(match => <Image key={match.listing.id} source={{ uri: match.listing.media[0].thumbnailUrl }} accessibilityLabel={match.listing.title} style={s.multipleImage} />)}</View>
        <View style={s.flex}><Text style={s.multipleTitle}>多件吻合</Text><Text style={s.multipleText}>{expanded === group.wish.id ? '收合結果' : `查看全部 ${group.matches.length} 件`}</Text></View><Text style={s.multipleChevron}>{expanded === group.wish.id ? '⌃' : '›'}</Text>
      </Pressable>}
      {expanded === group.wish.id && <View style={s.matchList}>{group.matches.slice(1).map(preview)}</View>}
    </View>)}
    {!matching && !matchError && !visibleGroups.length && !!wishes.length && <Text style={s.small}>目前沒有其他賣家的吻合商品。仍可在下方選擇願望並前往地圖探索。</Text>}
    {!!wishes.length && <><Text style={s.sectionTitle}>今天想找什麼？</Text><ScrollView horizontal contentContainerStyle={s.row}>{wishes.map(w => <Pressable key={w.id} accessibilityRole="radio" accessibilityState={{ checked: selected === w.id }} onPress={() => setSelected(w.id)} style={[s.chip, selected === w.id && s.selected]}><Text numberOfLines={2} style={s.body}>{w.name}</Text><Text style={s.small}>{w.wishlist.title}</Text></Pressable>)}</ScrollView></>}
    {wish && <Pressable accessibilityRole="button" accessibilityLabel={`在地圖交叉比對${wish.name}`} style={s.mapShortcut} onPress={() => onExplore(wish.id, selectedMatches.length === 1 ? selectedMatches[0].listing : undefined)}><Ionicons name="map-outline" size={25} color={iosColors.tint} /><Text style={s.mapShortcutText}>在地圖交叉比對這個願望</Text><Text style={s.mapChevron}>›</Text></Pressable>}
    {!loading && !error && !wishes.length && <View style={s.card}><Text style={s.heading}>先留下你的第一個願望</Text><Text style={s.body}>只有未完成、未隱藏的本人願望會參與配對。</Text><Pressable accessibilityRole="button" style={s.chip} onPress={onWishes}><Text style={s.body}>前往願望清單</Text></Pressable></View>}
    <Pressable accessibilityRole="button" disabled={loading || matching} style={s.chip} onPress={() => void load()}><Text style={s.body}>重新整理願望與配對</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => onExplore()}><Text style={s.body}>不套用願望，瀏覽商品地圖</Text></Pressable>
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: iosSpacing.lg, paddingTop: iosSpacing.xs, paddingBottom: iosSpacing.xxl, gap: 14 },
  title: { color: iosColors.label, ...iosType.largeTitle },
  sectionTitle: { color: iosColors.label, ...iosType.title2 },
  wishLabel: { color: iosColors.brand, ...iosType.headline },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: iosSpacing.sm },
  chip: { minHeight: minimumTapSize, maxWidth: 240, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.sm, justifyContent: 'center' },
  selected: { backgroundColor: iosColors.tintSoft, borderColor: iosColors.tint },
  mapShortcut: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: iosSpacing.sm, paddingHorizontal: iosSpacing.md, backgroundColor: iosColors.tintSoft, borderRadius: iosRadius.control },
  mapShortcutText: { flex: 1, color: iosColors.tint, ...iosType.headline },
  mapChevron: { color: iosColors.tint, ...iosType.title2 },
  button: { minHeight: 52, backgroundColor: iosColors.tint, borderRadius: iosRadius.control, padding: iosSpacing.md, justifyContent: 'center', alignItems: 'center' },
  white: { color: iosColors.white, ...iosType.headline },
  image: { width: 72, height: 72, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary },
  flex: { flex: 1 },
});
