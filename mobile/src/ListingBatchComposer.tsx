import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ImageManipulator, ImageRef, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { ApiError, createApi } from './api';
import { confirmedBatchCandidates, mergeListingAiSuggestions, parseListingAiState, restoreBatchCaptureOrder, type ListingAiDraft, type ListingAiField, type ListingAiState, type ListingAiTouched } from './listingAiDraft';
import { buildListingBody, CATEGORIES, emptyListingForm, ListingFormError, parsePhotoRecord, taiwanDate, type ListingForm, type PhotoRecord, uuid } from './listingForm';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { jpegPhotoUploadForm } from './photoUploadForm';
import { uploadPhotoRecord } from './photoUploadRecovery';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
import { parseSellerDraft, restoreSellerForm, sellerDraftFromCard, SellerDraftSync } from './listingSellerDraft';

type Card = { key: string; clientListingId: string; uri: string; local: boolean; record?: PhotoRecord;
  ai: ListingAiState['status']; draft: ListingAiDraft | null; form: ListingForm; touched: ListingAiTouched; error: string; confirmed: boolean; published: boolean };
const MAX_ITEMS = 12;
const initialCard = (key: string, uri: string, local: boolean, record?: PhotoRecord): Card => ({ key,
  clientListingId: Crypto.randomUUID(), uri, local, record, ai: 'SKIPPED', draft: null,
  form: { ...emptyListingForm }, touched: {}, error: '', confirmed: false, published: false });
const applyAi = (card: Card, state: ListingAiState): Card => {
  if (!state.draft) return { ...card, ai: state.status, draft: null, error: '' };
  return { ...card, ai: state.status, draft: state.draft, error: '', confirmed: false,
    form: mergeListingAiSuggestions(card.form, state.draft, card.touched) };
};
const itemForm = (card: Card, shared: ListingForm): ListingForm => ({ ...card.form,
  county: shared.county, district: shared.district, latitude: shared.latitude, longitude: shared.longitude,
  meetup: shared.meetup, shipping: shared.shipping, negotiable: shared.negotiable, consent: shared.consent, expiryDate: shared.expiryDate });
function releaseLocal(card: Card) {
  if (!card.local) return;
  const root = Paths.cache.uri.replace(/\/$/, '') + '/';
  if (card.uri.startsWith(root) && !card.uri.includes('/../')) {
    try { const file = new File(card.uri); if (file.exists) file.delete(); } catch { /* cache may already be gone */ }
  }
}

