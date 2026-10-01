import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { API_ERROR_CODES } from '../lib/errorCodes';
import fs from 'fs';
import { flickrService } from '../lib/flickr';
import { wakeEclawRecognitionWorker } from '../lib/eclawRecognitionQueue';
import { parseEclawPublicCode, verifyPublicCode, ECLAW_PUBLIC_CODE_PREFIX } from '../lib/eclawBridge';
import { parseOptionalPrice, parseOptionalCurrency } from '../lib/matchmakingPrice';

interface AuthRequest extends Request {
    user?: any;
    merchant?: any;
    // Set by authenticateEclawAgent (card_e30cf03d): the caller's OWN verified
    // EClaw public code. NO merchant key. The write binds proxy_end_user_id to it.
    eclawAgent?: { publicCode: string };
}

// Async AI Processor
const processItemAi = async (itemId: number, imagePathOrUrl: string, originalName: string, userId: number) => {
    try {
        const item = await prisma.item.findUnique({ where: { id: itemId }, select: { imageUrl: true } });
        const publicImageUrl = imagePathOrUrl.startsWith('https://') ? imagePathOrUrl : item?.imageUrl;
        if (!publicImageUrl?.startsWith('https://')) throw new Error('EClaw recognition requires a persistent HTTPS image URL');
        await prisma.item.update({ where: { id: itemId }, data: { imageUrl: publicImageUrl, aiStatus: 'PENDING', aiError: null } });
        wakeEclawRecognitionWorker();
    } catch (error: any) {
        console.error(`[EClawQueue] Failed to enqueue Item ${itemId}:`, error?.message || error);
        await prisma.item.update({
            where: { id: itemId },
            data: {
                aiStatus: 'FAILED',
                aiError: 'ECLAW_QUEUE_FAILED'
            }
        });
    }
};

// Background Upload Processor
const processItemUpload = async (itemId: number, filePath: string, filename: string, userId: number) => {
    try {
        console.log(`[AsyncUpload] Starting Flickr upload for Item ${itemId}`);

        await prisma.item.update({
            where: { id: itemId },
            data: { uploadStatus: 'UPLOADING' }
        });

        const imageBuffer = fs.readFileSync(filePath);
        const flickrUrl = await flickrService.uploadImage(
            imageBuffer,
            `item_${itemId}_${Date.now()}_${filename}`,
            `Item ${itemId}`,
            'wishlist-app'
        );

        if (flickrUrl) {
            console.log(`[AsyncUpload] ✅ Flickr upload successful for Item ${itemId}: ${flickrUrl}`);
            await prisma.item.update({
                where: { id: itemId },
                data: {
                    imageUrl: flickrUrl,
                    uploadStatus: 'COMPLETED'
                }
            });

            // Clean up local file
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.warn(`[AsyncUpload] Failed to delete temp file:`, e);
            }

            // Trigger AI analysis with Flickr URL (pass userId for quota check)
            processItemAi(itemId, flickrUrl, filename, userId);
        } else {
            console.error(`[AsyncUpload] ❌ Flickr upload failed for Item ${itemId}`);
            await prisma.item.update({
                where: { id: itemId },
                data: { uploadStatus: 'FAILED' }
            });
            // Still try AI with local file
            processItemAi(itemId, filePath, filename, userId);
        }

    } catch (error: any) {
        console.error(`[AsyncUpload] Error for Item ${itemId}:`, error);
        await prisma.item.update({
            where: { id: itemId },
            data: {
                uploadStatus: 'FAILED',
                aiError: error.message
            }
        });
    }
};

