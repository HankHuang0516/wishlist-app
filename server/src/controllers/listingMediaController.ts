import { removeUnusedMediaTx } from '../lib/privatePhotoRemoval';
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
import { ListingCreationError, listingCreationGate } from '../lib/listingCreation';
import { assertUploadReceipt, compatibleUploadHash, photoUploadHash } from '../lib/photoUploadReceipt';

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
    if (error instanceof ListingCreationError) return res.status(error.status).json({ error: '照片操作需重新安全查核或登入', errorCode: error.code });
    if (error instanceof PhotoInputError) return res.status(error.status).json({ error: error.message, errorCode: 'INVALID_LISTING_PHOTO' });
    if (error instanceof MediaStorageConfigurationError || error instanceof FlickrMediaUnavailable) return res.status(503).json({ error: '商品照片儲存尚未配置，請稍後再試', errorCode: 'PHOTO_STORAGE_UNAVAILABLE' });
    return res.status(500).json({ error: '商品照片暫時無法上傳', errorCode: 'PHOTO_UPLOAD_ERROR' });
}

export async function uploadListingMedia(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    let id: string | undefined;
    let persisted = false;
    let flickrPhotoId: string | undefined;
    try {
        const suppliedUploadId = req.body?.clientUploadId;
        const purposeSpecified = req.body?.capturePurpose !== undefined;
        const capturePurpose = req.body?.capturePurpose ?? 'LEGACY_UNKNOWN';
        if (!isListingId(suppliedUploadId) || typeof capturePurpose !== 'string' ||
            !['LEGACY_UNKNOWN', 'MANUAL_PHOTO', 'BATCH_ITEM'].includes(capturePurpose) ||
            Object.keys(req.body ?? {}).some(k => k !== 'clientUploadId' && k !== 'capturePurpose') || !req.file)
            throw new PhotoInputError('請選擇照片並提供有效的上傳識別碼與用途');
        if (Object.keys(req.query).length) throw new PhotoInputError('照片上傳不可包含額外查詢欄位');
        const clientUploadId = suppliedUploadId.toLowerCase();
        const ownerUserId = req.user.id;
        let requestHash = photoUploadHash(req.file.buffer, capturePurpose);
        const prior = await prisma.$transaction(async tx => {
            await listingCreationGate(tx, req, ownerUserId);
            if (await tx.wishPhotoRemovalReceipt.findUnique({ where: { userId_clientUploadId: { userId: ownerUserId, clientUploadId } } }))
                throw new PhotoInputError('此照片已移除；不會重建原上傳', 409);
            const receipt = await tx.photoUploadReceipt.findUnique({ where: { userId_clientUploadId: { userId: ownerUserId, clientUploadId } } });
            if (receipt) {
                requestHash = compatibleUploadHash(req.file!.buffer, capturePurpose, purposeSpecified, receipt.requestHash);
                assertUploadReceipt(receipt, requestHash);
                const record = await tx.listingMedia.findFirst({ where: { id: receipt.mediaId!, ownerUserId }, select });
                if (!record) throw new PhotoInputError('原照片已移除；不會重建原上傳', 409);
                return { record, legacy: null };
            }
            return { record: null, legacy: await tx.listingMedia.findFirst({ where: { ownerUserId, clientUploadId: { equals: clientUploadId, mode: 'insensitive' } } }) };
        });
        const photo = await encodeListingPhoto(req.file.buffer, req.file.mimetype);
        if (prior.record) return res.json(prior.record);
        if (prior.legacy) {
            if (prior.legacy.contentHash !== photo.contentHash || (purposeSpecified && prior.legacy.capturePurpose !== capturePurpose))
                throw new PhotoInputError('上傳識別碼已被不同照片或用途使用', 409);
            if (!purposeSpecified) requestHash = photoUploadHash(req.file.buffer, prior.legacy.capturePurpose);
            const record = await prisma.$transaction(async tx => {
                await listingCreationGate(tx, req, ownerUserId);
                const receipt = await tx.photoUploadReceipt.findUnique({ where: { userId_clientUploadId: { userId: ownerUserId, clientUploadId } } });
                if (receipt) assertUploadReceipt(receipt, requestHash);
                await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ListingMedia" WHERE "id" = ${prior.legacy!.id} FOR UPDATE`);
                const existing = await tx.listingMedia.findFirst({ where: { id: prior.legacy!.id, ownerUserId, contentHash: photo.contentHash,
                    ...(purposeSpecified ? { capturePurpose: capturePurpose as 'LEGACY_UNKNOWN' | 'MANUAL_PHOTO' | 'BATCH_ITEM' } : {}) }, select });
                if (!existing || receipt && receipt.mediaId !== existing.id) throw new PhotoInputError('原照片已變更或移除；請先查核', 409);
                if (!receipt) await tx.photoUploadReceipt.create({ data: { userId: ownerUserId, clientUploadId, requestHash, state: 'STORED', mediaId: existing.id } });
                return existing;
            });
            return res.json(record);
        }
        const provider = uploadProvider(ownerUserId);
        if (provider === 'flickr') await flickrStorage.ready();
        else if (provider === 'local') await storage.ready();
        else throw new MediaStorageConfigurationError();
        id = randomUUID();
        const remote = provider === 'flickr' ? await flickrStorage.upload(id, photo.image) : null;
        if (remote) flickrPhotoId = remote.photoId;
        else await storage.write(id, photo.image, photo.thumbnail);
        persisted = true;
        const base = `${getApiUrl().trim().replace(/\/$/, '')}/listing-media/${id}`;
        try {
            const record = await prisma.$transaction(async tx => {
                await listingCreationGate(tx, req, ownerUserId);
                const receipt = await tx.photoUploadReceipt.findUnique({ where: { userId_clientUploadId: { userId: ownerUserId, clientUploadId } } });
                if (receipt) {
                    requestHash = compatibleUploadHash(req.file!.buffer, capturePurpose, purposeSpecified, receipt.requestHash);
                    assertUploadReceipt(receipt, requestHash);
                    const winner = await tx.listingMedia.findFirst({ where: { id: receipt.mediaId!, ownerUserId }, select });
                    if (!winner) throw new PhotoInputError('原照片已移除；不會重建原上傳', 409);
                    return { media: winner, created: false };
                }
                // Re-check under the same removal/erasure gate AFTER provider
                // upload. A racing removal cannot resurrect this upload ID.
                if (await tx.wishPhotoRemovalReceipt.findUnique({ where: { userId_clientUploadId: { userId: ownerUserId, clientUploadId: clientUploadId.toLowerCase() } } }))
                    throw new PhotoInputError('此照片已移除；不會重建原上傳', 409);
                const media = await tx.listingMedia.create({ data: { id, ownerUserId, clientUploadId, contentHash: photo.contentHash,
                    capturePurpose: capturePurpose as 'LEGACY_UNKNOWN' | 'MANUAL_PHOTO' | 'BATCH_ITEM',
                    width: photo.width, height: photo.height, byteSize: photo.byteSize, imageUrl: `${base}/image`, thumbnailUrl: `${base}/thumbnail`,
                    flickrPhotoId, flickrImageUrl: remote?.imageSource, flickrThumbnailUrl: remote?.thumbnailSource }, select });
                await tx.photoUploadReceipt.create({ data: { userId: ownerUserId, clientUploadId, requestHash, state: 'STORED', mediaId: media.id } });
                return { media, created: true };
            });
            if (!record.created) { await rollbackUpload(id, flickrPhotoId); persisted = false; }
            return res.status(record.created ? 201 : 200).json(record.media);
        } catch (error) {
            await rollbackUpload(id, flickrPhotoId).catch(() => console.error('Photo rollback cleanup needs retry; details withheld'));
            persisted = false;
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
        const record = await prisma.listingMedia.findUnique({ where: { id }, select: { ownerUserId: true, wishItemId: true,
            capturePurpose: true, marketingSelected: true, aiDraftStatus: true, flickrPhotoId: true,
            flickrImageUrl: true, flickrThumbnailUrl: true, listing: { select: { status: true, expiresAt: true } },
            marketingJobsAsSource: { where: { status: 'PROCESSING' }, select: { id: true }, take: 1 } } });
        // The opaque URL is shared with EClaw for recognition after attachment.
        const publicAccess = (record?.capturePurpose !== 'AI_MARKETING' || record.marketingSelected) &&
            (record?.wishItemId != null || (!!record?.listing && isDiscoverable(record.listing.status, record.listing.expiresAt, new Date())));
        const workerAccess = variant === 'image' && record?.aiDraftStatus === 'PROCESSING' &&
            listingAiEnabledFor(record.ownerUserId) && isMinimaxWorker(req.headers.authorization);
        const marketingWorkerAccess = variant === 'image' && !!record?.marketingJobsAsSource.length && isMinimaxWorker(req.headers.authorization);
        if (!record || (!publicAccess && record.ownerUserId !== req.user?.id && !workerAccess && !marketingWorkerAccess)) return res.status(404).json({ error: '照片不存在' });
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
export function getListingAiAvailability(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ available: listingAiEnabledFor(req.user.id) });
}
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
        const userId = req.user.id, mediaId = req.params.id;
        await prisma.$transaction(async tx => {
            await listingCreationGate(tx, req, userId);
            await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ListingMedia" WHERE "id" = ${mediaId} FOR UPDATE`);
            const where = { id: mediaId, ownerUserId: userId, listingId: null, wishItemId: null, capturePurpose: { not: 'AI_MARKETING' as const } };
            const existing = await tx.listingMedia.findFirst({ where, select: { sellerDraftVersion: true } });
            if (!existing) throw new ListingCreationError(404, 'SELLER_DRAFT_MEDIA_UNAVAILABLE');
            if (existing.sellerDraftVersion !== req.body.expectedVersion) throw new ListingCreationError(409, 'SELLER_DRAFT_CONFLICT');
            await tx.listingMedia.update({ where: { id: mediaId }, data: { sellerDraft: draft, sellerDraftVersion: { increment: 1 } } });
        });
        return res.json({ mediaId: req.params.id, version: req.body.expectedVersion + 1 });
    } catch (error) {
        if (error instanceof ListingSellerDraftError) return res.status(400).json({ error: error.message, errorCode: 'INVALID_SELLER_DRAFT' });
        if (error instanceof ListingCreationError) return res.status(error.status).json({ error: '私人草稿需重新核對', errorCode: error.code });
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
            capturePurpose: { not: 'AI_MARKETING' },
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
        const removed = await prisma.$transaction(async tx => {
            await listingCreationGate(tx,req,req.user!.id);
            const result = await removeUnusedMediaTx(tx,req.user!.id,id.toLowerCase());
            return result.state === 'REMOVED';
        });
        if (!removed) return res.status(404).json({ error: '照片不存在或已用於商品' });
        // Keep legacy immediate local cleanup, while all provider tasks remain
        // durable for the existing erasure worker.
        const task = await prisma.mediaErasureTask.findUnique({where:{mediaId:id.toLowerCase()}});
        if (task && !task.flickrPhotoId) await storage.remove(id.toLowerCase()).then(() => prisma.mediaErasureTask.deleteMany({where:{mediaId:id.toLowerCase()}}))
            .catch(() => console.error('Unused private photo cleanup needs retry; details withheld'));
        return res.status(204).send();
    } catch(error) { return res.status(error instanceof ListingCreationError ? error.status : 500).json({ error: '暫時無法移除照片', errorCode: 'PHOTO_DELETE_ERROR' }); }
}
