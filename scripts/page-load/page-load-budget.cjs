#!/usr/bin/env node
'use strict';
/* Page-load budget check for the Wishlist.ai web app.
 *
 * Opens every route in a real Chrome, waits until the page has stopped changing
 * (no request in flight, no loading indicator, visible text and images settled)
 * and records how long the real content took to appear. Any page over the budget
 * (default 1000 ms) is a FAIL. See README.md in this folder for definitions.
 *
 * The check only reads pages. It never signs in, submits a form or writes data.
 */
const fs = require('node:fs');
const path = require('node:path');

const options = parse(process.argv.slice(2));
const instrument = fs.readFileSync(path.join(__dirname, 'instrument.js'), 'utf8');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parse(argv) {
  const values = {
    base: 'https://wishlist-app-production.up.railway.app', routes: path.join(__dirname, 'routes.json'), vars: '', scope: 'guest',
    modes: 'cold,warm,spa', runs: '3', budget: '1000', out: '', viewport: 'mobile', only: '', floor: '150',
    quiet: '700', timeout: '20000', enforce: false, 'spa-from': '/terms', session: '', pause: '400', 'local-certificate': false, 'on-limit': 'stop', 'spa-reuse': false,
  };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index].replace(/^--/, '');
    if (!(name in values)) throw new Error('Unknown option: ' + argv[index]);
    if (typeof values[name] === 'boolean') values[name] = true; else values[name] = argv[++index];
  }
  if (!['guest', 'signed-in', 'all'].includes(values.scope)) throw new Error('--scope must be guest, signed-in or all');
  if (!['stop', 'record'].includes(values['on-limit'])) throw new Error('--on-limit must be stop or record');
  const number = (name, min, max) => {
    const value = Number(values[name]);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid --' + name);
    return value;
  };
  return {
    base: new URL(values.base).origin, routes: values.routes, vars: values.vars, scope: values.scope, modes: values.modes.split(',').filter(Boolean),
    runs: number('runs', 1, 20), budget: number('budget', 50, 60000), viewport: values.viewport,
    only: values.only.split(',').filter(Boolean), floor: number('floor', 0, 500), quiet: number('quiet', 200, 5000),
    timeout: number('timeout', 2000, 120000), enforce: values.enforce, spaFrom: values['spa-from'], session: values.session,
    pause: number('pause', 0, 60000), localCertificate: values['local-certificate'], onLimit: values['on-limit'], spaReuse: values['spa-reuse'],
    out: values.out || path.join(process.cwd(), 'page-load-results', new Date().toISOString().replace(/[:.]/g, '-')),
  };
}

function loadPuppeteer() {
  const candidates = [process.env.PUPPETEER_MODULE, 'puppeteer',
    path.join(__dirname, '../../server/node_modules/puppeteer'), path.join(__dirname, '../../node_modules/puppeteer')].filter(Boolean);
  for (const candidate of candidates) { try { return require(candidate); } catch { /* Try the next location. */ } }
  throw new Error('Puppeteer was not found. Set PUPPETEER_MODULE to its absolute path.');
}

// A saved session may only be injected into a local or explicitly named test host.
function sessionEntries() {
  if (!options.session) return null;
  const host = new URL(options.base).hostname;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host) || /\.(?:localhost|test)$/.test(host);
  const labelled = host.split('.').slice(0, -1).some(label => /^(?:staging|dev|test|qa|sandbox|preview)(?:-|$)/.test(label));
  if (!local && !labelled) throw new Error('--session is only for a local or test host, never production.');
  const entries = JSON.parse(fs.readFileSync(options.session, 'utf8'));
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('--session must be a JSON object of localStorage entries.');
  return entries;
}

const viewports = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1366, height: 768, deviceScaleFactor: 1 },
};
const userAgents = {
  mobile: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
};

