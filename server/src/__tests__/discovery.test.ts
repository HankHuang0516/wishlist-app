import {classifyDiscovery,discoveryCatalog,sourcePrice} from '../lib/discoveryCatalog';
import {discoveryPage,discoveryQuery,retailStanding,DISCOVERY_SORTS,type DiscoveryProduct} from '../lib/discovery';
const product=(i:number,extra:Partial<DiscoveryProduct>={}):DiscoveryProduct=>({kind:'source',id:String(i),key:'source:'+i,title:'二手電腦螢幕 '+i,description:'公開來源',mainId:'electronics',subId:'monitors',classificationMethod:'TITLE_RULE',price:i,priceText:String(i),currency:'TWD',priceUnitVerified:true,thumbnailUrl:null,photos:[],county:'臺北市',district:null,condition:'UNKNOWN',sourceLabel:'example.invalid',stockStatus:'UNKNOWN',canonicalUrl:'https://example.invalid/'+i,detailPath:'/explore',date:'2026-10-24T00:00:00Z',dateBasis:'SOURCE_POST_RANGE',dateEarliest:null,...extra});
test('subcategory IDs are unique within parents and title rules preserve accessories vs phones',()=>{
 expect(new Set(discoveryCatalog.map(c=>c.id)).size).toBe(discoveryCatalog.length);
 for(const c of discoveryCatalog)expect(new Set(c.children.map(s=>s.id)).size).toBe(c.children.length);
 expect(classifyDiscovery('iPhone 16 Pro Max 保護殼').subId).toBe('accessories');
 expect(classifyDiscovery('BenQ 22 吋液晶螢幕').subId).toBe('monitors');
 expect(classifyDiscovery('童書繪本 存回去賺更多').mainId).toBe('books');
 expect(classifyDiscovery('其他東西','electronics')).toMatchObject({mainId:'electronics',subId:'unclassified'});
 expect(classifyDiscovery('沒有可靠分類')).toMatchObject({mainId:'other',method:'UNCLASSIFIED'});
});
test('extracts only explicit fixed TWD amounts; never guesses ranges, bundles or currencies',()=>{
 expect(sourcePrice({priceText:'1,200',currencyStatus:'TWD',priceUnitStatus:'SOURCE_STATED'})).toMatchObject({price:1200,unitVerified:true});
 expect(sourcePrice({priceText:'原貼文標示 350 元；現貨待確認。',currencyStatus:'原來源明示 NT，歸檔幣別為 TWD。'}).price).toBe(350);
 for(const text of ['100–200','100起','二件100','未標價','100 USD'])expect(sourcePrice({priceText:text,currencyStatus:'TWD'}).price).toBeNull();
 expect(sourcePrice({priceText:'100',currencyStatus:'UNKNOWN'}).price).toBeNull();
 expect(sourcePrice({priceText:'100',currencyStatus:'TWD 未確認'}).price).toBeNull();
 expect(sourcePrice({priceText:'0',currencyStatus:'TWD'}).price).toBe(0);
});
test.each([{sub:'monitors'},{main:'not-a-parent'},{main:'home',sub:'monitors'},{min:'10',max:'5'},{limit:'100'},{q:['x']},{exactGps:'25,121'}])('rejects invalid or unsupported queries %p',q=>expect(()=>discoveryQuery(q as any)).toThrow());
test('filters all 650 records before pagination and facets retain parent/child counts',()=>{
 const all=Array.from({length:650},(_,i)=>product(i,{subId:i===649?'phones':'monitors'}));
 const found=discoveryPage(all,discoveryQuery({main:'electronics',sub:'phones',max:'700'}));
 expect(found.items.map(p=>p.id)).toEqual(['649']);expect(found.counts.source).toBe(1);expect(found.categories.find(c=>c.id==='electronics')?.count).toBe(650);
 let page=discoveryPage(all,discoveryQuery({limit:'60'}));const ids=new Set(page.items.map(p=>p.id));
 while(page.nextCursor){page=discoveryPage(all,discoveryQuery({limit:'60',cursor:page.nextCursor}));for(const p of page.items){expect(ids.has(p.id)).toBe(false);ids.add(p.id);}}
 expect(ids.size).toBe(650);
});
test('binds cursors to both query and current public dataset, including withdrawals',()=>{
 const all=[product(1),product(2),product(3)],first=discoveryPage(all,discoveryQuery({limit:'1'}));
 expect(()=>discoveryPage(all,discoveryQuery({limit:'1',cursor:first.nextCursor!,main:'electronics'}))).toThrow('DISCOVERY_RESULTS_CHANGED');
 expect(()=>discoveryPage(all.slice(1),discoveryQuery({limit:'1',cursor:first.nextCursor!}))).toThrow('DISCOVERY_RESULTS_CHANGED');
});
test('sorts source post dates with site publication dates; unknown prices stay last both directions',()=>{
 const all=[product(1,{date:'2026-10-22T00:00:00Z',price:null}),product(2,{price:300}),product(3,{price:30})];
 expect(discoveryPage(all,discoveryQuery({sort:'price-asc'})).items.map(p=>p.id)).toEqual(['3','2','1']);
 expect(discoveryPage(all,discoveryQuery({sort:'price-desc'})).items.map(p=>p.id)).toEqual(['2','3','1']);
 expect(discoveryPage(all,discoveryQuery({max:'300'})).total).toBe(2);
 expect(discoveryPage(all,discoveryQuery({condition:'USED'})).total).toBe(0);
});
const reference=(price:number)=>({id:'r'+price,key:'retail:r'+price,productKey:'x',bindingHash:'h',identity:'i',price,currency:'TWD' as const,priceType:'MANUFACTURER_MSRP' as const,sourceUrl:'https://www.apple.com/tw/',sourceTitle:'t',sourceProductTitle:'t',evidenceQuote:'q',sourcePeriod:null,checkedAt:'2026-11-10T00:00:00Z'});
test('orders by the reference-price comparison the card shows; products without one stay last in every direction',()=>{
 // 1: 1.8 折 (save 820)  2: 5 折 (save 10000)  3: 9 折 (save 100)  4: no reference  5: price above the reference  6: reference but price unknown
 // 7: reference only through its CP evaluation (2 折, save 4000)  8: price in another currency  9: unverified unit  10: newer twin of 1
 const all=[product(1,{price:180,retail:reference(1000)}),product(2,{price:10000,retail:reference(20000)}),product(3,{price:900,retail:reference(1000)}),product(4,{price:5}),
  product(5,{price:1200,retail:reference(1000)}),product(6,{price:null,retail:reference(1000)}),product(7,{price:1000,cp:{retail:reference(5000),score:80,confidence:'MEDIUM',reasons:[],limitations:[],basis:[],model:'m',evaluatedAt:'2026-11-10T00:00:00Z',dimensions:null}}),
  product(8,{price:100,currency:'USD',retail:reference(1000)}),product(9,{price:100,priceUnitVerified:false,retail:reference(1000)}),product(10,{price:180,retail:reference(1000),date:'2026-10-25T00:00:00Z'})];
 const ids=(sort:string)=>discoveryPage(all,discoveryQuery({sort})).items.map(p=>p.id);
 expect(ids('retail-ratio-asc')).toEqual(['10','1','7','2','3','5',...['4','6','8','9']]);
 expect(ids('retail-ratio-desc')).toEqual(['5','3','2','7','10','1',...['4','6','8','9']]);
 expect(ids('retail-savings-desc')).toEqual(['2','7','10','1','3','5',...['4','6','8','9']]);
 // The uncompared keep newest-first among themselves (equal dates here, so key order).
 expect(retailStanding(all[0])?.ratio).toBeCloseTo(1.8,10);expect(retailStanding(all[0])?.savings).toBe(820);
 expect(retailStanding(all[4])).toEqual({ratio:12,savings:-200});
 for(const p of [all[3],all[5],all[7],all[8]])expect(retailStanding(p)).toBeNull();
});
test('pages through a retail order exactly once and refuses a cursor once a comparison changes',()=>{
 const all=Array.from({length:75},(_,i)=>product(i,{price:100+i,...(i%3?{retail:reference(1000+(i%7)*100)}:{}),date:new Date(Date.UTC(2026,9,1,0,i)).toISOString()}));
 for(const sort of ['retail-ratio-asc','retail-ratio-desc','retail-savings-desc']){
  const expected=discoveryPage(all,discoveryQuery({sort,limit:'60'})).items.map(p=>p.id).concat(discoveryPage(all,discoveryQuery({sort,limit:'60',cursor:discoveryPage(all,discoveryQuery({sort,limit:'60'})).nextCursor!})).items.map(p=>p.id));
  const seen:string[]=[];let page=discoveryPage(all,discoveryQuery({sort,limit:'7'}));seen.push(...page.items.map(p=>p.id));
  while(page.nextCursor){page=discoveryPage(all,discoveryQuery({sort,limit:'7',cursor:page.nextCursor}));seen.push(...page.items.map(p=>p.id));}
  expect(seen).toEqual(expected);expect(new Set(seen).size).toBe(75);
  // The 25 products without a reference come after all 50 with one.
  expect(seen.slice(50).every(id=>Number(id)%3===0)).toBe(true);
 }
 const first=discoveryPage(all,discoveryQuery({sort:'retail-ratio-asc',limit:'7'}));
 const repriced=all.map(p=>p.id==='40'?{...p,retail:reference(9000)}:p);
 expect(()=>discoveryPage(repriced,discoveryQuery({sort:'retail-ratio-asc',limit:'7',cursor:first.nextCursor!}))).toThrow('DISCOVERY_RESULTS_CHANGED');
});
test('accepts each listed order and nothing else',()=>{
 for(const sort of DISCOVERY_SORTS)expect(discoveryQuery({sort}).sort).toBe(sort);
 for(const sort of ['retail-ratio','retail-savings-asc','oldest','distance','RETAIL-RATIO-ASC'])expect(()=>discoveryQuery({sort})).toThrow();
});
test('searches an explicitly stated brand even when it is absent from the product title',()=>{
 expect(discoveryPage([product(1,{title:'合成螢幕',description:'公開測試',brand:'BenQ'})],discoveryQuery({q:'benq'})).total).toBe(1);
 expect(discoveryPage([product(1,{title:'合成螢幕',description:'公開測試',brand:null})],discoveryQuery({q:'benq'})).total).toBe(0);
});
test('map presentation keeps the shared filters and original public coordinates, with unplaced results separate',()=>{
 const original:[number,number]=[120.236,23];
 const all=[product(1,{condition:'USED',price:1000,mapLocation:{coordinates:original,precision:'PUBLIC_MEETING_POINT'}}),product(2,{condition:'USED',price:1000,mapLocation:null}),product(3,{condition:'NEW',price:1000,mapLocation:{coordinates:[121,25],precision:'APPROXIMATE_2KM'}})];
 const query=discoveryQuery({presentation:'map',main:'electronics',sub:'monitors',county:'臺北市',condition:'USED',source:'source',min:'999',max:'1001',bbox:'120,22,120.5,23.5'});
 const page=discoveryPage(all,query);expect(page.items.map(p=>p.id)).toEqual(['1','2']);expect(page.mapTotals).toEqual({located:1,unmapped:1});expect(page.items[0].mapLocation?.coordinates).toEqual(original);
 const outside=discoveryPage(all,discoveryQuery({...query,min:'999',max:'1001',limit:'24',presentation:'map',bbox:'-20,-10,0,10',cursor:''} as any));
 expect(outside.items.map(p=>p.id)).toEqual(['2']);expect(outside.mapTotals).toEqual({located:0,unmapped:1});
 expect(all[0].mapLocation?.coordinates).toBe(original);
});
test.each([{bbox:'120,22,121,24'},{presentation:'grid'},{presentation:'map',bbox:'NaN,22,121,24'},{presentation:'map',bbox:'121,22,120,24'},{presentation:'map',bbox:'-181,22,121,24'}])('rejects ambiguous map presentation or bounds %j',q=>expect(()=>discoveryQuery(q as any)).toThrow());

