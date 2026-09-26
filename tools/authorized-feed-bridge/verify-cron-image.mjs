// Host/CI contract for the dormant, dependency-free cron image. No partner
// feed, production API, actual credential, or database is contacted.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tag = `wishlist-feed-cron:verify-${process.pid}-${Date.now()}`;
const docker = args => spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 180_000 });

try {
  const built = docker(['build', '--file', 'tools/authorized-feed-bridge/Dockerfile.cron', '--tag', tag, '.']);
  assert.equal(built.error, undefined, 'Docker build could not start');
  assert.equal(built.status, 0, 'Cron image did not build');

  const inventory = docker(['run', '--rm', '--network', 'none', '--entrypoint', 'sh', tag,
    '-c', 'id -u; find /app -type f | sort']);
  assert.equal(inventory.status, 0, 'Cron image inventory check failed');
  assert.deepEqual(inventory.stdout.trim().split('\n'), [
    '1000', '/app/tools/authorized-feed-bridge/poller.mjs', '/app/tools/minimax-vision-bridge/server.mjs',
  ]);

  const disabled = docker(['run', '--rm', '--network', 'none',
    '-e', 'WISHLIST_FEED_SOURCE_ID=f38a84b3-82e8-44a3-9cc0-1f2667655f02',
    '-e', 'WISHLIST_FEED_AUTHORIZATION_REF=contract:synthetic-bridge-test',
    '-e', 'WISHLIST_FEED_HOST=partner.example.com',
    '-e', 'WISHLIST_FEED_URL=https://partner.example.com/listings/feed.json',
    '-e', 'WISHLIST_FEED_API_ORIGIN=https://wishlist-app-production.up.railway.app',
    '-e', 'WISHLIST_FEED_ADMIN_KEY=synthetic-test-only-key',
    '-e', 'WISHLIST_FEED_SYNC_ENABLED=0', tag]);
  assert.equal(disabled.status, 1, 'Disabled cron must exit unsuccessfully');
  assert.equal(disabled.stdout, '', 'Disabled cron must not claim an intake result');
  assert.equal(disabled.stderr.trim(), 'Authorized feed sync unavailable: FEED_SYNC_DISABLED');
  process.stdout.write('Authorized feed cron image: built, unprivileged, minimal, fail-closed without network\n');
} finally {
  docker(['image', 'rm', tag]);
}
