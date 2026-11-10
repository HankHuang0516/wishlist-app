/* The first-screen boot script.
 *
 * The build compiles this file on its own and puts it inline at the top of index.html (vite-first-screen.ts), so it
 * runs before the main bundle has been requested. From the address alone it works out which page is about to be
 * shown and asks, in the same wave as the main bundle, for what that page would otherwise ask for one round trip at
 * a time:
 *   - the page's own code and styles (normally requested only after the main bundle has run);
 *   - for a browser that is not signed in, the public reads the page makes as it mounts, and its first images;
 *     for some pages also reads that only the data can name, which the server writes into the HTML right above
 *     this script (server/src/lib/firstScreenHints.ts).
 * Nothing here is needed for the page to work. Any failure is swallowed and the page loads the ordinary way.
 *
 * Keep this file free of imports and of DOM-lib globals: the build's own type check (no DOM) covers it too, and
 * the application takes `isLegacyExplore` from here so that a page and the script that fetches its code agree.
 */

/** What a route needs beyond its code. */
export type FirstScreenExtras = {
  /** Public reads the page makes as it mounts: paths under /api, with ':id' standing for the route parameter. */
  d?: string[];
  /** Public reads made only when the address has no query string. */
  q?: string[];
  /** Public reads the legacy explore page makes instead of `d` and `q`, whatever its query. */
  g?: string[];
  /** Same-origin images on the first screen of a visitor who is not signed in. */
  i?: string[];
  /** Images from another origin whose <img> asks for referrerpolicy="origin"; the same for every visitor. */
  o?: string[];
  /** The code to fetch instead (indexes into `a`) when the address is a legacy explore link. */
  l?: number[];
};

export type FirstScreenPlan = {
  /** File names under /assets/. */
  a: string[];
  /** [path template, indexes into `a`, index into `x` or -1], in the order they are tried. */
  r: [string, number[], number][];
  x: FirstScreenExtras[];
};

export type FirstScreenLink = {
  rel: string;
  as: string;
  href: string;
  crossOrigin: string | null;
  referrerPolicy: string;
  relList?: { supports?: (token: string) => boolean };
};

/** The parts of `window` the script touches. */
export type FirstScreenEnv = {
  location: { pathname: string; search: string };
  document: {
    createElement(name: 'link'): FirstScreenLink;
    head: { appendChild(link: FirstScreenLink): unknown };
    getElementById?(id: string): { textContent: string | null } | null;
  };
  localStorage: { getItem(key: string): string | null };
  fetch(url: string, init: Record<string, unknown>): Promise<unknown>;
  AbortSignal?: { timeout?: (milliseconds: number) => unknown };
  /** When the reads were sent, and each one's answer under the address it was sent to. */
  __wishlistFirstScreen?: { t: number; d: Record<string, Promise<unknown>> };
};

const SESSION_KEY = 'wishlist.auth.session.v1';
// The only identifiers placed into a request: lower-case UUIDs, exactly as the address gives them.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Shared links, the map and wish-specific addresses keep the legacy explore page; everything else is discovery.
export function isLegacyExplore(search: string) {
  const p = new URLSearchParams(search);
  return ['view', 'scope', 'bbox', 'wish', 'wishItemId', 'listing', 'external', 'brand', 'category', 'delivery', 'minPrice', 'maxPrice', 'radius'].some(k => p.has(k))
    || p.has('source') && !['all', 'listing', 'source', 'external'].includes(p.get('source')!);
}

/** True only when the stored session says nobody is signed in. Anything unreadable counts as signed in. */
function signedOut(storage: FirstScreenEnv['localStorage']) {
  const record = storage.getItem(SESSION_KEY);
  if (record === null) return storage.getItem('token') === null && storage.getItem('user') === null;
  const row: unknown = JSON.parse(record);
  return typeof row === 'object' && row !== null
    && (row as { token?: unknown }).token === null && (row as { user?: unknown }).user === null;
}

// The same shape marketplaceApi accepts for a request path.
const READ = /^\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&%+.,-]*)?$/;
export const HINTS_ID = 'wishlist-first-screen';

/** Reads the server named in this page's HTML for this route (server/src/lib/firstScreenHints.ts): what only the
 *  data knows, such as the interest counts of the explore cards. Anything unexpected names nothing. */
