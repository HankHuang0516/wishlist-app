import { emptySearchFilters, TAIWAN_BOUNDS } from './listingSearch';
import { parseHomeMatches, parseMatchWishes, parseWishMatchPage, rankHomeMatches, wishMatchPath,
  type MatchWish, type WishMatch } from './wishData';

export type MarketplaceRead = (path: string) => Promise<unknown>;
export type MatchGroup = { wish: MatchWish; matches: WishMatch[] };
/** The first page of a wish's matches, as the home read returns it; `nextCursor` names the page after it. */
export type FirstPage = { items: WishMatch[]; nextCursor: string | null };
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('已取消', 'AbortError'); };

/** Reads every page of a wish list, refusing repeats and cursors that do not advance. */
async function readWishPages<T>(read: (cursor: number | null) => Promise<{ items: T[]; nextCursor: number | null }>, wishOf: (item: T) => MatchWish, signal?: AbortSignal) {
  const items: T[] = [], seen = new Set<number>(), cursors = new Set<number>();
  let cursor: number | null = null, pages = 0;
  do {
    cancelled(signal);
    if (++pages > 1000) throw new Error('願望分頁超過安全範圍，清單尚未讀完。');
    const page = await read(cursor);
    cancelled(signal);
    for (const item of page.items) {
      const wish = wishOf(item);
      if (seen.has(wish.id)) throw new Error('願望分頁重複，清單尚未讀完。');
      seen.add(wish.id); items.push(item);
    }
    if (page.nextCursor !== null && cursors.has(page.nextCursor))
      throw new Error('願望分頁未前進。');
    if (page.nextCursor !== null) cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return items;
}

export function readAllMatchWishes(read: MarketplaceRead, signal?: AbortSignal): Promise<MatchWish[]> {
  return readWishPages(async cursor => parseMatchWishes(await read('/listings/match-wishes?limit=100' + (cursor ? '&cursor=' + cursor : ''))), wish => wish, signal);
}

/** The home page in one read per 100 wishes: every wish with the first page of its matches. */
export async function readHomeOverview(read: MarketplaceRead, apiUrl: string, options: { local?: boolean; signal?: AbortSignal } = {}) {
  const groups = await readWishPages(async cursor => {
    const page = parseHomeMatches(await read('/listings/home-matches?limit=100' + (cursor ? '&cursor=' + cursor : '')), apiUrl, options.local);
    return { items: page.groups, nextCursor: page.nextCursor };
  }, group => group.wish, options.signal);
  return { wishes: groups.map(group => group.wish), firstPages: new Map<number, FirstPage>(groups.map(group => [group.wish.id, group.page])) };
}

/** Finish every candidate page before ranking; at most three simultaneous wishes. A wish whose first page is already
 * at hand (`firstPages`) is read from its second page on, so most wishes cost no request here. */
export async function readHomeMatches(wishes: MatchWish[], userId: number, apiUrl: string,
  read: MarketplaceRead, options: { local?: boolean; signal?: AbortSignal; firstPages?: Map<number, FirstPage>;
    onProgress?: (finished: number, total: number) => void } = {}) {
  const results = new Map<number, MatchGroup>(), failedWishIds: number[] = [];
  let index = 0, finished = 0;
  async function worker() {
    while (index < wishes.length) {
      cancelled(options.signal);
      const wish = wishes[index++], first = options.firstPages?.get(wish.id), all: WishMatch[] = [...first?.items ?? []], cursors = new Set<string>();
      let cursor: string | null = first?.nextCursor ?? null, pending = !first, pages = 0;
      if (cursor) cursors.add(cursor);
      try {
        while (pending || cursor) {
          cancelled(options.signal);
          if (++pages > 1000) throw new Error('配對分頁超過安全範圍。');
          const path = wishMatchPath(wish.id, emptySearchFilters, TAIWAN_BOUNDS) +
            (cursor ? '&cursor=' + cursor : '');
          const page = parseWishMatchPage(await read(path), wish.id, apiUrl, options.local);
          cancelled(options.signal);
          all.push(...page.items); cursor = page.nextCursor; pending = false;
          if (cursor && cursors.has(cursor)) throw new Error('配對分頁未前進。');
          if (cursor) cursors.add(cursor);
        }
        results.set(wish.id, { wish, matches: rankHomeMatches(all, userId) });
      } catch {
        cancelled(options.signal);
        failedWishIds.push(wish.id);
      }
      cancelled(options.signal);
      options.onProgress?.(++finished, wishes.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, wishes.length) }, worker));
  cancelled(options.signal);
  return { groups: wishes.flatMap(wish => results.has(wish.id) ? [results.get(wish.id)!] : []), failedWishIds };
}
