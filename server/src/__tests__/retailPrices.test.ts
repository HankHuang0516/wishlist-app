import {randomUUID} from 'crypto';
import {retailObservation,retailBinding,retailIdentity} from '../lib/retailPrices';
import type {DiscoveryProduct} from '../lib/discovery';
const p={key:'source:'+randomUUID(),title:'Samsung Galaxy Buds3 全新未拆',description:'public facts',mainId:'electronics',subId:'audio'} as DiscoveryProduct;
const input=()=>({requestId:randomUUID(),productKey:p.key,bindingHash:retailBinding(p),status:'VERIFIED',originalPrice:'4990',currency:'TWD',priceType:'MANUFACTURER_MSRP',sourceUrl:'https://images.samsung.com/is/content/samsung/assets/tw/downloads/2025-ses-apr-event-guidelines.pdf',sourceTitle:'Samsung original price evidence',sourceProductTitle:'Samsung Galaxy Buds3',sourcePeriod:'2025-04',evidenceQuote:'Galaxy Buds3 建議售價 NT$4,990',checkedAt:new Date().toISOString()});
test('records a verifiable original-new price separately from asking price',()=>{const r=retailObservation(input(),p);expect(Number(r.originalPrice)).toBe(4990);expect(r.identity).toBe(retailIdentity(p));expect(r.sourcePeriod).toBe('2025-04');expect(r.status).toBe('VERIFIED');});
test.each([{originalPrice:'990'},{currency:'JPY'},{sourceProductTitle:'Samsung Galaxy Buds3 Pro'},{evidenceQuote:'Samsung Galaxy Buds3 Pro 建議售價 NT$4,990'},{sourceUrl:'http://www.samsung.com/tw'},{sourceUrl:'https://samsung.com.attacker.invalid/'},{sourceUrl:'https://127.0.0.1/'},{bindingHash:'wrong'},{checkedAt:'2038-01-01T00:00:00Z'}])('rejects promotional, mismatched, stale or unsafe source data %p',patch=>expect(()=>retailObservation({...input(),...patch},p)).toThrow());
test('does not invent prices when no exact reference was found and binds immutable requests',()=>{const i={requestId:randomUUID(),productKey:p.key,bindingHash:retailBinding(p),status:'NOT_FOUND',checkedAt:new Date().toISOString(),notes:'Checked official sources; exact original price not found.'};const r=retailObservation(i,p);expect(r.originalPrice).toBeNull();expect(r.sourceUrl).toBeNull();expect(retailObservation(i,p).payloadHash).toBe(r.payloadHash);expect(()=>retailObservation({...i,originalPrice:'4990'},p)).toThrow();});

 test('recognizes a publisher-marked book title and Lego set without confusing volume or set',()=>{
  const book={...p,title:'二手童書繪本《存回去賺更多》',mainId:'books',subId:'children'};
  expect(retailIdentity(book)).toBe('book:title:存回去賺更多');
  expect(retailIdentity({...book,title:'存回去賺更多 … 定價 380 元'})).toBe(retailIdentity(book));
  const comic={...book,title:'二手 漫畫版 三國演義 1 (南門書局)',subId:'comics'};
  expect(retailIdentity({...comic,title:'四大名著漫畫版：三國演義01'})).toBe(retailIdentity(comic));
  expect(retailIdentity({...comic,title:'四大名著漫畫版：三國演義02'})).not.toBe(retailIdentity(comic));
  expect(retailIdentity({...p,title:'LEGO 21318 樹屋'})).toBe('lego:set:21318');
  expect(retailIdentity({...p,title:'LEGO 21319'})).not.toBe('lego:set:21318');
 });
 test('accepts Taiwanese original-price suffix and market-list label, never a promotional amount',()=>{
  const body={...input(),priceType:'RETAIL_REGULAR',sourceUrl:'https://www.momoshop.com.tw/product/1',evidenceQuote:'Galaxy Buds3 市售價 4,990 元；促銷價 990 元'};
  expect(Number(retailObservation(body,p).originalPrice)).toBe(4990);
  expect(()=>retailObservation({...body,originalPrice:'990'},p)).toThrow();
  expect(()=>retailObservation({...body,evidenceQuote:'Galaxy Buds3 市售價 SGD 4990'},p)).toThrow();
 });
 test('normalizes punctuation in exact shoe model and excludes phone accessories',()=>{
  const shoe={...p,mainId:'fashion',subId:'shoes',title:'Nike CK6357006'};
  expect(retailIdentity({...shoe,title:'Nike CK6357-006'})).toBe(retailIdentity(shoe));
  expect(retailIdentity({...p,title:'iPhone 15 256GB 手機殼'})).toBeNull();
 });
