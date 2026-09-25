import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { expo } = require('../../app.config.js');
const options = (name: string) => expo.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === name)[1];

describe('native identity and minimal permissions', () => {
  it('preserves both published app identities and the original EAS project', () => {
    expect(expo.ios.bundleIdentifier).toBe('com.hankhuang.weesh');
    expect(expo.android.package).toBe('com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1');
    expect(expo.extra.eas.projectId).toBe('1f7233de-f650-4938-a46d-97b419832519');
  });

  it('keeps iPad support required by the previously published iOS app', () => {
    expect(expo.ios.supportsTablet).toBe(true);
    expect(Number(expo.ios.buildNumber)).toBeGreaterThan(2);
    expect(expo.ios.infoPlist['UISupportedInterfaceOrientations~ipad']).toEqual([
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationPortraitUpsideDown',
      'UIInterfaceOrientationLandscapeLeft',
      'UIInterfaceOrientationLandscapeRight',
    ]);
  });

  it('does not request background location, motion or unnecessary biometrics', () => {
    expect(options('expo-location')).toMatchObject({
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
      motionUsagePermission: false,
      isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false,
      isAndroidForegroundServiceEnabled: false,
    });
    expect(options('expo-secure-store')).toMatchObject({ faceIDPermission: false, configureAndroidBackup: false });
    expect(expo.android.allowBackup).toBe(false);
  });

  it('blocks broad media, audio, contact and background location permissions', () => {
    expect(options('expo-image-picker').microphonePermission).toBe(false);
    expect(expo.android.blockedPermissions).toEqual(expect.arrayContaining([
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.READ_CONTACTS',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
    ]));
  });
});
