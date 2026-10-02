import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { API_ERROR_CODES } from '../lib/errorCodes';
import { parseEclawPublicCode, verifyPublicCode, ECLAW_PUBLIC_CODE_PREFIX } from '../lib/eclawBridge';
import { parseOptionalPrice, parseOptionalCurrency } from '../lib/matchmakingPrice';

interface AuthRequest extends Request {
    user?: any;
    merchant?: any;
    // Set by authenticateEclawAgent (card_e30cf03d): the caller's OWN verified
    // EClaw public code. NO merchant key. The write binds proxy_end_user_id to it.
    eclawAgent?: { publicCode: string };
}

export { createItem } from './legacyManualWishController';

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
