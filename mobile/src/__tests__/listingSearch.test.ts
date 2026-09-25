import { describe, expect, it } from 'vitest';
import { clipBounds, emptySearchFilters, listingGeoJSON, listingPrice, listingSearchPath, mergeListingPages, parseListingPage, parsePublicListing, TAIWAN_BOUNDS } from '../listingSearch';
const apiUrl = 'https://example.com/api';
const id = '9a318c01-0844-4d79-b8c0-b544482a6f96';
const mediaId = '030d1520-34e4-4ae4-8f0b-808ef6448de0';
const otherId = '47741265-484a-48e4-b9ef-95a77f748715';
const raw = {
  id, title: '二手相機', description: '保存良好，附電池', brand: '相機品牌', category: 'electronics', condition: 'USED', price: '1250.50', currency: 'TWD',
  status: 'ACTIVE', negotiable: true, expiresAt: '2026-10-15T15:59:59.999Z', deliveryMethods: ['MEETUP'], owner: { id: 1, name: '合成賣家' },
  location: { county: '臺北市', district: '中正區', publicLatitude: 25.03, publicLongitude: 121.51, precisionMeters: 2200 },
  media: [{ id: mediaId, imageUrl: `https://example.com/api/listing-media/${mediaId}/image`, thumbnailUrl: `https://example.com/api/listing-media/${mediaId}/thumbnail` }],
};
const filters = () => ({ ...emptySearchFilters });
const now = Date.parse('2026-09-15T08:00:00.000Z');

describe('shared map/list query', () => {
  it('uses a bounded viewport query with no all-country original image request', () => {
    const query = new URLSearchParams(listingSearchPath(filters(), [121, 24, 122, 25]).split('?')[1]);
    expect(Object.fromEntries(query)).toEqual({ limit: '100', bbox: '121,24,122,25' });
  });
  it('safely encodes Chinese, plus, ampersands and spaces without injecting filter fields', () => {
    const query = new URLSearchParams(listingSearchPath({ ...filters(), q: '  電腦 + Apple&condition=NEW  ', brand: '品牌 & 名' }, TAIWAN_BOUNDS).split('?')[1]);
    expect(query.get('q')).toBe('電腦 + Apple&condition=NEW'); expect(query.has('condition')).toBe(false); expect(query.get('brand')).toBe('品牌 & 名');
  });
  it('includes every supported exact filter and a UUID cursor', () => {
    const query = new URLSearchParams(listingSearchPath({ ...filters(), category: 'electronics', condition: 'NEW', delivery: 'SHIPPING', minPrice: '0', maxPrice: '1999.99' }, TAIWAN_BOUNDS, id).split('?')[1]);
    expect(Object.fromEntries(query)).toMatchObject({ category: 'electronics', condition: 'NEW', delivery: 'SHIPPING', minPrice: '0', maxPrice: '1999.99', cursor: id });
  });
  it.each([
    { q: 'x'.repeat(101) }, { brand: 'x'.repeat(61) }, { category: 'weapons' }, { condition: 'BROKEN' }, { delivery: 'CASH' },
    { minPrice: '-1' }, { maxPrice: '10.123' }, { minPrice: '1e4' }, { maxPrice: '10000000000' }, { minPrice: '20', maxPrice: '10' },
  ])('rejects invalid filters %j', change => expect(() => listingSearchPath({ ...filters(), ...change } as ReturnType<typeof filters>, TAIWAN_BOUNDS)).toThrow());
  it('rejects cursor identities instead of interpolating arbitrary paths', () => expect(() => listingSearchPath(filters(), TAIWAN_BOUNDS, '../private')).toThrow());
  it('clips a global viewport to Taiwan without rounding small viewports into invalid boxes', () => {
    expect(clipBounds([-180, -90, 180, 90])).toEqual(TAIWAN_BOUNDS);
    expect(clipBounds([121.0000001, 25, 121.0000002, 25.0000001])).toEqual([121.0000001, 25, 121.0000002, 25.0000001]);
  });
  it.each([null, [], [121, 25, 120, 26], [121, 25, 122, 24], [0, 0, 1, 1], [124, 25, 125, 26], [121, 27, 122, 28], [121, 25, NaN, 26], [121, 25, Infinity, 26], ['121', 25, 122, 26]])('does not fall back to national results for an invalid/outside viewport %j', bounds => expect(clipBounds(bounds)).toBeNull());
  it('rejects an outside search rather than querying nationwide data', () => expect(() => listingSearchPath(filters(), [0, 0, 1, 1])).toThrow());
});

