import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { isListingId } from '../lib/listingRules';
import { NativeWishError } from '../lib/nativeWishRules';

type Tx = Prisma.TransactionClient;
type Receipt = { clientUploadId: string; mediaId: string; removedAt: Date };
function uploadIdentity(req: AuthRequest) {
    const id = req.params.clientUploadId;
    if (!isListingId(id) || Object.keys(req.query).length) throw new NativeWishError(400);
    return id.toLowerCase();
}
async function projection(tx: Tx, receipt: Receipt) {
    return { clientUploadId: receipt.clientUploadId, mediaId: receipt.mediaId, removed: true,
        removedAt: receipt.removedAt.toISOString(), cleanupPending: await tx.mediaErasureTask.count({ where: { mediaId: receipt.mediaId } }) > 0 };
}
function endpoint(action: (req: AuthRequest, userId: number) => Promise<unknown>) {
    return async (req: AuthRequest, res: Response) => {
        res.setHeader('Cache-Control', 'private, no-store');
        if (!req.user?.id) return res.status(401).json({ error: '請先登入' });
        try { return res.json(await action(req, req.user.id)); }
        catch (failure) {
            if (failure instanceof NativeWishError) return res.status(failure.status).json({ error: '照片移除未通過確認', errorCode: 'WISH_PHOTO_REMOVAL_REJECTED' });
            console.error('Wish photo removal unavailable; identities and database details withheld');
            return res.status(503).json({ error: '暫時無法確認照片移除', errorCode: 'WISH_PHOTO_REMOVAL_UNAVAILABLE' });
        }
    };
}
export const getWishPhotoRemoval = endpoint(async (req, userId) => {
    const clientUploadId = uploadIdentity(req);
    return prisma.$transaction(async tx => {
        const receipt = await tx.wishPhotoRemovalReceipt.findUnique({ where: { userId_clientUploadId: { userId, clientUploadId } } });
        if (!receipt) throw new NativeWishError(404);
        return projection(tx, receipt);
    }, { isolationLevel: 'RepeatableRead' });
});
export const removeUnusedWishPhoto = endpoint(async (req, userId) => {
    const clientUploadId = uploadIdentity(req);
    if (!req.body || Object.keys(req.body).join(',') !== 'mediaId' || !isListingId(req.body.mediaId)) throw new NativeWishError(400);
    const mediaId = req.body.mediaId.toLowerCase();
    return prisma.$transaction(async tx => {
        // Same user gate/order as native wish creates. Prevent account erasure,
        // concurrent attachment and late upload creation from missing the receipt.
        const owners = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`);
        if (!owners.length) throw new NativeWishError(401);
        const prior = await tx.wishPhotoRemovalReceipt.findUnique({ where: { userId_clientUploadId: { userId, clientUploadId } } });
        if (prior) { if (prior.mediaId !== mediaId) throw new NativeWishError(409); return projection(tx, prior); }
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ListingMedia" WHERE "id" = ${mediaId} FOR UPDATE`);
        const media = await tx.listingMedia.findFirst({ where: { id: mediaId, ownerUserId: userId },
            select: { clientUploadId: true, listingId: true, wishItemId: true, capturePurpose: true, sellerDraft: true, aiDraftStatus: true, flickrPhotoId: true,
                marketingJobsAsSource: { select: { id: true }, take: 1 } } });
        if (!media || media.clientUploadId?.toLowerCase() !== clientUploadId) throw new NativeWishError(404);
        // This operation removes only an unused wish photo, never a seller draft,
        // a marketing source/output, another owner, or an attached listing/wish.
        if (media.listingId !== null || media.wishItemId !== null || media.capturePurpose !== 'MANUAL_PHOTO' ||
            media.sellerDraft !== null || media.aiDraftStatus !== 'SKIPPED' || media.marketingJobsAsSource.length) throw new NativeWishError(409);
        await tx.mediaErasureTask.create({ data: { mediaId, flickrPhotoId: media.flickrPhotoId } });
        await tx.listingMedia.delete({ where: { id: mediaId } });
        const receipt = await tx.wishPhotoRemovalReceipt.create({ data: { userId, clientUploadId, mediaId } });
        return projection(tx, receipt);
    });
});
