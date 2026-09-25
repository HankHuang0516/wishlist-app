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
import { isMinimaxWorker, listingAiEnabledFor } from '../lib/minimaxWorkerAuth';
import { ListingSellerDraftError, parseListingSellerDraft } from '../lib/listingSellerDraft';

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
        const purposeSpecified = req.body?.capturePurpose !== undefined;
        const capturePurpose = req.body?.capturePurpose ?? 'LEGACY_UNKNOWN';
        if (!isListingId(clientUploadId) || typeof capturePurpose !== 'string' ||
            !['LEGACY_UNKNOWN', 'MANUAL_PHOTO', 'BATCH_ITEM'].includes(capturePurpose) ||
            Object.keys(req.body ?? {}).some(k => k !== 'clientUploadId' && k !== 'capturePurpose') || !req.file)
            throw new PhotoInputError('請選擇照片並提供有效的上傳識別碼與用途');
        const ownerUserId = req.user.id;
        if (!await prisma.user.findUnique({ where: { id: ownerUserId }, select: { id: true } })) return res.status(401).json({ error: '帳號已失效' });
        const provider = uploadProvider(ownerUserId);
        if (provider === 'flickr') await flickrStorage.ready();
        else if (provider === 'local') await storage.ready();
        else throw new MediaStorageConfigurationError();
        const photo = await encodeListingPhoto(req.file.buffer, req.file.mimetype);
        const existing = await prisma.listingMedia.findUnique({ where: { ownerUserId_clientUploadId: { ownerUserId, clientUploadId } } });
        if (existing) {
            if (existing.contentHash !== photo.contentHash || (purposeSpecified && existing.capturePurpose !== capturePurpose))
                return res.status(409).json({ error: '上傳識別碼已被不同照片或用途使用', errorCode: 'PHOTO_UPLOAD_CONFLICT' });
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
                capturePurpose: capturePurpose as 'LEGACY_UNKNOWN' | 'MANUAL_PHOTO' | 'BATCH_ITEM',
                width: photo.width, height: photo.height, byteSize: photo.byteSize, imageUrl: `${base}/image`, thumbnailUrl: `${base}/thumbnail`,
                flickrPhotoId, flickrImageUrl: remote?.imageSource, flickrThumbnailUrl: remote?.thumbnailSource }, select });
            return res.status(201).json(record);
        } catch (error) {
            await rollbackUpload(id, flickrPhotoId).catch(() => console.error('Photo rollback cleanup needs retry; details withheld'));
            persisted = false;
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const winner = await prisma.listingMedia.findUnique({ where: { ownerUserId_clientUploadId: { ownerUserId, clientUploadId } } });
                if (winner?.contentHash === photo.contentHash && (!purposeSpecified || winner.capturePurpose === capturePurpose))
                    return res.json(await prisma.listingMedia.findUnique({ where: { id: winner.id }, select }));
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
        const record = await prisma.listingMedia.findUnique({ where: { id }, select: { ownerUserId: true, wishItemId: true, aiDraftStatus: true, flickrPhotoId: true,
            flickrImageUrl: true, flickrThumbnailUrl: true, listing: { select: { status: true, expiresAt: true } } } });
        // The opaque URL is shared with EClaw for recognition after attachment.
        const publicAccess = record?.wishItemId != null || (!!record?.listing && isDiscoverable(record.listing.status, record.listing.expiresAt, new Date()));
        const workerAccess = variant === 'image' && record?.aiDraftStatus === 'PROCESSING' &&
            listingAiEnabledFor(record.ownerUserId) && isMinimaxWorker(req.headers.authorization);
        if (!record || (!publicAccess && record.ownerUserId !== req.user?.id && !workerAccess)) return res.status(404).json({ error: '照片不存在' });
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

const aiDraftSelect = { id: true, aiDraftStatus: true, aiDraft: true, aiDraftUpdatedAt: true, aiDraftAttempts: true } satisfies Prisma.ListingMediaSelect;
function aiDraftResponse(record: { id: string; aiDraftStatus: string; aiDraft: Prisma.JsonValue | null; aiDraftUpdatedAt: Date | null }) {
    return { mediaId: record.id, status: record.aiDraftStatus, draft: record.aiDraftStatus === 'COMPLETED' ? record.aiDraft : null,
        updatedAt: record.aiDraftUpdatedAt };
}

export async function requestListingAiDraft(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.setHeader('Cache-Control', 'private, no-store');
    if (!isListingId(req.params.id)) return res.status(404).json({ error: '照片不存在' });
    try {
        const where = { id: req.params.id, ownerUserId: req.user.id, listingId: null, wishItemId: null };
        const record = await prisma.listingMedia.findFirst({ where, select: aiDraftSelect });
        if (!record) return res.status(404).json({ error: '照片不存在或已被使用' });
        if (!listingAiEnabledFor(req.user.id)) return res.status(503).json({ error: '照片 AI 刊登暫未開放此帳號', errorCode: 'LISTING_AI_UNAVAILABLE' });
        if (record.aiDraftStatus === 'COMPLETED' || record.aiDraftStatus === 'PENDING' || record.aiDraftStatus === 'PROCESSING') return res.json(aiDraftResponse(record));
        if (record.aiDraftAttempts >= 3) return res.status(429).json({ error: '此照片已達辨識重試上限', errorCode: 'LISTING_AI_RETRY_LIMIT' });
        await prisma.listingMedia.updateMany({ where: { ...where, aiDraftStatus: record.aiDraftStatus, aiDraftAttempts: { lt: 3 } },
            data: { aiDraftStatus: 'PENDING', aiDraft: Prisma.DbNull, aiDraftError: null, aiDraftJobId: null,
                aiDraftAttempts: { increment: 1 }, aiDraftUpdatedAt: new Date() } });
        const updated = await prisma.listingMedia.findFirst({ where, select: aiDraftSelect });
        return updated ? res.status(202).json(aiDraftResponse(updated)) : res.status(404).json({ error: '照片不存在' });
    } catch { return res.status(503).json({ error: '照片辨識暫時無法排隊', errorCode: 'LISTING_AI_QUEUE_UNAVAILABLE' }); }
}

export async function getListingAiDraft(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.setHeader('Cache-Control', 'private, no-store');
    if (!isListingId(req.params.id)) return res.status(404).json({ error: '照片不存在' });
    try {
        const record = await prisma.listingMedia.findFirst({ where: { id: req.params.id, ownerUserId: req.user.id }, select: aiDraftSelect });
        return record ? res.json(aiDraftResponse(record)) : res.status(404).json({ error: '照片不存在' });
    } catch { return res.status(503).json({ error: '照片辨識狀態暫時無法讀取', errorCode: 'LISTING_AI_STATUS_UNAVAILABLE' }); }
}

export async function saveListingSellerDraft(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.setHeader('Cache-Control', 'private, no-store');
    if (!isListingId(req.params.id)) return res.status(404).json({ error: '私人商品草稿不存在' });
    try {
        if (!req.body || Object.keys(req.body).sort().join(',') !== 'draft,expectedVersion' ||
            !Number.isSafeInteger(req.body.expectedVersion) || req.body.expectedVersion < 0 || req.body.expectedVersion > 1_000_000)
            throw new ListingSellerDraftError();
        const draft = parseListingSellerDraft(req.body.draft);
        const where = { id: req.params.id, ownerUserId: req.user.id, listingId: null, wishItemId: null };
        const changed = await prisma.listingMedia.updateMany({ where: { ...where, sellerDraftVersion: req.body.expectedVersion },
            data: { sellerDraft: draft, sellerDraftVersion: { increment: 1 } } });
        if (!changed.count) {
            const existing = await prisma.listingMedia.findFirst({ where, select: { sellerDraftVersion: true } });
            return existing ? res.status(409).json({ error: '草稿已在其他地方更新，請重新開啟檢查', errorCode: 'SELLER_DRAFT_CONFLICT' }) :
                res.status(404).json({ error: '私人商品草稿不存在' });
        }
        return res.json({ mediaId: req.params.id, version: req.body.expectedVersion + 1 });
    } catch (error) {
        if (error instanceof ListingSellerDraftError) return res.status(400).json({ error: error.message, errorCode: 'INVALID_SELLER_DRAFT' });
        return res.status(503).json({ error: '私人商品草稿暫時無法儲存', errorCode: 'SELLER_DRAFT_UNAVAILABLE' });
    }
}

export async function myUnusedListingMedia(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.setHeader('Cache-Control', 'private, no-store');
    try {
        const purpose = req.query.purpose;
        const cursor = req.query.cursor;
        if (Object.keys(req.query).some(key => key !== 'purpose' && key !== 'cursor') ||
            (cursor !== undefined && (typeof cursor !== 'string' || !isListingId(cursor))))
            return res.status(400).json({ error: '私人照片分頁識別碼不正確', errorCode: 'INVALID_MEDIA_CURSOR' });
        if (purpose !== undefined && (typeof purpose !== 'string' ||
            !['LEGACY_UNKNOWN', 'MANUAL_PHOTO', 'BATCH_ITEM'].includes(purpose)))
            return res.status(400).json({ error: '照片用途不正確', errorCode: 'INVALID_MEDIA_PURPOSE' });
        const base: Prisma.ListingMediaWhereInput = { ownerUserId: req.user.id, listingId: null, wishItemId: null,
            // Explicit batch drafts remain recoverable until the owner links
            // or removes them. A 30-day listing expiry is not draft deletion.
            ...(purpose === 'BATCH_ITEM' ? {} : { createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }),
            ...(purpose ? { capturePurpose: purpose as 'LEGACY_UNKNOWN' | 'MANUAL_PHOTO' | 'BATCH_ITEM' } : {}) };
        const anchor = cursor ? await prisma.listingMedia.findFirst({ where: { ...base, id: cursor },
            select: { id: true, createdAt: true } }) : null;
        if (cursor && !anchor) return res.status(400).json({ error: '私人照片分頁已失效', errorCode: 'INVALID_MEDIA_CURSOR' });
        const records = await prisma.listingMedia.findMany({ where: { ...base,
            ...(anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}) },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31,
            select: { ...select, clientUploadId: true, ...aiDraftSelect, sellerDraft: true, sellerDraftVersion: true } });
        const page = records.slice(0, 30);
        return res.json({ items: page.map(record => ({ ...record, aiDraft: record.aiDraftStatus === 'COMPLETED' ? record.aiDraft : null })),
            nextCursor: records.length > 30 ? page[29].id : null });
    } catch { return res.status(503).json({ error: '暫時無法恢復未刊登照片', errorCode: 'PHOTO_RECOVERY_UNAVAILABLE' }); }
}

