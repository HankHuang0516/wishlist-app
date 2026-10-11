export type ExploreCounts = {
  asOf: string;
  published: { sellerListings: number; sourceReferences: number; partnerListings: number; total: number };
  explorable: { sellerListings: number; sourceReferences: number; partnerListings: number; total: number };
};
export function parseExploreCounts(value: unknown): ExploreCounts {
  const b = value as Record<string, any> | null;
  if (!b || b.schemaVersion !== 1 || b.scope !== 'GLOBAL_PUBLICATION_STATE' || b.stockVerified !== false ||
      typeof b.asOf !== 'string' || !Number.isFinite(Date.parse(b.asOf))) throw Error('全站數量未取得');
  for (const key of ['published', 'explorable']) {
    const c = b[key];
    if (!c || !['sellerListings','sourceReferences','partnerListings','total'].every(k => Number.isSafeInteger(c[k]) && c[k] >= 0) ||
        c.total !== c.sellerListings + c.sourceReferences + c.partnerListings) throw Error('全站數量未取得');
  }
  if (['sellerListings','sourceReferences','partnerListings','total'].some(k => b.explorable[k] > b.published[k])) throw Error('全站數量未取得');
  return { asOf: b.asOf, published: { ...b.published }, explorable: { ...b.explorable } };
}

/** Empty viewport notices must wait for all three layers; a failed read is unknown. */
export function isExploreViewportEmpty(input: {
  loading: boolean; errors: string[]; sourceReady: boolean; sourceCount: number;
  listingCount: number; hasBounds: boolean;
}) {
  return input.hasBounds && !input.loading && input.sourceReady &&
    !input.errors.some(Boolean) && input.sourceCount === 0 && input.listingCount === 0;
}
