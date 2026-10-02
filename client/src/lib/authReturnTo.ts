export const AUTH_RETURN_PATHS = ['/dashboard', '/wishes', '/account-deletion', '/my-listings', '/sell', '/explore', '/chat', '/settings', '/reports', '/social', '/settings/notifications', '/purchase-history', '/change-password'] as const;
import { isUuid } from './listingBatch';
export type AuthReturnTo = typeof AUTH_RETURN_PATHS[number] | `/chat?room=${string}` | `/chat?source=${string}` | `/explore?source=${string}` | `/listings/${string}` | `/wishlists/${number}` | `/wishes?list=${number}` | `/users/${number}/profile` | `/users/${number}/wishlists`;
export function authReturnTo(value: string | null): AuthReturnTo {
  if (AUTH_RETURN_PATHS.includes(value as typeof AUTH_RETURN_PATHS[number])) return value as AuthReturnTo;
  const source=/^\/(chat|explore)\?source=([^&?#]+)$/.exec(value??'');
  if(source&&isUuid(source[2]))return `/${source[1]}?source=${source[2].toLowerCase()}` as AuthReturnTo;
  const room = /^\/chat\?room=([^&?#]+)$/.exec(value ?? '');
  if (room && isUuid(room[1])) return `/chat?room=${room[1].toLowerCase()}`;
  const listing = /^\/listings\/([^/?#]+)$/.exec(value ?? '');
  if (listing && isUuid(listing[1])) return `/listings/${listing[1].toLowerCase()}`;
  const wishlist = /^\/wishlists\/([1-9]\d{0,9})$/.exec(value ?? '');
  if (wishlist && Number(wishlist[1]) <= 2147483647) return `/wishlists/${Number(wishlist[1])}`;
  const wishList = /^\/wishes\?list=([1-9]\d{0,9})$/.exec(value ?? '');
  if (wishList && Number(wishList[1]) <= 2147483647) return `/wishes?list=${Number(wishList[1])}`;
  const friend=/^\/users\/([1-9]\d{0,9})\/(profile|wishlists)$/.exec(value??'');
  if(friend&&Number(friend[1])<=2147483647)return value as AuthReturnTo;
  return '/dashboard';
}
