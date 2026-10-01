import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { listingCreationGate, listingCreationId, ListingCreationError } from '../lib/listingCreation';
import { ListingInputError } from '../lib/listingRules';
import { photoRemovalPayload, photoRemovalHash, removeUnusedMediaTx } from '../lib/privatePhotoRemoval';
import { sellerDraftMediaSelect } from '../lib/sellerDraftOperation';
const endpoint = (action:(req:AuthRequest,userId:number)=>Promise<unknown>) => async(req:AuthRequest,res:Response)=>{
    res.setHeader('Cache-Control','private, no-store');
    if(!req.user)return res.status(401).json({errorCode:'MISSING_TOKEN'});
    try{if(Object.keys(req.query).length)throw new ListingInputError('query');return res.json(await action(req,req.user.id));}
    catch(error){const status=error instanceof ListingCreationError?error.status:error instanceof ListingInputError?400:503;return res.status(status).json({error:'私人照片移除原操作仍需查核',errorCode:error instanceof ListingCreationError?error.code:'PHOTO_REMOVAL_UNAVAILABLE'});}
};
type Receipt = Prisma.PhotoRemovalReceiptGetPayload<{}>;
async function envelope(tx:Prisma.TransactionClient,userId:number,row:Receipt){
    const {clientActionId,requestHash,state,mediaId,expectedVersion,createdAt}=row;
    return {receipt:{clientActionId,requestHash,state,mediaId,expectedVersion,createdAt},
        media:mediaId?await tx.listingMedia.findFirst({where:{id:mediaId,ownerUserId:userId},select:sellerDraftMediaSelect}):null,
        cleanupPending:row.removedIds.length>0&&await tx.mediaErasureTask.count({where:{mediaId:{in:row.removedIds}}})>0};
}
export const readPrivatePhotoRemoval=endpoint(async(req,userId)=>{
    const clientActionId=listingCreationId(req.params.clientActionId);
    return prisma.$transaction(async tx=>{await listingCreationGate(tx,req,userId);const prior=await tx.photoRemovalReceipt.findUnique({where:{userId_clientActionId:{userId,clientActionId}}});if(!prior)throw new ListingCreationError(404,'PHOTO_REMOVAL_NOT_FOUND');return envelope(tx,userId,prior);});
});
export const submitPrivatePhotoRemoval=endpoint(async(req,userId)=>{
    const clientActionId=listingCreationId(req.params.clientActionId),payload=photoRemovalPayload(req.body),requestHash=photoRemovalHash(payload);
    return prisma.$transaction(async tx=>{
        await listingCreationGate(tx,req,userId);
        const prior=await tx.photoRemovalReceipt.findUnique({where:{userId_clientActionId:{userId,clientActionId}}});
        if(prior){if(prior.requestHash!==requestHash)throw new ListingCreationError(409,'PHOTO_REMOVAL_ID_CONFLICT');return envelope(tx,userId,prior);}
        const result=await removeUnusedMediaTx(tx,userId,payload.mediaId,payload.expectedVersion);
        const receipt=await tx.photoRemovalReceipt.create({data:{userId,clientActionId,requestHash,...payload,state:result.state,removedIds:result.removedIds}});
        return envelope(tx,userId,receipt);
    });
});
export const abandonPrivatePhotoRemoval=endpoint(async(req,userId)=>{
    const clientActionId=listingCreationId(req.params.clientActionId);
    if(!req.body||Array.isArray(req.body)||Object.keys(req.body).join(',')!=='requestHash'||typeof req.body.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(req.body.requestHash))throw new ListingInputError('requestHash');
    return prisma.$transaction(async tx=>{await listingCreationGate(tx,req,userId);const prior=await tx.photoRemovalReceipt.findUnique({where:{userId_clientActionId:{userId,clientActionId}}});
        if(prior){if(prior.requestHash!==req.body.requestHash)throw new ListingCreationError(409,'PHOTO_REMOVAL_ID_CONFLICT');return envelope(tx,userId,prior);}
        return envelope(tx,userId,await tx.photoRemovalReceipt.create({data:{userId,clientActionId,requestHash:req.body.requestHash,state:'ABANDONED',removedIds:[]}}));
    });
});
