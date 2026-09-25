// Only discard our explicitly selected, successful QA builds' rebuildable
// intermediate/module caches. Never delete Products, results, user data, source,
// an original-ID app, an incomplete/live build, or an arbitrary directory.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { qaLabel } = require('./android-qa-config.cjs');
const { iosQaBundle, iosQaRunnerBundle, iosHostEnvironment } = require('./ios-qa-config.cjs');
const mobile = path.resolve(__dirname, '..');
const discard = process.argv[2] === '--discard-rebuildable-intermediates';
if (!discard && process.argv[2] !== '--dry-run') throw new Error('Explicit cache operation required');
const labels = process.argv.slice(3).map(qaLabel);
if (!labels.length || new Set(labels).size !== labels.length) throw new Error('Exact non-duplicate QA labels required');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const env = iosHostEnvironment(process.execPath, os.homedir(), os.tmpdir());
const caches = [], products = [];
for (const label of labels) {
  const output = path.join(mobile, 'build', 'ios-native-qa-' + label);
  // Read only matching PIDs, never process arguments or environments. A
  // successful build.json alone cannot prove its builder/runtime is terminal.
  for (const pattern of ['build-ios-qa.cjs ' + label, 'ios-native-qa.cjs ' + label, output + '/app-derived', output + '/runner-derived']) {
    const probe = spawnSync('/usr/bin/pgrep', ['-f', pattern], { env, encoding: 'utf8', timeout: 5000, maxBuffer: 16384 });
    if (probe.error || probe.signal || ![0, 1].includes(probe.status)) throw new Error('QA process state unavailable; no deletion');
    if (probe.status === 0) throw new Error('Selected QA builder, runtime or artifact reader is still live; no deletion');
  }
  if (fs.realpathSync(output) !== output || !fs.lstatSync(output).isDirectory()) throw new Error('QA output must be an exact real directory');
  const metadata = JSON.parse(fs.readFileSync(path.join(output, 'build.json'), 'utf8'));
  const app = path.join(output, 'app-derived/Build/Products/Debug-iphonesimulator/Wishlistai.app');
  const runner = path.join(output, 'runner-derived/Build/Products/Debug-iphonesimulator/WishlistNativeQa-Runner.app');
  if (metadata.kind !== 'isolated-debug-ios-native-qa' || metadata.label !== label || metadata.storeDeliverable !== false ||
    metadata.appBundle !== iosQaBundle(label) || metadata.runnerBundle !== iosQaRunnerBundle(label) + '.xctrunner' || metadata.app !== app || metadata.runner !== runner) throw new Error('Only successful isolated QA provenance allowed');
  for (const item of [app, runner]) {
    const check = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', item], { env, stdio: 'ignore', timeout: 10000 });
    if (check.error || check.status !== 0 || check.signal) throw new Error('QA signature unavailable; no deletion');
  }
  const binaries = [path.join(app, 'Wishlistai'), path.join(app, 'Wishlistai.debug.dylib'), path.join(runner, 'PlugIns/WishlistNativeQa.xctest/WishlistNativeQa')];
  const hashes = binaries.map(hash);
  if (hashes[0] !== metadata.hashes?.app || hashes[2] !== metadata.hashes?.test || metadata.hashes?.appDebug && hashes[1] !== metadata.hashes.appDebug) throw new Error('QA product changed; no deletion');
  products.push({ binaries, hashes });
  // Index stores are compiler navigation databases. They are not executable
  // products, test results or simulator data, and Xcode regenerates them.
  // Accept only the fixed allowlist below and only when a directory still
  // exists, so a second cleanup can safely reclaim a different cache class.
  for (const relative of ['app-derived/Build/Intermediates.noindex', 'app-derived/ModuleCache.noindex',
    'app-derived/Index.noindex', 'app-derived/CompilationCache.noindex', 'app-derived/SDKStatCaches.noindex',
    'app-derived/SDKExplicitPrecompiledModules', 'app-derived/SourcePackages',
    'app-derived/Build/Products/Debug-iphonesimulator/XCFrameworkIntermediates',
    'runner-derived/Build/Intermediates.noindex', 'runner-derived/ModuleCache.noindex',
    'runner-derived/Index.noindex', 'runner-derived/CompilationCache.noindex', 'runner-derived/SDKStatCaches.noindex',
    'runner-derived/SDKExplicitPrecompiledModules']) {
    const cache = path.join(output, relative);
    if (fs.existsSync(cache)) {
      if (!fs.lstatSync(cache).isDirectory() || fs.realpathSync(cache) !== cache) throw new Error('Only exact real rebuildable cache directories allowed');
      caches.push(cache);
    }
  }
}
if (!caches.length) throw new Error('Selected QA labels have no approved rebuildable caches');
const free = () => { const disk = fs.statfsSync(mobile); return disk.bavail * disk.bsize / 1024 ** 3; };
const before = free();
if (discard) {
  // All targets validated before the first removal. Node rm does not follow
  // child symlinks; no environment-derived, broad, recursive project target.
  for (const cache of caches) fs.rmSync(cache, { recursive: true, force: false });
  for (const item of products) if (item.binaries.some((file, index) => hash(file) !== item.hashes[index])) throw new Error('Product preservation verification failed');
}
console.log(JSON.stringify({ kind: 'isolated-ios-rebuildable-cache-operation', discarded: discard, cacheDirectories: caches, productHashesPreserved: true,
  freeGiBBefore: before, freeGiBAfter: free(), sourceOperations: 0, resultOperations: 0, userDataOperations: 0, recoverability: 'rebuild-from-source-not-undelete' }));
