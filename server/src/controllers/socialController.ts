import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import { API_ERROR_CODES } from '../lib/errorCodes';
import { socialCard, socialCardSelect, socialSearchQuery, socialSearchWhere } from '../lib/socialPrivacy';

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

// Follow a user
export const followUser = async (req: Request, res: Response) => {
    const { id } = req.params; // ID of user to follow
    const currentUserId = (req as any).user.id;
    const targetId = parseInt(id as string);
    if (isNaN(targetId)) {
        return res.status(400).json({ error: 'Invalid user ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
    }

    if (targetId === currentUserId) {
        return res.status(400).json({ error: 'Cannot follow yourself', errorCode: API_ERROR_CODES.INVALID_INPUT });
    }

    try {
        // Check if user exists and check limit
        const currentUser = await prisma.user.findUnique({
            where: { id: currentUserId },
            include: {
                _count: {
                    select: { following: true }
                }
            }
        });

        if (!currentUser) return res.status(404).json({ error: 'Current user not found' });

        if (!currentUser.isPremium && currentUser._count.following >= currentUser.maxFollowing) {
            return res.status(403).json({ error: `Following limit reached (${currentUser.maxFollowing}). Please expand capacity.` });
        }

        // Check if target user exists
        const targetUser = await prisma.user.findUnique({
            where: { id: targetId }
        });

        if (!targetUser) {
            return res.status(404).json({ error: 'User to follow not found', errorCode: API_ERROR_CODES.USER_NOT_FOUND });
        }

        // Check if already following
        const existingFollow = await prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: currentUserId,
                    followingId: targetId
                }
            }
        });

        if (existingFollow) {
            return res.status(400).json({ error: 'Already following' });
        }

        await prisma.follow.create({
            data: {
                followerId: currentUserId,
                followingId: targetId
            }
        });

        res.json({ message: 'Followed successfully' });
    } catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ error: 'Failed to follow user', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Unfollow a user
export const unfollowUser = async (req: Request, res: Response) => {
    const { id } = req.params; // ID of user to unfollow
    const currentUserId = (req as any).user.id;
    const targetId = parseInt(id as string);

    if (isNaN(targetId)) {
        return res.status(400).json({ error: 'Invalid user ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
    }

    try {
        await prisma.follow.delete({
            where: {
                followerId_followingId: {
                    followerId: currentUserId,
                    followingId: targetId
                }
            }
        });

        res.json({ message: 'Unfollowed successfully' });
    } catch (error) {
        console.error('Unfollow error:', error);
        res.status(500).json({ error: 'Failed to unfollow user', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

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

export const getUpcomingBirthdays = async (req: Request, res: Response) => {
    res.set('Cache-Control', 'private, no-store');
    const currentUserId = (req as any).user.id;

    try {
        const follows = await prisma.follow.findMany({
            where: { followerId: currentUserId },
            select: { following: { select: socialCardSelect } }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        const upcoming = follows
            .filter(f => f.following.birthday && f.following.isBirthdayVisible)
            .map(f => {
                const bday = new Date(f.following.birthday!);
                // Construct next birthday for this year
                let nextBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());

                // If passed, move to next year
                if (nextBday < today) {
                    nextBday.setFullYear(today.getFullYear() + 1);
                }

                return { ...f.following, nextBday };
            })
            // Filter: Must be within next 30 days
            .filter(f => f.nextBday >= today && f.nextBday <= thirtyDaysFromNow)
            // Sort: Nearest first
            .sort((a, b) => a.nextBday.getTime() - b.nextBday.getTime())
            .map(f => ({
                id: f.id,
                name: f.name,
                nicknames: f.nicknames,
                avatarUrl: f.isAvatarVisible ? f.avatarUrl : null,
                birthday: f.birthday,
                nextBirthday: f.nextBday
            }));

        res.json(upcoming);
    } catch (error) {
        console.error('Birthdays unavailable; personal and database details withheld');
        res.status(500).json({ error: 'Failed to fetch birthdays', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Get public wishlists of a specific user
export const getUserPublicWishlists = async (req: Request, res: Response) => {
    const { id } = req.params; // Target user ID
    const targetId = parseInt(id as string);
    if (isNaN(targetId)) {
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
