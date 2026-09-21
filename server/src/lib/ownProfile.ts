import type { Prisma } from '@prisma/client';

// Explicit projection: future User credential columns must not silently enter
// settings responses. Personal API keys use a separate authenticated endpoint.
export const ownProfileSelect = {
    id: true, phoneNumber: true, name: true, nicknames: true, realName: true,
    address: true, birthday: true, avatarUrl: true, createdAt: true, updatedAt: true,
    isAvatarVisible: true, isPhoneVisible: true, isRealNameVisible: true,
    isAddressVisible: true, isBirthdayVisible: true, isPremium: true,
    maxWishlistItems: true, maxFollowing: true, email: true, isEmailVisible: true,
    isEmailVerified: true, isPhoneVerified: true, subscriptionStatus: true,
    subscriptionExpiresAt: true, autoRenew: true, lastFeedbackAt: true,
    aiUsageCount: true, lastAiUsageDate: true,
} satisfies Prisma.UserSelect;
