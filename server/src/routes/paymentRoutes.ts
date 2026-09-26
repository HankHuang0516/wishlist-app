import { Router } from 'express';
import { paymentTemporarilyUnavailable } from '../controllers/paymentAvailabilityController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// POST /api/payment/pay
router.post('/pay', authenticateToken, paymentTemporarilyUnavailable);
router.post('/cancel-subscription', authenticateToken, paymentTemporarilyUnavailable);

export default router;
