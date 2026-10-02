import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { makeListing } from '../__tests__/fixtures/marketplace';
import { makeRoom } from '../__tests__/fixtures/chat';
import { parsePublicListing } from '../lib/listingSearch';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import ProductActionsWeb from './ProductActionsWeb';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/marketplaceApi', async original => ({ ...await original<typeof import('../lib/marketplaceApi')>(), api }));
const listing = parsePublicListing(makeListing(), marketplaceOrigin(), true);
const auth = { token: 'fixture', user: { id: 42, phoneNumber: 'synthetic-only' }, isAuthenticated: true, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() };
const onReport = vi.fn();
function Destination() { const location = useLocation(); return <p>已到達：{location.pathname + location.search}</p>; }
function room() { const base = makeRoom(); return { ...base, sellerUserId: listing.owner.id, seller: { id: listing.owner.id, name: '合成賣家' }, listingId: listing.id, listing: { ...base.listing, id: listing.id } }; }
const view = (value = auth, item = listing) => <MemoryRouter><AuthContext.Provider value={value}><Routes><Route path="/" element={<ProductActionsWeb listing={item} onReport={onReport} />} /><Route path="/chat" element={<Destination />} /></Routes></AuthContext.Provider></MemoryRouter>;
beforeEach(() => { api.mockReset().mockResolvedValue(room()); onReport.mockReset(); });
afterEach(() => vi.restoreAllMocks());
describe('product contact and report destinations', () => {
  it('keeps owner management instead of self-contact or self-report', () => {
    render(view({ ...auth, user: { ...auth.user, id: listing.owner.id } }));
    expect(screen.getByRole('link', { name: '管理我的商品' })).toHaveAttribute('href', '/my-listings');
    expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(api).not.toHaveBeenCalled();
  });
  it('opens one participant-bound room despite rapid duplicate clicks and sends no message', async () => {
    let finish!: (value: unknown) => void; api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(view()); const contact = screen.getByRole('button', { name: '聯絡賣家／預約面交' }); fireEvent.click(contact); fireEvent.click(contact);
    expect(api).toHaveBeenCalledTimes(1); expect(api).toHaveBeenCalledWith('fixture', '/chat/conversations', { method: 'POST', body: JSON.stringify({ listingId: listing.id }) });
    await act(async () => finish(room())); await screen.findByText('已到達：/chat?room=' + room().id);
  });
  it('keeps lost room acknowledgements uncertain, offering inbox or an explicit same-product retry', async () => {
    api.mockRejectedValueOnce(new Error('lost ACK')); render(view()); fireEvent.click(screen.getByRole('button', { name: '聯絡賣家／預約面交' }));
    await screen.findByText(/尚未確認聊天室是否已建立/); expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: '查看聊天收件匣' })).toHaveAttribute('href', '/chat');
    fireEvent.click(screen.getByRole('button', { name: '聯絡賣家／預約面交' })); await screen.findByText('已到達：/chat?room=' + room().id);
    expect(api.mock.calls.map(call => call[2].body)).toEqual(Array(2).fill(JSON.stringify({ listingId: listing.id })));
  });
  it('does not navigate to an acknowledged different seller or product', async () => {
    api.mockResolvedValue({ ...room(), sellerUserId: 99, seller: { id: 99, name: 'wrong' } }); render(view());
    fireEvent.click(screen.getByRole('button', { name: '聯絡賣家／預約面交' })); await screen.findByText(/尚未確認聊天室是否已建立/);
    expect(screen.queryByText(/已到達/)).not.toBeInTheDocument();
  });
  it('does not create a room for an expired product, and report remains an explicit action', async () => {
    render(view(auth, { ...listing, expiresAt: '2020-01-01T00:00:00Z' })); fireEvent.click(screen.getByRole('button', { name: '聯絡賣家／預約面交' }));
    await screen.findByText('商品已失效，請重新載入核對。'); expect(api).not.toHaveBeenCalled(); expect(onReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '檢舉此商品' })); expect(onReport).toHaveBeenCalledTimes(1);
  });
  it('ignores the old session room response after switching accounts', async () => {
    let finish!: (value: unknown) => void; api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const mounted = render(view()); fireEvent.click(screen.getByRole('button', { name: '聯絡賣家／預約面交' })); await waitFor(() => expect(finish).toBeDefined());
    mounted.rerender(view({ ...auth, token: 'next', user: { id: 44, phoneNumber: 'synthetic-next' } })); await act(async () => finish(room()));
    expect(screen.queryByText(/已到達/)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: '聯絡賣家／預約面交' })).toBeEnabled();
  });
});
