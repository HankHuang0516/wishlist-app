import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { encodeSession, parseSessionUser, restoreSession, SESSION_KEY, sessionIssueMessage } from '../session';
const token = 'synthetic.header.signature';
const origin = 'https://example.com';
const profile = { id: 1, name: '合成使用者', phoneNumber: 'synthetic-only', password: 'never-keep', apiKey: 'never-keep' };
function fixture(saved: string | null = encodeSession(origin, token)) {
  return { storage: { get: vi.fn().mockResolvedValue(saved), remove: vi.fn().mockResolvedValue(undefined) }, getMe: vi.fn().mockResolvedValue(profile) };
}
describe('encrypted session restoration and origin binding', () => {
  it('uses a new key rather than transmitting an originless legacy token', () => expect(SESSION_KEY).toBe('wishlist.session.v2'));
  it('treats an absent stored session as a normal signed-out launch', async () => {
    const f = fixture(null); expect(await restoreSession(origin, f.storage, f.getMe)).toEqual({ kind: 'anonymous' }); expect(f.getMe).not.toHaveBeenCalled(); expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it('distinguishes storage failure before any network request and never falls back to plaintext', async () => {
    const f = fixture(); f.storage.get.mockRejectedValue(new Error('synthetic-private-error')); expect(await restoreSession(origin, f.storage, f.getMe)).toEqual({ kind: 'storage-unavailable' }); expect(f.getMe).not.toHaveBeenCalled();
    expect(sessionIssueMessage('storage-unavailable')).not.toContain('網路'); expect(sessionIssueMessage('storage-unavailable')).not.toContain('synthetic-private-error');
  });
  it('normalizes the API suffix and keeps only the needed user fields', async () => {
    const f = fixture(); expect(await restoreSession(origin + '/api/', f.storage, f.getMe)).toEqual({ kind: 'authenticated', token, user: { id: 1, name: '合成使用者', phoneNumber: 'synthetic-only' } }); expect(f.getMe).toHaveBeenCalledWith(token);
  });
  it.each(['https://other.example', 'https://example.com:8443', 'https://example.com/other'])('never transmits a stored credential to a different service %s', async target => {
    const f = fixture(); expect(await restoreSession(target, f.storage, f.getMe)).toEqual({ kind: 'different-service' }); expect(f.getMe).not.toHaveBeenCalled(); expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it.each(['not-json', JSON.stringify({ version: 1, token }), JSON.stringify({ version: 2, apiBase: 'https://user:pass@example.com', token }), JSON.stringify({ version: 2, apiBase: origin, token: 'malformed' }), JSON.stringify({ version: 2, apiBase: origin, token: [] })])('fails closed for malformed stored sessions %#', async saved => {
    const f = fixture(saved); expect(await restoreSession(origin, f.storage, f.getMe)).toEqual({ kind: 'invalid-session' }); expect(f.getMe).not.toHaveBeenCalled();
  });
  it('clears an expired session only after a real unauthorized response', async () => {
    const f = fixture(); f.getMe.mockRejectedValue(new ApiError(401)); expect(await restoreSession(origin, f.storage, f.getMe)).toEqual({ kind: 'expired' }); expect(f.storage.remove).toHaveBeenCalledTimes(1);
  });
  it('handles failed cleanup without an unhandled rejection or authenticated state', async () => {
    const f = fixture(); f.getMe.mockRejectedValue(new ApiError(401)); f.storage.remove.mockRejectedValue(new Error('synthetic-keystore-failure')); expect(await restoreSession(origin, f.storage, f.getMe)).toEqual({ kind: 'expired-storage-unavailable' });
  });
  it.each([new ApiError(403), new ApiError(429), new ApiError(500), new TypeError('network-failure')])('preserves the credential on service/network failure %#', async failure => {
    const f = fixture(); f.getMe.mockRejectedValue(failure); expect(await restoreSession(origin, f.storage, f.getMe)).toEqual({ kind: 'service-unavailable' }); expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it.each([null, [], { id: 0, phoneNumber: 'x' }, { id: 1, phoneNumber: null }, { id: 1, phoneNumber: 'x', name: {} }])('rejects malformed profile responses without authenticating %#', async p => {
    const f = fixture(); f.getMe.mockResolvedValue(p); expect(await restoreSession(origin, f.storage, f.getMe)).toEqual({ kind: 'invalid-response' }); expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it('accepts a nullable server name but does not retain extra private fields', () => expect(parseSessionUser({ ...profile, name: null })).toEqual({ id: 1, phoneNumber: 'synthetic-only' }));
  it('limits secure storage payload size, checks token shape, and forbids an unsafe origin', () => {
    for (const value of ['', 'malformed', null, 'a'.repeat(1850) + '.b.c']) expect(() => encodeSession(origin, value)).toThrow();
    expect(() => encodeSession('http://example.com', token)).toThrow();
    expect(encodeSession('http://localhost:3000/api', token, true)).toContain('http://localhost:3000');
  });
});
