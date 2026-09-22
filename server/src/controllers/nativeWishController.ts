import { Response } from 'express';
import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { API_ERROR_CODES } from '../lib/errorCodes';
import { NativeWishError, nativeListCreate, nativeWishCreate, nativeWishlistPatch, wishCreateHash, wishId } from '../lib/nativeWishRules';
import { WishItemUpdateError } from '../lib/wishItemUpdate';
import { wakeEclawRecognitionWorker } from '../lib/eclawRecognitionQueue';
const itemSelect = { id: true, wishlistId: true, name: true, notes: true, link: true, imageUrl: true, aiStatus: true, price: true, currency: true, aiLink: true, maxPrice: true, priceCurrency: true, isHidden: true, isPurchased: true, updatedAt: true } as const;
const listSelect = { id: true, title: true, description: true, isPublic: true, maxItems: true, updatedAt: true, _count: { select: { items: true } } } as const;
type Tx = Prisma.TransactionClient;
async function lockUser(tx: Tx, userId: number) {
    // Serialize native creates, but allow FK KEY SHARE from a gift claim that
    // already owns the parent/item locks; FOR UPDATE would invert that order.
    const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`);
    if (!rows.length) throw new NativeWishError(401);
}
async function lockList(tx: Tx, id: number, userId: number) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Wishlist" WHERE "id" = ${id} FOR UPDATE`);
    const list = await tx.wishlist.findFirst({ where: { id, userId }, select: { id: true, maxItems: true } });
    if (!list) throw new NativeWishError(404);
    return list;
}
function endpoint(action: (req: AuthRequest, userId: number) => Promise<unknown>, status = 200) {
    return async (req: AuthRequest, res: Response) => {
        res.setHeader('Cache-Control', 'private, no-store');
        if (!req.user?.id) return res.status(401).json({ errorCode: API_ERROR_CODES.MISSING_TOKEN });
        try { return res.status(status).json(await action(req, req.user.id)); }
        catch (error) {
            if (error instanceof NativeWishError || error instanceof WishItemUpdateError) return res.status(error.status).json({ error: 'Wish request rejected', errorCode: API_ERROR_CODES.INVALID_INPUT });
            console.error('Native wish request unavailable; request and database details withheld');
            return res.status(500).json({ errorCode: API_ERROR_CODES.INTERNAL_ERROR });
        }
    };
}
export const getNativeLists = endpoint(async (req, userId) => {
    const after = req.query.cursor === undefined ? undefined : wishId(req.query.cursor);
    const rows = await prisma.wishlist.findMany({ where: { userId, ...(after ? { id: { gt: after } } : {}) }, take: 26, orderBy: { id: 'asc' }, select: listSelect });
    const items = rows.slice(0, 25); return { items, nextCursor: rows.length > 25 ? items[items.length - 1].id : null };
});
export const getNativeList = endpoint(async (req, userId) => {
    const id = wishId(req.params.id), after = req.query.cursor === undefined ? undefined : wishId(req.query.cursor);
    return prisma.$transaction(async tx => {
        const list = await tx.wishlist.findFirst({ where: { id, userId }, select: listSelect });
        if (!list) throw new NativeWishError(404);
        const rows = await tx.item.findMany({ where: { wishlistId: id, ...(after ? { id: { gt: after } } : {}) }, take: 51, orderBy: { id: 'asc' }, select: itemSelect });
        const items = rows.slice(0, 50); return { list, items, nextCursor: rows.length > 50 ? items[items.length - 1].id : null };
    }, { isolationLevel: 'RepeatableRead' });
});
async function replay(tx: Tx, userId: number, clientRequestId: string, requestHash: string, kind: string) {
    const previous = await tx.wishCreateReceipt.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId } } });
    if (!previous) return null;
    if (previous.requestHash !== requestHash || previous.kind !== kind) throw new NativeWishError(409);
    const resource = kind === 'LIST' ? await tx.wishlist.findFirst({ where: { id: previous.resourceId, userId }, select: listSelect }) : await tx.item.findFirst({ where: { id: previous.resourceId, wishlist: { userId } }, select: itemSelect });
    if (!resource) throw new NativeWishError(410);
    return { resource, replayed: true };
}
export const createNativeList = endpoint(async (req, userId) => {
    const input = nativeListCreate(req.body), requestHash = wishCreateHash('LIST', null, input.data);
    return prisma.$transaction(async tx => {
        await lockUser(tx, userId);
        const previous = await replay(tx, userId, input.clientRequestId, requestHash, 'LIST'); if (previous) return previous;
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { isPremium: true, maxWishlistItems: true } });
        const resource = await tx.wishlist.create({ data: { ...input.data, userId, maxItems: user.isPremium ? 10000 : Math.max(1, Math.min(10000, user.maxWishlistItems)) }, select: listSelect });
        await tx.wishCreateReceipt.create({ data: { userId, clientRequestId: input.clientRequestId, requestHash, kind: 'LIST', resourceId: resource.id } });
        return { resource, replayed: false };
    });
}, 201);
export const createNativeWish = endpoint(async (req, userId) => {
    const id = wishId(req.params.id), input = nativeWishCreate(req.body), requestHash = wishCreateHash('ITEM', id, input.data);
    const result = await prisma.$transaction(async tx => {
        await lockUser(tx, userId);
        const previous = await replay(tx, userId, input.clientRequestId, requestHash, 'ITEM'); if (previous) return previous;
        const list = await lockList(tx, id, userId);
        if (await tx.item.count({ where: { wishlistId: id } }) >= list.maxItems) throw new NativeWishError(409);
        const resource = await tx.item.create({ data: { ...input.data, wishlistId: id, aiStatus: input.data.imageUrl ? 'PENDING' : 'SKIPPED', uploadStatus: 'COMPLETED' }, select: itemSelect });
        await tx.wishCreateReceipt.create({ data: { userId, clientRequestId: input.clientRequestId, requestHash, kind: 'ITEM', resourceId: resource.id } });
        await tx.wishlist.update({ where: { id }, data: { updatedAt: new Date() } });
        return { resource, replayed: false };
    });
    if (!result.replayed && 'aiStatus' in result.resource && result.resource.aiStatus === 'PENDING') wakeEclawRecognitionWorker();
    return result;
}, 201);
export const updateNativeList = endpoint(async (req, userId) => {
    const id = wishId(req.params.id), data = nativeWishlistPatch(req.body);
    return prisma.$transaction(async tx => { await lockList(tx, id, userId); return tx.wishlist.update({ where: { id }, data, select: listSelect }); });
});
export const deleteNativeList = endpoint(async (req, userId) => {
    const id = wishId(req.params.id);
    return prisma.$transaction(async tx => { await lockList(tx, id, userId); await tx.wishlist.delete({ where: { id } }); return { id, deleted: true }; });
});
export const deleteNativeWish = endpoint(async (req, userId) => {
    const id = wishId(req.params.id);
    return prisma.$transaction(async tx => {
        const item = await tx.item.findFirst({ where: { id, wishlist: { userId } }, select: { wishlistId: true } }); if (!item) throw new NativeWishError(404);
        await lockList(tx, item.wishlistId, userId);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Item" WHERE "id" = ${id} FOR UPDATE`);
        if (!(await tx.item.findFirst({ where: { id, wishlistId: item.wishlistId, wishlist: { userId } }, select: { id: true } }))) throw new NativeWishError(404);
        await tx.item.delete({ where: { id } }); await tx.wishlist.update({ where: { id: item.wishlistId }, data: { updatedAt: new Date() } });
        return { id, deleted: true };
    });
});
