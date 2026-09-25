// Preserve only the native QA harness's public stage enum. Never serialize
// exception details, environment names or credential-bearing input.
const stages = new Set(['launch-guard', 'private-storage', 'module-express', 'module-jwt', 'module-bcrypt',
  'module-prisma', 'schema-preflight', 'module-jwt-config', 'module-listing-rules',
  'module-account-erasure', 'module-listing-storage', 'listing-storage-ready',
  'synthetic-seed', 'actual-routes', 'loopback-listener', 'cleanup']);

function nativeQaFailureCode(error) {
  const message = error instanceof Error ? error.message : '';
  if (/^QA_[A-Z0-9_]+$/.test(message)) return message;
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
