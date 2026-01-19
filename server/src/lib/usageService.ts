import prisma from './prisma';

const FREE_AI_LIMIT = 10;

/**
 * Check if user can use AI and increment count if allowed.
 * Premium users have unlimited access.
 * Free users get 5 AI calls per day (resets at midnight).
 * 
 * @returns true if AI is allowed, false if quota exceeded
 */
export const checkAndIncrementAiUsage = async (userId: number): Promise<boolean> => {
    const user = await prisma.user.findUnique({
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
        await prisma.user.update({
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
    await prisma.user.update({
        where: { id: userId },
        data: {
            aiUsageCount: { increment: 1 },
            lastAiUsageDate: new Date()
        }
    });
    console.log(`[UsageService] User ${userId} - AI usage: ${user.aiUsageCount + 1}/${FREE_AI_LIMIT}`);
    return true;
};

/**
 * Get remaining AI usage for a user.
 * Returns { used, limit, isUnlimited }
 */
export const getAiUsageInfo = async (userId: number): Promise<{ used: number; limit: number; isUnlimited: boolean }> => {
    const user = await prisma.user.findUnique({
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
};
