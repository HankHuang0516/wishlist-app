import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { API_ERROR_CODES } from '../lib/errorCodes';

interface AuthRequest extends Request {
    user?: any;
}

export const getWishlists = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const wishlists = await prisma.wishlist.findMany({
            where: { userId },
            include: { items: true },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(wishlists);
    } catch (error) {
        console.error('Error fetching wishlists:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export const createWishlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { title, description, isPublic } = req.body;

        if (!title) {
            return res.status(400).json({
                error: 'Title is required',
                errorCode: API_ERROR_CODES.MISSING_FIELDS,
                missingFields: ['title']
            });
        }

        if (title.length > 200) {
            return res.status(400).json({ error: 'Title too long (Max 200)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        if (description && description.length > 1000) {
            return res.status(400).json({ error: 'Description too long (Max 1000)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }


        const user = await prisma.user.findUnique({ where: { id: userId } });
        const isPremium = user?.isPremium || false;
        const globalLimit = user?.maxWishlistItems || 100;

        const wishlist = await prisma.wishlist.create({
            data: {
                title,
                description,
                isPublic: isPublic !== undefined ? isPublic : true,
                userId,
                maxItems: isPremium ? 10000 : globalLimit
            }
        });

        res.status(201).json(wishlist);
    } catch (error) {
        console.error('Error creating wishlist:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export const getWishlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid wishlist ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        const wishlist = await prisma.wishlist.findUnique({
            where: { id: Number(id) },
            include: {
                items: {
                    include: {
                        originalUser: {
                            select: {
                                id: true,
                                name: true,
                                nicknames: true
                            }
                        }
                    }
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        nicknames: true
                    }
                }
            }
        });

        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found', errorCode: API_ERROR_CODES.WISHLIST_NOT_FOUND });
        }

        // Allow access if owner or if public
        if (wishlist.userId !== userId && !wishlist.isPublic) {
            return res.status(403).json({ error: 'Access denied', errorCode: API_ERROR_CODES.ACCESS_DENIED });
        }

        res.json(wishlist);
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export const updateWishlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid wishlist ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        const { title, description, isPublic } = req.body;

        if (title && title.length > 200) {
            return res.status(400).json({ error: 'Title too long (Max 200)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        if (description && description.length > 1000) {
            return res.status(400).json({ error: 'Description too long (Max 1000)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        const wishlist = await prisma.wishlist.findUnique({
            where: { id: Number(id) }
        });

        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found', errorCode: API_ERROR_CODES.WISHLIST_NOT_FOUND });
        }

        if (wishlist.userId !== userId) {
            return res.status(403).json({ error: 'Access denied', errorCode: API_ERROR_CODES.ACCESS_DENIED });
        }

        // Fix: Ensure description is string if provided
        let safeDescription = description;
        if (description !== undefined && typeof description !== 'string' && description !== null) {
            safeDescription = String(description);
        }

        const updatedWishlist = await prisma.wishlist.update({
            where: { id: Number(id) },
            data: {
                title: title || wishlist.title,
                description: safeDescription !== undefined ? safeDescription : wishlist.description,
                isPublic: isPublic !== undefined ? isPublic : wishlist.isPublic
            }
        });

        res.json(updatedWishlist);
    } catch (error) {
        console.error('Error updating wishlist:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export const deleteWishlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid wishlist ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        const wishlist = await prisma.wishlist.findUnique({
            where: { id: Number(id) }
        });

        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found', errorCode: API_ERROR_CODES.WISHLIST_NOT_FOUND });
        }

        if (wishlist.userId !== userId) {
            return res.status(403).json({ error: 'Access denied', errorCode: API_ERROR_CODES.ACCESS_DENIED });
        }

        await prisma.wishlist.delete({
            where: { id: Number(id) }
        });

        res.json({ message: 'Wishlist deleted successfully' });
    } catch (error) {
        console.error('Error deleting wishlist:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};
