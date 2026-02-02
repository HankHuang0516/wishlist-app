import express from 'express';
import { authenticateToken, authenticateUserOrMerchant } from '../middleware/auth';
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

// Merchant can create items, but maybe not manage wishlists?
// The task says "Merchant 認證機制", implying they can use the API.
// Let's allow create items to use either.

router.post('/:wishlistId/items', authenticateUserOrMerchant, upload.single('image'), createItem);
router.post('/:wishlistId/items/url', authenticateUserOrMerchant, createItemFromUrl);

// Other routes still require user token for now
router.use(authenticateToken);

router.get('/', getWishlists);
router.post('/', createWishlist);
router.get('/:id', getWishlist);
router.put('/:id', updateWishlist);
router.delete('/:id', deleteWishlist);

export default router;
