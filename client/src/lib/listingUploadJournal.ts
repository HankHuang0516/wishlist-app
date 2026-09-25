import { isUuid } from './listingBatch';

export type PendingUpload = { clientUploadId: string; createdAt: number };
const key = (userId: number) => `wishlist:listing-upload-pending:${userId}`;

export function readPendingUploads(userId: number): PendingUpload[] {
  const raw = localStorage.getItem(key(userId));
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('上傳恢復紀錄格式不正確'); }
  if (!Array.isArray(parsed) || parsed.length > 30 || parsed.some(row => !row || typeof row !== 'object' ||
    !isUuid(row.clientUploadId) || !Number.isSafeInteger(row.createdAt) || row.createdAt < 0 || row.createdAt > Date.now() + 60_000) ||
    new Set(parsed.map(row => row.clientUploadId)).size !== parsed.length) throw new Error('上傳恢復紀錄格式不正確');
  return parsed as PendingUpload[];
}

export function rememberPendingUpload(userId: number, clientUploadId: string) {
  if (!isUuid(clientUploadId)) throw new Error('照片上傳識別碼不正確');
  const entries = readPendingUploads(userId);
  if (entries.some(entry => entry.clientUploadId === clientUploadId)) return;
  if (entries.length >= 30) throw new Error('待確認上傳過多，請先處理舊照片');
  localStorage.setItem(key(userId), JSON.stringify([...entries, { clientUploadId, createdAt: Date.now() }]));
}

export function forgetPendingUploads(userId: number, ids: readonly string[]) {
  const remaining = readPendingUploads(userId).filter(entry => !ids.includes(entry.clientUploadId));
  if (remaining.length) localStorage.setItem(key(userId), JSON.stringify(remaining));
  else localStorage.removeItem(key(userId));
}

function uploadIdOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as Record<string, unknown>).clientUploadId;
  return isUuid(id) ? id : null;
}

export async function reconcilePendingUploads(
  userId: number,
  initialItems: unknown[],
  lookup: (clientUploadId: string) => Promise<unknown>,
  refresh: () => Promise<unknown[]>,
): Promise<{ items: unknown[]; unresolved: string[] }> {
  const pending = readPendingUploads(userId);
  if (!pending.length) return { items: initialItems, unresolved: [] };
  const confirmed = new Set<string>();
  const needRefresh = new Set<string>();
  for (const entry of pending) {
    if (initialItems.some(item => uploadIdOf(item) === entry.clientUploadId)) { confirmed.add(entry.clientUploadId); continue; }
    try {
      const row = await lookup(entry.clientUploadId) as Record<string, unknown>;
      if (!row || !isUuid(row.id) || !(row.listingId === null || isUuid(row.listingId)) ||
          !(row.wishItemId === null || Number.isSafeInteger(row.wishItemId) && Number(row.wishItemId) > 0)) continue;
      if (row.listingId !== null || row.wishItemId !== null) confirmed.add(entry.clientUploadId);
      else needRefresh.add(entry.clientUploadId);
    } catch { /* A 404 may race a committed upload; never discard its UUID. */ }
  }
  let items = initialItems;
  if (needRefresh.size) {
    try {
      const latest = await refresh();
      if (!Array.isArray(latest)) throw new Error('私人照片清單不正確');
      const merged = new Map<string, unknown>();
      for (const item of [...initialItems, ...latest]) {
        if (item && typeof item === 'object' && isUuid((item as Record<string, unknown>).id))
          merged.set((item as Record<string, string>).id, item);
      }
      items = [...merged.values()];
      for (const id of needRefresh) if (items.some(item => uploadIdOf(item) === id)) confirmed.add(id);
    } catch { /* Keep every unresolved key; retry on the next open. */ }
  }
  if (confirmed.size) forgetPendingUploads(userId, [...confirmed]);
  return { items, unresolved: pending.map(entry => entry.clientUploadId).filter(id => !confirmed.has(id)) };
}
