import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, ImageRef, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { ApiError, createApi } from './api';
import { parsePhotoRecord, PhotoRecord } from './listingForm';
import { jpegPhotoUploadForm } from './photoUploadForm';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { PendingStoreError } from './pendingStore';
import { ManagedList, ManagedWish, parseManagedList, parseManagedWish, parseManagementPage, parseWishJournal, WishDraft, WishManagementError, wishDraftBody } from './wishManagement';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
type Editor = { kind: 'LIST'; list?: ManagedList } | { kind: 'ITEM'; wish?: ManagedWish };
type WishPhoto = { key: string; uri: string; record?: PhotoRecord; failed?: boolean };
const root = '/native-wishes';
const emptyWish: WishDraft = { name: '', notes: '', link: '', imageUrl: '', budget: '', currency: 'TWD' };
const aiLabel: Record<ManagedWish['aiStatus'], string> = { PENDING: 'AI 排隊中', PROCESSING: 'AI 辨識中', COMPLETED: 'AI 辨識完成', FAILED: 'AI 辨識失敗，可檢查圖片網址後重建', SKIPPED: '未啟用 AI 辨識' };
function WishImage({ wish }: { wish: ManagedWish }) {
  const [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [wish.imageUrl]);
  const message = wish.imageUrl ? '商品圖片載入中' : '尚未提供商品圖片';
  if (failed || !wish.imageUrl) return <View accessibilityLabel={`${wish.name} ${failed ? '商品圖片載入失敗' : '尚未提供商品圖片'}`} style={[s.wishImage, s.imagePlaceholder]}><Text style={s.placeholderIcon}>🖼️</Text><Text style={s.placeholderText}>{failed ? '圖片暫時無法載入' : message}</Text></View>;
  return <View accessible accessibilityLabel={`${wish.name} 商品圖片${loaded ? '已載入' : '載入中'}`} style={[s.wishImage, s.imagePlaceholder]}>{!loaded && <Text style={s.placeholderText}>{message}</Text>}<Image accessible={false} source={{ uri: wish.imageUrl }} style={s.imageContent} resizeMode="cover" resizeMethod="resize" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} /></View>;
}
export function WishScreen({ api, apiUrl, userId, onExplore }: { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; onExplore: (id: number) => void }) {
  const [lists, setLists] = useState<ManagedList[]>([]), [listCursor, setListCursor] = useState<number | null>(null);
  const [selected, setSelected] = useState<ManagedList | null>(null), [wishes, setWishes] = useState<ManagedWish[]>([]), [wishCursor, setWishCursor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [ready, setReady] = useState(false), [pending, setPending] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null), [draft, setDraft] = useState<WishDraft>(emptyWish);
  const [photo, setPhoto] = useState<WishPhoto | null>(null);
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [isPublic, setPublic] = useState(false);
  const active = useRef(true), locked = useRef(false), journalKey = useRef<string | null>(null);
  const selectedId = useRef<number | null>(null);
  const begin = () => { if (!active.current || locked.current) return false; locked.current = true; setBusy(true); setError(''); return true; };
  const end = () => { locked.current = false; if (active.current) setBusy(false); };
  const blocked = busy || !ready || pending !== null;
  async function loadLists(cursor: number | null = null) {
    const page = parseManagementPage(await api(root + '/lists' + (cursor ? '?cursor=' + cursor : '')), parseManagedList, 25);
    if (active.current) { setLists(old => cursor ? [...old.filter(v => !page.items.some(p => p.id === v.id)), ...page.items] : page.items); setListCursor(page.nextCursor); }
  }
  async function loadDetail(id: number, cursor: number | null = null) {
    const result = await api<{ list: unknown; items: unknown[]; nextCursor: unknown }>(`${root}/lists/${id}` + (cursor ? '?cursor=' + cursor : ''));
    const list = parseManagedList(result.list), page = parseManagementPage(result, parseManagedWish, 50);
    if (list.id !== id || page.items.some(w => w.wishlistId !== id)) throw new WishManagementError();
    if (active.current && selectedId.current === id) { setSelected(list); setWishes(old => cursor ? [...old.filter(v => !page.items.some(p => p.id === v.id)), ...page.items] : page.items); setWishCursor(page.nextCursor); }
  }
  async function initialize() {
    if (!begin()) return;
    setReady(false);
    try {
      const key = await pendingRequestKey(apiUrl, userId, 'wish-create'), saved = await privatePendingStore.get(key);
      if (saved) parseWishJournal(saved);
      if (active.current) { journalKey.current = key; setPending(saved); setReady(true); }
      await loadLists();
    } catch { if (active.current) setError('無法安全恢復或載入願望。請重試；不會在狀態未確認時建立新願望。'); }
    finally { end(); }
  }
  useEffect(() => { active.current = true; void initialize(); return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!selected || !wishes.some(w => w.aiStatus === 'PENDING' || w.aiStatus === 'PROCESSING')) return;
    const timer = setInterval(() => { if (!locked.current && selectedId.current === selected.id) void read(() => loadDetail(selected.id)); }, 5000);
    return () => clearInterval(timer);
  }, [selected?.id, wishes.map(w => `${w.id}:${w.aiStatus}`).join(',')]);
  async function read(work: () => Promise<void>) {
    if (!begin()) return;
    try { await work(); } catch { if (active.current) setError('無法載入願望，請確認登入與網路後重試。'); } finally { end(); }
  }
  function selectList(id: number) {
    if (locked.current || !active.current) return;
    selectedId.current = id; void read(() => loadDetail(id));
  }
  function openEditor(value: Editor) {
    if (blocked) return;
    setPhoto(null);
    setEditor(value);
    if (value.kind === 'LIST') { setTitle(value.list?.title ?? ''); setDescription(value.list?.description ?? ''); setPublic(value.list?.isPublic ?? false); }
    else { const w = value.wish; setDraft(w ? { name: w.name, notes: w.notes ?? '', link: w.link ?? '', imageUrl: w.imageUrl ?? '', budget: w.maxPrice === null ? '' : String(w.maxPrice), currency: w.priceCurrency ?? 'TWD' } : { ...emptyWish }); }
  }
  function releasePreparedPhoto(value: WishPhoto) {
    const cache = Paths.cache.uri.replace(/\/$/, '') + '/';
    if (value.uri.startsWith(cache) && !value.uri.includes('/../')) {
      try { const file = new File(value.uri); if (file.exists) file.delete(); } catch { /* The OS may have cleared this exact cache file. */ }
    }
  }
  async function uploadPhoto(value: WishPhoto) {
    const form = jpegPhotoUploadForm(value.key, value.uri, 'wish-photo.jpg');
    const record = parsePhotoRecord(await api<unknown>('/listing-media', { method: 'POST', body: form }), apiUrl, __DEV__);
    if (active.current) setPhoto(old => old?.key === value.key ? { ...old, record, failed: false } : old);
  }
  async function choosePhoto(camera: boolean) {
    if (blocked || photo || editor?.kind !== 'ITEM' || editor.wish || !begin()) return;
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new WishManagementError('未授予相機權限；也可以從相簿選擇照片。');
      const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
      if (picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0], context = ImageManipulator.manipulate(asset.uri);
      let rendered: ImageRef | undefined, prepared: WishPhoto;
      try {
        if (Math.max(asset.width, asset.height) > 1600) context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
        rendered = await context.renderAsync();
        const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: false });
        prepared = { key: Crypto.randomUUID(), uri: saved.uri };
        if (active.current) { setDraft(old => ({ ...old, imageUrl: '' })); setPhoto(prepared); }
      } finally { rendered?.release(); context.release(); }
      try { await uploadPhoto(prepared); }
      catch { if (active.current) { setPhoto(old => old?.key === prepared.key ? { ...old, failed: true } : old); setError('照片尚未上傳成功，請重試或移除後再儲存。'); } }
    } catch (failure) { if (active.current) setError(failure instanceof WishManagementError ? failure.message : '無法取得照片，請稍後重試。'); }
    finally { end(); }
  }
  async function retryPhoto() {
    if (!photo || blocked || !begin()) return;
    try { await uploadPhoto(photo); } catch { if (active.current) setError('照片上傳失敗，請確認網路後再試。'); } finally { end(); }
  }
  async function discardPhoto(value: WishPhoto) {
    let record = value.record;
    if (!record) {
      try { record = parsePhotoRecord(await api('/listing-media/by-upload-id/' + value.key), apiUrl, __DEV__); }
      catch (failure) { if (failure instanceof ApiError && failure.status === 404) return; throw failure; }
    }
    await api('/listing-media/' + record.id, { method: 'DELETE' });
  }
  async function removePhoto() {
    if (!photo || blocked || !begin()) return;
    try { await discardPhoto(photo); releasePreparedPhoto(photo); if (active.current) setPhoto(null); }
    catch { if (active.current) setError('無法確認照片已移除，請稍後重試。'); }
    finally { end(); }
  }
  async function closeEditor() {
    if (busy || !editor) return;
    if (pending) { if (photo) releasePreparedPhoto(photo); setPhoto(null); setEditor(null); return; }
    if (photo) {
      if (!begin()) return;
      try { await discardPhoto(photo); releasePreparedPhoto(photo); setPhoto(null); setEditor(null); }
      catch { if (active.current) setError('無法確認未使用照片已移除，請重試取消或先移除照片。'); }
      finally { end(); }
    } else setEditor(null);
  }
  async function confirmCreate(raw: string, recovering: boolean) {
    const journal = parseWishJournal(raw);
    if (!journalKey.current) throw new WishManagementError();
    await privatePendingStore.save(journalKey.current, raw);
    if (active.current) setPending(raw);
    try {
      const path = journal.kind === 'LIST' ? root + '/lists' : `${root}/lists/${journal.listId}/items`;
      const response = await api<{ resource: unknown; replayed: boolean }>(path, { method: 'POST', body: journal.body });
      if (typeof response.replayed !== 'boolean') throw new WishManagementError();
      const resource = journal.kind === 'LIST' ? parseManagedList(response.resource) : parseManagedWish(response.resource);
      if (journal.kind === 'ITEM' && (resource as ManagedWish).wishlistId !== journal.listId) throw new WishManagementError();
      await privatePendingStore.clear(journalKey.current, raw);
      if (active.current) { if (photo) releasePreparedPhoto(photo); setPhoto(null); setPending(null); setEditor(null); }
      try {
        await loadLists();
        const id = journal.kind === 'LIST' ? resource.id : journal.listId!;
        if (active.current) { selectedId.current = id; setWishes([]); await loadDetail(id); }
      } catch { if (active.current) setError('已確認建立，但列表載入失敗；請重新載入查看。'); }
    } catch (failure) {
      // The backend proves an original receipt's resource was deleted (410).
      // Never silently create a replacement with a fresh operation identity.
      if (failure instanceof ApiError && (failure.status === 410 || !recovering && failure.status === 400)) {
        await privatePendingStore.clear(journalKey.current, raw);
        if (active.current) setPending(null);
        throw new WishManagementError(failure.status === 410 ? '上次建立的資料已刪除，不會重新建立。' : '資料未被接受，請檢查後再儲存。');
      }
      throw failure;
    }
  }
  async function save() {
    if (blocked || !editor || !begin()) return;
    try {
      if (editor.kind === 'LIST') {
        if (!title.trim() || title.length > 200 || description.length > 1000 || /[\u0000-\u001f\u007f]/.test(title)) throw new WishManagementError('清單名稱須為200字內，說明1000字內');
        const body = { title: title.trim(), description: description || null, isPublic };
        if (editor.list) { const saved = parseManagedList(await api(`${root}/lists/${editor.list.id}`, { method: 'PUT', body: JSON.stringify(body) })); if (saved.id !== editor.list.id) throw new WishManagementError(); setEditor(null); await loadLists(); if (selectedId.current === editor.list.id) await loadDetail(editor.list.id); }
        else await confirmCreate(JSON.stringify({ kind: 'LIST', listId: null, body: JSON.stringify({ clientRequestId: Crypto.randomUUID(), ...body }) }), false);
      } else {
        if (!selected) throw new WishManagementError();
        if (photo && !photo.record) throw new WishManagementError('請先重試或移除尚未上傳的照片');
        const body = wishDraftBody(draft, photo?.record?.id ?? null);
        if (editor.wish) { const { imageUrl: _imageUrl, ...updateBody } = body; const saved = parseManagedWish(await api(`${root}/items/${editor.wish.id}`, { method: 'PUT', body: JSON.stringify(updateBody) })); if (saved.id !== editor.wish.id || saved.wishlistId !== selected.id) throw new WishManagementError(); setEditor(null); await loadDetail(selected.id); await loadLists(); }
        else await confirmCreate(JSON.stringify({ kind: 'ITEM', listId: selected.id, body: JSON.stringify({ clientRequestId: Crypto.randomUUID(), ...body }) }), false);
      }
    } catch (failure) { if (active.current) { if (failure instanceof PendingStoreError) setReady(false); setError(failure instanceof WishManagementError ? failure.message : '尚未確認儲存結果。若為新建立，請用原資料重試確認，避免重複願望。'); } }
    finally { end(); }
  }
  async function retryCreate() {
    if (!pending || !begin()) return;
    try { await confirmCreate(pending, true); } catch (failure) { if (active.current) { if (failure instanceof PendingStoreError) setReady(false); setError(failure instanceof WishManagementError ? failure.message : '尚未確認上次建立。請重新登入同一帳號後重試，不會丟棄原識別碼。'); } } finally { end(); }
  }
  async function mutate(path: string, body?: object) {
    if (blocked || !begin()) return;
    try {
      const result = await api<{ id: unknown; deleted?: unknown }>(root + path, { method: body ? 'PUT' : 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) });
      if (result.id !== Number(path.split('/').at(-1)) || (!body && result.deleted !== true)) throw new WishManagementError();
      if (!body && path.startsWith('/lists/') && active.current) { selectedId.current = null; setSelected(null); setWishes([]); }
      await loadLists(); if (selectedId.current) await loadDetail(selectedId.current);
    } catch { if (active.current) setError('尚未確認更新結果，請重新載入檢查；不會顯示假成功。'); } finally { end(); }
  }
  const button = (label: string, action: () => void, disabled = blocked, variant: 'primary' | 'secondary' | 'destructive' = 'secondary') => <Pressable accessibilityRole="button" disabled={disabled} style={[s.button, variant === 'primary' && s.primaryButton, variant === 'destructive' && s.destructiveButton, disabled && s.disabled]} onPress={action}><Text style={[s.buttonText, variant === 'primary' && s.primaryButtonText, variant === 'destructive' && s.destructiveButtonText]}>{label}</Text></Pressable>;
  const status = <>{busy && <ActivityIndicator accessibilityLabel="處理願望中" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!ready && button('重試安全恢復', () => void initialize(), busy)}{pending && <View style={s.card}><Text style={s.text}>有上次待確認建立。重試使用相同識別碼，不會建立重複願望。</Text>{button('確認上次建立', () => void retryCreate(), busy || !ready, 'primary')}</View>}</>;
  return <View style={s.flex}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={s.title}>{selected ? selected.title : '我的願望'}</Text>{!editor && status}
    {selected ? <>
      {button('返回清單', () => { selectedId.current = null; setSelected(null); setWishes([]); }, busy)}
      <Text style={s.text}>{selected.isPublic ? '公開清單：未隱藏願望與備註可供他人查看' : '私人清單：只有自己可查看'} · {selected.count}/{selected.maxItems}</Text>
      {button('編輯清單與公開設定', () => openEditor({ kind: 'LIST', list: selected }))}{button('新增願望', () => openEditor({ kind: 'ITEM' }), blocked, 'primary')}
      {wishes.length === 0 && !busy && <Text style={s.text}>這個清單還沒有願望，先記下想找的好物。</Text>}
      {wishes.map(w => <View key={w.id} style={s.card}><WishImage wish={w} /><Text style={s.heading}>{w.name}</Text><Text style={[s.aiStatus, w.aiStatus === 'FAILED' && s.aiFailed]}>{aiLabel[w.aiStatus]}</Text>{w.aiStatus === 'COMPLETED' && w.aiPrice !== null && <Text style={s.aiPrice}>AI 參考價格 {w.aiCurrency ?? ''} {w.aiPrice}</Text>}<Text style={s.text}>{w.maxPrice === null ? '未設定預算' : `最高預算 ${w.priceCurrency ?? '幣別未確認'} ${w.maxPrice}`}{w.isHidden ? ' · 已隱藏' : ''}{w.isPurchased ? ' · 已完成' : ''}</Text>{!!w.notes && <Text style={s.text}>{w.notes}</Text>}{!!w.link && <Text style={s.text}>參考連結：{w.link}</Text>}{!!w.aiLink && <Text style={s.text}>AI 參考商品：{w.aiLink}</Text>}
        {button('編輯願望', () => openEditor({ kind: 'ITEM', wish: w }))}{button(w.isHidden ? '取消隱藏' : '隱藏願望', () => void mutate('/items/' + w.id, { isHidden: !w.isHidden }))}
        {button(w.isPurchased ? '取消完成' : '標記完成', () => void mutate('/items/' + w.id, { isPurchased: !w.isPurchased }))}
        {button('查附近符合商品', () => onExplore(w.id), busy || w.isHidden || w.isPurchased, 'primary')}
        {button('刪除願望', () => Alert.alert('刪除願望', `確定刪除「${w.name}」？無法復原。`, [{ text: '取消', style: 'cancel' }, { text: '刪除', style: 'destructive', onPress: () => void mutate('/items/' + w.id) }]), blocked, 'destructive')}
      </View>)}
      {wishCursor !== null && button('載入更多願望', () => void read(() => loadDetail(selected.id, wishCursor)), busy)}
      {button('重新載入', () => void read(() => loadDetail(selected.id)), busy)}
      {button('刪除整個清單', () => Alert.alert('刪除清單', `確定刪除「${selected.title}」及其中 ${selected.count} 個願望？無法復原。`, [{ text: '取消', style: 'cancel' }, { text: '全部刪除', style: 'destructive', onPress: () => void mutate('/lists/' + selected.id) }]), blocked, 'destructive')}
    </> : <>{button('建立願望清單', () => openEditor({ kind: 'LIST' }), blocked, 'primary')}{!busy && lists.length === 0 && <Text style={s.text}>用願望清單記下想找的好物，隨時查找附近商品。</Text>}{lists.map(l => <View key={l.id} style={s.card}><Text style={s.heading}>{l.title}</Text><Text style={s.text}>{l.isPublic ? '公開' : '私人'} · {l.count} 個願望</Text>{button('查看清單', () => selectList(l.id), busy)}</View>)}{listCursor !== null && button('載入更多清單', () => void read(() => loadLists(listCursor)), busy)}{button('重新載入清單', () => void read(() => loadLists()), busy)}</>}
  </ScrollView><Modal visible={editor !== null} animationType="slide" onRequestClose={() => void closeEditor()}><SafeAreaView style={s.flex}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={s.title}>{editor?.kind === 'LIST' ? '願望清單' : '願望內容'}</Text>{status}
    {editor?.kind === 'LIST' ? <><TextInput style={s.input} accessibilityLabel="清單名稱" placeholder="清單名稱" value={title} onChangeText={setTitle} editable={!blocked} maxLength={200} /><TextInput style={s.input} accessibilityLabel="清單說明" placeholder="說明（公開清單會顯示）" value={description} onChangeText={setDescription} editable={!blocked} multiline maxLength={1000} /><Pressable accessibilityRole="switch" accessibilityState={{ checked: isPublic, disabled: blocked }} disabled={blocked} style={s.button} onPress={() => setPublic(v => !v)}><Text style={s.buttonText}>{isPublic ? '公開清單' : '私人清單（預設）'} · 點擊切換</Text></Pressable></> : <>
      {!editor?.wish && <>
        <Text style={s.heading}>願望照片</Text>
        {photo ? <View style={s.card}><Image source={{ uri: photo.uri }} style={s.photoPreview} accessibilityLabel="選取的願望照片" /><Text style={s.text}>{photo.record ? '照片已上傳，儲存後開始 AI 辨識' : '照片尚未上傳成功'}</Text>{photo.failed && button('重試上傳照片', () => void retryPhoto())}{button('移除照片', () => void removePhoto())}</View> : <View style={s.photoActions}>{button('從相簿選擇', () => void choosePhoto(false))}{button('拍攝照片', () => void choosePhoto(true))}</View>}
        <Text style={s.text}>可直接拍照或選一張照片。照片會去除位置資訊並縮小後上傳；儲存願望後，會透過難以猜測的圖片網址提供給 AI 辨識服務。知道該網址的人也能查看照片。</Text>
      </>}
      {(['name', 'notes', 'link', 'imageUrl', 'budget', 'currency'] as const).map((field, index) => <TextInput key={field} style={s.input} accessibilityLabel={['願望名稱', '備註', '參考商品連結', 'AI 商品圖片網址', '最高預算', '預算幣別'][index]} placeholder={['願望名稱（有照片可留空由 AI 辨識）', '備註（公開清單會顯示）', 'http(s)商品連結（選填）', editor?.wish ? '圖片僅建立時可設定' : '或貼上公開 HTTPS 圖片網址', '最高預算，留空不限', '幣別，例如TWD'][index]} value={draft[field]} onChangeText={value => setDraft(old => ({ ...old, [field]: value }))} editable={!blocked && !(field === 'imageUrl' && (!!editor?.wish || !!photo))} multiline={field === 'notes'} keyboardType={field === 'budget' ? 'decimal-pad' : field === 'link' || field === 'imageUrl' ? 'url' : 'default'} autoCorrect={field !== 'link' && field !== 'imageUrl'} autoCapitalize={field === 'link' || field === 'imageUrl' ? 'none' : field === 'currency' ? 'characters' : 'sentences'} />)}
      <Text style={s.text}>照片或公開圖片網址擇一；AI 完成後會更新商品名稱、價格與詳細描述。</Text>
    </>}
    {button('儲存', () => void save(), blocked, 'primary')}{button(pending ? '稍後確認' : '取消', () => void closeEditor(), busy)}
  </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal></View>;
}
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: iosColors.background },
  content: { paddingHorizontal: iosSpacing.lg, paddingTop: iosSpacing.xs, paddingBottom: iosSpacing.xxl, gap: iosSpacing.md },
  title: { ...iosType.largeTitle, color: iosColors.label },
  heading: { ...iosType.title2, color: iosColors.label },
  text: { ...iosType.body, color: iosColors.label },
  error: { ...iosType.subheadline, color: iosColors.danger },
  card: { padding: iosSpacing.lg, gap: iosSpacing.sm, backgroundColor: iosColors.surface, borderRadius: iosRadius.card, ...iosShadow },
  button: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.sm, justifyContent: 'center', alignItems: 'center', borderRadius: iosRadius.control, backgroundColor: iosColors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator },
  primaryButton: { backgroundColor: iosColors.tint, borderColor: iosColors.tint },
  destructiveButton: { backgroundColor: iosColors.dangerSoft, borderColor: iosColors.dangerSoft },
  buttonText: { color: iosColors.tint, ...iosType.headline },
  primaryButtonText: { color: iosColors.white },
  destructiveButtonText: { color: iosColors.danger },
  disabled: { opacity: 0.45 },
  input: { minHeight: 52, padding: iosSpacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.control, backgroundColor: iosColors.surface, color: iosColors.label, fontSize: 17 },
  photoActions: { gap: iosSpacing.sm },
  photoPreview: { width: '100%', aspectRatio: 4 / 3, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary },
  wishImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: iosRadius.control, backgroundColor: iosColors.background, overflow: 'hidden' },
  imageContent: { position: 'absolute', inset: 0 },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center', gap: iosSpacing.xs },
  placeholderIcon: { fontSize: 34 },
  placeholderText: { ...iosType.footnote, color: iosColors.secondaryLabel },
  aiStatus: { ...iosType.footnote, color: iosColors.secondaryLabel },
  aiPrice: { ...iosType.headline, color: iosColors.tint },
  aiFailed: { color: iosColors.danger },
});
