import { discoveryHash } from '../lib/discovery';
import { retailObservationMatches } from '../lib/retailPrices';
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
test('accepts real short Panasonic EH models while retaining exact variants and price evidence',()=>{
 const beauty={...p,title:'Panasonic EH-SR86 日本製美容儀（二手，賣家稱功能正常）',mainId:'beauty',subId:'devices'} as DiscoveryProduct;
 expect(retailIdentity(beauty)).toBe('panasonic:eh-model:ehsr86');
 const body={...input(),productKey:beauty.key,bindingHash:retailBinding(beauty),originalPrice:'26000',priceType:'RETAIL_REGULAR',sourceUrl:'https://www.momoshop.com.tw/TP/TP0009010/goodsDetail/TP00090100000199',sourceTitle:'Panasonic VITALIFT EH-SR86',sourceProductTitle:'Panasonic 國際牌VITALIFT EH-SR86 2024款 終極一隻 附凝膠',evidenceQuote:'Panasonic VITALIFT EH-SR86 附凝膠 市售價26,000元',sourcePeriod:null};
 expect(Number(retailObservation(body,beauty).originalPrice)).toBe(26000);
 expect(retailIdentity({...beauty,title:'國際牌 eh-sr86 美容儀'})).toBe(retailIdentity(beauty));
 for(const title of ['Panasonic EH-SR85','Panasonic EH-SR86-T','Panasonic EH-SR86K','Panasonic EH-SR860']) {
  expect(retailIdentity({...beauty,title})).not.toBe(retailIdentity(beauty));
  expect(()=>retailObservation({...body,sourceProductTitle:title},beauty)).toThrow();
 }
 expect(retailIdentity({...beauty,title:'無品牌 EH-SR86'})).not.toBe(retailIdentity(beauty));
 expect(()=>retailObservation({...body,evidenceQuote:'Panasonic EH-SR85 市售價26,000元'},beauty)).toThrow();
 expect(()=>retailObservation({...body,evidenceQuote:'Panasonic EH-SR86 促銷價17,577元',originalPrice:'17577'},beauty)).toThrow();
});
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

const ipad={...p,title:'Apple iPad 7 10.2吋 128GB Wi-Fi 太空灰 二手 C級'};
test('binds seventh-generation iPad capacity and connectivity across retailer spellings',()=>{
 expect(retailIdentity(ipad)).toBe('ipad:7:wifi:128gb');
 expect(retailIdentity({...ipad,title:'Apple iPad 10.2 7代 wifi (128G)'})).toBe(retailIdentity(ipad));
 for(const title of ['iPad 7 32GB Wi-Fi','iPad 7 128GB Wi-Fi LTE','iPad Air 7 128GB Wi-Fi','iPad 8 128GB Wi-Fi'])expect(retailIdentity({...ipad,title})).not.toBe(retailIdentity(ipad));
 expect(retailIdentity({...ipad,title:'iPad 7 128GB'})).toBeNull();
});
const ipadInput=()=>({...input(),productKey:ipad.key,bindingHash:retailBinding(ipad),originalPrice:'13900',priceType:'RETAIL_REGULAR',sourceUrl:'https://www.jyes.com.tw/product/APPLE平板-iPad-10-2-wifi-128GB',sourceTitle:'傑昇通信商品頁',sourceProductTitle:'Apple iPad 10.2 7代 wifi (128G)',sourcePeriod:'2026-04-24',evidenceQuote:'Apple iPad 10.2 7代 wifi (128G) 原廠建議售價 $13,900'});
test('accepts the reviewed retailer original price and refuses promotion or lookalike hosts',()=>{
 expect(Number(retailObservation(ipadInput(),ipad).originalPrice)).toBe(13900);
 for(const patch of [{originalPrice:'12990'},{evidenceQuote:'Apple iPad 10.2 7代 wifi (128G) 網購優惠價 $13,900'},{sourceProductTitle:'Apple iPad 7 32GB Wi-Fi'},{sourceUrl:'https://www.jyes.com.tw.attacker.invalid/product/ipad'},{priceType:'MANUFACTURER_MSRP'}])expect(()=>retailObservation({...ipadInput(),...patch},ipad)).toThrow();
});




test('standard white Nintendo OLED set never matches a partial or different console',()=>{const {retailIdentity}=require('../lib/retailPrices');const p={mainId:'electronics',subId:'gaming',title:'Nintendo Switch OLED 白色 二手 含原盒及配件收納包'};expect(retailIdentity(p)).toBe('nintendo:switch:oled:white:standard-console');for(const title of ['Nintendo Switch OLED 單螢幕 白色','Nintendo Switch 2 OLED 白色','Nintendo Switch OLED 薩爾達 白色','Nintendo Switch OLED 紅藍','Nintendo Switch OLED 白色 不含底座'])expect(retailIdentity({...p,title})).toBeNull();});


