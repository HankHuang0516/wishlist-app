import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isDiscoverable, isListingId, ListingInputError, parseListingCreate, parseListingSearch, publicationExpiry } from '../lib/listingRules';
import { forbiddenListingField, privateContactField } from '../lib/listingPolicy';
import { ListingCreationError, listingCreationGate, listingCreationId, listingCreationReceiptSelect } from '../lib/listingCreation';

// Explicit projection: no credentials, request hashes, private profile/contact
// fields or future exact meetup locations can escape through a relation include.
export const publicListingSelect = {
    id: true, ownerUserId: true, title: true, description: true, condition: true,
    category: true, brand: true, price: true, currency: true, deliveryMethods: true,
    negotiable: true, status: true, publishedAt: true, expiresAt: true, expiryMode: true,
    lastVerifiedAt: true, createdAt: true, updatedAt: true, version: true,
    owner: { select: { id: true, name: true } },
    location: { select: { county: true, district: true, publicLatitude: true, publicLongitude: true, precisionMeters: true } },
    media: { where: { OR: [{ capturePurpose: { not: 'AI_MARKETING' as const } }, { marketingSelected: true }] },
        orderBy: { position: 'asc' as const }, select: { id: true, imageUrl: true, thumbnailUrl: true, position: true,
            capturePurpose: true } },
} satisfies Prisma.ListingSelect;

export class ListingConflict extends Error {}
export class ListingForbidden extends Error {}
export class ListingMissing extends Error {}
function fail(res: Response, error: unknown) {
    if (error instanceof ListingMissing) return res.status(404).json({ error: '商品不存在' });
    if (error instanceof ListingCreationError) return res.status(error.status).json({ error: '請查核原刊登操作或重新登入', errorCode: error.code });
    if (error instanceof ListingInputError) return res.status(400).json({ error: error.message, field: error.field, errorCode: 'INVALID_LISTING_INPUT' });
    if (error instanceof ListingForbidden) return res.status(403).json({ error: error.message, errorCode: 'LISTING_ACCESS_DENIED' });
    if (error instanceof ListingConflict || (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))) {
        return res.status(409).json({ error: '商品資料已變更，請重新載入後再試', errorCode: 'LISTING_CONFLICT' });
    }
    // Never serialize Prisma errors: they may carry rows, SQL or connection info.
    return res.status(500).json({ error: '商品服務暫時無法使用', errorCode: 'LISTING_SERVICE_ERROR' });
}
function assertListingPolicy(input: Parameters<typeof forbiddenListingField>[0]) {
    const field = forbiddenListingField(input);
    if (field) throw new ListingInputError(field, '此商品不符合禁售商品政策');
    const contact = privateContactField(input);
    if (contact) throw new ListingInputError(contact, '請勿在公開商品資訊填入電話、Email 或 LINE ID；請使用站內聊天');
}

