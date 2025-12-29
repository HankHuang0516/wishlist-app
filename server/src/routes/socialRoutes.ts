import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    searchUsers,
    followUser,
    unfollowUser,
    getFollowing,
    getUserPublicWishlists,
    getUpcomingBirthdays
} from '../controllers/socialController';

const router = express.Router();

router.use(authenticateToken);

router.get('/search', searchUsers);
router.get('/following', getFollowing);
router.get('/upcoming-birthdays', getUpcomingBirthdays); // New
router.post('/:id/follow', followUser);
router.delete('/:id/follow', unfollowUser);
router.get('/:id/wishlists', getUserPublicWishlists);

export default router;
