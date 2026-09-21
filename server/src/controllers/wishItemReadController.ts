import { Response, Request } from 'express';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { API_ERROR_CODES } from '../lib/errorCodes';

// Matches existing public-search display fields; never spread a DB item or its
// parent into an outsider response (proxy IDs, AI diagnostics and private list
// metadata are not display fields). Existing public budget fields are retained.
export const publicWishItemSelect = {
    id: true, name: true, price: true, currency: true, askPrice: true,
    maxPrice: true, priceCurrency: true, imageUrl: true, notes: true,
    link: true, createdAt: true, wishlistId: true, isPurchased: true,
    wishlist: { select: { id: true, title: true, isPublic: true } },
} as const;

export async function getPublicItems(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        // Prisma loads relations in separate queries. A repeatable-read snapshot
        // prevents a newly-private parent title/child being mixed into a feed
        // whose visibility predicate was evaluated before that change.
        const items = await prisma.$transaction(tx => tx.item.findMany({
            where: { isHidden: false, wishlist: { isPublic: true } },
            take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: publicWishItemSelect,
        }), { isolationLevel: 'RepeatableRead' });
        return res.json(items);
    } catch {
        console.error('Public wish read unavailable; database details withheld');
        return res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
}

export async function getItem(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    const userId = req.user?.id, id = Number(req.params.id);
    if (!userId) return res.status(401).json({ error: 'Authentication required', errorCode: API_ERROR_CODES.MISSING_TOKEN });
    if (!/^[1-9]\d{0,9}$/.test(String(req.params.id)) || !Number.isSafeInteger(id) || id > 2147483647) return res.status(400).json({ error: 'Invalid item ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
    try {
        // Each branch's authorization is part of the actual SELECT. Do not
        // check visibility then perform a second unguarded read after a race.
        const item = await prisma.$transaction(async tx => {
            const owned = await tx.item.findFirst({
                where: { id, wishlist: { userId } },
                include: { wishlist: { include: { user: { select: { name: true, avatarUrl: true } } } } },
            });
            if (owned) return owned;
            return tx.item.findFirst({
                where: { id, isHidden: false, wishlist: { isPublic: true } },
                select: publicWishItemSelect,
            });
        }, { isolationLevel: 'RepeatableRead' });
        if (!item) return res.status(404).json({ error: 'Item not found', errorCode: API_ERROR_CODES.ITEM_NOT_FOUND });
        return res.json(item);
    } catch {
        console.error('Wish item read unavailable; identity and database details withheld');
        return res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
}
