import { describe, expect, it } from 'vitest';
import { TABS, TAB_IDS } from '../navigation';

describe('stable public native navigation identifiers (not runtime evidence)', () => {
  it('retains the wishlist-led five-tab order', () => {
    expect(TABS).toEqual(['首頁', '願望', '探索', '社交', '我的']);
  });
  it.each([
    ['首頁', 'wishlist-tab-home'], ['願望', 'wishlist-tab-wishes'], ['探索', 'wishlist-tab-explore'],
    ['社交', 'wishlist-tab-social'], ['我的', 'wishlist-tab-account'],
  ] as const)('assigns %s a stable identifier', (label, identifier) => {
    expect(TAB_IDS[label]).toBe(identifier);
  });
  it('does not allow ambiguous or mutable navigation identifiers', () => {
    expect(new Set(Object.values(TAB_IDS)).size).toBe(5);
    expect(Object.keys(TAB_IDS)).toEqual([...TABS]);
    expect(Object.isFrozen(TAB_IDS)).toBe(true); expect(Object.isFrozen(TABS)).toBe(true);
  });
});
