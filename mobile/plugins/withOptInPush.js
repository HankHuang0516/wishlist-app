const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

// FCM otherwise generates an installation registration at startup, before the
// app's explicit notification choice. Both SDK flags are required by Firebase.
const OPT_IN_FLAGS = ['firebase_messaging_auto_init_enabled', 'firebase_analytics_collection_enabled'];
function optInPushManifest(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  if (app['meta-data'] !== undefined && !Array.isArray(app['meta-data'])) throw new Error('Unrecognized Android metadata');
  app['meta-data'] = [
    ...(app['meta-data'] ?? []).filter(row => !OPT_IN_FLAGS.includes(row.$?.['android:name'])),
    ...OPT_IN_FLAGS.map(name => ({ $: { 'android:name': name, 'android:value': 'false' } })),
  ];
  return manifest;
}
module.exports = config => withAndroidManifest(config, mod => {
  mod.modResults = optInPushManifest(mod.modResults);
  return mod;
});
module.exports.optInPushManifest = optInPushManifest;
module.exports.OPT_IN_FLAGS = OPT_IN_FLAGS;
