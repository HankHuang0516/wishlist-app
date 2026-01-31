import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { flickrService } from '../lib/flickr';

const router = Router();
const prisma = new PrismaClient();

// Admin API Key - MUST be set in Railway environment variables
// Generate a secure key: openssl rand -base64 32
const ADMIN_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_KEY) {
    console.warn('[ADMIN] Warning: ADMIN_API_KEY not set. Admin endpoints disabled.');
}

const adminAuth = (req: Request, res: Response, next: Function) => {
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
// GET /api/admin/crawler-logs
// Returns recent crawler failures
router.get('/crawler-logs', adminAuth, async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const logs = await prisma.crawlerLog.findMany({
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
            logs: logs.map(log => ({
                id: log.id,
                userId: log.userId,
                userName: log.user?.name || log.user?.phoneNumber,
                url: log.url,
                errorMessage: log.errorMessage,
                debugMessage: log.debugMessage,
                createdAt: log.createdAt
            }))
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/admin/crawler-logs
// Clear all crawler logs
router.delete('/crawler-logs', adminAuth, async (req: Request, res: Response) => {
    try {
        const { count } = await prisma.crawlerLog.deleteMany({});
        res.json({
            message: 'Crawler logs cleared',
            deletedCount: count,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/stats
// Returns system stats
router.get('/stats', adminAuth, async (req: Request, res: Response) => {
    try {
        const [userCount, wishlistCount, itemCount, crawlerLogCount] = await Promise.all([
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
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/health
// Simple health check (no auth required)
router.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        version: process.env.npm_package_version || '0.0.80',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// GET /api/admin/gemini-status
// Check Gemini API status and quota-related errors
router.get('/gemini-status', adminAuth, async (req: Request, res: Response) => {
    try {
        // Count quota-related errors (429) in the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const quotaErrors = await prisma.crawlerLog.count({
            where: {
                errorMessage: { contains: '429' },
                createdAt: { gte: oneDayAgo }
            }
        });

        const totalErrors24h = await prisma.crawlerLog.count({
            where: { createdAt: { gte: oneDayAgo } }
        });

        // Recent quota errors
        const recentQuotaErrors = await prisma.crawlerLog.findMany({
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
            const result = await model.generateContent('Say "OK" in one word');
            geminiStatus = result.response.text() ? 'ok' : 'error';
        } catch (testError: any) {
            geminiStatus = 'error';
            geminiError = testError.message;

            // Check if it's a quota error
            if (testError.message?.includes('429')) {
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
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin/check-image
// Validate if an image URL is accessible
router.post('/check-image', adminAuth, async (req: Request, res: Response) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const { validateImageUrl } = require('../lib/imageValidator');
        const result = await validateImageUrl(url);

        res.json({
            url,
            accessible: result.valid,
            contentType: result.contentType,
            statusCode: result.statusCode,
            error: result.error,
            blockedDomain: result.blockedDomain,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/all-images
// Returns all unique image URLs from items in the database
router.get('/all-images', adminAuth, async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 500;

        const items = await prisma.item.findMany({
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
        const urlSet = new Set<string>();
        const images = items
            .filter(item => {
                if (!item.imageUrl || urlSet.has(item.imageUrl)) return false;
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
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/purchases
// Returns purchase history
router.get('/purchases', adminAuth, async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const purchases = await prisma.purchase.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                user: {
                    select: { id: true, name: true, phoneNumber: true, email: true }
                }
            }
        });

        res.json({
            count: purchases.length,
            purchases: purchases.map(p => ({
                id: p.id,
                userId: p.userId,
                userName: p.user?.name || p.user?.phoneNumber,
                userEmail: p.user?.email,
                type: p.type,
                amount: p.amount,
                currency: p.currency,
                status: p.status,
                createdAt: p.createdAt
            })),
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin/migrate-avatars
// Migrate existing Flickr avatars to the dedicated User Avatars album
router.post('/migrate-avatars', adminAuth, async (req: Request, res: Response) => {
    try {
        console.log('[Admin] Starting avatar migration...');

        // 1. Get or create the album
        let photosetId = await flickrService.getOrCreateAvatarPhotoset();
        if (!photosetId) {
            console.log('[Admin] Avatar photoset not found, will attempt to create during migration.');
        }

        // 2. Find users with Flickr avatars
        const users = await prisma.user.findMany({
            where: {
                avatarUrl: {
                    startsWith: 'https://live.staticflickr.com'
                }
            },
            select: { id: true, name: true, avatarUrl: true }
        });

        const results = {
            total: users.length,
            success: 0,
            failed: 0,
            alreadyInSet: 0,
            details: [] as string[]
        };

        // Helper to extract photo ID
        const extractPhotoId = (url: string): string | null => {
            const match = url.match(/\/(\d+)_[a-f0-9]+_\w+\.(jpg|png|gif)/i);
            return match ? match[1] : null;
        };

        // 3. Migrate each user
        for (const user of users) {
            if (!user.avatarUrl) continue;
            const photoId = extractPhotoId(user.avatarUrl);

            if (!photoId) {
                results.failed++;
                results.details.push(`User ${user.id}: Invalid URL format`);
                continue;
            }

            // If we don't have a photoset yet, create it with this photo
            if (!photosetId) {
                try {
                    console.log(`[Admin] Creating Avatar Photoset with photo ${photoId}...`);
                    photosetId = await flickrService.createAvatarPhotoset(photoId);
                    if (!photosetId) {
                        throw new Error('Created photoset ID is null');
                    }
                    results.details.push(`Created new album: ${photosetId}`);
                } catch (e: any) {
                    results.failed++;
                    results.details.push(`User ${user.id}: Failed to create album with photo ${photoId}: ${e.message}`);
                    continue; // Cannot proceed without album
                }
            }

            // Add via service (it logs errors but returns boolean)
            // flickrService.addPhotoToPhotoset returns boolean
            const success = await flickrService.addPhotoToPhotoset(photoId, photosetId);

            if (success) {
                results.success++;
            } else {
                // It might fail if already in set (service doesn't distinguish currently)
                // But for now we count as failed or check logs.
                // We'll verify migration by checking album count later.
                results.failed++;
                results.details.push(`User ${user.id}: Add to set failed`);
            }
        }

        res.json({
            message: 'Migration completed',
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('[Admin] Migration failed:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
