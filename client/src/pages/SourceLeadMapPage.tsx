import { sourceLocationLabel, parseLead, parseLeadMap, parseLeadPage, isLocatedLead, type SourceLead, type LocatedSourceLead, type SourceMapPoint } from '../lib/sourceLeadData';
import { sourceLeadText as text, sourceLeadRoutingReason } from '../lib/sourceLeadCopy';
import { sourceLeadPrice } from '../lib/sourceLeadPrice';
import { ApiFailure, publicApi } from '../lib/marketplaceApi';
import { ListingPhoto, ListingPhotoGallery } from '../components/ListingPhoto';
import { isUuid } from '../lib/listingBatch';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const mapPoint = (latitude: number, longitude: number) => ({
  x: ((longitude + 180) / 360 * 128 - 106) * 256,
  y: ((1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * 128 - 53) * 256,
});
// The server decides freshness (archive leads keep 14 days; DB records stay until a recheck withdraws them).
export function currentLead(lead: Pick<SourceLead, 'postedEarliestAt' | 'postedLatestAt' | 'checkedAt'>, now = Date.now()) {
  const lower = Date.parse(lead.postedEarliestAt ?? ''), upper = Date.parse(lead.postedLatestAt ?? ''), checked = Date.parse(lead.checkedAt);
  return Number.isFinite(lower) && Number.isFinite(upper) && Number.isFinite(checked) && lower <= upper && upper <= now && checked <= now;
}

// The list is read a page at a time; the map does not wait for it.
const LIST = '/source-leads?presentation=1&photos=2&approximate=1';

export default function SourceLeadMapPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Every place and the total come from one summary; `items` holds the list pages read so far.
  const [map, setMap] = useState<{ total: number; points: SourceMapPoint[] }>({ total: 0, points: [] });
  const [items, setItems] = useState<LocatedSourceLead[]>([]);
  const [more, setMore] = useState(false);
  // A lead opened from the map that the list has not reached yet.
  const [picked, setPicked] = useState<LocatedSourceLead | null>(null);
  const [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0), [retryUntil, setRetryUntil] = useState(0), [clock, setClock] = useState(Date.now);
  const readMore = useRef<() => void>(() => {}), list = useRef<HTMLDivElement>(null), end = useRef<HTMLDivElement>(null);
  const wanted = params.get('id');
  const selected = items.find(item => item.id === wanted) ?? (picked && picked.id === wanted ? picked : undefined) ?? items[0];
  const remaining = Math.max(0, Math.ceil((retryUntil - clock) / 1000));

  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);

  useEffect(() => {
    let stopped = false, loading = false, paused = false;
    let controller: AbortController | null = null;
    // What is on screen: the leads of the pages read so far, where the next page starts, and how many pages that was.
    let shown: SourceLead[] = [], ids = new Set<string>(), cursors = new Set<string>(), cursor: string | null = null, pages = 0;
    // `extend` reads the next page of the list. Otherwise the summary and the pages already on screen are read again.
    async function read(extend: boolean) {
      if (loading || paused || stopped || (extend && !cursor)) return;
      loading = true;
      setBusy(true);
      setFailed(false);
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
      try {
        // Reading on continues from what is shown; a refresh starts over and replaces it only when it is complete.
        const all = extend ? [...shown] : [], seen = new Set(extend ? ids : []), used = new Set(extend ? cursors : []);
        let after = extend ? cursor : null, count = extend ? pages : 0, summary: ReturnType<typeof parseLeadMap> | null = null;
        const add = (page: ReturnType<typeof parseLeadPage>) => {
          for (const lead of page.items) if (!seen.has(lead.id)) { seen.add(lead.id); all.push(lead); }
          after = page.nextCursor;
          if (after && used.has(after)) throw new Error('Incomplete source pagination');
          if (after) used.add(after);
          count++;
        };
        const next = async () => add(parseLeadPage(await publicApi(LIST + (after ? '&cursor=' + encodeURIComponent(after) : ''), { signal })));
        if (extend) await next();
        else {
          const [places, first] = await Promise.all([publicApi('/source-leads/map', { signal }), publicApi(LIST, { signal })]);
          summary = parseLeadMap(places);
          add(parseLeadPage(first));
          while (count < pages && after) {
            if (stopped) return;
            if (signal.aborted) throw signal.reason;
            await next();
          }
        }
        if (stopped) return;
        if (signal.aborted) throw signal.reason;
        {
          shown = all; ids = seen; cursors = used; cursor = after; pages = count;
          if (summary) setMap({ total: summary.total, points: summary.points });
          setItems(all.filter(lead => currentLead(lead)).filter(isLocatedLead));
          setMore(after !== null);
          setLoaded(true);
          setFailed(false);
          setRetryUntil(0);
        }
      } catch (error) {
        if (!stopped) {
          paused = true;
          shown = []; ids = new Set(); cursors = new Set(); cursor = null;
          setItems([]);
          setMap({ total: 0, points: [] });
          setMore(false);
          setLoaded(false);
          setFailed(true);
          setClock(Date.now());
          setRetryUntil(error instanceof ApiFailure && error.retryAfterMs > 0 ? Date.now() + error.retryAfterMs : 0);
        }
      } finally {
        loading = false;
        if (!stopped) setBusy(false);
      }
    }
    const foreground = () => { if (document.visibilityState === 'visible') void read(false); };
    readMore.current = () => void read(true);
    void read(false);
    const timer = setInterval(foreground, 30_000);
    document.addEventListener('visibilitychange', foreground);
    return () => { stopped = true; readMore.current = () => {}; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', foreground); };
  }, [retry]);

  // Reaching the end of the list reads the next page; the button below does the same without scrolling.
  useEffect(() => {
    if (!more || !end.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) readMore.current(); }, { root: list.current, rootMargin: '160px' });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [more, items.length]);

  // A place on the map opens its first lead, which may be on a page of the list that has not been read.
  const listed = !wanted || items.some(item => item.id === wanted), known = picked?.id === wanted;
  useEffect(() => {
    if (!loaded || listed || known || !isUuid(wanted)) return;
    const controller = new AbortController();
    publicApi('/source-leads/' + wanted + '?presentation=1&photos=2&approximate=1', { signal: controller.signal }).then(value => {
      const lead = parseLead(value);
      if (!controller.signal.aborted && lead.id === wanted && currentLead(lead) && isLocatedLead(lead)) setPicked(lead);
    }).catch(() => { /* Not readable now: the first listed lead stays selected and nothing is claimed about this one. */ });
    return () => controller.abort();
  }, [loaded, listed, known, wanted]);

  const points = map.points, choices = selected && !items.includes(selected) ? [selected, ...items] : items;
  return <main className="max-w-6xl mx-auto p-4 space-y-4">
    <h1 className="text-2xl font-bold">{text('來源線索地圖')}</h1>
    <p>{text('庫存、圖文權利與交易仍待確認；來源線索不計入已驗證商品達成率。公共面交點不是賣家或現貨所在地；概略位置是縣市示意，非取貨點。')}</p>
    <p role="status">{busy ? text('讀取中…') : loaded ? text('{count} 件來源線索・{points} 個公共／概略示意位置', { count: map.total, points: points.length }) : text('來源讀取尚未確認。')}</p>
    {failed && <div role="alert"><p>{text('來源線索未完成讀取，已暫停自動更新；不代表沒有資料，請明確重新讀取。')}</p>
      {remaining > 0 && <p>{text('{seconds} 秒後可再試。', { seconds: remaining })}</p>}
      <button type="button" disabled={busy || remaining > 0} className="min-h-11 rounded-xl border px-4 disabled:opacity-50" onClick={() => setRetry(value => value + 1)}>{text('重新讀取來源')}</button>
    </div>}
    <div className="grid md:grid-cols-2 gap-4"><div>
      <div className="relative overflow-hidden border rounded" style={{ aspectRatio: '2/3' }} aria-label={text('台灣來源線索位置地圖')}>
        <svg viewBox="0 0 512 768" role="img" aria-label={text('OpenStreetMap 台灣來源示意位置')}>
          <title>{text('來源線索公共與概略位置地圖')}</title>
          {[106,107].flatMap(x => [53,54,55].map(y => <foreignObject key={`${x}-${y}`} x={(x-106)*256} y={(y-53)*256} width="256" height="256">
            <img alt="" referrerPolicy="origin" src={`https://tile.openstreetmap.org/7/${x}/${y}.png`} width="256" height="256" />
          </foreignObject>))}
          {points.map(item => {
            const point = mapPoint(item.latitude, item.longitude);
            return <g key={item.id} role="button" tabIndex={0} aria-label={item.publicPlaceName ?? undefined} onClick={() => setParams({ id: item.id })} onKeyDown={event => { if (event.key === 'Enter') setParams({ id: item.id }); }}>
              <circle cx={point.x} cy={point.y} r="9" fill="#2563eb" /><text x={point.x+12} y={point.y} fontSize="12" fill="#111">{text('{count}件', { count: item.count })}</text>
            </g>;
          })}
        </svg>
      </div>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
      <p>{text('地圖含公共地點與縣市示意點；概略位置，非取貨點，不提供精確距離或導航。實際面交地點待確認可轉告後私訊買家。')}</p>
    </div><div className="space-y-3">
      <div ref={list} className="max-h-80 overflow-auto space-y-2" aria-label={text('來源商品清單')}>{items.map(item => <button key={item.id} onClick={() => setParams({ id: item.id })} aria-label={text('查看 {title}', { title: item.title })} className="flex w-full gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left">
        <ListingPhoto src={item.media?.[0]?.thumbnailUrl} alt={item.media?.[0]?.alt || item.title} />
        <span className="min-w-0 space-y-1"><span className="block text-xs text-stone-500">{text('外部來源 · 庫存待確認')}</span>
          <span className="block font-semibold text-stone-900">{item.title}</span><span className="block font-semibold text-blue-700">{sourceLeadPrice(item.publicFacts?.priceText)}</span>
          <span className="block text-sm text-stone-600">{item.county}{item.district} · {text(sourceLocationLabel(item))}</span>
        </span>
      </button>)}
        {more && <div ref={end}><button type="button" disabled={busy} className="min-h-11 w-full rounded-xl border px-4 disabled:opacity-50" onClick={() => readMore.current()}>
          {busy ? text('讀取更多來源中…') : text('載入更多來源（已顯示 {shown}／{total} 件）', { shown: items.length, total: map.total })}</button></div>}
      </div>
      <label>{text('選擇線索')} <select className="w-full border p-2" disabled={!selected} value={selected?.id ?? ''} onChange={event => setParams({ id: event.target.value })}>
        {choices.map(item => <option key={item.id} value={item.id}>{item.title} — {item.publicPlaceName}</option>)}
      </select></label>
      {selected && <><article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <ListingPhotoGallery key={selected.id} photos={selected.media ?? []} title={selected.title} completeness={selected.photoCompleteness} />
        <div className="space-y-4 p-5"><p className="text-sm text-stone-500">{text('外部來源 · 庫存與交易待確認')}</p>
          <h2 className="text-2xl font-bold text-stone-900">{selected.title}</h2><p className="text-2xl font-semibold text-blue-700">{sourceLeadPrice(selected.publicFacts?.priceText)}</p>
          <p className="text-stone-600">{selected.county}{selected.district} · {text(sourceLocationLabel(selected))}{text('，非現貨所在地')}</p>
          <h3 className="font-semibold">{text('商品說明')}</h3><p className="whitespace-pre-wrap text-stone-700">{selected.summary}</p>
          <p className="text-sm text-stone-600">{selected.locationPrecision === 'COUNTY_ILLUSTRATION' ? selected.publicAddress : selected.publicPlaceName + '：' + selected.publicAddress}</p>
          <p role="status" className="text-sm text-stone-600">{sourceLeadRoutingReason(selected.contactRouting)}</p>
        </div>
      </article><p>{selected.publicFacts?.originalDateLabel}</p><p>{selected.publicFacts?.sourceAccessNotice}</p>
        <a className="underline" href={selected.canonicalUrl} target="_blank" rel="noreferrer">{text('查看原始來源')}</a>
        <button className="min-h-12 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white" onClick={() => navigate('/chat?source=' + selected.id)}>{text('聯絡賣家')}</button>
      </>}
    </div></div>
  </main>;
}
