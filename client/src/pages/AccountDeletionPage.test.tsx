import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { API_URL } from '../config';
import { PENDING_DELETION_KEY } from '../lib/accountDeletionWeb';
import AccountDeletionPage from './AccountDeletionPage';

const actionId = '11111111-1111-4111-8111-111111111111';
const auth = { user: { id: 19, phoneNumber: 'test' }, token: 'test-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const preview = { version: 2, previewOnly: true, accountDeleted: false, capturedAt: '2026-09-26T00:00:00.000Z',
  counts: { wishlists: 1, wishes: 2, listings: 3, uploadedPhotos: 4, messagesAuthored: 5 } };
const ack = { state: 'ERASED', accountDeleted: true, clientActionId: actionId,
  erasedAt: '2026-09-26T00:00:01.000Z', photoCleanupPending: 1, legacyCleanupPending: 0 };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const mount = (value = auth) => render(<MemoryRouter><AuthContext.Provider value={value}><AccountDeletionPage /></AuthContext.Provider></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('crypto', { randomUUID: () => actionId });
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('public browser account deletion path', () => {
  it('is usable without an installed app or an existing web login', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    mount({ ...auth, user: null, token: null, isAuthenticated: false });
    expect(screen.getByRole('heading', { name: '刪除 Weesh（Wishlist.ai）帳號與相關資料' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '登入後繼續' })).toHaveAttribute('href', '/login?next=%2Faccount-deletion');
    expect(screen.getByRole('link', { name: '重設密碼' })).toHaveAttribute('href', '/forgot-password');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires an impact preview and current-account proof before sending a single deletion', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input), method = init?.method ?? 'GET';
      if (path.endsWith('/deletion-impact')) return ok(preview);
      if (path.endsWith('/users/me') && method === 'GET') return ok({ id: 19 });
      if (path.endsWith('/users/me') && method === 'DELETE') return ok(ack);
      throw new Error(`Unexpected ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetch);
    mount();
    const submit = screen.getByRole('button', { name: '永久刪除本人帳號' });
    expect(submit).toBeDisabled();
    await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'), { target: { value: 'correct-password' } });
    fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'), { target: { value: '刪除帳號' } });
    fireEvent.click(submit);
    await screen.findByText('伺服器已確認帳號刪除。');
    const deletes = fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(JSON.parse(String(deletes[0][1]?.body))).toEqual({ currentPassword: 'correct-password', clientActionId: actionId, confirmation: 'DELETE_MY_ACCOUNT' });
    const stored = localStorage.getItem(PENDING_DELETION_KEY) ?? '';
    expect(stored).toContain(actionId);
    expect(stored).not.toContain('correct-password');
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('never resends deletion after a lost response and preserves the original operation for lookup', async () => {
    let receipts = 0;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input), method = init?.method ?? 'GET';
      if (path.endsWith('/deletion-impact')) return ok(preview);
      if (path.endsWith('/users/me') && method === 'GET') return ok({ id: 19 });
      if (path.endsWith('/users/me') && method === 'DELETE') throw new Error('lost reply');
      if (path.includes('/deletion-operations/') && method === 'GET') return ++receipts === 1 ? { ok: false, status: 404 } : ok(ack);
      throw new Error(`Unexpected ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'), { target: { value: 'correct-password' } });
    fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'), { target: { value: '刪除帳號' } });
    fireEvent.click(screen.getByRole('button', { name: '永久刪除本人帳號' }));
    await screen.findByText(/尚未確認刪除結果；原操作已保存/);
    expect(localStorage.getItem(PENDING_DELETION_KEY)).toContain(actionId);
    fireEvent.click(screen.getByRole('button', { name: '只查詢原操作結果' }));
    await screen.findByText('伺服器已確認帳號刪除。');
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    expect(receipts).toBe(2);
  });

  it('refuses deletion when the authenticated account changed', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/deletion-impact') ? ok(preview) : ok({ id: 20 }));
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'), { target: { value: 'correct-password' } });
    fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'), { target: { value: '刪除帳號' } });
    fireEvent.click(screen.getByRole('button', { name: '永久刪除本人帳號' }));
    await screen.findByText('登入帳號已改變；沒有送出刪除。');
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();
  });

  it('recovers by GET only when a saved operation survives a page reload', async () => {
    localStorage.setItem(PENDING_DELETION_KEY, JSON.stringify({ version: 1, apiUrl: API_URL, userId: 19, clientActionId: actionId, originalToken: 'old-session' }));
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/deletion-operations/');
      expect(init?.method).toBeUndefined();
      return ok(ack);
    });
    vi.stubGlobal('fetch', fetch);
    mount({ ...auth, user: null, token: null, isAuthenticated: false });
    await screen.findByText('伺服器已確認帳號刪除。');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.method).toBeUndefined();
    expect(fetch.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer old-session' });
  });

  it('does not look up the old account when a different account is signed in', () => {
    localStorage.setItem(PENDING_DELETION_KEY, JSON.stringify({ version: 1, apiUrl: API_URL, userId: 19, clientActionId: actionId, originalToken: 'old-session' }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    mount({ ...auth, user: { id: 20, phoneNumber: 'other' }, token: 'other-session' });
    expect(screen.getByRole('alert')).toHaveTextContent('另一帳號的未確認刪除操作');
    expect(fetch).not.toHaveBeenCalled();
  });
});
