import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import { isUuid } from '../lib/listingBatch';
import { getDisplayLocale } from '../utils/localization';
import MarketplaceDialog from './MarketplaceDialog';

type Product = { kind: 'listing' | 'source' | 'external'; id: string; title: string };
type Pending = { kind: Product['kind']; productId: string; wishlistId: number; clientRequestId: string };
type Saved = { productKey: string; itemId: number; wishlistId: number };
type List = { id: number; title: string; isPublic: boolean; remaining: number };
type State = { lists: List[]; saved: Saved[] };
const say = (zh: string, en: string) => getDisplayLocale().startsWith('zh') ? zh : en;
const Context = createContext<{ saved: Saved[]; busy: boolean; add: (product: Product) => void } | null>(null);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
function parseState(value: unknown): State {
  const r = value as State;
  if (!r || !Array.isArray(r.lists) || !Array.isArray(r.saved) || r.lists.some(l => !integer(l.id) || typeof l.title !== 'string' || typeof l.isPublic !== 'boolean' || !Number.isSafeInteger(l.remaining) || l.remaining < 0) ||
    r.saved.some(s => !/^(listing|source|external):[a-f0-9-]{36}$/.test(s.productKey) || !integer(s.itemId) || !integer(s.wishlistId))) throw Error('Invalid product wish state');
  return r;
}
function readPending(key: string): Pending | null {
  const raw = localStorage.getItem(key); if (!raw) return null;
  const p = JSON.parse(raw) as Pending;
  if (!['listing', 'source', 'external'].includes(p.kind) || !isUuid(p.productId) || !isUuid(p.clientRequestId) || !integer(p.wishlistId)) throw Error('Invalid pending wish');
  return p;
}
export function ProductWishProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  if (!token || !user) return <>{children}</>;
  return <OwnerWishes key={`${user.id}:${token}`} token={token} userId={user.id}>{children}</OwnerWishes>;
}
function OwnerWishes({ token, userId, children }: { token: string; userId: number; children: ReactNode }) {
  const [state, setState] = useState<State>({ lists: [], saved: [] }), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState<Saved | null>(null), [choice, setChoice] = useState<Product | null>(null), [pending, setPending] = useState<Pending | null>(null);
  const active = useRef(true), gate = useRef(false), request = useRef<AbortController | null>(null);
  const scope = `wishlist-product-wish:${marketplaceOrigin()}:${userId}`, pendingKey = scope + ':pending', destinationKey = scope + ':destination';
  async function load(clearError = true) {
    if (clearError) setError(''); const controller = new AbortController(); request.current?.abort(); request.current = controller;
    try { const next = parseState(await api<unknown>(token, '/product-wishes', { signal: controller.signal })); if (active.current && !controller.signal.aborted) { setState(next); setReady(true); } }
    catch { if (active.current && !controller.signal.aborted) setError(say('願望清單尚未讀取，請重新核對。', 'Wishlists could not be read. Check again.')); }
  }
  async function accept(value: unknown, operation: Pending) {
    const r = value as Saved & { clientRequestId: string; deleted: boolean };
    if (!r || r.clientRequestId !== operation.clientRequestId || r.productKey !== operation.kind + ':' + operation.productId || !integer(r.wishlistId) || typeof r.deleted !== 'boolean' ||
      !(r.deleted ? r.itemId === null : integer(r.itemId))) throw Error('Wish receipt mismatch');
    if (!active.current) return;
    const current = readPending(pendingKey);
    if (current?.clientRequestId === operation.clientRequestId) localStorage.removeItem(pendingKey);
    setPending(null);
    if (!r.deleted) { setState(s => ({ ...s, lists: s.lists.map(l => l.id === r.wishlistId && !s.saved.some(x => x.productKey === r.productKey) ? { ...l, remaining: Math.max(0, l.remaining - 1) } : l), saved: [...s.saved.filter(x => x.productKey !== r.productKey), r] })); setNotice(r); }
    else setError(say('原願望曾建立，後來已移除；這次沒有重新建立。', 'The original wish was created and later removed; it has not been recreated.'));
  }
  async function check(operation: Pending) {
    if (gate.current) return; gate.current = true; setBusy(true); setError('');
    try { await accept(await api<unknown>(token, '/product-wishes/receipts/' + operation.clientRequestId), operation); }
    catch { if (active.current) setError(say('加入結果尚未確認。可查核原操作或重試同一次加入，不會另建重複願望。', 'The result is unconfirmed. Check or retry the same operation without creating a duplicate.')); }
    finally { gate.current = false; if (active.current) setBusy(false); }
  }
  async function submit(operation: Pending) {
    if (gate.current) return;
    gate.current = true; setBusy(true); setError(''); setChoice(null);
    try {
      const current = readPending(pendingKey);
      if (current && current.clientRequestId !== operation.clientRequestId) { setPending(current); throw Error('Another pending operation'); }
      localStorage.setItem(pendingKey, JSON.stringify(operation)); setPending(operation);
      await accept(await api<unknown>(token, '/product-wishes', { method: 'POST', body: JSON.stringify(operation) }), operation);
      localStorage.setItem(destinationKey, String(operation.wishlistId));
    } catch (failure) {
      if (!active.current) return;
      if (failure instanceof ApiFailure && [400, 403, 404, 409].includes(failure.status)) {
        const current = readPending(pendingKey);
        if (current?.clientRequestId === operation.clientRequestId) localStorage.removeItem(pendingKey);
        setPending(null);
        setError(failure.code === 'WISHLIST_FULL' ? say('這份願望清單已滿，請選擇另一份。', 'This wishlist is full. Choose another list.') : say('商品或清單狀態已變更，請重新核對。', 'The product or wishlist has changed. Check again.'));
        void load(false);
      } else setError(say('加入結果尚未確認；請查核原操作，或明確重試同一次加入。', 'The result is unconfirmed. Check or explicitly retry the original operation.'));
    } finally { gate.current = false; if (active.current) setBusy(false); }
  }
  useEffect(() => {
    active.current = true; void load();
    try { const p = readPending(pendingKey); if (p) { setPending(p); void check(p); } } catch { setError(say('願望暫存無法讀取；請先在願望清單核對。', 'Pending wish data cannot be read. Check your wishlists first.')); }
    return () => { active.current = false; request.current?.abort(); };
  }, []);
  function add(product: Product) {
    if (gate.current) return;
    const saved = state.saved.find(s => s.productKey === product.kind + ':' + product.id);
    if (saved) { setNotice(saved); return; }
    if (!ready) { void load(); return; }
    try {
      const p = readPending(pendingKey); if (p) { setPending(p); void check(p); return; }
      const target = state.lists.find(l => String(l.id) === localStorage.getItem(destinationKey));
      if (target && target.remaining > 0) void submit({ kind: product.kind, productId: product.id, wishlistId: target.id, clientRequestId: crypto.randomUUID() });
      else setChoice(product);
    } catch { setError(say('目前無法保存加入紀錄，尚未送出。請檢查瀏覽器儲存空間。', 'The operation could not be saved and was not sent. Check browser storage.')); }
  }
  return <Context.Provider value={{ saved: state.saved, busy, add }}>{children}
    {(error || notice || pending) && <div className="my-3 rounded-xl border bg-white p-3 text-sm" role="status">
      {error && <p>{error}</p>}{notice && <p>{say('已加入願望清單。', 'Added to your wishlist.')} <Link className="underline" to={'/wishlists/' + notice.wishlistId}>{say('查看願望', 'View wish')}</Link></p>}
      {pending && <div className="mt-2 flex flex-wrap gap-3"><button disabled={busy} className="min-h-11 underline" onClick={() => void check(pending)}>{say('查核加入結果', 'Check result')}</button><button disabled={busy} className="min-h-11 underline" onClick={() => void submit(pending)}>{say('重試原加入', 'Retry original add')}</button></div>}
      {!pending && error && <button disabled={busy} className="min-h-11 underline" onClick={() => void load()}>{say('重新核對清單', 'Check wishlists again')}</button>}
    </div>}
    {choice && <MarketplaceDialog title={say('加入哪一份願望清單？', 'Choose a wishlist')} onClose={() => setChoice(null)}>
      <div className="space-y-2">{state.lists.map(list => <button key={list.id} disabled={busy || !list.remaining} className="flex min-h-12 w-full items-center justify-between rounded-xl border p-3 text-left disabled:opacity-50" onClick={() => void submit({ kind: choice.kind, productId: choice.id, wishlistId: list.id, clientRequestId: crypto.randomUUID() })}>
        <span>{list.title}<small className="block text-gray-500">{list.isPublic ? say('公開清單', 'Public list') : say('私人清單', 'Private list')}</small></span><span>{list.remaining ? say('加入', 'Add') : say('已滿', 'Full')}</span>
      </button>)}</div>{!state.lists.length && <Link className="underline" to="/wishes">{say('先建立願望清單', 'Create a wishlist first')}</Link>}
      <p className="mt-4 text-sm text-gray-500">{say('記住這次選擇，之後點愛心直接加入同一份清單。', 'Remember this list for one-tap additions next time.')}</p>
    </MarketplaceDialog>}
  </Context.Provider>;
}
export default function ProductWishButton({ product }: { product: Product }) {
  const context = useContext(Context); if (!context) return null;
  const saved = context.saved.some(s => s.productKey === product.kind + ':' + product.id);
  return <button type="button" className="product-wish-heart absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border bg-white/95 text-gray-700 shadow-sm disabled:opacity-50" aria-label={say((saved ? '已加入願望：' : '加入願望清單：') + product.title, (saved ? 'Wish saved: ' : 'Add to wishlist: ') + product.title)} aria-pressed={saved} disabled={context.busy} onClick={event => { event.stopPropagation(); context.add(product); }}>
    <Heart className="h-5 w-5" fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
  </button>;
}
