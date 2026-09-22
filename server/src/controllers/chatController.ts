import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isDiscoverable } from '../lib/listingRules';
import { lockListingAdmission } from '../lib/listingAdmission';
import { ChatInputError, chatIdentity, chatObject, chatSequence, parseChatPage, parseTextMessage } from '../lib/chatRules';

class ChatAccessError extends Error { constructor(public status = 404) { super(); } }
class ChatConflictError extends Error {}
class ChatArchivedError extends Error {}
function fail(res: Response, error: unknown) {
    if (error instanceof ChatInputError) return res.status(400).json({ error: error.message, errorCode: 'INVALID_CHAT_INPUT' });
    if (error instanceof ChatAccessError) return res.status(error.status).json({ error: error.status === 403 ? '已封鎖，無法建立聊天或傳送新訊息' : '聊天室或帳號不存在', errorCode: 'CHAT_ACCESS_DENIED' });
    if (error instanceof ChatConflictError) return res.status(409).json({ error: '訊息識別碼已用於不同內容', errorCode: 'CHAT_MESSAGE_CONFLICT' });
    if (error instanceof ChatArchivedError) return res.status(403).json({ error: '聊天室已封存，僅能查看保留的歷史', errorCode: 'CHAT_ARCHIVED' });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2025'].includes(error.code)) return res.status(404).json({ error: '聊天室或帳號已不存在', errorCode: 'CHAT_ACCESS_DENIED' });
    return res.status(500).json({ error: '聊天服務暫時無法使用', errorCode: 'CHAT_SERVICE_ERROR' });
}
const messageSelect = { id: true, conversationId: true, senderUserId: true, clientMessageId: true, sequence: true, text: true, createdAt: true } satisfies Prisma.MessageSelect;
const conversationSelect = {
    id: true, listingId: true, buyerUserId: true, sellerUserId: true, archivedAt: true, lastMessageSequence: true, lastMessageAt: true, createdAt: true,
    buyer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true } },
    listing: { select: { id: true, title: true, status: true, expiresAt: true, location: { select: { county: true, district: true } } } },
    participants: { select: { userId: true, role: true, lastReadSequence: true } },
} satisfies Prisma.ConversationSelect;
type Room = Prisma.ConversationGetPayload<{ select: typeof conversationSelect }>;
const blockedWhere = (a: number, b: number) => ({ OR: [{ blockerUserId: a, blockedUserId: b }, { blockerUserId: b, blockedUserId: a }] });

