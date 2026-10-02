import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { API_ERROR_CODES } from '../lib/errorCodes';
import { enqueueWishPhotoErasure } from '../lib/wishPhotoErasure';

class DeleteError extends Error {constructor(public status:number){super('Wish deletion rejected');}}
export async function deleteItem(req:AuthRequest,res:Response) {
  res.setHeader('Cache-Control','private, no-store');
  const userId=req.user?.id,id=Number(req.params.id);
  if(!userId)return res.status(401).json({errorCode:API_ERROR_CODES.MISSING_TOKEN});
  if(!/^[1-9]\d{0,9}$/.test(String(req.params.id)) || id>2147483647)return res.status(400).json({errorCode:API_ERROR_CODES.INVALID_INPUT});
  try {
    await prisma.$transaction(async tx=>{
      const initial=await tx.item.findUnique({where:{id},select:{wishlistId:true}});if(!initial)throw new DeleteError(404);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Wishlist" WHERE "id" = ${initial.wishlistId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Item" WHERE "id" = ${id} FOR UPDATE`);
      const item=await tx.item.findUnique({where:{id},include:{wishlist:{select:{userId:true}}}});
      if(!item)throw new DeleteError(404);if(item.wishlist.userId!==userId)throw new DeleteError(403);
      await enqueueWishPhotoErasure(tx,[id]);await tx.item.delete({where:{id}});
    });
    return res.json({message:'Item deleted',id,deleted:true});
  }catch(error){
    if(error instanceof DeleteError)return res.status(error.status).json({errorCode:error.status===404?API_ERROR_CODES.ITEM_NOT_FOUND:API_ERROR_CODES.ACCESS_DENIED});
    console.error('Wish deletion unavailable; identity and database details withheld');
    return res.status(500).json({errorCode:API_ERROR_CODES.INTERNAL_ERROR});
  }
}
