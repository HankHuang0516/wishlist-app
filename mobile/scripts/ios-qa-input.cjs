// QA-only loopback input broker. Credentials travel only to the isolated App,
// never to XCTest, launch environment, logs, reports, or persistent caches.
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { iosQaBundle } = require('./ios-qa-config.cjs');
const ACTIONS = ['login-buyer', 'deletion-buyer'];
const INPUT_STAGES = ['app-entered', 'app-active', 'app-not-active', 'credentials-unavailable', 'values-rejected', 'fields-rejected', 'input-applied'];
const PROBE_STAGES = ['app-started', 'url-delivered', 'url-guard-rejected', 'action-guard-rejected', 'notification-delivered'];
async function startIosQaInput(label, actors, openUrl, lifetimeMs = 180000, trigger = 'url') {
  const bundle = iosQaBundle(label), buyer = actors?.buyer;
  if (!buyer || !/^[0-9a-f-]{36}-buyer@example\.invalid$/.test(buyer.email) || !/^Qa[0-9a-f]{32}123$/.test(buyer.password) ||
    typeof openUrl !== 'function' || !Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 360000 || !['url', 'notification'].includes(trigger)) throw new Error('Invalid isolated QA input configuration');
  let stopped = false, nextAction = 0, server, expiry, stopPromise;
  const jobs = new Map(), completed = [], stages = [], probes = [], rejections = [];
  const reply = (response, status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Connection': 'close' });
    response.end(JSON.stringify(value));
  };
  server = http.createServer(async (request, response) => {
    try {
      const rejection = stopped ? 'stopped' : request.socket.remoteAddress !== '127.0.0.1' ? 'peer' : request.headers.origin ? 'origin' :
        request.headers['x-wishlist-qa-bundle'] !== bundle ? 'bundle' : request.headers.host !== '127.0.0.1:' + server.address().port ? 'authority' :
          request.headers['transfer-encoding'] || request.headers['content-length'] && request.headers['content-length'] !== '0' ? 'request-body' : null;
      if (rejection) { if (rejections.length < 32) rejections.push(rejection); return reply(response, 403, { ok: false }); }
      const match = /^\/(request|credentials|done|failed|status|probe|pending)\/([a-z0-9-]+)(?:\/([a-z-]+))?$/.exec(request.url || '');
      if (!match || request.method !== 'GET') return reply(response, 400, { ok: false });
      const [, operation, name, inputStage] = match;
      if (operation === 'status' ? !INPUT_STAGES.includes(inputStage) : inputStage !== undefined) return reply(response, 400, { ok: false });
      if (operation === 'probe') {
        if (!PROBE_STAGES.includes(name) || probes.length >= 32) return reply(response, 400, { ok: false });
        probes.push(name); return reply(response, 200, { ok: true });
      }
      if (operation === 'request') {
        if (name !== ACTIONS[nextAction]) return reply(response, 409, { ok: false });
        nextAction++;
        stages.push(name + ':requested');
        const id = randomUUID();
        let finish;
        const result = new Promise(resolve => { finish = resolve; });
        const timer = setTimeout(() => finish(false), 10000);
        const job = { action: name, taken: false, claimed: false, finish, timer };
        jobs.set(id, job);
        // The private job capability goes directly to simctl/App, not XCTest.
        const url = 'wishlistqa' + label + '://qa-input?action=' + name + '&port=' + server.address().port + '&job=' + id;
        try { await openUrl(url); stages.push(name + (trigger === 'url' ? ':url-opened' : ':notification-posted')); }
        catch { stages.push(name + (trigger === 'url' ? ':url-open-failed' : ':notification-post-failed')); finish(false); }
        const ok = await result;
        clearTimeout(timer); jobs.delete(id);
        if (ok && !stopped) completed.push(name);
        return reply(response, ok && !stopped ? 200 : 409, { ok: ok && !stopped });
      }
      if (operation === 'pending') {
        // One-use capability goes only to the QA App's private HTTP client;
        // it is never returned to the XCTest input requester or logged.
        const match = trigger === 'notification' && ACTIONS.includes(name) ? [...jobs].find(([, job]) => job.action === name && !job.claimed) : null;
        if (!match) return reply(response, 404, { ok: false });
        const [id, job] = match; job.claimed = true;
        stages.push(name + ':capability-claimed');
        return reply(response, 200, { action: name, job: id });
      }
      const job = jobs.get(name);
      if (!job) return reply(response, 404, { ok: false });
      if (operation === 'status') {
        if (stages.length >= 32) return reply(response, 409, { ok: false });
        stages.push(job.action + ':' + inputStage);
        if (['app-not-active', 'credentials-unavailable', 'values-rejected', 'fields-rejected'].includes(inputStage)) job.finish(false);
        return reply(response, 200, { ok: true });
      }
      if (operation === 'credentials') {
        if (job.taken) return reply(response, 409, { ok: false });
        job.taken = true;
        stages.push(job.action + ':credentials-taken');
        const fields = job.action === 'login-buyer'
          ? [{ label: '手機號碼或 Email', value: buyer.email }, { label: '密碼', value: buyer.password }]
          : [{ label: '刪除帳號的目前密碼', value: buyer.password }];
        return reply(response, 200, { action: job.action, fields });
      }
      if (!job.taken) return reply(response, 409, { ok: false });
      job.finish(operation === 'done');
      return reply(response, 200, { ok: true });
    } catch { if (!response.headersSent) reply(response, 500, { ok: false }); else response.end(); }
  });
  server.requestTimeout = 12000; server.headersTimeout = 12000; server.keepAliveTimeout = 1000;
  await new Promise((resolve, reject) => { server.once('error', () => reject(new Error('QA input listener unavailable'))); server.listen(0, '127.0.0.1', resolve); });
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopped = true; clearTimeout(expiry);
    for (const job of jobs.values()) { clearTimeout(job.timer); job.finish(false); }
    stopPromise = new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }).then(() => { jobs.clear(); });
    return stopPromise;
  };
  expiry = setTimeout(() => { stop().catch(() => undefined); }, lifetimeMs);
  return { port: server.address().port, completed, stages, probes, rejections, stop };
}
module.exports = { ACTIONS, INPUT_STAGES, PROBE_STAGES, startIosQaInput };
