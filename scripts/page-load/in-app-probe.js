/* In-app navigation probe for a browser tab that is already signed in.
 *
 * Paste into the page (DevTools console or an automation tool) once per document,
 * then call `await __plbGo('/wishes')`. It changes route the same way the app's
 * own links do (no reload) and reports how long the real content took.
 *
 * Safety: while the probe is installed every non-GET request from the page is
 * refused and listed in the result, so opening a page can never write anything
 * (for example mark a conversation as read). Reload the tab to remove it. */
(() => {
  if (window.__plbGo) return 'already installed';
  const now = () => performance.now();
  const S = { navStart: 0, pending: 0, lastRequestEnd: 0, textHash: null, lastText: 0, routeReady: 0, events: [], source: '', blocked: [] };

  const inner = window.fetch;
  window.fetch = function (input, init) {
    let method = 'GET', url = '';
    try { url = typeof input === 'string' ? input : input.url; method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(); } catch { /* Leave as GET. */ }
    if (method !== 'GET' && method !== 'HEAD') {
      S.blocked.push({ t: Math.round(now() - S.navStart), method, path: String(url).replace(location.origin, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').slice(0, 70) });
      return Promise.reject(new TypeError('Write refused while the page-load probe is installed'));
    }
    S.pending++;
    const finish = () => { S.pending--; S.lastRequestEnd = now(); };
    return inner.apply(this, arguments).then(response => {
      try { response.clone().arrayBuffer().then(finish, finish); } catch { finish(); }
      return response;
    }, error => { finish(); throw error; });
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method) {
    if (!/^(?:GET|HEAD)$/i.test(String(method))) { S.blocked.push({ t: Math.round(now() - S.navStart), method: String(method), path: 'xhr' }); throw new Error('Write refused while the page-load probe is installed'); }
    return open.apply(this, arguments);
  };

  const describe = node => {
    const parts = [];
    let element = node && node.nodeType === 1 ? node : node && node.parentElement;
    for (let depth = 0; element && depth < 3; depth++, element = element.parentElement) {
      const classes = String(element.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      parts.unshift(element.tagName.toLowerCase() + (classes ? '.' + classes : ''));
    }
    return parts.join('>');
  };
  let scheduled = false;
  const sample = frameTime => {
    scheduled = false;
    const text = document.body.innerText || '';
    let hash = 5381;
    for (let index = 0; index < text.length; index++) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
    if (hash === S.textHash) return;
    S.textHash = hash; S.lastText = frameTime;
    if (!/正在載入頁面|Loading page/.test(text) && !S.routeReady) S.routeReady = frameTime;
    S.events.push({ t: Math.round(frameTime - S.navStart), n: text.length, at: S.source });
    if (S.events.length > 40) S.events.shift();
  };
  new MutationObserver(records => {
    S.source = describe(records[records.length - 1].target);
    if (!scheduled) { scheduled = true; requestAnimationFrame(sample); }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

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
  const loaders = () => {
    const found = [];
    for (const element of document.querySelectorAll('[aria-busy="true"],[role="progressbar"],.animate-spin,.animate-pulse,[class*="skeleton" i],[class*="spinner" i]'))
      if (seen(element)) found.push('marked:' + describe(element));
    for (const element of document.querySelectorAll('[role="status"],p,span,div,li,button,h1,h2,h3,td')) {
      const text = ownText(element);
      if (text && text.length <= 40 && loaderText.test(text) && seen(element)) found.push('text:' + text);
      if (found.length >= 4) break;
    }
    return found;
  };
  const images = () => {
    const timing = new Map();
    for (const entry of performance.getEntriesByType('resource')) timing.set(entry.name, entry.responseEnd);
    let total = 0, pending = 0, lastEnd = 0;
    for (const image of document.images) {
      const box = image.getBoundingClientRect();
      const source = image.currentSrc || image.src;
      if (box.width < 8 || box.height < 8 || !inViewport(box) || !visible(image) || !source || source.startsWith('data:')) continue;
      total++;
      if (!image.complete) { pending++; continue; }
      const end = timing.get(source);
      if (typeof end === 'number' && end > lastEnd) lastEnd = end;
    }
    return { total, pending, lastEnd };
  };
  const hasMap = () => Array.from(document.querySelectorAll('canvas')).some(canvas => { const box = canvas.getBoundingClientRect(); return box.width > 100 && box.height > 100 && inViewport(box) && visible(canvas); });

  window.__plbGo = async (target, { quiet = 700, timeout = 20000 } = {}) => {
    S.navStart = now(); S.lastText = 0; S.lastRequestEnd = 0; S.routeReady = 0; S.events = []; S.blocked = [];
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
    let settled = false, picture = images(), shown = [], lastResourceEnd = 0;
    while (now() - S.navStart < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
      picture = images(); shown = loaders(); lastResourceEnd = 0;
      for (const entry of performance.getEntriesByType('resource')) if (entry.responseEnd > lastResourceEnd) lastResourceEnd = entry.responseEnd;
      const activity = Math.max(S.lastText, S.lastRequestEnd, picture.lastEnd, lastResourceEnd, S.navStart);
      if (S.pending === 0 && !shown.length && !picture.pending && now() - activity >= quiet && (document.body.innerText || '').length > 0) { settled = true; break; }
    }
    const relative = value => (value && value >= S.navStart ? Math.round(value - S.navStart) : null);
    const text = relative(S.lastText), image = picture.total ? relative(picture.lastEnd) : null, network = relative(lastResourceEnd), map = hasMap() ? network : null;
    const api = performance.getEntriesByType('resource').filter(entry => entry.startTime >= S.navStart - 1 && entry.name.startsWith(location.origin + '/api/')).map(entry => ({
      p: entry.name.replace(location.origin, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').replace(/\/\d+(?=\/|\?|$)/g, '/:n').replace(/\?.*/, '?').slice(0, 60),
      s: Math.round(entry.startTime - S.navStart), d: Math.round(entry.responseEnd - entry.startTime), e: Math.round(entry.responseEnd - S.navStart), b: entry.transferSize,
    }));
    return {
      target: target.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').slice(0, 60), final: (location.pathname + location.search).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').slice(0, 60),
      settled, content: settled ? Math.max(text || 0, image || 0, map || 0) : null, text, image, map, route: relative(S.routeReady), data_end: api.length ? Math.max(...api.map(item => item.e)) : null,
      api, loaders: shown.slice(0, 2), images: picture.total, blocked: S.blocked.slice(0, 6), events: S.events.slice(-4), width: innerWidth,
    };
  };
  return 'installed';
})()
