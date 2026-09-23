import prisma from './prisma';
import { checkAndIncrementAiUsage } from './usageService';
import { loadEclawRecognitionConfig, recognizeWithEclaw } from './eclawRecognition';
import type { EclawRecognitionResult } from './eclawRecognition';

const INTERVAL_MS = 3000;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const TRANSIENT_CODES = new Set(['NO_REPLY', 'NETWORK', 'UPSTREAM', 'TIMEOUT', 'INCOMPLETE_ESTIMATE', 'VISION_TIMEOUT', 'VISION_NETWORK', 'VISION_UPSTREAM', 'VISION_IMAGE_FETCH']);
let wakeCurrentWorker: (() => void) | null = null;

function retryAttempt(aiError: string | null) {
    const match = aiError?.match(/^ECLAW_RETRY_(\d+)$/);
    return match ? Number(match[1]) : 0;
}

export function formatEclawRecognitionNotes(result: EclawRecognitionResult) {
    const lines = [result.description];
    const identity = [result.brand && `品牌：${result.brand}`, result.model && `型號：${result.model}`, result.category && `品類：${result.category}`, result.condition && `狀況：${result.condition}`].filter(Boolean).join('｜');
    if (identity) lines.push(identity);
    if (result.priceLow !== null && result.priceHigh !== null) lines.push(`參考價格區間：${result.currency ?? ''} ${result.priceLow}–${result.priceHigh}${result.priceBasis ? `（${result.priceBasis}）` : ''}`.trim());
    else if (result.priceBasis) lines.push(`價格依據：${result.priceBasis}`);
    if (result.keyFeatures.length) lines.push(`特徵：${result.keyFeatures.join('、')}`);
    if (result.tags.length) lines.push(`標籤：${result.tags.join('、')}`);
    if (result.confidence !== null) lines.push(`辨識可信度：${Math.round(result.confidence * 100)}%`);
    if (result.uncertainties.length) lines.push(`待確認：${result.uncertainties.join('、')}`);
    const summary = lines.filter(Boolean).join('\n');
    return summary ? summary.slice(0, 1000) : null;
}

export function wakeEclawRecognitionWorker() { wakeCurrentWorker?.(); }

export function startEclawRecognitionWorker(
    recognize = recognizeWithEclaw,
    report = (message: string) => console.error(message),
) {
    const loadedConfig = loadEclawRecognitionConfig();
    if (!loadedConfig) {
        report('[EClawRecognition] worker disabled: dedicated device credentials are not configured');
        return () => undefined;
    }
    const config = loadedConfig;
    let running = false, stopped = false;
    async function cycle() {
        if (stopped || running) return;
        running = true;
        try {
            await prisma.item.updateMany({
                where: { aiStatus: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
                data: { aiStatus: 'PENDING', aiError: 'ECLAW_RETRY_AFTER_INTERRUPTION' },
            });
            const item = await prisma.item.findFirst({
                where: {
                    aiStatus: 'PENDING', uploadStatus: 'COMPLETED',
                    OR: [{ imageUrl: { not: null } }, { link: { not: null } }],
                },
                orderBy: { createdAt: 'asc' },
                select: { id: true, name: true, imageUrl: true, link: true, aiError: true, wishlist: { select: { userId: true } } },
            });
            if (!item) return;
            const attempt = retryAttempt(item.aiError);
            const claimed = await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PENDING' }, data: { aiStatus: 'PROCESSING', aiError: null } });
            if (claimed.count !== 1) return;
            try {
                const canUse = attempt > 0 || await checkAndIncrementAiUsage(item.wishlist.userId);
                if (!canUse) {
                    await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PROCESSING' }, data: { aiStatus: 'SKIPPED', aiError: 'Daily AI limit exceeded' } });
                    return;
                }
                const result = await recognize({
                    jobId: attempt > 0 ? `wish-${item.id}-retry-${attempt}` : `wish-${item.id}`,
                    resourceUrl: item.imageUrl || item.link!,
                    currentName: item.name,
                }, config);
                await prisma.item.updateMany({
                    where: { id: item.id, aiStatus: 'PROCESSING' },
                    data: {
                        name: result.name,
                        price: result.price === null ? null : String(result.price),
                        currency: result.currency,
                        aiLink: result.shoppingLink,
                        notes: formatEclawRecognitionNotes(result),
                        aiStatus: 'COMPLETED',
                        aiError: null,
                    },
                });
            } catch (error: any) {
                const code = String(error?.code || 'UNKNOWN');
                if (attempt < 1 && TRANSIENT_CODES.has(code)) {
                    report(`[EClawRecognition] item ${item.id} retry queued (${code})`);
                    await prisma.item.updateMany({
                        where: { id: item.id, aiStatus: 'PROCESSING' },
                        data: { aiStatus: 'PENDING', aiError: 'ECLAW_RETRY_1' },
                    });
                    return;
                }
                report(`[EClawRecognition] item ${item.id} failed (${code})`);
                await prisma.item.updateMany({
                    where: { id: item.id, aiStatus: 'PROCESSING' },
                    data: { aiStatus: 'FAILED', aiError: code.slice(0, 120) },
                });
            }
        } catch {
            report('[EClawRecognition] queue cycle unavailable');
        } finally { running = false; }
    }
    const timer = setInterval(() => void cycle(), INTERVAL_MS);
    timer.unref();
    wakeCurrentWorker = () => void cycle();
    void cycle();
    return () => {
        stopped = true;
        clearInterval(timer);
        if (wakeCurrentWorker) wakeCurrentWorker = null;
    };
}