export function ListingBatchComposer({ api, apiUrl, userId, token, onClose, onAdvanced, onPublished }: {
  api: ReturnType<typeof createApi>; apiUrl: string; userId: number; token: string;
  onClose: () => void; onAdvanced: () => void; onPublished: (count: number) => void;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [legacyPhotos, setLegacyPhotos] = useState<PhotoRecord[]>([]);
  const [legacyRecoveryError, setLegacyRecoveryError] = useState(false);
  const [shared, setShared] = useState<ListingForm>({ ...emptyListingForm });
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [captureProgress, setCaptureProgress] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [expiryPicker, setExpiryPicker] = useState(false);
  const keyRef = useRef<string | null>(null), polling = useRef(false), active = useRef(true), busyRef = useRef(false);
  const sellerSync = useRef<SellerDraftSync | null>(null);
  const changeShared = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => {
    setShared(old => ({ ...old, [key]: value }));
    setCards(old => old.map(card => ({ ...card, confirmed: false })));
  };
  const changeCard = <K extends ListingAiField>(key: string, field: K, value: ListingForm[K]) => setCards(old => old.map(card =>
    card.key === key ? { ...card, touched: { ...card.touched, [field]: true }, form: { ...card.form, [field]: value }, confirmed: false } : card));
  const begin = () => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); setError(''); return true; };
  const end = () => { busyRef.current = false; setBusy(false); };

  useEffect(() => {
    active.current = true;
    const sync = new SellerDraftSync(async (mediaId, expectedVersion, draft) => {
      const reply = await api<{ mediaId: string; version: number }>(`/listing-media/${mediaId}/seller-draft`,
        { method: 'PUT', body: JSON.stringify({ expectedVersion, draft }) });
      if (reply.mediaId !== mediaId) throw new Error('PRIVATE_DRAFT_BAD_ACK');
      return reply.version;
    }, failure => { if (active.current) setError(failure instanceof ApiError && failure.code === 'SELLER_DRAFT_CONFLICT'
      ? '這件商品已在其他裝置更新；目前編輯尚未儲存，請勿直接離開，先確認內容。'
      : '商品編輯尚未安全儲存；請保持此畫面並稍後重試。'); });
    sellerSync.current = sync;
    void (async () => {
      try {
        const key = await pendingRequestKey(apiUrl, userId, 'listing');
        const [journal, response, legacy] = await Promise.all([privatePendingStore.get(key),
          api<{ items: unknown[] }>('/listing-media/unused?purpose=BATCH_ITEM'),
          api<{ items: unknown[] }>('/listing-media/unused?purpose=LEGACY_UNKNOWN').catch(() => null)]);
        if (!Array.isArray(response.items)) throw new Error('UNUSED_MEDIA_RESPONSE');
        let olderPhotos: PhotoRecord[] = [], olderFailed = !legacy;
        try {
          if (legacy && !Array.isArray(legacy.items)) throw new Error('LEGACY_MEDIA_RESPONSE');
          olderPhotos = (legacy?.items ?? []).map(raw => parsePhotoRecord(raw, apiUrl, __DEV__));
        } catch { olderFailed = true; }
        const recovered = restoreBatchCaptureOrder(response.items, MAX_ITEMS).map(raw => {
          const record = parsePhotoRecord(raw, apiUrl, __DEV__);
          const row = raw as Record<string, unknown>;
          const state = parseListingAiState({ mediaId: record.id, status: row.aiDraftStatus, draft: row.aiDraft ?? null }, record.id);
          const restored = parseSellerDraft(row.sellerDraft ?? null);
          if (!Number.isSafeInteger(row.sellerDraftVersion) || (row.sellerDraftVersion as number) < 0) throw new Error('PRIVATE_DRAFT_BAD_VERSION');
          sync.hydrate(record.id, row.sellerDraftVersion as number, restored);
          const aiCard = applyAi(initialCard(record.id, record.imageUrl, false, record), state);
          return restored ? { ...aiCard, clientListingId: restored.clientListingId,
            form: restoreSellerForm(aiCard.form, restored, state.draft), touched: restored.touched } : aiCard;
        });
        if (active.current) { keyRef.current = key; setPending(journal); setCards(recovered);
          setLegacyPhotos(olderPhotos); setLegacyRecoveryError(olderFailed);
          setReady(true); }
      } catch { if (active.current) setError('暫時無法安全恢復先前的商品照片或待確認刊登，請稍後重試。'); }
    })();
    return () => { active.current = false; sync.dispose(); if (sellerSync.current === sync) sellerSync.current = null; };
  }, [api, apiUrl, userId]);

  useEffect(() => {
    if (!ready || !sellerSync.current) return;
    for (const card of cards) if (card.record && !card.published)
      sellerSync.current.queue(card.record.id, sellerDraftFromCard(card));
  }, [cards, ready]);

  useEffect(() => {
    if (!ready || !cards.some(card => card.record && ['PENDING', 'PROCESSING'].includes(card.ai))) return;
    const timer = setInterval(() => {
      if (polling.current) return; polling.current = true;
      void (async () => {
        for (const card of cards.filter(c => c.record && ['PENDING', 'PROCESSING'].includes(c.ai))) {
          try {
            const raw = await api<unknown>(`/listing-media/${card.record!.id}/ai-draft`);
            const state = parseListingAiState(raw, card.record!.id);
            if (active.current) setCards(old => old.map(current => current.key === card.key ? applyAi(current, state) : current));
          } catch { /* retain queue state; explicit retry remains available */ }
        }
      })().finally(() => { polling.current = false; });
    }, 3000);
    return () => clearInterval(timer);
  }, [ready, cards.map(card => `${card.key}:${card.ai}`).join(',')]);

  async function prepare(asset: ImagePicker.ImagePickerAsset) {
    const manipulator = ImageManipulator.manipulate(asset.uri); let rendered: ImageRef | undefined;
    try {
      if (Math.max(asset.width, asset.height) > 1600) manipulator.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
      rendered = await manipulator.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: false });
      return initialCard(Crypto.randomUUID(), saved.uri, true);
    } finally { rendered?.release(); manipulator.release(); }
  }
  async function upload(card: Card) {
    try {
      const form = jpegPhotoUploadForm(card.key, card.uri, 'listing-photo.jpg', 'BATCH_ITEM');
      const record = await uploadPhotoRecord(api, apiUrl, card.key, form, __DEV__);
      if (!sellerSync.current?.has(record.id)) sellerSync.current?.hydrate(record.id, 0, null);
      setCards(old => old.map(current => current.key === card.key ? { ...current, record } : current));
      const state = parseListingAiState(await api<unknown>(`/listing-media/${record.id}/ai-draft`, { method: 'POST' }), record.id);
      setCards(old => old.map(current => current.key === card.key ? applyAi({ ...current, record }, state) : current));
    } catch (failure) {
      const message = failure instanceof ApiError && failure.code === 'LISTING_AI_UNAVAILABLE'
        ? 'AI 尚未對此帳號開放；照片已私密保存，可稍後重試或手動編輯。' : '照片上傳或 AI 排隊未完成；請重試。';
      setCards(old => old.map(current => current.key === card.key ? { ...current, error: message, ai: 'FAILED' } : current));
    }
  }
  async function select(camera: boolean) {
    if (!ready || pending || !begin()) return;
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new ListingFormError('未授予相機權限；也可以批次選擇相簿照片。');
      let remaining = MAX_ITEMS - cards.filter(card => !card.published).length;
      if (remaining < 1) throw new ListingFormError('一次最多處理12件；請先確認目前商品。');
      if (camera) {
        while (remaining > 0) {
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
          if (result.canceled) break;
          for (const asset of result.assets.slice(0, 1)) {
            const card = await prepare(asset);
            setCards(old => [...old, card]); remaining--;
            // Persist each shot before reopening the camera. A background kill
            // must not discard every previously captured item in this session.
            setCaptureProgress(`正在私密儲存第 ${MAX_ITEMS - remaining} 件照片，完成後繼續拍照…`);
            await upload(card);
            setCaptureProgress('');
          }
        }
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 1, exif: false });
        if (result.canceled) return;
        for (const [index, asset] of result.assets.slice(0, remaining).entries()) {
          const card = await prepare(asset);
          setCards(old => [...old, card]);
          setCaptureProgress(`正在私密儲存第 ${index + 1}／${Math.min(result.assets.length, remaining)} 件照片…`);
          await upload(card);
        }
      }
    } catch (failure) { setError(failure instanceof ListingFormError ? failure.message : '無法取得或處理照片，請稍後重試。'); }
    finally { setCaptureProgress(''); end(); }
  }
  async function retry(card: Card) {
    if (!begin()) return;
    try {
      if (!card.record) await upload(card);
      else {
        const state = parseListingAiState(await api<unknown>(`/listing-media/${card.record.id}/ai-draft`, { method: 'POST' }), card.record.id);
        setCards(old => old.map(current => current.key === card.key ? applyAi(current, state) : current));
      }
    } catch { setError('辨識重試未成功，照片仍保留在私人草稿。'); } finally { end(); }
  }
  async function adoptLegacy(record: PhotoRecord) {
    if (!ready || pending || cards.filter(card => !card.published).length >= MAX_ITEMS || !begin()) return;
    try {
      const adopted = await api<{ mediaId: string; capturePurpose: string }>(`/listing-media/${record.id}/capture-purpose`,
        { method: 'PUT', body: JSON.stringify({ capturePurpose: 'BATCH_ITEM' }) });
      if (adopted.mediaId !== record.id || adopted.capturePurpose !== 'BATCH_ITEM') throw new Error('BAD_ADOPTION_ACK');
      sellerSync.current?.hydrate(record.id, 0, null);
      setCards(old => [...old, initialCard(record.id, record.imageUrl, false, record)]);
      setLegacyPhotos(old => old.filter(photo => photo.id !== record.id));
      const state = parseListingAiState(await api<unknown>(`/listing-media/${record.id}/ai-draft`, { method: 'POST' }), record.id);
      setCards(old => old.map(card => card.key === record.id ? applyAi(card, state) : card));
    } catch (failure) {
      setError(failure instanceof ApiError && failure.code === 'LISTING_AI_UNAVAILABLE'
        ? '舊照片已加入私人批次；AI 尚未開放，可手動編輯或稍後重試。'
        : '舊照片加入狀態未確認；請重新開啟後檢查，避免重複操作。');
    } finally { end(); }
  }
  async function remove(card: Card) {
    if (!begin()) return;
    try {
      if (card.record) await api(`/listing-media/${card.record.id}`, { method: 'DELETE' });
      if (card.record) sellerSync.current?.discard(card.record.id);
      releaseLocal(card); setCards(old => old.filter(current => current.key !== card.key));
    } catch { setError('尚未確認照片已移除；請稍後重試。'); } finally { end(); }
  }
  async function locate() {
    if (!begin()) return;
    try {
      if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new ListingFormError('未授予定位；可在下方手動填寫縣市與行政區。');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const place = (await Location.reverseGeocodeAsync(current.coords)).at(0);
      setCards(old => old.map(card => ({ ...card, confirmed: false })));
      setShared(old => ({ ...old, latitude: current.coords.latitude.toFixed(6), longitude: current.coords.longitude.toFixed(6),
        county: place?.city || place?.region || old.county, district: place?.district || place?.subregion || old.district }));
      if (!place?.district && !place?.subregion) setError('已取得約略位置，請確認或補上行政區。');
    } catch (failure) { setError(failure instanceof ListingFormError ? failure.message : '無法取得位置，請手動設定。'); } finally { end(); }
  }
  async function reconcile() {
    if (!pending || !keyRef.current || !begin()) return;
    try {
      const body = JSON.parse(pending) as { mediaIds?: string[] };
      const result = await api<{ id: string; status: string }>('/listings', { method: 'POST', body: pending });
      if (!uuid(result.id)) throw new Error('INVALID_RESPONSE');
      await privatePendingStore.clear(keyRef.current, pending);
      setPending(null);
      for (const card of cards) if (body.mediaIds?.includes(card.record?.id ?? '')) sellerSync.current?.discard(card.record!.id);
      setCards(old => old.map(card => body.mediaIds?.includes(card.record?.id ?? '') ? { ...card, published: true } : card));
      Alert.alert('已確認先前刊登', '同一筆操作已安全確認，不會重複建立商品。');
    } catch { setError('前次刊登結果仍未確認。請稍後重試；不會建立另一筆商品。'); } finally { end(); }
  }
  function confirmCard(card: Card) {
    if (!card.record || card.published || busy || pending) return;
    if (card.confirmed) { setCards(old => old.map(current => current.key === card.key ? { ...current, confirmed: false } : current)); return; }
    try {
      buildListingBody(itemForm(card, shared), card.clientListingId, [card.record.id], true);
      setCards(old => old.map(current => current.key === card.key ? { ...current, confirmed: true, error: '' } : current));
    } catch (failure) {
      setCards(old => old.map(current => current.key === card.key ? { ...current, confirmed: false,
        error: failure instanceof ListingFormError ? failure.message : '請逐欄確認商品資料後再刊登。' } : current));
    }
  }
  async function publishAll() {
    if (!ready || pending || !keyRef.current || !begin()) return;
    let count = 0, candidate: string | null = null;
    try {
      for (const card of cards) if (card.record && !card.published)
        sellerSync.current?.queue(card.record.id, sellerDraftFromCard(card));
      if (sellerSync.current && !await sellerSync.current.flushAll()) return;
      const confirmed = confirmedBatchCandidates(cards);
      if (!confirmed.length) throw new ListingFormError('請先逐件確認要刊登的商品。');
      for (const card of confirmed) {
        if (!card.record) throw new ListingFormError('仍有照片尚未上傳成功');
        const body = JSON.stringify(buildListingBody(itemForm(card, shared), card.clientListingId, [card.record.id], true));
        candidate = body;
        await privatePendingStore.save(keyRef.current, body);
        setPending(body);
        const result = await api<{ id: string; status: string }>('/listings', { method: 'POST', body });
        if (!uuid(result.id) || result.status !== 'ACTIVE') throw new Error('UNCONFIRMED_PUBLICATION');
        await privatePendingStore.clear(keyRef.current, body);
        setPending(null); candidate = null; count++;
        sellerSync.current?.discard(card.record.id);
        releaseLocal(card); setCards(old => old.map(current => current.key === card.key ? { ...current, published: true } : current));
      }
      if (count) onPublished(count);
    } catch (failure) {
      if (candidate && failure instanceof ApiError && [400, 403, 422].includes(failure.status)) {
        try { await privatePendingStore.clear(keyRef.current, candidate); setPending(null); }
        catch { setError('待確認操作的安全儲存狀態未知，請稍後重試恢復。'); return; }
      }
      setError(`${count ? `已有 ${count} 件成功刊登；` : ''}${failure instanceof ListingFormError ? failure.message : failure instanceof ApiError && failure.status === 403
        ? '刊登前須先驗證手機或 Email；其餘照片仍保留。' : '有商品尚未確認刊登。請重試待確認操作，不會重複建立。'}`);
    } finally { end(); }
  }
  async function leave(action: () => void) {
    if (busyRef.current) return;
    if (cards.some(card => card.local && !card.record)) {
      Alert.alert('照片尚未上傳', '尚未上傳成功的照片在離開後可能無法恢復。請先重試，或確認捨棄這些本機照片。',
        [{ text: '繼續編輯', style: 'cancel' }, { text: '仍要離開', style: 'destructive', onPress: () => void leaveAfterFlush(action) }]);
      return;
    }
    await leaveAfterFlush(action);
  }
  async function leaveAfterFlush(action: () => void) {
    if (busyRef.current) return;
    for (const card of cards) if (card.record && !card.published)
      sellerSync.current?.queue(card.record.id, sellerDraftFromCard(card));
    if (sellerSync.current && !await sellerSync.current.flushAll()) return;
    action();
  }
  const input = (value: string, label: string, onChangeText: (text: string) => void, numeric = false, multiline = false) =>
    <TextInput accessibilityLabel={label} placeholder={label} value={value} onChangeText={onChangeText} editable={!busy && !pending}
      keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} style={[s.input, multiline && s.multiline]} />;
  return <Modal visible animationType="slide" onRequestClose={() => void leave(onClose)}><SafeAreaProvider><SafeAreaView style={s.screen}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><Text accessibilityRole="header" testID="listing-batch-title" style={s.title}>連續拍照刊登</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void leave(onClose)} style={s.chip}><Text style={s.text}>稍後繼續</Text></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Text style={s.text}>一件商品拍一張照片；相機可連續拍到按取消，相簿可一次選多張。AI 逐件產生私人草稿，你確認後才會公開。</Text>
      {!ready && <Text style={s.small}>正在恢復私密照片與待確認操作…</Text>}
      {!!pending && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void reconcile()} style={s.button}><Text style={s.white}>確認先前未完成的刊登</Text></Pressable>}
      <View style={s.row}><Pressable accessibilityRole="button" disabled={busy || !ready || !!pending} onPress={() => void select(true)} style={s.button}><Text style={s.white}>連續拍照</Text></Pressable><Pressable accessibilityRole="button" disabled={busy || !ready || !!pending} onPress={() => void select(false)} style={s.button}><Text style={s.white}>批次選照片</Text></Pressable></View>
      {!!captureProgress && <Text accessibilityLiveRegion="polite" style={s.small}>{captureProgress}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void leave(onAdvanced)} style={s.chip}><Text style={s.text}>同件商品多角度拍攝／手動精細刊登</Text></Pressable>
      <Text style={s.section}>共用刊登位置與交付方式</Text>
      <Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => void locate()} style={s.chip}><Text style={s.text}>使用目前位置並自動填行政區</Text></Pressable>
      {input(shared.county, '縣市', value => changeShared('county', value))}{input(shared.district, '行政區', value => changeShared('district', value))}
      <Text style={s.small}>公開地圖只保存約 2 公里模糊位置。無法自動取得行政區時可手動修正。</Text>
      {input(shared.latitude, '位置緯度', value => changeShared('latitude', value), true)}{input(shared.longitude, '位置經度', value => changeShared('longitude', value), true)}
      {(['meetup', 'shipping', 'negotiable', 'consent'] as const).map(key => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: shared[key] }} disabled={busy || !!pending} onPress={() => changeShared(key, !shared[key])} style={s.chip}><Text style={s.text}>{shared[key] ? '☑' : '☐'} {key === 'meetup' ? '可面交' : key === 'shipping' ? '可寄送' : key === 'negotiable' ? '價格可議' : '我確認資料屬實並同意公開照片與約略位置'}</Text></Pressable>)}
      <Text style={s.section}>失效日期（選填）</Text><Text style={s.small}>{shared.expiryDate || '未設定：刊登後 30 天'}</Text>
      <Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => setExpiryPicker(true)} style={s.chip}><Text style={s.text}>選擇失效日期</Text></Pressable>
      {!!shared.expiryDate && <Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => changeShared('expiryDate', '')} style={s.chip}><Text style={s.text}>清除，使用預設 30 天</Text></Pressable>}
      {expiryPicker && !busy && !pending && <DateTimePicker accessibilityLabel="失效日期" value={shared.expiryDate ? new Date(shared.expiryDate + 'T12:00:00+08:00') : new Date()}
        minimumDate={new Date()} mode="date" timeZoneName="Asia/Taipei" locale="zh-TW" onChange={(_event, date) => { setExpiryPicker(Platform.OS === 'ios'); if (date) changeShared('expiryDate', taiwanDate(date)); }} />}
      <Text style={s.small}>重新開啟草稿時，位置、交付方式與失效日期需再次確認；精確定位不保存在私人商品草稿。</Text>
      <Text style={s.section}>商品草稿 {cards.filter(card => !card.published).length}/{MAX_ITEMS}</Text>
      {legacyRecoveryError && <Text style={s.error}>舊版未分類照片暫時無法讀取；批次照片仍可使用。請稍後重開再檢查舊照片。</Text>}
      {legacyPhotos.length > 0 && <View style={s.card}><Text style={s.cardTitle}>舊版未分類照片</Text>
        <Text style={s.small}>舊版照片可能是同件商品的多角度照；只有你明確選擇後，才會當成一件批次商品。</Text>
        {legacyPhotos.map(photo => <View key={photo.id} style={s.row}><Image source={{ uri: photo.thumbnailUrl,
          headers: { Authorization: `Bearer ${token}` } }} style={s.image} accessibilityLabel="舊版未分類商品照片" />
          <Pressable accessibilityRole="button" disabled={busy || !!pending || cards.filter(card => !card.published).length >= MAX_ITEMS}
            onPress={() => void adoptLegacy(photo)} style={s.chip}><Text style={s.text}>將此照片作為一件商品</Text></Pressable></View>)}
      </View>}
      {cards.map((card, index) => <View key={card.key} style={s.card}>
        <View style={s.row}><Image source={card.local ? { uri: card.uri } : { uri: card.uri, headers: { Authorization: `Bearer ${token}` } }} style={s.image} accessibilityLabel={`第${index + 1}件商品照片`} /><View style={s.grow}><Text style={s.cardTitle}>第 {index + 1} 件 {card.published ? '· 已刊登' : ''}</Text><Text style={s.small}>{card.ai === 'COMPLETED' ? 'AI 草稿已完成，請確認' : card.ai === 'PENDING' ? 'AI 排隊中' : card.ai === 'PROCESSING' ? 'AI 辨識中' : card.ai === 'FAILED' ? 'AI 未完成，可重試或手動修正' : '等待上傳'}</Text></View></View>
        {!!card.draft && <><Text style={s.small}>AI 二手參考價：{card.draft.estimatedPriceLowTwd === null ? '無法可靠估價' : `NT$ ${card.draft.estimatedPriceLowTwd}–${card.draft.estimatedPriceHighTwd}`}</Text><Text style={s.small}>{card.draft.priceBasis || '圖片不足以推定市場價格'}</Text><Text style={s.small}>待確認：{card.draft.uncertainties.join('、') || '請仍確認實際商品狀況'}</Text>{Object.keys(card.touched).length > 0 && <Pressable accessibilityRole="button" disabled={busy || !!pending} style={s.chip} onPress={() => setCards(old => old.map(current => current.key === card.key ? applyAi({ ...current, touched: {} }, { mediaId: card.record!.id, status: 'COMPLETED', draft: card.draft }) : current))}><Text style={s.text}>重新套用 AI 建議</Text></Pressable>}</>}
        {input(card.form.title, `第${index + 1}件商品名稱`, value => changeCard(card.key, 'title', value))}
        {input(card.form.description, `第${index + 1}件商品描述`, value => changeCard(card.key, 'description', value), false, true)}
        <View style={s.row}>{input(card.form.brand, `第${index + 1}件品牌（可留空）`, value => changeCard(card.key, 'brand', value))}{input(card.form.price, `第${index + 1}件售價 TWD`, value => changeCard(card.key, 'price', value), true)}</View>
        <View style={s.row}>{(['USED', 'NEW'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: card.form.condition === value }} disabled={busy || !!pending} style={[s.chip, card.form.condition === value && s.selected]} onPress={() => changeCard(card.key, 'condition', value)}><Text style={s.text}>{value === 'USED' ? '二手' : '新品'}</Text></Pressable>)}</View>
        <View style={s.wrap}>{CATEGORIES.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: card.form.category === value }} disabled={busy || !!pending} style={[s.chip, card.form.category === value && s.selected]} onPress={() => changeCard(card.key, 'category', value)}><Text style={s.small}>{label}</Text></Pressable>)}</View>
        {!!card.error && <Text style={s.error}>{card.error}</Text>}
        {!card.published && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: card.confirmed, disabled: busy || !!pending || !card.record }}
          disabled={busy || !!pending || !card.record} onPress={() => confirmCard(card)} style={s.chip}><Text style={s.text}>{card.confirmed ? '☑' : '☐'} 我已逐欄確認第 {index + 1} 件商品的照片、內容及售價</Text></Pressable>}
        {!card.published && <View style={s.row}><Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => void retry(card)} style={s.chip}><Text style={s.text}>重試 AI</Text></Pressable><Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => void remove(card)} style={s.chip}><Text style={s.text}>移除照片</Text></Pressable></View>}
      </View>)}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{busy && <ActivityIndicator accessibilityLabel="處理照片或刊登中" />}
      {cards.some(card => !card.published) && <Pressable accessibilityRole="button" disabled={busy || !ready || !!pending || confirmedBatchCandidates(cards).length === 0} onPress={() => void publishAll()} style={s.button}><Text style={s.white}>刊登已逐件確認的商品（{confirmedBatchCandidates(cards).length}）</Text></Pressable>}
      <Text style={s.small}>AI 參考價不是已驗證行情；無法可靠估價的商品仍須由賣家決定售價。未刊登照片只對本人可見，稍後可恢復或刪除。</Text>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView></SafeAreaProvider></Modal>;
}

