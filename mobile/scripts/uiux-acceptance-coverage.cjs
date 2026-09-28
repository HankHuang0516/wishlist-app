// Read-only whole-app coverage gate. A state-level score is never a substitute
// for every required state, cross-cutting checks, or Hank's final human review.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { scoreManifest, contractFor, checkedFile } = require('./uiux-acceptance-score.cjs');

const MATRIX_PATH = path.resolve(__dirname, '../qa/uiux-v2-required-coverage.json');
// Deliberately pin the review scope. Changing the matrix requires an explicit
// code change and test review; a shortened JSON file cannot create a pass.
const MATRIX_SHA256 = 'bdb5659c8f35e647973890a834ce7362e151f3fed1c96d3d0a637b7179c6f16e';
const EXPECTED_GROUP_COUNTS = Object.freeze({
  'home-wish': 10, explore: 11, seller: 14, marketing: 8, social: 11, account: 4, billing: 1,
});
const text = value => typeof value === 'string' && value.trim().length > 0;
const fileHash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function loadMatrix(file = MATRIX_PATH) {
  const bytes = fs.readFileSync(file);
  if (fileHash(bytes) !== MATRIX_SHA256) throw new Error('Pinned whole-app coverage matrix changed; review scope explicitly');
  const matrix = JSON.parse(bytes);
  if (matrix.schemaVersion !== 1 || matrix.matrixId !== 'wishlist-v2-native-uiux-20260928' ||
    JSON.stringify(matrix.platforms) !== JSON.stringify(['ios', 'android']) ||
    !Array.isArray(matrix.states) || matrix.states.length !== 59 ||
    !Array.isArray(matrix.gates) || matrix.gates.length !== 16) throw new Error('Incomplete whole-app matrix');
  const ids = matrix.states.map(state => state.id);
  const gateIds = matrix.gates.map(gate => gate.id);
  if (new Set(ids).size !== ids.length || new Set(gateIds).size !== gateIds.length ||
    ids.some(id => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) ||
    gateIds.some(id => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)))
    throw new Error('Duplicate or invalid whole-app requirement ID');
  const counts = Object.fromEntries(Object.keys(EXPECTED_GROUP_COUNTS).map(group =>
    [group, matrix.states.filter(state => state.group === group).length]));
  if (JSON.stringify(counts) !== JSON.stringify(EXPECTED_GROUP_COUNTS) ||
    matrix.states.some(state => !Object.hasOwn(EXPECTED_GROUP_COUNTS, state.group) ||
      Boolean(state.contract) !== Boolean(state.screenState)))
    throw new Error('Whole-app group coverage or state contract malformed');
  for (const state of matrix.states) if (state.contract) {
    const contract = contractFor(state.contract);
    if (!contract.allowedScreenStates.includes(state.screenState))
      throw new Error('Whole-app state is not allowed by fixed scoring contract');
  }
  if (matrix.gates.some(gate => !text(gate.description))) throw new Error('Whole-app gate description missing');
  return matrix;
}

function gateReceipt(file, id) {
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (receipt.schemaVersion !== 1 || receipt.id !== id ||
    !['pass', 'fail'].includes(receipt.result) || !text(receipt.reviewer) ||
    !text(receipt.note) || !Array.isArray(receipt.evidence) || receipt.evidence.length === 0)
    throw new Error('Invalid cross-cutting gate receipt');
  if (id === 'hank-final-visual-review' && receipt.reviewer !== 'Hank')
    throw new Error('Final visual review must be attributed to Hank');
  receipt.evidence.forEach((item, index) => checkedFile(item, `gate:${id}:evidence:${index}`));
  return receipt.result;
}

