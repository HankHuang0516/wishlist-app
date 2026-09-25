import { createHash } from 'crypto';

export class ListingInputError extends Error {
    constructor(public readonly field: string, message = '商品資料格式不正確') { super(message); }
}

export const LISTING_CATEGORIES = ['electronics', 'home', 'fashion', 'sports', 'books', 'toys', 'other'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isListingId = (id: unknown): id is string => typeof id === 'string' && UUID.test(id);
const DAY = 86_400_000;

export function publicationExpiry(now: Date, expiryDate?: unknown) {
    if (!Number.isFinite(now.getTime())) throw new ListingInputError('publishedAt');
    if (expiryDate === undefined) return { expiresAt: new Date(now.getTime() + 30 * DAY), expiryMode: 'DEFAULT_30_DAYS' as const };
    if (typeof expiryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) throw new ListingInputError('expiryDate', '請選擇有效的失效日期');
    const [year, month, day] = expiryDate.split('-').map(Number);
    if (year < 2000) throw new ListingInputError('expiryDate');
    const date = new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date <= now) {
        throw new ListingInputError('expiryDate', '失效日期必須晚於現在');
    }
    return { expiresAt: date, expiryMode: 'CUSTOM_DATE' as const };
}

export function publicLocation(input: unknown) {
    const value = object(input, 'location');
    onlyKeys(value, ['county', 'district', 'latitude', 'longitude'], 'location');
    const county = text(value.county, 'location.county', 30);
    const district = text(value.district, 'location.district', 30);
    const latitude = number(value.latitude, 'location.latitude', 20, 26.6);
    const longitude = number(value.longitude, 'location.longitude', 117, 123.8);
    // A fixed cell centre, not a reversible per-user random offset. All inputs
    // in the same ~2 km cell yield the same public point. Never persist input.
    return {
        county, district,
        publicLatitude: Number(Math.min(26.59, Math.floor(latitude / 0.02) * 0.02 + 0.01).toFixed(2)),
        publicLongitude: Number(Math.min(123.79, Math.floor(longitude / 0.02) * 0.02 + 0.01).toFixed(2)),
        precisionMeters: 2200,
    };
}

function object(input: unknown, field: string): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ListingInputError(field);
    return input as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: string[], field = 'body') {
    if (Object.keys(value).some(key => !keys.includes(key))) throw new ListingInputError(field, '含不允許的商品欄位');
}
function text(input: unknown, field: string, max: number): string {
    if (typeof input !== 'string' || !input.trim() || input.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)) throw new ListingInputError(field);
    return input.trim();
}
function number(input: unknown, field: string, min: number, max: number): number {
    if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max) throw new ListingInputError(field);
    return input;
}

