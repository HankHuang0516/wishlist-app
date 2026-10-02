import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isListingId } from '../lib/listingRules';
import { parseListingSellerDraft } from '../lib/listingSellerDraft';
import { freeMarketingWindow, MARKETING_FREE_MONTHLY_LIMIT, mayRequestFreeRevision } from '../lib/marketingAssistantRules';
import { MarketingInputError, marketingEnabledFor, marketingRequestId, marketingRevisionPrompt, marketingSnapshotHash } from '../lib/marketingAssistantAccess';
import { forbiddenListingField, privateContactField } from '../lib/listingPolicy';
import { listingCreationGate, ListingCreationError } from '../lib/listingCreation';

const MARKETING_HEADING = '\n\n【行銷小助手文案】\n';
function descriptionWithCopy(original: string, copy: string) {
    const combined = `${original}${MARKETING_HEADING}${copy}`;
    if (combined.length > 3000) throw new MarketingInputError('DESCRIPTION_TOO_LONG', 422, '商品說明加上行銷文案後超過 3000 字，請先縮短說明');
    return combined;
}
export function checkedMarketingCopy(value: unknown) {
    if (typeof value !== 'string' || value.trim().length < 20 || value.length > 1200 ||
        /[\u0000-\u001f\u007f]/.test(value) || Buffer.from(value).toString('utf8') !== value || forbiddenListingField({ title: '', description: value }) ||
        privateContactField({ title: '', description: value }))
        throw new MarketingInputError('INVALID_COPY', 422, '請檢查行銷文案內容');
    return value.trim();
}
function storedSlots(value: Prisma.JsonValue): number[] {
    return Array.isArray(value) ? value.filter((slot): slot is number =>
        typeof slot === 'number' && Number.isInteger(slot) && slot >= 1 && slot <= 4) : [];
}

async function effectiveMedia(job: { id: string; parentJobId: string | null }, db: Prisma.TransactionClient = prisma) {
    const ids = job.parentJobId ? [job.parentJobId, job.id] : [job.id];
    const media = await db.listingMedia.findMany({ where: { marketingJobId: { in: ids } },
        select: { id: true, marketingJobId: true, marketingSlot: true, imageUrl: true, thumbnailUrl: true,
            marketingSelected: true, contentHash: true, position: true } });
    const bySlot = new Map<number, typeof media[number]>();
    for (const item of media.filter(m => m.marketingJobId === job.parentJobId || !job.parentJobId))
        if (item.marketingSlot !== null) bySlot.set(item.marketingSlot, item);
    for (const item of media.filter(m => m.marketingJobId === job.id && job.parentJobId))
        if (item.marketingSlot !== null) bySlot.set(item.marketingSlot, item);
    return [1, 2, 3, 4].map(slot => bySlot.get(slot)).filter((value): value is typeof media[number] => !!value);
}

function fail(res: Response, error: unknown) {
    if(error instanceof ListingCreationError) return res.status(error.status).json({error:'登入或原操作仍需查核',errorCode:error.code});
    if (error instanceof MarketingInputError) return res.status(error.status).json({ error: error.message, errorCode: error.code });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))
        return res.status(409).json({ error: '行銷工作已變動，請重新載入', errorCode: 'MARKETING_CONFLICT' });
    return res.status(503).json({ error: '行銷小助手暫時無法使用', errorCode: 'MARKETING_UNAVAILABLE' });
}

export async function marketingAvailability(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    try {
        const period = freeMarketingWindow(new Date());
        const userId=req.user.id;
        const usedThisMonth = await prisma.$transaction(async tx=>{
          await listingCreationGate(tx,req,userId);
          return tx.marketingJob.count({ where: { ownerUserId: userId,
            parentJobId: null, quotaPeriodStart: period.startsAt,
            status: { in: ['PENDING', 'PROCESSING', 'REVIEW', 'COMPLETED'] } } });
        });
        // No verified paid-credit ledger exists yet. Do not infer entitlement
        // from the legacy isPremium flag or an unverified client receipt.
        return res.set('Cache-Control', 'private, no-store').json({ available: marketingEnabledFor(req.user.id),
            freeMonthlyLimit: MARKETING_FREE_MONTHLY_LIMIT, freeUsedThisMonth: usedThisMonth,
            permanentCreditsRemaining: 0, paidPurchasesAvailable: false });
    } catch (error) { return fail(res, error); }
}

