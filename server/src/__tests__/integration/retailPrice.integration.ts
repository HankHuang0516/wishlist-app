import fs from 'fs';
import path from 'path';
import { discoveryHash } from '../../lib/discovery';
import express from 'express';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import {createRetailPriceAdmin} from '../../routes/retailPriceRoutes';
import {createDiscoveryRoutes} from '../../routes/discoveryRoutes';
import {createLoopbackRequest} from './loopbackHttp';
import {loadDiscovery} from '../../lib/discovery';
import {retailBinding,retailReferences,retailObservation} from '../../lib/retailPrices';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB required');
const app=express();app.use(express.json());app.use('/retail',createRetailPriceAdmin(()=> 'synthetic-retail-admin'));
app.use('/discovery',createDiscoveryRoutes());
const http=createLoopbackRequest(app),ids:string[]=[],run=randomUUID();let userId:number,listingId:string;
const post=(b:object,key='synthetic-retail-admin')=>http.post('/retail/observations').set('X-Admin-Key',key).send(b);
beforeAll(async()=>{userId=(await prisma.user.create({data:{phoneNumber:'retail-test-'+run,password:'synthetic-only'}})).id;listingId=(await prisma.listing.create({data:{ownerUserId:userId,clientListingId:randomUUID(),requestHash:'synthetic-retail-test',title:'Samsung Galaxy Buds3 全新未拆',category:'electronics',condition:'NEW',price:2500,currency:'TWD',status:'ACTIVE',publishedAt:new Date(),expiresAt:new Date(Date.now()+86400000)}})).id;});
afterAll(async()=>{await prisma.retailPriceObservation.deleteMany({where:{id:{in:ids}}});await prisma.listing.deleteMany({where:{ownerUserId:userId}});await prisma.user.delete({where:{id:userId}});await prisma.$disconnect();});
it('requires the existing admin credential and never opens a public write path',async()=>{expect((await http.get('/retail/candidates')).status).toBe(401);expect((await post({},'forged')).status).toBe(401);});
it('exposes bounded backfill capacity and exact public statuses only behind admin auth',async()=>{
 const key='listing:'+listingId;
 expect((await http.get('/retail/capacity')).status).toBe(401);
 expect((await http.get('/retail/evaluations?productKeys='+key)).status).toBe(401);
 const cap=await http.get('/retail/capacity').set('X-Admin-Key','synthetic-retail-admin');
 expect(cap.body).toMatchObject({dailyBatchCap:1000,batchSize:6,queueReadLimit:100});
 const queue=await http.get('/retail/candidates?limit=100').set('X-Admin-Key','synthetic-retail-admin');expect(queue.status).toBe(200);
 const status=await http.get('/retail/evaluations?productKeys='+key).set('X-Admin-Key','synthetic-retail-admin');
 expect(status.status).toBe(200);expect(status.body.items[0]).toMatchObject({productKey:key,score:null,ready:false});
 expect((await http.get('/retail/pending-evaluations?limit=101').set('X-Admin-Key','synthetic-retail-admin')).status).toBe(400);
});
it('returns the exact public product binding without waiting behind older candidates',async()=>{
 const key='listing:'+listingId;
 expect((await http.get('/retail/candidates?productKey='+key)).status).toBe(401);
 const r=await http.get('/retail/candidates?limit=1&productKey='+key).set('X-Admin-Key','synthetic-retail-admin');
 expect(r.status).toBe(200);expect(r.body.items).toHaveLength(1);expect(r.body.items[0].productKey).toBe(key);
 expect((await http.get('/retail/candidates?productKey=private:invalid').set('X-Admin-Key','synthetic-retail-admin')).status).toBe(400);
 const hidden=await prisma.listing.create({data:{ownerUserId:userId,clientListingId:randomUUID(),requestHash:'synthetic-private',title:'Samsung Galaxy Buds3 全新未拆',category:'electronics',condition:'NEW',price:2500,currency:'TWD',status:'DRAFT'}});
 const h=await http.get('/retail/candidates?productKey=listing:'+hidden.id).set('X-Admin-Key','synthetic-retail-admin');
 expect(h.body.items).toEqual([]);
});
it('records exact-source originals idempotently, advances the queue, and invalidates changed products',async()=>{const key='listing:'+listingId,p=(await loadDiscovery()).find(p=>p.key===key)!;const id=randomUUID();ids.push(id);const body={requestId:id,productKey:key,bindingHash:retailBinding(p),status:'VERIFIED',originalPrice:'4990',currency:'TWD',priceType:'MANUFACTURER_MSRP',sourceUrl:'https://images.samsung.com/is/content/samsung/assets/tw/downloads/2025-ses-apr-event-guidelines.pdf',sourceTitle:'Synthetic original-new price evidence',sourceProductTitle:'Samsung Galaxy Buds3',sourcePeriod:'2025-04',evidenceQuote:'Galaxy Buds3 建議售價 NT$4,990',checkedAt:new Date().toISOString()};expect((await post(body)).status).toBe(201);expect((await post(body)).body.cached).toBe(true);expect((await post({...body,originalPrice:'990'})).status).toBe(400);const ref=(await retailReferences([p])).get(key);expect(ref?.price).toBe(4990);const queue=await http.get('/retail/candidates?limit=20').set('X-Admin-Key','synthetic-retail-admin');expect(queue.body.items.some((x:any)=>x.productKey===key)).toBe(false);const pending=await http.get('/retail/pending-evaluations').set('X-Admin-Key','synthetic-retail-admin');expect(pending.body.items.some((x:any)=>x.productKey===key)).toBe(true);await prisma.listing.update({where:{id:listingId},data:{title:'Samsung Galaxy Buds3 Pro 全新未拆'}});const changed=(await loadDiscovery()).find(p=>p.key===key)!;expect((await retailReferences([changed])).has(key)).toBe(false);});

