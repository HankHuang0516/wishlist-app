import { ApiError, validateApiUrl } from './api';

// v1 had no origin binding. It is intentionally not sent to a new service or
// silently migrated: this unreleased prototype must sign in again once.
export const SESSION_KEY = 'wishlist.session.v2';
export type SessionUser = { id: number; name?: string; phoneNumber: string };
export type SessionIssue = 'storage-unavailable' | 'service-unavailable' | 'expired' | 'expired-storage-unavailable' | 'different-service' | 'invalid-session' | 'invalid-response';
type RestoreResult = { kind: 'authenticated'; token: string; user: SessionUser } | { kind: 'anonymous' } | { kind: SessionIssue };
type Storage = { get: () => Promise<string | null>; remove: () => Promise<void> };
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid session response');
  return v as Record<string, unknown>;
};
export function parseSessionUser(v: unknown): SessionUser {
  const u = record(v);
  if (!Number.isSafeInteger(u.id) || (u.id as number) < 1 || typeof u.phoneNumber !== 'string' || !u.phoneNumber.trim() || u.phoneNumber.length > 80 || (u.name !== null && u.name !== undefined && (typeof u.name !== 'string' || u.name.length > 200))) throw new Error('Invalid session user');
  return { id: u.id as number, phoneNumber: u.phoneNumber, ...(typeof u.name === 'string' ? { name: u.name } : {}) };
}
export function encodeSession(apiUrl: string, token: unknown, local = false) {
  if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('Invalid session token');
  const encoded = JSON.stringify({ version: 2, apiBase: validateApiUrl(apiUrl, local), token });
  if (encoded.length > 1900) throw new Error('Session exceeds secure storage budget');
  return encoded;
}
export async function restoreSession(apiUrl: string, storage: Storage, getMe: (token: string) => Promise<unknown>, local = false): Promise<RestoreResult> {
  let saved: string | null;
  try { saved = await storage.get(); } catch { return { kind: 'storage-unavailable' }; }
  if (saved === null) return { kind: 'anonymous' };
  let token: string;
  try {
    const session = record(JSON.parse(saved));
    if (session.version !== 2 || typeof session.apiBase !== 'string') return { kind: 'invalid-session' };
    const actual = validateApiUrl(apiUrl, local), stored = validateApiUrl(session.apiBase, local);
    if (actual !== stored) return { kind: 'different-service' };
    // Validate before issuing any authenticated request; never log the record.
    encodeSession(actual, session.token, local); token = session.token as string;
  } catch { return { kind: 'invalid-session' }; }
  let profile: unknown;
  try { profile = await getMe(token); }
  catch (failure) {
    if (failure instanceof ApiError && failure.status === 401) {
      try { await storage.remove(); return { kind: 'expired' }; }
      catch { return { kind: 'expired-storage-unavailable' }; }
    }
    return { kind: 'service-unavailable' };
  }
  try { return { kind: 'authenticated', token, user: parseSessionUser(profile) }; }
  catch { return { kind: 'invalid-response' }; }
}
export function sessionIssueMessage(issue: SessionIssue) {
  const messages: Record<SessionIssue, string> = {
    'storage-unavailable': '無法存取裝置的安全儲存空間，請重試；登入資料不會改存成明文。',
    'service-unavailable': '暫時無法連線確認登入，已保留安全儲存的登入資料，請稍後重試。',
    expired: '登入已失效，請重新登入。',
    'expired-storage-unavailable': '登入已失效，且暫時無法清除裝置的登入資料，請重試。',
    'different-service': '服務連線設定已變更，請重新登入；舊登入資料不會傳送至不同服務。',
    'invalid-session': '裝置上的登入資料格式無效，請重新登入。',
    'invalid-response': '服務回傳的帳號資料無效，請稍後重試。',
  };
  return messages[issue];
}
