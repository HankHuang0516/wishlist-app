import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mergeMessages, messageBody, parseChatInbox, parseChatMessage, parseChatRoom, parseMessagePage, retainMemberMessages } from '../chatData';
const roomID = randomUUID(); const listingID = randomUUID();
const rawRoom = { id: roomID, listingId: listingID, buyerUserId: 1, sellerUserId: 2, lastMessageSequence: 10, lastReadSequence: 2, unreadCount: 3, blocked: false, blockedByMe: false, blockedByOther: false, listingAvailable: true, lastMessageAt: '2026-09-15T08:00:00.000Z',
  buyer: { id: 1, name: '合成買家' }, seller: { id: 2, name: '合成賣家' }, listing: { id: listingID, title: '合成相機', status: 'ACTIVE', expiresAt: '2026-10-15T15:59:59.999Z' } };
const room = () => parseChatRoom(rawRoom, 1);
const message = (sequence = 1) => ({ id: randomUUID(), conversationId: roomID, senderUserId: 2, clientMessageId: randomUUID(), sequence, text: '週六下午面交可以嗎？', createdAt: '2026-09-15T08:00:00.000Z' });
describe('private chat response boundaries', () => {
  it('only retains participant-safe fields and never profile credentials or exact appointment data', () => {
    const parsed = parseChatRoom({ ...rawRoom, buyer: { ...rawRoom.buyer, password: 'synthetic-only', email: 'private@example.com' }, participants: [], listing: { ...rawRoom.listing, latitude: 25.03456 }, meetup: { privateAddress: '合成私密地點' } }, 1);
    expect(parsed.buyer).toEqual({ id: 1, name: '合成買家' }); expect(parsed).not.toHaveProperty('meetup'); expect(parsed.listing).not.toHaveProperty('latitude'); expect(parsed).not.toHaveProperty('participants');
  });
  it('accepts either participant but rejects third-party room responses', () => { expect(parseChatRoom(rawRoom, 2).id).toBe(roomID); expect(() => parseChatRoom(rawRoom, 3)).toThrow(); });
  it.each([
    { id: 'invalid' }, { buyerUserId: 0 }, { sellerUserId: 1 }, { lastMessageSequence: -1 }, { lastReadSequence: 99 }, { unreadCount: 99 }, { blocked: true },
    { blockedByMe: 'true' }, { listingAvailable: 'true' }, { lastMessageAt: 'invalid' }, { buyer: { id: 3, name: null } }, { seller: { id: 2, name: 42 } }, { listing: null },
    { listing: { ...rawRoom.listing, id: randomUUID() } }, { listing: { ...rawRoom.listing, title: '' } }, { listing: { ...rawRoom.listing, status: 'PAYMENT' } },
  ])('rejects unsafe or inconsistent conversation state %j', change => expect(() => parseChatRoom({ ...rawRoom, ...change }, 1)).toThrow());
  it('distinguishes a block by the other participant from my own block', () => {
    expect(parseChatRoom({ ...rawRoom, blocked: true, blockedByOther: true }, 1)).toMatchObject({ blocked: true, blockedByMe: false, blockedByOther: true });
    expect(parseChatRoom({ ...rawRoom, seller: { id: 2, name: null }, listing: { ...rawRoom.listing, status: 'REMOVED', expiresAt: null }, listingAvailable: false }, 1).seller.name).toBeNull();
  });
  it.each([null, { items: null, nextCursor: null }, { items: Array(51).fill(rawRoom), nextCursor: null }, { items: [rawRoom, rawRoom], nextCursor: null }, { items: [], nextCursor: roomID }, { items: [rawRoom], nextCursor: randomUUID() }])('refuses malformed or oversized inbox pages %j', page => expect(() => parseChatInbox(page, 1)).toThrow());
  it('parses a member inbox with bounded progression', () => { expect(parseChatInbox({ items: [rawRoom], nextCursor: roomID }, 1).nextCursor).toBe(roomID); expect(parseChatInbox({ items: [], nextCursor: null }, 1).items).toEqual([]); });
  it('parses immutable messages without additional private fields', () => {
    const raw = message(); expect(parseChatMessage({ ...raw, privateGPS: 25.03456 }, room())).toEqual(raw);
  });
  it.each([{ id: 'invalid' }, { conversationId: randomUUID() }, { clientMessageId: 'invalid' }, { senderUserId: 3 }, { sequence: 0 }, { sequence: 1.5 }, { text: '' }, { text: 'x'.repeat(2001) }, { createdAt: 'invalid' }])('rejects cross-room, cross-sender and malformed messages %j', change => expect(() => parseChatMessage({ ...message(), ...change }, room())).toThrow());
});
describe('text bodies, history and reconnect pages', () => {
  it('uses a stable UUID and normalized text only', () => { const id = randomUUID(); expect(messageBody(id, '  商品👋\n詢問  ')).toEqual({ clientMessageId: id, text: '商品👋\n詢問' }); });
  it.each(['', ' \n ', 'x'.repeat(2001), 'test\u0000'])('rejects invalid outgoing messages', text => expect(() => messageBody(randomUUID(), text)).toThrow());
  it('rejects fake client UUIDs', () => expect(() => messageBody('invalid', 'hello')).toThrow());
  it('supports ascending history rows and directional anchors', () => {
    const first = message(1), second = message(2);
    expect(parseMessagePage({ items: [first, second], nextBeforeSequence: 1, nextAfterSequence: null }, room()).items.map(m => m.sequence)).toEqual([1, 2]);
    expect(parseMessagePage({ items: [first, second], nextBeforeSequence: null, nextAfterSequence: 2 }, room()).nextAfterSequence).toBe(2);
  });
  it.each([
    { items: [], nextBeforeSequence: 1, nextAfterSequence: null }, { items: [message(1)], nextBeforeSequence: 2, nextAfterSequence: null },
    { items: [message(1)], nextBeforeSequence: null, nextAfterSequence: 2 }, { items: [message(2), message(1)], nextBeforeSequence: null, nextAfterSequence: null },
    { items: [message(1), message(1)], nextBeforeSequence: null, nextAfterSequence: null }, { items: [], nextBeforeSequence: 0, nextAfterSequence: null },
    { items: [], nextBeforeSequence: 1, nextAfterSequence: 2 }, { items: [], nextBeforeSequence: null },
  ])('rejects duplicate, reverse or contradictory message page anchors %j', page => expect(() => parseMessagePage(page, room())).toThrow());
  it('deduplicates immutable overlap, sorts by server sequence and rejects collisions', () => {
    const first = parseChatMessage(message(1), room()), second = parseChatMessage(message(2), room());
    expect(mergeMessages([second], [first, second])).toEqual([first, second]);
    expect(() => mergeMessages([first], [{ ...first, text: 'changed' }])).toThrow(); expect(() => mergeMessages([first], [{ ...second, sequence: 1 }])).toThrow();
  });
});
describe('erased-account and removed-listing archives', () => {
  const erased = () => ({ ...rawRoom, archived: true, listingId: null, listing: null, sellerUserId: null, seller: null, listingAvailable: false, unreadCount: 0 });
  it('keeps a surviving participant without recreating the erased identity or listing', () => {
    const parsed = parseChatRoom(erased(), 1);
    expect(parsed).toMatchObject({ archived: true, listingId: null, sellerUserId: null, seller: { id: null, name: null }, listingAvailable: false });
    expect(parsed.listing.title).toBe('已封存的商品聊天');
    expect(() => parseChatRoom(erased(), 2)).toThrow();
    expect(() => parseChatRoom(erased(), 3)).toThrow();
  });
  it('also handles deleting a buyer instead of a seller', () => {
    expect(parseChatRoom({ ...erased(), buyerUserId: null, buyer: null, sellerUserId: 2, seller: rawRoom.seller }, 2).buyer.id).toBeNull();
  });
  it.each([{ archived: false }, { archived: 'true' }, { listingAvailable: true }, { seller: rawRoom.seller }, { buyerUserId: null, buyer: null }, { listingId: listingID }])('rejects inconsistent archive metadata %j', change => expect(() => parseChatRoom({ ...erased(), ...change }, 1)).toThrow());
  it('retains only surviving members in memory and rejects deleted or null senders', () => {
    const parsed = parseChatRoom(erased(), 1), own = { ...message(), senderUserId: 1 }, deleted = message(2);
    expect(parseChatMessage(own, parsed)).toEqual(own);
    expect(() => parseChatMessage(deleted, parsed)).toThrow();
    expect(() => parseChatMessage({ ...own, senderUserId: null }, parsed)).toThrow();
    expect(retainMemberMessages([own, deleted, { ...own, conversationId: randomUUID() }], parsed)).toEqual([own]);
  });
  it('can archive a removed listing while both participants still exist', () => {
    expect(parseChatRoom({ ...rawRoom, archived: true, listingId: null, listing: null, listingAvailable: false }, 1).seller.id).toBe(2);
  });
});
