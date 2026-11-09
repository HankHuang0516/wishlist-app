#!/usr/bin/env node
'use strict';
/* Head-of-line check: does one heavy API call slow down everyone else?
 *
 * Reads a tiny static file a few times on its own, then again while a heavy
 * read (default /api/discovery) is running. On a healthy server the tiny file
 * takes the same time in both cases. FAIL when it is delayed by more than
 * --allow ms (default 200) or the heavy read itself takes longer than --budget.
 *
 * Read-only, about 20 requests in total.
 */
const https = require('node:https');
const http = require('node:http');

function parse(argv) {
  const values = { base: 'https://wishlist-app-production.up.railway.app', heavy: '/api/discovery', light: '/web-version.json', allow: '200', budget: '1000', 'local-certificate': false };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index].replace(/^--/, '');
    if (!(name in values)) throw new Error('Unknown option: ' + argv[index]);
    if (typeof values[name] === 'boolean') values[name] = true; else values[name] = argv[++index];
  }
  const base = new URL(values.base);
  if (values['local-certificate'] && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('--local-certificate is only for a site on this machine.');
  return { base, heavy: values.heavy, light: values.light, allow: Number(values.allow), budget: Number(values.budget), insecure: values['local-certificate'] };
}

const options = parse(process.argv.slice(2));
const client = options.base.protocol === 'https:' ? https : http;
const agent = new client.Agent({ keepAlive: true, ...(options.insecure ? { rejectUnauthorized: false } : {}) });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function read(path) {
  return new Promise(resolve => {
    const started = process.hrtime.bigint();
    const request = client.get(new URL(path, options.base), { agent, headers: { 'accept-encoding': 'gzip' }, timeout: 60000 }, reply => {
      reply.resume();
      reply.on('end', () => resolve({ status: reply.statusCode, ms: Number(process.hrtime.bigint() - started) / 1e6 }));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve({ status: 0, ms: Number(process.hrtime.bigint() - started) / 1e6 }));
  });
}

(async () => {
  const alone = [];
  for (let index = 0; index < 6; index++) { alone.push(await read(options.light)); await sleep(200); }
  const baseline = alone.map(item => item.ms).sort((a, b) => a - b)[Math.floor(alone.length / 2)];
  let finished = false;
  const heavy = read(options.heavy).then(result => { finished = true; return result; });
  const during = [];
  await sleep(100);
  while (!finished && during.length < 12) { during.push(await read(options.light)); await sleep(150); }
  const result = await heavy;
  const slowest = during.length ? Math.max(...during.map(item => item.ms)) : baseline;
  const delay = Math.max(0, slowest - baseline);
  const refused = [result, ...alone, ...during].some(item => item.status === 429);
  const verdict = !refused && result.status === 200 && result.ms <= options.budget && delay <= options.allow ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({ verdict, heavy: { path: options.heavy, status: result.status, ms: Math.round(result.ms) },
    light: { path: options.light, alone_ms: Math.round(baseline), slowest_during_heavy_ms: Math.round(slowest), extra_delay_ms: Math.round(delay), samples_during: during.length },
    limits: { heavy_budget_ms: options.budget, allowed_extra_delay_ms: options.allow }, refused }, null, 1));
  agent.destroy();
  process.exitCode = verdict === 'PASS' ? 0 : 1;
})();
