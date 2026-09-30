import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/marketplaceApi';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import { listingCategories } from '../lib/listingBatch';
import { clipBounds, emptySearchFilters, listingPrice, parsePublicListing, TAIWAN_BOUNDS,
  type Bounds, type PublicListing, type SearchFilters } from '../lib/listingSearch';
import { externalPrice, parseExternalListing, type ExternalListing } from '../lib/externalListingSearch';
import { type MatchWish, type WishMatch } from '../lib/wishData';
import { readAllMatchWishes } from '../lib/homeMatches';
import { expandedSearchBounds, resultCamera } from '../lib/exploreMapView';
import { exploreSellerPath, parseExploreIntent, readExploreExternal, readExploreSeller, type ExploreQuery } from '../lib/exploreWeb';
import ExploreMapWeb, { type MapFrame, type MapSelection } from '../components/ExploreMapWeb';
import MarketplaceDialog from '../components/MarketplaceDialog';
import MapFallbackBoundary from '../components/MapFallbackBoundary';

const MAX_LOADED = 500;
type SellerState = { items: PublicListing[]; matches: WishMatch[]; cursor: string | null; busy: boolean; error: string; notice: string };
type ExternalState = { items: ExternalListing[]; cursor: string | null; busy: boolean; error: string; enabled: boolean; skipped: boolean };
const blankSeller: SellerState = { items: [], matches: [], cursor: null, busy: true, error: '', notice: '' };
const blankExternal: ExternalState = { items: [], cursor: null, busy: true, error: '', enabled: false, skipped: false };
const errorText = (error: unknown) => error instanceof Error ? error.message : '無法讀取商品資料，請重試。';