export async function createListing(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const ownerUserId = req.user.id;
        const clientListingId = listingCreationId(req.body?.clientListingId);
        if (Object.keys(req.query).length) throw new ListingInputError('query');
        const result = await prisma.$transaction(async tx => {
            const user = await listingCreationGate(tx, req, ownerUserId);
            const prior = await tx.listingCreateReceipt.findUnique({ where: { userId_clientListingId: { userId: ownerUserId, clientListingId } } });
            // Clocks are excluded from the original hash. An old operation can
            // be verified even after expiry; only a NEW operation uses now.
            const input = parseListingCreate(req.body, prior ? new Date(0) : new Date());
            if (prior) {
                if (prior.requestHash !== input.requestHash) throw new ListingConflict();
                if (prior.state === 'ABANDONED') throw new ListingCreationError(409, 'LISTING_CREATE_ABANDONED');
                const listing = await tx.listing.findFirst({ where: { id: prior.listingId!, ownerUserId }, select: publicListingSelect });
                if (!listing) throw new ListingCreationError(409, 'LISTING_CREATE_ALREADY_REMOVED');
                return { listing, created: false };
            }
            if (input.data.status === 'ACTIVE' && !user.isEmailVerified && !user.isPhoneVerified) throw new ListingForbidden('上架前請先完成手機或 Email 驗證');
            assertListingPolicy(input.data);
            const created = await tx.listing.create({ data: {
                ...input.data, ownerUserId, clientListingId, requestHash: input.requestHash,
                ...(input.location ? { location: { create: input.location } } : {}),
            } });
            const media = await tx.listingMedia.findMany({ where: { id: { in: input.mediaIds }, ownerUserId, listingId: null, wishItemId: null,
                capturePurpose: { not: 'AI_MARKETING' } }, select: { id: true } });
            if (media.length !== input.mediaIds.length) throw new ListingForbidden('圖片不存在、已被使用或不屬於此帳號');
            for (const [position, id] of input.mediaIds.entries()) {
                const bound = await tx.listingMedia.updateMany({ where: { id, ownerUserId, listingId: null, wishItemId: null,
                    capturePurpose: { not: 'AI_MARKETING' } },
                    data: { listingId: created.id, position, sellerDraft: Prisma.DbNull } });
                if (bound.count !== 1) throw new ListingConflict();
            }
            const approvedJobs = await tx.marketingJob.findMany({ where: { ownerUserId,
                sourceMediaId: { in: input.mediaIds }, status: 'COMPLETED' },
                select: { id: true, parentJobId: true } });
            // A selected revision replaces only requested slots. The other
            // approved images still belong to its parent generation job.
            const approvedJobIds = [...new Set(approvedJobs.flatMap(job =>
                job.parentJobId ? [job.id, job.parentJobId] : [job.id]))];
            const approvedArt = await tx.listingMedia.findMany({ where: { ownerUserId, listingId: null, wishItemId: null,
                capturePurpose: 'AI_MARKETING', marketingSelected: true,
                marketingJobId: { in: approvedJobIds } },
                orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
            if (approvedArt.length + input.mediaIds.length > 8) throw new ListingInputError('mediaIds', '實拍照與選用行銷圖最多合計 8 張');
            if (approvedArt.length) {
                for (const [position, id] of approvedArt.map(media => media.id).entries()) {
                    const bound = await tx.listingMedia.updateMany({ where: { id, ownerUserId, listingId: null,
                        capturePurpose: 'AI_MARKETING', marketingSelected: true },
                        data: { listingId: created.id, position } });
                    if (bound.count !== 1) throw new ListingConflict();
                }
                await tx.listingMedia.updateMany({ where: { id: { in: input.mediaIds }, listingId: created.id },
                    data: { position: { increment: approvedArt.length } } });
                await tx.marketingJob.updateMany({ where: { ownerUserId, sourceMediaId: { in: input.mediaIds },
                    status: 'COMPLETED', listingId: null }, data: { listingId: created.id } });
            }
            await tx.listingCreateReceipt.create({ data: { userId: ownerUserId, clientListingId, requestHash: input.requestHash, state: 'CREATED', listingId: created.id } });
            return { listing: await tx.listing.findUniqueOrThrow({ where: { id: created.id }, select: publicListingSelect }), created: true };
        });
        // Preserve the native POST response shape; web verifies the separate
        // owner-authenticated immutable receipt rather than current status alone.
        return res.status(result.created ? 201 : 200).json(result.listing);
    } catch (error) {
        return fail(res, error);
    }
}

type CreationReceipt = Prisma.ListingCreateReceiptGetPayload<{ select: typeof listingCreationReceiptSelect }>;
async function creationEnvelope(tx: Prisma.TransactionClient, userId: number, receipt: CreationReceipt) {
    return { receipt, listing: receipt.listingId ? await tx.listing.findFirst({ where: { id: receipt.listingId, ownerUserId: userId }, select: publicListingSelect }) : null };
}
export async function getListingCreation(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ errorCode: 'MISSING_TOKEN' });
    try {
        const userId = req.user.id, clientListingId = listingCreationId(req.params.clientListingId);
        if (Object.keys(req.query).length) throw new ListingInputError('query');
        const result = await prisma.$transaction(async tx => {
            await listingCreationGate(tx, req, userId);
            const receipt = await tx.listingCreateReceipt.findUnique({ where: { userId_clientListingId: { userId, clientListingId } }, select: listingCreationReceiptSelect });
            if (!receipt) throw new ListingCreationError(404, 'LISTING_CREATE_NOT_FOUND');
            return creationEnvelope(tx, userId, receipt);
        });
        return res.json(result);
    } catch (error) { return fail(res, error); }
}
export async function abandonListingCreation(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ errorCode: 'MISSING_TOKEN' });
    try {
        const userId = req.user.id, clientListingId = listingCreationId(req.params.clientListingId);
        if (Object.keys(req.query).length || !req.body || Array.isArray(req.body) || Object.keys(req.body).join(',') !== 'requestHash'
            || typeof req.body.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.requestHash)) throw new ListingInputError('requestHash');
        const requestHash = req.body.requestHash;
        const result = await prisma.$transaction(async tx => {
            await listingCreationGate(tx, req, userId);
            let receipt = await tx.listingCreateReceipt.findUnique({ where: { userId_clientListingId: { userId, clientListingId } }, select: listingCreationReceiptSelect });
            if (receipt && receipt.requestHash !== requestHash) throw new ListingConflict();
            receipt ??= await tx.listingCreateReceipt.create({ data: { userId, clientListingId, requestHash, state: 'ABANDONED' }, select: listingCreationReceiptSelect });
            return creationEnvelope(tx, userId, receipt);
        });
        return res.json(result);
    } catch (error) { return fail(res, error); }
}

