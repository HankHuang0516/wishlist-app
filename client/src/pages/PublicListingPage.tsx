import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Share2 } from 'lucide-react';
import { API_URL } from '../config';

type PublicListing = {
  id: string; title: string; description: string | null; price: string | number | null;
  condition: 'NEW' | 'USED'; status: 'ACTIVE' | 'RESERVED';
  expiresAt: string | null; owner: { name: string | null };
  location: { county: string; district: string } | null;
  media: { id: string }[];
};
const listingId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function PublicListingPage() {
  const { id } = useParams();
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [shareNotice, setShareNotice] = useState('');
  useEffect(() => {
    if (!id || !listingId.test(id)) { setState('unavailable'); return; }
    const controller = new AbortController();
    setState('loading');
    void fetch(`${API_URL}/listings/${id}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.status === 404) { setState('unavailable'); return; }
        if (!response.ok) throw new Error('LISTING_FETCH_FAILED');
        const row = await response.json() as PublicListing;
        if (row.id !== id || !['ACTIVE', 'RESERVED'].includes(row.status) ||
            !row.expiresAt || Date.parse(row.expiresAt) <= Date.now()) { setState('unavailable'); return; }
        setListing(row); setState('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [id]);

  async function share() {
    if (!listing) return;
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: listing.title, url });
      else { await navigator.clipboard.writeText(url); setShareNotice('連結已複製'); }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareNotice('無法分享，請稍後重試。');
    }
  }

  if (state === 'loading') return <p role="status" className="py-16 text-center text-stone-600">正在載入商品…</p>;
  if (state === 'error') return <div role="alert" className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">暫時無法載入商品</h1><p className="mt-3 text-stone-600">請稍後再試。</p></div>;
  if (state === 'unavailable' || !listing) return <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">商品已停止刊登或連結無效</h1>
    <p className="mt-3 text-stone-600">這件商品目前不對外公開；如需確認，請聯絡原刊登者。</p>
    <Link className="mt-6 inline-block text-blue-700 underline" to="/">回首頁</Link></div>;

  const price = Number(listing.price);
  return <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
    {listing.media[0] && <img className="aspect-square w-full bg-stone-100 object-contain sm:aspect-video" src={`${API_URL}/listing-media/${listing.media[0].id}/image`} alt={`${listing.title}商品照片`} />}
    <div className="space-y-5 p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
        <span className="rounded-full bg-stone-100 px-3 py-1">{listing.condition === 'USED' ? '二手' : '新品'}</span>
        {listing.status === 'RESERVED' && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">已保留</span>}
      </div>
      <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">{listing.title}</h1>
      <p className="text-2xl font-semibold text-blue-700">{listing.price === null ? '洽詢售價' : price === 0 ? '免費贈送' : `NT$ ${new Intl.NumberFormat('zh-TW').format(price)}`}</p>
      {listing.location && <p className="flex items-center gap-2 text-stone-600"><MapPin className="h-4 w-4" aria-hidden="true" />{listing.location.county}{listing.location.district}（約略地區）</p>}
      {listing.description && <section><h2 className="font-semibold">商品說明</h2><p className="mt-2 whitespace-pre-wrap break-words text-stone-700">{listing.description}</p></section>}
      <p className="text-sm text-stone-500">刊登者：{listing.owner?.name || '用戶'}</p>
      <button type="button" onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 text-white"><Share2 className="h-4 w-4" aria-hidden="true" />分享商品</button>
      {shareNotice && <p role="status" className="text-sm text-stone-600">{shareNotice}</p>}
    </div>
  </article>;
}
