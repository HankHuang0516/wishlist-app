
import { Router } from 'express';
import { getMe, updateMe, getUserProfile, uploadAvatar, updatePassword, updateSubscription, cancelSubscription, getPurchasedItems, getPurchaseHistory, getAiUsage, generateUserApiKey, getUserApiKey, getDeliveryInfo } from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `avatar_${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

// Protected routes (require login)
router.get('/me', authenticateToken, getMe);
router.put('/me', authenticateToken, updateMe);
router.put('/me/password', authenticateToken, updatePassword);
router.get('/me/purchases', authenticateToken, getPurchasedItems);
router.get('/me/transaction-history', authenticateToken, getPurchaseHistory);
router.get('/me/ai-usage', authenticateToken, getAiUsage);
router.post('/me/subscription', authenticateToken, updateSubscription);
router.post('/me/subscription/cancel', authenticateToken, cancelSubscription);
router.post('/me/avatar', authenticateToken, upload.single('avatar'), uploadAvatar);

// Public routes (or semi-public, but usually viewed by logged in users)
router.get('/:id', authenticateToken, getUserProfile);

// API Key Management
router.post('/me/apikey', authenticateToken, generateUserApiKey);
router.get('/me/apikey', authenticateToken, getUserApiKey);

// Gift Delivery (Mutual Friends Only)
router.get('/:id/delivery-info', authenticateToken, getDeliveryInfo);


export default router;
