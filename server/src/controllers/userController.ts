
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { flickrService } from '../lib/flickr';
import fs from 'fs';
import { getAiUsageInfo } from '../lib/usageService';
import { generateApiKey } from '../lib/apiKey';

import { API_ERROR_CODES } from '../lib/errorCodes';

interface AuthRequest extends Request {
    user?: any;
}

// Get current user's full profile (Settings page)
export const getMe = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) return res.status(404).json({ error: 'User not found', errorCode: API_ERROR_CODES.USER_NOT_FOUND });

        // Return everything for the owner
        res.json(user);
    } catch (error) {
        console.error('Get Me Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Update current user's profile
export const updateMe = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const {
            name,
            avatarUrl,
            realName,
            address,
            nicknames,
            email, // Allow setting email only if currently NULL
            isAvatarVisible,
            isPhoneVisible,
            isRealNameVisible,
            isAddressVisible,
            isEmailVisible, // New: email visibility toggle
            isBirthdayVisible,
            birthday // Added for validation
        } = req.body;

        // Validation for name (Max 50)
        if (name && name.length > 50) {
            return res.status(400).json({ error: 'Name too long (Max 50)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        // Validation for nicknames (Max 5)
        let processedNicknames = nicknames;
        if (nicknames !== undefined) {
            if (Array.isArray(nicknames)) {
                if (nicknames.length > 5) {
                    return res.status(400).json({ error: 'Maximum 5 nicknames allowed', errorCode: API_ERROR_CODES.INVALID_INPUT });
                }
                processedNicknames = nicknames.join(',');
            } else if (typeof nicknames !== 'string' && nicknames !== null) {
                return res.status(400).json({ error: 'Nicknames must be an array or string', errorCode: API_ERROR_CODES.INVALID_INPUT });
            }
        }

        // Birthday validation
        let validatedBirthday = undefined;
        if (birthday) {
            const date = new Date(birthday);
            if (isNaN(date.getTime())) {
                return res.status(400).json({ error: 'Invalid birthday format', errorCode: API_ERROR_CODES.INVALID_INPUT });
            }
            validatedBirthday = date;
        }

        // Email update logic: only allow if current email is NULL
        let emailUpdate = undefined;
        if (email !== undefined) {
            const currentUser = await prisma.user.findUnique({ where: { id: userId } });
            if (currentUser && !currentUser.email) {
                // Basic email format check
                if (email && !email.includes('@')) {
                    return res.status(400).json({ error: 'Invalid email format', errorCode: API_ERROR_CODES.INVALID_INPUT });
                }
                emailUpdate = email;
            }
        }

        const data: any = {
            name,
            avatarUrl,
            realName,
            address,
            nicknames: processedNicknames,
            isAvatarVisible,
            isPhoneVisible,
            isRealNameVisible,
            isAddressVisible,
            isEmailVisible,
            isBirthdayVisible,
            birthday: validatedBirthday
        };

        // Remove undefined values
        Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);

        if (emailUpdate !== undefined) data.email = emailUpdate;

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data
        });

        res.json(updatedUser);
    } catch (error) {
        console.error('Update Me Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Get another user's public profile (Respecting privacy)
export const getUserProfile = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid user ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        const user = await prisma.user.findUnique({
            where: { id: Number(id) }
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
        console.error('Get User Profile Error:', error);
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
            const flickrUrl = await flickrService.uploadImage(
                imageBuffer,
                `avatar_${userId}_${Date.now()}.jpg`,
                `Avatar for User ${userId}`
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

export const updatePassword = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Incorrect current password', errorCode: API_ERROR_CODES.INVALID_CREDENTIALS });

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update password', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

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

// Purchase History
export const getPurchasedItems = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const items = await prisma.item.findMany({
            where: { purchasedById: userId },
            include: {
                wishlist: {
                    include: {
                        user: {
                            select: { name: true, nicknames: true, avatarUrl: true, id: true }
                        }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Get Account Purchase History (Premium, Limits)
export const getPurchaseHistory = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const history = await prisma.purchase.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(history);
    } catch (error) {
        console.error('Fetch History Error:', error);
        res.status(500).json({ error: 'Failed to fetch history', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

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

// Generate API Key
export const generateUserApiKey = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const newApiKey = generateApiKey();

        // Check if user already has one? We will overwrite it (regenerate).
        // Since it's unique, we just update.

        await prisma.user.update({
            where: { id: userId },
            data: { apiKey: newApiKey }
        });

        res.json({ apiKey: newApiKey });
    } catch (error) {
        console.error('Generate API Key Error:', error);
        res.status(500).json({ error: 'Failed to generate API Key', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Get API Key
export const getUserApiKey = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { apiKey: true }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({ apiKey: user.apiKey });
    } catch (error) {
        console.error('Get API Key Error:', error);
        res.status(500).json({ error: 'Failed to fetch API Key', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

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

// Generate AI Prompt with API Key for one-click copy
export const generateAiPrompt = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;

        // Get user and their API key
        let user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, apiKey: true }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Auto-generate API key if not exists
        let apiKey = user.apiKey;
        if (!apiKey) {
            apiKey = generateApiKey();
            await prisma.user.update({
                where: { id: userId },
                data: { apiKey }
            });
        }

        const promptData = {
            role: "You are a Wishlist.ai assistant helping users manage their wishlists.",
            authentication: {
                api_key: apiKey,
                header: `x-api-key: ${apiKey}`,
                base_url: "https://wishlist-app-production.up.railway.app/api"
            },
            available_apis: {
                wishlists: {
                    list_all: { method: "GET", path: "/wishlists", description: "Get all wishlists" },
                    create: { method: "POST", path: "/wishlists", body: { title: "string" }, description: "Create new wishlist" },
                    get_one: { method: "GET", path: "/wishlists/{id}", description: "Get single wishlist" },
                    update: { method: "PUT", path: "/wishlists/{id}", description: "Update wishlist" },
                    delete: { method: "DELETE", path: "/wishlists/{id}", description: "Delete wishlist" }
                },
                items: {
                    create: { method: "POST", path: "/wishlists/{id}/items", body: { name: "string", price: "string?", notes: "string?" }, description: "Add item to wishlist" },
                    create_from_url: { method: "POST", path: "/wishlists/{id}/items/url", body: { url: "string" }, description: "Auto-fetch item from URL" },
                    get: { method: "GET", path: "/items/{id}", description: "Get item details" },
                    update: { method: "PUT", path: "/items/{id}", description: "Update item" },
                    delete: { method: "DELETE", path: "/items/{id}", description: "Delete item" }
                },
                user: {
                    get_profile: { method: "GET", path: "/users/me", description: "Get my profile" },
                    update_profile: { method: "PUT", path: "/users/me", description: "Update my profile" }
                },
                social: {
                    search_users: { method: "GET", path: "/users/search?q={keyword}", description: "Search users" },
                    follow: { method: "POST", path: "/users/{id}/follow", description: "Follow user" },
                    unfollow: { method: "DELETE", path: "/users/{id}/follow", description: "Unfollow user" },
                    get_user_wishlists: { method: "GET", path: "/users/{id}/wishlists", description: "Get user public wishlists" },
                    get_delivery_info: { method: "GET", path: "/users/{id}/delivery-info", description: "Get delivery info (mutual follow required)" }
                }
            },
            instructions: "Start helping me manage my wishlists now!"
        };

        res.json({
            prompt: JSON.stringify(promptData, null, 2),
            apiKey,
            userName: user.name || 'User'
        });
    } catch (error) {
        console.error('Generate AI Prompt Error:', error);
        res.status(500).json({ error: 'Failed to generate AI prompt', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};
