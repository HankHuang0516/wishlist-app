import { Router } from 'express';
import { cancelSubscription } from '../controllers/paymentController';
import { paymentTemporarilyUnavailable } from '../controllers/paymentAvailabilityController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// POST /api/payment/pay
router.post('/pay', authenticateToken, paymentTemporarilyUnavailable);
router.post('/cancel-subscription', authenticateToken, cancelSubscription); // Add import above

export default router;
