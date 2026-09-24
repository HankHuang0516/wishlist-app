import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { AuthRequest, authenticateToken, optionalAuthenticateToken } from '../middleware/auth';
import { deleteUnusedListingMedia, getListingAiDraft, getListingMedia, getMediaByUploadId, mediaError, myUnusedListingMedia, requestListingAiDraft, uploadListingMedia } from '../controllers/listingMediaController';
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES, PhotoInputError, PhotoUploadSlots } from '../lib/listingPhoto';

const router = Router();
const slots = new PhotoUploadSlots(1);
const uploads = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: '照片操作過於頻繁，請稍後重試', errorCode: 'PHOTO_RATE_LIMIT' } });
const aiRequests = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: true, legacyHeaders: false,
    message: { error: 'AI 辨識請求過於頻繁，請稍後再試', errorCode: 'LISTING_AI_RATE_LIMIT' } });
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 100, fieldNameSize: 30, headerPairs: 100 },
    fileFilter: (_req, file, callback) => PHOTO_MIME_TYPES.includes(file.mimetype) ? callback(null, true) : callback(new PhotoInputError()) }).single('image');

router.post('/', authenticateToken, uploads, async (req: AuthRequest, res) => {
    const release = slots.acquire();
    if (!release) return res.status(429).json({ error: '照片處理忙碌，請稍後重試', errorCode: 'PHOTO_UPLOAD_BUSY' });
    try {
        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (error?: unknown) => {
                if (settled) return;
                settled = true; clearTimeout(timeout); req.off('aborted', aborted);
                if (error) reject(error); else resolve();
            };
            const aborted = () => finish(new PhotoInputError('照片上傳已中斷'));
            const timeout = setTimeout(() => { req.destroy(); aborted(); }, 12_000);
            req.once('aborted', aborted);
            if (req.aborted) aborted(); else receive(req, res, finish);
        });
        if (!req.aborted && !res.destroyed) await uploadListingMedia(req, res);
    } catch (error) {
        if (req.aborted || res.destroyed) return;
        if (error instanceof multer.MulterError) return mediaError(res, new PhotoInputError(error.code === 'LIMIT_FILE_SIZE' ? '商品照片不可超過5MB' : '照片上傳格式不正確', error.code === 'LIMIT_FILE_SIZE' ? 413 : 400));
        return mediaError(res, error);
    } finally { release(); }
});
router.get('/by-upload-id/:clientUploadId', authenticateToken, getMediaByUploadId);
router.get('/unused', authenticateToken, myUnusedListingMedia);
router.post('/:id/ai-draft', authenticateToken, aiRequests, requestListingAiDraft);
router.get('/:id/ai-draft', authenticateToken, getListingAiDraft);
router.get('/:id/:variant', optionalAuthenticateToken, getListingMedia);
router.delete('/:id', authenticateToken, uploads, deleteUnusedListingMedia);
export default router;
