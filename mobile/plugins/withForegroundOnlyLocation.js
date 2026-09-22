const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');
const LOCATION_TASK_SERVICE = 'expo.modules.location.services.LocationTaskService';

function foregroundOnlyManifest(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  manifest.manifest.$ = { ...manifest.manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
  if (application.service !== undefined && !Array.isArray(application.service)) throw new Error('Unrecognized Android service declarations');
  application.service = [...(application.service ?? []).filter(service => service.$?.['android:name'] !== LOCATION_TASK_SERVICE),
    { $: { 'android:name': LOCATION_TASK_SERVICE, 'tools:node': 'remove' } }];
  return manifest;
}

// Expo's foreground-service option disables permissions, but its library
// manifest still declares the background task service. This app uses only
// foreground getCurrentPositionAsync, never startLocationUpdatesAsync.
module.exports = config => withAndroidManifest(config, mod => {
  mod.modResults = foregroundOnlyManifest(mod.modResults);
  return mod;
});
module.exports.foregroundOnlyManifest = foregroundOnlyManifest;
module.exports.LOCATION_TASK_SERVICE = LOCATION_TASK_SERVICE;