export const createItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        // An EClaw agent verified by authenticateEclawAgent (NO merchant key).
        const agentPublicCode: string | undefined = req.eclawAgent?.publicCode;

        if (!userId && !agentPublicCode) {
            return res.status(401).json({ error: 'Unauthorized', errorCode: API_ERROR_CODES.MISSING_TOKEN });
        }

        const { wishlistId } = req.params;
        const { proxy_end_user_id } = req.body;
        const file = req.file;

        // Check if wishlist exists
        const wishlist = await prisma.wishlist.findUnique({
            where: { id: Number(wishlistId) }
        });

        if (!wishlist) {
            return res.status(404).json({
                error: 'Wishlist not found',
                errorCode: API_ERROR_CODES.WISHLIST_NOT_FOUND
            });
        }

        // Ownership check: If User auth, must be owner. If Merchant, maybe bypass?
        // For now, let's assume merchants can add to any wishlist if they have the ID, 
        // OR we should check if the merchant is authorized for this user.
        // Simplest: If User is logged in, check ownership. If ONLY Merchant, bypass ownership but require wishlistId.
        if (userId && wishlist.userId !== userId) {
            return res.status(403).json({
                error: 'Access denied: You do not own this wishlist',
                errorCode: API_ERROR_CODES.ACCESS_DENIED
            });
        }

        // Image is optional now - use placeholder if missing
        let imageUrl = null;
        if (file) {
            imageUrl = `/uploads/${file.filename}`;
        } else {
            // Use a default placeholder for text-only items
            imageUrl = 'https://ui-avatars.com/api/?name=Item&background=random';
        }

        // Validate Price
        let validatedPrice: string | null = null;
        if (req.body.price) {
            // If number or numeric string
            if (!isNaN(Number(req.body.price))) {
                validatedPrice = String(req.body.price);
            } else {
                return res.status(400).json({
                    error: 'Price must be a number',
                    errorCode: API_ERROR_CODES.INVALID_INPUT
                });
            }
        }

        const { name, notes } = req.body;
        if (name && name.length > 200) {
            return res.status(400).json({ error: 'Name too long (Max 200)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        if (notes && notes.length > 1000) {
            return res.status(400).json({ error: 'Notes too long (Max 1000)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        // Price-aware matchmaking (card_e1b8af79): a BUYER may declare an intended /
        // max buy price on their wishlist item. OPTIONAL, validated (finite, >= 0,
        // bounded) and never coerced silently — an invalid value is rejected (400).
        const maxPriceParsed = parseOptionalPrice(req.body.maxPrice);
        if (!maxPriceParsed.ok) {
            return res.status(400).json({ error: maxPriceParsed.error || 'Invalid maxPrice', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        const priceCurrencyParsed = parseOptionalCurrency(req.body.priceCurrency);
        if (!priceCurrencyParsed.ok) {
            return res.status(400).json({ error: priceCurrencyParsed.error || 'Invalid priceCurrency', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        // SECURITY (review HIGH #1 + card_e30cf03d): proxy_end_user_id is untrusted
        // input. Two cases:
        //   (A) The caller is a VERIFIED EClaw AGENT (authenticateEclawAgent proved
        //       it against EClaw → req.eclawAgent.publicCode). The item is ALWAYS
        //       bound to THAT verified code; any eclaw: code in the body that names
        //       a DIFFERENT entity is rejected (a caller can't write under a code
        //       it does not control). No merchant key, no re-verify needed.
        //   (B) The caller is a logged-in USER tagging an `eclaw:<code>`. That code
        //       MUST resolve against EClaw's public-code index (P1 anti-spoof) or
        //       the write is rejected; an EClaw outage fails CLOSED (503).
        // A non-eclaw proxy_end_user_id is stored as-is (opaque external id).
        let safeProxyId: string | null = null;
        if (agentPublicCode) {
            // (A) Verified agent: bind to its own code, reject a foreign claim.
            const claimed = parseEclawPublicCode(proxy_end_user_id);
            if (claimed && claimed !== agentPublicCode) {
                return res.status(403).json({
                    error: 'Cannot write an item under an EClaw code you do not control',
                    errorCode: API_ERROR_CODES.ACCESS_DENIED,
                });
            }
            safeProxyId = `${ECLAW_PUBLIC_CODE_PREFIX}${agentPublicCode}`;
        } else if (proxy_end_user_id != null && String(proxy_end_user_id).length > 0) {
            const eclawCode = parseEclawPublicCode(proxy_end_user_id);
            if (eclawCode) {
                const verified = await verifyPublicCode(eclawCode);
                if (!verified.ok) {
                    if (verified.reason === 'upstream_error') {
                        return res.status(503).json({
                            error: 'EClaw public-code verification unavailable; try again later',
                            errorCode: API_ERROR_CODES.INTERNAL_ERROR,
                        });
                    }
                    return res.status(403).json({
                        error: 'proxy_end_user_id names an EClaw code that does not resolve to a real entity',
                        errorCode: API_ERROR_CODES.ACCESS_DENIED,
                    });
                }
                // Canonicalize to the verified code.
                safeProxyId = `${ECLAW_PUBLIC_CODE_PREFIX}${verified.entity!.publicCode}`;
            } else if (String(proxy_end_user_id).toLowerCase().startsWith(ECLAW_PUBLIC_CODE_PREFIX)) {
                // Claims to be an eclaw identity but is malformed → reject.
                return res.status(400).json({
                    error: 'Malformed eclaw: proxy_end_user_id',
                    errorCode: API_ERROR_CODES.INVALID_INPUT,
                });
            } else {
                // Opaque non-EClaw external id: store as-is (never trusted for identity).
                safeProxyId = String(proxy_end_user_id).slice(0, 128);
            }
        }

        const item = await prisma.item.create({
            data: {
                name: req.body.name || 'New Item',
                wishlistId: Number(wishlistId),
                imageUrl: imageUrl,
                uploadStatus: file ? 'PENDING' : 'COMPLETED',
                aiStatus: file ? 'PENDING' : 'SKIPPED',
                notes: req.body.notes || null,
                price: validatedPrice,
                // Buyer's intended/max buy price for price-aware matchmaking. Only
                // set priceCurrency when a maxPrice was actually supplied (a currency
                // with no price is meaningless for the comparison).
                ...(maxPriceParsed.value !== null
                    ? { maxPrice: maxPriceParsed.value, priceCurrency: priceCurrencyParsed.value }
                    : {}),
                proxy_end_user_id: safeProxyId
            }
        });

        // 2. Return response immediately (100ms instead of 4000ms!)
        res.status(201).json(item);

        // 3. Trigger background upload + AI processing ONLY if file exists
        if (file && (userId || wishlist.userId)) {
            processItemUpload(item.id, file.path, file.originalname, userId || wishlist.userId);
        }

    } catch (error) {
        console.error('Create Item Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export { deleteItem } from './wishDeleteController';

export { updateItem } from './wishItemController';

export { createItemFromUrl } from './legacyWishCreateController';

// Clone an item to my own wishlist
export { cloneItem } from './wishCloneController';

// Watch an item
export const watchItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params; // Item ID

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid item ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        await prisma.itemWatch.create({
            data: {
                userId: userId,
                itemId: Number(id)
            }
        });

        res.json({ message: 'Item watched successfully' });
    } catch (error: any) {
        // P2002: Unique constraint violation
        if (error.code === 'P2002') {
            return res.json({ message: 'Already watching' });
        }
        console.error('Watch Item Error:', error);
        res.status(500).json({ error: 'Failed to watch item', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Get single item details (Public/Visitor view)
export { getItem, getPublicItems } from './wishItemReadController';

// ---------------------------------------------------------------------------
// EClaw matchmaking additions
// ---------------------------------------------------------------------------

const SEARCH_MAX_LIMIT = 50;
const SEARCH_DEFAULT_LIMIT = 20;

/**
 * Coerce a query param into a bounded non-negative integer.
 * Falls back to `fallback` on missing/NaN; caps at `max`.
 */
const clampInt = (raw: unknown, fallback: number, max: number): number => {
    const n = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(Math.floor(n), max);
};

/**
 * GET /api/items/search?q=&limit=&offset=
 *
 * Net-new public search endpoint. REPLACES the previously-ignored `?q=` on
 * getPublicItems. Case-insensitive `contains` over item name + notes, paginated
 * via limit/offset. Public (no auth) — mirrors GET /api/items/public — but only
 * returns non-hidden items and never leaks proxy_end_user_id/owner PII.
 */
export const searchItems = async (req: Request, res: Response) => {
    try {
        const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
        const q = typeof rawQ === 'string' ? rawQ.trim() : '';

        if (!q) {
            return res.status(400).json({
                error: 'Query parameter "q" is required',
                errorCode: API_ERROR_CODES.INVALID_INPUT,
            });
        }
        if (q.length > 200) {
            return res.status(400).json({
                error: 'Query too long (Max 200)',
                errorCode: API_ERROR_CODES.INVALID_INPUT,
            });
        }

        const limit = clampInt(req.query.limit, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT) || SEARCH_DEFAULT_LIMIT;
        const offset = clampInt(req.query.offset, 0, Number.MAX_SAFE_INTEGER);

        const where = {
            isHidden: false,
            // Only items on a PUBLIC wishlist may surface. Wishlist.isPublic
            // defaults to false, so private lists are excluded by construction.
            wishlist: { is: { isPublic: true } },
            OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { notes: { contains: q, mode: 'insensitive' as const } },
            ],
        };

        const [items, total] = await Promise.all([
            prisma.item.findMany({
                where,
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                // Explicit select: never expose proxy_end_user_id to the public,
                // and never leak the list owner's name/avatar via search.
                select: {
                    id: true,
                    name: true,
                    price: true,
                    currency: true,
                    // Price-aware matchmaking (card_e1b8af79): surface the numeric
                    // matchmaking prices so the EClaw side can run its price-compat
                    // filter (buyer.maxPrice >= seller.askPrice, same currency).
                    // Nullable — a listing/wish without a price returns null here and
                    // the matcher falls back to name/tags-only.
                    askPrice: true,
                    maxPrice: true,
                    priceCurrency: true,
                    imageUrl: true,
                    notes: true,
                    link: true,
                    createdAt: true,
                    wishlistId: true,
                    wishlist: {
                        select: {
                            id: true,
                            title: true,
                            isPublic: true,
                        },
                    },
                },
            }),
            prisma.item.count({ where }),
        ]);

        res.json({
            query: q,
            limit,
            offset,
            total,
            count: items.length,
            items,
        });
    } catch (error) {
        console.error('Search Items Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

/**
 * GET /api/items/by-eclaw/:code
 *
 * Seller LIST path for matchmaking: list the items a *verified* EClaw entity
 * has listed (items whose proxy_end_user_id === `eclaw:<code>`). The public
 * code is VERIFIED against EClaw's public-code index before any DB read, so a
 * spoofed `eclaw:` string resolves to nothing. Only public display fields are
 * returned; proxy_end_user_id itself is never echoed.
 */
export const listItemsByEclawCode = async (req: Request, res: Response) => {
    try {
        const code = String(req.params.code || '').trim().toLowerCase();

        const verified = await verifyPublicCode(code);
        if (!verified.ok) {
            // 404 for not_found/bad_format (unknown seller); 502 for upstream.
            if (verified.reason === 'upstream_error') {
                return res.status(502).json({
                    error: 'EClaw public-code verification unavailable',
                    errorCode: API_ERROR_CODES.INTERNAL_ERROR,
                });
            }
            return res.status(404).json({
                error: 'Unknown or unverifiable EClaw public code',
                errorCode: API_ERROR_CODES.USER_NOT_FOUND,
            });
        }

        const limit = clampInt(req.query.limit, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT) || SEARCH_DEFAULT_LIMIT;
        const offset = clampInt(req.query.offset, 0, Number.MAX_SAFE_INTEGER);
        const proxyId = `${ECLAW_PUBLIC_CODE_PREFIX}${verified.entity!.publicCode}`;

        // Only surface listings that sit on a PUBLIC wishlist (isPublic defaults
        // to false → a seller's items on a private list stay private).
        const where = {
            isHidden: false,
            proxy_end_user_id: proxyId,
            wishlist: { is: { isPublic: true } },
        };
        const [items, total] = await Promise.all([
            prisma.item.findMany({
                where,
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    price: true,
                    currency: true,
                    // Price-aware matchmaking (card_e1b8af79) — see searchItems.
                    askPrice: true,
                    maxPrice: true,
                    priceCurrency: true,
                    imageUrl: true,
                    notes: true,
                    link: true,
                    createdAt: true,
                    wishlistId: true,
                },
            }),
            prisma.item.count({ where }),
        ]);

        res.json({
            seller: {
                publicCode: verified.entity!.publicCode,
                name: verified.entity!.name,
                character: verified.entity!.character,
            },
            limit,
            offset,
            total,
            count: items.length,
            items,
        });
    } catch (error) {
        console.error('List Items By EClaw Code Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

/**
 * POST /api/items/upsert-listing   (EClaw-agent-authed — NO merchant key)
 *
 * Seller UPSERT path bound to a VERIFIED EClaw agent identity (card_e30cf03d).
 * The authenticateEclawAgent middleware has already proven the caller against
 * EClaw and set req.eclawAgent.publicCode — the listing is ALWAYS written under
 * THAT code. Body: { wishlistId, name, notes?, price?, itemId? }. Any publicCode /
 * proxy_end_user_id in the body that names a DIFFERENT code is rejected (a caller
 * can never write under a code it does not control). If `itemId` is given AND that
 * item already belongs to this verified code, the listing is updated; otherwise a
 * new listing is created.
 */
export const upsertEclawListing = async (req: AuthRequest, res: Response) => {
    try {
        // Identity was proven by authenticateEclawAgent; publicCode is the caller's OWN.
        const code = req.eclawAgent?.publicCode;
        if (!code || !/^[a-z0-9]{6}$/.test(code)) {
            return res.status(401).json({ error: 'Unauthorized', errorCode: API_ERROR_CODES.MISSING_TOKEN });
        }

        // Ownership binding: if the body names a code (bare or eclaw:<code>), it
        // MUST equal the verified caller's own code. We always write under `code`.
        const rawClaimed: unknown = req.body.publicCode ?? req.body.proxy_end_user_id;
        if (typeof rawClaimed === 'string' && rawClaimed.length > 0) {
            const claimed = rawClaimed.toLowerCase().startsWith(ECLAW_PUBLIC_CODE_PREFIX)
                ? parseEclawPublicCode(rawClaimed)
                : (/^[a-z0-9]{6}$/.test(rawClaimed.trim().toLowerCase()) ? rawClaimed.trim().toLowerCase() : null);
            if (claimed && claimed !== code) {
                return res.status(403).json({
                    error: 'Cannot write a listing under a public code you do not control',
                    errorCode: API_ERROR_CODES.ACCESS_DENIED,
                });
            }
        }

        const { wishlistId, name, notes, itemId } = req.body;

        if (!name || typeof name !== 'string' || name.length > 200) {
            return res.status(400).json({ error: 'A valid name (Max 200) is required', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        if (notes && String(notes).length > 1000) {
            return res.status(400).json({ error: 'Notes too long (Max 1000)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        // Validate price (String? column — store numeric-as-string like createItem).
        let validatedPrice: string | null = null;
        if (req.body.price !== undefined && req.body.price !== null && req.body.price !== '') {
            if (isNaN(Number(req.body.price))) {
                return res.status(400).json({ error: 'Price must be a number', errorCode: API_ERROR_CODES.INVALID_INPUT });
            }
            validatedPrice = String(req.body.price);
        }

        // Price-aware matchmaking (card_e1b8af79): a SELLER declares an ASKING price
        // on the listing. OPTIONAL, validated (finite, >= 0, bounded); invalid ⇒ 400.
        const askPriceParsed = parseOptionalPrice(req.body.askPrice);
        if (!askPriceParsed.ok) {
            return res.status(400).json({ error: askPriceParsed.error || 'Invalid askPrice', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        const listingCurrencyParsed = parseOptionalCurrency(req.body.priceCurrency);
        if (!listingCurrencyParsed.ok) {
            return res.status(400).json({ error: listingCurrencyParsed.error || 'Invalid priceCurrency', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        // Only persist priceCurrency alongside a real askPrice (currency w/o price is
        // meaningless for the comparison). null askPrice ⇒ leave the fields untouched.
        const listingPriceData = askPriceParsed.value !== null
            ? { askPrice: askPriceParsed.value, priceCurrency: listingCurrencyParsed.value }
            : {};

        const proxyId = `${ECLAW_PUBLIC_CODE_PREFIX}${code}`;

        // UPDATE path: itemId must exist AND already belong to this verified code.
        if (itemId !== undefined && itemId !== null) {
            if (isNaN(Number(itemId))) {
                return res.status(400).json({ error: 'Invalid itemId', errorCode: API_ERROR_CODES.INVALID_INPUT });
            }
            const existing = await prisma.item.findUnique({ where: { id: Number(itemId) } });
            if (!existing) {
                return res.status(404).json({ error: 'Item not found', errorCode: API_ERROR_CODES.ITEM_NOT_FOUND });
            }
            if (existing.proxy_end_user_id !== proxyId) {
                return res.status(403).json({
                    error: 'Item does not belong to this EClaw public code',
                    errorCode: API_ERROR_CODES.ACCESS_DENIED,
                });
            }
            const updated = await prisma.item.update({
                where: { id: Number(itemId) },
                data: {
                    name,
                    notes: notes ?? existing.notes,
                    ...(validatedPrice !== null ? { price: validatedPrice } : {}),
                    ...listingPriceData,
                },
                select: { id: true, name: true, price: true, currency: true, askPrice: true, maxPrice: true, priceCurrency: true, notes: true, wishlistId: true, createdAt: true },
            });
            return res.json({ upserted: 'updated', seller: code, item: updated });
        }

        // CREATE path: need a wishlist to attach to.
        if (wishlistId === undefined || isNaN(Number(wishlistId))) {
            return res.status(400).json({ error: 'A valid wishlistId is required to create a listing', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        const wishlist = await prisma.wishlist.findUnique({ where: { id: Number(wishlistId) } });
        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found', errorCode: API_ERROR_CODES.WISHLIST_NOT_FOUND });
        }

        const created = await prisma.item.create({
            data: {
                name,
                wishlistId: Number(wishlistId),
                notes: notes ?? null,
                price: validatedPrice,
                ...listingPriceData,
                imageUrl: 'https://ui-avatars.com/api/?name=Item&background=random',
                uploadStatus: 'COMPLETED',
                aiStatus: 'SKIPPED',
                proxy_end_user_id: proxyId,
            },
            select: { id: true, name: true, price: true, currency: true, askPrice: true, maxPrice: true, priceCurrency: true, notes: true, wishlistId: true, createdAt: true },
        });
        return res.status(201).json({ upserted: 'created', seller: code, item: created });
    } catch (error) {
        console.error('Upsert EClaw Listing Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};