export async function marketingSnapshot(ownerUserId: number, sourceMediaId: string, listingId?: string, db: Prisma.TransactionClient = prisma) {
    const source = await db.listingMedia.findFirst({ where: { id: sourceMediaId, ownerUserId,
        capturePurpose: { not: 'AI_MARKETING' } }, select: { id: true, listingId: true, wishItemId: true,
        contentHash: true, sellerDraft: true, sellerDraftVersion: true, aiDraftStatus: true } });
    if (!source || source.wishItemId !== null) throw new MarketingInputError('SOURCE_NOT_FOUND', 404, '商品實拍照不存在');
    if (listingId) {
        const listing = await db.listing.findFirst({ where: { id: listingId, ownerUserId,
            status: { in: ['ACTIVE', 'RESERVED'] } }, select: { id: true, version: true, title: true,
            description: true, price: true, currency: true, condition: true, category: true, brand: true } });
        if (!listing || source.listingId !== listing.id) throw new MarketingInputError('LISTING_NOT_FOUND', 404, '商品不存在或照片不屬於此商品');
        if (!listing.description?.trim() || listing.price === null || listing.currency !== 'TWD')
            throw new MarketingInputError('DETAILS_INCOMPLETE', 422, '請先確認商品說明與新臺幣售價');
        if (forbiddenListingField(listing) || privateContactField(listing))
            throw new MarketingInputError('DETAILS_POLICY', 422, '請先移除禁售或私人聯絡資訊');
        return { listingId: listing.id, sourceMediaId, sourceContentHash: source.contentHash,
            listingVersion: listing.version, title: listing.title, description: listing.description,
            priceTwd: listing.price.toString(), condition: listing.condition, category: listing.category,
            brand: listing.brand };
    }
    if (source.listingId !== null || source.aiDraftStatus !== 'COMPLETED' || !source.sellerDraft)
        throw new MarketingInputError('DRAFT_NOT_READY', 422, '請先完成商品 AI 草稿並儲存確認後的資料');
    const draft = parseListingSellerDraft(source.sellerDraft);
    if (draft.form.title.trim().length < 3 || draft.form.description.trim().length < 10 || !draft.form.price)
        throw new MarketingInputError('DETAILS_INCOMPLETE', 422, '請先確認商品名稱、說明與新臺幣售價');
    if (forbiddenListingField({ title: draft.form.title, description: draft.form.description, brand: draft.form.brand }) ||
        privateContactField({ title: draft.form.title, description: draft.form.description, brand: draft.form.brand }))
        throw new MarketingInputError('DETAILS_POLICY', 422, '請先移除禁售或私人聯絡資訊');
    return { listingId: null, sourceMediaId, sourceContentHash: source.contentHash,
        sellerDraftVersion: source.sellerDraftVersion, title: draft.form.title.trim(),
        description: draft.form.description.trim(), priceTwd: draft.form.price,
        condition: draft.form.condition, category: draft.form.category, brand: draft.form.brand || null };
}

