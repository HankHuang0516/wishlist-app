import {describe,it,expect} from 'vitest';
import {unifiedExternalReferences,externalIndexCurrent} from './unifiedExternalReferences';
import {makeSourceLead} from '../__tests__/fixtures/sourceLead';
import {parseExternalListing} from './externalListingSearch';
import {makeExternalListing} from '../__tests__/fixtures/marketplace';
describe('one external presentation preserves underlying identities',()=>{
 it('keeps distinct goods from a single post and removes only repeated same-type IDs',()=>{
  const first=makeSourceLead(),second={...first,id:'fdbef292-5f1c-44f7-a3f5-f0bda82615a2'},index={...parseExternalListing(makeExternalListing()),id:first.id};
  const rows=unifiedExternalReferences([index,index],[first,second,first]);
  expect(rows).toHaveLength(3);expect(rows.map(r=>r.originalId)).toEqual([first.id,first.id,second.id]);expect(rows.map(r=>r.stockStatus)).toEqual(['UNKNOWN','UNKNOWN','UNKNOWN']);expect(rows[1].canonicalUrl).toBe(rows[2].canonicalUrl);
 });
 it('index expiry is24h while unrelated source rules are not rewritten',()=>{
  const now=Date.now(),item={...makeExternalListing(),observedAt:new Date(now-24*3600000).toISOString(),expiresAt:new Date(now+3600000).toISOString()};
  expect(externalIndexCurrent(item,now)).toBe(true);expect(externalIndexCurrent(item,now+1)).toBe(false);expect(externalIndexCurrent({...item,expiresAt:new Date(now).toISOString()},now)).toBe(false);
 });
});
