#!/usr/bin/env node
/* Check of in-frame-runner.js against a local stack: run the same payload a person would paste into a signed-in
 * tab, in a desktop-sized headless tab, and print what it measures. Compare the numbers with page-load-budget.cjs
 * on the same stack; they should agree, because both use instrument.js and the same rules.
 *
 *   PUPPETEER_MODULE=/abs/node_modules/puppeteer node scripts/page-load/in-frame-runner.check.cjs \
 *     --base https://127.0.0.1:18991 --session /path/session.json --routes /wishes,/chat,/settings --runs 3
 *
 * --session is a file of localStorage entries, as local-stack.cjs writes it. Local or test hosts only. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const values = { base: 'https://127.0.0.1:18991', session: '', routes: '/wishes,/chat,/settings', runs: '3', modes: 'warm,spa' };
for (let index = 2; index < process.argv.length; index++) {
  const name = process.argv[index].replace(/^--/, '');
  if (!(name in values)) throw new Error('Unknown option: ' + process.argv[index]);
  values[name] = process.argv[++index];
}
const base = new URL(values.base), host = base.hostname;
const local = ['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.localhost') || host.endsWith('.test');
if (!local && !host.split('.').some(label => ['staging', 'dev', 'test', 'qa', 'sandbox', 'preview'].includes(label))) throw new Error('This check signs in with a saved session; local or test hosts only.');

function loadPuppeteer() {
  for (const candidate of [process.env.PUPPETEER_MODULE, 'puppeteer', path.join(__dirname, '../../server/node_modules/puppeteer')].filter(Boolean)) { try { return require(candidate); } catch { /* Try the next location. */ } }
  throw new Error('Puppeteer was not found. Set PUPPETEER_MODULE to its absolute path.');
}
const median = list => { const sorted = [...list].sort((a, b) => a - b); return sorted.length ? sorted[sorted.length >> 1] : null; };

(async () => {
  const payload = execFileSync(process.execPath, [path.join(__dirname, 'build-in-frame-payload.cjs'), '--minify'], { encoding: 'utf8' });
  const entries = values.session ? JSON.parse(fs.readFileSync(values.session, 'utf8')) : {};
  const system = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome';
  const browser = await loadPuppeteer().launch({ headless: true, ...(fs.existsSync(system) ? { executablePath: system } : {}), args: ['--ignore-certificate-errors', '--disable-background-networking'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(base.origin + '/terms', { waitUntil: 'load' });
    await page.evaluate(saved => { for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); }, entries);
    // A real returning visitor has the service worker and its cache in place before measuring.
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => new Promise(resolve => setTimeout(resolve, 4000))) : null);
    await page.reload({ waitUntil: 'load' });
    console.log('payload: ' + await page.evaluate(payload));
    const rows = [];
    for (const route of values.routes.split(',').filter(Boolean)) for (const mode of values.modes.split(',').filter(Boolean)) {
      const results = [];
      for (let run = 0; run < Number(values.runs); run++) results.push(await page.evaluate((target, how) => (how === 'spa' ? window.__plbFrame.inApp(target) : window.__plbFrame.load(target)), route, mode));
      const done = results.filter(result => result.settled);
      rows.push({ route, mode, runs: results.length, settled: done.length, content: median(done.map(result => result.content)), worst: done.length ? Math.max(...done.map(result => result.content)) : null,
        route_ready: median(done.map(result => result.route_ready)), api: results[0].api_count, depth: results[0].api_serial_depth, width: results[0].width,
        injected: results.map(result => result.injected && result.injected.at + 'ms/' + result.injected.readyState + '/api' + result.injected.apiBefore), refused_writes: [...new Set(results.flatMap(result => result.refused_writes || []))],
        reasons: [...new Set(results.filter(result => !result.settled).map(result => result.reason))] });
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
