export const AUTH_SESSION_KEY = 'wishlist.auth.session.v1';
export interface AuthUser { id: number; phoneNumber: string; name?: string; isPremium?: boolean }
export interface AuthSession { token: string; user: AuthUser }
export function parseAuthUser(value: unknown): AuthUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid account response');
  const row = value as Record<string, unknown>;
  if (!Number.isInteger(row.id) || Number(row.id) < 1 || Number(row.id) > 2147483647 ||
    typeof row.phoneNumber !== 'string' || !row.phoneNumber.trim() || row.phoneNumber.length > 128 ||
    (row.name != null && (typeof row.name !== 'string' || row.name.length > 100)) ||
    (row.isPremium !== undefined && typeof row.isPremium !== 'boolean')) throw new Error('Invalid account response');
  return { id: Number(row.id), phoneNumber: row.phoneNumber,
    ...(typeof row.name === 'string' ? { name: row.name } : {}),
    ...(typeof row.isPremium === 'boolean' ? { isPremium: row.isPremium } : {}) };
}
export function authSession(token: unknown, user: unknown): AuthSession {
  if (typeof token !== 'string' || !token || token.length > 8192 || /\s|[\u0000-\u001f\u007f]/.test(token)) throw new Error('Invalid session response');
  return { token, user: parseAuthUser(user) };
}
export function sessionBody(session: AuthSession | null, api: string): string {
  return JSON.stringify({ version: 1, api, token: session?.token ?? null, user: session?.user ?? null });
}
export function parseSessionBody(body: string, api: string): AuthSession | null {
  const row = JSON.parse(body);
  if (!row || row.version !== 1 || row.api !== api) throw new Error('Invalid stored session scope');
  if (row.token === null && row.user === null) return null;
  return authSession(row.token, row.user);
}
// Only auth keys are touched; encrypted pending operations retain their scopes.
export function readSession(storage: Storage, api: string): AuthSession | null {
  const body = storage.getItem(AUTH_SESSION_KEY);
  if (body !== null) return parseSessionBody(body, api);
  const token = storage.getItem('token'), user = storage.getItem('user');
  if (token === null && user === null) return null;
  if (token === null || user === null) throw new Error('Incomplete stored session');
  return authSession(token, JSON.parse(user));
}
export function persistSession(storage: Storage, session: AuthSession | null, api: string): boolean {
  // Atomic record: a new token cannot be paired with the previous user.
  // Keep a signed-out tombstone so stale legacy keys cannot revive the session.
  storage.setItem(AUTH_SESSION_KEY, sessionBody(session, api));
  let clean = true;
  for (const key of ['token', 'user']) { try { storage.removeItem(key); } catch { clean = false; } }
  return clean;
}
