import { Response } from 'express';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getApiUrl } from '../config/constants';
import { isDiscoverable, isListingId } from '../lib/listingRules';
import { encodeListingPhoto, PhotoInputError } from '../lib/listingPhoto';
import { ListingMediaStorage, MediaStorageConfigurationError, PhotoVariant } from '../lib/listingMediaStorage';
import { ListingFlickrStorage, FlickrMediaUnavailable, FlickrOrphanedUpload } from '../lib/listingFlickrStorage';

const storage = new ListingMediaStorage();
const flickrStorage = new ListingFlickrStorage();
// Keep the live volume path until the Flickr token has delete scope and the
// explicit cutover flag is enabled. Existing media always follows its row.
const uploadProvider = (ownerUserId: number) => {
    const provider = process.env.LISTING_MEDIA_STORAGE_PROVIDER ?? 'local';
    const pilotUserId = process.env.LISTING_MEDIA_FLICKR_PILOT_USER_ID;
    // A configured pilot ID keeps every other user on the existing volume.
    if (provider === 'flickr' && pilotUserId !== undefined && pilotUserId !== String(ownerUserId)) return 'local';
    return provider;
};
async function rollbackUpload(id: string, flickrPhotoId?: string) {
    if (!flickrPhotoId) return storage.remove(id);
    try { await flickrStorage.remove(flickrPhotoId); }
    catch {
        // The ID was generated before upload. Preserve it for retry when Flickr
        // succeeds but DB persistence, metadata lookup or a cleanup call fails.
        await prisma.mediaErasureTask.createMany({ data: [{ mediaId: id, flickrPhotoId }], skipDuplicates: true });
    }
}
const select = { id: true, imageUrl: true, thumbnailUrl: true, width: true, height: true, byteSize: true, createdAt: true } satisfies Prisma.ListingMediaSelect;
export function mediaError(res: Response, error: unknown) {
    if (error instanceof PhotoInputError) return res.status(error.status).json({ error: error.message, errorCode: 'INVALID_LISTING_PHOTO' });
    if (error instanceof MediaStorageConfigurationError || error instanceof FlickrMediaUnavailable) return res.status(503).json({ error: '商品照片儲存尚未配置，請稍後再試', errorCode: 'PHOTO_STORAGE_UNAVAILABLE' });
    return res.status(500).json({ error: '商品照片暫時無法上傳', errorCode: 'PHOTO_UPLOAD_ERROR' });
}

export async function uploadListingMedia(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    let id: string | undefined;
    let persisted = false;
    let flickrPhotoId: string | undefined;
    try {
        const clientUploadId = req.body?.clientUploadId;
        if (!isListingId(clientUploadId) || Object.keys(req.body ?? {}).some(k => k !== 'clientUploadId') || !req.file) throw new PhotoInputError('請選擇照片並提供有效的上傳識別碼');
        const ownerUserId = req.user.id;
        if (!await prisma.user.findUnique({ where: { id: ownerUserId }, select: { id: true } })) return res.status(401).json({ error: '帳號已失效' });
        const provider = uploadProvider(ownerUserId);
        if (provider === 'flickr') await flickrStorage.ready();
        else if (provider === 'local') await storage.ready();
        else throw new MediaStorageConfigurationError();
        const photo = await encodeListingPhoto(req.file.buffer, req.file.mimetype);
        const existing = await prisma.listingMedia.findUnique({ where: { ownerUserId_clientUploadId: { ownerUserId, clientUploadId } } });
        if (existing) {
            if (existing.contentHash !== photo.contentHash) return res.status(409).json({ error: '上傳識別碼已被不同照片使用', errorCode: 'PHOTO_UPLOAD_CONFLICT' });
            return res.json(await prisma.listingMedia.findUnique({ where: { id: existing.id }, select }));
        }
        id = randomUUID();
        const remote = provider === 'flickr' ? await flickrStorage.upload(id, photo.image) : null;
        if (remote) flickrPhotoId = remote.photoId;
        else await storage.write(id, photo.image, photo.thumbnail);
        persisted = true;
        const base = `${getApiUrl().trim().replace(/\/$/, '')}/listing-media/${id}`;
        try {
            const record = await prisma.listingMedia.create({ data: { id, ownerUserId, clientUploadId, contentHash: photo.contentHash,
                width: photo.width, height: photo.height, byteSize: photo.byteSize, imageUrl: `${base}/image`, thumbnailUrl: `${base}/thumbnail`,
                flickrPhotoId, flickrImageUrl: remote?.imageSource, flickrThumbnailUrl: remote?.thumbnailSource }, select });
            return res.status(201).json(record);
        } catch (error) {
            await rollbackUpload(id, flickrPhotoId).catch(() => console.error('Photo rollback cleanup needs retry; details withheld'));
            persisted = false;
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const winner = await prisma.listingMedia.findUnique({ where: { ownerUserId_clientUploadId: { ownerUserId, clientUploadId } } });
                if (winner?.contentHash === photo.contentHash) return res.json(await prisma.listingMedia.findUnique({ where: { id: winner.id }, select }));
                return res.status(409).json({ error: '上傳識別碼已被使用', errorCode: 'PHOTO_UPLOAD_CONFLICT' });
            }
            throw error;
        }
    } catch (error) {
        if (id && error instanceof FlickrOrphanedUpload) {
            await prisma.mediaErasureTask.createMany({ data: [{ mediaId: id, flickrPhotoId: error.photoId }], skipDuplicates: true })
                .catch(() => console.error('Flickr orphan reconciliation needs retry; details withheld'));
        }
        if (id && persisted) {
            await rollbackUpload(id, flickrPhotoId).catch(() => console.error('Photo rollback cleanup needs retry; details withheld'));
        }
        return mediaError(res, error);
    }
}

