import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { hardenGradle, hardenProperties } = require('../../plugins/withReleaseSigning.js');

const template = `signingConfigs { debug { storeFile file('debug.keystore') } }
buildTypes {
 debug { signingConfig signingConfigs.debug }
 release { signingConfig signingConfigs.debug }
}`;

describe('release signing fail-closed config plugin', () => {
  it('uses runtime-only release credentials, never the debug key', () => {
    const result = hardenGradle(template);
    expect(result).toContain('release { signingConfig signingConfigs.release }');
    expect(result).toContain("System.getenv('WISHLIST_KEYSTORE_FILE')");
    expect(result).toContain('.missing-release-keystore');
    expect(result).toContain('debug { signingConfig signingConfigs.debug }');
  });
  it('is idempotent across repeated prebuilds', () => {
    expect(hardenGradle(hardenGradle(template))).toBe(hardenGradle(template));
  });
  it('refuses a template it cannot safely modify', () => {
    expect(() => hardenGradle('unknown template')).toThrow();
  });
  it('enables release R8/resource shrinking without duplicates or changing unrelated properties', () => {
    const properties = [{ type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' }, { type: 'property', key: 'hermesEnabled', value: 'true' }];
    const result = hardenProperties(properties);
    expect(result).toContainEqual({ type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' });
    expect(result).toContainEqual({ type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' });
    expect(result).toContainEqual(properties[1]); expect(hardenProperties(result)).toEqual(result);
  });
});
