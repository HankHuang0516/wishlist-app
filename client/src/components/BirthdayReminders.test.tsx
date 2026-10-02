import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BirthdayReminders from './BirthdayReminders';
const friend = { id: 7, name: null, nicknames: null, avatarUrl: null, birthday: '1996-10-08T00:00:00.000Z', nextBirthday: '2026-10-08T00:00:00.000Z' };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const view = (token = 'synthetic-a') => <MemoryRouter><BirthdayReminders key={token} token={token} /></MemoryRouter>;
beforeEach(() => localStorage.setItem('user-locale', 'en-US'));
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('private homepage birthday reads', () => {
  it('keeps every public friend and both destinations reachable in the named keyboard region', async () => {
    const friends = Array.from({ length: 20 }, (_, index) => ({ ...friend, id: index + 1, name: `Original public friend ${index + 1}` }));
    const fetcher = vi.fn(async () => ok(friends)); vi.stubGlobal('fetch', fetcher);
    render(view());
    const region = await screen.findByRole('region', { name: 'Upcoming friend birthdays' });
    region.focus(); expect(region).toHaveFocus();
    for (const entry of friends) {
      expect(screen.getByText(entry.name)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: `View the public profile of ${entry.name}` })).toHaveAttribute('href', `/users/${entry.id}/profile`);
      expect(screen.getByRole('link', { name: `View the public wishes of ${entry.name}` })).toHaveAttribute('href', `/users/${entry.id}/wishlists`);
    }
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not claim empty while loading; uses the private redirect-rejecting GET contract', async () => {
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn(() => new Promise(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetcher);
    render(view()); expect(screen.getByRole('status')).toHaveTextContent('Reading friend birthdays');
    expect(screen.queryByText('No upcoming birthdays.')).toBeNull();
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/users/upcoming-birthdays'); expect(options).toMatchObject({ cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer synthetic-a' } });
    await act(async () => finish(ok([]))); expect(screen.getByText('No upcoming birthdays.')).toBeInTheDocument();
  });
  it('renders null-name/hidden-avatar safely, with named single links and UTC date', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok([friend])));
    const { container } = render(view());
    expect(await screen.findByText('Display name not set')).toBeInTheDocument();
    expect(screen.getByText('Birthday: Oct 8, 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View the public profile of Display name not set' })).toHaveAttribute('href', '/users/7/profile');
    expect(screen.getByRole('link', { name: 'View the public wishes of Display name not set' })).toHaveAttribute('href', '/users/7/wishlists');
    expect(container.querySelector('a button')).toBeNull(); expect(container.querySelector('img')).toBeNull();
  });
  it('keeps a malformed reply as failure, retries only birthday GET and gates duplicate retry clicks', async () => {
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(ok([{ ...friend, phoneNumber: 'synthetic-private' }])).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher); render(view());
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded or verified');
    expect(screen.queryByText('No upcoming birthdays.')).toBeNull(); expect(screen.queryByText('synthetic-private')).toBeNull();
    const retry = screen.getByRole('button', { name: 'Retry friend birthdays' });
    fireEvent.click(retry); fireEvent.click(retry);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await act(async () => finish(ok([friend]))); expect(await screen.findByText('Display name not set')).toBeInTheDocument();
    expect(fetcher.mock.calls.every(([url]) => String(url).endsWith('/users/upcoming-birthdays'))).toBe(true);
  });
  it('does not display late private data after an account/session remount and aborts the old read', async () => {
    let finish!: (value: unknown) => void; let oldSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      if ((options.headers as Record<string, string>).Authorization === 'Bearer synthetic-a') {
        oldSignal = options.signal as AbortSignal; return new Promise(resolve => { finish = resolve; });
      }
      return Promise.resolve(ok([]));
    }));
    const mounted = render(view()); mounted.rerender(view('synthetic-b'));
    expect(await screen.findByText('No upcoming birthdays.')).toBeInTheDocument(); expect(oldSignal?.aborted).toBe(true);
    await act(async () => finish(ok([{ ...friend, name: 'Old private display' }])));
    expect(screen.queryByText('Old private display')).toBeNull();
  });
  it('has an English-safe fallback when storage or the saved locale is unavailable', async () => {
    const getter = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw Error('synthetic storage fault'); });
    vi.stubGlobal('fetch', vi.fn(async () => ok([friend]))); render(view());
    expect(await screen.findByText('Birthday: Oct 8, 2026')).toBeInTheDocument(); getter.mockRestore();
  });
  it('localizes failures and preserves public HTTPS photos without prefixing the API origin', async () => {
    localStorage.setItem('user-locale', 'zh-TW');
    const fetcher = vi.fn().mockRejectedValueOnce(Error('synthetic raw fault')).mockResolvedValueOnce(ok([{ ...friend, name: '測試好友', avatarUrl: 'https://example.invalid/synthetic.jpg' }]));
    vi.stubGlobal('fetch', fetcher); const { container } = render(view());
    expect(await screen.findByRole('alert')).toHaveTextContent('好友生日無法載入或核對');
    fireEvent.click(screen.getByRole('button', { name: '重試好友生日' }));
    expect(await screen.findByText('測試好友')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.invalid/synthetic.jpg');
    expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
  });
});
