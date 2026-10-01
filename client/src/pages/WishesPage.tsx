import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getFullApiUrl } from '../config';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { pendingRequestKey, privatePendingStore, PendingStoreError } from '../lib/webPendingStore';
import { parseManagedList, parseManagementPage, validWishId, wishDraftBody, WishManagementError, type ManagedList, type ManagedWish, type WishDraft } from '../lib/wishManagement';
import { emptyWishDraft, listDraftBody, lookupWishCreate, lookupWishPhoto, parseWebManagedWish, parseWebWishJournal, parseWishPhotoJournal, prepareWishUpload, submitWishCreate, submitWishPhoto, wishAiLabels, wishRoot, type WishPhotoRecord, type WishReceipt } from '../lib/wishWeb';
import MarketplaceDialog from '../components/MarketplaceDialog';
import PrivatePhoto from '../components/PrivateMarketplacePhoto';
import { lookupWishPhotoRemoval, parseWishPhotoRemovalJournal, submitWishPhotoRemoval, type WishPhotoRemovalReceipt } from '../lib/wishPhotoRemoval';
const button = 'min-h-11 rounded-xl border bg-white px-4 py-2 disabled:opacity-50';
const input = 'mt-2 min-h-11 w-full rounded-xl border bg-white p-3';
type Editor = { kind: 'LIST'; list?: ManagedList } | { kind: 'ITEM'; wish?: ManagedWish };
function WishImage({ wish }: { wish: ManagedWish }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [wish.imageUrl]);
  return wish.imageUrl && !failed ? <img className="h-20 w-20 flex-none rounded-xl object-cover" src={wish.imageUrl} referrerPolicy="no-referrer" alt={wish.name + ' 商品圖片'} onError={() => setFailed(true)} /> : <div role="img" aria-label={wish.name + (failed ? ' 圖片載入失敗' : ' 尚未提供圖片')} className="flex h-20 w-20 flex-none items-center justify-center rounded-xl bg-gray-100 text-sm">{failed ? '圖片未載入' : '尚無圖片'}</div>;
}
export default function WishesPage() {
  const { user, token } = useAuth(), [query] = useSearchParams();
  const raw = query.get('list'), id = raw && /^[1-9]\d{0,9}$/.test(raw) && validWishId(Number(raw)) && [...query.keys()].every(key => key === 'list') && query.getAll('list').length === 1 ? Number(raw) : null;
  if (!user || !token) return <section className="space-y-3 p-4"><h1 className="text-2xl font-semibold">我的願望</h1><p>登入後使用與 APP 相同的照片辨識與願望資料。</p><Link className={button} to={'/login?next=' + encodeURIComponent(id ? '/wishes?list=' + id : '/wishes')}>登入</Link></section>;
  return <WishesSession key={`${user.id}:${token}:${id}`} token={token} userId={user.id} initialListId={id} />;
}
export function WishesSession({ token, userId, initialListId = null }: { token: string; userId: number; initialListId?: number | null }) {
  const [lists, setLists] = useState<ManagedList[]>([]), [listCursor, setListCursor] = useState<number | null>(null), [listsLoaded, setListsLoaded] = useState(false);
  const [selected, setSelected] = useState<ManagedList | null>(null), [wishes, setWishes] = useState<ManagedWish[]>([]), [wishCursor, setWishCursor] = useState<number | null>(null), [detailLoaded, setDetailLoaded] = useState(false);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [mutationUnknown, setMutationUnknown] = useState(false);
  const [pending, setPending] = useState<string | null>(null), [known, setKnown] = useState<WishReceipt | null>(null);
  const [photoRaw, setPhotoRaw] = useState<string | null>(null), [photo, setPhoto] = useState<WishPhotoRecord | null>(null), [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removalRaw, setRemovalRaw] = useState<string | null>(null), [removalKnown, setRemovalKnown] = useState<WishPhotoRemovalReceipt | null>(null);
  const [confirmPhotoRemoval, setConfirmPhotoRemoval] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null), [draft, setDraft] = useState<WishDraft>({ ...emptyWishDraft });
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [isPublic, setPublic] = useState(false);
  const [filter, setFilter] = useState(''), [sort, setSort] = useState('newest'), [confirmDelete, setConfirmDelete] = useState<{ kind: 'LIST' | 'ITEM'; id: number; title: string } | null>(null);
  const active = useRef(true), gate = useRef(false), keys = useRef<{ create: string; photo: string; removal: string } | null>(null), selection = useRef(initialListId);
  const photoBody = useRef<string | null>(null);
  const album = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const blocked = busy || !ready || pending !== null || removalRaw !== null || mutationUnknown;
  function begin() { if (!active.current || gate.current) return false; gate.current = true; setBusy(true); setError(''); setNotice(''); return true; }
  function end() { gate.current = false; if (active.current) setBusy(false); }
  async function readLists(cursor: number | null = null) {
    if (!active.current) return;
    const page = parseManagementPage(await api(token, wishRoot + '/lists' + (cursor ? '?cursor=' + cursor : '')), parseManagedList, 25);
    if (cursor && page.items.some(item => item.id <= cursor)) throw new WishManagementError();
    if (!active.current) return;
    setLists(old => cursor ? [...old.filter(item => !page.items.some(row => row.id === item.id)), ...page.items] : page.items); setListCursor(page.nextCursor); setListsLoaded(true);
  }
  async function readDetail(id: number, cursor: number | null = null) {
    if (!active.current) return;
    const result = await api<{ list: unknown; items: unknown[]; nextCursor: unknown }>(token, `${wishRoot}/lists/${id}` + (cursor ? '?cursor=' + cursor : ''));
    const list = parseManagedList(result.list), page = parseManagementPage(result, value => parseWebManagedWish(value), 50);
    if (list.id !== id || page.items.some(item => item.wishlistId !== id || cursor !== null && item.id <= cursor)) throw new WishManagementError();
    if (!active.current || selection.current !== id) return;
    setSelected(list); setWishes(old => cursor ? [...old.filter(item => !page.items.some(row => row.id === item.id)), ...page.items] : page.items); setWishCursor(page.nextCursor); setDetailLoaded(true);
  }
  async function refresh(work: () => Promise<void>) {
    if (!begin()) return;
    try { await work(); } catch { if (active.current) setError('願望讀取失敗，不代表沒有資料。請重新載入核對。'); } finally { end(); }
  }
  async function cleanKnown(raw: string, receipt: WishReceipt) {
    setKnown(receipt); setNotice(receipt.deleted ? '原建立資料已刪除，不會重新建立替代品。' : '後台已確認建立；AI 狀態以最新資料為準。');
    try {
      if (photoBody.current && receipt.kind === 'ITEM') {
        const mediaId = JSON.parse(parseWebWishJournal(raw).body).mediaId;
        // Separate tabs can have different photo and creation journals. A
        // known item ACK must not discard an unrelated pending photo.
        if (mediaId && !receipt.deleted) {
          const attached = await lookupWishPhoto(token, photoBody.current);
          if (attached.id === mediaId && attached.wishItemId === receipt.id) {
            await clearExact(keys.current!.photo, photoBody.current);
            if (active.current) { photoBody.current = null; setPhotoRaw(null); setPhoto(null); setPhotoFile(null); }
          }
        }
      }
      await clearExact(keys.current!.create, raw);
      if (!active.current) return;
      setPending(null); setKnown(null); setEditor(null);
    } catch { if (active.current) setError('建立已確認，但本機恢復標記未清理；只重試清理，不會再送出建立。'); return; }
    try {
      await readLists();
      if (!receipt.deleted) { selection.current = receipt.kind === 'LIST' ? receipt.id : receipt.resource!.wishlistId; setWishes([]); setDetailLoaded(false); await readDetail(selection.current!); }
    } catch { if (active.current) setError('建立已確認，但清單讀取失敗，請重新載入查看。'); }
  }
  async function clearExact(key: string, raw: string) {
    const current = await privatePendingStore.get(key);
    if (current === null) return;
    if (current !== raw || !await privatePendingStore.clear(key, raw)) throw new PendingStoreError();
  }
  async function cleanPhotoRemoval(raw: string, receipt: WishPhotoRemovalReceipt) {
    if (!active.current) return;
    setRemovalKnown(receipt);
    setNotice(receipt.cleanupPending ? '後台已移除照片引用，實體檔案仍待清理；不會重建原照片。' : '後台已確認照片移除與實體檔案清理。');
    const expected = parseWishPhotoRemovalJournal(raw).photoBody;
    try {
      const current = await privatePendingStore.get(keys.current!.photo);
      // Another tab can upload a different photo after the old one is removed.
      // Clear only the original bytes, never that unrelated journal.
      if (current === expected) await clearExact(keys.current!.photo, expected);
      if (!active.current) return;
      if (photoBody.current === expected) {
        // Preserve a newer journal written by another tab. It is not this
        // removal's target, and must be checked before it can be used.
        if (current !== null && current !== expected) parseWishPhotoJournal(current);
        photoBody.current = current === expected ? null : current;
        setPhotoRaw(photoBody.current); setPhoto(null); setPhotoFile(null);
      }
      await clearExact(keys.current!.removal, raw);
      if (active.current) { setRemovalRaw(null); setRemovalKnown(null); }
    } catch { if (active.current) setError('照片移除已確認，但本機標記未清理；只重試本機清理，不會重新移除或重傳。'); }
  }
  async function initialize() {
    if (!begin()) return; setReady(false);
    try {
      const scoped = { create: await pendingRequestKey(getFullApiUrl(), userId, 'wish-create'), photo: await pendingRequestKey(getFullApiUrl(), userId, 'wish-photo'), removal: await pendingRequestKey(getFullApiUrl(), userId, 'wish-photo-remove') };
      const [raw, upload, removal] = await Promise.all([privatePendingStore.get(scoped.create), privatePendingStore.get(scoped.photo), privatePendingStore.get(scoped.removal)]);
      if (raw) parseWebWishJournal(raw);
      if (upload) parseWishPhotoJournal(upload);
      if (removal) parseWishPhotoRemovalJournal(removal);
      if (!active.current) return;
      keys.current = scoped; photoBody.current = upload; setPending(raw); setPhotoRaw(upload); setRemovalRaw(removal);
      if (removal) { try { const receipt = await lookupWishPhotoRemoval(token, removal); if (active.current) await cleanPhotoRemoval(removal, receipt); } catch { if (active.current) setError('原照片移除仍待確認；查不到照片不等於已移除，只查核原回執。'); } }
      if (photoBody.current) { try { const record = await lookupWishPhoto(token, photoBody.current); if (active.current) setPhoto(record); } catch { if (active.current && !removal) setNotice('有待確認照片；先查核或選回原照片明確重試，不會自動上傳。'); } }
      if (!active.current) return;
      setReady(true);
      if (raw) { try { const receipt = await lookupWishCreate(token, raw); if (active.current) await cleanKnown(raw, receipt); } catch { if (active.current) setError('尚未查到原建立回執；不代表未成立，只有明確重試才會送出原內容。'); } }
      await readLists(); if (selection.current && active.current) await readDetail(selection.current);
    } catch { if (active.current) setError('無法安全恢復願望或讀取資料，請重試；不會在未確認時建立新願望。'); }
    finally { end(); }
  }
  useEffect(() => { active.current = true; void initialize(); return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!selected || !wishes.some(item => item.aiStatus === 'PENDING' || item.aiStatus === 'PROCESSING')) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine && !gate.current && !editor && selection.current === selected.id) void refresh(() => readDetail(selected.id)); }, 5000);
    return () => clearInterval(timer);
  }, [selected?.id, wishes.map(item => `${item.id}:${item.aiStatus}`).join(','), editor]);
  function openEditor(value: Editor) {
    if (blocked) return;
    setError(''); setEditor(value);
    if (value.kind === 'LIST') { setTitle(value.list?.title ?? ''); setDescription(value.list?.description ?? ''); setPublic(value.list?.isPublic ?? false); }
    else { const wish = value.wish; setDraft(wish ? { name: wish.name, notes: wish.notes ?? '', link: wish.link ?? '', imageUrl: wish.imageUrl ?? '', budget: wish.maxPrice === null ? '' : String(wish.maxPrice), currency: wish.priceCurrency ?? 'TWD' } : { ...emptyWishDraft }); }
  }
  async function create(raw: string) {
    if (!keys.current) throw new PendingStoreError();
    await privatePendingStore.save(keys.current.create, raw);
    if (!active.current) return;
    setPending(raw);
    const receipt = await submitWishCreate(token, raw, privatePendingStore, keys.current.create, () => active.current);
    if (active.current) await cleanKnown(raw, receipt);
  }
  async function save() {
    if (blocked || !editor || !begin()) return;
    let mutationAttempted = false;
    try {
      if (editor.kind === 'LIST') {
        const body = listDraftBody(title, description, isPublic);
        if (editor.list) { mutationAttempted = true; const result = parseManagedList(await api(token, `${wishRoot}/lists/${editor.list.id}`, { method: 'PUT', body: JSON.stringify(body) })); if (result.id !== editor.list.id) throw new WishManagementError(); if (!active.current) return; setEditor(null); await readLists(); if (selection.current === result.id) await readDetail(result.id); }
        else await create(JSON.stringify({ kind: 'LIST', listId: null, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), ...body }) }));
      } else {
        if (!selected || photoRaw && !photo && !editor.wish) throw new WishManagementError('請先查核照片上傳，或完成照片移除標記清理');
        if (!editor.wish && photo && (photo.listingId !== null || photo.wishItemId !== null)) throw new WishManagementError('照片已用於另一筆商品或願望，請查核原資料，不會重複附加');
        const body = wishDraftBody(draft, editor.wish ? null : photo?.id ?? null);
        if (editor.wish) { const { imageUrl: _imageUrl, ...patch } = body; mutationAttempted = true; const result = parseWebManagedWish(await api(token, `${wishRoot}/items/${editor.wish.id}`, { method: 'PUT', body: JSON.stringify(patch) })); if (result.id !== editor.wish.id || result.wishlistId !== selected.id) throw new WishManagementError(); if (!active.current) return; setEditor(null); await readDetail(selected.id); await readLists(); }
        else await create(JSON.stringify({ kind: 'ITEM', listId: selected.id, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), ...body }) }));
      }
    } catch (failure) { if (active.current) { if (mutationAttempted) setMutationUnknown(true); setError(failure instanceof WishManagementError || failure instanceof PendingStoreError ? failure.message : '尚未確認保存；請先查核原回執，不會自動另建。'); } }
    finally { end(); }
  }
  async function recoverCreate(retry: boolean) {
    if (!pending || !begin()) return;
    try { if (known) await cleanKnown(pending, known); else if (retry) await create(pending); else { const receipt = await lookupWishCreate(token, pending); if (active.current) await cleanKnown(pending, receipt); } }
    catch { if (active.current) setError('原建立仍待確認，識別碼與內容已保留；不會自行重建或丟棄。'); } finally { end(); }
  }
  async function choosePhoto(file?: File) {
    if (!file || blocked || !keys.current || editor?.kind !== 'ITEM' || editor.wish || photo || !begin()) return;
    try {
      const prepared = await prepareWishUpload(file);
      if (!active.current) return;
      const raw = photoRaw ?? JSON.stringify({ version: 1, clientUploadId: crypto.randomUUID(), digest: prepared.digest });
      await privatePendingStore.save(keys.current.photo, raw);
      if (!active.current) return;
      photoBody.current = raw; setPhotoRaw(raw); setPhotoFile(prepared.file); setDraft(old => ({ ...old, imageUrl: '' }));
      const record = await submitWishPhoto(token, raw, prepared.file, privatePendingStore, keys.current.photo, () => active.current);
      if (active.current) { setPhoto(record); setNotice('照片已上傳，儲存願望後才會進入 AI 辨識排隊。'); }
    } catch (failure) { if (active.current) setError(failure instanceof WishManagementError || failure instanceof PendingStoreError ? failure.message : '照片上傳尚未確認；先查核，不會自動換新識別碼。'); } finally { end(); }
  }
  async function recoverPhoto(retry: boolean) {
    if (!photoRaw || !keys.current || blocked || !begin()) return;
    try { const record = retry && photoFile ? await submitWishPhoto(token, photoRaw, photoFile, privatePendingStore, keys.current.photo, () => active.current) : await lookupWishPhoto(token, photoRaw); if (active.current) { setPhoto(record); setNotice('已查到原照片。'); } }
    catch { if (active.current) setError('照片仍待確認；若需要重送，請選回同一照片後明確重試。'); } finally { end(); }
  }
  async function removePhoto() {
    if (!photoRaw || !keys.current || blocked || !begin()) return;
    setConfirmPhotoRemoval(false);
    try {
      const record = photo ?? await lookupWishPhoto(token, photoRaw);
      if (!active.current) return;
      if (record.listingId !== null || record.wishItemId !== null) throw new WishManagementError('照片已被使用，不能當未使用照片移除');
      const raw = JSON.stringify({ version: 1, mediaId: record.id, photoBody: photoRaw });
      await privatePendingStore.save(keys.current.removal, raw);
      if (!active.current) return;
      setRemovalRaw(raw);
      const receipt = await submitWishPhotoRemoval(token, raw, privatePendingStore, keys.current.removal, () => active.current);
      if (active.current) await cleanPhotoRemoval(raw, receipt);
    } catch { if (active.current) setError('原照片移除或本機清理尚未確認；請查核原回執，不會假稱成功或自動重傳。'); } finally { end(); }
  }
  async function recoverRemoval(retry: boolean) {
    if (!removalRaw || !keys.current || !begin()) return;
    try {
      const receipt = removalKnown ?? (retry ? await submitWishPhotoRemoval(token, removalRaw, privatePendingStore, keys.current.removal, () => active.current) : await lookupWishPhotoRemoval(token, removalRaw));
      if (active.current) await cleanPhotoRemoval(removalRaw, receipt);
    } catch { if (active.current) setError('原照片移除仍待確認；識別碼與內容已保留，不會自動重送或丟棄。'); } finally { end(); }
  }
  async function mutate(kind: 'LIST' | 'ITEM', id: number, body?: object) {
    if (blocked || !begin()) return;
    try {
      const result = await api<{ id: unknown; deleted?: boolean }>(token, `${wishRoot}/${kind === 'LIST' ? 'lists' : 'items'}/${id}`, { method: body ? 'PUT' : 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) });
      if (result.id !== id || !body && result.deleted !== true) throw new WishManagementError();
      if (!active.current) return;
      setConfirmDelete(null); setNotice('後台已確認更新。'); if (!body && kind === 'LIST') { selection.current = null; setSelected(null); setWishes([]); }
      await readLists(); if (selection.current) await readDetail(selection.current);
    } catch { if (active.current) { setMutationUnknown(true); setError('更新結果尚未確認，請重新讀取核對；不會自動重送或顯示假成功。'); } } finally { end(); }
  }
  async function inspectMutation() {
    if (!begin()) return;
    try { await readLists(); if (selection.current) { try { await readDetail(selection.current); } catch (failure) { if (!(failure instanceof ApiFailure) || failure.status !== 404) throw failure; if (active.current) { selection.current=null;setSelected(null);setWishes([]);setNotice('原清單目前無法查看，請回清單核對；此讀取不是操作回執。'); } } } if (active.current) { setMutationUnknown(false);setEditor(null);setConfirmDelete(null); } }
    catch { if (active.current) setError('仍無法取得最新資料，更新操作繼續暫停。'); } finally { end(); }
  }
  const status = <>
    {busy && <p role="status">正在處理願望…</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-3">{notice}</p>}
    {mutationUnknown && <button className={button} disabled={busy} onClick={() => void inspectMutation()}>只核對最新更新狀態</button>}
    {!ready && <button className={button} disabled={busy} onClick={() => void initialize()}>重試安全恢復</button>}
    {pending && <div className="space-y-2 rounded-xl border p-3">
      <p>{known ? '原建立已確認；只需要清理本機標記。' : '有原建立待確認，新建立暫停；重新開啟只查核，不會自動送出。'}</p>
      <button className={button} disabled={busy} onClick={() => void recoverCreate(false)}>{known ? '只重試本機清理' : '只查核原建立回執'}</button>
      {!known && <button className={button} disabled={busy || !ready} onClick={() => void recoverCreate(true)}>明確重試相同建立</button>}
    </div>}
    {removalRaw && <div className="space-y-2 rounded-xl border border-amber-500 bg-amber-50 p-3">
      <p>{removalKnown ? '照片移除已確認；只需要清理本機標記。' : '原照片移除待確認；新上傳與新建立暫停，重新開啟只查核，不會自動重送。'}</p>
      <button className={button} disabled={busy || !ready} onClick={() => void recoverRemoval(false)}>{removalKnown ? '只重試照片本機清理' : '只查核原照片移除回執'}</button>
      {!removalKnown && <button className={button} disabled={busy || !ready} onClick={() => void recoverRemoval(true)}>明確重試原照片移除</button>}
    </div>}
    {confirmPhotoRemoval && photoRaw && !removalRaw && !pending && <div className="space-y-2 rounded-xl border border-red-400 p-3">
      <p>確定移除這張未使用照片？無法復原；後台確認後才會清理本機標記，實體檔案依後台流程清理。</p>
      <button type="button" className={button + ' text-red-700'} disabled={blocked} onClick={() => void removePhoto()}>確認移除未使用照片</button>
      <button type="button" className={button} disabled={busy} onClick={() => setConfirmPhotoRemoval(false)}>保留這張照片</button>
    </div>}
  </>;
  const filtered = lists.filter(list => list.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).sort((a,b) => sort === 'name' ? a.title.localeCompare(b.title,'zh-TW') : sort === 'oldest' ? a.id-b.id : b.id-a.id);
  return <section className="mx-auto max-w-3xl space-y-4 p-4 pb-24"><h1 className="text-3xl font-semibold">我的願望</h1><p>照片、AI 狀態與最高預算與 APP 共用。AI 價格僅供參考，請自行核對。</p><Link className="inline-block underline" to="/dashboard">原有清單分享、送禮與社交功能</Link>{!editor && status}
    {selected ? <><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => { selection.current = null; setSelected(null); setWishes([]); setDetailLoaded(false); }}>返回清單</button><button className={button} disabled={blocked} onClick={() => openEditor({ kind:'LIST',list:selected })}>編輯清單與公開設定</button><Link className={button} to={'/wishlists/'+selected.id}>分享／送禮與標籤</Link></div><h2 className="break-words text-2xl">{selected.title}</h2><p>{selected.isPublic ? '公開清單：未隱藏願望與備註可供他人查看' : '私人清單：只有自己可查看'} · {selected.count}/{selected.maxItems}</p><button className={button+' border-green-700 text-green-800'} disabled={blocked} onClick={() => openEditor({kind:'ITEM'})}>新增願望 · 拍照／上傳／手動</button>
      {detailLoaded && !busy && !error && wishes.length === 0 && <p>這個清單還沒有願望。</p>}{wishes.map(wish => <article key={wish.id} className="space-y-3 rounded-2xl border bg-white p-4"><div className="flex gap-3"><WishImage wish={wish}/><div className="min-w-0"><h3 className="break-words text-lg font-semibold">{wish.name}</h3><p>{wishAiLabels[wish.aiStatus]}</p>{wish.aiStatus === 'COMPLETED' && wish.aiPrice !== null && <p>AI 參考價格 {wish.aiCurrency ?? '幣別未確認'} {wish.aiPrice}</p>}<p>{wish.maxPrice === null ? '未設定預算' : `最高預算 ${wish.priceCurrency ?? '幣別未確認'} ${wish.maxPrice}`}{wish.isHidden ? ' · 已隱藏' : ''}{wish.isPurchased ? ' · 已完成' : ''}</p></div></div>{wish.notes && <details><summary>詳細資訊與備註</summary><p className="whitespace-pre-wrap break-words">{wish.notes}</p></details>}{wish.link && <a className="block break-all underline" href={/^https?:\/\//i.test(wish.link) ? wish.link : undefined} target="_blank" rel="noopener noreferrer">參考商品連結</a>}{wish.aiLink && <a className="block underline" href={wish.aiLink} target="_blank" rel="noopener noreferrer">AI 參考商品</a>}<div className="flex flex-wrap gap-2"><button className={button} disabled={blocked} onClick={() => openEditor({kind:'ITEM',wish})}>編輯願望</button><button className={button} disabled={blocked} onClick={() => void mutate('ITEM',wish.id,{isHidden:!wish.isHidden})}>{wish.isHidden?'取消隱藏':'隱藏願望'}</button><button className={button} disabled={blocked} onClick={() => void mutate('ITEM',wish.id,{isPurchased:!wish.isPurchased})}>{wish.isPurchased?'取消完成':'標記完成'}</button>{!wish.isHidden && !wish.isPurchased && <Link className={button} to={'/explore?wish='+wish.id}>查附近符合商品</Link>}<button className={button+' text-red-700'} disabled={blocked} onClick={() => setConfirmDelete({kind:'ITEM',id:wish.id,title:wish.name})}>刪除願望</button></div></article>)}{wishCursor !== null && <button className={button} disabled={busy} onClick={() => void refresh(() => readDetail(selected.id,wishCursor))}>載入更多願望</button>}<div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void refresh(() => readDetail(selected.id))}>重新讀取願望</button><button className={button+' text-red-700'} disabled={blocked} onClick={() => setConfirmDelete({kind:'LIST',id:selected.id,title:selected.title})}>刪除整個清單</button></div></>
    : <><div className="flex flex-wrap gap-2"><button className={button+' border-green-700 text-green-800'} disabled={blocked} onClick={() => openEditor({kind:'LIST'})}>建立願望清單</button><button className={button} disabled={busy} onClick={() => void refresh(() => readLists())}>重新讀取清單</button></div><label className="block">搜尋已載入清單<input className={input} value={filter} onChange={e=>setFilter(e.target.value)}/></label><label className="block">清單排序<select className={input} value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">最新建立</option><option value="oldest">最早建立</option><option value="name">名稱</option></select></label>{listCursor !== null && <p>還有未載入清單，搜尋只涵蓋目前已載入內容。</p>}{listsLoaded && !busy && !error && !listCursor && lists.length === 0 && <p>尚無願望清單，先建立一份記下想找的好物。</p>}{filtered.map(list=><article key={list.id} className="space-y-2 rounded-2xl border bg-white p-4"><h2 className="break-words text-xl">{list.title}</h2><p>{list.isPublic?'公開':'私人'} · {list.count} 個願望 · 每份上限 {list.maxItems}</p><button className={button} disabled={busy} onClick={() => {if(gate.current)return;selection.current=list.id;setWishes([]);setDetailLoaded(false);void refresh(()=>readDetail(list.id));}}>查看「{list.title}」</button></article>)}{listCursor !== null && <button className={button} disabled={busy} onClick={()=>void refresh(()=>readLists(listCursor))}>載入更多清單</button>}</>}
    {editor && <MarketplaceDialog title={editor.kind==='LIST' ? '願望清單' : editor.wish ? '編輯願望' : '新增願望'} onClose={()=>{if(!busy)setEditor(null);}}>{status}<form className="space-y-4" onSubmit={e=>{e.preventDefault();void save();}}>{editor.kind==='LIST' ? <><label className="block">清單名稱<input className={input} value={title} maxLength={200} disabled={blocked} onChange={e=>setTitle(e.target.value)}/></label><label className="block">清單說明（選填）<textarea className={input} value={description} maxLength={1000} disabled={blocked} onChange={e=>setDescription(e.target.value)}/></label><label className="flex gap-2"><input type="checkbox" checked={isPublic} disabled={blocked} onChange={e=>setPublic(e.target.checked)}/>公開清單（預設私人；未隱藏願望與備註可供他人查看）</label></> : <>{!editor.wish && <div className="space-y-3 rounded-xl border border-dashed border-green-600 bg-green-50 p-3"><p className="font-semibold">快捷選用 · 照片交給 AI</p><p>單張照片或圖片網址擇一；儲存願望後進入排隊。</p>{photo && !removalRaw ? <PrivatePhoto id={photo.id} token={token} label="選取的願望照片"/> : null}{photoRaw && <p>{removalRaw?'照片移除待確認':photo?'原照片已上傳':'照片仍待確認'}</p>}<div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked||!!photo} onClick={()=>album.current?.click()}>{photoRaw?'選回原照片明確重試':'從相簿選擇願望照片'}</button><button type="button" className={button} disabled={blocked||!!photoRaw} onClick={()=>camera.current?.click()}>拍攝願望照片</button>{photoRaw && !photo && <button type="button" className={button} disabled={blocked} onClick={()=>void recoverPhoto(false)}>只查核原照片</button>}{photoRaw && photoFile && !photo && <button type="button" className={button} disabled={blocked} onClick={()=>void recoverPhoto(true)}>明確重試原照片上傳</button>}{photoRaw && <button type="button" className={button} disabled={blocked} onClick={()=>setConfirmPhotoRemoval(true)}>移除未使用照片</button>}</div><input ref={album} type="file" aria-label="願望照片檔案" className="sr-only" tabIndex={-1} accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={blocked||!!photo} onChange={e=>{void choosePhoto(e.target.files?.[0]);e.target.value='';}}/><input ref={camera} type="file" aria-label="拍攝願望照片檔案" className="sr-only" tabIndex={-1} accept="image/*" capture="environment" disabled={blocked||!!photoRaw} onChange={e=>{void choosePhoto(e.target.files?.[0]);e.target.value='';}}/><p className="text-sm">後台會去除位置資訊並產生縮圖；知道照片網址的人仍可能查看照片，請勿上傳個資。</p></div>}{(['imageUrl','name','budget','currency','notes','link'] as const).map(field=><label key={field} className="block">{{imageUrl:'AI 商品圖片網址（HTTPS）',name:'願望名稱（有照片可留空）',budget:'最高預算（選填）',currency:'預算幣別',notes:'備註（公開清單會顯示）',link:'參考商品連結（選填）'}[field]}{field==='budget'?' · '+draft.currency:''}{field==='notes'?<textarea className={input} value={draft[field]} disabled={blocked} maxLength={1000} onChange={e=>setDraft(old=>({...old,[field]:e.target.value}))}/>:<input className={input} value={draft[field]} disabled={blocked||field==='imageUrl'&&(!!editor.wish||!!photoRaw)} inputMode={field==='budget'?'decimal':field==='imageUrl'||field==='link'?'url':'text'} maxLength={field==='name'?200:field==='currency'?3:2048} onChange={e=>setDraft(old=>({...old,[field]:e.target.value}))}/>}</label>)}</>}<button className={button+' border-green-700 text-green-800'} disabled={blocked}>{editor.kind==='ITEM'&&!editor.wish&&(photoRaw||draft.imageUrl)?'儲存後開始 AI 辨識':'儲存願望資料'}</button><button type="button" className={button} disabled={busy} onClick={()=>setEditor(null)}>稍後處理（保留待確認操作）</button></form></MarketplaceDialog>}
    {confirmDelete && <MarketplaceDialog title="確認刪除願望資料" onClose={()=>{if(!busy)setConfirmDelete(null);}}><p>確定刪除「{confirmDelete.title}」{confirmDelete.kind==='LIST'?'與其中所有願望':''}？無法復原；照片將依後台流程清理。</p><button className={button+' mt-4 text-red-700'} disabled={blocked} onClick={()=>void mutate(confirmDelete.kind,confirmDelete.id)}>確認永久刪除</button>{error&&<p role="alert">{error}</p>}</MarketplaceDialog>}
  </section>;
}
