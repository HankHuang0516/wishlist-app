'use strict';
const crypto = require('node:crypto');
const QUESTION_ACTIONS = new Set(['ASK', 'REVISE', 'REOPEN']);
const EVENT_ACTIONS = new Set([...QUESTION_ACTIONS, 'CONSENT', 'CANCEL', 'SELLER_REPLY']);
function questionView(room) {
  if (!Array.isArray(room.events) || !room.source || typeof room.source.canonicalUrl !== 'string') throw Error('INVALID_INQUIRY');
  let start = 0;
  for (const [index, event] of room.events.entries()) {
    if (!event || !EVENT_ACTIONS.has(event.action)) throw Error('UNKNOWN_INQUIRY_ACTION');
    if (QUESTION_ACTIONS.has(event.action) && (typeof event.requestId !== 'string' || typeof event.text !== 'string' || !event.text.trim() || event.text.length > 1500)) throw Error('INVALID_QUESTION');
    if (event.action === 'CANCEL') start = index + 1;
    if (event.action === 'REVISE' || event.action === 'REOPEN') start = index;
  }
  const history = room.delivery?.history ?? [];
  if (!Array.isArray(history) || history.some(round => !round?.reservation || !round.receipt || !Array.isArray(round.reservation.questionIds))) throw Error('UNBOUND_DELIVERY_HISTORY');
  const consumed = new Set(history.flatMap(round => round.reservation.questionIds));
  const questions = ['CANCELLED', 'CANCEL_REQUESTED', 'DELIVERY_REQUIRES_REVIEW'].includes(room.state) ? [] : room.events.slice(start).filter(e => QUESTION_ACTIONS.has(e.action) && !consumed.has(e.requestId));
  const allQuestions = room.events.filter(e => QUESTION_ACTIONS.has(e.action));
  const scope = { roomId: room.id, leadId: room.leadId, buyerUserId: room.buyerUserId, leadContentHash: room.leadContentHash, sourceContentHash: room.source.contentHash, consentHash: room.consentHash ?? null, postUrl: room.source.canonicalUrl, questions: questions.map(e => ({ requestId: e.requestId, text: e.text })) };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  return { questions, allQuestions, scope, fingerprint };
}
function resetDecision(entry, reason, now) {
  if (entry.status !== 'PENDING_APPROVAL') {
    entry.previousDecisions = [...(entry.previousDecisions ?? []), { status: entry.status, approvedAt: entry.approvedAt, approvedFor: entry.approvedFor, approvedFingerprint: entry.approvedFingerprint, ignoredAt: entry.ignoredAt, questionFingerprint: entry.questionFingerprint, supersededAt: now, reason }];
  }
  entry.status = 'PENDING_APPROVAL'; entry.queuedAt = now; entry.approvalResetReason = reason;
  delete entry.approvedAt; delete entry.approvedFor; delete entry.approvedFingerprint;
}
function syncEntry(entry, room, now = new Date().toISOString()) {
  const view = questionView(room);
  if (entry.questionFingerprint && entry.questionFingerprint !== view.fingerprint) resetDecision(entry, 'CURRENT_QUESTIONS_CHANGED', now);
  if (entry.status === 'APPROVED' && entry.approvedFingerprint !== view.fingerprint) resetDecision(entry, 'UNBOUND_OR_STALE_APPROVAL', now);
  if (entry.status === 'IGNORED' && !entry.questionFingerprint) {
    const ignoredAt = Date.parse(entry.ignoredAt);
    if (view.questions.some(e => Number.isFinite(ignoredAt) && Date.parse(e.at) > ignoredAt)) resetDecision(entry, 'NEW_QUESTION_AFTER_IGNORE', now);
  }
  if (room.state === 'WAITING_ROUTE' && !['PENDING_APPROVAL', 'APPROVED', 'IGNORED'].includes(entry.status)) resetDecision(entry, 'NEW_OUTBOUND_ROUND', now);
  Object.assign(entry, { questionFingerprint: view.fingerprint, title: room.source.title, postUrl: room.source.canonicalUrl, state: room.state, questions: view.questions.length, questionEvents: view.allQuestions.length, replies: room.events.filter(e => e.action === 'SELLER_REPLY').length });
  return view;
}
function assertCurrentApproval(entry, room) {
  const view = questionView(room);
  if (!entry || entry.status !== 'APPROVED' || entry.approvedFor !== room.source.canonicalUrl || entry.approvedFingerprint !== view.fingerprint || !view.questions.length || room.state !== 'WAITING_ROUTE') throw Error('HANK_APPROVAL_REQUIRED_FOR_CURRENT_QUESTIONS');
  return view;
}
function assertPreparedQuestions(view, prepared, preflight) {
  for (const response of [prepared, preflight]) {
    const snapshot = response?.snapshot;
    if (!snapshot || snapshot.leadId !== view.scope.leadId || snapshot.contentHash !== view.scope.sourceContentHash || snapshot.canonicalUrl !== view.scope.postUrl || JSON.stringify(response.outboundQuestions) !== JSON.stringify(view.scope.questions)) throw Error('APPROVED_QUESTIONS_CHANGED_STOP_NO_SEND');
  }
  if (!prepared.reservation || !preflight.reservation || prepared.reservation.id !== preflight.reservation.id || prepared.reservation.payloadHash !== view.scope.consentHash || preflight.reservation.payloadHash !== view.scope.consentHash) throw Error('APPROVED_QUESTIONS_CHANGED_STOP_NO_SEND');
}
module.exports = { questionView, syncEntry, assertCurrentApproval, assertPreparedQuestions };