it('scopes pending research without dropping another source and exposes full catalog coverage behind admin auth',async()=>{expect((await http.get('/retail/coverage')).status).toBe(401);const r=await http.get('/retail/coverage').set('X-Admin-Key','synthetic-retail-admin');expect(r.status).toBe(200);expect(r.body.byKind.listing.total).toBeGreaterThan(0);expect(r.body.byKind.listing.total).toBe(r.body.byKind.listing.scored+r.body.byKind.listing.pending);const q=await http.get('/retail/candidates?source=listing&limit=20').set('X-Admin-Key','synthetic-retail-admin');expect(q.status).toBe(200);expect(q.body.items.every((x:any)=>x.productKey.startsWith('listing:'))).toBe(true);expect((await http.get('/retail/candidates?source=private').set('X-Admin-Key','synthetic-retail-admin')).status).toBe(400);});


it('accepts a PChome calculator network price via HTTP and replays the same request idempotently',async()=>{
 const calculator=await prisma.listing.create({data:{ownerUserId:userId,clientListingId:randomUUID(),requestHash:'synthetic-pchome',title:'CASIO fx-991CW 工程計算機（二手、功能正常）',category:'other',condition:'USED',price:700,currency:'TWD',status:'ACTIVE',publishedAt:new Date(),expiresAt:new Date(Date.now()+86400000)}});
 const key='listing:'+calculator.id,p=(await loadDiscovery()).find(p=>p.key===key)!;
 const id=randomUUID();ids.push(id);
 const body={requestId:id,productKey:key,bindingHash:retailBinding(p),status:'VERIFIED',originalPrice:'1190',currency:'TWD',priceType:'RETAIL_REGULAR',sourceUrl:'https://24h.pchome.com.tw/prod/DCBAJI-A900G6O6T',sourceTitle:'PChome CASIO fx-991CW',sourceProductTitle:'CASIO fx-991CW',sourcePeriod:null,evidenceQuote:'CASIO fx-991CW 網路價 $1,190；折扣價 $1,130',checkedAt:new Date().toISOString()};
 expect((await post({...body,originalPrice:'1130'})).status).toBe(400);
 const recorded=await post(body);expect(recorded.status).toBe(201);expect(recorded.body.id).toBe(id);
 expect((await post(body)).body.cached).toBe(true);
 const ref=(await retailReferences([p])).get(key);expect(ref?.price).toBe(1190);
 const pending=await http.get('/retail/pending-evaluations').set('X-Admin-Key','synthetic-retail-admin');
 expect(pending.body.items.some((x:any)=>x.productKey===key)).toBe(true);
});

it('serves original price evidence without AI and rechecks current price, variant, expiry and public visibility',async()=>{
 const title='Samsung Galaxy Buds3 合成原價比較 '+run;
 const listing=await prisma.listing.create({data:{ownerUserId:userId,clientListingId:randomUUID(),requestHash:'synthetic-discount',title,description:'同型號原價比較測試',category:'electronics',condition:'NEW',price:2500,currency:'TWD',status:'ACTIVE',publishedAt:new Date(),expiresAt:new Date(Date.now()+86400000)}});
 const key='listing:'+listing.id,p=(await loadDiscovery()).find(p=>p.key===key)!,id=randomUUID();ids.push(id);
 expect((await post({requestId:id,productKey:key,bindingHash:retailBinding(p),status:'VERIFIED',originalPrice:'4990',currency:'TWD',priceType:'MANUFACTURER_MSRP',sourceUrl:'https://www.samsung.com/tw/audio-sound/galaxy-buds/',sourceTitle:'Synthetic same-model original price',sourceProductTitle:'Samsung Galaxy Buds3',sourcePeriod:null,evidenceQuote:'Galaxy Buds3 建議售價 NT$4,990',checkedAt:new Date().toISOString()})).status).toBe(201);
 const runs=await prisma.discoveryCpRun.count(),path='/discovery/products/listing/'+listing.id;
 const first=await http.get(path);expect(first.status).toBe(200);
 expect(first.body.items[0]).toMatchObject({key,price:2500,retail:{price:4990,productKey:key,currency:'TWD'}});
 expect(first.body.items[0].cp).toBeUndefined();
 const feed=await http.get('/discovery?source=listing&q='+encodeURIComponent(title));
 expect(feed.status).toBe(200);expect(feed.body.items.find((p:any)=>p.key===key).retail.price).toBe(4990);
 await prisma.listing.update({where:{id:listing.id},data:{price:1996}});
 expect((await http.get(path)).body.items[0]).toMatchObject({price:1996,retail:{price:4990}});
 await prisma.listing.update({where:{id:listing.id},data:{title:title.replace('Buds3','Buds3 Pro')}});
 expect((await http.get(path)).body.items[0].retail).toBeUndefined();
 await prisma.listing.update({where:{id:listing.id},data:{title}});
 await prisma.retailPriceObservation.update({where:{id},data:{expiresAt:new Date(0)}});
 expect((await http.get(path)).body.items[0].retail).toBeUndefined();
 await prisma.listing.update({where:{id:listing.id},data:{status:'DRAFT'}});
 const hidden=await http.get(path);expect(hidden.status).toBe(404);expect(hidden.body.items).toBeUndefined();
 for(const query of ['/discovery/products/private/'+listing.id,'/discovery/products/listing/invalid',path+'?includePrivate=1'])expect((await http.get(query)).status).toBe(400);
 expect(await prisma.discoveryCpRun.count()).toBe(runs);
});


