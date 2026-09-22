import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import { marketplaceAdmin } from '../middleware/marketplaceAdmin';
import { abandonMyReport, createListingReport, decideListingReport, getModerationQueue, getModerationReceipt, getMyListingReports, getMyReportReceipt, getMyReportOperation } from '../controllers/listingModerationController';

const writes = () => rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: '檢舉審核操作過於頻繁，請稍後再試', errorCode: 'MODERATION_RATE_LIMIT' } });
const reads = () => rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false,
    message: { error: '查詢過於頻繁，請稍後再試', errorCode: 'MODERATION_RATE_LIMIT' } });
const privateResponses = (): Router => {
    const router = Router(); router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }); return router;
};
const router = privateResponses();
router.use(authenticateToken);
router.get('/mine', reads(), getMyListingReports);
router.get('/receipts/:clientReportId', reads(), getMyReportReceipt);
router.get('/operations/:clientReportId', reads(), getMyReportOperation);
router.post('/operations/:clientReportId/abandon', writes(), abandonMyReport);
router.post('/', writes(), createListingReport);
export default router;

// Tests inject a synthetic credential reader, never the production key.
// Production reads the existing Railway variable only during each request.
export function createListingModerationRoutes(getCredential: () => unknown = () => process.env.ADMIN_API_KEY) {
    const admin = privateResponses(); admin.use(marketplaceAdmin(getCredential));
    admin.get('/listing-reports', reads(), getModerationQueue);
    admin.get('/decisions/:clientDecisionId', reads(), getModerationReceipt);
    admin.post('/listing-reports/:id/decisions', writes(), decideListingReport);
    return admin;
}
