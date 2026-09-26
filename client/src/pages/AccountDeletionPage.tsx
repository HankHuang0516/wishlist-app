import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import {
  PENDING_DELETION_KEY, abandonDeletion, createPendingDeletion, lookupDeletion,
  parsePendingDeletion, submitDeletion, type DeletionResult, type PendingDeletion,
} from '../lib/accountDeletionWeb';

type Impact = { capturedAt: string; counts: Record<string, number> };

function readInitialJournal(): { pending: PendingDeletion | null; invalid: boolean } {
  try { return { pending: parsePendingDeletion(localStorage.getItem(PENDING_DELETION_KEY), API_URL), invalid: false }; }
  catch { return { pending: null, invalid: true }; }
}

function parseImpact(value: unknown): Impact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('刪除影響盤點無效。');
  const data = value as Record<string, unknown>;
  if (data.version !== 2 || data.previewOnly !== true || data.accountDeleted !== false ||
    typeof data.capturedAt !== 'string' || !Number.isFinite(Date.parse(data.capturedAt)) ||
    !data.counts || typeof data.counts !== 'object' || Array.isArray(data.counts))
    throw new Error('刪除影響盤點無效。');
  const counts = data.counts as Record<string, unknown>;
  for (const key of ['wishlists', 'wishes', 'listings', 'uploadedPhotos', 'messagesAuthored'])
    if (!Number.isSafeInteger(counts[key]) || Number(counts[key]) < 0) throw new Error('刪除影響盤點無效。');
  return { capturedAt: data.capturedAt, counts: counts as Record<string, number> };
}

