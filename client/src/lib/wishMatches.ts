import type { DiscoveryProduct } from './discovery';

/** One open wish of the account with the public products that match it, best first (GET /api/discovery/wish-matches;
 *  server/src/lib/discovery.ts wishMatchGroups). `items` holds the first few, `total` counts them all. */
export type WishMatchGroup = {
  wish: { id: number; name: string; maxPrice: number | null; priceCurrency: string | null; wishlist: { id: number; title: string } };
  total: number;
  items: DiscoveryProduct[];
};

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;

// The same checks the explore page makes of a product (lib/discovery.ts parseDiscovery), plus the wish it matched.
function product(value: unknown, wishId: number): DiscoveryProduct {
  const p = value as DiscoveryProduct;
  if (!p || typeof p !== 'object' || !['listing', 'source', 'external'].includes(p.kind) || typeof p.id !== 'string' || p.key !== p.kind + ':' + p.id
    || typeof p.title !== 'string' || !Array.isArray(p.photos) || (p.price !== null && (!Number.isFinite(p.price) || p.price < 0))
    || !(p.thumbnailUrl === null || typeof p.thumbnailUrl === 'string') || !p.match || p.match.wishItemId !== wishId
    || !Array.isArray(p.match.reasons) || !Number.isFinite(p.match.score)) throw Error('Invalid wish match');
  return p;
}

export function parseWishMatches(value: unknown): WishMatchGroup[] {
  const r = value as { complete?: unknown; groups?: unknown };
  if (!r || r.complete !== true || !Array.isArray(r.groups)) throw Error('Invalid wish matches');
  const seen = new Set<number>();
  return r.groups.map(raw => {
    const g = raw as WishMatchGroup, w = g?.wish;
    if (!w || !integer(w.id) || seen.has(w.id) || !text(w.name, 500) || !(w.maxPrice === null || Number.isFinite(w.maxPrice))
      || !(w.priceCurrency === null || text(w.priceCurrency, 8)) || !w.wishlist || !integer(w.wishlist.id) || !text(w.wishlist.title, 500)
      || !integer(g.total) || !Array.isArray(g.items) || g.items.length > g.total) throw Error('Invalid wish matches');
    seen.add(w.id);
    return { wish: w, total: g.total, items: g.items.map(item => product(item, w.id)) };
  });
}
