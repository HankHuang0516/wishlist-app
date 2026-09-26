import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import { approveMarketingJob, createMarketingJob, createMarketingRevision, getMarketingJob, latestMarketingJob, marketingAvailability } from '../controllers/marketingController';

const router = Router();
const writes = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: true, legacyHeaders: false,
    message: { error: '行銷操作過於頻繁，請稍後再試', errorCode: 'MARKETING_RATE_LIMIT' } });
router.get('/availability', authenticateToken, marketingAvailability);
router.post('/jobs', authenticateToken, writes, createMarketingJob);
router.get('/jobs', authenticateToken, latestMarketingJob);
router.get('/jobs/:id', authenticateToken, getMarketingJob);
router.post('/jobs/:id/revision', authenticateToken, writes, createMarketingRevision);
router.post('/jobs/:id/approve', authenticateToken, writes, approveMarketingJob);
export default router;
