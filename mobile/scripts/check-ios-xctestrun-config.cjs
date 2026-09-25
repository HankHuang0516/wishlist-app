// Host-only check kept outside Vitest's .test file discovery.
const test = require('node:test');
const assert = require('node:assert/strict');
const { destinationTestRun } = require('./ios-xctestrun-config.cjs');

const template = {
  __xctestrun_metadata__: { FormatVersion: 1 },
  WishlistNativeQa: {
    IsUITestBundle: true,
    UseUITargetAppProvidedByTests: true,
    BlueprintName: 'WishlistNativeQa',
    TestHostBundleIdentifier: 'com.hankhuang.wishlistnativeqa.qa202609251125.xctrunner',
    TestingEnvironmentVariables: {},
    UITargetAppEnvironmentVariables: {},
    EnvironmentVariables: {},
    TestHostPath: '__TESTROOT__/WishlistNativeQa-Runner.app',
    TestBundlePath: '__TESTROOT__/WishlistNativeQa.xctest',
    DependentProductPaths: [],
  },
};

test('two serial MiniMax images get an extended native-test budget only for that flow', () => {
  const twoAi = destinationTestRun(template, '202609251125', '/tmp/isolated-ios-test-products', 34567,
    'listing-batch-two-ai-photos').WishlistNativeQa;
  const oneAi = destinationTestRun(template, '202609251125', '/tmp/isolated-ios-test-products', 34567,
    'listing-batch-ai-photo').WishlistNativeQa;
  const publishOne = destinationTestRun(template, '202609251125', '/tmp/isolated-ios-test-products', 34567,
    'listing-batch-two-ai-publish-one').WishlistNativeQa;
  assert.deepEqual(twoAi.OnlyTestIdentifiers, ['NativeQaTests/test12RealLoginListingBatchTwoAiPhotos']);
  assert.deepEqual(publishOne.OnlyTestIdentifiers, ['NativeQaTests/test13RealLoginListingBatchTwoAiPublishOne']);
  assert.equal(twoAi.MaximumTestExecutionTimeAllowance, 500);
  assert.equal(publishOne.MaximumTestExecutionTimeAllowance, 620);
  assert.equal(oneAi.MaximumTestExecutionTimeAllowance, 240);
  assert.equal(template.WishlistNativeQa.MaximumTestExecutionTimeAllowance, undefined);
});
