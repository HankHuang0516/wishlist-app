import { useEffect, useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { wishShareLines, wishSharePath, withShareUrl, type SharedWishFields } from '../../../mobile/shared/shareText';
import { api } from '../lib/marketplaceApi';
import { getDisplayLocale } from '../utils/localization';
import MarketplaceDialog from './MarketplaceDialog';
import { shareLocale, useShareText, type ShareContent } from '../lib/useShareText';

const say = (zh: string, en: string) => getDisplayLocale().startsWith('zh') ? zh : en;
const button = 'inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 disabled:opacity-50';

/** Sharing one wish, as the app does it: the owner first sees exactly what will be sent — the wish's name and budget,
 *  then the address of its shared page — and only then shares or copies it. The address comes from the server, which
 *  gives it to the owner alone. */
export default function WishShareDialog({ token, wish, onClose }: { token: string; wish: { id: number } & SharedWishFields; onClose: () => void }) {
  // The answer to one request for the address; a retry is a new request, and until it answers there is none.
  const [answer, setAnswer] = useState<{ attempt: number; path: string | null } | null>(null), [attempt, setAttempt] = useState(0);
  const share = useShareText(), current = answer?.attempt === attempt ? answer : null, failed = !!current && !current.path;
  const content: ShareContent | null = current?.path ? { title: wish.name, lines: wishShareLines(wish, shareLocale()), url: new URL(current.path, window.location.origin).toString() } : null;
  useEffect(() => {
    const controller = new AbortController();
    void api<unknown>(token, `/native-wishes/items/${wish.id}/share-link`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) })
      .then(raw => { if (!controller.signal.aborted) setAnswer({ attempt, path: wishSharePath(raw) }); })
      .catch(() => { if (!controller.signal.aborted) setAnswer({ attempt, path: null }); });
    return () => controller.abort();
  }, [token, wish.id, attempt]);
  return <MarketplaceDialog title={say('分享這個願望', 'Share this wish')} closeLabel={say('關閉', 'Close')} onClose={onClose}>
    {!content && !failed && <p role="status">{say('正在準備分享連結…', 'Preparing the share link…')}</p>}
    {failed && <div role="alert" className="space-y-3"><p>{say('暫時無法取得分享連結，願望仍保存在清單，請稍後再試。', 'The share link is unavailable for now. Your wish is still saved; try again later.')}</p><button type="button" className={button} onClick={() => setAttempt(value => value + 1)}>{say('重試', 'Retry')}</button></div>}
    {content && <div className="space-y-4">
      <p className="text-sm text-stone-600">{say('收到的人不必登入就能打開連結，只會看到願望的名稱與預算；照片、備註與連結不會分享。', 'Anyone you send this to can open the link without signing in. It shows only the wish’s name and budget; the photo, notes and links are not shared.')}</p>
      <label className="block space-y-2"><span className="block text-sm font-semibold">{say('將分享的文字與連結', 'Text and link to share')}</span>
        <textarea readOnly rows={6} value={withShareUrl(content.lines, content.url)} onFocus={event => event.currentTarget.select()} className="block w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-sm" /></label>
      <div className="flex flex-wrap gap-2">
        {typeof navigator.share === 'function' && <button type="button" className={button + ' border-stone-900 bg-stone-900 text-white'} disabled={share.busy} onClick={() => void share.share(content)}><Share2 className="h-4 w-4" aria-hidden="true" />{say('開啟分享選單', 'Open share menu')}</button>}
        <button type="button" className={button} disabled={share.busy} onClick={() => void share.copy(content)}><Copy className="h-4 w-4" aria-hidden="true" />{say('複製文字與連結', 'Copy text and link')}</button>
      </div>
      {share.notice && <p role="status" className="text-sm text-stone-600">{share.manual ? say('無法自動分享，請選取上方文字手動複製。', 'Automatic sharing is unavailable. Select the text above and copy it.') : share.notice}</p>}
    </div>}
  </MarketplaceDialog>;
}
