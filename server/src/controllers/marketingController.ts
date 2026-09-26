import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isListingId } from '../lib/listingRules';
import { parseListingSellerDraft } from '../lib/listingSellerDraft';
import { freeMarketingWindow, MARKETING_FREE_MONTHLY_LIMIT, mayRequestFreeRevision } from '../lib/marketingAssistantRules';
import { MarketingInputError, marketingEnabledFor, marketingRequestId, marketingRevisionPrompt, marketingSnapshotHash } from '../lib/marketingAssistantAccess';
import { forbiddenListingField, privateContactField } from '../lib/listingPolicy';

const MARKETING_HEADING = '\n\n【行銷小助手文案】\n';
function descriptionWithCopy(original: string, copy: string) {
    const combined = `${original}${MARKETING_HEADING}${copy}`;
    if (combined.length > 3000) throw new MarketingInputError('DESCRIPTION_TOO_LONG', 422, '商品說明加上行銷文案後超過 3000 字，請先縮短說明');
    return combined;
}
function checkedCopy(value: unknown) {
    if (typeof value !== 'string' || value.trim().length < 20 || value.length > 1200 ||
        /[\u0000-\u001f\u007f]/.test(value) || forbiddenListingField({ title: '', description: value }) ||
        privateContactField({ title: '', description: value }))
        throw new MarketingInputError('INVALID_COPY', 422, '請檢查行銷文案內容');
    return value.trim();
}
function storedSlots(value: Prisma.JsonValue): number[] {
    return Array.isArray(value) ? value.filter((slot): slot is number =>
        typeof slot === 'number' && Number.isInteger(slot) && slot >= 1 && slot <= 4) : [];
}

async function effectiveMedia(job: { id: string; parentJobId: string | null }) {
    const ids = job.parentJobId ? [job.parentJobId, job.id] : [job.id];
    const media = await prisma.listingMedia.findMany({ where: { marketingJobId: { in: ids } },
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
    if (error instanceof MarketingInputError) return res.status(error.status).json({ error: error.message, errorCode: error.code });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))
        return res.status(409).json({ error: '行銷工作已變動，請重新載入', errorCode: 'MARKETING_CONFLICT' });
    return res.status(503).json({ error: '行銷小助手暫時無法使用', errorCode: 'MARKETING_UNAVAILABLE' });
}

export function marketingAvailability(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    return res.set('Cache-Control', 'private, no-store').json({ available: marketingEnabledFor(req.user.id) });
}

