import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { listingCreationGate, ListingCreationError } from '../lib/listingCreation';
import { MarketingInputError, marketingEnabledFor, marketingRequestId, marketingRevisionPrompt, marketingSnapshotHash } from '../lib/marketingAssistantAccess';
import { freeMarketingWindow, MARKETING_FREE_MONTHLY_LIMIT, mayRequestFreeRevision } from '../lib/marketingAssistantRules';
import { marketingSnapshot } from './marketingController';

const select = { clientRequestId: true, sourceMediaId: true, requestHash: true, state: true, jobId: true, createdAt: true } satisfies Prisma.MarketingRequestReceiptSelect;
const jobSelect = { id: true, status: true, sourceMediaId: true, listingId: true, parentJobId: true } satisfies Prisma.MarketingJobSelect;
type Receipt = Prisma.MarketingRequestReceiptGetPayload<{select:typeof select}>;
export function marketingRequestBody(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MarketingInputError('INVALID_REQUEST');
    const row = value as Record<string, unknown>;
    const sourceMediaId = marketingRequestId(row.sourceMediaId), listingId = row.listingId === null ? null : marketingRequestId(row.listingId);
    if (row.kind === 'CREATE' && Object.keys(row).sort().join(',') === 'expectedVersion,kind,listingId,sourceMediaId' &&
        Number.isSafeInteger(row.expectedVersion) && Number(row.expectedVersion) >= 0 && Number(row.expectedVersion) <= 1000000)
        return { kind: 'CREATE' as const, sourceMediaId, listingId, expectedVersion: Number(row.expectedVersion) };
    if (row.kind === 'REVISION' && Object.keys(row).sort().join(',') === 'kind,listingId,parentJobId,prompt,slots,sourceMediaId') {
        const parentJobId = marketingRequestId(row.parentJobId), prompt = marketingRevisionPrompt(row.prompt), slots = row.slots;
        if (!Array.isArray(slots) || !slots.length || slots.length > 4 || slots.some(slot => !Number.isInteger(slot) || slot < 1 || slot > 4) || new Set(slots).size !== slots.length) throw new MarketingInputError('INVALID_SLOTS');
        return { kind: 'REVISION' as const, sourceMediaId, listingId, parentJobId, prompt, slots: [...slots].sort((a,b)=>a-b) as number[] };
    }
    throw new MarketingInputError('INVALID_REQUEST');
}
async function envelope(tx: Prisma.TransactionClient, userId:number, receipt: Receipt) {
    return { receipt, job: receipt.jobId ? await tx.marketingJob.findFirst({where:{id:receipt.jobId,ownerUserId:userId},select:jobSelect}) : null };
}
const endpoint = (action:(req:AuthRequest,userId:number,clientRequestId:string)=>Promise<unknown>) => async(req:AuthRequest,res:Response)=>{
    res.set('Cache-Control','private, no-store');
    if(!req.user) return res.status(401).json({errorCode:'MISSING_TOKEN'});
    try {
        if(Object.keys(req.query).length) throw new MarketingInputError('INVALID_REQUEST');
        return res.json(await action(req,req.user.id,marketingRequestId(req.params.clientRequestId)));
    } catch(error) {
        const status=error instanceof MarketingInputError?error.status:error instanceof ListingCreationError?error.status:503;
        return res.status(status).json({error:error instanceof MarketingInputError?error.message:'原行銷操作仍需查核',errorCode:error instanceof MarketingInputError||error instanceof ListingCreationError?error.code:'MARKETING_REQUEST_UNAVAILABLE'});
    }
};
export const readMarketingRequest = endpoint(async(req,userId,clientRequestId)=>prisma.$transaction(async tx=>{
    await listingCreationGate(tx,req,userId);
    const receipt=await tx.marketingRequestReceipt.findUnique({where:{userId_clientRequestId:{userId,clientRequestId}},select});
    if(!receipt) throw new MarketingInputError('MARKETING_REQUEST_NOT_FOUND',404);
    return envelope(tx,userId,receipt);
}));
export const submitMarketingRequest = endpoint(async(req,userId,clientRequestId)=>{
    const body=marketingRequestBody(req.body), requestHash=marketingSnapshotHash(body);
    return prisma.$transaction(async tx=>{
        await listingCreationGate(tx,req,userId);
        const prior=await tx.marketingRequestReceipt.findUnique({where:{userId_clientRequestId:{userId,clientRequestId}},select});
        if(prior) {
            if(prior.requestHash!==requestHash || prior.sourceMediaId!==body.sourceMediaId) throw new MarketingInputError('REQUEST_CONFLICT',409);
            return envelope(tx,userId,prior);
        }
        // A legacy request key is never adopted based on a weaker body hash.
        if(await tx.marketingJob.findUnique({where:{ownerUserId_clientRequestId:{ownerUserId:userId,clientRequestId}},select:{id:true}})) throw new MarketingInputError('REQUEST_CONFLICT',409);
        if(!marketingEnabledFor(userId)) throw new MarketingInputError('MARKETING_DISABLED',503);
        let data: Prisma.MarketingJobUncheckedCreateInput;
        if(body.kind==='CREATE') {
            await tx.$queryRaw`SELECT "id" FROM "ListingMedia" WHERE "id"=${body.sourceMediaId} FOR UPDATE`;
            if(body.listingId) await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id"=${body.listingId} FOR UPDATE`;
            const facts=await marketingSnapshot(userId,body.sourceMediaId,body.listingId??undefined,tx);
            const version='listingVersion' in facts?facts.listingVersion:facts.sellerDraftVersion;
            if(version!==body.expectedVersion) throw new MarketingInputError('STALE_DETAILS',409,'商品資料已變更，請先核對後再建立新工作');
            const period=freeMarketingWindow(new Date());
            const count=await tx.marketingJob.count({where:{ownerUserId:userId,parentJobId:null,quotaPeriodStart:period.startsAt,status:{in:['PENDING','PROCESSING','REVIEW','COMPLETED']}}});
            if(count>=MARKETING_FREE_MONTHLY_LIMIT) throw new MarketingInputError('MONTHLY_LIMIT',429,'免費版每月 3 次已用完；付費方案尚未開放');
            data={ownerUserId:userId,sourceMediaId:body.sourceMediaId,listingId:body.listingId,clientRequestId,requestHash,snapshot:facts as Prisma.InputJsonValue,quotaPeriodStart:period.startsAt,quotaPeriodEnd:period.endsAt};
        } else {
            const parent=await tx.marketingJob.findFirst({where:{id:body.parentJobId,ownerUserId:userId,sourceMediaId:body.sourceMediaId,listingId:body.listingId,parentJobId:null,status:{in:['REVIEW','COMPLETED']}},include:{revisions:{select:{id:true}},generatedMedia:{select:{marketingSlot:true}}}});
            if(!parent || !parent.deliveredAt || !mayRequestFreeRevision(parent.deliveredAt,new Date(),parent.revisions.length>0) || new Set(parent.generatedMedia.map(m=>m.marketingSlot)).size!==4) throw new MarketingInputError('REVISION_UNAVAILABLE',409,'免費調整已使用或已超過七天');
            data={ownerUserId:userId,sourceMediaId:body.sourceMediaId,listingId:body.listingId,clientRequestId,requestHash,parentJobId:parent.id,snapshot:parent.snapshot as Prisma.InputJsonValue,revisionPrompt:body.prompt,revisionSlots:body.slots};
        }
        const job=await tx.marketingJob.create({data,select:jobSelect});
        const receipt=await tx.marketingRequestReceipt.create({data:{userId,clientRequestId,sourceMediaId:body.sourceMediaId,requestHash,state:'QUEUED',jobId:job.id},select});
        return {receipt,job};
    });
});
export const abandonMarketingRequest = endpoint(async(req,userId,clientRequestId)=>{
    if(!req.body || Array.isArray(req.body) || Object.keys(req.body).sort().join(',')!=='requestHash,sourceMediaId' || typeof req.body.requestHash!=='string' || !/^[a-f0-9]{64}$/.test(req.body.requestHash)) throw new MarketingInputError('INVALID_REQUEST');
    const sourceMediaId=marketingRequestId(req.body.sourceMediaId);
    return prisma.$transaction(async tx=>{
        await listingCreationGate(tx,req,userId);
        const prior=await tx.marketingRequestReceipt.findUnique({where:{userId_clientRequestId:{userId,clientRequestId}},select});
        if(prior) {
            if(prior.sourceMediaId!==sourceMediaId || prior.requestHash!==req.body.requestHash) throw new MarketingInputError('REQUEST_CONFLICT',409);
            return envelope(tx,userId,prior);
        }
        if(await tx.marketingJob.findUnique({where:{ownerUserId_clientRequestId:{ownerUserId:userId,clientRequestId}},select:{id:true}})) throw new MarketingInputError('REQUEST_CONFLICT',409);
        if(!await tx.listingMedia.findFirst({where:{id:sourceMediaId,ownerUserId:userId,capturePurpose:{not:'AI_MARKETING'},wishItemId:null},select:{id:true}})) throw new MarketingInputError('SOURCE_NOT_FOUND',404);
        const receipt=await tx.marketingRequestReceipt.create({data:{userId,clientRequestId,sourceMediaId,requestHash:req.body.requestHash,state:'ABANDONED'},select});
        return envelope(tx,userId,receipt);
    });
});
