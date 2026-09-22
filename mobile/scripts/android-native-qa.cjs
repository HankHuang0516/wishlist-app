// Device workload: run ONLY through simulator-manager. No daemonization,
// original-package install/reset, production APIs or credential serialization.
const { spawn } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const dns = require('node:dns');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { startNativeQa } = require('./native-qa.cjs');
const { seedNativeMarketplace } = require('./native-qa-marketplace-fixture.cjs');
const { startAndroidQaInput } = require('./android-qa-input.cjs');
const { qaLabel, qaPackage, ORIGINAL_PACKAGE, METRO_PORT, assignedSerial, hostEnvironment, metroArguments, buyerErasureProof } = require('./android-qa-config.cjs');
const { androidQaSources } = require('./android-qa-sources.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');
dns.setDefaultResultOrder('ipv4first');
const mobile = path.resolve(__dirname, '..');
const label = qaLabel(process.argv[2]);
const serial = assignedSerial(process.env);
const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== database) throw new Error('QA database bindings must agree');
const packageName = qaPackage(label), testPackage = packageName + '.test';
const build = path.join(mobile, 'build', 'android-qa-' + label);
const sdk = '/Users/hank/Library/Android/sdk', java = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const adbPath = path.join(sdk, 'platform-tools/adb');
const env = hostEnvironment(process.execPath, java, sdk, os.homedir());
const metadata = JSON.parse(fs.readFileSync(path.join(build, 'build.json'), 'utf8'));
if (metadata.kind !== 'isolated-debug-native-qa' || metadata.package !== packageName || metadata.metroPort !== METRO_PORT || metadata.storeDeliverable !== false) throw new Error('Not an isolated QA build');
for (const kind of ['app', 'test']) {
  const hash = createHash('sha256').update(fs.readFileSync(path.join(build, kind + '.apk'))).digest('hex');
  if (hash !== metadata.hashes?.[kind]) throw new Error('QA artifact changed after host compilation');
}
const sourceFiles = androidQaSources(mobile);
if (!Array.isArray(metadata.sourceFiles) || metadata.sourceFiles.join('\n') !== sourceFiles.join('\n')) throw new Error('Android QA source inventory changed after compilation');
for (const source of sourceFiles) {
  const hash = createHash('sha256').update(fs.readFileSync(path.join(mobile, source))).digest('hex');
  if (hash !== metadata.sourceHashes?.[source]) throw new Error('QA source changed after compilation; compile a new unique build before runtime');
}
const prefix = 'qa-' + randomBytes(16).toString('hex');
const evidence = path.join(build, prefix);
fs.mkdirSync(evidence, { mode: 0o700 });
let stopping = false, activeCommand, metro, metroExit, qa, inputBroker, stage = 'artifact-identity', passed = false;
const reverses = [];
let instrumentedTests = 0;
let installedQa = false;
let buyerErasureVerified = false;
let failureKind = null;
let editorOpenAttempts = null;
let failureType = null;
let marketplaceFixtureSeeded = false;
let qaDeadline = 0, qaEnded = false, qaCleanupRequested = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopping = true;
  // These are our own synchronously supervised children, not adb/emulator daemons.
  activeCommand?.kill('SIGTERM'); metro?.kill('SIGTERM');
});
function command(executable, args, timeout = 20000, allowWhileStopping = false) {
  if (stopping && !allowWhileStopping) return Promise.reject(new Error('QA interrupted'));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: mobile, env, stdio: ['ignore', 'pipe', 'pipe'] });
    activeCommand = child;
    let output = '', lineBuffer = '', settled = false;
    const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
    const finish = (ok) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (activeCommand === child) activeCommand = null;
      ok ? resolve(output) : reject(new Error('QA command failed; raw output withheld'));
    };
    child.stdout.on('data', chunk => {
      const value = chunk.toString();
      if (output.length < 2_000_000) output += value;
      lineBuffer += value;
      const lines = lineBuffer.split(/\r?\n/); lineBuffer = lines.pop().slice(-10000);
      for (const line of lines) {
        const checkpoint = /^INSTRUMENTATION_STATUS: nativeQaStage=([a-z-]{1,80})$/.exec(line.trim());
        if (checkpoint) console.log(JSON.stringify({ kind: 'native-qa-checkpoint', stage: checkpoint[1] }));
      }
    });
    // stderr may contain native diagnostics/credentials. Never serialize it.
    child.stderr.on('data', () => undefined);
    child.once('error', () => finish(false));
    child.once('exit', (code, signal) => finish(code === 0 && !signal));
  });
}
const adb = (args, timeout, cleanup = false) => command(adbPath, ['-s', serial, ...args], timeout, cleanup);
async function freeMetroPort() {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error('Private Metro port occupied; no existing server will be changed')));
    server.listen(METRO_PORT, '127.0.0.1', () => server.close(resolve));
  });
}
async function metroReady() {
  const end = Date.now() + 45000;
  while (Date.now() < end && !stopping && metro.exitCode === null) {
    try {
      const response = await fetch('http://127.0.0.1:' + METRO_PORT + '/status', { signal: AbortSignal.timeout(1000), redirect: 'error' });
      if (response.ok && await response.text() === 'packager-status:running') return;
    } catch { /* bounded observation of our live child */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Private Metro did not become ready; details withheld');
}
async function reverse(port) {
  const endpoint = 'tcp:' + port;
  const kind = port === METRO_PORT ? 'metro' : 'api';
  stage = 'private-' + kind + '-reverse-inspection';
  const existing = await adb(['reverse', '--list']);
  if (existing.split(/\r?\n/).some(line => line.trim().split(/\s+/).includes(endpoint))) {
    stage = 'private-' + kind + '-reverse-occupied';
    throw new Error('QA reverse endpoint occupied; not replacing it');
  }
  stage = 'private-' + kind + '-reverse-binding';
  await adb(['reverse', endpoint, endpoint]);
  reverses.push(endpoint);
}
async function instrument(method) {
  if (!inputBroker || !Number.isSafeInteger(inputBroker.port)) throw new Error('Private Android QA input unavailable');
  const args = ['shell', 'am', 'instrument', '-w', '-e', 'class', ORIGINAL_PACKAGE + '.NativeQaTest#' + method,
    '-e', 'evidencePrefix', prefix, '-e', 'qaInputPort', String(inputBroker.port)];
  args.push(testPackage + '/androidx.test.runner.AndroidJUnitRunner');
  const output = await adb(args, 180000);
  const editorAttempts = output.match(/INSTRUMENTATION_STATUS: nativeQaEditorAttempts=([12])\b/)?.[1];
  if (editorAttempts) editorOpenAttempts = Number(editorAttempts);
  if (!/OK \(1 test\)/.test(output) || /FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed/.test(output)) {
    const failureStage = output.match(/Native QA failed at ([a-z-]+)/)?.[1];
    if (failureStage) stage = 'native-ui-' + failureStage;
    const reason = output.match(/Native QA failed at [a-z-]+ reason ([a-z-]+)/)?.[1];
    if (['assertion', 'control-missing', 'control-disabled', 'input-node-missing', 'input-action-rejected'].includes(reason)) failureKind = reason;
    const type = output.match(/Native QA failed at [a-z-]+ reason [a-z-]+ type ([A-Za-z]+)/)?.[1];
    if (['AssertionError', 'StaleObjectException', 'IllegalArgumentException', 'IllegalStateException', 'NullPointerException',
      'SecurityException', 'StackOverflowError', 'RuntimeException', 'Withheld'].includes(type)) failureType = type;
    throw new Error('Native assertions failed; details withheld');
  }
  instrumentedTests++;
}
async function auditBuyerErasure() {
  // Audit before any requested/automatic fixture cleanup, not after stop().
  // Keep a conservative margin from service expiry and prove that both other
  // actors still exist in the same readonly query. Missing all fixtures cannot
  // be mistaken for an App-initiated deletion.
  if (!qa || qaEnded || stopping || Date.now() >= qaDeadline - 30000) return false;
  const { PrismaClient } = require('../../server/node_modules/@prisma/client');
  const audit = new PrismaClient({ datasources: { db: { url: database } } });
  try {
    const actors = [qa.actors.buyer, qa.actors.seller, qa.actors.third];
    if (actors.some(actor => !actor || !Number.isSafeInteger(actor.id))) throw new Error('Invalid isolated audit actors');
    const rows = await audit.user.findMany({ where: { id: { in: actors.map(actor => actor.id) } }, select: { id: true } });
    return buyerErasureProof(actors, rows, { ended: qaEnded, stopping, now: Date.now(), deadline: qaDeadline });
  } finally { await audit.$disconnect(); }
}
async function copyEvidence(sourceLabel, sourcePrefix, destination) {
  if (!/^qa-[0-9a-f]{32}$/.test(sourcePrefix)) throw new Error('Invalid known QA evidence prefix');
  const sourcePackage = qaPackage(sourceLabel);
  const copied = [];
  for (const name of ['home', 'marketplace', 'meetup', 'wish', 'deleted', 'wish-editor', 'deletion-return']) {
    const target = path.join(destination, name + '.png');
    if (fs.existsSync(target)) throw new Error('Not replacing existing QA evidence');
    const remote = '/sdcard/Android/data/' + sourcePackage + '/cache/' + sourcePrefix + '-' + name + '.png';
    try { await adb(['pull', remote, target], 5000, true); copied.push(name); } catch { /* absent partial-stage evidence is not a pass */ }
  }
  return copied;
}
async function main() {
  const aapt = path.join(sdk, 'build-tools/36.0.0/aapt2');
  const badging = await command(aapt, ['dump', 'badging', path.join(build, 'app.apk')]);
  if (!badging.includes("package: name='" + packageName + "'") || !badging.includes('application-debuggable')) throw new Error('APK is not the guarded QA package/debug build');
  const manifest = await command(aapt, ['dump', 'xmltree', path.join(build, 'app.apk'), '--file', 'AndroidManifest.xml']);
  if (!manifest.includes('"wishlistqa' + label + '"') || manifest.includes('(Raw: "weesh")')) throw new Error('QA must not register the original app recovery-link scheme');
  const testManifest = await command(aapt, ['dump', 'xmltree', path.join(build, 'test.apk'), '--file', 'AndroidManifest.xml']);
  if (!testManifest.includes('android:targetPackage') || !testManifest.includes('"' + packageName + '"')) throw new Error('Instrumentation must target only this unique QA build');
  if (process.argv[3] || process.argv[4]) {
    const sourceLabel = qaLabel(process.argv[3]), sourcePrefix = process.argv[4];
    if (!/^qa-[0-9a-f]{32}$/.test(sourcePrefix || '')) throw new Error('Invalid previous QA evidence');
    const prior = path.join(mobile, 'build', 'android-qa-' + sourceLabel, sourcePrefix);
    const priorResult = JSON.parse(fs.readFileSync(path.join(prior, 'result.json'), 'utf8'));
    if (priorResult.kind !== 'isolated-android-native-ui' || priorResult.package !== qaPackage(sourceLabel)) throw new Error('Not a known prior QA report');
    const destination = path.join(prior, 'copied-' + prefix);
    fs.mkdirSync(destination, { mode: 0o700 });
    const copied = await copyEvidence(sourceLabel, sourcePrefix, destination);
    fs.writeFileSync(path.join(destination, 'evidence.json'), JSON.stringify({ kind: 'known-partial-qa-evidence-copy', copied, validationPassed: false }) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ kind: 'known-partial-qa-evidence-copy', copied, validationPassed: false }));
  }
  // Preserve all pre-existing application userdata, including a prior QA app.
  stage = 'fresh-package-guard';
  // `pm path` returns a nonzero status for an absent package. Query the package
  // list instead, including retained/uninstalled data; absence is the expected
  // fresh-install state, not a transport failure.
  for (const pkg of [packageName, testPackage]) {
    const packages = (await adb(['shell', 'pm', 'list', 'packages', '-u', pkg])).split(/\r?\n/).map(line => line.trim());
    if (packages.includes('package:' + pkg)) throw new Error('QA package or retained data already exists; not overwriting or clearing it');
  }
  stage = 'isolated-service-start';
  await freeMetroPort();
  qaDeadline = Date.now() + 360000;
  qa = await startNativeQa(database, 360);
  stage = 'isolated-marketplace-fixture';
  await seedNativeMarketplace(qa); marketplaceFixtureSeeded = true;
  inputBroker = await startAndroidQaInput(packageName, qa.actors, 320000);
  qa.exited.then(() => {
    qaEnded = true;
    if (!qaCleanupRequested) { stopping = true; activeCommand?.kill('SIGTERM'); }
  }, () => { qaEnded = true; stopping = true; activeCommand?.kill('SIGTERM'); });
  metro = spawn(process.execPath, metroArguments(mobile),
    { cwd: mobile, env: { ...env, EXPO_PUBLIC_API_URL: qa.apiUrl }, stdio: ['ignore', 'ignore', 'ignore'] });
  metroExit = new Promise(resolve => { metro.once('exit', resolve); metro.once('error', () => resolve(-1)); });
  await metroReady();
  stage = 'private-device-connections';
  await reverse(Number(new URL(qa.apiUrl).port));
  await reverse(METRO_PORT);
  await reverse(inputBroker.port);
  stage = 'qa-only-install';
  await adb(['install', path.join(build, 'app.apk')], 60000);
  installedQa = true;
  await adb(['install', path.join(build, 'test.apk')], 30000);
  stage = 'native-login-wishlist-deletion';
  try { await instrument('loginWishlistDeletion'); }
  catch {
    // A failed return-control assertion may follow a real erasure. Preserve
    // that separate DB fact without turning the failed UI method into a pass.
    if (['native-ui-durable-erasure-and-device-cleanup', 'native-ui-deletion-recovery-return-control',
      'native-ui-deletion-returned-login'].includes(stage)) buyerErasureVerified = await auditBuyerErasure();
    throw new Error('Native assertions failed; details withheld');
  }
  if (inputBroker.completed.join(',') !== 'login-buyer,deletion-buyer' || inputBroker.rejections.length) throw new Error('Private Android QA input sequence incomplete');
  stage = 'actual-force-stop-restart';
  await adb(['shell', 'am', 'force-stop', packageName]);
  await instrument('restartRemainsAnonymous');
  stage = 'readonly-buyer-erasure-audit';
  buyerErasureVerified = await auditBuyerErasure();
  if (!buyerErasureVerified) throw new Error('Native buyer erasure was not independently proven before fixture cleanup');
  stage = 'safe-screenshot-copy';
  const copied = await copyEvidence(label, prefix, evidence);
  if (!['home', 'marketplace', 'meetup', 'wish', 'deleted'].every(name => copied.includes(name))) throw new Error('Required safe screenshots missing');
  passed = true;
}
(async () => {
  let failure = false;
  try { await main(); } catch { failure = true; }
  const failedStage = stage;
  stage = 'exact-cleanup';
  let cleanup;
  const attempt = async work => {
    try { await work(); } catch { failure = true; stage = 'exact-cleanup-failed'; }
  };
  if (installedQa && !passed) await attempt(() => copyEvidence(label, prefix, evidence));
  // Each cleanup is attempted even if an earlier device command fails. Do not
  // touch a prior QA installation rejected by the fresh-package guard.
  if (installedQa) await attempt(() => adb(['shell', 'am', 'force-stop', packageName], 5000, true));
  await attempt(async () => {
    if (metro && metro.exitCode === null) metro.kill('SIGTERM');
    if (metroExit) await metroExit;
  });
  if (inputBroker) await attempt(() => inputBroker.stop());
  if (qa) await attempt(async () => { qaCleanupRequested = true; cleanup = await qa.stop(); });
  for (const endpoint of reverses) await attempt(() => adb(['reverse', '--remove', endpoint], 5000, true));
  const screenshots = ['home', 'marketplace', 'meetup', 'wish', 'deleted', 'wish-editor', 'deletion-return'].filter(name => fs.existsSync(path.join(evidence, name + '.png'))).length;
  const report = { kind: 'isolated-android-native-ui', package: packageName, instrumentedTests, buyerErasureVerified, screenshots,
    passed: passed && !failure && !stopping, interrupted: stopping, failedStage: failure ? (stage === 'exact-cleanup-failed' ? stage : failedStage) : null,
    failureKind, failureType, editorOpenAttempts, marketplaceFixtureSeeded, inputActionsCompleted: inputBroker?.completed || [], inputRejections: inputBroker?.rejections || [],
    cleanup: cleanup || null, hashes: metadata.hashes, storeDeliverable: false };
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(report));
  process.exitCode = report.passed ? 0 : stopping && !failure ? 75 : 1;
})().catch(() => { console.error('Native QA control/cleanup failed; details withheld'); process.exitCode = 1; });