// ---- request budget shared with everyone else on this address -------------
const budgets = new Map();
let limited = null;
let ownRequests = 0;
function observeBudget(response) {
  let url;
  try { url = new URL(response.url()); } catch { return; }
  if (url.origin !== options.base) return;
  // A cached or service-worker reply repeats the headers of the day it was stored.
  if (response.fromCache() || response.fromServiceWorker()) return;
  ownRequests++;
  if (response.status() === 429 && !limited) limited = url.pathname;
  const headers = response.headers();
  if (!headers['ratelimit-limit']) return;
  const window = Number((/w=(\d+)/.exec(headers['ratelimit-policy'] || '') || [])[1] || 0);
  const kind = url.pathname.startsWith('/api/') ? 'api' : 'static';
  budgets.set(kind + ':' + headers['ratelimit-limit'] + '/' + window, {
    limit: Number(headers['ratelimit-limit']), remaining: Number(headers['ratelimit-remaining']), window,
    resetAt: Date.now() + Number(headers['ratelimit-reset'] || 0) * 1000,
  });
}
async function pace(staticNeed = 0) {
  // On a shared site one refusal ends the run. On a private copy it is that page's own result.
  if (limited && options.onLimit === 'stop') throw new Error('Stopped: the site answered 429 for ' + limited + '. Nothing else was requested.');
  limited = null;
  for (const [key, budget] of budgets) {
    // Leave room for other people and jobs behind the same address.
    // The site-wide budgets keep a generous reserve. A small purpose-built limit
    // (five account-security reads per 15 minutes, say) is only respected, not hoarded.
    const general = budget.limit >= 300 && budget.window >= 600;
    if (!general && budget.window >= 600 && options.onLimit === 'record') continue;
    const floor = (general ? Math.max(options.floor, Math.ceil(budget.limit * 0.3)) : Math.min(Math.ceil(budget.limit * 0.25), budget.limit - 1)) + (key.startsWith('static:') ? staticNeed : 0);
    if (budget.remaining >= floor || budget.resetAt <= Date.now()) continue;
    const wait = budget.resetAt - Date.now() + 1500;
    console.log(`  … ${key} has ${budget.remaining} left; waiting ${Math.ceil(wait / 1000)} s for the window to reset`);
    await sleep(wait);
    budgets.delete(key);
  }
}

function trackNetwork(page) {
  const inflight = new Map();
  const failures = [], errors = [];
  const ignored = /google-analytics\.com|googletagmanager\.com|doubleclick\.net|analytics\.google\.com/;
  page.on('request', request => {
    const type = request.resourceType();
    if (type === 'websocket' || type === 'eventsource' || ignored.test(request.url())) return;
    inflight.set(request, Date.now());
  });
  page.on('requestfinished', request => inflight.delete(request));
  page.on('requestfailed', request => {
    inflight.delete(request);
    const failure = request.failure();
    if (!ignored.test(request.url())) failures.push({ url: request.url().slice(0, 200), error: failure ? failure.errorText : 'failed' });
  });
  page.on('response', response => {
    observeBudget(response);
    if (response.status() >= 400) errors.push({ url: response.url().slice(0, 200), status: response.status() });
  });
  return {
    failures, errors,
    // A request older than 15 s is reported, not waited for.
    inflight() { let count = 0; for (const started of inflight.values()) if (Date.now() - started < 15000) count++; return count; },
    stuck() { return Array.from(inflight.entries()).filter(([, started]) => Date.now() - started >= 15000).map(([request]) => request.url().slice(0, 200)); },
  };
}

async function open(context, { worker, entries }) {
  const page = await context.newPage();
  await page.setViewport(viewports[options.viewport]);
  await page.setUserAgent(userAgents[options.viewport]);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.6' });
  if (!worker) await page.evaluateOnNewDocument(() => {
    // First-visit runs measure the page itself, not the background precache.
    try { Object.defineProperty(ServiceWorkerContainer.prototype, 'register', { value: undefined, configurable: true }); } catch { /* Unavailable. */ }
  });
  if (entries) await page.evaluateOnNewDocument(saved => {
    try { for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* Storage unavailable. */ }
  }, entries);
  await page.evaluateOnNewDocument(instrument);
  return { page, network: trackNetwork(page) };
}

