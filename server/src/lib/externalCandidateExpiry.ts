import prisma from './prisma';
import { Prisma } from '@prisma/client';

// A paused, expired or no-longer-recent source item must be re-imported from a
// fresh authorized observation before further review. Public reads already
// reject >48h observations; the scheduled status transition also prevents a
// later same-content import from silently retaining an old approval.
export async function expireExternalCandidates(now = new Date()) {
    const observationCutoff = new Date(now.getTime() - 48 * 3_600_000);
    const result = await prisma.externalListingCandidate.updateMany({ where: {
        status: { in: ['PENDING_REVIEW', 'APPROVED'] }, OR: [{ expiresAt: { lte: now } },
            { observedAt: { lt: observationCutoff } }, { source: { enabled: false } }],
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
