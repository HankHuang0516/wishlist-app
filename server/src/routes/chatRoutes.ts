import multer from 'multer';
import { MAX_PHOTO_BYTES, PhotoUploadSlots } from '../lib/listingPhoto';
import { queryMyChats } from '../controllers/chatQueryController';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import { getUnreadCount, abandonPhotoMessage, getMessagePhoto, getConversation, getMessages, getMyMessageReceipt, listConversations, markConversationRead, openConversation, sendMessage, setUserBlock } from '../controllers/chatController';
import { abandonMeetupAction, getMeetup, getMyMeetupReceipt, mutateMeetup } from '../controllers/meetupController';
import { createChatReport, getChatReport } from '../controllers/chatReportController';
const router = Router();
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
const writes = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '聊天操作過於頻繁，請稍後重試', errorCode: 'CHAT_RATE_LIMIT' } });
router.use(authenticateToken);
router.post('/query', rateLimit({windowMs:60_000,limit:20,standardHeaders:'draft-8',legacyHeaders:false}), queryMyChats);
router.get('/unread', getUnreadCount);
router.get('/conversations', listConversations);
router.post('/conversations', writes, openConversation);
router.get('/conversations/:id', getConversation);
router.post('/conversations/:id/reports', writes, createChatReport);
router.get('/conversations/:id/reports/:clientReportId', getChatReport);
router.get('/conversations/:id/messages', getMessages);
router.get('/conversations/:id/messages/by-client-id/:clientMessageId', getMyMessageReceipt);
router.post('/conversations/:id/messages', writes, sendMessage);
const photoSlots = new PhotoUploadSlots(1);
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 2, fieldSize: 9000, parts: 3 } }).single('photo');
router.post('/conversations/:id/photo-messages', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }), (req, res) => {
    const release = photoSlots.acquire();
    if (!release) return res.status(429).json({ error: '照片處理中，請稍後再試' });
    photoUpload(req, res, async error => {
        try {
            if (error || !req.file) return res.status(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: '請選擇單張5MB以內商品照片' });
            // Route-specific upload never relaxes the text-only endpoint parser.
            if (req.body.text === '') req.body.text = '[商品照片]';
            return await sendMessage(req, res);
        } finally { release(); }
    });
});
router.get('/conversations/:id/messages/:messageId/photo', getMessagePhoto);
router.post('/conversations/:id/photo-messages/abandon', writes, abandonPhotoMessage);
router.post('/conversations/:id/read', writes, markConversationRead);
router.get('/conversations/:id/meetup', getMeetup);
router.get('/conversations/:id/meetup/operations/:clientActionId', getMyMeetupReceipt);
router.post('/conversations/:id/meetup', writes, mutateMeetup);
router.post('/conversations/:id/meetup/abandon', writes, abandonMeetupAction);
router.post('/blocks/:userId', writes, setUserBlock);
router.delete('/blocks/:userId', writes, setUserBlock);
export default router;
