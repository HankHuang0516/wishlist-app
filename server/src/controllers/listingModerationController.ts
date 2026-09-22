import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isDiscoverable } from '../lib/listingRules';
import { lockListingAdmission } from '../lib/listingAdmission';
import { lockListingReportOperation } from '../lib/listingReportAdmission';
import { decodeUserSessionJwt } from '../lib/jwtConfig';
import { lockChatPair } from './chatController';
import { ModerationInputError, moderationId, parseListingReport, parseModerationDecision, parseReportPage, parseReportAbandonment } from '../lib/moderationRules';

class ModerationFailure extends Error { constructor(public status: number, public code: string) { super(); } }
const reject = (status: number, code: string): never => { throw new ModerationFailure(status, code); };
const reportSelect = { id: true, listingId: true, clientReportId: true, reason: true, details: true, status: true, version: true, createdAt: true, updatedAt: true } satisfies Prisma.ListingReportSelect;
const operationSelect = { clientReportId: true, requestHash: true, state: true, createdAt: true, report: { select: reportSelect } } satisfies Prisma.ListingReportOperationSelect;
type OperationRow = Prisma.ListingReportOperationGetPayload<{ select: typeof operationSelect }>;
const operationProjection = ({ report, ...operation }: OperationRow) => ({ operation, report });
const actionSelect = { id: true, reportId: true, listingId: true, clientDecisionId: true, decision: true, notes: true, actorKeyRef: true, expectedReportVersion: true,
    expectedListingVersion: true, listingStatusBefore: true, listingVersionBefore: true, createdAt: true } satisfies Prisma.ListingModerationActionSelect;
function fail(res: Response, error: unknown) {
    if (error instanceof ModerationInputError) return res.status(400).json({ error: '檢舉或審核資料格式不正確', errorCode: 'INVALID_MODERATION_INPUT' });
    if (error instanceof ModerationFailure) return res.status(error.status).json({ error: error.status === 409 ? '資料或操作識別碼已更新，請重新載入確認' : error.status === 403 ? '不能檢舉自己的商品' : '找不到檢舉或商品', errorCode: error.code });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (['P2003', 'P2025'].includes(error.code)) return res.status(404).json({ error: '找不到檢舉或商品', errorCode: 'MODERATION_NOT_FOUND' });
        if (['P2034', 'P2028'].includes(error.code)) return res.status(409).json({ error: '審核競爭或逾時，請先查詢原操作結果', errorCode: 'MODERATION_TRANSACTION_CONFLICT' });
    }
    return res.status(500).json({ error: '檢舉審核暫時無法使用', errorCode: 'MODERATION_SERVICE_ERROR' });
}
const same = (actual: string, expected: string) => { if (actual !== expected) reject(409, 'MODERATION_OPERATION_CONFLICT'); };
async function freshReporter(tx: Prisma.TransactionClient, req: AuthRequest, userId: number) {
    // Recheck the actual credential after the member gate. Middleware admission
    // alone can predate a concurrent password reset, key replacement or erasure.
    const user = await tx.user.findUnique({ where: { id: userId }, select: { authVersion: true, apiKey: true } });
    if (!user) return reject(401, 'REPORT_SESSION_UNAVAILABLE');
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== undefined) {
        if (typeof apiKey !== 'string' || !apiKey || user.apiKey !== apiKey) return reject(401, 'REPORT_SESSION_UNAVAILABLE');
    } else {
        try {
            const header = req.headers.authorization;
            const claims = decodeUserSessionJwt(typeof header === 'string' ? header.split(' ')[1] : '');
            if (claims.id !== userId || claims.authVersion !== user.authVersion) return reject(401, 'REPORT_SESSION_UNAVAILABLE');
        } catch { return reject(401, 'REPORT_SESSION_UNAVAILABLE'); }
    }
}

