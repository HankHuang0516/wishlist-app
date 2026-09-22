import { adminHeaderAdmission } from '../lib/adminAdmission';

// Public synthetic test text; never read a real environment/keychain key.
const key = 'synthetic-marketplace-admission-key';

describe('marketplace header-only admin admission', () => {
    it.each([undefined, null, '', 1, true, {}, [], 'x'.repeat(4097)])('fails closed for disabled server configuration %#', expected => {
        expect(adminHeaderAdmission(expected, key)).toBe('DISABLED');
    });
    it.each([undefined, null, '', 1, true, {}, [key], [key, key], 'x'.repeat(4097)])('rejects malformed or missing headers %#', supplied => {
        expect(adminHeaderAdmission(key, supplied)).toBe('DENIED');
    });
    it('accepts only an exact server-held credential', () => {
        expect(adminHeaderAdmission(key, key)).toBe('AUTHORIZED');
    });
    it.each(['wrong-key', ' ' + key, key + ' ', key.toUpperCase(), key + ', ' + key])('does not coerce or normalize an altered header %#', supplied => {
        expect(adminHeaderAdmission(key, supplied)).toBe('DENIED');
    });
    it('does not admit client-defined administration claims', () => {
        expect(adminHeaderAdmission(key, { key, role: 'admin', isAdmin: true })).toBe('DENIED');
    });
    it('keeps the existing key unchanged rather than generating a replacement', () => {
        expect(adminHeaderAdmission(key, key)).toBe('AUTHORIZED');
        expect(key).toBe('synthetic-marketplace-admission-key');
    });
});
