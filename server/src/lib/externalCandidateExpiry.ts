import prisma from './prisma';
import { Prisma } from '@prisma/client';

// Only private candidates are affected. A paused source or expired item must
// be re-imported from a fresh authorized observation before further review.
export async function expireExternalCandidates(now = new Date()) {
    const result = await prisma.externalListingCandidate.updateMany({ where: {
        status: { in: ['PENDING_REVIEW', 'APPROVED'] }, OR: [{ expiresAt: { lte: now } }, { source: { enabled: false } }],
    }, data: { status: 'STALE', approvalRef: null, approvedAuthorizationRef: null,
        approvedContentHash: null, approvedAt: null,
        aiStatus: 'NOT_ELIGIBLE', aiInputHash: null, aiJobId: null,
        aiDraft: Prisma.DbNull, aiUpdatedAt: now } });
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
