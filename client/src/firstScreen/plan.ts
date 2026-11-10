/* The build side of the first-screen boot script (boot.ts): which files each route needs, worked out from the
 * route table in App.tsx and from what the bundler produced. No DOM or Node APIs here, so the tests can run it
 * against made-up bundles; vite-first-screen.ts feeds it the real one.
 */
import type { FirstScreenExtras, FirstScreenPlan } from './boot';

export const FIRST_SCREEN_MARKER = '<!-- FIRST_SCREEN_BOOT -->';

/** A route of App.tsx: its path ('' for the index route), the page file under src/pages that it shows, and for
 *  /explore the page shown instead for legacy links. */
export type FirstScreenRoute = { path: string; page: string; legacy?: string };

/** The part of a bundler chunk the plan needs. `imports` are static imports only. */
export type FirstScreenChunk = { fileName: string; isEntry: boolean; imports: string[]; moduleIds: string[]; css: string[] };

/* What these pages ask for as they mount, by route path. extras.test.tsx renders each page and fails when a line
 * here stops matching what the page really sends: a read listed here that the page does not make is a wasted
 * request, and one the page makes that is missing here is a round trip the first visit pays again.
 */
export const firstScreenExtras: Record<string, FirstScreenExtras> = {
  '': { d: ['/source-leads/summary'], i: [1, 2, 3, 4].map(n => `/features/feature${n}.webp`) },
  // The legacy page shows a visitor who is not signed in only a prompt to sign in and the public source count.
  explore: { q: ['/discovery?'], g: ['/source-leads/summary'] },
  'listings/:id': { d: ['/listings/:id', '/discovery/products/listing/:id', '/product-interest?keys=listing%3A:id'] },
  'source-leads': {
    d: ['/source-leads/map', '/source-leads?presentation=1&photos=2&approximate=1'],
    o: [106, 107].flatMap(x => [53, 54, 55].map(y => `https://tile.openstreetmap.org/7/${x}/${y}.png`)),
  },
};

// /explore is the one route whose element is not a lazily loaded page: ExploreRoute chooses between two of them.
const EXPLORE = { element: 'ExploreRoute', page: 'ExploreDiscoveryPage', legacy: 'ExplorePage' };
const SEGMENT = '(?:[a-z0-9-]+|:[A-Za-z]+)';
const PATH = new RegExp(`^(?:\\*|${SEGMENT}(?:/${SEGMENT})*)?$`);
// The same shape marketplaceApi accepts for a request path.
const READ = /^\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&%+.,-]*)?$/;

const fail = (message: string): never => { throw new Error(`First screen: ${message}`); };

/** Reads the route table out of App.tsx. Throws when a route is written in a way this cannot follow, so that a new
 *  route cannot silently go without its code. */
export function parseRoutes(app: string): FirstScreenRoute[] {
  const pages = new Map<string, string>();
  for (const match of app.matchAll(/const (\w+) = createLazyPage\(\(\) => import\('\.\/pages\/(\w+)'\)\);/g)) pages.set(match[1], match[2]);
  const routes: FirstScreenRoute[] = [];
  for (const match of app.matchAll(/<Route (?:index|path="([^"]*)") element=\{<(\w+) \/>\} \/>/g)) {
    const path = match[1] ?? '', element = match[2], page = pages.get(element);
    if (!PATH.test(path)) fail(`the route path "${path}" has a form the boot script does not match.`);
    if (routes.some(route => route.path === path)) fail(`the route path "${path}" appears twice.`);
    if (element === EXPLORE.element) routes.push({ path, page: EXPLORE.page, legacy: EXPLORE.legacy });
    else if (page) routes.push({ path, page });
    else fail(`the route "${path}" shows <${element} />, which is not a createLazyPage(() => import('./pages/…')) constant.`);
  }
  // Every <Route> except the layout route that wraps them must have been understood.
  const written = (app.match(/<Route\b/g) ?? []).length;
  if (!routes.length || routes.length !== written - 1) fail(`App.tsx has ${written} <Route> elements but ${routes.length} were understood; write each as <Route path="…" element={<Page />} /> on one line.`);
  return routes;
}

