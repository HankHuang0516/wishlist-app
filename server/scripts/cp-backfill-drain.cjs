#!/usr/bin/env node
// Resume a reviewed CP worklist in small provider batches. Never auto-resend an
// evaluation whose result is unknown. Keys and evidence are public facts only.
const fs = require('node:fs');
const path = require('node:path');
const { invoke } = require('./retail-price-research.cjs');
const keyPattern = /^(listing|source|external):[a-f0-9-]{36}$/;
function save(file, value) {
  const temp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}
async function drain(manifest, state, { call = invoke, persist = () => {}, now = () => Date.now() } = {}) {
  if (!manifest?.runId || !Array.isArray(manifest.items) || manifest.items.length > 100 ||
      manifest.items.some(x => !keyPattern.test(x.productKey) || !/^[a-f0-9]{64}$/.test(x.bindingHash) || !x.sourceEvidence || !Number.isFinite(Date.parse(x.sourceCheckedAt)))) throw Error('CP_REVIEWED_MANIFEST_REQUIRED');
  if (new Set(manifest.items.map(x => x.productKey)).size !== manifest.items.length) throw Error('CP_DUPLICATE_REVIEW_KEY');
  if (state.runId && state.runId !== manifest.runId) throw Error('CP_RUN_STATE_MISMATCH');
  state.runId = manifest.runId;
  state.items ??= {};
  const capacity = await call('capacity', []);
  if (capacity.batchSize !== 6 || capacity.queueReadLimit < 100) throw Error('CP_BACKFILL_DEPLOYMENT_REQUIRED');
  const snapshot = manifest.items.length ? await call('status', manifest.items.map(x => x.productKey)) : { items: [] };
  // A checkpoint marked SUBMITTING may have committed before its reply was lost.
  // Read it back, but require investigation before another provider request.
  for (const item of manifest.items) {
    const previous = state.items[item.productKey];
    // Unknown provider outcomes stay unknown even when their source review
    // expires. Refreshing evidence must never erase the no-resend checkpoint.
    if (['SUBMITTING', 'UNCONFIRMED'].includes(previous?.status)) continue;
    if (now() - Date.parse(item.sourceCheckedAt) > 3600000 || Date.parse(item.sourceCheckedAt) > now()) {
      if (!['SCORED', 'ALREADY_SCORED'].includes(state.items[item.productKey]?.status)) state.items[item.productKey] = { status: 'SOURCE_REVIEW_STALE' };
      continue;
    }
    if (previous?.status === 'RATE_LIMITED' && previous.retryAfter > now()) continue;
    if (previous && !['SOURCE_REVIEW_STALE', 'WAITING_EVIDENCE', 'RATE_LIMITED'].includes(previous.status)) continue;
    const current = snapshot.items.find(x => x.productKey === item.productKey);
    if (!current || current.bindingHash !== item.bindingHash) state.items[item.productKey] = { status: 'BINDING_CHANGED_OR_UNAVAILABLE' };
    else if (typeof current.score === 'number') state.items[item.productKey] = { status: 'ALREADY_SCORED', score: current.score };
    else state.items[item.productKey] = { status: current.ready ? 'READY' : 'WAITING_EVIDENCE' };
  }
  const unresolved = Object.entries(state.items).filter(([, x]) => ['SUBMITTING', 'UNCONFIRMED'].includes(x.status)).map(([key]) => key);
  if (unresolved.length) {
    const result = await call('status', unresolved);
    for (const key of unresolved) {
      const row = result.items.find(x => x.productKey === key);
      const expected = manifest.items.find(x => x.productKey === key);
      if (row && row.bindingHash === expected?.bindingHash && typeof row.score === 'number') state.items[key] = { status: 'SCORED', score: row.score, evaluatedAt: row.evaluatedAt, recovered: true };
    }
  }
  persist(state);
  while (true) {
    const remaining = 100 - Object.values(state.items).filter(x => x.status === 'SCORED').length;
    const keys = manifest.items.filter(x => state.items[x.productKey]?.status === 'READY').slice(0, Math.min(capacity.batchSize, Math.max(remaining, 0))).map(x => x.productKey);
    if (!keys.length) break;
    const before = await call('status', keys);
    const work = keys.filter(key => {
      const old = before.items.find(x => x.productKey === key);
      if (!old || old.bindingHash !== manifest.items.find(x => x.productKey === key).bindingHash) { state.items[key] = { status: 'BINDING_CHANGED_OR_UNAVAILABLE' }; return false; }
      if (old && typeof old.score === 'number') { state.items[key] = { status: 'ALREADY_SCORED', score: old.score }; return false; }
      if (!old.ready) { state.items[key] = { status: 'WAITING_EVIDENCE' }; return false; }
      return true;
    });
    if (!work.length) { persist(state); continue; }
    const selected = work;
    if (!selected.length) { persist(state); continue; }
    for (const key of selected) state.items[key] = { status: 'SUBMITTING', startedAt: new Date(now()).toISOString() };
    persist(state);
    try {
      await call('evaluate-batch', selected);
      const after = await call('status', selected);
      for (const key of selected) {
        const row = after.items.find(x => x.productKey === key);
        const match = row?.bindingHash === manifest.items.find(x => x.productKey === key).bindingHash;
        state.items[key] = match && typeof row.score === 'number' ? { status: 'SCORED', score: row.score, evaluatedAt: row.evaluatedAt } : { status: 'ASSESSED_UNSCORED' };
      }
    } catch (e) {
      // HTTP 429 is an explicit rejection before a provider claim is made.
      // Connection failures/5xx retain the original unknown-result checkpoint.
      const waitSeconds = Math.max(60, Number(e.rateLimitHeaders?.['retry-after']) || 120);
      for (const key of selected) state.items[key] = e.httpStatus === 429 ? { status: 'RATE_LIMITED', retryAfter: now() + waitSeconds * 1000, errorCode: e.message } : { ...state.items[key], status: 'UNCONFIRMED' };
      persist(state);
      throw e;
    }
    persist(state);
  }
  state.summary = {
    newlyScored: Object.values(state.items).filter(x => x.status === 'SCORED').length,
    alreadyScored: Object.values(state.items).filter(x => x.status === 'ALREADY_SCORED').length,
    pending: Object.values(state.items).filter(x => !['SCORED', 'ALREADY_SCORED'].includes(x.status)).length,
    target: 100, goalMinimum: 75,
  };
  persist(state);
  return state.summary;
}
module.exports = { drain };
if (require.main === module) (async () => {
  const [manifestFile, stateFile] = process.argv.slice(2);
  if (!manifestFile || !stateFile || path.resolve(manifestFile) === path.resolve(stateFile)) throw Error('CP_MANIFEST_AND_STATE_REQUIRED');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  for (const item of manifest.items ?? []) {
    const proof = JSON.parse(fs.readFileSync(item.sourceEvidence, 'utf8'));
    if (proof.productKey !== item.productKey || proof.checkedAt !== item.sourceCheckedAt || proof.outcome !== 'ACTIVE' || proof.originalPageReviewed !== true) throw Error('CP_SOURCE_REVIEW_REQUIRED');
  }
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  // Pace this admin client below its existing 30 requests/minute ceiling.
  let lastRequest = 0;
  const call = async (command, args) => {
    const delay = 2100 - (Date.now() - lastRequest);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    lastRequest = Date.now();
    if (command !== 'evaluate-batch') return invoke(command, args);
    const file = stateFile + '.request.json';
    save(file, { productKeys: args });
    return invoke('evaluate', [file]);
  };
  console.log(JSON.stringify(await drain(manifest, state, { call, persist: value => save(stateFile, value) })));
})().catch(e => { console.error(e.message.startsWith('CP_') || e.message.startsWith('RETAIL_') ? e.message : 'CP_BACKFILL_UNCONFIRMED'); process.exitCode = 1; });
