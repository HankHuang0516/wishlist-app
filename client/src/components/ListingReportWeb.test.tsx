import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ListingReportWeb from './ListingReportWeb';
const { api, values, store } = vi.hoisted(() => {
  const values = new Map<string, string>();
  return { values, api: vi.fn(), store: { get: vi.fn(async (key: string) => values.get(key) ?? null), save: vi.fn(async (key: string, body: string) => {
    if (values.has(key) && values.get(key) !== body) throw new Error('conflict'); values.set(key, body);
  }), clear: vi.fn(async (key: string, body: string) => { if (values.get(key) !== body) return false; values.delete(key); return true; }) } };
});
vi.mock('../lib/marketplaceApi', async importOriginal => ({ ...await importOriginal<typeof import('../lib/marketplaceApi')>(), api }));
vi.mock('../lib/webPendingStore', async importOriginal => ({ ...await importOriginal<typeof import('../lib/webPendingStore')>(), privatePendingStore: store, pendingRequestKey: async (_: string, user: number) => `report.${user}`, sha256: async () => 'a'.repeat(64) }));
const listing = { id: '11111111-1111-4111-8111-111111111111', title: '合成漫畫', available: true };
const pending = { clientReportId: '22222222-2222-4222-8222-222222222222', listingId: listing.id, reason: 'FRAUD', details: '合成證據' };
const record = (body = pending) => ({ ...body, details: body.details ?? null, id: '33333333-3333-4333-8333-333333333333', status: 'OPEN', version: 1, createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' });
const props = { token: 'fixture', userId: 42, listing, onClose: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); values.clear(); api.mockImplementation(async (_token: string, path: string) => path.endsWith('/mine') ? { items: [], nextCursor: null } : Promise.reject(new Error('offline'))); });
describe('private report UX and safe recovery', () => {
  it('saves the exact body before HTTP and ignores synchronous double clicks', async () => {
    let finish!: (value: unknown) => void;
    api.mockImplementation(async (_token: string, path: string, init?: RequestInit) => {
      if (path.endsWith('/mine')) return { items: [], nextCursor: null };
      expect(values.get('report.42')).toBe(init!.body); return new Promise(resolve => { finish = resolve; });
    });
    render(<ListingReportWeb {...props} />); await screen.findByText('尚無已收件紀錄。');
    fireEvent.change(screen.getByLabelText(/補充說明/), { target: { value: '合成證據' } });
    const send = screen.getByRole('button', { name: '送出檢舉' }); fireEvent.click(send); fireEvent.click(send);
    await waitFor(() => expect(finish).toBeDefined()); expect(api.mock.calls.filter(call => call[2]?.method === 'POST')).toHaveLength(1);
    const sent = JSON.parse(values.get('report.42')!); await act(async () => finish({ report: record(sent), replayed: false }));
    expect(await screen.findByText('已收件，待審核')).toBeInTheDocument(); expect(values.has('report.42')).toBe(false);
    expect(screen.queryByRole('button', { name: '送出檢舉' })).not.toBeInTheDocument();
  });
  it('restores via GET only, retains unknown result and retries the original ID/body explicitly', async () => {
    values.set('report.42', JSON.stringify(pending)); render(<ListingReportWeb {...props} />);
    await screen.findByRole('button', { name: '只查核原回執' }); await waitFor(() => expect(api.mock.calls.some(call => call[1].includes('/receipts/'))).toBe(true));
    expect(api.mock.calls.some(call => call[2]?.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '明確重新送出原檢舉' }));
    await waitFor(() => expect(api.mock.calls.filter(call => call[2]?.method === 'POST')).toHaveLength(1));
    expect(api.mock.calls.find(call => call[2]?.method === 'POST')![2].body).toBe(JSON.stringify(pending)); expect(values.get('report.42')).toBe(JSON.stringify(pending));
  });
  it('requires confirmation for a hash-only abandonment and does not pretend it cancels a received case', async () => {
    values.set('report.42', JSON.stringify(pending)); render(<ListingReportWeb {...props} />);
    await screen.findByRole('button', { name: '安全放棄未收件操作' });
    api.mockImplementation(async (_token: string, path: string, init?: RequestInit) => {
      if (path.endsWith('/abandon')) { expect(JSON.parse(init!.body as string)).toEqual({ requestHash: 'a'.repeat(64) }); return { operation: { clientReportId: pending.clientReportId, requestHash: 'a'.repeat(64), state: 'ABANDONED', createdAt: '2026-09-30T00:00:00.000Z' }, report: null }; }
      return { items: [], nextCursor: null };
    });
    fireEvent.click(screen.getByRole('button', { name: '安全放棄未收件操作' })); expect(api.mock.calls.some(call => call[2]?.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '確認安全放棄' }));
    expect(await screen.findByText('未被收件的原操作已安全封存，不會稍後送出。')).toBeInTheDocument(); expect(values.has('report.42')).toBe(false);
  });
  it('never sends evidence when storage fails', async () => {
    render(<ListingReportWeb {...props} />); await screen.findByText('尚無已收件紀錄。'); store.save.mockRejectedValueOnce(new Error('storage unavailable'));
    fireEvent.click(screen.getByRole('button', { name: '送出檢舉' })); await screen.findByText('storage unavailable');
    expect(api.mock.calls.some(call => call[2]?.method === 'POST')).toBe(false);
  });
  it('blocks new reports with corrupt pending data and does not fabricate empty history on read failure', async () => {
    values.set('report.42', '{bad'); api.mockRejectedValue(new Error('offline'));
    render(<ListingReportWeb {...props} />); await screen.findByText(/無法安全恢復原檢舉/); expect(screen.getByRole('button', { name: '送出檢舉' })).toBeDisabled();
    await screen.findByText(/無法讀取檢舉紀錄/); expect(screen.queryByText('尚無已收件紀錄。')).not.toBeInTheDocument();
  });
  it('does not start the POST after the UI closes during persistence', async () => {
    let saved!: () => void; store.save.mockImplementationOnce(() => new Promise(resolve => { saved = resolve; }));
    const view = render(<ListingReportWeb {...props} />); await screen.findByText('尚無已收件紀錄。'); fireEvent.click(screen.getByRole('button', { name: '送出檢舉' }));
    await waitFor(() => expect(saved).toBeDefined()); view.unmount(); await act(async () => saved());
    expect(api.mock.calls.some(call => call[2]?.method === 'POST')).toBe(false);
  });
  it('reads only the current account scope after remount and ignores old delayed history', async () => {
    let finish!: (value: unknown) => void; api.mockImplementation((_token: string) => _token === 'fixture' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ items: [], nextCursor: null }));
    const view = render(<ListingReportWeb key="42" {...props} />); await waitFor(() => expect(finish).toBeDefined());
    view.rerender(<ListingReportWeb key="43" {...props} userId={43} token="next" />); await screen.findByText('尚無已收件紀錄。');
    await act(async () => finish({ items: [record()], nextCursor: null })); expect(screen.queryByText('合成證據')).not.toBeInTheDocument(); expect(store.get).toHaveBeenCalledWith('report.43');
  });
});
