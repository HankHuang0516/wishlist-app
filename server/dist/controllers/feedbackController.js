"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFeedback = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const aiController_1 = require("./aiController");
const emailService_1 = require("../lib/emailService"); // Static import
const createFeedback = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { content, language } = req.body;
        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }
        console.log(`[Feedback] Received from User ${userId}:`, content);
        // Check Cooldown (10 minutes)
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId }
        });
        if (user === null || user === void 0 ? void 0 : user.lastFeedbackAt) {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            if (user.lastFeedbackAt > tenMinutesAgo) {
                return res.status(429).json({ error: 'Please wait 10 minutes between feedback.' });
            }
        }
        // Analyze with AI
        const aiResponse = yield (0, aiController_1.analyzeText)(content, language || 'zh-TW');
        // Verify aiResponse string length just in case
        const safeAiResponse = aiResponse ? aiResponse.substring(0, 5000) : "Analysis failed";
        // Save to DB
        const feedback = yield prisma_1.default.feedback.create({
            data: {
                content,
                aiResponse: safeAiResponse,
                userId
            }
        });
        // Update User timestamp
        yield prisma_1.default.user.update({
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
        (0, emailService_1.sendEmail)('hankhuang0516@gmail.com', 'New User Feedback - Wishlist App', emailContent)
            .then(res => console.log('[Feedback] Email Result:', res))
            .catch(err => console.error('[Feedback] Email Failed:', err));
        res.status(201).json({
            message: 'Feedback received',
            aiAnalysis: safeAiResponse
        });
    }
    catch (error) {
        console.error('Feedback Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.createFeedback = createFeedback;
