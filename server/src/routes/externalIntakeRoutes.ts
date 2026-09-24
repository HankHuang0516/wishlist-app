import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { marketplaceAdmin } from '../middleware/marketplaceAdmin';
import { ExternalIntakeError, parseExternalCandidate, parseExternalSource } from '../lib/externalListingIntake';
import { isListingId } from '../lib/listingRules';

const writes = () => rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: '外部來源操作過於頻繁', errorCode: 'EXTERNAL_INTAKE_RATE_LIMIT' } });
const fail = (res: import('express').Response, error: unknown) => {
    if (error instanceof ExternalIntakeError) return res.status(400).json({ error: error.message, field: error.field, errorCode: 'EXTERNAL_INTAKE_INPUT' });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: '來源資料已存在', errorCode: 'EXTERNAL_INTAKE_CONFLICT' });
    return res.status(503).json({ error: '外部來源暫時無法處理', errorCode: 'EXTERNAL_INTAKE_UNAVAILABLE' });
};

// Admin-only staging. No route here inserts into Listing or feeds the public
// search/map, and activation is a separate explicit authorization assertion.
export function createExternalIntakeRoutes(getCredential: () => unknown = () => process.env.ADMIN_API_KEY) {
    const router = Router();
    router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
    router.use(marketplaceAdmin(getCredential));

    router.get('/sources', async (_req, res) => {
        try { return res.json({ items: await prisma.externalListingSource.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) }); }
        catch (error) { return fail(res, error); }
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
                if (updated.count) await tx.externalListingCandidate.updateMany({ where: { sourceId, status: 'PENDING_REVIEW' },
                    data: { status: 'STALE', aiStatus: 'NOT_ELIGIBLE', aiJobId: null, aiInputHash: null,
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
            if (!source || !source.enabled) return res.status(404).json({ error: '已授權來源不存在或尚未啟用' });
            if (!req.body || Object.keys(req.body).join(',') !== 'items' || !Array.isArray(req.body.items) ||
                req.body.items.length < 1 || req.body.items.length > 50) throw new ExternalIntakeError('items');
            const now = new Date();
            const items = req.body.items.map((raw: unknown) => parseExternalCandidate(raw, source, now));
            if (new Set(items.map((item: { sourceItemId: string }) => item.sourceItemId)).size !== items.length) throw new ExternalIntakeError('sourceItemId', '同一批次不得重複商品 ID');
            const saved = await prisma.$transaction(async tx => {
                const locked = await tx.$queryRaw<Array<{ enabled: boolean }>>`SELECT "enabled" FROM "ExternalListingSource" WHERE "id" = ${source.id} FOR UPDATE`;
                if (locked[0]?.enabled !== true) throw new ExternalIntakeError('source', '來源已暫停');
                const records = [];
                for (const item of items) {
                    const old = await tx.externalListingCandidate.findUnique({ where: { sourceId_sourceItemId: { sourceId: source.id, sourceItemId: item.sourceItemId } } });
                    const eligible = source.aiProcessingAllowed && source.imageReuseAllowed && !!item.imageUrl && old?.status !== 'REJECTED';
                    const aiChanged = old?.contentHash !== item.contentHash;
                    const aiReset = { aiStatus: eligible ? 'PENDING' as const : 'NOT_ELIGIBLE' as const,
                        aiInputHash: eligible ? item.contentHash : null, aiDraft: Prisma.DbNull, aiJobId: null,
                        aiAttempts: 0, aiUpdatedAt: now };
                    const record = old ? await tx.externalListingCandidate.update({ where: { id: old.id }, data: { ...item, lastSeenAt: now,
                        status: old.status === 'REJECTED' ? 'REJECTED' : 'PENDING_REVIEW',
                        ...(aiChanged || old.status !== 'PENDING_REVIEW' ? aiReset : {}) } }) :
                        await tx.externalListingCandidate.create({ data: { ...item, sourceId: source.id, lastSeenAt: now,
                            aiStatus: aiReset.aiStatus, aiInputHash: aiReset.aiInputHash, aiUpdatedAt: now } });
                    records.push({ id: record.id, sourceItemId: record.sourceItemId, status: record.status,
                        aiStatus: record.aiStatus, changed: aiChanged });
                }
                return records;
            }, { timeout: 15000 });
            return res.status(202).json({ items: saved, publicCount: 0 });
        } catch (error) { return fail(res, error); }
    });
    router.get('/candidates', async (req, res) => {
        try {
            const status = req.query.status === undefined ? 'PENDING_REVIEW' : req.query.status;
            if (!['PENDING_REVIEW', 'REJECTED', 'STALE'].includes(String(status))) throw new ExternalIntakeError('status');
            const rows = await prisma.externalListingCandidate.findMany({ where: { status: status as 'PENDING_REVIEW' | 'REJECTED' | 'STALE' },
                orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }], take: 100,
                include: { source: { select: { name: true, kind: true, authorizationRef: true, textReuseAllowed: true, imageReuseAllowed: true } } } });
            return res.json({ items: rows });
        } catch (error) { return fail(res, error); }
    });
    return router;
}
