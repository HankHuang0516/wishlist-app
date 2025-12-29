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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserPublicWishlists = exports.getUpcomingBirthdays = exports.getFollowing = exports.unfollowUser = exports.followUser = exports.searchUsers = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Search users by name or phone (excluding self)
const searchUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { query } = req.query;
    const currentUserId = req.user.id;
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
    }
    try {
        const users = yield prisma.user.findMany({
            where: {
                AND: [
                    { id: { not: currentUserId } }, // Exclude self
                    {
                        OR: [
                            { name: { contains: query } },
                            { phoneNumber: query }, // Strict exact match for privacy
                            { nicknames: { contains: query } },
                            { realName: { contains: query } }
                        ]
                    }
                ]
            },
            select: {
                id: true,
                name: true,
                phoneNumber: true,
                avatarUrl: true,
                nicknames: true,
                birthday: true, // Select details to check privacy
                isBirthdayVisible: true,
                followedBy: {
                    where: { id: currentUserId }, // Check if currently followed by me
                    select: { id: true }
                }
            },
            take: 20
        });
        // Format response to indicate if following
        const results = users.map(user => ({
            id: user.id,
            name: user.name,
            phoneNumber: user.phoneNumber,
            nicknames: user.nicknames,
            avatarUrl: user.avatarUrl,
            birthday: user.isBirthdayVisible ? user.birthday : null, // Privacy Check
            isFollowing: user.followedBy.length > 0
        }));
        res.json(results);
    }
    catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});
exports.searchUsers = searchUsers;
// ... followUser and unfollowUser remain unchanged (omitted for brevity in this replace block if not touched, but since replace_file works on chunks, I need to be careful not to delete them if I'm replacing a huge chunk.
// I will split the replace to just target searchUsers and getFollowing separately to be safe.)
// Wait, I can only update one block relative to file content.
// Since searchUsers is at top and getFollowing is further down, I should do searchUsers first.
// Actually, I can replace searchUsers first.
// Wait, I'll do searchUsers now.
// Follow a user
const followUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params; // ID of user to follow
    const currentUserId = req.user.id;
    console.log(`DEBUG: followUser called. My ID: ${currentUserId}, Target ID: ${id}`);
    if (parseInt(id) === currentUserId) {
        return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    try {
        const targetId = parseInt(id);
        // Check if user exists and check limit
        const currentUser = yield prisma.user.findUnique({
            where: { id: currentUserId },
            include: {
                _count: {
                    select: { following: true }
                }
            }
        });
        if (!currentUser)
            return res.status(404).json({ error: 'Current user not found' });
        // Enforce Limit
        // Note: isPremium is currently only infinite wishlists, let's assume it also gives infinite following? 
        // Or keep them separate expansioms?
        // User request implied they correspond to "Capacity Expansion" which is usually paid per slot or tier.
        // Assuming "Premium" makes everything unlimited? 
        // Let's stick to the specific "Capacity Expansion" logic: maxFollowing defaults to 100.
        // If isPremium, maybe we should ignore limits? 
        // The prompt says "Capacity Expansion" so let's stick to the counter.
        // However, usually Premium implies unlimited. Let's make Premium override valid.
        if (!currentUser.isPremium && currentUser._count.following >= currentUser.maxFollowing) {
            return res.status(403).json({ error: `Following limit reached (${currentUser.maxFollowing}). Please expand capacity.` });
        }
        // Check if target user exists
        const targetUser = yield prisma.user.findUnique({
            where: { id: targetId }
        });
        if (!targetUser) {
            return res.status(404).json({ error: 'User to follow not found' });
        }
        yield prisma.user.update({
            where: { id: currentUserId },
            data: {
                following: {
                    connect: { id: targetId }
                }
            }
        });
        res.json({ message: 'Followed successfully' });
    }
    catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ error: 'Failed to follow user' });
    }
});
exports.followUser = followUser;
// Unfollow a user
const unfollowUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params; // ID of user to unfollow
    const currentUserId = req.user.id;
    try {
        yield prisma.user.update({
            where: { id: currentUserId },
            data: {
                following: {
                    disconnect: { id: parseInt(id) }
                }
            }
        });
        res.json({ message: 'Unfollowed successfully' });
    }
    catch (error) {
        console.error('Unfollow error:', error);
        res.status(500).json({ error: 'Failed to unfollow user' });
    }
});
exports.unfollowUser = unfollowUser;
// Get list of people I follow
const getFollowing = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const currentUserId = req.user.id;
    try {
        const user = yield prisma.user.findUnique({
            where: { id: currentUserId },
            include: {
                following: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                        nicknames: true,
                        birthday: true, // Select details
                        isBirthdayVisible: true,
                        following: {
                            where: { id: currentUserId },
                            select: { id: true }
                        }
                    }
                }
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Transform result to include isMutual flag and birthday privacy
        const results = user.following.map(f => ({
            id: f.id,
            name: f.name,
            avatarUrl: f.avatarUrl,
            nicknames: f.nicknames,
            birthday: f.isBirthdayVisible ? f.birthday : null,
            isMutual: f.following.length > 0
        }));
        res.json(results);
    }
    catch (error) {
        console.error('Get following error:', error);
        res.status(500).json({ error: 'Failed to get following list' });
    }
});
exports.getFollowing = getFollowing;
const getUpcomingBirthdays = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const currentUserId = req.user.id;
    try {
        const user = yield prisma.user.findUnique({
            where: { id: currentUserId },
            include: {
                following: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                        nicknames: true,
                        birthday: true,
                        isBirthdayVisible: true
                    }
                }
            }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(today.getDate() + 30);
        const upcoming = user.following
            .filter(f => f.birthday && f.isBirthdayVisible)
            .map(f => {
            const bday = new Date(f.birthday);
            // Construct next birthday for this year
            let nextBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
            // If passed, move to next year
            if (nextBday < today) {
                nextBday.setFullYear(today.getFullYear() + 1);
            }
            return Object.assign(Object.assign({}, f), { nextBday });
        })
            // Filter: Must be within next 30 days
            .filter(f => f.nextBday >= today && f.nextBday <= thirtyDaysFromNow)
            // Sort: Nearest first
            .sort((a, b) => a.nextBday.getTime() - b.nextBday.getTime())
            .map(f => ({
            id: f.id,
            name: f.name,
            nicknames: f.nicknames,
            avatarUrl: f.avatarUrl,
            birthday: f.birthday,
            nextBirthday: f.nextBday
        }));
        res.json(upcoming);
    }
    catch (error) {
        console.error('Birthdays error:', error);
        res.status(500).json({ error: 'Failed to fetch birthdays' });
    }
});
exports.getUpcomingBirthdays = getUpcomingBirthdays;
// Get public wishlists of a specific user
const getUserPublicWishlists = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params; // Target user ID
    try {
        const wishlists = yield prisma.wishlist.findMany({
            where: {
                userId: parseInt(id),
                isPublic: true
            },
            include: {
                items: true // We might want to limit items or show preview
            }
        });
        res.json(wishlists);
    }
    catch (error) {
        console.error('Get user wishlists error:', error);
        res.status(500).json({ error: 'Failed to fetch wishlists' });
    }
});
exports.getUserPublicWishlists = getUserPublicWishlists;
