import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { ApiError, createApi } from './api';
import { ChatDataError, ChatMessage, ChatRoomRecord, mergeMessages, messageBody, parseChatInbox, parseChatMessage, parseChatRoom, parseMessagePage, retainMemberMessages } from './chatData';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { PendingStoreError } from './pendingStore';
import { MeetupSheet } from './MeetupSheet';
type Props = { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; activeRoom: string | null; onRoomChange: (id: string | null) => void };

export function ChatInbox({ api, apiUrl, userId, activeRoom, onRoomChange }: Props) {
  const [rooms, setRooms] = useState<ChatRoomRecord[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const sequence = useRef(0); const alive = useRef(true); const loading = useRef(false);
  async function load(next?: string) {
    if (loading.current) return; loading.current = true; const current = ++sequence.current; setBusy(true); setError('');
    try {
      const page = parseChatInbox(await api<unknown>('/chat/conversations?limit=25' + (next ? '&cursor=' + next : '')), userId);
      if (alive.current && current === sequence.current) {
        setRooms(old => next ? [...new Map([...old, ...page.items].map(room => [room.id, room])).values()] : page.items); setCursor(page.nextCursor);
      }
    } catch { if (alive.current && current === sequence.current) setError('暫時無法載入聊天；請確認網路後重試。'); }
    finally { if (alive.current && current === sequence.current) { setBusy(false); loading.current = false; } }
  }
  useEffect(() => { alive.current = true; void load(); const timer = setInterval(() => { if (AppState.currentState === 'active' && !activeRoom) void load(); }, 30_000); return () => { alive.current = false; sequence.current++; loading.current = false; clearInterval(timer); }; }, [api, userId, activeRoom]);
  return <View style={s.screen}><View style={s.header}><Text style={s.heading}>聊天與面交</Text>{busy && <ActivityIndicator />}</View>{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <FlatList data={rooms} keyExtractor={room => room.id} contentContainerStyle={s.list} renderItem={({ item }) => <Pressable accessibilityRole="button" style={s.card} onPress={() => onRoomChange(item.id)}><Text style={s.title}>{item.listing.title}</Text><Text style={s.text}>{(item.buyerUserId === userId ? item.seller.name : item.buyer.name) || (item.archived ? '對方帳號已刪除或商品已移除' : '商品聯絡人')}{item.unreadCount ? ` · ${item.unreadCount} 則未讀` : ''}</Text>{(!item.listingAvailable || item.blocked) && <Text style={s.small}>{item.archived ? '已封存 · 僅供查看' : item.blocked ? '已封鎖 · 歷史仍可查看' : '商品已停止刊登 · 歷史仍可查看'}</Text>}</Pressable>} ListEmptyComponent={!busy && !error ? <Text style={s.text}>還沒有商品聊天。可從商品頁聯絡賣家。</Text> : null} ListFooterComponent={<View style={s.list}>{cursor && <Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={() => void load(cursor)}><Text style={s.text}>載入較早的聊天</Text></Pressable>}<Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={() => void load()}><Text style={s.text}>重新載入</Text></Pressable></View>} />
    {!!activeRoom && <ChatRoom key={activeRoom} api={api} apiUrl={apiUrl} userId={userId} roomId={activeRoom} onClose={() => onRoomChange(null)} />}
  </View>;
}
function ChatRoom({ api, apiUrl, userId, roomId, onClose }: { api: Props['api']; apiUrl: string; userId: number; roomId: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [showMeetup, setShowMeetup] = useState(false);
  const [room, setRoom] = useState<ChatRoomRecord | null>(null); const [messages, setMessages] = useState<ChatMessage[]>([]); const [before, setBefore] = useState<number | null>(null);
  const [text, setText] = useState(''); const [pending, setPending] = useState<string | null>(null); const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const alive = useRef(true); const loading = useRef(false); const sending = useRef(false); const pendingRef = useRef<string | null>(null); const key = useRef<string | null>(null); const messagesRef = useRef<ChatMessage[]>([]); const roomRef = useRef<ChatRoomRecord | null>(null);
  const viewSequence = useRef(0); const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const reading = useRef(false);
  const read = useRef<() => Promise<void>>(async () => undefined);
  read.current = async () => {
    const current = roomRef.current; const throughSequence = viewSequence.current;
    if (!current || reading.current || AppState.currentState !== 'active' || throughSequence <= current.lastReadSequence) return;
    reading.current = true;
    try { const updated = parseChatRoom(await api<unknown>('/chat/conversations/' + roomId + '/read', { method: 'POST', body: JSON.stringify({ throughSequence }) }), userId); if (alive.current) admitRoom(updated); }
    catch { /* Do not claim read success; a later visible-message update retries. */ }
    finally { reading.current = false; }
  };
  const viewable = useRef(({ viewableItems }: { viewableItems: ViewToken<ChatMessage>[] }) => {
    for (const token of viewableItems) if (token.isViewable) viewSequence.current = Math.max(viewSequence.current, token.item.sequence);
    clearTimeout(readTimer.current); readTimer.current = setTimeout(() => void read.current(), 1000);
  }).current;
  function append(next: ChatMessage[]) {
    const merged = mergeMessages(messagesRef.current, next); const retained = roomRef.current ? retainMemberMessages(merged, roomRef.current) : merged; messagesRef.current = retained; setMessages(retained);
  }
  function admitRoom(current: ChatRoomRecord) {
    roomRef.current = current; setRoom(current);
    messagesRef.current = retainMemberMessages(messagesRef.current, current); setMessages(messagesRef.current);
    if (current.archived) setShowMeetup(false);
  }
  async function acknowledge(message: ChatMessage) {
    if (!pendingRef.current || !key.current) return;
    const body = JSON.parse(pendingRef.current);
    if (message.senderUserId === userId && message.clientMessageId === body.clientMessageId && message.text === body.text) {
      await privatePendingStore.clear(key.current, pendingRef.current);
      if (alive.current) { pendingRef.current = null; setPending(null); setText(''); }
    }
  }
  async function refresh(older?: number) {
    if (loading.current) return; loading.current = true; setError('');
    try {
      const current = parseChatRoom(await api<unknown>('/chat/conversations/' + roomId), userId);
      if (!alive.current) return; admitRoom(current);
      const last = messagesRef.current.at(-1)?.sequence;
      const query = older ? '&beforeSequence=' + older : last !== undefined ? '&afterSequence=' + last : '';
      let page = parseMessagePage(await api<unknown>('/chat/conversations/' + roomId + '/messages?limit=50' + query), current);
      if (!alive.current) return; append(page.items); for (const m of page.items) await acknowledge(m);
      if (older || last === undefined) setBefore(page.nextBeforeSequence);
      // Bounded catch-up pages; the next foreground poll continues if >250
      // unseen messages accumulated rather than loading an unbounded history.
      for (let count = 0; !older && page.nextAfterSequence !== null && count < 4; count++) {
        page = parseMessagePage(await api<unknown>('/chat/conversations/' + roomId + '/messages?limit=50&afterSequence=' + page.nextAfterSequence), current);
        if (!alive.current) return; append(page.items); for (const m of page.items) await acknowledge(m);
      }
      if (!older) void read.current();
    } catch (failure) { if (alive.current) setError(failure instanceof ChatDataError ? failure.message : '暫時無法更新聊天，待確認訊息仍保留；請重試。'); }
    finally { loading.current = false; }
  }
  async function restore() {
    setReady(false); setError('');
    try {
      const requestKey = await pendingRequestKey(apiUrl, userId, 'message.' + roomId); const saved = await privatePendingStore.get(requestKey);
      if (saved) { const body = JSON.parse(saved); const parsed = messageBody(body.clientMessageId, body.text); if (JSON.stringify(parsed) !== saved) throw new ChatDataError(); }
      if (!alive.current) return; key.current = requestKey; pendingRef.current = saved; setPending(saved); if (saved) setText(JSON.parse(saved).text); setReady(true);
      await refresh();
      if (saved && alive.current && roomRef.current) {
        try { const receipt = parseChatMessage(await api<unknown>('/chat/conversations/' + roomId + '/messages/by-client-id/' + JSON.parse(saved).clientMessageId), roomRef.current); await acknowledge(receipt); if (alive.current) append([receipt]); }
        catch (failure) { if (!(failure instanceof ApiError && failure.status === 404)) throw failure; }
      }
    } catch { if (alive.current) setError('無法恢復待確認訊息。請重試恢復；不會丟棄識別碼重複傳送。'); }
  }
  useEffect(() => {
    alive.current = true; void restore(); const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { alive.current = false; clearInterval(timer); clearTimeout(readTimer.current); subscription.remove(); };
  }, []);
  async function send() {
    const current = roomRef.current;
    if (!ready || !current || current.archived || !key.current || sending.current || (current.blocked && !pendingRef.current)) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const body = pendingRef.current ?? JSON.stringify(messageBody(Crypto.randomUUID(), text));
      await privatePendingStore.save(key.current, body); pendingRef.current = body; if (alive.current) setPending(body);
      const sent = parseChatMessage(await api<unknown>('/chat/conversations/' + roomId + '/messages', { method: 'POST', body }), current);
      const candidate = JSON.parse(body);
      if (sent.senderUserId !== userId || sent.clientMessageId !== candidate.clientMessageId || sent.text !== candidate.text) throw new ChatDataError();
      await acknowledge(sent); if (alive.current) { append([sent]); void refresh(); }
    } catch (failure) { if (alive.current) {
      if (failure instanceof PendingStoreError) setReady(false);
      setError(failure instanceof ChatDataError ? failure.message : failure instanceof PendingStoreError ? '無法安全保存或確認待送訊息，請重試恢復。尚未重新建立傳送請求。' : '尚未確認訊息送出；重試會使用相同識別碼與文字。也可返回收件匣稍後確認。');
    } }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  async function block() {
    const current = roomRef.current; if (!current || current.archived || sending.current) return; sending.current = true; setBusy(true); setError('');
    const other = current.buyerUserId === userId ? current.sellerUserId : current.buyerUserId;
    try { await api('/chat/blocks/' + other, { method: current.blockedByMe ? 'DELETE' : 'POST', body: '{}' }); await refresh(); }
    catch { if (alive.current) setError('無法確認封鎖狀態，請重新載入。'); }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  const inputDisabled = !ready || busy || !!pending || !!room?.blocked || !!room?.archived;
  return <Modal visible animationType="slide" onRequestClose={onClose}><View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><Pressable accessibilityRole="button" style={s.chip} onPress={onClose}><Text style={s.text}>返回</Text></Pressable><Text numberOfLines={2} style={[s.title, s.flex]}>{room?.listing.title || '商品聊天'}</Text><Pressable accessibilityRole="button" disabled={busy || !room || room.archived} style={s.chip} onPress={() => void block()}><Text style={s.text}>{room?.blockedByMe ? '解除封鎖' : '封鎖'}</Text></Pressable></View>
    {room && (!room.listingAvailable || room.blocked) && <Text style={s.notice}>{room.archived ? '聊天室已封存，不能再傳送訊息或預約面交。若對方刪除帳號，其訊息與私密預約也會移除。' : room.blocked ? '已封鎖，停止傳送新訊息；歷史仍可查看。' : '商品已停止刊登；請與對方確認交易狀態。'}</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {room && !room.archived && <Pressable accessibilityRole="button" style={s.chip} onPress={() => setShowMeetup(true)}><Text style={s.text}>查看或提議面交預約</Text></Pressable>}
    <FlatList inverted data={[...messages].reverse()} keyExtractor={m => m.id} contentContainerStyle={s.list} onViewableItemsChanged={viewable} viewabilityConfig={{ itemVisiblePercentThreshold: 80, minimumViewTime: 500 }} renderItem={({ item }) => <View style={[s.bubble, item.senderUserId === userId ? s.mine : s.theirs]}><Text style={s.text}>{item.text}</Text><Text style={s.small}>{new Date(item.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</Text></View>} ListEmptyComponent={room && !error ? <Text style={s.text}>還沒有訊息，打聲招呼吧。</Text> : null} ListFooterComponent={before ? <Pressable accessibilityRole="button" style={s.chip} onPress={() => void refresh(before)}><Text style={s.text}>載入較早訊息</Text></Pressable> : null} />
    <View style={s.composer}>{pending && <Text style={s.small}>{room?.archived ? '聊天室已封存，待確認訊息不會重新送出。可更新聊天核對先前結果。' : '上一則訊息結果尚未確認，已安全保存；重試不會建立重複訊息。'}</Text>}{!ready && <Pressable accessibilityRole="button" style={s.chip} onPress={() => void restore()}><Text style={s.text}>重試恢復</Text></Pressable>}<TextInput testID="商品聊天訊息" accessibilityLabel="商品聊天訊息" accessibilityState={{ disabled: inputDisabled }} placeholder="輸入訊息，預約前請確認商品狀態" value={text} onChangeText={setText} maxLength={2000} multiline editable={!inputDisabled} style={s.input} /><View style={s.row}><Pressable accessibilityRole="button" disabled={busy || !ready || !room || room.archived || (!pending && (!text.trim() || room.blocked))} style={s.button} onPress={() => void send()}><Text style={s.white}>{pending ? '重試相同訊息' : '傳送'}</Text></Pressable><Pressable accessibilityRole="button" style={s.chip} onPress={() => void refresh()}><Text style={s.text}>更新聊天</Text></Pressable>{busy && <ActivityIndicator />}</View></View>
    {showMeetup && room && !room.archived && <MeetupSheet key={room.id} api={api} apiUrl={apiUrl} userId={userId} room={room} onClose={() => { setShowMeetup(false); void refresh(); }} />}
  </KeyboardAvoidingView></View></Modal>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F8F7F3' }, flex: { flex: 1 }, header: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' }, heading: { fontSize: 26, color: '#173E36', fontWeight: '800' }, title: { fontSize: 18, fontWeight: '700', lineHeight: 25, color: '#173E36' }, text: { fontSize: 16, color: '#173E36', lineHeight: 24 }, small: { fontSize: 13, lineHeight: 20, color: '#596960' },
  list: { padding: 16, gap: 12 }, card: { padding: 18, borderRadius: 14, backgroundColor: '#FFFFFF', gap: 8 }, chip: { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#B4BDB4', justifyContent: 'center' }, button: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: '#173E36', justifyContent: 'center' }, white: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, error: { color: '#A52626', fontSize: 14, lineHeight: 22, padding: 12 }, notice: { padding: 12, color: '#596960', fontSize: 14, lineHeight: 22 }, bubble: { padding: 12, borderRadius: 14, maxWidth: '88%', gap: 8 }, mine: { alignSelf: 'flex-end', backgroundColor: '#DDEAE0' }, theirs: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF' }, composer: { padding: 12, gap: 10 }, input: { maxHeight: 130, minHeight: 52, borderWidth: 1, borderColor: '#B4BDB4', borderRadius: 12, padding: 12, backgroundColor: '#FFFFFF', fontSize: 16, color: '#173E36' }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
