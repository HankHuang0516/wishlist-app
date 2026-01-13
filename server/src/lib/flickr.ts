import { createFlickr } from 'flickr-sdk';
import fs from 'fs';
import path from 'path';

// Wishlist App Album Name
const ALBUM_NAME = 'Wishlist App Items';

// Initialize Flickr with OAuth
// Note: This requires environment variables to be set
const createFlickrClient = () => {
    if (!process.env.FLICKR_API_KEY || !process.env.FLICKR_API_SECRET ||
        !process.env.FLICKR_OAUTH_TOKEN || !process.env.FLICKR_OAUTH_TOKEN_SECRET) {
        return null;
    }

    const { flickr, upload } = createFlickr({
        consumerKey: process.env.FLICKR_API_KEY,
        consumerSecret: process.env.FLICKR_API_SECRET,
        oauthToken: process.env.FLICKR_OAUTH_TOKEN,
        oauthTokenSecret: process.env.FLICKR_OAUTH_TOKEN_SECRET
    });

    return { flickr, upload };
};

// Cache for photoset ID
let cachedPhotosetId: string | null = null;

export const flickrService = {
    /**
     * Find or create the Wishlist App photoset (album)
     */
    getOrCreatePhotoset: async (): Promise<string | null> => {
        const client = createFlickrClient();
        if (!client) return null;

        // Return cached ID if available
        if (cachedPhotosetId) {
            return cachedPhotosetId;
        }

        try {
            // Search for existing photoset
            const photosetsRes = await client.flickr('flickr.photosets.getList', {
                user_id: process.env.FLICKR_USER_ID || 'me'
            });

            const photosets = photosetsRes.photosets?.photoset || [];
            const existingSet = photosets.find((set: any) => set.title._content === ALBUM_NAME);

            if (existingSet) {
                cachedPhotosetId = existingSet.id;
                console.log(`[Flickr] Found existing photoset: ${cachedPhotosetId}`);
                return cachedPhotosetId;
            }

            // Photoset will be created after first upload
            console.log('[Flickr] Photoset will be created on first upload');
            return null;

        } catch (error: any) {
            console.error('[Flickr] Failed to get photosets:', error.message);
            return null;
        }
    },

    /**
     * Add a photo to the photoset
     */
    addPhotoToPhotoset: async (photoId: string, photosetId: string): Promise<boolean> => {
        const client = createFlickrClient();
        if (!client) return false;

        try {
            await client.flickr('flickr.photosets.addPhoto', {
                photoset_id: photosetId,
                photo_id: photoId
            });
            console.log(`[Flickr] Added photo ${photoId} to photoset ${photosetId}`);
            return true;
        } catch (error: any) {
            console.error('[Flickr] Failed to add photo to photoset:', error.message);
            return false;
        }
    },

    /**
     * Create a new photoset with a primary photo
     */
    createPhotoset: async (primaryPhotoId: string): Promise<string | null> => {
        const client = createFlickrClient();
        if (!client) return null;

        try {
            const result = await client.flickr('flickr.photosets.create', {
                title: ALBUM_NAME,
                description: 'Photos from Wishlist App - automatically backed up',
                primary_photo_id: primaryPhotoId
            });

            cachedPhotosetId = result.photoset.id;
            console.log(`[Flickr] Created new photoset: ${cachedPhotosetId}`);
            return cachedPhotosetId;
        } catch (error: any) {
            console.error('[Flickr] Failed to create photoset:', error.message);
            return null;
        }
    },

    /**
     * Upload an image to Flickr and return its direct URL
     * @param imageBuffer File buffer or file path
     * @param filename Desired filename
     * @param title Title for the photo
     * @param tags Comma separated tags
     */
    uploadImage: async (imageBuffer: Buffer | string, filename: string, title?: string, tags: string = 'wishlist-app'): Promise<string | null> => {
        const client = createFlickrClient();
        if (!client) {
            console.warn('[Flickr] Missing credentials, falling back to local/null.');
            return null;
        }

        try {
            console.log(`[Flickr] Uploading ${filename}...`);

            // Handle file path input
            let photoData: Buffer | string;
            if (typeof imageBuffer === 'string') {
                // It's a file path
                photoData = imageBuffer;
            } else {
                // Write buffer to temp file for upload
                const tempPath = path.join('/tmp', `temp_${Date.now()}_${filename}`);
                fs.writeFileSync(tempPath, imageBuffer);
                photoData = tempPath;
            }

            // Upload using the new SDK
            const photoIdResult = await client.upload(photoData, {
                title: title || filename,
                tags: tags,
                is_public: '1' as '0' | '1',
                hidden: '2' as '1' | '2'
            });

            // Extract photo ID (can be string or object)
            const photoId = typeof photoIdResult === 'string'
                ? photoIdResult
                : (photoIdResult as any).id || String(photoIdResult);

            console.log(`[Flickr] Uploaded! Photo ID: ${photoId}`);

            // Clean up temp file if we created one
            if (typeof imageBuffer !== 'string' && typeof photoData === 'string') {
                try {
                    fs.unlinkSync(photoData);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }

            // Add to photoset
            let photosetId = await flickrService.getOrCreatePhotoset();
            if (!photosetId) {
                // Create new photoset with this as primary photo
                photosetId = await flickrService.createPhotoset(photoId);
            } else {
                // Add to existing photoset
                await flickrService.addPhotoToPhotoset(photoId, photosetId);
            }

            // Get photo URL
            const sizesRes = await client.flickr('flickr.photos.getSizes', {
                photo_id: photoId
            });

            const sizes = sizesRes.sizes.size;
            // Prioritize 'Large' sizes over 'Original' to ensure public accessibility
            // Flickr's Original size can be restricted even for public photos
            const targetSize = sizes.find((s: any) => s.label === 'Large 2048') ||
                sizes.find((s: any) => s.label === 'Large 1600') ||
                sizes.find((s: any) => s.label === 'Large') ||
                sizes.find((s: any) => s.label === 'Original') ||
                sizes[sizes.length - 1];

            if (targetSize && targetSize.source) {
                console.log(`[Flickr] Got URL: ${targetSize.source}`);
                return targetSize.source;
            } else {
                console.error('[Flickr] Could not find size URL');
                return null;
            }

        } catch (error: any) {
            console.error('[Flickr] Upload failed:', error.message || error);
            return null;
        }
    }
};