test.each([
 ['Samsung Galaxy S22+（螢幕有三條線，白／綠兩支，單價）','phones'],
 ['iPhone 15 Pro 512G 藍色（副廠電池、副廠螢幕，無盒）','phones'],
 ['iPhone 15 Pro 副廠螢幕','phones'],
 ['iPhone 15 Pro 附充電器與保護殼','phones'],
 ['iPhone 16 Pro Max 保護殼','accessories'],
 ['iPhone 16 保護殼（附保護貼）','accessories'],
 ['Acer Aspire 5741ZG 筆電（零件機）＋24吋電視螢幕打包','laptops'],
 ['Samsung Galaxy Tab S9 平板','tablets'],
 ['Samsung Galaxy Buds3 全新未拆','audio'],
 ['二手筆電變壓器（電源轉接器，含電源線）','accessories'],
 ['BenQ GW2270-T 22 吋液晶螢幕（21.5 吋 Full HD VA 面板）','monitors'],
 ['Samsung 43 吋 FollowMe Pro 4K 移動式智慧聯網螢幕組 S43FM703UC（全新）','monitors']
])('classifies the actual product subject rather than its condition or included parts: %s',(title,subId)=>{
 expect(classifyDiscovery(title)).toMatchObject({mainId:'electronics',subId,version:2});
});
