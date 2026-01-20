"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAiPrompt = exports.getDeliveryInfo = exports.getUserApiKey = exports.generateUserApiKey = exports.getAiUsage = exports.getPurchaseHistory = exports.getPurchasedItems = exports.updateSubscription = exports.cancelSubscription = exports.updatePassword = exports.uploadAvatar = exports.getUserProfile = exports.updateMe = exports.getMe = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const flickr_1 = require("../lib/flickr");
const fs_1 = __importDefault(require("fs"));
const usageService_1 = require("../lib/usageService");
const apiKey_1 = require("../lib/apiKey");
// Get current user's full profile (Settings page)
const getMe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        // Return everything for the owner
        res.json(user);
    }
    catch (error) {
        console.error('Get Me Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getMe = getMe;
// Update current user's profile
const updateMe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { name, avatarUrl, realName, address, nicknames, email, // Allow setting email only if currently NULL
        isAvatarVisible, isPhoneVisible, isRealNameVisible, isAddressVisible, isEmailVisible, // New: email visibility toggle
        isBirthdayVisible } = req.body;
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
            const currentUser = yield prisma_1.default.user.findUnique({ where: { id: userId } });
            if (currentUser && !currentUser.email) {
                // Allow setting email only if it's currently null
                emailUpdate = email;
            }
            // If user already has an email, ignore the update (don't overwrite)
        }
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: userId },
            data: Object.assign(Object.assign({ name,
                avatarUrl,
                realName,
                address, nicknames: processedNicknames }, (emailUpdate !== undefined && { email: emailUpdate })), { isAvatarVisible,
                isPhoneVisible,
                isRealNameVisible,
                isAddressVisible,
                isEmailVisible,
                isBirthdayVisible })
        });
        res.json(updatedUser);
    }
    catch (error) {
        console.error('Update Me Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.updateMe = updateMe;
// Get another user's public profile (Respecting privacy)
const getUserProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const user = yield prisma_1.default.user.findUnique({
            where: { id: Number(id) }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        // Check if current user is following this profile user
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        let isFollowing = false;
        if (currentUserId && currentUserId !== user.id) {
            const follow = yield prisma_1.default.follow.findUnique({
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
    }
    catch (error) {
        console.error('Get User Profile Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getUserProfile = getUserProfile;
// Handle Avatar Upload
const uploadAvatar = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        let avatarUrl = `/uploads/${file.filename}`;
        try {
            const imageBuffer = fs_1.default.readFileSync(file.path);
            const flickrUrl = yield flickr_1.flickrService.uploadImage(imageBuffer, `avatar_${userId}_${Date.now()}.jpg`, `Avatar for User ${userId}`);
            if (flickrUrl) {
                avatarUrl = flickrUrl;
            }
        }
        catch (err) {
            console.error('[UploadAvatar] Flickr upload failed:', err);
        }
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: userId },
            data: { avatarUrl }
        });
        res.json({ avatarUrl: updatedUser.avatarUrl });
    }
    catch (error) {
        console.error('Upload Avatar Error:', error);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});
exports.uploadAvatar = uploadAvatar;
const updatePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;
        const user = yield prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const isMatch = yield bcryptjs_1.default.compare(currentPassword, user.password);
        if (!isMatch)
            return res.status(400).json({ error: 'Incorrect current password' });
        const hashedPassword = yield bcryptjs_1.default.hash(newPassword, 10);
        yield prisma_1.default.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });
        res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});
