import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { ApiFailure } from '../lib/marketplaceApi';
import ChatPage from './ChatPage';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/marketplaceApi', async original => ({ ...await original<typeof import('../lib/marketplaceApi')>(), api }));
vi.mock('../components/SourceContactChat', () => ({ default: ({ source }: { source: { title: string } }) => <p>Original source: {source.title}</p> }));
const auth = { token: 'source-fixture', user: { id: 42, phoneNumber: 'synthetic-only' }, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const sourceId = 'b373aae4-51cf-48ce-a82b-93ad0b42716a';
const context = { id: sourceId, title: '原始商品名稱 {version} 250.7500 USD', county: '臺南市', district: '永康區', canonicalUrl: 'https://www.facebook.com/marketplace/item/8600/', media: [] };
const states = ['INQUIRY', 'WAITING_ROUTE', 'TRANSFER_RESERVED', 'DELIVERED', 'CANCEL_REQUESTED', 'DELIVERY_REQUIRES_REVIEW', 'CANCELLED'];
const threads = states.map((state, i) => ({ id: `c349f91a-f361-4432-aadc-260939d6073${i}`, state, context }));
const reads = () => api.mock.calls.filter(call => call[1].startsWith('/source-leads/inquiries/mine'));
const writes = () => api.mock.calls.filter(call => call[2]?.method && call[2].method !== 'GET');
const view = (token = auth.token, source = false) => <MemoryRouter initialEntries={[source ? '/chat?source=' + sourceId : '/chat']}><AuthContext.Provider value={{ ...auth, token }}><ChatPage /></AuthContext.Provider></MemoryRouter>;
beforeEach(() => {
  localStorage.setItem('user-locale', 'en-US'); api.mockReset();
  api.mockImplementation(async (_: string, path: string) => path.startsWith('/source-leads/inquiries/mine') ? { items: threads, nextCursor: null } : { items: [], nextCursor: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('source inquiry inbox language and explicit read recovery', () => {
  it('shows English status accurately for forwarding and withdrawal review while retaining original product content', async () => {
    render(view());
    await screen.findByRole('heading', { name: 'Wishlist AI inquiries' });
    expect(await screen.findAllByText(context.title)).toHaveLength(7);
    for (const label of ['Review question and next steps', 'Seller verification pending · Not sent', 'Forwarding reserved · Delivery unconfirmed', 'Forwarding recorded · View seller reply', 'Withdrawal requested · Review pending', 'Delivery evidence needs review', 'Cancelled']) expect(screen.getByText('Wishlist AI · ' + label)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });
  it('recovers a failed source read only on explicit retry without hiding normal chat or posting an inquiry', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); let attempts = 0;
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { if (args[1].startsWith('/source-leads/inquiries/mine') && ++attempts === 1) throw new ApiFailure('private provider diagnostic', 503); return base(...args); });
    render(view());
    await screen.findByText(/Source conversations could not be read/);
    expect(screen.getByRole('button', { name: 'Reload inbox' })).toBeEnabled();
    expect(screen.queryByText('private provider diagnostic')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); window.dispatchEvent(new Event('online')); });
    expect(reads()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry source conversations' }));
    await screen.findAllByText(context.title);
    expect(reads()).toHaveLength(2); expect(writes()).toHaveLength(0);
    expect(screen.queryByText(/Source conversations could not be read/)).not.toBeInTheDocument();
  });
  it('retains a previously read source history when a later refresh fails, then retries without allocating another room', async () => {
    render(view()); await screen.findAllByText(context.title);
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { if (args[1].startsWith('/source-leads/inquiries/mine')) throw new Error('offline'); return base(...args); });
    fireEvent.click(screen.getByRole('button', { name: 'Reload source conversations' }));
    await screen.findByText(/Source conversations could not be read/);
    expect(screen.getAllByText(context.title)).toHaveLength(7);
    api.mockImplementation(base); fireEvent.click(screen.getByRole('button', { name: 'Retry source conversations' }));
    await waitFor(() => expect(screen.queryByText(/Source conversations could not be read/)).not.toBeInTheDocument());
    expect(reads()).toHaveLength(3); expect(writes()).toHaveLength(0);
  });
  it('keeps the exact owned source context after withdrawal instead of switching to another item', async () => {
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { if (args[1].startsWith('/source-leads/' + sourceId)) throw new ApiFailure('withdrawn', 404); return base(...args); });
    render(view(auth.token, true));
    expect(await screen.findByText('Original source: ' + context.title)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });
  it('rejects a repeated pagination cursor and retries from the first page with the original account', async () => {
    const base = api.getMockImplementation()!; let malformed = true;
    api.mockImplementation(async (...args) => args[1].startsWith('/source-leads/inquiries/mine') && malformed ? { items: [threads[0]], nextCursor: threads[1].id } : base(...args));
    render(view()); await screen.findByText(/Source conversations could not be read/);
    expect(reads()).toHaveLength(2); expect(screen.queryByText(context.title)).not.toBeInTheDocument();
    malformed = false; fireEvent.click(screen.getByRole('button', { name: 'Retry source conversations' }));
    await screen.findAllByText(context.title);
    expect(reads()[2][1]).toBe('/source-leads/inquiries/mine'); expect(reads().every(call => call[0] === auth.token)).toBe(true); expect(writes()).toHaveLength(0);
  });
  it('aborts the departed account read and ignores its late private history', async () => {
    const base = api.getMockImplementation()!; let resolveOld!: (value: unknown) => void;
    api.mockImplementation((...args) => args[0] === auth.token && args[1].startsWith('/source-leads/inquiries/mine') ? new Promise(resolve => { resolveOld = resolve; }) : args[1].startsWith('/source-leads/inquiries/mine') ? Promise.resolve({ items: [], nextCursor: null }) : base(...args));
    const first = render(view()); await waitFor(() => expect(reads()).toHaveLength(1));
    const signal = reads()[0][2]?.signal; first.unmount();
    expect(signal?.aborted).toBe(true);
    render(view('second-account'));
    await act(async () => resolveOld({ items: threads, nextCursor: null }));
    expect(screen.queryByText(context.title)).not.toBeInTheDocument(); expect(writes()).toHaveLength(0);
  });
  it('bounds a stalled source read and offers an explicit retry without automatically submitting anything', async () => {
    vi.useFakeTimers(); const base = api.getMockImplementation()!;
    api.mockImplementation((...args) => args[1].startsWith('/source-leads/inquiries/mine') ? new Promise((_resolve, reject) => args[2]?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) : base(...args));
    render(view()); await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByRole('button', { name: 'Retry source conversations' })).toBeEnabled();
    expect(reads()).toHaveLength(1); expect(reads()[0][2].signal.aborted).toBe(true); expect(writes()).toHaveLength(0);
  });
});
