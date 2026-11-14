import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { AUTH_SESSION_KEY } from '../lib/authSession';
import { hasProductNoticeAck, productNoticeBody, PRODUCT_NOTICE_KEY } from '../lib/productNotice';
import { getFullApiUrl } from '../config';
import { t } from '../utils/localization';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ProductNoticeWeb from './ProductNoticeWeb';
import { ProductNoticeVisitProvider } from '../context/ProductNoticeVisitContext';
import * as config from '../config';

const ackLabel = 'I understand, remember this notice';
const summary = 'Weesh → Wishlist.ai: accounts and data';
const notice = () => screen.getByText(summary).closest('details')!;
const openNotice = () => fireEvent.click(screen.getByText(summary));
// The marker a visitor sees (and a screen reader hears) until the notice has been acknowledged.
const unacknowledged = () => screen.queryByText('(not yet acknowledged)', { exact: false }) !== null;
function authView(page: React.ReactNode) {
  return render(<MemoryRouter><AuthContext.Provider value={{ user: null, token: null, isAuthenticated: false, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() }}><ProductNoticeVisitProvider>{page}</ProductNoticeVisitProvider></AuthContext.Provider></MemoryRouter>);
}
beforeEach(() => { localStorage.clear(); localStorage.setItem('user-locale', 'en-US'); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
describe('Web alternative for the native product notice', () => {
  it('waits closed under the sign-in form, marked until acknowledged, and opens only when asked', () => {
    authView(<Login/>);
    expect(notice()).not.toHaveAttribute('open'); expect(unacknowledged()).toBe(true);
    const signIn = screen.getByRole('button', { name: t('login.signIn') });
    expect(signIn.compareDocumentPosition(notice()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(signIn.closest('form')!.contains(notice())).toBe(false);
    openNotice();
    expect(notice()).toHaveAttribute('open');
    expect(screen.getByText('Old Weesh accounts and data are not imported automatically', { exact: false })).toBeVisible();
    expect(screen.getByText('does not create an account, import data or accept privacy policy or terms', { exact: false })).toBeVisible();
    openNotice();
    expect(notice()).not.toHaveAttribute('open'); expect(unacknowledged()).toBe(true);
    expect(localStorage.getItem(PRODUCT_NOTICE_KEY)).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it('stays on the page after it was remembered and can be read again', () => {
    localStorage.setItem(PRODUCT_NOTICE_KEY, productNoticeBody(getFullApiUrl(), true));
    authView(<Login/>);
    expect(notice()).not.toHaveAttribute('open'); expect(unacknowledged()).toBe(false);
    openNotice();
    expect(notice()).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: ackLabel })).toBeVisible(); expect(fetch).not.toHaveBeenCalled();
  });
  it('shows the same notice in Traditional Chinese', () => {
    localStorage.setItem('user-locale', 'zh-TW');
    authView(<Register/>);
    const line = screen.getByText('Weesh → Wishlist.ai：帳號與資料說明');
    expect(line.closest('details')).not.toHaveAttribute('open'); expect(screen.getByText('（尚未確認）')).toBeInTheDocument();
    fireEvent.click(line);
    expect(line.closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: '我了解，記住這份說明' })).toBeVisible();
  });
  it('rechecks a different service during the same visit and disables acknowledgement while busy', async () => {
    const service = vi.spyOn(config, 'getFullApiUrl').mockReturnValue('https://first.example.invalid/api');
    const original = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === PRODUCT_NOTICE_KEY) throw new Error('synthetic-storage-fault'); original(key, value); });
    const view = render(<ProductNoticeVisitProvider><ProductNoticeWeb/></ProductNoticeVisitProvider>);
    openNotice(); fireEvent.click(screen.getByRole('button', { name: ackLabel }));
    expect(await screen.findByRole('status')).toHaveTextContent('could not confirm');
    view.rerender(<ProductNoticeVisitProvider><ProductNoticeWeb disabled/></ProductNoticeVisitProvider>);
    const continuation = screen.getByRole('button', { name: 'Continue for this visit without remembering' });
    expect(continuation).toBeDisabled(); fireEvent.click(continuation);
    expect(notice()).toHaveAttribute('open'); expect(unacknowledged()).toBe(true);
    view.rerender(<ProductNoticeVisitProvider><ProductNoticeWeb/></ProductNoticeVisitProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Continue for this visit without remembering' }));
    await waitFor(() => expect(notice()).not.toHaveAttribute('open')); expect(unacknowledged()).toBe(false);
    service.mockReturnValue('https://second.example.invalid/api');
    view.rerender(<ProductNoticeVisitProvider><ProductNoticeWeb/></ProductNoticeVisitProvider>);
    expect(unacknowledged()).toBe(true); expect(notice()).not.toHaveAttribute('open');
    expect(localStorage.getItem(PRODUCT_NOTICE_KEY)).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps a visit-only acknowledgement when moving between login and registration in the same open application', async () => {
    const original = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === PRODUCT_NOTICE_KEY) throw new Error('synthetic-storage-fault'); original(key, value); });
    authView(<Routes><Route path="/" element={<Login/>}/><Route path="/register" element={<Register/>}/></Routes>);
    fireEvent.change(screen.getByLabelText(t('login.phoneOrEmail')), { target: { value: 'synthetic@example.invalid' } });
    openNotice(); fireEvent.click(screen.getByRole('button', { name: ackLabel }));
    expect(await screen.findByRole('status')).toHaveTextContent('could not confirm');
    fireEvent.click(screen.getByRole('button', { name: 'Continue for this visit without remembering' }));
    await waitFor(() => expect(notice()).not.toHaveAttribute('open')); expect(unacknowledged()).toBe(false);
    expect(screen.getByLabelText(t('login.phoneOrEmail'))).toHaveValue('synthetic@example.invalid');
    fireEvent.click(screen.getByRole('link', { name: t('login.signUp'), exact: true }));
    expect(await screen.findByLabelText('Display name')).toBeInTheDocument();
    expect(notice()).not.toHaveAttribute('open'); expect(unacknowledged()).toBe(false);
    expect(localStorage.getItem(PRODUCT_NOTICE_KEY)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('remembers across login and registration without submitting, touching auth or discarding the original login input', async () => {
    localStorage.setItem(AUTH_SESSION_KEY, 'untouched-auth-record');
    const view = authView(<Login/>);
    fireEvent.change(screen.getByLabelText(t('login.phoneOrEmail')), { target: { value: 'synthetic@example.invalid' } });
    expect(unacknowledged()).toBe(true);
    openNotice(); fireEvent.click(screen.getByRole('button', { name: ackLabel }));
    await waitFor(() => expect(notice()).not.toHaveAttribute('open')); expect(unacknowledged()).toBe(false);
    const body = localStorage.getItem(PRODUCT_NOTICE_KEY)!;
    expect(hasProductNoticeAck(body, getFullApiUrl(), true)).toBe(true);
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(['apiBase', 'revision', 'version']);
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBe('untouched-auth-record');
    expect(screen.getByLabelText(t('login.phoneOrEmail'))).toHaveValue('synthetic@example.invalid');
    expect(fetch).not.toHaveBeenCalled();
    view.unmount(); authView(<Register/>);
    expect(notice()).not.toHaveAttribute('open'); expect(unacknowledged()).toBe(false);
    expect(screen.getByRole('button', { name: t('register.createAccount') })).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('offers a visit-only continuation after storage failure while registration and its original input remain usable', async () => {
    localStorage.setItem(AUTH_SESSION_KEY, 'untouched-auth-record');
    const original = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === PRODUCT_NOTICE_KEY) throw new Error('synthetic-storage-fault'); original(key, value); });
    const view = authView(<Register/>);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Synthetic original name' } });
    openNotice(); fireEvent.click(screen.getByRole('button', { name: ackLabel }));
    expect(await screen.findByRole('status')).toHaveTextContent('could not confirm');
    expect(screen.getByLabelText('Display name')).toHaveValue('Synthetic original name');
    expect(screen.getByRole('button', { name: t('register.createAccount') })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue for this visit without remembering' }));
    await waitFor(() => expect(notice()).not.toHaveAttribute('open')); expect(unacknowledged()).toBe(false);
    expect(localStorage.getItem(PRODUCT_NOTICE_KEY)).toBeNull(); expect(localStorage.getItem(AUTH_SESSION_KEY)).toBe('untouched-auth-record');
    view.unmount(); authView(<Login/>);
    expect(unacknowledged()).toBe(true); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not claim remembered when the storage write cannot be read back', async () => {
    const original = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, 'getItem').mockImplementation(key => key === PRODUCT_NOTICE_KEY ? null : original(key));
    authView(<Login/>); openNotice(); fireEvent.click(screen.getByRole('button', { name: ackLabel }));
    expect(await screen.findByRole('status')).toHaveTextContent('could not confirm');
    expect(notice()).toHaveAttribute('open'); expect(unacknowledged()).toBe(true); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not inherit another service acknowledgement or persist credential-bearing service URLs', () => {
    const body = productNoticeBody('https://example.invalid/api/');
    expect(hasProductNoticeAck(body, 'https://other.example.invalid/api')).toBe(false);
    expect(hasProductNoticeAck(JSON.stringify({ ...JSON.parse(body), account: 1 }), 'https://example.invalid/api')).toBe(false);
    for (const url of ['https://synthetic:unused@example.invalid/api', 'https://example.invalid/api?token=unused', 'http://example.invalid/api']) expect(() => productNoticeBody(url, true)).toThrow();
    expect(productNoticeBody('http://127.0.0.1:5243/api', true)).not.toContain('account'); expect(fetch).not.toHaveBeenCalled();
  });
});
