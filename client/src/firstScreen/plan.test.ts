import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import exploreRouteSource from '../pages/ExploreRoute.tsx?raw';
import type { FirstScreenExtras } from './boot';
import { FIRST_SCREEN_MARKER, buildPlan, firstScreenExtras, inlineBoot, parseRoutes, type FirstScreenChunk, type FirstScreenRoute } from './plan';

const pageFiles = Object.keys(import.meta.glob('../pages/*.tsx')).map(file => file.replace(/^.*\/([^/]+)\.tsx$/, '$1'));
const chunk = (name: string, more: Partial<FirstScreenChunk> = {}): FirstScreenChunk => ({ fileName: `assets/${name}.js`, isEntry: false, imports: [], moduleIds: [], css: [], ...more });
const page = (name: string, more: Partial<FirstScreenChunk> = {}) => chunk(name, { moduleIds: [`/work/client/src/pages/${name}.tsx`], ...more });

describe('the route table read out of App.tsx', () => {
  const routes = parseRoutes(appSource);

  it('covers every route of the application, each with a page that exists', () => {
    expect(routes).toHaveLength((appSource.match(/<Route\b/g) ?? []).length - 1);
    expect(routes.length).toBeGreaterThan(30);
    for (const route of routes) for (const name of [route.page, ...(route.legacy ? [route.legacy] : [])]) expect(pageFiles).toContain(name);
    expect(routes).toContainEqual({ path: '', page: 'Home' });
    expect(routes).toContainEqual({ path: 'listings/:id', page: 'PublicListingPage' });
    expect(routes).toContainEqual({ path: 'source-leads', page: 'SourceLeadMapPage' });
    expect(routes).toContainEqual({ path: 'users/:id/storefront', page: 'SellerStorefrontPage' });
    expect(routes).toContainEqual({ path: '*', page: 'NotFound' });
  });

  it('knows the two pages /explore chooses between, as ExploreRoute really loads them', () => {
    expect(routes).toContainEqual({ path: 'explore', page: 'ExploreDiscoveryPage', legacy: 'ExplorePage' });
    expect(exploreRouteSource).toContain("createLazyPage(() => import('./ExploreDiscoveryPage'))");
    expect(exploreRouteSource).toContain("createLazyPage(() => import('./ExplorePage'))");
    // A static import of either would put it, and for the legacy page the map library, back in front of the other.
    expect(exploreRouteSource).not.toMatch(/^import .* from '\.\/Explore(?:Discovery)?Page'/m);
  });

  it('names every route the extras are written for', () => {
    for (const path of Object.keys(firstScreenExtras)) expect(routes.map(route => route.path)).toContain(path);
  });

  const app = (routesText: string, pagesText = "const Home = createLazyPage(() => import('./pages/Home'));") =>
    `${pagesText}\n<Routes><Route path="/" element={<Layout />}>\n${routesText}\n</Route></Routes>`;

  it('refuses a route it cannot follow, so a new route cannot go without its code unnoticed', () => {
    expect(parseRoutes(app('<Route index element={<Home />} />'))).toEqual([{ path: '', page: 'Home' }]);
    expect(() => parseRoutes(app('<Route index element={<Home />} />\n<Route path="other" element={<Other />} />'))).toThrow(/<Other \/>/);
    expect(() => parseRoutes(app('<Route index element={<Home />} />\n<Route path="again" element={<Home />} />\n<Route path="again" element={<Home />} />'))).toThrow(/appears twice/);
    expect(() => parseRoutes(app('<Route index element={<Home />} />\n<Route path="files/*" element={<Home />} />'))).toThrow(/does not match/);
    expect(() => parseRoutes(app('<Route index element={<Home />} />\n<Route\n  path="wrapped"\n  element={<Home />}\n/>'))).toThrow(/3 <Route> elements but 1 were understood/);
    expect(() => parseRoutes(app('<Route index element={<Home />} />\n<Route path="guarded" element={<Guard><Home /></Guard>} />'))).toThrow(/were understood/);
    expect(() => parseRoutes(app(''))).toThrow(/were understood/);
  });
});

