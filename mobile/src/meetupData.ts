import { uuid } from './listingForm';
import { ChatRoomRecord } from './chatData';
export class MeetupDataError extends Error { constructor(message = '面交預約資料不正確') { super(message); } }
export type MeetupAction = 'PROPOSE' | 'REVISE' | 'CONFIRM' | 'CANCEL' | 'COMPLETE';
export type MeetupTerms = { startsAt: string; durationMinutes: number; timeZone: 'Asia/Taipei'; placeName: string; notes: string; latitude?: number; longitude?: number };
export type MeetupRequest = { clientActionId: string; action: MeetupAction; expectedVersion: number; terms?: MeetupTerms };
export type MeetupRecord = { id: string; conversationId: string; version: number; status: 'PROPOSED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'; proposedByUserId: number; startsAt: string; endsAt: string; timeZone: 'Asia/Taipei'; placeName: string; notes: string; latitude: number | null; longitude: number | null; buyerConfirmedAt: string | null; sellerConfirmedAt: string | null; buyerCompletedAt: string | null; sellerCompletedAt: string | null; createdAt: string; updatedAt: string };
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new MeetupDataError(); return v as Record<string, unknown>; };
const version = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 2147483647;
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const nullableDate = (v: unknown) => v === null || date(v);
const text = (v: unknown, max: number, optional = false): v is string => typeof v === 'string' && (optional || !!v.trim()) && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const coords = (lat: unknown, lng: unknown) => (lat === null && lng === null) || (typeof lat === 'number' && Number.isFinite(lat) && lat >= 20 && lat <= 26.6 && typeof lng === 'number' && Number.isFinite(lng) && lng >= 117 && lng <= 123.8);
export function parseMeetup(v: unknown, room: ChatRoomRecord): MeetupRecord | null {
  if (v === null) return null;
  const r = object(v);
  if (!uuid(r.id) || r.conversationId !== room.id || !version(r.version) || !['PROPOSED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'].includes(r.status as string) || ![room.buyerUserId, room.sellerUserId].includes(r.proposedByUserId as number) || !date(r.startsAt) || !date(r.endsAt) || Date.parse(r.endsAt) - Date.parse(r.startsAt) < 15 * 60000 || Date.parse(r.endsAt) - Date.parse(r.startsAt) > 240 * 60000 || r.timeZone !== 'Asia/Taipei' || !text(r.placeName, 160) || !text(r.notes, 1000, true) || !coords(r.latitude, r.longitude) || ![r.buyerConfirmedAt, r.sellerConfirmedAt, r.buyerCompletedAt, r.sellerCompletedAt].every(nullableDate) || !date(r.createdAt) || !date(r.updatedAt) ||
      (['CONFIRMED', 'COMPLETED'].includes(r.status as string) && (!r.buyerConfirmedAt || !r.sellerConfirmedAt)) || (r.status === 'COMPLETED' && (!r.buyerCompletedAt || !r.sellerCompletedAt))) throw new MeetupDataError();
  // Explicit member-only projection; never spread arbitrary API properties.
  return { id: r.id, conversationId: room.id, version: r.version, status: r.status as MeetupRecord['status'], proposedByUserId: r.proposedByUserId as number, startsAt: r.startsAt, endsAt: r.endsAt, timeZone: 'Asia/Taipei', placeName: r.placeName, notes: r.notes, latitude: r.latitude as number | null, longitude: r.longitude as number | null,
    buyerConfirmedAt: r.buyerConfirmedAt as string | null, sellerConfirmedAt: r.sellerConfirmedAt as string | null, buyerCompletedAt: r.buyerCompletedAt as string | null, sellerCompletedAt: r.sellerCompletedAt as string | null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}
export function meetupRequest(input: unknown): MeetupRequest {
  const b = object(input);
  if (Object.keys(b).some(k => !['clientActionId', 'action', 'expectedVersion', 'terms'].includes(k)) || !uuid(b.clientActionId) || !['PROPOSE', 'REVISE', 'CONFIRM', 'CANCEL', 'COMPLETE'].includes(b.action as string) || typeof b.expectedVersion !== 'number' || !Number.isSafeInteger(b.expectedVersion) || b.expectedVersion < 0 || b.expectedVersion > 2147483646 || (b.action === 'PROPOSE' ? b.expectedVersion !== 0 : b.expectedVersion === 0)) throw new MeetupDataError();
  let terms: MeetupTerms | undefined;
  if (b.action === 'PROPOSE' || b.action === 'REVISE') {
    const t = object(b.terms);
    if (Object.keys(t).some(k => !['startsAt', 'durationMinutes', 'timeZone', 'placeName', 'notes', 'latitude', 'longitude'].includes(k)) || !date(t.startsAt) || typeof t.durationMinutes !== 'number' || !Number.isInteger(t.durationMinutes) || t.durationMinutes < 15 || t.durationMinutes > 240 || t.timeZone !== 'Asia/Taipei' || !text(t.placeName, 160) || !text(t.notes, 1000, true) || !coords(t.latitude ?? null, t.longitude ?? null) || ((t.latitude === undefined) !== (t.longitude === undefined)) || t.latitude === null || t.longitude === null) throw new MeetupDataError('請填寫有效時間、地點與完整的選填座標');
    terms = { startsAt: t.startsAt, durationMinutes: t.durationMinutes, timeZone: 'Asia/Taipei', placeName: t.placeName.trim(), notes: t.notes.trim(), ...(t.latitude !== undefined ? { latitude: t.latitude as number, longitude: t.longitude as number } : {}) };
  } else if (b.terms !== undefined) throw new MeetupDataError();
  return { clientActionId: b.clientActionId, action: b.action as MeetupAction, expectedVersion: b.expectedVersion, ...(terms ? { terms } : {}) };
}
export function parseMeetupResult(v: unknown, room: ChatRoomRecord, request: MeetupRequest, userId: number) {
  const r = object(v), receipt = object(r.receipt), appointment = parseMeetup(r.appointment, room);
  if (typeof r.replayed !== 'boolean' || typeof receipt.abandoned !== 'boolean' || receipt.conversationId !== room.id || receipt.actorUserId !== userId || receipt.clientActionId !== request.clientActionId || receipt.action !== request.action) throw new MeetupDataError();
  if (receipt.abandoned) { if (receipt.resultingVersion !== 0) throw new MeetupDataError(); return { appointment, acknowledgedVersion: null, abandoned: true }; }
  if (!appointment || !version(receipt.resultingVersion) || receipt.resultingVersion > appointment.version || receipt.resultingVersion !== request.expectedVersion + (['PROPOSE', 'REVISE'].includes(request.action) ? 1 : 0)) throw new MeetupDataError();
  return { appointment, acknowledgedVersion: receipt.resultingVersion, abandoned: false };
}
