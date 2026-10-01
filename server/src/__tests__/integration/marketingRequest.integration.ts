import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import routes from '../../routes/marketingRoutes';
import { marketingRequestBody } from '../../controllers/marketingRequestController';
import { marketingSnapshotHash } from '../../lib/marketingAssistantAccess';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal isolated DB URLs required');
const saved={secret:process.env.JWT_SECRET,enabled:process.env.MARKETING_ASSISTANT_ENABLED,worker:process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN};
const secret='marketing-request-isolated-only';process.env.JWT_SECRET=secret;process.env.MARKETING_ASSISTANT_ENABLED='1';process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN='synthetic-local-worker-not-called';
const app=express();app.set('trust proxy',1);app.use(express.json());app.use('/api/marketing',routes);
let users:number[]=[],photo:string,listingId:string,ip=0;
const token=(id=users[0])=>jwt.sign({id,authVersion:0},secret);
const http=(method:'get'|'post',path:string,user=users[0])=>request(app)[method]('/api/marketing'+path).set('Authorization','Bearer '+token(user)).set('X-Forwarded-For',`198.51.100.${++ip%250+1}`);
const body=()=>({kind:'CREATE',sourceMediaId:photo,listingId,expectedVersion:1});
const send=(id:string,payload=body(),user=users[0])=>http('post','/requests/'+id,user).send(payload);
const read=(id:string,user=users[0])=>http('get','/requests/'+id,user);
const cancel=(id:string,payload=body(),user=users[0])=>http('post','/requests/'+id+'/abandon',user).send({sourceMediaId:payload.sourceMediaId,requestHash:marketingSnapshotHash(marketingRequestBody(payload))});
beforeAll(async()=>{const run=randomUUID();users=(await Promise.all(['owner','other'].map(role=>prisma.user.create({data:{phoneNumber:run+role,password:'synthetic-unused'},select:{id:true}})))).map(u=>u.id);});
beforeEach(async()=>{
  await prisma.marketingRequestReceipt.deleteMany({where:{userId:{in:users}}});await prisma.marketingJob.deleteMany({where:{ownerUserId:{in:users}}});await prisma.listingMedia.deleteMany({where:{ownerUserId:{in:users}}});await prisma.listing.deleteMany({where:{ownerUserId:{in:users}}});await prisma.user.updateMany({where:{id:{in:users}},data:{authVersion:0}});
  process.env.MARKETING_ASSISTANT_ENABLED='1';photo=randomUUID();listingId=randomUUID();
  await prisma.listing.create({data:{id:listingId,ownerUserId:users[0],clientListingId:randomUUID(),requestHash:randomUUID(),title:'合成橘色二手檯燈',description:'僅供隔離資料驗收，不是真實商品。',price:350,currency:'TWD',category:'home',status:'ACTIVE',version:1,publishedAt:new Date(),expiresAt:new Date(Date.now()+30*86400000),media:{create:{id:photo,ownerUserId:users[0],imageUrl:'https://example.invalid/image',thumbnailUrl:'https://example.invalid/thumb',contentHash:'synthetic-photo'}}}});
});
afterEach(()=>jest.restoreAllMocks());
afterAll(async()=>{try{if(users.length)await prisma.user.deleteMany({where:{id:{in:users}}});}finally{await prisma.$disconnect();for(const [key,value] of Object.entries({JWT_SECRET:saved.secret,MARKETING_ASSISTANT_ENABLED:saved.enabled,WISHLIST_MINIMAX_CALLBACK_TOKEN:saved.worker})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}});
describe('durable marketing create/revision requests',()=>{
  it('database fences invalid terminal states and duplicate owner request keys',async()=>{
    const id=randomUUID(),base={userId:users[0],clientRequestId:id,sourceMediaId:photo,requestHash:'a'.repeat(64)};
    for(const data of [{...base,state:'QUEUED',jobId:null},{...base,state:'ABANDONED',jobId:randomUUID()},{...base,state:'invalid',jobId:null}])await expect(prisma.marketingRequestReceipt.create({data})).rejects.toThrow();
    await prisma.marketingRequestReceipt.create({data:{...base,state:'ABANDONED'}});await expect(prisma.marketingRequestReceipt.create({data:{...base,state:'ABANDONED'}})).rejects.toThrow();
    await prisma.marketingRequestReceipt.create({data:{...base,userId:users[1],state:'ABANDONED'}});expect(await prisma.marketingRequestReceipt.count({where:{clientRequestId:id}})).toBe(2);
  });
  it('queues once with strict immutable receipt and owner-only no-store read',async()=>{
    const id=randomUUID(),first=await send(id);expect(first.status).toBe(200);expect(first.headers['cache-control']).toBe('private, no-store');
    expect(Object.keys(first.body.receipt).sort()).toEqual(['clientRequestId','sourceMediaId','requestHash','state','jobId','createdAt'].sort());expect(Object.keys(first.body.job).sort()).toEqual(['id','status','sourceMediaId','listingId','parentJobId'].sort());
    expect(first.body.receipt).toMatchObject({clientRequestId:id,sourceMediaId:photo,requestHash:marketingSnapshotHash(marketingRequestBody(body())),state:'QUEUED',jobId:first.body.job.id});
    expect((await send(id)).body).toEqual(first.body);expect((await read(id)).body).toEqual(first.body);expect((await read(id,users[1])).status).toBe(404);
    expect(await prisma.marketingJob.count({where:{ownerUserId:users[0]}})).toBe(1);expect(await prisma.marketingRequestReceipt.count({where:{userId:users[0]}})).toBe(1);expect(JSON.stringify(first.body)).not.toMatch(/password|apiKey|authVersion|phoneNumber|workerLease|snapshot/);
  });
  it('12 concurrent retries reserve one job and one monthly use',async()=>{
    const id=randomUUID(),results=await Promise.all(Array.from({length:12},()=>send(id)));expect(results.every(r=>r.status===200)).toBe(true);expect(new Set(results.map(r=>r.body.job.id)).size).toBe(1);
    expect((await http('get','/availability')).body.freeUsedThisMonth).toBe(1);
  });
  it('retains original proof after product changes and job erasure; never recreates on retry',async()=>{
    const id=randomUUID(),first=await send(id);await prisma.listing.update({where:{id:listingId},data:{version:2,title:'另一装置修改的名稱'}});
    expect((await send(id)).body.receipt).toEqual(first.body.receipt);expect((await send(randomUUID())).status).toBe(409);
    await prisma.marketingJob.delete({where:{id:first.body.job.id}});await prisma.listingMedia.delete({where:{id:photo}});
    expect((await send(id)).body).toEqual({receipt:first.body.receipt,job:null});expect((await cancel(id)).body.receipt.state).toBe('QUEUED');expect(await prisma.marketingJob.count({where:{ownerUserId:users[0]}})).toBe(0);
  });
  it('missing reads do not create receipts; other-owner mutations and changed hashes are refused',async()=>{
    const id=randomUUID();expect((await read(id)).status).toBe(404);expect(await prisma.marketingRequestReceipt.count({where:{userId:users[0]}})).toBe(0);
    expect((await send(id,body(),users[1])).status).toBe(404);expect((await cancel(id,body(),users[1])).status).toBe(404);await send(id);
    expect((await send(id,{...body(),expectedVersion:2})).status).toBe(409);expect((await cancel(id,{...body(),expectedVersion:2})).status).toBe(409);
  });
  it('cancellation first fences modern and legacy late posts and survives photo erasure',async()=>{
    const id=randomUUID(),canceled=await cancel(id);expect(canceled.body.receipt.state).toBe('ABANDONED');expect((await send(id)).body.receipt.state).toBe('ABANDONED');
    expect((await http('post','/jobs').send({clientRequestId:id,sourceMediaId:photo,listingId})).status).toBe(409);
    await prisma.listingMedia.delete({where:{id:photo}});expect((await send(id)).body.receipt).toEqual(canceled.body.receipt);expect(await prisma.marketingJob.count({where:{ownerUserId:users[0]}})).toBe(0);
  });
  it('create/cancel race has one terminal receipt and no unreceipted job',async()=>{
    const id=randomUUID(),results=await Promise.all([send(id),cancel(id)]);expect(results.every(r=>r.status===200)).toBe(true);const r=(await read(id)).body.receipt;
    expect(await prisma.marketingJob.count({where:{ownerUserId:users[0]}})).toBe(r.state==='QUEUED'?1:0);expect(await prisma.marketingRequestReceipt.count({where:{userId:users[0]}})).toBe(1);
  });
  it('allows exact one free revision, retains canonical slots and does not consume another monthly use',async()=>{
    const root=await send(randomUUID()),parentJobId=root.body.job.id;
    for(let slot=1;slot<=4;slot++)await prisma.listingMedia.create({data:{ownerUserId:users[0],imageUrl:'https://example.invalid/image',thumbnailUrl:'https://example.invalid/thumb',contentHash:randomUUID(),capturePurpose:'AI_MARKETING',marketingJobId:parentJobId,marketingSlot:slot}});
    await prisma.marketingJob.update({where:{id:parentJobId},data:{status:'REVIEW',deliveredAt:new Date(),copy:'隔離行銷測試文案，不是真實商品，不提供品質保證。'}});
    const id=randomUUID(),revision={kind:'REVISION',sourceMediaId:photo,listingId,parentJobId,prompt:'調整背景光線',slots:[4,2]};
    const first=await http('post','/requests/'+id).send(revision);expect(first.body.job.parentJobId).toBe(parentJobId);
    expect((await http('post','/requests/'+id).send({...revision,slots:[2,4]})).body).toEqual(first.body);
    expect((await http('post','/requests/'+randomUUID()).send(revision)).status).toBe(409);expect((await http('get','/availability')).body.freeUsedThisMonth).toBe(1);
    expect((await prisma.marketingJob.findUniqueOrThrow({where:{id:first.body.job.id}})).revisionSlots).toEqual([2,4]);
  });
  it('recovers already queued work when feature disabled but refuses new jobs',async()=>{
    const id=randomUUID(),first=await send(id);process.env.MARKETING_ASSISTANT_ENABLED='0';expect((await read(id)).body.receipt).toEqual(first.body.receipt);expect((await send(id)).body.receipt).toEqual(first.body.receipt);expect((await send(randomUUID())).status).toBe(503);
  });
  it('requires matching draft version and creates from the private snapshot',async()=>{
    await prisma.listingMedia.update({where:{id:photo},data:{listingId:null,capturePurpose:'BATCH_ITEM',sellerDraftVersion:3,aiDraftStatus:'COMPLETED',sellerDraft:{clientListingId:randomUUID(),form:{title:'合成橘色檯燈',description:'保留原私密草稿，尚未公開的商品。',price:'350',category:'home',condition:'USED',brand:''},touched:{}}}});
    expect((await http('post','/requests/'+randomUUID()).send({...body(),listingId:null,expectedVersion:2})).status).toBe(409);
    const response=await http('post','/requests/'+randomUUID()).send({...body(),listingId:null,expectedVersion:3});expect(response.body.job.listingId).toBeNull();expect((await prisma.marketingJob.findUniqueOrThrow({where:{id:response.body.job.id}})).snapshot).toMatchObject({sellerDraftVersion:3,priceTwd:'350'});
  });
  it('rechecks JWT after middleware under owner gate',async()=>{
    const tx=prisma.$transaction.bind(prisma);let once=true;jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>{if(once){once=false;return prisma.user.update({where:{id:users[0]},data:{authVersion:1}}).then(()=>tx(fn,options));}return tx(fn,options);})as any);
    expect((await send(randomUUID())).status).toBe(401);expect(await prisma.marketingJob.count({where:{ownerUserId:users[0]}})).toBe(0);
  });
  it('rolls back a job if receipt persistence fails',async()=>{
    const tx=prisma.$transaction.bind(prisma);jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>tx(async inner=>fn(new Proxy(inner,{get(target,key){if(key==='marketingRequestReceipt')return new Proxy(target.marketingRequestReceipt,{get(model,name){return name==='create'?()=>{throw Error('synthetic receipt persistence failure');}:Reflect.get(model,name);}});return Reflect.get(target,key);}})),options))as any);
    expect((await send(randomUUID())).status).toBe(503);expect(await prisma.marketingJob.count({where:{ownerUserId:users[0]}})).toBe(0);expect(await prisma.marketingRequestReceipt.count({where:{userId:users[0]}})).toBe(0);
  });
  it('rejects extra/private fields, invalid versions, queries, ids and invalid revision slots',async()=>{
    const id=randomUUID();for(const invalid of [{...body(),token:'no'},{...body(),expectedVersion:-1},{...body(),expectedVersion:1000001},{kind:'REVISION',sourceMediaId:photo,listingId,parentJobId:randomUUID(),prompt:'valid',slots:[1,1]}])expect((await http('post','/requests/'+id).send(invalid)).status).toBe(400);
    expect((await read('bad')).status).toBe(400);expect((await http('post','/requests/'+id+'?token=no').send(body())).status).toBe(400);
    expect(await prisma.marketingRequestReceipt.count({where:{userId:users[0]}})).toBe(0);
  });
});
