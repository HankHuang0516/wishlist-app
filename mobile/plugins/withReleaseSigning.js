const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

function hardenGradle(source) {
  const localRelease = `release {
            // Values are resolved at build runtime only, never stored in Gradle.
            storeFile file(System.getenv('WISHLIST_KEYSTORE_FILE') ?: '.missing-release-keystore')
            storePassword System.getenv('WISHLIST_KEYSTORE_PASSWORD')
            keyAlias System.getenv('WISHLIST_KEY_ALIAS')
            keyPassword System.getenv('WISHLIST_KEY_PASSWORD')
        }
        `;
  if (!source.includes('.missing-release-keystore')) {
    if (!/signingConfigs\s*\{\s*debug\s*\{/.test(source)) throw new Error('Unrecognized signing block; refusing an unsafe release configuration');
    source = source.replace(/(signingConfigs\s*\{\s*)debug\s*\{/, `$1${localRelease}debug {`);
  }
  source = source.replace(/(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/g, '$1signingConfig signingConfigs.release');
  if (/(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/.test(source) ||
      !/(release\s*\{[^{}]*?)signingConfig signingConfigs\.release/.test(source)) {
    throw new Error('Release still uses the debug keystore');
  }
  return source;
}

function hardenProperties(properties) {
  const required = { 'android.enableMinifyInReleaseBuilds': 'true', 'android.enableShrinkResourcesInReleaseBuilds': 'true' };
  return [...properties.filter(entry => !(entry.type === 'property' && Object.hasOwn(required, entry.key))),
    ...Object.entries(required).map(([key, value]) => ({ type: 'property', key, value }))];
}
module.exports = config => {
  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Only the audited Groovy signing layout is supported');
    mod.modResults.contents = hardenGradle(mod.modResults.contents);
    return mod;
  });
  return withGradleProperties(config, mod => { mod.modResults = hardenProperties(mod.modResults); return mod; });
};
module.exports.hardenGradle = hardenGradle;
module.exports.hardenProperties = hardenProperties;
