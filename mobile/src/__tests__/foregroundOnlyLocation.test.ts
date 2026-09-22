import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { foregroundOnlyManifest, LOCATION_TASK_SERVICE } = require('../../plugins/withForegroundOnlyLocation.js');

const manifest = (services?: unknown) => ({ manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, application: [{ $: { 'android:name': '.MainApplication' }, ...(services === undefined ? {} : { service: services }) }] } });
describe('foreground-only Android location manifest', () => {
  it('removes only the background location service and retains unrelated services', () => {
    const other = { $: { 'android:name': 'owned.notification.Service', 'android:exported': 'false' } };
    const input = manifest([{ $: { 'android:name': LOCATION_TASK_SERVICE, 'android:foregroundServiceType': 'location' } }, other]);
    const result = foregroundOnlyManifest(input);
    expect(result.manifest.application[0].service).toEqual([other, { $: { 'android:name': LOCATION_TASK_SERVICE, 'tools:node': 'remove' } }]);
    expect(result.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    expect(result.manifest.application[0].$['android:name']).toBe('.MainApplication');
  });
  it('handles missing services and is idempotent across CNG regeneration', () => {
    const once = foregroundOnlyManifest(manifest());
    expect(foregroundOnlyManifest(once)).toEqual(once);
    expect(once.manifest.application[0].service).toHaveLength(1);
  });
  it('fails closed on malformed service declarations or missing application', () => {
    expect(() => foregroundOnlyManifest(manifest({}))).toThrow('Unrecognized');
    expect(() => foregroundOnlyManifest({ manifest: { $: {}, application: [] } })).toThrow();
  });
  it('keeps dangerous overlay permissions blocked and the plugin after expo-location', () => {
    const config = require('../../app.config.js').expo;
    expect(config.android.blockedPermissions).toContain('android.permission.SYSTEM_ALERT_WINDOW');
    const index = config.plugins.findIndex((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-location');
    expect(config.plugins.indexOf('./plugins/withForegroundOnlyLocation')).toBeGreaterThan(index);
    expect(config.plugins[index][1]).toMatchObject({ isAndroidForegroundServiceEnabled: false, isAndroidBackgroundLocationEnabled: false });
  });
});
