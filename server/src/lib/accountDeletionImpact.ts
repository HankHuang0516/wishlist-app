import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { AccountSecurityError } from './accountSecurityRules';

/** Read-only confirmation inventory, never a deletion receipt or authority token. */
export async function readAccountDeletionImpact(userId: number) {
    if (!Number.isSafeInteger(userId) || userId < 1) throw new AccountSecurityError(401);
    return prisma.$transaction(async tx => {
        // Do not project profile content, credentials, other members or locations.
        if (!await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) throw new AccountSecurityError(401);
        const capturedAt = new Date();
        const conversations: Prisma.ConversationWhereInput = { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] };
        const counts = {
            wishlists: await tx.wishlist.count({ where: { userId } }),
            wishes: await tx.item.count({ where: { wishlist: { userId } } }),
            wishCreateReceipts: await tx.wishCreateReceipt.count({ where: { userId } }),
            listings: await tx.listing.count({ where: { ownerUserId: userId } }),
            uploadedPhotos: await tx.listingMedia.count({ where: { ownerUserId: userId } }),
            conversations: await tx.conversation.count({ where: conversations }),
            messagesAuthored: await tx.message.count({ where: { senderUserId: userId } }),
            // Other people's authored content needs explicit preservation, not a
            // blanket cascade. The count does not return their content/identity.
            otherMessagesInSharedConversations: await tx.message.count({ where: { conversation: conversations, senderUserId: { not: userId } } }),
            meetupAppointments: await tx.meetupAppointment.count({ where: { conversation: conversations } }),
            upcomingMeetupAppointments: await tx.meetupAppointment.count({ where: { conversation: conversations, status: { in: ['PROPOSED', 'CONFIRMED'] }, endsAt: { gt: capturedAt } } }),
            purchaseRecords: await tx.purchase.count({ where: { userId } }),
            giftClaimsInOtherWishlists: await tx.item.count({ where: { purchasedById: userId, wishlist: { userId: { not: userId } } } }),
            originalCreditsInOtherWishlists: await tx.item.count({ where: { originalUserId: userId, wishlist: { userId: { not: userId } } } }),
            itemWatches: await tx.itemWatch.count({ where: { userId } }),
            followRelationships: await tx.follow.count({ where: { OR: [{ followerId: userId }, { followingId: userId }] } }),
            blockRelationships: await tx.userBlock.count({ where: { OR: [{ blockerUserId: userId }, { blockedUserId: userId }] } }),
            feedbackRecords: await tx.feedback.count({ where: { userId } }),
            crawlerRecords: await tx.crawlerLog.count({ where: { userId } }),
            reportsAuthored: await tx.listingReport.count({ where: { reporterUserId: userId } }),
            reportOperationReceipts: await tx.listingReportOperation.count({ where: { reporterUserId: userId } }),
            reportsOnOwnedListings: await tx.listingReport.count({ where: { listing: { ownerUserId: userId } } }),
            moderationActionsOnOwnedListings: await tx.listingModerationAction.count({ where: { listing: { ownerUserId: userId } } }),
            moderationActionsDetachingOwnReports: await tx.listingModerationAction.count({ where: { report: { reporterUserId: userId }, listing: { ownerUserId: { not: userId } } } }),
        };
        return { version: 2 as const, previewOnly: true as const, accountDeleted: false as const, capturedAt: capturedAt.toISOString(), counts };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
