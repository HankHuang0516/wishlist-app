const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadMatrix, assessCoverage, finishCoverage, gateReceipt, MATRIX_PATH } =
  require('./uiux-acceptance-coverage.cjs');

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const temporary = run => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-uiux-coverage-'));
  try { run(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test('pinned matrix names all 59 states across seven groups and 16 cross-cutting gates', () => {
  const matrix = loadMatrix();
  assert.equal(matrix.states.length, 59);
  assert.equal(matrix.gates.length, 16);
  assert.deepEqual(matrix.platforms, ['ios', 'android']);
  assert.equal(matrix.states.filter(state => state.contract).length, 4);
  assert.equal(new Set(matrix.states.map(state => state.group)).size, 7);
});

test('empty evidence cannot yield a platform score or whole-app pass', () => temporary(dir => {
  const result = assessCoverage(dir);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.requiredStates, 118);
  assert.equal(result.passingStates, 0);
  assert.equal(result.requiredGates, 16);
  assert.equal(result.passingGates, 0);
  assert.equal(result.platformScores, null);
  assert.equal(result.rows.filter(row => row.status === 'missing-contract').length, 110);
  assert.equal(result.rows.filter(row => row.status === 'missing-review').length, 8);
}));

test('shrinking or editing the pinned matrix cannot manufacture completion', () => temporary(dir => {
  const edited = path.join(dir, 'matrix.json');
  const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
  matrix.states.pop();
  fs.writeFileSync(edited, JSON.stringify(matrix));
  assert.throws(() => loadMatrix(edited), /Pinned whole-app coverage matrix changed/);
}));

test('one synthetically passing state cannot offset a missing state or failed gate', () => {
  const rows = [
    { platform: 'ios', status: 'candidate-pass', score: 100 },
    { platform: 'android', status: 'missing-review', score: null },
  ];
  const gates = [{ status: 'pass' }, { status: 'fail' }];
  const result = finishCoverage(rows, gates, 2, 2);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.platformScores, null);
});

test('only every synthetic state and gate passing reaches manual-audit candidate, never goal completion', () => {
  const rows = [
    { platform: 'ios', status: 'candidate-pass', score: 99 },
    { platform: 'ios', status: 'candidate-pass', score: 100 },
    { platform: 'android', status: 'candidate-pass', score: 100 },
    { platform: 'android', status: 'candidate-pass', score: 99 },
  ];
  const result = finishCoverage(rows, [{ status: 'pass' }, { status: 'pass' }], 4, 2);
  assert.equal(result.status, 'candidate-ready-for-manual-audit');
  assert.deepEqual(result.platformScores, { ios: 99.5, android: 99.5 });
  rows[3].score = 98;
  assert.equal(finishCoverage(rows, [{ status: 'pass' }, { status: 'pass' }], 4, 2).status, 'incomplete');
  rows[3].score = 99;
  rows[3].platform = 'ios';
  assert.equal(finishCoverage(rows, [{ status: 'pass' }, { status: 'pass' }], 4, 2).status, 'incomplete');
});

test('final Hank review gate requires Hank attribution and unchanged evidence bytes', () => temporary(dir => {
  const evidence = path.join(dir, 'review.md');
  const receipt = path.join(dir, 'receipt.json');
  fs.writeFileSync(evidence, 'Synthetic test evidence, not a real visual approval.');
  const data = { schemaVersion: 1, id: 'hank-final-visual-review', result: 'pass',
    reviewer: 'Synthetic', note: 'Test only', evidence: [{ path: evidence, sha256: hash(evidence) }] };
  fs.writeFileSync(receipt, JSON.stringify(data));
  assert.throws(() => gateReceipt(receipt, data.id), /attributed to Hank/);
  data.reviewer = 'Hank';
  fs.writeFileSync(receipt, JSON.stringify(data));
  assert.equal(gateReceipt(receipt, data.id), 'pass');
  fs.writeFileSync(evidence, 'Changed bytes');
  assert.throws(() => gateReceipt(receipt, data.id), /SHA-256 mismatch/);
}));

test('an invented or mismatched review does not cover its required screen', () => temporary(dir => {
  const platformDir = path.join(dir, 'ios');
  fs.mkdirSync(platformDir);
  fs.writeFileSync(path.join(platformDir, 'explore-map-selected-single.json'),
    JSON.stringify({ screen: 'chat-meetup', baseline: { context: { screenState: 'meetup-proposed-v1' } },
      candidate: { context: { screenState: 'meetup-proposed-v1' } } }));
  const result = assessCoverage(dir);
  const row = result.rows.find(item => item.platform === 'ios' && item.id === 'explore-map-selected-single');
  assert.equal(row.status, 'invalid-review');
  assert.equal(result.status, 'incomplete');
}));
