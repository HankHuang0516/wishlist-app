import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Layout from './Layout';

const auth = vi.hoisted(() => ({ isAuthenticated: true, logout: vi.fn(), user: { isPremium: true } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../components/FeedbackModal', () => ({ default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => isOpen ? <div role="dialog" aria-label="Fixture feedback"><button onClick={onClose}>Close fixture</button></div> : null }));
beforeEach(() => { localStorage.setItem('user-locale', 'en-US'); auth.isAuthenticated = true; auth.logout.mockClear(); });
afterEach(() => { localStorage.removeItem('user-locale'); vi.restoreAllMocks(); });

it('keeps one English settings entry, all footer destinations, and functional help and logout actions', () => {
  render(<MemoryRouter initialEntries={['/settings']}><Layout /></MemoryRouter>);
  expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(1);
  expect(screen.getByText('Premium member')).toBeInTheDocument();
  const footer = screen.getByRole('contentinfo');
  for (const [name, path] of [['Terms of use', '/terms'], ['Privacy policy', '/privacy'], ['Support and contact', '/support'], ['Account deletion', '/account-deletion'], ['Supply partnerships', '/partners'], ['Changelog', '/changelog']]) {
    expect(within(footer).getByRole('link', { name })).toHaveAttribute('href', path);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Feedback and help' }));
  expect(screen.getByRole('dialog', { name: 'Fixture feedback' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close fixture' }));
  fireEvent.click(within(footer).getByRole('button', { name: 'Feedback' }));
  expect(screen.getByRole('dialog', { name: 'Fixture feedback' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(auth.logout).toHaveBeenCalledOnce();
});

it('preserves the Chinese shell and single settings link', () => {
  localStorage.setItem('user-locale', 'zh-TW');
  render(<MemoryRouter initialEntries={['/settings']}><Layout /></MemoryRouter>);
  expect(screen.getAllByRole('link', { name: '設定' })).toHaveLength(1);
  expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '支援與聯絡' })).toHaveAttribute('href', '/support');
});

it('keeps public login and policy links usable without locale storage', () => {
  auth.isAuthenticated = false;
  vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw Error('storage unavailable'); });
  render(<MemoryRouter><Layout /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Account deletion' })).toHaveAttribute('href', '/account-deletion');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
