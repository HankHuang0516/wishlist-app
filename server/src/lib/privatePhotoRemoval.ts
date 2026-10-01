import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { ListingInputError } from './listingRules';
import { listingCreationId } from './listingCreation';

export function photoRemovalPayload(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'expectedVersion,mediaId') throw new ListingInputError('photoRemoval');
    const row = value as Record<string, unknown>;
    if (!Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 0 || Number(row.expectedVersion) > 1000000) throw new ListingInputError('expectedVersion');
    return { mediaId: listingCreationId(row.mediaId), expectedVersion: Number(row.expectedVersion) };
}
export const photoRemovalHash = (payload: ReturnType<typeof photoRemovalPayload>) => createHash('sha256').update(JSON.stringify({ purpose: 'BATCH_ITEM_REMOVAL', ...payload })).digest('hex');

/** Caller holds the owner gate. Both receipt and legacy DELETE paths lock the
 * source, then recheck attachment and active jobs before deleting anything.
 * Provider deletion is deferred to the existing erasure worker, outside the tx.
 */
export async function removeUnusedMediaTx(tx: Prisma.TransactionClient, userId: number, mediaId: string, expectedVersion?: number) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ListingMedia" WHERE "id" = ${mediaId} FOR UPDATE`);
    const media = await tx.listingMedia.findFirst({where:{id:mediaId,ownerUserId:userId},select:{capturePurpose:true,listingId:true,wishItemId:true,sellerDraftVersion:true,flickrPhotoId:true,
        marketingJobsAsSource:{select:{id:true,status:true}}}});
    if (!media) return {state:'UNAVAILABLE' as const, removedIds:[]};
    if (media.listingId !== null || media.wishItemId !== null || media.capturePurpose === 'AI_MARKETING' ||
        expectedVersion !== undefined && (media.capturePurpose !== 'BATCH_ITEM' || media.sellerDraftVersion !== expectedVersion) ||
        media.marketingJobsAsSource.some(job=>['PENDING','PROCESSING','REVIEW'].includes(job.status))) return {state:'CONFLICT' as const,removedIds:[]};
    const jobIds = media.marketingJobsAsSource.map(job=>job.id);
    const generated = jobIds.length ? await tx.listingMedia.findMany({where:{ownerUserId:userId,marketingJobId:{in:jobIds},listingId:null,wishItemId:null},select:{id:true,flickrPhotoId:true}}) : [];
    if (generated.length) await tx.listingMedia.deleteMany({where:{id:{in:generated.map(item=>item.id)},ownerUserId:userId,listingId:null,wishItemId:null}});
    if (jobIds.length) await tx.marketingJob.deleteMany({where:{id:{in:jobIds},ownerUserId:userId}});
    await tx.listingMedia.delete({where:{id:mediaId}});
    const erasures = [{mediaId,flickrPhotoId:media.flickrPhotoId},...generated.map(item=>({mediaId:item.id,flickrPhotoId:item.flickrPhotoId}))];
    await tx.mediaErasureTask.createMany({data:erasures,skipDuplicates:true});
    return {state:'REMOVED' as const,removedIds:erasures.map(item=>item.mediaId)};
}
