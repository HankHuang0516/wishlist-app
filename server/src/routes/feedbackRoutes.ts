import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { createFeedback } from '../controllers/feedbackController';

const router = express.Router();

router.use(authenticateToken);

router.post('/', createFeedback);

export default router;