async function settle(page, network, route) {
  const started = Date.now();
  let last = null;
  // A page whose own copy mentions loading (release notes) opts out of text matching.
  const textLoaders = !route || route.textLoaders !== false;
  while (Date.now() - started < options.timeout) {
    await sleep(100);
    let snapshot;
    try { snapshot = await page.evaluate(text => (window.__plb ? window.__plb.snapshot({ textLoaders: text }) : null), textLoaders); } catch { continue; }
    if (!snapshot) continue;
    last = snapshot;
    const activity = Math.max(snapshot.lastText, snapshot.lastRequestEnd, snapshot.images.lastEnd, snapshot.lastResourceEnd, snapshot.navStart);
    const busy = snapshot.pending > 0 || network.inflight() > 0 || snapshot.loaders.length > 0 || snapshot.images.pending > 0;
    if (!busy && snapshot.now - activity >= options.quiet && snapshot.textLength > 0) return { settled: true, snapshot };
  }
  return { settled: false, snapshot: last };
}

function serialDepth(calls) {
  const sorted = calls.filter(call => call.end !== null).sort((a, b) => a.start - b.start);
  const depth = [];
  let best = 0;
  for (let index = 0; index < sorted.length; index++) {
    depth[index] = 1;
    for (let earlier = 0; earlier < index; earlier++) if (sorted[earlier].end <= sorted[index].start + 5) depth[index] = Math.max(depth[index], depth[earlier] + 1);
    best = Math.max(best, depth[index]);
  }
  return best;
}

