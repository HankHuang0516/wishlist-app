// Compile/run the actual pure Swift enum on the host, without a simulator.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iosHostEnvironment } = require('./ios-qa-config.cjs');
const mobile = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-public-input-host-'));
fs.chmodSync(output, 0o700);
const executable = path.join(output, 'public-input-tests');
const env = iosHostEnvironment(process.execPath, os.homedir(), os.tmpdir());
const compile = spawnSync('/usr/bin/xcrun', ['swiftc', path.join(mobile, 'ios-native-qa/PublicInputState.swift'), path.join(mobile, 'ios-native-qa/HostPublicInputTests.swift'), '-o', executable], { env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
if (compile.error || compile.status !== 0 || compile.signal) throw new Error('Host public input enum compilation failed; raw diagnostics withheld');
const result = spawnSync(executable, [], { env, encoding: 'utf8', timeout: 3000, maxBuffer: 4096 });
if (result.error || result.status !== 0 || result.signal) throw new Error('Host public input enum tests failed; raw diagnostics withheld');
const report = JSON.parse(result.stdout);
if (report.kind !== 'host-public-input-enum' || report.checks !== 32 || report.passed !== true || report.rawValuesSerialized !== false || report.deviceOperations !== 0) throw new Error('Unexpected host enum result');
console.log(JSON.stringify({ ...report, executable }));
