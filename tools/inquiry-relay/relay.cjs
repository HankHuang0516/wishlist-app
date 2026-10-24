'use strict';
// Buyer inquiry relay through the existing admin API. Every outbound FB comment needs Hank's approval first.
// Route: 兩隻小豬 comments on the original group post (PUBLIC_COMMENT). The server fixes the comment
// text and never includes the buyer's words or account details; the seller's reply is recorded back to the buyer.
//
//   list                         current questions after withdrawal/correction; refreshes approval fingerprints
//   identity                     read-only server/client identity compatibility; no queue or inquiry writes
//   approve ROOM_ID              only on Hank's explicit approval (in chat, or Hank runs it himself)
//   ignore ROOM_ID               Hank said not to relay (e.g. a test); hidden until the buyer asks again
//   route ROOM_ID                record the public-comment route (no outbound); valid 24h
//   prepare ROOM_ID              approved rooms only: reserve (expires in 120s) + preflight, print the exact comment
//   delivered ROOM_ID SENT_AT    after the comment was posted and read back in the normal FB UI
//   reply ROOM_ID RECEIVED_AT TEXT   seller's reply (no phone/LINE/links), within 48h of receipt
//   issue ROOM_ID CHECKED_AT COMMENT_ID   record an observed FB rejection; no external send, no seller reply
// usage: ADMIN_API_KEY=... node relay.cjs COMMAND ... [--origin URL]
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { questionView, syncEntry, assertCurrentApproval, assertPreparedQuestions } = require('./inquiry-questions.cjs');
const { PAGE_ID, PAGE_NAME, assertIdentity, assertActiveRoute, assertPreparedIdentity, assertNoRejectedSend } = require('./relay-identity.cjs');
const args = process.argv.slice(2), oi = args.indexOf('--origin');
const ORIGIN = oi >= 0 ? args.splice(oi, 2)[1] : (process.env.WISHLIST_ORIGIN || 'https://wishlist-app-production.up.railway.app');
const [cmd, roomId, ...rest] = args, key = process.env.ADMIN_API_KEY;
const DIR = path.join(__dirname, '..', 'relay', new URL(ORIGIN).hostname), QUEUE = path.join(DIR, 'queue.json');
const BLOCKERS = path.join(__dirname, '..', 'runs', 'relay-outbound-blockers.json');
const wait = () => new Promise(r => setTimeout(r, 2300));
async function call(method, route, body) {
  const res = await fetch(ORIGIN + '/api/source-lead-admin' + route, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'x-admin-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({})); await wait(); return { status: res.status, json };
}
let loadedBody;
const load = () => {
  try { loadedBody = fs.readFileSync(QUEUE, 'utf8'); return JSON.parse(loadedBody); }
  catch (error) { if (error.code !== 'ENOENT') throw Error('QUEUE_READ_FAILED_PRESERVED'); loadedBody = null; return {}; }
};
const save = q => {
  fs.mkdirSync(DIR, { recursive: true });
  const current = () => { try { return fs.readFileSync(QUEUE, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  if (current() !== loadedBody) throw Error('QUEUE_CHANGED_RETRY_READ_ONLY_LIST');
  const body = JSON.stringify(q, null, 1), temporary = QUEUE + '.writing-' + crypto.randomUUID();
  try { fs.writeFileSync(temporary, body, { mode: 0o600 }); if (current() !== loadedBody) throw Error('QUEUE_CHANGED_RETRY_READ_ONLY_LIST'); fs.renameSync(temporary, QUEUE); loadedBody = body; }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
};
async function rooms() { const all = []; let cursor = null; do { const r = await call('GET', '/inquiries' + (cursor ? '?cursor=' + cursor : '')); if (r.status !== 200) throw Error('HTTP_' + r.status); all.push(...r.json.items); cursor = r.json.nextCursor; } while (cursor); return all; }
async function room(id) { const r = (await rooms()).find(x => x.id === id); if (!r) throw Error('ROOM_NOT_FOUND'); return r; }
const iso = s => { if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s || '') || Date.parse(s) > Date.now()) throw Error('BAD_TIME'); return s; };
const out = v => console.log(JSON.stringify(v, null, 1));
(async () => {
  if (!key) throw Error('KEY_MISSING');
  if (cmd === 'identity') {
    const result = await call('GET', '/relay-identity');
    if (result.status !== 200) throw Error('RELAY_IDENTITY_CHECK_HTTP_' + result.status);
    return out({ compatible: true, ...assertIdentity(result.json), outboundSent: false });
  }
  if (['approve', 'route', 'prepare', 'delivered'].includes(cmd)) assertNoRejectedSend(BLOCKERS, roomId);
  const q = load();
  if (cmd === 'list') {
    const items = [];
    for (const r of await rooms()) {
      const replies = r.events.filter(e => e.action === 'SELLER_REPLY');
      const entry = q[r.id] || (q[r.id] = { status: 'PENDING_APPROVAL', queuedAt: new Date().toISOString() });
      const view = syncEntry(entry, r);
      items.push({ roomId: r.id, state: r.state, approval: entry.status, title: r.source.title, postUrl: r.source.canonicalUrl, buyerUserId: r.buyerUserId, questions: view.questions.map(e => e.text), questionIds: view.questions.map(e => e.requestId), questionFingerprint: view.fingerprint, historicalQuestionCount: view.allQuestions.length - view.questions.length, questionSelection: 'CURRENT_OUTBOUND_ROUND', sellerReplies: replies.map(e => e.text), route: r.source.contactRouting.status, delivered: !!(r.delivery && r.delivery.receipt) });
    }
    save(q); return out({ origin: ORIGIN, rooms: items.length, needApproval: items.filter(i => i.approval === 'PENDING_APPROVAL' && i.state === 'WAITING_ROUTE' && i.questions.length > 0).length, items });
  }
  if (!/^[0-9a-f-]{36}$/.test(roomId || '')) throw Error('USAGE');
  const r = await room(roomId), lead = r.source;
  if (cmd === 'issue') {
    const v = q[roomId]?.reservation; if (!v) throw Error('NO_RESERVATION');
    const checkedAt = iso(rest[0]), commentId = rest[1]; if (!/^\d+$/.test(commentId || '')) throw Error('BAD_COMMENT_ID');
    const existing = q[roomId].transferIssue || q[roomId].issueAttempt;
    const body = existing || { requestId: crypto.randomUUID(), reservationId: v.id, leadId: v.leadId, sourceUrl: v.sourceUrl, actingPageId: lead.sellerRoute?.actingPageId, commentId, checkedAt, code: 'FACEBOOK_COMMENT_REJECTED' };
    if (body.commentId !== commentId || body.checkedAt !== checkedAt) throw Error('TRANSFER_ISSUE_ALREADY_RECORDED');
    q[roomId].issueAttempt = body; save(q);
    const result = await call('POST', '/inquiries/' + roomId + '/transfer-issue', body);
    if (result.status !== 200) throw Error('TRANSFER_ISSUE_HTTP_' + result.status + ':' + (result.json.errorCode || 'UNKNOWN'));
    q[roomId].transferIssue = body; q[roomId].status = 'NEEDS_REVIEW'; delete q[roomId].issueAttempt; save(q);
    return out({ roomId, state: result.json.state, transferIssue: result.json.transferIssue, delivered: result.json.delivered, outboundSent: false });
  }
  if (cmd === 'ignore') { const view = questionView(r); q[roomId] = { ...(q[roomId] || {}), status: 'IGNORED', ignoredAt: new Date().toISOString(), ignoredQuestions: view.allQuestions.length, questionFingerprint: view.fingerprint }; save(q); return out({ roomId, ignored: true, questions: view.questions.map(e => e.text), questionFingerprint: view.fingerprint }); }
  if (cmd === 'approve') { const view = questionView(r); if (!q[roomId] || q[roomId].questionFingerprint !== view.fingerprint) throw Error('CURRENT_QUESTIONS_CHANGED_RELIST_AND_RECONFIRM'); if (r.state !== 'WAITING_ROUTE' || !view.questions.length) throw Error('NO_CURRENT_QUESTION_TO_APPROVE'); q[roomId] = { ...(q[roomId] || {}), status: 'APPROVED', approvedAt: new Date().toISOString(), approvedFor: lead.canonicalUrl, questionFingerprint: view.fingerprint, approvedFingerprint: view.fingerprint }; save(q); return out({ roomId, approved: true, questions: view.questions.map(e => e.text), questionFingerprint: view.fingerprint }); }
  if (cmd === 'route') {
    const res = await call('POST', '/' + lead.id + '/seller-route', { leadId: lead.id, contentHash: lead.contentHash, sourceUrl: lead.canonicalUrl, channel: 'FACEBOOK_UI', publicRouteUrl: lead.canonicalUrl,
      identityEvidenceRef: 'source:fb-post-author/' + lead.archiveItemId, routeEvidenceRef: 'source:fb-public-comment/' + lead.archiveItemId + '/' + Date.now(), confirmOriginalSeller: true, routeKind: 'PUBLIC_COMMENT', actingPageId: PAGE_ID });
    return out({ roomId, status: res.status, ...res.json });
  }
  if (cmd === 'prepare') {
    const entry = q[roomId];
    const approved = assertCurrentApproval(entry, r);
    assertActiveRoute(lead.sellerRoute, lead.canonicalUrl);
    const prep = await call('POST', '/inquiries/' + roomId + '/prepare-transfer', { requestId: crypto.randomUUID() });
    if (prep.status !== 200) return out({ roomId, step: 'PREPARE', status: prep.status, errorCode: prep.json.errorCode }), process.exitCode = 1;
    const pre = await call('GET', '/inquiries/' + roomId + '/transfer-preflight');
    if (pre.status !== 200 || !pre.json.publicComment) return out({ roomId, step: 'PREFLIGHT', status: pre.status, errorCode: pre.json.errorCode || 'NOT_PUBLIC_COMMENT_ROUTE' }), process.exitCode = 1;
    assertPreparedQuestions(approved, prep.json, pre.json);
    const comment = assertPreparedIdentity(prep.json, pre.json, lead.canonicalUrl);
    entry.reservation = pre.json.reservation; entry.status = 'RESERVED'; save(q);
    return out({ roomId, postUrl: comment.postUrl, actingPageId: comment.actingPageId, commentAs: PAGE_NAME + ' (' + PAGE_ID + ')', commentText: comment.text, expiresAt: pre.json.reservation.expiresAt });
  }
  if (cmd === 'delivered') {
    const v = (q[roomId] || {}).reservation; if (!v) throw Error('NO_RESERVATION');
    const sentAt = iso(rest[0]);
    const res = await call('POST', '/inquiries/' + roomId + '/delivery', { requestId: crypto.randomUUID(), reservationId: v.id, payloadHash: v.payloadHash, routeHash: v.routeHash, leadId: v.leadId, sourceUrl: v.sourceUrl, channel: v.channel,
      receiptRef: 'source:fb-page-comment/' + lead.archiveItemId + '/' + sentAt.replace(/[-:]/g, ''), sentAt, outcome: 'CONFIRMED_SENT' });
    if (res.status === 200) { q[roomId].status = 'DELIVERED'; q[roomId].delivery = { reservationId: v.id, routeHash: v.routeHash, sentAt }; save(q); }
    return out({ roomId, status: res.status, state: res.json.state, errorCode: res.json.errorCode });
  }
  if (cmd === 'reply') {
    const d = (q[roomId] || {}).delivery; if (!d) throw Error('NOT_DELIVERED');
    const receivedAt = iso(rest[0]), text = rest.slice(1).join(' ').trim(); if (!text) throw Error('USAGE');
    const res = await call('POST', '/inquiries/' + roomId + '/seller-reply', { requestId: crypto.randomUUID(), leadId: lead.id, sourceUrl: lead.canonicalUrl, routeHash: d.routeHash, reservationId: d.reservationId, text,
      receiptRef: 'source:fb-seller-reply/' + lead.archiveItemId + '/' + receivedAt.replace(/[-:]/g, ''), receivedAt });
    if (res.status === 200) { q[roomId].status = 'REPLIED'; save(q); }
    return out({ roomId, status: res.status, errorCode: res.json.errorCode });
  }
  throw Error('USAGE');
})().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exitCode = 1; });
