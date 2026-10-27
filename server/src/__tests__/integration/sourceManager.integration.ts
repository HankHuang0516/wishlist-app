import express from 'express';
import request from 'supertest';
import {createLoopbackRequest} from './loopbackHttp';
import {randomUUID} from 'node:crypto';
import prisma from '../../lib/prisma';
import {createSourceManagerRoutes,MANAGER_LIFETIME_MS} from '../../routes/sourceManagerRoutes';
import {createSourceLeadAdmin,createSourceLeadRoutes} from '../../routes/sourceLeadRoutes';
const ORIGIN='https://qa.example.invalid',fixture='isolated-only-manager-fixture';
const prefix='SYNTHETIC-MANAGER-';
describe('restricted browser source management (isolated DB only)',()=>{
 let key=fixture,app:any;
 const bridge=express();bridge.use((req,res,next)=>app(req,res,next));const http=createLoopbackRequest(bridge);
 const oldFlag=process.env.SOURCE_LEADS_PUBLIC_ENABLED;
 const facts=(id:string)=>({canonicalUrl:'https://public.example.invalid/source/'+id,title:'合成管理來源',summary:'隔離測試，不是真實商品。',county:'臺南市',district:'永康區',publicPlaceName:'合成公共地標',publicAddress:'臺南市永康區合成路123號',latitude:23,longitude:120.2,postedEarliestAt:new Date(Date.now()-86400000).toISOString(),postedLatestAt:new Date(Date.now()-86400000).toISOString(),checkedAt:new Date().toISOString(),evidence:{sourceUrl:'https://public.example.invalid/source/'+id,sourcePublic:true,publicPlace:true,sourceMeetingPointConfirmed:true,locationType:'PUBLIC_MEETING_POINT',independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,publicSourceRef:'source:synthetic-public',sourceCheckRef:'source:synthetic-'+id,dateRef:'source:synthetic-date',locationRef:'source:synthetic-location',coordinateRef:'source:synthetic-coordinate',reviewRef:'review:synthetic-manager',locationSourceUrl:'https://public.example.invalid/location/qa',coordinateSourceUrl:'https://public.example.invalid/map/qa'}});
 const login=()=>http.post('/api/source-manager/session').set('Origin',ORIGIN).send({managementPassword:fixture});
 const post=(path:string,s:any,body:any)=>http.post('/api/source-manager/'+path).set('Origin',ORIGIN).set('Cookie',s.cookie).set('x-csrf-token',s.csrf).send(body);
 const get=(path:string,s:any)=>http.get('/api/source-manager/'+path).set('Cookie',s.cookie);
 const session=async()=>{const r=await login();expect(r.status).toBe(200);return {cookie:r.headers['set-cookie'][0].split(';')[0],csrf:r.body.csrfToken};};
 beforeAll(()=>{require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB required');process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';});
 beforeEach(()=>{key=fixture;app=express();app.use('/api/source-manager',createSourceManagerRoutes(()=>key,()=>ORIGIN));app.use(express.json());app.use('/admin',createSourceLeadAdmin(()=>fixture));app.use('/public',createSourceLeadRoutes());});
 afterEach(async()=>{const ids=(await prisma.externalSourceLead.findMany({where:{archiveItemId:{startsWith:prefix}},select:{id:true}})).map(r=>r.id);await prisma.sourceLeadRecordEvent.deleteMany({where:{leadId:{in:ids}}});await prisma.externalSourceLead.deleteMany({where:{id:{in:ids}}});await prisma.sourceManagerSession.deleteMany({});await prisma.sourceManagerRateBucket.deleteMany({});});
 afterAll(async()=>{if(oldFlag===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=oldFlag;await prisma.$disconnect();});
 test('anonymous/header/user credentials cannot become browser management authority',async()=>{
  expect((await http.get('/api/source-manager/records')).status).toBe(401);
  expect((await http.get('/api/source-manager/records').set('x-admin-key',fixture)).status).toBe(401);
  expect((await http.post('/api/source-manager/session').set('Origin','https://cross.example.invalid').send({managementPassword:fixture})).status).toBe(403);
  expect((await http.post('/api/source-manager/session').send({managementPassword:fixture})).status).toBe(403);
  expect((await http.post('/api/source-manager/session').set('Origin',ORIGIN).send({managementPassword:'not-a-real-key'})).status).toBe(401);
  expect((await http.get('/api/source-manager/session?key=not-a-real-key')).status).toBe(400);
 });
 test('90day absolute cookie is opaque, hashed, secure; no original key returned or stored',async()=>{
  const before=Date.now(),r=await login();expect(r.status).toBe(200);expect(r.body.publishAllowed).toBe(false);expect(JSON.stringify(r.body)).not.toContain(fixture);
  const header=r.headers['set-cookie'][0];for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=7776000'])expect(header).toContain(flag);expect(header).not.toContain('Domain=');expect(header).not.toContain(fixture);
  const row=await prisma.sourceManagerSession.findFirstOrThrow();expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(row)).not.toContain(fixture);expect(+row.expiresAt-before).toBeGreaterThanOrEqual(MANAGER_LIFETIME_MS);expect(+row.expiresAt-before).toBeLessThan(MANAGER_LIFETIME_MS+5000);
  const s={cookie:header.split(';')[0],csrf:r.body.csrfToken};const again=await get('session',s);expect(again.body.expiresAt).toBe(r.body.expiresAt);
  expect((await http.post('/api/source-manager/logout').set('Origin',ORIGIN).set('Cookie',s.cookie).send({})).status).toBe(403);
  expect((await http.post('/api/source-manager/logout').set('Origin','https://cross.example.invalid').set('Cookie',s.cookie).set('x-csrf-token',s.csrf).send({})).status).toBe(403);
  expect((await post('records/publish',s,{})).status).toBe(403);
  expect((await post('logout',s,{})).status).toBe(204);expect((await get('session',s)).status).toBe(401);
 });
 test('expiry, all-session revoke, key rotation and multi-instance DB lookup fail closed',async()=>{
  const s=await session();const second=express();second.use('/api/source-manager',createSourceManagerRoutes(()=>key,()=>ORIGIN));
  expect((await request(second).get('/api/source-manager/session').set('Cookie',s.cookie)).status).toBe(200);
  key='rotated-isolated-fixture';expect((await get('session',s)).status).toBe(401);key=fixture;
  await prisma.sourceManagerSession.updateMany({data:{createdAt:new Date(Date.now()-91*86400000),expiresAt:new Date(Date.now()-86400000)}});expect((await get('session',s)).status).toBe(401);
  const a=await session(),b=await session();expect((await post('revoke-all',a,{})).status).toBe(204);expect((await get('session',b)).status).toBe(401);
 });
 test('save/replay/CAS remain same-ID and browser cannot export/publish',async()=>{
  const s=await session(),archiveItemId=prefix+randomUUID(),f=facts(archiveItemId),body={operationId:randomUUID(),items:[{archiveItemId,expectedRevision:0,expectedStateHash:null,facts:f}]};
  const saved=await post('records/save',s,body);expect(saved.status).toBe(200);const id=saved.body.results[0].id;
  expect((await post('records/save',s,body)).body.replayed).toBe(true);
  const row=(await get('records/'+id,s)).body;expect(row.status).toBe('PRIVATE_PENDING');expect((await http.get('/public/'+id)).status).toBe(404);
  expect((await get('records/operations/'+body.operationId,s)).body.state).toBe('RECORDED');expect((await get('records/'+id+'/validation',s)).body.reviewApproved).toBe(false);
  expect((await post('records/save',s,{...body,operationId:randomUUID(),items:[{...body.items[0],expectedRevision:99,expectedStateHash:row.stateHash}]})).status).toBe(409);
  expect((await get('records/'+id+'/export',s)).status).toBe(403);expect((await get('records/'+id+'/history',s)).body.items).toHaveLength(1);
 });
 test('normal edit keeps original public snapshot, incomplete private fields never leak and TTL does not renew; unavailable signals hide',async()=>{
  const s=await session(),archiveItemId=prefix+randomUUID(),f=facts(archiveItemId),{sourceCheckRef,...legacy}=f.evidence;
  const imported=await http.post('/admin/import').set('x-admin-key',fixture).send({dryRun:false,items:[{...f,evidence:legacy,archiveItemId,libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:1,archiveSha256:'a'.repeat(64)}]});expect(imported.status).toBe(200);const id=imported.body.ids[0];
  const before=(await get('records/'+id,s)).body,privateFacts={canonicalUrl:f.canonicalUrl,title:'合成待審修改'};
  expect((await post('records/save',s,{operationId:randomUUID(),items:[{archiveItemId,expectedRevision:before.recordRevision,expectedStateHash:before.stateHash,facts:privateFacts}]})).status).toBe(200);
  const live=await http.get('/public/'+id);expect(live.status).toBe(200);expect(live.body.title).toBe(f.title);expect(live.body).not.toHaveProperty('pendingFacts');expect(live.body.checkedAt).toBe(f.checkedAt);
  await prisma.externalSourceLead.update({where:{id},data:{checkedAt:new Date(Date.now()-3*86400000)}});expect((await http.get('/public/'+id)).status).toBe(200);
  await prisma.externalSourceLead.update({where:{id},data:{checkedAt:new Date(Date.now()-14*86400000-1)}});expect((await http.get('/public/'+id)).status).toBe(404);
  const row=(await get('records/'+id,s)).body;expect((await post('records/save',s,{operationId:randomUUID(),items:[{archiveItemId,expectedRevision:row.recordRevision,expectedStateHash:row.stateHash,facts:{...f,sourceClaimState:'RESERVED',stateEvidenceRef:'source:synthetic-reserved'}}]})).status).toBe(200);expect((await http.get('/public/'+id)).status).toBe(404);
 });
 test('revocation during an admitted SAVE wait prevents a later write',async()=>{
  const s=await session(),archiveItemId=prefix+randomUUID();let unlock!:()=>void,ready!:()=>void;
  const held=new Promise<void>(r=>ready=r),release=new Promise<void>(r=>unlock=r);
  const blocker=prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(73009260930::bigint)`;ready();await release;},{timeout:15000});
  await held;const pending=post('records/save',s,{operationId:randomUUID(),items:[{archiveItemId,expectedRevision:0,expectedStateHash:null,facts:facts(archiveItemId)}]}).then(r=>r);
  try{let waiting=false;for(let i=0;i<200;i++){const rows=await prisma.$queryRaw<Array<{waiting:number}>>`SELECT COUNT(*)::int AS waiting FROM pg_locks WHERE locktype='advisory' AND NOT granted`;if(rows[0].waiting>0){waiting=true;break;}await new Promise(r=>setTimeout(r,10));}expect(waiting).toBe(true);expect((await post('logout',s,{})).status).toBe(204);}finally{unlock();await blocker;}
  const r=await pending;expect(r.status).toBe(409);expect(r.body.errorCode).toBe('MANAGER_SESSION_REVOKED');expect(await prisma.externalSourceLead.count({where:{archiveItemId}})).toBe(0);
 });

 test('login rate budget is shared by separate service instances',async()=>{const second=express();second.use('/api/source-manager',createSourceManagerRoutes(()=>key,()=>ORIGIN));for(let i=0;i<5;i++)expect((await request(i%2?second:app).post('/api/source-manager/session').set('Origin',ORIGIN).send({managementPassword:fixture})).status).toBe(200);expect((await request(second).post('/api/source-manager/session').set('Origin',ORIGIN).send({managementPassword:fixture})).status).toBe(429);});

});
