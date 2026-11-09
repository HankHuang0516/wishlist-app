import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NON_SALE_QA_PREFIX, ListingInputError, isDiscoverable, parseListingSearch } from '../lib/listingRules';
import { evaluateWishMatch, parseWishMatchQuery, wishKeywords, type MatchPreferences } from '../lib/wishlistMatch';
import { publicListingSelect } from './listingController';
function fail(res: Response, e: unknown) {
    if (e instanceof ListingInputError) return res.status(400).json({ error: e.message, field: e.field, errorCode: 'INVALID_WISH_MATCH_INPUT' });
    return res.status(500).json({ error: '願望配對暫時無法使用', errorCode: 'WISH_MATCH_SERVICE_ERROR' });
}
const wishSelect = { id: true, name: true, maxPrice: true, priceCurrency: true, wishlist: { select: { id: true, title: true, isPublic: true } } } satisfies Prisma.ItemSelect;
type Wish = Prisma.ItemGetPayload<{ select: typeof wishSelect }>;
type Search = ReturnType<typeof parseListingSearch>;
type Candidate = { id: string };
const ORDERING = 'RECENT_CANDIDATES_PAGE_SCORE';
const INSUFFICIENT_NOTICE = '願望名稱資訊不足，請補充名稱或型號後再比對';
const PAGE_NOTICE = '先依新近刊登分頁，每頁按吻合度排序；文字吻合不保證同一型號或商品真偽';
const OWN_PREVIEW_NOTICE = '已包含自己刊登的配對預覽；自己的商品不能向自己購買。圖片不直接比對，文字吻合不保證同一型號或真偽。';
/** The home page matches every wish against the listings shown on the map of Taiwan, the same scope its map uses. */
const HOME_SCOPE = { bbox: '117,20,123.8,26.6' };
const numeric = (v: unknown) => { if (typeof v !== 'string' || !/^[1-9]\d{0,9}$/.test(v) || Number(v) > 2147483647) throw new ListingInputError('query'); return Number(v); };

