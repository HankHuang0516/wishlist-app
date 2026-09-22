import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth';
import { changeListingStatus, createListing, editListing, extendListingExpiry, getListing, myListings, publishListing, searchListings } from '../controllers/listingController';
import { getMatchWishes, matchWishListings } from '../controllers/wishlistMatchController';

const router = Router();
const writes = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: '商品操作過於頻繁，請稍後再試', errorCode: 'LISTING_RATE_LIMIT' } });
router.get('/', searchListings);
router.get('/mine', authenticateToken, myListings);
router.get('/match-wishes', authenticateToken, getMatchWishes);
router.get('/matches', authenticateToken, matchWishListings);
router.get('/:id', optionalAuthenticateToken, getListing);
router.post('/', authenticateToken, writes, createListing);
router.post('/:id/status', authenticateToken, writes, changeListingStatus);
router.post('/:id/extend', authenticateToken, writes, extendListingExpiry);
router.patch('/:id', authenticateToken, writes, editListing);
router.post('/:id/publish', authenticateToken, writes, publishListing);
export default router;
