import prisma from './prisma';

// Only private candidates are affected. A paused source or expired item must
// be re-imported from a fresh authorized observation before further review.
export async function expireExternalCandidates(now = new Date()) {
    const result = await prisma.externalListingCandidate.updateMany({ where: {
        status: 'PENDING_REVIEW', OR: [{ expiresAt: { lte: now } }, { source: { enabled: false } }],
    }, data: { status: 'STALE' } });
    return result.count;
}

export function startExternalCandidateExpiryWorker(run: () => Promise<unknown> = () => expireExternalCandidates()) {
    let running = false, stopped = false;
    async function cycle() {
        if (running || stopped) return;
        running = true;
        try { await run(); } catch { console.error('Private external candidate expiry temporarily unavailable; details withheld'); }
        finally { running = false; }
    }
    const timer = setInterval(() => void cycle(), 15 * 60_000);
    timer.unref(); void cycle();
    return () => { stopped = true; clearInterval(timer); };
}
