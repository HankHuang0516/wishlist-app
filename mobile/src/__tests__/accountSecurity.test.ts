import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { confirmSecurityAck, performSecurityOperation, securityPayload, SecurityApi } from '../accountSecurity';
const current = ' Original123 ', replacement = 'Changed456';
const passwordPayload = () => securityPayload('password', current, replacement, replacement);
describe('native account security / payload and confirmed mutation outcome', () => {
  it('preserves exact current password bytes and omits unrelated fields from session revocation', () => {
    expect(securityPayload('sessions', current, 'unused', 'unused')).toEqual({ currentPassword: current });
    expect(passwordPayload()).toEqual({ currentPassword: current, newPassword: replacement });
    expect(securityPayload('sessions', 'a'.repeat(1024))).toEqual({ currentPassword: 'a'.repeat(1024) });
  });
  it('bounds actual UTF-8 bytes without depending on Node Buffer or TextEncoder in Hermes', () => {
    for (const value of ['中'.repeat(341), 'é'.repeat(512), '😀'.repeat(256), '\ud800'.repeat(341)]) expect(securityPayload('sessions', value)).toEqual({ currentPassword: value });
    for (const value of ['中'.repeat(342), 'é'.repeat(513), '😀'.repeat(257), '\ud800'.repeat(342)]) expect(() => securityPayload('sessions', value)).toThrow();
  });
  it.each(['', 'a'.repeat(1025), 'a\u0000b'])('rejects missing, excessive or NUL current password %#', value => {
    expect(() => securityPayload('sessions', value)).toThrow('請輸入目前密碼');
  });
  it('rejects mismatched confirmation without trimming either new password', () => {
    expect(() => securityPayload('password', current, replacement, ' ' + replacement)).toThrow('不一致');
  });
  it.each(['weak', 'abcdefgh', '12345678', 'Changed中文123', 'Changed_123', 'A1' + 'a'.repeat(71)])('rejects unsupported or bcrypt-truncated new password %#', value => {
    expect(() => securityPayload('password', current, value, value)).toThrow('8–72');
  });
  it('accepts exactly bcrypt-safe 72 ASCII bytes and allowed symbols', () => {
    const value = 'A1' + 'a'.repeat(70); expect(securityPayload('password', current, value, value)).toEqual({ currentPassword: current, newPassword: value });
    expect(securityPayload('password', current, 'Aa1@$!%*?&', 'Aa1@$!%*?&').newPassword).toBe('Aa1@$!%*?&');
  });
  it.each([null, [], 'ok', {}, { changed: false, requiresLogin: true }, { changed: true, requiresLogin: 'true' }, { changed: true, requiresLogin: true }])('requires literal security ACK flags rather than assuming HTTP success %#', value => {
    expect(() => confirmSecurityAck(value, 'password')).toThrow();
  });
  it('session revocation does not require personal API-key revocation and discards extra ACK data', () => {
    expect(() => confirmSecurityAck({ changed: true, requiresLogin: true, extra: 'discard' }, 'sessions')).not.toThrow();
    expect(() => confirmSecurityAck({ changed: true, requiresLogin: true, personalApiKeysRevoked: true }, 'password')).not.toThrow();
  });
  it.each(['password', 'sessions'] as const)('sends %s once and signs out only after a confirmed ACK', async operation => {
    const api = vi.fn().mockResolvedValue({ changed: true, requiresLogin: true, personalApiKeysRevoked: true });
    const payload = securityPayload(operation, current, replacement, replacement);
    const result = await performSecurityOperation(api as SecurityApi, operation, payload);
    expect(result).toMatchObject({ kind: 'signed-out', confirmed: true });
    expect(api).toHaveBeenCalledTimes(1); expect(api).toHaveBeenCalledWith(operation === 'password' ? '/users/me/password' : '/users/me/sessions/revoke', { method: operation === 'password' ? 'PUT' : 'POST', body: JSON.stringify(payload) });
  });
  it('does not sign out a valid session merely because the current password was wrong', async () => {
    const api = vi.fn().mockRejectedValueOnce(new ApiError(401, 'INVALID_CREDENTIALS')).mockResolvedValueOnce({ id: 7 });
    expect(await performSecurityOperation(api as SecurityApi, 'password', passwordPayload())).toEqual({ kind: 'rejected', message: '目前密碼不正確，尚未確認任何變更。' });
    expect(api.mock.calls.map(call => call[0])).toEqual(['/users/me/password', '/users/me']);
  });
  it('locks a revoked session after lost ACK without claiming the password was changed', async () => {
    const api = vi.fn().mockRejectedValueOnce(new TypeError('synthetic-private-network-error')).mockRejectedValueOnce(new ApiError(401));
    const result = await performSecurityOperation(api as SecurityApi, 'password', passwordPayload());
    expect(result).toMatchObject({ kind: 'signed-out', confirmed: false }); expect(result.message).not.toContain('synthetic'); expect(api).toHaveBeenCalledTimes(2);
  });
  it('keeps the session when an incomplete ACK is followed by a still-valid session probe', async () => {
    const api = vi.fn().mockResolvedValueOnce({ changed: true }).mockResolvedValueOnce({ id: 7 });
    expect(await performSecurityOperation(api as SecurityApi, 'sessions', { currentPassword: current })).toMatchObject({ kind: 'rejected' }); expect(api).toHaveBeenCalledTimes(2);
  });
  it.each([new ApiError(403), new ApiError(500), new TypeError('synthetic-private-error')])('never interprets uncertain service/probe failures as successful revocation %#', async failure => {
    const api = vi.fn().mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);
    const result = await performSecurityOperation(api as SecurityApi, 'sessions', { currentPassword: current }); expect(result.kind).toBe('rejected'); expect(result.message).not.toContain('synthetic'); expect(api).toHaveBeenCalledTimes(2);
  });
  it('gives a bounded rate-limit message without automatically retrying the mutation', async () => {
    const api = vi.fn().mockRejectedValueOnce(new ApiError(429)).mockResolvedValueOnce({ id: 7 });
    const result = await performSecurityOperation(api as SecurityApi, 'sessions', { currentPassword: current }); expect(result.message).toContain('頻繁'); expect(api).toHaveBeenCalledTimes(2);
  });
});
