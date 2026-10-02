import { afterEach, describe, expect, it, vi } from 'vitest';
import { performSecurityOperation, securityPayload } from './accountSecurityWeb';
const response = (value: unknown, status = 200) => ({ ok: status < 300, status, json: async () => value });
afterEach(() => vi.unstubAllGlobals());

describe('native-equivalent web security contract', () => {
  it('validates both password and session payloads without persisting credentials', () => {
    expect(securityPayload('sessions', 'legacy password')).toEqual({ currentPassword: 'legacy password' });
    expect(securityPayload('password', 'old', 'Newpass123', 'Newpass123')).toEqual({ currentPassword: 'old', newPassword: 'Newpass123' });
    for (const current of ['', '\0bad', '界'.repeat(342)]) expect(() => securityPayload('sessions', current)).toThrow();
    expect(() => securityPayload('password', 'old', 'Newpass123', 'different')).toThrow(/不一致/);
    for (const value of ['short1', '12345678', 'abcdefgh', 'Newpass12#', 'a1'.repeat(37)])
      expect(() => securityPayload('password', 'old', value, value)).toThrow(/8–72/);
  });
  it.each(['password', 'sessions'] as const)('requires the correct server acknowledgement for %s', async operation => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response({ changed: true, requiresLogin: true, personalApiKeysRevoked: true }));
    vi.stubGlobal('fetch', fetch);
    expect(await performSecurityOperation('runtime-session', operation, { currentPassword: 'secret' })).toEqual({
      kind: 'signed-out', notice: operation === 'password' ? 'password-updated' : 'sessions-revoked',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: operation === 'password' ? 'PUT' : 'POST', cache: 'no-store' });
  });
  it('keeps a live session after a wrong-password 401 and never retries the mutation', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ errorCode: 'INVALID_CREDENTIALS' }, 401)).mockResolvedValueOnce(response({ id: 1 }));
    vi.stubGlobal('fetch', fetch);
    expect(await performSecurityOperation('session', 'sessions', { currentPassword: 'wrong' })).toEqual({ kind: 'rejected', message: '目前密碼不正確，尚未確認任何變更。' });
    expect(fetch.mock.calls.map(([, init]) => init.method ?? 'GET')).toEqual(['POST', 'GET']);
  });
  it('distinguishes an invalidated session after a lost reply from confirmed success', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('lost ack')).mockResolvedValueOnce(response({}, 401));
    vi.stubGlobal('fetch', fetch);
    expect(await performSecurityOperation('session', 'password', { currentPassword: 'old', newPassword: 'Newpass123' }))
      .toEqual({ kind: 'signed-out', notice: 'security-unconfirmed' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([{}, { changed: true }, { changed: true, requiresLogin: true }, null, []])('does not accept partial password acknowledgements: %j', async ack => {
    const fetch = vi.fn().mockResolvedValueOnce(response(ack)).mockResolvedValueOnce(response({ id: 1 }));
    vi.stubGlobal('fetch', fetch);
    expect(await performSecurityOperation('session', 'password', { currentPassword: 'old', newPassword: 'Newpass123' }))
      .toMatchObject({ kind: 'rejected', message: expect.stringContaining('不會自動重送') });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not infer success or logout from two network failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch);
    expect(await performSecurityOperation('session', 'sessions', { currentPassword: 'old' })).toMatchObject({ kind: 'rejected' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('shows rate limiting without automatic resubmission', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({}, 429)).mockResolvedValueOnce(response({ id: 1 })); vi.stubGlobal('fetch', fetch);
    expect(await performSecurityOperation('session', 'sessions', { currentPassword: 'old' })).toMatchObject({ message: expect.stringContaining('過於頻繁') });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