exports.updatePassword = updatePassword;
// Cancel Subscription
const cancelSubscription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        // 1. Revert User Status
        yield prisma_1.default.user.update({
            where: { id: userId },
            data: {
                isPremium: false,
                maxWishlistItems: 100, // Revert to default
                maxFollowing: 100 // Revert to default
            }
        });
        // 2. Revert Wishlists
        yield prisma_1.default.wishlist.updateMany({
            where: { userId },
            data: { maxItems: 100 }
        });
        // 3. Record Cancellation in History (Zero amount)
        yield prisma_1.default.purchase.create({
            data: {
                userId,
                type: 'CANCEL_PREMIUM',
                amount: 0,
                currency: 'TWD',
                status: 'CANCELLED'
            }
        });
        res.json({ message: 'Subscription cancelled. Limits reverted to 100.' });
    }
    catch (error) {
        console.error('Cancel Subscription Error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});
exports.cancelSubscription = cancelSubscription;
// Monetization: Mock Payment
const updateSubscription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { type } = req.body; // 'limit' or 'premium'
        if (type === 'premium') {
            yield prisma_1.default.user.update({
                where: { id: userId },
                data: {
                    isPremium: true,
                    maxWishlistItems: 10000, // Set to "unlimited" value
                    maxFollowing: 10000 // Set to "unlimited" value
                }
            });
            // Let's update wishlists for now.
            yield prisma_1.default.wishlist.updateMany({
                where: { userId },
                data: { maxItems: 10000 }
            });
            // Record Purchase
            yield prisma_1.default.purchase.create({
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
                const updatedUser = yield prisma_1.default.user.update({
                    where: { id: userId },
                    data: { maxFollowing: { increment: 10 } }
                });
                // Record Purchase
                yield prisma_1.default.purchase.create({
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
            const updatedUser = yield prisma_1.default.user.update({
                where: { id: userId },
                data: { maxWishlistItems: { increment: 10 } }
            });
            // Record Purchase
            yield prisma_1.default.purchase.create({
                data: {
                    userId,
                    type: 'LIMIT_WISHLIST',
                    amount: 30,
                    currency: 'TWD'
                }
            });
            // 2. Sync to ALL existing wishlists of this user
            yield prisma_1.default.wishlist.updateMany({
                where: { userId: userId },
                data: { maxItems: updatedUser.maxWishlistItems }
            });
            return res.json({
                message: `Global limit increased! New limit: ${updatedUser.maxWishlistItems}`,
                newLimit: updatedUser.maxWishlistItems
            });
        }
        return res.status(400).json({ error: 'Invalid type' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Transaction failed' });
    }
});
exports.updateSubscription = updateSubscription;
// Purchase History
const getPurchasedItems = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const items = yield prisma_1.default.item.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getPurchasedItems = getPurchasedItems;
// Get Account Purchase History (Premium, Limits)
const getPurchaseHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const history = yield prisma_1.default.purchase.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(history);
    }
    catch (error) {
        console.error('Fetch History Error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});
exports.getPurchaseHistory = getPurchaseHistory;
// Get AI Usage Info
const getAiUsage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const usage = yield (0, usageService_1.getAiUsageInfo)(userId);
        res.json(usage);
    }
    catch (error) {
        console.error('Get AI Usage Error:', error);
        res.status(500).json({ error: 'Failed to fetch AI usage' });
    }
});
exports.getAiUsage = getAiUsage;
// Generate API Key
const generateUserApiKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const newApiKey = (0, apiKey_1.generateApiKey)();
        // Check if user already has one? We will overwrite it (regenerate).
        // Since it's unique, we just update.
        yield prisma_1.default.user.update({
            where: { id: userId },
            data: { apiKey: newApiKey }
        });
        res.json({ apiKey: newApiKey });
    }
    catch (error) {
        console.error('Generate API Key Error:', error);
        res.status(500).json({ error: 'Failed to generate API Key' });
    }
});
exports.generateUserApiKey = generateUserApiKey;
// Get API Key
const getUserApiKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId },
            select: { apiKey: true }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json({ apiKey: user.apiKey });
    }
    catch (error) {
        console.error('Get API Key Error:', error);
        res.status(500).json({ error: 'Failed to fetch API Key' });
    }
});
exports.getUserApiKey = getUserApiKey;
// Get Delivery Info (Mutual Friends Only - for Gift Sending)
const getDeliveryInfo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentUserId = req.user.id;
        const targetUserId = Number(req.params.id);
        if (currentUserId === targetUserId) {
            return res.status(400).json({ error: 'Cannot request your own delivery info via this endpoint' });
        }
        // Check mutual friendship (both follow each other)
        const [iFollow, theyFollow] = yield Promise.all([
            prisma_1.default.follow.findUnique({
                where: {
                    followerId_followingId: {
                        followerId: currentUserId,
                        followingId: targetUserId
                    }
                }
            }),
            prisma_1.default.follow.findUnique({
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
        const targetUser = yield prisma_1.default.user.findUnique({
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
    }
    catch (error) {
        console.error('Get Delivery Info Error:', error);
        res.status(500).json({ error: 'Failed to fetch delivery info' });
    }
});
exports.getDeliveryInfo = getDeliveryInfo;
// Generate AI Prompt with API Key for one-click copy
const generateAiPrompt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        // Get user and their API key
        let user = yield prisma_1.default.user.findUnique({
            where: { id: userId },
            select: { name: true, apiKey: true }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        // Auto-generate API key if not exists
        let apiKey = user.apiKey;
        if (!apiKey) {
            apiKey = (0, apiKey_1.generateApiKey)();
            yield prisma_1.default.user.update({
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
    }
    catch (error) {
        console.error('Generate AI Prompt Error:', error);
        res.status(500).json({ error: 'Failed to generate AI prompt' });
    }
});
exports.generateAiPrompt = generateAiPrompt;
