// Anonymous local proof of finished work, read by the MiniMax worker monitor.
// A receipt holds only a one-way job key, the metric and a time: never a job ID, URL, prompt, image or result.
// Nothing here may disturb the job: a failed write stays queued, and the missing heartbeat tells the monitor
// to stop claiming those hours were fully observed.
import { createHash } from 'node:crypto';
import { appendFile, chmod, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HEARTBEAT_MS = 30_000;

export function workReceipts(workerId, metric, { root = join(homedir(), '.local/share/minimax-worker-receipts') } = {}) {
  const dir = join(root, workerId);
  const pending = [];
  let queue = Promise.resolve();
  async function flushAndBeat() {
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await chmod(dir, 0o700);
      while (pending.length) {
        const file = join(dir, `${new Date(pending[0].at).toISOString().slice(0, 10)}.jsonl`);
        await appendFile(file, JSON.stringify(pending[0]) + '\n', { mode: 0o600 });
        pending.shift();
      }
      await writeFile(join(dir, 'alive'), '', { mode: 0o600 });
    } catch { /* retried on the next heartbeat; the stale heartbeat is the signal */ }
  }
  const run = () => (queue = queue.then(flushAndBeat));
  return {
    start() { const timer = setInterval(run, HEARTBEAT_MS); timer.unref(); return run(); },
    completed(jobId) {
      pending.push({ v: 1, key: createHash('sha256').update(`${workerId}:${jobId}`).digest('hex'), metric, at: Date.now() });
      return run();
    },
  };
}
