import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ImageManipulator, ImageRef, SaveFormat } from 'expo-image-manipulator';
import { ApiError, createApi } from './api';
import { confirmedBatchCandidates, parseListingAiState, polledReviewStateAfterAi, restoreBatchCaptureOrder, reviewStateAfterAi, type ListingAiDraft, type ListingAiField, type ListingAiState, type ListingAiTouched } from './listingAiDraft';
import { buildListingBody, CATEGORIES, emptyListingForm, firstListingPublishIssue, ListingFormError, parsePhotoRecord, type ListingForm, type PhotoRecord, uuid } from './listingForm';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { jpegPhotoUploadForm } from './photoUploadForm';
import { uploadPhotoRecord } from './photoUploadRecovery';
import { captureCameraSequence } from './listingCaptureFlow';
import { listPrivateCaptures, preservePrivateCapture, releasePrivateCapture } from './privateCaptureStore';
import { loadPrivateMediaPages, reconcilePrivateBatchCaptures } from './listingCaptureRecovery';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
import { parseSellerDraft, restoreSellerForm, sellerDraftFromCard, SellerDraftSync } from './listingSellerDraft';
import { PrivateListingPhoto } from './PrivateListingPhoto';
import { ListingExpiryPicker } from './ListingExpiryPicker';
import { MarketingAssistant } from './MarketingAssistant';

type Card = { key: string; clientListingId: string; uri: string; local: boolean; record?: PhotoRecord;
  ai: ListingAiState['status']; draft: ListingAiDraft | null; form: ListingForm; touched: ListingAiTouched; error: string; confirmed: boolean; published: boolean };
const MAX_ITEMS = 12;
const initialCard = (key: string, uri: string, local: boolean, record?: PhotoRecord): Card => ({ key,
  clientListingId: Crypto.randomUUID(), uri, local, record, ai: 'SKIPPED', draft: null,
  form: { ...emptyListingForm }, touched: {}, error: '', confirmed: false, published: false });