/** The plan the boot script carries: for each route, the files to ask for alongside the main bundle. */
export function buildPlan(chunks: FirstScreenChunk[], routes: FirstScreenRoute[], extras: Record<string, FirstScreenExtras>): FirstScreenPlan {
  const entries = chunks.filter(chunk => chunk.isEntry);
  if (entries.length !== 1) fail(`expected one entry chunk, found ${entries.length}.`);
  const byName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  // A chunk and everything it imports statically, itself first. Browsers do not fetch the imports of a preloaded
  // module, so every one of them has to be named.
  const closure = (start: FirstScreenChunk) => {
    const seen = new Set([start]), queue = [start];
    for (const chunk of queue) for (const name of chunk.imports) {
      const next = byName.get(name) ?? fail(`${chunk.fileName} imports ${name}, which is not in the bundle.`);
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    return queue;
  };
  // What index.html already asks for by itself.
  const shell = new Set(closure(entries[0]));
  const shellCss = new Set([...shell].flatMap(chunk => chunk.css));

  const assets: string[] = [], position = new Map<string, number>();
  const asset = (fileName: string) => {
    if (!fileName.startsWith('assets/') || /[^A-Za-z0-9._/-]/.test(fileName)) fail(`unexpected file name ${fileName}.`);
    const name = fileName.slice('assets/'.length);
    let at = position.get(name);
    if (at === undefined) { at = assets.push(name) - 1; position.set(name, at); }
    return at;
  };
  const needs = (page: string) => {
    const owner = chunks.find(chunk => chunk.moduleIds.some(id => id.replace(/\\/g, '/').endsWith(`/src/pages/${page}.tsx`)))
      ?? fail(`no chunk contains src/pages/${page}.tsx.`);
    const wanted = closure(owner).filter(chunk => !shell.has(chunk));
    return [...new Set([...wanted.map(chunk => chunk.fileName), ...wanted.flatMap(chunk => chunk.css).filter(file => !shellCss.has(file))])].map(asset);
  };

  for (const [path, extra] of Object.entries(extras)) {
    const route = routes.find(candidate => candidate.path === path) ?? fail(`extras name a route that does not exist: "${path}".`);
    const reads = [...(extra.d ?? []), ...(extra.q ?? []), ...(extra.g ?? [])];
    if (extra.g && !route.legacy) fail(`"${path}" has no legacy page to make its legacy reads.`);
    for (const read of reads) if (!READ.test(read.replace(':id', '0')) || read.startsWith('//')) fail(`"${read}" is not a path under /api.`);
    if (reads.some(read => read.includes(':id')) && (route.path.match(/:/g) ?? []).length !== 1) fail(`"${path}" needs exactly one parameter for ':id'.`);
    for (const url of extra.i ?? []) if (!/^\/[A-Za-z0-9._/-]+$/.test(url) || url.startsWith('//')) fail(`"${url}" is not a same-origin image path.`);
    for (const url of extra.o ?? []) if (!/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._/-]+$/.test(url)) fail(`"${url}" is not an https image address.`);
    if (extra.l) fail(`"${path}": the legacy code is filled in from the route table, not written by hand.`);
  }

  // Fixed paths are tried before parameters and the catch-all last, which for this table is what the router does.
  const rank = (path: string) => path === '*' ? 2 : path.includes(':') ? 1 : 0;
  const ordered = routes.map((route, order) => ({ route, order })).sort((a, b) => rank(a.route.path) - rank(b.route.path) || a.order - b.order);
  const x: FirstScreenExtras[] = [];
  const r = ordered.map(({ route }): FirstScreenPlan['r'][number] => {
    const extra: FirstScreenExtras = { ...(Object.hasOwn(extras, route.path) ? extras[route.path] : {}), ...(route.legacy ? { l: needs(route.legacy) } : {}) };
    return [route.path, needs(route.page), Object.keys(extra).length ? x.push(extra) - 1 : -1];
  });
  return { a: assets, r, x };
}

/** Puts the compiled boot script and its plan where the marker is. `compiled` must define `__wfs`. */
export function inlineBoot(html: string, compiled: string, plan: FirstScreenPlan): string {
  if (html.split(FIRST_SCREEN_MARKER).length !== 2) fail(`index.html must contain ${FIRST_SCREEN_MARKER} exactly once.`);
  const json = JSON.stringify(plan).replace(/</g, '\\u003c');
  // Every name, path and address in a plan is checked when it is built, so anything outside plain ASCII is a mistake.
  if (/[^ -~]/.test(json)) fail('the plan must be plain ASCII.');
  const script = `(function(){${compiled.trim()};__wfs.firstScreenBoot(/*plan:*/${json}/*:plan*/,window)})()`;
  // The page's own checks read index.html as text; nothing in the script may look like markup to them.
  if (/<\/script|<!--|<link\b|<meta\b/i.test(script)) fail('the boot script must not contain markup.');
  return html.replace(FIRST_SCREEN_MARKER, () => `<script>${script}</script>`);
}
