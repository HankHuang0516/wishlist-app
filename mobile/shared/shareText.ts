// What a share hands to another app, the same from the web page and from the app: a line or two of text, then the
// address on a line of its own. The address opens a page anyone can read without an account, so whoever receives the
// text has a way in.
export type ShareLocale = 'zh' | 'en';
export type ShareProductKind = 'listing' | 'source' | 'external';

const productId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The text and its address as one message, for a target that takes a single piece of text. */
export const withShareUrl = (lines: string, url: string) => lines + '\n' + url;

/** The page of one product, relative to the site. A listing has had its own page from the start; its version, when
 *  known, keeps a link preview from showing an earlier price. Public-source and partner products share one form. */
export function productSharePath(kind: ShareProductKind, id: string, version?: number): string | null {
  if (!productId.test(id)) return null;
  if (kind === 'listing') return '/listings/' + id + (version !== undefined && Number.isSafeInteger(version) && version > 0 && version <= 2147483647 ? '?v=' + version : '');
  return kind === 'source' || kind === 'external' ? '/products/' + kind + '/' + id : null;
}

export function productShareLines(title: string, price: string, locale: ShareLocale = 'zh'): string {
  return locale === 'zh' ? `看看「${title}」｜${price}` : `Take a look: ${title} | ${price}`;
}

/** The page of one shared wish. Only the server can make the last part, and only the wish's owner is given it. */
export function wishSharePath(value: unknown): string | null {
  const path = value && typeof value === 'object' ? (value as { path?: unknown }).path : value;
  return typeof path === 'string' && /^\/shared-wishes\/[A-Za-z0-9_-]{22}$/.test(path) ? path : null;
}

export type SharedWishFields = { name: string; maxPrice: number | null; priceCurrency: string | null };

/** The budget as the share text and the shared page both write it, or '' when the owner set none. */
export function wishShareBudget(wish: Pick<SharedWishFields, 'maxPrice' | 'priceCurrency'>): string {
  return wish.maxPrice === null ? '' : `${wish.priceCurrency ?? ''} ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(wish.maxPrice)}`.trim();
}

/** Says only what the owner sees before sharing: the wish's name and budget. The photo, notes and links stay private. */
export function wishShareLines(wish: SharedWishFields, locale: ShareLocale = 'zh'): string {
  const budget = wishShareBudget(wish);
  return locale === 'zh'
    ? `我的願望是「${wish.name}」${budget ? `\n我的預算：${budget}` : ''}\n如果你剛好看到，分享給我吧！\n— Wishlist.ai 願望市集`
    : `My wish: ${wish.name}${budget ? `\nMy budget: ${budget}` : ''}\nIf you come across it, let me know!\n— Wishlist.ai`;
}

/** What the shared page is given to show. Anything else in the answer is a fault, not something to display. */
export function parseSharedWish(value: unknown): SharedWishFields {
  const wish = value as SharedWishFields | null;
  if (!wish || typeof wish !== 'object' || Array.isArray(wish) || Object.keys(wish).sort().join(',') !== 'maxPrice,name,priceCurrency' ||
      typeof wish.name !== 'string' || !wish.name.trim() || wish.name.length > 1000 ||
      !(wish.maxPrice === null || typeof wish.maxPrice === 'number' && Number.isFinite(wish.maxPrice) && wish.maxPrice >= 0) ||
      !(wish.priceCurrency === null || typeof wish.priceCurrency === 'string' && wish.priceCurrency.length <= 8))
    throw new Error('Invalid shared wish');
  return { name: wish.name, maxPrice: wish.maxPrice, priceCurrency: wish.maxPrice === null ? null : wish.priceCurrency };
}
