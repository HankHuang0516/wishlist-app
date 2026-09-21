// Read only an existing isolated QA result. Never return raw logs, URLs,
// credentials, application snapshots or SDK process environment values.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { qaLabel } = require('./android-qa-config.cjs');
const { iosHostEnvironment } = require('./ios-qa-config.cjs');
const os = require('node:os');
const label = qaLabel(process.argv[2]), evidence = process.argv[3];
if (!/^qa-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(evidence || '') || process.argv[4]) throw new Error('Only exact isolated QA evidence is allowed');
const resultPath = path.resolve(__dirname, '../build/ios-native-qa-' + label, evidence, 'tests.xcresult');
const report = JSON.parse(fs.readFileSync(path.join(path.dirname(resultPath), 'result.json'), 'utf8'));
const methods = {
  'marketplace-discovery': 'test03RealLoginMarketplaceDiscovery',
  'marketplace-chat': 'test04RealLoginMarketplaceChat',
  'marketplace-meetup': 'test05RealLoginMarketplaceMeetup',
  deletion: 'test06RealLoginWishlistDeletionAndRestart',
};
const method = methods[report.authenticatedFlow];
if (!method || report.kind !== 'isolated-ios-authenticated-' + report.authenticatedFlow || report.appBundle !== 'com.hankhuang.weesh.qa' + label) throw new Error('Unexpected saved QA report');
const command = spawnSync('/usr/bin/xcrun', ['xcresulttool', 'get', 'log', '--type', 'action', '--path', resultPath, '--compact'],
  { env: iosHostEnvironment(process.execPath, os.homedir(), os.tmpdir()), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 20000 });
if (command.error || command.status !== 0 || command.signal) throw new Error('Complete SDK log unavailable; raw diagnostics withheld');
const log = JSON.parse(command.stdout);
if (log.domainType !== 'com.apple.dt.unit.cocoaUnitTest' || !Array.isArray(log.subsections)) throw new Error('Unexpected SDK log shape');
const consoleCommand = spawnSync('/usr/bin/xcrun', ['xcresulttool', 'get', 'log', '--type', 'console', '--path', resultPath, '--compact'],
  { env: iosHostEnvironment(process.execPath, os.homedir(), os.tmpdir()), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 20000 });
const consoleLog = consoleCommand.status === 0 && !consoleCommand.error && !consoleCommand.signal ? JSON.parse(consoleCommand.stdout) : { sdkConsoleUnavailable: true };
const activityCommand = spawnSync('/usr/bin/xcrun', ['xcresulttool', 'get', 'test-results', 'activities', '--path', resultPath, '--compact', '--test-id',
  'test://com.apple.xcode/WishlistNativeQa/WishlistNativeQa/NativeQaTests/' + method],
  { env: iosHostEnvironment(process.execPath, os.homedir(), os.tmpdir()), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 20000 });
if (activityCommand.error || activityCommand.status !== 0 || activityCommand.signal) throw new Error('Complete SDK activity unavailable; raw diagnostics withheld');
const activity = JSON.parse(activityCommand.stdout);
const runs = Array.isArray(activity.testRuns) ? activity.testRuns : [activity.testRuns];
const activitySchema = {
  expectedIdentifier: activity.testIdentifier === 'NativeQaTests/' + method + '()' ||
    activity.testIdentifierURL === 'test://com.apple.xcode/WishlistNativeQa/WishlistNativeQa/NativeQaTests/' + method,
  exactSingleAssignedRun: runs.length === 1 && runs[0]?.device?.deviceId === report.assignedDevice,
  nonemptyActivityTree: runs.length === 1 && Array.isArray(runs[0]?.activities) && runs[0].activities.length > 0,
};
const stack = [log, activity], consoleStack = [consoleLog], codes = new Set();
let visited = 0, atsMessage = false;
const loginTapKinds = { Button: 0, StaticText: 0, Other: 0 };
const publicControlActions = {};
let confirmationTypingObserved = false, returnTypingObserved = false, unsupportedKeyboardCharacterObserved = false;
const knownPublicTypingObserved = { list: false, wish: false, budget: false };
const deletionCompletionLookups = { heading: 0, cleanupNotice: 0, returnAction: 0 };
const marketplaceActions = { searchInput: 0, searchTap: 0, listTap: 0, cardFind: 0, cardTap: 0, titleFind: 0, contactFind: 0 };
const chatInputLookups = { Any: 0, TextField: 0, TextView: 0, Other: 0, placeholderTextView: 0, placeholderOther: 0 };
const chatInputMentions = { label: 0, placeholder: 0, textViewContext: 0, textFieldContext: 0, otherContext: 0, identifierContext: 0 };
const meetupActions = { open: 0, edit: 0, placeInput: 0, submit: 0, versionFound: 0 };
const deletionDeviceState = { cleaned: 0, notCleaned: 0, cleanupIssue: 0, proofIdentifier: 0, notCleanIdentifier: 0 };
const warningClasses = { mapLibreWarning: 0, mapLibreInvalidGeometry: 0, reactChildKey: 0, nestedVirtualizedList: 0,
  safeAreaDeprecated: 0, requireCycle: 0, animatedNoListeners: 0, shadowWithoutBackground: 0, unknownConsoleWarningStrings: 0 };
