import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { t } from '../utils/localization';
import Login from './Login';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('safe return from web account-deletion login', () => {
  for (const [query, expected] of [
    ['?next=%2Faccount-deletion', '/account-deletion'],
    ['?next=%2Fmy-listings', '/my-listings'],
    ['?next=%2Fsell', '/sell'],
    ['?next=%2Fsettings', '/settings'],
    ['?next=%2Fwishlists%2F42', '/wishlists/42'],
    ['?next=%2Fchat%3Froom%3Dc11fde58-d143-423c-99f1-a13d60068f58', '/chat?room=c11fde58-d143-423c-99f1-a13d60068f58'],
    ['?next=%2F%2Fevil.example', '/dashboard'],
    ['?next=https%3A%2F%2Fevil.example%2F', '/dashboard'],
  ] as const) {
    it(`uses only a whitelisted return path for ${query}`, async () => {
      const login = vi.fn();
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, headers: { get: () => 'application/json' },
        json: async () => ({ token: 'session', user: { id: 19, phoneNumber: 'test' } }) })));
      render(<MemoryRouter initialEntries={[`/login${query}`]}><AuthContext.Provider value={{ user: null, token: null,
        login, logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: false }}><Login /></AuthContext.Provider></MemoryRouter>);
      fireEvent.change(screen.getByLabelText(t('login.phoneOrEmail')), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(t('login.password')), { target: { value: 'correct-password' } });
      fireEvent.click(screen.getByRole('button', { name: t('login.signIn') }));
      await vi.waitFor(() => expect(login).toHaveBeenCalledWith('session', { id: 19, phoneNumber: 'test' }, expected));
    });
  }
  it('sends one login request for repeated submit and ignores its response after leaving the page', async () => {
    const login = vi.fn(); let finish!: (value: unknown) => void;
    const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetcher);
    const view = render(<MemoryRouter><AuthContext.Provider value={{ user: null, token: null, login, logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: false }}><Login /></AuthContext.Provider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(t('login.phoneOrEmail')), { target: { value: 'synthetic@example.invalid' } });
    fireEvent.change(screen.getByLabelText(t('login.password')), { target: { value: 'dummy-password' } });
    const form = screen.getByRole('button', { name: t('login.signIn') }).closest('form')!; fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(finish).toBeDefined()); expect(fetcher).toHaveBeenCalledTimes(1); view.unmount();
    await act(async () => finish({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ token: 'fixture', user: { id: 42, phoneNumber: 'synthetic-only' } }) }));
    expect(login).not.toHaveBeenCalled(); expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
  });
});
