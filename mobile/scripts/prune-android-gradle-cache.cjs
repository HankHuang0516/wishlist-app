// Remove only Gradle's rebuildable app intermediates while preserving and
// re-verifying the signed release AAB and copied immutable QA APK evidence.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mobile = path.resolve(__dirname, '..');
if (process.argv[2] !== '--discard-app-intermediates' || process.argv[3]) throw new Error('Explicit Android cache operation required');
const cache = path.join(mobile, 'android/app/build/intermediates');
const aab = path.join(mobile, 'android/app/build/outputs/bundle/release/app-release.aab');
if (!fs.existsSync(cache) || !fs.lstatSync(cache).isDirectory() || fs.realpathSync(cache) !== cache) throw new Error('Exact Android intermediates unavailable');
if (!fs.existsSync(aab) || !fs.lstatSync(aab).isFile()) throw new Error('Signed AAB must be preserved');
const probe = spawnSync('/usr/bin/pgrep', ['-f', path.join(mobile, 'android')], { encoding: 'utf8', timeout: 5000, maxBuffer: 16384 });
if (probe.error || probe.signal || ![0, 1].includes(probe.status) || probe.status === 0) throw new Error('Android build process may be active; no deletion');
const java = '/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/jarsigner';
const verify = spawnSync(java, ['-verify', aab], { stdio: 'ignore', timeout: 30000 });
if (verify.error || verify.signal || verify.status !== 0) throw new Error('Signed AAB verification unavailable; no deletion');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const beforeHash = hash(aab);
const qa = path.join(mobile, 'build', 'android-qa-202609212354');
const metadata = JSON.parse(fs.readFileSync(path.join(qa, 'build.json'), 'utf8'));
for (const kind of ['app', 'test']) if (hash(path.join(qa, kind + '.apk')) !== metadata.hashes?.[kind]) throw new Error('Latest QA evidence changed; no deletion');
const free = () => { const disk = fs.statfsSync(mobile); return disk.bavail * disk.bsize / 1024 ** 3; };
const freeBefore = free();
fs.rmSync(cache, { recursive: true, force: false });
if (hash(aab) !== beforeHash) throw new Error('AAB preservation verification failed');
for (const kind of ['app', 'test']) if (hash(path.join(qa, kind + '.apk')) !== metadata.hashes[kind]) throw new Error('QA evidence preservation verification failed');
console.log(JSON.stringify({ kind: 'android-rebuildable-cache-operation', discarded: true, cache,
  signedAabSha256Preserved: beforeHash, latestQaHashesPreserved: true, freeGiBBefore: freeBefore, freeGiBAfter: free(),
  sourceOperations: 0, evidenceOperations: 0, recoverability: 'rebuild-from-source-not-undelete' }));