export async function createMarketingJob(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.set('Cache-Control', 'private, no-store');
    try {
        if (!marketingEnabledFor(req.user.id)) throw new MarketingInputError('MARKETING_DISABLED', 503, '行銷小助手暫未開放');
        const body = req.body as Record<string, unknown>;
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            Object.keys(body).some(key => !['clientRequestId', 'sourceMediaId', 'listingId'].includes(key)) ||
            !isListingId(body.sourceMediaId) || (body.listingId !== undefined && !isListingId(body.listingId)))
            throw new MarketingInputError('INVALID_REQUEST');
        const clientRequestId = marketingRequestId(body.clientRequestId);
        const listingId = body.listingId as string | undefined;
        const sourceMediaId = body.sourceMediaId as string;
        const details = await marketingSnapshot(req.user.id, sourceMediaId, listingId);
        const requestHash = marketingSnapshotHash(details);
        const period = freeMarketingWindow(new Date());
        const result = await prisma.$transaction(async tx => {
            await listingCreationGate(tx,req,req.user!.id);
            if(await tx.marketingRequestReceipt.findUnique({where:{userId_clientRequestId:{userId:req.user!.id,clientRequestId}},select:{id:true}})) throw new MarketingInputError('REQUEST_CONFLICT',409);
            const existing = await tx.marketingJob.findUnique({ where: { ownerUserId_clientRequestId: {
                ownerUserId: req.user!.id, clientRequestId } }, select: { id: true, status: true, requestHash: true } });
            if (existing) {
                if (existing.requestHash !== requestHash) throw new MarketingInputError('REQUEST_CONFLICT', 409, '同一操作識別碼已用於不同商品資料');
                return { id: existing.id, status: existing.status, created: false };
            }
            const currentSource = await tx.listingMedia.findFirst({ where: { id: sourceMediaId, ownerUserId: req.user!.id },
                select: { contentHash: true, sellerDraftVersion: true, listingId: true, aiDraftStatus: true } });
            if (!currentSource || currentSource.contentHash !== details.sourceContentHash ||
                currentSource.listingId !== details.listingId ||
                (!details.listingId && (currentSource.sellerDraftVersion !== details.sellerDraftVersion ||
                    currentSource.aiDraftStatus !== 'COMPLETED')))
                throw new MarketingInputError('STALE_DETAILS', 409, '商品資料已變更，請重新生成');
            if (details.listingId) {
                const currentListing = await tx.listing.findFirst({ where: { id: details.listingId, ownerUserId: req.user!.id },
                    select: { version: true, status: true } });
                if (currentListing?.version !== details.listingVersion ||
                    !['ACTIVE', 'RESERVED'].includes(currentListing.status))
                    throw new MarketingInputError('STALE_DETAILS', 409, '商品資料已變更，請重新生成');
            }
            const reserved = await tx.marketingJob.count({ where: { ownerUserId: req.user!.id, parentJobId: null,
                quotaPeriodStart: period.startsAt, status: { in: ['PENDING', 'PROCESSING', 'REVIEW', 'COMPLETED'] } } });
            if (reserved >= MARKETING_FREE_MONTHLY_LIMIT) throw new MarketingInputError('MONTHLY_LIMIT', 429,
                '免費版每月 3 次已用完；尊榮版每月 100 次及單次購買 10 次／US$1 須完成付款驗證後開放');
            const job = await tx.marketingJob.create({ data: { ownerUserId: req.user!.id, listingId: details.listingId,
                sourceMediaId, clientRequestId, requestHash, snapshot: details as Prisma.InputJsonValue,
                quotaPeriodStart: period.startsAt, quotaPeriodEnd: period.endsAt }, select: { id: true, status: true } });
            return { ...job, created: true };
        });
        return res.status(result.created ? 202 : 200).json({ id: result.id, status: result.status });
    } catch (error) { return fail(res, error); }
}

export async function marketingJobView(tx:Prisma.TransactionClient,userId:number,jobId:string){
    const job=await tx.marketingJob.findFirst({where:{id:jobId,ownerUserId:userId},select:{id:true,status:true,listingId:true,sourceMediaId:true,parentJobId:true,copy:true,failureCode:true,deliveredAt:true,createdAt:true,updatedAt:true,revisionSlots:true,generatedMedia:{orderBy:{marketingSlot:'asc'},select:{id:true,imageUrl:true,thumbnailUrl:true,marketingSlot:true,marketingSelected:true,position:true}}}});
    if(!job)return null;
    const delivered=!!job.parentJobId&&['REVIEW','COMPLETED'].includes(job.status);
    const media=delivered?await effectiveMedia(job,tx):job.generatedMedia;
    const previousMedia=delivered?await tx.listingMedia.findMany({where:{marketingJobId:job.parentJobId!,marketingSlot:{in:storedSlots(job.revisionSlots)}},orderBy:{marketingSlot:'asc'},select:{id:true,imageUrl:true,thumbnailUrl:true,marketingSlot:true,marketingSelected:true,position:true}}):[];
    const proof=job.status==='COMPLETED'?await tx.marketingApprovalReceipt.findFirst({where:{userId,jobId,state:'APPLIED'},select:{selectedMediaIds:true,copy:true}}):null;
    const selectedMediaIds=proof?proof.selectedMediaIds:[...media,...previousMedia].filter(m=>m.marketingSelected).sort((a,b)=>a.position-b.position).map(m=>m.id);
    return {...job,copy:proof?proof.copy:job.copy,generatedMedia:media,previousMedia,selectedMediaIds,imageCount:media.length};
}
export async function getMarketingJob(req:AuthRequest,res:Response){
    if(!req.user)return res.status(401).json({error:'請先登入'});
    res.set('Cache-Control','private, no-store');
    const jobId=req.params.id;
    if(!isListingId(jobId))return res.status(404).json({error:'行銷工作不存在'});
    try{
        const job=await prisma.$transaction(async tx=>{await listingCreationGate(tx,req,req.user!.id);return marketingJobView(tx,req.user!.id,jobId);});
        return job?res.json(job):res.status(404).json({error:'行銷工作不存在'});
    }catch(error){return fail(res,error);}
}
export async function latestMarketingJob(req:AuthRequest,res:Response){
    if(!req.user)return res.status(401).json({error:'請先登入'});
    res.set('Cache-Control','private, no-store');const sourceMediaId=req.query.sourceMediaId;
    if(!isListingId(sourceMediaId)||Object.keys(req.query).length!==1)return res.status(400).json({error:'商品照片識別碼不正確'});
    try{
        const job=await prisma.$transaction(async tx=>{await listingCreationGate(tx,req,req.user!.id);return tx.marketingJob.findFirst({where:{ownerUserId:req.user!.id,sourceMediaId},orderBy:{createdAt:'desc'},select:{id:true,status:true}});});
        return res.json({job});
    }catch(error){return fail(res,error);}
}

