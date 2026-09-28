// Compile/run the actual pure Swift enum on the host, without a simulator.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iosHostEnvironment } = require('./ios-qa-config.cjs');
const mobile = path.resolve(__dirname, '..');
const classifierSource = fs.readFileSync(path.join(mobile, 'ios-native-qa/PublicInputState.swift'), 'utf8');
const qaSource = fs.readFileSync(path.join(mobile, 'ios-native-qa/NativeQaTests.swift'), 'utf8');
const androidQaSource = fs.readFileSync(path.join(mobile, 'scripts/external-map-android-smoke.cjs'), 'utf8');
const { MARKETPLACE_FIXTURE, CHAT_VISUAL_MESSAGES } = require('./native-qa-marketplace-fixture.cjs');
const chatExpected = /"商品聊天訊息": "([^"]+)"/.exec(classifierSource)?.[1];
const meetupPlaceExpected = /"私密面交地點名稱": "([^"]+)"/.exec(classifierSource)?.[1];
const chatTyped = [...qaSource.matchAll(/try publicText\("商品聊天訊息", value: "([^"]+)", kind: \.any\)/g)].map(match => match[1]);
const meetupPlaceTyped = [...qaSource.matchAll(/try publicText\("私密面交地點名稱", value: "([^"]+)"\)/g)].map(match => match[1]);
if (!chatExpected || !meetupPlaceExpected || MARKETPLACE_FIXTURE.buyerMessage !== chatExpected ||
  MARKETPLACE_FIXTURE.meetupPlace !== meetupPlaceExpected || chatTyped.length !== 2 || chatTyped.some(value => value !== chatExpected) ||
  meetupPlaceTyped.length !== 1 || meetupPlaceTyped[0] !== meetupPlaceExpected ||
  CHAT_VISUAL_MESSAGES.length !== 5 ||
  qaSource.split(`try required("${CHAT_VISUAL_MESSAGES.at(-1).text}", scroll: true)`).length - 1 !== 2 ||
  !androidQaSource.includes('await waitNode(CHAT_VISUAL_MESSAGES.at(-1).text)') ||
  !androidQaSource.includes(`await adb(['shell', 'input', 'text', '${chatExpected}'])`) ||
  !androidQaSource.includes(`await adb(['shell', 'input', 'text', '${meetupPlaceExpected}'])`))
  throw new Error('iOS/Android chat QA inputs are not aligned with the public synthetic input allowlist');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-public-input-host-'));
fs.chmodSync(output, 0o700);
const executable = path.join(output, 'public-input-tests');
const env = iosHostEnvironment(process.execPath, os.homedir(), os.tmpdir());
const compile = spawnSync('/usr/bin/xcrun', ['swiftc', path.join(mobile, 'ios-native-qa/PublicInputState.swift'), path.join(mobile, 'ios-native-qa/HostPublicInputTests.swift'), '-o', executable], { env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
if (compile.error || compile.status !== 0 || compile.signal) throw new Error('Host public input enum compilation failed; raw diagnostics withheld');
const result = spawnSync(executable, [], { env, encoding: 'utf8', timeout: 3000, maxBuffer: 4096 });
if (result.error || result.status !== 0 || result.signal) throw new Error('Host public input enum tests failed; raw diagnostics withheld');
const report = JSON.parse(result.stdout);
if (report.kind !== 'host-public-input-enum' || report.checks !== 37 || report.passed !== true || report.rawValuesSerialized !== false || report.deviceOperations !== 0) throw new Error('Unexpected host enum result');
console.log(JSON.stringify({ ...report, executable }));
