import React, { type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { parseHomeWishMatches, type HomeWishGroup } from '../homeWishMatches';

// Inspect the real home component's element tree without loading native modules in Node.
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', AppState: { addEventListener: () => ({ remove() {} }) }, Image: 'Image', Pressable: 'Pressable',
  ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
const { HomeWishMatches } = await import('../WishHome');

const api = 'https://wishlist.example/api';
const uuid = (n: number) => '12345678-1234-4234-8234-' + String(n).padStart(12, '0');
const product = (n: number, wishItemId: number, kind: 'listing' | 'external' = 'listing') => ({
  kind, id: uuid(n), key: kind + ':' + uuid(n), title: '商品 ' + n, description: '說明', mainId: 'electronics', subId: 'monitors',
  price: 700 + n, priceText: String(700 + n), currency: 'TWD', priceUnitVerified: true, thumbnailUrl: '/api/listings/photo-' + n, photos: [],
  county: '臺南市', district: '永康區', condition: 'USED', sourceLabel: 'Wishlist', stockStatus: 'ACTIVE', date: '2026-11-11T00:00:00Z',
  dateBasis: 'PUBLISHED', dateEarliest: null, match: { wishItemId, score: 100 - n, reasons: n % 2 ? ['NAME'] : ['NAME', 'BUDGET'] },
});
const wish = (id: number, name: string) => ({ id, name, maxPrice: 1000, priceCurrency: 'TWD', wishlist: { id: 9, title: '我的清單' } });
const answer = () => ({
  complete: true, generatedAt: '2026-11-11T00:00:00Z',
  groups: [
    { wish: wish(31, '二手螢幕'), total: 20, items: Array.from({ length: 12 }, (_, i) => product(i + 1, 31, i % 3 ? 'listing' : 'external')) },
    { wish: wish(30, '藍色馬克杯'), total: 1, items: [product(50, 30)] },
    { wish: wish(29, '黑膠唱盤'), total: 0, items: [] },
  ],
});

type Element = ReactElement<Record<string, any>>;
function elements(node: ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => {
    if (!React.isValidElement(child)) return [];
    const element = child as Element;
    // Render the file's own function components so their output is inspected too.
    if (typeof element.type === 'function') return [element, ...elements((element.type as (props: unknown) => ReactNode)(element.props))];
    return [element, ...elements(element.props.children)];
  });
}
function text(node: ReactNode): string {
  return React.Children.toArray(node).map(child => React.isValidElement(child) ? text((child as Element).props.children) : String(child)).join('');
}
const render = (groups: HomeWishGroup[], expanded: number | null = null) => {
  const actions = { onToggle: vi.fn(), onOpen: vi.fn(), onMore: vi.fn() };
  const tree = elements(<HomeWishMatches groups={groups} expanded={expanded} {...actions} />);
  return { tree, all: tree.filter(e => e.type === 'Text').map(e => text(e.props.children)).join('\n'), buttons: tree.filter(e => e.type === 'Pressable'), ...actions };
};

describe('home wish matches answer', () => {
  it('keeps every wish, its best products and the total, with safe image addresses', () => {
    const groups = parseHomeWishMatches(answer(), api);
    expect(groups.map(g => [g.wish.id, g.total, g.items.length])).toEqual([[31, 20, 12], [30, 1, 1], [29, 0, 0]]);
    expect(groups[0].items[0].thumbnailUrl).toBe('https://wishlist.example/api/listings/photo-1');
    expect(groups[0].wish.wishlist.title).toBe('我的清單');
  });
  it('rejects incomplete, mixed-up or invented answers', () => {
    const broken: Array<(v: ReturnType<typeof answer>) => unknown> = [
      v => ({ ...v, complete: false }),
      v => { v.groups[1].wish.id = 31; return v; },
      v => { v.groups[0].items[3] = product(60, 30); return v; },
      v => { v.groups[0].items[4] = v.groups[0].items[5]; return v; },
      v => { v.groups[0].total = 5; return v; },
      v => { v.groups[2].total = 3; return v; },
      v => { v.groups[0].items.push(product(70, 31)); v.groups[0].total = 30; return v; },
      v => { (v.groups[1].items[0] as Record<string, unknown>).thumbnailUrl = 'javascript:alert(1)'; return v; },
      v => { (v.groups[1].wish as Record<string, unknown>).maxPrice = -1; return v; },
      v => ({ ...v, groups: Array.from({ length: 51 }, (_, i) => ({ wish: wish(i + 1, '願望'), total: 0, items: [] })) }),
    ];
    for (const change of broken) expect(() => parseHomeWishMatches(change(answer()), api)).toThrow();
  });
});

describe('home wish matches screen', () => {
  it('shows each matched wish with its best product and names the unmatched ones, without asking to choose a wish', () => {
    const { all, tree } = render(parseHomeWishMatches(answer(), api));
    expect(all).toContain('二手螢幕');
    expect(all).toContain('商品 1');
    expect(all).toContain('藍色馬克杯');
    expect(all).toContain('商品 50');
    expect(all).not.toContain('商品 2');
    expect(all).toContain('查看全部 20 件');
    expect(all).toContain('這些願望目前沒有吻合的商品：黑膠唱盤');
    expect(all).not.toMatch(/今天想找什麼|不套用願望|尋找這個願望的商品/);
    // A single match has nothing to expand.
    expect(tree.filter(e => e.type === 'Pressable' && String(e.props.accessibilityLabel).startsWith('藍色馬克杯共有'))).toHaveLength(0);
  });
  it('opens a product, expands a wish in place and hands the rest to explore', () => {
    const groups = parseHomeWishMatches(answer(), api);
    const closed = render(groups);
    closed.buttons.find(b => String(b.props.accessibilityLabel).startsWith('商品 1，'))!.props.onPress();
    expect(closed.onOpen).toHaveBeenCalledWith(groups[0].items[0]);
    const expander = closed.buttons.find(b => b.props.accessibilityLabel === '二手螢幕共有20件吻合商品，查看全部')!;
    expect(expander.props.accessibilityState).toEqual({ expanded: false });
    expander.props.onPress();
    expect(closed.onToggle).toHaveBeenCalledWith(31);

    const open = render(groups, 31);
    for (let n = 2; n <= 12; n++) expect(open.all).toContain('商品 ' + n);
    expect(open.all).toContain('收合結果');
    open.buttons.find(b => text(b.props.children).includes('在探索看這個願望的全部 20 件'))!.props.onPress();
    expect(open.onMore).toHaveBeenCalledWith(31);
    expect(open.all).toContain('公開來源');
    expect(open.all).toContain('符合願望與預算');
  });
});
