import { API_URL } from '../config';

export type SecurityOperation = 'password' | 'sessions';
export type SecurityNotice = 'password-updated' | 'sessions-revoked' | 'security-unconfirmed';
export const SECURITY_NOTICES: Record<SecurityNotice, string> = {
  'password-updated': '密碼已更新，舊裝置登入與個人 API key 已撤銷，請重新登入。',
  'sessions-revoked': '所有裝置登入已撤銷，個人 API key 保持不變，請重新登入。',
  'security-unconfirmed': '登入已失效，請重新登入；本次帳號操作結果尚未確認。',
};
export type SecurityResult = { kind: 'signed-out'; notice: SecurityNotice } | { kind: 'rejected'; message: string };

export function securityPayload(operation: SecurityOperation, currentPassword: string, newPassword = '', confirmation = '') {
  if (!currentPassword || currentPassword.includes('\0') || new TextEncoder().encode(currentPassword).length > 1024)
    throw new Error('請輸入有效的目前密碼。');
  if (operation === 'sessions') return { currentPassword };
  if (newPassword !== confirmation) throw new Error('兩次新密碼不一致。');
  if (newPassword.length > 72 || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/.test(newPassword))
    throw new Error('新密碼需為 8–72 個字元，包含英文字母與數字；符號限 @$!%*?&。');
  return { currentPassword, newPassword };
}

/** Match the native security contract. A lost reply is never retried or called success.
 * In particular a wrong-password 401 is not evidence that the login was revoked. */
export async function performSecurityOperation(token: string, operation: SecurityOperation,
  payload: ReturnType<typeof securityPayload>): Promise<SecurityResult> {
  let status: number | undefined, code: unknown;
  try {
    const response = await fetch(`${API_URL}/users/me/${operation === 'password' ? 'password' : 'sessions/revoke'}`, {
      method: operation === 'password' ? 'PUT' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000), cache: 'no-store',
    });
    status = response.status;
    const value: unknown = await response.json();
    const ack = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
    code = ack?.errorCode;
    if (response.ok && ack?.changed === true && ack.requiresLogin === true &&
      (operation === 'sessions' || ack.personalApiKeysRevoked === true))
      return { kind: 'signed-out', notice: operation === 'password' ? 'password-updated' : 'sessions-revoked' };
  } catch { /* Probe the original session, without replaying the mutation. */ }
  try {
    const probe = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store',
    });
    if (probe.status === 401) return { kind: 'signed-out', notice: 'security-unconfirmed' };
  } catch { /* An unavailable probe cannot prove logout or successful mutation. */ }
  return { kind: 'rejected', message: code === 'INVALID_CREDENTIALS' ? '目前密碼不正確，尚未確認任何變更。'
    : status === 429 ? '帳號操作過於頻繁，請稍後重試。'
    : '無法確認帳號操作，請確認網路後再試；不會自動重送。' };
}
