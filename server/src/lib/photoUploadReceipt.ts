import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PhotoInputError } from './listingPhoto';

export function photoUploadHash(buffer: Buffer, capturePurpose: string) {
    const sourceHash = createHash('sha256').update(buffer).digest('hex');
    return createHash('sha256').update(JSON.stringify({ sourceHash, capturePurpose })).digest('hex');
}
// Older native clients omit purpose on retries. Accept only an exact source
// byte digest for one of the original supported purposes, not another image.
export function compatibleUploadHash(buffer: Buffer, capturePurpose: string, purposeSpecified: boolean, originalHash: string) {
    const incoming = photoUploadHash(buffer, capturePurpose);
    if (purposeSpecified) return incoming;
    return ['LEGACY_UNKNOWN', 'MANUAL_PHOTO', 'BATCH_ITEM'].some(purpose => photoUploadHash(buffer, purpose) === originalHash) ? originalHash : incoming;
}
export const photoUploadReceiptSelect = {
    clientUploadId: true, requestHash: true, state: true, mediaId: true, createdAt: true,
} satisfies Prisma.PhotoUploadReceiptSelect;
export const uploadedPhotoSelect = {
    id: true, ownerUserId: true, clientUploadId: true, capturePurpose: true, contentHash: true,
    listingId: true, wishItemId: true, imageUrl: true, thumbnailUrl: true,
    width: true, height: true, byteSize: true, createdAt: true,
} satisfies Prisma.ListingMediaSelect;
export function assertUploadReceipt(receipt: { requestHash: string; state: string; mediaId: string | null }, requestHash: string) {
    if (receipt.requestHash !== requestHash) throw new PhotoInputError('上傳識別碼已被不同照片或用途使用', 409);
    if (receipt.state !== 'STORED') throw new PhotoInputError('此上傳已安全取消；不會重新建立照片', 409);
}
