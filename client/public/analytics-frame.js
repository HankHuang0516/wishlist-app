/* Classic script: sandbox lacks allow-same-origin, so module/CORS is unsuitable.
 * This document cannot read its parent's URL, forms, session or DOM. */
(() => {
  'use strict';
  const id = 'G-3E3LMNH9JR';
  const paths = new Set(['/', '/login', '/register', '/terms', '/privacy', '/support', '/partners/inquiry', '/partners', '/account-deletion', '/forgot-password', '/verify-email', '/reset-password', '/dashboard', '/wishes', '/sell', '/my-listings', '/explore', '/reports', '/chat', '/social', '/settings', '/api-docs', '/api-showcase', '/changelog', '/settings/notifications', '/change-password', '/purchase-history', '/listings/item', '/wishlists/list', '/users/user/profile', '/users/user/wishlists', '/not-found']);
  paths.add('/resend-verification');
  let connected = false, stopped = false, loaded = false;
  let currentPath = '/analytics';
  const disabled = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const origin = new URL(location.href).origin;
  const metadata = () => ({ page_location: origin + currentPath, page_referrer: '', page_title: 'Wishlist.ai' });
  function valid(value, keys) {
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.sort().join(',');
  }
  function gtag() {
    if (stopped || disabled()) return;
    // A blocked SDK must not accumulate an unbounded queue.
    if (loaded || window.dataLayer.length < 50) window.dataLayer.push(arguments);
  }
  function receive(value) {
    if (stopped || disabled() || !value || typeof value.event !== 'string') return;
    let params;
    switch (value.event) {
      case 'page_view':
        if (!valid(value, ['event', 'path']) || !paths.has(value.path)) return;
        currentPath = value.path; params = {}; break;
      case 'login': case 'sign_up':
        if (!valid(value, ['event', 'method']) || !['phone', 'email'].includes(value.method)) return;
        params = { method: value.method }; break;
      case 'share':
        if (!valid(value, ['event', 'contentType']) || !['wishlist', 'item'].includes(value.contentType)) return;
        params = { method: 'native_or_copy', content_type: value.contentType }; break;
      case 'add_to_wishlist':
        if (!valid(value, ['event', 'count']) || !Number.isInteger(value.count) || value.count < 0 || value.count > 100) return;
        params = { item_count: value.count }; break;
      case 'view_item_list':
        if (!valid(value, ['event'])) return;
        params = {}; break;
      default: return;
    }
    gtag('config', id, { update: true, send_page_view: false, ...metadata() });
    gtag('event', value.event, { send_to: id, ...metadata(), ...params });
  }
  window.addEventListener('message', event => {
    if (connected || disabled() || window.parent === window || event.source !== window.parent || event.origin !== origin ||
        !valid(event.data, ['kind', 'version']) || event.data.kind !== 'wishlist-analytics-connect' || event.data.version !== 1 || event.ports.length !== 1) return;
    connected = true;
    const port = event.ports[0];
    window.dataLayer = [];
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, ...metadata() });
    const script = document.createElement('script');
    script.async = true; script.referrerPolicy = 'no-referrer';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    script.onload = () => { loaded = true; };
    script.onerror = () => { stopped = true; window.dataLayer = []; port.close(); };
    port.onmessage = message => receive(message.data);
    port.start();
    document.head.append(script);
    port.postMessage('ready');
  });
})();
