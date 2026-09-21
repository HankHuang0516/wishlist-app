import { ListingInputError, parseListingSearch } from './listingRules';
export type WishMatchInput = { id: number; name: string; maxPrice: number | null; priceCurrency: string | null };
export type MatchPreferences = { brand?: string; category?: string; condition?: 'NEW' | 'USED'; delivery?: 'MEETUP' | 'SHIPPING'; center?: [number, number]; radiusKm?: number };
export const normalizeWish = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
export function wishKeywords(name: string) {
    const words = normalizeWish(name).replace(/([\p{Script=Han}])([\p{Script=Latin}\p{N}])/gu, '$1 $2').replace(/([\p{Script=Latin}\p{N}])([\p{Script=Han}])/gu, '$1 $2').split(' ').filter(w => w.length >= 2);
    // Whole CJK terms plus bounded bigrams support free-form Chinese wishes.
    // Do not silently invent a category/brand or infer budget from legacy price.
    const result: string[] = [];
    for (const word of words) {
        result.push(word);
        if (/^[\p{Script=Han}]+$/u.test(word) && word.length > 2) for (let i = 0; i < word.length - 1; i++) result.push(word.slice(i, i + 2));
    }
    return [...new Set(result.filter(w => !['想要', '二手', '新品', '一個', '徵求'].includes(w)))].slice(0, 12);
}
const integer = (value: unknown) => {
    if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) throw new ListingInputError('wishItemId'); return Number(value);
};
export function parseWishMatchQuery(query: Record<string, unknown>) {
    const { wishItemId, center, radiusKm, ...listing } = query;
    const search = parseListingSearch(listing); const id = integer(wishItemId);
    let origin: [number, number] | undefined, radius: number | undefined;
    if (center !== undefined) {
        if (typeof center !== 'string' || !/^\d{2}\.\d{2},\d{3}\.\d{2}$/.test(center)) throw new ListingInputError('center', '請使用約2公里格點中心，不傳精確GPS');
        const [lat, lng] = center.split(',').map(Number);
        if (lat < 20 || lat > 26.6 || lng < 117 || lng > 123.8 || Math.round(lat * 100) % 2 !== 1 || Math.round(lng * 100) % 2 !== 1) throw new ListingInputError('center');
        origin = [lat, lng];
    }
    if (radiusKm !== undefined) {
        if (!origin || typeof radiusKm !== 'string' || !/^\d{1,3}(?:\.\d{1,2})?$/.test(radiusKm) || Number(radiusKm) < 0.5 || Number(radiusKm) > 200) throw new ListingInputError('radiusKm'); radius = Number(radiusKm);
    }
    return { id, search, preferences: { brand: search.brand, category: search.category, condition: search.condition, delivery: search.delivery, center: origin, radiusKm: radius } satisfies MatchPreferences };
}
export function approximateDistanceKm(a: [number, number], b: [number, number]) {
    const rad = (n: number) => n * Math.PI / 180;
    const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
type Candidate = { title: string; brand: string | null; category: string | null; condition: string; price: number | null; currency: string; deliveryMethods: string[]; status: string; expiresAt: Date | null; publishedAt: Date | null; lastVerifiedAt: Date | null; location: { publicLatitude: number; publicLongitude: number } | null };
export function evaluateWishMatch(wish: WishMatchInput, listing: Candidate, p: MatchPreferences, now: Date) {
    if (!Number.isFinite(now.getTime()) || !['ACTIVE', 'RESERVED'].includes(listing.status) || !listing.expiresAt || listing.expiresAt <= now || listing.price === null || !Number.isFinite(listing.price) || listing.price < 0) return null;
    const words = wishKeywords(wish.name), title = normalizeWish(listing.title), brand = normalizeWish(listing.brand ?? ''), full = normalizeWish(wish.name);
    const found = words.filter(word => title.includes(word) || brand.includes(word));
    const chinese = words.filter(w => /[\p{Script=Han}]/u.test(w));
    if (!found.length || found.length < Math.ceil(words.length / 2) || !words.some(w => title.includes(w)) || (chinese.length > 0 && !chinese.some(w => title.includes(w))) || words.filter(w => !/[\p{Script=Han}]/u.test(w)).some(w => !found.includes(w))) return null;
    if ((p.brand && brand !== normalizeWish(p.brand)) || (p.category && listing.category !== p.category) || (p.condition && listing.condition !== p.condition) || (p.delivery && !listing.deliveryMethods.includes(p.delivery))) return null;
    const reasons: { code: string; text: string }[] = [];
    let score = title.includes(full) ? 55 : Math.round(45 * found.length / words.length);
    reasons.push({ code: 'NAME', text: title.includes(full) ? '商品名稱包含你的願望名稱' : `名稱／品牌包含願望關鍵字：${found.slice(0, 3).join('、')}` });
    for (const [present, code, text, points] of [[p.brand, 'BRAND', '符合你選擇的品牌', 10], [p.category, 'CATEGORY', '符合你選擇的分類', 8], [p.condition, 'CONDITION', '符合新品／二手偏好', 5], [p.delivery, 'DELIVERY', '符合交付方式偏好', 5]] as const) if (present) { reasons.push({ code, text }); score += points; }
    let budget: 'WITHIN' | 'UNSPECIFIED' | 'CURRENCY_UNKNOWN' = 'UNSPECIFIED';
    if (wish.maxPrice !== null && Number.isFinite(wish.maxPrice)) {
        if (wish.priceCurrency === listing.currency) {
            if (listing.price > wish.maxPrice) return null;
            budget = 'WITHIN'; score += 12; reasons.push({ code: 'BUDGET', text: '刊登價格未超過你設定的購買上限' });
        } else { budget = 'CURRENCY_UNKNOWN'; reasons.push({ code: 'BUDGET_UNKNOWN', text: '預算幣別不同，未換算或判定價格符合' }); }
    }
    let distanceKm: number | null = null;
    if (p.center) {
        if (!listing.location) return null;
        const exact = approximateDistanceKm(p.center, [listing.location.publicLatitude, listing.location.publicLongitude]);
        if (p.radiusKm !== undefined && exact > p.radiusKm) return null;
        distanceKm = Math.round(exact * 10) / 10;
        reasons.push({ code: 'DISTANCE', text: `距離所選約略中心約${distanceKm}公里（非精確面交位置）` });
        if (p.radiusKm !== undefined) score += 8;
    }
    const day = 86400000;
    if (listing.lastVerifiedAt && listing.lastVerifiedAt <= now && now.getTime() - listing.lastVerifiedAt.getTime() <= 7 * day) { score += 4; reasons.push({ code: 'RECENTLY_VERIFIED', text: '賣家於近7天確認刊登；不代表平台驗證真偽或交易保障' }); }
    if (listing.publishedAt && listing.publishedAt <= now && now.getTime() - listing.publishedAt.getTime() <= 7 * day) { score += 2; reasons.push({ code: 'FRESH', text: '近7天的新近刊登' }); }
    return { score: Math.min(100, score), reasons, budget, distanceKm };
}
