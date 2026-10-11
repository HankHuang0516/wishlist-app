import {officialAuctionUrl,parseOfficialAuction} from '../lib/sourceAuctionDate';
const url='https://recycledstuff.ntpc.gov.tw/Product/Detail/00000000-0000-4000-8000-000000000001';
const ref='source:auction-period-fixture';
const now=new Date('2026-10-11T04:00:00Z');
const fixture=()=>({sourceType:'OFFICIAL_AUCTION',dateBasis:'ACTIVE_AUCTION_WINDOW',originalPublishedAt:null,priceType:'STARTING_BID',authorityRef:'source:official-authority-fixture',activeAuctionWindow:{startsAt:'2026-10-11T02:00:00Z',endsAt:'2026-11-10T02:00:00Z',timeZone:'Asia/Taipei',sourceUrl:url,periodRef:ref}});
describe('official auction evidence basis, without inventing a publication date',()=>{
 test('accepts only an active bound official item window and leaves original date unknown',()=>expect(parseOfficialAuction(fixture(),url,ref,now)).toEqual({sourceType:'OFFICIAL_AUCTION',dateBasis:'ACTIVE_AUCTION_WINDOW',originalPublishedAt:null,priceType:'STARTING_BID',activeAuctionWindow:{startsAt:'2026-10-11T02:00:00Z',endsAt:'2026-11-10T02:00:00Z',timeZone:'Asia/Taipei'}}));
 test.each(['https://www.facebook.com/groups/123/posts/456','https://example.gov.tw/Product/Detail/00000000-0000-4000-8000-000000000001',url+'?x=1',url+'#x',url.replace('recycledstuff.ntpc.gov.tw','recycledstuff.ntpc.gov.tw.example.com'),url.replace('/Product/Detail/','/Other/')])('rejects unreviewed or modified route %s',bad=>expect(()=>officialAuctionUrl(bad)).toThrow());
 test.each([
  {originalPublishedAt:'2026-10-11T02:00:00Z'},
  {priceType:'FIXED_PRICE'},
  {dateBasis:'ORIGINAL_PUBLISHED_AT'},
  {authorityRef:'untyped'},
  {unexpected:'field'},
 ])('rejects altered metadata %j',patch=>expect(()=>parseOfficialAuction({...fixture(),...patch},url,ref,now)).toThrow());
 test.each([
  {startsAt:'2026-10-12T02:00:00Z'},
  {endsAt:'2026-10-11T04:00:00Z'},
  {startsAt:'2026-11-11T02:00:00Z'},
  {timeZone:'UTC'},
  {sourceUrl:url.replace(/1$/,'2')},
  {periodRef:'source:other-evidence'},
  {startsAt:'2026-02-30T02:00:00Z'},
  {startsAt:'2026-10-11 02:00:00'},
  {unexpected:'field'},
 ])('rejects inactive, invalid or unbound window %j',patch=>expect(()=>parseOfficialAuction({...fixture(),activeAuctionWindow:{...fixture().activeAuctionWindow,...patch}},url,ref,now)).toThrow());
 test('checks the active period boundary without interpreting it as stock or rights',()=>{expect(()=>parseOfficialAuction(fixture(),url,ref,new Date('2026-11-10T02:00:00Z'))).toThrow();expect(parseOfficialAuction(fixture(),url,ref,new Date('2026-10-11T02:00:00Z')).originalPublishedAt).toBeNull();});
});
