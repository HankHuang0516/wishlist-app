import { ApiError, createApi, validateApiUrl } from './api';
import { encodeSession, parseSessionUser } from './session';
import { uuid } from './listingForm';
import { securityPayload, SecurityApi } from './accountSecurity';
export type DeletionJournal = { version: 1; apiBase: string; userId: number; clientActionId: string; originalToken: string };
export type DeletionAck = { state: 'ERASED'; accountDeleted: true; clientActionId: string; erasedAt: string; photoCleanupPending: number; legacyCleanupPending: number } |
  { state: 'ABANDONED'; accountDeleted: false; clientActionId: string; erasedAt: null; photoCleanupPending: 0; legacyCleanupPending: 0 };
export type DeletionResult = { kind: 'erased' | 'abandoned'; ack: DeletionAck } | { kind: 'unconfirmed'; message: string };
export function retainDeletionResult(previous: DeletionResult | null, incoming: DeletionResult): DeletionResult {
  if (!previous || previous.kind === 'unconfirmed') return incoming;
  if (incoming.kind === 'unconfirmed') return previous;
  if (previous.kind !== incoming.kind || previous.ack.erasedAt !== incoming.ack.erasedAt) throw new Error('同操作收據矛盾，保留先前證明。');
  return incoming;
}
const record = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('刪除操作資料無效。'); return v as Record<string, unknown>; };
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
const timestamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const DELETION_IMPACT_LABELS = {
  reportsAuthored: '本人商品檢舉與證據', reportOperationReceipts: '本人檢舉收件與安全放棄回執', reportsOnOwnedListings: '隨本人刊登移除的檢舉案件', moderationActionsOnOwnedListings: '隨本人刊登移除的審核紀錄', moderationActionsDetachingOwnReports: '保留但解除本人案件關聯的審核紀錄',
  wishlists: '願望清單', wishes: '願望', wishCreateReceipts: '願望建立操作紀錄', listings: '刊登', uploadedPhotos: '商品照片', conversations: '需封存聊天室', messagesAuthored: '本人發送訊息', otherMessagesInSharedConversations: '保留對方自有訊息', meetupAppointments: '移除面交預約', upcomingMeetupAppointments: '其中尚未結束的預約', purchaseRecords: '解除帳號關聯的購買紀錄', giftClaimsInOtherWishlists: '解除他人願望代購占用', originalCreditsInOtherWishlists: '解除他人願望原始關聯', itemWatches: '商品關注', followRelationships: '追蹤關係', blockRelationships: '封鎖關係', feedbackRecords: '意見回報', crawlerRecords: '本人分析錯誤紀錄',
};
export type DeletionImpact = { capturedAt: string; counts: Record<keyof typeof DELETION_IMPACT_LABELS, number> };
export function parseDeletionImpact(value: unknown): DeletionImpact {
  const impact = record(value), counts = record(impact.counts);
  if (impact.version !== 2 || impact.previewOnly !== true || impact.accountDeleted !== false || !timestamp(impact.capturedAt) || Object.keys(counts).sort().join(',') !== Object.keys(DELETION_IMPACT_LABELS).sort().join(',') || !Object.values(counts).every(count)) throw new Error('刪除影響盤點資料無效；尚未建立刪除操作。');
  return { capturedAt: impact.capturedAt, counts: counts as DeletionImpact['counts'] };
}
export function encodeDeletionJournal(apiUrl: string, userId: number, originalToken: string, clientActionId: string, local = false) {
  if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647 || !uuid(clientActionId)) throw new Error('刪除操作識別無效。');
  encodeSession(apiUrl, originalToken, local);
  return JSON.stringify({ version: 1, apiBase: validateApiUrl(apiUrl, local), userId, clientActionId, originalToken });
}
export function parseDeletionJournal(encoded: string, apiUrl: string, local = false): DeletionJournal {
  if (encoded.length > 4000) throw new Error('刪除操作資料無效。');
  const journal = record(JSON.parse(encoded));
  if (Object.keys(journal).sort().join(',') !== 'apiBase,clientActionId,originalToken,userId,version' || journal.version !== 1 || typeof journal.apiBase !== 'string' || typeof journal.originalToken !== 'string' || typeof journal.clientActionId !== 'string' || typeof journal.userId !== 'number') throw new Error('刪除操作資料無效。');
  if (validateApiUrl(journal.apiBase, local) !== validateApiUrl(apiUrl, local)) throw new Error('刪除操作屬於不同服務，不會傳送舊登入資料。');
  const canonical = encodeDeletionJournal(apiUrl, journal.userId, journal.originalToken, journal.clientActionId, local);
  return JSON.parse(canonical) as DeletionJournal;
}
export function parseDeletionAck(value: unknown, action: string): DeletionAck {
  const ack = record(value);
  if (!uuid(action) || ack.clientActionId !== action || !count(ack.photoCleanupPending) || !count(ack.legacyCleanupPending)) throw new Error('無法確認同一筆刪除操作。');
  if (ack.state === 'ERASED' && ack.accountDeleted === true && timestamp(ack.erasedAt)) return { state: 'ERASED', accountDeleted: true, clientActionId: action, erasedAt: ack.erasedAt, photoCleanupPending: ack.photoCleanupPending, legacyCleanupPending: ack.legacyCleanupPending };
  if (ack.state === 'ABANDONED' && ack.accountDeleted === false && ack.erasedAt === null && ack.photoCleanupPending === 0 && ack.legacyCleanupPending === 0) return { state: 'ABANDONED', accountDeleted: false, clientActionId: action, erasedAt: null, photoCleanupPending: 0, legacyCleanupPending: 0 };
  throw new Error('刪除操作結果無效，尚未確認成功。');
}
const result = (ack: DeletionAck): DeletionResult => ({ kind: ack.state === 'ERASED' ? 'erased' : 'abandoned', ack });
function unconfirmed(failure: unknown): DeletionResult {
  return { kind: 'unconfirmed', message: failure instanceof ApiError && failure.status === 429 ? '結果確認過於頻繁，請稍後重試；尚未確認刪除或取消。' : failure instanceof ApiError && failure.status === 401 ? '原登入已失效，無法確認先前刪除結果；不會把登入失效當作刪除成功，請聯繫客服核對。' : '尚未確認刪除結果。已保留原識別碼；重啟只會查詢，不會自動重送刪除。' };
}
/** Before creating a new journal, verify the CURRENT token's actual account.
 * Store the original token only in the encrypted pending store; never password.
 * Recovery needs it even if ordinary session restoration removes a stale JWT.
 */
