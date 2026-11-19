import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import WishShareDialog from '../components/WishShareDialog';
import { analyticsPath } from '../lib/analyticsPrivacy';
import { authReturnTo } from '../lib/authReturnTo';
import { ApiFailure } from '../lib/marketplaceApi';
import PublicProductPage from './PublicProductPage';
import SharedWishPage from './SharedWishPage';

const { publicApi, api } = vi.hoisted(() => ({ publicApi: vi.fn(), api: vi.fn() }));
vi.mock('../lib/marketplaceApi', async original => ({ ...await original<typeof import('../lib/marketplaceApi')>(), publicApi, api }));

const id = 'ab427730-60af-40c4-b568-37170d93e605', token = 'AbCdEfGhIjKlMnOpQrSt_-';
const product = { kind: 'source', id, key: 'source:' + id, title: 'BenQ 合成螢幕', description: '公開來源參考', mainId: 'electronics', subId: 'monitors', price: 1200, priceText: '1200', currency: 'TWD', priceUnitVerified: true,
  photos: [{ id: 'a', url: 'https://example.invalid/a', thumbnailUrl: 'https://example.invalid/a' }], thumbnailUrl: 'https://example.invalid/a', county: '臺北市', district: null, condition: 'USED', stockStatus: 'UNKNOWN',
  canonicalUrl: 'https://example.invalid/original', detailPath: '/explore', sourceLabel: '公開來源', date: '2026-11-10T00:00:00Z', dateBasis: 'SOURCE_POST_RANGE', dateEarliest: null };
const page = { items: [product], categories: [], nextCursor: null, snapshot: 'fixed', total: 1, counts: { listing: 0, source: 1, external: 0 }, counties: ['臺北市'], complete: true, generatedAt: '2026-11-10T00:00:00Z', unknownPriceExcluded: false };
const guest = { token: null, user: null, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: false };
const owner = { ...guest, token: 'fixture', user: { id: 42, phoneNumber: 'synthetic' }, isAuthenticated: true };
function Location() { const location = useLocation(); return <span data-testid="location">{location.pathname + location.search}</span>; }
const view = (path: string, auth: typeof guest | typeof owner = guest) => <MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth as never}><Routes>
  <Route path="/products/:kind/:id" element={<PublicProductPage />} /><Route path="/shared-wishes/:token" element={<SharedWishPage />} /><Route path="*" element={<p>另一頁</p>} />
</Routes><Location /></AuthContext.Provider></MemoryRouter>;

