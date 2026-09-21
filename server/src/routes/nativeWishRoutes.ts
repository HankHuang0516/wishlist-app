import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import { getNativeLists, getNativeList, createNativeList, createNativeWish, updateNativeList, deleteNativeList, deleteNativeWish } from '../controllers/nativeWishController';
import { updateItem } from '../controllers/wishItemController';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { NativeWishError, wishId } from '../lib/nativeWishRules';
const router = express.Router();
router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
router.use(authenticateToken);
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
router.get('/lists', getNativeLists); router.post('/lists', createNativeList);
router.get('/lists/:id', getNativeList); router.put('/lists/:id', updateNativeList); router.delete('/lists/:id', deleteNativeList);
router.post('/lists/:id/items', createNativeWish);
router.put('/items/:id', async (req: AuthRequest, res, next) => {
    try {
        const id = wishId(req.params.id);
        if (!await prisma.item.findFirst({ where: { id, wishlist: { userId: req.user!.id } }, select: { id: true } })) return res.status(404).json({ error: 'Wish not found' });
        return next();
    } catch (error) { return res.status(error instanceof NativeWishError ? 400 : 500).json({ error: 'Wish request rejected' }); }
}, updateItem);
router.delete('/items/:id', deleteNativeWish);
export default router;
