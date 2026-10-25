import express from 'express';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import {createDiscoveryRoutes} from '../../routes/discoveryRoutes';
import {parseLead} from '../../lib/sourceLeadRules';
import {loadDiscovery} from '../../lib/discovery';
import {retailBinding,retailObservation} from '../../lib/retailPrices';
import {evaluateCp,attachCp} from '../../lib/discoveryCp';
import {createLoopbackRequest} from './loopbackHttp';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB required');
const app=express();app.use(express.json());app.use('/discovery',createDiscoveryRoutes());const http=createLoopbackRequest(app);
const run=randomUUID(),apiKey=randomUUID(),otherKey=randomUUID();let userId:number,otherId:number,listingId:string,wishId:number,unrelatedWishId:number,foreignWishId:number;
const retailIds:string[]=[],leadIds:string[]=[],oldFlag=process.env.SOURCE_LEADS_PUBLIC_ENABLED,oldModel=process.env.DISCOVERY_CP_MODEL,model='synthetic-cp-'+run;
beforeAll(async()=>{
 process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';
 process.env.DISCOVERY_CP_MODEL=model;
 [userId,otherId]=await Promise.all([apiKey,otherKey].map((key,i)=>prisma.user.create({data:{phoneNumber:'discovery-'+run+'-'+i,password:'synthetic',apiKey:key}}).then(r=>r.id)));
 listingId=(await prisma.listing.create({data:{ownerUserId:userId,clientListingId:randomUUID(),requestHash:'synthetic',title:'BenQ GW2270 合成二手電腦螢幕',category:'electronics',price:750,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000),publishedAt:new Date()}})).id;
 const rows=Array.from({length:503},(_,i)=>{const id=randomUUID(),url='https://www.facebook.com/groups/123456789/posts/'+id;const data=parseLead({archiveItemId:'SYNTHETIC-'+run+'-'+i,libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:3,archiveSha256:'a'.repeat(64),title:i===502?'合成二手筆電唯一尾頁商品':'BenQ GW2270 合成二手電腦螢幕 '+i,summary:'公開來源參考，庫存與交易待確認。',canonicalUrl:url,county:'臺南市',district:'永康區',publicPlaceName:'合成公共面交點',publicAddress:'臺南市永康區合成路123號',latitude:23,longitude:120.236,postedEarliestAt:new Date(Date.now()-86400000).toISOString(),postedLatestAt:new Date(Date.now()-86400000).toISOString(),checkedAt:new Date().toISOString(),evidence:{sourceUrl:url,sourcePublic:true,publicSourceRef:'self:synthetic-public',dateRef:'self:synthetic-date',locationRef:'self:synthetic-location',coordinateRef:'self:synthetic-coordinate',locationSourceUrl:'https://public.example.invalid/qa',coordinateSourceUrl:'https://public.example.invalid/map',publicPlace:true,locationType:'PUBLIC_MEETING_POINT',sourceMeetingPointConfirmed:true,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,reviewRef:'self:synthetic-review',publicFacts:{priceText:'1000',currencyStatus:'TWD',priceUnitStatus:'SOURCE_STATED',sourceAccessNotice:'公開來源',originalDateLabel:'來源昨日貼文',locationRelation:'公共面交點',coordinateQualityNotes:[]}}});leadIds.push(id);return{id,...data};});
 await prisma.externalSourceLead.createMany({data:rows});
 const mine=await prisma.wishlist.create({data:{userId,title:'合成私人願望',items:{create:[{name:'電腦螢幕',maxPrice:800,priceCurrency:'TWD',aiStatus:'SKIPPED'},{name:'完全無關小提琴',aiStatus:'SKIPPED'}]}},include:{items:true}});
 wishId=mine.items.find(i=>i.name==='電腦螢幕')!.id;unrelatedWishId=mine.items.find(i=>i.name!=='電腦螢幕')!.id;
 foreignWishId=(await prisma.wishlist.create({data:{userId:otherId,title:'其他帳號私人願望',items:{create:{name:'電腦螢幕',isHidden:true,aiStatus:'SKIPPED'}}},include:{items:true}})).items[0].id;
},30_000);
afterAll(async()=>{if(oldFlag===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=oldFlag;if(oldModel===undefined)delete process.env.DISCOVERY_CP_MODEL;else process.env.DISCOVERY_CP_MODEL=oldModel;await prisma.discoveryCpRun.deleteMany({where:{model}});await prisma.retailPriceObservation.deleteMany({where:{id:{in:retailIds}}});await prisma.externalSourceLead.deleteMany({where:{id:{in:leadIds}}});await prisma.listing.deleteMany({where:{ownerUserId:userId}});await prisma.user.deleteMany({where:{id:{in:[userId,otherId]}}});await prisma.$disconnect();});
it('reads every published source before applying main/subcategory and budget filters',async()=>{
 const first=await http.get('/discovery?main=electronics&sub=laptops');expect(first.status).toBe(200);expect(first.body.total).toBe(1);expect(first.body.items[0].title).toContain('唯一尾頁');
 const monitors=await http.get('/discovery?main=electronics&sub=monitors&max=1000');expect(monitors.body.counts).toEqual({listing:1,source:502,external:0});expect(monitors.body.complete).toBe(true);expect(monitors.body.items).toHaveLength(24);
 expect(JSON.stringify(monitors.body)).not.toMatch(/archiveSha256|requestHash|ownerUserId|sellerRoute|apiKey|contentHash|publicAddress|latitude/);
});
it('isolates recommendations using the authenticated owner wishes and actual budgets',async()=>{
 expect((await http.get('/discovery/for-you')).status).toBe(401);
 const mine=await http.get('/discovery/for-you').set('X-Api-Key',apiKey);expect(mine.status).toBe(200);expect(mine.body.total).toBe(1);expect(mine.body.items[0].id).toBe(listingId);expect(mine.body.items[0].match.reasons).toEqual(['NAME','BUDGET']);
 const other=await http.get('/discovery/for-you').set('X-Api-Key',otherKey);expect(other.body.total).toBe(0);
});
it('scopes a selected wish to its authenticated owner and hides purchased or hidden wishes',async()=>{
 const selected=await http.get('/discovery/for-you?wish='+wishId).set('X-Api-Key',apiKey);expect(selected.status).toBe(200);expect(selected.body.total).toBe(1);expect(selected.body.items[0].match.wishItemId).toBe(wishId);
 const unrelated=await http.get('/discovery/for-you?wish='+unrelatedWishId).set('X-Api-Key',apiKey);expect(unrelated.status).toBe(200);expect(unrelated.body.total).toBe(0);
 expect((await http.get('/discovery/for-you?wish='+foreignWishId).set('X-Api-Key',apiKey)).status).toBe(404);
 expect((await http.get('/discovery/for-you?wish='+wishId).set('X-Api-Key',otherKey)).status).toBe(404);
 for(const state of [{isHidden:true},{isPurchased:true}]){await prisma.item.update({where:{id:wishId},data:{isHidden:false,isPurchased:false,...state}});expect((await http.get('/discovery/for-you?wish='+wishId).set('X-Api-Key',apiKey)).status).toBe(404);}
 await prisma.item.update({where:{id:wishId},data:{isHidden:false,isPurchased:false}});
});
it('rejects invalid or misplaced selected-wish query parameters',async()=>{
 for(const path of ['/discovery?wish=1','/discovery/cp?wish=1','/discovery/for-you?wish=0','/discovery/for-you?wish=-1','/discovery/for-you?wish=1.5','/discovery/for-you?wish=2147483648','/discovery/for-you?wish=1&wish=2'])expect((await http.get(path).set('X-Api-Key',apiKey)).status).toBe(400);
 expect((await http.get('/discovery/for-you?wish='+wishId)).status).toBe(401);
});
it('removes withdrawn sources and rejects prior-page cursors rather than mixing snapshots',async()=>{
 const first=await http.get('/discovery?limit=1');expect(first.body.nextCursor).toBeTruthy();
 await prisma.externalSourceLead.update({where:{id:leadIds[0]},data:{status:'WITHDRAWN'}});
 const next=await http.get('/discovery?limit=1&cursor='+first.body.nextCursor);expect(next.status).toBe(409);expect(next.body.errorCode).toBe('DISCOVERY_RESULTS_CHANGED');
 const disabled=process.env.SOURCE_LEADS_PUBLIC_ENABLED;process.env.SOURCE_LEADS_PUBLIC_ENABLED='0';
 const closed=await http.get('/discovery');expect(closed.body.counts.source).toBe(0);process.env.SOURCE_LEADS_PUBLIC_ENABLED=disabled;
});
it('uses only external original-new evidence, invalidates expired or changed inputs, and never evaluates from a GET',async()=>{
 expect((await http.post('/discovery/cp-evaluations').send({})).status).toBe(401);const all=await loadDiscovery();let calls=0;
 const selected=all.filter(p=>p.mainId==='electronics'&&p.subId==='monitors'&&p.price!==null).slice(0,6);
 for(const p of selected){const id=randomUUID();retailIds.push(id);await prisma.retailPriceObservation.create({data:retailObservation({requestId:id,productKey:p.key,bindingHash:retailBinding(p),status:'VERIFIED',originalPrice:'4990',currency:'TWD',priceType:'MANUFACTURER_MSRP',sourceUrl:'https://www.benq.com/zh-tw/monitor.html',sourceTitle:'Synthetic original price evidence',sourceProductTitle:'BenQ GW2270',sourcePeriod:'2026-10',evidenceQuote:'BenQ GW2270 新品原價 NT$4990',checkedAt:new Date().toISOString()},p)});}
 const provider=async(targets:any[])=>{calls++;expect(targets.every(t=>t.comparables.length===1&&t.comparables[0].key.startsWith('retail:'))).toBe(true);return targets.map(t=>({key:t.product.key,verdict:'COMPARABLE',basisKeys:[t.comparables[0].key],dimensions:{specification:25,condition:20,evidence:15},reasons:[{zh:'同型號新品原價比較。',en:'Same-model original-new comparison.'}],limitations:[{zh:'品況與庫存待確認。',en:'Condition and stock unconfirmed.'}]}));};
 const result=await evaluateCp(all,provider);expect(result.evaluated).toBe(6);expect(calls).toBe(1);const attached=await attachCp(all),scored=attached.filter(p=>p.cp);expect(scored).toHaveLength(6);
 const page=await http.get('/discovery/cp');expect(page.status).toBe(200);expect(page.body.total).toBe(6);expect(calls).toBe(1);
 const key=scored[0].key;const priceChanged=await attachCp(all.map(p=>p.key===key?{...p,price:999999}:p));expect(priceChanged.find(p=>p.key===key)?.cp).toBeUndefined();
 await prisma.retailPriceObservation.update({where:{id:scored[0].cp!.retail.id},data:{expiresAt:new Date(0)}});expect((await attachCp(all)).find(p=>p.key===key)?.cp).toBeUndefined();
});

it('applies the same category/area/source/condition/budget filters to every map page and respects map consent',async()=>{
 const query='main=electronics&sub=monitors&county='+encodeURIComponent('臺南市')+'&source=source&condition=USED&min=1000&max=1000&limit=60';
 async function collect(map:boolean){let cursor='',first:any;const products:any[]=[];do{const r=await http.get('/discovery?'+query+(map?'&presentation=map':'')+(cursor?'&cursor='+cursor:''));expect(r.status).toBe(200);first??=r.body;products.push(...r.body.items);cursor=r.body.nextCursor??'';}while(cursor);return{page:first,products};}
 const list=await collect(false),map=await collect(true);
 expect(map.products.map(p=>p.key)).toEqual(list.products.map(p=>p.key));expect(map.products.length).toBeGreaterThan(500);
 expect(map.page.mapTotals).toEqual({located:map.products.length,unmapped:0});
 expect(map.products.every(p=>p.mapLocation?.coordinates[0]===120.236&&p.mapLocation.coordinates[1]===23&&p.mapLocation.precision==='PUBLIC_MEETING_POINT')).toBe(true);
 expect(list.products.every(p=>p.mapLocation===undefined)).toBe(true);
 const listing=await prisma.listing.update({where:{id:listingId},data:{location:{create:{county:'臺南市',district:'永康區',publicLatitude:23.01,publicLongitude:120.23,precisionMeters:2200}},mapVisibleUntil:new Date(Date.now()+60000)}});
 try{
  const own=await http.get('/discovery?presentation=map&source=listing');expect(own.body.items.find((p:any)=>p.id===listing.id).mapLocation).toMatchObject({coordinates:[120.23,23.01],precision:'APPROXIMATE_2KM'});
  const scoped=await http.get('/discovery?presentation=map&source=listing&bbox=121,24,122,26');expect(scoped.body.items.some((p:any)=>p.id===listing.id)).toBe(false);
  await prisma.listing.update({where:{id:listing.id},data:{mapVisibleUntil:new Date(0)}});
  const expired=await http.get('/discovery?presentation=map&source=listing');expect(expired.body.items.find((p:any)=>p.id===listing.id).mapLocation).toBeNull();expect(expired.body.mapTotals.unmapped).toBeGreaterThan(0);
 }finally{await prisma.listing.update({where:{id:listing.id},data:{mapVisibleUntil:null,location:{delete:true}}});}
});
