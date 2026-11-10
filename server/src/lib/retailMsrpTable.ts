import { discoveryHash, type DiscoveryProduct } from './discovery';
import { RETAIL_MSRP_ROWS, RETAIL_MSRP_TABLE_VERSION, RETAIL_MSRP_VERIFIED_AT, type RetailMsrpRow } from './retailMsrpTableData';
import type { RetailReference } from './retailPrices';

// Hank 2026-11-10: discontinued Apple models (iPhone 15 and older, earlier AirPods and iPad mini generations) have no
// new-retail product page left to quote, so every lookup ended NOT_FOUND. This table carries the manufacturer's own
// price per identity, read from Apple Taiwan's store or launch article; a product whose identity is in the table gets a
// MANUFACTURER_MSRP reference without an observation. A verified observation for the product itself always wins.
const PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/;

function valid(row: RetailMsrpRow): boolean {
    let url: URL;
    try { url = new URL(row.sourceUrl); } catch { return false; }
    const apple = url.protocol === 'https:' && (url.hostname === 'apple.com' || url.hostname.endsWith('.apple.com'));
    return apple && /^[a-z][a-z0-9-]*(?::[a-z0-9.-]+)+$/.test(row.identity) && Number.isInteger(row.price) && row.price > 0
        && PERIOD.test(row.sourcePeriod) && [row.sourceTitle, row.sourceProductTitle, row.evidenceQuote].every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 350)
        && row.evidenceQuote.replace(/,/g, '').includes(String(row.price));
}

const TABLE = new Map<string, RetailMsrpRow>();
for (const row of RETAIL_MSRP_ROWS) if (valid(row) && !TABLE.has(row.identity)) TABLE.set(row.identity, row);

export const retailMsrpTable = {
    version: RETAIL_MSRP_TABLE_VERSION,
    verifiedAt: RETAIL_MSRP_VERIFIED_AT,
    size: TABLE.size,
    rows: RETAIL_MSRP_ROWS.length,
    has: (identity: string | null | undefined) => !!identity && TABLE.has(identity),
    row: (identity: string | null | undefined) => (identity ? TABLE.get(identity) ?? null : null),
    identities: () => [...TABLE.keys()],
};

// The reference carries the table version in its key and the table's verification time as checkedAt, so its hash is
// stable across requests and a CP evaluation built on it stays valid until the table changes.
export function msrpReference(p: DiscoveryProduct, identity: string | null, bindingHash: string): RetailReference | null {
    const row = identity ? TABLE.get(identity) : undefined;
    if (!row) return null;
    const id = `msrp-${RETAIL_MSRP_TABLE_VERSION}-${identity!.replace(/[^a-z0-9]+/g, '-')}`;
    return {
        id, key: `retail:${id}`, productKey: p.key, bindingHash, identity: identity!, price: row.price, currency: 'TWD', priceType: 'MANUFACTURER_MSRP',
        sourceUrl: row.sourceUrl, sourceTitle: row.sourceTitle, sourceProductTitle: row.sourceProductTitle, evidenceQuote: row.evidenceQuote, sourcePeriod: row.sourcePeriod,
        checkedAt: RETAIL_MSRP_VERIFIED_AT,
    };
}

export const msrpTableHash = () => discoveryHash({ version: RETAIL_MSRP_TABLE_VERSION, rows: [...TABLE.values()] });
