import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { ApiError, createApi } from './api';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { PendingStoreError } from './pendingStore';
import { ManagedList, ManagedWish, parseManagedList, parseManagedWish, parseManagementPage, parseWishJournal, WishDraft, WishManagementError, wishDraftBody } from './wishManagement';
type Editor = { kind: 'LIST'; list?: ManagedList } | { kind: 'ITEM'; wish?: ManagedWish };
const root = '/native-wishes';
const emptyWish: WishDraft = { name: '', notes: '', link: '', budget: '', currency: 'TWD' };
export function WishScreen({ api, apiUrl, userId, onExplore }: { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; onExplore: (id: number) => void }) {
  const [lists, setLists] = useState<ManagedList[]>([]), [listCursor, setListCursor] = useState<number | null>(null);
  const [selected, setSelected] = useState<ManagedList | null>(null), [wishes, setWishes] = useState<ManagedWish[]>([]), [wishCursor, setWishCursor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [ready, setReady] = useState(false), [pending, setPending] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null), [draft, setDraft] = useState<WishDraft>(emptyWish);
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
    setEditor(value);
    if (value.kind === 'LIST') { setTitle(value.list?.title ?? ''); setDescription(value.list?.description ?? ''); setPublic(value.list?.isPublic ?? false); }
    else { const w = value.wish; setDraft(w ? { name: w.name, notes: w.notes ?? '', link: w.link ?? '', budget: w.maxPrice === null ? '' : String(w.maxPrice), currency: w.priceCurrency ?? 'TWD' } : { ...emptyWish }); }
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
      if (active.current) { setPending(null); setEditor(null); }
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
        if (!selected) throw new WishManagementError(); const body = wishDraftBody(draft);
        if (editor.wish) { const saved = parseManagedWish(await api(`${root}/items/${editor.wish.id}`, { method: 'PUT', body: JSON.stringify(body) })); if (saved.id !== editor.wish.id || saved.wishlistId !== selected.id) throw new WishManagementError(); setEditor(null); await loadDetail(selected.id); await loadLists(); }
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
  const button = (label: string, action: () => void, disabled = blocked) => <Pressable accessibilityRole="button" disabled={disabled} style={[s.button, disabled && s.disabled]} onPress={action}><Text style={s.buttonText}>{label}</Text></Pressable>;
  const status = <>{busy && <ActivityIndicator accessibilityLabel="處理願望中" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!ready && button('重試安全恢復', () => void initialize(), busy)}{pending && <View style={s.card}><Text style={s.text}>有上次待確認建立。重試使用相同識別碼，不會建立重複願望。</Text>{button('確認上次建立', () => void retryCreate(), busy || !ready)}</View>}</>;
  return <View style={s.flex}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={s.title}>{selected ? selected.title : '我的願望'}</Text>{!editor && status}
    {selected ? <>
      {button('返回清單', () => { selectedId.current = null; setSelected(null); setWishes([]); }, busy)}
      <Text style={s.text}>{selected.isPublic ? '公開清單：未隱藏願望與備註可供他人查看' : '私人清單：只有自己可查看'} · {selected.count}/{selected.maxItems}</Text>
      {button('編輯清單與公開設定', () => openEditor({ kind: 'LIST', list: selected }))}{button('新增願望', () => openEditor({ kind: 'ITEM' }))}
      {wishes.length === 0 && !busy && <Text style={s.text}>這個清單還沒有願望，先記下想找的好物。</Text>}
      {wishes.map(w => <View key={w.id} style={s.card}><Text style={s.heading}>{w.name}</Text><Text style={s.text}>{w.maxPrice === null ? '未設定預算' : `最高預算 ${w.priceCurrency ?? '幣別未確認'} ${w.maxPrice}`}{w.isHidden ? ' · 已隱藏' : ''}{w.isPurchased ? ' · 已完成' : ''}</Text>{!!w.notes && <Text style={s.text}>{w.notes}</Text>}{!!w.link && <Text style={s.text}>參考連結：{w.link}</Text>}
        {button('編輯願望', () => openEditor({ kind: 'ITEM', wish: w }))}{button(w.isHidden ? '取消隱藏' : '隱藏願望', () => void mutate('/items/' + w.id, { isHidden: !w.isHidden }))}
        {button(w.isPurchased ? '取消完成' : '標記完成', () => void mutate('/items/' + w.id, { isPurchased: !w.isPurchased }))}
        {button('查附近符合商品', () => onExplore(w.id), busy || w.isHidden || w.isPurchased)}
        {button('刪除願望', () => Alert.alert('刪除願望', `確定刪除「${w.name}」？無法復原。`, [{ text: '取消', style: 'cancel' }, { text: '刪除', style: 'destructive', onPress: () => void mutate('/items/' + w.id) }]))}
      </View>)}
      {wishCursor !== null && button('載入更多願望', () => void read(() => loadDetail(selected.id, wishCursor)), busy)}
      {button('重新載入', () => void read(() => loadDetail(selected.id)), busy)}
      {button('刪除整個清單', () => Alert.alert('刪除清單', `確定刪除「${selected.title}」及其中 ${selected.count} 個願望？無法復原。`, [{ text: '取消', style: 'cancel' }, { text: '全部刪除', style: 'destructive', onPress: () => void mutate('/lists/' + selected.id) }]))}
    </> : <>{button('建立願望清單', () => openEditor({ kind: 'LIST' }))}{!busy && lists.length === 0 && <Text style={s.text}>用願望清單記下想找的好物，隨時查找附近商品。</Text>}{lists.map(l => <View key={l.id} style={s.card}><Text style={s.heading}>{l.title}</Text><Text style={s.text}>{l.isPublic ? '公開' : '私人'} · {l.count} 個願望</Text>{button('查看清單', () => selectList(l.id), busy)}</View>)}{listCursor !== null && button('載入更多清單', () => void read(() => loadLists(listCursor)), busy)}{button('重新載入清單', () => void read(() => loadLists()), busy)}</>}
  </ScrollView><Modal visible={editor !== null} animationType="slide" onRequestClose={() => { if (!busy) setEditor(null); }}><SafeAreaView style={s.flex}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={s.title}>{editor?.kind === 'LIST' ? '願望清單' : '願望內容'}</Text>{status}
    {editor?.kind === 'LIST' ? <><TextInput style={s.input} accessibilityLabel="清單名稱" placeholder="清單名稱" value={title} onChangeText={setTitle} editable={!blocked} maxLength={200} /><TextInput style={s.input} accessibilityLabel="清單說明" placeholder="說明（公開清單會顯示）" value={description} onChangeText={setDescription} editable={!blocked} multiline maxLength={1000} /><Pressable accessibilityRole="switch" accessibilityState={{ checked: isPublic, disabled: blocked }} disabled={blocked} style={s.button} onPress={() => setPublic(v => !v)}><Text style={s.buttonText}>{isPublic ? '公開清單' : '私人清單（預設）'} · 點擊切換</Text></Pressable></> : <>{(['name', 'notes', 'link', 'budget', 'currency'] as const).map((field, index) => <TextInput key={field} style={s.input} accessibilityLabel={['願望名稱', '備註', '參考商品連結', '最高預算', '預算幣別'][index]} placeholder={['願望名稱', '備註（公開清單會顯示）', 'http(s)商品連結（選填）', '最高預算，留空不限', '幣別，例如TWD'][index]} value={draft[field]} onChangeText={value => setDraft(old => ({ ...old, [field]: value }))} editable={!blocked} multiline={field === 'notes'} keyboardType={field === 'budget' ? 'decimal-pad' : field === 'link' ? 'url' : 'default'} autoCapitalize={field === 'link' ? 'none' : field === 'currency' ? 'characters' : 'sentences'} />)}<Text style={s.text}>連結先存為參考資料，不會自動擷取網站或執行AI。願望照片入口仍在整合。</Text></>}
    {button('儲存', () => void save())}{button(pending ? '稍後確認' : '取消', () => setEditor(null), busy)}
  </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal></View>;
}
const s = StyleSheet.create({ flex: { flex: 1, backgroundColor: '#F8F7F3' }, content: { padding: 24, gap: 16 }, title: { fontSize: 28, fontWeight: '800', color: '#173E36' }, heading: { fontSize: 20, fontWeight: '700', color: '#173E36' }, text: { fontSize: 16, lineHeight: 24, color: '#384D46' }, error: { color: '#A52626', fontSize: 15 }, card: { padding: 20, gap: 12, backgroundColor: '#FFF', borderRadius: 16 }, button: { minHeight: 48, padding: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#173E36' }, buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' }, disabled: { opacity: 0.5 }, input: { minHeight: 52, padding: 14, borderWidth: 1, borderColor: '#B4BDB4', borderRadius: 12, backgroundColor: '#FFF', color: '#173E36', fontSize: 16 } });
