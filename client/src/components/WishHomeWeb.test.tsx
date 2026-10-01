import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WishHomeWeb from './WishHomeWeb';
import { makeWish, makeMatch, makeMatchPage, makeListing, responseOk } from '../__tests__/fixtures/marketplace';
vi.mock('./ExploreMapWeb', () => ({ default: ({ items, onSelect }: { items: { id: string }[]; onSelect: (value: { kind: 'seller'; id: string }) => void }) => <div data-testid="home-map">{items.map(item => <button key={item.id} onClick={() => onSelect({ kind: 'seller', id: item.id })}>地圖商品 {item.id}</button>)}</div> }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const view = (token = 'fixture', userId = 19) => <MemoryRouter><WishHomeWeb key={token} token={token} userId={userId} /></MemoryRouter>;
describe('APP-equivalent homepage match UX', () => {
  it('shows one best match per wish, expands alternatives, and puts the wish selector below matches', async () => {
    const first = makeMatch(), best = makeMatch(1, makeListing('最匹配的三國演義'), 98);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [makeWish()], nextCursor: null } : makeMatchPage([first, best]))));
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
    expect(within(screen.getByRole('region')).getAllByRole('heading').map(el => el.textContent)).toEqual(['Welcome Back.', '願望吻合的商品', '願望：三國演義漫畫', '快捷功能 選用']);
    expect(chooser.querySelector('summary')).toHaveTextContent('今天想找什麼？');
    expect(screen.getByRole('link', { name: /在地圖交叉比對三國演義漫畫/ })).toHaveAttribute('href', '/explore?wish=1');
  });
  it('passes the single match ID for fresh lookup and automatic map framing', async () => {
    const match = makeMatch(); vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [makeWish()], nextCursor: null } : makeMatchPage([match]))));
    render(view()); await screen.findAllByRole('link', { name: new RegExp(match.listing.title) });
    screen.getByText('選願望交叉比對').closest('details')!.setAttribute('open', '');
    const link = screen.getByRole('link', { name: /在地圖交叉比對三國演義漫畫/ });
    const productLinks = await screen.findAllByRole('link', { name: new RegExp(match.listing.title) });
    expect(productLinks).toHaveLength(2);
    for (const productLink of productLinks) expect(productLink).toHaveAttribute('href', `/explore?wish=1&listing=${match.listing.id}`);
    expect(link).toHaveAttribute('href', `/explore?wish=1&listing=${match.listing.id}`);
  });
  it('shows incomplete failure instead of no matching items, and offers a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.includes('match-wishes')) return responseOk({ items: [makeWish()], nextCursor: null }); throw new Error('offline'); }));
    render(view()); expect(await screen.findByRole('alert')).toHaveTextContent('這不代表沒有商品');
    expect(screen.queryByText(/目前沒有其他賣家/)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: /重新整理願望與配對/ })).toBeEnabled();
  });
  it('ignores late private wishes when the account session is replaced', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => (init.headers as Record<string, string>).Authorization === 'Bearer fixture'
      ? new Promise(done => { resolve = done; }) : Promise.resolve(responseOk({ items: [], nextCursor: null }))));
    const mounted = render(view()); mounted.rerender(view('second', 20));
    await screen.findByText('先留下你的第一個願望');
    await act(async () => resolve(responseOk({ items: [makeWish()], nextCursor: null })));
    expect(screen.queryByRole('radio', { name: /三國演義/ })).not.toBeInTheDocument();
  });
  it('keeps photo shortcuts optional and sends a Unicode search to the real explore route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseOk({ items: [], nextCursor: null })));
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
    vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [makeWish(1), makeWish(2)], nextCursor: null } : makeMatchPage([makeMatch(Number(new URL(url).searchParams.get('wishItemId')), item)]))));
    const Path = () => <output data-testid="path">{useLocation().pathname + useLocation().search}</output>;
    render(<MemoryRouter><WishHomeWeb token="fixture" userId={19} /><Path /></MemoryRouter>);
    const map = await screen.findByTestId('home-map'); expect(within(map).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(map).getByRole('button'));
    expect(screen.getByTestId('path')).toHaveTextContent('/explore?listing=' + item.id);
  });
});
