'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { PAGE_ID, PAGE_NAME, PROFILE_URL, assertIdentity, assertActiveRoute, assertPreparedIdentity, assertNoRejectedSend } = require('./relay-identity.cjs');
const url = 'https://www.facebook.com/groups/123/posts/456';
const identity = () => ({ actingPageId: PAGE_ID, actingPageName: PAGE_NAME, profileUrl: PROFILE_URL, channel: 'FACEBOOK_UI', routeKind: 'PUBLIC_COMMENT', requiresNormalUiAndReadback: true });
const route = () => ({ ...identity(), sourceUrl: url, publicRouteUrl: url });
const response = () => ({ route: route(), publicComment: { ...identity(), postUrl: url, text: '伺服器固定原文', buyerTextIncluded: false } });
test('server and route must name the expected identity, not a former or unrelated account', () => {
  assertIdentity(identity()); assertActiveRoute(route(), url);
  for (const actingPageId of ['61595150241978', 'personal', '', undefined]) {
    assert.throws(() => assertIdentity({ ...identity(), actingPageId }), /IDENTITY_MISMATCH/);
    assert.throws(() => assertActiveRoute({ ...route(), actingPageId }, url), /IDENTITY_MISMATCH/);
  }
  assert.throws(() => assertIdentity({ ...identity(), actingPageName: 'Wishlist.AI' }));
});
test('both prepare and preflight must retain identity, exact post and unchanged server text', () => {
  assert.equal(assertPreparedIdentity(response(), response(), url).text, '伺服器固定原文');
  for (const stage of ['prepared', 'preflight']) for (const patch of [{ actingPageId: '61595150241978' }, { postUrl: url + '7' }, { buyerTextIncluded: true }, { text: '改寫留言' }]) {
    const a = response(), b = response(); Object.assign((stage === 'prepared' ? a : b).publicComment, patch);
    assert.throws(() => assertPreparedIdentity(a, b, url));
  }
});
test('a rejected external comment stays stopped independently of reservation expiry or identity changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-blocker-test-')), file = path.join(dir, 'blockers.json');
  try {
    assertNoRejectedSend(file, 'room'); fs.writeFileSync(file, JSON.stringify({ room: { mustNotResend: true, commentId: '123' } }));
    assert.throws(() => assertNoRejectedSend(file, 'room'), /NO_RESEND/); assertNoRejectedSend(file, 'another-room');
    fs.writeFileSync(file, '{bad'); assert.throws(() => assertNoRejectedSend(file, 'room'), /UNREADABLE/);
    fs.writeFileSync(file, '[]'); assert.throws(() => assertNoRejectedSend(file, 'room'), /UNREADABLE/);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
test('CLI identity only reads its protected endpoint and never allocates a room, queue, or send', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-cli-identity-')); fs.mkdirSync(path.join(dir, 'tools'));
  for (const file of ['relay.cjs', 'relay-identity.cjs', 'inquiry-questions.cjs']) fs.copyFileSync(path.join(__dirname, file), path.join(dir, 'tools', file));
  let body = identity(); const calls = [];
  const server = createServer((req, res) => { calls.push([req.method, req.url, req.headers['x-admin-key']]); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(dir, 'tools/relay.cjs'), 'identity', '--origin', 'http://127.0.0.1:' + server.address().port], { env: { ...process.env, ADMIN_API_KEY: 'synthetic-only' } });
    let output = ''; child.stdout.on('data', b => output += b); child.on('error', reject); child.on('exit', code => resolve({ code, json: JSON.parse(output) }));
  });
  try {
    const pass = await run(); assert.equal(pass.code, 0); assert.equal(pass.json.compatible, true); assert.equal(pass.json.outboundSent, false);
    body = { ...identity(), actingPageId: '61595150241978' }; const stop = await run(); assert.equal(stop.code, 1); assert.match(stop.json.error, /IDENTITY_MISMATCH/);
    assert.deepEqual(calls, [['GET', '/api/source-lead-admin/relay-identity', 'synthetic-only'], ['GET', '/api/source-lead-admin/relay-identity', 'synthetic-only']]);
    assert.deepEqual(fs.readdirSync(dir), ['tools']);
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true }); }
});