// An older upload has no trustworthy workflow tag. Only its owner may
// explicitly adopt it as one batch item; never infer this from a photo alone.
export async function adoptLegacyBatchPhoto(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.setHeader('Cache-Control', 'private, no-store');
    if (!isListingId(req.params.id)) return res.status(404).json({ error: '未分類照片不存在' });
    if (!req.body || Object.keys(req.body).join(',') !== 'capturePurpose' || req.body.capturePurpose !== 'BATCH_ITEM')
        return res.status(400).json({ error: '只能明確選擇加入批次商品', errorCode: 'INVALID_MEDIA_PURPOSE' });
    try {
        const changed = await prisma.listingMedia.updateMany({ where: { id: req.params.id, ownerUserId: req.user.id,
            capturePurpose: 'LEGACY_UNKNOWN', listingId: null, wishItemId: null, aiDraftStatus: 'SKIPPED', sellerDraft: { equals: Prisma.DbNull } },
            data: { capturePurpose: 'BATCH_ITEM' } });
        return changed.count ? res.json({ mediaId: req.params.id, capturePurpose: 'BATCH_ITEM' }) :
            res.status(404).json({ error: '未分類照片不存在或已被使用' });
    } catch { return res.status(503).json({ error: '照片暫時無法加入批次', errorCode: 'MEDIA_ADOPTION_UNAVAILABLE' }); }
}

export async function getMediaByUploadId(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const clientUploadId = req.params.clientUploadId;
        if (!isListingId(clientUploadId)) return res.status(404).json({ error: '照片不存在' });
        const record = await prisma.listingMedia.findUnique({ where: { ownerUserId_clientUploadId: { ownerUserId: req.user.id, clientUploadId } },
            select: { ...select, listingId: true, wishItemId: true } });
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
