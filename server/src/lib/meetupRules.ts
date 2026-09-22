import { createHash } from 'crypto';
import { ChatInputError, chatIdentity, chatObject } from './chatRules';

export type MeetupAction = 'PROPOSE' | 'REVISE' | 'CONFIRM' | 'CANCEL' | 'COMPLETE';
export type MeetupTerms = { startsAt: Date; endsAt: Date; timeZone: 'Asia/Taipei'; placeName: string; latitude: number | null; longitude: number | null; notes: string };
function text(value: unknown, max: number, optional = false) {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || (!optional && !value.trim()) || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ChatInputError('面交地點或備註不正確');
    return value.trim();
}
export function parseMeetupAction(input: unknown) {
    const body = chatObject(input, ['clientActionId', 'action', 'expectedVersion', 'terms']);
    const clientActionId = chatIdentity(body.clientActionId);
    if (!['PROPOSE', 'REVISE', 'CONFIRM', 'CANCEL', 'COMPLETE'].includes(body.action as string)) throw new ChatInputError('面交操作不正確');
    const action = body.action as MeetupAction;
    if (!Number.isSafeInteger(body.expectedVersion) || typeof body.expectedVersion !== 'number' || body.expectedVersion < 0 || body.expectedVersion > 2_147_483_646 || (action === 'PROPOSE' ? body.expectedVersion !== 0 : body.expectedVersion === 0)) throw new ChatInputError('預約版本不正確');
    let terms: MeetupTerms | undefined;
    if (action === 'PROPOSE' || action === 'REVISE') {
        const t = chatObject(body.terms, ['startsAt', 'durationMinutes', 'timeZone', 'placeName', 'latitude', 'longitude', 'notes']);
        if (typeof t.startsAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t.startsAt)) throw new ChatInputError('請使用有效的 UTC 面交時間');
        const startsAt = new Date(t.startsAt);
        if (!Number.isFinite(startsAt.getTime()) || startsAt.toISOString() !== t.startsAt || t.timeZone !== 'Asia/Taipei') throw new ChatInputError('面交日期或時區不正確');
        const duration = t.durationMinutes;
        if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 15 || duration > 240) throw new ChatInputError('面交時間長度須為15至240分鐘');
        const hasLatitude = t.latitude !== undefined, hasLongitude = t.longitude !== undefined;
        if (hasLatitude !== hasLongitude || (hasLatitude && (typeof t.latitude !== 'number' || !Number.isFinite(t.latitude) || t.latitude < 20 || t.latitude > 26.6 || typeof t.longitude !== 'number' || !Number.isFinite(t.longitude) || t.longitude < 117 || t.longitude > 123.8))) throw new ChatInputError('請提供完整的台灣面交座標，或不填座標');
        terms = { startsAt, endsAt: new Date(startsAt.getTime() + duration * 60_000), timeZone: 'Asia/Taipei', placeName: text(t.placeName, 160), latitude: hasLatitude ? t.latitude as number : null, longitude: hasLongitude ? t.longitude as number : null, notes: text(t.notes, 1000, true) };
    } else if (body.terms !== undefined) throw new ChatInputError('此操作不可改變面交條件');
    const expectedVersion = body.expectedVersion;
    const requestHash = createHash('sha256').update(JSON.stringify({ action, expectedVersion, terms })).digest('hex');
    return { clientActionId, action, expectedVersion, terms, requestHash };
}
export function assertFutureMeetup(startsAt: Date, now: Date) {
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(startsAt.getTime()) || startsAt <= now || startsAt.getTime() > now.getTime() + 365 * 86_400_000) throw new ChatInputError('面交時間必須在未來一年內');
}
export const intervalsOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;