function classifyWarning(value) {
  const warning = /\b(?:warn(?:ing)?|WARN)\b/i.test(value);
  let known = false;
  if (/MapLibre Native \[WARN\]/.test(value)) { warningClasses.mapLibreWarning++; known = true; }
  if (/Invalid geometry/i.test(value)) { warningClasses.mapLibreInvalidGeometry++; known = true; }
  if (/Each child in a list should have a unique ["']key["'] prop/i.test(value)) { warningClasses.reactChildKey++; known = true; }
  if (/VirtualizedLists should never be nested/i.test(value)) { warningClasses.nestedVirtualizedList++; known = true; }
  if (/SafeAreaView has been deprecated/i.test(value)) { warningClasses.safeAreaDeprecated++; known = true; }
  if (/Require cycle:/i.test(value)) { warningClasses.requireCycle++; known = true; }
  if (/onAnimatedValueUpdate.*no listeners/i.test(value)) { warningClasses.animatedNoListeners++; known = true; }
  if (/shadow.*background color/i.test(value)) { warningClasses.shadowWithoutBackground++; known = true; }
  if (warning && !known) warningClasses.unknownConsoleWarningStrings++;
}
while (consoleStack.length) {
  const value = consoleStack.pop();
  if (++visited > 200000) throw new Error('SDK console log limit exceeded');
  if (typeof value === 'string') {
    classifyWarning(value);
    if (value.includes('商品聊天訊息')) {
      chatInputMentions.label++;
      if (/TextView/i.test(value)) chatInputMentions.textViewContext++;
      if (/TextField/i.test(value)) chatInputMentions.textFieldContext++;
      if (/\bOther\b/i.test(value)) chatInputMentions.otherContext++;
      if (/identifier/i.test(value)) chatInputMentions.identifierContext++;
    }
    if (value.includes('輸入訊息，預約前請確認商品狀態')) chatInputMentions.placeholder++;
  } else if (value && typeof value === 'object') consoleStack.push(...Object.values(value));
}
while (stack.length) {
  const value = stack.pop();
  if (++visited > 200000) throw new Error('SDK log limit exceeded');
  if (typeof value === 'string') {
    classifyWarning(value);
    for (const match of value.matchAll(/NSURLErrorDomain\s+Code=(-1022|-1001|-1004|-1009)\b/g)) codes.add(Number(match[1]));
    if (/App Transport Security.*(?:blocked|requires)|cleartext HTTP.*(?:prohibited|blocked)/i.test(value)) atsMessage = true;
    // Only exact public control/action titles; never echo a SDK string or
    // inspect/serialize an element snapshot that may contain private fields.
    const loginTap = /^Tap "登入" (Button|StaticText|Other)$/.exec(value);
    if (loginTap) loginTapKinds[loginTap[1]]++;
    const publicAction = /^(Tap|Find the) "(願望|建立願望清單|儲存|清單名稱)" (Button|StaticText|Other|TextField)$/.exec(value);
    if (publicAction) {
      const action = publicAction[1] + ':' + publicAction[2] + ':' + publicAction[3];
      publicControlActions[action] = (publicControlActions[action] || 0) + 1;
    }
    if (/^Type ["']刪除帳號["'](?: into .*)?$/.test(value)) confirmationTypingObserved = true;
    for (const [name, exact] of [['list', 'Native QA wishlist'], ['wish', 'Nintendo Switch OLED'], ['budget', '8000']]) {
      if (value.startsWith('Type "' + exact + '"') || value.startsWith("Type '" + exact + "'")) knownPublicTypingObserved[name] = true;
    }
    if (/^Type ["'](?:\\n|\n|\\r|\r)["'](?: into .*)?$/.test(value)) returnTypingObserved = true;
    if (/^Find the "帳號已確認刪除" (?:StaticText|Other)$/.test(value)) deletionCompletionLookups.heading++;
    if (/^Find the "本人已索引的待確認資料與原登入已清理。" (?:StaticText|Other)$/.test(value)) deletionCompletionLookups.cleanupNotice++;
    if (/^(?:Tap|Find the) "清除恢復資料並返回登入確認" (?:Button|StaticText|Other)$/.test(value)) deletionCompletionLookups.returnAction++;
    if (/^(?:Tap|Find the) "搜尋商品名稱與說明" (?:TextField|Other)$/.test(value)) marketplaceActions.searchInput++;
    if (/^Tap "搜尋" (?:Button|Other)$/.test(value)) marketplaceActions.searchTap++;
    if (/^Tap "切換清單" (?:Button|Other)$/.test(value)) marketplaceActions.listTap++;
    if (/^Find the "Native QA Switch OLED，NT\$ 7,500，台北市中山區" Button$/.test(value)) marketplaceActions.cardFind++;
    if (/^Tap "Native QA Switch OLED，NT\$ 7,500，台北市中山區" Button$/.test(value)) marketplaceActions.cardTap++;
    if (/^Find the "Native QA Switch OLED" (?:Any|StaticText|Other)$/.test(value)) marketplaceActions.titleFind++;
    if (/^Find the "聯絡賣家" (?:Button|Other)$/.test(value)) marketplaceActions.contactFind++;
    const chatInput = /^(?:Find the|Tap) "商品聊天訊息" (Any|TextField|TextView|Other)$/.exec(value);
    if (chatInput) chatInputLookups[chatInput[1]]++;
    const placeholderInput = /^(?:Find the|Tap) "輸入訊息，預約前請確認商品狀態" (TextView|Other)$/.exec(value);
    if (placeholderInput) chatInputLookups['placeholder' + placeholderInput[1]]++;
    if (/^(?:Find the|Tap) "查看或提議面交預約" (?:Button|Other)$/.test(value)) meetupActions.open++;
    if (/^(?:Find the|Tap) "提出面交邀約" (?:Button|Other)$/.test(value)) meetupActions.edit++;
    if (/私密面交地點名稱/.test(value)) meetupActions.placeInput++;
    if (/^(?:Find the|Tap) "提出此版本（改期需對方重新同意）" (?:Button|Other)$/.test(value)) meetupActions.submit++;
    if (/^Find the "提議中 · 第1版" (?:Any|StaticText|Other)$/.test(value)) meetupActions.versionFound++;
    if (value.includes('本人已索引的待確認資料與原登入已清理。')) deletionDeviceState.cleaned++;
    if (value.includes('裝置清理尚未確認完成。')) deletionDeviceState.notCleaned++;
    if (value.includes('帳號已確認刪除，但本人裝置資料尚未清理完成。')) deletionDeviceState.cleanupIssue++;
    if (value.includes('deletion-device-clean-proof')) deletionDeviceState.proofIdentifier++;
    if (value.includes('deletion-device-not-clean')) deletionDeviceState.notCleanIdentifier++;
    if (/failed to (?:get|find).*key event.*character|unable to type.*character|no keyboard.*available|failed to synthesize.*keyboard/i.test(value)) unsupportedKeyboardCharacterObserved = true;
  } else if (value && typeof value === 'object') stack.push(...Object.values(value));
}
console.log(JSON.stringify({ kind: 'readonly-isolated-ios-sdk-log-diagnosis', label, flow: report.authenticatedFlow, observedUrlErrorCodes: [...codes].sort(), observedAtsMessage: atsMessage, loginTapKinds, publicControlActions,
  confirmationTypingObserved, returnTypingObserved, knownPublicTypingObserved, unsupportedKeyboardCharacterObserved, activitySchema, deletionCompletionLookups,
  marketplaceActions,
  chatInputLookups,
  chatInputMentions,
  meetupActions,
  deletionDeviceState,
  warningClasses, consoleLogClassified: consoleLog.sdkConsoleUnavailable !== true,
  fullSdkActionLogRead: true, rawLogsSerialized: false, deviceOperations: 0 }));
