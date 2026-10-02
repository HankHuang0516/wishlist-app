import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ListingReportWeb from './ListingReportWeb';
import { ApiFailure } from '../lib/marketplaceApi';
import { PendingStoreError } from '../lib/webPendingStore';
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
let originalLocale: string | null;
beforeEach(() => { originalLocale = localStorage.getItem('user-locale'); localStorage.setItem('user-locale', 'zh-TW'); vi.clearAllMocks(); values.clear(); api.mockImplementation(async (_token: string, path: string) => path.endsWith('/mine') ? { items: [], nextCursor: null } : Promise.reject(new Error('offline'))); });
afterEach(() => { if (originalLocale === null) localStorage.removeItem('user-locale'); else localStorage.setItem('user-locale', originalLocale); vi.restoreAllMocks(); });
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
    fireEvent.click(screen.getByRole('button', { name: '送出檢舉' })); await screen.findByText('結果尚未確認。請保留此頁文字，並查核原回執或重試恢復；不會自動送出。');
    expect(screen.queryByText('storage unavailable')).not.toBeInTheDocument();
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

describe('bilingual report outcomes with unchanged private operations', () => {
  it('changes pending display language without changing evidence or sending, then confirms the original replay', async () => {
    localStorage.setItem('user-locale', 'en-US'); values.set('report.42', JSON.stringify(pending));
    api.mockImplementation(async (_token: string, path: string) => path.endsWith('/mine') ? { items: [], nextCursor: null } : Promise.reject(new ApiFailure('private session diagnostic', 401)));
    const view = render(<ListingReportWeb {...props} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your sign-in has expired. The original report is retained.');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Report item: 合成漫畫');
    expect(screen.getByText('合成證據')).toBeInTheDocument(); expect(screen.queryByText('private session diagnostic')).not.toBeInTheDocument();
    expect(api.mock.calls.some(call => call[2]?.method === 'POST')).toBe(false);
    const calls = api.mock.calls.length; localStorage.setItem('user-locale', 'zh-TW'); view.rerender(<ListingReportWeb {...props} />);
    expect(screen.getByRole('button', { name: '只查核原回執' })).toBeEnabled(); expect(api).toHaveBeenCalledTimes(calls);
    expect(values.get('report.42')).toBe(JSON.stringify(pending));
    localStorage.setItem('user-locale', 'en-US'); view.rerender(<ListingReportWeb {...props} />);
    api.mockImplementation(async (_token: string, _path: string, init?: RequestInit) => { expect(init?.body).toBe(JSON.stringify(pending)); return { report: { ...record(), status: 'DISMISSED', version: 2 }, replayed: true }; });
    fireEvent.click(screen.getByRole('button', { name: 'Explicitly resubmit original report' }));
    expect(await screen.findByText('Review finished, item not removed')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('receipt does not mean removal');
    expect(api.mock.calls.filter(call => call[2]?.method === 'POST')).toHaveLength(1);
    expect(store.clear).toHaveBeenCalledWith('report.42', JSON.stringify(pending)); expect(values.has('report.42')).toBe(false);
  });
  it('renders the three real review statuses and original details in Taiwan time without submitting', async () => {
    localStorage.setItem('user-locale', 'en-US');
    api.mockResolvedValue({ items: ['OPEN', 'DISMISSED', 'REMOVED'].map((status, i) => ({ ...record(), id: `${i + 4}3333333-3333-4333-8333-333333333333`, clientReportId: `${i + 4}2222222-2222-4222-8222-222222222222`, status, details: '原文證據' + i })), nextCursor: null });
    render(<ListingReportWeb {...props} />);
    await screen.findByText('Received, awaiting review'); expect(screen.getByText('Review finished, item not removed')).toBeInTheDocument(); expect(screen.getByText('Review finished, item removed')).toBeInTheDocument();
    expect(screen.getByText('原文證據0')).toBeInTheDocument(); expect(screen.getAllByText('Updated: 9/30/2026, 8:00:00 AM (Taiwan time)')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Suspected fraud / misleading content' })).toHaveAttribute('value', 'FRAUD');
    expect(api.mock.calls.every(call => !call[2]?.method || call[2].method === 'GET')).toBe(true);
  });
  it('keeps English input after a storage fault and hides the raw diagnostic without POST', async () => {
    localStorage.setItem('user-locale', 'en-US'); render(<ListingReportWeb {...props} />); await screen.findByText('No received reports yet.');
    fireEvent.change(screen.getByLabelText('Additional details (optional, up to 1000 characters)'), { target: { value: 'Keep 原文 evidence' } });
    store.save.mockRejectedValueOnce(new Error('private disk diagnostic / token fixture'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Keep this page text and check the original receipt or retry recovery');
    expect(screen.getByLabelText('Additional details (optional, up to 1000 characters)')).toHaveValue('Keep 原文 evidence');
    expect(screen.queryByText('private disk diagnostic / token fixture')).not.toBeInTheDocument(); expect(api.mock.calls.some(call => call[2]?.method === 'POST')).toBe(false);
  });
  it('uses English with inaccessible locale storage and does not fabricate empty history after failure', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('private storage diagnostic'); }); api.mockRejectedValue(new Error('private report diagnostic'));
    render(<ListingReportWeb {...props} />); await screen.findByText('Report history could not be read. This does not mean there are no reports; retry explicitly.');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument(); expect(screen.queryByText('No received reports yet.')).not.toBeInTheDocument(); expect(screen.queryByText('private report diagnostic')).not.toBeInTheDocument();
  });
  it('locks a real pending-store failure until explicit recovery while keeping the original page input', async () => {
    localStorage.setItem('user-locale', 'en-US'); render(<ListingReportWeb {...props} />); await screen.findByText('No received reports yet.');
    const input = screen.getByLabelText('Additional details (optional, up to 1000 characters)'); fireEvent.change(input, { target: { value: 'Original unsubmitted evidence' } });
    store.save.mockRejectedValueOnce(new PendingStoreError()); fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Local report data could not be safely saved or read.');
    expect(screen.getByRole('button', { name: 'Submit report' })).toBeDisabled(); expect(input).toHaveValue('Original unsubmitted evidence');
    fireEvent.click(screen.getByRole('button', { name: 'Retry original report recovery' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit report' })).toBeEnabled());
    expect(input).toHaveValue('Original unsubmitted evidence'); expect(api.mock.calls.some(call => call[2]?.method === 'POST')).toBe(false);
  });
  it('requires the English abandonment fence and sends only the original content hash', async () => {
    localStorage.setItem('user-locale', 'en-US'); values.set('report.42', JSON.stringify(pending)); render(<ListingReportWeb {...props} />);
    await screen.findByRole('button', { name: 'Safely abandon an unreceived operation' });
    fireEvent.click(screen.getByRole('button', { name: 'Safely abandon an unreceived operation' }));
    expect(screen.getByRole('group', { name: 'Confirm safe abandonment' })).toHaveTextContent('A received report is not withdrawn, and the item is not deleted.');
    expect(api.mock.calls.some(call => call[2]?.method === 'POST')).toBe(false);
    api.mockImplementation(async (_token: string, path: string, init?: RequestInit) => { expect(path).toBe('/listing-reports/operations/' + pending.clientReportId + '/abandon'); expect(JSON.parse(init!.body as string)).toEqual({ requestHash: 'a'.repeat(64) }); return { operation: { clientReportId: pending.clientReportId, requestHash: 'a'.repeat(64), state: 'ABANDONED', createdAt: '2026-09-30T00:00:00.000Z' }, report: null }; });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm safe abandonment' }));
    await screen.findByText('The original unreceived operation is safely archived and will not be sent later.'); expect(api.mock.calls.filter(call => call[2]?.method === 'POST')).toHaveLength(1); expect(values.has('report.42')).toBe(false);
  });
});
