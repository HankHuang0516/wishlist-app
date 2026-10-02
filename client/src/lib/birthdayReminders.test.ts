import { describe, expect, it } from 'vitest';
import { parseBirthdayReminders } from './birthdayReminders';
const row = { id: 7, name: null, nicknames: null, avatarUrl: null, birthday: '1996-02-29T00:00:00.000Z', nextBirthday: '2027-03-01T00:00:00.000Z' };
describe('exact public birthday reminder contract', () => {
  it('preserves anonymous names, opted-in dates and original order without a phone fallback', () => {
    expect(parseBirthdayReminders([row])).toEqual([row]);
    expect(parseBirthdayReminders([])).toEqual([]);
  });
  it.each([
    null, {}, [null], [row, row], [{ ...row, id: 0 }], [{ ...row, id: 2147483648 }],
    [{ ...row, phoneNumber: 'synthetic-private' }], [{ ...row, name: 'bad\u0000name' }],
    [{ ...row, birthday: '1996-02-30T00:00:00.000Z' }], [{ ...row, nextBirthday: '2027-02-28T00:00:00.000Z' }],
    [{ ...row, avatarUrl: 'javascript:synthetic' }], [{ ...row, avatarUrl: 'https://synthetic:secret@example.invalid/avatar.png' }],
  ])('rejects malformed/private extra fields rather than returning a false empty result: %j', value => {
    expect(() => parseBirthdayReminders(value)).toThrow();
  });
  it('accepts the real leap day and vetted owned or HTTPS avatar paths', () => {
    for (const avatarUrl of ['/uploads/synthetic-avatar.png', 'https://example.invalid/synthetic-avatar.jpg']) {
      expect(parseBirthdayReminders([{ ...row, avatarUrl, nextBirthday: '2028-02-29T00:00:00.000Z' }])[0].avatarUrl).toBe(avatarUrl);
    }
  });
});
