import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { eligibleExternalCandidate } from '../lib/externalListingPublication';
import { districtCenter, districtsInBounds } from '../lib/doubleNorthDistrictCenters';
import { isListingId, ListingInputError } from '../lib/listingRules';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { evaluateWishMatch, parseWishMatchQuery, wishKeywords } from '../lib/wishlistMatch';
import { EXTERNAL_OBSERVATION_MAX_AGE_MS } from '../lib/externalListingIntake';

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
            observedAt: { gte: new Date(now.getTime() - EXTERNAL_OBSERVATION_MAX_AGE_MS) }, expiresAt: { gt: now },
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

// A private wishlist is never exposed through the public source index. Search
// the approved source facts first, then recheck rights/freshness before return.
router.get('/matches', authenticateToken, async (req: AuthRequest, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED !== '1')
        return res.json({ enabled: false, items: [], nextCursor: null });
    try {
        const { id, search, preferences } = parseWishMatchQuery(req.query);
        if (preferences.brand || preferences.category || preferences.delivery || preferences.condition === 'NEW' ||
            preferences.center || preferences.radiusKm !== undefined)
            throw new ListingInputError('filters', '外部來源尚未驗證品牌、分類、交付或距離條件');
        const wish = await prisma.item.findFirst({ where: { id, wishlist: { userId: req.user.id },
            isHidden: false, isPurchased: false }, select: { id: true, name: true, maxPrice: true, priceCurrency: true } });
        if (!wish) return res.status(404).json({ error: '願望不存在、已隱藏或已完成', errorCode: 'WISH_MATCH_NOT_FOUND' });
        const tokens = wishKeywords(wish.name), now = new Date();
        if (!tokens.length) return res.json({ enabled: true, items: [], nextCursor: null,
            notice: '願望名稱資訊不足，請補充名稱或型號後再比對' });
        const areas = search.bbox ? districtsInBounds([search.bbox.west, search.bbox.south,
            search.bbox.east, search.bbox.north]) : null;
        if (areas && !areas.length) return res.json({ enabled: true, items: [], nextCursor: null });
        if (search.cursor) {
            const anchor = await prisma.externalListingCandidate.findUnique({ where: { id: search.cursor }, select });
            if (!anchor || !publicCandidate(anchor, now))
                return res.status(400).json({ error: '商品分頁已失效', errorCode: 'EXTERNAL_CURSOR_INVALID' });
        }
        const title = (token: string) => Prisma.sql`position(${token} in lower(normalize(c.title, NFKC))) > 0`;
        const titleOr = Prisma.sql`(${Prisma.join(tokens.map(title), ' OR ')})`;
        const chinese = tokens.filter(token => /[\p{Script=Han}]/u.test(token));
        const clauses: Prisma.Sql[] = [
            Prisma.sql`c.status = 'APPROVED'::"ExternalCandidateStatus" AND c."approvedContentHash" = c."contentHash" AND c."approvedAuthorizationRef" = s."authorizationRef" AND c."approvedAt" IS NOT NULL`,
            Prisma.sql`s.enabled = true AND s."enabledAt" IS NOT NULL AND s."textReuseAllowed" = true AND s."imageReuseAllowed" = true`,
            Prisma.sql`c.condition = 'USED'::"ListingCondition" AND c."imageUrl" IS NOT NULL AND c."thumbnailUrl" IS NOT NULL AND c.description IS NOT NULL AND c."priceTwd" IS NOT NULL`,
            Prisma.sql`c."observedAt" >= ${new Date(now.getTime() - EXTERNAL_OBSERVATION_MAX_AGE_MS)} AND c."expiresAt" > ${now}`,
            titleOr,
            Prisma.sql`(${Prisma.join(tokens.map(token => Prisma.sql`CASE WHEN ${title(token)} THEN 1 ELSE 0 END`), ' + ')}) >= ${Math.ceil(tokens.length / 2)}`,
        ];
        if (chinese.length) clauses.push(Prisma.sql`(${Prisma.join(chinese.map(title), ' OR ')})`);
        for (const token of tokens.filter(token => !/[\p{Script=Han}]/u.test(token))) clauses.push(title(token));
        if (search.q) clauses.push(Prisma.sql`(position(lower(${search.q}) in lower(c.title)) > 0 OR position(lower(${search.q}) in lower(c.description)) > 0)`);
        if (search.condition) clauses.push(Prisma.sql`c.condition = ${search.condition}::"ListingCondition"`);
        if (search.minPrice !== undefined) clauses.push(Prisma.sql`c."priceTwd" >= ${search.minPrice}`);
        if (search.maxPrice !== undefined) clauses.push(Prisma.sql`c."priceTwd" <= ${search.maxPrice}`);
        if (wish.maxPrice !== null && wish.priceCurrency === 'TWD') clauses.push(Prisma.sql`c."priceTwd" <= ${wish.maxPrice}`);
        if (areas) clauses.push(Prisma.sql`(${Prisma.join(areas.map(place =>
            Prisma.sql`(c.county = ${place.county} AND c.district = ${place.district})`), ' OR ')})`);
        const items: Array<NonNullable<ReturnType<typeof publicCandidate>>> = [];
        let scanCursor = search.cursor, exhausted = false;
        // Content hashes and source rights are revalidated in JS. Scan bounded
        // batches until the public page is full, never return a private anchor.
        for (let scan = 0; scan < 10 && items.length <= search.limit; scan++) {
            const pageClauses = scanCursor ? [...clauses, Prisma.sql`(c."observedAt", c.id) < (SELECT a."observedAt", a.id FROM "ExternalListingCandidate" a WHERE a.id = ${scanCursor})`] : clauses;
            const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT c.id FROM "ExternalListingCandidate" c JOIN "ExternalListingSource" s ON s.id = c."sourceId" WHERE ${Prisma.join(pageClauses, ' AND ')} ORDER BY c."observedAt" DESC, c.id DESC LIMIT 100`);
            if (!ids.length) { exhausted = true; break; }
            const rows = await prisma.externalListingCandidate.findMany({ where: { id: { in: ids.map(row => row.id) } }, select });
            const byId = new Map(rows.map(row => [row.id, row]));
            for (const { id: candidateId } of ids) {
                scanCursor = candidateId;
                const row = byId.get(candidateId), publicItem = row && publicCandidate(row, new Date());
                if (!row || !publicItem || row.priceTwd === null) continue;
                const match = evaluateWishMatch(wish, { title: row.title, brand: null, category: null,
                    condition: row.condition, price: Number(row.priceTwd), currency: 'TWD', deliveryMethods: [],
                    status: 'ACTIVE', expiresAt: row.expiresAt, publishedAt: null, lastVerifiedAt: null,
                    location: { publicLatitude: publicItem.location.latitude,
                        publicLongitude: publicItem.location.longitude } }, {}, new Date());
                if (match) items.push(publicItem);
                if (items.length > search.limit) break;
            }
            if (ids.length < 100) { exhausted = true; break; }
        }
        const visible = items.slice(0, search.limit);
        if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED !== '1')
            return res.json({ enabled: false, items: [], nextCursor: null });
        return res.json({ enabled: true, items: visible,
            nextCursor: (items.length > search.limit || !exhausted) && visible.length ? visible[visible.length - 1].id : null,
            notice: '依來源商品名稱與願望文字比對；台幣願望預算才比較來源售價。不保證同一型號、庫存或商品真偽，請到來源核對' });
    } catch (error) {
        if (error instanceof ListingInputError) return res.status(400).json({ error: error.message, errorCode: 'EXTERNAL_MATCH_INVALID' });
        return res.status(503).json({ error: '外部商品願望比對暫時無法使用', errorCode: 'EXTERNAL_MATCH_UNAVAILABLE' });
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
