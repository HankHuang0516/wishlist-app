import { isUuid, prepareListingUploadFile } from './listingBatch';
import { api, ApiFailure } from './marketplaceApi';
import { getFullApiUrl } from '../config';
import { parseManagedList, parseManagedWish, parseWishJournal, validWishId, wishDraftBody, WishManagementError, type ManagedList, type ManagedWish } from './wishManagement';
import type { PendingStore } from './webPendingStore';
export const wishRoot = '/native-wishes';
export const emptyWishDraft = { name: '', notes: '', link: '', imageUrl: '', budget: '', currency: 'TWD' };
export const wishAiLabels = { PENDING: 'AI 排隊中', PROCESSING: 'AI 辨識中', COMPLETED: 'AI 辨識完成', FAILED: 'AI 辨識失敗，請核對圖片後重建', SKIPPED: '未啟用 AI 辨識' };
const requestId = (value: unknown): value is string => isUuid(value) && value[14] === '4';
export function listDraftBody(title: string, description: string, isPublic: boolean) {
  if (!title.trim() || title.length > 200 || /[\u0000-\u001f\u007f]/.test(title) || description.length > 1000 || description.includes('\u0000') || typeof isPublic !== 'boolean') throw new WishManagementError('清單名稱須為200字內，說明1000字內');
  return { title: title.trim(), description: description || null, isPublic };
}
export function parseWebWishJournal(raw: string) {
  const journal = parseWishJournal(raw), body = JSON.parse(journal.body);
  if (!requestId(body.clientRequestId) || new TextDecoder().decode(new TextEncoder().encode(raw)) !== raw) throw new WishManagementError();
  if (journal.kind === 'LIST') {
    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') throw new WishManagementError();
    listDraftBody(body.title, body.description ?? '', body.isPublic ?? false);
  } else {
    if (body.notes != null && typeof body.notes !== 'string' || body.link != null && typeof body.link !== 'string' || body.imageUrl != null && typeof body.imageUrl !== 'string' || body.maxPrice != null && (typeof body.maxPrice !== 'number' || !Number.isFinite(body.maxPrice)) || body.priceCurrency != null && typeof body.priceCurrency !== 'string') throw new WishManagementError();
    if (body.maxPrice == null && body.priceCurrency !== undefined) throw new WishManagementError();
    wishDraftBody({ name: body.name, notes: body.notes ?? '', link: body.link ?? '', imageUrl: body.imageUrl ?? '', budget: body.maxPrice == null ? '' : String(body.maxPrice), currency: body.priceCurrency ?? 'TWD' }, body.mediaId ?? null);
  }
  return journal;
}
export type WishReceipt = { kind: 'LIST'; id: number; resource: ManagedList | null; deleted: boolean } | { kind: 'ITEM'; id: number; resource: ManagedWish | null; deleted: boolean };
export function parseWishReceipt(value: unknown, raw: string): WishReceipt {
  const journal = parseWebWishJournal(raw), body = JSON.parse(journal.body);
  const row = value as Record<string, unknown>;
  if (!row || !requestId(row.clientRequestId) || row.clientRequestId.toLowerCase() !== body.clientRequestId.toLowerCase() || row.kind !== journal.kind || !validWishId(row.resourceId) || typeof row.deleted !== 'boolean') throw new WishManagementError('建立回執不吻合');
  if (row.deleted) { if (row.resource !== null) throw new WishManagementError(); return { kind: journal.kind, id: row.resourceId, resource: null, deleted: true }; }
  if (journal.kind === 'LIST') { const resource = parseManagedList(row.resource); if (resource.id !== row.resourceId) throw new WishManagementError(); return { kind: 'LIST', id: resource.id, resource, deleted: false }; }
  const resource = parseManagedWish(row.resource); if (resource.id !== row.resourceId || resource.wishlistId !== journal.listId) throw new WishManagementError();
  return { kind: 'ITEM', id: resource.id, resource, deleted: false };
}
export async function lookupWishCreate(token: string, raw: string): Promise<WishReceipt> {
  const journal = parseWebWishJournal(raw);
  return parseWishReceipt(await api(token, wishRoot + '/receipts/' + JSON.parse(journal.body).clientRequestId), raw);
}
export async function submitWishCreate(token: string, raw: string, store: PendingStore, key: string, active: () => boolean) {
  const journal = parseWebWishJournal(raw);
  await store.save(key, raw);
  if (!active()) throw new WishManagementError('已離開此帳號，不會送出');
  const path = journal.kind === 'LIST' ? wishRoot + '/lists' : `${wishRoot}/lists/${journal.listId}/items`;
  const result = await api<{ resource: unknown; replayed: boolean }>(token, path, { method: 'POST', body: journal.body });
  if (!result || typeof result.replayed !== 'boolean') throw new WishManagementError();
  const resource = journal.kind === 'LIST' ? parseManagedList(result.resource) : parseManagedWish(result.resource);
  if (journal.kind === 'ITEM' && (resource as ManagedWish).wishlistId !== journal.listId) throw new WishManagementError();
  return { kind: journal.kind, id: resource.id, resource, deleted: false } as WishReceipt;
}
export type WishPhotoRecord = { id: string; imageUrl: string; thumbnailUrl: string; width: number; height: number; byteSize: number; listingId: string | null; wishItemId: number | null };
export function parseWishPhoto(value: unknown): WishPhotoRecord {
  const row = value as Record<string, unknown>, base = getFullApiUrl().replace(/\/$/, '');
  if (!row || !isUuid(row.id) || row.imageUrl !== `${base}/listing-media/${row.id}/image` || row.thumbnailUrl !== `${base}/listing-media/${row.id}/thumbnail` ||
    ![row.width, row.height, row.byteSize].every(v => typeof v === 'number' && Number.isSafeInteger(v) && v > 0) || Number(row.width) > 1600 || Number(row.height) > 1600 || Number(row.byteSize) > 5 * 1024 * 1024 ||
    !(row.listingId === undefined || row.listingId === null || isUuid(row.listingId)) || !(row.wishItemId === undefined || row.wishItemId === null || validWishId(row.wishItemId))) throw new WishManagementError('照片回應不正確');
  return { id: row.id, imageUrl: row.imageUrl as string, thumbnailUrl: row.thumbnailUrl as string, width: Number(row.width), height: Number(row.height), byteSize: Number(row.byteSize), listingId: row.listingId as string ?? null, wishItemId: row.wishItemId as number ?? null };
}
export type WishPhotoJournal = { version: 1; clientUploadId: string; digest: string };
export function parseWishPhotoJournal(raw: string): WishPhotoJournal {
  let row; try { row = JSON.parse(raw); } catch { throw new WishManagementError('照片恢復紀錄損壞'); }
  if (!row || Object.keys(row).sort().join(',') !== 'clientUploadId,digest,version' || row.version !== 1 || !requestId(row.clientUploadId) || typeof row.digest !== 'string' || !/^[a-f0-9]{64}$/.test(row.digest)) throw new WishManagementError('照片恢復紀錄損壞');
  return row;
}
export async function prepareWishUpload(file: File) {
  const prepared = await prepareListingUploadFile(file);
  if (!prepared.size) throw new WishManagementError('照片不可為空');
  const digest = await crypto.subtle.digest('SHA-256', await prepared.arrayBuffer());
  return { file: prepared, digest: [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('') };
}
export async function lookupWishPhoto(token: string, raw: string) {
  return parseWishPhoto(await api(token, '/listing-media/by-upload-id/' + parseWishPhotoJournal(raw).clientUploadId));
}
export async function submitWishPhoto(token: string, raw: string, file: File, store: PendingStore, key: string, active: () => boolean) {
  const journal = parseWishPhotoJournal(raw), prepared = await prepareWishUpload(file);
  if (prepared.digest !== journal.digest) throw new WishManagementError('請選回原本同一張照片；不會用不同照片重送原識別碼');
  await store.save(key, raw);
  if (!active()) throw new WishManagementError('已離開此帳號，不會上傳');
  const body = new FormData(); body.append('clientUploadId', journal.clientUploadId); body.append('capturePurpose', 'MANUAL_PHOTO'); body.append('image', prepared.file);
  try { return parseWishPhoto(await api(token, '/listing-media', { method: 'POST', body, signal: AbortSignal.timeout(60000) })); }
  catch (failure) {
    if (failure instanceof ApiFailure && failure.status === 409) throw failure;
    if (!active()) throw failure;
    try { return await lookupWishPhoto(token, raw); } catch { throw failure; }
  }
}