export function parseListingCreate(input: unknown, now: Date) {
    const body = object(input, 'body');
    onlyKeys(body, ['clientListingId', 'title', 'description', 'condition', 'category', 'brand', 'price', 'currency', 'deliveryMethods', 'negotiable', 'location', 'mediaIds', 'expiryDate', 'publish', 'consentToMap']);
    if (!isListingId(body.clientListingId)) throw new ListingInputError('clientListingId');
    if (typeof body.publish !== 'boolean') throw new ListingInputError('publish');
    if (body.consentToMap !== undefined && typeof body.consentToMap !== 'boolean') throw new ListingInputError('consentToMap');
    if (body.publish && body.consentToMap !== true) throw new ListingInputError('consentToMap', '請確認同意公開至商品地圖');
    const title = text(body.title, 'title', 100);
    const description = body.description === undefined ? null : text(body.description, 'description', 3000);
    const condition = body.condition === undefined ? 'USED' : body.condition;
    if (condition !== 'NEW' && condition !== 'USED') throw new ListingInputError('condition');
    const category = body.category === undefined ? null : text(body.category, 'category', 30);
    if (category !== null && !(LISTING_CATEGORIES as readonly string[]).includes(category)) throw new ListingInputError('category');
    const brand = body.brand === undefined ? null : text(body.brand, 'brand', 60);
    const price = body.price === undefined ? null : number(body.price, 'price', 0, 9_999_999_999.99);
    if (price !== null && Math.abs(price * 100 - Math.round(price * 100)) > 0.001) throw new ListingInputError('price', '價格最多兩位小數');
    if (body.currency !== undefined && body.currency !== 'TWD') throw new ListingInputError('currency');
    const methods = body.deliveryMethods === undefined ? [] : body.deliveryMethods;
    if (!Array.isArray(methods) || methods.length > 2 || methods.some(v => v !== 'MEETUP' && v !== 'SHIPPING') || new Set(methods).size !== methods.length) throw new ListingInputError('deliveryMethods');
    if (body.negotiable !== undefined && typeof body.negotiable !== 'boolean') throw new ListingInputError('negotiable');
    const mediaIds = body.mediaIds === undefined ? [] : body.mediaIds;
    if (!Array.isArray(mediaIds) || mediaIds.length > 8 || mediaIds.some(v => !isListingId(v)) || new Set(mediaIds).size !== mediaIds.length) throw new ListingInputError('mediaIds');
    const location = body.location === undefined ? undefined : publicLocation(body.location);
    const expiry = body.expiryDate === undefined && !body.publish ? { expiresAt: null, expiryMode: 'DEFAULT_30_DAYS' as const } : publicationExpiry(now, body.expiryDate);
    if (body.publish && (!description || !category || price === null || !methods.length || !mediaIds.length || !location)) throw new ListingInputError('publish', '上架前請完成商品資訊、實拍圖與地區');
    const data = {
        title, description, condition: condition as 'NEW' | 'USED', category, brand, price, currency: 'TWD',
        deliveryMethods: methods as ('MEETUP' | 'SHIPPING')[], negotiable: body.negotiable === true,
        status: body.publish ? 'ACTIVE' as const : 'DRAFT' as const,
        publishedAt: body.publish ? now : null, ...expiry, lastVerifiedAt: body.publish ? now : null,
    };
    const normalized = { ...data, publishedAt: undefined, lastVerifiedAt: undefined, expiresAt: undefined, expiryDate: body.expiryDate, location, mediaIds, consentToMap: body.consentToMap === true };
    return { clientListingId: body.clientListingId, data, location, mediaIds: mediaIds as string[], requestHash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex') };
}

export function isDiscoverable(status: string, expiresAt: Date | null, now: Date): boolean {
    return (status === 'ACTIVE' || status === 'RESERVED') && !!expiresAt && expiresAt > now;
}

export function parseListingSearch(input: Record<string, unknown>) {
    onlyKeys(input, ['q', 'condition', 'category', 'brand', 'minPrice', 'maxPrice', 'delivery', 'bbox', 'cursor', 'limit']);
    const q = input.q === undefined ? undefined : text(input.q, 'q', 100);
    const category = input.category === undefined ? undefined : text(input.category, 'category', 30);
    if (category && !(LISTING_CATEGORIES as readonly string[]).includes(category)) throw new ListingInputError('category');
    const brand = input.brand === undefined ? undefined : text(input.brand, 'brand', 60);
    const condition = input.condition;
    if (condition !== undefined && condition !== 'NEW' && condition !== 'USED') throw new ListingInputError('condition');
    const delivery = input.delivery;
    if (delivery !== undefined && delivery !== 'MEETUP' && delivery !== 'SHIPPING') throw new ListingInputError('delivery');
    const numericQuery = (v: unknown, key: string, min: number, max: number) => {
        if (typeof v !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(v)) throw new ListingInputError(key);
        return number(Number(v), key, min, max);
    };
    const minPrice = input.minPrice === undefined ? undefined : numericQuery(input.minPrice, 'minPrice', 0, 9_999_999_999.99);
    const maxPrice = input.maxPrice === undefined ? undefined : numericQuery(input.maxPrice, 'maxPrice', 0, 9_999_999_999.99);
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw new ListingInputError('maxPrice');
    const limit = input.limit === undefined ? 50 : numericQuery(input.limit, 'limit', 1, 100);
    if (!Number.isInteger(limit)) throw new ListingInputError('limit');
    const cursor = input.cursor;
    if (cursor !== undefined && !isListingId(cursor)) throw new ListingInputError('cursor');
    let bbox: { west: number; south: number; east: number; north: number } | undefined;
    if (input.bbox !== undefined) {
        if (typeof input.bbox !== 'string' || !/^\d+(?:\.\d+)?,\d+(?:\.\d+)?,\d+(?:\.\d+)?,\d+(?:\.\d+)?$/.test(input.bbox)) throw new ListingInputError('bbox');
        const [west, south, east, north] = input.bbox.split(',').map(Number);
        if (west < 117 || east > 123.8 || south < 20 || north > 26.6 || west >= east || south >= north) throw new ListingInputError('bbox');
        bbox = { west, south, east, north };
    }
    return { q, category, brand, condition: condition as 'NEW' | 'USED' | undefined, delivery: delivery as 'MEETUP' | 'SHIPPING' | undefined, minPrice, maxPrice, limit, cursor: cursor as string | undefined, bbox };
}
