'use strict';
// Daily capture CSV -> existing private DB record save. Every row stays PRIVATE_PENDING;
// publication remains the separate reviewed /records/publish step.
const crypto = require('node:crypto');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const fail = code => { const e = new Error(code); e.safeCode = code; throw e; };
const BATCH = 20, MAX_ROWS = 10000;
const ID = /^[A-Za-z0-9._:-]{1,160}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const PRECISION = { '±1分鐘': 60e3, '±10分鐘': 600e3, '±1小時': 3600e3, '±1天': 86400e3 };
// Deterministic RFC4122-shaped id: a resent batch replays instead of writing twice.
const operationId = (planSha, index) => { const h = sha(planSha + ':' + index).split(''); h[12] = '4'; h[16] = '89ab'[parseInt(h[16], 16) % 4]; const s = h.join(''); return [s.slice(0, 8), s.slice(8, 12), s.slice(12, 16), s.slice(16, 20), s.slice(20, 32)].join('-'); };

// Optional notes CSV (原始ID, FB顯示的時間, 原發日期推算精度, 備註) narrows date bounds.
function csvRows(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(v => v !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  if (quoted) fail('NOTES_CSV_UNTERMINATED');
  row.push(cell); if (row.some(v => v !== '')) rows.push(row);
  return rows;
}
function parseNotes(text) {
  const notes = new Map();
  if (!text) return notes;
  if (text.length > 4 * 1024 * 1024) fail('NOTES_TOO_LARGE');
  const rows = csvRows(text);
  const header = rows.shift();
  if (!header || header[0].replace(/^\uFEFF/, '').trim() !== '原始ID' || header.length !== 4) fail('NOTES_HEADER_INVALID');
  for (const r of rows) { if (r.length !== 4) fail('NOTES_WIDTH'); if (notes.has(r[0])) fail('NOTES_DUPLICATE_ID'); notes.set(r[0], { label: r[1], precision: r[2] }); }
  return notes;
}

function buildPlan({ csvText, notesText, importer, now }) {
  if (typeof csvText !== 'string' || !(now instanceof Date)) fail('INVALID_INPUT');
  let rows;
  try { rows = importer.parseInput(csvText, 'csv'); } catch (e) { fail('CSV_' + (e.message || 'INVALID')); }
  if (!rows.length || rows.length > MAX_ROWS) fail('ROW_LIMIT');
  const notes = parseNotes(notesText);
  const items = [], skipped = [], seen = new Set();
  for (const raw of rows) {
    let p;
    try { p = importer.normalize(raw, now); } catch (e) { fail('ROW_REJECTED_' + (e.message || 'INVALID')); }
    if (p.issues.includes('STABLE_ITEM_KEY_REQUIRED') || !ID.test(p.itemKey)) fail('STABLE_ITEM_KEY_REQUIRED');
    if (seen.has(p.itemKey)) fail('DUPLICATE_ITEM_KEY');
    seen.add(p.itemKey);
    // A sold/withdrawn claim needs bound state evidence; never create it as a draft here.
    if (['SOLD', 'WITHDRAWN', 'RESERVED'].includes(p.sourceStatus)) { skipped.push({ archiveItemId: p.itemKey, reason: 'SOURCE_NOT_AVAILABLE' }); continue; }
    if (p.checkedAt && !ISO.test(p.checkedAt)) fail('CHECKED_AT_FORMAT');
    const note = notes.get(p.itemKey);
    let earliest = null, latest = null;
    if (p.originalPostedAt) {
      const at = Date.parse(p.originalPostedAt), width = note ? PRECISION[note.precision.replace(/（.*$/, '')] : undefined;
      if (note && width === undefined) fail('NOTES_PRECISION_UNKNOWN');
      const ceiling = Math.min(+now, p.checkedAt ? Date.parse(p.checkedAt) : +now);
      earliest = new Date(at - (width || 0)).toISOString();
      latest = new Date(Math.min(at + (width || 0), ceiling)).toISOString();
    }
    const publicFacts = { priceText: p.price === null ? '未標價' : String(p.price), priceUnitStatus: p.price === null ? 'UNKNOWN' : 'SOURCE_STATED', currencyStatus: p.currency || 'UNKNOWN' };
    if (note && note.label) publicFacts.originalDateLabel = note.label.slice(0, 300);
    const facts = { canonicalUrl: p.sourceUrl, title: p.title, summary: '', county: p.county, district: p.district, publicPlaceName: null, publicAddress: null, latitude: null, longitude: null, postedEarliestAt: earliest, postedLatestAt: latest, checkedAt: p.checkedAt, evidence: { sourceUrl: p.sourceUrl, publicFacts }, sourceClaimState: 'UNKNOWN', stateEvidenceRef: null };
    items.push({ archiveItemId: p.itemKey, expectedRevision: 0, expectedStateHash: null, facts });
  }
  if (!items.length) fail('NO_ELIGIBLE_ROWS');
  const planSha = sha(JSON.stringify(items));
  const batches = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push({ index: batches.length, operationId: operationId(planSha, batches.length), items: items.slice(i, i + BATCH) });
  return { planSha, jobId: 'records-' + planSha.slice(0, 16), total: items.length, skipped, batches };
}

function checkAck(batch, response) {
  if (!response || !Array.isArray(response.results) || response.operationId !== batch.operationId || response.qualifiedSupplyAdded !== 0 || response.results.length !== batch.items.length) return false;
  // A replay returns stored results ordered by record id, so match by archive id, not position.
  const wanted = new Set(batch.items.map(i => i.archiveItemId));
  const ok = response.results.every(r => r && wanted.delete(r.archiveItemId) && r.status === 'PRIVATE_PENDING' && r.revision === 1 && typeof r.id === 'string' && /^[a-f0-9]{64}$/.test(r.stateHash || ''));
  return ok && wanted.size === 0;
}

// existing: archiveItemIds already in the DB (read-only preflight). Any overlap stops before writing.
async function runBridge({ plan, journal, transport, existing, wait = async () => {}, mode }) {
  if (!['dry-run', 'apply'].includes(mode)) fail('MODE_REQUIRED');
  let state = journal.load();
  if (state && state.planSha !== plan.planSha) fail('JOURNAL_PLAN_MISMATCH');
  // Batches this job already sent may exist because of this job; only never-sent rows must be new.
  const unsent = plan.batches.filter(b => !state || state.batches[b.index].state === 'PLANNED');
  const overlap = unsent.flatMap(b => b.items.map(i => i.archiveItemId)).filter(id => existing.has(id));
  if (overlap.length) return { state: 'STOPPED', errorCode: 'RECORD_ALREADY_EXISTS', overlap, written: 0 };
  if (mode === 'dry-run') return { state: 'DRY_RUN_PASSED', jobId: plan.jobId, planSha: plan.planSha, total: plan.total, batches: plan.batches.length, skipped: plan.skipped, written: 0 };
  if (!state) { state = { jobId: plan.jobId, planSha: plan.planSha, state: 'STARTED', batches: plan.batches.map(b => ({ index: b.index, operationId: b.operationId, state: 'PLANNED' })) }; journal.begin(state); }
  try {
    for (const batch of plan.batches) {
      const entry = state.batches[batch.index];
      if (entry.state === 'CONFIRMED') continue;
      // SENT (result unknown) resends the identical body; the server replays its stored result.
      entry.state = 'SENT'; journal.save(state);
      let response;
      try { response = await transport({ operationId: batch.operationId, items: batch.items }); }
      catch (e) { if (e && e.safeCode === 'HTTP_409') { entry.state = 'REJECTED'; entry.errorCode = e.errorCode || null; fail('BATCH_REJECTED'); } fail('WRITE_RESULT_UNKNOWN'); }
      if (!checkAck(batch, response)) { entry.state = 'UNKNOWN_ACK'; fail('WRITE_ACK_INVALID'); }
      entry.state = 'CONFIRMED'; entry.replayed = response.replayed === true; entry.ids = response.results.map(r => r.id).sort(); journal.save(state);
      await wait();
    }
    state.state = 'SAVED_PRIVATE_PENDING'; journal.save(state);
    return { ...state, total: plan.total, skipped: plan.skipped };
  } catch (error) {
    state.state = 'STOPPED'; state.errorCode = error.safeCode || 'BRIDGE_FAILED';
    try { journal.save(state); } catch {}
    return state;
  }
}
// Read-back: every planned row must exist once as an unpublished DB draft holding exactly the planned facts.
function verifyReadback(plan, records) {
  const byId = new Map();
  for (const r of records) if (byId.has(r.archiveItemId)) byId.set(r.archiveItemId, null); else byId.set(r.archiveItemId, r);
  const problems = [];
  for (const item of plan.batches.flatMap(b => b.items)) {
    const r = byId.get(item.archiveItemId);
    if (!r) { problems.push({ archiveItemId: item.archiveItemId, problem: r === null ? 'DUPLICATE' : 'MISSING' }); continue; }
    if (r.status !== 'PRIVATE_PENDING' || r.recordOrigin !== 'DB_MASTER') problems.push({ archiveItemId: item.archiveItemId, problem: 'STATE_' + r.status });
    const f = r.pendingFacts || {};
    if (f.title !== item.facts.title || f.canonicalUrl !== item.facts.canonicalUrl || f.county !== item.facts.county || f.district !== item.facts.district || f.evidence?.publicFacts?.priceText !== item.facts.evidence.publicFacts.priceText) problems.push({ archiveItemId: item.archiveItemId, problem: 'FACTS_MISMATCH' });
  }
  return { state: problems.length ? 'READBACK_FAILED' : 'READBACK_PASSED', checked: plan.total, problems };
}
module.exports = { buildPlan, runBridge, verifyReadback, operationId, checkAck, csvRows };
