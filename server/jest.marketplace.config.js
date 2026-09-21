module.exports = {
    ...require('./jest.config'),
    testMatch: ['**/integration/*.integration.ts'],
    testTimeout: 15000,
};
