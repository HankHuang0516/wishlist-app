import { describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { EXTERNAL_OBSERVATION_MAX_AGE_MS, externalGeoJSON, externalListingVisible, externalPrice, externalSearchPath, externalWishSearchPath, parseExternalListing,
  parseExternalListingPage } from '../externalListingSearch';
import { emptySearchFilters, type SearchFilters } from '../listingSearch';

const now = Date.now();
const row = () => ({ id: randomUUID(), title: '二手檯燈', description: '來源明示的二手橘色檯燈',
  condition: 'USED', priceTwd: '590', county: '新北市', district: '板橋區',
  imageUrl: 'https://images.example.com/items/1.jpg', thumbnailUrl: 'https://images.example.com/items/1-320.jpg',
  canonicalUrl: 'https://partner.example.com/items/1',
  observedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString(),
  source: { host: 'partner.example.com', imageHost: 'images.example.com', kind: 'PARTNER_FEED' },
  location: { latitude: 25.01186, longitude: 121.45797, precision: 'DISTRICT_CENTER',
    source: 'https://data.gov.tw/dataset/25489' },
  locationPrecision: 'DISTRICT_ONLY', priceSource: 'SOURCE_STATED', inAppSeller: false,
  aiDerivedPublicFields: false, aiSupplement: null });

describe('source-attributed external map data', () => {
  it('keeps only source facts and district-center provenance', () => {
    const item = parseExternalListing({ ...row(), secret: 'not public', owner: { id: 1 } }, now);
    expect(item).not.toHaveProperty('secret'); expect(item).not.toHaveProperty('owner');
    expect(item).toMatchObject({ priceTwd: 590, locationPrecision: 'DISTRICT_ONLY',
      source: { host: 'partner.example.com' }, inAppSeller: false });
    expect(externalPrice(item)).toBe('來源售價 NT$ 590');
    expect(parseExternalListing({ ...row(), aiSupplement: undefined }, now).aiSupplement).toBeNull();
    expect(externalGeoJSON([item]).features[0]).toMatchObject({
      geometry: { coordinates: [121.45797, 25.01186] }, properties: { externalId: item.id } });
  });
  it('shows only explicitly marked, bounded AI supplements while keeping source price and description', () => {
    const item = parseExternalListing({ ...row(), aiSupplement: '根據授權照片可見的橘色燈罩與金屬底座，外觀細節仍請在來源確認。',
      aiDerivedPublicFields: true }, now);
    expect(item).toMatchObject({ priceTwd: 590, description: row().description,
      aiDerivedPublicFields: true, aiSupplement: expect.stringContaining('橘色燈罩') });
    expect(() => parseExternalListing({ ...row(), aiSupplement: '未標示', aiDerivedPublicFields: false }, now)).toThrow();
  });
  it('uses the same 24-hour observation cutoff as the public source index', () => {
    expect(EXTERNAL_OBSERVATION_MAX_AGE_MS).toBe(24 * 3_600_000);
    const atCutoff = parseExternalListing({ ...row(), observedAt: new Date(now - EXTERNAL_OBSERVATION_MAX_AGE_MS).toISOString() }, now);
    expect(externalListingVisible(atCutoff, now)).toBe(true);
    // A page arriving just after the backend cutoff may be parsed, but the
    // local map must not display its stale item or fail the entire page.
    const justOld = parseExternalListing({ ...row(), observedAt: new Date(now - EXTERNAL_OBSERVATION_MAX_AGE_MS - 1).toISOString() }, now);
    expect(externalListingVisible(justOld, now)).toBe(false);
    expect(() => parseExternalListing({ ...row(), observedAt: new Date(now - EXTERNAL_OBSERVATION_MAX_AGE_MS - 5 * 60_000 - 1).toISOString() }, now))
      .toThrow('外部商品已失效');
  });
  it.each([
    { inAppSeller: true }, { aiDerivedPublicFields: true }, { priceSource: 'AI_ESTIMATE' },
    { locationPrecision: 'EXACT' }, { condition: 'NEW' }, { priceTwd: null },
    { canonicalUrl: 'https://evil.example/items/1' },
    { canonicalUrl: 'https://partner.example.com@evil.example/items/1' },
    { imageUrl: 'http://images.example.com/items/1.jpg' },
    { imageUrl: 'https://images.example.com:444/items/1.jpg' },
    { thumbnailUrl: null }, { thumbnailUrl: 'https://evil.example/items/1.jpg' },
    { thumbnailUrl: 'https://images.example.com/items/1.jpg' },
    { observedAt: new Date(now - EXTERNAL_OBSERVATION_MAX_AGE_MS - 5 * 60_000 - 1).toISOString() },
    { expiresAt: new Date(now - 1_000).toISOString() },
    { location: { latitude: 25.01186, longitude: 121.45797, precision: 'EXACT',
      source: 'https://data.gov.tw/dataset/25489' } },
  ])('rejects unsafe or misleading external data %j', changed => {
    expect(() => parseExternalListing({ ...row(), ...changed }, now)).toThrow();
  });
  it('validates feature-gated pages and pagination', () => {
    const item = row();
    expect(parseExternalListingPage({ enabled: false, items: [], nextCursor: null }, now).items).toEqual([]);
    expect(parseExternalListingPage({ enabled: true, items: [item], nextCursor: item.id }, now).items).toHaveLength(1);
    expect(() => parseExternalListingPage({ enabled: false, items: [item], nextCursor: null }, now)).toThrow();
    expect(() => parseExternalListingPage({ enabled: true, items: [item, item], nextCursor: null }, now)).toThrow();
  });
  it('uses viewport and source-supported filters only', () => {
    const box: [number, number, number, number] = [121.4, 24.9, 121.6, 25.1];
    const filters: SearchFilters = { ...emptySearchFilters, q: '檯燈', minPrice: '100', maxPrice: '800' };
    const path = externalSearchPath(filters, box);
    expect(path).toContain('bbox=121.40000%2C24.90000%2C121.60000%2C25.10000');
    expect(path).toContain('minPrice=100'); expect(path).toContain('maxPrice=800');
    expect(path).toContain('q=%E6%AA%AF%E7%87%88');
    for (const changed of [{ brand: 'Sony' }, { category: 'home' }, { delivery: 'MEETUP' },
      { condition: 'NEW' }, { minPrice: '10000001' }])
      expect(externalSearchPath({ ...filters, ...changed } as SearchFilters, box)).toBeNull();
    expect(externalSearchPath(filters, [122, 27, 123, 28])).toBeNull();
  });
  it('uses a private wish-match path only for source-verifiable filters', () => {
    const box: [number, number, number, number] = [121.4, 24.9, 121.6, 25.1];
    const path = externalWishSearchPath(42, { ...emptySearchFilters, q: '相機' }, box, '');
    expect(path).toContain('/external-listings/matches?wishItemId=42&');
    expect(path).toContain('q=%E7%9B%B8%E6%A9%9F');
    expect(externalWishSearchPath(42, emptySearchFilters, box, '5')).toBeNull();
    expect(externalWishSearchPath(42, { ...emptySearchFilters, brand: 'Sony' }, box, '')).toBeNull();
    expect(externalWishSearchPath(0, emptySearchFilters, box, '')).toBeNull();
  });
});
