import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workReceipts } from './work-receipts.mjs';

const lines = dir => readdirSync(dir).filter(name => name.endsWith('.jsonl'))
    .flatMap(name => readFileSync(join(dir, name), 'utf8').trim().split('\n').map(line => JSON.parse(line)));

test('a receipt holds only a one-way key, the metric and a time', async () => {
    const root = mkdtempSync(join(tmpdir(), 'receipts-')), jobId = '12345678-1234-1234-1234-123456789012';
    const receipts = workReceipts('worker', 'metric', { root });
    await receipts.start();
    await receipts.completed(jobId);
    const [entry] = lines(join(root, 'worker'));
    assert.deepEqual(Object.keys(entry), ['v', 'key', 'metric', 'at']);
    assert.match(entry.key, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(entry).includes(jobId));
    assert.equal(statSync(join(root, 'worker')).mode & 0o777, 0o700);
});

test('a failed write never throws, withholds the heartbeat, then recovers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'receipts-')), dir = join(root, 'worker');
    const receipts = workReceipts('worker', 'metric', { root });
    await receipts.start();
    const before = statSync(join(dir, 'alive')).mtimeMs;
    const blocker = join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    mkdirSync(blocker);
    await new Promise(resolve => setTimeout(resolve, 20));
    await receipts.completed('first');
    assert.equal(statSync(join(dir, 'alive')).mtimeMs, before);
    rmdirSync(blocker);
    await receipts.completed('second');
    assert.equal(lines(dir).length, 2);
    assert.ok(statSync(join(dir, 'alive')).mtimeMs > before);
});

test('concurrent completions each land exactly once', async () => {
    const root = mkdtempSync(join(tmpdir(), 'receipts-')), dir = join(root, 'worker');
    const receipts = workReceipts('worker', 'metric', { root });
    await Promise.all(['a', 'b', 'c', 'd'].map(job => receipts.completed(job)));
    assert.equal(lines(dir).length, 4);
    assert.equal(new Set(lines(dir).map(entry => entry.key)).size, 4);
});
