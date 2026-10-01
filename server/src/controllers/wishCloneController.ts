import { createHash } from 'crypto';
import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { API_ERROR_CODES } from '../lib/errorCodes';

class CloneError extends Error { constructor(public status:number){super('Clone rejected');} }
type Tx=Prisma.TransactionClient;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:unknown):number {
  if(!['number','string'].includes(typeof value) || !/^[1-9]\d{0,9}$/.test(String(value)) || Number(value)>2147483647)throw new CloneError(400);
  return Number(value);
}
function requestId(value:unknown):string {
  if(typeof value!=='string' || !uuid.test(value))throw new CloneError(400);
  return value.toLowerCase();
}
const hash=(source:number,target:number)=>createHash('sha256').update('legacy-wish-clone-v1:'+source+':'+target).digest('hex');
async function lockUser(tx:Tx,userId:number) {
  const rows=await tx.$queryRaw<Array<{id:number}>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`);
  if(!rows.length)throw new CloneError(401);
}
async function previous(tx:Tx,userId:number,key:string,source:number,target:number) {
  const receipt=await tx.wishCreateReceipt.findUnique({where:{userId_clientRequestId:{userId,clientRequestId:key}}});
  if(!receipt)return null;
  if(!['CLONE','CLONE_STOP'].includes(receipt.kind) || receipt.requestHash!==hash(source,target))throw new CloneError(409);
  const resource=receipt.kind==='CLONE'?await tx.item.findFirst({where:{id:receipt.resourceId,wishlistId:target,wishlist:{userId}}}):null;
  return {clientRequestId:key,kind:'CLONE',sourceItemId:source,targetWishlistId:target,state:receipt.kind==='CLONE'?'CREATED':'ABANDONED',resourceId:receipt.kind==='CLONE'?receipt.resourceId:null,deleted:receipt.kind==='CLONE' && resource===null,resource};
}
function failure(res:Response,error:unknown) {
  if(error instanceof CloneError)return res.status(error.status).json({error:'Wish clone request rejected',errorCode:error.status===404?API_ERROR_CODES.ITEM_NOT_FOUND:error.status===403?API_ERROR_CODES.ACCESS_DENIED:API_ERROR_CODES.INVALID_INPUT});
  console.error('Wish clone unavailable; source, identity and database details withheld');
  return res.status(500).json({errorCode:API_ERROR_CODES.INTERNAL_ERROR});
}

/** Legacy callers retain the original endpoint/row response; request IDs are additive. */
export async function cloneItem(req:AuthRequest,res:Response) {
  res.setHeader('Cache-Control','private, no-store');
  const userId=req.user?.id;if(!userId)return res.status(401).json({errorCode:API_ERROR_CODES.MISSING_TOKEN});
  try {
    const sourceId=id(req.params.id),body=req.body??{};
    if(typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['targetWishlistId','clientRequestId'].includes(k)))throw new CloneError(400);
    const target=body.targetWishlistId===undefined?undefined:id(body.targetWishlistId),key=body.clientRequestId===undefined?undefined:requestId(body.clientRequestId);
    // A durable request must name its target; default-list selection is legacy only.
    if(key && !target)throw new CloneError(400);
    const result=await prisma.$transaction(async tx=>{
      await lockUser(tx,userId);
      let targetId=target;
      if(!targetId){const first=await tx.wishlist.findFirst({where:{userId},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true}});if(!first)throw new CloneError(400);targetId=first.id;}
      if(key){const replay=await previous(tx,userId,key,sourceId,targetId);if(replay){if(replay.state==='ABANDONED' || replay.deleted)throw new CloneError(410);return {...replay.resource!,clonedFromItemId:sourceId,clientRequestId:key,replayed:true};}}
      const initial=await tx.item.findUnique({where:{id:sourceId},select:{wishlistId:true}});if(!initial)throw new CloneError(404);
      // Lock both parents in a stable order, then the source item. Re-read all
      // permissions after the wait, including a concurrently private/hidden source.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Wishlist" WHERE "id" IN (${initial.wishlistId},${targetId}) ORDER BY "id" FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Item" WHERE "id" = ${sourceId} FOR UPDATE`);
      const source=await tx.item.findUnique({where:{id:sourceId},include:{wishlist:{select:{userId:true,isPublic:true}}}});
      if(!source || source.wishlistId!==initial.wishlistId || source.wishlist.userId!==userId && (!source.wishlist.isPublic || source.isHidden))throw new CloneError(404);
      const destination=await tx.wishlist.findFirst({where:{id:targetId,userId},select:{maxItems:true}});if(!destination)throw new CloneError(403);
      if(await tx.item.count({where:{wishlistId:targetId}})>=destination.maxItems)throw new CloneError(409);
      // In-flight processing belongs to the source worker; copying it would
      // manufacture a stuck or falsely completed AI job for the new item.
      if(['PENDING','UPLOADING'].includes(source.uploadStatus) || !['COMPLETED','FAILED','SKIPPED'].includes(source.aiStatus))throw new CloneError(409);
      const resource=await tx.item.create({data:{
        name:source.name,price:source.price,currency:source.currency,maxPrice:source.maxPrice,priceCurrency:source.priceCurrency,
        link:source.link,aiLink:source.aiLink,imageUrl:source.imageUrl,notes:source.notes,priority:source.priority,
        aiStatus:source.aiStatus,uploadStatus:source.uploadStatus,aiError:source.aiError?.includes('403')?'403':null,
        wishlistId:targetId,isHidden:false,isPurchased:false,originalUserId:source.originalUserId??source.wishlist.userId,
      }});
      if(key)await tx.wishCreateReceipt.create({data:{userId,clientRequestId:key,requestHash:hash(sourceId,targetId),kind:'CLONE',resourceId:resource.id}});
      await tx.wishlist.update({where:{id:targetId},data:{updatedAt:new Date()}});
      return {...resource,clonedFromItemId:sourceId,...(key?{clientRequestId:key,replayed:false}:{})};
    });
    return res.status(201).json(result);
  }catch(error){return failure(res,error);}
}

