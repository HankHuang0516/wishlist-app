import { isDiscoverable, isListingId, ListingInputError, parseListingCreate, parseListingSearch, publicationExpiry, publicLocation } from '../lib/listingRules';

const now = new Date('2026-09-15T04:00:00.123Z');
const uuid = '745d5d99-547b-4df7-a417-a43723c34b67';
const location = { county: '台北市', district: '中山區', latitude: 25.052349, longitude: 121.523456 };
const full = { clientListingId: uuid, title: ' Switch OLED ', description: '功能正常，有盒裝', condition: 'USED', category: 'electronics', brand: 'Nintendo',
    price: 7500, currency: 'TWD', deliveryMethods: ['MEETUP', 'SHIPPING'], mediaIds: [uuid], location, publish: true, consentToMap: true };

describe('Taiwan expiry dates', () => {
    it('defaults to exactly publication + 30 days only when omitted', () => {
        expect(publicationExpiry(now)).toEqual({ expiresAt: new Date('2026-10-15T04:00:00.123Z'), expiryMode: 'DEFAULT_30_DAYS' });
    });
    it('stores a selected Taiwan day at 23:59:59.999 converted to UTC', () => {
        expect(publicationExpiry(now, '2026-09-16')).toEqual({ expiresAt: new Date('2026-09-16T15:59:59.999Z'), expiryMode: 'CUSTOM_DATE' });
    });
    it('permits today only while the Taiwan day has not ended', () => {
        expect(publicationExpiry(now, '2026-09-15').expiresAt.getTime()).toBeGreaterThan(now.getTime());
        expect(() => publicationExpiry(new Date('2026-09-15T15:59:59.999Z'), '2026-09-15')).toThrow(ListingInputError);
    });
    it('accepts leap day only in a leap year', () => {
        expect(publicationExpiry(now, '2028-02-29').expiryMode).toBe('CUSTOM_DATE');
        expect(() => publicationExpiry(now, '2027-02-29')).toThrow(ListingInputError);
    });
    it.each([null, '', false, 30, '2026-02-30', '2026-13-01', '2026-00-01', '2026-09-00', '2026-9-16', '2026-09-16T00:00:00Z', '1999-12-31', '2026-09-14'])('rejects an invalid/past date %p instead of silently defaulting', value => {
        expect(() => publicationExpiry(now, value)).toThrow(ListingInputError);
    });
    it('rejects invalid publication clocks', () => expect(() => publicationExpiry(new Date(NaN))).toThrow(ListingInputError));
});

describe('public location privacy', () => {
    it('keeps cell centres inside database bounds at the supported northern/eastern edges', () => {
        expect(publicLocation({ ...location, latitude: 26.6, longitude: 123.8 })).toMatchObject({ publicLatitude: 26.59, publicLongitude: 123.79 });
        expect(publicLocation({ ...location, latitude: 20, longitude: 117 })).toMatchObject({ publicLatitude: 20.01, publicLongitude: 117.01 });
    });
    it('discards exact coordinates and collapses neighbouring GPS inputs to one cell', () => {
        const result = publicLocation(location);
        expect(result).toEqual({ county: '台北市', district: '中山區', publicLatitude: 25.05, publicLongitude: 121.53, precisionMeters: 2200 });
        expect(publicLocation({ ...location, latitude: 25.055, longitude: 121.527 })).toEqual(result);
        expect(JSON.stringify(result)).not.toContain('25.052349');
    });
    it.each([null, [], { ...location, latitude: '25.05' }, { ...location, longitude: NaN }, { ...location, latitude: 0 }, { ...location, longitude: 180 }, { ...location, county: '' }, { ...location, district: 'x'.repeat(31) }, { ...location, address: '私宅' }])('rejects invalid, non-Taiwan and precise-address inputs %p', value => {
        expect(() => publicLocation(value)).toThrow(ListingInputError);
    });
});

