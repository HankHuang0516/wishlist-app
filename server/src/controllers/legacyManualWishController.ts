import { Prisma } from '@prisma/client';
import { Response } from 'express';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { API_ERROR_CODES } from '../lib/errorCodes';
import { LegacyWishCreateError as Reject, legacyCreateId } from '../lib/legacyWishCreate';
import { parseWishItemPatch, WishItemUpdateError } from '../lib/wishItemUpdate';
import { parseEclawPublicCode, verifyPublicCode, ECLAW_PUBLIC_CODE_PREFIX } from '../lib/eclawBridge';
import { listingCreationGate, ListingCreationError } from '../lib/listingCreation';
import { PhotoInputError } from '../lib/listingPhoto';
import { MediaStorageConfigurationError } from '../lib/listingMediaStorage';
import { FlickrMediaUnavailable } from '../lib/listingFlickrStorage';
import { stageWishPhoto, attachStagedWishPhoto, discardStagedWishPhoto, StagedWishPhoto } from '../lib/stagedWishPhoto';
import { wakeEclawRecognitionWorker } from '../lib/eclawRecognitionQueue';

async function verifiedProxy(req: AuthRequest, raw: unknown) {
    if (raw != null && (typeof raw !== 'string' || raw.length > 128 || /[\u0000-\u001f\u007f]/.test(raw))) throw new Reject();
    const claimed = parseEclawPublicCode(raw);
    if (req.eclawAgent) {
        if (claimed && claimed !== req.eclawAgent.publicCode) throw new Reject(403);
        return ECLAW_PUBLIC_CODE_PREFIX + req.eclawAgent.publicCode;
    }
    if (claimed) {
        const result = await verifyPublicCode(claimed);
        if (!result.ok) throw new Reject(result.reason === 'upstream_error' ? 503 : 403);
        return ECLAW_PUBLIC_CODE_PREFIX + result.entity!.publicCode;
    }
    if (typeof raw === 'string' && raw.toLowerCase().startsWith(ECLAW_PUBLIC_CODE_PREFIX)) throw new Reject();
    return raw === '' || raw == null ? null : raw as string;
}

async function destination(tx: Prisma.TransactionClient, req: AuthRequest, wishlistId: number, ownerUserId: number) {
    if (req.user) await listingCreationGate(tx, req, ownerUserId);
    else {
        const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${ownerUserId} FOR NO KEY UPDATE`);
        if (!rows.length) throw new Reject(401);
    }
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Wishlist" WHERE "id" = ${wishlistId} FOR UPDATE`);
    const list = await tx.wishlist.findUnique({ where: { id: wishlistId }, select: { userId: true, maxItems: true } });
    if (!list) throw new Reject(404);
    if (list.userId !== ownerUserId) throw new Reject(403);
    if (await tx.item.count({ where: { wishlistId } }) >= list.maxItems) throw new Reject(409);
}

/** Existing unkeyed multipart/JSON entry. It deliberately supplies no historical
 * create receipt; durable web creation uses the separate LINK/PHOTO protocol.
 */
export async function createItem(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user && !req.eclawAgent) return res.status(401).json({ errorCode: API_ERROR_CODES.MISSING_TOKEN });
    let photo: StagedWishPhoto | undefined, committed = false;
    try {
        const wishlistId = legacyCreateId(req.params.wishlistId), body = req.body ?? {};
        if (typeof body !== 'object' || Array.isArray(body) || Object.keys(req.query ?? {}).length ||
            Object.keys(body).some(k => !['name', 'notes', 'price', 'currency', 'maxPrice', 'priceCurrency', 'proxy_end_user_id'].includes(k))) throw new Reject();
        const { proxy_end_user_id, ...fields } = body;
        const data = parseWishItemPatch({ ...fields, name: fields.name === undefined || fields.name === '' ? 'New Item' : fields.name });
        // Bind before storage, preserving both agent identity and user-code verification.
        const proxy = await verifiedProxy(req, proxy_end_user_id);
        const initial = await prisma.wishlist.findUnique({ where: { id: wishlistId }, select: { userId: true } });
        if (!initial) throw new Reject(404);
        const owner = req.user?.id ?? initial.userId;
        if (initial.userId !== owner) throw new Reject(403);
        if (req.file) {
            await prisma.$transaction(tx => destination(tx, req, wishlistId, owner));
            photo = await stageWishPhoto(owner, req.file.buffer, req.file.mimetype);
        }
        const item = await prisma.$transaction(async tx => {
            await destination(tx, req, wishlistId, owner);
            const item = await tx.item.create({ data: { ...data, name: data.name!, wishlistId, proxy_end_user_id: proxy,
                imageUrl: photo?.imageUrl ?? null, uploadStatus: 'COMPLETED', aiStatus: photo ? 'PENDING' : 'SKIPPED' } });
            if (photo) await attachStagedWishPhoto(tx, photo, item.id);
            await tx.wishlist.update({ where: { id: wishlistId }, data: { updatedAt: new Date() } });
            return item;
        });
        committed = true;
        if (photo) wakeEclawRecognitionWorker();
        return res.status(201).json(item);
    } catch (error) {
        if (photo && !committed) await discardStagedWishPhoto(photo).catch(() => console.error('Wish photo cleanup journal unavailable; provider lease retained'));
        const status = error instanceof Reject || error instanceof WishItemUpdateError || error instanceof PhotoInputError || error instanceof ListingCreationError ? error.status
            : error instanceof MediaStorageConfigurationError || error instanceof FlickrMediaUnavailable ? 503 : 500;
        if (status === 500) console.error('Legacy manual wish unavailable; source and provider details withheld');
        return res.status(status).json({ error: 'Wish creation request rejected', errorCode: status === 403 ? API_ERROR_CODES.ACCESS_DENIED
            : status === 404 ? API_ERROR_CODES.WISHLIST_NOT_FOUND : status === 401 ? API_ERROR_CODES.INVALID_TOKEN
            : status >= 500 ? API_ERROR_CODES.INTERNAL_ERROR : API_ERROR_CODES.INVALID_INPUT });
    }
}
