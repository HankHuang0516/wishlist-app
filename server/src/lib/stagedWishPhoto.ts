import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { getApiUrl } from '../config/constants';
import { encodeListingPhoto, PhotoInputError } from './listingPhoto';
import { ListingMediaStorage, MediaStorageConfigurationError } from './listingMediaStorage';
import { ListingFlickrStorage, FlickrOrphanedUpload } from './listingFlickrStorage';
import { erasureIdentityHash } from './accountErasure';

const storage = new ListingMediaStorage(), flickr = new ListingFlickrStorage();
const lifetime = 5 * 60_000;
export type StagedWishPhoto = Awaited<ReturnType<typeof stageWishPhoto>>;

/** Allocate outside owner/parent transactions. The independent outbox precedes
 * physical storage, survives process/account loss and cannot run during the lease.
 * Flickr's unknown-response upload window still needs opaque-tag reconciliation.
 */
export async function stageWishPhoto(ownerUserId: number, bytes: Buffer, mime: string) {
    const photo = await encodeListingPhoto(bytes, mime);
    const configured = (process.env.LISTING_MEDIA_STORAGE_PROVIDER ?? 'local').trim();
    const pilot = process.env.LISTING_MEDIA_FLICKR_PILOT_USER_ID?.trim();
    const provider = configured === 'flickr' && pilot !== undefined && pilot !== String(ownerUserId) ? 'local' : configured;
    if (provider === 'flickr') await flickr.ready();
    else if (provider === 'local') await storage.ready();
    else throw new MediaStorageConfigurationError();
    const id = randomUUID();
    // Account erasure must see in-flight assets too. Allocate under its owner
    // lock with an opaque revocation identity; no User FK erases this outbox.
    await prisma.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${ownerUserId} FOR NO KEY UPDATE`);
        const owner = await tx.user.findUnique({ where: { id: ownerUserId }, select: { authVersion: true } });
        if (!owner) throw new PhotoInputError('帳號已失效，不會保存照片', 401);
        await tx.mediaErasureTask.create({ data: { mediaId: id, identityHash: erasureIdentityHash(ownerUserId, owner.authVersion), notBefore: new Date(Date.now() + lifetime) } });
    });
    let flickrPhotoId: string | undefined;
    try {
        const remote = provider === 'flickr' ? await flickr.upload(id, photo.image) : null;
        flickrPhotoId = remote?.photoId;
        if (remote) await prisma.mediaErasureTask.update({ where: { mediaId: id }, data: { flickrPhotoId: remote.photoId } });
        else await storage.write(id, photo.image, photo.thumbnail);
        const base = `${getApiUrl().trim().replace(/\/$/, '')}/listing-media/${id}`;
        return { id, ownerUserId, contentHash: photo.contentHash, capturePurpose: 'MANUAL_PHOTO' as const,
            width: photo.width, height: photo.height, byteSize: photo.byteSize,
            imageUrl: `${base}/image`, thumbnailUrl: `${base}/thumbnail`,
            flickrPhotoId: remote?.photoId, flickrImageUrl: remote?.imageSource, flickrThumbnailUrl: remote?.thumbnailSource };
    } catch (error) {
        if (error instanceof FlickrOrphanedUpload) flickrPhotoId = error.photoId;
        await prisma.mediaErasureTask.upsert({ where: { mediaId: id },
            create: { mediaId: id, notBefore: new Date(), flickrPhotoId },
            update: { notBefore: new Date(), flickrPhotoId } });
        throw error;
    }
}

/** Caller holds the destination owner/parent locks. Never attach a lease that
 * expired or was claimed by cleanup; provider work never runs inside this tx.
 */
export async function attachStagedWishPhoto(tx: Prisma.TransactionClient, photo: StagedWishPhoto, wishItemId: number) {
    const lease = await tx.$queryRaw<Array<{ notBefore: Date }>>(Prisma.sql`SELECT "notBefore" FROM "MediaErasureTask" WHERE "mediaId" = ${photo.id}::uuid FOR UPDATE`);
    if (!lease.length || lease[0].notBefore.getTime() <= Date.now()) throw new PhotoInputError('照片準備已逾時，請重新選擇照片', 409);
    await tx.listingMedia.create({ data: { ...photo, wishItemId } });
    await tx.mediaErasureTask.delete({ where: { mediaId: photo.id } });
}

/** Failure leaves an exact durable target, rather than hiding failed cleanup. */
export async function discardStagedWishPhoto(photo: StagedWishPhoto) {
    await prisma.mediaErasureTask.upsert({ where: { mediaId: photo.id },
        create: { mediaId: photo.id, flickrPhotoId: photo.flickrPhotoId, notBefore: new Date() },
        update: { flickrPhotoId: photo.flickrPhotoId, notBefore: new Date() } });
}
