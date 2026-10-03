import { exploreNavigationChange, exploreAutomaticSelection } from './exploreNavigation';
import { exploreResultStatus } from './exploreResultStatus';
import { ListingPhoto, listingPresentation } from './ListingPhoto';
import { useSourceLeads, type SourceChatContext } from './SourceLeadExplorer';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CameraRef, GeoJSONSource, GeoJSONSourceRef, Images, Layer, Map as NativeMap } from '@maplibre/maplibre-react-native';
import type { Feature } from 'geojson';
import { ApiError, createApi } from './api';
import { parseChatRoom } from './chatData';
import { CATEGORIES } from './listingForm';
import { Bounds, clipBounds, emptySearchFilters, listingGeoJSON, listingPrice, ListingSearchError, listingSearchPath, mergeListingPages, parseListingPage, parsePublicListing, PublicListing, SearchFilters, TAIWAN_BOUNDS } from './listingSearch';
import { parseWishMatchPage, wishMatchPath } from './wishData';
import { ListingReportSheet } from './ListingReportSheet';
import { iosColors, iosFloatingShadow, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
import { externalGeoJSON, externalPrice, externalSearchPath, externalWishSearchPath, parseExternalListing,
  parseExternalListingPage, type ExternalListing } from './externalListingSearch';
import { clusterLeafIds, expandedSearchBounds, resultCamera, type ResultCamera } from './exploreMapView';
import { externalPhotoPresentation, type ExternalPhotoLoadState } from './externalPhotoState';
import { libertyZhHantStyle } from './libertyZhHantStyle';

const MAX_LOADED = 500;
type Props = { active?: boolean; api: ReturnType<typeof createApi>; apiUrl: string; userId: number; onOpenChat: (id: string) => void; onOpenSourceChat:(context:SourceChatContext)=>void; wishItemId?: number; onClearWish?: () => void; initialSourceId?:string|null;onInitialSourceHandled?:()=>void;initialListing?: PublicListing | null; onInitialListingHandled?: () => void };

function ExternalDetailPhoto({ imageUrl, thumbnailUrl }: { imageUrl: string; thumbnailUrl: string }) {
  const [thumbnailState, setThumbnailState] = useState<ExternalPhotoLoadState>('loading');
  const [originalState, setOriginalState] = useState<ExternalPhotoLoadState>('loading');
  const presentation = externalPhotoPresentation(thumbnailState, originalState);
  return <View accessible accessibilityRole="image" accessibilityLabel={presentation.label} style={s.detailPhotoFrame}>
    <Image source={{ uri: thumbnailUrl }} resizeMode="cover" accessible={false} style={s.detailPhotoLayer}
      onLoad={() => setThumbnailState('loaded')} onError={() => setThumbnailState('failed')} />
    <Image source={{ uri: imageUrl }} resizeMode="cover" accessible={false}
      style={[s.detailPhotoLayer, presentation.visible !== 'original' && s.detailPhotoHidden]}
      onLoad={() => setOriginalState('loaded')} onError={() => setOriginalState('failed')} />
    {presentation.visible === 'placeholder' && <View style={s.detailPhotoPlaceholder}>
      {presentation.label === '來源商品圖片載入中' && <ActivityIndicator color={iosColors.tint} />}
      <Text style={s.small}>{presentation.hint}</Text>
    </View>}
    {presentation.visible === 'thumbnail' && presentation.hint &&
      <Text style={s.detailPhotoFallback}>{presentation.hint}</Text>}
  </View>;
}

export function ExploreScreen({ active = true, api, apiUrl, userId, onOpenChat, onOpenSourceChat, wishItemId, onClearWish, initialSourceId,onInitialSourceHandled, initialListing, onInitialListingHandled }: Props) {
  const activeRef=useRef(active); activeRef.current=active;
  const insets = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const compactControls = fontScale >= 1.3;
  const narrowMapCard = width <= 360 && fontScale < 1.3;
  const [filters, setFilters] = useState<SearchFilters>({ ...emptySearchFilters });
  const [applied, setApplied] = useState<SearchFilters>({ ...emptySearchFilters });
  const [filtering, setFiltering] = useState(false); const [listMode, setListMode] = useState(false);
  const [matchExplanationOpen, setMatchExplanationOpen] = useState(false);
  const [clusterPreview, setClusterPreview] = useState<{ kind: 'seller' | 'external'; ids: string[] } | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(initialListing ? clipBounds([initialListing.location.publicLongitude - 0.06, initialListing.location.publicLatitude - 0.06, initialListing.location.publicLongitude + 0.06, initialListing.location.publicLatitude + 0.06]) : TAIWAN_BOUNDS);
  const [items, setItems] = useState<PublicListing[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [externalItems, setExternalItems] = useState<ExternalListing[]>([]);
  const [externalCursor, setExternalCursor] = useState<string | null>(null);
  const [externalEnabled, setExternalEnabled] = useState(false);
  const [externalBusy, setExternalBusy] = useState(false), [externalError, setExternalError] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); const [detail, setDetail] = useState<PublicListing | null>(null);
  const [selectedExternal, setSelectedExternal] = useState<string | null>(null);
  const [externalDetail, setExternalDetail] = useState<ExternalListing | null>(null);
  const [externalOpening, setExternalOpening] = useState(false);
  const [reporting, setReporting] = useState(false), [reportTarget, setReportTarget] = useState<PublicListing | null>(null);
  const reportBusy = useRef(false);
  const [clock, setClock] = useState(Date.now());
  const [matchReasons, setMatchReasons] = useState<Record<string, string[]>>({});
  const [radiusInput, setRadiusInput] = useState(''), [radiusApplied, setRadiusApplied] = useState('');
  // The first page is a search too: frame it as soon as both sources finish.
  const [searchCycle, setSearchCycle] = useState(1), [sellerDoneCycle, setSellerDoneCycle] = useState(-1),
    [externalDoneCycle, setExternalDoneCycle] = useState(-1);
  const [resultFrame, setResultFrame] = useState<{ frame: ResultCamera; scope: Bounds } | null>(null);
  const [pendingFrame, setPendingFrame] = useState<ResultCamera | null>(null);
  const searchScope = useRef<Bounds>(bounds ?? TAIWAN_BOUNDS), latestViewport = useRef<Bounds | null>(bounds),
    lastFocusedCycle = useRef(initialListing ? 1 : 0);
  const focusTarget = useRef(initialListing ?? null);
  const sequence = useRef(0); const loading = useRef(false); const mounted = useRef(true);
  const externalSequence = useRef(0), externalLoading = useRef(false);
  const detailSequence = useRef(0);
  useEffect(()=>{if(!active){detailSequence.current++;setDetail(null);setExternalDetail(null);setExternalOpening(false);setFiltering(false);}},[active]);
  const previousNavigation=useRef({listingId:initialListing?.id??null,wishItemId});
  useEffect(()=>{
    const next={listingId:initialListing?.id??null,wishItemId};
    const change=exploreNavigationChange(previousNavigation.current,next,searchCycle);
    previousNavigation.current=next;
    if(!change.searchChanged)return;
    if(change.incomingTarget && initialListing){
      focusTarget.current=initialListing;
      lastFocusedCycle.current=change.cycle;
      const scope=clipBounds([initialListing.location.publicLongitude-0.06,initialListing.location.publicLatitude-0.06,initialListing.location.publicLongitude+0.06,initialListing.location.publicLatitude+0.06]);
      latestViewport.current=scope;searchScope.current=scope??TAIWAN_BOUNDS;setBounds(scope);
    }else focusTarget.current=null;
    setSearchCycle(change.cycle);
  },[initialListing,wishItemId]);
  function closeReport() { if (reportBusy.current) return; setReporting(false); setReportTarget(null); }
  function openReport(target: PublicListing | null) { detailSequence.current++; setReportTarget(target); setDetail(null); setReporting(true); }
  const listRef = useRef<FlatList>(null), listOffset = useRef(0);
  const camera = useRef<CameraRef>(null); const source = useRef<GeoJSONSourceRef>(null);
  const externalSource = useRef<GeoJSONSourceRef>(null);
  const leads = useSourceLeads({api,apiUrl,userId,bounds,active,onOpenSourceChat,initialSourceId,onInitialSourceHandled,q:applied.q,hidden:!!wishItemId || !!applied.brand || !!applied.category || !!applied.delivery || !!applied.condition || !!applied.minPrice || !!applied.maxPrice});
  const path = useMemo(() => bounds ? wishItemId ? wishMatchPath(wishItemId, applied, bounds, radiusApplied, true) : listingSearchPath(applied, bounds) : null, [applied, bounds, wishItemId, radiusApplied]);
  const externalPath = useMemo(() => bounds ? wishItemId ? externalWishSearchPath(wishItemId, applied, bounds, radiusApplied) :
    externalSearchPath(applied, bounds) : null, [applied, bounds, wishItemId, radiusApplied]);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setClock(Date.now()); });
    return () => { mounted.current = false; sequence.current++; externalSequence.current++;
      clearInterval(timer); subscription.remove(); };
  }, []);
  const visible = useMemo(() => items.filter(item => Date.parse(item.expiresAt) > clock), [items, clock]);
  const externalVisible = useMemo(() => externalItems.filter(item =>
    Date.parse(item.expiresAt) > clock && clock - Date.parse(item.observedAt) <= 48 * 3_600_000), [externalItems, clock]);
  const chosen = visible.find(item => item.id === selected);
  const chosenExternal = externalVisible.find(item => item.id === selectedExternal);
  useEffect(() => { if (detail && Date.parse(detail.expiresAt) <= clock) { detailSequence.current++; setDetail(null); } }, [clock, detail]);
  useEffect(() => { if (externalDetail && (Date.parse(externalDetail.expiresAt) <= clock ||
    clock - Date.parse(externalDetail.observedAt) > 48 * 3_600_000)) {
    detailSequence.current++; setExternalDetail(null); setSelectedExternal(null);
  } }, [clock, externalDetail]);
  const data = useMemo(() => listingGeoJSON(visible), [visible]);
  const externalData = useMemo(() => externalGeoJSON(externalVisible), [externalVisible]);
  // Only 320px public thumbnails are registered; never download all original
  // photos or attach a session token to tile/image providers.
  const images = useMemo(() => Object.fromEntries([
    ...visible.map(item => ['photo-' + item.media[0].id, { source: { uri: item.media[0].thumbnailUrl } }] as const),
    ...externalVisible.map(item => ['external-' + item.id, { source: { uri: item.thumbnailUrl } }] as const),
  ]), [visible, externalVisible]);

  const load = useCallback(async (next?: string) => {
    if (!path) { sequence.current++; loading.current = false; setItems([]); setCursor(null); setBusy(false); return; }
    if (next && loading.current) return;
    const current = ++sequence.current; loading.current = true; setBusy(true); setError(''); setClusterPreview(null);
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
        if (target) {
          setPendingFrame(resultCamera([{ longitude: target.location.publicLongitude, latitude: target.location.publicLatitude }]));
          setSelected(target.id);
          void openDetail(target).then(handled => { if (handled && focusTarget.current?.id === target.id) { focusTarget.current = null; onInitialListingHandled?.(); } });
        }
      }
    } catch (failure) {
      if (mounted.current && current === sequence.current) setError(failure instanceof ListingSearchError ? failure.message : '暫時無法載入商品；請確認網路後重試。');
    } finally { if (mounted.current && current === sequence.current) { loading.current = false; setBusy(false); setSellerDoneCycle(searchCycle); } }
  }, [api, apiUrl, path, wishItemId, searchCycle]);
  useEffect(() => { void load(); }, [load]);

  const loadExternal = useCallback(async (next?: string) => {
    if (!externalPath) { externalSequence.current++; detailSequence.current++; externalLoading.current = false;
      setExternalItems([]); setExternalCursor(null); setExternalEnabled(false); setExternalBusy(false);
      setSelectedExternal(null); setExternalDetail(null); setExternalError(''); setExternalDoneCycle(searchCycle); return; }
    if (next && externalLoading.current) return;
    const current = ++externalSequence.current; externalLoading.current = true;
    setExternalBusy(true); setExternalError(''); setClusterPreview(null);
    if (!next) { detailSequence.current++; setExternalItems([]); setExternalCursor(null);
      setSelectedExternal(null); setExternalDetail(null); }
    try {
      const response = await api<unknown>(next ? externalPath + '&cursor=' + next : externalPath);
      const page = parseExternalListingPage(response);
      if (mounted.current && current === externalSequence.current) {
        if (next && page.nextCursor === next) { setExternalCursor(null); throw new ListingSearchError('外部商品分頁未前進'); }
        setExternalEnabled(page.enabled);
        setExternalItems(previous => next ? [...new Map([...previous, ...page.items].map(item => [item.id, item])).values()] : page.items);
        setExternalCursor(page.nextCursor);
      }
    } catch (failure) {
      if (mounted.current && current === externalSequence.current) {
        if (failure instanceof ApiError && failure.status === 404) {
          setExternalEnabled(false); setExternalItems([]); setExternalCursor(null);
        }
        else setExternalError(failure instanceof ListingSearchError ? failure.message : '外部商品暫時無法載入。');
      }
    } finally { if (mounted.current && current === externalSequence.current) {
      externalLoading.current = false; setExternalBusy(false); setExternalDoneCycle(searchCycle); } }
  }, [api, externalPath, searchCycle]);
  useEffect(() => { void loadExternal(); }, [loadExternal]);

  useEffect(() => {
    const selection=exploreAutomaticSelection(searchCycle,lastFocusedCycle.current,visible.map(item=>item.id),externalVisible.map(item=>item.id));
    if (!selection || !searchCycle || sellerDoneCycle !== searchCycle ||
        externalDoneCycle !== searchCycle || busy || externalBusy || !leads.ready) return;
    lastFocusedCycle.current = searchCycle;
    const points = [
      ...visible.map(item => ({ longitude: item.location.publicLongitude, latitude: item.location.publicLatitude })),
      ...externalVisible.map(item => ({ longitude: item.location.longitude, latitude: item.location.latitude })),
      ...leads.points,
    ];
    const frame = resultCamera(points);
    if (!frame) { setResultFrame(null); return; }
    setResultFrame({ frame, scope: searchScope.current });
    // Keep the strongest/first loaded result visible as a bottom card even
    // when the map contains clusters. A map full of dots without a product
    // preview hides the most useful action on the first screen.
    if (selection.sellerId) { setSelected(selection.sellerId); setSelectedExternal(null); }
    else if (selection.externalId) { setSelectedExternal(selection.externalId); setSelected(null); }
    setListMode(false);
    setPendingFrame(frame);
  }, [searchCycle, sellerDoneCycle, externalDoneCycle, busy, externalBusy, error, externalError, visible, externalVisible, leads.ready, leads.points]);

  useEffect(() => {
    if (!active || listMode || !mapReady || !pendingFrame) return;
    const timer = setTimeout(() => {
      if (!camera.current) return;
      if (pendingFrame.kind === 'single') camera.current.easeTo({ center: pendingFrame.center,
        zoom: pendingFrame.zoom, padding: { bottom: 170 }, duration: 450 });
      else camera.current.fitBounds(pendingFrame.bounds, { padding: { top: 20, right: 24, bottom: 20, left: 24 }, duration: 450 });
      setPendingFrame(null);
    }, 80);
    return () => clearTimeout(timer);
  }, [active, listMode, mapReady, pendingFrame]);
  useEffect(() => { if (listMode) setMapReady(false); }, [listMode]);

  function showOnMap(kind: 'seller' | 'external', id: string, longitude: number, latitude: number) {
    if (kind === 'seller') { setSelected(id); setSelectedExternal(null); }
    else { setSelectedExternal(id); setSelected(null); }
    setClusterPreview(null); setListMode(false);
    setPendingFrame(resultCamera([{ longitude, latitude }]));
  }
  function returnToResults() {
    if (!resultFrame) return;
    latestViewport.current = resultFrame.scope;
    setBounds(resultFrame.scope);
    setClusterPreview(null); setListMode(false);
    setPendingFrame(resultFrame.frame);
  }
  function expandSearch() {
    if (!bounds) return;
    const expanded = expandedSearchBounds(bounds);
    searchScope.current = expanded;
    latestViewport.current = expanded;
    setResultFrame(null); setSellerDoneCycle(-1); setExternalDoneCycle(-1);
    setSearchCycle(old => old + 1);
    setBounds(expanded);
    setClusterPreview(null); setListMode(false);
    setPendingFrame({ kind: 'multiple', bounds: expanded });
  }

  function apply() {
    try { const scope = latestViewport.current;
      if (!scope) throw new ListingSearchError('請將地圖移回台灣範圍');
      if (wishItemId) wishMatchPath(wishItemId, filters, scope, radiusInput); else listingSearchPath(filters, scope);
      searchScope.current = scope; setBounds(scope); setResultFrame(null); setSellerDoneCycle(-1); setExternalDoneCycle(-1);
      setSearchCycle(old => old + 1); setApplied({ ...filters }); setRadiusApplied(radiusInput); setFiltering(false); setError(''); setClusterPreview(null); }
    catch (failure) { setError(failure instanceof ListingSearchError ? failure.message : '請檢查篩選條件'); }
  }
  function viewport(value: Bounds) {
    if (!active) return;
    // Moving the camera never silently changes the submitted search or drops
    // previously loaded pages. Search/expand explicitly commits this viewport.
    latestViewport.current = clipBounds(value);
  }
  async function pressFeature(feature?: Feature) {
    if (!feature || feature.geometry.type !== 'Point') return;
    const properties = feature.properties;
    if (typeof properties?.cluster_id === 'number') {
      try {
        const zoom = await source.current?.getClusterExpansionZoom(properties.cluster_id);
        if (!mounted.current) return;
        if (zoom !== undefined && zoom <= 19) camera.current?.easeTo({ center: feature.geometry.coordinates.slice(0, 2) as [number, number], zoom, duration: 350 });
        else {
          const leaves = await source.current?.getClusterLeaves(properties.cluster_id, Math.min(properties.point_count ?? MAX_LOADED, MAX_LOADED), 0);
          const ids = clusterLeafIds(leaves ?? [], 'listingId').filter(id => visible.some(item => item.id === id));
          if (!mounted.current) return;
          if (!ids.length) throw new Error('Cluster leaves unavailable');
          setClusterPreview({ kind: 'seller', ids }); setListMode(true);
        }
      } catch { if (mounted.current) setError('無法展開群聚；可切換清單瀏覽同範圍商品。'); }
    } else if (typeof properties?.listingId === 'string') { setSelected(properties.listingId); setSelectedExternal(null); }
  }
  async function pressExternalFeature(feature?: Feature) {
    if (!feature || feature.geometry.type !== 'Point') return;
    const properties = feature.properties;
    if (typeof properties?.cluster_id === 'number') {
      try {
        const zoom = await externalSource.current?.getClusterExpansionZoom(properties.cluster_id);
        if (!mounted.current) return;
        if (zoom !== undefined && zoom <= 19) camera.current?.easeTo({ center: feature.geometry.coordinates.slice(0, 2) as [number, number], zoom, duration: 350 });
        else {
          const leaves = await externalSource.current?.getClusterLeaves(properties.cluster_id, Math.min(properties.point_count ?? MAX_LOADED, MAX_LOADED), 0);
          const ids = clusterLeafIds(leaves ?? [], 'externalId').filter(id => externalVisible.some(item => item.id === id));
          if (!mounted.current) return;
          if (!ids.length) throw new Error('Cluster leaves unavailable');
          setClusterPreview({ kind: 'external', ids }); setListMode(true);
        }
      } catch { if (mounted.current) setExternalError('無法展開外部商品群聚；可切換清單瀏覽。'); }
    } else if (typeof properties?.externalId === 'string') {
      setSelectedExternal(properties.externalId); setSelected(null);
    }
  }
  async function openDetail(item: PublicListing) {
    if(!activeRef.current)return false;
    const current = sequence.current;
    const request = ++detailSequence.current;
    try {
      const fresh = parsePublicListing(await api<unknown>('/listings/' + item.id), apiUrl, __DEV__);
      if (Date.parse(fresh.expiresAt) <= Date.now()) throw new ListingSearchError('商品已失效，請重新搜尋');
      if (mounted.current && activeRef.current && current === sequence.current && request === detailSequence.current) { setDetail(fresh); return true; }
    } catch { if (mounted.current && activeRef.current && current === sequence.current && request === detailSequence.current) { setError('商品已停止刊登，或目前無法取得最新資料。'); setSelected(null); return true; } }
    return false;
  }
  async function contactSeller(item: PublicListing) {
    try {
      const room = parseChatRoom(await api<unknown>('/chat/conversations', { method: 'POST', body: JSON.stringify({ listingId: item.id }) }), userId);
      if (mounted.current) { setDetail(null); onOpenChat(room.id); }
    } catch { if (mounted.current) setError('無法開啟商品聊天，請確認登入、封鎖與商品狀態後重試。'); }
  }
  async function openExternalDetail(item: ExternalListing) {
    if(!activeRef.current)return;
    const request = ++detailSequence.current;
    try {
      const fresh = parseExternalListing(await api<unknown>('/external-listings/' + item.id));
      if (fresh.id !== item.id) throw new ListingSearchError('外部商品識別不符');
      if (mounted.current && activeRef.current && request === detailSequence.current) setExternalDetail(fresh);
    } catch { if (mounted.current && activeRef.current && request === detailSequence.current) {
      setExternalError('來源商品已停止公開，請重新搜尋。'); setSelectedExternal(null);
    } }
  }
  async function openExternalSource(item: ExternalListing) {
    if (externalOpening) return;
    setExternalOpening(true);
    try {
      const fresh = parseExternalListing(await api<unknown>('/external-listings/' + item.id));
      if (fresh.id !== item.id) throw new ListingSearchError('外部商品識別不符');
      await Linking.openURL(fresh.canonicalUrl);
    } catch { if (mounted.current) { setExternalDetail(null); setExternalError('無法開啟來源商品；可能已失效或連結不可用。'); } }
    finally { if (mounted.current) setExternalOpening(false); }
  }
  const card = (item: PublicListing, compact = false) => <Pressable accessibilityRole="button" accessibilityLabel={`${wishItemId && item.owner.id === userId ? '我的商品配對預覽，' : ''}${item.title}，${listingPrice(item)}，${item.location.county}${item.location.district}`} onPress={() => void openDetail(item)} style={[s.card, compact && s.floatingCard, compact && narrowMapCard && s.narrowFloatingCard]}>
    <ListingPhoto uri={item.media[0].thumbnailUrl} label="商品縮圖" style={[s.thumbnail, compact && narrowMapCard && s.narrowFloatingThumbnail]} />
    <View style={s.cardText}>{wishItemId && item.owner.id === userId && <Text numberOfLines={compact && narrowMapCard ? 1 : undefined} style={s.small}>我的商品 · 配對預覽，非買家推薦</Text>}<Text numberOfLines={compact && narrowMapCard ? 1 : 2} style={s.cardTitle}>{item.title}</Text><Text numberOfLines={1} style={[s.price, compact && narrowMapCard && s.narrowFloatingPrice]}>{listingPrice(item)}</Text><Text numberOfLines={compact && narrowMapCard || compactControls ? 1 : undefined} style={s.small}>{item.location.county} {item.location.district} · {item.condition === 'NEW' ? '新品' : '二手'}{item.status === 'RESERVED' ? ' · 已保留' : ''}</Text>{(!compact || !narrowMapCard) && matchReasons[item.id]?.slice(0, 2).map(reason => <Text key={reason} style={s.small}>{reason}</Text>)}</View>
  </Pressable>;
  const externalCard = (item: ExternalListing, compact = false) => <Pressable accessibilityRole="button"
    accessibilityLabel={`外部來源商品，${item.title}，${externalPrice(item)}，${item.county}${item.district}`}
    onPress={() => void openExternalDetail(item)} style={[s.card, s.externalCard, compact && s.floatingCard, compact && narrowMapCard && s.narrowFloatingCard]}>
    <ListingPhoto uri={item.thumbnailUrl} label="來源商品縮圖" style={[s.thumbnail, compact && narrowMapCard && s.narrowFloatingThumbnail]} />
    <View style={s.cardText}><Text style={s.externalBadge}>外部來源 · {item.source.host}</Text>
      <Text numberOfLines={compact && narrowMapCard ? 1 : 2} style={s.cardTitle}>{item.title}</Text><Text numberOfLines={1} style={[s.price, compact && narrowMapCard && s.narrowFloatingPrice]}>{externalPrice(item)}</Text>
      <Text numberOfLines={compact && narrowMapCard || compactControls ? 1 : undefined} style={s.small}>{item.county} {item.district} · {compact && narrowMapCard ? '約略位置' : '行政區中心示意 · 回原站交易'}</Text></View>
  </Pressable>;
  const allListItems = [...visible.map(item => ({ kind: 'seller' as const, item })),
    ...externalVisible.map(item => ({ kind: 'external' as const, item }))];
  const listItems = clusterPreview ? allListItems.filter(entry =>
    entry.kind === clusterPreview.kind && clusterPreview.ids.includes(entry.item.id)) : allListItems;
  const canExpand = !!bounds && JSON.stringify(expandedSearchBounds(bounds)) !== JSON.stringify(bounds);
  const results = exploreResultStatus(
    { count:visible.length, busy, ready:sellerDoneCycle===searchCycle, error, hasMore:!!cursor, enabled:true, skipped:!bounds },
    { count:externalVisible.length, busy:externalBusy, ready:externalDoneCycle===searchCycle, error:externalError, hasMore:!!externalCursor, enabled:externalEnabled, skipped:!externalPath },
    { count:leads.count, busy:leads.busy, ready:leads.ready, error:leads.error, hasMore:leads.hasMore, enabled:leads.enabled, skipped:leads.skipped });
  const resultSummary = `此次搜尋範圍（搜尋時的地圖視野）｜${results.summary}`;
  useEffect(() => {
    if (!active) return;
    const timer=setTimeout(()=>{
      if(listMode) listRef.current?.scrollToOffset({offset:listOffset.current,animated:false});
      else if(latestViewport.current && camera.current) camera.current.fitBounds(latestViewport.current,{duration:0});
    },150);
    return ()=>clearTimeout(timer);
  },[active,listMode]);
  const options = <K extends 'condition' | 'delivery' | 'category'>(key: K, values: readonly (readonly [SearchFilters[K], string])[]) => <View style={s.wrap}>{values.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: filters[key] === value }} style={[s.chip, filters[key] === value && s.activeChip]} onPress={() => setFilters(old => ({ ...old, [key]: value }))}><Text style={s.text}>{label}</Text></Pressable>)}</View>;

  return <View style={s.screen}>
    {wishItemId && <View style={s.wishBanner}>
      <View style={s.wishBannerRow}>
        <Text style={s.wishBannerTitle}>符合所選願望</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: matchExplanationOpen }}
          accessibilityHint="查看願望配對與外部來源的限制" style={[s.chip, s.compactToolbarChip]}
          onPress={() => setMatchExplanationOpen(open => !open)}>
          <Text style={s.text}>{matchExplanationOpen ? (compactControls ? '收合' : '收合說明') : (compactControls ? '說明' : '比對說明')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="取消願望篩選" style={[s.chip, s.compactToolbarChip]} onPress={onClearWish}>
          <Text style={s.text}>取消</Text>
        </Pressable>
      </View>
      {matchExplanationOpen && <Text style={s.small}>自己刊登的商品會標為配對預覽，不是買家推薦；圖片不直接比對。站內本頁評分排序；外部來源依文字及可比較的台幣預算篩出候選，請到來源核對型號、庫存與真偽。</Text>}
    </View>}
    <View style={s.search}><TextInput accessibilityLabel="搜尋商品名稱與說明" placeholder="想找什麼好物？" value={filters.q} onChangeText={q => setFilters(old => ({ ...old, q }))} returnKeyType="search" onSubmitEditing={apply} style={s.searchInput} /><Pressable accessibilityRole="button" style={s.chip} onPress={apply}><Text style={s.text}>搜尋</Text></Pressable></View>
    <View style={s.toolbar}><Pressable accessibilityRole="button" style={[s.chip, compactControls && s.compactToolbarChip]} onPress={() => setFiltering(true)}><Text style={s.text}>篩選</Text></Pressable><Pressable accessibilityRole="button" style={[s.chip, compactControls && s.compactToolbarChip]} onPress={() => { setClusterPreview(null); setListMode(old => !old); }}><Text style={s.text}>{listMode ? '切換地圖' : '切換清單'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="我的檢舉" style={[s.chip, compactControls && s.compactToolbarChip]} onPress={() => openReport(null)}><Text style={s.text}>{compactControls ? '檢舉' : '我的檢舉'}</Text></Pressable>
      {results.loading && <ActivityIndicator accessibilityLabel="搜尋商品中" />}</View>
    {!!error && <View style={s.notice}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={() => void load()}><Text style={s.text}>重新載入</Text></Pressable></View>}
    {!!externalError && <View style={s.notice}><Text accessibilityRole="alert" style={s.error}>{externalError}</Text><Pressable accessibilityRole="button" disabled={externalBusy} style={s.chip} onPress={() => void loadExternal()}><Text style={s.text}>重載外部商品</Text></Pressable></View>}
    {bounds && !externalPath && <Text style={s.notice}>目前篩選包含外部來源無法驗證的欄位{wishItemId && radiusApplied ? '（含距離）' : ''}，這些欄位只篩選站內刊登。</Text>}
    {!bounds && <Text style={s.notice}>目前視野不在台灣，請將地圖移回台灣範圍。</Text>}
    {listMode ? <FlatList ref={listRef} onScroll={event=>{if(active)listOffset.current=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={100} data={listItems} keyExtractor={entry => entry.kind + ':' + entry.item.id}
      ListHeaderComponent={<View style={s.listStatus}>{leads.list}<Text accessibilityLiveRegion="polite" style={s.small}>{clusterPreview ? `此圖釘包含 ${listItems.length} 件刊登｜${results.summary}` : resultSummary}</Text><View style={s.wrap}>
        {clusterPreview && <Pressable accessibilityRole="button" style={s.chip} onPress={() => setClusterPreview(null)}><Text style={s.text}>查看全部已載入商品</Text></Pressable>}
        {!clusterPreview && canExpand && <Pressable accessibilityRole="button" style={s.scopeButton} onPress={expandSearch}><Text style={s.scopeText}>擴大範圍搜尋</Text></Pressable>}
        {!clusterPreview && !!resultFrame && <Pressable accessibilityRole="button" style={s.chip} onPress={returnToResults}><Text style={s.text}>回到搜尋結果</Text></Pressable>}
      </View></View>}
      renderItem={({ item }) => <View>{item.kind === 'seller' ? card(item.item) : externalCard(item.item)}
        <Pressable accessibilityRole="button" accessibilityLabel={`在地圖上查看${item.item.title}`}
          onPress={() => item.kind === 'seller'
            ? showOnMap('seller', item.item.id, item.item.location.publicLongitude, item.item.location.publicLatitude)
            : showOnMap('external', item.item.id, item.item.location.longitude, item.item.location.latitude)} style={s.mapLink}>
          <Text style={s.mapLinkText}>在地圖上查看</Text>
        </Pressable></View>}
      contentContainerStyle={s.list} ListEmptyComponent={bounds && results.notice ? <Text style={s.text}>{results.notice}</Text> : null}
      ListFooterComponent={clusterPreview ? null : <View style={s.wrap}>{cursor && <Pressable accessibilityRole="button" disabled={busy || items.length >= MAX_LOADED} style={s.chip} onPress={() => void load(cursor)}><Text style={s.text}>{items.length >= MAX_LOADED ? '請縮小地圖範圍或增加條件' : '載入更多站內商品'}</Text></Pressable>}
        {externalCursor && <Pressable accessibilityRole="button" disabled={externalBusy || externalItems.length >= MAX_LOADED} style={s.chip} onPress={() => void loadExternal(externalCursor)}><Text style={s.text}>{externalItems.length >= MAX_LOADED ? '請縮小地圖範圍或增加條件' : '載入更多外部商品'}</Text></Pressable>}</View>} /> : <View style={s.flex}>
      <NativeMap style={s.flex} mapStyle={libertyZhHantStyle} attribution onRegionDidChange={event => viewport(event.nativeEvent.bounds)} onDidFailLoadingMap={() => setMapError(true)} onDidFinishLoadingStyle={() => { setMapError(false); setMapReady(true); }} onDidFinishLoadingMap={() => { setMapError(false); setMapReady(true); }}>
        <Camera ref={camera} initialViewState={{ bounds: latestViewport.current ?? bounds ?? TAIWAN_BOUNDS }} maxZoom={19} />
        <Images images={images} />
        {leads.layers}
        <GeoJSONSource ref={source} id="marketplace-items" data={data} cluster clusterRadius={48} clusterMaxZoom={20} onPress={event => void pressFeature(event.nativeEvent.features[0])}>
          <Layer id="marketplace-clusters" type="circle" filter={['has', 'point_count']} paint={{ 'circle-color': '#173E36', 'circle-radius': 24, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} />
          <Layer id="marketplace-counts" type="symbol" filter={['has', 'point_count']} layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 14, 'text-allow-overlap': true }} paint={{ 'text-color': '#FFFFFF' }} />
          <Layer id="marketplace-photo-borders" type="circle" filter={['!', ['has', 'point_count']]} paint={{ 'circle-color': '#FFFFFF', 'circle-radius': 26, 'circle-stroke-color': '#173E36', 'circle-stroke-width': 2 }} />
          <Layer id="marketplace-photos" type="symbol" filter={['!', ['has', 'point_count']]} layout={{ 'icon-image': ['get', 'icon'], 'icon-size': 0.15, 'icon-allow-overlap': false }} />
        </GeoJSONSource>
        <GeoJSONSource ref={externalSource} id="attributed-external-items" data={externalData} cluster clusterRadius={48} clusterMaxZoom={20} onPress={event => void pressExternalFeature(event.nativeEvent.features[0])}>
          <Layer id="external-clusters" type="circle" filter={['has', 'point_count']} paint={{ 'circle-color': '#A75615', 'circle-radius': 24, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} />
          <Layer id="external-counts" type="symbol" filter={['has', 'point_count']} layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 14, 'text-allow-overlap': true }} paint={{ 'text-color': '#FFFFFF' }} />
          <Layer id="external-photo-borders" type="circle" filter={['!', ['has', 'point_count']]} paint={{ 'circle-color': '#FFFFFF', 'circle-radius': 26, 'circle-stroke-color': '#A75615', 'circle-stroke-width': 3 }} />
          <Layer id="external-photos" type="symbol" filter={['!', ['has', 'point_count']]} layout={{ 'icon-image': ['get', 'icon'], 'icon-size': 0.15, 'icon-allow-overlap': false }} />
        </GeoJSONSource>
      </NativeMap>
      <View pointerEvents="box-none" style={s.mapTopActions}>
        <View pointerEvents="box-none" style={s.mapMetaRow}>
          <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL('https://www.openstreetmap.org/copyright')}><Text style={s.small}>© OpenStreetMap contributors · 線索座標 ODbL</Text></Pressable>
          <Text style={s.small}>來源標記是待確認線索，非在售件數／現貨所在地。</Text>
          <Text accessibilityLabel={resultSummary} accessibilityLiveRegion="polite" style={s.mapCount}>{results.summary}</Text>
          {!!resultFrame && <Pressable accessibilityRole="button" accessibilityLabel="回到搜尋結果" style={s.mapAction} onPress={returnToResults}><Text style={s.scopeText}>回到結果</Text></Pressable>}
        </View>
        {canExpand && <Pressable accessibilityRole="button" style={s.mapAction} onPress={expandSearch}><Text style={s.scopeText}>擴大範圍搜尋</Text></Pressable>}
        {(mapError || !!results.notice) && <View style={s.mapNotice}><Text style={s.small}>{mapError ? '底圖暫時無法載入；仍可切換清單瀏覽。' : results.notice}</Text></View>}
        {leads.skipped && bounds && <View style={s.mapNotice}><Text style={s.small}>待確認來源不支援目前的品牌／分類／新舊／價格／交易或願望篩選，因此未查；清除這些條件可按搜尋文字查看。</Text></View>}
      </View>
      {chosen && card(chosen, true)}
      {chosenExternal && externalCard(chosenExternal, true)}
    </View>}
    {leads.modal}
    <Modal visible={active && filtering} animationType="slide" onRequestClose={() => setFiltering(false)}><View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>
      <Text style={s.heading}>篩選好物</Text><Text style={s.text}>名稱／品牌／分類與價格；地圖與清單共用目前視野。</Text>
      <Text style={s.fieldLabel}>搜尋文字</Text><TextInput accessibilityLabel="搜尋文字" placeholder="例如：三國演義漫畫" value={filters.q} onChangeText={q => setFilters(old => ({ ...old, q }))} style={s.input} />
      <Text style={s.fieldLabel}>品牌（選填，須完整相同）</Text><TextInput accessibilityLabel="品牌" placeholder="品牌完整名稱" value={filters.brand} onChangeText={brand => setFilters(old => ({ ...old, brand }))} style={s.input} />
      {options('condition', [['', '全部新舊'], ['USED', '二手'], ['NEW', '新品']])}
      {options('category', [['', '全部分類'], ...CATEGORIES])}
      {options('delivery', [['', '全部交付'], ['MEETUP', '面交'], ['SHIPPING', '寄送']])}
      <Text style={s.fieldLabel}>最低價格（NT$，選填）</Text><TextInput accessibilityLabel="最低價格，新臺幣" placeholder="留空不限" keyboardType="decimal-pad" value={filters.minPrice} onChangeText={minPrice => setFilters(old => ({ ...old, minPrice }))} style={s.input} />
      <Text style={s.fieldLabel}>最高價格（NT$，選填）</Text><TextInput accessibilityLabel="最高價格，新臺幣" placeholder="留空不限" keyboardType="decimal-pad" value={filters.maxPrice} onChangeText={maxPrice => setFilters(old => ({ ...old, maxPrice }))} style={s.input} />
      {wishItemId && <><Text style={s.small}>願望距離以地圖視野的約2公里格點中心計算，不是精確GPS或面交地點。移動地圖後，按「套用條件」才會依新視野重新比對。</Text><Text style={s.fieldLabel}>願望配對距離（公里，選填）</Text><TextInput accessibilityLabel="願望配對距離（公里，選填）" placeholder="0.5 至 200 公里" keyboardType="decimal-pad" value={radiusInput} onChangeText={setRadiusInput} style={s.input} /><Pressable accessibilityRole="button" style={s.chip} onPress={() => setRadiusInput('')}><Text style={s.text}>清除距離偏好</Text></Pressable></>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable accessibilityRole="button" style={s.button} onPress={apply}><Text style={s.white}>套用條件</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => { setFilters({ ...emptySearchFilters }); setRadiusInput(''); }}><Text style={s.text}>清除條件</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => setFiltering(false)}><Text style={s.text}>返回探索</Text></Pressable>
    </ScrollView></View></Modal>
    <Modal visible={active && (!!detail || reporting)} animationType="slide" onRequestClose={() => { if (reporting) closeReport(); else { detailSequence.current++; setDetail(null); } }}>{reporting ? <ListingReportSheet api={api} apiUrl={apiUrl} userId={userId} listing={reportTarget} onClose={closeReport} onBusyChange={value => { reportBusy.current = value; }} /> : <View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><ScrollView contentContainerStyle={s.list}>
      <Pressable accessibilityRole="button" style={s.chip} onPress={() => { detailSequence.current++; setDetail(null); }}><Text style={s.text}>返回探索</Text></Pressable>
      {detail && <><Text style={s.heading}>{detail.title}</Text><Text style={s.price}>{listingPrice(detail)}</Text><ScrollView horizontal>{detail.media.map(photo => <Image key={photo.id} source={{ uri: photo.thumbnailUrl }} style={s.detailPhoto} accessibilityLabel="商品實拍照片" />)}</ScrollView><Text style={s.text}>{detail.description}</Text><Text style={s.text}>品牌：{detail.brand || '未標示'} · {detail.condition === 'NEW' ? '新品' : '二手'}</Text><Text style={s.text}>{detail.location.county} {detail.location.district} · 約略位置</Text><Text style={s.small}>地圖位置已模糊化約2公里；不是面交地址。</Text><Text style={s.text}>{detail.deliveryMethods.map(method => method === 'MEETUP' ? '面交' : '寄送').join('／')}{detail.negotiable ? ' · 可議價' : ''}{detail.status === 'RESERVED' ? ' · 已保留' : ''}</Text><Text style={s.small}>刊登至 {new Date(detail.expiresAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</Text></>}
      {detail && detail.owner.id !== userId && <Pressable accessibilityRole="button" style={s.button} onPress={() => void contactSeller(detail)}><Text style={s.white}>聯絡賣家</Text></Pressable>}
      {detail && detail.owner.id !== userId && <Pressable accessibilityRole="button" style={s.chip} onPress={() => openReport(detail)}><Text style={s.text}>檢舉商品</Text></Pressable>}
      {detail && matchReasons[detail.id]?.map(reason => <Text key={reason} style={s.small}>{reason}</Text>)}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </ScrollView></View>}</Modal>
    <Modal visible={active && !!externalDetail} animationType="slide" onRequestClose={() => { detailSequence.current++; setExternalDetail(null); }}>
      <View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><ScrollView contentContainerStyle={s.list}>
        <Pressable accessibilityRole="button" style={s.chip} onPress={() => { detailSequence.current++; setExternalDetail(null); }}><Text style={s.text}>返回探索</Text></Pressable>
        {externalDetail && <><Text style={s.externalBadge}>外部來源 · {externalDetail.source.host}</Text>
          <Text style={s.heading}>{externalDetail.title}</Text><Text style={s.price}>{externalPrice(externalDetail)}</Text>
          <ExternalDetailPhoto key={externalDetail.id} imageUrl={externalDetail.imageUrl} thumbnailUrl={externalDetail.thumbnailUrl} />
          <Text style={s.text}>{externalDetail.description}</Text>
          {externalDetail.aiSupplement && <><Text style={s.externalBadge}>AI 補充說明 · 已人工審核</Text>
            <Text style={s.text}>{externalDetail.aiSupplement}</Text>
            <Text style={s.small}>AI 依授權圖片產生的補充資訊，可能有誤；商品現況與售價仍以來源網站為準。</Text></>}
          <Text style={s.text}>{externalDetail.county} {externalDetail.district} · 二手</Text>
          <Text style={s.small}>地圖圖釘是行政區中心示意，不是商品或面交的精確位置。售價與原始描述由來源提供，Wishlist.ai 並非此商品賣家；請在原站確認現貨、狀態與交易方式。</Text>
          <Text style={s.small}>來源最後確認：{new Date(externalDetail.observedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</Text>
          <Pressable accessibilityRole="button" disabled={externalOpening} style={s.button} onPress={() => void openExternalSource(externalDetail)}><Text style={s.white}>{externalOpening ? '重新確認來源中…' : '前往來源網站查看'}</Text></Pressable>
          <Text style={s.small}>這是外部導流商品，不提供站內賣家聊天或面交預約。</Text></>}
      </ScrollView></View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: iosColors.background }, flex: { flex: 1 }, search: { flexDirection: 'row', paddingHorizontal: iosSpacing.md, paddingTop: iosSpacing.xs, gap: iosSpacing.xs }, searchInput: { flex: 1, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.pill, paddingHorizontal: iosSpacing.md, fontSize: 17, color: iosColors.label, backgroundColor: iosColors.surface, ...iosShadow }, toolbar: { flexDirection: 'row', padding: iosSpacing.sm, gap: iosSpacing.xs, alignItems: 'center', flexWrap: 'wrap' }, wishBanner: { paddingHorizontal: iosSpacing.md, paddingTop: iosSpacing.xs, gap: iosSpacing.xxs }, wishBannerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: iosSpacing.xs }, wishBannerTitle: { ...iosType.subheadline, color: iosColors.label, fontWeight: '700', flexShrink: 1 },
  list: { padding: iosSpacing.md, gap: iosSpacing.md, paddingBottom: iosSpacing.xxl }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: iosSpacing.xs }, chip: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, justifyContent: 'center' }, compactToolbarChip: { paddingHorizontal: iosSpacing.xs }, activeChip: { backgroundColor: iosColors.tintSoft, borderColor: iosColors.tint }, text: { ...iosType.body, color: iosColors.label }, small: { ...iosType.subheadline, color: iosColors.secondaryLabel, flexShrink:1 }, fieldLabel: { ...iosType.subheadline, color: iosColors.label, fontWeight: '600' }, heading: { ...iosType.title, color: iosColors.label }, price: { fontSize: 20, lineHeight: 25, fontWeight: '700', color: iosColors.tint }, input: { minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.control, padding: iosSpacing.md, fontSize: 17, backgroundColor: iosColors.surface, color: iosColors.label },
  card: { ...listingPresentation.card, ...iosShadow }, externalCard: { borderWidth: 1, borderColor: '#A75615' }, externalBadge: { ...iosType.subheadline, color: '#A75615', fontWeight: '700' }, floatingCard: { position: 'absolute', bottom: iosSpacing.sm, left: iosSpacing.sm, right: iosSpacing.sm, ...iosFloatingShadow }, thumbnail: { width: 84, height: 84, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary }, cardText: { flex: 1, gap: iosSpacing.xxs }, cardTitle: { ...iosType.headline, color: iosColors.label }, detailPhoto: { width: 248, height: 248, borderRadius: iosRadius.card, marginRight: iosSpacing.sm, backgroundColor: iosColors.surfaceSecondary }, detailPhotoFrame: { width: 248, height: 248, borderRadius: iosRadius.card, marginRight: iosSpacing.sm, backgroundColor: iosColors.surfaceSecondary, overflow: 'hidden' }, detailPhotoLayer: { ...StyleSheet.absoluteFill }, detailPhotoHidden: { opacity: 0 }, detailPhotoPlaceholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: iosSpacing.xs }, detailPhotoFallback: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: iosSpacing.xs, backgroundColor: 'rgba(255,255,255,0.92)', textAlign: 'center', color: iosColors.secondaryLabel, ...iosType.caption }, button: { minHeight: 52, padding: iosSpacing.md, borderRadius: iosRadius.control, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center' }, white: { color: iosColors.white, ...iosType.headline }, notice: { padding: iosSpacing.sm, gap: iosSpacing.xs }, error: { color: iosColors.danger, ...iosType.subheadline }, mapTopActions: { position: 'absolute', top: iosSpacing.sm, left: iosSpacing.sm, right: iosSpacing.sm, gap: iosSpacing.xs, alignItems: 'flex-start' }, mapMetaRow: { width: '100%', flexDirection: 'column', alignItems: 'flex-start', gap: iosSpacing.xs }, mapCount: { maxWidth:'100%', flexShrink: 1, paddingHorizontal: iosSpacing.sm, paddingVertical: iosSpacing.xs, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, color: iosColors.label, ...iosType.subheadline, ...iosFloatingShadow }, mapAction: { minHeight: minimumTapSize, justifyContent: 'center', paddingHorizontal: iosSpacing.sm, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, ...iosFloatingShadow }, mapNotice: { padding: iosSpacing.sm, backgroundColor: iosColors.surface, borderRadius: iosRadius.control, ...iosFloatingShadow }, listStatus: { gap: iosSpacing.sm },
  scopeButton: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, justifyContent: 'center',
    backgroundColor: iosColors.tintSoft, borderColor: iosColors.tint, borderWidth: 1, borderRadius: iosRadius.pill },
  scopeText: { ...iosType.subheadline, fontWeight: '700', color: iosColors.tint },
  mapLink: { minHeight: minimumTapSize, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: iosSpacing.md },
  mapLinkText: { ...iosType.subheadline, fontWeight: '700', color: iosColors.tint },
  narrowFloatingCard: { padding: iosSpacing.xs, gap: iosSpacing.xs },
  narrowFloatingThumbnail: { width: 68, height: 68 },
  narrowFloatingPrice: { fontSize: 17, lineHeight: 22 },
});
