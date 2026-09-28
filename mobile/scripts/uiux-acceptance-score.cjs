// Host-only per-page acceptance gate. It cannot approve a design baseline,
// verify a human review, or infer visual quality from a screenshot by itself.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const CONTRACTS = Object.freeze({
  'home-match-multiple': path.resolve(__dirname, '../qa/uiux-v2-home-match-multiple.json'),
  'chat-meetup': path.resolve(__dirname, '../qa/uiux-v2-chat-meetup.json'),
  'explore-map-default': path.resolve(__dirname, '../qa/uiux-v2-explore-map-default.json'),
  'my-listings-active-card': path.resolve(__dirname, '../qa/uiux-v2-my-listings-active-card.json'),
});
const CONTRACT = CONTRACTS['chat-meetup'];
function contractFor(screen) {
  if (!Object.hasOwn(CONTRACTS, screen)) throw new Error('Unsupported fixed acceptance screen');
  return JSON.parse(fs.readFileSync(CONTRACTS[screen], 'utf8'));
}
const contextFields = ['platform', 'deviceModel', 'osVersion', 'locale', 'timeZone', 'colorScheme',
  'fontScale', 'fixtureId', 'screenState', 'scrollState', 'keyboardState'];
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function checkedFile(record, label, requirePng = false) {
  if (!record || !path.isAbsolute(record.path) || !isHash(record.sha256) ||
    !fs.statSync(record.path, { throwIfNoEntry: false })?.isFile()) throw new Error(`${label}: absolute file and SHA-256 required`);
  if (sha256(record.path) !== record.sha256) throw new Error(`${label}: SHA-256 mismatch`);
  if (!requirePng) return null;
  if (fs.readFileSync(record.path).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${label}: not PNG`);
  const result = execFileSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', record.path], { encoding: 'utf8' });
  const width = Number(result.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(result.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error(`${label}: invalid PNG canvas`);
  return { width, height };
}

function scoreManifest(manifest, contract = contractFor(manifest?.screen)) {
  if (manifest?.schemaVersion !== 1 || contract.schemaVersion !== 1 || manifest.screen !== contract.screen ||
    !Array.isArray(contract.items) || !Array.isArray(manifest.items) ||
    !Array.isArray(contract.allowedScreenStates) || contract.allowedScreenStates.length === 0 ||
    new Set(contract.allowedScreenStates).size !== contract.allowedScreenStates.length ||
    contract.allowedScreenStates.some(state => !nonempty(state))) throw new Error('Unsupported screen or acceptance schema');
  const ids = new Set(contract.items.map(item => item.id));
  if (ids.size !== contract.items.length || contract.items.some(item => !Number.isInteger(item.weight) || item.weight < 1) ||
    contract.items.reduce((sum, item) => sum + item.weight, 0) !== 100) throw new Error('Invalid 100-point contract');
  if (manifest.items.length !== contract.items.length || new Set(manifest.items.map(item => item.id)).size !== ids.size ||
    manifest.items.some(item => !ids.has(item.id))) throw new Error('All fixed checklist items are required');

  const reasons = [];
  const baseline = manifest.baseline;
  const candidate = manifest.candidate;
  if (!baseline || !candidate || !baseline.context || !candidate.context) throw new Error('Baseline and candidate context required');
  for (const field of contextFields) {
    if (!nonempty(String(baseline.context[field] ?? '')) || baseline.context[field] !== candidate.context[field]) reasons.push(`context:${field}`);
  }
  if (!contract.allowedScreenStates.includes(baseline.context.screenState)) reasons.push('context:unsupported-screen-state');
  if (!['ios', 'android'].includes(baseline.context.platform)) reasons.push('context:platform');
  if (!baseline.approval || baseline.approval.decision !== 'approved' || baseline.approval.reviewer !== 'Hank') reasons.push('baseline:approval');
  else checkedFile(baseline.approval.evidence, 'baseline approval evidence');
  if (!baseline.designReference || path.basename(baseline.designReference.path || '') !== contract.designReference) reasons.push('baseline:design-reference');
  else checkedFile(baseline.designReference, 'accepted design reference', true);
  if (!baseline.fixture || !candidate.fixture) reasons.push('data:fixed-fixture');
  else {
    checkedFile(baseline.fixture, 'baseline fixture');
    checkedFile(candidate.fixture, 'candidate fixture');
    if (baseline.fixture.sha256 !== candidate.fixture.sha256) reasons.push('data:fixed-fixture');
  }
  if (!candidate.build || candidate.build.type !== 'release-equivalent') reasons.push('candidate:release-equivalent-build');
  else checkedFile(candidate.build, 'candidate release-equivalent build');

  let baselineCanvas;
  let candidateCanvas;
  if (baseline.image) baselineCanvas = checkedFile(baseline.image, 'baseline image', true);
  else reasons.push('baseline:image');
  if (candidate.image) candidateCanvas = checkedFile(candidate.image, 'candidate image', true);
  else reasons.push('candidate:image');
  if (baselineCanvas && candidateCanvas &&
    (baselineCanvas.width !== candidateCanvas.width || baselineCanvas.height !== candidateCanvas.height ||
      baseline.image.sha256 === candidate.image.sha256)) reasons.push('image:same-canvas-distinct-artifacts');

  let earned = 0;
  let criticalFailed = false;
  const checks = [];
  for (const item of contract.items) {
    const entry = manifest.items.find(candidateItem => candidateItem.id === item.id);
    if (!['pass', 'fail'].includes(entry.result) || !nonempty(entry.reviewer) || !nonempty(entry.note) ||
      !Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      reasons.push(`item:${item.id}:unverified`);
      checks.push({ id: item.id, weight: item.weight, result: 'unverified' });
      continue;
    }
    entry.evidence.forEach((file, index) => checkedFile(file, `item:${item.id}:evidence:${index}`));
    let evaluated = entry.result;
    if (entry.result === 'pass') {
      const requiredMetrics = item.requiredMetrics || [];
      const metrics = entry.measurements || [];
      if (new Set(metrics.map(metric => metric.id)).size !== metrics.length ||
        requiredMetrics.some(id => !metrics.some(metric => metric.id === id)) ||
        metrics.some(metric => !requiredMetrics.includes(metric.id) || !Number.isFinite(metric.baselinePt) ||
          !Number.isFinite(metric.candidatePt) || !Number.isFinite(metric.tolerancePt) ||
          metric.tolerancePt < 0 || metric.tolerancePt > 4)) {
        reasons.push(`item:${item.id}:unmeasured`);
        evaluated = 'unverified';
      } else if (metrics.some(metric => Math.abs(metric.candidatePt - metric.baselinePt) > metric.tolerancePt)) {
        evaluated = 'fail';
      }
    }
    if (evaluated === 'pass') earned += item.weight;
    else if (evaluated === 'fail' && item.critical) criticalFailed = true;
    checks.push({ id: item.id, weight: item.weight, result: evaluated });
  }
  const scored = reasons.length === 0;
  return {
    screen: contract.screen,
    platform: baseline.context.platform,
    screenState: baseline.context.screenState,
    status: !scored ? 'unscored' : earned >= 99 && !criticalFailed ? 'state-candidate-pass' : 'state-fail',
    score: scored ? earned : null,
    criticalFailed: scored ? criticalFailed : null,
    reasons,
    checks,
    limitation: 'A declared review is not independent proof of Hank approval; this is one screen state, not a complete page, whole-app or store acceptance.'
  };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node uiux-acceptance-score.cjs /absolute/manifest.json');
    const manifestPath = process.argv[2];
    if (!path.isAbsolute(manifestPath)) throw new Error('Absolute manifest path required');
    const result = scoreManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'state-candidate-pass') process.exitCode = 1;
  } catch (error) {
    console.error(`Acceptance score rejected: ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = { scoreManifest, checkedFile, contractFor, CONTRACT, CONTRACTS };
