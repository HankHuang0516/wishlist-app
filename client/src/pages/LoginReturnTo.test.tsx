import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { t } from '../utils/localization';
import Login from './Login';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('safe return from web account-deletion login', () => {
  for (const [query, expected] of [
    ['?next=%2Faccount-deletion', '/account-deletion'],
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
});
