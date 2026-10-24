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

test('a lost issue response retries the exact saved progress operation, never a send or seller reply', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-cli-issue-'));fs.mkdirSync(path.join(dir,'tools'));
 for(const file of ['relay.cjs','relay-identity.cjs','inquiry-questions.cjs'])fs.copyFileSync(path.join(__dirname,file),path.join(dir,'tools',file));
 const roomId='11111111-1111-4111-8111-111111111111',reservation={id:'22222222-2222-4222-8222-222222222222',leadId:'33333333-3333-4333-8333-333333333333',sourceUrl:url},checkedAt='2026-10-24T11:24:30Z';
 const posts=[];let first=true;
 const server=createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.method==='GET'&&req.url==='/api/source-lead-admin/inquiries'){res.end(JSON.stringify({items:[{id:roomId,state:'TRANSFER_RESERVED',source:{id:reservation.leadId,canonicalUrl:url,sellerRoute:{actingPageId:'61595150241978'}}}],nextCursor:null}));return;}
  if(req.method!=='POST'||req.url!=='/api/source-lead-admin/inquiries/'+roomId+'/transfer-issue'){res.statusCode=500;res.end('{}');return;}
  let text='';req.on('data',b=>text+=b);req.on('end',()=>{posts.push(JSON.parse(text));if(first){first=false;req.socket.destroy();return;}res.end(JSON.stringify({state:'DELIVERY_REQUIRES_REVIEW',transferIssue:{code:'FACEBOOK_COMMENT_REJECTED',checkedAt,originalPostUrl:url},delivered:false}));});
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const queueDir=path.join(dir,'relay','127.0.0.1');fs.mkdirSync(queueDir,{recursive:true});const queue=path.join(queueDir,'queue.json');fs.writeFileSync(queue,JSON.stringify({[roomId]:{status:'RESERVED',reservation}}));
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(dir,'tools/relay.cjs'),'issue',roomId,checkedAt,'123456789','--origin','http://127.0.0.1:'+server.address().port],{env:{...process.env,ADMIN_API_KEY:'synthetic-only'}});let output='';child.stdout.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>resolve({code,json:JSON.parse(output)}));});
 try{const lost=await run();assert.equal(lost.code,1);const pending=JSON.parse(fs.readFileSync(queue))[roomId].issueAttempt;assert.equal(pending.requestId,posts[0].requestId);const recovered=await run();assert.equal(recovered.code,0);assert.equal(recovered.json.delivered,false);assert.equal(recovered.json.outboundSent,false);assert.deepEqual(posts[1],posts[0]);const saved=JSON.parse(fs.readFileSync(queue))[roomId];assert.equal(saved.status,'NEEDS_REVIEW');assert.equal(saved.issueAttempt,undefined);assert.equal(saved.delivery,undefined);assert.deepEqual(saved.reservation,reservation);}
 finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true});}
});