export async function createListingReport(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const input = parseListingReport(req.body), reporterUserId = req.user.id;
        const key = { reporterUserId, clientReportId: input.clientReportId };
        const lookup = () => prisma.listingReportOperation.findUnique({ where: { reporterUserId_clientReportId: key }, select: operationSelect });
        const replayResult = (row: OperationRow) => {
            same(row.requestHash, input.requestHash);
            if (row.state === 'ABANDONED') return reject(409, 'REPORT_OPERATION_ABANDONED');
            if (!row.report) return reject(409, 'REPORT_RECEIVED_CASE_REMOVED');
            return { report: row.report, replayed: true };
        };
        let result;
        try {
            result = await prisma.$transaction(async tx => {
                await lockListingReportOperation(tx, reporterUserId, input.clientReportId);
                const prior = await tx.listingReportOperation.findUnique({ where: { reporterUserId_clientReportId: key }, select: operationSelect });
                if (prior) {
                    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${4_294_967_296 + reporterUserId}::bigint)`;
                    await freshReporter(tx, req, reporterUserId);
                    return replayResult(prior);
                }
                await lockListingAdmission(tx, input.listingId);
                const initial = await tx.listing.findUnique({ where: { id: input.listingId }, select: { ownerUserId: true } });
                if (!initial) return reject(404, 'MODERATION_NOT_FOUND');
                if (initial.ownerUserId === reporterUserId) return reject(403, 'MODERATION_OWN_LISTING');
                await lockChatPair(tx, reporterUserId, initial.ownerUserId);
                await freshReporter(tx, req, reporterUserId);
                const listing = await tx.listing.findUnique({ where: { id: input.listingId }, select: { status: true, expiresAt: true, ownerUserId: true } });
                if (!listing || listing.ownerUserId !== initial.ownerUserId || !isDiscoverable(listing.status, listing.expiresAt, new Date())) return reject(404, 'MODERATION_NOT_FOUND');
                const report = await tx.listingReport.create({ data: { reporterUserId, ...input }, select: reportSelect });
                await tx.listingReportOperation.create({ data: { ...key, requestHash: input.requestHash, state: 'RECEIVED', reportId: report.id } });
                return { report, replayed: false };
            }, { timeout: 15_000 });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { const existing = await lookup(); if (existing) return res.status(200).json(replayResult(existing)); }
            throw error;
        }
        return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { return fail(res, error); }
}
export async function getMyReportOperation(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const clientReportId = moderationId(req.params.clientReportId);
        const row = await prisma.listingReportOperation.findUnique({ where: { reporterUserId_clientReportId: { reporterUserId: req.user.id, clientReportId } }, select: operationSelect });
        if (!row) return reject(404, 'MODERATION_NOT_FOUND');
        return res.json(operationProjection(row));
    } catch (error) { return fail(res, error); }
}
export async function abandonMyReport(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const reporterUserId = req.user.id, clientReportId = moderationId(req.params.clientReportId), input = parseReportAbandonment(req.body);
        const key = { reporterUserId, clientReportId };
        const row = await prisma.$transaction(async tx => {
            await lockListingReportOperation(tx, reporterUserId, clientReportId);
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${4_294_967_296 + reporterUserId}::bigint)`;
            await freshReporter(tx, req, reporterUserId);
            const prior = await tx.listingReportOperation.findUnique({ where: { reporterUserId_clientReportId: key }, select: operationSelect });
            // A received operation is acknowledged, NEVER falsely cancelled.
            if (prior) { same(prior.requestHash, input.requestHash); return prior; }
            return tx.listingReportOperation.create({ data: { ...key, ...input, state: 'ABANDONED' }, select: operationSelect });
        }, { timeout: 15_000 });
        return res.json(operationProjection(row));
    } catch (error) { return fail(res, error); }
}
export async function getMyReportReceipt(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const clientReportId = moderationId(req.params.clientReportId);
        const report = await prisma.listingReport.findUnique({ where: { reporterUserId_clientReportId: { reporterUserId: req.user.id, clientReportId } }, select: reportSelect });
        if (!report) return reject(404, 'MODERATION_NOT_FOUND'); return res.json({ report });
    } catch (error) { return fail(res, error); }
}
async function reportsPage(req: Request, res: Response, reporterUserId?: number) {
    try {
        const page = parseReportPage(req.query), where = { ...(reporterUserId === undefined ? {} : { reporterUserId }), ...(page.status ? { status: page.status } : {}) };
        if (page.cursor && !await prisma.listingReport.findFirst({ where: { ...where, id: page.cursor }, select: { id: true } })) return reject(404, 'MODERATION_NOT_FOUND');
        const select = reporterUserId === undefined ? { ...reportSelect, listing: { select: { id: true, title: true, status: true, version: true, expiresAt: true } } } : reportSelect;
        const rows = await prisma.listingReport.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: page.limit + 1,
            ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}) });
        const items = rows.slice(0, page.limit);
        return res.json({ items, nextCursor: rows.length > page.limit ? items[items.length - 1].id : null });
    } catch (error) { return fail(res, error); }
}
export async function getMyListingReports(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    return reportsPage(req, res, req.user.id);
}
export const getModerationQueue = (req: Request, res: Response) => reportsPage(req, res);
export async function getModerationReceipt(req: Request, res: Response) {
    try {
        const clientDecisionId = moderationId(req.params.clientDecisionId);
        const action = await prisma.listingModerationAction.findUnique({ where: { clientDecisionId }, select: actionSelect });
        if (!action) return reject(404, 'MODERATION_NOT_FOUND'); return res.json({ action });
    } catch (error) { return fail(res, error); }
}
export async function decideListingReport(req: Request, res: Response) {
    try {
        const reportId = moderationId(req.params.id), input = parseModerationDecision(req.body, reportId);
        const lookup = () => prisma.listingModerationAction.findUnique({ where: { clientDecisionId: input.clientDecisionId }, select: { ...actionSelect, requestHash: true } });
        const replay = (row: NonNullable<Awaited<ReturnType<typeof lookup>>>) => {
            same(row.requestHash, input.requestHash); const { requestHash, ...action } = row; return res.status(200).json({ action, replayed: true });
        };
        const prior = await lookup(); if (prior) return replay(prior);
        let result;
        try {
            result = await prisma.$transaction(async tx => {
                const initial = await tx.listingReport.findUnique({ where: { id: reportId }, select: { listingId: true } });
                if (!initial) return reject(404, 'MODERATION_NOT_FOUND');
                await lockListingAdmission(tx, initial.listingId);
                const inventory = await tx.listingReport.findUnique({ where: { id: reportId }, select: { reporterUserId: true, listing: { select: { ownerUserId: true } } } });
                if (!inventory) return reject(404, 'MODERATION_NOT_FOUND');
                const rooms = await tx.conversation.findMany({ where: { listingId: initial.listingId }, select: { id: true, buyerUserId: true, sellerUserId: true } });
                // Take ALL members in globally sorted order before any pair or
                // SQL row writes. Taking pairs one at a time can deadlock when
                // two rooms share a seller. Include reporter erasure too.
                const members = new Set([inventory.reporterUserId, inventory.listing.ownerUserId]);
                for (const room of rooms) { if (room.buyerUserId !== null) members.add(room.buyerUserId); if (room.sellerUserId !== null) members.add(room.sellerUserId); }
                for (const userId of [...members].sort((a, b) => a - b)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(${4_294_967_296 + userId}::bigint)`;
                for (const room of [...rooms].sort((a, b) => a.id.localeCompare(b.id))) if (room.buyerUserId !== null && room.sellerUserId !== null) await lockChatPair(tx, room.buyerUserId, room.sellerUserId);
                const existing = await tx.listingModerationAction.findUnique({ where: { clientDecisionId: input.clientDecisionId }, select: { ...actionSelect, requestHash: true } });
                if (existing) { same(existing.requestHash, input.requestHash); const { requestHash, ...action } = existing; return { action, replayed: true }; }
                const report = await tx.listingReport.findUnique({ where: { id: reportId }, select: { listingId: true, status: true, version: true } });
                const listing = await tx.listing.findUnique({ where: { id: initial.listingId }, select: { status: true, version: true } });
                if (!report || !listing) return reject(404, 'MODERATION_NOT_FOUND');
                if (report.status !== 'OPEN' || report.version !== input.expectedReportVersion) return reject(409, 'MODERATION_VERSION_CONFLICT');
                const removing = input.decision === 'REMOVE_LISTING';
                if (removing) {
                    if (listing.status === 'REMOVED' || listing.version !== input.expectedListingVersion) return reject(409, 'MODERATION_VERSION_CONFLICT');
                    const changed = await tx.listing.updateMany({ where: { id: report.listingId, version: input.expectedListingVersion!, status: { not: 'REMOVED' } }, data: { status: 'REMOVED', version: { increment: 1 } } });
                    if (changed.count !== 1) return reject(409, 'MODERATION_VERSION_CONFLICT');
                    const roomIds = rooms.map(room => room.id);
                    await tx.conversation.updateMany({ where: { listingId: report.listingId, archivedAt: null }, data: { archivedAt: new Date() } });
                    // Stop this transaction's private meetup terms/operations,
                    // not the members' messages or unrelated conversations.
                    await tx.meetupAppointment.deleteMany({ where: { conversationId: { in: roomIds } } });
                    await tx.meetupOperation.deleteMany({ where: { conversationId: { in: roomIds } } });
                }
                const changedReport = await tx.listingReport.updateMany({ where: { id: reportId, version: input.expectedReportVersion, status: 'OPEN' }, data: { status: removing ? 'REMOVED' : 'DISMISSED', version: { increment: 1 } } });
                if (changedReport.count !== 1) return reject(409, 'MODERATION_VERSION_CONFLICT');
                const { requestHash, ...data } = input;
                const action = await tx.listingModerationAction.create({ data: { ...data, requestHash, reportId, listingId: report.listingId,
                    actorKeyRef: 'wishlist-primary-admin', listingStatusBefore: listing.status, listingVersionBefore: listing.version }, select: actionSelect });
                return { action, replayed: false };
            }, { timeout: 20_000 });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { const existing = await lookup(); if (existing) return replay(existing); }
            throw error;
        }
        return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { return fail(res, error); }
}
