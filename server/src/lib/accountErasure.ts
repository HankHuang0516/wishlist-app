import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { AccountSecurityError, boundedPassword } from './accountSecurityRules';
import { isListingId } from './listingRules';
import { ListingMediaStorage } from './listingMediaStorage';
import { ListingFlickrStorage } from './listingFlickrStorage';
import { legacyAssetCandidate } from './legacyAssetInventory';

export function erasureIdentityHash(userId: number, authVersion: number) {
    if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647 ||
        !Number.isInteger(authVersion) || authVersion < 0 || authVersion > 2147483647) throw new AccountSecurityError(401);
    return createHash('sha256').update(`account-erasure-v1:${userId}:${authVersion}`).digest('hex');
}

/** Callers MUST verify the session's JWT before invoking, including receipt retry.
 * Preview counts are not authority: password and version are checked anew here.
 */
export async function eraseAccountData(userId: number, authVersion: number, password: unknown, clientActionId: string) {
    const currentPassword = boundedPassword(password), identityHash = erasureIdentityHash(userId, authVersion);
    if (!isListingId(clientActionId)) throw new AccountSecurityError();
    for (let attempt = 0; ; attempt++) {
        try {
            return await prisma.$transaction(async tx => {
                // One member gate blocks ALL existing and unknown future chat
                // pairs involving this user. Do not wait on any peer's gate.
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(${4294967296 + userId}::bigint)`;
                const prior = await receiptFor(tx, identityHash, clientActionId);
                if (prior?.abandoned) throw new AccountSecurityError(409);
                if (prior) return receiptProjection(tx, prior, identityHash, clientActionId);
                await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
                const user = await tx.user.findUnique({ where: { id: userId }, select: { password: true, authVersion: true, avatarUrl: true } });
                if (!user || user.authVersion !== authVersion || !await bcrypt.compare(currentPassword, user.password)) throw new AccountSecurityError(401);
                // READ COMMITTED inventory AFTER the key lock sees any earlier
                // committed FK insert; later User-referencing inserts cannot
                // commit behind it. A repeatable snapshot before the gate could
                // silently miss a concurrently opened room or uploaded photo.
                const rooms = await tx.conversation.findMany({ where: { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] }, select: { id: true } });
                const media = await tx.listingMedia.findMany({ where: { ownerUserId: userId }, select: { id: true, flickrPhotoId: true } });
                // Independent outbox survives both User and ListingMedia erasure.
                if (media.length) await tx.mediaErasureTask.createMany({ data: media.map(m => ({ mediaId: m.id, flickrPhotoId: m.flickrPhotoId, identityHash, clientActionId })), skipDuplicates: true });
                // Capture legacy asset provenance BEFORE losing profile/wish
                // links. No filesystem or third-party API runs in this tx.
                const oldWishes = await tx.item.findMany({ where: { wishlist: { userId }, imageUrl: { not: null } }, select: { id: true, imageUrl: true } });
                const candidates = [{ resourceType: 'AVATAR', resourceId: userId, url: user.avatarUrl }, ...oldWishes.map(item => ({ resourceType: 'WISH_IMAGE', resourceId: item.id, url: item.imageUrl }))];
                for (const candidate of candidates) {
                    const asset = legacyAssetCandidate(candidate.url);
                    if (asset) await tx.legacyAssetErasureTask.create({ data: { identityHash, clientActionId, ...asset, resourceType: candidate.resourceType, resourceId: candidate.resourceId } });
                }
                const shared = { conversationId: { in: rooms.map(r => r.id) } };
                await tx.meetupAppointment.deleteMany({ where: shared });
                await tx.meetupOperation.deleteMany({ where: shared });
                const now = new Date();
                await tx.conversation.updateMany({ where: { id: { in: rooms.map(r => r.id) } }, data: { archivedAt: now, listingId: null, lastMessageAt: now } });
                // No counterparty-authored message is selected/copied/deleted.
                await tx.message.deleteMany({ where: { senderUserId: userId } });
                await tx.item.updateMany({ where: { purchasedById: userId, wishlist: { userId: { not: userId } } }, data: { purchasedById: null, isPurchased: false } });
                await tx.item.updateMany({ where: { originalUserId: userId, wishlist: { userId: { not: userId } } }, data: { originalUserId: null } });
                await tx.feedback.deleteMany({ where: { userId } });
                await tx.crawlerLog.deleteMany({ where: { userId } });
                await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
                await tx.wishlist.deleteMany({ where: { userId } });
                // Cascades erase own media, listings, participants, watches,
                // blocks and request tombstones; nullable FK detaches ledger.
                await tx.user.delete({ where: { id: userId } });
                // If the last participant is erased, no one retains a claim to
                // an empty room's metadata. Preserve every surviving room.
                await tx.conversation.deleteMany({ where: { id: { in: rooms.map(r => r.id) }, participants: { none: {} } } });
                const receipt = await tx.accountErasureReceipt.create({ data: { identityHash, clientActionId, erasedAt: now }, select: { erasedAt: true, abandoned: true } });
                // Never report physical-file cleanup complete merely on commit.
                return receiptProjection(tx, receipt, identityHash, clientActionId);
            }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
        } catch (failure) {
            if (attempt < 2 && failure instanceof Prisma.PrismaClientKnownRequestError && failure.code === 'P2034') continue;
            throw failure;
        }
    }
}

/** Receipt lookup is not authentication; a transport must verify JWT claims. */
const receiptFor = (tx: Prisma.TransactionClient, identityHash: string, clientActionId: string) => tx.accountErasureReceipt.findUnique({ where: { identityHash_clientActionId: { identityHash, clientActionId } }, select: { erasedAt: true, abandoned: true } });
async function receiptProjection(tx: Prisma.TransactionClient, receipt: { erasedAt: Date | null; abandoned: boolean }, identityHash: string, clientActionId: string) {
    if (receipt.abandoned) return { state: 'ABANDONED' as const, accountDeleted: false as const, erasedAt: null, clientActionId, photoCleanupPending: 0, legacyCleanupPending: 0 };
    if (!receipt.erasedAt) throw new AccountSecurityError(503);
    const where = { identityHash, clientActionId };
    return { state: 'ERASED' as const, accountDeleted: true as const, erasedAt: receipt.erasedAt.toISOString(), clientActionId,
        photoCleanupPending: await tx.mediaErasureTask.count({ where }), legacyCleanupPending: await tx.legacyAssetErasureTask.count({ where }) };
}
export async function readAccountErasureReceipt(userId: number, authVersion: number, clientActionId: string) {
    const identityHash = erasureIdentityHash(userId, authVersion);
    if (!isListingId(clientActionId)) throw new AccountSecurityError();
    return prisma.$transaction(async tx => {
        const receipt = await receiptFor(tx, identityHash, clientActionId);
        return receipt ? receiptProjection(tx, receipt, identityHash, clientActionId) : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

/** Either ACK a committed deletion, or prevent every delayed original/retry.
 * GET/404 cannot provide this guarantee; the same member gate does.
 */
export async function abandonAccountErasure(userId: number, authVersion: number, clientActionId: string) {
    const identityHash = erasureIdentityHash(userId, authVersion);
    if (!isListingId(clientActionId)) throw new AccountSecurityError();
    return prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${4294967296 + userId}::bigint)`;
        const prior = await receiptFor(tx, identityHash, clientActionId);
        if (prior) return receiptProjection(tx, prior, identityHash, clientActionId);
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId }, select: { authVersion: true } });
        if (!user || user.authVersion !== authVersion) throw new AccountSecurityError(401);
        const receipt = await tx.accountErasureReceipt.create({ data: { identityHash, clientActionId, abandoned: true, erasedAt: null }, select: { abandoned: true, erasedAt: true } });
        return receiptProjection(tx, receipt, identityHash, clientActionId);
    }, { timeout: 30000 });
}

