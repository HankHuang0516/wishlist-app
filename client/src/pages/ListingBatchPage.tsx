import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ImagePlus, MapPin, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { buildPublishedListing, emptyListingDraft, isUuid, listingCategories, mergeAiDraft, parseAiState, parseSellerDraft, prepareListingUploadFile, sameSellerContent } from '../lib/listingBatch';
import type { AiDraft, AiStatus, ListingDraftForm, ListingField, ListingTouched, PublishDetails } from '../lib/listingBatch';
import { forgetPendingUploads, loadPrivateMediaPages, readPendingUploads, reconcilePendingUploads, rememberPendingUpload } from '../lib/listingUploadJournal';

type Card = { id: string; clientListingId: string; form: ListingDraftForm; touched: ListingTouched; version: number;
  ai: AiStatus; draft: AiDraft | null; dirty: boolean; saving: boolean; publishing: boolean; published: boolean;
  error: string };
const emptyDetails: PublishDetails = { county: '', district: '', latitude: '', longitude: '', meetup: true, shipping: false, negotiable: false, expiryDate: '', consent: false };
const pendingKey = (userId: number) => `wishlist:listing-pending:${userId}`;
class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code = '') { super(message); this.status = status; this.code = code; }
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, cache: 'no-store', headers: {
    Authorization: `Bearer ${token}`, ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers,
  } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; errorCode?: string };
    throw new ApiFailure(body.error || `操作失敗（${response.status}）`, response.status, body.errorCode);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

function fromMedia(raw: unknown): Card {
  if (!raw || typeof raw !== 'object') throw new Error('私人照片資料不正確');
  const row = raw as Record<string, unknown>;
  if (!isUuid(row.id) || !Number.isSafeInteger(row.sellerDraftVersion) || (row.sellerDraftVersion as number) < 0) throw new Error('私人照片資料不正確');
  const ai = parseAiState({ mediaId: row.id, status: row.aiDraftStatus, draft: row.aiDraft ?? null }, row.id);
  const saved = parseSellerDraft(row.sellerDraft ?? null);
  const touched = saved?.touched ?? {};
  const form = ai.draft ? mergeAiDraft(saved?.form ?? emptyListingDraft(), touched, ai.draft) : saved?.form ?? emptyListingDraft();
  return { id: row.id, clientListingId: saved?.clientListingId ?? crypto.randomUUID(), form, touched,
    version: row.sellerDraftVersion as number, ai: ai.status, draft: ai.draft, dirty: !saved || !sameSellerContent({ form, touched }, saved),
    saving: false, publishing: false, published: false, error: '' };
}

