import { boundedPassword, strongNewPassword, validNewPassword, nextAuthVersion, securityBody } from '../lib/accountSecurityRules';
describe('account security / bounded reauthentication and bcrypt input', () => {
    it('preserves existing current-password bytes without trimming', () => { expect(boundedPassword(' Legacy123 ')).toBe(' Legacy123 '); expect(boundedPassword('a'.repeat(1024))).toHaveLength(1024); });
    it.each([null, [], '', 42, 'a'.repeat(1025), 'bad\u0000password'])('rejects malformed current password %p', input => { expect(() => boundedPassword(input)).toThrow(); });
    it('requires a strong new password within bcrypt actual 72-byte boundary', () => { expect(strongNewPassword('Synthetic123!')).toBe('Synthetic123!'); expect(validNewPassword('A1' + 'a'.repeat(70))).toBe(true); expect(validNewPassword('A1' + 'a'.repeat(71))).toBe(false); });
    it.each(['short1', 'NoDigitsHere', '123456789', 'Emoji123🙂', 'abc12345\u0000', null])('rejects weak or unsupported new password %p', input => { expect(validNewPassword(input)).toBe(false); });
    it('increments only valid non-overflowing revocation versions', () => { expect(nextAuthVersion(0)).toBe(1); expect(nextAuthVersion(2147483646)).toBe(2147483647); for (const version of [-1, 1.5, 2147483647, NaN]) expect(() => nextAuthVersion(version)).toThrow(); });
    it('rejects injected account identifiers or privilege fields', () => { expect(securityBody({ currentPassword: 'Synthetic123!' }, ['currentPassword'])).toEqual({ currentPassword: 'Synthetic123!' }); for (const input of [null, [], { userId: 1 }, { isAdmin: true }]) expect(() => securityBody(input, ['currentPassword'])).toThrow(); });
});
