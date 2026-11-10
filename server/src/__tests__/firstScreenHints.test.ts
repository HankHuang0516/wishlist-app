import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createLoopbackRequest } from './integration/loopbackHttp';
import { catalogFirstPage, catalogReady } from '../lib/publicCatalog';
import { publicLeadList } from '../lib/publicLeadList';
import { exploreHints, forgetFirstScreenHints, interestRead, renderFirstScreenHints, sourceLeadHints, type FirstScreenHints } from '../lib/firstScreenHints';
import { createFirstScreenPageRoutes } from '../routes/firstScreenPageRoutes';

jest.mock('../lib/publicCatalog', () => ({ catalogReady: jest.fn(), catalogFirstPage: jest.fn() }));
jest.mock('../lib/publicLeadList', () => ({ publicLeadList: jest.fn() }));
jest.mock('../lib/mediaWarm', () => ({ warmThumbnails: jest.fn(async () => ({ considered: 0, read: 0 })) }));
const ready = catalogReady as jest.Mock, firstPage = catalogFirstPage as jest.Mock, leadList = publicLeadList as jest.Mock;

const origin = 'https://wishlist-app-production.up.railway.app/api';
const uuid = (n: number) => 'ab427730-60af-40c4-b568-' + String(n).padStart(12, '0');
const rows = (count: number) => Array.from({ length: count }, (_, n) => ({ key: (n % 2 ? 'listing:' : 'source:') + uuid(n), thumbnailUrl: n === 3 ? null : `${origin}/source-leads/${uuid(n)}/media/${uuid(n)}/thumbnail` }));
const lead = (n: number, photos = true) => ({ id: uuid(n), media: photos ? [{ imageUrl: `${origin}/source-leads/${uuid(n)}/media/${uuid(100 + n)}/image`, thumbnailUrl: `${origin}/source-leads/${uuid(n)}/media/${uuid(100 + n)}/thumbnail` }] : [] });
const template = '<head>\n  <!-- FIRST_SCREEN_HINTS -->\n  <script>boot()</script>\n</head><body><div id="root"></div></body>';

