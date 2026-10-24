import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PublicSourceCount from './PublicSourceCount';
const reads = vi.hoisted(() => ({ publicApi: vi.fn() }));
vi.mock('../lib/marketplaceApi', () => reads);
beforeEach(() => { localStorage.setItem('user-locale', 'zh-TW'); reads.publicApi.mockReset(); });
afterEach(() => { localStorage.clear(); });
const mount = () => render(<MemoryRouter><PublicSourceCount /></MemoryRouter>);
it('displays the live public count and links to Explore without claiming stock', async () => {
 reads.publicApi.mockResolvedValue({ count: 475, enabled: true }); mount();
 expect(await screen.findByRole('link', { name: '公開來源：475 筆' })).toHaveAttribute('href', '/explore');
 expect(screen.getByText('資料參考 · 庫存待確認')).toBeInTheDocument();
 expect(reads.publicApi).toHaveBeenCalledWith('/source-leads/summary', { signal: expect.any(AbortSignal) });
});
it('localizes the actual count in English', async () => {
 localStorage.setItem('user-locale', 'en-US'); reads.publicApi.mockResolvedValue({ count: 1234, enabled: true }); mount();
 expect(await screen.findByRole('link', { name: 'Public sources: 1,234 records' })).toBeInTheDocument();
});
it.each([{count:0,enabled:true},{count:475,enabled:false},{count:-1,enabled:true},{count:1.5,enabled:true},{count:'475',enabled:true},null])('omits zero, disabled and invalid data: %j', async value => {
 reads.publicApi.mockResolvedValue(value); const view=mount();
 await waitFor(() => expect(reads.publicApi).toHaveBeenCalled()); expect(view.container).toBeEmptyDOMElement();
});
it('does not invent zero while loading or on failure', async () => {
 let reject!: (reason: Error) => void;
 reads.publicApi.mockReturnValue(new Promise((_resolve,no)=>{reject=no;})); const view=mount();
 expect(view.container).toBeEmptyDOMElement(); reject(Error('synthetic offline'));
 await waitFor(()=>expect(view.container).toBeEmptyDOMElement());
});
it('aborts a departed page so a late count cannot update it', () => {
 reads.publicApi.mockReturnValue(new Promise(()=>{})); const view=mount(); const signal=reads.publicApi.mock.calls[0][1].signal;
 view.unmount(); expect(signal.aborted).toBe(true);
});
