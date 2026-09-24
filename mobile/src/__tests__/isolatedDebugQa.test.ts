import { describe, expect, it } from 'vitest';
const { isolatedDebugQa, isolatedIosQaMetro, isolatedIosQaInput } = require('../../plugins/withIsolatedDebugQa.js');

const template = `android { buildTypes {
    debug {
        signingConfig signingConfigs.debug
    }
    release {
        signingConfig signingConfigs.release
    }
} }`;

describe('isolated Android debug QA package', () => {
  it('adds an explicit validated suffix to debug only', () => {
    const result = isolatedDebugQa(template);
    expect(result).toContain('applicationIdSuffix wishlistNativeQaSuffix');
    expect(result).toContain("findProperty('wishlistNativeQa')");
    expect(result.slice(result.indexOf('release {'))).toBe(template.slice(template.indexOf('release {')));
    expect(isolatedDebugQa(result)).toBe(result);
  });
  it('refuses an unknown native template', () => expect(() => isolatedDebugQa('android {}')).toThrow());
});

describe('isolated iOS debug QA Metro location', () => {
  const appDelegate = `@main
class AppDelegate: ExpoAppDelegate {
  public override func application() -> Bool {
    let delegate = ReactNativeDelegate()
    return true
  }
}`;
  it('adds an identity-guarded Metro location only under the QA compile flag', () => {
    const result = isolatedIosQaMetro(appDelegate);
    expect(result).toContain('#if WISHLIST_NATIVE_QA');
    expect(result).toContain('127.0.0.1:18887');
    expect(result).toContain('^com\\\\.hankhuang\\\\.weesh\\\\.qa[0-9]{12}$');
    expect(isolatedIosQaMetro(result)).toBe(result);
  });
  it('refuses unfamiliar or partial native source', () => {
    expect(() => isolatedIosQaMetro('class AppDelegate {}')).toThrow();
    expect(() => isolatedIosQaMetro('#if WISHLIST_NATIVE_QA\n    let delegate = ReactNativeDelegate()')).toThrow();
  });
  it('adds only a compile-gated private input bridge and is idempotent', () => {
    const template = `import ReactAppDependencyProvider\n\n@main\nclass AppDelegate: ExpoAppDelegate {\n  var window: UIWindow?\n  public override func application() -> Bool {\n    let delegate = ReactNativeDelegate()\n    return true\n  }\n}`;
    const generated = isolatedIosQaInput(isolatedIosQaMetro(template));
    expect(generated).toContain('private final class WishlistQaInputBridge');
    expect(generated).toContain('private var qaInputBridge: WishlistQaInputBridge?');
    expect(generated).toContain('startIfEnabled(bundle: qaIdentity)');
    expect(generated).toContain('URLSessionConfiguration.ephemeral');
    expect(isolatedIosQaInput(generated)).toBe(generated);
    expect(isolatedIosQaInput(isolatedIosQaMetro(generated))).toBe(generated);
    expect(() => isolatedIosQaInput(generated.replace('startIfEnabled(bundle: qaIdentity)', 'removed'))).toThrow();
  });
});
