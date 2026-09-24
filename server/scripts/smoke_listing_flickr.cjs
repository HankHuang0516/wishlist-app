const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { createFlickr } = require('flickr-sdk');
const { ListingFlickrStorage } = require('../dist/lib/listingFlickrStorage');

async function main() {
    const { FLICKR_API_KEY, FLICKR_API_SECRET, FLICKR_OAUTH_TOKEN, FLICKR_OAUTH_TOKEN_SECRET, FLICKR_USER_ID } = process.env;
    if (![FLICKR_API_KEY, FLICKR_API_SECRET, FLICKR_OAUTH_TOKEN, FLICKR_OAUTH_TOKEN_SECRET, FLICKR_USER_ID].every(Boolean)) {
        throw new Error('flickr_environment_incomplete');
    }
    const { flickr } = createFlickr({ consumerKey: FLICKR_API_KEY, consumerSecret: FLICKR_API_SECRET,
        oauthToken: FLICKR_OAUTH_TOKEN, oauthTokenSecret: FLICKR_OAUTH_TOKEN_SECRET });
    const token = await flickr('flickr.auth.oauth.checkToken', {});
    if (token?.oauth?.user?.nsid !== FLICKR_USER_ID || token?.oauth?.perms?._content !== 'delete') {
        throw new Error('flickr_account_or_scope_mismatch');
    }
    const storage = new ListingFlickrStorage();
    await storage.ready();
    const testImage = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#528dba' } }).jpeg().toBuffer();
    let remote;
    try {
        remote = await storage.upload(randomUUID(), testImage);
        for (const url of [remote.imageSource, remote.thumbnailSource]) {
            const image = await storage.read(url, remote.photoId);
            if ((await sharp(image).metadata()).format !== 'jpeg') throw new Error('flickr_read_invalid');
        }
    } finally {
        if (remote) {
            try { await storage.remove(remote.photoId); }
            catch { console.error(`Temporary Flickr photo cleanup needs manual retry: ${remote.photoId}`); throw new Error('flickr_delete_failed'); }
        }
    }
    try {
        await flickr('flickr.photos.getInfo', { photo_id: remote.photoId });
    } catch (error) {
        if (Number(error?.cause?.code) === 1) {
            console.log('Flickr private upload, image/thumbnail read, delete, and post-delete lookup passed.');
            return;
        }
        throw new Error('flickr_post_delete_lookup_inconclusive');
    }
    throw new Error('flickr_photo_remained_after_delete');
}

main().catch(error => {
    const known = new Set(['flickr_environment_incomplete', 'flickr_account_or_scope_mismatch', 'flickr_read_invalid',
        'flickr_delete_failed', 'flickr_post_delete_lookup_inconclusive', 'flickr_photo_remained_after_delete']);
    console.error(`Flickr smoke failed (${known.has(error?.message) ? error.message : 'unexpected_failure'}).`);
    process.exitCode = 1;
});
