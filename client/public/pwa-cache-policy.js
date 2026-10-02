/* Retire the original catch-all image cache. Public artwork is already in the
 * generated precache; account photos and arbitrary URLs must never migrate.
 * Only caches owned by this policy are touched. No journal, session, request
 * body, background replay or page reload is involved. */
(() => {
  const artwork = new Set([
    '/logo.png', '/favicon.ico', '/apple-touch-icon.png', '/masked-icon.svg',
    '/features/feature1.png', '/features/feature2.png',
    '/features/feature3.png', '/features/feature4.png',
  ]);
  const current = 'wishlist-public-artwork-v1';
  let pending;
  function permitted(request) {
    try {
      const url = new URL(request.url);
      return request.method === 'GET' && url.origin === self.location.origin &&
        !url.username && !url.password && !url.search && !url.hash && artwork.has(url.pathname);
    } catch { return false; }
  }
  async function clean() {
    const names = await caches.keys();
    // Never copy anything from the legacy catch-all cache, including a response
    // stored under an innocent-looking key. The build supplies public artwork.
    if (names.includes('images')) {
      await caches.delete('images');
      if ((await caches.keys()).includes('images')) throw Error('Image cache cleanup unavailable');
    }
    if (names.includes(current)) {
      const cache = await caches.open(current);
      for (const request of await cache.keys()) {
        if (!permitted(request)) {
          await cache.delete(request);
          if (await cache.match(request)) throw Error('Image cache cleanup unavailable');
        }
      }
    }
  }
  function maintain() {
    if (!pending) pending = clean().finally(() => { pending = undefined; });
    return pending;
  }
  self.addEventListener('activate', event => event.waitUntil(maintain()));
  // A late fetch in an already-running retired worker may recreate its cache.
  // Recheck on navigation; the new worker never serves the retired cache.
  self.addEventListener('fetch', event => {
    if (event.request.mode === 'navigate') event.waitUntil(maintain());
  });
})();
