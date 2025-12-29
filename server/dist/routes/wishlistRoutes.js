"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const wishlistController_1 = require("../controllers/wishlistController");
const router = express_1.default.Router();
// All routes require authentication
router.use(auth_1.authenticateToken);
router.get('/', wishlistController_1.getWishlists);
router.post('/', wishlistController_1.createWishlist);
router.get('/:id', wishlistController_1.getWishlist);
router.put('/:id', wishlistController_1.updateWishlist);
router.delete('/:id', wishlistController_1.deleteWishlist);
// Item routes nested under wishlist
const itemController_1 = require("../controllers/itemController");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
// Configure multer for local storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage });
router.post('/:wishlistId/items', upload.single('image'), itemController_1.createItem);
router.post('/:wishlistId/items/url', itemController_1.createItemFromUrl);
exports.default = router;