function assemble(route, mode, run, outcome, report, network) {
  const snapshot = outcome.snapshot;
  if (!snapshot || !report) return { route: route.id, path: route.path, mode, run, settled: false, reason: 'page did not respond', content: null };
  // A page that settles quickly on an error has not shown its content.
  const own = item => { try { return new URL(item.url).origin === options.base; } catch { return false; } };
  const tidy = item => new URL(item.url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id');
  const limitedReply = network.errors.find(item => item.status === 429 && own(item)), brokenReply = network.errors.find(item => item.status >= 500 && own(item));
  const refused = limitedReply ? tidy(limitedReply) : brokenReply ? tidy(brokenReply) + ' (HTTP ' + brokenReply.status + ')' : '';
  const base = snapshot.navStart;
  const relative = value => (value && value >= base ? Math.round(value - base) : null);
  const text = relative(snapshot.lastText), image = snapshot.images.total ? relative(snapshot.images.lastEnd) : null;
  const networkEnd = relative(snapshot.lastResourceEnd), map = snapshot.map ? networkEnd : null;
  const resources = report.resources.map(item => {
    let url; try { url = new URL(item.name); } catch { return null; }
    const own = url.origin === options.base;
    return { ...item, own, api: own && url.pathname.startsWith('/api/'), host: url.host, path: (url.pathname + url.search).slice(0, 140) };
  }).filter(Boolean);
  const api = resources.filter(item => item.api).map(item => ({ path: item.path, start: item.start, ttfb: item.ttfb, duration: item.duration, end: item.end, bytes: item.transfer, decoded: item.decoded, serverTiming: item.serverTiming }));
  const assets = resources.filter(item => item.own && !item.api);
  const external = resources.filter(item => !item.own);
  const hosts = {};
  for (const item of external) hosts[item.host] = (hosts[item.host] || 0) + 1;
  return {
    route: route.id, path: route.path, finalPath: snapshot.path, mode, run, settled: outcome.settled && !refused,
    refused,
    reason: refused ? (limitedReply ? 'the page ran into the request limit (429) on ' : 'the server failed on ') + refused : outcome.settled ? '' : [snapshot.pending || network.inflight() ? 'requests still in flight' : '', snapshot.loaders.length ? 'loading indicator still shown: ' + snapshot.loaders[0] : '', snapshot.images.pending ? 'images still loading' : ''].filter(Boolean).join('; ') || 'page kept changing',
    // Time until the real content is on screen: last visible text change, last
    // image in view, and map tiles when a map is in view.
    content: outcome.settled && !refused ? Math.max(text || 0, image || 0, map || 0) : null,
    text, image, map, route_ready: relative(snapshot.routeReady), network_end: networkEnd,
    html_ttfb: report.navigation ? report.navigation.ttfb : null, fcp: report.paint['first-contentful-paint'] || null,
    lcp: report.lcp.length ? report.lcp[report.lcp.length - 1].t : null, lcp_element: report.lcp.length ? report.lcp[report.lcp.length - 1] : null,
    api, api_count: api.length, api_serial_depth: serialDepth(api), api_bytes: api.reduce((sum, item) => sum + (item.bytes || 0), 0),
    asset_requests: assets.filter(item => !item.cached).length, asset_cached: assets.filter(item => item.cached).length,
    asset_bytes: assets.reduce((sum, item) => sum + (item.transfer || 0), 0), external_hosts: hosts,
    images_in_view: snapshot.images.total, long_tasks_ms: report.longTasks.reduce((sum, task) => sum + task.d, 0),
    last_text_events: report.textEvents.slice(-6), loaders: snapshot.loaders, errors: network.errors.slice(0, 8), failures: network.failures.slice(0, 8), stuck: network.stuck(),
  };
}

async function measureLoad(context, route, mode, run, shot, entries) {
  const { page, network } = await open(context, { worker: mode !== 'cold', entries });
  try {
    await page.goto(options.base + route.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const outcome = await settle(page, network, route);
    const report = await page.evaluate(() => (window.__plb ? window.__plb.report() : null)).catch(() => null);
    if (shot) await page.screenshot({ path: shot }).catch(() => undefined);
    return assemble(route, mode, run, outcome, report, network);
  } finally { await page.close().catch(() => undefined); }
}

async function measureInApp(context, route, run, shot, entries) {
  const { page, network } = await open(context, { worker: true, entries });
  try {
    const from = route.path === options.spaFrom ? '/privacy' : options.spaFrom;
    await page.goto(options.base + from, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settle(page, network);
    await page.evaluate(target => {
      window.__plb.begin();
      history.pushState(null, '', target);
      dispatchEvent(new PopStateEvent('popstate', { state: null }));
    }, route.path);
    const outcome = await settle(page, network, route);
    const report = await page.evaluate(() => window.__plb.report()).catch(() => null);
    if (shot) await page.screenshot({ path: shot }).catch(() => undefined);
    return assemble(route, 'spa', run, outcome, report, network);
  } finally { await page.close().catch(() => undefined); }
}

// One tab for all runs of a route: run 1 is the first time the page is opened in
// this visit, later runs are coming back to it (its code is already in memory).
async function measureInAppSeries(context, route, runs, shot, entries, record) {
  const { page, network } = await open(context, { worker: true, entries });
  const go = target => page.evaluate(path => {
    window.__plb.begin();
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }, target);
  try {
    const from = route.path === options.spaFrom ? '/privacy' : options.spaFrom;
    await page.goto(options.base + from, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settle(page, network);
    for (let run = 1; run <= runs; run++) {
      await pace();
      network.errors.length = 0; network.failures.length = 0;
      await go(route.path);
      const outcome = await settle(page, network, route);
      const report = await page.evaluate(() => window.__plb.report()).catch(() => null);
      if (shot && run === runs) await page.screenshot({ path: shot }).catch(() => undefined);
      record(assemble(route, 'spa', run, outcome, report, network));
      if (run < runs) { await go(from); await settle(page, network); }
      await sleep(options.pause);
    }
  } finally { await page.close().catch(() => undefined); }
}

async function prime(context, entries) {
  // One visit installs the service worker and its precache, as a returning person has.
  const { page } = await open(context, { worker: true, entries });
  try {
    await page.goto(options.base + '/', { waitUntil: 'load', timeout: 60000 });
    const ready = await page.evaluate(() => Promise.race([
      navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : Promise.resolve(false),
      new Promise(resolve => setTimeout(() => resolve(false), 30000)),
    ])).catch(() => false);
    let previous = -1, stable = 0, count = 0;
    for (let attempt = 0; attempt < 120 && stable < 4; attempt++) {
      await sleep(500);
      count = await page.evaluate(async () => {
        let total = 0;
        for (const name of await caches.keys()) total += (await (await caches.open(name)).keys()).length;
        return total;
      }).catch(() => 0);
      stable = count === previous && count > 0 ? stable + 1 : 0; previous = count;
    }
    return { worker: ready, cached: count };
  } finally { await page.close().catch(() => undefined); }
}

const median = values => { const sorted = values.slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };

function summarize(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = run.route + '|' + run.mode;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  const rows = [];
  for (const [key, list] of groups) {
    const [route, mode] = key.split('|');
    const times = list.filter(run => run.content !== null).map(run => run.content);
    const unsettled = list.filter(run => !run.settled);
    const middle = median(times), worst = times.length ? Math.max(...times) : null;
    let verdict = 'PASS', note = '';
    if (unsettled.length) { verdict = 'FAIL'; note = '未在 ' + options.timeout / 1000 + ' 秒內完成：' + unsettled[0].reason; }
    else if (middle > options.budget) verdict = 'FAIL';
    else if (worst > options.budget) { verdict = 'FAIL'; note = '不穩定：' + list.length + ' 次中有超標'; }
    const pick = name => median(list.map(run => run[name]).filter(value => typeof value === 'number'));
    rows.push({ route, mode, path: list[0].path, verdict, note, median: middle, worst, best: times.length ? Math.min(...times) : null,
      text: pick('text'), image: pick('image'), route_ready: pick('route_ready'), fcp: pick('fcp'), html_ttfb: pick('html_ttfb'),
      api_count: pick('api_count'), api_serial_depth: pick('api_serial_depth'), asset_requests: pick('asset_requests'), runs: list.length });
  }
  return rows;
}

function markdown(rows, meta) {
  const cell = value => (value === null || value === undefined ? '—' : String(value));
  const lines = ['# 頁面載入預算檢查', '', `- 對象：${meta.base}（網頁版 ${meta.version || '未知'}）`, `- 時間：${meta.startedAt} → ${meta.finishedAt}`,
    `- 預算：${options.budget} ms；視窗：${options.viewport}；每情境 ${options.runs} 次`, `- 本次共送出 ${meta.requests} 個請求`, '',
    '| 頁面 | 路徑 | 情境 | 判定 | 內容就緒（中位數） | 最差 | 文字 | 圖片 | 換頁完成 | API 數 | API 串接層數 | 備註 |', '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|'];
  for (const row of rows) lines.push(`| ${row.route} | \`${row.path}\` | ${row.mode} | **${row.verdict}** | ${cell(row.median)} | ${cell(row.worst)} | ${cell(row.text)} | ${cell(row.image)} | ${cell(row.route_ready)} | ${cell(row.api_count)} | ${cell(row.api_serial_depth)} | ${row.note} |`);
  const failed = rows.filter(row => row.verdict === 'FAIL').length;
  lines.push('', `結果：${rows.length} 項中 ${failed} 項 FAIL、${rows.length - failed} 項 PASS。`);
  return lines.join('\n') + '\n';
}

async function main() {
  const entries = sessionEntries();
  if (options.scope === 'signed-in' && !entries) throw new Error('--scope signed-in needs --session (local or test host only).');
  const vars = options.vars ? JSON.parse(fs.readFileSync(options.vars, 'utf8')) : {};
  const routes = JSON.parse(fs.readFileSync(options.routes, 'utf8'))
    .filter(route => !options.only.length || options.only.includes(route.id))
    // Signed out: pages that need an account are skipped. Signed in: sign-in forms are skipped.
    .filter(route => options.scope === 'all' || (options.scope === 'guest' ? !route.signedIn : !route.guestOnly))
    .map(route => ({ ...route, path: route.path.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? encodeURIComponent(String(vars[name])) : whole)) }));
  if (!routes.length) throw new Error('No routes selected.');
  const unresolved = routes.filter(route => /\{\w+\}/.test(route.path));
  if (unresolved.length) throw new Error('Missing --vars values for: ' + unresolved.map(route => route.id).join(', '));
  fs.mkdirSync(path.join(options.out, 'screens'), { recursive: true });
  const puppeteer = loadPuppeteer();
  // A throwaway certificate is only accepted for this machine's own address.
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(options.base).hostname);
  if (options.localCertificate && !loopback) throw new Error('--local-certificate is only for a site on this machine.');
  const browser = await puppeteer.launch({ headless: true, args: ['--lang=zh-TW', '--no-first-run', '--no-default-browser-check', ...(options.localCertificate ? ['--ignore-certificate-errors'] : [])] });
  const meta = { base: options.base, scope: options.scope, spaReuse: options.spaReuse, startedAt: new Date().toISOString(), viewport: options.viewport, budget: options.budget, runs: options.runs, modes: options.modes, browser: await browser.version() };
  const runs = [];
  const save = () => fs.writeFileSync(path.join(options.out, 'results.json'), JSON.stringify({ meta, runs }, null, 1));
  const record = result => {
    runs.push(result); save();
    console.log(`  ${result.mode.padEnd(4)} ${result.route.padEnd(24)} #${result.run} ${result.settled ? String(result.content).padStart(6) + ' ms' : 'UNSETTLED'}  text=${result.text} img=${result.image} api=${result.api_count}/${result.api_serial_depth}${result.settled ? '' : '  ' + result.reason}`);
  };
  try {
    try {
      const probe = await browser.newPage();
      const reply = await probe.goto(options.base + '/web-version.json', { timeout: 20000 });
      observeBudget(reply);
      meta.version = JSON.parse(await reply.text()).version;
      await probe.close();
    } catch { meta.version = null; }
    if (options.modes.includes('cold')) {
      console.log('First visit (empty cache, new connection)');
      for (const route of routes) for (let run = 1; run <= Math.min(options.runs, route.runs || options.runs); run++) {
        await pace();
        const context = await browser.createBrowserContext();
        try { record(await measureLoad(context, route, 'cold', run, run === Math.min(options.runs, route.runs || options.runs) ? path.join(options.out, 'screens', 'cold-' + route.id + '.png') : '', entries)); }
        finally { await context.close().catch(() => undefined); }
        await sleep(options.pause);
      }
    }
    if (options.modes.includes('warm') || options.modes.includes('spa')) {
      const context = await browser.createBrowserContext();
      try {
        await pace(140); // The first returning visit downloads the whole precache.
        meta.primed = await prime(context, entries);
        console.log(`Returning visit prepared: service worker ${meta.primed.worker ? 'active' : 'NOT active'}, ${meta.primed.cached} cached files`);
        if (options.modes.includes('warm')) {
          console.log('Returning visit (service worker and cache in place)');
          for (const route of routes) for (let run = 1; run <= Math.min(options.runs, route.runs || options.runs); run++) {
            await pace();
            record(await measureLoad(context, route, 'warm', run, run === Math.min(options.runs, route.runs || options.runs) ? path.join(options.out, 'screens', 'warm-' + route.id + '.png') : '', entries));
            await sleep(options.pause);
          }
        }
        if (options.modes.includes('spa')) {
          console.log('In-app navigation (no reload)');
          if (options.spaReuse) for (const route of routes) {
            await pace();
            await measureInAppSeries(context, route, Math.min(options.runs, route.runs || options.runs), path.join(options.out, 'screens', 'spa-' + route.id + '.png'), entries, record);
          }
          else for (const route of routes) for (let run = 1; run <= Math.min(options.runs, route.runs || options.runs); run++) {
            await pace();
            record(await measureInApp(context, route, run, run === Math.min(options.runs, route.runs || options.runs) ? path.join(options.out, 'screens', 'spa-' + route.id + '.png') : '', entries));
            await sleep(options.pause);
          }
        }
      } finally { await context.close().catch(() => undefined); }
    }
  } finally {
    meta.finishedAt = new Date().toISOString(); meta.requests = ownRequests; meta.budgets = Object.fromEntries(budgets); meta.limited = limited;
    save();
    await browser.close().catch(() => undefined);
  }
  const rows = summarize(runs);
  fs.writeFileSync(path.join(options.out, 'summary.json'), JSON.stringify({ meta, rows }, null, 1));
  fs.writeFileSync(path.join(options.out, 'summary.md'), markdown(rows, meta));
  const failed = rows.filter(row => row.verdict === 'FAIL');
  console.log(`\n${rows.length - failed.length} PASS, ${failed.length} FAIL (budget ${options.budget} ms). Results: ${options.out}`);
  if (options.enforce && failed.length) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
