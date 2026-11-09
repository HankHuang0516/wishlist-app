import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WishHomeWeb from './WishHomeWeb';
import { makeWish, makeMatch, makeMatchPage, makeHomePage, makeListing, responseOk, uuid } from '../__tests__/fixtures/marketplace';
vi.mock('./ExploreMapWeb', () => ({ default: ({ items, onSelect, previewNotice }: { items: { id: string }[]; previewNotice: string; onSelect: (value: { kind: 'seller'; id: string }) => void }) => <div data-testid="home-map">{items.map(item => <button key={item.id} onClick={() => onSelect({ kind: 'seller', id: item.id })}>地圖商品 {item.id}</button>)}<p>{previewNotice}</p></div> }));
beforeEach(() => localStorage.setItem('user-locale', 'zh-TW'));
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const view = (token = 'fixture', userId = 19) => <MemoryRouter><WishHomeWeb key={token} token={token} userId={userId} /></MemoryRouter>;
describe('APP-equivalent homepage match UX', () => {
  it('shows one best match per wish, expands alternatives, and puts the wish selector below matches', async () => {
    const first = makeMatch(), best = makeMatch(1, makeListing('最匹配的三國演義'), 98);
    vi.stubGlobal('fetch', vi.fn(async () => responseOk(makeHomePage([{ wish: makeWish(), items: [first, best] }]))));
    render(view());
    const bestLinks = await screen.findAllByRole('link', { name: /最匹配的三國演義/ });
    expect(bestLinks).toHaveLength(2);
    for (const link of bestLinks) expect(link).toHaveAttribute('href', `/explore?wish=1&listing=${best.listing.id}`);
    expect(screen.getByRole('button', { name: /共有2件吻合商品/ }).closest('a')).toBeNull();
    expect(screen.queryByRole('link', { name: new RegExp(first.listing.title) })).not.toBeInTheDocument();
    const expand = screen.getByRole('button', { name: /共有2件吻合商品/ });
    expect(expand).toHaveAttribute('aria-expanded', 'false'); fireEvent.click(expand);
    expect(screen.getByRole('link', { name: new RegExp(first.listing.title) })).toBeInTheDocument();
    const chooser = screen.getByText('選願望交叉比對').closest('details')!;
    expect(chooser).not.toHaveAttribute('open'); chooser.setAttribute('open', '');
    expect(within(screen.getByRole('region')).getAllByRole('heading').map(el => el.textContent)).toEqual(['歡迎回來。', '願望吻合的商品', '願望：三國演義漫畫', '快捷功能 選用']);
    expect(chooser.querySelector('summary')).toHaveTextContent('今天想找什麼？');
    expect(screen.getByRole('link', { name: /在地圖交叉比對三國演義漫畫/ })).toHaveAttribute('href', '/explore?wish=1');
  });
  it('reads a wish beyond its first page only when the home read says there is more, and ranks across both', async () => {
    const first = makeMatch(1, makeListing('第一頁的三國演義'), 70), later = makeMatch(1, makeListing('第二頁更吻合的三國演義'), 96), cursor = uuid();
    const fetch = vi.fn(async (url: string) => responseOk(url.includes('home-matches')
      ? makeHomePage([{ wish: makeWish(1), items: [first], nextCursor: cursor }, { wish: makeWish(2), items: [makeMatch(2)] }])
      : makeMatchPage([later])));
    vi.stubGlobal('fetch', fetch); render(view());
    const links = await screen.findAllByRole('link', { name: /第二頁更吻合的三國演義/ });
    expect(links).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain('/listings/matches?wishItemId=1&');
    expect(fetch.mock.calls[1][0]).toContain('cursor=' + cursor);
    expect(screen.getByRole('button', { name: /共有2件吻合商品/ })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('passes the single match ID for fresh lookup and automatic map framing', async () => {
    const match = makeMatch(); vi.stubGlobal('fetch', vi.fn(async () => responseOk(makeHomePage([{ wish: makeWish(), items: [match] }]))));
    render(view()); await screen.findAllByRole('link', { name: new RegExp(match.listing.title) });
    screen.getByText('選願望交叉比對').closest('details')!.setAttribute('open', '');
    const link = screen.getByRole('link', { name: /在地圖交叉比對三國演義漫畫/ });
    const productLinks = await screen.findAllByRole('link', { name: new RegExp(match.listing.title) });
    expect(productLinks).toHaveLength(2);
    for (const productLink of productLinks) expect(productLink).toHaveAttribute('href', `/explore?wish=1&listing=${match.listing.id}`);
    expect(link).toHaveAttribute('href', `/explore?wish=1&listing=${match.listing.id}`);
  });
  it('shows incomplete failure instead of no matching items, and offers a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.includes('home-matches')) return responseOk(makeHomePage([{ wish: makeWish(), items: [makeMatch()], nextCursor: uuid() }])); throw new Error('offline'); }));
    render(view()); expect(await screen.findByRole('alert')).toHaveTextContent('這不代表沒有商品');
    expect(screen.queryByText(/目前沒有其他賣家/)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: /重新整理願望與配對/ })).toBeEnabled();
    expect(screen.queryByTestId('home-map')).not.toBeInTheDocument();
  });
  it('retains a truthful empty map after a complete read without inventing items or issuing a search', async () => {
    const fetch = vi.fn(async () => responseOk(makeHomePage([{ wish: makeWish() }])));
    vi.stubGlobal('fetch', fetch); render(view());
    const map = await screen.findByTestId('home-map');
    expect(map.parentElement).toHaveAttribute('aria-label', '沒有吻合商品標記的地圖概覽');
    expect(map).toHaveTextContent('沒有吻合商品標記');
    expect(within(map).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText(/目前沒有其他賣家的吻合商品/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '不套用願望，瀏覽商品地圖' }).every(link => link.getAttribute('href') === '/explore')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('/listings/home-matches?limit=100');
  });
  it('does not label pending or failed wish reads as empty, and explicitly recovers to the empty overview', async () => {
    let resolve!: (value: unknown) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; }))
      .mockResolvedValueOnce(responseOk(makeHomePage()));
    vi.stubGlobal('fetch', fetch); render(view());
    expect(screen.queryByTestId('home-map')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新整理願望與配對' })).toBeDisabled();
    await act(async () => resolve({ ok: false, status: 503, json: async () => ({ error: 'unavailable' }) }));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法載入願望或配對');
    expect(screen.queryByTestId('home-map')).not.toBeInTheDocument();
    expect(screen.queryByText('先留下你的第一個願望')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '重新整理願望與配對' }));
    await screen.findByTestId('home-map');
    expect(screen.getByText('先留下你的第一個願望')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('only shows the empty overview after an explicit successful retry of an incomplete match read', async () => {
    let matchReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('home-matches')) return responseOk(makeHomePage([{ wish: makeWish(), items: [], nextCursor: uuid() }]));
      return ++matchReads === 1 ? { ok: false, status: 503, json: async () => ({ error: 'unavailable' }) } : responseOk(makeMatchPage([]));
    }));
    render(view()); await screen.findByRole('alert');
    expect(screen.queryByTestId('home-map')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新整理願望與配對' }));
    await screen.findByTestId('home-map');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText(/目前沒有其他賣家的吻合商品/)).toBeInTheDocument();
    expect(matchReads).toBe(2);
  });
  it('describes a confirmed empty overview in English while keeping the original search destination', async () => {
    localStorage.setItem('user-locale', 'en-US');
    vi.stubGlobal('fetch', vi.fn(async () => responseOk(makeHomePage([{ wish: makeWish() }]))));
    render(view()); const map = await screen.findByTestId('home-map');
    expect(map.parentElement).toHaveAttribute('aria-label', 'Map overview without matching item markers');
    expect(map).toHaveTextContent('there are no matching item markers');
    expect(screen.getByText(/No matching items from other sellers/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View on map' })).toBeEnabled();
    expect(screen.getAllByRole('link', { name: 'Browse the item map without a wish filter' }).every(link => link.getAttribute('href') === '/explore')).toBe(true);
  });
  it('ignores late private wishes when the account session is replaced', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => (init.headers as Record<string, string>).Authorization === 'Bearer fixture'
      ? new Promise(done => { resolve = done; }) : Promise.resolve(responseOk(makeHomePage()))));
    const mounted = render(view()); mounted.rerender(view('second', 20));
    await screen.findByText('先留下你的第一個願望');
    await act(async () => resolve(responseOk(makeHomePage([{ wish: makeWish() }]))));
    expect(screen.queryByRole('radio', { name: /三國演義/ })).not.toBeInTheDocument();
  });
  it('keeps photo shortcuts optional and sends a Unicode search to the real explore route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseOk(makeHomePage())));
    const Path = () => <output data-testid="path">{useLocation().pathname + useLocation().search}</output>;
    render(<MemoryRouter><WishHomeWeb token="fixture" userId={19} /><Path /></MemoryRouter>);
    await screen.findByText('先留下你的第一個願望');
    expect(screen.getByRole('link', { name: '拍照新增願望' })).toHaveAttribute('href', '/wishes');
    expect(screen.getByRole('link', { name: '連拍刊登' })).toHaveAttribute('href', '/sell');
    fireEvent.change(screen.getByLabelText('搜尋商品'), { target: { value: ' 三國演義 & 漫畫 ' } });
    fireEvent.click(screen.getByRole('button', { name: '在地圖查看' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/explore?q=' + encodeURIComponent('三國演義 & 漫畫'));
  });
  it('deduplicates map photos shared by multiple wishes and preserves listing navigation', async () => {
    const item = makeListing();
    vi.stubGlobal('fetch', vi.fn(async () => responseOk(makeHomePage([{ wish: makeWish(1), items: [makeMatch(1, item)] }, { wish: makeWish(2), items: [makeMatch(2, item)] }]))));
    const Path = () => <output data-testid="path">{useLocation().pathname + useLocation().search}</output>;
    render(<MemoryRouter><WishHomeWeb token="fixture" userId={19} /><Path /></MemoryRouter>);
    const map = await screen.findByTestId('home-map'); expect(within(map).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(map).getByRole('button'));
    expect(screen.getByTestId('path')).toHaveTextContent('/explore?listing=' + item.id);
  });
  it('provides the same match expansion, chooser and destination in English', async () => {
    localStorage.setItem('user-locale', 'en-US'); const first = makeMatch(), second = makeMatch(1, makeListing('Other synthetic item'), 91);
    vi.stubGlobal('fetch', vi.fn(async () => responseOk(makeHomePage([{ wish: makeWish(), items: [first, second] }]))));
    render(view()); const expand = await screen.findByRole('button', { name: /has 2 matching items, View all/ });
    fireEvent.click(expand); expect(screen.getByRole('button', { name: /has 2 matching items, Collapse results/ })).toHaveAttribute('aria-expanded', 'true');
    const links = screen.getAllByRole('link', { name: /Other synthetic item/ }); expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/explore?wish=1&listing=' + second.listing.id);
    screen.getByText('Choose a wish to compare').closest('details')!.setAttribute('open', '');
    expect(screen.getByRole('radiogroup', { name: 'Choose the wish to compare' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Batch photo listing' })).toHaveAttribute('href', '/sell');
  });
});