function finishCoverage(rows, gates, requiredStateCount, requiredGateCount) {
  const passingRows = rows.filter(row => row.status === 'candidate-pass');
  const passingGates = gates.filter(gate => gate.status === 'pass');
  const eachPlatformCount = requiredStateCount / 2;
  const bothPlatformsPresent = Number.isInteger(eachPlatformCount) && ['ios', 'android'].every(platform =>
    rows.filter(row => row.platform === platform).length === eachPlatformCount);
  const complete = rows.length === requiredStateCount && gates.length === requiredGateCount &&
    bothPlatformsPresent &&
    passingRows.length === requiredStateCount && passingGates.length === requiredGateCount &&
    rows.every(row => Number.isFinite(row.score) && row.score >= 99);
  const platformScores = complete ? Object.fromEntries(['ios', 'android'].map(platform => {
    const values = rows.filter(row => row.platform === platform).map(row => row.score);
    return [platform, values.reduce((sum, value) => sum + value, 0) / values.length];
  })) : null;
  return { status: complete && Object.values(platformScores).every(value => value >= 99)
    ? 'candidate-ready-for-manual-audit' : 'incomplete',
  platformScores, passingStates: passingRows.length, requiredStates: requiredStateCount,
  passingGates: passingGates.length, requiredGates: requiredGateCount };
}

function assessCoverage(reviewsDir, matrix = loadMatrix()) {
  if (!path.isAbsolute(reviewsDir)) throw new Error('Absolute review directory required');
  const rows = [];
  for (const platform of matrix.platforms) for (const state of matrix.states) {
    const row = { platform, id: state.id, group: state.group, status: 'missing-contract', score: null };
    if (state.contract) {
      const file = path.join(reviewsDir, platform, state.id + '.json');
      row.status = 'missing-review';
      if (fs.existsSync(file)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (manifest.screen !== state.contract ||
            manifest.baseline?.context?.screenState !== state.screenState ||
            manifest.candidate?.context?.screenState !== state.screenState)
            throw new Error('Review screen or state does not match the whole-app matrix');
          const result = scoreManifest(manifest);
          if (result.platform !== platform) throw new Error('Review platform does not match its directory');
          row.status = result.status === 'state-candidate-pass' ? 'candidate-pass' : result.status;
          row.score = result.score;
          if (result.reasons.length) row.reasons = result.reasons;
        } catch (error) { row.status = 'invalid-review'; row.reason = error.message; }
      }
    }
    rows.push(row);
  }
  const gates = matrix.gates.map(gate => {
    const row = { id: gate.id, status: 'missing-receipt' };
    const file = path.join(reviewsDir, 'gates', gate.id + '.json');
    if (fs.existsSync(file)) {
      try { row.status = gateReceipt(file, gate.id); }
      catch (error) { row.status = 'invalid-receipt'; row.reason = error.message; }
    }
    return row;
  });
  const aggregate = finishCoverage(rows, gates, matrix.states.length * matrix.platforms.length, matrix.gates.length);
  return { matrixId: matrix.matrixId, ...aggregate, rows, gates,
    limitation: 'Machine-readable declarations and synthetic tests cannot prove human approval, true Release equivalence or real VoiceOver/TalkBack use. A candidate still needs independent manual audit.' };
}

if (require.main === module) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: node uiux-acceptance-coverage.cjs [absolute-review-directory]');
    const reviewsDir = process.argv[2] ?? path.resolve(__dirname, '../qa/reviews');
    const result = assessCoverage(reviewsDir);
    const byGroup = Object.fromEntries(Object.keys(EXPECTED_GROUP_COUNTS).map(group => [group, {
      required: result.rows.filter(row => row.group === group).length,
      passing: result.rows.filter(row => row.group === group && row.status === 'candidate-pass').length,
      missingContract: result.rows.filter(row => row.group === group && row.status === 'missing-contract').length,
    }]));
    console.log(JSON.stringify({ matrixId: result.matrixId, status: result.status,
      passingStates: result.passingStates, requiredStates: result.requiredStates,
      passingGates: result.passingGates, requiredGates: result.requiredGates,
      platformScores: result.platformScores, byGroup,
      pendingGateIds: result.gates.filter(gate => gate.status !== 'pass').map(gate => gate.id),
      limitation: result.limitation }, null, 2));
    if (result.status !== 'candidate-ready-for-manual-audit') process.exitCode = 1;
  } catch (error) {
    console.error('Whole-app coverage rejected: ' + error.message);
    process.exitCode = 2;
  }
}

module.exports = { loadMatrix, assessCoverage, finishCoverage, gateReceipt, MATRIX_PATH, MATRIX_SHA256 };