const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: iosColors.background }, flex: { flex: 1 },
  header: { minHeight: 56, paddingHorizontal: iosSpacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: iosColors.separator },
  content: { padding: iosSpacing.lg, gap: iosSpacing.md, paddingBottom: 48 }, title: { ...iosType.title, color: iosColors.label },
  text: { ...iosType.body, color: iosColors.label }, small: { ...iosType.subheadline, color: iosColors.secondaryLabel },
  section: { ...iosType.headline, color: iosColors.label, marginTop: iosSpacing.md }, row: { flexDirection: 'row', alignItems: 'center', gap: iosSpacing.sm }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: iosSpacing.xs }, grow: { flex: 1 },
  button: { flex: 1, minHeight: minimumTapSize, backgroundColor: iosColors.tint, borderRadius: iosRadius.control, alignItems: 'center', justifyContent: 'center', padding: iosSpacing.sm },
  white: { ...iosType.headline, color: iosColors.white }, chip: { minHeight: minimumTapSize, borderRadius: iosRadius.control, backgroundColor: iosColors.surface, padding: iosSpacing.sm, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator }, selected: { borderColor: iosColors.tint, backgroundColor: iosColors.tintSoft },
  input: { minWidth: 100, flex: 1, minHeight: 50, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.control, backgroundColor: iosColors.surface, padding: iosSpacing.sm, fontSize: 16, color: iosColors.label, ...iosShadow }, multiline: { minHeight: 108, textAlignVertical: 'top' },
  card: { padding: iosSpacing.md, gap: iosSpacing.sm, backgroundColor: iosColors.surface, borderRadius: iosRadius.card, ...iosShadow }, cardTitle: { ...iosType.headline, color: iosColors.label }, image: { width: 100, height: 100, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary },
  error: { ...iosType.subheadline, color: iosColors.danger, backgroundColor: iosColors.dangerSoft, padding: iosSpacing.sm, borderRadius: iosRadius.control },
});
