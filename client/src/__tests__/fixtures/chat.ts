import type { ChatRoomRecord, ChatMessage } from '../../lib/chatData';
import type { MeetupRecord } from '../../lib/meetupData';
export const roomId = '11111111-1111-4111-8111-111111111111', productId = '22222222-2222-4222-8222-222222222222';
export function makeRoom(overrides: Partial<ChatRoomRecord> = {}): ChatRoomRecord {
  return { id: roomId, listingId: productId, buyerUserId: 42, sellerUserId: 43, archived: false, lastMessageSequence: 0, lastReadSequence: 0, unreadCount: 0, blocked: false, blockedByMe: false, blockedByOther: false, listingAvailable: true,
    lastMessageAt: '2026-10-01T00:00:00.000Z', lastMessageText: null, buyer: { id: 42, name: '合成買家' }, seller: { id: 43, name: '合成賣家' },
    listing: { id: productId, title: '合成測試漫畫（非販售）', status: 'ACTIVE', expiresAt: '2100-01-01T00:00:00.000Z', price: 59, currency: 'TWD', thumbnailUrl: null }, ...overrides };
}
export function makeMessage(sequence = 1, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: crypto.randomUUID(), conversationId: roomId, senderUserId: 42, clientMessageId: crypto.randomUUID(), sequence, text: '合成測試訊息', createdAt: '2026-10-01T00:00:00.000Z', ...overrides };
}
export function makeMeetup(overrides: Partial<MeetupRecord> = {}): MeetupRecord {
  return { id: '33333333-3333-4333-8333-333333333333', conversationId: roomId, version: 1, status: 'PROPOSED', proposedByUserId: 43, startsAt: '2099-10-02T06:00:00.000Z', endsAt: '2099-10-02T07:00:00.000Z', timeZone: 'Asia/Taipei', placeName: '合成測試車站出口', notes: '', latitude: null, longitude: null, buyerConfirmedAt: null, sellerConfirmedAt: '2026-10-01T00:00:00.000Z', buyerCompletedAt: null, sellerCompletedAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...overrides };
}
