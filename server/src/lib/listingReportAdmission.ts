import { Prisma } from '@prisma/client';

/** Always acquire operation -> listing -> sorted members -> SQL/FK locks.
 * Abandonment needs operation -> own member only; erasure never takes operation
 * gates. Same-key different listings cannot create a cross-listing lock cycle.
 * Negative two-int namespace is disjoint from listings and positive chat pairs.
 */
export async function lockListingReportOperation(tx: Prisma.TransactionClient, reporterUserId: number, clientReportId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${-2_147_483_647}::integer, hashtext(${reporterUserId + ':' + clientReportId}))`;
}
