import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth';
import { abandonListingCreation, getListingCreation, changeListingStatus, createListing, editListing, extendListingExpiry, getListing, myListings, publishListing, searchListings } from '../controllers/listingController';
import { getMatchWishes, matchWishListings } from '../controllers/wishlistMatchController';
import { abandonListingManagement, readListingManagement, submitListingManagement } from '../controllers/listingManagementController';

const router = Router();
const writes = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: '商品操作過於頻繁，請稍後再試', errorCode: 'LISTING_RATE_LIMIT' } });
router.get('/', searchListings);
router.get('/mine', (_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); }, authenticateToken, myListings);
router.get('/match-wishes', authenticateToken, getMatchWishes);
router.get('/matches', authenticateToken, matchWishListings);
router.get('/creation-receipts/:clientListingId', authenticateToken, getListingCreation);
router.post('/creation-receipts/:clientListingId/abandon', authenticateToken, writes, abandonListingCreation);
router.get('/management-operations/:clientActionId', authenticateToken, readListingManagement);
router.post('/management-operations/:clientActionId', authenticateToken, writes, submitListingManagement);
router.post('/management-operations/:clientActionId/abandon', authenticateToken, writes, abandonListingManagement);
router.get('/:id', optionalAuthenticateToken, getListing);
router.post('/', authenticateToken, writes, createListing);
router.post('/:id/status', authenticateToken, writes, changeListingStatus);
router.post('/:id/extend', authenticateToken, writes, extendListingExpiry);
router.patch('/:id', authenticateToken, writes, editListing);
router.post('/:id/publish', authenticateToken, writes, publishListing);
export default router;