/** Reads one page of the account's wishes that can be matched: not hidden, not purchased, newest first. */
async function wishPage(userId: number, query: Record<string, unknown>) {
    const limit = query.limit === undefined ? 50 : numeric(query.limit), cursor = query.cursor === undefined ? undefined : numeric(query.cursor);
    if (limit > 100) throw new ListingInputError('limit');
    const where = { wishlist: { userId }, isHidden: false, isPurchased: false };
    if (cursor && !await prisma.item.findFirst({ where: { ...where, id: cursor }, select: { id: true } })) return null;
    const rows = await prisma.item.findMany({ where, select: wishSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}

/** SQL that restricts matching candidates BEFORE bounded paging, not a scan of only the latest unrelated listings. All values bound. */
function candidateSql(wish: Wish, tokens: string[], search: Search, preferences: MatchPreferences, includeOwnPreview: boolean, userId: number, now: Date, anchor: { id: string } | null) {
    const clauses: Prisma.Sql[] = [Prisma.sql`left(l.title, length(${NON_SALE_QA_PREFIX})) <> ${NON_SALE_QA_PREFIX}`, Prisma.sql`l."status" IN ('ACTIVE', 'RESERVED')`, Prisma.sql`l."expiresAt" > ${now.toISOString()}::timestamp`, Prisma.sql`l.price >= 0 AND l.currency = 'TWD' AND p."listingId" IS NOT NULL AND l.description IS NOT NULL AND l.category IS NOT NULL AND EXISTS (SELECT 1 FROM "ListingMedia" m WHERE m."listingId" = l.id)`,
        Prisma.sql`(${Prisma.join(tokens.map(t => Prisma.sql`position(${t} in lower(normalize(l.title, NFKC))) > 0 OR position(${t} in lower(normalize(coalesce(l.brand, ''), NFKC))) > 0`), ' OR ')})`];
    if (!includeOwnPreview) clauses.push(Prisma.sql`l."ownerUserId" <> ${userId}`);
    clauses.push(Prisma.sql`(${Prisma.join(tokens.map(t => Prisma.sql`position(${t} in lower(normalize(l.title, NFKC))) > 0`), ' OR ')})`);
    const chinese = tokens.filter(t => /[\p{Script=Han}]/u.test(t));
    if (chinese.length) clauses.push(Prisma.sql`(${Prisma.join(chinese.map(t => Prisma.sql`position(${t} in lower(normalize(l.title, NFKC))) > 0`), ' OR ')})`);
    clauses.push(Prisma.sql`(${Prisma.join(tokens.map(t => Prisma.sql`CASE WHEN position(${t} in lower(normalize(l.title, NFKC))) > 0 OR position(${t} in lower(normalize(coalesce(l.brand, ''), NFKC))) > 0 THEN 1 ELSE 0 END`), ' + ')}) >= ${Math.ceil(tokens.length / 2)}`);
    for (const t of tokens.filter(t => !/[\p{Script=Han}]/u.test(t))) clauses.push(Prisma.sql`(position(${t} in lower(normalize(l.title, NFKC))) > 0 OR position(${t} in lower(normalize(coalesce(l.brand, ''), NFKC))) > 0)`);
    if (search.q) clauses.push(Prisma.sql`(position(lower(${search.q}) in lower(l.title)) > 0 OR position(lower(${search.q}) in lower(coalesce(l.description, ''))) > 0 OR position(lower(${search.q}) in lower(coalesce(l.brand, ''))) > 0)`);
    if (search.brand) clauses.push(Prisma.sql`lower(normalize(l.brand, NFKC)) = lower(normalize(${search.brand}, NFKC))`);
    if (search.category) clauses.push(Prisma.sql`l.category = ${search.category}`);
    if (search.condition) clauses.push(Prisma.sql`l.condition = ${search.condition}::"ListingCondition"`);
    if (search.delivery) clauses.push(Prisma.sql`${search.delivery}::"ListingDeliveryMethod" = ANY(l."deliveryMethods")`);
    if (search.minPrice !== undefined) clauses.push(Prisma.sql`l.price >= ${search.minPrice}`);
    if (search.maxPrice !== undefined) clauses.push(Prisma.sql`l.price <= ${search.maxPrice}`);
    if (wish.maxPrice !== null && wish.priceCurrency === 'TWD') clauses.push(Prisma.sql`l.price <= ${wish.maxPrice}`);
    if (search.bbox) clauses.push(Prisma.sql`l."mapVisibleUntil" > ${now.toISOString()}::timestamp AND p."publicLatitude" BETWEEN ${search.bbox.south} AND ${search.bbox.north} AND p."publicLongitude" BETWEEN ${search.bbox.west} AND ${search.bbox.east}`);
    if (preferences.center && preferences.radiusKm !== undefined) {
        const [lat, lng] = preferences.center;
        clauses.push(Prisma.sql`6371 * 2 * asin(sqrt(least(1.0, greatest(0.0, power(sin(radians(p."publicLatitude" - ${lat}) / 2), 2) + cos(radians(${lat})) * cos(radians(p."publicLatitude")) * power(sin(radians(p."publicLongitude" - ${lng}) / 2), 2))))) <= ${preferences.radiusKm}`);
    }
    // Keep cursor tuple entirely in DB types: round-tripping a naive SQL
    // timestamp through a JS Date can shift it with the session timezone.
    if (anchor) clauses.push(Prisma.sql`(l."createdAt", l.id) < (SELECT a."createdAt", a.id FROM "Listing" a WHERE a.id = ${anchor.id})`);
    return Prisma.sql`SELECT l.id FROM "Listing" l LEFT JOIN "ListingLocation" p ON p."listingId" = l.id WHERE ${Prisma.join(clauses, ' AND ')} ORDER BY l."createdAt" DESC, l.id DESC LIMIT ${search.limit + 1}`;
}

type Row = Prisma.ListingGetPayload<{ select: typeof publicListingSelect }>;
/** One page of a wish's matches: the page's candidates scored and ordered by score, with the cursor for the page after it. */
function scoredPage(wish: Wish, candidates: Candidate[], rows: Map<string, Row>, preferences: MatchPreferences, limit: number, now: Date, notice: string) {
    const page = candidates.slice(0, limit);
    const items = page.flatMap(({ id }) => {
        const row = rows.get(id);
        const match = row && evaluateWishMatch(wish, { ...row, price: row.price === null ? null : Number(row.price) }, preferences, now);
        return row && match ? [{ listing: row, ...match, wishItemId: wish.id }] : [];
    }).sort((a, b) => b.score - a.score || a.listing.id.localeCompare(b.listing.id));
    return { items, nextCursor: candidates.length > limit ? page[page.length - 1].id : null, scannedCandidates: page.length, ordering: ORDERING, notice };
}
const emptyPage = (notice: string) => ({ items: [], nextCursor: null, scannedCandidates: 0, ordering: ORDERING, notice });

export async function getMatchWishes(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        if (Object.keys(req.query).some(k => !['limit', 'cursor'].includes(k))) throw new ListingInputError('query');
        const page = await wishPage(req.user.id, req.query);
        if (!page) return res.status(404).json({ error: '找不到願望分頁' });
        return res.set('Cache-Control', 'private, no-store').json(page);
    } catch (e) { return fail(res, e); }
}
export async function matchWishListings(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const { id, search, preferences, includeOwnPreview } = parseWishMatchQuery(req.query);
        // Public wishlist visibility is NOT permission to match/read another
        // person's private budget or preference data. Auth ownership required.
        const wish = await prisma.item.findFirst({ where: { id, wishlist: { userId: req.user.id }, isHidden: false, isPurchased: false }, select: wishSelect });
        if (!wish) return res.status(404).json({ error: '願望不存在、已隱藏或已完成', errorCode: 'WISH_MATCH_NOT_FOUND' });
        const tokens = wishKeywords(wish.name), now = new Date();
        if (!tokens.length) return res.set('Cache-Control', 'private, no-store').json(emptyPage(INSUFFICIENT_NOTICE));
        let anchor: { id: string } | null = null;
        if (search.cursor) {
            const row = await prisma.listing.findUnique({ where: { id: search.cursor }, select: { id: true, status: true, expiresAt: true } });
            if (!row || !isDiscoverable(row.status, row.expiresAt, now)) return res.status(404).json({ error: '商品分頁已失效，請重新配對' }); anchor = row;
        }
        const candidates = await prisma.$queryRaw<Candidate[]>(candidateSql(wish, tokens, search, preferences, includeOwnPreview, req.user.id, now, anchor));
        const rows = await prisma.listing.findMany({ where: { id: { in: candidates.slice(0, search.limit).map(r => r.id) } }, select: publicListingSelect });
        return res.set('Cache-Control', 'private, no-store').json(scoredPage(wish, candidates, new Map(rows.map(row => [row.id, row])), preferences, search.limit, now, includeOwnPreview ? OWN_PREVIEW_NOTICE : PAGE_NOTICE));
    } catch (e) { return fail(res, e); }
}
/** The home page in one read: a page of the account's wishes, each with the first page of its matches on the map of
 * Taiwan — the same page `GET /matches?wishItemId=…&bbox=117,20,123.8,26.6&limit=…` would return — and the cursor
 * for the pages after it. Candidate searches run a few wishes at a time; one query then reads every listing. */
