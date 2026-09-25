const { qaEnvironment } = require('../../../mobile/scripts/native-qa.cjs');

describe('native QA child environment, before process or DB creation', () => {
    const database = 'postgresql://localhost/wishlist_marketplace_test_qa_guard';
    it('passes only a local DB, fresh synthetic JWT key and bounded runtime settings', () => {
        const env = qaEnvironment(database, 60, {
            PATH: '/safe/runtime', JWT_SECRET: 'must-not-reuse', ADMIN_API_KEY: 'must-not-copy',
            RESEND_API_KEY: 'must-not-send-mail', FLICKR_API_KEY: 'must-not-upload',
            NODE_OPTIONS: '--require untrusted', PGHOST: 'production.example',
            WISHLIST_KEYSTORE_PASSWORD: 'must-not-copy', API_URL: 'https://production.example',
        });
        expect(env).toEqual({ PATH: '/safe/runtime', NODE_ENV: 'test', TZ: 'Asia/Taipei',
            TEST_DATABASE_URL: database, DATABASE_URL: database,
            JWT_SECRET: expect.stringMatching(/^[0-9a-f]{64}$/), NATIVE_QA_LIFETIME_SECONDS: '60' });
        expect(env.JWT_SECRET).not.toBe('must-not-reuse');
        expect(qaEnvironment(database, 60).JWT_SECRET).not.toBe(env.JWT_SECRET);
    });
    it.each([undefined, '', 'postgresql://production.example/wishlist_marketplace_test_qa',
        'postgresql://localhost/wishlist', 'postgresql://localhost/wishlist_marketplace_test_qa?host=production.example'])('rejects unsafe DB before forking %p', databaseUrl => {
        expect(() => qaEnvironment(databaseUrl)).toThrow();
    });
    it.each([0, -1, 601, 1.5, NaN, Infinity, '60', null])('rejects unbounded or coercible lifetime %p', duration => {
        expect(() => qaEnvironment(database, duration)).toThrow();
    });
    it.each([1, 300, 600])('accepts explicit bounded lifetime %p', duration => {
        expect(qaEnvironment(database, duration).NATIVE_QA_LIFETIME_SECONDS).toBe(String(duration));
    });
    it('enables commit-before-ACK interruption only by explicit isolated QA option', () => {
        expect(qaEnvironment(database, 60).NATIVE_QA_HOLD_LISTING_UPLOAD_ACK).toBeUndefined();
        expect(qaEnvironment(database, 60, { PATH: '/safe/runtime', ADMIN_API_KEY: 'never-forward' },
            { holdListingUploadAck: true })).toMatchObject({ NATIVE_QA_HOLD_LISTING_UPLOAD_ACK: '1',
                PATH: '/safe/runtime' });
    });
});
