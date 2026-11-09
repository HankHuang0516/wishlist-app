#!/usr/bin/env node
/* Check of the observer's rule for loading indicators (instrument.js): one counts only where a person can see it.
 * Synthetic page, no network.
 *
 *   PUPPETEER_MODULE=/abs/node_modules/puppeteer node scripts/page-load/instrument.check.cjs
 */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

function loadPuppeteer() {
  for (const candidate of [process.env.PUPPETEER_MODULE, 'puppeteer', path.join(__dirname, '../../server/node_modules/puppeteer')].filter(Boolean)) { try { return require(candidate); } catch { /* Try the next location. */ } }
  throw new Error('Puppeteer was not found. Set PUPPETEER_MODULE to its absolute path.');
}
const row = text => `<div style="height:100px"><div role="status">${text}</div></div>`;
const cases = {
  'in view': { html: row('圖片載入中…'), expected: 1 },
  'below the fold': { html: '<div style="height:3000px"></div>' + row('圖片載入中…'), expected: 0 },
  'in a list, on a row that is showing': { html: `<div style="height:200px;overflow:auto">${row('圖片載入中…')}${row('第二列')}${row('第三列')}</div>`, expected: 1 },
  'in a list, on rows it has not scrolled to': { html: `<div style="height:200px;overflow:auto">${row('第一列')}${row('第二列')}${row('圖片載入中…')}${row('圖片載入中…')}</div>`, expected: 0 },
  'hidden': { html: `<div style="visibility:hidden">${row('圖片載入中…')}</div>`, expected: 0 },
  'a spinner in view': { html: '<div class="animate-spin" style="width:20px;height:20px"></div>', expected: 1 },
  'a spinner scrolled out of its box': { html: '<div style="height:100px;overflow:hidden"><div style="height:300px"></div><div class="animate-spin" style="width:20px;height:20px"></div></div>', expected: 0 },
};

(async () => {
  const system = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome';
  const browser = await loadPuppeteer().launch({ headless: true, ...(fs.existsSync(system) ? { executablePath: system } : {}) });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluateOnNewDocument(fs.readFileSync(path.join(__dirname, 'instrument.js'), 'utf8'));
    await page.goto('about:blank');
    for (const [name, { html, expected }] of Object.entries(cases)) {
      await page.setContent('<!doctype html><body style="margin:0">' + html);
      const found = await page.evaluate(() => window.__plb.snapshot().loaders.length);
      assert.equal(found, expected, name);
      console.log('ok  ' + name + ': ' + found);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
