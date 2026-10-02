import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { API_ERROR_CODES } from '../lib/errorCodes';

/** This is a current claim list, not a payment or immutable delivery receipt.
 * Claiming an item never grants ongoing access to a newly private/hidden wish. */
export async function getPurchasedItems(req: AuthRequest, res: Response) {
    res.set('Cache-Control', 'private, no-store');
    try {
        const userId = req.user!.id;
        const rows = await prisma.$transaction(tx => tx.item.findMany({
            where: { purchasedById: userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            select: { id: true, name: true, price: true, currency: true, link: true, imageUrl: true, updatedAt: true, isHidden: true,
                wishlist: { select: { title: true, userId: true, isPublic: true,
                    user: { select: { id: true, name: true, nicknames: true, avatarUrl: true, isAvatarVisible: true } } } } },
        }), { isolationLevel: 'RepeatableRead' });
        return res.json(rows.map(row => {
            if (row.wishlist.userId !== userId && (row.isHidden || !row.wishlist.isPublic)) return { id: row.id, updatedAt: row.updatedAt, unavailable: true };
            const { user } = row.wishlist;
            return { id: row.id, name: row.name, price: row.price, currency: row.currency, link: row.link, imageUrl: row.imageUrl,
                updatedAt: row.updatedAt, unavailable: false,
                wishlist: { title: row.wishlist.title, user: { id: user.id, name: user.name, nicknames: user.nicknames, avatarUrl: user.isAvatarVisible ? user.avatarUrl : null } } };
        }));
    } catch {
        console.error('Claim history read unavailable; database and identity details withheld');
        return res.status(500).json({ error: 'History unavailable', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
}

export async function getPurchaseHistory(req: AuthRequest, res: Response) {
    res.set('Cache-Control', 'private, no-store');
    try {
        const rows = await prisma.purchase.findMany({ where: { userId: req.user!.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true, type: true, amount: true, currency: true, status: true, createdAt: true } });
        return res.json(rows);
    } catch {
        console.error('Account history read unavailable; database and identity details withheld');
        return res.status(500).json({ error: 'History unavailable', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
}
