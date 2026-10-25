import express from 'express';
import {createLoopbackRequest} from './loopbackHttp';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import notificationRoutes from '../../routes/notificationRoutes';
import chatRoutes from '../../routes/chatRoutes';
import {notificationPreferenceInput} from '../../lib/notificationRules';
import {processPushOutbox,notificationUnreadCount} from '../../lib/pushOutbox';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB required');
const secret='notification-isolated-test-only';process.env.JWT_SECRET=secret;
const app=express();app.set('trust proxy',1);app.use(express.json());app.use('/api/notifications',notificationRoutes);app.use('/api/chat',chatRoutes);
const http=createLoopbackRequest(app);
let buyer:number,seller:number,third:number,listingId:string,roomId:string,ip=1;
const token=(id:number)=>jwt.sign({id,authVersion:0},secret,{expiresIn:'1h'});
const call=(method:'get'|'post'|'delete',path:string,id=seller)=>http[method]('/api'+path).set('Authorization','Bearer '+token(id)).set('X-Forwarded-For','198.51.100.'+(ip++%250+1));
const preferences={chat:true,meetup:true,sourceReply:true,preview:false};
const device=(id=randomUUID(),registrationVersion=1,push='ExpoPushToken[synthetic_'+randomUUID()+']')=>({deviceId:id,registrationVersion,expoPushToken:push,platform:'android'});
beforeAll(async()=>{const run=randomUUID(),users=await Promise.all(['buyer','seller','third'].map(role=>prisma.user.create({data:{phoneNumber:run+role,password:'not-login',name:'合成'+role}})));[buyer,seller,third]=users.map(u=>u.id);});
beforeEach(async()=>{await prisma.pushOutbox.deleteMany({where:{userId:{in:[buyer,seller,third]}}});await prisma.pushDevice.deleteMany({where:{userId:{in:[buyer,seller,third]}}});await prisma.notificationPreferenceOperation.deleteMany({where:{userId:{in:[buyer,seller,third]}}});await prisma.notificationPreference.deleteMany({where:{userId:{in:[buyer,seller,third]}}});await prisma.conversation.deleteMany({where:{buyerUserId:buyer}});await prisma.listing.deleteMany({where:{ownerUserId:seller}});await prisma.user.updateMany({where:{id:{in:[buyer,seller,third]}},data:{authVersion:0}});
 const listing=await prisma.listing.create({data:{ownerUserId:seller,title:'合成測試相機',clientListingId:randomUUID(),requestHash:'synthetic',status:'ACTIVE',price:100,publishedAt:new Date(),expiresAt:new Date(Date.now()+86400000)}});listingId=listing.id;const room=await call('post','/chat/conversations',buyer).send({listingId});roomId=room.body.id;});
