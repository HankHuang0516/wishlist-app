'use strict';
// Synthetic rows only; fake transport. No network, database or credentials.
const test = require('node:test'), assert = require('node:assert/strict');
const { buildPlan, runBridge, verifyReadback, operationId } = require('./records-bridge-core.cjs');
const importer = require('../dist/lib/semiAutoImport');
const now = new Date('2026-10-21T10:00:00Z');
const header = '原帖網址,原始ID,商品名稱,價格,幣別,縣市,行政區,原發日期,來源查核時間,狀態,授權證據';
const row = (i, status = 'ACTIVE', key = 'FB1-' + i + '-01') => `https://www.facebook.com/groups/1/posts/${i},${key},合成測試商品${i},${100 + i},TWD,臺北市,大安區,2026-10-21T08:00:00Z,2026-10-21T09:00:00Z,${status},`;
const csv = (n, extra = []) => [header, ...Array.from({ length: n }, (_, i) => row(i + 1)), ...extra].join('\r\n');
const memoryJournal = () => { let saved = null; return { load: () => saved && JSON.parse(saved), begin: s => { if (saved) throw Error('EXISTS'); saved = JSON.stringify(s); }, save: s => { saved = JSON.stringify(s); }, peek: () => JSON.parse(saved) }; };
const okTransport = (calls, overrides = {}) => async body => { calls.push(body); return { operationId: body.operationId, replayed: false, qualifiedSupplyAdded: 0, results: body.items.map((it, i) => ({ id: 'id-' + it.archiveItemId, archiveItemId: it.archiveItemId, revision: 1, stateHash: 'a'.repeat(64), status: 'PRIVATE_PENDING', ...overrides })) }; };

test('plans fixed batches of 20 with deterministic RFC-shaped operation ids and private drafts', () => {
  const p = buildPlan({ csvText: csv(45), importer, now });
  assert.deepEqual(p.batches.map(b => b.items.length), [20, 20, 5]);
  assert.equal(buildPlan({ csvText: csv(45), importer, now }).planSha, p.planSha);
  for (const b of p.batches) assert.match(b.operationId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(operationId(p.planSha, 0), operationId(p.planSha, 1));
  const f = p.batches[0].items[0].facts;
  assert.equal(p.batches[0].items[0].expectedRevision, 0);
  assert.equal(f.sourceClaimState, 'UNKNOWN');
  assert.equal(f.latitude, null);
  assert.equal(f.evidence.publicFacts.priceText, '101');
});

test('notes precision widens date bounds but never past the source check', () => {
  const notes = '﻿原始ID,FB顯示的時間,原發日期推算精度,備註\r\nFB1-1-01,2小時前,±1小時,\r\n';
  const f = buildPlan({ csvText: csv(1), notesText: notes, importer, now }).batches[0].items[0].facts;
  assert.equal(f.postedEarliestAt, '2026-10-21T07:00:00.000Z');
  assert.equal(f.postedLatestAt, '2026-10-21T09:00:00.000Z');
  assert.equal(f.evidence.publicFacts.originalDateLabel, '2小時前');
});

test('sold claims are skipped; duplicate or missing stable keys stop planning', () => {
  const p = buildPlan({ csvText: csv(2, [row(9, 'SOLD')]), importer, now });
  assert.equal(p.total, 2);
  assert.deepEqual(p.skipped, [{ archiveItemId: 'FB1-9-01', reason: 'SOURCE_NOT_AVAILABLE' }]);
  assert.throws(() => buildPlan({ csvText: csv(1, [row(1)]), importer, now }), /DUPLICATE_ITEM_KEY/);
  assert.throws(() => buildPlan({ csvText: csv(1, [row(7, 'ACTIVE', '')]), importer, now }), /STABLE_ITEM_KEY_REQUIRED/);
});

test('existing archive ids stop before any write, also in dry-run', async () => {
  const calls = [], plan = buildPlan({ csvText: csv(3), importer, now });
  for (const mode of ['dry-run', 'apply']) {
    const r = await runBridge({ plan, mode, existing: new Set(['FB1-2-01']), journal: memoryJournal(), transport: okTransport(calls) });
    assert.equal(r.errorCode, 'RECORD_ALREADY_EXISTS');
  }
  assert.equal(calls.length, 0);
  assert.equal((await runBridge({ plan, mode: 'dry-run', existing: new Set(), journal: memoryJournal(), transport: okTransport(calls) })).state, 'DRY_RUN_PASSED');
  assert.equal(calls.length, 0);
});

test('unknown result stops; rerun resends only that batch with the identical body', async () => {
  const plan = buildPlan({ csvText: csv(45), importer, now }), journal = memoryJournal(), calls = [];
  let n = 0;
  const flaky = async body => { if (++n === 2) { calls.push(body); throw Error('socket hang up'); } return okTransport(calls)(body); };
  const first = await runBridge({ plan, mode: 'apply', existing: new Set(), journal, transport: flaky });
  assert.equal(first.errorCode, 'WRITE_RESULT_UNKNOWN');
  assert.deepEqual(journal.peek().batches.map(b => b.state), ['CONFIRMED', 'SENT', 'PLANNED']);
  const second = await runBridge({ plan, mode: 'apply', existing: new Set(), journal, transport: okTransport(calls) });
  assert.equal(second.state, 'SAVED_PRIVATE_PENDING');
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[2], calls[1]);
  assert.equal(calls.filter(c => c.operationId === plan.batches[0].operationId).length, 1);
});