export async function getCloneReceipt(req:AuthRequest,res:Response) {
  res.setHeader('Cache-Control','private, no-store');
  const userId=req.user?.id;if(!userId)return res.status(401).json({errorCode:API_ERROR_CODES.MISSING_TOKEN});
  try {
    if(Object.keys(req.query).some(k=>!['sourceItemId','targetWishlistId'].includes(k)))throw new CloneError(400);
    const key=requestId(req.params.clientRequestId),source=id(req.query.sourceItemId),target=id(req.query.targetWishlistId);
    const record=await prisma.$transaction(tx=>previous(tx,userId,key,source,target),{isolationLevel:'RepeatableRead'});
    if(!record)throw new CloneError(404);return res.json(record);
  }catch(error){return failure(res,error);}
}

/** An explicit stop fences a delayed original POST without deleting a created wish. */
export async function abandonClone(req:AuthRequest,res:Response) {
  res.setHeader('Cache-Control','private, no-store');
  const userId=req.user?.id;if(!userId)return res.status(401).json({errorCode:API_ERROR_CODES.MISSING_TOKEN});
  try {
    const body=req.body;
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['sourceItemId','targetWishlistId'].includes(k)))throw new CloneError(400);
    const key=requestId(req.params.clientRequestId),source=id(body.sourceItemId),target=id(body.targetWishlistId);
    const record=await prisma.$transaction(async tx=>{
      await lockUser(tx,userId);const known=await previous(tx,userId,key,source,target);if(known)return known;
      await tx.wishCreateReceipt.create({data:{userId,clientRequestId:key,requestHash:hash(source,target),kind:'CLONE_STOP',resourceId:0}});
      return {clientRequestId:key,kind:'CLONE',sourceItemId:source,targetWishlistId:target,state:'ABANDONED',resourceId:null,deleted:false,resource:null};
    });
    return res.json(record);
  }catch(error){return failure(res,error);}
}
