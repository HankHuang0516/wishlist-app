const path = require('node:path');
const ORIGINAL_PACKAGE = 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1';
const METRO_PORT = 18887;
function qaLabel(value) {
  if (typeof value !== 'string' || !/^[0-9]{12}$/.test(value)) throw new Error('QA label must be an explicit unique YYYYMMDDHHmm label');
  return value;
}
function qaPackage(label) { return ORIGINAL_PACKAGE + '.qa' + qaLabel(label); }
function hostEnvironment(node, java, sdk, home) {
  // No inherited .env, admin/provider/production DB/signing values.
  return { PATH: [path.dirname(node), path.join(java, 'bin'), '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    HOME: home, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
    NODE_ENV: 'development', EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1', CI: '1', TZ: 'Asia/Taipei' };
}
function metroArguments(mobile) {
  // Expo 57 rejects combining CLI --offline with --localhost, and --offline
  // selects LAN. EXPO_OFFLINE=1 disables CLI network calls while this sole
  // hosting option actually binds the Metro server to localhost.
  return ['--dns-result-order=ipv4first', path.join(mobile, 'node_modules/expo/bin/cli'), 'start', '--localhost',
    '--port', String(METRO_PORT), '--max-workers', '2'];
}
function assignedSerial(env) {
  if (!env.SIM_MANAGER_TOKEN || !/^emulator-[0-9]{4,5}$/.test(env.SIM_MANAGER_SERIAL || '')) throw new Error('A supervised Android simulator-manager lease is required');
  return env.SIM_MANAGER_SERIAL;
}
function buyerErasureProof(actors, rows, observation) {
  if (!Array.isArray(actors) || actors.length !== 3 || actors.some(actor => !actor || !Number.isSafeInteger(actor.id) || actor.id <= 0) ||
    new Set(actors.map(actor => actor.id)).size !== 3 || !Array.isArray(rows) || rows.length !== 2 ||
    rows.some(row => !row || !Number.isSafeInteger(row.id)) || new Set(rows.map(row => row.id)).size !== 2 ||
    !observation || !Number.isSafeInteger(observation.now) || !Number.isSafeInteger(observation.deadline) ||
    observation.stopping !== false || observation.ended !== false || observation.now >= observation.deadline - 30000) return false;
  const ids = new Set(rows.map(row => row.id));
  return !ids.has(actors[0].id) && ids.has(actors[1].id) && ids.has(actors[2].id);
}
module.exports = { ORIGINAL_PACKAGE, METRO_PORT, qaLabel, qaPackage, hostEnvironment, metroArguments, assignedSerial, buyerErasureProof };
