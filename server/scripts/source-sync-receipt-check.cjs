'use strict';
// Manual, narrowly scoped deployment verification. No credentials, HTTP or DB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DIRECTORY = '/app/server/public/uploads/.source-sync-receipts';
const PROBE = 'deployment-verification.json';

function checkDirectory(directory, initialize = false) {
  const parent = path.dirname(directory);
  const parentStat = fs.lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || fs.realpathSync(parent) !== parent) {
    throw Error('UNSAFE_RECEIPT_PARENT');
  }
  if (initialize && !fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()) {
    throw Error('PRIVATE_RECEIPT_DIRECTORY_REQUIRED');
  }
  const file = path.join(directory, PROBE);
  if (initialize && !fs.existsSync(file)) {
    const fd = fs.openSync(file, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify({ purpose: 'SOURCE_SYNC_DEPLOYMENT_VERIFICATION_ONLY', createdAt: new Date().toISOString(), approvedJobs: 0 }));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    const dirfd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
  }
  const fileStat = fs.lstatSync(file);
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || (fileStat.mode & 0o777) !== 0o600 || fileStat.uid !== process.getuid()) {
    throw Error('PRIVATE_PROBE_REQUIRED');
  }
  const bytes = fs.readFileSync(file);
  const receipt = JSON.parse(bytes);
  if (receipt.purpose !== 'SOURCE_SYNC_DEPLOYMENT_VERIFICATION_ONLY' || receipt.approvedJobs !== 0) throw Error('UNEXPECTED_PROBE');
  return { state: 'PRIVATE_RECEIPT_VERIFIED', uid: stat.uid, processUid: process.getuid(), directoryMode: '0700', fileMode: '0600',
    directoryDevice: stat.dev, parentDevice: parentStat.dev, sameVolume: stat.dev === parentStat.dev,
    probeSHA256: crypto.createHash('sha256').update(bytes).digest('hex'), probeCreatedAt: receipt.createdAt,
    approvedJobCount: Object.keys(require('./source-sync-approved-jobs.cjs')).length, checkedAt: new Date().toISOString() };
}

module.exports = { checkDirectory };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !['--initialize', '--check'].includes(args[0])) throw Error('INVALID_OPERATION');
    console.log(JSON.stringify(checkDirectory(DIRECTORY, args[0] === '--initialize')));
  } catch { console.log(JSON.stringify({ state: 'STOPPED', errorCode: 'PRIVATE_RECEIPT_CHECK_FAILED' })); process.exitCode = 1; }
}
