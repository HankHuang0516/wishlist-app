
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { flickrService } from '../lib/flickr';
import fs from 'fs';
import { getAiUsageInfo } from '../lib/usageService';
import { ownProfileSelect } from '../lib/ownProfile';
import { updateLegacyProfile } from './profileUpdateController';
import { followUserId } from '../lib/followOperation';

// import { API_ERROR_CODES } from '../lib/errorCodes'; // Reverting to likely correct path if it exists, or checking list_dir result first.
// Actually, let's wait for list_dir. But I can fix the content based on what I see.
import { API_ERROR_CODES } from '../lib/errorCodes';

interface AuthRequest extends Request {
    user?: any;
}

// Get current user's full profile (Settings page)
export const getMe = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId }, select: ownProfileSelect
        });

        if (!user) return res.status(404).json({ error: 'User not found', errorCode: API_ERROR_CODES.USER_NOT_FOUND });

        // Settings may see own profile, never password hashes, OTP/reset/email
        // bearer links or API keys. API-key management has its separate route.
        res.setHeader('Cache-Control', 'private, no-store');
        res.json(user);
    } catch (error) {
        console.error('Profile read unavailable; request and database details withheld');
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Update current user's profile
export const updateMe = updateLegacyProfile;

// Get another user's public profile (Respecting privacy)
export const getUserProfile = async (req: Request, res: Response) => {
    res.set('Cache-Control', 'private, no-store');
    try {
        const { id } = req.params;

        let targetId:number;
        try { targetId=followUserId(id); } catch {
            return res.status(400).json({ error: 'Invalid user ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        const user = await prisma.user.findUnique({
            where: { id: targetId },
            select: {id:true,name:true,nicknames:true,phoneNumber:true,isPhoneVisible:true,realName:true,isRealNameVisible:true,address:true,isAddressVisible:true,birthday:true,isBirthdayVisible:true,avatarUrl:true,isAvatarVisible:true}
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Check if current user is following this profile user
        const currentUserId = (req as AuthRequest).user?.id;
        let isFollowing = false;

        if (currentUserId && currentUserId !== user.id) {
            const follow = await prisma.follow.findUnique({
                where: {
                    followerId_followingId: {
                        followerId: currentUserId,
                        followingId: user.id
                    }
                }
            });
            isFollowing = !!follow;
        }

        // Apply Privacy Filters
        const publicProfile = {
            id: user.id,
            name: user.name,
            nicknames: user.nicknames,

            // Privacy Controlled Fields
            phoneNumber: user.isPhoneVisible ? user.phoneNumber : null,
            realName: user.isRealNameVisible ? user.realName : null,
            address: user.isAddressVisible ? user.address : null,
            birthday: user.isBirthdayVisible ? user.birthday : null, // New

            avatarUrl: user.isAvatarVisible ? user.avatarUrl : null,
            isFollowing // Added
        };

        res.json(publicProfile);
    } catch (error) {
        console.error('Public profile unavailable; personal and database details withheld');
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Handle Avatar Upload
export const uploadAvatar = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded', errorCode: API_ERROR_CODES.FILE_UPLOAD_FAILED });
        }

        let avatarUrl = `/uploads/${file.filename}`;

        try {
            const imageBuffer = fs.readFileSync(file.path);
            const flickrUrl = await flickrService.uploadAvatarImage(
                imageBuffer,
                `avatar_${userId}_${Date.now()}.jpg`,
                userId
            );
            if (flickrUrl) {
                avatarUrl = flickrUrl;
            }
        } catch (err) {
            console.error('[UploadAvatar] Flickr upload failed:', err);
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { avatarUrl }
        });

        res.json({ avatarUrl: updatedUser.avatarUrl });
    } catch (error) {
        console.error('Upload Avatar Error:', error);
        res.status(500).json({ error: 'Failed to upload avatar', errorCode: API_ERROR_CODES.FILE_UPLOAD_FAILED });
    }
};

export { updatePassword } from './accountSecurityController';

// Cancel Subscription
export const cancelSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;

        // 1. Revert User Status
        await prisma.user.update({
            where: { id: userId },
            data: {
                isPremium: false,
                maxWishlistItems: 100, // Revert to default
                maxFollowing: 100      // Revert to default
            }
        });

        // 2. Revert Wishlists
        await prisma.wishlist.updateMany({
            where: { userId },
            data: { maxItems: 100 }
        });

        // 3. Record Cancellation in History (Zero amount)
        await prisma.purchase.create({
            data: {
                userId,
                type: 'CANCEL_PREMIUM',
                amount: 0,
                currency: 'TWD',
                status: 'CANCELLED'
            }
        });

        res.json({ message: 'Subscription cancelled. Limits reverted to 100.' });
    } catch (error) {
        console.error('Cancel Subscription Error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription', errorCode: API_ERROR_CODES.PAYMENT_FAILED });
    }
};

