/* Runs the frame runner over the pages behind sign-in, in a tab the account owner has signed in to.
 * Evaluate after the payload from build-in-frame-payload.cjs. It starts the run and returns at once; read
 * window.__plbProgress while it runs and window.__plbResults when it is done.
 *
 * Read-only: the frame refuses every request that is not a read, and the three lookups this script makes itself
 * are reads. Results hold times, counts and request paths without identifiers. The run keeps its average under 20
 * API reads a minute, so it cannot use up the account's or the address's request budget, and it stops at the first
 * refused (429) or failed (5xx) reply. Keep the tab in front: a hidden tab does not paint, and nothing is measured. */
(() => {
  if (window.__plbRun) return 'already running';
  // window.__plbDriverOptions may lower the number of runs or name the pages to measure; the defaults are for production.
  const options = Object.assign({ runs: 2, perMinute: 20, only: null }, window.__plbDriverOptions || {}), RUNS = options.runs, PER_MINUTE = options.perMinute;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fixed = [
    ['home', '/'], ['explore', '/explore'], ['dashboard', '/dashboard'], ['wishes', '/wishes'], ['sell', '/sell'], ['sell-manual', '/sell/manual'], ['my-listings', '/my-listings'],
    ['reports', '/reports'], ['chat', '/chat'], ['social', '/social'], ['settings', '/settings'], ['settings-notifications', '/settings/notifications'],
    ['change-password', '/change-password'], ['purchase-history', '/purchase-history'], ['source-leads', '/source-leads'],
  ];
  const progress = window.__plbProgress = { state: 'starting', done: 0, total: 0, apiReads: 0, last: '', visibility: document.visibilityState, found: {} };
  const results = window.__plbResults = [];
  window.__plbRun = (async () => {
    const started = Date.now();
    const pace = async () => { const due = started + progress.apiReads / PER_MINUTE * 60000; if (due > Date.now()) await pause(Math.min(due - Date.now(), 90000)); };
    const measure = async (id, path, mode) => {
      const result = mode === 'warm' ? await window.__plbFrame.load(path) : await window.__plbFrame.inApp(path);
      progress.apiReads += result.api_count || 0;
      return { id, ...result, visible: document.visibilityState === 'visible' };
    };
    // Pages that need an identifier. A wishlist comes from the links of the account's own pages. Conversations and
    // followed people are shown as buttons, so their first identifier is read the way those pages read it: with the
    // session the tab already holds, used here and never copied into a result.
    const routes = [...fixed];
    const first = await measure('dashboard', '/dashboard', 'warm');
    if (window.__plbFrame.signedIn() === false) { progress.state = 'not signed in'; return; }
    results.push({ ...first, run: 0, discovery: true });
    const link = (name, pattern) => { const found = window.__plbFrame.links(pattern)[0]; progress.found[name] = !!found; return found; };
    const firstId = async (name, path, test) => {
      try {
        const session = JSON.parse(localStorage.getItem('wishlist.auth.session.v1') || 'null');
        const reply = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + session.token }, cache: 'no-store' });
        progress.apiReads++;
        if (!reply.ok) throw new Error(String(reply.status));
        const walk = value => Array.isArray(value) ? value.map(walk).find(Boolean) : value && typeof value === 'object' ? (test(value.id) ? String(value.id) : Object.values(value).map(walk).find(Boolean)) : null;
        const id = walk(await reply.json()) || null;
        progress.found[name] = !!id; return id;
      } catch { progress.found[name] = false; return null; }
    };
    const wishlist = link('wishlist', '^/wishlists/\\d+$');
    if (wishlist) routes.push(['wishlist-detail', wishlist]);
    const room = await firstId('conversation', '/chat/conversations?limit=25', id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id));
    if (room) routes.push(['chat-room', '/chat?room=' + room]);
    const friend = await firstId('friend', '/users/following', id => Number.isSafeInteger(id) && id > 0);
    if (friend) {
      routes.push(['user-profile', '/users/' + friend + '/profile'], ['user-wishlists', '/users/' + friend + '/wishlists']);
      await pace();
      results.push({ ...(await measure('user-wishlists', '/users/' + friend + '/wishlists', 'warm')), run: 0, discovery: true });
      const theirs = link('friendWishlist', '^/wishlists/\\d+$');
      if (theirs) routes.push(['friend-wishlist', theirs]);
    }
    const chosen = options.only ? routes.filter(([id]) => options.only.includes(id)) : routes;
    progress.total = chosen.length * 2 * RUNS; progress.state = 'running';
    for (const [id, path] of chosen) for (const mode of ['warm', 'spa']) for (let run = 1; run <= RUNS; run++) {
      await pace();
      const result = await measure(id, path, mode);
      results.push({ ...result, run });
      progress.done++; progress.last = id + '/' + mode + '#' + run; progress.visibility = document.visibilityState;
      if (/refused or failed/.test(result.reason || '')) { progress.state = 'stopped: ' + result.reason; return; }
    }
    progress.state = 'done';
  })().catch(error => { progress.state = 'error: ' + String(error && error.message).slice(0, 80); });
  return 'started';
})()
