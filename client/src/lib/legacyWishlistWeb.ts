import { getUserLocale } from '../utils/localization';
import { validWishId } from './wishManagement';
import { isUuid } from './listingBatch';

export type LegacyListOperation = { version: 1; id: number; kind: 'PRIVACY' | 'DELETE'; wanted?: boolean; localOperationId?: string };
export function legacyListOperation(raw: string): LegacyListOperation {
  if (raw.length > 512) throw new Error('Invalid list operation');
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || !validWishId(value.id) ||
    !isUuid(value.localOperationId) || !['PRIVACY', 'DELETE'].includes(value.kind) || Object.keys(value).some(key => !['version', 'id', 'kind', 'wanted', 'localOperationId'].includes(key)) ||
    (value.kind === 'PRIVACY' ? typeof value.wanted !== 'boolean' : value.wanted !== undefined)) throw new Error('Invalid list operation');
  return value;
}
export function legacyPrivacyAck(value: unknown, operation: LegacyListOperation, userId: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid privacy response');
  const row = value as Record<string, unknown>;
  if (row.id !== operation.id || row.userId !== userId || row.isPublic !== operation.wanted) throw new Error('Privacy response mismatch');
}
export function legacyDeleteAck(value: unknown, operation: LegacyListOperation) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid deletion response');
  const row = value as Record<string, unknown>;
  if (row.id !== operation.id || row.deleted !== true) throw new Error('Deletion response mismatch');
}
const copy = {
  zh: {
    pending: '原清單操作結果待確認；不會自動重送。此舊 API 沒有歷史回執，只能讀取目前清單狀態。',
    storage: '無法安全恢復或保存清單操作；未送出新操作。請重新載入。',
    unknown: '清單操作結果尚未確認；原標記保留，不會自動重送。請先讀取目前狀態。',
    cleanup: '後台已確認操作，但本機標記未清理；只重試清理，不會再次操作。',
    confirmed: '後台已確認清單操作。', denied: '清單操作被拒絕，請重新登入或核對權限；不會重送。',
    read: '讀取目前清單狀態', checked: '已讀取目前清單；這不是原操作的歷史回執，也不能證明原操作是否成功。',
    resume: '已讀目前狀態，清理標記並恢復操作', clean: '清理已確認操作的本機標記', readFailure: '目前狀態仍未確認，原標記保留。',
    capacity: '尚未確認', capacityRetry: '重新讀取清單上限', recoveryTitle: '原清單操作查核',
  },
  en: {
    pending: 'The original list operation is unconfirmed and will not be resent. This legacy API has no historical receipt; only the current list state can be read.',
    storage: 'The list operation could not be safely restored or saved. No new operation was sent. Reload the page.',
    unknown: 'The list operation is unconfirmed. Its marker is retained and nothing will be resent automatically. Read the current state first.',
    cleanup: 'The server confirmed the operation, but its local marker remains. Retry cleanup only; the operation will not run again.',
    confirmed: 'The server confirmed the list operation.', denied: 'The list operation was rejected. Sign in again or check permissions; nothing will be resent.',
    read: 'Read current list state', checked: 'The current lists were read. This is not a historical receipt and cannot prove the original operation succeeded.',
    resume: 'Acknowledge current state, clear marker and resume', clean: 'Clear the confirmed operation marker', readFailure: 'The current state is still unconfirmed. The marker is retained.',
    capacity: 'Unconfirmed', capacityRetry: 'Read list capacity again', recoveryTitle: 'Original list operation check',
  },
};
export function legacyListText(key: keyof typeof copy.zh) {
  let locale = 'en'; try { locale = getUserLocale(); } catch { /* Recovery works without locale storage. */ }
  return copy[locale.startsWith('zh') ? 'zh' : 'en'][key];
}
