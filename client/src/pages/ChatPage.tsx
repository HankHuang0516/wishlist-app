import { chatMessage, chatRoomPrice, chatRoomTitle, chatText, chatTime, sourceInquiryStatus } from '../lib/chatCopy';
import {parseLead,parseContactRouting} from '../lib/sourceLeadData';
import {TAIWAN_DISTRICTS} from '../lib/taiwanAdministrativeDistricts';
import SourceContactChat,{type SourceProductContext} from '../components/SourceContactChat';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getFullApiUrl } from '../config';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { isUuid } from '../lib/listingBatch';
import { ChatDataError, mergeMessages, messageBody, parseChatInbox, parseChatRoom, parseMessagePage, retainMemberMessages, type ChatMessage, type ChatRoomRecord } from '../lib/chatData';
import { acknowledgeChatMessage, lookupChatMessage, meetupLabels, parsePendingMessage, privateChatPhotoId, submitChatMessage } from '../lib/chatWeb';
import { parseMeetup, type MeetupRecord } from '../lib/meetupData';
import { pendingRequestKey, privatePendingStore, PendingStoreError } from '../lib/webPendingStore';
import PrivatePhoto from '../components/PrivateMarketplacePhoto';
import MeetupWeb from '../components/MeetupWeb';
import { shouldPauseChatReads, useChatReadPause } from '../lib/useChatReadPause';
const button = 'min-h-11 rounded-xl border px-4 py-2 disabled:opacity-50';
function RoomPhoto({ room, token }: { room: ChatRoomRecord; token: string }) {
  const id = privateChatPhotoId(room, getFullApiUrl());
  return id ? <PrivatePhoto id={id} token={token} label={chatText("聊天商品照片")} compact /> : <div role="img" aria-label={chatText("聊天商品照片未提供或已停止公開")} className="flex h-16 w-16 items-center rounded-xl bg-gray-100 p-2 text-xs">{room.listingAvailable ? chatText("照片未提供") : chatText("已停止公開")}</div>;
}
function storedSourceContext(value:unknown):SourceProductContext {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('來源對話資料不正確。');
  const row=value as SourceProductContext;
  if(!isUuid(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>100||!row.county||!row.district||!TAIWAN_DISTRICTS[row.county]?.has(row.district))throw new Error('來源對話資料不正確。');
  const url=new URL(row.canonicalUrl);if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)throw new Error('來源對話連結不正確。');
  if(row.publicFacts!=null&&(typeof row.publicFacts.priceText!=='string'||row.publicFacts.priceText.length>300))throw new Error('來源對話售價不正確。');
  // Saved history remains readable after expiry, but stale media never gains display permission.
  return {id:row.id,title:row.title,canonicalUrl:row.canonicalUrl,county:row.county,district:row.district,publicFacts:row.publicFacts??undefined,contactRouting:row.contactRouting?parseContactRouting(row.contactRouting):undefined,media:[]};
}
export default function ChatPage() {
  const { user, token } = useAuth(), location = useLocation();
  if (!token || !user) return <section className="space-y-4"><h1 className="text-2xl font-semibold">{chatText("聊天與面交")}</h1><p>{chatText("登入後與商品買家或賣家聯絡。")}</p><Link className="text-green-800 underline" to={'/login?next=' + encodeURIComponent('/chat' + location.search)}>{chatText("登入")}</Link></section>;
  return <ChatSession key={`${user.id}:${token}`} token={token} userId={user.id} />;
}
function ChatSession({ token, userId }: { token: string; userId: number }) {
  const location = useLocation(), navigate = useNavigate(), params = new URLSearchParams(location.search);
  const invalidIntent = params.size > 1 || params.size === 1 && (!params.has('room')&&!params.has('source') || !isUuid(params.get('room')??params.get('source')));
  const sourceId=invalidIntent?null:params.get('source');
  const [source,setSource]=useState<SourceProductContext|null>(null),[sourceIssue,setSourceIssue]=useState(false),[sourceThreads,setSourceThreads]=useState<{id:string;state:string;context:SourceProductContext}[]>([]);
  const [sourceBusy,setSourceBusy]=useState(true),[sourceReload,setSourceReload]=useState(0);
  const activeRoom = invalidIntent ? null : params.get('room')?.toLowerCase() ?? null;
  const [rooms, setRooms] = useState<ChatRoomRecord[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  useEffect(()=>{
    let valid=true;
    const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),30_000);
    setSource(null);setSourceIssue(false);setSourceBusy(true);
    void (async()=>{
      try {
        const all:{id:string;state:string;context:SourceProductContext}[]=[];
        let cursor:string|null=null;const seen=new Set<string>();
        do {
          const page:{items:typeof all;nextCursor:string|null}=await api<{items:typeof all;nextCursor:string|null}>(token,'/source-leads/inquiries/mine'+(cursor?'?cursor='+cursor:''),{signal:controller.signal});
          if(!valid)return;
          if(controller.signal.aborted)throw Error();
          if(!Array.isArray(page.items)||page.items.length>25||!(page.nextCursor===null||isUuid(page.nextCursor)))throw Error();
          all.push(...page.items.map(thread=>{if(!isUuid(thread.id)||typeof thread.state!=='string')throw Error();return {...thread,context:storedSourceContext(thread.context)};}));
          cursor=page.nextCursor;if(cursor&&seen.has(cursor))throw Error();if(cursor)seen.add(cursor);if(all.length>2500)throw Error();
        }while(cursor);
        setSourceThreads(all);
        if(sourceId){
          const old=all.find(thread=>thread.context.id===sourceId);
          try {
            const current=parseLead(await api<unknown>(token,'/source-leads/'+sourceId+'?presentation=1',{signal:controller.signal}));
            if(controller.signal.aborted)throw Error();
            if(current.id!==sourceId)throw Error();
            if(valid&&!controller.signal.aborted)setSource({...current,publicFacts:current.publicFacts??undefined});
          }catch(failure){
            if(controller.signal.aborted||!old)throw failure;
            if(valid)setSource(old.context);
          }
        }
      }catch{if(valid)setSourceIssue(true);}
      finally{window.clearTimeout(timer);if(valid)setSourceBusy(false);}
    })();
    return()=>{valid=false;window.clearTimeout(timer);controller.abort();};
  },[token,sourceId,sourceReload]);
  const sourceFeedback=<>{sourceIssue&&<div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 text-red-800"><p>{chatText('來源對話暫時無法讀取；原內容保留，請重試讀取來源對話。')}</p><button type="button" className={button} disabled={sourceBusy} onClick={()=>setSourceReload(value=>value+1)}>{chatText('重試讀取來源對話')}</button></div>}{sourceBusy&&<p role="status">{chatText('正在讀取來源對話…')}</p>}</>;
  const active = useRef(true), gate = useRef(false), seq = useRef(0), seen = useRef(new Set<string>());
  const autoPause = useChatReadPause();
  const roomIntent = useRef(activeRoom); roomIntent.current = activeRoom;
  async function load(next?: string, automatic = false) {
    if (gate.current || automatic && autoPause.control.current.paused) return; gate.current = true; const current = ++seq.current; const pauseGeneration = autoPause.control.current.generation; setBusy(true); setError('');
    try {
      if (next && seen.current.has(next)) throw new ChatDataError('聊天分頁重複，請重新載入收件匣。');
      const page = parseChatInbox(await api<unknown>(token, '/chat/conversations?limit=25' + (next ? '&cursor=' + next : '')), userId);
      if (!active.current || current !== seq.current) return;
      if (next) seen.current.add(next); else seen.current.clear();
      setRooms(old => next ? [...new Map([...old, ...page.items].map(room => [room.id, room])).values()] : page.items); setCursor(page.nextCursor); setLoaded(true);
      if (!automatic) autoPause.resume(pauseGeneration);
    } catch (failure) { if (active.current && current === seq.current) { if (shouldPauseChatReads(failure)) autoPause.pause(); setError(failure instanceof ChatDataError ? failure.message : failure instanceof ApiFailure && failure.status === 429 ? '請求暫時受限，已暫停自動讀取；請稍後再試，原內容與待確認操作會保留。' : failure instanceof ApiFailure && failure.status === 401 ? '登入已失效；請重新登入原帳號，待確認操作會保留。' : '暫時無法載入聊天；不代表沒有對話，請重試。'); } }
    finally { gate.current = false; if (active.current && current === seq.current) setBusy(false); }
  }
  useEffect(() => {
    active.current = true; void load(); const tick = () => { if (document.visibilityState === 'visible' && !roomIntent.current) void load(undefined, true); };
    const timer = window.setInterval(tick, 30_000); document.addEventListener('visibilitychange', tick); window.addEventListener('online', tick);
    return () => { active.current = false; seq.current++; window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', tick); };
  }, []);
  useEffect(() => { if (!activeRoom && loaded) void load(); }, [activeRoom]);
  return <section className="mx-auto max-w-3xl space-y-4 pb-20"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">{chatText("聊天與面交")}</h1><p className="mt-2 text-sm text-gray-600">{chatText("與買家或賣家聯繫，討論商品細節並約面交。")}</p></div><Link to="/social" className={button}>{chatText("好友與原有社交功能")}</Link></header>
    {invalidIntent && <div role="alert" className="rounded-xl bg-red-50 p-3">{chatText("聊天連結無效，不會使用不明識別碼查詢。")}<button className={button} onClick={() => navigate('/chat', { replace: true })}>{chatText("返回收件匣")}</button></div>}
    {sourceId ? <>{sourceFeedback}{source&&<SourceContactChat key={`${userId}:${source.id}`} source={source} onBack={()=>navigate('/explore?source='+source.id)}/>}</> : activeRoom ? <ChatRoomWeb key={activeRoom} roomId={activeRoom} token={token} userId={userId} onBack={() => navigate('/chat')} /> : <>
      {sourceFeedback}<div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{chatText('Wishlist AI 代問')}</h2><button type="button" className={button} disabled={sourceBusy} onClick={()=>setSourceReload(value=>value+1)}>{chatText('重新讀取來源對話')}</button></div>{sourceThreads.map(t=><button key={t.id} className="flex w-full rounded-2xl border bg-white p-4 text-left" onClick={()=>navigate('/chat?source='+t.context.id)}><span><span className="block font-semibold">{t.context.title}</span><span className="block text-sm text-gray-600">Wishlist AI · {sourceInquiryStatus(t.state)}</span></span></button>)}</div>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{chatMessage(error)}</p>}{busy && <p role="status">{chatText("正在更新聊天…")}</p>}
      {autoPause.paused && <p role="status" className="text-sm text-gray-600">{chatText('自動讀取已暫停；請使用本頁更新按鈕重新核對，成功後才會恢復。登入失效時請先重新登入原帳號。')}</p>}
      <div className="space-y-3">{rooms.map(room => <button key={room.id} type="button" className="flex w-full min-w-0 items-start gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm" onClick={() => navigate('/chat?room=' + room.id)} aria-label={chatText('{title}，與{name}聊天{unread}', { title: chatRoomTitle(room), name: (room.buyerUserId === userId ? room.seller.name : room.buyer.name) || chatText('商品聯絡人'), unread: room.unreadCount ? chatText('，{count} 則未讀', { count: room.unreadCount }) : '' })}>
        <span className="w-16 flex-none overflow-hidden rounded-xl"><RoomPhoto room={room} token={token} /></span><span className="min-w-0 flex-1"><span className="block break-words font-semibold">{chatRoomTitle(room)}</span><span className="block text-sm">{chatText("與")} {(room.buyerUserId === userId ? room.seller.name : room.buyer.name) || (room.archived ? chatText("已移除的帳號") : chatText("商品聯絡人"))} · {chatRoomPrice(room)}</span>
          <span className="mt-1 block break-words text-sm text-gray-600">{room.archived ? chatText("已封存 · 僅供查看") : room.blocked ? chatText("已封鎖 · 歷史仍可查看") : !room.listingAvailable ? chatText("商品已停止刊登 · 歷史仍可查看") : room.lastMessageText || chatText("開始討論這件商品")}</span><span className="mt-1 block text-xs text-gray-500">{chatTime(room.lastMessageAt)}{chatText("（台灣時間）")}</span></span>
        {room.unreadCount > 0 && <span className="rounded-full bg-green-800 px-2 py-1 text-xs text-white">{room.unreadCount} {chatText("則未讀")}</span>}
      </button>)}</div>{loaded && !rooms.length && !error && !busy && <p className="rounded-2xl bg-white p-6 text-center">{chatText("其他商品尚無聊天。當有買家或賣家聯繫時，對話會顯示在這裡。")}</p>}
      <div className="flex flex-wrap gap-3">{cursor && <button className={button} disabled={busy} onClick={() => void load(cursor)}>{chatText("載入較早的聊天")}</button>}<button className={button} disabled={busy} onClick={() => void load()}>{chatText("重新載入收件匣")}</button><Link to="/explore" className={button}>{chatText("探索商品")}</Link></div>
    </>}
  </section>;
}
export function ChatRoomWeb({ token, userId, roomId, onBack }: { token: string; userId: number; roomId: string; onBack: () => void }) {
  const [room, setRoom] = useState<ChatRoomRecord | null>(null), [messages, setMessages] = useState<ChatMessage[]>([]), [before, setBefore] = useState<number | null>(null), [historyLoaded, setHistoryLoaded] = useState(false);
  const [text, setText] = useState(''), [pending, setPending] = useState<string | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [updating, setUpdating] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [readIssue, setReadIssue] = useState(''), [catchup, setCatchup] = useState(false);
  const [restoreIssue, setRestoreIssue] = useState('');
  const [meetup, setMeetup] = useState<MeetupRecord | null>(null), [meetupIssue, setMeetupIssue] = useState(''), [showMeetup, setShowMeetup] = useState(false), [blockUnknown, setBlockUnknown] = useState(false);
  const active = useRef(true), mutation = useRef(false), reading = useRef(false), restoring = useRef(false), sequence = useRef(0), meetupSequence = useRef(0);
  const autoPause = useChatReadPause();
  const roomRef = useRef<ChatRoomRecord | null>(null), messageRef = useRef<ChatMessage[]>([]), saved = useRef<string | null>(null), key = useRef<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null), viewed = useRef(0), marking = useRef(false), readTimer = useRef<number | undefined>(undefined), shownMeetup = useRef(showMeetup); shownMeetup.current = showMeetup;
  const following = useRef(true), scrollBefore = useRef<{ height: number; top: number } | null>(null);
  const markRef = useRef<() => Promise<void>>(async () => {});
  const read = (path: string, init?: RequestInit) => { if (!active.current) return Promise.reject(new Error('已離開')); return api<unknown>(token, path, init).catch(failure => { if (active.current && shouldPauseChatReads(failure)) autoPause.pause(); throw failure; }); };
  function admit(next: ChatRoomRecord) {
    if (next.id !== roomId) throw new ChatDataError();
    roomRef.current = next; setRoom(next); messageRef.current = retainMemberMessages(messageRef.current, next); setMessages(messageRef.current);
    if (next.archived) { meetupSequence.current++; setMeetup(null); setMeetupIssue(''); setShowMeetup(false); }
  }
  function append(next: ChatMessage[]) { messageRef.current = retainMemberMessages(mergeMessages(messageRef.current, next), roomRef.current!); setMessages(messageRef.current); }
  async function accept(result: Awaited<ReturnType<typeof acknowledgeChatMessage>>, body: string) {
    if (!active.current) return;
    append([result.message]);
    if (result.pendingCleared && saved.current === body) { saved.current = null; setPending(null); setText(''); setNotice('原訊息已確認送出。'); }
    else if (!result.pendingCleared) setError('原訊息已確認送出，但本機標記尚未清除；請查核原回執，不建立另一則訊息。');
  }
  async function admitMessages(next: ChatMessage[]) {
    append(next);
    if (!saved.current || !key.current || !roomRef.current) return;
    const body = saved.current, request = parsePendingMessage(body);
    const match = next.find(m => m.senderUserId === userId && m.clientMessageId === request.clientMessageId);
    if (match) await accept(await acknowledgeChatMessage(match, roomRef.current, userId, privatePendingStore, key.current, body), body);
  }
  async function refreshMeetup(next: ChatRoomRecord) {
    if (next.archived) return; const seq = ++meetupSequence.current;
    try { const value = await read(`/chat/conversations/${roomId}/meetup`) as { appointment: unknown }, appointment = parseMeetup(value.appointment, next);
      if (active.current && seq === meetupSequence.current && !roomRef.current?.archived) { setMeetup(appointment); setMeetupIssue(''); }
    } catch { if (active.current && seq === meetupSequence.current) { setMeetup(null); setMeetupIssue('面交狀態暫時無法確認；請開啟預約詳情重試。'); } }
  }
  async function refresh(older?: number, automatic = false) {
    if (reading.current || mutation.current || !active.current || automatic && autoPause.control.current.paused) return; reading.current = true; setUpdating(true); setError(''); const seq = ++sequence.current; const pauseGeneration = autoPause.control.current.generation;
    try {
      const next = parseChatRoom(await read('/chat/conversations/' + roomId), userId);
      if (!active.current || seq !== sequence.current) return; admit(next); setBlockUnknown(false); if (!older && !shownMeetup.current) void refreshMeetup(next);
      const last = messageRef.current.at(-1)?.sequence;
      const anchor = older ? '&beforeSequence=' + older : last !== undefined ? '&afterSequence=' + last : '';
      let page = parseMessagePage(await read(`/chat/conversations/${roomId}/messages?limit=50${anchor}`), next);
      if (!active.current || seq !== sequence.current) return;
      if (older && page.items.some(m => m.sequence >= older) || !older && last !== undefined && page.items.some(m => m.sequence <= last)) throw new ChatDataError('聊天分頁方向不正確。');
      if (older && scroll.current) scrollBefore.current = { height: scroll.current.scrollHeight, top: scroll.current.scrollTop };
      await admitMessages(page.items); if (!active.current || seq !== sequence.current) return;
      if (older || last === undefined) setBefore(page.nextBeforeSequence); setHistoryLoaded(true);
      for (let count = 0; !older && page.nextAfterSequence !== null && count < 4; count++) {
        const after = page.nextAfterSequence; page = parseMessagePage(await read(`/chat/conversations/${roomId}/messages?limit=50&afterSequence=${after}`), next);
        if (!active.current || seq !== sequence.current) return;
        if (page.items.some(m => m.sequence <= after)) throw new ChatDataError('聊天分頁重複。'); await admitMessages(page.items);
      }
      if (active.current && seq === sequence.current) { setCatchup(!older && page.nextAfterSequence !== null); if (!automatic) autoPause.resume(pauseGeneration); }
    } catch (failure) { if (active.current && seq === sequence.current) setError(failure instanceof ChatDataError ? failure.message : failure instanceof ApiFailure && failure.status === 429 ? '請求暫時受限，已暫停自動讀取；請稍後再試，原內容與待確認操作會保留。' : failure instanceof ApiFailure && failure.status === 401 ? '登入已失效；原訊息保留，請重新登入原帳號後查核。' : '無法更新聊天；歷史可能不完整，待確認訊息仍保留，請重試。'); }
    finally { reading.current = false; if (active.current) setUpdating(false); }
  }
  async function checkPending() {
    const next = roomRef.current, body = saved.current;
    if (!next || !body || !key.current || mutation.current) return; mutation.current = true; setBusy(true); setError('');
    try { await accept(await lookupChatMessage(read, next, userId, privatePendingStore, key.current, body), body); }
    catch (failure) { if (active.current) setError(failure instanceof ApiFailure && failure.status === 404 ? '尚無原訊息回執；不代表送出失敗或已取消，原內容保留，可明確重試。' : '無法查核原訊息回執；沒有重新傳送，原內容仍保留。'); }
    finally { mutation.current = false; if (active.current) setBusy(false); }
  }
  async function restore() {
    if (restoring.current || mutation.current) return; restoring.current = true; setReady(false); setError(''); setRestoreIssue('');
    try {
      const requestKey = await pendingRequestKey(getFullApiUrl(), userId, 'message.' + roomId), body = await privatePendingStore.get(requestKey);
      const request = body ? parsePendingMessage(body) : null;
      if (!active.current) return; key.current = requestKey; saved.current = body; setPending(body); if (request) setText(request.text); setReady(true);
      await refresh(); if (active.current && saved.current && !autoPause.control.current.paused) await checkPending();
    } catch { if (active.current) setRestoreIssue('無法安全恢復待確認訊息；請重試恢復，不會丟棄原識別碼重複傳送。'); }
    finally { restoring.current = false; }
  }
  markRef.current = async () => {
    const current = roomRef.current, through = viewed.current;
    if (!active.current || !current || marking.current || reading.current || autoPause.control.current.paused || document.visibilityState !== 'visible' || shownMeetup.current || through <= current.lastReadSequence) return;
    marking.current = true;
    try {
      const updated = parseChatRoom(await read(`/chat/conversations/${roomId}/read`, { method: 'POST', body: JSON.stringify({ throughSequence: through }) }), userId);
      if (updated.id !== roomId || updated.lastReadSequence < through) throw new ChatDataError();
      // Read ACK can arrive behind a room refresh/block. Update only read fields,
      // never overwrite a newer block/archive/product projection with this ACK.
      if (active.current && roomRef.current && updated.lastReadSequence >= roomRef.current.lastReadSequence) {
        const current = roomRef.current; roomRef.current = { ...current, lastReadSequence: updated.lastReadSequence, lastMessageSequence: Math.max(updated.lastMessageSequence, current.lastMessageSequence), unreadCount: updated.lastMessageSequence >= current.lastMessageSequence ? updated.unreadCount : current.unreadCount }; setRoom(roomRef.current); setReadIssue('');
      }
    } catch { if (active.current) setReadIssue('已讀狀態尚未確認；不會假稱已讀，稍後會依實際可見訊息重試。'); }
    finally { marking.current = false; }
  };
  useEffect(() => {
    active.current = true; void restore(); const tick = () => { if (document.visibilityState === 'visible') void refresh(undefined, true).then(() => { if (active.current && !shownMeetup.current) void markRef.current(); }); };
    const timer = window.setInterval(tick, 15_000); document.addEventListener('visibilitychange', tick); window.addEventListener('online', tick);
    return () => { active.current = false; sequence.current++; meetupSequence.current++; window.clearInterval(timer); window.clearTimeout(readTimer.current); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', tick); };
  }, []);
  useEffect(() => {
    const element = scroll.current; if (!element) return;
    if (scrollBefore.current) { element.scrollTop = scrollBefore.current.top + element.scrollHeight - scrollBefore.current.height; scrollBefore.current = null; }
    else if (following.current) element.scrollTop = element.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (!scroll.current || !('IntersectionObserver' in window) || showMeetup) return;
    const visibleTimers = new Map<Element, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (visibleTimers.has(entry.target)) { window.clearTimeout(visibleTimers.get(entry.target)); visibleTimers.delete(entry.target); }
        if (entry.isIntersecting && entry.intersectionRatio >= 0.8 && document.visibilityState === 'visible') visibleTimers.set(entry.target, window.setTimeout(() => {
          if (!active.current || document.visibilityState !== 'visible' || shownMeetup.current) return;
          const seq = Number((entry.target as HTMLElement).dataset.sequence); if (Number.isSafeInteger(seq)) viewed.current = Math.max(viewed.current, seq);
          window.clearTimeout(readTimer.current); readTimer.current = window.setTimeout(() => void markRef.current(), 500);
        }, 500));
      }
    }, { root: scroll.current, threshold: 0.8 });
    scroll.current.querySelectorAll('[data-sequence]').forEach(element => observer.observe(element));
    return () => { observer.disconnect(); visibleTimers.forEach(timer => window.clearTimeout(timer)); window.clearTimeout(readTimer.current); };
  }, [messages, showMeetup]);
  async function send() {
    const current = roomRef.current;
    if (!ready || !current || current.archived || !key.current || mutation.current || blockUnknown || current.blocked && !saved.current) return;
    mutation.current = true; sequence.current++; setBusy(true); setError(''); setNotice(''); let confirmed = false;
    try {
      const body = saved.current ?? JSON.stringify(messageBody(crypto.randomUUID(), text)), requestKey = key.current; parsePendingMessage(body);
      await privatePendingStore.save(requestKey, body); saved.current = body; if (!active.current) return; setPending(body); setText(parsePendingMessage(body).text);
      await accept(await submitChatMessage(read, current, userId, privatePendingStore, requestKey, body), body);
      confirmed = true;
    } catch (failure) { if (active.current) { if (failure instanceof PendingStoreError) { setReady(false); setRestoreIssue(failure.message); } setError(failure instanceof PendingStoreError ? failure.message : saved.current ? '尚未確認訊息送出；重試會使用相同識別碼與文字，也可只查核原回執。' : failure instanceof Error ? failure.message : '尚未送出訊息。'); } }
    finally { mutation.current = false; if (active.current) { setBusy(false); if (confirmed && !saved.current) void refresh(undefined, true); } }
  }
  async function block() {
    const current = roomRef.current; if (!current || current.archived || mutation.current || blockUnknown) return;
    mutation.current = true; sequence.current++; setBusy(true); setError('');
    const other = current.buyerUserId === userId ? current.sellerUserId : current.buyerUserId;
    try {
      await read('/chat/blocks/' + other, { method: current.blockedByMe ? 'DELETE' : 'POST', body: '{}' });
      const next = parseChatRoom(await read('/chat/conversations/' + roomId), userId); if (active.current) { admit(next); setBlockUnknown(false); }
    } catch { if (active.current) { setBlockUnknown(true); setError('封鎖狀態尚未確認；請只更新聊天查核，不會自動反向操作或重送。'); } }
    finally { mutation.current = false; if (active.current) setBusy(false); }
  }
  return <div className="space-y-4"><div className="flex flex-wrap items-center gap-2"><button className={button} onClick={onBack}>{chatText("返回收件匣")}</button><button className={button} disabled={updating || busy} onClick={() => void refresh()}>{updating ? chatText("正在更新…") : chatText("只更新聊天")}</button>
    {room && !room.archived && <button className={`${button} text-red-800`} disabled={busy || blockUnknown} onClick={() => void block()}>{room.blockedByMe ? chatText("解除封鎖") : chatText("封鎖對方")}</button>}</div>
    {room ? <section aria-label={chatText("聊天商品")} className="flex min-w-0 items-start gap-3 rounded-2xl border bg-white p-4"><span className="w-16 flex-none"><RoomPhoto room={room} token={token} /></span><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{chatRoomTitle(room)}</h2><p className="font-semibold">{chatRoomPrice(room)}</p><p className="text-sm">{chatText("與")} {(room.buyerUserId === userId ? room.seller.name : room.buyer.name) || chatText("已移除的帳號")}</p></div></section> : !error && <p role="status">{chatText("正在讀取聊天室…")}</p>}
    {room?.archived && <p className="rounded-xl bg-gray-100 p-3">{chatText("聊天室已封存，僅可查看保留歷史；對方刪除帳號時其訊息及私密預約會移除。")}</p>}{room?.blocked && !room.archived && <p>{chatText("已封鎖，停止傳送新訊息；歷史仍可查看，原訊息可查核回執。")}</p>}{room && !room.listingAvailable && !room.archived && <p>{chatText("商品已停止刊登；請與對方確認交易狀態。")}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{chatMessage(error)}</p>}{readIssue && <p role="status" className="text-sm text-gray-600">{chatMessage(readIssue)}</p>}{notice && <p role="status" className="text-sm text-green-800">{chatMessage(notice)}</p>}
    {autoPause.paused && <p role="status" className="text-sm text-gray-600">{chatText('自動讀取已暫停；請使用本頁更新按鈕重新核對，成功後才會恢復。登入失效時請先重新登入原帳號。')}</p>}
    {restoreIssue && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{chatMessage(restoreIssue)}</p>}
    <div ref={scroll} onScroll={() => { const el = scroll.current!; following.current = el.scrollHeight - el.clientHeight - el.scrollTop < 40; }} tabIndex={0} role="region" aria-label={chatText("商品聊天訊息紀錄")} className="max-h-[50dvh] min-h-40 space-y-3 overflow-y-auto rounded-2xl border bg-gray-50 p-4 focus:outline-green-800">
      {before && <button className={button} disabled={updating || busy} onClick={() => void refresh(before)}>{chatText("載入較早訊息")}</button>}
      {messages.map(message => <article key={message.id} data-sequence={message.sequence} aria-label={message.senderUserId === userId ? chatText("本人訊息") : chatText("對方訊息")} className={`max-w-[88%] rounded-2xl p-3 ${message.senderUserId === userId ? 'ml-auto bg-green-800 text-white' : 'mr-auto border bg-white'}`}><p className="whitespace-pre-wrap break-words">{message.text}</p><p className="mt-1 text-xs opacity-75">{chatTime(message.createdAt)}{chatText("（台灣時間）")}</p></article>)}
      {historyLoaded && !messages.length && !error && <p>{chatText("還沒有訊息，打聲招呼吧。")}</p>}
    </div>{catchup && <p role="status">{chatText("仍有更新的訊息尚未讀完；下一次更新會繼續讀取，不代表最新紀錄已完整。")}</p>}
    {room && !room.archived && <section aria-label={chatText("聊天面交預約")} className="space-y-3 rounded-2xl border bg-white p-4"><button className={button} onClick={() => setShowMeetup(true)}>{chatText("查看或提議面交預約")}</button>{meetup && <div className="space-y-1"><h3 className="font-semibold">{chatText("面交預約 ·")} {chatMessage(meetupLabels[meetup.status])} {chatText("· 第")}{meetup.version}{chatText("版")}</h3><p>{chatTime(meetup.startsAt)}{chatText("（台灣時間）")}</p><p className="break-words">{meetup.placeName}</p>{meetup.status === 'PROPOSED' && <p className="text-sm">{chatText("時間與地點仍待雙方確認，請在詳情核對後回覆。")}</p>}</div>}{meetupIssue && <p role="alert" className="text-red-800">{chatMessage(meetupIssue)}</p>}</section>}
    <form className="space-y-3 rounded-2xl border bg-white p-4" onSubmit={event => { event.preventDefault(); void send(); }}>
      {pending && <p className="text-sm">{chatText("上一則訊息結果尚未確認，原識別碼與文字已保留；不會自動重送或建立重複訊息。")}{room?.archived ? chatText("聊天室已封存，不能重新傳送。") : ''}</p>}
      {!ready && <button type="button" className={button} disabled={busy} onClick={() => void restore()}>{chatText("重試恢復待確認訊息")}</button>}
      <label className="block">{chatText("商品聊天訊息（最多2000字元）")}<textarea disabled={!ready || busy || !!pending || !room || room.blocked || room.archived || blockUnknown} maxLength={2000} value={text} onChange={event => setText(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border p-3" placeholder={chatText("輸入訊息，預約前請確認商品狀態")} /></label>
      <div className="flex flex-wrap gap-2"><button type="submit" className={`${button} bg-green-800 text-white`} disabled={busy || !ready || !room || room.archived || blockUnknown || !pending && (!text.trim() || room.blocked)}>{pending ? chatText("明確重試相同訊息") : chatText("傳送訊息")}</button>
        {pending && <button type="button" className={button} disabled={busy || !room} onClick={() => void checkPending()}>{chatText("只查核原訊息回執")}</button>}
        {room && !('IntersectionObserver' in window) && <><p className="text-sm">{chatText("此瀏覽器無法偵測訊息可見範圍，不會自動標記已讀；可由你明確確認。")}</p><button type="button" className={button} disabled={!messages.length || autoPause.paused} onClick={() => { viewed.current = Math.max(viewed.current, ...messages.map(m => m.sequence)); void markRef.current(); }}>{chatText("將目前已載入訊息標記為已讀")}</button></>}
      </div>
    </form>{showMeetup && room && !room.archived && <MeetupWeb key={`${userId}:${token}:${room.id}`} room={room} token={token} userId={userId} onReadPause={() => { if (active.current) autoPause.pause(); }} onClose={() => { setShowMeetup(false); void refresh(undefined, true); }} />}
  </div>;
}
