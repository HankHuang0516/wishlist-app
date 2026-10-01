const routes = new Set(['/', '/login', '/register', '/terms', '/privacy', '/support', '/partners/inquiry', '/partners', '/account-deletion', '/forgot-password', '/verify-email', '/reset-password', '/dashboard', '/wishes', '/sell', '/my-listings', '/explore', '/reports', '/chat', '/social', '/settings', '/api-docs', '/api-showcase', '/changelog', '/settings/notifications', '/change-password', '/purchase-history']);

/** Only route categories cross the analytics boundary. Never query/hash or IDs. */
export function analyticsPath(pathname: string) {
  if (routes.has(pathname)) return pathname;
  if (/^\/listings\/[0-9a-f-]{36}$/i.test(pathname)) return '/listings/item';
  if (/^\/wishlists\/[1-9]\d*$/.test(pathname)) return '/wishlists/list';
  if (/^\/users\/[1-9]\d*\/profile$/.test(pathname)) return '/users/user/profile';
  if (/^\/users\/[1-9]\d*\/wishlists$/.test(pathname)) return '/users/user/wishlists';
  return '/not-found';
}

export type AnalyticsMessage =
  | { event: 'page_view'; path: string }
  | { event: 'login' | 'sign_up'; method: 'phone' | 'email' }
  | { event: 'share'; contentType: 'wishlist' | 'item' }
  | { event: 'add_to_wishlist'; count: number }
  | { event: 'view_item_list' };

export function analyticsDisabled() {
  return typeof navigator === 'undefined' || navigator.doNotTrack === '1' ||
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}
