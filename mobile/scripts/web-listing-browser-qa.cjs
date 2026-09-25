// One-use local browser fixture for testing the real Web seller UI against
// isolated PostgreSQL, local private photos and the real MiniMax connector.
// No production Railway, Flickr, signing, store or user account is involved.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { startNativeQa } = require('./native-qa.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
assert.equal(process.env.DATABASE_URL, database, 'Matching isolated QA database required');
const clientDist = path.resolve(__dirname, '../../client/dist');
let qa, server, timer, stopped = false, started = false, worker;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(timer);
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (qa) {
    try {
      const summary = await qa.stop();
      console.log('QA_CLEANUP=' + JSON.stringify(summary));
    } catch { process.exitCode = 1; console.log('QA_CLEANUP_FAILED'); }
  }
  if (started) console.log('QA_STOPPED');
}

async function runWorker() {
  const { recognizeListingImage } = await import('../../tools/minimax-vision-bridge/server.mjs');
  const headers = { Authorization: 'Bearer ' + qa.callbackToken };
  while (!stopped) {
    let response;
    try { response = await fetch(qa.apiUrl + '/api/internal/minimax-vision/next', { headers, signal: AbortSignal.timeout(10_000) }); }
    catch { if (!stopped) await pause(1000); continue; }
    if (response.status === 204) { await pause(1000); continue; }
    if (!response.ok) throw new Error('QA_WORKER_POLL_FAILED');
    const job = await response.json();
    if (job.kind !== 'LISTING_DRAFT' || typeof job.imageUrl !== 'string') throw new Error('QA_WORKER_JOB_INVALID');
    let body;
    try { body = { status: 'COMPLETED', result: await recognizeListingImage(job.imageUrl, { authToken: qa.callbackToken }) }; }
    catch { body = { status: 'FAILED' }; }
    if (stopped) return;
    const callback = await fetch(qa.apiUrl + '/api/internal/minimax-vision/' + job.jobId + '/result', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
    if (callback.status !== 204) throw new Error('QA_WORKER_CALLBACK_FAILED');
    console.log(body.status === 'COMPLETED' ? 'QA_AI_COMPLETE' : 'QA_AI_FAILED');
  }
}

async function main() {
  const index = path.join(clientDist, 'index.html');
  await fs.access(index);
  qa = await startNativeQa(database, 600, { listingAiPilot: true });
  const login = await fetch(qa.apiUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: qa.actors.buyer.email, password: qa.actors.buyer.password }) });
  if (!login.ok) throw new Error('QA_LOGIN_FAILED');
  const session = await login.json();
  assert.equal(session.user.id, qa.actors.buyer.id);
  const nonce = randomBytes(16).toString('hex');
  let admitted = false;
  const express = require('../../server/node_modules/express');
  const app = express();
  app.get('/qa-init/' + nonce, (_req, res) => {
    if (admitted) return res.status(404).end();
    admitted = true;
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    const user = { id: session.user.id, phoneNumber: session.user.phoneNumber, name: session.user.name };
    // Synthetic, one-use fixture only. The browser receives no real account
    // credential, and this response is never saved to a test artifact.
    return res.send('<!doctype html><meta charset="utf-8"><script>' +
      'localStorage.setItem("token",' + JSON.stringify(session.token) + ');' +
      'localStorage.setItem("user",' + JSON.stringify(JSON.stringify(user)) + ');' +
      'location.replace("/sell");</script>');
  });
  app.use('/api', (req, res) => {
    const target = new URL(req.originalUrl, qa.apiUrl);
    const forwarded = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, upstream => {
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
    });
    forwarded.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.destroy(); });
    req.pipe(forwarded);
  });
  app.use(express.static(clientDist, { setHeaders: res => res.setHeader('Cache-Control', 'no-store') }));
  app.use((_req, res) => res.set('Cache-Control', 'no-store').sendFile(index));
  server = http.createServer(app);
  // A fresh origin avoids an older PWA service worker intercepting the one-use
  // synthetic login or serving a stale web bundle on a subsequent QA run.
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert(address && typeof address !== 'string');
  started = true;
  timer = setTimeout(() => { void stop(); }, 570_000);
  worker = runWorker().catch(() => { if (!stopped) { console.log('QA_WORKER_FAILED'); process.exitCode = 1; } });
  console.log('QA_BROWSER_URL=http://127.0.0.1:' + address.port + '/qa-init/' + nonce);
  console.log('QA_API_URL=' + qa.apiUrl);
  console.log('QA_USER_ID=' + qa.actors.buyer.id);
  console.log('QA_READY');
}

process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
main().catch(() => { console.log('QA_START_FAILED'); process.exitCode = 1; void stop(); });
