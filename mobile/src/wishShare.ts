import type { ManagedWish } from './wishManagement';

// A text invitation shares only fields explicitly previewed to the owner.
// Private image URLs, notes, IDs and account data never leave the app.
export function wishShareMessage(wish: Pick<ManagedWish, 'name' | 'maxPrice' | 'priceCurrency'>): string {
  const budget = wish.maxPrice === null ? '' : `\n我的預算：${wish.priceCurrency ?? ''} ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(wish.maxPrice)}`;
  return `我的願望是「${wish.name}」${budget}\n如果你剛好看到，分享給我吧！\n— Wishlist.ai 願望市集`;
}
