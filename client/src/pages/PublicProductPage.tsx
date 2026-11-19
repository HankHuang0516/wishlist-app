import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import DiscoveryProductDetail, { DiscoveryProductActions } from '../components/DiscoveryProductDetail';
import { ProductWishProvider } from '../components/ProductWishButton';
import { useAuth } from '../context/AuthContext';
import { parseDiscovery, type DiscoveryProduct } from '../lib/discovery';
import { api, ApiFailure, publicApi } from '../lib/marketplaceApi';
import { getDisplayLocale } from '../utils/localization';
import './exploreDiscovery.css';

const say = (zh: string, en: string) => getDisplayLocale().startsWith('zh') ? zh : en;
const productId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The page a shared public-source or partner product opens: /products/<kind>/<id>. It shows what Explore's product
// dialog shows, to anyone, signed in or not. A listing has its own page and is sent there.
export default function PublicProductPage() {
  const { kind, id } = useParams(), { token, user } = useAuth();
  if (!id || !productId.test(id) || (kind !== 'listing' && kind !== 'source' && kind !== 'external')) return <Unavailable />;
  if (kind === 'listing') return <Navigate to={'/listings/' + id.toLowerCase()} replace />;
  return <ProductWishProvider><ProductSession key={`${kind}:${id}:${user?.id ?? 'guest'}:${token ?? ''}`} kind={kind} id={id.toLowerCase()} token={token} /></ProductWishProvider>;
}

function Unavailable({ onReload }: { onReload?: () => void }) {
  return <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">{say('商品已停止公開或連結無效', 'This item is no longer public, or the link is invalid')}</h1>
    <p className="mt-3 text-stone-600">{say('公開來源的商品可能已售出、下架或變更。', 'A public-source item may have been sold, withdrawn or changed.')}</p>
    {onReload && <button type="button" onClick={onReload} className="mt-6 min-h-11 rounded-xl border px-4">{say('重新載入商品', 'Reload item')}</button>}
    <Link className="mt-6 block text-blue-700 underline" to="/explore">{say('到探索看看其他商品', 'See other items in Explore')}</Link>
  </div>;
}

function ProductSession({ kind, id, token }: { kind: 'source' | 'external'; id: string; token: string | null }) {
  // The answer to one read; a reload is a new read, and until it answers the page is loading.
  const [answer, setAnswer] = useState<{ attempt: number; state: 'ready' | 'unavailable' | 'error'; item?: DiscoveryProduct; limited?: boolean } | null>(null), [attempt, setAttempt] = useState(0);
  const current = answer?.attempt === attempt ? answer : null, state = current?.state ?? 'loading', item = current?.item ?? null, limited = !!current?.limited;
  useEffect(() => {
    const controller = new AbortController(), path = `/discovery/products/${kind}/${id}`;
    const init = { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) };
    void (token ? api<unknown>(token, path, init) : publicApi<unknown>(path, init)).then(raw => {
      if (controller.signal.aborted) return;
      const product = parseDiscovery(raw).items[0];
      if (!product || product.kind !== kind || product.id !== id) throw new Error('PRODUCT_DATA_INVALID');
      setAnswer({ attempt, state: 'ready', item: product });
    }).catch(failure => {
      if (controller.signal.aborted) return;
      setAnswer({ attempt, state: failure instanceof ApiFailure && failure.status === 404 ? 'unavailable' : 'error', limited: failure instanceof ApiFailure && failure.status === 429 });
    });
    return () => controller.abort();
  }, [kind, id, token, attempt]);
  const reload = () => setAttempt(value => value + 1);

  if (state === 'loading') return <p role="status" className="py-16 text-center text-stone-600">{say('正在載入商品…', 'Loading item…')}</p>;
  if (state === 'error') return <div role="alert" className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">{say('暫時無法載入商品', 'The item could not be loaded')}</h1>
    <p className="mt-3 text-stone-600">{limited ? say('請求暫時受限，請稍後再讀取；不代表商品已停止公開。', 'Requests are limited for now. Try again later; the item may still be public.') : say('請稍後再試。', 'Try again later.')}</p>
    <button type="button" className="mt-3 min-h-11 rounded-xl border px-4" onClick={reload}>{say('重新載入商品', 'Reload item')}</button>
  </div>;
  if (state === 'unavailable' || !item) return <Unavailable onReload={reload} />;
  return <article className="mx-auto max-w-4xl space-y-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
    <h1 className="text-xl font-semibold text-stone-900">{say('商品詳情', 'Item details')}</h1>
    <DiscoveryProductDetail key={item.key} item={item} />
    <div className="border-t border-stone-100 pt-4"><DiscoveryProductActions item={item} /></div>
    <Link className="inline-flex min-h-11 items-center text-blue-800 underline" to="/explore">{say('到探索看更多商品', 'See more items in Explore')}</Link>
  </article>;
}
