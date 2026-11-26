import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Gift, Search } from 'lucide-react';
import { parseSharedWish, wishShareBudget, type SharedWishFields } from '../../../mobile/shared/shareText';
import { useAuth } from '../context/AuthContext';
import { ApiFailure, publicApi, withRequestTimeout } from '../lib/marketplaceApi';
import { getDisplayLocale } from '../utils/localization';

const say = (zh: string, en: string) => getDisplayLocale().startsWith('zh') ? zh : en;

// The page a shared wish opens: /shared-wishes/<token>. Anyone holding the address reads it without an account. It
// shows the wish's name and budget — what the share text itself says — and where to go from there. It is read
// without the reader's sign-in, so the answer never depends on who is looking.
export default function SharedWishPage() {
  const { token } = useParams();
  if (!token || !/^[A-Za-z0-9_-]{22}$/.test(token)) return <Unavailable />;
  return <SharedWish key={token} token={token} />;
}

function Unavailable({ onReload }: { onReload?: () => void }) {
  return <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">{say('這個願望已不存在，或連結無效', 'This wish no longer exists, or the link is invalid')}</h1>
    <p className="mt-3 text-stone-600">{say('許願的人可能已經刪除它。', 'Its owner may have deleted it.')}</p>
    {onReload && <button type="button" onClick={onReload} className="mt-6 min-h-11 rounded-xl border px-4">{say('重新載入', 'Reload')}</button>}
    <Link className="mt-6 block text-blue-700 underline" to="/explore">{say('到探索看看商品', 'See items in Explore')}</Link>
  </div>;
}

function SharedWish({ token }: { token: string }) {
  const { user } = useAuth();
  // The answer to one read; a reload is a new read, and until it answers the page is loading.
  const [answer, setAnswer] = useState<{ attempt: number; state: 'ready' | 'unavailable' | 'error'; wish?: SharedWishFields } | null>(null), [attempt, setAttempt] = useState(0);
  const current = answer?.attempt === attempt ? answer : null, state = current?.state ?? 'loading', wish = current?.wish ?? null;
  useEffect(() => {
    const controller = new AbortController();
    void withRequestTimeout(controller.signal, signal => publicApi<unknown>('/shared-wishes/' + token, { signal })).then(raw => {
      if (!controller.signal.aborted) setAnswer({ attempt, state: 'ready', wish: parseSharedWish(raw) });
    }).catch(failure => { if (!controller.signal.aborted) setAnswer({ attempt, state: failure instanceof ApiFailure && failure.status === 404 ? 'unavailable' : 'error' }); });
    return () => controller.abort();
  }, [token, attempt]);
  const reload = () => setAttempt(value => value + 1);

  if (state === 'loading') return <p role="status" className="py-16 text-center text-stone-600">{say('正在載入願望…', 'Loading wish…')}</p>;
  if (state === 'error') return <div role="alert" className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
    <h1 className="text-xl font-bold">{say('暫時無法載入願望', 'The wish could not be loaded')}</h1>
    <p className="mt-3 text-stone-600">{say('請稍後再試。', 'Try again later.')}</p>
    <button type="button" className="mt-3 min-h-11 rounded-xl border px-4" onClick={reload}>{say('重新載入', 'Reload')}</button>
  </div>;
  if (state === 'unavailable' || !wish) return <Unavailable onReload={reload} />;
  const budget = wishShareBudget(wish);
  return <article className="mx-auto max-w-xl space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
    <p className="flex items-center gap-2 text-sm font-medium text-stone-600"><Gift className="h-5 w-5" aria-hidden="true" />{say('有人分享了一個願望', 'Someone shared a wish')}</p>
    <h1 className="break-words text-2xl font-bold text-stone-900 sm:text-3xl">{wish.name}</h1>
    <p className="text-lg text-stone-800">{budget ? say(`預算：${budget}`, `Budget: ${budget}`) : say('沒有設定預算', 'No budget set')}</p>
    <p className="rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-700">{say('如果你剛好有這件物品，或在哪裡看到，直接回覆分享給你的人就可以了。這一頁只顯示願望的名稱與預算。', 'If you have this item or come across it, reply to the person who shared this with you. This page shows only the name and budget of the wish.')}</p>
    <div className="flex flex-wrap gap-3">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-stone-900 px-5 text-white" to={'/explore?' + new URLSearchParams({ q: wish.name.slice(0, 80) })}><Search className="h-4 w-4" aria-hidden="true" />{say('找找符合的商品', 'Find matching items')}</Link>
      <Link className="inline-flex min-h-11 items-center rounded-xl border px-5" to={user ? '/wishes' : '/register'}>{user ? say('看我的願望', 'My wishes') : say('我也要許願', 'Make my own wish')}</Link>
    </div>
    <p className="text-xs text-stone-500">Wishlist.ai {say('願望市集', 'wish marketplace')}</p>
  </article>;
}
