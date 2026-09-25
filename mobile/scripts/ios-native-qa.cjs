// Execute exclusively inside simulator-manager. Optional genuine authenticated
// baseline uses private UIKit text input, never XCTest credential typing.
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { qaLabel, metroArguments } = require('./android-qa-config.cjs');
const { assignedUdid, iosQaBundle, iosQaRunnerBundle, iosHostEnvironment, METRO_PORT } = require('./ios-qa-config.cjs');
const { assertSimulatorEntitlements } = require('./ios-simulator-entitlements.cjs');
const { destinationTestRun, iosSummaryPassed, AUTHENTICATED_FLOWS } = require('./ios-xctestrun-config.cjs');
const { startIosQaInput } = require('./ios-qa-input.cjs');
const { credentialFreeResultLogs } = require('./ios-qa-result-privacy.cjs');
const { buyerErasureProof } = require('./android-qa-config.cjs');
const { startNativeQa } = require('./native-qa.cjs');
const { seedNativeMarketplace } = require('./native-qa-marketplace-fixture.cjs');
const { fixtureDistance } = require('./native-qa-photo-fingerprint.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');
const mobile = path.resolve(__dirname, '..');
const label = qaLabel(process.argv[2]), udid = assignedUdid(process.env);
const option = process.argv[3];
const flow = option?.startsWith('--authenticated-') ? option.slice('--authenticated-'.length) : null;
const listingAiFlow = flow === 'listing-batch-ai-photo' || flow === 'listing-batch-two-ai-photos';
const twoPhotoFlow = flow === 'listing-batch-two-photos' || flow === 'listing-batch-two-ai-photos';
const authenticated = flow !== null;
if ((option && (!authenticated || !Object.hasOwn(AUTHENTICATED_FLOWS, flow))) || process.argv[4]) throw new Error('Unexpected runtime option');
const selectedTests = authenticated ? AUTHENTICATED_FLOWS[flow] : null;
const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (process.env.DATABASE_URL !== database) throw new Error('QA database bindings must agree');
const env = iosHostEnvironment(process.execPath, os.homedir(), os.tmpdir());
const build = path.join(mobile, 'build', 'ios-native-qa-' + label);
const metadata = JSON.parse(fs.readFileSync(path.join(build, 'build.json'), 'utf8'));
const appBundle = iosQaBundle(label), runnerBundle = iosQaRunnerBundle(label) + '.xctrunner';
const app = path.join(build, 'app-derived/Build/Products/Debug-iphonesimulator/Wishlistai.app');
const runner = path.join(build, 'runner-derived/Build/Products/Debug-iphonesimulator/WishlistNativeQa-Runner.app');
if (metadata.kind !== 'isolated-debug-ios-native-qa' || metadata.appBundle !== appBundle || metadata.runnerBundle !== runnerBundle ||
  metadata.app !== app || metadata.runner !== runner || metadata.storeDeliverable !== false) throw new Error('Not an isolated iOS QA build');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (hash(path.join(app, 'Wishlistai')) !== metadata.hashes?.app ||
  hash(path.join(app, 'Wishlistai.debug.dylib')) !== metadata.hashes?.appDebug ||
  hash(path.join(runner, 'PlugIns/WishlistNativeQa.xctest/WishlistNativeQa')) !== metadata.hashes?.test) throw new Error('QA artifact changed');
for (const source of metadata.sourceFiles || []) {
  if (path.isAbsolute(source) || source.split('/').includes('..') || hash(path.join(mobile, source)) !== metadata.sourceHashes?.[source]) throw new Error('QA source changed; compile before runtime');
}
const publicSources = fs.readdirSync(path.join(mobile, 'src')).filter(name => /\.(?:ts|tsx)$/.test(name)).sort().map(name => 'src/' + name);
if (!Array.isArray(metadata.sourceFiles) || new Set(metadata.sourceFiles).size !== metadata.sourceFiles.length ||
  publicSources.some(source => !metadata.sourceFiles.includes(source)) ||
  ['App.tsx', 'app.config.js', 'plugins/withIsolatedDebugQa.js', 'plugins/iosQaInputBridge.swift', 'package.json', 'package-lock.json', 'tsconfig.json',
    'scripts/ios-native-qa.cjs', 'scripts/build-ios-qa.cjs', 'scripts/native-qa.cjs', 'scripts/native-qa-migrations.cjs',
    'scripts/native-qa-worker.cjs', 'ios-native-qa/PublicInputState.swift']
    .some(source => !metadata.sourceFiles.includes(source))) throw new Error('Incomplete current QA source fingerprint');
