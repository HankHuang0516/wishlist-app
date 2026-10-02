import express from 'express';
import { createLoopbackRequest } from './loopbackHttp';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import routes from '../../routes/marketingRoutes';
import {marketingApprovalBody} from '../../controllers/marketingApprovalController';
import {MarketingInputError,marketingSnapshotHash} from '../../lib/marketingAssistantAccess';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal isolated DB URLs required');
const saved={JWT_SECRET:process.env.JWT_SECRET,MARKETING_ASSISTANT_ENABLED:process.env.MARKETING_ASSISTANT_ENABLED,WISHLIST_MINIMAX_CALLBACK_TOKEN:process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN};
const secret='marketing-approval-isolated-only';process.env.JWT_SECRET=secret;process.env.MARKETING_ASSISTANT_ENABLED='1';process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN='synthetic-worker-not-called-no-external-provider';
const app=express();app.set('trust proxy',1);app.use(express.json());app.use('/api/marketing',routes);
const isolatedHttp=createLoopbackRequest(app);
let users:number[]=[],sourceMediaId:string,listingId:string,jobId:string,ids:string[]=[],ip=0;
const copy='合成橘色二手檯燈，售價 NT$350。僅供隔離驗收，非真實商品。';
const http=(method:'get'|'post',path:string,user=users[0])=>isolatedHttp[method]('/api/marketing'+path).set('Authorization','Bearer '+jwt.sign({id:user,authVersion:0},secret)).set('X-Forwarded-For',`198.51.100.${++ip%250+1}`);
const body=():ReturnType<typeof marketingApprovalBody>=>({kind:'APPROVE',jobId,sourceMediaId,listingId,expectedVersion:1,selectedMediaIds:ids,copy});
const send=(id:string,payload:ReturnType<typeof marketingApprovalBody>=body(),user=users[0])=>http('post','/approvals/'+id,user).send(payload);
const read=(id:string,user=users[0])=>http('get','/approvals/'+id,user);
const cancel=(id:string,payload:ReturnType<typeof marketingApprovalBody>=body(),user=users[0])=>http('post','/approvals/'+id+'/abandon',user).send({jobId:payload.jobId,sourceMediaId:payload.sourceMediaId,listingId:payload.listingId,requestHash:marketingSnapshotHash(marketingApprovalBody(payload))});
beforeAll(async()=>{const run=randomUUID();users=(await Promise.all(['owner','other'].map(role=>prisma.user.create({data:{phoneNumber:run+role,password:'synthetic-unused'},select:{id:true}})))).map(u=>u.id);});
beforeEach(async()=>{
  await prisma.marketingApprovalReceipt.deleteMany({where:{userId:{in:users}}});await prisma.marketingRequestReceipt.deleteMany({where:{userId:{in:users}}});await prisma.marketingJob.deleteMany({where:{ownerUserId:{in:users}}});await prisma.listingMedia.deleteMany({where:{ownerUserId:{in:users}}});await prisma.listing.deleteMany({where:{ownerUserId:{in:users}}});await prisma.user.updateMany({where:{id:{in:users}},data:{authVersion:0}});
  sourceMediaId=randomUUID();listingId=randomUUID();
  await prisma.listing.create({data:{id:listingId,ownerUserId:users[0],clientListingId:randomUUID(),requestHash:randomUUID(),title:'合成橘色二手檯燈',description:'隔離驗收，原始實拍內容保留。',price:350,currency:'TWD',category:'home',status:'ACTIVE',version:1,publishedAt:new Date(),expiresAt:new Date(Date.now()+30*86400000),media:{create:{id:sourceMediaId,ownerUserId:users[0],imageUrl:'https://example.invalid/image',thumbnailUrl:'https://example.invalid/thumb',contentHash:'synthetic-source'}}}});
  const queued=await http('post','/requests/'+randomUUID()).send({kind:'CREATE',sourceMediaId,listingId,expectedVersion:1});expect(queued.status).toBe(200);jobId=queued.body.job.id;ids=[];
  for(let slot=1;slot<=4;slot++){const m=await prisma.listingMedia.create({data:{ownerUserId:users[0],imageUrl:'https://example.invalid/image',thumbnailUrl:'https://example.invalid/thumb',contentHash:randomUUID(),capturePurpose:'AI_MARKETING',marketingJobId:jobId,marketingSlot:slot}});ids.push(m.id);}
  await prisma.marketingJob.update({where:{id:jobId},data:{status:'REVIEW',deliveredAt:new Date(),copy}});
});
afterEach(()=>jest.restoreAllMocks());
afterAll(async()=>{try{if(users.length)await prisma.user.deleteMany({where:{id:{in:users}}});}finally{await prisma.$disconnect();for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}});
describe('immutable marketing approval receipts and exact recovery',()=>{
  it('applies once with a strict private immutable receipt and ordered original proof',async()=>{
    const id=randomUUID(),original={...body(),selectedMediaIds:[ids[2],ids[0],ids[3],ids[1]]},first=await send(id,original);expect(first.status).toBe(200);expect(first.headers['cache-control']).toBe('private, no-store');
    expect(Object.keys(first.body)).toEqual(['receipt']);expect(Object.keys(first.body.receipt).sort()).toEqual(['clientActionId','jobId','sourceMediaId','listingId','requestHash','state','reason','appliedVersion','selectedMediaIds','copy','createdAt'].sort());
    expect(first.body.receipt).toMatchObject({clientActionId:id,state:'APPLIED',appliedVersion:2,selectedMediaIds:original.selectedMediaIds,copy,requestHash:marketingSnapshotHash(marketingApprovalBody(original))});
    expect((await read(id)).body).toEqual(first.body);expect((await send(id,original)).body).toEqual(first.body);expect((await cancel(id,original)).body).toEqual(first.body);
    const listing=await prisma.listing.findUniqueOrThrow({where:{id:listingId},include:{media:{orderBy:{position:'asc'}}}});expect(listing.version).toBe(2);expect(listing.media.map(m=>m.id)).toEqual([...original.selectedMediaIds,sourceMediaId]);expect(listing.description?.split('【行銷小助手文案】')).toHaveLength(2);
    expect((await read(id,users[1])).status).toBe(404);expect((await send(randomUUID(),body(),users[1])).status).toBe(404);expect((await cancel(randomUUID(),body(),users[1])).status).toBe(404);
  });
  it('12 concurrent retries have one APPLIED receipt and one version increment',async()=>{
    const id=randomUUID(),responses=await Promise.all(Array.from({length:12},()=>send(id)));expect(responses.every(r=>r.status===200)).toBe(true);expect(new Set(responses.map(r=>JSON.stringify(r.body))).size).toBe(1);expect(await prisma.marketingApprovalReceipt.count({where:{userId:users[0],state:'APPLIED'}})).toBe(1);expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId}})).version).toBe(2);
  });
  it('retains proof after subsequent edits, job and source erasure; original retry never republishes',async()=>{
    const id=randomUUID(),first=await send(id);await prisma.listing.update({where:{id:listingId},data:{version:8,title:'後續名稱',description:'後續說明'}});expect((await read(id)).body).toEqual(first.body);expect((await send(id)).body).toEqual(first.body);
    await prisma.marketingJob.delete({where:{id:jobId}});await prisma.listingMedia.deleteMany({where:{ownerUserId:users[0]}});await prisma.listing.delete({where:{id:listingId}});
    expect((await read(id)).body).toEqual(first.body);expect((await send(id)).body).toEqual(first.body);expect((await cancel(id)).body).toEqual(first.body);expect(await prisma.listing.count({where:{id:listingId}})).toBe(0);
    expect((await send(id,{...body(),copy:copy+'其他內容'})).status).toBe(409);
  });
  it('missing read is read-only; cancellation first fences late POST while a new explicit action remains possible',async()=>{
    const id=randomUUID();expect((await read(id)).status).toBe(404);expect(await prisma.marketingApprovalReceipt.count({where:{userId:users[0]}})).toBe(0);
    const first=await cancel(id);expect(first.body.receipt.state).toBe('ABANDONED');expect((await send(id)).body).toEqual(first.body);expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId}})).version).toBe(1);expect((await send(randomUUID())).body.receipt.state).toBe('APPLIED');
  });
  it('approval/cancel race has one terminal receipt and no unreceipted mutation',async()=>{
    const id=randomUUID(),r=await Promise.all([send(id),cancel(id)]);expect(r.every(x=>x.status===200)).toBe(true);const proof=(await read(id)).body.receipt;expect(['APPLIED','ABANDONED']).toContain(proof.state);expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId}})).version).toBe(proof.state==='APPLIED'?2:1);expect(await prisma.marketingApprovalReceipt.count({where:{userId:users[0]}})).toBe(1);
  });
  it('persists a rejected old-version operation instead of overwriting; retry remains CONFLICT',async()=>{
    const id=randomUUID();await prisma.listing.update({where:{id:listingId},data:{version:2}});const first=await send(id);expect(first.body.receipt).toMatchObject({state:'CONFLICT',reason:'LISTING_CONFLICT',appliedVersion:null,selectedMediaIds:null,copy:null});expect((await send(id)).body).toEqual(first.body);expect((await prisma.marketingJob.findUniqueOrThrow({where:{id:jobId}})).status).toBe('REVIEW');expect((await send(randomUUID(),{...body(),expectedVersion:2})).body.receipt.appliedVersion).toBe(3);
  });
  it('original root proof survives child approval; root GET and legacy replay cannot restore old public selection',async()=>{
    const id=randomUUID(),first=await send(id);const q=await http('post','/requests/'+randomUUID()).send({kind:'REVISION',sourceMediaId,listingId,parentJobId:jobId,prompt:'調亮第二及第四張背景',slots:[2,4]});expect(q.status).toBe(200);const childId=q.body.job.id,childs:string[]=[];
    for(const slot of [2,4]){const m=await prisma.listingMedia.create({data:{ownerUserId:users[0],imageUrl:'https://example.invalid/image',thumbnailUrl:'https://example.invalid/thumb',contentHash:randomUUID(),capturePurpose:'AI_MARKETING',marketingJobId:childId,marketingSlot:slot}});childs.push(m.id);}
    await prisma.marketingJob.update({where:{id:childId},data:{status:'REVIEW',deliveredAt:new Date(),copy:copy+' 調整版。'}});
    const chosen=[ids[0],childs[0],ids[2],childs[1]],approved=await send(randomUUID(),{...body(),jobId:childId,expectedVersion:2,selectedMediaIds:chosen,copy:copy+' 調整版。'});expect(approved.body.receipt.appliedVersion).toBe(3);
    expect((await read(id)).body).toEqual(first.body);const root=await http('get','/jobs/'+jobId);expect(root.body.selectedMediaIds).toEqual(ids);expect(root.body.copy).toBe(copy);
    expect((await http('post','/jobs/'+jobId+'/approve').send({selectedMediaIds:ids,copy})).body).toEqual({listingId,selectedMediaIds:ids});expect((await send(id)).body).toEqual(first.body);
    const current=await prisma.listing.findUniqueOrThrow({where:{id:listingId},include:{media:{orderBy:{position:'asc'}}}});expect(current.version).toBe(3);expect(current.media.map(m=>m.id)).toEqual([...chosen,sourceMediaId]);
  });
  it('preserves native ACK and records new native approvals without changing old request fields',async()=>{
    const first=await http('post','/jobs/'+jobId+'/approve').send({selectedMediaIds:ids,copy});expect(first.status).toBe(200);expect(first.body).toEqual({listingId,selectedMediaIds:ids});expect((await prisma.marketingApprovalReceipt.findFirstOrThrow({where:{userId:users[0],jobId,state:'APPLIED'}})).appliedVersion).toBe(2);expect((await http('post','/jobs/'+jobId+'/approve').send({selectedMediaIds:ids,copy})).body).toEqual(first.body);
    const other=await send(randomUUID());expect(other.body.receipt).toMatchObject({state:'CONFLICT',reason:'ALREADY_APPROVED'});expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId}})).version).toBe(2);
  });
  it('records private seller-draft approval exactly once without creating a public listing',async()=>{
    const privateId=randomUUID(),draft={clientListingId:randomUUID(),form:{title:'合成橘色二手檯燈',description:'僅供隔離驗收，未公開商品。',brand:'',category:'home',condition:'USED',price:'350'},touched:{}};
    await prisma.listingMedia.create({data:{id:privateId,ownerUserId:users[0],imageUrl:'https://example.invalid/image',thumbnailUrl:'https://example.invalid/thumb',contentHash:randomUUID(),capturePurpose:'BATCH_ITEM',aiDraftStatus:'COMPLETED',sellerDraft:draft,sellerDraftVersion:4}});
    const queued=await http('post','/requests/'+randomUUID()).send({kind:'CREATE',sourceMediaId:privateId,listingId:null,expectedVersion:4});expect(queued.status).toBe(200);const privateJob=queued.body.job.id,chosen=[];
    for(let slot=1;slot<=4;slot++)chosen.push((await prisma.listingMedia.create({data:{ownerUserId:users[0],imageUrl:'https://example.invalid/image',thumbnailUrl:'https://example.invalid/thumb',contentHash:randomUUID(),capturePurpose:'AI_MARKETING',marketingJobId:privateJob,marketingSlot:slot}})).id);
    await prisma.marketingJob.update({where:{id:privateJob},data:{status:'REVIEW',deliveredAt:new Date(),copy}});
    const id=randomUUID(),original={...body(),jobId:privateJob,sourceMediaId:privateId,listingId:null,expectedVersion:4,selectedMediaIds:[chosen[3],chosen[0],chosen[2],chosen[1]]};
    const first=await send(id,original);expect(first.status).toBe(200);expect(first.body.receipt).toMatchObject({state:'APPLIED',listingId:null,appliedVersion:5,selectedMediaIds:original.selectedMediaIds});expect((await send(id,original)).body).toEqual(first.body);
    const saved=await prisma.listingMedia.findUniqueOrThrow({where:{id:privateId}});expect(saved.sellerDraftVersion).toBe(5);expect(saved.listingId).toBeNull();expect((saved.sellerDraft as typeof draft).form.description).toContain(copy);expect(await prisma.listing.count({where:{ownerUserId:users[0]}})).toBe(1); // Only the pre-existing public fixture.
    await prisma.listingMedia.update({where:{id:privateId},data:{sellerDraftVersion:12,sellerDraft:{...draft,form:{...draft.form,description:'後續商品草稿內容'}}}});
    expect((await send(id,original)).body).toEqual(first.body);expect((await read(id)).body).toEqual(first.body);expect((await prisma.listingMedia.findUniqueOrThrow({where:{id:privateId}})).sellerDraftVersion).toBe(12);
  });
  it('rolls back partial media/description mutations to a savepoint before recording CONFLICT',async()=>{
    const transaction=prisma.$transaction.bind(prisma);let writes=0;jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>transaction(async tx=>fn(new Proxy(tx,{get(target,key){if(key==='listingMedia')return new Proxy(target.listingMedia,{get(model,name){if(name==='updateMany')return async(...args:any[])=>{if(++writes===3)throw new MarketingInputError('LISTING_CONFLICT',409);return (model.updateMany as any)(...args);};return Reflect.get(model,name);}});return Reflect.get(target,key);}})),options))as any);
    const result=await send(randomUUID());expect(result.body.receipt.state).toBe('CONFLICT');expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId},include:{media:true}})).media.map(m=>m.id)).toEqual([sourceMediaId]);expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId}})).version).toBe(1);expect((await prisma.marketingJob.findUniqueOrThrow({where:{id:jobId}})).status).toBe('REVIEW');
  });
  it('receipt persistence failure rolls back the entire successful application',async()=>{
    const transaction=prisma.$transaction.bind(prisma);jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>transaction(async tx=>fn(new Proxy(tx,{get(target,key){if(key==='marketingApprovalReceipt')return new Proxy(target.marketingApprovalReceipt,{get(model,name){return name==='create'?()=>{throw Error('receipt storage failure');}:Reflect.get(model,name);}});return Reflect.get(target,key);}})),options))as any);
    expect((await send(randomUUID())).status).toBe(503);expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId}})).version).toBe(1);expect(await prisma.marketingApprovalReceipt.count({where:{userId:users[0]}})).toBe(0);expect((await prisma.marketingJob.findUniqueOrThrow({where:{id:jobId}})).status).toBe('REVIEW');
  });
  it.each(['submit','receipt','job','latest','availability'])('rechecks revoked JWT after middleware for %s',async mode=>{
    const transaction=prisma.$transaction.bind(prisma);let once=true;jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>{if(once){once=false;return prisma.user.update({where:{id:users[0]},data:{authVersion:1}}).then(()=>transaction(fn,options));}return transaction(fn,options);})as any);
    const result=mode==='submit'?await send(randomUUID()):mode==='receipt'?await read(randomUUID()):await http('get',mode==='job'?'/jobs/'+jobId:mode==='availability'?'/availability':'/jobs?sourceMediaId='+sourceMediaId);expect(result.status).toBe(401);expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId}})).version).toBe(1);
  });
  it.each(['submit','receipt','job','latest','availability'])('rechecks revoked API key after middleware for %s',async mode=>{
    const key='synthetic-approval-api-'+randomUUID();await prisma.user.update({where:{id:users[0]},data:{apiKey:key}});
    const transaction=prisma.$transaction.bind(prisma);let once=true;jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>{if(once){once=false;return prisma.user.update({where:{id:users[0]},data:{apiKey:null}}).then(()=>transaction(fn,options));}return transaction(fn,options);})as any);
    const path=mode==='submit'||mode==='receipt'?'/approvals/'+randomUUID():mode==='job'?'/jobs/'+jobId:mode==='availability'?'/availability':'/jobs?sourceMediaId='+sourceMediaId;
    const req=http(mode==='submit'?'post':'get',path).unset('Authorization').set('x-api-key',key);const result=mode==='submit'?await req.send(body()):await req;
    expect(result.status).toBe(401);expect(await prisma.marketingApprovalReceipt.count({where:{userId:users[0]}})).toBe(0);expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId}})).version).toBe(1);
  });
  it('database rejects invalid terminals/null APPLIED versions and permits one APPLIED record per job',async()=>{
    const base={userId:users[0],jobId,sourceMediaId,listingId,requestHash:'a'.repeat(64)},applied={...base,state:'APPLIED',appliedVersion:2,selectedMediaIds:ids,copy};
    for(const data of [{...applied,appliedVersion:null},{...base,state:'UNKNOWN'},{...base,state:'CONFLICT'},{...applied,state:'ABANDONED'},{...applied,selectedMediaIds:[]}])await expect(prisma.marketingApprovalReceipt.create({data:{...data,clientActionId:randomUUID()}})).rejects.toThrow();
    await prisma.marketingApprovalReceipt.create({data:{...applied,clientActionId:randomUUID()}});await expect(prisma.marketingApprovalReceipt.create({data:{...applied,clientActionId:randomUUID()}})).rejects.toThrow();await prisma.marketingApprovalReceipt.create({data:{...base,clientActionId:randomUUID(),state:'ABANDONED'}});await prisma.marketingApprovalReceipt.create({data:{...applied,userId:users[1],clientActionId:randomUUID()}});
  });
  it('rejects malformed bodies/queries/ids without recording or exposing a public action',async()=>{
    for(const b of [{...body(),copy:'short'},{...body(),expectedVersion:-1},{...body(),selectedMediaIds:[ids[0],ids[0]]},{...body(),token:'no'},{...body(),copy:'合法長文字內容'.repeat(5)+'\ud800'}])expect([400,422]).toContain((await send(randomUUID(),b)).status);
    expect((await send('bad')).status).toBe(400);expect((await http('post','/approvals/'+randomUUID()+'?token=no').send(body())).status).toBe(400);expect(await prisma.marketingApprovalReceipt.count({where:{userId:users[0]}})).toBe(0);
  });
});
