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

router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
// This router shares /api/users with account routes. Authenticate only our
// endpoints so deletion recovery can use its original-session verifier.
router.get('/search', authenticateToken, searchUsers);
router.get('/following', authenticateToken, getFollowing);
router.get('/upcoming-birthdays', authenticateToken, getUpcomingBirthdays);
const followWrites=rateLimit({windowMs:60_000,limit:60,standardHeaders:true,legacyHeaders:false,message:{errorCode:'FOLLOW_RATE_LIMIT'}});
router.get('/me/follow-state/:targetUserId',authenticateToken,getFollowState);
router.get('/me/follow-operations/:clientActionId',authenticateToken,getFollowOperation);
router.post('/me/follow-operations/:clientActionId',authenticateToken,followWrites,submitFollowOperation);
router.post('/me/follow-operations/:clientActionId/abandon',authenticateToken,followWrites,abandonFollowOperation);
router.post('/:id/follow',authenticateToken,followWrites,legacyFollow(true));
router.delete('/:id/follow',authenticateToken,followWrites,legacyFollow(false));
router.get('/:id/wishlists', authenticateToken, getUserPublicWishlists);

export default router;
