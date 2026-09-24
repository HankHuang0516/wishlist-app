import { Router } from 'express';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getApiUrl } from '../config/constants';
import { isMinimaxWorker, listingAiEnabledFor, listingAiPilotUserId, minimaxPilotUserId, minimaxWorkerToken } from '../lib/minimaxWorkerAuth';
import { validListingAiDraft } from '../lib/listingAiDraft';
import { forbiddenListingField } from '../lib/listingPolicy';

const router = Router();
const LEASE_MS = 10 * 60 * 1000;

function config() {
    const id = minimaxPilotUserId(), token = minimaxWorkerToken();
    if (!id || !token) return null;
    return { userId: id, prefix: `${getApiUrl().replace(/\/$/, '')}/listing-media/` };
}

function clean(value: unknown, max: number) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function validMinimaxResult(raw: any) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const name = clean(raw.name, 160), category = clean(raw.category, 80);
    const confidence = Number(raw.confidence);
    const evidence = Array.isArray(raw.evidence) ? raw.evidence.map((x: unknown) => clean(x, 160)).filter(Boolean).slice(0, 5) : [];
    const visibleText = Array.isArray(raw.visibleText) ? raw.visibleText.map((x: unknown) => clean(x, 100)).filter(Boolean).slice(0, 12) : [];
    const uncertainties = Array.isArray(raw.uncertainties) ? raw.uncertainties.map((x: unknown) => clean(x, 160)).filter(Boolean).slice(0, 4) : [];
    if (!name || !Number.isFinite(confidence) || confidence < 0.65 || confidence > 1 || evidence.length < 2) return null;
    const stated = raw.listedPriceTwd === null || raw.listedPriceTwd === undefined ? null : Number(raw.listedPriceTwd);
    const amounts = visibleText.flatMap((line: string) => [...line.matchAll(/(\d{1,7})\s*元/g)].map(match => Number(match[1])));
    const price = stated !== null && Number.isSafeInteger(stated) && stated >= 0 && stated <= 1_000_000 && amounts.includes(stated) ? stated : null;
    const notes = [`品類：${category || '待確認'}`, `可見依據：${evidence.join('；')}`,
        visibleText.length ? `圖片文字：${visibleText.join('、')}` : '', `辨識可信度：${Math.round(confidence * 100)}%`,
        uncertainties.length ? `待確認：${uncertainties.join('、')}` : ''].filter(Boolean).join('\n').slice(0, 1000);
    return { name, price: price === null ? null : String(price), currency: price === null ? null : 'TWD', notes };
}

router.use((req, res, next) => {
    const settings = config();
    if (!settings || !isMinimaxWorker(req.headers.authorization)) return res.status(404).json({ error: 'NOT_FOUND' });
    res.setHeader('Cache-Control', 'no-store');
    res.locals.minimax = settings;
    next();
});

