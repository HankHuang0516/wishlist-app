import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { listingCreationGate, ListingCreationError } from '../lib/listingCreation';
import { MarketingInputError, marketingRequestId, marketingSnapshotHash } from '../lib/marketingAssistantAccess';
import { applyMarketingApproval, checkedMarketingCopy } from './marketingController';

export function marketingApprovalBody(value:unknown){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new MarketingInputError('INVALID_REQUEST');
    const row=value as Record<string,unknown>;
    if(Object.keys(row).sort().join(',')!=='copy,expectedVersion,jobId,kind,listingId,selectedMediaIds,sourceMediaId'||row.kind!=='APPROVE'||!Number.isSafeInteger(row.expectedVersion)||Number(row.expectedVersion)<0||Number(row.expectedVersion)>1000000)throw new MarketingInputError('INVALID_REQUEST');
    const ids=row.selectedMediaIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>4)throw new MarketingInputError('INVALID_SELECTION');
    const selectedMediaIds=ids.map(marketingRequestId);
    if(new Set(selectedMediaIds).size!==selectedMediaIds.length)throw new MarketingInputError('INVALID_SELECTION');
    const copy=checkedMarketingCopy(row.copy);
    // Do not silently normalize malformed UTF-16 differently from a browser hash.
    if(Buffer.from(copy).toString('utf8')!==copy)throw new MarketingInputError('INVALID_COPY');
    return {kind:'APPROVE' as const,jobId:marketingRequestId(row.jobId),sourceMediaId:marketingRequestId(row.sourceMediaId),listingId:row.listingId===null?null:marketingRequestId(row.listingId),expectedVersion:Number(row.expectedVersion),selectedMediaIds,copy};
}
const select={clientActionId:true,jobId:true,sourceMediaId:true,listingId:true,requestHash:true,state:true,reason:true,appliedVersion:true,selectedMediaIds:true,copy:true,createdAt:true} satisfies Prisma.MarketingApprovalReceiptSelect;
const endpoint=(action:(req:AuthRequest,userId:number,clientActionId:string)=>Promise<unknown>)=>async(req:AuthRequest,res:Response)=>{
    res.set('Cache-Control','private, no-store');if(!req.user)return res.status(401).json({errorCode:'MISSING_TOKEN'});
    try{if(Object.keys(req.query).length)throw new MarketingInputError('INVALID_REQUEST');return res.json(await action(req,req.user.id,marketingRequestId(req.params.clientActionId)));}
    catch(error){const known=error instanceof MarketingInputError||error instanceof ListingCreationError;return res.status(known?error.status:503).json({error:'原行銷確認操作仍需查核',errorCode:known?error.code:'MARKETING_APPROVAL_UNAVAILABLE'});}
};
export const readMarketingApproval=endpoint(async(req,userId,clientActionId)=>prisma.$transaction(async tx=>{
    await listingCreationGate(tx,req,userId);
    const receipt=await tx.marketingApprovalReceipt.findUnique({where:{userId_clientActionId:{userId,clientActionId}},select});
    if(!receipt)throw new MarketingInputError('APPROVAL_NOT_FOUND',404);return {receipt};
}));
export const submitMarketingApproval=endpoint(async(req,userId,clientActionId)=>{
    const body=marketingApprovalBody(req.body),requestHash=marketingSnapshotHash(body);
    return prisma.$transaction(async tx=>{
        await listingCreationGate(tx,req,userId);
        const prior=await tx.marketingApprovalReceipt.findUnique({where:{userId_clientActionId:{userId,clientActionId}},select});
        if(prior){if(prior.requestHash!==requestHash)throw new MarketingInputError('REQUEST_CONFLICT',409);return {receipt:prior};}
        const job=await tx.marketingJob.findFirst({where:{id:body.jobId,ownerUserId:userId,sourceMediaId:body.sourceMediaId},select:{id:true}});
        if(!job)throw new MarketingInputError('JOB_NOT_FOUND',404);
        let state='APPLIED',reason:string|null=null,appliedVersion:number|null=null;
        await tx.$executeRawUnsafe('SAVEPOINT marketing_approval');
        try{appliedVersion=(await applyMarketingApproval(tx,userId,body.jobId,body.selectedMediaIds,body.copy,body)).appliedVersion;}
        catch(error){
            if(!(error instanceof MarketingInputError)||![409,422].includes(error.status))throw error;
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT marketing_approval');state='CONFLICT';reason=error.code;
        }
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT marketing_approval');
        const receipt=await tx.marketingApprovalReceipt.create({data:{userId,clientActionId,jobId:body.jobId,sourceMediaId:body.sourceMediaId,listingId:body.listingId,requestHash,state,reason,appliedVersion,...(state==='APPLIED'?{selectedMediaIds:body.selectedMediaIds,copy:body.copy}:{})},select});
        return {receipt};
    });
});
export const abandonMarketingApproval=endpoint(async(req,userId,clientActionId)=>{
    const body=req.body;
    if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='jobId,listingId,requestHash,sourceMediaId'||typeof body.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(body.requestHash))throw new MarketingInputError('INVALID_REQUEST');
    const jobId=marketingRequestId(body.jobId),sourceMediaId=marketingRequestId(body.sourceMediaId),listingId=body.listingId===null?null:marketingRequestId(body.listingId);
    return prisma.$transaction(async tx=>{
        await listingCreationGate(tx,req,userId);
        const prior=await tx.marketingApprovalReceipt.findUnique({where:{userId_clientActionId:{userId,clientActionId}},select});
        if(prior){if(prior.requestHash!==body.requestHash||prior.jobId!==jobId||prior.sourceMediaId!==sourceMediaId||prior.listingId!==listingId)throw new MarketingInputError('REQUEST_CONFLICT',409);return {receipt:prior};}
        const job=await tx.marketingJob.findFirst({where:{id:jobId,ownerUserId:userId,sourceMediaId},select:{id:true}});
        const source=job?null:await tx.listingMedia.findFirst({where:{id:sourceMediaId,ownerUserId:userId,capturePurpose:{not:'AI_MARKETING'},wishItemId:null},select:{id:true}});
        if(!job&&!source)throw new MarketingInputError('SOURCE_NOT_FOUND',404);
        return {receipt:await tx.marketingApprovalReceipt.create({data:{userId,clientActionId,jobId,sourceMediaId,listingId,requestHash:body.requestHash,state:'ABANDONED'},select})};
    });
});
