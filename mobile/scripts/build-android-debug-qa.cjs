// Build a fresh, distinct-package Android Debug shell for supervised UI QA.
// No instrumentation source, Play upload credential, release key or device use.
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { qaLabel, qaPackage, METRO_PORT, hostEnvironment } = require('./android-qa-config.cjs');
const { androidQaSources } = require('./android-qa-sources.cjs');

const mobile = path.resolve(__dirname, '..');
const label = qaLabel(process.argv[2]);
if (process.argv.length !== 3) throw new Error('Expected one unique 12-digit QA label');
const output = path.join(mobile, 'build', 'android-debug-qa-' + label);
const disk = fs.statfsSync(mobile);
if (disk.bavail * disk.bsize < 15 * 1024 ** 3) throw new Error('QA build requires at least 15 GiB free');
const java = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const sdk = '/Users/hank/Library/Android/sdk';
const required = [path.join(java, 'bin/java'), path.join(sdk, 'platform-tools/adb'),
  path.join(sdk, 'build-tools/36.0.0/aapt2'), path.join(mobile, 'android/gradlew'),
  path.join(mobile, 'android/app/debug.keystore')];
for (const file of required) if (!fs.existsSync(file)) throw new Error('Existing debug build prerequisite missing; no key will be generated');

const sources = androidQaSources(mobile, { includeInstrumentation: false });
const fingerprint = () => Object.fromEntries(sources.map(source => [source,
  createHash('sha256').update(fs.readFileSync(path.join(mobile, source))).digest('hex')]));
const sourceHashes = fingerprint();
// Reserve unique evidence before Gradle; never replace an earlier label.
fs.mkdirSync(output, { mode: 0o700 });
const env = hostEnvironment(process.execPath, java, sdk, os.homedir());
const built = spawnSync('./gradlew', [':app:assembleDebug', '-PwishlistNativeQa=true',
  '-PwishlistNativeQaSuffix=.qa' + label, '-PreactNativeArchitectures=arm64-v8a',
  '-PreactNativeDevServerPort=' + METRO_PORT, '--console=plain', '--max-workers=4'],
{ cwd: path.join(mobile, 'android'), env, stdio: 'inherit' });
if (built.error || built.status !== 0) process.exitCode = built.status || 1;
else {
  if (JSON.stringify(fingerprint()) !== JSON.stringify(sourceHashes))
    throw new Error('QA source changed during compilation; preserve artifacts and build a new label');
  const source = path.join(mobile, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const target = path.join(output, 'app.apk');
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  const aapt = spawnSync(path.join(sdk, 'build-tools/36.0.0/aapt2'), ['dump', 'badging', target],
    { env, encoding: 'utf8', maxBuffer: 2_000_000 });
  if (aapt.error || aapt.status !== 0 || !aapt.stdout.includes(`package: name='${qaPackage(label)}'`) ||
    !aapt.stdout.includes('application-debuggable'))
    throw new Error('Compiled APK is not the distinct-package Debug identity');
  const metadata = { kind: 'isolated-android-debug-qa', label, package: qaPackage(label), metroPort: METRO_PORT,
    hashes: { app: createHash('sha256').update(fs.readFileSync(target)).digest('hex') },
    sourceFiles: sources, sourceHashes, storeDeliverable: false, instrumented: false };
  fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(metadata));
}