test('a rejected batch or a non-private acknowledgement stops later batches', async () => {
  const plan = buildPlan({ csvText: csv(45), importer, now });
  let calls = [];
  const reject = async body => { calls.push(body); const e = Error('HTTP_409'); e.safeCode = 'HTTP_409'; e.errorCode = 'RECORD_STATE_CONFLICT'; throw e; };
  const j = memoryJournal(), r = await runBridge({ plan, mode: 'apply', existing: new Set(), journal: j, transport: reject });
  assert.equal(r.errorCode, 'BATCH_REJECTED');
  assert.equal(j.peek().batches[0].errorCode, 'RECORD_STATE_CONFLICT');
  assert.equal(calls.length, 1);
  calls = [];
  const published = await runBridge({ plan, mode: 'apply', existing: new Set(), journal: memoryJournal(), transport: okTransport(calls, { status: 'PUBLISHED' }) });
  assert.equal(published.errorCode, 'WRITE_ACK_INVALID');
  assert.equal(calls.length, 1);
});

test('read-back flags missing, duplicated, published or changed drafts', () => {
  const plan = buildPlan({ csvText: csv(4), importer, now }), items = plan.batches[0].items;
  const rec = (it, extra = {}) => ({ archiveItemId: it.archiveItemId, status: 'PRIVATE_PENDING', recordOrigin: 'DB_MASTER', pendingFacts: it.facts, ...extra });
  assert.equal(verifyReadback(plan, items.map(it => rec(it))).state, 'READBACK_PASSED');
  const bad = verifyReadback(plan, [rec(items[0]), rec(items[0]), rec(items[1], { status: 'PUBLISHED' }), rec(items[2], { pendingFacts: { ...items[2].facts, title: '改過' } })]);
  assert.deepEqual(bad.problems.map(p => p.problem), ['DUPLICATE', 'STATE_PUBLISHED', 'FACTS_MISMATCH', 'MISSING']);
});

test('a journal from a different plan is refused', async () => {
  const j = memoryJournal();
  await runBridge({ plan: buildPlan({ csvText: csv(2), importer, now }), mode: 'apply', existing: new Set(), journal: j, transport: okTransport([]) });
  await assert.rejects(runBridge({ plan: buildPlan({ csvText: csv(3), importer, now }), mode: 'apply', existing: new Set(), journal: j, transport: okTransport([]) }), /JOURNAL_PLAN_MISMATCH/);
});
