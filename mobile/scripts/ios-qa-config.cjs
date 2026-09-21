const path = require('node:path');
const { qaLabel, METRO_PORT } = require('./android-qa-config.cjs');
const ORIGINAL_BUNDLE = 'com.hankhuang.weesh';
function iosQaBundle(label) { return ORIGINAL_BUNDLE + '.qa' + qaLabel(label); }
function iosQaRunnerBundle(label) { return 'com.hankhuang.wishlistnativeqa.qa' + qaLabel(label); }
function iosHostEnvironment(node, home, temporary) {
  return { PATH: [path.dirname(node), '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    HOME: home, TMPDIR: temporary, DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer', NODE_BINARY: node,
    NODE_ENV: 'development', EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1', CI: '1', LANG: 'en_US.UTF-8', TZ: 'Asia/Taipei' };
}
function assertIosQaBuild(env) {
  if (env.WISHLIST_NATIVE_QA !== '1') {
    if (env.WISHLIST_QA_SUFFIX || env.WISHLIST_QA_SWIFT_FLAGS) throw new Error('QA flags require explicit opt-in');
    return 'normal';
  }
  const suffix = env.WISHLIST_QA_SUFFIX || '';
  if (!/^\.qa[0-9]{12}$/.test(suffix) || env.CONFIGURATION !== 'Debug' || env.PLATFORM_NAME !== 'iphonesimulator' ||
    env.PRODUCT_BUNDLE_IDENTIFIER !== ORIGINAL_BUNDLE + suffix || env.WISHLIST_URL_SCHEME !== 'wishlistqa' + suffix.substring(3) ||
    env.WISHLIST_QA_SWIFT_FLAGS !== '-D WISHLIST_NATIVE_QA') throw new Error('QA is restricted to a unique, isolated debug simulator build');
  return 'isolated-debug';
}
function assignedUdid(env) {
  if (!env.SIM_MANAGER_TOKEN || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(env.SIM_MANAGER_UDID || '')) throw new Error('A supervised iOS simulator-manager lease is required');
  return env.SIM_MANAGER_UDID;
}
module.exports = { ORIGINAL_BUNDLE, METRO_PORT, iosQaBundle, iosQaRunnerBundle, iosHostEnvironment, assertIosQaBuild, assignedUdid };
