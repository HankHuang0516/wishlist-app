import { describe, expect, it, vi } from 'vitest';
import { readAllMatchWishes, readHomeMatches } from './homeMatches';
import { makeWish, makeMatch, makeMatchPage, makeListing, uuid } from '../__tests__/fixtures/marketplace';
import { marketplaceOrigin } from './marketplaceUrl';

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
