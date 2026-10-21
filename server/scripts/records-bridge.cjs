'use strict';
// Operator CLI. plan is offline; dry-run reads existing records only; apply saves PRIVATE_PENDING drafts.
//   node scripts/records-bridge.cjs plan DAILY.csv [NOTES.csv]
//   ADMIN_API_KEY=... node scripts/records-bridge.cjs dry-run|apply|verify DAILY.csv NOTES.csv PRIVATE_DIR ORIGIN
const fs = require('node:fs'), path = require('node:path');
const { buildPlan, runBridge, verifyReadback } = require('./records-bridge-core.cjs');
const PRODUCTION = 'https://wishlist-app-production.up.railway.app';
const fail = code => { const e = new Error(code); e.safeCode = code; throw e; };

function journalAt(directory, jobId) {
  const dir = path.resolve(directory);
  const st = fs.existsSync(dir) ? fs.lstatSync(dir) : null;
  if (!st || st.isSymbolicLink() || !st.isDirectory() || (st.mode & 0o777) !== 0o700 || st.uid !== process.getuid() || fs.realpathSync(dir) !== dir) fail('PRIVATE_RECEIPT_DIRECTORY_REQUIRED');
  const file = path.join(dir, jobId + '.json');
  const sync = f => { const fd = fs.openSync(f, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };
  return {
    load() { if (!fs.existsSync(file)) return null; const s = fs.lstatSync(file); if (!s.isFile() || s.isSymbolicLink() || (s.mode & 0o777) !== 0o600) fail('PRIVATE_RECEIPT_REQUIRED'); return JSON.parse(fs.readFileSync(file, 'utf8')); },
    begin(state) { fs.writeFileSync(file, JSON.stringify(state), { flag: 'wx', mode: 0o600 }); sync(file); sync(dir); },
    save(state) { const tmp = file + '.next'; if (fs.existsSync(tmp)) fs.unlinkSync(tmp); fs.writeFileSync(tmp, JSON.stringify(state), { flag: 'wx', mode: 0o600 }); sync(tmp); fs.renameSync(tmp, file); sync(dir); },
  };
}

function client(origin, key) {
  const local = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(origin);
  if (origin !== PRODUCTION && !(local && +local[1] > 0 && +local[1] < 65536)) fail('ORIGIN_NOT_ALLOWED');
  if (typeof key !== 'string' || !key || key.length > 4096) fail('ADMIN_CREDENTIAL_UNAVAILABLE');
  return async (method, route, body) => {
    let res;
    try { res = await fetch(origin + '/api/source-lead-admin/records' + route, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'x-admin-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
    catch { fail('HTTP_FAILED'); }
    const text = await res.text();
    if (text.length > 1024 * 1024) fail('HTTP_RESPONSE_TOO_LARGE');
    let json; try { json = JSON.parse(text); } catch { fail('HTTP_FAILED'); }
    if (res.status === 409) { const e = new Error('HTTP_409'); e.safeCode = 'HTTP_409'; e.errorCode = typeof json.errorCode === 'string' ? json.errorCode.slice(0, 80) : null; throw e; }
    if (res.status !== 200) fail('HTTP_' + res.status);
    return json;
  };
}

async function listRecords(call, wait) {
  const records = []; let cursor = null;
  for (let page = 0; page < 1000; page++) {
    const r = await call('GET', '?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    if (!Array.isArray(r.items)) fail('LIST_RESPONSE_INVALID');
    records.push(...r.items);
    if (!r.nextCursor) return records;
    cursor = r.nextCursor; await wait();
  }
  fail('LIST_TOO_LONG');
}

async function main() {
  const [mode, csvFile, notesFile, dir, origin] = process.argv.slice(2);
  const importer = require('../dist/lib/semiAutoImport');
  const plan = buildPlan({ csvText: fs.readFileSync(csvFile, 'utf8'), notesText: notesFile ? fs.readFileSync(notesFile, 'utf8') : null, importer, now: new Date() });
  if (mode === 'plan') return console.log(JSON.stringify({ state: 'PLANNED', jobId: plan.jobId, planSha: plan.planSha, total: plan.total, batches: plan.batches.length, skipped: plan.skipped, written: 0 }));
  if (!['dry-run', 'apply', 'verify'].includes(mode) || !dir || !origin) fail('USAGE');
  // Admin routes allow 30 requests per minute.
  const wait = () => new Promise(r => setTimeout(r, 2200));
  const call = client(origin, process.env.ADMIN_API_KEY);
  const records = await listRecords(call, wait);
  if (mode === 'verify') { const v = verifyReadback(plan, records); console.log(JSON.stringify(v)); if (v.state !== 'READBACK_PASSED') process.exitCode = 1; return; }
  const existing = new Set(records.map(r => r.archiveItemId));
  const result = await runBridge({ plan, mode, existing, wait, journal: journalAt(dir, plan.jobId), transport: body => call('POST', '/save', body) });
  console.log(JSON.stringify(result));
  if (result.state === 'STOPPED') process.exitCode = 1;
}
// Never print supplied rows, credentials, response bodies or stacks.
main().catch(e => { console.log(JSON.stringify({ state: 'STOPPED', errorCode: e.safeCode || 'BRIDGE_SETUP_FAILED' })); process.exitCode = 1; });
