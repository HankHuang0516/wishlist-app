'use strict';
const crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = code => { const e = new Error(code); e.safeCode = code; throw e; };
const exact = (x, keys) => { if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some(k => !keys.includes(k))) fail('INVALID_INPUT'); };
const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
function prepare({archiveBytes, payloadBytes, policy, parseLead, now}) {
  if (!policy || policy.allowWrite !== true || !/^[a-z0-9-]{4,80}$/.test(policy.jobId)) fail('JOB_NOT_APPROVED');
  if (!(now instanceof Date) || !Number.isFinite(+now) || +now < Date.parse(policy.notBefore) || +now > Date.parse(policy.expiresAt) || !Number.isFinite(Date.parse(policy.notBefore)) || !Number.isFinite(Date.parse(policy.expiresAt))) fail('JOB_EXPIRED');
  if (archiveBytes.length > 20*1024*1024 || payloadBytes.length > 10*1024*1024) fail('INPUT_TOO_LARGE');
  if (hash(archiveBytes) !== policy.archiveSha256 || hash(payloadBytes) !== policy.payloadSha256) fail('HASH_MISMATCH');
  let archive, payload;
  try { archive = JSON.parse(archiveBytes); payload = JSON.parse(payloadBytes); } catch { fail('INVALID_JSON'); }
  exact(payload, ['items', 'dryRun']);
  if (payload.dryRun !== true || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 1000) fail('INVALID_BATCH');
  if (!Array.isArray(archive.items) || !Array.isArray(policy.items) || policy.items.length !== payload.items.length) fail('ALLOWLIST_MISMATCH');
  const pins = new Map(policy.items.map(x => [x.archiveItemId,x]));
  if (pins.size !== policy.items.length || new Set(payload.items.map(x=>x.archiveItemId)).size !== payload.items.length) fail('DUPLICATE_ID');
  for (const item of payload.items) {
    const pin = pins.get(item.archiveItemId), original = archive.items.filter(x=>x.id === item.archiveItemId);
    if (!pin || original.length !== 1 || pin.canonicalUrl !== item.canonicalUrl || pin.checkedAt !== item.checkedAt || hash(Buffer.from(JSON.stringify(item))) !== pin.itemSha256) fail('ITEM_BINDING_MISMATCH');
    const observed = original[0].current_source_check;
    if (!observed || observed.status !== 'read_original_post' || observed.checked_at_utc !== pin.checkedAt || observed.source_url !== item.canonicalUrl || original[0].stock_status !== 'unknown' || original[0].qualified !== false) fail('SOURCE_OBSERVATION_REQUIRED');
    if (item.libraryFileId !== policy.libraryFileId || item.archiveVersion !== policy.archiveVersion || item.archiveSha256 !== policy.archiveSha256) fail('ARCHIVE_BINDING_MISMATCH');
    try { parseLead(item, now); } catch { fail('IMPORT_RULE_REJECTED'); }
  }
  const batches=[];for(let i=0;i<payload.items.length;i+=20)batches.push(payload.items.slice(i,i+20));
  return batches;
}
async function runJob(options) {
  const {policy, journal, transport, wait = async()=>{}, now = ()=>new Date(), parseLead} = options;
  let state;
  try {
    const batches=prepare({...options, now:now()});
    // begin is an exclusive, durable create; every existing job refuses replay.
    const initial={jobId:policy.jobId,archiveSha256:policy.archiveSha256,payloadSha256:policy.payloadSha256,state:'STARTED',qualifiedSupplyAdded:0,batches:[]};
    try{journal.begin(initial);}catch{fail('JOURNAL_UNAVAILABLE_OR_JOB_ALREADY_STARTED');}
    state=initial;
    for(let i=0;i<batches.length;i++) {
      let response;
      try { response=await transport({items:batches[i],dryRun:true}); } catch { fail('DRY_RUN_FAILED'); }
      if(response?.validatedCount!==batches[i].length || response.persistedCount!==0 || response.qualifiedSupplyCount!==0) fail('DRY_RUN_ACK_INVALID');
      state.batches.push({index:i,archiveItemIds:batches[i].map(x=>x.archiveItemId),state:'DRY_RUN_PASSED'});journal.save(state);await wait();
    }
    for(let i=0;i<batches.length;i++) {
      // Revalidate age immediately before each write; never refresh timestamps.
      if(+now()>Date.parse(policy.expiresAt))fail('JOB_EXPIRED');
      for(const item of batches[i])try{parseLead(item,now());}catch{fail('IMPORT_RULE_REJECTED');}
      state.batches[i].state='APPLY_STARTED';journal.save(state);
      let response;
      try { response=await transport({items:batches[i],dryRun:false}); } catch { state.batches[i].state='UNKNOWN_NO_RETRY';fail('WRITE_RESULT_UNKNOWN'); }
      if(response?.validatedCount!==batches[i].length || response.persistedCount!==batches[i].length || response.qualifiedSupplyCount!==0 || !Array.isArray(response.ids) || response.ids.length!==batches[i].length || !response.ids.every(uuid) || new Set(response.ids).size!==response.ids.length) {state.batches[i].state='UNKNOWN_NO_RETRY';fail('WRITE_ACK_INVALID');}
      const earlier=state.batches.flatMap(x=>x.ids??[]);if(response.ids.some(x=>earlier.includes(x))){state.batches[i].state='UNKNOWN_NO_RETRY';fail('WRITE_ACK_INVALID');}
      state.batches[i].ids=response.ids;state.batches[i].state='ACKNOWLEDGED_REQUIRES_READBACK';journal.save(state);await wait();
    }
    state.state='APPLIED_REQUIRES_READBACK';journal.save(state);return state;
  } catch (error) {
    const code=error.safeCode??'SYNC_FAILED';
    if(state){state.state='STOPPED';state.errorCode=code;try{journal.save(state);}catch{}}
    // Never surface supplied input, credentials, response bodies or stacks.
    return {state:'STOPPED',errorCode:code,qualifiedSupplyAdded:0};
  }
}
module.exports={prepare,runJob,hash};
