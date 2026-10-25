/** Real local PostgreSQL and HTTP. Synthetic verified inputs below test the
 * post-verification ledger only; they are not evidence of store acceptance. */
import express from 'express';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import paymentRoutes from '../../routes/paymentRoutes';
import {createSourceLeadRoutes} from '../../routes/sourceLeadRoutes';
import {createLoopbackRequest} from './loopbackHttp';
import {fixture} from './consignmentFixture';
import {inquiryWeek,reserveInquiry,inquiryAllowance} from '../../lib/inquiryAllowance';
import {saveVerifiedPurchase,verifiedPremium,reserveMarketingCredit,reconcileMarketingCredits} from '../../lib/billingService';
import {accountBinding,type VerifiedPurchase} from '../../lib/storeVerification';
const run=process.env.TEST_DATABASE_URL?describe:describe.skip;
run('weekly inquiry and verified billing ledger',()=>{
 let buyer:number,other:number,token:string,keys:string[]=[],leads:string[]=[];
 const app=express();app.use(express.json());app.use('/api/payment',paymentRoutes);app.use('/api/source-leads',createSourceLeadRoutes());const http=createLoopbackRequest(app);
 const oldKey=process.env.BILLING_RECEIPT_KEY,oldSources=process.env.SOURCE_LEADS_PUBLIC_ENABLED;
 beforeAll(()=>{require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('isolated DB required');process.env.BILLING_RECEIPT_KEY=Buffer.alloc(32,11).toString('base64');process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';});
 beforeEach(async()=>{
  keys=[randomUUID(),randomUUID()];leads=[];
  const a=await prisma.user.create({data:{phoneNumber:'synthetic-billing-'+randomUUID(),password:'unused',apiKey:keys[0]}});buyer=a.id;token=a.billingAccountToken;
  other=(await prisma.user.create({data:{phoneNumber:'synthetic-billing-'+randomUUID(),password:'unused',apiKey:keys[1]}})).id;
 });
 afterEach(async()=>{
  const purchases=await prisma.purchase.findMany({where:{userId:{in:[buyer,other]}},select:{id:true}});
  await prisma.marketingCreditReservation.deleteMany({where:{purchaseId:{in:purchases.map(p=>p.id)}}});
  await prisma.user.deleteMany({where:{id:{in:[buyer,other]}}});
  await prisma.purchase.deleteMany({where:{id:{in:purchases.map(p=>p.id)}}});
  await prisma.externalSourceLead.deleteMany({where:{id:{in:leads}}});
 });
 afterAll(async()=>{if(oldKey===undefined)delete process.env.BILLING_RECEIPT_KEY;else process.env.BILLING_RECEIPT_KEY=oldKey;if(oldSources===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=oldSources;await prisma.$disconnect();});
 async function open(){const f=fixture().lead;f.archiveItemId='SYNTHETIC-BILLING-'+randomUUID();const lead=await prisma.externalSourceLead.create({data:f});leads.push(lead.id);const r=await http.post('/api/source-leads/'+lead.id+'/inquiry').set('x-api-key',keys[0]).send({});expect(r.status).toBe(200);return {leadId:lead.id,...r.body};}
 const send=(r:any,body:any,key=keys[0])=>http.post(`/api/source-leads/${r.leadId}/inquiry/${r.id}/actions`).set('x-api-key',key).send(body);
 const ask=(r:any)=>({requestId:randomUUID(),action:'ASK',text:'合成測試：請確認規格',consent:true,transferHash:r.transferHash});
 const lock=<T>(userId:number,action:(tx:any)=>Promise<T>)=>prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR NO KEY UPDATE`;return action(tx);});
 const verified=(id:string,sku:VerifiedPurchase['productId']='wishlist_sponsor_90'):VerifiedPurchase=>({provider:'APPLE',productId:sku,externalId:id,environment:'Production',binding:accountBinding(token),active:true,expiresAt:sku==='wishlist_premium_monthly'?new Date(Date.now()+86400000):null,amount:90,currency:'TWD',receipt:'synthetic-already-verified-input'});
 test('3 different items succeed; fourth cannot enqueue; reads, exact replay and revision do not consume',async()=>{
  const first=await open(),body=ask(first);const accepted=await send(first,body);expect(accepted.status).toBe(200);
  expect((await send(first,body)).status).toBe(200);
  const revision={requestId:randomUUID(),action:'REVISE',text:'合成更正規格',consent:true,transferHash:accepted.body.transferHash};expect((await send(first,revision)).status).toBe(200);
  for(let i=0;i<2;i++){const r=await open();expect((await send(r,ask(r))).status).toBe(200);}
  const fourth=await open();const denied=await send(fourth,ask(fourth));expect(denied.status).toBe(403);expect(denied.body.errorCode).toBe('INQUIRY_WEEKLY_LIMIT');
  expect((await prisma.sourceLeadInquiry.findUniqueOrThrow({where:{id:fourth.id}})).events).toEqual([]);
  // Old clients can save a question without consent, then authorize it through
  // REVISE. This is still a first authorized round, not a free correction.
  const draft=await send(fourth,{requestId:randomUUID(),action:'ASK',text:'合成舊版未授權草稿'});expect(draft.status).toBe(200);
  const alternate=await send(fourth,{requestId:randomUUID(),action:'REVISE',text:'合成首次授權更正',consent:true,transferHash:draft.body.transferHash});expect(alternate.status).toBe(403);expect(alternate.body.errorCode).toBe('INQUIRY_WEEKLY_LIMIT');
  expect((await prisma.sourceLeadInquiry.findUniqueOrThrow({where:{id:fourth.id}})).state).toBe('INQUIRY');
  const benefits=await http.get('/api/payment/benefits').set('x-api-key',keys[0]);expect(benefits.body.inquiry).toMatchObject({freeRemaining:0,freeUsedThisWeek:3,premium:false,timeZone:'Asia/Taipei'});
  expect((await send(first,body)).status).toBe(200);
  expect((await http.get(`/api/source-leads/${first.leadId}/inquiry`).set('x-api-key',keys[0])).status).toBe(200);
  expect((await send(first,{requestId:randomUUID(),action:'CANCEL'})).status).toBe(200);
 });
 test('concurrent fourth+ requests across different rooms never exceed 3',async()=>{
  const rooms=[];for(let i=0;i<6;i++)rooms.push(await open());
  const results=await Promise.all(rooms.map(r=>send(r,ask(r))));
  expect(results.filter(r=>r.status===200)).toHaveLength(3);expect(results.filter(r=>r.status===403)).toHaveLength(3);
  expect((await prisma.user.findUniqueOrThrow({where:{id:buyer}})).inquiryFreeUsed).toBe(3);
 });
 test('reset is weekly, failed transaction does not debit, and one account cannot consume another allowance',async()=>{
  const end=new Date('2026-10-25T15:59:59Z'),next=new Date('2026-10-25T16:00:00Z');
  for(let i=0;i<3;i++)await lock(buyer,tx=>reserveInquiry(tx,buyer,false,end));
  await expect(lock(buyer,tx=>reserveInquiry(tx,buyer,false,end))).rejects.toMatchObject({code:'INQUIRY_WEEKLY_LIMIT'});
  await expect(lock(buyer,async tx=>{await reserveInquiry(tx,buyer,false,next);throw Error('synthetic rollback');})).rejects.toThrow();
  expect((await lock(buyer,tx=>inquiryAllowance(tx,buyer,false,end))).freeRemaining).toBe(0);
  await lock(buyer,tx=>reserveInquiry(tx,buyer,false,next));expect((await lock(buyer,tx=>inquiryAllowance(tx,buyer,false,next))).freeRemaining).toBe(2);
  const room=await open();expect((await send(room,ask(room),keys[1])).status).toBe(409);
  expect((await prisma.user.findUniqueOrThrow({where:{id:other}})).inquiryFreeUsed).toBe(0);
 });
 test('sponsorship never grants premium; verified subscription works; replay cannot duplicate credits or cross accounts',async()=>{
  await prisma.user.update({where:{id:buyer},data:{isPremium:true}});
  expect(await lock(buyer,tx=>verifiedPremium(tx,buyer))).toBe(false);
  await lock(buyer,tx=>saveVerifiedPurchase(tx,buyer,token,verified('synthetic-tip')));
  expect(await lock(buyer,tx=>verifiedPremium(tx,buyer))).toBe(false);
  const credit=verified('synthetic-credits','wishlist_marketing_10');const a=await lock(buyer,tx=>saveVerifiedPurchase(tx,buyer,token,credit));const b=await lock(buyer,tx=>saveVerifiedPurchase(tx,buyer,token,credit));expect(a.id).toBe(b.id);expect(b.creditRemaining).toBe(10);
  const otherToken=(await prisma.user.findUniqueOrThrow({where:{id:other}})).billingAccountToken;
  await expect(lock(other,tx=>saveVerifiedPurchase(tx,other,otherToken,credit))).rejects.toMatchObject({code:'BILLING_ACCOUNT_MISMATCH'});
  await lock(buyer,tx=>saveVerifiedPurchase(tx,buyer,token,verified('synthetic-premium','wishlist_premium_monthly')));
  expect(await lock(buyer,tx=>verifiedPremium(tx,buyer))).toBe(true);
  await prisma.user.update({where:{id:buyer},data:{inquiryWeekStart:inquiryWeek().startsAt,inquiryFreeUsed:3}});
  const room=await open();expect((await send(room,ask(room))).status).toBe(200);
  await lock(buyer,tx=>saveVerifiedPurchase(tx,buyer,token,{...verified('synthetic-premium','wishlist_premium_monthly'),active:false}));expect(await lock(buyer,tx=>verifiedPremium(tx,buyer))).toBe(false);
 });
 test('10 permanent credits debit atomically, no eleventh, and refunds cannot be replayed',async()=>{
  const purchase=await lock(buyer,tx=>saveVerifiedPurchase(tx,buyer,token,verified('synthetic-credit-race','wishlist_marketing_10')));
  const jobs=Array.from({length:12},()=>randomUUID());const results=await Promise.allSettled(jobs.map(job=>lock(buyer,tx=>reserveMarketingCredit(tx,buyer,job))));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(10);expect(results.filter(r=>r.status==='rejected')).toHaveLength(2);
  expect((await prisma.purchase.findUniqueOrThrow({where:{id:purchase.id}})).creditRemaining).toBe(0);
  // Missing/erased jobs do not imply failure and cannot mint a refund.
  await lock(buyer,tx=>reconcileMarketingCredits(tx,buyer));expect((await prisma.purchase.findUniqueOrThrow({where:{id:purchase.id}})).creditRemaining).toBe(0);
  await expect(lock(buyer,tx=>reserveMarketingCredit(tx,buyer,jobs[0]))).rejects.toThrow();
 });
 test('forged receipts and client-supplied amount/premium flags never change rights; private projection omits receipts',async()=>{
  const user=await prisma.user.findUniqueOrThrow({where:{id:buyer}});
  const denied=await http.post('/api/payment/verify').set('x-api-key',keys[0]).send({provider:'APPLE',productId:'wishlist_premium_monthly',receipt:'fake-receipt',isPremium:true,amount:90});expect(denied.status).toBe(422);
  expect(await prisma.purchase.count({where:{userId:buyer}})).toBe(0);
  const after=await prisma.user.findUniqueOrThrow({where:{id:buyer}});expect(after.isPremium).toBe(user.isPremium);
  expect((await http.get('/api/payment/benefits')).status).toBe(401);
 });
});