const expectedGroup = 'KLBQRT47CT.' + appBundle;
if (metadata.qaKeychainGroup !== expectedGroup) throw new Error('Unexpected QA access group');
assertSimulatorEntitlements(fs.readFileSync(path.join(app, 'Wishlistai')), fs.readFileSync(path.join(build, 'qa.entitlements'), 'utf8'));
const evidence = path.join(build, 'qa-' + randomUUID());
fs.mkdirSync(evidence, { mode: 0o700 });
let stopping = false, child, metro, metroExit, qa, requestedStop = false, installedApp = false, installedRunner = false;
let stage = 'fresh-app-guard', passed = false, summary, screenshot = false, cleanup;
let broker, qaDeadline = 0, qaEnded = false, buyerErasureVerified = false, privacyAuditPassed = false;
let nativeFailureStage = null, marketplaceFixtureSeeded = false, listingPhotoVerified = false, listingPhotoPrivacyVerified = false, listingPhotoCount = 0, sellerDraftVerified = false;
let listingPhotoFixtureVerified = false, listingAiDraftVerified = false, listingAiTask = null, listingAiTaskFailed = false;
const listingAiDrafts = new Map();
const ownedChildren = new Set();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopping = true; for (const owned of ownedChildren) owned.kill('SIGTERM'); metro?.kill('SIGTERM');
});
function command(executable, args, timeout = 20000, cleanupCommand = false, input, allowMissingConsole = false) {
  if (stopping && !cleanupCommand) return Promise.reject(new Error('QA interrupted'));
  return new Promise((resolve, reject) => {
    const processChild = spawn(executable, args, { cwd: mobile, env, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    if (input !== undefined) { processChild.stdin.on('error', () => undefined); processChild.stdin.end(input); }
    child = processChild;
    ownedChildren.add(processChild);
    let output = '', lines = '', timedOut = false, outputOverflow = false, diagnostic = '';
    const timer = setTimeout(() => { timedOut = true; processChild.kill('SIGTERM'); }, timeout);
    processChild.stdout.on('data', chunk => {
      const value = chunk.toString();
      if (output.length + value.length <= 8000000) output += value; else outputOverflow = true;
      lines += value; const parts = lines.split(/\r?\n/); lines = parts.pop().slice(-10000);
      for (const line of parts) {
        const match = /^NATIVE_QA_STAGE=([a-z-]{1,80})$/.exec(line.trim());
        if (match) console.log(JSON.stringify({ kind: 'ios-native-qa-checkpoint', stage: match[1] }));
      }
    });
    processChild.stderr.on('data', chunk => { if (allowMissingConsole && diagnostic.length < 4096) diagnostic += chunk.toString(); });
    processChild.once('error', () => { clearTimeout(timer); ownedChildren.delete(processChild); reject(new Error('QA command unavailable; raw diagnostics withheld')); });
    processChild.once('close', (code, signal) => {
      clearTimeout(timer); ownedChildren.delete(processChild); if (child === processChild) child = null;
      const knownMissing = allowMissingConsole && executable === '/usr/bin/xcrun' && args[0] === 'xcresulttool' &&
        args[1] === 'get' && args[2] === 'log' && args.includes('console') && code === 1 && !signal && !timedOut &&
        !outputOverflow && (diagnostic + output).trim() === 'Error: No console log available';
      if (knownMissing) resolve(JSON.stringify({ sdkConsoleUnavailable: true }));
      else if (code === 0 && !signal && !timedOut && !outputOverflow) resolve(output);
      else {
        console.log(JSON.stringify({ kind: 'ios-qa-command-failure', stage, exitCode: code, signal, timedOut, outputOverflow }));
        reject(new Error('QA command failed; raw diagnostics withheld'));
      }
    });
  });
}
const simctl = (args, timeout, cleanupCommand = false) => command('/usr/bin/xcrun', ['simctl', ...args.slice(0, 1), udid, ...args.slice(1)], timeout, cleanupCommand);
async function auditBuyerErasure() {
  if (!qa || qaEnded || stopping || Date.now() >= qaDeadline - 30000) return false;
  const { PrismaClient } = require('../../server/node_modules/@prisma/client');
  const audit = new PrismaClient({ datasources: { db: { url: database } } });
  try {
    const actors = [qa.actors.buyer, qa.actors.seller, qa.actors.third];
    const rows = await audit.user.findMany({ where: { id: { in: actors.map(actor => actor.id) } }, select: { id: true } });
    return buyerErasureProof(actors, rows, { ended: qaEnded, stopping, now: Date.now(), deadline: qaDeadline });
  } finally { await audit.$disconnect(); }
}
async function auditListingPhoto() {
  if (!qa || qaEnded || stopping || Date.now() >= qaDeadline - 30000) return;
  const { PrismaClient } = require('../../server/node_modules/@prisma/client');
  const audit = new PrismaClient({ datasources: { db: { url: database } } });
  try {
    const records = await audit.listingMedia.findMany({ where: { ownerUserId: qa.actors.buyer.id },
      select: { id: true, ownerUserId: true, listingId: true, wishItemId: true, width: true, height: true, byteSize: true,
        contentHash: true, aiDraftStatus: true, sellerDraft: true, sellerDraftVersion: true } });
    listingPhotoCount = records.length;
    const expectedCount = twoPhotoFlow ? 2 : 1;
    if (records.length !== expectedCount || new Set(records.map(record => record.contentHash)).size !== expectedCount ||
      records.some(record => record.listingId !== null || record.wishItemId !== null || record.width < 100 || record.height < 100 ||
        record.byteSize < 1000 || record.aiDraftStatus !== (listingAiFlow ? 'COMPLETED' : 'SKIPPED'))) return;
    if (flow === 'listing-batch-photo' || listingAiFlow) {
      const saved = records[0].sellerDraft;
      sellerDraftVerified = twoPhotoFlow ? records.filter(record =>
        record.sellerDraftVersion >= 1 && typeof record.sellerDraft?.form?.title === 'string' &&
        record.sellerDraft.form.title.includes('NativeQA') && record.sellerDraft?.touched?.title === true &&
        typeof record.sellerDraft?.clientListingId === 'string').length === 1 :
        records[0].sellerDraftVersion >= 1 &&
        (listingAiFlow ? typeof saved?.form?.title === 'string' && saved.form.title.includes('NativeQA') && saved.form.title.includes('杯')
          : saved?.form?.title === 'Native QA Blue Mug') &&
        saved?.touched?.title === true && typeof saved?.clientListingId === 'string';
    }
    const login = async actor => {
      const response = await fetch(qa.apiUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: actor.email, password: actor.password }), signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      if (response.status !== 200 || typeof body.token !== 'string' || body.token.length < 40) throw new Error('Private QA actor login failed');
      return body.token;
    };
    const ownerToken = await login(qa.actors.buyer), outsiderToken = await login(qa.actors.seller);
    listingPhotoVerified = true; listingPhotoPrivacyVerified = true;
    const sharp = require('../../server/node_modules/sharp');
    const blue = fs.readFileSync(path.join(mobile, 'qa-fixtures/synthetic-used-blue-mug.png'));
    const orange = fs.readFileSync(path.join(mobile, 'qa-fixtures/synthetic-used-orange-desk-lamp.png'));
    const identities = [];
    for (const record of records) {
      const url = qa.apiUrl + '/api/listing-media/' + record.id + '/image';
      const owner = await fetch(url, { headers: { Authorization: 'Bearer ' + ownerToken }, signal: AbortSignal.timeout(5000) });
      const bytes = Buffer.from(await owner.arrayBuffer());
      listingPhotoVerified &&= owner.status === 200 && !!owner.headers.get('content-type')?.startsWith('image/') && bytes.length > 1000;
      if (owner.status === 200 && bytes.length > 1000) {
        const blueDistance = await fixtureDistance(sharp, bytes, blue);
        const orangeDistance = await fixtureDistance(sharp, bytes, orange);
        identities.push(blueDistance < 12 && orangeDistance > 40 ? 'BLUE_MUG' : orangeDistance < 12 && blueDistance > 40 ? 'ORANGE_LAMP' : 'OTHER');
      }
      const outsider = await fetch(url, { headers: { Authorization: 'Bearer ' + outsiderToken }, signal: AbortSignal.timeout(5000) });
      const anonymous = await fetch(url, { signal: AbortSignal.timeout(5000) });
      listingPhotoPrivacyVerified &&= outsider.status === 404 && anonymous.status === 404;
    }
    listingPhotoFixtureVerified = !twoPhotoFlow ? identities.length === 1 && identities[0] === 'BLUE_MUG' :
      identities.length === 2 && identities.sort().join(',') === 'BLUE_MUG,ORANGE_LAMP';
    if (listingAiFlow && listingAiDrafts.size === expectedCount && sellerDraftVerified) {
      const publicListings = await fetch(qa.apiUrl + '/api/listings', { signal: AbortSignal.timeout(5000) });
      const publicBody = publicListings.status === 200 ? await publicListings.json() : null;
      listingAiDraftVerified = Array.isArray(publicBody?.items) && publicBody.items.length === 0;
      for (const record of records) {
        const expected = listingAiDrafts.get(record.id);
        const state = await fetch(qa.apiUrl + '/api/listing-media/' + record.id + '/ai-draft',
          { headers: { Authorization: 'Bearer ' + ownerToken }, signal: AbortSignal.timeout(5000) });
        const body = state.status === 200 ? await state.json() : null;
        listingAiDraftVerified &&= !!expected && body?.status === 'COMPLETED' && body.draft?.title === expected.name &&
          body.draft?.estimatedPriceLowTwd === expected.estimatedPriceLowTwd &&
          body.draft?.estimatedPriceHighTwd === expected.estimatedPriceHighTwd;
      }
    }
  } finally { await audit.$disconnect(); }
}
async function completeListingAiDrafts() {
  const headers = { Authorization: 'Bearer ' + qa.callbackToken };
  const endpoint = qa.apiUrl + '/api/internal/minimax-vision';
  const { recognizeListingImage } = await import('../../tools/minimax-vision-bridge/server.mjs');
  const sharp = require('../../server/node_modules/sharp');
  const blue = fs.readFileSync(path.join(mobile, 'qa-fixtures/synthetic-used-blue-mug.png'));
  const orange = fs.readFileSync(path.join(mobile, 'qa-fixtures/synthetic-used-orange-desk-lamp.png'));
  const observed = new Set();
  for (let index = 0; index < (twoPhotoFlow ? 2 : 1); index++) {
    const deadline = Date.now() + 190000;
    let job = null;
    while (!stopping && Date.now() < deadline) {
      const claim = await fetch(endpoint + '/next', { headers, signal: AbortSignal.timeout(10000) });
      if (claim.status === 200) { job = await claim.json(); break; }
      if (claim.status !== 204) throw new Error('QA_AI_CLAIM_FAILED');
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    if (stopping || job?.kind !== 'LISTING_DRAFT' || typeof job.jobId !== 'string' || typeof job.imageUrl !== 'string')
      throw new Error('QA_AI_JOB_MISSING');
    const imageUrl = new URL(job.imageUrl);
    const match = /^\/api\/listing-media\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/image$/.exec(imageUrl.pathname);
    if (imageUrl.origin !== qa.apiUrl || !match || listingAiDrafts.has(match[1])) throw new Error('QA_AI_JOB_MISMATCH');
    const anonymousImage = await fetch(job.imageUrl, { signal: AbortSignal.timeout(10000) });
    const workerImage = await fetch(job.imageUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (anonymousImage.status !== 404 || workerImage.status !== 200) throw new Error('QA_AI_PRECONFIRM_IMAGE_PUBLIC');
    const bytes = Buffer.from(await workerImage.arrayBuffer());
    const blueDistance = await fixtureDistance(sharp, bytes, blue);
    const orangeDistance = await fixtureDistance(sharp, bytes, orange);
    const fixture = blueDistance < 12 && orangeDistance > 40 ? 'BLUE_MUG' : orangeDistance < 12 && blueDistance > 40 ? 'ORANGE_LAMP' : null;
    if (!fixture || observed.has(fixture) || (!twoPhotoFlow && fixture !== 'BLUE_MUG')) throw new Error('QA_AI_JOB_WRONG_PHOTO');
    observed.add(fixture);
    const publicListings = await fetch(qa.apiUrl + '/api/listings', { signal: AbortSignal.timeout(10000) });
    if (publicListings.status !== 200 || (await publicListings.json()).items?.length !== 0) throw new Error('QA_AI_PRECONFIRM_LISTING_PUBLIC');
    const draft = await recognizeListingImage(job.imageUrl, { authToken: qa.callbackToken });
    if (!(fixture === 'BLUE_MUG' ? /杯/ : /燈/).test(draft.name) || !Number.isInteger(draft.estimatedPriceLowTwd) ||
      !Number.isInteger(draft.estimatedPriceHighTwd) || draft.estimatedPriceHighTwd < draft.estimatedPriceLowTwd)
      throw new Error('QA_AI_DRAFT_UNGROUNDED');
    const callback = await fetch(endpoint + '/' + job.jobId + '/result', { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED', result: draft }), signal: AbortSignal.timeout(10000) });
    if (callback.status !== 204) throw new Error('QA_AI_CALLBACK_FAILED');
    listingAiDrafts.set(match[1], draft);
  }
  if (observed.size !== (twoPhotoFlow ? 2 : 1)) throw new Error('QA_AI_JOB_MISSING');
}
async function main() {
  const inventory = await simctl(['listapps']);
  // simctl listapps emits an OpenStep property list, not JSON. Convert in
  // memory; never serialize the user's application inventory as evidence.
  stage = 'fresh-app-inventory-format';
  const installed = JSON.parse(await command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], 5000, false, inventory));
  stage = 'fresh-app-guard';
  if (Object.hasOwn(installed, appBundle) || Object.hasOwn(installed, runnerBundle)) throw new Error('QA app already exists; no overwrite/reset permitted');
  // Unique Keychain groups and a fresh install, not a reset of original data.
  stage = 'private-service-start';
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error('Private Metro port occupied; no existing server changed')));
    server.listen(METRO_PORT, '127.0.0.1', () => server.close(resolve));
  });
  qaDeadline = Date.now() + 360000;
  qa = await startNativeQa(database, 360, { externalListingsPilot: flow === 'external-map',
    listingAiPilot: listingAiFlow });
  if (listingAiFlow) listingAiTask = completeListingAiDrafts().catch(() => { listingAiTaskFailed = true; });
  if (flow?.startsWith('marketplace-')) {
    stage = 'isolated-marketplace-fixture';
    await seedNativeMarketplace(qa); marketplaceFixtureSeeded = true;
  }
  qa.exited.then(() => { qaEnded = true; if (!requestedStop) { stopping = true; for (const owned of ownedChildren) owned.kill('SIGTERM'); } },
    () => { qaEnded = true; stopping = true; for (const owned of ownedChildren) owned.kill('SIGTERM'); });
  if (authenticated) broker = await startIosQaInput(label, qa.actors, url => {
    const parsed = new URL(url), action = parsed.searchParams.get('action');
    if (parsed.protocol !== 'wishlistqa' + label + ':' || !['login-buyer', 'deletion-buyer'].includes(action)) throw new Error('Invalid QA input notification');
    // Public unique name only. The capability never goes through XCTest or
    // the notification and the actual UIKit/backend admission stays unchanged.
    return simctl(['notify_post', appBundle + '.input.' + action], 10000);
  }, 320000, 'notification');
  metro = spawn(process.execPath, metroArguments(mobile), { cwd: mobile, env: { ...env, EXPO_PUBLIC_API_URL: qa.apiUrl }, stdio: ['ignore', 'ignore', 'ignore'] });
  metroExit = new Promise(resolve => { metro.once('exit', resolve); metro.once('error', () => resolve(-1)); });
  const readyDeadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < readyDeadline && !stopping && metro.exitCode === null) {
    try {
      const response = await fetch('http://127.0.0.1:' + METRO_PORT + '/status', { signal: AbortSignal.timeout(1000), redirect: 'error' });
      if (response.ok && await response.text() === 'packager-status:running') { ready = true; break; }
    } catch { /* Observe only our supervised child. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Private Metro unavailable');
  stage = 'qa-only-install';
  if (flow === 'listing-batch-photo' || twoPhotoFlow || listingAiFlow) {
    stage = 'synthetic-photo-library-seed';
    const fixtures = [['synthetic-used-blue-mug.png', '4bf0d16e92bff216bdf0521ba878886b0a31c734d43ee9363dbc69dda6aa06f9'],
      ...(twoPhotoFlow ? [['synthetic-used-orange-desk-lamp.png', 'abdaabda6b85bd4037f976638b4b93faf6702c9e1ab0997809e7fa18b4468ab0']] : [])];
    for (const [name, expectedHash] of fixtures) {
      const fixture = path.join(mobile, 'qa-fixtures', name);
      if (hash(fixture) !== expectedHash) throw new Error('Synthetic fixture changed');
      await command('/usr/bin/xcrun', ['simctl', 'addmedia', udid, fixture], 30000);
    }
  }
  await simctl(['install', app], 30000); installedApp = true;
  const products = path.join(build, 'runner-derived/Build/Products');
  const templates = fs.readdirSync(products).filter(name => name.endsWith('.xctestrun'));
  if (templates.length !== 1) throw new Error('Expected one Xcode-generated test template');
  const template = JSON.parse(await command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(products, templates[0])]));
  const testRun = path.join(evidence, 'runtime.xctestrun');
  fs.writeFileSync(testRun, JSON.stringify(destinationTestRun(template, label, products, broker?.port, flow ?? undefined)), { flag: 'wx', mode: 0o600 });
  await command('/usr/bin/plutil', ['-convert', 'xml1', testRun]);
  stage = authenticated ? 'authenticated-native-tests' : 'anonymous-native-tests';
  const result = path.join(evidence, 'tests.xcresult');
  let testCommandSucceeded = false;
  // This runner was absent at the fresh guard. Xcode performs its first
  // installation; the provided-by-tests App has already been installed once.
  installedRunner = true;
  try {
    await command('/usr/bin/xcodebuild', ['-xctestrun', testRun, '-destination', 'platform=iOS Simulator,id=' + udid,
      '-destination-timeout', '15', '-resultBundlePath', result, '-parallel-testing-enabled', 'NO',
      '-collect-test-diagnostics', 'never',
      '-maximum-concurrent-test-simulator-destinations', '1', '-test-timeouts-enabled', 'YES',
      '-default-test-execution-time-allowance', '180', '-maximum-test-execution-time-allowance', '240', 'test-without-building'], 300000);
    testCommandSucceeded = true;
  } catch { /* Extract safe counters even when assertions fail. */ }
  if (fs.existsSync(result)) summary = JSON.parse(await command('/usr/bin/xcrun', ['xcresulttool', 'get', 'test-results', 'summary', '--path', result, '--compact']));
  if (flow === 'deletion') buyerErasureVerified = await auditBuyerErasure();
  if (listingAiFlow && listingAiTask) {
    if (!testCommandSucceeded) stopping = true;
    await listingAiTask;
  }
  if (flow === 'listing-batch-photo' || twoPhotoFlow || listingAiFlow) await auditListingPhoto();
  const failures = Array.isArray(summary?.testFailures) ? summary.testFailures : [];
  for (const failure of failures) {
    const match = /^(?:failed - )?Isolated (?:anonymous )?iOS QA failed at ([a-z-]+); raw diagnostics withheld$/.exec(failure.failureText || '');
    if (match) nativeFailureStage = match[1];
  }
  const expectedInput = flow?.startsWith('marketplace-') || flow?.startsWith('listing-batch-') || flow === 'external-map' ? 'login-buyer' : flow === 'deletion' ? 'login-buyer,deletion-buyer' : '';
  if (!testCommandSucceeded || !iosSummaryPassed(summary, udid, authenticated ? 1 : 2) ||
    (authenticated && ((flow === 'deletion' && !buyerErasureVerified) ||
      ((flow === 'listing-batch-photo' || twoPhotoFlow || listingAiFlow) && (!listingPhotoVerified || !listingPhotoPrivacyVerified || !listingPhotoFixtureVerified)) ||
      ((flow === 'listing-batch-photo' || listingAiFlow) && !sellerDraftVerified) ||
      (listingAiFlow && (!listingAiDraftVerified || listingAiTaskFailed)) ||
      broker.completed.join(',') !== expectedInput))) throw new Error('iOS assertions failed');
  for (const source of metadata.sourceFiles) {
    if (hash(path.join(mobile, source)) !== metadata.sourceHashes[source]) throw new Error('QA source changed during runtime; no completion claimed');
  }
  if (authenticated) {
    stage = 'credential-free-result-log-audit';
    const consoleLog = JSON.parse(await command('/usr/bin/xcrun', ['xcresulttool', 'get', 'log', '--type', 'console', '--path', result, '--compact'], 20000, false, undefined, true));
    const actionLog = JSON.parse(await command('/usr/bin/xcrun', ['xcresulttool', 'get', 'log', '--type', 'action', '--path', result, '--compact']));
    const activities = [];
    for (const method of selectedTests) activities.push(JSON.parse(await command('/usr/bin/xcrun',
      ['xcresulttool', 'get', 'test-results', 'activities', '--path', result, '--compact', '--test-id',
        'test://com.apple.xcode/WishlistNativeQa/WishlistNativeQa/' + method])));
    privacyAuditPassed = credentialFreeResultLogs(consoleLog, actionLog, qa.actors.buyer, activities, udid, selectedTests);
    if (!privacyAuditPassed) throw new Error('Credentials may be in result logs; no safe completion claimed');
  }
  stage = 'safe-product-notice-evidence';
  const attachments = path.join(evidence, 'attachments');
  await command('/usr/bin/xcrun', ['xcresulttool', 'export', 'attachments', '--path', result, '--output-path', attachments]);
  const manifest = JSON.parse(fs.readFileSync(path.join(attachments, 'manifest.json'), 'utf8'));
  if (!Array.isArray(manifest)) throw new Error('Unexpected attachment manifest');
  const items = manifest.flatMap(item => Array.isArray(item.attachments) ? item.attachments : []);
  const flowAttachments = {
    'marketplace-discovery': ['product-notice', 'home', 'marketplace'],
    'marketplace-chat': ['product-notice', 'home', 'chat-transition', 'chat'],
    'marketplace-meetup': ['product-notice', 'home', 'meetup'],
    'listing-batch-entry': ['product-notice', 'home', 'listing-batch'],
    'listing-batch-photo': ['product-notice', 'home', 'photo-picker', 'photo-selected', 'listing-photo', 'listing-resumed'],
    'listing-batch-two-photos': ['product-notice', 'home', 'photo-picker', 'two-selected', 'two-listing'],
    'listing-batch-ai-photo': ['product-notice', 'home', 'photo-picker', 'photo-selected', 'ai-photo', 'ai-resumed'],
    'listing-batch-two-ai-photos': ['product-notice', 'home', 'photo-picker', 'two-selected', 'two-ai-photo', 'two-ai-resumed'],
    'external-map': ['product-notice', 'home', 'external-map', 'external-list', 'external-detail', 'external-wish-map', 'external-wish-list'],
    deletion: ['product-notice', 'home', 'wish', 'deleted'],
  };
  const names = flow ? flowAttachments[flow] : ['product-notice'];
  if (items.length !== names.length) throw new Error('Only deliberately safe attachments are permitted');
  for (const name of names) {
    // XCTest appends _<index>_<UUID>.png. Require that exact delimiter so
    // qa-chat never also admits qa-chat-transition as a duplicate.
    const matches = items.filter(item => new RegExp('^qa-' + name + '_[0-9]+_[0-9A-F-]{36}\\.png$').test(item.suggestedHumanReadableName));
    if (matches.length !== 1) throw new Error('Required safe attachment missing or duplicate');
    const item = matches[0];
    if (item.deviceId !== udid || path.basename(item.exportedFileName) !== item.exportedFileName || !item.exportedFileName.endsWith('.png')) throw new Error('Unexpected attachment');
    const image = fs.readFileSync(path.join(attachments, item.exportedFileName));
    const info = await require('../../server/node_modules/sharp')(image).metadata();
    if (info.format !== 'png' || info.width < 100 || info.height < 100 || info.width > 5000 || info.height > 5000) throw new Error('Invalid safe screenshot');
    fs.writeFileSync(path.join(evidence, name + '.png'), image, { flag: 'wx', mode: 0o600 });
  }
  screenshot = true; passed = true;
}
(async () => {
  let failed = false;
  try { await main(); } catch { failed = true; }
  const failedStage = stage;
  let cleanupFailed = false;
  const attempt = async work => { try { await work(); } catch { cleanupFailed = true; } };
  if (broker) await attempt(() => broker.stop());
  if (installedApp || installedRunner) await attempt(async () => {
    // XCTest can already terminate its own apps. Inspect live PID labels first;
    // do not turn an absent process into an artificial cleanup failure.
    const output = await command('/usr/bin/xcrun', ['simctl', 'spawn', udid, 'launchctl', 'list'], 5000, true);
    for (const bundle of [installedApp && appBundle, installedRunner && runnerBundle].filter(Boolean)) {
      const escaped = bundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const live = new RegExp('^[0-9]+\\s+[-0-9]+\\s+UIKitApplication:' + escaped + '(?:\\[|\\s|$)', 'm');
      if (live.test(output)) await simctl(['terminate', bundle], 5000, true);
    }
  });
  await attempt(async () => { if (metro?.exitCode === null) metro.kill('SIGTERM'); if (metroExit) await metroExit; });
  if (qa) await attempt(async () => { requestedStop = true; cleanup = await qa.stop(); });
  const report = { kind: flow ? 'isolated-ios-authenticated-' + flow : 'isolated-ios-anonymous-native-ui', appBundle, runnerBundle, assignedDevice: udid,
    passed: passed && !failed && !cleanupFailed && !stopping, interrupted: stopping,
    failedStage: cleanupFailed ? 'exact-cleanup-failed' : failed ? failedStage : null,
    tests: summary ? { total: summary.totalTestCount, passed: summary.passedTests, failed: summary.failedTests, skipped: summary.skippedTests } : null,
    safeProductNoticeScreenshot: screenshot, cleanup: cleanup || null, hashes: metadata.hashes,
    nativeFailureStage, authenticatedFlow: flow, buyerErasureVerified, listingPhotoVerified, listingPhotoPrivacyVerified, listingPhotoFixtureVerified, listingPhotoCount, sellerDraftVerified,
    listingAiDraftVerified, listingAiTaskFailed,
    privacyAuditPassed, marketplaceFixtureSeeded, inputActionsCompleted: broker?.completed || [], inputStages: broker?.stages || [],
    inputProbes: broker?.probes || [], inputRejections: broker?.rejections || [], inputTrigger: authenticated ? 'darwin-notification' : 'none',
    authenticatedBaselineVerified: authenticated && passed && !failed && !cleanupFailed && !stopping,
    authenticatedFlowVerified: authenticated && passed && !failed && !cleanupFailed && !stopping,
    authenticatedFlowsVerified: false, storeDeliverable: false };
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(report)); process.exitCode = report.passed ? 0 : 1;
})().catch(() => { console.error('iOS QA control or cleanup failed; raw diagnostics withheld'); process.exitCode = 1; });
