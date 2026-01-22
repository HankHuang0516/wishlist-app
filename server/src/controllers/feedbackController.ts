import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { analyzeText } from './aiController';
import { sendEmail } from '../lib/emailService';
import { API_ERROR_CODES } from '../lib/errorCodes';

interface AuthRequest extends Request {
    user?: any;
}

export const createFeedback = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { content, language, email } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Content is required', errorCode: API_ERROR_CODES.MISSING_FIELDS });
        }

        // Anonymous needs email
        if (!userId && !email) {
            return res.status(400).json({ error: 'Email is required for anonymous feedback', errorCode: API_ERROR_CODES.MISSING_FIELDS });
        }

        console.log(`[Feedback] Received from ${userId ? `User ${userId}` : `Anonymous (${email})`}:`, content);

        // Check Cooldown (10 minutes) - Only for logged-in users
        if (userId) {
            const user = await prisma.user.findUnique({
                where: { id: userId }
            });

            if (user?.lastFeedbackAt) {
                const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
                if (user.lastFeedbackAt > tenMinutesAgo) {
                    return res.status(429).json({ error: 'Please wait 10 minutes between feedback.' });
                }
            }
        }

        // Analyze with AI
        const aiResponse = await analyzeText(content, language || 'zh-TW');
        const safeAiResponse = aiResponse ? aiResponse.substring(0, 5000) : "Analysis failed";

        // Save to DB ONLY if logged in
        if (userId) {
            await prisma.feedback.create({
                data: {
                    content,
                    aiResponse: safeAiResponse,
                    userId
                }
            });

            await prisma.user.update({
                where: { id: userId },
                data: { lastFeedbackAt: new Date() }
            });
        }

        // Send Notification Email
        console.log('[Feedback] Attempting to send email notification...');
        const emailContent = `
            <h2>New Feedback Received</h2>
            <p><strong>User:</strong> ${userId ? `ID: ${userId}` : `Anonymous (${email})`}</p>
            <p><strong>Content:</strong></p>
            <blockquote>${content}</blockquote>
            <p><strong>AI Analysis:</strong></p>
            <pre>${safeAiResponse}</pre>
        `;

        // Fire and forget
        sendEmail('hankhuang0516@gmail.com', 'New User Feedback - Wishlist App', emailContent)
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
