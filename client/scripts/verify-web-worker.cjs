const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual generated worker entry without dispatching synthetic
// messages or closing clients. Registration alone does not prove activation.
const dist = path.join(__dirname, '../dist');
const calls = { skipWaiting: 0, clientsClaim: 0, imports: [], entries: [] };
class Route { constructor(...args) { this.args = args; } }
const workbox = {
  clientsClaim() { calls.clientsClaim++; },
  precacheAndRoute(entries) { calls.entries = entries; },
  cleanupOutdatedCaches() {}, registerRoute() {},
  createHandlerBoundToURL() { return () => {}; },
  NavigationRoute: Route, CacheFirst: Route, ExpirationPlugin: Route,
};
const self = { define: true, skipWaiting() { calls.skipWaiting++; }, addEventListener() {} };
vm.runInNewContext(fs.readFileSync(path.join(dist, 'sw.js'), 'utf8'), {
  self, define(_deps, factory) { factory(workbox); },
  importScripts(...urls) { calls.imports.push(...urls); },
}, { timeout: 1000 });
assert.equal(calls.skipWaiting, 1, 'The installed worker must activate without waiting for every old client to close.');
assert.equal(calls.clientsClaim, 1, 'The activated worker must control existing pages for their ready-version proof.');
assert.deepEqual(calls.imports, ['/pwa-cache-policy.js']);
assert.equal(calls.entries.some(entry => entry.url === 'web-version.json'), false);
assert.equal(calls.entries.some(entry => entry.url === 'index.html'), true);
assert.equal(calls.entries.some(entry => entry.url === 'registerSW.js'), true);
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
assert.equal(html.includes('registerSW.js'), false, 'Fresh HTML must keep registration owned by the explicit-update UI.');
console.log('Generated worker activation, client claim, metadata and existing cache policy verified.');
const install = require('./verify-web-install.cjs').verifyWebInstall(dist);
for (const url of [...install.icons.map(icon => icon.url), install.appleTouchIcon]) {
  assert.equal(calls.entries.some(entry => entry.url === url.slice(1)), true, 'Installation artwork must be included in the built public precache.');
}
console.log('Installation PNG dimensions, Safari Home Screen icon, theme and public precache verified.');
