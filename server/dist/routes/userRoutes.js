"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const auth_1 = require("../middleware/auth");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
// Configure Multer
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `avatar_${Date.now()}${path_1.default.extname(file.originalname)}`);
    }
});
const upload = (0, multer_1.default)({ storage });
// Protected routes (require login)
router.get('/me', auth_1.authenticateToken, userController_1.getMe);
router.put('/me', auth_1.authenticateToken, userController_1.updateMe);
router.put('/me/password', auth_1.authenticateToken, userController_1.updatePassword);
router.get('/me/purchases', auth_1.authenticateToken, userController_1.getPurchasedItems);
router.get('/me/transaction-history', auth_1.authenticateToken, userController_1.getPurchaseHistory);
router.post('/me/subscription', auth_1.authenticateToken, userController_1.updateSubscription);
router.post('/me/subscription/cancel', auth_1.authenticateToken, userController_1.cancelSubscription);
router.post('/me/avatar', auth_1.authenticateToken, upload.single('avatar'), userController_1.uploadAvatar);
// Public routes (or semi-public, but usually viewed by logged in users)
router.get('/:id', auth_1.authenticateToken, userController_1.getUserProfile);
exports.default = router;