export async function searchListings(req: AuthRequest, res: Response) {
    try {
        const search = parseListingSearch(req.query);
        const where: Prisma.ListingWhereInput = {
            status: { in: ['ACTIVE', 'RESERVED'] }, expiresAt: { gt: new Date() },
            ...(search.q ? { OR: ['title', 'description', 'brand'].map(field => ({ [field]: { contains: search.q, mode: 'insensitive' } })) } : {}),
            ...(search.category ? { category: search.category } : {}),
            ...(search.brand ? { brand: { equals: search.brand, mode: 'insensitive' } } : {}),
            ...(search.condition ? { condition: search.condition } : {}),
            ...(search.delivery ? { deliveryMethods: { has: search.delivery } } : {}),
            ...(search.minPrice !== undefined || search.maxPrice !== undefined ? { price: { gte: search.minPrice, lte: search.maxPrice } } : {}),
            ...(search.bbox ? { location: { is: { publicLatitude: { gte: search.bbox.south, lte: search.bbox.north }, publicLongitude: { gte: search.bbox.west, lte: search.bbox.east } } } } : {}),
        };
        const rows = await prisma.listing.findMany({ where, select: publicListingSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: search.limit + 1, ...(search.cursor ? { cursor: { id: search.cursor }, skip: 1 } : {}) });
        const hasMore = rows.length > search.limit;
        const items = rows.slice(0, search.limit);
        return res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
    } catch (error) { return fail(res, error); }
}

export async function myListings(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const search = parseListingSearch(req.query);
        if (Object.keys(req.query).some(k => k !== 'limit' && k !== 'cursor')) throw new ListingInputError('query');
        const ownerUserId = req.user.id;
        // Resolve only an owned cursor in the same snapshot as its page. A
        // foreign or deleted ID must not silently move this owner's boundary.
        const rows = await prisma.$transaction(async tx => {
            const boundary = search.cursor ? await tx.listing.findFirst({
                where: { id: search.cursor, ownerUserId }, select: { id: true, createdAt: true },
            }) : null;
            if (search.cursor && !boundary) throw new ListingInputError('cursor');
            return tx.listing.findMany({ where: { ownerUserId,
                ...(boundary ? { OR: [
                    { createdAt: { lt: boundary.createdAt } },
                    { createdAt: boundary.createdAt, id: { lt: boundary.id } },
                ] } : {}),
            }, select: publicListingSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: search.limit + 1 });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
        const items = rows.slice(0, search.limit);
        return res.json({ items, nextCursor: rows.length > search.limit ? items[items.length - 1].id : null });
    } catch (error) { return fail(res, error); }
}

export async function getListing(req: AuthRequest, res: Response) {
    try {
        const id = req.params.id;
        if (!isListingId(id)) throw new ListingInputError('id');
        const listing = await prisma.listing.findUnique({ where: { id }, select: publicListingSelect });
        if (!listing || (!isDiscoverable(listing.status, listing.expiresAt, new Date()) && listing.ownerUserId !== req.user?.id)) return res.status(404).json({ error: '商品不存在或已停止刊登' });
        return res.json(listing);
    } catch (error) { return fail(res, error); }
}

function versionBody(body: unknown, keys: string[]) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ListingInputError('body');
    const value = body as Record<string, unknown>;
    if (Object.keys(value).some(k => !keys.includes(k)) || typeof value.expectedVersion !== 'number' || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1) throw new ListingInputError('expectedVersion');
    return value;
}

export async function changeListingStatus(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const id = req.params.id;
        if (!isListingId(id)) throw new ListingInputError('id');
        const body = versionBody(req.body, ['expectedVersion', 'action']);
        return res.json(await prisma.$transaction(tx => applyListingStatus(tx, req.user!.id, id, body)));
    } catch (error) { return fail(res, error); }
}