beforeEach(() => { localStorage.clear(); localStorage.setItem('user-locale', 'zh-TW'); publicApi.mockReset(); api.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('the page a shared public-source product opens', () => {
  it('shows the product to a visitor who is not signed in, with a way to keep it and a way to share it on', async () => {
    publicApi.mockResolvedValue(page);
    const writeText = vi.fn(async () => undefined); vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(view('/products/source/' + id.toUpperCase()));
    expect(await screen.findByRole('heading', { name: 'BenQ 合成螢幕' })).toBeInTheDocument();
    expect(publicApi).toHaveBeenCalledWith('/discovery/products/source/' + id, expect.anything()); expect(api).not.toHaveBeenCalled();
    // Without an account the wishlist button leads to sign-in and back to this page.
    expect(screen.getByRole('link', { name: '登入以加入願望：BenQ 合成螢幕' })).toHaveAttribute('href', '/login?next=' + encodeURIComponent('/products/source/' + id.toUpperCase()));
    expect(screen.getByRole('link', { name: '請 Wishlist AI 代問' })).toHaveAttribute('href', '/chat?source=' + id);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '分享商品' })));
    expect(writeText).toHaveBeenCalledWith(`看看「BenQ 合成螢幕」｜NT$ 1,200\n${window.location.origin}/products/source/${id}`);
    expect(screen.getByRole('status')).toHaveTextContent('文字與連結已複製');
  });
  it('hands the device’s share sheet the text and the address separately, and stays quiet when it is closed', async () => {
    publicApi.mockResolvedValue(page);
    const share = vi.fn().mockRejectedValueOnce(new DOMException('cancelled', 'AbortError')).mockRejectedValueOnce(new DOMException('PRIVATE_DETAIL', 'NotAllowedError'));
    vi.stubGlobal('navigator', { share });
    render(view('/products/source/' + id)); await screen.findByRole('heading', { name: 'BenQ 合成螢幕' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '分享商品' })));
    expect(share).toHaveBeenCalledWith({ title: 'BenQ 合成螢幕', text: '看看「BenQ 合成螢幕」｜NT$ 1,200', url: `${window.location.origin}/products/source/${id}` });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '分享商品' })));
    expect(screen.getByRole('textbox', { name: '分享文字與連結' })).toHaveValue(`看看「BenQ 合成螢幕」｜NT$ 1,200\n${window.location.origin}/products/source/${id}`);
    expect(screen.getByRole('status').textContent).not.toContain('PRIVATE_DETAIL');
  });
  it('lets a signed-in visitor add the product to a wishlist right on the page, and says so there', async () => {
    const saved: unknown[] = [];
    api.mockImplementation(async (_token: string, path: string, options?: { method?: string; body?: string }) => {
      if (path.startsWith('/discovery/products/')) return page;
      if (options?.method === 'POST') { const body = JSON.parse(options.body!); const receipt = { ...body, productKey: body.kind + ':' + body.productId, itemId: 9, deleted: false }; saved.push({ productKey: receipt.productKey, itemId: 9, wishlistId: 5 }); return receipt; }
      return { lists: [{ id: 5, title: '私人清單', isPublic: false, remaining: 10 }], saved };
    });
    render(view('/products/source/' + id, owner));
    const add = await screen.findByRole('button', { name: '加入願望清單：BenQ 合成螢幕' });
    await waitFor(() => expect(add).toBeEnabled()); expect(add).toHaveTextContent('加入願望清單');
    fireEvent.click(add);
    expect(await screen.findByRole('button', { name: '已加入願望：BenQ 合成螢幕' })).toHaveTextContent('已加入願望清單');
    expect(api.mock.calls.find(call => call[2]?.method === 'POST')?.[2].body).toContain('"kind":"source"');
    // The result is said once, beside the button, not also in a second box under the page.
    expect(screen.getAllByText(/已加入願望清單。/)).toHaveLength(1);
  });
  it('says so when the product is no longer public or cannot be read, and sends a listing to its own page', async () => {
    publicApi.mockRejectedValue(new ApiFailure('synthetic', 404, 'DISCOVERY_PRODUCT_UNAVAILABLE'));
    const first = render(view('/products/source/' + id));
    expect(await screen.findByRole('heading', { name: '商品已停止公開或連結無效' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '分享商品' })).not.toBeInTheDocument();
    first.unmount(); publicApi.mockReset().mockRejectedValue(new ApiFailure('synthetic', 503, 'DISCOVERY_UNAVAILABLE'));
    const second = render(view('/products/external/' + id));
    expect(await screen.findByRole('heading', { name: '暫時無法載入商品' })).toBeInTheDocument();
    publicApi.mockResolvedValue({ ...page, items: [{ ...product, kind: 'external', key: 'external:' + id }], counts: { listing: 0, source: 0, external: 1 } });
    fireEvent.click(screen.getByRole('button', { name: '重新載入商品' }));
    expect(await screen.findByRole('heading', { name: 'BenQ 合成螢幕' })).toBeInTheDocument();
    second.unmount(); publicApi.mockReset();
    const third = render(view('/products/listing/' + id));
    expect(screen.getByTestId('location')).toHaveTextContent('/listings/' + id); expect(publicApi).not.toHaveBeenCalled();
    third.unmount();
    for (const bad of ['/products/source/not-a-product', '/products/other/' + id]) { const view_ = render(view(bad)); expect(screen.getByRole('heading', { name: '商品已停止公開或連結無效' })).toBeInTheDocument(); view_.unmount(); }
    expect(publicApi).not.toHaveBeenCalled();
  });
  it('refuses an answer that is some other product', async () => {
    publicApi.mockResolvedValue({ ...page, items: [{ ...product, id: 'ab427730-60af-40c4-b568-000000000001', key: 'source:ab427730-60af-40c4-b568-000000000001' }] });
    render(view('/products/source/' + id));
    expect(await screen.findByRole('heading', { name: '暫時無法載入商品' })).toBeInTheDocument();
  });
});