const applyAi = (card: Card, state: ListingAiState): Card => {
  return { ...card, ...reviewStateAfterAi(card, state), error: '' };
};
const itemForm = (card: Card, shared: ListingForm): ListingForm => ({ ...card.form,
  county: shared.county, district: shared.district, latitude: shared.latitude, longitude: shared.longitude,
  meetup: shared.meetup, shipping: shared.shipping, negotiable: shared.negotiable, consent: shared.consent, expiryDate: shared.expiryDate });
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
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const aiAvailableRef = useRef<boolean | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [expiryPicker, setExpiryPicker] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [fieldIssue, setFieldIssue] = useState<{ key: string; message: string } | null>(null);
  const keyRef = useRef<string | null>(null), polling = useRef(false), active = useRef(true), busyRef = useRef(false);
  const sellerSync = useRef<SellerDraftSync | null>(null);
  const changeShared = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => {
    setShared(old => ({ ...old, [key]: value }));
    setCards(old => old.map(card => ({ ...card, confirmed: false })));
    setFieldIssue(null);
  };
  const changeCard = <K extends ListingAiField>(key: string, field: K, value: ListingForm[K]) => {
    setCards(old => old.map(card => card.key === key ? { ...card, touched: { ...card.touched, [field]: true },
      form: { ...card.form, [field]: value }, confirmed: false, error: '' } : card));
    setFieldIssue(null);
  };
  useEffect(() => () => flashTimers.current.forEach(clearTimeout), []);
  function showFieldIssue(card: Card, field: string, message: string) {
    const sharedField = ['location', 'delivery', 'consent', 'expiryDate'].includes(field);
    const key = sharedField ? `shared:${field}` : `${card.key}:${field}`;
    setFieldIssue({ key, message });
    flashTimers.current.forEach(clearTimeout);
    flashTimers.current = [];
    for (let step = 0; step < 6; step++) flashTimers.current.push(setTimeout(() => setHighlightKey(step % 2 === 0 ? key : null), step * 240));
    flashTimers.current.push(setTimeout(() => setHighlightKey(null), 1500));
    const position = sharedField ? offsets.current[key] : (offsets.current[`card:${card.key}`] ?? 0) + (offsets.current[key] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, position - 100), animated: true });
  }
  const issueText = (key: string) => fieldIssue?.key === key ? <Text accessibilityRole="alert" style={s.error}>{fieldIssue.message}</Text> : null;
  const begin = () => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); setError(''); return true; };
  const end = () => { busyRef.current = false; setBusy(false); };

  useEffect(() => {
    active.current = true;
    let scopeActive = true;
    keyRef.current = null; setReady(false); setCards([]); setPending(null); setAiAvailable(null); aiAvailableRef.current = null;
    setLegacyPhotos([]); setLegacyRecoveryError(false); setError('');
    const sync = new SellerDraftSync(async (mediaId, expectedVersion, draft) => {
      const reply = await api<{ mediaId: string; version: number }>(`/listing-media/${mediaId}/seller-draft`,
        { method: 'PUT', body: JSON.stringify({ expectedVersion, draft }) });
      if (reply.mediaId !== mediaId) throw new Error('PRIVATE_DRAFT_BAD_ACK');
      return reply.version;
    }, failure => { if (scopeActive && active.current) setError(failure instanceof ApiError && failure.code === 'SELLER_DRAFT_CONFLICT'
      ? '這件商品已在其他裝置更新；目前編輯尚未儲存，請勿直接離開，先確認內容。'
      : '商品編輯尚未安全儲存；請保持此畫面並稍後重試。'); });
    sellerSync.current = sync;
    void (async () => {
      try {
        const key = await pendingRequestKey(apiUrl, userId, 'listing');
        const loadBatch = () => loadPrivateMediaPages(cursor => api<unknown>('/listing-media/unused?purpose=BATCH_ITEM' +
          (cursor ? `&cursor=${cursor}` : '')));
        const [journal, batchItems, legacy, localCaptures, availability] = await Promise.all([privatePendingStore.get(key),
          loadBatch(),
          api<{ items: unknown[] }>('/listing-media/unused?purpose=LEGACY_UNKNOWN').catch(() => null),
          listPrivateCaptures(apiUrl, userId),
          api<{ available: boolean }>('/listing-media/ai-availability').catch(() => null)]);
        let olderPhotos: PhotoRecord[] = [], olderFailed = !legacy;
        try {
          if (legacy && !Array.isArray(legacy.items)) throw new Error('LEGACY_MEDIA_RESPONSE');
          olderPhotos = (legacy?.items ?? []).map(raw => parsePhotoRecord(raw, apiUrl, __DEV__));
        } catch { olderFailed = true; }
        // An upload can commit after the unused-list snapshot but before its
        // durable UUID lookup. Refresh that snapshot before discarding pixels.
        const captureRecovery = await reconcilePrivateBatchCaptures(batchItems, localCaptures,
          async clientUploadId => {
            const raw = await api<unknown>(`/listing-media/by-upload-id/${clientUploadId}`, { timeoutMs: 5000 });
            const record = parsePhotoRecord(raw, apiUrl, __DEV__);
            const row = raw as Record<string, unknown>;
            if (!(row.listingId === null || uuid(row.listingId)) ||
              !(row.wishItemId === null || typeof row.wishItemId === 'number' &&
                Number.isSafeInteger(row.wishItemId) && row.wishItemId > 0)) throw new Error('PHOTO_LINK_STATE_INVALID');
            return { ...record, linked: row.listingId !== null || row.wishItemId !== null };
          },
          loadBatch);
        const recovered = restoreBatchCaptureOrder(captureRecovery.items, captureRecovery.items.length).map(raw => {
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
        const localCards = captureRecovery.retryCaptures.map(capture => ({
          ...initialCard(capture.clientUploadId, capture.uri, true),
          error: '照片仍在此裝置；雲端狀態未確認，請重試私密上傳。',
        }));
        for (const clientUploadId of captureRecovery.releaseUploadIds)
          try { await releasePrivateCapture(apiUrl, userId, clientUploadId); } catch { /* retry cleanup on next open */ }
        if (scopeActive && active.current) { keyRef.current = key; setPending(journal); setCards([...recovered, ...localCards]);
          const enabled = typeof availability?.available === 'boolean' ? availability.available : null;
          aiAvailableRef.current = enabled; setAiAvailable(enabled);
          setLegacyPhotos(olderPhotos); setLegacyRecoveryError(olderFailed);
          setReady(true); }
      } catch { if (scopeActive && active.current) setError('暫時無法安全恢復先前的商品照片或待確認刊登，請稍後重試。'); }
    })();
    return () => { scopeActive = false; active.current = false; sync.dispose(); if (sellerSync.current === sync) sellerSync.current = null; };
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
            if (active.current) setCards(old => old.map(current => {
              if (current.key !== card.key) return current;
              const update = polledReviewStateAfterAi(current, state, busyRef.current);
              return update ? { ...current, ...update, error: '' } : current;
            }));
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
      const clientUploadId = Crypto.randomUUID();
      return initialCard(clientUploadId, await preservePrivateCapture(apiUrl, userId, clientUploadId, saved.uri), true);
    } finally { rendered?.release(); manipulator.release(); }
  }
  async function upload(card: Card) {
    let privatePhotoSaved = false;
    try {
      const form = jpegPhotoUploadForm(card.key, card.uri, 'listing-photo.jpg', 'BATCH_ITEM');
      const record = await uploadPhotoRecord(api, apiUrl, card.key, form, __DEV__);
      privatePhotoSaved = true;
      // Register the private draft before exposing the saved card to React's
      // effect, which queues seller edits as soon as `record` is present.
      if (!sellerSync.current?.has(record.id)) sellerSync.current?.hydrate(record.id, 0, null);
      setCards(old => old.map(current => current.key === card.key ? { ...current, record, uri: record.imageUrl, local: false } : current));
      try { await releasePrivateCapture(apiUrl, userId, card.key); } catch { /* reconcile the redundant local copy on next open */ }
      if (aiAvailableRef.current === false) return true;
      const state = parseListingAiState(await api<unknown>(`/listing-media/${record.id}/ai-draft`, { method: 'POST' }), record.id);
      setCards(old => old.map(current => current.key === card.key ? applyAi({ ...current, record, uri: record.imageUrl, local: false }, state) : current));
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'LISTING_AI_UNAVAILABLE') {
        aiAvailableRef.current = false; setAiAvailable(false);
      }
      const message = privatePhotoSaved
        ? failure instanceof ApiError && failure.code === 'LISTING_AI_UNAVAILABLE'
          ? 'AI 尚未對此帳號開放；照片已私密保存，可稍後重試或手動編輯。'
          : '照片已私密保存，但 AI 排隊未完成；請稍後重試。'
        : '照片上傳尚未確認；已停止連拍，請重試保存。';
      setCards(old => old.map(current => current.key === card.key ? { ...current, error: message, ai: 'FAILED' } : current));
      return privatePhotoSaved;
    }
  }
  async function select(camera: boolean) {
    if (!ready || pending || !begin()) return;
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new ListingFormError('未授予相機權限；也可以批次選擇相簿照片。');
      let remaining = MAX_ITEMS - cards.filter(card => !card.published).length;
      if (remaining < 1) throw new ListingFormError('一次最多處理12件；請先確認目前商品。');
      if (camera) {
        const sequence = await captureCameraSequence(remaining, async () => {
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
          return result.canceled ? null : result.assets[0] ?? null;
        }, async (asset, position) => {
          const card = await prepare(asset);
          setCards(old => [...old, card]);
          setCaptureProgress(`正在私密儲存第 ${MAX_ITEMS - remaining + position} 件照片，完成後繼續拍照…`);
          const saved = await upload(card);
          setCaptureProgress('');
          return saved;
        });
        if (sequence.stopped === 'UNSAVED') setError('最新照片尚未確認已私密保存；連拍已暫停。請在商品卡片重試上傳後再繼續。');
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 1, exif: false });
        if (result.canceled) return;
        for (const [index, asset] of result.assets.slice(0, remaining).entries()) {
          const card = await prepare(asset);
          setCards(old => [...old, card]);
          setCaptureProgress(`正在私密儲存第 ${index + 1}／${Math.min(result.assets.length, remaining)} 件照片…`);
          if (!await upload(card)) {
            setError('這張照片尚未確認已私密保存；批次處理已暫停。請重試後再選擇其餘照片。');
            break;
          }
        }
      }
    } catch (failure) { setError(failure instanceof ListingFormError ? failure.message : '無法取得或處理照片，請稍後重試。'); }
    finally { setCaptureProgress(''); end(); }
  }
  async function retry(card: Card) {
    if (card.record && aiAvailableRef.current === false) return;
    if (!begin()) return;
    setCards(old => old.map(current => current.key === card.key ? { ...current, confirmed: false } : current));
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
      if (aiAvailableRef.current !== false) {
        const state = parseListingAiState(await api<unknown>(`/listing-media/${record.id}/ai-draft`, { method: 'POST' }), record.id);
        setCards(old => old.map(card => card.key === record.id ? applyAi(card, state) : card));
      }
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'LISTING_AI_UNAVAILABLE') {
        aiAvailableRef.current = false; setAiAvailable(false);
      }
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
      if (card.local) await releasePrivateCapture(apiUrl, userId, card.key);
      setCards(old => old.filter(current => current.key !== card.key));
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
    const issue = firstListingPublishIssue(itemForm(card, shared), [card.record.id]);
    if (issue) {
      setCards(old => old.map(current => current.key === card.key ? { ...current, confirmed: false, error: '' } : current));
      showFieldIssue(card, issue.field, issue.message);
      return;
    }
    try {
      buildListingBody(itemForm(card, shared), card.clientListingId, [card.record.id], true);
      setFieldIssue(null);
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
        setCards(old => old.map(current => current.key === card.key ? { ...current, published: true } : current));
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
      Alert.alert('照片尚未上傳', '照片已保存在這台裝置的私人草稿中，重開 App 可重試；卸載 App 會遺失尚未上傳的照片。',
        [{ text: '繼續編輯', style: 'cancel' }, { text: '稍後繼續', onPress: () => void leaveAfterFlush(action) }]);
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
  async function refreshMarketingDraft(mediaId: string) {
    const rows = await loadPrivateMediaPages(cursor => api<unknown>('/listing-media/unused?purpose=BATCH_ITEM' +
      (cursor ? `&cursor=${cursor}` : '')));
    const raw = rows.find(value => typeof value === 'object' && value !== null && (value as { id?: unknown }).id === mediaId);
    if (!raw || typeof raw !== 'object') throw new Error('PRIVATE_DRAFT_NOT_FOUND');
    const row = raw as Record<string, unknown>;
    const saved = parseSellerDraft(row.sellerDraft ?? null);
    if (!saved || !Number.isSafeInteger(row.sellerDraftVersion)) throw new Error('PRIVATE_DRAFT_INVALID');
    sellerSync.current?.discard(mediaId);
    sellerSync.current?.hydrate(mediaId, row.sellerDraftVersion as number, saved);
    setCards(old => old.map(card => card.record?.id === mediaId ? { ...card,
      form: { ...card.form, ...saved.form }, touched: saved.touched, confirmed: false } : card));
  }
  const input = (value: string, label: string, onChangeText: (text: string) => void, numeric = false, multiline = false, targetKey?: string) =>
    <View style={s.inputGroup} onLayout={event => { if (targetKey && !/:(?:brand|price)$/.test(targetKey)) offsets.current[targetKey] = event.nativeEvent.layout.y; }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholder={numeric ? '請輸入數字' : '請輸入'} value={value} onChangeText={onChangeText} editable={!busy && !pending}
        keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline}
        style={[s.input, multiline && s.multiline, highlightKey === targetKey && s.highlight]} />
    </View>;
  return <Modal visible animationType="slide" onRequestClose={() => void leave(onClose)}><SafeAreaProvider><SafeAreaView style={s.screen}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><Text accessibilityRole="header" testID="listing-batch-title" style={s.title}>連續拍照刊登</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void leave(onClose)} style={s.chip}><Text style={s.text}>稍後繼續</Text></Pressable></View>
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'} contentContainerStyle={s.content}>
      <View style={s.modeCurrent}><Text style={s.modeLabel}>目前模式 · 快速刊登</Text><Text style={s.small}>每張照片建立一件商品，AI 分別補齊資訊；刊登前仍要逐件確認。</Text></View>
      <Text style={s.text}>一件商品拍一張照片；相機可連續拍到按取消，相簿可一次選多張。照片先成為私人草稿，你確認後才會公開。</Text>
      {aiAvailable === false && <Text accessibilityRole="alert" style={s.small}>此帳號的 AI 辨識尚未開放；照片仍可私密上傳、手動填寫並刊登，不會進入 AI 隊列。</Text>}
      {!ready && <Text style={s.small}>正在恢復私密照片與待確認操作…</Text>}
      {!!pending && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void reconcile()} style={s.button}><Text style={s.white}>確認先前未完成的刊登</Text></Pressable>}
      <View style={s.row}><Pressable accessibilityRole="button" disabled={busy || !ready || !!pending} onPress={() => void select(true)} style={s.button}><Text style={s.white}>連續拍照</Text></Pressable><Pressable accessibilityRole="button" disabled={busy || !ready || !!pending} onPress={() => void select(false)} style={s.button}><Text style={s.white}>批次選照片</Text></Pressable></View>
      {!!captureProgress && <Text accessibilityLiveRegion="polite" style={s.small}>{captureProgress}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void leave(onAdvanced)} style={s.modeAlternative}><Text style={s.modeAlternativeTitle}>進階模式 · 選用  ↗</Text><Text style={s.small}>同一件商品多角度拍攝，或自行逐欄精細刊登</Text></Pressable>
      <View onLayout={event => { offsets.current['shared:location'] = event.nativeEvent.layout.y; }} style={[s.group, highlightKey === 'shared:location' && s.highlight]}>
        <Text style={s.section}>商品地點 · 刊登必要</Text>
        <Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => void locate()} style={s.chip}><Text style={s.text}>使用目前位置並自動填行政區</Text></Pressable>
        {input(shared.county, '縣市', value => changeShared('county', value))}{input(shared.district, '行政區', value => changeShared('district', value))}
        <Text style={s.small}>需同時有縣市、行政區與地圖座標。公開地圖只顯示約 2 公里模糊位置。</Text>
        {input(shared.latitude, '位置緯度', value => changeShared('latitude', value), true)}{input(shared.longitude, '位置經度', value => changeShared('longitude', value), true)}
        {issueText('shared:location')}
      </View>
      <View onLayout={event => { offsets.current['shared:delivery'] = event.nativeEvent.layout.y; }} style={[s.group, highlightKey === 'shared:delivery' && s.highlight]}>
        <Text style={s.section}>交付方式 · 至少選一項</Text>
        {(['meetup', 'shipping', 'negotiable'] as const).map(key => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: shared[key] }} disabled={busy || !!pending} onPress={() => changeShared(key, !shared[key])} style={s.chip}><Text style={s.text}>{shared[key] ? '☑' : '☐'} {key === 'meetup' ? '可面交' : key === 'shipping' ? '可寄送' : '價格可議'}</Text></Pressable>)}
        {issueText('shared:delivery')}
      </View>
      <View onLayout={event => { offsets.current['shared:expiryDate'] = event.nativeEvent.layout.y; }} style={[s.group, highlightKey === 'shared:expiryDate' && s.highlight]}>
        <Text style={s.section}>失效日期 · 選用</Text><Text style={s.defaultBadge}>{shared.expiryDate ? `已自訂：${shared.expiryDate}` : '預設：刊登後 30 天'}</Text>
        <Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => setExpiryPicker(true)} style={s.chip}><Text style={s.text}>自訂失效日期</Text></Pressable>
        {!!shared.expiryDate && <Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => changeShared('expiryDate', '')} style={s.chip}><Text style={s.text}>改用預設 30 天</Text></Pressable>}
        {expiryPicker && !busy && !pending && <ListingExpiryPicker value={shared.expiryDate} onApply={date => { changeShared('expiryDate', date); setExpiryPicker(false); }} onCancel={() => setExpiryPicker(false)} />}
        {issueText('shared:expiryDate')}
      </View>
      <View onLayout={event => { offsets.current['shared:consent'] = event.nativeEvent.layout.y; }} style={[s.group, highlightKey === 'shared:consent' && s.highlight]}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: shared.consent }} disabled={busy || !!pending} onPress={() => changeShared('consent', !shared.consent)} style={s.chip}><Text style={s.text}>{shared.consent ? '☑' : '☐'} 我確認資料屬實並同意公開照片與約略位置</Text></Pressable>
        {issueText('shared:consent')}
      </View>
      <Text style={s.small}>重新開啟草稿時，位置、交付方式與失效日期需再次確認；精確定位不保存在私人商品草稿。</Text>
      <Text style={s.section}>商品草稿 {cards.filter(card => !card.published).length}/{MAX_ITEMS}</Text>
      {legacyRecoveryError && <Text style={s.error}>舊版未分類照片暫時無法讀取；批次照片仍可使用。請稍後重開再檢查舊照片。</Text>}
      {legacyPhotos.length > 0 && <View style={s.card}><Text style={s.cardTitle}>舊版未分類照片</Text>
        <Text style={s.small}>舊版照片可能是同件商品的多角度照；只有你明確選擇後，才會當成一件批次商品。</Text>
        {legacyPhotos.map(photo => <View key={photo.id} style={s.row}><PrivateListingPhoto thumbnailUrl={photo.thumbnailUrl}
          apiUrl={apiUrl} token={token} style={s.image} label="舊版未分類商品照片" />
          <Pressable accessibilityRole="button" disabled={busy || !!pending || cards.filter(card => !card.published).length >= MAX_ITEMS}
            onPress={() => void adoptLegacy(photo)} style={s.chip}><Text style={s.text}>將此照片作為一件商品</Text></Pressable></View>)}
      </View>}
      {cards.map((card, index) => <View key={card.key} onLayout={event => { offsets.current[`card:${card.key}`] = event.nativeEvent.layout.y; }} style={s.card}>
        <View onLayout={event => { offsets.current[`${card.key}:photo`] = event.nativeEvent.layout.y; }} style={[s.row, highlightKey === `${card.key}:photo` && s.highlight]}><PrivateListingPhoto localUri={card.local ? card.uri : undefined}
          thumbnailUrl={card.record?.thumbnailUrl} apiUrl={apiUrl} token={token} style={s.image} label={`第${index + 1}件商品照片`} />
          <View style={s.grow}><Text style={s.cardTitle}>第 {index + 1} 件 {card.published ? '· 已刊登' : ''}</Text><Text style={s.small}>{card.ai === 'COMPLETED' ? 'AI 草稿已完成，請確認' : card.ai === 'PENDING' ? 'AI 排隊中' : card.ai === 'PROCESSING' ? 'AI 辨識中' : card.ai === 'FAILED' ? 'AI 未完成，可重試或手動修正' : card.record ? aiAvailable === false ? '照片已私密保存，可手動編輯' : '照片已私密保存，可開始 AI 辨識' : '等待上傳'}</Text></View></View>
        {issueText(`${card.key}:photo`)}
        {!!card.draft && <><Text accessibilityLabel={`第${index + 1}件 AI 二手參考價：${card.draft.estimatedPriceLowTwd === null ? '無法可靠估價' : `NT$ ${card.draft.estimatedPriceLowTwd}–${card.draft.estimatedPriceHighTwd}`}`} style={s.small}>AI 二手參考價：{card.draft.estimatedPriceLowTwd === null ? '無法可靠估價' : `NT$ ${card.draft.estimatedPriceLowTwd}–${card.draft.estimatedPriceHighTwd}`}</Text><Text style={s.small}>{card.draft.priceBasis || '圖片不足以推定市場價格'}</Text><Text style={s.small}>待確認：{card.draft.uncertainties.join('、') || '請仍確認實際商品狀況'}</Text>{Object.keys(card.touched).length > 0 && <Pressable accessibilityRole="button" disabled={busy || !!pending} style={s.chip} onPress={() => setCards(old => old.map(current => current.key === card.key ? applyAi({ ...current, touched: {} }, { mediaId: card.record!.id, status: 'COMPLETED', draft: card.draft }) : current))}><Text style={s.text}>重新套用 AI 建議</Text></Pressable>}</>}
        {input(card.form.title, `第${index + 1}件商品名稱`, value => changeCard(card.key, 'title', value), false, false, `${card.key}:title`)}
        {issueText(`${card.key}:title`)}
        {input(card.form.description, `第${index + 1}件商品描述`, value => changeCard(card.key, 'description', value), false, true, `${card.key}:description`)}
        {issueText(`${card.key}:description`)}
        <View onLayout={event => { offsets.current[`${card.key}:brand`] = event.nativeEvent.layout.y; offsets.current[`${card.key}:price`] = event.nativeEvent.layout.y; }} style={s.row}>
          {input(card.form.brand, `第${index + 1}件品牌（可留空）`, value => changeCard(card.key, 'brand', value), false, false, `${card.key}:brand`)}
          {input(card.form.price, `第${index + 1}件售價 TWD`, value => changeCard(card.key, 'price', value), true, false, `${card.key}:price`)}
        </View>
        {issueText(`${card.key}:brand`)}{issueText(`${card.key}:price`)}
        {!!card.draft && !card.touched.price && card.draft.estimatedPriceLowTwd !== null &&
          <Text style={s.small}>目前售價由 AI 參考區間中間值預填，不是已驗證行情；刊登前請確認或修改。</Text>}
        <View onLayout={event => { offsets.current[`${card.key}:condition`] = event.nativeEvent.layout.y; }} style={[s.row, highlightKey === `${card.key}:condition` && s.highlight]}>{(['USED', 'NEW'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: card.form.condition === value }} disabled={busy || !!pending} style={[s.chip, card.form.condition === value && s.selected]} onPress={() => changeCard(card.key, 'condition', value)}><Text style={s.text}>{value === 'USED' ? '二手' : '新品'}</Text></Pressable>)}</View>
        {issueText(`${card.key}:condition`)}
        <View onLayout={event => { offsets.current[`${card.key}:category`] = event.nativeEvent.layout.y; }} style={[s.wrap, highlightKey === `${card.key}:category` && s.highlight]}>{CATEGORIES.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: card.form.category === value }} disabled={busy || !!pending} style={[s.chip, card.form.category === value && s.selected]} onPress={() => changeCard(card.key, 'category', value)}><Text style={s.small}>{label}</Text></Pressable>)}</View>
        {issueText(`${card.key}:category`)}
        {!!card.error && <Text style={s.error}>{card.error}</Text>}
        {!card.published && card.record && card.ai === 'COMPLETED' && <MarketingAssistant api={api} apiUrl={apiUrl}
          token={token} sourceMediaId={card.record.id} beforeStart={async () => {
            if (busy || !!pending || card.form.title.trim().length < 3 || card.form.description.trim().length < 10 || !card.form.price.trim()) return false;
            sellerSync.current?.queue(card.record!.id, sellerDraftFromCard(card));
            return await sellerSync.current!.flush(card.record!.id);
          }} onApproved={() => refreshMarketingDraft(card.record!.id)} />}
        {!card.published && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: card.confirmed, disabled: busy || !!pending || !card.record }}
          disabled={busy || !!pending || !card.record} onPress={() => confirmCard(card)} style={s.chip}><Text style={s.text}>{card.confirmed ? '☑' : '☐'} 我已逐欄確認第 {index + 1} 件商品的照片、內容及售價</Text></Pressable>}
        {!card.published && <View style={s.row}>{(!card.record || aiAvailable !== false) && <Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => void retry(card)} style={s.chip}><Text style={s.text}>{card.record ? '重試 AI' : '重試儲存照片'}</Text></Pressable>}<Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => void remove(card)} style={s.chip}><Text style={s.text}>移除照片</Text></Pressable></View>}
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
  inputGroup: { flex: 1, gap: iosSpacing.xs }, fieldLabel: { ...iosType.subheadline, color: iosColors.label, fontWeight: '600' },
  input: { minWidth: 100, minHeight: 50, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.control, backgroundColor: iosColors.surface, padding: iosSpacing.sm, fontSize: 16, color: iosColors.label, ...iosShadow }, multiline: { minHeight: 108, textAlignVertical: 'top' },
  card: { padding: iosSpacing.md, gap: iosSpacing.sm, backgroundColor: iosColors.surface, borderRadius: iosRadius.card, ...iosShadow }, cardTitle: { ...iosType.headline, color: iosColors.label }, image: { width: 100, height: 100, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary },
  error: { ...iosType.subheadline, color: iosColors.danger, backgroundColor: iosColors.dangerSoft, padding: iosSpacing.sm, borderRadius: iosRadius.control },
  group: { gap: iosSpacing.sm },
  highlight: { borderWidth: 2, borderColor: iosColors.warning, backgroundColor: '#FFF3D9', borderRadius: iosRadius.control, padding: iosSpacing.xs },
  modeCurrent: { gap: iosSpacing.xs, backgroundColor: iosColors.tintSoft, borderColor: iosColors.tint,
    borderWidth: 1, borderRadius: iosRadius.card, padding: iosSpacing.md },
  modeLabel: { ...iosType.headline, color: iosColors.tint },
  modeAlternative: { minHeight: minimumTapSize, gap: iosSpacing.xs, backgroundColor: iosColors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.card, padding: iosSpacing.md },
  modeAlternativeTitle: { ...iosType.headline, color: iosColors.label },
  defaultBadge: { ...iosType.subheadline, color: iosColors.brand, backgroundColor: iosColors.brandSoft,
    alignSelf: 'flex-start', paddingHorizontal: iosSpacing.sm, paddingVertical: iosSpacing.xs, borderRadius: iosRadius.pill },
});
