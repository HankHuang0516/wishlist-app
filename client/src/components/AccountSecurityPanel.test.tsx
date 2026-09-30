import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import AccountSecurityPanel from './AccountSecurityPanel';
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const response = (value: unknown, status = 200) => ({ ok: status < 300, status, json: async () => value });
const view = (value = auth) => <MemoryRouter><AuthContext.Provider value={value}><Routes>
  <Route path="/" element={<AccountSecurityPanel />} /><Route path="/login" element={<p>重新登入頁</p>} />
</Routes></AuthContext.Provider></MemoryRouter>;
beforeEach(() => { auth.logout.mockClear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const open = () => fireEvent.click(screen.getByRole('button', { name: '帳號安全' }));
const fill = () => {
  fireEvent.change(screen.getByLabelText('目前密碼'), { target: { value: 'old-password' } });
  fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: 'Newpass123' } });
  fireEvent.change(screen.getByLabelText('再次輸入新密碼'), { target: { value: 'Newpass123' } });
};

describe('web account security UI', () => {
  it('groups every security action under an accessible expandable control', () => {
    render(view());
    expect(screen.queryByLabelText('目前密碼')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '帳號安全' })).toHaveAttribute('aria-expanded', 'false');
    open();
    expect(screen.getByRole('button', { name: '帳號安全' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '撤銷所有裝置登入' })).toBeDisabled();
    expect(screen.getByRole('link', { name: '刪除本人帳號與資料' })).toHaveAttribute('href', '/account-deletion');
    expect(screen.getByRole('button', { name: '登出此裝置' })).toBeEnabled();
  });
  it('does not send a cancelled confirmation', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    render(view()); open(); fill(); fireEvent.click(screen.getByRole('button', { name: '更新密碼並重新登入' }));
    expect(fetch).not.toHaveBeenCalled(); expect(auth.logout).not.toHaveBeenCalled();
  });
  it('sends only one request while pending and logs out after a confirmed ack', async () => {
    let finish!: (value: unknown) => void;
    const fetch = vi.fn(() => new Promise(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetch);
    render(view()); open(); fill();
    fireEvent.click(screen.getByRole('button', { name: '更新密碼並重新登入' }));
    fireEvent.click(screen.getByRole('button', { name: '確認中…' }));
    fireEvent.click(screen.getByRole('button', { name: '撤銷所有裝置登入' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '登出此裝置' })).toBeDisabled();
    await act(async () => finish(response({ changed: true, requiresLogin: true, personalApiKeysRevoked: true })));
    expect(await screen.findByText('重新登入頁')).toBeInTheDocument(); expect(auth.logout).toHaveBeenCalledTimes(1);
  });
  it('does not sign out on wrong current password and clears sensitive fields', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ errorCode: 'INVALID_CREDENTIALS' }, 401)).mockResolvedValueOnce(response({ id: 19 })); vi.stubGlobal('fetch', fetch);
    render(view()); open(); fill(); fireEvent.click(screen.getByRole('button', { name: '撤銷所有裝置登入' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('目前密碼不正確');
    expect(auth.logout).not.toHaveBeenCalled(); expect(screen.getByLabelText('目前密碼')).toHaveValue('');
  });
  it('ignores an old-account result after the session changes', async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const mounted = render(view()); open(); fill(); fireEvent.click(screen.getByRole('button', { name: '撤銷所有裝置登入' }));
    mounted.rerender(view({ ...auth, token: 'different-session' }));
    await waitFor(() => expect(screen.getByLabelText('目前密碼')).toHaveValue(''));
    await act(async () => finish(response({ changed: true, requiresLogin: true })));
    expect(auth.logout).not.toHaveBeenCalled(); expect(screen.queryByText('重新登入頁')).not.toBeInTheDocument();
  });
});
