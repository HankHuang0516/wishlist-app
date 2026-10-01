import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import prisma from '../../lib/prisma';
import socialRoutes from '../../routes/socialRoutes';
import userRoutes from '../../routes/userRoutes';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Explicit isolated database required');
const previousSecret=process.env.JWT_SECRET, secret='social-privacy-isolated-http';process.env.JWT_SECRET=secret;
const app=express();app.use(express.json());app.use('/api/users',socialRoutes);app.use('/api/users',userRoutes);
const server=createServer(app);
const run=randomUUID(), publicName='public-name-'+run, privatePhone='private-phone-'+run, privateRealName='real-'+run, privateEmail='private-'+run+'@example.invalid';
let owner:number,viewer:number,token:string;
const get=(path:string)=>request(server).get('/api/users'+path).set('Authorization','Bearer '+token);
const search=(query:string)=>get('/search').query({query});
beforeAll(async()=>{
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    owner=(await prisma.user.create({data:{phoneNumber:privatePhone,password:'fixture-only',name:publicName,nicknames:'public-nick-'+run,realName:privateRealName,email:privateEmail,avatarUrl:'https://example.invalid/hidden.jpg',isAvatarVisible:false,birthday:new Date(),marketingEmailsEnabled:true}})).id;
    viewer=(await prisma.user.create({data:{phoneNumber:'viewer-'+run,password:'fixture'}})).id;
    token=jwt.sign({id:viewer,authVersion:0},secret);
});
beforeEach(async()=>{
    await prisma.follow.deleteMany({where:{followerId:viewer,followingId:owner}});
    await prisma.user.update({where:{id:owner},data:{isPhoneVisible:false,isRealNameVisible:false,isEmailVisible:false,isAvatarVisible:false,isBirthdayVisible:false}});
});
afterAll(async()=>{
    try{await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.user.deleteMany({where:{id:{in:[owner,viewer]}}});}
    finally{await prisma.$disconnect();if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;}
});
describe('actual social privacy routes and database flags',()=>{
    it('public name/nickname search masks phone/photo/birthday and never returns private consent or credentials',async()=>{
        for(const query of [publicName,'public-nick-'+run]){
            const r=await search(query);expect(r.status).toBe(200);expect(r.headers['cache-control']).toBe('private, no-store');
            expect(r.body).toHaveLength(1);expect(r.body[0]).toMatchObject({id:owner,phoneNumber:null,avatarUrl:null,birthday:null,isFollowing:false});
            expect(Object.keys(r.body[0]).sort()).toEqual(['id','name','nicknames','phoneNumber','avatarUrl','birthday','isFollowing'].sort());
            for(const value of [privatePhone,privateRealName,privateEmail,'hidden.jpg'])expect(JSON.stringify(r.body)).not.toContain(value);
        }
    });
    it.each(['phone','name','email'])('a private %s cannot be used as a discovery oracle',async kind=>{
        const query=kind==='phone'?privatePhone:kind==='name'?privateRealName:privateEmail;
        expect((await search(query)).body).toEqual([]);
        const key=kind==='phone'?'isPhoneVisible':kind==='name'?'isRealNameVisible':'isEmailVisible';
        await prisma.user.update({where:{id:owner},data:{[key]:true}});
        const r=await search(query);expect(r.status).toBe(200);expect(r.body.map((u:any)=>u.id)).toEqual([owner]);
        if(kind==='phone')expect(r.body[0].phoneNumber).toBe(privatePhone);
        await prisma.user.update({where:{id:owner},data:{[key]:false}});expect((await search(query)).body).toEqual([]);
    });
    it('email needs a full match even when public; unknown query returns a confirmed empty result',async()=>{
        await prisma.user.update({where:{id:owner},data:{isEmailVisible:true}});
        expect((await search('private-'+run)).body).toEqual([]);
        expect((await search(privateEmail.toUpperCase())).body[0].id).toBe(owner);
        expect((await search('nonexistent-'+randomUUID())).body).toEqual([]);
    });
    it('followed users retain privacy; toggling public/private takes effect on the next GET',async()=>{
        await prisma.follow.create({data:{followerId:viewer,followingId:owner}});
        let r=await get('/following');expect(r.status).toBe(200);expect(r.headers['cache-control']).toBe('private, no-store');
        expect(r.body[0]).toMatchObject({id:owner,phoneNumber:null,avatarUrl:null,birthday:null,isMutual:false});
        await prisma.user.update({where:{id:owner},data:{isPhoneVisible:true,isAvatarVisible:true,isBirthdayVisible:true}});
        r=await get('/following');expect(r.body[0]).toMatchObject({phoneNumber:privatePhone,avatarUrl:'https://example.invalid/hidden.jpg'});expect(r.body[0].birthday).not.toBeNull();
        await prisma.user.update({where:{id:owner},data:{isPhoneVisible:false,isAvatarVisible:false,isBirthdayVisible:false}});
        expect((await get('/following')).body[0]).toMatchObject({phoneNumber:null,avatarUrl:null,birthday:null});
    });
    it('birthday reminders show only opted-in birthday and obey avatar visibility without private fields',async()=>{
        await prisma.follow.create({data:{followerId:viewer,followingId:owner}});
        expect((await get('/upcoming-birthdays')).body).toEqual([]);
        // UTC date-only birthday, within 30 days in the server calendar.
        const date=new Date();date.setDate(date.getDate()+2);await prisma.user.update({where:{id:owner},data:{birthday:new Date(date.toISOString().slice(0,10)),isBirthdayVisible:true}});
        const r=await get('/upcoming-birthdays');expect(r.status).toBe(200);expect(r.body).toHaveLength(1);expect(r.body[0]).toMatchObject({id:owner,avatarUrl:null});
        expect(r.headers['cache-control']).toBe('private, no-store');expect(Object.keys(r.body[0]).sort()).toEqual(['id','name','nicknames','avatarUrl','birthday','nextBirthday'].sort());
    });
    it('public profile matches the same phone/photo privacy and is never cacheable',async()=>{
        const r=await get('/'+owner);expect(r.status).toBe(200);expect(r.body).toMatchObject({id:owner,phoneNumber:null,realName:null,avatarUrl:null});expect(r.headers['cache-control']).toBe('private, no-store');
        expect(r.body).not.toHaveProperty('marketingEmailsEnabled');expect(r.body).not.toHaveProperty('password');
    });
    it('rejects malformed queries and requires authentication without creating relations',async()=>{
        for(const query of ['',' ','x'.repeat(101),'bad\u0000query'])expect((await search(query)).status).toBe(400);
        expect((await get('/search?query[a]=x')).status).toBe(400);expect((await get('/search?query=x&unexpected=1')).status).toBe(400);
        expect((await request(server).get('/api/users/search').query({query:publicName})).status).toBe(401);
        expect(await prisma.follow.count({where:{followerId:viewer}})).toBe(0);
    });
});