// Block, room creation and sends serialize on the SAME pair in the database,
// not on a process-local mutex. A committed block forbids any subsequent new
// message across workers; a same-key retry can still acknowledge an earlier send.
export async function lockChatPair(tx: Prisma.TransactionClient, a: number, b: number) {
    // Account erasure takes its own member gate before the User key lock.
    // Every writer uses the same sorted member gates before the pair/FK locks,
    // so an unknown new pair cannot appear behind the erasure inventory.
    for (const member of [...new Set([a, b])].sort((x, y) => x - y)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(${4294967296 + member}::bigint)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Math.min(a, b)}::integer, ${Math.max(a, b)}::integer)`;
}
async function roomFor(userId: number, id: string, tx: Prisma.TransactionClient = prisma) {
    const room = await tx.conversation.findFirst({ where: { id, participants: { some: { userId } } }, select: conversationSelect });
    if (!room) throw new ChatAccessError(); return room;
}
async function projection(room: Room, userId: number) {
    const me = room.participants.find(p => p.userId === userId)!;
    const otherUserId = room.buyerUserId === userId ? room.sellerUserId : room.buyerUserId;
    const [unreadCount, block] = await Promise.all([
        prisma.message.count({ where: { conversationId: room.id, senderUserId: { not: userId }, sequence: { gt: me.lastReadSequence } } }),
        otherUserId === null ? Promise.resolve([]) : prisma.userBlock.findMany({ where: blockedWhere(userId, otherUserId), select: { blockerUserId: true } }),
    ]);
    const { participants, ...publicToMembers } = room;
    return { ...publicToMembers, lastReadSequence: me.lastReadSequence, unreadCount, blocked: block.length > 0,
        blockedByMe: block.some(row => row.blockerUserId === userId), blockedByOther: block.some(row => row.blockerUserId === otherUserId),
        archived: !!room.archivedAt || !room.buyer || !room.seller || !room.listing,
        listingAvailable: !room.archivedAt && !!room.buyer && !!room.seller && !!room.listing && isDiscoverable(room.listing.status, room.listing.expiresAt, new Date()) };
}

export async function openConversation(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const body = chatObject(req.body, ['listingId']); const listingId = chatIdentity(body.listingId); const buyerUserId = req.user.id;
        const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { ownerUserId: true } });
        if (!listing) throw new ChatAccessError(); const sellerUserId = listing.ownerUserId;
        if (sellerUserId === buyerUserId) throw new ChatInputError('無法與自己建立商品聊天');
        const result = await prisma.$transaction(async tx => {
            await lockListingAdmission(tx, listingId);
            await lockChatPair(tx, buyerUserId, sellerUserId);
            const existing = await tx.conversation.findUnique({ where: { listingId_buyerUserId_sellerUserId: { listingId, buyerUserId, sellerUserId } }, select: conversationSelect });
            if (existing) return { room: existing, created: false };
            if (!await tx.user.findUnique({ where: { id: buyerUserId }, select: { id: true } })) throw new ChatAccessError(401);
            if (await tx.userBlock.findFirst({ where: blockedWhere(buyerUserId, sellerUserId) })) throw new ChatAccessError(403);
            const current = await tx.listing.findUnique({ where: { id: listingId }, select: { status: true, expiresAt: true, ownerUserId: true } });
            if (!current || current.ownerUserId !== sellerUserId || !isDiscoverable(current.status, current.expiresAt, new Date())) throw new ChatAccessError();
            return { room: await tx.conversation.create({ data: { listingId, buyerUserId, sellerUserId, participants: { create: [
                { userId: buyerUserId, role: 'BUYER' }, { userId: sellerUserId, role: 'SELLER' },
            ] } }, select: conversationSelect }), created: true };
        });
        return res.status(result.created ? 201 : 200).json(await projection(result.room, buyerUserId));
    } catch (error) { return fail(res, error); }
}
export async function listConversations(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const userId = req.user.id; const page = parseChatPage(req.query);
        // A cursor must itself belong to this member, avoiding an outsider
        // cursor as a covert anchor into someone else's inbox ordering.
        if (page.cursor) await roomFor(userId, page.cursor);
        const rows = await prisma.conversation.findMany({ where: { participants: { some: { userId } } }, select: conversationSelect,
            orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }], take: page.limit + 1,
            ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}) });
        const items = await Promise.all(rows.slice(0, page.limit).map(room => projection(room, userId)));
        return res.json({ items, nextCursor: rows.length > page.limit ? items[items.length - 1].id : null });
    } catch (error) { return fail(res, error); }
}
export async function getConversation(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try { return res.json(await projection(await roomFor(req.user.id, chatIdentity(req.params.id)), req.user.id)); }
    catch (error) { return fail(res, error); }
}
export async function getMessages(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const id = chatIdentity(req.params.id); await roomFor(req.user.id, id); const page = parseChatPage(req.query, true);
        const forward = page.afterSequence !== undefined;
        const rows = await prisma.message.findMany({ where: { conversationId: id,
            ...(page.beforeSequence !== undefined ? { sequence: { lt: page.beforeSequence } } : {}),
            ...(forward ? { sequence: { gt: page.afterSequence } } : {}) }, select: messageSelect,
            orderBy: { sequence: forward ? 'asc' : 'desc' }, take: page.limit + 1 });
        const chosen = rows.slice(0, page.limit); const hasMore = rows.length > page.limit;
        const anchor = chosen[chosen.length - 1]?.sequence;
        return res.json({ items: forward ? chosen : chosen.reverse(), nextBeforeSequence: !forward && hasMore ? anchor : null, nextAfterSequence: forward && hasMore ? anchor : null });
    } catch (error) { return fail(res, error); }
}
export async function getMyMessageReceipt(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const conversationId = chatIdentity(req.params.id); const clientMessageId = chatIdentity(req.params.clientMessageId); await roomFor(req.user.id, conversationId);
        const message = await prisma.message.findUnique({ where: { conversationId_senderUserId_clientMessageId: { conversationId, senderUserId: req.user.id, clientMessageId } }, select: messageSelect });
        if (!message) return res.status(404).json({ error: '尚未找到已送出的訊息' }); return res.json(message);
    } catch (error) { return fail(res, error); }
}
export async function sendMessage(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const conversationId = chatIdentity(req.params.id); const input = parseTextMessage(req.body); const senderUserId = req.user.id;
        const room = await roomFor(senderUserId, conversationId);
        if (room.buyerUserId === null || room.sellerUserId === null || room.archivedAt || room.listingId === null) throw new ChatArchivedError();
        const buyer = room.buyerUserId, seller = room.sellerUserId;
        const listingId = room.listingId;
        const result = await prisma.$transaction(async tx => {
            await lockListingAdmission(tx, listingId);
            await lockChatPair(tx, buyer, seller);
            const current = await roomFor(senderUserId, conversationId, tx);
            if (current.archivedAt || current.buyerUserId === null || current.sellerUserId === null || current.listingId === null) throw new ChatArchivedError();
            const existing = await tx.message.findUnique({ where: { conversationId_senderUserId_clientMessageId: { conversationId, senderUserId, clientMessageId: input.clientMessageId } }, select: messageSelect });
            if (existing) { if (existing.text !== input.text) throw new ChatConflictError(); return { message: existing, created: false }; }
            if (await tx.userBlock.findFirst({ where: blockedWhere(buyer, seller) })) throw new ChatAccessError(403);
            const updated = await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageSequence: { increment: 1 }, lastMessageAt: new Date() }, select: { lastMessageSequence: true } });
            const message = await tx.message.create({ data: { conversationId, senderUserId, ...input, sequence: updated.lastMessageSequence }, select: messageSelect });
            return { message, created: true };
        });
        return res.status(result.created ? 201 : 200).json(result.message);
    } catch (error) { return fail(res, error); }
}
export async function markConversationRead(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const conversationId = chatIdentity(req.params.id); const body = chatObject(req.body, ['throughSequence']); const throughSequence = chatSequence(body.throughSequence); const userId = req.user.id;
        const room = await roomFor(userId, conversationId);
        if (throughSequence > room.lastMessageSequence) throw new ChatInputError('不能標記尚不存在的訊息為已讀');
        await prisma.conversationParticipant.updateMany({ where: { conversationId, userId, lastReadSequence: { lt: throughSequence } }, data: { lastReadSequence: throughSequence } });
        return res.json(await projection(await roomFor(userId, conversationId), userId));
    } catch (error) { return fail(res, error); }
}
function otherIdentity(value: unknown, self: number) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2_147_483_647 || Number(value) === self) throw new ChatInputError('封鎖對象不正確'); return Number(value);
}
export async function setUserBlock(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const blockerUserId = req.user.id; const blockedUserId = otherIdentity(req.params.userId, blockerUserId); chatObject(req.body ?? {}, []);
        await prisma.$transaction(async tx => {
            await lockChatPair(tx, blockerUserId, blockedUserId);
            if (!await tx.user.findUnique({ where: { id: blockedUserId }, select: { id: true } })) throw new ChatAccessError();
            if (req.method === 'DELETE') await tx.userBlock.deleteMany({ where: { blockerUserId, blockedUserId } });
            else await tx.userBlock.upsert({ where: { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } }, create: { blockerUserId, blockedUserId }, update: {} });
        });
        return res.json({ blocked: req.method !== 'DELETE' });
    } catch (error) { return fail(res, error); }
}
