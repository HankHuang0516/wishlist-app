// Host-only isolated simulator compilation. No lease, credentials, store upload,
// original bundle installation or fixture credentials are involved.
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { qaLabel } = require('./android-qa-config.cjs');
const { iosQaBundle, iosQaRunnerBundle, iosHostEnvironment } = require('./ios-qa-config.cjs');
const { assertSimulatorEntitlements } = require('./ios-simulator-entitlements.cjs');
const mobile = path.resolve(__dirname, '..');
const label = qaLabel(process.argv[2]);
const output = path.join(mobile, 'build', 'ios-native-qa-' + label);
const disk = fs.statfsSync(mobile);
if (disk.bavail * disk.bsize < 15 * 1024 ** 3) throw new Error('Isolated iOS QA compilation needs 15 GiB free');
const resume = process.argv[3] === '--resume-host-build';
if (process.argv[3] && !resume) throw new Error('Unknown QA build option');
if (resume) {
  // Host compilation only: reuse its own failed output, never rerun a device
  // test or overwrite a successful build manifest. Xcode must revalidate both.
  if (fs.existsSync(path.join(output, 'build.json')) || !fs.existsSync(path.join(output, 'runner-build.xcresult')) ||
    !fs.existsSync(path.join(output, 'app-build.xcresult'))) throw new Error('Only a failed host build can be resumed');
} else fs.mkdirSync(output, { mode: 0o700 });
const env = iosHostEnvironment(process.execPath, os.homedir(), os.tmpdir());
const sourceFiles = ['App.tsx', 'ios/Podfile.lock', 'ios/Wishlistai/AppDelegate.swift', 'ios/Wishlistai/Info.plist', 'ios/Wishlistai.xcodeproj/project.pbxproj',
  'ios/Wishlistai.xcodeproj/xcshareddata/xcschemes/Wishlistai.xcscheme', 'ios-native-qa/NativeQaTests.swift', 'ios-native-qa/PublicInputState.swift', 'ios-native-qa/HostPublicInputTests.swift',
  'ios-native-qa/WishlistNativeQa.xcodeproj/project.pbxproj', 'ios-native-qa/WishlistNativeQa.xcodeproj/xcshareddata/xcschemes/WishlistNativeQa.xcscheme',
  'scripts/ios-qa-build-guard.cjs', 'scripts/ios-qa-config.cjs', 'scripts/ios-simulator-entitlements.cjs', 'scripts/build-ios-qa.cjs',
  'scripts/ios-qa-input.cjs', 'scripts/ios-qa-result-privacy.cjs', 'scripts/ios-xctestrun-config.cjs', 'scripts/ios-native-qa.cjs',
  'scripts/native-qa.cjs', 'scripts/native-qa-migrations.cjs', 'scripts/native-qa-worker.cjs',
  'scripts/native-qa-marketplace-fixture.cjs', 'scripts/test-native-qa-marketplace-fixture.cjs', 'scripts/test-ios-public-input.cjs',
  'scripts/native-qa-photo-fingerprint.cjs', 'scripts/check-native-qa-photo-fingerprint.cjs',
  'app.config.js', 'plugins/withIsolatedDebugQa.js', 'plugins/iosQaInputBridge.swift', 'package.json', 'package-lock.json', 'tsconfig.json',
  ...fs.readdirSync(path.join(mobile, 'src')).filter(name => /\.(?:ts|tsx)$/.test(name)).sort().map(name => 'src/' + name)];
const fingerprint = () => Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(mobile, file))).digest('hex')]));
const sourceHashes = fingerprint();
const qaGroup = 'KLBQRT47CT.' + iosQaBundle(label);
const entitlements = path.join(output, 'qa.entitlements');
const qaInfo = path.join(output, 'qa.Info.plist');
const originalInfo = fs.readFileSync(path.join(mobile, 'ios/Wishlistai/Info.plist'), 'utf8');
if ((originalInfo.match(/<string>weesh<\/string>/g) || []).length !== 1 ||
  (originalInfo.match(/<string>com\.hankhuang\.weesh<\/string>/g) || []).length !== 1) {
  throw new Error('Unexpected iOS URL schemes; no QA build');
}
const qaInfoContents = originalInfo.replace('<string>weesh</string>', `<string>wishlistqa${label}</string>`)
  .replace('<string>com.hankhuang.weesh</string>', `<string>${iosQaBundle(label)}</string>`);
