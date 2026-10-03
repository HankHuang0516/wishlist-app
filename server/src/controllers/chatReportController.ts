import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { chatIdentity, chatObject, ChatInputError } from '../lib/chatRules';
import { listingCreationGate, ListingCreationError } from '../lib/listingCreation';
import { lockChatPair } from './chatController';
import { receiveSubmission, SubmissionConflict, submissionRequestHash } from '../lib/submissionReceipt';

export function chatReportBody(value: unknown) {
    const body = chatObject(value, ['clientReportId', 'reportedUserId', 'reason', 'details', 'messageId']);
    const clientReportId = chatIdentity(body.clientReportId);
    if (!Number.isSafeInteger(body.reportedUserId) || Number(body.reportedUserId) < 1 ||
        !['HARASSMENT', 'FRAUD', 'OBJECTIONABLE', 'SPAM', 'OTHER'].includes(String(body.reason)) ||
        typeof body.details !== 'string' || body.details.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.details)) throw new ChatInputError();
    const messageId = body.messageId === null ? null : chatIdentity(body.messageId);
    return { clientReportId, reportedUserId: Number(body.reportedUserId), reason: String(body.reason), details: body.details.trim(), messageId };
}
const payloadFor = (userId: number, conversationId: string, body: ReturnType<typeof chatReportBody>) => ({
    content: JSON.stringify({ kind: 'UGC_CHAT_REPORT', conversationId, reportedUserId: body.reportedUserId, reason: body.reason, details: body.details, messageId: body.messageId }),
    userId, contactEmail: null,
});
function failure(res: Response, error: unknown) {
    if (error instanceof ChatInputError) return res.status(400).json({ errorCode: 'INVALID_CHAT_REPORT' });
    if (error instanceof ListingCreationError) return res.status(error.status).json({ errorCode: error.code });
    if (error instanceof SubmissionConflict) return res.status(409).json({ errorCode: 'CHAT_REPORT_CONFLICT' });
    return res.status(503).json({ errorCode: 'CHAT_REPORT_UNCONFIRMED' });
}
const envelope = (receipt: { id: string; clientSubmissionId: string }, conversationId: string) => ({ received: true, clientReportId: receipt.clientSubmissionId, conversationId, receiptId: receipt.id });
export async function createChatReport(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ errorCode: 'MISSING_TOKEN' });
    try {
        if (Object.keys(req.query).length) throw new ChatInputError();
        const conversationId = chatIdentity(req.params.id), body = chatReportBody(req.body), userId = req.user.id;
        if (body.reportedUserId === userId) throw new ChatInputError();
        const payload = payloadFor(userId, conversationId, body), hash = submissionRequestHash('FEEDBACK', payload);
        const prior = await prisma.submissionReceipt.findUnique({ where: { clientSubmissionId: body.clientReportId } });
        if (prior) {
            if (prior.kind !== 'FEEDBACK' || prior.requestHash !== hash) throw new SubmissionConflict();
            const record = await prisma.feedback.findUnique({ where: { id: Number(prior.recordId) }, select: { userId: true, content: true } });
            if (!record || record.userId !== userId || record.content !== payload.content) return res.status(404).json({ errorCode: 'CHAT_REPORT_UNCONFIRMED' });
            return res.json(envelope(prior, conversationId));
        }
        const receipt = await receiveSubmission('FEEDBACK', body.clientReportId, payload, async tx => {
            await lockChatPair(tx, userId, body.reportedUserId);
            await listingCreationGate(tx, req, userId);
            const room = await tx.conversation.findFirst({ where: { id: conversationId, participants: { some: { userId } } }, select: { buyerUserId: true, sellerUserId: true } });
            if (!room || (room.buyerUserId === userId ? room.sellerUserId : room.buyerUserId) !== body.reportedUserId)
                throw new ListingCreationError(404, 'CHAT_REPORT_ACCESS_DENIED');
            if (body.messageId && !await tx.message.findFirst({ where: { id: body.messageId, conversationId, senderUserId: body.reportedUserId }, select: { id: true } })) throw new ChatInputError();
            return String((await tx.feedback.create({ data: payload })).id);
        }, `聊天安全檢舉\n${payload.content}\n請從既有管理收件系統查閱並處理；收件成功不代表已刪除內容。`);
        return res.status(201).json(envelope(receipt, conversationId));
    } catch (error) { return failure(res, error); }
}
export async function getChatReport(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ errorCode: 'MISSING_TOKEN' });
    try {
        if (Object.keys(req.query).length) throw new ChatInputError();
        const conversationId = chatIdentity(req.params.id), id = chatIdentity(req.params.clientReportId);
        const receipt = await prisma.submissionReceipt.findUnique({ where: { clientSubmissionId: id } });
        if (!receipt || receipt.kind !== 'FEEDBACK' || !/^\d+$/.test(receipt.recordId)) return res.status(404).json({ errorCode: 'CHAT_REPORT_UNCONFIRMED' });
        const record = await prisma.feedback.findUnique({ where: { id: Number(receipt.recordId) }, select: { userId: true, content: true } });
        if (!record || record.userId !== req.user.id) return res.status(404).json({ errorCode: 'CHAT_REPORT_UNCONFIRMED' });
        const content = JSON.parse(record.content);
        if (content.kind !== 'UGC_CHAT_REPORT' || content.conversationId !== conversationId) return res.status(404).json({ errorCode: 'CHAT_REPORT_UNCONFIRMED' });
        return res.json(envelope(receipt, conversationId));
    } catch (error) { return failure(res, error); }
}
