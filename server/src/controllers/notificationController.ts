import {Response} from 'express';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'crypto';
import prisma from '../lib/prisma';
import {AuthRequest} from '../middleware/auth';
import {decodeUserSessionJwt} from '../lib/jwtConfig';
import {chatIdentity,chatObject,chatSequence,ChatInputError} from '../lib/chatRules';
import {defaultNotificationPreferences,notificationDeviceInput,notificationPreferenceInput} from '../lib/notificationRules';
import {lockPushDeviceRegistry,revokePushBinding,pruneExpiredPushSessions,MAX_PUSH_INSTALLATION_HISTORY} from '../lib/pushDeviceRegistry';
class NotificationAccessError extends Error{constructor(public status=401){super();}}
async function gate(tx:Prisma.TransactionClient,req:AuthRequest,userId:number){
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(${4294967296+userId}::bigint)`;
 await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR NO KEY UPDATE`;
 const user=await tx.user.findUnique({where:{id:userId},select:{authVersion:true,apiKey:true}});if(!user)throw new NotificationAccessError();
 const key=req.headers['x-api-key'];
 if(key){if(typeof key!=='string'||user.apiKey!==key)throw new NotificationAccessError();}
 else{try{const claims=decodeUserSessionJwt(req.headers.authorization?.split(' ')[1]??'');if(claims.id!==userId||claims.authVersion!==user.authVersion)throw Error();}catch{throw new NotificationAccessError();}}
 return user;
}
const preferenceSelect={chat:true,meetup:true,sourceReply:true,preview:true,version:true};
const current=async(tx:Prisma.TransactionClient,userId:number)=>await tx.notificationPreference.findUnique({where:{userId},select:preferenceSelect})??defaultNotificationPreferences;
const receipt=(r:{clientActionId:string;requestHash:string;state:string;appliedVersion:number|null;createdAt:Date})=>({clientActionId:r.clientActionId,requestHash:r.requestHash,state:r.state,appliedVersion:r.appliedVersion,createdAt:r.createdAt});
function endpoint(run:(req:AuthRequest,userId:number)=>Promise<unknown>){return async(req:AuthRequest,res:Response)=>{
 res.set('Cache-Control','private, no-store');if(!req.user)return res.status(401).json({errorCode:'MISSING_TOKEN'});
 try{if(Object.keys(req.query).length)throw new ChatInputError();return res.json(await run(req,req.user.id));}
 catch(e){return res.status(e instanceof NotificationAccessError?e.status:e instanceof ChatInputError?400:503).json({errorCode:e instanceof NotificationAccessError?'NOTIFICATION_SESSION_EXPIRED':e instanceof ChatInputError?'NOTIFICATION_INPUT_REJECTED':'NOTIFICATION_UNCONFIRMED'});}
};}
export const getNotificationPreferences=endpoint(async(req,userId)=>prisma.$transaction(async tx=>{await gate(tx,req,userId);return current(tx,userId);}));
export const getNotificationOperation=endpoint(async(req,userId)=>prisma.$transaction(async tx=>{await gate(tx,req,userId);const clientActionId=chatIdentity(req.params.clientActionId),r=await tx.notificationPreferenceOperation.findUnique({where:{userId_clientActionId:{userId,clientActionId}}});return {receipt:r?receipt(r):null,current:await current(tx,userId)};}));
export const submitNotificationOperation=endpoint(async(req,userId)=>{
 const clientActionId=chatIdentity(req.params.clientActionId),input=notificationPreferenceInput(req.body);
 return prisma.$transaction(async tx=>{
 await gate(tx,req,userId);const where={userId_clientActionId:{userId,clientActionId}},prior=await tx.notificationPreferenceOperation.findUnique({where});
 if(prior){if(prior.requestHash!==input.requestHash)throw new ChatInputError('操作內容不同');return {receipt:receipt(prior),current:await current(tx,userId)};}
 const before=await current(tx,userId),applied=before.version===input.expectedVersion&&before.version<2147483647;
 if(applied)await tx.notificationPreference.upsert({where:{userId},create:{userId,...input.preferences,version:1},update:{...input.preferences,version:{increment:1}}});
 const r=await tx.notificationPreferenceOperation.create({data:{userId,clientActionId,requestHash:input.requestHash,state:applied?'APPLIED':'CONFLICT',appliedVersion:applied?before.version+1:null}});
 return {receipt:receipt(r),current:await current(tx,userId)};
 });
});
export const abandonNotificationOperation=endpoint(async(req,userId)=>{
 const clientActionId=chatIdentity(req.params.clientActionId),b=chatObject(req.body,['requestHash']);if(Object.keys(b).length!==1||typeof b.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(b.requestHash))throw new ChatInputError();const requestHash=b.requestHash;
 return prisma.$transaction(async tx=>{await gate(tx,req,userId);const where={userId_clientActionId:{userId,clientActionId}},prior=await tx.notificationPreferenceOperation.findUnique({where});if(prior&&prior.requestHash!==requestHash)throw new ChatInputError();const r=prior??await tx.notificationPreferenceOperation.create({data:{userId,clientActionId,requestHash,state:'ABANDONED'}});return {receipt:receipt(r),current:await current(tx,userId)};});
});
export const registerPushDevice=endpoint(async(req,userId)=>{
 const input=notificationDeviceInput(req.body);
 return prisma.$transaction(async tx=>{const user=await gate(tx,req,userId);
 await lockPushDeviceRegistry(tx);
 await pruneExpiredPushSessions(tx,userId,user.authVersion);
 const existing=await tx.pushDevice.findUnique({where:{id:input.deviceId}});
 if(existing&&(input.registrationVersion<existing.registrationVersion||input.registrationVersion===existing.registrationVersion&&(existing.userId!==userId||existing.expoPushToken!==input.expoPushToken)))throw new ChatInputError('舊裝置註冊已失效，請重新連線');
 const same=existing?.userId===userId&&existing.authVersion===user.authVersion&&existing.expoPushToken===input.expoPushToken;
 if(!existing&&await tx.pushDevice.count({where:{userId}})>=MAX_PUSH_INSTALLATION_HISTORY)throw new ChatInputError('裝置歷程已達上限，請登出所有裝置後重新登入');
 if((!existing||existing.userId!==userId||existing.expoPushToken===null)&&await tx.pushDevice.count({where:{userId,expoPushToken:{not:null}}})>=10)throw new ChatInputError('裝置數量已達上限');
 const replaced=await tx.pushDevice.findMany({where:{expoPushToken:input.expoPushToken,id:{not:input.deviceId}},select:{id:true,bindingId:true}});
 for(const prior of replaced)await revokePushBinding(tx,prior.id,prior.bindingId);
 await tx.pushDevice.upsert({where:{id:input.deviceId},create:{id:input.deviceId,userId,registrationVersion:input.registrationVersion,authVersion:user.authVersion,expoPushToken:input.expoPushToken,platform:input.platform,bindingId:randomUUID()},update:{userId,registrationVersion:input.registrationVersion,authVersion:user.authVersion,expoPushToken:input.expoPushToken,platform:input.platform,...(!same?{bindingId:randomUUID(),registeredAt:new Date()}:{} )}});
 return {registered:true,deviceId:input.deviceId,registrationVersion:input.registrationVersion};
 });
});
export const removePushDevice=endpoint(async(req,userId)=>{
 const b=chatObject(req.body,['deviceId','registrationVersion']),deviceId=chatIdentity(b.deviceId);if(Object.keys(b).length!==2||!Number.isSafeInteger(b.registrationVersion)||Number(b.registrationVersion)<0||Number(b.registrationVersion)>=2147483647)throw new ChatInputError();
 return prisma.$transaction(async tx=>{const user=await gate(tx,req,userId);await lockPushDeviceRegistry(tx);await pruneExpiredPushSessions(tx,userId,user.authVersion);
 const current=await tx.pushDevice.findUnique({where:{id:deviceId}}),version=Number(b.registrationVersion);
 if(!current){if(await tx.pushDevice.count({where:{userId}})>=MAX_PUSH_INSTALLATION_HISTORY)throw new ChatInputError('裝置歷程已達上限，請登出所有裝置後重新登入');await tx.pushDevice.create({data:{id:deviceId,userId,authVersion:user.authVersion,registrationVersion:version,expoPushToken:null,bindingId:randomUUID(),platform:'revoked'}});}
 else if(current.userId===userId&&version>=current.registrationVersion){await revokePushBinding(tx,deviceId,current.bindingId);if(version>current.registrationVersion)await tx.pushDevice.update({where:{id:deviceId},data:{registrationVersion:version}});}
 return {removed:true,deviceId};});
});

