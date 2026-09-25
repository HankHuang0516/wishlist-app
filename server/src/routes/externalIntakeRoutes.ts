import { Router } from 'express';
import { createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import { Prisma, type ExternalCandidateStatus, type ExternalCandidateAiStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { marketplaceAdmin } from '../middleware/marketplaceAdmin';
import { EXTERNAL_OBSERVATION_MAX_AGE_MS, ExternalIntakeError, parseExternalCandidate, parseExternalSource } from '../lib/externalListingIntake';
import { eligibleExternalCandidate } from '../lib/externalListingPublication';
import { districtCenter } from '../lib/doubleNorthDistrictCenters';
import { isListingId } from '../lib/listingRules';

const writes = () => rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: '外部來源操作過於頻繁', errorCode: 'EXTERNAL_INTAKE_RATE_LIMIT' } });
const fail = (res: import('express').Response, error: unknown) => {
    if (error instanceof ExternalIntakeError) return res.status(400).json({ error: error.message, field: error.field, errorCode: 'EXTERNAL_INTAKE_INPUT' });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: '來源資料已存在', errorCode: 'EXTERNAL_INTAKE_CONFLICT' });
    return res.status(503).json({ error: '外部來源暫時無法處理', errorCode: 'EXTERNAL_INTAKE_UNAVAILABLE' });
};

