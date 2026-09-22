// Discard only rebuildable Xcode caches from exact historical simulator
// DerivedData roots. Preserve and re-verify every product entry.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const mobile = path.resolve(__dirname, '..');
if (process.argv[2] !== '--discard-rebuildable-intermediates' || process.argv.length < 4) throw new Error('Explicit simulator cache operation required');
const approved = new Set(['ios-simulator', 'ios-simulator-20260915-1918', 'ios-simulator-20260915-2011', 'ios-simulator-signed', 'ios-archive-derived']);
const names = process.argv.slice(3);
if (new Set(names).size !== names.length || names.some(name => !approved.has(name))) throw new Error('Only exact approved simulator roots are allowed');
const probe = spawnSync('/usr/bin/pgrep', ['-f', 'xcodebuild'], { encoding: 'utf8', timeout: 5000, maxBuffer: 16384 });
if (probe.error || probe.signal || ![0, 1].includes(probe.status) || probe.status === 0) throw new Error('Xcode build may be active; no deletion');

const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function productSnapshot(root) {
  const products = path.join(root, 'Build', 'Products');
  if (!fs.existsSync(products) || !fs.lstatSync(products).isDirectory() || fs.realpathSync(products) !== products) throw new Error('Exact products directory required');
  const values = [];
  const visit = directory => {
    for (const name of fs.readdirSync(directory).sort()) {
      const item = path.join(directory, name), relative = path.relative(products, item), stat = fs.lstatSync(item);
      if (stat.isSymbolicLink()) values.push([relative, 'link', fs.readlinkSync(item)]);
      else if (stat.isDirectory()) { values.push([relative, 'directory']); visit(item); }
      else if (stat.isFile()) values.push([relative, 'file', stat.size, digest(item)]);
      else throw new Error('Unexpected product entry');
    }
  };
  visit(products);
  if (!values.length) throw new Error('Simulator products must be nonempty');
  return { products, values };
}

const cacheNames = ['Build/Intermediates.noindex', 'ModuleCache.noindex', 'CompilationCache.noindex', 'SDKStatCaches.noindex',
  'Index.noindex', 'SourcePackages', 'SDKExplicitPrecompiledModules'];
const targets = [], snapshots = [];
for (const name of names) {
  const root = path.join(mobile, 'build', name);
  if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory() || fs.realpathSync(root) !== root) throw new Error('Exact simulator root unavailable');
  snapshots.push({ root, snapshot: productSnapshot(root) });
  for (const cacheName of cacheNames) {
    const target = path.join(root, cacheName);
    if (fs.existsSync(target)) {
      if (!fs.lstatSync(target).isDirectory() || fs.realpathSync(target) !== target) throw new Error('Only exact real rebuildable cache directories allowed');
      targets.push(target);
    }
  }
}
if (!targets.length) throw new Error('Selected simulator roots have no approved rebuildable caches');
const free = () => { const disk = fs.statfsSync(mobile); return disk.bavail * disk.bsize / 1024 ** 3; };
const before = free();
for (const target of targets) fs.rmSync(target, { recursive: true, force: false });
for (const { root, snapshot } of snapshots) {
  const after = productSnapshot(root);
  if (JSON.stringify(after.values) !== JSON.stringify(snapshot.values)) throw new Error('Product preservation verification failed');
}
console.log(JSON.stringify({ kind: 'ios-simulator-rebuildable-cache-operation', cacheDirectories: targets, productTreesPreserved: true,
  freeGiBBefore: before, freeGiBAfter: free(), sourceOperations: 0, resultOperations: 0, userDataOperations: 0,
  recoverability: 'rebuild-from-source-not-undelete' }));
