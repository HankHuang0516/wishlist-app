const path = require('node:path');
const { iosQaBundle, iosQaRunnerBundle } = require('./ios-qa-config.cjs');
const TESTS = ['NativeQaTests/test01AnonymousForms', 'NativeQaTests/test02ActualRestartRemainsAnonymous'];
const AUTHENTICATED_MARKETPLACE_DISCOVERY_TESTS = ['NativeQaTests/test03RealLoginMarketplaceDiscovery'];
const AUTHENTICATED_MARKETPLACE_CHAT_TESTS = ['NativeQaTests/test04RealLoginMarketplaceChat'];
const AUTHENTICATED_MARKETPLACE_MEETUP_TESTS = ['NativeQaTests/test05RealLoginMarketplaceMeetup'];
const AUTHENTICATED_DELETION_TESTS = ['NativeQaTests/test06RealLoginWishlistDeletionAndRestart'];
const AUTHENTICATED_LISTING_BATCH_TESTS = ['NativeQaTests/test07RealLoginListingBatchEntry'];
const AUTHENTICATED_LISTING_PHOTO_TESTS = ['NativeQaTests/test08RealLoginListingBatchPhotoUpload'];
const AUTHENTICATED_LISTING_TWO_PHOTO_TESTS = ['NativeQaTests/test09RealLoginListingBatchTwoPhotos'];
const AUTHENTICATED_LISTING_AI_PHOTO_TESTS = ['NativeQaTests/test11RealLoginListingBatchAiPhoto'];
const AUTHENTICATED_EXTERNAL_MAP_TESTS = ['NativeQaTests/test10RealLoginExternalSourceMapAndDetail'];
const AUTHENTICATED_TESTS = AUTHENTICATED_MARKETPLACE_DISCOVERY_TESTS;
const AUTHENTICATED_FLOWS = {
  'marketplace-discovery': AUTHENTICATED_MARKETPLACE_DISCOVERY_TESTS,
  'marketplace-chat': AUTHENTICATED_MARKETPLACE_CHAT_TESTS,
  'marketplace-meetup': AUTHENTICATED_MARKETPLACE_MEETUP_TESTS,
  deletion: AUTHENTICATED_DELETION_TESTS,
  'listing-batch-entry': AUTHENTICATED_LISTING_BATCH_TESTS,
  'listing-batch-photo': AUTHENTICATED_LISTING_PHOTO_TESTS,
  'listing-batch-two-photos': AUTHENTICATED_LISTING_TWO_PHOTO_TESTS,
  'listing-batch-ai-photo': AUTHENTICATED_LISTING_AI_PHOTO_TESTS,
  'external-map': AUTHENTICATED_EXTERNAL_MAP_TESTS,
};
function destinationTestRun(template, label, testRoot, inputPort, flow) {
  if (!path.isAbsolute(testRoot) || template.__xctestrun_metadata__?.FormatVersion !== 1 ||
    Object.keys(template).some(key => !['__xctestrun_metadata__', 'WishlistNativeQa'].includes(key))) throw new Error('Unexpected Xcode QA template');
  const target = template.WishlistNativeQa;
  if (!target || target.IsUITestBundle !== true || target.UseUITargetAppProvidedByTests !== true || target.BlueprintName !== 'WishlistNativeQa' ||
    target.TestHostBundleIdentifier !== iosQaRunnerBundle(label) + '.xctrunner') throw new Error('Unexpected QA test runner identity');
  const copy = JSON.parse(JSON.stringify(template));
  const qa = copy.WishlistNativeQa;
  for (const name of ['TestingEnvironmentVariables', 'UITargetAppEnvironmentVariables', 'EnvironmentVariables']) {
    if (!qa[name] || Array.isArray(qa[name]) || typeof qa[name] !== 'object') throw new Error('Missing Xcode testing environment');
    for (const key of Object.keys(qa[name])) {
      if (typeof qa[name][key] !== 'string') throw new Error('Unexpected Xcode testing environment value');
      qa[name][key] = qa[name][key].replaceAll('__TESTROOT__', testRoot);
    }
  }
  // Xcode 26.6 rejects UseDestinationArtifacts on Simulators (device-only).
  // Preserve its generated runner paths. The fresh runner is installed by
  // Xcode; the unique App is supplied/launched by the tests, not reinstalled.
  delete qa.UseDestinationArtifacts;
  delete qa.TestBundleDestinationRelativePath;
  delete qa.UITargetAppBundleIdentifier;
  qa.EnvironmentVariables.NATIVE_QA_PACKAGE = iosQaBundle(label);
  if (inputPort !== undefined) {
    if (!Number.isInteger(inputPort) || inputPort < 1024 || inputPort > 65535 || !Object.hasOwn(AUTHENTICATED_FLOWS, flow)) throw new Error('Invalid private input configuration');
    qa.EnvironmentVariables.NATIVE_QA_INPUT_PORT = String(inputPort);
  } else if (flow !== undefined) throw new Error('Anonymous QA cannot select an authenticated flow');
  if (typeof qa.TestHostPath !== 'string' || typeof qa.TestBundlePath !== 'string' || !Array.isArray(qa.DependentProductPaths)) throw new Error('Missing generated runner paths');
  qa.TestHostPath = qa.TestHostPath.replaceAll('__TESTROOT__', testRoot);
  qa.DependentProductPaths = qa.DependentProductPaths.map(value => {
    if (typeof value !== 'string') throw new Error('Invalid generated runner product');
    return value.replaceAll('__TESTROOT__', testRoot);
  });
  delete qa.UITargetAppPath;
  qa.OnlyTestIdentifiers = [...(inputPort === undefined ? TESTS : AUTHENTICATED_FLOWS[flow])];
  qa.ParallelizationEnabled = false;
  qa.TestTimeoutsEnabled = true; qa.DefaultTestExecutionTimeAllowance = 180; qa.MaximumTestExecutionTimeAllowance = 240;
  qa.SystemAttachmentLifetime = 'keepNever';
  qa.UserAttachmentLifetime = 'keepAlways';
  return copy;
}
function anonymousSummaryPassed(summary, udid) {
  return iosSummaryPassed(summary, udid, 2);
}
function iosSummaryPassed(summary, udid, count) {
  if (![1, 2].includes(count) || !summary || summary.result !== 'Passed' || summary.totalTestCount !== count || summary.passedTests !== count ||
    summary.failedTests !== 0 || summary.skippedTests !== 0 || summary.expectedFailures !== 0) return false;
  const configurations = Array.isArray(summary.devicesAndConfigurations) ? summary.devicesAndConfigurations : [summary.devicesAndConfigurations];
  return configurations.length === 1 && configurations[0]?.device?.deviceId === udid &&
    configurations[0].passedTests === count && configurations[0].failedTests === 0 && configurations[0].skippedTests === 0;
}
module.exports = { TESTS, AUTHENTICATED_TESTS, AUTHENTICATED_MARKETPLACE_DISCOVERY_TESTS, AUTHENTICATED_MARKETPLACE_CHAT_TESTS,
  AUTHENTICATED_MARKETPLACE_MEETUP_TESTS, AUTHENTICATED_DELETION_TESTS, AUTHENTICATED_FLOWS,
  AUTHENTICATED_LISTING_BATCH_TESTS,
  AUTHENTICATED_LISTING_PHOTO_TESTS,
  AUTHENTICATED_LISTING_TWO_PHOTO_TESTS,
  AUTHENTICATED_LISTING_AI_PHOTO_TESTS,
  AUTHENTICATED_EXTERNAL_MAP_TESTS,
  destinationTestRun, anonymousSummaryPassed, iosSummaryPassed };
