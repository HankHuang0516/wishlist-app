export const AUTH_RETURN_PATHS = ['/dashboard', '/account-deletion', '/my-listings', '/sell', '/explore', '/chat', '/settings', '/reports', '/social', '/settings/notifications', '/purchase-history', '/change-password'] as const;
import { isUuid } from './listingBatch';
export type AuthReturnTo = typeof AUTH_RETURN_PATHS[number] | `/chat?room=${string}` | `/listings/${string}` | `/wishlists/${number}`;
export function authReturnTo(value: string | null): AuthReturnTo {
  if (AUTH_RETURN_PATHS.includes(value as typeof AUTH_RETURN_PATHS[number])) return value as AuthReturnTo;
  const room = /^\/chat\?room=([^&?#]+)$/.exec(value ?? '');
  if (room && isUuid(room[1])) return `/chat?room=${room[1].toLowerCase()}`;
  const listing = /^\/listings\/([^/?#]+)$/.exec(value ?? '');
  if (listing && isUuid(listing[1])) return `/listings/${listing[1].toLowerCase()}`;
  const wishlist = /^\/wishlists\/([1-9]\d{0,9})$/.exec(value ?? '');
  if (wishlist && Number(wishlist[1]) <= 2147483647) return `/wishlists/${Number(wishlist[1])}`;
  return '/dashboard';
}
