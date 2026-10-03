import { isUuid } from './listingBatch';
import { clipBounds, emptySearchFilters, TAIWAN_BOUNDS, listingSearchPath, parseListingPage, type Bounds, type SearchFilters } from './listingSearch';
import { parseWishMatchPage, wishMatchPath } from './wishData';
import { externalSearchPath, externalWishSearchPath, parseExternalListingPage } from './externalListingSearch';
import { ApiFailure } from './marketplaceApi';
import type { MarketplaceRead } from './homeMatches';

export type ExploreQuery = { filters: SearchFilters; bounds: Bounds; wishId: number | null; radius: string; serial: number };
export function parseExploreIntent(search: string) {
  const params = new URLSearchParams(search), keys = [...params.keys()];
  if (keys.some(key => !['wish', 'listing', 'source', 'q', 'view', 'brand', 'category', 'condition', 'delivery', 'minPrice', 'maxPrice', 'bbox', 'radius'].includes(key)) || new Set(keys).size !== keys.length)
    throw new Error('探索連結參數不正確。');
  const sourceId=params.get('source');if(sourceId!==null&&!isUuid(sourceId))throw new Error('來源連結參數不正確。');
  const rawWish = params.get('wish'), listingId = params.get('listing'), q = (params.get('q') ?? '').trim();
  if (params.has('view') && !['list', 'map'].includes(params.get('view')!)) throw new Error('探索顯示模式不正確。');
  if (q.length > 100 || /[\u0000-\u001f\u007f]/.test(q)) throw new Error('搜尋文字不正確。');
  if (rawWish !== null && (!/^[1-9]\d{0,9}$/.test(rawWish) || Number(rawWish) > 2147483647) || listingId !== null && !isUuid(listingId))
    throw new Error('探索連結參數不正確。');
  if(sourceId!==null&&(listingId!==null||rawWish!==null))throw new Error('來源連結不能混用其他商品條件。');
  return { wishId: rawWish === null ? null : Number(rawWish), listingId, sourceId, q };
}

/** Save public search context only. No account, token, or precise location. */
export function exploreSearchLocation(query: { q: string; wishId: number | null; listMode: boolean; filters?: SearchFilters; bounds?: Bounds; radius?: string }) {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.wishId !== null) params.set('wish', String(query.wishId));
  if (query.listMode) params.set('view', 'list');
  for (const name of ['brand','category','condition','delivery','minPrice','maxPrice'] as const) if (query.filters?.[name]) params.set(name, query.filters[name].trim());
  if (query.bounds) {
    const b=clipBounds(query.bounds); if (!b) throw new Error('搜尋範圍不正確。');
    // Outward 0.01-degree cells retain the area without storing precise GPS.
    params.set('bbox',b.map((n,i)=>(i<2?Math.floor(n*100):Math.ceil(n*100))/100).join(','));
  }
  if (query.radius?.trim()) params.set('radius',query.radius.trim());
  const search=params.toString(); parseExploreSearchState(search ? '?' + search : '');
  return '/explore' + (search ? '?' + search : '');
}
export function parseExploreSearchState(search: string) {
  const intent=parseExploreIntent(search),params=new URLSearchParams(search);
  const filters={...emptySearchFilters,q:intent.q};
  for(const name of ['brand','category','condition','delivery','minPrice','maxPrice'] as const) (filters as Record<string,string>)[name]=params.get(name)??'';
  if(Object.values(filters).some(v=>/[\u0000-\u001f\u007f]/.test(v))) throw new Error('篩選條件不正確。');
  let bounds:Bounds=[...TAIWAN_BOUNDS]; const raw=params.get('bbox');
  if(raw!==null){if(!/^\d+(?:\.\d{1,2})?(?:,\d+(?:\.\d{1,2})?){3}$/.test(raw))throw new Error('搜尋範圍不正確。');const values=raw.split(',').map(Number) as Bounds;const clipped=clipBounds(values);if(!clipped||clipped.some((v,i)=>v!==values[i]))throw new Error('搜尋範圍不正確。');bounds=clipped;}
  const radius=params.get('radius')??'';
  if(radius&&intent.wishId===null)throw new Error('距離條件需要願望。');
  if(intent.wishId)wishMatchPath(intent.wishId,filters,bounds,radius);else listingSearchPath(filters,bounds);
  return {intent,filters,bounds,radius,listMode:params.get('view')==='list'};
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
