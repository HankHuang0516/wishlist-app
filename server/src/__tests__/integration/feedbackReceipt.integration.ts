import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import prisma from '../../lib/prisma';
import feedbackRoutes from '../../routes/feedbackRoutes';
import { submissionRequestHash } from '../../lib/submissionReceipt';
import { sendEmail } from '../../lib/emailService';
jest.mock('../../lib/emailService',()=>({sendEmail:jest.fn()}));
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal explicit isolated DB required');
const secret='synthetic-feedback-receipt-integration-only',previousSecret=process.env.JWT_SECRET;
process.env.JWT_SECRET=secret;
const app=express();app.use(express.json());let loseReply=false,posts=0;
app.use((req,res,next)=>{
 if(req.method==='POST'&&req.path==='/api/feedback'){
  posts++;const original=res.json.bind(res);res.json=((body:unknown)=>{
   if(loseReply&&res.statusCode===201){loseReply=false;res.status(502);return original({errorCode:'SYNTHETIC_LOST_REPLY'});}
   return original(body);
  }) as typeof res.json;
 }next();
});
app.use('/api/feedback',feedbackRoutes);const server=createServer(app);
let owner:number,other:number,token:string,otherToken:string;
const ids:string[]=[],recordIds:number[]=[];
function body(userId:number|null=null){const clientSubmissionId=randomUUID();ids.push(clientSubmissionId);const content='Synthetic feedback '+clientSubmissionId,email='fixture@example.invalid';return{clientSubmissionId,content,email,language:'en-US',requestHash:submissionRequestHash('FEEDBACK',{content,userId,contactEmail:userId===null?email:null})};}
const submit=(data:Record<string,unknown>,bearer?:string)=>{const req=request(server).post('/api/feedback');return(bearer?req.set('Authorization','Bearer '+bearer):req).send(data);};
const read=(data:{clientSubmissionId:string;requestHash:string},bearer?:string)=>{const req=request(server).get('/api/feedback/submissions/'+data.clientSubmissionId).set('X-Submission-Hash',data.requestHash);return bearer?req.set('Authorization','Bearer '+bearer):req;};
beforeAll(async()=>{
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 owner=(await prisma.user.create({data:{phoneNumber:'feedback-owner-'+randomUUID(),password:'fixture'}})).id;
 other=(await prisma.user.create({data:{phoneNumber:'feedback-other-'+randomUUID(),password:'fixture'}})).id;
 token=jwt.sign({id:owner,authVersion:0},secret);otherToken=jwt.sign({id:other,authVersion:0},secret);
});
beforeEach(()=>{jest.clearAllMocks();loseReply=false;posts=0;(sendEmail as jest.Mock).mockResolvedValue({success:false,error:'synthetic-provider-details'});});
afterEach(async()=>{
 const receipts=await prisma.submissionReceipt.findMany({where:{clientSubmissionId:{in:ids}}});
 recordIds.push(...receipts.filter(row=>row.kind==='FEEDBACK'&&/^\d+$/.test(row.recordId)).map(row=>Number(row.recordId)));
 await prisma.feedback.deleteMany({where:{id:{in:recordIds}}});await prisma.submissionReceipt.deleteMany({where:{clientSubmissionId:{in:ids}}});ids.length=0;recordIds.length=0;
});
afterAll(async()=>{try{await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.user.deleteMany({where:{id:{in:[owner,other]}}});}finally{await prisma.$disconnect();if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;}});
describe('durable private feedback receipt over real HTTP and PostgreSQL',()=>{
 it('exposes a saved PENDING receipt while the original notification remains in flight',async()=>{
  let finish:(value:unknown)=>void=()=>{};(sendEmail as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const data=body(),pending=submit(data).then(value=>value);
  for(let i=0;i<100&&!((sendEmail as jest.Mock).mock.calls.length);i++)await new Promise(resolve=>setTimeout(resolve,5));
  expect(sendEmail).toHaveBeenCalledTimes(1);expect((await read(data)).body).toMatchObject({received:true,notificationStatus:'PENDING'});
  finish({success:true,id:'synthetic-provider-id'});expect((await pending).body.notificationStatus).toBe('ACCEPTED');expect((await read(data)).body.notificationStatus).toBe('ACCEPTED');expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('saves anonymous feedback despite mail failure and reads minimal exact receipt facts',async()=>{
  const data=body(),saved=await submit(data);expect(saved.status).toBe(201);expect(saved.body).toMatchObject({received:true,clientSubmissionId:data.clientSubmissionId,requestHash:data.requestHash,notificationStatus:'FAILED',aiAnalysis:''});
  const verified=await read(data);expect(verified.status).toBe(200);expect(verified.headers['cache-control']).toBe('private, no-store');
  expect(Object.keys(verified.body).sort()).toEqual(['clientSubmissionId','inquiryId','notificationStatus','received','requestHash']);expect(verified.body.inquiryId).toBe(saved.body.inquiryId);
  expect(JSON.stringify(verified.body)).not.toMatch(/fixture@|Synthetic feedback|synthetic-provider-details|notificationProviderId|userId/);expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('requires the original owner and hash and never downgrades a signed-in hash to anonymous',async()=>{
  const data=body(owner),saved=await submit(data,token);expect(saved.status).toBe(201);expect((await read(data,token)).status).toBe(200);
  for(const bearer of [undefined,otherToken,'invalid-token'])expect((await read(data,bearer)).body).toEqual({errorCode:'SUBMISSION_UNCONFIRMED'});
  expect((await read({...data,requestHash:'a'.repeat(64)},token)).status).toBe(404);
  const another=body(owner);expect((await submit(another,'invalid-token')).status).toBe(400);expect(await prisma.submissionReceipt.count({where:{clientSubmissionId:another.clientSubmissionId}})).toBe(0);
  expect((await prisma.feedback.findFirstOrThrow({where:{content:data.content}})).contactEmail).toBeNull();expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('serializes twelve retries to one feedback record and one notification attempt',async()=>{
  const data=body();const results=await Promise.all(Array.from({length:12},()=>submit(data)));expect(results.every(res=>res.status===201)).toBe(true);
  expect(new Set(results.map(res=>res.body.inquiryId)).size).toBe(1);expect(await prisma.feedback.count({where:{content:data.content}})).toBe(1);expect(await prisma.submissionReceipt.count({where:{clientSubmissionId:data.clientSubmissionId}})).toBe(1);expect(sendEmail).toHaveBeenCalledTimes(1);
  expect((await read(data)).body.notificationStatus).toBe('FAILED');
 });
 it('rejects changed identity payload and a false claimed hash without another write or mail',async()=>{
  const data=body();expect((await submit(data)).status).toBe(201);
  const changed={...data,content:'replacement',requestHash:submissionRequestHash('FEEDBACK',{content:'replacement',userId:null,contactEmail:data.email})};
  expect((await submit(changed)).status).toBe(409);expect((await submit({...data,requestHash:'a'.repeat(64)})).status).toBe(400);expect(sendEmail).toHaveBeenCalledTimes(1);expect(await prisma.feedback.count({where:{content:data.content}})).toBe(1);
 });
 it('recovers a committed synthetic 502 with GET only and the original receipt',async()=>{
  const data=body();loseReply=true;const lost=await submit(data);expect(lost.status).toBe(502);expect((await read(data)).body).toMatchObject({received:true,clientSubmissionId:data.clientSubmissionId,requestHash:data.requestHash,notificationStatus:'FAILED'});expect(posts).toBe(1);expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('unknown, wrong-kind and deleted record reads do not create or revive feedback',async()=>{
  const unknown=body();expect((await read(unknown)).status).toBe(404);expect(await prisma.submissionReceipt.count({where:{clientSubmissionId:unknown.clientSubmissionId}})).toBe(0);
  await prisma.submissionReceipt.create({data:{kind:'PARTNER',clientSubmissionId:unknown.clientSubmissionId,requestHash:unknown.requestHash,recordId:'1'}});expect((await read(unknown)).status).toBe(404);
  const data=body();await submit(data);const record=await prisma.feedback.findFirstOrThrow({where:{content:data.content}});await prisma.feedback.delete({where:{id:record.id}});expect((await read(data)).status).toBe(404);expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('retains legacy POST response compatibility when no client identity or hash is supplied',async()=>{
  const content='legacy-feedback-'+randomUUID(),saved=await submit({content,email:'legacy@example.invalid'});ids.push(saved.body.clientSubmissionId);
  expect(saved.status).toBe(201);expect(saved.body).toMatchObject({received:true,aiAnalysis:'',message:expect.any(String)});expect(saved.body.clientSubmissionId).toMatch(/^[a-f0-9-]{36}$/);
 });
 it.each([{content:''},{content:'x'.repeat(5001)},{email:'name <fixture@example.invalid>'},{email:'a..b@example.invalid'},{email:'fixture@example.invalid\r\nBcc:x@y.z'},{clientSubmissionId:'bad'}])('rejects malformed input %# before saving or notifying',async patch=>{
  const data=body(),res=await submit({...data,...patch});expect(res.status).toBe(400);expect(res.headers['cache-control']).toBe('private, no-store');expect(await prisma.submissionReceipt.count({where:{clientSubmissionId:data.clientSubmissionId}})).toBe(0);expect(sendEmail).not.toHaveBeenCalled();
 });
 it('rejects missing or malformed receipt credentials without leaking existence',async()=>{
  const data=body();await submit(data);
  for(const path of ['/bad','/'+data.clientSubmissionId]){const res=await request(server).get('/api/feedback/submissions'+path);expect(res.status).toBe(400);expect(res.headers['cache-control']).toBe('private, no-store');expect(res.body).toEqual({errorCode:'INVALID_SUBMISSION_QUERY'});}
  expect((await read({...data,requestHash:'not-a-hash'})).status).toBe(400);expect(sendEmail).toHaveBeenCalledTimes(1);
 });
});
