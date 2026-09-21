import { ApiError, validateApiUrl } from './api';
import { validateNewPassword, confirmSecurityAck } from './accountSecurity';
import { encodeSession, parseSessionUser, SessionUser } from './session';
export type AuthMode = 'login' | 'register' | 'forgot' | 'resend' | 'verify' | 'reset';
export type RecoveryLink = { mode: 'verify' | 'reset'; token: string };
export class AuthFlowError extends Error { constructor(public readonly code: 'invalid-response' | 'storage-unavailable') { super('帳號流程尚未確認。'); } }
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new AuthFlowError('invalid-response');
  return v as Record<string, unknown>;
};
export function emailPayload(raw: string) {
  const email = raw.trim();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('請輸入有效的 Email。');
  return { email };
}
export function registrationPayload(fields: { name: string; phone: string; email: string; password: string; confirmation: string }) {
  const name = fields.name.trim(), phoneNumber = fields.phone.trim();
  if (!name || name.length > 50) throw new Error('顯示名稱需為 1–50 個字元。');
  if (!/^09\d{8}$/.test(phoneNumber)) throw new Error('請輸入 09 開頭的十位台灣手機號碼。');
  const { email } = emailPayload(fields.email);
  return { name, phoneNumber, email, password: validateNewPassword(fields.password, fields.confirmation) };
}
export function recoveryLink(raw: string, apiUrl: string, local = false): RecoveryLink | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw), base = new URL(validateApiUrl(apiUrl, local));
    if (url.username || url.password || url.hash || [...url.searchParams.keys()].length !== 1) return null;
    const token = url.searchParams.get('token'); if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    let mode: 'verify' | 'reset';
    if (url.protocol === 'weesh:' && !url.port && (url.pathname === '' || url.pathname === '/')) {
      if (url.hostname === 'verify-email') mode = 'verify';
      else if (url.hostname === 'reset-password') mode = 'reset'; else return null;
    } else {
      if (url.origin !== base.origin) return null;
      const prefix = base.pathname.replace(/\/$/, '');
      if (url.pathname === prefix + '/verify-email') mode = 'verify';
      else if (url.pathname === prefix + '/reset-password') mode = 'reset'; else return null;
    }
    return { mode, token };
  } catch { return null; }
}
export function recoveryToken(raw: string, expected: 'verify' | 'reset', apiUrl: string, local = false) {
  const input = raw.trim(); if (/^[0-9a-f]{64}$/.test(input)) return input;
  const link = recoveryLink(input, apiUrl, local);
  if (!link || link.mode !== expected) throw new Error('請貼上本服務的正確驗證／重設連結，或 64 位驗證碼。');
  return link.token;
}
export function registrationAck(value: unknown, expectedEmail: string) {
  const ack = object(value), verification = object(ack.emailVerification);
  parseSessionUser(ack.user);
  if (verification.required !== true || typeof verification.sent !== 'boolean' || verification.sentTo !== expectedEmail) throw new AuthFlowError('invalid-response');
  // Registration's unverified JWT is intentionally not admitted as a login.
  return { sent: verification.sent };
}
export function emailRequestAck(value: unknown) {
  const ack = object(value); if (typeof ack.message !== 'string' || !ack.message || ack.message.length > 1000) throw new AuthFlowError('invalid-response');
}
export function verificationAck(value: unknown) {
  const ack = object(value); parseSessionUser(ack.user);
  if (typeof ack.message !== 'string' || !ack.message) throw new AuthFlowError('invalid-response');
  // Proof confirms this email, not permission to replace another active login.
}
export function resetAck(value: unknown) { confirmSecurityAck(value, 'password'); }
export async function admitLogin(value: unknown, apiUrl: string, getProfile: (token: string) => Promise<unknown>, save: (encoded: string) => Promise<void>, local = false): Promise<{ token: string; user: SessionUser }> {
  const ack = object(value); let expected: SessionUser, encoded: string;
  try { expected = parseSessionUser(ack.user); encoded = encodeSession(apiUrl, ack.token, local); }
  catch { throw new AuthFlowError('invalid-response'); }
  const token = ack.token as string;
  const profile = await getProfile(token); let user: SessionUser;
  try { user = parseSessionUser(profile); if (user.id !== expected.id) throw new Error('Identity mismatch'); }
  catch { throw new AuthFlowError('invalid-response'); }
  try { await save(encoded); } catch { throw new AuthFlowError('storage-unavailable'); }
  return { token, user };
}
export function authErrorMessage(failure: unknown) {
  if (failure instanceof AuthFlowError) return failure.code === 'storage-unavailable' ? '無法安全儲存登入，請重試；不會改存成明文。' : '服務回應不完整，尚未確認成功，請重試。';
  if (failure instanceof ApiError) {
    if (failure.status === 429) return '操作過於頻繁，請稍後重試。';
    if (failure.code === 'EMAIL_NOT_VERIFIED') return '請先驗證 Email；可以重新寄送驗證信。';
    if (failure.code === 'USER_EXISTS') return '此手機或 Email 已註冊，請登入或使用忘記密碼。';
    if (failure.code === 'WEAK_PASSWORD') return '密碼需為 8–72 個字元，包含英文字母與數字及允許的符號。';
    if (failure.code === 'TOKEN_EXPIRED' || failure.code === 'INVALID_TOKEN') return '連結已失效或使用過，請申請新的驗證／重設信。';
    if (failure.code === 'INVALID_CREDENTIALS') return '帳號或密碼不正確。';
  }
  return '暫時無法確認結果，請確認網路後再試；不會自動重送。';
}
