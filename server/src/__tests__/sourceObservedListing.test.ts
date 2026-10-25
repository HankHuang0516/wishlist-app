import { parseRecordFacts, parseRecordPublication } from '../lib/sourceLeadRecords';
import { digest, leadCurrent, leadDTO } from '../lib/sourceLeadRules';
const now = new Date('2026-10-25T08:30:00Z');
const id = 'SP195085185-48819403845-01';
const url = 'https://shopee.tw/console-i.195085185.48819403845';
const first = '2026-10-25T08:25:00Z';
const facts = () => ({canonicalUrl:url,title:'Nintendo Switch OLED 白色 二手主機',summary:'蝦皮二手商品，庫存與交易待確認。',county:null,district:null,publicPlaceName:null,publicAddress:null,latitude:null,longitude:null,postedEarliestAt:null,postedLatestAt:null,checkedAt:'2026-10-25T08:29:00Z',evidence:{sourceUrl:url,sourcePublic:true,publicSourceRef:'source:shopee-item/195085185.48819403845',dateRef:'source:shopee-first-observed/195085185.48819403845',publicPlace:false,locationType:'SELLER_CONTACT_REQUIRED',sourceMeetingPointConfirmed:false,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,sourceCheckRef:'source:shopee-check/item',observedListing:{provider:'SHOPEE',shopId:'195085185',itemId:'48819403845',firstObservedAt:first,availability:'VISIBLE_PURCHASE_CONTROL'},publicFacts:{priceText:'5500',priceUnitStatus:'SOURCE_STATED',currencyStatus:'TWD',sourceAccessNotice:'蝦皮來源，庫存未確認。',originalDateLabel:'刊登日期未提供；首次查核 '+first,locationRelation:'面交地點待確認。',coordinateQualityNotes:[]}}});
const row = (f:any=facts(),archiveItemId=id) => {const draft=parseRecordFacts(f,now);return {id:'11111111-1111-4111-8111-111111111111',archiveItemId,status:'PRIVATE_PENDING',recordOrigin:'DB_MASTER',recordRevision:1,sourceClaimState:'UNKNOWN',pendingFacts:draft,pendingHash:digest(draft),libraryFileId:null,archiveVersion:null,archiveSha256:null,evidence:{}} as any;};
test('publishes an explicitly observed Shopee page without inventing posted dates',()=>{const r=row(),parsed=parseRecordPublication(r,'review:shopee-capture',now);expect(parsed.postedEarliestAt).toBeNull();expect(parsed.postedLatestAt).toBeNull();const published={...r,...parsed,status:'PUBLISHED'};expect(leadCurrent(published,now)).toBe(true);expect(leadDTO(published)).toMatchObject({postedEarliestAt:null,postedLatestAt:null,dateBasis:'FIRST_OBSERVED',firstObservedAt:first});});
test('observation cannot substitute for Facebook, another item, unknown availability, or future evidence',()=>{const f:any=facts();for(const invalid of [
 {...f,canonicalUrl:'https://www.facebook.com/groups/1/posts/2',evidence:{...f.evidence,sourceUrl:'https://www.facebook.com/groups/1/posts/2'}},
 {...f,canonicalUrl:'https://shopee.tw/console-i.195085185.48819403846'},
 {...f,postedEarliestAt:first,postedLatestAt:first},
 {...f,evidence:{...f.evidence,observedListing:{...f.evidence.observedListing,availability:'UNKNOWN'}}},
 {...f,evidence:{...f.evidence,observedListing:{...f.evidence.observedListing,firstObservedAt:'2026-10-26T08:25:00Z'}}},
 {...f,evidence:{...f.evidence,publicFacts:{...f.evidence.publicFacts,originalDateLabel:'今天上架'}}},
 ])expect(()=>row(invalid)).toThrow();expect(()=>parseRecordPublication(row(f,'SP195085185-48819403846-01'),'review:wrong-item',now)).toThrow('BOUND_SHOPEE_OBSERVATION_REQUIRED');});
test('missing dates on other sources still fail; sold Shopee cannot republish',()=>{const f:any=facts();delete f.evidence.observedListing;expect(()=>parseRecordPublication(row(f),'review:missing-dates',now)).toThrow('ORIGINAL_DATE_REQUIRED');expect(()=>parseRecordPublication(row({...facts(),sourceClaimState:'SOLD',stateEvidenceRef:'source:sold'}),'review:sold',now)).toThrow('SOURCE_NOT_AVAILABLE');});
