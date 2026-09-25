const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const link = process.env.QA_RAILWAY_LINK;
if (!link || !process.env.QA_CREDENTIALS_FILE) {
    console.error('QA_RAILWAY_LINK and QA_CREDENTIALS_FILE are required.');
    process.exit(1);
}

function variables(service) {
    const json = execFileSync('railway', ['variables', '--json', '--service', service], {
        cwd: link, encoding: 'utf8', maxBuffer: 1024 * 1024
    });
    return JSON.parse(json);
}

try {
    const app = variables('wishlist-app');
    const database = variables('Postgres');
    if (!database.DATABASE_PUBLIC_URL) throw new Error('public_database_url_missing');
    const child = spawnSync(process.execPath, [path.join(__dirname, 'smoke_listing_pilot.cjs')], {
        env: { ...process.env, ...app, DATABASE_URL: database.DATABASE_PUBLIC_URL },
        stdio: 'inherit', timeout: process.env.QA_TEST_AI === '1' ? 420_000 : 180_000
    });
    if (child.error || child.status !== 0) process.exitCode = child.status || 1;
} catch {
    console.error('Could not start pilot smoke with Railway runtime credentials.');
    process.exitCode = 1;
}