export async function getListingMedia(req: AuthRequest, res: Response) {
    try {
        const { id, variant } = req.params;
        if (!isListingId(id) || (variant !== 'image' && variant !== 'thumbnail')) return res.status(404).json({ error: '照片不存在' });
        const record = await prisma.listingMedia.findUnique({ where: { id }, select: { ownerUserId: true, wishItemId: true, flickrPhotoId: true,
            flickrImageUrl: true, flickrThumbnailUrl: true, listing: { select: { status: true, expiresAt: true } } } });
        // The opaque URL is shared with EClaw for recognition after attachment.
        const publicAccess = record?.wishItemId != null || (!!record?.listing && isDiscoverable(record.listing.status, record.listing.expiresAt, new Date()));
        if (!record || (!publicAccess && record.ownerUserId !== req.user?.id)) return res.status(404).json({ error: '照片不存在' });
        if (record.flickrPhotoId) {
            const source = variant === 'image' ? record.flickrImageUrl : record.flickrThumbnailUrl;
            if (!source) throw new FlickrMediaUnavailable();
            const bytes = await flickrStorage.read(source, record.flickrPhotoId);
            return res.set({ 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
                'Content-Disposition': 'inline; filename="listing-photo.jpg"' }).send(bytes);
        }
        const file = await storage.open(id, variant as PhotoVariant);
        if (res.destroyed) { await file.close(); return; }
        res.set({ 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="listing-photo.webp"' });
        const stream = file.createReadStream({ autoClose: true });
        stream.on('error', () => {
            if (!res.headersSent && !res.destroyed) { res.removeHeader('Content-Type'); res.status(404).json({ error: '照片不存在' }); }
            else res.destroy();
        });
        res.once('close', () => stream.destroy());
        stream.pipe(res);
    } catch { return res.status(404).json({ error: '照片不存在' }); }
}

export async function getMediaByUploadId(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const clientUploadId = req.params.clientUploadId;
        if (!isListingId(clientUploadId)) return res.status(404).json({ error: '照片不存在' });
        const record = await prisma.listingMedia.findUnique({ where: { ownerUserId_clientUploadId: { ownerUserId: req.user.id, clientUploadId } }, select });
        if (!record) return res.status(404).json({ error: '照片不存在' });
        return res.json(record);
    } catch { return res.status(500).json({ error: '暫時無法確認照片', errorCode: 'PHOTO_LOOKUP_ERROR' }); }
}

export async function deleteUnusedListingMedia(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const id = req.params.id;
        if (!isListingId(id)) return res.status(404).json({ error: '照片不存在或已用於商品' });
        // Atomically prevent deleting an image that a concurrent listing has
        // attached. Only this owner's still-unbound record may be removed.
        const removed = await prisma.$transaction(async tx => {
            const media = await tx.listingMedia.findFirst({ where: { id, ownerUserId: req.user!.id, listingId: null, wishItemId: null }, select: { flickrPhotoId: true } });
            if (!media) return null;
            const deleted = await tx.listingMedia.deleteMany({ where: { id, ownerUserId: req.user!.id, listingId: null, wishItemId: null } });
            if (!deleted.count) return null;
            await tx.mediaErasureTask.create({ data: { mediaId: id, flickrPhotoId: media.flickrPhotoId } });
            return media;
        });
        if (!removed) return res.status(404).json({ error: '照片不存在或已用於商品' });
        if (!removed.flickrPhotoId) await storage.remove(id).then(() => prisma.mediaErasureTask.delete({ where: { mediaId: id } }))
            .catch(() => console.error('Unused private photo cleanup needs retry; details withheld'));
        return res.status(204).send();
    } catch { return res.status(500).json({ error: '暫時無法移除照片', errorCode: 'PHOTO_DELETE_ERROR' }); }
}
