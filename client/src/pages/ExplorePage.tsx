import {useSourceLeadSearch} from '../lib/useSourceLeadSearch';
import {parseLead,type SourceLead} from '../lib/sourceLeadData';
import {ProductCardWeb} from '../components/ProductCardWeb';
import {ListingPhoto,ListingPhotoGallery} from '../components/ListingPhoto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import { listingCategories } from '../lib/listingBatch';
import { clipBounds, emptySearchFilters, listingPrice, parsePublicListing, TAIWAN_BOUNDS,
  type Bounds, type PublicListing, type SearchFilters } from '../lib/listingSearch';
import { parseExternalListing, type ExternalListing } from '../lib/externalListingSearch';
import { type MatchWish, type WishMatch } from '../lib/wishData';
import ExternalDetailPhoto from '../components/ExternalDetailPhoto';
import { exploreText as text, exploreMessage, exploreFailureKey, exploreNotice, exploreReason, exploreCategory, exploreTime, exploreSourcePrice } from '../lib/exploreCopy';
import { readAllMatchWishes } from '../lib/homeMatches';
import { expandedSearchBounds, resultCamera } from '../lib/exploreMapView';
import { exploreSellerPath, parseExploreIntent, readExploreExternal, readExploreSeller, type ExploreQuery } from '../lib/exploreWeb';
import ExploreMapWeb, { type MapFrame, type MapSelection } from '../components/ExploreMapWeb';
import MarketplaceDialog from '../components/MarketplaceDialog';
import MapFallbackBoundary from '../components/MapFallbackBoundary';
import ListingReportWeb from '../components/ListingReportWeb';
import ProductActionsWeb from '../components/ProductActionsWeb';

const MAX_LOADED = 500;
type SellerState = { items: PublicListing[]; matches: WishMatch[]; cursor: string | null; busy: boolean; error: string; notice: string };
type ExternalState = { items: ExternalListing[]; cursor: string | null; busy: boolean; error: string; enabled: boolean; skipped: boolean };
const blankSeller: SellerState = { items: [], matches: [], cursor: null, busy: true, error: '', notice: '' };
const blankExternal: ExternalState = { items: [], cursor: null, busy: true, error: '', enabled: false, skipped: false };
const errorText = exploreFailureKey;

