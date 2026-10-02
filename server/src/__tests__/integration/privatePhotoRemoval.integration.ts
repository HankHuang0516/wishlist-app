import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import routes from '../../routes/listingMediaRoutes';
import { photoRemovalHash, photoRemovalPayload } from '../../lib/privatePhotoRemoval';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.TEST_DATABASE_URL!==process.env.DATABASE_URL)throw Error('Equal isolated database URLs required');
process.env.JWT_SECRET='isolated-private-photo-removal-only';
const app=express();app.use(express.json());app.use('/api/listing-media',routes);const server=createServer(app);
let users:number[]=[],mediaId:string,erasureIds:string[]=[];
const token=(id=users[0])=>jwt.sign({id,authVersion:0},process.env.JWT_SECRET!,{expiresIn:'1h'});
const http=(method:'post'|'get'|'delete',path:string,user=users[0])=>request(server)[method]('/api/listing-media'+path).set('Authorization','Bearer '+token(user));
const payload=(version=0)=>({mediaId,expectedVersion:version});
const send=(id:string,body=payload(),user=users[0])=>http('post','/photo-removals/'+id,user).send(body);
const read=(id:string,user=users[0])=>http('get','/photo-removals/'+id,user);
const stop=(id:string,hash=photoRemovalHash(photoRemovalPayload(payload())))=>http('post','/photo-removals/'+id+'/abandon').send({requestHash:hash});
const photo=(id:string,extra:Record<string,any>={})=>prisma.listingMedia.create({data:{id,ownerUserId:users[0],capturePurpose:'BATCH_ITEM',imageUrl:'https://example.invalid/photo',thumbnailUrl:'https://example.invalid/thumb',contentHash:'synthetic-no-provider',...extra}});
beforeAll(async()=>{await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const run=randomUUID();users=(await Promise.all(['owner','other'].map(role=>prisma.user.create({data:{phoneNumber:run+role,password:'synthetic-unused',isEmailVerified:true},select:{id:true}})))).map(row=>row.id);});
beforeEach(async()=>{await prisma.photoRemovalReceipt.deleteMany({where:{userId:{in:users}}});await prisma.marketingJob.deleteMany({where:{ownerUserId:{in:users}}});await prisma.listingMedia.deleteMany({where:{ownerUserId:{in:users}}});await prisma.listing.deleteMany({where:{ownerUserId:{in:users}}});await prisma.user.updateMany({where:{id:{in:users}},data:{authVersion:0}});mediaId=randomUUID();erasureIds.push(mediaId);await photo(mediaId);});
afterEach(()=>jest.restoreAllMocks());
afterAll(async()=>{try{if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.mediaErasureTask.deleteMany({where:{mediaId:{in:erasureIds}}});if(users.length)await prisma.user.deleteMany({where:{id:{in:users}}});}finally{await prisma.$disconnect();}});
describe('durable batch photo removal and legacy compatibility',()=>{
  it('commits one removal with immutable proof, minimal projection and a durable erasure task',async()=>{
    const id=randomUUID(),result=await send(id);expect(result.status).toBe(200);expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.body).toEqual({receipt:{clientActionId:id,mediaId,expectedVersion:0,requestHash:photoRemovalHash(photoRemovalPayload(payload())),state:'REMOVED',createdAt:expect.any(String)},media:null,cleanupPending:true});
    expect(await prisma.listingMedia.findUnique({where:{id:mediaId}})).toBeNull();expect(await prisma.mediaErasureTask.count({where:{mediaId}})).toBe(1);
    expect((await send(id)).body).toEqual(result.body);expect((await read(id)).body).toEqual(result.body);expect((await stop(id)).body.receipt.state).toBe('REMOVED');
    await prisma.mediaErasureTask.delete({where:{mediaId}});expect((await read(id)).body.cleanupPending).toBe(false);
    expect(await prisma.photoRemovalReceipt.count({where:{userId:users[0]}})).toBe(1);expect(JSON.stringify(result.body)).not.toMatch(/flickr|apiKey|password|removedIds|phoneNumber/);
  });
  it('GET missing proof never mutates; another owner and changed payload cannot adopt it',async()=>{
    const id=randomUUID();expect((await read(id)).status).toBe(404);expect(await prisma.listingMedia.findUnique({where:{id:mediaId}})).not.toBeNull();
    const other=await send(randomUUID(),payload(),users[1]);expect(other.body.receipt.state).toBe('UNAVAILABLE');expect(other.body.media).toBeNull();
    await send(id);expect((await read(id,users[1])).status).toBe(404);expect((await send(id,payload(1))).status).toBe(409);expect((await stop(id,'f'.repeat(64))).status).toBe(409);
  });
  it('12 concurrent replays produce one receipt and one root task',async()=>{
    const id=randomUUID(),results=await Promise.all(Array.from({length:12},()=>send(id)));
    expect(results.every(row=>row.status===200&&row.body.receipt.state==='REMOVED')).toBe(true);expect(await prisma.photoRemovalReceipt.count({where:{userId:users[0]}})).toBe(1);expect(await prisma.mediaErasureTask.count({where:{mediaId}})).toBe(1);
  });
  it('stale draft revision creates a terminal conflict, without deleting the newer draft',async()=>{
    await prisma.listingMedia.update({where:{id:mediaId},data:{sellerDraftVersion:1}});const id=randomUUID(),conflict=await send(id);expect(conflict.body.receipt.state).toBe('CONFLICT');expect(conflict.body.media.sellerDraftVersion).toBe(1);
    expect((await send(id,payload(1))).status).toBe(409);expect((await send(id)).body.receipt.state).toBe('CONFLICT');expect((await send(randomUUID(),payload(1))).body.receipt.state).toBe('REMOVED');expect((await read(id)).body.receipt.state).toBe('CONFLICT');
  });
  it.each(['DRAFT','ACTIVE'] as const)('never deletes a photo attached to a %s listing',async status=>{
    const listing=await prisma.listing.create({data:{ownerUserId:users[0],clientListingId:randomUUID(),requestHash:'a'.repeat(64),title:'synthetic',status,publishedAt:status==='ACTIVE'?new Date():null,expiresAt:status==='ACTIVE'?new Date(Date.now()+86400000):null}});await prisma.listingMedia.update({where:{id:mediaId},data:{listingId:listing.id}});
    expect((await send(randomUUID())).body.receipt.state).toBe('CONFLICT');expect((await http('delete','/'+mediaId)).status).toBe(404);expect(await prisma.listingMedia.findUnique({where:{id:mediaId}})).not.toBeNull();expect(await prisma.mediaErasureTask.count({where:{mediaId}})).toBe(0);
  });
  it.each(['MANUAL_PHOTO','LEGACY_UNKNOWN','AI_MARKETING'] as const)('does not remove a %s source through the batch receipt',async capturePurpose=>{
    await prisma.listingMedia.update({where:{id:mediaId},data:{capturePurpose}});expect((await send(randomUUID())).body.receipt.state).toBe('CONFLICT');expect(await prisma.listingMedia.findUnique({where:{id:mediaId}})).not.toBeNull();
  });
  it.each(['PENDING','PROCESSING','REVIEW'] as const)('blocks a source used by a %s marketing job through either endpoint',async status=>{
    await prisma.marketingJob.create({data:{ownerUserId:users[0],sourceMediaId:mediaId,status,clientRequestId:randomUUID(),snapshot:{},requestHash:'a'.repeat(64)}});
    expect((await send(randomUUID())).body.receipt.state).toBe('CONFLICT');expect((await http('delete','/'+mediaId)).status).toBe(404);expect(await prisma.marketingJob.count({where:{sourceMediaId:mediaId}})).toBe(1);
  });
  it('removes inactive source/jobs and unbound generated photos, retaining original proof and outbox tasks',async()=>{
    const job=await prisma.marketingJob.create({data:{ownerUserId:users[0],sourceMediaId:mediaId,status:'FAILED',clientRequestId:randomUUID(),snapshot:{},requestHash:'a'.repeat(64)}});
    const generated=randomUUID();erasureIds.push(generated);await photo(generated,{capturePurpose:'AI_MARKETING',marketingJobId:job.id,marketingSlot:1});
    const id=randomUUID(),result=await send(id);expect(result.body.receipt.state).toBe('REMOVED');expect(await prisma.marketingJob.findUnique({where:{id:job.id}})).toBeNull();expect(await prisma.listingMedia.findUnique({where:{id:generated}})).toBeNull();expect(await prisma.mediaErasureTask.count({where:{mediaId:{in:[mediaId,generated]}}})).toBe(2);expect((await read(id)).body.receipt.state).toBe('REMOVED');
  });
  it('hash-only stop before a late POST prevents deletion; a send/stop race has one terminal result',async()=>{
    const id=randomUUID();expect((await stop(id)).body).toMatchObject({receipt:{state:'ABANDONED',mediaId:null,expectedVersion:null},media:null,cleanupPending:false});expect((await send(id)).body.receipt.state).toBe('ABANDONED');expect(await prisma.listingMedia.findUnique({where:{id:mediaId}})).not.toBeNull();
    const raced=randomUUID(),[a,b]=await Promise.all([send(raced),stop(raced)]);expect(a.status).toBe(200);expect(b.status).toBe(200);expect(a.body.receipt.state).toBe(b.body.receipt.state);expect(['REMOVED','ABANDONED']).toContain(a.body.receipt.state);
  });
  it('does not remove a photo attached to a wish item',async()=>{
    const wishlist=await prisma.wishlist.create({data:{title:'synthetic',userId:users[0]}});
    const item=await prisma.item.create({data:{name:'synthetic wish',wishlistId:wishlist.id}});
    await prisma.listingMedia.update({where:{id:mediaId},data:{wishItemId:item.id}});
    expect((await send(randomUUID())).body.receipt.state).toBe('CONFLICT');expect((await http('delete','/'+mediaId)).status).toBe(404);expect(await prisma.listingMedia.findUnique({where:{id:mediaId}})).not.toBeNull();
  });
  it('deleting the account cascades its receipt and does not erase another owner receipt',async()=>{
    const other=await prisma.user.create({data:{phoneNumber:randomUUID(),password:'synthetic-unused',isEmailVerified:true}});
    const abandoned=await http('post','/photo-removals/'+randomUUID()+'/abandon',other.id).send({requestHash:'a'.repeat(64)});expect(abandoned.status).toBe(200);
    const mine=randomUUID();await stop(mine);await prisma.user.delete({where:{id:other.id}});expect(await prisma.photoRemovalReceipt.count({where:{userId:other.id}})).toBe(0);expect((await read(mine)).body.receipt.state).toBe('ABANDONED');
  });
  it('legacy native DELETE still returns 204 and cannot create another deletion on retry',async()=>{
    expect((await http('delete','/'+mediaId)).status).toBe(204);expect((await http('delete','/'+mediaId)).status).toBe(404);const result=await send(randomUUID());expect(result.body.receipt.state).toBe('UNAVAILABLE');expect(result.body.media).toBeNull();
  });
  it('rechecks session after middleware while waiting for owner gate, including readonly and abandonment',async()=>{
    const tx=prisma.$transaction.bind(prisma);jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>prisma.user.update({where:{id:users[0]},data:{authVersion:1}}).then(()=>tx(fn,options)))as any);
    expect((await send(randomUUID())).status).toBe(401);expect((await read(randomUUID())).status).toBe(401);expect((await stop(randomUUID())).status).toBe(401);expect(await prisma.listingMedia.findUnique({where:{id:mediaId}})).not.toBeNull();expect(await prisma.photoRemovalReceipt.count({where:{userId:users[0]}})).toBe(0);
  });
  it('rolls back photo/job/outbox deletion when saving the receipt fails',async()=>{
    const tx=prisma.$transaction.bind(prisma);
    jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>tx(async transaction=>{
      const receiptCreate=transaction.photoRemovalReceipt.create;
      transaction.photoRemovalReceipt.create=(()=>{throw Error('synthetic receipt failure');}) as any;
      try{return await fn(transaction);}finally{transaction.photoRemovalReceipt.create=receiptCreate;}
    },options)) as any);
    expect((await send(randomUUID())).status).toBe(503);expect(await prisma.listingMedia.findUnique({where:{id:mediaId}})).not.toBeNull();expect(await prisma.mediaErasureTask.count({where:{mediaId}})).toBe(0);expect(await prisma.photoRemovalReceipt.count({where:{userId:users[0]}})).toBe(0);
  });
  it('database constraints reject null versions, wrong terminal fields and malformed hashes',async()=>{
    for(const data of [
      {state:'REMOVED',mediaId,expectedVersion:null,removedIds:[mediaId],requestHash:'a'.repeat(64)},
      {state:'REMOVED',mediaId,expectedVersion:0,removedIds:[],requestHash:'a'.repeat(64)},
      {state:'ABANDONED',mediaId,expectedVersion:0,removedIds:[],requestHash:'a'.repeat(64)},
      {state:'ABANDONED',mediaId:null,expectedVersion:null,removedIds:[],requestHash:'bad'}
    ])await expect(prisma.photoRemovalReceipt.create({data:{userId:users[0],clientActionId:randomUUID(),...data}})).rejects.toThrow();
    expect(await prisma.photoRemovalReceipt.count({where:{userId:users[0]}})).toBe(0);
  });
  it('invalid input, query and hash create no receipt or deletion',async()=>{
    for(const body of [{mediaId,expectedVersion:-1},{mediaId,expectedVersion:null},{mediaId:'bad',expectedVersion:0},{...payload(),extra:true}])expect((await send(randomUUID(),body as any)).status).toBe(400);
    expect((await read('bad')).status).toBe(400);expect((await http('get','/photo-removals/'+randomUUID()+'?extra=1')).status).toBe(400);expect((await stop(randomUUID(),'bad')).status).toBe(400);expect(await prisma.photoRemovalReceipt.count({where:{userId:users[0]}})).toBe(0);
  });
});
