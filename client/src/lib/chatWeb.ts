import { ChatDataError, messageBody, parseChatMessage, parseChatRoom, type ChatRoomRecord } from './chatData';
import { meetupRequest, parseMeetupResult, type MeetupRequest } from './meetupData';
import type { PendingStore } from './webPendingStore';
import { isUuid } from './listingBatch';
import { validateApiUrl } from './marketplaceUrl';
export type ChatApi = (path: string, init?: RequestInit) => Promise<unknown>;
export function parsePendingMessage(body: string) {
  const value = JSON.parse(body);
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.text !== 'string') throw new ChatDataError();
  const parsed = messageBody(value.clientMessageId, value.text);
  if (JSON.stringify(parsed) !== body || new TextDecoder().decode(new TextEncoder().encode(parsed.text)) !== parsed.text) throw new ChatDataError();
  return parsed;
}
export function privateChatPhotoId(room: ChatRoomRecord, apiUrl: string) {
  if (!room.listingAvailable || !room.listing.thumbnailUrl) return null;
  try {
    const root = new URL(validateApiUrl(apiUrl, import.meta.env.DEV)), image = new URL(room.listing.thumbnailUrl);
    const match = /^\/api\/listing-media\/([^/]+)\/thumbnail$/.exec(image.pathname);
    return image.origin === root.origin && !image.username && !image.password && !image.search && !image.hash && match && isUuid(match[1]) ? match[1] : null;
  } catch { return null; }
}
export async function clearAcknowledgedPending(store: PendingStore, key: string, body: string) {
  try { return await store.clear(key, body) || await store.get(key) === null; } catch { return false; }
}
export async function acknowledgeChatMessage(value: unknown, room: ChatRoomRecord, userId: number, store: PendingStore, key: string, body: string) {
  const request = parsePendingMessage(body), message = parseChatMessage(value, room);
  if (message.senderUserId !== userId || message.clientMessageId !== request.clientMessageId || message.text !== request.text) throw new ChatDataError('回執與原訊息不符，尚未確認送出。');
  return { message, pendingCleared: await clearAcknowledgedPending(store, key, body) };
}
export async function submitChatMessage(read: ChatApi, room: ChatRoomRecord, userId: number, store: PendingStore, key: string, body: string) {
  parsePendingMessage(body); if (room.archived || ![room.buyerUserId, room.sellerUserId].includes(userId)) throw new ChatDataError();
  await store.save(key, body);
  return acknowledgeChatMessage(await read(`/chat/conversations/${room.id}/messages`, { method: 'POST', body }), room, userId, store, key, body);
}
export async function lookupChatMessage(read: ChatApi, room: ChatRoomRecord, userId: number, store: PendingStore, key: string, body: string) {
  const request = parsePendingMessage(body);
  return acknowledgeChatMessage(await read(`/chat/conversations/${room.id}/messages/by-client-id/${request.clientMessageId}`), room, userId, store, key, body);
}
export async function openProductChat(read: ChatApi, listingId: string, ownerId: number, userId: number) {
  if (!isUuid(listingId) || ownerId === userId || !Number.isSafeInteger(ownerId) || ownerId < 1) throw new ChatDataError();
  // The server serializes this unique listing/buyer/seller tuple. Lost ACKs can
  // be retried explicitly without creating a second room or sending a message.
  const room = parseChatRoom(await read('/chat/conversations', { method: 'POST', body: JSON.stringify({ listingId }) }), userId);
  if (room.listingId !== listingId || room.buyerUserId !== userId || room.sellerUserId !== ownerId || room.archived) throw new ChatDataError();
  return room;
}
export async function submitMeetupAction(read: ChatApi, room: ChatRoomRecord, userId: number, store: PendingStore, key: string, body: string, abandon = false) {
  const request: MeetupRequest = meetupRequest(JSON.parse(body));
  if (JSON.stringify(request) !== body || room.archived || ![room.buyerUserId, room.sellerUserId].includes(userId)) throw new ChatDataError();
  await store.save(key, body);
  const result = parseMeetupResult(await read(`/chat/conversations/${room.id}/meetup${abandon ? '/abandon' : ''}`, { method: 'POST', body }), room, request, userId);
  return { ...result, pendingCleared: await clearAcknowledgedPending(store, key, body) };
}
export const meetupLabels = { PROPOSED: '提議中', CONFIRMED: '雙方已確認', CANCELLED: '已取消', COMPLETED: '雙方已回報完成' };
export const meetupActionLabels = { PROPOSE: '提出邀約', REVISE: '改期或修改地點', CONFIRM: '同意時間與地點', CANCEL: '取消預約', COMPLETE: '回報面交完成' };
export const taipeiTime = (value: string) => new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
export function taipeiInput(value: string) {
  if (!Number.isFinite(Date.parse(value))) throw new ChatDataError();
  return new Date(Date.parse(value) + 8 * 60 * 60000).toISOString().slice(0, 16);
}
export function fromTaipeiInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new ChatDataError('請選擇有效的台灣面交日期與時間。');
  const date = new Date(value + ':00+08:00');
  if (!Number.isFinite(date.valueOf()) || taipeiInput(date.toISOString()) !== value) throw new ChatDataError('請選擇有效的台灣面交日期與時間。');
  return date.toISOString();
}
