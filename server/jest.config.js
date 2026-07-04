/** Jest config for server-side unit tests (ts-jest). */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    // Only pick up files under src/__tests__ so the many one-off script files
    // in src/ and scripts/ are never treated as test suites.
    roots: ['<rootDir>/src/__tests__'],
    testMatch: ['**/*.test.ts'],
    clearMocks: true,
};
