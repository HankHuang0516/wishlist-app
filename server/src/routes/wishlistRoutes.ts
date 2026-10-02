import express from 'express';
import { authenticateToken, authenticateUserOrEclawAgent } from '../middleware/auth';
import {
    getWishlists,
    createWishlist,
    getWishlist,
    updateWishlist,
    deleteWishlist
} from '../controllers/wishlistController';

const router = express.Router();
import { createItemFromMedia,readLegacyWishCreate,abandonLegacyWishCreate } from '../controllers/legacyWishCreateController';

// Item routes nested under wishlist
import { createItem, createItemFromUrl } from '../controllers/itemController';
import { legacyWishUpload, legacyWishUploadRate } from '../middleware/legacyWishUpload';

// Item creation accepts a logged-in USER (JWT/apiKey) OR a verified EClaw AGENT
// (token / device-entity-botSecret headers). The old x-merchant-api-key path is
// gone (card_e30cf03d — NO merchant key). An EClaw agent's proxy_end_user_id is
// bound to its own verified publicCode inside the controller.
router.post('/:wishlistId/items', authenticateUserOrEclawAgent, legacyWishUploadRate, legacyWishUpload(createItem));
router.post('/:wishlistId/items/url', authenticateUserOrEclawAgent, createItemFromUrl);

// Other routes still require user token for now
router.use(authenticateToken);
router.get('/create-receipts/:clientRequestId', readLegacyWishCreate);
router.post('/create-receipts/:clientRequestId/abandon', abandonLegacyWishCreate);
router.post('/:wishlistId/items/from-media', createItemFromMedia);

router.get('/', getWishlists);
router.post('/', createWishlist);
router.get('/:id', getWishlist);
router.put('/:id', updateWishlist);
router.delete('/:id', deleteWishlist);

export default router;
