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
exports.getPurchaseHistory = exports.getPurchasedItems = exports.updateSubscription = exports.cancelSubscription = exports.updatePassword = exports.uploadAvatar = exports.getUserProfile = exports.updateMe = exports.getMe = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
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
        const { name, avatarUrl, realName, address, nicknames, isAvatarVisible, isPhoneVisible, isRealNameVisible, isAddressVisible, isBirthdayVisible // New
         } = req.body;
        // Validation for nicknames (Max 5)
        let processedNicknames = nicknames;
        if (Array.isArray(nicknames)) {
            if (nicknames.length > 5) {
                return res.status(400).json({ error: 'Maximum 5 nicknames allowed' });
            }
            processedNicknames = nicknames.join(',');
        }
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: userId },
            data: {
                name,
                avatarUrl,
                realName,
                address,
                nicknames: processedNicknames,
                isAvatarVisible,
                isPhoneVisible,
                isRealNameVisible,
                isAddressVisible,
                isBirthdayVisible
            }
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
    try {
        const { id } = req.params;
        const user = yield prisma_1.default.user.findUnique({
            where: { id: Number(id) }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
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
            avatarUrl: user.isAvatarVisible ? user.avatarUrl : null
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
        const avatarUrl = `/uploads/${file.filename}`;
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
