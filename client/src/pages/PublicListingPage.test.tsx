import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ContextType } from 'react';
import PublicListingPage from './PublicListingPage';
import { API_URL } from '../config';
import { AuthContext } from '../context/AuthContext';
import { makeListing, responseOk } from '../__tests__/fixtures/marketplace';

const id = 'b5abf861-a66d-4072-876b-4f0ab3172dac';
const anonymous = { token: null, user: null, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: false };
const listing = () => ({ ...makeListing('二手檯燈'), id, version: 3, description: '九成新', price: '590', owner: { id: 3, name: '賣家' }, location: { ...makeListing().location, district: '中山區' } });
const view = (path: string, auth: NonNullable<ContextType<typeof AuthContext>> = anonymous) => <MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth}><Routes>
  <Route path="/listings/:id" element={<PublicListingPage />} />
</Routes></AuthContext.Provider></MemoryRouter>;
const mount = (path: string) => render(view(path));
let originalLocale: string | null;
beforeEach(() => { originalLocale = localStorage.getItem('user-locale'); localStorage.setItem('user-locale', 'zh-TW'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  if (originalLocale === null) localStorage.removeItem('user-locale'); else localStorage.setItem('user-locale', originalLocale);
});

describe('public listing share destination', () => {
  it('shows the public listing to a visitor without login or private fields', async () => {
    const fetch = vi.fn(async () => responseOk({ ...listing(), privatePhone: 'DO_NOT_SHOW' }));
    vi.stubGlobal('fetch', fetch);
    mount(`/listings/${id}`);
    expect(await screen.findByRole('heading', { name: '二手檯燈' })).toBeInTheDocument();
    expect(screen.getByText('NT$ 590')).toBeInTheDocument();
    expect(screen.getByText(/臺北市中山區/)).toBeInTheDocument();
    expect(screen.queryByText('DO_NOT_SHOW')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/listings/${id}`, expect.objectContaining({ cache: 'no-store', redirect: 'error' }));
    expect(fetch.mock.calls[0]).toHaveLength(2);
    expect(screen.getByRole('link', { name: '登入以聯絡賣家或檢舉商品' })).toHaveAttribute('href', '/login?next=' + encodeURIComponent('/listings/' + id));
    expect(screen.getByRole('link', { name: '在探索地圖定位此商品' })).toHaveAttribute('href', '/explore?listing=' + id);
    expect(screen.getByRole('img', { name: '二手檯燈商品照片1' })).toHaveAttribute('referrerpolicy', 'no-referrer');
  });
  it('hides removed goods from visitors and does not fetch invalid IDs', async () => {
    const fetch = vi.fn(async () => new Response('{"errorCode":"NOT_FOUND"}', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    mount(`/listings/${id}`);
    expect(await screen.findByRole('heading', { name: '商品已停止刊登或連結無效' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    mount('/listings/invalid');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { price: 'not-a-price' }, { currency: 'USD' }, { version: 0 }, { version: 2147483648 },
    { id: 'a2377304-60af-40c4-b568-37170d93e605' },
    { media: [{ id, imageUrl: 'https://untrusted.example/image.jpg', thumbnailUrl: 'https://untrusted.example/thumb.jpg' }] },
  ])('rejects malformed or untrusted public projections without displaying wrong information: %j', async change => {
    vi.stubGlobal('fetch', vi.fn(async () => responseOk({ ...listing(), ...change })));
    mount('/listings/' + id);
    await screen.findByRole('heading', { name: '暫時無法載入商品' });
    expect(screen.queryByRole('button', { name: '分享商品' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '商品已停止刊登或連結無效' })).not.toBeInTheDocument();
  });
  it('allows retry after a read failure, without reporting unavailable or making a private request', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(responseOk(listing()));
    vi.stubGlobal('fetch', fetch); mount('/listings/' + id);
    await screen.findByRole('heading', { name: '暫時無法載入商品' });
    fireEvent.click(screen.getByRole('button', { name: '重新載入商品' }));
    await screen.findByRole('heading', { name: '二手檯燈' }); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('copies real product title, price and a versioned link, not website-only information', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } }); vi.stubGlobal('fetch', vi.fn(async () => responseOk(listing())));
    mount('/listings/' + id); await screen.findByRole('heading', { name: '二手檯燈' });
    fireEvent.click(screen.getByRole('button', { name: '分享商品' }));
    await screen.findByText('商品資訊與連結已複製');
    expect(writeText).toHaveBeenCalledWith(`二手檯燈｜NT$ 590\n${window.location.origin}/listings/${id}?v=3`);
  });
  it('uses native browser share when supported, without claiming cancellation as failure', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share }); vi.stubGlobal('fetch', vi.fn(async () => responseOk(listing())));
    mount('/listings/' + id); await screen.findByRole('heading', { name: '二手檯燈' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '分享商品' })));
    expect(share).toHaveBeenCalledWith({ title: '二手檯燈｜NT$ 590', text: '二手檯燈｜NT$ 590', url: `${window.location.origin}/listings/${id}?v=3` });
    expect(screen.queryByText('無法分享，請稍後重試。')).not.toBeInTheDocument();
  });
  it('removes expired goods on foreground checks and no longer exposes contact or share', async () => {
    const listeners = vi.spyOn(document, 'addEventListener');
    const item = { ...listing(), expiresAt: new Date(Date.now() + 60_000).toISOString() };
    vi.stubGlobal('fetch', vi.fn(async () => responseOk(item))); mount('/listings/' + id);
    await screen.findByRole('heading', { name: '二手檯燈' }); vi.spyOn(Date, 'now').mockReturnValue(Date.parse(item.expiresAt));
    fireEvent(document, new Event('visibilitychange'));
    await screen.findByRole('heading', { name: '商品已停止刊登或連結無效' });
    expect(screen.queryByRole('button', { name: '分享商品' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '登入以聯絡賣家或檢舉商品' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '在探索地圖定位此商品' })).not.toBeInTheDocument();
    expect(listeners.mock.calls.filter(call => call[0] === 'visibilitychange')).toHaveLength(1);
  });
  it('does not admit delayed data or old-owner actions after an account switch', async () => {
    let finish!: (value: unknown) => void;
    const auth = { ...anonymous, token: 'synthetic', isAuthenticated: true, user: { id: 3, phoneNumber: 'synthetic' } };
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(responseOk({ ...listing(), title: '新帳號看到的商品' })));
    const mounted = render(view('/listings/' + id, auth));
    mounted.rerender(view('/listings/' + id, { ...auth, token: 'synthetic-next', user: { id: 4, phoneNumber: 'synthetic-next' } }));
    await screen.findByRole('heading', { name: '新帳號看到的商品' }); await act(async () => finish(responseOk(listing())));
    expect(screen.queryByRole('heading', { name: '二手檯燈' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '管理我的商品' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '聯絡賣家／預約面交' })).toBeInTheDocument();
  });
  it('shows English public controls while keeping the original item, seller, area and price currency', async () => {
    localStorage.setItem('user-locale', 'en-US');
    vi.stubGlobal('fetch', vi.fn(async () => responseOk({ ...listing(), price: '0', status: 'RESERVED' })));
    mount('/listings/' + id);
    await screen.findByRole('heading', { name: '二手檯燈' });
    expect(screen.getByRole('heading', { name: 'Item description' })).toBeInTheDocument();
    expect(screen.getByText('九成新')).toBeInTheDocument();
    expect(screen.getByText('Seller: 賣家')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Reserved')).toBeInTheDocument();
    expect(screen.getByText(/臺北市中山區.*approximate area/)).toBeInTheDocument();
    expect(screen.getByText(/Taiwan time/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '二手檯燈 item photo 1' })).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByRole('link', { name: 'Sign in to contact the seller or report the item' })).toHaveAttribute('href', '/login?next=' + encodeURIComponent('/listings/' + id));
    expect(screen.getByRole('button', { name: 'Share item' })).toBeInTheDocument();
  });
  it('allows only one native share at a time and preserves the original text and version across a locale change', async () => {
    localStorage.setItem('user-locale', 'en-US');
    let finish!: () => void;
    const share = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    vi.stubGlobal('navigator', { share }); vi.stubGlobal('fetch', vi.fn(async () => responseOk({ ...listing(), price: '1250.50' })));
    mount('/listings/' + id); await screen.findByRole('heading', { name: '二手檯燈' });
    const button = screen.getByRole('button', { name: 'Share item' });
    fireEvent.click(button); fireEvent.click(button);
    expect(share).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sharing…' })).toBeDisabled();
    localStorage.setItem('user-locale', 'zh-TW'); await act(async () => finish());
    expect(share).toHaveBeenCalledWith({ title: '二手檯燈｜NT$ 1,250.5', text: '二手檯燈｜NT$ 1,250.5', url: `${window.location.origin}/listings/${id}?v=3` });
    expect(screen.getByRole('button', { name: '分享商品' })).toBeEnabled();
  });
  it('uses bounded English failure notices when saved locale cannot be read', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('PRIVATE_STORAGE_DETAIL'); });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"PRIVATE_PROVIDER_DETAIL"}', { status: 503 })));
    mount('/listings/' + id);
    await screen.findByRole('heading', { name: 'The item could not be loaded' });
    expect(screen.getByRole('button', { name: 'Reload item' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('PRIVATE_PROVIDER_DETAIL');
    expect(document.body.textContent).not.toContain('PRIVATE_STORAGE_DETAIL');
  });
  it('keeps rate limits distinct from missing goods and dispatches only a new explicit read after Retry-After', async () => {
    localStorage.setItem('user-locale', 'en-US'); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T02:00:00Z'));
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"errorCode":"RATE_LIMIT_EXCEEDED","error":"PRIVATE_LIMIT_DETAIL"}', { status: 429, headers: { 'Retry-After': '120' } })).mockResolvedValue(responseOk(listing()));
    vi.stubGlobal('fetch', fetch);
    await act(async () => { mount('/listings/' + id); });
    expect(screen.getByText(/Requests are temporarily limited/)).toBeInTheDocument();
    expect(screen.queryByText('The item is no longer listed or the link is invalid')).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reload item' })));
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reload item' })));
    expect(screen.getByRole('heading', { name: '二手檯燈' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error' });
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('Authorization');
    expect(document.body.textContent).not.toContain('PRIVATE_LIMIT_DETAIL');
  });
});
