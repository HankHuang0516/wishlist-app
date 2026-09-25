// Preserve only the native QA harness's public stage enum. Never serialize
// exception details, environment names or credential-bearing input.
const stages = new Set(['launch-guard', 'private-storage', 'module-express', 'module-jwt', 'module-bcrypt',
  'module-prisma', 'schema-preflight', 'module-jwt-config', 'module-listing-rules',
  'module-account-erasure', 'module-listing-storage', 'listing-storage-ready',
  'synthetic-seed', 'actual-routes', 'loopback-listener', 'cleanup']);
const smokeCodes = new Set([
  'QA_ACTOR_LOGIN', 'QA_AI_CALLBACK_MISSING', 'QA_AI_DRAFT_UNGROUNDED', 'QA_AI_JOB_MISMATCH',
  'QA_AI_NOT_QUEUED', 'QA_APK_PROVENANCE', 'QA_CLOSE_MISSING', 'QA_CONTROL_BOUNDS',
  'QA_CONTROL_MISSING', 'QA_DEVICE_SIZE', 'QA_EDITOR_CLOSED_UNEXPECTEDLY', 'QA_EDIT_PRIVATE_MEDIA',
  'QA_FIXTURE_CHANGED', 'QA_LOGIN_INPUT', 'QA_METRO_OCCUPIED', 'QA_METRO_UNAVAILABLE',
  'QA_NATIVE_EDIT_NOT_RESTORED', 'QA_NATIVE_EDIT_NOT_SAVED', 'QA_NATIVE_FIRST_NOT_RESTORED',
  'QA_NATIVE_PRICE_MISSING', 'QA_NATIVE_SECOND_AI_MISSING', 'QA_NATIVE_SECOND_NOT_RESTORED',
  'QA_PACKAGE_NOT_OWNED', 'QA_PICKER_CONFIRM_MISSING', 'QA_PICKER_FIXTURE_NOT_VISIBLE',
  'QA_PICKER_LAYOUT_CHANGED', 'QA_PRECONFIRM_PUBLICATION', 'QA_PRIVATE_IMAGE_ACCESS',
  'QA_PUBLICATION_IMAGE_ACCESS', 'QA_PUBLICATION_PRIVACY_OR_EXPIRY', 'QA_PUBLISH_EDITOR_CLOSED',
  'QA_PUBLISH_INPUT_MISSING', 'QA_REOPEN_MISSING', 'QA_REVERSE_OCCUPIED', 'QA_SCROLLED_CONTROL_MISSING',
  'QA_SECOND_FIXTURE_CHANGED', 'QA_SELLER_DRAFT_INCOMPLETE', 'QA_SHOT_NAME',
  'QA_TOO_MANY_PUBLIC_LISTINGS', 'QA_UNCONFIRMED_ITEM_NOT_PRIVATE', 'QA_UNEXPECTED_PRIVATE_MEDIA',
  'QA_UPLOADED_PHOTO_MISMATCH', 'QA_UPLOAD_MISSING', 'QA_VISIBLE_CONTROL_MISSING',
  'QA_WRONG_ITEM_PUBLISHED',
]);

function nativeQaFailureCode(error) {
  const message = error instanceof Error ? error.message : '';
  if (smokeCodes.has(message) || /^QA_(?:HTTP|AI_CLAIM)_[1-5]\d{2}$/.test(message)) return message;
  const failed = /^QA failed at ([a-z-]+)(?:; unexpected environment names: [A-Za-z0-9_,]+)?; values withheld$/.exec(message);
  if (failed && stages.has(failed[1])) return 'QA_FIXTURE_' + failed[1].replace(/-/g, '_').toUpperCase();
  const fixed = {
    'QA startup timed out; details withheld': 'QA_FIXTURE_STARTUP_TIMEOUT',
    'QA stopped before readiness; details withheld': 'QA_FIXTURE_STOPPED_EARLY',
    'QA worker capability missing; details withheld': 'QA_FIXTURE_CAPABILITY_MISSING',
    'QA lifecycle or fixture cleanup failed; details withheld': 'QA_FIXTURE_LIFECYCLE',
    'QA process unavailable; details withheld': 'QA_FIXTURE_PROCESS_UNAVAILABLE',
  };
  return fixed[message] || 'QA_ASSERTION_FAILED';
}

module.exports = { nativeQaFailureCode };