export async function homeMatches(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const { matchLimit, ...paging } = req.query;
        if (Object.keys(paging).some(k => !['limit', 'cursor'].includes(k))) throw new ListingInputError('query');
        const search = parseListingSearch({ ...HOME_SCOPE, ...(matchLimit === undefined ? {} : { limit: matchLimit }) });
        const preferences: MatchPreferences = {};
        const page = await wishPage(req.user.id, paging);
        if (!page) return res.status(404).json({ error: '找不到願望分頁' });
        const now = new Date(), userId = req.user.id;
        const candidates = new Map<number, Candidate[]>();
        const queue = [...page.items];
        await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
            for (let wish = queue.shift(); wish; wish = queue.shift()) {
                const tokens = wishKeywords(wish.name);
                candidates.set(wish.id, tokens.length ? await prisma.$queryRaw<Candidate[]>(candidateSql(wish, tokens, search, preferences, false, userId, now, null)) : []);
            }
        }));
        const ids = [...new Set([...candidates.values()].flatMap(list => list.slice(0, search.limit).map(r => r.id)))];
        const rows = new Map((ids.length ? await prisma.listing.findMany({ where: { id: { in: ids } }, select: publicListingSelect }) : []).map(row => [row.id, row] as const));
        const groups = page.items.map(wish => ({ wish, ...(wishKeywords(wish.name).length ? scoredPage(wish, candidates.get(wish.id) ?? [], rows, preferences, search.limit, now, PAGE_NOTICE) : emptyPage(INSUFFICIENT_NOTICE)) }));
        return res.set('Cache-Control', 'private, no-store').json({ groups, nextCursor: page.nextCursor, matchLimit: search.limit, scope: HOME_SCOPE, ordering: ORDERING, notice: PAGE_NOTICE });
    } catch (e) { return fail(res, e); }
}
