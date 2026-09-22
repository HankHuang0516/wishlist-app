// One-use loopback broker for isolated Android QA credentials. Secrets are
// returned only to the assigned QA instrumentation process over an adb-reverse
// socket; they are never command-line arguments, build inputs, logs or files.
const http = require('node:http');

const ACTIONS = ['login-buyer', 'deletion-buyer'];

async function startAndroidQaInput(packageName, actors, lifetimeMs = 180000) {
  const buyer = actors?.buyer;
  if (!/^com\.hank_huang0516\.snack425e646aa6a74ad8a964aadeb4741fc1\.qa[0-9]{12}$/.test(packageName || '') ||
    !buyer || !/^[0-9a-f-]{36}-buyer@example\.invalid$/.test(buyer.email) || !/^Qa[0-9a-f]{32}123$/.test(buyer.password) ||
    !Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 360000) throw new Error('Invalid isolated Android QA input configuration');
  let server, stopped = false, nextAction = 0, expiry, stopPromise;
  const completed = [], rejections = [];
  const reply = (response, status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Connection': 'close' });
    response.end(JSON.stringify(value));
  };
  server = http.createServer((request, response) => {
    try {
      const port = server.address().port;
      const rejection = stopped ? 'stopped' : request.socket.remoteAddress !== '127.0.0.1' ? 'peer' : request.headers.origin ? 'origin' :
        request.headers['x-wishlist-qa-package'] !== packageName ? 'package' : request.headers.host !== '127.0.0.1:' + port ? 'authority' :
          request.headers['transfer-encoding'] || request.headers['content-length'] && request.headers['content-length'] !== '0' ? 'request-body' : null;
      if (rejection) { if (rejections.length < 16) rejections.push(rejection); return reply(response, 403, { ok: false }); }
      const match = /^\/credentials\/(login-buyer|deletion-buyer)$/.exec(request.url || '');
      if (request.method !== 'GET' || !match) return reply(response, 400, { ok: false });
      const action = match[1];
      if (action !== ACTIONS[nextAction]) return reply(response, 409, { ok: false });
      nextAction++;
      const fields = action === 'login-buyer'
        ? [{ label: '手機號碼或 Email', value: buyer.email }, { label: '密碼', value: buyer.password }]
        : [{ label: '刪除帳號的目前密碼', value: buyer.password }];
      completed.push(action);
      return reply(response, 200, { action, fields });
    } catch { if (!response.headersSent) reply(response, 500, { ok: false }); else response.end(); }
  });
  server.requestTimeout = 12000; server.headersTimeout = 12000; server.keepAliveTimeout = 1000;
  await new Promise((resolve, reject) => { server.once('error', () => reject(new Error('Android QA input listener unavailable'))); server.listen(0, '127.0.0.1', resolve); });
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopped = true; clearTimeout(expiry);
    stopPromise = new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
    return stopPromise;
  };
  expiry = setTimeout(() => { stop().catch(() => undefined); }, lifetimeMs);
  return { port: server.address().port, completed, rejections, stop };
}

module.exports = { ACTIONS, startAndroidQaInput };
