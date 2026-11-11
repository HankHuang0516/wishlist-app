import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WishHomeWeb from './WishHomeWeb';
import { responseOk } from '../__tests__/fixtures/marketplace';

beforeEach(() => localStorage.setItem('user-locale', 'zh-TW'));
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

let serial = 0;
const product = (title: string, wishItemId: number, { price = 1200, budget = false, kind = 'source' as 'source' | 'listing', thumbnail = true } = {}) => {
  const id = 'ab427730-60af-40c4-b568-' + String(++serial).padStart(12, '0'), picture = `https://wishlist.test/api/source-leads/${id}/media/${id}/thumbnail`;
  return { kind, id, key: kind + ':' + id, title, description: '合成商品說明', mainId: 'electronics', subId: 'monitors', price, priceText: String(price), currency: 'TWD', priceUnitVerified: true,
    photos: thumbnail ? [{ id: 'p' + serial, url: picture.replace(/thumbnail$/, 'image'), thumbnailUrl: picture }] : [], thumbnailUrl: thumbnail ? picture : null, county: '臺北市', district: null,
    condition: 'USED', stockStatus: 'UNKNOWN', canonicalUrl: 'https://example.invalid/' + id, detailPath: '/listings/' + id, sourceLabel: '公開來源', date: '2026-11-10T00:00:00Z',
    dateBasis: 'SOURCE_POST_RANGE', dateEarliest: null, match: { wishItemId, reasons: budget ? ['NAME', 'BUDGET'] : ['NAME'], score: budget ? 100 : 80 } };
};
const group = (id: number, name: string, items: ReturnType<typeof product>[], total = items.length, maxPrice: number | null = null) =>
  ({ wish: { id, name, maxPrice, priceCurrency: 'TWD', wishlist: { id: 2, title: '生日願望' } }, total, items });
const answer = (groups: ReturnType<typeof group>[]) => responseOk({ complete: true, generatedAt: '2026-11-11T00:00:00Z', groups });
function Location() { return <output data-testid="location">{useLocation().pathname + useLocation().search}</output>; }
const view = (token = 'fixture') => <MemoryRouter><WishHomeWeb key={token} token={token} userId={19} /><Location /></MemoryRouter>;