// Admin-only staging and review. Candidate approval exposes only the separate,
// feature-gated, revalidated external index; it never creates seller Listings.
export function createExternalIntakeRoutes(getCredential: () => unknown = () => process.env.ADMIN_API_KEY) {
    const router = Router();
    router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
    router.use(marketplaceAdmin(getCredential));

    router.get('/sources', async (_req, res) => {
        try { return res.json({ items: await prisma.externalListingSource.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) }); }
        catch (error) { return fail(res, error); }
    });
    router.get('/sources/:id/intake-batches', async (req, res) => {
        try {
            if (!isListingId(req.params.id)) return res.status(404).json({ error: '來源不存在' });
            const cursor = req.query.cursor;
            if (cursor !== undefined && !isListingId(cursor)) throw new ExternalIntakeError('cursor');
            if (!await prisma.externalListingSource.findUnique({ where: { id: req.params.id }, select: { id: true } }))
                return res.status(404).json({ error: '來源不存在' });
            if (cursor) {
                const previous = await prisma.externalIntakeBatch.findUnique({ where: { id: cursor }, select: { sourceId: true } });
                if (previous?.sourceId !== req.params.id) throw new ExternalIntakeError('cursor');
            }
            const rows = await prisma.externalIntakeBatch.findMany({ where: { sourceId: req.params.id },
                orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: 26,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
            return res.json({ items: rows.slice(0, 25), nextCursor: rows.length > 25 ? rows[24].id : null });
        } catch (error) { return fail(res, error); }
    });
    router.post('/sources', writes(), async (req, res) => {
        try {
            const parsed = parseExternalSource(req.body);
            const source = await prisma.externalListingSource.create({ data: parsed });
            return res.status(201).json(source);
        } catch (error) { return fail(res, error); }
    });
    router.post('/sources/:id/activate', writes(), async (req, res) => {
        try {
            if (!isListingId(req.params.id)) return res.status(404).json({ error: '來源不存在' });
            if (!req.body || Object.keys(req.body).some(key => !['authorizationRef', 'confirmRights', 'confirmAiProcessing'].includes(key)) ||
                req.body.confirmRights !== true ||
                typeof req.body.authorizationRef !== 'string') throw new ExternalIntakeError('confirmRights', '須明確核對來源授權與圖片／文字使用範圍');
            const source = await prisma.externalListingSource.findUnique({ where: { id: req.params.id } });
            if (!source) return res.status(404).json({ error: '來源不存在' });
            if (source.authorizationRef !== req.body.authorizationRef) throw new ExternalIntakeError('authorizationRef');
            if (source.aiProcessingAllowed ? req.body.confirmAiProcessing !== true : req.body.confirmAiProcessing !== undefined)
                throw new ExternalIntakeError('confirmAiProcessing', 'AI 分析須另行確認授權範圍');
            return res.json(await prisma.externalListingSource.update({ where: { id: source.id }, data: { enabled: true, enabledAt: source.enabledAt ?? new Date() } }));
        } catch (error) { return fail(res, error); }
    });
    router.post('/sources/:id/pause', writes(), async (req, res) => {
        try {
            if (!isListingId(req.params.id)) return res.status(404).json({ error: '來源不存在' });
            if (!req.body || Object.keys(req.body).length) throw new ExternalIntakeError('body');
            const sourceId = String(req.params.id);
            const changed = await prisma.$transaction(async tx => {
                const updated = await tx.externalListingSource.updateMany({ where: { id: sourceId }, data: { enabled: false } });
                if (updated.count) await tx.externalListingCandidate.updateMany({ where: { sourceId, status: { in: ['PENDING_REVIEW', 'APPROVED'] } },
                    data: { status: 'STALE', approvalRef: null, approvedAuthorizationRef: null,
                        approvedContentHash: null, approvedAt: null,
                        aiStatus: 'NOT_ELIGIBLE', aiJobId: null, aiInputHash: null,
                        aiDraft: Prisma.DbNull, aiUpdatedAt: new Date() } });
                return updated;
            });
            return changed.count ? res.status(204).send() : res.status(404).json({ error: '來源不存在' });
        } catch (error) { return fail(res, error); }
    });
    router.post('/sources/:id/candidates', writes(), async (req, res) => {
        try {
            if (!isListingId(req.params.id)) return res.status(404).json({ error: '已授權來源不存在或尚未啟用' });
            const source = await prisma.externalListingSource.findUnique({ where: { id: req.params.id } });
            if (!source || !source.enabled || !source.enabledAt) return res.status(404).json({ error: '已授權來源不存在或尚未啟用' });
            if (!req.body || Object.keys(req.body).join(',') !== 'items' || !Array.isArray(req.body.items) ||
                req.body.items.length < 1 || req.body.items.length > 50) throw new ExternalIntakeError('items');
            const now = new Date();
            const items: Array<ReturnType<typeof parseExternalCandidate>> = req.body.items.map(
                (raw: unknown) => parseExternalCandidate(raw, source, now));
            if (new Set(items.map((item: { sourceItemId: string }) => item.sourceItemId)).size !== items.length) throw new ExternalIntakeError('sourceItemId', '同一批次不得重複商品 ID');
            const saved = await prisma.$transaction(async tx => {
                const locked = await tx.$queryRaw<Array<{ enabled: boolean; enabledAt: Date | null; authorizationRef: string;
                    textReuseAllowed: boolean; imageReuseAllowed: boolean; aiProcessingAllowed: boolean }>>`
                    SELECT "enabled", "enabledAt", "authorizationRef", "textReuseAllowed", "imageReuseAllowed", "aiProcessingAllowed"
                    FROM "ExternalListingSource" WHERE "id" = ${source.id} FOR UPDATE`;
                if (locked[0]?.enabled !== true || !locked[0].enabledAt ||
                    locked[0].authorizationRef !== source.authorizationRef ||
                    locked[0].textReuseAllowed !== source.textReuseAllowed ||
                    locked[0].imageReuseAllowed !== source.imageReuseAllowed ||
                    locked[0].aiProcessingAllowed !== source.aiProcessingAllowed)
                    throw new ExternalIntakeError('source', '來源已暫停或授權範圍已變更');
                const records: Array<{ id: string; sourceItemId: string; status: ExternalCandidateStatus;
                    aiStatus: ExternalCandidateAiStatus; changed: boolean }> = [];
                for (const item of items) {
                    const old = await tx.externalListingCandidate.findUnique({ where: { sourceId_sourceItemId: { sourceId: source.id, sourceItemId: item.sourceItemId } } });
                    const eligible = source.aiProcessingAllowed && source.imageReuseAllowed && !!item.imageUrl && old?.status !== 'REJECTED';
                    const aiChanged = old?.contentHash !== item.contentHash;
                    const aiReset = { aiStatus: eligible ? 'PENDING' as const : 'NOT_ELIGIBLE' as const,
                        aiInputHash: eligible ? item.contentHash : null, aiDraft: Prisma.DbNull, aiJobId: null,
                        aiAttempts: 0, aiUpdatedAt: now };
                    const oldObservationRecent = !!old && old.observedAt.getTime() >= now.getTime() - EXTERNAL_OBSERVATION_MAX_AGE_MS;
                    const retainsApproval = old?.status === 'APPROVED' && !aiChanged &&
                        oldObservationRecent &&
                        old.approvedAuthorizationRef === source.authorizationRef &&
                        source.textReuseAllowed && source.imageReuseAllowed;
                    const record = old ? await tx.externalListingCandidate.update({ where: { id: old.id }, data: { ...item, lastSeenAt: now,
                        status: old.status === 'REJECTED' ? 'REJECTED' : retainsApproval ? 'APPROVED' : 'PENDING_REVIEW',
                        ...(!retainsApproval ? { approvalRef: null, approvedAuthorizationRef: null,
                            approvedContentHash: null, approvedAt: null } : {}),
                        ...(aiChanged || !['PENDING_REVIEW', 'APPROVED'].includes(old.status) ||
                            (old.status === 'APPROVED' && !retainsApproval) ? aiReset : {}) } }) :
                        await tx.externalListingCandidate.create({ data: { ...item, sourceId: source.id, lastSeenAt: now,
                            aiStatus: aiReset.aiStatus, aiInputHash: aiReset.aiInputHash, aiUpdatedAt: now } });
                    records.push({ id: record.id, sourceItemId: record.sourceItemId, status: record.status,
                        aiStatus: record.aiStatus, changed: aiChanged });
                }
                const observations = items.map((item, index) => ({
                    sourceItemIdSha256: createHash('sha256').update(item.sourceItemId).digest('hex'),
                    canonicalUrlSha256: createHash('sha256').update(item.canonicalUrl).digest('hex'),
                    contentHash: item.contentHash, observedAt: item.observedAt.toISOString(),
                    status: records[index].status, changed: records[index].changed }));
                const batch = await tx.externalIntakeBatch.create({ data: { sourceId: source.id,
                    authorizationRef: source.authorizationRef, sourceEnabledAt: locked[0].enabledAt,
                    receivedAt: now, itemCount: observations.length, observations } });
                return { records, batchId: batch.id };
            }, { timeout: 15000 });
            return res.status(202).json({ items: saved.records, intakeBatchId: saved.batchId, publicCount: 0 });
        } catch (error) { return fail(res, error); }
    });
    // A partner's sold/removed signal must hide a previously approved item
    // immediately; waiting for the 24-hour freshness window is unsafe.
    router.post('/sources/:id/withdraw', writes(), async (req, res) => {
        try {
            if (!isListingId(req.params.id)) return res.status(404).json({ error: '來源不存在' });
            const body = req.body;
            if (!body || typeof body !== 'object' || Array.isArray(body) ||
                Object.keys(body).sort().join(',') !== 'reason,sourceItemIds' ||
                !['SOLD', 'REMOVED'].includes(body.reason) || !Array.isArray(body.sourceItemIds) ||
                body.sourceItemIds.length < 1 || body.sourceItemIds.length > 50 ||
                body.sourceItemIds.some((id: unknown) => typeof id !== 'string' || id.length < 1 || id.length > 160 ||
                    id.trim() !== id || /[\u0000-\u001f\u007f]/.test(id)) ||
                new Set(body.sourceItemIds).size !== body.sourceItemIds.length)
                throw new ExternalIntakeError('sourceItemIds', '請提供 1–50 個不重複的來源商品 ID 與 SOLD/REMOVED 原因');
            const sourceId = String(req.params.id);
            const now = new Date();
            const saved = await prisma.$transaction(async tx => {
                // Intake takes this same lock, so a simultaneous refresh cannot
                // silently restore an approval after a withdrawal.
                const locked = await tx.$queryRaw<Array<{ id: string; authorizationRef: string; enabledAt: Date | null }>>`
                    SELECT "id", "authorizationRef", "enabledAt" FROM "ExternalListingSource"
                    WHERE "id" = ${sourceId} FOR UPDATE`;
                if (!locked[0]) return null;
                if (!locked[0].enabledAt) throw new ExternalIntakeError('source', '來源從未啟用');
                const rows = await tx.externalListingCandidate.findMany({ where: { sourceId,
                    sourceItemId: { in: body.sourceItemIds } } });
                if (rows.length !== body.sourceItemIds.length)
                    throw new ExternalIntakeError('sourceItemIds', '部分來源商品 ID 不存在；整批未撤下');
                const observations = [];
                for (const sourceItemId of body.sourceItemIds as string[]) {
                    const row = rows.find(item => item.sourceItemId === sourceItemId)!;
                    const changed = await tx.externalListingCandidate.updateMany({ where: { id: row.id,
                        status: { in: ['PENDING_REVIEW', 'APPROVED'] } }, data: {
                        status: 'STALE', approvalRef: null, approvedAuthorizationRef: null,
                        approvedContentHash: null, approvedAt: null,
                        aiStatus: 'NOT_ELIGIBLE', aiInputHash: null, aiJobId: null,
                        aiDraft: Prisma.DbNull, aiUpdatedAt: now } });
                    observations.push({ sourceItemIdSha256: createHash('sha256').update(sourceItemId).digest('hex'),
                        canonicalUrlSha256: createHash('sha256').update(row.canonicalUrl).digest('hex'),
                        contentHash: row.contentHash, observedAt: row.observedAt.toISOString(),
                        status: changed.count ? 'STALE' : row.status, changed: !!changed.count,
                        withdrawalReason: body.reason });
                }
                const batch = await tx.externalIntakeBatch.create({ data: { sourceId,
                    authorizationRef: locked[0].authorizationRef, sourceEnabledAt: locked[0].enabledAt,
                    receivedAt: now, itemCount: observations.length, observations } });
                return { withdrawn: observations.filter(item => item.changed).length, intakeBatchId: batch.id };
            }, { timeout: 15000 });
            return saved ? res.status(200).json({ ...saved, publicCount: 0 }) :
                res.status(404).json({ error: '來源不存在' });
        } catch (error) { return fail(res, error); }
    });
    router.post('/candidates/:id/reject', writes(), async (req, res) => {
        try {
            if (!isListingId(req.params.id)) return res.status(404).json({ error: '候選商品不存在' });
            const candidateId = String(req.params.id);
            const body = req.body;
            if (!body || typeof body !== 'object' || Array.isArray(body) ||
                Object.keys(body).sort().join(',') !== 'expectedContentHash,reason,reviewRef' ||
                typeof body.expectedContentHash !== 'string' || !/^[0-9a-f]{64}$/.test(body.expectedContentHash) ||
                typeof body.reviewRef !== 'string' || !/^review:[A-Za-z0-9._/-]{4,160}$/.test(body.reviewRef) ||
                !['SOURCE_UNVERIFIED', 'ITEM_UNVERIFIED', 'PROHIBITED', 'DUPLICATE', 'MISLEADING'].includes(body.reason))
                throw new ExternalIntakeError('review', '請提供目前內容指紋、審核紀錄 ID 與固定拒絕原因；勿填個資或憑證');
            const now = new Date();
            const changed = await prisma.$transaction(async tx => {
                const result = await tx.externalListingCandidate.updateMany({ where: { id: candidateId,
                    contentHash: body.expectedContentHash, status: { in: ['PENDING_REVIEW', 'APPROVED'] },
                    expiresAt: { gt: now }, source: { enabled: true } },
                    data: { status: 'REJECTED', rejectionRef: body.reviewRef, rejectionReason: body.reason,
                        rejectedContentHash: body.expectedContentHash, rejectedAt: now,
                        approvalRef: null, approvedAuthorizationRef: null, approvedContentHash: null, approvedAt: null,
                        aiStatus: 'NOT_ELIGIBLE', aiInputHash: null, aiJobId: null, aiDraft: Prisma.DbNull, aiUpdatedAt: now } });
                if (result.count) await tx.externalCandidateReviewEvent.create({ data: { candidateId,
                    decision: 'REJECTED', contentHash: body.expectedContentHash, reviewRef: body.reviewRef,
                    reason: body.reason } });
                return result;
            });
            return changed.count ? res.status(200).json({ id: req.params.id, status: 'REJECTED',
                rejectedContentHash: body.expectedContentHash, rejectedAt: now }) :
                res.status(409).json({ error: '候選內容、來源授權或審核狀態已變更；請重新確認', errorCode: 'EXTERNAL_REVIEW_CONFLICT' });
        } catch (error) { return fail(res, error); }
    });
    router.post('/candidates/:id/approve', writes(), async (req, res) => {
        try {
            if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED !== '1') return res.status(503).json({ error: '外部商品公開尚未啟用', errorCode: 'EXTERNAL_PUBLICATION_DISABLED' });
            if (!isListingId(req.params.id)) return res.status(404).json({ error: '候選商品不存在' });
            const body = req.body;
            if (!body || typeof body !== 'object' || Array.isArray(body) ||
                Object.keys(body).sort().join(',') !== 'authorizationRef,confirmItem,confirmRights,expectedContentHash,reviewRef' ||
                typeof body.expectedContentHash !== 'string' || !/^[0-9a-f]{64}$/.test(body.expectedContentHash) ||
                typeof body.reviewRef !== 'string' || !/^review:[A-Za-z0-9._/-]{4,160}$/.test(body.reviewRef) ||
                typeof body.authorizationRef !== 'string' || body.confirmRights !== true || body.confirmItem !== true)
                throw new ExternalIntakeError('review', '須明確核對來源授權、商品真實性與目前內容指紋');
            const row = await prisma.externalListingCandidate.findUnique({ where: { id: req.params.id }, include: { source: true } });
            if (!row) return res.status(404).json({ error: '候選商品不存在' });
            const now = new Date();
            if (row.status !== 'PENDING_REVIEW' || row.contentHash !== body.expectedContentHash ||
                row.source.authorizationRef !== body.authorizationRef || !districtCenter(row.county, row.district) ||
                !eligibleExternalCandidate(row, row.source, now))
                return res.status(409).json({ error: '來源權利、商品內容或時效不符合公開條件', errorCode: 'EXTERNAL_REVIEW_CONFLICT' });
            const changed = await prisma.$transaction(async tx => {
                const result = await tx.externalListingCandidate.updateMany({ where: { id: row.id, status: 'PENDING_REVIEW',
                    contentHash: row.contentHash, aiStatus: row.aiStatus, observedAt: { gte: new Date(now.getTime() - EXTERNAL_OBSERVATION_MAX_AGE_MS) },
                    expiresAt: { gt: now }, imageUrl: row.imageUrl, thumbnailUrl: row.thumbnailUrl,
                    description: row.description, condition: 'USED',
                    source: { enabled: true, enabledAt: { not: null }, textReuseAllowed: true, imageReuseAllowed: true,
                        authorizationRef: row.source.authorizationRef } },
                    data: { status: 'APPROVED', approvalRef: body.reviewRef,
                        approvedAuthorizationRef: row.source.authorizationRef,
                        approvedContentHash: row.contentHash, approvedAt: now,
                        ...(row.aiStatus === 'COMPLETED' ? {} : { aiStatus: 'NOT_ELIGIBLE' as const, aiInputHash: null,
                            aiJobId: null, aiDraft: Prisma.DbNull, aiUpdatedAt: now }) } });
                if (result.count) await tx.externalCandidateReviewEvent.create({ data: { candidateId: row.id,
                    decision: 'APPROVED', contentHash: row.contentHash, reviewRef: body.reviewRef,
                    authorizationRef: row.source.authorizationRef } });
                return result;
            });
            return changed.count ? res.json({ id: row.id, status: 'APPROVED', approvedContentHash: row.contentHash, approvedAt: now }) :
                res.status(409).json({ error: '候選商品在審核期間變更，請重新確認', errorCode: 'EXTERNAL_REVIEW_CONFLICT' });
        } catch (error) { return fail(res, error); }
    });
    router.get('/candidates', async (req, res) => {
        try {
            const status = req.query.status === undefined ? 'PENDING_REVIEW' : req.query.status;
            if (!['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'STALE'].includes(String(status))) throw new ExternalIntakeError('status');
            const rows = await prisma.externalListingCandidate.findMany({ where: { status: status as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'STALE' },
                orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }], take: 100,
                include: { source: { select: { name: true, kind: true, authorizationRef: true, textReuseAllowed: true, imageReuseAllowed: true } } } });
            return res.json({ items: rows });
        } catch (error) { return fail(res, error); }
    });
    router.get('/candidates/:id/reviews', async (req, res) => {
        try {
            if (!isListingId(req.params.id)) return res.status(404).json({ error: '候選商品不存在' });
            const exists = await prisma.externalListingCandidate.findUnique({ where: { id: req.params.id }, select: { id: true } });
            if (!exists) return res.status(404).json({ error: '候選商品不存在' });
            const items = await prisma.externalCandidateReviewEvent.findMany({ where: { candidateId: exists.id },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
            return res.json({ items });
        } catch (error) { return fail(res, error); }
    });
    return router;
}
