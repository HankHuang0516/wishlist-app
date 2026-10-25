import {createHash} from 'crypto';
import {Prisma} from '@prisma/client';
import {chatIdentity,chatObject,chatSequence,ChatInputError} from './chatRules';
import {NON_SALE_QA_PREFIX} from './listingRules';
import {privateReviewListingIds} from './privateReviewDemo';
import {leadCurrent} from './sourceLeadRules';
import {externalCandidateSelect,publicCandidate} from '../routes/externalListingRoutes';
export type ProductKind='listing'|'source'|'external';
export type InterestTarget={kind:ProductKind;id:string;productKey:string};
export function interestTarget(value:unknown):InterestTarget{
 if(typeof value!=='string'||! /^(listing|source|external):[a-f0-9-]{36}$/.test(value))throw new ChatInputError();
 const [kind,raw]=value.split(':'),id=chatIdentity(raw);return {kind:kind as ProductKind,id,productKey:kind+':'+id};
}
export function interestInput(value:unknown){const b=chatObject(value,['productKey','liked','expectedVersion']);if(Object.keys(b).length!==3||typeof b.liked!=='boolean')throw new ChatInputError();const input={productKey:interestTarget(b.productKey).productKey,liked:b.liked,expectedVersion:chatSequence(b.expectedVersion)};return {...input,requestHash:createHash('sha256').update(JSON.stringify(input)).digest('hex')};}
export async function visibleInterestTargets(tx:Prisma.TransactionClient,targets:InterestTarget[],viewerId?:number){
 const listingIds=targets.filter(t=>t.kind==='listing').map(t=>t.id),sourceIds=targets.filter(t=>t.kind==='source').map(t=>t.id),externalIds=targets.filter(t=>t.kind==='external').map(t=>t.id),now=new Date();
 const [listings,sources,externals]=await Promise.all([
 listingIds.length?tx.listing.findMany({where:{id:{in:listingIds,notIn:privateReviewListingIds()},NOT:{title:{startsWith:NON_SALE_QA_PREFIX}},OR:[{status:{in:['ACTIVE','RESERVED']},expiresAt:{gt:now}},...(viewerId?[{ownerUserId:viewerId}]:[])]},select:{id:true,ownerUserId:true,status:true,expiresAt:true}}):[],
 sourceIds.length&&process.env.SOURCE_LEADS_PUBLIC_ENABLED==='1'?tx.externalSourceLead.findMany({where:{id:{in:sourceIds}}}):[],
 externalIds.length&&process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED==='1'?tx.externalListingCandidate.findMany({where:{id:{in:externalIds}},select:externalCandidateSelect}):[]]);
 const valid=new Map<string,{ownerUserId:number|null;open:boolean}>();
 for(const r of listings)valid.set('listing:'+r.id,{ownerUserId:r.ownerUserId,open:['ACTIVE','RESERVED'].includes(r.status)&&!!r.expiresAt&&r.expiresAt>now});
 for(const r of sources)if(leadCurrent(r,now))valid.set('source:'+r.id,{ownerUserId:null,open:true});
 for(const r of externals)if(publicCandidate(r,now))valid.set('external:'+r.id,{ownerUserId:null,open:true});
 return valid;
}
export async function interestSnapshot(tx:Prisma.TransactionClient,targets:InterestTarget[],viewerId?:number){
 const visible=await visibleInterestTargets(tx,targets,viewerId),keys=targets.filter(t=>visible.has(t.productKey)).map(t=>t.productKey),cutoff=new Date(Date.now()-7*86400_000);
 if(!keys.length)return {capturedAt:new Date().toISOString(),windowDays:7,items:[]};
 const [likes,chat,source,own]=await Promise.all([
 tx.$queryRaw<{productKey:string;count:bigint}[]>(Prisma.sql`SELECT p."productKey",COUNT(*) AS count FROM "ProductInterest" p LEFT JOIN "Listing" l ON p."productKey"='listing:'||l.id WHERE p."productKey" IN (${Prisma.join(keys)}) AND p.liked=true AND (l.id IS NULL OR p."userId"<>l."ownerUserId") GROUP BY p."productKey"`),
 tx.$queryRaw<{productKey:string;count:bigint}[]>(Prisma.sql`SELECT 'listing:'||c."listingId" AS "productKey",COUNT(DISTINCT c."buyerUserId") AS count FROM "Conversation" c JOIN "Listing" l ON l.id=c."listingId" WHERE 'listing:'||c."listingId" IN (${Prisma.join(keys)}) AND c."archivedAt" IS NULL AND c."buyerUserId" IS NOT NULL AND c."sellerUserId"=l."ownerUserId" AND c."buyerUserId"<>c."sellerUserId" AND EXISTS(SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId"=c.id AND cp."userId"=c."buyerUserId") AND EXISTS(SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId"=c.id AND cp."userId"=c."sellerUserId") AND EXISTS(SELECT 1 FROM "Message" m WHERE m."conversationId"=c.id AND m."senderUserId"=c."buyerUserId" AND m."createdAt">=${cutoff}) AND NOT EXISTS(SELECT 1 FROM "MeetupAppointment" a WHERE a."conversationId"=c.id AND a.status='COMPLETED') AND NOT EXISTS(SELECT 1 FROM "UserBlock" b WHERE (b."blockerUserId"=c."buyerUserId" AND b."blockedUserId"=c."sellerUserId") OR (b."blockerUserId"=c."sellerUserId" AND b."blockedUserId"=c."buyerUserId")) GROUP BY c."listingId"`),
 tx.$queryRaw<{productKey:string;count:bigint}[]>(Prisma.sql`SELECT 'source:'||s."leadId" AS "productKey",COUNT(DISTINCT s."buyerUserId") AS count FROM "SourceLeadInquiry" s WHERE 'source:'||s."leadId" IN (${Prisma.join(keys)}) AND s.state IN ('INQUIRY','WAITING_ROUTE','TRANSFER_RESERVED','DELIVERED') AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.events)='array' THEN s.events ELSE '[]'::jsonb END) e WHERE e->>'action' IN ('ASK','REVISE','REOPEN') AND e->>'at'>=${cutoff.toISOString()}) GROUP BY s."leadId"`),
 viewerId?tx.productInterest.findMany({where:{userId:viewerId,productKey:{in:keys}},select:{productKey:true,liked:true,version:true}}):[]]);
 const likeMap=new Map(likes.map(r=>[r.productKey,Number(r.count)])),askMap=new Map([...chat,...source].map(r=>[r.productKey,Number(r.count)])),ownMap=new Map(own.map(r=>[r.productKey,r]));
 return {capturedAt:new Date().toISOString(),windowDays:7,items:targets.filter(t=>visible.has(t.productKey)).map(t=>({productKey:t.productKey,canLike:!!viewerId&&visible.get(t.productKey)!.open&&visible.get(t.productKey)!.ownerUserId!==viewerId,likedCount:likeMap.get(t.productKey)??0,inquiringCount:t.kind==='external'?null:visible.get(t.productKey)!.open?askMap.get(t.productKey)??0:0,inquiryKind:t.kind==='source'?'PROXY':t.kind==='listing'?'DIRECT':'UNAVAILABLE',own:viewerId?{liked:ownMap.get(t.productKey)?.liked??false,version:ownMap.get(t.productKey)?.version??0}:null}))};
}
