#!/usr/bin/env node
// Local, isolated, non-debuggable Release-equivalent visual review build.
// Never reads the upload key, production API URL, dotenv, or store credentials.
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { qaLabel, ORIGINAL_PACKAGE, hostEnvironment } = require('./android-qa-config.cjs');
const { androidQaSources } = require('./android-qa-sources.cjs');

const mobile = path.resolve(__dirname, '..');
const label = qaLabel(process.argv[2]);
if (process.argv.length !== 3) throw new Error('Expected one new 12-digit visual QA label');
const localApiUrl = 'http://127.0.0.1:18889';
const packageName = ORIGINAL_PACKAGE + '.visualqa' + label;
const output = path.join(mobile, 'build', 'android-visual-qa-' + label);
const disk = fs.statfsSync(mobile);
if (disk.bavail * disk.bsize < 15 * 1024 ** 3) throw new Error('Visual QA build requires at least 15 GiB free');
const java = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const sdk = '/Users/hank/Library/Android/sdk';
const aapt = path.join(sdk, 'build-tools/36.0.0/aapt2');
const apksigner = path.join(sdk, 'build-tools/36.0.0/apksigner');
for (const required of [path.join(java, 'bin/java'), path.join(sdk, 'platform-tools/adb'), aapt, apksigner,
  path.join(mobile, 'android/gradlew'), path.join(mobile, 'android/app/debug.keystore')]) {
  if (!fs.existsSync(required)) throw new Error('Visual QA build prerequisite unavailable; no key will be generated');
}
const sources = [...new Set([...androidQaSources(mobile, { includeInstrumentation: false }),
  'scripts/build-android-visual-qa.cjs'])].sort();
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fingerprint = () => Object.fromEntries(sources.map(source => [source, hash(path.join(mobile, source))]));
const sourceHashes = fingerprint();
fs.mkdirSync(output, { mode: 0o700 });
const env = { ...hostEnvironment(process.execPath, java, sdk, os.homedir()),
  NODE_ENV: 'production', EXPO_PUBLIC_API_URL: localApiUrl, EXPO_PUBLIC_VISUAL_QA: '1' };
const built = spawnSync('./gradlew', [':app:assembleVisualQa', '-PwishlistVisualQa=true',
  '-PwishlistVisualQaSuffix=.visualqa' + label, '-PreactNativeArchitectures=arm64-v8a',
  '--console=plain', '--max-workers=4'], { cwd: path.join(mobile, 'android'), env, stdio: 'inherit' });
if (built.error || built.status !== 0) { process.exitCode = built.status || 1; }
else {
  if (JSON.stringify(fingerprint()) !== JSON.stringify(sourceHashes))
    throw new Error('Visual QA source changed during compilation; preserve this result and start a new label');
  const source = path.join(mobile, 'android/app/build/outputs/apk/visualQa/app-visualQa.apk');
  const target = path.join(output, 'app.apk');
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  const badging = execFileSync(aapt, ['dump', 'badging', target], { env, encoding: 'utf8', maxBuffer: 2_000_000 });
  if (!badging.includes(`package: name='${packageName}'`) || badging.includes('application-debuggable'))
    throw new Error('Visual QA APK is not the non-debuggable isolated identity');
  const files = execFileSync('/usr/bin/unzip', ['-Z', '-1', target], { encoding: 'utf8', maxBuffer: 4_000_000 });
  if (!files.split(/\r?\n/).includes('assets/index.android.bundle'))
    throw new Error('Visual QA APK does not contain a static JavaScript bundle');
  const verify = execFileSync(apksigner, ['verify', '--verbose', '--print-certs', target], { env, encoding: 'utf8' });
  if (!verify.includes('Verified using v2 scheme (APK Signature Scheme v2): true') ||
    !verify.includes('Number of signers: 1') ||
    verify.includes('Signer #1 certificate SHA-256 digest: 6183bfc7238a3b207f6382df0b1e908b548eede5bf3c74f7157ed625bf93e41c'))
    throw new Error('Visual QA APK is unsigned, or it used the production upload certificate');
  const metadata = { kind: 'isolated-android-release-equivalent-visual-qa', label, package: packageName,
    apiOrigin: localApiUrl, nonDebuggable: true, staticJsBundle: true, storeDeliverable: false,
    usesProductionUploadCertificate: false, apkSha256: hash(target), sourceFiles: sources, sourceHashes };
  fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ kind: metadata.kind, label, package: packageName, apkSha256: metadata.apkSha256,
    staticJsBundle: true, nonDebuggable: true, storeDeliverable: false }));
}
