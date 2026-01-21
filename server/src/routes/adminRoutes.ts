import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

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

// DELETE /api/admin/users
// Delete user by email (For testing/cleanup)
router.delete('/users', adminAuth, async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await prisma.user.findFirst({
            where: { email }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete related data first if necessary (Cascading should handle it, but being safe)
        // Prisma schema should handle cascade delete usually.
        // If not, we might need to delete Wishlists/Items manually. 
        // Assuming cascade for now or that we only need to delete the User record.

        await prisma.user.delete({
            where: { id: user.id }
        });

        res.json({
            message: `User ${email} deleted successfully`,
            deletedUser: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
