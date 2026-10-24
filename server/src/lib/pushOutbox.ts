import {Prisma} from '@prisma/client';
import prisma from './prisma';
import {defaultNotificationPreferences} from './notificationRules';
const SEND='https://exp.host/--/api/v2/push/send',RECEIPTS='https://exp.host/--/api/v2/push/getReceipts';
export async function queuePush(tx:Prisma.TransactionClient,userId:number,eventKey:string,kind:'CHAT'|'MEETUP'|'SOURCE_REPLY',reference:{messageId?:string;meetupId?:string;inquiryId?:string}){
 // No provider request inside a user transaction. A committed event is bound
 // to existing content; erasure cascades remove its pending deliveries too.
 if(!await tx.pushDevice.findFirst({where:{userId},select:{id:true}}))return;
 await tx.pushOutbox.upsert({where:{eventKey},create:{userId,eventKey,kind,...reference},update:{}});
}
export async function notificationUnreadCount(userId:number){
 const rows=await prisma.$queryRaw<{count:bigint}[]>`SELECT (SELECT COUNT(*) FROM "Message" m JOIN "ConversationParticipant" p ON p."conversationId"=m."conversationId" WHERE p."userId"=${userId} AND m."senderUserId"<>${userId} AND m."sequence">p."lastReadSequence") + (SELECT COALESCE(SUM("replySequence"-"lastReadReplySequence"),0) FROM "SourceLeadInquiry" WHERE "buyerUserId"=${userId}) AS count`;
 return Number(rows[0]?.count??BigInt(0));
}
function headers(){return {'Content-Type':'application/json',...(process.env.EXPO_PUSH_ACCESS_TOKEN?{Authorization:'Bearer '+process.env.EXPO_PUSH_ACCESS_TOKEN}:{})};}
export async function processPushOutbox(fetcher:typeof fetch=fetch){
 const now=new Date();
 const claimed=await prisma.$transaction(async tx=>{
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PushOutbox" WHERE "processedAt" IS NULL AND "nextAttemptAt"<=NOW() AND ("lockedUntil" IS NULL OR "lockedUntil"<NOW()) ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
  if(!rows.length)return null;
  return tx.pushOutbox.update({where:{id:rows[0].id},data:{lockedUntil:new Date(Date.now()+60000),attempts:{increment:1}},include:{user:{select:{authVersion:true,notificationPreference:true}},message:{select:{text:true,photoHash:true,conversationId:true,conversation:{select:{participants:{select:{userId:true}},buyerUserId:true,sellerUserId:true}}}},meetup:{select:{conversationId:true,conversation:{select:{participants:{select:{userId:true}},buyerUserId:true,sellerUserId:true}}}},inquiry:{select:{leadId:true,buyerUserId:true}}}});
 });
 if(claimed){
  try{
   const pref=claimed.user.notificationPreference??defaultNotificationPreferences;
   const allowed=claimed.kind==='CHAT'?pref.chat:claimed.kind==='MEETUP'?pref.meetup:pref.sourceReply;
   const conversation=claimed.message?.conversation??claimed.meetup?.conversation;
   const member=conversation?conversation.participants.some(p=>p.userId===claimed.userId):claimed.inquiry?.buyerUserId===claimed.userId;
   const blocked=conversation&&conversation.buyerUserId!==null&&conversation.sellerUserId!==null?!!await prisma.userBlock.findFirst({where:{OR:[{blockerUserId:conversation.buyerUserId,blockedUserId:conversation.sellerUserId},{blockerUserId:conversation.sellerUserId,blockedUserId:conversation.buyerUserId}]},select:{blockerUserId:true}}):false;
   if(!allowed||!member||blocked||now.getTime()-claimed.createdAt.getTime()>86400000){await prisma.pushOutbox.update({where:{id:claimed.id},data:{processedAt:now,lockedUntil:null}});return;}
   const devices=await prisma.pushDevice.findMany({where:{userId:claimed.userId,authVersion:claimed.user.authVersion,registeredAt:{lte:claimed.createdAt}},take:10});
   for(const device of devices)await prisma.pushDelivery.upsert({where:{outboxId_deviceId:{outboxId:claimed.id,deviceId:device.id}},create:{outboxId:claimed.id,deviceId:device.id,bindingId:device.bindingId},update:{}});
   const deliveries=await prisma.pushDelivery.findMany({where:{outboxId:claimed.id,state:{in:['PENDING','RETRY']}},include:{device:true}});
   for(const d of deliveries){if(d.bindingId!==d.device.bindingId||d.device.userId!==claimed.userId||d.device.authVersion!==claimed.user.authVersion)await prisma.pushDelivery.updateMany({where:{outboxId:d.outboxId,deviceId:d.deviceId,bindingId:d.bindingId},data:{state:'REVOKED',checkedAt:now}});}
   const targets=deliveries.filter(d=>d.bindingId===d.device.bindingId&&d.device.userId===claimed.userId&&d.device.authVersion===claimed.user.authVersion);
   if(targets.length){
    const badge=await notificationUnreadCount(claimed.userId),roomId=claimed.message?.conversationId??claimed.meetup?.conversationId;
    const body=claimed.kind==='CHAT'?pref.preview?(claimed.message?.photoHash?'收到一張商品照片':[...(claimed.message?.text??'')].slice(0,100).join('')??'你有新的商品聊天訊息'):'你有新的商品聊天訊息':claimed.kind==='MEETUP'?'面交預約有更新，請開啟查看最新條件':'代問商品收到原賣家回覆，請開啟查看';
    const payload=targets.map(d=>({to:d.device.expoPushToken,title:'Wishlist',body,sound:'default',badge,channelId:'transactions',tag:claimed.id,collapseId:claimed.id,data:{eventId:claimed.id,userId:claimed.userId,...(roomId?{kind:'chat',roomId}:{kind:'source',leadId:claimed.inquiry!.leadId})}}));
    const response=await fetcher(SEND,{method:'POST',headers:headers(),body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Provider unavailable');const result=await response.json() as {data?:{status?:string;id?:string;details?:{error?:string}}[]};
    if(!Array.isArray(result.data)||result.data.length!==targets.length)throw Error('Provider reply invalid');
    for(let i=0;i<targets.length;i++){
     const ticket=result.data[i],target=targets[i],where={outboxId_deviceId:{outboxId:target.outboxId,deviceId:target.deviceId}};
     if(ticket.status==='ok'&&typeof ticket.id==='string'&&ticket.id.length<=300)await prisma.pushDelivery.update({where,data:{state:'TICKET_ACCEPTED',ticketId:ticket.id,receiptCheckAt:new Date(Date.now()+15*60000)}});
     else if(ticket.details?.error==='DeviceNotRegistered'){await prisma.pushDevice.deleteMany({where:{id:target.deviceId,bindingId:target.bindingId}});}
     else await prisma.pushDelivery.update({where,data:{state:claimed.attempts<5?'RETRY':'FAILED',checkedAt:now}});
    }
   }
   const remaining=await prisma.pushDelivery.count({where:{outboxId:claimed.id,state:{in:['PENDING','RETRY']}}});
   await prisma.pushOutbox.update({where:{id:claimed.id},data:{lockedUntil:null,...(remaining&&claimed.attempts<5?{nextAttemptAt:new Date(Date.now()+30000*2**claimed.attempts)}:{processedAt:now})}});
  }catch{
   // No payload, token or provider response is logged. The stable collapse ID
   // coalesces notification retries; it never replays the user message.
   await prisma.pushOutbox.updateMany({where:{id:claimed.id},data:{lockedUntil:null,...(claimed.attempts<5?{nextAttemptAt:new Date(Date.now()+30000*2**claimed.attempts)}:{processedAt:now})}});
  }
 }
 const waiting=await prisma.pushDelivery.findMany({where:{state:'TICKET_ACCEPTED',receiptCheckAt:{lte:now},ticketId:{not:null}},take:100,include:{outbox:{select:{createdAt:true}}}});
 if(waiting.length){try{
  const response=await fetcher(RECEIPTS,{method:'POST',headers:headers(),body:JSON.stringify({ids:waiting.map(d=>d.ticketId)}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)return;
  const result=await response.json() as {data?:Record<string,{status?:string;details?:{error?:string}}>};
  for(const delivery of waiting){const item=result.data?.[delivery.ticketId!];if(!item){await prisma.pushDelivery.updateMany({where:{outboxId:delivery.outboxId,deviceId:delivery.deviceId},data:Date.now()-delivery.outbox.createdAt.getTime()>86400000?{state:'RECEIPT_UNKNOWN',checkedAt:now,receiptCheckAt:null}:{receiptCheckAt:new Date(Date.now()+15*60000)}});continue;}
   if(item.details?.error==='DeviceNotRegistered'){await prisma.pushDevice.deleteMany({where:{id:delivery.deviceId,bindingId:delivery.bindingId}});await prisma.pushDelivery.updateMany({where:{outboxId:delivery.outboxId,deviceId:delivery.deviceId},data:{state:'REVOKED',checkedAt:now,receiptCheckAt:null}});}
   else await prisma.pushDelivery.updateMany({where:{outboxId:delivery.outboxId,deviceId:delivery.deviceId},data:{state:item.status==='ok'?'PROVIDER_ACCEPTED':'FAILED',checkedAt:now,receiptCheckAt:null}});
  }
 }catch{/* Retain the receipt lookup for a later worker pass. */}}
 // Notification transport metadata only; never message/photo records.
 await prisma.pushOutbox.deleteMany({where:{createdAt:{lt:new Date(Date.now()-7*86400000)}}});
}
export function startPushWorker(){if(process.env.PUSH_NOTIFICATIONS_ENABLED!=='1')return()=>{};let running=false,stopped=false;const tick=async()=>{if(running||stopped)return;running=true;try{await processPushOutbox();}catch{console.error('Notification delivery check unavailable; details withheld');}finally{running=false;}};const timer=setInterval(()=>void tick(),30000);timer.unref();void tick();return()=>{stopped=true;clearInterval(timer);};}
