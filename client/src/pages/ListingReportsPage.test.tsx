import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ListingReportsPage from './ListingReportsPage';
let original: string | null;
beforeEach(() => { original = localStorage.getItem('user-locale'); });
afterEach(() => { if (original === null) localStorage.removeItem('user-locale'); else localStorage.setItem('user-locale', original); vi.restoreAllMocks(); });
it.each(['en-US', 'zh-TW'])('provides the original guest report return path in %s without private reads', async locale => {
  localStorage.setItem('user-locale', locale); const fetch = vi.spyOn(window, 'fetch');
  render(<MemoryRouter><AuthContext.Provider value={{ user: null, token: null, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: false }}><ListingReportsPage /></AuthContext.Provider></MemoryRouter>);
  expect(screen.getByRole('heading', { name: locale === 'en-US' ? 'My item reports' : '我的商品檢舉' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: locale === 'en-US' ? 'Sign in' : '登入' })).toHaveAttribute('href', '/login?next=%2Freports'); expect(fetch).not.toHaveBeenCalled();
});
