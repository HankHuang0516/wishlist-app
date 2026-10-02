import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import { Prisma } from '@prisma/client';
jest.mock('../../lib/flickr', () => ({ flickrService: {} }));
jest.mock('../../lib/emailService', () => ({ sendEmail: jest.fn() }));
import userRoutes from '../../routes/userRoutes';
import prisma from '../../lib/prisma';
import { signUserJwt } from '../../lib/jwtConfig';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal isolated database required');
const priorSecret=process.env.JWT_SECRET,priorBase=process.env.API_URL;
const app=express();app.use(express.json());app.use('/api/users',userRoutes);const server=createServer(app);
let owner:number,other:number;
const call=(method:'get'|'post',path='ai-prompt',token=signUserJwt({id:owner,authVersion:0}))=>request(server)[method]('/api/users/me/'+path).set('Authorization','Bearer '+token);
const current=()=>prisma.user.findUniqueOrThrow({where:{id:owner},select:{apiKey:true}});
beforeAll(async()=>{await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));});
beforeEach(async()=>{
  process.env.JWT_SECRET='synthetic-integration-session-secret';process.env.API_URL='http://127.0.0.1:5224/api';
  owner=(await prisma.user.create({data:{phoneNumber:'integration-owner-'+randomUUID(),password:'synthetic-unusable',name:'synthetic-owner'}})).id;
  other=(await prisma.user.create({data:{phoneNumber:'integration-other-'+randomUUID(),password:'synthetic-unusable',name:'synthetic-other'}})).id;
});
afterEach(async()=>{jest.restoreAllMocks();await prisma.user.deleteMany({where:{id:{in:[owner,other]}}});});
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.$disconnect();if(priorSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=priorSecret;if(priorBase===undefined)delete process.env.API_URL;else process.env.API_URL=priorBase;});
describe('original API credential lifecycle through HTTP and actual PostgreSQL row gates',()=>{
  it('sets private no-store before every authentication refusal',async()=>{
    for(const path of ['apikey','ai-prompt'])for(const method of ['get','post'] as const){const res=await request(server)[method]('/api/users/me/'+path);expect(res.status).toBe(401);expect(res.headers['cache-control']).toBe('private, no-store');}
  });
  it('reads missing current instructions and key without creating either',async()=>{expect((await call('get')).body).toEqual({available:false});expect((await call('get','apikey')).body).toEqual({apiKey:null});expect((await current()).apiKey).toBeNull();});
  it('preserves exact original prompt shape, reuses the key and isolates account names',async()=>{
    const a=await call('post'),b=await call('post'),c=await call('get');expect(a.status).toBe(200);expect(Object.keys(a.body).sort()).toEqual(['apiKey','prompt','userName']);expect(a.body).toEqual(b.body);expect(a.body).toEqual(c.body);
    const data=JSON.parse(a.body.prompt);expect(data.authentication).toEqual({api_key:a.body.apiKey,header:'x-api-key: '+a.body.apiKey,base_url:'http://127.0.0.1:5224/api'});expect(Object.keys(data.available_apis).sort()).toEqual(['items','social','user','wishlists']);expect(a.body.userName).toBe('synthetic-owner');expect((await current()).apiKey).toBe(a.body.apiKey);expect((await prisma.user.findUniqueOrThrow({where:{id:other}})).apiKey).toBeNull();expect(a.headers['cache-control']).toBe('private, no-store');
  });
  it('concurrent first requests return one winning key, with no invalidated loser',async()=>{
    const replies=await Promise.all(Array.from({length:12},()=>call('post')));expect(replies.every(res=>res.status===200)).toBe(true);expect(new Set(replies.map(res=>res.body.apiKey)).size).toBe(1);expect((await current()).apiKey).toBe(replies[0].body.apiKey);
  });
  it('explicit rotation changes the key while get-or-create never rotates',async()=>{
    const initial=await call('post'),rotated=await call('post','apikey');expect(rotated.status).toBe(200);expect(Object.keys(rotated.body)).toEqual(['apiKey']);expect(rotated.body.apiKey).not.toBe(initial.body.apiKey);expect((await call('post')).body.apiKey).toBe(rotated.body.apiKey);expect((await call('get')).body.apiKey).toBe(rotated.body.apiKey);
  });
  it('retains personal-key precedence even when a different JWT accompanies it',async()=>{
    const key=(await call('post')).body.apiKey;const response=await request(server).get('/api/users/me/ai-prompt').set('X-Api-Key',key).set('Authorization','Bearer '+signUserJwt({id:other,authVersion:0}));expect(response.status).toBe(200);expect(response.body.userName).toBe('synthetic-owner');expect(response.body.apiKey).toBe(key);
    const rotated=await request(server).post('/api/users/me/apikey').set('X-Api-Key',key);expect(rotated.status).toBe(200);expect((await request(server).get('/api/users/me/ai-prompt').set('X-Api-Key',key)).status).toBe(401);
  });
  it('rejects query identity and credential-bearing bodies before allocation or rotation',async()=>{
    for(const path of ['apikey','ai-prompt'])for(const method of ['get','post'] as const){const res=await call(method,path).query({userId:other});expect(res.status).toBe(400);expect(res.body).toEqual({errorCode:'API_INTEGRATION_INVALID_REQUEST'});}
    for(const body of [{userId:other},{apiKey:'synthetic-replacement'},[]])expect((await call('post').send(body)).status).toBe(400);
    expect((await call('post').set('Content-Type','application/json').send('null')).status).toBe(400);
    expect((await current()).apiKey).toBeNull();expect((await call('post').send({})).status).toBe(200);
  });
  it('validates configured base before allocating and preserves valid HTTP loopback scheme',async()=>{
    for(const base of ['https://user:password@example.invalid/api','https://example.invalid/api?token=hidden','http://example.invalid/api','https://example.invalid/api/api','invalid']){process.env.API_URL=base;const res=await call('post');expect(res.status).toBe(503);expect(res.body).toEqual({errorCode:'API_INTEGRATION_UNAVAILABLE'});expect((await current()).apiKey).toBeNull();}
    process.env.API_URL='  http://127.0.0.1:5224/api/  ';expect(JSON.parse((await call('post')).body.prompt).authentication.base_url).toBe('http://127.0.0.1:5224/api');
  });
  it.each(['session','personal','deleted'] as const)('rechecks %s authority after middleware while a concurrent security transaction holds the row',async kind=>{
    const token=signUserJwt({id:owner,authVersion:0}),key='synthetic-key-'+randomUUID();if(kind==='personal')await prisma.user.update({where:{id:owner},data:{apiKey:key}});
    let entered!:()=>void;const queued=new Promise<void>(resolve=>{entered=resolve;});const transact=prisma.$transaction.bind(prisma);let response:Promise<any>;
    await transact(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id"=${owner} FOR NO KEY UPDATE`);
      const spy=jest.spyOn(prisma,'$transaction').mockImplementation(((...args:any[])=>{entered();return (transact as any)(...args);}) as any);
      const req=kind==='personal'?request(server).post('/api/users/me/ai-prompt').set('X-Api-Key',key):call('post','ai-prompt',token);response=req.then(value=>value);await queued;spy.mockRestore();
      if(kind==='deleted')await tx.user.delete({where:{id:owner}});else await tx.user.update({where:{id:owner},data:{authVersion:1,apiKey:null}});
    });
    const res=await response!;expect(res.status).toBe(401);expect(res.body).toEqual({errorCode:'API_INTEGRATION_AUTH_REQUIRED'});if(kind!=='deleted')expect((await current()).apiKey).toBeNull();
  });
  it('bounds database failures and refuses malformed stored keys without replacing them',async()=>{
    jest.spyOn(prisma,'$transaction').mockRejectedValueOnce(Error('private-connection-credential'));const res=await call('post');expect(res.status).toBe(503);expect(res.body).toEqual({errorCode:'API_INTEGRATION_UNAVAILABLE'});expect((await current()).apiKey).toBeNull();
    await prisma.user.update({where:{id:owner},data:{apiKey:'bad key'}});expect((await call('post')).status).toBe(503);expect((await current()).apiKey).toBe('bad key');
    const repaired=await call('post','apikey');expect(repaired.status).toBe(200);expect((await current()).apiKey).toBe(repaired.body.apiKey);expect(repaired.body.apiKey).not.toBe('bad key');
  });
});
