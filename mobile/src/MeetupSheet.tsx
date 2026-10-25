import {lookupMeetupAction} from './meetupRecovery';
import { NativeDisclosure } from './NativeDisclosure';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaModal } from './SafeAreaModal';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { ApiError, createApi } from './api';
import { ChatRoomRecord } from './chatData';
import { MeetupAction, MeetupDataError, MeetupRecord, meetupRequest, parseMeetup, parseMeetupResult } from './meetupData';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { PendingStoreError } from './pendingStore';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
const labels = { PROPOSED: '提議中', CONFIRMED: '雙方已確認', CANCELLED: '已取消', COMPLETED: '雙方已回報完成' };
export function MeetupSheet({ api, apiUrl, userId, room, onClose }: { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; room: ChatRoomRecord; onClose: () => void }) {
  const [appointment, setAppointment] = useState<MeetupRecord | null>(null), [loaded, setLoaded] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [pending, setPending] = useState<string | null>(null), [editing, setEditing] = useState(false), [startsAt, setStartsAt] = useState(new Date(Date.now() + 86400000)), [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [place, setPlace] = useState(''), [notes, setNotes] = useState(''), [duration, setDuration] = useState('60'), [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState('');
  const alive = useRef(true), sending = useRef(false), loading = useRef(false), sequence = useRef(0), key = useRef<string | null>(null), pendingRef = useRef<string | null>(null);
  const path = '/chat/conversations/' + room.id + '/meetup';
  async function refresh() {
    if (loading.current) return; loading.current = true; const seq = ++sequence.current;
    try {
      const response = await api<{ appointment: unknown }>(path); const current = parseMeetup(response.appointment, room);
      if (alive.current && seq === sequence.current) { setAppointment(current); setLoaded(true); }
    } catch { if (alive.current && seq === sequence.current) setError('無法更新面交預約，請重試；不會假裝已確認。'); }
    finally { loading.current = false; }
  }
  async function restore() {
    setReady(false); setError('');
    try {
      const requestKey = await pendingRequestKey(apiUrl, userId, 'meetup.' + room.id); const saved = await privatePendingStore.get(requestKey);
      if (saved && JSON.stringify(meetupRequest(JSON.parse(saved))) !== saved) throw new MeetupDataError();
      if (!alive.current) return; key.current = requestKey; pendingRef.current = saved; setPending(saved); setReady(true); await refresh();
    } catch { if (alive.current) setError('無法安全恢復待確認預約，請重試恢復。'); }
  }
  useEffect(() => {
    alive.current = true; void restore(); const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { alive.current = false; sequence.current++; clearInterval(timer); subscription.remove(); };
  }, []);
  function edit() {
    if (pendingRef.current || sending.current || !loaded) return;
    setStartsAt(appointment ? new Date(appointment.startsAt) : new Date(Date.now() + 86400000));
    setPlace(appointment?.placeName ?? ''); setNotes(appointment?.notes ?? ''); setDuration(appointment ? String((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60000) : '60');
    setLatitude(appointment?.latitude == null ? '' : String(appointment.latitude)); setLongitude(appointment?.longitude == null ? '' : String(appointment.longitude)); setEditing(true); setError('');
  }
  async function lookupPending(){
    if(!pendingRef.current||!key.current||sending.current||!ready)return;sending.current=true;setBusy(true);setError('');const body=pendingRef.current;
    try{const result=await lookupMeetupAction(api,room,userId,privatePendingStore,key.current,body);await privatePendingStore.clear(key.current,body);const left=await privatePendingStore.get(key.current);if(!alive.current)return;
      pendingRef.current=left;setPending(left);setAppointment(result.appointment);setLoaded(true);setEditing(false);setPicker(null);if(left){setReady(false);setError('先前結果已核對，但裝置紀錄另有變動，請重試恢復後繼續。');}else setNotice(result.abandoned?'伺服器已確認原操作安全放棄，現有預約仍以畫面狀態為準。':'已查到原操作回執；是否雙方同意請依目前預約狀態查看。');
    }catch(failure){if(alive.current){if(failure instanceof PendingStoreError)setReady(false);setError('尚未核對到相符的原操作回執。未重送操作；原紀錄仍保留。');}}
    finally{sending.current=false;if(alive.current)setBusy(false);}
  }
  async function act(action: MeetupAction, abandon = false) {
    if (!ready || !loaded || !key.current || sending.current || (abandon && !pendingRef.current)) return; sending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const request = pendingRef.current ? meetupRequest(JSON.parse(pendingRef.current)) : meetupRequest({ clientActionId: Crypto.randomUUID(), action, expectedVersion: appointment?.version ?? 0,
        ...(['PROPOSE', 'REVISE'].includes(action) ? { terms: { startsAt: startsAt.toISOString(), durationMinutes: Number(duration), timeZone: 'Asia/Taipei', placeName: place, notes,
          ...(latitude.trim() || longitude.trim() ? { latitude: latitude.trim() ? Number(latitude) : NaN, longitude: longitude.trim() ? Number(longitude) : NaN } : {}) } } : {}) });
      const body = pendingRef.current ?? JSON.stringify(request);
      // No HTTP write before durable save. The same exact action/key/version
      // survives closing, process restart and a lost response.
      await privatePendingStore.save(key.current, body); pendingRef.current = body; if (alive.current) setPending(body);
      const result = parseMeetupResult(await api<unknown>(path + (abandon ? '/abandon' : ''), { method: 'POST', body }), room, request, userId);
      await privatePendingStore.clear(key.current, body);const left=await privatePendingStore.get(key.current);if(left!==null)throw new PendingStoreError();
      if (alive.current) { sequence.current++; pendingRef.current = null; setPending(null); setAppointment(result.appointment); setEditing(false); setPicker(null);
        setNotice(result.abandoned ? '此待確認操作已安全放棄，不會稍後改動預約。現有預約仍以畫面狀態為準。' : result.acknowledgedVersion! < result.appointment!.version ? `已確認先前第${result.acknowledgedVersion}版操作；目前第${result.appointment!.version}版仍須依畫面重新確認。` : abandon ? '原操作已先完成，已確認其結果；放棄操作沒有取消現有預約。如需取消，請另外取消畫面上的預約。' : request.action==='CANCEL'&&result.appointment?.status==='CANCELLED' ? '已確認取消預約。' : '操作已確認；是否雙方同意請依預約狀態查看。'); }
    } catch (failure) { if (alive.current) {
      if (failure instanceof PendingStoreError) setReady(false);
      const code = failure instanceof ApiError ? failure.code : undefined;
      setError(failure instanceof MeetupDataError ? failure.message : code === 'MEETUP_TIME_CONFLICT' ? '時間重疊，無法成立預約。待確認操作仍保留；請更新確認狀態。' : code === 'MEETUP_VERSION_CONFLICT' ? '對方已更新預約，不能沿用舊版本同意。請更新查看；待確認識別碼仍保留。' : '尚未確認操作結果。請重試同一操作；關閉後待確認資料仍保留。');
      void refresh();
    } } finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  const cancelled=appointment?.status==='CANCELLED';
  const consent=(at:string|null)=>cancelled?(at?'先前已同意':'先前未同意'):(at?'已同意':'尚未同意');
  const buyer = room.buyerUserId === userId;
  const myConfirmed = appointment && (buyer ? appointment.buyerConfirmedAt : appointment.sellerConfirmedAt);
  const myCompleted = appointment && (buyer ? appointment.buyerCompletedAt : appointment.sellerCompletedAt);
  const frozen = !ready || !loaded || busy || !!pending;
  const displayTime = (date: string) => new Date(date).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  return <SafeAreaModal visible animationType="slide" onRequestClose={onClose} contentStyle={s.screen}><View style={s.row}><Pressable accessibilityRole="button" onPress={onClose} style={s.chip}><Text style={s.text}>返回聊天</Text></Pressable><Text style={s.heading}>面交預約</Text>{busy && <ActivityIndicator />}</View>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}><NativeDisclosure title="面交與隱私提醒"><Text style={s.small}>僅買賣雙方可見。預約不代表付款、平台交易保障或自動保留商品；請優先選擇安全的公共場所。</Text></NativeDisclosure>
      {!room.listingAvailable && <Text style={s.error}>商品已停止刊登，請先與賣家確認；仍可取消既有預約。</Text>}{room.blocked && <Text style={s.error}>已封鎖，不能新增或確認面交；仍可取消。</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!notice && <Text accessibilityRole="alert" style={s.text}>{notice}</Text>}
      {appointment && editing ? <Text style={s.small}>正在編輯第{appointment.version}版預約。送出前，原預約維持{labels[appointment.status]}；改期須對方重新同意。</Text> : appointment ? <View style={s.card}><Text style={s.heading}>{labels[appointment.status]}</Text>{cancelled&&<Text accessibilityRole="alert" style={s.small}>此預約已取消；先前同意已不生效，重新提議須雙方再次同意。</Text>}<Text style={[s.text,{fontWeight:'700'}]}>{new Date(appointment.startsAt).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',month:'long',day:'numeric',weekday:'long'})}</Text><Text style={s.text}>{new Date(appointment.startsAt).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false})} – {new Date(appointment.endsAt).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false})}（台灣時間）</Text><Text style={[s.text,{fontWeight:'700'}]}>{appointment.placeName}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}><View style={{flex:1,minWidth:100,padding:12,backgroundColor:cancelled?iosColors.surfaceSecondary:iosColors.tintSoft,borderRadius:12}}><Text style={s.text}>買家</Text><Text style={s.text}>{consent(appointment.buyerConfirmedAt)}</Text></View><View style={{flex:1,minWidth:100,padding:12,backgroundColor:cancelled?iosColors.surfaceSecondary:iosColors.tintSoft,borderRadius:12}}><Text style={s.text}>賣家</Text><Text style={s.text}>{consent(appointment.sellerConfirmedAt)}</Text></View></View>{(appointment.buyerCompletedAt||appointment.sellerCompletedAt)&&<Text style={s.small}>買家{appointment.buyerCompletedAt?'已回報完成':'尚未回報'} · 賣家{appointment.sellerCompletedAt?'已回報完成':'尚未回報'}</Text>}<NativeDisclosure title="預約詳細資訊"><Text style={s.small}>第{appointment.version}版時間與地點；改期需重新同意。</Text>{appointment.latitude!==null&&<Text style={s.small}>雙方私密座標：{appointment.latitude}, {appointment.longitude}</Text>}{!!appointment.notes&&<Text style={s.text}>{appointment.notes}</Text>}</NativeDisclosure></View> : loaded ? <Text style={s.text}>尚無面交預約，先與對方討論時間再提出邀約。</Text> : <ActivityIndicator />}
      {pending && <View style={s.card}><Text style={s.text}>原預約操作結果尚未確認，先查詢回執；不會自動重送。</Text><Pressable accessibilityRole="button" disabled={busy||!ready} style={s.button} onPress={()=>void lookupPending()}><Text style={s.white}>查詢原操作回執</Text></Pressable><NativeDisclosure title="原操作與其他恢復方式"><Text style={s.small}>重試使用相同識別碼、版本與條件。安全放棄不會取消已成立的預約。</Text><Pressable accessibilityRole="button" disabled={busy||!ready||!loaded} style={s.chip} onPress={()=>void act('CONFIRM')}><Text style={s.text}>明確重試原預約操作</Text></Pressable><Pressable accessibilityRole="button" disabled={busy||!ready||!loaded} style={s.chip} onPress={()=>void act('CONFIRM',true)}><Text style={s.text}>安全放棄尚未成立的操作</Text></Pressable></NativeDisclosure></View>}
      {!ready && <Pressable accessibilityRole="button" style={s.chip} disabled={busy} onPress={() => void restore()}><Text style={s.text}>重試恢復待確認資料</Text></Pressable>}
      {editing && !pending && <View style={s.card}><Text style={s.heading}>{appointment ? '改期／重新提議' : '提出面交邀約'}</Text><Text style={s.text}>{displayTime(startsAt.toISOString())}（台灣時間）</Text><View style={s.row}>{(['date', 'time'] as const).map(mode => <Pressable key={mode} accessibilityRole="button" disabled={frozen} style={s.chip} onPress={() => setPicker(mode)}><Text style={s.text}>{mode === 'date' ? '選擇日期' : '選擇時間'}</Text></Pressable>)}</View>
        {picker && <DateTimePicker value={startsAt} mode={picker} timeZoneName="Asia/Taipei" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, value) => { if (Platform.OS === 'android') setPicker(null); if (event.type !== 'dismissed' && value) setStartsAt(value); }} />}
        <Text style={s.fieldLabel}>面交時間長度（分鐘）</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="面交時間長度（分鐘）" value={duration} onChangeText={setDuration} keyboardType="number-pad" maxLength={3} editable={!frozen} style={s.input} placeholder="15至240分鐘" />
        <Text style={s.fieldLabel}>私密面交地點名稱</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="私密面交地點名稱" value={place} onChangeText={setPlace} maxLength={160} editable={!frozen} style={s.input} placeholder="公共場所名稱、出口或集合點" />
        <NativeDisclosure title="補充私密座標（選填）"><Text style={s.small}>填寫集合地點即可提出邀約。若需精確定位，可補充座標；僅買賣雙方可見。</Text>
        <Text style={s.fieldLabel}>私密面交緯度（選填）</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="私密面交緯度（選填）" value={latitude} onChangeText={setLatitude} keyboardType="decimal-pad" editable={!frozen} style={s.input} placeholder="私密緯度（選填）" />
        <Text style={s.fieldLabel}>私密面交經度（選填，須與緯度同填）</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="私密面交經度（選填）" value={longitude} onChangeText={setLongitude} keyboardType="decimal-pad" editable={!frozen} style={s.input} placeholder="私密經度（選填，須與緯度同填）" />
        </NativeDisclosure>
        <Text style={s.fieldLabel}>面交備註（選填）</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="面交備註" value={notes} onChangeText={setNotes} maxLength={1000} multiline editable={!frozen} style={s.input} placeholder="私密備註（選填）" />
        <Pressable accessibilityRole="button" disabled={frozen || room.blocked || !room.listingAvailable} style={s.button} onPress={() => void act(appointment ? 'REVISE' : 'PROPOSE')}><Text style={s.white}>{appointment ? '提出改期，請對方重新同意' : '送出面交邀約'}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={()=>{setEditing(false);setPicker(null);}}><Text style={s.text}>取消編輯</Text></Pressable></View>}
      {!editing && !pending && appointment?.status !== 'COMPLETED' && <Pressable accessibilityRole="button" disabled={frozen || room.blocked || !room.listingAvailable} style={s.chip} onPress={edit}><Text style={s.text}>{cancelled?'重新提議面交':appointment ? '提議改期或修改地點' : '提出面交邀約'}</Text></Pressable>}
      {!pending && appointment?.status === 'PROPOSED' && !myConfirmed && <Pressable accessibilityRole="button" disabled={frozen || room.blocked || !room.listingAvailable} style={s.button} onPress={() => void act('CONFIRM')}><Text style={s.white}>同意第{appointment.version}版時間與地點</Text></Pressable>}
      {!pending && appointment?.status === 'CONFIRMED' && !myCompleted && Date.parse(appointment.startsAt) <= Date.now() && <Pressable accessibilityRole="button" disabled={frozen} style={s.button} onPress={() => void act('COMPLETE')}><Text style={s.white}>我已完成面交（仍需對方回報）</Text></Pressable>}
      {!editing && !pending && appointment && ['PROPOSED', 'CONFIRMED'].includes(appointment.status) && <Pressable accessibilityRole="button" disabled={frozen} style={s.chip} onPress={() => void act('CANCEL')}><Text style={s.text}>取消第{appointment.version}版預約</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={() => void refresh()}><Text style={s.text}>更新預約狀態</Text></Pressable>
    </ScrollView></KeyboardAvoidingView></SafeAreaModal>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: iosColors.background }, flex: { flex: 1 }, content: { padding: iosSpacing.lg, gap: iosSpacing.md, paddingBottom: 48 }, row: { flexDirection: 'row', alignItems: 'center', gap: iosSpacing.sm, padding: iosSpacing.sm }, heading: { ...iosType.title2, color: iosColors.label }, text: { ...iosType.body, color: iosColors.label }, small: { ...iosType.subheadline, color: iosColors.secondaryLabel }, fieldLabel: { ...iosType.subheadline, color: iosColors.label, fontWeight: '600' }, error: { ...iosType.subheadline, color: iosColors.danger, backgroundColor: iosColors.dangerSoft, borderRadius: iosRadius.control, padding: iosSpacing.sm }, card: { backgroundColor: iosColors.surface, borderRadius: iosRadius.card, padding: iosSpacing.md, gap: iosSpacing.sm, ...iosShadow }, chip: { minHeight: minimumTapSize, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, backgroundColor: iosColors.surface, borderRadius: iosRadius.pill, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.sm, justifyContent: 'center', alignItems: 'center' }, button: { minHeight: 52, backgroundColor: iosColors.tint, borderRadius: iosRadius.control, padding: iosSpacing.md, justifyContent: 'center', alignItems: 'center' }, white: { color: iosColors.white, ...iosType.headline }, input: { minHeight: 52, padding: iosSpacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.control, color: iosColors.label, backgroundColor: iosColors.surface, fontSize: 17 } });