/** Bounded multi-worker-safe drain. Crash/failure leaves a durable retry task.
 * The exact UUID directory's two known files are the only filesystem targets.
 */
export async function drainMediaErasureTasks(limit = 25, storage = new ListingMediaStorage(), flickrStorage = new ListingFlickrStorage()) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AccountSecurityError();
    let completed = 0;
    const candidates = await prisma.mediaErasureTask.findMany({ orderBy: [{ attempts: 'asc' }, { createdAt: 'asc' }, { mediaId: 'asc' }], take: limit, select: { mediaId: true, flickrPhotoId: true } });
    for (const { mediaId, flickrPhotoId } of candidates) {
        const removed = await prisma.$transaction(async tx => {
            const locked = await tx.$queryRaw<Array<{ mediaId: string }>>`SELECT "mediaId" FROM "MediaErasureTask" WHERE "mediaId" = ${mediaId}::uuid FOR UPDATE SKIP LOCKED`;
            if (!locked.length) return false;
            // Never trust an outbox entry to erase a still-owned media record.
            if (await tx.listingMedia.findUnique({ where: { id: mediaId }, select: { id: true } })) return false;
            try { if (flickrPhotoId) await flickrStorage.remove(flickrPhotoId); else await storage.remove(mediaId); }
            catch { await tx.mediaErasureTask.update({ where: { mediaId }, data: { attempts: { increment: 1 } } }); return false; }
            await tx.mediaErasureTask.delete({ where: { mediaId } }); return true;
        }, { timeout: 15000 });
        if (removed) completed++;
    }
    return { completed };
}
