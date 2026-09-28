const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withAppDelegate, withDangerousMod } = require('expo/config-plugins');

// Only an explicit debug QA build may use a distinct package. Release keeps
// the production applicationId and its existing signing configuration.
function isolatedDebugQa(source) {
  const marker = 'wishlistNativeQaSuffix';
  if (source.includes(marker)) return source;
  const pattern = /(buildTypes\s*\{\s*debug\s*\{\s*signingConfig signingConfigs\.debug)/;
  if (!pattern.test(source)) throw new Error('Unrecognized Android debug block; refusing QA suffix injection');
  const suffix = `
            if ((findProperty('wishlistNativeQa') ?: 'false').toBoolean()) {
                def wishlistNativeQaSuffix = findProperty('wishlistNativeQaSuffix') ?: ''
                if (!(wishlistNativeQaSuffix ==~ /\\.qa[0-9]{12}/)) throw new GradleException('Invalid isolated QA package suffix')
                applicationIdSuffix wishlistNativeQaSuffix
            }`;
  return source.replace(pattern, `$1${suffix}`);
}

// A non-debuggable, statically bundled visual-QA APK with a distinct identity.
// It inherits Release optimization but never inherits the upload signing key.
// The normal release build type and store package are untouched.
const visualQaBlock = `if ((findProperty('wishlistVisualQa') ?: 'false').toBoolean()) {
            visualQa {
                initWith release
                def wishlistVisualQaSuffix = findProperty('wishlistVisualQaSuffix') ?: ''
                if (!(wishlistVisualQaSuffix ==~ /\\.visualqa[0-9]{12}/)) throw new GradleException('Invalid visual QA package suffix')
                applicationIdSuffix wishlistVisualQaSuffix
                signingConfig signingConfigs.debug
                debuggable false
                matchingFallbacks = ['release']
            }
        }`;
function isolatedVisualQa(source) {
  if (source.includes('wishlistVisualQaSuffix')) {
    if (!source.includes(visualQaBlock)) throw new Error('Unknown partial visual QA Gradle configuration');
    return source;
  }
  const pattern = /(buildTypes\s*\{\s*)debug\s*\{/;
  if (!pattern.test(source) || !/(release\s*\{[^{}]*?)signingConfig signingConfigs\.release/.test(source))
    throw new Error('Unrecognized Release signing or build-type layout; refusing visual QA injection');
  return source.replace(pattern, `$1${visualQaBlock}\n        debug {`);
}

const visualQaManifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    <!-- This source set exists only for the opt-in, non-store visualQa build type. -->
    <application android:usesCleartextTraffic="true" tools:targetApi="28"
        tools:replace="android:usesCleartextTraffic" />
</manifest>\n`;

// React-Core is prebuilt, so the xcodebuild RCT_METRO_PORT setting alone does
// not change its default. This branch is compiled only for isolated iOS QA.
const iosQaMetroPrelude = String.raw`#if WISHLIST_NATIVE_QA
    // React-Core is supplied as a prebuilt framework, so an xcodebuild-only
    // RCT_METRO_PORT setting cannot change its compiled default of 8081.
    // Route only the isolated QA identity to our private Metro instance.
    let qaIdentity = Bundle.main.bundleIdentifier ?? ""
    guard qaIdentity.range(of: "^com\\.hankhuang\\.weesh\\.qa[0-9]{12}$", options: .regularExpression) != nil else {
      fatalError("Native QA compilation requires an isolated App identity")
    }
    UserDefaults.standard.set("127.0.0.1:18887", forKey: "RCT_jsLocation")
#endif
`;

function isolatedIosQaMetro(source) {
  if (source.includes(iosQaMetroPrelude)) return source;
  if (source.includes('    // React-Core is supplied as a prebuilt framework')) {
    if (!source.includes('    UserDefaults.standard.set("127.0.0.1:18887", forKey: "RCT_jsLocation")') ||
      !source.includes('    let qaIdentity = Bundle.main.bundleIdentifier ?? ""')) throw new Error('Partial iOS QA Metro prelude');
    return source;
  }
  if (source.includes('#if WISHLIST_NATIVE_QA')) throw new Error('Unknown partial iOS QA prelude');
  const anchor = '    let delegate = ReactNativeDelegate()';
  if (source.split(anchor).length !== 2) throw new Error('Unrecognized iOS AppDelegate; refusing QA Metro injection');
  return source.replace(anchor, iosQaMetroPrelude + anchor);
}

const iosQaInputBridge = fs.readFileSync(path.join(__dirname, 'iosQaInputBridge.swift'), 'utf8');
function isolatedIosQaInput(source) {
  const start = '    qaInputBridge = WishlistQaInputBridge.startIfEnabled(bundle: qaIdentity)';
  const property = '#if WISHLIST_NATIVE_QA\n  private var qaInputBridge: WishlistQaInputBridge?\n#endif\n';
  if (source.includes(iosQaInputBridge)) {
    if (!source.includes(start) || !source.includes(property)) throw new Error('Partial iOS QA input bridge');
    return source;
  }
  if (source.includes('private final class WishlistQaInputBridge')) throw new Error('Unknown iOS QA input bridge');
  const imports = 'import ReactAppDependencyProvider\n\n';
  const window = '  var window: UIWindow?\n';
  const metro = '    UserDefaults.standard.set("127.0.0.1:18887", forKey: "RCT_jsLocation")\n';
  for (const anchor of [imports, window, metro]) {
    if (source.split(anchor).length !== 2) throw new Error('Unrecognized iOS AppDelegate; refusing QA input injection');
  }
  return source.replace(imports, imports + iosQaInputBridge + '\n')
    .replace(window, window + property)
    .replace(metro, metro + start + '\n');
}

module.exports = config => {
  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Only the audited Groovy Android layout is supported');
    mod.modResults.contents = isolatedVisualQa(isolatedDebugQa(mod.modResults.contents));
    return mod;
  });
  config = withDangerousMod(config, ['android', async mod => {
    const file = path.join(mod.modRequest.platformProjectRoot, 'app/src/visualQa/AndroidManifest.xml');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== visualQaManifest)
      throw new Error('Unknown visual QA Android manifest; refusing overwrite');
    if (!fs.existsSync(file)) fs.writeFileSync(file, visualQaManifest, { flag: 'wx' });
    return mod;
  }]);
  return withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('Only the audited Swift iOS layout is supported');
    mod.modResults.contents = isolatedIosQaInput(isolatedIosQaMetro(mod.modResults.contents));
    return mod;
  });
};
module.exports.isolatedDebugQa = isolatedDebugQa;
module.exports.isolatedVisualQa = isolatedVisualQa;
module.exports.visualQaManifest = visualQaManifest;
module.exports.isolatedIosQaMetro = isolatedIosQaMetro;
module.exports.isolatedIosQaInput = isolatedIosQaInput;
