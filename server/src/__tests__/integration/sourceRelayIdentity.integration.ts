import express from 'express';
import request from 'supertest';
import {createServer,Server} from 'http';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import {createSourceLeadAdmin,createSourceLeadRoutes} from '../../routes/sourceLeadRoutes';
import {digest,parseLead} from '../../lib/sourceLeadRules';
import {RELAY_PAGE_ID,WISHLIST_PAGE_ID,relayIdentity} from '../../lib/sourcePublicComment';
const run=process.env.TEST_DATABASE_URL?describe:describe.skip;
run('relay identity and rejected-send progress (isolated DB)',()=>{
 const admin='synthetic-relay-admin',key=randomUUID(),other=randomUUID(),leads:string[]=[];
 let user:number,otherUser:number,server:Server,verified=false,serial=0;
 const flag=process.env.SOURCE_LEADS_PUBLIC_ENABLED;
 beforeAll(async()=>{
  require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.DATABASE_URL);verified=true;process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';
  user=(await prisma.user.create({data:{phoneNumber:'synthetic-relay-'+randomUUID(),password:'unused',apiKey:key}})).id;
  otherUser=(await prisma.user.create({data:{phoneNumber:'synthetic-relay-other-'+randomUUID(),password:'unused',apiKey:other}})).id;
  const app=express();app.use(express.json());app.use('/leads',createSourceLeadRoutes());app.use('/admin',createSourceLeadAdmin(()=>admin));server=createServer(app);
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 });
 beforeEach(async()=>{await prisma.user.updateMany({where:{id:{in:[user,otherUser]}},data:{inquiryWeekStart:null,inquiryFreeUsed:0}});});
 afterAll(async()=>{
  if(server?.listening)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  if(!verified)return;
  await prisma.sourceLeadInquiry.deleteMany({where:{buyerUserId:{in:[user,otherUser]}}});await prisma.externalSourceLead.deleteMany({where:{id:{in:leads}}});await prisma.user.deleteMany({where:{id:{in:[user,otherUser]}}});
  if(flag===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=flag;
  await prisma.$disconnect();
 });
 const http=()=>request(server),post=(url:string,body:any)=>http().post(url).set('x-admin-key',admin).send(body);
 async function fixture(){
  const canonicalUrl='https://www.facebook.com/groups/123456789/posts/'+Date.now()+(++serial),archiveItemId='SYNTHETIC-RELAY-'+randomUUID();
  const facts={archiveItemId,libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:3,archiveSha256:'a'.repeat(64),title:'來源線索：合成測試樹屋',summary:'隔離測試來源，非真實交易。',canonicalUrl,county:'臺南市',district:'永康區',publicPlaceName:'合成公開面交點',publicAddress:'臺南市永康區合成路123號',latitude:23,longitude:120.236,postedEarliestAt:new Date(Date.now()-86400000).toISOString(),postedLatestAt:new Date(Date.now()-86400000).toISOString(),checkedAt:new Date().toISOString(),evidence:{sourceUrl:canonicalUrl,sourcePublic:true,publicSourceRef:'self:synthetic-public',dateRef:'self:synthetic-date',locationRef:'self:synthetic-location',coordinateRef:'self:synthetic-coordinate',locationSourceUrl:'https://public.example.invalid/place/qa',coordinateSourceUrl:'https://public.example.invalid/map/qa',publicPlace:true,locationType:'PUBLIC_MEETING_POINT',sourceMeetingPointConfirmed:true,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,reviewRef:'self:synthetic-review'}};
  const lead=await prisma.externalSourceLead.create({data:parseLead(facts)});leads.push(lead.id);
  const opened=await http().post('/leads/'+lead.id+'/inquiry').set('x-api-key',key).send({});expect(opened.status).toBe(200);
  const rid=opened.body.id,ask=await http().post('/leads/'+lead.id+'/inquiry/'+rid+'/actions?presentation=1').set('x-api-key',key).send({requestId:randomUUID(),action:'ASK',text:'私人合成買家問1000元可否購買',consent:true,transferHash:opened.body.transferHash});expect(ask.status).toBe(200);expect(ask.body.state).toBe('WAITING_ROUTE');
  const route={leadId:lead.id,contentHash:lead.contentHash,sourceUrl:lead.canonicalUrl,channel:'FACEBOOK_UI',publicRouteUrl:lead.canonicalUrl,identityEvidenceRef:'self:synthetic-author',routeEvidenceRef:'self:synthetic-route',confirmOriginalSeller:true,routeKind:'PUBLIC_COMMENT',actingPageId:RELAY_PAGE_ID};
  return {lead,rid,route};
 }
 async function prepared(){const f=await fixture();expect((await post('/admin/'+f.lead.id+'/seller-route',f.route)).status).toBe(200);const out=await post('/admin/inquiries/'+f.rid+'/prepare-transfer',{requestId:randomUUID()});expect(out.status).toBe(200);return {...f,prepared:out.body};}
 const proof=(f:any)=>{const v=f.prepared.reservation;return {requestId:randomUUID(),reservationId:v.id,payloadHash:v.payloadHash,routeHash:v.routeHash,leadId:f.lead.id,sourceUrl:f.lead.canonicalUrl,channel:'FACEBOOK_UI',receiptRef:'self:synthetic-not-real-send',sentAt:new Date().toISOString(),outcome:'CONFIRMED_SENT'};};
 test('identity discovery is admin-only and side-effect free',async()=>{
  expect((await http().get('/admin/relay-identity')).status).toBe(401);
  const before=await prisma.sourceLeadInquiry.count();expect((await http().get('/admin/relay-identity').set('x-admin-key',admin)).body).toEqual(relayIdentity());expect(await prisma.sourceLeadInquiry.count()).toBe(before);
 });
 test('new route/preflight bind Two Pigs; old/unknown identities are refused and buyer text is excluded',async()=>{
  const f=await fixture();for(const actingPageId of [WISHLIST_PAGE_ID,'personal'])expect((await post('/admin/'+f.lead.id+'/seller-route',{...f.route,actingPageId})).status).toBe(409);
  expect((await post('/admin/'+f.lead.id+'/seller-route',f.route)).status).toBe(200);
  const prepared=await post('/admin/inquiries/'+f.rid+'/prepare-transfer',{requestId:randomUUID()});expect(prepared.status).toBe(200);expect(prepared.body.publicComment).toMatchObject({...relayIdentity(),postUrl:f.lead.canonicalUrl,buyerTextIncluded:false});expect(prepared.body.publicComment.text).toBe('您好，請問「合成測試樹屋」目前仍在售嗎？售價及取貨方式為何？謝謝。');expect(prepared.body.publicComment.text).not.toMatch(/私人|1000|0912345678/);
  const pre=await http().get('/admin/inquiries/'+f.rid+'/transfer-preflight').set('x-admin-key',admin);expect(pre.status).toBe(200);expect(pre.body.publicComment).toEqual(prepared.body.publicComment);expect(pre.body.outboundSent).toBe(false);
  const p=proof({...f,prepared:prepared.body});expect((await post('/admin/inquiries/'+f.rid+'/delivery',p)).body.state).toBe('DELIVERED');expect((await post('/admin/inquiries/'+f.rid+'/delivery',p)).status).toBe(200);
 });
 test('legacy routes retain history but require a new identity check before preparing',async()=>{
  const f=await fixture(),legacy={...f.route,actingPageId:WISHLIST_PAGE_ID,verifiedAt:new Date().toISOString()};await prisma.externalSourceLead.update({where:{id:f.lead.id},data:{sellerRoute:legacy}});
  const stopped=await post('/admin/inquiries/'+f.rid+'/prepare-transfer',{requestId:randomUUID()});expect(stopped.body.errorCode).toBe('PUBLIC_COMMENT_IDENTITY_RECHECK_REQUIRED');expect((await prisma.externalSourceLead.findUniqueOrThrow({where:{id:f.lead.id}})).sellerRoute).toEqual(legacy);
 });
 test('rejection is buyer progress with the exact source link, never a reply/delivery, and stops further sends',async()=>{
  const f=await prepared(),path='/admin/inquiries/'+f.rid+'/transfer-issue',v=f.prepared.reservation;
  const issue={requestId:randomUUID(),reservationId:v.id,leadId:f.lead.id,sourceUrl:f.lead.canonicalUrl,actingPageId:RELAY_PAGE_ID,commentId:'123456789',checkedAt:new Date().toISOString(),code:'FACEBOOK_COMMENT_REJECTED'};
  for(const patch of [{actingPageId:WISHLIST_PAGE_ID},{sourceUrl:f.lead.canonicalUrl+'7'},{reservationId:randomUUID()}])expect((await post(path,{...issue,...patch})).status).toBe(409);
  const before=await prisma.sourceLeadInquiry.findUniqueOrThrow({where:{id:f.rid}}),r=await post(path,issue);expect(r.status).toBe(200);expect(r.body).toMatchObject({state:'DELIVERY_REQUIRES_REVIEW',delivered:false,delivery:null,transferIssue:{code:issue.code,checkedAt:issue.checkedAt,originalPostUrl:f.lead.canonicalUrl}});expect((await prisma.sourceLeadInquiry.findUniqueOrThrow({where:{id:f.rid}})).events).toEqual(before.events);
  expect((await post(path,issue)).status).toBe(200);expect((await post(path,{...issue,requestId:randomUUID()})).status).toBe(409);
  const buyer=await http().get('/leads/'+f.lead.id+'/inquiry?presentation=1&progress=1').set('x-api-key',key);expect(buyer.body.transferIssue).toEqual(r.body.transferIssue);expect(buyer.body.events.some((e:any)=>e.action==='SELLER_REPLY')).toBe(false);
  expect((await http().get('/leads/'+f.lead.id+'/inquiry?presentation=1&progress=1').set('x-api-key',other)).body).toBeNull();expect((await http().get('/leads/'+f.lead.id+'/inquiry?presentation=1')).status).toBe(401);
  expect((await http().get('/leads/'+f.lead.id+'/inquiry').set('x-api-key',key)).body).not.toHaveProperty('transferIssue');expect((await http().get('/leads/'+f.lead.id+'/inquiry?presentation=1').set('x-api-key',key)).body).not.toHaveProperty('transferIssue');
  expect((await post('/admin/inquiries/'+f.rid+'/prepare-transfer',{requestId:randomUUID()})).status).toBe(409);expect((await post('/admin/inquiries/'+f.rid+'/delivery',proof(f))).body.errorCode).toBe('TRANSFER_ISSUE_REQUIRES_REVIEW');
 });
 test('an expired former-identity rejection can be recorded without renewing the reservation',async()=>{
  const f=await prepared(),v=f.prepared.reservation,legacy={...f.prepared.route,actingPageId:WISHLIST_PAGE_ID},reservation={...v,routeHash:digest(legacy),expiresAt:new Date(Date.now()-1000).toISOString()};
  await prisma.externalSourceLead.update({where:{id:f.lead.id},data:{sellerRoute:legacy}});await prisma.sourceLeadInquiry.update({where:{id:f.rid},data:{delivery:{reservation}}});
  const response=await post('/admin/inquiries/'+f.rid+'/transfer-issue',{requestId:randomUUID(),reservationId:v.id,leadId:f.lead.id,sourceUrl:f.lead.canonicalUrl,actingPageId:WISHLIST_PAGE_ID,commentId:'987654321',checkedAt:new Date().toISOString(),code:'FACEBOOK_COMMENT_REJECTED'});expect(response.status).toBe(200);expect(response.body.delivered).toBe(false);
  const saved:any=(await prisma.sourceLeadInquiry.findUniqueOrThrow({where:{id:f.rid}})).delivery;expect(saved.reservation).toEqual(reservation);expect(saved).not.toHaveProperty('receipt');
 });
});