function SellerCard({ item, match, own, onMap, onDetail, readBlocked }: { item: PublicListing; match?: WishMatch; own: boolean; onMap: () => void; onDetail: () => void; readBlocked: boolean }) {
  return <article className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm">
    <button type="button" disabled={readBlocked} onClick={onDetail} aria-label={text('查看{title}商品詳情', { title: item.title })} className="flex w-full items-start gap-3 text-left disabled:opacity-60">
      <ListingPhoto src={item.media[0].thumbnailUrl} alt={item.title} />
      <span className="min-w-0"><span className="block break-words font-semibold">{item.title}</span><span className="mt-1 block font-semibold text-green-800">{listingPrice(item)}</span>
        <span className="mt-1 block text-sm text-gray-500">{item.location.county} · {item.location.district}</span>
        <span className="block text-xs text-gray-500">{text(item.condition === 'USED' ? '二手' : '新品')} · {text(item.status === 'RESERVED' ? '已保留' : '在售')}{own ? text(' · 我的刊登預覽') : ''}</span>
      </span></button>
    {match && <div className="mt-3 text-sm text-gray-600"><p>{text('吻合 {score} 分', { score: match.score })}{match.distanceKm !== null ? text(' · 約 {distance} 公里', { distance: match.distanceKm.toFixed(1) }) : ''}</p>
      <p>{match.reasons.map(reason => exploreReason(reason, match.distanceKm)).join(' · ')}</p></div>}
    <button type="button" onClick={onMap} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"><MapPin className="h-4 w-4" aria-hidden="true" />{text('在地圖查看{title}', { title: item.title })}</button>
  </article>;
}
function ExternalCard({ item, onMap, onDetail, readBlocked }: { item: ExternalListing; onMap: () => void; onDetail: () => void; readBlocked: boolean }) {
  return <article className="min-w-0 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
    <p className="mb-2 text-xs text-amber-800">{text("外部來源 · 非站內賣家 · 行政區中心")}</p>
    <button type="button" disabled={readBlocked} onClick={onDetail} aria-label={text('查看{title}來源詳情', { title: item.title })} className="flex w-full items-start gap-3 text-left disabled:opacity-60">
      <img src={item.thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-24 w-24 flex-none rounded-xl bg-gray-100 object-cover" />
      <span className="min-w-0"><span className="block break-words font-semibold">{item.title}</span><span className="mt-1 block font-semibold">{exploreSourcePrice(item)}</span>
        <span className="mt-1 block text-sm text-gray-500">{item.county} · {item.district}</span><span className="block break-all text-xs text-gray-500">{item.source.host}</span></span>
    </button><button type="button" onClick={onMap} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"><MapPin className="h-4 w-4" aria-hidden="true" />{text('在地圖查看{title}', { title: item.title })}</button>
  </article>;
}

export default function ExplorePage() {
  const { token, user } = useAuth(), location = useLocation();
  if (!token || !user) return <section className="space-y-4"><h1 className="text-3xl font-bold">{text("探索商品地圖")}</h1><p>{text("登入後可搜尋商品與交叉比對自己的願望。")}</p><Link to="/login?next=%2Fexplore" className="text-green-800 underline">{text("登入")}</Link></section>;
  return <ExploreSession key={`${user.id}:${token}:${location.search}`} token={token} userId={user.id} search={location.search} />;
}
function ExploreSession({ token, userId, search }: { token: string; userId: number; search: string }) {
  const [query, setQuery] = useState<ExploreQuery | null>(null), [initError, setInitError] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ ...emptySearchFilters }), [radius, setRadius] = useState('');
  const [wishId, setWishId] = useState<number | null>(null), [wishes, setWishes] = useState<MatchWish[]>([]), [wishError, setWishError] = useState('');
  const [wishBusy, setWishBusy] = useState(false), [retryUntil, setRetryUntil] = useState(0);
  const [seller, setSeller] = useState<SellerState>(blankSeller), [external, setExternal] = useState<ExternalState>(blankExternal);
  const source=useSourceLeadSearch(token,query);
  const sourceFrameCycle=useRef(0);
  const [sellerSerial,setSellerSerial]=useState(0),[externalSerial,setExternalSerial]=useState(0);
  const [listMode, setListMode] = useState(false), [cluster, setCluster] = useState<{ kind: MapSelection['kind']; ids: string[] } | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null), [frame, setFrame] = useState<MapFrame | null>(null);
  const [locationMessage, setLocationMessage] = useState(''), [clock, setClock] = useState(Date.now()), [queryError, setQueryError] = useState('');
  const [detail, setDetail] = useState<{ kind: MapSelection['kind']; id: string; seller?: PublicListing; external?: ExternalListing; source?:SourceLead; loading: boolean; error: string } | null>(null);
  const [report, setReport] = useState<PublicListing | null>(null);
  const viewport = useRef<Bounds>(TAIWAN_BOUNDS), frameNumber = useRef(0), initialTarget = useRef<PublicListing | null>(null);
  const currentQuery = useRef(query); currentQuery.current = query;
  const currentSeller = useRef(seller); currentSeller.current = seller;
  const currentExternal = useRef(external); currentExternal.current = external;
  const gate = useRef({ seller: false, external: false }), active = useRef(true), request = useRef<AbortController | null>(null), detailRequest = useRef<AbortController | null>(null);
  const waitUntil = useRef(0), wishGate = useRef(false), wishRequest = useRef<AbortController | null>(null);
  const seenCursors = useRef({ seller: new Set<string>(), external: new Set<string>() });
  const resultsFrame = useRef<{ camera: NonNullable<ReturnType<typeof resultCamera>>; bounds: Bounds } | null>(null);
  const initialSource=useRef<SourceLead|null>(null);
  const origin = marketplaceOrigin();
  const readBlocked = retryUntil > clock;
  const waiting = () => waitUntil.current > Date.now();
  const noteFailure = (error: unknown) => {
    if (error instanceof ApiFailure && error.status === 429 && error.retryAfterMs > 0) {
      waitUntil.current = Math.max(waitUntil.current, Date.now() + error.retryAfterMs);
      setRetryUntil(waitUntil.current); setClock(Date.now());
    }
    return errorText(error);
  };
  const clearElapsedWait = () => { if (waitUntil.current && !waiting()) { waitUntil.current = 0; setRetryUntil(0); } };
  const showFrame = (camera: NonNullable<ReturnType<typeof resultCamera>>) => setFrame({ serial: ++frameNumber.current, camera });
  async function loadWishes(parentSignal?: AbortSignal) {
    if (wishGate.current || waiting()) return;
    wishGate.current = true; clearElapsedWait();
    const controller = new AbortController(); wishRequest.current = controller;
    const signal = parentSignal ? AbortSignal.any([controller.signal, parentSignal]) : controller.signal;
    const valid = () => active.current && wishRequest.current === controller && !signal.aborted;
    setWishBusy(true); setWishError('');
    try {
      const read = (path: string) => api<unknown>(token, path, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
      const rows = await readAllMatchWishes(read, signal);
      if (valid()) setWishes(rows);
    } catch (error) {
      if (valid()) { noteFailure(error); setWishError('願望選單無法載入；仍可搜尋一般商品，或回首頁重新整理。'); }
    } finally {
      if (wishRequest.current === controller) { wishGate.current = false; if (valid()) setWishBusy(false); }
    }
  }
  useEffect(() => {
    if (retryUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      setClock(Date.now()); if (Date.now() >= retryUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);
  useEffect(() => {
    active.current = true; const controller = new AbortController();
    const read = (path: string) => api<unknown>(token, path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
    void (async () => {
      try {
        const intent = parseExploreIntent(search); let bounds: Bounds = [...TAIWAN_BOUNDS];
        setWishId(intent.wishId);
        if(intent.sourceId){const lead=parseLead(await read('/source-leads/'+intent.sourceId+'?presentation=1'));if(lead.id!==intent.sourceId)throw Error('來源商品識別不符。');if(!active.current||controller.signal.aborted)return;initialSource.current=lead;bounds=clipBounds([lead.longitude-0.06,lead.latitude-0.06,lead.longitude+0.06,lead.latitude+0.06])!;}
        if (intent.listingId) {
          const item = parsePublicListing(await read('/listings/' + intent.listingId), origin, import.meta.env.DEV);
          if (item.id !== intent.listingId || Date.parse(item.expiresAt) <= Date.now()) throw new Error('所選商品已失效，請回首頁重新選擇。');
          if (!active.current || controller.signal.aborted) return;
          initialTarget.current = item;
          bounds = clipBounds([item.location.publicLongitude - 0.06, item.location.publicLatitude - 0.06, item.location.publicLongitude + 0.06, item.location.publicLatitude + 0.06])!;
        }
        if (active.current && !controller.signal.aborted) { const initialFilters = { ...emptySearchFilters, q: intent.q }; viewport.current = bounds; setFilters(initialFilters); setQuery({ filters: initialFilters, bounds, wishId: intent.wishId, radius: '', serial: 1 }); }
      } catch (error) { if (active.current && !controller.signal.aborted) setInitError(noteFailure(error)); }
    })();
    void loadWishes(controller.signal);
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => { active.current = false; controller.abort(); request.current?.abort(); detailRequest.current?.abort(); wishRequest.current?.abort(); wishRequest.current = null; wishGate.current = false; window.clearInterval(timer); };
  }, [token, origin, search]);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController(); request.current = controller; let valid = true;
    gate.current = { seller: true, external: true };setSellerSerial(0);setExternalSerial(0);
    seenCursors.current = { seller: new Set<string>(), external: new Set<string>() };
    setSeller({ ...blankSeller }); setExternal({ ...blankExternal }); setSelection(null); setCluster(null); setDetail(initialSource.current&&query.serial===1?{kind:'source',id:initialSource.current.id,source:initialSource.current,loading:false,error:''}:null); detailRequest.current?.abort();
    const read = (path: string) => api<unknown>(token, path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
    const sellers = readExploreSeller(query, read, origin, import.meta.env.DEV).then(page => {
      if (valid && page.nextCursor) seenCursors.current.seller.add(page.nextCursor);
      if (valid) setSeller({ items: page.items, matches: page.matches, cursor: page.nextCursor, busy: false, error: '', notice: page.notice }); return page.items;
    }).catch(error => { if (valid) setSeller({ ...blankSeller, busy: false, error: noteFailure(error) }); return []; }).finally(() => { if (valid) {gate.current.seller = false;setSellerSerial(query.serial);} });
    const externals = readExploreExternal(query, read).then(page => {
      if (valid && page.nextCursor) seenCursors.current.external.add(page.nextCursor);
      if (valid) setExternal({ ...page, cursor: page.nextCursor, busy: false, error: '' }); return page.items;
    }).catch(error => { if (valid) setExternal({ ...blankExternal, busy: false, error: noteFailure(error) }); return []; }).finally(() => { if (valid) {gate.current.external = false;setExternalSerial(query.serial);} });
    void Promise.all([sellers,externals]);
    return () => { valid = false; controller.abort(); };
  }, [query, token, origin]);
  const liveItems = useMemo(() => seller.items.filter(item => Date.parse(item.expiresAt) > clock), [seller.items, clock]);
  const liveExternal = useMemo(() => external.items.filter(item => Date.parse(item.expiresAt) > clock && clock - Date.parse(item.observedAt) <= 48 * 3_600_000), [external.items, clock]);
  const selectedSeller = selection?.kind === 'seller' ? liveItems.find(item => item.id === selection.id) : undefined;
  const selectedSource=selection?.kind==='source'?source.items.find(r=>r.id===selection.id):undefined;
  const selectedExternal = selection?.kind === 'external' ? liveExternal.find(item => item.id === selection.id) : undefined;
  const byMatch = new Map(seller.matches.map(match => [match.listing.id, match]));
  const visibleItems = cluster ? cluster.kind === 'seller' ? liveItems.filter(item => cluster.ids.includes(item.id)) : [] : liveItems;
  const visibleExternal = cluster ? cluster.kind === 'external' ? liveExternal.filter(item => cluster.ids.includes(item.id)) : [] : liveExternal;
  const busy = query !== null && (seller.busy || external.busy || source.busy || sellerSerial!==query.serial || externalSerial!==query.serial);
  async function loadMore(kind: 'seller' | 'external') {
    const scope = currentQuery.current, snapshot = kind === 'seller' ? currentSeller.current : currentExternal.current;
    if (waiting() || !scope || !snapshot.cursor || gate.current[kind] || snapshot.items.length >= MAX_LOADED) return;
    clearElapsedWait();
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
      if (valid()) { const message = noteFailure(error); if (kind === 'seller') setSeller(old => ({ ...old, error: message })); else setExternal(old => ({ ...old, error: message })); }
    } finally { if (valid()) { gate.current[kind] = false; if (kind === 'seller') setSeller(old => ({ ...old, busy: false })); else setExternal(old => ({ ...old, busy: false })); } }
  }
  function commit(bounds = viewport.current, nextFilters = filters, nextWish = wishId, nextRadius = radius) {
    if (waiting()) return;
    try {
      const clipped = clipBounds(bounds); if (!clipped) throw new Error('請將地圖移回台灣範圍，或擴大搜尋。');
      const next = { bounds: clipped, filters: { ...nextFilters }, wishId: nextWish, radius: nextRadius, serial: (currentQuery.current?.serial ?? 0) + 1 };
      exploreSellerPath(next); clearElapsedWait(); initialTarget.current = null; currentQuery.current = next; setQueryError(''); setCluster(null); setQuery(next);
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
  useEffect(()=>{
    if(!query||sellerSerial!==query.serial||externalSerial!==query.serial||source.completedSerial!==query.serial||sourceFrameCycle.current===query.serial)return;
    sourceFrameCycle.current=query.serial;
    const sourceTarget=initialSource.current&&query.serial===1?initialSource.current:null;
    const nativeTarget=initialTarget.current;
    initialSource.current=null;initialTarget.current=null;
    const points=sourceTarget?[{longitude:sourceTarget.longitude,latitude:sourceTarget.latitude}]:nativeTarget?[{longitude:nativeTarget.location.publicLongitude,latitude:nativeTarget.location.publicLatitude}]:[
      ...liveItems.map(i=>({longitude:i.location.publicLongitude,latitude:i.location.publicLatitude})),...liveExternal.map(i=>i.location),...source.items.map(i=>({longitude:i.longitude,latitude:i.latitude}))];
    const camera=resultCamera(points);
    if(camera){showFrame(camera);resultsFrame.current={camera,bounds:query.bounds};}else{resultsFrame.current=null;showFrame({kind:'multiple',bounds:query.bounds});}
    setListMode(false);
    const native=(nativeTarget?liveItems.find(i=>i.id===nativeTarget.id):undefined)??liveItems[0];
    setSelection(sourceTarget?{kind:'source',id:sourceTarget.id}:native?{kind:'seller',id:native.id}:liveExternal[0]?{kind:'external',id:liveExternal[0].id}:source.items[0]?{kind:'source',id:source.items[0].id}:null);
  },[query,sellerSerial,externalSerial,source.completedSerial,source.items,liveItems,liveExternal]);
  function focus(kind: MapSelection['kind'], id: string) {
    if(kind==='source'){const lead=source.items.find(r=>r.id===id);if(!lead)return;const camera=resultCamera([{longitude:lead.longitude,latitude:lead.latitude}]);if(camera)showFrame(camera);setSelection({kind,id});setListMode(false);setCluster(null);return;}
    const item = kind === 'seller' ? liveItems.find(item => item.id === id) : liveExternal.find(item => item.id === id);
    if (!item) return;
    const point = 'owner' in item ? { longitude: item.location.publicLongitude, latitude: item.location.publicLatitude } : item.location;
    const camera = resultCamera([point]); if (camera) showFrame(camera);
    setSelection({ kind, id }); setListMode(false); setCluster(null);
  }
  async function showDetail(kind: MapSelection['kind'], id: string) {
    if (waiting()) return;
    clearElapsedWait();
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller;
    setDetail({ kind, id, loading: true, error: '' });
    try {
      if(kind==='source'){const lead=parseLead(await api<unknown>(token,'/source-leads/'+id+'?presentation=1',{signal:controller.signal}));if(lead.id!==id)throw Error();if(active.current&&!controller.signal.aborted)setDetail({kind,source:lead,loading:false,error:''});return;}
      const response = await api<unknown>(token, '/' + (kind === 'seller' ? 'listings/' : 'external-listings/') + id, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
      if (!active.current || controller.signal.aborted) return;
      if (kind === 'seller') {
        const item = parsePublicListing(response, origin, import.meta.env.DEV);
        if (item.id !== id || Date.parse(item.expiresAt) <= Date.now()) throw new Error('商品已失效，請重新搜尋。');
        setDetail({ kind, id, seller: item, loading: false, error: '' });
      } else {
        const item = parseExternalListing(response); if (item.id !== id) throw new Error('來源商品識別不符。');
        setDetail({ kind, id, external: item, loading: false, error: '' });
      }
    } catch (error) { if (active.current && !controller.signal.aborted) setDetail({ kind, id, loading: false, error: noteFailure(error) }); }
  }
  const renderSeller = (item: PublicListing) => <SellerCard key={item.id} item={item} match={byMatch.get(item.id)} own={item.owner.id === userId} readBlocked={readBlocked} onMap={() => focus('seller', item.id)} onDetail={() => void showDetail('seller', item.id)} />;
  const renderExternal = (item: ExternalListing) => <ExternalCard key={item.id} item={item} readBlocked={readBlocked} onMap={() => focus('external', item.id)} onDetail={() => void showDetail('external', item.id)} />;
  const renderSource=(lead:SourceLead)=><article key={lead.id} className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm"><ProductCardWeb title={lead.title} price={lead.publicFacts?.priceText||'售價待詢問'} location={lead.county+' · '+lead.district+' · 公共面交點'} badge="外部來源 · 庫存與交易待確認" photo={lead.media?.[0]?.thumbnailUrl} onDetail={()=>void showDetail('source',lead.id)}/><button className="mt-3 min-h-11 rounded-xl border px-3 text-sm" onClick={()=>focus('source',lead.id)}>在地圖查看{lead.title}</button></article>;
  const visibleSource=cluster?cluster.kind==='source'?source.items.filter(r=>cluster.ids.includes(r.id)):[]:source.items;
  const chosenWish = wishes.find(item => item.id === query?.wishId);
  const waitNotice = retryUntil > 0 && <p role="status" aria-label={text('搜尋等待時間')} className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{readBlocked
    ? text('查詢暫時受限，請等待 {seconds} 秒後再試。等待期間可調整地圖與條件，不會自動搜尋。', { seconds: Math.ceil((retryUntil - clock) / 1000) })
    : text('等待已結束；請明確重試搜尋、載入更多或重新核對商品，不會自動執行。')}</p>;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">{text("探索商品地圖")}</h1><p className="mt-1 text-sm text-gray-500">{text("在附近，找到願望的另一種可能。")}</p></div><Link to="/sell" className="rounded-xl bg-green-800 px-4 py-3 text-white">{text("拍照刊登好物")}</Link></div>
    {initError && <div role="alert" className="rounded-xl bg-red-50 p-4"><p>{exploreMessage(initError)}</p><Link to="/explore" aria-disabled={readBlocked} onClick={event => { if (waiting()) event.preventDefault(); }} className="underline">{text("清除連結條件，重新探索")}</Link></div>}
    {!detail && waitNotice}
    {!query && !initError && <p role="status">{text("正在準備搜尋條件…")}</p>}
    <form onSubmit={event => { event.preventDefault(); commit(); }} className="rounded-2xl border bg-white p-4">
      <label className="block font-medium" htmlFor="explore-search">{text("商品關鍵字")}</label><div className="mt-2 flex gap-2"><input id="explore-search" type="search" maxLength={100} value={filters.q} onChange={event => setFilters(old => ({ ...old, q: event.target.value }))} placeholder={text('商品名稱、品牌或型號')} className="min-w-0 flex-1 rounded-xl border p-3" /><button type="submit" disabled={!query || readBlocked} className="flex min-h-11 items-center gap-2 rounded-xl bg-green-800 px-4 text-white disabled:opacity-50"><Search className="h-4 w-4" aria-hidden="true" />{text("搜尋")}</button></div>
      <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 font-medium">{text("過濾與願望交叉比對（選用）")}</summary><div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        <label>{text("品牌（精確匹配）")}<input value={filters.brand} maxLength={60} onChange={event => setFilters(old => ({ ...old, brand: event.target.value }))} className="mt-1 block w-full rounded-xl border p-3" /></label>
        <label>{text("商品分類")}<select value={filters.category} onChange={event => setFilters(old => ({ ...old, category: event.target.value }))} className="mt-1 block w-full rounded-xl border p-3"><option value="">{text("所有分類")}</option>{listingCategories.map(([key]) => <option key={key} value={key}>{exploreCategory(key)}</option>)}</select></label>
        <label>{text("商品狀態")}<select value={filters.condition} onChange={event => setFilters(old => ({ ...old, condition: event.target.value as SearchFilters['condition'] }))} className="mt-1 block w-full rounded-xl border p-3"><option value="">{text("新品與二手")}</option><option value="NEW">{text("新品")}</option><option value="USED">{text("二手")}</option></select></label>
        <label>{text("交付方式")}<select value={filters.delivery} onChange={event => setFilters(old => ({ ...old, delivery: event.target.value as SearchFilters['delivery'] }))} className="mt-1 block w-full rounded-xl border p-3"><option value="">{text("不限")}</option><option value="MEETUP">{text("面交")}</option><option value="SHIPPING">{text("寄送")}</option></select></label>
        <label>{text("最低售價（NT$）")}<input inputMode="decimal" value={filters.minPrice} onChange={event => setFilters(old => ({ ...old, minPrice: event.target.value }))} className="mt-1 block w-full rounded-xl border p-3" /></label>
        <label>{text("最高售價（NT$）")}<input inputMode="decimal" value={filters.maxPrice} onChange={event => setFilters(old => ({ ...old, maxPrice: event.target.value }))} className="mt-1 block w-full rounded-xl border p-3" /></label>
        <label>{text("交叉比對我的願望")}<select value={wishId ?? ''} onChange={event => setWishId(event.target.value ? Number(event.target.value) : null)} className="mt-1 block w-full rounded-xl border p-3"><option value="">{text("不套用願望")}</option>{wishId && !wishes.some(item => item.id === wishId) && <option value={wishId}>{text("目前連結的願望（尚未讀取）")}</option>}{wishes.map(item => <option key={item.id} value={item.id}>{item.name} · {item.wishlist.title}</option>)}</select></label>
        {wishId && <label>{text("距離上限（公里，0.5–200，選用）")}<input inputMode="decimal" value={radius} onChange={event => setRadius(event.target.value)} className="mt-1 block w-full rounded-xl border p-3" /></label>}
      </div><p className="mt-3 text-xs text-gray-500">{text("距離以目前地圖約略中心計算，不是精確定位。外部來源不支援品牌、分類、交付、新品或距離條件時不列入結果。")}</p>
        <div className="mt-3 flex flex-wrap gap-3"><button type="submit" disabled={!query || readBlocked} className="min-h-11 rounded-xl border px-4">{text("套用條件")}</button><button type="button" disabled={readBlocked} onClick={() => { if (waiting()) return; setFilters({ ...emptySearchFilters }); setWishId(null); setRadius(''); commit(query?.bounds ?? TAIWAN_BOUNDS, emptySearchFilters, null, ''); }} className="min-h-11 rounded-xl border px-4">{text("清除條件")}</button></div></details>
    </form>
    {queryError && <p role="alert" className="text-red-700">{exploreMessage(queryError)}</p>}{wishError && <div role="status" className="text-amber-800"><p>{exploreMessage(wishError)}</p><button type="button" disabled={wishBusy || readBlocked} onClick={() => void loadWishes()} className="min-h-11 underline disabled:opacity-50">{text('重新讀取願望選單')}</button></div>}
    {query?.wishId && <div className="rounded-xl bg-green-50 p-4 text-sm text-green-900"><p className="font-semibold">{text('正在交叉比對：{name}', { name: chosenWish?.name ?? text('所選願望') })}</p><p className="mt-1">{text("含自己刊登的配對預覽，不能向自己購買。依文字、型號、條件與預算比對，圖片不直接比對；分數不保證同一型號或真偽。")}</p>{seller.notice && <p className="mt-1">{exploreNotice(seller.notice)}</p>}</div>}
    <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={!listMode} onClick={() => { setListMode(false); setCluster(null); }} className="min-h-11 rounded-xl border bg-white px-4">{text("地圖")}</button><button type="button" aria-pressed={listMode} onClick={() => { setListMode(true); setCluster(null); }} className="min-h-11 rounded-xl border bg-white px-4">{text("商品列表")}</button>
      <button type="button" onClick={locate} className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4"><LocateFixed className="h-4 w-4" aria-hidden="true" />{text("移至我的位置")}</button>
      <button type="button" disabled={!query || readBlocked} onClick={() => commit()} className="min-h-11 rounded-xl bg-green-800 px-4 text-white disabled:opacity-50">{text("搜尋此範圍")}</button>
      <button type="button" disabled={!query || readBlocked} onClick={() => commit(expandedSearchBounds(query?.bounds ?? TAIWAN_BOUNDS))} className="min-h-11 rounded-xl border bg-white px-4">{text("擴大搜尋範圍")}</button>
      {resultsFrame.current && <button type="button" onClick={() => { const saved = resultsFrame.current!; viewport.current = saved.bounds; showFrame(saved.camera); setListMode(false); setCluster(null); }} className="min-h-11 rounded-xl border bg-white px-4">{text("返回目前結果")}</button>}
    </div>{locationMessage && <p role="status" className="text-sm text-gray-600">{exploreMessage(locationMessage)}</p>}
    {query && <MapFallbackBoundary fallback={<p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-900">{text('互動地圖暫時無法使用，請切換「商品列表」繼續搜尋與閱覽。')}</p>}><ExploreMapWeb items={liveItems} external={liveExternal} sourceLeads={source.items} frame={frame} visible={!listMode} onViewport={bounds => { viewport.current = bounds; }} onSelect={item => { setSelection(item); setCluster(null); }} onCluster={(kind, ids) => { setCluster({ kind, ids }); setListMode(true); }} /></MapFallbackBoundary>}
    <div aria-live="polite" className="space-y-2 text-sm text-gray-600">{busy ? <p role="status">{text("正在讀取目前範圍的商品…")}</p> : query && <p>{text('目前範圍已載入：{count} 件站內商品{own}、{external} 件外部來源。這不是全站商品總數。', { count: liveItems.length, own: query.wishId ? text('（含 {count} 件自有預覽）', { count: liveItems.filter(item => item.owner.id === userId).length }) : '', external: liveExternal.length })}</p>}
      <p>{source.items.length} 筆來源線索；不是已確認在售商品。</p>{source.error&&<p role="alert">{source.error}</p>}{source.hidden&&<p>目前篩選條件不能由來源線索驗證，來源層未列入。</p>}{external.skipped && <p>{text("目前條件無法由外部來源驗證，外部商品未列入。")}</p>}{!external.enabled && !external.skipped && !external.busy && !external.error && <p>{text("外部來源目前未開放，顯示站內商品。")}</p>}
      {seller.error && <p role="alert" className="text-red-700">{text('站內商品查詢未完成：')}{exploreMessage(seller.error)} <button type="button" disabled={readBlocked} onClick={() => commit(query?.bounds)} className="min-h-11 underline disabled:opacity-50">{text("重新搜尋")}</button></p>}
      {external.error && <p role="alert" className="text-red-700">{text('外部商品查詢未完成：')}{exploreMessage(external.error)} <button type="button" disabled={readBlocked} onClick={() => commit(query?.bounds)} className="min-h-11 underline disabled:opacity-50">{text("重新搜尋")}</button></p>}
      {!busy && query && !seller.error && !external.error && !liveItems.length && !liveExternal.length && !source.items.length && !source.error && <p>{text("目前地圖範圍沒有符合條件的商品，不代表全站沒有商品。可擴大範圍或清除條件。")}</p>}
    </div>
    {listMode ? <><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{text(cluster ? '此群聚的商品' : '商品列表')}</h2>{cluster && <button type="button" onClick={() => setCluster(null)} className="min-h-11 rounded-xl border px-3">{text("顯示全部已載入結果")}</button>}</div><div className="grid gap-4 md:grid-cols-2">{visibleItems.map(renderSeller)}{visibleExternal.map(renderExternal)}{visibleSource.map(renderSource)}</div></>
      : <div className="max-w-2xl">{selectedSeller ? renderSeller(selectedSeller) : selectedExternal ? renderExternal(selectedExternal) : selectedSource ? renderSource(selectedSource) : null}</div>}
    <div className="flex flex-wrap gap-3">{seller.cursor && <button type="button" disabled={readBlocked || seller.busy || seller.items.length >= MAX_LOADED} onClick={() => void loadMore('seller')} className="min-h-11 rounded-xl border bg-white px-4 disabled:opacity-50">{text("載入更多站內商品")}</button>}{external.cursor && <button type="button" disabled={readBlocked || external.busy || external.items.length >= MAX_LOADED} onClick={() => void loadMore('external')} className="min-h-11 rounded-xl border bg-white px-4 disabled:opacity-50">{text("載入更多外部商品")}</button>}</div>
    {(seller.cursor || external.cursor) && <p className="text-xs text-gray-500">{text("尚有未載入的商品；每個來源最多載入 500 件，超過時請縮小範圍或增加搜尋條件。")}</p>}
    {detail && <MarketplaceDialog title={text(detail.kind === 'seller' ? '商品詳情' : '外部來源商品')} closeLabel={text('關閉')} onClose={() => { detailRequest.current?.abort(); setDetail(null); }}>
      {waitNotice}
      {detail.loading && <p role="status">{text("正在核對商品最新狀態…")}</p>}{detail.error && <div role="alert" className="text-red-700"><p>{exploreMessage(detail.error)}</p><button type="button" disabled={readBlocked} onClick={() => void showDetail(detail.kind, detail.id)} className="min-h-11 underline disabled:opacity-50">{text('重新核對此商品')}</button></div>}
      {detail.seller && <div className="space-y-4"><h3 className="text-xl font-semibold">{detail.seller.title}</h3><p className="font-semibold text-green-800">{listingPrice(detail.seller)}</p><div className="flex gap-3 overflow-x-auto">{detail.seller.media.map(photo => <img key={photo.id} src={photo.thumbnailUrl} alt={detail.seller!.title} referrerPolicy="no-referrer" className="h-48 w-48 flex-none rounded-xl object-contain" />)}</div>
        <p className="whitespace-pre-wrap break-words">{detail.seller.description}</p><dl className="space-y-2 text-sm"><div><dt className="inline font-medium">{text("品牌：")}</dt><dd className="inline">{detail.seller.brand ?? text('未提供')}</dd></div><div><dt className="inline font-medium">{text("新舊與狀態：")}</dt><dd className="inline">{text(detail.seller.condition === 'USED' ? '二手' : '新品')} · {text(detail.seller.status === 'RESERVED' ? '已保留' : '在售')}</dd></div><div><dt className="inline font-medium">{text("約略地點：")}</dt><dd className="inline">{detail.seller.location.county} · {detail.seller.location.district}{text('（非精確地址）')}</dd></div><div><dt className="inline font-medium">{text("交付：")}</dt><dd className="inline">{detail.seller.deliveryMethods.map(method => text(method === 'MEETUP' ? '面交' : '寄送')).join('、')} · {text(detail.seller.negotiable ? '可議價' : '不議價')}</dd></div><div><dt className="inline font-medium">{text("失效時間：")}</dt><dd className="inline">{exploreTime(detail.seller.expiresAt)}{text('（台灣時間）')}</dd></div></dl>
        <div className="flex flex-wrap gap-3"><Link to={`/listings/${detail.seller.id}`} className="inline-flex min-h-11 items-center rounded-xl border px-4">{text("開啟可分享商品頁")}</Link>
          <ProductActionsWeb listing={detail.seller} onReport={() => { setReport(detail.seller!); setDetail(null); }} /></div></div>}
      {detail.source&&<div className="space-y-4"><p className="text-sm text-gray-600">外部來源 · Wishlist AI代問，非站內賣家；庫存與交易待確認。</p><h3 className="text-xl font-semibold">{detail.source.title}</h3><p className="font-semibold text-green-800">{detail.source.publicFacts?.priceText||'售價待詢問'}</p><ListingPhotoGallery photos={detail.source.media??[]} title={detail.source.title}/><p className="whitespace-pre-wrap break-words">{detail.source.summary}</p><p role="status" className="text-sm text-stone-600">{detail.source.contactRouting?.reason||'原賣家收訊路由待核實，商品問題可先交 Wishlist AI 收件。'}</p><p>{detail.source.county} · {detail.source.district} · 公共面交點：{detail.source.publicPlaceName}；不是商品或賣家所在地。</p><p>{detail.source.publicFacts?.originalDateLabel}</p><Link className="inline-flex min-h-11 items-center rounded-xl bg-green-800 px-4 text-white" to={'/chat?source='+detail.source.id}>聯絡賣家</Link><a className="inline-flex min-h-11 items-center rounded-xl border px-4" href={detail.source.canonicalUrl} target="_blank" rel="noreferrer">原始來源</a></div>}{detail.external && <div className="space-y-4"><p className="text-sm text-amber-800">{text("外部來源 · 非站內賣家；請至原網站確認價格、庫存及交易方式。")}</p><h3 className="text-xl font-semibold">{detail.external.title}</h3><p className="font-semibold">{exploreSourcePrice(detail.external)}</p><ExternalDetailPhoto item={detail.external} /><p className="whitespace-pre-wrap">{detail.external.description}</p>{detail.external.aiSupplement && <p className="rounded-xl bg-amber-50 p-3">{text('AI 補充（不是來源保證）：')}{detail.external.aiSupplement}</p>}
        <p className="text-sm text-gray-600">{detail.external.county} · {detail.external.district}{text(' 行政區中心，並非商品確切所在地。資料確認：')}{exploreTime(detail.external.observedAt)}{text('（台灣時間）')}</p><a href={detail.external.canonicalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border px-4">{text('前往來源網站（{host}）', { host: detail.external.source.host })}</a></div>}
    </MarketplaceDialog>}
    {report && <ListingReportWeb key={`${userId}:${token}:${report.id}`} token={token} userId={userId} listing={{ id: report.id, title: report.title, available: Date.parse(report.expiresAt) > Date.now() }} onClose={() => setReport(null)} />}
  </section>;
}
