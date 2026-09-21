import { ApiError } from './api';
export type SecurityOperation = 'password' | 'sessions';
export type SecurityApi = <T>(path: string, options?: RequestInit) => Promise<T>;
function utf8Length(value: string) {
  let bytes = 0;
  for (const char of value) { const code = char.codePointAt(0)!; bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4; }
  return bytes;
}
export function validateNewPassword(newPassword: string, confirmation: string) {
  if (newPassword !== confirmation) throw new Error('兩次新密碼不一致。');
  if (newPassword.length > 72 || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/.test(newPassword)) throw new Error('新密碼需為 8–72 個字元，包含英文字母與數字；符號限 @$!%*?&。');
  return newPassword;
}
export function securityPayload(operation: SecurityOperation, currentPassword: string, newPassword = '', confirmation = '') {
  if (!currentPassword || currentPassword.includes('\u0000') || utf8Length(currentPassword) > 1024) throw new Error('請輸入目前密碼。');
  if (operation === 'sessions') return { currentPassword };
  return { currentPassword, newPassword: validateNewPassword(newPassword, confirmation) };
}
export function confirmSecurityAck(value: unknown, operation: SecurityOperation) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('無法確認帳號操作。');
  const ack = value as Record<string, unknown>;
  if (ack.changed !== true || ack.requiresLogin !== true || (operation === 'password' && ack.personalApiKeysRevoked !== true)) throw new Error('無法確認帳號操作。');
}
export type SecurityResult = { kind: 'signed-out'; confirmed: boolean; message: string } | { kind: 'rejected'; message: string };
export async function performSecurityOperation(api: SecurityApi, operation: SecurityOperation, payload: ReturnType<typeof securityPayload>): Promise<SecurityResult> {
  try {
    const ack = await api<unknown>(operation === 'password' ? '/users/me/password' : '/users/me/sessions/revoke', { method: operation === 'password' ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    confirmSecurityAck(ack, operation);
    return { kind: 'signed-out', confirmed: true, message: operation === 'password' ? '密碼已更新，舊裝置登入與個人 API key 已撤銷，請重新登入。' : '所有裝置登入已撤銷，個人 API key 保持不變，請重新登入。' };
  } catch (failure) {
    // A 401 here can mean a wrong current password, not a revoked JWT. Probe
    // the actual session before clearing it; lost mutation ACKs are not success.
    try { await api<unknown>('/users/me'); }
    catch (probe) {
      if (probe instanceof ApiError && probe.status === 401) return { kind: 'signed-out', confirmed: false, message: '登入已失效，請重新登入；本次帳號操作結果尚未確認。' };
    }
    return { kind: 'rejected', message: failure instanceof ApiError && failure.code === 'INVALID_CREDENTIALS' ? '目前密碼不正確，尚未確認任何變更。' : failure instanceof ApiError && failure.status === 429 ? '帳號操作過於頻繁，請稍後重試。' : '無法確認帳號操作，請確認網路後再試；不會自動重送。' };
  }
}
