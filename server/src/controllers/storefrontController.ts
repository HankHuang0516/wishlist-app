import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { isListingId, NON_SALE_QA_PREFIX } from '../lib/listingRules';
import { publicListingSelect } from './listingController';
import { privateReviewListingIds } from '../lib/privateReviewDemo';
export async function getStorefront(req: AuthRequest, res: Response) {
 res.set('Cache-Control','private, no-store');
 const raw=req.params.id;
 if(typeof raw!=='string'||!/^[1-9]\d{0,9}$/.test(raw)||Number(raw)>2147483647||Object.keys(req.query).some(k=>k!=='cursor')||req.query.cursor!==undefined&&!isListingId(req.query.cursor))return res.status(400).json({error:'賣場查詢不正確'});
 const id=Number(raw),viewerId=req.user?.id??null,cursor=req.query.cursor as string|undefined;
 try {
  const result=await prisma.$transaction(async tx=>{
   const seller=await tx.user.findUnique({where:{id},select:{id:true,name:true,avatarUrl:true,isAvatarVisible:true,createdAt:true,isEmailVerified:true}});
   if(!seller)return null;
   const where:Prisma.ListingWhereInput={ownerUserId:id,status:{in:['ACTIVE','RESERVED']},expiresAt:{gt:new Date()},NOT:{OR:[{title:{startsWith:NON_SALE_QA_PREFIX}},{id:{in:privateReviewListingIds()}}]}};
   const boundary=cursor?await tx.listing.findFirst({where:{...where,id:cursor},select:{id:true,createdAt:true}}):null;
   if(cursor&&!boundary)return {invalidCursor:true};
   const rows=await tx.listing.findMany({where:{...where,...(boundary?{OR:[{createdAt:{lt:boundary.createdAt}},{createdAt:boundary.createdAt,id:{lt:boundary.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:25,select:publicListingSelect});
   const [follow,blocks]=await Promise.all([viewerId===null?Promise.resolve(null):tx.follow.findUnique({where:{followerId_followingId:{followerId:viewerId,followingId:id}},select:{followerId:true}}),viewerId===null?Promise.resolve([]):tx.userBlock.findMany({where:{OR:[{blockerUserId:viewerId,blockedUserId:id},{blockerUserId:id,blockedUserId:viewerId}]},select:{blockerUserId:true}})]);
   return {seller:{id:seller.id,name:seller.name,avatarUrl:seller.isAvatarVisible?seller.avatarUrl:null,joinedAt:seller.createdAt,emailVerified:seller.isEmailVerified},isFollowing:!!follow,blockedByMe:blocks.some(b=>b.blockerUserId===viewerId),blockedByOther:blocks.some(b=>b.blockerUserId===id),items:rows.slice(0,24),nextCursor:rows.length>24?rows[23].id:null};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  if(!result)return res.status(404).json({error:'賣場不存在'});
  if('invalidCursor' in result)return res.status(400).json({error:'請重新讀取賣場'});
  return res.json(result);
 }catch{return res.status(503).json({error:'賣場暫時無法讀取，請稍後再試'});}
}