describe('the files each route needs', () => {
  const routes: FirstScreenRoute[] = [
    { path: 'listings/:id', page: 'Listing' }, { path: '*', page: 'NotFound' }, { path: '', page: 'Home' },
    { path: 'explore', page: 'Discovery', legacy: 'Legacy' }, { path: 'terms', page: 'Terms' },
  ];
  const chunks = [
    chunk('index', { isEntry: true, imports: ['assets/vendor.js'], css: ['assets/index.css'] }), chunk('vendor'),
    page('Home', { imports: ['assets/vendor.js', 'assets/Card.js'], css: ['assets/index.css', 'assets/Home.css'] }),
    chunk('Card', { imports: ['assets/icon.js', 'assets/vendor.js'] }), chunk('icon', { imports: ['assets/Card.js'] }),
    page('Discovery', { imports: ['assets/Card.js'], css: ['assets/Discovery.css'] }),
    page('Legacy', { imports: ['assets/map.js', 'assets/Card.js'] }), chunk('map', { css: ['assets/map.css'] }),
    page('Listing', { imports: ['assets/icon.js'] }), page('Terms'), page('NotFound'),
  ];
  const extras: Record<string, FirstScreenExtras> = {
    '': { d: ['/source-leads/summary'], i: ['/features/feature1.webp'] },
    explore: { q: ['/discovery?'] },
    'listings/:id': { d: ['/listings/:id', '/product-interest?keys=listing%3A:id'], o: ['https://tile.openstreetmap.org/7/106/53.png'] },
  };
  const plan = buildPlan(chunks, routes, extras);
  const files = (path: string) => plan.r.find(route => route[0] === path)![1].map(index => plan.a[index]);
  const extra = (path: string) => plan.x[plan.r.find(route => route[0] === path)![2]];

  it('are the page, everything it imports and their styles, without what index.html already loads', () => {
    expect(files('')).toEqual(['Home.js', 'Card.js', 'icon.js', 'Home.css']);
    expect(files('explore')).toEqual(['Discovery.js', 'Card.js', 'icon.js', 'Discovery.css']);
    expect(files('listings/:id')).toEqual(['Listing.js', 'icon.js', 'Card.js']);
    expect(files('terms')).toEqual(['Terms.js']);
    expect(plan.a).not.toContain('index.js');
    expect(plan.a).not.toContain('vendor.js');
    expect(plan.a).not.toContain('index.css');
    expect(new Set(plan.a).size).toBe(plan.a.length);
  });

  it('are tried in the router\'s order: fixed paths, then parameters, then the catch-all', () => {
    expect(plan.r.map(route => route[0])).toEqual(['', 'explore', 'terms', 'listings/:id', '*']);
  });

  it('come with the route\'s extras, and for /explore with the legacy page\'s own files', () => {
    expect(extra('')).toEqual(extras['']);
    expect(extra('listings/:id')).toEqual(extras['listings/:id']);
    expect(extra('explore').q).toEqual(['/discovery?']);
    expect(extra('explore').l!.map(index => plan.a[index])).toEqual(['Legacy.js', 'map.js', 'Card.js', 'icon.js', 'map.css']);
    expect(plan.r.find(route => route[0] === 'terms')![2]).toBe(-1);
    expect(plan.r.find(route => route[0] === '*')![2]).toBe(-1);
    expect(plan.x).toHaveLength(3);
  });

  it('cannot be built from a bundle that does not hold the page', () => {
    expect(() => buildPlan(chunks.filter(item => item.fileName !== 'assets/Terms.js'), routes, extras)).toThrow(/src\/pages\/Terms\.tsx/);
    expect(() => buildPlan(chunks.filter(item => item.fileName !== 'assets/map.js'), routes, extras)).toThrow(/assets\/map\.js, which is not in the bundle/);
    expect(() => buildPlan(chunks.filter(item => !item.isEntry), routes, extras)).toThrow(/one entry chunk, found 0/);
    expect(() => buildPlan([...chunks, chunk('second', { isEntry: true })], routes, extras)).toThrow(/found 2/);
    expect(() => buildPlan(chunks.map(item => item.fileName === 'assets/Terms.js' ? { ...item, fileName: 'Terms.js' } : item), routes, extras)).toThrow(/unexpected file name/);
    expect(() => buildPlan(chunks.map(item => item.fileName === 'assets/Terms.js' ? { ...item, fileName: 'assets/Te"rms.js' } : item), routes, extras)).toThrow(/unexpected file name/);
  });

  it('finds a page built on Windows too', () => {
    const windows = chunks.map(item => ({ ...item, moduleIds: item.moduleIds.map(file => 'C:' + file.replace(/\//g, '\\')) }));
    expect(buildPlan(windows, routes, extras)).toEqual(plan);
  });

  it.each<[string, Record<string, FirstScreenExtras>, RegExp]>([
    ['a route that does not exist', { nowhere: { d: ['/x'] } }, /does not exist: "nowhere"/],
    ['a read on another host', { '': { d: ['https://elsewhere.example/api/x'] } }, /not a path under \/api/],
    ['a protocol-relative read', { '': { d: ['//elsewhere.example/x'] } }, /not a path under \/api/],
    ['a read the API helper would refuse', { '': { q: ['/a b'] } }, /not a path under \/api/],
    ['an identifier on a route without one', { '': { d: ['/listings/:id'] } }, /exactly one parameter/],
    ['an image from another origin among the same-origin ones', { '': { i: ['https://elsewhere.example/a.png'] } }, /not a same-origin image path/],
    ['a protocol-relative image', { '': { i: ['//elsewhere.example/a.png'] } }, /not a same-origin image path/],
    ['an insecure image address', { '': { o: ['http://tile.example/1.png'] } }, /not an https image address/],
    ['an image address with a query', { '': { o: ['https://tile.example/1.png?key=1'] } }, /not an https image address/],
    ['legacy files written by hand', { explore: { l: [1] } }, /not written by hand/],
  ])('refuses %s', (_name, wrong, message) => {
    expect(() => buildPlan(chunks, routes, wrong)).toThrow(message);
  });

  it('accepts the extras the application really ships', () => {
    const real = parseRoutes(appSource);
    const names = [...new Set(real.flatMap(route => [route.page, ...(route.legacy ? [route.legacy] : [])]))];
    const built = buildPlan([chunk('index', { isEntry: true }), ...names.map(name => page(name))], real, firstScreenExtras);
    expect(built.r).toHaveLength(real.length);
    expect(built.r.at(-1)![0]).toBe('*');
    expect(built.x.flatMap(item => [...(item.d ?? []), ...(item.q ?? [])]).sort()).toEqual(Object.values(firstScreenExtras).flatMap(item => [...(item.d ?? []), ...(item.q ?? [])]).sort());
  });
});

describe('the script put into index.html', () => {
  const html = `<head>\n  ${FIRST_SCREEN_MARKER}\n  <link rel="icon" href="/logo.png" />\n</head>`;
  const plan = { a: ['Home-a.js'], r: [['', [0], -1]] as [string, number[], number][], x: [] };

  it('replaces the marker with the compiled script and its plan, readable back out of the page', () => {
    const built = inlineBoot(html, 'var __wfs={firstScreenBoot(){}};\n', plan);
    expect(built).not.toContain(FIRST_SCREEN_MARKER);
    expect(built).toContain('<script>(function(){var __wfs={firstScreenBoot(){}};;__wfs.firstScreenBoot(/*plan:*/');
    expect(JSON.parse(built.slice(built.indexOf('/*plan:*/') + 9, built.indexOf('/*:plan*/')))).toEqual(plan);
    expect(built.indexOf('<script>')).toBeLessThan(built.indexOf('<link rel="icon"'));
  });

  it('keeps the compiled text as it is, whatever it contains', () => {
    const compiled = 'var __wfs={firstScreenBoot(){return "$&$1$$`"}}';
    expect(inlineBoot(html, compiled, plan)).toContain(compiled);
  });

  it('never lets a plan end the script early', () => {
    const built = inlineBoot(html, 'var __wfs={}', { a: ['Home-a.js'], r: [['', [0], 0]], x: [{ d: ['/x?a=</script><script>alert(1)'] }] });
    expect(built.match(/<\/script>/g)).toHaveLength(1);
    expect(built).toContain('\\u003c/script>');
    expect(JSON.parse(built.slice(built.indexOf('/*plan:*/') + 9, built.indexOf('/*:plan*/'))).x[0].d[0]).toBe('/x?a=</script><script>alert(1)');
  });

  it('refuses a page without exactly one marker, text that looks like markup, and anything outside plain ASCII', () => {
    expect(() => inlineBoot('<head></head>', 'var __wfs={}', plan)).toThrow(/exactly once/);
    expect(() => inlineBoot(html + FIRST_SCREEN_MARKER, 'var __wfs={}', plan)).toThrow(/exactly once/);
    for (const markup of ['</script>', '</SCRIPT >', '<!--', '<link rel="x">', '<meta name="x">'])
      expect(() => inlineBoot(html, 'var __wfs={};var s="' + markup + '"', plan)).toThrow(/must not contain markup/);
    expect(() => inlineBoot(html, 'var __wfs={}', { ...plan, a: ['Caf' + String.fromCharCode(233) + '.js'] })).toThrow(/plain ASCII/);
  });
});
