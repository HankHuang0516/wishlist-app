const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { createFlickr } = require('flickr-sdk');

const base = 'https://wishlist-app-production.up.railway.app/api';
const expectedUserId = Number(process.env.MINIMAX_PILOT_USER_ID);
const credentialFile = process.env.QA_CREDENTIALS_FILE;
const prisma = new PrismaClient();
let bearer;
let mediaId;
let deleted = false;

async function request(route, options = {}) {
    const response = await fetch(`${base}${route}`, { ...options, headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...options.headers } });
    return response;
}

async function main() {
    if (!credentialFile || !Number.isSafeInteger(expectedUserId) || expectedUserId < 1 ||
        process.env.LISTING_MEDIA_STORAGE_PROVIDER !== 'flickr' ||
        process.env.LISTING_MEDIA_FLICKR_PILOT_USER_ID !== String(expectedUserId)) throw new Error('pilot_configuration_not_ready');
    const credentialText = fs.readFileSync(credentialFile, 'utf8');
    const line = label => credentialText.split('\n').find(value => value.startsWith(label))?.slice(label.length).trim();
    const phoneNumber = line('測試帳號：'), password = line('測試密碼：');
    if (!phoneNumber || !password) throw new Error('test_credentials_missing');
    const login = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, password }) });
    if (!login.ok) throw new Error('test_login_failed');
    const auth = await login.json();
    if (auth.user?.id !== expectedUserId || !auth.token) throw new Error('wrong_test_account');
    bearer = auth.token;

    const file = fs.readFileSync(path.resolve(__dirname, '../../client/public/features/feature1.png'));
    const form = new FormData();
    form.append('clientUploadId', randomUUID());
    // The historical feature1.png asset contains JPEG bytes; declare its real MIME.
    form.append('image', new Blob([file], { type: 'image/jpeg' }), 'flickr-pilot.jpg');
    const uploadStarted = performance.now();
    const upload = await request('/listing-media', { method: 'POST', body: form });
    const uploadMs = Math.round(performance.now() - uploadStarted);
    if (upload.status !== 201) {
        const failure = await upload.json().catch(() => ({}));
        const code = /^[A-Z_]+$/.test(failure?.errorCode ?? '') ? failure.errorCode : 'UNKNOWN';
        throw new Error(`pilot_upload_http_${upload.status}_${code}`);
    }
    const record = await upload.json();
    mediaId = record.id;
    const row = await prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (!row || row.ownerUserId !== expectedUserId || !row.flickrPhotoId || !row.flickrImageUrl || !row.flickrThumbnailUrl) {
        throw new Error('pilot_not_stored_on_flickr');
    }
    for (const variant of ['image', 'thumbnail']) {
        const response = await request(`/listing-media/${mediaId}/${variant}`);
        if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('image/jpeg') ||
            (await response.arrayBuffer()).byteLength < 1000) throw new Error(`pilot_proxy_${variant}_failed`);
    }
    const anonymous = await fetch(`${base}/listing-media/${mediaId}/image`);
    if (anonymous.status !== 404) throw new Error('private_photo_exposed');
    const remove = await request(`/listing-media/${mediaId}`, { method: 'DELETE' });
    if (remove.status !== 204) throw new Error(`pilot_delete_http_${remove.status}`);
    deleted = true;

    let cleanupFinished = false;
    for (let attempt = 0; attempt < 20; attempt++) {
        const [media, erasure] = await Promise.all([
            prisma.listingMedia.findUnique({ where: { id: mediaId } }),
            prisma.mediaErasureTask.findUnique({ where: { mediaId } })
        ]);
        if (!media && !erasure) { cleanupFinished = true; break; }
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    if (!cleanupFinished) throw new Error('remote_erasure_pending');
    const { flickr } = createFlickr({ consumerKey: process.env.FLICKR_API_KEY, consumerSecret: process.env.FLICKR_API_SECRET,
        oauthToken: process.env.FLICKR_OAUTH_TOKEN, oauthTokenSecret: process.env.FLICKR_OAUTH_TOKEN_SECRET });
    try { await flickr('flickr.photos.getInfo', { photo_id: row.flickrPhotoId }); }
    catch (error) {
        if (Number(error?.cause?.code) === 1) {
            console.log(JSON.stringify({ pilot: 'PASS', mediaId, provider: 'flickr', uploadMs, privateProxy: 'PASS', remoteDeletion: 'PASS' }));
            return;
        }
        throw new Error('flickr_delete_lookup_inconclusive');
    }
    throw new Error('flickr_photo_still_present');
}

main().catch(error => {
    console.error(`Pilot API smoke failed (${/^[-a-z0-9_]+$/i.test(error?.message ?? '') ? error.message : 'unexpected_failure'}).`);
    process.exitCode = 1;
}).finally(async () => {
    if (mediaId && !deleted && bearer) {
        const response = await request(`/listing-media/${mediaId}`, { method: 'DELETE' }).catch(() => null);
        console.error(`Pilot cleanup request ${response?.status === 204 ? 'accepted' : 'needs_manual_review'} for ${mediaId}.`);
    }
    await prisma.$disconnect();
});
