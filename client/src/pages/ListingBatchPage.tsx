import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ImagePlus, MapPin, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { api, ApiFailure } from '../lib/marketplaceApi';
import PrivatePhoto from '../components/PrivateMarketplacePhoto';
import MarketingAssistantWeb from '../components/MarketingAssistantWeb';
import { useAuth } from '../context/AuthContext';
import { buildPublishedListing, emptyListingDraft, firstListingPublishIssue, isUuid, listingCategories, mergeAiDraft, parseAiState, parseSellerDraft, prepareListingUploadFile, sameSellerContent } from '../lib/listingBatch';
import type { AiDraft, AiStatus, ListingDraftForm, ListingField, ListingPublishField, ListingTouched, PublishDetails } from '../lib/listingBatch';
import { forgetPendingUploads, loadPrivateMediaPages, readPendingUploads, reconcilePendingUploads, rememberPendingUpload } from '../lib/listingUploadJournal';
import { API_URL } from '../config';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
import { abandonListingCreation, listingCreationJournal, parseListingCreationJournal, readListingCreation, sendListingCreation, type ListingCreationResult } from '../lib/listingCreationWeb';

type Card = { id: string; clientListingId: string; form: ListingDraftForm; touched: ListingTouched; version: number;
  ai: AiStatus; draft: AiDraft | null; dirty: boolean; saving: boolean; publishing: boolean; published: boolean;
  error: string; confirmed: boolean };
const emptyDetails: PublishDetails = { county: '', district: '', latitude: '', longitude: '', meetup: true, shipping: false, negotiable: false, expiryDate: '', consent: false };
const pendingKey = (userId: number) => `wishlist:listing-pending:${userId}`;

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
    saving: false, publishing: false, published: false, error: '', confirmed: false };
}

function applyAi(card: Card, ai: { status: AiStatus; draft: AiDraft | null }): Card {
  const form = ai.draft ? mergeAiDraft(card.form, card.touched, ai.draft) : card.form;
  const changed = !sameSellerContent(card, { form, touched: card.touched });
  // An identical poll is not a new suggestion. Changed evidence also requires
  // review even when the editable fields happen to remain the same.
  const reviewChanged = changed || JSON.stringify(ai.draft) !== JSON.stringify(card.draft);
  return { ...card, ai: ai.status, draft: ai.draft, form, dirty: card.dirty || changed,
    confirmed: reviewChanged ? false : card.confirmed, error: '' };
}

export default function ListingBatchPage() {
  const { token, user } = useAuth();
  if (!token || !user) return <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm">請先 <Link to="/login" className="text-blue-600 underline">登入</Link> 再刊登商品。</div>;
  // A new account gets a new component instance. Late responses from the
  // previous account cannot populate the replacement account's draft state.
  return <ListingBatchSession key={`${user.id}:${token}`} token={token} userId={user.id} />;
}

