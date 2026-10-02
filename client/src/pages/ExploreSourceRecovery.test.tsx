import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ token: 'synthetic', user: { id: 1 } }) }));
vi.mock('../components/ExploreMapWeb', () => ({ default: () => <div>本地測試地圖</div> }));
let ExplorePage: typeof import('./ExplorePage').default;
beforeEach(async () => {
  vi.resetModules(); ({ default: ExplorePage } = await import('./ExplorePage')); vi.useFakeTimers();
});
afterEach(() => { cleanup(); localStorage.removeItem('user-locale'); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('source-only throttling in the original Explore page', () => {
  it.each(['zh-TW', 'en-US'])('shows an explicit accessible retry and wait in %s, preserving entered keywords without automatic dispatch', async locale => {
    localStorage.setItem('user-locale', locale);
    let sourceReads = 0;
    const fetch = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/source-leads') && ++sourceReads === 1) return new Response('{"errorCode":"RATE_LIMIT_EXCEEDED"}', { status: 429, headers: { 'Retry-After': '60' } });
      return new Response(JSON.stringify({ items: [], nextCursor: null, ...(path.includes('/source-leads') || path.includes('/external-listings') ? { enabled: false } : {}) }));
    });
    vi.stubGlobal('fetch', fetch);
    render(<MemoryRouter initialEntries={['/explore?q=' + encodeURIComponent('原始關鍵字')]}><ExplorePage /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const english = locale === 'en-US';
    const alert = screen.getAllByRole('alert').find(element => element.textContent?.includes(english ? 'Automatic updates are paused' : '已暫停自動更新'))!;
    const retry = within(alert).getByRole('button', { name: english ? 'Search again' : '重新搜尋' });
    expect(retry).toBeDisabled(); expect(retry).toHaveClass('min-h-11');
    expect(screen.getByLabelText(english ? 'Search wait time' : '搜尋等待時間')).toHaveTextContent(english ? '60 seconds' : '60 秒');
    const input = screen.getByLabelText(english ? 'Item keywords' : '商品關鍵字');
    fireEvent.change(input, { target: { value: '新關鍵字' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(sourceReads).toBe(1); expect(input).toHaveValue('新關鍵字'); expect(retry).toBeEnabled();
    fireEvent.click(retry); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(sourceReads).toBe(2); expect(screen.queryByText(english ? /Automatic updates are paused/ : /已暫停自動更新/)).toBeNull();
    const last = fetch.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/source-leads')).at(-1)!;
    expect(new URL(last[0]).searchParams.get('q')).toBe('新關鍵字');
  });
});
