import { describe, expect, it } from 'vitest';
import { parseExploreCounts } from '../exploreCounts';
const raw = {schemaVersion:1,scope:'GLOBAL_PUBLICATION_STATE',stockVerified:false,asOf:'2026-10-11T03:00:00Z',
  published:{sellerListings:3,sourceReferences:82,partnerListings:0,total:85},
  explorable:{sellerListings:0,sourceReferences:0,partnerListings:0,total:0}};
describe('global publication counts', () => {
  it('preserves published totals when no item is currently explorable', () => {
    expect(parseExploreCounts(raw).published.total).toBe(85);
    expect(parseExploreCounts(raw).explorable.total).toBe(0);
  });
  it.each([null,{}, { ...raw,published:{...raw.published,total:0}},
    {...raw,asOf:'unknown'}, {...raw,explorable:{...raw.explorable,sellerListings:4,total:4}},
    {...raw,published:{...raw.published,total:'85'}}, {...raw,stockVerified:true}])('rejects missing/invalid totals instead of defaulting to zero', value => {
      expect(() => parseExploreCounts(value)).toThrow();
  });
});
