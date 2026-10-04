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
beforeEach(() => { localStorage.setItem('user-locale','zh-TW'); auth.logout.mockClear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const open = () => fireEvent.click(screen.getByRole('button', { name: '帳號安全' }));
const fill = () => {
  fireEvent.change(screen.getByLabelText('目前密碼'), { target: { value: 'old-password' } });
  fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: 'Newpass123' } });
  fireEvent.change(screen.getByLabelText('再次輸入新密碼'), { target: { value: 'Newpass123' } });
};

describe('web account security UI', () => {
  it('English confirmation can be cancelled without a request or password persistence', () => {
    localStorage.setItem('user-locale','en-US');
    const fetch = vi.fn(); vi.stubGlobal('fetch',fetch); render(view());
    fireEvent.click(screen.getByRole('button',{name:'Account security'}));
    fireEvent.change(screen.getByLabelText('Current password'),{target:{value:'Synthetic123'}});
    fireEvent.click(screen.getByRole('button',{name:'Revoke all device sessions'}));
    expect(screen.getByRole('dialog')).toHaveTextContent('including this device');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Synthetic123');
    fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled(); expect(localStorage.length).toBe(1);
    expect(screen.getByRole('link',{name:'Delete my account and data'})).toHaveAttribute('href','/account-deletion');
  });
  it('reports pending security work and clears it after an English rejected result', async () => {
    localStorage.setItem('user-locale','en-US'); const report=vi.fn(); let finish!:(value:unknown)=>void;
    vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(response({id:19})));
    render(<MemoryRouter><AuthContext.Provider value={auth}><AccountSecurityPanel initiallyOpen onOperationBusy={report}/></AuthContext.Provider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Current password'),{target:{value:'Synthetic123'}});
    fireEvent.click(screen.getByRole('button',{name:'Revoke all device sessions'}));
    expect(report).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button',{name:'Sign out on this device'})).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Confirm session revocation',exact:true}));
    await act(async()=>finish(response({errorCode:'INVALID_CREDENTIALS'},401)));
    expect(await screen.findByRole('alert')).toHaveTextContent('The current password is incorrect. No changes are confirmed.');
    expect(report).toHaveBeenLastCalledWith(false); expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(auth.logout).not.toHaveBeenCalled();
  });
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
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    render(view()); open(); fill(); fireEvent.click(screen.getByRole('button', { name: '更新密碼並重新登入' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('個人 API key 將失效');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Newpass123');
    fireEvent.click(screen.getByRole('button',{name:'保留原狀',exact:true}));
    expect(fetch).not.toHaveBeenCalled(); expect(auth.logout).not.toHaveBeenCalled();
  });
  it('sends only one request while pending and logs out after a confirmed ack', async () => {
    let finish!: (value: unknown) => void;
    const fetch = vi.fn(() => new Promise(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetch);
    render(view()); open(); fill();
    fireEvent.click(screen.getByRole('button', { name: '更新密碼並重新登入' }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'確認更新密碼',exact:true}));
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
    fireEvent.click(screen.getByRole('button',{name:'確認撤銷登入',exact:true}));
    expect(await screen.findByRole('alert')).toHaveTextContent('目前密碼不正確');
    expect(auth.logout).not.toHaveBeenCalled(); expect(screen.getByLabelText('目前密碼')).toHaveValue('');
  });
  it('ignores an old-account result after the session changes', async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const mounted = render(view()); open(); fill(); fireEvent.click(screen.getByRole('button', { name: '撤銷所有裝置登入' }));
    fireEvent.click(screen.getByRole('button',{name:'確認撤銷登入',exact:true}));
    mounted.rerender(view({ ...auth, token: 'different-session' }));
    await waitFor(() => expect(screen.getByLabelText('目前密碼')).toHaveValue(''));
    await act(async () => finish(response({ changed: true, requiresLogin: true })));
    expect(auth.logout).not.toHaveBeenCalled(); expect(screen.queryByText('重新登入頁')).not.toBeInTheDocument();
  });
  it('cancels with Escape, restores keyboard focus and does not persist credentials', () => {
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(view());open();fill();
    const trigger=screen.getByRole('button',{name:'撤銷所有裝置登入',exact:true});trigger.focus();fireEvent.click(trigger);
    const dialog=screen.getByRole('dialog',{name:'確認帳號安全操作'});
    expect(document.activeElement).toBe(dialog);
    expect(screen.getByLabelText('目前密碼')).toBeDisabled();
    expect(screen.getByRole('link',{name:'刪除本人帳號與資料'})).toHaveAttribute('aria-disabled','true');
    fireEvent.keyDown(dialog,{key:'Escape'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(document.activeElement).toBe(trigger);
    expect(fetch).not.toHaveBeenCalled();expect(window.confirm).not.toHaveBeenCalled();expect(localStorage.length).toBe(1);
  });
  it('drops an unsubmitted confirmation when the authenticated session changes', async () => {
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const mounted=render(view());open();fill();
    fireEvent.click(screen.getByRole('button',{name:'撤銷所有裝置登入',exact:true}));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    mounted.rerender(view({...auth,token:'different-session'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('目前密碼')).toHaveValue('');expect(fetch).not.toHaveBeenCalled();expect(auth.logout).not.toHaveBeenCalled();
  });
  it('blocks confirmation when a reload becomes pending and still permits cancellation', () => {
    const fetch=vi.fn(),report=vi.fn();vi.stubGlobal('fetch',fetch);
    const renderPanel=(reloadPending:boolean)=><MemoryRouter><AuthContext.Provider value={auth}><AccountSecurityPanel initiallyOpen onOperationBusy={report} reloadPending={reloadPending}/></AuthContext.Provider></MemoryRouter>;
    const mounted=render(renderPanel(false));fill();fireEvent.click(screen.getByRole('button',{name:'撤銷所有裝置登入',exact:true}));
    mounted.rerender(renderPanel(true));expect(screen.getByRole('button',{name:'確認撤銷登入',exact:true})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'確認撤銷登入',exact:true}));expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'取消',exact:true}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(report).toHaveBeenLastCalledWith(false);
  });
});
