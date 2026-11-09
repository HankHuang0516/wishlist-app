/* Page-load budget instrumentation. Injected before any page script runs.
 * Read-only: it wraps fetch/XHR to know when requests are in flight and watches
 * the DOM to learn when visible text stops changing. It never changes a request,
 * a response or the page's own state. */
(() => {
  if (window.__plb) return;
  const now = () => performance.now();
  const S = {
    navStart: 0, pending: 0, requests: [], lastRequestEnd: 0,
    textHash: null, lastText: 0, textEvents: [], mutations: 0, lastMutationSource: '',
    routeReady: 0, fallbackSeen: 0,
    lcp: [], longTasks: [], resourceEnds: [],
  };

  // ---- requests in flight ------------------------------------------------
  const track = (url, method) => {
    const record = { url: String(url), method: String(method || 'GET').toUpperCase(), start: now(), end: null, status: null };
    S.requests.push(record); S.pending++;
    return record;
  };
  const done = (record, status) => {
    if (record.end !== null) return;
    record.end = now(); record.status = status; S.pending--; S.lastRequestEnd = record.end;
  };
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      let url = '', method = 'GET';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || String(input);
        method = (init && init.method) || (input && input.method) || 'GET';
      } catch { /* Keep the page's own request untouched. */ }
      const record = track(url, method);
      let promise;
      try { promise = originalFetch.apply(this, arguments); } catch (error) { done(record, 'throw'); throw error; }
      return promise.then(response => {
        try {
          const type = response.headers.get('content-type') || '';
          if (/event-stream/i.test(type) || !response.body) done(record, response.status);
          else response.clone().arrayBuffer().then(() => done(record, response.status), () => done(record, response.status));
        } catch { done(record, response.status); }
        return response;
      }, error => { done(record, 'error'); throw error; });
    };
  }
  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__plbInfo = { method, url }; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    const info = this.__plbInfo || {};
    const record = track(info.url, info.method);
    this.addEventListener('loadend', () => done(record, this.status));
    return send.apply(this, arguments);
  };

  // ---- visible text ------------------------------------------------------
  const describe = node => {
    const parts = [];
    let element = node && node.nodeType === 1 ? node : node && node.parentElement;
    for (let depth = 0; element && depth < 3; depth++, element = element.parentElement) {
      const classes = String(element.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      parts.unshift(element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') + (classes ? '.' + classes : ''));
    }
    return parts.join('>');
  };
  let scheduled = false;
  const sample = frameTime => {
    scheduled = false;
    const body = document.body; if (!body) return;
    const text = body.innerText || '';
    let hash = 5381;
    for (let index = 0; index < text.length; index++) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
    if (hash === S.textHash) return;
    S.textHash = hash; S.lastText = frameTime;
    // The route's own page replaces the lazy-loading placeholder.
    if (/正在載入頁面|Loading page/.test(text)) S.fallbackSeen = frameTime;
    else if (!S.routeReady && text.trim().length > 0) S.routeReady = frameTime;
    S.textEvents.push({ t: Math.round(frameTime), length: text.length, source: S.lastMutationSource });
    if (S.textEvents.length > 80) S.textEvents.shift();
  };
  const observer = new MutationObserver(records => {
    S.mutations += records.length;
    S.lastMutationSource = describe(records[records.length - 1].target);
    // Sample in the frame that paints the change, so the time is what a person sees.
    if (!scheduled) { scheduled = true; requestAnimationFrame(sample); }
  });
  const watch = () => observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  if (document.documentElement) watch(); else document.addEventListener('readystatechange', watch, { once: true });

  // ---- paint and resource timing ----------------------------------------
  const observe = (type, handler) => {
    try { new PerformanceObserver(list => list.getEntries().forEach(handler)).observe({ type, buffered: true }); }
    catch { /* Entry type unavailable in this browser. */ }
  };
  observe('largest-contentful-paint', entry => S.lcp.push({
    t: Math.round(entry.startTime), size: entry.size, tag: entry.element ? entry.element.tagName : '',
    url: entry.url ? String(entry.url).slice(0, 160) : '', text: entry.element ? String(entry.element.innerText || '').trim().slice(0, 60) : '',
  }));
  observe('longtask', entry => S.longTasks.push({ t: Math.round(entry.startTime), d: Math.round(entry.duration) }));

  // ---- snapshot ----------------------------------------------------------
  const loaderText = /(載入中|正在載入|讀取中|正在讀取|載入頁面|請稍候|搜尋中|正在搜尋|查詢中|正在查詢|正在取得|正在確認|正在同步|Loading|loading…)/;
  const visible = element => {
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.01;
  };
  const inViewport = box => box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
  // A loading indicator counts only where a person can see it: inside the window and not scrolled out of a
  // scrolling box. A list keeps "loading image" placeholders for the rows it has not scrolled to yet, and the
  // browser does not fetch those images until they come into view; they are not part of what is on screen.
  const seen = element => {
    if (!visible(element)) return false;
    let box = element.getBoundingClientRect();
    if (!inViewport(box)) return false;
    box = { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const clip = parent.getBoundingClientRect();
      box = { top: Math.max(box.top, clip.top), bottom: Math.min(box.bottom, clip.bottom), left: Math.max(box.left, clip.left), right: Math.min(box.right, clip.right) };
      if (box.bottom - box.top < 1 || box.right - box.left < 1) return false;
    }
    return true;
  };
  const ownText = element => Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.nodeValue).join('').trim();
  const loaders = (matchText = true) => {
    const found = [];
    const marked = document.querySelectorAll('[aria-busy="true"],[role="progressbar"],.animate-spin,.animate-pulse,[class*="skeleton" i],[class*="spinner" i]');
    for (const element of marked) if (seen(element)) found.push(('marked:' + describe(element)).slice(0, 140));
    if (!matchText) return found;
    const candidates = document.querySelectorAll('[role="status"],p,span,div,li,button,h1,h2,h3,td');
    for (const element of candidates) {
      const text = ownText(element);
      if (text && text.length <= 40 && loaderText.test(text) && seen(element)) found.push(('text:' + text + ' @' + describe(element)).slice(0, 140));
      if (found.length >= 8) break;
    }
    return found;
  };
  const images = () => {
    const timing = new Map();
    for (const entry of performance.getEntriesByType('resource')) timing.set(entry.name, entry.responseEnd);
    let total = 0, pendingCount = 0, lastEnd = 0;
    const pendingSample = [];
    for (const image of document.images) {
      const box = image.getBoundingClientRect();
      if (box.width < 8 || box.height < 8 || !inViewport(box) || !visible(image)) continue;
      const source = image.currentSrc || image.src;
      if (!source || source.startsWith('data:')) continue;
      total++;
      if (!image.complete) { pendingCount++; if (pendingSample.length < 3) pendingSample.push(source.slice(0, 120)); continue; }
      const end = timing.get(source);
      if (typeof end === 'number' && end > lastEnd) lastEnd = end;
    }
    return { total, pending: pendingCount, lastEnd, pendingSample };
  };
  const mapCanvas = () => Array.from(document.querySelectorAll('canvas')).some(canvas => {
    const box = canvas.getBoundingClientRect();
    return box.width > 100 && box.height > 100 && inViewport(box) && visible(canvas);
  });

  window.__plb = {
    state: S,
    // Call right before a client-side route change so times are relative to it.
    begin() {
      S.navStart = now(); S.requests = []; S.textEvents = []; S.lastText = 0; S.lastRequestEnd = 0; S.mutations = 0;
      S.routeReady = 0; S.fallbackSeen = 0;
      return S.navStart;
    },
    snapshot(options) {
      let lastResourceEnd = 0;
      for (const entry of performance.getEntriesByType('resource')) if (entry.responseEnd > lastResourceEnd) lastResourceEnd = entry.responseEnd;
      return {
        now: now(), navStart: S.navStart, pending: S.pending, lastRequestEnd: S.lastRequestEnd,
        lastText: S.lastText, routeReady: S.routeReady || 0, fallbackSeen: S.fallbackSeen || 0,
        loaders: loaders(!options || options.textLoaders !== false), images: images(), map: mapCanvas(), lastResourceEnd,
        textLength: document.body ? (document.body.innerText || '').length : 0, path: location.pathname + location.search,
      };
    },
    report() {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paint = {};
      for (const entry of performance.getEntriesByType('paint')) paint[entry.name] = Math.round(entry.startTime);
      const resources = performance.getEntriesByType('resource').filter(entry => entry.startTime >= S.navStart - 1).map(entry => ({
        name: entry.name, type: entry.initiatorType, start: Math.round(entry.startTime - S.navStart),
        ttfb: entry.responseStart ? Math.round(entry.responseStart - entry.startTime) : null,
        duration: Math.round(entry.responseEnd - entry.startTime), end: Math.round(entry.responseEnd - S.navStart),
        transfer: entry.transferSize, encoded: entry.encodedBodySize, decoded: entry.decodedBodySize,
        protocol: entry.nextHopProtocol, cached: entry.transferSize === 0 && entry.decodedBodySize > 0,
        serverTiming: (entry.serverTiming || []).map(item => item.name + '=' + item.duration).join(','),
      }));
      return {
        navStart: S.navStart,
        navigation: navigation && S.navStart === 0 ? {
          ttfb: Math.round(navigation.responseStart), responseEnd: Math.round(navigation.responseEnd),
          domContentLoaded: Math.round(navigation.domContentLoadedEventEnd), load: Math.round(navigation.loadEventEnd),
          transfer: navigation.transferSize, protocol: navigation.nextHopProtocol,
        } : null,
        paint, lcp: S.lcp.slice(-3), longTasks: S.longTasks.filter(task => task.t >= S.navStart).slice(0, 40),
        requests: S.requests.map(item => ({ url: item.url, method: item.method, start: Math.round(item.start - S.navStart), end: item.end === null ? null : Math.round(item.end - S.navStart), status: item.status })),
        textEvents: S.textEvents.map(item => ({ t: Math.round(item.t - S.navStart), length: item.length, source: item.source })),
        resources, mutations: S.mutations,
      };
    },
  };
})();