export async function createMarketingRevision(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.set('Cache-Control', 'private, no-store');
    try {
        const parentId = req.params.id;
        if (!isListingId(parentId) || !req.body || Object.keys(req.body).some(key =>
            !['clientRequestId', 'prompt', 'slots'].includes(key))) throw new MarketingInputError('INVALID_REQUEST');
        const clientRequestId = marketingRequestId(req.body.clientRequestId);
        const prompt = marketingRevisionPrompt(req.body.prompt);
        const slots = req.body.slots;
        if (!Array.isArray(slots) || !slots.length || slots.length > 4 ||
            slots.some(slot => !Number.isInteger(slot) || slot < 1 || slot > 4) || new Set(slots).size !== slots.length)
            throw new MarketingInputError('INVALID_SLOTS');
        slots.sort((a: number, b: number) => a - b);
        const requestHash = marketingSnapshotHash({ parent: parentId, prompt, slots });
        const result = await prisma.$transaction(async tx => {
            await listingCreationGate(tx,req,req.user!.id);
            if(await tx.marketingRequestReceipt.findUnique({where:{userId_clientRequestId:{userId:req.user!.id,clientRequestId}},select:{id:true}})) throw new MarketingInputError('REQUEST_CONFLICT',409);
            const previous = await tx.marketingJob.findUnique({ where: { ownerUserId_clientRequestId: {
                ownerUserId: req.user!.id, clientRequestId } } });
            if (previous) {
                if (previous.requestHash !== requestHash) throw new MarketingInputError('REQUEST_CONFLICT', 409, '請重新開啟行銷工作');
                return { id: previous.id, status: previous.status, created: false };
            }
            const parent = await tx.marketingJob.findFirst({ where: { id: parentId, ownerUserId: req.user!.id,
                parentJobId: null, status: { in: ['REVIEW', 'COMPLETED'] } },
                include: { revisions: { select: { id: true } }, generatedMedia: { select: { marketingSlot: true } } } });
            if (!parent || !parent.deliveredAt || !mayRequestFreeRevision(parent.deliveredAt, new Date(), parent.revisions.length > 0) ||
                new Set(parent.generatedMedia.map(m => m.marketingSlot)).size !== 4)
                throw new MarketingInputError('REVISION_UNAVAILABLE', 409, '免費調整已使用或已超過七天');
            const job = await tx.marketingJob.create({ data: { ownerUserId: req.user!.id, listingId: parent.listingId,
                sourceMediaId: parent.sourceMediaId, clientRequestId, requestHash, parentJobId: parent.id,
                snapshot: parent.snapshot as Prisma.InputJsonValue, revisionPrompt: prompt, revisionSlots: slots },
                select: { id: true, status: true } });
            return { ...job, created: true };
        });
        return res.status(result.created ? 202 : 200).json({ id: result.id, status: result.status });
    } catch (error) { return fail(res, error); }
}

