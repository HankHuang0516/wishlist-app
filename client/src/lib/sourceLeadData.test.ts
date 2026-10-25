import {describe,it,expect} from 'vitest';
import {parseLead,parseLeadRoom,isLocatedLead,sourceLocationLabel} from './sourceLeadData';
const id='11111111-1111-4111-8111-111111111111',now=()=>new Date().toISOString();
const sample=(count=1)=>({id,kind:'SOURCE_LEAD',title:'合成測試來源商品',summary:'僅供本地測試',canonicalUrl:'https://example.invalid/source/one',county:'臺南市',district:'永康區',publicPlaceName:'公共面交點',publicAddress:'臺南市永康區合成路1號',latitude:23,longitude:120.2,postedEarliestAt:now(),postedLatestAt:now(),checkedAt:now(),stockStatus:'UNKNOWN',qualifiedSupply:false,checkoutEnabled:false,notice:'待確認',publicFacts:null,coordinateSourceUrl:'https://www.openstreetmap.org/node/1',coordinateAttribution:null,media:Array.from({length:count},(_,i)=>{const mid=`22222222-2222-4222-8222-${String(i).padStart(12,'0')}`,path=`https://example.invalid/api/source-leads/${id}/media/${mid}/`;return{id:mid,sourceUrl:'https://example.invalid/source/one',imageUrl:path+'image',thumbnailUrl:path+'thumbnail',alt:'合成角度'+i};})});
describe('source multi-photo contract',()=>{
 it('accepts legacy without completeness claim',()=>expect(parseLead(sample()).media).toHaveLength(1));
 it('accepts ten and all thirty-two, rejects thirty-three rather than trimming',()=>{expect(parseLead(sample(10)).media).toHaveLength(10);expect(parseLead(sample(32)).media).toHaveLength(32);expect(()=>parseLead(sample(33))).toThrow();});
 it('requires source and collected counts to match for complete import',()=>{const raw={...sample(10),photoCompleteness:{status:'IMPORTED_COMPLETE',sourceCount:10,physicalSourceCount:10,importedCount:10,limit:32}};expect(parseLead(raw).photoCompleteness?.status).toBe('IMPORTED_COMPLETE');expect(()=>parseLead({...raw,photoCompleteness:{...raw.photoCompleteness,sourceCount:11}})).toThrow();});
 it('reports explicit unsupported source count without claiming display',()=>{const raw={...sample(),photoCompleteness:{status:'OVER_LIMIT',sourceCount:33,physicalSourceCount:33,importedCount:1,limit:32}};expect(parseLead(raw).photoCompleteness?.status).toBe('OVER_LIMIT');});
 it('rejects duplicated IDs and arbitrary external original-image URLs',()=>{const raw=sample(2);expect(()=>parseLead({...raw,media:[raw.media[0],raw.media[0]]})).toThrow();expect(()=>parseLead({...raw,media:[{...raw.media[0],imageUrl:'https://attacker.invalid/image.jpg'}]})).toThrow();});
});

describe('source location precision',()=>{
 const contact={...sample(0),media:undefined,locationPrecision:'CONTACT_FOR_LOCATION',county:null,district:null,publicPlaceName:null,publicAddress:null,latitude:null,longitude:null,coordinateSourceUrl:null,coordinateAttribution:null};
 it('accepts a record without any area only with every location field null, and labels contact-for-meeting-point',()=>{
  const lead=parseLead(contact);expect(isLocatedLead(lead)).toBe(false);expect(sourceLocationLabel(lead)).toBe('未提供地區，面交地點需聯絡賣家；寄送不受影響');
  for(const patch of [{latitude:23},{county:'臺南市'},{publicAddress:'臺南市某地'},{coordinateSourceUrl:'https://www.openstreetmap.org/node/1'}])expect(()=>parseLead({...contact,...patch})).toThrow();
  expect(()=>parseLead({...contact,locationPrecision:undefined})).toThrow();
 });
 it('accepts a county-only illustration in any county, not only Taipei',()=>{
  const lead=parseLead({...sample(0),media:undefined,locationPrecision:'COUNTY_ILLUSTRATION',county:'臺中市',district:'行政區未明示',publicPlaceName:'臺中市概略示意位置',publicAddress:'臺中市（概略位置，非取貨點）'});
  expect(isLocatedLead(lead)).toBe(true);expect(()=>parseLead({...sample(0),media:undefined,locationPrecision:'COUNTY_ILLUSTRATION',county:'不是縣市',district:'行政區未明示',publicPlaceName:'不是縣市概略示意位置',publicAddress:'不是縣市（概略位置，非取貨點）'})).toThrow();
 });
});

const progressRoom=()=>({id,leadId:id,state:'DELIVERY_REQUIRES_REVIEW',available:true,events:[],transferHash:'a'.repeat(64),routeVerified:true,delivered:false,delivery:null,checkoutEnabled:false,orderCreated:false,notice:'待核查',transferIssue:{code:'FACEBOOK_COMMENT_REJECTED',checkedAt:now(),originalPostUrl:'https://www.facebook.com/groups/123/posts/456'}});
it('rejected progress cannot claim successful delivery or introduce an untrusted source link',()=>{
 const r=progressRoom();expect(parseLeadRoom(r,id).transferIssue?.code).toBe('FACEBOOK_COMMENT_REJECTED');
 for(const patch of [{delivered:true},{state:'DELIVERED'},{transferIssue:{...r.transferIssue,originalPostUrl:'javascript:alert(1)'}},{transferIssue:{...r.transferIssue,originalPostUrl:'https://attacker.invalid/source'}},{transferIssue:{...r.transferIssue,checkedAt:'invalid'}},{transferIssue:{...r.transferIssue,extra:'private'}}])expect(()=>parseLeadRoom({...r,...patch},id)).toThrow();
});


it('Shopee keeps unknown listing dates null and exposes the separately checked observation',()=>{const first=new Date(Date.now()-60000).toISOString().replace(/\.\d{3}Z$/,'Z');const x={...sample(),canonicalUrl:'https://shopee.tw/console-i.195085185.48819403845',locationPrecision:'CONTACT_FOR_LOCATION',county:null,district:null,publicPlaceName:null,publicAddress:null,latitude:null,longitude:null,coordinateSourceUrl:null,coordinateAttribution:null,postedEarliestAt:null,postedLatestAt:null,dateBasis:'FIRST_OBSERVED',firstObservedAt:first,media:[],publicFacts:{priceText:'5500',priceUnitStatus:'SOURCE_STATED',currencyStatus:'TWD',sourceAccessNotice:'來源庫存待確認',originalDateLabel:'刊登日期未提供；首次查核 '+first,locationRelation:'面交待確認',coordinateQualityNotes:[]}};expect(parseLead(x).postedEarliestAt).toBeNull();expect(()=>parseLead({...x,canonicalUrl:'https://www.facebook.com/groups/1/posts/2'})).toThrow();expect(()=>parseLead({...x,dateBasis:undefined,firstObservedAt:undefined})).toThrow();});
