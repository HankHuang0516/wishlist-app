import express from 'express';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import {createRetailPriceAdmin} from '../../routes/retailPriceRoutes';
import {createLoopbackRequest} from './loopbackHttp';
import {loadDiscovery} from '../../lib/discovery';
import {retailBinding,retailReferences} from '../../lib/retailPrices';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB required');
const app=express();app.use(express.json());app.use('/retail',createRetailPriceAdmin(()=> 'synthetic-retail-admin'));
const http=createLoopbackRequest(app),ids:string[]=[],run=randomUUID();let userId:number,listingId:string;
const post=(b:object,key='synthetic-retail-admin')=>http.post('/retail/observations').set('X-Admin-Key',key).send(b);
beforeAll(async()=>{userId=(await prisma.user.create({data:{phoneNumber:'retail-test-'+run,password:'synthetic-only'}})).id;listingId=(await prisma.listing.create({data:{ownerUserId:userId,clientListingId:randomUUID(),requestHash:'synthetic-retail-test',title:'Samsung Galaxy Buds3 全新未拆',category:'electronics',condition:'NEW',price:2500,currency:'TWD',status:'ACTIVE',publishedAt:new Date(),expiresAt:new Date(Date.now()+86400000)}})).id;});
afterAll(async()=>{await prisma.retailPriceObservation.deleteMany({where:{id:{in:ids}}});await prisma.listing.deleteMany({where:{ownerUserId:userId}});await prisma.user.delete({where:{id:userId}});await prisma.$disconnect();});
it('requires the existing admin credential and never opens a public write path',async()=>{expect((await http.get('/retail/candidates')).status).toBe(401);expect((await post({},'forged')).status).toBe(401);});
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
