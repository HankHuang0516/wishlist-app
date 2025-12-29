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
const createFeedback = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { content, language } = req.body;
        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }
        // Check Cooldown (10 minutes)
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId }
        });
        if (user === null || user === void 0 ? void 0 : user.lastFeedbackAt) {
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
