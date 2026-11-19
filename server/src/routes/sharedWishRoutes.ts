import express from 'express';
import rateLimit from 'express-rate-limit';
import { readSharedWish } from '../lib/wishShare';

/** Anyone holding a shared wish's address reads its name and budget here, signed in or not. An address this server
 *  did not issue and a wish that was deleted read the same: unavailable. */
export function createSharedWishRoutes() {
    const router = express.Router();
    router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: { errorCode: 'RATE_LIMIT_EXCEEDED' } }));
    router.get('/:token', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const wish = Object.keys(req.query).length ? null : await readSharedWish(req.params.token);
            if (!wish) return res.status(404).json({ errorCode: 'SHARED_WISH_UNAVAILABLE' });
            return res.json(wish);
        } catch {
            console.error('Shared wish unavailable; request and database details withheld');
            return res.status(503).json({ errorCode: 'SHARED_WISH_READ_FAILED' });
        }
    });
    return router;
}
