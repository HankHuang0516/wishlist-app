import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { analyzeText } from './aiController';

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

        // Check Cooldown (10 minutes)
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (user?.lastFeedbackAt) {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            if (user.lastFeedbackAt > tenMinutesAgo) {
                const remaining = Math.ceil((user.lastFeedbackAt.getTime() - tenMinutesAgo.getTime()) / 60000); // Wait, logic might be tricky.
                // lastFeedbackAt > tenMinutesAgo implies it was RECENT.
                // Reset calculation:
                // nextAllowed = lastFeedbackAt + 10 mins.
                // remaining = nextAllowed - now.
                const nextAllowed = new Date(user.lastFeedbackAt.getTime() + 10 * 60 * 1000);
                const remainingMinutes = Math.ceil((nextAllowed.getTime() - Date.now()) / 60000);

                return res.status(429).json({ error: `Please wait ${remainingMinutes} minutes before sending more feedback.` });
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

        res.status(201).json({
            message: 'Feedback received',
            aiAnalysis: safeAiResponse
        });

    } catch (error) {
        console.error('Feedback Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
