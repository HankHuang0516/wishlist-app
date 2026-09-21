import { randomUUID } from 'crypto';
import { assertFutureMeetup, intervalsOverlap, parseMeetupAction } from '../lib/meetupRules';
const terms = () => ({ startsAt: '2026-10-01T06:00:00.000Z', durationMinutes: 60, timeZone: 'Asia/Taipei', placeName: ' 台北車站 ', latitude: 25.047, longitude: 121.517, notes: ' 東門見 ' });
const proposal = () => ({ clientActionId: randomUUID(), action: 'PROPOSE', expectedVersion: 0, terms: terms() });
describe('private meetup rules', () => {
    it('normalizes exact terms and includes version/action/terms in retry identity', () => {
        const input = proposal(), parsed = parseMeetupAction(input);
        expect(parsed.terms).toMatchObject({ placeName: '台北車站', notes: '東門見', endsAt: new Date('2026-10-01T07:00:00.000Z') });
        expect(parseMeetupAction({ ...input, terms: { ...input.terms, placeName: '台北車站' } }).requestHash).toBe(parsed.requestHash);
        expect(parseMeetupAction({ ...input, terms: { ...input.terms, notes: '另一個門' } }).requestHash).not.toBe(parsed.requestHash);
    });
    it('allows an explicitly named private location without coordinates or notes', () => {
        const { latitude, longitude, notes, ...t } = terms(); expect(parseMeetupAction({ ...proposal(), terms: t }).terms).toMatchObject({ latitude: null, longitude: null, notes: '' });
    });
    it.each([null, [], {}, 'x', { ...proposal(), actorUserId: 2 }, { ...proposal(), clientActionId: 'bad' }, { ...proposal(), action: 'PAY' }, { ...proposal(), action: 42 }, { ...proposal(), expectedVersion: 1 }, { ...proposal(), expectedVersion: -1 }, { ...proposal(), expectedVersion: '0' }, { ...proposal(), expectedVersion: 0.5 }, { ...proposal(), expectedVersion: 2147483647 }])('rejects malformed envelope or identity %p', input => expect(() => parseMeetupAction(input)).toThrow());
    it.each(['REVISE', 'CONFIRM', 'CANCEL', 'COMPLETE'])('requires a real existing version for %s', action => {
        expect(() => parseMeetupAction({ clientActionId: randomUUID(), action, expectedVersion: 0 })).toThrow();
        const input = { clientActionId: randomUUID(), action, expectedVersion: 1, ...(action === 'REVISE' ? { terms: terms() } : {}) };
        expect(parseMeetupAction(input).action).toBe(action);
        if (action !== 'REVISE') expect(() => parseMeetupAction({ ...input, terms: terms() })).toThrow();
    });
    it.each([{ startsAt: '2026-02-30T06:00:00.000Z' }, { startsAt: 'not-date' }, { startsAt: '2026-10-01T14:00:00+08:00' }, { timeZone: 'UTC' }, { durationMinutes: 14 }, { durationMinutes: 241 }, { durationMinutes: 60.5 }, { durationMinutes: '60' }, { placeName: '' }, { placeName: 'x'.repeat(161) }, { notes: 'x'.repeat(1001) }, { notes: '\u0000' }, { latitude: 19 }, { latitude: NaN }, { longitude: Infinity }, { longitude: 124 }, { latitude: null }, { longitude: undefined }, { buyerConfirmedAt: 'spoof' }])('rejects invalid or spoofed terms %p', overrides => expect(() => parseMeetupAction({ ...proposal(), terms: { ...terms(), ...overrides } })).toThrow());
    it('requires terms on proposal and revision', () => { expect(() => parseMeetupAction({ ...proposal(), terms: undefined })).toThrow(); });
    it('uses half-open time intervals, so adjacent appointments do not conflict', () => {
        const d = (n: number) => new Date(n); expect(intervalsOverlap(d(0), d(10), d(10), d(20))).toBe(false); expect(intervalsOverlap(d(0), d(10), d(9), d(20))).toBe(true);
    });
    it('rejects past, equal-now, distant and invalid-clock proposals', () => {
        const now = new Date('2026-09-15T00:00:00Z'); expect(() => assertFutureMeetup(new Date(now.getTime() + 1), now)).not.toThrow();
        for (const start of [now, new Date(now.getTime() - 1), new Date(now.getTime() + 366 * 86400000)]) expect(() => assertFutureMeetup(start, now)).toThrow();
        expect(() => assertFutureMeetup(now, new Date(NaN))).toThrow();
    });
});
