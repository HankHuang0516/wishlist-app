// Local test infrastructure only. No store build, credential or device changes.
const { fork } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

function qaEnvironment(databaseUrl, lifetimeSeconds = 300, inherited = process.env,
  { listingAiPilot = false, externalListingsPilot = false } = {}) {
  assertTestDatabase(databaseUrl);
  if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > 600) throw new Error('QA lifetime must be 1–600 seconds');
  // Deliberately do NOT spread process.env: no Railway/admin/provider/signing
  // values, NODE_OPTIONS, PGHOST or dotenv configuration can enter this child.
  return {
    PATH: inherited.PATH || '/usr/bin:/bin',
    NODE_ENV: 'test', TZ: 'Asia/Taipei',
    TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(32).toString('hex'),
    NATIVE_QA_LIFETIME_SECONDS: String(lifetimeSeconds),
    ...(listingAiPilot ? { NATIVE_QA_LISTING_AI_PILOT: '1' } : {}),
    ...(externalListingsPilot ? { NATIVE_QA_EXTERNAL_LISTINGS_PILOT: '1' } : {}),
  };
}

async function startNativeQa(databaseUrl, lifetimeSeconds = 300, options = {}) {
  const child = fork(path.join(__dirname, 'native-qa-worker.cjs'), [], {
    env: qaEnvironment(databaseUrl, lifetimeSeconds, process.env, options),
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let summary;
  const requestStop = () => {
    if (child.connected) { try { child.send({ kind: 'stop' }, () => undefined); } catch { /* Await authoritative exit below. */ } }
  };
  const exited = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('QA process unavailable; details withheld')));
    child.once('exit', code => code === 0 && summary
      ? resolve(summary) : reject(new Error('QA lifecycle or fixture cleanup failed; details withheld')));
  });
  // Attach immediately so a failure before readiness cannot be unhandled.
  exited.catch(() => undefined);
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requestStop();
      reject(new Error('QA startup timed out; details withheld'));
    }, 30_000);
    child.on('message', message => {
      if (message?.kind === 'ready') { clearTimeout(timer); resolve(message); }
      if (message?.kind === 'stopped') summary = message.summary;
      if (message?.kind === 'failed') {
        clearTimeout(timer);
        // Enum stage and environment NAMES only, never values or raw exceptions.
        const stages = ['launch-guard', 'private-storage', 'module-express', 'module-jwt', 'module-bcrypt', 'module-prisma', 'schema-preflight',
          'module-jwt-config', 'module-listing-rules', 'module-account-erasure', 'module-listing-storage', 'listing-storage-ready',
          'synthetic-seed', 'actual-routes', 'loopback-listener'];
        const stage = stages.includes(message.stage) ? message.stage : 'cleanup';
        const names = Array.isArray(message.unexpectedEnvironmentNames)
          ? message.unexpectedEnvironmentNames.filter(name => typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(name)).join(',') : '';
        reject(new Error('QA failed at ' + stage + (names ? '; unexpected environment names: ' + names : '') + '; values withheld'));
      }
    });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('QA stopped before readiness; details withheld')); });
    child.once('error', () => { clearTimeout(timer); reject(new Error('QA process unavailable; details withheld')); });
  });
  let fixture;
  try { fixture = await ready; }
  catch (failure) {
    requestStop();
    await exited.catch(() => undefined);
    throw failure;
  }
  if (options.listingAiPilot && (typeof fixture.callbackToken !== 'string' || !/^[0-9a-f]{64}$/.test(fixture.callbackToken))) {
    requestStop();
    await exited.catch(() => undefined);
    throw new Error('QA worker capability missing; details withheld');
  }
  // Actors are synthetic credentials carried only over private IPC and held in
  // the caller's memory. Never serialize this object into a QA report/screenshot.
  return {
    apiUrl: fixture.apiUrl, runId: fixture.runId, actors: fixture.actors,
    ...(options.listingAiPilot ? { callbackToken: fixture.callbackToken } : {}),
    async stop() {
      if (child.exitCode === null) requestStop();
      return exited;
    },
    exited,
  };
}
module.exports = { qaEnvironment, startNativeQa };
