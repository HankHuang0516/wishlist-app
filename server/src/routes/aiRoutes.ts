import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth';
import { analyzeImage, analyzeTextHandler } from '../controllers/aiController';

const router = express.Router();

// Configure multer for memory storage (or disk storage if preferred)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.use(authenticateToken);

router.post('/analyze-image', upload.single('image'), analyzeImage);
router.post('/analyze-text', analyzeTextHandler);

export default router;
