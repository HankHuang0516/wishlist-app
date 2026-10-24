import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import ProductWishButton, { ProductWishProvider } from './ProductWishButton';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/marketplaceApi', async original => ({ ...await original<typeof import('../lib/marketplaceApi')>(), api }));
const product = { kind: 'listing' as const, id: 'ab427730-60af-40c4-b568-37170d93e605', title: '合成商品' };
const auth = { token: 'fixture', user: { id: 42, phoneNumber: 'synthetic-only' }, isAuthenticated: true, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() };
const state = { lists: [{ id: 5, title: '我的私人願望', isPublic: false, remaining: 10 }], saved: [] };
const scope = `wishlist-product-wish:${marketplaceOrigin()}:42`;
function view(value = auth) { return <MemoryRouter><AuthContext.Provider value={value}><ProductWishProvider><ProductWishButton product={product} /></ProductWishProvider></AuthContext.Provider></MemoryRouter>; }
beforeEach(() => { localStorage.clear(); localStorage.setItem('user-locale', 'zh-TW'); api.mockReset().mockResolvedValue(state); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
describe('product heart creates real wishes', () => {
  it('chooses a destination once, accepts only a bound ACK and shows the actual wishlist link', async () => {
    api.mockImplementation(async (_token, path, options) => path === '/product-wishes' && options?.method === 'POST'
      ? { ...JSON.parse(options.body), productKey: 'listing:' + product.id, itemId: 9, deleted: false } : state);
    render(view()); await waitFor(() => expect(api).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '加入願望清單：合成商品' }));
    await screen.findByRole('dialog'); fireEvent.click(screen.getByRole('button', { name: /我的私人願望/ }));
    expect(await screen.findByRole('link', { name: '查看願望' })).toHaveAttribute('href', '/wishlists/5');
    expect(screen.getByRole('button', { name: '已加入願望：合成商品' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '已加入願望：合成商品' }));
    expect(api.mock.calls.filter(c => c[2]?.method === 'POST')).toHaveLength(1);
    expect(localStorage.getItem(scope + ':destination')).toBe('5');
  });
  it('restores an uncertain add using GET only, then keeps the same operation on explicit retry', async () => {
    const pending = { kind: 'listing', productId: product.id, wishlistId: 5, clientRequestId: 'a2377304-60af-40c4-b568-37170d93e605' };
    localStorage.setItem(scope + ':pending', JSON.stringify(pending));
    api.mockImplementation(async (_token, path, options) => {
      if (path.includes('/receipts/')) throw Error('lost response');
      if (options?.method === 'POST') return { ...pending, productKey: 'listing:' + product.id, itemId: 9, deleted: false };
      return state;
    });
    render(view()); await screen.findByRole('button', { name: '重試原加入' });
    await waitFor(() => expect(screen.getByRole('button', { name: '重試原加入' })).toBeEnabled());
    expect(api.mock.calls.some(c => c[2]?.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '重試原加入' })); await screen.findByRole('link', { name: '查看願望' });
    expect(api.mock.calls.find(c => c[2]?.method === 'POST')?.[2].body).toBe(JSON.stringify(pending));
  });
  it('does not show success or mark the heart saved for an ACK naming another product', async () => {
    localStorage.setItem(scope + ':destination', '5');
    api.mockImplementation(async (_token, _path, options) => options?.method === 'POST'
      ? { ...JSON.parse(options.body), productKey: 'listing:a2377304-60af-40c4-b568-37170d93e605', itemId: 9, deleted: false } : state);
    render(view()); await act(async () => {}); fireEvent.click(screen.getByRole('button', { name: '加入願望清單：合成商品' }));
    await screen.findByText(/加入結果尚未確認/);
    expect(screen.queryByRole('link', { name: '查看願望' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '加入願望清單：合成商品' })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(scope + ':pending')).not.toBeNull();
  });
  it('leaves the first account operation under its own scope after switching accounts', async () => {
    let finish!: (r: unknown) => void;
    localStorage.setItem(scope + ':destination', '5');
    api.mockImplementation((_token, _path, options) => options?.method === 'POST' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(state));
    const mounted = render(view()); await act(async () => {}); fireEvent.click(screen.getByRole('button', { name: '加入願望清單：合成商品' }));
    const pending = JSON.parse(localStorage.getItem(scope + ':pending')!);
    mounted.rerender(view({ ...auth, token: 'other', user: { ...auth.user, id: 43 } }));
    await act(async () => finish({ ...pending, productKey: 'listing:' + product.id, itemId: 9, deleted: false }));
    expect(screen.queryByRole('link', { name: '查看願望' })).not.toBeInTheDocument();
    expect(localStorage.getItem(scope + ':pending')).not.toBeNull();
  });
});
