import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { API_ERROR_CODES } from '../lib/errorCodes';
import { LegacyWishCreateError as Reject,legacyCreateHash,legacyCreateIdentity,legacyCreateId,legacyCreateKinds,parseLegacyWishCreate,type LegacyCreateKind } from '../lib/legacyWishCreate';
import { parseEclawPublicCode,ECLAW_PUBLIC_CODE_PREFIX } from '../lib/eclawBridge';
import { wakeEclawRecognitionWorker } from '../lib/eclawRecognitionQueue';
type Tx=Prisma.TransactionClient;
async function lockUser(tx:Tx,userId:number){const rows=await tx.$queryRaw<Array<{id:number}>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`);if(!rows.length)throw new Reject(401);}
async function history(tx:Tx,userId:number,key:string) {
  const row=await tx.legacyWishCreateReceipt.findUnique({where:{userId_clientRequestId:{userId,clientRequestId:key}}});if(!row)return null;
  const resource=row.resourceId===null?null:await tx.item.findFirst({where:{id:row.resourceId,wishlistId:row.wishlistId,wishlist:{userId}}});
  return {clientRequestId:key,kind:row.kind,wishlistId:row.wishlistId,requestHash:row.requestHash,state:row.state,resourceId:row.resourceId,deleted:row.state==='CREATED' && !resource,resource};
}
function failed(res:Response,error:unknown) {
  if(error instanceof Reject)return res.status(error.status).json({error:'Wish creation request rejected',errorCode:error.status===403?API_ERROR_CODES.ACCESS_DENIED:error.status===404?API_ERROR_CODES.WISHLIST_NOT_FOUND:API_ERROR_CODES.INVALID_INPUT});
  console.error('Legacy wish creation unavailable; identity, source and database details withheld');return res.status(500).json({errorCode:API_ERROR_CODES.INTERNAL_ERROR});
}
async function create(req:AuthRequest,res:Response,kind:LegacyCreateKind) {
  res.setHeader('Cache-Control','private, no-store');
  const actor=req.user?.id,agent=req.eclawAgent?.publicCode;
  if(!actor && !agent)return res.status(401).json({errorCode:API_ERROR_CODES.MISSING_TOKEN});
  try {
    const wishlistId=legacyCreateId(req.params.wishlistId),body=req.body;
    let proxy:string|null=null;
    if(agent){const claimed=parseEclawPublicCode(body?.proxy_end_user_id);if(claimed && claimed!==agent)throw new Reject(403);proxy=ECLAW_PUBLIC_CODE_PREFIX+agent;}
    else if(body?.proxy_end_user_id!=null && body.proxy_end_user_id!=='') {
      if(typeof body.proxy_end_user_id!=='string' || body.proxy_end_user_id.length>128)throw new Reject();
      if(body.proxy_end_user_id.toLowerCase().startsWith(ECLAW_PUBLIC_CODE_PREFIX))throw new Reject(403);proxy=body.proxy_end_user_id;
    }
    const input=parseLegacyWishCreate(body,kind,proxy),requestHash=legacyCreateHash(kind,wishlistId,input.data);
    if(!actor && input.clientRequestId || kind==='PHOTO' && !actor || input.expectedHash && input.expectedHash!==requestHash)throw new Reject();
    const result=await prisma.$transaction(async tx=>{
      const initial=actor?null:await tx.wishlist.findUnique({where:{id:wishlistId},select:{userId:true}});if(!actor && !initial)throw new Reject(404);
      const ownerId=actor??initial!.userId;await lockUser(tx,ownerId);
      if(input.clientRequestId) {
        const known=await history(tx,ownerId,input.clientRequestId);
        if(known){if(known.kind!==kind || known.wishlistId!==wishlistId || known.requestHash!==requestHash)throw new Reject(409);if(known.state==='ABANDONED' || known.deleted)throw new Reject(410);return {...known.resource!,clientRequestId:input.clientRequestId,requestHash,createKind:kind,replayed:true};}
      }
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Wishlist" WHERE "id" = ${wishlistId} FOR UPDATE`);
      const list=await tx.wishlist.findUnique({where:{id:wishlistId},select:{userId:true,maxItems:true}});if(!list)throw new Reject(404);if(list.userId!==ownerId)throw new Reject(403);
      if(await tx.item.count({where:{wishlistId}})>=list.maxItems)throw new Reject(409);
      const {mediaId,...data}=input.data;let imageUrl:string|null=null;
      if(mediaId){await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ListingMedia" WHERE "id" = ${mediaId} FOR UPDATE`);const media=await tx.listingMedia.findFirst({where:{id:mediaId,ownerUserId:ownerId,listingId:null,wishItemId:null,capturePurpose:{not:'AI_MARKETING'}},select:{imageUrl:true}});if(!media)throw new Reject(409);imageUrl=media.imageUrl;}
      const resource=await tx.item.create({data:{...data,imageUrl,wishlistId,uploadStatus:'COMPLETED',isHidden:false,isPurchased:false}});
      if(mediaId){const attached=await tx.listingMedia.updateMany({where:{id:mediaId,ownerUserId:ownerId,listingId:null,wishItemId:null},data:{wishItemId:resource.id}});if(attached.count!==1)throw new Reject(409);}
      if(input.clientRequestId)await tx.legacyWishCreateReceipt.create({data:{userId:ownerId,clientRequestId:input.clientRequestId,kind,wishlistId,requestHash,state:'CREATED',resourceId:resource.id}});
      await tx.wishlist.update({where:{id:wishlistId},data:{updatedAt:new Date()}});
      return {...resource,...(input.clientRequestId?{clientRequestId:input.clientRequestId,requestHash,createKind:kind,replayed:false}:{})};
    });
    // The database itself is the recognition queue; a lost wake or restart
    // leaves an eligible PENDING/COMPLETED row for the existing periodic worker.
    if(!('replayed' in result && result.replayed) && result.aiStatus==='PENDING')wakeEclawRecognitionWorker();
    return res.status(201).json(result);
  }catch(error){return failed(res,error);}
}
export const createItemFromUrl=(req:AuthRequest,res:Response)=>create(req,res,'LINK');
export const createItemFromMedia=(req:AuthRequest,res:Response)=>create(req,res,'PHOTO');
export async function readLegacyWishCreate(req:AuthRequest,res:Response) {
  res.setHeader('Cache-Control','private, no-store');if(!req.user)return res.status(401).json({errorCode:API_ERROR_CODES.MISSING_TOKEN});
  try {if(Object.keys(req.query).length)throw new Reject();const key=legacyCreateIdentity(req.params.clientRequestId),record=await prisma.$transaction(tx=>history(tx,req.user!.id,key),{isolationLevel:'RepeatableRead'});if(!record)throw new Reject(404);return res.json(record);}catch(error){return failed(res,error);}
}
export async function abandonLegacyWishCreate(req:AuthRequest,res:Response) {
  res.setHeader('Cache-Control','private, no-store');if(!req.user)return res.status(401).json({errorCode:API_ERROR_CODES.MISSING_TOKEN});
  try {
    const body=req.body,key=legacyCreateIdentity(req.params.clientRequestId);
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).sort().join(',')!=='kind,requestHash,wishlistId' || !legacyCreateKinds.includes(body.kind) || typeof body.requestHash!=='string' || !/^[a-f0-9]{64}$/.test(body.requestHash))throw new Reject();
    const wishlistId=legacyCreateId(body.wishlistId),userId=req.user.id;
    const result=await prisma.$transaction(async tx=>{await lockUser(tx,userId);const known=await history(tx,userId,key);if(known){if(known.kind!==body.kind || known.wishlistId!==wishlistId || known.requestHash!==body.requestHash)throw new Reject(409);return known;}
      await tx.legacyWishCreateReceipt.create({data:{userId,clientRequestId:key,kind:body.kind,wishlistId,requestHash:body.requestHash,state:'ABANDONED'}});
      return {clientRequestId:key,kind:body.kind,wishlistId,requestHash:body.requestHash,state:'ABANDONED',resourceId:null,deleted:false,resource:null};});return res.json(result);
  }catch(error){return failed(res,error);}
}