export default function AccountDeletionPage() {
  const { token, user, logout } = useAuth();
  const [initial] = useState(readInitialJournal);
  const [pending, setPending] = useState<PendingDeletion | null>(initial.pending);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [result, setResult] = useState<DeletionResult | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const operationBusy = useRef(false);
  const foreignPending = !!pending && !!user && user.id !== pending.userId;

  useEffect(() => {
    if (!initial.pending) return;
    if (user && user.id !== initial.pending.userId) {
      setIssue('此瀏覽器保留另一帳號的未確認刪除操作；不會使用目前帳號查詢或建立新刪除，請由原帳號核對。');
      return;
    }
    let live = true;
    operationBusy.current = true;
    setBusy(true);
    void lookupDeletion(initial.pending).then(value => {
      if (!live) return;
      setResult(value);
      if (value.kind === 'unconfirmed') setIssue('原刪除操作的結果仍未確認；不會自動重送刪除。');
      operationBusy.current = false;
      setBusy(false);
    });
    return () => { live = false; };
  }, [initial, user]);

  useEffect(() => {
    if (initial.pending || initial.invalid || !token || !user) return;
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/users/me/deletion-impact`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        if (!response.ok) throw new Error('無法取得本人刪除影響盤點；沒有送出刪除。');
        const value = parseImpact(await response.json());
        if (live) setImpact(value);
      } catch { if (live) setIssue('無法取得本人刪除影響盤點；沒有送出刪除。請稍後重新載入。'); }
    })();
    return () => { live = false; };
  }, [initial, token, user]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationBusy.current || initial.invalid || pending || !impact || !token || !user || !password || confirmation !== '刪除帳號') return;
    if (!window.confirm('永久刪除目前本人帳號？願望、刊登與本人訊息將無法復原；照片清理可能需要後續處理。')) return;
    operationBusy.current = true;
    setBusy(true); setIssue('');
    try {
      const profile = await fetch(`${API_URL}/users/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!profile.ok || (await profile.json()).id !== user.id) throw new Error('登入帳號已改變；沒有送出刪除。');
      const journal = createPendingDeletion(API_URL, user.id, token);
      // Storage must succeed before the irreversible request. Never store the password.
      localStorage.setItem(PENDING_DELETION_KEY, JSON.stringify(journal));
      setPending(journal);
      const exactPassword = password;
      setPassword(''); setConfirmation('');
      const settled = await submitDeletion(journal, exactPassword);
      setResult(settled);
      if (settled.kind === 'unconfirmed') setIssue('尚未確認刪除結果；原操作已保存。請查詢結果，或讓伺服器確認放棄後再重試。');
    } catch (failure) { setIssue(failure instanceof Error ? failure.message : '尚未送出新的刪除操作。'); }
    finally { operationBusy.current = false; setBusy(false); }
  }

  async function check() {
    if (!pending || operationBusy.current || foreignPending) return;
    operationBusy.current = true;
    setBusy(true); setIssue('');
    const settled = await lookupDeletion(pending);
    setResult(settled);
    if (settled.kind === 'unconfirmed') setIssue('結果仍未確認；不會將登入失效或找不到收據當成成功。');
    operationBusy.current = false;
    setBusy(false);
  }

  async function abandon() {
    if (!pending || operationBusy.current || foreignPending || !window.confirm('只放棄尚未成立的原操作？若帳號已刪除，此動作不會復原帳號。')) return;
    operationBusy.current = true;
    setBusy(true); setIssue('');
    const settled = await abandonDeletion(pending);
    setResult(settled);
    if (settled.kind === 'unconfirmed') setIssue('伺服器尚未確認放棄，原操作仍保留；不能安全建立新刪除。');
    operationBusy.current = false;
    setBusy(false);
  }

  function finish() {
    if (result?.kind !== 'confirmed' || foreignPending) return;
    try { localStorage.removeItem(PENDING_DELETION_KEY); }
    catch { setIssue('刪除結果已確認，但瀏覽器恢復資料尚未清理；請先關閉此分頁。'); return; }
    if (result.ack.state === 'ERASED') logout();
    else { setPending(null); setResult(null); setImpact(null); window.location.reload(); }
  }

  return <div className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-9">
    <header className="space-y-2">
      <p className="text-sm font-semibold text-rose-700">Weesh / Wishlist.ai · Account deletion</p>
      <h1 className="text-3xl font-semibold tracking-tight">刪除 Weesh（Wishlist.ai）帳號與相關資料</h1>
      <p className="text-sm text-gray-600">不需要重新安裝 App；可在此網頁登入後提出刪除。此操作只處理目前登入的本人帳號。</p>
    </header>
    <div className="space-y-2 rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
      <p>帳號、本人願望與刊登、本人發送的訊息將依後台刪除流程處理；共享聊天室會封存，對方自有訊息不因你的要求而刪除。</p>
      <p>商品照片與舊資產可能由背景工作後續清理；「帳號已刪除」不代表照片或備份已即時清空。若有透過商店購買的訂閱，請另至購買平台確認取消。</p>
      <p>更多資訊請閱讀 <Link to="/privacy" className="underline">隱私權政策</Link>。</p>
    </div>
    {initial.invalid && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">原刪除操作的本機紀錄無法安全讀取。為避免重複送出，這個分頁不會建立新操作；請透過網站意見回饋聯絡支援核對。</p>}
    {!!issue && !initial.invalid && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{issue}</p>}
    {!initial.invalid && pending ? <section className="space-y-4">
      <h2 className="text-xl font-semibold">原刪除操作</h2>
      <p className="break-all text-xs text-gray-600">操作識別碼：{pending.clientActionId}</p>
      {result?.kind === 'confirmed' && result.ack.state === 'ERASED' ? <div role="status" className="space-y-2 rounded-xl bg-emerald-50 p-4 text-emerald-900">
        <p className="font-semibold">伺服器已確認帳號刪除。</p>
        <p>商品照片待清理：{result.ack.photoCleanupPending}；舊資產待核對／清理：{result.ack.legacyCleanupPending}。這不是實體資產或備份全數清除證明。</p>
      </div> : result?.kind === 'confirmed' ? <p role="status" className="rounded-xl bg-blue-50 p-4">伺服器已確認放棄原操作；帳號未刪除。</p> :
        <p>尚未取得成功或放棄的伺服器收據。重開瀏覽器只會查詢，不會自動重送刪除。</p>}
      {!foreignPending && <div className="flex flex-wrap gap-3">
        {result?.kind !== 'confirmed' && <>
          <button type="button" disabled={busy} onClick={() => void check()} className="rounded-xl border px-4 py-3 disabled:opacity-50">只查詢原操作結果</button>
          <button type="button" disabled={busy} onClick={() => void abandon()} className="rounded-xl border px-4 py-3 disabled:opacity-50">安全放棄尚未成立的操作</button>
        </>}
        {result?.kind === 'confirmed' && <button type="button" onClick={finish} className="rounded-xl bg-gray-900 px-4 py-3 text-white">{result.ack.state === 'ERASED' ? '完成並登出' : '返回刪除表單'}</button>}
      </div>}
    </section> : !initial.invalid && (!token || !user) ? <section className="space-y-3">
      <p>請先以原帳號登入，再在此頁確認刪除影響並提出要求。若忘記密碼，可先使用網頁密碼重設；不需透過 App。</p>
      <div className="flex flex-wrap gap-3"><Link className="rounded-xl bg-gray-900 px-4 py-3 text-white" to="/login?next=%2Faccount-deletion">登入後繼續</Link><Link className="rounded-xl border px-4 py-3" to="/forgot-password">重設密碼</Link></div>
    </section> : !initial.invalid && <section className="space-y-4">
      <h2 className="text-xl font-semibold">本人資料影響盤點</h2>
      {impact ? <div className="rounded-xl bg-gray-50 p-4 text-sm">
        <p>唯讀盤點時間：{new Date(impact.capturedAt).toLocaleString('zh-TW')}；數量可能重疊且會變動，尚未刪除。</p>
        <p>願望清單 {impact.counts.wishlists}、願望 {impact.counts.wishes}、刊登 {impact.counts.listings}、商品照片 {impact.counts.uploadedPhotos}、本人訊息 {impact.counts.messagesAuthored}。</p>
      </div> : <p>尚未取得有效盤點，不可送出刪除。</p>}
      <form onSubmit={(event) => void send(event)} className="space-y-4">
        <label className="block text-sm font-medium">目前密碼<input aria-label="刪除帳號的目前密碼" type="password" autoComplete="current-password" maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 block w-full rounded-xl border px-4 py-3" /></label>
        <label className="block text-sm font-medium">輸入「刪除帳號」確認<input aria-label="輸入刪除帳號以確認" type="text" maxLength={20} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 block w-full rounded-xl border px-4 py-3" /></label>
        <button type="submit" disabled={busy || !impact || !password || confirmation !== '刪除帳號'} className="w-full rounded-xl bg-rose-700 px-4 py-3 font-semibold text-white disabled:opacity-50">永久刪除本人帳號</button>
      </form>
    </section>}
  </div>;
}