// Monetization: Mock Payment
export const updateSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { type } = req.body; // 'limit' or 'premium'

        if (type === 'premium') {
            await prisma.user.update({
                where: { id: userId },
                data: {
                    isPremium: true,
                    maxWishlistItems: 10000, // Set to "unlimited" value
                    maxFollowing: 10000       // Set to "unlimited" value
                }
            });
            // Let's update wishlists for now.
            await prisma.wishlist.updateMany({
                where: { userId },
                data: { maxItems: 10000 }
            });

            // Record Purchase
            await prisma.purchase.create({
                data: {
                    userId,
                    type: 'PREMIUM',
                    amount: 90,
                    currency: 'TWD'
                }
            });

            return res.json({ message: 'Upgraded to Premium!' });
        }

        if (type === 'limit') {
            const { target } = req.body; // 'wishlists' (default) or 'following'

            if (target === 'following') {
                const updatedUser = await prisma.user.update({
                    where: { id: userId },
                    data: { maxFollowing: { increment: 10 } }
                });

                // Record Purchase
                await prisma.purchase.create({
                    data: {
                        userId,
                        type: 'LIMIT_FOLLOWING',
                        amount: 30,
                        currency: 'TWD'
                    }
                });

                return res.json({
                    message: `Following limit increased! New limit: ${updatedUser.maxFollowing}`,
                    newLimit: updatedUser.maxFollowing
                });
            }

            // Default: Wishlists Global Limit
            // 1. Update User's global limit
            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: { maxWishlistItems: { increment: 10 } }
            });

            // Record Purchase
            await prisma.purchase.create({
                data: {
                    userId,
                    type: 'LIMIT_WISHLIST',
                    amount: 30,
                    currency: 'TWD'
                }
            });

            // 2. Sync to ALL existing wishlists of this user
            await prisma.wishlist.updateMany({
                where: { userId: userId },
                data: { maxItems: updatedUser.maxWishlistItems }
            });

            return res.json({
                message: `Global limit increased! New limit: ${updatedUser.maxWishlistItems}`,
                newLimit: updatedUser.maxWishlistItems
            });
        }

        return res.status(400).json({ error: 'Invalid type', errorCode: API_ERROR_CODES.INVALID_INPUT });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Transaction failed', errorCode: API_ERROR_CODES.PAYMENT_FAILED });
    }
};

export { getPurchasedItems, getPurchaseHistory } from './purchaseHistoryController';

// Get AI Usage Info
export const getAiUsage = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const usage = await getAiUsageInfo(userId);
        res.json(usage);
    } catch (error) {
        console.error('Get AI Usage Error:', error);
        res.status(500).json({ error: 'Failed to fetch AI usage', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export { generateUserApiKey, getUserApiKey, generateAiPrompt } from './apiIntegrationController';

// Get Delivery Info (Mutual Friends Only - for Gift Sending)
export const getDeliveryInfo = async (req: AuthRequest, res: Response) => {
    try {
        const currentUserId = req.user.id;
        const targetUserId = Number(req.params.id);

        if (isNaN(targetUserId)) {
            return res.status(400).json({ error: 'Invalid user ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        if (currentUserId === targetUserId) {
            return res.status(400).json({ error: 'Cannot request your own delivery info via this endpoint', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        // Check mutual friendship (both follow each other)
        const [iFollow, theyFollow] = await Promise.all([
            prisma.follow.findUnique({
                where: {
                    followerId_followingId: {
                        followerId: currentUserId,
                        followingId: targetUserId
                    }
                }
            }),
            prisma.follow.findUnique({
                where: {
                    followerId_followingId: {
                        followerId: targetUserId,
                        followingId: currentUserId
                    }
                }
            })
        ]);

        if (!iFollow || !theyFollow) {
            return res.status(403).json({ error: 'Access denied. You must be mutual friends to access delivery information.', errorCode: API_ERROR_CODES.ACCESS_DENIED });
        }

        // Mutual friends confirmed, fetch delivery info
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
                realName: true,
                phoneNumber: true,
                address: true
            }
        });

        if (!targetUser) {
            return res.status(404).json({ error: 'User not found', errorCode: API_ERROR_CODES.USER_NOT_FOUND });
        }

        res.json({
            realName: targetUser.realName,
            phoneNumber: targetUser.phoneNumber,
            address: targetUser.address
        });
    } catch (error) {
        console.error('Get Delivery Info Error:', error);
        res.status(500).json({ error: 'Failed to fetch delivery info', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};
