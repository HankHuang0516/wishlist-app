import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Images, Search, RefreshCw, ChevronDown } from 'lucide-react';
import { api } from '../lib/marketplaceApi';
import type { DiscoveryProduct } from '../lib/discovery';
import { parseWishMatches, type WishMatchGroup } from '../lib/wishMatches';
import { homeText } from '../lib/homeText';
import { getDisplayLocale } from '../utils/localization';
import MarketplaceDialog from './MarketplaceDialog';
import DiscoveryProductDetail, { DiscoveryProductActions } from './DiscoveryProductDetail';
// The product details are the explore page's; so are their styles (all scoped to its own class names).
import '../pages/exploreDiscovery.css';

const money = (price: number) => 'NT$ ' + new Intl.NumberFormat(getDisplayLocale(), { maximumFractionDigits: 2 }).format(price);
const price = (item: DiscoveryProduct) => item.price !== null && item.currency === 'TWD' ? money(item.price) : item.priceText;

/** A matched product: its photo, name, price and why it matches. Opening it shows its details right here. */
function Match({ item, hero = false, onOpen }: { item: DiscoveryProduct; hero?: boolean; onOpen: (item: DiscoveryProduct) => void }) {
  const photo = item.thumbnailUrl
    ? <img src={item.thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className={`${hero ? 'aspect-[4/3] w-full' : 'h-20 w-20 flex-none rounded-md'} bg-gray-100 object-cover`} />
    : <div aria-hidden="true" className={`${hero ? 'aspect-[4/3] w-full' : 'h-20 w-20 flex-none rounded-md'} flex items-center justify-center bg-gray-100 text-gray-400`}><Search className="h-6 w-6" /></div>;
  return <button type="button" data-product-key={item.key} onClick={() => onOpen(item)} className={`${hero ? 'block w-full' : 'flex min-h-20 w-full items-center gap-3 rounded-md p-2'} text-left hover:bg-gray-50 focus-visible:outline-muji-primary`}>
    {photo}
    <span className={`block min-w-0 ${hero ? 'space-y-1 p-2 text-sm' : ''}`}>
      <span className="block break-words font-semibold text-gray-900">{item.title}</span>
      <span className="block font-semibold text-muji-primary">{price(item)}</span>
      <span className="block text-xs text-gray-500">{homeText(item.kind === 'listing' ? 'onSite' : 'reference')}{item.county ? ' · ' + item.county : ''} · {homeText(item.match?.reasons.includes('BUDGET') ? 'budgetReason' : 'nameReason')}</span>
    </span>
  </button>;
}

/** The signed-in home page: every open wish is matched against all public products as the page opens, and each wish
 *  shows its best matches. Nobody has to choose a wish and search for it. The parent keys this component by account
 *  and session, so a replaced session never shows the previous account's wishes. */
export default function WishHomeWeb({ token, children }: { token: string; userId: number; children?: ReactNode }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<WishMatchGroup[] | null>(null), [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(false), [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState<DiscoveryProduct | null>(null);
  const inFlight = useRef(false);
  // A new match starts busy; the first one does by its initial state.
  const again = () => { setBusy(true); setError(false); setRefresh(n => n + 1); };
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    inFlight.current = true;
    void api<unknown>(token, '/discovery/wish-matches', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) })
      .then(value => { if (active) { setGroups(parseWishMatches(value)); setError(false); } })
      .catch(() => { if (active) { setGroups(null); setError(true); } })
      .finally(() => { if (active) { inFlight.current = false; setBusy(false); } });
    // Coming back to the tab matches again, so a product listed meanwhile shows up.
    const visible = () => { if (document.visibilityState === 'visible' && !inFlight.current) { setBusy(true); setError(false); setRefresh(n => n + 1); } };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; controller.abort(); document.removeEventListener('visibilitychange', visible); };
  }, [token, refresh]);
  const matched = groups?.filter(group => group.total > 0 && group.items.length > 0) ?? [], unmatched = groups?.filter(group => group.total === 0) ?? [];
  const listFormat = new Intl.ListFormat(getDisplayLocale(), { style: 'short', type: 'conjunction' });
  return <section aria-labelledby="home-matches-heading" className="space-y-4">
    <div><h1 className="text-[22px] font-bold leading-7 text-muji-primary">{homeText('welcome')}</h1><p className="mt-1 text-xs text-gray-500">{homeText('question')}</p></div>
    <div className="rounded-lg border border-muji-border bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><h2 id="home-matches-heading" className="text-base font-semibold">{homeText('matches')}</h2>
          <p className="mt-1 text-xs text-gray-500">{homeText('best')}</p></div>
        <button type="button" disabled={busy} onClick={again} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-xs text-blue-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />{homeText('refresh')}</button>
      </div>
      {busy && <p role="status">{homeText('reading')}</p>}
      {error && <p role="alert" className="text-red-700">{homeText('failed')}</p>}
      <div className="grid gap-3 sm:grid-cols-3">{matched.map(group => {
        const open = expanded === group.wish.id;
        return <article key={group.wish.id} className="min-w-0 overflow-hidden rounded-md border border-gray-200 bg-white">
          <h3 className="flex flex-wrap items-baseline justify-between gap-x-2 border-b bg-gray-50 px-2 py-1 text-xs text-gray-600">
            <span className="min-w-0 break-words font-semibold text-gray-800">{group.wish.name}</span>
            {group.wish.maxPrice !== null && group.wish.priceCurrency === 'TWD' && <span>{homeText('budget', { price: money(group.wish.maxPrice) })}</span>}
          </h3>
          <Match item={group.items[0]} hero onOpen={setDetail} />
          {group.total > 1 && <button type="button" aria-expanded={open} onClick={() => setExpanded(old => old === group.wish.id ? null : group.wish.id)}
            className="flex min-h-11 w-full items-center gap-2 border-t px-2 text-left text-sm font-medium text-blue-700 hover:bg-gray-50">
            <span className="flex -space-x-2">{group.items.slice(1, 4).map(item => item.thumbnailUrl && <img key={item.key} src={item.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-8 w-6 rounded border-2 border-white object-cover" />)}</span>
            <span className="flex-1">{homeText(open ? 'collapse' : 'viewAll', { count: group.total })}</span>
            <ChevronDown className={`h-4 w-4 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>}
          {open && <div className="space-y-2 border-t p-2">
            {group.items.slice(1).map(item => <Match key={item.key} item={item} onOpen={setDetail} />)}
            {group.total > group.items.length && <Link to="/explore?feed=for-you" className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">{homeText('more')}</Link>}
          </div>}
        </article>;
      })}</div>
      {!busy && !error && unmatched.length > 0 && <p className="mt-3 text-sm text-gray-600">{homeText('unmatched', { names: listFormat.format(unmatched.map(group => group.wish.name)) })}</p>}
      {!busy && !error && groups?.length === 0 && <div><h2 className="font-semibold">{homeText('firstWish')}</h2><p className="my-2 text-gray-600">{homeText('eligible')}</p><Link to="/wishes" className="inline-flex min-h-11 items-center text-blue-700 underline">{homeText('goWishes')}</Link></div>}
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
    <form onSubmit={event => { event.preventDefault(); navigate('/explore' + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : '')); }} className="flex flex-wrap items-center gap-3 rounded-lg border border-muji-border bg-white p-3 shadow-sm">
      <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" aria-hidden="true" /><label htmlFor="home-search" className="sr-only">{homeText('search')}</label><input id="home-search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder={homeText('searchPlaceholder')} className="h-11 w-full rounded-md border border-gray-200 pl-10 pr-3 focus-visible:outline-muji-primary" /></div>
      <button type="submit" className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-blue-700 hover:bg-gray-50"><Search className="h-5 w-5" aria-hidden="true" />{homeText('searchButton')}</button>
    </form>
    {detail && <MarketplaceDialog wide title={homeText('detail')} closeLabel={homeText('close')} onClose={() => setDetail(null)} footer={<DiscoveryProductActions item={detail} />}><DiscoveryProductDetail key={detail.key} item={detail} /></MarketplaceDialog>}
  </section>;
}
