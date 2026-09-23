import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ImageManipulator, ImageRef, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { ApiError, createApi } from './api';
import { jpegPhotoUploadForm } from './photoUploadForm';
import { buildListingBody, CATEGORIES, emptyListingForm, ListingForm, ListingFormError, parsePhotoRecord, PhotoRecord, taiwanDate, uuid } from './listingForm';
import { PendingStoreError } from './pendingStore';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';

type Photo = { key: string; uri: string; record?: PhotoRecord; failed?: boolean };
export function ListingComposer({ api, apiUrl, userId, onClose, onSaved }: { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; onClose: () => void; onSaved: (status: string) => void }) {
  const [form, setForm] = useState<ListingForm>({ ...emptyListingForm });
  const [clientId] = useState(() => Crypto.randomUUID());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [picker, setPicker] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const requestKey = useRef<string | null>(null);
  const active = useRef(true);
  const busyRef = useRef(false);
  const begin = () => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); setError(''); return true; };
  const end = () => { busyRef.current = false; setBusy(false); };
  const locked = busy || pending !== null || !ready;
  const change = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => setForm(old => ({ ...old, [key]: value }));

  async function restore() {
    setError(''); setReady(false);
    try {
      const key = await pendingRequestKey(apiUrl, userId, 'listing');
      const saved = await privatePendingStore.get(key);
      if (saved) {
        const body = JSON.parse(saved);
        if (!uuid(body?.clientListingId) || typeof body.publish !== 'boolean' || !Array.isArray(body.mediaIds) || body.mediaIds.some((id: unknown) => !uuid(id))) throw new PendingStoreError();
      }
      if (active.current) { requestKey.current = key; setPending(saved); setReady(true); }
    } catch { if (active.current) setError('無法恢復待確認刊登。請重試恢復；為避免重複商品，尚未允許建立新刊登。'); }
  }
  useEffect(() => { active.current = true; void restore(); return () => { active.current = false; }; }, []);
  function releasePreparedPhoto(photo: Photo) {
    // Only the exact newly encoded JPEG returned by our manipulator is owned
    // here. Never delete picked originals, a cache directory, or remote media.
    const cache = Paths.cache.uri.replace(/\/$/, '') + '/';
    if (photo.uri.startsWith(cache) && !photo.uri.includes('/../')) {
      try { const file = new File(photo.uri); if (file.exists) file.delete(); } catch { /* OS may already have purged this owned cache file. */ }
    }
  }

  async function upload(photo: Photo) {
    const body = jpegPhotoUploadForm(photo.key, photo.uri, 'listing-photo.jpg');
    const record = parsePhotoRecord(await api<unknown>('/listing-media', { method: 'POST', body }), apiUrl, __DEV__);
    setPhotos(old => old.map(p => p.key === photo.key ? { ...p, record, failed: false } : p));
  }
  async function choosePhoto(camera: boolean) {
    if (locked || photos.length >= 8) return;
    if (!begin()) return;
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new ListingFormError('未授予相機權限；也可以從相簿選擇照片。');
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 8 - photos.length, quality: 1, exif: false });
      if (result.canceled) return;
      if (result.assets.length > 8 - photos.length) Alert.alert('最多8張照片', '超過上限的照片不會加入。');
      for (const asset of result.assets.slice(0, 8 - photos.length)) {
        const context = ImageManipulator.manipulate(asset.uri); let rendered: ImageRef | undefined;
        let prepared: Photo;
        try {
          if (Math.max(asset.width, asset.height) > 1600) context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
          rendered = await context.renderAsync(); const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: false });
          prepared = { key: Crypto.randomUUID(), uri: saved.uri }; setPhotos(old => [...old, prepared]);
        } finally { rendered?.release(); context.release(); }
        try { await upload(prepared); }
        catch { setPhotos(old => old.map(p => p.key === prepared.key ? { ...p, failed: true } : p)); setError('照片尚未上傳成功；請重試或移除，不會將失敗照片假裝成已儲存。'); }
      }
    } catch (failure) { setError(failure instanceof ListingFormError ? failure.message : '無法取得照片，請稍後重試。'); }
    finally { end(); }
  }
  async function retry(photo: Photo) {
    if (locked || !begin()) return;
    try { await upload(photo); } catch { setError('照片上傳失敗，請確認網路後再試。'); } finally { end(); }
  }
  async function removePhoto(photo: Photo) {
    if (locked || !begin()) return;
    try {
      await discardPhoto(photo);
      releasePreparedPhoto(photo);
      setPhotos(old => old.filter(p => p.key !== photo.key));
    } catch { setError('無法確認移除照片，請稍後重試。'); } finally { end(); }
  }
  async function discardPhoto(photo: Photo) {
    let record = photo.record;
    if (!record) {
      try { record = parsePhotoRecord(await api('/listing-media/by-upload-id/' + photo.key), apiUrl, __DEV__); }
      catch (failure) { if (failure instanceof ApiError && failure.status === 404) return; throw failure; }
    }
    await api('/listing-media/' + record.id, { method: 'DELETE' });
  }
  async function locate() {
    if (locked || !begin()) return;
    try {
      if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new ListingFormError('已拒絕定位；仍可手動填寫商品所在行政區與地圖位置。');
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setForm(old => ({ ...old, latitude: result.coords.latitude.toFixed(6), longitude: result.coords.longitude.toFixed(6) }));
    } catch (failure) { setError(failure instanceof ListingFormError ? failure.message : '暫時無法定位，請手動設定位置。'); } finally { end(); }
  }
  async function save(publish: boolean) {
    if (!ready || !requestKey.current || !begin()) return;
    const recovering = pending !== null;
    let candidate: string | undefined;
    try {
      if (!pending && photos.some(p => !p.record)) throw new ListingFormError('請先重試或移除尚未上傳的照片');
      const body = pending ?? JSON.stringify(buildListingBody(form, clientId, photos.map(p => p.record!.id), publish));
      candidate = body;
      await privatePendingStore.save(requestKey.current, body);
      setPending(body);
      const result = await api<Record<string, unknown>>('/listings', { method: 'POST', body });
      if (!result || !uuid(result.id) || !['DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'RESERVED', 'SOLD', 'REMOVED', 'EXPIRED'].includes(result.status as string)) throw new Error('Invalid publication response');
      // A retry after restart may acknowledge an original listing whose seller
      // subsequently changed its status elsewhere. Do not demand initial status.
      await privatePendingStore.clear(requestKey.current, body);
      photos.forEach(releasePreparedPhoto);
      onSaved(result.status as string);
    } catch (failure) {
      if (failure instanceof ListingFormError) { setPending(null); setError(failure.message); }
      else if (failure instanceof ApiError && [401, 403].includes(failure.status)) {
        // A login failure now does not prove an earlier timed-out request was
        // never committed. Preserve its journal through logout/re-login.
        setError(failure.status === 401 ? '登入已失效。請選「稍後確認」，重新登入同一帳號後回來重試。原刊登資料仍安全保留。' : '請完成Email驗證並確認照片授權後重試；原刊登識別碼與資料仍保留。');
      }
      else if (failure instanceof ApiError && [400, 422].includes(failure.status)) {
        if (!recovering) {
          try { await privatePendingStore.clear(requestKey.current, candidate); setPending(null); }
          catch { setReady(false); }
        }
        setError(recovering ? '此次重試未被接受，但不能因此判定上次刊登不存在。請稍後確認或重新登入；不會丟棄識別碼建立重複商品。' : '商品資料未被接受，請檢查商品說明、照片與失效日期。');
      }
      else if (failure instanceof PendingStoreError) { setReady(false); setError('裝置尚未安全保存或恢復待確認刊登。請重試恢復，避免重複商品。'); }
      else setError('尚未確認刊登結果。重試會使用相同識別碼與資料，避免重複刊登。');
    } finally { end(); }
  }
  async function close() {
    if (busyRef.current) return;
    if (pending || !ready) { photos.forEach(releasePreparedPhoto); onClose(); return; }
    if (!begin()) return;
    const cleanup = await Promise.allSettled(photos.map(discardPhoto));
    if (cleanup.some(result => result.status === 'rejected')) Alert.alert('照片移除尚未確認', '未能確認所有未使用照片已刪除，但這些照片不會公開。');
    photos.forEach(releasePreparedPhoto);
    onClose();
  }
  const input = (key: 'title' | 'description' | 'brand' | 'price' | 'county' | 'district' | 'latitude' | 'longitude', label: string, numeric = false, multiline = false) => <TextInput key={key} accessibilityLabel={label} placeholder={label} value={form[key]} onChangeText={value => change(key, value)} editable={!locked} keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} style={[s.input, multiline && s.multiline]} />;
  const toggle = (key: 'meetup' | 'shipping' | 'negotiable' | 'consent', label: string) => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: form[key], disabled: locked }} disabled={locked} onPress={() => change(key, !form[key])} style={s.option}><Text style={s.text}>{form[key] ? '☑' : '☐'} {label}</Text></Pressable>;
  return <Modal visible animationType="slide" onRequestClose={() => void close()}><SafeAreaView style={s.screen}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><Text style={s.title}>刊登好物</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void close()} style={s.option}><Text style={s.text}>{pending || !ready ? '稍後確認' : '取消'}</Text></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Text style={s.text}>個人二手與新品。不處理付款，請以站內聯絡預約面交。</Text>
      {pending && <Text style={s.text}>已恢復上次待確認刊登。重試使用原識別碼與完整資料；也可稍後返回確認，不會重新建立商品。</Text>}
      {!ready && <Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={() => void restore()}><Text style={s.text}>重試恢復待確認刊登</Text></Pressable>}
      {input('title', '商品名稱')}{input('description', '商品狀況與說明', false, true)}{input('brand', '品牌（無品牌可填「無品牌」）')}{input('price', '售價 TWD（0為贈送）', true)}
      <View style={s.wrap}>{(['USED', 'NEW'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: form.condition === value }} disabled={locked} style={[s.chip, form.condition === value && s.selected]} onPress={() => change('condition', value)}><Text style={s.text}>{value === 'USED' ? '二手' : '新品'}</Text></Pressable>)}</View>
      <View style={s.wrap}>{CATEGORIES.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: form.category === value }} disabled={locked} style={[s.chip, form.category === value && s.selected]} onPress={() => change('category', value)}><Text style={s.text}>{label}</Text></Pressable>)}</View>
      <Text style={s.section}>實拍照片 {photos.length}/8</Text>
      <View style={s.wrap}>{photos.map(photo => <View key={photo.key} style={s.photo}><Image source={{ uri: photo.uri }} style={s.preview} accessibilityLabel="選取的商品照片" /><Text style={s.small}>{photo.record ? '已上傳' : '尚未上傳'}</Text>{photo.failed && <Pressable accessibilityRole="button" disabled={locked} style={s.option} onPress={() => void retry(photo)}><Text style={s.text}>重試</Text></Pressable>}<Pressable accessibilityRole="button" disabled={locked} style={s.option} onPress={() => void removePhoto(photo)}><Text style={s.text}>移除</Text></Pressable></View>)}</View>
      <View style={s.wrap}><Pressable accessibilityRole="button" disabled={locked || photos.length >= 8} style={s.chip} onPress={() => void choosePhoto(false)}><Text style={s.text}>從相簿選擇</Text></Pressable><Pressable accessibilityRole="button" disabled={locked || photos.length >= 8} style={s.chip} onPress={() => void choosePhoto(true)}><Text style={s.text}>拍攝照片</Text></Pressable></View>
      <Text style={s.section}>商品所在行政區</Text>{input('county', '縣市')}{input('district', '行政區')}
      <Pressable accessibilityRole="button" disabled={locked} style={s.chip} onPress={() => void locate()}><Text style={s.text}>使用目前位置</Text></Pressable>
      {input('latitude', '位置緯度', true)}{input('longitude', '位置經度', true)}
      <Text style={s.small}>後端只保存約2公里模糊位置，不公開或保存原始GPS。行政區與地圖選位介面仍待整合驗收。</Text>
      {toggle('meetup', '可面交')}{toggle('shipping', '可寄送')}{toggle('negotiable', '可議價')}
      <Text style={s.section}>失效日期（選填）</Text><Text style={s.text}>{form.expiryDate || '未設定：發布後30天'}</Text>
      <Pressable accessibilityRole="button" disabled={locked} style={s.chip} onPress={() => setPicker(true)}><Text style={s.text}>選擇失效日期</Text></Pressable>
      {!!form.expiryDate && <Pressable accessibilityRole="button" disabled={locked} style={s.option} onPress={() => change('expiryDate', '')}><Text style={s.text}>清除，使用預設30天</Text></Pressable>}
      {picker && !locked && <DateTimePicker accessibilityLabel="失效日期" value={form.expiryDate ? new Date(form.expiryDate + 'T12:00:00+08:00') : new Date()} minimumDate={new Date()} mode="date" timeZoneName="Asia/Taipei" locale="zh-TW" onChange={(_event, date) => { setPicker(Platform.OS === 'ios'); if (date) change('expiryDate', taiwanDate(date)); }} />}
      {toggle('consent', '同意公開商品資訊、照片與約略位置至商品地圖')}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{busy && <ActivityIndicator accessibilityLabel="處理照片或刊登中" />}
      {pending ? <Pressable accessibilityRole="button" disabled={busy || !ready} style={s.button} onPress={() => void save(true)}><Text style={s.white}>重試相同刊登</Text></Pressable> : <><Pressable accessibilityRole="button" disabled={busy || !ready} style={s.button} onPress={() => void save(true)}><Text style={s.white}>發布商品</Text></Pressable><Pressable accessibilityRole="button" disabled={busy || !ready} style={s.option} onPress={() => void save(false)}><Text style={s.text}>儲存草稿</Text></Pressable></>}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView></Modal>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: iosColors.background }, flex: { flex: 1 }, header: { minHeight: 56, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: iosColors.separator }, content: { padding: iosSpacing.lg, gap: iosSpacing.md, paddingBottom: 48 },
  title: { ...iosType.title, color: iosColors.label }, text: { ...iosType.body, color: iosColors.label }, small: { ...iosType.subheadline, color: iosColors.secondaryLabel }, section: { ...iosType.headline, color: iosColors.label, marginTop: iosSpacing.sm }, input: { minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, padding: iosSpacing.md, borderRadius: iosRadius.control, fontSize: 17, color: iosColors.label, backgroundColor: iosColors.surface, ...iosShadow }, multiline: { minHeight: 116, textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: iosSpacing.xs }, chip: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, justifyContent: 'center' }, selected: { backgroundColor: iosColors.tintSoft, borderColor: iosColors.tint }, option: { minHeight: minimumTapSize, padding: iosSpacing.sm, justifyContent: 'center', alignItems: 'center' }, button: { minHeight: 52, padding: iosSpacing.md, borderRadius: iosRadius.control, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center' }, white: { color: iosColors.white, ...iosType.headline }, error: { color: iosColors.danger, ...iosType.subheadline, backgroundColor: iosColors.dangerSoft, borderRadius: iosRadius.control, padding: iosSpacing.sm }, photo: { width: 124, gap: iosSpacing.xs }, preview: { width: 124, height: 104, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary },
});
