const randomUUID = () => crypto.randomUUID();
import { describe, expect, it } from 'vitest';
import { emptySearchFilters, TAIWAN_BOUNDS } from './listingSearch';
import { parseHomeMatches, parseMatchWishes, parseWishMatchPage, rankHomeMatches, wishMatchPath } from './wishData';
const api = 'https://example.invalid'; const future = new Date(Date.now() + 86400000).toISOString();
const wish = () => ({ id: 1, name: 'Sony 相機', maxPrice: 5000, priceCurrency: 'TWD', wishlist: { id: 2, title: '私人願望', isPublic: false } });
function listing() { const id = randomUUID(), mediaId = randomUUID(); return { id, title: 'Sony 相機', description: '合成測試相機', brand: 'Sony', category: 'electronics', condition: 'USED', price: '4000.00', currency: 'TWD', deliveryMethods: ['MEETUP'], negotiable: false, status: 'ACTIVE', expiresAt: future, owner: { id: 3, name: null }, location: { county: '臺北市', district: '中正區', publicLatitude: 25.05, publicLongitude: 121.51, precisionMeters: 2200 }, media: [{ id: mediaId, imageUrl: `${api}/api/listing-media/${mediaId}/image`, thumbnailUrl: `${api}/api/listing-media/${mediaId}/thumbnail` }] }; }
const match = () => ({ wishItemId: 1, listing: listing(), score: 60, budget: 'WITHIN', distanceKm: null, reasons: [{ code: 'NAME', text: '名稱符合' }, { code: 'BUDGET', text: '在上限內' }] });
const page = (items: unknown[] = [match()]) => ({ items, nextCursor: null, scannedCandidates: items.length, ordering: 'RECENT_CANDIDATES_PAGE_SCORE', notice: '本頁按評分排序，不是全台最高分保證' });
describe('native wish browsing and explainable match protocol', () => {
  it('shows one best seller match per wish and keeps all distinct thumbnail alternatives', () => {
    const first = parseWishMatchPage(page(), 1, api).items[0];
    const better = { ...first, listing: { ...first.listing, id: randomUUID() }, score: 88 };
    const own = { ...first, listing: { ...first.listing, id: randomUUID(), owner: { id: 19, name: null } }, score: 99 };
    const ranked = rankHomeMatches([first, better, own, first], 19);
    expect(ranked).toHaveLength(2);
    expect(ranked.map(item => item.listing.id)).toEqual([better.listing.id, first.listing.id]);
    expect(ranked[0].listing.media[0].thumbnailUrl).toBeTruthy();
  });
  it('parses the home read as a wish page whose groups each carry a genuine match page', () => {
    const home = (groups: unknown[], nextCursor: number | null = null) => ({ groups, nextCursor, matchLimit: 50, scope: { bbox: '117,20,123.8,26.6' }, ordering: 'RECENT_CANDIDATES_PAGE_SCORE', notice: '先依新近刊登分頁' });
    const cursor = randomUUID(), m = match();
    const r = parseHomeMatches(home([{ wish: { ...wish(), password: 'drop' }, ...page([m]), nextCursor: cursor }, { wish: { ...wish(), id: 7 }, ...page([]) }]), api);
    expect(r.nextCursor).toBeNull(); expect(r.groups.map(g => g.wish.id)).toEqual([1, 7]);
    expect(r.groups[0].wish).toEqual(wish()); expect(r.groups[0].wish).not.toHaveProperty('password');
    expect(r.groups[0].page).toMatchObject({ nextCursor: cursor, scannedCandidates: 1 }); expect(r.groups[0].page.items[0]).toMatchObject({ wishItemId: 1, score: 60 });
    expect(r.groups[1].page.items).toEqual([]);
    expect(parseHomeMatches(home([{ wish: wish(), ...page([]) }], 1), api).nextCursor).toBe(1);
    for (const bad of [null, [], { groups: {}, nextCursor: null }, home([{ wish: wish(), ...page([]) }, { wish: wish(), ...page([]) }]), home([{ wish: wish(), ...page([]) }], 5),
      home([{ wish: wish(), ...page([{ ...m, wishItemId: 2 }]) }]), home([{ wish: wish(), ...page([]), ordering: 'SCORE' }]), home([{ wish: { ...wish(), id: 0 }, ...page([]) }]), home([{ ...page([]) }]), home(Array.from({ length: 101 }, (_, i) => ({ wish: { ...wish(), id: i + 1 }, ...page([]) })))])
      expect(() => parseHomeMatches(bad, api)).toThrow();
  });
  it('projects private eligible wishes without leaking extra API fields', () => { const r = parseMatchWishes({ items: [{ ...wish(), password: 'drop' }], nextCursor: null }); expect(r.items[0]).toEqual(wish()); expect(r.items[0]).not.toHaveProperty('password'); });
  it.each([{ id: 0 }, { name: '' }, { name: 'x'.repeat(201) }, { maxPrice: -1 }, { maxPrice: NaN }, { maxPrice: 1e12 + 1 }, { priceCurrency: 'bad' }, { wishlist: { id: 0, title: 'x', isPublic: false } }])('rejects malformed wishlist metadata %p', overrides => expect(() => parseMatchWishes({ items: [{ ...wish(), ...overrides }], nextCursor: null })).toThrow());
  it('accepts unspecified budget, currencies and empty pages without inventing prices', () => { expect(parseMatchWishes({ items: [{ ...wish(), maxPrice: null, priceCurrency: null }], nextCursor: null }).items[0].maxPrice).toBeNull(); expect(parseMatchWishes({ items: [], nextCursor: null }).items).toEqual([]); });
  it.each([null, [], { items: {}, nextCursor: null }, { items: [wish(), wish()], nextCursor: null }, { items: [wish()], nextCursor: 5 }, { items: Array.from({ length: 101 }, wish), nextCursor: null }])('rejects unsafe or non-progressing wish pages %p', input => expect(() => parseMatchWishes(input)).toThrow());
  it('builds the same safe filter/viewport query for map and list matching', () => { const path = wishMatchPath(1, { ...emptySearchFilters, q: 'A7 & α' }, TAIWAN_BOUNDS); const url = new URL(api + path); expect(url.pathname).toBe('/listings/matches'); expect(url.searchParams.get('wishItemId')).toBe('1'); expect(url.searchParams.get('q')).toBe('A7 & α'); expect(url.searchParams.get('bbox')).toBe('117,20,123.8,26.6'); });
  it('adds owner preview only when explicitly requested by the native UI', () => { expect(new URL(api + wishMatchPath(1, emptySearchFilters, TAIWAN_BOUNDS)).searchParams.has('includeOwnPreview')).toBe(false); expect(new URL(api + wishMatchPath(1, emptySearchFilters, TAIWAN_BOUNDS, '', true)).searchParams.get('includeOwnPreview')).toBe('1'); });
  it.each([0, -1, 1.5, NaN, 2147483648])('rejects invalid wish IDs %p', id => expect(() => wishMatchPath(id, emptySearchFilters, TAIWAN_BOUNDS)).toThrow());
  it('sends only an approximate odd-hundredth grid center for distance matching', () => { const url = new URL(api + wishMatchPath(1, emptySearchFilters, [121.5, 25, 121.53, 25.08], '10')); expect(url.searchParams.get('radiusKm')).toBe('10'); expect(url.searchParams.get('center')).toMatch(/^25\.\d[13579],121\.\d[13579]$/); });
  it.each(['0', '201', 'NaN', '-1', '10&owner=2'])('rejects unsafe or unbounded match radius %s', radius => expect(() => wishMatchPath(1, emptySearchFilters, TAIWAN_BOUNDS, radius)).toThrow());
  it('parses genuine per-page reasons and drops private listing/profile extras', () => { const m = match(); const r = parseWishMatchPage(page([{ ...m, listing: { ...m.listing, password: 'drop' } }]), 1, api); expect(r.items[0]).toMatchObject({ score: 60, budget: 'WITHIN' }); expect(r.items[0].listing).not.toHaveProperty('password'); });
  it.each([{ wishItemId: 2 }, { score: -1 }, { score: 101 }, { score: 60.5 }, { budget: 'GUARANTEED' }, { distanceKm: -1 }, { distanceKm: NaN }, { reasons: [] }, { reasons: [{ code: 'FAKE_AI', text: '保證成交' }] }, { reasons: [{ code: 'NAME', text: '名稱' }] }, { reasons: [{ code: 'NAME', text: '' }, { code: 'BUDGET', text: '預算' }] }, { reasons: [{ code: 'NAME', text: '名稱' }, { code: 'NAME', text: '名稱' }, { code: 'BUDGET', text: '預算' }] }])('rejects wrong wish, unsafe score or fake reasons %p', overrides => expect(() => parseWishMatchPage({ ...page(), items: [{ ...match(), ...overrides }] }, 1, api)).toThrow());
  it.each([null, [], { items: {}, nextCursor: null }, { ...page(), nextCursor: 'bad' }, { ...page(), ordering: 'WORLD_BEST' }, { ...page(), scannedCandidates: 0 }, { ...page(), scannedCandidates: 101 }, { ...page(), notice: '' }])('rejects malformed or misleading match pages %p', input => expect(() => parseWishMatchPage(input, 1, api)).toThrow());
  it('requires explicit currency-unknown and distance reasons, not fake budget success', () => {
    const m = { ...match(), budget: 'CURRENCY_UNKNOWN', distanceKm: 3.2, reasons: [{ code: 'NAME', text: '名稱' }, { code: 'BUDGET_UNKNOWN', text: '幣別不符，不換算' }, { code: 'DISTANCE', text: '約略3.2公里' }] };
    expect(parseWishMatchPage(page([m]), 1, api).items[0]).toMatchObject({ budget: 'CURRENCY_UNKNOWN', distanceKm: 3.2 });
    expect(() => parseWishMatchPage(page([{ ...m, budget: 'WITHIN' }]), 1, api)).toThrow();
  });
  it('drops expired rows even if transport returns an old matching snapshot', () => { const m = match(); m.listing.expiresAt = '2020-01-01T00:00:00.000Z'; expect(parseWishMatchPage(page([m]), 1, api).items).toEqual([]); });
  it('accepts cursor from scanned candidates independently of score ordering, but rejects duplicate listings', () => {
    expect(parseWishMatchPage({ ...page(), nextCursor: randomUUID() }, 1, api).nextCursor).not.toBeNull(); const m = match(); expect(() => parseWishMatchPage(page([m, m]), 1, api)).toThrow();
  });
});
