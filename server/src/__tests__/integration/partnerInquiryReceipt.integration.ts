import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import prisma from '../../lib/prisma';
import partnerRoutes from '../../routes/partnerInquiryRoutes';
import { parsePartnerInquiry } from '../../lib/partnerInquiry';
import { submissionRequestHash } from '../../lib/submissionReceipt';
import { sendEmail } from '../../lib/emailService';
jest.mock('../../lib/emailService',()=>({sendEmail:jest.fn()}));
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal explicit isolated DB required');
const previousAdminKey=process.env.ADMIN_API_KEY,adminKey='synthetic-partner-receipt-admin-only';process.env.ADMIN_API_KEY=adminKey;
const app=express();app.set('trust proxy',1);app.use(express.json());let loseReply=false,posts=0,ip=0;
app.use((req,res,next)=>{if(req.method==='POST'&&req.path==='/api/partner-inquiries'){posts++;const json=res.json.bind(res);res.json=((body:unknown)=>{if(loseReply&&res.statusCode===201){loseReply=false;res.status(502);return json({errorCode:'SYNTHETIC_LOST_REPLY'});}return json(body);})as typeof res.json;}next();});
app.use('/api/partner-inquiries',partnerRoutes);const server=createServer(app),ids:string[]=[],records:string[]=[];
function body(){const clientSubmissionId=randomUUID();ids.push(clientSubmissionId);const payload={organization:' 合成商家 '+clientSubmissionId+' ',contactName:' 合成窗口 ',contactEmail:'Fixture@Example.Invalid',websiteUrl:'https://example.com',categories:['BOOKS'],estimatedActiveItems:0,updateMethod:'MANUAL',sampleUrls:['https://example.com/item'],message:' 合成說明 🦉\n不授權AI。 ',contactConsent:true,companyFax:''};const {isHoneypot:_ignored,...data}=parsePartnerInquiry(payload);return {clientSubmissionId,...payload,requestHash:submissionRequestHash('PARTNER',data)};}
const submit=(data:Record<string,unknown>,address?:string)=>request(server).post('/api/partner-inquiries').set('X-Forwarded-For',address??'10.61.'+Math.floor(++ip/200)+'.'+ip%200).send(data);
const read=(data:{clientSubmissionId:string;requestHash:string})=>request(server).get('/api/partner-inquiries/submissions/'+data.clientSubmissionId).set('X-Submission-Hash',data.requestHash);
beforeAll(async()=>{await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));});
beforeEach(()=>{jest.clearAllMocks();loseReply=false;posts=0;(sendEmail as jest.Mock).mockResolvedValue({success:false,error:'synthetic-provider-private-details'});});
afterEach(async()=>{const receipts=await prisma.submissionReceipt.findMany({where:{clientSubmissionId:{in:ids}}});records.push(...receipts.filter(r=>r.kind==='PARTNER').map(r=>r.recordId));await prisma.submissionReceipt.deleteMany({where:{clientSubmissionId:{in:ids}}});await prisma.partnerInquiry.deleteMany({where:{id:{in:records.filter(r=>/^[a-f0-9-]{36}$/.test(r))}}});ids.length=0;records.length=0;});
afterAll(async()=>{try{await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.$disconnect();}finally{if(previousAdminKey===undefined)delete process.env.ADMIN_API_KEY;else process.env.ADMIN_API_KEY=previousAdminKey;}});
describe('public partner original receipt over real HTTP and PostgreSQL',()=>{
 it('retains legacy POST fields and returns a minimal private original GET despite mail failure',async()=>{
  const data=body(),saved=await submit(data);expect(saved.status).toBe(201);expect(saved.body).toMatchObject({received:true,inquiryId:expect.any(String),notificationStatus:'FAILED',clientSubmissionId:data.clientSubmissionId,requestHash:data.requestHash});
  const receipt=await read(data);expect(receipt.status).toBe(200);expect(receipt.headers['cache-control']).toBe('private, no-store');expect(receipt.body).toEqual(saved.body);expect(Object.keys(receipt.body).sort()).toEqual(['clientSubmissionId','inquiryId','notificationStatus','received','requestHash']);expect(JSON.stringify(receipt.body)).not.toMatch(/Fixture|合成|organization|contact|notificationProviderId|synthetic-provider/);
  const stored=await prisma.partnerInquiry.findFirstOrThrow({where:{organization:data.organization.trim()}});expect(stored).toMatchObject({contactEmail:'fixture@example.invalid',websiteUrl:'https://example.com/',estimatedActiveItems:0,message:data.message.trim()});expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('accepts a legacy request without a claimed hash and returns its canonical hash',async()=>{const {requestHash:expected,...data}=body(),saved=await submit(data);expect(saved.status).toBe(201);expect(saved.body.requestHash).toBe(expected);expect((await read({...data,requestHash:expected})).body.inquiryId).toBe(saved.body.inquiryId);});
 it('recovers commit-then502 by GET only without another notification',async()=>{const data=body();loseReply=true;expect((await submit(data)).status).toBe(502);expect((await read(data)).body).toMatchObject({received:true,clientSubmissionId:data.clientSubmissionId,requestHash:data.requestHash,notificationStatus:'FAILED'});expect(posts).toBe(1);expect(sendEmail).toHaveBeenCalledTimes(1);expect(await prisma.partnerInquiry.count({where:{organization:data.organization.trim()}})).toBe(1);});
 it('serializes twelve same-operation retries to one record and one mail attempt across independent rate-limit clients',async()=>{const data=body(),results=await Promise.all(Array.from({length:12},()=>submit(data)));expect(results.every(r=>r.status===201)).toBe(true);expect(new Set(results.map(r=>r.body.inquiryId)).size).toBe(1);expect(await prisma.submissionReceipt.count({where:{clientSubmissionId:data.clientSubmissionId}})).toBe(1);expect(await prisma.partnerInquiry.count({where:{organization:data.organization.trim()}})).toBe(1);expect(sendEmail).toHaveBeenCalledTimes(1);});
 it('keeps the existing three-per-hour POST limit and leaves receipt GET recovery available',async()=>{const data=body(),address='10.62.0.1';for(let i=0;i<3;i++)expect((await submit(data,address)).status).toBe(201);expect((await submit(data,address)).status).toBe(429);expect((await read(data)).status).toBe(200);expect(sendEmail).toHaveBeenCalledTimes(1);});
 it('rejects changed original content with a new valid hash rather than overwriting',async()=>{const data=body();await submit(data);const changed={...data,message:'different original body'};const {clientSubmissionId:_id,requestHash:_hash,...payload}=changed;const {isHoneypot:_ignored,...parsed}=parsePartnerInquiry(payload);changed.requestHash=submissionRequestHash('PARTNER',parsed);expect((await submit(changed)).status).toBe(409);expect((await read(data)).status).toBe(200);expect((await read(changed)).status).toBe(404);expect(sendEmail).toHaveBeenCalledTimes(1);});
 it.each(['a'.repeat(64),'not-a-hash',null])('rejects a false or malformed claimed hash before write or mail %#',async hash=>{const data=body();expect((await submit({...data,requestHash:hash})).status).toBe(400);expect(await prisma.submissionReceipt.count({where:{clientSubmissionId:data.clientSubmissionId}})).toBe(0);expect(await prisma.partnerInquiry.count({where:{organization:data.organization.trim()}})).toBe(0);expect(sendEmail).not.toHaveBeenCalled();});
 it('does not leak existence for wrong hash, wrong kind, deleted record or malformed stored record ID',async()=>{
  const data=body();await submit(data);expect((await read({...data,requestHash:'a'.repeat(64)})).body).toEqual({errorCode:'SUBMISSION_UNCONFIRMED'});const receipt=await prisma.submissionReceipt.findUniqueOrThrow({where:{clientSubmissionId:data.clientSubmissionId}});
  await prisma.submissionReceipt.update({where:{id:receipt.id},data:{kind:'FEEDBACK'}});expect((await read(data)).status).toBe(404);await prisma.submissionReceipt.update({where:{id:receipt.id},data:{kind:'PARTNER',recordId:'not-a-uuid'}});expect((await read(data)).status).toBe(404);
  await prisma.submissionReceipt.update({where:{id:receipt.id},data:{recordId:receipt.recordId}});records.push(receipt.recordId);await prisma.partnerInquiry.delete({where:{id:receipt.recordId}});expect((await read(data)).body).toEqual({errorCode:'SUBMISSION_UNCONFIRMED'});expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('leaves unknown reads read-only and rejects missing/malformed header or query-string credentials',async()=>{
  const data=body();expect((await read(data)).status).toBe(404);expect(await prisma.submissionReceipt.count({where:{clientSubmissionId:data.clientSubmissionId}})).toBe(0);
  for(const res of [await request(server).get('/api/partner-inquiries/submissions/'+data.clientSubmissionId),await read({...data,clientSubmissionId:'bad'}),await read({...data,requestHash:'bad'}),await request(server).get('/api/partner-inquiries/submissions/'+data.clientSubmissionId).query({requestHash:data.requestHash}).set('X-Submission-Hash',data.requestHash)]){expect(res.status).toBe(400);expect(res.body).toEqual({errorCode:'INVALID_SUBMISSION_QUERY'});expect(res.headers['cache-control']).toBe('private, no-store');}expect(sendEmail).not.toHaveBeenCalled();
 });
 it('reads PENDING while the original mail is in flight, then reports actual acceptance without another mail',async()=>{
  let finish:(value:unknown)=>void=()=>{};(sendEmail as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const data=body(),pending=submit(data).then(r=>r);
  for(let i=0;i<100&&!(sendEmail as jest.Mock).mock.calls.length;i++)await new Promise(resolve=>setTimeout(resolve,5));expect(sendEmail).toHaveBeenCalledTimes(1);expect((await read(data)).body.notificationStatus).toBe('PENDING');finish({success:true,id:'synthetic-provider-id'});expect((await pending).body.notificationStatus).toBe('ACCEPTED');expect((await read(data)).body.notificationStatus).toBe('ACCEPTED');expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('keeps provider exceptions as durable PENDING and rejects unbounded stored notification diagnostics',async()=>{
  (sendEmail as jest.Mock).mockRejectedValueOnce(Error('synthetic-private-mail-password'));const data=body(),saved=await submit(data);expect(saved.status).toBe(201);expect((await read(data)).body.notificationStatus).toBe('PENDING');
  await prisma.submissionReceipt.update({where:{clientSubmissionId:data.clientSubmissionId},data:{notificationStatus:'synthetic-private-provider-details'}});const readback=await read(data);expect(readback.status).toBe(503);expect(readback.body).toEqual({errorCode:'SUBMISSION_UNCONFIRMED'});expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('retains honeypot202 and denied admin listing/status authority',async()=>{
  const data=body();expect((await submit({...data,companyFax:'synthetic-bot'})).body).toEqual({received:false});expect(await prisma.submissionReceipt.count({where:{clientSubmissionId:data.clientSubmissionId}})).toBe(0);expect(sendEmail).not.toHaveBeenCalled();expect((await request(server).get('/api/partner-inquiries')).status).toBe(401);expect((await request(server).patch('/api/partner-inquiries/'+randomUUID()+'/status').send({status:'QUALIFIED'})).status).toBe(401);
 });
 it('preserves authorized admin listing and status updates while public receipt remains minimal',async()=>{
  const data=body();await submit(data);const receipt=await prisma.submissionReceipt.findUniqueOrThrow({where:{clientSubmissionId:data.clientSubmissionId}});
  const admin=await request(server).get('/api/partner-inquiries').set('X-Admin-Key',adminKey);expect(admin.status).toBe(200);expect(admin.body.items.find((r:{id:string})=>r.id===receipt.recordId)).toMatchObject({organization:data.organization.trim(),status:'NEW'});
  expect((await request(server).patch('/api/partner-inquiries/'+receipt.recordId+'/status').set('X-Admin-Key',adminKey).send({status:'QUALIFIED'})).status).toBe(204);expect((await read(data)).body).not.toHaveProperty('status');expect(sendEmail).toHaveBeenCalledTimes(1);
 });
});
