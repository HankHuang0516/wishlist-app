import { isUuid } from './listingBatch';
import { listingSearchPath, parseListingPage, type Bounds, type SearchFilters } from './listingSearch';
import { parseWishMatchPage, wishMatchPath } from './wishData';
import { externalSearchPath, externalWishSearchPath, parseExternalListingPage } from './externalListingSearch';
import { ApiFailure } from './marketplaceApi';
import type { MarketplaceRead } from './homeMatches';

export type ExploreQuery = { filters: SearchFilters; bounds: Bounds; wishId: number | null; radius: string; serial: number };
export function parseExploreIntent(search: string) {
  const params = new URLSearchParams(search), keys = [...params.keys()];
  if (keys.some(key => !['wish', 'listing'].includes(key)) || new Set(keys).size !== keys.length)
    throw new Error('探索連結參數不正確。');
  const rawWish = params.get('wish'), listingId = params.get('listing');
  if (rawWish !== null && (!/^[1-9]\d{0,9}$/.test(rawWish) || Number(rawWish) > 2147483647) || listingId !== null && !isUuid(listingId))
    throw new Error('探索連結參數不正確。');
  return { wishId: rawWish === null ? null : Number(rawWish), listingId };
}
export function exploreSellerPath(query: ExploreQuery, cursor?: string) {
  if (cursor && !isUuid(cursor)) throw new Error('商品分頁識別碼不正確。');
  return query.wishId ? wishMatchPath(query.wishId, query.filters, query.bounds, query.radius, true) + (cursor ? '&cursor=' + cursor : '')
    : listingSearchPath(query.filters, query.bounds, cursor);
}
export async function readExploreSeller(query: ExploreQuery, read: MarketplaceRead, origin: string, local = false, cursor?: string) {
  const response = await read(exploreSellerPath(query, cursor));
  if (query.wishId) {
    const page = parseWishMatchPage(response, query.wishId, origin, local);
    return { items: page.items.map(match => match.listing), matches: page.items, nextCursor: page.nextCursor, notice: page.notice };
  }
  const page = parseListingPage(response, origin, local);
  return { ...page, matches: [], notice: '' };
}
export function exploreExternalPath(query: ExploreQuery, cursor?: string) {
  if (cursor && !isUuid(cursor)) throw new Error('外部商品分頁識別碼不正確。');
  const path = query.wishId ? externalWishSearchPath(query.wishId, query.filters, query.bounds, query.radius)
    : externalSearchPath(query.filters, query.bounds);
  return path ? path + (cursor ? '&cursor=' + cursor : '') : null;
}
export async function readExploreExternal(query: ExploreQuery, read: MarketplaceRead, cursor?: string) {
  const path = exploreExternalPath(query, cursor);
  if (!path) return { enabled: false, skipped: true, items: [], nextCursor: null };
  try { return { ...parseExternalListingPage(await read(path)), skipped: false }; }
  catch (error) {
    // Same rollout compatibility as APP: absent optional external route is disabled, not fabricated supply.
    if (error instanceof ApiFailure && error.status === 404 && !query.wishId) return { enabled: false, skipped: false, items: [], nextCursor: null };
    throw error;
  }
}