router.get('/next', async (_req, res) => {
    const { userId, prefix } = res.locals.minimax as NonNullable<ReturnType<typeof config>>;
    try {
        await prisma.item.updateMany({ where: { wishlist: { userId }, aiStatus: 'PROCESSING', aiError: { startsWith: 'MINIMAX_JOB_' },
            updatedAt: { lt: new Date(Date.now() - LEASE_MS) } }, data: { aiStatus: 'PENDING', aiError: 'MINIMAX_RETRY' } });
        for (let attempt = 0; attempt < 3; attempt++) {
            const item = await prisma.item.findFirst({ where: { wishlist: { userId }, aiStatus: 'PENDING', uploadStatus: 'COMPLETED',
                imageUrl: { startsWith: prefix } }, orderBy: { createdAt: 'asc' }, select: { id: true, imageUrl: true,
                    wishMedia: { select: { imageUrl: true } } } });
            if (!item?.imageUrl) break;
            const suffix = item.imageUrl.slice(prefix.length);
            if (!/^[0-9a-f-]{36}\/image$/.test(suffix) || item.wishMedia?.imageUrl !== item.imageUrl) {
                await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PENDING' },
                    data: { aiStatus: 'FAILED', aiError: 'MINIMAX_INVALID_IMAGE_LINK' } });
                continue;
            }
            const jobId = randomUUID();
            const claimed = await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PENDING' },
                data: { aiStatus: 'PROCESSING', aiError: `MINIMAX_JOB_${jobId}` } });
            if (claimed.count) return res.json({ kind: 'WISH', jobId, imageUrl: item.imageUrl });
        }
        const listingPilot = listingAiPilotUserId();
        if (process.env.MINIMAX_LISTING_AI_ENABLED === '1' && listingPilot !== -1) {
        await prisma.listingMedia.updateMany({ where: { aiDraftStatus: 'PROCESSING', aiDraftUpdatedAt: { lt: new Date(Date.now() - LEASE_MS) },
            ...(listingPilot ? { ownerUserId: listingPilot } : {}) },
            data: { aiDraftStatus: 'PENDING', aiDraftJobId: null, aiDraftError: 'MINIMAX_RETRY', aiDraftUpdatedAt: new Date() } });
        for (let attempt = 0; attempt < 3; attempt++) {
            const media = await prisma.listingMedia.findFirst({ where: { aiDraftStatus: 'PENDING', listingId: null, wishItemId: null,
                ...(listingPilot ? { ownerUserId: listingPilot } : {}) },
                orderBy: { createdAt: 'asc' }, select: { id: true, ownerUserId: true, imageUrl: true } });
            if (!media) break;
            if (!listingAiEnabledFor(media.ownerUserId) || media.imageUrl !== `${prefix}${media.id}/image`) {
                await prisma.listingMedia.updateMany({ where: { id: media.id, aiDraftStatus: 'PENDING' },
                    data: { aiDraftStatus: 'FAILED', aiDraftError: 'MINIMAX_INVALID_IMAGE_LINK', aiDraftUpdatedAt: new Date() } });
                continue;
            }
            const jobId = randomUUID();
            const claimed = await prisma.listingMedia.updateMany({ where: { id: media.id, aiDraftStatus: 'PENDING', listingId: null, wishItemId: null },
                data: { aiDraftStatus: 'PROCESSING', aiDraftJobId: jobId, aiDraftError: null, aiDraftUpdatedAt: new Date() } });
            if (claimed.count) return res.json({ kind: 'LISTING_DRAFT', jobId, imageUrl: media.imageUrl });
        }
        }
        if (process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED !== '1') return res.status(204).send();
        const now = new Date();
        const observationCutoff = new Date(now.getTime() - 48 * 3_600_000);
        await prisma.externalListingCandidate.updateMany({ where: { aiStatus: 'PROCESSING', aiUpdatedAt: { lt: new Date(now.getTime() - LEASE_MS) },
            aiAttempts: { lt: 3 }, status: 'PENDING_REVIEW', expiresAt: { gt: now }, observedAt: { gte: observationCutoff },
            source: { enabled: true, aiProcessingAllowed: true, imageReuseAllowed: true } },
            data: { aiStatus: 'PENDING', aiJobId: null, aiUpdatedAt: now } });
        await prisma.externalListingCandidate.updateMany({ where: { aiStatus: 'PROCESSING', aiUpdatedAt: { lt: new Date(now.getTime() - LEASE_MS) },
            aiAttempts: { gte: 3 } }, data: { aiStatus: 'FAILED', aiJobId: null, aiUpdatedAt: now } });
        await prisma.externalListingCandidate.updateMany({ where: { aiStatus: 'FAILED', aiAttempts: { lt: 3 },
            aiUpdatedAt: { lt: new Date(now.getTime() - 30 * 60_000) }, status: 'PENDING_REVIEW',
            expiresAt: { gt: now }, observedAt: { gte: observationCutoff },
            source: { enabled: true, aiProcessingAllowed: true, imageReuseAllowed: true } },
            data: { aiStatus: 'PENDING', aiJobId: null, aiUpdatedAt: now } });
        for (let attempt = 0; attempt < 3; attempt++) {
            const candidate = await prisma.externalListingCandidate.findFirst({ where: { aiStatus: 'PENDING', aiAttempts: { lt: 3 },
                status: 'PENDING_REVIEW', expiresAt: { gt: now }, observedAt: { gte: observationCutoff }, imageUrl: { not: null },
                source: { enabled: true, aiProcessingAllowed: true, imageReuseAllowed: true } },
                orderBy: { createdAt: 'asc' }, include: { source: { select: { imageHost: true } } } });
            if (!candidate?.imageUrl) break;
            let validImage = false;
            try {
                const url = new URL(candidate.imageUrl);
                validImage = url.protocol === 'https:' && !!candidate.source.imageHost && url.hostname === candidate.source.imageHost &&
                    !url.port && !url.username && !url.password && candidate.aiInputHash === candidate.contentHash;
            } catch { /* invalid imported image */ }
            if (!validImage) {
                await prisma.externalListingCandidate.updateMany({ where: { id: candidate.id, aiStatus: 'PENDING', contentHash: candidate.contentHash },
                    data: { aiStatus: 'NOT_ELIGIBLE', aiJobId: null, aiUpdatedAt: now } });
                continue;
            }
            const jobId = randomUUID();
            const claimed = await prisma.externalListingCandidate.updateMany({ where: { id: candidate.id, aiStatus: 'PENDING',
                contentHash: candidate.contentHash, aiInputHash: candidate.contentHash, imageUrl: candidate.imageUrl,
                status: 'PENDING_REVIEW', expiresAt: { gt: now }, observedAt: { gte: observationCutoff },
                source: { enabled: true, aiProcessingAllowed: true, imageReuseAllowed: true } },
                data: { aiStatus: 'PROCESSING', aiJobId: jobId, aiAttempts: { increment: 1 }, aiUpdatedAt: now } });
            if (claimed.count) return res.json({ kind: 'EXTERNAL_CANDIDATE', jobId, imageUrl: candidate.imageUrl,
                imageHost: candidate.source.imageHost });
        }
        return res.status(204).send();
    } catch { return res.status(503).json({ error: 'QUEUE_UNAVAILABLE' }); }
});

