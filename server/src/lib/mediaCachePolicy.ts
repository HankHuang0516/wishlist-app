/** How long a viewer's own browser may keep a photo it was just sent.
 *
 * Only the thumbnail of something everyone can already see (a current source lead, a listing on sale) gets a
 * lifetime, and a short one: the same thumbnails are asked for again on every return to a list or map page, and
 * each costs a round trip. Everything else stays `no-store`: full-size photos, wish photos, and a photo only its
 * owner or a worker may read. `private` keeps shared caches out in both cases.
 *
 * The price is that a thumbnail withdrawn in the meantime can still be shown from the cache of a browser that
 * loaded it within the lifetime. The route itself keeps checking on every request it does receive. */
const DEFAULT_MAX_AGE_S = 600;
const LIMIT_S = 3600;

/** Seconds; 0 turns browser caching off. `MEDIA_THUMBNAIL_MAX_AGE_S` overrides the default, anything unreadable is 0. */
export function thumbnailMaxAge(): number {
    const raw = process.env.MEDIA_THUMBNAIL_MAX_AGE_S;
    if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_AGE_S;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 1 ? Math.min(Math.floor(value), LIMIT_S) : 0;
}

export function photoCacheControl(variant: string, shownToEveryone: boolean): string {
    const age = variant === 'thumbnail' && shownToEveryone ? thumbnailMaxAge() : 0;
    return age > 0 ? `private, max-age=${age}` : 'private, no-store';
}
