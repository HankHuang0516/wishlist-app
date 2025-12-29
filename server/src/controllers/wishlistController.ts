import { Request, Response } from 'express';
import prisma from '../lib/prisma';

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
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createWishlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { title, description, isPublic } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
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
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getWishlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

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
            return res.status(404).json({ error: 'Wishlist not found' });
        }

        // Allow access if owner or if public
        if (wishlist.userId !== userId && !wishlist.isPublic) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(wishlist);
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateWishlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { title, description, isPublic } = req.body;

        const wishlist = await prisma.wishlist.findUnique({
            where: { id: Number(id) }
        });

        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found' });
        }

        if (wishlist.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const updatedWishlist = await prisma.wishlist.update({
            where: { id: Number(id) },
            data: {
                title: title || wishlist.title,
                description: description !== undefined ? description : wishlist.description,
                isPublic: isPublic !== undefined ? isPublic : wishlist.isPublic
            }
        });

        res.json(updatedWishlist);
    } catch (error) {
        console.error('Error updating wishlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteWishlist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const wishlist = await prisma.wishlist.findUnique({
            where: { id: Number(id) }
        });

        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found' });
        }

        if (wishlist.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await prisma.wishlist.delete({
            where: { id: Number(id) }
        });

        res.json({ message: 'Wishlist deleted successfully' });
    } catch (error) {
        console.error('Error deleting wishlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