describe('the page a shared wish opens', () => {
  it('shows the name and budget to anyone holding the address, read without the visitor’s sign-in', async () => {
    publicApi.mockResolvedValue({ name: '橘色桌燈', maxPrice: 1500, priceCurrency: 'TWD' });
    render(view('/shared-wishes/' + token, owner));
    expect(await screen.findByRole('heading', { name: '橘色桌燈' })).toBeInTheDocument();
    expect(screen.getByText('預算：TWD 1,500')).toBeInTheDocument();
    expect(publicApi).toHaveBeenCalledWith('/shared-wishes/' + token, expect.anything()); expect(api).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '找找符合的商品' })).toHaveAttribute('href', '/explore?q=' + encodeURIComponent('橘色桌燈'));
    expect(screen.getByRole('link', { name: '看我的願望' })).toHaveAttribute('href', '/wishes');
  });
  it('offers a visitor without an account a way in', async () => {
    publicApi.mockResolvedValue({ name: '相機', maxPrice: null, priceCurrency: null });
    render(view('/shared-wishes/' + token));
    expect(await screen.findByRole('heading', { name: '相機' })).toBeInTheDocument();
    expect(screen.getByText('沒有設定預算')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '我也要許願' })).toHaveAttribute('href', '/register');
  });
  it('says the wish is gone for a deleted wish and for an address that cannot be one, and never shows an answer with anything extra', async () => {
    publicApi.mockRejectedValue(new ApiFailure('synthetic', 404, 'SHARED_WISH_UNAVAILABLE'));
    const first = render(view('/shared-wishes/' + token));
    expect(await screen.findByRole('heading', { name: '這個願望已不存在，或連結無效' })).toBeInTheDocument();
    first.unmount(); publicApi.mockReset();
    const second = render(view('/shared-wishes/short'));
    expect(screen.getByRole('heading', { name: '這個願望已不存在，或連結無效' })).toBeInTheDocument(); expect(publicApi).not.toHaveBeenCalled();
    second.unmount(); publicApi.mockResolvedValue({ name: '相機', maxPrice: null, priceCurrency: null, notes: 'PRIVATE_NOTE' });
    render(view('/shared-wishes/' + token));
    expect(await screen.findByRole('heading', { name: '暫時無法載入願望' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('PRIVATE_NOTE');
  });
});

describe('sharing one of my wishes from the web page', () => {
  const wish = { id: 77, name: '橘色桌燈', maxPrice: 1500, priceCurrency: 'TWD', notes: 'PRIVATE_NOTE', imageUrl: 'https://private.example/secret' };
  const expected = `我的願望是「橘色桌燈」\n我的預算：TWD 1,500\n如果你剛好看到，分享給我吧！\n— Wishlist.ai 願望市集\n${window.location.origin}/shared-wishes/${token}`;
  it('asks the server for the address as the owner, shows exactly what will be sent, then copies or shares it', async () => {
    api.mockResolvedValue({ path: '/shared-wishes/' + token });
    const writeText = vi.fn(async () => undefined), share = vi.fn(async () => undefined); vi.stubGlobal('navigator', { clipboard: { writeText }, share });
    render(<WishShareDialog token="fixture" wish={wish} onClose={vi.fn()} />);
    expect(await screen.findByRole('textbox', { name: '將分享的文字與連結' })).toHaveValue(expected);
    expect(api).toHaveBeenCalledWith('fixture', '/native-wishes/items/77/share-link', expect.anything());
    for (const hidden of ['PRIVATE_NOTE', 'private.example', '77']) expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).not.toContain(hidden);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '複製文字與連結' })));
    expect(writeText).toHaveBeenCalledWith(expected); expect(screen.getByRole('status')).toHaveTextContent('文字與連結已複製');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '開啟分享選單' })));
    expect(share).toHaveBeenCalledWith({ title: '橘色桌燈', text: expected.slice(0, expected.lastIndexOf('\n')), url: `${window.location.origin}/shared-wishes/${token}` });
  });
  it('shares nothing without an address from the server, and can ask again', async () => {
    api.mockRejectedValueOnce(new ApiFailure('synthetic', 503, 'UNAVAILABLE')).mockResolvedValueOnce({ path: '/wishlists/5' }).mockResolvedValueOnce({ path: '/shared-wishes/' + token });
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
    render(<WishShareDialog token="fixture" wish={wish} onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('暫時無法取得分享連結'); expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2)); expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(await screen.findByRole('textbox', { name: '將分享的文字與連結' })).toHaveValue(expected);
    expect(screen.queryByRole('button', { name: '開啟分享選單' })).not.toBeInTheDocument();
  });
});

describe('the new shared addresses elsewhere on the site', () => {
  it('report only their kind to analytics, never the product or the key to a wish', () => {
    expect(analyticsPath('/products/source/' + id)).toBe('/products/item');
    expect(analyticsPath('/products/external/' + id)).toBe('/products/item');
    expect(analyticsPath('/shared-wishes/' + token)).toBe('/shared-wishes/item');
    expect(analyticsPath('/shared-wishes/' + token + '/more')).toBe('/not-found');
  });
  it('are where sign-in returns to from a product page, and nowhere else is accepted in their name', () => {
    expect(authReturnTo('/products/source/' + id.toUpperCase())).toBe('/products/source/' + id);
    expect(authReturnTo('/products/external/' + id)).toBe('/products/external/' + id);
    for (const bad of ['/products/listing/' + id, '/products/source/nope', `/products/source/${id}?next=//evil.example`, `/products/source/${id}/../../settings`, '/shared-wishes/' + token])
      expect(authReturnTo(bad)).toBe('/dashboard');
  });
});