beforeEach(() => { forgetFirstScreenHints(); process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1'; ready.mockResolvedValue(true); firstPage.mockResolvedValue(rows(24)); });

describe('the explore page', () => {
  it('names the first eight thumbnails and the interest read of the whole first page, in order', async () => {
    const hints = (await exploreHints())!;
    expect(hints.route).toBe('explore');
    expect(hints.images).toEqual(rows(24).slice(0, 8).filter(row => row.thumbnailUrl).map(row => ({ url: row.thumbnailUrl })));
    expect(hints.images).toHaveLength(7);
    expect(hints.reads).toEqual([interestRead(rows(24).map(row => row.key))]);
    // The format the page's interest store uses (client/src/lib/productInterest.ts).
    expect(hints.reads[0]).toBe('/product-interest?keys=' + rows(24).map(row => row.key.replace(':', '%3A')).join('%2C'));
  });

  it('names nothing while the read model is not ready, or when it has nothing to show', async () => {
    ready.mockResolvedValue(false);
    expect(await exploreHints()).toBeNull();
    expect(firstPage).not.toHaveBeenCalled();
    ready.mockResolvedValue(true); firstPage.mockResolvedValue([]);
    expect(await exploreHints()).toBeNull();
  });

  it('leaves out an address that could not be an image of this site', async () => {
    firstPage.mockResolvedValue([{ key: 'source:' + uuid(1), thumbnailUrl: 'javascript:alert(1)' }, { key: 'source:' + uuid(2), thumbnailUrl: `${origin}/x" onload="y` }, { key: 'source:' + uuid(3), thumbnailUrl: `${origin}/ok` }]);
    expect((await exploreHints())!.images).toEqual([{ url: `${origin}/ok` }]);
  });
});

describe('the source map', () => {
  it('names the first lead\'s large photo and the first seven rows\' thumbnails, asked for without a referrer', async () => {
    leadList.mockResolvedValue({ items: [lead(0), lead(1, false), ...Array.from({ length: 9 }, (_, n) => lead(n + 2))], nextCursor: null });
    const hints = (await sourceLeadHints())!;
    expect(leadList).toHaveBeenCalledWith({ q: '', box: null, cursor: null, unlocated: false, approximate: true, presentation: true, photos: true });
    expect(hints.route).toBe('source-leads');
    expect(hints.reads).toEqual([]);
    expect(hints.images).toEqual([lead(0).media[0].imageUrl, ...[0, 2, 3, 4, 5, 6].map(n => lead(n).media[0].thumbnailUrl)].map(url => ({ url, referrerPolicy: 'no-referrer' })));
  });

  it('keeps the list for a minute, uses it up to ten minutes while reading it again, and then waits for a new one', async () => {
    leadList.mockResolvedValue({ items: [lead(0)], nextCursor: null });
    const start = Date.now();
    const first = await sourceLeadHints(start);
    expect(leadList).toHaveBeenCalledTimes(1);
    expect(await sourceLeadHints(start + 59_000)).toEqual(first);
    expect(leadList).toHaveBeenCalledTimes(1);
    leadList.mockResolvedValue({ items: [lead(5)], nextCursor: null });
    // Older than a minute: the kept copy answers at once and a new read starts behind it.
    expect(await sourceLeadHints(start + 61_000)).toEqual(first);
    expect(leadList).toHaveBeenCalledTimes(2);
    await new Promise(resolve => setImmediate(resolve));
    const fresh = await sourceLeadHints(Date.now());
    expect(fresh!.images[0].url).toBe(lead(5).media[0].imageUrl);
    // Past ten minutes the old copy is not used: the request waits for the new read.
    leadList.mockResolvedValue({ items: [lead(7)], nextCursor: null });
    expect((await sourceLeadHints(Date.now() + 11 * 60_000))!.images[0].url).toBe(lead(7).media[0].imageUrl);
  });

  it('names nothing while public sources are switched off, without photos, or when the read fails', async () => {
    process.env.SOURCE_LEADS_PUBLIC_ENABLED = '0';
    expect(await sourceLeadHints()).toBeNull();
    expect(leadList).not.toHaveBeenCalled();
    forgetFirstScreenHints(); process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1';
    leadList.mockResolvedValue({ items: [lead(0, false)], nextCursor: null });
    expect(await sourceLeadHints()).toBeNull();
    forgetFirstScreenHints(); leadList.mockRejectedValue(new Error('database unavailable'));
    expect(await sourceLeadHints()).toBeNull();
  });
});

describe('the HTML', () => {
  const hints: FirstScreenHints = { route: 'explore', images: [{ url: `${origin}/a/thumbnail` }, { url: `${origin}/b/image`, referrerPolicy: 'no-referrer' }], reads: ['/product-interest?keys=source%3Aa'] };

  it('carries the pictures as preload links and the reads as data, in place of the marker and before the boot script', () => {
    const html = renderFirstScreenHints(template, hints)!;
    expect(html).not.toContain('FIRST_SCREEN_HINTS');
    expect(html).toContain(`<link rel="preload" as="image" href="${origin}/a/thumbnail" />`);
    expect(html).toContain(`<link rel="preload" as="image" href="${origin}/b/image" referrerpolicy="no-referrer" />`);
    expect(html).toContain('<script type="application/json" id="wishlist-first-screen">{"r":"explore","d":["/product-interest?keys=source%3Aa"]}</script>');
    expect(html.indexOf('wishlist-first-screen')).toBeLessThan(html.indexOf('boot()'));
  });

  it('cannot be broken out of by what it carries', () => {
    const html = renderFirstScreenHints(template, { route: 'explore</script><script>alert(1)', images: [{ url: `${origin}/a"><script>` }], reads: ['/product-interest?keys=a</script>'] })!;
    expect(html).toBeNull();
    const route = renderFirstScreenHints(template, { route: 'explore</script><script>alert(1)', images: [], reads: ['/product-interest?keys=a'] })!;
    expect(route.match(/<\/script>/g)).toHaveLength(2);
    expect(route).toContain('explore\\u003c/script>\\u003cscript>alert(1)');
  });

  it('is left alone without exactly one marker, or with nothing to name', () => {
    expect(renderFirstScreenHints('<head></head>', hints)).toBeNull();
    expect(renderFirstScreenHints(template + '<!-- FIRST_SCREEN_HINTS -->', hints)).toBeNull();
    expect(renderFirstScreenHints(template, { route: 'explore', images: [], reads: [] })).toBeNull();
  });
});

describe('the page route', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'first-screen-')), index = path.join(folder, 'index.html');
  fs.writeFileSync(index, template);
  afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));
  const hinter = jest.fn<Promise<FirstScreenHints | null>, []>();
  const app = express();
  app.use(createFirstScreenPageRoutes(index, { '/explore': hinter }, 50));
  app.get('/{*splat}', (_req, res) => { res.set('X-Fallback', 'yes').type('html').send(template); });
  const http = createLoopbackRequest(app);
  const named: FirstScreenHints = { route: 'explore', images: [{ url: `${origin}/a/thumbnail` }], reads: ['/product-interest?keys=source%3Aa'] };

  it('serves the plain address with its hints, not kept by any cache', async () => {
    hinter.mockResolvedValue(named);
    const response = await http.get('/explore');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.text).toContain(`<link rel="preload" as="image" href="${origin}/a/thumbnail" />`);
    expect(response.headers['x-fallback']).toBeUndefined();
  });

  it.each([
    ['an address with a query', '/explore?q=mac', () => hinter.mockResolvedValue(named)],
    ['hints that are not ready in time', '/explore', () => hinter.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(named), 500)))],
    ['hints that fail', '/explore', () => hinter.mockRejectedValue(new Error('database unavailable'))],
    ['no hints', '/explore', () => hinter.mockResolvedValue(null)],
  ])('serves the ordinary page for %s', async (_name, address, arrange) => {
    arrange();
    const response = await http.get(address);
    expect(response.status).toBe(200);
    expect(response.headers['x-fallback']).toBe('yes');
    expect(response.text).not.toContain('rel="preload"');
  });

  it('never asks for hints for an address with a query or a HEAD request', async () => {
    await http.get('/explore?view=source-leads');
    await http.head('/explore');
    expect(hinter).not.toHaveBeenCalled();
  });
});
