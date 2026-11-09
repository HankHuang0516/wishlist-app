/** The QA browser itself: a page that was left while it was creating a database must not hold that database from the
 * next page. See webQaArgs for why the browser suites depend on this. Synthetic pages only; no server, no database. */
import { webQaArgs, webQaBrowser } from './webQaBrowser';

const origin = 'https://wishlist-qa-storage.invalid';
const create = "request.onupgradeneeded=()=>{for(const name of ['keys','pending','erased'])request.result.createObjectStore(name);};";
// Asks for a database that does not exist yet at the last moment before the page is left, so the creation is
// certainly unfinished when the page goes away.
const leaving = `<!doctype html><title>leaving</title><script>addEventListener('pagehide',()=>{const request=indexedDB.open('qa-left-page',1);${create}});</script>`;
// Opens the same database and reports how that went.
const next = `<!doctype html><title>next</title><script>window.opened='pending';const request=indexedDB.open('qa-left-page',1);${create}request.onsuccess=()=>{window.opened='yes';};request.onerror=request.onblocked=()=>{window.opened='no';};</script>`;

test('a page left while creating a database does not hold that database from the next page', async () => {
  const qa = webQaBrowser(), browser = await qa.puppeteer.launch({ headless: true, executablePath: qa.executablePath, args: webQaArgs });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request: any) => {
      const url = new URL(request.url());
      if (url.origin !== origin) void request.abort();
      else void request.respond({ status: 200, contentType: 'text/html', body: url.pathname === '/next' ? next : leaving });
    });
    await page.goto(origin + '/leaving');
    await page.goto(origin + '/next');
    await page.waitForFunction(() => Reflect.get(window, 'opened') !== 'pending', { timeout: 5000 });
    expect(await page.evaluate(() => Reflect.get(window, 'opened'))).toBe('yes');
  } finally { await browser.close(); }
}, 30000);
