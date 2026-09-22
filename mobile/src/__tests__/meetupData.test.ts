import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ChatRoomRecord } from '../chatData';
import { MeetupRequest, meetupRequest, parseMeetup, parseMeetupResult } from '../meetupData';
const room = { id: randomUUID(), buyerUserId: 1, sellerUserId: 2 } as ChatRoomRecord;
const date = '2026-10-01T06:00:00.000Z';
const appointment = () => ({ id: randomUUID(), conversationId: room.id, version: 1, status: 'PROPOSED', proposedByUserId: 1, startsAt: date, endsAt: '2026-10-01T07:00:00.000Z', timeZone: 'Asia/Taipei', placeName: '車站', notes: '', latitude: null, longitude: null, buyerConfirmedAt: date, sellerConfirmedAt: null, buyerCompletedAt: null, sellerCompletedAt: null, createdAt: date, updatedAt: date });
const terms = () => ({ startsAt: date, durationMinutes: 60, timeZone: 'Asia/Taipei', placeName: ' 車站 ', notes: '' });
const request = (): MeetupRequest => ({ clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: { ...terms(), timeZone: 'Asia/Taipei', placeName: '車站' } });
describe('native private meetup protocol', () => {
  it('parses nullable appointment and strips arbitrary private API properties', () => { expect(parseMeetup(null, room)).toBeNull(); const p = parseMeetup({ ...appointment(), password: 'must-drop' }, room); expect(p?.version).toBe(1); expect(p).not.toHaveProperty('password'); });
  it.each([{ id: 'bad' }, { conversationId: randomUUID() }, { version: 0 }, { version: 1.5 }, { proposedByUserId: 3 }, { status: 'PAID' }, { startsAt: 'bad' }, { startsAt: '2026-02-30T06:00:00.000Z' }, { endsAt: date }, { endsAt: '2026-10-01T11:00:00.000Z' }, { timeZone: 'UTC' }, { latitude: 25, longitude: null }, { latitude: 19, longitude: 121 }, { latitude: NaN, longitude: 121 }, { placeName: '' }, { notes: 'x'.repeat(1001) }, { buyerConfirmedAt: 'bad' }, { createdAt: 'bad' }, { status: 'CONFIRMED' }, { status: 'COMPLETED', sellerConfirmedAt: date }])('rejects invalid or unsafe member projection %p', override => expect(() => parseMeetup({ ...appointment(), ...override }, room)).toThrow());
  it('accepts both parties confirmed and both completed only with consistent dates', () => { expect(parseMeetup({ ...appointment(), status: 'COMPLETED', sellerConfirmedAt: date, buyerCompletedAt: date, sellerCompletedAt: date }, room)?.status).toBe('COMPLETED'); });
  it('keeps a fixed canonical request for encrypted storage and retries', () => { const b = meetupRequest({ ...request(), terms: terms() }); expect(b.terms?.placeName).toBe('車站'); expect(meetupRequest(JSON.parse(JSON.stringify(b)))).toEqual(b); });
  it.each([{}, null, [], { actorUserId: 1 }, { expectedVersion: 1 }, { action: 'PAY' }, { clientActionId: 'bad' }, { expectedVersion: -1 }, { expectedVersion: 2147483647 }])('rejects bad request or spoofed fields %p', override => expect(() => meetupRequest(override === null || Array.isArray(override) || Object.keys(override).length === 0 ? override : { ...request(), ...override })).toThrow());
  it.each([{ startsAt: 'bad' }, { durationMinutes: 14 }, { durationMinutes: 241 }, { durationMinutes: '60' }, { durationMinutes: 60.1 }, { placeName: '' }, { timeZone: 'UTC' }, { latitude: 25 }, { latitude: null, longitude: null }, { latitude: 25, longitude: 125 }, { latitude: 25, longitude: NaN }, { notes: '\u0000' }, { confirmedBy: 2 }])('rejects invalid terms %p', override => expect(() => meetupRequest({ ...request(), terms: { ...terms(), ...override } })).toThrow());
  it.each(['CONFIRM', 'CANCEL', 'COMPLETE'])('cannot smuggle changed terms into %s', action => { expect(() => meetupRequest({ ...request(), action, expectedVersion: 1 })).toThrow(); expect(meetupRequest({ clientActionId: randomUUID(), action, expectedVersion: 1 }).action).toBe(action); });
  it('validates an ACK independently of newer current terms; does not fake latest-version consent', () => {
    const req = request(); const result = { appointment: { ...appointment(), version: 2 }, replayed: true, receipt: { conversationId: room.id, actorUserId: 1, clientActionId: req.clientActionId, action: 'PROPOSE', resultingVersion: 1, abandoned: false } };
    expect(parseMeetupResult(result, room, req, 1)).toMatchObject({ appointment: { version: 2 }, acknowledgedVersion: 1 });
    for (const override of [{ actorUserId: 2 }, { conversationId: randomUUID() }, { clientActionId: randomUUID() }, { resultingVersion: 3 }, { action: 'CANCEL' }]) expect(() => parseMeetupResult({ ...result, receipt: { ...result.receipt, ...override } }, room, req, 1)).toThrow();
  });
  it('accepts a durable abandonment even with no appointment, but never treats it as consent', () => {
    const req = request(); const result = { appointment: null, replayed: false, receipt: { conversationId: room.id, actorUserId: 1, clientActionId: req.clientActionId, action: 'PROPOSE', resultingVersion: 0, abandoned: true } };
    expect(parseMeetupResult(result, room, req, 1)).toMatchObject({ appointment: null, abandoned: true, acknowledgedVersion: null });
    expect(() => parseMeetupResult({ ...result, receipt: { ...result.receipt, resultingVersion: 1 } }, room, req, 1)).toThrow();
    expect(() => parseMeetupResult({ ...result, receipt: { ...result.receipt, abandoned: false } }, room, req, 1)).toThrow();
  });
});
