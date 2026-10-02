import { RequestHandler } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES, PhotoInputError, PhotoUploadSlots } from '../lib/listingPhoto';
import { API_ERROR_CODES } from '../lib/errorCodes';

const slots = new PhotoUploadSlots(1);
export const legacyWishUploadRate = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Wish creation rate limit', errorCode: 'PHOTO_RATE_LIMIT' } });
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 7, parts: 8,
    fieldSize: 4000, fieldNameSize: 30, headerPairs: 100 },
    fileFilter: (_req, file, callback) => PHOTO_MIME_TYPES.includes(file.mimetype) ? callback(null, true) : callback(new PhotoInputError()) }).single('image');

/** Authentication runs first. One bounded memory parser/decoder per process;
 * no user filename ever becomes a public disk path or provider metadata.
 */
export function legacyWishUpload(handler: RequestHandler): RequestHandler { return async (req, res, next) => {
    if (!req.is('multipart/form-data')) { await handler(req, res, next); return; }
    const release = slots.acquire();
    if (!release) { res.status(429).json({ error: 'Photo processing busy', errorCode: 'PHOTO_UPLOAD_BUSY' }); return; }
    try {
        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (error?: unknown) => {
                if (settled) return;
                settled = true; clearTimeout(timer); req.off('aborted', aborted);
                if (error) reject(error); else resolve();
            };
            const aborted = () => finish(new PhotoInputError());
            const timer = setTimeout(() => { req.destroy(); aborted(); }, 12_000);
            req.once('aborted', aborted);
            if (req.aborted) aborted(); else receive(req, res, finish);
        });
        if (!req.aborted && !res.destroyed) await handler(req, res, next);
    } catch (error) {
        if (req.aborted || res.destroyed) return;
        const large = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
        res.status(large ? 413 : 400).json({ error: 'Invalid wish photo or fields', errorCode: API_ERROR_CODES.INVALID_INPUT });
    } finally { release(); }
}; }
