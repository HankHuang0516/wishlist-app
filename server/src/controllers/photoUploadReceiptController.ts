import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { ListingCreationError, listingCreationGate, listingCreationId } from '../lib/listingCreation';
import { ListingInputError } from '../lib/listingRules';
import { photoUploadReceiptSelect, uploadedPhotoSelect } from '../lib/photoUploadReceipt';

type Receipt = Prisma.PhotoUploadReceiptGetPayload<{ select: typeof photoUploadReceiptSelect }>;
async function envelope(tx: Prisma.TransactionClient, userId: number, receipt: Receipt) {
    return { receipt, media: receipt.mediaId ? await tx.listingMedia.findFirst({
        where: { id: receipt.mediaId, ownerUserId: userId }, select: uploadedPhotoSelect,
    }) : null };
}
function endpoint(abandon: boolean) {
    return async (req: AuthRequest, res: Response) => {
        res.setHeader('Cache-Control', 'private, no-store');
        if (!req.user) return res.status(401).json({ errorCode: 'MISSING_TOKEN' });
        try {
            const userId = req.user.id, clientUploadId = listingCreationId(req.params.clientUploadId);
            if (Object.keys(req.query).length) throw new ListingInputError('query');
            if (abandon && (!req.body || Array.isArray(req.body) || Object.keys(req.body).join(',') !== 'requestHash' ||
                typeof req.body.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.requestHash))) throw new ListingInputError('requestHash');
            const result = await prisma.$transaction(async tx => {
                await listingCreationGate(tx, req, userId);
                let receipt = await tx.photoUploadReceipt.findUnique({ where: { userId_clientUploadId: { userId, clientUploadId } }, select: photoUploadReceiptSelect });
                if (abandon) {
                    if (receipt && receipt.requestHash !== req.body.requestHash) throw new ListingCreationError(409, 'PHOTO_UPLOAD_CONFLICT');
                    // A legacy row has no source hash. Do not tombstone a real
                    // upload as if it had never happened, or infer its purpose.
                    if (!receipt && await tx.listingMedia.findFirst({ where: { ownerUserId: userId, clientUploadId: { equals: clientUploadId, mode: 'insensitive' } }, select: { id: true } }))
                        throw new ListingCreationError(409, 'PHOTO_LEGACY_UPLOAD_UNVERIFIED');
                    receipt ??= await tx.photoUploadReceipt.create({ data: { userId, clientUploadId, requestHash: req.body.requestHash, state: 'ABANDONED' }, select: photoUploadReceiptSelect });
                }
                if (!receipt) throw new ListingCreationError(404, 'PHOTO_UPLOAD_RECEIPT_NOT_FOUND');
                return envelope(tx, userId, receipt);
            });
            return res.json(result);
        } catch (error) {
            const status = error instanceof ListingCreationError ? error.status : error instanceof ListingInputError ? 400 : 503;
            return res.status(status).json({ error: '照片原操作仍需安全查核', errorCode: error instanceof ListingCreationError ? error.code : 'PHOTO_UPLOAD_RECEIPT_UNAVAILABLE' });
        }
    };
}
export const getPhotoUploadReceipt = endpoint(false);
export const abandonPhotoUpload = endpoint(true);
