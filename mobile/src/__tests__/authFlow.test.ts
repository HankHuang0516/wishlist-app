import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { AuthFlowError, admitLogin, authErrorMessage, emailPayload, emailRequestAck, recoveryLink, recoveryToken, registrationAck, registrationPayload, resetAck, verificationAck } from '../authFlow';
const origin = 'https://example.com', nonce = 'a'.repeat(64), token = 'synthetic.header.signature';
const user = { id: 7, phoneNumber: '0912345678', name: '合成帳號' };
const register = () => ({ name: ' 合成帳號 ', phone: ' 0912345678 ', email: ' User@example.com ', password: 'Password123', confirmation: 'Password123' });
describe('native authentication payload and credential link isolation', () => {
  it('normalizes visible registration fields but preserves exact passwords and email case', () => {
    expect(registrationPayload(register())).toEqual({ name: '合成帳號', phoneNumber: '0912345678', email: 'User@example.com', password: 'Password123' });
  });
  it.each([{ name: '' }, { name: 'a'.repeat(51) }, { phone: '1234567890' }, { phone: '091234567' }, { email: 'invalid' }, { password: 'weak', confirmation: 'weak' }, { confirmation: 'different' }])('rejects invalid registration fields %#', patch => {
    expect(() => registrationPayload({ ...register(), ...patch })).toThrow();
  });
  it.each(['', 'invalid', 'a b@example.com', '<a>@example.com', 'a'.repeat(250) + '@example.com'])('bounds Email payload without accepting malformed recipients %#', email => expect(() => emailPayload(email)).toThrow());
  it.each(['verify', 'reset'] as const)('accepts only own-service %s links or explicit weesh scheme', mode => {
    const path = mode === 'verify' ? 'verify-email' : 'reset-password';
    expect(recoveryLink(`${origin}/${path}?token=${nonce}`, origin + '/api/')).toEqual({ mode, token: nonce });
    expect(recoveryLink(`weesh://${path}?token=${nonce}`, origin)).toEqual({ mode, token: nonce });
    expect(recoveryLink(`weesh://${path}/?token=${nonce}`, origin)).toEqual({ mode, token: nonce });
    expect(recoveryToken(` ${nonce} `, mode, origin)).toBe(nonce);
    expect(recoveryToken(`${origin}/${path}?token=${nonce}`, mode, origin)).toBe(nonce);
  });
  it.each([
    '', 'not-url', 'a'.repeat(2049), `https://evil.example/verify-email?token=${nonce}`,
    `https://example.com.evil.example/verify-email?token=${nonce}`, `http://example.com/verify-email?token=${nonce}`,
    `${origin}/verify-email?token=${nonce}&token=${nonce}`, `${origin}/verify-email?token=${nonce}&redirect=https://evil.example`,
    `${origin}/verify-email?token=${nonce}#fragment`, `${origin}/verify-email?token=short`, `${origin}/verify-email?token=${nonce.toUpperCase()}`,
    `${origin}/other?token=${nonce}`, `https://user:password@example.com/verify-email?token=${nonce}`,
    `weesh://other?token=${nonce}`, `weesh://verify-email/other?token=${nonce}`, `weesh://verify-email:99?token=${nonce}`,
    `https://example.com:8443/verify-email?token=${nonce}`, `weesh://verify-email?wrong=${nonce}`, `weesh://verify-email?token=`,
  ])('rejects foreign, ambiguous and malformed recovery links %#', link => expect(recoveryLink(link, origin)).toBe(null));
  it('binds web paths to the configured service prefix and allows loopback only explicitly', () => {
    expect(recoveryLink(`${origin}/native/verify-email?token=${nonce}`, origin + '/native/api')).toEqual({ mode: 'verify', token: nonce });
    expect(recoveryLink(`${origin}/verify-email?token=${nonce}`, origin + '/native')).toBe(null);
    expect(recoveryLink(`http://localhost:3000/verify-email?token=${nonce}`, 'http://localhost:3000', true)).toEqual({ mode: 'verify', token: nonce });
    expect(recoveryLink(`http://localhost:3000/verify-email?token=${nonce}`, 'http://localhost:3000')).toBe(null);
  });
  it('does not consume a reset link as Email verification or vice versa', () => {
    expect(() => recoveryToken(`${origin}/reset-password?token=${nonce}`, 'verify', origin)).toThrow();
    expect(() => recoveryToken('invalid', 'reset', origin)).toThrow();
  });
  it.each([true, false])('registration ACK reports actual mail outcome %p without returning its unverified JWT', sent => {
    expect(registrationAck({ user, token, emailVerification: { required: true, sent, sentTo: 'User@example.com' } }, 'User@example.com')).toEqual({ sent });
  });
  it.each([null, [], {}, { user, emailVerification: { required: false, sent: true, sentTo: 'User@example.com' } }, { user, emailVerification: { required: true, sent: 'true', sentTo: 'User@example.com' } }, { user, emailVerification: { required: true, sent: true, sentTo: 'other@example.com' } }])('never infers registration success from an incomplete ACK %#', ack => expect(() => registrationAck(ack, 'User@example.com')).toThrow());
  it('accepts generic Email request ACKs but never returns server text or provider data', () => {
    expect(emailRequestAck({ message: 'If appropriate, mail will be attempted', id: 'discard' })).toBeUndefined();
    for (const value of [null, {}, { message: '' }, { message: 'a'.repeat(1001) }]) expect(() => emailRequestAck(value)).toThrow();
  });
  it('verifies minimal Email ACKs without admitting a returned token as a login', () => {
    expect(verificationAck({ user, message: 'Verified', token })).toBeUndefined();
    for (const value of [null, { user }, { user, message: '' }, { user: {}, message: 'Verified' }]) expect(() => verificationAck(value)).toThrow();
  });
  it('requires all reset confirmation flags', () => {
    expect(resetAck({ changed: true, requiresLogin: true, personalApiKeysRevoked: true })).toBeUndefined();
    expect(() => resetAck({ message: 'Success' })).toThrow();
  });
});
describe('login admission / fresh identity then secure persistence', () => {
  const fixture = () => ({ get: vi.fn().mockResolvedValue({ ...user, name: '最新名稱', password: 'discard', apiKey: 'discard' }), save: vi.fn().mockResolvedValue(undefined) });
  it('checks fresh profile before saving and returns only permitted identity fields', async () => {
    const f = fixture(); expect(await admitLogin({ user, token }, origin, f.get, f.save)).toEqual({ token, user: { ...user, name: '最新名稱' } });
    expect(f.get).toHaveBeenCalledWith(token); expect(f.save).toHaveBeenCalledTimes(1); expect(f.get.mock.invocationCallOrder[0]).toBeLessThan(f.save.mock.invocationCallOrder[0]);
    expect(f.save.mock.calls[0][0]).toContain('https://example.com'); expect(f.save.mock.calls[0][0]).not.toContain('discard');
  });
  it.each([null, [], {}, { user: {}, token }, { user, token: 'invalid' }])('rejects malformed login replies before network or persistence %#', ack => {
    const f = fixture(); return expect(admitLogin(ack, origin, f.get, f.save)).rejects.toThrow(AuthFlowError).then(() => { expect(f.get).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled(); });
  });
  it.each([null, { ...user, id: 8 }])('rejects invalid or different fresh identity %#', profile => {
    const f = fixture(); f.get.mockResolvedValue(profile); return expect(admitLogin({ user, token }, origin, f.get, f.save)).rejects.toThrow(AuthFlowError).then(() => expect(f.save).not.toHaveBeenCalled());
  });
  it('does not save revoked or unavailable sessions and does not turn storage failure into login success', async () => {
    const f = fixture(); const denied = new ApiError(401); f.get.mockRejectedValue(denied);
    await expect(admitLogin({ user, token }, origin, f.get, f.save)).rejects.toBe(denied); expect(f.save).not.toHaveBeenCalled();
    f.get.mockResolvedValue(user); f.save.mockRejectedValue(new Error('private-native-storage-error'));
    await expect(admitLogin({ user, token }, origin, f.get, f.save)).rejects.toMatchObject({ code: 'storage-unavailable' });
  });
});
describe('bounded authentication error messages', () => {
  it.each(['EMAIL_NOT_VERIFIED', 'USER_EXISTS', 'WEAK_PASSWORD', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'INVALID_CREDENTIALS'])('maps known %s without server secret text', code => {
    const message = authErrorMessage(new ApiError(400, code)); expect(message).not.toContain('暫時無法'); expect(message).not.toContain(code);
  });
  it('distinguishes rate limits, unsafe storage and incomplete server ACKs', () => {
    expect(authErrorMessage(new ApiError(429))).toContain('頻繁'); expect(authErrorMessage(new AuthFlowError('storage-unavailable'))).toContain('明文'); expect(authErrorMessage(new AuthFlowError('invalid-response'))).toContain('不完整');
    expect(authErrorMessage(new Error('synthetic-private-server-error'))).not.toContain('synthetic');
    expect(authErrorMessage(new ApiError(500))).toContain('不會自動重送');
  });
});
