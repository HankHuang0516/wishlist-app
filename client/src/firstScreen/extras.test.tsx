/* What the boot script asks for ahead of a page has to be what that page asks for as it appears: a read the page
 * does not make is a wasted request, and one it makes that the script left out is a round trip a first visit pays
 * again. Each page is shown here to a visitor who is not signed in, and what it really sends is compared with what
 * firstScreenBoot sends for the same address, from the same list (plan.ts) the build puts into index.html.
 */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import appSource from '../App.tsx?raw';
import { AuthContext } from '../context/AuthContext';
import { ProductInterestProvider } from '../components/ProductInterest';
import Home from '../pages/Home';
import ExploreDiscoveryPage from '../pages/ExploreDiscoveryPage';
import ExplorePage from '../pages/ExplorePage';
import PublicListingPage from '../pages/PublicListingPage';
import SourceLeadMapPage from '../pages/SourceLeadMapPage';
import { makeListing, responseOk } from '../__tests__/fixtures/marketplace';
import { firstScreenBoot, type FirstScreenEnv, type FirstScreenLink } from './boot';
import { buildPlan, firstScreenExtras, parseRoutes, type FirstScreenChunk } from './plan';

// The legacy explore page imports the map library; a visitor who is not signed in never gets as far as the map.
vi.mock('../components/ExploreMapWeb', () => ({ default: () => null }));

// The real route table and the real extras; only the bundle is made up, one file per page.
const routes = parseRoutes(appSource);
const names = [...new Set(routes.flatMap(route => [route.page, ...(route.legacy ? [route.legacy] : [])]))];
const chunks: FirstScreenChunk[] = [
  { fileName: 'assets/index.js', isEntry: true, imports: [], moduleIds: ['/work/client/src/main.tsx'], css: [] },
  ...names.map(name => ({ fileName: `assets/${name}.js`, isEntry: false, imports: [], moduleIds: [`/work/client/src/pages/${name}.tsx`], css: [] })),
];
const plan = buildPlan(chunks, routes, firstScreenExtras);

type Read = { path: string; init: unknown };
const inOrder = (reads: Read[]) => [...reads].sort((a, b) => a.path.localeCompare(b.path));

/** What the boot script sends and preloads for an address, for a browser with nobody signed in. */
function ahead(address: string) {
  const url = new URL(address, 'https://wishlist.test'), links: FirstScreenLink[] = [];
  const sent = vi.fn<FirstScreenEnv['fetch']>(() => new Promise<unknown>(() => undefined));
  const env: FirstScreenEnv = {
    location: { pathname: url.pathname, search: url.search },
    document: { createElement: () => ({ rel: '', as: '', href: '', crossOrigin: null, referrerPolicy: '' }), head: { appendChild: link => links.push(link) } },
    localStorage: { getItem: () => null },
    fetch: sent,
  };
  firstScreenBoot(plan, env);
  return {
    reads: inOrder(sent.mock.calls.map(([target, init]) => ({ path: target.replace(/^\/api/, ''), init }))),
    images: links.filter(link => link.as === 'image'),
    code: links.filter(link => link.as !== 'image').map(link => link.href),
  };
}

/** What the page itself sent: the path under the API, and how. The time limit is the one thing each side sets alone. */
function asked(fetcher: { mock: { calls: unknown[][] } }): Read[] {
  return inOrder(fetcher.mock.calls.map(([target, init]) => {
    const { signal, ...rest } = init as RequestInit;
    expect(signal).toBeInstanceOf(AbortSignal);
    return { path: String(target).replace(/^.*?\/api(?=\/)/, ''), init: rest };
  }));
}

const anonymous = { token: null, user: null, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: false };
const show = (address: string, pattern: string, page: ReactNode) => render(
  <MemoryRouter initialEntries={[address]}><AuthContext.Provider value={anonymous}><ProductInterestProvider>
    <Routes><Route path={pattern} element={page} /></Routes>
  </ProductInterestProvider></AuthContext.Provider></MemoryRouter>);
const unanswered = () => vi.fn<typeof fetch>(() => new Promise<never>(() => undefined));

