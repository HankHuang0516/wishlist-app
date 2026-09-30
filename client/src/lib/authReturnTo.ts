export const AUTH_RETURN_PATHS = ['/dashboard', '/account-deletion', '/my-listings', '/sell', '/explore', '/chat', '/settings'] as const;
export type AuthReturnTo = typeof AUTH_RETURN_PATHS[number];
export function authReturnTo(value: string | null): AuthReturnTo {
  return AUTH_RETURN_PATHS.includes(value as AuthReturnTo) ? value as AuthReturnTo : '/dashboard';
}
