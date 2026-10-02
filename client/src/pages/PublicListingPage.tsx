import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Share2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { parsePublicListing, type PublicListing } from '../lib/listingSearch';
import { ApiFailure, publicApi } from '../lib/marketplaceApi';
import { publicListingText as text, publicListingPhotoLabel, publicListingPrice, publicListingTime, type PublicListingCopyKey } from '../lib/publicListingCopy';
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
  const listingRef = useRef(listing);
  listingRef.current = listing;
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [shareNotice, setShareNotice] = useState<PublicListingCopyKey | ''>(''), [report, setReport] = useState(false), [attempt, setAttempt] = useState(0);
  const [readLimited, setReadLimited] = useState(false), [sharing, setSharing] = useState(false);
  const [manualShareVisible, setManualShareVisible] = useState(false);
  const shareGate = useRef(false);
  const shareUrl = listing ? new URL(`/listings/${listing.id}?v=${listing.version}`, window.location.origin).toString() : '';
  const shareDetails = listing ? `${listing.title}｜${publicListingPrice(listing.price)}` : '';
  const shareText = `${shareDetails}\n${shareUrl}`;
  useEffect(() => {
    if (!id || !listingId.test(id)) { setState('unavailable'); return; }
    const controller = new AbortController();
    setState('loading'); setReadLimited(false); setManualShareVisible(false); setShareNotice(''); setReport(false); setListing(null);
    void publicApi<unknown>(`/listings/${id}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) })
      .then(row => {
        if (controller.signal.aborted) return;
        const item = parsePublicListing(row, marketplaceOrigin(), import.meta.env.DEV);
        const version = (row as { version?: unknown }).version;
        if (item.id !== id || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1 || version > 2147483647) throw new Error('LISTING_DATA_INVALID');
        if (controller.signal.aborted) return;
        if (Date.parse(item.expiresAt) <= Date.now()) { setState('unavailable'); return; }
        setListing({ ...item, version }); setState('ready');
      })
      .catch(failure => { if (!controller.signal.aborted) {
        setReadLimited(failure instanceof ApiFailure && failure.status === 429);
        setState(failure instanceof ApiFailure && failure.status === 404 ? 'unavailable' : 'error');
      } });
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => {
    // Keep one foreground listener from mount. Reading the current render via
    // a ref avoids the old null closure between the ready render and its next
    // passive effect, when a foreground event could otherwise be missed.
    const check = () => { const current = listingRef.current;
      if (current && Date.parse(current.expiresAt) <= Date.now()) { setReport(false); setListing(null); setState('unavailable'); } };
    const timer = window.setInterval(check, 30_000); document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);

  function reloadItem() {
    if (shareGate.current) return;
    setAttempt(value => value + 1);
  }
  function toggleManualShare() {
    if (shareGate.current) return;
    if (!listing || Date.parse(listing.expiresAt) <= Date.now()) { setShareNotice('商品已失效，請重新載入核對。'); return; }
    setManualShareVisible(value => !value);
  }

  async function share() {
    if (shareGate.current) return;
    if (!listing || Date.parse(listing.expiresAt) <= Date.now()) { setShareNotice('商品已失效，請重新載入核對。'); return; }
    shareGate.current = true; setSharing(true); setShareNotice('');
    try {
      if (navigator.share) await navigator.share({ title: shareDetails, text: shareDetails, url: shareUrl });
      else { await navigator.clipboard.writeText(shareText); setShareNotice('商品資訊與連結已複製'); }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setManualShareVisible(true); setShareNotice('無法自動分享，請手動複製下方商品資訊與連結。');
    } finally { shareGate.current = false; setSharing(false); }
  }

  if (state === 'loading') return <p role="status" className="py-16 text-center text-stone-600">{text('正在載入商品…')}</p>;
  if (state === 'error') return <div role="alert" className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">{text('暫時無法載入商品')}</h1><p className="mt-3 text-stone-600">{text(readLimited ? '請求暫時受限，請稍後再讀取；不代表商品已停止刊登。' : '請稍後再試。')}</p><button disabled={sharing} className="mt-3 min-h-11 rounded-xl border px-4 disabled:opacity-50" onClick={reloadItem}>{text('重新載入商品')}</button></div>;
  if (state === 'unavailable' || !listing) return <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">{text('商品已停止刊登或連結無效')}</h1>
    <p className="mt-3 text-stone-600">{text('這件商品目前不對外公開；如需確認，請聯絡原刊登者。')}</p>
    <button type="button" disabled={sharing} onClick={reloadItem} className="mt-6 min-h-11 rounded-xl border px-4 disabled:opacity-50">{text('重新載入商品')}</button>
    <Link className="mt-6 inline-block text-blue-700 underline" to="/">{text('回首頁')}</Link></div>;

  return <><article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
    <div className="flex overflow-x-auto">{listing.media.map((photo, index) => <img key={photo.id} className="aspect-square w-full flex-none bg-stone-100 object-contain sm:aspect-video" src={photo.imageUrl} referrerPolicy="no-referrer" alt={publicListingPhotoLabel(listing.title, index + 1)} />)}</div>
    <div className="space-y-5 p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
        <span className="rounded-full bg-stone-100 px-3 py-1">{text(listing.condition === 'USED' ? '二手' : '新品')}</span>
        {listing.status === 'RESERVED' && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">{text('已保留')}</span>}
      </div>
      <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">{listing.title}</h1>
      <p className="text-2xl font-semibold text-blue-700">{publicListingPrice(listing.price)}</p>
      {listing.location && <p className="flex items-center gap-2 text-stone-600"><MapPin className="h-4 w-4" aria-hidden="true" />{listing.location.county}{listing.location.district}{text('（約略地區）')}</p>}
      {listing.description && <section><h2 className="font-semibold">{text('商品說明')}</h2><p className="mt-2 whitespace-pre-wrap break-words text-stone-700">{listing.description}</p></section>}
      <p className="text-sm text-stone-500">{text('刊登者：')}{listing.owner?.name || text('用戶')}</p>
      <dl className="space-y-2 text-sm"><div><dt className="inline font-semibold">{text('品牌：')}</dt><dd className="inline">{listing.brand ?? text('未提供')}</dd></div><div><dt className="inline font-semibold">{text('交付：')}</dt><dd className="inline">{listing.deliveryMethods.map(method => text(method === 'MEETUP' ? '面交' : '寄送')).join(' / ')} · {text(listing.negotiable ? '可議價' : '不議價')}</dd></div><div><dt className="inline font-semibold">{text('失效時間：')}</dt><dd className="inline">{publicListingTime(listing.expiresAt)}{text('（台灣時間）')}</dd></div></dl>
      <ProductActionsWeb listing={listing} onReport={() => setReport(true)} />
      <Link to={`/explore?listing=${listing.id}`} className="inline-flex min-h-11 items-center rounded-xl border px-4">{text('在探索地圖定位此商品')}</Link>
      <button type="button" disabled={sharing} onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 text-white disabled:opacity-50"><Share2 className="h-4 w-4" aria-hidden="true" />{text(sharing ? '正在分享…' : '分享商品')}</button>
      <button type="button" disabled={sharing} onClick={toggleManualShare} className="inline-flex min-h-11 items-center rounded-xl border px-4 disabled:opacity-50">{text(manualShareVisible ? '收合分享文字' : '顯示分享文字與連結')}</button>
      <button type="button" disabled={sharing} onClick={reloadItem} className="inline-flex min-h-11 items-center rounded-xl border px-4 disabled:opacity-50">{text('重新載入商品')}</button>
      {shareNotice && <p role="status" className="text-sm text-stone-600">{text(shareNotice)}</p>}
      {manualShareVisible && <label className="block space-y-2">
        <span className="block text-sm font-semibold">{text('商品分享文字與連結')}</span>
        <textarea aria-label={text('商品分享文字與連結')} readOnly rows={4} value={shareText} className="block w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-sm" />
        <span className="block text-sm text-stone-600">{text('選取並複製文字，再貼到您要分享的地方。')}</span>
      </label>}
    </div>
  </article>{report && token && userId && <ListingReportWeb key={`${userId}:${token}:${listing.id}`} token={token} userId={userId} listing={{ id: listing.id, title: listing.title, available: Date.parse(listing.expiresAt) > Date.now() }} onClose={() => setReport(false)} />}</>;
}
