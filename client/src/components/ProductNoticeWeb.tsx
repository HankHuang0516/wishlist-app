import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getFullApiUrl } from '../config';
import { getDisplayLocale } from '../utils/localization';
import { hasProductNoticeAck, productNoticeBody, PRODUCT_NOTICE_KEY } from '../lib/productNotice';
import { useProductNoticeVisit } from '../context/ProductNoticeVisitContext';

export default function ProductNoticeWeb({ disabled = false }: { disabled?: boolean }) {
  const api = getFullApiUrl(), local = import.meta.env.DEV;
  let body: string | null = null;
  try { body = productNoticeBody(api, local); } catch { /* Invalid services cannot share an acknowledgement. */ }
  return <ProductNotice key={body ?? api} api={api} local={local} body={body} disabled={disabled}/>;
}

// The Weesh → Wishlist.ai explanation is one line under the sign-in and registration forms, closed until
// someone opens it, so it never stands between a visitor and the fields. Until this browser (or this visit)
// has acknowledged it, the line carries a marker; afterwards it stays there, quieter, and can be reopened.
function ProductNotice({ api, local, body, disabled }: { api: string; local: boolean; body: string | null; disabled: boolean }) {
  const visit = useProductNoticeVisit();
  // The browser owns whether the line is open; this only closes it again after an answer.
  const details = useRef<HTMLDetailsElement>(null);
  const close = () => { if (details.current) details.current.open = false; };
  const [acknowledged, setAcknowledged] = useState(() => {
    if (body !== null && visit?.body === body) return true;
    try { return hasProductNoticeAck(localStorage.getItem(PRODUCT_NOTICE_KEY), api, local); }
    catch { return false; }
  });
  const [storageIssue, setStorageIssue] = useState(false);
  const chinese = getDisplayLocale().startsWith('zh');
  function acknowledge() {
    if (disabled) return;
    try {
      if (body === null) throw new Error('Invalid notice service');
      localStorage.setItem(PRODUCT_NOTICE_KEY, body);
      if (localStorage.getItem(PRODUCT_NOTICE_KEY) !== body) throw new Error('Notice persistence unconfirmed');
      visit?.acknowledge(body);
      setStorageIssue(false); setAcknowledged(true); close();
    } catch { setStorageIssue(true); }
  }
  function continueForVisit() {
    if (disabled) return;
    if (body !== null) visit?.acknowledge(body);
    setStorageIssue(false); setAcknowledged(true); close();
  }
  const action = 'min-h-11 rounded-md border border-muji-border bg-white px-3 text-sm font-medium hover:bg-muji-bg disabled:opacity-50';
  return <details ref={details} className="group mt-2 text-sm">
    <summary className={'mx-auto flex min-h-11 w-fit max-w-full cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-xs hover:text-muji-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muji-primary [&::-webkit-details-marker]:hidden ' + (acknowledged ? 'text-gray-600' : 'font-medium text-muji-primary')}>
      {!acknowledged && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-muji-accent"/>}
      <span>{chinese ? 'Weesh → Wishlist.ai：帳號與資料說明' : 'Weesh → Wishlist.ai: accounts and data'}</span>
      {!acknowledged && <span className="sr-only">{chinese ? '（尚未確認）' : ' (not yet acknowledged)'}</span>}
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 group-open:rotate-180"/>
    </summary>
    <div className="space-y-3 rounded-xl border border-muji-border bg-white p-4 text-sm">
      <p>{chinese ? 'Weesh 已改版為 Wishlist.ai，加入附近商品地圖、商品聊天室與面交預約。' : 'Weesh has become Wishlist.ai, with nearby item maps, item chat and meetup appointments.'}</p>
      <p>{chinese ? '新版使用 Wishlist.ai 帳號系統，不會自動匯入舊 Weesh 帳號或資料，也不代表已完成舊資料遷移。已有 Wishlist.ai 帳號請直接登入，既有 Wishlist.ai 願望不需重新建立；沒有帳號再註冊。' : 'Wishlist.ai uses its own account system. Old Weesh accounts and data are not imported automatically, and migration is not confirmed. Sign in with your existing Wishlist.ai account; your existing Wishlist.ai wishes do not need to be recreated. Register if you do not have an account.'}</p>
      <p className="text-gray-600">{chinese ? '確認這份說明不會建立帳號、匯入資料或接受隱私政策與使用條款。瀏覽器只記住說明版本與網站，不含帳號或登入資料；不確認也可以直接使用上方的登入／註冊表單。' : 'Acknowledging this notice does not create an account, import data or accept privacy policy or terms. The browser remembers only the notice revision and service, with no account or sign-in data. You can use the sign-in or registration form above without acknowledging it.'}</p>
      {storageIssue && <p role="status" className="text-amber-800">{chinese ? '無法確認此瀏覽器是否記住說明。可以重試，或這次收合；下次依瀏覽器紀錄再次核對。' : 'The browser could not confirm that it remembered this notice. Retry or collapse it for this visit; future visits recheck the browser record.'}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={acknowledge} className={action}>{chinese ? '我了解，記住這份說明' : 'I understand, remember this notice'}</button>
        {storageIssue && <button type="button" disabled={disabled} onClick={continueForVisit} className={action}>{chinese ? '這次繼續，不記住' : 'Continue for this visit without remembering'}</button>}
      </div>
    </div>
  </details>;
}
