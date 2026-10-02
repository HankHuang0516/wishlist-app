import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMeetup, makeRoom } from '../__tests__/fixtures/chat';
import type { MeetupRecord } from '../lib/meetupData';
import MeetupWeb from './MeetupWeb';
import { ApiFailure } from '../lib/marketplaceApi';
const { api, data, store } = vi.hoisted(() => ({ api: vi.fn(), data: new Map<string, string>(), store: { get: vi.fn(), save: vi.fn(), clear: vi.fn() } }));
vi.mock('../lib/marketplaceApi', async original => ({ ...await original<typeof import('../lib/marketplaceApi')>(), api }));
vi.mock('../lib/webPendingStore', async original => ({ ...await original<typeof import('../lib/webPendingStore')>(), privatePendingStore: store, pendingRequestKey: async (_: string, id: number, resource: string) => `${id}.${resource}` }));
const props = { token: 'fixture', userId: 42, room: makeRoom(), onClose: vi.fn() }, key = `42.meetup.${props.room.id}`;
let appointment: MeetupRecord | null;
beforeEach(() => {
  localStorage.setItem('user-locale', 'zh-TW');
  data.clear(); api.mockReset(); appointment = null;
  store.get.mockReset().mockImplementation(async (key: string) => data.get(key) ?? null);
  store.save.mockReset().mockImplementation(async (key: string, body: string) => { if (data.has(key) && data.get(key) !== body) throw new Error('conflict'); data.set(key, body); });
  store.clear.mockReset().mockImplementation(async (key: string, body: string) => { if (data.get(key) !== body) return false; data.delete(key); return true; });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  api.mockImplementation(async (_token: string, _path: string, init?: RequestInit) => {
    if (!init?.method) return { appointment };
    const req = JSON.parse(init.body as string);
    if (req.action === 'PROPOSE' || req.action === 'REVISE') appointment = makeMeetup({ version: req.expectedVersion + 1, proposedByUserId: 42, startsAt: req.terms.startsAt, endsAt: new Date(Date.parse(req.terms.startsAt) + req.terms.durationMinutes * 60000).toISOString(), placeName: req.terms.placeName, notes: req.terms.notes, latitude: req.terms.latitude ?? null, longitude: req.terms.longitude ?? null, buyerConfirmedAt: '2026-10-01T00:00:00.000Z', sellerConfirmedAt: null });
    else if (req.action === 'CONFIRM') appointment = { ...appointment!, status: 'CONFIRMED', buyerConfirmedAt: '2026-10-01T00:00:00.000Z' };
    else if (req.action === 'CANCEL') appointment = { ...appointment!, status: 'CANCELLED' };
    else if (req.action === 'COMPLETE') appointment = { ...appointment!, buyerCompletedAt: '2026-10-01T00:00:00.000Z' };
    return { replayed: false, appointment, receipt: { abandoned: false, conversationId: props.room.id, actorUserId: 42, clientActionId: req.clientActionId, action: req.action, resultingVersion: appointment!.version } };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const posts = () => api.mock.calls.filter(call => call[2]?.method === 'POST');
describe('private meetup web parity', () => {
  it('requires manual appointment recovery after rate limiting and preserves the original unsent fields', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    localStorage.setItem('user-locale', 'en-US'); const base = api.getMockImplementation()!;
    render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: 'Propose meetup' }));
    fireEvent.change(screen.getByLabelText('Private meetup place'), { target: { value: '原集合點 250.7500 USD' } });
    fireEvent.change(screen.getByLabelText('Meetup notes (optional, up to 1000 characters)'), { target: { value: '原備註 {version}' } });
    api.mockRejectedValue(new ApiFailure('limited', 429, 'RATE_LIMIT_EXCEEDED', 120_000));
    fireEvent.click(screen.getByRole('button', { name: 'Update appointment status only' })); await screen.findByText(/Requests are temporarily limited/);
    const pausedCalls = api.mock.calls.length; api.mockImplementation(base);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(api).toHaveBeenCalledTimes(pausedCalls);
    api.mockRejectedValue(new Error('offline')); fireEvent.click(screen.getByRole('button', { name: 'Update appointment status only' })); await screen.findByText(/The appointment could not be updated/);
    const failedRetryCalls = api.mock.calls.length; api.mockImplementation(base);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); expect(api).toHaveBeenCalledTimes(failedRetryCalls);
    fireEvent.click(screen.getByRole('button', { name: 'Update appointment status only' })); await waitFor(() => expect(api).toHaveBeenCalledTimes(failedRetryCalls + 1));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); expect(api).toHaveBeenCalledTimes(failedRetryCalls + 2);
    expect(screen.getByLabelText('Private meetup place')).toHaveValue('原集合點 250.7500 USD');
    expect(screen.getByLabelText('Meetup notes (optional, up to 1000 characters)')).toHaveValue('原備註 {version}');
    expect(posts()).toHaveLength(0); expect(data.size).toBe(0);
  });
  it('pauses expired-session appointment reads without clearing the original pending consent', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const body = JSON.stringify({ clientActionId: crypto.randomUUID(), action: 'CONFIRM', expectedVersion: 1 }); data.set(key, body);
    api.mockRejectedValue(new ApiFailure('expired private diagnostic', 401));
    render(<MeetupWeb {...props} />); await screen.findByText(/無法更新面交預約/);
    const pausedCalls = api.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(api).toHaveBeenCalledTimes(pausedCalls); expect(data.get(key)).toBe(body); expect(posts()).toHaveLength(0);
    expect(screen.queryByText('expired private diagnostic')).not.toBeInTheDocument();
  });
  it('preserves unsent English terms after a rate-limited refresh without writing an appointment', async () => {
    localStorage.setItem('user-locale', 'en-US'); render(<MeetupWeb {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Propose meetup' }));
    fireEvent.change(screen.getByLabelText('Private meetup place'), { target: { value: '合成公共集合點 {version}' } });
    fireEvent.change(screen.getByLabelText('Meetup notes (optional, up to 1000 characters)'), { target: { value: '原備註 250.7500 USD' } });
    api.mockRejectedValue(new ApiFailure('limited', 429, 'RATE_LIMIT_EXCEEDED', 120_000));
    fireEvent.click(screen.getByRole('button', { name: 'Update appointment status only' }));
    await screen.findByText(/Requests are temporarily limited/);
    expect(screen.getByLabelText('Private meetup place')).toHaveValue('合成公共集合點 {version}');
    expect(screen.getByLabelText('Meetup notes (optional, up to 1000 characters)')).toHaveValue('原備註 250.7500 USD');
    expect(posts()).toHaveLength(0); expect(data.size).toBe(0);
  });
  it('uses English appointment controls but sends the original private terms and Taiwan instant', async () => {
    localStorage.setItem('user-locale', 'en-US'); render(<MeetupWeb {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Propose meetup' }));
    fireEvent.change(screen.getByLabelText('Meetup date and time (Taiwan time)'), { target: { value: '2099-10-02T14:00' } });
    fireEvent.change(screen.getByLabelText('Private meetup place'), { target: { value: '原中文集合點 {version}' } });
    fireEvent.change(screen.getByLabelText('Meetup notes (optional, up to 1000 characters)'), { target: { value: '保留原文與小數 250.7500 USD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose these terms (changes require new approval)' }));
    await screen.findByText('Proposed · Version 1'); expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0][2].body)).toMatchObject({ action: 'PROPOSE', expectedVersion: 0, terms: { startsAt: '2099-10-02T06:00:00.000Z', timeZone: 'Asia/Taipei', durationMinutes: 60, placeName: '原中文集合點 {version}', notes: '保留原文與小數 250.7500 USD' } });
    expect(screen.getByText('Buyer: agreed · Seller: not yet agreed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close', exact: true })).toBeInTheDocument(); expect(data.has(key)).toBe(false);
  });
  it('translates old-version recovery without changing the original pending operation or approving newer terms', async () => {
    localStorage.setItem('user-locale', 'en-US'); appointment = makeMeetup({ version: 2 });
    const req = { clientActionId: crypto.randomUUID(), action: 'CONFIRM', expectedVersion: 1 }, body = JSON.stringify(req); data.set(key, body);
    render(<MeetupWeb {...props} />); await screen.findByText('Proposed · Version 2'); expect(posts()).toHaveLength(0); expect(data.get(key)).toBe(body);
    api.mockImplementation(async (_token: string, _path: string, init?: RequestInit) => init?.method ? { replayed: true, appointment, receipt: { ...req, abandoned: false, resultingVersion: 1, actorUserId: 42, conversationId: props.room.id } } : { appointment });
    fireEvent.click(screen.getByRole('button', { name: 'Retry original operation' }));
    await screen.findByText('The original version 1 operation is verified. Review the current version 2 separately.');
    expect(posts()).toHaveLength(1); expect(posts()[0][2].body).toBe(body); expect(screen.getByText('Buyer: not yet agreed · Seller: agreed')).toBeInTheDocument();
  });
  it('preserves unsent original place when an English appointment refresh detects newer terms', async () => {
    localStorage.setItem('user-locale', 'en-US'); appointment = makeMeetup(); render(<MeetupWeb {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Propose a new time or place' }));
    fireEvent.change(screen.getByLabelText('Private meetup place'), { target: { value: '本人未送出中文草稿' } });
    appointment = makeMeetup({ version: 2, placeName: '對方新的集合點' }); fireEvent.click(screen.getByRole('button', { name: 'Update appointment status only' }));
    await screen.findByText('Proposed · Version 2'); expect(screen.getByLabelText('Private meetup place')).toHaveValue('本人未送出中文草稿');
    expect(screen.getByRole('button', { name: 'Propose these terms (changes require new approval)' })).toBeDisabled(); expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Load latest version and edit again' })); expect(screen.getByLabelText('Private meetup place')).toHaveValue('對方新的集合點');
  });
  it('proposes explicit Taiwan time, units, private place and coordinates exactly once after durable save', async () => {
    render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: '提出面交邀約' }));
    fireEvent.change(screen.getByLabelText('面交日期與時間（台灣時間）'), { target: { value: '2099-10-02T14:00' } });
    fireEvent.change(screen.getByLabelText('私密面交地點名稱'), { target: { value: '合成測試車站出口' } });
    fireEvent.change(screen.getByLabelText('私密面交緯度（選填）'), { target: { value: '25.05' } }); fireEvent.change(screen.getByLabelText('私密面交經度（選填，須與緯度同填）'), { target: { value: '121.51' } });
    const send = screen.getByRole('button', { name: '提出此版本（改期需對方重新同意）' }); fireEvent.click(send); fireEvent.click(send);
    await screen.findByText('提議中 · 第1版'); expect(posts()).toHaveLength(1);
    const body = JSON.parse(posts()[0][2].body); expect(body).toMatchObject({ action: 'PROPOSE', expectedVersion: 0, terms: { startsAt: '2099-10-02T06:00:00.000Z', durationMinutes: 60, timeZone: 'Asia/Taipei', placeName: '合成測試車站出口', latitude: 25.05, longitude: 121.51 } });
    expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(api.mock.invocationCallOrder.at(-1)!); expect(data.has(key)).toBe(false); expect(screen.getByText('買家已同意 · 賣家尚未同意')).toBeInTheDocument();
  });
  it('requires both parties for confirmation and does not let my completion imply both completed', async () => {
    appointment = makeMeetup(); render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: '同意第1版時間與地點' }));
    await screen.findByText('雙方已確認 · 第1版'); expect(JSON.parse(posts()[0][2].body)).toMatchObject({ action: 'CONFIRM', expectedVersion: 1 });
    expect(screen.queryByRole('button', { name: /我已完成面交/ })).not.toBeInTheDocument();
  });
  it('permits cancellation even when blocked and unavailable, without changing terms version', async () => {
    appointment = makeMeetup(); render(<MeetupWeb {...props} room={makeRoom({ blocked: true, blockedByMe: true, listingAvailable: false })} />);
    expect(await screen.findByRole('button', { name: '同意第1版時間與地點' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '取消第1版預約' }));
    await screen.findByText('已取消 · 第1版'); expect(JSON.parse(posts()[0][2].body)).toMatchObject({ action: 'CANCEL', expectedVersion: 1 });
  });
  it('does not call one participant completion a completed trade and hides repeat completion', async () => {
    appointment = makeMeetup({ status: 'CONFIRMED', startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() - 1).toISOString(), buyerConfirmedAt: '2026-10-01T00:00:00.000Z' });
    render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: '我已完成面交（仍需對方回報）' }));
    await screen.findByText('買家已回報完成 · 賣家尚未回報'); expect(screen.getByText('雙方已確認 · 第1版')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /我已完成面交/ })).not.toBeInTheDocument(); expect(JSON.parse(posts()[0][2].body)).toMatchObject({ action: 'COMPLETE', expectedVersion: 1 });
    appointment = { ...appointment!, status: 'COMPLETED', sellerCompletedAt: '2026-10-01T00:00:00.000Z' };
    fireEvent.click(screen.getByRole('button', { name: '只更新預約狀態' })); await screen.findByText('雙方已回報完成 · 第1版');
    expect(screen.queryByRole('button', { name: '提議改期或修改地點' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: /取消第/ })).not.toBeInTheDocument();
  });
  it('keeps a confirmed acknowledgement when local cleanup fails and never permits a fresh action', async () => {
    appointment = makeMeetup(); store.clear.mockRejectedValue(new Error('IDB unavailable'));
    render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: '同意第1版時間與地點' }));
    await screen.findByText(/後台操作已確認，但本機待確認標記尚未清除/); expect(screen.getByText('雙方已確認 · 第1版')).toBeInTheDocument();
    expect(data.has(key)).toBe(true); expect(screen.queryByRole('button', { name: /取消第/ })).not.toBeInTheDocument(); expect(posts()).toHaveLength(1);
    expect(screen.getByRole('button', { name: '明確重試原操作' })).toBeInTheDocument();
  });
  it('revises terms with the exact shown version and reopens consent instead of preserving both approvals', async () => {
    appointment = makeMeetup(); render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: '提議改期或修改地點' }));
    fireEvent.change(screen.getByLabelText('私密面交地點名稱'), { target: { value: '新的合成地點' } }); fireEvent.click(screen.getByRole('button', { name: '提出此版本（改期需對方重新同意）' }));
    await screen.findByText('提議中 · 第2版'); expect(JSON.parse(posts()[0][2].body)).toMatchObject({ action: 'REVISE', expectedVersion: 1, terms: { placeName: '新的合成地點' } }); expect(screen.getByText('買家已同意 · 賣家尚未同意')).toBeInTheDocument();
  });
  it('blocks stale editing after a poll updates the terms version and requires deliberate reload', async () => {
    appointment = makeMeetup(); render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: '提議改期或修改地點' })); fireEvent.change(screen.getByLabelText('私密面交地點名稱'), { target: { value: '本人尚未送出的地點' } });
    appointment = makeMeetup({ version: 2, placeName: '對方更新後的地點' }); fireEvent.click(screen.getByRole('button', { name: '只更新預約狀態' }));
    await screen.findByText('提議中 · 第2版'); expect(screen.getByRole('button', { name: '提出此版本（改期需對方重新同意）' })).toBeDisabled(); expect(screen.getByLabelText('私密面交地點名稱')).toHaveValue('本人尚未送出的地點'); expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '載入最新版本後重新編輯' })); expect(screen.getByLabelText('私密面交地點名稱')).toHaveValue('對方更新後的地點');
  });
  it('restores GET-only and retries exactly the old action without pretending newer terms were accepted', async () => {
    appointment = makeMeetup({ version: 2 }); const req = { clientActionId: crypto.randomUUID(), action: 'CONFIRM', expectedVersion: 1 }, body = JSON.stringify(req); data.set(key, body);
    render(<MeetupWeb {...props} />); await screen.findByRole('button', { name: '明確重試原操作' }); await screen.findByText('提議中 · 第2版'); expect(posts()).toHaveLength(0);
    api.mockImplementation(async (_token: string, _path: string, init?: RequestInit) => init?.method ? { replayed: true, appointment, receipt: { ...req, abandoned: false, resultingVersion: 1, actorUserId: 42, conversationId: props.room.id } } : { appointment });
    fireEvent.click(screen.getByRole('button', { name: '明確重試原操作' })); await screen.findByText('已確認先前第1版操作；目前第2版仍需重新核對。');
    expect(posts()[0][2].body).toBe(body); expect(screen.getByText('買家尚未同意 · 賣家已同意')).toBeInTheDocument();
  });
  it('uses an explicit abandonment fence and does not cancel an existing appointment', async () => {
    appointment = makeMeetup(); const req = { clientActionId: crypto.randomUUID(), action: 'CONFIRM', expectedVersion: 1 }, body = JSON.stringify(req); data.set(key, body);
    render(<MeetupWeb {...props} />); await screen.findByText('提議中 · 第1版'); fireEvent.click(screen.getByRole('button', { name: '安全放棄待確認操作' })); expect(posts()).toHaveLength(0);
    api.mockImplementation(async (_token: string, path: string, init?: RequestInit) => init?.method ? (expect(path).toMatch(/\/abandon$/), { replayed: false, appointment, receipt: { ...req, abandoned: true, resultingVersion: 0, actorUserId: 42, conversationId: props.room.id } }) : { appointment });
    fireEvent.click(screen.getByRole('button', { name: '確認安全放棄（不取消現有預約）' })); await screen.findByText('原待確認操作已安全放棄；這不會取消已成立的預約。'); expect(screen.getByText('提議中 · 第1版')).toBeInTheDocument(); expect(posts()[0][2].body).toBe(body);
  });
  it('retains exact lost-ACK data across close/reopen; does not auto POST', async () => {
    appointment = makeMeetup(); api.mockImplementation(async (_token: string, _path: string, init?: RequestInit) => { if (init?.method) throw new Error('lost ACK'); return { appointment }; });
    const view = render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: '同意第1版時間與地點' })); await screen.findByText(/尚未確認操作結果/); const body = data.get(key); expect(body).toBeTruthy(); view.unmount();
    render(<MeetupWeb {...props} />); await screen.findByRole('button', { name: '明確重試原操作' }); expect(posts()).toHaveLength(1); expect(data.get(key)).toBe(body);
  });
  it('does not mistake the old empty snapshot for proof a lost-ACK proposal never existed', async () => {
    api.mockImplementation(async (_token: string, _path: string, init?: RequestInit) => { if (init?.method) throw new Error('lost ACK'); return { appointment: null }; });
    render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: '提出面交邀約' }));
    fireEvent.change(screen.getByLabelText('私密面交地點名稱'), { target: { value: '合成測試地點' } }); fireEvent.click(screen.getByRole('button', { name: '提出此版本（改期需對方重新同意）' }));
    await screen.findByText(/不能據此認定邀約未成立/); expect(screen.queryByText('尚無面交預約，先與對方討論時間再提出邀約。')).not.toBeInTheDocument();
    expect(screen.getByText(/原操作：提出邀約/)).toBeInTheDocument(); expect(posts()).toHaveLength(1);
  });
  it('does not send HTTP after leaving while persistence is incomplete', async () => {
    appointment = makeMeetup(); let done!: () => void; store.save.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const view = render(<MeetupWeb {...props} />); fireEvent.click(await screen.findByRole('button', { name: '同意第1版時間與地點' })); await waitFor(() => expect(done).toBeDefined()); view.unmount(); await act(async () => done()); expect(posts()).toHaveLength(0);
  });
  it('distinguishes load failure from no appointment and rejects corrupt private journal before writes', async () => {
    data.set(key, '{bad'); api.mockRejectedValue(new Error('offline')); render(<MeetupWeb {...props} />); await screen.findByText(/無法安全恢復待確認預約/); await screen.findByText(/無法更新面交預約/);
    expect(screen.queryByText(/尚無面交預約/)).not.toBeInTheDocument(); expect(posts()).toHaveLength(0);
  });
});