export type MarketingApprovalContext = {sourceMediaId:string;listingId:string|null;expectedVersion:number};
// Caller holds the revalidated owner gate. All job, image and product facts are
// read inside this transaction; a failed modern application rolls back to a
// savepoint before its immutable CONFLICT receipt is written.
export async function applyMarketingApproval(tx:Prisma.TransactionClient,userId:number,jobId:string,ids:string[],copy:string,context?:MarketingApprovalContext) {
    const job=await tx.marketingJob.findFirst({where:{id:jobId,ownerUserId:userId},select:{id:true,sourceMediaId:true,listingId:true,parentJobId:true,status:true,snapshot:true,revisionSlots:true,copy:true}});
    if(!job)throw new MarketingInputError('JOB_NOT_FOUND',404);
    if(context&&(job.sourceMediaId!==context.sourceMediaId||job.listingId!==context.listingId))throw new MarketingInputError('STALE_DETAILS',409);
    const proof=await tx.marketingApprovalReceipt.findFirst({where:{userId,jobId,state:'APPLIED'}});
    if(proof){
        if(!context&&proof.copy===copy&&JSON.stringify(proof.selectedMediaIds)===JSON.stringify(ids))return {listingId:proof.listingId,sourceMediaId:proof.sourceMediaId,selectedMediaIds:ids,appliedVersion:proof.appliedVersion!,replayed:true};
        throw new MarketingInputError('ALREADY_APPROVED',409);
    }
    const available=await effectiveMedia(job,tx);
    const alternatives=job.parentJobId?await tx.listingMedia.findMany({where:{marketingJobId:job.parentJobId,marketingSlot:{in:storedSlots(job.revisionSlots)}},select:{id:true,marketingSlot:true,marketingSelected:true,position:true}}):[];
    const choices=[...available,...alternatives];
    if(available.length!==4||ids.some(id=>!choices.some(m=>m.id===id))||new Set(ids.map(id=>choices.find(m=>m.id===id)?.marketingSlot)).size!==ids.length)throw new MarketingInputError('INVALID_SELECTION',422);
    if(job.status==='COMPLETED'){
        const selectedNow=choices.filter(m=>m.marketingSelected).sort((a,b)=>a.position-b.position).map(m=>m.id);
        if(!context&&job.copy===copy&&JSON.stringify(selectedNow)===JSON.stringify(ids))return {listingId:job.listingId,sourceMediaId:job.sourceMediaId,selectedMediaIds:ids,appliedVersion:0,replayed:true};
        throw new MarketingInputError('ALREADY_APPROVED',409);
    }
    if(job.status!=='REVIEW')throw new MarketingInputError('JOB_NOT_READY',409);
    const facts=job.snapshot as Record<string,unknown>,baseDescription=facts.description;
    if(typeof baseDescription!=='string'||typeof facts.title!=='string'||typeof facts.priceTwd!=='string')throw new MarketingInputError('STALE_DETAILS',409);
    await tx.$queryRaw`SELECT "id" FROM "ListingMedia" WHERE "id"=${job.sourceMediaId} FOR UPDATE`;
    const source=await tx.listingMedia.findFirst({where:{id:job.sourceMediaId,ownerUserId:userId,wishItemId:null},select:{id:true,listingId:true,contentHash:true,sellerDraft:true,sellerDraftVersion:true}});
    if(!source||source.contentHash!==facts.sourceContentHash)throw new MarketingInputError('STALE_DETAILS',409);
    let beforeVersion:number;
    if(job.listingId){
        await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id"=${job.listingId} FOR UPDATE`;
        const listing=await tx.listing.findFirst({where:{id:job.listingId,ownerUserId:userId},include:{media:{select:{id:true,capturePurpose:true}}}});
        if(!listing||!['ACTIVE','RESERVED'].includes(listing.status)||source.listingId!==listing.id||listing.title!==facts.title||listing.price?.toString()!==facts.priceTwd||listing.condition!==facts.condition||listing.category!==facts.category||listing.brand!==facts.brand||!(listing.description===baseDescription||listing.description?.startsWith(`${baseDescription}${MARKETING_HEADING}`)))throw new MarketingInputError('STALE_DETAILS',409);
        beforeVersion=listing.version;
        if(context&&beforeVersion!==context.expectedVersion)throw new MarketingInputError('LISTING_CONFLICT',409);
        const others=listing.media.filter(m=>m.capturePurpose!=='AI_MARKETING');
        if(others.length+ids.length>8)throw new MarketingInputError('TOO_MANY_IMAGES',422);
        const changed=await tx.listing.updateMany({where:{id:listing.id,ownerUserId:userId,version:beforeVersion},data:{description:descriptionWithCopy(baseDescription,copy),version:{increment:1}}});
        if(changed.count!==1)throw new MarketingInputError('LISTING_CONFLICT',409);
        await tx.listingMedia.updateMany({where:{listingId:listing.id,capturePurpose:'AI_MARKETING'},data:{listingId:null,marketingSelected:false}});
        await tx.listingMedia.updateMany({where:{marketingJobId:{in:job.parentJobId?[job.parentJobId,job.id]:[job.id]}},data:{marketingSelected:false}});
        for(const [index,id]of ids.entries()){
            const changed=await tx.listingMedia.updateMany({where:{id,ownerUserId:userId,marketingJobId:{in:job.parentJobId?[job.parentJobId,job.id]:[job.id]}},data:{listingId:listing.id,marketingSelected:true,position:index}});
            if(changed.count!==1)throw new MarketingInputError('LISTING_CONFLICT',409);
        }
        await tx.listingMedia.updateMany({where:{id:{in:others.map(m=>m.id)}},data:{position:{increment:ids.length}}});
    }else{
        if(source.listingId!==null||!source.sellerDraft)throw new MarketingInputError('STALE_DETAILS',409);
        const draft=parseListingSellerDraft(source.sellerDraft);
        beforeVersion=source.sellerDraftVersion;
        if(context&&beforeVersion!==context.expectedVersion)throw new MarketingInputError('LISTING_CONFLICT',409);
        if(draft.form.title!==facts.title||draft.form.price!==facts.priceTwd||draft.form.condition!==facts.condition||draft.form.category!==facts.category||(draft.form.brand||null)!==facts.brand||!(draft.form.description===baseDescription||draft.form.description.startsWith(`${baseDescription}${MARKETING_HEADING}`)))throw new MarketingInputError('STALE_DETAILS',409);
        await tx.listingMedia.updateMany({where:{marketingJobId:{in:job.parentJobId?[job.parentJobId,job.id]:[job.id]}},data:{marketingSelected:false}});
        for(const [index,id]of ids.entries()){
            const changed=await tx.listingMedia.updateMany({where:{id,ownerUserId:userId,marketingJobId:{in:job.parentJobId?[job.parentJobId,job.id]:[job.id]}},data:{marketingSelected:true,position:index}});
            if(changed.count!==1)throw new MarketingInputError('LISTING_CONFLICT',409);
        }
        const changed=await tx.listingMedia.updateMany({where:{id:source.id,sellerDraftVersion:beforeVersion},data:{sellerDraft:{...draft,form:{...draft.form,description:descriptionWithCopy(baseDescription,copy)},touched:{...draft.touched,description:true}} as Prisma.InputJsonValue,sellerDraftVersion:{increment:1}}});
        if(changed.count!==1)throw new MarketingInputError('LISTING_CONFLICT',409);
    }
    await tx.marketingJob.update({where:{id:job.id},data:{status:'COMPLETED',copy}});
    return {listingId:job.listingId,sourceMediaId:job.sourceMediaId,selectedMediaIds:ids,appliedVersion:beforeVersion+1,replayed:false};
}

