import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, RefreshCw } from 'lucide-react';
import { api } from '../lib/marketplaceApi';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import { readAllMatchWishes, readHomeMatches, type MatchGroup } from '../lib/homeMatches';
import { type MatchWish, type WishMatch } from '../lib/wishData';
import { listingPrice } from '../lib/listingSearch';

export const exploreLink = (wishId?: number, listingId?: string) => '/explore' +
  (wishId ? '?wish=' + wishId + (listingId ? '&listing=' + listingId : '') : listingId ? '?listing=' + listingId : '');

function Preview({ match }: { match: WishMatch }) {
  const item = match.listing;
  return <Link to={exploreLink(match.wishItemId, item.id)} className="flex min-h-20 items-center gap-3 rounded-xl p-2 hover:bg-gray-50 focus-visible:outline-green-700">
    <img src={item.media[0].thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-20 w-20 flex-none rounded-xl bg-gray-100 object-cover" />
    <div className="min-w-0"><p className="break-words font-semibold text-gray-900">{item.title}</p>
      <p className="font-semibold text-green-800">{listingPrice(item)}</p>
      <p className="text-sm text-gray-500">{item.location.county} · {item.location.district} · 吻合 {match.score} 分</p></div>
  </Link>;
}

/** Parent keys this component by account and session to prevent stale private wishes. */
export default function WishHomeWeb({ token, userId }: { token: string; userId: number }) {
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
  return <section aria-labelledby="home-matches-heading" className="space-y-5">
    <div><h1 className="text-3xl font-bold text-gray-900">讓願望更靠近。</h1><p className="mt-2 text-gray-500">願望先行，地圖幫你發現下一個好物。</p></div>
    <div><h2 id="home-matches-heading" className="text-xl font-semibold">所有願望吻合的商品</h2>
      <p className="mt-2 text-sm text-gray-500">每個願望先顯示最吻合的一件。自己的刊登不列入買家推薦；圖片不直接比對，請核對型號與真偽。</p></div>
    {busy && <p role="status">{progress}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
    {partial && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">{partial}</p>}
    <div className="grid gap-4 md:grid-cols-2">{visible.map(group => <article key={group.wish.id} className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="mb-2 break-words font-semibold text-green-900">{group.wish.name}</h3><Preview match={group.matches[0]} />
      {group.matches.length > 1 && <button type="button" aria-expanded={expanded === group.wish.id} onClick={() => setExpanded(old => old === group.wish.id ? null : group.wish.id)}
        aria-label={`${group.wish.name}共有${group.matches.length}件吻合商品，${expanded === group.wish.id ? '收合' : '查看全部'}`} className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-xl bg-green-50 px-3 py-2 text-left text-green-900">
        <span className="flex -space-x-2">{group.matches.slice(0, 3).map(match => <img key={match.listing.id} src={match.listing.media[0].thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-8 rounded-lg border-2 border-green-50 object-cover" />)}</span>
        <span><span className="block font-semibold">多件吻合</span><span className="text-sm">{expanded === group.wish.id ? '收合結果' : `查看全部 ${group.matches.length} 件`}</span></span></button>}
      {expanded === group.wish.id && <div className="mt-3 space-y-2 border-t pt-3">{group.matches.slice(1).map(match => <Preview key={match.listing.id} match={match} />)}</div>}
    </article>)}</div>
    {!busy && !error && !partial && wishes.length > 0 && !visible.length && <p className="text-gray-600">目前沒有其他賣家的吻合商品。仍可在下方選擇願望並前往地圖探索。</p>}
    {wishes.length > 0 && <div><h2 className="mb-3 text-xl font-semibold">今天想找什麼？</h2><div role="radiogroup" aria-label="選擇要交叉比對的願望" className="flex gap-3 overflow-x-auto pb-2">
      {wishes.map((item, index) => <button type="button" role="radio" key={item.id} aria-checked={selected === item.id} tabIndex={selected === item.id ? 0 : -1} onClick={() => setSelected(item.id)} onKeyDown={event => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? wishes.length - 1 : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + wishes.length) % wishes.length;
        setSelected(wishes[next].id);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
      }} className={`min-h-14 min-w-36 max-w-60 flex-none rounded-xl border p-3 text-left ${selected === item.id ? 'border-green-700 bg-green-50' : 'bg-white'}`}>
        <span className="block break-words font-medium">{item.name}</span><span className="text-xs text-gray-500">{item.wishlist.title}</span></button>)}</div></div>}
    {wish && <Link to={exploreLink(wish.id, matches.length === 1 ? matches[0].listing.id : undefined)} aria-label={`在地圖交叉比對${wish.name}`} className="flex min-h-14 items-center gap-3 rounded-xl bg-green-50 p-4 font-semibold text-green-800"><MapPin aria-hidden="true" />在地圖交叉比對這個願望</Link>}
    {!busy && !error && !wishes.length && <div className="rounded-xl border bg-white p-4"><h2 className="font-semibold">先留下你的第一個願望</h2><p className="my-2 text-gray-600">只有未完成、未隱藏的本人願望會參與配對。</p><Link to="/dashboard" className="text-green-800 underline">前往願望清單</Link></div>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => setRefresh(n => n + 1)} className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />重新整理願望與配對</button>
      <Link to="/explore" className="flex min-h-11 items-center rounded-xl border bg-white px-4">不套用願望，瀏覽商品地圖</Link></div>
  </section>;
}
