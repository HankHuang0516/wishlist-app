import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ImageManipulator, ImageRef, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { ApiError, createApi } from './api';
import { parseListingAiState, suggestedAskingPrice, type ListingAiDraft, type ListingAiState } from './listingAiDraft';
import { buildListingBody, CATEGORIES, emptyListingForm, ListingFormError, parsePhotoRecord, type ListingForm, type PhotoRecord, uuid } from './listingForm';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { jpegPhotoUploadForm } from './photoUploadForm';
import { uploadPhotoRecord } from './photoUploadRecovery';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';

type Card = { key: string; clientListingId: string; uri: string; local: boolean; record?: PhotoRecord;
  ai: ListingAiState['status']; draft: ListingAiDraft | null; form: ListingForm; edited: boolean; error: string; published: boolean };
const MAX_ITEMS = 12;
const initialCard = (key: string, uri: string, local: boolean, record?: PhotoRecord): Card => ({ key,
  clientListingId: Crypto.randomUUID(), uri, local, record, ai: 'SKIPPED', draft: null,
  form: { ...emptyListingForm }, edited: false, error: '', published: false });
const applyAi = (card: Card, state: ListingAiState): Card => {
  if (!state.draft || card.edited) return { ...card, ai: state.status, draft: state.draft, error: '' };
  const d = state.draft;
  return { ...card, ai: state.status, draft: d, error: '', form: { ...card.form, title: d.title,
    description: d.description, category: d.category, brand: d.brand ?? '未確認', condition: d.condition ?? 'USED',
    price: suggestedAskingPrice(d) } };
};
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
  const [shared, setShared] = useState<ListingForm>({ ...emptyListingForm });
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null), polling = useRef(false), active = useRef(true), busyRef = useRef(false);
  const changeShared = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => setShared(old => ({ ...old, [key]: value }));
  const changeCard = <K extends keyof ListingForm>(key: string, field: K, value: ListingForm[K]) => setCards(old => old.map(card =>
    card.key === key ? { ...card, edited: true, form: { ...card.form, [field]: value } } : card));
  const begin = () => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); setError(''); return true; };
  const end = () => { busyRef.current = false; setBusy(false); };

  useEffect(() => {
    active.current = true;
    void (async () => {
      try {
        const key = await pendingRequestKey(apiUrl, userId, 'listing');
        const [journal, response] = await Promise.all([privatePendingStore.get(key), api<{ items: unknown[] }>('/listing-media/unused')]);
        if (!Array.isArray(response.items)) throw new Error('UNUSED_MEDIA_RESPONSE');
        const recovered = response.items.slice(0, MAX_ITEMS).map(raw => {
          const record = parsePhotoRecord(raw, apiUrl, __DEV__);
          const row = raw as Record<string, unknown>;
          const state = parseListingAiState({ mediaId: record.id, status: row.aiDraftStatus, draft: row.aiDraft ?? null }, record.id);
          return applyAi(initialCard(record.id, record.imageUrl, false, record), state);
        });
        if (active.current) { keyRef.current = key; setPending(journal); setCards(recovered); setReady(true); }
      } catch { if (active.current) setError('暫時無法安全恢復先前的商品照片或待確認刊登，請稍後重試。'); }
    })();
    return () => { active.current = false; };
  }, [apiUrl, userId]);

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
      const form = jpegPhotoUploadForm(card.key, card.uri, 'listing-photo.jpg');
      const record = await uploadPhotoRecord(api, apiUrl, card.key, form, __DEV__);
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
      const prepared: Card[] = [];
      if (camera) {
        while (remaining > 0) {
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
          if (result.canceled) break;
          for (const asset of result.assets.slice(0, 1)) { const card = await prepare(asset); prepared.push(card); setCards(old => [...old, card]); remaining--; }
        }
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 1, exif: false });
        if (result.canceled) return;
        for (const asset of result.assets.slice(0, remaining)) { const card = await prepare(asset); prepared.push(card); setCards(old => [...old, card]); }
      }
      for (const card of prepared) await upload(card);
    } catch (failure) { setError(failure instanceof ListingFormError ? failure.message : '無法取得或處理照片，請稍後重試。'); }
    finally { end(); }
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
  async function remove(card: Card) {
    if (!begin()) return;
    try {
      if (card.record) await api(`/listing-media/${card.record.id}`, { method: 'DELETE' });
      releaseLocal(card); setCards(old => old.filter(current => current.key !== card.key));
    } catch { setError('尚未確認照片已移除；請稍後重試。'); } finally { end(); }
  }
  async function locate() {
    if (!begin()) return;
    try {
      if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new ListingFormError('未授予定位；可在下方手動填寫縣市與行政區。');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const place = (await Location.reverseGeocodeAsync(current.coords)).at(0);
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
      setCards(old => old.map(card => body.mediaIds?.includes(card.record?.id ?? '') ? { ...card, published: true } : card));
      Alert.alert('已確認先前刊登', '同一筆操作已安全確認，不會重複建立商品。');
    } catch { setError('前次刊登結果仍未確認。請稍後重試；不會建立另一筆商品。'); } finally { end(); }
  }
  async function publishAll() {
    if (!ready || pending || !keyRef.current || !begin()) return;
    let count = 0, candidate: string | null = null;
    try {
      for (const card of cards.filter(item => !item.published)) {
        if (!card.record) throw new ListingFormError('仍有照片尚未上傳成功');
        const form = { ...card.form, county: shared.county, district: shared.district, latitude: shared.latitude, longitude: shared.longitude,
          meetup: shared.meetup, shipping: shared.shipping, negotiable: shared.negotiable, consent: shared.consent, expiryDate: shared.expiryDate };
        const body = JSON.stringify(buildListingBody(form, card.clientListingId, [card.record.id], true));
        candidate = body;
        await privatePendingStore.save(keyRef.current, body);
        setPending(body);
        const result = await api<{ id: string; status: string }>('/listings', { method: 'POST', body });
        if (!uuid(result.id) || result.status !== 'ACTIVE') throw new Error('UNCONFIRMED_PUBLICATION');
        await privatePendingStore.clear(keyRef.current, body);
        setPending(null); candidate = null; count++;
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
  const input = (value: string, label: string, onChangeText: (text: string) => void, numeric = false, multiline = false) =>
    <TextInput accessibilityLabel={label} placeholder={label} value={value} onChangeText={onChangeText} editable={!busy && !pending}
      keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} style={[s.input, multiline && s.multiline]} />;
  return <Modal visible animationType="slide" onRequestClose={() => !busy && onClose()}><SafeAreaView style={s.screen}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><Text style={s.title}>連續拍照刊登</Text><Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={s.chip}><Text style={s.text}>稍後繼續</Text></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Text style={s.text}>一件商品拍一張照片；相機可連續拍到按取消，相簿可一次選多張。AI 逐件產生私人草稿，你確認後才會公開。</Text>
      {!ready && <Text style={s.small}>正在恢復私密照片與待確認操作…</Text>}
      {!!pending && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void reconcile()} style={s.button}><Text style={s.white}>確認先前未完成的刊登</Text></Pressable>}
      <View style={s.row}><Pressable accessibilityRole="button" disabled={busy || !ready || !!pending} onPress={() => void select(true)} style={s.button}><Text style={s.white}>連續拍照</Text></Pressable><Pressable accessibilityRole="button" disabled={busy || !ready || !!pending} onPress={() => void select(false)} style={s.button}><Text style={s.white}>批次選照片</Text></Pressable></View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onAdvanced} style={s.chip}><Text style={s.text}>同件商品多角度拍攝／手動精細刊登</Text></Pressable>
      <Text style={s.section}>共用刊登位置與交付方式</Text>
      <Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => void locate()} style={s.chip}><Text style={s.text}>使用目前位置並自動填行政區</Text></Pressable>
      {input(shared.county, '縣市', value => changeShared('county', value))}{input(shared.district, '行政區', value => changeShared('district', value))}
      <Text style={s.small}>公開地圖只保存約 2 公里模糊位置。無法自動取得行政區時可手動修正。</Text>
      {input(shared.latitude, '位置緯度', value => changeShared('latitude', value), true)}{input(shared.longitude, '位置經度', value => changeShared('longitude', value), true)}
      {(['meetup', 'shipping', 'consent'] as const).map(key => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: shared[key] }} disabled={busy || !!pending} onPress={() => changeShared(key, !shared[key])} style={s.chip}><Text style={s.text}>{shared[key] ? '☑' : '☐'} {key === 'meetup' ? '可面交' : key === 'shipping' ? '可寄送' : '我確認資料屬實並同意公開照片與約略位置'}</Text></Pressable>)}
      <Text style={s.section}>商品草稿 {cards.filter(card => !card.published).length}/{MAX_ITEMS}</Text>
      {cards.map((card, index) => <View key={card.key} style={s.card}>
        <View style={s.row}><Image source={card.local ? { uri: card.uri } : { uri: card.uri, headers: { Authorization: `Bearer ${token}` } }} style={s.image} accessibilityLabel={`第${index + 1}件商品照片`} /><View style={s.grow}><Text style={s.cardTitle}>第 {index + 1} 件 {card.published ? '· 已刊登' : ''}</Text><Text style={s.small}>{card.ai === 'COMPLETED' ? 'AI 草稿已完成，請確認' : card.ai === 'PENDING' ? 'AI 排隊中' : card.ai === 'PROCESSING' ? 'AI 辨識中' : card.ai === 'FAILED' ? 'AI 未完成，可重試或手動修正' : '等待上傳'}</Text></View></View>
        {!!card.draft && <><Text style={s.small}>AI 二手參考價：{card.draft.estimatedPriceLowTwd === null ? '無法可靠估價' : `NT$ ${card.draft.estimatedPriceLowTwd}–${card.draft.estimatedPriceHighTwd}`}</Text><Text style={s.small}>{card.draft.priceBasis || '圖片不足以推定市場價格'}</Text><Text style={s.small}>待確認：{card.draft.uncertainties.join('、') || '請仍確認實際商品狀況'}</Text>{card.edited && <Pressable accessibilityRole="button" disabled={busy || !!pending} style={s.chip} onPress={() => setCards(old => old.map(current => current.key === card.key ? applyAi({ ...current, edited: false }, { mediaId: card.record!.id, status: 'COMPLETED', draft: card.draft }) : current))}><Text style={s.text}>重新套用 AI 建議</Text></Pressable>}</>}
        {input(card.form.title, `第${index + 1}件商品名稱`, value => changeCard(card.key, 'title', value))}
        {input(card.form.description, `第${index + 1}件商品描述`, value => changeCard(card.key, 'description', value), false, true)}
        <View style={s.row}>{input(card.form.brand, `第${index + 1}件品牌`, value => changeCard(card.key, 'brand', value))}{input(card.form.price, `第${index + 1}件售價 TWD`, value => changeCard(card.key, 'price', value), true)}</View>
        <View style={s.row}>{(['USED', 'NEW'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: card.form.condition === value }} disabled={busy || !!pending} style={[s.chip, card.form.condition === value && s.selected]} onPress={() => changeCard(card.key, 'condition', value)}><Text style={s.text}>{value === 'USED' ? '二手' : '新品'}</Text></Pressable>)}</View>
        <View style={s.wrap}>{CATEGORIES.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: card.form.category === value }} disabled={busy || !!pending} style={[s.chip, card.form.category === value && s.selected]} onPress={() => changeCard(card.key, 'category', value)}><Text style={s.small}>{label}</Text></Pressable>)}</View>
        {!!card.error && <Text style={s.error}>{card.error}</Text>}
        {!card.published && <View style={s.row}><Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => void retry(card)} style={s.chip}><Text style={s.text}>重試 AI</Text></Pressable><Pressable accessibilityRole="button" disabled={busy || !!pending} onPress={() => void remove(card)} style={s.chip}><Text style={s.text}>移除照片</Text></Pressable></View>}
      </View>)}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{busy && <ActivityIndicator accessibilityLabel="處理照片或刊登中" />}
      {cards.some(card => !card.published) && <Pressable accessibilityRole="button" disabled={busy || !ready || !!pending} onPress={() => void publishAll()} style={s.button}><Text style={s.white}>確認並刊登全部商品</Text></Pressable>}
      <Text style={s.small}>AI 參考價不是已驗證行情；無法可靠估價的商品仍須由賣家決定售價。未刊登照片只對本人可見，稍後可恢復或刪除。</Text>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView></Modal>;
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
