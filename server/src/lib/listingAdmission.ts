import { Prisma } from '@prisma/client';

// Every listing-associated chat/meetup writer takes this gate BEFORE sorted
// member gates. Moderation inventories all rooms before taking member gates,
// then rechecks rows. Account erasure takes no listing gate and can finish
// while moderation waits, without a User/FK row-lock inversion.
export async function lockListingAdmission(tx: Prisma.TransactionClient, listingId: string) {
    // Negative first int is disjoint from chat's positive user-id pair locks;
    // two-int locks are also disjoint from erasure's one-bigint member locks.
    // Bind the negative constant too: PostgreSQL otherwise casts positive
    // 2147483648 before applying unary minus, overflowing its integer type.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${-2147483648}::integer, hashtext(${listingId}))`;
}
