import { randomUUID } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getApiUrl } from '../config/constants';
import { isListingId } from '../lib/listingRules';
import { encodeListingPhoto, MAX_PHOTO_BYTES, PhotoInputError } from '../lib/listingPhoto';
import { ListingFlickrStorage, FlickrOrphanedUpload } from '../lib/listingFlickrStorage';
import { isMinimaxWorker } from '../lib/minimaxWorkerAuth';
import { marketingDeliveryComplete } from '../lib/marketingAssistantRules';
import { forbiddenListingField, privateContactField } from '../lib/listingPolicy';

const router = Router();
const flickr = new ListingFlickrStorage();
const LEASE_MS = 15 * 60_000;
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1,
    fields: 0, parts: 1 }, fileFilter: (_req, file, callback) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? callback(null, true) : callback(new PhotoInputError()) }).single('image');

async function clearFailedAssets(jobId: string) {
    await prisma.$transaction(async tx => {
        const leftovers = await tx.listingMedia.findMany({ where: { marketingJobId: jobId,
            capturePurpose: 'AI_MARKETING', marketingSelected: false, listingId: null },
            select: { id: true, flickrPhotoId: true } });
        if (!leftovers.length) return;
        await tx.listingMedia.deleteMany({ where: { id: { in: leftovers.map(item => item.id) },
            marketingJobId: jobId, marketingSelected: false, listingId: null } });
        await tx.mediaErasureTask.createMany({ data: leftovers.map(item => ({ mediaId: item.id,
            flickrPhotoId: item.flickrPhotoId })), skipDuplicates: true });
    });
}

router.use((req, res, next) => {
    if (process.env.MARKETING_ASSISTANT_ENABLED !== '1' || !isMinimaxWorker(req.headers.authorization))
        return res.status(404).json({ error: 'NOT_FOUND' });
    res.set('Cache-Control', 'no-store'); next();
});

router.get('/next', async (_req, res) => {
    try {
        const stale = new Date(Date.now() - LEASE_MS);
        await prisma.marketingJob.updateMany({ where: { status: 'PROCESSING', updatedAt: { lt: stale }, attempts: { lt: 3 } },
            data: { status: 'PENDING', workerLeaseId: null } });
        await prisma.marketingJob.updateMany({ where: { status: 'PROCESSING', updatedAt: { lt: stale }, attempts: { gte: 3 } },
            data: { status: 'FAILED', workerLeaseId: null, failureCode: 'WORKER_TIMEOUT' } });
        const failed = await prisma.marketingJob.findMany({ where: { status: 'FAILED',
            generatedMedia: { some: { marketingSelected: false, listingId: null } } },
            select: { id: true }, take: 10 });
        for (const job of failed) await clearFailedAssets(job.id);
        for (let attempt = 0; attempt < 3; attempt++) {
            const pending = await prisma.marketingJob.findFirst({ where: { status: 'PENDING', attempts: { lt: 3 } },
                orderBy: { createdAt: 'asc' }, select: { id: true, sourceMediaId: true, snapshot: true,
                    revisionPrompt: true, revisionSlots: true, parentJobId: true,
                    generatedMedia: { select: { marketingSlot: true } } } });
            if (!pending) return res.status(204).send();
            const leaseId = randomUUID();
            const claimed = await prisma.marketingJob.updateMany({ where: { id: pending.id, status: 'PENDING', attempts: { lt: 3 } },
                data: { status: 'PROCESSING', workerLeaseId: leaseId, attempts: { increment: 1 } } });
            if (claimed.count) return res.json({ id: pending.id, leaseId,
                sourceImageUrl: `${getApiUrl().trim().replace(/\/$/, '')}/listing-media/${pending.sourceMediaId}/image`,
                snapshot: pending.snapshot, revisionPrompt: pending.revisionPrompt,
                slots: pending.parentJobId ? pending.revisionSlots : [1, 2, 3, 4],
                deliveredSlots: pending.generatedMedia.map(media => media.marketingSlot).filter(slot => slot !== null),
                isRevision: pending.parentJobId !== null });
        }
        return res.status(204).send();
    } catch { return res.status(503).json({ error: 'MARKETING_QUEUE_UNAVAILABLE' }); }
});

