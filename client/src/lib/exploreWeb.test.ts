import { describe, expect, it, vi } from 'vitest';
import { parseExploreIntent, exploreSellerPath, exploreExternalPath, readExploreSeller, readExploreExternal, type ExploreQuery } from './exploreWeb';
import { emptySearchFilters, TAIWAN_BOUNDS } from './listingSearch';
import { ApiFailure } from './marketplaceApi';
import { makeListing, makeMatch, makeMatchPage, uuid } from '../__tests__/fixtures/marketplace';
import { marketplaceOrigin } from './marketplaceUrl';
const scope = (): ExploreQuery => ({ filters: { ...emptySearchFilters }, bounds: TAIWAN_BOUNDS, wishId: null, radius: '', serial: 1 });
describe('web map query parity and public response contracts', () => {
  it('accepts only safe wish and listing navigation IDs', () => {
    const id = uuid(); expect(parseExploreIntent(`?wish=814&listing=${id}`)).toEqual({ wishId: 814, listingId: id, q: '' });
    expect(parseExploreIntent('')).toEqual({ wishId: null, listingId: null, q: '' });
    for (const input of ['?wish=0', '?wish=2147483648', '?wish=1&wish=2', '?listing=bad', '?redirect=https://evil.invalid']) expect(() => parseExploreIntent(input)).toThrow();
  });
  it('accepts a single bounded search and rejects duplicate, oversized or control-character inputs', () => {
    expect(parseExploreIntent('?q=' + encodeURIComponent(' 三國演義 & 漫畫 ')).q).toBe('三國演義 & 漫畫');
    for (const input of ['?q=a&q=b', '?q=' + 'x'.repeat(101), '?q=a%00b']) expect(() => parseExploreIntent(input)).toThrow();
  });
  it('shares bounds and filters between map and list, with own preview explicit only for wish mode', async () => {
    const query = { ...scope(), wishId: 814, radius: '10', filters: { ...emptySearchFilters, q: '三國演義 & 漫畫' } };
    const path = exploreSellerPath(query), params = new URL('https://example.invalid' + path).searchParams;
    expect(params.get('q')).toBe('三國演義 & 漫畫'); expect(params.get('includeOwnPreview')).toBe('1'); expect(params.get('radiusKm')).toBe('10');
    expect(exploreSellerPath(scope())).not.toContain('includeOwnPreview');
    expect(() => exploreSellerPath(query, 'bad')).toThrow(); expect(() => exploreExternalPath(query, 'bad')).toThrow();
    const read = vi.fn(async () => makeMatchPage([makeMatch(814)]));
    expect((await readExploreSeller(query, read, marketplaceOrigin(), true)).matches[0].wishItemId).toBe(814);
  });
  it('does not show external results for unverifiable filters and does not request them', async () => {
    const read = vi.fn();
    const result = await readExploreExternal({ ...scope(), filters: { ...emptySearchFilters, category: 'books' } }, read);
    expect(result).toMatchObject({ enabled: false, skipped: true, items: [] }); expect(read).not.toHaveBeenCalled();
  });
  it('does not turn authorization, network or wish-not-found errors into external supply disabled', async () => {
    expect(await readExploreExternal(scope(), async () => { throw new ApiFailure('route absent', 404); })).toMatchObject({ enabled: false, items: [] });
    for (const error of [new ApiFailure('not authorized', 401), new Error('offline')]) await expect(readExploreExternal(scope(), async () => { throw error; })).rejects.toBe(error);
    await expect(readExploreExternal({ ...scope(), wishId: 1 }, async () => { throw new ApiFailure('wish absent', 404); })).rejects.toThrow('wish absent');
  });
  it('parses rather than trusting public data and discards expired results', async () => {
    const item = { ...makeListing(), expiresAt: '2000-01-01T00:00:00Z' };
    expect((await readExploreSeller(scope(), async () => ({ items: [item], nextCursor: null }), marketplaceOrigin(), true)).items).toEqual([]);
    await expect(readExploreSeller(scope(), async () => ({ items: [{ ...makeListing(), media: [{ id: uuid(), imageUrl: 'https://evil.invalid/x', thumbnailUrl: 'https://evil.invalid/x' }] }], nextCursor: null }), marketplaceOrigin(), true)).rejects.toThrow();
  });
});
