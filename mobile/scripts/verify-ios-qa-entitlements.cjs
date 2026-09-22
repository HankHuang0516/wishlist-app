// Read-only host audit of existing QA artifacts with the CURRENT exact-value
// verifier. No build, device, fixtures, signing mutation or store operation.
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { qaLabel } = require('./android-qa-config.cjs');
const { iosQaBundle, iosQaRunnerBundle, iosHostEnvironment } = require('./ios-qa-config.cjs');
const { assertSimulatorEntitlements } = require('./ios-simulator-entitlements.cjs');
function main() {
  const label = qaLabel(process.argv[2]);
  if (process.argv[3]) throw new Error('Unexpected audit option');
  const mobile = path.resolve(__dirname, '..'), directory = path.join(mobile, 'build', 'ios-native-qa-' + label);
  const app = path.join(directory, 'app-derived/Build/Products/Debug-iphonesimulator/Wishlistai.app');
  const runner = path.join(directory, 'runner-derived/Build/Products/Debug-iphonesimulator/WishlistNativeQa-Runner.app');
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'build.json'), 'utf8'));
  const group = 'KLBQRT47CT.' + iosQaBundle(label);
  if (metadata.kind !== 'isolated-debug-ios-native-qa' || metadata.appBundle !== iosQaBundle(label) ||
    metadata.runnerBundle !== iosQaRunnerBundle(label) + '.xctrunner' || metadata.app !== app || metadata.runner !== runner ||
    metadata.qaKeychainGroup !== group || metadata.storeDeliverable !== false) throw new Error('Unexpected QA artifacts');
  const binary = fs.readFileSync(path.join(app, 'Wishlistai'));
  const hash = data => createHash('sha256').update(data).digest('hex');
  if (hash(binary) !== metadata.hashes.app || hash(fs.readFileSync(path.join(runner, 'PlugIns/WishlistNativeQa.xctest/WishlistNativeQa'))) !== metadata.hashes.test) throw new Error('QA executables changed');
  const env = iosHostEnvironment(process.execPath, os.homedir(), os.tmpdir());
  for (const target of [app, runner]) {
    const signed = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', target], { env, timeout: 20000, stdio: 'ignore' });
    if (signed.status !== 0 || signed.error) throw new Error('QA signature verification failed');
  }
  const entitlement = path.join(directory, 'qa.entitlements');
  const decoded = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', entitlement], { env, timeout: 5000, encoding: 'utf8' });
  if (decoded.status !== 0 || decoded.error) throw new Error('QA entitlement decoding failed');
  const expected = JSON.parse(decoded.stdout);
  if (Object.keys(expected).length !== 3 || expected['application-identifier'] !== group || expected['get-task-allow'] !== true ||
    JSON.stringify(expected['keychain-access-groups']) !== JSON.stringify([group])) throw new Error('Unexpected QA entitlement source');
  const architectures = assertSimulatorEntitlements(binary, fs.readFileSync(entitlement, 'utf8'));
  console.log(JSON.stringify({ kind: 'readonly-ios-qa-exact-entitlement-audit', label, architectures, passed: true,
    hashes: metadata.hashes, nativeRuntimeRerun: false, storeDeliverable: false }));
}
try { main(); } catch { console.error('Read-only iOS QA entitlement audit failed; raw diagnostics withheld'); process.exitCode = 1; }
