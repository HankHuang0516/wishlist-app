'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { checkDirectory } = require('./source-sync-receipt-check.cjs');
test('deployment probe is private, same-volume and preserved across new checks', () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-probe-synthetic-')));
  const dir = path.join(parent, '.receipts');
  try {
    const first = checkDirectory(dir, true), second = checkDirectory(dir, true), third = checkDirectory(dir);
    assert.equal(first.directoryMode, '0700'); assert.equal(first.fileMode, '0600'); assert.equal(first.sameVolume, true);
    assert.equal(first.approvedJobCount, Object.keys(require('./source-sync-approved-jobs.cjs')).length); assert.equal(first.probeSHA256, second.probeSHA256); assert.equal(first.probeSHA256, third.probeSHA256);
    assert.equal(fs.readdirSync(dir).length, 1);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
test('deployment probe refuses unsafe existing directory and symlink without repairing them', () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-probe-synthetic-')));
  const dir = path.join(parent, '.receipts'), link = path.join(parent, '.link');
  try {
    fs.mkdirSync(dir, { mode: 0o755 }); assert.throws(() => checkDirectory(dir, true)); assert.equal(fs.statSync(dir).mode & 0o777, 0o755);
    fs.chmodSync(dir, 0o700); fs.symlinkSync(dir, link); assert.throws(() => checkDirectory(link, true)); assert.equal(fs.readdirSync(dir).length, 0);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
