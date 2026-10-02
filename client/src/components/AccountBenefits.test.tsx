import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import AccountBenefits, { parseAllowance } from './AccountBenefits';
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const allowance = { freeMonthlyLimit: 3, freeUsedThisMonth: 1, permanentCreditsRemaining: 7, paidPurchasesAvailable: false };
const ok = (value: unknown) => ({ ok: true, json: async () => value });
const view = (token = auth.token) => <AuthContext.Provider value={{ ...auth, token }}><AccountBenefits /></AuthContext.Provider>;
beforeEach(() => localStorage.setItem('user-locale','zh-TW'));
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
describe('same-backend membership and permanent credits', () => {
  it('English retry keeps unavailable balances distinct from zero and payments paused', async () => {
    localStorage.setItem('user-locale','en-US'); const fetch=vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch',fetch);
    render(view()); await screen.findByRole('alert');
    expect(screen.getByText('Permanent credits remaining: Temporarily unverified')).toBeInTheDocument();
    expect(screen.getByText('Premium subscription · TWD 90/month')).toBeInTheDocument();
    expect(screen.getByText('Marketing credits · USD 1/10 uses')).toBeInTheDocument();
    fetch.mockImplementation(async(url:string)=>ok(url.endsWith('/users/me')?{isPremium:true}:{...allowance,paidPurchasesAvailable:true}));
    fireEvent.click(screen.getByRole('button',{name:'Recheck benefits'}));
    await screen.findByText('Permanent credits remaining: 7 uses');
    expect(screen.getByText('Purchases and subscriptions are paused')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument(); expect(fetch.mock.calls.every(([,init])=>!init.method)).toBe(true);
  });
  it('shows verified credits and paused pricing without exposing free monthly quotas early', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ok(url.endsWith('/users/me') ? { isPremium: true } : allowance)));
    render(view());
    expect(await screen.findByText('永久加值剩餘：7 次')).toBeInTheDocument();
    expect(screen.getByText('既有尊榮會員；請於原付款平台管理訂閱。')).toBeInTheDocument();
    expect(screen.getByText('尊榮版訂閱 · NT$90／月')).toBeInTheDocument();
    expect(screen.getByText('行銷小助手加值 · US$1／10 次')).toBeInTheDocument();
    expect(screen.queryByText(/本月免費次數已用完/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const premium = screen.getByText('尊榮版訂閱 · NT$90／月').closest('details')!;
    expect(premium).not.toHaveAttribute('open');
    expect(premium.querySelector('summary')).toBeInTheDocument();
    fireEvent.click(premium.querySelector('summary')!);
    // Native <details> exposes the complete description without a payment or
    // mutation action. DOM opening is also checked in the real browser review.
    expect(premium).toContainElement(screen.getByText('既有尊榮會員；請於原付款平台管理訂閱。'));
    expect(screen.getByText('永久加值剩餘：7 次').closest('details')).toBeNull();
  });
  it('only shows exhausted free allowance when the backend reports exhaustion', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ok(url.endsWith('/users/me') ? { isPremium: false } : { ...allowance, freeUsedThisMonth: 3 })));
    render(view()); expect(await screen.findByText('本月免費次數已用完')).toBeInTheDocument();
  });
  it('reports failed reads instead of an invented zero balance and retries with GET only', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('alert');
    expect(screen.getByText('永久加值剩餘：暫時無法核對')).toBeInTheDocument();
    fetch.mockImplementation(async (url: string) => ok(url.endsWith('/users/me') ? { isPremium: false } : allowance));
    fireEvent.click(screen.getByRole('button', { name: '重新核對權益' }));
    expect(await screen.findByText('永久加值剩餘：7 次')).toBeInTheDocument();
    expect(fetch.mock.calls.every(([, init]) => !init.method)).toBe(true);
  });
  it('rejects malformed balances and membership states', async () => {
    for (const value of [null, [], {}, { ...allowance, permanentCreditsRemaining: -1 }, { ...allowance, freeUsedThisMonth: '3' }])
      expect(() => parseAllowance(value)).toThrow();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ok(url.endsWith('/users/me') ? { isPremium: 'true' } : allowance)));
    render(view()); await screen.findByRole('alert'); expect(screen.queryByText('永久加值剩餘：7 次')).not.toBeInTheDocument();
  });
  it('does not display old-account benefits after switching accounts', async () => {
    let releases: ((value: unknown) => void)[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if ((init.headers as Record<string, string>).Authorization.includes('fixture-session')) return ok(url.endsWith('/users/me') ? { isPremium: true } : allowance);
      return new Promise(resolve => releases.push(resolve));
    }); vi.stubGlobal('fetch', fetch);
    const mounted = render(view()); await screen.findByText('永久加值剩餘：7 次');
    mounted.rerender(view('other-session'));
    expect(screen.queryByText('永久加值剩餘：7 次')).not.toBeInTheDocument();
    await act(async () => { releases[0](ok({ ...allowance, permanentCreditsRemaining: 2 })); releases[1](ok({ isPremium: false })); });
    expect(await screen.findByText('永久加值剩餘：2 次')).toBeInTheDocument();
  });
});