router.post('/:id/assets/:slot', (req, res, next) => {
    receive(req, res, error => {
        if (error) return res.status(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
            .json({ error: 'INVALID_MARKETING_IMAGE' });
        next();
    });
}, async (req, res) => {
    const { id, slot } = req.params;
    const leaseId = req.headers['x-marketing-lease'];
    if (!isListingId(id) || !/^[1-4]$/.test(slot) || !isListingId(leaseId) || !req.file)
        return res.status(400).json({ error: 'INVALID_MARKETING_ASSET' });
    let mediaId: string | undefined, photoId: string | undefined, stored = false;
    try {
        const job = await prisma.marketingJob.findFirst({ where: { id, workerLeaseId: leaseId, status: 'PROCESSING' },
            select: { id: true, ownerUserId: true } });
        if (!job) return res.status(409).json({ error: 'LEASE_EXPIRED' });
        const image = await encodeListingPhoto(req.file.buffer, req.file.mimetype);
        const previous = await prisma.listingMedia.findUnique({ where: { marketingJobId_marketingSlot: { marketingJobId: id,
            marketingSlot: Number(slot) } }, select: { id: true, contentHash: true } });
        if (previous) return previous.contentHash === image.contentHash ? res.json({ mediaId: previous.id }) :
            res.status(409).json({ error: 'SLOT_ALREADY_DELIVERED' });
        await flickr.ready();
        mediaId = randomUUID();
        const remote = await flickr.upload(mediaId, image.image);
        photoId = remote.photoId;
        const base = `${getApiUrl().trim().replace(/\/$/, '')}/listing-media/${mediaId}`;
        const media = await prisma.listingMedia.create({ data: { id: mediaId, ownerUserId: job.ownerUserId,
            imageUrl: `${base}/image`, thumbnailUrl: `${base}/thumbnail`, contentHash: image.contentHash,
            capturePurpose: 'AI_MARKETING', marketingJobId: id, marketingSlot: Number(slot),
            width: image.width, height: image.height, byteSize: image.byteSize,
            flickrPhotoId: photoId, flickrImageUrl: remote.imageSource, flickrThumbnailUrl: remote.thumbnailSource },
            select: { id: true } });
        stored = true;
        await prisma.marketingJob.updateMany({ where: { id, workerLeaseId: leaseId, status: 'PROCESSING' },
            data: { updatedAt: new Date() } });
        return res.status(201).json({ mediaId: media.id });
    } catch (error) {
        if (error instanceof FlickrOrphanedUpload && mediaId) {
            await prisma.mediaErasureTask.createMany({ data: [{ mediaId, flickrPhotoId: error.photoId }], skipDuplicates: true }).catch(() => undefined);
        } else if (photoId && mediaId && !stored) {
            try { await flickr.remove(photoId); } catch {
                await prisma.mediaErasureTask.createMany({ data: [{ mediaId, flickrPhotoId: photoId }], skipDuplicates: true }).catch(() => undefined);
            }
        }
        if (error instanceof PhotoInputError) return res.status(error.status).json({ error: 'INVALID_MARKETING_IMAGE' });
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            return res.status(409).json({ error: 'SLOT_ALREADY_DELIVERED' });
        return res.status(503).json({ error: 'MARKETING_ASSET_UNAVAILABLE' });
    }
});

router.post('/:id/complete', async (req, res) => {
    const { id } = req.params, leaseId = req.headers['x-marketing-lease'];
    const copy = req.body?.copy;
    if (!isListingId(id) || !isListingId(leaseId) || !req.body || Object.keys(req.body).join(',') !== 'copy' ||
        typeof copy !== 'string' || copy.trim().length < 20 || copy.length > 1200)
        return res.status(400).json({ error: 'INVALID_JOB' });
    try {
        const job = await prisma.marketingJob.findFirst({ where: { id, workerLeaseId: leaseId, status: 'PROCESSING' },
            select: { snapshot: true, revisionSlots: true, parentJobId: true,
                parent: { select: { generatedMedia: { select: { id: true, contentHash: true, marketingSlot: true } } } },
                generatedMedia: { orderBy: { marketingSlot: 'asc' }, select: { id: true, contentHash: true, marketingSlot: true } } } });
        if (!job) return res.status(409).json({ error: 'LEASE_EXPIRED' });
        const media = job.generatedMedia;
        const slots = job.parentJobId ? job.revisionSlots : [1, 2, 3, 4];
        if (!Array.isArray(slots) || slots.some(slot => typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > 4) ||
            media.length !== slots.length || media.some((m, i) => m.marketingSlot !== slots[i]))
            return res.status(422).json({ error: 'FOUR_DISTINCT_IMAGES_REQUIRED' });
        const effective = new Map<number, typeof media[number]>();
        for (const item of job.parent?.generatedMedia ?? []) if (item.marketingSlot !== null) effective.set(item.marketingSlot, item);
        for (const item of media) if (item.marketingSlot !== null) effective.set(item.marketingSlot, item);
        if (effective.size !== 4 || new Set([...effective.values()].map(m => m.contentHash)).size !== 4)
            return res.status(422).json({ error: 'FOUR_DISTINCT_IMAGES_REQUIRED' });
        const facts = job.snapshot as Record<string, unknown>;
        if (typeof facts.title !== 'string' || typeof facts.description !== 'string' ||
            typeof facts.priceTwd !== 'string' || !['NEW', 'USED'].includes(String(facts.condition)))
            return res.status(503).json({ error: 'MARKETING_COPY_UNAVAILABLE' });
        if (!marketingDeliveryComplete([...effective.values()].map(m => m.id), copy) ||
            !copy.includes(facts.title) || !copy.includes(`NT$${facts.priceTwd}`) ||
            !copy.includes('請以實拍照片與面交檢查為準') ||
            /[\u0000-\u001f\u007f]/.test(copy) || forbiddenListingField({ title: '', description: copy }) ||
            privateContactField({ title: '', description: copy }))
            return res.status(422).json({ error: 'INVALID_MARKETING_COPY' });
        const changed = await prisma.marketingJob.updateMany({ where: { id, workerLeaseId: leaseId, status: 'PROCESSING' },
            data: { status: 'REVIEW', workerLeaseId: null, copy: copy.trim(), deliveredAt: new Date(), failureCode: null } });
        return changed.count ? res.status(204).send() : res.status(409).json({ error: 'LEASE_EXPIRED' });
    } catch { return res.status(503).json({ error: 'MARKETING_QUEUE_UNAVAILABLE' }); }
});

router.post('/:id/fail', async (req, res) => {
    const { id } = req.params, leaseId = req.headers['x-marketing-lease'];
    if (!isListingId(id) || !isListingId(leaseId) || req.body && Object.keys(req.body).length)
        return res.status(400).json({ error: 'INVALID_JOB' });
    try {
        const changed = await prisma.marketingJob.updateMany({ where: { id, workerLeaseId: leaseId, status: 'PROCESSING' },
            data: { status: 'FAILED', workerLeaseId: null, failureCode: 'GENERATION_FAILED' } });
        if (changed.count) await clearFailedAssets(id);
        return changed.count ? res.status(204).send() : res.status(409).json({ error: 'LEASE_EXPIRED' });
    } catch { return res.status(503).json({ error: 'MARKETING_QUEUE_UNAVAILABLE' }); }
});

export default router;
