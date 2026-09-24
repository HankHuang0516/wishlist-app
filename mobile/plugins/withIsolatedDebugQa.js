const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withAppDelegate } = require('expo/config-plugins');

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
    mod.modResults.contents = isolatedDebugQa(mod.modResults.contents);
    return mod;
  });
  return withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('Only the audited Swift iOS layout is supported');
    mod.modResults.contents = isolatedIosQaInput(isolatedIosQaMetro(mod.modResults.contents));
    return mod;
  });
};
module.exports.isolatedDebugQa = isolatedDebugQa;
module.exports.isolatedIosQaMetro = isolatedIosQaMetro;
module.exports.isolatedIosQaInput = isolatedIosQaInput;