it('keeps original references and candidate dedup correct behind more than 10000 observations',async()=>{
 const products=[];
 for(let i=0;i<2;i++) products.push(await prisma.listing.create({data:{ownerUserId:userId,clientListingId:randomUUID(),requestHash:'synthetic-large-retail-'+i,title:'Samsung Galaxy Buds3 全新未拆',category:'electronics',condition:'NEW',price:2500,currency:'TWD',status:'ACTIVE',publishedAt:new Date(),expiresAt:new Date(Date.now()+86400000)}}));
 const all=await loadDiscovery(),items=products.map(x=>all.find(p=>p.key==='listing:'+x.id)!);
 const reference=(p:typeof items[number],checkedAt:string)=>{const id=randomUUID();ids.push(id);return retailObservation({requestId:id,productKey:p.key,bindingHash:retailBinding(p),status:'VERIFIED',originalPrice:'4990',currency:'TWD',priceType:'MANUFACTURER_MSRP',sourceUrl:'https://www.samsung.com/tw/',sourceTitle:'Synthetic large-catalog evidence',sourceProductTitle:'Samsung Galaxy Buds3',sourcePeriod:'2025-04',evidenceQuote:'Galaxy Buds3 建議售價 NT$4,990',checkedAt},p);};
 const now=new Date().toISOString();
 await prisma.retailPriceObservation.createMany({data:[...Array.from({length:10001},()=>reference(items[0],now)),reference(items[1],new Date(Date.now()-60000).toISOString())]});
 const refs=await retailReferences(items);
 expect(refs.size).toBe(2);expect(refs.get(items[1].key)?.price).toBe(4990);
 const queue=await http.get('/retail/candidates?limit=100').set('X-Admin-Key','synthetic-retail-admin');
 expect(queue.status).toBe(200);expect(queue.body.items.some((p:any)=>p.productKey===items[1].key)).toBe(false);
},30000);

it('migrates existing negative research without resetting checks or breaking exact API retries',async()=>{
 const key='listing:'+listingId,p=(await loadDiscovery()).find(p=>p.key===key)!;
 const cases=[];
 for(const [status,days] of [['NOT_FOUND',7],['NEEDS_SPEC',7],['NOT_FOUND',3]] as const){
  const body={requestId:randomUUID(),productKey:key,bindingHash:retailBinding(p),status,checkedAt:new Date().toISOString(),notes:'Synthetic migration research'};
  ids.push(body.requestId);
  const {payloadHash,...facts}=retailObservation(body,p);
  const oldFacts={...facts,expiresAt:new Date(+facts.checkedAt+days*86400000)};
  const row=await prisma.retailPriceObservation.create({data:{...oldFacts,payloadHash:discoveryHash(oldFacts)}});
  cases.push({body,row,days});
 }
 const sql=fs.readFileSync(path.join(__dirname,'../../../prisma/migrations/20261027030000_source_validity_14_days/migration.sql'),'utf8').split(';')[0];
 await prisma.$executeRawUnsafe(sql);
 await prisma.$executeRawUnsafe(sql);
 for(const {body,row,days} of cases){
  const migrated=await prisma.retailPriceObservation.findUniqueOrThrow({where:{id:row.id}});
  expect(+migrated.expiresAt-+migrated.checkedAt).toBe((days===7?14:days)*86400000);
  expect(migrated.checkedAt).toEqual(row.checkedAt);
  expect(migrated.payloadHash).toBe(row.payloadHash);
  if(days===7) expect((await post(body)).body.cached).toBe(true);
 }
});
