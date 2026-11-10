import { describe, expect, it, vi } from 'vitest';
import { firstScreenBoot, isLegacyExplore, type FirstScreenEnv, type FirstScreenLink, type FirstScreenPlan } from './boot';

const id = '9ebe73c9-c536-4d3e-9ae5-1c78eb0afc51';
const plan: FirstScreenPlan = {
  a: ['Home-a.js', 'Card-b.js', 'Explore-c.js', 'Explore-c.css', 'Legacy-d.js', 'Map-e.js', 'Map-e.css', 'Listing-f.js', 'Terms-g.js', 'NotFound-h.js', 'Store-i.js', 'Leads-j.js'],
  r: [
    ['', [0, 1], 0],
    ['explore', [2, 3, 1], 1],
    ['terms', [8], -1],
    ['source-leads', [11], 3],
    ['users/:id/storefront', [10], -1],
    ['listings/:id', [7], 2],
    ['*', [9], -1],
  ],
  x: [
    { d: ['/source-leads/summary'], i: ['/features/feature1.webp', '/features/feature2.webp'] },
    { q: ['/discovery?'], g: ['/source-leads/summary'], l: [4, 5, 6] },
    { d: ['/listings/:id', '/product-interest?keys=listing%3A:id'] },
    { d: ['/source-leads/map'], o: ['https://tiles.example/7/106/53.png'] },
  ],
};
const tombstone = JSON.stringify({ version: 1, api: 'https://wishlist.test/api', token: null, user: null });
const session = JSON.stringify({ version: 1, api: 'https://wishlist.test/api', token: 'synthetic', user: { id: 7 } });

type Visit = { stored?: Record<string, string>; storage?: 'denied'; modulepreload?: boolean; timeout?: boolean; search?: string; fetch?: () => Promise<unknown>; create?: () => FirstScreenLink };
function visit(address: string, options: Visit = {}) {
  const url = new URL(address, 'https://wishlist.test'), links: FirstScreenLink[] = [];
  const fetch = vi.fn<FirstScreenEnv['fetch']>(() => options.fetch ? options.fetch() : new Promise<unknown>(() => undefined));
  const env: FirstScreenEnv = {
    location: { pathname: url.pathname, search: options.search ?? url.search },
    document: {
      createElement: options.create ?? (() => ({ rel: '', as: '', href: '', crossOrigin: null, referrerPolicy: '', relList: { supports: token => token === 'modulepreload' && options.modulepreload !== false } })),
      head: { appendChild: link => links.push(link) },
    },
    localStorage: { getItem: key => { if (options.storage) throw new Error('denied'); return options.stored?.[key] ?? null; } },
    fetch,
    ...(options.timeout === false ? {} : { AbortSignal: { timeout: (milliseconds: number) => 'after ' + milliseconds } }),
  };
  firstScreenBoot(plan, env);
  const code = links.filter(link => link.as !== 'image').map(link => link.href), images = links.filter(link => link.as === 'image');
  return { env, links, code, images, fetch, reads: fetch.mock.calls.map(call => call[0]) };
}

