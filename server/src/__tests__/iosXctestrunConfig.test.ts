const { destinationTestRun, anonymousSummaryPassed, iosSummaryPassed, TESTS,
    AUTHENTICATED_MARKETPLACE_DISCOVERY_TESTS, AUTHENTICATED_MARKETPLACE_CHAT_TESTS,
    AUTHENTICATED_MARKETPLACE_MEETUP_TESTS, AUTHENTICATED_DELETION_TESTS,
    AUTHENTICATED_LISTING_BATCH_TESTS, AUTHENTICATED_LISTING_PHOTO_TESTS,
    AUTHENTICATED_LISTING_TWO_PHOTO_TESTS } = require('../../../mobile/scripts/ios-xctestrun-config.cjs');
const label = '202609152142', udid = '04D84B5C-1960-466E-8851-3A21D1C93917';
const template = () => ({ __xctestrun_metadata__: { FormatVersion: 1 }, WishlistNativeQa: {
    IsUITestBundle: true, UseUITargetAppProvidedByTests: true, BlueprintName: 'WishlistNativeQa', TestHostBundleIdentifier: 'com.hankhuang.wishlistnativeqa.qa' + label + '.xctrunner',
    TestHostPath: '__TESTROOT__/runner.app', TestBundlePath: '__TESTHOST__/PlugIns/test.xctest', UITargetAppPath: '__TESTROOT__/app.app',
    DependentProductPaths: ['__TESTROOT__/runner.app'], TestingEnvironmentVariables: { DYLD_FRAMEWORK_PATH: '__TESTROOT__/Debug:__PLATFORMS__/Frameworks' },
    UITargetAppEnvironmentVariables: {}, EnvironmentVariables: { TERM: 'dumb' },
    SystemAttachmentLifetime: 'deleteOnSuccess', UserAttachmentLifetime: 'deleteOnSuccess',
} });
const goodSummary = () => ({ result: 'Passed', totalTestCount: 2, passedTests: 2, failedTests: 0, skippedTests: 0, expectedFailures: 0,
    devicesAndConfigurations: [{ device: { deviceId: udid }, passedTests: 2, failedTests: 0, skippedTests: 0 }] });
