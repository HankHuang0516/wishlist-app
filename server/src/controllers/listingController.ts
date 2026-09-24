import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isDiscoverable, isListingId, ListingInputError, parseListingCreate, parseListingSearch, publicationExpiry } from '../lib/listingRules';
import { forbiddenListingField, privateContactField } from '../lib/listingPolicy';

// Explicit projection: no credentials, request hashes, private profile/contact
// fields or future exact meetup locations can escape through a relation include.
export const publicListingSelect = {
    id: true, ownerUserId: true, title: true, description: true, condition: true,
    category: true, brand: true, price: true, currency: true, deliveryMethods: true,
    negotiable: true, status: true, publishedAt: true, expiresAt: true, expiryMode: true,
    lastVerifiedAt: true, createdAt: true, updatedAt: true, version: true,
    owner: { select: { id: true, name: true } },
    location: { select: { county: true, district: true, publicLatitude: true, publicLongitude: true, precisionMeters: true } },
    media: { orderBy: { position: 'asc' as const }, select: { id: true, imageUrl: true, thumbnailUrl: true, position: true } },
} satisfies Prisma.ListingSelect;

class ListingConflict extends Error {}
class ListingForbidden extends Error {}
function fail(res: Response, error: unknown) {
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
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    let parsed: ReturnType<typeof parseListingCreate> | undefined;
    try {
        const ownerUserId = req.user.id;
        const clientListingId = req.body?.clientListingId;
        const existing = isListingId(clientListingId) ? await prisma.listing.findUnique({ where: { ownerUserId_clientListingId: { ownerUserId, clientListingId } } }) : null;
        parsed = parseListingCreate(req.body, existing?.createdAt ?? new Date());
        if (existing) {
            if (existing.requestHash !== parsed.requestHash) throw new ListingConflict();
            return res.json(await prisma.listing.findUnique({ where: { id: existing.id }, select: publicListingSelect }));
        }
        const user = await prisma.user.findUnique({ where: { id: ownerUserId }, select: { isEmailVerified: true, isPhoneVerified: true } });
        if (!user) return res.status(401).json({ error: '帳號已失效' });
        if (parsed.data.status === 'ACTIVE' && !user.isEmailVerified && !user.isPhoneVerified) throw new ListingForbidden('上架前請先完成手機或 Email 驗證');
        assertListingPolicy(parsed.data);
        const input = parsed;
        const listing = await prisma.$transaction(async tx => {
            // Claim the unique idempotency key BEFORE inspecting media. A same-
            // key request waits here until its competitor commits/rolls back;
            // it must not mistake that competitor's attached image for theft.
            const created = await tx.listing.create({ data: {
                ...input.data, ownerUserId, clientListingId: input.clientListingId, requestHash: input.requestHash,
                ...(input.location ? { location: { create: input.location } } : {}),
            } });
            const media = await tx.listingMedia.findMany({ where: { id: { in: input.mediaIds }, ownerUserId, listingId: null, wishItemId: null }, select: { id: true } });
            if (media.length !== input.mediaIds.length) throw new ListingForbidden('圖片不存在、已被使用或不屬於此帳號');
            for (const [position, id] of input.mediaIds.entries()) {
                const bound = await tx.listingMedia.updateMany({ where: { id, ownerUserId, listingId: null, wishItemId: null }, data: { listingId: created.id, position } });
                if (bound.count !== 1) throw new ListingConflict();
            }
            return tx.listing.findUniqueOrThrow({ where: { id: created.id }, select: publicListingSelect });
        });
        return res.status(201).json(listing);
    } catch (error) {
        // A concurrent identical create may have won the unique key. Read its
        // committed result; never create a second listing or attach media twice.
        if (parsed && req.user && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            try {
                const existing = await prisma.listing.findUnique({ where: { ownerUserId_clientListingId: { ownerUserId: req.user.id, clientListingId: parsed.clientListingId } } });
                if (existing?.requestHash === parsed.requestHash) return res.json(await prisma.listing.findUnique({ where: { id: existing.id }, select: publicListingSelect }));
            } catch (readError) { return fail(res, readError); }
        }
        return fail(res, error);
    }
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
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const search = parseListingSearch(req.query);
        if (Object.keys(req.query).some(k => k !== 'limit' && k !== 'cursor')) throw new ListingInputError('query');
        const rows = await prisma.listing.findMany({ where: { ownerUserId: req.user.id }, select: publicListingSelect,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: search.limit + 1,
            ...(search.cursor ? { cursor: { id: search.cursor }, skip: 1 } : {}) });
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
        const listing = await prisma.listing.findFirst({ where: { id, ownerUserId: req.user.id } });
        if (!listing) return res.status(404).json({ error: '商品不存在' });
        const transitions: Record<string, { from: string[]; to: 'ACTIVE' | 'RESERVED' | 'SOLD' | 'REMOVED' }> = {
            reserve: { from: ['ACTIVE'], to: 'RESERVED' }, release: { from: ['RESERVED'], to: 'ACTIVE' },
            sold: { from: ['ACTIVE', 'RESERVED'], to: 'SOLD' }, remove: { from: ['DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'RESERVED', 'EXPIRED'], to: 'REMOVED' },
        };
        const transition = typeof body.action === 'string' && Object.prototype.hasOwnProperty.call(transitions, body.action) ? transitions[body.action] : undefined;
        if (!transition) throw new ListingInputError('action');
        if (!transition.from.includes(listing.status) || (transition.to !== 'REMOVED' && !isDiscoverable(listing.status, listing.expiresAt, new Date()))) throw new ListingConflict();
        const changed = await prisma.listing.updateMany({ where: { id, ownerUserId: req.user.id, version: body.expectedVersion as number, status: listing.status,
            ...(transition.to !== 'REMOVED' ? { expiresAt: { gt: new Date() } } : {}) }, data: { status: transition.to, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ListingConflict();
        return res.json(await prisma.listing.findUnique({ where: { id }, select: publicListingSelect }));
    } catch (error) { return fail(res, error); }
}

export async function extendListingExpiry(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const id = req.params.id;
        if (!isListingId(id)) throw new ListingInputError('id');
        const body = versionBody(req.body, ['expectedVersion', 'expiryDate']);
        if (body.expiryDate === undefined) throw new ListingInputError('expiryDate', '請明確選擇延長後的失效日期');
        const listing = await prisma.listing.findFirst({ where: { id, ownerUserId: req.user.id } });
        if (!listing) return res.status(404).json({ error: '商品不存在' });
        if (!['ACTIVE', 'RESERVED', 'EXPIRED'].includes(listing.status) || !listing.publishedAt) throw new ListingConflict();
        const expiry = publicationExpiry(new Date(), body.expiryDate);
        if (listing.expiresAt && expiry.expiresAt <= listing.expiresAt) throw new ListingInputError('expiryDate', '延長日期須晚於目前失效日期');
        const changed = await prisma.listing.updateMany({ where: { id, ownerUserId: req.user.id, version: body.expectedVersion as number, status: listing.status },
            data: { ...expiry, status: listing.status === 'EXPIRED' ? 'ACTIVE' : listing.status, version: { increment: 1 }, lastVerifiedAt: new Date() } });
        if (changed.count !== 1) throw new ListingConflict();
        return res.json(await prisma.listing.findUnique({ where: { id }, select: publicListingSelect }));
    } catch (error) { return fail(res, error); }
}

type ListingWithAssets = Prisma.ListingGetPayload<{ include: { location: true; media: true } }>;
function editablePayload(listing: ListingWithAssets) {
    return {
        clientListingId: listing.clientListingId, title: listing.title, description: listing.description ?? undefined,
        condition: listing.condition, category: listing.category ?? undefined, brand: listing.brand ?? undefined,
        price: listing.price?.toNumber(), currency: listing.currency, deliveryMethods: listing.deliveryMethods, negotiable: listing.negotiable,
        mediaIds: listing.media.map(m => m.id),
        location: listing.location ? { county: listing.location.county, district: listing.location.district, latitude: listing.location.publicLatitude, longitude: listing.location.publicLongitude } : undefined,
    };
}

export async function editListing(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const id = req.params.id;
        if (!isListingId(id)) throw new ListingInputError('id');
        const body = versionBody(req.body, ['expectedVersion', 'title', 'description', 'condition', 'category', 'brand', 'price', 'currency', 'deliveryMethods', 'negotiable', 'location', 'mediaIds']);
        const listing = await prisma.listing.findFirst({ where: { id, ownerUserId: req.user.id }, include: { location: true, media: { orderBy: { position: 'asc' } } } });
        if (!listing) return res.status(404).json({ error: '商品不存在' });
        if (!['DRAFT', 'ACTIVE', 'RESERVED', 'EXPIRED'].includes(listing.status)) throw new ListingConflict();
        const { expectedVersion, ...changes } = body;
        const parsed = parseListingCreate({ ...editablePayload(listing), ...changes,
            publish: listing.status !== 'DRAFT', consentToMap: true,
            ...(listing.expiryMode === 'CUSTOM_DATE' && listing.expiresAt ? { expiryDate: listing.expiresAt.toISOString().slice(0, 10) } : {}),
        }, listing.publishedAt ?? new Date());
        assertListingPolicy(parsed.data);
        const ownerUserId = req.user.id;
        const result = await prisma.$transaction(async tx => {
            const media = await tx.listingMedia.findMany({ where: { id: { in: parsed.mediaIds }, ownerUserId, wishItemId: null, OR: [{ listingId: null }, { listingId: id }] }, select: { id: true } });
            if (media.length !== parsed.mediaIds.length) throw new ListingForbidden('圖片不存在、已被使用或不屬於此帳號');
            const { publishedAt, expiresAt, expiryMode, lastVerifiedAt, status, ...editable } = parsed.data;
            // No expiry/publication/status fields are written by normal editing.
            const changed = await tx.listing.updateMany({ where: { id, ownerUserId, version: expectedVersion as number, status: listing.status }, data: { ...editable, version: { increment: 1 } } });
            if (changed.count !== 1) throw new ListingConflict();
            if (body.location !== undefined && parsed.location) await tx.listingLocation.upsert({ where: { listingId: id }, create: { listingId: id, ...parsed.location }, update: parsed.location });
            await tx.listingMedia.updateMany({ where: { listingId: id, ownerUserId, id: { notIn: parsed.mediaIds } }, data: { listingId: null } });
            for (const [position, mediaId] of parsed.mediaIds.entries()) {
                const bound = await tx.listingMedia.updateMany({ where: { id: mediaId, ownerUserId, wishItemId: null, OR: [{ listingId: null }, { listingId: id }] }, data: { listingId: id, position } });
                if (bound.count !== 1) throw new ListingConflict();
            }
            return tx.listing.findUniqueOrThrow({ where: { id }, select: publicListingSelect });
        });
        return res.json(result);
    } catch (error) { return fail(res, error); }
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