beforeEach(() => { localStorage.clear(); localStorage.setItem('user-locale', 'zh-TW'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

describe('what the boot script sends ahead is what the page sends', () => {
  it('on the landing page, with the pictures it shows', () => {
    const fetcher = unanswered(); vi.stubGlobal('fetch', fetcher);
    const { container } = show('/', '/', <Home />);
    const early = ahead('/');
    expect(early.reads).toHaveLength(1);
    expect(asked(fetcher)).toEqual(early.reads);
    expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(early.images.map(link => link.href));
    expect(early.images.every(link => link.rel === 'preload' && link.crossOrigin === null && link.referrerPolicy === '')).toBe(true);
    for (const image of container.querySelectorAll('img')) expect(image.hasAttribute('crossorigin') || image.hasAttribute('referrerpolicy')).toBe(false);
    expect(early.code).toEqual(['/assets/Home.js']);
  });

  it('on the plain explore address, and nothing for an address whose request it cannot know', () => {
    const fetcher = unanswered(); vi.stubGlobal('fetch', fetcher);
    show('/explore', '/explore', <ExploreDiscoveryPage />);
    const early = ahead('/explore');
    expect(early.reads).toHaveLength(1);
    expect(asked(fetcher)).toEqual(early.reads);
    expect(early.code).toEqual(['/assets/ExploreDiscoveryPage.js']);
    expect(ahead('/explore?q=mac').reads).toEqual([]);
    expect(ahead('/explore?q=mac').code).toEqual(['/assets/ExploreDiscoveryPage.js']);
  });

  it('on a legacy explore address, which shows a visitor who is not signed in only the public source count', () => {
    for (const address of ['/explore?view=source-leads&source=b5abf861-a66d-4072-876b-4f0ab3172dac', '/explore?wish=3', '/explore?listing=b5abf861-a66d-4072-876b-4f0ab3172dac']) {
      const fetcher = unanswered(); vi.stubGlobal('fetch', fetcher);
      show(address, '/explore', <ExplorePage />);
      const early = ahead(address);
      expect(early.reads).toHaveLength(1);
      expect(asked(fetcher)).toEqual(early.reads);
      expect(early.code).toEqual(['/assets/ExplorePage.js']);
      cleanup(); vi.unstubAllGlobals();
    }
  });

  it('on a listing, whose three reads leave together instead of one after another', async () => {
    const id = 'b5abf861-a66d-4072-876b-4f0ab3172dac', listing = { ...makeListing('二手檯燈'), id, version: 3 };
    // Only the listing itself is answered: the other two reads start once the page has it.
    const fetcher = vi.fn<(target: string, init?: RequestInit) => Promise<unknown>>(async target => new URL(target, 'https://wishlist.test').pathname.endsWith('/listings/' + id) ? responseOk(listing) : new Promise<never>(() => undefined));
    vi.stubGlobal('fetch', fetcher);
    show('/listings/' + id, '/listings/:id', <PublicListingPage />);
    const early = ahead('/listings/' + id);
    expect(early.reads).toHaveLength(3);
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(asked(fetcher)).toEqual(early.reads);
    expect(early.code).toEqual(['/assets/PublicListingPage.js']);
  });

  it('on the source map, with the tiles under its points', () => {
    const fetcher = unanswered(); vi.stubGlobal('fetch', fetcher);
    const { container } = show('/source-leads', '/source-leads', <SourceLeadMapPage />);
    const early = ahead('/source-leads');
    expect(early.reads).toHaveLength(2);
    expect(asked(fetcher)).toEqual(early.reads);
    const tiles = [...container.querySelectorAll('img')].filter(image => image.src.startsWith('https://tile.openstreetmap.org/'));
    expect(tiles.map(image => image.src).sort()).toEqual(early.images.map(link => link.href).sort());
    // A preloaded picture is only reused by an <img> that asks for it the same way.
    expect(tiles.every(image => image.getAttribute('referrerpolicy') === 'origin' && !image.hasAttribute('crossorigin'))).toBe(true);
    expect(early.images.every(link => link.referrerPolicy === 'origin' && link.crossOrigin === null)).toBe(true);
  });

  it('and every route with reads or pictures of its own is covered above', () => {
    expect(Object.keys(firstScreenExtras).sort()).toEqual(['', 'explore', 'listings/:id', 'source-leads']);
  });
});
