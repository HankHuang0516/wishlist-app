
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { flickrService } from '../lib/flickr';
import fs from 'fs';
import { getAiUsageInfo } from '../lib/usageService';
import { generateApiKey } from '../lib/apiKey';

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

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Return everything for the owner
        res.json(user);
    } catch (error) {
        console.error('Get Me Error:', error);
        res.status(500).json({ error: 'Internal server error' });
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
            isBirthdayVisible
        } = req.body;

        // Validation for nicknames (Max 5)
        let processedNicknames = nicknames;
        if (Array.isArray(nicknames)) {
            if (nicknames.length > 5) {
                return res.status(400).json({ error: 'Maximum 5 nicknames allowed' });
            }
            processedNicknames = nicknames.join(',');
        }

        // Email update logic: only allow if current email is NULL
        let emailUpdate = undefined;
        if (email !== undefined) {
            const currentUser = await prisma.user.findUnique({ where: { id: userId } });
            if (currentUser && !currentUser.email) {
                // Allow setting email only if it's currently null
                emailUpdate = email;
            }
            // If user already has an email, ignore the update (don't overwrite)
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                name,
                avatarUrl,
                realName,
                address,
                nicknames: processedNicknames,
                ...(emailUpdate !== undefined && { email: emailUpdate }),
                isAvatarVisible,
                isPhoneVisible,
                isRealNameVisible,
                isAddressVisible,
                isEmailVisible,
                isBirthdayVisible
            }
        });

        res.json(updatedUser);
    } catch (error) {
        console.error('Update Me Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get another user's public profile (Respecting privacy)
export const getUserProfile = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
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
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Handle Avatar Upload
export const uploadAvatar = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
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
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
};

export const updatePassword = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Incorrect current password' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
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
        res.status(500).json({ error: 'Failed to cancel subscription' });
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

        return res.status(400).json({ error: 'Invalid type' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Transaction failed' });
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
        res.status(500).json({ error: 'Internal server error' });
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
        res.status(500).json({ error: 'Failed to fetch history' });
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
        res.status(500).json({ error: 'Failed to fetch AI usage' });
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
        res.status(500).json({ error: 'Failed to generate API Key' });
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
        res.status(500).json({ error: 'Failed to fetch API Key' });
    }
};

// Get Delivery Info (Mutual Friends Only - for Gift Sending)
export const getDeliveryInfo = async (req: AuthRequest, res: Response) => {
    try {
        const currentUserId = req.user.id;
        const targetUserId = Number(req.params.id);

        if (currentUserId === targetUserId) {
            return res.status(400).json({ error: 'Cannot request your own delivery info via this endpoint' });
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
            return res.status(403).json({ error: 'Access denied. You must be mutual friends to access delivery information.' });
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
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            realName: targetUser.realName,
            phoneNumber: targetUser.phoneNumber,
            address: targetUser.address
        });
    } catch (error) {
        console.error('Get Delivery Info Error:', error);
        res.status(500).json({ error: 'Failed to fetch delivery info' });
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

        const prompt = `你是 Wishlist.ai 助手，幫助用戶管理願望清單。

我的 API Key: ${apiKey}

所有 API 請求都需要加上 header: x-api-key: ${apiKey}
Base URL: https://wishlist-app-production.up.railway.app/api

可用的 API：

【願望清單】
- GET /wishlists - 取得所有清單
- POST /wishlists - 建立新清單 (body: {"title": "清單名稱"})
- GET /wishlists/{id} - 取得單一清單
- PUT /wishlists/{id} - 更新清單
- DELETE /wishlists/{id} - 刪除清單

【項目】
- POST /wishlists/{id}/items - 新增項目 (body: {"name": "物品名稱", "price": "價格", "notes": "備註"})
- POST /wishlists/{id}/items/url - 從網址自動抓取 (body: {"url": "商品頁網址"})
- GET /items/{id} - 取得項目詳情
- PUT /items/{id} - 更新項目
- DELETE /items/{id} - 刪除項目

【用戶】
- GET /users/me - 我的資料
- PUT /users/me - 更新資料

【社交】
- GET /users/search?q=關鍵字 - 搜尋用戶
- POST /users/{id}/follow - 追蹤用戶
- DELETE /users/{id}/follow - 取消追蹤
- GET /users/{id}/wishlists - 查看他人公開清單
- GET /users/{id}/delivery-info - 取得寄送資訊（需互相追蹤）

現在開始協助我管理願望清單吧！`;

        res.json({
            prompt,
            apiKey,
            userName: user.name || '用戶'
        });
    } catch (error) {
        console.error('Generate AI Prompt Error:', error);
        res.status(500).json({ error: 'Failed to generate AI prompt' });
    }
};
