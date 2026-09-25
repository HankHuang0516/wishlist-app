// Reclaim only compiled App/runner products from explicitly selected failed
// isolated QA attempts. Preserve metadata and every result/evidence entry.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { qaLabel } = require('./android-qa-config.cjs');

const mobile = path.resolve(__dirname, '..');
const mode = process.argv[2];
if (!['--discard-failed-products', '--discard-superseded-products'].includes(mode)) throw new Error('Explicit compiled-product operation required');
const labels = process.argv.slice(3).map(qaLabel);
if (!labels.length || new Set(labels).size !== labels.length) throw new Error('Exact non-duplicate QA labels required');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const targets = [], preserved = [];
for (const label of labels) {
  const output = path.join(mobile, 'build', 'ios-native-qa-' + label);
  if (!fs.existsSync(output) || !fs.lstatSync(output).isDirectory() || fs.realpathSync(output) !== output) throw new Error('Exact QA output required');
  for (const pattern of ['build-ios-qa.cjs ' + label, 'ios-native-qa.cjs ' + label, output + '/app-derived', output + '/runner-derived']) {
    const probe = spawnSync('/usr/bin/pgrep', ['-f', pattern], { encoding: 'utf8', timeout: 5000, maxBuffer: 16384 });
    if (probe.error || probe.signal || ![0, 1].includes(probe.status) || probe.status === 0) throw new Error('Selected QA artifact may be in use; no deletion');
  }
  const metadataPath = path.join(output, 'build.json'), metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (metadata.kind !== 'isolated-debug-ios-native-qa' || metadata.label !== label || metadata.storeDeliverable !== false) throw new Error('Only isolated QA products allowed');
  const evidence = fs.readdirSync(output).filter(name => /^qa-[0-9a-f-]{36}$/.test(name));
  if (!evidence.length) throw new Error('At least one terminal QA report required');
  const reports = evidence.map(name => {
    const reportPath = path.join(output, name, 'result.json');
    if (!fs.existsSync(reportPath)) throw new Error('Every QA evidence directory needs a terminal report');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (typeof report.passed !== 'boolean' || report.appBundle !== metadata.appBundle ||
      report.hashes?.app !== metadata.hashes?.app || report.hashes?.test !== metadata.hashes?.test)
      throw new Error('Only terminal matching QA reports allowed');
    if (mode === '--discard-failed-products' && report.passed !== false) throw new Error('Only failed QA reports allowed in failed mode');
    return { name, reportPath };
  });
  if (mode === '--discard-superseded-products') {
    const changed = metadata.sourceFiles.some(source => !fs.existsSync(path.join(mobile, source)) || hash(path.join(mobile, source)) !== metadata.sourceHashes?.[source]);
    if (!changed) throw new Error('Current QA products are not superseded');
  }
  const appBinary = path.join(metadata.app, 'Wishlistai');
  const testBinary = path.join(metadata.runner, 'PlugIns/WishlistNativeQa.xctest/WishlistNativeQa');
  if (hash(appBinary) !== metadata.hashes.app || hash(testBinary) !== metadata.hashes.test) throw new Error('Compiled QA product changed');
  for (const { name: evidenceDirectory, reportPath } of reports) {
    const evidenceEntries = [];
    const visit = directory => {
      for (const name of fs.readdirSync(directory).sort()) {
        const item = path.join(directory, name), relative = path.relative(output, item), stat = fs.lstatSync(item);
        if (stat.isDirectory()) visit(item);
        else if (stat.isFile()) evidenceEntries.push([relative, stat.size, hash(item)]);
        else if (stat.isSymbolicLink()) evidenceEntries.push([relative, 'link', fs.readlinkSync(item)]);
        else throw new Error('Unexpected evidence entry');
      }
    };
    visit(path.join(output, evidenceDirectory));
    preserved.push({ output, evidenceDirectory, metadataHash: hash(metadataPath), reportHash: hash(reportPath), evidenceEntries });
  }
  for (const target of [path.join(output, 'app-derived/Build/Products'), path.join(output, 'runner-derived/Build/Products')]) {
    if (!fs.existsSync(target) || !fs.lstatSync(target).isDirectory() || fs.realpathSync(target) !== target) throw new Error('Exact compiled products required');
    targets.push(target);
  }
}
const free = () => { const disk = fs.statfsSync(mobile); return disk.bavail * disk.bsize / 1024 ** 3; };
const before = free();
for (const target of targets) fs.rmSync(target, { recursive: true, force: false });
for (const item of preserved) {
  if (hash(path.join(item.output, 'build.json')) !== item.metadataHash || hash(path.join(item.output, item.evidenceDirectory, 'result.json')) !== item.reportHash) throw new Error('Metadata preservation failed');
  const current = [];
  const visit = directory => {
    for (const name of fs.readdirSync(directory).sort()) {
      const entry = path.join(directory, name), relative = path.relative(item.output, entry), stat = fs.lstatSync(entry);
      if (stat.isDirectory()) visit(entry);
      else if (stat.isFile()) current.push([relative, stat.size, hash(entry)]);
      else if (stat.isSymbolicLink()) current.push([relative, 'link', fs.readlinkSync(entry)]);
      else throw new Error('Unexpected evidence entry');
    }
  };
  visit(path.join(item.output, item.evidenceDirectory));
  if (JSON.stringify(current) !== JSON.stringify(item.evidenceEntries)) throw new Error('Evidence preservation failed');
}
console.log(JSON.stringify({ kind: mode === '--discard-failed-products' ? 'failed-ios-qa-compiled-product-operation' : 'superseded-ios-qa-compiled-product-operation', discarded: true, labels, productDirectories: targets,
  metadataAndEvidencePreserved: true, freeGiBBefore: before, freeGiBAfter: free(), sourceOperations: 0, resultOperations: 0,
  recoverability: 'rebuild-from-fingerprinted-source-not-undelete' }));
