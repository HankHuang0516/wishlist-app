
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getMe, updateMe, getUserProfile, uploadAvatar, updatePassword, cancelSubscription, getPurchasedItems, getPurchaseHistory, getAiUsage, generateUserApiKey, getUserApiKey, getDeliveryInfo, generateAiPrompt } from '../controllers/userController';
import { paymentTemporarilyUnavailable } from '../controllers/paymentAvailabilityController';
import { authenticateToken } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import { revokeSessions } from '../controllers/accountSecurityController';
import { securityLimiter } from '../middleware/rateLimiter';
import { getAccountDeletionImpact, authenticateErasureSession, deleteMyAccount, getMyErasureReceipt, abandonMyErasure } from '../controllers/accountDeletionController';

const router = Router();
const erasureRecoveryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: '操作確認過於頻繁，請稍後重試', errorCode: 'ERASURE_RECOVERY_RATE_LIMIT' } });

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
router.get('/me/deletion-impact', authenticateToken, securityLimiter, getAccountDeletionImpact);
router.delete('/me', authenticateErasureSession, securityLimiter, deleteMyAccount);
router.get('/me/deletion-operations/:clientActionId', authenticateErasureSession, erasureRecoveryLimiter, getMyErasureReceipt);
router.post('/me/deletion-operations/:clientActionId/abandon', authenticateErasureSession, erasureRecoveryLimiter, abandonMyErasure);
router.put('/me', authenticateToken, updateMe);
router.put('/me/password', authenticateToken, securityLimiter, updatePassword);
router.post('/me/sessions/revoke', authenticateToken, securityLimiter, revokeSessions);
router.get('/me/purchases', authenticateToken, getPurchasedItems);
router.get('/me/transaction-history', authenticateToken, getPurchaseHistory);
router.get('/me/ai-usage', authenticateToken, getAiUsage);
router.post('/me/subscription', authenticateToken, paymentTemporarilyUnavailable);
router.post('/me/subscription/cancel', authenticateToken, cancelSubscription);
router.post('/me/avatar', authenticateToken, upload.single('avatar'), uploadAvatar);

// Public routes (or semi-public, but usually viewed by logged in users)
router.get('/:id', authenticateToken, getUserProfile);

// API Key Management
router.post('/me/apikey', authenticateToken, generateUserApiKey);
router.get('/me/apikey', authenticateToken, getUserApiKey);

// AI Prompt (One-click copy for AI assistants)
router.post('/me/ai-prompt', authenticateToken, generateAiPrompt);

// Gift Delivery (Mutual Friends Only)
router.get('/:id/delivery-info', authenticateToken, getDeliveryInfo);


export default router;
