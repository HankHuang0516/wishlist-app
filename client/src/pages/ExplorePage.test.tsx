import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { makeListing, makeMatch, makeMatchPage, makeWish, makeExternalListing, responseOk } from '../__tests__/fixtures/marketplace';
import type { Bounds } from '../lib/listingSearch';
import ExplorePage from './ExplorePage';

vi.mock('../components/ExploreMapWeb', () => ({ default: (props: { items: { id: string }[]; frame: unknown; onViewport: (box: Bounds) => void; onCluster: (kind: string, ids: string[]) => void }) =>
  <div><output data-testid="map-frame">{JSON.stringify(props.frame)}</output><button type="button" onClick={() => props.onViewport([121.5, 25, 121.6, 25.1])}>模擬移動地圖</button><button type="button" onClick={() => props.onCluster('seller', props.items.slice(0, 1).map(item => item.id))}>模擬群聚點擊</button></div> }));
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture', isAuthenticated: true, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() };
const view = (path = '/explore', value = auth) => <MemoryRouter initialEntries={[path]}><AuthContext.Provider value={value}><ExplorePage /></AuthContext.Provider></MemoryRouter>;
let originalLocale: string | null;
beforeEach(() => { originalLocale = localStorage.getItem('user-locale'); localStorage.setItem('user-locale', 'zh-TW'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalLocale === null) localStorage.removeItem('user-locale'); else localStorage.setItem('user-locale', originalLocale);
});
describe('APP-equivalent map and list exploration', () => {
  it('applies the homepage search to the input and actual seller query on first read', async () => {
    const fetch = vi.fn(async () => responseOk({ items: [], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view('/explore?q=' + encodeURIComponent('三國演義 & 漫畫')));
    await waitFor(() => expect(screen.getByLabelText('商品關鍵字')).toHaveValue('三國演義 & 漫畫'));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes('/listings?') && new URL(url).searchParams.get('q') === '三國演義 & 漫畫')).toBe(true));
  });
  it('requires login before requesting private wishlist matching data', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); render(view('/explore', { ...auth, token: null, user: null } as unknown as typeof auth));
    expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/login?next=%2Fexplore'); expect(fetch).not.toHaveBeenCalled();
  });
  it('auto frames a single result and only commits a new viewport on explicit search', async () => {
    const item = makeListing(); const fetch = vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('button', { name: `查看${item.title}商品詳情` });
    await waitFor(() => expect(screen.getByTestId('map-frame')).toHaveTextContent('"kind":"single"'));
    const before = fetch.mock.calls.length; fireEvent.click(screen.getByRole('button', { name: '模擬移動地圖' })); fireEvent.click(screen.getByRole('button', { name: '商品列表' }));
    expect(fetch.mock.calls.length).toBe(before); fireEvent.click(screen.getByRole('button', { name: '搜尋此範圍' }));
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(before));
    const path = fetch.mock.calls.filter(([url]) => url.includes('/listings?')).at(-1)![0];
    expect(new URL(path).searchParams.get('bbox')).toBe('121.5,25,121.6,25.1');
  });
  it('finds a matching comic and labels own preview rather than falsely returning zero', async () => {
    const item = { ...makeListing(), owner: { id: 19, name: '本人' } };
    const fetch = vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [makeWish(814)], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : makeMatchPage([makeMatch(814, item)]))); vi.stubGlobal('fetch', fetch);
    render(view('/explore?wish=814')); await screen.findByText(/1 件站內商品（含 1 件自有預覽）/);
    expect(screen.getByText(/我的刊登預覽/)).toBeInTheDocument();
    const url = fetch.mock.calls.find(([url]) => url.includes('/listings/matches?'))![0]; expect(new URL(url).searchParams.get('includeOwnPreview')).toBe('1');
  });
  it('focuses a freshly fetched deep-link product and checks the requested identity', async () => {
    const item = makeListing(); vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.endsWith(`/listings/${item.id}`) ? item : url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })));
    render(view(`/explore?listing=${item.id}`)); await screen.findByRole('button', { name: `查看${item.title}商品詳情` });
    await waitFor(() => expect(screen.getByTestId('map-frame')).toHaveTextContent('"zoom":13'));
  });
  it('shows errors separately, never equates failed queries to an empty marketplace', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.includes('match-wishes')) return responseOk({ items: [], nextCursor: null }); throw new Error('offline'); }));
    render(view()); const errors = await screen.findAllByRole('alert'); expect(errors.length).toBe(2);
    expect(screen.queryByText(/目前地圖範圍沒有符合/)).not.toBeInTheDocument();
  });
  it('keeps a clicked cluster list scoped to its actual leaves, then can return to all results', async () => {
    const first = makeListing('測試漫画甲'), second = makeListing('測試漫畫乙'); vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [first, second], nextCursor: null })));
    render(view()); await screen.findByRole('button', { name: `查看${first.title}商品詳情` }); fireEvent.click(screen.getByRole('button', { name: '模擬群聚點擊' }));
    expect(screen.getByRole('heading', { name: '此群聚的商品' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: `查看${second.title}商品詳情` })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '顯示全部已載入結果' })); expect(screen.getByRole('button', { name: `查看${second.title}商品詳情` })).toBeInTheDocument();
  });
  it('reloads authoritative details and renders every photo with labelled delivery, price and expiry', async () => {
    const item = makeListing(); const fetch = vi.fn(async (url: string) => responseOk(url.endsWith(`/listings/${item.id}`) ? item : url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); fireEvent.click(await screen.findByRole('button', { name: `查看${item.title}商品詳情` })); const dialog = await screen.findByRole('dialog', { name: '商品詳情' });
    await within(dialog).findByRole('heading', { name: item.title }); expect(within(dialog).getByText('交付：')).toBeInTheDocument(); expect(within(dialog).getByText('失效時間：')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '開啟可分享商品頁' })).toHaveAttribute('href', `/listings/${item.id}`);
    fireEvent.keyDown(dialog, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith(`/listings/${item.id}`))).toHaveLength(1);
  });
  it('blocks looping pagination without adding duplicate rows', async () => {
    const item = makeListing(), cursor = item.id; vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: cursor })));
    render(view()); fireEvent.click(await screen.findByRole('button', { name: '載入更多站內商品' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('分頁重複'); expect(screen.getAllByRole('button', { name: `查看${item.title}商品詳情` })).toHaveLength(1);
  });
  it('offers reports only for another app seller, and replaces rather than nests the product dialog', async () => {
    const item = makeListing(); const fetch = vi.fn(async (url: string) => responseOk(url.includes('/listing-reports/mine') ? { items: [], nextCursor: null } : url.endsWith(`/listings/${item.id}`) ? item : url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); fireEvent.click(await screen.findByRole('button', { name: `查看${item.title}商品詳情` }));
    fireEvent.click(await screen.findByRole('button', { name: '檢舉此商品' }));
    expect(await screen.findByRole('dialog', { name: `檢舉商品：${item.title}` })).toBeInTheDocument(); expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(fetch.mock.calls.some(call => (call as unknown[])[1] && ((call as unknown[])[1] as RequestInit).method === 'POST')).toBe(false);
  });
  it('routes own-product details to management instead of self-report', async () => {
    const item = { ...makeListing(), owner: { id: 19, name: '本人' } }; vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.endsWith(`/listings/${item.id}`) ? item : url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })));
    render(view()); fireEvent.click(await screen.findByRole('button', { name: `查看${item.title}商品詳情` }));
    expect(await screen.findByRole('link', { name: '管理我的商品' })).toHaveAttribute('href', '/my-listings'); expect(screen.queryByRole('button', { name: '檢舉此商品' })).not.toBeInTheDocument();
  });
  it('ignores delayed old-session listings after switching accounts', async () => {
    const item = makeListing(); let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => url.includes('/listings?') && (init.headers as Record<string, string>).Authorization === 'Bearer fixture'
      ? new Promise(done => { resolve = done; }) : Promise.resolve(responseOk(url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [], nextCursor: null }))));
    const mounted = render(view()); await waitFor(() => expect(resolve).toBeDefined()); mounted.rerender(view('/explore', { ...auth, token: 'next', user: { id: 20, phoneNumber: 'next' } }));
    await screen.findByText(/目前地圖範圍沒有符合/); await act(async () => resolve(responseOk({ items: [item], nextCursor: null })));
    expect(screen.queryByRole('button', { name: `查看${item.title}商品詳情` })).not.toBeInTheDocument();
  });
  it('rejects invalid price bounds before sending a new search', async () => {
    const fetch = vi.fn(async (url: string) => responseOk(url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByText(/目前地圖範圍沒有符合/); fireEvent.click(screen.getByText('過濾與願望交叉比對（選用）'));
    fireEvent.change(screen.getByLabelText('最低售價（NT$）'), { target: { value: '500' } }); fireEvent.change(screen.getByLabelText('最高售價（NT$）'), { target: { value: '100' } });
    const before = fetch.mock.calls.length; fireEvent.click(screen.getByRole('button', { name: '套用條件' })); expect(await screen.findByRole('alert')).toHaveTextContent('最高價不可小於最低價'); expect(fetch.mock.calls.length).toBe(before);
  });
  it('keeps external sources separate from app sellers and links to a freshly verified original website', async () => {
    const item = makeExternalListing(); vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.endsWith(`/external-listings/${item.id}`) ? item : url.includes('/external-listings?') ? { enabled: true, items: [item], nextCursor: null } : { items: [], nextCursor: null })));
    render(view()); fireEvent.click(await screen.findByRole('button', { name: `查看${item.title}來源詳情` }));
    const dialog = await screen.findByRole('dialog', { name: '外部來源商品' }); await within(dialog).findByRole('heading', { name: item.title });
    expect(within(dialog).getByText('來源售價 NT$ 590')).toBeInTheDocument(); expect(within(dialog).getByText(/非站內賣家/)).toBeInTheDocument();
    const source = within(dialog).getByRole('link', { name: /前往來源網站/ }); expect(source).toHaveAttribute('href', item.canonicalUrl); expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(dialog).queryByRole('button', { name: /聯絡賣家/ })).not.toBeInTheDocument();
  });
});
