import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { analyzeText } from './aiController';
import { sendEmail } from '../lib/emailService'; // Static import

interface AuthRequest extends Request {
    user?: any;
}

export const createFeedback = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { content, language } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }

        console.log(`[Feedback] Received from User ${userId}:`, content);

        // Check Cooldown (10 minutes)
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (user?.lastFeedbackAt) {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            if (user.lastFeedbackAt > tenMinutesAgo) {
                return res.status(429).json({ error: 'Please wait 10 minutes between feedback.' });
            }
        }

        // Analyze with AI
        const aiResponse = await analyzeText(content, language || 'zh-TW');

        // Verify aiResponse string length just in case
        const safeAiResponse = aiResponse ? aiResponse.substring(0, 5000) : "Analysis failed";

        // Save to DB
        const feedback = await prisma.feedback.create({
            data: {
                content,
                aiResponse: safeAiResponse,
                userId
            }
        });

        // Update User timestamp
        await prisma.user.update({
            where: { id: userId },
            data: { lastFeedbackAt: new Date() }
        });

        // Send Notification Email
        console.log('[Feedback] Attempting to send email notification...');
        const emailContent = `
            <h2>New Feedback Received</h2>
            <p><strong>User ID:</strong> ${userId}</p>
            <p><strong>Content:</strong></p>
            <blockquote>${content}</blockquote>
            <p><strong>AI Analysis:</strong></p>
            <pre>${safeAiResponse}</pre>
        `;

        // Fire and forget (don't block response) - Use new port/timeout settings
        console.log('[Feedback] Email Send Initiated (Background)...');
        sendEmail('hankhuang0516@gmail.com', 'New User Feedback - Wishlist App', emailContent)
            .then(res => console.log('[Feedback] Email Result:', res))
            .catch(err => console.error('[Feedback] Email Failed:', err));

        res.status(201).json({
            message: 'Feedback received',
            aiAnalysis: safeAiResponse
        });

    } catch (error) {
        console.error('Feedback Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
