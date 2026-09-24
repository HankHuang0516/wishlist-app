// Exact, deterministic Android QA provenance. Include every mobile business
// source plus the native and controller inputs that can change the built App or
// the meaning of a runtime pass.
const fs = require('node:fs');
const path = require('node:path');

function filesBelow(root, relative) {
  const directory = path.join(root, relative);
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...filesBelow(root, child));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) output.push(child);
    else if (!entry.isFile()) throw new Error('Android QA source tree must contain only regular files/directories');
  }
  return output;
}

function androidQaSources(mobile, { includeInstrumentation = true } = {}) {
  const fixed = [
    'App.tsx', 'app.config.js', 'package.json', 'package-lock.json', 'tsconfig.json',
    'android/build.gradle', 'android/gradle.properties', 'android/settings.gradle',
    'android/gradle/wrapper/gradle-wrapper.properties', 'android/app/build.gradle',
    'android/app/proguard-rules.pro', 'android/app/src/main/AndroidManifest.xml',
    'android/app/src/debug/AndroidManifest.xml',
    'android/app/src/main/java/com/hank_huang0516/snack425e646aa6a74ad8a964aadeb4741fc1/MainActivity.kt',
    'android/app/src/main/java/com/hank_huang0516/snack425e646aa6a74ad8a964aadeb4741fc1/MainApplication.kt',
    'plugins/withForegroundOnlyLocation.js', 'plugins/withReleaseSigning.js',
    'scripts/android-native-qa.cjs', 'scripts/android-qa-config.cjs', 'scripts/android-qa-input.cjs',
    'scripts/android-qa-sources.cjs', 'scripts/build-android-qa.cjs', 'scripts/metro-qa-probe.cjs',
    'scripts/native-qa.cjs', 'scripts/native-qa-api-smoke.cjs', 'scripts/native-qa-marketplace-fixture.cjs', 'scripts/native-qa-worker.cjs',
    'scripts/test-native-qa-marketplace-fixture.cjs',
  ];
  if (includeInstrumentation) fixed.push(
    'android/app/src/androidTest/java/com/hank_huang0516/snack425e646aa6a74ad8a964aadeb4741fc1/NativeQaTest.kt');
  else fixed.push('scripts/build-android-debug-qa.cjs');
  const sources = [...fixed, ...filesBelow(mobile, 'src')].sort();
  if (new Set(sources).size !== sources.length) throw new Error('Duplicate Android QA source provenance');
  for (const source of sources) {
    const absolute = path.join(mobile, source);
    if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) throw new Error('Android QA source missing');
  }
  return sources;
}

module.exports = { androidQaSources };
