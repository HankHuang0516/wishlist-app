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

// Item routes nested under wishlist
import { createItem, createItemFromUrl } from '../controllers/itemController';
import multer from 'multer';
import path from 'path';

// Configure multer for local storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Item creation accepts a logged-in USER (JWT/apiKey) OR a verified EClaw AGENT
// (token / device-entity-botSecret headers). The old x-merchant-api-key path is
// gone (card_e30cf03d — NO merchant key). An EClaw agent's proxy_end_user_id is
// bound to its own verified publicCode inside the controller.
router.post('/:wishlistId/items', authenticateUserOrEclawAgent, upload.single('image'), createItem);
router.post('/:wishlistId/items/url', authenticateUserOrEclawAgent, createItemFromUrl);

// Other routes still require user token for now
router.use(authenticateToken);

router.get('/', getWishlists);
router.post('/', createWishlist);
router.get('/:id', getWishlist);
router.put('/:id', updateWishlist);
router.delete('/:id', deleteWishlist);

export default router;
