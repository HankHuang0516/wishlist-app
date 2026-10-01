import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import userRoutes from '../../routes/userRoutes';
import { profileHash, profilePatch } from '../../lib/profileUpdate';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL) throw new Error('Equal explicit isolated DB required');
const oldSecret=process.env.JWT_SECRET,secret='profile-http-integration-only';process.env.JWT_SECRET=secret;
const app=express();app.use(express.json());app.use('/api/users',userRoutes);
let owner:number,other:number,token:string,otherToken:string;
const call=(method:'get'|'post'|'put',path:string,bearer=token)=>request(app)[method]('/api/users'+path).set('Authorization','Bearer '+bearer);
const base=(id:string)=>'/me/profile-operations/'+id;
beforeAll(async()=>{
  owner=(await prisma.user.create({data:{phoneNumber:'profile-'+randomUUID(),password:'fixture-not-a-password',nicknames:'原暱稱',birthday:new Date('1993-05-16')}})).id;
  other=(await prisma.user.create({data:{phoneNumber:'profile-other-'+randomUUID(),password:'fixture'}})).id;
  token=jwt.sign({id:owner,authVersion:0},secret);otherToken=jwt.sign({id:other,authVersion:0},secret);
});
beforeEach(async()=>{
  await prisma.profileUpdateReceipt.deleteMany({where:{userId:owner}});
  await prisma.user.update({where:{id:owner},data:{profileVersion:0,authVersion:0,nicknames:'原暱稱',birthday:new Date('1993-05-16'),email:null}});
});
afterAll(async()=>{await prisma.user.deleteMany({where:{id:{in:[owner,other]}}});await prisma.$disconnect();if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;});
describe('real profile handlers / PostgreSQL receipt transactions',()=>{
  it('clears birthday and acknowledges only the exact patch without secrets',async()=>{
    const id=randomUUID(),updates={birthday:'',nicknames:' 新暱稱 ',isBirthdayVisible:false};
    const res=await call('post',base(id)).send({expectedVersion:0,updates});expect(res.status).toBe(200);
    expect(res.body.receipt).toMatchObject({clientActionId:id,state:'APPLIED',appliedVersion:1,requestHash:profileHash(0,profilePatch(updates))});
    expect(res.body.profile).toMatchObject({id:owner,profileVersion:1,birthday:null,nicknames:'新暱稱'});
    for(const field of ['password','authVersion','apiKey','otp','emailVerificationToken','passwordResetToken'])expect(res.body.profile).not.toHaveProperty(field);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect((await call('get',base(id))).body.receipt).toEqual(res.body.receipt);
  });
  it('serializes twelve identical retries to one patch and receipt',async()=>{
    const id=randomUUID(),body={expectedVersion:0,updates:{nicknames:'一次'}};
    const results=await Promise.all(Array.from({length:12},()=>call('post',base(id)).send(body)));
    expect(results.every(res=>res.status===200&&res.body.receipt.state==='APPLIED')).toBe(true);
    expect(await prisma.profileUpdateReceipt.count({where:{userId:owner,clientActionId:id}})).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({where:{id:owner}})).profileVersion).toBe(1);
    expect((await call('post',base(id)).send({...body,updates:{nicknames:'替代'}})).status).toBe(409);
  });
  it('conflicts are terminal, legacy PUT increments revision, replay never restores old data',async()=>{
    const first=randomUUID(),second=randomUUID();
    await call('post',base(first)).send({expectedVersion:0,updates:{nicknames:'第一次'}});
    const conflict=await call('post',base(second)).send({expectedVersion:0,updates:{nicknames:'舊草稿'}});expect(conflict.body.receipt.state).toBe('CONFLICT');
    expect((await call('put','/me').send({nicknames:'較新'})).body.profileVersion).toBe(2);
    const replay=await call('post',base(first)).send({expectedVersion:0,updates:{nicknames:'第一次'}});
    expect(replay.body.profile).toMatchObject({profileVersion:2,nicknames:'較新'});expect(replay.body.receipt.appliedVersion).toBe(1);
    expect((await call('post',base(second)).send({expectedVersion:0,updates:{nicknames:'舊草稿'}})).body.receipt.state).toBe('CONFLICT');
  });
  it('safe abandonment gates late submissions and never falsely undoes an applied patch',async()=>{
    const id=randomUUID(),body={expectedVersion:0,updates:{nicknames:'不應套用'}};
    const hash=profileHash(0,profilePatch(body.updates));
    expect((await call('post',base(id)+'/abandon').send({requestHash:hash})).body.receipt.state).toBe('ABANDONED');
    expect((await call('post',base(id)).send(body)).body.receipt.state).toBe('ABANDONED');
    expect((await call('get','/me')).body).toMatchObject({profileVersion:0,nicknames:'原暱稱'});
    const applied=randomUUID();await call('post',base(applied)).send(body);
    expect((await call('post',base(applied)+'/abandon').send({requestHash:hash})).body.receipt.state).toBe('APPLIED');
  });
  it('requires live owner authority, malformed input does not mutate, unknown GET does not create',async()=>{
    const id=randomUUID(),body={expectedVersion:0,updates:{nicknames:'本人'}};
    expect((await request(app).get('/api/users'+base(id))).status).toBe(401);
    expect((await call('get',base(id))).status).toBe(404);expect(await prisma.profileUpdateReceipt.count({where:{userId:owner}})).toBe(0);
    await call('post',base(id)).send(body);expect((await call('get',base(id),otherToken)).status).toBe(404);
    for(const bad of [{expectedVersion:'1',updates:{nicknames:'x'}},{expectedVersion:1,updates:{isPremium:true}},{expectedVersion:1,updates:{isPhoneVisible:'true'}},{expectedVersion:1,updates:{birthday:'2025-02-29'}}])expect((await call('post',base(randomUUID())).send(bad)).status).toBe(400);
    await prisma.user.update({where:{id:owner},data:{authVersion:1}});expect((await call('post',base(randomUUID())).send(body)).status).toBe(401);
  });
  it('first email is atomic and immutable; competing drafts cannot replace it',async()=>{
    const first='first-'+randomUUID()+'@example.invalid',second='second-'+randomUUID()+'@example.invalid';
    const res=await call('post',base(randomUUID())).send({expectedVersion:0,updates:{email:first}});expect(res.body.receipt.state).toBe('APPLIED');
    expect((await call('post',base(randomUUID())).send({expectedVersion:1,updates:{email:second}})).body.receipt.state).toBe('CONFLICT');
    expect((await call('get','/me')).body.email).toBe(first);expect((await call('put','/me').send({email:second})).status).toBe(409);
  });
  it('serializes cancel versus submit and gives both requests the same terminal truth',async()=>{
    const id=randomUUID(),body={expectedVersion:0,updates:{nicknames:'競爭測試'}},hash=profileHash(0,profilePatch(body.updates));
    const [submit,abandon]=await Promise.all([call('post',base(id)).send(body),call('post',base(id)+'/abandon').send({requestHash:hash})]);
    expect(submit.status).toBe(200);expect(abandon.status).toBe(200);expect(submit.body.receipt).toEqual(abandon.body.receipt);
    const state=submit.body.receipt.state,current=(await call('get','/me')).body;
    expect(['APPLIED','ABANDONED']).toContain(state);expect(current.profileVersion).toBe(state==='APPLIED'?1:0);
    expect(current.nicknames).toBe(state==='APPLIED'?'競爭測試':'原暱稱');
  });
  it('isolates identical IDs between owners and account erasure cascades only their receipts',async()=>{
    const id=randomUUID(),body={expectedVersion:0,updates:{nicknames:'本人'}};
    await call('post',base(id)).send(body);
    const outsider=await call('post',base(id),otherToken).send({expectedVersion:(await call('get','/me',otherToken)).body.profileVersion,updates:{nicknames:'別人'}});
    expect(outsider.status).toBe(200);expect(outsider.body.profile.id).toBe(other);
    expect((await call('get',base(id))).body.profile.nicknames).toBe('本人');
    const disposable=(await prisma.user.create({data:{phoneNumber:'profile-erasure-'+randomUUID(),password:'fixture'}})).id;
    try{
      await call('post',base(id),jwt.sign({id:disposable,authVersion:0},secret)).send(body);
      await prisma.user.delete({where:{id:disposable}});
      expect(await prisma.profileUpdateReceipt.count({where:{userId:disposable}})).toBe(0);
      expect(await prisma.profileUpdateReceipt.count({where:{userId:owner,clientActionId:id}})).toBe(1);
    }finally{await prisma.user.deleteMany({where:{id:disposable}});}
  });
  it('rechecks session revocation under the transaction gate after middleware acceptance',async()=>{
    const id=randomUUID(),spy=jest.spyOn(prisma,'$transaction');
    spy.mockImplementationOnce(async(callback:any)=>{
      spy.mockRestore();await prisma.user.update({where:{id:owner},data:{authVersion:1}});return prisma.$transaction(callback);
    });
    expect((await call('post',base(id)).send({expectedVersion:0,updates:{nicknames:'過期'}})).status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({where:{id:owner}})).profileVersion).toBe(0);
    expect(await prisma.profileUpdateReceipt.count({where:{userId:owner,clientActionId:id}})).toBe(0);
  });
  it('transaction failure rolls back the patch as well as its receipt',async()=>{
    const bad=jwt.sign({id:owner,authVersion:0},secret),id=randomUUID();
    // Force a real DB CHECK violation inside the same transaction, not a fake ACK.
    const spy=jest.spyOn(prisma,'$transaction');
    spy.mockImplementationOnce(async(callback:any)=>{
      spy.mockRestore();return prisma.$transaction(async tx=>{const result=await callback(tx);await tx.$executeRaw`UPDATE "ProfileUpdateReceipt" SET "state" = 'INVALID' WHERE "userId" = ${owner}`;return result;});
    });
    expect((await call('post',base(id),bad).send({expectedVersion:0,updates:{nicknames:'回滾'}})).status).toBe(500);
    expect((await call('get','/me')).body).toMatchObject({profileVersion:0,nicknames:'原暱稱'});
    expect(await prisma.profileUpdateReceipt.count({where:{userId:owner,clientActionId:id}})).toBe(0);
  });
});