describe('listing validation and idempotent data', () => {
    it('validates complete publications and hashes independently of request time', () => {
        const first = parseListingCreate(full, now);
        const replay = parseListingCreate(full, new Date(now.getTime() + 1000));
        expect(first.requestHash).toBe(replay.requestHash);
        expect(first.data.title).toBe('Switch OLED');
        expect(first.data.status).toBe('ACTIVE');
        expect(first.data.publishedAt).toEqual(now);
        expect(parseListingCreate({ ...full, price: 7501 }, now).requestHash).not.toBe(first.requestHash);
    });
    it('allows incomplete drafts without starting a 30-day clock', () => {
        const draft = parseListingCreate({ clientListingId: uuid, title: '待整理', publish: false }, now);
        expect(draft.data).toMatchObject({ status: 'DRAFT', publishedAt: null, expiresAt: null, price: null, description: null, negotiable: false, condition: 'USED' });
        expect(draft.mediaIds).toEqual([]);
        expect(draft.location).toBeUndefined();
    });
    it('retains explicitly selected draft expiry and boolean negotiation', () => {
        const draft = parseListingCreate({ ...full, publish: false, expiryDate: '2026-10-01', negotiable: true }, now);
        expect(draft.data).toMatchObject({ expiryMode: 'CUSTOM_DATE', publishedAt: null, negotiable: true });
    });
    it.each([
        null, [], { ...full, ownerUserId: 99 }, { ...full, status: 'ACTIVE' }, { ...full, expiresAt: '9999' },
        { ...full, clientListingId: 'x' }, { ...full, publish: 'true' }, { ...full, consentToMap: false }, { ...full, consentToMap: 'true' },
        { ...full, title: '' }, { ...full, title: 'x'.repeat(101) }, { ...full, title: 'bad\u0000' }, { ...full, description: 'x'.repeat(3001) },
        { ...full, condition: 'REFURBISHED' }, { ...full, category: 'drugs' }, { ...full, brand: '' }, { ...full, price: -1 }, { ...full, price: Infinity },
        { ...full, price: '7500' }, { ...full, price: 0.001 }, { ...full, currency: 'USD' }, { ...full, negotiable: 'yes' },
        { ...full, deliveryMethods: 'MEETUP' }, { ...full, deliveryMethods: ['MEETUP', 'MEETUP'] }, { ...full, deliveryMethods: ['PICKUP'] },
        { ...full, mediaIds: 'x' }, { ...full, mediaIds: [uuid, uuid] }, { ...full, mediaIds: ['bad'] },
        { ...full, mediaIds: Array.from({ length: 9 }, () => uuid) }, { ...full, mediaIds: [] },
        { ...full, description: undefined }, { ...full, category: undefined },
        { ...full, price: undefined }, { ...full, deliveryMethods: [] }, { ...full, location: undefined },
    ])('rejects invalid or privileged input %p', value => expect(() => parseListingCreate(value, now)).toThrow(ListingInputError));
    it('accepts free items and valid fractional prices', () => {
        expect(parseListingCreate({ ...full, price: 0 }, now).data.price).toBe(0);
        expect(parseListingCreate({ ...full, price: 7.99 }, now).data.price).toBe(7.99);
        expect(parseListingCreate({ ...full, brand: undefined }, now).data.brand).toBeNull();
    });
    it.each(['DRAFT', 'SOLD', 'REMOVED', 'EXPIRED', 'PENDING_CONFIRMATION'])('never discovers %s', status => expect(isDiscoverable(status, publicationExpiry(now).expiresAt, now)).toBe(false));
    it('requires a future expiry even for active/reserved rows', () => {
        expect(isDiscoverable('ACTIVE', null, now)).toBe(false);
        expect(isDiscoverable('ACTIVE', now, now)).toBe(false);
        expect(isDiscoverable('RESERVED', publicationExpiry(now).expiresAt, now)).toBe(true);
    });
    it('validates IDs without coercion', () => {
        expect(isListingId(uuid)).toBe(true);
        expect(isListingId(null)).toBe(false);
        expect(isListingId('1')).toBe(false);
    });
});

describe('bounded map search', () => {
    it('has a capped default page and supports all first-party filters', () => {
        expect(parseListingSearch({}).limit).toBe(50);
        expect(parseListingSearch({ q: ' Switch ', condition: 'USED', category: 'electronics', brand: 'Nintendo', minPrice: '0', maxPrice: '7500.50', delivery: 'MEETUP', bbox: '121,24,122,26', cursor: uuid, limit: '20' })).toMatchObject({
            q: 'Switch', condition: 'USED', category: 'electronics', brand: 'Nintendo', minPrice: 0, maxPrice: 7500.5, delivery: 'MEETUP', limit: 20, cursor: uuid,
            bbox: { west: 121, south: 24, east: 122, north: 26 },
        });
    });
    it.each([{ limit: '101' }, { limit: '0' }, { limit: '1.5' }, { limit: ['20'] }, { q: '' }, { condition: 'any' }, { category: 'illegal' },
        { delivery: 'any' }, { cursor: '1' }, { ownerUserId: '99' }, { minPrice: '100', maxPrice: '10' }, { minPrice: '-1' }, { maxPrice: '0.001' },
        { bbox: '122,24,121,26' }, { bbox: '121,26,122,24' }, { bbox: '0,0,180,90' }, { bbox: 'bad' }, { bbox: ['121,24,122,26'] }])('rejects unbounded/malformed search %p', query => expect(() => parseListingSearch(query)).toThrow(ListingInputError));
});
