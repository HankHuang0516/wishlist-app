import { Router } from 'express';
import { paymentTemporarilyUnavailable } from '../controllers/paymentAvailabilityController';
import { authenticateToken } from '../middleware/auth';
import { billingBenefits, verifyBillingReceipt } from '../controllers/billingController';
import rateLimit from 'express-rate-limit';

const router = Router();
router.get('/benefits', authenticateToken, billingBenefits);
router.post('/verify', authenticateToken, rateLimit({ windowMs: 60000, limit: 20 }), verifyBillingReceipt);

// POST /api/payment/pay
router.post('/pay', authenticateToken, paymentTemporarilyUnavailable);
router.post('/cancel-subscription', authenticateToken, paymentTemporarilyUnavailable);

export default router;
