import { Router } from 'express';
import { payByPrime } from '../controllers/paymentController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// POST /api/payment/pay
router.post('/pay', authenticateToken, payByPrime);

export default router;
