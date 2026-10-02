import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './Home';

const auth = vi.hoisted(() => ({ current: { isAuthenticated: true, token: 'synthetic-session', user: { id: 19 } } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.current }));
vi.mock('../components/WishHomeWeb', () => ({ default: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
beforeEach(() => { localStorage.setItem('user-locale', 'zh-TW'); auth.current = { isAuthenticated: true, token: 'synthetic-session', user: { id: 19 } }; });
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('approved authenticated homepage actions', () => {
  it('keeps the original destinations as keyboard links without nested buttons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '我的願望', exact: true })).toHaveAttribute('href', '/wishes');
    expect(screen.getByRole('link', { name: '拍照刊登好物', exact: true })).toHaveAttribute('href', '/sell');
    expect(container.querySelector('a button')).toBeNull();
    expect(await screen.findByText('近期沒有好友生日。')).toBeInTheDocument();
  });
  it('preserves a failed birthday read as an error rather than pretending no friends have birthdays', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('好友生日無法載入');
    expect(screen.queryByText('近期沒有好友生日。')).not.toBeInTheDocument();
  });
  it('does not display an empty birthday result before the backend finishes reading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('正在讀取好友生日');
    expect(screen.queryByText('近期沒有好友生日。')).not.toBeInTheDocument();
  });
  it('keeps all guest feature cards and the API entry localized without nested interactive controls', () => {
    auth.current = { isAuthenticated: false, token: '', user: { id: 0 } }; localStorage.setItem('user-locale', 'en-US');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /AI integration · Public API/ })).toHaveAttribute('href', '/api-showcase');
    expect(container.querySelector('a button')).toBeNull(); expect(container.querySelectorAll('img')).toHaveLength(4);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('still renders holidays and actions when locale storage is blocked', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw Error('synthetic blocked storage'); });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'My wishes' })).toHaveAttribute('href', '/wishes');
    expect(await screen.findByText('No upcoming birthdays.')).toBeInTheDocument();
  });
});
