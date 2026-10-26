const { test } = require('node:test');
const assert = require('node:assert/strict');
const { drain } = require('./cp-backfill-drain.cjs');
const { invoke } = require('./retail-price-research.cjs');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const stamp = new Date().toISOString(), hash = 'a'.repeat(64);
function fixture(count) {
  const manifest = { runId: 'synthetic', items: Array.from({ length: count }, (_, i) => ({ productKey: 'source:00000000-0000-4000-8000-' + String(i).padStart(12, '0'), bindingHash: hash, sourceCheckedAt: stamp, sourceEvidence: 'synthetic-source-review.json' })) };
  const scored = new Map(), batches = [];
  const call = async (command, keys) => {
    if (command === 'capacity') return { batchSize: 6, queueReadLimit: 100 };
    if (command === 'status') return { items: keys.map(productKey => ({ productKey, bindingHash: hash, ready: !scored.has(productKey), score: scored.get(productKey) ?? null, evaluatedAt: stamp })) };
    if (command === 'evaluate-batch') { batches.push(keys); for (const key of keys) scored.set(key, 80); return { evaluated: keys.length }; }
    throw Error('Unexpected command: ' + command);
  };
  return { manifest, scored, batches, call };
}
test('drains 100 reviewed products in 17 small batches and counts real persisted scores only', async () => {
  const f = fixture(100), state = {};
  const out = await drain(f.manifest, state, { call: f.call });
  assert.equal(out.newlyScored, 100);
  assert.equal(f.batches.length, 17);
  assert.ok(f.batches.every(b => b.length <= 6));
  await drain(f.manifest, state, { call: f.call });
  assert.equal(f.batches.length, 17);
});
test('recovers a committed lost reply with GETs and never replays its provider call', async () => {
  const f = fixture(6), state = {};
  const call = async (c, a) => { const r = await f.call(c, a); if (c === 'evaluate-batch') throw Error('RETAIL_OPERATION_UNCONFIRMED'); return r; };
  await assert.rejects(drain(f.manifest, state, { call }));
  const out = await drain(f.manifest, state, { call: f.call });
  assert.equal(out.newlyScored, 6);
  assert.equal(f.batches.length, 1);
});
test('insufficient evidence, old scores and changed bindings never count as new CP completion', async () => {
  const f = fixture(3); f.scored.set(f.manifest.items[0].productKey, 70);
  const call = async (c, a) => {
    if (c === 'evaluate-batch') { f.batches.push(a); return { evaluated: a.length }; }
    const r = await f.call(c, a);
    if (c === 'status') for (const item of r.items) if (item.productKey === f.manifest.items[1].productKey) item.bindingHash = 'b'.repeat(64);
    return r;
  };
  const out = await drain(f.manifest, {}, { call });
  assert.equal(out.newlyScored, 0); assert.equal(out.alreadyScored, 1); assert.equal(out.pending, 2);
  assert.deepEqual(f.batches[0], [f.manifest.items[2].productKey]);
});
test('unresolved unknown outcomes and stale source reviews never trigger a new evaluation', async () => {
  const f = fixture(2), state = { runId: 'synthetic', items: { [f.manifest.items[0].productKey]: { status: 'SUBMITTING' } } };
  f.manifest.items[1].sourceCheckedAt = new Date(Date.now() - 7200000).toISOString();
  const out = await drain(f.manifest, state, { call: f.call });
  assert.equal(out.newlyScored, 0); assert.equal(f.batches.length, 0);
});
test('expired source evidence cannot erase an unknown outcome or enable a later resend', async () => {
  const f = fixture(1), key = f.manifest.items[0].productKey;
  const state = { runId: 'synthetic', items: { [key]: { status: 'UNCONFIRMED' } } };
  f.manifest.items[0].sourceCheckedAt = new Date(Date.now() - 7200000).toISOString();
  await drain(f.manifest, state, { call: f.call });
  assert.equal(state.items[key].status, 'UNCONFIRMED');
  f.manifest.items[0].sourceCheckedAt = stamp;
  await drain(f.manifest, state, { call: f.call });
  assert.equal(f.batches.length, 0);
  f.scored.set(key, 80);
  assert.equal((await drain(f.manifest, state, { call: f.call })).newlyScored, 1);
});
test('explicit pre-execution 429 can resume after cooldown without turning into an unknown outcome', async () => {
  const f = fixture(1), state = {}; let clock = Date.now();
  const call = async (c, a) => { if (c === 'evaluate-batch') { const e = Error('RETAIL_HTTP_429_CP_DAILY_CAPACITY'); e.httpStatus = 429; e.rateLimitHeaders = { 'retry-after': '120' }; throw e; } return f.call(c, a); };
  await assert.rejects(drain(f.manifest, state, { call, now: () => clock }));
  await drain(f.manifest, state, { call: f.call, now: () => clock });
  assert.equal(f.batches.length, 0);
  clock += 121000;
  assert.equal((await drain(f.manifest, state, { call: f.call, now: () => clock })).newlyScored, 1);
  assert.equal(f.batches.length, 1);
});
test('real CLI errors carry rate-limit status into the resumable drain', async () => {
  const f = fixture(1), state = {}, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-drain-cli-'));
  try {
    const file = path.join(dir, 'request.json');fs.writeFileSync(file, JSON.stringify({productKeys:f.manifest.items.map(x=>x.productKey)}));
    const call = async (c, a) => c === 'evaluate-batch' ? invoke('evaluate', [file], {
      credential: 'synthetic-only', fetcher: async () => ({ok:false,status:429,headers:new Headers({'retry-after':'300'}),json:async()=>({errorCode:'CP_DAILY_CAPACITY'})}),
    }) : f.call(c, a);
    await assert.rejects(drain(f.manifest, state, { call }));
    assert.equal(state.items[f.manifest.items[0].productKey].status, 'RATE_LIMITED');
    assert.ok(state.items[f.manifest.items[0].productKey].retryAfter > Date.now() + 290000);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
