// Host-only debug/test compilation; no runtime device or release credential use.
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { qaLabel, qaPackage, METRO_PORT, hostEnvironment } = require('./android-qa-config.cjs');
const { androidQaSources } = require('./android-qa-sources.cjs');
const mobile = path.resolve(__dirname, '..');
const label = qaLabel(process.argv[2]);
const output = path.join(mobile, 'build', 'android-qa-' + label);
const disk = fs.statfsSync(mobile);
if (disk.bavail * disk.bsize < 15 * 1024 ** 3) throw new Error('QA build requires at least 15 GiB free');
const java = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const sdk = '/Users/hank/Library/Android/sdk';
for (const required of [path.join(java, 'bin/java'), path.join(sdk, 'platform-tools/adb'), path.join(mobile, 'android/gradlew'), path.join(mobile, 'android/app/debug.keystore')]) {
  if (!fs.existsSync(required)) throw new Error('Existing debug build prerequisite missing; no key will be generated');
}
// Reserve a fresh evidence directory; never replace a prior build's evidence.
fs.mkdirSync(output, { mode: 0o700 });
const env = hostEnvironment(process.execPath, java, sdk, os.homedir());
const sources = androidQaSources(mobile);
const fingerprint = () => Object.fromEntries(sources.map(source => [source, createHash('sha256').update(fs.readFileSync(path.join(mobile, source))).digest('hex')]));
const sourceHashes = fingerprint();
const result = spawnSync('./gradlew', [':app:assembleDebug', ':app:assembleDebugAndroidTest', '-PwishlistNativeQa=true',
  '-PwishlistNativeQaSuffix=.qa' + label, '-PreactNativeArchitectures=arm64-v8a', '-PreactNativeDevServerPort=' + METRO_PORT, '--console=plain', '--max-workers=4'],
  { cwd: path.join(mobile, 'android'), env, stdio: 'inherit' });
if (result.error || result.status !== 0) process.exitCode = result.status || 1;
else {
  if (JSON.stringify(fingerprint()) !== JSON.stringify(sourceHashes)) throw new Error('QA sources changed during compilation; preserve artifacts and compile a new unique build');
  const files = { app: 'android/app/build/outputs/apk/debug/app-debug.apk', test: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk' };
  const hashes = {};
  for (const [kind, source] of Object.entries(files)) {
    const target = path.join(output, kind + '.apk');
    fs.copyFileSync(path.join(mobile, source), target, fs.constants.COPYFILE_EXCL);
    hashes[kind] = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  }
  const metadata = { kind: 'isolated-debug-native-qa', label, package: qaPackage(label), metroPort: METRO_PORT, hashes, sourceFiles: sources, sourceHashes, storeDeliverable: false };
  fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(metadata));
}
