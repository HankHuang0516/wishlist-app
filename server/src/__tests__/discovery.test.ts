import {classifyDiscovery,discoveryCatalog,sourcePrice} from '../lib/discoveryCatalog';
import {discoveryPage,discoveryQuery,type DiscoveryProduct} from '../lib/discovery';
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