export async function approveMarketingJob(req:AuthRequest,res:Response){
    if(!req.user)return res.status(401).json({error:'請先登入'});
    res.set('Cache-Control','private, no-store');
    try{
        const jobId=marketingRequestId(req.params.id),body=req.body;
        if(!body||Object.keys(body).sort().join(',')!=='copy,selectedMediaIds')throw new MarketingInputError('INVALID_REQUEST');
        const ids=body.selectedMediaIds;
        if(!Array.isArray(ids)||!ids.length||ids.length>4||ids.some(id=>!isListingId(id))||new Set(ids).size!==ids.length)throw new MarketingInputError('INVALID_SELECTION');
        const copy=checkedMarketingCopy(body.copy);
        const result=await prisma.$transaction(async tx=>{
            await listingCreationGate(tx,req,req.user!.id);
            // Legacy callers use the job identity for their single approval.
            // A modern cancellation with this same key cannot be bypassed.
            const prior=await tx.marketingApprovalReceipt.findUnique({where:{userId_clientActionId:{userId:req.user!.id,clientActionId:jobId}}});
            if(prior&&prior.state!=='APPLIED')throw new MarketingInputError('REQUEST_CONFLICT',409);
            const applied=await applyMarketingApproval(tx,req.user!.id,jobId,ids,copy);
            if(!applied.replayed){
                const original={kind:'APPROVE',jobId,sourceMediaId:applied.sourceMediaId,listingId:applied.listingId,expectedVersion:applied.appliedVersion-1,selectedMediaIds:ids,copy};
                await tx.marketingApprovalReceipt.create({data:{userId:req.user!.id,clientActionId:jobId,jobId,sourceMediaId:applied.sourceMediaId,listingId:applied.listingId,requestHash:marketingSnapshotHash(original),state:'APPLIED',appliedVersion:applied.appliedVersion,selectedMediaIds:ids,copy}});
            }
            return {listingId:applied.listingId,selectedMediaIds:ids};
        });
        return res.json(result);
    }catch(error){return fail(res,error);}
}
