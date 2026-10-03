import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import { API_ERROR_CODES } from '../lib/errorCodes';
import { socialCard, socialCardSelect, socialSearchQuery, socialSearchWhere } from '../lib/socialPrivacy';
import { legacyFollow } from './followOperationController';
import { followUserId } from '../lib/followOperation';

// Search users by name or phone (excluding self)
export const searchUsers = async (req: Request, res: Response) => {
    res.set('Cache-Control', 'private, no-store');
    const query = socialSearchQuery(req.query.query);
    const currentUserId = (req as any).user.id;

    if (!query || Object.keys(req.query).some(key => key !== 'query')) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    try {
        const users = await prisma.user.findMany({
            where: socialSearchWhere(query, currentUserId),
            select: {
                ...socialCardSelect,
                followedBy: {
                    where: { followerId: currentUserId }, // Check if currently followed by me
                    select: { followerId: true }
                }
            },
            take: 20,
            orderBy: { id: 'asc' },
        });

        // Format response to indicate if following
        const results = users.map(user => ({
            ...socialCard(user),
            isFollowing: user.followedBy.length > 0
        }));

        res.json(results);
    } catch (error) {
        console.error('Social search unavailable; query and database details withheld');
        res.status(500).json({ error: 'Failed to search users', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export const followUser = legacyFollow(true);
export const unfollowUser = legacyFollow(false);

// Get list of people I follow
export const getFollowing = async (req: Request, res: Response) => {
    res.set('Cache-Control', 'private, no-store');
    const currentUserId = (req as any).user.id;

    try {
        const follows = await prisma.follow.findMany({
            where: { followerId: currentUserId },
            include: {
                following: {
                    select: {
                        ...socialCardSelect,
                        following: {
                            where: { followingId: currentUserId },
                            select: { followerId: true }
                        }
                    }
                }
            }
        });

        const results = follows.map(f => ({
            ...socialCard(f.following),
            isMutual: f.following.following.length > 0
        }));

        res.json(results);
    } catch (error) {
        console.error('Following unavailable; personal and database details withheld');
        res.status(500).json({ error: 'Failed to get following list', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export { getUpcomingBirthdays } from './birthdayController';

// Get public wishlists of a specific user
export const getUserPublicWishlists = async (req: Request, res: Response) => {
    const { id } = req.params; // Target user ID
    let targetId: number;
    try { targetId = followUserId(id); } catch {
        return res.status(400).json({ error: 'Invalid user ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
    }

    try {
        // Public visibility never overrides an individual item's hidden flag.
        // Project explicit public fields instead of serializing Prisma rows.
        const wishlists = await prisma.wishlist.findMany({
            where: { userId: targetId, isPublic: true },
            select: {
                id: true, title: true, description: true, isPublic: true,
                createdAt: true, updatedAt: true,
                items: {
                    where: { isHidden: false },
                    select: {
                        id: true, name: true, price: true, currency: true,
                        askPrice: true, maxPrice: true, priceCurrency: true,
                        link: true, imageUrl: true, notes: true, priority: true,
                        isPurchased: true, createdAt: true, updatedAt: true,
                    },
                },
            },
        });

        res.set('Cache-Control', 'private, no-store').json(wishlists.map(list => ({
            ...list, _count: { items: list.items.length },
        })));
    } catch (error) {
        console.error('Get user wishlists error:', error);
        res.status(500).json({ error: 'Failed to fetch wishlists', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};
