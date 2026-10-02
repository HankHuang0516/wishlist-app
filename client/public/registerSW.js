/* Compatibility for cached HTML from before the explicit update UI. New HTML
 * does not load this file. Prepare assets only; never reload or clear storage. */
(() => {
  function prepare() {
    try {
      const worker = navigator.serviceWorker;
      if (typeof worker?.register !== 'function') return;
      void worker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(registration => registration.update()).catch(() => {});
    } catch { /* Existing pages remain usable if worker access is unavailable. */ }
  }
  if (document.readyState === 'complete') prepare();
  else window.addEventListener('load', prepare, { once: true });
})();