function SellerCard({ item, match, own, onMap, onDetail }: { item: PublicListing; match?: WishMatch; own: boolean; onMap: () => void; onDetail: () => void }) {
  return <article className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm">
    <button type="button" onClick={onDetail} aria-label={`查看${item.title}商品詳情`} className="flex w-full items-start gap-3 text-left">
      <img src={item.media[0].thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-24 w-24 flex-none rounded-xl bg-gray-100 object-cover" />
      <span className="min-w-0"><span className="block break-words font-semibold">{item.title}</span><span className="mt-1 block font-semibold text-green-800">{listingPrice(item)}</span>
        <span className="mt-1 block text-sm text-gray-500">{item.location.county} · {item.location.district}</span>
        <span className="block text-xs text-gray-500">{item.condition === 'USED' ? '二手' : '新品'} · {item.status === 'RESERVED' ? '已保留' : '在售'}{own ? ' · 我的刊登預覽' : ''}</span>
      </span></button>
    {match && <div className="mt-3 text-sm text-gray-600"><p>吻合 {match.score} 分{match.distanceKm !== null ? ` · 約 ${match.distanceKm.toFixed(1)} 公里` : ''}</p>
      <p>{match.reasons.map(reason => reason.text).join(' · ')}</p></div>}
    <button type="button" onClick={onMap} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"><MapPin className="h-4 w-4" aria-hidden="true" />在地圖查看{item.title}</button>
  </article>;
}
function ExternalCard({ item, onMap, onDetail }: { item: ExternalListing; onMap: () => void; onDetail: () => void }) {
  return <article className="min-w-0 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
    <p className="mb-2 text-xs text-amber-800">外部來源 · 非站內賣家 · 行政區中心</p>
    <button type="button" onClick={onDetail} aria-label={`查看${item.title}來源詳情`} className="flex w-full items-start gap-3 text-left">
      <img src={item.thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-24 w-24 flex-none rounded-xl bg-gray-100 object-cover" />
      <span className="min-w-0"><span className="block break-words font-semibold">{item.title}</span><span className="mt-1 block font-semibold">{externalPrice(item)}</span>
        <span className="mt-1 block text-sm text-gray-500">{item.county} · {item.district}</span><span className="block break-all text-xs text-gray-500">{item.source.host}</span></span>
    </button><button type="button" onClick={onMap} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"><MapPin className="h-4 w-4" aria-hidden="true" />在地圖查看{item.title}</button>
  </article>;
}

export default function ExplorePage() {
  const { token, user } = useAuth(), location = useLocation();
  if (!token || !user) return <section className="space-y-4"><h1 className="text-3xl font-bold">探索商品地圖</h1><p>登入後可搜尋商品與交叉比對自己的願望。</p><Link to="/login?next=%2Fexplore" className="text-green-800 underline">登入</Link></section>;
  return <ExploreSession key={`${user.id}:${token}:${location.search}`} token={token} userId={user.id} search={location.search} />;
}
function ExploreSession({ token, userId, search }: { token: string; userId: number; search: string }) {
  const [query, setQuery] = useState<ExploreQuery | null>(null), [initError, setInitError] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ ...emptySearchFilters }), [radius, setRadius] = useState('');
  const [wishId, setWishId] = useState<number | null>(null), [wishes, setWishes] = useState<MatchWish[]>([]), [wishError, setWishError] = useState('');
  const [seller, setSeller] = useState<SellerState>(blankSeller), [external, setExternal] = useState<ExternalState>(blankExternal);
  const [listMode, setListMode] = useState(false), [cluster, setCluster] = useState<{ kind: MapSelection['kind']; ids: string[] } | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null), [frame, setFrame] = useState<MapFrame | null>(null);
  const [locationMessage, setLocationMessage] = useState(''), [clock, setClock] = useState(Date.now()), [queryError, setQueryError] = useState('');
  const [detail, setDetail] = useState<{ kind: MapSelection['kind']; seller?: PublicListing; external?: ExternalListing; loading: boolean; error: string } | null>(null);
  const viewport = useRef<Bounds>(TAIWAN_BOUNDS), frameNumber = useRef(0), initialTarget = useRef<PublicListing | null>(null);
  const currentQuery = useRef(query); currentQuery.current = query;
  const currentSeller = useRef(seller); currentSeller.current = seller;
  const currentExternal = useRef(external); currentExternal.current = external;
  const gate = useRef({ seller: false, external: false }), active = useRef(true), request = useRef<AbortController | null>(null), detailRequest = useRef<AbortController | null>(null);
  const seenCursors = useRef({ seller: new Set<string>(), external: new Set<string>() });
  const resultsFrame = useRef<{ camera: NonNullable<ReturnType<typeof resultCamera>>; bounds: Bounds } | null>(null);
  const origin = marketplaceOrigin();
  const showFrame = (camera: NonNullable<ReturnType<typeof resultCamera>>) => setFrame({ serial: ++frameNumber.current, camera });
  useEffect(() => {
    active.current = true; const controller = new AbortController();
    const read = (path: string) => api<unknown>(token, path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
    void (async () => {
      try {
        const intent = parseExploreIntent(search); let bounds: Bounds = [...TAIWAN_BOUNDS];
        setWishId(intent.wishId);
        if (intent.listingId) {
          const item = parsePublicListing(await read('/listings/' + intent.listingId), origin, import.meta.env.DEV);
          if (item.id !== intent.listingId || Date.parse(item.expiresAt) <= Date.now()) throw new Error('所選商品已失效，請回首頁重新選擇。');
          if (!active.current || controller.signal.aborted) return;
          initialTarget.current = item;
          bounds = clipBounds([item.location.publicLongitude - 0.06, item.location.publicLatitude - 0.06, item.location.publicLongitude + 0.06, item.location.publicLatitude + 0.06])!;
        }
        if (active.current && !controller.signal.aborted) { viewport.current = bounds; setQuery({ filters: { ...emptySearchFilters }, bounds, wishId: intent.wishId, radius: '', serial: 1 }); }
      } catch (error) { if (active.current && !controller.signal.aborted) setInitError(errorText(error)); }
    })();
    void readAllMatchWishes(read, controller.signal).then(rows => { if (active.current && !controller.signal.aborted) setWishes(rows); })
      .catch(() => { if (active.current && !controller.signal.aborted) setWishError('願望選單無法載入；仍可搜尋一般商品，或回首頁重新整理。'); });
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => { active.current = false; controller.abort(); request.current?.abort(); detailRequest.current?.abort(); window.clearInterval(timer); };
  }, [token, origin, search]);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController(); request.current = controller; let valid = true;
    gate.current = { seller: true, external: true };
    seenCursors.current = { seller: new Set<string>(), external: new Set<string>() };
    setSeller({ ...blankSeller }); setExternal({ ...blankExternal }); setSelection(null); setCluster(null); setDetail(null); detailRequest.current?.abort();
    const read = (path: string) => api<unknown>(token, path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
    const sellers = readExploreSeller(query, read, origin, import.meta.env.DEV).then(page => {
      if (valid && page.nextCursor) seenCursors.current.seller.add(page.nextCursor);
      if (valid) setSeller({ items: page.items, matches: page.matches, cursor: page.nextCursor, busy: false, error: '', notice: page.notice }); return page.items;
    }).catch(error => { if (valid) setSeller({ ...blankSeller, busy: false, error: errorText(error) }); return []; }).finally(() => { if (valid) gate.current.seller = false; });
    const externals = readExploreExternal(query, read).then(page => {
      if (valid && page.nextCursor) seenCursors.current.external.add(page.nextCursor);
      if (valid) setExternal({ ...page, cursor: page.nextCursor, busy: false, error: '' }); return page.items;
    }).catch(error => { if (valid) setExternal({ ...blankExternal, busy: false, error: errorText(error) }); return []; }).finally(() => { if (valid) gate.current.external = false; });
    void Promise.all([sellers, externals]).then(([items, outside]) => {
      if (!valid) return;
      const target = initialTarget.current; initialTarget.current = null;
      const camera = resultCamera(target ? [{ longitude: target.location.publicLongitude, latitude: target.location.publicLatitude }] : [
        ...items.map(item => ({ longitude: item.location.publicLongitude, latitude: item.location.publicLatitude })), ...outside.map(item => item.location)]);
      if (camera) { showFrame(camera); setListMode(false); resultsFrame.current = { camera, bounds: query.bounds }; }
      else { resultsFrame.current = null; showFrame({ kind: 'multiple', bounds: query.bounds }); }
      const chosen = (target ? items.find(item => item.id === target.id) : undefined) ?? items[0];
      setSelection(chosen ? { kind: 'seller', id: chosen.id } : outside[0] ? { kind: 'external', id: outside[0].id } : null);
    });
    return () => { valid = false; controller.abort(); };
  }, [query, token, origin]);
  const liveItems = useMemo(() => seller.items.filter(item => Date.parse(item.expiresAt) > clock), [seller.items, clock]);
  const liveExternal = useMemo(() => external.items.filter(item => Date.parse(item.expiresAt) > clock && clock - Date.parse(item.observedAt) <= 48 * 3_600_000), [external.items, clock]);
  const selectedSeller = selection?.kind === 'seller' ? liveItems.find(item => item.id === selection.id) : undefined;
  const selectedExternal = selection?.kind === 'external' ? liveExternal.find(item => item.id === selection.id) : undefined;
  const byMatch = new Map(seller.matches.map(match => [match.listing.id, match]));
  const visibleItems = cluster ? cluster.kind === 'seller' ? liveItems.filter(item => cluster.ids.includes(item.id)) : [] : liveItems;
  const visibleExternal = cluster ? cluster.kind === 'external' ? liveExternal.filter(item => cluster.ids.includes(item.id)) : [] : liveExternal;
  const busy = query !== null && (seller.busy || external.busy);
  async function loadMore(kind: 'seller' | 'external') {
    const scope = currentQuery.current, snapshot = kind === 'seller' ? currentSeller.current : currentExternal.current;
    if (!scope || !snapshot.cursor || gate.current[kind] || snapshot.items.length >= MAX_LOADED) return;
    gate.current[kind] = true; const cursor = snapshot.cursor;
    const controller = request.current!;
    const valid = () => active.current && currentQuery.current === scope && !controller.signal.aborted;
    const read = (path: string) => api<unknown>(token, path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
    if (kind === 'seller') setSeller(old => ({ ...old, busy: true, error: '' })); else setExternal(old => ({ ...old, busy: true, error: '' }));
    try {
      if (kind === 'seller') {
        const page = await readExploreSeller(scope, read, origin, import.meta.env.DEV, cursor);
        if (!valid()) return;
        if (page.nextCursor && seenCursors.current.seller.has(page.nextCursor) || page.items.some(item => currentSeller.current.items.some(old => old.id === item.id))) throw new Error('商品分頁重複或未前進，請重新搜尋。');
        if (page.nextCursor) seenCursors.current.seller.add(page.nextCursor);
        setSeller(old => { const items = [...old.items, ...page.items].slice(0, MAX_LOADED); return { ...old, items,
          matches: [...old.matches, ...page.matches].filter(match => items.some(item => item.id === match.listing.id)),
          cursor: old.items.length + page.items.length > MAX_LOADED ? cursor : page.nextCursor, notice: page.notice }; });
      } else {
        const page = await readExploreExternal(scope, read, cursor);
        if (!valid()) return;
        if (page.nextCursor && seenCursors.current.external.has(page.nextCursor) || page.items.some(item => currentExternal.current.items.some(old => old.id === item.id))) throw new Error('外部商品分頁重複或未前進，請重新搜尋。');
        if (page.nextCursor) seenCursors.current.external.add(page.nextCursor);
        setExternal(old => ({ ...old, items: [...old.items, ...page.items].slice(0, MAX_LOADED), cursor: old.items.length + page.items.length > MAX_LOADED ? cursor : page.nextCursor }));
      }
    } catch (error) {
      if (valid()) { if (kind === 'seller') setSeller(old => ({ ...old, error: errorText(error) })); else setExternal(old => ({ ...old, error: errorText(error) })); }
    } finally { if (valid()) { gate.current[kind] = false; if (kind === 'seller') setSeller(old => ({ ...old, busy: false })); else setExternal(old => ({ ...old, busy: false })); } }
  }
  function commit(bounds = viewport.current, nextFilters = filters, nextWish = wishId, nextRadius = radius) {
    try {
      const clipped = clipBounds(bounds); if (!clipped) throw new Error('請將地圖移回台灣範圍，或擴大搜尋。');
      const next = { bounds: clipped, filters: { ...nextFilters }, wishId: nextWish, radius: nextRadius, serial: (currentQuery.current?.serial ?? 0) + 1 };
      exploreSellerPath(next); initialTarget.current = null; currentQuery.current = next; setQueryError(''); setCluster(null); setQuery(next);
    } catch (error) { setQueryError(errorText(error)); }
  }
  function locate() {
    if (!navigator.geolocation) { setLocationMessage('此瀏覽器不支援定位，請手動移動地圖後搜尋此範圍。'); return; }
    setLocationMessage('正在取得位置；位置不會直接傳給商品來源。');
    navigator.geolocation.getCurrentPosition(position => {
      if (!active.current) return;
      const bounds = clipBounds([position.coords.longitude - 0.05, position.coords.latitude - 0.05, position.coords.longitude + 0.05, position.coords.latitude + 0.05]);
      if (!bounds) { setLocationMessage('目前位置不在台灣，請手動移動地圖搜尋。'); return; }
      viewport.current = bounds; showFrame({ kind: 'multiple', bounds }); setListMode(false);
      setLocationMessage('已移至所在範圍；按「搜尋此範圍」才會查詢，距離比對只使用約略中心。');
    }, () => { if (active.current) setLocationMessage('無法取得位置或未授權，仍可手動移動地圖與搜尋。'); }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
  }
  function focus(kind: MapSelection['kind'], id: string) {
    const item = kind === 'seller' ? liveItems.find(item => item.id === id) : liveExternal.find(item => item.id === id);
    if (!item) return;
    const point = 'owner' in item ? { longitude: item.location.publicLongitude, latitude: item.location.publicLatitude } : item.location;
    const camera = resultCamera([point]); if (camera) showFrame(camera);
    setSelection({ kind, id }); setListMode(false); setCluster(null);
  }
  async function showDetail(kind: MapSelection['kind'], id: string) {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller;
    setDetail({ kind, loading: true, error: '' });
    try {
      const response = await api<unknown>(token, '/' + (kind === 'seller' ? 'listings/' : 'external-listings/') + id, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
      if (!active.current || controller.signal.aborted) return;
      if (kind === 'seller') {
        const item = parsePublicListing(response, origin, import.meta.env.DEV);
        if (item.id !== id || Date.parse(item.expiresAt) <= Date.now()) throw new Error('商品已失效，請重新搜尋。');
        setDetail({ kind, seller: item, loading: false, error: '' });
      } else {
        const item = parseExternalListing(response); if (item.id !== id) throw new Error('來源商品識別不符。');
        setDetail({ kind, external: item, loading: false, error: '' });
      }
    } catch (error) { if (active.current && !controller.signal.aborted) setDetail({ kind, loading: false, error: errorText(error) }); }
  }
  const renderSeller = (item: PublicListing) => <SellerCard key={item.id} item={item} match={byMatch.get(item.id)} own={item.owner.id === userId} onMap={() => focus('seller', item.id)} onDetail={() => void showDetail('seller', item.id)} />;
  const renderExternal = (item: ExternalListing) => <ExternalCard key={item.id} item={item} onMap={() => focus('external', item.id)} onDetail={() => void showDetail('external', item.id)} />;
  const chosenWish = wishes.find(item => item.id === query?.wishId);
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">探索商品地圖</h1><p className="mt-1 text-sm text-gray-500">在附近，找到願望的另一種可能。</p></div><Link to="/sell" className="rounded-xl bg-green-800 px-4 py-3 text-white">拍照刊登好物</Link></div>
    {initError && <div role="alert" className="rounded-xl bg-red-50 p-4"><p>{initError}</p><Link to="/explore" className="underline">清除連結條件，重新探索</Link></div>}
    {!query && !initError && <p role="status">正在準備搜尋條件…</p>}
    <form onSubmit={event => { event.preventDefault(); commit(); }} className="rounded-2xl border bg-white p-4">
      <label className="block font-medium" htmlFor="explore-search">商品關鍵字</label><div className="mt-2 flex gap-2"><input id="explore-search" type="search" maxLength={100} value={filters.q} onChange={event => setFilters(old => ({ ...old, q: event.target.value }))} placeholder="商品名稱、品牌或型號" className="min-w-0 flex-1 rounded-xl border p-3" /><button type="submit" disabled={!query} className="flex min-h-11 items-center gap-2 rounded-xl bg-green-800 px-4 text-white disabled:opacity-50"><Search className="h-4 w-4" aria-hidden="true" />搜尋</button></div>
      <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 font-medium">過濾與願望交叉比對（選用）</summary><div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        <label>品牌（精確匹配）<input value={filters.brand} maxLength={60} onChange={event => setFilters(old => ({ ...old, brand: event.target.value }))} className="mt-1 block w-full rounded-xl border p-3" /></label>
        <label>商品分類<select value={filters.category} onChange={event => setFilters(old => ({ ...old, category: event.target.value }))} className="mt-1 block w-full rounded-xl border p-3"><option value="">所有分類</option>{listingCategories.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>商品狀態<select value={filters.condition} onChange={event => setFilters(old => ({ ...old, condition: event.target.value as SearchFilters['condition'] }))} className="mt-1 block w-full rounded-xl border p-3"><option value="">新品與二手</option><option value="NEW">新品</option><option value="USED">二手</option></select></label>
        <label>交付方式<select value={filters.delivery} onChange={event => setFilters(old => ({ ...old, delivery: event.target.value as SearchFilters['delivery'] }))} className="mt-1 block w-full rounded-xl border p-3"><option value="">不限</option><option value="MEETUP">面交</option><option value="SHIPPING">寄送</option></select></label>
        <label>最低售價（NT$）<input inputMode="decimal" value={filters.minPrice} onChange={event => setFilters(old => ({ ...old, minPrice: event.target.value }))} className="mt-1 block w-full rounded-xl border p-3" /></label>
        <label>最高售價（NT$）<input inputMode="decimal" value={filters.maxPrice} onChange={event => setFilters(old => ({ ...old, maxPrice: event.target.value }))} className="mt-1 block w-full rounded-xl border p-3" /></label>
        <label>交叉比對我的願望<select value={wishId ?? ''} onChange={event => setWishId(event.target.value ? Number(event.target.value) : null)} className="mt-1 block w-full rounded-xl border p-3"><option value="">不套用願望</option>{wishId && !wishes.some(item => item.id === wishId) && <option value={wishId}>目前連結的願望（尚未讀取）</option>}{wishes.map(item => <option key={item.id} value={item.id}>{item.name} · {item.wishlist.title}</option>)}</select></label>
        {wishId && <label>距離上限（公里，0.5–200，選用）<input inputMode="decimal" value={radius} onChange={event => setRadius(event.target.value)} className="mt-1 block w-full rounded-xl border p-3" /></label>}
      </div><p className="mt-3 text-xs text-gray-500">距離以目前地圖約略中心計算，不是精確定位。外部來源不支援品牌、分類、交付、新品或距離條件時不列入結果。</p>
        <div className="mt-3 flex flex-wrap gap-3"><button type="submit" disabled={!query} className="min-h-11 rounded-xl border px-4">套用條件</button><button type="button" onClick={() => { setFilters({ ...emptySearchFilters }); setWishId(null); setRadius(''); commit(query?.bounds ?? TAIWAN_BOUNDS, emptySearchFilters, null, ''); }} className="min-h-11 rounded-xl border px-4">清除條件</button></div></details>
    </form>
    {queryError && <p role="alert" className="text-red-700">{queryError}</p>}{wishError && <p role="status" className="text-amber-800">{wishError}</p>}
    {query?.wishId && <div className="rounded-xl bg-green-50 p-4 text-sm text-green-900"><p className="font-semibold">正在交叉比對：{chosenWish?.name ?? '所選願望'}</p><p className="mt-1">含自己刊登的配對預覽，不能向自己購買。依文字、型號、條件與預算比對，圖片不直接比對；分數不保證同一型號或真偽。</p>{seller.notice && <p className="mt-1">{seller.notice}</p>}</div>}
    <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={!listMode} onClick={() => { setListMode(false); setCluster(null); }} className="min-h-11 rounded-xl border bg-white px-4">地圖</button><button type="button" aria-pressed={listMode} onClick={() => { setListMode(true); setCluster(null); }} className="min-h-11 rounded-xl border bg-white px-4">商品列表</button>
      <button type="button" onClick={locate} className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4"><LocateFixed className="h-4 w-4" aria-hidden="true" />移至我的位置</button>
      <button type="button" disabled={!query} onClick={() => commit()} className="min-h-11 rounded-xl bg-green-800 px-4 text-white disabled:opacity-50">搜尋此範圍</button>
      <button type="button" disabled={!query} onClick={() => commit(expandedSearchBounds(query?.bounds ?? TAIWAN_BOUNDS))} className="min-h-11 rounded-xl border bg-white px-4">擴大搜尋範圍</button>
      {resultsFrame.current && <button type="button" onClick={() => { const saved = resultsFrame.current!; viewport.current = saved.bounds; showFrame(saved.camera); setListMode(false); setCluster(null); }} className="min-h-11 rounded-xl border bg-white px-4">返回目前結果</button>}
    </div>{locationMessage && <p role="status" className="text-sm text-gray-600">{locationMessage}</p>}
    {query && <MapFallbackBoundary><ExploreMapWeb items={liveItems} external={liveExternal} frame={frame} visible={!listMode} onViewport={bounds => { viewport.current = bounds; }} onSelect={item => { setSelection(item); setCluster(null); }} onCluster={(kind, ids) => { setCluster({ kind, ids }); setListMode(true); }} /></MapFallbackBoundary>}
    <div aria-live="polite" className="space-y-2 text-sm text-gray-600">{busy ? <p role="status">正在讀取目前範圍的商品…</p> : query && <p>目前範圍已載入：{liveItems.length} 件站內商品{query.wishId ? `（含 ${liveItems.filter(item => item.owner.id === userId).length} 件自有預覽）` : ''}、{liveExternal.length} 件外部來源。這不是全站商品總數。</p>}
      {external.skipped && <p>目前條件無法由外部來源驗證，外部商品未列入。</p>}{!external.enabled && !external.skipped && !external.busy && !external.error && <p>外部來源目前未開放，顯示站內商品。</p>}
      {seller.error && <p role="alert" className="text-red-700">站內商品查詢未完成：{seller.error} <button type="button" onClick={() => commit(query?.bounds)} className="underline">重新搜尋</button></p>}
      {external.error && <p role="alert" className="text-red-700">外部商品查詢未完成：{external.error} <button type="button" onClick={() => commit(query?.bounds)} className="underline">重新搜尋</button></p>}
      {!busy && query && !seller.error && !external.error && !liveItems.length && !liveExternal.length && <p>目前地圖範圍沒有符合條件的商品，不代表全站沒有商品。可擴大範圍或清除條件。</p>}
    </div>
    {listMode ? <><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{cluster ? '此群聚的商品' : '商品列表'}</h2>{cluster && <button type="button" onClick={() => setCluster(null)} className="min-h-11 rounded-xl border px-3">顯示全部已載入結果</button>}</div><div className="grid gap-4 md:grid-cols-2">{visibleItems.map(renderSeller)}{visibleExternal.map(renderExternal)}</div></>
      : <div className="max-w-2xl">{selectedSeller ? renderSeller(selectedSeller) : selectedExternal ? renderExternal(selectedExternal) : null}</div>}
    <div className="flex flex-wrap gap-3">{seller.cursor && <button type="button" disabled={seller.busy || seller.items.length >= MAX_LOADED} onClick={() => void loadMore('seller')} className="min-h-11 rounded-xl border bg-white px-4 disabled:opacity-50">載入更多站內商品</button>}{external.cursor && <button type="button" disabled={external.busy || external.items.length >= MAX_LOADED} onClick={() => void loadMore('external')} className="min-h-11 rounded-xl border bg-white px-4 disabled:opacity-50">載入更多外部商品</button>}</div>
    {(seller.cursor || external.cursor) && <p className="text-xs text-gray-500">尚有未載入的商品；每個來源最多載入 500 件，超過時請縮小範圍或增加搜尋條件。</p>}
    {detail && <MarketplaceDialog title={detail.kind === 'seller' ? '商品詳情' : '外部來源商品'} onClose={() => { detailRequest.current?.abort(); setDetail(null); }}>
      {detail.loading && <p role="status">正在核對商品最新狀態…</p>}{detail.error && <p role="alert" className="text-red-700">{detail.error}</p>}
      {detail.seller && <div className="space-y-4"><h3 className="text-xl font-semibold">{detail.seller.title}</h3><p className="font-semibold text-green-800">{listingPrice(detail.seller)}</p><div className="flex gap-3 overflow-x-auto">{detail.seller.media.map(photo => <img key={photo.id} src={photo.thumbnailUrl} alt={detail.seller!.title} referrerPolicy="no-referrer" className="h-48 w-48 flex-none rounded-xl object-contain" />)}</div>
        <p className="whitespace-pre-wrap break-words">{detail.seller.description}</p><dl className="space-y-2 text-sm"><div><dt className="inline font-medium">品牌：</dt><dd className="inline">{detail.seller.brand ?? '未提供'}</dd></div><div><dt className="inline font-medium">新舊與狀態：</dt><dd className="inline">{detail.seller.condition === 'USED' ? '二手' : '新品'} · {detail.seller.status === 'RESERVED' ? '已保留' : '在售'}</dd></div><div><dt className="inline font-medium">約略地點：</dt><dd className="inline">{detail.seller.location.county} · {detail.seller.location.district}（非精確地址）</dd></div><div><dt className="inline font-medium">交付：</dt><dd className="inline">{detail.seller.deliveryMethods.map(method => method === 'MEETUP' ? '面交' : '寄送').join('、')} · {detail.seller.negotiable ? '可議價' : '不議價'}</dd></div><div><dt className="inline font-medium">失效時間：</dt><dd className="inline">{new Date(detail.seller.expiresAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}（台灣時間）</dd></div></dl>
        <Link to={`/listings/${detail.seller.id}`} className="inline-flex min-h-11 items-center rounded-xl border px-4">開啟可分享商品頁</Link></div>}
      {detail.external && <div className="space-y-4"><p className="text-sm text-amber-800">外部來源 · 非站內賣家；請至原網站確認價格、庫存及交易方式。</p><h3 className="text-xl font-semibold">{detail.external.title}</h3><p className="font-semibold">{externalPrice(detail.external)}</p><img src={detail.external.thumbnailUrl} alt={detail.external.title} referrerPolicy="no-referrer" className="max-h-80 w-full rounded-xl object-contain" /><p className="whitespace-pre-wrap">{detail.external.description}</p>{detail.external.aiSupplement && <p className="rounded-xl bg-amber-50 p-3">AI 補充（不是來源保證）：{detail.external.aiSupplement}</p>}
        <p className="text-sm text-gray-600">{detail.external.county} · {detail.external.district} 行政區中心，並非商品確切所在地。資料確認：{new Date(detail.external.observedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p><a href={detail.external.canonicalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border px-4">前往來源網站（{detail.external.source.host}）</a></div>}
    </MarketplaceDialog>}
  </section>;
}
