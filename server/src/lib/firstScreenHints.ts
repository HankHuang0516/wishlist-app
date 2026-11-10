/* What the HTML of a page names for the browser to fetch at once.
 *
 * On a first visit the browser can only ask for what the page needs once it knows the address of it. The page's
 * code and its first public reads are already asked for by the boot script in index.html (client/src/firstScreen),
 * but some of what the first screen shows is only named by those reads: the thumbnails of the explore cards, the
 * interest counts under them, the photos of the source map. Each of those used to wait for the read, then for the
 * page to draw, and only then start: one more round trip to the United States. Here the server, which has the data
 * at hand, names them in the HTML itself, so they leave with the page's code.
 *
 * Nothing here changes what a page shows. A hint that has gone out of date costs a download nobody uses, and the
 * page asks for what it really needs as it always did.
 */
import { catalogFirstPage, catalogReady } from './publicCatalog';
import { publicLeadList } from './publicLeadList';
import { warmThumbnails } from './mediaWarm';

export type FirstScreenImage = { url: string; referrerPolicy?: 'no-referrer' };
/** `route` is the path of the page in client/src/App.tsx; `reads` are public reads under /api the boot script sends
 *  for a visitor who is not signed in, exactly as the page will ask for them. */
export type FirstScreenHints = { route: string; images: FirstScreenImage[]; reads: string[] };

// How much of each page the first screen of a phone (390x844) shows. Explore: two columns of four rows. The source
// map: the selected lead's photo and the list rows the browser loads at first, seven of them (measured 11/10).
export const EXPLORE_PICTURES = 8;
export const SOURCE_LIST_PICTURES = 7;

/** The interest read of a page of products: every card subscribes, in order, and the store reads them in one
 *  request (client/src/lib/productInterest.ts). client/src/firstScreen/extras.test.tsx holds the page to this. */
export const interestRead = (keys: string[]) => '/product-interest?keys=' + encodeURIComponent(keys.join(','));

// Only addresses this server hands out, and nothing that could leave an HTML attribute.
const picture = (url: unknown): url is string => typeof url === 'string' && url.length <= 2048 && /^https?:\/\/[^\s"'<>`]+$/.test(url);

/** The explore page at its plain address: the first cards' thumbnails and their interest counts. Answered from the
 *  read model only; while that is not ready there are no hints and the page loads as it always did. */
export async function exploreHints(now = new Date()): Promise<FirstScreenHints | null> {
    if (!(await catalogReady(now))) return null;
    const rows = await catalogFirstPage(now);
    if (!rows.length) return null;
    const images = rows.slice(0, EXPLORE_PICTURES).map(row => row.thumbnailUrl).filter(picture);
    // The thumbnails are asked for as soon as the HTML arrives; have their bytes in memory by then.
    void warmThumbnails(images);
    return { route: 'explore', images: images.map(url => ({ url })), reads: [interestRead(rows.map(row => row.key))] };
}

/* The source list is ordered by id, so its first page hardly ever changes: a new lead lands on it only when its
 * random id happens to sort first. It is therefore kept for a minute and read again in the background, and a copy
 * up to ten minutes old is still used while that happens. */
const FRESH_MS = 60_000, KEEP_MS = 10 * 60_000;
let leads: { at: number; hints: FirstScreenHints | null } | null = null;
let refreshing: Promise<void> | null = null;

async function readLeadHints(): Promise<FirstScreenHints | null> {
    if (process.env.SOURCE_LEADS_PUBLIC_ENABLED !== '1') return null;
    // The page's own first read: GET /api/source-leads?presentation=1&photos=2&approximate=1.
    const { items } = await publicLeadList({ q: '', box: null, cursor: null, unlocated: false, approximate: true, presentation: true, photos: true });
    const first = (item: (typeof items)[number] | undefined) => (item as { media?: Array<{ imageUrl: string; thumbnailUrl: string }> } | undefined)?.media?.[0];
    // The selected lead is the first one: its photo is shown large. Then the list rows, each with its first photo.
    const selected = first(items[0])?.imageUrl, thumbnails = items.slice(0, SOURCE_LIST_PICTURES).map(item => first(item)?.thumbnailUrl).filter(picture);
    void warmThumbnails(thumbnails);
    const images = [...(picture(selected) ? [selected] : []), ...thumbnails].map(url => ({ url, referrerPolicy: 'no-referrer' as const }));
    return images.length ? { route: 'source-leads', images, reads: [] } : null;
}

export async function sourceLeadHints(now = Date.now()): Promise<FirstScreenHints | null> {
    const age = leads ? now - leads.at : Infinity;
    if (age >= FRESH_MS && !refreshing)
        refreshing = readLeadHints().then(hints => { leads = { at: Date.now(), hints }; }, () => undefined).finally(() => { refreshing = null; });
    if (leads && age < KEEP_MS) return leads.hints;
    await refreshing;
    return leads?.hints ?? null;
}

/** For tests: forget the kept source list. */
export function forgetFirstScreenHints() { leads = null; refreshing = null; }

const MARKER = '<!-- FIRST_SCREEN_HINTS -->';
const attribute = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** index.html with the hints in place of its marker, or null when it has no single marker to put them in. Images
 *  become preload links, asked for the same way as the page's own <img> asks (its referrer policy), so the browser
 *  hands the download to that image. Reads go to the boot script, which comes right after and sends them only
 *  for a visitor who is not signed in. */
export function renderFirstScreenHints(template: string, hints: FirstScreenHints): string | null {
    if (template.split(MARKER).length !== 2) return null;
    const links = hints.images.filter(image => picture(image.url)).map(image =>
        `<link rel="preload" as="image" href="${attribute(image.url)}"${image.referrerPolicy ? ` referrerpolicy="${image.referrerPolicy}"` : ''} />`);
    const reads = hints.reads.filter(read => /^\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&%+.,-]*)?$/.test(read) && !read.startsWith('//'));
    // JSON inside <script> ends at the first "</script"; no "<" may appear in it.
    const data = reads.length ? [`<script type="application/json" id="wishlist-first-screen">${JSON.stringify({ r: hints.route, d: reads }).replace(/</g, '\\u003c')}</script>`] : [];
    if (!links.length && !data.length) return null;
    return template.replace(MARKER, () => [...links, ...data].join('\n  '));
}
