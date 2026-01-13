"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flickrService = void 0;
const flickr_sdk_1 = require("flickr-sdk");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Wishlist App Album Name
const ALBUM_NAME = 'Wishlist App Items';
// Initialize Flickr with OAuth
// Note: This requires environment variables to be set
const createFlickrClient = () => {
    if (!process.env.FLICKR_API_KEY || !process.env.FLICKR_API_SECRET ||
        !process.env.FLICKR_OAUTH_TOKEN || !process.env.FLICKR_OAUTH_TOKEN_SECRET) {
        return null;
    }
    const { flickr, upload } = (0, flickr_sdk_1.createFlickr)({
        consumerKey: process.env.FLICKR_API_KEY,
        consumerSecret: process.env.FLICKR_API_SECRET,
        oauthToken: process.env.FLICKR_OAUTH_TOKEN,
        oauthTokenSecret: process.env.FLICKR_OAUTH_TOKEN_SECRET
    });
    return { flickr, upload };
};
// Cache for photoset ID
let cachedPhotosetId = null;
exports.flickrService = {
    /**
     * Find or create the Wishlist App photoset (album)
     */
    getOrCreatePhotoset: () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const client = createFlickrClient();
        if (!client)
            return null;
        // Return cached ID if available
        if (cachedPhotosetId) {
            return cachedPhotosetId;
        }
        try {
            // Search for existing photoset
            const photosetsRes = yield client.flickr('flickr.photosets.getList', {
                user_id: process.env.FLICKR_USER_ID || 'me'
            });
            const photosets = ((_a = photosetsRes.photosets) === null || _a === void 0 ? void 0 : _a.photoset) || [];
            const existingSet = photosets.find((set) => set.title._content === ALBUM_NAME);
            if (existingSet) {
                cachedPhotosetId = existingSet.id;
                console.log(`[Flickr] Found existing photoset: ${cachedPhotosetId}`);
                return cachedPhotosetId;
            }
            // Photoset will be created after first upload
            console.log('[Flickr] Photoset will be created on first upload');
            return null;
        }
        catch (error) {
            console.error('[Flickr] Failed to get photosets:', error.message);
            return null;
        }
    }),
    /**
     * Add a photo to the photoset
     */
    addPhotoToPhotoset: (photoId, photosetId) => __awaiter(void 0, void 0, void 0, function* () {
        const client = createFlickrClient();
        if (!client)
            return false;
        try {
            yield client.flickr('flickr.photosets.addPhoto', {
                photoset_id: photosetId,
                photo_id: photoId
            });
            console.log(`[Flickr] Added photo ${photoId} to photoset ${photosetId}`);
            return true;
        }
        catch (error) {
            console.error('[Flickr] Failed to add photo to photoset:', error.message);
            return false;
        }
    }),
    /**
     * Create a new photoset with a primary photo
     */
    createPhotoset: (primaryPhotoId) => __awaiter(void 0, void 0, void 0, function* () {
        const client = createFlickrClient();
        if (!client)
            return null;
        try {
            const result = yield client.flickr('flickr.photosets.create', {
                title: ALBUM_NAME,
                description: 'Photos from Wishlist App - automatically backed up',
                primary_photo_id: primaryPhotoId
            });
            cachedPhotosetId = result.photoset.id;
            console.log(`[Flickr] Created new photoset: ${cachedPhotosetId}`);
            return cachedPhotosetId;
        }
        catch (error) {
            console.error('[Flickr] Failed to create photoset:', error.message);
            return null;
        }
    }),
    /**
     * Upload an image to Flickr and return its direct URL
     * @param imageBuffer File buffer or file path
     * @param filename Desired filename
     * @param title Title for the photo
     * @param tags Comma separated tags
     */
    uploadImage: (imageBuffer_1, filename_1, title_1, ...args_1) => __awaiter(void 0, [imageBuffer_1, filename_1, title_1, ...args_1], void 0, function* (imageBuffer, filename, title, tags = 'wishlist-app') {
        const client = createFlickrClient();
        if (!client) {
            console.warn('[Flickr] Missing credentials, falling back to local/null.');
            return null;
        }
        try {
            console.log(`[Flickr] Uploading ${filename}...`);
            // Handle file path input
            let photoData;
            if (typeof imageBuffer === 'string') {
                // It's a file path
                photoData = imageBuffer;
            }
            else {
                // Write buffer to temp file for upload
                const tempPath = path_1.default.join('/tmp', `temp_${Date.now()}_${filename}`);
                fs_1.default.writeFileSync(tempPath, imageBuffer);
                photoData = tempPath;
            }
            // Upload using the new SDK
            const photoIdResult = yield client.upload(photoData, {
                title: title || filename,
                tags: tags,
                is_public: '1',
                hidden: '2'
            });
            // Extract photo ID (can be string or object)
            const photoId = typeof photoIdResult === 'string'
                ? photoIdResult
                : photoIdResult.id || String(photoIdResult);
            console.log(`[Flickr] Uploaded! Photo ID: ${photoId}`);
            // Clean up temp file if we created one
            if (typeof imageBuffer !== 'string' && typeof photoData === 'string') {
                try {
                    fs_1.default.unlinkSync(photoData);
                }
                catch (e) {
                    // Ignore cleanup errors
                }
            }
            // Add to photoset
            let photosetId = yield exports.flickrService.getOrCreatePhotoset();
            if (!photosetId) {
                // Create new photoset with this as primary photo
                photosetId = yield exports.flickrService.createPhotoset(photoId);
            }
            else {
                // Add to existing photoset
                yield exports.flickrService.addPhotoToPhotoset(photoId, photosetId);
            }
            // Get photo URL
            const sizesRes = yield client.flickr('flickr.photos.getSizes', {
                photo_id: photoId
            });
            const sizes = sizesRes.sizes.size;
            const targetSize = sizes.find((s) => s.label === 'Original') ||
                sizes.find((s) => s.label === 'Large') ||
                sizes[sizes.length - 1];
            if (targetSize && targetSize.source) {
                console.log(`[Flickr] Got URL: ${targetSize.source}`);
                return targetSize.source;
            }
            else {
                console.error('[Flickr] Could not find size URL');
                return null;
            }
        }
        catch (error) {
            console.error('[Flickr] Upload failed:', error.message || error);
            return null;
        }
    })
};
