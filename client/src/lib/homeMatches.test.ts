import { describe, expect, it, vi } from 'vitest';
import { readAllMatchWishes, readHomeMatches, readHomeOverview } from './homeMatches';
import { makeWish, makeMatch, makeMatchPage, makeHomePage, makeListing, uuid } from '../__tests__/fixtures/marketplace';
import { marketplaceOrigin } from './marketplaceUrl';
import { parseWishMatchPage } from './wishData';

describe('the home page in one read', () => {
  it('returns every wish with its first page, following the wish cursor in backend order', async () => {
    const more = uuid();
    const read = vi.fn(async (path: string) => path.includes('cursor=20')
      ? makeHomePage([{ wish: makeWish(7), items: [makeMatch(7)] }])
      : makeHomePage([{ wish: makeWish(20), items: [makeMatch(20), makeMatch(20)], nextCursor: more }], 20));
    const overview = await readHomeOverview(read, marketplaceOrigin(), { local: true });
    expect(overview.wishes.map(wish => wish.id)).toEqual([20, 7]);
    expect(overview.firstPages.get(20)).toMatchObject({ nextCursor: more }); expect(overview.firstPages.get(20)!.items).toHaveLength(2);
    expect(overview.firstPages.get(7)).toMatchObject({ nextCursor: null });
    expect(read.mock.calls.map(([path]) => path)).toEqual(['/listings/home-matches?limit=100', '/listings/home-matches?limit=100&cursor=20']);
  });
  it('rejects a repeated page, a repeated wish and a group whose page is malformed', async () => {
    await expect(readHomeOverview(async () => makeHomePage([{ wish: makeWish() }], 1), marketplaceOrigin())).rejects.toThrow('重複');
    await expect(readHomeOverview(async () => ({ ...makeHomePage([{ wish: makeWish(1) }, { wish: makeWish(1) }]) }), marketplaceOrigin())).rejects.toThrow();
    await expect(readHomeOverview(async () => ({ ...makeHomePage([{ wish: makeWish(1), items: [makeMatch(2)] }]) }), marketplaceOrigin(), { local: true })).rejects.toThrow();
  });
  it('spends no request on a wish whose first page is complete, and reads on from the cursor of one that is not', async () => {
    const cursor = uuid(), later = makeMatch(1, makeListing('後一頁'), 99);
    const read = vi.fn(async (_path: string) => makeMatchPage([later]));
    const firstPage = (wishId: number, nextCursor: string | null) => parseWishMatchPage(makeMatchPage([makeMatch(wishId)], nextCursor), wishId, marketplaceOrigin(), true);
    const first = new Map([[1, firstPage(1, cursor)], [2, firstPage(2, null)]]);
    const result = await readHomeMatches([makeWish(1), makeWish(2)], 19, marketplaceOrigin(), read, { local: true, firstPages: first });
    expect(read).toHaveBeenCalledTimes(1); expect(read.mock.calls[0][0]).toContain('wishItemId=1&'); expect(read.mock.calls[0][0]).toContain('cursor=' + cursor);
    expect(result.groups.map(group => group.matches.length)).toEqual([2, 1]); expect(result.groups[0].matches[0].score).toBe(99);
    expect(result.failedWishIds).toEqual([]);
  });
  it('treats a first page whose cursor comes back again as a failed wish, not a complete one', async () => {
    const cursor = uuid();
    const result = await readHomeMatches([makeWish(1)], 19, marketplaceOrigin(), async () => makeMatchPage([makeMatch()], cursor), { local: true, firstPages: new Map([[1, { items: [], nextCursor: cursor }]]) });
    expect(result.failedWishIds).toEqual([1]); expect(result.groups).toEqual([]);
  });
});

describe('complete homepage match pagination', () => {
  it('loads every wish in backend cursor order, not assumed numeric ascending order', async () => {
    const read = vi.fn(async (path: string) => path.includes('cursor=20') ? { items: [makeWish(7)], nextCursor: null } : { items: [makeWish(20)], nextCursor: 20 });
    expect((await readAllMatchWishes(read)).map(wish => wish.id)).toEqual([20, 7]);
    expect(read).toHaveBeenCalledWith('/listings/match-wishes?limit=100&cursor=20');
  });
  it('rejects repeated pages instead of presenting a partial wishlist as complete', async () => {
    await expect(readAllMatchWishes(async () => ({ items: [makeWish()], nextCursor: 1 }))).rejects.toThrow('重複');
  });
  it('ranks across all match pages and excludes own listings', async () => {
    const first = makeMatch(), best = makeMatch(1, makeListing('三國演義 最吻合'), 95), own = makeMatch(1, { ...makeListing(), owner: { id: 19, name: null as unknown as string } }, 100), cursor = uuid();
    const read = vi.fn(async (path: string) => path.includes('cursor=') ? makeMatchPage([best, own]) : makeMatchPage([first], cursor));
    const result = await readHomeMatches([makeWish()], 19, marketplaceOrigin(), read, { local: true });
    expect(result.groups[0].matches.map(match => match.score)).toEqual([95, 80]);
    expect(read.mock.calls.every(([path]) => !path.includes('includeOwnPreview'))).toBe(true);
    expect(read.mock.calls[1][0]).toContain(cursor);
  });
  it('uses at most three workers and preserves original wish order with completion progress', async () => {
    const wishes = Array.from({ length: 8 }, (_, i) => makeWish(i + 1)); let running = 0, maximum = 0;
    const progress = vi.fn();
    const result = await readHomeMatches(wishes, 19, marketplaceOrigin(), async path => {
      maximum = Math.max(maximum, ++running);
      await new Promise(resolve => setTimeout(resolve, 1)); running--;
      return makeMatchPage([makeMatch(Number(new URL('https://example.invalid' + path).searchParams.get('wishItemId')))]);
    }, { local: true, onProgress: progress });
    expect(maximum).toBe(3); expect(result.groups.map(group => group.wish.id)).toEqual(wishes.map(wish => wish.id));
    expect(progress).toHaveBeenLastCalledWith(8, 8);
  });
  it('marks failed wishes separately, including lost later pages and cursor loops', async () => {
    const cursor = uuid();
    const result = await readHomeMatches([makeWish(1), makeWish(2)], 19, marketplaceOrigin(), async path => {
      if (path.includes('wishItemId=1')) return makeMatchPage([makeMatch()], cursor);
      return makeMatchPage([makeMatch(2)]);
    }, { local: true });
    expect(result.failedWishIds).toEqual([1]); expect(result.groups.map(group => group.wish.id)).toEqual([2]);
  });
  it('does not turn cancellation into an empty or partial successful result', async () => {
    const controller = new AbortController();
    await expect(readHomeMatches([makeWish()], 19, marketplaceOrigin(), async () => { controller.abort(); return makeMatchPage([]); }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(readAllMatchWishes(async () => ({ items: [], nextCursor: null }), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
