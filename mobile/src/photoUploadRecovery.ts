import { ApiError, createApi } from './api';
import { parsePhotoRecord, PhotoRecord } from './listingForm';

function failureKind(value: unknown) {
  if (value instanceof ApiError) return `HTTP_${value.status}_${value.code ?? 'UNKNOWN'}`;
  if (value instanceof Error) return value.name;
  return 'UNKNOWN';
}

/** Flickr may commit after a mobile connection times out. Recover by the same
 * client upload UUID rather than claiming failure or uploading a duplicate. */
export async function uploadPhotoRecord(
  api: ReturnType<typeof createApi>, apiUrl: string, clientUploadId: string, body: FormData, local = false,
): Promise<PhotoRecord> {
  try {
    return parsePhotoRecord(await api<unknown>('/listing-media', { method: 'POST', body, timeoutMs: 60000 }), apiUrl, local);
  } catch (failure) {
    console.warn(`[listing-media] upload response unavailable: ${failureKind(failure)}`);
    // A conflict means this UUID belongs to different pixels; never attach it.
    if (failure instanceof ApiError && failure.status === 409) throw failure;
    for (const delay of [0, 1000, 2000]) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      try {
        const found = await api<unknown>(`/listing-media/by-upload-id/${clientUploadId}`, { timeoutMs: 5000 });
        return parsePhotoRecord(found, apiUrl, local);
      } catch (lookupFailure) {
        console.warn(`[listing-media] reconciliation ${delay}ms: ${failureKind(lookupFailure)}`);
      }
    }
    throw failure;
  }
}