function hinted(env: FirstScreenEnv, route: string): string[] {
  const element = env.document.getElementById ? env.document.getElementById(HINTS_ID) : null;
  if (!element || !element.textContent) return [];
  const value: unknown = JSON.parse(element.textContent);
  if (typeof value !== 'object' || value === null || (value as { r?: unknown }).r !== route) return [];
  const reads = (value as { d?: unknown }).d;
  return Array.isArray(reads) ? reads.filter((read): read is string => typeof read === 'string' && read.length <= 4096
    && READ.test(read) && read.indexOf('//') !== 0 && !/%(?![a-fA-F0-9]{2})/.test(read)).slice(0, 4) : [];
}

function matcher(template: string) {
  return template === '*' ? /^/ : new RegExp('^/' + template.replace(/:[A-Za-z]+/g, '([^/]+)') + '/?$', 'i');
}

function image(env: FirstScreenEnv, url: string, referrerPolicy: string) {
  const link = env.document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  if (referrerPolicy) link.referrerPolicy = referrerPolicy;
  link.href = url;
  env.document.head.appendChild(link);
}

export function firstScreenBoot(plan: FirstScreenPlan, env: FirstScreenEnv): void {
  try {
    const search = env.location.search;
    let route: FirstScreenPlan['r'][number] | undefined, parameter = '';
    for (const candidate of plan.r) {
      const match = matcher(candidate[0]).exec(env.location.pathname);
      if (match) { route = candidate; parameter = match[1] || ''; break; }
    }
    if (!route) return;
    const extras: FirstScreenExtras = plan.x[route[2]] || {};
    const legacy = !!extras.l && isLegacyExplore(search);

    let guest = false;
    try { guest = signedOut(env.localStorage); } catch { /* Storage is unavailable or unreadable: no public reads. */ }

    // 1. The reads go first: they take the longest. They are exactly what the page itself sends for a visitor who is
    //    not signed in (no credentials, no Authorization), so the page can take the answer instead of asking again.
    if (guest) try {
      const plain = search === '' || search === '?';
      // The server names its reads only for the plain address of a page; never for a legacy link.
      let named: string[] = [];
      if (plain && !legacy) try { named = hinted(env, route[0]); } catch { /* No hints. */ }
      const paths = (legacy ? extras.g || [] : (extras.d || []).concat(plain ? extras.q || [] : []))
        .filter(path => path.indexOf(':id') < 0 || ID.test(parameter)).map(path => path.replace(':id', parameter)).concat(named);
      if (paths.length) {
        const init: Record<string, unknown> = { cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, redirect: 'error' };
        if (env.AbortSignal && typeof env.AbortSignal.timeout === 'function') init.signal = env.AbortSignal.timeout(30000);
        // Kept under the address asked for: the page takes an answer only for that very address (early.ts).
        const pending: Record<string, Promise<unknown>> = {};
        for (const path of paths) {
          const request = env.fetch('/api' + path, init);
          request.then(undefined, () => undefined);
          pending['/api' + path] = request;
        }
        env.__wishlistFirstScreen = { t: Date.now(), d: pending };
      }
    } catch { /* The page asks for itself. */ }

    // 2. The page's code and styles, the way the bundler's own loader would ask for them a round trip later. Styles
    //    are only fetched here; the loader still attaches them, so their order in the cascade does not change.
    try {
      const list = env.document.createElement('link').relList;
      const scriptRel = list && list.supports && list.supports('modulepreload') ? 'modulepreload' : 'preload';
      for (const index of legacy ? extras.l! : route[1]) {
        const name = plan.a[index];
        if (!name) continue;
        const style = /\.css$/.test(name), link = env.document.createElement('link');
        link.rel = style ? 'preload' : scriptRel;
        link.as = style ? 'style' : 'script';
        link.crossOrigin = '';
        link.href = '/assets/' + name;
        env.document.head.appendChild(link);
      }
    } catch { /* The loader asks for them. */ }

    // 3. The first images.
    try {
      for (const url of extras.o || []) image(env, url, 'origin');
      if (guest) for (const url of extras.i || []) image(env, url, '');
    } catch { /* The page asks for them. */ }
  } catch { /* The page loads the ordinary way. */ }
}
