import express from 'express';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import {createDiscoveryRoutes} from '../../routes/discoveryRoutes';
import {parseLead} from '../../lib/sourceLeadRules';
import {loadDiscovery} from '../../lib/discovery';
import {evaluateCp,attachCp} from '../../lib/discoveryCp';
import {createLoopbackRequest} from './loopbackHttp';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB required');
const app=express();app.use(express.json());app.use('/discovery',createDiscoveryRoutes());const http=createLoopbackRequest(app);
const run=randomUUID(),apiKey=randomUUID(),otherKey=randomUUID();let userId:number,otherId:number,listingId:string;
const leadIds:string[]=[],oldFlag=process.env.SOURCE_LEADS_PUBLIC_ENABLED,oldModel=process.env.DISCOVERY_CP_MODEL,model='synthetic-cp-'+run;
beforeAll(async()=>{
 process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';
 process.env.DISCOVERY_CP_MODEL=model;
 [userId,otherId]=await Promise.all([apiKey,otherKey].map((key,i)=>prisma.user.create({data:{phoneNumber:'discovery-'+run+'-'+i,password:'synthetic',apiKey:key}}).then(r=>r.id)));
 listingId=(await prisma.listing.create({data:{ownerUserId:userId,clientListingId:randomUUID(),requestHash:'synthetic',title:'BenQ GW2270 合成二手電腦螢幕',category:'electronics',price:750,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000),publishedAt:new Date()}})).id;
 const rows=Array.from({length:503},(_,i)=>{const id=randomUUID(),url='https://www.facebook.com/groups/123456789/posts/'+id;const data=parseLead({archiveItemId:'SYNTHETIC-'+run+'-'+i,libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:3,archiveSha256:'a'.repeat(64),title:i===502?'合成二手筆電唯一尾頁商品':'BenQ GW2270 合成二手電腦螢幕 '+i,summary:'公開來源參考，庫存與交易待確認。',canonicalUrl:url,county:'臺南市',district:'永康區',publicPlaceName:'合成公共面交點',publicAddress:'臺南市永康區合成路123號',latitude:23,longitude:120.236,postedEarliestAt:new Date(Date.now()-86400000).toISOString(),postedLatestAt:new Date(Date.now()-86400000).toISOString(),checkedAt:new Date().toISOString(),evidence:{sourceUrl:url,sourcePublic:true,publicSourceRef:'self:synthetic-public',dateRef:'self:synthetic-date',locationRef:'self:synthetic-location',coordinateRef:'self:synthetic-coordinate',locationSourceUrl:'https://public.example.invalid/qa',coordinateSourceUrl:'https://public.example.invalid/map',publicPlace:true,locationType:'PUBLIC_MEETING_POINT',sourceMeetingPointConfirmed:true,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,reviewRef:'self:synthetic-review',publicFacts:{priceText:'1000',currencyStatus:'TWD',priceUnitStatus:'SOURCE_STATED',sourceAccessNotice:'公開來源',originalDateLabel:'來源昨日貼文',locationRelation:'公共面交點',coordinateQualityNotes:[]}}});leadIds.push(id);return{id,...data};});
 await prisma.externalSourceLead.createMany({data:rows});
 await prisma.wishlist.create({data:{userId,title:'合成私人願望',items:{create:{name:'電腦螢幕',maxPrice:800,priceCurrency:'TWD',aiStatus:'SKIPPED'}}}});
},30_000);
afterAll(async()=>{if(oldFlag===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=oldFlag;if(oldModel===undefined)delete process.env.DISCOVERY_CP_MODEL;else process.env.DISCOVERY_CP_MODEL=oldModel;await prisma.discoveryCpRun.deleteMany({where:{model}});await prisma.externalSourceLead.deleteMany({where:{id:{in:leadIds}}});await prisma.listing.deleteMany({where:{ownerUserId:userId}});await prisma.user.deleteMany({where:{id:{in:[userId,otherId]}}});await prisma.$disconnect();});
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
it('removes withdrawn sources and rejects prior-page cursors rather than mixing snapshots',async()=>{
 const first=await http.get('/discovery?limit=1');expect(first.body.nextCursor).toBeTruthy();
 await prisma.externalSourceLead.update({where:{id:leadIds[0]},data:{status:'WITHDRAWN'}});
 const next=await http.get('/discovery?limit=1&cursor='+first.body.nextCursor);expect(next.status).toBe(409);expect(next.body.errorCode).toBe('DISCOVERY_RESULTS_CHANGED');
 const disabled=process.env.SOURCE_LEADS_PUBLIC_ENABLED;process.env.SOURCE_LEADS_PUBLIC_ENABLED='0';
 const closed=await http.get('/discovery');expect(closed.body.counts.source).toBe(0);process.env.SOURCE_LEADS_PUBLIC_ENABLED=disabled;
});
it('stores bound injected-provider results, excludes stale evidence and never evaluates from a public GET',async()=>{
 expect((await http.post('/discovery/cp-evaluations').send({})).status).toBe(401);
 const all=await loadDiscovery();let calls=0;
 const provider=async(targets:any[])=>{calls++;return targets.map(t=>({key:t.product.key,verdict:'COMPARABLE',basisKeys:t.comparables.slice(0,2).map((p:any)=>p.key),dimensions:{price:35,specification:20,condition:15,evidence:10},reasons:[{zh:'僅比較測試資料明示規格。',en:'Compare only specifications stated in test data.'}],limitations:[{zh:'運費與實物狀況未核實。',en:'Shipping and actual condition unverified.'}]}));};
 const result=await evaluateCp(all,provider);expect(result.evaluated).toBe(6);expect(calls).toBe(1);
 const attached=await attachCp(all);const scored=attached.filter(p=>p.cp);expect(scored).toHaveLength(6);
 const publicRead=await http.get('/discovery/cp');expect(publicRead.status).toBe(200);expect(publicRead.body.total).toBe(6);expect(calls).toBe(1);
 const peerKey=scored[0].cp!.basis[0].key,peer=all.find(p=>p.key===peerKey)!;
 const changed=await attachCp(all.map(p=>p.key===peerKey?{...p,price:999999}:p));expect(changed.find(p=>p.key===scored[0].key)?.cp).toBeUndefined();
 expect(peer).toBeTruthy();
});
