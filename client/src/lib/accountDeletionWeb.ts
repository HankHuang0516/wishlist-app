/** Browser account-erasure requests use the server's idempotent operation ID.
 * The pending journal contains no password. Never replay DELETE
 * after an unknown response; recover with a read or a server-side abandon gate.
 */
export const PENDING_DELETION_KEY = 'wishlist.ai.account-deletion.pending.v1';

export type PendingDeletion = {
  version: 1;
  apiUrl: string;
  userId: number;
  clientActionId: string;
  originalToken: string;
};

export type DeletionAck = {
  state: 'ERASED' | 'ABANDONED';
  accountDeleted: boolean;
  clientActionId: string;
  erasedAt: string | null;
  photoCleanupPending: number;
  legacyCleanupPending: number;
};

export type DeletionResult =
  | { kind: 'confirmed'; ack: DeletionAck }
  | { kind: 'unconfirmed' };

const uuid = (value: unknown): value is string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

export function parsePendingDeletion(raw: string | null, apiUrl: string): PendingDeletion | null {
  if (raw === null) return null;
  if (raw.length > 10_000) throw new Error('無法安全讀取原刪除操作，請聯絡客服核對。');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('無法安全讀取原刪除操作，請聯絡客服核對。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('無法安全讀取原刪除操作，請聯絡客服核對。');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'apiUrl,clientActionId,originalToken,userId,version' ||
    record.version !== 1 || record.apiUrl !== apiUrl ||
    !Number.isSafeInteger(record.userId) || Number(record.userId) < 1 ||
    !uuid(record.clientActionId) || typeof record.originalToken !== 'string' ||
    !record.originalToken || record.originalToken.length > 8192 || /\s/.test(record.originalToken))
    throw new Error('無法安全讀取原刪除操作，請聯絡客服核對。');
  return record as PendingDeletion;
}

export function createPendingDeletion(apiUrl: string, userId: number, token: string): PendingDeletion {
  if (!Number.isSafeInteger(userId) || userId < 1 || !token || token.length > 8192 || /\s/.test(token))
    throw new Error('目前登入資料無效，沒有送出刪除。');
  return { version: 1, apiUrl, userId, clientActionId: crypto.randomUUID(), originalToken: token };
}

export function parseDeletionAck(value: unknown, actionId: string): DeletionAck {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('刪除收據無效。');
  const ack = value as Record<string, unknown>;
  if (!uuid(actionId) || ack.clientActionId !== actionId || !count(ack.photoCleanupPending) || !count(ack.legacyCleanupPending))
    throw new Error('刪除收據不屬於原操作。');
  if (ack.state === 'ERASED' && ack.accountDeleted === true && typeof ack.erasedAt === 'string' &&
    Number.isFinite(Date.parse(ack.erasedAt))) return ack as DeletionAck;
  if (ack.state === 'ABANDONED' && ack.accountDeleted === false && ack.erasedAt === null &&
    ack.photoCleanupPending === 0 && ack.legacyCleanupPending === 0) return ack as DeletionAck;
  throw new Error('刪除收據無效。');
}

const headers = (journal: PendingDeletion) => ({ Authorization: `Bearer ${journal.originalToken}` });

export async function lookupDeletion(journal: PendingDeletion): Promise<DeletionResult> {
  try {
    const response = await fetch(`${journal.apiUrl}/users/me/deletion-operations/${journal.clientActionId}`, {
      headers: headers(journal), cache: 'no-store',
    });
    if (!response.ok) return { kind: 'unconfirmed' };
    return { kind: 'confirmed', ack: parseDeletionAck(await response.json(), journal.clientActionId) };
  } catch { return { kind: 'unconfirmed' }; }
}

export async function submitDeletion(journal: PendingDeletion, currentPassword: string): Promise<DeletionResult> {
  if (!currentPassword || new TextEncoder().encode(currentPassword).length > 1024 || currentPassword.includes('\0'))
    throw new Error('請輸入有效的目前密碼；沒有送出刪除。');
  try {
    const response = await fetch(`${journal.apiUrl}/users/me`, {
      method: 'DELETE', headers: { ...headers(journal), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, clientActionId: journal.clientActionId, confirmation: 'DELETE_MY_ACCOUNT' }),
    });
    if (response.ok) return { kind: 'confirmed', ack: parseDeletionAck(await response.json(), journal.clientActionId) };
  } catch { /* Lost reply is not evidence of failure. */ }
  return lookupDeletion(journal);
}

export async function abandonDeletion(journal: PendingDeletion): Promise<DeletionResult> {
  try {
    const response = await fetch(`${journal.apiUrl}/users/me/deletion-operations/${journal.clientActionId}/abandon`, {
      method: 'POST', headers: { ...headers(journal), 'Content-Type': 'application/json' }, body: '{}',
    });
    if (response.ok) return { kind: 'confirmed', ack: parseDeletionAck(await response.json(), journal.clientActionId) };
  } catch { /* Only the authoritative receipt/barrier can settle the state. */ }
  return lookupDeletion(journal);
}
