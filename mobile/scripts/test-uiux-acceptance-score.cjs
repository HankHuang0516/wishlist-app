const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { scoreManifest, contractFor, CONTRACT, CONTRACTS } = require('./uiux-acceptance-score.cjs');

const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(red) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, red, 40, 90]))), chunk('IEND', Buffer.alloc(0))]);
}
function fixture(selectedContract = contract) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-uiux-score-'));
  const baselineImage = path.join(dir, 'baseline.png');
  const candidateImage = path.join(dir, 'candidate.png');
  const approval = path.join(dir, 'approval.md');
  const build = path.join(dir, 'build.bin');
  const designReference = path.join(dir, selectedContract.designReference);
  const fixedFixture = path.join(dir, 'fixture.json');
  fs.writeFileSync(baselineImage, png(10));
  fs.writeFileSync(candidateImage, png(20));
  fs.writeFileSync(designReference, png(30));
  fs.writeFileSync(fixedFixture, JSON.stringify({ product: 'Synthetic', messages: ['A', 'B'], state: 'proposed-v1' }));
  fs.writeFileSync(approval, 'Synthetic acceptance fixture; not Hank approval.');
  fs.writeFileSync(build, 'Synthetic build fixture; not a release.');
  const file = filePath => ({ path: filePath, sha256: hash(filePath) });
  const context = { platform: 'ios', deviceModel: 'Synthetic iPhone', osVersion: 'test', locale: 'zh-TW',
    timeZone: 'Asia/Taipei', colorScheme: 'light', fontScale: '1.0', fixtureId: 'synthetic-1',
    screenState: selectedContract.allowedScreenStates[0], scrollState: 'latest', keyboardState: 'closed' };
  const manifest = {
    schemaVersion: 1,
    screen: selectedContract.screen,
    baseline: { image: file(baselineImage), designReference: file(designReference), fixture: file(fixedFixture),
      approval: { decision: 'approved', reviewer: 'Hank', evidence: file(approval) }, context },
    candidate: { image: file(candidateImage), fixture: file(fixedFixture),
      build: { ...file(build), type: 'release-equivalent' }, context: { ...context } },
    items: selectedContract.items.map(item => ({ id: item.id, result: 'pass', reviewer: 'synthetic-test',
      note: 'Fixture-only evidence, never real human approval.', evidence: [file(candidateImage)],
      measurements: (item.requiredMetrics || []).map(id => ({ id, baselinePt: 10, candidatePt: 10, tolerancePt: 4 })) }))
  };
  return { dir, manifest };
}
function withFixture(run, selectedContract = contract) {
  const { dir, manifest } = fixture(selectedContract);
  try { run(manifest); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('fixed chat contract totals 100 points and only produces a single-state candidate result', () => withFixture(manifest => {
  assert.equal(contract.items.reduce((sum, item) => sum + item.weight, 0), 100);
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'state-candidate-pass');
  assert.equal(result.score, 100);
  assert.equal(result.screenState, 'meetup-proposed-v1');
  assert.match(result.limitation, /not a complete page/);
}));

test('explore map selected-listing state uses its own fixed 100-point contract', () => withFixture(manifest => {
  assert.equal(Object.keys(CONTRACTS).length, 4);
  assert.equal(contractFor('explore-map-default').items.reduce((sum, item) => sum + item.weight, 0), 100);
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'state-candidate-pass');
  assert.equal(result.screen, 'explore-map-default');
  assert.equal(result.screenState, 'loaded-with-selected-listing');
  assert.equal(result.score, 100);
}, contractFor('explore-map-default')));

test('home multi-match collapsed state cannot claim expanded or empty coverage', () => withFixture(manifest => {
  const home = contractFor('home-match-multiple');
  assert.equal(home.items.reduce((sum, item) => sum + item.weight, 0), 100);
  assert.equal(scoreManifest(manifest).status, 'state-candidate-pass');
  for (const otherState of ['multiple-matches-one-wish-expanded', 'no-matches']) {
    manifest.baseline.context.screenState = otherState;
    manifest.candidate.context.screenState = otherState;
    assert.equal(scoreManifest(manifest).status, 'unscored');
  }
}, contractFor('home-match-multiple')));

