import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SettingsPage from './SettingsPage';
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const profile = { id: 19, name: '合成帳號', phoneNumber: 'fixture', nicknames: '合成暱稱', birthday: '1993-05-16', isPremium: false,
  isAvatarVisible: false, isRealNameVisible: false, isBirthdayVisible: false, isAddressVisible: false, isPhoneVisible: false, isEmailVisible: false };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const view = (value = auth) => <MemoryRouter><AuthContext.Provider value={value}><SettingsPage /></AuthContext.Provider></MemoryRouter>;
beforeEach(() => localStorage.setItem('user-locale', 'zh-TW'));
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('settings hub retains web-only functionality while adding app actions', () => {
  it('has one birthday field and accessible visibility labels alongside app and legacy entries', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ok(url.endsWith('/availability') ? { freeMonthlyLimit: 3, freeUsedThisMonth: 1, permanentCreditsRemaining: 0, paidPurchasesAvailable: false }
      : url.endsWith('/ai-usage') ? { used: 1, limit: 3, isUnlimited: false } : profile)));
    render(view()); await screen.findByRole('heading', { name: '個人資料' });
    expect(screen.getAllByLabelText('生日')).toHaveLength(1);
    for (const label of ['公開生日', '公開手機號碼', '公開真實姓名', '公開電子信箱', '公開寄送地址']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /我的商品 · 閱覽與管理/ })).toHaveAttribute('href', '/my-listings');
    expect(screen.getByRole('link', { name: /刊登好物/ })).toHaveAttribute('href', '/sell');
    expect(screen.getByRole('link', { name: /通知設定/ })).toHaveAttribute('href', '/settings/notifications');
    const advanced = screen.getByText('進階功能').closest('details')!;
    expect(advanced).not.toHaveAttribute('open'); advanced.setAttribute('open', '');
    expect(screen.getByRole('link', { name: /查看贊助與購買紀錄/ })).toHaveAttribute('href', '/purchase-history');
    expect(screen.getByRole('button', { name: /一鍵複製 AI 指令/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上傳大頭照' })).toHaveAttribute('tabindex', '0');
  });
  it('does not show nickname saved just because a field blurred before an HTTP acknowledgement', async () => {
    let ack!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => init?.method === 'PUT' ? new Promise(resolve => { ack = resolve; }) : ok(url.endsWith('/availability') ? { freeMonthlyLimit: 3, freeUsedThisMonth: 1, permanentCreditsRemaining: 0, paidPurchasesAvailable: false } : profile)));
    render(view()); const input = await screen.findByLabelText('暱稱');
    fireEvent.change(input, { target: { value: '新暱稱' } }); fireEvent.blur(input);
    expect(document.getElementById('nickname-saved')).toHaveClass('opacity-0');
    await act(async () => ack(ok({ ...profile, nicknames: '新暱稱' })));
    expect(document.getElementById('nickname-saved')).toHaveClass('opacity-100');
  });
  it('does not render private profile responses from a previous account', async () => {
    const old: ((value: unknown) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.headers as Record<string, string>).Authorization === 'Bearer fixture-session') return new Promise(resolve => old.push(resolve));
      return ok({ ...profile, id: 20, name: '新合成帳號', nicknames: '新暱稱' });
    }));
    const mounted = render(view()); mounted.rerender(view({ ...auth, user: { id: 20, phoneNumber: 'other' }, token: 'other-session' }));
    await screen.findByDisplayValue('新暱稱');
    await act(async () => old.forEach(resolve => resolve(ok(profile))));
    expect(screen.queryByText(/^姓名: 合成帳號$/)).not.toBeInTheDocument(); expect(screen.getByDisplayValue('新暱稱')).toBeInTheDocument();
  });
});
