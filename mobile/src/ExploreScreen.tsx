import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CameraRef, GeoJSONSource, GeoJSONSourceRef, Images, Layer, Map as NativeMap } from '@maplibre/maplibre-react-native';
import type { Feature } from 'geojson';
import { createApi } from './api';
import { parseChatRoom } from './chatData';
import { CATEGORIES } from './listingForm';
import { Bounds, clipBounds, emptySearchFilters, listingGeoJSON, listingPrice, ListingSearchError, listingSearchPath, mergeListingPages, parseListingPage, parsePublicListing, PublicListing, SearchFilters, TAIWAN_BOUNDS } from './listingSearch';
import { parseWishMatchPage, wishMatchPath } from './wishData';
import { ListingReportSheet } from './ListingReportSheet';
import { iosColors, iosFloatingShadow, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const MAX_LOADED = 500;
type Props = { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; onOpenChat: (id: string) => void; wishItemId?: number; onClearWish?: () => void; initialListing?: PublicListing | null; onInitialListingHandled?: () => void };

export function ExploreScreen({ api, apiUrl, userId, onOpenChat, wishItemId, onClearWish, initialListing, onInitialListingHandled }: Props) {
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState<SearchFilters>({ ...emptySearchFilters });
  const [applied, setApplied] = useState<SearchFilters>({ ...emptySearchFilters });
  const [filtering, setFiltering] = useState(false); const [listMode, setListMode] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(initialListing ? clipBounds([initialListing.location.publicLongitude - 0.06, initialListing.location.publicLatitude - 0.06, initialListing.location.publicLongitude + 0.06, initialListing.location.publicLatitude + 0.06]) : TAIWAN_BOUNDS);
  const [items, setItems] = useState<PublicListing[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [mapError, setMapError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); const [detail, setDetail] = useState<PublicListing | null>(null);
  const [reporting, setReporting] = useState(false), [reportTarget, setReportTarget] = useState<PublicListing | null>(null);
  const reportBusy = useRef(false);
  const [clock, setClock] = useState(Date.now());
  const [matchReasons, setMatchReasons] = useState<Record<string, string[]>>({});
  const [radiusInput, setRadiusInput] = useState(''), [radiusApplied, setRadiusApplied] = useState('');
  const focusTarget = useRef(initialListing ?? null);
  const sequence = useRef(0); const loading = useRef(false); const mounted = useRef(true);
  const detailSequence = useRef(0);
  function closeReport() { if (reportBusy.current) return; setReporting(false); setReportTarget(null); }
  function openReport(target: PublicListing | null) { detailSequence.current++; setReportTarget(target); setDetail(null); setReporting(true); }
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const camera = useRef<CameraRef>(null); const source = useRef<GeoJSONSourceRef>(null);
  const path = useMemo(() => bounds ? wishItemId ? wishMatchPath(wishItemId, applied, bounds, radiusApplied) : listingSearchPath(applied, bounds) : null, [applied, bounds, wishItemId, radiusApplied]);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setClock(Date.now()); });
    return () => { mounted.current = false; sequence.current++; clearInterval(timer); clearTimeout(viewportTimer.current); subscription.remove(); };
  }, []);
  const visible = useMemo(() => items.filter(item => Date.parse(item.expiresAt) > clock), [items, clock]);
  const chosen = visible.find(item => item.id === selected);
  useEffect(() => { if (detail && Date.parse(detail.expiresAt) <= clock) { detailSequence.current++; setDetail(null); } }, [clock, detail]);
  const data = useMemo(() => listingGeoJSON(visible), [visible]);
  // Only 320px public thumbnails are registered; never download all original
  // photos or attach a session token to tile/image providers.
  const images = useMemo(() => Object.fromEntries(visible.map(item => ['photo-' + item.media[0].id, { source: { uri: item.media[0].thumbnailUrl } }])), [visible]);

  const load = useCallback(async (next?: string) => {
    if (!path) { sequence.current++; loading.current = false; setItems([]); setCursor(null); setBusy(false); return; }
    if (next && loading.current) return;
    const current = ++sequence.current; loading.current = true; setBusy(true); setError('');
    if (!next) { setItems([]); setCursor(null); setSelected(null); setDetail(null); setMatchReasons({}); }
    try {
      const query = next ? path + '&cursor=' + next : path;
      const response = await api<unknown>(query);
      const matches = wishItemId ? parseWishMatchPage(response, wishItemId, apiUrl, __DEV__) : null;
      const page = matches ? { items: matches.items.map(m => m.listing), nextCursor: matches.nextCursor } : parseListingPage(response, apiUrl, __DEV__);
      if (mounted.current && current === sequence.current) {
        // A repeated cursor must not create an infinite "load more" loop.
        if (next && page.nextCursor === next) { setCursor(null); throw new ListingSearchError('分頁資料未前進，請重新搜尋'); }
        setClock(Date.now()); setItems(previous => next ? mergeListingPages(previous, page.items) : page.items);
        setCursor(page.nextCursor);
        if (matches) setMatchReasons(old => ({ ...(next ? old : {}), ...Object.fromEntries(matches.items.map(m => [m.listing.id, m.reasons.map(r => r.text)])) }));
        const target = focusTarget.current;
        if (target) void openDetail(target).then(handled => { if (handled && focusTarget.current?.id === target.id) { focusTarget.current = null; onInitialListingHandled?.(); } });
      }
    } catch (failure) {
      if (mounted.current && current === sequence.current) setError(failure instanceof ListingSearchError ? failure.message : '暫時無法載入商品；請確認網路後重試。');
    } finally { if (mounted.current && current === sequence.current) { loading.current = false; setBusy(false); } }
  }, [api, apiUrl, path, wishItemId]);
  useEffect(() => { void load(); }, [load]);

  function apply() {
    try { if (wishItemId) wishMatchPath(wishItemId, filters, bounds ?? TAIWAN_BOUNDS, radiusInput); else listingSearchPath(filters, bounds ?? TAIWAN_BOUNDS); setApplied({ ...filters }); setRadiusApplied(radiusInput); setFiltering(false); setError(''); }
    catch (failure) { setError(failure instanceof ListingSearchError ? failure.message : '請檢查篩選條件'); }
  }
  function viewport(value: Bounds) {
    clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      const next = clipBounds(value);
      setBounds(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }, 350);
  }
  async function pressFeature(feature?: Feature) {
    if (!feature || feature.geometry.type !== 'Point') return;
    const properties = feature.properties;
    if (typeof properties?.cluster_id === 'number') {
      try {
        const zoom = await source.current?.getClusterExpansionZoom(properties.cluster_id);
        if (!mounted.current) return;
        if (zoom !== undefined && zoom <= 19) camera.current?.easeTo({ center: feature.geometry.coordinates.slice(0, 2) as [number, number], zoom, duration: 350 });
        else setListMode(true);
      } catch { if (mounted.current) setError('無法展開群聚；可切換清單瀏覽同範圍商品。'); }
    } else if (typeof properties?.listingId === 'string') setSelected(properties.listingId);
  }
  async function openDetail(item: PublicListing) {
    const current = sequence.current;
    const request = ++detailSequence.current;
    try {
      const fresh = parsePublicListing(await api<unknown>('/listings/' + item.id), apiUrl, __DEV__);
      if (Date.parse(fresh.expiresAt) <= Date.now()) throw new ListingSearchError('商品已失效，請重新搜尋');
      if (mounted.current && current === sequence.current && request === detailSequence.current) { setDetail(fresh); return true; }
    } catch { if (mounted.current && current === sequence.current && request === detailSequence.current) { setError('商品已停止刊登，或目前無法取得最新資料。'); setSelected(null); return true; } }
    return false;
  }
  async function contactSeller(item: PublicListing) {
    try {
      const room = parseChatRoom(await api<unknown>('/chat/conversations', { method: 'POST', body: JSON.stringify({ listingId: item.id }) }), userId);
      if (mounted.current) { setDetail(null); onOpenChat(room.id); }
    } catch { if (mounted.current) setError('無法開啟商品聊天，請確認登入、封鎖與商品狀態後重試。'); }
  }
  const card = (item: PublicListing, compact = false) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}，${listingPrice(item)}，${item.location.county}${item.location.district}`} onPress={() => void openDetail(item)} style={[s.card, compact && s.floatingCard]}>
    <Image source={{ uri: item.media[0].thumbnailUrl }} accessibilityLabel="商品縮圖" style={s.thumbnail} />
    <View style={s.cardText}><Text numberOfLines={2} style={s.cardTitle}>{item.title}</Text><Text style={s.price}>{listingPrice(item)}</Text><Text style={s.small}>{item.location.county} {item.location.district} · {item.condition === 'NEW' ? '新品' : '二手'}{item.status === 'RESERVED' ? ' · 已保留' : ''}</Text>{matchReasons[item.id]?.slice(0, 2).map(reason => <Text key={reason} style={s.small}>{reason}</Text>)}</View>
  </Pressable>;
  const options = <K extends 'condition' | 'delivery' | 'category'>(key: K, values: readonly (readonly [SearchFilters[K], string])[]) => <View style={s.wrap}>{values.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: filters[key] === value }} style={[s.chip, filters[key] === value && s.activeChip]} onPress={() => setFilters(old => ({ ...old, [key]: value }))}><Text style={s.text}>{label}</Text></Pressable>)}</View>;

  return <View style={s.screen}>
    {wishItemId && <View style={s.toolbar}><Text style={s.small}>符合所選願望 · 本頁評分排序／已載入群聚</Text><Pressable accessibilityRole="button" style={s.chip} onPress={onClearWish}><Text style={s.text}>取消願望篩選</Text></Pressable></View>}
    <View style={s.search}><TextInput accessibilityLabel="搜尋商品名稱與說明" placeholder="想找什麼好物？" value={filters.q} onChangeText={q => setFilters(old => ({ ...old, q }))} returnKeyType="search" onSubmitEditing={apply} style={s.searchInput} /><Pressable accessibilityRole="button" style={s.chip} onPress={apply}><Text style={s.text}>搜尋</Text></Pressable></View>
    <View style={s.toolbar}><Pressable accessibilityRole="button" style={s.chip} onPress={() => setFiltering(true)}><Text style={s.text}>篩選</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => setListMode(old => !old)}><Text style={s.text}>{listMode ? '切換地圖' : '切換清單'}</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => openReport(null)}><Text style={s.text}>我的檢舉</Text></Pressable><Text style={s.small}>已載入 {visible.length} 件</Text>{busy && <ActivityIndicator accessibilityLabel="搜尋商品中" />}</View>
    {!!error && <View style={s.notice}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={() => void load()}><Text style={s.text}>重新載入</Text></Pressable></View>}
    {!bounds && <Text style={s.notice}>目前視野不在台灣，請將地圖移回台灣範圍。</Text>}
    {listMode ? <FlatList data={visible} keyExtractor={item => item.id} renderItem={({ item }) => card(item)} contentContainerStyle={s.list} ListEmptyComponent={!busy && bounds && !error ? <Text style={s.text}>目前範圍沒有符合條件的商品。試試放大範圍或減少篩選。</Text> : null} ListFooterComponent={cursor ? <Pressable accessibilityRole="button" disabled={busy || items.length >= MAX_LOADED} style={s.chip} onPress={() => void load(cursor)}><Text style={s.text}>{items.length >= MAX_LOADED ? '請縮小地圖範圍或增加條件' : '載入更多同範圍商品'}</Text></Pressable> : null} /> : <View style={s.flex}>
      <NativeMap style={s.flex} mapStyle={MAP_STYLE} attribution onRegionDidChange={event => viewport(event.nativeEvent.bounds)} onDidFailLoadingMap={() => setMapError(true)} onDidFinishLoadingMap={() => setMapError(false)}>
        <Camera ref={camera} initialViewState={{ bounds: bounds ?? TAIWAN_BOUNDS }} maxZoom={19} />
        <Images images={images} />
        <GeoJSONSource ref={source} id="marketplace-items" data={data} cluster clusterRadius={48} clusterMaxZoom={20} onPress={event => void pressFeature(event.nativeEvent.features[0])}>
          <Layer id="marketplace-clusters" type="circle" filter={['has', 'point_count']} paint={{ 'circle-color': '#173E36', 'circle-radius': 24, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} />
          <Layer id="marketplace-counts" type="symbol" filter={['has', 'point_count']} layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 14, 'text-allow-overlap': true }} paint={{ 'text-color': '#FFFFFF' }} />
          <Layer id="marketplace-photo-borders" type="circle" filter={['!', ['has', 'point_count']]} paint={{ 'circle-color': '#FFFFFF', 'circle-radius': 26, 'circle-stroke-color': '#173E36', 'circle-stroke-width': 2 }} />
          <Layer id="marketplace-photos" type="symbol" filter={['!', ['has', 'point_count']]} layout={{ 'icon-image': ['get', 'icon'], 'icon-size': 0.15, 'icon-allow-overlap': false }} />
        </GeoJSONSource>
      </NativeMap>
      {(mapError || (!busy && !visible.length && bounds && !error) || cursor) && <View pointerEvents="box-none" style={s.mapNotice}><Text style={s.small}>{mapError ? '底圖暫時無法載入；仍可切換清單瀏覽。' : cursor ? '此範圍還有商品；放大地圖或切換清單載入更多。群聚數字僅計算已載入商品。' : '目前沒有符合條件的商品，試試調整範圍或條件。'}</Text></View>}
      {chosen && card(chosen, true)}
    </View>}
    <Modal visible={filtering} animationType="slide" onRequestClose={() => setFiltering(false)}><View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>
      <Text style={s.heading}>篩選好物</Text><Text style={s.text}>名稱／品牌／分類與價格；地圖與清單共用目前視野。</Text>
      <TextInput accessibilityLabel="搜尋文字" placeholder="搜尋文字" value={filters.q} onChangeText={q => setFilters(old => ({ ...old, q }))} style={s.input} />
      <TextInput accessibilityLabel="品牌" placeholder="品牌（完整名稱）" value={filters.brand} onChangeText={brand => setFilters(old => ({ ...old, brand }))} style={s.input} />
      {options('condition', [['', '全部新舊'], ['USED', '二手'], ['NEW', '新品']])}
      {options('category', [['', '全部分類'], ...CATEGORIES])}
      {options('delivery', [['', '全部交付'], ['MEETUP', '面交'], ['SHIPPING', '寄送']])}
      <TextInput accessibilityLabel="最低價格" placeholder="最低價格 TWD" keyboardType="decimal-pad" value={filters.minPrice} onChangeText={minPrice => setFilters(old => ({ ...old, minPrice }))} style={s.input} />
      <TextInput accessibilityLabel="最高價格" placeholder="最高價格 TWD" keyboardType="decimal-pad" value={filters.maxPrice} onChangeText={maxPrice => setFilters(old => ({ ...old, maxPrice }))} style={s.input} />
      {wishItemId && <><Text style={s.small}>願望距離以目前地圖視野的約2公里格點中心計算，不是精確GPS或面交地點。移動地圖後會依新視野重新比對。</Text><TextInput accessibilityLabel="願望配對距離（公里，選填）" placeholder="願望配對距離0.5至200公里（選填）" keyboardType="decimal-pad" value={radiusInput} onChangeText={setRadiusInput} style={s.input} /><Pressable accessibilityRole="button" style={s.chip} onPress={() => setRadiusInput('')}><Text style={s.text}>清除距離偏好</Text></Pressable></>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable accessibilityRole="button" style={s.button} onPress={apply}><Text style={s.white}>套用條件</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => { setFilters({ ...emptySearchFilters }); setRadiusInput(''); }}><Text style={s.text}>清除條件</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => setFiltering(false)}><Text style={s.text}>返回探索</Text></Pressable>
    </ScrollView></View></Modal>
    <Modal visible={!!detail || reporting} animationType="slide" onRequestClose={() => { if (reporting) closeReport(); else { detailSequence.current++; setDetail(null); } }}>{reporting ? <ListingReportSheet api={api} apiUrl={apiUrl} userId={userId} listing={reportTarget} onClose={closeReport} onBusyChange={value => { reportBusy.current = value; }} /> : <View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><ScrollView contentContainerStyle={s.list}>
      <Pressable accessibilityRole="button" style={s.chip} onPress={() => { detailSequence.current++; setDetail(null); }}><Text style={s.text}>返回探索</Text></Pressable>
      {detail && <><Text style={s.heading}>{detail.title}</Text><Text style={s.price}>{listingPrice(detail)}</Text><ScrollView horizontal>{detail.media.map(photo => <Image key={photo.id} source={{ uri: photo.thumbnailUrl }} style={s.detailPhoto} accessibilityLabel="商品實拍照片" />)}</ScrollView><Text style={s.text}>{detail.description}</Text><Text style={s.text}>品牌：{detail.brand || '未標示'} · {detail.condition === 'NEW' ? '新品' : '二手'}</Text><Text style={s.text}>{detail.location.county} {detail.location.district} · 約略位置</Text><Text style={s.small}>地圖位置已模糊化約2公里；不是面交地址。</Text><Text style={s.text}>{detail.deliveryMethods.map(method => method === 'MEETUP' ? '面交' : '寄送').join('／')}{detail.negotiable ? ' · 可議價' : ''}{detail.status === 'RESERVED' ? ' · 已保留' : ''}</Text><Text style={s.small}>刊登至 {new Date(detail.expiresAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</Text></>}
      {detail && detail.owner.id !== userId && <Pressable accessibilityRole="button" style={s.button} onPress={() => void contactSeller(detail)}><Text style={s.white}>聯絡賣家</Text></Pressable>}
      {detail && detail.owner.id !== userId && <Pressable accessibilityRole="button" style={s.chip} onPress={() => openReport(detail)}><Text style={s.text}>檢舉商品</Text></Pressable>}
      {detail && matchReasons[detail.id]?.map(reason => <Text key={reason} style={s.small}>{reason}</Text>)}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </ScrollView></View>}</Modal>
  </View>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: iosColors.background }, flex: { flex: 1 }, search: { flexDirection: 'row', paddingHorizontal: iosSpacing.md, paddingTop: iosSpacing.xs, gap: iosSpacing.xs }, searchInput: { flex: 1, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.pill, paddingHorizontal: iosSpacing.md, fontSize: 17, color: iosColors.label, backgroundColor: iosColors.surface, ...iosShadow }, toolbar: { flexDirection: 'row', padding: iosSpacing.sm, gap: iosSpacing.xs, alignItems: 'center', flexWrap: 'wrap' },
  list: { padding: iosSpacing.md, gap: iosSpacing.md, paddingBottom: iosSpacing.xxl }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: iosSpacing.xs }, chip: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, justifyContent: 'center' }, activeChip: { backgroundColor: iosColors.tintSoft, borderColor: iosColors.tint }, text: { ...iosType.body, color: iosColors.label }, small: { ...iosType.subheadline, color: iosColors.secondaryLabel }, heading: { ...iosType.title, color: iosColors.label }, price: { fontSize: 20, lineHeight: 25, fontWeight: '700', color: iosColors.tint }, input: { minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.control, padding: iosSpacing.md, fontSize: 17, backgroundColor: iosColors.surface, color: iosColors.label },
  card: { flexDirection: 'row', backgroundColor: iosColors.surface, borderRadius: iosRadius.card, padding: iosSpacing.sm, gap: iosSpacing.sm, marginBottom: iosSpacing.sm, ...iosShadow }, floatingCard: { position: 'absolute', bottom: iosSpacing.sm, left: iosSpacing.sm, right: iosSpacing.sm, ...iosFloatingShadow }, thumbnail: { width: 84, height: 84, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary }, cardText: { flex: 1, gap: iosSpacing.xxs }, cardTitle: { ...iosType.headline, color: iosColors.label }, detailPhoto: { width: 248, height: 248, borderRadius: iosRadius.card, marginRight: iosSpacing.sm, backgroundColor: iosColors.surfaceSecondary }, button: { minHeight: 52, padding: iosSpacing.md, borderRadius: iosRadius.control, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center' }, white: { color: iosColors.white, ...iosType.headline }, notice: { padding: iosSpacing.sm, gap: iosSpacing.xs }, error: { color: iosColors.danger, ...iosType.subheadline }, mapNotice: { position: 'absolute', top: iosSpacing.sm, left: iosSpacing.sm, right: iosSpacing.sm, padding: iosSpacing.sm, backgroundColor: iosColors.surface, borderRadius: iosRadius.control, ...iosFloatingShadow },
});
