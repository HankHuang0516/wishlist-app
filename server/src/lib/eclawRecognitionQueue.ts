import prisma from './prisma';
import { checkAndIncrementAiUsage } from './usageService';
import { loadEclawRecognitionConfig, recognizeWithEclaw } from './eclawRecognition';

const INTERVAL_MS = 3000;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
let wakeCurrentWorker: (() => void) | null = null;

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
                select: { id: true, name: true, imageUrl: true, link: true, wishlist: { select: { userId: true } } },
            });
            if (!item) return;
            const claimed = await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PENDING' }, data: { aiStatus: 'PROCESSING', aiError: null } });
            if (claimed.count !== 1) return;
            try {
                const canUse = await checkAndIncrementAiUsage(item.wishlist.userId);
                if (!canUse) {
                    await prisma.item.updateMany({ where: { id: item.id, aiStatus: 'PROCESSING' }, data: { aiStatus: 'SKIPPED', aiError: 'Daily AI limit exceeded' } });
                    return;
                }
                const result = await recognize({
                    jobId: `wish-${item.id}`,
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
                        notes: result.description,
                        aiStatus: 'COMPLETED',
                        aiError: null,
                    },
                });
            } catch (error: any) {
                report(`[EClawRecognition] item ${item.id} failed (${error?.code || 'UNKNOWN'})`);
                await prisma.item.updateMany({
                    where: { id: item.id, aiStatus: 'PROCESSING' },
                    data: { aiStatus: 'FAILED', aiError: String(error?.code || 'ECLAW_RECOGNITION_FAILED').slice(0, 120) },
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
