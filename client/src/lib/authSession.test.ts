import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { AUTH_SESSION_KEY, authSession, parseAuthUser, parseSessionBody, persistSession, readSession, sessionBody } from './authSession';
const user = { id: 42, phoneNumber: 'synthetic-only', name: '合成買家', isPremium: false }, api = 'http://127.0.0.1:8000/api';
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe('atomic scoped browser session', () => {
  it('projects only identity fields, never retaining API keys or unrelated profile secrets', () => {
    expect(parseAuthUser({ ...user, apiKey: 'SYNTHETIC_DO_NOT_STORE', password: 'SYNTHETIC_DO_NOT_STORE', email: 'unused@example.invalid' })).toEqual(user);
    expect(parseAuthUser({ ...user, name: null })).toEqual({ id: 42, phoneNumber: user.phoneNumber, isPremium: false });
  });
  it.each([null, [], { ...user, id: 0 }, { ...user, id: 2147483648 }, { ...user, id: '42' }, { ...user, phoneNumber: '' }, { ...user, isPremium: 'true' }, { ...user, name: {} }])('rejects invalid account identity %j', value => { expect(() => parseAuthUser(value)).toThrow(); });
  it.each(['', ' whitespace', 'has\nnewline', 'x'.repeat(8193), null])('rejects unsafe token %j', value => { expect(() => authSession(value, user)).toThrow(); });
  it('restores legacy data once and migrates to one atomic scoped record', () => {
    localStorage.setItem('token', 'fixture'); localStorage.setItem('user', JSON.stringify(user));
    const session = readSession(localStorage, api); expect(session).toEqual({ token: 'fixture', user });
    expect(persistSession(localStorage, session, api)).toBe(true); expect(localStorage.getItem('token')).toBeNull(); expect(localStorage.getItem('user')).toBeNull();
    expect(readSession(localStorage, api)).toEqual(session); expect(() => readSession(localStorage, 'http://different.example/api')).toThrow();
  });
  it('does not silently fall back to legacy data when the authoritative record is corrupt', () => {
    localStorage.setItem(AUTH_SESSION_KEY, '{broken'); localStorage.setItem('token', 'legacy'); localStorage.setItem('user', JSON.stringify(user));
    expect(() => readSession(localStorage, api)).toThrow();
  });
  it('keeps a signed-out tombstone even if deleting legacy data fails', () => {
    localStorage.setItem('token', 'legacy'); localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('pending-evidence', 'KEEP');
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('unavailable'); });
    expect(persistSession(localStorage, null, api)).toBe(false); expect(readSession(localStorage, api)).toBeNull(); expect(localStorage.getItem('pending-evidence')).toBe('KEEP');
  });
  it('fails before touching existing session when atomic storage is unavailable', () => {
    persistSession(localStorage, { token: 'old', user }, api);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => persistSession(localStorage, { token: 'new', user: { ...user, id: 43 } }, api)).toThrow(); expect(readSession(localStorage, api)?.token).toBe('old');
  });
  it('validates stored version, API, token and user together', () => {
    expect(parseSessionBody(sessionBody({ token: 'fixture', user }, api), api)?.user.id).toBe(42);
    for (const patch of [{ version: 2 }, { api: 'different' }, { token: null }, { user: null }, { user: { id: 42 } }]) expect(() => parseSessionBody(JSON.stringify({ version: 1, api, token: 'fixture', user, ...patch }), api)).toThrow();
  });
});
