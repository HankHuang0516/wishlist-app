import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Images, Search, MapPin, RefreshCw, ChevronDown } from 'lucide-react';
import { api } from '../lib/marketplaceApi';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import { readAllMatchWishes, readHomeMatches, type MatchGroup } from '../lib/homeMatches';
import { type MatchWish, type WishMatch } from '../lib/wishData';
import { listingPrice } from '../lib/listingSearch';
import { resultCamera } from '../lib/exploreMapView';
import MapFallbackBoundary from './MapFallbackBoundary';
import { homeText } from '../lib/homeText';
const HomeMap = lazy(() => import('./ExploreMapWeb'));

export const exploreLink = (wishId?: number, listingId?: string) => '/explore' +
  (wishId ? '?wish=' + wishId + (listingId ? '&listing=' + listingId : '') : listingId ? '?listing=' + listingId : '');

function Preview({ match, hero = false, overlay }: { match: WishMatch; hero?: boolean; overlay?: ReactNode }) {
  const item = match.listing;
  const description = <div className={`min-w-0 ${hero ? 'space-y-1 p-2 text-sm' : ''}`}><p className="break-words font-semibold text-gray-900">{item.title}</p>
    <p className="font-semibold text-muji-primary">{listingPrice(item)}</p>
    <p className="text-xs text-gray-500">{item.location.county} · {item.location.district} · {homeText('score', { score: match.score })}</p></div>;
  if (hero) return <div>
    <div className="relative">
      <Link to={exploreLink(match.wishItemId, item.id)} aria-label={homeText('photo', { name: item.title })} className="block focus-visible:outline-muji-primary">
        <img src={item.media[0].thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full bg-gray-100 object-cover" />
      </Link>
      {overlay}
    </div>
    <Link to={exploreLink(match.wishItemId, item.id)} className="block hover:bg-gray-50 focus-visible:outline-muji-primary">{description}</Link>
  </div>;
  return <Link to={exploreLink(match.wishItemId, item.id)} className={`${hero ? 'block' : 'flex min-h-20 items-center gap-3 rounded-md p-2'} hover:bg-gray-50 focus-visible:outline-muji-primary`}>
    <img src={item.media[0].thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className={`${hero ? 'aspect-[4/3] w-full' : 'h-20 w-20 flex-none rounded-md'} bg-gray-100 object-cover`} />
    {description}
  </Link>;
}

/** Parent keys this component by account and session to prevent stale private wishes. */
export default function WishHomeWeb({ token, userId, children }: { token: string; userId: number; children?: ReactNode }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [wishes, setWishes] = useState<MatchWish[]>([]), [groups, setGroups] = useState<MatchGroup[]>([]);
  const [selected, setSelected] = useState<number | null>(null), [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [partial, setPartial] = useState('');
  const [progress, setProgress] = useState(homeText('reading')), [clock, setClock] = useState(Date.now()), [refresh, setRefresh] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    inFlight.current = true; setBusy(true); setError(''); setPartial(''); setGroups([]); setWishes([]);
    setProgress(homeText('reading'));
    const read = (path: string) => api<unknown>(token, path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
    void (async () => {
      try {
        const all = await readAllMatchWishes(read, controller.signal);
        if (!active) return;
        setWishes(all); setSelected(old => all.some(w => w.id === old) ? old : all[0]?.id ?? null);
        const result = await readHomeMatches(all, userId, marketplaceOrigin(), read, {
          local: import.meta.env.DEV, signal: controller.signal,
          onProgress: (finished, total) => { if (active) setProgress(homeText('progress', { finished, total })); },
        });
        if (!active) return;
        setGroups(result.groups); setClock(Date.now());
        setProgress(homeText('progress', { finished: all.length - result.failedWishIds.length, total: all.length }));
        if (result.failedWishIds.length) setPartial(homeText('partial', { count: result.failedWishIds.length }));
      } catch { if (active) setError(homeText('failed')); }
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
  return <section aria-labelledby="home-matches-heading" className="space-y-4">
    <div><h1 className="text-[22px] font-bold leading-7 text-muji-primary">{homeText('welcome')}</h1><p className="mt-1 text-xs text-gray-500">{homeText('question')}</p></div>
    <div className="rounded-lg border border-muji-border bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><h2 id="home-matches-heading" className="text-base font-semibold">{homeText('matches')}</h2>
          <p className="mt-1 text-xs text-gray-500">{homeText('best')}</p></div>
        <button type="button" disabled={busy} onClick={() => setRefresh(n => n + 1)} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-xs text-blue-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />{homeText('refresh')}</button>
      </div>
      {busy && <p role="status">{progress}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
      {partial && <p role="alert" className="mb-3 rounded-md bg-amber-50 p-3 text-amber-900">{partial}</p>}
      <div className="grid gap-3 sm:grid-cols-3">{visible.map(group => <article key={group.wish.id} className="min-w-0 overflow-hidden rounded-md border border-gray-200 bg-white">
          <Preview match={group.matches[0]} hero overlay={group.matches.length > 1 && <button type="button" aria-expanded={expanded === group.wish.id} onClick={() => setExpanded(old => old === group.wish.id ? null : group.wish.id)}
            aria-label={homeText('expandLabel', { name: group.wish.name, count: group.matches.length, action: homeText(expanded === group.wish.id ? 'collapse' : 'expand') })} className="absolute bottom-2 left-1 right-1 flex min-h-11 items-center gap-2 rounded-md bg-gray-900/90 px-2 py-1 text-left text-white shadow-sm">
            <span className="flex -space-x-2">{group.matches.slice(0, 3).map(match => <img key={match.listing.id} src={match.listing.media[0].thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-8 w-6 rounded border-2 border-white object-cover" />)}</span>
            <span><span className="block text-xs font-semibold">{homeText('count', { count: group.matches.length })}</span><span className="text-xs text-blue-200">{homeText(expanded === group.wish.id ? 'collapse' : 'expand')}</span></span>
          </button>} />
        <h3 className="border-t bg-gray-50 px-2 py-1 text-xs text-gray-600">{homeText('wish', { name: group.wish.name })}</h3>
        {expanded === group.wish.id && <div className="space-y-2 border-t p-2">{group.matches.slice(1).map(match => <Preview key={match.listing.id} match={match} />)}</div>}
      </article>)}</div>
      {!busy && !error && !partial && wishes.length > 0 && !visible.length && <p className="text-gray-600">{homeText('noMatches')}</p>}
      {!busy && !error && !wishes.length && <div><h2 className="font-semibold">{homeText('firstWish')}</h2><p className="my-2 text-gray-600">{homeText('eligible')}</p><Link to="/wishes" className="inline-flex min-h-11 items-center text-blue-700 underline">{homeText('goWishes')}</Link></div>}
      <p className="mt-3 text-xs text-gray-500">{homeText('notice')}</p>
    </div>
    {children}
    <div className="space-y-3">
      <h2 className="font-semibold">{homeText('shortcuts')} <span className="ml-1 text-xs font-normal text-gray-500">{homeText('optional')}</span></h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/wishes" className="flex min-h-11 items-center gap-3 rounded-md border bg-white px-4 text-sm hover:bg-gray-50"><Camera className="h-5 w-5" aria-hidden="true" /><span>{homeText('addPhoto')}</span></Link>
        <Link to="/sell" className="flex min-h-11 items-center gap-3 rounded-md border bg-white px-4 text-sm hover:bg-gray-50"><Images className="h-5 w-5" aria-hidden="true" /><span>{homeText('burst')}</span></Link>
      </div>
    </div>
    <div className="space-y-3 rounded-lg border border-muji-border bg-white p-3 shadow-sm">
      <form onSubmit={event => { event.preventDefault(); navigate('/explore' + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : '')); }} className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" aria-hidden="true" /><label htmlFor="home-search" className="sr-only">{homeText('search')}</label><input id="home-search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder={homeText('searchPlaceholder')} className="h-11 w-full rounded-md border border-gray-200 pl-10 pr-3 focus-visible:outline-muji-primary" /></div>
        <button type="submit" className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-blue-700 hover:bg-gray-50"><MapPin className="h-5 w-5" aria-hidden="true" />{homeText('map')}</button>
      </form>
      {mapItems.length > 0 && <MapFallbackBoundary fallback={<p role="status" className="rounded-md bg-amber-50 p-3 text-amber-900">{homeText('mapFailed')}</p>}><Suspense fallback={<p role="status">{homeText('mapLoading')}</p>}><div aria-label={homeText('mapPreview')}><HomeMap items={mapItems} external={[]} frame={mapFrame} visible preview onViewport={() => {}} onSelect={selection => navigate(exploreLink(undefined, selection.id))} onCluster={() => navigate('/explore')} /></div></Suspense></MapFallbackBoundary>}
      {wishes.length > 0 && <details className="group border-t pt-2"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm focus-visible:outline-muji-primary"><span className="font-semibold">{homeText('question')}</span><span className="text-xs text-gray-500">{homeText('choose')}</span><ChevronDown className="ml-auto h-4 w-4 group-open:rotate-180" aria-hidden="true" /></summary><div role="radiogroup" aria-label={homeText('chooseLabel')} className="mt-2 flex gap-3 overflow-x-auto pb-2">
        {wishes.map((item, index) => <button type="button" role="radio" key={item.id} aria-checked={selected === item.id} tabIndex={selected === item.id ? 0 : -1} onClick={() => setSelected(item.id)} onKeyDown={event => {
          if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? wishes.length - 1 : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + wishes.length) % wishes.length;
          setSelected(wishes[next].id);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
        }} className={`min-h-14 min-w-36 max-w-60 flex-none rounded-md border p-3 text-left ${selected === item.id ? 'border-muji-primary bg-gray-50' : 'bg-white'}`}>
          <span className="block break-words font-medium">{item.name}</span><span className="text-xs text-gray-500">{item.wishlist.title}</span></button>)}</div>
      {wish && <Link to={exploreLink(wish.id, matches.length === 1 ? matches[0].listing.id : undefined)} aria-label={homeText('compareLabel', { name: wish.name })} className="flex min-h-11 items-center gap-2 text-sm font-medium text-blue-700 underline"><MapPin className="h-5 w-5" aria-hidden="true" />{homeText('compare')}</Link>}
      </details>}
      <Link to="/explore" className="inline-flex min-h-11 items-center text-xs text-blue-700 underline">{homeText('browse')}</Link>
    </div>
  </section>;
}
