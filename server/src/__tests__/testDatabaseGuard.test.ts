const { assertTestDatabase } = require('../../../scripts/assert-test-database.cjs');

describe('migration harness refuses production targets before any database action', () => {
    it.each([undefined, '', 'invalid', 'https://localhost/wishlist_marketplace_test_ci',
        'postgresql://production.example/wishlist_marketplace_test_ci', 'postgresql://localhost/postgres',
        'postgresql://localhost/wishlist', 'postgresql://localhost/wishlist_marketplace_test_',
        'postgresql://localhost/wishlist_marketplace_test_ci/other', 'postgresql://localhost/%77ishlist_marketplace_test_ci',
        'postgresql://localhost/wishlist_marketplace_test_ci?host=production.example',
        'postgresql://localhost/wishlist_marketplace_test_ci?hostaddr=203.0.113.1',
        'postgresql://localhost/wishlist_marketplace_test_ci?dbname=wishlist',
        'postgresql://localhost/wishlist_marketplace_test_ci?schema=public',
        'postgresql://localhost/wishlist_marketplace_test_ci#production'])('rejects unsafe configuration %p', input => {
        expect(() => assertTestDatabase(input)).toThrow();
    });
    it.each(['postgresql://localhost/wishlist_marketplace_test_ci', 'postgres://127.0.0.1:5432/wishlist_marketplace_test_20260915',
        'postgresql://[::1]/wishlist_marketplace_test_ipv6'])('accepts a explicitly named isolated loopback database %p', input => {
        expect(() => assertTestDatabase(input)).not.toThrow();
    });
});