test('Nintendo Taiwan MSRP is model-bound and refuses lookalike domains',()=>{const product={...p,title:'Nintendo Switch OLED 白色 二手 含原盒及配件收納包',mainId:'electronics',subId:'gaming'};const body={...input(),productKey:product.key,bindingHash:retailBinding(product),originalPrice:'10480',sourceUrl:'https://support.nintendo.com/tw/information/2021/210706/index.html',sourceProductTitle:'Nintendo Switch（OLED款式）白色',evidenceQuote:'Nintendo Switch（OLED款式）建議售價NTD 10,480（含稅）；白色',sourcePeriod:'2021-07-06'};expect(Number(retailObservation(body,product).originalPrice)).toBe(10480);expect(()=>retailObservation({...body,sourceUrl:'https://nintendo.com.attacker.invalid/'},product)).toThrow();expect(()=>retailObservation({...body,sourceProductTitle:'Nintendo Switch OLED 紅藍'},product)).toThrow();});

test.each(['NOT_FOUND','NEEDS_SPEC'])('negative research %s lasts fourteen days',status=>{
 const b={requestId:randomUUID(),productKey:p.key,bindingHash:retailBinding(p),status,checkedAt:new Date().toISOString(),notes:'Synthetic research result'};
 const r=retailObservation(b,p);
 expect(+r.expiresAt-+r.checkedAt).toBe(14*86400000);
});

test('old seven-day negative request hashes stay idempotent, but changed facts conflict',()=>{
 const data=retailObservation({requestId:randomUUID(),productKey:p.key,bindingHash:retailBinding(p),status:'NOT_FOUND',checkedAt:new Date().toISOString(),notes:'Synthetic legacy research'},p);
 const {payloadHash,...facts}=data;
 const oldHash=discoveryHash({...facts,expiresAt:new Date(+data.checkedAt+7*86400000)});
 expect(retailObservationMatches(oldHash,data)).toBe(true);
 expect(retailObservationMatches(oldHash,{...data,notes:'Changed research',payloadHash:'changed'})).toBe(false);
});

test('Hank 2026-10-30 broader identity: short model codes and Apple families, never stock codes or units',()=>{
 const e={mainId:'electronics',subId:'audio'} as any;
 expect(retailIdentity({...e,title:'AKG K361 黑色封閉式耳罩監聽耳機 二手'})).toBe('electronics:audio:k361');
 expect(retailIdentity({...e,title:'Anthem MRX 720 7.2聲道 AV環繞擴大機'})).toBe('electronics:audio:mrx720');
 expect(retailIdentity({...e,title:'Audio-Technica ATH-M50x 白色 A88134'})).toBe('electronics:audio:m50x');
 expect(retailIdentity({...e,title:'ALLIE 防曬水凝乳 EX 90g'})).toBeNull();
 expect(retailIdentity({...e,title:'Apple AirPods 4 主動降噪 ANC'})).toBe('apple:airpods:base:4:anc');
 expect(retailIdentity({...e,title:'Apple AirPods 4 二手'})).not.toBe(retailIdentity({...e,title:'Apple AirPods 4 主動降噪 ANC'}));
 expect(retailIdentity({...e,title:'Apple AirPods Pro（賣家標示第3代）降噪 二手'})).toBe('apple:airpods:pro:3');
 expect(retailIdentity({...e,title:'Apple AirPods 3 白色充電盒 二手 僅盒 無耳機'})).toBeNull();
 expect(retailIdentity({...e,title:'Apple AirPods Pro 二手'})).toBeNull();
 expect(retailIdentity({...e,title:'Apple Watch Series 9 45mm GPS 午夜色'})).toBe('apple:watch:series9:45mm:gps');
 expect(retailIdentity({...e,title:'Apple Watch Ultra 2 49mm LTE 鈦色'})).toBe('apple:watch:ultra2:49mm:lte');
 expect(retailIdentity({...e,title:'Apple iPad mini（A17 Pro）Wi-Fi 128GB 星光色'})).toBe('apple:ipad-mini:a17pro:wifi:128gb');
 expect(retailIdentity({...e,title:'Apple MacBook Air 13 2020 M1 8GB/256GB 灰'})).toBe('apple:macbook-air:13:m1:256gb');
 expect(retailIdentity({...e,title:'Apple iPhone Air 256GB 天藍'})).toBe('apple:iphone-air:256gb');
});
