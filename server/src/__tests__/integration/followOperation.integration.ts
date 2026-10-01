import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import socialRoutes from '../../routes/socialRoutes';
import {followHash} from '../../lib/followOperation';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Explicit isolated database required');
const previous=process.env.JWT_SECRET,secret='follow-operations-isolated-only';process.env.JWT_SECRET=secret;
const app=express();app.use(express.json());app.use('/api/users',socialRoutes);
let owner:number,other:number,target:number,second:number,token:string,otherToken:string;
const route='/api/users/me/follow-operations/';
const post=(key:string,body:object,auth=token)=>request(app).post(route+key).set('Authorization','Bearer '+auth).send(body);
const read=(key:string,auth=token)=>request(app).get(route+key).set('Authorization','Bearer '+auth);
const body=(wanted=true,expectedVersion=0,id=target)=>({targetUserId:id,wanted,expectedVersion});
beforeAll(async()=>{const users=await Promise.all(['owner','other','target','second'].map(role=>prisma.user.create({data:{phoneNumber:role+'-'+randomUUID(),password:'fixture'}})));[owner,other,target,second]=users.map(u=>u.id);token=jwt.sign({id:owner,authVersion:0},secret);otherToken=jwt.sign({id:other,authVersion:0},secret);});
beforeEach(async()=>{await prisma.follow.deleteMany({where:{followerId:{in:[owner,other]}}});await prisma.followOperationReceipt.deleteMany({where:{userId:{in:[owner,other]}}});await prisma.user.update({where:{id:owner},data:{followingVersion:0,maxFollowing:1,isPremium:false,authVersion:0}});});
afterAll(async()=>{try{await prisma.follow.deleteMany({where:{OR:[{followerId:{in:[owner,other,target,second]}},{followingId:{in:[owner,other,target,second]}}]}});await prisma.user.deleteMany({where:{id:{in:[owner,other,target,second]}}});}finally{await prisma.$disconnect();if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}});
describe('durable follow receipts, compatibility and atomic capacity',()=>{
    it('commits once, deduplicates concurrent same-key replay and serves immutable evidence',async()=>{
        const key=randomUUID(),results=await Promise.all([post(key,body()),post(key,body())]);for(const r of results){expect(r.status).toBe(200);expect(r.body.receipt.state).toBe('APPLIED');}
        expect(await prisma.follow.count({where:{followerId:owner}})).toBe(1);expect(await prisma.followOperationReceipt.count({where:{userId:owner}})).toBe(1);
        expect((await read(key)).body).toMatchObject({receipt:{requestHash:followHash(body()),appliedVersion:1},current:{userId:owner,isFollowing:true,followingVersion:1}});
        expect((await post(key,body(false))).status).toBe(409);expect((await read(key,otherToken)).status).toBe(404);
    });
    it('serializes simultaneous different-target follows at the one-person cap',async()=>{
        const results=await Promise.all([post(randomUUID(),body()),post(randomUUID(),body(true,0,second))]);
        expect(results.map(r=>r.body.receipt.state).sort()).toEqual(['APPLIED','CONFLICT']);expect(await prisma.follow.count({where:{followerId:owner}})).toBe(1);
        const limited=await post(randomUUID(),body(true,1,results[0].body.receipt.state==='APPLIED'?second:target));expect(limited.body.receipt.state).toBe('LIMIT');
    });
    it('legacy mutations advance the same revision; old receipt never rewrites later state',async()=>{
        const key=randomUUID();expect((await post(key,body())).body.receipt.state).toBe('APPLIED');
        const legacy=await request(app).delete('/api/users/'+target+'/follow').set('Authorization','Bearer '+token);expect(legacy.status).toBe(200);
        const old=await read(key);expect(old.body).toMatchObject({receipt:{state:'APPLIED',appliedVersion:1},current:{followingVersion:2,isFollowing:false}});
        await post(key,body());expect(await prisma.follow.count({where:{followerId:owner}})).toBe(0);
        const conflict=await post(randomUUID(),body(true,1));expect(conflict.body.receipt.state).toBe('CONFLICT');
        expect((await request(app).delete('/api/users/'+target+'/follow').set('Authorization','Bearer '+token)).status).toBe(200);
        expect((await prisma.user.findUniqueOrThrow({where:{id:owner}})).followingVersion).toBe(2);
    });
    it('hash-only abandonment prevents a late submit without disclosing target content',async()=>{
        const key=randomUUID(),hash=followHash(body());const abandoned=await request(app).post(route+key+'/abandon').set('Authorization','Bearer '+token).send({requestHash:hash});
        expect(abandoned.body.receipt).toMatchObject({state:'ABANDONED',targetUserId:null,wanted:null,expectedVersion:null});
        expect((await post(key,body())).body.receipt.state).toBe('ABANDONED');expect(await prisma.follow.count({where:{followerId:owner}})).toBe(0);
        const appliedKey=randomUUID();await post(appliedKey,body());expect((await request(app).post(route+appliedKey+'/abandon').set('Authorization','Bearer '+token).send({requestHash:hash})).body.receipt.state).toBe('APPLIED');
    });
    it('retains strict auth and missing-target terminal outcomes without relational writes',async()=>{
        const key=randomUUID();expect((await post(key,body(true,0,2147483647))).body.receipt.state).toBe('UNAVAILABLE');
        for(const value of [body(true,0,owner),{...body(),wanted:'true'},{...body(),extra:1}])expect((await post(randomUUID(),value)).status).toBe(400);
        expect((await request(app).post(route+randomUUID()).send(body())).status).toBe(401);
        for(const id of ['1junk','01','2147483648'])expect((await request(app).post('/api/users/'+id+'/follow').set('Authorization','Bearer '+token)).status).toBe(400);
        await prisma.user.update({where:{id:owner},data:{authVersion:1}});expect((await post(randomUUID(),body())).status).toBe(401);
        expect(await prisma.follow.count({where:{followerId:owner}})).toBe(0);
    });
    it('permits genuine zero capacity and a premium override, with no fake paid entitlement',async()=>{
        await prisma.user.update({where:{id:owner},data:{maxFollowing:0}});expect((await post(randomUUID(),body())).body.receipt.state).toBe('LIMIT');
        await prisma.user.update({where:{id:owner},data:{isPremium:true}});expect((await post(randomUUID(),body())).body.receipt.state).toBe('APPLIED');
        const state=await request(app).get('/api/users/me/follow-state/'+target).set('Authorization','Bearer '+token);expect(state.headers['cache-control']).toBe('private, no-store');expect(state.body).toMatchObject({maxFollowing:0,isPremium:true,followingCount:1});
        expect(state.body).not.toHaveProperty('password');expect(state.body).not.toHaveProperty('apiKey');
    });
});
