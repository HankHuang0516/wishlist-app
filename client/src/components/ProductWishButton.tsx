import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import { isUuid } from '../lib/listingBatch';
import { getDisplayLocale } from '../utils/localization';
import MarketplaceDialog from './MarketplaceDialog';
type Product = {
    kind: 'listing' | 'source' | 'external';
    id: string;
    title: string;
};
type Pending = {
    action: 'ADD' | 'REMOVE';
    kind: Product['kind'];
    productId: string;
    wishlistId: number;
    clientRequestId: string;
    expectedItemId?: number;
};
type Saved = {
    productKey: string;
    itemId: number;
    wishlistId: number;
};
type List = {
    id: number;
    title: string;
    isPublic: boolean;
    remaining: number;
};
type State = {
    lists: List[];
    saved: Saved[];
};
type Choice = {
    product: Product;
    action: 'ADD' | 'REMOVE';
    saved?: Saved;
};
const say = (zh: string, en: string) => getDisplayLocale().startsWith('zh') ? zh : en;
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const Context = createContext<{
    saved: Saved[];
    busy: boolean;
    ready: boolean;
    toggle: (p: Product) => void;
} | null>(null);
function parseState(v: unknown): State { const r = v as State; if (!r || !Array.isArray(r.lists) || !Array.isArray(r.saved) || r.lists.some(l => !integer(l.id) || typeof l.title !== 'string' || typeof l.isPublic !== 'boolean' || !Number.isSafeInteger(l.remaining) || l.remaining < 0) || r.saved.some(s => !/^(listing|source|external):[a-f0-9-]{36}$/.test(s.productKey) || !integer(s.itemId) || !integer(s.wishlistId)))
    throw Error('Invalid wish state'); return r; }
function readPending(key: string): Pending | null { const raw = localStorage.getItem(key); if (!raw)
    return null; const p = JSON.parse(raw); p.action ??= 'ADD'; if (!['ADD', 'REMOVE'].includes(p.action) || !['listing', 'source', 'external'].includes(p.kind) || !isUuid(p.productId) || !isUuid(p.clientRequestId) || !integer(p.wishlistId) || p.action === 'REMOVE' && !integer(p.expectedItemId))
    throw Error('Invalid pending wish'); return p; }
