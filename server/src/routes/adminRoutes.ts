import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Simple API Key check middleware
// In production, use env variable: ADMIN_API_KEY
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'wishlist-admin-2026';

const adminAuth = (req: Request, res: Response, next: Function) => {
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

export default router;
