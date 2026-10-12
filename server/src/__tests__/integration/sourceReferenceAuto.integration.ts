import express from 'express';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import prisma from '../../lib/prisma';
import {createSourceManagerRoutes} from '../../routes/sourceManagerRoutes';
import {createSourceLeadAdmin,createSourceLeadRoutes} from '../../routes/sourceLeadRoutes';
import {sourceReferenceFixture} from './sourceReferenceFixture';
const origin='https://qa.example.invalid',key='isolated-auto-reference-fixture',prefix='SYNTHETIC-AUTO-';
describe('bounded auto reference display with trusted evidence (isolated DB)',()=>{
 let app:any;const old=process.env.SOURCE_LEADS_PUBLIC_ENABLED;
 const fixture=sourceReferenceFixture;
 const login=async()=>{const r=await request(app).post('/manager/session').set('Origin',origin).send({managementPassword:key});expect(r.body.autoReferenceDisplayAllowed).toBe(true);return {cookie:r.headers['set-cookie'][0].split(';')[0],csrf:r.body.csrfToken};};
 const save=(s:any,archiveItemId:string,facts:any,receiptRef:any=null,old:any=null,op=randomUUID())=>request(app).post('/manager/records/save').set('Origin',origin).set('Cookie',s.cookie).set('x-csrf-token',s.csrf).send({operationId:op,items:[{archiveItemId,expectedRevision:old?.recordRevision??0,expectedStateHash:old?.stateHash??null,facts,sourceEvidenceRef:receiptRef}]});
 const get=(s:any,id:string)=>request(app).get('/manager/records/'+id).set('Cookie',s.cookie);
 const register=async(e:any)=>{const r=await request(app).post('/admin/reference-evidence').set('x-admin-key',key).send({entries:[e]});expect(r.status).toBe(200);return r.body.records[0];};
 beforeAll(()=>{require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB only');process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';});
 beforeEach(()=>{app=express();app.use('/manager',createSourceManagerRoutes(()=>key,()=>origin));app.use(express.json());app.use('/admin',createSourceLeadAdmin(()=>key));app.use('/public',createSourceLeadRoutes());});
 afterEach(async()=>{const ids=(await prisma.externalSourceLead.findMany({where:{archiveItemId:{startsWith:prefix}},select:{id:true}})).map(r=>r.id);await prisma.sourceLeadRecordEvent.deleteMany({where:{leadId:{in:ids}}});await prisma.externalSourceLead.deleteMany({where:{id:{in:ids}}});await prisma.sourceReferenceEvidence.deleteMany({where:{archiveItemId:{startsWith:prefix}}});await prisma.sourceManagerSession.deleteMany({});await prisma.sourceManagerRateBucket.deleteMany({});});
 afterAll(async()=>{if(old===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=old;await prisma.$disconnect();});
 test('new login consumes trusted facts and atomically displays same-ID reference; replay/audit/UNKNOWN preserved',async()=>{
  const s=await login(),a=prefix+randomUUID(),f=fixture(a),e=await register(f.evidence);expect(e.verified).toBe(true);
  const op=randomUUID(),r=await save(s,a,f.facts,e.receiptRef,null,op);expect(r.status).toBe(200);expect(r.body.results[0].autoDisplay.state).toBe('DISPLAYED');const id=r.body.results[0].id;
  const row=(await get(s,id)).body;expect(row.recordRevision).toBe(1);expect(row.pendingHash).toBeNull();expect(row.pendingEvidenceRef).toBeNull();
  const pub=await request(app).get('/public/'+id);expect(pub.status).toBe(200);expect(pub.body.stockStatus).toBe('UNKNOWN');expect(pub.body.qualifiedSupply).toBe(false);expect(pub.body).not.toHaveProperty('pendingEvidenceRef');
  expect((await save(s,a,f.facts,e.receiptRef,null,op)).body.replayed).toBe(true);const events=await prisma.sourceLeadRecordEvent.findMany({where:{leadId:id}});expect(events).toHaveLength(1);expect(events[0].action).toBe('AUTO_REFERENCE_SAVE');expect((events[0].afterSnapshot as any).result.autoDisplay.ruleVersion).toBe('REFERENCE_EVIDENCE_V1');
  expect((await request(app).post('/manager/records/publish').set('Origin',origin).set('Cookie',s.cookie).set('x-csrf-token',s.csrf).send({})).status).toBe(403);
 });
 test('old draft session never upgrades, and a checked box alone cannot display a reference',async()=>{
  const s=await login(),row=await prisma.sourceManagerSession.findFirstOrThrow();await prisma.sourceManagerSession.update({where:{id:row.id},data:{scope:'SOURCE_DRAFT_EDITOR'}});
  const a=prefix+randomUUID(),f=fixture(a),e=await register(f.evidence);const r=await save(s,a,f.facts,e.receiptRef);expect(r.body.results[0].autoDisplay.state).toBe('DRAFT_ONLY');expect((await request(app).get('/public/'+r.body.results[0].id)).status).toBe(404);
  const n=await login(),b=prefix+randomUUID(),g=fixture(b);const bare=await save(n,b,g.facts);expect(bare.body.results[0].autoDisplay.state).toBe('HELD');expect((await request(app).get('/public/'+bare.body.results[0].id)).status).toBe(404);
  expect((await request(app).post('/admin/reference-evidence').set('Cookie',n.cookie).send({entries:[g.evidence]})).status).toBe(401);
 });
 test('missing coordinate material is represented as a real gap, not an approved checkbox',async()=>{
  const s=await login(),a=prefix+randomUUID(),f=fixture(a);delete (f.evidence as any).coordinateEvidence;const e=await register(f.evidence);expect(e.verified).toBe(false);expect(e.issues).toContain('PUBLIC_COORDINATE_MATERIAL_REQUIRED');const r=await save(s,a,f.facts,e.receiptRef);expect(r.body.results[0].autoDisplay.state).toBe('HELD');
 });
 test('changing a timestamp or original date cannot reuse material; stale evidence, privacy and source mismatch fail closed',async()=>{
  const s=await login(),a=prefix+randomUUID(),f=fixture(a),e=await register(f.evidence);
  const r=await save(s,a,{...f.facts,checkedAt:new Date(Date.now()-1000).toISOString()},e.receiptRef);expect(r.body.results[0].autoDisplay.state).toBe('HELD');
  const bad=await request(app).post('/admin/reference-evidence').set('x-admin-key',key).send({entries:[{...f.evidence,facts:{...f.facts,postedEarliestAt:new Date(Date.now()-3000).toISOString()}}]});expect(bad.body.records[0].verified).toBe(false);
  expect((await save(s,prefix+randomUUID(),{...f.facts,summary:'private@example.invalid'},e.receiptRef)).status).toBe(409);
  expect((await save(s,prefix+randomUUID(),f.facts,e.receiptRef)).body.results[0].autoDisplay.state).toBe('HELD');
 });
 test('sold/withdrawn cannot resurrect, CAS conflicts reject and no catalogue goods are created',async()=>{
  const s=await login(),a=prefix+randomUUID(),f=fixture(a),e=await register(f.evidence),r=await save(s,a,f.facts,e.receiptRef),id=r.body.results[0].id,row=(await get(s,id)).body;
  expect((await save(s,a,f.facts,e.receiptRef,{...row,recordRevision:99})).status).toBe(409);
  const sold=await save(s,a,{...f.facts,sourceClaimState:'SOLD',stateEvidenceRef:'source:synthetic-sold'},e.receiptRef,row);expect(sold.body.results[0].status).toBe('WITHDRAWN');const after=(await get(s,id)).body;const again=await save(s,a,f.facts,e.receiptRef,after);expect(again.body.results[0].autoDisplay.state).toBe('HELD');expect((await request(app).get('/public/'+id)).status).toBe(404);expect(await prisma.listing.count({where:{title:f.facts.title}})).toBe(0);
 });
});
