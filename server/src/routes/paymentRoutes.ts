import { Router } from 'express';
import { payByPrime, cancelSubscription } from '../controllers/paymentController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// POST /api/payment/pay
router.post('/pay', authenticateToken, payByPrime);
router.post('/cancel-subscription', authenticateToken, cancelSubscription); // Add import above

export default router;