if (fs.existsSync(qaInfo)) {
  if (fs.readFileSync(qaInfo, 'utf8') !== qaInfoContents) throw new Error('QA Info.plist changed; no overwrite');
} else fs.writeFileSync(qaInfo, qaInfoContents, { flag: 'wx', mode: 0o600 });
// Explicit unique access group isolates SecureStore from the original App even
// for ad-hoc simulator signatures. Public identifiers only, not private keys.
if (!resume) fs.writeFileSync(entitlements, JSON.stringify({ 'application-identifier': qaGroup, 'keychain-access-groups': [qaGroup], 'get-task-allow': true }), { flag: 'wx', mode: 0o600 });
const resultSuffix = resume ? '-recheck-' + require('node:crypto').randomUUID() : '';
let active, interrupted = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { interrupted = true; active?.kill('SIGTERM'); });
function command(executable, args, phase) {
  if (interrupted) return Promise.reject(new Error('QA compilation interrupted'));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: mobile, env, stdio: ['ignore', 'pipe', 'pipe'] });
    active = child;
    let warnings = 0, errors = 0, output = '', pending = '';
    const consume = chunk => {
      const value = chunk.toString();
      if (output.length < 3000000) output += value;
      pending += value;
      const lines = pending.split('\n'); pending = lines.pop().slice(-10000);
      for (const line of lines) { if (/\bwarning:/.test(line)) warnings++; if (/\berror:/.test(line)) errors++; }
    };
    child.stdout.on('data', consume); child.stderr.on('data', consume);
    child.once('error', () => reject(new Error('QA host command could not start; raw diagnostics withheld')));
    child.once('close', code => {
      if (active === child) active = null;
      console.log(JSON.stringify({ kind: 'isolated-ios-qa-host-phase', phase, exitCode: code, warnings, errors, interrupted }));
      if (code === 0 && !interrupted) resolve(output); else reject(new Error('QA compilation failed; raw diagnostics withheld'));
    });
  });
}
async function main() {
  await command('/usr/bin/plutil', ['-convert', 'xml1', entitlements], 'unique-keychain-entitlements');
  const signing = ['CODE_SIGN_STYLE=Manual', 'CODE_SIGN_IDENTITY=-', 'DEVELOPMENT_TEAM=KLBQRT47CT', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGNING_REQUIRED=YES'];
  // The UI runner is a separate project, never an archive dependency of the App.
  await command('/usr/bin/xcodebuild', ['-quiet', '-project', 'ios-native-qa/WishlistNativeQa.xcodeproj', '-scheme', 'WishlistNativeQa',
    '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator',
    '-derivedDataPath', path.join(output, 'runner-derived'), '-resultBundlePath', path.join(output, 'runner-build' + resultSuffix + '.xcresult'), '-jobs', '2',
    'PRODUCT_BUNDLE_IDENTIFIER=' + iosQaRunnerBundle(label), ...signing, 'build-for-testing'], 'runner-build-for-testing');
  await command('/usr/bin/xcodebuild', ['-quiet', '-workspace', 'ios/Wishlistai.xcworkspace', '-scheme', 'Wishlistai',
    '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator',
    '-derivedDataPath', path.join(output, 'app-derived'), '-resultBundlePath', path.join(output, 'app-build' + resultSuffix + '.xcresult'), '-jobs', '4',
    'WISHLIST_NATIVE_QA=1', 'WISHLIST_QA_SUFFIX=.qa' + label, 'WISHLIST_QA_SWIFT_FLAGS=-D WISHLIST_NATIVE_QA',
    'WISHLIST_URL_SCHEME=wishlistqa' + label, 'WISHLIST_DISPLAY_NAME=Wishlist.ai QA', 'SKIP_BUNDLING=1', 'RCT_METRO_PORT=18887',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS=DEBUG WISHLIST_NATIVE_QA',
    'CODE_SIGN_ENTITLEMENTS=' + entitlements, 'INFOPLIST_FILE=' + qaInfo,
    'PRODUCT_BUNDLE_IDENTIFIER=' + iosQaBundle(label), ...signing, 'build'], 'isolated-app-debug-build');
  if (JSON.stringify(fingerprint()) !== JSON.stringify(sourceHashes)) throw new Error('QA source changed during host compilation');
  const app = path.join(output, 'app-derived/Build/Products/Debug-iphonesimulator/Wishlistai.app');
  const runner = path.join(output, 'runner-derived/Build/Products/Debug-iphonesimulator/WishlistNativeQa-Runner.app');
  const appBundle = (await command('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', path.join(app, 'Info.plist')], 'app-identity')).trim();
  const runnerBundle = (await command('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', path.join(runner, 'Info.plist')], 'runner-identity')).trim();
  if (appBundle !== iosQaBundle(label) || runnerBundle !== iosQaRunnerBundle(label) + '.xctrunner') throw new Error('Unexpected QA build identity');
  const appInfo = JSON.parse(await command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Info.plist')], 'unique-recovery-schemes'));
  const schemes = appInfo.CFBundleURLTypes.flatMap(type => type.CFBundleURLSchemes);
  if (schemes.length !== 2 || !schemes.includes('wishlistqa' + label) || !schemes.includes(iosQaBundle(label))) throw new Error('QA recovery schemes must not intercept the original App');
  await command('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], 'qa-app-signature');
  await command('/usr/bin/codesign', ['--verify', '--deep', '--strict', runner], 'qa-runner-signature');
  const entitlementJson = JSON.parse(await command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', entitlements], 'qa-entitlement-source'));
  if (Object.keys(entitlementJson).length !== 3 || entitlementJson['application-identifier'] !== qaGroup || entitlementJson['get-task-allow'] !== true ||
    JSON.stringify(entitlementJson['keychain-access-groups']) !== JSON.stringify([qaGroup])) throw new Error('Unexpected QA entitlement source');
  const architectures = assertSimulatorEntitlements(fs.readFileSync(path.join(app, 'Wishlistai')), fs.readFileSync(entitlements, 'utf8'));
  console.log(JSON.stringify({ kind: 'isolated-ios-qa-host-phase', phase: 'all-architecture-keychain-isolation', architectures, passed: true }));
  const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const metadata = { kind: 'isolated-debug-ios-native-qa', label, appBundle, runnerBundle, app, runner, sourceFiles, sourceHashes,
    architectures, qaKeychainGroup: qaGroup, hashes: { app: hash(path.join(app, 'Wishlistai')), appDebug: hash(path.join(app, 'Wishlistai.debug.dylib')), test: hash(path.join(runner, 'PlugIns/WishlistNativeQa.xctest/WishlistNativeQa')) },
    authenticatedFlowsVerified: false, nativeRuntimeVerified: false, storeDeliverable: false };
  fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(metadata));
}
main().catch(() => { console.error('Isolated iOS QA build failed; no runtime/store completion claimed, raw diagnostics withheld'); process.exitCode = 1; });
