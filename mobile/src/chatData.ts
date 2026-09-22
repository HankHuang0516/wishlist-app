import { uuid } from './listingForm';
export class ChatDataError extends Error { constructor(message = '聊天資料回應不正確') { super(message); } }
export type ChatRoomRecord = { id: string; listingId: string | null; buyerUserId: number | null; sellerUserId: number | null; archived: boolean; lastMessageSequence: number; lastReadSequence: number; unreadCount: number; blocked: boolean; blockedByMe: boolean; blockedByOther: boolean; listingAvailable: boolean; lastMessageAt: string;
  buyer: { id: number | null; name: string | null }; seller: { id: number | null; name: string | null }; listing: { id: string | null; title: string; status: string; expiresAt: string | null } };
export type ChatMessage = { id: string; conversationId: string; senderUserId: number; clientMessageId: string; sequence: number; text: string; createdAt: string };
const record = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChatDataError(); return v as Record<string, unknown>; };
const seq = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
function profile(v: unknown, expected: number | null) { if (expected === null) { if (v !== null) throw new ChatDataError(); return { id: null, name: null }; } const p = record(v); if (p.id !== expected || !(p.name === null || (typeof p.name === 'string' && p.name.length <= 100))) throw new ChatDataError(); return { id: expected, name: p.name as string | null }; }
export function parseChatRoom(v: unknown, currentUserId: number): ChatRoomRecord {
  const r = record(v); const archived = r.archived === true;
  if (r.archived !== undefined && typeof r.archived !== 'boolean') throw new ChatDataError();
  const identity = (id: unknown): id is number | null => (archived && id === null) || (seq(id) && id > 0);
  const listing = archived && r.listing === null && r.listingId === null ? { id: null, title: '已封存的商品聊天', status: 'REMOVED', expiresAt: null } : record(r.listing);
  if (!uuid(r.id) || !(uuid(r.listingId) || (archived && r.listingId === null)) || !identity(r.buyerUserId) || !identity(r.sellerUserId) || r.buyerUserId === r.sellerUserId || ![r.buyerUserId, r.sellerUserId].includes(currentUserId) ||
      !seq(r.lastMessageSequence) || !seq(r.lastReadSequence) || r.lastReadSequence > r.lastMessageSequence || !seq(r.unreadCount) || r.unreadCount > r.lastMessageSequence || typeof r.blocked !== 'boolean' || typeof r.blockedByMe !== 'boolean' || typeof r.blockedByOther !== 'boolean' || r.blocked !== (r.blockedByMe || r.blockedByOther) || typeof r.listingAvailable !== 'boolean' || !date(r.lastMessageAt) ||
      (archived && r.listingAvailable) || listing.id !== r.listingId || !text(listing.title, 100) || !['DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'RESERVED', 'SOLD', 'REMOVED', 'EXPIRED'].includes(listing.status as string) || !(listing.expiresAt === null || date(listing.expiresAt))) throw new ChatDataError();
  return { id: r.id, listingId: r.listingId, buyerUserId: r.buyerUserId, sellerUserId: r.sellerUserId, archived, lastMessageSequence: r.lastMessageSequence, lastReadSequence: r.lastReadSequence, unreadCount: r.unreadCount, blocked: r.blocked, blockedByMe: r.blockedByMe, blockedByOther: r.blockedByOther, listingAvailable: r.listingAvailable, lastMessageAt: r.lastMessageAt,
    buyer: profile(r.buyer, r.buyerUserId), seller: profile(r.seller, r.sellerUserId), listing: { id: listing.id as string | null, title: listing.title, status: listing.status as string, expiresAt: listing.expiresAt as string | null } };
}
export function parseChatInbox(v: unknown, userId: number) {
  const page = record(v); if (!Array.isArray(page.items) || page.items.length > 50 || !(page.nextCursor === null || uuid(page.nextCursor))) throw new ChatDataError();
  const items = page.items.map(v => parseChatRoom(v, userId));
  if (new Set(items.map(r => r.id)).size !== items.length || (page.nextCursor && page.nextCursor !== items.at(-1)?.id)) throw new ChatDataError();
  return { items, nextCursor: page.nextCursor as string | null };
}
export function messageBody(clientMessageId: string, value: string) {
  const text = value.trim(); if (!uuid(clientMessageId) || !text || text.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new ChatDataError('請輸入1至2000字訊息，不含無效控制字元');
  return { clientMessageId, text };
}
export function parseChatMessage(v: unknown, room: ChatRoomRecord): ChatMessage {
  const r = record(v);
  if (!uuid(r.id) || r.conversationId !== room.id || !uuid(r.clientMessageId) || !seq(r.senderUserId) || r.senderUserId < 1 || ![room.buyerUserId, room.sellerUserId].includes(r.senderUserId) || !seq(r.sequence) || r.sequence < 1 || !text(r.text, 2000) || !date(r.createdAt)) throw new ChatDataError();
  return { id: r.id, conversationId: room.id, senderUserId: r.senderUserId as number, clientMessageId: r.clientMessageId, sequence: r.sequence, text: r.text, createdAt: r.createdAt };
}
export function retainMemberMessages(messages: ChatMessage[], room: ChatRoomRecord) {
  return messages.filter(message => message.conversationId === room.id && [room.buyerUserId, room.sellerUserId].includes(message.senderUserId));
}
export function parseMessagePage(v: unknown, room: ChatRoomRecord) {
  const page = record(v); if (!Array.isArray(page.items) || page.items.length > 50 || ![page.nextBeforeSequence, page.nextAfterSequence].every(v => v === null || (seq(v) && v > 0)) || (page.nextBeforeSequence !== null && page.nextAfterSequence !== null)) throw new ChatDataError();
  const items = page.items.map(v => parseChatMessage(v, room));
  if (items.some((m, index) => index > 0 && m.sequence <= items[index - 1].sequence) || new Set(items.map(m => m.id)).size !== items.length ||
      (page.nextBeforeSequence !== null && page.nextBeforeSequence !== items[0]?.sequence) || (page.nextAfterSequence !== null && page.nextAfterSequence !== items.at(-1)?.sequence)) throw new ChatDataError();
  return { items, nextBeforeSequence: page.nextBeforeSequence as number | null, nextAfterSequence: page.nextAfterSequence as number | null };
}
export function mergeMessages(previous: ChatMessage[], next: ChatMessage[]) {
  const byID = new Map(previous.map(m => [m.id, m]));
  for (const m of next) { const existing = byID.get(m.id); if (existing && JSON.stringify(existing) !== JSON.stringify(m)) throw new ChatDataError(); byID.set(m.id, m); }
  const rows = [...byID.values()].sort((a, b) => a.sequence - b.sequence);
  if (rows.some((m, index) => index > 0 && m.sequence === rows[index - 1].sequence)) throw new ChatDataError(); return rows;
}
