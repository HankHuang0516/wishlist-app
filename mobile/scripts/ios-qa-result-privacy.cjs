// Read complete SDK-exported action/console structures only in memory. A
// missing, excessive or credential-bearing log is never accepted as safe.
const { AUTHENTICATED_TESTS } = require('./ios-xctestrun-config.cjs');
function credentialFreeResultLogs(consoleLog, actionLog, actor, activities, udid, expectedTests = AUTHENTICATED_TESTS) {
  if (!consoleLog || !(Array.isArray(consoleLog.items) || consoleLog.sdkConsoleUnavailable === true) ||
    !actionLog || actionLog.domainType !== 'com.apple.dt.unit.cocoaUnitTest' || !Array.isArray(actionLog.subsections) ||
    !actor || typeof actor.email !== 'string' || actor.email.length < 20 || typeof actor.password !== 'string' || actor.password.length < 30) return false;
  if (!Array.isArray(expectedTests) || expectedTests.length < 1 || !Array.isArray(activities) || activities.length !== expectedTests.length || typeof udid !== 'string' || !udid) return false;
  for (let index = 0; index < activities.length; index++) {
    const activity = activities[index], expected = expectedTests[index];
    if (activity.testIdentifier !== expected + '()' && activity.testIdentifierURL !== 'test://com.apple.xcode/WishlistNativeQa/WishlistNativeQa/' + expected) return false;
    const runs = Array.isArray(activity.testRuns) ? activity.testRuns : [activity.testRuns];
    if (runs.length !== 1 || runs[0]?.device?.deviceId !== udid || !Array.isArray(runs[0].activities) || runs[0].activities.length === 0) return false;
  }
  const secrets = [actor.email, actor.password];
  const bytes = secrets.flatMap(secret => [Buffer.from(secret), Buffer.from(secret, 'utf16le')]);
  const stack = [consoleLog, actionLog, activities];
  let visited = 0;
  while (stack.length) {
    const value = stack.pop();
    if (++visited > 200000) return false;
    if (typeof value === 'string') {
      if (secrets.some(secret => value.includes(secret) || value.includes(encodeURIComponent(secret)))) return false;
      if (value.length > 32 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
        if (value.length > 4 * 1024 * 1024) return false;
        const decoded = Buffer.from(value, 'base64');
        if (bytes.some(secret => decoded.includes(secret))) return false;
      }
    } else if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length > 10000) return false;
      stack.push(...keys, ...Object.values(value));
    }
  }
  return true;
}
module.exports = { credentialFreeResultLogs };
