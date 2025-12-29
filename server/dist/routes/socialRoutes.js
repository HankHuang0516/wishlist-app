"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const socialController_1 = require("../controllers/socialController");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
router.get('/search', socialController_1.searchUsers);
router.get('/following', socialController_1.getFollowing);
router.get('/upcoming-birthdays', socialController_1.getUpcomingBirthdays); // New
router.post('/:id/follow', socialController_1.followUser);
router.delete('/:id/follow', socialController_1.unfollowUser);
router.get('/:id/wishlists', socialController_1.getUserPublicWishlists);
exports.default = router;
