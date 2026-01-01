import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { createFeedback } from '../controllers/feedbackController';
import { sendEmail } from '../lib/emailService';

const router = express.Router();

router.use(authenticateToken);

router.post('/', createFeedback);

// Debug Route: Test Email (Auth Required)
router.post('/test', async (req, res) => {
    try {
        console.log('[Debug] Manual Email Test Triggered');
        const result = await sendEmail(
            'hankhuang0516@gmail.com',
            'Live Debug Test Email',
            '<p>This is a manual test triggered from Settings Page. <br>System Status: <b>Online</b></p>'
        );
        res.json(result);
    } catch (error: any) {
        console.error('[Debug] Manual Email Test Failed:', error);
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
});

export default router;
