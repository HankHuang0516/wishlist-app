import { Response } from 'express';
import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { listingCreationGate, listingCreationId, ListingCreationError } from '../lib/listingCreation';
import { ListingInputError } from '../lib/listingRules';
import { ListingSellerDraftError } from '../lib/listingSellerDraft';
import { sellerDraftHash, sellerDraftMediaSelect, sellerDraftPayload, sellerDraftReceiptSelect } from '../lib/sellerDraftOperation';

type Receipt = Prisma.SellerDraftReceiptGetPayload<{ select: typeof sellerDraftReceiptSelect }>;
const endpoint = (action: (req: AuthRequest, userId: number) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ errorCode: 'MISSING_TOKEN' });
    try {
        if (Object.keys(req.query).length) throw new ListingSellerDraftError();
        return res.json(await action(req, req.user.id));
    } catch (error) {
        const status = error instanceof ListingCreationError ? error.status : error instanceof ListingInputError || error instanceof ListingSellerDraftError ? 400 : 503;
        return res.status(status).json({ error: '私人草稿原操作仍需查核', errorCode: error instanceof ListingCreationError ? error.code : 'SELLER_DRAFT_OPERATION_UNAVAILABLE' });
    }
};
async function envelope(tx: Prisma.TransactionClient, userId: number, receipt: Receipt) {
    return { receipt, media: await tx.listingMedia.findFirst({ where: { id: receipt.mediaId, ownerUserId: userId }, select: sellerDraftMediaSelect }) };
}
async function mediaLock(tx: Prisma.TransactionClient, mediaId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ListingMedia" WHERE "id" = ${mediaId} FOR UPDATE`);
}
export const readSellerDraftOperation = endpoint(async (req, userId) => {
    const clientActionId = listingCreationId(req.params.clientActionId);
    return prisma.$transaction(async tx => {
        await listingCreationGate(tx, req, userId);
        const receipt = await tx.sellerDraftReceipt.findUnique({ where: { userId_clientActionId: { userId, clientActionId } }, select: sellerDraftReceiptSelect });
        if (!receipt) throw new ListingCreationError(404, 'SELLER_DRAFT_RECEIPT_NOT_FOUND');
        return envelope(tx, userId, receipt);
    });
});
export const submitSellerDraftOperation = endpoint(async (req, userId) => {
    const clientActionId = listingCreationId(req.params.clientActionId), mediaId = listingCreationId(req.params.id);
    const payload = sellerDraftPayload(req.body), requestHash = sellerDraftHash(mediaId, payload);
    return prisma.$transaction(async tx => {
        await listingCreationGate(tx, req, userId);
        const prior = await tx.sellerDraftReceipt.findUnique({ where: { userId_clientActionId: { userId, clientActionId } }, select: sellerDraftReceiptSelect });
        if (prior) {
            if (prior.requestHash !== requestHash || prior.mediaId !== mediaId) throw new ListingCreationError(409, 'SELLER_DRAFT_OPERATION_CONFLICT');
            return envelope(tx, userId, prior);
        }
        await mediaLock(tx, mediaId);
        const media = await tx.listingMedia.findFirst({ where: { id: mediaId, ownerUserId: userId, listingId: null, wishItemId: null, capturePurpose: { not: 'AI_MARKETING' } }, select: { sellerDraftVersion: true } });
        if (!media) throw new ListingCreationError(404, 'SELLER_DRAFT_MEDIA_UNAVAILABLE');
        const conflict = media.sellerDraftVersion !== payload.expectedVersion;
        if (!conflict) await tx.listingMedia.update({ where: { id: mediaId }, data: { sellerDraft: payload.draft, sellerDraftVersion: { increment: 1 } } });
        const receipt = await tx.sellerDraftReceipt.create({ data: { userId, clientActionId, mediaId, requestHash, state: conflict ? 'CONFLICT' : 'APPLIED', appliedVersion: conflict ? null : payload.expectedVersion + 1 }, select: sellerDraftReceiptSelect });
        return envelope(tx, userId, receipt);
    });
});
export const abandonSellerDraftOperation = endpoint(async (req, userId) => {
    const clientActionId = listingCreationId(req.params.clientActionId), mediaId = listingCreationId(req.params.id);
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).join(',') !== 'requestHash' || typeof req.body.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.requestHash)) throw new ListingSellerDraftError();
    return prisma.$transaction(async tx => {
        await listingCreationGate(tx, req, userId);
        const prior = await tx.sellerDraftReceipt.findUnique({ where: { userId_clientActionId: { userId, clientActionId } }, select: sellerDraftReceiptSelect });
        if (prior) {
            if (prior.mediaId !== mediaId || prior.requestHash !== req.body.requestHash) throw new ListingCreationError(409, 'SELLER_DRAFT_OPERATION_CONFLICT');
            return envelope(tx, userId, prior);
        }
        // Only owners of a live unused photo can establish a new cancellation.
        // A late save with the same ID/hash is fenced even after photo deletion.
        await mediaLock(tx, mediaId);
        if (!await tx.listingMedia.findFirst({ where: { id: mediaId, ownerUserId: userId, listingId: null, wishItemId: null, capturePurpose: { not: 'AI_MARKETING' } }, select: { id: true } })) throw new ListingCreationError(404, 'SELLER_DRAFT_MEDIA_UNAVAILABLE');
        return envelope(tx, userId, await tx.sellerDraftReceipt.create({ data: { userId, clientActionId, mediaId, requestHash: req.body.requestHash, state: 'ABANDONED' }, select: sellerDraftReceiptSelect }));
    });
});
