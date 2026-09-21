import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { API_ERROR_CODES } from '../lib/errorCodes';
import { DEFAULT_CURRENCY } from '../lib/matchmakingPrice';
import { authorizeWishItemPatch, parseWishItemPatch, WishItemUpdateError } from '../lib/wishItemUpdate';

export async function updateItem(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    const userId = req.user?.id, id = Number(req.params.id);
    if (!userId) return res.status(401).json({ error: 'Authentication required', errorCode: API_ERROR_CODES.MISSING_TOKEN });
    if (!/^[1-9]\d{0,9}$/.test(String(req.params.id)) || !Number.isSafeInteger(id) || id > 2147483647) return res.status(400).json({ error: 'Invalid item ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
    try {
        const patch = parseWishItemPatch(req.body);
        const result = await prisma.$transaction(async tx => {
            // Lock parent then item: visibility changes/deletion and concurrent
            // gift claims cannot invalidate a permission check before commit.
            await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Wishlist" WHERE "id" = (SELECT "wishlistId" FROM "Item" WHERE "id" = ${id}) FOR UPDATE`);
            await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Item" WHERE "id" = ${id} FOR UPDATE`);
            const item = await tx.item.findUnique({ where: { id }, include: { wishlist: { select: { userId: true, isPublic: true } } } });
            if (!item) throw new WishItemUpdateError(404);
            const owner = item.wishlist.userId === userId;
            authorizeWishItemPatch(patch, userId, { ownerId: item.wishlist.userId, isPublic: item.wishlist.isPublic, isHidden: item.isHidden, isPurchased: item.isPurchased, purchasedById: item.purchasedById });
            const data: Prisma.ItemUpdateInput = { ...patch };
            if (patch.maxPrice === null) data.priceCurrency = null;
            else if (patch.maxPrice !== undefined && patch.priceCurrency === undefined && item.priceCurrency === null) data.priceCurrency = DEFAULT_CURRENCY;
            if (patch.priceCurrency !== undefined && patch.maxPrice === undefined && item.maxPrice === null) throw new WishItemUpdateError();
            if (patch.isPurchased !== undefined) data.purchasedBy = patch.isPurchased ? { connect: { id: userId } } : { disconnect: true };
            const updated = await tx.item.update({ where: { id }, data });
            return owner ? updated : { id: updated.id, isPurchased: updated.isPurchased };
        });
        return res.json(result);
    } catch (failure) {
        if (failure instanceof WishItemUpdateError) return res.status(failure.status).json({ error: 'Wish item update rejected', errorCode: failure.status === 404 ? API_ERROR_CODES.ITEM_NOT_FOUND : failure.status === 403 ? API_ERROR_CODES.ACCESS_DENIED : API_ERROR_CODES.INVALID_INPUT });
        console.error('Wish item update unavailable; user, request and database details withheld');
        return res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
}