router.post('/:jobId/result', async (req, res) => {
    const { userId } = res.locals.minimax as NonNullable<ReturnType<typeof config>>;
    const jobId = req.params.jobId;
    if (!/^[0-9a-f-]{36}$/.test(jobId)) return res.status(400).json({ error: 'INVALID_JOB' });
    const failed = req.body?.status === 'FAILED';
    try {
        const item = await prisma.item.findFirst({ where: { wishlist: { userId }, aiStatus: 'PROCESSING', aiError: `MINIMAX_JOB_${jobId}` }, select: { id: true } });
        if (item) {
            const result = failed ? null : validMinimaxResult(req.body?.result);
            if (!failed && !result) return res.status(400).json({ error: 'INVALID_RESULT' });
            const changed = await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PROCESSING', aiError: `MINIMAX_JOB_${jobId}` },
                data: failed ? { aiStatus: 'FAILED', aiError: 'MINIMAX_VISION_FAILED' } :
                    { name: result!.name, price: result!.price, currency: result!.currency, notes: result!.notes, aiStatus: 'COMPLETED', aiError: null } });
            return changed.count ? res.status(204).send() : res.status(409).json({ error: 'LEASE_EXPIRED' });
        }
        const media = await prisma.listingMedia.findFirst({ where: { aiDraftStatus: 'PROCESSING', aiDraftJobId: jobId }, select: { id: true, ownerUserId: true } });
        if (media) {
            if (!listingAiEnabledFor(media.ownerUserId)) return res.status(409).json({ error: 'LEASE_EXPIRED' });
            const draft = failed ? null : validListingAiDraft(req.body?.result);
            if (!failed && !draft) return res.status(400).json({ error: 'INVALID_RESULT' });
            const changed = await prisma.listingMedia.updateMany({ where: { id: media.id, aiDraftStatus: 'PROCESSING', aiDraftJobId: jobId,
                listingId: null, wishItemId: null }, data: failed ? { aiDraftStatus: 'FAILED', aiDraftError: 'MINIMAX_VISION_FAILED', aiDraftJobId: null,
                aiDraftUpdatedAt: new Date() } : { aiDraftStatus: 'COMPLETED', aiDraft: draft as unknown as Prisma.InputJsonObject,
                aiDraftError: null, aiDraftJobId: null, aiDraftUpdatedAt: new Date() } });
            return changed.count ? res.status(204).send() : res.status(409).json({ error: 'LEASE_EXPIRED' });
        }
        if (process.env.MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED !== '1') return res.status(409).json({ error: 'LEASE_EXPIRED' });
        const candidate = await prisma.externalListingCandidate.findFirst({ where: { aiStatus: 'PROCESSING', aiJobId: jobId },
            select: { id: true, contentHash: true, imageUrl: true, observedAt: true } });
        if (!candidate) return res.status(409).json({ error: 'LEASE_EXPIRED' });
        const now = new Date();
        const observationCutoff = new Date(now.getTime() - 48 * 3_600_000);
        if (candidate.observedAt < observationCutoff) return res.status(409).json({ error: 'LEASE_EXPIRED' });
        const draft = failed ? null : validListingAiDraft(req.body?.result);
        if (!failed && (!draft || forbiddenListingField({ title: draft.title, description: draft.description })))
            return res.status(400).json({ error: 'INVALID_RESULT' });
        // External source's stated price, condition and location remain authoritative.
        // The model's private suggestion cannot create or modify a public listing.
        const privateDraft = draft && { title: draft.title, description: draft.description, category: draft.category,
            brand: draft.brand, evidence: draft.evidence, uncertainties: draft.uncertainties,
            confidence: draft.confidence, source: draft.source };
        const changed = await prisma.externalListingCandidate.updateMany({ where: { id: candidate.id, aiStatus: 'PROCESSING',
            aiJobId: jobId, aiInputHash: candidate.contentHash, contentHash: candidate.contentHash,
            imageUrl: candidate.imageUrl, status: 'PENDING_REVIEW', expiresAt: { gt: now }, observedAt: { gte: observationCutoff },
            source: { enabled: true, aiProcessingAllowed: true, imageReuseAllowed: true } },
            data: failed ? { aiStatus: 'FAILED', aiJobId: null, aiUpdatedAt: now } :
                { aiStatus: 'COMPLETED', aiDraft: privateDraft as Prisma.InputJsonObject, aiJobId: null, aiUpdatedAt: now } });
        return changed.count ? res.status(204).send() : res.status(409).json({ error: 'LEASE_EXPIRED' });
    } catch { return res.status(503).json({ error: 'QUEUE_UNAVAILABLE' }); }
});

export default router;
