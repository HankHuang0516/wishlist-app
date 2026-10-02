import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { makeListing, makeWish, responseOk } from '../__tests__/fixtures/marketplace';
import type { Bounds } from '../lib/listingSearch';
import { StrictMode } from 'react';
import ExplorePage from './ExplorePage';

vi.mock('../components/ExploreMapWeb', () => ({ default: (props: { onViewport: (bounds: Bounds) => void }) =>
  <button onClick={() => props.onViewport([121.5, 25, 121.6, 25.1])}>Move fixture map</button> }));
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture', isAuthenticated: true, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() };
const view = () => <MemoryRouter><AuthContext.Provider value={auth}><ExplorePage /></AuthContext.Provider></MemoryRouter>;
const limited = (seconds: number, code = 'RATE_LIMIT_EXCEEDED') => ({ ok: false, status: 429,
  headers: new Headers({ 'Retry-After': String(seconds) }), json: async () => ({ error: 'private limiter diagnostic', errorCode: code }) });
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
let locale: string | null;
beforeEach(() => {
  locale = localStorage.getItem('user-locale'); localStorage.setItem('user-locale', 'zh-TW');
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }); vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (locale === null) localStorage.removeItem('user-locale'); else localStorage.setItem('user-locale', locale);
});

describe('explicit recovery from transport limiting in Explore', () => {
  it('honours the longest parallel wait, preserves manual area and filters, and never searches automatically', async () => {
    const item = makeListing(); let fail = true;
    const fetch = vi.fn(async (url: string) => url.includes('match-wishes') ? responseOk({ items: [], nextCursor: null })
      : fail ? limited(url.includes('external-listings') ? 5 : 2)
        : responseOk(url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null }));
    vi.stubGlobal('fetch', fetch); await act(async () => { render(view()); });
    expect(screen.getByRole('status', { name: '搜尋等待時間' })).toHaveTextContent('5 秒');
    expect(screen.queryByText('private limiter diagnostic')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('過濾與願望交叉比對（選用）'));
    for (const name of ['搜尋', '搜尋此範圍', '擴大搜尋範圍', '套用條件', '清除條件', '重新搜尋'])
      for (const button of screen.getAllByRole('button', { name, exact: true })) expect(button).toBeDisabled();
    const before = fetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText('商品關鍵字'), { target: { value: '漫畫新條件' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move fixture map' })); fireEvent.click(screen.getByRole('button', { name: '商品列表' }));
    await advance(4000); expect(screen.getByRole('button', { name: '搜尋', exact: true })).toBeDisabled();
    await advance(1000); expect(screen.getByRole('button', { name: '搜尋', exact: true })).toBeEnabled();
    expect(screen.getByRole('status', { name: '搜尋等待時間' })).toHaveTextContent('等待已結束');
    expect(fetch.mock.calls).toHaveLength(before); fail = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '搜尋此範圍' })); });
    expect(screen.getByRole('button', { name: `查看${item.title}商品詳情` })).toBeEnabled();
    const path = new URL(fetch.mock.calls.filter(([url]) => url.includes('/listings?')).at(-1)![0]);
    expect(path.searchParams.get('q')).toBe('漫畫新條件'); expect(path.searchParams.get('bbox')).toBe('121.5,25,121.6,25.1');
    expect(fetch.mock.calls.length).toBe(before + 2); expect(screen.queryByRole('status', { name: '搜尋等待時間' })).not.toBeInTheDocument();
  });

  it('retains loaded products and the same cursor when a later page is limited, then retries only that page', async () => {
    const first = makeListing('First retained item'), second = makeListing('Second item'); let fail = true;
    const fetch = vi.fn(async (url: string) => url.includes('match-wishes') ? responseOk({ items: [], nextCursor: null })
      : url.includes('external-listings') ? responseOk({ enabled: false, items: [], nextCursor: null })
        : new URL(url).searchParams.has('cursor') ? fail ? limited(3) : responseOk({ items: [second], nextCursor: null })
          : responseOk({ items: [first], nextCursor: first.id }));
    vi.stubGlobal('fetch', fetch); await act(async () => { render(view()); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '載入更多站內商品' })); });
    expect(screen.getByRole('button', { name: `查看${first.title}商品詳情` })).toBeDisabled();
    expect(screen.getByRole('img', { name: first.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '載入更多站內商品' })).toBeDisabled();
    const before = fetch.mock.calls.length; await advance(3000); expect(fetch.mock.calls).toHaveLength(before); fail = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '載入更多站內商品' })); });
    fireEvent.click(screen.getByRole('button', { name: '商品列表' }));
    expect(screen.getByRole('button', { name: `查看${first.title}商品詳情` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `查看${second.title}商品詳情` })).toBeInTheDocument();
    const attempts = fetch.mock.calls.filter(([url]) => new URL(url).searchParams.has('cursor'));
    expect(attempts).toHaveLength(2); expect(attempts.map(([url]) => new URL(url).searchParams.get('cursor'))).toEqual([first.id, first.id]);
    expect(fetch.mock.calls.length).toBe(before + 1);
  });

  it('shows a bounded English wait for failed details and explicitly reads the same product after it ends', async () => {
    localStorage.setItem('user-locale', 'en-US'); const item = makeListing(); let fail = true;
    const fetch = vi.fn(async (url: string) => url.endsWith('/listings/' + item.id) ? fail ? limited(2) : responseOk(item)
      : responseOk(url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings')
        ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null }));
    vi.stubGlobal('fetch', fetch); await act(async () => { render(view()); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `View item details: ${item.title}` })); });
    const dialog = screen.getByRole('dialog', { name: 'Item details' });
    expect(within(dialog).getByRole('button', { name: 'Check this item again' })).toBeDisabled();
    expect(within(dialog).getByRole('status', { name: 'Search wait time' })).toHaveTextContent('2 seconds');
    expect(within(dialog).queryByRole('heading', { name: item.title })).not.toBeInTheDocument();
    const before = fetch.mock.calls.length; await advance(2000); expect(fetch.mock.calls).toHaveLength(before); fail = false;
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Check this item again' })); });
    expect(within(dialog).getByRole('heading', { name: item.title })).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/listings/' + item.id))).toHaveLength(2);
    expect(fetch.mock.calls.length).toBe(before + 1);
  });

  it('can explicitly recover the wish menu without losing entered search text or replaying item queries', async () => {
    const wish = makeWish(814); let fail = true;
    const fetch = vi.fn(async (url: string) => url.includes('match-wishes') ? fail ? limited(2) : responseOk({ items: [wish], nextCursor: null })
      : responseOk(url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetch); await act(async () => { render(view()); });
    expect(screen.getByRole('button', { name: '重新讀取願望選單' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('商品關鍵字'), { target: { value: '保留搜尋草稿' } });
    const before = fetch.mock.calls.length; await advance(2000); expect(fetch.mock.calls).toHaveLength(before); fail = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重新讀取願望選單' })); });
    expect(screen.getByLabelText('商品關鍵字')).toHaveValue('保留搜尋草稿');
    fireEvent.click(screen.getByText('過濾與願望交叉比對（選用）'));
    expect(screen.getByRole('option', { name: `${wish.name} · ${wish.wishlist.title}` })).toHaveValue('814');
    expect(fetch.mock.calls.length).toBe(before + 1); expect(screen.queryByRole('button', { name: '重新讀取願望選單' })).not.toBeInTheDocument();
  });

  it('does not present a transport countdown for route-specific 429 responses without a transport deadline', async () => {
    const fetch = vi.fn(async (url: string) => url.includes('match-wishes') ? responseOk({ items: [], nextCursor: null }) : limited(5, 'PRODUCT_CAPACITY'));
    vi.stubGlobal('fetch', fetch); await act(async () => { render(view()); });
    expect(screen.getAllByRole('alert')).toHaveLength(2); expect(screen.queryByRole('status', { name: '搜尋等待時間' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '搜尋', exact: true })).toBeEnabled();
    expect(screen.queryAllByText(/依畫面等待提示/)).toHaveLength(0);
  });

  it('restores the wish read after StrictMode aborts the first effect instead of leaving its synchronous gate locked', async () => {
    const wish = makeWish(814), fetch = vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [wish], nextCursor: null }
      : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetch); await act(async () => { render(<StrictMode>{view()}</StrictMode>); });
    fireEvent.click(screen.getByText('過濾與願望交叉比對（選用）'));
    expect(screen.getByRole('option', { name: `${wish.name} · ${wish.wishlist.title}` })).toHaveValue('814');
    const reads = fetch.mock.calls.filter(([url]) => url.includes('match-wishes'));
    expect(reads).toHaveLength(2); expect(screen.queryByRole('button', { name: '重新讀取願望選單' })).not.toBeInTheDocument();
  });
});
