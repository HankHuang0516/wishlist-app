import prisma from './prisma';
import { leadCurrent, leadDTO } from './sourceLeadRules';
import { isCountyIllustration } from './sourceCountyIllustration';
import { isContactLocation } from './sourceContactLocation';

/** What GET /api/source-leads asks for, after the route has checked it. */
export type PublicLeadListQuery = {
    q: string; box: number[] | null; cursor: string | null;
    unlocated: boolean; approximate: boolean; presentation: boolean; photos: boolean;
};

/** One page of the public source list: the route's answer, and what the source map's HTML names first
 *  (firstScreenHints.ts), so that both always describe the same leads in the same order. */
export async function publicLeadList({ q, box, cursor, unlocated, approximate, presentation, photos }: PublicLeadListQuery) {
    // Scan bounded batches until enough valid results; every cursor advances over
    // expired/withdrawn records as well, so filtering cannot trap pagination.
    const items: ReturnType<typeof leadDTO>[] = [];
    let next = cursor, exhausted = false;
    for (let scan = 0; scan < 20 && items.length < 25; scan++) {
        const rows = await prisma.externalSourceLead.findMany({ where: { status: 'PUBLISHED', AND: [...(q ? [{ OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { summary: { contains: q, mode: 'insensitive' as const } }] }] : []), ...(box ? [{ OR: [{ longitude: { gte: box[0], lte: box[2] }, latitude: { gte: box[1], lte: box[3] } }, ...(unlocated ? [{ latitude: null, recordOrigin: 'DB_MASTER' }] : [])] }] : [])] }, orderBy: { id: 'asc' }, take: 50, ...(next ? { cursor: { id: next }, skip: 1 } : {}) });
        if (!rows.length) {
            exhausted = true;
            break;
        }
        for (const r of rows) {
            next = r.id;
            if (leadCurrent(r) && (!isCountyIllustration(r.evidence) || approximate) && (!isContactLocation(r.evidence) || unlocated))
                items.push(leadDTO(r, presentation, photos));
            if (items.length === 25)
                break;
        }
        if (rows.length < 50 && items.length < 25) {
            exhausted = true;
            break;
        }
    }
    return { items, nextCursor: exhausted ? null : next };
}
