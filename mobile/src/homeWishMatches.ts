import { DiscoveryDataError, parseNativeDiscoveryProduct, type DiscoveryProduct } from './discoveryData';

/** One open wish of the account with the public products that match it, best first
 *  (GET /api/discovery/wish-matches; server/src/lib/discovery.ts wishMatchGroups). */
export type HomeWishGroup = {
  wish: { id: number; name: string; maxPrice: number | null; priceCurrency: string | null; wishlist: { id: number; title: string } };
  total: number;
  items: DiscoveryProduct[];
};

const fail = (): never => { throw new DiscoveryDataError(); };
const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0 ? Number(v) : fail();
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max ? v : fail();

export function parseHomeWishMatches(value: unknown, apiUrl: string, allowLocal = false): HomeWishGroup[] {
  const v = value as { complete?: unknown; groups?: unknown };
  if (!v || typeof v !== 'object' || v.complete !== true || !Array.isArray(v.groups) || v.groups.length > 50) fail();
  const seen = new Set<number>();
  return (v.groups as unknown[]).map(raw => {
    const g = (raw ?? fail()) as Record<string, unknown>, w = (g.wish ?? fail()) as Record<string, unknown>, list = (w.wishlist ?? fail()) as Record<string, unknown>;
    const id = positive(w.id);
    if (seen.has(id)) fail();
    seen.add(id);
    const maxPrice = w.maxPrice === null ? null : typeof w.maxPrice === 'number' && Number.isFinite(w.maxPrice) && w.maxPrice >= 0 ? w.maxPrice : fail();
    const total = Number.isSafeInteger(g.total) && Number(g.total) >= 0 ? Number(g.total) : fail();
    if (!Array.isArray(g.items) || g.items.length > 12 || g.items.length > total || (total > 0 && !g.items.length)) fail();
    const items = (g.items as unknown[]).map(item => parseNativeDiscoveryProduct(item, apiUrl, allowLocal));
    // Every product names the wish it was matched for; one of another wish is a broken answer.
    if (items.some(item => item.match?.wishItemId !== id) || new Set(items.map(item => item.key)).size !== items.length) fail();
    return {
      wish: { id, name: text(w.name, 500), maxPrice, priceCurrency: w.priceCurrency === null ? null : text(w.priceCurrency, 12), wishlist: { id: positive(list.id), title: text(list.title, 500) } },
      total, items,
    };
  });
}