describe('the page\'s code, asked for alongside the main bundle', () => {
  it('names every file of the route the way the bundler\'s own loader would', () => {
    const { links, fetch, env } = visit('/explore?q=mac');
    expect(links).toEqual([
      { rel: 'modulepreload', as: 'script', crossOrigin: '', href: '/assets/Explore-c.js', referrerPolicy: '', relList: expect.anything() },
      { rel: 'preload', as: 'style', crossOrigin: '', href: '/assets/Explore-c.css', referrerPolicy: '', relList: expect.anything() },
      { rel: 'modulepreload', as: 'script', crossOrigin: '', href: '/assets/Card-b.js', referrerPolicy: '', relList: expect.anything() },
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(env.__wishlistFirstScreen).toBeUndefined();
  });

  it('falls back to a plain preload where module preloading is not supported', () => {
    expect(visit('/terms', { modulepreload: false }).links).toMatchObject([{ rel: 'preload', as: 'script', crossOrigin: '', href: '/assets/Terms-g.js' }]);
    expect(visit('/terms', { create: () => ({ rel: '', as: '', href: '', crossOrigin: null, referrerPolicy: '' }) }).links).toMatchObject([{ rel: 'preload', as: 'script' }]);
  });

  it.each([
    ['/', ['Home-a.js', 'Card-b.js']],
    ['/terms', ['Terms-g.js']],
    ['/terms/', ['Terms-g.js']],
    ['/TERMS', ['Terms-g.js']],
    ['/users/35/storefront', ['Store-i.js']],
    ['/users/35', ['NotFound-h.js']],
    ['/terms/extra', ['NotFound-h.js']],
    ['/listings/not-an-id', ['Listing-f.js']],
  ])('%s gets the code of its own route', (address, files) => {
    expect(visit(address).code).toEqual(files.map(file => '/assets/' + file));
  });

  it('fetches the legacy explore page for the addresses that still show it, and nothing of the other page', () => {
    for (const address of ['/explore?view=source-leads&source=' + id, '/explore?wish=3', '/explore?source=' + id, '/explore?bbox=1,2,3,4']) {
      const legacy = visit(address);
      expect(legacy.code).toEqual(['/assets/Legacy-d.js', '/assets/Map-e.js', '/assets/Map-e.css']);
      expect(legacy.links.map(link => link.rel + ':' + link.as)).toEqual(['modulepreload:script', 'modulepreload:script', 'preload:style']);
    }
    for (const address of ['/explore', '/explore?q=mac', '/explore?source=listing', '/explore?main=electronics&sub=monitors&source=source'])
      expect(visit(address).code).toEqual(['/assets/Explore-c.js', '/assets/Explore-c.css', '/assets/Card-b.js']);
  });

  it('agrees with the application about which explore addresses are legacy ones', () => {
    for (const search of ['?view=map', '?scope=mine', '?bbox=1,2,3,4', '?wish=1', '?wishItemId=2', '?listing=' + id, '?external=' + id, '?brand=Sony', '?category=electronics', '?delivery=SHIPPING', '?minPrice=10', '?maxPrice=20', '?radius=5', '?source=' + id])
      expect(isLegacyExplore(search)).toBe(true);
    for (const search of ['', '?', '?q=mac', '?source=all', '?source=listing', '?source=source', '?source=external', '?main=electronics&sub=monitors', '?mode=map', '?feed=cp'])
      expect(isLegacyExplore(search)).toBe(false);
  });
});

describe('the public reads of a visitor who is not signed in', () => {
  it('are sent exactly as the page sends them, and kept under the address asked for', () => {
    const { fetch, env } = visit('/');
    expect(fetch.mock.calls).toEqual([['/api/source-leads/summary', { cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: 'after 30000' }]]);
    const kept = env.__wishlistFirstScreen!;
    expect(Object.keys(kept.d)).toEqual(['/api/source-leads/summary']);
    expect(kept.d['/api/source-leads/summary']).toBe(fetch.mock.results[0].value);
    expect(Math.abs(Date.now() - kept.t)).toBeLessThan(5000);
  });

  it('do without a time limit where the browser has none to offer', () => {
    expect(visit('/', { timeout: false }).fetch.mock.calls[0][1]).toEqual({ cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, redirect: 'error' });
  });

  it.each([
    ['nothing stored', undefined, true],
    ['a signed-out record', { 'wishlist.auth.session.v1': tombstone }, true],
    ['a session', { 'wishlist.auth.session.v1': session }, false],
    ['a record with a token but no user', { 'wishlist.auth.session.v1': JSON.stringify({ token: 'synthetic', user: null }) }, false],
    ['a record with a user but no token', { 'wishlist.auth.session.v1': JSON.stringify({ token: null, user: { id: 7 } }) }, false],
    ['a record that cannot be read', { 'wishlist.auth.session.v1': '{' }, false],
    ['a record that is not an object', { 'wishlist.auth.session.v1': 'null' }, false],
    ['a record that is a list', { 'wishlist.auth.session.v1': '[]' }, false],
    ['a token from the earlier storage format', { token: 'synthetic' }, false],
    ['a user from the earlier storage format', { user: '{"id":7}' }, false],
  ])('%s', (_name, stored, guest) => {
    const { reads, images, code, env } = visit('/', { stored });
    expect(reads).toEqual(guest ? ['/api/source-leads/summary'] : []);
    expect(images.map(link => link.href)).toEqual(guest ? ['/features/feature1.webp', '/features/feature2.webp'] : []);
    expect(!!env.__wishlistFirstScreen).toBe(guest);
    expect(code).toEqual(['/assets/Home-a.js', '/assets/Card-b.js']);
  });

  it('are not sent when the browser will not say who is signed in', () => {
    const { reads, images, code } = visit('/', { storage: 'denied' });
    expect(reads).toEqual([]);
    expect(images).toEqual([]);
    expect(code).toEqual(['/assets/Home-a.js', '/assets/Card-b.js']);
  });

  it('carry the identifier from the address only when it is one', () => {
    expect(visit('/listings/' + id).reads).toEqual(['/api/listings/' + id, '/api/product-interest?keys=listing%3A' + id]);
    for (const address of ['/listings/' + id.toUpperCase(), '/listings/42', '/listings/' + id + '%2F..', '/listings/' + id + '&x=1', '/listings/' + id.slice(1)]) {
      const odd = visit(address);
      expect(odd.reads).toEqual([]);
      expect(odd.env.__wishlistFirstScreen).toBeUndefined();
      expect(odd.code).toEqual(['/assets/Listing-f.js']);
    }
  });

  it('include the explore catalogue only for the plain address, whose request is known in advance', () => {
    expect(visit('/explore').reads).toEqual(['/api/discovery?']);
    expect(visit('/explore', { search: '?' }).reads).toEqual(['/api/discovery?']);
    for (const address of ['/explore?q=mac', '/explore?sort=price-asc', '/explore?source=listing']) expect(visit(address).reads).toEqual([]);
  });

  it('are the legacy explore page\'s own for a legacy address, whatever its query', () => {
    for (const address of ['/explore?view=source-leads&source=' + id, '/explore?wish=1', '/explore?bbox=1,2,3,4&q=mac'])
      expect(visit(address).reads).toEqual(['/api/source-leads/summary']);
    expect(visit('/explore?wish=1', { stored: { 'wishlist.auth.session.v1': session } }).reads).toEqual([]);
  });
});

describe('the first images', () => {
  it('of the landing page are asked for only when the landing page will be shown', () => {
    expect(visit('/').images).toMatchObject([
      { rel: 'preload', as: 'image', href: '/features/feature1.webp', crossOrigin: null, referrerPolicy: '' },
      { rel: 'preload', as: 'image', href: '/features/feature2.webp', crossOrigin: null, referrerPolicy: '' },
    ]);
    expect(visit('/', { stored: { 'wishlist.auth.session.v1': session } }).images).toEqual([]);
  });

  it('from another origin are asked for the way their <img> will ask, whoever is visiting', () => {
    const tile = { rel: 'preload', as: 'image', href: 'https://tiles.example/7/106/53.png', crossOrigin: null, referrerPolicy: 'origin' };
    expect(visit('/source-leads').images).toMatchObject([tile]);
    expect(visit('/source-leads', { stored: { 'wishlist.auth.session.v1': session } }).images).toMatchObject([tile]);
    expect(visit('/source-leads', { stored: { 'wishlist.auth.session.v1': session } }).reads).toEqual([]);
  });
});

describe('a failure', () => {
  it('to send a read leaves the code and images on their way', () => {
    const { code, images, env } = visit('/', { fetch: () => { throw new Error('blocked'); } });
    expect(env.__wishlistFirstScreen).toBeUndefined();
    expect(code).toEqual(['/assets/Home-a.js', '/assets/Card-b.js']);
    expect(images).toHaveLength(2);
  });

  it('of a read that was sent is left for the page to find', async () => {
    const { env } = visit('/', { fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(env.__wishlistFirstScreen!.d['/api/source-leads/summary']).rejects.toThrow('Failed to fetch');
  });

  it('to add a link never reaches the page', () => {
    const blocked = visit('/', { create: () => { throw new Error('blocked'); } });
    expect(blocked.links).toEqual([]);
    expect(blocked.reads).toEqual(['/api/source-leads/summary']);
  });

  it('to recognise the address does nothing at all', () => {
    const none = vi.fn();
    firstScreenBoot({ a: [], r: [], x: [] }, { location: { pathname: '/', search: '' }, document: { createElement: none, head: { appendChild: none } }, localStorage: { getItem: none }, fetch: none });
    expect(none).not.toHaveBeenCalled();
    expect(() => firstScreenBoot(plan, {} as FirstScreenEnv)).not.toThrow();
  });
});
