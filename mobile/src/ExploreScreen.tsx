import {ExternalListingDetailContent} from './ExternalListingDetailContent';
import {NativeDiscovery} from './NativeDiscovery';
import type {DiscoveryFilters,DiscoveryProduct} from './discoveryData';
import {ListingDetailContent} from './ListingDetailContent';
import { SafeAreaModal } from './SafeAreaModal';
import { Ionicons } from '@expo/vector-icons';
import {ProductInterest} from './ProductInterestView';
import { SellerStorefront } from './SellerStorefront';
import { ListingPhoto, listingPresentation } from './ListingPhoto';
import { useSourceLeads, type SourceChatContext } from './SourceLeadExplorer';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
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
type Props = { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; onOpenChat: (id: string) => void; onOpenSourceChat:(context:SourceChatContext)=>void; wishItemId?: number; onClearWish?: () => void; initialSourceId?:string|null;onInitialSourceHandled?:()=>void;initialListing?: PublicListing | null; onInitialListingHandled?: () => void };

function ExternalDetailPhoto({ imageUrl, thumbnailUrl }: { imageUrl: string; thumbnailUrl: string }) {
  const {width}=useWindowDimensions();
  const [thumbnailState, setThumbnailState] = useState<ExternalPhotoLoadState>('loading');
  const [originalState, setOriginalState] = useState<ExternalPhotoLoadState>('loading');
  const presentation = externalPhotoPresentation(thumbnailState, originalState);
  return <View accessible accessibilityRole="image" accessibilityLabel={presentation.label} style={[s.detailPhotoFrame,{width,height:Math.min(width*.78,340),borderRadius:0,marginRight:0}]}>
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

export function ExploreScreen({ api, apiUrl, userId, onOpenChat, onOpenSourceChat, wishItemId, onClearWish, initialSourceId,onInitialSourceHandled, initialListing, onInitialListingHandled }: Props) {
  const [mapMode,setMapMode]=useState(false),[mapFilterNotice,setMapFilterNotice]=useState('');
  function enterMap(value:DiscoveryFilters){const shared={...emptySearchFilters,q:value.q,minPrice:value.min,maxPrice:value.max,condition:value.condition==='NEW'||value.condition==='USED'?value.condition as 'NEW'|'USED':'' as const};setFilters(shared);setApplied(shared);setRadiusApplied('');setRadiusInput('');setListMode(false);setClusterPreview(null);setMapFilterNotice(value.main||value.sub||value.county||value.source!=='all'||value.condition==='UNKNOWN'||value.feed==='cp'||value.feed==='for-you'&&!wishItemId?'地圖已套用搜尋文字、價格與可驗證的新舊條件。列表的分類、地區、來源與推薦條件仍保留在商品列表。':'');setMapMode(true);}
  const [sellerId,setSellerId]=useState<number|null>(null);
  const pendingChatRoute=useRef<string|null>(null);
  const [leavingForChat,setLeavingForChat]=useState(false);
  const insets = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const compactControls = fontScale >= 1.3;
  const narrowMapCard = width <= 360 && fontScale < 1.3;
  const [filters, setFilters] = useState<SearchFilters>({ ...emptySearchFilters });
  const [applied, setApplied] = useState<SearchFilters>({ ...emptySearchFilters });
  const [filtering, setFiltering] = useState(false); const [listMode, setListMode] = useState(false);
  const [mapInformationOpen, setMapInformationOpen] = useState(false);
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
  function closeReport() { if (reportBusy.current) return; setReporting(false); setReportTarget(null); }
  function openReport(target: PublicListing | null) { detailSequence.current++; setReportTarget(target); setDetail(null); setReporting(true); }
  const camera = useRef<CameraRef>(null); const source = useRef<GeoJSONSourceRef>(null);
  const externalSource = useRef<GeoJSONSourceRef>(null);
  const leads = useSourceLeads({api,apiUrl,userId,bounds,onOpenSourceChat,initialSourceId,onInitialSourceHandled,q:applied.q,hidden:!mapMode || !!wishItemId || !!applied.brand || !!applied.category || !!applied.delivery || !!applied.condition || !!applied.minPrice || !!applied.maxPrice});
  const path = useMemo(() => mapMode && bounds ? wishItemId ? wishMatchPath(wishItemId, applied, bounds, radiusApplied, true) : listingSearchPath(applied, bounds) : null, [applied, bounds, wishItemId, radiusApplied, mapMode]);
  const externalPath = useMemo(() => mapMode && bounds ? wishItemId ? externalWishSearchPath(wishItemId, applied, bounds, radiusApplied) :
    externalSearchPath(applied, bounds) : null, [applied, bounds, wishItemId, radiusApplied, mapMode]);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setClock(Date.now()); });
    return () => { mounted.current = false; sequence.current++; externalSequence.current++;
      clearInterval(timer); subscription.remove(); };
  }, []);
  const visible = useMemo(() => items.filter(item => Date.parse(item.expiresAt) > clock && !!item.mapVisibleUntil && Date.parse(item.mapVisibleUntil) > clock), [items, clock]);
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
    if (!searchCycle || lastFocusedCycle.current === searchCycle || sellerDoneCycle !== searchCycle ||
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
    if (visible.length) { setSelected(visible[0].id); setSelectedExternal(null); }
    else if (externalVisible.length) { setSelectedExternal(externalVisible[0].id); setSelected(null); }
    setListMode(false);
    setPendingFrame(frame);
  }, [searchCycle, sellerDoneCycle, externalDoneCycle, busy, externalBusy, error, externalError, visible, externalVisible, leads.ready, leads.points]);

  useEffect(() => {
    if (listMode || !mapReady || !pendingFrame) return;
    const timer = setTimeout(() => {
      if (!camera.current) return;
      if (pendingFrame.kind === 'single') camera.current.easeTo({ center: pendingFrame.center,
        zoom: pendingFrame.zoom, padding: { bottom: 170 }, duration: 450 });
      else camera.current.fitBounds(pendingFrame.bounds, { padding: { top: 20, right: 24, bottom: 20, left: 24 }, duration: 450 });
      setPendingFrame(null);
    }, 80);
    return () => clearTimeout(timer);
  }, [listMode, mapReady, pendingFrame]);
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
    const current = sequence.current;
    const request = ++detailSequence.current;
    try {
      const fresh = parsePublicListing(await api<unknown>('/listings/' + item.id), apiUrl, __DEV__, true);
      if (Date.parse(fresh.expiresAt) <= Date.now()) throw new ListingSearchError('商品已失效，請重新搜尋');
      if (mounted.current && current === sequence.current && request === detailSequence.current) { setDetail(fresh); return true; }
    } catch { if (mounted.current && current === sequence.current && request === detailSequence.current) { setError('商品已停止刊登，或目前無法取得最新資料。'); setSelected(null); return true; } }
    return false;
  }
  useEffect(()=>{if(!initialListing)return;void openDetail(initialListing).then(handled=>{if(handled){focusTarget.current=null;onInitialListingHandled?.();}});},[initialListing,api,apiUrl]);
  async function openDiscovery(product:DiscoveryProduct){
    if(product.kind==='source'){if(!await leads.open(product.id))throw new Error('來源無法開啟');return;}
    const request=++detailSequence.current;setError('');
    if(product.kind==='listing'){const fresh=parsePublicListing(await api<unknown>('/listings/'+product.id),apiUrl,__DEV__,true);if(fresh.id!==product.id||Date.parse(fresh.expiresAt)<=Date.now())throw new Error('商品已失效');if(mounted.current&&request===detailSequence.current)setDetail(fresh);}
    else{const fresh=parseExternalListing(await api<unknown>('/external-listings/'+product.id));if(fresh.id!==product.id)throw new Error('來源識別不符');if(mounted.current&&request===detailSequence.current)setExternalDetail(fresh);}
  }
  function openChatAfterDismiss(id:string){
    setSellerId(null);setDetail(null);
    if(Platform.OS==='ios'){pendingChatRoute.current=id;setLeavingForChat(true);}
    else onOpenChat(id);
  }
  function finishChatRoute(){
    const id=pendingChatRoute.current;pendingChatRoute.current=null;setLeavingForChat(false);
    if(id&&mounted.current)onOpenChat(id);
  }
  async function contactSeller(item: PublicListing) {
    const request=++detailSequence.current;
    try {
      const room = parseChatRoom(await api<unknown>('/chat/conversations', { method: 'POST', body: JSON.stringify({ listingId: item.id }) }), userId);
      if (mounted.current&&request===detailSequence.current) openChatAfterDismiss(room.id);
    } catch { if (mounted.current&&request===detailSequence.current) setError('無法開啟商品聊天，請確認登入、封鎖與商品狀態後重試。'); }
  }
  async function openExternalDetail(item: ExternalListing) {
    const request = ++detailSequence.current;
    try {
      const fresh = parseExternalListing(await api<unknown>('/external-listings/' + item.id));
      if (fresh.id !== item.id) throw new ListingSearchError('外部商品識別不符');
      if (mounted.current && request === detailSequence.current) setExternalDetail(fresh);
    } catch { if (mounted.current && request === detailSequence.current) {
      setExternalError('來源商品已停止公開，請重新搜尋。'); setSelectedExternal(null);
    } }
  }
  async function openExternalSource(item: ExternalListing) {
    if (externalOpening) return;
    setExternalOpening(true);const request=detailSequence.current;
    try {
      const fresh = parseExternalListing(await api<unknown>('/external-listings/' + item.id));
      if (fresh.id !== item.id) throw new ListingSearchError('外部商品識別不符');
      if(!mounted.current||request!==detailSequence.current)return;
      await Linking.openURL(fresh.canonicalUrl);
    } catch { if (mounted.current) { setExternalError('無法開啟來源商品；可能已失效或連結不可用。'); } }
    finally { if (mounted.current) setExternalOpening(false); }
  }
  const card = (item: PublicListing, compact = false) => <Pressable accessibilityRole="button" accessibilityLabel={`${wishItemId && item.owner.id === userId ? '我的商品配對預覽，' : ''}${item.title}，${listingPrice(item)}，${item.location.county}${item.location.district}`} onPress={() => void openDetail(item)} style={[s.card, compact && s.floatingCard, compact && narrowMapCard && s.narrowFloatingCard]}>
    <ListingPhoto uri={item.media[0].thumbnailUrl} label="商品縮圖" style={[s.thumbnail, compact && narrowMapCard && s.narrowFloatingThumbnail]} />
    <View style={s.cardText}>{wishItemId && item.owner.id === userId && <Text numberOfLines={compact && narrowMapCard ? 1 : undefined} style={s.small}>我的商品 · 配對預覽，非買家推薦</Text>}<Text numberOfLines={compact && narrowMapCard ? 1 : 2} style={s.cardTitle}>{item.title}</Text><Text numberOfLines={1} style={[s.price, compact && narrowMapCard && s.narrowFloatingPrice]}>{listingPrice(item)}</Text><Text numberOfLines={compact && narrowMapCard || compactControls ? 1 : undefined} style={s.small}>{item.location.county} {item.location.district} · {item.condition === 'NEW' ? '新品' : '二手'}{item.status === 'RESERVED' ? ' · 已保留' : ''}</Text><ProductInterest kind="listing" id={item.id} compact readOnly/>{(!compact || !narrowMapCard) && matchReasons[item.id]?.slice(0, 2).map(reason => <Text key={reason} style={s.small}>{reason}</Text>)}</View>
  </Pressable>;
  const externalCard = (item: ExternalListing, compact = false) => <Pressable accessibilityRole="button"
    accessibilityLabel={`外部來源商品，${item.title}，${externalPrice(item)}，${item.county}${item.district}`}
    onPress={() => void openExternalDetail(item)} style={[s.card, s.externalCard, compact && s.floatingCard, compact && narrowMapCard && s.narrowFloatingCard]}>
    <ListingPhoto uri={item.thumbnailUrl} label="來源商品縮圖" style={[s.thumbnail, compact && narrowMapCard && s.narrowFloatingThumbnail]} />
    <View style={s.cardText}><Text style={s.externalBadge}>外部來源 · {item.source.host}</Text>
      <Text numberOfLines={compact && narrowMapCard ? 1 : 2} style={s.cardTitle}>{item.title}</Text><Text numberOfLines={1} style={[s.price, compact && narrowMapCard && s.narrowFloatingPrice]}>{externalPrice(item)}</Text>
      <Text numberOfLines={compact && narrowMapCard || compactControls ? 1 : undefined} style={s.small}>{item.county} {item.district} · {compact && narrowMapCard ? '約略位置' : '行政區中心示意 · 回原站交易'}</Text><ProductInterest kind="external" id={item.id} compact readOnly/></View>
  </Pressable>;
  const allListItems = [...visible.map(item => ({ kind: 'seller' as const, item })),
    ...externalVisible.map(item => ({ kind: 'external' as const, item }))];
  const listItems = clusterPreview ? allListItems.filter(entry =>
    entry.kind === clusterPreview.kind && clusterPreview.ids.includes(entry.item.id)) : allListItems;
  const canExpand = !!bounds && JSON.stringify(expandedSearchBounds(bounds)) !== JSON.stringify(bounds);
  const loadedCount = visible.length + externalVisible.length;
  const resultSummary = `此次搜尋範圍（搜尋時的地圖視野）· 已載入 ${loadedCount} 件（站內 ${visible.length} 件${wishItemId ? `，其中自己的配對預覽 ${visible.filter(item => item.owner.id === userId).length} 件` : ''}${externalEnabled ? `／外部 ${externalVisible.length} 件` : ''}）${cursor || externalCursor ? ' · 還有更多' : ''}`;
  const listSummary = clusterPreview ? `此圖釘包含 ${listItems.length} 件商品 · 此次搜尋共載入 ${loadedCount} 件` : resultSummary;
  const compactSummary = clusterPreview ? `此圖釘 ${listItems.length} 件 · 已載入 ${loadedCount} 件` : `已載入 ${loadedCount} 件${cursor || externalCursor ? ' · 還有更多' : ''}`;
  const options = <K extends 'condition' | 'delivery' | 'category'>(key: K, values: readonly (readonly [SearchFilters[K], string])[]) => <View style={s.wrap}>{values.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: filters[key] === value }} style={[s.chip, filters[key] === value && s.activeChip]} onPress={() => setFilters(old => ({ ...old, [key]: value }))}><Text style={s.text}>{label}</Text></Pressable>)}</View>;

  return <View style={s.screen} pointerEvents={leavingForChat?'none':'auto'} accessibilityState={{busy:leavingForChat}}>
    <View style={[s.flex,mapMode&&{display:'none'}]}><NativeDiscovery api={api} apiUrl={apiUrl} userId={userId} active={!mapMode} wishItemId={wishItemId} onClearWish={onClearWish} onMap={enterMap} onOpen={openDiscovery} onReports={()=>openReport(null)}/></View>
    {mapMode&&<>
    <View style={s.nativeMapHeader}><View><Text style={s.nativeBrand}>Wishlist.ai</Text><Text style={s.small}>願望市集</Text></View><Text accessibilityRole="header" style={s.heading}>探索</Text>
      <View style={s.nativeMapSearch}><TextInput accessibilityLabel="地圖搜尋商品名稱與說明" placeholderTextColor={iosColors.secondaryLabel} placeholder="想找什麼好物？" value={filters.q} onChangeText={q=>setFilters(old=>({...old,q}))} returnKeyType="search" onSubmitEditing={apply} style={s.searchInput}/><Pressable accessibilityRole="button" accessibilityLabel="搜尋地圖商品" style={s.chip} onPress={apply}><Ionicons name="search-outline" size={22} color={iosColors.tint}/></Pressable></View>
      <View style={s.nativeMapToolbar}><Pressable accessibilityRole="tab" accessibilityState={{selected:false}} accessibilityLabel="返回商品瀏覽" style={s.chip} onPress={()=>setMapMode(false)}><Text style={s.text}>☷ 列表</Text></Pressable><View style={[s.chip,s.activeChip]}><Text style={s.scopeText}>地圖</Text></View><Pressable accessibilityRole="button" style={s.chip} onPress={()=>setFiltering(true)}><Text style={s.text}>篩選</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="地圖與資料說明" style={s.mapInfoClose} onPress={()=>setMapInformationOpen(true)}><Ionicons name="information-circle-outline" size={22} color={iosColors.tint}/></Pressable></View>
      {!!wishItemId&&<View style={s.wishBannerRow}><Text style={s.wishBannerTitle}>符合所選願望</Text><Pressable accessibilityRole="button" accessibilityLabel="取消願望篩選" style={s.chip} onPress={onClearWish}><Text style={s.text}>取消</Text></Pressable></View>}
      {!!mapFilterNotice&&<Text style={s.small}>{mapFilterNotice}</Text>}
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!externalError&&<Text accessibilityRole="alert" style={s.error}>{externalError}</Text>}
      {(busy||externalBusy)&&<ActivityIndicator accessibilityLabel="搜尋商品中"/>}
    </View>
    {listMode ? <FlatList data={listItems} keyExtractor={entry => entry.kind + ':' + entry.item.id}
      ListHeaderComponent={<View style={s.listStatus}><Text accessibilityLabel={listSummary} accessibilityLiveRegion="polite" style={s.small}>{compactControls||width<360?compactSummary:listSummary}</Text><View style={s.wrap}>
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
      contentContainerStyle={s.list} ListEmptyComponent={!busy && !externalBusy && bounds && !error && !externalError ? <Text style={s.text}>目前地圖範圍 0 件，不代表全站沒有商品。可擴大範圍或減少篩選。</Text> : null}
      ListFooterComponent={<View style={s.listStatus}>{!clusterPreview&&<View style={s.wrap}>{cursor && <Pressable accessibilityRole="button" disabled={busy || items.length >= MAX_LOADED} style={s.chip} onPress={() => void load(cursor)}><Text style={s.text}>{items.length >= MAX_LOADED ? '請縮小地圖範圍或增加條件' : '載入更多站內商品'}</Text></Pressable>}
        {externalCursor && <Pressable accessibilityRole="button" disabled={externalBusy || externalItems.length >= MAX_LOADED} style={s.chip} onPress={() => void loadExternal(externalCursor)}><Text style={s.text}>{externalItems.length >= MAX_LOADED ? '請縮小地圖範圍或增加條件' : '載入更多外部商品'}</Text></Pressable>}</View>}{leads.list}</View>} /> : <View style={s.flex}>
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
          <Text style={s.small}>來源線索 {leads.count} 筆 · 待確認，非在售件數</Text>
          <Text accessibilityLabel={resultSummary} accessibilityLiveRegion="polite" numberOfLines={1} style={s.mapCount}>已載入 {loadedCount} 件{externalEnabled ? ` · 外部 ${externalVisible.length}` : ''}</Text>
          {!!resultFrame && <Pressable accessibilityRole="button" accessibilityLabel="回到搜尋結果" style={s.mapAction} onPress={returnToResults}><Text style={s.scopeText}>回到結果</Text></Pressable>}
        </View>
        {canExpand && <Pressable accessibilityRole="button" style={s.mapAction} onPress={expandSearch}><Text style={s.scopeText}>擴大範圍搜尋</Text></Pressable>}
        {(mapError || (!busy && !externalBusy && !visible.length && !externalVisible.length && bounds && !error && !externalError) || cursor || externalCursor) && <View style={s.mapNotice}><Text style={s.small}>{mapError ? '底圖暫時無法載入；仍可切換清單瀏覽。' : cursor || externalCursor ? '此範圍還有更多商品；切換清單載入下一頁。地圖與件數只計算已載入商品。' : '目前地圖範圍 0 件，不代表全站沒有商品；可擴大範圍或調整條件。'}</Text></View>}
      </View>
      {chosen && card(chosen, true)}
      {chosenExternal && externalCard(chosenExternal, true)}
    </View>}
    </>}
    <SafeAreaModal visible={mapInformationOpen} animationType="slide" onRequestClose={()=>setMapInformationOpen(false)} contentStyle={s.screen}>
      <View style={s.mapInfoHeader}><Text accessibilityRole="header" style={s.mapInfoTitle}>地圖與資料說明</Text><Pressable accessibilityRole="button" accessibilityLabel="關閉地圖與資料說明" style={s.mapInfoClose} onPress={()=>setMapInformationOpen(false)}><Ionicons name="close" size={25} color={iosColors.tint}/></Pressable></View>
      <ScrollView contentContainerStyle={s.list}><Text style={s.text}>商品地區示意，不顯示使用者即時位置。站內商品須由賣家手動同意顯示，一小時後停止；來源圖釘是公開地區示意。</Text><Text style={s.text}>{listSummary}</Text><Text style={s.small}>件數只計算這次搜尋已載入的商品，不代表全站總數；移動地圖後請重新搜尋。</Text>{!!wishItemId&&<Text style={s.text}>自己刊登的商品會標為配對預覽，不是買家推薦；圖片不直接比對。站內本頁評分排序；外部來源依文字及可比較的台幣預算篩出候選，請到來源核對型號、庫存與真偽。</Text>}</ScrollView>
    </SafeAreaModal>
    {leads.modal}
    <Modal visible={filtering} animationType="slide" onRequestClose={() => setFiltering(false)}><View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>
      <Text style={s.heading}>篩選好物</Text><Text style={s.text}>名稱／品牌／分類與價格；地圖與清單共用目前視野。</Text>
      <Text style={s.fieldLabel}>搜尋文字</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="搜尋文字" placeholder="例如：三國演義漫畫" value={filters.q} onChangeText={q => setFilters(old => ({ ...old, q }))} style={s.input} />
      <Text style={s.fieldLabel}>品牌（選填，須完整相同）</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="品牌" placeholder="品牌完整名稱" value={filters.brand} onChangeText={brand => setFilters(old => ({ ...old, brand }))} style={s.input} />
      {options('condition', [['', '全部新舊'], ['USED', '二手'], ['NEW', '新品']])}
      {options('category', [['', '全部分類'], ...CATEGORIES])}
      {options('delivery', [['', '全部交付'], ['MEETUP', '面交'], ['SHIPPING', '寄送']])}
      <Text style={s.fieldLabel}>最低價格（NT$，選填）</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="最低價格，新臺幣" placeholder="留空不限" keyboardType="decimal-pad" value={filters.minPrice} onChangeText={minPrice => setFilters(old => ({ ...old, minPrice }))} style={s.input} />
      <Text style={s.fieldLabel}>最高價格（NT$，選填）</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="最高價格，新臺幣" placeholder="留空不限" keyboardType="decimal-pad" value={filters.maxPrice} onChangeText={maxPrice => setFilters(old => ({ ...old, maxPrice }))} style={s.input} />
      {wishItemId && <><Text style={s.small}>願望距離以地圖視野的約2公里格點中心計算，不是精確GPS或面交地點。移動地圖後，按「套用條件」才會依新視野重新比對。</Text><Text style={s.fieldLabel}>願望配對距離（公里，選填）</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="願望配對距離（公里，選填）" placeholder="0.5 至 200 公里" keyboardType="decimal-pad" value={radiusInput} onChangeText={setRadiusInput} style={s.input} /><Pressable accessibilityRole="button" style={s.chip} onPress={() => setRadiusInput('')}><Text style={s.text}>清除距離偏好</Text></Pressable></>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable accessibilityRole="button" style={s.button} onPress={apply}><Text style={s.white}>套用條件</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => { setFilters({ ...emptySearchFilters }); setRadiusInput(''); }}><Text style={s.text}>清除條件</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => setFiltering(false)}><Text style={s.text}>返回探索</Text></Pressable>
    </ScrollView></View></Modal>
    <Modal visible={!!detail || reporting || sellerId!==null} onDismiss={finishChatRoute} animationType="slide" onRequestClose={() => { if(sellerId!==null)setSellerId(null);else if (reporting) closeReport(); else { detailSequence.current++; setDetail(null); } }}>
      {sellerId!==null ? <View style={[s.screen,{paddingTop:insets.top,paddingBottom:insets.bottom}]}><SellerStorefront key={sellerId} api={api} apiUrl={apiUrl} userId={userId} sellerId={sellerId} onClose={()=>setSellerId(null)} onOpenChat={openChatAfterDismiss} onOpenListing={item=>{setSellerId(null);setDetail(item);}}/></View> : reporting ? <ListingReportSheet api={api} apiUrl={apiUrl} userId={userId} listing={reportTarget} onClose={closeReport} onBusyChange={value => { reportBusy.current = value; }} /> : <View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {detail && <ListingDetailContent api={api} apiUrl={apiUrl} key={detail.id} listing={detail} userId={userId} error={error} reasons={matchReasons[detail.id]??[]}
          onBack={()=>{detailSequence.current++;setDetail(null);}} onStorefront={()=>setSellerId(detail.owner.id)}
          onReport={()=>openReport(detail)} onContact={()=>contactSeller(detail)}/>}
      </View>}
    </Modal>
    <Modal visible={!!externalDetail} animationType="slide" onRequestClose={() => { detailSequence.current++; setExternalDetail(null); }}>
      <View style={[s.screen,{paddingTop:insets.top,paddingBottom:insets.bottom}]}>{externalDetail&&<ExternalListingDetailContent api={api} apiUrl={apiUrl} key={externalDetail.id} detail={externalDetail} opening={externalOpening} error={externalError} photo={<ExternalDetailPhoto imageUrl={externalDetail.imageUrl} thumbnailUrl={externalDetail.thumbnailUrl}/>} onBack={()=>{detailSequence.current++;setExternalDetail(null);}} onOriginal={()=>void openExternalSource(externalDetail)}/>}</View>
    </Modal>

  </View>;
}
const s = StyleSheet.create({ nativeMapHeader:{padding:16,gap:8},nativeBrand:{...iosType.headline,color:iosColors.label},nativeMapSearch:{flexDirection:'row',gap:8},nativeMapToolbar:{flexDirection:'row',gap:8,alignItems:'center',flexWrap:'wrap'},screen: { flex: 1, backgroundColor: iosColors.background }, flex: { flex: 1 }, search: { flexDirection: 'row', paddingHorizontal: iosSpacing.md, paddingTop: iosSpacing.xs, gap: iosSpacing.xs }, searchInput: { flex: 1, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.pill, paddingHorizontal: iosSpacing.md, fontSize: 17, color: iosColors.label, backgroundColor: iosColors.surface, ...iosShadow }, toolbar: { flexDirection: 'row', padding: iosSpacing.sm, gap: iosSpacing.xs, alignItems: 'center', flexWrap: 'wrap' }, wishBanner: { paddingHorizontal: iosSpacing.md, paddingTop: iosSpacing.xs, gap: iosSpacing.xxs }, wishBannerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: iosSpacing.xs }, wishBannerTitle: { ...iosType.subheadline, color: iosColors.label, fontWeight: '700', flexShrink: 1 },
  list: { padding: iosSpacing.md, gap: iosSpacing.md, paddingBottom: iosSpacing.xxl }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: iosSpacing.xs }, chip: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, justifyContent: 'center' }, compactToolbarChip: { paddingHorizontal: iosSpacing.xs }, activeChip: { backgroundColor: iosColors.tintSoft, borderColor: iosColors.tint }, text: { ...iosType.body, color: iosColors.label }, small: { ...iosType.subheadline, color: iosColors.secondaryLabel }, fieldLabel: { ...iosType.subheadline, color: iosColors.label, fontWeight: '600' }, heading: { ...iosType.title, color: iosColors.label }, price: { fontSize: 20, lineHeight: 25, fontWeight: '700', color: iosColors.tint }, input: { minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.control, padding: iosSpacing.md, fontSize: 17, backgroundColor: iosColors.surface, color: iosColors.label },
  mapInfoLink: {minHeight:44,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingVertical:8}, mapInfoText: {...iosType.subheadline,color:iosColors.tint,flexShrink:1}, mapInfoHeader: {minHeight:60,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:iosColors.separator}, mapInfoTitle: {...iosType.title2,color:iosColors.label,flex:1}, mapInfoClose: {minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  card: { ...listingPresentation.card, ...iosShadow }, externalCard: { borderWidth: 1, borderColor: '#A75615' }, externalBadge: { ...iosType.subheadline, color: '#A75615', fontWeight: '700' }, floatingCard: { position: 'absolute', bottom: iosSpacing.sm, left: iosSpacing.sm, right: iosSpacing.sm, ...iosFloatingShadow }, thumbnail: { width: 84, height: 84, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary }, cardText: { flex: 1, gap: iosSpacing.xxs }, cardTitle: { ...iosType.headline, color: iosColors.label }, detailPhoto: { width: 248, height: 248, borderRadius: iosRadius.card, marginRight: iosSpacing.sm, backgroundColor: iosColors.surfaceSecondary }, detailPhotoFrame: { width: 248, height: 248, borderRadius: iosRadius.card, marginRight: iosSpacing.sm, backgroundColor: iosColors.surfaceSecondary, overflow: 'hidden' }, detailPhotoLayer: { ...StyleSheet.absoluteFill }, detailPhotoHidden: { opacity: 0 }, detailPhotoPlaceholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: iosSpacing.xs }, detailPhotoFallback: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: iosSpacing.xs, backgroundColor: 'rgba(255,255,255,0.92)', textAlign: 'center', color: iosColors.secondaryLabel, ...iosType.caption }, button: { minHeight: 52, padding: iosSpacing.md, borderRadius: iosRadius.control, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center' }, white: { color: iosColors.white, ...iosType.headline }, notice: { padding: iosSpacing.sm, gap: iosSpacing.xs }, error: { color: iosColors.danger, ...iosType.subheadline }, mapTopActions: { position: 'absolute', top: iosSpacing.sm, left: iosSpacing.sm, right: iosSpacing.sm, gap: iosSpacing.xs, alignItems: 'flex-start' }, mapMetaRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: iosSpacing.xs }, mapCount: { flexShrink: 1, overflow: 'hidden', paddingHorizontal: iosSpacing.sm, paddingVertical: iosSpacing.xs, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, color: iosColors.label, ...iosType.subheadline, ...iosFloatingShadow }, mapAction: { minHeight: minimumTapSize, justifyContent: 'center', paddingHorizontal: iosSpacing.sm, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, ...iosFloatingShadow }, mapNotice: { padding: iosSpacing.sm, backgroundColor: iosColors.surface, borderRadius: iosRadius.control, ...iosFloatingShadow }, listStatus: { gap: iosSpacing.sm },
  scopeButton: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, justifyContent: 'center',
    backgroundColor: iosColors.tintSoft, borderColor: iosColors.tint, borderWidth: 1, borderRadius: iosRadius.pill },
  scopeText: { ...iosType.subheadline, fontWeight: '700', color: iosColors.tint },
  mapLink: { minHeight: minimumTapSize, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: iosSpacing.md },
  mapLinkText: { ...iosType.subheadline, fontWeight: '700', color: iosColors.tint },
  narrowFloatingCard: { padding: iosSpacing.xs, gap: iosSpacing.xs },
  narrowFloatingThumbnail: { width: 68, height: 68 },
  narrowFloatingPrice: { fontSize: 17, lineHeight: 22 },
});
