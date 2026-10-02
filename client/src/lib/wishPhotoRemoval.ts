import { isUuid } from './listingBatch';
import { api } from './marketplaceApi';
import { parseWishPhotoJournal, wishRoot } from './wishWeb';
import { WishManagementError } from './wishManagement';
import type { PendingStore } from './webPendingStore';

export type WishPhotoRemovalJournal = { version: 1; mediaId: string; photoBody: string };
export type WishPhotoRemovalReceipt = { clientUploadId: string; mediaId: string; removed: true; removedAt: string; cleanupPending: boolean };
export function parseWishPhotoRemovalJournal(raw: string): WishPhotoRemovalJournal {
  let value; try { value = JSON.parse(raw); } catch { throw new WishManagementError('照片移除恢復紀錄損壞'); }
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'mediaId,photoBody,version' || value.version !== 1 || !isUuid(value.mediaId) || typeof value.photoBody !== 'string') throw new WishManagementError('照片移除恢復紀錄損壞');
  parseWishPhotoJournal(value.photoBody);
  return value;
}
export function parseWishPhotoRemovalReceipt(value: unknown, raw: string): WishPhotoRemovalReceipt {
  const journal = parseWishPhotoRemovalJournal(raw), photo = parseWishPhotoJournal(journal.photoBody);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WishManagementError('照片移除回執不吻合');
  const row = value as Record<string, unknown>;
  if (!isUuid(row.clientUploadId) || row.clientUploadId.toLowerCase() !== photo.clientUploadId.toLowerCase() || !isUuid(row.mediaId) || row.mediaId.toLowerCase() !== journal.mediaId.toLowerCase() || row.removed !== true || typeof row.cleanupPending !== 'boolean' || typeof row.removedAt !== 'string' || !Number.isFinite(Date.parse(row.removedAt)) || new Date(row.removedAt).toISOString() !== row.removedAt) throw new WishManagementError('照片移除回執不吻合');
  return { clientUploadId: row.clientUploadId, mediaId: row.mediaId, removed: true, removedAt: row.removedAt, cleanupPending: row.cleanupPending };
}
function path(raw: string) {
  return `${wishRoot}/photo-removals/${parseWishPhotoJournal(parseWishPhotoRemovalJournal(raw).photoBody).clientUploadId}`;
}
export async function lookupWishPhotoRemoval(token: string, raw: string) {
  return parseWishPhotoRemovalReceipt(await api(token, path(raw)), raw);
}
export async function submitWishPhotoRemoval(token: string, raw: string, store: PendingStore, key: string, active: () => boolean) {
  const journal = parseWishPhotoRemovalJournal(raw);
  await store.save(key, raw);
  if (!active()) throw new WishManagementError('已離開此帳號，不會移除照片');
  return parseWishPhotoRemovalReceipt(await api(token, path(raw), { method: 'POST', body: JSON.stringify({ mediaId: journal.mediaId }) }), raw);
}