export const getSourceNotificationTarget=endpoint(async(req,userId)=>{
 const leadId=chatIdentity(req.params.leadId);
 const row=await prisma.sourceLeadInquiry.findUnique({where:{leadId_buyerUserId:{leadId,buyerUserId:userId}},select:{id:true,lead:{select:{id:true,title:true,canonicalUrl:true,county:true,district:true}}}});
 if(!row)throw new NotificationAccessError(404);
 return {inquiryId:row.id,context:{id:row.lead.id,title:row.lead.title,canonicalUrl:row.lead.canonicalUrl,county:row.lead.county??'',district:row.lead.district??'',priceText:'售價待詢問'}};
});
export const getSourceNotificationReadState=endpoint(async(req,userId)=>{
 const inquiryId=chatIdentity(req.params.inquiryId);const row=await prisma.sourceLeadInquiry.findFirst({where:{id:inquiryId,buyerUserId:userId},select:{id:true,replySequence:true,lastReadReplySequence:true}});if(!row)throw new NotificationAccessError(404);return row;
});
export const markSourceNotificationRead=endpoint(async(req,userId)=>{
 const inquiryId=chatIdentity(req.params.inquiryId),b=chatObject(req.body,['throughSequence']);if(Object.keys(b).length!==1)throw new ChatInputError();const throughSequence=chatSequence(b.throughSequence);
 return prisma.$transaction(async tx=>{await gate(tx,req,userId);const row=await tx.sourceLeadInquiry.findFirst({where:{id:inquiryId,buyerUserId:userId},select:{replySequence:true}});if(!row)throw new NotificationAccessError(404);if(throughSequence>row.replySequence)throw new ChatInputError();await tx.sourceLeadInquiry.updateMany({where:{id:inquiryId,buyerUserId:userId,lastReadReplySequence:{lt:throughSequence}},data:{lastReadReplySequence:throughSequence}});return tx.sourceLeadInquiry.findUnique({where:{id:inquiryId},select:{id:true,replySequence:true,lastReadReplySequence:true}});});
});