async function snapshot(ownerUserId: number, sourceMediaId: string, listingId?: string) {
    const source = await prisma.listingMedia.findFirst({ where: { id: sourceMediaId, ownerUserId,
        capturePurpose: { not: 'AI_MARKETING' } }, select: { id: true, listingId: true, wishItemId: true,
        contentHash: true, sellerDraft: true, sellerDraftVersion: true, aiDraftStatus: true } });
    if (!source || source.wishItemId !== null) throw new MarketingInputError('SOURCE_NOT_FOUND', 404, '商品實拍照不存在');
    if (listingId) {
        const listing = await prisma.listing.findFirst({ where: { id: listingId, ownerUserId,
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
        const details = await snapshot(req.user.id, sourceMediaId, listingId);
        const requestHash = marketingSnapshotHash(details);
        const period = freeMarketingWindow(new Date());
        const result = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.user!.id} FOR UPDATE`;
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

export async function getMarketingJob(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.set('Cache-Control', 'private, no-store');
    if (!isListingId(req.params.id)) return res.status(404).json({ error: '行銷工作不存在' });
    try {
        const job = await prisma.marketingJob.findFirst({ where: { id: req.params.id, ownerUserId: req.user.id },
            select: { id: true, status: true, listingId: true, sourceMediaId: true, parentJobId: true,
                copy: true, failureCode: true, deliveredAt: true, createdAt: true, updatedAt: true,
                revisionSlots: true,
                generatedMedia: { orderBy: { marketingSlot: 'asc' }, select: { id: true, imageUrl: true,
                    thumbnailUrl: true, marketingSlot: true, marketingSelected: true, position: true } } } });
        if (!job) return res.status(404).json({ error: '行銷工作不存在' });
        const media = job.parentJobId && ['REVIEW', 'COMPLETED'].includes(job.status)
            ? await effectiveMedia(job) : job.generatedMedia;
        const previousMedia = job.parentJobId && ['REVIEW', 'COMPLETED'].includes(job.status)
            ? await prisma.listingMedia.findMany({ where: { marketingJobId: job.parentJobId,
                marketingSlot: { in: storedSlots(job.revisionSlots) } }, orderBy: { marketingSlot: 'asc' },
                select: { id: true, imageUrl: true, thumbnailUrl: true, marketingSlot: true, marketingSelected: true,
                    position: true } }) : [];
        const selectedMediaIds = [...media, ...previousMedia].filter(item => item.marketingSelected)
            .sort((a, b) => a.position - b.position).map(item => item.id);
        return res.json({ ...job, generatedMedia: media, previousMedia, selectedMediaIds, imageCount: media.length });
    } catch (error) { return fail(res, error); }
}

export async function latestMarketingJob(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.set('Cache-Control', 'private, no-store');
    const sourceMediaId = req.query.sourceMediaId;
    if (!isListingId(sourceMediaId) || Object.keys(req.query).length !== 1)
        return res.status(400).json({ error: '商品照片識別碼不正確' });
    try {
        const job = await prisma.marketingJob.findFirst({ where: { ownerUserId: req.user.id, sourceMediaId },
            orderBy: { createdAt: 'desc' }, select: { id: true, status: true } });
        return res.json({ job });
    } catch (error) { return fail(res, error); }
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
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.user!.id} FOR UPDATE`;
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

export async function approveMarketingJob(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: '請先登入' });
    res.set('Cache-Control', 'private, no-store');
    try {
        if (!isListingId(req.params.id) || !req.body || Object.keys(req.body).some(key =>
            !['selectedMediaIds', 'copy'].includes(key))) throw new MarketingInputError('INVALID_REQUEST');
        const ids = req.body.selectedMediaIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 4 || ids.some(id => !isListingId(id)) ||
            new Set(ids).size !== ids.length) throw new MarketingInputError('INVALID_SELECTION');
        const copy = checkedCopy(req.body.copy);
        const job = await prisma.marketingJob.findFirst({ where: { id: req.params.id, ownerUserId: req.user.id,
            status: { in: ['REVIEW', 'COMPLETED'] } }, select: { id: true, ownerUserId: true, parentJobId: true,
            listingId: true, sourceMediaId: true, snapshot: true, status: true, copy: true, revisionSlots: true } });
        if (!job) return res.status(404).json({ error: '行銷工作不存在或尚未完成' });
        const available = await effectiveMedia(job);
        const alternatives = job.parentJobId ? await prisma.listingMedia.findMany({ where: { marketingJobId: job.parentJobId,
            marketingSlot: { in: storedSlots(job.revisionSlots) } },
            select: { id: true, marketingSlot: true, marketingSelected: true, position: true } }) : [];
        const choices = [...available, ...alternatives];
        if (available.length !== 4 || ids.some((id: string) => !choices.some(media => media.id === id)) ||
            new Set(ids.map((id: string) => choices.find(media => media.id === id)?.marketingSlot)).size !== ids.length)
            throw new MarketingInputError('INVALID_SELECTION', 422, '請從四張行銷圖中挑選');
        const facts = job.snapshot as Record<string, unknown>;
        const baseDescription = facts.description;
        if (typeof baseDescription !== 'string' || typeof facts.title !== 'string' || typeof facts.priceTwd !== 'string')
            throw new MarketingInputError('STALE_DETAILS', 409, '商品資料已變更，請重新生成');
        const selectedNow = choices.filter(media => media.marketingSelected).sort((a, b) => a.position - b.position).map(media => media.id);
        if (job.status === 'COMPLETED' && job.copy === copy && JSON.stringify(selectedNow) === JSON.stringify(ids))
            return res.json({ listingId: job.listingId, selectedMediaIds: ids });
        if (job.status === 'COMPLETED') throw new MarketingInputError('ALREADY_APPROVED', 409, '已確認的行銷圖無法重複套用；請重新載入');
        const result = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.user!.id} FOR UPDATE`;
            const currentJob = await tx.marketingJob.findFirst({ where: { id: job.id, ownerUserId: req.user!.id },
                select: { status: true } });
            if (currentJob?.status !== 'REVIEW')
                throw new MarketingInputError('ALREADY_APPROVED', 409, '行銷圖已確認或狀態已變更，請重新載入');
            if (job.listingId) {
                const listing = await tx.listing.findFirst({ where: { id: job.listingId, ownerUserId: req.user!.id },
                    include: { media: { select: { id: true, capturePurpose: true, marketingSelected: true } } } });
                if (!listing || !['ACTIVE', 'RESERVED'].includes(listing.status) || listing.title !== facts.title ||
                    listing.price?.toString() !== facts.priceTwd || listing.condition !== facts.condition ||
                    listing.category !== facts.category || listing.brand !== facts.brand ||
                    !listing.media.some(media => media.id === job.sourceMediaId) ||
                    !(listing.description === baseDescription || listing.description?.startsWith(`${baseDescription}${MARKETING_HEADING}`)))
                    throw new MarketingInputError('STALE_DETAILS', 409, '商品已變更，請重新生成');
                const others = listing.media.filter(media => media.capturePurpose !== 'AI_MARKETING');
                if (others.length + ids.length > 8)
                    throw new MarketingInputError('TOO_MANY_IMAGES', 422, '含實拍照最多 8 張，請減少選用的行銷圖');
                const changed = await tx.listing.updateMany({ where: { id: listing.id, ownerUserId: req.user!.id, version: listing.version },
                    data: { description: descriptionWithCopy(baseDescription, copy), version: { increment: 1 } } });
                if (!changed.count) throw new MarketingInputError('LISTING_CONFLICT', 409, '商品已在其他地方更新');
                await tx.listingMedia.updateMany({ where: { listingId: listing.id, capturePurpose: 'AI_MARKETING' },
                    data: { listingId: null, marketingSelected: false } });
                await tx.listingMedia.updateMany({ where: { marketingJobId: { in: job.parentJobId ? [job.parentJobId, job.id] : [job.id] } },
                    data: { marketingSelected: false } });
                for (const [index, id] of ids.entries()) {
                    const updated = await tx.listingMedia.updateMany({ where: { id, ownerUserId: req.user!.id,
                        marketingJobId: { in: job.parentJobId ? [job.parentJobId, job.id] : [job.id] } },
                        data: { listingId: listing.id, marketingSelected: true, position: index } });
                    if (updated.count !== 1) throw new MarketingInputError('LISTING_CONFLICT', 409, '圖片狀態已變更');
                }
                await tx.listingMedia.updateMany({ where: { id: { in: others.map(m => m.id) } },
                    data: { position: { increment: ids.length } } });
                await tx.marketingJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', copy } });
                return { listingId: listing.id, selectedMediaIds: ids };
            }
            const source = await tx.listingMedia.findFirst({ where: { id: job.sourceMediaId, ownerUserId: req.user!.id,
                listingId: null, wishItemId: null }, select: { id: true, sellerDraft: true, contentHash: true } });
            if (!source?.sellerDraft || source.contentHash !== facts.sourceContentHash)
                throw new MarketingInputError('STALE_DETAILS', 409, '商品草稿已變更，請重新生成');
            const draft = parseListingSellerDraft(source.sellerDraft);
            if (draft.form.title !== facts.title || draft.form.price !== facts.priceTwd ||
                draft.form.condition !== facts.condition || draft.form.category !== facts.category ||
                (draft.form.brand || null) !== facts.brand ||
                !(draft.form.description === baseDescription || draft.form.description.startsWith(`${baseDescription}${MARKETING_HEADING}`)))
                throw new MarketingInputError('STALE_DETAILS', 409, '商品草稿已變更，請重新生成');
            await tx.listingMedia.updateMany({ where: { marketingJobId: { in: job.parentJobId ? [job.parentJobId, job.id] : [job.id] } },
                data: { marketingSelected: false } });
            for (const [index, id] of ids.entries()) {
                const updated = await tx.listingMedia.updateMany({ where: { id, ownerUserId: req.user!.id },
                    data: { marketingSelected: true, position: index } });
                if (updated.count !== 1) throw new MarketingInputError('LISTING_CONFLICT', 409, '圖片狀態已變更');
            }
            await tx.listingMedia.update({ where: { id: source.id }, data: { sellerDraft: { ...draft,
                form: { ...draft.form, description: descriptionWithCopy(baseDescription, copy) },
                touched: { ...draft.touched, description: true } } as Prisma.InputJsonValue,
                sellerDraftVersion: { increment: 1 } } });
            await tx.marketingJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', copy } });
            return { listingId: null, selectedMediaIds: ids };
        });
        return res.json(result);
    } catch (error) { return fail(res, error); }
}
