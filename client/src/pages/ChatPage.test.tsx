import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { makeMessage, makeRoom, roomId } from '../__tests__/fixtures/chat';
import ChatPage, { ChatRoomWeb } from './ChatPage';
import { ApiFailure } from '../lib/marketplaceApi';
const { api, data, store } = vi.hoisted(() => ({ api: vi.fn(), data: new Map<string, string>(), store: { get: vi.fn(), save: vi.fn(), clear: vi.fn() } }));
vi.mock('../lib/marketplaceApi', async original => ({ ...await original<typeof import('../lib/marketplaceApi')>(), api }));
vi.mock('../lib/webPendingStore', async original => ({ ...await original<typeof import('../lib/webPendingStore')>(), privatePendingStore: store, pendingRequestKey: async (_: string, id: number, resource: string) => `${id}.${resource}` }));
const props = { token: 'fixture', userId: 42, roomId, onBack: vi.fn() }, key = `42.message.${roomId}`;
const auth = { token: 'fixture', user: { id: 42, phoneNumber: 'synthetic-only' }, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
let room = makeRoom(), rows: ReturnType<typeof makeMessage>[] = [];
beforeEach(() => {
  localStorage.setItem('user-locale', 'zh-TW');
  data.clear(); api.mockReset(); room = makeRoom(); rows = [];
  store.get.mockReset().mockImplementation(async (key: string) => data.get(key) ?? null);
  store.save.mockReset().mockImplementation(async (key: string, body: string) => { if (data.has(key) && data.get(key) !== body) throw new Error('conflict'); data.set(key, body); });
  store.clear.mockReset().mockImplementation(async (key: string, body: string) => { if (data.get(key) !== body) return false; data.delete(key); return true; });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  api.mockImplementation(async (_token: string, path: string, init?: RequestInit) => {
    if (path.includes('/messages?')) { const params = new URL(path, 'http://fixture.test').searchParams, after = Number(params.get('afterSequence') ?? 0), before = Number(params.get('beforeSequence') ?? Infinity); return { items: rows.filter(row => row.sequence > after && row.sequence < before), nextBeforeSequence: null, nextAfterSequence: null }; }
    if (path.endsWith('/messages') && init?.method === 'POST') { const body = JSON.parse(init.body as string), item = makeMessage(rows.length + 1, body); rows.push(item); room = { ...room, lastMessageSequence: item.sequence, lastMessageText: item.text }; return item; }
    if (path.endsWith('/meetup')) return { appointment: null };
    if (path.endsWith('/read')) { const { throughSequence } = JSON.parse(init!.body as string); room = { ...room, lastReadSequence: throughSequence, unreadCount: 0 }; return room; }
    const projection = { ...room, seller: room.sellerUserId === null ? null : room.seller, buyer: room.buyerUserId === null ? null : room.buyer, listing: room.listingId === null ? null : room.listing };
    if (path.startsWith('/chat/conversations?')) return { items: [projection], nextCursor: null };
    return projection;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const roomView = (value = props) => <ChatRoomWeb {...value} />;
const posts = () => api.mock.calls.filter(call => call[2]?.method === 'POST');
describe('private chat web parity', () => {
  it('keeps QA history readable but disables new messages in an existing explicitly non-sale room',async()=>{
    room={...room,listingAvailable:false,listing:{...room.listing,title:'【QA測試非販售】歷史商品',thumbnailUrl:null}};
    rows=[makeMessage(1,{text:'原有歷史'})];room={...room,lastMessageSequence:1};
    render(roomView());await screen.findByText('原有歷史');
    expect(screen.getByRole('textbox')).toBeDisabled();expect(screen.getByRole('button',{name:'傳送訊息'})).toBeDisabled();
    expect(posts().filter(call=>call[1].endsWith('/messages'))).toHaveLength(0);
  });
  it.each([429, 401])('requires manual inbox recovery after status %s even when timers and foreground events resume', async status => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const base = api.getMockImplementation()!;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ChatPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByRole('button', { name: /合成測試漫畫/ });
    api.mockRejectedValue(new ApiFailure('private diagnostic', status, status === 429 ? 'RATE_LIMIT_EXCEEDED' : '', 120_000));
    fireEvent.click(screen.getByRole('button', { name: '重新載入收件匣' }));
    await screen.findByText(status === 429 ? /請求暫時受限/ : /登入已失效/);
    const pausedCalls = api.mock.calls.length;
    api.mockImplementation(base);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(api).toHaveBeenCalledTimes(pausedCalls);
    expect(screen.getByRole('button', { name: /合成測試漫畫/ })).toBeInTheDocument();
    expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新載入收件匣' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(pausedCalls + 1));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(api).toHaveBeenCalledTimes(pausedCalls + 2); expect(posts()).toHaveLength(0); expect(data.size).toBe(0);
  });
  it('requires manual room recovery after a limited read and keeps the pause through an unsuccessful manual retry', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const base = api.getMockImplementation()!;
    render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。');
    const original = '尚未送出原文 {version} 250.7500 USD';
    fireEvent.change(screen.getByRole('textbox', { name: /商品聊天訊息/ }), { target: { value: original } });
    api.mockRejectedValue(new ApiFailure('limited', 429, 'RATE_LIMIT_EXCEEDED', 120_000));
    fireEvent.click(screen.getByRole('button', { name: '只更新聊天' })); await screen.findByText(/請求暫時受限/);
    const pausedCalls = api.mock.calls.length; api.mockImplementation(base);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(api).toHaveBeenCalledTimes(pausedCalls);
    api.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: '只更新聊天' })); await screen.findByText(/無法更新聊天/);
    const failedRetryCalls = api.mock.calls.length; api.mockImplementation(base);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(api).toHaveBeenCalledTimes(failedRetryCalls);
    fireEvent.click(screen.getByRole('button', { name: '只更新聊天' }));
    await waitFor(() => expect(api.mock.calls.length).toBeGreaterThan(failedRetryCalls));
    await waitFor(() => expect(screen.getByRole('button', { name: '只更新聊天' })).toBeEnabled());
    const recoveredCalls = api.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(api.mock.calls.length).toBeGreaterThan(recoveredCalls);
    expect(screen.getByRole('textbox', { name: /商品聊天訊息/ })).toHaveValue(original);
    expect(posts()).toHaveLength(0); expect(data.size).toBe(0);
  });
  it('does not resume room polling when a parallel meetup preview becomes limited after the room read starts', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const base = api.getMockImplementation()!; let failPreview!: () => void;
    api.mockImplementation((...args) => args[1].endsWith('/meetup') ? new Promise((_resolve, reject) => { failPreview = () => reject(new ApiFailure('limited', 429, 'RATE_LIMIT_EXCEEDED', 120_000)); }) : base(...args));
    render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。');
    await act(async () => failPreview()); await screen.findByText(/面交狀態暫時無法確認/);
    const pausedCalls = api.mock.calls.length; api.mockImplementation(base);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); window.dispatchEvent(new Event('online')); });
    expect(api).toHaveBeenCalledTimes(pausedCalls); expect(posts()).toHaveLength(0);
  });
  it('pauses both the open appointment and its parent room when the appointment read is limited', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const base = api.getMockImplementation()!;
    render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。');
    fireEvent.click(screen.getByRole('button', { name: '查看或提議面交預約' })); await screen.findByText('尚無面交預約，先與對方討論時間再提出邀約。');
    api.mockRejectedValue(new ApiFailure('limited', 429, 'RATE_LIMIT_EXCEEDED', 120_000));
    fireEvent.click(screen.getByRole('button', { name: '只更新預約狀態' })); await screen.findByText(/請求暫時受限/);
    const pausedCalls = api.mock.calls.length; api.mockImplementation(base);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(api).toHaveBeenCalledTimes(pausedCalls); expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '關閉', exact: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(api).toHaveBeenCalledTimes(pausedCalls); expect(posts()).toHaveLength(0);
  });
  it('pauses visible-message read acknowledgements after a limited ACK until an explicit room read succeeds', async () => {
    vi.useFakeTimers();
    let callback!: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: IntersectionObserverCallback) { callback = cb; } observe() {} disconnect() {} });
    room = makeRoom({ lastMessageSequence: 1, unreadCount: 1 }); rows = [makeMessage(1, { senderUserId: 43 })];
    const base = api.getMockImplementation()!;
    render(roomView()); await act(async () => {}); expect(screen.getByText('合成測試訊息')).toBeInTheDocument();
    const article = screen.getByRole('article', { name: '對方訊息' });
    api.mockImplementation(async (...args) => { if (args[1].endsWith('/read')) throw new ApiFailure('limited', 429, 'RATE_LIMIT_EXCEEDED', 120_000); return base(...args); });
    act(() => callback([{ target: article, isIntersecting: true, intersectionRatio: 1 }] as unknown as IntersectionObserverEntry[], {} as IntersectionObserver));
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(posts()).toHaveLength(1); const pausedCalls = api.mock.calls.length; api.mockImplementation(base);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); window.dispatchEvent(new Event('online')); });
    expect(api).toHaveBeenCalledTimes(pausedCalls); expect(posts()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '只更新聊天' }));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(posts()).toHaveLength(2); expect(posts().every(call => call[1].endsWith('/read'))).toBe(true);
  });
  it('keeps the original pending message after an expired room read without starting receipt lookup automatically', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const body = JSON.stringify({ clientMessageId: crypto.randomUUID(), text: '原待確認訊息 250.7500 USD' }); data.set(key, body);
    api.mockRejectedValue(new ApiFailure('expired', 401));
    render(roomView()); await screen.findByText(/登入已失效/);
    expect(api).toHaveBeenCalledTimes(1); expect(data.get(key)).toBe(body);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(api).toHaveBeenCalledTimes(1); expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '只查核原訊息回執' }));
    expect(api).toHaveBeenCalledTimes(1); // No verified room yet; update the room before a receipt can be checked.
    expect(data.get(key)).toBe(body);
  });
  it('explains rate-limited inbox reads without declaring an empty inbox', async () => {
    localStorage.setItem('user-locale', 'en-US'); api.mockRejectedValue(new ApiFailure('limited', 429, 'RATE_LIMIT_EXCEEDED', 120_000));
    render(<MemoryRouter><AuthContext.Provider value={auth}><ChatPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByText(/Requests are temporarily limited/);
    expect(screen.queryByText(/No other item conversations/)).not.toBeInTheDocument(); expect(posts()).toHaveLength(0);
  });
  it('retains unsent original text and history after a rate-limited read without creating a journal or POST', async () => {
    render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。');
    const original = '原文草稿 250.7500 USD {version}';
    fireEvent.change(screen.getByRole('textbox', { name: /商品聊天訊息/ }), { target: { value: original } });
    api.mockRejectedValue(new ApiFailure('limited', 429, 'RATE_LIMIT_COOLDOWN', 120_000));
    fireEvent.click(screen.getByRole('button', { name: '只更新聊天' }));
    await screen.findByText('請求暫時受限，已暫停自動讀取；請稍後再試，原內容與待確認操作會保留。');
    expect(screen.getByRole('textbox', { name: /商品聊天訊息/ })).toHaveValue(original);
    expect(posts()).toHaveLength(0); expect(data.size).toBe(0);
  });
  it('reads meetup once per polling cycle while details are open instead of duplicating the parent read', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。');
    fireEvent.click(screen.getByRole('button', { name: '查看或提議面交預約' }));
    await screen.findByText('尚無面交預約，先與對方討論時間再提出邀約。');
    const before = api.mock.calls.filter(call => call[1].endsWith('/meetup')).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(api.mock.calls.filter(call => call[1].endsWith('/meetup'))).toHaveLength(before + 1); expect(posts()).toHaveLength(0);
  });
  it('uses English inbox labels while preserving original listing/contact names and unread count', async () => {
    localStorage.setItem('user-locale', 'en-US'); room = makeRoom({ lastMessageSequence: 2, unreadCount: 2 });
    render(<MemoryRouter><AuthContext.Provider value={auth}><ChatPage /></AuthContext.Provider></MemoryRouter>);
    expect(await screen.findByRole('button', { name: `${room.listing.title}, chat with 合成賣家, 2 unread` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chat and meetups' })).toBeInTheDocument();
    expect(screen.getByText('With 合成賣家 · NT$ 59')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Friends and social features' })).toHaveAttribute('href', '/social');
    expect(posts()).toHaveLength(0);
  });
  it('recovers an English lost reply in Chinese with GET only and unchanged original Unicode message identity', async () => {
    localStorage.setItem('user-locale', 'en-US'); const base = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { const result = await base(...args); if (args[1].endsWith('/messages') && args[2]?.method === 'POST') throw new Error('lost ACK'); return result; });
    const view = render(roomView()); await screen.findByText('No messages yet. Say hello.');
    const original = '中文原訊息 250.7500 USD {version}';
    fireEvent.change(screen.getByRole('textbox', { name: 'Item message (up to 2000 characters)' }), { target: { value: original } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' })); await screen.findByText(/Message delivery is unconfirmed/);
    const body = data.get(key)!; expect(JSON.parse(body)).toEqual({ clientMessageId: rows[0].clientMessageId, text: original });
    expect(posts()).toHaveLength(1); view.unmount(); localStorage.setItem('user-locale', 'zh-TW');
    render(roomView()); await screen.findByText('原訊息已確認送出。');
    expect(screen.getByText(original)).toBeInTheDocument(); expect(posts()).toHaveLength(1); expect(data.has(key)).toBe(false);
    expect(posts()[0][2].body).toBe(body);
  });
  it('keeps chat usable in English when locale storage fails and localizes validation without sending', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('locale unavailable'); });
    render(roomView()); await screen.findByText('No messages yet. Say hello.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Item message (up to 2000 characters)' }), { target: { value: 'invalid\u0000text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('Enter 1–2000 characters without invalid control characters.'); expect(posts()).toHaveLength(0); expect(data.size).toBe(0);
  });
  it('shows authenticated inbox identity, price, unread count and keeps legacy friends reachable', async () => {
    room = makeRoom({ lastMessageSequence: 2, unreadCount: 2 }); render(<MemoryRouter><AuthContext.Provider value={auth}><ChatPage /></AuthContext.Provider></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /合成測試漫畫.*2 則未讀/ })).toBeInTheDocument(); expect(screen.getByText(/合成賣家 · NT\$ 59/)).toBeInTheDocument(); expect(screen.getByRole('link', { name: '好友與原有社交功能' })).toHaveAttribute('href', '/social');
  });
  it('retains the Chinese pre-dispatch validation error and original invalid input without POST or journal', async () => {
    render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。');
    const original = '合成無效\u0000訊息';
    fireEvent.change(screen.getByRole('textbox', { name: '商品聊天訊息（最多2000字元）' }), { target: { value: original } });
    fireEvent.click(screen.getByRole('button', { name: '傳送訊息' }));
    await screen.findByText('請輸入1至2000字訊息，不含無效控制字元');
    expect(screen.getByRole('textbox', { name: '商品聊天訊息（最多2000字元）' })).toHaveValue(original);
    expect(posts()).toHaveLength(0); expect(data.size).toBe(0);
  });
  it('requires login before any private read, preserving a validated room return intention', () => {
    render(<MemoryRouter initialEntries={['/chat?room=' + roomId]}><AuthContext.Provider value={{ ...auth, token: null, user: null, isAuthenticated: false }}><ChatPage /></AuthContext.Provider></MemoryRouter>);
    expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/login?next=' + encodeURIComponent('/chat?room=' + roomId)); expect(api).not.toHaveBeenCalled();
  });
  it('does not treat failed inbox reads as zero conversations', async () => {
    api.mockRejectedValue(new Error('offline')); render(<MemoryRouter><AuthContext.Provider value={auth}><ChatPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByText(/不代表沒有對話/); expect(screen.queryByText(/其他商品尚無聊天/)).not.toBeInTheDocument();
  });
  it('commits the exact body before a single POST and renders the confirmed outgoing message', async () => {
    render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。'); fireEvent.change(screen.getByRole('textbox', { name: /商品聊天訊息/ }), { target: { value: '  合成測試面交詢問  ' } });
    const send = screen.getByRole('button', { name: '傳送訊息' }); fireEvent.click(send); fireEvent.click(send); await screen.findByText('合成測試面交詢問'); expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0][2].body).text).toBe('合成測試面交詢問'); expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(api.mock.invocationCallOrder.find((_, index) => api.mock.calls[index][2]?.method === 'POST')!); expect(data.has(key)).toBe(false);
  });
  it('freezes uncertain text and retries the same body only after an explicit click', async () => {
    const base = api.getMockImplementation()!; let lost = true;
    api.mockImplementation(async (...args) => { if (args[1].endsWith('/messages') && args[2]?.method === 'POST' && lost) { lost = false; throw new Error('lost ACK'); } return base(...args); });
    render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。'); fireEvent.change(screen.getByRole('textbox', { name: /商品聊天訊息/ }), { target: { value: '合成待確認訊息' } }); fireEvent.click(screen.getByRole('button', { name: '傳送訊息' }));
    await screen.findByText(/尚未確認訊息送出/); const body = data.get(key); expect(body).toBeTruthy(); expect(screen.getByRole('textbox', { name: /商品聊天訊息/ })).toBeDisabled(); expect(posts()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '明確重試相同訊息' })); await screen.findByText('原訊息已確認送出。'); expect(posts().map(call => call[2].body)).toEqual([body, body]); expect(data.has(key)).toBe(false);
  });
  it('restores the original receipt with GET only, without sending or fabricating a replacement ID', async () => {
    const message = makeMessage(1), body = JSON.stringify({ clientMessageId: message.clientMessageId, text: message.text }); data.set(key, body); room = makeRoom({ lastMessageSequence: 1 });
    const base = api.getMockImplementation()!; api.mockImplementation(async (...args) => args[1].includes('/by-client-id/') ? message : base(...args));
    render(roomView()); await screen.findByText('原訊息已確認送出。'); expect(posts()).toHaveLength(0); expect(screen.getByText(message.text)).toBeInTheDocument(); expect(data.has(key)).toBe(false);
  });
  it('does not erase a pending body when receipt lookup fails and allows read-only retry', async () => {
    const message = makeMessage(), body = JSON.stringify({ clientMessageId: message.clientMessageId, text: message.text }); data.set(key, body);
    const base = api.getMockImplementation()!; api.mockImplementation(async (...args) => { if (args[1].includes('/by-client-id/')) throw new Error('offline'); return base(...args); });
    render(roomView()); await screen.findByText(/無法查核原訊息回執/); fireEvent.click(screen.getByRole('button', { name: '只查核原訊息回執' })); await waitFor(() => expect(api.mock.calls.filter(call => call[1].includes('/by-client-id/'))).toHaveLength(2)); expect(posts()).toHaveLength(0); expect(data.get(key)).toBe(body);
  });
  it('never writes if secure persistence fails or if the component leaves while persistence awaits', async () => {
    let done!: () => void; store.save.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const view = render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。'); fireEvent.change(screen.getByRole('textbox', { name: /商品聊天訊息/ }), { target: { value: 'fixture' } }); fireEvent.click(screen.getByRole('button', { name: '傳送訊息' })); await waitFor(() => expect(done).toBeDefined()); view.unmount(); await act(async () => done()); expect(posts()).toHaveLength(0);
  });
  it('blocks new messages for blocked/archived rooms but preserves readable history', async () => {
    room = makeRoom({ blocked: true, blockedByOther: true, lastMessageSequence: 1 }); rows = [makeMessage(1, { senderUserId: 43 })];
    const view = render(roomView()); await screen.findByText('合成測試訊息'); expect(screen.getByRole('textbox', { name: /商品聊天訊息/ })).toBeDisabled(); expect(screen.getByRole('button', { name: '傳送訊息' })).toBeDisabled();
    view.unmount(); room = makeRoom({ archived: true, lastMessageSequence: 1, sellerUserId: null, seller: { id: null, name: null }, listingId: null, listingAvailable: false, listing: { id: null, title: '已封存的商品聊天', status: 'REMOVED', expiresAt: null, price: null, currency: 'TWD', thumbnailUrl: null } }); rows = [makeMessage(1)];
    render(roomView()); await screen.findByText('已封存的商品聊天'); expect(screen.queryByRole('button', { name: '查看或提議面交預約' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: '傳送訊息' })).toBeDisabled();
  });
  it('keeps block outcome unknown until a fresh GET and never auto reverses or retries the block', async () => {
    const base = api.getMockImplementation()!; api.mockImplementation(async (...args) => { if (args[1].startsWith('/chat/blocks/')) { room = makeRoom({ blocked: true, blockedByMe: true }); throw new Error('lost ACK'); } return base(...args); });
    render(roomView()); await screen.findByText('還沒有訊息，打聲招呼吧。'); fireEvent.click(screen.getByRole('button', { name: '封鎖對方' })); await screen.findByText(/封鎖狀態尚未確認/); expect(screen.getByRole('button', { name: '封鎖對方' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '只更新聊天' })); await screen.findByRole('button', { name: '解除封鎖' }); expect(api.mock.calls.filter(call => call[1].startsWith('/chat/blocks/'))).toHaveLength(1); expect(api.mock.calls.some(call => call[2]?.method === 'DELETE')).toBe(false);
  });
  it('marks only actually visible messages after a delay, not on opening or unseen history', async () => {
    let callback!: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: IntersectionObserverCallback) { callback = cb; } observe() {} disconnect() {} });
    room = makeRoom({ lastMessageSequence: 2, unreadCount: 2 }); rows = [makeMessage(1, { senderUserId: 43 }), makeMessage(2, { senderUserId: 43 })];
    render(roomView()); await waitFor(() => expect(screen.getAllByText('合成測試訊息')).toHaveLength(2)); await screen.findByRole('button', { name: '只更新聊天' }); expect(posts()).toHaveLength(0); vi.useFakeTimers();
    const articles = screen.getAllByRole('article', { name: '對方訊息' }); act(() => callback([{ target: articles[0], isIntersecting: true, intersectionRatio: 0.9 }, { target: articles[1], isIntersecting: false, intersectionRatio: 0 }] as unknown as IntersectionObserverEntry[], {} as IntersectionObserver));
    await act(async () => { await vi.advanceTimersByTimeAsync(499); }); expect(posts()).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(601); }); expect(posts()).toHaveLength(1); expect(JSON.parse(posts()[0][2].body)).toEqual({ throughSequence: 1 });
  });
  it('does not mark messages read after a visible callback if the page becomes hidden', async () => {
    let callback!: IntersectionObserverCallback, visible = true;
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden');
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: IntersectionObserverCallback) { callback = cb; } observe() {} disconnect() {} });
    room = makeRoom({ lastMessageSequence: 1, unreadCount: 1 }); rows = [makeMessage(1, { senderUserId: 43 })];
    render(roomView()); await screen.findByText('合成測試訊息'); await screen.findByRole('button', { name: '只更新聊天' }); vi.useFakeTimers();
    const article = screen.getByRole('article', { name: '對方訊息' }); act(() => callback([{ target: article, isIntersecting: true, intersectionRatio: 1 }] as unknown as IntersectionObserverEntry[], {} as IntersectionObserver));
    visible = false; await act(async () => { await vi.advanceTimersByTimeAsync(1100); }); expect(posts()).toHaveLength(0);
  });
  it('does not inject a delayed old-account conversation after switching session scope', async () => {
    let finish!: (value: unknown) => void; const original = makeRoom();
    api.mockImplementation((token: string, path: string) => token === 'fixture' && path === '/chat/conversations/' + roomId ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(path.endsWith('/meetup') ? { appointment: null } : path.includes('/messages?') ? { items: [], nextBeforeSequence: null, nextAfterSequence: null } : makeRoom({ buyerUserId: 44, buyer: { id: 44, name: '另一個合成買家' }, listing: { ...original.listing, title: '新帳號商品' } })));
    const view = render(<ChatRoomWeb key="42" {...props} />); await waitFor(() => expect(finish).toBeDefined()); view.rerender(<ChatRoomWeb key="44" {...props} token="next" userId={44} />);
    await screen.findByText('新帳號商品'); await act(async () => finish(original)); expect(screen.queryByText(original.listing.title)).not.toBeInTheDocument(); expect(store.get).toHaveBeenCalledWith(`44.message.${roomId}`);
  });
});
