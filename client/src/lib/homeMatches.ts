import { emptySearchFilters, TAIWAN_BOUNDS } from './listingSearch';
import { parseMatchWishes, parseWishMatchPage, rankHomeMatches, wishMatchPath,
  type MatchWish, type WishMatch } from './wishData';

export type MarketplaceRead = (path: string) => Promise<unknown>;
export type MatchGroup = { wish: MatchWish; matches: WishMatch[] };
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('已取消', 'AbortError'); };

export async function readAllMatchWishes(read: MarketplaceRead, signal?: AbortSignal): Promise<MatchWish[]> {
  const items: MatchWish[] = [], seen = new Set<number>(), cursors = new Set<number>();
  let cursor: number | null = null, pages = 0;
  do {
    cancelled(signal);
    if (++pages > 1000) throw new Error('願望分頁超過安全範圍，清單尚未讀完。');
    const page = parseMatchWishes(await read('/listings/match-wishes?limit=100' + (cursor ? '&cursor=' + cursor : '')));
    cancelled(signal);
    for (const wish of page.items) {
      if (seen.has(wish.id)) throw new Error('願望分頁重複，清單尚未讀完。');
      seen.add(wish.id); items.push(wish);
    }
    if (page.nextCursor !== null && cursors.has(page.nextCursor))
      throw new Error('願望分頁未前進。');
    if (page.nextCursor !== null) cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return items;
}

/** Finish every candidate page before ranking; at most three simultaneous wishes. */
export async function readHomeMatches(wishes: MatchWish[], userId: number, apiUrl: string,
  read: MarketplaceRead, options: { local?: boolean; signal?: AbortSignal;
    onProgress?: (finished: number, total: number) => void } = {}) {
  const results = new Map<number, MatchGroup>(), failedWishIds: number[] = [];
  let index = 0, finished = 0;
  async function worker() {
    while (index < wishes.length) {
      cancelled(options.signal);
      const wish = wishes[index++], all: WishMatch[] = [], cursors = new Set<string>();
      let cursor: string | null = null, pages = 0;
      try {
        do {
          cancelled(options.signal);
          if (++pages > 1000) throw new Error('配對分頁超過安全範圍。');
          const path = wishMatchPath(wish.id, emptySearchFilters, TAIWAN_BOUNDS) +
            (cursor ? '&cursor=' + cursor : '');
          const page = parseWishMatchPage(await read(path), wish.id, apiUrl, options.local);
          cancelled(options.signal);
          all.push(...page.items); cursor = page.nextCursor;
          if (cursor && cursors.has(cursor)) throw new Error('配對分頁未前進。');
          if (cursor) cursors.add(cursor);
        } while (cursor);
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
