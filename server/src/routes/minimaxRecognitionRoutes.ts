import { Router } from 'express';
import { randomUUID, timingSafeEqual } from 'crypto';
import prisma from '../lib/prisma';
import { getApiUrl } from '../config/constants';

const router = Router();
const LEASE_MS = 10 * 60 * 1000;

function config() {
    const id = Number(process.env.MINIMAX_PILOT_USER_ID);
    const token = process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
    if (!Number.isSafeInteger(id) || id < 1 || !token || token.length < 32) return null;
    return { userId: id, token, prefix: `${getApiUrl().replace(/\/$/, '')}/listing-media/` };
}

function authorized(header: string | undefined, token: string) {
    if (!header?.startsWith('Bearer ')) return false;
    const actual = Buffer.from(header.slice(7)), expected = Buffer.from(token);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
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
    if (!settings || !authorized(req.headers.authorization, settings.token)) return res.status(404).json({ error: 'NOT_FOUND' });
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
            if (!item?.imageUrl) return res.status(204).send();
            const suffix = item.imageUrl.slice(prefix.length);
            if (!/^[0-9a-f-]{36}\/image$/.test(suffix) || item.wishMedia?.imageUrl !== item.imageUrl) {
                await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PENDING' },
                    data: { aiStatus: 'FAILED', aiError: 'MINIMAX_INVALID_IMAGE_LINK' } });
                continue;
            }
            const jobId = randomUUID();
            const claimed = await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PENDING' },
                data: { aiStatus: 'PROCESSING', aiError: `MINIMAX_JOB_${jobId}` } });
            if (claimed.count) return res.json({ jobId, imageUrl: item.imageUrl });
        }
        return res.status(204).send();
    } catch { return res.status(503).json({ error: 'QUEUE_UNAVAILABLE' }); }
});

router.post('/:jobId/result', async (req, res) => {
    const { userId } = res.locals.minimax as NonNullable<ReturnType<typeof config>>;
    const jobId = req.params.jobId;
    if (!/^[0-9a-f-]{36}$/.test(jobId)) return res.status(400).json({ error: 'INVALID_JOB' });
    const failed = req.body?.status === 'FAILED';
    const result = failed ? null : validMinimaxResult(req.body?.result);
    if (!failed && !result) return res.status(400).json({ error: 'INVALID_RESULT' });
    try {
        const item = await prisma.item.findFirst({ where: { wishlist: { userId }, aiStatus: 'PROCESSING', aiError: `MINIMAX_JOB_${jobId}` }, select: { id: true } });
        if (!item) return res.status(409).json({ error: 'LEASE_EXPIRED' });
        const changed = await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PROCESSING', aiError: `MINIMAX_JOB_${jobId}` },
            data: failed ? { aiStatus: 'FAILED', aiError: 'MINIMAX_VISION_FAILED' } :
                { name: result!.name, price: result!.price, currency: result!.currency, notes: result!.notes, aiStatus: 'COMPLETED', aiError: null } });
        return changed.count ? res.status(204).send() : res.status(409).json({ error: 'LEASE_EXPIRED' });
    } catch { return res.status(503).json({ error: 'QUEUE_UNAVAILABLE' }); }
});

export default router;
