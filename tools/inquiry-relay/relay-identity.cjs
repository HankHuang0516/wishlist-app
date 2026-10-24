'use strict';
const fs = require('node:fs');
const PAGE_ID = '100053445261716', PAGE_NAME = '兩隻小豬';
const PROFILE_URL = 'https://www.facebook.com/twopiggyhavefun/';
function assertIdentity(identity) {
  if (!identity || identity.actingPageId !== PAGE_ID || identity.actingPageName !== PAGE_NAME || identity.profileUrl !== PROFILE_URL || identity.channel !== 'FACEBOOK_UI' || identity.routeKind !== 'PUBLIC_COMMENT' || identity.requiresNormalUiAndReadback !== true) throw Error('RELAY_IDENTITY_MISMATCH_STOP_NO_SEND');
  return identity;
}
function assertActiveRoute(route, postUrl) {
  if (!route || route.actingPageId !== PAGE_ID || route.routeKind !== 'PUBLIC_COMMENT' || route.channel !== 'FACEBOOK_UI' || route.publicRouteUrl !== postUrl || route.sourceUrl !== postUrl) throw Error('RELAY_ROUTE_IDENTITY_MISMATCH_STOP_NO_SEND');
}
function assertPreparedIdentity(prepared, preflight, postUrl) {
  for (const response of [prepared, preflight]) {
    assertActiveRoute(response?.route, postUrl);
    const comment = assertIdentity(response?.publicComment);
    if (comment.postUrl !== postUrl || comment.buyerTextIncluded !== false || typeof comment.text !== 'string' || !comment.text || comment.text !== prepared?.publicComment?.text) throw Error('PUBLIC_COMMENT_BINDING_MISMATCH_STOP_NO_SEND');
  }
  return preflight.publicComment;
}
function assertNoRejectedSend(file, roomId) {
  let blockers;
  try { blockers = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return; throw Error('OUTBOUND_BLOCKERS_UNREADABLE_STOP_NO_SEND'); }
  if (!blockers || Array.isArray(blockers) || typeof blockers !== 'object') throw Error('OUTBOUND_BLOCKERS_UNREADABLE_STOP_NO_SEND');
  if (Object.prototype.hasOwnProperty.call(blockers, roomId) && blockers[roomId]?.mustNotResend === true) throw Error('EXTERNAL_COMMENT_REJECTED_REQUIRES_HANK_NO_RESEND');
}
module.exports = { PAGE_ID, PAGE_NAME, PROFILE_URL, assertIdentity, assertActiveRoute, assertPreparedIdentity, assertNoRejectedSend };
