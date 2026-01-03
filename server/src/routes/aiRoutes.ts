import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth';
import { analyzeImage, analyzeTextHandler, validateImageUrl } from '../controllers/aiController';

const router = express.Router();

// Configure multer for memory storage (or disk storage if preferred)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.use(authenticateToken);

router.post('/analyze-image', upload.single('image'), analyzeImage);
router.post('/analyze-text', analyzeTextHandler);

// Validate if an image URL is accessible (for frontend pre-check)
router.post('/validate-image', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        const result = await validateImageUrl(url);
        res.json({
            valid: result.valid,
            contentType: result.contentType,
            error: result.error
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;

