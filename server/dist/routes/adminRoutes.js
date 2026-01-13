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
const express_1 = require("express");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Admin API Key - MUST be set in Railway environment variables
// Generate a secure key: openssl rand -base64 32
const ADMIN_KEY = process.env.ADMIN_API_KEY;
if (!ADMIN_KEY) {
    console.warn('[ADMIN] Warning: ADMIN_API_KEY not set. Admin endpoints disabled.');
}
const adminAuth = (req, res, next) => {
    if (!ADMIN_KEY) {
        return res.status(503).json({ error: 'Admin API not configured' });
    }
    const apiKey = req.headers['x-admin-key'] || req.query.key;
    if (apiKey !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};
// GET /api/admin/crawler-logs
// Returns recent crawler failures
router.get('/crawler-logs', adminAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const logs = yield prisma.crawlerLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                user: {
                    select: { id: true, name: true, phoneNumber: true }
                }
            }
        });
        res.json({
            count: logs.length,
            logs: logs.map(log => {
                var _a, _b;
                return ({
                    id: log.id,
                    userId: log.userId,
                    userName: ((_a = log.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = log.user) === null || _b === void 0 ? void 0 : _b.phoneNumber),
                    url: log.url,
                    errorMessage: log.errorMessage,
                    debugMessage: log.debugMessage,
                    createdAt: log.createdAt
                });
            })
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// GET /api/admin/stats
// Returns system stats
router.get('/stats', adminAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [userCount, wishlistCount, itemCount, crawlerLogCount] = yield Promise.all([
            prisma.user.count(),
            prisma.wishlist.count(),
            prisma.item.count(),
            prisma.crawlerLog.count()
        ]);
        res.json({
            users: userCount,
            wishlists: wishlistCount,
            items: itemCount,
            crawlerErrors: crawlerLogCount,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// GET /api/admin/health
// Simple health check (no auth required)
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: process.env.npm_package_version || '0.0.80',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});
// GET /api/admin/gemini-status
// Check Gemini API status and quota-related errors
router.get('/gemini-status', adminAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Count quota-related errors (429) in the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const quotaErrors = yield prisma.crawlerLog.count({
            where: {
                errorMessage: { contains: '429' },
                createdAt: { gte: oneDayAgo }
            }
        });
        const totalErrors24h = yield prisma.crawlerLog.count({
            where: { createdAt: { gte: oneDayAgo } }
        });
        // Recent quota errors
        const recentQuotaErrors = yield prisma.crawlerLog.findMany({
            where: {
                errorMessage: { contains: '429' }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        // Test Gemini API availability (simple test)
        let geminiStatus = 'unknown';
        let geminiError = null;
        try {
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            // Simple test prompt
            const result = yield model.generateContent('Say "OK" in one word');
            geminiStatus = result.response.text() ? 'ok' : 'error';
        }
        catch (testError) {
            geminiStatus = 'error';
            geminiError = testError.message;
            // Check if it's a quota error
            if ((_a = testError.message) === null || _a === void 0 ? void 0 : _a.includes('429')) {
                geminiStatus = 'quota_exceeded';
            }
        }
        res.json({
            geminiStatus,
            geminiError,
            quotaErrors24h: quotaErrors,
            totalErrors24h: totalErrors24h,
            recentQuotaErrors: recentQuotaErrors.map(e => ({
                id: e.id,
                url: e.url,
                createdAt: e.createdAt
            })),
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// POST /api/admin/check-image
// Validate if an image URL is accessible
router.post('/check-image', adminAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        const { validateImageUrl } = require('../lib/imageValidator');
        const result = yield validateImageUrl(url);
        res.json({
            url,
            accessible: result.valid,
            contentType: result.contentType,
            statusCode: result.statusCode,
            error: result.error,
            blockedDomain: result.blockedDomain,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// GET /api/admin/all-images
// Returns all unique image URLs from items in the database
router.get('/all-images', adminAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const limit = parseInt(req.query.limit) || 500;
        const items = yield prisma.item.findMany({
            where: {
                imageUrl: { not: null }
            },
            select: {
                id: true,
                imageUrl: true,
                name: true
            },
            take: limit,
            orderBy: { createdAt: 'desc' }
        });
        // Get unique URLs
        const urlSet = new Set();
        const images = items
            .filter(item => {
            if (!item.imageUrl || urlSet.has(item.imageUrl))
                return false;
            urlSet.add(item.imageUrl);
            return true;
        })
            .map(item => ({
            id: item.id,
            url: item.imageUrl,
            name: item.name
        }));
        res.json({
            count: images.length,
            images,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
exports.default = router;
