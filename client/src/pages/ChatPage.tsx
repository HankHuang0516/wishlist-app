import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getFullApiUrl } from '../config';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { isUuid } from '../lib/listingBatch';
import { ChatDataError, mergeMessages, messageBody, parseChatInbox, parseChatRoom, parseMessagePage, retainMemberMessages, type ChatMessage, type ChatRoomRecord } from '../lib/chatData';
import { acknowledgeChatMessage, lookupChatMessage, meetupLabels, parsePendingMessage, privateChatPhotoId, submitChatMessage, taipeiTime } from '../lib/chatWeb';
import { parseMeetup, type MeetupRecord } from '../lib/meetupData';
import { pendingRequestKey, privatePendingStore, PendingStoreError } from '../lib/webPendingStore';
import PrivatePhoto from '../components/PrivateMarketplacePhoto';
import MeetupWeb from '../components/MeetupWeb';
const button = 'min-h-11 rounded-xl border px-4 py-2 disabled:opacity-50';
const roomPrice = (room: ChatRoomRecord) => room.listing.price === null ? '售價未提供' : room.listing.price === 0 ? '免費贈送' : 'NT$ ' + room.listing.price.toLocaleString('zh-TW');
function RoomPhoto({ room, token }: { room: ChatRoomRecord; token: string }) {
  const id = privateChatPhotoId(room, getFullApiUrl());
  return id ? <PrivatePhoto id={id} token={token} label="聊天商品照片" compact /> : <div role="img" aria-label="聊天商品照片未提供或已停止公開" className="flex h-16 w-16 items-center rounded-xl bg-gray-100 p-2 text-xs">{room.listingAvailable ? '照片未提供' : '已停止公開'}</div>;
}
export default function ChatPage() {
  const { user, token } = useAuth(), location = useLocation();
  if (!token || !user) return <section className="space-y-4"><h1 className="text-2xl font-semibold">聊天與面交</h1><p>登入後與商品買家或賣家聯絡。</p><Link className="text-green-800 underline" to={'/login?next=' + encodeURIComponent('/chat' + location.search)}>登入</Link></section>;
  return <ChatSession key={`${user.id}:${token}`} token={token} userId={user.id} />;
}
function ChatSession({ token, userId }: { token: string; userId: number }) {
  const location = useLocation(), navigate = useNavigate(), params = new URLSearchParams(location.search);
  const invalidIntent = params.size > 1 || params.size === 1 && (!params.has('room') || !isUuid(params.get('room')));
  const activeRoom = invalidIntent ? null : params.get('room')?.toLowerCase() ?? null;
  const [rooms, setRooms] = useState<ChatRoomRecord[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const active = useRef(true), gate = useRef(false), seq = useRef(0), seen = useRef(new Set<string>());
  const roomIntent = useRef(activeRoom); roomIntent.current = activeRoom;
  async function load(next?: string) {
    if (gate.current) return; gate.current = true; const current = ++seq.current; setBusy(true); setError('');
    try {
      if (next && seen.current.has(next)) throw new ChatDataError('聊天分頁重複，請重新載入收件匣。');
      const page = parseChatInbox(await api<unknown>(token, '/chat/conversations?limit=25' + (next ? '&cursor=' + next : '')), userId);
      if (!active.current || current !== seq.current) return;
      if (next) seen.current.add(next); else seen.current.clear();
      setRooms(old => next ? [...new Map([...old, ...page.items].map(room => [room.id, room])).values()] : page.items); setCursor(page.nextCursor); setLoaded(true);
    } catch (failure) { if (active.current && current === seq.current) setError(failure instanceof ChatDataError ? failure.message : failure instanceof ApiFailure && failure.status === 401 ? '登入已失效；請重新登入原帳號，待確認操作會保留。' : '暫時無法載入聊天；不代表沒有對話，請重試。'); }
    finally { gate.current = false; if (active.current && current === seq.current) setBusy(false); }
  }
  useEffect(() => {
    active.current = true; void load(); const tick = () => { if (document.visibilityState === 'visible' && !roomIntent.current) void load(); };
    const timer = window.setInterval(tick, 30_000); document.addEventListener('visibilitychange', tick); window.addEventListener('online', tick);
    return () => { active.current = false; seq.current++; window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', tick); };
  }, []);
  useEffect(() => { if (!activeRoom && loaded) void load(); }, [activeRoom]);
  return <section className="mx-auto max-w-3xl space-y-4 pb-20"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">聊天與面交</h1><p className="mt-2 text-sm text-gray-600">與買家或賣家聯繫，討論商品細節並約面交。</p></div><Link to="/social" className={button}>好友與原有社交功能</Link></header>
    {invalidIntent && <div role="alert" className="rounded-xl bg-red-50 p-3">聊天連結無效，不會使用不明識別碼查詢。<button className={button} onClick={() => navigate('/chat', { replace: true })}>返回收件匣</button></div>}
    {activeRoom ? <ChatRoomWeb key={activeRoom} roomId={activeRoom} token={token} userId={userId} onBack={() => navigate('/chat')} /> : <>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}{busy && <p role="status">正在更新聊天…</p>}
      <div className="space-y-3">{rooms.map(room => <button key={room.id} type="button" className="flex w-full min-w-0 items-start gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm" onClick={() => navigate('/chat?room=' + room.id)} aria-label={`${room.listing.title}，與${(room.buyerUserId === userId ? room.seller.name : room.buyer.name) || '商品聯絡人'}聊天${room.unreadCount ? `，${room.unreadCount} 則未讀` : ''}`}>
        <span className="w-16 flex-none overflow-hidden rounded-xl"><RoomPhoto room={room} token={token} /></span><span className="min-w-0 flex-1"><span className="block break-words font-semibold">{room.listing.title}</span><span className="block text-sm">與 {(room.buyerUserId === userId ? room.seller.name : room.buyer.name) || (room.archived ? '已移除的帳號' : '商品聯絡人')} · {roomPrice(room)}</span>
          <span className="mt-1 block break-words text-sm text-gray-600">{room.archived ? '已封存 · 僅供查看' : room.blocked ? '已封鎖 · 歷史仍可查看' : !room.listingAvailable ? '商品已停止刊登 · 歷史仍可查看' : room.lastMessageText || '開始討論這件商品'}</span><span className="mt-1 block text-xs text-gray-500">{taipeiTime(room.lastMessageAt)}（台灣時間）</span></span>
        {room.unreadCount > 0 && <span className="rounded-full bg-green-800 px-2 py-1 text-xs text-white">{room.unreadCount} 則未讀</span>}
      </button>)}</div>{loaded && !rooms.length && !error && !busy && <p className="rounded-2xl bg-white p-6 text-center">其他商品尚無聊天。當有買家或賣家聯繫時，對話會顯示在這裡。</p>}
      <div className="flex flex-wrap gap-3">{cursor && <button className={button} disabled={busy} onClick={() => void load(cursor)}>載入較早的聊天</button>}<button className={button} disabled={busy} onClick={() => void load()}>重新載入收件匣</button><Link to="/explore" className={button}>探索商品</Link></div>
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
  const roomRef = useRef<ChatRoomRecord | null>(null), messageRef = useRef<ChatMessage[]>([]), saved = useRef<string | null>(null), key = useRef<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null), viewed = useRef(0), marking = useRef(false), readTimer = useRef<number | undefined>(undefined), shownMeetup = useRef(showMeetup); shownMeetup.current = showMeetup;
  const following = useRef(true), scrollBefore = useRef<{ height: number; top: number } | null>(null);
  const markRef = useRef<() => Promise<void>>(async () => {});
  const read = (path: string, init?: RequestInit) => { if (!active.current) return Promise.reject(new Error('已離開')); return api<unknown>(token, path, init); };
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
  async function refresh(older?: number) {
    if (reading.current || mutation.current || !active.current) return; reading.current = true; setUpdating(true); setError(''); const seq = ++sequence.current;
    try {
      const next = parseChatRoom(await read('/chat/conversations/' + roomId), userId);
      if (!active.current || seq !== sequence.current) return; admit(next); setBlockUnknown(false); if (!older) void refreshMeetup(next);
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
      if (active.current && seq === sequence.current) setCatchup(!older && page.nextAfterSequence !== null);
    } catch (failure) { if (active.current && seq === sequence.current) setError(failure instanceof ChatDataError ? failure.message : failure instanceof ApiFailure && failure.status === 401 ? '登入已失效；原訊息保留，請重新登入原帳號後查核。' : '無法更新聊天；歷史可能不完整，待確認訊息仍保留，請重試。'); }
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
      await refresh(); if (active.current && saved.current) await checkPending();
    } catch { if (active.current) setRestoreIssue('無法安全恢復待確認訊息；請重試恢復，不會丟棄原識別碼重複傳送。'); }
    finally { restoring.current = false; }
  }
  markRef.current = async () => {
    const current = roomRef.current, through = viewed.current;
    if (!current || marking.current || document.visibilityState !== 'visible' || shownMeetup.current || through <= current.lastReadSequence) return;
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
    active.current = true; void restore(); const tick = () => { if (document.visibilityState === 'visible') { void refresh(); if (!shownMeetup.current) void markRef.current(); } };
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
    mutation.current = true; sequence.current++; setBusy(true); setError(''); setNotice('');
    try {
      const body = saved.current ?? JSON.stringify(messageBody(crypto.randomUUID(), text)), requestKey = key.current; parsePendingMessage(body);
      await privatePendingStore.save(requestKey, body); saved.current = body; if (!active.current) return; setPending(body); setText(parsePendingMessage(body).text);
      await accept(await submitChatMessage(read, current, userId, privatePendingStore, requestKey, body), body);
    } catch (failure) { if (active.current) { if (failure instanceof PendingStoreError) { setReady(false); setRestoreIssue(failure.message); } setError(failure instanceof PendingStoreError ? failure.message : saved.current ? '尚未確認訊息送出；重試會使用相同識別碼與文字，也可只查核原回執。' : failure instanceof Error ? failure.message : '尚未送出訊息。'); } }
    finally { mutation.current = false; if (active.current) { setBusy(false); if (!saved.current) void refresh(); } }
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
  return <div className="space-y-4"><div className="flex flex-wrap items-center gap-2"><button className={button} onClick={onBack}>返回收件匣</button><button className={button} disabled={updating || busy} onClick={() => void refresh()}>{updating ? '正在更新…' : '只更新聊天'}</button>
    {room && !room.archived && <button className={`${button} text-red-800`} disabled={busy || blockUnknown} onClick={() => void block()}>{room.blockedByMe ? '解除封鎖' : '封鎖對方'}</button>}</div>
    {room ? <section aria-label="聊天商品" className="flex min-w-0 items-start gap-3 rounded-2xl border bg-white p-4"><span className="w-16 flex-none"><RoomPhoto room={room} token={token} /></span><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{room.listing.title}</h2><p className="font-semibold">{roomPrice(room)}</p><p className="text-sm">與 {(room.buyerUserId === userId ? room.seller.name : room.buyer.name) || '已移除的帳號'}</p></div></section> : !error && <p role="status">正在讀取聊天室…</p>}
    {room?.archived && <p className="rounded-xl bg-gray-100 p-3">聊天室已封存，僅可查看保留歷史；對方刪除帳號時其訊息及私密預約會移除。</p>}{room?.blocked && !room.archived && <p>已封鎖，停止傳送新訊息；歷史仍可查看，原訊息可查核回執。</p>}{room && !room.listingAvailable && !room.archived && <p>商品已停止刊登；請與對方確認交易狀態。</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}{readIssue && <p role="status" className="text-sm text-gray-600">{readIssue}</p>}{notice && <p role="status" className="text-sm text-green-800">{notice}</p>}
    {restoreIssue && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{restoreIssue}</p>}
    <div ref={scroll} onScroll={() => { const el = scroll.current!; following.current = el.scrollHeight - el.clientHeight - el.scrollTop < 40; }} tabIndex={0} role="region" aria-label="商品聊天訊息紀錄" className="max-h-[50dvh] min-h-40 space-y-3 overflow-y-auto rounded-2xl border bg-gray-50 p-4 focus:outline-green-800">
      {before && <button className={button} disabled={updating || busy} onClick={() => void refresh(before)}>載入較早訊息</button>}
      {messages.map(message => <article key={message.id} data-sequence={message.sequence} aria-label={message.senderUserId === userId ? '本人訊息' : '對方訊息'} className={`max-w-[88%] rounded-2xl p-3 ${message.senderUserId === userId ? 'ml-auto bg-green-800 text-white' : 'mr-auto border bg-white'}`}><p className="whitespace-pre-wrap break-words">{message.text}</p><p className="mt-1 text-xs opacity-75">{taipeiTime(message.createdAt)}（台灣時間）</p></article>)}
      {historyLoaded && !messages.length && !error && <p>還沒有訊息，打聲招呼吧。</p>}
    </div>{catchup && <p role="status">仍有更新的訊息尚未讀完；下一次更新會繼續讀取，不代表最新紀錄已完整。</p>}
    {room && !room.archived && <section aria-label="聊天面交預約" className="space-y-3 rounded-2xl border bg-white p-4"><button className={button} onClick={() => setShowMeetup(true)}>查看或提議面交預約</button>{meetup && <div className="space-y-1"><h3 className="font-semibold">面交預約 · {meetupLabels[meetup.status]} · 第{meetup.version}版</h3><p>{taipeiTime(meetup.startsAt)}（台灣時間）</p><p className="break-words">{meetup.placeName}</p>{meetup.status === 'PROPOSED' && <p className="text-sm">時間與地點仍待雙方確認，請在詳情核對後回覆。</p>}</div>}{meetupIssue && <p role="alert" className="text-red-800">{meetupIssue}</p>}</section>}
    <form className="space-y-3 rounded-2xl border bg-white p-4" onSubmit={event => { event.preventDefault(); void send(); }}>
      {pending && <p className="text-sm">上一則訊息結果尚未確認，原識別碼與文字已保留；不會自動重送或建立重複訊息。{room?.archived ? '聊天室已封存，不能重新傳送。' : ''}</p>}
      {!ready && <button type="button" className={button} disabled={busy} onClick={() => void restore()}>重試恢復待確認訊息</button>}
      <label className="block">商品聊天訊息（最多2000字元）<textarea disabled={!ready || busy || !!pending || !room || room.blocked || room.archived || blockUnknown} maxLength={2000} value={text} onChange={event => setText(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border p-3" placeholder="輸入訊息，預約前請確認商品狀態" /></label>
      <div className="flex flex-wrap gap-2"><button type="submit" className={`${button} bg-green-800 text-white`} disabled={busy || !ready || !room || room.archived || blockUnknown || !pending && (!text.trim() || room.blocked)}>{pending ? '明確重試相同訊息' : '傳送訊息'}</button>
        {pending && <button type="button" className={button} disabled={busy || !room} onClick={() => void checkPending()}>只查核原訊息回執</button>}
        {room && !('IntersectionObserver' in window) && <><p className="text-sm">此瀏覽器無法偵測訊息可見範圍，不會自動標記已讀；可由你明確確認。</p><button type="button" className={button} disabled={!messages.length} onClick={() => { viewed.current = Math.max(viewed.current, ...messages.map(m => m.sequence)); void markRef.current(); }}>將目前已載入訊息標記為已讀</button></>}
      </div>
    </form>{showMeetup && room && !room.archived && <MeetupWeb key={`${userId}:${token}:${room.id}`} room={room} token={token} userId={userId} onClose={() => { setShowMeetup(false); void refresh(); }} />}
  </div>;
}
