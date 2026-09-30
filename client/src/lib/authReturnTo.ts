export const AUTH_RETURN_PATHS = ['/dashboard', '/account-deletion', '/my-listings', '/sell', '/explore', '/chat', '/settings', '/reports'] as const;
import { isUuid } from './listingBatch';
export type AuthReturnTo = typeof AUTH_RETURN_PATHS[number] | `/chat?room=${string}` | `/listings/${string}`;
export function authReturnTo(value: string | null): AuthReturnTo {
  if (AUTH_RETURN_PATHS.includes(value as typeof AUTH_RETURN_PATHS[number])) return value as AuthReturnTo;
  const room = /^\/chat\?room=([^&?#]+)$/.exec(value ?? '');
  if (room && isUuid(room[1])) return `/chat?room=${room[1].toLowerCase()}`;
  const listing = /^\/listings\/([^/?#]+)$/.exec(value ?? '');
  if (listing && isUuid(listing[1])) return `/listings/${listing[1].toLowerCase()}`;
  return '/dashboard';
}
