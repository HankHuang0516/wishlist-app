import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from './Home';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, token: 'synthetic-session', user: { id: 19 } }) }));
vi.mock('../components/WishHomeWeb', () => ({ default: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
afterEach(() => vi.unstubAllGlobals());

describe('approved authenticated homepage actions', () => {
  it('keeps the original destinations as keyboard links without nested buttons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '我的願望', exact: true })).toHaveAttribute('href', '/wishes');
    expect(screen.getByRole('link', { name: '拍照刊登好物', exact: true })).toHaveAttribute('href', '/sell');
    expect(container.querySelector('a button')).toBeNull();
    expect(await screen.findByText('No upcoming birthdays.')).toBeInTheDocument();
  });
  it('preserves a failed birthday read as an error rather than pretending no friends have birthdays', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('好友生日無法載入');
    expect(screen.queryByText('No upcoming birthdays.')).not.toBeInTheDocument();
  });
  it('does not display an empty birthday result before the backend finishes reading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('正在讀取好友生日');
    expect(screen.queryByText('No upcoming birthdays.')).not.toBeInTheDocument();
  });
});
