import express from 'express';
import {createLoopbackRequest} from './loopbackHttp';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import prisma from '../../lib/prisma';
import {createSourceManagerRoutes} from '../../routes/sourceManagerRoutes';
import {createSourceLeadRoutes} from '../../routes/sourceLeadRoutes';
import {sourceReferenceFixture} from './sourceReferenceFixture';
import {REFERENCE_VERIFIER_SCOPE,rawSha} from '../../lib/sourceReferenceAutoDisplay';
const origin='https://registry.example.invalid',key='synthetic-registry-only',prefix='SYNTHETIC-REGISTRY-';
describe('explicit browser verifier authority and private registration',()=>{
 let app:any,currentKey=key;const operations:string[]=[],saved=process.env.SOURCE_LEADS_PUBLIC_ENABLED;
 const bridge=express();bridge.use((req,res,next)=>app(req,res,next));const http=createLoopbackRequest(bridge);
 const login=async()=>{const r=await http.post('/manager/session').set('Origin',origin).send({managementPassword:key});expect(r.status).toBe(200);expect(r.body.scope).toBe(REFERENCE_VERIFIER_SCOPE);expect(r.body.evidenceRegistrationAllowed).toBe(true);return {cookie:r.headers['set-cookie'][0].split(';')[0],csrf:r.body.csrfToken};};
 const fixture=()=>sourceReferenceFixture(prefix+randomUUID());
 const register=(s:any,entries:any[],operationId=randomUUID())=>{operations.push(operationId);return http.post('/manager/reference-evidence').set('Origin',origin).set('Cookie',s.cookie).set('x-csrf-token',s.csrf).send({operationId,entries});};
 const save=(s:any,e:any,ref:string)=>http.post('/manager/records/save').set('Origin',origin).set('Cookie',s.cookie).set('x-csrf-token',s.csrf).send({operationId:randomUUID(),items:[{archiveItemId:e.archiveItemId,expectedRevision:0,expectedStateHash:null,facts:e.facts,sourceEvidenceRef:ref}]});
 beforeAll(()=>{require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated only');process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';});
 beforeEach(()=>{currentKey=key;app=express();app.use('/manager',createSourceManagerRoutes(()=>currentKey,()=>origin));app.use('/public',createSourceLeadRoutes());});
 afterEach(async()=>{const ids=(await prisma.externalSourceLead.findMany({where:{archiveItemId:{startsWith:prefix}},select:{id:true}})).map(v=>v.id);await prisma.sourceLeadRecordEvent.deleteMany({where:{leadId:{in:ids}}});await prisma.externalSourceLead.deleteMany({where:{id:{in:ids}}});await prisma.sourceReferenceEvidence.deleteMany({where:{archiveItemId:{startsWith:prefix}}});await prisma.sourceReferenceRegistration.deleteMany({where:{operationId:{in:operations}}});operations.length=0;await prisma.sourceManagerSession.deleteMany({});await prisma.sourceManagerRateBucket.deleteMany({});});
 afterAll(async()=>{if(saved===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=saved;await prisma.$disconnect();});
 test('registers private evidence, preserves original bytes and audit, replay is one operation, explicit same-ID SAVE alone displays UNKNOWN reference',async()=>{
  const s=await login(),f=fixture(),raw=f.evidence.sourceReceiptJson+'\n';f.evidence.sourceReceiptJson=raw;f.facts.evidence.sourceCheckRef='source:'+rawSha(raw);
  const op=randomUUID(),r=await register(s,[f.evidence],op);expect(r.status).toBe(200);expect(r.body.publicationActions).toBe(0);expect(r.body.serverIndependentlyBrowsedSource).toBe(false);expect(r.body.records[0].issuer).toBe('SOURCE_SESSION_VERIFIER');expect(r.body.records[0].verified).toBe(true);
  expect(await prisma.externalSourceLead.count({where:{archiveItemId:f.evidence.archiveItemId}})).toBe(0);
  const stored=await prisma.sourceReferenceEvidence.findUniqueOrThrow({where:{receiptRef:r.body.records[0].receiptRef}});expect(stored.materialSha).toBe(rawSha(raw));expect(stored).not.toHaveProperty('sourceReceiptJson');expect(stored).not.toHaveProperty('nodeXml');
  expect((await register(s,[f.evidence],op)).body.replayed).toBe(true);expect(await prisma.sourceReferenceRegistration.count({where:{operationId:op}})).toBe(1);
  const audit=await http.get('/manager/reference-evidence/operations/'+op).set('Cookie',s.cookie);expect(audit.body.state).toBe('RECORDED');expect(audit.body.actorScope).toBe(REFERENCE_VERIFIER_SCOPE);
  const changed={...f.evidence,facts:{...f.facts,summary:'不同的合成摘要'}};expect((await register(s,[changed],op)).status).toBe(409);
  const result=await save(s,f.evidence,r.body.records[0].receiptRef);expect(result.body.results[0].autoDisplay.state).toBe('DISPLAYED');const id=result.body.results[0].id;
  const pub=await http.get('/public/'+id);expect(pub.status).toBe(200);expect(pub.body.id).toBe(id);expect(pub.body.stockStatus).toBe('UNKNOWN');expect(pub.body.qualifiedSupply).toBe(false);
  expect((await http.post('/manager/records/publish').set('Origin',origin).set('Cookie',s.cookie).set('x-csrf-token',s.csrf).send({})).status).toBe(403);
 });
 test.each(['SOURCE_DRAFT_EDITOR','SOURCE_REFERENCE_AUTO_DISPLAY'])('existing %s session never receives registration authority',async scope=>{
  const s=await login(),session=await prisma.sourceManagerSession.findFirstOrThrow();await prisma.sourceManagerSession.update({where:{id:session.id},data:{scope}});
  const current=await http.get('/manager/session').set('Cookie',s.cookie);expect(current.body.scope).toBe(scope);expect(current.body.evidenceRegistrationAllowed).toBe(false);expect((await register(s,[fixture().evidence])).status).toBe(403);
  expect(await prisma.sourceReferenceRegistration.count()).toBe(0);
 });
 test('origin/CSRF and server-owned verified/issuer reject unauthorized declarations',async()=>{
  const s=await login(),f=fixture();
  expect((await http.post('/manager/reference-evidence').set('Cookie',s.cookie).set('x-csrf-token',s.csrf).send({operationId:randomUUID(),entries:[f.evidence]})).status).toBe(403);
  expect((await http.post('/manager/reference-evidence').set('Origin',origin).set('Cookie',s.cookie).send({operationId:randomUUID(),entries:[f.evidence]})).status).toBe(403);
  expect((await register(s,[{...f.evidence,verified:true,issuer:'EXISTING_SOURCE_ADMIN'}])).status).toBe(409);
  expect(await prisma.sourceReferenceEvidence.count({where:{archiveItemId:f.evidence.archiveItemId}})).toBe(0);
 });
 test('at most20 distinct items, bounded body, and original hash cannot be relabelled',async()=>{
  const s=await login(),f=fixture();expect((await register(s,Array.from({length:21},()=>fixture().evidence))).status).toBe(409);expect((await register(s,[f.evidence,f.evidence])).status).toBe(409);
  expect((await register(s,[{...f.evidence,sourceReceiptJson:f.evidence.sourceReceiptJson+'\n'}])).status).toBe(409);
  expect((await register(s,[{...f.evidence,sourceReceiptJson:'x'.repeat(2100000)}])).status).toBe(400);
  expect(await prisma.sourceReferenceEvidence.count({where:{archiveItemId:{startsWith:prefix}}})).toBe(0);
 });
 test('actual official API URL stays intact; contradictory district XML remains a gap and cannot display',async()=>{
  const s=await login(),f=fixture(),xml='<osm><node id="1" lat="23" lon="120.236" version="2" visible="true"><tag k="addr:city" v="台南市"/><tag k="addr:district" v="東區"/><tag k="addr:full" v="台南市永康區合成路123號"/></node></osm>';
  f.evidence.coordinateEvidence={sourceUrl:'https://api.openstreetmap.org/api/0.6/node/1',nodeXml:xml,readReceiptRef:'source:library/synthetic-observation'};
  const r=await register(s,[f.evidence]);expect(r.status).toBe(200);expect(r.body.records[0].verified).toBe(false);expect(r.body.records[0].issues).toContain('PUBLIC_COORDINATE_ADMINISTRATIVE_CONFLICT');
  const row=await prisma.sourceReferenceEvidence.findUniqueOrThrow({where:{receiptRef:r.body.records[0].receiptRef}});expect(row.coordinateReadUrl).toBe(f.evidence.coordinateEvidence.sourceUrl);expect(row.coordinateSha).toBe(rawSha(xml));expect(row.coordinateReadReceiptRef).toBe(f.evidence.coordinateEvidence.readReceiptRef);
  const saved=await save(s,f.evidence,r.body.records[0].receiptRef);expect(saved.body.results[0].autoDisplay.state).toBe('HELD');expect((await http.get('/public/'+saved.body.results[0].id)).status).toBe(404);
 });
 test('missing material, stale capture, privacy and key rotation stay fail-closed',async()=>{
  const s=await login(),f=fixture();delete (f.evidence as any).coordinateEvidence;const r=await register(s,[f.evidence]);expect(r.body.records[0].verified).toBe(false);expect((await save(s,f.evidence,r.body.records[0].receiptRef)).body.results[0].autoDisplay.state).toBe('HELD');
  const g=fixture(),raw=JSON.parse(g.evidence.sourceReceiptJson),old=new Date(Date.now()-49*3600000).toISOString();raw.actualCheckedAt=old;g.facts.checkedAt=old;g.evidence.sourceReceiptJson=JSON.stringify(raw);g.facts.evidence.sourceCheckRef='source:'+rawSha(g.evidence.sourceReceiptJson);
  const stale=await register(s,[g.evidence]);expect((await save(s,g.evidence,stale.body.records[0].receiptRef)).body.results[0].autoDisplay.state).toBe('HELD');
  const privateFacts={...fixture().evidence,facts:{...g.facts,summary:'person@example.invalid'}};expect((await register(s,[privateFacts])).status).toBe(409);
  const rotated=express();rotated.use('/manager',createSourceManagerRoutes(()=>key+'-rotated',()=>origin));expect((await request(rotated).get('/manager/session').set('Cookie',s.cookie)).status).toBe(401);
 });
 test('revocation while waiting for the shared writer lock prevents evidence and audit writes',async()=>{
  const s=await login(),f=fixture();let unlock!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>entered=r),release=new Promise<void>(r=>unlock=r);
  const lock=prisma.$transaction(async tx=>{await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(73009260930::bigint)');entered();await release;},{timeout:10000});
  await waiting;const pending=register(s,[f.evidence]).then(r=>r);await new Promise(r=>setTimeout(r,50));
  expect((await http.post('/manager/logout').set('Origin',origin).set('Cookie',s.cookie).set('x-csrf-token',s.csrf).send({})).status).toBe(204);unlock();await lock;expect((await pending).status).toBe(401);
  expect(await prisma.sourceReferenceEvidence.count({where:{archiveItemId:f.evidence.archiveItemId}})).toBe(0);expect(await prisma.sourceReferenceRegistration.count({where:{operationId:{in:operations}}})).toBe(0);
 });
 test('key rotation while queued fails closed even when the session row itself is not revoked',async()=>{
  const s=await login(),f=fixture();let unlock!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>entered=r),release=new Promise<void>(r=>unlock=r);
  const lock=prisma.$transaction(async tx=>{await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(73009260930::bigint)');entered();await release;},{timeout:10000});await waiting;
  const pending=register(s,[f.evidence]).then(r=>r);await new Promise(r=>setTimeout(r,50));currentKey=key+'-rotated';unlock();await lock;expect((await pending).status).toBe(401);expect(await prisma.sourceReferenceEvidence.count({where:{archiveItemId:f.evidence.archiveItemId}})).toBe(0);
 });

});
