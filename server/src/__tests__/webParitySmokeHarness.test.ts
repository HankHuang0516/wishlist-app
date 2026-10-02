import { spawnSync } from 'node:child_process';
import path from 'node:path';
const script = path.resolve(__dirname, '../../scripts/run_web_parity_smoke.cjs');
describe('browser smoke harness cannot target a real database', () => {
    it.each([
        {},
        { DATABASE_URL: 'postgresql://synthetic@production.example/wishlist', TEST_DATABASE_URL: 'postgresql://synthetic@production.example/wishlist' },
        { DATABASE_URL: 'postgresql://synthetic@127.0.0.1/wishlist', TEST_DATABASE_URL: 'postgresql://synthetic@127.0.0.1/wishlist' },
        { DATABASE_URL: 'postgresql://synthetic@127.0.0.1/wishlist_marketplace_test_other', TEST_DATABASE_URL: 'postgresql://synthetic@127.0.0.1/wishlist_marketplace_test_web' },
    ])('refuses unsafe or unequal configuration before imports, listeners or fixtures: %j', env => {
        const clean = { ...process.env, DATABASE_URL: '', TEST_DATABASE_URL: '', WEB_PARITY_MARKETING_FIXTURES: '1', ...env };
        const result = spawnSync(process.execPath, [script], { env: clean, encoding: 'utf8', timeout: 5000 });
        expect(result.status).toBe(1); expect(result.stdout).not.toContain('origin'); expect(result.stdout).not.toContain('Initializing');
        expect(result.stderr).not.toContain('PrismaClient');
    });
});
