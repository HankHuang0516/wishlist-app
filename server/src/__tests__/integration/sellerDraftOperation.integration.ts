import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import routes from '../../routes/listingMediaRoutes';
import { sellerDraftHash, sellerDraftPayload } from '../../lib/sellerDraftOperation';

require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal isolated DB URLs required');
const secret='seller-draft-isolated-only';process.env.JWT_SECRET=secret;
const app=express();app.use(express.json());app.use('/api/listing-media',routes);
const server=createServer(app);let users:number[]=[],photo:string;
const token=(id=users[0],version=0)=>jwt.sign({id,authVersion:version},secret,{expiresIn:'1h'});
const http=(method:'get'|'post'|'put',path:string,user=users[0])=>request(server)[method]('/api/listing-media'+path).set('Authorization','Bearer '+token(user));
const draft=()=>({clientListingId:'12345678-1234-4234-8234-123456789abc',form:{title:'合成二手燈',description:'保留原草稿內容\n尚未公開',brand:'',category:'home',condition:'USED',price:'350'},touched:{title:true,price:true}});
const payload=()=>({expectedVersion:0,draft:draft()});
const save=(id:string,body=payload(),user=users[0],media=photo)=>http('post',`/${media}/seller-draft-operations/${id}`,user).send(body);
const read=(id:string,user=users[0])=>http('get','/seller-draft-operations/'+id,user);
const cancel=(id:string,hash=sellerDraftHash(photo,sellerDraftPayload(payload())),user=users[0],media=photo)=>http('post',`/${media}/seller-draft-operations/${id}/abandon`,user).send({requestHash:hash});
beforeAll(async()=>{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const run=randomUUID();users=(await Promise.all(['owner','other'].map(role=>prisma.user.create({data:{phoneNumber:run+role,password:'synthetic-unused',isEmailVerified:true},select:{id:true}})))).map(u=>u.id);
});
beforeEach(async()=>{
  await prisma.sellerDraftReceipt.deleteMany({where:{userId:{in:users}}});
  await prisma.listingMedia.deleteMany({where:{ownerUserId:{in:users}}});
  await prisma.user.updateMany({where:{id:{in:users}},data:{authVersion:0}});
  photo=randomUUID();await prisma.listingMedia.create({data:{id:photo,ownerUserId:users[0],capturePurpose:'BATCH_ITEM',imageUrl:'https://example.invalid/image',thumbnailUrl:'https://example.invalid/thumb',contentHash:'synthetic-no-provider'}});
});
afterEach(()=>jest.restoreAllMocks());
afterAll(async()=>{try{if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));if(users.length)await prisma.user.deleteMany({where:{id:{in:users}}});}finally{await prisma.$disconnect();}});
describe('private seller-draft durable original operation',()=>{
  it('applies once and returns strict owner projection and immutable proof',async()=>{
    const id=randomUUID(),first=await save(id);expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(Object.keys(first.body.receipt).sort()).toEqual(['clientActionId','mediaId','requestHash','state','appliedVersion','createdAt'].sort());
    expect(Object.keys(first.body.media).sort()).toEqual(['id','ownerUserId','listingId','wishItemId','capturePurpose','sellerDraft','sellerDraftVersion'].sort());
    expect(first.body.receipt).toMatchObject({clientActionId:id,mediaId:photo,requestHash:sellerDraftHash(photo,sellerDraftPayload(payload())),state:'APPLIED',appliedVersion:1});
    expect(first.body.media.sellerDraft).toEqual(sellerDraftPayload(payload()).draft);
    expect((await save(id)).body).toEqual(first.body);expect((await read(id)).body).toEqual(first.body);
    expect(await prisma.sellerDraftReceipt.count({where:{userId:users[0]}})).toBe(1);
    expect((await prisma.listingMedia.findUniqueOrThrow({where:{id:photo}})).sellerDraftVersion).toBe(1);
    expect(JSON.stringify(first.body)).not.toMatch(/flickr|password|apiKey|authVersion|phoneNumber|preciseLatitude/);
  });
  it('missing GET is read-only; wrong owner and changed payload/media never adopt another save',async()=>{
    const id=randomUUID();expect((await read(id)).status).toBe(404);expect(await prisma.sellerDraftReceipt.count({where:{userId:users[0]}})).toBe(0);
    await save(id);expect((await read(id,users[1])).status).toBe(404);
    expect((await save(id,{...payload(),draft:{...draft(),form:{...draft().form,title:'changed'}}})).status).toBe(409);
    expect((await save(id,payload(),users[0],randomUUID())).status).toBe(409);
    expect((await cancel(id,'f'.repeat(64))).status).toBe(409);
    expect((await save(id,payload(),users[1])).status).toBe(404);
  });
  it('normalizes UUID case and input key/touched ordering without duplicate saves',async()=>{
    const id=randomUUID(),body=payload();body.draft.clientListingId=body.draft.clientListingId.toUpperCase();
    expect((await save(id.toUpperCase(),body)).status).toBe(200);
    expect((await save(id,{draft:{...draft(),touched:{price:true,title:true}},expectedVersion:0})).body.receipt.state).toBe('APPLIED');
    expect((await read(id.toUpperCase())).body.receipt.clientActionId).toBe(id);
  });
  it('serializes 12 concurrent retries to one revision and one receipt',async()=>{
    const id=randomUUID(),results=await Promise.all(Array.from({length:12},()=>save(id)));
    expect(results.every(r=>r.status===200&&r.body.receipt.appliedVersion===1)).toBe(true);
    expect(await prisma.sellerDraftReceipt.count({where:{userId:users[0]}})).toBe(1);
    expect((await prisma.listingMedia.findUniqueOrThrow({where:{id:photo}})).sellerDraftVersion).toBe(1);
  });
  it('shares revision with legacy native PUT and retains a conflict terminal receipt',async()=>{
    const legacy=await http('put',`/${photo}/seller-draft`).send(payload());expect(legacy.status).toBe(200);expect(legacy.body).toEqual({mediaId:photo,version:1});
    const id=randomUUID(),conflict=await save(id);expect(conflict.body.receipt).toMatchObject({state:'CONFLICT',appliedVersion:null});
    expect((await save(id)).body.receipt.state).toBe('CONFLICT');
    expect((await save(id,{...payload(),expectedVersion:1})).status).toBe(409);
    expect((await save(randomUUID(),{...payload(),expectedVersion:1})).body.receipt.appliedVersion).toBe(2);
    expect((await read(id)).body.media.sellerDraftVersion).toBe(2);
  });
  it('does not undo an applied save when canceled, and cancellation-first fences a late save',async()=>{
    const id=randomUUID();await save(id);expect((await cancel(id)).body.receipt.state).toBe('APPLIED');
    const other=randomUUID(),hash=sellerDraftHash(photo,sellerDraftPayload({...payload(),expectedVersion:1}));
    expect((await cancel(other,hash)).body.receipt.state).toBe('ABANDONED');
    expect((await save(other,{...payload(),expectedVersion:1})).body.receipt.state).toBe('ABANDONED');
    expect((await prisma.listingMedia.findUniqueOrThrow({where:{id:photo}})).sellerDraftVersion).toBe(1);
  });
  it('create/cancel race has one terminal result, never an unreceipted extra revision',async()=>{
    const id=randomUUID(),[a,b]=await Promise.all([save(id),cancel(id)]);expect(a.status).toBe(200);expect(b.status).toBe(200);
    const receipt=(await read(id)).body.receipt;expect(['APPLIED','ABANDONED']).toContain(receipt.state);
    expect((await prisma.listingMedia.findUniqueOrThrow({where:{id:photo}})).sellerDraftVersion).toBe(receipt.state==='APPLIED'?1:0);
    expect(await prisma.sellerDraftReceipt.count({where:{userId:users[0]}})).toBe(1);
  });
  it('retains original proof after later saves, binding and deletion, without rewriting current draft',async()=>{
    const id=randomUUID();await save(id);await http('put',`/${photo}/seller-draft`).send({expectedVersion:1,draft:{...draft(),form:{...draft().form,title:'newer'}}});
    const restored=await save(id);expect(restored.body.receipt.appliedVersion).toBe(1);expect(restored.body.media.sellerDraftVersion).toBe(2);expect(restored.body.media.sellerDraft.form.title).toBe('newer');
    const listing=await prisma.listing.create({data:{ownerUserId:users[0],clientListingId:randomUUID(),requestHash:'a'.repeat(64),title:'synthetic'}});
    await prisma.listingMedia.update({where:{id:photo},data:{listingId:listing.id}});
    expect((await read(id)).body.media.listingId).toBe(listing.id);expect((await save(randomUUID(),{...payload(),expectedVersion:2})).status).toBe(404);
    await prisma.listingMedia.delete({where:{id:photo}});await prisma.listing.delete({where:{id:listing.id}});
    expect((await save(id)).body.media).toBeNull();expect((await cancel(id)).body.receipt.state).toBe('APPLIED');
    expect(await prisma.listingMedia.count({where:{id:photo}})).toBe(0);
  });
  it('refuses extra/private fields, query, malformed IDs, overlong drafts and invalid versions',async()=>{
    const id=randomUUID();for(const bad of [{...payload(),token:'no'}, {...payload(),expectedVersion:-1},{...payload(),expectedVersion:1000001},{...payload(),draft:{...draft(),form:{...draft().form,description:'x'.repeat(3001)}}}]) expect((await http('post',`/${photo}/seller-draft-operations/${id}`).send(bad)).status).toBe(400);
    expect((await http('post',`/${photo}/seller-draft-operations/${id}?token=no`).send(payload())).status).toBe(400);
    expect((await read('bad')).status).toBe(400);expect((await cancel(id,'bad')).status).toBe(400);
    expect(await prisma.sellerDraftReceipt.count({where:{userId:users[0]}})).toBe(0);
  });
  it('does not accept stale JWT after middleware while waiting for the owner lock',async()=>{
    const tx=prisma.$transaction.bind(prisma),spy=jest.spyOn(prisma,'$transaction');let once=true;
    spy.mockImplementation(((fn:any,options:any)=>{
      if(once){once=false;return prisma.user.update({where:{id:users[0]},data:{authVersion:{increment:1}}}).then(()=>tx(fn,options));}
      return tx(fn,options);
    }) as any);
    expect((await save(randomUUID())).status).toBe(401);
    expect(await prisma.sellerDraftReceipt.count({where:{userId:users[0]}})).toBe(0);
    expect((await prisma.listingMedia.findUniqueOrThrow({where:{id:photo}})).sellerDraftVersion).toBe(0);
  });
  it('rolls back the draft update if durable receipt persistence fails',async()=>{
    const tx=prisma.$transaction.bind(prisma);jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>tx(async inner=>{
      const wrapped=new Proxy(inner,{get(target,key){if(key==='sellerDraftReceipt')return new Proxy(target.sellerDraftReceipt,{get(model,name){if(name==='create')return ()=>{throw Error('synthetic rollback');};return Reflect.get(model,name);}});return Reflect.get(target,key);}});
      return fn(wrapped);
    },options)) as any);
    expect((await save(randomUUID())).status).toBe(503);
    expect((await prisma.listingMedia.findUniqueOrThrow({where:{id:photo}})).sellerDraftVersion).toBe(0);
    expect(await prisma.sellerDraftReceipt.count({where:{userId:users[0]}})).toBe(0);
  });
  it('cascades only owner receipts when an account is erased',async()=>{
    const owner=await prisma.user.create({data:{phoneNumber:randomUUID(),password:'synthetic-unused',isEmailVerified:true}});
    const media=await prisma.listingMedia.create({data:{ownerUserId:owner.id,capturePurpose:'BATCH_ITEM',imageUrl:'https://example.invalid/image',thumbnailUrl:'https://example.invalid/thumb',contentHash:'synthetic'}});
    try{expect((await save(randomUUID(),payload(),owner.id,media.id)).status).toBe(200);await prisma.user.delete({where:{id:owner.id}});expect(await prisma.sellerDraftReceipt.count({where:{userId:owner.id}})).toBe(0);}finally{await prisma.user.deleteMany({where:{id:owner.id}});}
  });
});
