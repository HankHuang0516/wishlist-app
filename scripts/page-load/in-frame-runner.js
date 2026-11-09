/* Page-load measurement inside a browser tab that is already signed in.
 *
 * For pages that can only be opened with a real person's own session, where the
 * harness may not sign in. Evaluate build-in-frame-payload.cjs's output in a tab
 * on the site (DevTools console or an automation tool). It covers the tab with a
 * phone-sized frame of the same site and measures pages in that frame with the
 * same observer and the same rules as page-load-budget.cjs:
 *
 *   await __plbFrame.load('/wishes')            a returning visit: full page load, cache and worker in place
 *   await __plbFrame.inApp('/wishes')           in-app navigation from another page, no reload
 *   __plbFrame.links('^/wishlists/\\d+$')        paths of links on the page now in the frame
 *   __plbFrame.close()                          remove the frame; reload the tab to remove everything
 *
 * Safety: every request from the frame that is not a GET or HEAD is refused before
 * it leaves the browser and is listed in the result, so opening a page can never
 * write anything (mark a conversation as read, save a draft). The results carry
 * times, counts and request paths with identifiers removed; never page text. */
(() => {
  if (window.__plbFrame) return 'already installed';
  const instrument = window.__plbInstrumentSource;
  if (typeof instrument !== 'string') return 'missing observer source';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const tidy = value => String(value).replace(location.origin, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\/\d+(?=\/|\?|$)/g, '/:n').replace(/\?.*$/, '?').slice(0, 80);
  let frame = null, stage = null;

  // Runs inside the frame's new document, before any of the page's own code.
  const guard = `(() => {
    if (window.__plbGuard) return;
    const refused = window.__plbGuard = [];
    const note = (method, url) => refused.push({ t: Math.round(performance.now()), method: String(method).toUpperCase(), url: String(url) });
    const read = method => /^(?:GET|HEAD)$/i.test(String(method || 'GET'));
    const fetchNow = window.fetch;
    window.fetch = function (input, init) {
      let method = 'GET', url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || String(input); method = (init && init.method) || (input && input.method) || 'GET'; } catch { /* Treated as a read. */ }
      if (!read(method)) { note(method, url); return Promise.reject(new TypeError('Write refused while the page-load measurement is running')); }
      return fetchNow.apply(this, arguments);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (!read(method)) { note(method, url); throw new Error('Write refused while the page-load measurement is running'); }
      return open.apply(this, arguments);
    };
    if (navigator.sendBeacon) navigator.sendBeacon = function (url) { note('BEACON', url); return false; };
    addEventListener('submit', event => { note('FORM', event.target && event.target.action); event.preventDefault(); }, true);
  })();`;

  function setup() {
    if (frame) return;
    stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#e7e5e4;display:flex;align-items:flex-start;justify-content:center;overflow:auto';
    frame = document.createElement('iframe');
    frame.style.cssText = 'width:390px;height:844px;border:0;background:#fff;flex:none';
    frame.setAttribute('title', 'page-load measurement');
    stage.appendChild(frame); document.documentElement.appendChild(stage);
  }

  // Point the frame at a page and put the observer and the write guard into its new document before the page's own
  // code runs. The page's code is a module, which runs only after the document is parsed, so there is time; the
  // result still records when the injection happened and whether anything had already been requested.
  async function open(path) {
    setup();
    const before = frame.contentWindow && frame.contentWindow.performance ? frame.contentWindow.performance.timeOrigin : 0;
    let injected = null;
    const tryInject = () => {
      const view = frame.contentWindow;
      try {
        if (!view || !view.document || !view.performance || view.performance.timeOrigin === before || view.location.href === 'about:blank' || view.__plb) return false;
        if (!view.document.documentElement) return false;
        const early = view.performance.getEntriesByType('resource').filter(entry => entry.name.startsWith(location.origin + '/api/')).length;
        view.eval(guard); view.eval(instrument);
        injected = { at: Math.round(view.performance.now()), readyState: view.document.readyState, apiBefore: early, rootChildren: view.document.getElementById('root') ? view.document.getElementById('root').childElementCount : null };
        return true;
      } catch { return false; }
    };
    // Ask in every turn of the event loop until the new document is there.
    const channel = new MessageChannel();
    const done = new Promise(resolve => {
      const started = performance.now();
      channel.port1.onmessage = () => { if (tryInject() || performance.now() - started > 15000) resolve(); else channel.port2.postMessage(0); };
    });
    frame.src = path;
    channel.port2.postMessage(0);
    await done; channel.port1.close();
    return injected;
  }

  async function settle(textLoaders, quiet = 700, timeout = 20000) {
    const started = performance.now();
    let last = null;
    while (performance.now() - started < timeout) {
      await sleep(100);
      let snapshot = null;
      try { snapshot = frame.contentWindow.__plb ? frame.contentWindow.__plb.snapshot({ textLoaders }) : null; } catch { continue; }
      if (!snapshot) continue;
      last = snapshot;
      const activity = Math.max(snapshot.lastText, snapshot.lastRequestEnd, snapshot.images.lastEnd, snapshot.lastResourceEnd, snapshot.navStart);
      const busy = snapshot.pending > 0 || snapshot.loaders.length > 0 || snapshot.images.pending > 0;
      if (!busy && snapshot.now - activity >= quiet && snapshot.textLength > 0) return { settled: true, snapshot };
    }
    return { settled: false, snapshot: last };
  }

  function serialDepth(calls) {
    const sorted = calls.filter(call => call.e !== null).sort((a, b) => a.s - b.s), depth = [];
    let best = 0;
    for (let index = 0; index < sorted.length; index++) {
      depth[index] = 1;
      for (let earlier = 0; earlier < index; earlier++) if (sorted[earlier].e <= sorted[index].s + 5) depth[index] = Math.max(depth[index], depth[earlier] + 1);
      best = Math.max(best, depth[index]);
    }
    return best;
  }

  function assemble(path, mode, outcome, injected) {
    const view = frame.contentWindow, snapshot = outcome.snapshot;
    if (!snapshot || !view.__plb) return { path: tidy(path), mode, settled: false, reason: 'page did not respond', content: null, injected };
    const report = view.__plb.report(), base = snapshot.navStart;
    const relative = value => (value && value >= base ? Math.round(value - base) : null);
    const text = relative(snapshot.lastText), image = snapshot.images.total ? relative(snapshot.images.lastEnd) : null, networkEnd = relative(snapshot.lastResourceEnd), map = snapshot.map ? networkEnd : null;
    const api = report.resources.filter(item => item.name.startsWith(location.origin + '/api/')).map(item => ({ p: tidy(item.name), s: item.start, d: item.duration, e: item.end, b: item.transfer }));
    const failed = report.requests.filter(item => typeof item.status === 'number' && (item.status === 429 || item.status >= 500)).map(item => tidy(item.url) + ' ' + item.status);
    const refusedWrites = (view.__plbGuard || []).filter(item => item.t >= base - 1).map(item => item.method + ' ' + tidy(item.url));
    const settled = outcome.settled && !failed.length;
    return {
      path: tidy(path), final: tidy(snapshot.path), mode, settled,
      reason: failed.length ? 'the server refused or failed: ' + failed[0] : outcome.settled ? '' : [snapshot.pending ? 'requests still in flight' : '', snapshot.loaders.length ? 'loading indicator still shown' : '', snapshot.images.pending ? 'images still loading' : ''].filter(Boolean).join('; ') || 'still changing',
      content: settled ? Math.max(text || 0, image || 0, map || 0) : null, text, image, map, route_ready: relative(snapshot.routeReady), network_end: networkEnd,
      api_count: api.length, api_serial_depth: serialDepth(api), api, images_in_view: snapshot.images.total, loaders: snapshot.loaders.length,
      refused_writes: refusedWrites, injected, width: view.innerWidth, height: view.innerHeight, long_tasks_ms: report.longTasks.reduce((sum, task) => sum + task.d, 0),
    };
  }

  window.__plbFrame = {
    // A returning visit: a full load of the page in the frame.
    async load(path, { textLoaders = true } = {}) {
      const injected = await open(path);
      if (!injected) return { path: tidy(path), mode: 'warm', settled: false, reason: 'the frame did not load', content: null };
      return assemble(path, 'warm', await settle(textLoaders), injected);
    },
    // In-app navigation: load another page first, then change route the way the app's own links do.
    async inApp(path, { from = '/terms', textLoaders = true } = {}) {
      const injected = await open(path.split('?')[0] === from ? '/privacy' : from);
      if (!injected) return { path: tidy(path), mode: 'spa', settled: false, reason: 'the frame did not load', content: null };
      await settle(true);
      const view = frame.contentWindow;
      view.__plb.begin();
      view.history.pushState(null, '', path);
      view.dispatchEvent(new view.PopStateEvent('popstate', { state: null }));
      return assemble(path, 'spa', await settle(textLoaders), injected);
    },
    // Paths of the links on the page now in the frame that match a pattern (to find a page that needs an identifier).
    links(pattern) {
      const test = new RegExp(pattern), found = new Set();
      for (const link of frame.contentDocument.querySelectorAll('a[href]')) { const href = link.getAttribute('href'); if (href && test.test(href)) found.add(href); }
      return [...found].slice(0, 20);
    },
    signedIn() { return !frame || !frame.contentDocument ? null : !frame.contentDocument.querySelector('a[href="/login"]'); },
    close() { if (stage) stage.remove(); frame = stage = null; },
  };
  return 'installed';
})()