function PrivatePhoto({ id, token }: { id: string; token: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!isUuid(id)) return;
    const controller = new AbortController();
    let objectUrl = '';
    void fetch(`${API_URL}/listing-media/${id}/thumbnail`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('PHOTO_UNAVAILABLE'); return response.blob(); })
      .then(blob => { if (controller.signal.aborted) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch(() => { if (!controller.signal.aborted) setUrl(''); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token]);
  return url ? <img src={url} alt="僅本人可見的商品照片" className="h-32 w-32 rounded-2xl object-cover" />
    : <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-stone-100 text-sm text-stone-500">照片載入中</div>;
}

export default function ListingBatchPage() {
  const { token, user } = useAuth();
  if (!token || !user) return <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm">請先 <Link to="/login" className="text-blue-600 underline">登入</Link> 再刊登商品。</div>;
  // A new account gets a new component instance. Late responses from the
  // previous account cannot populate the replacement account's draft state.
  return <ListingBatchSession key={user.id} token={token} userId={user.id} />;
}

function ListingBatchSession({ token, userId }: { token: string; userId: number }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [details, setDetails] = useState<PublishDetails>(emptyDetails);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState('');
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [unresolvedUploads, setUnresolvedUploads] = useState<string[]>([]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const hasPendingAi = cards.some(card => card.ai === 'PENDING' || card.ai === 'PROCESSING');

  const reload = useCallback(async () => {
    const loadBatch = () => loadPrivateMediaPages(cursor => api<unknown>(token,
      '/listing-media/unused?purpose=BATCH_ITEM' + (cursor ? `&cursor=${cursor}` : '')));
    const [items, availability] = await Promise.all([loadBatch(),
      api<{ available: boolean }>(token, '/listing-media/ai-availability').catch(() => null)]);
    const checked = await reconcilePendingUploads(userId, items,
      id => api<unknown>(token, `/listing-media/by-upload-id/${id}`),
      loadBatch);
    // Private uploads can span multiple 30-item pages. The 12-item limit
    // applies only to new captures, never to owner recovery.
    const recovered = checked.items.slice().reverse().map(fromMedia);
    setCards(old => [...recovered.map(card => old.find(previous => previous.id === card.id && previous.dirty) ?? card),
      ...old.filter(card => card.published || card.dirty && !recovered.some(item => item.id === card.id))]);
    setUnresolvedUploads(checked.unresolved);
    setAiAvailable(typeof availability?.available === 'boolean' ? availability.available : null);
    if (checked.unresolved.length) setMessage(`${checked.unresolved.length} 張照片的上傳結果仍待確認；請先重新確認，勿重傳同張照片。`);
    else setMessage('');
    setReady(true);
  }, [token, userId]);

  useEffect(() => {
    setReady(false); setCards([]); setMessage(''); setUnresolvedUploads([]); setAiAvailable(null);
    setPending(localStorage.getItem(pendingKey(userId)) ?? '');
    void reload().catch(() => setMessage('暫時無法安全恢復私人照片。請稍後重新整理。'));
  }, [token, userId, reload]);

  useEffect(() => {
    if (!token || !ready || !hasPendingAi) return;
    let active = true;
    const timer = window.setInterval(() => {
      for (const card of cardsRef.current.filter(item => item.ai === 'PENDING' || item.ai === 'PROCESSING')) {
        void api<unknown>(token, `/listing-media/${card.id}/ai-draft`).then(raw => {
          const ai = parseAiState(raw, card.id);
          if (!active) return;
          setCards(current => current.map(item => item.id === card.id ? { ...item, ai: ai.status, draft: ai.draft,
            form: ai.draft ? mergeAiDraft(item.form, item.touched, ai.draft) : item.form,
            dirty: item.dirty || !!ai.draft, error: '' } : item));
        }).catch(() => { /* Preserve queue state; seller may retry explicitly. */ });
      }
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, ready, hasPendingAi]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!busy && !pending && !cards.some(card => card.dirty)) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, pending, cards]);

  const replace = (id: string, change: (card: Card) => Card) => setCards(old => old.map(card => card.id === id ? change(card) : card));
  const updateField = (id: string, field: ListingField, value: string) => replace(id, card => ({ ...card,
    form: { ...card.form, [field]: value }, touched: { ...card.touched, [field]: true }, dirty: true, error: '' }));

  async function requestAi(id: string): Promise<boolean> {
    try {
      const state = parseAiState(await api<unknown>(token!, `/listing-media/${id}/ai-draft`, { method: 'POST' }), id);
      replace(id, card => ({ ...card, ai: state.status, draft: state.draft,
        form: state.draft ? mergeAiDraft(card.form, card.touched, state.draft) : card.form,
        dirty: card.dirty || !!state.draft, error: '' }));
      return true;
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'LISTING_AI_UNAVAILABLE') setAiAvailable(false);
      replace(id, card => ({ ...card, error: (error as Error).message }));
      return !(error instanceof ApiFailure && error.code === 'LISTING_AI_UNAVAILABLE');
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !ready || busy || pending || unresolvedUploads.length) return;
    if (cards.filter(card => !card.published).length + files.length > 12) { setMessage('一次最多處理 12 件商品。'); return; }
    setBusy(true); setMessage('');
    let aiCanQueue = aiAvailable !== false;
    try {
      for (const [index, file] of Array.from(files).entries()) {
        let prepared: File;
        try { prepared = await prepareListingUploadFile(file); }
        catch (error) { setMessage(`第 ${index + 1} 張照片無法處理：${(error as Error).message}；後續照片尚未上傳。`); break; }
        const uploadId = crypto.randomUUID();
        const body = new FormData(); body.append('clientUploadId', uploadId); body.append('capturePurpose', 'BATCH_ITEM'); body.append('image', prepared);
        try { rememberPendingUpload(userId!, uploadId); }
        catch { setMessage('無法在此瀏覽器安全記錄上傳進度；照片尚未送出，請確認瀏覽器儲存空間後重試。'); break; }
        try {
          let raw: unknown;
          try { raw = await api<unknown>(token!, '/listing-media', { method: 'POST', body }); }
          catch (failure) {
            // A response can be lost after the private upload commits. Resolve
            // the same idempotency key before inviting a duplicate upload.
            raw = await api<unknown>(token!, `/listing-media/by-upload-id/${uploadId}`).catch(() => { throw failure; });
            const linked = raw as { listingId?: unknown; wishItemId?: unknown };
            if (linked.listingId !== null || linked.wishItemId !== null) throw new Error('照片已被其他操作使用，請重新載入確認');
          }
          const record = raw as { id?: unknown };
          if (!isUuid(record?.id)) throw new Error('照片上傳結果未確認');
          forgetPendingUploads(userId!, [uploadId]);
          const card: Card = { id: record.id, clientListingId: crypto.randomUUID(), form: emptyListingDraft(), touched: {},
            version: 0, ai: 'SKIPPED', draft: null, dirty: true, saving: false, publishing: false, published: false, error: '' };
          setCards(old => old.some(item => item.id === card.id) ? old : [...old, card]);
          if (aiCanQueue) aiCanQueue = await requestAi(record.id);
        } catch (error) {
          setUnresolvedUploads(readPendingUploads(userId!).map(entry => entry.clientUploadId));
          setMessage(`第 ${index + 1} 張照片尚未確認已私密保存：${(error as Error).message}。請先按「重新確認上傳」，不要重傳同張照片。`);
          break;
        }
      }
    } finally { setBusy(false); }
  }

  async function save(card: Card): Promise<boolean> {
    if (card.saving || card.published) return false;
    replace(card.id, current => ({ ...current, saving: true, error: '' }));
    const draft = { clientListingId: card.clientListingId, form: card.form, touched: card.touched };
    try {
      const result = await api<{ mediaId: string; version: number }>(token!, `/listing-media/${card.id}/seller-draft`, {
        method: 'PUT', body: JSON.stringify({ expectedVersion: card.version, draft }) });
      if (result.mediaId !== card.id || result.version !== card.version + 1) throw new Error('私人草稿儲存結果不正確');
      replace(card.id, current => ({ ...current, version: result.version, saving: false,
        dirty: !sameSellerContent(current, card) }));
      return true;
    } catch (error) {
      replace(card.id, current => ({ ...current, saving: false, error: `草稿尚未儲存：${(error as Error).message}` }));
      return false;
    }
  }

  function saveOnBlur(card: Card, event: FocusEvent<HTMLElement>) {
    // Publish/save buttons perform their own flush. Avoid racing a blur save
    // against that explicit action; navigation and moving fields still save.
    if (card.dirty && !(event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('button'))) void save(card);
  }

  async function publish(card: Card) {
    if (busy || pending || card.publishing || card.published || !card.id) return;
    let body: string;
    try { body = JSON.stringify(buildPublishedListing({ clientListingId: card.clientListingId, form: card.form, touched: card.touched }, card.id, details)); }
    catch (error) { replace(card.id, current => ({ ...current, error: (error as Error).message })); return; }
    if (!window.confirm(`確定公開刊登「${card.form.title}」？照片、售價與約略位置將出現在商品地圖。`)) return;
    setBusy(true);
    if (card.dirty && !await save(card)) { setBusy(false); return; }
    // Keep the exact request for an uncertain network outcome. Replaying it
    // uses the server's clientListingId idempotency key, never a new listing.
    localStorage.setItem(pendingKey(userId!), body); setPending(body);
    replace(card.id, current => ({ ...current, publishing: true, error: '' }));
    try {
      const result = await api<{ id: unknown; status: string }>(token!, '/listings', { method: 'POST', body });
      if (!isUuid(result.id) || result.status !== 'ACTIVE') throw new Error('刊登結果尚未確認');
      localStorage.removeItem(pendingKey(userId!)); setPending('');
      replace(card.id, current => ({ ...current, publishing: false, published: true, dirty: false }));
      setMessage('商品已刊登。其他照片仍是私人草稿。');
    } catch (error) {
      if (error instanceof ApiFailure && [400, 403, 422].includes(error.status)) {
        localStorage.removeItem(pendingKey(userId!)); setPending('');
        replace(card.id, current => ({ ...current, publishing: false, error: `未刊登：${error.message}` }));
        setBusy(false);
        return;
      }
      replace(card.id, current => ({ ...current, publishing: false, error: `刊登結果待確認：${(error as Error).message}` }));
      setMessage('請先確認上一筆刊登結果；系統不會用新識別碼重複建立商品。');
    } finally { setBusy(false); }
  }

  async function reconcile() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(pending) as { mediaIds?: string[] };
      const result = await api<{ id: unknown; status: string }>(token!, '/listings', { method: 'POST', body: pending });
      if (!isUuid(result.id) || result.status !== 'ACTIVE') throw new Error('刊登結果尚未確認');
      localStorage.removeItem(pendingKey(userId!)); setPending('');
      setCards(old => old.map(card => parsed.mediaIds?.includes(card.id) ? { ...card, published: true, dirty: false } : card));
      setMessage('前次刊登已確認，不會建立重複商品。');
    } catch (error) { setMessage(`前次刊登仍待確認：${(error as Error).message}`); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (busy || pending || !window.confirm('確定刪除這張尚未刊登的私人商品照片？')) return;
    setBusy(true);
    try { await api<void>(token!, `/listing-media/${id}`, { method: 'DELETE' }); setCards(old => old.filter(card => card.id !== id)); }
    catch (error) { replace(id, card => ({ ...card, error: (error as Error).message })); }
    finally { setBusy(false); }
  }

  function abandonUploadCheck() {
    if (!userId || !unresolvedUploads.length || !window.confirm('僅放棄查詢紀錄，不會刪除後台照片。若上傳稍後完成，重選同張照片可能產生另一份私人草稿；確定繼續？')) return;
    try {
      forgetPendingUploads(userId, unresolvedUploads);
      setUnresolvedUploads([]);
      setMessage('已放棄這次上傳查詢。後台若稍後完成，重新開啟頁面仍可能看到原私人照片；請檢查後再重傳。');
    } catch { setMessage('無法安全清除上傳查詢紀錄，請稍後重試。'); }
  }

  function locate() {
    if (!navigator.geolocation) { setMessage('此瀏覽器無法取得位置；請手動填寫縣市、行政區及座標。'); return; }
    navigator.geolocation.getCurrentPosition(position => {
      setDetails(old => ({ ...old, latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) }));
      setMessage('已取得座標。請再填寫縣市與行政區；公開地圖只顯示約 2 公里網格位置。');
    }, () => setMessage('無法取得位置；可手動填寫座標。'), { enableHighAccuracy: false, timeout: 10000 });
  }

  return <div className="mx-auto max-w-4xl space-y-6 pb-8 text-stone-800">
    <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold tracking-widest text-orange-600">商品刊登 · Beta</p>
      <h1 className="mt-2 text-3xl font-semibold">連拍上架，逐件確認再發布</h1>
      <p className="mt-3 text-sm leading-6 text-stone-600">一次上傳多張商品照，先存成私人草稿；AI 開放時會逐件產生商品資訊與參考價。請確認真實狀況及售價後才公開刊登。</p>
      {aiAvailable === false && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">此帳號的 AI 辨識尚未開放。照片仍可私密上傳、手動填寫並刊登；不會進入 AI 隊列。</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white"><Camera size={18} />拍一件
          <input aria-label="拍一件商品" className="sr-only" type="file" accept="image/*" capture="environment" disabled={!ready || busy || !!pending || !!unresolvedUploads.length || cards.filter(card => !card.published).length >= 12} onChange={event => { void uploadFiles(event.target.files); event.target.value = ''; }} /></label>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-stone-300 px-5 py-3 text-sm font-semibold"><ImagePlus size={18} />批次選照片
          <input aria-label="批次選擇商品照片" className="sr-only" type="file" accept="image/*" multiple disabled={!ready || busy || !!pending || !!unresolvedUploads.length || cards.filter(card => !card.published).length >= 12} onChange={event => { void uploadFiles(event.target.files); event.target.value = ''; }} /></label>
      </div>
      <p className="mt-3 text-xs text-stone-500">可重複拍照；單次最多 12 件。大張照片會先在瀏覽器縮放至 5MB 以下；支援的相片格式依瀏覽器而定。上傳後仍保持私人狀態。</p>
      {cards.filter(card => !card.published).length >= 12 && <p role="status" className="mt-2 text-sm text-amber-800">目前有 {cards.filter(card => !card.published).length} 件私人草稿；請先確認刊登或移除部分照片，再新增商品。</p>}
    </div>

    {pending && <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm"><p className="font-semibold">前次刊登結果尚未確認</p><p className="mt-1">請先查詢同一筆操作，避免重複刊登。</p><button className="mt-3 rounded-xl bg-amber-900 px-4 py-2 text-white" disabled={busy} onClick={() => void reconcile()}>確認前次刊登</button></div>}
    {!!unresolvedUploads.length && <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm">
      <p className="font-semibold">有 {unresolvedUploads.length} 張照片的上傳結果待確認</p>
      <p className="mt-1">照片可能已私密存入後台；在確認前已暫停新上傳，避免同張照片重複建立。</p>
      <button className="mt-3 rounded-xl bg-amber-900 px-4 py-2 text-white" disabled={busy} onClick={() => void reload().catch(() => setMessage('暫時無法確認上傳結果，請稍後重試。'))}>重新確認上傳</button>
      <button className="ml-3 mt-3 rounded-xl border border-amber-900 px-4 py-2 text-amber-900" disabled={busy} onClick={abandonUploadCheck}>放棄查詢並繼續</button>
    </div>}
    {message && <div role="status" className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">{message}</div>}
    {!ready && !message && <p className="text-sm text-stone-500">正在恢復私人草稿…</p>}

    {cards.some(card => !card.published) && <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-8" aria-label="共同刊登設定">
      <h2 className="text-xl font-semibold">共同刊登設定</h2>
      <p className="mt-2 text-sm text-stone-500">只在你按下各商品的「確認並刊登」後使用。可先編輯草稿，不需要立刻提供位置。</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">縣市<input className="mt-1 w-full rounded-xl border p-3" value={details.county} maxLength={30} onChange={event => setDetails(old => ({ ...old, county: event.target.value, consent: false }))} placeholder="例如：臺北市" /></label>
        <label className="text-sm">行政區<input className="mt-1 w-full rounded-xl border p-3" value={details.district} maxLength={30} onChange={event => setDetails(old => ({ ...old, district: event.target.value, consent: false }))} placeholder="例如：中山區" /></label>
        <label className="text-sm">緯度<input className="mt-1 w-full rounded-xl border p-3" inputMode="decimal" value={details.latitude} onChange={event => setDetails(old => ({ ...old, latitude: event.target.value, consent: false }))} placeholder="25.05" /></label>
        <label className="text-sm">經度<input className="mt-1 w-full rounded-xl border p-3" inputMode="decimal" value={details.longitude} onChange={event => setDetails(old => ({ ...old, longitude: event.target.value, consent: false }))} placeholder="121.53" /></label>
      </div>
      <button className="mt-4 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm" onClick={locate}><MapPin size={16} />使用目前位置</button>
      <p className="mt-2 text-xs text-stone-500">送出前即轉為約 2 公里的網格點；伺服器也只保存該約略位置。請勿填住家門牌。</p>
      <div className="mt-5 flex flex-wrap gap-5 text-sm">
        <label><input type="checkbox" checked={details.meetup} onChange={event => setDetails(old => ({ ...old, meetup: event.target.checked, consent: false }))} /> 面交</label>
        <label><input type="checkbox" checked={details.shipping} onChange={event => setDetails(old => ({ ...old, shipping: event.target.checked, consent: false }))} /> 寄送</label>
        <label><input type="checkbox" checked={details.negotiable} onChange={event => setDetails(old => ({ ...old, negotiable: event.target.checked, consent: false }))} /> 可議價</label>
      </div>
      <label className="mt-5 block text-sm">自訂失效日期（不填預設 30 天）<input type="date" className="mt-1 block rounded-xl border p-3" value={details.expiryDate} onChange={event => setDetails(old => ({ ...old, expiryDate: event.target.value, consent: false }))} /></label>
      <label className="mt-5 flex items-start gap-3 text-sm"><input type="checkbox" checked={details.consent} onChange={event => setDetails(old => ({ ...old, consent: event.target.checked }))} />我已確認商品真實、照片與描述可公開，並同意將照片、售價及約略位置顯示在商品地圖。</label>
    </section>}

    <section className="space-y-5" aria-label="私人商品草稿">
      {ready && !cards.length && <p className="rounded-3xl bg-white p-8 text-center text-stone-500">還沒有私人商品照片，現在就拍第一件吧。</p>}
      {cards.map((card, index) => <article key={card.id} className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start gap-5"><PrivatePhoto id={card.id} token={token} />
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-widest text-stone-500">第 {index + 1} 件 · {card.published ? '已公開' : '私人草稿'}</p>
            <h3 className="mt-2 text-lg font-semibold">{card.form.title || '等待辨識或手動填寫'}</h3>
            <p className="mt-2 text-sm text-stone-600">{card.ai === 'PENDING' || card.ai === 'PROCESSING' ? 'AI 正在排隊辨識…' : card.ai === 'COMPLETED' ? 'AI 已提供建議，請核對商品實況' : card.ai === 'FAILED' ? 'AI 暫時無法辨識，可重試或手動填寫' : aiAvailable === false ? '可手動填寫私人草稿' : '可請 AI 辨識'}</p>
            {card.draft && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">AI 參考價格：{card.draft.estimatedPriceLowTwd === null ? '無足夠依據' : `NT$${card.draft.estimatedPriceLowTwd}–${card.draft.estimatedPriceHighTwd}`}<br />{card.draft.priceBasis || '請自行核對市場價格'}<p className="mt-1 text-xs">AI 可能辨識錯誤；下方售價由賣家決定。</p></div>}
          </div>
        </div>
        {!card.published && <><div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">商品名稱<input className="mt-1 w-full rounded-xl border p-3" disabled={busy || card.saving} maxLength={100} value={card.form.title} onChange={event => updateField(card.id, 'title', event.target.value)} onBlur={event => saveOnBlur(card, event)} /></label>
          <label className="text-sm">品牌（選填）<input className="mt-1 w-full rounded-xl border p-3" disabled={busy || card.saving} maxLength={60} value={card.form.brand} onChange={event => updateField(card.id, 'brand', event.target.value)} onBlur={event => saveOnBlur(card, event)} /></label>
          <label className="text-sm">分類<select className="mt-1 w-full rounded-xl border p-3" disabled={busy || card.saving} value={card.form.category} onChange={event => updateField(card.id, 'category', event.target.value)} onBlur={event => saveOnBlur(card, event)}>{listingCategories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-sm">新舊狀態<select className="mt-1 w-full rounded-xl border p-3" disabled={busy || card.saving} value={card.form.condition} onChange={event => updateField(card.id, 'condition', event.target.value)} onBlur={event => saveOnBlur(card, event)}><option value="USED">二手</option><option value="NEW">全新</option></select></label>
          <label className="text-sm">賣家售價（TWD）<input className="mt-1 w-full rounded-xl border p-3" disabled={busy || card.saving} inputMode="decimal" value={card.form.price} onChange={event => updateField(card.id, 'price', event.target.value)} onBlur={event => saveOnBlur(card, event)} placeholder="由你確認，不自動採用 AI 價格" /></label>
          <label className="text-sm sm:col-span-2">商品說明<textarea className="mt-1 min-h-32 w-full rounded-xl border p-3" disabled={busy || card.saving} maxLength={3000} value={card.form.description} onChange={event => updateField(card.id, 'description', event.target.value)} onBlur={event => saveOnBlur(card, event)} /></label>
        </div>
          {card.draft && <details className="mt-4 text-sm text-stone-600"><summary className="cursor-pointer">查看 AI 辨識依據與不確定之處</summary><ul className="mt-2 list-disc pl-5">{card.draft.evidence.map((item, i) => <li key={`e${i}`}>{item}</li>)}{card.draft.uncertainties.map((item, i) => <li key={`u${i}`}>待確認：{item}</li>)}</ul></details>}
          {card.error && <p role="alert" className="mt-4 text-sm text-red-700">{card.error}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {aiAvailable !== false && (card.ai === 'SKIPPED' || card.ai === 'FAILED') && <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm" disabled={busy || !!pending} onClick={() => void requestAi(card.id)}><RefreshCw size={16} />{card.ai === 'FAILED' ? '重新辨識' : 'AI 辨識'}</button>}
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm" disabled={busy || !!pending || card.saving} onClick={() => void save(card)}>{card.saving ? '儲存中…' : card.dirty ? '儲存私人草稿' : '已儲存'}</button>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-stone-900 px-5 py-2 text-sm font-semibold text-white" disabled={busy || !!pending || card.saving || card.publishing} onClick={() => void publish(card)}><Sparkles size={16} />{card.publishing ? '刊登中…' : '確認並刊登'}</button>
            <button aria-label={`刪除第 ${index + 1} 件私人照片`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm text-red-700" disabled={busy || !!pending} onClick={() => void remove(card.id)}><Trash2 size={16} />刪除</button>
          </div>
        </>}
      </article>)}
    </section>
  </div>;
}