export function deletionApi(journal: DeletionJournal, local = false): SecurityApi {
  encodeDeletionJournal(journal.apiBase, journal.userId, journal.originalToken, journal.clientActionId, local);
  return createApi(journal.apiBase, () => journal.originalToken, local);
}
export async function prepareDeletion(encodedJournal: string, apiUrl: string, save: (value: string) => Promise<void>, local = false, makeApi: (journal: DeletionJournal) => SecurityApi = journal => deletionApi(journal, local)) {
  const journal = parseDeletionJournal(encodedJournal, apiUrl, local);
  const api = makeApi(journal);
  const profile = parseSessionUser(await api<unknown>('/users/me'));
  if (profile.id !== journal.userId) throw new Error('裝置帳號已改變，尚未建立刪除操作。');
  await save(encodedJournal);
  return journal;
}
/** api MUST be fixed to this journal's originalToken and apiBase, not a later
 * current session. A UI operation fence must protect the prepare/send lifetime.
 */
export async function lookupDeletion(api: SecurityApi, action: string): Promise<DeletionResult> {
  if (!uuid(action)) throw new Error('刪除操作識別無效。');
  try { return result(parseDeletionAck(await api<unknown>('/users/me/deletion-operations/' + action), action)); }
  catch (failure) { return unconfirmed(failure); } // 404 is NOT a cancellation barrier.
}
export async function submitDeletion(api: SecurityApi, action: string, currentPassword: string): Promise<DeletionResult> {
  if (!uuid(action)) throw new Error('刪除操作識別無效。');
  const { currentPassword: exactPassword } = securityPayload('sessions', currentPassword);
  try {
    return result(parseDeletionAck(await api<unknown>('/users/me', { method: 'DELETE', body: JSON.stringify({ currentPassword: exactPassword, clientActionId: action, confirmation: 'DELETE_MY_ACCOUNT' }) }), action));
  } catch { return lookupDeletion(api, action); } // Never replay a mutation automatically.
}
export async function abandonDeletion(api: SecurityApi, action: string): Promise<DeletionResult> {
  if (!uuid(action)) throw new Error('刪除操作識別無效。');
  try { return result(parseDeletionAck(await api<unknown>('/users/me/deletion-operations/' + action + '/abandon', { method: 'POST', body: '{}' }), action)); }
  catch { return lookupDeletion(api, action); }
}