afterAll(async()=>{if(buyer)await prisma.user.deleteMany({where:{id:{in:[buyer,seller,third]}}});await prisma.$disconnect();});
it('requires authentication and defaults to content-hidden transaction categories',async()=>{expect((await http.get('/api/notifications/preferences')).status).toBe(401);const p=await call('get','/notifications/preferences');expect(p.body).toEqual({...preferences,version:0});});
it('saves one versioned preference operation, acknowledges repeats and rejects conflicting content',async()=>{const id=randomUUID(),body={expectedVersion:0,preferences:{...preferences,chat:false}};const a=await call('post','/notifications/preference-operations/'+id).send(body);expect(a.body.receipt.state).toBe('APPLIED');expect(a.body.current).toEqual({...body.preferences,version:1});const again=await call('post','/notifications/preference-operations/'+id).send(body);expect(again.body.receipt).toEqual(a.body.receipt);expect((await call('get','/notifications/preference-operations/'+id)).body.current.version).toBe(1);expect((await call('post','/notifications/preference-operations/'+id).send({...body,preferences})).status).toBe(400);});
it('serializes concurrent preference writers without silently overwriting the other device',async()=>{const values=await Promise.all([false,true].map(preview=>call('post','/notifications/preference-operations/'+randomUUID()).send({expectedVersion:0,preferences:{...preferences,preview}})));expect(values.map(r=>r.body.receipt.state).sort()).toEqual(['APPLIED','CONFLICT']);expect((await call('get','/notifications/preferences')).body.version).toBe(1);});
it('durably stops an unreceived preference operation and does not apply a delayed replay',async()=>{const id=randomUUID(),body={expectedVersion:0,preferences:{...preferences,chat:false}},hash=notificationPreferenceInput(body).requestHash;const stopped=await call('post','/notifications/preference-operations/'+id+'/abandon').send({requestHash:hash});expect(stopped.body.receipt.state).toBe('ABANDONED');expect((await call('post','/notifications/preference-operations/'+id).send(body)).body.receipt.state).toBe('ABANDONED');expect((await call('get','/notifications/preferences')).body).toEqual({...preferences,version:0});});
it('never exposes provider tokens and fences a stale account registration or logout',async()=>{const a=device();const registered=await call('post','/notifications/devices').send(a);expect(registered.body.registered).toBe(true);expect(JSON.stringify(registered.body)).not.toContain(a.expoPushToken);await call('post','/notifications/devices',third).send({...a,registrationVersion:2});expect((await call('post','/notifications/devices').send(a)).status).toBe(400);await call('delete','/notifications/devices').send({deviceId:a.deviceId,registrationVersion:1});expect((await prisma.pushDevice.findUnique({where:{id:a.deviceId}}))?.userId).toBe(third);});
it('does not allow a delayed old-session logout to delete a newer registration of the same user',async()=>{const a=device();await call('post','/notifications/devices').send(a);await call('post','/notifications/devices').send({...a,registrationVersion:2});await call('delete','/notifications/devices').send({deviceId:a.deviceId,registrationVersion:1});expect((await prisma.pushDevice.findUnique({where:{id:a.deviceId}}))?.registrationVersion).toBe(2);await prisma.user.update({where:{id:seller},data:{authVersion:1}});expect((await call('post','/notifications/devices').send({...a,registrationVersion:3})).status).toBe(401);});
it('retains token-free revocation versions before or after registration and rejects delayed replay',async()=>{
 const a=device();await call('post','/notifications/devices').send(a);
 expect((await call('delete','/notifications/devices').send({deviceId:a.deviceId,registrationVersion:1})).status).toBe(200);
 expect(await prisma.pushDevice.findUnique({where:{id:a.deviceId}})).toMatchObject({userId:seller,registrationVersion:1,expoPushToken:null});
 expect((await call('post','/notifications/devices').send(a)).status).toBe(400);
 expect((await call('post','/notifications/devices').send({...a,registrationVersion:2})).body.registered).toBe(true);
 const notReceived=device(randomUUID(),4);
 await call('delete','/notifications/devices').send({deviceId:notReceived.deviceId,registrationVersion:4});
 expect((await call('post','/notifications/devices').send(notReceived)).status).toBe(400);
 expect((await call('post','/notifications/devices').send({...notReceived,registrationVersion:5})).body.registered).toBe(true);
 expect((await call('delete','/notifications/devices').send({deviceId:randomUUID(),registrationVersion:2147483647})).status).toBe(400);
});
it('serializes concurrent cross-account device registrations so a lower version cannot win last',async()=>{
 const a=device();const responses=await Promise.all([call('post','/notifications/devices').send(a),call('post','/notifications/devices',third).send({...a,registrationVersion:2})]);
 expect(responses.every(r=>[200,400].includes(r.status))).toBe(true);
 expect(await prisma.pushDevice.findUnique({where:{id:a.deviceId}})).toMatchObject({userId:third,registrationVersion:2,expoPushToken:a.expoPushToken});
 await call('delete','/notifications/devices').send({deviceId:a.deviceId,registrationVersion:1});
 expect((await prisma.pushDevice.findUnique({where:{id:a.deviceId}}))?.userId).toBe(third);
});
it('revokes replaced token aliases without allowing their original registration to steal the token back',async()=>{
 const a=device(),b={...a,deviceId:randomUUID()};await call('post','/notifications/devices').send(a);
 await call('post','/notifications/devices',third).send(b);
 expect(await prisma.pushDevice.findUnique({where:{id:a.deviceId}})).toMatchObject({expoPushToken:null,registrationVersion:1});
 expect((await call('post','/notifications/devices').send(a)).status).toBe(400);
 expect(await prisma.pushDevice.findUnique({where:{id:b.deviceId}})).toMatchObject({userId:third,expoPushToken:a.expoPushToken});
});
it('does not queue or deliver new events for revoked devices',async()=>{
 const a=device();await call('post','/notifications/devices').send(a);
 await call('delete','/notifications/devices').send({deviceId:a.deviceId,registrationVersion:1});
 await call('post',`/chat/conversations/${roomId}/messages`,buyer).send({clientMessageId:randomUUID(),text:'停用後的合成訊息'});
 expect(await prisma.pushOutbox.count({where:{userId:seller}})).toBe(0);
 const fetcher=jest.fn();await processPushOutbox(fetcher as typeof fetch);expect(fetcher).not.toHaveBeenCalled();
});
it('retains a negative version after provider rejection instead of allowing the same token registration to return',async()=>{
 const a=device();await call('post','/notifications/devices').send(a);
 await call('post',`/chat/conversations/${roomId}/messages`,buyer).send({clientMessageId:randomUUID(),text:'合成提供者拒絕'});
 const fetcher=jest.fn(async()=>new Response(JSON.stringify({data:[{status:'error',details:{error:'DeviceNotRegistered'}}]}),{status:200}));
 await processPushOutbox(fetcher as typeof fetch);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await prisma.pushDevice.findUnique({where:{id:a.deviceId}})).toMatchObject({expoPushToken:null,registrationVersion:1});
 expect((await call('post','/notifications/devices').send(a)).status).toBe(400);
 expect((await call('post','/notifications/devices').send({...a,registrationVersion:2})).body.registered).toBe(true);
});
it('does not let a late provider rejection revoke a newer owner or retry old content to that owner',async()=>{
 const a=device();await call('post','/notifications/devices').send(a);
 await call('post',`/chat/conversations/${roomId}/messages`,buyer).send({clientMessageId:randomUUID(),text:'不可重送給新裝置持有者'});
 const replacement={...a,registrationVersion:2,expoPushToken:device().expoPushToken};
 const fetcher=jest.fn(async()=>{
  expect((await call('post','/notifications/devices',third).send(replacement)).body.registered).toBe(true);
  return new Response(JSON.stringify({data:[{status:'error',details:{error:'DeviceNotRegistered'}}]}),{status:200});
 });
 await processPushOutbox(fetcher as typeof fetch);
 expect(await prisma.pushDevice.findUnique({where:{id:a.deviceId}})).toMatchObject({userId:third,registrationVersion:2,expoPushToken:replacement.expoPushToken});
 await prisma.pushOutbox.updateMany({where:{userId:seller},data:{nextAttemptAt:new Date(Date.now()-1000)}});
 const retry=jest.fn();await processPushOutbox(retry as typeof fetch);expect(retry).not.toHaveBeenCalled();
});
it('does not count revoked history against the ten active-device slots',async()=>{
 await prisma.pushDevice.createMany({data:Array.from({length:10},()=>({id:randomUUID(),userId:seller,authVersion:0,registrationVersion:1,expoPushToken:null,bindingId:randomUUID(),platform:'revoked'}))});
 expect((await call('post','/notifications/devices').send(device())).body.registered).toBe(true);
 expect(await prisma.pushDevice.count({where:{userId:seller,expoPushToken:{not:null}}})).toBe(1);
});
it('bounds revocation history and safely releases old-session fences only after auth-version revocation',async()=>{
 await prisma.pushDevice.createMany({data:Array.from({length:100},()=>({id:randomUUID(),userId:seller,authVersion:0,registrationVersion:1,expoPushToken:null,bindingId:randomUUID(),platform:'revoked'}))});
 const a=device();expect((await call('post','/notifications/devices').send(a)).status).toBe(400);
 expect((await call('delete','/notifications/devices').send({deviceId:a.deviceId,registrationVersion:1})).status).toBe(400);
 expect(await prisma.pushDevice.count({where:{userId:seller}})).toBe(100);
 await prisma.user.update({where:{id:seller},data:{authVersion:1}});
 const fresh=jwt.sign({id:seller,authVersion:1},secret,{expiresIn:'1h'});
 const response=await http.post('/api/notifications/devices').set('Authorization','Bearer '+fresh).send(a);
 expect(response.body.registered).toBe(true);expect(await prisma.pushDevice.count({where:{userId:seller}})).toBe(1);
 expect((await call('post','/notifications/devices').send(a)).status).toBe(401);
});
it('erases a revoked-device fence with its owner and rejects the erased session',async()=>{
 const user=await prisma.user.create({data:{phoneNumber:randomUUID()+'push-erasure',password:'synthetic-not-login'}}),a=device();
 try{await call('post','/notifications/devices',user.id).send(a);await call('delete','/notifications/devices',user.id).send({deviceId:a.deviceId,registrationVersion:1});
  expect(await prisma.pushDevice.count({where:{userId:user.id}})).toBe(1);await prisma.user.delete({where:{id:user.id}});
  expect(await prisma.pushDevice.count({where:{id:a.deviceId}})).toBe(0);expect((await call('post','/notifications/devices',user.id).send(a)).status).toBe(401);
 }finally{await prisma.user.deleteMany({where:{id:user.id}});}
});
it('atomically queues a message once and sends a generic payload with real unread count',async()=>{await call('post','/notifications/devices').send(device());const id=randomUUID(),body={clientMessageId:id,text:'私密測試內容不能出現在預設推播'};await call('post',`/chat/conversations/${roomId}/messages`,buyer).send(body);await call('post',`/chat/conversations/${roomId}/messages`,buyer).send(body);expect(await prisma.pushOutbox.count({where:{userId:seller}})).toBe(1);
 const fetcher=jest.fn(async(_url:unknown,init?:RequestInit)=>{const payload=JSON.parse(init!.body as string);expect(JSON.stringify(payload)).not.toContain(body.text);expect(payload[0].badge).toBe(1);expect(payload[0].data).toMatchObject({userId:seller,kind:'chat',roomId});return new Response(JSON.stringify({data:[{status:'ok',id:'opaque-ticket-synthetic'}]}),{status:200});});await processPushOutbox(fetcher as typeof fetch);expect(fetcher).toHaveBeenCalledTimes(1);expect((await prisma.pushDelivery.findFirst({where:{outbox:{userId:seller}}}))?.state).toBe('TICKET_ACCEPTED');expect(await notificationUnreadCount(seller)).toBe(1);
});
it('honors disabled categories and removes transport records with authored content',async()=>{await call('post','/notifications/devices').send(device());await call('post','/notifications/preference-operations/'+randomUUID()).send({expectedVersion:0,preferences:{...preferences,chat:false}});const sent=await call('post',`/chat/conversations/${roomId}/messages`,buyer).send({clientMessageId:randomUUID(),text:'隱私測試'});const fetcher=jest.fn();await processPushOutbox(fetcher as typeof fetch);expect(fetcher).not.toHaveBeenCalled();await prisma.message.delete({where:{id:sent.body.id}});expect(await prisma.pushOutbox.count({where:{userId:seller}})).toBe(0);});
it('counts only original seller reply sequences, authorizes source targets, and keeps read positions monotonic',async()=>{const lead=await prisma.externalSourceLead.create({data:{status:'PRIVATE_PENDING',archiveItemId:randomUUID(),contentHash:'synthetic',title:'合成來源相機',summary:'合成',canonicalUrl:'https://www.facebook.com/groups/123/posts/456',evidence:{}}});try{const inquiry=await prisma.sourceLeadInquiry.create({data:{leadId:lead.id,buyerUserId:seller,leadContentHash:'synthetic',events:[{action:'ASK'},{action:'CONSENT'},{action:'SELLER_REPLY'}],replySequence:1}});expect(await notificationUnreadCount(seller)).toBe(1);expect((await call('get','/notifications/source-target/'+lead.id,third)).status).toBe(404);expect((await call('get','/notifications/source-target/'+lead.id)).body.inquiryId).toBe(inquiry.id);expect((await call('post','/notifications/source-read/'+inquiry.id).send({throughSequence:2})).status).toBe(400);expect((await call('post','/notifications/source-read/'+inquiry.id).send({throughSequence:1})).body.lastReadReplySequence).toBe(1);await call('post','/notifications/source-read/'+inquiry.id).send({throughSequence:0});expect(await notificationUnreadCount(seller)).toBe(0);await prisma.sourceLeadInquiry.delete({where:{id:inquiry.id}});}finally{await prisma.externalSourceLead.delete({where:{id:lead.id}});}});
