import { createHmac, randomBytes } from 'crypto';
import sharp from 'sharp';
import { ByteCache } from './mediaByteCache';

export class FlickrMediaUnavailable extends Error {
    constructor() { super('Flickr media storage is unavailable'); }
}
export class FlickrOrphanedUpload extends FlickrMediaUnavailable {
    constructor(public readonly photoId: string) { super(); }
}

type FlickrSize = { label: string; source: string };
const MAX_REMOTE_BYTES = 6 * 1024 * 1024;
// Renditions read from Flickr stay in memory for a day: a photo's bytes at one URL never change, and every visitor of
// a list page asks for the same thumbnails. Thumbnails and full-size images have separate budgets so a few large
// images cannot push out hundreds of thumbnails. MEDIA_CACHE_MB sets the total (0 turns the cache off).
const CACHE_MB = process.env.MEDIA_CACHE_MB === undefined ? 64 : Math.max(0, Number(process.env.MEDIA_CACHE_MB) || 0);
const SMALL_RENDITION_BYTES = 96 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const smallRenditions = new ByteCache(Math.floor(CACHE_MB * 0.75 * 1024 * 1024), CACHE_TTL_MS);
const largeRenditions = new ByteCache(Math.floor(CACHE_MB * 0.25 * 1024 * 1024), CACHE_TTL_MS);
const inFlight = new Map<string, Promise<Buffer>>();
export function clearMediaCache() { smallRenditions.clear(); largeRenditions.clear(); inFlight.clear(); }
export function mediaCacheStats() { return { small: smallRenditions.stats(), large: largeRenditions.stats(), inFlight: inFlight.size }; }
const UPLOAD_URL = 'https://up.flickr.com/services/upload/';
const REST_URL = 'https://www.flickr.com/services/rest/';

function credentials() {
    const { FLICKR_API_KEY, FLICKR_API_SECRET, FLICKR_OAUTH_TOKEN, FLICKR_OAUTH_TOKEN_SECRET } = process.env;
    if (!FLICKR_API_KEY || !FLICKR_API_SECRET || !FLICKR_OAUTH_TOKEN || !FLICKR_OAUTH_TOKEN_SECRET) throw new FlickrMediaUnavailable();
    return { key: FLICKR_API_KEY, secret: FLICKR_API_SECRET, token: FLICKR_OAUTH_TOKEN, tokenSecret: FLICKR_OAUTH_TOKEN_SECRET };
}

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
function signed(method: 'GET' | 'POST', url: string, params: Record<string, string>) {
    const creds = credentials();
    const oauth: Record<string, string> = { oauth_consumer_key: creds.key, oauth_token: creds.token,
        oauth_nonce: randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_version: '1.0' };
    const all = { ...params, ...oauth };
    const values = Object.entries(all).sort(([a, av], [b, bv]) => a === b ? av.localeCompare(bv) : a.localeCompare(b))
        .map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&');
    oauth.oauth_signature = createHmac('sha1', `${encode(creds.secret)}&${encode(creds.tokenSecret)}`)
        .update(`${method}&${encode(url)}&${encode(values)}`).digest('base64');
    return { ...params, ...oauth };
}

export function validatedFlickrSource(raw: string, photoId: string) {
    if (!/^[0-9]{1,30}$/.test(photoId)) throw new FlickrMediaUnavailable();
    let url: URL;
    try { url = new URL(raw); } catch { throw new FlickrMediaUnavailable(); }
    if (url.protocol !== 'https:' || url.hostname !== 'live.staticflickr.com' || url.port || url.username || url.password || url.search || url.hash ||
        !new RegExp(`^/[0-9]+/${photoId}_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?\\.jpe?g$`).test(url.pathname)) throw new FlickrMediaUnavailable();
    return url.toString();
}

function source(sizes: FlickrSize[], photoId: string, labels: string[]) {
    const selected = labels.map(label => sizes.find(size => size.label === label)).find(Boolean);
    if (!selected) throw new FlickrMediaUnavailable();
    return validatedFlickrSource(selected.source, photoId);
}

export class ListingFlickrStorage {
    // Resolved at call time so a global fetch installed later (tests, instrumentation) is the one used.
    constructor(private readonly fetchGiven?: typeof fetch) {}
    private get fetchImpl(): typeof fetch { return this.fetchGiven ?? fetch; }
    async ready() {
        credentials();
        const status = await this.rest('flickr.auth.oauth.checkToken', {});
        if ((status as { oauth?: { perms?: { _content?: string } } }).oauth?.perms?._content !== 'delete') throw new FlickrMediaUnavailable();
    }

