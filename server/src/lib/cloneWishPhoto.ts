import { constants, promises as fs } from 'fs';
import path from 'path';
import type { ListingMedia } from '@prisma/client';
import { ListingMediaStorage } from './listingMediaStorage';
import { ListingFlickrStorage, FlickrMediaUnavailable } from './listingFlickrStorage';
import { legacyAssetCandidate } from './legacyAssetInventory';
import { MAX_PHOTO_BYTES, PhotoInputError, PhotoUploadSlots } from './listingPhoto';
import { stageWishPhoto } from './stagedWishPhoto';
import { getApiUrl } from '../config/constants';

const storage = new ListingMediaStorage(), flickr = new ListingFlickrStorage();
const slots = new PhotoUploadSlots(4);
async function boundedLocal(file: Awaited<ReturnType<typeof fs.open>>) {
    try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size < 1 || stat.size > MAX_PHOTO_BYTES) throw new FlickrMediaUnavailable();
        const bytes = await file.readFile();
        if (bytes.length > MAX_PHOTO_BYTES) throw new FlickrMediaUnavailable();
        return bytes;
    } finally { await file.close(); }
}

/** Independently own every image managed by this app. Third-party product URLs
 * remain external references; this function never fetches arbitrary URLs or
 * accepts a caller-provided file/provider identity.
 */
export async function cloneWishPhoto(ownerUserId: number, imageUrl: string | null, media: ListingMedia | null) {
    if (!imageUrl) return undefined;
    const managed = !!media && imageUrl === media.imageUrl;
    const legacy = legacyAssetCandidate(imageUrl);
    // Resolve before acquiring/reading: external product references do no I/O.
    if (!managed && !legacy) {
        try {
            const url = new URL(imageUrl, getApiUrl()), own = new URL(getApiUrl());
            if (url.origin === own.origin && /\/(?:listing-media|uploads)\//.test(url.pathname)) throw new FlickrMediaUnavailable();
            return undefined;
        } catch { throw new FlickrMediaUnavailable(); }
    }
    const release = slots.acquire();
    if (!release) throw new PhotoInputError('照片複製忙碌，請稍後重試', 429);
    try {
        if (media && imageUrl === media.imageUrl) {
            if (media.flickrPhotoId) {
                if (!media.flickrImageUrl) throw new FlickrMediaUnavailable();
                return await stageWishPhoto(ownerUserId, await flickr.read(media.flickrImageUrl, media.flickrPhotoId), 'image/jpeg');
            }
            return await stageWishPhoto(ownerUserId, await boundedLocal(await storage.open(media.id, 'image')), 'image/webp');
        }
        if (legacy?.kind === 'FLICKR') return await stageWishPhoto(ownerUserId, await flickr.read(imageUrl, legacy.target), 'image/jpeg');
        if (legacy?.kind === 'LOCAL') {
            const root = path.resolve(process.cwd(), 'public/uploads');
            const bytes = await boundedLocal(await fs.open(path.join(root, legacy.target), constants.O_RDONLY | constants.O_NOFOLLOW));
            const ext = path.extname(legacy.target).toLowerCase();
            return await stageWishPhoto(ownerUserId, bytes, ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');
        }
        // A stale app-managed image must fail explicitly, never produce a
        // clone that silently depends on a deleted source's media ownership.
        throw new FlickrMediaUnavailable();
    } catch (error) {
        if (error instanceof FlickrMediaUnavailable) throw error;
        throw new FlickrMediaUnavailable();
    } finally { release(); }
}
