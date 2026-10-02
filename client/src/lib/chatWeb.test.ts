import { describe, expect, it, vi } from 'vitest';
import { makeRoom, makeMessage, makeMeetup } from '../__tests__/fixtures/chat';
import { acknowledgeChatMessage, fromTaipeiInput, lookupChatMessage, lookupMeetupAction, meetupRequestHash, openProductChat, parsePendingMessage, privateChatPhotoId, submitChatMessage, submitMeetupAction, taipeiInput } from './chatWeb';
import type { MeetupRequest } from './meetupData';
import { createHash } from 'node:crypto';
import { ApiFailure } from './marketplaceApi';
const fixture = () => {
  const data = new Map<string, string>(); return { data, store: { get: vi.fn(async (key: string) => data.get(key) ?? null), save: vi.fn(async (key: string, body: string) => { if (data.has(key) && data.get(key) !== body) throw new Error('conflict'); data.set(key, body); }), clear: vi.fn(async (key: string, body: string) => { if (data.get(key) !== body) return false; data.delete(key); return true; }) } };
};
describe('stable chat and meetup delivery', () => {
  it('durably saves the exact normalized message before POST and validates identity', async () => {
    const { store, data } = fixture(), message = makeMessage(), body = JSON.stringify({ clientMessageId: message.clientMessageId, text: message.text });
    const read = vi.fn(async (_: string, init?: RequestInit) => { expect(data.get('key')).toBe(body); expect(init?.body).toBe(body); return message; });
    expect(await submitChatMessage(read, makeRoom(), 42, store, 'key', body)).toMatchObject({ message, pendingCleared: true }); expect(data.has('key')).toBe(false);
  });
  it('retains a lost ACK, refuses a second body and recovers the first with GET only', async () => {
    const { store, data } = fixture(), message = makeMessage(), body = JSON.stringify({ clientMessageId: message.clientMessageId, text: message.text });
    await expect(submitChatMessage(vi.fn().mockRejectedValue(new Error('lost ACK')), makeRoom(), 42, store, 'key', body)).rejects.toThrow(); expect(data.get('key')).toBe(body);
    const different = JSON.stringify({ clientMessageId: crypto.randomUUID(), text: 'different' }), blocked = vi.fn();
    await expect(submitChatMessage(blocked, makeRoom(), 42, store, 'key', different)).rejects.toThrow(); expect(blocked).not.toHaveBeenCalled();
    const read = vi.fn(async () => message); expect(await lookupChatMessage(read, makeRoom(), 42, store, 'key', body)).toMatchObject({ pendingCleared: true }); expect(read.mock.calls).toEqual([[`/chat/conversations/${message.conversationId}/messages/by-client-id/${message.clientMessageId}`]]);
  });
  it.each(['senderUserId', 'clientMessageId', 'text', 'conversationId'])('does not clear on wrong message %s', async field => {
    const { store, data } = fixture(), message = makeMessage(), body = JSON.stringify({ clientMessageId: message.clientMessageId, text: message.text }); data.set('key', body);
    const wrong = { ...message, [field]: field === 'senderUserId' ? 43 : field === 'text' ? 'different' : crypto.randomUUID() };
    await expect(acknowledgeChatMessage(wrong, makeRoom(), 42, store, 'key', body)).rejects.toThrow(); expect(data.get('key')).toBe(body);
  });
  it('preserves a proven message ACK when local cleanup fails without clearing newer data', async () => {
    const { store, data } = fixture(), message = makeMessage(), body = JSON.stringify({ clientMessageId: message.clientMessageId, text: message.text }); data.set('key', body); store.clear.mockRejectedValueOnce(new Error('storage'));
    expect(await acknowledgeChatMessage(message, makeRoom(), 42, store, 'key', body)).toMatchObject({ message, pendingCleared: false }); expect(data.get('key')).toBe(body);
    data.set('key', 'newer'); expect(await acknowledgeChatMessage(message, makeRoom(), 42, store, 'key', body)).toMatchObject({ pendingCleared: false }); expect(data.get('key')).toBe('newer');
  });
  it.each([401, 403, 404, 409, 500])('does not regard lookup %i as delivery or cancellation', async status => {
    const { store, data } = fixture(), message = makeMessage(), body = JSON.stringify({ clientMessageId: message.clientMessageId, text: message.text }); data.set('key', body);
    await expect(lookupChatMessage(vi.fn().mockRejectedValue(new ApiFailure('fixture', status)), makeRoom(), 42, store, 'key', body)).rejects.toThrow(); expect(data.get('key')).toBe(body);
  });
  it.each(['{}', '{bad', JSON.stringify({ clientMessageId: crypto.randomUUID(), text: ' text ' }), JSON.stringify({ clientMessageId: crypto.randomUUID(), text: 'x', isAdmin: true }), JSON.stringify({ clientMessageId: crypto.randomUUID(), text: '\ud800' })])('rejects corrupt/noncanonical pending data %#', body => expect(() => parsePendingMessage(body)).toThrow());
  it('refuses archived sends and persists nothing when secure storage fails', async () => {
    const { store } = fixture(), read = vi.fn(), body = JSON.stringify({ clientMessageId: crypto.randomUUID(), text: 'fixture' });
    await expect(submitChatMessage(read, makeRoom({ archived: true }), 42, store, 'key', body)).rejects.toThrow(); expect(store.save).not.toHaveBeenCalled();
    store.save.mockRejectedValueOnce(new Error('disk')); await expect(submitChatMessage(read, makeRoom(), 42, store, 'key', body)).rejects.toThrow(); expect(read).not.toHaveBeenCalled();
  });
  it('checks the unique room is for this exact seller/product/buyer before navigating', async () => {
    const room = makeRoom(), read = vi.fn(async () => room); expect(await openProductChat(read, room.listingId!, 43, 42)).toEqual(room);
    expect(read.mock.calls[0]).toEqual(['/chat/conversations', { method: 'POST', body: JSON.stringify({ listingId: room.listingId }) }]);
    await expect(openProductChat(vi.fn(async () => makeRoom({ sellerUserId: 44, seller: { id: 44, name: null } })), room.listingId!, 43, 42)).rejects.toThrow();
    const self = vi.fn(); await expect(openProductChat(self, room.listingId!, 42, 42)).rejects.toThrow(); expect(self).not.toHaveBeenCalled();
  });
  it('binds private room thumbnails to exact trusted API paths, never third-party bearer requests', () => {
    const room = makeRoom(), id = crypto.randomUUID(), url = `https://example.com/api/listing-media/${id}/thumbnail`;
    expect(privateChatPhotoId({ ...room, listing: { ...room.listing, thumbnailUrl: url } }, 'https://example.com/api')).toBe(id);
    for (const bad of [url.replace('example.com', 'evil.example.com'), url + '?token=unsafe', url + '#x', url.replace('/thumbnail', '/image'), url.replace('https://', 'https://user:pass@'), url.replace('/api/', '/other/')]) expect(privateChatPhotoId({ ...room, listing: { ...room.listing, thumbnailUrl: bad } }, 'https://example.com')).toBeNull();
    expect(privateChatPhotoId({ ...room, listingAvailable: false, listing: { ...room.listing, thumbnailUrl: url } }, 'https://example.com')).toBeNull();
  });
  it('delivers only the original meetup ID/version, and distinguishes an abandonment from cancellation', async () => {
    const { store, data } = fixture(), req = { clientActionId: crypto.randomUUID(), action: 'CONFIRM', expectedVersion: 1 }, body = JSON.stringify(req), room = makeRoom();
    const result = { replayed: true, receipt: { ...req, actorUserId: 42, conversationId: room.id, resultingVersion: 0, abandoned: true }, appointment: makeMeetup() };
    const read = vi.fn(async (_: string, init?: RequestInit) => { expect(data.get('key')).toBe(body); expect(init?.body).toBe(body); return result; });
    expect(await submitMeetupAction(read, room, 42, store, 'key', body, true)).toMatchObject({ abandoned: true, acknowledgedVersion: null, appointment: { status: 'PROPOSED' }, pendingCleared: true }); expect(read.mock.calls[0][0]).toBe(`/chat/conversations/${room.id}/meetup/abandon`);
  });
});
describe('explicit Taiwan date/time independent of browser timezone', () => {
  it('maps UTC and Taiwan midnight correctly', () => { expect(fromTaipeiInput('2026-10-02T00:15')).toBe('2026-10-01T16:15:00.000Z'); expect(taipeiInput('2026-10-01T16:15:00.000Z')).toBe('2026-10-02T00:15'); });
  it.each(['2026-02-30T14:00', '2026-13-01T14:00', '2026-10-02T25:00', '2026-10-02', '', '2026-10-02T14:00Z'])('rejects normalized/invalid date %s', value => expect(() => fromTaipeiInput(value)).toThrow());
});
describe('read-only original meetup receipts', () => {
  const request = (): MeetupRequest => ({ clientActionId: crypto.randomUUID(), action: 'CONFIRM', expectedVersion: 1 });
  const receipt = async (req: MeetupRequest) => ({ replayed: true, appointment: makeMeetup(), receipt: { conversationId: makeRoom().id, actorUserId: 42, clientActionId: req.clientActionId, action: req.action, requestHash: await meetupRequestHash(req), resultingVersion: 1, abandoned: false } });
  it('matches the server normalized proposal hash for derived end time, trimmed Unicode and absent coordinates', async () => {
    const req: MeetupRequest = { clientActionId: crypto.randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: { startsAt: '2099-10-02T06:00:00.000Z', durationMinutes: 60, timeZone: 'Asia/Taipei', placeName: ' 合成站 ', notes: ' 備註 ' } };
    const serverCanonical = '{"action":"PROPOSE","expectedVersion":0,"terms":{"startsAt":"2099-10-02T06:00:00.000Z","endsAt":"2099-10-02T07:00:00.000Z","timeZone":"Asia/Taipei","placeName":"合成站","latitude":null,"longitude":null,"notes":"備註"}}';
    expect(await meetupRequestHash(req)).toBe(createHash('sha256').update(serverCanonical).digest('hex'));
  });
  it('only GETs the actor receipt, without sending private terms or replaying a write', async () => {
    const { store, data } = fixture(), req = request(), body = JSON.stringify(req); data.set('key', body);
    const value = await receipt(req), read = vi.fn(async () => value);
    expect(await lookupMeetupAction(read, makeRoom(), 42, store, 'key', body)).toMatchObject({ acknowledgedVersion: 1, pendingCleared: true });
    expect(read.mock.calls).toEqual([[`/chat/conversations/${makeRoom().id}/meetup/operations/${req.clientActionId}?requestHash=${value.receipt.requestHash}`]]);
    expect(store.save).not.toHaveBeenCalled();
  });
  it.each(['requestHash', 'actorUserId', 'clientActionId', 'conversationId', 'action', 'resultingVersion'])('retains original consent when receipt %s is wrong', async field => {
    const { store, data } = fixture(), req = request(), body = JSON.stringify(req); data.set('key', body);
    const value = await receipt(req), wrong = { ...value, receipt: { ...value.receipt, [field]: field === 'actorUserId' ? 43 : field === 'resultingVersion' ? 2 : 'wrong' } };
    await expect(lookupMeetupAction(vi.fn(async () => wrong), makeRoom(), 42, store, 'key', body)).rejects.toThrow();
    expect(data.get('key')).toBe(body); expect(store.clear).not.toHaveBeenCalled();
  });
  it.each([401, 404, 409, 429, 500])('does not infer cancellation from receipt lookup %i', async status => {
    const { store, data } = fixture(), req = request(), body = JSON.stringify(req); data.set('key', body);
    await expect(lookupMeetupAction(vi.fn().mockRejectedValue(new ApiFailure('synthetic', status)), makeRoom(), 42, store, 'key', body)).rejects.toThrow();
    expect(data.get('key')).toBe(body); expect(store.save).not.toHaveBeenCalled(); expect(store.clear).not.toHaveBeenCalled();
  });
  it('rejects a different local winner before dispatch and keeps a newer winner after a valid late receipt', async () => {
    const { store, data } = fixture(), req = request(), body = JSON.stringify(req), read = vi.fn(); data.set('key', 'newer');
    await expect(lookupMeetupAction(read, makeRoom(), 42, store, 'key', body)).rejects.toThrow(); expect(read).not.toHaveBeenCalled();
    data.set('key', body); const value = await receipt(req);
    expect(await lookupMeetupAction(async () => { data.set('key', 'newer'); return value; }, makeRoom(), 42, store, 'key', body)).toMatchObject({ pendingCleared: false });
    expect(data.get('key')).toBe('newer');
  });
  it('reads a durable abandoned operation while leaving the current appointment unchanged', async () => {
    const { store, data } = fixture(), req = request(), body = JSON.stringify(req); data.set('key', body); const value = await receipt(req);
    const result = await lookupMeetupAction(async () => ({ ...value, receipt: { ...value.receipt, resultingVersion: 0, abandoned: true } }), makeRoom(), 42, store, 'key', body);
    expect(result).toMatchObject({ abandoned: true, acknowledgedVersion: null, pendingCleared: true, appointment: { status: 'PROPOSED' } });
  });
});
