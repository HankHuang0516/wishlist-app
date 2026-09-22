#!/usr/bin/env node
// Local archive only, using an existing original-Team identity. Never changes
// keychain search order, unlocks keychains, edits ACLs, rotates keys or uploads.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { X509Certificate } = require('node:crypto');
const mobile = path.resolve(__dirname, '..');
const team = 'KLBQRT47CT';
const identity = '7BB00E492F5E2ED726245DAE0B9D8998D5BC98F4';
const uuid = 'd172b211-c59e-4c19-9177-3c48f6e17ba3';
const keychain = '/Users/hank/Library/Keychains/login.keychain-db';
const profilePath = '/Users/hank/.local/share/AiHankApps/credentials/weesh/Wishlist-ai-Weesh-AppStore-Login-20260915.mobileprovision';
const buildPaths = require('./local-ios-paths.cjs').localIosPaths(mobile, 'archive', process.argv[2]);
const archivePath = buildPaths.archive;
const resultPath = buildPaths.result;
function fail(message) { console.error(message); process.exit(1); }
if (fs.statfsSync(mobile).bavail * fs.statfsSync(mobile).bsize < 15 * 1024 ** 3) fail('At least 15 GiB free space is required');
if (fs.existsSync(archivePath) || fs.existsSync(resultPath) || (process.argv[2] !== undefined && fs.existsSync(buildPaths.derived))) fail('Preserve previous archive evidence; use a newly reviewed run path');
for (const file of [profilePath, keychain, path.join(mobile, 'ios/Wishlistai.xcworkspace')]) if (!fs.existsSync(file)) fail('An existing signing prerequisite is unavailable');
if ((fs.statSync(profilePath).mode & 0o077) !== 0) fail('Existing provisioning profile must be privately stored');
const decoded = spawnSync('/usr/bin/security', ['cms', '-D', '-i', profilePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (decoded.status !== 0) fail('Existing provisioning profile could not be decoded');
let profile;
try { profile = require('@expo/plist').default.parse(decoded.stdout); } catch { fail('Existing provisioning profile is invalid'); }
const fingerprints = (profile.DeveloperCertificates ?? []).map(cert => {
  try { return new X509Certificate(Buffer.isBuffer(cert) ? cert : Buffer.from(cert, 'base64')).fingerprint.replace(/:/g, ''); } catch { return ''; }
});
if (profile.UUID !== uuid || profile.TeamIdentifier?.[0] !== team || profile.Entitlements?.['application-identifier'] !== `${team}.com.hankhuang.weesh` || profile.Entitlements?.['get-task-allow'] !== false || new Date(profile.ExpirationDate).getTime() <= Date.now() || fingerprints.length !== 1 || fingerprints[0] !== identity) fail('Existing profile does not match the reviewed original app and identity');
const { getApiUrl } = require('../../server/dist/config/constants.js');
const env = { ...process.env, EXPO_PUBLIC_API_URL: getApiUrl(), NODE_ENV: 'production', NODE_BINARY: process.execPath, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` };
const build = spawn('/usr/bin/xcodebuild', ['-quiet', '-workspace', 'ios/Wishlistai.xcworkspace', '-scheme', 'Wishlistai', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-derivedDataPath', buildPaths.derived, '-archivePath', archivePath, '-resultBundlePath', resultPath, '-jobs', '4', 'CODE_SIGN_STYLE=Manual', `CODE_SIGN_IDENTITY=${identity}`, `DEVELOPMENT_TEAM=${team}`, `PROVISIONING_PROFILE_SPECIFIER=${uuid}`, `OTHER_CODE_SIGN_FLAGS=--keychain ${keychain}`, 'archive'], { cwd: mobile, env, stdio: ['ignore', 'pipe', 'pipe'] });
let warnings = 0, errors = 0;
for (const stream of [build.stdout, build.stderr]) {
  let pending = '';
  stream.setEncoding('utf8');
  const consume = line => {
    if (/\bwarning:/.test(line)) { warnings++; if (warnings <= 5) console.log(line); }
    if (/\berror:|\*\* ARCHIVE FAILED \*\*/.test(line)) { errors++; if (errors <= 20) console.error(line); }
  };
  stream.on('data', data => { pending += data; const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(consume); });
  stream.on('end', () => { if (pending) consume(pending); });
}
build.on('error', () => { console.error('The local archive process could not start'); process.exitCode = 1; });
build.on('close', code => {
  console.log(JSON.stringify({ scope: 'local-distribution-archive-only-not-full-acceptance-or-upload', exitCode: code, warnings, errors, archivePath, fullResultBundle: resultPath }));
  process.exitCode = code ?? 1;
});
