import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { listingCreationGate, ListingCreationError } from '../lib/listingCreation';
import { ListingInputError } from '../lib/listingRules';
import { managementAbandonBody, managementBody, managementHash, managementId } from '../lib/listingManagementOperation';
import { applyListingEdit, applyListingExtension, applyListingStatus, ListingConflict, ListingForbidden } from './listingController';

const select = { clientActionId: true, listingId: true, kind: true, expectedVersion: true, requestHash: true, state: true, reason: true, appliedVersion: true, createdAt: true } satisfies Prisma.ListingManagementReceiptSelect;
const endpoint = (action: (req: AuthRequest, userId: number, clientActionId: string) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ errorCode: 'MISSING_TOKEN' });
    try {
        if (Object.keys(req.query).length) throw new ListingInputError('query');
        return res.json(await action(req, req.user.id, managementId(req.params.clientActionId)));
    } catch (error) {
        const status = error instanceof ListingCreationError ? error.status : error instanceof ListingInputError ? 400 : 503;
        return res.status(status).json({ error: '原商品操作仍需查核', errorCode: error instanceof ListingCreationError ? error.code : error instanceof ListingInputError ? 'INVALID_LISTING_INPUT' : 'MANAGEMENT_UNAVAILABLE' });
    }
};
export const readListingManagement = endpoint(async (req, userId, clientActionId) => prisma.$transaction(async tx => {
    await listingCreationGate(tx, req, userId);
    const receipt = await tx.listingManagementReceipt.findUnique({ where: { userId_clientActionId: { userId, clientActionId } }, select });
    if (!receipt) throw new ListingCreationError(404, 'MANAGEMENT_NOT_FOUND');
    return { receipt };
}));
export const submitListingManagement = endpoint(async (req, userId, clientActionId) => {
    const body = managementBody(req.body), requestHash = managementHash(body);
    return prisma.$transaction(async tx => {
        await listingCreationGate(tx, req, userId);
        const prior = await tx.listingManagementReceipt.findUnique({ where: { userId_clientActionId: { userId, clientActionId } }, select });
        if (prior) {
            if (prior.requestHash !== requestHash) throw new ListingCreationError(409, 'MANAGEMENT_REQUEST_CONFLICT');
            return { receipt: prior };
        }
        if (!await tx.listing.findFirst({ where: { id: body.listingId, ownerUserId: userId }, select: { id: true } })) throw new ListingCreationError(404, 'MANAGEMENT_LISTING_NOT_FOUND');
        let state = 'APPLIED', reason: string | null = null, appliedVersion: number | null = null;
        await tx.$executeRawUnsafe('SAVEPOINT listing_management');
        try {
            const changes = { ...body.changes, expectedVersion: body.expectedVersion };
            const result = body.kind === 'EDIT' ? await applyListingEdit(tx, userId, body.listingId, changes)
                : body.kind === 'EXTEND' ? await applyListingExtension(tx, userId, body.listingId, changes)
                : await applyListingStatus(tx, userId, body.listingId, changes);
            appliedVersion = result.version;
        } catch (error) {
            if (!(error instanceof ListingConflict || error instanceof ListingInputError || error instanceof ListingForbidden)) throw error;
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT listing_management');
            state = 'CONFLICT'; reason = error instanceof ListingConflict ? 'LISTING_CONFLICT' : error instanceof ListingInputError ? 'INVALID_LISTING_INPUT' : 'LISTING_ACCESS_DENIED';
        }
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT listing_management');
        return { receipt: await tx.listingManagementReceipt.create({ data: { userId, clientActionId, listingId: body.listingId, kind: body.kind, expectedVersion: body.expectedVersion, requestHash, state, reason, appliedVersion }, select }) };
    });
});
export const abandonListingManagement = endpoint(async (req, userId, clientActionId) => {
    const body = managementAbandonBody(req.body);
    return prisma.$transaction(async tx => {
        await listingCreationGate(tx, req, userId);
        const prior = await tx.listingManagementReceipt.findUnique({ where: { userId_clientActionId: { userId, clientActionId } }, select });
        if (prior) {
            if (prior.requestHash !== body.requestHash || prior.kind !== body.kind || prior.listingId !== body.listingId || prior.expectedVersion !== body.expectedVersion) throw new ListingCreationError(409, 'MANAGEMENT_REQUEST_CONFLICT');
            return { receipt: prior };
        }
        // Tombstone also works after the owner's listing was deleted elsewhere.
        // No listing metadata or mutation is returned by this hash-only action.
        return { receipt: await tx.listingManagementReceipt.create({ data: { ...body, userId, clientActionId, state: 'ABANDONED' }, select }) };
    });
});
