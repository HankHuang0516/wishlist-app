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
exports.deleteWishlist = exports.updateWishlist = exports.getWishlist = exports.createWishlist = exports.getWishlists = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const getWishlists = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const wishlists = yield prisma_1.default.wishlist.findMany({
            where: { userId },
            include: { items: true },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(wishlists);
    }
    catch (error) {
        console.error('Error fetching wishlists:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getWishlists = getWishlists;
const createWishlist = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { title, description, isPublic } = req.body;
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        const user = yield prisma_1.default.user.findUnique({ where: { id: userId } });
        const isPremium = (user === null || user === void 0 ? void 0 : user.isPremium) || false;
        const globalLimit = (user === null || user === void 0 ? void 0 : user.maxWishlistItems) || 100;
        const wishlist = yield prisma_1.default.wishlist.create({
            data: {
                title,
                description,
                isPublic: isPublic !== undefined ? isPublic : true,
                userId,
                maxItems: isPremium ? 10000 : globalLimit
            }
        });
        res.status(201).json(wishlist);
    }
    catch (error) {
        console.error('Error creating wishlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.createWishlist = createWishlist;
const getWishlist = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const wishlist = yield prisma_1.default.wishlist.findUnique({
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
    }
    catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getWishlist = getWishlist;
const updateWishlist = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { title, description, isPublic } = req.body;
        const wishlist = yield prisma_1.default.wishlist.findUnique({
            where: { id: Number(id) }
        });
        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found' });
        }
        if (wishlist.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const updatedWishlist = yield prisma_1.default.wishlist.update({
            where: { id: Number(id) },
            data: {
                title: title || wishlist.title,
                description: description !== undefined ? description : wishlist.description,
                isPublic: isPublic !== undefined ? isPublic : wishlist.isPublic
            }
        });
        res.json(updatedWishlist);
    }
    catch (error) {
        console.error('Error updating wishlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.updateWishlist = updateWishlist;
const deleteWishlist = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const wishlist = yield prisma_1.default.wishlist.findUnique({
            where: { id: Number(id) }
        });
        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found' });
        }
        if (wishlist.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        yield prisma_1.default.wishlist.delete({
            where: { id: Number(id) }
        });
        res.json({ message: 'Wishlist deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting wishlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.deleteWishlist = deleteWishlist;
