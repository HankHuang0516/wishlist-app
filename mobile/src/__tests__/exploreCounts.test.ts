import { describe, expect, it } from 'vitest';
import { parseExploreCounts, isExploreViewportEmpty } from '../exploreCounts';
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

describe('mobile empty viewport admission', () => {
  const empty={loading:false,errors:[],sourceReady:true,sourceCount:0,listingCount:0,hasBounds:true};
  it('permits zero only after every layer succeeds and has no result',()=>expect(isExploreViewportEmpty(empty)).toBe(true));
  it.each([{sourceCount:1},{loading:true},{sourceReady:false},{errors:['source failed']},
    {errors:['listing failed']},{errors:['partner failed']},{listingCount:1},{hasBounds:false}])(
      'does not claim zero with a source, pending or failed read %j', change=>expect(isExploreViewportEmpty({...empty,...change})).toBe(false));
});
