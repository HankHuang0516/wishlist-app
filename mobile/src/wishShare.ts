import { validateApiUrl } from './api';
import { wishShareLines, wishSharePath, withShareUrl } from './shareText';
import type { ManagedWish } from './wishManagement';

// A shared wish says only what its owner sees before sending it: the name and the budget, then the address of the
// wish's shared page, which shows those same two things to whoever opens it. Private image URLs, notes, links, the
// wish's number and account data never leave the app; the address is made by the server and given to the owner alone.
export function wishShareMessage(wish: Pick<ManagedWish, 'name' | 'maxPrice' | 'priceCurrency'>, url: string): string {
  return withShareUrl(wishShareLines({ name: wish.name, maxPrice: wish.maxPrice, priceCurrency: wish.priceCurrency }), url);
}

/** The shared page's address from the server's answer, on the public site this app talks to. */
export function wishShareUrl(answer: unknown, apiUrl: string, local = false): string {
  const path = wishSharePath(answer);
  if (!path) throw new Error('Invalid wish share link');
  return new URL(validateApiUrl(apiUrl, local)).origin + path;
}
