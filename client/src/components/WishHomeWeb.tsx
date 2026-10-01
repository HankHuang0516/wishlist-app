import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Images, Search, MapPin, RefreshCw } from 'lucide-react';
import { api } from '../lib/marketplaceApi';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import { readAllMatchWishes, readHomeMatches, type MatchGroup } from '../lib/homeMatches';
import { type MatchWish, type WishMatch } from '../lib/wishData';
import { listingPrice } from '../lib/listingSearch';
import { resultCamera } from '../lib/exploreMapView';
import MapFallbackBoundary from './MapFallbackBoundary';
const HomeMap = lazy(() => import('./ExploreMapWeb'));

export const exploreLink = (wishId?: number, listingId?: string) => '/explore' +
  (wishId ? '?wish=' + wishId + (listingId ? '&listing=' + listingId : '') : listingId ? '?listing=' + listingId : '');

function Preview({ match, hero = false }: { match: WishMatch; hero?: boolean }) {
  const item = match.listing;
  return <Link to={exploreLink(match.wishItemId, item.id)} className={`${hero ? 'block' : 'flex min-h-20 items-center gap-3 rounded-md p-2'} hover:bg-gray-50 focus-visible:outline-muji-primary`}>
    <img src={item.media[0].thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className={`${hero ? 'aspect-[4/3] w-full' : 'h-20 w-20 flex-none rounded-md'} bg-gray-100 object-cover`} />
    <div className={`min-w-0 ${hero ? 'space-y-1 p-3' : ''}`}><p className="break-words font-semibold text-gray-900">{item.title}</p>
      <p className="font-semibold text-muji-primary">{listingPrice(item)}</p>
      <p className="text-xs text-gray-500">{item.location.county} · {item.location.district} · 吻合 {match.score} 分</p></div>
  </Link>;
}

/** Parent keys this component by account and session to prevent stale private wishes. */
export default function WishHomeWeb({ token, userId, children }: { token: string; userId: number; children?: ReactNode }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [wishes, setWishes] = useState<MatchWish[]>([]), [groups, setGroups] = useState<MatchGroup[]>([]);
  const [selected, setSelected] = useState<number | null>(null), [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [partial, setPartial] = useState('');
  const [progress, setProgress] = useState('正在讀取願望…'), [clock, setClock] = useState(Date.now()), [refresh, setRefresh] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    inFlight.current = true; setBusy(true); setError(''); setPartial(''); setGroups([]); setWishes([]);
    setProgress('正在讀取願望…');
    const read = (path: string) => api<unknown>(token, path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
    void (async () => {
      try {
        const all = await readAllMatchWishes(read, controller.signal);
        if (!active) return;
        setWishes(all); setSelected(old => all.some(w => w.id === old) ? old : all[0]?.id ?? null);
        const result = await readHomeMatches(all, userId, marketplaceOrigin(), read, {
          local: import.meta.env.DEV, signal: controller.signal,
          onProgress: (finished, total) => { if (active) setProgress(`已比對 ${finished}／${total} 個願望`); },
        });
        if (!active) return;
        setGroups(result.groups); setClock(Date.now());
        setProgress(`已比對 ${all.length - result.failedWishIds.length}／${all.length} 個願望`);
        if (result.failedWishIds.length) setPartial(`${result.failedWishIds.length} 個願望配對失敗，以下結果不完整。請重新整理，這不代表沒有商品。`);
      } catch { if (active) setError('無法載入願望或配對，請確認網路及登入狀態後重試。'); }
      finally { if (active) { inFlight.current = false; setBusy(false); } }
    })();
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    const visible = () => { if (document.visibilityState === 'visible' && !inFlight.current) setRefresh(n => n + 1); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [token, userId, refresh]);
  const visible = groups.map(group => ({ ...group, matches: group.matches.filter(m => Date.parse(m.listing.expiresAt) > clock) })).filter(group => group.matches.length);
  const wish = wishes.find(w => w.id === selected), matches = visible.find(g => g.wish.id === selected)?.matches ?? [];
  const mapItems = useMemo(() => [...new Map(groups.flatMap(group => group.matches)
    .filter(match => Date.parse(match.listing.expiresAt) > clock).map(match => [match.listing.id, match.listing])).values()], [groups, clock]);
  // A 30-second expiry check must not reset the visitor's map pan/zoom.
  const mapCameraKey = JSON.stringify(mapItems.map(item => ({ id: item.id, longitude: item.location.publicLongitude, latitude: item.location.publicLatitude })));
  const mapFrame = useMemo(() => {
    const camera = resultCamera(JSON.parse(mapCameraKey));
    return camera ? { serial: Date.now(), camera } : null;
  }, [mapCameraKey]);
  return <section aria-labelledby="home-matches-heading" className="space-y-6">
    <div><h1 className="text-3xl font-bold text-muji-primary">Welcome Back.</h1><p className="mt-1 text-sm text-gray-500">今天想找什麼？</p></div>
    <div className="rounded-lg border border-muji-border bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="home-matches-heading" className="text-xl font-semibold">願望吻合的商品</h2>
          <p className="mt-1 text-sm text-gray-500">每個願望，先看最匹配的一件。</p></div>
        <button type="button" disabled={busy} onClick={() => setRefresh(n => n + 1)} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-blue-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />重新整理願望與配對</button>
      </div>
      {busy && <p role="status">{progress}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
      {partial && <p role="alert" className="mb-3 rounded-md bg-amber-50 p-3 text-amber-900">{partial}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map(group => <article key={group.wish.id} className="min-w-0 overflow-hidden rounded-md border border-gray-200 bg-white">
        <div className="relative">
          <Preview match={group.matches[0]} hero />
          {group.matches.length > 1 && <button type="button" aria-expanded={expanded === group.wish.id} onClick={() => setExpanded(old => old === group.wish.id ? null : group.wish.id)}
            aria-label={`${group.wish.name}共有${group.matches.length}件吻合商品，${expanded === group.wish.id ? '收合' : '查看全部'}`} className="absolute left-2 right-2 top-2 flex min-h-14 items-center gap-3 rounded-md bg-gray-900/90 px-3 py-2 text-left text-white shadow-sm">
            <span className="flex -space-x-2">{group.matches.slice(0, 3).map(match => <img key={match.listing.id} src={match.listing.media[0].thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-8 rounded border-2 border-white object-cover" />)}</span>
            <span><span className="block font-semibold">{group.matches.length} 件吻合</span><span className="text-xs text-blue-200">{expanded === group.wish.id ? '收合結果' : '查看全部'}</span></span>
          </button>}
        </div>
        <h3 className="border-t bg-gray-50 px-3 py-2 text-sm text-gray-600">願望：{group.wish.name}</h3>
        {expanded === group.wish.id && <div className="space-y-2 border-t p-2">{group.matches.slice(1).map(match => <Preview key={match.listing.id} match={match} />)}</div>}
      </article>)}</div>
      {!busy && !error && !partial && wishes.length > 0 && !visible.length && <p className="text-gray-600">目前沒有其他賣家的吻合商品。仍可在下方選擇願望並前往地圖探索。</p>}
      {!busy && !error && !wishes.length && <div><h2 className="font-semibold">先留下你的第一個願望</h2><p className="my-2 text-gray-600">只有未完成、未隱藏的本人願望會參與配對。</p><Link to="/wishes" className="text-blue-700 underline">前往願望清單</Link></div>}
      <p className="mt-4 text-xs text-gray-500">自己的刊登不列入買家推薦；圖片不直接比對，請核對型號與真偽。</p>
    </div>
    {children}
    <div className="space-y-3">
      <h2 className="font-semibold">快捷功能 <span className="ml-1 text-xs font-normal text-gray-500">選用</span></h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/wishes" className="flex min-h-14 items-center gap-3 rounded-md border bg-white px-4 hover:bg-gray-50"><Camera className="h-5 w-5" aria-hidden="true" /><span>拍照新增願望</span></Link>
        <Link to="/sell" className="flex min-h-14 items-center gap-3 rounded-md border bg-white px-4 hover:bg-gray-50"><Images className="h-5 w-5" aria-hidden="true" /><span>連拍刊登</span></Link>
      </div>
    </div>
    <div className="space-y-4 rounded-lg border border-muji-border bg-white p-4 shadow-sm sm:p-6">
      <form onSubmit={event => { event.preventDefault(); navigate('/explore' + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : '')); }} className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" aria-hidden="true" /><label htmlFor="home-search" className="sr-only">搜尋商品</label><input id="home-search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋商品或願望" className="h-11 w-full rounded-md border border-gray-200 pl-10 pr-3 focus-visible:outline-muji-primary" /></div>
        <button type="submit" className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-blue-700 hover:bg-gray-50"><MapPin className="h-5 w-5" aria-hidden="true" />在地圖查看</button>
      </form>
      {wishes.length > 0 && <div><h2 className="mb-3 text-lg font-semibold">今天想找什麼？</h2><div role="radiogroup" aria-label="選擇要交叉比對的願望" className="flex gap-3 overflow-x-auto pb-2">
        {wishes.map((item, index) => <button type="button" role="radio" key={item.id} aria-checked={selected === item.id} tabIndex={selected === item.id ? 0 : -1} onClick={() => setSelected(item.id)} onKeyDown={event => {
          if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? wishes.length - 1 : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + wishes.length) % wishes.length;
          setSelected(wishes[next].id);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
        }} className={`min-h-14 min-w-36 max-w-60 flex-none rounded-md border p-3 text-left ${selected === item.id ? 'border-muji-primary bg-gray-50' : 'bg-white'}`}>
          <span className="block break-words font-medium">{item.name}</span><span className="text-xs text-gray-500">{item.wishlist.title}</span></button>)}</div></div>}
      {wish && <Link to={exploreLink(wish.id, matches.length === 1 ? matches[0].listing.id : undefined)} aria-label={`在地圖交叉比對${wish.name}`} className="flex min-h-11 items-center gap-2 text-sm font-medium text-blue-700 underline"><MapPin className="h-5 w-5" aria-hidden="true" />在地圖交叉比對這個願望</Link>}
      {mapItems.length > 0 && <MapFallbackBoundary fallback={<p role="status" className="rounded-md bg-amber-50 p-3 text-amber-900">地圖預覽暫時無法使用，仍可點擊上方商品卡片，或前往探索的商品列表。</p>}><Suspense fallback={<p role="status">正在載入商品地圖…</p>}><div className="h-64 overflow-hidden rounded-md border" aria-label="願望吻合商品地圖預覽"><HomeMap items={mapItems} external={[]} frame={mapFrame} visible onViewport={() => {}} onSelect={selection => navigate(exploreLink(undefined, selection.id))} onCluster={() => navigate('/explore')} /></div></Suspense></MapFallbackBoundary>}
      <Link to="/explore" className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">不套用願望，瀏覽商品地圖</Link>
    </div>
  </section>;
}
