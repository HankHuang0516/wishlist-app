import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getFullApiUrl } from '../config';
import { getDisplayLocale } from '../utils/localization';
import { hasProductNoticeAck, productNoticeBody, PRODUCT_NOTICE_KEY } from '../lib/productNotice';

export default function ProductNoticeWeb({ disabled = false }: { disabled?: boolean }) {
  const api = getFullApiUrl(), local = import.meta.env.DEV;
  const [open, setOpen] = useState(() => {
    try { return !hasProductNoticeAck(localStorage.getItem(PRODUCT_NOTICE_KEY), api, local); }
    catch { return true; }
  });
  const [storageIssue, setStorageIssue] = useState(false);
  const chinese = getDisplayLocale().startsWith('zh');
  function acknowledge() {
    if (disabled) return;
    try {
      const body = productNoticeBody(api, local);
      localStorage.setItem(PRODUCT_NOTICE_KEY, body);
      if (localStorage.getItem(PRODUCT_NOTICE_KEY) !== body) throw new Error('Notice persistence unconfirmed');
      setStorageIssue(false); setOpen(false);
    } catch { setStorageIssue(true); }
  }
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="group rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm">
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">{chinese ? 'Weesh → Wishlist.ai：帳號與資料說明' : 'Weesh → Wishlist.ai: accounts and data'}<ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 group-open:rotate-180"/></summary>
    <div className="space-y-3 pb-3">
      <p>{chinese ? 'Weesh 已改版為 Wishlist.ai，加入附近商品地圖、商品聊天室與面交預約。' : 'Weesh has become Wishlist.ai, with nearby item maps, item chat and meetup appointments.'}</p>
      <p>{chinese ? '新版使用 Wishlist.ai 帳號系統，不會自動匯入舊 Weesh 帳號或資料，也不代表已完成舊資料遷移。已有 Wishlist.ai 帳號請直接登入，既有 Wishlist.ai 願望不需重新建立；沒有帳號再註冊。' : 'Wishlist.ai uses its own account system. Old Weesh accounts and data are not imported automatically, and migration is not confirmed. Sign in with your existing Wishlist.ai account; your existing Wishlist.ai wishes do not need to be recreated. Register if you do not have an account.'}</p>
      <p className="text-gray-600">{chinese ? '確認這份說明不會建立帳號、匯入資料或接受隱私政策與使用條款。瀏覽器只記住說明版本與網站，不含帳號或登入資料；你也可直接使用下方原登入／註冊流程。' : 'Acknowledging this notice does not create an account, import data or accept privacy policy or terms. The browser remembers only the notice revision and service, with no account or sign-in data. You can also use the original sign-in or registration form below.'}</p>
      {storageIssue && <p role="status" className="text-amber-800">{chinese ? '無法確認此瀏覽器是否記住說明。可以重試，或這次收合；下次依瀏覽器紀錄再次核對。' : 'The browser could not confirm that it remembered this notice. Retry or collapse it for this visit; future visits recheck the browser record.'}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={acknowledge} className="min-h-11 rounded-md border bg-white px-3">{chinese ? '我了解，記住這份說明' : 'I understand, remember this notice'}</button>
        {storageIssue && <button type="button" disabled={disabled} onClick={() => { setStorageIssue(false); setOpen(false); }} className="min-h-11 rounded-md border bg-white px-3">{chinese ? '這次繼續，不記住' : 'Continue for this visit without remembering'}</button>}
      </div>
    </div>
  </details>;
}
