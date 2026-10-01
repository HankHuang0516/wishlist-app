import express from 'express';
import rateLimit from 'express-rate-limit';
import { getFollowState, getFollowOperation, submitFollowOperation, abandonFollowOperation, legacyFollow } from '../controllers/followOperationController';
import { authenticateToken } from '../middleware/auth';
import {
    searchUsers,
    getFollowing,
    getUserPublicWishlists,
    getUpcomingBirthdays
} from '../controllers/socialController';

const router = express.Router();

router.use(authenticateToken);

router.get('/search', searchUsers);
router.get('/following', getFollowing);
router.get('/upcoming-birthdays', getUpcomingBirthdays); // New
const followWrites=rateLimit({windowMs:60_000,limit:60,standardHeaders:true,legacyHeaders:false,message:{errorCode:'FOLLOW_RATE_LIMIT'}});
router.get('/me/follow-state/:targetUserId',getFollowState);
router.get('/me/follow-operations/:clientActionId',getFollowOperation);
router.post('/me/follow-operations/:clientActionId',followWrites,submitFollowOperation);
router.post('/me/follow-operations/:clientActionId/abandon',followWrites,abandonFollowOperation);
router.post('/:id/follow',followWrites,legacyFollow(true));
router.delete('/:id/follow',followWrites,legacyFollow(false));
router.get('/:id/wishlists', getUserPublicWishlists);

export default router;
