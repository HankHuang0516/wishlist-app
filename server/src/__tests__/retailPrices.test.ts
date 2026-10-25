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

const calculator = {...p,title:'CASIO fx-991CW 工程計算機（二手、功能正常）',mainId:'other',subId:'misc'} as DiscoveryProduct;
test('recognizes exact Dcard footwear size/color and named coffee-machine variant',()=>{
 const shoe={...p,title:'Onitsuka Tiger GYMNARINA 1182A754-020 22.5公分（二手）'};
 expect(retailIdentity(shoe)).toBe('onitsuka:1182a754:020:22.5');
 expect(retailIdentity({...shoe,title:'Onitsuka Tiger 1182A754-020 23cm'})).not.toBe(retailIdentity(shoe));
 expect(retailIdentity({...shoe,title:'Onitsuka Tiger 1182A754-700 22.5cm'})).not.toBe(retailIdentity(shoe));
 expect(retailIdentity({...shoe,title:'Onitsuka Tiger 1182A754-020'})).toBeNull();
 const coffee={...p,title:'NESPRESSO Essenza Mini 純潔白咖啡機（二手）'};
 expect(retailIdentity(coffee)).toBe('nespresso:essenza-mini:純潔白');
 expect(retailIdentity({...coffee,title:'Nespresso Essenza Mini 柔霧白'})).not.toBe(retailIdentity(coffee));
 expect(retailIdentity({...coffee,title:'Nespresso Essenza Mini 純潔白 奶泡機組合'})).toBeNull();
 expect(retailIdentity({...coffee,title:'Nespresso Essenza Mini'})).toBeNull();
});
test('accepts exact official single normal shoe price without inventing an MSRP label',()=>{
 const shoe={...p,title:'Onitsuka Tiger GYMNARINA 1182A754-020 22.5公分（二手）'};
 const body={...input(),productKey:shoe.key,bindingHash:retailBinding(shoe),originalPrice:'4280',priceType:'RETAIL_REGULAR',sourceUrl:'https://www.onitsukatiger.com.tw/SalePage/Index/11775317',sourceProductTitle:'Onitsuka Tiger GYMNARINA 1182A754-020 22.5',evidenceQuote:'Onitsuka Tiger GYMNARINA 1182A754-020 22.5 NT$4,280'};
 expect(Number(retailObservation(body,shoe).originalPrice)).toBe(4280);
 for(const patch of [{originalPrice:'80'},{evidenceQuote:body.evidenceQuote+' 運費 NT$80'},{evidenceQuote:body.evidenceQuote+' 限時優惠'},{sourceUrl:'https://www.momoshop.com.tw/product/1'},{sourceUrl:'https://www.onitsukatiger.com.tw.attacker.invalid/SalePage/Index/11775317'},{priceType:'MANUFACTURER_MSRP'},{sourceProductTitle:'Onitsuka Tiger 1182A754-020 23'}])expect(()=>retailObservation({...body,...patch},shoe)).toThrow();
});
const pchomeCalculatorInput = () => ({...input(),productKey:calculator.key,bindingHash:retailBinding(calculator),originalPrice:'1190',priceType:'RETAIL_REGULAR',sourceUrl:'https://24h.pchome.com.tw/prod/DCBAJI-A900G6O6T',sourceTitle:'CASIO 卡西歐 工程計算機/fX-991CW - PChome 24h購物',sourceProductTitle:'CASIO 卡西歐 工程計算機/fX-991CW',sourcePeriod:null,evidenceQuote:'CASIO 卡西歐 工程計算機/fX-991CW 網路價 $1,190'});
test('accepts exact PChome regular network price and preserves immutable replay',()=>{
 const body=pchomeCalculatorInput();const result=retailObservation(body,calculator);
 expect(Number(result.originalPrice)).toBe(1190);
 expect(result.sourcePeriod).toBeNull();
 expect(result.payloadHash).toBe(retailObservation(body,calculator).payloadHash);
 expect(Number(retailObservation({...body,evidenceQuote:body.evidenceQuote+'；折扣價 $1,130'},calculator).originalPrice)).toBe(1190);
});
test.each([
 {originalPrice:'1130',evidenceQuote:'CASIO fx-991CW 網路價 $1,190；折扣價 $1,130'},
 {evidenceQuote:'CASIO fx-991CW 折扣價 $1,190'},
 {evidenceQuote:'CASIO fx-991CW 促銷網路價 $1,190'},
 {evidenceQuote:'CASIO fx-991CW 券後網路價 $1,190'},
 {evidenceQuote:'CASIO fx-991CW 促銷： 網路價 $1,190'},
 {evidenceQuote:'CASIO fx-991CW 優惠 網路價 $1,190'},
 {sourceUrl:'https://www.momoshop.com.tw/product/1'},
 {sourceUrl:'https://pchome.com.tw.attacker.invalid/prod/1'},
 {priceType:'MANUFACTURER_MSRP'},
 {evidenceQuote:'CASIO fx-991CW 網路價 USD1190'},
 {sourceProductTitle:'CASIO fx-991CW-PK'},
])('keeps PChome price-label support scoped to the exact variant and non-promotion %p',patch=>{
 expect(()=>retailObservation({...pchomeCalculatorInput(),...patch},calculator)).toThrow();
});