describe('the signed-in home page matches every wish as it opens', () => {
  it('reads every wish with its matches at once and shows the best of each, with nothing to choose first', async () => {
    const monitor = [product('BenQ 合成電腦螢幕', 1, { budget: true, price: 900 }), product('另一台合成螢幕', 1), product('第三台合成螢幕', 1)];
    const fetcher = vi.fn(async () => answer([group(1, '電腦螢幕', monitor, 3, 1000), group(2, '無線耳機', [product('Sony 合成耳機', 2)]), group(3, '小提琴', [], 0)]));
    vi.stubGlobal('fetch', fetcher);
    render(view());
    await screen.findByRole('button', { name: /BenQ 合成電腦螢幕/ });
    // One read, signed in, for every wish.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual([expect.stringMatching(/\/api\/discovery\/wish-matches$/), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fixture' }) })]);
    expect(screen.getByRole('heading', { name: /電腦螢幕.*預算 NT\$ 1,000/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '無線耳機' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /BenQ 合成電腦螢幕.*NT\$ 900.*公開來源 · 臺北市 · 符合願望與預算/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sony 合成耳機.*符合願望名稱/ })).toBeInTheDocument();
    // Only the best of each wish until it is expanded.
    expect(screen.queryByRole('button', { name: /另一台合成螢幕/ })).not.toBeInTheDocument();
    const all = screen.getByRole('button', { name: '查看全部 3 件' });
    expect(all).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(all);
    expect(screen.getByRole('button', { name: /另一台合成螢幕/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收合結果' })).toHaveAttribute('aria-expanded', 'true');
    // A wish nothing matches is named, so it is clear that every wish was checked.
    expect(screen.getByText('這些願望目前沒有吻合的商品：小提琴')).toBeInTheDocument();
    // No chooser, no comparing one wish at a time, no browse-everything button.
    expect(screen.queryByText(/今天想找什麼/)).not.toBeInTheDocument();
    expect(screen.queryByText(/選願望交叉比對|在地圖交叉比對|不套用願望/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /瀏覽/ })).not.toBeInTheDocument();
  });

  it('opens a matched product\'s details right on the home page', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/wish-matches') ? answer([group(1, '電腦螢幕', [product('BenQ 合成電腦螢幕', 1)])]) : new Promise(() => undefined)));
    render(view());
    fireEvent.click(await screen.findByRole('button', { name: /BenQ 合成電腦螢幕/ }));
    const dialog = screen.getByRole('dialog', { name: '商品詳情' });
    expect(within(dialog).getByText('合成商品說明')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '請 Wishlist AI 代問' })).toHaveAttribute('href', expect.stringMatching(/^\/chat\?source=/));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    fireEvent.click(within(dialog).getByRole('button', { name: '關閉' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the first twelve of a long list and points to the wish picks in Explore for the rest', async () => {
    const items = Array.from({ length: 12 }, (_, n) => product('合成耳機 ' + n, 2));
    vi.stubGlobal('fetch', vi.fn(async () => answer([group(2, '無線耳機', items, 40)])));
    render(view());
    fireEvent.click(await screen.findByRole('button', { name: '查看全部 40 件' }));
    expect(screen.getAllByRole('button', { name: /合成耳機 \d+/ })).toHaveLength(12);
    expect(screen.getByRole('link', { name: '在探索看全部願望推薦' })).toHaveAttribute('href', '/explore?feed=for-you');
  });

  it('says a failure is a failure, not an empty result, and matches again on request', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) }).mockResolvedValue(answer([group(1, '電腦螢幕', [product('BenQ 合成電腦螢幕', 1)])]));
    vi.stubGlobal('fetch', fetcher);
    render(view());
    expect(await screen.findByRole('alert')).toHaveTextContent('目前無法比對願望');
    expect(screen.queryByText(/沒有吻合的商品/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新比對' }));
    await screen.findByRole('button', { name: /BenQ 合成電腦螢幕/ });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses an answer that does not describe the account\'s wishes, instead of showing it', async () => {
    const wrong = group(1, '電腦螢幕', [product('BenQ 合成電腦螢幕', 7)]);
    vi.stubGlobal('fetch', vi.fn(async () => answer([wrong])));
    render(view());
    expect(await screen.findByRole('alert')).toHaveTextContent('目前無法比對願望');
    expect(screen.queryByRole('button', { name: /BenQ/ })).not.toBeInTheDocument();
  });

  it('invites a first wish when there are none, and says nothing about matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer([])));
    render(view());
    expect(await screen.findByRole('link', { name: '前往願望清單' })).toHaveAttribute('href', '/wishes');
    expect(screen.queryByText(/沒有吻合的商品/)).not.toBeInTheDocument();
  });

  it('shows a product without a photo, and matches again when the page comes back into view', async () => {
    const fetcher = vi.fn(async () => answer([group(1, '電腦螢幕', [product('沒有照片的合成螢幕', 1, { thumbnail: false })])]));
    vi.stubGlobal('fetch', fetcher);
    render(view());
    await screen.findByRole('button', { name: /沒有照片的合成螢幕/ });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('ignores a late answer for an account whose session was replaced', async () => {
    let finish: (value: unknown) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(answer([group(5, '新帳號的願望', [product('新帳號的合成商品', 5)])])));
    const { rerender } = render(view('first'));
    rerender(view('second'));
    await screen.findByRole('button', { name: /新帳號的合成商品/ });
    await act(async () => { finish(answer([group(1, '舊帳號的私人願望', [product('舊帳號的合成商品', 1)])])); });
    expect(screen.queryByText(/舊帳號/)).not.toBeInTheDocument();
  });

  it('keeps the shortcuts and sends a search to Explore', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer([])));
    render(view());
    expect(screen.getByRole('link', { name: '拍照新增願望' })).toHaveAttribute('href', '/wishes');
    fireEvent.change(screen.getByLabelText('搜尋商品'), { target: { value: '三國 演義' } });
    fireEvent.click(screen.getByRole('button', { name: '搜尋' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=' + encodeURIComponent('三國 演義'));
  });

  it('says the same in English', async () => {
    localStorage.setItem('user-locale', 'en-US');
    vi.stubGlobal('fetch', vi.fn(async () => answer([group(1, 'Monitor', [product('BenQ monitor', 1, { budget: true }), product('Other monitor', 1)], 2, 1500), group(2, 'Violin', [], 0)])));
    render(view());
    expect(await screen.findByRole('button', { name: /BenQ monitor.*Public reference.*Matches the wish and its budget/ })).toBeInTheDocument();
    expect(screen.getByText('Every wish is matched against all items for you.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View all 2' })).toBeInTheDocument();
    expect(screen.getByText('No matching items yet for: Violin')).toBeInTheDocument();
  });
});