function ListingBatchSession({ token, userId }: { token: string; userId: number }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [details, setDetails] = useState<PublishDetails>(emptyDetails);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState('');
  const [legacy, setLegacy] = useState('');
  const [legacyVerified, setLegacyVerified] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [readTick, setReadTick] = useState(0);
  const [cleanupOnly, setCleanupOnly] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const journalKey = useRef('');
  const confirmedResult = useRef<ListingCreationResult | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending || (legacy && !legacyVerified ? legacy : '') || (storageError ? 'unavailable' : '');
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [unresolvedUploads, setUnresolvedUploads] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<{ cardId: string; field: ListingPublishField | 'review' } | null>(null);
  const fieldNodes = useRef(new Map<string, HTMLElement>());
  const busyRef = useRef(false);
  const savingIds = useRef(new Set<string>());
  const pollIds = useRef(new Set<string>());
  const lifetime = useRef(0);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const hasPendingAi = cards.some(card => card.ai === 'PENDING' || card.ai === 'PROCESSING');
  const confirmedCards = cards.filter(card => card.confirmed && !card.published);
  const locked = busy || !!pending || !!legacy && !legacyVerified || storageError || !ready;

  useEffect(() => {
    lifetime.current++;
    return () => { lifetime.current++; };
  }, []);

  const reload = useCallback(async () => {
    const epoch = lifetime.current;
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
    if (epoch !== lifetime.current) return;
    setCards(old => [...recovered.map(card => {
      const previous = old.find(item => item.id === card.id);
      if (previous?.dirty || previous?.published) return previous;
      return previous && previous.version === card.version && sameSellerContent(previous, card) &&
        JSON.stringify(previous.draft) === JSON.stringify(card.draft) ? { ...card, confirmed: previous.confirmed } : card;
    }),
      ...old.filter(card => card.published || card.dirty && !recovered.some(item => item.id === card.id))]);
    setUnresolvedUploads(checked.unresolved);
    setAiAvailable(typeof availability?.available === 'boolean' ? availability.available : null);
    if (checked.unresolved.length) setMessage(`${checked.unresolved.length} 張照片的上傳結果仍待確認；請先重新確認，勿重傳同張照片。`);
    else setMessage('');
    setReady(true);
  }, [token, userId]);

  useEffect(() => {
    setReady(false); if (readTick === 0) setCards([]); setMessage(''); setUnresolvedUploads([]); setAiAvailable(null);
    const epoch = lifetime.current;
    let active = true;
    void (async () => {
      let stored: string | null, previous: string;
      try {
        const key = await pendingRequestKey(API_URL, userId, 'listing');
        stored = await privatePendingStore.get(key);
        previous = localStorage.getItem(pendingKey(userId)) ?? '';
        if (stored) await parseListingCreationJournal(stored);
        if (!active || epoch !== lifetime.current) return;
        journalKey.current = key; setPending(stored ?? ''); setLegacy(previous); setLegacyVerified(false);
        setStorageError(false); setCleanupOnly(false); confirmedResult.current = null;
      } catch {
        if (active && epoch === lifetime.current) { setStorageError(true); setMessage('此瀏覽器無法讀取安全刊登紀錄；為避免重複刊登，已暫停新增照片與發布。請允許網站儲存空間後重試恢復。'); }
        return;
      }
      try {
        await reload();
        if (!active || epoch !== lifetime.current) return;
        // Reopening is GET-only. An absent receipt is not proof that a POST
        // will never commit, and never authorizes automatic retransmission.
        if (stored) {
          const result = await readListingCreation(token, stored, userId);
          if (active && epoch === lifetime.current) await finishCreation(stored, result, epoch);
        }
        if (previous && active && epoch === lifetime.current) await checkLegacy(previous, epoch);
      } catch (error) {
        if (active && epoch === lifetime.current) setMessage(`恢復仍待確認：${(error as Error).message}。不會自動重新刊登。`);
      }
    })();
    return () => { active = false; };
  }, [token, userId, reload, readTick]);

  useEffect(() => {
    if (!token || !ready || !hasPendingAi) return;
    let active = true;
    const timer = window.setInterval(() => {
      if (busyRef.current) return;
      for (const card of cardsRef.current.filter(item => item.ai === 'PENDING' || item.ai === 'PROCESSING')) {
        if (pollIds.current.has(card.id)) continue;
        pollIds.current.add(card.id);
        void api<unknown>(token, `/listing-media/${card.id}/ai-draft`).then(raw => {
          const ai = parseAiState(raw, card.id);
          if (!active || busyRef.current) return;
          setCards(current => current.map(item => item.id === card.id && !item.publishing && !item.published ? applyAi(item, ai) : item));
        }).catch(() => { /* Preserve queue state; seller may retry explicitly. */ }).finally(() => pollIds.current.delete(card.id));
      }
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, ready, hasPendingAi]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!busy && !pending && !(legacy && !legacyVerified) && !storageError && !cards.some(card => card.dirty)) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, pending, legacy, legacyVerified, storageError, cards]);

  const replace = (id: string, change: (card: Card) => Card) => setCards(old => old.map(card => card.id === id ? change(card) : card));
  function updateField(id: string, field: ListingField, value: string) {
    if (busyRef.current || pendingRef.current) return;
    setInvalid(null);
    replace(id, card => ({ ...card, form: { ...card.form, [field]: value }, touched: { ...card.touched, [field]: true }, dirty: true, confirmed: false, error: '' }));
  }
  function updateDetails(change: Partial<PublishDetails>) {
    if (busyRef.current || pendingRef.current) return;
    setInvalid(null);
    setDetails(old => ({ ...old, ...change, consent: 'consent' in change ? !!change.consent : false }));
    setCards(old => old.map(card => card.published ? card : { ...card, confirmed: false, error: '' }));
  }
  function fieldProps(cardId: string, field: ListingPublishField | 'review') {
    const highlighted = invalid?.field === field && (cardId === 'shared' || invalid.cardId === cardId);
    return { ref: (node: HTMLElement | null) => {
      const key = `${cardId}:${field}`;
      if (node) fieldNodes.current.set(key, node); else fieldNodes.current.delete(key);
    }, 'aria-invalid': highlighted || undefined, 'aria-describedby': highlighted ? `listing-error-${invalid?.cardId}` : undefined,
      style: highlighted ? { outline: '3px solid #dc2626', outlineOffset: '3px', scrollMarginTop: '100px' } : { scrollMarginTop: '100px' },
      'data-highlighted': highlighted ? 'true' : undefined };
  }
  function sharedProps(field: ListingPublishField) { return fieldProps('shared', field); }
  function showIssue(card: Card, issue: { field: ListingPublishField | 'review'; message: string }) {
    replace(card.id, current => ({ ...current, confirmed: false, error: issue.message }));
    setInvalid({ cardId: card.id, field: issue.field });
    const node = fieldNodes.current.get(`${card.id}:${issue.field}`) ?? fieldNodes.current.get(`shared:${issue.field}`);
    node?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    node?.focus({ preventScroll: true });
    // Bounded visual attention; keep the persistent outline and accessible
    // error when animations are unavailable or reduced motion is requested.
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      node?.animate?.([{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }], { duration: 480, iterations: 3 });
  }
  function confirmCard(card: Card) {
    if (locked || busyRef.current || card.saving || card.published) return;
    if (card.confirmed) { replace(card.id, current => ({ ...current, confirmed: false })); return; }
    const issue = firstListingPublishIssue(card, card.id, details);
    if (issue) { showIssue(card, issue); return; }
    setInvalid(null);
    replace(card.id, current => ({ ...current, confirmed: true, error: '' }));
  }

  async function requestAi(id: string): Promise<boolean> {
    try {
      const state = parseAiState(await api<unknown>(token!, `/listing-media/${id}/ai-draft`, { method: 'POST' }), id);
      replace(id, card => !card.publishing && !card.published ? applyAi(card, state) : card);
      return true;
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'LISTING_AI_UNAVAILABLE') setAiAvailable(false);
      replace(id, card => ({ ...card, error: (error as Error).message }));
      return !(error instanceof ApiFailure && error.code === 'LISTING_AI_UNAVAILABLE');
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || locked || busyRef.current || unresolvedUploads.length) return;
    if (cards.filter(card => !card.published).length + files.length > 12) { setMessage('一次最多處理 12 件商品。'); return; }
    busyRef.current = true; setBusy(true); setMessage('');
    const epoch = lifetime.current;
    let aiCanQueue = aiAvailable !== false;
    try {
      for (const [index, file] of Array.from(files).entries()) {
        if (epoch !== lifetime.current) break;
        let prepared: File;
        try { prepared = await prepareListingUploadFile(file); }
        catch (error) { setMessage(`第 ${index + 1} 張照片無法處理：${(error as Error).message}；後續照片尚未上傳。`); break; }
        if (epoch !== lifetime.current) break;
        const uploadId = crypto.randomUUID();
        const body = new FormData(); body.append('clientUploadId', uploadId); body.append('capturePurpose', 'BATCH_ITEM'); body.append('image', prepared);
        try { rememberPendingUpload(userId!, uploadId); }
        catch { setMessage('無法在此瀏覽器安全記錄上傳進度；照片尚未送出，請確認瀏覽器儲存空間後重試。'); break; }
        let confirmedPrivate = false;
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
          confirmedPrivate = true;
          if (epoch !== lifetime.current) break; // Preserve the upload journal for owner recovery.
          const card: Card = { id: record.id, clientListingId: crypto.randomUUID(), form: emptyListingDraft(), touched: {},
            version: 0, ai: 'SKIPPED', draft: null, dirty: true, saving: false, publishing: false, published: false, error: '', confirmed: false };
          setCards(old => old.some(item => item.id === card.id) ? old : [...old, card]);
          if (aiCanQueue) aiCanQueue = await requestAi(record.id);
          forgetPendingUploads(userId!, [uploadId]);
        } catch (error) {
          let pendingIds: string[] = [];
          try { pendingIds = readPendingUploads(userId!).map(entry => entry.clientUploadId); }
          catch { /* The known upload ID still blocks a duplicate in this session. */ }
          setUnresolvedUploads(pendingIds.length ? pendingIds : [uploadId]);
          setMessage(confirmedPrivate
            ? `第 ${index + 1} 張照片已由後台確認私密保存，但瀏覽器無法更新恢復紀錄。請先按「重新確認上傳」，不要重傳同張照片。`
            : `第 ${index + 1} 張照片尚未確認已私密保存：${(error as Error).message}。請先按「重新確認上傳」，不要重傳同張照片。`);
          break;
        }
      }
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function save(card: Card): Promise<boolean> {
    if (card.saving || card.published || savingIds.current.has(card.id)) return false;
    savingIds.current.add(card.id);
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
    } finally { savingIds.current.delete(card.id); }
  }

  function saveOnBlur(card: Card, event: FocusEvent<HTMLElement>) {
    // Publish/save buttons perform their own flush. Avoid racing a blur save
    // against that explicit action; navigation and moving fields still save.
    if (!locked && !busyRef.current && card.dirty && !(event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('button, [data-batch-review]'))) void save(card);
  }

  async function applyConfirmed(raw: string, result: ListingCreationResult, epoch: number) {
    const journal = await parseListingCreationJournal(raw);
    if (epoch !== lifetime.current) return;
    const ids = journal.payload.mediaIds as string[];
    setCards(old => old.map(card => ids.includes(card.id) ? result.state === 'CREATED'
      ? { ...card, publishing: false, published: true, dirty: false, error: '' }
      : { ...card, clientListingId: crypto.randomUUID(), publishing: false, confirmed: false, dirty: true, error: '' } : card));
    setMessage(result.state === 'ABANDONED'
      ? '後台已安全取消原刊登，延遲請求也不會重建商品。照片仍是私人草稿，重新核對後才能建立新的刊登。'
      : result.listing === null ? '原刊登已確認；該商品後來已刪除，不會重新建立。'
      : `原刊登已確認；目前狀態：${({ ACTIVE: '在售', RESERVED: '已保留', SOLD: '已售出', REMOVED: '已移除', EXPIRED: '已失效', DRAFT: '草稿', PENDING_CONFIRMATION: '待確認' } as const)[result.listing.status]}。最新資料請到「我的商品」查看。`);
  }

  async function finishCreation(raw: string, result: ListingCreationResult, epoch: number) {
    if (epoch !== lifetime.current) return false;
    const alreadyConfirmed = confirmedResult.current !== null;
    confirmedResult.current = result; setCleanupOnly(true); setCancelConfirm(false);
    if (!alreadyConfirmed) await applyConfirmed(raw, result, epoch);
    if (epoch !== lifetime.current) return false;
    let cleared = false;
    try { cleared = await privatePendingStore.clear(journalKey.current, raw); }
    catch { /* A verified server result does not imply browser cleanup worked. */ }
    if (epoch !== lifetime.current) return false;
    if (!cleared) {
      setMessage('後台結果已確認，但瀏覽器紀錄未能安全清理，或另一分頁已變更紀錄。請重試清理或重新讀取；不會再次送出刊登。');
      return false;
    }
    setPending(''); setCleanupOnly(false); confirmedResult.current = null;
    return result.state === 'CREATED';
  }

  async function checkLegacy(previous: string, epoch: number) {
    // A plaintext legacy entry has no backend namespace. Do not import it,
    // retransmit it, cancel it, or erase it under the newly signed-in account.
    // Only a matching receipt read from this authenticated backend can unlock.
    const raw = await listingCreationJournal(previous);
    const result = await readListingCreation(token, raw, userId);
    if (epoch !== lifetime.current) return;
    await applyConfirmed(raw, result, epoch);
    if (epoch !== lifetime.current) return;
    setLegacyVerified(true);
  }

  async function commitReviewedCard(card: Card, body: string, epoch: number): Promise<boolean> {
    // Freeze the reviewed card before any await: a late AI poll must not
    // replace the fields on screen while this exact confirmed body is sent.
    replace(card.id, current => ({ ...current, form: card.form, touched: card.touched,
      ai: card.ai, draft: card.draft, publishing: true, error: '' }));
    if (card.dirty && !await save(card)) {
      replace(card.id, current => ({ ...current, publishing: false }));
      return false;
    }
    if (epoch !== lifetime.current) return false;
    let raw: string;
    try {
      raw = await listingCreationJournal(body);
      await privatePendingStore.save(journalKey.current, raw);
    }
    catch {
      if (epoch !== lifetime.current) return false;
      setStorageError(true);
      replace(card.id, current => ({ ...current, publishing: false,
        error: '此瀏覽器無法安全記錄刊登操作；商品尚未送出。請允許網站儲存空間後重試。' }));
      return false;
    }
    if (epoch !== lifetime.current) return false;
    setPending(raw); setCleanupOnly(false); confirmedResult.current = null;
    try {
      const result = await sendListingCreation(token, raw, userId, privatePendingStore, journalKey.current, () => epoch === lifetime.current);
      return await finishCreation(raw, result, epoch);
    } catch (error) {
      if (epoch !== lifetime.current) return false;
      // Even a rejected request must not clear a concurrent operation's
      // journal. Resolve an immutable terminal receipt before editing again.
      replace(card.id, current => ({ ...current, publishing: false, error: `刊登結果待確認：${(error as Error).message}` }));
      setMessage('請先確認上一筆刊登結果；系統不會用新識別碼重複建立商品。');
      return false;
    }
  }

  async function publishReviewed(selected: Card[]) {
    if (busyRef.current || locked || unresolvedUploads.length || !selected.length ||
      selected.some(card => card.published || card.publishing || card.saving || savingIds.current.has(card.id))) return;
    // Validate and freeze the entire reviewed set before showing confirmation.
    // Publication is sequential: a failed or unknown item stops the next item.
    const requests: { card: Card; body: string }[] = [];
    for (const card of selected) {
      const issue = firstListingPublishIssue(card, card.id, details);
      if (issue) { showIssue(card, issue); return; }
      if (!card.confirmed) { showIssue(card, { field: 'review', message: '請先逐欄確認這件商品的照片、內容及售價。' }); return; }
      requests.push({ card, body: JSON.stringify(buildPublishedListing(card, card.id, details)) });
    }
    const title = selected.length === 1 ? `「${selected[0].form.title}」` : `已逐件確認的 ${selected.length} 件商品`;
    if (!window.confirm(`確定公開刊登${title}？照片、售價與約略位置將出現在商品地圖。`)) return;
    busyRef.current = true; setBusy(true); setInvalid(null); setMessage('');
    const epoch = lifetime.current;
    let completed = 0;
    try {
      for (const request of requests) {
        if (epoch !== lifetime.current) return;
        if (!await commitReviewedCard(request.card, request.body, epoch)) {
          if (epoch === lifetime.current && completed) setMessage(`已確認刊登 ${completed} 件；本件未完成或結果待確認，後續 ${requests.length - completed - 1} 件尚未送出。請先處理提示。`);
          return;
        }
        completed++;
      }
      if (epoch === lifetime.current) setMessage(selected.length === 1 ? '商品刊登已確認。其他照片仍是私人草稿。' : `已確認刊登 ${completed} 件商品。未勾選的照片仍是私人草稿。`);
    } finally { if (epoch === lifetime.current) { busyRef.current = false; setBusy(false); } }
  }

  async function reconcile(mode: 'read' | 'retry' | 'abandon' | 'cleanup' = 'read') {
    if (!pending || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const epoch = lifetime.current, raw = pending;
    try {
      if (cleanupOnly && mode !== 'cleanup' || !cleanupOnly && mode === 'cleanup') return;
      const result = mode === 'cleanup' ? confirmedResult.current!
        : mode === 'retry' ? await sendListingCreation(token, raw, userId, privatePendingStore, journalKey.current, () => epoch === lifetime.current)
        : mode === 'abandon' ? await abandonListingCreation(token, raw, userId, () => epoch === lifetime.current)
        : await readListingCreation(token, raw, userId);
      if (epoch === lifetime.current) await finishCreation(raw, result, epoch);
    } catch (error) {
      if (epoch === lifetime.current) setMessage(error instanceof ApiFailure && error.status === 404
        ? '後台尚無已確認的原操作回執；這不代表延遲刊登不會完成。可再查核、明確重試同一刊登，或安全取消原操作。'
        : `前次刊登仍待確認：${(error as Error).message}。不會自動重新刊登。`);
    } finally { if (epoch === lifetime.current) { busyRef.current = false; setBusy(false); } }
  }

  async function remove(id: string) {
    if (busyRef.current || locked || !window.confirm('確定刪除這張尚未刊登的私人商品照片？')) return;
    busyRef.current = true; setBusy(true);
    try { await api<void>(token!, `/listing-media/${id}`, { method: 'DELETE' }); setCards(old => old.filter(card => card.id !== id)); }
    catch (error) { replace(id, card => ({ ...card, error: (error as Error).message })); }
    finally { busyRef.current = false; setBusy(false); }
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
    if (busyRef.current || locked) return;
    const epoch = lifetime.current;
    if (!navigator.geolocation) { setMessage('此瀏覽器無法取得位置；請手動填寫縣市、行政區及座標。'); return; }
    navigator.geolocation.getCurrentPosition(position => {
      if (epoch !== lifetime.current || busyRef.current || pendingRef.current) return;
      updateDetails({ latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) });
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
          <input aria-label="拍一件商品" className="sr-only" type="file" accept="image/*" capture="environment" disabled={locked || !!unresolvedUploads.length || cards.filter(card => !card.published).length >= 12} onChange={event => { void uploadFiles(event.target.files); event.target.value = ''; }} /></label>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-stone-300 px-5 py-3 text-sm font-semibold"><ImagePlus size={18} />批次選照片
          <input aria-label="批次選擇商品照片" className="sr-only" type="file" accept="image/*" multiple disabled={locked || !!unresolvedUploads.length || cards.filter(card => !card.published).length >= 12} onChange={event => { void uploadFiles(event.target.files); event.target.value = ''; }} /></label>
      </div>
      <p className="mt-3 text-xs text-stone-500">可重複拍照；單次最多 12 件。大張照片會先在瀏覽器縮放至 5MB 以下；支援的相片格式依瀏覽器而定。上傳後仍保持私人狀態。</p>
      {cards.filter(card => !card.published).length >= 12 && <p role="status" className="mt-2 text-sm text-amber-800">目前有 {cards.filter(card => !card.published).length} 件私人草稿；請先確認刊登或移除部分照片，再新增商品。</p>}
    </div>

    {storageError && <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm"><p>安全刊登紀錄暫時無法使用，已暫停修改與發布。</p><button className="mt-3 min-h-11 rounded-xl border px-4 py-2" disabled={busy} onClick={() => setReadTick(value => value + 1)}>重試讀取安全紀錄</button></div>}
    {legacy && <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm"><p className="font-semibold">{legacyVerified ? '舊版刊登紀錄已核對' : '舊版刊登紀錄需要核對'}</p><p className="mt-1">舊紀錄未標示後台網站，不會匯入、重送、取消或刪除。{legacyVerified ? '本帳號原操作回執已確認，可繼續使用。' : '僅查詢目前帳號與後台的原操作；未核對前暫停刊登。'}</p>{!legacyVerified && <button className="mt-3 min-h-11 rounded-xl border px-4 py-2" disabled={busy} onClick={() => setReadTick(value => value + 1)}>只讀核對舊版紀錄</button>}<Link to="/my-listings" className="ml-3 inline-block py-3 text-blue-700 underline">查看我的商品</Link></div>}
    {pending && <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm"><p className="font-semibold">{cleanupOnly ? '刊登結果已確認，紀錄待清理' : '前次刊登結果尚未確認'}</p><p className="mt-1">{cleanupOnly ? '不會再次送出刊登。只清理完全相符的瀏覽器紀錄；另一分頁的操作不會被刪除。' : '查核只讀取原操作，不會重新刊登。重試使用完全相同的內容與識別碼。'}</p>
      <div className="mt-3 flex flex-wrap gap-3">{cleanupOnly ? <><button className="min-h-11 rounded-xl bg-amber-900 px-4 py-2 text-white" disabled={busy} onClick={() => void reconcile('cleanup')}>重試安全清理紀錄</button><button className="min-h-11 rounded-xl border px-4 py-2" disabled={busy} onClick={() => setReadTick(value => value + 1)}>重新讀取目前紀錄</button></> : <><button className="min-h-11 rounded-xl bg-amber-900 px-4 py-2 text-white" disabled={busy} onClick={() => void reconcile('read')}>查核原刊登結果</button><button className="min-h-11 rounded-xl border px-4 py-2" disabled={busy} onClick={() => void reconcile('retry')}>重試同一刊登</button><button className="min-h-11 rounded-xl border border-red-300 px-4 py-2 text-red-800" disabled={busy} onClick={() => setCancelConfirm(true)}>安全取消原操作</button></>}</div>
      {cancelConfirm && !cleanupOnly && <div className="mt-4 rounded-xl border border-red-200 bg-white p-3"><p>只取消尚未完成的原操作；若後台已刊登，會回報原商品，不會下架。照片不會刪除。確定取消？</p><button className="mt-3 min-h-11 rounded-xl bg-red-800 px-4 py-2 text-white" disabled={busy} onClick={() => void reconcile('abandon')}>確認安全取消</button><button className="ml-3 min-h-11 rounded-xl border px-4 py-2" disabled={busy} onClick={() => setCancelConfirm(false)}>返回查核</button></div>}
    </div>}
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
      <p className="mt-2 text-sm text-stone-500">同一批商品使用以下地點、交付方式與失效日期。可先編輯私人草稿；公開前請逐件核對。修改共同設定後須重新確認各件商品。</p>
      <fieldset disabled={locked}>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">縣市<input {...sharedProps('county')} className="mt-1 w-full rounded-xl border p-3" value={details.county} maxLength={30} onChange={event => updateDetails({ county: event.target.value })} placeholder="例如：臺北市" /></label>
        <label className="text-sm">行政區<input {...sharedProps('district')} className="mt-1 w-full rounded-xl border p-3" value={details.district} maxLength={30} onChange={event => updateDetails({ district: event.target.value })} placeholder="例如：中山區" /></label>
        <label className="text-sm">緯度（度）<input {...sharedProps('latitude')} className="mt-1 w-full rounded-xl border p-3" inputMode="decimal" value={details.latitude} onChange={event => updateDetails({ latitude: event.target.value })} placeholder="25.05" /></label>
        <label className="text-sm">經度（度）<input {...sharedProps('longitude')} className="mt-1 w-full rounded-xl border p-3" inputMode="decimal" value={details.longitude} onChange={event => updateDetails({ longitude: event.target.value })} placeholder="121.53" /></label>
      </div>
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm"><p className="text-xs font-semibold text-blue-800">快捷選用 · 可略過並手動填寫</p><button className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-300 bg-white px-4 py-2" onClick={locate}><MapPin size={16} />使用目前位置</button></div>
      <p className="mt-2 text-xs text-stone-500">送出前即轉為約 2 公里的網格點；伺服器也只保存該約略位置。請勿填住家門牌。</p>
      <div className="mt-5 flex flex-wrap gap-5 text-sm">
        <label><input {...sharedProps('delivery')} type="checkbox" checked={details.meetup} onChange={event => updateDetails({ meetup: event.target.checked })} /> 面交</label>
        <label><input type="checkbox" checked={details.shipping} onChange={event => updateDetails({ shipping: event.target.checked })} /> 寄送</label>
        <label><input type="checkbox" checked={details.negotiable} onChange={event => updateDetails({ negotiable: event.target.checked })} /> 可議價</label>
      </div>
      <label className="mt-5 block text-sm">自訂失效日期（不填預設 30 天）<input {...sharedProps('expiryDate')} type="date" className="mt-1 block rounded-xl border p-3" value={details.expiryDate} onChange={event => updateDetails({ expiryDate: event.target.value })} /></label>
      <label className="mt-5 flex items-start gap-3 text-sm"><input {...sharedProps('consent')} type="checkbox" checked={details.consent} onChange={event => updateDetails({ consent: event.target.checked })} />我已確認商品真實、照片與描述可公開，並同意將照片、售價及約略位置顯示在商品地圖。</label>
      </fieldset>
    </section>}

    <section className="space-y-5" aria-label="私人商品草稿">
      {ready && !cards.length && <p className="rounded-3xl bg-white p-8 text-center text-stone-500">還沒有私人商品照片，現在就拍第一件吧。</p>}
      {cards.map((card, index) => <article key={card.id} className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start gap-5"><PrivatePhoto id={card.id} token={token} label={card.published ? '已確認刊登的商品實拍照片' : '僅本人可見的商品照片'} />
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-widest text-stone-500">第 {index + 1} 件 · {card.published ? '刊登已確認' : '私人草稿'}</p>
            <h3 className="mt-2 text-lg font-semibold">{card.form.title || '等待辨識或手動填寫'}</h3>
            <p className="mt-2 text-sm text-stone-600">{card.published ? '原刊登已確認。最新狀態請前往我的商品查看。' : card.ai === 'PENDING' || card.ai === 'PROCESSING' ? 'AI 正在排隊辨識…' : card.ai === 'COMPLETED' ? 'AI 已提供建議，請核對商品實況' : card.ai === 'FAILED' ? 'AI 暫時無法辨識，可重試或手動填寫' : aiAvailable === false ? '可手動填寫私人草稿' : '可請 AI 辨識'}</p>
            {card.draft && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">AI 參考價格：{card.draft.estimatedPriceLowTwd === null ? '無足夠依據' : `NT$${card.draft.estimatedPriceLowTwd}–${card.draft.estimatedPriceHighTwd}`}<br />{card.draft.priceBasis || '請自行核對市場價格'}<p className="mt-1 text-xs">AI 可能辨識錯誤；下方售價由賣家決定。</p></div>}
          </div>
        </div>
        {!card.published && <><div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">商品名稱<input {...fieldProps(card.id, 'title')} className="mt-1 w-full rounded-xl border p-3" disabled={locked} maxLength={100} value={card.form.title} onChange={event => updateField(card.id, 'title', event.target.value)} onBlur={event => saveOnBlur(card, event)} /></label>
          <label className="text-sm">品牌（選填）<input {...fieldProps(card.id, 'brand')} className="mt-1 w-full rounded-xl border p-3" disabled={locked} maxLength={60} value={card.form.brand} onChange={event => updateField(card.id, 'brand', event.target.value)} onBlur={event => saveOnBlur(card, event)} /></label>
          <label className="text-sm">分類<select {...fieldProps(card.id, 'category')} className="mt-1 w-full rounded-xl border p-3" disabled={locked} value={card.form.category} onChange={event => updateField(card.id, 'category', event.target.value)} onBlur={event => saveOnBlur(card, event)}>{listingCategories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-sm">新舊狀態<select {...fieldProps(card.id, 'condition')} className="mt-1 w-full rounded-xl border p-3" disabled={locked} value={card.form.condition} onChange={event => updateField(card.id, 'condition', event.target.value)} onBlur={event => saveOnBlur(card, event)}><option value="USED">二手</option><option value="NEW">全新</option></select></label>
          <div className="text-sm"><label>賣家售價（TWD）<input {...fieldProps(card.id, 'price')} className="mt-1 w-full rounded-xl border p-3" disabled={locked} inputMode="decimal" value={card.form.price} onChange={event => updateField(card.id, 'price', event.target.value)} onBlur={event => saveOnBlur(card, event)} placeholder="請填寫或確認售價" /></label>
            {card.draft && !card.touched.price && card.draft.estimatedPriceLowTwd !== null && <p className="mt-1 text-xs text-amber-800">此售價由 AI 參考區間中間值預填，不是已驗證行情；發布前請確認或修改。</p>}
          </div>
          <label className="text-sm sm:col-span-2">商品說明<textarea {...fieldProps(card.id, 'description')} className="mt-1 min-h-32 w-full rounded-xl border p-3" disabled={locked} maxLength={3000} value={card.form.description} onChange={event => updateField(card.id, 'description', event.target.value)} onBlur={event => saveOnBlur(card, event)} /></label>
        </div>
          {card.draft && <details className="mt-4 text-sm text-stone-600"><summary className="cursor-pointer">查看 AI 辨識依據與不確定之處</summary><ul className="mt-2 list-disc pl-5">{card.draft.evidence.map((item, i) => <li key={`e${i}`}>{item}</li>)}{card.draft.uncertainties.map((item, i) => <li key={`u${i}`}>待確認：{item}</li>)}</ul></details>}
          {card.ai === 'COMPLETED' && <MarketingAssistantWeb token={token} sourceMediaId={card.id}
            beforeStart={async () => !busyRef.current && !locked && card.form.title.trim().length >= 3 && card.form.description.trim().length >= 10 &&
              !!card.form.price.trim() && !card.saving && !card.publishing && (card.dirty ? await save(card) : true)}
            onApproved={async () => {
              const rows = await loadPrivateMediaPages(cursor => api<unknown>(token,
                '/listing-media/unused?purpose=BATCH_ITEM' + (cursor ? `&cursor=${cursor}` : '')));
              const updated = rows.find(row => typeof row === 'object' && row !== null &&
                (row as { id?: unknown }).id === card.id);
              if (!updated) throw new Error('PRIVATE_DRAFT_NOT_FOUND');
              replace(card.id, () => fromMedia(updated));
            }} />}
          <label data-batch-review className="mt-5 flex min-h-11 items-start gap-3 rounded-xl border border-stone-300 bg-stone-50 p-3 text-sm"><input {...fieldProps(card.id, 'review')} type="checkbox" checked={card.confirmed} disabled={locked || card.saving} onChange={() => confirmCard(card)} />我已逐欄確認第 {index + 1} 件商品的照片、內容及售價</label>
          {card.error && <p id={`listing-error-${card.id}`} role="alert" className="mt-4 text-sm text-red-700">{card.error}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {aiAvailable !== false && (card.ai === 'SKIPPED' || card.ai === 'FAILED') && <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm" disabled={locked} onClick={() => void requestAi(card.id)}><RefreshCw size={16} />{card.ai === 'FAILED' ? '重新辨識' : 'AI 辨識'}</button>}
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm" disabled={locked || card.saving} onClick={() => void save(card)}>{card.saving ? '儲存中…' : card.dirty ? '儲存私人草稿' : '已儲存'}</button>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-stone-900 px-5 py-2 text-sm font-semibold text-white" disabled={locked || !!unresolvedUploads.length || card.saving || card.publishing} onClick={() => void publishReviewed([card])}><Sparkles size={16} />{card.publishing ? '刊登中…' : '確認並刊登'}</button>
            <button aria-label={`刪除第 ${index + 1} 件私人照片`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm text-red-700" disabled={locked} onClick={() => void remove(card.id)}><Trash2 size={16} />刪除</button>
          </div>
        </>}
      </article>)}
    </section>
    {cards.some(card => !card.published) && <div className="rounded-2xl border border-stone-200 bg-white p-5"><p className="mb-3 text-sm text-stone-600">僅送出已逐件核對的商品；任何一件失敗或結果待確認時，後續商品會停止送出。</p><button className="min-h-11 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white" disabled={locked || !!unresolvedUploads.length || !confirmedCards.length || confirmedCards.some(card => card.saving)} onClick={() => void publishReviewed(confirmedCards)}>刊登已逐件確認的商品（{confirmedCards.length}）</button></div>}
    <Link to="/my-listings" className="inline-flex min-h-11 items-center rounded-xl border bg-white px-5 py-3 text-sm text-blue-700">前往我的商品查看與管理</Link>
  </div>;
}
