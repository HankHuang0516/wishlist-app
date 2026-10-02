import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import { decodeUserSessionJwt } from './jwtConfig';
import { isListingId, ListingInputError } from './listingRules';

export class ListingCreationError extends Error {
    constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export function listingCreationId(value: unknown) {
    if (!isListingId(value)) throw new ListingInputError('clientListingId');
    return value.toLowerCase();
}
// Recheck auth under the same owner lock used by create/abandon. Authorization
// before a queued request or session revocation is not authoritative anymore.
export async function listingCreationGate(tx: Prisma.TransactionClient, req: AuthRequest, userId: number) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, authVersion: true, apiKey: true, isEmailVerified: true, isPhoneVerified: true } });
    if (!user) throw new ListingCreationError(401, 'LISTING_SESSION_INVALID');
    const key = req.headers['x-api-key'];
    if (key) {
        if (typeof key !== 'string' || user.apiKey !== key) throw new ListingCreationError(401, 'LISTING_SESSION_INVALID');
    } else {
        try {
            const claims = decodeUserSessionJwt(req.headers.authorization?.split(' ')[1] ?? '');
            if (claims.id !== userId || claims.authVersion !== user.authVersion) throw new Error();
        } catch { throw new ListingCreationError(401, 'LISTING_SESSION_INVALID'); }
    }
    return user;
}
export const listingCreationReceiptSelect = {
    clientListingId: true, requestHash: true, state: true, listingId: true, createdAt: true,
} satisfies Prisma.ListingCreateReceiptSelect;
