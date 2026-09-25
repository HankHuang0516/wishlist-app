import type { PhotoRecord } from './listingForm';
import type { PrivateCapture } from './privateCaptureStore';

export type CaptureRecovery = {
  items: unknown[];
  retryCaptures: PrivateCapture[];
  releaseUploadIds: string[];
};
export type LookupPhotoRecord = PhotoRecord & { linked: boolean };

/**
 * Recheck the unused list if an upload-ID lookup finds a committed photo that
 * the earlier list snapshot missed. Keep device pixels until an owner-only
 * response proves the photo is recoverable or already linked to a listing.
 */
export async function reconcilePrivateBatchCaptures(
  initialItems: unknown[],
  captures: PrivateCapture[],
  lookup: (clientUploadId: string) => Promise<LookupPhotoRecord>,
  refreshUnused: () => Promise<unknown[]>,
): Promise<CaptureRecovery> {
  const resolved = await Promise.all(captures.map(async capture => {
    try { return { capture, record: await lookup(capture.clientUploadId) }; }
    catch { return { capture, record: null }; }
  }));
  const ids = (items: unknown[]) => new Set(items.map(item =>
    item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined));
  const uploadIds = (items: unknown[]) => new Set(items.map(item =>
    item && typeof item === 'object' ? (item as { clientUploadId?: unknown }).clientUploadId : undefined));
  let items = initialItems;
  const initialIds = ids(initialItems);
  if (resolved.some(({ record }) => record && !initialIds.has(record.id))) {
    try {
      const latest = await refreshUnused();
      if (!Array.isArray(latest)) throw new Error('UNUSED_MEDIA_RESPONSE');
      items = latest;
    } catch { /* Retain device pixels when a fresh list is unavailable. */ }
  }
  const currentIds = ids(items);
  const currentUploadIds = uploadIds(items);
  const retryCaptures: PrivateCapture[] = [];
  const releaseUploadIds: string[] = [];
  for (const { capture, record } of resolved) {
    if (currentUploadIds.has(capture.clientUploadId) || record && (currentIds.has(record.id) || record.linked))
      releaseUploadIds.push(capture.clientUploadId);
    else retryCaptures.push(capture);
  }
  return { items, retryCaptures, releaseUploadIds };
}
