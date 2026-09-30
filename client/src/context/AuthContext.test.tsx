import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { AUTH_SESSION_KEY, persistSession, readSession } from '../lib/authSession';
import { getFullApiUrl } from '../config';
const old = { id: 42, phoneNumber: 'synthetic-old', name: '舊合成買家' }, next = { id: 43, phoneNumber: 'synthetic-new', name: '新合成賣家' };
const ok = (user: unknown = old) => ({ ok: true, status: 200, json: async () => user });
const fetcher = vi.fn();
function Probe() {
  const auth = useAuth(), route = useLocation();
  return <><p data-testid="identity">{auth.user ? `${auth.user.id}:${auth.user.name}:${auth.token}` : 'signed-out'}</p><p data-testid="route">{route.pathname + route.search}</p>
    <button onClick={() => auth.login('new-fixture', next, '/settings')}>切換帳號</button><button onClick={auth.logout}>測試登出</button><button onClick={() => void auth.refreshUser()}>讀取帳號</button></>;
}
const mount = (path = '/settings', strict = false) => {
  const tree = <MemoryRouter initialEntries={[path]}><AuthProvider><Probe /></AuthProvider></MemoryRouter>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};
beforeEach(() => { localStorage.clear(); fetcher.mockReset().mockResolvedValue(ok()); vi.stubGlobal('fetch', fetcher); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const seed = () => persistSession(localStorage, { token: 'old-fixture', user: old }, getFullApiUrl());
describe('real provider session restoration and isolation', () => {
  it('does not crash or issue authenticated reads on corrupt or partial legacy JSON', () => {
    localStorage.setItem('token', 'fixture'); localStorage.setItem('user', '{broken'); mount();
    expect(screen.getByTestId('identity')).toHaveTextContent('signed-out'); expect(screen.getByText(/無法恢復瀏覽器登入資料/)).toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('migrates valid legacy data after a confirmed identity read without storing extra private fields', async () => {
    localStorage.setItem('token', 'old-fixture'); localStorage.setItem('user', JSON.stringify(old)); fetcher.mockResolvedValue(ok({ ...old, name: '最新確認名稱', apiKey: 'SYNTHETIC_DO_NOT_STORE' })); mount();
    await screen.findByText('42:最新確認名稱:old-fixture'); expect(readSession(localStorage, getFullApiUrl())?.user.name).toBe('最新確認名稱'); expect(localStorage.getItem(AUTH_SESSION_KEY)).not.toContain('DO_NOT_STORE'); expect(localStorage.getItem('token')).toBeNull();
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/users\/me$/), expect.objectContaining({ cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer old-fixture' } }));
  });
  it.each([200, 401])('ignores delayed previous-account HTTP %i after login switches', async status => {
    seed(); let finish!: (value: unknown) => void;
    fetcher.mockImplementation((_url, init) => init.headers.Authorization === 'Bearer old-fixture' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(ok(next))); mount();
    await waitFor(() => expect(finish).toBeDefined()); fireEvent.click(screen.getByRole('button', { name: '切換帳號' })); await screen.findByText('43:新合成賣家:new-fixture');
    await act(async () => finish(status === 200 ? ok(old) : { ok: false, status })); expect(screen.getByTestId('identity')).toHaveTextContent('43:新合成賣家:new-fixture'); expect(readSession(localStorage, getFullApiUrl())?.user.id).toBe(43); expect(screen.getByTestId('route')).toHaveTextContent('/settings');
  });
  it('does not revive a logged-out account after a delayed response body', async () => {
    seed(); let finish!: (value: unknown) => void; fetcher.mockResolvedValue({ ...ok(), json: () => new Promise(resolve => { finish = resolve; }) }); mount();
    await waitFor(() => expect(finish).toBeDefined()); fireEvent.click(screen.getByRole('button', { name: '測試登出' })); await act(async () => finish(old));
    expect(screen.getByTestId('identity')).toHaveTextContent('signed-out'); expect(readSession(localStorage, getFullApiUrl())).toBeNull();
  });
  it('keeps only the newest same-session profile read when requests return out of order', async () => {
    seed(); const resolutions: ((value: unknown) => void)[] = []; fetcher.mockImplementation(() => new Promise(resolve => resolutions.push(resolve))); mount();
    await waitFor(() => expect(resolutions).toHaveLength(1)); fireEvent.click(screen.getByRole('button', { name: '讀取帳號' })); await waitFor(() => expect(resolutions).toHaveLength(2));
    await act(async () => resolutions[1](ok({ ...old, name: '較新確認' }))); await act(async () => resolutions[0](ok({ ...old, name: '較舊確認' })));
    expect(screen.getByTestId('identity')).toHaveTextContent('較新確認'); expect(readSession(localStorage, getFullApiUrl())?.user.name).toBe('較新確認');
  });
  it('expires only the current session and preserves a validated chat return destination', async () => {
    const room = 'c11fde58-d143-423c-99f1-a13d60068f58'; seed(); localStorage.setItem('pending-fixture', 'KEEP'); fetcher.mockResolvedValue({ ok: false, status: 401 }); mount('/chat?room=' + room);
    await screen.findByText('signed-out'); expect(screen.getByTestId('route')).toHaveTextContent('/login?next=' + encodeURIComponent('/chat?room=' + room)); expect(localStorage.getItem('pending-fixture')).toBe('KEEP'); expect(readSession(localStorage, getFullApiUrl())).toBeNull();
  });
  it('treats network/server failure as unverified, not as logout or a successful update', async () => {
    seed(); fetcher.mockRejectedValue(new Error('offline')); mount(); await screen.findByText(/目前顯示上次確認內容/); expect(screen.getByTestId('identity')).toHaveTextContent('42:舊合成買家:old-fixture');
    fetcher.mockResolvedValue(ok({ ...old, name: '恢復確認' })); fireEvent.click(screen.getByRole('button', { name: '重新核對帳號' })); await screen.findByText('42:恢復確認:old-fixture'); expect(screen.queryByText(/目前顯示上次確認內容/)).not.toBeInTheDocument();
  });
  it('fails closed instead of binding a valid token response to the wrong cached user', async () => {
    seed(); fetcher.mockResolvedValue(ok(next)); mount(); await screen.findByText('signed-out'); expect(screen.queryByText(/43:新合成/)).not.toBeInTheDocument();
  });
  it('reports cache-write failure without discarding the confirmed fresh profile', async () => {
    seed(); vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); }); fetcher.mockResolvedValue(ok({ ...old, name: '最新確認' })); mount();
    await screen.findByText('42:最新確認:old-fixture'); expect(screen.getByText(/無法完整保存至瀏覽器/)).toBeInTheDocument();
  });
  it('synchronizes an atomic account change from another tab and ignores previous requests', async () => {
    seed(); let finish!: (value: unknown) => void; fetcher.mockImplementation((_url, init) => init.headers.Authorization === 'Bearer old-fixture' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(ok(next))); mount();
    await waitFor(() => expect(finish).toBeDefined()); persistSession(localStorage, { token: 'new-fixture', user: next }, getFullApiUrl()); act(() => window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SESSION_KEY })));
    await screen.findByText('43:新合成賣家:new-fixture'); await act(async () => finish({ ok: false, status: 401 })); expect(screen.getByTestId('identity')).toHaveTextContent('43:新合成賣家:new-fixture');
    persistSession(localStorage, null, getFullApiUrl()); act(() => window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SESSION_KEY }))); expect(screen.getByTestId('identity')).toHaveTextContent('signed-out');
  });
  it('cleans up safely through StrictMode mount replay and still accepts fresh identity', async () => {
    seed(); mount('/settings', true); await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2)); expect(screen.getByTestId('identity')).toHaveTextContent('42:舊合成買家:old-fixture');
    await waitFor(() => expect(localStorage.getItem(AUTH_SESSION_KEY)).not.toBeNull());
  });
  it('rejects malformed fresh account JSON without replacing the current identity', async () => {
    seed(); fetcher.mockResolvedValue(ok({ ...old, id: '42' })); mount(); await screen.findByText(/目前顯示上次確認內容/); expect(readSession(localStorage, getFullApiUrl())?.user.id).toBe(42);
  });
  it('does not restore a cached session for a different API origin', () => {
    persistSession(localStorage, { token: 'wrong-api', user: old }, 'http://different.example/api'); mount(); expect(screen.getByTestId('identity')).toHaveTextContent('signed-out'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains the signed-out record when legacy cleanup is unavailable', async () => {
    seed(); localStorage.setItem('token', 'stale'); localStorage.setItem('user', JSON.stringify(old)); mount(); await waitFor(() => expect(fetcher).toHaveBeenCalled());
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('denied'); }); fireEvent.click(screen.getByRole('button', { name: '測試登出' }));
    expect(screen.getByTestId('identity')).toHaveTextContent('signed-out'); expect(readSession(localStorage, getFullApiUrl())).toBeNull(); expect(screen.getByText(/部分舊登入資料未能清除/)).toBeInTheDocument();
  });
  it('cannot write fresh profile data after provider unmounts', async () => {
    seed(); let finish!: (value: unknown) => void; fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const view = mount(); await waitFor(() => expect(finish).toBeDefined());
    const original = localStorage.getItem(AUTH_SESSION_KEY); view.unmount(); await act(async () => finish(ok({ ...old, name: '離頁後回應' }))); expect(localStorage.getItem(AUTH_SESSION_KEY)).toBe(original);
  });
  it('synchronizes a same-account cache event by revalidating against the server', async () => {
    seed(); mount(); await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1)); fetcher.mockResolvedValue(ok({ ...old, name: '伺服器確認' }));
    persistSession(localStorage, { token: 'old-fixture', user: { ...old, name: '另頁暫存' } }, getFullApiUrl()); act(() => window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SESSION_KEY })));
    await screen.findByText('42:伺服器確認:old-fixture'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
