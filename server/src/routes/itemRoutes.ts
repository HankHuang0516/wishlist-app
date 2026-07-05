import express from 'express';
import { authenticateToken, authenticateEclawAgent } from '../middleware/auth';
import {
    deleteItem,
    updateItem,
    cloneItem,
    watchItem,
    getItem,
    getPublicItems,
    searchItems,
    listItemsByEclawCode,
    upsertEclawListing,
} from '../controllers/itemController';

const router = express.Router();

// Public Routes (No Auth) — MUST precede the auth middleware and the
// numeric `/:id` route below, or Express would route `/search` into `/:id`.
router.get('/public', getPublicItems);
router.get('/search', searchItems);
router.get('/by-eclaw/:code', listItemsByEclawCode);

// Seller upsert keyed by a VERIFIED EClaw agent identity (NO merchant key —
// card_e30cf03d). authenticateEclawAgent proves the caller against EClaw and
// sets req.eclawAgent.publicCode; the listing is bound to THAT verified code.
router.post('/upsert-listing', authenticateEclawAgent, upsertEclawListing);

// Protected Routes
router.use(authenticateToken);

router.get('/:id', getItem);
router.put('/:id', updateItem);
router.delete('/:id', deleteItem);
router.post('/:id/clone', cloneItem);
router.post('/:id/watch', watchItem);

export default router;
