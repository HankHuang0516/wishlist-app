export const TABS = Object.freeze(['首頁', '願望', '探索', '社交', '我的'] as const);
export type Tab = typeof TABS[number];
// Stable public identifiers belong to the actual actionable tab containers,
// not their text children. Preserve tab semantics on both native platforms.
export const TAB_IDS = Object.freeze({
  首頁: 'wishlist-tab-home',
  願望: 'wishlist-tab-wishes',
  探索: 'wishlist-tab-explore',
  社交: 'wishlist-tab-social',
  我的: 'wishlist-tab-account',
} as const satisfies Record<Tab, string>);
