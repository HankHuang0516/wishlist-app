const { ORIGINAL_BUNDLE, iosQaBundle, iosQaRunnerBundle, iosHostEnvironment, assertIosQaBuild, assignedUdid } = require('../../../mobile/scripts/ios-qa-config.cjs');
describe('isolated iOS native QA boundaries', () => {
    const qa = { WISHLIST_NATIVE_QA: '1', WISHLIST_QA_SUFFIX: '.qa202609152140', CONFIGURATION: 'Debug', PLATFORM_NAME: 'iphonesimulator',
        PRODUCT_BUNDLE_IDENTIFIER: 'com.hankhuang.weesh.qa202609152140', WISHLIST_URL_SCHEME: 'wishlistqa202609152140', WISHLIST_QA_SWIFT_FLAGS: '-D WISHLIST_NATIVE_QA' };
    it('preserves the original identity and separates QA app and runner', () => {
        expect(ORIGINAL_BUNDLE).toBe('com.hankhuang.weesh');
        expect(iosQaBundle('202609152140')).toBe(qa.PRODUCT_BUNDLE_IDENTIFIER);
        expect(iosQaRunnerBundle('202609152140')).toBe('com.hankhuang.wishlistnativeqa.qa202609152140');
        expect(assertIosQaBuild(qa)).toBe('isolated-debug');
    });
    it('does not change normal builds without QA opt-in', () => { expect(assertIosQaBuild({ CONFIGURATION: 'Release' })).toBe('normal'); });
    it.each([{ ...qa, CONFIGURATION: 'Release' }, { ...qa, PLATFORM_NAME: 'iphoneos' }, { ...qa, WISHLIST_QA_SUFFIX: '.qa' },
        { ...qa, PRODUCT_BUNDLE_IDENTIFIER: ORIGINAL_BUNDLE }, { ...qa, WISHLIST_URL_SCHEME: 'weesh' }, { ...qa, WISHLIST_QA_SWIFT_FLAGS: '-D DEBUG' },
        { ...qa, WISHLIST_NATIVE_QA: '0' }, { ...qa, WISHLIST_NATIVE_QA: undefined }])('rejects unsafe QA build settings %p', env => {
        expect(() => assertIosQaBuild(env)).toThrow();
    });
    it('constructs a clean environment without inheriting provider/signing settings', () => {
        expect(iosHostEnvironment('/runtime/bin/node', '/actual-home', '/actual-temp')).toEqual({
            PATH: '/runtime/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: '/actual-home', TMPDIR: '/actual-temp',
            DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer', NODE_BINARY: '/runtime/bin/node', NODE_ENV: 'development',
            EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1', CI: '1', LANG: 'en_US.UTF-8', TZ: 'Asia/Taipei',
        });
    });
    it.each([{}, { SIM_MANAGER_UDID: '04D84B5C-1960-466E-8851-3A21D1C93917' }, { SIM_MANAGER_TOKEN: 'lease', SIM_MANAGER_UDID: 'booted' },
        { SIM_MANAGER_TOKEN: 'lease', SIM_MANAGER_UDID: 'other-device' }])('rejects an implicit/unleased device %p', env => {
        expect(() => assignedUdid(env)).toThrow();
    });
    it('accepts only the explicit supervised UDID', () => {
        expect(assignedUdid({ SIM_MANAGER_TOKEN: 'lease', SIM_MANAGER_UDID: '04D84B5C-1960-466E-8851-3A21D1C93917' })).toBe('04D84B5C-1960-466E-8851-3A21D1C93917');
    });
});
