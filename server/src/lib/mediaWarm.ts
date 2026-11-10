import prisma from './prisma';
import { ListingFlickrStorage } from './listingFlickrStorage';
import { sourceLeadMedia } from './sourceLeadMedia';
import { leadCurrent } from './sourceLeadRules';
import { isListingId } from './listingRules';

/** Reads the thumbnails a list page is about to show into the media cache, so the browser's requests for them,
 * which follow the list by one round trip, are answered from memory instead of each going to Flickr.
 *
 * The URLs are the proxied ones the list response carries. Resolving them to Flickr renditions needs one query per
 * kind; the answer is remembered per URL so a list page that is read again costs no query. Nothing here is awaited
 * by a request: failures are swallowed, at most `limit` thumbnails are considered, and serving a thumbnail still runs
 * the route's own checks (the lead must be current, the listing visible) — this only fills the byte cache. */
type Rendition = { source: string; photoId: string };
const SOURCE = /\/source-leads\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})\/thumbnail$/i;
const LISTING = /\/listing-media\/([0-9a-f-]{36})\/thumbnail$/i;
const ALIAS_LIMIT = 5000;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const aliases = new Map<string, Rendition | null>();
// A rendition Flickr would not give is not asked for again for a while; the browser's own request still gets its 404.
const failedAt = new Map<string, number>();
const storage = new ListingFlickrStorage();
// Test suites must not reach Flickr as a side effect of reading a list; the warm-up's own tests opt in.
const enabled = () => process.env.NODE_ENV !== 'test' || process.env.MEDIA_WARM_IN_TESTS === '1';

function remember(url: string, rendition: Rendition | null) {
    if (aliases.size >= ALIAS_LIMIT) aliases.delete(aliases.keys().next().value as string);
    aliases.set(url, rendition);
}

async function resolve(urls: string[]): Promise<Rendition[]> {
    const pending = urls.filter(url => !aliases.has(url));
    const leads = new Map<string, Set<string>>(), listings = new Set<string>();
    for (const url of pending) {
        const lead = url.match(SOURCE), listing = url.match(LISTING);
        if (lead && isListingId(lead[1]) && isListingId(lead[2])) (leads.get(lead[1]) ?? leads.set(lead[1], new Set()).get(lead[1])!).add(lead[2]);
        else if (listing && isListingId(listing[1])) listings.add(listing[1]);
        else remember(url, null);
    }
    if (leads.size) {
        const rows = await prisma.externalSourceLead.findMany({ where: { id: { in: [...leads.keys()] } } });
        for (const [leadId, mediaIds] of leads) {
            const row = rows.find(r => r.id === leadId);
            const media = row && leadCurrent(row) ? sourceLeadMedia(row) : [];
            for (const mediaId of mediaIds) {
                const found = media.find(m => m.id === mediaId);
                remember(pending.find(url => url.includes(`/source-leads/${leadId}/media/${mediaId}/`)) ?? '', found ? { source: found.thumbnailUrl, photoId: found.flickrPhotoId } : null);
            }
        }
    }
    if (listings.size) {
        const rows = await prisma.listingMedia.findMany({ where: { id: { in: [...listings] } }, select: { id: true, flickrThumbnailUrl: true, flickrPhotoId: true } });
        for (const id of listings) {
            const row = rows.find(r => r.id === id);
            remember(pending.find(url => url.includes(`/listing-media/${id}/`)) ?? '', row?.flickrThumbnailUrl && row.flickrPhotoId ? { source: row.flickrThumbnailUrl, photoId: row.flickrPhotoId } : null);
        }
    }
    return urls.map(url => aliases.get(url) ?? null).filter((r): r is Rendition => r !== null);
}

/** Fire and forget from a list handler; the returned promise is for tests. */
export async function warmThumbnails(urls: (string | null | undefined)[], limit = 8, concurrency = 3): Promise<{ considered: number; read: number }> {
    const chosen = enabled() ? [...new Set(urls.filter((url): url is string => typeof url === 'string' && url.length > 0))].slice(0, limit) : [];
    let read = 0;
    try {
        const now = Date.now();
        for (const [source, at] of failedAt) if (now - at > FAILURE_TTL_MS) failedAt.delete(source);
        const renditions = (await resolve(chosen)).filter(r => { try { return !failedAt.has(r.source) && !storage.cached(r.source, r.photoId); } catch { return false; } });
        const queue = [...renditions];
        await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            for (let next = queue.shift(); next; next = queue.shift()) {
                try { await storage.read(next.source, next.photoId); read++; } catch { failedAt.set(next.source, Date.now()); }
            }
        }));
    } catch { /* Warming is best effort. */ }
    return { considered: chosen.length, read };
}

export function clearThumbnailAliases() { aliases.clear(); failedAt.clear(); }
