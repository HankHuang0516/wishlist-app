// Host-only bounded diagnostics. No fixture DB, credentials or mobile device.
const { spawn } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { hostEnvironment, METRO_PORT, metroArguments } = require('./android-qa-config.cjs');
const mobile = path.resolve(__dirname, '..');
(async () => {
  await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', () => reject(new Error('QA Metro port occupied; no server changed')));
    listener.listen(METRO_PORT, '127.0.0.1', () => listener.close(resolve));
  });
  const env = hostEnvironment(process.execPath, '/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/Users/hank/Library/Android/sdk', os.homedir());
  const child = spawn(process.execPath, metroArguments(mobile),
    { cwd: mobile, env: { ...env, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:1/api' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostics = '', exited = false, exitCode = null, interrupted = false;
  const capture = chunk => { if (diagnostics.length < 100000) diagnostics += chunk.toString(); };
  child.stdout.on('data', capture); child.stderr.on('data', capture);
  const exit = new Promise(resolve => {
    child.once('exit', code => { exited = true; exitCode = code; resolve(); });
    child.once('error', () => { exited = true; exitCode = -1; resolve(); });
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; child.kill('SIGTERM'); });
  const observed = {};
  const end = Date.now() + 15000;
  try {
    while (!exited && !interrupted && Date.now() < end && !observed.ipv4?.ready && !observed.ipv6?.ready) {
      for (const [family, host] of [['ipv4', '127.0.0.1'], ['ipv6', '[::1]']]) {
        try {
          const response = await fetch('http://' + host + ':' + METRO_PORT + '/status', { signal: AbortSignal.timeout(800), redirect: 'error' });
          observed[family] = { status: response.status, ready: await response.text() === 'packager-status:running' };
        } catch { observed[family] = { connected: false }; }
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  } finally {
    if (!exited) child.kill('SIGTERM');
    await exit;
  }
  const indicators = ['EMFILE', 'ENOENT', 'EACCES', 'ECONNREFUSED', 'EADDRINUSE', 'Cannot find module', 'Invalid options object',
    'Unknown argument', 'watchman', 'Watchman', 'Error', 'Unable to resolve module', 'Babel', 'Networking has been disabled', 'Starting Metro', 'Waiting on'];
  const summary = { kind: 'host-only-metro-probe', exitCode, interrupted, observed, diagnosticIndicators: indicators.filter(value => diagnostics.includes(value)),
    errorNames: [...new Set(diagnostics.match(/\b(?:[A-Za-z]+Error|ERR_[A-Z_]+)\b/g) || [])],
    // Only code filenames/line numbers, not paths, error arguments or values.
    codeFrames: [...new Set([...diagnostics.matchAll(/\/([A-Za-z0-9_.-]+\.(?:js|cjs|ts)):(\d+):(\d+)/g)].map(match => match[1] + ':' + match[2] + ':' + match[3]))].slice(0, 10),
    rawDiagnosticsWithheld: true, fixturesCreated: false, deviceOperations: false };
  console.log(JSON.stringify(summary));
  process.exitCode = observed.ipv4?.ready && !interrupted ? 0 : 1;
})().catch(() => { console.error('Host Metro probe failed; no raw diagnostics emitted'); process.exitCode = 1; });
