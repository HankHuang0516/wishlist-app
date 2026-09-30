import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Share2 } from 'lucide-react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { listingPrice, parsePublicListing, type PublicListing } from '../lib/listingSearch';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import ProductActionsWeb from '../components/ProductActionsWeb';
import ListingReportWeb from '../components/ListingReportWeb';
const listingId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default function PublicListingPage() {
  const { id } = useParams(), { user, token } = useAuth();
  return <PublicListingSession key={`${id}:${user?.id ?? 'anonymous'}:${token ?? ''}`} id={id} token={token} userId={user?.id ?? null} />;
}
function PublicListingSession({ id, token, userId }: { id?: string; token: string | null; userId: number | null }) {
  const [listing, setListing] = useState<(PublicListing & { version: number }) | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [shareNotice, setShareNotice] = useState(''), [report, setReport] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id || !listingId.test(id)) { setState('unavailable'); return; }
    const controller = new AbortController();
    setState('loading');
    void fetch(`${API_URL}/listings/${id}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) })
      .then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 404) { setState('unavailable'); return; }
        if (!response.ok) throw new Error('LISTING_FETCH_FAILED');
        const row = await response.json();
        const item = parsePublicListing(row, marketplaceOrigin(), import.meta.env.DEV);
        if (item.id !== id || !Number.isSafeInteger(row.version) || row.version < 1 || row.version > 2147483647) throw new Error('LISTING_DATA_INVALID');
        if (controller.signal.aborted) return;
        if (Date.parse(item.expiresAt) <= Date.now()) { setState('unavailable'); return; }
        setListing({ ...item, version: row.version }); setState('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => {
    const check = () => { if (listing && Date.parse(listing.expiresAt) <= Date.now()) { setReport(false); setListing(null); setState('unavailable'); } };
    const timer = window.setInterval(check, 30_000); document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [listing]);

  async function share() {
    if (!listing || Date.parse(listing.expiresAt) <= Date.now()) { setShareNotice('商品已失效，請重新載入核對。'); return; }
    const url = new URL(`/listings/${listing.id}`, window.location.origin);
    url.searchParams.set('v', String(listing.version));
    const details = `${listing.title}｜${listingPrice(listing)}`;
    try {
      if (navigator.share) await navigator.share({ title: details, text: details, url: url.toString() });
      else { await navigator.clipboard.writeText(`${details}\n${url}`); setShareNotice('商品資訊與連結已複製'); }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareNotice('無法分享，請稍後重試。');
    }
  }

  if (state === 'loading') return <p role="status" className="py-16 text-center text-stone-600">正在載入商品…</p>;
  if (state === 'error') return <div role="alert" className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">暫時無法載入商品</h1><p className="mt-3 text-stone-600">請稍後再試。</p><button className="mt-3 min-h-11 rounded-xl border px-4" onClick={() => setAttempt(value => value + 1)}>重新載入商品</button></div>;
  if (state === 'unavailable' || !listing) return <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">商品已停止刊登或連結無效</h1>
    <p className="mt-3 text-stone-600">這件商品目前不對外公開；如需確認，請聯絡原刊登者。</p>
    <Link className="mt-6 inline-block text-blue-700 underline" to="/">回首頁</Link></div>;

  return <><article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
    <div className="flex overflow-x-auto">{listing.media.map((photo, index) => <img key={photo.id} className="aspect-square w-full flex-none bg-stone-100 object-contain sm:aspect-video" src={photo.imageUrl} referrerPolicy="no-referrer" alt={`${listing.title}商品照片${index + 1}`} />)}</div>
    <div className="space-y-5 p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
        <span className="rounded-full bg-stone-100 px-3 py-1">{listing.condition === 'USED' ? '二手' : '新品'}</span>
        {listing.status === 'RESERVED' && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">已保留</span>}
      </div>
      <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">{listing.title}</h1>
      <p className="text-2xl font-semibold text-blue-700">{listingPrice(listing)}</p>
      {listing.location && <p className="flex items-center gap-2 text-stone-600"><MapPin className="h-4 w-4" aria-hidden="true" />{listing.location.county}{listing.location.district}（約略地區）</p>}
      {listing.description && <section><h2 className="font-semibold">商品說明</h2><p className="mt-2 whitespace-pre-wrap break-words text-stone-700">{listing.description}</p></section>}
      <p className="text-sm text-stone-500">刊登者：{listing.owner?.name || '用戶'}</p>
      <dl className="space-y-2 text-sm"><div><dt className="inline font-semibold">品牌：</dt><dd className="inline">{listing.brand ?? '未提供'}</dd></div><div><dt className="inline font-semibold">交付：</dt><dd className="inline">{listing.deliveryMethods.map(method => method === 'MEETUP' ? '面交' : '寄送').join('、')} · {listing.negotiable ? '可議價' : '不議價'}</dd></div><div><dt className="inline font-semibold">失效時間：</dt><dd className="inline">{new Date(listing.expiresAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}（台灣時間）</dd></div></dl>
      <ProductActionsWeb listing={listing} onReport={() => setReport(true)} />
      <Link to={`/explore?listing=${listing.id}`} className="inline-flex min-h-11 items-center rounded-xl border px-4">在探索地圖定位此商品</Link>
      <button type="button" onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 text-white"><Share2 className="h-4 w-4" aria-hidden="true" />分享商品</button>
      {shareNotice && <p role="status" className="text-sm text-stone-600">{shareNotice}</p>}
    </div>
  </article>{report && token && userId && <ListingReportWeb key={`${userId}:${token}:${listing.id}`} token={token} userId={userId} listing={{ id: listing.id, title: listing.title, available: Date.parse(listing.expiresAt) > Date.now() }} onClose={() => setReport(false)} />}</>;
}
