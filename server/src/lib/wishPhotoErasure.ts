import { Prisma } from '@prisma/client';

// Keep the outbox when a wish is deleted. The existing media worker removes
// only the exact UUID folder after the database no longer owns the photo.
export async function enqueueWishPhotoErasure(tx: Prisma.TransactionClient, itemIds: number[]) {
    if (!itemIds.length) return;
    const media = await tx.listingMedia.findMany({ where: { wishItemId: { in: itemIds } }, select: { id: true, flickrPhotoId: true } });
    if (!media.length) return;
    const ids = media.map(row => row.id);
    await tx.mediaErasureTask.createMany({ data: media.map(row => ({ mediaId: row.id, flickrPhotoId: row.flickrPhotoId })), skipDuplicates: true });
    await tx.listingMedia.deleteMany({ where: { id: { in: ids } } });
}