    async upload(mediaId: string, image: Buffer) {
        if (!/^[0-9a-f-]{36}$/.test(mediaId)) throw new FlickrMediaUnavailable();
        let photoId: string | undefined;
        try {
            // The APP encoder already strips EXIF; this JPEG is the Flickr master.
            const jpeg = await sharp(image).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
            // The opaque media ID lets an operator reconcile an upload if the process dies before DB commit.
            const params = { title: `Wishlist AI photo ${mediaId}`, tags: `wishlist-app native-media-${mediaId}`,
                is_public: '0', is_friend: '0', is_family: '0', hidden: '2' };
            const form = new FormData();
            for (const [key, value] of Object.entries(signed('POST', UPLOAD_URL, params))) form.append(key, value);
            form.append('photo', new Blob([Uint8Array.from(jpeg)], { type: 'image/jpeg' }), 'wish.jpg');
            const uploaded = await this.fetchImpl(UPLOAD_URL, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(30_000) });
            const xml = await uploaded.text();
            photoId = uploaded.ok ? xml.match(/<photoid>(\d+)<\/photoid>/)?.[1] : undefined;
            if (!photoId || !/^[0-9]{1,30}$/.test(photoId)) throw new FlickrMediaUnavailable();
            const response = await this.rest('flickr.photos.getSizes', { photo_id: photoId });
            const sizes = (response as { sizes?: { size?: FlickrSize[] } }).sizes?.size;
            if (!Array.isArray(sizes)) throw new FlickrMediaUnavailable();
            return { photoId, imageSource: source(sizes, photoId, ['Large 1600', 'Large', 'Medium 800', 'Medium 640', 'Medium 500', 'Small 320', 'Square 150', 'Square 75']),
                thumbnailSource: source(sizes, photoId, ['Small 320', 'Small', 'Square 150', 'Square 75']) };
        } catch (error) {
            // A failed metadata lookup must not quietly leave a successful upload public.
            if (photoId) {
                try { await this.remove(photoId); }
                catch { throw new FlickrOrphanedUpload(photoId); }
            }
            throw error;
        }
    }

    /** Whether a rendition is already in memory, so a warm-up can skip it without touching Flickr. */
    cached(url: string, photoId: string) {
        const source = validatedFlickrSource(url, photoId);
        return smallRenditions.has(source) || largeRenditions.has(source);
    }

    /** The rendition's bytes: from memory when read recently, otherwise from Flickr once, however many callers wait. */
    async read(url: string, photoId: string): Promise<Buffer> {
        const source = validatedFlickrSource(url, photoId);
        const cached = smallRenditions.get(source) ?? largeRenditions.get(source);
        if (cached) return cached;
        const pending = inFlight.get(source);
        if (pending) return pending;
        const reading = this.readRemote(source).then(bytes => {
            (bytes.length <= SMALL_RENDITION_BYTES ? smallRenditions : largeRenditions).set(source, bytes);
            return bytes;
        }).finally(() => { if (inFlight.get(source) === reading) inFlight.delete(source); });
        inFlight.set(source, reading);
        return reading;
    }

    private async readRemote(source: string) {
        const response = await this.fetchImpl(source, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
        if (!response.ok || !response.body || !/^image\/jpeg(?:;|$)/i.test(response.headers.get('content-type') ?? '') ||
            Number(response.headers.get('content-length') || 0) > MAX_REMOTE_BYTES) throw new FlickrMediaUnavailable();
        const chunks: Buffer[] = []; let length = 0;
        const reader = response.body.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                length += value.length;
                if (length > MAX_REMOTE_BYTES) throw new FlickrMediaUnavailable();
                chunks.push(Buffer.from(value));
            }
        } finally { reader.releaseLock(); }
        const bytes = Buffer.concat(chunks, length);
        if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new FlickrMediaUnavailable();
        return bytes;
    }

    async remove(photoId: string) {
        if (!/^[0-9]{1,30}$/.test(photoId)) throw new FlickrMediaUnavailable();
        await this.rest('flickr.photos.delete', { photo_id: photoId }, 'POST');
    }

    private async rest(method: string, params: Record<string, string>, verb: 'GET' | 'POST' = 'GET') {
        const request = { method, ...params, format: 'json', nojsoncallback: '1' };
        const signedParams = signed(verb, REST_URL, request);
        const response = verb === 'GET'
            ? await this.fetchImpl(`${REST_URL}?${new URLSearchParams(signedParams)}`, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
            : await this.fetchImpl(REST_URL, { method: 'POST', body: new URLSearchParams(signedParams), redirect: 'error', signal: AbortSignal.timeout(15_000) });
        const result = await response.json() as { stat?: string };
        if (!response.ok || result.stat !== 'ok') throw new FlickrMediaUnavailable();
        return result;
    }
}