describe('untrusted public listing response', () => {
  it('parses Prisma decimal price while retaining only public allowlisted fields', () => {
    const parsed = parsePublicListing({ ...raw, requestHash: 'private', exactLatitude: 25.034567, owner: { ...raw.owner, email: 'private@example.com', password: 'synthetic-only' }, location: { ...raw.location, latitude: 25.034567 } }, apiUrl);
    expect(parsed.price).toBe(1250.5); expect(parsed).not.toHaveProperty('requestHash'); expect(parsed.owner).not.toHaveProperty('email'); expect(parsed.location).not.toHaveProperty('latitude');
  });
  it('keeps an unknown brand empty without dropping a valid map listing', () => {
    expect(parsePublicListing({ ...raw, brand: null }, apiUrl).brand).toBeNull();
  });
  it.each([
    { id: '../private' }, { title: '' }, { description: '' }, { brand: '' }, { category: 'invalid' }, { condition: 'BROKEN' },
    { price: '-1' }, { price: NaN }, { price: null }, { price: 'secret' }, { price: '10000000000' }, { currency: 'USD' },
    { status: 'SOLD' }, { status: 'DRAFT' }, { status: 'REMOVED' }, { status: 'EXPIRED' }, { negotiable: 'true' }, { expiresAt: 'invalid' },
    { owner: null }, { owner: { id: 0, name: null } }, { owner: { id: 1, name: 42 } }, { location: null },
    { location: { ...raw.location, publicLatitude: 19 } }, { location: { ...raw.location, publicLongitude: 124 } },
    { location: { ...raw.location, precisionMeters: 10 } }, { deliveryMethods: [] }, { deliveryMethods: ['MEETUP', 'MEETUP'] }, { deliveryMethods: ['PAYMENT'] },
    { media: [] }, { media: Array(9).fill(raw.media[0]) }, { media: [raw.media[0], raw.media[0]] },
  ])('rejects malformed, non-public or unsafe listing records %j', change => expect(() => parsePublicListing({ ...raw, ...change }, apiUrl)).toThrow());
  it.each([
    'http://example.com/api/listing-media/' + mediaId + '/image', 'https://attacker.example/image',
    `https://example.com/api/listing-media/${mediaId}/image?key=secret`, 'file:///private/photo',
  ])('refuses arbitrary server-supplied original image origins %s', imageUrl => expect(() => parsePublicListing({ ...raw, media: [{ ...raw.media[0], imageUrl }] }, apiUrl)).toThrow());
  it('refuses arbitrary thumbnails too', () => expect(() => parsePublicListing({ ...raw, media: [{ ...raw.media[0], thumbnailUrl: 'https://attacker.example/image' }] }, apiUrl)).toThrow());
  it('accepts explicit loopback development images but not local HTTP in release mode', () => {
    const value = { ...raw, media: [{ id: mediaId, imageUrl: `http://localhost:3000/api/listing-media/${mediaId}/image`, thumbnailUrl: `http://localhost:3000/api/listing-media/${mediaId}/thumbnail` }] };
    expect(parsePublicListing(value, 'http://localhost:3000', true).id).toBe(id); expect(() => parsePublicListing(value, 'http://localhost:3000')).toThrow();
  });
  it('accepts RESERVED and a null display name, not private contact fallback', () => {
    expect(parsePublicListing({ ...raw, status: 'RESERVED', owner: { id: 1, name: null } }, apiUrl)).toMatchObject({ status: 'RESERVED', owner: { id: 1, name: null } });
  });
});
describe('page expiry, deduplication and map projection', () => {
  it('drops already expired results from an otherwise valid response', () => {
    const page = parseListingPage({ items: [{ ...raw, expiresAt: new Date(now).toISOString() }, { ...raw, id: otherId }], nextCursor: null }, apiUrl, false, now);
    expect(page.items.map(item => item.id)).toEqual([otherId]);
  });
  it('retains cursor progression even when the last fetched item just expired', () => {
    expect(parseListingPage({ items: [{ ...raw, expiresAt: new Date(now).toISOString() }], nextCursor: id }, apiUrl, false, now)).toEqual({ items: [], nextCursor: id });
  });
  it.each([null, { items: null, nextCursor: null }, { items: Array(101).fill(raw), nextCursor: null }, { items: [raw, raw], nextCursor: null }, { items: [], nextCursor: id }, { items: [raw], nextCursor: otherId }, { items: [raw], nextCursor: 'private' }, { items: [raw] }])('rejects oversized, duplicate or malformed pages %j', value => expect(() => parseListingPage(value, apiUrl, false, now)).toThrow());
  it('deduplicates overlap between pages and updates the latest public version', () => {
    const item = parsePublicListing(raw, apiUrl); const updated = { ...item, price: 900 };
    const merged = mergeListingPages([item], [updated, { ...item, id: otherId }]);
    expect(merged.map(item => item.id)).toEqual([id, otherId]); expect(merged[0].price).toBe(900);
  });
  it('projects only coarse locations and thumbnail IDs to native GeoJSON, never owner or descriptions', () => {
    const data = listingGeoJSON([parsePublicListing(raw, apiUrl)]);
    expect(data.features[0]).toEqual({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [121.51, 25.03] }, properties: { listingId: id, icon: 'photo-' + mediaId, title: '二手相機' } });
    expect(listingGeoJSON([]).features).toEqual([]);
  });
  it('formats free listings and two decimal prices', () => {
    const item = parsePublicListing(raw, apiUrl); expect(listingPrice(item)).toBe('NT$ 1,250.5'); expect(listingPrice({ ...item, price: 0 })).toBe('免費贈送');
  });
});
