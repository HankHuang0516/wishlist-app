import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { ChatInputError, chatIdentity } from '../lib/chatRules';
import { assertFutureMeetup, parseMeetupAction } from '../lib/meetupRules';
import { isDiscoverable } from '../lib/listingRules';
import { lockChatPair } from './chatController';
import { lockListingAdmission } from '../lib/listingAdmission';

class MeetupFailure extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const reject = (status: number, code: string, message: string): never => { throw new MeetupFailure(status, code, message); };
const select = {
    id: true, conversationId: true, version: true, status: true, proposedByUserId: true, startsAt: true, endsAt: true, timeZone: true, placeName: true,
    latitude: true, longitude: true, notes: true, buyerConfirmedAt: true, sellerConfirmedAt: true, buyerCompletedAt: true, sellerCompletedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.MeetupAppointmentSelect;
async function member(tx: Prisma.TransactionClient, conversationId: string, userId: number) {
    const room = await tx.conversation.findFirst({ where: { id: conversationId, participants: { some: { userId } } }, select: { id: true, listingId: true, buyerUserId: true, sellerUserId: true, archivedAt: true } });
    if (!room) return reject(404, 'MEETUP_NOT_FOUND', '找不到預約或聊天室');
    if (room.archivedAt || room.buyerUserId === null || room.sellerUserId === null || room.listingId === null) return reject(409, 'MEETUP_ARCHIVED', '聊天室已封存，不能再使用面交預約');
    return { ...room, buyerUserId: room.buyerUserId, sellerUserId: room.sellerUserId, listingId: room.listingId };
}
async function lockMembers(tx: Prisma.TransactionClient, conversationId: string, actorUserId: number) {
    const initial = await member(tx, conversationId, actorUserId);
    await lockListingAdmission(tx, initial.listingId);
    for (const userId of [initial.buyerUserId, initial.sellerUserId].sort((a, b) => a - b)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(${4_294_967_296 + userId}::bigint)`;
    await lockChatPair(tx, initial.buyerUserId, initial.sellerUserId);
    return member(tx, conversationId, actorUserId);
}
function fail(res: Response, e: unknown) {
    if (e instanceof ChatInputError) return res.status(400).json({ error: e.message, errorCode: 'INVALID_MEETUP_INPUT' });
    if (e instanceof MeetupFailure) return res.status(e.status).json({ error: e.message, errorCode: e.code });
    return res.status(500).json({ error: '面交服務暫時無法使用', errorCode: 'MEETUP_SERVICE_ERROR' });
}
export async function getMeetup(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const conversationId = chatIdentity(req.params.id); await member(prisma, conversationId, req.user.id);
        const appointment = await prisma.meetupAppointment.findUnique({ where: { conversationId }, select });
        return res.set('Cache-Control', 'private, no-store').json({ appointment });
    } catch (e) { return fail(res, e); }
}
export async function mutateMeetup(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const conversationId = chatIdentity(req.params.id), actorUserId = req.user.id, input = parseMeetupAction(req.body);
        const result = await prisma.$transaction(async tx => {
            // Appointment conflicts must serialize even across DIFFERENT pairs
            // sharing a buyer/seller. One-bigint namespace is distinct from
            // chat's two-int pair locks; deterministic order avoids deadlocks.
            const room = await lockMembers(tx, conversationId, actorUserId);
            const receiptKey = { conversationId, actorUserId, clientActionId: input.clientActionId };
            const receipt = await tx.meetupOperation.findUnique({ where: { conversationId_actorUserId_clientActionId: receiptKey }, select: { requestHash: true, resultingVersion: true, abandoned: true } });
            let current = await tx.meetupAppointment.findUnique({ where: { conversationId }, select });
            if (receipt) {
                if (receipt.requestHash !== input.requestHash) return reject(409, 'MEETUP_ACTION_CONFLICT', '此操作識別碼已用於不同內容');
                return { appointment: current, receipt: { ...receiptKey, action: input.action, resultingVersion: receipt.resultingVersion, abandoned: receipt.abandoned }, replayed: true };
            }
            if (input.expectedVersion !== (current?.version ?? 0)) return reject(409, 'MEETUP_VERSION_CONFLICT', '預約已更新，請重新載入並確認新版本');
            const now = new Date(), proposing = input.action === 'PROPOSE' || input.action === 'REVISE';
            if (input.action === 'PROPOSE' && current) return reject(409, 'MEETUP_VERSION_CONFLICT', '已有預約，請使用改期');
            if (input.action !== 'PROPOSE' && !current) return reject(404, 'MEETUP_NOT_FOUND', '尚未有面交預約');
            if (current?.status === 'COMPLETED') return reject(409, 'MEETUP_STATE_CONFLICT', '已完成的預約不能修改');
            if (!proposing && current?.status === 'CANCELLED') return reject(409, 'MEETUP_STATE_CONFLICT', '預約已取消；若重新提議必須重新確認');
            if (proposing || input.action === 'CONFIRM') {
                if (await tx.userBlock.findFirst({ where: { OR: [{ blockerUserId: room.buyerUserId, blockedUserId: room.sellerUserId }, { blockerUserId: room.sellerUserId, blockedUserId: room.buyerUserId }] } })) return reject(403, 'MEETUP_BLOCKED', '已封鎖，不能新增或確認面交；仍可取消既有預約');
                // A seller's concurrent status edit must not be bypassed by a
                // stale listing check. This locks only the listing, not GPS.
                await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${room.listingId} FOR SHARE`;
                const listing = await tx.listing.findUnique({ where: { id: room.listingId }, select: { status: true, expiresAt: true, deliveryMethods: true } });
                if (!listing || !isDiscoverable(listing.status, listing.expiresAt, now)) return reject(409, 'MEETUP_LISTING_UNAVAILABLE', '商品已停止刊登，請先與賣家確認；仍可取消既有預約');
                if (!listing.deliveryMethods.includes('MEETUP')) return reject(409, 'MEETUP_NOT_SUPPORTED', '此商品尚未提供面交');
                const terms = proposing ? input.terms! : current!;
                assertFutureMeetup(terms.startsAt, now);
                const conflict = await tx.meetupAppointment.findFirst({ where: { conversationId: { not: conversationId }, status: 'CONFIRMED', startsAt: { lt: terms.endsAt }, endsAt: { gt: terms.startsAt }, conversation: { OR: [{ buyerUserId: { in: [room.buyerUserId, room.sellerUserId] } }, { sellerUserId: { in: [room.buyerUserId, room.sellerUserId] } }] } }, select: { id: true } });
                if (conflict) return reject(409, 'MEETUP_TIME_CONFLICT', '任一方已有時間重疊的面交，請選其他時間');
            }
            const buyer = actorUserId === room.buyerUserId;
            if (proposing) {
                const data = { ...input.terms!, proposedByUserId: actorUserId, version: input.expectedVersion + 1, status: 'PROPOSED' as const,
                    buyerConfirmedAt: buyer ? now : null, sellerConfirmedAt: buyer ? null : now, buyerCompletedAt: null, sellerCompletedAt: null };
                current = current ? await tx.meetupAppointment.update({ where: { conversationId }, data, select }) : await tx.meetupAppointment.create({ data: { conversationId, ...data }, select });
            } else if (input.action === 'CONFIRM') {
                const buyerConfirmedAt = buyer ? current!.buyerConfirmedAt ?? now : current!.buyerConfirmedAt;
                const sellerConfirmedAt = buyer ? current!.sellerConfirmedAt : current!.sellerConfirmedAt ?? now;
                current = await tx.meetupAppointment.update({ where: { conversationId }, data: { buyerConfirmedAt, sellerConfirmedAt, status: buyerConfirmedAt && sellerConfirmedAt ? 'CONFIRMED' : 'PROPOSED' }, select });
            } else if (input.action === 'CANCEL') {
                current = await tx.meetupAppointment.update({ where: { conversationId }, data: { status: 'CANCELLED' }, select });
            } else {
                if (current!.status !== 'CONFIRMED' || current!.startsAt > now) return reject(409, 'MEETUP_STATE_CONFLICT', '只有已確認且時間已開始的面交可回報完成');
                const buyerCompletedAt = buyer ? current!.buyerCompletedAt ?? now : current!.buyerCompletedAt;
                const sellerCompletedAt = buyer ? current!.sellerCompletedAt : current!.sellerCompletedAt ?? now;
                current = await tx.meetupAppointment.update({ where: { conversationId }, data: { buyerCompletedAt, sellerCompletedAt, status: buyerCompletedAt && sellerCompletedAt ? 'COMPLETED' : 'CONFIRMED' }, select });
            }
            const saved = await tx.meetupOperation.create({ data: { ...receiptKey, requestHash: input.requestHash, action: input.action, resultingVersion: current!.version }, select: { resultingVersion: true } });
            return { appointment: current, receipt: { ...receiptKey, action: input.action, resultingVersion: saved.resultingVersion, abandoned: false }, replayed: false };
        }, { timeout: 15_000 });
        return res.set('Cache-Control', 'private, no-store').status(result.replayed ? 200 : 201).json(result);
    } catch (e) { return fail(res, e); }
}
export async function abandonMeetupAction(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const conversationId = chatIdentity(req.params.id), actorUserId = req.user.id, input = parseMeetupAction(req.body);
        const result = await prisma.$transaction(async tx => {
            await lockMembers(tx, conversationId, actorUserId);
            const key = { conversationId, actorUserId, clientActionId: input.clientActionId };
            const existing = await tx.meetupOperation.findUnique({ where: { conversationId_actorUserId_clientActionId: key }, select: { requestHash: true, resultingVersion: true, abandoned: true } });
            if (existing && existing.requestHash !== input.requestHash) return reject(409, 'MEETUP_ACTION_CONFLICT', '此操作識別碼已用於不同內容');
            // Same lock as mutation: either the original already committed and
            // we ACK it, OR a tombstone guarantees any delayed original cannot
            // apply. A bare GET/404 cannot provide this guarantee.
            const receipt = existing ?? await tx.meetupOperation.create({ data: { ...key, requestHash: input.requestHash, action: input.action, resultingVersion: 0, abandoned: true }, select: { resultingVersion: true, abandoned: true } });
            const appointment = await tx.meetupAppointment.findUnique({ where: { conversationId }, select });
            return { appointment, receipt: { ...key, action: input.action, resultingVersion: receipt.resultingVersion, abandoned: receipt.abandoned }, replayed: !!existing };
        }, { timeout: 15_000 });
        return res.set('Cache-Control', 'private, no-store').json(result);
    } catch (e) { return fail(res, e); }
}