test('home product identity is critical and a missing map-entry review is not silently passed', () => withFixture(manifest => {
  manifest.items.find(item => item.id === 'product-photo-price-identity').result = 'fail';
  assert.equal(scoreManifest(manifest).status, 'state-fail');
  manifest.items.find(item => item.id === 'product-photo-price-identity').result = 'pass';
  manifest.items.find(item => item.id === 'wish-selector-map-entry').evidence = [];
  assert.equal(scoreManifest(manifest).status, 'unscored');
}, contractFor('home-match-multiple')));

test('seller active-card state has a distinct fixed 100-point contract', () => withFixture(manifest => {
  const seller = contractFor('my-listings-active-card');
  assert.equal(seller.items.reduce((sum, item) => sum + item.weight, 0), 100);
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'state-candidate-pass');
  assert.equal(result.screen, 'my-listings-active-card');
  assert.equal(result.screenState, 'active-one-item-card-collapsed');
  manifest.baseline.context.screenState = 'active-one-item-edit-expanded';
  manifest.candidate.context.screenState = 'active-one-item-edit-expanded';
  assert.equal(scoreManifest(manifest).status, 'unscored');
}, contractFor('my-listings-active-card')));

test('one screenshot state cannot claim coverage of a different state', () => withFixture(manifest => {
  manifest.baseline.context.screenState = 'blocked-chat';
  manifest.candidate.context.screenState = 'blocked-chat';
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'unscored');
  assert.ok(result.reasons.includes('context:unsupported-screen-state'));
}));

test('unknown or caller-invented scoring screen is rejected', () => {
  assert.throws(() => contractFor('fabricated-page'), /Unsupported fixed acceptance screen/);
});

test('missing Hank baseline declaration or mismatched context blocks scoring', () => withFixture(manifest => {
  manifest.baseline.approval = null;
  manifest.candidate.context.fontScale = '1.5';
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'unscored');
  assert.equal(result.score, null);
  assert.deepEqual(result.reasons.sort(), ['baseline:approval', 'context:fontScale']);
}));

test('different fixture bytes cannot be scored as the same data state', () => withFixture(manifest => {
  const differentFixture = path.join(path.dirname(manifest.candidate.fixture.path), 'different-fixture.json');
  fs.writeFileSync(differentFixture, JSON.stringify({ product: 'Another synthetic item' }));
  manifest.candidate.fixture = { path: differentFixture, sha256: hash(differentFixture) };
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'unscored');
  assert.ok(result.reasons.includes('data:fixed-fixture'));
}));

test('missing review evidence blocks scoring, not silently giving zero', () => withFixture(manifest => {
  manifest.items[0].evidence = [];
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'unscored');
  assert.equal(result.score, null);
  assert.ok(result.reasons.includes('item:safe-area-header:unverified'));
}));

test('critical failure cannot be offset by other passing items', () => withFixture(manifest => {
  manifest.items.find(item => item.id === 'product-photo-price').result = 'fail';
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'state-fail');
  assert.equal(result.score, 80);
  assert.equal(result.criticalFailed, true);
}));

test('geometry outside four-point tolerance becomes a failed check', () => withFixture(manifest => {
  manifest.items.find(item => item.id === 'meetup-state-entry').measurements[0].candidatePt = 15;
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'state-fail');
  assert.equal(result.score, 90);
  assert.equal(result.criticalFailed, true);
}));

test('a pass claim without required coordinates is unscored', () => withFixture(manifest => {
  manifest.items.find(item => item.id === 'composer-keyboard').measurements = [];
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'unscored');
  assert.ok(result.reasons.includes('item:composer-keyboard:unmeasured'));
}));

test('rejects the implementation screenshot relabeled as its own baseline', () => withFixture(manifest => {
  manifest.baseline.image = manifest.candidate.image;
  const result = scoreManifest(manifest);
  assert.equal(result.status, 'unscored');
  assert.ok(result.reasons.includes('image:same-canvas-distinct-artifacts'));
}));

test('rejects incomplete checklist and modified evidence bytes', () => withFixture(manifest => {
  manifest.items.pop();
  assert.throws(() => scoreManifest(manifest), /All fixed checklist items/);
}));

test('rejects stale SHA-256 for review evidence', () => withFixture(manifest => {
  manifest.items[0].evidence[0].sha256 = '0'.repeat(64);
  assert.throws(() => scoreManifest(manifest), /SHA-256 mismatch/);
}));