export function ProductWishProvider({ children }: {
    children: ReactNode;
}) { const { token, user } = useAuth(); return token && user ? <OwnerWishes key={user.id + ':' + token} token={token} userId={user.id}>{children}</OwnerWishes> : <>{children}</>; }
function OwnerWishes({ token, userId, children }: {
    token: string;
    userId: number;
    children: ReactNode;
}) {
    const [state, setState] = useState<State>({ lists: [], saved: [] }), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState<{
        removed: boolean;
        wishlistId: number;
    } | null>(null), [pending, setPending] = useState<Pending | null>(null), [choice, setChoice] = useState<Choice | null>(null), [selected, setSelected] = useState<number | null>(null);
    const active = useRef(true), gate = useRef(false), request = useRef<AbortController | null>(null), pendingKey = `wishlist-product-wish:${marketplaceOrigin()}:${userId}:pending`;
    async function load(clear = true) { if (clear)
        setError(''); const c = new AbortController(); request.current?.abort(); request.current = c; try {
        const next = parseState(await api(token, '/product-wishes', { signal: c.signal }));
        if (active.current && !c.signal.aborted) {
            setState(next);
            setReady(true);
        }
    }
    catch {
        if (active.current && !c.signal.aborted)
            setError(say('願望清單尚未讀取，請重新核對。', 'Wishlists could not be read. Check again.'));
    } }
    async function accept(value: unknown, op: Pending) { const r = value as Saved & {
        clientRequestId: string;
        deleted: boolean;
        action?: string;
    }; if (!r || r.clientRequestId !== op.clientRequestId || r.productKey !== op.kind + ':' + op.productId || r.wishlistId !== op.wishlistId || (r.action ?? 'ADD') !== op.action || typeof r.deleted !== 'boolean' || !(r.deleted ? r.itemId === null : integer(r.itemId)))
        throw Error('Wish receipt mismatch'); if (!active.current)
        return; if (readPending(pendingKey)?.clientRequestId === op.clientRequestId)
        localStorage.removeItem(pendingKey); setPending(null); if (op.action === 'REMOVE') {
        setState(s => ({ ...s, saved: s.saved.filter(x => x.productKey !== r.productKey), lists: s.lists.map(l => l.id === r.wishlistId ? { ...l, remaining: l.remaining + 1 } : l) }));
        setNotice({ removed: true, wishlistId: r.wishlistId });
    }
    else if (!r.deleted) {
        setState(s => ({ ...s, saved: [...s.saved.filter(x => x.productKey !== r.productKey), r] }));
        setNotice({ removed: false, wishlistId: r.wishlistId });
    }
    else
        setError(say('這次加入已處理，原願望後來已移除；不會重新建立。', 'This add was processed and the wish was later removed; it will not be recreated.')); void load(false); }
    async function check(op: Pending) { if (gate.current)
        return; gate.current = true; setBusy(true); setError(''); try {
        await accept(await api(token, '/product-wishes/receipts/' + op.clientRequestId), op);
    }
    catch {
        if (active.current)
            setError(say('操作結果尚未確認，可查核或重試原操作。', 'The result is unconfirmed. Check or retry the original operation.'));
    }
    finally {
        gate.current = false;
        if (active.current)
            setBusy(false);
    } }
    async function submit(op: Pending) { if (gate.current)
        return; gate.current = true; setBusy(true); setError(''); setNotice(null); setChoice(null); try {
        const old = readPending(pendingKey);
        if (old && old.clientRequestId !== op.clientRequestId) {
            setPending(old);
            throw Error('Pending operation');
        }
        localStorage.setItem(pendingKey, JSON.stringify(op));
        setPending(op);
        await accept(await api(token, '/product-wishes', { method: 'POST', body: JSON.stringify(op) }), op);
    }
    catch (e) {
        if (!active.current)
            return;
        if (e instanceof ApiFailure && [400, 401, 403, 404, 409].includes(e.status)) {
            if (readPending(pendingKey)?.clientRequestId === op.clientRequestId)
                localStorage.removeItem(pendingKey);
            setPending(null);
            setError(e.code === 'WISHLIST_FULL' ? say('這份清單已滿，請選擇另一份。', 'This wishlist is full. Choose another list.') : say('商品或清單已變更，請重新核對。', 'The product or wishlist changed. Check again.'));
            void load(false);
        }
        else
            setError(say('操作結果尚未確認；請查核或重試原操作，不會自動重送。', 'The result is unconfirmed. Check or retry the original operation; it is never automatically repeated.'));
    }
    finally {
        gate.current = false;
        if (active.current)
            setBusy(false);
    } }
    useEffect(() => { active.current = true; void load(); try {
        const p = readPending(pendingKey);
        if (p) {
            setPending(p);
            void check(p);
        }
    }
    catch {
        setError(say('願望暫存無法讀取，請先核對清單。', 'Pending data could not be read. Check your wishlists.'));
    } return () => { active.current = false; request.current?.abort(); }; }, []);
    function operation(c: Choice, id: number): Pending { return { action: c.action, kind: c.product.kind, productId: c.product.id, wishlistId: id, clientRequestId: crypto.randomUUID(), ...(c.action === 'REMOVE' ? { expectedItemId: c.saved!.itemId } : {}) }; }
    function toggle(product: Product) { if (gate.current || !ready)
        return; try {
        const old = readPending(pendingKey);
        if (old) {
            setPending(old);
            void check(old);
            return;
        }
        const saved = state.saved.find(x => x.productKey === product.kind + ':' + product.id), c: Choice = { product, action: saved ? 'REMOVE' : 'ADD', saved };
        setNotice(null);
        if (state.lists.length === 1) {
            if (saved && saved.wishlistId !== state.lists[0].id) {
                void load();
                return;
            }
            void submit(operation(c, state.lists[0].id));
        }
        else {
            setSelected(saved?.wishlistId ?? null);
            setChoice(c);
        }
    }
    catch {
        setError(say('無法保存操作紀錄，尚未送出，請檢查瀏覽器儲存空間。', 'The operation was not sent. Check browser storage.'));
    } }
    return <Context.Provider value={{ saved: state.saved, busy, ready, toggle }}>{children}
 {(error || notice || pending) && <div className="my-3 rounded-xl border bg-white p-3 text-sm" role="status">{error && <p>{error}</p>}{notice && <p>{notice.removed ? say('已從願望清單移除。', 'Removed from wishlist.') : say('已加入願望清單。', 'Added to wishlist.')} <Link className="underline" to={'/wishlists/' + notice.wishlistId}>{say('查看願望', 'View wishlist')}</Link></p>}{pending && <div className="mt-2 flex gap-3"><button disabled={busy} className="min-h-11 underline" onClick={() => void check(pending)}>{say('查核操作結果', 'Check result')}</button><button disabled={busy} className="min-h-11 underline" onClick={() => void submit(pending)}>{say('重試原操作', 'Retry original operation')}</button></div>}{!pending && error && <button disabled={busy} className="min-h-11 underline" onClick={() => void load()}>{say('重新核對清單', 'Check wishlists again')}</button>}</div>}
 {choice && <MarketplaceDialog placement="bottom" title={choice.action === 'ADD' ? say('加入願望清單', 'Add to wishlist') : say('從願望清單移除', 'Remove from wishlist')} closeLabel={say('關閉', 'Close')} onClose={() => setChoice(null)}><p className="mb-4 text-sm text-gray-500">{choice.product.title}</p><fieldset className="space-y-2"><legend className="sr-only">{say('選擇願望清單', 'Choose a wishlist')}</legend>{state.lists.map(l => { const disabled = choice.action === 'REMOVE' ? choice.saved?.wishlistId !== l.id : l.remaining === 0; return <label key={l.id} className={'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 ' + (disabled ? 'opacity-50' : '')}><input type="radio" name="product-wish-destination" value={l.id} checked={selected === l.id} disabled={disabled} onChange={() => setSelected(l.id)}/><span>{l.title}<small className="block text-gray-500">{l.isPublic ? say('公開清單', 'Public list') : say('私人清單', 'Private list')}{disabled ? ' · ' + (choice.action === 'REMOVE' ? say('未加入此清單', 'Not in this list') : say('已滿', 'Full')) : ''}</small></span></label>; })}</fieldset>{!state.lists.length ? <Link className="mt-4 inline-block underline" to="/wishes">{say('先建立願望清單', 'Create a wishlist first')}</Link> : <button className="mt-5 min-h-12 w-full rounded-xl bg-gray-900 px-4 text-white disabled:opacity-40" disabled={!selected || busy} onClick={() => selected && void submit(operation(choice, selected))}>{choice.action === 'ADD' ? say('確認加入', 'Confirm add') : say('確認移除', 'Confirm removal')}</button>}</MarketplaceDialog>}
 </Context.Provider>;
}
export default function ProductWishButton({ product }: {
    product: Product;
}) { const c = useContext(Context); if (!c)
    return <Link to="/login" className="product-wish-heart absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border bg-white/95 text-gray-700 shadow-sm" aria-label={say('登入以加入願望：', 'Sign in to save: ') + product.title}><Heart className="h-5 w-5" aria-hidden="true"/></Link>; const saved = c.saved.some(x => x.productKey === product.kind + ':' + product.id); return <button type="button" className="product-wish-heart absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border bg-white/95 text-gray-700 shadow-sm disabled:opacity-50" aria-label={say(saved ? '已加入願望：' : '加入願望清單：', saved ? 'Wish saved: ' : 'Add to wishlist: ') + product.title} aria-pressed={saved} disabled={c.busy || !c.ready} onClick={e => { e.stopPropagation(); c.toggle(product); }}><Heart className="h-5 w-5" fill={saved ? 'currentColor' : 'none'} aria-hidden="true"/></button>; }
