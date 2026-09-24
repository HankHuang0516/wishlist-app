import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { eligibleExternalCandidate } from '../lib/externalListingPublication';
import { districtCenter } from '../lib/doubleNorthDistrictCenters';
import { isListingId } from '../lib/listingRules';

const router = Router();
const select = { id: true, sourceItemId: true, canonicalUrl: true, imageUrl: true, title: true, description: true,
    priceTwd: true, condition: true, county: true, district: true, observedAt: true, expiresAt: true, contentHash: true,
    approvedContentHash: true, approvedAuthorizationRef: true, approvedAt: true,
    source: { select: { kind: true, enabled: true, enabledAt: true, textReuseAllowed: true,
        imageReuseAllowed: true, authorizationRef: true, canonicalHost: true, imageHost: true } },
} satisfies Prisma.ExternalListingCandidateSelect;

router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED !== '1') return res.json({ items: [], nextCursor: null, enabled: false });
    try {
        if (Object.keys(req.query).some(key => !['q', 'county', 'district', 'limit', 'cursor'].includes(key))) throw new Error('INVALID_QUERY');
        const { q, county, district, limit, cursor } = req.query;
        if ((q !== undefined && (typeof q !== 'string' || !q.trim() || q.length > 80 || /[\u0000-\u001f\u007f]/.test(q))) ||
            (county !== undefined && !['臺北市', '新北市'].includes(String(county))) ||
            (district !== undefined && (typeof district !== 'string' || !/^[\p{Script=Han}]{2,12}$/u.test(district))) ||
            (limit !== undefined && (typeof limit !== 'string' || !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100)) ||
            (cursor !== undefined && (typeof cursor !== 'string' || !isListingId(cursor)))) throw new Error('INVALID_QUERY');
        const pageSize = limit === undefined ? 50 : Number(limit);
        const now = new Date();
        const where: Prisma.ExternalListingCandidateWhereInput = {
            status: 'APPROVED', approvedContentHash: { not: null }, approvedAuthorizationRef: { not: null },
            approvedAt: { not: null },
            condition: 'USED', imageUrl: { not: null }, description: { not: null }, priceTwd: { not: null },
            observedAt: { gte: new Date(now.getTime() - 48 * 3_600_000) }, expiresAt: { gt: now },
            source: { enabled: true, enabledAt: { not: null }, textReuseAllowed: true, imageReuseAllowed: true },
            ...(q ? { OR: [{ title: { contains: q.trim(), mode: 'insensitive' } },
                { description: { contains: q.trim(), mode: 'insensitive' } }] } : {}),
            ...(county ? { county: county as string } : {}), ...(district ? { district: district as string } : {}),
        };
        if (cursor) {
            const anchor = await prisma.externalListingCandidate.findFirst({ where: { ...where, id: cursor as string }, select });
            if (!anchor || anchor.approvedContentHash !== anchor.contentHash ||
                anchor.approvedAuthorizationRef !== anchor.source.authorizationRef ||
                !districtCenter(anchor.county, anchor.district) ||
                !eligibleExternalCandidate(anchor, anchor.source, now)) return res.status(400).json({ error: '商品分頁已失效', errorCode: 'EXTERNAL_CURSOR_INVALID' });
        }
        const items: Array<Record<string, unknown>> = [];
        let scanCursor = cursor as string | undefined;
        let exhausted = false;
        for (let scan = 0; scan < 10 && items.length <= pageSize; scan++) {
            const rows = await prisma.externalListingCandidate.findMany({ where, select,
                orderBy: [{ observedAt: 'desc' }, { id: 'desc' }], take: 100,
                ...(scanCursor ? { cursor: { id: scanCursor }, skip: 1 } : {}) });
            for (const row of rows) {
                scanCursor = row.id;
                const location = districtCenter(row.county, row.district);
                if (row.approvedContentHash !== row.contentHash ||
                    row.approvedAuthorizationRef !== row.source.authorizationRef ||
                    !location || !eligibleExternalCandidate(row, row.source, now)) continue;
                items.push({ id: row.id, title: row.title, description: row.description, condition: row.condition,
                    priceTwd: row.priceTwd?.toString(), county: row.county, district: row.district, location,
                    imageUrl: row.imageUrl, canonicalUrl: row.canonicalUrl, observedAt: row.observedAt,
                    expiresAt: row.expiresAt, source: { host: row.source.canonicalHost,
                        imageHost: row.source.imageHost, kind: row.source.kind },
                    locationPrecision: 'DISTRICT_ONLY', priceSource: 'SOURCE_STATED', inAppSeller: false,
                    aiDerivedPublicFields: false });
                if (items.length > pageSize) break;
            }
            if (rows.length < 100) { exhausted = true; break; }
        }
        const hasNext = items.length > pageSize || !exhausted;
        const visible = items.slice(0, pageSize);
        return res.json({ items: visible, nextCursor: hasNext ? String(visible[visible.length - 1]?.id || scanCursor || '') : null,
            enabled: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_QUERY') return res.status(400).json({ error: '搜尋條件不正確', errorCode: 'EXTERNAL_QUERY_INVALID' });
        return res.status(503).json({ error: '外部商品索引暫時無法使用', errorCode: 'EXTERNAL_INDEX_UNAVAILABLE' });
    }
});

export default router;
