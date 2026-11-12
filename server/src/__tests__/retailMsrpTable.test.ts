import { retailMsrpTable, msrpReference, msrpTableHash, msrpFamilyWord } from '../lib/retailMsrpTable';
import { normalizeWish } from '../lib/wishlistMatch';
import { RETAIL_MSRP_ROWS } from '../lib/retailMsrpTableData';
import { retailIdentity, retailBinding } from '../lib/retailPrices';
import type { DiscoveryProduct } from '../lib/discovery';

const product = (title: string, extra: Partial<DiscoveryProduct> = {}): DiscoveryProduct => ({ key: 'source:0f9d2c9e-4a7b-4c2d-9e1f-3b5a7c9d1e2f', title, description: '二手，功能正常', price: 12000, currency: 'TWD', priceUnitVerified: true, condition: 'USED', mainId: 'electronics', subId: 'phones', kind: 'source', cpAllowed: true, ...extra } as unknown as DiscoveryProduct);

test('every table row is accepted and keyed once', () => {
  expect(retailMsrpTable.size).toBe(RETAIL_MSRP_ROWS.length);
  expect(new Set(RETAIL_MSRP_ROWS.map(r => r.identity)).size).toBe(RETAIL_MSRP_ROWS.length);
  for (const row of RETAIL_MSRP_ROWS) {
    expect(row.sourceUrl).toMatch(/^https:\/\/www\.apple\.com\/tw\//);
    expect(row.evidenceQuote.replace(/,/g, '')).toContain(String(row.price));
    expect(row.sourcePeriod).toMatch(/^\d{4}-\d{2}$/);
  }
});

test('each row names a product whose title yields the row identity under the server rule', () => {
  for (const row of RETAIL_MSRP_ROWS) {
    const [mainId, subId] = row.identity.startsWith('apple:macbook') ? ['electronics', 'laptops'] : row.identity.startsWith('apple:ipad') ? ['electronics', 'tablets'] : row.identity.startsWith('apple:airpods') ? ['electronics', 'audio'] : ['electronics', 'phones'];
    expect({ identity: retailIdentity({ title: row.sourceProductTitle, mainId, subId }), title: row.sourceProductTitle }).toEqual({ identity: row.identity, title: row.sourceProductTitle });
  }
});

test('iPhone 16e and 17e are their own line, not the base model at another price', () => {
  expect(retailIdentity({ title: 'iPhone 16e 128GB 白色（二手）', mainId: 'electronics', subId: 'phones' })).toBe('iphone:16:e:128gb');
  expect(retailIdentity({ title: 'Apple iPhone 16 128GB 黑', mainId: 'electronics', subId: 'phones' })).toBe('iphone:16:base:128gb');
  expect(retailIdentity({ title: 'iPhone 17e 256GB Soft', mainId: 'electronics', subId: 'phones' })).toBe('iphone:17:e:256gb');
  expect(retailIdentity({ title: 'iPhone 17 Pro Max 512GB 宇宙橙', mainId: 'electronics', subId: 'phones' })).toBe('iphone:17:promax:512gb');
  expect(retailMsrpTable.row('iphone:16:e:128gb')?.price).toBe(21900);
  // a 64GB capacity is not a 4G radio
  expect(retailIdentity({ title: 'iPad mini 6 64GB WiFi 太空灰（二手）', mainId: 'electronics', subId: 'tablets' })).toBe('apple:ipad-mini:6:wifi:64gb');
  expect(retailIdentity({ title: 'iPad mini 6 64GB LTE 太空灰', mainId: 'electronics', subId: 'tablets' })).toBe('apple:ipad-mini:6:cellular:64gb');
  expect(retailIdentity({ title: 'iPad Air 4 10.9吋 64GB WiFi', mainId: 'electronics', subId: 'tablets' })).toBe('apple:ipad-air:4:wifi:64gb');
  expect(retailMsrpTable.row('iphone:16:base:128gb')?.price).toBe(29900);
});

test('a product whose identity is in the table gets a stable manufacturer reference', () => {
  const p = product('iPhone 15 Pro 128GB 白色鈦金屬 電池100%（二手）');
  const identity = retailIdentity(p);
  expect(identity).toBe('iphone:15:pro:128gb');
  const ref = msrpReference(p, identity, retailBinding(p));
  expect(ref).toMatchObject({ productKey: p.key, identity: 'iphone:15:pro:128gb', price: 36900, currency: 'TWD', priceType: 'MANUFACTURER_MSRP', sourcePeriod: '2023-09' });
  expect(ref!.sourceUrl).toContain('apple.com/tw/newsroom/2023/09/');
  expect(ref!.key).toBe('retail:' + ref!.id);
  expect(ref!.checkedAt).toBe(retailMsrpTable.verifiedAt);
  // the same product asked twice yields the same reference, so a CP evaluation keyed on it stays valid
  expect(JSON.stringify(msrpReference(p, identity, retailBinding(p)))).toBe(JSON.stringify(ref));
  expect(msrpReference(product('Sony WH-1000XM5 二手', { subId: 'audio' }), 'electronics:audio:wh1000xm5', 'x')).toBeNull();
  expect(msrpReference(p, null, retailBinding(p))).toBeNull();
  expect(msrpTableHash()).toMatch(/^[0-9a-f]{64}$/);
});

test('every table identity belongs to a family whose word its product title must hold, so the retail order can skip the rest', () => {
  for (const identity of retailMsrpTable.identities()) expect({ identity, word: msrpFamilyWord(identity) }).toEqual({ identity, word: expect.any(String) });
  expect(retailMsrpTable.titleWords()?.sort()).toEqual(['airpods', 'ipad', 'iphone', 'macbook', 'watch']);
  for (const row of RETAIL_MSRP_ROWS) expect(normalizeWish(row.sourceProductTitle)).toContain(msrpFamilyWord(row.identity));
  // A title that spells the family with other characters in between still reaches the catalogue search text as the word.
  expect(normalizeWish('ＩＰＨＯＮＥ 15 128GB')).toContain('iphone');
  expect(msrpFamilyWord('sony:camera:a7')).toBeNull();
});
