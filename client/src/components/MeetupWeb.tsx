import { chatMessage, chatText, chatTime } from '../lib/chatCopy';
import { useEffect, useRef, useState } from 'react';
import MarketplaceDialog from './MarketplaceDialog';
import { getFullApiUrl } from '../config';
import { api, ApiFailure } from '../lib/marketplaceApi';
import type { ChatRoomRecord } from '../lib/chatData';
import { meetupRequest, parseMeetup, type MeetupAction, type MeetupRecord } from '../lib/meetupData';
import { fromTaipeiInput, meetupActionLabels, meetupLabels, submitMeetupAction, taipeiInput } from '../lib/chatWeb';
import { pendingRequestKey, privatePendingStore, PendingStoreError } from '../lib/webPendingStore';
import { shouldPauseChatReads, useChatReadPause } from '../lib/useChatReadPause';
const button = 'min-h-11 rounded-xl border px-4 py-2 disabled:opacity-50';
const input = 'mt-2 min-h-11 w-full rounded-xl border p-3';
export default function MeetupWeb({ token, userId, room, onClose, onReadPause }: { token: string; userId: number; room: ChatRoomRecord; onClose: () => void; onReadPause?: () => void }) {
  const [appointment, setAppointment] = useState<MeetupRecord | null>(null), [loaded, setLoaded] = useState(false), [ready, setReady] = useState(false);
  const [pending, setPending] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false), [editVersion, setEditVersion] = useState(0), [date, setDate] = useState('');
  const [place, setPlace] = useState(''), [duration, setDuration] = useState('60'), [notes, setNotes] = useState(''), [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState('');
  const [confirmFence, setConfirmFence] = useState(false), [clock, setClock] = useState(Date.now());
  const [restoreIssue, setRestoreIssue] = useState('');
  const active = useRef(true), gate = useRef(false), reading = useRef(false), sequence = useRef(0), key = useRef<string | null>(null), saved = useRef<string | null>(null);
  const autoPause = useChatReadPause();
  const current = useRef(appointment); current.current = appointment;
  const latestRoom = useRef(room); latestRoom.current = room;
  const read = (path: string, init?: RequestInit) => { if (!active.current) return Promise.reject(new Error('已關閉')); return api<unknown>(token, path, init).catch(failure => { if (active.current && shouldPauseChatReads(failure)) { autoPause.pause(); onReadPause?.(); } throw failure; }); };
  async function refresh(automatic = false) {
    if (reading.current || gate.current || !active.current || latestRoom.current.archived || automatic && autoPause.control.current.paused) return;
    reading.current = true; const seq = ++sequence.current; const pauseGeneration = autoPause.control.current.generation;
    try {
      const result = await read(`/chat/conversations/${room.id}/meetup`) as { appointment: unknown };
      const next = parseMeetup(result.appointment, latestRoom.current);
      if (active.current && seq === sequence.current) { current.current = next; setAppointment(next); setLoaded(true); setError(''); if (!automatic) autoPause.resume(pauseGeneration); }
    } catch (failure) { if (active.current && seq === sequence.current) setError(failure instanceof ApiFailure && failure.status === 429 ? '請求暫時受限，已暫停自動讀取；請稍後再試，原內容與待確認操作會保留。' : '無法更新面交預約；不代表尚無預約或已確認，請重試。'); }
    finally { reading.current = false; }
  }
  async function restore() {
    if (gate.current) return; gate.current = true; setBusy(true); setReady(false); setError(''); setRestoreIssue('');
    try {
      const requestKey = await pendingRequestKey(getFullApiUrl(), userId, 'meetup.' + room.id), body = await privatePendingStore.get(requestKey);
      if (body && JSON.stringify(meetupRequest(JSON.parse(body))) !== body) throw new PendingStoreError();
      if (!active.current) return; key.current = requestKey; saved.current = body; setPending(body); setReady(true);
    } catch { if (active.current) setRestoreIssue('無法安全恢復待確認預約，請重試恢復；不會重建操作。'); }
    finally { gate.current = false; if (active.current) { setBusy(false); void refresh(); } }
  }
  useEffect(() => {
    active.current = true; void restore();
    const tick = () => { setClock(Date.now()); if (document.visibilityState === 'visible') void refresh(true); };
    const timer = window.setInterval(tick, 15_000); document.addEventListener('visibilitychange', tick); window.addEventListener('online', tick);
    return () => { active.current = false; sequence.current++; window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', tick); };
  }, []);
  function edit() {
    if (!loaded || saved.current || gate.current) return;
    const item = current.current; setEditVersion(item?.version ?? 0);
    setDate(taipeiInput(item?.startsAt ?? new Date(Date.now() + 86400000).toISOString())); setPlace(item?.placeName ?? ''); setNotes(item?.notes ?? '');
    setDuration(item ? String((Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000) : '60');
    setLatitude(item?.latitude == null ? '' : String(item.latitude)); setLongitude(item?.longitude == null ? '' : String(item.longitude)); setEditing(true); setError('');
  }
  async function act(action: MeetupAction, abandon = false) {
    if (!ready || !loaded || !key.current || gate.current || room.archived || (abandon && !saved.current)) return;
    if (!saved.current && ['PROPOSE', 'REVISE'].includes(action) && editVersion !== (current.current?.version ?? 0)) { setError('對方已更新預約，請載入最新版本後重新編輯；沒有送出操作。'); return; }
    gate.current = true; sequence.current++; setBusy(true); setError(''); setNotice('');
    try {
      const request = saved.current ? meetupRequest(JSON.parse(saved.current)) : meetupRequest({ clientActionId: crypto.randomUUID(), action, expectedVersion: ['PROPOSE', 'REVISE'].includes(action) ? editVersion : current.current?.version ?? 0,
        ...(['PROPOSE', 'REVISE'].includes(action) ? { terms: { startsAt: fromTaipeiInput(date), durationMinutes: Number(duration), timeZone: 'Asia/Taipei', placeName: place, notes,
          ...(latitude.trim() || longitude.trim() ? { latitude: latitude.trim() ? Number(latitude) : NaN, longitude: longitude.trim() ? Number(longitude) : NaN } : {}) } } : {}) });
      const body = saved.current ?? JSON.stringify(request), requestKey = key.current;
      await privatePendingStore.save(requestKey, body); saved.current = body; if (!active.current) return; setPending(body);
      const result = await submitMeetupAction(read, latestRoom.current, userId, privatePendingStore, requestKey, body, abandon);
      if (!active.current) return;
      current.current = result.appointment; setAppointment(result.appointment); setEditing(false);
      if (result.pendingCleared) { saved.current = null; setPending(null); setConfirmFence(false); }
      else setError('後台操作已確認，但本機待確認標記尚未清除；請查核或重試同一操作，暫不建立新操作。');
      setNotice(result.abandoned ? '原待確認操作已安全放棄；這不會取消已成立的預約。' : result.acknowledgedVersion! < result.appointment!.version ? `已確認先前第${result.acknowledgedVersion}版操作；目前第${result.appointment!.version}版仍需重新核對。` : abandon ? '原操作已先完成，已確認結果；放棄操作沒有取消目前預約。' : '操作已確認；是否雙方同意請查看預約狀態。');
    } catch (failure) {
      if (active.current) {
        if (failure instanceof PendingStoreError) { setReady(false); setRestoreIssue(failure.message); }
        setError(failure instanceof ApiFailure && failure.code === 'MEETUP_VERSION_CONFLICT' ? '對方已更新預約，不能沿用舊版同意；原操作仍保留，請更新並安全放棄後重新核對。' : failure instanceof ApiFailure && failure.code === 'MEETUP_TIME_CONFLICT' ? '時間與任一方其他預約重疊；原操作仍保留，請更新並安全放棄後選擇其他時間。' : saved.current ? '尚未確認操作結果；請查核畫面狀態或明確重試原操作，關閉後仍會保留。' : failure instanceof Error ? failure.message : '尚未送出操作。');
      }
    } finally { gate.current = false; if (active.current) setBusy(false); }
  }
  const mineConfirmed = appointment && (room.buyerUserId === userId ? appointment.buyerConfirmedAt : appointment.sellerConfirmedAt);
  const mineCompleted = appointment && (room.buyerUserId === userId ? appointment.buyerCompletedAt : appointment.sellerCompletedAt);
  const frozen = !ready || !loaded || busy || !!pending || room.archived, changed = editing && editVersion !== (appointment?.version ?? 0);
  const pendingAction = pending ? meetupRequest(JSON.parse(pending)) : null;
  return <MarketplaceDialog title={chatText("面交預約")} closeLabel={chatText("關閉")} onClose={onClose}><div className="space-y-4">
    <p className="text-sm text-gray-600">{chatText("僅買賣雙方可見。預約不代表付款、交易保障或自動保留商品；請優先選擇安全的公共場所。")}</p>
    {room.archived && <p role="alert">{chatText("聊天室已封存，無法新增或調整面交。")}</p>}{!room.listingAvailable && !room.archived && <p>{chatText("商品已停止刊登，請先與賣家確認；仍可取消既有預約。")}</p>}{room.blocked && <p>{chatText("已封鎖，不能新增或確認面交；仍可取消既有預約。")}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{chatMessage(error)}</p>}{notice && <p role="status" className="rounded-xl bg-green-50 p-3">{chatMessage(notice)}</p>}
    {autoPause.paused && <p role="status" className="text-sm text-gray-600">{chatText('自動讀取已暫停；請使用本頁更新按鈕重新核對，成功後才會恢復。登入失效時請先重新登入原帳號。')}</p>}
    {restoreIssue && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{chatMessage(restoreIssue)}</p>}
    {appointment ? <section aria-label={chatText("目前面交預約")} className="space-y-2 rounded-xl border p-4"><h3 className="font-semibold">{chatMessage(meetupLabels[appointment.status])} {chatText("· 第")}{appointment.version}{chatText("版")}</h3><p>{chatTime(appointment.startsAt)} {chatText("至")} {chatTime(appointment.endsAt)}{chatText("（台灣時間）")}</p><p className="break-words">{appointment.placeName}</p>
      {appointment.latitude !== null && <p className="text-sm">{chatText("雙方私密座標：")}{appointment.latitude}, {appointment.longitude}</p>}{appointment.notes && <p className="whitespace-pre-wrap break-words">{appointment.notes}</p>}
      <p className="text-sm">{chatText("買家")}{appointment.buyerConfirmedAt ? chatText("已同意") : chatText("尚未同意")} {chatText("· 賣家")}{appointment.sellerConfirmedAt ? chatText("已同意") : chatText("尚未同意")}</p>{(appointment.buyerCompletedAt || appointment.sellerCompletedAt) && <p className="text-sm">{chatText("買家")}{appointment.buyerCompletedAt ? chatText("已回報完成") : chatText("尚未回報")} {chatText("· 賣家")}{appointment.sellerCompletedAt ? chatText("已回報完成") : chatText("尚未回報")}</p>}
    </section> : loaded ? <p>{pending ? chatText("上次讀取尚無預約；目前有待確認操作，請更新狀態核對，不能據此認定邀約未成立。") : chatText("尚無面交預約，先與對方討論時間再提出邀約。")}</p> : <p role="status">{chatText("正在讀取面交預約…")}</p>}
    {!ready && <button className={button} disabled={busy} onClick={() => void restore()}>{chatText("重試恢復待確認預約")}</button>}
    {pendingAction && <section aria-label={chatText("待確認面交操作")} className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-semibold">{chatText("有一個尚未確認結果的操作")}</h3><p>{chatText("原操作：")}{chatMessage(meetupActionLabels[pendingAction.action])} {chatText("· 原第")}{pendingAction.expectedVersion}{chatText("版。重試沿用相同識別碼、版本與條件，不會自動改為同意新版本。")}</p>{pendingAction.terms && <p>{chatTime(pendingAction.terms.startsAt)}{chatText("（台灣時間） ·")} {pendingAction.terms.placeName}</p>}
      <div className="flex flex-wrap gap-2"><button className={button} disabled={!ready || !loaded || busy || room.archived} onClick={() => void act(pendingAction.action)}>{chatText("明確重試原操作")}</button><button className={button} disabled={!ready || !loaded || busy || room.archived} onClick={() => setConfirmFence(true)}>{chatText("安全放棄待確認操作")}</button></div>
      {confirmFence && <div className="space-y-2"><p>{chatText("若原操作已完成，只確認原結果；不會取消已成立預約。只有未完成的操作會被封存。")}</p><button className={button} disabled={busy} onClick={() => void act(pendingAction.action, true)}>{chatText("確認安全放棄（不取消現有預約）")}</button><button className={button} disabled={busy} onClick={() => setConfirmFence(false)}>{chatText("返回查核")}</button></div>}
    </section>}
    {editing && !pending && <form className="space-y-3 rounded-xl bg-gray-50 p-4" onSubmit={event => { event.preventDefault(); void act(editVersion ? 'REVISE' : 'PROPOSE'); }}>
      <h3 className="font-semibold">{editVersion ? chatText("改期／重新提議") : chatText("提出面交邀約")}</h3>{changed && <div role="alert"><p>{chatText("對方已更新預約。原表單不會被自動覆蓋，請重新核對。")}</p><button type="button" className={button} onClick={edit}>{chatText("載入最新版本後重新編輯")}</button></div>}
      <fieldset disabled={frozen || changed} className="space-y-3"><label className="block">{chatText("面交日期與時間（台灣時間）")}<input className={input} type="datetime-local" value={date} onChange={event => setDate(event.target.value)} required /></label>
        <label className="block">{chatText("面交時間長度（分鐘，15至240）")}<input className={input} inputMode="numeric" value={duration} maxLength={3} onChange={event => setDuration(event.target.value)} required /></label>
        <label className="block">{chatText("私密面交地點名稱")}<input className={input} maxLength={160} value={place} onChange={event => setPlace(event.target.value)} placeholder={chatText("公共場所名稱、出口或集合點")} required /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block">{chatText("私密面交緯度（選填）")}<input className={input} inputMode="decimal" value={latitude} onChange={event => setLatitude(event.target.value)} /></label><label className="block">{chatText("私密面交經度（選填，須與緯度同填）")}<input className={input} inputMode="decimal" value={longitude} onChange={event => setLongitude(event.target.value)} /></label></div>
        <label className="block">{chatText("面交備註（選填，最多1000字元）")}<textarea className={input} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
      </fieldset><button type="submit" className={`${button} bg-green-800 text-white`} disabled={frozen || changed || room.blocked || !room.listingAvailable}>{chatText("提出此版本（改期需對方重新同意）")}</button><button type="button" className={button} disabled={busy} onClick={() => setEditing(false)}>{chatText("關閉編輯")}</button>
    </form>}
    <div className="flex flex-wrap gap-2">{!editing && !pending && appointment?.status !== 'COMPLETED' && <button className={button} disabled={frozen || room.blocked || !room.listingAvailable} onClick={edit}>{appointment ? chatText("提議改期或修改地點") : chatText("提出面交邀約")}</button>}
      {!pending && appointment?.status === 'PROPOSED' && !mineConfirmed && <button className={`${button} bg-green-800 text-white`} disabled={frozen || room.blocked || !room.listingAvailable} onClick={() => void act('CONFIRM')}>{chatText("同意第")}{appointment.version}{chatText("版時間與地點")}</button>}
      {!pending && appointment?.status === 'CONFIRMED' && !mineCompleted && Date.parse(appointment.startsAt) <= clock && <button className={button} disabled={frozen} onClick={() => void act('COMPLETE')}>{chatText("我已完成面交（仍需對方回報）")}</button>}
      {!pending && appointment && ['PROPOSED', 'CONFIRMED'].includes(appointment.status) && <button className={`${button} text-red-800`} disabled={frozen} onClick={() => void act('CANCEL')}>{chatText("取消第")}{appointment.version}{chatText("版預約")}</button>}
      <button className={button} disabled={busy || room.archived} onClick={() => void refresh()}>{chatText("只更新預約狀態")}</button></div>
  </div></MarketplaceDialog>;
}
