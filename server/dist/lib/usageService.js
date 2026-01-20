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
exports.getAiUsageInfo = exports.checkAndIncrementAiUsage = void 0;
const prisma_1 = __importDefault(require("./prisma"));
const FREE_AI_LIMIT = 10;
/**
 * Check if user can use AI and increment count if allowed.
 * Premium users have unlimited access.
 * Free users get 5 AI calls per day (resets at midnight).
 *
 * @returns true if AI is allowed, false if quota exceeded
 */
const checkAndIncrementAiUsage = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { isPremium: true, aiUsageCount: true, lastAiUsageDate: true }
    });
    if (!user) {
        console.warn(`[UsageService] User ${userId} not found`);
        return false;
    }
    // Premium users have unlimited access
    if (user.isPremium) {
        console.log(`[UsageService] User ${userId} is Premium - unlimited AI access`);
        return true;
    }
    // Check if last usage was today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastUsage = new Date(user.lastAiUsageDate);
    lastUsage.setHours(0, 0, 0, 0);
    const isNewDay = lastUsage.getTime() < today.getTime();
    if (isNewDay) {
        // Reset count for new day
        yield prisma_1.default.user.update({
            where: { id: userId },
            data: {
                aiUsageCount: 1,
                lastAiUsageDate: new Date()
            }
        });
        console.log(`[UsageService] User ${userId} - New day, reset count to 1`);
        return true;
    }
    // Same day - check limit
    if (user.aiUsageCount >= FREE_AI_LIMIT) {
        console.log(`[UsageService] User ${userId} - Daily limit reached (${user.aiUsageCount}/${FREE_AI_LIMIT})`);
        return false;
    }
    // Increment count
    yield prisma_1.default.user.update({
        where: { id: userId },
        data: {
            aiUsageCount: { increment: 1 },
            lastAiUsageDate: new Date()
        }
    });
    console.log(`[UsageService] User ${userId} - AI usage: ${user.aiUsageCount + 1}/${FREE_AI_LIMIT}`);
    return true;
});
exports.checkAndIncrementAiUsage = checkAndIncrementAiUsage;
/**
 * Get remaining AI usage for a user.
 * Returns { used, limit, isUnlimited }
 */
const getAiUsageInfo = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { isPremium: true, aiUsageCount: true, lastAiUsageDate: true }
    });
    if (!user) {
        return { used: 0, limit: FREE_AI_LIMIT, isUnlimited: false };
    }
    if (user.isPremium) {
        return { used: 0, limit: FREE_AI_LIMIT, isUnlimited: true };
    }
    // Check if last usage was today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastUsage = new Date(user.lastAiUsageDate);
    lastUsage.setHours(0, 0, 0, 0);
    const isNewDay = lastUsage.getTime() < today.getTime();
    return {
        used: isNewDay ? 0 : user.aiUsageCount,
        limit: FREE_AI_LIMIT,
        isUnlimited: false
    };
});
exports.getAiUsageInfo = getAiUsageInfo;
