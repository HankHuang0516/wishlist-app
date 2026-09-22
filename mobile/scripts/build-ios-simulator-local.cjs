#!/usr/bin/env node
// Local release simulator build with Xcode's actual ad-hoc signing step. This
// neither reads a distribution private key nor uploads an App Store artifact.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const mobile = path.resolve(__dirname, '..');
const { getApiUrl } = require('../../server/dist/config/constants.js');
const buildPaths = require('./local-ios-paths.cjs').localIosPaths(mobile, 'simulator', process.argv[2]);
const resultPath = buildPaths.result;
const disk = fs.statfsSync(mobile);
if (disk.bavail * disk.bsize < 15 * 1024 ** 3) throw new Error('Local iOS build requires 15 GiB free space');
if (!fs.existsSync(path.join(mobile, 'ios/Wishlistai.xcworkspace'))) throw new Error('Prepare the existing native workspace first');
if (fs.existsSync(resultPath) || fs.existsSync(buildPaths.derived)) throw new Error('Preserve the existing result and app; choose a new explicitly reviewed build run instead of overwriting it');
const env = { ...process.env, EXPO_PUBLIC_API_URL: getApiUrl(), NODE_ENV: 'production', NODE_BINARY: process.execPath, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` };
const processBuild = spawn('/usr/bin/xcodebuild', ['-quiet', '-workspace', 'ios/Wishlistai.xcworkspace', '-scheme', 'Wishlistai', '-configuration', 'Release', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', buildPaths.derived, '-resultBundlePath', resultPath, '-jobs', '4', 'CODE_SIGN_STYLE=Manual', 'CODE_SIGN_IDENTITY=-', 'DEVELOPMENT_TEAM=KLBQRT47CT', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGNING_REQUIRED=YES', 'build'], { cwd: mobile, env, stdio: ['ignore', 'pipe', 'pipe'] });
let warnings = 0, errors = 0, shownWarnings = 0;
function consume(stream) {
  let pending = '';
  stream.setEncoding('utf8');
  function line(value) {
    if (/\bwarning:/.test(value)) { warnings++; if (shownWarnings++ < 5) console.log(value); }
    if (/\berror:|\*\* BUILD FAILED \*\*/.test(value)) { errors++; if (errors <= 20) console.error(value); }
  }
  stream.on('data', data => { pending += data; const rows = pending.split('\n'); pending = rows.pop(); rows.forEach(line); });
  stream.on('end', () => { if (pending) line(pending); });
}
consume(processBuild.stdout); consume(processBuild.stderr);
processBuild.on('error', () => { console.error('iOS build could not start'); process.exitCode = 1; });
processBuild.on('close', code => {
  const app = path.join(buildPaths.derived, 'Build/Products/Release-iphonesimulator/Wishlistai.app');
  const executable = path.join(app, 'Wishlistai');
  console.log(JSON.stringify({ scope: 'local-ad-hoc-signed-release-simulator-build-not-app-store-or-runtime-acceptance', exitCode: code, warnings, errors, fullResultBundle: resultPath, ...(code === 0 && fs.existsSync(executable) ? { app, executableSha256: createHash('sha256').update(fs.readFileSync(executable)).digest('hex') } : {}) }));
  process.exitCode = code ?? 1;
});