describe('supervised destination-only anonymous Xcode tests', () => {
    it('passes only the public private-broker port, never actor values, for the isolated genuine marketplace method', () => {
        const qa = destinationTestRun(template(), label, '/products', 23456, 'marketplace-discovery').WishlistNativeQa;
        expect(qa.OnlyTestIdentifiers).toEqual(AUTHENTICATED_MARKETPLACE_DISCOVERY_TESTS);
        expect(qa.EnvironmentVariables).toEqual({ TERM: 'dumb', NATIVE_QA_PACKAGE: 'com.hankhuang.weesh.qa' + label, NATIVE_QA_INPUT_PORT: '23456' });
        const summary = goodSummary(); summary.totalTestCount = 1; summary.passedTests = 1; summary.devicesAndConfigurations[0].passedTests = 1;
        expect(iosSummaryPassed(summary, udid, 1)).toBe(true); expect(anonymousSummaryPassed(summary, udid)).toBe(false);
        expect(iosSummaryPassed(summary, udid, 3)).toBe(false);
    });
    it.each([
        ['marketplace-chat', AUTHENTICATED_MARKETPLACE_CHAT_TESTS],
        ['marketplace-meetup', AUTHENTICATED_MARKETPLACE_MEETUP_TESTS],
    ])('selects the independent genuine %s method', (flow, expected) => {
        expect(destinationTestRun(template(), label, '/products', 23456, flow).WishlistNativeQa.OnlyTestIdentifiers).toEqual(expected);
    });
    it('selects the independent genuine deletion flow with the same credential-free broker contract', () => {
        const qa = destinationTestRun(template(), label, '/products', 23456, 'deletion').WishlistNativeQa;
        expect(qa.OnlyTestIdentifiers).toEqual(AUTHENTICATED_DELETION_TESTS);
        expect(qa.EnvironmentVariables).toEqual({ TERM: 'dumb', NATIVE_QA_PACKAGE: 'com.hankhuang.weesh.qa' + label, NATIVE_QA_INPUT_PORT: '23456' });
    });
    it('selects only the isolated listing-batch entry check', () => {
        const qa = destinationTestRun(template(), label, '/products', 23456, 'listing-batch-entry').WishlistNativeQa;
        expect(qa.OnlyTestIdentifiers).toEqual(AUTHENTICATED_LISTING_BATCH_TESTS);
        expect(qa.EnvironmentVariables).toEqual({ TERM: 'dumb', NATIVE_QA_PACKAGE: 'com.hankhuang.weesh.qa' + label, NATIVE_QA_INPUT_PORT: '23456' });
    });
    it('selects only the isolated photo-upload check', () => {
        const qa = destinationTestRun(template(), label, '/products', 23456, 'listing-batch-photo').WishlistNativeQa;
        expect(qa.OnlyTestIdentifiers).toEqual(AUTHENTICATED_LISTING_PHOTO_TESTS);
        expect(qa.EnvironmentVariables).toEqual({ TERM: 'dumb', NATIVE_QA_PACKAGE: 'com.hankhuang.weesh.qa' + label, NATIVE_QA_INPUT_PORT: '23456' });
    });
    it('selects only the isolated two-photo batch check', () => {
        const qa = destinationTestRun(template(), label, '/products', 23456, 'listing-batch-two-photos').WishlistNativeQa;
        expect(qa.OnlyTestIdentifiers).toEqual(AUTHENTICATED_LISTING_TWO_PHOTO_TESTS);
    });
    it.each([0, 1023, 65536, 23456.5, '23456', null])('rejects unsafe private input port %p', port => {
        expect(() => destinationTestRun(template(), label, '/products', port, 'marketplace-discovery')).toThrow();
    });
    it.each([undefined, 'unknown', '', null])('rejects authenticated input without an exact flow %p', flow => {
        expect(() => destinationTestRun(template(), label, '/products', 23456, flow)).toThrow();
    });
    it.each(['marketplace-discovery', 'marketplace-chat', 'marketplace-meetup', 'deletion', 'listing-batch-entry', 'listing-batch-photo', 'listing-batch-two-photos'])('rejects anonymous execution with authenticated flow %s', flow => {
        expect(() => destinationTestRun(template(), label, '/products', undefined, flow)).toThrow();
    });
    it('uses a fresh generated runner and provided unique App, exact two methods and no automatic system screenshots', () => {
        const source = template(), result = destinationTestRun(source, label, '/original/products'), qa = result.WishlistNativeQa;
        expect(qa.UseDestinationArtifacts).toBeUndefined(); expect(qa.UseUITargetAppProvidedByTests).toBe(true); expect(qa.ParallelizationEnabled).toBe(false);
        expect(qa.TestHostBundleIdentifier).toBe('com.hankhuang.wishlistnativeqa.qa' + label + '.xctrunner');
        expect(qa.UITargetAppBundleIdentifier).toBeUndefined(); expect(qa.TestBundleDestinationRelativePath).toBeUndefined();
        expect(qa.TestHostPath).toBe('/original/products/runner.app'); expect(qa.TestBundlePath).toBe('__TESTHOST__/PlugIns/test.xctest'); expect(qa.UITargetAppPath).toBeUndefined();
        expect(qa.DependentProductPaths).toEqual(['/original/products/runner.app']); expect(qa.OnlyTestIdentifiers).toEqual(TESTS);
        expect(qa.SystemAttachmentLifetime).toBe('keepNever'); expect(qa.UserAttachmentLifetime).toBe('keepAlways');
        expect(qa.EnvironmentVariables).toEqual({ TERM: 'dumb', NATIVE_QA_PACKAGE: 'com.hankhuang.weesh.qa' + label });
        expect(qa.TestingEnvironmentVariables.DYLD_FRAMEWORK_PATH).toBe('/original/products/Debug:__PLATFORMS__/Frameworks');
        expect(source.WishlistNativeQa.SystemAttachmentLifetime).toBe('deleteOnSuccess');
    });
    it.each(['version', 'extra-target', 'runner', 'ui-test', 'relative-root', 'missing-env'])('rejects unsafe template %s', field => {
        const source: any = template();
        if (field === 'version') source.__xctestrun_metadata__.FormatVersion = 2;
        if (field === 'extra-target') source.Other = {};
        if (field === 'runner') source.WishlistNativeQa.TestHostBundleIdentifier = 'com.hankhuang.weesh';
        if (field === 'ui-test') source.WishlistNativeQa.IsUITestBundle = false;
        if (field === 'missing-env') delete source.WishlistNativeQa.EnvironmentVariables;
        expect(() => destinationTestRun(source, label, field === 'relative-root' ? 'relative' : '/products')).toThrow();
    });
    it('accepts only two genuinely passed methods on its assigned device', () => { expect(anonymousSummaryPassed(goodSummary(), udid)).toBe(true); });
    it.each(['result', 'count', 'failed', 'skipped', 'expected', 'device', 'second-device', 'missing'])('does not convert partial or foreign %s into a pass', field => {
        const result: any = goodSummary();
        if (field === 'result') result.result = 'Failed';
        if (field === 'count') result.totalTestCount = 1;
        if (field === 'failed') result.failedTests = 1;
        if (field === 'skipped') result.skippedTests = 1;
        if (field === 'expected') result.expectedFailures = 1;
        if (field === 'device') result.devicesAndConfigurations[0].device.deviceId = 'foreign';
        if (field === 'second-device') result.devicesAndConfigurations.push(result.devicesAndConfigurations[0]);
        expect(anonymousSummaryPassed(field === 'missing' ? undefined : result, udid)).toBe(false);
    });
});
