#!/usr/bin/env node
// Runtime credential references only. This produces a LOCAL validation build;
// it does not upload, release, modify track state, generate or rotate keys.
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { alignAndroidGradle } = require('./sync-android-version.cjs');
const mobile = path.resolve(__dirname, '..');
const { getApiUrl } = require('../../server/dist/config/constants.js');
const java = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const sdk = '/Users/hank/Library/Android/sdk';
const keystore = '/Users/hank/.local/share/AiHankApps/credentials/weesh/upload.jks';
const target = process.argv[2] ?? 'bundleRelease';
if (!['bundleRelease', 'assembleRelease', 'assembleDebug'].includes(target)) throw new Error('Unsupported local build task');
const disk = fs.statfsSync(mobile);
if (disk.bavail * disk.bsize < 15 * 1024 ** 3) throw new Error('At least 15 GiB free space is required by the local native-build safety guard; no credentials were read and no build was started');
for (const required of [path.join(java, 'bin', 'java'), sdk, keystore, path.join(mobile, 'android', 'gradlew')]) if (!fs.existsSync(required)) throw new Error('Existing local Android build prerequisite is missing');
if ((fs.statSync(keystore).mode & 0o077) !== 0) throw new Error('Upload key is not privately stored');
const { expo } = require('../app.config.js');
const gradleFile = path.join(mobile, 'android', 'app', 'build.gradle');
const gradle = fs.readFileSync(gradleFile, 'utf8');
const alignedGradle = alignAndroidGradle(gradle, {
  packageName: expo.android.package,
  versionCode: expo.android.versionCode,
  versionName: expo.version,
});
if (alignedGradle !== gradle) fs.writeFileSync(gradleFile, alignedGradle);
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, EXPO_PUBLIC_API_URL: getApiUrl(), NODE_ENV: target === 'assembleDebug' ? 'development' : 'production',
  PATH: `${path.dirname(process.execPath)}:${path.join(java, 'bin')}:${process.env.PATH}` };
if (target !== 'assembleDebug') {
  const password = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'com.aihankapps.weesh.upload-store-password', '-a', 'AiHankApps', '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r?\n$/, '');
  if (!password) throw new Error('Existing upload password is unavailable');
  Object.assign(env, { WISHLIST_KEYSTORE_FILE: keystore, WISHLIST_KEYSTORE_PASSWORD: password, WISHLIST_KEY_ALIAS: 'upload', WISHLIST_KEY_PASSWORD: password });
}
const result = spawnSync('./gradlew', [target, '--console=plain', '--max-workers=4'], { cwd: path.join(mobile, 'android'), env, stdio: 'inherit' });
if (result.error) { console.error('Local Android build process could not start'); process.exitCode = 1; }
else process.exitCode = result.status ?? 1;
