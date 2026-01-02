#!/usr/bin/env node
/**
 * Smoke Test Script
 * Quick automated tests to verify system health before deployment
 * 
 * Usage:
 *   node scripts/smoke-test.js [--prod]
 * 
 * Options:
 *   --prod    Test production URL instead of localhost
 */

const BASE_URL = process.argv.includes('--prod')
    ? 'https://wishlist-app-production.up.railway.app'
    : 'http://localhost:3000';

const API_URL = `${BASE_URL}/api`;

// ANSI colors for output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    bold: '\x1b[1m'
};

const log = {
    pass: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    fail: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    section: (msg) => console.log(`\n${colors.bold}${msg}${colors.reset}\n${'─'.repeat(40)}`)
};

// Test results tracking
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

async function runTest(name, testFn) {
    try {
        await testFn();
        log.pass(name);
        results.passed++;
        results.tests.push({ name, status: 'passed' });
    } catch (error) {
        log.fail(`${name}: ${error.message}`);
        results.failed++;
        results.tests.push({ name, status: 'failed', error: error.message });
    }
}

// ============ TESTS ============

async function testHealthEndpoint() {
    const res = await fetch(`${API_URL}/health`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('Health check failed');
}

async function testFrontendLoads() {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const html = await res.text();
    if (!html.includes('<!DOCTYPE html>')) throw new Error('Not a valid HTML page');
}

async function testLoginPageLoads() {
    const res = await fetch(`${BASE_URL}/login`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);
}

async function testRegisterPageLoads() {
    const res = await fetch(`${BASE_URL}/register`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);
}

async function testAuthEndpointExists() {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: '', password: '' })
    });
    // Should return 400 or 401, not 404
    if (res.status === 404) throw new Error('Auth endpoint not found');
}

async function testProtectedRouteRequiresAuth() {
    const res = await fetch(`${API_URL}/wishlists`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
}

async function testCORSHeaders() {
    const res = await fetch(`${API_URL}/health`, {
        method: 'OPTIONS'
    });
    // Should not return 404 for OPTIONS
    if (res.status === 404) throw new Error('CORS not configured');
}

async function testDatabaseConnection() {
    // The health endpoint should verify DB connection
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    if (data.database === 'disconnected') throw new Error('Database not connected');
}

// ============ MAIN ============

async function main() {
    console.log(`\n${colors.bold}🧪 Wishlist.ai Smoke Test${colors.reset}`);
    console.log(`Target: ${BASE_URL}\n`);

    log.section('1. Health Checks');
    await runTest('API health endpoint responds', testHealthEndpoint);
    await runTest('Frontend loads successfully', testFrontendLoads);
    await runTest('Database connection', testDatabaseConnection);

    log.section('2. Page Loading');
    await runTest('Login page loads', testLoginPageLoads);
    await runTest('Register page loads', testRegisterPageLoads);

    log.section('3. API Endpoints');
    await runTest('Auth endpoint exists', testAuthEndpointExists);
    await runTest('Protected routes require auth', testProtectedRouteRequiresAuth);
    await runTest('CORS headers configured', testCORSHeaders);

    // Summary
    log.section('📊 Results');
    console.log(`Passed: ${colors.green}${results.passed}${colors.reset}`);
    console.log(`Failed: ${colors.red}${results.failed}${colors.reset}`);
    console.log(`Total:  ${results.passed + results.failed}`);

    // Exit with error code if any tests failed
    if (results.failed > 0) {
        console.log(`\n${colors.red}${colors.bold}❌ Some tests failed!${colors.reset}`);
        process.exit(1);
    } else {
        console.log(`\n${colors.green}${colors.bold}✅ All tests passed!${colors.reset}`);
        process.exit(0);
    }
}

main().catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
});