export async function applyListingStatus(tx: Prisma.TransactionClient, userId: number, id: string, body: Record<string, unknown>) {
        const listing = await tx.listing.findFirst({ where: { id, ownerUserId: userId } });
        if (!listing) throw new ListingMissing();
        const transitions: Record<string, { from: string[]; to: 'ACTIVE' | 'RESERVED' | 'SOLD' | 'REMOVED' }> = {
            reserve: { from: ['ACTIVE'], to: 'RESERVED' }, release: { from: ['RESERVED'], to: 'ACTIVE' },
            sold: { from: ['ACTIVE', 'RESERVED'], to: 'SOLD' }, remove: { from: ['DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'RESERVED', 'EXPIRED'], to: 'REMOVED' },
        };
        const transition = typeof body.action === 'string' && Object.prototype.hasOwnProperty.call(transitions, body.action) ? transitions[body.action] : undefined;
        if (!transition) throw new ListingInputError('action');
        if (!transition.from.includes(listing.status) || (transition.to !== 'REMOVED' && !isDiscoverable(listing.status, listing.expiresAt, new Date()))) throw new ListingConflict();
        const changed = await tx.listing.updateMany({ where: { id, ownerUserId: userId, version: body.expectedVersion as number, status: listing.status,
            ...(transition.to !== 'REMOVED' ? { expiresAt: { gt: new Date() } } : {}) }, data: { status: transition.to, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ListingConflict();
        return tx.listing.findUniqueOrThrow({ where: { id }, select: publicListingSelect });
}

export async function extendListingExpiry(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const id = req.params.id;
        if (!isListingId(id)) throw new ListingInputError('id');
        const body = versionBody(req.body, ['expectedVersion', 'expiryDate']);
        if (body.expiryDate === undefined) throw new ListingInputError('expiryDate', '請明確選擇延長後的失效日期');
        return res.json(await prisma.$transaction(tx => applyListingExtension(tx, req.user!.id, id, body)));
    } catch (error) { return fail(res, error); }
}

export async function applyListingExtension(tx: Prisma.TransactionClient, userId: number, id: string, body: Record<string, unknown>) {
        const listing = await tx.listing.findFirst({ where: { id, ownerUserId: userId } });
        if (!listing) throw new ListingMissing();
        if (!['ACTIVE', 'RESERVED', 'EXPIRED'].includes(listing.status) || !listing.publishedAt) throw new ListingConflict();
        const expiry = publicationExpiry(new Date(), body.expiryDate);
        if (listing.expiresAt && expiry.expiresAt <= listing.expiresAt) throw new ListingInputError('expiryDate', '延長日期須晚於目前失效日期');
        const changed = await tx.listing.updateMany({ where: { id, ownerUserId: userId, version: body.expectedVersion as number, status: listing.status },
            data: { ...expiry, status: listing.status === 'EXPIRED' ? 'ACTIVE' : listing.status, version: { increment: 1 }, lastVerifiedAt: new Date() } });
        if (changed.count !== 1) throw new ListingConflict();
        return tx.listing.findUniqueOrThrow({ where: { id }, select: publicListingSelect });
}

type ListingWithAssets = Prisma.ListingGetPayload<{ include: { location: true; media: true } }>;
function editablePayload(listing: ListingWithAssets) {
    return {
        clientListingId: listing.clientListingId, title: listing.title, description: listing.description ?? undefined,
        condition: listing.condition, category: listing.category ?? undefined, brand: listing.brand ?? undefined,
        price: listing.price?.toNumber(), currency: listing.currency, deliveryMethods: listing.deliveryMethods, negotiable: listing.negotiable,
        mediaIds: listing.media.filter(m => m.capturePurpose !== 'AI_MARKETING' || m.marketingSelected).map(m => m.id),
        location: listing.location ? { county: listing.location.county, district: listing.location.district, latitude: listing.location.publicLatitude, longitude: listing.location.publicLongitude } : undefined,
    };
}

export async function editListing(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const id = req.params.id;
        if (!isListingId(id)) throw new ListingInputError('id');
        const body = versionBody(req.body, ['expectedVersion', 'title', 'description', 'condition', 'category', 'brand', 'price', 'currency', 'deliveryMethods', 'negotiable', 'location', 'mediaIds']);
        return res.json(await prisma.$transaction(tx => applyListingEdit(tx, req.user!.id, id, body)));
    } catch (error) { return fail(res, error); }
}

export async function applyListingEdit(tx: Prisma.TransactionClient, ownerUserId: number, id: string, body: Record<string, unknown>) {
        const listing = await tx.listing.findFirst({ where: { id, ownerUserId }, include: { location: true, media: { orderBy: { position: 'asc' } } } });
        if (!listing) throw new ListingMissing();
        if (!['DRAFT', 'ACTIVE', 'RESERVED', 'EXPIRED'].includes(listing.status)) throw new ListingConflict();
        const { expectedVersion, ...changes } = body;
        const parsed = parseListingCreate({ ...editablePayload(listing), ...changes,
            publish: listing.status !== 'DRAFT', consentToMap: true,
            ...(listing.expiryMode === 'CUSTOM_DATE' && listing.expiresAt ? { expiryDate: listing.expiresAt.toISOString().slice(0, 10) } : {}),
        }, listing.publishedAt ?? new Date());
        assertListingPolicy(parsed.data);
            const media = await tx.listingMedia.findMany({ where: { id: { in: parsed.mediaIds }, ownerUserId, wishItemId: null,
                AND: [{ OR: [{ listingId: null }, { listingId: id }] }, { OR: [{ capturePurpose: { not: 'AI_MARKETING' } }, { marketingSelected: true }] }] },
                select: { id: true } });
            if (media.length !== parsed.mediaIds.length) throw new ListingForbidden('圖片不存在、已被使用或不屬於此帳號');
            const { publishedAt, expiresAt, expiryMode, lastVerifiedAt, status, ...editable } = parsed.data;
            // No expiry/publication/status fields are written by normal editing.
            const changed = await tx.listing.updateMany({ where: { id, ownerUserId, version: expectedVersion as number, status: listing.status }, data: { ...editable, version: { increment: 1 } } });
            if (changed.count !== 1) throw new ListingConflict();
            if (body.location !== undefined && parsed.location) await tx.listingLocation.upsert({ where: { listingId: id }, create: { listingId: id, ...parsed.location }, update: parsed.location });
            await tx.listingMedia.updateMany({ where: { listingId: id, ownerUserId, id: { notIn: parsed.mediaIds } }, data: { listingId: null } });
            for (const [position, mediaId] of parsed.mediaIds.entries()) {
                const bound = await tx.listingMedia.updateMany({ where: { id: mediaId, ownerUserId, wishItemId: null, OR: [{ listingId: null }, { listingId: id }] },
                    data: { listingId: id, position, sellerDraft: Prisma.DbNull } });
                if (bound.count !== 1) throw new ListingConflict();
            }
            return tx.listing.findUniqueOrThrow({ where: { id }, select: publicListingSelect });
}

export async function publishListing(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const id = req.params.id;
        if (!isListingId(id)) throw new ListingInputError('id');
        const body = versionBody(req.body, ['expectedVersion', 'expiryDate', 'consentToMap']);
        const listing = await prisma.listing.findFirst({ where: { id, ownerUserId: req.user.id }, include: { location: true, media: { orderBy: { position: 'asc' } } } });
        if (!listing) return res.status(404).json({ error: '商品不存在' });
        if (listing.status !== 'DRAFT') throw new ListingConflict();
        const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id }, select: { isEmailVerified: true, isPhoneVerified: true } });
        if (!user.isEmailVerified && !user.isPhoneVerified) throw new ListingForbidden('上架前請先完成手機或 Email 驗證');
        const expiryDate = body.expiryDate ?? (listing.expiryMode === 'CUSTOM_DATE' && listing.expiresAt ? listing.expiresAt.toISOString().slice(0, 10) : undefined);
        if (body.expiryDate === null) throw new ListingInputError('expiryDate');
        const parsed = parseListingCreate({ ...editablePayload(listing), publish: true, consentToMap: body.consentToMap, ...(expiryDate !== undefined ? { expiryDate } : {}) }, new Date());
        assertListingPolicy(parsed.data);
        const changed = await prisma.listing.updateMany({ where: { id, ownerUserId: req.user.id, version: body.expectedVersion as number, status: 'DRAFT' },
            data: { status: 'ACTIVE', publishedAt: parsed.data.publishedAt, expiresAt: parsed.data.expiresAt, expiryMode: parsed.data.expiryMode, lastVerifiedAt: parsed.data.lastVerifiedAt, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ListingConflict();
        return res.json(await prisma.listing.findUnique({ where: { id }, select: publicListingSelect }));
    } catch (error) { return fail(res, error); }
}
