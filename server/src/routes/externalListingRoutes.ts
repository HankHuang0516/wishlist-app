import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { eligibleExternalCandidate } from '../lib/externalListingPublication';
import { districtCenter, districtsInBounds } from '../lib/doubleNorthDistrictCenters';
import { isListingId } from '../lib/listingRules';

const router = Router();
router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false,
    message: { error: '外部商品查詢過於頻繁', errorCode: 'EXTERNAL_INDEX_RATE_LIMIT' } }));
const select = { id: true, sourceItemId: true, status: true, canonicalUrl: true, imageUrl: true, thumbnailUrl: true,
    title: true, description: true,
    priceTwd: true, condition: true, county: true, district: true, observedAt: true, expiresAt: true, contentHash: true,
    approvedContentHash: true, approvedAuthorizationRef: true, approvedAt: true,
    source: { select: { kind: true, enabled: true, enabledAt: true, textReuseAllowed: true,
        imageReuseAllowed: true, authorizationRef: true, canonicalHost: true, imageHost: true } },
} satisfies Prisma.ExternalListingCandidateSelect;
type SelectedCandidate = Prisma.ExternalListingCandidateGetPayload<{ select: typeof select }>;
const publicCandidate = (row: SelectedCandidate, now: Date) => {
    const location = districtCenter(row.county, row.district);
    if (row.status !== 'APPROVED' || row.approvedContentHash !== row.contentHash ||
        row.approvedAuthorizationRef !== row.source.authorizationRef || !location ||
        !eligibleExternalCandidate(row, row.source, now)) return null;
    return { id: row.id, title: row.title, description: row.description, condition: row.condition,
        priceTwd: row.priceTwd?.toString(), county: row.county, district: row.district, location,
        imageUrl: row.imageUrl, thumbnailUrl: row.thumbnailUrl, canonicalUrl: row.canonicalUrl, observedAt: row.observedAt,
        expiresAt: row.expiresAt, source: { host: row.source.canonicalHost,
            imageHost: row.source.imageHost, kind: row.source.kind },
        locationPrecision: 'DISTRICT_ONLY', priceSource: 'SOURCE_STATED', inAppSeller: false,
        aiDerivedPublicFields: false };
};
const bboxValue = (value: string) => {
    const pieces = value.split(',');
    if (pieces.length !== 4 || pieces.some(piece => !/^-?\d{1,3}(?:\.\d{1,12})?$/.test(piece))) throw new Error('INVALID_QUERY');
    const [west, south, east, north] = pieces.map(Number);
    if (west < 117 || east > 123.8 || south < 20 || north > 26.6 || west >= east || south >= north)
        throw new Error('INVALID_QUERY');
    return [west, south, east, north] as const;
};

router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED !== '1') return res.json({ items: [], nextCursor: null, enabled: false });
    try {
        if (Object.keys(req.query).some(key => !['q', 'county', 'district', 'limit', 'cursor', 'bbox', 'minPrice', 'maxPrice'].includes(key))) throw new Error('INVALID_QUERY');
        const { q, county, district, limit, cursor, bbox, minPrice, maxPrice } = req.query;
        if ((q !== undefined && (typeof q !== 'string' || !q.trim() || q.length > 80 || /[\u0000-\u001f\u007f]/.test(q))) ||
            (county !== undefined && !['臺北市', '新北市'].includes(String(county))) ||
            (district !== undefined && (typeof district !== 'string' || !/^[\p{Script=Han}]{2,12}$/u.test(district))) ||
            (limit !== undefined && (typeof limit !== 'string' || !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100)) ||
            (cursor !== undefined && (typeof cursor !== 'string' || !isListingId(cursor))) ||
            (bbox !== undefined && typeof bbox !== 'string') ||
            ([minPrice, maxPrice].some(value => value !== undefined && (typeof value !== 'string' ||
                !/^\d{1,8}(?:\.\d{1,2})?$/.test(value) || Number(value) > 10_000_000))) ||
            (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)))
            throw new Error('INVALID_QUERY');
        const pageSize = limit === undefined ? 50 : Number(limit);
        const bounds = bbox === undefined ? null : bboxValue(bbox as string);
        const areas = bounds ? districtsInBounds(bounds).filter(place =>
            (!county || place.county === county) && (!district || place.district === district)) : null;
        if (areas && !areas.length) return res.json({ items: [], nextCursor: null, enabled: true });
        const now = new Date();
        const constraints: Prisma.ExternalListingCandidateWhereInput[] = [];
        if (q) constraints.push({ OR: [{ title: { contains: q.trim(), mode: 'insensitive' } },
            { description: { contains: q.trim(), mode: 'insensitive' } }] });
        if (areas) constraints.push({ OR: areas.map(place => ({ county: place.county, district: place.district })) });
        const where: Prisma.ExternalListingCandidateWhereInput = {
            status: 'APPROVED', approvedContentHash: { not: null }, approvedAuthorizationRef: { not: null },
            approvedAt: { not: null },
            condition: 'USED', imageUrl: { not: null }, thumbnailUrl: { not: null },
            description: { not: null }, priceTwd: { not: null },
            observedAt: { gte: new Date(now.getTime() - 48 * 3_600_000) }, expiresAt: { gt: now },
            source: { enabled: true, enabledAt: { not: null }, textReuseAllowed: true, imageReuseAllowed: true },
            ...(constraints.length ? { AND: constraints } : {}),
            ...(county ? { county: county as string } : {}), ...(district ? { district: district as string } : {}),
            ...(minPrice !== undefined || maxPrice !== undefined ? { priceTwd: {
                ...(minPrice !== undefined ? { gte: new Prisma.Decimal(minPrice as string) } : {}),
                ...(maxPrice !== undefined ? { lte: new Prisma.Decimal(maxPrice as string) } : {}),
            } } : {}),
        };
        if (cursor) {
            const anchor = await prisma.externalListingCandidate.findFirst({ where: { ...where, id: cursor as string }, select });
            if (!anchor || !publicCandidate(anchor, now)) return res.status(400).json({ error: '商品分頁已失效', errorCode: 'EXTERNAL_CURSOR_INVALID' });
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
                const item = publicCandidate(row, now);
                if (!item) continue;
                items.push(item);
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

router.get('/:id', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED !== '1' || !isListingId(req.params.id))
        return res.status(404).json({ error: '外部商品不存在' });
    try {
        const row = await prisma.externalListingCandidate.findUnique({ where: { id: String(req.params.id) }, select });
        const item = row ? publicCandidate(row, new Date()) : null;
        return item ? res.json(item) : res.status(404).json({ error: '外部商品已失效或停止公開' });
    } catch { return res.status(503).json({ error: '外部商品索引暫時無法使用', errorCode: 'EXTERNAL_INDEX_UNAVAILABLE' }); }
});

export default router;
