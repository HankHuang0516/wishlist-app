import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    getWishlists,
    createWishlist,
    getWishlist,
    updateWishlist,
    deleteWishlist
} from '../controllers/wishlistController';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

router.get('/', getWishlists);
router.post('/', createWishlist);
router.get('/:id', getWishlist);
router.put('/:id', updateWishlist);
router.delete('/:id', deleteWishlist);

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


router.post('/:wishlistId/items', upload.single('image'), createItem);
router.post('/:wishlistId/items/url', createItemFromUrl);

export default router;
